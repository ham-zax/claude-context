import assert from 'node:assert/strict';
import test from 'node:test';
import {
    fuseVectorCandidatesWithRrf,
    orderVectorCandidateArm,
} from './vector-candidate-fusion.js';
import type { SemanticSearchCandidateTraceV2 } from './semantic-search-candidate-trace.js';
import type { VectorCandidate } from '../vectordb';

function candidate(id: string, score: number, extra?: Partial<VectorCandidate['document']>): VectorCandidate {
    return {
        score,
        document: {
            id,
            relativePath: `src/${id}.ts`,
            startLine: 1,
            endLine: 10,
            fileExtension: 'ts',
            content: `content of ${id}`,
            metadata: {},
            ...extra,
        },
    };
}

test('trace_records_raw_arm_and_core_fusion_ranks_without_product_change', () => {
    const dense = [candidate('a', 0.9), candidate('b', 0.7), candidate('c', 0.5)];
    const lexical = [candidate('b', 0.8), candidate('c', 0.6), candidate('d', 0.4)];

    const baseline = fuseVectorCandidatesWithRrf({
        dense,
        lexical,
        k: 100,
        limit: 10,
    });

    const traces: SemanticSearchCandidateTraceV2[] = [];
    const traced = fuseVectorCandidatesWithRrf({
        dense,
        lexical,
        k: 100,
        limit: 10,
        traceV2: (trace) => traces.push(trace),
    });

    // Product output is byte-equal with and without the advisory trace sink.
    assert.deepEqual(traced, baseline, 'trace collection must not change product output');

    const byId = new Map(traces.map((trace) => [trace.candidateId, trace]));
    assert.equal(traces.length, baseline.length, 'one trace per fused result');

    const orderedDense = orderVectorCandidateArm(dense);
    const orderedLexical = orderVectorCandidateArm(lexical);
    for (const [index, result] of baseline.entries()) {
        const trace = byId.get(result.document.id);
        assert.ok(trace, `missing trace for ${result.document.id}`);
        assert.equal(trace.schemaVersion, 'semantic_search_candidate_trace_v2');
        assert.equal(trace.coreFusionRank, index + 1, 'core fusion rank is 1-based contiguous');
        const denseRank = orderedDense.findIndex((candidateItem) => candidateItem.document.id === result.document.id);
        const lexicalRank = orderedLexical.findIndex((candidateItem) => candidateItem.document.id === result.document.id);
        assert.equal(trace.rawDenseRank, denseRank === -1 ? null : denseRank + 1);
        assert.equal(trace.rawLexicalRank, lexicalRank === -1 ? null : lexicalRank + 1);
        assert.equal(trace.rawFallbackLexicalRank, null, 'no fallback arm in the base fusion');
    }

    // Fallback arm ranks are recorded when supplied and never change output.
    const fallbackRanks = new Map<string, number>([['d', 1], ['c', 2]]);
    const fallbackTraces: SemanticSearchCandidateTraceV2[] = [];
    const fallbackResult = fuseVectorCandidatesWithRrf({
        dense,
        lexical,
        k: 100,
        limit: 10,
        traceV2: (trace) => fallbackTraces.push(trace),
        fallbackLexicalRanks: fallbackRanks,
    });
    assert.deepEqual(fallbackResult, baseline, 'fallback rank map must not change product output');
    const fallbackById = new Map(fallbackTraces.map((trace) => [trace.candidateId, trace]));
    for (const [id, rank] of fallbackRanks) {
        assert.equal(fallbackById.get(id)?.rawFallbackLexicalRank, rank);
    }
});
