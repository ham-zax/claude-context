#!/usr/bin/env node
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const REQUIRED_EVIDENCE = Object.freeze([
  ['SOURCE_ANCHORS.json', 'ranking_v3_source_anchors_v1'],
  ['RUNTIME_CONSTRUCTION_SITES.json', 'ranking_v3_runtime_construction_sites_v1'],
  ['CONTINUATION_SITES.json', 'ranking_v3_continuation_sites_v1'],
  ['LOCKFILE_AUTHORITY.json', 'ranking_v3_lockfile_authority_v1'],
]);

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Bytes(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256Canonical(value) {
  return sha256Bytes(Buffer.from(canonicalJson(value), 'utf8'));
}

function runGit(repo, args, options = {}) {
  const result = spawnSync('git', ['-C', repo, ...args], {
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').toString().trim()}`);
  }
  return result.stdout;
}

function requireCommit(value, label) {
  if (typeof value !== 'string' || !COMMIT.test(value)) throw new Error(`${label} must be a 40-character lowercase Git commit.`);
  return value;
}

function requireSha256(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  return value;
}

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

export function snapshotTree(repo = process.cwd(), headInput = 'HEAD') {
  const canonicalRepo = fs.realpathSync(repo);
  const head = runGit(canonicalRepo, ['rev-parse', `${headInput}^{commit}`]).trim();
  requireCommit(head, 'snapshot head');
  const gitTree = runGit(canonicalRepo, ['rev-parse', `${head}^{tree}`]).trim();
  const raw = runGit(canonicalRepo, ['ls-tree', '-r', '-z', '--full-tree', head], { encoding: 'buffer' });
  const records = raw.toString('utf8').split('\0').filter(Boolean);
  const entries = records.map((record) => {
    const match = /^(\d+) (blob|commit) ([a-f0-9]+)\t([\s\S]+)$/.exec(record);
    if (!match) throw new Error(`Unsupported git tree entry: ${record}`);
    const [, mode, type, objectSha, relativePath] = match;
    const bytes = type === 'blob'
      ? runGit(canonicalRepo, ['cat-file', 'blob', objectSha], { encoding: 'buffer' })
      : Buffer.from(objectSha, 'utf8');
    return {
      path: relativePath,
      mode,
      type,
      objectSha,
      size: bytes.length,
      sha256: sha256Bytes(bytes),
    };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const unsigned = {
    schemaVersion: 'ranking_v3_tree_snapshot_v1',
    head,
    gitTree,
    entries,
  };
  return { ...unsigned, treeSha256: sha256Canonical(unsigned) };
}

function parseBaselineMarkdown(file) {
  const text = fs.readFileSync(file, 'utf8');
  const head = /^baselineCommit:\s*([a-f0-9]{40})\s*$/m.exec(text)?.[1];
  const tree = /^baselineTreeSha256:\s*([a-f0-9]{64})\s*$/m.exec(text)?.[1];
  if (!head || !tree) throw new Error('BASELINE.md must contain baselineCommit and baselineTreeSha256 metadata.');
  return { baselineCommit: head, baselineTreeSha256: tree };
}

function readJson(file, label) {
  return requireRecord(JSON.parse(fs.readFileSync(file, 'utf8')), label);
}

export function verifyEvidenceDirectory({ repo = process.cwd(), evidenceDir, expectedHead }) {
  const canonicalRepo = fs.realpathSync(repo);
  const expected = requireCommit(expectedHead, 'expected head');
  const actualHead = runGit(canonicalRepo, ['rev-parse', 'HEAD']).trim();
  if (actualHead !== expected) throw new Error(`Expected head ${expected}, but integration checkout is ${actualHead}.`);
  const actualSnapshot = snapshotTree(canonicalRepo, expected);
  const baseline = parseBaselineMarkdown(path.join(evidenceDir, 'BASELINE.md'));
  const authorities = [baseline];
  const files = {};
  for (const [name, schemaVersion] of REQUIRED_EVIDENCE) {
    const file = path.join(evidenceDir, name);
    if (!fs.existsSync(file)) throw new Error(`Required Gate-0 evidence is missing: ${name}.`);
    const record = readJson(file, name);
    if (record.schemaVersion !== schemaVersion) throw new Error(`${name} has an incompatible schemaVersion.`);
    requireCommit(record.baselineCommit, `${name}.baselineCommit`);
    requireSha256(record.baselineTreeSha256, `${name}.baselineTreeSha256`);
    authorities.push(record);
    files[name] = sha256Bytes(fs.readFileSync(file));
  }
  for (const authority of authorities) {
    if (authority.baselineCommit !== expected) throw new Error('Gate-0 evidence does not bind the expected head.');
    if (authority.baselineTreeSha256 !== actualSnapshot.treeSha256) throw new Error('Gate-0 evidence tree digest does not match the frozen base tree.');
  }
  const lockfile = readJson(path.join(evidenceDir, 'LOCKFILE_AUTHORITY.json'), 'LOCKFILE_AUTHORITY.json');
  requireSha256(lockfile.sha256, 'LOCKFILE_AUTHORITY.json.sha256');
  const lockfilePath = path.resolve(canonicalRepo, lockfile.path);
  const relative = path.relative(canonicalRepo, lockfilePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Lockfile authority path escapes the repository.');
  if (!fs.existsSync(lockfilePath)) throw new Error(`Authorized lockfile does not exist: ${lockfile.path}.`);
  if (sha256Bytes(fs.readFileSync(lockfilePath)) !== lockfile.sha256) throw new Error('Authorized lockfile digest does not match repository bytes.');
  return {
    schemaVersion: 'ranking_v3_frozen_base_receipt_v1',
    baselineCommit: expected,
    baselineTreeSha256: actualSnapshot.treeSha256,
    evidenceFiles: files,
    receiptSha256: sha256Canonical({ baselineCommit: expected, baselineTreeSha256: actualSnapshot.treeSha256, evidenceFiles: files }),
  };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    const key = arg.slice(2);
    index += 1;
    if (index >= rest.length) throw new Error(`Missing value after ${arg}.`);
    options[key] = rest[index];
  }
  return { command, options };
}

function usage() {
  return [
    'Usage:',
    '  node scripts/verify-ranking-v3-rebase.mjs snapshot-tree --head <commit> --out <snapshot.json> [--repo <path>]',
    '  node scripts/verify-ranking-v3-rebase.mjs verify --evidence-dir <dir> --expected-head <commit> [--repo <path>] [--out <receipt.json>]',
  ].join('\n');
}

export function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (command === 'snapshot-tree') {
    if (!options.head || !options.out) throw new Error('snapshot-tree requires --head and --out.');
    const snapshot = snapshotTree(options.repo ?? process.cwd(), options.head);
    fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
    fs.writeFileSync(path.resolve(options.out), `${JSON.stringify(snapshot, null, 2)}\n`);
    return snapshot;
  }
  if (command === 'verify') {
    if (!options['evidence-dir'] || !options['expected-head']) throw new Error('verify requires --evidence-dir and --expected-head.');
    const receipt = verifyEvidenceDirectory({
      repo: options.repo ?? process.cwd(),
      evidenceDir: path.resolve(options['evidence-dir']),
      expectedHead: options['expected-head'],
    });
    if (options.out) {
      fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
      fs.writeFileSync(path.resolve(options.out), `${JSON.stringify(receipt, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    }
    return receipt;
  }
  throw new Error(`Unknown command '${command ?? ''}'.\n${usage()}`);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`verify-ranking-v3-rebase: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
    process.exitCode = 1;
  }
}
