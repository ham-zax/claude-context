import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  checkFindings,
  parseFrontMatter,
  parseCheckArgs,
  resolveCommit,
  isAncestor,
} from './check-piolium-findings.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const ANCESTOR_SHA = '94a3dc659d3edce892f6f7f859a6c70597343751';
const NON_ANCESTOR_SHA = '39acf868ceca54af3f10ec6a5d7d0fbb3fdb8d42';

function createFindingWorkspace(files) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-findings-'));
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(cwd, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return cwd;
}

function draft(frontMatter, body = '') {
  return `---\n${frontMatter}\n---\n\n${body}`;
}

const OPEN_DRAFT = draft(
  ['id: W9', 'slug: fixture-open', 'status: open', 'poc_kind: theoretical',
   'introduced_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
   'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
   'fixed_in: ""', 'fix_verified_at: ""'].join('\n'),
);

const FIXED_DRAFT = draft(
  ['id: W8', 'slug: fixture-fixed', 'status: fixed', 'poc_kind: theoretical',
   'introduced_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
   'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
   'fixed_in: "94a3dc659d3edce892f6f7f859a6c70597343751"',
   'fix_verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"'].join('\n'),
);

test('parseFrontMatter handles quoted values and comments', () => {
  const parsed = parseFrontMatter(
    '---\nid: W1\nslug: must-retrieval\ntitle: "must: post-retrieval filter"\n# comment\npoc_kind: theoretical\n---\n',
  );
  assert.equal(parsed.id, 'W1');
  assert.equal(parsed.title, 'must: post-retrieval filter');
  assert.equal(parsed.poc_kind, 'theoretical');
});

test('parseCheckArgs resolves defaults and overrides', () => {
  const defaults = parseCheckArgs([]);
  assert.equal(defaults.head, 'HEAD');
  assert.equal(defaults.root, 'piolium/findings');
  const overridden = parseCheckArgs(['--head', 'abc123', '--root', 'tmp']);
  assert.equal(overridden.head, 'abc123');
  assert.equal(overridden.root, 'tmp');
});

test('resolveCommit and isAncestor use real repository history', () => {
  assert.equal(resolveCommit('HEAD', REPO_ROOT).length, 40);
  assert.equal(isAncestor(ANCESTOR_SHA, 'HEAD', REPO_ROOT), true);
  assert.equal(isAncestor(NON_ANCESTOR_SHA, 'HEAD', REPO_ROOT), false);
});

test('valid open finding passes', () => {
  const root = createFindingWorkspace({ 'W9/draft.md': OPEN_DRAFT });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.deepEqual(result.errors, []);
  assert.equal(result.findings.length, 1);
});

test('valid fixed finding passes', () => {
  const root = createFindingWorkspace({ 'W8/draft.md': FIXED_DRAFT });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.deepEqual(result.errors, []);
});

test('open finding whose fixed_in is an ancestor fails', () => {
  const root = createFindingWorkspace({
    'W9/draft.md': draft(
      ['id: W9', 'slug: fixture-stale', 'status: open', 'poc_kind: theoretical',
       'introduced_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fixed_in: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fix_verified_at: ""'].join('\n'),
    ),
  });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /cannot render as open/);
});

test('executed PoC with missing evidence fails', () => {
  const root = createFindingWorkspace({
    'M9/draft.md': draft(
      ['id: M9', 'slug: fixture-executed', 'status: open', 'poc_kind: executed',
       'poc_file: poc.mjs', 'evidence_log: evidence/exploit.log',
       'introduced_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fixed_in: ""', 'fix_verified_at: ""'].join('\n'),
    ),
    'M9/poc.mjs': 'console.log("poc");',
  });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /evidence_log/);
});

test('executed PoC with present poc and evidence passes', () => {
  const root = createFindingWorkspace({
    'M9/draft.md': draft(
      ['id: M9', 'slug: fixture-executed-ok', 'status: open', 'poc_kind: executed',
       'poc_file: poc.mjs', 'evidence_log: evidence/exploit.log',
       'introduced_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fixed_in: ""', 'fix_verified_at: ""'].join('\n'),
    ),
    'M9/poc.mjs': 'console.log("poc");',
    'M9/evidence/exploit.log': 'exploit ran\n',
  });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.deepEqual(result.errors, []);
});

test('fixed finding without fix_verified_at fails', () => {
  const root = createFindingWorkspace({
    'W8/draft.md': draft(
      ['id: W8', 'slug: fixture-fixed-no-verify', 'status: fixed', 'poc_kind: theoretical',
       'introduced_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fixed_in: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fix_verified_at: ""'].join('\n'),
    ),
  });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /fix_verified_at/);
});

test('historical verified_at not ancestral to HEAD fails', () => {
  const root = createFindingWorkspace({
    'W9/draft.md': draft(
      ['id: W9', 'slug: fixture-historical', 'status: open', 'poc_kind: theoretical',
       'introduced_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'verified_at: "39acf868ceca54af3f10ec6a5d7d0fbb3fdb8d42"',
       'fixed_in: ""', 'fix_verified_at: ""'].join('\n'),
    ),
  });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /historical|unverified|not an ancestor/);
});

test('unknown status value fails', () => {
  const root = createFindingWorkspace({
    'W9/draft.md': draft(
      ['id: W9', 'slug: fixture-status', 'status: banana', 'poc_kind: theoretical',
       'introduced_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fixed_in: ""', 'fix_verified_at: ""'].join('\n'),
    ),
  });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /unknown status/);
});

test('duplicate IDs fail', () => {
  const root = createFindingWorkspace({
    'W9/draft.md': draft(
      ['id: W9', 'slug: fixture-a', 'status: open', 'poc_kind: theoretical',
       'introduced_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fixed_in: ""', 'fix_verified_at: ""'].join('\n'),
    ),
    'W10/draft.md': draft(
      ['id: W9', 'slug: fixture-b', 'status: open', 'poc_kind: theoretical',
       'introduced_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fixed_in: ""', 'fix_verified_at: ""'].join('\n'),
    ),
  });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /duplicate/);
});

test('missing required field fails', () => {
  const root = createFindingWorkspace({
    'W9/draft.md': draft(
      ['id: W9', 'slug: fixture-missing', 'status: open', 'poc_kind: theoretical',
       'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fixed_in: ""', 'fix_verified_at: ""'].join('\n'),
    ),
  });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /introduced_at/);
});

test('CLI exits nonzero on invalid findings and zero on valid', () => {
  const badRoot = createFindingWorkspace({
    'W9/draft.md': draft(
      ['id: W9', 'slug: fixture-cli-bad', 'status: open', 'poc_kind: theoretical',
       'introduced_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fixed_in: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fix_verified_at: ""'].join('\n'),
    ),
  });
  const script = path.join(REPO_ROOT, 'scripts', 'check-piolium-findings.mjs');
  assert.throws(() => {
    execFileSync(process.execPath, [script, '--head', 'HEAD', '--root', badRoot], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    });
  });

  const goodRoot = createFindingWorkspace({ 'W9/draft.md': OPEN_DRAFT });
  const output = execFileSync(process.execPath, [script, '--head', 'HEAD', '--root', goodRoot], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  assert.match(output, /all findings consistent/);
});
