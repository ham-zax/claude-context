import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSemanticSearchCandidateTraceV2 } from './semantic-search-candidate-trace.js';

const valid = {
    schemaVersion: 'semantic_search_candidate_trace_v2',
    candidateId: 'candidate-1',
    rawDenseRank: 1,
    rawLexicalRank: null,
    rawFallbackLexicalRank: null,
    coreFusionRank: 1,
};

test('rejects_unknown_trace_v2_keys', () => {
    assert.deepEqual(parseSemanticSearchCandidateTraceV2(valid), valid);
    assert.throws(
        () => parseSemanticSearchCandidateTraceV2({ ...valid, unknown: true }),
        /unknown|exact keys/i,
    );
});
