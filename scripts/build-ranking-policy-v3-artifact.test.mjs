import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { trainResidualModelV1 } from './train-ranking-residual.mjs';
import { buildRankingPolicyV3Artifact } from './build-ranking-policy-v3-artifact.mjs';
import { verifyRankingPolicyV3ArtifactValue } from './verify-ranking-policy-artifact.mjs';

const COMMIT = 'a'.repeat(40);
const SHA = (seed) => crypto.createHash('sha256').update(seed).digest('hex');
const TARGET_NONE = { providerTarget: 'none', serviceClass: 'offline_linux_x64' };
const TARGET_FIXED = {
    providerTarget: 'fixed',
    serviceClass: 'offline_linux_x64',
    providerKey: 'voyage',
    rerankerIdentity: 'rerank-v1',
    rerankerProjectionIdentity: 'proj-v1',
    providerConfigurationDigest: 'd'.repeat(64),
};

function residualModel() {
    return trainResidualModelV1({
        foldManifest: {
            trainingFoldManifestSha256: SHA('fold'),
            featureOrder: ['f1', 'f2'],
            featureRows: [[1, 0.5], [0.5, 1], [0.25, 0.75]],
            targets: [0, 0, 0],
        },
        createdFromCommit: COMMIT,
        trainingCodeSha256: SHA('code'),
        trainingContractSha256: SHA('contract'),
        maximumResidual: 1,
    });
}

function canonicalTargetDigest(target) {
    return crypto.createHash('sha256')
        .update(JSON.stringify(Object.keys(target).sort().reduce((acc, key) => {
            acc[key] = target[key];
            return acc;
        }, {})))
        .digest('hex');
}

function selection(outcome, target) {
    return {
        schemaVersion: 'ranking_e3_selection_receipt_v1',
        receiptType: 'e3_selection',
        outcome,
        selectedFoldContenderSha256: SHA('contender'),
        qualificationTargetSha256: canonicalTargetDigest(target),
        ...(outcome === 'selected_provider_derived' ? { providerRequestContractSha256: SHA('contract') } : {}),
        e3InputSealSha256: SHA('seal'),
        decisionContractSha256: SHA('decision'),
    };
}

function baseInput(overrides = {}) {
    return {
        residualModel: residualModel(),
        selectedModeReceipt: selection('selected_disabled', TARGET_NONE),
        qualificationTarget: TARGET_NONE,
        featureContractSha256: SHA('feature'),
        runtimeScoringContractId: 'search_scoring_runtime_v1',
        retrievalContractId: 'search_retrieval_contract_v1',
        trainingManifestSha256: SHA('manifest'),
        trainingCodeSha256: SHA('code'),
        trainingContractSha256: SHA('contract'),
        createdFromCommit: COMMIT,
        ...overrides,
    };
}

test('builds_only_selected_mode_from_refit_and_sealed_authorities', () => {
    // Disabled selection: no provider fields anywhere.
    const disabled = buildRankingPolicyV3Artifact(baseInput());
    assert.equal(disabled.schemaVersion, 'ranking_policy_v3');
    assert.equal(disabled.policyId, 'search_ranking_policy_v3');
    assert.deepEqual(disabled.neuralReorderPolicy, { mode: 'disabled' });
    assert.deepEqual(disabled.applicability.supportedProviderKeys, []);
    assert.equal(Object.hasOwn(disabled.applicability, 'rerankerProjectionIdentity'), false);
    assert.equal(Object.hasOwn(disabled.applicability, 'providerConfigurationDigest'), false);
    assert.equal(Object.hasOwn(disabled.applicability, 'providerRequestContractSha256'), false);
    assert.equal(disabled.residualModelSha256.length, 64);
    assert.equal(Object.hasOwn(disabled, 'artifactSha256'), false, 'artifact carries no self-hash');

    // Provider-derived selection: exactly one supported provider + sealed contract digest.
    const providerDerived = buildRankingPolicyV3Artifact(baseInput({
        selectedModeReceipt: selection('selected_provider_derived', TARGET_FIXED),
        qualificationTarget: TARGET_FIXED,
    }));
    assert.deepEqual(providerDerived.neuralReorderPolicy.mode, 'provider_derived');
    assert.equal(providerDerived.neuralReorderPolicy.providerKey, 'voyage');
    assert.deepEqual(providerDerived.applicability.supportedProviderKeys, ['voyage']);
    assert.equal(providerDerived.applicability.rerankerProjectionIdentity, 'proj-v1');
    assert.equal(providerDerived.applicability.providerConfigurationDigest, 'd'.repeat(64));

    // The D3 verifier independently accepts the built artifact bytes and
    // reproduces its canonical digest.
    const verification = verifyRankingPolicyV3ArtifactValue(disabled);
    assert.equal(verification.schemaVersion, 'ranking_policy_v3');
    assert.equal(verification.artifactSha256.length, 64);
    assert.equal(
        verification.artifactSha256,
        verifyRankingPolicyV3ArtifactValue(disabled).artifactSha256,
        'canonical digest is reproducible',
    );
});

test('rejects_unselected_or_mismatched_authorities', () => {
    // Provider-derived selection requires a fixed target (receipt binds the supplied none target).
    assert.throws(() => buildRankingPolicyV3Artifact(baseInput({
        selectedModeReceipt: selection('selected_provider_derived', TARGET_NONE),
        qualificationTarget: TARGET_NONE,
    })), /fixed qualification target/);

    // Provider-derived selection bound to a foreign target digest is rejected first.
    assert.throws(() => buildRankingPolicyV3Artifact(baseInput({
        selectedModeReceipt: {
            ...selection('selected_provider_derived', TARGET_NONE),
            qualificationTargetSha256: 'f'.repeat(64),
        },
        qualificationTarget: TARGET_NONE,
    })), /qualification target/);

    // Selection receipt must bind the supplied target digest.
    const foreignTarget = { ...TARGET_NONE };
    assert.throws(() => buildRankingPolicyV3Artifact(baseInput({
        selectedModeReceipt: {
            ...selection('selected_disabled', TARGET_NONE),
            qualificationTargetSha256: 'f'.repeat(64),
        },
        qualificationTarget: foreignTarget,
    })), /qualification target/);

    // Non-selection receipts are rejected.
    assert.throws(() => buildRankingPolicyV3Artifact(baseInput({
        selectedModeReceipt: { schemaVersion: 'x', receiptType: 'offline_qualification', outcome: 'rejected' },
    })), /E3 selection receipt/);

    // Tampered weights fail the A5 residual parser (exact-key + weight length).
    assert.throws(() => buildRankingPolicyV3Artifact(baseInput({
        residualModel: { ...residualModel(), weights: [1] },
    })));
});
