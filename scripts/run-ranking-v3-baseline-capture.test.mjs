import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildRankingCandidateTaskSuites } from './satori-ranking-benchmark-manifest.mjs';
import { validateTaskSuite } from './satori-useful-context.mjs';
import { sha256Bytes, sha256Canonical } from './verify-ranking-v3-rebase.mjs';

const WRAPPER = fileURLToPath(new URL('./run-ranking-v3-baseline-capture.mjs', import.meta.url));
const SNAPSHOT = fileURLToPath(new URL('./verify-ranking-v3-rebase.mjs', import.meta.url));
const REAL_CAPTURE_SCRIPT = fileURLToPath(new URL('./satori-search-candidate-capture.mjs', import.meta.url));
const REAL_USEFUL_CONTEXT = fileURLToPath(new URL('./satori-useful-context.mjs', import.meta.url));
const REAL_HELDOUT_OPENING = fileURLToPath(new URL('./satori-track-o-heldout-opening.mjs', import.meta.url));
const REAL_O2_EVIDENCE = fileURLToPath(new URL('./satori-lateon-track-o-o2-evidence.mjs', import.meta.url));
const REAL_MANIFEST = fileURLToPath(new URL('../evals/search-ranking/cross-repository-v3.manifest.json', import.meta.url));
const SUPPORTED_CAPTURE_ARGS = new Set([
  '--tasks',
  '--observations',
  '--out',
  '--held-out-opening',
  '--policy',
  '--require-replay-ready',
  '--require-grouping-ready',
  '--require-neural-disabled',
]);
const FORBIDDEN_CAPTURE_ARGS = ['--manifest', '--partition', '--deny-heldout'];

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

// The frozen baseline tree must contain the REAL capture executor and its
// import closure, never a toy substitute.
function initRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ranking-v3-capture-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.name', 'Ranking V3 Test');
  git(root, 'config', 'user.email', 'ranking-v3@example.test');
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'evals', 'search-ranking'), { recursive: true });
  fs.copyFileSync(REAL_CAPTURE_SCRIPT, path.join(root, 'scripts', 'satori-search-candidate-capture.mjs'));
  fs.copyFileSync(REAL_USEFUL_CONTEXT, path.join(root, 'scripts', 'satori-useful-context.mjs'));
  fs.copyFileSync(REAL_HELDOUT_OPENING, path.join(root, 'scripts', 'satori-track-o-heldout-opening.mjs'));
  fs.copyFileSync(REAL_O2_EVIDENCE, path.join(root, 'scripts', 'satori-lateon-track-o-o2-evidence.mjs'));
  fs.copyFileSync(REAL_MANIFEST, path.join(root, 'evals', 'search-ranking', 'cross-repository-v3.manifest.json'));
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'baseline');
  return root;
}

function tuningTaskSuite(manifest) {
  return {
    version: 2,
    name: 'cross-repository-v3-tuning',
    tasks: buildRankingCandidateTaskSuites(manifest)
      .flatMap((suite) => [...suite.candidateTaskSuite.tasks, ...suite.negativeExposureSuite.tasks])
      .filter((task) => task.split === 'tuning'),
  };
}

function candidateTrace() {
  const candidate = (stage, rank) => ({
    candidateId: `candidate-${stage}-${rank}`,
    ownerId: JSON.stringify(['symbol', 'src/task-owner.ts', 'taskOwner']),
    evidenceOccurrenceId: JSON.stringify([`candidate-${stage}-${rank}`, stage, rank]),
    rank,
  });
  return {
    schemaVersion: 'search_candidate_survival_v1',
    maxEntriesPerStage: 160,
    corePasses: [{ passId: 'attempt:1/primary', productCandidateLimit: 80 }],
    queryEmbeddings: [{ passId: 'attempt:1/primary', sha256: null }],
    lexicalRequests: [],
    stages: [
      {
        stage: 'raw_lexical',
        passId: 'attempt:1/primary',
        totalOccurrences: 1,
        uniqueCandidates: 1,
        omittedOccurrences: 0,
        candidates: [candidate('raw_lexical', 1)],
      },
      {
        stage: 'core_fusion',
        passId: 'attempt:1/primary',
        totalOccurrences: 1,
        uniqueCandidates: 1,
        omittedOccurrences: 0,
        candidates: [candidate('core_fusion', 1)],
      },
      {
        stage: 'mcp_pass',
        passId: 'attempt:1/primary',
        totalOccurrences: 1,
        uniqueCandidates: 1,
        omittedOccurrences: 0,
        candidates: [candidate('mcp_pass', 1)],
      },
      {
        stage: 'mcp_fusion',
        passId: 'attempt:1',
        totalOccurrences: 1,
        uniqueCandidates: 1,
        omittedOccurrences: 0,
        candidates: [candidate('mcp_fusion', 1)],
      },
    ],
    removals: [],
    omittedRemovals: 0,
  };
}

function debugSearch() {
  return {
    route: { kind: 'semantic' },
    queryIntent: {
      classification: 'semantic',
      confidence: 'high',
      reasons: ['natural_language'],
      lexicalTerms: [],
      semanticQuery: 'test query',
    },
    retrieval: { mode: 'lexical', scorePolicyKind: 'topk_only', backendScoreKinds: ['rrf_fusion'] },
    mcpFusion: { rrfK: 60 },
    providerWork: {
      semanticSearchAttempts: 0,
      embeddingCallsByCurrentContract: 0,
      denseQueriesByCurrentContract: 0,
      sparseQueriesByCurrentContract: 0,
      rerankerCalls: 0,
      rerankerCandidates: 0,
      rerankerInputBytes: 0,
      candidatesWithSemanticEvidence: 0,
      candidatesWithLexicalEvidence: 1,
      candidatesWithCurrentSourceEvidence: 0,
    },
    candidateSurvival: candidateTrace(),
    passesUsed: ['primary'],
    candidateLimit: 80,
    mustRetry: { attempts: 1, maxAttempts: 2, applied: false, satisfied: true, finalCount: 1 },
    operatorSummary: { language: [], path: [], excludePath: [], must: [], exclude: [] },
    rankingProvenance: {
      semanticPassesUsed: [],
      lexicalPassesUsed: ['primary'],
      livePathSupplementUsed: false,
      lexicalFileScanUsed: false,
      rerankApplied: false,
      exactMatchPinningApplied: false,
      registryRepairGroupCount: 0,
    },
    filterSummary: {
      removedByScope: 0,
      removedByLanguage: 0,
      removedByPathInclude: 0,
      removedByPathExclude: 0,
      removedByMust: 0,
      removedByExclude: 0,
    },
    changedFilesBoost: {
      enabled: false,
      applied: false,
      available: false,
      changedCount: 0,
      maxChangedFilesForBoost: 50,
      skippedForLargeChangeSet: false,
      multiplier: 1,
      boostedCandidates: 0,
    },
  };
}

// A live-runtime-shaped observation set. Every field below is runtime evidence
// the wrapper must never fabricate: the test supplies it the same way a real
// measurement runtime would.
function runtimeObservationSet({ repoRoot, gitRevision, taskSuiteSha256, taskIds }) {
  const runtimeFingerprint = { vectorStoreProvider: 'LanceDB', embeddingProvider: 'VoyageAI' };
  const publication = {
    collectionName: 'generation-7',
    markerRunId: 'marker-run-7',
    indexPolicyHash: 'a'.repeat(64),
    policyDocumentDigest: 'b'.repeat(64),
  };
  const generationReceipt = { canonicalRoot: repoRoot, runtimeFingerprint, publication };
  const indexProof = {
    id: 'sync-7',
    action: 'sync',
    canonicalRoot: repoRoot,
    generation: 7,
    phase: 'completed',
    lastDurableTransitionAt: '2026-07-18T00:00:00.000Z',
    runtimeFingerprint,
    publication,
  };
  const makeObservation = (taskId, phase, sample) => {
    const response = {
      status: 'ok',
      hints: { debugSearch: debugSearch() },
      results: [{ target: { file: 'src/task-owner.ts' }, displayLabel: 'taskOwner' }],
    };
    return {
      taskId,
      phase,
      sample,
      generationReceipt: structuredClone(generationReceipt),
      status: 'ok',
      latencyMs: phase === 'cold' ? 10 : 5,
      contextBytes: 100,
      responseBytes: Buffer.byteLength(JSON.stringify(response), 'utf8'),
      response,
      results: [{ kind: 'symbol', file: 'src/task-owner.ts', symbol: 'taskOwner' }],
      toolCalls: 1,
      callsToSource: null,
      sourceReached: false,
      sourceMode: null,
      freshnessModes: ['skipped_recent'],
    };
  };
  return {
    version: 3,
    warmSampleCount: 1,
    metadata: {
      repoRoot,
      gitRevision,
      taskSuiteSha256,
      qualificationRuntime: { sha256: 'c'.repeat(64) },
      armIndexProof: {
        canonicalRoot: repoRoot,
        generation: 7,
        runtimeFingerprint,
        publication,
      },
      taskRuns: taskIds.map((taskId) => ({
        taskId,
        syncStats: { added: 0, removed: 0, modified: 0 },
        indexProof: structuredClone(indexProof),
        finalIndexProof: structuredClone(indexProof),
      })),
    },
    observations: taskIds.flatMap((taskId) => [
      makeObservation(taskId, 'cold', 0),
      makeObservation(taskId, 'warm', 1),
    ]),
  };
}

function prepareBaseline(repo) {
  const head = git(repo, 'rev-parse', 'HEAD');
  const snapshotPath = path.join(repo, 'snapshot.json');
  const snapshot = spawnSync(
    process.execPath,
    [SNAPSHOT, 'snapshot-tree', '--head', head, '--out', snapshotPath],
    { cwd: repo, encoding: 'utf8' },
  );
  assert.equal(snapshot.status, 0, snapshot.stderr);
  const treeSha256 = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')).treeSha256;

  const manifestPath = path.join(repo, 'evals', 'search-ranking', 'cross-repository-v3.manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const normalizedSuite = validateTaskSuite(tuningTaskSuite(manifest));
  const taskSuiteSha256 = sha256Canonical(normalizedSuite);
  const taskIds = normalizedSuite.tasks.map((task) => task.id);
  assert.equal(taskIds.length, 50, 'the sealed manifest must provide exactly 50 tuning tasks');

  const worktree = path.join(path.dirname(repo), `${path.basename(repo)}-detached`);
  const canonicalWorktree = path.join(fs.realpathSync(path.dirname(worktree)), path.basename(worktree));
  const out = path.join(path.dirname(repo), `${path.basename(repo)}-evidence`);
  fs.mkdirSync(out, { recursive: true });
  const observationsPath = path.join(out, 'OBSERVATION_SET.runtime.json');
  fs.writeFileSync(
    observationsPath,
    `${JSON.stringify(runtimeObservationSet({
      repoRoot: canonicalWorktree,
      gitRevision: head,
      taskSuiteSha256,
      taskIds,
    }), null, 2)}\n`,
  );
  return { head, treeSha256, taskSuiteSha256, taskIds, worktree, canonicalWorktree, out, observationsPath, manifestPath };
}

function runWrapper(repo, options) {
  return spawnSync(process.execPath, [
    WRAPPER,
    '--manifest', 'evals/search-ranking/cross-repository-v3.manifest.json',
    '--partition', 'tuning',
    '--deny-heldout',
    '--observations', options.observationsPath,
    '--baseline-commit', options.head,
    '--baseline-tree-sha256', options.treeSha256,
    '--detached-worktree', options.worktree,
    '--out', options.out,
  ], { cwd: repo, encoding: 'utf8' });
}

test('executes_real_frozen_capture_cli_inside_verified_detached_baseline_worktree', () => {
  const repo = initRepo();
  const baseline = prepareBaseline(repo);

  const run = runWrapper(repo, baseline);
  assert.equal(run.status, 0, run.stderr);

  const receipt = JSON.parse(fs.readFileSync(path.join(baseline.out, 'BASELINE_CAPTURE_RECEIPT.json'), 'utf8'));
  assert.equal(receipt.baselineCommit, baseline.head);
  assert.equal(receipt.baselineTreeSha256, baseline.treeSha256);
  assert.equal(receipt.captureCwd, fs.realpathSync(baseline.worktree));
  assert.equal(receipt.heldoutDenied, true);
  assert.equal(receipt.partition, 'tuning');
  assert.equal(receipt.executedHead, baseline.head);
  assert.equal(receipt.taskSuiteSha256, baseline.taskSuiteSha256);
  assert.notEqual(receipt.captureCwd, fs.realpathSync(repo));

  // The capture invocation must drive the REAL frozen CLI with only its
  // supported arguments; never --manifest/--partition/--deny-heldout.
  const command = receipt.captureCommand;
  assert.equal(
    command[1],
    path.join(fs.realpathSync(baseline.worktree), 'scripts', 'satori-search-candidate-capture.mjs'),
  );
  const flags = command.slice(2).filter((arg) => arg.startsWith('--'));
  assert.ok(flags.every((flag) => SUPPORTED_CAPTURE_ARGS.has(flag)));
  assert.ok(flags.every((flag) => !FORBIDDEN_CAPTURE_ARGS.includes(flag)));
  for (const required of ['--tasks', '--observations', '--out']) {
    assert.ok(flags.includes(required), `capture invocation must include ${required}`);
  }

  const capture = JSON.parse(fs.readFileSync(path.join(baseline.out, 'capture.json'), 'utf8'));
  assert.equal(capture.kind, 'satori_search_candidate_capture');
  assert.equal(capture.taskSuiteVersion, 2);
  assert.equal(capture.authority.gitRevision, baseline.head);
  assert.equal(capture.authority.taskSuiteSha256, baseline.taskSuiteSha256);
  assert.equal(capture.captures.length, 50);
  assert.ok(capture.captures.every((taskCapture) => taskCapture.split === 'tuning'));
  assert.match(capture.sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    receipt.captureSha256,
    sha256Bytes(fs.readFileSync(path.join(baseline.out, 'capture.json'))),
  );
});

test('rejects_worktree_tree_digest_not_equal_to_frozen_base', () => {
  const repo = initRepo();
  const baseline = prepareBaseline(repo);

  const run = spawnSync(process.execPath, [
    WRAPPER,
    '--manifest', 'evals/search-ranking/cross-repository-v3.manifest.json',
    '--partition', 'tuning',
    '--deny-heldout',
    '--observations', baseline.observationsPath,
    '--baseline-commit', baseline.head,
    '--baseline-tree-sha256', 'f'.repeat(64),
    '--detached-worktree', `${baseline.worktree}-wrong`,
    '--out', `${baseline.out}-wrong`,
  ], { cwd: repo, encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /tree/i);
});

test('fails_closed_when_live_runtime_proofs_are_absent', () => {
  const repo = initRepo();
  const baseline = prepareBaseline(repo);
  const degradedWorktree = `${baseline.worktree}-degraded`;
  const degradedOut = `${baseline.out}-degraded`;
  const canonicalDegradedWorktree = path.join(
    fs.realpathSync(path.dirname(degradedWorktree)),
    path.basename(degradedWorktree),
  );
  const observations = runtimeObservationSet({
    repoRoot: canonicalDegradedWorktree,
    gitRevision: baseline.head,
    taskSuiteSha256: baseline.taskSuiteSha256,
    taskIds: baseline.taskIds,
  });
  delete observations.metadata.armIndexProof;
  const degradedPath = path.join(baseline.out, 'OBSERVATION_SET.degraded.json');
  fs.writeFileSync(degradedPath, `${JSON.stringify(observations, null, 2)}\n`);

  const run = spawnSync(process.execPath, [
    WRAPPER,
    '--manifest', 'evals/search-ranking/cross-repository-v3.manifest.json',
    '--partition', 'tuning',
    '--deny-heldout',
    '--observations', degradedPath,
    '--baseline-commit', baseline.head,
    '--baseline-tree-sha256', baseline.treeSha256,
    '--detached-worktree', degradedWorktree,
    '--out', degradedOut,
  ], { cwd: repo, encoding: 'utf8' });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /armIndexProof/i);
  assert.ok(!fs.existsSync(path.join(degradedOut, 'capture.json')));
  assert.ok(!fs.existsSync(path.join(degradedOut, 'BASELINE_CAPTURE_RECEIPT.json')));
});
