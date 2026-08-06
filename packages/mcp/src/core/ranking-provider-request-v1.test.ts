import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRankingProviderRequestV1, canonicalProviderRequestContractSha256V1, type FixedProviderTargetV1, type ProviderRequestContractV1 } from './ranking-provider-request-v1.js';

const contract: ProviderRequestContractV1 = {
    schemaVersion: 'ranking_provider_request_contract_v1',
    projectionIdentity: 'projection-v1',
    candidateOrder: 'baseline_admission_order',
    documentSerializationIdentity: 'document-json-v1',
    identityMappingIdentity: 'candidate-id-v1',
    maximumCandidateCount: 3,
    maximumPayloadUtf8Bytes: 1024,
    timeoutMs: 1000,
    maximumRetries: 1,
    canonicalizationIdentity: 'canonical_json_utf8_v1',
};
const target: FixedProviderTargetV1 = {
    providerTarget: 'fixed',
    serviceClass: 'online',
    providerKey: 'provider',
    rerankerIdentity: 'provider:model',
    rerankerProjectionIdentity: 'projection-v1',
    providerConfigurationDigest: 'a'.repeat(64),
};

test('builder_hashes_contract_and_rejects_expected_digest_mismatch', () => {
    const expected = canonicalProviderRequestContractSha256V1(contract);
    const result = buildRankingProviderRequestV1({
        contract,
        expectedProviderRequestContractSha256: expected,
        baselineAdmissionCandidates: [
            { candidateId: 'a', document: { text: 'A' } },
            { candidateId: 'b', document: { text: 'B' } },
        ],
        target,
    });
    assert.equal(result.providerRequestContractSha256, expected);
    assert.deepEqual(result.orderedCandidateIds, ['a', 'b']);
    assert.throws(() => buildRankingProviderRequestV1({
        contract,
        expectedProviderRequestContractSha256: 'f'.repeat(64),
        baselineAdmissionCandidates: [{ candidateId: 'a', document: { text: 'A' } }],
        target,
    }), /digest mismatch/i);
});
