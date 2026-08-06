import assert from 'node:assert/strict';
import test from 'node:test';
import { SemanticSearchService } from './semantic-search-service.js';
import type { SemanticSearchCandidateTraceV2 } from './semantic-search-candidate-trace.js';
import type { VectorCandidate, VectorDatabase } from '../vectordb';

function candidate(id: string, score: number): VectorCandidate {
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
        },
    };
}

const DENSE = [candidate('a', 0.9), candidate('b', 0.7)];
const LEXICAL = [candidate('b', 0.8), candidate('c', 0.6)];

function makeService() {
    const vectorDatabase = {
        retrieveDense: async () => [...DENSE],
        retrieveLexical: async () => [...LEXICAL],
    } as unknown as VectorDatabase;
    const embedding = { embedQuery: async () => ({ vector: new Float32Array(4) }) } as never;
    const service = new SemanticSearchService({
        getVectorDatabase: () => vectorDatabase,
        embeddingAccess: {
            getEmbedding: () => embedding,
            assertEmbeddingIdentityCurrent: () => undefined,
        },
        authority: {
            proveVectorGeneration: async () => ({ collectionName: 'test-collection' }) as never,
            revalidateProvenVectorGeneration: async () => ({ collectionName: 'test-collection' }) as never,
            isPreparedReceiptBoundToCurrentAuthority: () => true,
        },
        isHybridEnabled: () => true,
        canonicalizeCodebasePath: (codebasePath: string) => codebasePath,
    });
    return service as unknown as {
        searchWithReceipt: (
            receipt: unknown,
            request: unknown,
            query?: string,
            topK?: number,
            threshold?: number,
            filter?: unknown,
            requestBoundReceipt?: boolean,
            candidateTraceConsumer?: unknown,
            candidateTraceMaxEntries?: number,
            candidateTraceOptions?: unknown,
            diagnosticCandidateArmsConsumer?: unknown,
            candidateTraceV2Consumer?: (trace: SemanticSearchCandidateTraceV2) => void,
        ) => Promise<unknown[]>;
    };
}

test('trace_v2_records_raw_arm_and_core_fusion_ranks_in_service_without_product_change', async () => {
    const service = makeService();
    const traces: SemanticSearchCandidateTraceV2[] = [];
    const results = await service.searchWithReceipt(
        undefined,
        { codebasePath: '/repo', query: 'test query', retrievalMode: 'hybrid', topK: 5 },
        undefined,
        5,
        0.5,
        undefined,
        false,
        undefined,
        160,
        {},
        undefined,
        (trace) => traces.push(trace),
    );

    assert.ok(results.length > 0, 'hybrid search must return results');
    const byId = new Map(traces.map((trace) => [trace.candidateId, trace]));
    for (const result of results) {
        const trace = byId.get(result.candidateId);
        assert.ok(trace, `missing v2 trace for ${result.candidateId}`);
        assert.equal(trace.schemaVersion, 'semantic_search_candidate_trace_v2');
        assert.equal(trace.rawDenseRank === null, !DENSE.some((item) => item.document.id === result.candidateId));
        assert.equal(trace.rawLexicalRank === null, !LEXICAL.some((item) => item.document.id === result.candidateId));
        assert.ok(Number.isSafeInteger(trace.coreFusionRank) && trace.coreFusionRank >= 1);
    }
});
