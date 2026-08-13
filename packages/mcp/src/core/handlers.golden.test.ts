import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
    SYMBOL_REGISTRY_SCHEMA_VERSION,
    buildSymbolRecordsForFile,
    buildSymbolRegistry,
    createSymbolInstanceId,
    createSymbolKey,
    resetSharedRuntimeNavigationStoreForTests,
    resolveNavigationSidecarRoot,
    writeNavigationSidecarGeneration,
    writeRelationshipSidecar,
    writeSymbolRegistrySidecar,
} from '@zokizuan/satori-core';
import type {
    ProvenGenerationReceipt,
    ProvenVectorGenerationReceipt,
    RelationshipRecord,
    SymbolRecord,
    SymbolRegistryManifest,
} from '@zokizuan/satori-core';
import { readFileTool } from '../tools/read_file.js';
import type { ToolContext } from '../tools/types.js';
import { createSessionWorkspacePolicy, type SessionWorkspacePolicy } from './session-workspace-policy.js';
import { ToolHandlers } from './handlers.js';
import { CapabilityResolver } from './capabilities.js';
import { IndexFingerprint } from '../config.js';
import type { MutationLeaseCoordinator } from './mutation-lease.js';

function fixtureWorkspacePolicy(repoPath: string): SessionWorkspacePolicy {
    return createSessionWorkspacePolicy({
        roots: [repoPath],
        homeDirectory: os.homedir(),
        stateRoot: process.env.SATORI_STATE_ROOT ?? path.join(os.homedir(), '.satori'),
    });
}


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
    stateRoot: path.join(os.tmpdir(), 'satori-test-state-root'),
    executionProfile: 'connected',
    networkPolicy: { kind: 'remote-allowed' },
    vectorStoreProvider: 'Milvus',
    encoderProvider: 'VoyageAI',
    encoderModel: 'voyage-4-large',
});

const PHASE_0_CONTRACT = JSON.parse(fs.readFileSync(path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../evals/agent-discovery/bounded-symbol-context-phase-0.json',
), 'utf8')) as {
    historicalExactOpen: {
        request: { mode: string };
        source: string;
        symbol: {
            file: string;
            name: string;
            startLine: number;
            endLine: number;
            label: string;
        };
        normalizedResponse: unknown;
    };
};

type GoldenContext = {
    repoPath: string;
    stateRoot?: string;
    symbols?: SymbolRecord[];
};

type HandlerContext = ConstructorParameters<typeof ToolHandlers>[0];
type HandlerSnapshotManager = ConstructorParameters<typeof ToolHandlers>[1];
type HandlerSyncManager = ConstructorParameters<typeof ToolHandlers>[2];
type ToolTextResponse = { content?: Array<{ text?: string }> };
type SearchFixtureResult = {
    content: string;
    relativePath: string;
    startLine: number;
    endLine: number;
    language: string;
    score: number;
    indexedAt: string;
    symbolId: string;
    symbolLabel: string;
};
type ToolHandlersTestOverrides = {
    validateCompletionProof: (repoPath: string) => Promise<Record<string, unknown>>;
    getPreparedReadCacheObservation: (repoPath: string) => {
        observation: string;
        sourceObservation: string;
    };
};

function withTempRepo<T>(fn: (repoPath: string) => Promise<T>): Promise<T> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-mcp-golden-'));
    const repoPath = path.join(tempDir, 'repo');
    fs.mkdirSync(path.join(repoPath, 'src'), { recursive: true });
    return fn(repoPath).finally(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
}

async function withTempStateRoot<T>(fn: (stateRoot: string) => Promise<T>): Promise<T> {
    const previousStateRoot = process.env.SATORI_STATE_ROOT;
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-mcp-golden-state-'));
    process.env.SATORI_STATE_ROOT = stateRoot;
    resetSharedRuntimeNavigationStoreForTests();
    try {
        return await fn(stateRoot);
    } finally {
        resetSharedRuntimeNavigationStoreForTests();
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
    language?: string;
    label?: string;
    kind?: SymbolRecord['kind'];
}): SymbolRecord {
    const language = input.language || 'typescript';
    const kind = input.kind || 'function';
    const qualifiedName = input.name;
    const parentQualifiedNamePath: string[] = [];
    const symbolKey = createSymbolKey({
        relativePath: input.file,
        language,
        kind,
        qualifiedName,
        parentQualifiedNamePath,
    });
    const span = { startLine: input.startLine, endLine: input.endLine };
    return {
        symbolKey,
        symbolInstanceId: createSymbolInstanceId({
            symbolKey,
            fileHash: input.fileHash,
            span,
            extractorVersion: 'test-extractor-v1',
        }),
        language,
        kind,
        name: input.name,
        qualifiedName,
        label: input.label || `function ${input.name}()`,
        file: input.file,
        span,
        parentQualifiedNamePath,
        fileHash: input.fileHash,
        extractorVersion: 'test-extractor-v1',
    };
}

function sha256Content(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function writeNavigationSidecars(input: {
    stateRoot: string;
    repoPath: string;
    symbols: SymbolRecord[];
    records?: RelationshipRecord[];
    relationshipManifestHash?: string;
    generation?: boolean;
}) {
    const filesByPath = new Map<string, { hash: string; language: string; symbolCount: number }>();
    for (const symbol of input.symbols) {
        const existing = filesByPath.get(symbol.file);
        if (existing) {
            existing.symbolCount += 1;
        } else {
            filesByPath.set(symbol.file, {
                hash: symbol.fileHash,
                language: symbol.language,
                symbolCount: 1,
            });
        }
    }

    const manifest: SymbolRegistryManifest = {
        schemaVersion: SYMBOL_REGISTRY_SCHEMA_VERSION,
        normalizedRootPath: input.repoPath,
        rootFingerprint: 'test-root-fingerprint',
        indexPolicyHash: 'test-policy',
        languageRouterVersion: 'test-router-v1',
        extractorVersion: 'test-extractor-v1',
        relationshipVersion: 'test-relationships-v1',
        builtAt: '2026-01-01T00:00:00.000Z',
        files: [...filesByPath.entries()].map(([file, metadata]) => ({
            path: file,
            hash: metadata.hash,
            language: metadata.language,
            symbolCount: metadata.symbolCount,
            definitionStatus: 'definitions_present',
        })),
    };

    const registry = buildSymbolRegistry({ manifest, symbols: input.symbols });
    if (input.generation) {
        const generation = await writeNavigationSidecarGeneration({
            stateRoot: input.stateRoot,
            registry,
            records: input.records || [],
            analysisByFile: new Map(manifest.files.map((file) => [file.path, {
                moduleBindings: [],
                callSites: [],
            }])),
        });
        return {
            registry,
            manifestHash: generation.manifestHash,
            relationshipManifestHash: generation.relationshipManifestHash,
            generationId: generation.generationId,
            generationRoot: path.join(generation.rootPath, 'generations', generation.generationId),
            navigationSealHash: generation.navigationSealHash,
        };
    }
    const registryResult = await writeSymbolRegistrySidecar({
        stateRoot: input.stateRoot,
        registry,
    });
    const relationshipResult = await writeRelationshipSidecar({
        stateRoot: input.stateRoot,
        normalizedRootPath: input.repoPath,
        symbolRegistryManifestHash: input.relationshipManifestHash || registryResult.manifestHash,
        relationshipVersion: 'test-relationships-v1',
        builtAt: '2026-01-01T00:00:00.000Z',
        files: manifest.files,
        records: input.records || [],
    });
    return {
        registry,
        manifestHash: registryResult.manifestHash,
        relationshipManifestHash: relationshipResult.manifestHash,
    };
}

async function writeSearchNavigationSidecars(input: {
    stateRoot: string;
    repoPath: string;
    relativePath: string;
    content: string;
    chunks: Array<{
        content: string;
        startLine: number;
        endLine: number;
        symbolLabel: string;
    }>;
}) {
    const fileHash = 'test-search-file-hash';
    const symbols = buildSymbolRecordsForFile({
        relativePath: input.relativePath,
        language: 'typescript',
        content: input.content,
        fileHash,
        extractorVersion: 'test-extractor-v1',
        chunks: input.chunks.map((chunk) => ({
            content: chunk.content,
            metadata: {
                startLine: chunk.startLine,
                endLine: chunk.endLine,
                language: 'typescript',
                filePath: input.relativePath,
                symbolLabel: chunk.symbolLabel,
            },
        })),
    });
    const { manifestHash } = await writeNavigationSidecars({
        stateRoot: input.stateRoot,
        repoPath: input.repoPath,
        symbols,
        records: [],
    });
    return { symbols, manifestHash, fileHash };
}

function createSnapshotManager(repoPath: string, info: Record<string, unknown> = { status: 'indexed' }): HandlerSnapshotManager {
    // Path-scoped lookups only: an unrestricted getter makes file paths look like
    // tracked roots and breaks prepared-generation identity (policy root !== entry path).
    const isTrackedRoot = (codebasePath: string): boolean => codebasePath === repoPath;
    return {
        getAllCodebases: () => [{ path: repoPath, info }],
        getIndexedCodebases: () => [repoPath],
        getIndexingCodebases: () => [],
        getCodebaseInfo: (codebasePath: string) => (isTrackedRoot(codebasePath) ? info : undefined),
        getCodebaseStatus: (codebasePath: string) => (
            isTrackedRoot(codebasePath) ? (info.status || 'indexed') : 'not_found'
        ),
        getCodebaseCallGraphSidecar: () => undefined,
        ensureFingerprintCompatibilityOnAccess: () => ({ allowed: true, changed: false }),
        saveCodebaseSnapshot: () => undefined,
    } as unknown as HandlerSnapshotManager;
}

type PreparedAuthorityFixture = {
    symbolRegistryManifestHash: string;
    relationshipManifestHash: string;
    generationId: string;
    generationRoot: string;
    navigationSealHash: string;
};

function createGenerationReceipt(
    repoPath: string,
    preparedAuthority: PreparedAuthorityFixture,
): ProvenGenerationReceipt {
    let canonicalRoot = repoPath;
    try {
        canonicalRoot = fs.realpathSync(repoPath);
    } catch {
        canonicalRoot = path.resolve(repoPath);
    }
    return {
        collectionName: 'hybrid_code_chunks_golden',
        marker: {
            kind: 'satori_index_completion_v3' as const,
            codebasePath: canonicalRoot,
            fingerprint: {
                embeddingProvider: 'VoyageAI',
                embeddingModel: 'voyage-code-3',
                embeddingDimension: 1024,
                embeddingArtifactDigest: null,
                embeddingNormalizationPolicy: 'provider_output_v1',
                vectorStoreProvider: 'LanceDB',
                schemaVersion: 'hybrid_v3',
                parserVersion: 'parser-v1',
                extractorVersion: 'extractor-v1',
                relationshipVersion: 'relationship-v1',
                embeddingProjectionVersion: 'embedding_projection_v1',
                lexicalProjectionVersion: 'lexical_projection_v1',
            },
            indexedFiles: 1,
            totalChunks: 1,
            completedAt: '2026-01-01T00:00:00.000Z',
            runId: 'golden-run-1',
            indexPolicyHash: 'policy-hash-golden',
            indexStatus: 'completed',
            navigation: { status: 'not_bound' },
        },
        policy: {
            canonicalRoot,
            profile: 'default' as const,
            customExtensions: [],
            customIgnorePatterns: [],
            fileBasedIgnorePatterns: [],
            supportedExtensions: [],
            effectiveIgnorePatterns: [],
            policyHash: 'policy-hash-golden',
            controlSignature: 'v1:.satoriignore:missing|.gitignore:missing|satori.toml:missing',
        },
        policyDocumentDigest: '1'.repeat(64),
        exactPayloadCount: 1,
        navigation: {
            generationId: preparedAuthority.generationId,
            generationRoot: preparedAuthority.generationRoot,
            symbolRegistryManifestHash: preparedAuthority.symbolRegistryManifestHash,
            relationshipManifestHash: preparedAuthority.relationshipManifestHash,
            navigationSealHash: preparedAuthority.navigationSealHash,
        },
        observations: {
            profileFileToken: null,
            policyFileToken: 'policy-token-golden',
            navigationToken: 'navigation-token-golden',
        },
    };
}

function createHandlers(
    repoPath: string,
    searchResults: SearchFixtureResult[] = [],
    preparedAuthority?: PreparedAuthorityFixture,
) {
    const generationReceipt = preparedAuthority
        ? createGenerationReceipt(repoPath, preparedAuthority)
        : {
            navigation: { navigationSealHash: 'a'.repeat(64) },
        };
    const resolvedGenerationReceipt = preparedAuthority
        ? generationReceipt as ProvenVectorGenerationReceipt
        : null;
    const vectorReceipt: ProvenVectorGenerationReceipt | undefined = preparedAuthority
        ? {
            collectionName: resolvedGenerationReceipt!.collectionName,
            marker: resolvedGenerationReceipt!.marker,
            policy: resolvedGenerationReceipt!.policy,
            policyDocumentDigest: resolvedGenerationReceipt!.policyDocumentDigest,
            exactPayloadCount: 1,
            observations: {
                profileFileToken: null,
                policyFileToken: 'policy-token-golden',
            },
        }
        : undefined;
    const context = {
        getEmbeddingEngine: () => ({ getProvider: () => 'VoyageAI' }),
        getVectorStore: () => ({ listCollections: async () => [] }),
        semanticSearch: async () => searchResults,
        ...(preparedAuthority
            ? {
                getIndexAuthorityObservations: () => ({
                    vector: 'vector-authority-golden',
                    navigation: 'navigation-authority-golden',
                }),
                revalidatePreparedGeneration: async () => ({
                    vectorReceipt,
                    navigationProof: { status: 'valid' as const },
                    generationReceipt,
                }),
            }
            : {}),
    } as unknown as HandlerContext;
    const syncManager = {
        ensureFreshness: async () => ({
            mode: 'skipped_recent',
            checkedAt: '2026-01-01T00:00:00.000Z',
            thresholdMs: 180000,
        }),
        touchWatchedCodebase: async () => undefined,
        ...(preparedAuthority
            ? {
                getPreparedReadObservation: () => ({
                    available: false as const,
                    reason: 'watcher_manager_not_started' as const,
                    freshnessEpoch: 1,
                }),
            }
            : {}),
    } as unknown as HandlerSyncManager;

    const snapshotManager = createSnapshotManager(repoPath);
    const mutationLeaseCoordinator = preparedAuthority
        ? {
            observe: () => ({ mutationActive: false, generation: 1 }),
            getActiveLease: () => null,
        } as unknown as MutationLeaseCoordinator
        : null;
    const handlers = new ToolHandlers(
        context,
        snapshotManager,
        syncManager,
        RUNTIME_FINGERPRINT,
        CAPABILITIES,
        () => Date.parse('2026-01-01T01:00:00.000Z'),
        undefined,
        null,
        undefined,
        undefined,
        null,
        mutationLeaseCoordinator,
    );
    const overrides = handlers as unknown as ToolHandlersTestOverrides;
    overrides.validateCompletionProof = async () => ({
        outcome: 'valid',
        navigationStatus: 'valid',
        ...(vectorReceipt ? { collectionName: vectorReceipt.collectionName, vectorReceipt } : {}),
        generationReceipt,
    });
    overrides.getPreparedReadCacheObservation = () => ({
        observation: 'golden-authority-observation',
        sourceObservation: 'golden-source-observation',
    });
    return { handlers, snapshotManager, syncManager };
}

function createFailedIndexHandlers(repoPath: string) {
    const failedInfo = {
        status: 'indexfailed',
        errorMessage: 'Interrupted indexing detected without completion marker proof.',
        lastAttemptedPercentage: 0,
        lastUpdated: '2026-06-19T12:15:18.574Z',
    };
    const context = {
        getEmbeddingEngine: () => ({ getProvider: () => 'VoyageAI' }),
        getVectorStore: () => ({ listCollections: async () => [] }),
        semanticSearch: async () => {
            throw new Error('semanticSearch should not run for failed indexes');
        },
    } as unknown as HandlerContext;
    const snapshotManager = {
        getAllCodebases: () => [{ path: repoPath, info: failedInfo }],
        getIndexedCodebases: () => [],
        getIndexingCodebases: () => [],
        getCodebaseInfo: () => failedInfo,
        getCodebaseStatus: () => 'indexfailed',
        getCodebaseCallGraphSidecar: () => undefined,
        ensureFingerprintCompatibilityOnAccess: () => ({ allowed: true, changed: false }),
        saveCodebaseSnapshot: () => undefined,
    } as unknown as HandlerSnapshotManager;
    const syncManager = {
        ensureFreshness: async () => {
            throw new Error('ensureFreshness should not run for failed indexes');
        },
        touchWatchedCodebase: async () => undefined,
    } as unknown as HandlerSyncManager;

    return {
        handlers: new ToolHandlers(
            context,
            snapshotManager,
            syncManager,
            RUNTIME_FINGERPRINT,
            CAPABILITIES,
            () => Date.parse('2026-06-19T12:20:00.000Z'),
        ),
        snapshotManager,
        syncManager,
    };
}

function createReadFileToolContext(input: {
    handlers: ToolHandlers;
    snapshotManager: ToolContext['snapshotManager'];
    syncManager: ToolContext['syncManager'];
    readFileMaxLines?: number;
    repoPath: string;
}): ToolContext {
    return {
        context: {} as ToolContext['context'],
        snapshotManager: input.snapshotManager,
        syncManager: input.syncManager,
        capabilities: CAPABILITIES,
        reranker: null,
        runtimeFingerprint: RUNTIME_FINGERPRINT,
        toolHandlers: input.handlers,
        readFileMaxLines: input.readFileMaxLines ?? 1000,
        workspacePolicy: createSessionWorkspacePolicy({
            roots: [input.repoPath],
            homeDirectory: os.homedir(),
            stateRoot: path.join(os.homedir(), '.satori'),
        }),
    };
}

function parsePayload(response: ToolTextResponse): unknown {
    return JSON.parse(response.content?.[0]?.text || '{}');
}

function symbolPlaceholder(symbol: SymbolRecord): string {
    return `<symbol:${symbol.kind}:${symbol.name}>`;
}

function symbolKeyPlaceholder(symbol: SymbolRecord): string {
    return `<symbol-key:${symbol.kind}:${symbol.name}>`;
}

function scrubGolden(value: unknown, context: GoldenContext): unknown {
    if (Array.isArray(value)) {
        return value.map((entry) => scrubGolden(entry, context));
    }
    if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, raw] of Object.entries(value)) {
            if (key === 'score' && typeof raw === 'number') {
                result[key] = '<score>';
                continue;
            }
            result[key] = scrubGolden(raw, context);
        }
        return result;
    }
    if (typeof value !== 'string') {
        return value;
    }

    let output = value;
    output = output.split(context.repoPath).join('<repo>');
    if (context.stateRoot) {
        output = output.split(context.stateRoot).join('<state>');
    }
    for (const symbol of context.symbols || []) {
        output = output.split(symbol.symbolInstanceId).join(symbolPlaceholder(symbol));
        output = output.split(symbol.symbolKey).join(symbolKeyPlaceholder(symbol));
    }
    output = output.replace(/[a-f0-9]{64}/g, '<hash>');
    return output;
}

test('golden MCP search_codebase grouped symbol result shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const relativePath = 'src/auth.ts';
        const filePath = path.join(repoPath, relativePath);
        const content = [
            'function normalizeToken(token: string) {',
            '  return token.trim();',
            '}',
            '',
            'function validateSession(token: string) {',
            '  return normalizeToken(token).length > 0;',
            '}',
            '',
        ].join('\n');
        fs.writeFileSync(filePath, content, 'utf8');
        const { symbols, manifestHash, fileHash } = await writeSearchNavigationSidecars({
            stateRoot,
            repoPath,
            relativePath,
            content,
            chunks: [
                {
                    content: 'function normalizeToken(token: string) {\n  return token.trim();\n}',
                    startLine: 1,
                    endLine: 3,
                    symbolLabel: 'function normalizeToken(token: string)',
                },
                {
                    content: 'function validateSession(token: string) {\n  return normalizeToken(token).length > 0;\n}',
                    startLine: 5,
                    endLine: 7,
                    symbolLabel: 'function validateSession(token: string)',
                },
            ],
        });
        const normalizeSymbol = symbols.find((symbol) => symbol.name === 'normalizeToken');
        const validateSymbol = symbols.find((symbol) => symbol.name === 'validateSession');
        assert.ok(normalizeSymbol);
        assert.ok(validateSymbol);
        await writeRelationshipSidecar({
            stateRoot,
            normalizedRootPath: repoPath,
            symbolRegistryManifestHash: manifestHash,
            relationshipVersion: 'test-relationships-v1',
            builtAt: '2026-01-01T00:00:00.000Z',
            files: [{
                path: relativePath,
                hash: fileHash,
                language: 'typescript',
                symbolCount: symbols.length,
                definitionStatus: 'definitions_present',
            }],
            records: [{
                sourceKey: validateSymbol.symbolKey,
                sourceInstanceId: validateSymbol.symbolInstanceId,
                targetKey: normalizeSymbol.symbolKey,
                targetInstanceId: normalizeSymbol.symbolInstanceId,
                type: 'CALLS',
                file: relativePath,
                span: { startLine: 6, endLine: 6 },
                confidence: 'high',
            }],
        });

        const { handlers } = createHandlers(repoPath, [{
            content: 'return normalizeToken(token).length > 0;',
            relativePath,
            startLine: 5,
            endLine: 7,
            language: 'typescript',
            score: 0.99,
            indexedAt: '2026-01-01T00:30:00.000Z',
            symbolLabel: validateSymbol.label,
            symbolId: validateSymbol.symbolKey,
        }]);

        const response = await handlers.handleSearchCode({
            path: repoPath,
            query: 'validate session',
            scope: 'runtime',
            resultMode: 'grouped',
            groupBy: 'symbol',
            limit: 5,
        });

        const payload = scrubGolden(parsePayload(response), {
            repoPath,
            stateRoot,
            symbols,
        });
        assert.deepEqual(payload, {
            formatVersion: 3,
            status: 'ok',
            path: '<repo>',
            codebaseRoot: '<repo>',
            query: 'validate session',
            scope: 'runtime',
            groupBy: 'symbol',
            limit: 5,
            resultMode: 'grouped',
            resultCounts: {
                requestedTotal: 5,
                effectiveFrozenTotal: 1,
                availableGroupCount: 1,
                returnedGroupCount: 1,
                remainingGroupCount: 0,
            },
            pagination: {
                totalGroupCount: 1,
                returnedGroupCount: 1,
                continuation: 'complete',
            },
            recommendedNextAction: {
                resultIndex: 0,
                tool: 'read_file',
                args: {
                    path: '<repo>/src/auth.ts',
                    mode: 'plain',
                    open_symbol: {
                        contractVersion: 2,
                        symbolId: '<symbol:function:validateSession>',
                        context: { preset: 'definition' },
                    },
                },
                reason: 'Open bounded symbol context for the highest-ranked concrete result.',
            },
            results: [{
                target: {
                    file: 'src/auth.ts',
                    span: { startLine: 5, endLine: 7 },
                    symbolId: '<symbol:function:validateSession>',
                },
                displayLabel: 'function validateSession(token: string)',
                language: 'typescript',
                symbolKind: 'function',
                score: '<score>',
                quality: {
                    owner: 'high',
                    semantic: 'medium',
                },
                navigation: {
                    graph: 'ready',
                    inbound: 'verify',
                    callerSearchTerm: 'validateSession',
                },
                preview: 'return normalizeToken(token).length > 0;',
            }],
        });
    }));
});

test('golden MCP file_outline ok shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const filePath = path.join(repoPath, 'src/runtime.ts');
        fs.writeFileSync(filePath, 'export function run() {\n  return true;\n}\n', 'utf8');
        const run = createFunctionSymbol({
            file: 'src/runtime.ts',
            name: 'run',
            startLine: 1,
            endLine: 3,
            fileHash: 'hash-runtime',
            label: 'function run()',
        });
        await writeNavigationSidecars({ stateRoot, repoPath, symbols: [run] });
        const { handlers } = createHandlers(repoPath);

        const response = await handlers.handleFileOutline({
            path: repoPath,
            file: 'src/runtime.ts',
        }, fixtureWorkspacePolicy(repoPath));

        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot, symbols: [run] });
        assert.deepEqual(payload, {
            status: 'ok',
            path: '<repo>',
            file: 'src/runtime.ts',
            outline: {
                symbols: [{
                    symbolId: '<symbol:function:run>',
                    symbolKey: '<symbol-key:function:run>',
                    name: 'run',
                    qualifiedName: 'run',
                    symbolLabel: 'function run()',
                    kind: 'function',
                    language: 'typescript',
                    file: 'src/runtime.ts',
                    span: { startLine: 1, endLine: 3 },
                    parentQualifiedNamePath: [],
                    parentResolution: 'not_applicable',
                    callGraphHint: {
                        supported: true,
                        validated: true,
                        validatedAt: '2026-01-01T01:00:00.000Z',
                        sidecarBuiltAt: '2026-01-01T00:00:00.000Z',
                        symbolRef: {
                            file: 'src/runtime.ts',
                            symbolId: '<symbol:function:run>',
                            symbolLabel: 'function run()',
                            span: { startLine: 1, endLine: 3 },
                        },
                    },
                }],
            },
            hasMore: false,
        });
    }));
});

test('golden MCP file_outline missing registry requires_reindex shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        fs.writeFileSync(path.join(repoPath, 'src/runtime.ts'), 'export function run() {}\n', 'utf8');
        const { handlers } = createHandlers(repoPath);

        const response = await handlers.handleFileOutline({
            path: repoPath,
            file: 'src/runtime.ts',
        }, fixtureWorkspacePolicy(repoPath));

        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot });
        assert.deepEqual(payload, {
            status: 'requires_reindex',
            reason: 'missing_symbol_registry',
            path: '<repo>',
            file: 'src/runtime.ts',
            outline: null,
            hasMore: false,
            message: "symbol registry manifest is missing\n\nRelationship-backed navigation sidecars are missing. Please run manage_index with {\"action\":\"repair\",\"path\":\"<repo>\"}.",
            hints: {
                repair: {
                    tool: 'manage_index',
                    args: { action: 'repair', path: '<repo>' },
                },
                reindex: {
                    tool: 'manage_index',
                    args: { action: 'reindex', path: '<repo>' },
                },
            },
        });
    }));
});

test('golden MCP file_outline unsupported language shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        fs.writeFileSync(path.join(repoPath, 'src/notes.txt'), 'plain text notes\n', 'utf8');
        const { handlers } = createHandlers(repoPath);

        const response = await handlers.handleFileOutline({
            path: repoPath,
            file: 'src/notes.txt',
        }, fixtureWorkspacePolicy(repoPath));

        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot });
        assert.deepEqual(payload, {
            status: 'unsupported',
            reason: 'unsupported_language',
            path: '<repo>',
            file: 'src/notes.txt',
            outline: null,
            hasMore: false,
            message: "File 'src/notes.txt' is not supported for sidecar outline. Supported extensions: .c, .cc, .ccm, .cjs, .cpp, .cppm, .cs, .cts, .cxx, .go, .h, .hh, .hpp, .hxx, .ixx, .java, .js, .jsx, .mjs, .mts, .py, .rs, .scala, .ts, .tsx.",
        });
    }));
});

test('golden MCP call_graph invalid symbol ref shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const { handlers } = createHandlers(repoPath);

        const response = await handlers.handleCallGraph({
            path: repoPath,
        }, fixtureWorkspacePolicy(repoPath));

        assert.equal(response.isError, true);
        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot });
        assert.deepEqual(payload, {
            status: 'not_found',
            supported: false,
            reason: 'invalid_symbol_ref',
            path: '<repo>',
            symbolRef: {
                file: '',
                symbolId: '',
            },
            direction: 'both',
            depth: 1,
            limit: 20,
            nodes: [],
            edges: [],
            notes: [],
            notesTruncated: false,
            totalNoteCount: 0,
            returnedNoteCount: 0,
            message: 'symbolRef.file is required.',
        });
    }));
});

test('golden MCP search_codebase invalid root shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const missingRoot = path.join(repoPath, 'missing-root');
        const { handlers } = createHandlers(repoPath);

        const response = await handlers.handleSearchCode({
            path: missingRoot,
            query: 'runtime',
            scope: 'runtime',
            resultMode: 'grouped',
            groupBy: 'symbol',
            rankingMode: 'auto_changed_first',
            limit: 10,
        });

        assert.equal(response.isError, true);
        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot });
        assert.deepEqual(payload, {
            formatVersion: 3,
            status: 'not_indexed',
            reason: 'not_indexed',
            path: '<repo>/missing-root',
            query: 'runtime',
            scope: 'runtime',
            groupBy: 'symbol',
            resultMode: 'grouped',
            limit: 10,
            message: "Path '<repo>/missing-root' does not exist. search_codebase requires an existing directory root or subdirectory.",
            results: [],
        });
    }));
});

test('golden MCP search_codebase failed index shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const { handlers } = createFailedIndexHandlers(repoPath);

        const response = await handlers.handleSearchCode({
            path: repoPath,
            query: 'runtime',
            scope: 'runtime',
            resultMode: 'grouped',
            groupBy: 'symbol',
            limit: 5,
        });

        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot });
        assert.deepEqual(payload, {
            formatVersion: 3,
            status: 'not_indexed',
            reason: 'index_failed',
            codebasePath: '<repo>',
            path: '<repo>',
            query: 'runtime',
            scope: 'runtime',
            groupBy: 'symbol',
            resultMode: 'grouped',
            limit: 5,
            message: "Codebase '<repo>' has a failed indexing attempt. Error: Interrupted indexing detected without completion marker proof. Failed at: 0.0% progress. Failed at: 2026-06-19T12:15:18.574Z. Satori will not serve semantic results from an unproven partial index. Run manage_index with {\"action\":\"create\",\"path\":\"<repo>\"} to restart indexing for this failed state.",
            indexingFailure: {
                errorMessage: 'Interrupted indexing detected without completion marker proof.',
                lastAttemptedPercentage: 0,
                lastUpdated: '2026-06-19T12:15:18.574Z',
            },
            recommendedNextAction: {
                tool: 'manage_index',
                args: { action: 'create', path: '<repo>' },
                reason: 'Restart indexing because the previous attempt failed before completion marker proof.',
            },
            hints: {
                create: {
                    tool: 'manage_index',
                    args: { action: 'create', path: '<repo>' },
                },
                status: {
                    tool: 'manage_index',
                    args: { action: 'status', path: '<repo>' },
                },
            },
            results: [],
        });
    }));
});

test('golden MCP file_outline invalid root shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const missingRoot = path.join(repoPath, 'missing-root');
        const { handlers } = createHandlers(repoPath);

        const response = await handlers.handleFileOutline({
            path: missingRoot,
            file: 'src/runtime.ts',
        }, fixtureWorkspacePolicy(repoPath));

        assert.equal(response.isError, true);
        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot });
        assert.deepEqual(payload, {
            status: 'not_indexed',
            reason: 'not_indexed',
            path: '<repo>/missing-root',
            file: 'src/runtime.ts',
            outline: null,
            hasMore: false,
            message: "Path '<repo>/missing-root' does not exist. file_outline requires an indexed codebase directory root.",
        });
    }));
});

test('golden MCP file_outline failed index shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const { handlers } = createFailedIndexHandlers(repoPath);

        const response = await handlers.handleFileOutline({
            path: repoPath,
            file: 'src/runtime.ts',
        }, fixtureWorkspacePolicy(repoPath));

        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot });
        assert.deepEqual(payload, {
            status: 'not_indexed',
            reason: 'index_failed',
            path: '<repo>',
            codebaseRoot: '<repo>',
            file: 'src/runtime.ts',
            outline: null,
            hasMore: false,
            message: "Codebase '<repo>' has a failed indexing attempt. Error: Interrupted indexing detected without completion marker proof. Failed at: 0.0% progress. Failed at: 2026-06-19T12:15:18.574Z. Satori will not serve semantic results from an unproven partial index. Run manage_index with {\"action\":\"create\",\"path\":\"<repo>\"} to restart indexing for this failed state.",
            indexingFailure: {
                errorMessage: 'Interrupted indexing detected without completion marker proof.',
                lastAttemptedPercentage: 0,
                lastUpdated: '2026-06-19T12:15:18.574Z',
            },
            hints: {
                create: {
                    tool: 'manage_index',
                    args: { action: 'create', path: '<repo>' },
                },
                status: {
                    tool: 'manage_index',
                    args: { action: 'status', path: '<repo>' },
                },
            },
        });
    }));
});

test('golden MCP call_graph invalid root shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const missingRoot = path.join(repoPath, 'missing-root');
        const { handlers } = createHandlers(repoPath);

        const response = await handlers.handleCallGraph({
            path: missingRoot,
            symbolRef: { file: 'src/runtime.ts', symbolId: 'sym_runtime' },
        }, fixtureWorkspacePolicy(repoPath));

        assert.equal(response.isError, true);
        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot });
        assert.deepEqual(payload, {
            status: 'not_indexed',
            supported: false,
            reason: 'not_indexed',
            path: '<repo>/missing-root',
            symbolRef: {
                file: 'src/runtime.ts',
                symbolId: 'sym_runtime',
            },
            direction: 'both',
            depth: 1,
            limit: 20,
            nodes: [],
            edges: [],
            notes: [],
            notesTruncated: false,
            totalNoteCount: 0,
            returnedNoteCount: 0,
            message: "Path '<repo>/missing-root' does not exist. call_graph requires an indexed codebase directory root.",
        });
    }));
});

test('golden MCP call_graph failed index shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const { handlers } = createFailedIndexHandlers(repoPath);

        const response = await handlers.handleCallGraph({
            path: repoPath,
            symbolRef: { file: 'src/runtime.ts', symbolId: 'sym_runtime_run' },
            direction: 'both',
            depth: 1,
            limit: 20,
        }, fixtureWorkspacePolicy(repoPath));

        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot });
        assert.deepEqual(payload, {
            status: 'not_indexed',
            supported: false,
            reason: 'index_failed',
            path: '<repo>',
            codebaseRoot: '<repo>',
            symbolRef: {
                file: 'src/runtime.ts',
                symbolId: 'sym_runtime_run',
            },
            direction: 'both',
            depth: 1,
            limit: 20,
            nodes: [],
            edges: [],
            notes: [],
            message: "Codebase '<repo>' has a failed indexing attempt. Error: Interrupted indexing detected without completion marker proof. Failed at: 0.0% progress. Failed at: 2026-06-19T12:15:18.574Z. Satori will not serve semantic results from an unproven partial index. Run manage_index with {\"action\":\"create\",\"path\":\"<repo>\"} to restart indexing for this failed state.",
            indexingFailure: {
                errorMessage: 'Interrupted indexing detected without completion marker proof.',
                lastAttemptedPercentage: 0,
                lastUpdated: '2026-06-19T12:15:18.574Z',
            },
            hints: {
                create: {
                    tool: 'manage_index',
                    args: { action: 'create', path: '<repo>' },
                },
                status: {
                    tool: 'manage_index',
                    args: { action: 'status', path: '<repo>' },
                },
            },
        });
    }));
});

test('golden MCP call_graph unsupported_language shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const filePath = path.join(repoPath, 'src/service.go');
        fs.writeFileSync(filePath, 'package svc\n\nfunc add() int {\n  return 1\n}\n', 'utf8');
        const add = createFunctionSymbol({
            file: 'src/service.go',
            name: 'add',
            startLine: 3,
            endLine: 5,
            fileHash: 'hash-go',
            language: 'go',
            label: 'function add',
        });
        await writeNavigationSidecars({ stateRoot, repoPath, symbols: [add] });
        const { handlers } = createHandlers(repoPath);

        const response = await handlers.handleCallGraph({
            path: repoPath,
            symbolRef: { file: 'src/service.go', symbolId: add.symbolInstanceId },
            direction: 'both',
            depth: 1,
            limit: 20,
        }, fixtureWorkspacePolicy(repoPath));

        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot, symbols: [add] });
        assert.deepEqual(payload, {
            status: 'unsupported',
            path: '<repo>',
            symbolRef: {
                file: 'src/service.go',
                symbolId: '<symbol:function:add>',
            },
            supported: false,
            reason: 'unsupported_language',
            message: "Language 'go' does not support relationship-backed call graph traversal.",
            nodes: [],
            edges: [],
            notes: [],
            notesTruncated: false,
            totalNoteCount: 0,
            returnedNoteCount: 0,
        });
    }));
});

test('golden MCP call_graph stale symbol id shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const originalContent = 'export function run() {\n  return true;\n}\n';
        const filePath = path.join(repoPath, 'src/runtime.ts');
        fs.writeFileSync(filePath, originalContent, 'utf8');
        const run = createFunctionSymbol({
            file: 'src/runtime.ts',
            name: 'run',
            startLine: 1,
            endLine: 3,
            fileHash: sha256Content(originalContent),
            label: 'function run()',
        });
        await writeNavigationSidecars({ stateRoot, repoPath, symbols: [run] });
        fs.writeFileSync(filePath, 'export function run() {\n  return false;\n}\n', 'utf8');
        const { handlers } = createHandlers(repoPath);

        const response = await handlers.handleCallGraph({
            path: repoPath,
            symbolRef: { file: 'src/runtime.ts', symbolId: run.symbolInstanceId },
            direction: 'both',
            depth: 1,
            limit: 20,
        }, fixtureWorkspacePolicy(repoPath));

        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot, symbols: [run] });
        assert.deepEqual(payload, {
            status: 'not_found',
            path: '<repo>',
            symbolRef: { file: 'src/runtime.ts', symbolId: '<symbol:function:run>' },
            direction: 'both',
            depth: 1,
            limit: 20,
            supported: false,
            reason: 'stale_symbol_ref',
            message: "Symbol reference for 'src/runtime.ts' is stale relative to the current file contents. Refresh the index before using exact call graph navigation.",
            nodes: [],
            edges: [],
            notes: [],
            notesTruncated: false,
            totalNoteCount: 0,
            returnedNoteCount: 0,
        });
    }));
});

test('golden MCP call_graph missing relationship sidecar shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const run = createFunctionSymbol({
            file: 'src/runtime.ts',
            name: 'run',
            startLine: 1,
            endLine: 3,
            fileHash: 'hash-runtime',
            label: 'function run()',
        });
        await writeNavigationSidecars({ stateRoot, repoPath, symbols: [run] });
        const navigationRoot = resolveNavigationSidecarRoot(stateRoot, repoPath);
        await fs.promises.rm(path.join(navigationRoot, 'relationships'), { recursive: true, force: true });
        const { handlers } = createHandlers(repoPath);

        const response = await handlers.handleCallGraph({
            path: repoPath,
            symbolRef: { file: 'src/runtime.ts', symbolId: run.symbolInstanceId },
            direction: 'both',
            depth: 1,
            limit: 20,
        }, fixtureWorkspacePolicy(repoPath));

        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot, symbols: [run] });
        assert.deepEqual(payload, {
            status: 'requires_reindex',
            supported: false,
            reason: 'missing_relationship_sidecar',
            path: '<repo>',
            codebasePath: '<repo>',
            symbolRef: { file: 'src/runtime.ts', symbolId: '<symbol:function:run>' },
            direction: 'both',
            depth: 1,
            limit: 20,
            nodes: [],
            edges: [],
            notes: [],
            message: "Relationship sidecar is missing: relationship manifest is missing\n\nThe index at '<repo>' is missing navigation sidecars. Please run manage_index with {\"action\":\"repair\",\"path\":\"<repo>\"}.",
            hints: {
                repair: {
                    tool: 'manage_index',
                    args: { action: 'repair', path: '<repo>' },
                },
                reindex: {
                    tool: 'manage_index',
                    args: { action: 'reindex', path: '<repo>' },
                },
            },
            compatibility: {
                runtimeFingerprint: RUNTIME_FINGERPRINT,
                statusAtCheck: 'indexed',
            },
        });
    }));
});

test('golden MCP call_graph incompatible relationship sidecar shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const run = createFunctionSymbol({
            file: 'src/runtime.ts',
            name: 'run',
            startLine: 1,
            endLine: 3,
            fileHash: 'hash-runtime',
            label: 'function run()',
        });
        await writeNavigationSidecars({
            stateRoot,
            repoPath,
            symbols: [run],
            relationshipManifestHash: 'wrong-symbol-registry-manifest-hash',
        });
        const { handlers } = createHandlers(repoPath);

        const response = await handlers.handleCallGraph({
            path: repoPath,
            symbolRef: { file: 'src/runtime.ts', symbolId: run.symbolInstanceId },
            direction: 'both',
            depth: 1,
            limit: 20,
        }, fixtureWorkspacePolicy(repoPath));

        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot, symbols: [run] });
        assert.deepEqual(payload, {
            status: 'requires_reindex',
            supported: false,
            reason: 'incompatible_relationship_sidecar',
            path: '<repo>',
            codebasePath: '<repo>',
            symbolRef: { file: 'src/runtime.ts', symbolId: '<symbol:function:run>' },
            direction: 'both',
            depth: 1,
            limit: 20,
            nodes: [],
            edges: [],
            notes: [],
            message: "Relationship sidecar is incompatible: relationship manifest hash does not match symbol registry manifest hash\n\nThe index at '<repo>' is incompatible with the current runtime and must be rebuilt. Please run manage_index with {\"action\":\"reindex\",\"path\":\"<repo>\"}.",
            hints: {
                reindex: {
                    tool: 'manage_index',
                    args: { action: 'reindex', path: '<repo>' },
                },
            },
            compatibility: {
                runtimeFingerprint: RUNTIME_FINGERPRINT,
                statusAtCheck: 'indexed',
            },
        });
    }));
});

test('golden historical read_file exact-open request is rejected by the canonical contract', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const historical = PHASE_0_CONTRACT.historicalExactOpen;
        const filePath = path.join(repoPath, historical.symbol.file);
        fs.writeFileSync(filePath, historical.source, 'utf8');
        const run = createFunctionSymbol({
            file: historical.symbol.file,
            name: historical.symbol.name,
            startLine: historical.symbol.startLine,
            endLine: historical.symbol.endLine,
            fileHash: 'hash-runtime',
            label: historical.symbol.label,
        });
        await writeNavigationSidecars({ stateRoot, repoPath, symbols: [run] });
        const { handlers, snapshotManager, syncManager } = createHandlers(repoPath);

        const response = await readFileTool.execute({
            path: filePath,
            mode: historical.request.mode,
            open_symbol: { symbolId: run.symbolInstanceId },
        }, createReadFileToolContext({
            handlers,
            snapshotManager,
            syncManager,
            repoPath,
        }));

        assert.equal(response.isError, true);
        const text = response.content[0]?.text || '';
        // Zod union rejection is a generic schema failure; do not assert internal field names.
        assert.match(text, /Invalid arguments for 'read_file'/);
        assert.match(text, /open_symbol/);
        assert.equal(text.includes('"kind":"symbol_context"'), false);
        assert.equal(text.includes('"status":"ok"'), false);
    }));
});

test('golden MCP read_file open_symbol current id returns bounded symbol_context', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const filePath = path.join(repoPath, 'src/runtime.ts');
        const source = 'export function run() {\n  return true;\n}\n';
        fs.writeFileSync(filePath, source, 'utf8');
        const run = createFunctionSymbol({
            file: 'src/runtime.ts',
            name: 'run',
            startLine: 1,
            endLine: 3,
            fileHash: sha256Content(source),
            label: 'function run()',
        });
        const sidecars = await writeNavigationSidecars({
            stateRoot,
            repoPath,
            symbols: [run],
            generation: true,
        });
        const { handlers, snapshotManager, syncManager } = createHandlers(repoPath, [], {
            symbolRegistryManifestHash: sidecars.manifestHash,
            relationshipManifestHash: sidecars.relationshipManifestHash,
            generationId: sidecars.generationId!,
            generationRoot: sidecars.generationRoot!,
            navigationSealHash: sidecars.navigationSealHash!,
        });

        const response = await readFileTool.execute({
            path: filePath,
            mode: 'plain',
            open_symbol: {
                contractVersion: 2,
                symbolId: run.symbolInstanceId,
                context: { preset: 'implementation' },
            },
        }, createReadFileToolContext({
            handlers,
            snapshotManager,
            syncManager,
            repoPath,
        }));

        assert.equal(response.isError, undefined);
        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot, symbols: [run] }) as Record<string, unknown>;
        assert.equal(payload.formatVersion, 2);
        assert.equal(payload.kind, 'symbol_context');
        assert.equal(payload.status, 'ok');
        assert.equal((payload.symbol as { symbolId?: string } | undefined)?.symbolId, symbolPlaceholder(run));
    }));
});

test('golden MCP read_file open_symbol stale id shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const filePath = path.join(repoPath, 'src/runtime.ts');
        fs.writeFileSync(filePath, 'export function run() {\n  return true;\n}\n', 'utf8');
        const run = createFunctionSymbol({
            file: 'src/runtime.ts',
            name: 'run',
            startLine: 1,
            endLine: 3,
            fileHash: 'hash-runtime',
            label: 'function run()',
        });
        const sidecars = await writeNavigationSidecars({
            stateRoot,
            repoPath,
            symbols: [run],
            generation: true,
        });
        const { handlers, snapshotManager, syncManager } = createHandlers(repoPath, [], {
            symbolRegistryManifestHash: sidecars.manifestHash,
            relationshipManifestHash: sidecars.relationshipManifestHash,
            generationId: sidecars.generationId!,
            generationRoot: sidecars.generationRoot!,
            navigationSealHash: sidecars.navigationSealHash!,
        });

        const response = await readFileTool.execute({
            path: filePath,
            mode: 'plain',
            open_symbol: {
                contractVersion: 2,
                symbolId: 'sym_stale_runtime_run',
                context: { preset: 'implementation' },
            },
        }, createReadFileToolContext({
            handlers,
            snapshotManager,
            syncManager,
            repoPath,
        }));

        assert.equal(response.isError, true);
        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot, symbols: [run] });
        assert.deepEqual(payload, {
            formatVersion: 2,
            kind: 'symbol_context',
            status: 'error',
            code: 'SYMBOL_NOT_FOUND',
            reason: 'symbol_not_found',
            message: 'No exact symbol matched the current navigation snapshot.',
        });
    }));
});

test('golden MCP read_file open_symbol unavailable authority shape', async () => {
    await withTempStateRoot(async (stateRoot) => withTempRepo(async (repoPath) => {
        const filePath = path.join(repoPath, 'src/runtime.ts');
        fs.writeFileSync(filePath, 'export function run() {\n  return true;\n}\n', 'utf8');
        const run = createFunctionSymbol({
            file: 'src/runtime.ts',
            name: 'run',
            startLine: 1,
            endLine: 3,
            fileHash: 'hash-runtime',
            label: 'function run()',
        });
        await writeNavigationSidecars({ stateRoot, repoPath, symbols: [run] });
        // Default createHandlers omits prepared-authority observers/receipts.
        const { handlers, snapshotManager, syncManager } = createHandlers(repoPath);

        const response = await readFileTool.execute({
            path: filePath,
            mode: 'plain',
            open_symbol: {
                contractVersion: 2,
                symbolId: run.symbolInstanceId,
                context: { preset: 'implementation' },
            },
        }, createReadFileToolContext({
            handlers,
            snapshotManager,
            syncManager,
            repoPath,
        }));

        assert.equal(response.isError, true);
        const payload = scrubGolden(parsePayload(response), { repoPath, stateRoot, symbols: [run] });
        assert.deepEqual(payload, {
            formatVersion: 2,
            kind: 'symbol_context',
            status: 'error',
            code: 'NAVIGATION_UNAVAILABLE',
            reason: 'navigation_unavailable',
            message: 'Current navigation authority is unavailable; refresh the index state and retry.',
        });
    }));
});
