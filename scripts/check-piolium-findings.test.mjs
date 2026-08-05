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

test('nonexistent SHA fails validation', () => {
  const root = createFindingWorkspace({
    'W9/draft.md': draft(
      ['id: W9', 'slug: fixture-sha-nonexistent', 'status: open', 'poc_kind: theoretical',
       'introduced_at: "1111111111111111111111111111111111111111"',
       'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fixed_in: ""', 'fix_verified_at: ""'].join('\n'),
    ),
  });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /introduced_at/);
  assert.match(result.errors[0], /unknown commit/);
});

test('malformed SHA fails validation', () => {
  const root = createFindingWorkspace({
    'W9/draft.md': draft(
      ['id: W9', 'slug: fixture-sha-malformed', 'status: open', 'poc_kind: theoretical',
       'introduced_at: "not-a-sha"',
       'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fixed_in: ""', 'fix_verified_at: ""'].join('\n'),
    ),
  });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /introduced_at/);
});

test('abbreviated ambiguous SHA fails validation', () => {
  const root = createFindingWorkspace({
    'W9/draft.md': draft(
      ['id: W9', 'slug: fixture-sha-ambiguous', 'status: open', 'poc_kind: theoretical',
       'introduced_at: "39c28"',
       'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fixed_in: ""', 'fix_verified_at: ""'].join('\n'),
    ),
  });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /introduced_at/);
  assert.match(result.errors[0], /unknown commit/);
});

test('valid full commit SHA passes', () => {
  const root = createFindingWorkspace({
    'W8/draft.md': draft(
      ['id: W8', 'slug: fixture-sha-valid', 'status: fixed', 'poc_kind: theoretical',
       'introduced_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fixed_in: "e3c9a6988813e8f4b76a213c5133e7a8bac9820f"',
       'fix_verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"'].join('\n'),
    ),
  });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.deepEqual(result.errors, []);
});

test('empty introduced_at fails as non-empty required field', () => {
  const root = createFindingWorkspace({
    'W9/draft.md': draft(
      ['id: W9', 'slug: fixture-sha-empty', 'status: open', 'poc_kind: theoretical',
       'introduced_at: ""',
       'verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"',
       'fixed_in: ""', 'fix_verified_at: ""'].join('\n'),
    ),
  });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /introduced_at/);
  assert.match(result.errors[0], /non-empty/);
});

test('invalid --head produces a stable validation error, not a stack trace', () => {
  const root = createFindingWorkspace({ 'W9/draft.md': OPEN_DRAFT });
  const script = path.join(REPO_ROOT, 'scripts', 'check-piolium-findings.mjs');
  assert.throws(() => {
    execFileSync(process.execPath, [script, '--head', 'not-a-sha', '--root', root], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
  }, (error) => {
    const output = String(error.stdout || '');
    assert.match(output, /does not resolve to a commit/);
    assert.doesNotMatch(output, /at checkFindings|at main|Error:/);
    return true;
  });
});

function registryYaml(entries) {
  return `findings:\n${entries
    .map((entry) => `  - id: ${entry.id}\n    status: ${entry.status}\n    verified_at: "${entry.verified_at}"\n    fixed_in: "${entry.fixed_in ?? ''}"\n    resolution: "${entry.resolution ?? ''}"`)
    .join('\n')}\n`;
}

const REGISTRY_SHA = '94a3dc659d3edce892f6f7f859a6c70597343751';

function writeRegistry(files) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-registry-'));
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(cwd, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return cwd;
}

test('valid registry passes alongside drafts', () => {
  const cwd = writeRegistry({
    'registry.yml': registryYaml([
      { id: 'M1', status: 'accepted', verified_at: REGISTRY_SHA, fixed_in: REGISTRY_SHA, resolution: 'documented trust boundary' },
      { id: 'M2', status: 'open', verified_at: REGISTRY_SHA, fixed_in: '', resolution: 'tasks 4-7 in flight' },
    ]),
  });
  const root = createFindingWorkspace({ 'W9/draft.md': OPEN_DRAFT });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT, registry: path.join(cwd, 'registry.yml') });
  assert.deepEqual(result.errors, []);
});

test('registry entry with unknown status fails', () => {
  const cwd = writeRegistry({
    'registry.yml': registryYaml([
      { id: 'M1', status: 'banana', verified_at: REGISTRY_SHA, fixed_in: REGISTRY_SHA, resolution: '' },
    ]),
  });
  const root = createFindingWorkspace({ 'W9/draft.md': OPEN_DRAFT });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT, registry: path.join(cwd, 'registry.yml') });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /unknown status/);
});

test('accepted registry entry without fixed_in fails', () => {
  const cwd = writeRegistry({
    'registry.yml': registryYaml([
      { id: 'M1', status: 'accepted', verified_at: REGISTRY_SHA, fixed_in: '', resolution: '' },
    ]),
  });
  const root = createFindingWorkspace({ 'W9/draft.md': OPEN_DRAFT });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT, registry: path.join(cwd, 'registry.yml') });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /accepted.*requires non-empty fixed_in/);
});

test('open registry entry with non-empty fixed_in fails', () => {
  const cwd = writeRegistry({
    'registry.yml': registryYaml([
      { id: 'M2', status: 'open', verified_at: REGISTRY_SHA, fixed_in: REGISTRY_SHA, resolution: '' },
    ]),
  });
  const root = createFindingWorkspace({ 'W9/draft.md': OPEN_DRAFT });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT, registry: path.join(cwd, 'registry.yml') });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /open.*requires empty fixed_in/);
});

test('duplicate registry ID fails', () => {
  const cwd = writeRegistry({
    'registry.yml': registryYaml([
      { id: 'M1', status: 'accepted', verified_at: REGISTRY_SHA, fixed_in: REGISTRY_SHA, resolution: '' },
      { id: 'M1', status: 'open', verified_at: REGISTRY_SHA, fixed_in: '', resolution: '' },
    ]),
  });
  const root = createFindingWorkspace({ 'W9/draft.md': OPEN_DRAFT });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT, registry: path.join(cwd, 'registry.yml') });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /duplicate finding id/);
});

test('registry ID duplicating a draft ID fails', () => {
  const cwd = writeRegistry({
    'registry.yml': registryYaml([
      { id: 'W9', status: 'open', verified_at: REGISTRY_SHA, fixed_in: '', resolution: '' },
    ]),
  });
  const root = createFindingWorkspace({ 'W9/draft.md': OPEN_DRAFT });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT, registry: path.join(cwd, 'registry.yml') });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /duplicate finding id/);
});

test('M1/M2 drafts absent passes via registry', () => {
  // Simulates a fresh CI checkout: no M1/M2 draft dirs under the root, only the
  // tracked registry carries their status. Must not fail on their absence.
  const cwd = writeRegistry({
    'registry.yml': registryYaml([
      { id: 'M1', status: 'accepted', verified_at: REGISTRY_SHA, fixed_in: REGISTRY_SHA, resolution: 'documented trust boundary' },
      { id: 'M2', status: 'open', verified_at: REGISTRY_SHA, fixed_in: '', resolution: 'tasks 4-7 in flight' },
    ]),
  });
  const root = createFindingWorkspace({ 'W7/draft.md': FIXED_DRAFT });
  const result = checkFindings({ head: 'HEAD', root, repoRoot: REPO_ROOT, registry: path.join(cwd, 'registry.yml') });
  assert.deepEqual(result.errors, []);
});

test('entirely absent findings root passes via registry', () => {
  // Master untracked all piolium drafts (2026-08-06); the findings root may not
  // exist at all. The registry alone must be a pass condition.
  const cwd = writeRegistry({
    'registry.yml': registryYaml([
      { id: 'M1', status: 'accepted', verified_at: REGISTRY_SHA, fixed_in: REGISTRY_SHA, resolution: 'documented trust boundary' },
    ]),
  });
  const absentRoot = path.join(cwd, 'does-not-exist');
  const result = checkFindings({ head: 'HEAD', root: absentRoot, repoRoot: REPO_ROOT, registry: path.join(cwd, 'registry.yml') });
  assert.deepEqual(result.errors, []);
});

test('absent findings root without registry fails', () => {
  // Without a registry there is nothing to validate; the absence must be
  // reported rather than silently passing.
  const cwd = writeRegistry({});
  const absentRoot = path.join(cwd, 'does-not-exist');
  const result = checkFindings({ head: 'HEAD', root: absentRoot, repoRoot: REPO_ROOT, registry: null });
  assert.ok(result.errors.some((message) => /no draft\.md files found/.test(message)));
});

test('missing registry file fails', () => {
  const root = createFindingWorkspace({ 'W9/draft.md': OPEN_DRAFT });
  const result = checkFindings({
    head: 'HEAD',
    root,
    repoRoot: REPO_ROOT,
    registry: path.join('does-not-exist', 'registry.yml'),
  });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /registry file .* not found/);
});

test('parseCheckArgs resolves the registry default and override', () => {
  const defaults = parseCheckArgs([]);
  assert.equal(defaults.registry, 'docs/evidence/security-hardening-20260805/findings-registry.yml');
  const overridden = parseCheckArgs(['--registry', 'tmp/reg.yml']);
  assert.equal(overridden.registry, 'tmp/reg.yml');
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
