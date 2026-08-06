import assert from 'node:assert/strict';
import test from 'node:test';
import type { VectorCandidate, VectorDocument } from '../vectordb';
import { buildSemanticSearchCandidateTracesV2 } from './semantic-search-service.js';

function candidate(id: string, score: number): VectorCandidate {
    const document: VectorDocument = { id, vector: [], content: id, relativePath: `${id}.ts`, startLine: 1, endLine: 1, fileExtension: '.ts', metadata: {} };
    return { document, score };
}

test('trace_records_raw_arm_and_core_fusion_ranks_without_product_change', () => {
    const traces = buildSemanticSearchCandidateTracesV2({
        dense: [candidate('a', 3), candidate('b', 2)],
        lexical: [candidate('b', 3), candidate('c', 2)],
        fallbackLexical: [candidate('d', 1)],
        result: [candidate('b', 1), candidate('a', 0.5), candidate('c', 0.25)],
    });
    assert.deepEqual(traces.map((trace) => [trace.candidateId, trace.coreFusionRank]), [
        ['a', 2], ['b', 1], ['c', 3], ['d', null],
    ]);
});
