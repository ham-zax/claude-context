import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildCardManifest,
  dispatchTreeSha256ForCommit,
  loadTaskCatalog,
  validateCardManifest,
} from './ranking-v3-dispatch-cards.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAN = path.join(ROOT, 'docs/plans/SATORI_RANKING_POLICY_V3_PLAN.md');
const CATALOG = path.join(ROOT, 'round-contracts');
const TASK_GRAPH = path.join(ROOT, 'evals/search-ranking/ranking-v3-authorities/TASK_GRAPH.json');
// Real commits present in this repository's history; dispatch tree digests are computed
// from the dispatch commit itself, so fixtures must reference resolvable commits.
const COMMIT_A = '966456c947047a6c7a96f1383b45e63ed45a8545';
const COMMIT_B = '29ee1bc9b8962bbe110b25f7948f37583b105fdf';

function baseInput() {
  return {
    scopeId: 'gate0-bootstrap',
    baselineCommit: COMMIT_A,
    dispatchCommit: COMMIT_A,
    qualificationTargetSha256: null,
    contractSealSha256: null,
    taskGraphSha256: null,
    taskGraphExpansionReceipts: [],
    prerequisiteReceipts: [],
    previousManifestSha256: null,
    includeNextGenerator: 'R1.0B',
  };
}

test('manifest_includes_next_boundary_generator_and_rejects_unknown_catalog_task', () => {
  const catalog = loadTaskCatalog(CATALOG);
  const manifest = buildCardManifest({
    ...baseInput(),
    planPath: PLAN,
    catalog,
  });

  assert.deepEqual(
    manifest.cards.map((card) => card.taskId),
    ['R0.2', 'R1.T0', 'R1.0', 'R1.0B'],
  );
  const generator = manifest.cards.find((card) => card.taskId === 'R1.0B');
  assert.ok(generator);
  assert.equal(generator.isBoundaryGenerator, true);
  assert.equal(generator.dispatchable, false);
  assert.equal(manifest.nextBoundaryGeneratorTaskId, 'R1.0B');
  assert.match(manifest.planSha256, /^[a-f0-9]{64}$/);
  assert.equal(validateCardManifest(manifest, { planPath: PLAN, catalog }), true);

  assert.throws(
    () => buildCardManifest({
      ...baseInput(),
      scopeId: 'custom-test-scope',
      scopeTaskIds: ['R0.2', 'UNKNOWN_TASK'],
      planPath: PLAN,
      catalog,
    }),
    /unknown catalog task/i,
  );
});

test('dispatch_tree_digest_is_deterministic_and_commit_bound', () => {
  const first = dispatchTreeSha256ForCommit(COMMIT_A);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(dispatchTreeSha256ForCommit(COMMIT_A), first);
  const other = dispatchTreeSha256ForCommit(COMMIT_B);
  assert.match(other, /^[a-f0-9]{64}$/);
  assert.notEqual(other, first);
});

test('dispatch_tree_digest_mismatch_is_rejected', () => {
  const catalog = loadTaskCatalog(CATALOG);
  // Self-consistent manifest whose dispatchTreeSha256 belongs to a DIFFERENT commit.
  const manifest = buildCardManifest({
    ...baseInput(),
    dispatchCommit: COMMIT_A,
    dispatchTreeSha256: dispatchTreeSha256ForCommit(COMMIT_B),
    planPath: PLAN,
    catalog,
  });
  assert.throws(
    () => validateCardManifest(manifest, { planPath: PLAN, catalog }),
    /dispatch tree digest mismatch/i,
  );
  // Recomputed from the dispatch commit: a correct manifest verifies.
  const good = buildCardManifest({ ...baseInput(), dispatchCommit: COMMIT_A, planPath: PLAN, catalog });
  assert.equal(validateCardManifest(good, { planPath: PLAN, catalog }), true);
});

test('task_graph_file_bytes_digest_is_rejected', () => {
  const catalog = loadTaskCatalog(CATALOG);
  // A manifest carrying the RAW FILE BYTES digest (the old, wrong representation)
  // must be rejected when the canonical task-graph digest is available.
  const fileBytesDigest = crypto.createHash('sha256').update(fs.readFileSync(TASK_GRAPH)).digest('hex');
  const wrong = buildCardManifest({
    ...baseInput(),
    taskGraphSha256: fileBytesDigest,
    planPath: PLAN,
    catalog,
  });
  assert.throws(
    () => validateCardManifest(wrong, { planPath: PLAN, catalog, taskGraphPath: TASK_GRAPH }),
    /task graph digest mismatch/i,
  );
  // Canonical digest computed from the graph file itself verifies.
  const good = buildCardManifest({ ...baseInput(), taskGraphPath: TASK_GRAPH, planPath: PLAN, catalog });
  assert.notEqual(good.taskGraphSha256, fileBytesDigest);
  assert.equal(validateCardManifest(good, { planPath: PLAN, catalog, taskGraphPath: TASK_GRAPH }), true);
});
