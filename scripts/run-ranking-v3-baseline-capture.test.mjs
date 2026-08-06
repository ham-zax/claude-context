import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const WRAPPER = fileURLToPath(new URL('./run-ranking-v3-baseline-capture.mjs', import.meta.url));
const SNAPSHOT = fileURLToPath(new URL('./verify-ranking-v3-rebase.mjs', import.meta.url));

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function initRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ranking-v3-capture-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Ranking V3 Test');
  git(root, 'config', 'user.email', 'ranking-v3@example.test');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'evals'), { recursive: true });
  fs.writeFileSync(path.join(root, 'evals', 'manifest.json'), `${JSON.stringify({
    version: 3,
    kind: 'satori_cross_repository_ranking_manifest',
    repositories: [
      { id: 'tuning-r0', split: 'tuning' },
      { id: 'held-r0', split: 'held_out' },
    ],
    tasks: [
      { id: 'tuning-task', split: 'tuning', repositoryId: 'tuning-r0' },
      { id: 'held-task', split: 'held_out', repositoryId: 'held-r0' },
    ],
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'scripts', 'satori-search-candidate-capture.mjs'), `
import fs from 'node:fs';
import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
fs.mkdirSync(path.dirname(args.out), { recursive: true });
fs.writeFileSync(args.out, JSON.stringify({ cwd: process.cwd(), manifest: args.manifest, partition: args.partition, denyHeldout: args['deny-heldout'] === 'true' }, null, 2));
`);
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'baseline');
  return root;
}

test('executes_only_inside_verified_detached_baseline_worktree', () => {
  const repo = initRepo();
  const head = git(repo, 'rev-parse', 'HEAD');
  const snapshotPath = path.join(repo, 'snapshot.json');
  const snapshot = spawnSync(process.execPath, [SNAPSHOT, 'snapshot-tree', '--head', head, '--out', snapshotPath], { cwd: repo, encoding: 'utf8' });
  assert.equal(snapshot.status, 0, snapshot.stderr);
  const treeSha256 = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')).treeSha256;
  const worktree = path.join(path.dirname(repo), `${path.basename(repo)}-detached`);
  const out = path.join(path.dirname(repo), `${path.basename(repo)}-evidence`);

  const run = spawnSync(process.execPath, [
    WRAPPER,
    '--manifest', 'evals/manifest.json',
    '--partition', 'tuning',
    '--deny-heldout',
    '--baseline-commit', head,
    '--baseline-tree-sha256', treeSha256,
    '--detached-worktree', worktree,
    '--out', out,
  ], { cwd: repo, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);

  const receipt = JSON.parse(fs.readFileSync(path.join(out, 'BASELINE_CAPTURE_RECEIPT.json'), 'utf8'));
  assert.equal(receipt.baselineCommit, head);
  assert.equal(receipt.baselineTreeSha256, treeSha256);
  assert.equal(receipt.captureCwd, fs.realpathSync(worktree));
  assert.equal(receipt.heldoutDenied, true);
  assert.equal(receipt.partition, 'tuning');
  assert.equal(receipt.executedHead, head);
  assert.notEqual(receipt.captureCwd, fs.realpathSync(repo));

  const capture = JSON.parse(fs.readFileSync(path.join(out, 'capture.json'), 'utf8'));
  assert.equal(capture.cwd, fs.realpathSync(worktree));
  assert.equal(capture.partition, 'tuning');
  assert.equal(capture.denyHeldout, true);

  const wrongTree = spawnSync(process.execPath, [
    WRAPPER,
    '--manifest', 'evals/manifest.json',
    '--partition', 'tuning',
    '--deny-heldout',
    '--baseline-commit', head,
    '--baseline-tree-sha256', 'f'.repeat(64),
    '--detached-worktree', `${worktree}-wrong`,
    '--out', `${out}-wrong`,
  ], { cwd: repo, encoding: 'utf8' });
  assert.notEqual(wrongTree.status, 0);
  assert.match(wrongTree.stderr, /tree/i);
});
