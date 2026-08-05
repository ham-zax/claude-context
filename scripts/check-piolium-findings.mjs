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
 * Exit 0 only when every finding is internally consistent.
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

export function parseCheckArgs(argv) {
  const args = { head: 'HEAD', root: 'piolium/findings' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--head' && value !== undefined) {
      args.head = value;
      index += 1;
    } else if (flag === '--root' && value !== undefined) {
      args.root = value;
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
    errors.push(`missing required field '${key}'`);
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

export function checkFindings({ head, root, repoRoot = process.cwd() }) {
  const headSha = resolveCommit(head, repoRoot);
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

  if (draftPaths.length === 0) {
    errors.push(`no draft.md files found under '${root}'`);
  }

  return { headSha, findings, errors };
}

export function main(argv) {
  const { head, root } = parseCheckArgs(argv);
  const result = checkFindings({ head, root });
  process.stdout.write(`check-piolium-findings: head ${result.headSha}\n`);
  for (const finding of result.findings) {
    const status = finding.errors.length === 0 ? 'OK' : 'FAIL';
    process.stdout.write(`${status} ${finding.id}\n`);
    for (const message of finding.errors) {
      process.stdout.write(`  - ${message}\n`);
    }
  }
  if (result.errors.length > 0) {
    process.stdout.write(`${result.errors.length} finding error(s): validation failed\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write('all findings consistent\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
