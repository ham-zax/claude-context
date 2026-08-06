#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sha256Bytes, sha256Canonical, snapshotTree } from './verify-ranking-v3-rebase.mjs';

const COMMIT = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: options.env ?? process.env,
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
  return result;
}

function git(repo, ...args) {
  return run('git', ['-C', repo, ...args]).stdout.trim();
}

function parseArgs(argv) {
  const options = { denyHeldout: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--deny-heldout') {
      options.denyHeldout = true;
      continue;
    }
    if (!arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    index += 1;
    if (index >= argv.length) throw new Error(`Missing value after ${arg}.`);
    options[arg.slice(2)] = argv[index];
  }
  return options;
}

function validateManifest(manifest, partition) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Ranking manifest must be an object.');
  if (manifest.version !== 3 || manifest.kind !== 'satori_cross_repository_ranking_manifest') throw new Error('Ranking manifest is not the sealed v3 authority.');
  if (!Array.isArray(manifest.repositories) || !Array.isArray(manifest.tasks)) throw new Error('Ranking manifest repositories and tasks must be arrays.');
  const repositories = manifest.repositories.filter((entry) => entry?.split === partition);
  const repositoryIds = new Set(repositories.map((entry) => entry.id));
  const tasks = manifest.tasks.filter((entry) => entry?.split === partition);
  if (partition === 'tuning') {
    if (repositories.some((entry) => entry.split !== 'tuning') || tasks.some((entry) => entry.split !== 'tuning')) throw new Error('Held-out authority leaked into tuning selection.');
    for (const task of tasks) {
      if (!repositoryIds.has(task.repositoryId)) throw new Error(`Tuning task '${task.id}' references a non-tuning repository.`);
    }
  }
  if (repositories.length === 0 || tasks.length === 0) throw new Error(`Manifest has no ${partition} repositories or tasks.`);
  return { repositories, tasks };
}

function safeRemoveWorktree(repo, worktree) {
  if (!fs.existsSync(worktree)) return;
  spawnSync('git', ['-C', repo, 'worktree', 'remove', '--force', worktree], { encoding: 'utf8' });
  fs.rmSync(worktree, { recursive: true, force: true });
}

export function runBaselineCapture(options) {
  const repo = fs.realpathSync(options.repo ?? process.cwd());
  if (options.partition !== 'tuning') throw new Error("Baseline capture only permits --partition tuning.");
  if (!options.denyHeldout) throw new Error('Baseline capture requires --deny-heldout.');
  if (!COMMIT.test(options['baseline-commit'] ?? '')) throw new Error('--baseline-commit must be a lowercase 40-character Git commit.');
  if (!SHA256.test(options['baseline-tree-sha256'] ?? '')) throw new Error('--baseline-tree-sha256 must be a lowercase SHA-256 digest.');
  for (const key of ['manifest', 'detached-worktree', 'out']) {
    if (!options[key]) throw new Error(`--${key} is required.`);
  }

  const baselineCommit = options['baseline-commit'];
  const worktree = path.resolve(options['detached-worktree']);
  const out = path.resolve(options.out);
  const repoRelativeWorktree = path.relative(repo, worktree);
  if (repoRelativeWorktree === '' || (!repoRelativeWorktree.startsWith('..') && !path.isAbsolute(repoRelativeWorktree))) {
    throw new Error('Detached worktree must be outside the caller repository.');
  }
  const outRelative = path.relative(repo, out);
  if (outRelative === '' || (!outRelative.startsWith('..') && !path.isAbsolute(outRelative))) {
    throw new Error('Baseline evidence output must be outside the caller repository.');
  }
  safeRemoveWorktree(repo, worktree);
  fs.mkdirSync(path.dirname(worktree), { recursive: true });
  run('git', ['-C', repo, 'worktree', 'add', '--detach', worktree, baselineCommit]);
  const canonicalWorktree = fs.realpathSync(worktree);
  const executedHead = git(canonicalWorktree, 'rev-parse', 'HEAD');
  if (executedHead !== baselineCommit) throw new Error(`Detached worktree head ${executedHead} does not equal baseline ${baselineCommit}.`);
  const snapshot = snapshotTree(canonicalWorktree, executedHead);
  if (snapshot.treeSha256 !== options['baseline-tree-sha256']) throw new Error('Detached worktree tree digest does not equal the frozen baseline tree.');

  const manifestPath = path.isAbsolute(options.manifest)
    ? options.manifest
    : path.join(canonicalWorktree, options.manifest);
  const relativeManifest = path.relative(canonicalWorktree, manifestPath);
  if (relativeManifest.startsWith('..') || path.isAbsolute(relativeManifest)) throw new Error('Manifest must be read from the detached baseline worktree.');
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const selected = validateManifest(manifest, options.partition);
  fs.mkdirSync(out, { recursive: true });
  const selectedManifestPath = path.join(out, 'TUNING_MANIFEST.json');
  const selectedManifest = {
    schemaVersion: 'ranking_v3_tuning_capture_manifest_v1',
    sourceManifestSha256: sha256Bytes(manifestBytes),
    partition: 'tuning',
    heldoutDenied: true,
    repositories: selected.repositories,
    tasks: selected.tasks,
  };
  fs.writeFileSync(selectedManifestPath, `${JSON.stringify({ ...selectedManifest, sha256: sha256Canonical(selectedManifest) }, null, 2)}\n`);

  const captureScript = path.join(canonicalWorktree, 'scripts', 'satori-search-candidate-capture.mjs');
  if (!fs.existsSync(captureScript)) throw new Error('Baseline capture executor is missing from the detached worktree.');
  const captureOut = path.join(out, 'capture.json');
  run(process.execPath, [
    captureScript,
    '--manifest', selectedManifestPath,
    '--partition', 'tuning',
    '--deny-heldout', 'true',
    '--out', captureOut,
  ], { cwd: canonicalWorktree, env: { ...process.env, SATORI_RANKING_V3_BASELINE_CAPTURE: '1' } });
  if (!fs.existsSync(captureOut)) throw new Error('Baseline capture executor did not write capture.json.');

  const unsignedReceipt = {
    schemaVersion: 'ranking_v3_baseline_capture_receipt_v1',
    baselineCommit,
    baselineTreeSha256: snapshot.treeSha256,
    executedHead,
    executedGitTree: snapshot.gitTree,
    captureCwd: canonicalWorktree,
    manifestSha256: sha256Bytes(manifestBytes),
    selectedManifestSha256: sha256Bytes(fs.readFileSync(selectedManifestPath)),
    captureSha256: sha256Bytes(fs.readFileSync(captureOut)),
    partition: 'tuning',
    heldoutDenied: true,
  };
  const receipt = { ...unsignedReceipt, receiptSha256: sha256Canonical(unsignedReceipt) };
  fs.writeFileSync(path.join(out, 'BASELINE_CAPTURE_RECEIPT.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function usage() {
  return 'Usage: node scripts/run-ranking-v3-baseline-capture.mjs --manifest <manifest.json> --partition tuning --deny-heldout --baseline-commit <commit> --baseline-tree-sha256 <sha256> --detached-worktree <path> --out <dir>';
}

export function main(argv = process.argv.slice(2)) {
  return runBaselineCapture(parseArgs(argv));
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`run-ranking-v3-baseline-capture: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
    process.exitCode = 1;
  }
}
