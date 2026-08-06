import assert from 'node:assert/strict';
import test from 'node:test';
import { parseValidatedRerankResponseV1 } from './rerank-evidence.js';
import { retainValidatedRerankResponseV1 } from './search-rerank-evidence-retention.js';

const RESPONSE = {
    schemaVersion: 'validated_rerank_response_v1' as const,
    orderedCandidates: [
        { candidateId: 'candidate-a', rawScore: 0.92 },
        { candidateId: 'candidate-b', rawScore: 0.81 },
        { candidateId: 'candidate-c', rawScore: 0.77 },
    ],
};

test('retains_one_complete_raw_validated_response_without_normalization', () => {
    const retained = retainValidatedRerankResponseV1({
        queryId: 'query-1',
        response: RESPONSE,
        retainedAt: '2026-08-06T05:00:00.000Z',
    });

    // One complete raw validated response is retained.
    assert.equal(retained.schemaVersion, 'search_rerank_evidence_retention_v1');
    assert.equal(retained.queryId, 'query-1');
    assert.deepEqual(retained.response.orderedCandidates, RESPONSE.orderedCandidates);

    // No derived or normalized fields exist anywhere in the retention record.
    const EXACT_RETENTION_KEYS = ['schemaVersion', 'queryId', 'response', 'retainedAt'];
    assert.deepEqual(Object.keys(retained).sort(), [...EXACT_RETENTION_KEYS].sort());
    const EXACT_RESPONSE_KEYS = ['schemaVersion', 'orderedCandidates'];
    assert.deepEqual(Object.keys(retained.response).sort(), [...EXACT_RESPONSE_KEYS].sort());
    for (const candidate of retained.response.orderedCandidates) {
        assert.deepEqual(
            Object.keys(candidate).sort(),
            ['candidateId', 'rawScore'],
            'provider candidates must carry raw authority fields only',
        );
    }

    // The retained record round-trips through the A3 validated parser.
    const reparsed = parseValidatedRerankResponseV1(
        retained.response,
        RESPONSE.orderedCandidates.map((candidate) => candidate.candidateId),
    );
    assert.deepEqual(reparsed, retained.response);

    // Immutability: mutating the source after retention must not leak in.
    const mutable = structuredClone(RESPONSE);
    const immutableRetained = retainValidatedRerankResponseV1({
        queryId: 'query-2',
        response: mutable,
        retainedAt: '2026-08-06T05:00:00.000Z',
    });
    mutable.orderedCandidates[0].rawScore = 0.0001;
    assert.equal(immutableRetained.response.orderedCandidates[0].rawScore, 0.92);

    // Fail closed on malformed retention input.
    assert.throws(() => retainValidatedRerankResponseV1({
        queryId: '',
        response: RESPONSE,
        retainedAt: '2026-08-06T05:00:00.000Z',
    }));
    assert.throws(() => retainValidatedRerankResponseV1({
        queryId: 'q',
        response: { ...RESPONSE, schemaVersion: 'wrong' },
        retainedAt: '2026-08-06T05:00:00.000Z',
    }));
    assert.throws(() => retainValidatedRerankResponseV1({
        queryId: 'q',
        response: { ...RESPONSE, orderedCandidates: [] },
        retainedAt: '2026-08-06T05:00:00.000Z',
    }));
});
