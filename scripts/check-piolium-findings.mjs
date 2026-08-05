#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

/**
 * Finding-status validator for the piolium audit store.
 *
 * Prevents the stale-baseline failure mode where a finding whose fix commit is
 * already an ancestor of the audited HEAD is still rendered as open/current.
 *
 * Front matter contract (every finding draft.md under the findings root must carry it):
 *   status: open | mitigated | fixed | accepted
 *   introduced_at: "<sha>"
 *   verified_at: "<sha>"
 *   fixed_in: "<sha or empty>"
 *   fix_verified_at: "<sha or empty>"
 *   poc_kind: theoretical | executed
 *   (poc_kind: executed additionally requires poc_file and evidence_log
 *    fields whose paths exist relative to the finding directory)
 *
 * Rules enforced here:
 *   - required fields present, status/poc_kind enum values, duplicate IDs fail
 *   - status "fixed" requires non-empty fixed_in and fix_verified_at
 *   - fixed_in that is an ancestor of the audited HEAD cannot render as open
 *   - verified_at that is not an ancestor of the audited HEAD must be labeled
 *     historical/unverified, not current (fails closed here)
 *   - ancestry is proven with `git merge-base --is-ancestor`, never by
 *     parsing human-formatted git log or trusting fix-commit message strings
 *
 * CLI:
 *   node scripts/check-piolium-findings.mjs --head HEAD --root piolium/findings
 *   node scripts/check-piolium-findings.mjs --head HEAD --root piolium/findings --registry <path>
 * Exit 0 only when every finding is internally consistent.
 *
 * Registry (docs/evidence/security-hardening-20260805/findings-registry.yml):
 *   Tracked status record for findings whose piolium drafts are git-ignored
 *   (M1, M2). The registry is the authoritative status record for those IDs;
 *   when the M1/M2 draft directories are absent (fresh CI checkout) the
 *   validator does not fail on their absence - their registry entries are
 *   validated instead. When the drafts are present (developer worktree) the
 *   registry and draft may disagree without hard-failing (the registry is the
 *   tracked gate; the drafts are ignored scratch). IDs must not duplicate
 *   tracked draft IDs or each other.
 */

const FINDING_STATUSES = new Set(['open', 'mitigated', 'fixed', 'accepted']);
const POC_KINDS = new Set(['theoretical', 'executed']);
const REQUIRED_FIELDS = [
  'id',
  'status',
  'introduced_at',
  'verified_at',
  'fixed_in',
  'fix_verified_at',
  'poc_kind',
];

/** Fields that must hold a non-empty commit SHA. */
const REQUIRED_SHA_FIELDS = ['introduced_at', 'verified_at'];
/** Fields that may be empty but, when present, must hold a valid commit SHA. */
const OPTIONAL_SHA_FIELDS = ['fixed_in', 'fix_verified_at'];

export function parseCheckArgs(argv) {
  const args = {
    head: 'HEAD',
    root: 'piolium/findings',
    registry: 'docs/evidence/security-hardening-20260805/findings-registry.yml',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--head' && value !== undefined) {
      args.head = value;
      index += 1;
    } else if (flag === '--root' && value !== undefined) {
      args.root = value;
      index += 1;
    } else if (flag === '--registry' && value !== undefined) {
      args.registry = value;
      index += 1;
    }
  }
  return args;
}

export function parseFrontMatter(text) {
  const lines = text.split(/\r?\n/);
  const fields = {};
  let inFrontMatter = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '---') {
      if (!inFrontMatter) {
        inFrontMatter = true;
        continue;
      }
      break;
    }
    if (!inFrontMatter || trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf(':');
    if (separator < 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return fields;
}

export function collectDraftPaths(root) {
  const draftPaths = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile() && entry.name === 'draft.md') {
        draftPaths.push(absolute);
      }
    }
  };
  visit(root);
  return draftPaths.sort();
}

/**
 * Parse the findings registry YAML subset used by this repository.
 *
 * Supports exactly the shape emitted by
 * docs/evidence/security-hardening-20260805/findings-registry.yml:
 *
 *   findings:
 *     - id: M1
 *       status: accepted
 *       verified_at: "<sha>"
 *       fixed_in: "<sha or empty>"
 *       resolution: "..."
 *
 * This is intentionally not a general YAML parser: the registry is a
 * repository-owned file with a fixed schema, and a hand-rolled line parser
 * keeps the validator dependency-free. Returns { entries, errors } where
 * errors are structural problems (missing findings key, unparseable entries).
 */
export function parseRegistry(text) {
  const entries = [];
  const errors = [];
  let inFindings = false;
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    if (trimmed === 'findings:') {
      inFindings = true;
      continue;
    }
    if (trimmed.endsWith(':') && !trimmed.includes(' ')) {
      inFindings = false;
      continue;
    }
    if (!inFindings) {
      continue;
    }
    const entryMatch = rawLine.match(/^\s{2}-\s+(.+)$/);
    if (entryMatch) {
      if (current) {
        entries.push(current);
      }
      current = {};
      const separator = entryMatch[1].indexOf(':');
      if (separator < 0) {
        continue;
      }
      const key = entryMatch[1].slice(0, separator).trim();
      const value = entryMatch[1].slice(separator + 1).trim();
      if (key === 'id') {
        current.id = stripQuotes(value);
      }
      continue;
    }
    const fieldMatch = rawLine.match(/^\s{4}([A-Za-z_]+):\s*(.*)$/);
    if (fieldMatch && current) {
      current[fieldMatch[1]] = stripQuotes(fieldMatch[2].trim());
    }
  }
  if (current) {
    entries.push(current);
  }
  if (entries.length === 0) {
    errors.push('registry contains no findings entries');
  }
  for (const entry of entries) {
    for (const required of ['id', 'status', 'verified_at', 'fixed_in']) {
      if (entry[required] === undefined) {
        errors.push(
          `registry entry ${entry.id ?? '<unknown>'} missing required field '${required}'`,
        );
      }
    }
  }
  return { entries, errors };
}

function stripQuotes(value) {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1);
  }
  return value;
}

const REGISTRY_STATUSES = new Set(['open', 'mitigated', 'fixed', 'accepted']);

/**
 * Validate one registry entry against the same ancestry gate as drafts.
 */
export function validateRegistryEntry(entry, headSha, repoRoot) {
  const errors = [];
  if (entry.id !== undefined && /[^A-Za-z0-9._-]/.test(entry.id)) {
    errors.push(`registry id '${entry.id}' contains characters outside [A-Za-z0-9._-]`);
  }
  if (entry.status !== undefined && !REGISTRY_STATUSES.has(entry.status)) {
    errors.push(`registry entry '${entry.id ?? '<unknown>'}': unknown status '${entry.status}'`);
  }
  if (entry.verified_at === undefined || entry.verified_at === '') {
    errors.push(
      `registry entry '${entry.id ?? '<unknown>'}': verified_at must be a non-empty commit SHA`,
    );
  } else {
    try {
      resolveCommit(entry.verified_at, repoRoot);
      if (!isAncestor(entry.verified_at, headSha, repoRoot)) {
        errors.push(
          `registry entry '${entry.id ?? '<unknown>'}': verified_at '${entry.verified_at}' ` +
            'is not an ancestor of audited head; must be labeled historical/unverified, not current',
        );
      }
    } catch {
      errors.push(
        `registry entry '${entry.id ?? '<unknown>'}': verified_at references unknown commit '${entry.verified_at}'`,
      );
    }
  }
  if (entry.fixed_in !== undefined && entry.fixed_in !== '') {
    try {
      resolveCommit(entry.fixed_in, repoRoot);
    } catch {
      errors.push(
        `registry entry '${entry.id ?? '<unknown>'}': fixed_in references unknown commit '${entry.fixed_in}'`,
      );
    }
  }
  if (entry.status === 'accepted' || entry.status === 'fixed') {
    if (!entry.fixed_in) {
      errors.push(
        `registry entry '${entry.id ?? '<unknown>'}': status '${entry.status}' requires non-empty fixed_in`,
      );
    }
  }
  if (entry.status === 'open' && entry.fixed_in) {
    errors.push(`registry entry '${entry.id ?? '<unknown>'}': status 'open' requires empty fixed_in`);
  }
  return errors;
}

export function resolveCommit(ref, repoRoot) {
  const output = execFileSync(
    'git',
    ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  return output.trim();
}

export function isAncestor(ancestor, head, repoRoot) {
  try {
    execFileSync(
      'git',
      ['merge-base', '--is-ancestor', ancestor, head],
      { cwd: repoRoot, stdio: 'ignore' },
    );
    return true;
  } catch (error) {
    if (error && typeof error.status === 'number' && error.status === 1) {
      return false;
    }
    throw error;
  }
}

function validateShaField(fields, key, errors) {
  const value = fields[key];
  if (value === undefined || value === '') {
    return;
  }
  try {
    resolveCommit(value, fields.__repoRoot);
  } catch {
    errors.push(`'${key}' references unknown commit '${value}'`);
  }
}

export function validateFinding(fields, headSha) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (fields[field] === undefined) {
      errors.push(`missing required field '${field}'`);
    }
  }
  for (const field of REQUIRED_SHA_FIELDS) {
    if (fields[field] === undefined) {
      continue;
    }
    if (fields[field] === '') {
      errors.push(`'${field}' must be a non-empty commit SHA`);
      continue;
    }
    validateShaField(fields, field, errors);
  }
  for (const field of OPTIONAL_SHA_FIELDS) {
    validateShaField(fields, field, errors);
  }
  if (fields.id !== undefined && /[^A-Za-z0-9._-]/.test(fields.id)) {
    errors.push(`id '${fields.id}' contains characters outside [A-Za-z0-9._-]`);
  }
  if (fields.status !== undefined && !FINDING_STATUSES.has(fields.status)) {
    errors.push(`unknown status '${fields.status}'`);
  }
  if (fields.poc_kind !== undefined && !POC_KINDS.has(fields.poc_kind)) {
    errors.push(`unknown poc_kind '${fields.poc_kind}'`);
  }
  if (fields.status === 'fixed') {
    if (!fields.fixed_in || !fields.fix_verified_at) {
      errors.push("status 'fixed' requires non-empty fixed_in and fix_verified_at");
    }
  }
  if (fields.fixed_in) {
    try {
      if (fields.status === 'open' && isAncestor(fields.fixed_in, headSha, fields.__repoRoot)) {
        errors.push(
          `fixed_in '${fields.fixed_in}' is an ancestor of audited head; finding cannot render as open`,
        );
      }
    } catch {
      errors.push(`'fixed_in' references unknown commit '${fields.fixed_in}'`);
    }
  }
  if (fields.verified_at) {
    try {
      if (!isAncestor(fields.verified_at, headSha, fields.__repoRoot)) {
        errors.push(
          `verified_at '${fields.verified_at}' is not an ancestor of audited head; ` +
            'finding must be labeled historical/unverified, not current',
        );
      }
    } catch {
      errors.push(`'verified_at' references unknown commit '${fields.verified_at}'`);
    }
  }
  if (fields.poc_kind === 'executed') {
    if (!fields.poc_file) {
      errors.push("poc_kind 'executed' requires a 'poc_file' field");
    } else if (!fs.existsSync(path.join(fields.__findingDir, fields.poc_file))) {
      errors.push(`poc_file '${fields.poc_file}' does not exist`);
    }
    if (!fields.evidence_log) {
      errors.push("poc_kind 'executed' requires an 'evidence_log' field");
    } else if (!fs.existsSync(path.join(fields.__findingDir, fields.evidence_log))) {
      errors.push(`evidence_log '${fields.evidence_log}' does not exist`);
    }
  }
  return errors;
}

export function checkFindings({ head, root, repoRoot = process.cwd(), registry = null }) {
  let headSha;
  try {
    headSha = resolveCommit(head, repoRoot);
  } catch {
    return {
      headSha: null,
      findings: [],
      errors: [`--head '${head}' does not resolve to a commit`],
    };
  }
  const draftPaths = collectDraftPaths(root);
  const findings = [];
  const errors = [];
  const ids = new Set();

  for (const draftPath of draftPaths) {
    const text = fs.readFileSync(draftPath, 'utf8');
    const fields = parseFrontMatter(text);
    fields.__repoRoot = repoRoot;
    fields.__findingDir = path.dirname(draftPath);
    fields.__draftPath = draftPath;

    if (fields.id !== undefined) {
      if (ids.has(fields.id)) {
        errors.push(`duplicate finding id '${fields.id}' in ${draftPath}`);
      }
      ids.add(fields.id);
    }

    const findingErrors = validateFinding(fields, headSha);
    findings.push({
      id: fields.id ?? path.basename(path.dirname(draftPath)),
      draftPath,
      errors: findingErrors,
    });
    for (const message of findingErrors) {
      errors.push(`${fields.id ?? path.basename(path.dirname(draftPath))}: ${message}`);
    }
  }

  if (registry !== null) {
    const registryPath = path.resolve(repoRoot, registry);
    if (!fs.existsSync(registryPath)) {
      errors.push(`registry file '${registryPath}' not found`);
    } else {
      const text = fs.readFileSync(registryPath, 'utf8');
      const { entries, errors: parseErrors } = parseRegistry(text);
      errors.push(...parseErrors.map((message) => `registry: ${message}`));
      for (const entry of entries) {
        if (entry.id !== undefined) {
          if (ids.has(entry.id)) {
            errors.push(`duplicate finding id '${entry.id}' (registry conflicts with draft or another registry entry)`);
          }
          ids.add(entry.id);
        }
        const entryErrors = validateRegistryEntry(entry, headSha, repoRoot);
        for (const message of entryErrors) {
          errors.push(message);
        }
      }
    }
  }

  if (draftPaths.length === 0) {
    errors.push(`no draft.md files found under '${root}'`);
  }

  return { headSha, findings, errors };
}

export function main(argv) {
  const { head, root, registry } = parseCheckArgs(argv);
  const result = checkFindings({ head, root, registry });
  process.stdout.write(`check-piolium-findings: head ${result.headSha ?? '<unresolved>'}\n`);
  if (result.errors.length > 0) {
    for (const message of result.errors) {
      process.stdout.write(`  - ${message}\n`);
    }
    process.stdout.write(`${result.errors.length} finding error(s): validation failed\n`);
    process.exitCode = 1;
    return;
  }
  for (const finding of result.findings) {
    const status = finding.errors.length === 0 ? 'OK' : 'FAIL';
    process.stdout.write(`${status} ${finding.id}\n`);
    for (const message of finding.errors) {
      process.stdout.write(`  - ${message}\n`);
    }
  }
  process.stdout.write('all findings consistent\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
