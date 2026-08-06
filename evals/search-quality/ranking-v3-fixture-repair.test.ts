import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runSearchQualityEvaluation } from './search-quality-evaluation.js';

const testPath = fileURLToPath(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(testPath), '../..');

// R0.1A regression guard (§7.6): the deterministic search-quality fixture had
// three stale seams at the frozen base:
//   1. hermetic CapabilityResolver config missing required ContextMcpConfig
//      fields (executionProfile, networkPolicy, vectorStoreProvider) -> TypeError
//      in resolveRerankerProvider;
//   2. no prepared-read source observation (syncManager/getPreparedReadObservation
//      absent, no mutation-lease coordinator, no index-authority observations)
//      -> every workload returned source_state_unverified;
//   3. type-level drift (SymbolRegistryManifestFile.definitionStatus missing,
//      SymbolRecord.relativePath vs file, config fields) that left the harness
//      un-typecheckable under strict inference.
// The repair is confined to evals/search-quality/ — production files are
// unchanged. This test proves all workloads are ok, expected owner ranks
// match, the corpus stays hash-bound and deterministic, and the evaluation
// leaves production paths untouched.
test('repairs_all_three_stale_fixture_seams_without_product_changes', async () => {
    const productionPaths = ['packages', 'scripts', '.github'];
    const porcelain = () => spawnSync(
        'git',
        ['status', '--porcelain', '--', ...productionPaths],
        { cwd: workspaceRoot, encoding: 'utf8' },
    ).stdout.trim();

    const productionBefore = porcelain();

    const first = await runSearchQualityEvaluation(workspaceRoot);
    const second = await runSearchQualityEvaluation(workspaceRoot);

    // Seam 1 + 2: every workload and limit is ok (no TypeError, no
    // source_state_unverified), with the fixed hermetic contract intact.
    assert.equal(first.workloadCount, 19);
    assert.equal(first.results.length, first.workloadCount * first.limits.length);
    assert.equal(first.results.every((result) => result.status === 'ok'), true);
    assert.equal(first.results.every((result) => result.toolCalls === 1), true);

    // Seam 3: the corpus is hash-bound and deterministic across runs.
    assert.match(first.fixtureManifestSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(first.results, second.results);
    assert.deepEqual(first.summary, second.summary);
    assert.deepEqual(first.repository, second.repository);

    // Expected owner ranks match the fixture contract.
    assert.equal(
        first.results.every((result) => result.ownerAvailableInInitialSearch === (result.ownerRank !== null)),
        true,
    );
    const splitOwnerResults = first.results.filter((result) => (
        result.workloadId === 'split_owner_relevant_body'
    ));
    assert.equal(splitOwnerResults.length, first.limits.length);
    assert.equal(splitOwnerResults.every((result) => (
        result.provider.rerankedCandidateIds.includes('resilient.tailChunk')
    )), true);
    assert.equal(splitOwnerResults.every((result) => result.ownerRank === 1), true);
    const conceptualWhereIsResults = first.results.filter((result) => (
        result.workloadId === 'conceptual_where_is'
    ));
    assert.equal(conceptualWhereIsResults.length, first.limits.length);
    assert.equal(conceptualWhereIsResults.every((result) => (
        result.routeObservation.selectedRoute === 'conceptual'
        && result.routeObservation.semanticExpansionAttempted
    )), true);

    // Production files unchanged: the hermetic evaluation never dirties
    // production paths (its fixture repo lives under a temp root).
    assert.equal(porcelain(), productionBefore);
});
