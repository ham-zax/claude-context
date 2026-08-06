import assert from 'node:assert/strict';
import test from 'node:test';
import type { VectorCandidate, VectorDocument } from '../vectordb';
import {
    fuseVectorCandidatesWithRrf,
    fuseVectorCandidatesWithRrfEvidence,
    VECTOR_CANDIDATE_RRF_K_V1,
} from './vector-candidate-fusion.js';

function candidate(id: string, score: number, relativePath = `src/${id}.ts`): VectorCandidate {
    const document: VectorDocument = {
        id,
        vector: [],
        content: id,
        relativePath,
        startLine: 1,
        endLine: 1,
        fileExtension: '.ts',
        metadata: {},
    };
    return { document, score };
}

test('trace_records_raw_arm_and_core_fusion_ranks_without_product_change', () => {
    const input = {
        dense: [candidate('shared', 9), candidate('dense', 8)],
        lexical: [candidate('lexical', 7), candidate('shared', 6)],
        fallbackLexical: [candidate('fallback', 5), candidate('shared', 4)],
        k: VECTOR_CANDIDATE_RRF_K_V1,
        limit: 3,
    } as const;
    const baseline = fuseVectorCandidatesWithRrf(input);
    const observed = fuseVectorCandidatesWithRrfEvidence(input);
    assert.deepEqual(observed.candidates, baseline);
    assert.deepEqual(observed.traces, [
        { schemaVersion: 'semantic_search_candidate_trace_v2', candidateId: 'dense', rawDenseRank: 2, rawLexicalRank: null, rawFallbackLexicalRank: null, coreFusionRank: 3 },
        { schemaVersion: 'semantic_search_candidate_trace_v2', candidateId: 'fallback', rawDenseRank: null, rawLexicalRank: null, rawFallbackLexicalRank: 1, coreFusionRank: null },
        { schemaVersion: 'semantic_search_candidate_trace_v2', candidateId: 'lexical', rawDenseRank: null, rawLexicalRank: 1, rawFallbackLexicalRank: null, coreFusionRank: 2 },
        { schemaVersion: 'semantic_search_candidate_trace_v2', candidateId: 'shared', rawDenseRank: 1, rawLexicalRank: 2, rawFallbackLexicalRank: 2, coreFusionRank: 1 },
    ]);
});

test('fallback_lexical_rank_is_not_misreported_as_primary_lexical_rank', () => {
    const fallback = candidate('fallback-only', 9);
    const observed = fuseVectorCandidatesWithRrfEvidence({
        dense: [],
        lexical: [],
        fallbackLexical: [fallback],
        k: VECTOR_CANDIDATE_RRF_K_V1,
        limit: 1,
    });
    assert.deepEqual(observed.candidates.map((item) => item.document.id), ['fallback-only']);
    assert.deepEqual(observed.traces, [{
        schemaVersion: 'semantic_search_candidate_trace_v2',
        candidateId: 'fallback-only',
        rawDenseRank: null,
        rawLexicalRank: null,
        rawFallbackLexicalRank: 1,
        coreFusionRank: 1,
    }]);
});
