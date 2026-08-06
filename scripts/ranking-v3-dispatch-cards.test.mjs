import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildCardManifest,
  loadTaskCatalog,
  validateCardManifest,
} from './ranking-v3-dispatch-cards.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAN = path.join(ROOT, 'docs/plans/SATORI_RANKING_POLICY_V3_PLAN.md');
const CATALOG = path.join(ROOT, 'round-contracts');
const COMMIT = '1'.repeat(40);
const TREE_DIGEST = '2'.repeat(64);

function baseInput() {
  return {
    scopeId: 'gate0-bootstrap',
    baselineCommit: COMMIT,
    dispatchCommit: COMMIT,
    dispatchTreeSha256: TREE_DIGEST,
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
