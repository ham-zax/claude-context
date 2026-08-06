import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./verify-ranking-v3-rebase.mjs', import.meta.url));

function run(cwd, args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function initRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ranking-v3-rebase-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Ranking V3 Test');
  git(root, 'config', 'user.email', 'ranking-v3@example.test');
  fs.writeFileSync(path.join(root, 'fixture.txt'), 'one\n');
  fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'first');
  return root;
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeEvidence(directory, head, treeSha256, repo) {
  fs.mkdirSync(directory, { recursive: true });
  const common = { baselineCommit: head, baselineTreeSha256: treeSha256 };
  fs.writeFileSync(path.join(directory, 'SOURCE_ANCHORS.json'), `${JSON.stringify({ schemaVersion: 'ranking_v3_source_anchors_v1', ...common, anchors: [] }, null, 2)}\n`);
  fs.writeFileSync(path.join(directory, 'RUNTIME_CONSTRUCTION_SITES.json'), `${JSON.stringify({ schemaVersion: 'ranking_v3_runtime_construction_sites_v1', ...common, sites: [] }, null, 2)}\n`);
  fs.writeFileSync(path.join(directory, 'CONTINUATION_SITES.json'), `${JSON.stringify({ schemaVersion: 'ranking_v3_continuation_sites_v1', ...common, sites: [] }, null, 2)}\n`);
  fs.writeFileSync(path.join(directory, 'LOCKFILE_AUTHORITY.json'), `${JSON.stringify({ schemaVersion: 'ranking_v3_lockfile_authority_v1', ...common, path: 'pnpm-lock.yaml', sha256: sha256File(path.join(repo, 'pnpm-lock.yaml')) }, null, 2)}\n`);
  fs.writeFileSync(path.join(directory, 'BASELINE.md'), `# Ranking V3 Baseline\n\nbaselineCommit: ${head}\nbaselineTreeSha256: ${treeSha256}\n`);
}

test('rejects_head_or_tree_not_equal_to_frozen_base', () => {
  const repo = initRepo();
  const snapshotFile = path.join(repo, 'snapshot.json');
  const head = git(repo, 'rev-parse', 'HEAD');
  const snapshot = run(repo, ['snapshot-tree', '--head', head, '--out', snapshotFile]);
  assert.equal(snapshot.status, 0, snapshot.stderr);
  const treeSha256 = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')).treeSha256;
  assert.match(treeSha256, /^[a-f0-9]{64}$/);

  const evidence = path.join(repo, 'evidence');
  writeEvidence(evidence, head, treeSha256, repo);
  const valid = run(repo, ['verify', '--evidence-dir', evidence, '--expected-head', head]);
  assert.equal(valid.status, 0, valid.stderr);

  const wrongHead = '0'.repeat(40);
  const headMismatch = run(repo, ['verify', '--evidence-dir', evidence, '--expected-head', wrongHead]);
  assert.notEqual(headMismatch.status, 0);
  assert.match(headMismatch.stderr, /expected head/i);

  const anchorsPath = path.join(evidence, 'SOURCE_ANCHORS.json');
  const anchors = JSON.parse(fs.readFileSync(anchorsPath, 'utf8'));
  anchors.baselineTreeSha256 = 'b'.repeat(64);
  fs.writeFileSync(anchorsPath, `${JSON.stringify(anchors, null, 2)}\n`);
  const treeMismatch = run(repo, ['verify', '--evidence-dir', evidence, '--expected-head', head]);
  assert.notEqual(treeMismatch.status, 0);
  assert.match(treeMismatch.stderr, /tree/i);
});
