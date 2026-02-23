import test from 'node:test';
import assert from 'node:assert/strict';
import { searchCodebaseTool } from './search_codebase.js';
import { CapabilityResolver } from '../core/capabilities.js';
import { ContextMcpConfig } from '../config.js';
import { ToolContext } from './types.js';

function buildConfig(overrides: Partial<ContextMcpConfig> = {}): ContextMcpConfig {
    return {
        name: 'test',
        version: '1.0.0',
        encoderProvider: 'VoyageAI',
        encoderModel: 'voyage-4-large',
        encoderOutputDimension: 1024,
        voyageKey: 'voyage-key',
        milvusEndpoint: 'https://example.zilliz.com',
        milvusApiToken: 'token',
        rankerModel: 'rerank-2.5',
        ...overrides,
    };
}

function captureTelemetry(run: () => Promise<void>): Promise<string[]> {
    const lines: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    (process.stderr.write as any) = (chunk: any, ...args: any[]) => {
        const text = String(chunk);
        if (text.includes('[TELEMETRY]')) {
            lines.push(text.trim());
        }
        return originalWrite(chunk, ...args);
    };

    return run().finally(() => {
        (process.stderr.write as any) = originalWrite;
    }).then(() => lines);
}

test('search_codebase emits telemetry in non-rerank path', async () => {
    const capabilities = new CapabilityResolver(buildConfig());

    const ctx = {
        capabilities,
        reranker: null,
        toolHandlers: {
            handleSearchCode: async () => ({
                content: [{ type: 'text', text: 'Found 2 results for query: "auth" in codebase "/repo"' }],
                meta: {
                    searchDiagnostics: {
                        resultsBeforeFilter: 5,
                        resultsAfterFilter: 2,
                        excludedByIgnore: 3,
                    }
                }
            })
        }
    } as unknown as ToolContext;

    const telemetry = await captureTelemetry(async () => {
        const response = await searchCodebaseTool.execute({
            path: '/repo',
            query: 'auth',
            useReranker: false
        }, ctx);

        assert.equal(response.isError, undefined);
    });

    assert.equal(telemetry.length, 1);
    const payload = JSON.parse(telemetry[0].replace(/^\[TELEMETRY\]\s*/, ''));
    assert.equal(payload.event, 'search_executed');
    assert.equal(payload.reranker_used, false);
    assert.equal(payload.results_before_filter, 5);
    assert.equal(payload.results_after_filter, 2);
    assert.equal(payload.excluded_by_ignore, 3);
});

test('search_codebase returns capability error and emits telemetry when rerank forced but unavailable', async () => {
    const capabilities = new CapabilityResolver(buildConfig({ voyageKey: undefined }));

    const ctx = {
        capabilities,
        reranker: null,
        toolHandlers: {
            handleSearchCode: async () => ({
                content: [{ type: 'text', text: 'should not be called' }]
            })
        }
    } as unknown as ToolContext;

    const telemetry = await captureTelemetry(async () => {
        const response = await searchCodebaseTool.execute({
            path: '/repo',
            query: 'auth',
            useReranker: true
        }, ctx);

        assert.equal(response.isError, true);
        assert.match(response.content[0].text, /Reranking is unavailable/);
    });

    assert.equal(telemetry.length, 1);
    const payload = JSON.parse(telemetry[0].replace(/^\[TELEMETRY\]\s*/, ''));
    assert.equal(payload.reranker_used, false);
    assert.equal(typeof payload.error, 'string');
    assert.match(payload.error, /Reranking is unavailable/);
});

test('search_codebase rerank output renders scope line from raw result breadcrumbs', async () => {
    const capabilities = new CapabilityResolver(buildConfig());
    const ctx = {
        capabilities,
        reranker: {
            rerank: async () => [{ index: 0, relevanceScore: 0.9876 }],
            getModel: () => 'rerank-2.5'
        },
        toolHandlers: {
            handleSearchCode: async () => ({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        query: 'validate token',
                        resultCount: 1,
                        results: [{
                            index: 0,
                            language: 'typescript',
                            location: 'src/auth/manager.ts:120-150',
                            score: 0.75,
                            content: 'const decoded = verify(token);',
                            metadata: {
                                breadcrumbs: ['class AuthManager', 'async function validateSession(token: string)']
                            }
                        }],
                        documentsForReranking: ['const decoded = verify(token);']
                    })
                }]
            })
        }
    } as unknown as ToolContext;

    const response = await searchCodebaseTool.execute({
        path: '/repo',
        query: 'validate token',
        useReranker: true
    }, ctx);

    assert.equal(response.isError, undefined);
    const text = response.content[0]?.text || '';
    assert.match(text, /🧬 Scope: class AuthManager > async function validateSession\(token: string\)/);
});

test('search_codebase rerank output omits scope line when breadcrumbs are absent', async () => {
    const capabilities = new CapabilityResolver(buildConfig());
    const ctx = {
        capabilities,
        reranker: {
            rerank: async () => [{ index: 0, relevanceScore: 0.8877 }],
            getModel: () => 'rerank-2.5'
        },
        toolHandlers: {
            handleSearchCode: async () => ({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        query: 'token check',
                        resultCount: 1,
                        results: [{
                            index: 0,
                            language: 'typescript',
                            location: 'src/auth/manager.ts:90-95',
                            score: 0.7,
                            content: 'return true;',
                            metadata: {}
                        }],
                        documentsForReranking: ['return true;']
                    })
                }]
            })
        }
    } as unknown as ToolContext;

    const response = await searchCodebaseTool.execute({
        path: '/repo',
        query: 'token check',
        useReranker: true
    }, ctx);

    assert.equal(response.isError, undefined);
    const text = response.content[0]?.text || '';
    assert.doesNotMatch(text, /🧬 Scope:/);
});
