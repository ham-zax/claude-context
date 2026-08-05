import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    SYMBOL_REGISTRY_SCHEMA_VERSION,
    buildSymbolRegistry,
    createSymbolInstanceId,
    createSymbolKey,
    writeRelationshipSidecar,
    writeSymbolRegistrySidecar,
} from '@zokizuan/satori-core';
import type { SymbolRecord, SymbolRegistryManifest } from '@zokizuan/satori-core';
import { ToolHandlers } from './handlers.js';
import { CapabilityResolver } from './capabilities.js';
import { IndexFingerprint } from '../config.js';

type HandlerContext = ConstructorParameters<typeof ToolHandlers>[0];
type HandlerSnapshotManager = ConstructorParameters<typeof ToolHandlers>[1];
type HandlerSyncManager = ConstructorParameters<typeof ToolHandlers>[2];
type MutableSnapshot = HandlerSnapshotManager & { readonly saveCalls: number; readonly removedCompletely: number };
type ToolTextResponse = { content?: Array<{ text?: string }> };
type JsonPayload = Record<string, unknown> & {
    status?: string;
    action?: string;
    reason?: string;
    outline?: {
        symbols?: Array<{
            callGraphHint?: {
                symbolRef?: unknown;
            };
        }>;
    };
};
type ToolHandlersTestOverrides = {
    startBackgroundIndexing: (codebasePath: string, forceReindex: boolean, writeCollectionName?: string) => void;
    evaluateReindexPreflight: (codebasePath: string) => unknown;
    clearAllCollectionsForForceReindex: (codebasePath: string) => Promise<unknown[]>;
    validateCompletionProof: (codebasePath: string) => Promise<unknown>;
    getPreparedAuthorityObservation: (codebasePath: string) => string | null;
    isPreparedNavigationReadCurrent: () => boolean;
    getPreparedReadCacheObservation: (codebasePath: string) => {
        observation: string | null;
        sourceObservation: string | null;
        unavailableReason?: string;
    };
};

const RUNTIME_FINGERPRINT: IndexFingerprint = {
    embeddingProvider: 'VoyageAI',
    embeddingModel: 'voyage-4-large',
    embeddingDimension: 1024,
    vectorStoreProvider: 'Milvus',
    schemaVersion: 'hybrid_v3'
};

const CAPABILITIES = new CapabilityResolver({
    name: 'test',
    version: '0.0.0',
    executionProfile: 'connected',
    networkPolicy: { kind: 'remote-allowed' },
    vectorStoreProvider: 'Milvus',
    encoderProvider: 'VoyageAI',
    encoderModel: 'voyage-4-large',
});

function withTempRepo<T>(fn: (repoPath: string) => Promise<T>): Promise<T> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-mcp-watchers-'));
    const repoPath = path.join(tempDir, 'repo');
    fs.mkdirSync(repoPath, { recursive: true });
    return fn(repoPath).finally(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
}

function createIndexMutationContext(): HandlerContext {
    let writeCollectionOverride: string | null = null;
    let preparedReceipt: object | null = null;
    return {
        getVectorStore: () => ({ checkCollectionLimit: async () => true }),
        resolveCollectionName: () => 'base_collection',
        resolveStagedCollectionName: (_path: string, generation: string) => `base_collection__gen_${generation}`,
        setWriteCollectionOverride: (_codebasePath: string, collectionName: string | null) => {
            writeCollectionOverride = collectionName;
        },
        prepareIndexCollection: async (
            codebasePath: string,
            binding: { generation: number; operationId: string },
            assertMutationCurrent?: () => void,
        ) => {
            assertMutationCurrent?.();
            assert.ok(writeCollectionOverride, 'Expected a staged write collection before preparation.');
            preparedReceipt = Object.freeze({
                canonicalRoot: path.resolve(codebasePath),
                collectionName: writeCollectionOverride,
                generation: binding.generation,
                operationId: binding.operationId,
            });
            return preparedReceipt;
        },
        discardPreparedIndexCollection: (receipt: object) => {
            if (receipt === preparedReceipt) {
                preparedReceipt = null;
            }
        },
        getActiveIndexedCollectionName: async () => null,
        clearIndexCompletionMarker: async () => undefined,
        pruneIndexedCollectionFamily: async () => [],
        pruneUnprovenStagedCollectionFamily: async () => [],
    } as unknown as HandlerContext;
}

async function withTempStateRoot<T>(fn: (stateRoot: string) => Promise<T>): Promise<T> {
    const previousStateRoot = process.env.SATORI_STATE_ROOT;
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-mcp-watchers-state-'));
    process.env.SATORI_STATE_ROOT = stateRoot;
    try {
        return await fn(stateRoot);
    } finally {
        if (previousStateRoot === undefined) {
            delete process.env.SATORI_STATE_ROOT;
        } else {
            process.env.SATORI_STATE_ROOT = previousStateRoot;
        }
        fs.rmSync(stateRoot, { recursive: true, force: true });
    }
}

function createFunctionSymbol(input: {
    file: string;
    name: string;
    startLine: number;
    endLine: number;
    fileHash: string;
}): SymbolRecord {
    const symbolKey = createSymbolKey({
        relativePath: input.file,
        language: 'typescript',
        kind: 'function',
        qualifiedName: input.name,
        parentQualifiedNamePath: [],
    });
    const span = { startLine: input.startLine, endLine: input.endLine };
    return {
        symbolKey,
        symbolInstanceId: createSymbolInstanceId({
            symbolKey,
            fileHash: input.fileHash,
            span,
            extractorVersion: 'extractor-v1',
        }),
        language: 'typescript',
        kind: 'function',
        name: input.name,
        qualifiedName: input.name,
        label: `function ${input.name}()`,
        file: input.file,
        span,
        parentQualifiedNamePath: [],
        fileHash: input.fileHash,
        extractorVersion: 'extractor-v1',
    };
}

async function writeNavigationSidecars(input: {
    stateRoot: string;
    repoPath: string;
    symbols: SymbolRecord[];
}) {
    const manifest: SymbolRegistryManifest = {
        schemaVersion: SYMBOL_REGISTRY_SCHEMA_VERSION,
        normalizedRootPath: input.repoPath,
        rootFingerprint: 'watchers-root-fingerprint',
        indexPolicyHash: 'watchers-policy',
        languageRouterVersion: 'router-v1',
        extractorVersion: 'extractor-v1',
        relationshipVersion: 'relationship-v1',
        builtAt: '2026-06-17T00:00:00.000Z',
        files: input.symbols.map((symbol) => ({
            path: symbol.file,
            hash: symbol.fileHash,
            language: symbol.language,
            symbolCount: 1,
            definitionStatus: 'definitions_present',
        })),
    };
    const registry = buildSymbolRegistry({ manifest, symbols: input.symbols });
    const registryResult = await writeSymbolRegistrySidecar({
        stateRoot: input.stateRoot,
        registry,
    });
    await writeRelationshipSidecar({
        stateRoot: input.stateRoot,
        normalizedRootPath: input.repoPath,
        symbolRegistryManifestHash: registryResult.manifestHash,
        relationshipVersion: 'relationship-v1',
        builtAt: '2026-06-17T00:00:00.000Z',
        files: registry.manifest.files,
        records: [],
    });
    return registry;
}

function createMutableSnapshot(repoPath: string, initialStatus: 'not_found' | 'indexed' | 'indexing' = 'indexed'): MutableSnapshot {
    let currentStatus = initialStatus;
    let removedCompletely = 0;
    let saveCalls = 0;
    const removeCodebaseCompletely = () => {
        removedCompletely += 1;
        currentStatus = 'not_found';
    };

    return {
        get saveCalls() {
            return saveCalls;
        },
        get removedCompletely() {
            return removedCompletely;
        },
        getAllCodebases: () => currentStatus === 'not_found'
            ? []
            : [{ path: repoPath, info: { status: currentStatus, lastUpdated: '2026-03-16T00:00:00.000Z' } }],
        getIndexedCodebases: () => currentStatus === 'indexed' ? [repoPath] : [],
        getIndexingCodebases: () => currentStatus === 'indexing' ? [repoPath] : [],
        getCodebaseStatus: () => currentStatus,
        getCodebaseInfo: () => currentStatus === 'not_found'
            ? undefined
            : { status: currentStatus, lastUpdated: '2026-03-16T00:00:00.000Z' },
        getCodebaseCallGraphSidecar: () => ({ version: 'v3' }),
        getIndexingProgress: () => currentStatus === 'indexing' ? 0 : undefined,
        ensureFingerprintCompatibilityOnAccess: () => ({ allowed: true, changed: false }),
        setCodebaseIndexing: () => {
            currentStatus = 'indexing';
        },
        setCodebaseIndexed: () => {
            currentStatus = 'indexed';
        },
        setCodebaseIndexManifest: () => undefined,
        commitCodebaseLifecycleMutation: (mutate: () => void, beforeCommit?: () => void) => {
            beforeCommit?.();
            mutate();
            beforeCommit?.();
            saveCalls += 1;
            return true;
        },
        removeCodebaseCompletely,
        markCodebaseCleared: removeCodebaseCompletely,
        saveCodebaseSnapshot: () => {
            saveCalls += 1;
        },
        setCodebaseIndexFailed: () => undefined,
    } as unknown as MutableSnapshot;
}

function createWatchRecorder(options: {
    pendingEvent?: boolean;
    initialCoverage?: 'ready' | 'starting';
    coveredEventAfterObservationReads?: number;
} = {}) {
    const touched: string[] = [];
    const unwatched: string[] = [];
    const operations: string[] = [];
    let coverage = options.initialCoverage ?? 'ready';
    let ensureCalls = 0;
    let observationReads = 0;
    return {
        touched,
        unwatched,
        operations,
        get ensureCalls() {
            return ensureCalls;
        },
        syncManager: {
            ensureFreshness: async () => {
                ensureCalls += 1;
                operations.push('ensure');
                return {
                    mode: 'synced',
                    checkedAt: new Date('2026-03-16T00:00:00.000Z').toISOString(),
                    thresholdMs: 0,
                    stats: { added: 0, removed: 0, modified: 0 }
                };
            },
            getWatchDebounceMs: () => 2000,
            getWatcherObservation: () => {
                observationReads += 1;
                const coveredEventObserved = options.coveredEventAfterObservationReads !== undefined
                    && observationReads > options.coveredEventAfterObservationReads;
                return {
                    observedEventEpoch: options.pendingEvent || coveredEventObserved ? 1 : 0,
                    comparedThroughEventEpoch: coveredEventObserved ? 1 : 0,
                    latestEpochByReason: {
                        source_changed: options.pendingEvent || coveredEventObserved ? 1 : 0,
                        ignore_rules_changed: 0,
                        directory_changed: 0,
                    },
                    coverage,
                    pending: options.pendingEvent === true,
                };
            },
            touchWatchedCodebase: async (codebasePath: string) => {
                touched.push(codebasePath);
                operations.push('touch');
                coverage = 'ready';
            },
            unwatchCodebase: async (codebasePath: string) => {
                unwatched.push(codebasePath);
            }
        } as unknown as HandlerSyncManager
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function parsePayload(response: ToolTextResponse): JsonPayload {
    const text = response?.content?.[0]?.text;
    assert.equal(typeof text, 'string');
    const parsed: unknown = JSON.parse(text as string);
    assert.equal(isRecord(parsed), true);
    return parsed as JsonPayload;
}

test('handleIndexCodebase touches the watch list when create starts successfully', async () => {
    await withTempRepo(async (repoPath) => {
        const snapshot = createMutableSnapshot(repoPath, 'not_found');
        const watch = createWatchRecorder();
        const context = createIndexMutationContext();

        const handlers = new ToolHandlers(context, snapshot, watch.syncManager, RUNTIME_FINGERPRINT, CAPABILITIES);
        (handlers as unknown as ToolHandlersTestOverrides).startBackgroundIndexing = () => undefined;

        const response = await handlers.handleIndexCodebase({ path: repoPath });
        const payload = parsePayload(response);

        assert.equal(payload.status, 'ok');
        assert.deepEqual(watch.touched, [repoPath]);
        assert.deepEqual(watch.unwatched, []);
    });
});

test('handleReindexCodebase touches the watch list when reindex starts successfully', async () => {
    await withTempRepo(async (repoPath) => {
        const snapshot = createMutableSnapshot(repoPath, 'indexed');
        const watch = createWatchRecorder();
        const context = createIndexMutationContext();

        const handlers = new ToolHandlers(context, snapshot, watch.syncManager, RUNTIME_FINGERPRINT, CAPABILITIES);
        const overrides = handlers as unknown as ToolHandlersTestOverrides;
        overrides.evaluateReindexPreflight = () => ({
            outcome: 'reindex_required',
            warnings: [],
            confidence: 'high'
        });
        overrides.clearAllCollectionsForForceReindex = async () => [];
        overrides.startBackgroundIndexing = () => undefined;

        const response = await handlers.handleReindexCodebase({ path: repoPath });
        const payload = parsePayload(response);

        assert.equal(payload.action, 'reindex');
        assert.equal(payload.status, 'ok');
        assert.deepEqual(watch.touched, [repoPath]);
    });
});

test('handleSyncCodebase touches the watch list on success and handleClearIndex unwatches on clear', async () => {
    await withTempRepo(async (repoPath) => {
        const snapshot = createMutableSnapshot(repoPath, 'indexed');
        const watch = createWatchRecorder();
        const context = {
            clearIndex: async () => undefined,
            resolveCollectionName: () => 'base_collection',
        } as unknown as HandlerContext;

        const handlers = new ToolHandlers(context, snapshot, watch.syncManager, RUNTIME_FINGERPRINT, CAPABILITIES);

        const syncResponse = await handlers.handleSyncCodebase({ path: repoPath });
        const syncPayload = parsePayload(syncResponse);
        assert.equal(syncPayload.status, 'ok');
        assert.deepEqual(watch.touched, [repoPath]);

        const clearResponse = await handlers.handleClearIndex({ path: repoPath });
        const clearPayload = parsePayload(clearResponse);
        assert.equal(clearPayload.status, 'ok');
        assert.deepEqual(watch.unwatched, [repoPath]);

        const outlineResponse = await handlers.handleFileOutline({
            path: repoPath,
            file: 'src/runtime.ts'
        });
        const outlinePayload = parsePayload(outlineResponse);
        assert.equal(outlinePayload.status, 'not_indexed');
        assert.equal(outlinePayload.reason, 'not_indexed');
    });
});

test('handleClearIndex clears a tracked repo after its directory was deleted', async () => {
    await withTempRepo(async (repoPath) => {
        const snapshot = createMutableSnapshot(repoPath, 'indexed');
        const watch = createWatchRecorder();
        const clearedPaths: string[] = [];
        const context = {
            clearIndex: async (pathToClear: string) => {
                clearedPaths.push(pathToClear);
            },
            resolveCollectionName: () => 'base_collection',
        } as unknown as HandlerContext;

        const handlers = new ToolHandlers(context, snapshot, watch.syncManager, RUNTIME_FINGERPRINT, CAPABILITIES);

        fs.rmSync(repoPath, { recursive: true, force: true });

        const clearResponse = await handlers.handleClearIndex({ path: repoPath });
        const clearPayload = parsePayload(clearResponse);

        assert.equal(clearPayload.status, 'ok');
        assert.deepEqual(clearedPaths, [repoPath]);
        assert.equal(snapshot.removedCompletely, 1);
        assert.equal(snapshot.saveCalls, 1);
        assert.deepEqual(watch.unwatched, [repoPath]);
    });
});

test('handleSearchCode touches the watch list only for successful indexed-root search responses', async () => {
    await withTempRepo(async (repoPath) => {
        const indexedSnapshot = createMutableSnapshot(repoPath, 'indexed');
        const indexedWatch = createWatchRecorder();
        const indexedContext = {
            getEmbeddingEngine: () => ({ getProvider: () => 'VoyageAI' }),
            semanticSearch: async () => [{
                content: 'return true;',
                relativePath: 'src/auth.ts',
                startLine: 1,
                endLine: 3,
                language: 'typescript',
                score: 0.9,
                indexedAt: '2026-03-16T00:00:00.000Z',
                symbolId: 'sym_auth',
                symbolLabel: 'function auth()'
            }]
        } as unknown as HandlerContext;

        const indexedHandlers = new ToolHandlers(indexedContext, indexedSnapshot, indexedWatch.syncManager, RUNTIME_FINGERPRINT, CAPABILITIES);
        const indexedOverrides = indexedHandlers as unknown as ToolHandlersTestOverrides;
        indexedOverrides.validateCompletionProof = async () => ({ outcome: 'valid' });
        indexedOverrides.getPreparedReadCacheObservation = () => ({
            observation: 'authority-observation',
            sourceObservation: 'source-observation',
        });

        const okResponse = await indexedHandlers.handleSearchCode({
            path: repoPath,
            query: 'auth',
            scope: 'runtime',
            resultMode: 'grouped',
            groupBy: 'symbol',
            limit: 5
        });
        const okPayload = parsePayload(okResponse);
        assert.equal(okPayload.status, 'ok');
        assert.deepEqual(indexedWatch.touched, [repoPath]);

        const notIndexedSnapshot = createMutableSnapshot(repoPath, 'not_found');
        const notIndexedWatch = createWatchRecorder();
        const notIndexedHandlers = new ToolHandlers(indexedContext, notIndexedSnapshot, notIndexedWatch.syncManager, RUNTIME_FINGERPRINT, CAPABILITIES);

        const notIndexedResponse = await notIndexedHandlers.handleSearchCode({
            path: repoPath,
            query: 'auth',
            scope: 'runtime',
            resultMode: 'grouped',
            groupBy: 'symbol',
            limit: 5
        });
        const notIndexedPayload = parsePayload(notIndexedResponse);
        assert.equal(notIndexedPayload.status, 'not_indexed');
        assert.deepEqual(notIndexedWatch.touched, []);
    });
});

test('handleSearchCode establishes watcher coverage before its freshness comparison', async () => {
    await withTempRepo(async (repoPath) => {
        const snapshot = createMutableSnapshot(repoPath, 'indexed');
        const watch = createWatchRecorder({ initialCoverage: 'starting' });
        const context = {
            getEmbeddingEngine: () => ({ getProvider: () => 'VoyageAI' }),
            semanticSearch: async () => [],
        } as unknown as HandlerContext;
        const handlers = new ToolHandlers(
            context,
            snapshot,
            watch.syncManager,
            RUNTIME_FINGERPRINT,
            CAPABILITIES,
        );
        const overrides = handlers as unknown as ToolHandlersTestOverrides;
        overrides.validateCompletionProof = async () => ({ outcome: 'valid' });
        overrides.getPreparedReadCacheObservation = () => ({
            observation: 'authority-observation',
            sourceObservation: 'source-observation',
        });

        const response = await handlers.handleSearchCode({
            path: repoPath,
            query: 'auth',
            scope: 'runtime',
            resultMode: 'grouped',
            groupBy: 'symbol',
            limit: 5,
        });
        const payload = parsePayload(response);

        assert.equal(payload.status, 'ok');
        assert.deepEqual(watch.operations.slice(0, 2), ['touch', 'ensure']);
    });
});

test('handleSearchCode retries once with a new source barrier and discards the first attempt', async () => {
    await withTempRepo(async (repoPath) => {
        const snapshot = createMutableSnapshot(repoPath, 'indexed');
        const watch = createWatchRecorder();
        let semanticSearchCalls = 0;
        const context = {
            getEmbeddingEngine: () => ({ getProvider: () => 'VoyageAI' }),
            semanticSearch: async () => {
                semanticSearchCalls += 1;
                return [{
                    content: 'return true;',
                    relativePath: 'src/auth.ts',
                    startLine: 1,
                    endLine: 3,
                    language: 'typescript',
                    score: 0.9,
                    indexedAt: '2026-03-16T00:00:00.000Z',
                    symbolId: 'sym_auth',
                    symbolLabel: 'function auth()',
                }];
            },
        } as unknown as HandlerContext;
        const handlers = new ToolHandlers(
            context,
            snapshot,
            watch.syncManager,
            RUNTIME_FINGERPRINT,
            CAPABILITIES,
        );
        const overrides = handlers as unknown as ToolHandlersTestOverrides;
        overrides.validateCompletionProof = async () => ({ outcome: 'valid' });
        overrides.getPreparedReadCacheObservation = () => ({
            observation: 'authority-observation',
            sourceObservation: semanticSearchCalls === 0
                ? 'source-before-first-retrieval'
                : 'source-after-first-retrieval',
        });

        const response = await handlers.handleSearchCode({
            path: repoPath,
            query: 'auth',
            scope: 'runtime',
            resultMode: 'grouped',
            groupBy: 'symbol',
            limit: 5,
        });
        const payload = parsePayload(response);

        assert.equal(payload.status, 'ok');
        assert.equal(payload.freshnessDecision, undefined);
        assert.equal(semanticSearchCalls, 4);
        assert.deepEqual(watch.touched, [repoPath]);
    });
});

test('handleSearchCode blocks without results when source changes during both attempts', async () => {
    await withTempRepo(async (repoPath) => {
        const snapshot = createMutableSnapshot(repoPath, 'indexed');
        const watch = createWatchRecorder();
        let semanticSearchCalls = 0;
        const context = {
            getEmbeddingEngine: () => ({ getProvider: () => 'VoyageAI' }),
            semanticSearch: async () => {
                semanticSearchCalls += 1;
                return [{
                    content: 'return true;',
                    relativePath: 'src/auth.ts',
                    startLine: 1,
                    endLine: 3,
                    language: 'typescript',
                    score: 0.9,
                    indexedAt: '2026-03-16T00:00:00.000Z',
                    symbolId: 'sym_auth',
                    symbolLabel: 'function auth()',
                }];
            },
        } as unknown as HandlerContext;
        const handlers = new ToolHandlers(
            context,
            snapshot,
            watch.syncManager,
            RUNTIME_FINGERPRINT,
            CAPABILITIES,
        );
        const overrides = handlers as unknown as ToolHandlersTestOverrides;
        overrides.validateCompletionProof = async () => ({ outcome: 'valid' });
        overrides.getPreparedReadCacheObservation = () => ({
            observation: 'authority-observation',
            sourceObservation: `source-after-${semanticSearchCalls}-retrievals`,
        });

        const response = await handlers.handleSearchCode({
            path: repoPath,
            query: 'auth',
            scope: 'runtime',
            resultMode: 'grouped',
            groupBy: 'symbol',
            limit: 5,
        });
        const payload = parsePayload(response);

        assert.equal(payload.status, 'not_ready');
        assert.equal(payload.reason, 'source_changed_during_request');
        assert.deepEqual(payload.results, []);
        assert.equal(payload.freshnessDecision, undefined);
        assert.equal(
            (payload.recommendedNextAction as { tool?: string } | undefined)?.tool,
            'search_codebase',
        );
        assert.equal(semanticSearchCalls, 4);
        assert.deepEqual(watch.touched, []);
    });
});

test('navigation remains non-mutating and blocks while watcher events are pending', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const filePath = path.join(repoPath, 'src', 'auth.ts');
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, 'export function auth() { return true; }\n', 'utf8');
        const authSymbol = createFunctionSymbol({
            file: 'src/auth.ts',
            name: 'auth',
            startLine: 1,
            endLine: 1,
            fileHash: 'watchers-auth-hash',
        });
        await writeNavigationSidecars({
            stateRoot,
            repoPath,
            symbols: [authSymbol],
        });

        const snapshot = createMutableSnapshot(repoPath, 'indexed');
        const watch = createWatchRecorder({ pendingEvent: true });
        const context = {} as unknown as HandlerContext;

        const handlers = new ToolHandlers(
            context,
            snapshot,
            watch.syncManager,
            RUNTIME_FINGERPRINT,
            CAPABILITIES
        );
        (handlers as unknown as ToolHandlersTestOverrides).validateCompletionProof = async () => ({ outcome: 'valid' });

        const outlineResponse = await handlers.handleFileOutline({
            path: repoPath,
            file: 'src/auth.ts'
        });
        const outlinePayload = parsePayload(outlineResponse);
        assert.equal(outlinePayload.status, 'not_ready');
        assert.equal(outlinePayload.reason, 'source_state_unverified');
        assert.equal(outlinePayload.outline, null);
        assert.deepEqual(outlinePayload.hints, {
            sync: { tool: 'manage_index', args: { action: 'sync', path: repoPath } },
        });
        const symbolRef = {
            file: authSymbol.file,
            symbolId: authSymbol.symbolInstanceId,
        };

        const graphResponse = await handlers.handleCallGraph({
            path: repoPath,
            symbolRef,
            direction: 'both',
            depth: 1,
            limit: 5
        });
        const graphPayload = parsePayload(graphResponse);
        assert.equal(graphPayload.status, 'not_ready');
        assert.equal(graphPayload.reason, 'source_state_unverified');
        assert.equal(graphPayload.supported, true);
        assert.deepEqual(graphPayload.nodes, []);
        assert.deepEqual(graphPayload.edges, []);
        assert.deepEqual((graphPayload.hints as Record<string, unknown>).sync, {
            tool: 'manage_index',
            args: { action: 'sync', path: repoPath },
        });

        assert.deepEqual(watch.touched, [repoPath, repoPath]);
        assert.equal(watch.ensureCalls, 0);
    }));
});

test('navigation discards an outline when a watcher event is consumed during construction', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        fs.mkdirSync(path.join(repoPath, 'src'), { recursive: true });
        const source = 'export function auth() { return true; }\n';
        fs.writeFileSync(path.join(repoPath, 'src', 'auth.ts'), source);
        const authSymbol = createFunctionSymbol({
            file: 'src/auth.ts',
            name: 'auth',
            startLine: 1,
            endLine: 1,
            fileHash: crypto.createHash('sha256').update(source).digest('hex'),
        });
        await writeNavigationSidecars({
            stateRoot,
            repoPath,
            symbols: [authSymbol],
        });

        const snapshot = createMutableSnapshot(repoPath, 'indexed');
        const watch = createWatchRecorder({ coveredEventAfterObservationReads: 2 });
        const handlers = new ToolHandlers(
            {} as unknown as HandlerContext,
            snapshot,
            watch.syncManager,
            RUNTIME_FINGERPRINT,
            CAPABILITIES,
        );
        (handlers as unknown as ToolHandlersTestOverrides).validateCompletionProof = async () => ({
            outcome: 'valid',
        });

        const response = await handlers.handleFileOutline({
            path: repoPath,
            file: 'src/auth.ts',
        });
        const payload = parsePayload(response);

        assert.equal(payload.status, 'not_ready');
        assert.equal(payload.reason, 'source_state_unverified');
        assert.equal(payload.outline, null);
        assert.equal(watch.ensureCalls, 0);
    }));
});

test('navigation never mixes a prepared publication with a later active publication', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        fs.mkdirSync(path.join(repoPath, 'src'), { recursive: true });
        const source = 'export function auth() { return true; }\n';
        fs.writeFileSync(path.join(repoPath, 'src', 'auth.ts'), source);
        const authSymbol = createFunctionSymbol({
            file: 'src/auth.ts',
            name: 'auth',
            startLine: 1,
            endLine: 1,
            fileHash: crypto.createHash('sha256').update(source).digest('hex'),
        });
        const registry = await writeNavigationSidecars({
            stateRoot,
            repoPath,
            symbols: [authSymbol],
        });

        const createHandlersWithAuthorityChange = () => {
            const watch = createWatchRecorder();
            let authority = 'publication-p';
            const authorityObservation = () => {
                const suffix = authority === 'publication-p' ? 'p' : 'q';
                return JSON.stringify({
                    vectorAuthority: `vector-${authority}`,
                    navigationAuthority: JSON.stringify({
                        binding: {
                            status: 'sealed',
                            generationId: `generation-${suffix}`,
                            sealHash: `seal-${suffix}`,
                        },
                        observation: {
                            status: 'valid',
                            token: JSON.stringify({
                                symbolRegistryManifestHash: `registry-${suffix}`,
                                relationshipManifestHash: `relationships-${suffix}`,
                                navigationSealHash: `seal-${suffix}`,
                            }),
                        },
                    }),
                    mutationGeneration: authority === 'publication-p' ? 1 : 2,
                });
            };
            const generationReceipt = {
                collectionName: 'collection-p',
                marker: { runId: 'run-p' },
                policy: {
                    canonicalRoot: repoPath,
                    policyHash: 'policy-p',
                },
                policyDocumentDigest: '1'.repeat(64),
                exactPayloadCount: 1,
                navigation: {
                    generationId: 'generation-p',
                    symbolRegistryManifestHash: 'registry-p',
                    relationshipManifestHash: 'relationships-p',
                    navigationSealHash: 'seal-p',
                },
                observations: {
                    profileFileToken: null,
                    policyFileToken: 'policy-token-p',
                    navigationToken: 'navigation-token-p',
                },
            } as never;
            const context = {
                getIndexAuthorityObservations: () => ({
                    vector: `vector-${authority}`,
                    navigation: `navigation-${authority}`,
                }),
            } as unknown as HandlerContext;
            const mutationLeaseCoordinator = {
                observe: () => ({
                    mutationActive: false,
                    generation: authority === 'publication-p' ? 1 : 2,
                }),
                getActiveLease: () => null,
            };
            const handlers = new ToolHandlers(
                context,
                createMutableSnapshot(repoPath, 'indexed'),
                watch.syncManager,
                RUNTIME_FINGERPRINT,
                CAPABILITIES,
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                null,
                mutationLeaseCoordinator as never,
            );
            const overrides = handlers as unknown as ToolHandlersTestOverrides;
            overrides.getPreparedAuthorityObservation = authorityObservation;
            const preparedRead = {
                state: 'ready' as const,
                root: {
                    path: repoPath,
                    info: { status: 'indexed' as const },
                },
                navigationAuthorityMode: 'canonical_v4' as const,
                generationReceipt,
                navigationStatus: 'valid' as const,
                preparedObservation: authorityObservation(),
            };
            const navigationHost = (
                handlers as unknown as {
                    navigationHandlers: {
                        host: Record<string, unknown>;
                    };
                }
            ).navigationHandlers.host as {
                prepareNavigationRead: () => Promise<typeof preparedRead>;
                loadPreparedNavigationSymbolsByFile: () => Promise<unknown>;
                loadPreparedNavigationCompatibility: () => Promise<unknown>;
                loadRegistryValidatedCallGraphSidecar: () => Promise<unknown>;
                buildRelationshipBackedCallGraph: () => Promise<unknown>;
            };
            navigationHost.prepareNavigationRead = async () => preparedRead;
            navigationHost.loadPreparedNavigationSymbolsByFile = async () => {
                const result = {
                    status: 'ok',
                    rootPath: repoPath,
                    manifestHash: 'registry-p',
                    registryManifestHash: 'registry-p',
                    registry,
                    symbols: [authSymbol],
                    warnings: [],
                };
                authority = 'publication-q';
                return result;
            };
            navigationHost.loadPreparedNavigationCompatibility = async () => ({
                rootPath: repoPath,
                registry: {
                    status: 'ok',
                    rootPath: repoPath,
                    manifestHash: 'registry-p',
                    registryManifestHash: 'registry-p',
                    registry,
                    warnings: [],
                },
                relationships: {
                    status: 'ok',
                    rootPath: repoPath,
                    manifestHash: 'relationships-p',
                    manifest: {
                        builtAt: '2026-06-17T00:00:00.000Z',
                    },
                    records: [],
                    warnings: [],
                },
            });
            navigationHost.loadRegistryValidatedCallGraphSidecar = async () => ({
                relationshipReady: true,
                relationshipBuiltAt: '2026-06-17T00:00:00.000Z',
            });
            navigationHost.buildRelationshipBackedCallGraph = async () => ({
                supported: true,
                direction: 'both',
                depth: 1,
                limit: 5,
                nodes: [{
                    symbolId: authSymbol.symbolInstanceId,
                    symbolLabel: authSymbol.label,
                    file: authSymbol.file,
                    language: authSymbol.language,
                    span: authSymbol.span,
                }],
                edges: [],
                notes: [],
                notesTruncated: false,
                totalNoteCount: 0,
                returnedNoteCount: 0,
                sidecar: {
                    builtAt: '2026-06-17T00:00:00.000Z',
                    nodeCount: 1,
                    edgeCount: 0,
                },
            });
            return { handlers, watch, preparedRead, setAuthority: (value: string) => {
                authority = value;
            } };
        };

        const outlineCandidate = createHandlersWithAuthorityChange();
        const outlineAuthority = outlineCandidate.handlers as unknown as {
            isPreparedNavigationReadCurrent: (preparedRead: unknown) => boolean;
        };
        assert.equal(
            outlineAuthority.isPreparedNavigationReadCurrent(outlineCandidate.preparedRead),
            true,
        );
        const missingCanonicalProof = {
            ...outlineCandidate.preparedRead,
            generationReceipt: undefined,
            preparedObservation: undefined,
        };
        assert.equal(
            outlineAuthority.isPreparedNavigationReadCurrent(missingCanonicalProof),
            false,
        );
        const sourceBackedProof = {
            ...outlineCandidate.preparedRead,
            navigationAuthorityMode:
                'source_backed_fingerprint_compatibility' as const,
            generationReceipt: undefined,
            sourceBackedNavigationBinding: {
                generationId: 'generation-p',
                symbolRegistryManifestHash: 'registry-p',
                relationshipManifestHash: 'relationships-p',
                navigationSealHash: 'seal-p',
            },
            sourceBackedNavigationBindingValidated: true as const,
        };
        assert.equal(
            outlineAuthority.isPreparedNavigationReadCurrent({
                ...sourceBackedProof,
                sourceBackedNavigationBindingValidated: undefined,
            }),
            false,
        );
        assert.equal(
            outlineAuthority.isPreparedNavigationReadCurrent(sourceBackedProof),
            true,
        );
        outlineCandidate.setAuthority('publication-q');
        assert.equal(
            outlineAuthority.isPreparedNavigationReadCurrent(outlineCandidate.preparedRead),
            false,
        );
        assert.equal(
            outlineAuthority.isPreparedNavigationReadCurrent(sourceBackedProof),
            false,
        );
        outlineCandidate.setAuthority('publication-p');
        const outlineResponse = await outlineCandidate.handlers.handleFileOutline({
            path: repoPath,
            file: 'src/auth.ts',
        });
        const outlinePayload = parsePayload(outlineResponse);
        assert.equal(outlinePayload.status, 'not_ready');
        assert.equal(outlinePayload.reason, 'source_state_unverified');
        assert.equal(outlinePayload.outline, null);
        assert.equal(outlineCandidate.watch.ensureCalls, 0);

        const graphCandidate = createHandlersWithAuthorityChange();
        const graphResponse = await graphCandidate.handlers.handleCallGraph({
            path: repoPath,
            symbolRef: {
                file: authSymbol.file,
                symbolId: authSymbol.symbolInstanceId,
            },
            direction: 'both',
            depth: 1,
            limit: 5,
        });
        const graphPayload = parsePayload(graphResponse);
        assert.equal(graphPayload.status, 'not_ready');
        assert.equal(graphPayload.reason, 'source_state_unverified');
        assert.equal(graphPayload.supported, true);
        assert.deepEqual(graphPayload.nodes, []);
        assert.deepEqual(graphPayload.edges, []);
        assert.equal(graphCandidate.watch.ensureCalls, 0);
    }));
});
