import assert from 'node:assert/strict';
import test from 'node:test';
import { parseValidatedRerankResponseV1 } from './rerank-evidence.js';

test('rejects_incomplete_duplicate_foreign_or_non_finite_provider_response', () => {
    const expected = ['a', 'b', 'c'];
    const parsed = parseValidatedRerankResponseV1({
        schemaVersion: 'validated_rerank_response_v1',
        orderedCandidates: [
            { candidateId: 'b', rawScore: 0.8 },
            { candidateId: 'a', rawScore: 0.7 },
            { candidateId: 'c', rawScore: 0.1 },
        ],
    }, expected);
    assert.deepEqual(parsed.orderedCandidates.map((item) => item.candidateId), ['b', 'a', 'c']);
    assert.throws(() => parseValidatedRerankResponseV1({ ...parsed, orderedCandidates: parsed.orderedCandidates.slice(0, 2) }, expected), /complete|missing/i);
    assert.throws(() => parseValidatedRerankResponseV1({ ...parsed, orderedCandidates: [parsed.orderedCandidates[0], parsed.orderedCandidates[0], parsed.orderedCandidates[2]] }, expected), /duplicate/i);
    assert.throws(() => parseValidatedRerankResponseV1({ ...parsed, orderedCandidates: [{ candidateId: 'foreign', rawScore: 1 }, ...parsed.orderedCandidates.slice(1)] }, expected), /foreign/i);
    assert.throws(() => parseValidatedRerankResponseV1({ ...parsed, orderedCandidates: [{ candidateId: 'b', rawScore: Number.NaN }, ...parsed.orderedCandidates.slice(1)] }, expected), /finite/i);
});
