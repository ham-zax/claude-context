import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canonicalizeRankingPolicyArtifactV3,
    parseFoldContenderDescriptorV1,
    parseRankingPolicyV3Artifact,
    parseResidualModelV1,
} from './ranking-policy-artifact.js';

const sha = 'a'.repeat(64);
const normalization = {
    schemaVersion: 'ranking_normalization_contract_v1',
    featureOrder: ['a'],
    means: [0],
    scales: [1],
    missingValuePolicy: 'indicator_zero_fill',
};
const residual = {
    schemaVersion: 'ranking_residual_model_v1',
    featureSchema: 'search_features_v1',
    createdFromCommit: 'b'.repeat(40),
    trainingFoldManifestSha256: sha,
    trainingCodeSha256: sha,
    trainingContractSha256: sha,
    normalization,
    weights: [0.1],
    residualBounds: { maximumResidual: 0.15 },
};

test('distinguishes_residual_descriptor_and_final_artifact_and_binds_r1_2_fields', () => {
    assert.equal(parseResidualModelV1(residual).schemaVersion, 'ranking_residual_model_v1');
    const descriptor = parseFoldContenderDescriptorV1({
        schemaVersion: 'ranking_fold_contender_v1',
        mode: 'provider_derived',
        residualModelSha256: sha,
        qualificationTargetSha256: sha,
        providerRequestContractSha256: sha,
        evaluationFoldManifestSha256: sha,
    });
    assert.equal(descriptor.mode, 'provider_derived');
    const artifact = {
        schemaVersion: 'ranking_policy_v3',
        policyId: 'search_ranking_policy_v3',
        featureSchema: 'search_features_v1',
        createdFromCommit: 'b'.repeat(40),
        trainingManifestSha256: sha,
        trainingCodeSha256: sha,
        trainingContractSha256: sha,
        qualificationTargetSha256: sha,
        residualModelSha256: sha,
        normalization,
        weights: [0.1],
        residualBounds: { maximumResidual: 0.15 },
        neuralReorderPolicy: {
            mode: 'provider_derived',
            providerKey: 'provider',
            minimumCandidates: 2,
            minimumNormalizedTopToSecondMargin: 0.1,
        },
        applicability: {
            mode: 'provider_derived',
            baselinePolicyIdentity: 'search_candidate_final_score_v2',
            featureContractSha256: sha,
            runtimeScoringContractId: 'runtime-v1',
            retrievalContractId: 'retrieval-v1',
            supportedProviderKeys: ['provider'],
            rerankerProjectionIdentity: 'projection-v1',
            providerConfigurationDigest: sha,
            providerRequestContractSha256: sha,
        },
    };
    const options = { expectedProviderRequestContractSha256: sha, expectedQualificationTargetSha256: sha };
    const parsedArtifact = parseRankingPolicyV3Artifact(artifact, options);
    assert.equal(parsedArtifact.applicability.mode, 'provider_derived');
    if (parsedArtifact.applicability.mode !== 'provider_derived') throw new Error('expected provider-derived artifact');
    assert.equal(parsedArtifact.applicability.providerRequestContractSha256, sha);
    assert.equal(canonicalizeRankingPolicyArtifactV3(artifact, options), canonicalizeRankingPolicyArtifactV3(parseRankingPolicyV3Artifact(artifact, options), options));
    assert.throws(() => parseRankingPolicyV3Artifact({ ...artifact, applicability: { ...artifact.applicability, providerRequestContractSha256: 'c'.repeat(64) } }, options), /request contract/i);
    assert.throws(() => parseRankingPolicyV3Artifact(artifact), /requires expectedProviderRequestContractSha256/i);
});
