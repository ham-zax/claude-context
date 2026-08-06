import assert from 'node:assert/strict';
import test from 'node:test';
import { retainRawValidatedRerankEvidenceV1 } from './search-rerank-evidence-retention.js';

const sha = (character: string): string => character.repeat(64);

test('retains_one_complete_raw_validated_response_without_normalization', () => {
    const retained = retainRawValidatedRerankEvidenceV1({
        serviceClass: 'offline_linux_x64',
        providerKey: 'provider-a',
        rerankerIdentity: 'reranker-a',
        rerankerProjectionIdentity: 'projection-a',
        providerConfigurationDigest: sha('a'),
        providerRequestContractSha256: sha('b'),
        baselineAdmissionSetSha256: sha('c'),
        canonicalRequestSha256: sha('d'),
        canonicalResponseSha256: sha('e'),
        requestCandidateIds: ['c1', 'c2', 'c3'],
        response: {
            schemaVersion: 'validated_rerank_response_v1',
            orderedCandidates: [
                { candidateId: 'c2', rawScore: 10 },
                { candidateId: 'c1', rawScore: 8 },
                { candidateId: 'c3', rawScore: -1 },
            ],
        },
        outcome: { status: 'complete', timeoutMs: 5000, attempts: 1 },
    });

    assert.deepEqual(retained.response.orderedCandidates, [
        { candidateId: 'c2', rawScore: 10 },
        { candidateId: 'c1', rawScore: 8 },
        { candidateId: 'c3', rawScore: -1 },
    ]);
    assert.deepEqual(retained.requestCandidateIds, ['c1', 'c2', 'c3']);
    const serialized = JSON.stringify(retained);
    assert.doesNotMatch(serialized, /percentile|normalized|margin/i);
    assert.throws(() => retainRawValidatedRerankEvidenceV1({
        ...retained,
        normalizedTopToSecondMargin: 0.4,
    } as never), /exact keys|derived/i);
});
