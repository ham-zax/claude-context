#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { canonicalJson, sha256Bytes, sha256Canonical, snapshotTree } from './verify-ranking-v3-rebase.mjs';
import { buildRankingCandidateTaskSuites } from './satori-ranking-benchmark-manifest.mjs';
import { validateObservationSet, validateTaskSuite } from './satori-useful-context.mjs';

const COMMIT = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const NO_SYNC_FRESHNESS_MODES = new Set(['skipped_recent', 'skipped_source_unchanged']);
const ARM_PUBLICATION_KEYS = ['collectionName', 'indexPolicyHash', 'markerRunId', 'policyDocumentDigest'];

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

function requireOutside(relativePath, label) {
  if (relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))) {
    throw new Error(`${label} must be outside the detached baseline worktree.`);
  }
}

// Compile the tuning partition of the sealed manifest into the v1/v2 task
// suite format owned by validateTaskSuite, using the manifest builder's
// task-to-suite mapping authority (queryClass, oracle, search, language).
function buildTuningTaskSuite(manifest, expectedTaskIds) {
  const merged = {
    version: 2,
    name: 'cross-repository-v3-tuning',
    tasks: buildRankingCandidateTaskSuites(manifest)
      .flatMap((suite) => [...suite.candidateTaskSuite.tasks, ...suite.negativeExposureSuite.tasks])
      .filter((task) => task.split === 'tuning'),
  };
  const normalized = validateTaskSuite(merged);
  const suiteIds = normalized.tasks.map((task) => task.id).sort();
  if (canonicalJson(suiteIds) !== canonicalJson([...expectedTaskIds].sort())) {
    throw new Error('Generated tuning task suite does not cover exactly the manifest tuning tasks.');
  }
  return normalized;
}

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is absent; only a live measurement runtime can produce it.`);
  }
  return value;
}

// Fail closed on every observation-set field the wrapper cannot honestly
// generate. The task suite, its digest, and the worktree/revision bindings are
// derivable here; armIndexProof, qualificationRuntime, taskRuns, and the
// per-observation generation receipts, freshness evidence, and debugSearch
// traces are live-runtime proofs and must come from --observations.
function assertRuntimeProofsPresent(observationSet, taskIds, { canonicalWorktree, baselineCommit, taskSuiteSha256 }) {
  const metadata = requireRecord(observationSet.metadata, 'Observation metadata');
  if (typeof metadata.taskSuiteSha256 !== 'string' || metadata.taskSuiteSha256 !== taskSuiteSha256) {
    throw new Error(`Observation metadata taskSuiteSha256 does not match the suite generated from the manifest tuning partition (expected ${taskSuiteSha256}).`);
  }
  if (typeof metadata.repoRoot !== 'string' || metadata.repoRoot !== canonicalWorktree) {
    throw new Error(`Observation metadata repoRoot must equal the detached baseline worktree '${canonicalWorktree}'.`);
  }
  if (typeof metadata.gitRevision !== 'string' || metadata.gitRevision !== baselineCommit) {
    throw new Error('Observation metadata gitRevision must equal the executed baseline commit.');
  }
  const runtime = requireRecord(metadata.qualificationRuntime, 'Observation metadata qualificationRuntime');
  if (typeof runtime.sha256 !== 'string' || !SHA256.test(runtime.sha256)) {
    throw new Error('Observation metadata qualificationRuntime.sha256 must be a lowercase SHA-256 digest produced by the live runtime.');
  }
  const proof = requireRecord(metadata.armIndexProof, 'Observation metadata armIndexProof');
  if (proof.canonicalRoot !== canonicalWorktree) {
    throw new Error('Observation metadata armIndexProof canonicalRoot must equal the detached baseline worktree.');
  }
  if (!Number.isSafeInteger(proof.generation) || proof.generation < 0) {
    throw new Error('Observation metadata armIndexProof.generation must be a non-negative safe integer.');
  }
  requireRecord(proof.runtimeFingerprint, 'Observation metadata armIndexProof.runtimeFingerprint');
  const publication = requireRecord(proof.publication, 'Observation metadata armIndexProof.publication');
  const publicationKeys = Object.keys(publication).sort();
  if (canonicalJson(publicationKeys) !== canonicalJson([...ARM_PUBLICATION_KEYS].sort())) {
    throw new Error(`Observation metadata publication must contain exactly the v1 identity fields: ${ARM_PUBLICATION_KEYS.join(', ')}.`);
  }
  if (typeof publication.collectionName !== 'string' || typeof publication.markerRunId !== 'string') {
    throw new Error('Observation metadata publication collectionName and markerRunId must be strings.');
  }
  if (typeof publication.indexPolicyHash !== 'string' || !SHA256.test(publication.indexPolicyHash)) {
    throw new Error('Observation metadata publication indexPolicyHash must be a lowercase SHA-256 digest.');
  }
  if (typeof publication.policyDocumentDigest !== 'string' || !SHA256.test(publication.policyDocumentDigest)) {
    throw new Error('Observation metadata publication policyDocumentDigest must be a lowercase SHA-256 digest.');
  }
  if (!Array.isArray(metadata.taskRuns)) {
    throw new Error('Observation metadata taskRuns is absent; a live runtime must provide one measurement-isolation receipt per tuning task.');
  }
  for (const taskId of taskIds) {
    const taskRuns = metadata.taskRuns.filter((taskRun) => taskRun?.taskId === taskId);
    if (taskRuns.length !== 1) {
      throw new Error(`Task '${taskId}' must have exactly one live-runtime measurement-isolation receipt (found ${taskRuns.length}).`);
    }
    const taskRun = requireRecord(taskRuns[0], `Task '${taskId}' measurement receipt`);
    const preparationMode = taskRun.preparationMode ?? 'sync';
    if (preparationMode === 'sync') {
      const syncStats = requireRecord(taskRun.syncStats, `Task '${taskId}' syncStats`);
      if ([syncStats.added, syncStats.removed, syncStats.modified].some((value) => value !== 0)) {
        throw new Error(`Task '${taskId}' measurement preparation was not a zero-change sync; only a live runtime can prove it.`);
      }
    } else if (preparationMode === 'status-only') {
      if (taskRun.syncStats !== undefined) {
        throw new Error(`Task '${taskId}' status-only preparation must not contain syncStats.`);
      }
    } else {
      throw new Error(`Task '${taskId}' has an unsupported measurement preparation mode.`);
    }
    const preparedProof = requireRecord(taskRun.indexProof, `Task '${taskId}' prepared index proof`);
    const finalProof = requireRecord(taskRun.finalIndexProof, `Task '${taskId}' final index proof`);
    if (canonicalJson(preparedProof) !== canonicalJson(finalProof)) {
      throw new Error(`Task '${taskId}' index proof changed during measured samples.`);
    }
  }
  const expectedGeneration = {
    canonicalRoot: proof.canonicalRoot,
    runtimeFingerprint: proof.runtimeFingerprint,
    publication,
  };
  for (const observation of observationSet.observations) {
    if (canonicalJson(observation.generationReceipt) !== canonicalJson(expectedGeneration)) {
      throw new Error(`Observation '${observation.taskId}' is not bound to the arm publication identity; only a live runtime can produce the generation receipt.`);
    }
    if (!Array.isArray(observation.freshnessModes)
      || observation.freshnessModes.length === 0
      || observation.freshnessModes.some((mode) => !NO_SYNC_FRESHNESS_MODES.has(mode))) {
      throw new Error(`Observation '${observation.taskId}' lacks authoritative no-sync freshness evidence; only a live runtime can produce it.`);
    }
    const response = requireRecord(observation.response, `Observation '${observation.taskId}' response`);
    const hints = requireRecord(response.hints, `Observation '${observation.taskId}' response.hints`);
    const debugSearch = requireRecord(hints.debugSearch, `Observation '${observation.taskId}' debugSearch trace`);
    requireRecord(debugSearch.candidateSurvival, `Observation '${observation.taskId}' candidateSurvival trace`);
  }
}

export function runBaselineCapture(options) {
  const repo = fs.realpathSync(options.repo ?? process.cwd());
  if (options.partition !== 'tuning') throw new Error("Baseline capture only permits --partition tuning.");
  if (!options.denyHeldout) throw new Error('Baseline capture requires --deny-heldout.');
  if (!COMMIT.test(options['baseline-commit'] ?? '')) throw new Error('--baseline-commit must be a lowercase 40-character Git commit.');
  if (!SHA256.test(options['baseline-tree-sha256'] ?? '')) throw new Error('--baseline-tree-sha256 must be a lowercase SHA-256 digest.');
  for (const key of ['manifest', 'observations', 'detached-worktree', 'out']) {
    if (!options[key]) throw new Error(`--${key} is required.`);
  }

  const baselineCommit = options['baseline-commit'];
  const worktree = path.resolve(options['detached-worktree']);
  const out = path.resolve(options.out);
  const observationsPath = path.resolve(options.observations);
  const repoRelativeWorktree = path.relative(repo, worktree);
  if (repoRelativeWorktree === '' || (!repoRelativeWorktree.startsWith('..') && !path.isAbsolute(repoRelativeWorktree))) {
    throw new Error('Detached worktree must be outside the caller repository.');
  }
  const outRelative = path.relative(repo, out);
  if (outRelative === '' || (!outRelative.startsWith('..') && !path.isAbsolute(outRelative))) {
    throw new Error('Baseline evidence output must be outside the caller repository.');
  }
  const observationsRelative = path.relative(repo, observationsPath);
  if (observationsRelative === '' || (!observationsRelative.startsWith('..') && !path.isAbsolute(observationsRelative))) {
    throw new Error('Runtime observations must be outside the caller repository.');
  }
  if (!fs.existsSync(observationsPath)) throw new Error(`Runtime observations file does not exist: ${observationsPath}`);
  safeRemoveWorktree(repo, worktree);
  fs.mkdirSync(path.dirname(worktree), { recursive: true });
  run('git', ['-C', repo, 'worktree', 'add', '--detach', worktree, baselineCommit]);
  const canonicalWorktree = fs.realpathSync(worktree);
  requireOutside(path.relative(canonicalWorktree, out), 'Baseline evidence output');
  requireOutside(path.relative(canonicalWorktree, observationsPath), 'Runtime observations');
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

  const taskIds = selected.tasks.map((task) => task.id);
  const taskSuite = buildTuningTaskSuite(manifest, taskIds);
  const taskSuiteSha256 = sha256Canonical(taskSuite);
  const observationSet = JSON.parse(fs.readFileSync(observationsPath, 'utf8'));
  try {
    validateObservationSet(observationSet, taskIds);
  } catch (error) {
    throw new Error(`Runtime observation set failed validation against the generated tuning suite: ${error instanceof Error ? error.message : String(error)}`);
  }
  assertRuntimeProofsPresent(observationSet, taskIds, { canonicalWorktree, baselineCommit, taskSuiteSha256 });

  const captureScript = path.join(canonicalWorktree, 'scripts', 'satori-search-candidate-capture.mjs');
  if (!fs.existsSync(captureScript)) throw new Error('Baseline capture executor is missing from the detached worktree.');
  const suitePath = path.join(out, 'TASK_SUITE.json');
  const observationSetPath = path.join(out, 'OBSERVATION_SET.json');
  const captureOut = path.join(out, 'capture.json');
  fs.writeFileSync(suitePath, `${JSON.stringify(taskSuite, null, 2)}\n`);
  fs.writeFileSync(observationSetPath, `${JSON.stringify(observationSet, null, 2)}\n`);
  const captureArgs = [
    '--tasks', suitePath,
    '--observations', observationSetPath,
    '--out', captureOut,
    '--policy', 'baseline',
  ];
  const captureCommand = [process.execPath, captureScript, ...captureArgs];
  run(process.execPath, [captureScript, ...captureArgs], { cwd: canonicalWorktree, env: { ...process.env, SATORI_RANKING_V3_BASELINE_CAPTURE: '1' } });
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
    taskSuiteSha256,
    observationSetSha256: sha256Bytes(fs.readFileSync(observationSetPath)),
    captureSha256: sha256Bytes(fs.readFileSync(captureOut)),
    captureCommand,
    partition: 'tuning',
    heldoutDenied: true,
  };
  const receipt = { ...unsignedReceipt, receiptSha256: sha256Canonical(unsignedReceipt) };
  fs.writeFileSync(path.join(out, 'BASELINE_CAPTURE_RECEIPT.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function usage() {
  return 'Usage: node scripts/run-ranking-v3-baseline-capture.mjs --manifest <manifest.json> --partition tuning --deny-heldout --observations <runtime-observations.json> --baseline-commit <commit> --baseline-tree-sha256 <sha256> --detached-worktree <path> --out <dir>';
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
