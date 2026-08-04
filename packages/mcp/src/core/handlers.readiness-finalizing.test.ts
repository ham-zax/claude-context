import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ToolHandlers } from './handlers.js';
import { CapabilityResolver } from './capabilities.js';
import { IndexFingerprint } from '../config.js';

type HandlerContext = ConstructorParameters<typeof ToolHandlers>[0];
type HandlerSnapshotManager = ConstructorParameters<typeof ToolHandlers>[1];
type HandlerSyncManager = ConstructorParameters<typeof ToolHandlers>[2];

const RUNTIME_FINGERPRINT: IndexFingerprint = {
    embeddingProvider: 'VoyageAI',
    embeddingModel: 'voyage-4-large',
    embeddingDimension: 1024,
    embeddingArtifactDigest: null,
    embeddingNormalizationPolicy: 'provider_output_v1',
    vectorStoreProvider: 'Milvus',
    schemaVersion: 'hybrid_v3',
    parserVersion: 'parser-v1',
    extractorVersion: 'extractor-v1',
    relationshipVersion: 'relationships-v1',
    embeddingProjectionVersion: 'embedding-projection-v1',
    lexicalProjectionVersion: 'lexical-projection-v1',
};

const CAPABILITIES_NO_RERANK = new CapabilityResolver({
    name: 'test',
    version: '0.0.0',
    executionProfile: 'connected',
    networkPolicy: { kind: 'remote-allowed' },
    vectorStoreProvider: 'Milvus',
    encoderProvider: 'VoyageAI',
    encoderModel: 'voyage-4-large',
});

function withTempRepo<T>(fn: (repoPath: string) => Promise<T>): Promise<T> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-mcp-readiness-'));
    const repoPath = path.join(tempDir, 'repo');
    fs.mkdirSync(repoPath, { recursive: true });
    return fn(repoPath).finally(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
}

function buildIndexingHarness(repoPath: string, indexingPercentage: number) {
    const indexingInfo = {
        status: 'indexing',
        indexingPercentage,
        lastUpdated: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    };
    const context = {
        getEmbeddingEngine: () => ({ getProvider: () => 'VoyageAI' }),
        semanticSearch: async () => {
            throw new Error('semanticSearch should not run while indexing or finalizing');
        },
    } as unknown as HandlerContext;
    const snapshotManager = {
        getAllCodebases: () => [{ path: repoPath, info: indexingInfo }],
        getCodebaseInfo: () => indexingInfo,
        getCodebaseStatus: () => 'indexing',
        getIndexedCodebases: () => [],
        getIndexingCodebases: () => [repoPath],
        ensureFingerprintCompatibilityOnAccess: () => ({ allowed: true, changed: false }),
    } as unknown as HandlerSnapshotManager;
    const syncManager = {
        ensureFreshness: async () => {
            throw new Error('ensureFreshness should not run while indexing or finalizing');
        },
    } as unknown as HandlerSyncManager;
    const handlers = new ToolHandlers(
        context,
        snapshotManager,
        syncManager,
        RUNTIME_FINGERPRINT,
        CAPABILITIES_NO_RERANK,
        () => Date.parse('2026-01-01T01:00:00.000Z'),
    );
    return handlers;
}

test('handleSearchCode indexing payload keeps reason indexing below 100 percent', async () => {
    await withTempRepo(async (repoPath) => {
        const handlers = buildIndexingHarness(repoPath, 42);
        const response = await handlers.handleSearchCode({
            path: repoPath,
            query: 'runtime',
            scope: 'runtime',
            resultMode: 'grouped',
            groupBy: 'symbol',
            limit: 5,
        });
        const payload = JSON.parse(response.content[0]?.text || '{}');
        assert.equal(payload.status, 'not_ready');
        assert.equal(payload.reason, 'indexing');
        assert.equal(payload.retryAfterMs, undefined);
        assert.deepEqual(payload.results, []);
        assert.equal(payload.indexing?.progressPct, 42);
        assert.equal(payload.hints?.debugIndexing?.completionProof, 'marker_doc');
    });
});

test('handleSearchCode indexing payload reports finalizing with retryAfterMs at 100 percent', async () => {
    await withTempRepo(async (repoPath) => {
        const handlers = buildIndexingHarness(repoPath, 100);
        const response = await handlers.handleSearchCode({
            path: repoPath,
            query: 'runtime',
            scope: 'runtime',
            resultMode: 'grouped',
            groupBy: 'symbol',
            limit: 5,
        });
        const payload = JSON.parse(response.content[0]?.text || '{}');
        assert.equal(payload.status, 'not_ready');
        assert.equal(payload.reason, 'finalizing');
        assert.equal(payload.retryAfterMs, 1000);
        assert.deepEqual(payload.results, []);
        assert.equal(payload.rankedSetDigest, undefined);
        assert.equal(payload.continuation, undefined);
        assert.equal(payload.indexing?.progressPct, 100);
        assert.equal(payload.hints?.debugIndexing?.completionProof, 'marker_doc');
        assert.equal(payload.recommendedNextAction?.tool, 'manage_index');
        assert.equal(payload.recommendedNextAction?.args?.action, 'status');
        assert.equal(payload.recommendedNextAction?.args?.path, repoPath);
    });
});
