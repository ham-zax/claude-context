import {
    Embedding,
    OpenAIEmbedding,
    resolveValidatedEmbeddingIdentity,
    type EmbeddingIdentity,
    type EmbeddingOperationMetricsSnapshot,
} from '../embedding';
import {
    VectorDatabase,
    VectorControlRecord,
    VectorFilter,
    IndexCompletionFingerprint,
    IndexCompletionMarkerDocument,
    INDEX_COMPLETION_MARKER_DOC_ID,
    deleteCollectionWithVerification,
    type VectorWriteMetricsSnapshot,
    type VectorStoreProviderIdentity,
} from '../vectordb';
import {
    SemanticSearchRequest,
    SemanticSearchResult,
    type SemanticSearchCandidateTraceOptions,
    type SemanticSearchExecutionResult,
} from '../types';
import { envManager } from '../utils/env-manager';
import {
    DEFAULT_IGNORE_PATTERNS,
    IndexProfile,
    getSupportedExtensionsForIndexProfile,
} from '../config/defaults';
import {
    normalizeSupportedExtensions,
} from '../config/index-policy';
import {
    loadSatoriRepoConfig,
    SATORI_REPO_CONFIG_FILENAME,
    SatoriRepoConfigAuthorityError,
    SatoriRepoConfig,
} from '../config/repo-config';
import {
    importNavigationToSqlite,
    resolveNavigationSqlitePath,
} from '../navigation';
import {
    SYMBOL_REGISTRY_SCHEMA_VERSION,
    buildSymbolRegistry,
    clearSymbolRegistrySidecar,
    computeSymbolRegistryManifestHash,
    computeNavigationGenerationSealHash,
    computeNavigationSourceFilesDigest,
    parseNavigationGenerationSeal,
    readNavigationGenerationSeal,
    readRelationshipSidecar,
    readSymbolRegistrySidecar,
    RetiredNavigationPointerError,
    UnsupportedNavigationPointerError,
    resolveCurrentNavigationGeneration,
    resolveNavigationGeneration,
    resolveNavigationSidecarRoot,
    discardNavigationSidecarGeneration,
    publishNavigationSidecarGeneration,
    stageNavigationSidecarGeneration,
    verifyNavigationGenerationSealArtifacts,
} from '../symbols';
import type {
    CurrentNavigationGeneration,
    RelationshipRecord,
    StagedNavigationSidecarGeneration,
    SymbolRecord,
    SymbolRegistry,
    SymbolRegistryManifestFile,
} from '../symbols';
import {
    createLanguageAnalysisService,
    LANGUAGE_PARSER_VERSION,
    RELATIONSHIP_BUILDER_VERSION,
    SYMBOL_EXTRACTOR_VERSION,
    type LanguageAnalysisPort,
} from '../language-analysis';
import {
    canonicalizeRepositoryRelativePath,
    type RepositoryRelativePath,
} from '../paths/repository-path';
import {
    buildRelationshipDelta,
    buildRelationshipsForRegistry,
    type RelationshipAnalysisEvidence,
} from '../relationships';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import ignore from 'ignore';
import {
    FileSynchronizer,
    type SourceFreshnessCheckpointEvidence,
    type SourceFreshnessPathComparison,
} from '../sync/synchronizer';
import { assertDescriptorBoundIndexingSupported } from '../sync/root-bound-fs';
import type {
    RepairActivatedGeneration,
    RepairIndexResult,
    RepairProof,
    RepairSnapshotEvidence,
} from './repair-proof';
import {
    buildCanonicalIndexPolicyDocument,
    classifyRepairIndexCompatibility,
    indexFingerprintsEqual,
    inspectCompletionMarker,
    type CanonicalPolicyNavigationBinding,
    type CanonicalPublicationBinding,
} from './persisted-index-authority';
import {
    EMBEDDING_PROJECTION_VERSION,
    LEXICAL_PROJECTION_VERSION,
} from './search-projections';
import {
    SemanticSearchService,
    type MutationGenerationObserver,
} from './semantic-search-service';
import {
    IndexingPipeline,
    type AnalyzedFileSymbolFacts,
    type AnalyzedIndexedFile,
    type ExpectedIndexedChunk,
    type IndexingPipelineMetrics,
    type ProcessedFileList,
    type ProjectedChunkEntry,
} from './indexing-pipeline';
import { IndexPolicyMutationCoordinator } from './index-policy-mutation-coordinator';
import {
    DurableAuthorityRestoreTransactionMechanics,
    type DurableAuthorityMutationOwner,
    type DurableAuthorityRecoveryPublisher,
    type DurableIndexAuthorityArtifact,
} from '../generation/restore-transaction';
import {
    IndexAuthorityCoordinator,
    createGenerationProofCoordinator,
    type CachedGenerationProof,
    type GenerationProofCoordinator,
    type PublicationRetentionQueue,
} from '../generation/index-authority-coordinator';

export {
    createGenerationProofCoordinator,
    type GenerationProofCoordinator,
} from '../generation/index-authority-coordinator';

import { IndexPolicyDocumentStore } from '../policy/index-policy-document-store';
import {
    IgnoreRuleService,
    getCustomExtensionsFromEnvironment,
    getCustomIgnorePatternsFromEnvironment,
    readIgnorePatternsFile,
} from './ignore-rule-service';
import {
    computeIndexPolicyControlSignature,
    observeIndexPolicyInputs,
} from './index-policy-input-observer';
import {
    IndexPolicyAuthorityError,
    IndexFormatRequiresReindexError,
    IndexPolicyRuntimeService,
    UnsupportedIndexAuthorityError,
    computeIndexPolicyHash,
    type IndexPolicyRuntimeBinding,
} from '../policy/index-policy-runtime-service';
import type { ResolvedIndexPolicy } from '../policy/index-policy-runtime-service';
export type { ResolvedIndexPolicy } from '../policy/index-policy-runtime-service';
export type {
    DurableAuthorityMutationOwner,
    DurableAuthorityRecoveryPublisher,
    DurableIndexAuthorityArtifact,
} from '../generation/restore-transaction';

export type {
    MutationGenerationObservation,
    MutationGenerationObserver,
} from './semantic-search-service';

function subtractEmbeddingMetrics(
    after: EmbeddingOperationMetricsSnapshot | null,
    before: EmbeddingOperationMetricsSnapshot | null,
): EmbeddingOperationMetricsSnapshot | null {
    if (!after || !before) return null;
    return {
        providerRequestCount: after.providerRequestCount - before.providerRequestCount,
        retryCount: after.retryCount - before.retryCount,
        submittedItems: after.submittedItems - before.submittedItems,
        submittedBytes: after.submittedBytes - before.submittedBytes,
        providerTokens: after.providerTokens - before.providerTokens,
        durationMs: after.durationMs - before.durationMs,
    };
}

function subtractVectorWriteMetrics(
    after: VectorWriteMetricsSnapshot | null,
    before: VectorWriteMetricsSnapshot | null,
): VectorWriteMetricsSnapshot | null {
    if (!after || !before) return null;
    const providerRequestCount = after.providerRequestCount - before.providerRequestCount;
    if (providerRequestCount < 0) return null;
    const recentAttempts = Array.isArray(after.recentAttempts)
        ? after.recentAttempts.filter((attempt) => (
            attempt.sequence > before.providerRequestCount
            && attempt.sequence <= after.providerRequestCount
        ))
        : [];
    return {
        providerRequestCount,
        retryCount: after.retryCount - before.retryCount,
        submittedRows: after.submittedRows - before.submittedRows,
        submittedBytes: after.submittedBytes - before.submittedBytes,
        durationMs: after.durationMs - before.durationMs,
        rowLimit: after.rowLimit,
        byteLimit: after.byteLimit,
        recentAttempts,
    };
}

function percentile(values: readonly number[], fraction: number): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.max(0, Math.ceil(fraction * sorted.length) - 1);
    return sorted[index] ?? null;
}

function summarizeVectorWriteMetrics(
    metrics: VectorWriteMetricsSnapshot | null,
    logicalRows: number,
): Record<string, unknown> | null {
    if (!metrics) return null;
    const samplesComplete = metrics.recentAttempts.length === metrics.providerRequestCount;
    const rowValues = metrics.recentAttempts.map((attempt) => attempt.rows);
    const byteValues = metrics.recentAttempts.map((attempt) => attempt.bytes);
    const flushReasons = metrics.recentAttempts.reduce((counts, attempt) => ({
        ...counts,
        [attempt.flushReason]: counts[attempt.flushReason] + 1,
    }), {
        row_limit: 0,
        byte_limit: 0,
        logical_write_end: 0,
        retry: 0,
    });
    const initialProviderRequests = metrics.providerRequestCount - metrics.retryCount;
    const theoreticalMinimumRequests = metrics.rowLimit > 0
        ? Math.ceil(logicalRows / metrics.rowLimit)
        : null;

    return {
        providerRequestCount: metrics.providerRequestCount,
        retryCount: metrics.retryCount,
        submittedRows: metrics.submittedRows,
        submittedBytes: metrics.submittedBytes,
        durationMs: metrics.durationMs,
        rowLimit: metrics.rowLimit,
        byteLimit: metrics.byteLimit,
        samples: {
            complete: samplesComplete,
            captured: metrics.recentAttempts.length,
        },
        requestRows: {
            min: percentile(rowValues, 0),
            p50: percentile(rowValues, 0.5),
            p90: percentile(rowValues, 0.9),
            p95: percentile(rowValues, 0.95),
            max: percentile(rowValues, 1),
        },
        requestBytes: {
            min: percentile(byteValues, 0),
            p50: percentile(byteValues, 0.5),
            p90: percentile(byteValues, 0.9),
            p95: percentile(byteValues, 0.95),
            max: percentile(byteValues, 1),
        },
        flushReasons,
        theoreticalMinimumRequests,
        fragmentationOverheadRequests: theoreticalMinimumRequests === null
            ? null
            : initialProviderRequests - theoreticalMinimumRequests,
    };
}


export interface ContextConfig {
    embedding?: Embedding;
    vectorDatabase?: VectorDatabase;
    vectorStoreProvider?: VectorStoreProviderIdentity;
    languageAnalyzer?: LanguageAnalysisPort;
    supportedExtensions?: string[];
    ignorePatterns?: string[];
    customExtensions?: string[]; // New: custom extensions from MCP
    customIgnorePatterns?: string[]; // New: custom ignore patterns from MCP
    symbolRegistryStateRoot?: string;
    indexPolicyStateRoot?: string;
    durableAuthorityRecoveryPublisher?: DurableAuthorityRecoveryPublisher;
    /** Required when hybrid reads can overlap externally coordinated mutations. */
    mutationGenerationObserver?: MutationGenerationObserver;
    generationProofCoordinator?: GenerationProofCoordinator;
}

export interface CustomIndexPolicyUpdate {
    customExtensions?: string[];
    customIgnorePatterns?: string[];
}

export interface ObservedResolvedIndexPolicy extends ResolvedIndexPolicy {
    controlSignature: string;
}

type IndexPolicyBinding = IndexPolicyRuntimeBinding;

type EffectiveNavigationAuthority =
    | {
        status: 'not_bound';
        relationshipOnlyUpgrade: false;
        useBoundGeneration: boolean;
    }
    | {
        status: 'sealed';
        generationId: string;
        sealHash: string;
        expectedSymbolRegistryManifestHash?: string;
        expectedRelationshipManifestHash: string;
        relationshipOnlyUpgrade: boolean;
        useBoundGeneration: boolean;
    };

function policyNavigationBindingFromMarker(
    navigation: IndexCompletionMarkerDocument['navigation'],
): CanonicalPolicyNavigationBinding {
    return navigation.status === 'sealed'
        ? {
            status: 'sealed',
            generationId: navigation.generationId,
            sealHash: navigation.sealHash,
        }
        : { status: 'not_bound' };
}

function policyNavigationBindingsEqual(
    left: CanonicalPolicyNavigationBinding,
    right: CanonicalPolicyNavigationBinding,
): boolean {
    return left.status === right.status
        && (left.status === 'not_bound'
            || (
                right.status === 'sealed'
                && left.generationId === right.generationId
                && left.sealHash === right.sealHash
            ));
}

function publicationBindingsEqual(
    left: CanonicalPublicationBinding | undefined,
    right: CanonicalPublicationBinding | undefined,
): boolean {
    return left === undefined
        ? right === undefined
        : right !== undefined && JSON.stringify(left) === JSON.stringify(right);
}

export interface ProvenVectorGenerationReceipt {
    readonly collectionName: string;
    readonly marker: IndexCompletionMarkerDocument;
    readonly policy: ResolvedIndexPolicy;
    readonly policyDocumentDigest: string;
    readonly exactPayloadCount: number;
    readonly observations: {
        readonly profileFileToken: string | null;
        readonly policyFileToken: string;
    };
}

export interface ProvenGenerationReceipt extends Omit<ProvenVectorGenerationReceipt, 'observations'> {
    readonly navigation: CurrentNavigationGeneration;
    readonly observations: ProvenVectorGenerationReceipt['observations'] & {
        readonly navigationToken: string;
    };
}

export type ProvenSourceFreshnessCheckpointEvidence =
    | (Extract<SourceFreshnessCheckpointEvidence, { status: 'valid' }> & {
        readonly generationReceipt?: ProvenGenerationReceipt;
    })
    | Exclude<SourceFreshnessCheckpointEvidence, { status: 'valid' }>;

export type NavigationGenerationProof =
    | { status: 'valid'; generation: CurrentNavigationGeneration; observationToken: string }
    | { status: 'not_bound' | 'missing' | 'incompatible' | 'corrupt' | 'requires_reindex' | 'unsupported' };

export type IndexPolicyPublicationReceipt =
    | {
        status: 'committed';
        operation: 'publish';
        canonicalRoot: string;
        documentDigest: string;
        policyHash: string;
        collectionName: string;
        navigation: CanonicalPolicyNavigationBinding;
        publication?: CanonicalPublicationBinding;
    }
    | {
        status: 'committed';
        operation: 'clear';
        canonicalRoot: string;
        previousDocumentDigest: string | null;
    };

export class IndexPolicyPublicationError extends Error {
    readonly committed = true;

    constructor(
        message: string,
        readonly receipt: IndexPolicyPublicationReceipt,
        readonly publicationCause: unknown,
    ) {
        super(message);
        this.name = 'IndexPolicyPublicationError';
    }
}

export class AtomicIncrementalPublicationUnsupportedError extends Error {
    constructor() {
        super('The active vector backend cannot stage an atomic incremental publication; a full rebuild is required.');
        this.name = 'AtomicIncrementalPublicationUnsupportedError';
    }
}

export type CompletionMarkerValidationEvidence =
    | {
        status: 'valid_v3';
        collectionName: string;
        marker: IndexCompletionMarkerDocument;
        vectorReceipt: ProvenVectorGenerationReceipt;
        navigationProof: NavigationGenerationProof;
        generationReceipt?: ProvenGenerationReceipt;
        exactPayloadRecounts: 0 | 1;
        proofSource: 'activation' | 'exact' | 'joined' | 'reused';
    }
    | { status: 'invalid_v3' }
    | { status: 'requires_reindex' }
    | { status: 'unsupported_authority' }
    | { status: 'policy_authority_invalid' }
    | { status: 'runtime_policy_incompatible' }
    | { status: 'missing' };

export type PreparedGenerationRevalidation = {
    vectorReceipt: ProvenVectorGenerationReceipt;
    navigationProof: NavigationGenerationProof;
    generationReceipt?: ProvenGenerationReceipt;
};

export type IndexAuthorityObservations = {
    vector: string;
    navigation: string;
};

export type DurableIndexAuthoritySnapshot = {
    canonicalRoot: string;
    policyDocument: DurableIndexAuthorityArtifact | null;
    navigationPointer: DurableIndexAuthorityArtifact | null;
};

type DurableIndexAuthorityRestoreResult =
    | { status: 'restored_current' }
    | { status: 'restored_requires_reindex' }
    | { status: 'restored_unsupported_authority' };

type RepairIndexOptions = {
    snapshotEvidence?: RepairSnapshotEvidence;
    preferredCollectionName?: string;
    assertMutationCurrent?: () => void;
    publishMutation?: (publish: () => void) => void;
    onProofUpdate?: (proof: RepairProof) => void;
    publicationAuthority?: DurableAuthorityMutationOwner;
};

type RepairCompletionMarkerResolution =
    | { status: 'missing' }
    | { status: 'malformed' }
    | { status: 'matched'; marker: IndexCompletionMarkerDocument };

type ReindexByChangeOptions = {
    targetCollectionName?: string;
    maintainCompletionMarker?: boolean;
    externallyManagedPublication?: boolean;
    assertMutationCurrent?: () => void;
    publishMutation?: (publish: () => void) => void;
    publicationAuthority?: DurableAuthorityMutationOwner;
    sourceGenerationReceipt?: ProvenGenerationReceipt;
    onPhaseTiming?: (
        phase:
            | 'publication_source_navigation_load'
            | 'publication_fork'
            | 'publication_payload_delta'
            | 'publication_navigation_checkpoint'
            | 'publication_navigation_delta'
            | 'publication_relationship_load'
            | 'publication_relationship_delta'
            | 'publication_sidecar_stage'
            | 'publication_checkpoint_stage'
            | 'publication_payload_count'
            | 'publication_activation'
            | 'publication_retention_proof',
        durationMs: number,
    ) => void;
};

type MutationGuardOptions = {
    assertMutationCurrent?: () => void;
    publishMutation?: (publish: () => void) => void;
    deferFullIndexPublication?: boolean;
    indexPolicy?: ResolvedIndexPolicy;
    preparedCollectionReceipt?: PreparedIndexCollectionReceipt;
    preparedCollectionBinding?: PreparedIndexCollectionBinding;
};

type StagedCollectionPruneOptions = {
    assertMutationCurrent?: () => void;
    discardUnprovenPayload?: boolean;
};

/**
 * Staged hybrid collections are schema-only until finalize. Probing them for
 * markers or payload can fail with backend index-missing errors instead of an
 * empty result set. Those failures are generation state, not prune transport
 * failures.
 *
 * Keep this matcher narrow: only known Milvus/Zilliz index-absence codes/phrases.
 * Do not treat generic "not found" or collection-missing errors as unsearchable.
 */
function isUnsearchableStagedCollectionError(error: unknown): boolean {
    const messages: string[] = [];
    const seen = new Set<unknown>();
    const collect = (value: unknown): void => {
        if (value === null || value === undefined || seen.has(value)) {
            return;
        }
        seen.add(value);
        if (typeof value === 'string') {
            messages.push(value);
            return;
        }
        if (value instanceof Error) {
            messages.push(value.name, value.message);
            collect((value as Error & { cause?: unknown }).cause);
            return;
        }
        if (typeof value === 'object') {
            const record = value as Record<string, unknown>;
            for (const key of ['message', 'reason', 'error_code', 'code', 'errorCode']) {
                collect(record[key]);
            }
        }
    };
    collect(error);
    const joined = messages.join(' ');
    return /IndexNotExist/i.test(joined)
        || /index not found\[collection=/i.test(joined)
        || /index does not exist/i.test(joined);
}

export type PreparedIndexCollectionBinding = Readonly<{
    generation: number;
    operationId: string;
}>;

export type PreparedIndexCollectionReceipt = Readonly<PreparedIndexCollectionBinding & {
    canonicalRoot: string;
    collectionName: string;
}>;

export type IndexCodebaseResult = {
    indexedFiles: number;
    totalChunks: number;
    status: 'completed' | 'limit_reached';
    /** Exact SHA-256 identities of source bytes consumed by this full index. */
    indexedFileHashes: ReadonlyMap<string, string>;
    navigationCandidate?: StagedNavigationSidecarGeneration;
};

type ReindexByChangeResult = {
    added: number;
    removed: number;
    modified: number;
    changedFiles: string[];
    navigationRecovery?: 'rebuilt' | 'failed';
    collectionName?: string;
    indexedFiles?: number;
    totalChunks?: number;
    indexStatus?: 'completed' | 'limit_reached';
    generationReceipt?: ProvenGenerationReceipt;
};

type CollectionPayloadVerification =
    | { ok: true; indexedFiles: number; totalChunks: number }
    | { ok: false; message: string };



type VectorGenerationProofResult = {
    receipt: ProvenVectorGenerationReceipt | null;
    exactPayloadRecounts: 0 | 1;
    source: 'activation' | 'exact' | 'joined' | 'reused';
};


type CachedNavigationDeltaState = {
    readonly canonicalRoot: string;
    readonly generationId: string;
    readonly symbolRegistryManifestHash: string;
    readonly relationshipManifestHash: string;
    readonly navigationSealHash: string;
    readonly navigationObservationToken?: string;
    readonly registry: SymbolRegistry;
    readonly records: readonly RelationshipRecord[];
    readonly analysisByFile: Map<string, RelationshipAnalysisEvidence>;
};

type NavigationDeltaBuildResult = {
    readonly candidate?: StagedNavigationSidecarGeneration;
    readonly state?: CachedNavigationDeltaState;
};


export class Context {
    private embedding: Embedding;
    private embeddingIdentity: Readonly<EmbeddingIdentity>;
    private vectorDatabase: VectorDatabase;
    private readonly languageAnalyzer: LanguageAnalysisPort;
    private supportedExtensions: string[];
    private readonly indexPolicyRuntimeService: IndexPolicyRuntimeService;
    private readonly indexPolicyStateRoot: string;
    private readonly indexPolicyMutationCoordinator: IndexPolicyMutationCoordinator;
    private readonly indexPolicyDocumentStore: IndexPolicyDocumentStore;
    private readonly restoreTransactionMechanics: DurableAuthorityRestoreTransactionMechanics;
    private synchronizers = new Map<string, FileSynchronizer>();
    private synchronizerMutationTargets = new Map<string, string>();
    private reindexByChangeQueues = new Map<string, Promise<void>>();
    private get publicationRetentionQueues(): PublicationRetentionQueue {
        return this.indexAuthorityCoordinator.publicationRetentionQueues;
    }

    private get publishedResolvedPoliciesByCodebase(): Map<string, ResolvedIndexPolicy> {
        return new Map(this.indexAuthorityCoordinator.publishedResolvedPolicySnapshot());
    }

    private get publishedPolicyBindingsByCodebase(): Map<string, IndexPolicyBinding & { policyHash: string }> {
        return new Map(this.indexAuthorityCoordinator.publishedPolicyBindingSnapshot());
    }
    private readonly indexAuthorityCoordinator: IndexAuthorityCoordinator;
    // Derived warm-path state only. The durable generation remains authoritative,
    // and a restart or generation mismatch returns to exact sidecar validation.
    private navigationDeltaState?: CachedNavigationDeltaState;
    private readonly preparedNavigationDeltaStates =
        new WeakMap<StagedNavigationSidecarGeneration, CachedNavigationDeltaState>();
    private writeCollectionOverrides = new Map<string, string>();
    private preparedIndexCollectionReceipts = new WeakSet<PreparedIndexCollectionReceipt>();
    private symbolRegistryStateRoot?: string;
    private readonly semanticSearchService: SemanticSearchService<ProvenVectorGenerationReceipt>;
    private readonly indexingPipeline: IndexingPipeline;
    private readonly ignoreRuleService: IgnoreRuleService;
    private vectorStoreProvider: VectorStoreProviderIdentity;

    constructor(config: ContextConfig = {}) {

        // Initialize services
        if (config.embedding) {
            this.embedding = config.embedding;
        } else {
            const openAiApiKey = envManager.get('OPENAI_API_KEY');
            if (!openAiApiKey) {
                throw new Error('OPENAI_API_KEY is required when no embedding implementation is provided.');
            }
            this.embedding = new OpenAIEmbedding({
                apiKey: openAiApiKey,
                model: 'text-embedding-3-small',
                ...(envManager.get('OPENAI_BASE_URL') && { baseURL: envManager.get('OPENAI_BASE_URL') })
            });
        }
        this.embeddingIdentity = resolveValidatedEmbeddingIdentity(this.embedding);

        if (!config.vectorDatabase) {
            throw new Error('VectorDatabase is required. Please provide a vectorDatabase instance in the config.');
        }
        this.vectorDatabase = config.vectorDatabase;
        const backendInfo = config.vectorDatabase.getBackendInfo?.();
        const inferredVectorStoreProvider = backendInfo?.provider === 'lancedb' ? 'LanceDB' : 'Milvus';
        if (
            config.vectorStoreProvider !== undefined
            && backendInfo !== undefined
            && config.vectorStoreProvider !== inferredVectorStoreProvider
        ) {
            throw new Error(
                `Configured vector-store provider '${config.vectorStoreProvider}' does not match adapter provider '${inferredVectorStoreProvider}'.`,
            );
        }
        this.vectorStoreProvider = config.vectorStoreProvider ?? inferredVectorStoreProvider;

        this.languageAnalyzer = config.languageAnalyzer || createLanguageAnalysisService({
            chunkSize: 2500,
            chunkOverlap: 300,
        });

        // Load custom extensions from environment variables
        const envCustomExtensions = getCustomExtensionsFromEnvironment();

        this.indexPolicyRuntimeService = new IndexPolicyRuntimeService({
            configuredExtensionOverlays: normalizeSupportedExtensions([
                ...(config.supportedExtensions || []),
                ...(config.customExtensions || []),
                ...envCustomExtensions
            ]),
            getIgnoreRuleService: () => this.ignoreRuleService,
            canonicalizeCodebasePath: (codebasePath) => (
                this.canonicalizeCodebasePath(codebasePath)
            ),
            resolvePolicyPath: (canonicalRoot) => (
                this.indexPolicyMutationCoordinator.resolvePolicyPath(canonicalRoot)
            ),
            resolveFilesystemObservationToken: (targetPath) => (
                this.resolveFilesystemObservationToken(targetPath)
            ),
            onActivateResolvedIndexPolicy: (policy, binding) => (
                this.indexAuthorityCoordinator.activatePublishedIndexPolicy(policy, binding)
            ),
            onClearPublishedIndexPolicy: (canonicalRoot) => (
                this.indexAuthorityCoordinator.clearPublishedIndexPolicyRuntime(canonicalRoot)
            ),
        });
        this.supportedExtensions = this.indexPolicyRuntimeService.buildSupportedExtensions('default');



        // Load custom ignore patterns from environment variables
        const envCustomIgnorePatterns = getCustomIgnorePatternsFromEnvironment();

        // Base ignore patterns (defaults + static config + env)
        const allIgnorePatterns = [
            ...DEFAULT_IGNORE_PATTERNS,
            ...(config.ignorePatterns || []),
            ...(config.customIgnorePatterns || []),
            ...envCustomIgnorePatterns
        ];
        this.indexPolicyStateRoot = config.indexPolicyStateRoot
            ?? path.join(
                process.env.SATORI_STATE_ROOT || path.join(os.homedir(), '.satori'),
                'index-policy',
            );
        this.indexPolicyMutationCoordinator = new IndexPolicyMutationCoordinator({
            stateRoot: this.indexPolicyStateRoot,
            verifyPolicyDocumentDigest: (policyPath) => (
                this.indexPolicyRuntimeService.resolveVerifiedIndexPolicyDocumentDigest(policyPath)
            ),
        });
        this.indexPolicyDocumentStore = new IndexPolicyDocumentStore({
            mutationCoordinator: this.indexPolicyMutationCoordinator,
            verifyPolicyDocumentDigest: (policyPath) => (
                this.indexPolicyRuntimeService.resolveVerifiedIndexPolicyDocumentDigest(policyPath)
            ),
            fsyncPath: (targetPath) => this.fsyncPath(targetPath),
        });
        this.symbolRegistryStateRoot = config.symbolRegistryStateRoot;
        this.restoreTransactionMechanics = new DurableAuthorityRestoreTransactionMechanics({
            indexPolicyStateRoot: this.indexPolicyStateRoot,
            canonicalizeCodebasePath: (codebasePath) => this.canonicalizeCodebasePath(codebasePath),
            resolvePolicyPath: (canonicalRoot) => (
                this.indexPolicyDocumentStore.resolvePolicyPath(canonicalRoot)
            ),
            resolveNavigationPointerPath: (canonicalRoot) => (
                path.join(resolveNavigationSidecarRoot(this.symbolRegistryStateRoot, canonicalRoot), 'current.json')
            ),
            withMutationLock: (canonicalRoot, operation) => (
                this.indexPolicyMutationCoordinator.withLock(canonicalRoot, operation)
            ),
        });
        this.ignoreRuleService = new IgnoreRuleService({

            basePatterns: allIgnorePatterns,
            canonicalizeCodebasePath: (codebasePath) => (
                this.canonicalizeCodebasePath(codebasePath)
            ),
            resolveCollectionName: (codebasePath) => (
                this.resolveCollectionName(codebasePath)
            ),
            ensureRuntimePolicyLoaded: (canonicalRoot) => (
                this.indexPolicyRuntimeService.loadCustomIndexPolicy(canonicalRoot)
            ),
        });
        this.indexAuthorityCoordinator = new IndexAuthorityCoordinator(
            config.generationProofCoordinator ?? createGenerationProofCoordinator(),
            {
                canonicalizeCodebasePath: (codebasePath) => this.canonicalizeCodebasePath(codebasePath),
                clearResolvedIndexPolicyRuntime: (canonicalRoot) => this.clearResolvedIndexPolicyRuntime(canonicalRoot),
                fsyncPath: (targetPath) => this.fsyncPath(targetPath),
                indexPolicyDocumentStore: {
                    captureDocument: (canonicalRoot) => this.indexPolicyDocumentStore.captureDocument(canonicalRoot),
                    resolvePolicyPath: (canonicalRoot) => this.indexPolicyDocumentStore.resolvePolicyPath(canonicalRoot),
                },
                indexPolicyMutationCoordinator: {
                    withLock: (canonicalRoot, operation) => this.indexPolicyMutationCoordinator.withLock(canonicalRoot, operation),
                },
                indexPolicyRuntimeService: {
                    deletePolicyFileToken: (canonicalRoot) => this.indexPolicyRuntimeService.deletePolicyFileToken(canonicalRoot),
                    getPolicyDocumentDigest: (canonicalRoot) => this.indexPolicyRuntimeService.getPolicyDocumentDigest(canonicalRoot),
                    resolveCustomIndexPolicyFileToken: (canonicalRoot) => this.indexPolicyRuntimeService.resolveCustomIndexPolicyFileToken(canonicalRoot),
                },
                refreshRuntimePolicyAuthority: (canonicalRoot) => this.refreshRuntimePolicyAuthority(canonicalRoot),
                restoreTransactionMechanics: this.restoreTransactionMechanics,
                symbolRegistryStateRoot: this.symbolRegistryStateRoot,
                listRelatedCollectionNames: (canonicalRoot) => this.listRelatedCollectionNames(canonicalRoot),
                vectorDatabase: {
                    getCollectionDataObservation: this.vectorDatabase.getCollectionDataObservation,
                    dropCollection: (collectionName) => this.vectorDatabase.dropCollection(collectionName),
                    hasCollection: (collectionName) => this.vectorDatabase.hasCollection(collectionName),
                },
                indexCompletionMarkersEqual: (left, right) => this.indexCompletionMarkersEqual(left, right),
                isPreparedVectorReceiptBoundToCurrentAuthority: (canonicalRoot, receipt) => (
                    this.isPreparedVectorReceiptBoundToCurrentAuthority(canonicalRoot, receipt)
                ),
                resolveCompletionMarkerForCollection: (canonicalRoot, collectionName) => (
                    this.resolveCompletionMarkerForCollection(canonicalRoot, collectionName)
                ),
                resolveGenerationProofIdentity: (canonicalRoot) => this.resolveGenerationProofIdentity(canonicalRoot),
                resolveEffectiveNavigationAuthority: (marker, policy, binding) => (
                    this.resolveEffectiveNavigationAuthority(marker, policy, binding)
                ),
                resolveNavigationObservationToken: (canonicalRoot, generationId, strict) => (
                    this.resolveNavigationObservationToken(canonicalRoot, generationId, strict)
                ),
                resolveRepoConfigObservationToken: (canonicalRoot) => this.resolveRepoConfigObservationToken(canonicalRoot),
                cloneIndexCompletionMarker: (marker) => this.cloneIndexCompletionMarker(marker),
                cloneProvenGenerationReceipt: (receipt) => this.cloneProvenGenerationReceipt(receipt),
                cloneProvenVectorGenerationReceipt: (receipt) => this.cloneProvenVectorGenerationReceipt(receipt),
                publishResolvedIndexPolicy: (policy, binding, publishMutation) => (
                    this.publishResolvedIndexPolicy(policy, binding, publishMutation)
                ),
                resolveProvenGeneration: (canonicalRoot) => this.resolveProvenGeneration(canonicalRoot),
                policyNavigationBindingsEqual: (left, right) => policyNavigationBindingsEqual(left, right),
            },
        );

        this.indexingPipeline = new IndexingPipeline({
            getVectorDatabase: () => this.vectorDatabase,
            languageAnalyzer: this.languageAnalyzer,
            getEmbedding: () => this.embedding,
            assertEmbeddingIdentityCurrent: () => this.assertEmbeddingIdentityCurrent(),
            isHybridEnabled: () => this.getIsHybrid(),
            canonicalizeCodebasePath: (codebasePath) => (
                this.canonicalizeCodebasePath(codebasePath)
            ),
            normalizeRelativePathForCodebase: (codebasePath, filePath) => (
                this.normalizeRelativePathForCodebase(codebasePath, filePath)
            ),
            getIndexedExtensionsForCodebase: (codebasePath) => (
                this.getIndexedExtensionsForCodebase(codebasePath)
            ),
            matchesIgnorePattern: (filePath, codebasePath, isDirectory, matcher) => (
                this.matchesIgnorePattern(filePath, codebasePath, isDirectory, matcher)
            ),
            getSymbolExtractorVersion: () => this.getSymbolExtractorVersion(),
        });
        this.semanticSearchService = new SemanticSearchService({
            getVectorDatabase: () => this.vectorDatabase,
            embeddingAccess: {
                getEmbedding: () => this.embedding,
                assertEmbeddingIdentityCurrent: () => this.assertEmbeddingIdentityCurrent(),
            },
            authority: {
                proveVectorGeneration: (codebasePath) => (
                    this.proveVectorGeneration(codebasePath)
                ),
                revalidateProvenVectorGeneration: (codebasePath, receipt) => (
                    this.revalidateProvenVectorGeneration(codebasePath, receipt)
                ),
                isPreparedReceiptBoundToCurrentAuthority: (codebasePath, receipt) => (
                    this.isPreparedVectorReceiptBoundToCurrentAuthority(codebasePath, receipt)
                ),
            },
            isHybridEnabled: () => this.getIsHybrid(),
            canonicalizeCodebasePath: (codebasePath) => (
                this.canonicalizeCodebasePath(codebasePath)
            ),
            mutationGenerationObserver: config.mutationGenerationObserver,
        });
        this.restoreTransactionMechanics.recoverDurableIndexAuthorityTransactions(config.durableAuthorityRecoveryPublisher);

        console.log(`[Context] 🔧 Initialized with ${this.supportedExtensions.length} supported extensions and ${this.ignoreRuleService.getBasePatterns().length} base ignore patterns`);
        if (envCustomExtensions.length > 0) {
            console.log(`[Context] 📎 Loaded ${envCustomExtensions.length} custom extensions from environment: ${envCustomExtensions.join(', ')}`);
        }
        if (envCustomIgnorePatterns.length > 0) {
            console.log(`[Context] 🚫 Loaded ${envCustomIgnorePatterns.length} custom ignore patterns from environment: ${envCustomIgnorePatterns.join(', ')}`);
        }
    }

    /**
     * Get embedding instance
     */
    getEmbeddingEngine(): Embedding {
        return this.embedding;
    }

    /**
     * Get vector database instance
     */
    getVectorStore(): VectorDatabase {
        return this.vectorDatabase;
    }

    /**
     * Get the normalized language-analysis boundary.
     */
    getLanguageAnalyzer(): LanguageAnalysisPort {
        return this.languageAnalyzer;
    }

    /**
     * Get supported extensions
     */
    getIndexedExtensions(): string[] {
        return [...this.supportedExtensions];
    }

    getIndexedExtensionsForCodebase(codebasePath: string): string[] {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        this.indexPolicyRuntimeService.loadCustomIndexPolicy(canonicalRoot);
        const profile = this.indexPolicyRuntimeService.getIndexProfile(canonicalRoot) || 'default';
        return this.indexPolicyRuntimeService.buildSupportedExtensions(profile, canonicalRoot);
    }

    loadIndexProfileForCodebase(codebasePath: string): SatoriRepoConfig {
        const config = loadSatoriRepoConfig(codebasePath);
        this.setIndexProfileForCodebase(codebasePath, config.profile);
        return config;
    }

    setIndexProfileForCodebase(codebasePath: string, profile: IndexProfile): void {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        this.indexPolicyRuntimeService.setIndexProfileForCodebase(canonicalRoot, profile);
        this.recomputePublishedPolicyRuntimeCompatibility(canonicalRoot);
    }

    /**
     * Get effective ignore patterns.
     * When codebasePath is provided, returns per-codebase effective rules.
     * Without a codebase path, returns global base+runtime layers only.
     */
    getActiveIgnorePatterns(codebasePath?: string): string[] {
        return this.ignoreRuleService.getActivePatterns(codebasePath);
    }

    /**
     * Get synchronizers map
     */
    getActiveSynchronizers(): Map<string, FileSynchronizer> {
        return new Map(this.synchronizers);
    }

    /**
     * Set synchronizer for a collection
     */
    registerSynchronizer(collectionName: string, synchronizer: FileSynchronizer): void {
        this.synchronizers.set(collectionName, synchronizer);
        this.synchronizerMutationTargets.delete(collectionName);
    }

    /**
     * Public wrapper for loadIgnorePatterns private method
     */
    async loadResolvedIgnorePatterns(codebasePath: string): Promise<void> {
        return this.loadIgnorePatterns(codebasePath);
    }

    /**
     * Reload ignore rules for a codebase and return the effective pattern list.
     * This is deterministic (replace semantics), not append-only.
     */
    async reloadIgnoreRulesForCodebase(codebasePath: string): Promise<string[]> {
        await this.loadIgnorePatterns(codebasePath);
        return this.getActiveIgnorePatterns(codebasePath);
    }

    /**
     * Recreate synchronizer for a codebase using currently active ignore patterns.
     * This is used when ignore rules change and we need deterministic reconciliation.
     */
    async recreateSynchronizerForCodebase(
        codebasePath: string,
        assertMutationCurrent?: () => void,
        publishMutation?: (publish: () => void) => void,
        options: { requireAuthorityCheckpoint?: boolean } = {},
    ): Promise<void> {
        this.loadIndexProfileForCodebase(codebasePath);
        const collectionName = this.resolveCollectionName(codebasePath);
        const authorityBefore = options.requireAuthorityCheckpoint
            ? await this.proveIndexedGeneration(codebasePath)
            : null;
        if (options.requireAuthorityCheckpoint && !authorityBefore) {
            throw new Error(`Cannot recreate source freshness state for '${codebasePath}': no authoritative indexed generation is available.`);
        }
        const synchronizer = new FileSynchronizer(
            codebasePath,
            this.getActiveIgnorePatterns(codebasePath),
            this.getIndexedExtensionsForCodebase(codebasePath),
            authorityBefore ? {
                checkpointIdentity: authorityBefore.collectionName,
                checkpointAuthority: {
                    collectionName: authorityBefore.collectionName,
                    markerRunId: authorityBefore.marker.runId,
                    indexPolicyHash: authorityBefore.marker.indexPolicyHash,
                },
            } : {},
        );
        await synchronizer.initialize(assertMutationCurrent, publishMutation, {
            requireExistingCheckpoint: authorityBefore !== null,
        });
        if (authorityBefore) {
            assertMutationCurrent?.();
            const authorityAfter = await this.proveIndexedGeneration(codebasePath);
            if (
                !authorityAfter
                || authorityAfter.collectionName !== authorityBefore.collectionName
                || authorityAfter.policyDocumentDigest !== authorityBefore.policyDocumentDigest
                || !this.indexCompletionMarkersEqual(authorityAfter.marker, authorityBefore.marker)
            ) {
                throw new Error(`Cannot register source freshness state for '${codebasePath}': indexed authority changed while its checkpoint was loading.`);
            }
        }
        this.synchronizers.set(collectionName, synchronizer);
        this.synchronizerMutationTargets.delete(collectionName);
    }

    /**
     * Return currently tracked (indexable under active ignore rules) relative paths
     * from the active synchronizer snapshot for this codebase.
     */
    getTrackedRelativePaths(codebasePath: string): string[] {
        const collectionName = this.resolveCollectionName(codebasePath);
        const synchronizer = this.synchronizers.get(collectionName);
        if (!synchronizer) {
            return [];
        }
        return this.normalizeRelativePathsForCodebase(codebasePath, synchronizer.getTrackedRelativePaths());
    }

    hasSynchronizerForCodebase(codebasePath: string): boolean {
        return this.synchronizers.has(this.resolveCollectionName(codebasePath));
    }

    async inspectSourceFreshnessCheckpoint(
        codebasePath: string,
        checkpointIdentity?: string,
        requestBoundReceipt?: ProvenVectorGenerationReceipt,
    ): Promise<ProvenSourceFreshnessCheckpointEvidence> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        const activationReceipt = requestBoundReceipt && 'navigation' in requestBoundReceipt
            ? this.consumeActivationSourceGenerationReceipt(
                canonicalRoot,
                requestBoundReceipt as ProvenGenerationReceipt,
            )
            : null;
        const retainedActiveReceipt = activationReceipt
            ? null
            : this.resolveActiveGenerationDuringRetention(canonicalRoot);
        // Retention can advance a shared backend observation while deleting only
        // inactive generations. Reuse the already-proven active tuple while that
        // owned mutation is live; otherwise join it before deciding whether the
        // backend observation still matches. The exact receipt returned by this
        // runtime's activation is likewise consumed once by the immediate
        // post-sync checkpoint inspection.
        if (!activationReceipt && !retainedActiveReceipt) {
            await this.waitForPublicationRetention(canonicalRoot);
        }
        const trustedGenerationReceipt = activationReceipt ?? retainedActiveReceipt;
        const receipt = trustedGenerationReceipt
            ? this.cloneProvenVectorGenerationReceipt(trustedGenerationReceipt)
            : requestBoundReceipt
            && this.isPreparedVectorReceiptBoundToCurrentAuthority(canonicalRoot, requestBoundReceipt)
            ? requestBoundReceipt
            : await this.proveVectorGeneration(canonicalRoot);
        const requestedIdentity = checkpointIdentity?.trim();
        if (!receipt || (requestedIdentity && requestedIdentity !== receipt.collectionName)) {
            return {
                status: 'corrupt',
                message: 'Source freshness checkpoint cannot be inspected because no matching authoritative completed generation is available.',
            };
        }
        const generationReceipt = trustedGenerationReceipt ?? await this.resolveGenerationReceipt(
            canonicalRoot,
            receipt,
            undefined,
            true,
        );
        if (!generationReceipt) {
            return {
                status: 'corrupt',
                message: 'Source freshness checkpoint cannot be inspected because its navigation generation is not authoritative.',
            };
        }
        const inspector = new FileSynchronizer(
            codebasePath,
            [],
            [],
            {
                checkpointIdentity: receipt.collectionName,
                checkpointAuthority: {
                    collectionName: receipt.collectionName,
                    markerRunId: receipt.marker.runId,
                    indexPolicyHash: receipt.marker.indexPolicyHash,
                },
            },
        );
        const checkpoint = await inspector.inspectOwnedSnapshot();
        if (checkpoint.status !== 'valid') return checkpoint;
        const preparedReceipt = this.cloneProvenGenerationReceipt(generationReceipt);
        const preparedIdentity = await this.resolveGenerationProofIdentity(canonicalRoot);
        if (!preparedIdentity) {
            // Backends without a cheap immutable publication observation retain
            // the exact validation above, but cannot safely propagate its proof.
            return checkpoint;
        }
        this.indexAuthorityCoordinator.setPreparedGenerationReceipt(preparedReceipt, preparedIdentity);
        return { ...checkpoint, generationReceipt: preparedReceipt };
    }

    private consumeActivationSourceGenerationReceipt(
        canonicalRoot: string,
        receipt: ProvenGenerationReceipt,
    ): ProvenGenerationReceipt | null {
        const preparedIdentity = this.indexAuthorityCoordinator.getPreparedGenerationReceipt(receipt);
        const cached = this.indexAuthorityCoordinator.getGenerationProof(canonicalRoot);
        if (
            !preparedIdentity
            || !cached
            || cached.source !== 'activation'
            || cached.identity !== preparedIdentity
            || !cached.generationReceipt
            || !cached.navigationArtifactsValidated
            || !this.cachedGenerationProofMatches(canonicalRoot, cached, cached.identity, receipt)
            || receipt.observations.navigationToken
                !== cached.generationReceipt.observations.navigationToken
            || receipt.navigation.generationId
                !== cached.generationReceipt.navigation.generationId
            || receipt.navigation.navigationSealHash
                !== cached.generationReceipt.navigation.navigationSealHash
        ) {
            return null;
        }
        this.indexAuthorityCoordinator.deletePreparedGenerationReceipt(receipt);
        return this.cloneProvenGenerationReceipt(cached.generationReceipt);
    }

    private resolveActiveGenerationDuringRetention(
        canonicalRoot: string,
    ): ProvenGenerationReceipt | null {
        if (!this.publicationRetentionQueues.has(canonicalRoot)) return null;
        const cached = this.indexAuthorityCoordinator.getGenerationProof(canonicalRoot);
        if (
            !cached
            || cached.source !== 'activation'
            || !cached.generationReceipt
            || !cached.navigationArtifactsValidated
            || !this.isPreparedVectorReceiptBoundToCurrentAuthority(
                canonicalRoot,
                cached.vectorReceipt,
            )
        ) return null;
        return this.cloneProvenGenerationReceipt(cached.generationReceipt);
    }

    public isPreparedVectorReceiptBoundToCurrentAuthority(
        canonicalRoot: string,
        receipt: ProvenVectorGenerationReceipt,
    ): boolean {
        const policy = this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot);
        const binding = this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalRoot);
        const policyDocumentDigest = this.indexPolicyRuntimeService.getPolicyDocumentDigest(canonicalRoot);
        if (!policy || !binding || !policyDocumentDigest) return false;

        return receipt.policy.canonicalRoot === canonicalRoot
            && receipt.marker.codebasePath === canonicalRoot
            && receipt.collectionName === binding.collectionName
            && receipt.policy.policyHash === policy.policyHash
            && receipt.policyDocumentDigest === policyDocumentDigest
            && receipt.marker.indexPolicyHash === policy.policyHash
            && receipt.exactPayloadCount === receipt.marker.totalChunks
            && receipt.observations.profileFileToken
                === this.resolveRepoConfigObservationToken(canonicalRoot)
            && receipt.observations.policyFileToken
                === this.indexPolicyRuntimeService.resolveCustomIndexPolicyFileToken(canonicalRoot)
            && this.indexPolicyRuntimeService.getPolicyRuntimeCompatibility(canonicalRoot) === true
            && this.markerMatchesSealedAuthority(receipt.marker, policy, binding);
    }

    private async acceptPreparedSourceGenerationReceipt(
        canonicalRoot: string,
        receipt: ProvenGenerationReceipt,
    ): Promise<ProvenGenerationReceipt | null> {
        const preparedIdentity = this.indexAuthorityCoordinator.getPreparedGenerationReceipt(receipt);
        if (!preparedIdentity) return null;
        this.refreshRuntimePolicyAuthority(canonicalRoot);
        if (!this.isPreparedVectorReceiptBoundToCurrentAuthority(canonicalRoot, receipt)) return null;
        const policy = this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot);
        const binding = this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalRoot);
        const authority = policy && binding
            ? this.resolveEffectiveNavigationAuthority(receipt.marker, policy, binding)
            : null;
        if (
            !authority
            || authority.status !== 'sealed'
            || receipt.navigation.generationId !== authority.generationId
            || receipt.navigation.navigationSealHash !== authority.sealHash
        ) return null;
        const currentIdentity = await this.resolveGenerationProofIdentity(canonicalRoot);
        if (currentIdentity !== preparedIdentity) return null;
        return this.cloneProvenGenerationReceipt(receipt);
    }

    getRegisteredSourceFreshnessCheckpointObservation(codebasePath: string): string | null {
        const synchronizer = this.synchronizers.get(this.resolveCollectionName(codebasePath));
        return synchronizer?.getOwnedSnapshotObservationToken() ?? null;
    }

    private async resolveCheckpointComparisonSynchronizer(
        canonicalRoot: string,
        receipt: ProvenGenerationReceipt,
        observationToken: string,
    ): Promise<FileSynchronizer | null> {
        const checkpointAuthority = {
            collectionName: receipt.collectionName,
            markerRunId: receipt.marker.runId,
            indexPolicyHash: receipt.marker.indexPolicyHash,
        };
        const registered = this.synchronizers.get(this.resolveCollectionName(canonicalRoot));
        if (
            registered
            && registered.ownsCheckpointIdentity(receipt.collectionName)
            && registered.ownsCheckpointAuthority(checkpointAuthority)
            && registered.getOwnedSnapshotObservationToken() === observationToken
        ) {
            return registered;
        }

        const inspector = new FileSynchronizer(
            canonicalRoot,
            [],
            [],
            {
                checkpointIdentity: receipt.collectionName,
                checkpointAuthority,
            },
        );
        try {
            await inspector.initialize(
                undefined,
                undefined,
                { requireExistingCheckpoint: true },
            );
        } catch {
            return null;
        }
        if (inspector.getOwnedSnapshotObservationToken() !== observationToken) {
            return null;
        }
        const collectionName = this.resolveCollectionName(canonicalRoot);
        this.synchronizers.set(collectionName, inspector);
        this.synchronizerMutationTargets.delete(collectionName);
        return inspector;
    }

    /**
     * Compare explicit dirty paths with the source checkpoint owned by the
     * proven active publication. The checkpoint may be loaded into runtime
     * memory, but no source checkpoint or publication state is advanced.
     */
    async compareSourcePathsToFreshnessCheckpoint(
        codebasePath: string,
        relativePaths: readonly string[],
        requestBoundReceipt?: ProvenVectorGenerationReceipt,
    ): Promise<SourceFreshnessPathComparison> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        const checkpoint = await this.inspectSourceFreshnessCheckpoint(
            canonicalRoot,
            undefined,
            requestBoundReceipt,
        );
        if (checkpoint.status !== 'valid' || !checkpoint.generationReceipt) {
            return { status: 'unavailable' };
        }

        const receipt = checkpoint.generationReceipt;
        const synchronizer = await this.resolveCheckpointComparisonSynchronizer(
            canonicalRoot,
            receipt,
            checkpoint.observationToken,
        );
        if (!synchronizer) {
            return { status: 'unavailable' };
        }

        const comparison = await synchronizer.comparePathsToOwnedCheckpoint(relativePaths);
        if (comparison.status !== 'matches') {
            return comparison;
        }

        const stillCurrent = await this.acceptPreparedSourceGenerationReceipt(
            canonicalRoot,
            receipt,
        );
        if (
            !stillCurrent
            || synchronizer.getOwnedSnapshotObservationToken() !== checkpoint.observationToken
        ) {
            return { status: 'unavailable' };
        }
        return comparison;
    }

    /**
     * Compare the complete searchable source tree with the checkpoint owned by
     * the proven active publication. This is a read-only request barrier.
     */
    async compareAllSourceToFreshnessCheckpoint(
        codebasePath: string,
        requestBoundReceipt?: ProvenVectorGenerationReceipt,
    ): Promise<SourceFreshnessPathComparison> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        const checkpoint = await this.inspectSourceFreshnessCheckpoint(
            canonicalRoot,
            undefined,
            requestBoundReceipt,
        );
        if (checkpoint.status !== 'valid' || !checkpoint.generationReceipt) {
            return { status: 'unavailable' };
        }

        const receipt = checkpoint.generationReceipt;
        const synchronizer = await this.resolveCheckpointComparisonSynchronizer(
            canonicalRoot,
            receipt,
            checkpoint.observationToken,
        );
        if (!synchronizer) {
            return { status: 'unavailable' };
        }

        const comparison = await synchronizer.compareAllSourceToOwnedCheckpoint();
        if (comparison.status !== 'matches') {
            return comparison;
        }

        const stillCurrent = await this.acceptPreparedSourceGenerationReceipt(
            canonicalRoot,
            receipt,
        );
        if (
            !stillCurrent
            || synchronizer.getOwnedSnapshotObservationToken() !== checkpoint.observationToken
        ) {
            return { status: 'unavailable' };
        }
        return comparison;
    }

    /**
     * Compare the current searchable source observation with the checkpoint
     * owned by the proven active publication. The synchronizer reuses sealed
     * hashes for paths whose size, mtime, and ctime are unchanged and hashes
     * every path whose observation changed.
     */
    async compareSourceObservationToFreshnessCheckpoint(
        codebasePath: string,
        requestBoundReceipt?: ProvenVectorGenerationReceipt,
    ): Promise<SourceFreshnessPathComparison> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        const checkpoint = await this.inspectSourceFreshnessCheckpoint(
            canonicalRoot,
            undefined,
            requestBoundReceipt,
        );
        if (checkpoint.status !== 'valid' || !checkpoint.generationReceipt) {
            return { status: 'unavailable' };
        }

        const receipt = checkpoint.generationReceipt;
        const synchronizer = await this.resolveCheckpointComparisonSynchronizer(
            canonicalRoot,
            receipt,
            checkpoint.observationToken,
        );
        if (!synchronizer) {
            return { status: 'unavailable' };
        }

        const comparison = await synchronizer.compareSourceObservationToOwnedCheckpoint();
        if (comparison.status !== 'matches') {
            return comparison;
        }

        const stillCurrent = await this.acceptPreparedSourceGenerationReceipt(
            canonicalRoot,
            receipt,
        );
        if (
            !stillCurrent
            || synchronizer.getOwnedSnapshotObservationToken() !== checkpoint.observationToken
        ) {
            return { status: 'unavailable' };
        }
        return comparison;
    }

    /**
     * Delete indexed chunks for a list of relative paths in a codebase.
     * Returns the number of file paths processed for deletion.
     */
    async deleteIndexedPathsByRelativePaths(
        codebasePath: string,
        relativePaths: string[],
        assertMutationCurrent?: () => void,
    ): Promise<number> {
        const collectionName = await this.getActiveIndexedCollectionName(codebasePath) || this.getWriteCollectionName(codebasePath);
        const uniquePaths = Array.from(new Set(this.normalizeRelativePathsForCodebase(codebasePath, relativePaths)));

        for (const relativePath of uniquePaths) {
            await this.deleteFileChunks(collectionName, relativePath, assertMutationCurrent);
        }
        return uniquePaths.length;
    }

    /**
     * Get isHybrid setting from environment variable with default true
     */
    private getIsHybrid(): boolean {
        const isHybridEnv = envManager.get('HYBRID_MODE');
        if (isHybridEnv === undefined || isHybridEnv === null) {
            return true; // Default to true
        }
        return isHybridEnv.toLowerCase() === 'true';
    }

    /**
     * Generate collection name based on codebase path and hybrid mode
     */
    public resolveCollectionName(codebasePath: string): string {
        const isHybrid = this.getIsHybrid();
        const canonicalPath = this.canonicalizeCodebasePath(codebasePath);
        const hash = crypto.createHash('md5').update(canonicalPath).digest('hex');
        const prefix = isHybrid === true ? 'hybrid_code_chunks' : 'code_chunks';
        return `${prefix}_${hash.substring(0, 8)}`;
    }

    private buildCollectionFamilies(codebasePath: string): {
        canonicalRoot: string;
        hash: string;
        activeFamilyName: string;
        alternateFamilyName: string;
    } {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        const hash = crypto.createHash('md5').update(canonicalRoot).digest('hex').substring(0, 8);
        const activeFamilyName = this.resolveCollectionName(codebasePath);
        const alternateFamilyName = activeFamilyName.startsWith('hybrid_code_chunks_')
            ? `code_chunks_${hash}`
            : `hybrid_code_chunks_${hash}`;
        return {
            canonicalRoot,
            hash,
            activeFamilyName,
            alternateFamilyName,
        };
    }

    private isRelatedCollectionName(collectionName: string, familyName: string): boolean {
        return collectionName === familyName || collectionName.startsWith(`${familyName}__gen_`);
    }

    private getWriteCollectionName(codebasePath: string): string {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        return this.writeCollectionOverrides.get(canonicalRoot) || this.resolveCollectionName(codebasePath);
    }

    private async listRelatedCollectionNames(codebasePath: string): Promise<string[]> {
        const { activeFamilyName, alternateFamilyName } = this.buildCollectionFamilies(codebasePath);

        try {
            const collectionNames = await this.vectorDatabase.listCollections();
            return collectionNames
                .filter((collectionName) =>
                    this.isRelatedCollectionName(collectionName, activeFamilyName)
                    || this.isRelatedCollectionName(collectionName, alternateFamilyName)
                )
                .sort((left, right) => left.localeCompare(right));
        } catch {
            const fallbackNames = [activeFamilyName, alternateFamilyName];
            const existingNames: string[] = [];
            for (const familyName of fallbackNames) {
                try {
                    if (await this.vectorDatabase.hasCollection(familyName)) {
                        existingNames.push(familyName);
                    }
                } catch {
                    continue;
                }
            }
            return existingNames.sort((left, right) => left.localeCompare(right));
        }
    }

    private parseCompletionMarker(
        codebasePath: string,
        rawMetadata: unknown
    ): IndexCompletionMarkerDocument | null {
        const decoded = (() => {
            if (typeof rawMetadata === 'string') {
                try {
                    return JSON.parse(rawMetadata) as unknown;
                } catch {
                    return null;
                }
            }
            if (rawMetadata && typeof rawMetadata === 'object') {
                return rawMetadata;
            }
            return null;
        })();
        if (!decoded) return null;
        const inspected = inspectCompletionMarker(decoded);
        if (inspected.status !== 'current') return null;
        const parsed = inspected.value;
        const parsedCodebasePath = this.canonicalizeCodebasePath(parsed.codebasePath);
        const expectedCodebasePath = this.canonicalizeCodebasePath(codebasePath);
        if (parsedCodebasePath !== expectedCodebasePath) return null;
        return { ...parsed, codebasePath: parsedCodebasePath };
    }

    private parseCompletionControlRecord(
        codebasePath: string,
        record: VectorControlRecord,
    ): IndexCompletionMarkerDocument | null {
        if (!this.completionControlRecordKindMatches(record)) {
            return null;
        }
        return this.parseCompletionMarker(codebasePath, record.metadata);
    }

    private completionControlRecordKindMatches(record: VectorControlRecord): boolean {
        return typeof record.metadata.kind === 'string' && record.kind === record.metadata.kind;
    }

    private async resolveCompletionMarkerForCollection(
        codebasePath: string,
        collectionName: string
    ): Promise<IndexCompletionMarkerDocument | null> {
        const record = await this.vectorDatabase.getControl(collectionName, INDEX_COMPLETION_MARKER_DOC_ID);
        return record ? this.parseCompletionControlRecord(codebasePath, record) : null;
    }

    private async resolveRepairCompletionMarkerForCollection(
        codebasePath: string,
        collectionName: string,
    ): Promise<RepairCompletionMarkerResolution> {
        const record = await this.vectorDatabase.getControl(collectionName, INDEX_COMPLETION_MARKER_DOC_ID);
        if (!record) {
            return { status: 'missing' };
        }
        const marker = this.parseCompletionControlRecord(codebasePath, record);
        if (marker) {
            return { status: 'matched', marker };
        }
        return { status: 'malformed' };
    }

    private async collectionHasIndexedPayload(
        collectionName: string,
        marker: IndexCompletionMarkerDocument
    ): Promise<boolean> {
        const count = await this.countIndexedPayloadExactly(collectionName, undefined, marker.totalChunks);
        return count === marker.totalChunks;
    }

    private async countIndexedPayloadExactly(
        collectionName: string,
        filter: VectorFilter | undefined,
        expectedMaximum?: number,
    ): Promise<number | null> {
        if (typeof this.vectorDatabase.countDocuments === 'function') {
            return this.vectorDatabase.countDocuments(collectionName, filter);
        }

        // Query-only adapters can prove bounded result sets by requesting one row
        // beyond the expected maximum. A full-size response is ambiguous because
        // the backend may have truncated it, so fail closed.
        const maximumExactQueryRows = 16384;
        const limit = expectedMaximum === undefined
            ? maximumExactQueryRows
            : expectedMaximum + 1;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximumExactQueryRows) {
            return null;
        }
        const rows = await this.vectorDatabase.queryDocuments(collectionName, {
            filter,
            fields: ['id'],
            limit,
        });
        if (expectedMaximum === undefined && rows.length === maximumExactQueryRows) {
            return null;
        }
        return rows.length;
    }

    private async collectionHasAnyIndexedPayload(collectionName: string): Promise<boolean> {
        const rows = await this.vectorDatabase.queryDocuments(collectionName, { fields: ['id'], limit: 1 });
        return rows.some((row) => typeof row?.id === 'string' && row.id !== INDEX_COMPLETION_MARKER_DOC_ID);
    }

    private buildIndexCompletionFingerprint(): IndexCompletionFingerprint {
        const embeddingIdentity = this.assertEmbeddingIdentityCurrent();
        return {
            embeddingProvider: embeddingIdentity.provider,
            embeddingModel: embeddingIdentity.model,
            embeddingDimension: embeddingIdentity.dimension,
            embeddingArtifactDigest: embeddingIdentity.artifactDigest,
            embeddingNormalizationPolicy: embeddingIdentity.normalizationPolicy,
            vectorStoreProvider: this.vectorStoreProvider,
            schemaVersion: this.getIsHybrid() === true ? 'hybrid_v3' : 'dense_v3',
            parserVersion: LANGUAGE_PARSER_VERSION,
            extractorVersion: SYMBOL_EXTRACTOR_VERSION,
            relationshipVersion: this.getRelationshipVersion(),
            embeddingProjectionVersion: EMBEDDING_PROJECTION_VERSION,
            lexicalProjectionVersion: LEXICAL_PROJECTION_VERSION,
        };
    }

    public indexCompletionMarkersEqual(
        left: IndexCompletionMarkerDocument,
        right: IndexCompletionMarkerDocument,
    ): boolean {
        const navigationEqual = left.navigation.status === right.navigation.status
            && (left.navigation.status === 'not_bound'
                || (right.navigation.status === 'sealed'
                    && left.navigation.generationId === right.navigation.generationId
                    && left.navigation.symbolRegistryManifestHash === right.navigation.symbolRegistryManifestHash
                    && left.navigation.relationshipManifestHash === right.navigation.relationshipManifestHash
                    && left.navigation.sealHash === right.navigation.sealHash));
        return left.codebasePath === right.codebasePath
            && left.runId === right.runId
            && left.indexedFiles === right.indexedFiles
            && left.totalChunks === right.totalChunks
            && left.completedAt === right.completedAt
            && left.indexPolicyHash === right.indexPolicyHash
            && left.indexStatus === right.indexStatus
            && navigationEqual
            && indexFingerprintsEqual(left.fingerprint, right.fingerprint)
            && indexFingerprintsEqual(right.fingerprint, left.fingerprint);
    }

    private markerMatchesSealedAuthority(
        marker: IndexCompletionMarkerDocument,
        policy: ResolvedIndexPolicy,
        binding: IndexPolicyBinding & { policyHash: string },
    ): boolean {
        return this.resolveEffectiveNavigationAuthority(marker, policy, binding) !== null;
    }

    private resolveEffectiveNavigationAuthority(
        marker: IndexCompletionMarkerDocument,
        policy: ResolvedIndexPolicy,
        binding: IndexPolicyBinding & { policyHash: string },
    ): EffectiveNavigationAuthority | null {
        if (
            marker.indexPolicyHash !== policy.policyHash
            || binding.policyHash !== marker.indexPolicyHash
        ) return null;

        const compatibility = classifyRepairIndexCompatibility(
            marker.fingerprint,
            this.buildIndexCompletionFingerprint(),
        );
        if (
            compatibility.status !== 'compatible'
            && compatibility.status !== 'relationship_only_upgrade'
        ) return null;

        const publication = binding.publication;
        if (publication && (
            publication.sourceCheckpoint.collectionName !== binding.collectionName
            || publication.sourceCheckpoint.markerRunId !== marker.runId
            || publication.sourceCheckpoint.indexPolicyHash !== marker.indexPolicyHash
        )) return null;

        if (compatibility.status === 'compatible') {
            if (publication) {
                if (
                    marker.indexStatus !== 'completed'
                    || marker.navigation.status !== 'sealed'
                    || binding.navigation.status !== 'sealed'
                ) return null;
                if (
                    policyNavigationBindingsEqual(
                        binding.navigation,
                        policyNavigationBindingFromMarker(marker.navigation),
                    )
                    && publication.graph.manifestHash
                        === marker.navigation.relationshipManifestHash
                ) {
                    return {
                        status: 'sealed',
                        generationId: marker.navigation.generationId,
                        sealHash: marker.navigation.sealHash,
                        expectedSymbolRegistryManifestHash:
                            marker.navigation.symbolRegistryManifestHash,
                        expectedRelationshipManifestHash:
                            marker.navigation.relationshipManifestHash,
                        relationshipOnlyUpgrade: false,
                        useBoundGeneration: true,
                    };
                }
                return {
                    status: 'sealed',
                    generationId: binding.navigation.generationId,
                    sealHash: binding.navigation.sealHash,
                    expectedRelationshipManifestHash: publication.graph.manifestHash,
                    relationshipOnlyUpgrade: false,
                    useBoundGeneration: true,
                };
            }
            if (!policyNavigationBindingsEqual(
                binding.navigation,
                policyNavigationBindingFromMarker(marker.navigation),
            )) return null;
            if (marker.navigation.status === 'not_bound') {
                return {
                    status: 'not_bound',
                    relationshipOnlyUpgrade: false,
                    useBoundGeneration: false,
                };
            }
            return {
                status: 'sealed',
                generationId: marker.navigation.generationId,
                sealHash: marker.navigation.sealHash,
                expectedSymbolRegistryManifestHash: marker.navigation.symbolRegistryManifestHash,
                expectedRelationshipManifestHash: marker.navigation.relationshipManifestHash,
                relationshipOnlyUpgrade: false,
                useBoundGeneration: false,
            };
        }

        if (
            !publication
            || marker.indexStatus !== 'completed'
            || marker.navigation.status !== 'sealed'
            || binding.navigation.status !== 'sealed'
        ) return null;
        return {
            status: 'sealed',
            generationId: binding.navigation.generationId,
            sealHash: binding.navigation.sealHash,
            expectedRelationshipManifestHash: publication.graph.manifestHash,
            relationshipOnlyUpgrade: true,
            useBoundGeneration: true,
        };
    }

    private effectiveNavigationAuthoritiesEqual(
        left: EffectiveNavigationAuthority,
        right: EffectiveNavigationAuthority,
    ): boolean {
        return JSON.stringify(left) === JSON.stringify(right);
    }

    private async proveEffectiveNavigationAuthority(
        canonicalRoot: string,
        authority: EffectiveNavigationAuthority,
        validateArtifacts = false,
    ): Promise<NavigationGenerationProof> {
        if (authority.status === 'not_bound') return { status: 'not_bound' };
        let generation: CurrentNavigationGeneration | null;
        try {
            generation = await (authority.useBoundGeneration
                ? resolveNavigationGeneration(
                    this.symbolRegistryStateRoot,
                    canonicalRoot,
                    authority.generationId,
                )
                : resolveCurrentNavigationGeneration(
                    this.symbolRegistryStateRoot,
                    canonicalRoot,
                ));
        } catch (error) {
            return {
                status: error instanceof RetiredNavigationPointerError
                    ? 'requires_reindex'
                    : error instanceof UnsupportedNavigationPointerError
                        ? 'unsupported'
                        : 'corrupt',
            };
        }
        if (!generation) return { status: 'missing' };
        if (
            generation.generationId !== authority.generationId
            || generation.navigationSealHash !== authority.sealHash
            || (
                authority.expectedSymbolRegistryManifestHash !== undefined
                && generation.symbolRegistryManifestHash
                    !== authority.expectedSymbolRegistryManifestHash
            )
            || generation.relationshipManifestHash
                !== authority.expectedRelationshipManifestHash
        ) return { status: 'incompatible' };

        if (validateArtifacts || authority.relationshipOnlyUpgrade) {
            const registryRead = await readSymbolRegistrySidecar({
                normalizedRootPath: canonicalRoot,
                stateRoot: this.symbolRegistryStateRoot,
                ...(authority.useBoundGeneration
                    ? { generationId: authority.generationId }
                    : {}),
            });
            if (registryRead.status !== 'ok') {
                return { status: registryRead.status };
            }
            const relationshipRead = await readRelationshipSidecar({
                normalizedRootPath: canonicalRoot,
                expectedSymbolRegistryManifestHash: generation.symbolRegistryManifestHash,
                stateRoot: this.symbolRegistryStateRoot,
                ...(authority.useBoundGeneration
                    ? { generationId: authority.generationId }
                    : {}),
            });
            if (relationshipRead.status !== 'ok') {
                return { status: relationshipRead.status };
            }
            if (
                authority.relationshipOnlyUpgrade
                && (
                    registryRead.registry.manifest.relationshipVersion
                        !== this.getRelationshipVersion()
                    || relationshipRead.manifest.relationshipVersion
                        !== this.getRelationshipVersion()
                )
            ) return { status: 'incompatible' };
            const sealProof = await verifyNavigationGenerationSealArtifacts({
                stateRoot: this.symbolRegistryStateRoot,
                normalizedRootPath: canonicalRoot,
                ...(authority.useBoundGeneration
                    ? { generationId: authority.generationId }
                    : {}),
                registry: registryRead.registry,
                relationshipManifest: relationshipRead.manifest,
            });
            if (sealProof.status !== 'ok') return { status: sealProof.status };
        }
        try {
            const observation = this.resolveNavigationObservation(
                canonicalRoot,
                generation.generationId,
                !authority.useBoundGeneration,
            );
            return observation.status === 'valid'
                ? {
                    status: 'valid',
                    generation: { ...generation },
                    observationToken: observation.token,
                }
                : { status: observation.status };
        } catch {
            return { status: 'corrupt' };
        }
    }

    private cloneIndexCompletionMarker(marker: IndexCompletionMarkerDocument): IndexCompletionMarkerDocument {
        return {
            ...marker,
            fingerprint: { ...marker.fingerprint },
            navigation: { ...marker.navigation },
        };
    }

    private async writeCompletedIndexMarker(
        codebasePath: string,
        indexedFiles: number,
        totalChunks: number,
        collectionName?: string,
        indexStatus: 'completed' | 'limit_reached' = 'completed',
        assertMutationCurrent?: () => void,
        navigationCandidate?: StagedNavigationSidecarGeneration,
        indexPolicyHash: string = this.buildIndexPolicyHash(codebasePath),
        runId: string = crypto.randomUUID(),
    ): Promise<IndexCompletionMarkerDocument> {
        const currentNavigation = indexStatus === 'completed' && !navigationCandidate
            ? await resolveCurrentNavigationGeneration(
                this.symbolRegistryStateRoot,
                this.canonicalizeCodebasePath(codebasePath),
            ).catch(() => null)
            : null;
        const marker: IndexCompletionMarkerDocument = {
            kind: 'satori_index_completion_v3',
            codebasePath: this.canonicalizeCodebasePath(codebasePath),
            fingerprint: this.buildIndexCompletionFingerprint(),
            indexedFiles,
            totalChunks,
            completedAt: new Date().toISOString(),
            runId,
            indexPolicyHash,
            indexStatus,
            navigation: navigationCandidate ? {
                status: 'sealed',
                generationId: navigationCandidate.generationId,
                symbolRegistryManifestHash: navigationCandidate.manifestHash,
                relationshipManifestHash: navigationCandidate.relationshipManifestHash,
                sealHash: navigationCandidate.navigationSealHash,
            } : currentNavigation ? {
                status: 'sealed',
                generationId: currentNavigation.generationId,
                symbolRegistryManifestHash: currentNavigation.symbolRegistryManifestHash,
                relationshipManifestHash: currentNavigation.relationshipManifestHash,
                sealHash: currentNavigation.navigationSealHash,
            } : { status: 'not_bound' },
        };
        await this.writeIndexCompletionMarker(codebasePath, marker, collectionName, assertMutationCurrent);
        return this.cloneIndexCompletionMarker(marker);
    }

    private async resolveActiveIndexedCollection(
        codebasePath: string
    ): Promise<{ collectionName: string; marker: IndexCompletionMarkerDocument } | null> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        this.refreshRuntimePolicyAuthority(canonicalRoot);
        const publishedPolicy = this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot);
        const policyBinding = this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalRoot);
        if (
            !publishedPolicy
            || !policyBinding
            || publishedPolicy.canonicalRoot !== canonicalRoot
            || policyBinding.policyHash !== publishedPolicy.policyHash
            || this.indexPolicyRuntimeService.getPolicyRuntimeCompatibility(canonicalRoot) !== true
        ) {
            return null;
        }
        const {
            activeFamilyName,
            alternateFamilyName,
        } = this.buildCollectionFamilies(codebasePath);
        const familyCollectionNames = await this.listRelatedCollectionNames(codebasePath);
        const activePolicyHash = publishedPolicy.policyHash;

        const candidates: Array<{
            collectionName: string;
            marker: IndexCompletionMarkerDocument;
            familyPriority: number;
        }> = [];

        for (const collectionName of familyCollectionNames) {
            const marker = await this.resolveCompletionMarkerForCollection(codebasePath, collectionName);
            if (!marker) {
                continue;
            }
            if (marker.indexPolicyHash !== activePolicyHash) {
                continue;
            }
            if (
                policyBinding.policyHash !== marker.indexPolicyHash
                || policyBinding.collectionName !== collectionName
            ) {
                continue;
            }
            const navigationAuthority = this.resolveEffectiveNavigationAuthority(
                marker,
                publishedPolicy,
                policyBinding,
            );
            if (!navigationAuthority) continue;
            if (!(await this.collectionHasIndexedPayload(collectionName, marker))) {
                continue;
            }
            if (
                navigationAuthority.status === 'sealed'
                && (await this.proveEffectiveNavigationAuthority(
                    canonicalRoot,
                    navigationAuthority,
                    navigationAuthority.relationshipOnlyUpgrade,
                )).status !== 'valid'
            ) {
                continue;
            }

            const familyPriority = this.isRelatedCollectionName(collectionName, activeFamilyName)
                ? 0
                : this.isRelatedCollectionName(collectionName, alternateFamilyName)
                    ? 1
                    : 2;
            candidates.push({ collectionName, marker, familyPriority });
        }

        if (candidates.length === 0) {
            return null;
        }

        candidates.sort((left, right) => {
            if (left.familyPriority !== right.familyPriority) {
                return left.familyPriority - right.familyPriority;
            }

            const leftCompletedAt = Date.parse(left.marker.completedAt);
            const rightCompletedAt = Date.parse(right.marker.completedAt);
            if (leftCompletedAt !== rightCompletedAt) {
                return rightCompletedAt - leftCompletedAt;
            }

            return left.collectionName.localeCompare(right.collectionName);
        });

        const [selected] = candidates;
        return selected
            ? { collectionName: selected.collectionName, marker: selected.marker }
            : null;
    }

    public resolveStagedCollectionName(codebasePath: string, generationId: string): string {
        const normalizedGenerationId = generationId
            .trim()
            .replace(/[^a-zA-Z0-9_]+/g, '_')
            .replace(/^_+|_+$/g, '');
        if (normalizedGenerationId.length === 0) {
            throw new Error('generationId must contain at least one alphanumeric character.');
        }
        return `${this.resolveCollectionName(codebasePath)}__gen_${normalizedGenerationId}`;
    }

    public setWriteCollectionOverride(codebasePath: string, collectionName: string | null): void {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        if (!collectionName || collectionName.trim().length === 0) {
            this.writeCollectionOverrides.delete(canonicalRoot);
            return;
        }
        this.writeCollectionOverrides.set(canonicalRoot, collectionName.trim());
    }

    /**
     * Prepare the real staged collection before a background full rebuild is
     * reported as started. The returned object is process-local, one-shot, and
     * bound to the mutation generation so a stale or forged receipt cannot
     * suppress mandatory collection preparation in indexCodebase().
     */
    public async prepareIndexCollection(
        codebasePath: string,
        binding: PreparedIndexCollectionBinding,
        assertMutationCurrent?: () => void,
    ): Promise<PreparedIndexCollectionReceipt> {
        if (!Number.isSafeInteger(binding.generation) || binding.generation < 1) {
            throw new Error('Prepared index collection generation must be a positive safe integer.');
        }
        if (typeof binding.operationId !== 'string' || binding.operationId.trim().length === 0) {
            throw new Error('Prepared index collection operationId must be a non-empty string.');
        }

        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        const collectionName = this.getWriteCollectionName(canonicalRoot);
        const stagedPrefix = `${this.resolveCollectionName(canonicalRoot)}__gen_`;
        if (!collectionName.startsWith(stagedPrefix)) {
            throw new Error(`Prepared index collection '${collectionName}' is not a staged generation for '${canonicalRoot}'.`);
        }

        assertMutationCurrent?.();
        await this.prepareCollection(canonicalRoot, true, assertMutationCurrent);
        assertMutationCurrent?.();

        const receipt = Object.freeze({
            canonicalRoot,
            collectionName,
            generation: binding.generation,
            operationId: binding.operationId.trim(),
        });
        this.preparedIndexCollectionReceipts.add(receipt);
        return receipt;
    }

    public discardPreparedIndexCollection(receipt: PreparedIndexCollectionReceipt): void {
        this.preparedIndexCollectionReceipts.delete(receipt);
    }

    public async getActiveIndexedCollectionName(codebasePath: string): Promise<string | null> {
        const proven = await this.proveIndexedGeneration(codebasePath);
        return proven?.collectionName ?? null;
    }

    public getIndexAuthorityObservation(codebasePath: string): string | null {
        const observations = this.getIndexAuthorityObservations(codebasePath);
        return observations ? JSON.stringify(observations) : null;
    }

    public getIndexAuthorityObservations(codebasePath: string): IndexAuthorityObservations | null {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        const profileFileToken = this.resolveRepoConfigObservationToken(canonicalRoot);
        const policyFileToken = this.indexPolicyRuntimeService.resolveCustomIndexPolicyFileToken(canonicalRoot);
        const cachedPolicyFileToken = this.indexPolicyRuntimeService.getPolicyFileToken(canonicalRoot);
        const policyDocumentDigest = this.indexPolicyRuntimeService.getPolicyDocumentDigest(canonicalRoot);
        const policy = this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot);
        const binding = this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalRoot);
        if (
            !policyFileToken
            || cachedPolicyFileToken !== policyFileToken
            || !policyDocumentDigest
            || !policy
            || !binding
            || policy.canonicalRoot !== canonicalRoot
            || policy.policyHash !== binding.policyHash
        ) {
            return null;
        }
        const navigationObservation = binding.navigation.status === 'sealed'
            ? this.resolveNavigationObservation(
                canonicalRoot,
                binding.navigation.generationId,
                binding.publication === undefined,
            )
            : { status: 'not_bound' as const };
        return {
            vector: JSON.stringify({
            canonicalRoot,
            profileFileToken,
            policyFileToken,
            policyDocumentDigest,
            policyHash: policy.policyHash,
            collectionName: binding.collectionName,
            }),
            navigation: JSON.stringify({
                binding: binding.navigation,
                observation: navigationObservation,
            }),
        };
    }

    private async proveGenerationAuthorityExactly(
        codebasePath: string,
        priorReceipt?: ProvenVectorGenerationReceipt,
        requireNavigation = true,
        throwOnUnprovablePayload = false,
    ): Promise<ProvenVectorGenerationReceipt | ProvenGenerationReceipt | null> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        if (priorReceipt && priorReceipt.policy.canonicalRoot !== canonicalRoot) return null;

        const initialProfileToken = this.resolveRepoConfigObservationToken(canonicalRoot);
        const initialPolicyToken = this.indexPolicyRuntimeService.resolveCustomIndexPolicyFileToken(canonicalRoot);
        if (initialPolicyToken === null) return null;
        if (
            priorReceipt
            && (
                priorReceipt.observations.profileFileToken !== initialProfileToken
                || priorReceipt.observations.policyFileToken !== initialPolicyToken
            )
        ) {
            return null;
        }

        if (priorReceipt && this.indexPolicyRuntimeService.hasIndexProfile(canonicalRoot)) {
            this.indexPolicyRuntimeService.loadCustomIndexPolicy(canonicalRoot);
            this.recomputePublishedPolicyRuntimeCompatibility(canonicalRoot);
        } else {
            this.refreshRuntimePolicyAuthority(canonicalRoot);
        }
        const publishedPolicy = this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot);
        const policyBinding = this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalRoot);
        const policyDocumentDigest = this.indexPolicyRuntimeService.getPolicyDocumentDigest(canonicalRoot);
        if (
            !publishedPolicy
            || !policyBinding
            || !policyDocumentDigest
            || this.indexPolicyRuntimeService.getPolicyRuntimeCompatibility(canonicalRoot) !== true
            || publishedPolicy.canonicalRoot !== canonicalRoot
            || policyBinding.policyHash !== publishedPolicy.policyHash
            || (priorReceipt && (
                priorReceipt.collectionName !== policyBinding.collectionName
                || priorReceipt.policyDocumentDigest !== policyDocumentDigest
            ))
        ) {
            return null;
        }
        if (!(await this.vectorDatabase.hasCollection(policyBinding.collectionName))) return null;

        const initialMarker = await this.resolveCompletionMarkerForCollection(
            canonicalRoot,
            policyBinding.collectionName,
        );
        if (!initialMarker || !this.markerMatchesSealedAuthority(
            initialMarker,
            publishedPolicy,
            policyBinding,
        )) {
            return null;
        }
        const initialNavigationAuthority = this.resolveEffectiveNavigationAuthority(
            initialMarker,
            publishedPolicy,
            policyBinding,
        );
        if (!initialNavigationAuthority) return null;
        if (policyBinding.publication) {
            const checkpoint = await new FileSynchronizer(
                canonicalRoot,
                [],
                [],
                {
                    checkpointIdentity: policyBinding.collectionName,
                    checkpointAuthority: {
                        collectionName: policyBinding.collectionName,
                        markerRunId: initialMarker.runId,
                        indexPolicyHash: initialMarker.indexPolicyHash,
                    },
                },
            ).inspectOwnedSnapshot();
            if (
                checkpoint.status !== 'valid'
                || checkpoint.merkleRoot !== policyBinding.publication.sourceCheckpoint.merkleRoot
                || checkpoint.documentDigest !== policyBinding.publication.sourceCheckpoint.documentDigest
            ) return null;
        }
        if (priorReceipt && !this.indexCompletionMarkersEqual(initialMarker, priorReceipt.marker)) {
            return null;
        }
        if (requireNavigation && initialNavigationAuthority.status !== 'sealed') return null;

        const exactPayloadCount = await this.countIndexedPayloadExactly(
            policyBinding.collectionName,
            undefined,
            initialMarker.totalChunks,
        );
        if (exactPayloadCount === null) {
            if (throwOnUnprovablePayload) {
                throw new Error(`Exact indexed payload count is unavailable for '${policyBinding.collectionName}'.`);
            }
            return null;
        }
        if (exactPayloadCount !== initialMarker.totalChunks) return null;

        const validateNavigation = requireNavigation
            || initialNavigationAuthority.relationshipOnlyUpgrade;
        const navigationProof = validateNavigation
            ? await this.proveEffectiveNavigationAuthority(
                canonicalRoot,
                initialNavigationAuthority,
                requireNavigation,
            )
            : { status: 'not_bound' as const };
        if (validateNavigation && navigationProof.status !== 'valid') return null;
        const navigation = navigationProof.status === 'valid'
            ? navigationProof.generation
            : null;
        const navigationToken = navigationProof.status === 'valid'
            ? navigationProof.observationToken
            : null;
        if (navigation && !navigationToken) return null;
        if (
            requireNavigation
            && priorReceipt
            && 'navigationToken' in priorReceipt.observations
            && priorReceipt.observations.navigationToken !== navigationToken
        ) return null;

        const finalMarker = await this.resolveCompletionMarkerForCollection(
            canonicalRoot,
            policyBinding.collectionName,
        );
        const finalProfileToken = this.resolveRepoConfigObservationToken(canonicalRoot);
        const finalPolicyToken = this.indexPolicyRuntimeService.resolveCustomIndexPolicyFileToken(canonicalRoot);
        const finalNavigationToken = requireNavigation && navigation
            ? this.resolveNavigationObservationToken(
                canonicalRoot,
                navigation.generationId,
                !initialNavigationAuthority.useBoundGeneration,
            )
            : navigationToken;
        const finalPolicy = this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot);
        const finalBinding = this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalRoot);
        const finalNavigationAuthority = finalMarker && finalPolicy && finalBinding
            ? this.resolveEffectiveNavigationAuthority(
                finalMarker,
                finalPolicy,
                finalBinding,
            )
            : null;
        if (
            !finalMarker
            || !this.indexCompletionMarkersEqual(finalMarker, initialMarker)
            || finalProfileToken !== initialProfileToken
            || finalPolicyToken !== initialPolicyToken
            || (requireNavigation && finalNavigationToken !== navigationToken)
            || !finalPolicy
            || !finalBinding
            || finalPolicy.policyHash !== initialMarker.indexPolicyHash
            || finalBinding.policyHash !== initialMarker.indexPolicyHash
            || finalBinding.collectionName !== policyBinding.collectionName
            || !finalNavigationAuthority
            || !this.effectiveNavigationAuthoritiesEqual(
                finalNavigationAuthority,
                initialNavigationAuthority,
            )
            || !publicationBindingsEqual(finalBinding.publication, policyBinding.publication)
            || (requireNavigation && (
                finalNavigationAuthority.status !== 'sealed'
                || navigation?.navigationSealHash !== finalNavigationAuthority.sealHash
            ))
            || this.indexPolicyRuntimeService.getPolicyDocumentDigest(canonicalRoot) !== policyDocumentDigest
        ) {
            return null;
        }
        const vectorReceipt: ProvenVectorGenerationReceipt = {
            collectionName: policyBinding.collectionName,
            marker: this.cloneIndexCompletionMarker(initialMarker),
            policy: {
                ...finalPolicy,
                customExtensions: [...finalPolicy.customExtensions],
                customIgnorePatterns: [...finalPolicy.customIgnorePatterns],
                fileBasedIgnorePatterns: [...finalPolicy.fileBasedIgnorePatterns],
                supportedExtensions: [...finalPolicy.supportedExtensions],
                effectiveIgnorePatterns: [...finalPolicy.effectiveIgnorePatterns],
            },
            policyDocumentDigest,
            exactPayloadCount,
            observations: {
                profileFileToken: finalProfileToken,
                policyFileToken: finalPolicyToken,
            },
        };
        return requireNavigation
            ? {
                ...vectorReceipt,
                navigation: { ...navigation! },
                observations: {
                    ...vectorReceipt.observations,
                    navigationToken: finalNavigationToken!,
                },
            }
            : vectorReceipt;
    }

    private cloneProvenVectorGenerationReceipt(
        receipt: ProvenVectorGenerationReceipt,
    ): ProvenVectorGenerationReceipt {
        return {
            collectionName: receipt.collectionName,
            marker: this.cloneIndexCompletionMarker(receipt.marker),
            policy: {
                ...receipt.policy,
                customExtensions: [...receipt.policy.customExtensions],
                customIgnorePatterns: [...receipt.policy.customIgnorePatterns],
                fileBasedIgnorePatterns: [...receipt.policy.fileBasedIgnorePatterns],
                supportedExtensions: [...receipt.policy.supportedExtensions],
                effectiveIgnorePatterns: [...receipt.policy.effectiveIgnorePatterns],
            },
            policyDocumentDigest: receipt.policyDocumentDigest,
            exactPayloadCount: receipt.exactPayloadCount,
            observations: { ...receipt.observations },
        };
    }

    private cloneProvenGenerationReceipt(
        receipt: ProvenGenerationReceipt,
    ): ProvenGenerationReceipt {
        return {
            ...this.cloneProvenVectorGenerationReceipt(receipt),
            navigation: { ...receipt.navigation },
            observations: { ...receipt.observations },
        };
    }

    private async resolveGenerationProofIdentity(
        canonicalRoot: string,
    ): Promise<string | null> {
        const observations = this.getIndexAuthorityObservations(canonicalRoot);
        if (!observations) return null;
        const collectionName = this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalRoot)?.collectionName;
        const observePublication = this.vectorDatabase.getPublicationObservation;
        if (!collectionName || typeof observePublication !== 'function') return null;
        const publicationObservation = await observePublication.call(this.vectorDatabase, collectionName);
        if (!publicationObservation) return null;
        return JSON.stringify({
            vector: observations.vector,
            navigation: observations.navigation,
            publicationObservation,
        });
    }



    private invalidateGenerationProofForCollection(collectionName: string): void {
        this.indexAuthorityCoordinator.forEachGenerationProof((canonicalRoot, proof) => {
            if (proof.vectorReceipt.collectionName === collectionName) {
                this.indexAuthorityCoordinator.deleteGenerationProof(canonicalRoot);
            }
        });
    }

    private cachedGenerationProofMatches(
        canonicalRoot: string,
        cached: CachedGenerationProof,
        identity: string,
        priorReceipt?: ProvenVectorGenerationReceipt,
    ): boolean {
        return cached.identity === identity
            && this.isPreparedVectorReceiptBoundToCurrentAuthority(canonicalRoot, cached.vectorReceipt)
            && (!priorReceipt || (
                priorReceipt.collectionName === cached.vectorReceipt.collectionName
                && priorReceipt.policyDocumentDigest === cached.vectorReceipt.policyDocumentDigest
                && priorReceipt.exactPayloadCount === cached.vectorReceipt.exactPayloadCount
                && priorReceipt.policy.canonicalRoot === canonicalRoot
                && priorReceipt.policy.policyHash === cached.vectorReceipt.policy.policyHash
                && priorReceipt.observations.profileFileToken
                    === cached.vectorReceipt.observations.profileFileToken
                && priorReceipt.observations.policyFileToken
                    === cached.vectorReceipt.observations.policyFileToken
                && this.indexCompletionMarkersEqual(priorReceipt.marker, cached.vectorReceipt.marker)
            ));
    }

    private async revalidateReceiptWithoutPublicationObservation(
        canonicalRoot: string,
        receipt: ProvenVectorGenerationReceipt,
    ): Promise<ProvenVectorGenerationReceipt | null> {
        const initialProfileToken = this.resolveRepoConfigObservationToken(canonicalRoot);
        const initialPolicyToken = this.indexPolicyRuntimeService.resolveCustomIndexPolicyFileToken(canonicalRoot);
        if (
            receipt.policy.canonicalRoot !== canonicalRoot
            || receipt.observations.profileFileToken !== initialProfileToken
            || receipt.observations.policyFileToken !== initialPolicyToken
        ) return null;

        this.refreshRuntimePolicyAuthority(canonicalRoot);
        const policy = this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot);
        const binding = this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalRoot);
        if (
            !policy
            || !binding
            || this.indexPolicyRuntimeService.getPolicyRuntimeCompatibility(canonicalRoot) !== true
            || binding.collectionName !== receipt.collectionName
            || !this.markerMatchesSealedAuthority(receipt.marker, policy, binding)
            || this.indexPolicyRuntimeService.getPolicyDocumentDigest(canonicalRoot) !== receipt.policyDocumentDigest
            || !(await this.vectorDatabase.hasCollection(receipt.collectionName))
        ) return null;

        const marker = await this.resolveCompletionMarkerForCollection(canonicalRoot, receipt.collectionName);
        if (!marker || !this.indexCompletionMarkersEqual(marker, receipt.marker)) return null;
        if (
            this.resolveRepoConfigObservationToken(canonicalRoot) !== initialProfileToken
            || this.indexPolicyRuntimeService.resolveCustomIndexPolicyFileToken(canonicalRoot) !== initialPolicyToken
        ) return null;
        return {
            collectionName: binding.collectionName,
            marker: this.cloneIndexCompletionMarker(marker),
            policy: {
                ...policy,
                customExtensions: [...policy.customExtensions],
                customIgnorePatterns: [...policy.customIgnorePatterns],
                fileBasedIgnorePatterns: [...policy.fileBasedIgnorePatterns],
                supportedExtensions: [...policy.supportedExtensions],
                effectiveIgnorePatterns: [...policy.effectiveIgnorePatterns],
            },
            policyDocumentDigest: receipt.policyDocumentDigest,
            exactPayloadCount: marker.totalChunks,
            observations: {
                profileFileToken: initialProfileToken,
                policyFileToken: initialPolicyToken,
            },
        };
    }

    private async proveVectorGenerationWithEvidence(
        codebasePath: string,
        priorReceipt?: ProvenVectorGenerationReceipt,
        throwOnUnprovablePayload = false,
    ): Promise<VectorGenerationProofResult> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        this.refreshRuntimePolicyAuthority(canonicalRoot);
        if (priorReceipt && typeof this.vectorDatabase.getPublicationObservation !== 'function') {
            const revalidated = await this.revalidateReceiptWithoutPublicationObservation(
                canonicalRoot,
                priorReceipt,
            );
            return {
                receipt: revalidated,
                exactPayloadRecounts: 0,
                source: 'reused',
            };
        }
        const identity = await this.resolveGenerationProofIdentity(canonicalRoot);
        if (identity) {
            const cached = this.indexAuthorityCoordinator.getGenerationProof(canonicalRoot);
            if (
                cached
                && this.cachedGenerationProofMatches(canonicalRoot, cached, identity, priorReceipt)
            ) {
                if (await this.resolveGenerationProofIdentity(canonicalRoot) !== identity) {
                    return { receipt: null, exactPayloadRecounts: 0, source: 'reused' };
                }
                return {
                    receipt: this.cloneProvenVectorGenerationReceipt(cached.vectorReceipt),
                    exactPayloadRecounts: 0,
                    source: 'reused',
                };
            }

            const flightKey = JSON.stringify([canonicalRoot, identity]);
            const joinedFlight = this.indexAuthorityCoordinator.getGenerationProofFlight(flightKey);
            if (joinedFlight) {
                const joined = await joinedFlight;
                if (
                    !joined
                    || !this.cachedGenerationProofMatches(canonicalRoot, joined, identity, priorReceipt)
                    || await this.resolveGenerationProofIdentity(canonicalRoot) !== identity
                ) {
                    return { receipt: null, exactPayloadRecounts: 0, source: 'joined' };
                }
                return {
                    receipt: this.cloneProvenVectorGenerationReceipt(joined.vectorReceipt),
                    exactPayloadRecounts: 0,
                    source: 'joined',
                };
            }

            const flight = (async (): Promise<CachedGenerationProof | null> => {
                const exact = await this.proveGenerationAuthorityExactly(
                    canonicalRoot,
                    priorReceipt,
                    false,
                    throwOnUnprovablePayload,
                ) as ProvenVectorGenerationReceipt | null;
                if (!exact) return null;
                const identityAfter = await this.resolveGenerationProofIdentity(canonicalRoot);
                if (identityAfter !== identity) return null;
                const proven: CachedGenerationProof = {
                    identity,
                    vectorReceipt: this.cloneProvenVectorGenerationReceipt(exact),
                    navigationArtifactsValidated: false,
                    source: 'exact',
                };
                this.indexAuthorityCoordinator.setGenerationProof(canonicalRoot, proven);
                return proven;
            })();
            this.indexAuthorityCoordinator.setGenerationProofFlight(flightKey, flight);
            try {
                const proven = await flight;
                return {
                    receipt: proven ? this.cloneProvenVectorGenerationReceipt(proven.vectorReceipt) : null,
                    exactPayloadRecounts: proven ? 1 : 0,
                    source: 'exact',
                };
            } finally {
                if (this.indexAuthorityCoordinator.getGenerationProofFlight(flightKey) === flight) {
                    this.indexAuthorityCoordinator.deleteGenerationProofFlight(flightKey, flight);
                }
            }
        }

        const exact = await this.proveGenerationAuthorityExactly(
            canonicalRoot,
            priorReceipt,
            false,
            throwOnUnprovablePayload,
        ) as ProvenVectorGenerationReceipt | null;
        return {
            receipt: exact,
            exactPayloadRecounts: exact ? 1 : 0,
            source: 'exact',
        };
    }

    private async proveNavigationForVectorReceipt(
        codebasePath: string,
        receipt: ProvenVectorGenerationReceipt,
        validateArtifacts: boolean,
    ): Promise<NavigationGenerationProof> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        const identity = await this.resolveGenerationProofIdentity(canonicalRoot);
        const cached = identity ? this.indexAuthorityCoordinator.getGenerationProof(canonicalRoot) : undefined;
        if (
            cached
            && this.cachedGenerationProofMatches(canonicalRoot, cached, identity!, receipt)
            && cached.generationReceipt
            && (!validateArtifacts || cached.navigationArtifactsValidated)
        ) {
            if (await this.resolveGenerationProofIdentity(canonicalRoot) !== identity) {
                return { status: 'incompatible' };
            }
            return {
                status: 'valid',
                generation: { ...cached.generationReceipt.navigation },
                observationToken: cached.generationReceipt.observations.navigationToken,
            };
        }

        const flightKey = identity
            ? JSON.stringify([canonicalRoot, identity, validateArtifacts])
            : null;
        const joinedFlight = flightKey ? this.indexAuthorityCoordinator.getNavigationProofFlight(flightKey) : undefined;
        if (joinedFlight) {
            const joinedProof = await joinedFlight;
            return await this.resolveGenerationProofIdentity(canonicalRoot) === identity
                ? joinedProof
                : { status: 'incompatible' };
        }
        const flight = this.proveNavigationGeneration(canonicalRoot, receipt.marker, validateArtifacts);
        if (flightKey) this.indexAuthorityCoordinator.setNavigationProofFlight(flightKey, flight);
        let proof: NavigationGenerationProof;
        try {
            proof = await flight;
        } finally {
            if (flightKey && this.indexAuthorityCoordinator.getNavigationProofFlight(flightKey) === flight) {
                this.indexAuthorityCoordinator.deleteNavigationProofFlight(flightKey, flight);
            }
        }
        const identityAfter = await this.resolveGenerationProofIdentity(canonicalRoot);
        if (identityAfter !== identity) return { status: 'incompatible' };
        if (proof.status === 'valid' && identity) {
            const generationReceipt: ProvenGenerationReceipt = {
                ...this.cloneProvenVectorGenerationReceipt(receipt),
                navigation: { ...proof.generation },
                observations: {
                    ...receipt.observations,
                    navigationToken: proof.observationToken,
                },
            };
            this.indexAuthorityCoordinator.setGenerationProof(canonicalRoot, {
                identity,
                vectorReceipt: this.cloneProvenVectorGenerationReceipt(receipt),
                generationReceipt,
                navigationArtifactsValidated: validateArtifacts,
                source: cached?.source ?? 'exact',
            });
        }
        return proof;
    }

    private async resolveGenerationReceipt(
        codebasePath: string,
        vectorReceipt: ProvenVectorGenerationReceipt,
        priorReceipt?: ProvenGenerationReceipt,
        validateArtifacts = false,
    ): Promise<ProvenGenerationReceipt | null> {
        const navigation = await this.proveNavigationForVectorReceipt(
            codebasePath,
            vectorReceipt,
            validateArtifacts,
        );
        if (navigation.status !== 'valid') return null;
        if (
            priorReceipt
            && (
                priorReceipt.observations.navigationToken !== navigation.observationToken
                || priorReceipt.navigation.navigationSealHash !== navigation.generation.navigationSealHash
            )
        ) return null;
        return {
            ...this.cloneProvenVectorGenerationReceipt(vectorReceipt),
            navigation: { ...navigation.generation },
            observations: {
                ...vectorReceipt.observations,
                navigationToken: navigation.observationToken,
            },
        };
    }

    public async proveVectorGeneration(
        codebasePath: string,
        priorReceipt?: ProvenVectorGenerationReceipt,
    ): Promise<ProvenVectorGenerationReceipt | null> {
        return (await this.proveVectorGenerationWithEvidence(codebasePath, priorReceipt)).receipt;
    }

    public async proveIndexedGeneration(
        codebasePath: string,
        priorReceipt?: ProvenGenerationReceipt,
    ): Promise<ProvenGenerationReceipt | null> {
        const vectorProof = await this.proveVectorGenerationWithEvidence(codebasePath, priorReceipt);
        if (!vectorProof.receipt) return null;
        return this.resolveGenerationReceipt(
            codebasePath,
            vectorProof.receipt,
            priorReceipt,
            true,
        );
    }

    private async proveNavigationGeneration(
        canonicalRoot: string,
        marker: IndexCompletionMarkerDocument,
        validateArtifacts = false,
    ): Promise<NavigationGenerationProof> {
        this.refreshRuntimePolicyAuthority(canonicalRoot);
        const policy = this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot);
        const policyBinding = this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalRoot);
        if (!policy || !policyBinding) return { status: 'incompatible' };
        const authority = this.resolveEffectiveNavigationAuthority(
            marker,
            policy,
            policyBinding,
        );
        if (!authority) return { status: 'incompatible' };
        return this.proveEffectiveNavigationAuthority(
            canonicalRoot,
            authority,
            validateArtifacts,
        );
    }

    public async revalidateProvenVectorGeneration(
        codebasePath: string,
        receipt: ProvenVectorGenerationReceipt,
    ): Promise<ProvenVectorGenerationReceipt | null> {
        if (
            receipt.exactPayloadCount !== receipt.marker.totalChunks
            || receipt.policy.policyHash !== receipt.marker.indexPolicyHash
            || receipt.collectionName.length === 0
        ) return null;
        return (await this.proveVectorGenerationWithEvidence(codebasePath, receipt)).receipt;
    }

    public async revalidateProvenGeneration(
        codebasePath: string,
        receipt: ProvenGenerationReceipt,
    ): Promise<ProvenGenerationReceipt | null> {
        const vectorReceipt = await this.revalidateProvenVectorGeneration(codebasePath, receipt);
        if (!vectorReceipt) return null;
        return this.resolveGenerationReceipt(codebasePath, vectorReceipt, receipt);
    }

    public async revalidatePreparedGeneration(
        codebasePath: string,
        receipt: ProvenVectorGenerationReceipt,
        options?: {
            priorGenerationReceipt?: ProvenGenerationReceipt;
            navigationObservationChanged?: boolean;
        },
    ): Promise<PreparedGenerationRevalidation | null> {
        const vectorReceipt = await this.revalidateProvenVectorGeneration(codebasePath, receipt);
        if (!vectorReceipt) return null;
        const navigationProof = await this.proveNavigationForVectorReceipt(
            codebasePath,
            vectorReceipt,
            options?.navigationObservationChanged === true,
        );
        if (
            navigationProof.status === 'valid'
            && options?.priorGenerationReceipt
            && options.navigationObservationChanged !== true
            && (
                !options.priorGenerationReceipt.navigation
                || !options.priorGenerationReceipt.observations.navigationToken
                ||
                navigationProof.generation.navigationSealHash
                    !== options.priorGenerationReceipt.navigation.navigationSealHash
                || navigationProof.observationToken
                    !== options.priorGenerationReceipt.observations.navigationToken
            )
        ) return null;
        const generationReceipt = navigationProof.status === 'valid'
            ? {
                ...vectorReceipt,
                navigation: navigationProof.generation,
                observations: {
                    ...vectorReceipt.observations,
                    navigationToken: navigationProof.observationToken,
                },
            }
            : undefined;
        return {
            vectorReceipt,
            navigationProof,
            ...(generationReceipt ? { generationReceipt } : {}),
        };
    }

    public resolveProvenGeneration(codebasePath: string): Promise<ProvenGenerationReceipt | null> {
        return this.proveIndexedGeneration(codebasePath);
    }



    private async publishSealedPolicyBindingForMarker(
        codebasePath: string,
        collectionName: string,
        marker: IndexCompletionMarkerDocument,
        publishMutation?: (publish: () => void) => void,
    ): Promise<void> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        this.refreshRuntimePolicyAuthority(canonicalRoot);
        const policy = this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot);
        if (!policy || this.indexPolicyRuntimeService.getPolicyRuntimeCompatibility(canonicalRoot) !== true) {
            throw new Error(`Cannot publish generation '${collectionName}': no runtime-compatible sealed index policy is available.`);
        }
        if (policy.policyHash !== marker.indexPolicyHash) {
            throw new Error(`Cannot publish generation '${collectionName}': completion marker and sealed policy hashes differ.`);
        }
        const currentBinding = this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalRoot);
        const navigationBinding = policyNavigationBindingFromMarker(marker.navigation);
        if (
            currentBinding?.policyHash === marker.indexPolicyHash
            && currentBinding.collectionName === collectionName
            && policyNavigationBindingsEqual(currentBinding.navigation, navigationBinding)
        ) {
            return;
        }
        await this.indexAuthorityCoordinator.publishResolvedIndexPolicyForMarker(policy, {
            collectionName,
            navigation: navigationBinding,
        }, marker, publishMutation);
    }

    private async resolveCompletionProofCollection(
        codebasePath: string,
    ): Promise<{ collectionName: string; marker: IndexCompletionMarkerDocument } | null> {
        const candidates: Array<{ collectionName: string; marker: IndexCompletionMarkerDocument }> = [];
        for (const collectionName of await this.listRelatedCollectionNames(codebasePath)) {
            const marker = await this.resolveCompletionMarkerForCollection(codebasePath, collectionName);
            if (!marker || !(await this.collectionHasIndexedPayload(collectionName, marker))) {
                continue;
            }
            candidates.push({ collectionName, marker });
        }
        candidates.sort((left, right) => (
            Date.parse(right.marker.completedAt) - Date.parse(left.marker.completedAt)
            || left.collectionName.localeCompare(right.collectionName)
        ));
        return candidates[0] ?? null;
    }

    public async getCompletionProofCollectionName(codebasePath: string): Promise<string | null> {
        return (await this.resolveCompletionProofCollection(codebasePath))?.collectionName ?? null;
    }

    public async pruneIndexedCollectionFamily(
        codebasePath: string,
        keepCollectionName: string,
        options: MutationGuardOptions = {},
    ): Promise<string[]> {
        const familyCollectionNames = await this.listRelatedCollectionNames(codebasePath);
        const droppedCollections: string[] = [];

        for (const collectionName of familyCollectionNames) {
            if (collectionName === keepCollectionName) {
                continue;
            }
            await deleteCollectionWithVerification(this.vectorDatabase, collectionName, {
                beforeDropAttempt: options.assertMutationCurrent,
            });
            droppedCollections.push(collectionName);
        }

        return droppedCollections.sort((left, right) => left.localeCompare(right));
    }

    public async pruneUnprovenStagedCollectionFamily(
        codebasePath: string,
        options: StagedCollectionPruneOptions = {},
    ): Promise<string[]> {
        if (options.discardUnprovenPayload && !options.assertMutationCurrent) {
            throw new Error('Discarding unproven staged payload requires a current mutation lease.');
        }
        const familyCollectionNames = await this.listRelatedCollectionNames(codebasePath);
        const droppedCollections: string[] = [];

        for (const collectionName of familyCollectionNames) {
            if (!collectionName.includes('__gen_')) {
                continue;
            }
            // Hybrid rebuilds intentionally leave staged collections indexless until
            // finalization. Marker/payload probes load the collection, so an
            // IndexNotExist-class failure means the generation is unsearchable and
            // unproven rather than a hard prune abort. Preserve that uncertain state
            // unless this mutation owns exclusive discard authority.
            let marker: IndexCompletionMarkerDocument | null;
            let hasUnprovenPayload = false;
            try {
                marker = await this.resolveCompletionMarkerForCollection(codebasePath, collectionName);
                if (marker && await this.collectionHasIndexedPayload(collectionName, marker)) {
                    continue;
                }
                hasUnprovenPayload = !marker
                    && await this.collectionHasAnyIndexedPayload(collectionName);
            } catch (error) {
                if (!isUnsearchableStagedCollectionError(error)) {
                    throw error;
                }
                if (!options.discardUnprovenPayload) {
                    continue;
                }
                marker = null;
                hasUnprovenPayload = false;
            }
            if (!marker && !options.discardUnprovenPayload && hasUnprovenPayload) {
                continue;
            }
            await deleteCollectionWithVerification(this.vectorDatabase, collectionName, {
                beforeDropAttempt: options.assertMutationCurrent,
            });
            droppedCollections.push(collectionName);
        }

        return droppedCollections.sort((left, right) => left.localeCompare(right));
    }

    /**
     * Build and publish a complete codebase generation for semantic search.
     * When `deferFullIndexPublication` is true, vector, marker, policy, and
     * navigation publication remain the caller's staged-generation responsibility.
     * @param codebasePath Codebase root path
     * @param progressCallback Optional progress callback function
     * @param forceReindex Whether to recreate the collection even if it exists
     * @returns Indexing statistics
     */
    async indexCodebase(
        codebasePath: string,
        progressCallback?: (progress: { phase: string; current: number; total: number; percentage: number }) => void,
        forceReindex: boolean = false,
        options: MutationGuardOptions = {},
    ): Promise<IndexCodebaseResult> {
        const operationStartedAt = Date.now();
        // Batch policy and metrics are optional capabilities: structural embedding
        // adapters may implement indexing without inheriting the base defaults.
        const embeddingMetricsBefore = this.embedding.getOperationMetricsSnapshot?.() ?? null;
        const vectorWriteMetricsBefore = this.vectorDatabase.getWriteMetricsSnapshot?.() ?? null;
        let prepareCollectionMs = 0;
        let scanFilesMs = 0;
        let payloadPipelineMs = 0;
        let finalizeCollectionMs = 0;
        let navigationMs = 0;
        let publicationMs = 0;
        assertDescriptorBoundIndexingSupported();
        if (options.indexPolicy) {
            this.assertResolvedIndexPolicyRoot(codebasePath, options.indexPolicy);
        }
        const isHybrid = this.getIsHybrid();
        const searchType = isHybrid === true ? 'hybrid search' : 'semantic search';
        console.log(`[Context] 🚀 Starting to index codebase with ${searchType}: ${codebasePath}`);

        if (options.indexPolicy) {
            this.setIndexProfileForCodebase(codebasePath, options.indexPolicy.profile);
        } else {
            this.loadIndexProfileForCodebase(codebasePath);
        }
        const indexPolicy = options.indexPolicy
            ?? await this.resolveIndexPolicyForCodebase(codebasePath);

        // 2. Check and prepare vector collection
        progressCallback?.({ phase: 'Preparing collection...', current: 0, total: 100, percentage: 0 });
        console.log(`Debug2: Preparing vector collection for codebase${forceReindex ? ' (FORCE REINDEX)' : ''}`);
        // indexCodebase is a full rebuild. Reusing an existing collection would retain
        // remote rows for deleted files or changed chunk boundaries.
        // Forced preparation replaces the collection, so the new schema cannot contain
        // an old completion marker. Do not query it to clear one: hybrid rebuilds keep
        // this collection deliberately indexless until all payload writes are complete.
        const prepareStartedAt = Date.now();
        if (options.preparedCollectionReceipt) {
            if (!options.preparedCollectionBinding) {
                throw new Error('Prepared index collection binding is required with its receipt.');
            }
            await this.consumePreparedIndexCollection(
                codebasePath,
                options.preparedCollectionReceipt,
                options.preparedCollectionBinding,
                options.assertMutationCurrent,
            );
        } else if (options.preparedCollectionBinding) {
            throw new Error('Prepared index collection receipt is required with its binding.');
        } else {
            await this.prepareCollection(codebasePath, true, options.assertMutationCurrent);
        }
        prepareCollectionMs = Date.now() - prepareStartedAt;

        // 3. Recursively traverse codebase to get all supported files
        progressCallback?.({ phase: 'Scanning files...', current: 5, total: 100, percentage: 5 });
        const scanStartedAt = Date.now();
        const codeFiles = await this.getCodeFiles(codebasePath, indexPolicy);
        scanFilesMs = Date.now() - scanStartedAt;
        console.log(`[Context] 📁 Found ${codeFiles.length} code files`);

        if (codeFiles.length === 0) {
            await this.finalizePreparedCollection(codebasePath, options.assertMutationCurrent);
            const navigationCandidate = await this.writeSymbolRegistryForCompletedIndex(
                codebasePath,
                [],
                [],
                options.assertMutationCurrent,
                new Map(),
                options.publishMutation,
                options.deferFullIndexPublication === true,
                indexPolicy,
            );
            if (!options.deferFullIndexPublication) {
                await this.writeCompletedIndexMarker(codebasePath, 0, 0, undefined, 'completed', options.assertMutationCurrent, navigationCandidate, indexPolicy.policyHash);
                const marker = await this.resolveCompletionMarkerForCollection(
                    codebasePath,
                    this.getWriteCollectionName(codebasePath),
                );
                if (!marker) {
                    throw new Error(`Completed index did not produce a completion marker for '${this.getWriteCollectionName(codebasePath)}'.`);
                }
                await this.indexAuthorityCoordinator.publishResolvedIndexPolicyForMarker(indexPolicy, {
                    collectionName: this.getWriteCollectionName(codebasePath),
                    navigation: navigationCandidate ? {
                        status: 'sealed',
                        generationId: navigationCandidate.generationId,
                        sealHash: navigationCandidate.navigationSealHash,
                    } : { status: 'not_bound' },
                }, marker, options.publishMutation);
            }
            progressCallback?.({ phase: 'No files to index', current: 100, total: 100, percentage: 100 });
            return {
                indexedFiles: 0,
                totalChunks: 0,
                status: 'completed',
                indexedFileHashes: new Map(),
                ...(navigationCandidate ? { navigationCandidate } : {}),
            };
        }

        // 3. Process each file with streaming chunk processing
        // Reserve 10% for preparation, 90% for actual indexing
        const indexingStartPercentage = 10;
        const indexingEndPercentage = 100;
        const indexingRange = indexingEndPercentage - indexingStartPercentage;

        const payloadStartedAt = Date.now();
        const result = await this.processFileList(
            codeFiles,
            codebasePath,
            (filePath, fileIndex, totalFiles) => {
                // Calculate progress percentage
                const progressPercentage = indexingStartPercentage + (fileIndex / totalFiles) * indexingRange;

                console.log(`[Context] 📊 Processed ${fileIndex}/${totalFiles} files`);
                progressCallback?.({
                    phase: `Processing files (${fileIndex}/${totalFiles})...`,
                    current: fileIndex,
                    total: totalFiles,
                    percentage: Math.round(progressPercentage)
                });
            },
            undefined,
            options.assertMutationCurrent,
            indexPolicy,
        );
        payloadPipelineMs = Date.now() - payloadStartedAt;

        const finalizeStartedAt = Date.now();
        await this.finalizePreparedCollection(codebasePath, options.assertMutationCurrent);
        finalizeCollectionMs = Date.now() - finalizeStartedAt;

        console.log(`[Context] ✅ Codebase indexing completed! Processed ${result.processedFiles} files in total, generated ${result.totalChunks} code chunks`);

        let navigationCandidate: StagedNavigationSidecarGeneration | undefined;
        if (result.status === 'completed') {
            const navigationStartedAt = Date.now();
            navigationCandidate = await this.writeSymbolRegistryForCompletedIndex(
                codebasePath,
                result.symbolRecords,
                result.symbolManifestFiles,
                options.assertMutationCurrent,
                result.analysisByFile,
                options.publishMutation,
                options.deferFullIndexPublication === true,
                indexPolicy,
            );
            navigationMs = Date.now() - navigationStartedAt;
            if (!options.deferFullIndexPublication) {
                const publicationStartedAt = Date.now();
                await this.writeCompletedIndexMarker(codebasePath, result.processedFiles, result.totalChunks, undefined, 'completed', options.assertMutationCurrent, navigationCandidate, indexPolicy.policyHash);
                const marker = await this.resolveCompletionMarkerForCollection(
                    codebasePath,
                    this.getWriteCollectionName(codebasePath),
                );
                if (!marker) {
                    throw new Error(`Completed index did not produce a completion marker for '${this.getWriteCollectionName(codebasePath)}'.`);
                }
                await this.indexAuthorityCoordinator.publishResolvedIndexPolicyForMarker(indexPolicy, {
                    collectionName: this.getWriteCollectionName(codebasePath),
                    navigation: navigationCandidate ? {
                        status: 'sealed',
                        generationId: navigationCandidate.generationId,
                        sealHash: navigationCandidate.navigationSealHash,
                    } : { status: 'not_bound' },
                }, marker, options.publishMutation);
                publicationMs = Date.now() - publicationStartedAt;
            }
        } else {
            // limit_reached: do not publish complete navigation sidecars, but seal partial vector
            // proof so MCP readiness can allow warned partial search (not "missing marker" stale_local).
            // indexStatus must stay on the marker so interrupted-index recovery does not promote as fully completed.
            console.warn('[Context] ⚠️  Skipping symbol registry sidecar write because indexing stopped before processing the full file set.');
            if (!options.deferFullIndexPublication) {
                const publicationStartedAt = Date.now();
                await this.writeCompletedIndexMarker(codebasePath, result.processedFiles, result.totalChunks, undefined, 'limit_reached', options.assertMutationCurrent, undefined, indexPolicy.policyHash);
                const marker = await this.resolveCompletionMarkerForCollection(
                    codebasePath,
                    this.getWriteCollectionName(codebasePath),
                );
                if (!marker) {
                    throw new Error(`Partial index did not produce a completion marker for '${this.getWriteCollectionName(codebasePath)}'.`);
                }
                await this.indexAuthorityCoordinator.publishResolvedIndexPolicyForMarker(indexPolicy, {
                    collectionName: this.getWriteCollectionName(codebasePath),
                    navigation: { status: 'not_bound' },
                }, marker, options.publishMutation);
                console.warn('[Context] ⚠️  Wrote completion marker for limit_reached partial index (navigation remains unpublished).');
                publicationMs = Date.now() - publicationStartedAt;
            }
        }

        progressCallback?.({
            phase: result.status === 'completed' ? 'Indexing complete!' : 'Indexing stopped at chunk limit',
            current: result.processedFiles,
            total: codeFiles.length,
            percentage: 100
        });

        const embeddingMetrics = subtractEmbeddingMetrics(
            this.embedding.getOperationMetricsSnapshot?.() ?? null,
            embeddingMetricsBefore,
        );
        const vectorWriteMetrics = subtractVectorWriteMetrics(
            this.vectorDatabase.getWriteMetricsSnapshot?.() ?? null,
            vectorWriteMetricsBefore,
        );
        const vectorWriteSummary = summarizeVectorWriteMetrics(
            vectorWriteMetrics,
            result.totalChunks,
        );
        const pipelinePerformance = result.performance ?? {
            analysisMs: 0,
            embeddedInputBytes: 0,
            logicalEmbeddingRequests: 0,
            logicalEmbeddingDurationMs: 0,
            logicalVectorWriteRequests: 0,
            logicalVectorWriteDurationMs: 0,
        };
        // This single bounded record intentionally contains counts and timings,
        // never source text, paths, provider credentials, or request payloads.
        console.log(`[Context] 📊 Indexing performance: ${JSON.stringify({
            totalMs: Date.now() - operationStartedAt,
            phaseMs: {
                prepareCollection: prepareCollectionMs,
                scanFiles: scanFilesMs,
                payloadPipeline: payloadPipelineMs,
                analysis: pipelinePerformance.analysisMs,
                finalizeCollection: finalizeCollectionMs,
                navigation: navigationMs,
                publication: publicationMs,
            },
            payload: {
                files: result.processedFiles,
                chunks: result.totalChunks,
                embeddedInputBytes: pipelinePerformance.embeddedInputBytes,
            },
            embedding: {
                logicalRequests: pipelinePerformance.logicalEmbeddingRequests,
                logicalDurationMs: pipelinePerformance.logicalEmbeddingDurationMs,
                provider: embeddingMetrics,
            },
            vectorWrites: {
                logicalRequests: pipelinePerformance.logicalVectorWriteRequests,
                logicalDurationMs: pipelinePerformance.logicalVectorWriteDurationMs,
                provider: vectorWriteSummary,
            },
        })}`);

        return {
            indexedFiles: result.processedFiles,
            totalChunks: result.totalChunks,
            status: result.status,
            indexedFileHashes: result.indexedFileHashes,
            ...(navigationCandidate ? { navigationCandidate } : {}),
        };
    }

    async reindexByChange(
        codebasePath: string,
        progressCallback?: (progress: { phase: string; current: number; total: number; percentage: number }) => void,
        options: ReindexByChangeOptions = {}
    ): Promise<ReindexByChangeResult> {
        assertDescriptorBoundIndexingSupported();
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        return this.runSerializedReindexByChange(
            canonicalRoot,
            () => this.performReindexByChange(codebasePath, progressCallback, options),
        );
    }

    private async runSerializedReindexByChange<T>(
        canonicalRoot: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        const previous = this.reindexByChangeQueues.get(canonicalRoot) || Promise.resolve();
        let release!: () => void;
        const current = new Promise<void>((resolve) => {
            release = resolve;
        });
        this.reindexByChangeQueues.set(canonicalRoot, current);

        await previous;
        try {
            return await operation();
        } finally {
            release();
            if (this.reindexByChangeQueues.get(canonicalRoot) === current) {
                this.reindexByChangeQueues.delete(canonicalRoot);
            }
        }
    }

    private async waitForPublicationRetention(canonicalRoot: string): Promise<void> {
        await this.indexAuthorityCoordinator.waitForPublicationRetention(canonicalRoot);
    }

    /**
     * Retention is the only owner allowed to remove inactive physical generations.
     * A publication-bound reader holds this lease for its complete operation so a
     * second activation cannot prune the collection or navigation generation it uses.
     */
    public async acquirePublicationReadLease(codebasePath: string): Promise<() => void> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        return this.indexAuthorityCoordinator.acquirePublicationReadLease(canonicalRoot);
    }





    private resolveReusableNavigationDeltaState(
        canonicalRoot: string,
        sourceNavigation: {
            generationId: string;
            symbolRegistryManifestHash: string;
            relationshipManifestHash: string;
            navigationSealHash?: string;
            sealHash?: string;
        },
    ): CachedNavigationDeltaState | undefined {
        const cached = this.navigationDeltaState;
        const expectedSealHash = sourceNavigation.navigationSealHash ?? sourceNavigation.sealHash;
        const currentObservation = cached
            && cached.canonicalRoot === canonicalRoot
            && cached.generationId === sourceNavigation.generationId
            ? this.resolveNavigationObservationToken(
                canonicalRoot,
                sourceNavigation.generationId,
                false,
            )
            : null;
        if (
            cached
            && cached.canonicalRoot === canonicalRoot
            && cached.generationId === sourceNavigation.generationId
            && cached.symbolRegistryManifestHash === sourceNavigation.symbolRegistryManifestHash
            && cached.relationshipManifestHash === sourceNavigation.relationshipManifestHash
            && cached.navigationSealHash === expectedSealHash
            && cached.navigationObservationToken === currentObservation
        ) {
            return cached;
        }
        if (cached?.canonicalRoot === canonicalRoot) {
            this.navigationDeltaState = undefined;
        }
        return undefined;
    }

    private async performAtomicDeltaPublication(input: {
        codebasePath: string;
        canonicalRoot: string;
        sourceCollectionName: string;
        previousMarker: IndexCompletionMarkerDocument;
        sealedPolicy: ResolvedIndexPolicy;
        synchronizerKey: string;
        preparedChanges: Awaited<ReturnType<FileSynchronizer['prepareChanges']>>;
        options: ReindexByChangeOptions;
        progressCallback?: (progress: { phase: string; current: number; total: number; percentage: number }) => void;
    }): Promise<ReindexByChangeResult> {
        const measurePublicationPhase = async <T>(
            phase:
                | 'publication_source_navigation_load'
                | 'publication_fork'
                | 'publication_payload_delta'
                | 'publication_navigation_checkpoint'
                | 'publication_navigation_delta'
                | 'publication_relationship_load'
                | 'publication_relationship_delta'
                | 'publication_sidecar_stage'
                | 'publication_checkpoint_stage'
                | 'publication_payload_count'
                | 'publication_activation'
                | 'publication_retention_proof',
            run: () => Promise<T>,
        ): Promise<T> => {
            const startedAt = performance.now();
            try {
                return await run();
            } finally {
                input.options.onPhaseTiming?.(
                    phase,
                    Math.max(0, performance.now() - startedAt),
                );
            }
        };
        const { added, removed, modified } = input.preparedChanges.changes;
        const changedFiles = Array.from(new Set([...added, ...removed, ...modified]));
        const totalChanges = changedFiles.length;
        const sourceNavigation = input.previousMarker.navigation.status === 'sealed'
            ? input.previousMarker.navigation
            : null;
        if (!sourceNavigation) {
            throw new Error('Atomic delta publication requires a sealed source navigation generation; reindex is required.');
        }
        if (!this.vectorDatabase.forkCollection) {
            throw new AtomicIncrementalPublicationUnsupportedError();
        }
        const reusableNavigationState = this.resolveReusableNavigationDeltaState(
            input.canonicalRoot,
            sourceNavigation,
        );
        let existingRegistry: SymbolRegistry;
        if (reusableNavigationState) {
            existingRegistry = reusableNavigationState.registry;
        } else {
            existingRegistry = await measurePublicationPhase(
                'publication_source_navigation_load',
                async () => {
                    const expectedSealHash = sourceNavigation.sealHash;
                    const sealRead = await readNavigationGenerationSeal(
                        this.symbolRegistryStateRoot,
                        input.canonicalRoot,
                        sourceNavigation.generationId,
                    );
                    const registryRead = await readSymbolRegistrySidecar({
                        stateRoot: this.symbolRegistryStateRoot,
                        normalizedRootPath: input.canonicalRoot,
                        generationId: sourceNavigation.generationId,
                    });
                    if (sealRead.status !== 'ok'
                        || sealRead.seal.symbolRegistryManifestHash
                            !== sourceNavigation.symbolRegistryManifestHash
                        || sealRead.seal.relationshipManifestHash
                            !== sourceNavigation.relationshipManifestHash
                        || computeNavigationGenerationSealHash(sealRead.seal) !== expectedSealHash
                        || registryRead.status !== 'ok'
                        || registryRead.manifestHash !== sourceNavigation.symbolRegistryManifestHash) {
                        throw new Error('Atomic delta publication cannot prove its source navigation metadata; reindex is required.');
                    }
                    return registryRead.registry;
                },
            );
        }

        const activationId = crypto.randomUUID();
        const candidateCollectionName = this.resolveStagedCollectionName(input.codebasePath, activationId);
        const markerRunId = crypto.randomUUID();
        let navigationCandidate: StagedNavigationSidecarGeneration | undefined;
        let checkpointStaged = false;
        let activated = false;
        const releaseStagedPublication = await this.indexAuthorityCoordinator.acquireStagedPublicationLease(
            input.canonicalRoot,
            activationId,
        );
        try {
            input.options.assertMutationCurrent?.();
            await measurePublicationPhase(
                'publication_fork',
                () => this.vectorDatabase.forkCollection!(
                    input.sourceCollectionName,
                    candidateCollectionName,
                ),
            );

            const payloadDelta = await measurePublicationPhase(
                'publication_payload_delta',
                async () => {
                    let replacedPayloadCount = 0;
                    for (const relativePath of changedFiles) {
                        const pathCount = await this.countIndexedPayloadExactly(
                            candidateCollectionName,
                            { kind: 'comparison', field: 'relativePath', operator: 'eq', value: relativePath },
                            input.previousMarker.totalChunks,
                        );
                        if (pathCount === null) {
                            throw new Error(`Atomic delta publication could not count existing payload for '${relativePath}'.`);
                        }
                        replacedPayloadCount += pathCount;
                        await this.deleteFileChunks(candidateCollectionName, relativePath, input.options.assertMutationCurrent);
                    }

                    let processedChanges = 0;
                    const filesToIndex = [...added, ...modified].map((file) => path.join(input.codebasePath, file));
                    const indexedDelta = filesToIndex.length > 0
                        ? await this.processFileList(
                            filesToIndex,
                            input.codebasePath,
                            (filePath) => {
                                processedChanges += 1;
                                input.progressCallback?.({
                                    phase: `Indexed ${filePath}`,
                                    current: processedChanges,
                                    total: totalChanges,
                                    percentage: Math.round((processedChanges / totalChanges) * 100),
                                });
                            },
                            candidateCollectionName,
                            input.options.assertMutationCurrent,
                        )
                        : {
                            processedFiles: 0,
                            totalChunks: 0,
                            status: 'completed' as const,
                            symbolRecords: [] as SymbolRecord[],
                            symbolManifestFiles: [] as SymbolRegistryManifestFile[],
                            analysisByFile: new Map<string, RelationshipAnalysisEvidence>(),
                        };
                    return { indexedDelta, replacedPayloadCount };
                },
            );
            const { indexedDelta, replacedPayloadCount } = payloadDelta;
            if (indexedDelta.status !== 'completed') {
                throw new Error('Atomic delta publication stopped before every changed file was indexed.');
            }
            const totalChunks = input.previousMarker.totalChunks - replacedPayloadCount + indexedDelta.totalChunks;
            if (!Number.isSafeInteger(totalChunks) || totalChunks < 0) {
                throw new Error('Atomic delta publication produced an invalid payload count.');
            }

            const checkpointAuthority = {
                collectionName: candidateCollectionName,
                markerRunId,
                indexPolicyHash: input.sealedPolicy.policyHash,
            };
            const navigationPromise = measurePublicationPhase(
                'publication_navigation_delta',
                () => this.rebuildNavigationArtifactsForSyncDelta(
                    input.codebasePath,
                    existingRegistry,
                    changedFiles,
                    indexedDelta.symbolRecords,
                    indexedDelta.symbolManifestFiles,
                    input.options.assertMutationCurrent,
                    indexedDelta.analysisByFile,
                    undefined,
                    sourceNavigation.generationId,
                    true,
                    reusableNavigationState,
                    input.options.onPhaseTiming,
                ),
            ).then((result) => {
                const candidate = result.candidate;
                if (!candidate) {
                    throw new Error('Atomic delta publication cannot publish a repository without navigation state.');
                }
                navigationCandidate = candidate;
                return result;
            });
            const checkpointPromise = measurePublicationPhase(
                'publication_checkpoint_stage',
                () => input.preparedChanges.stageCheckpoint(
                    checkpointAuthority,
                    input.options.assertMutationCurrent,
                ),
            ).then((checkpoint) => {
                checkpointStaged = true;
                return checkpoint;
            });
            const payloadCountPromise = measurePublicationPhase(
                'publication_payload_count',
                () => this.countIndexedPayloadExactly(
                    candidateCollectionName,
                    undefined,
                    totalChunks,
                ),
            );
            let candidateResults: Awaited<ReturnType<typeof Promise.all<[
                typeof navigationPromise,
                typeof checkpointPromise,
                typeof payloadCountPromise,
            ]>>>;
            try {
                candidateResults = await measurePublicationPhase(
                    'publication_navigation_checkpoint',
                    () => Promise.all([
                        navigationPromise,
                        checkpointPromise,
                        payloadCountPromise,
                    ]),
                );
            } catch (error) {
                await Promise.allSettled([navigationPromise, checkpointPromise, payloadCountPromise]);
                throw error;
            }
            const [preparedNavigationResult, checkpoint, observedTotalChunks] = candidateResults;
            const preparedNavigation = preparedNavigationResult.candidate;
            if (!preparedNavigation || !preparedNavigationResult.state) {
                throw new Error('Atomic delta publication did not prepare reusable navigation state.');
            }
            const preparedNavigationState = preparedNavigationResult.state;
            const activationResult = await measurePublicationPhase(
                'publication_activation',
                async () => {
                    await this.verifyPreparedSyncPublication(
                        input.codebasePath,
                        candidateCollectionName,
                        input.preparedChanges.fileHashes,
                        totalChunks,
                        preparedNavigation,
                        observedTotalChunks,
                    );
                    const publishedMarker = await this.writeCompletedIndexMarker(
                        input.codebasePath,
                        input.preparedChanges.fileHashes.size,
                        totalChunks,
                        candidateCollectionName,
                        'completed',
                        input.options.assertMutationCurrent,
                        preparedNavigation,
                        input.sealedPolicy.policyHash,
                        markerRunId,
                    );
                    const activeDataObservation = this.vectorDatabase.getCollectionDataObservation
                        ? await this.vectorDatabase.getCollectionDataObservation(candidateCollectionName)
                        : undefined;

                    const authority = input.options.publicationAuthority ?? {
                        ownerId: 'core-internal',
                        generation: 1,
                        operationId: activationId,
                    };
                    const publication: CanonicalPublicationBinding = {
                        activationId,
                        sourceCheckpoint: {
                            ...checkpointAuthority,
                            merkleRoot: checkpoint.merkleRoot,
                            documentDigest: checkpoint.documentDigest,
                        },
                        graph: {
                            kind: 'relationship_manifest_v2',
                            manifestHash: preparedNavigation.relationshipManifestHash,
                        },
                        receipt: {
                            ownerId: authority.ownerId,
                            generation: authority.generation,
                            operationId: authority.operationId,
                        },
                    };
                    await input.preparedChanges.assertSourceObservationCurrent();
                    input.options.assertMutationCurrent?.();
                    this.publishResolvedIndexPolicy(
                        input.sealedPolicy,
                        {
                            collectionName: candidateCollectionName,
                            navigation: {
                                status: 'sealed',
                                generationId: preparedNavigation.generationId,
                                sealHash: preparedNavigation.navigationSealHash,
                            },
                            publication,
                        },
                        input.options.publishMutation,
                    );
                    activated = true;
                    const navigationObservationToken = this.resolveNavigationObservationToken(
                        input.canonicalRoot,
                        preparedNavigation.generationId,
                        false,
                    );
                    this.navigationDeltaState = navigationObservationToken
                        ? {
                            ...preparedNavigationState,
                            navigationObservationToken,
                        }
                        : undefined;

                    const generationReceipt = await this.indexAuthorityCoordinator.recordActivatedGenerationProof({
                        canonicalRoot: input.canonicalRoot,
                        marker: publishedMarker,
                        policy: input.sealedPolicy,
                        exactPayloadCount: totalChunks,
                        navigation: {
                            generationId: preparedNavigation.generationId,
                            generationRoot: preparedNavigation.rootPath,
                            symbolRegistryManifestHash: preparedNavigation.manifestHash,
                            relationshipManifestHash: preparedNavigation.relationshipManifestHash,
                            navigationSealHash: preparedNavigation.navigationSealHash,
                        },
                    });
                    if (!generationReceipt) {
                        throw new Error(
                            `Atomic delta publication for '${input.codebasePath}' could not bind its activated generation proof.`,
                        );
                    }
                    return { activeDataObservation, generationReceipt };
                },
            );

            const generationReceipt = await measurePublicationPhase(
                'publication_retention_proof',
                async () => {
                    const nextSynchronizer = new FileSynchronizer(
                        input.codebasePath,
                        this.getActiveIgnorePatterns(input.codebasePath),
                        this.getIndexedExtensionsForCodebase(input.codebasePath),
                        { checkpointIdentity: candidateCollectionName, checkpointAuthority },
                    );
                    await nextSynchronizer.initialize(undefined, undefined, { requireExistingCheckpoint: true });
                    this.synchronizers.set(input.synchronizerKey, nextSynchronizer);
                    this.synchronizerMutationTargets.delete(input.synchronizerKey);
                    this.indexAuthorityCoordinator.schedulePublicationRetention({
                        canonicalRoot: input.canonicalRoot,
                        activationId,
                        activeCollectionName: candidateCollectionName,
                        previousCollectionName: input.sourceCollectionName,
                        activeNavigationGenerationId: preparedNavigation.generationId,
                        previousNavigationGenerationId: sourceNavigation.generationId,
                        ...(activationResult.activeDataObservation
                            ? { activeDataObservation: activationResult.activeDataObservation }
                            : {}),
                    });
                    if (
                        this.indexAuthorityCoordinator.hasActivePublicationReaders(input.canonicalRoot)
                    ) {
                        return activationResult.generationReceipt;
                    }
                    await this.waitForPublicationRetention(input.canonicalRoot);
                    const retainedGenerationReceipt = await this.proveIndexedGeneration(
                        input.canonicalRoot,
                    );
                    if (!retainedGenerationReceipt) {
                        throw new Error(
                            `Atomic delta publication for '${input.codebasePath}' is not readable after generation retention.`,
                        );
                    }
                    const retainedGenerationIdentity = await this.resolveGenerationProofIdentity(
                        input.canonicalRoot,
                    );
                    if (!retainedGenerationIdentity) {
                        throw new Error(
                            `Atomic delta publication for '${input.codebasePath}' lost its retained generation identity.`,
                        );
                    }
                    this.indexAuthorityCoordinator.setPreparedGenerationReceipt(
                        retainedGenerationReceipt,
                        retainedGenerationIdentity,
                    );
                    return retainedGenerationReceipt;
                },
            );

            return {
                added: added.length,
                removed: removed.length,
                modified: modified.length,
                changedFiles,
                collectionName: candidateCollectionName,
                indexedFiles: input.preparedChanges.fileHashes.size,
                totalChunks,
                indexStatus: 'completed',
                generationReceipt,
            };
        } catch (error) {
            if (
                error instanceof IndexPolicyPublicationError
                && error.receipt.operation === 'publish'
                && error.receipt.collectionName === candidateCollectionName
            ) {
                activated = true;
            }
            if (!activated) {
                if (navigationCandidate) {
                    await discardNavigationSidecarGeneration(navigationCandidate).catch(() => undefined);
                }
                if (checkpointStaged) {
                    await FileSynchronizer.deleteSnapshotForGeneration(
                        input.codebasePath,
                        candidateCollectionName,
                    ).catch(() => undefined);
                }
                await this.vectorDatabase.dropCollection(candidateCollectionName).catch(() => undefined);
            }
            throw error;
        } finally {
            releaseStagedPublication();
        }
    }

    private async performReindexByChange(
        codebasePath: string,
        progressCallback: ((progress: { phase: string; current: number; total: number; percentage: number }) => void) | undefined,
        options: ReindexByChangeOptions,
    ): Promise<ReindexByChangeResult> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        this.refreshRuntimePolicyAuthority(canonicalRoot);
        if (
            this.indexAuthorityCoordinator.hasPublishedResolvedPolicy(canonicalRoot)
            && this.indexPolicyRuntimeService.getPolicyRuntimeCompatibility(canonicalRoot) !== true
        ) {
            throw new Error(`Cannot incrementally synchronize '${codebasePath}': no runtime-compatible sealed index policy is available; reindex is required.`);
        }
        const synchronizerKey = this.resolveCollectionName(codebasePath);
        let synchronizer = this.synchronizers.get(synchronizerKey);
        const synchronizerAlreadyExisted = synchronizer !== undefined;
        const externallyManagedPublication = options.externallyManagedPublication === true;
        if (externallyManagedPublication && options.maintainCompletionMarker === true) {
            throw new Error('externallyManagedPublication cannot be combined with maintainCompletionMarker=true.');
        }
        if (options.maintainCompletionMarker === false && !externallyManagedPublication) {
            throw new Error('Disabling completion-marker maintenance requires externallyManagedPublication=true.');
        }
        if (externallyManagedPublication && !options.targetCollectionName?.trim()) {
            throw new Error('externallyManagedPublication requires an explicit targetCollectionName.');
        }
        const maintainCompletionMarker = !externallyManagedPublication;
        const sourceGenerationReceipt = options.sourceGenerationReceipt
            ? await this.acceptPreparedSourceGenerationReceipt(canonicalRoot, options.sourceGenerationReceipt)
            : null;
        if (options.sourceGenerationReceipt && !sourceGenerationReceipt) {
            throw new Error(`Cannot incrementally synchronize '${codebasePath}': prepared source generation changed before publication.`);
        }
        let collectionName = typeof options.targetCollectionName === 'string' && options.targetCollectionName.trim().length > 0
            ? options.targetCollectionName.trim()
            : null;
        if (collectionName) {
            if (!(await this.vectorDatabase.hasCollection(collectionName))) {
                throw new Error(`Cannot incremental sync '${codebasePath}': target collection '${collectionName}' does not exist.`);
            }
        } else {
            const activeCollectionName = sourceGenerationReceipt?.collectionName
                ?? await this.getActiveIndexedCollectionName(codebasePath);
            collectionName = activeCollectionName;
            if (!collectionName) {
                const proofCollection = await this.resolveCompletionProofCollection(codebasePath);
                if (
                    proofCollection
                    && indexFingerprintsEqual(
                        proofCollection.marker.fingerprint,
                        this.buildIndexCompletionFingerprint(),
                    )
                ) {
                    collectionName = proofCollection.collectionName;
                }
            }
            if (!collectionName && synchronizerAlreadyExisted) {
                const retryCollectionName = this.synchronizerMutationTargets.get(synchronizerKey);
                if (retryCollectionName && await this.vectorDatabase.hasCollection(retryCollectionName)) {
                    // A failed incremental mutation deliberately withdraws its marker while
                    // retaining the prepared filesystem delta for retry. Reuse that known
                    // mutation target only inside the same synchronizer lifetime; it remains
                    // unavailable to search until exact payload proof republishes the marker.
                    collectionName = retryCollectionName;
                }
            }
        }
        const collectionExists = collectionName !== null;

        if (!collectionExists) {
            if (maintainCompletionMarker && synchronizerAlreadyExisted) {
                throw new Error(`Cannot incremental sync '${codebasePath}': no existing collection could be resolved for completion marker maintenance.`);
            }
            console.warn(`[Context] ⚠️  No proven collection exists for '${codebasePath}'. Rebuilding full index before incremental sync resumes.`);
            const changedFiles = this.normalizeRelativePathsForCodebase(codebasePath, await this.getCodeFiles(codebasePath));
            if (changedFiles.length === 0) {
                progressCallback?.({ phase: 'No files to index', current: 100, total: 100, percentage: 100 });
                return { added: 0, removed: 0, modified: 0, changedFiles: [] };
            }

            const indexResult = await this.indexCodebase(codebasePath, progressCallback, false, options);
            return {
                added: changedFiles.length,
                removed: 0,
                modified: 0,
                changedFiles,
                collectionName: this.getWriteCollectionName(codebasePath),
                indexedFiles: indexResult.indexedFiles,
                totalChunks: indexResult.totalChunks,
                indexStatus: indexResult.status,
            };
        }
        if (!collectionName) {
            throw new Error(`Expected an indexed collection for '${codebasePath}' after sync preflight.`);
        }
        const sealedPolicy = this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot);
        if (
            !sealedPolicy
            || this.indexPolicyRuntimeService.getPolicyRuntimeCompatibility(canonicalRoot) !== true
        ) {
            throw new Error(`Cannot incrementally synchronize '${codebasePath}': no runtime-compatible sealed index policy is available; reindex is required.`);
        }

        const previousMarker = maintainCompletionMarker
            ? sourceGenerationReceipt?.collectionName === collectionName
                ? this.cloneIndexCompletionMarker(sourceGenerationReceipt.marker)
                : await this.resolveCompletionMarkerForCollection(codebasePath, collectionName)
            : null;
        const checkpointAuthority = previousMarker ? {
            collectionName,
            markerRunId: previousMarker.runId,
            indexPolicyHash: previousMarker.indexPolicyHash,
        } : null;
        const reusingWithdrawnMutationTarget = previousMarker === null
            && this.synchronizerMutationTargets.get(synchronizerKey) === collectionName
            && synchronizer?.ownsCheckpointIdentity(collectionName) === true;
        const restoringMissingMarkerFromOwnedCheckpoint = previousMarker === null
            && maintainCompletionMarker
            && options.targetCollectionName?.trim() === collectionName
            && synchronizer?.ownsCheckpointForCollectionPolicy(
                collectionName,
                sealedPolicy.policyHash,
            ) === true;

        if (
            synchronizer
            && !reusingWithdrawnMutationTarget
            && !restoringMissingMarkerFromOwnedCheckpoint
            && (!checkpointAuthority || !synchronizer.ownsCheckpointAuthority(checkpointAuthority))
        ) {
            if (!checkpointAuthority) {
                throw new Error(`Cannot incrementally synchronize '${codebasePath}': no completion marker owns its source checkpoint.`);
            }
            await this.loadIgnorePatterns(codebasePath);
            synchronizer = new FileSynchronizer(
                codebasePath,
                this.getActiveIgnorePatterns(codebasePath),
                this.getIndexedExtensionsForCodebase(codebasePath),
                { checkpointIdentity: collectionName, checkpointAuthority },
            );
            await synchronizer.initialize(options.assertMutationCurrent, options.publishMutation, {
                requireExistingCheckpoint: true,
            });
            this.synchronizers.set(synchronizerKey, synchronizer);
            this.synchronizerMutationTargets.delete(synchronizerKey);
        }

        if (!synchronizer) {
            if (!checkpointAuthority) {
                throw new Error(`Cannot incrementally synchronize '${codebasePath}': no completion marker owns its source checkpoint.`);
            }
            await this.loadIgnorePatterns(codebasePath);
            const newSynchronizer = new FileSynchronizer(
                codebasePath,
                this.getActiveIgnorePatterns(codebasePath),
                this.getIndexedExtensionsForCodebase(codebasePath),
                { checkpointIdentity: collectionName, checkpointAuthority },
            );
            await newSynchronizer.initialize(options.assertMutationCurrent, options.publishMutation, {
                requireExistingCheckpoint: true,
            });
            this.synchronizers.set(synchronizerKey, newSynchronizer);
            this.synchronizerMutationTargets.delete(synchronizerKey);
        }

        const currentSynchronizer = this.synchronizers.get(synchronizerKey)!;
        const targetCollectionName = collectionName;
        this.synchronizerMutationTargets.set(synchronizerKey, targetCollectionName);
        const markerWasMissing = maintainCompletionMarker && previousMarker === null;

        progressCallback?.({ phase: 'Checking for file changes...', current: 0, total: 100, percentage: 0 });
        const preparedChanges = await currentSynchronizer.prepareChanges();
        const { added, removed, modified } = preparedChanges.changes;
        const totalChanges = added.length + removed.length + modified.length;

        if (totalChanges === 0) {
            const replacementRunId = maintainCompletionMarker && markerWasMissing
                ? crypto.randomUUID()
                : undefined;
            options.assertMutationCurrent?.();
            await preparedChanges.commit(
                options.assertMutationCurrent,
                options.publishMutation,
                replacementRunId ? {
                    collectionName: targetCollectionName,
                    markerRunId: replacementRunId,
                    indexPolicyHash: sealedPolicy.policyHash,
                } : undefined,
            );
            if (maintainCompletionMarker && markerWasMissing) {
                await this.refreshCompletionMarkerFromCurrentSource(codebasePath, targetCollectionName, {
                    requirePayloadProof: true,
                    assertMutationCurrent: options.assertMutationCurrent,
                    publishMutation: options.publishMutation,
                    indexPolicyHash: sealedPolicy.policyHash,
                    runId: replacementRunId,
                });
            }
            progressCallback?.({ phase: 'No changes detected', current: 100, total: 100, percentage: 100 });
            console.log('[Context] ✅ No file changes detected.');
            const currentMarker = await this.resolveCompletionMarkerForCollection(codebasePath, targetCollectionName);
            if (maintainCompletionMarker && currentMarker) {
                await this.publishSealedPolicyBindingForMarker(
                    codebasePath,
                    targetCollectionName,
                    currentMarker,
                    options.publishMutation,
                );
            }
            this.synchronizerMutationTargets.delete(synchronizerKey);
            return {
                added: 0,
                removed: 0,
                modified: 0,
                changedFiles: [],
                collectionName: targetCollectionName,
                ...(currentMarker ? {
                    indexedFiles: currentMarker.indexedFiles,
                    totalChunks: currentMarker.totalChunks,
                    indexStatus: currentMarker.indexStatus,
                } : {}),
            };
        }

        if (
            maintainCompletionMarker
            && previousMarker
            && this.vectorDatabase.getPublicationCapabilities?.().atomicCandidatePublication === 'unsupported'
        ) {
            throw new AtomicIncrementalPublicationUnsupportedError();
        }
        if (maintainCompletionMarker && previousMarker && this.vectorDatabase.forkCollection) {
            return this.performAtomicDeltaPublication({
                codebasePath,
                canonicalRoot,
                sourceCollectionName: targetCollectionName,
                previousMarker,
                sealedPolicy,
                synchronizerKey,
                preparedChanges,
                options,
                progressCallback,
            });
        }

        console.log(`[Context] 🔄 Found changes: ${added.length} added, ${removed.length} removed, ${modified.length} modified.`);
        const navigationStateBeforeSync = await readSymbolRegistrySidecar({
            stateRoot: this.symbolRegistryStateRoot,
            normalizedRootPath: this.canonicalizeCodebasePath(codebasePath),
        });
        const canRebuildNavigationArtifacts = navigationStateBeforeSync.status === 'ok';

        let processedChanges = 0;
        const updateProgress = (phase: string) => {
            processedChanges++;
            const percentage = Math.round((processedChanges / (removed.length + modified.length + added.length)) * 100);
            progressCallback?.({ phase, current: processedChanges, total: totalChanges, percentage });
        };

        let navigationRecovery: 'rebuilt' | 'failed' | undefined;
        let readinessArtifactsComplete = false;
        let replacedPayloadCount: number | null = null;
        if (previousMarker?.indexStatus !== 'limit_reached') {
            replacedPayloadCount = 0;
            for (const relativePath of new Set([...added, ...removed, ...modified])) {
                const pathCount = await this.countIndexedPayloadExactly(
                    targetCollectionName,
                    { kind: 'comparison', field: 'relativePath', operator: 'eq', value: relativePath },
                    previousMarker?.totalChunks,
                );
                if (pathCount === null) {
                    replacedPayloadCount = null;
                    break;
                }
                replacedPayloadCount += pathCount;
            }
        }
        let preparedMarkerStats: { indexedFiles: number; totalChunks: number } | null = null;

        try {
            if (maintainCompletionMarker) {
                await this.clearIndexCompletionMarkerFromCollection(targetCollectionName, options.assertMutationCurrent);
            }

            // An added source path should not normally have payload, but stale rows
            // can survive an older source generation. Reconcile them before insert
            // so the exact-count proof can converge instead of failing every retry.
            for (const file of added) {
                await this.deleteFileChunks(targetCollectionName, file, options.assertMutationCurrent);
            }

            // Handle removed files
            for (const file of removed) {
                await this.deleteFileChunks(targetCollectionName, file, options.assertMutationCurrent);
                updateProgress(`Removed ${file}`);
            }

            // Handle modified files
            for (const file of modified) {
                await this.deleteFileChunks(targetCollectionName, file, options.assertMutationCurrent);
            }

            // Handle added and modified files
            const filesToIndex = [...added, ...modified].map(f => path.join(codebasePath, f));

            let indexedDelta: {
                processedFiles: number;
                totalChunks: number;
                status: 'completed' | 'limit_reached';
                symbolRecords: SymbolRecord[];
                symbolManifestFiles: SymbolRegistryManifestFile[];
                analysisByFile: Map<string, RelationshipAnalysisEvidence>;
            } = {
                processedFiles: 0,
                totalChunks: 0,
                status: 'completed',
                symbolRecords: [],
                symbolManifestFiles: [],
                analysisByFile: new Map(),
            };

            if (filesToIndex.length > 0) {
                indexedDelta = await this.processFileList(
                    filesToIndex,
                    codebasePath,
                    (filePath, fileIndex, totalFiles) => {
                        updateProgress(`Indexed ${filePath} (${fileIndex}/${totalFiles})`);
                    },
                    targetCollectionName,
                    options.assertMutationCurrent,
                );
            }

            if (
                readinessArtifactsComplete === false
                && previousMarker
                && previousMarker.indexStatus !== 'limit_reached'
                && replacedPayloadCount !== null
                && indexedDelta.status === 'completed'
            ) {
                const expectedTotalChunks = previousMarker.totalChunks
                    - replacedPayloadCount
                    + indexedDelta.totalChunks;
                if (!Number.isSafeInteger(expectedTotalChunks) || expectedTotalChunks < 0) {
                    throw new Error(`Incremental payload accounting produced an invalid chunk count for '${codebasePath}'.`);
                }
                preparedMarkerStats = {
                    indexedFiles: preparedChanges.fileHashes.size,
                    totalChunks: expectedTotalChunks,
                };
            }

            const canPublishNavigationDelta = canRebuildNavigationArtifacts && indexedDelta.status === 'completed';
            if (canPublishNavigationDelta) {
                progressCallback?.({
                    phase: 'Rebuilding navigation metadata...',
                    current: totalChanges,
                    total: totalChanges,
                    percentage: 100,
                });
                await this.rebuildNavigationArtifactsForSyncDelta(
                    codebasePath,
                    navigationStateBeforeSync.registry,
                    Array.from(new Set([...added, ...modified, ...removed])),
                    indexedDelta.symbolRecords,
                    indexedDelta.symbolManifestFiles,
                    options.assertMutationCurrent,
                    indexedDelta.analysisByFile,
                    options.publishMutation,
                );
                readinessArtifactsComplete = true;
            } else if (!canRebuildNavigationArtifacts && indexedDelta.status === 'completed') {
                progressCallback?.({
                    phase: 'Recovering navigation metadata...',
                    current: totalChanges,
                    total: totalChanges,
                    percentage: 100,
                });
                try {
                    await this.rebuildNavigationArtifacts(
                        codebasePath,
                        options.assertMutationCurrent,
                        options.publishMutation,
                    );
                    navigationRecovery = 'rebuilt';
                    readinessArtifactsComplete = true;
                    console.log('[Context] 🧭 Rebuilt navigation sidecars after incremental sync found no compatible pre-sync registry.');
                } catch (error) {
                    await this.clearSymbolRegistryForCodebase(
                        codebasePath,
                        options.assertMutationCurrent,
                        options.publishMutation,
                    );
                    await this.clearCompletionMarkerAfterSyncFailure(codebasePath, targetCollectionName, maintainCompletionMarker, options.assertMutationCurrent);
                    navigationRecovery = 'failed';
                    console.warn(
                        `[Context] ⚠️  Failed to recover navigation sidecars after incremental sync; reindex is required: ${error instanceof Error ? error.message : String(error)}`
                    );
                }
            } else {
                await this.clearSymbolRegistryForCodebase(
                    codebasePath,
                    options.assertMutationCurrent,
                    options.publishMutation,
                );
                await this.clearCompletionMarkerAfterSyncFailure(codebasePath, targetCollectionName, maintainCompletionMarker, options.assertMutationCurrent);
                navigationRecovery = 'failed';
                if (!canRebuildNavigationArtifacts) {
                    console.log('[Context] ⏭️ Skipping navigation rebuild because no compatible symbol registry existed before incremental sync.');
                } else {
                    console.warn('[Context] ⚠️  Clearing navigation sidecars because incremental sync stopped before all changed files finished indexing.');
                }
            }
        } catch (error) {
            await this.clearSymbolRegistryForCodebase(
                codebasePath,
                options.assertMutationCurrent,
                options.publishMutation,
            );
            await this.clearCompletionMarkerAfterSyncFailure(codebasePath, targetCollectionName, maintainCompletionMarker, options.assertMutationCurrent);
            throw error;
        }

        if (readinessArtifactsComplete) {
            if (preparedMarkerStats) {
                try {
                    await this.verifyPreparedSyncPublication(
                        codebasePath,
                        targetCollectionName,
                        preparedChanges.fileHashes,
                        preparedMarkerStats.totalChunks,
                    );
                } catch (error) {
                    await this.clearSymbolRegistryForCodebase(
                        codebasePath,
                        options.assertMutationCurrent,
                        options.publishMutation,
                    );
                    await this.clearCompletionMarkerAfterSyncFailure(
                        codebasePath,
                        targetCollectionName,
                        maintainCompletionMarker,
                        options.assertMutationCurrent,
                    );
                    throw error;
                }
            }
            const nextMarkerRunId = maintainCompletionMarker ? crypto.randomUUID() : undefined;
            options.assertMutationCurrent?.();
            await preparedChanges.commit(
                options.assertMutationCurrent,
                options.publishMutation,
                nextMarkerRunId ? {
                    collectionName: targetCollectionName,
                    markerRunId: nextMarkerRunId,
                    indexPolicyHash: sealedPolicy.policyHash,
                } : undefined,
            );
            if (maintainCompletionMarker) {
                if (preparedMarkerStats) {
                    await this.writeCompletedIndexMarker(
                        codebasePath,
                        preparedMarkerStats.indexedFiles,
                        preparedMarkerStats.totalChunks,
                        targetCollectionName,
                        'completed',
                        options.assertMutationCurrent,
                        undefined,
                        sealedPolicy.policyHash,
                        nextMarkerRunId,
                    );
                } else {
                    await this.refreshCompletionMarkerFromCurrentSource(codebasePath, targetCollectionName, {
                        requirePayloadProof: true,
                        assertMutationCurrent: options.assertMutationCurrent,
                        publishMutation: options.publishMutation,
                        indexPolicyHash: sealedPolicy.policyHash,
                        runId: nextMarkerRunId,
                    });
                }
                const publishedMarker = await this.resolveCompletionMarkerForCollection(
                    codebasePath,
                    targetCollectionName,
                );
                if (!publishedMarker) {
                    throw new Error(`Incremental publication did not produce a completion marker for '${targetCollectionName}'.`);
                }
                await this.publishSealedPolicyBindingForMarker(
                    codebasePath,
                    targetCollectionName,
                    publishedMarker,
                    options.publishMutation,
                );
            }
            this.synchronizerMutationTargets.delete(synchronizerKey);
        }

        console.log(`[Context] ✅ Re-indexing complete. Added: ${added.length}, Removed: ${removed.length}, Modified: ${modified.length}`);
        progressCallback?.({ phase: 'Re-indexing complete!', current: totalChanges, total: totalChanges, percentage: 100 });

        const currentMarker = readinessArtifactsComplete && maintainCompletionMarker
            ? await this.resolveCompletionMarkerForCollection(codebasePath, targetCollectionName)
            : null;
        return {
            added: added.length,
            removed: removed.length,
            modified: modified.length,
            changedFiles: Array.from(new Set([...added, ...removed, ...modified])),
            collectionName: targetCollectionName,
            ...(navigationRecovery ? { navigationRecovery } : {}),
            ...(currentMarker ? {
                indexedFiles: currentMarker.indexedFiles,
                totalChunks: currentMarker.totalChunks,
                indexStatus: currentMarker.indexStatus,
            } : {}),
        };
    }

    private async deleteFileChunks(
        collectionName: string,
        relativePath: string,
        assertMutationCurrent?: () => void,
    ): Promise<void> {
        const results = await this.vectorDatabase.queryDocuments(collectionName, {
            filter: { kind: 'comparison', field: 'relativePath', operator: 'eq', value: relativePath },
            fields: ['id'],
        });

        if (results.length > 0) {
            const ids = results.map(r => r.id as string).filter(id => id);
            if (ids.length > 0) {
                assertMutationCurrent?.();
                await this.vectorDatabase.deleteDocuments(collectionName, ids);
                console.log(`[Context] Deleted ${ids.length} chunks for file ${relativePath}`);
            }
        }
    }
    async semanticSearch(request: SemanticSearchRequest): Promise<SemanticSearchResult[]>;
    async semanticSearch(codebasePath: string, query: string, topK?: number, threshold?: number, filter?: VectorFilter): Promise<SemanticSearchResult[]>;
    async semanticSearch(
        requestOrCodebasePath: SemanticSearchRequest | string,
        query?: string,
        topK: number = 5,
        threshold: number = 0.5,
        filter?: VectorFilter,
    ): Promise<SemanticSearchResult[]> {
        return this.semanticSearchService.search(
            requestOrCodebasePath,
            query,
            topK,
            threshold,
            filter,
        );
    }

    public async semanticSearchInProvenGeneration(
        receipt: ProvenVectorGenerationReceipt,
        request: SemanticSearchRequest,
    ): Promise<SemanticSearchResult[]> {
        return this.semanticSearchService.searchInProvenGeneration(receipt, request);
    }

    public async semanticSearchWithCandidateTraceInProvenGeneration(
        receipt: ProvenVectorGenerationReceipt,
        request: SemanticSearchRequest,
        maxEntriesPerStage: number,
        options: SemanticSearchCandidateTraceOptions = {},
    ): Promise<SemanticSearchExecutionResult> {
        return this.semanticSearchService.searchWithCandidateTraceInProvenGeneration(
            receipt,
            request,
            maxEntriesPerStage,
            options,
        );
    }

    private async clearIndexCompletionMarkerFromCollection(
        collectionName: string,
        assertMutationCurrent?: () => void,
    ): Promise<void> {
        const record = await this.vectorDatabase.getControl(collectionName, INDEX_COMPLETION_MARKER_DOC_ID);
        if (!record) {
            return;
        }
        assertMutationCurrent?.();
        await this.vectorDatabase.deleteControl(collectionName, INDEX_COMPLETION_MARKER_DOC_ID);
        this.invalidateGenerationProofForCollection(collectionName);
    }

    async clearIndexCompletionMarker(codebasePath: string, assertMutationCurrent?: () => void): Promise<void> {
        const collectionName = this.getWriteCollectionName(codebasePath);
        const hasCollection = await this.vectorDatabase.hasCollection(collectionName);
        if (!hasCollection) {
            const activeCollectionName = await this.getActiveIndexedCollectionName(codebasePath);
            if (!activeCollectionName) {
                return;
            }
            await this.clearIndexCompletionMarkerFromCollection(activeCollectionName, assertMutationCurrent);
            return;
        }

        await this.clearIndexCompletionMarkerFromCollection(collectionName, assertMutationCurrent);
    }

    async writeIndexCompletionMarker(
        codebasePath: string,
        marker: IndexCompletionMarkerDocument,
        collectionNameOverride?: string,
        assertMutationCurrent?: () => void,
    ): Promise<void> {
        const collectionName = collectionNameOverride || this.getWriteCollectionName(codebasePath);
        const hasCollection = await this.vectorDatabase.hasCollection(collectionName);
        if (!hasCollection) {
            throw new Error(`Cannot write completion marker: collection '${collectionName}' does not exist.`);
        }

        await this.clearIndexCompletionMarkerFromCollection(collectionName, assertMutationCurrent);

        const markerRecord: VectorControlRecord = {
            id: INDEX_COMPLETION_MARKER_DOC_ID,
            kind: marker.kind,
            metadata: marker,
        };

        assertMutationCurrent?.();
        await this.vectorDatabase.insertControl(collectionName, markerRecord);
        this.invalidateGenerationProofForCollection(collectionName);
    }

    async getIndexCompletionMarker(codebasePath: string): Promise<IndexCompletionMarkerDocument | null> {
        return (await this.resolveCompletionProofCollection(codebasePath))?.marker ?? null;
    }

    /** Read canonical completion-marker evidence for lifecycle validation. */
    async getIndexCompletionMarkerForValidation(codebasePath: string): Promise<CompletionMarkerValidationEvidence> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        let policyAuthorityInvalid = false;
        try {
            this.refreshRuntimePolicyAuthority(canonicalRoot);
        } catch (error) {
            if (error instanceof IndexFormatRequiresReindexError) {
                return { status: 'requires_reindex' };
            }
            if (error instanceof UnsupportedIndexAuthorityError) {
                return { status: 'unsupported_authority' };
            }
            // Marker evidence remains readable even when policy proof is malformed.
            if (error instanceof IndexPolicyAuthorityError) policyAuthorityInvalid = true;
        }
        if (policyAuthorityInvalid) return { status: 'policy_authority_invalid' };
        const boundCollection = this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalRoot)?.collectionName;
        const publishedPolicy = this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot);
        if (
            boundCollection
            && publishedPolicy
            && this.indexPolicyRuntimeService.getPolicyRuntimeCompatibility(canonicalRoot) !== true
        ) {
            return { status: 'runtime_policy_incompatible' };
        }
        let vectorProof: VectorGenerationProofResult;
        try {
            vectorProof = await this.proveVectorGenerationWithEvidence(
                codebasePath,
                undefined,
                true,
            );
        } catch (error) {
            if (error instanceof IndexFormatRequiresReindexError) {
                return { status: 'requires_reindex' };
            }
            if (error instanceof UnsupportedIndexAuthorityError) {
                return { status: 'unsupported_authority' };
            }
            if (error instanceof IndexPolicyAuthorityError) {
                return { status: 'policy_authority_invalid' };
            }
            throw error;
        }
        const vectorGeneration = vectorProof.receipt;
        if (vectorGeneration) {
            const navigationProof = await this.proveNavigationForVectorReceipt(
                canonicalRoot,
                vectorGeneration,
                true,
            );
            if (navigationProof.status === 'requires_reindex') {
                return { status: 'requires_reindex' };
            }
            if (navigationProof.status === 'unsupported') {
                return { status: 'unsupported_authority' };
            }
            const generationReceipt = navigationProof.status === 'valid'
                ? {
                    ...vectorGeneration,
                    navigation: navigationProof.generation,
                    observations: {
                        ...vectorGeneration.observations,
                        navigationToken: navigationProof.observationToken,
                    },
                }
                : undefined;
            return {
                status: 'valid_v3',
                collectionName: vectorGeneration.collectionName,
                marker: vectorGeneration.marker,
                vectorReceipt: vectorGeneration,
                navigationProof,
                ...(generationReceipt ? { generationReceipt } : {}),
                exactPayloadRecounts: vectorProof.exactPayloadRecounts,
                proofSource: vectorProof.source,
            };
        }
        const relatedCollections = await this.listRelatedCollectionNames(codebasePath);
        const { activeFamilyName, alternateFamilyName } = this.buildCollectionFamilies(codebasePath);
        const readCollectionEvidence = async (
            collectionName: string,
        ): Promise<CompletionMarkerValidationEvidence> => {
            const record = await this.vectorDatabase.getControl(
                collectionName,
                INDEX_COMPLETION_MARKER_DOC_ID,
            );
            if (!record) return { status: 'missing' };
            if (!this.completionControlRecordKindMatches(record)) {
                return { status: 'invalid_v3' };
            }
            const inspected = inspectCompletionMarker(record.metadata);
            if (inspected.status === 'requires_reindex') {
                return { status: 'requires_reindex' };
            }
            if (inspected.status === 'unsupported') {
                return { status: 'unsupported_authority' };
            }
            return inspected.status === 'current' ? { status: 'invalid_v3' } : { status: 'missing' };
        };
        if (boundCollection) {
            if (!relatedCollections.includes(boundCollection)) {
                return { status: 'invalid_v3' };
            }
            const evidence = await readCollectionEvidence(boundCollection);
            return evidence.status === 'requires_reindex'
                || evidence.status === 'unsupported_authority'
                ? evidence
                : { status: 'invalid_v3' };
        }
        const collectionPriority = [
            activeFamilyName,
            alternateFamilyName,
        ].filter((name, index, names) => relatedCollections.includes(name) && names.indexOf(name) === index);
        for (const collectionName of collectionPriority) {
            const evidence = await readCollectionEvidence(collectionName);
            if (evidence.status !== 'missing') return evidence;
        }
        return { status: 'missing' };
    }

    /**
     * Check if index exists for codebase
     * @param codebasePath Codebase path to check
     * @returns Whether index exists
     */
    async hasIndexedCollection(codebasePath: string): Promise<boolean> {
        return (await this.resolveActiveIndexedCollection(codebasePath)) !== null;
    }

    /**
     * Clear index
     * @param codebasePath Codebase path to clear index for
     * @param progressCallback Optional progress callback function
     */
    async clearIndex(
        codebasePath: string,
        progressCallback?: (progress: { phase: string; current: number; total: number; percentage: number }) => void,
        options: MutationGuardOptions = {},
    ): Promise<void> {
        console.log(`[Context] 🧹 Cleaning index data for ${codebasePath}...`);
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);

        progressCallback?.({ phase: 'Checking existing index...', current: 0, total: 100, percentage: 0 });

        progressCallback?.({ phase: 'Removing index data...', current: 50, total: 100, percentage: 50 });
        await this.indexPolicyMutationCoordinator.withLockAsync(canonicalRoot, async () => {
            this.indexPolicyDocumentStore.recoverTombstonesWhileLocked(canonicalRoot);

            for (const collectionName of await this.listRelatedCollectionNames(codebasePath)) {
                await deleteCollectionWithVerification(this.vectorDatabase, collectionName, {
                    beforeDropAttempt: options.assertMutationCurrent,
                });
            }

            // Preserve the accepted policy while remote deletion is unproven. Once
            // every related collection is confirmed absent, remove durable authority
            // before reconciling the process-local policy state.
            options.assertMutationCurrent?.();
            this.indexPolicyDocumentStore.deleteDocumentWhileLocked(canonicalRoot);
            this.clearResolvedIndexPolicyRuntime(canonicalRoot);
            this.indexPolicyRuntimeService.setPolicyFileToken(canonicalRoot, null);

            await this.clearSymbolRegistryForCodebase(
                codebasePath,
                options.assertMutationCurrent,
                options.publishMutation,
            );

            options.assertMutationCurrent?.();
            await FileSynchronizer.deleteSnapshot(codebasePath);
            const familyCollectionName = this.resolveCollectionName(codebasePath);
            this.synchronizers.delete(familyCollectionName);
            this.synchronizerMutationTargets.delete(familyCollectionName);
            this.ignoreRuleService.deleteCodebaseState(codebasePath);
            this.writeCollectionOverrides.delete(canonicalRoot);
            this.indexPolicyRuntimeService.deleteIndexProfile(canonicalRoot);
        });

        progressCallback?.({ phase: 'Index cleared', current: 100, total: 100, percentage: 100 });
        console.log('[Context] ✅ Index data cleaned');
    }

    /**
     * Update base ignore patterns (replace semantics, then rebuild effective set).
     * @param ignorePatterns Array of base ignore patterns
     */
    updateIgnorePatterns(ignorePatterns: string[]): void {
        this.ignoreRuleService.setBasePatterns([
            ...DEFAULT_IGNORE_PATTERNS,
            ...ignorePatterns,
        ]);
        this.recomputeAllPublishedPolicyRuntimeCompatibility();
        console.log(`[Context] 🚫 Updated base ignore patterns. Base total: ${this.ignoreRuleService.getBasePatterns().length}`);
    }

    async resolveIndexPolicyForCodebase(
        codebasePath: string,
        update: CustomIndexPolicyUpdate = {},
    ): Promise<ObservedResolvedIndexPolicy> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        this.indexPolicyRuntimeService.loadCustomIndexPolicy(canonicalRoot);
        return this.resolveIndexPolicyFromCurrentInputs(canonicalRoot, update, true, true);
    }

    async resolveIndexPolicyForReindex(
        codebasePath: string,
        update: CustomIndexPolicyUpdate = {},
    ): Promise<ObservedResolvedIndexPolicy> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        return this.resolveIndexPolicyFromCurrentInputs(canonicalRoot, update, false, true);
    }

    private async resolveIndexPolicyFromCurrentInputs(
        canonicalRoot: string,
        update: CustomIndexPolicyUpdate,
        inheritActiveCustomPolicy: boolean,
        activateRuntimeProfile: boolean,
    ): Promise<ObservedResolvedIndexPolicy> {
        const observedInputs = await observeIndexPolicyInputs(canonicalRoot);
        const profile = observedInputs.profileConfig.profile;
        if (activateRuntimeProfile) {
            this.setIndexProfileForCodebase(canonicalRoot, profile);
        }
        const customExtensions = update.customExtensions === undefined
            ? inheritActiveCustomPolicy
                ? this.indexPolicyRuntimeService.getRuntimeCustomExtensions(canonicalRoot)
                : []
            : normalizeSupportedExtensions(update.customExtensions);
        const customIgnorePatterns = update.customIgnorePatterns === undefined
            ? inheritActiveCustomPolicy
                ? this.ignoreRuleService.getRuntimeCustomPatterns(canonicalRoot)
                : []
            : update.customIgnorePatterns.map((pattern) => pattern.trim()).filter(Boolean);
        const fileBasedPatterns = [...observedInputs.fileBasedIgnorePatterns];
        const supportedExtensions = normalizeSupportedExtensions([
            ...getSupportedExtensionsForIndexProfile(profile),
            ...this.indexPolicyRuntimeService.getConfiguredExtensionOverlays(),
            ...customExtensions,
        ]);
        const effectiveIgnorePatterns = [
            ...this.ignoreRuleService.getBasePatterns(),
            ...customIgnorePatterns,
            ...fileBasedPatterns,
        ];
        const policyHash = computeIndexPolicyHash(profile, supportedExtensions, effectiveIgnorePatterns);
        return {
            canonicalRoot,
            profile,
            customExtensions,
            customIgnorePatterns,
            fileBasedIgnorePatterns: fileBasedPatterns,
            supportedExtensions,
            effectiveIgnorePatterns,
            policyHash,
            controlSignature: observedInputs.controlSignature,
        };
    }

    async observeIndexPolicyForIncrementalReconciliation(
        codebasePath: string,
    ): Promise<ObservedResolvedIndexPolicy> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        this.indexPolicyRuntimeService.loadCustomIndexPolicy(canonicalRoot);
        return this.resolveIndexPolicyFromCurrentInputs(canonicalRoot, {}, true, false);
    }

    async isObservedIndexPolicyControlSignatureCurrent(
        policy: ObservedResolvedIndexPolicy,
    ): Promise<boolean> {
        const canonicalRoot = this.canonicalizeCodebasePath(policy.canonicalRoot);
        return canonicalRoot === policy.canonicalRoot
            && await computeIndexPolicyControlSignature(canonicalRoot) === policy.controlSignature;
    }

    activateObservedIndexPolicyForIncrementalReconciliation(
        policy: ObservedResolvedIndexPolicy,
    ): boolean {
        const canonicalRoot = this.canonicalizeCodebasePath(policy.canonicalRoot);
        this.indexPolicyRuntimeService.loadCustomIndexPolicy(canonicalRoot);
        const publishedPolicy = this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot);
        if (!publishedPolicy || publishedPolicy.policyHash !== policy.policyHash) {
            return false;
        }
        const binding = this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalRoot);
        if (publishedPolicy.controlSignature !== policy.controlSignature) {
            if (!binding?.publication) {
                return false;
            }
            this.publishResolvedIndexPolicy(policy, binding);
        }
        this.setIndexProfileForCodebase(canonicalRoot, policy.profile);
        this.ignoreRuleService.setFileBasedPatterns(canonicalRoot, policy.fileBasedIgnorePatterns);
        this.recomputePublishedPolicyRuntimeCompatibility(canonicalRoot);
        return true;
    }

    publishResolvedIndexPolicy(
        policy: ResolvedIndexPolicy,
        binding: IndexPolicyBinding,
        publishMutation?: (publish: () => void) => void,
    ): IndexPolicyPublicationReceipt {
        const canonicalRoot = this.canonicalizeCodebasePath(policy.canonicalRoot);
        if (canonicalRoot !== policy.canonicalRoot) {
            throw new Error('Resolved index policy root is not canonical.');
        }
        return this.persistCustomIndexPolicy(
            policy,
            binding,
            publishMutation,
            () => this.indexPolicyRuntimeService.activateResolvedIndexPolicy(policy, binding),
        );
    }



    public captureDurableIndexAuthority(codebasePath: string): DurableIndexAuthoritySnapshot {
        return this.indexAuthorityCoordinator.captureDurableIndexAuthority(codebasePath);
    }

    public async restoreDurableIndexAuthority(
        snapshot: DurableIndexAuthoritySnapshot,
        publishMutation: (publish: () => void) => void,
        expectedCurrent: DurableIndexAuthoritySnapshot,
        mutationOwner?: DurableAuthorityMutationOwner,
    ): Promise<DurableIndexAuthorityRestoreResult> {
        return this.indexAuthorityCoordinator.restoreDurableIndexAuthority(
            snapshot,
            publishMutation,
            expectedCurrent,
            mutationOwner,
        );
    }

    private fsyncPath(targetPath: string): void {
        const fd = fs.openSync(targetPath, 'r');
        try {
            fs.fsyncSync(fd);
        } finally {
            fs.closeSync(fd);
        }
    }



    clearPublishedIndexPolicy(
        codebasePath: string,
        publishMutation: (publish: () => void) => void,
        expectedDocumentDigest: string,
    ): IndexPolicyPublicationReceipt {
        if (!/^[a-f0-9]{64}$/.test(expectedDocumentDigest)) {
            throw new Error('Expected index policy document digest must be a SHA-256 hex digest.');
        }
        return this.removePublishedIndexPolicy(codebasePath, publishMutation, expectedDocumentDigest);
    }

    forceClearPublishedIndexPolicy(
        codebasePath: string,
        publishMutation: (publish: () => void) => void,
    ): IndexPolicyPublicationReceipt {
        return this.removePublishedIndexPolicy(codebasePath, publishMutation);
    }

    private removePublishedIndexPolicy(
        codebasePath: string,
        publishMutation: (publish: () => void) => void,
        expectedDocumentDigest?: string,
    ): IndexPolicyPublicationReceipt {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        const receipt: IndexPolicyPublicationReceipt = {
            status: 'committed',
            operation: 'clear',
            canonicalRoot,
            previousDocumentDigest: null,
        };
        let publicationCount = 0;
        let committed = false;
        const publish = () => {
            publicationCount += 1;
            if (publicationCount > 1) {
                throw new Error('Index policy removal invoked more than once.');
            }
            this.indexPolicyDocumentStore.removeDocument(
                canonicalRoot,
                expectedDocumentDigest,
                (removedDocumentDigest) => {
                    committed = true;
                    receipt.previousDocumentDigest = removedDocumentDigest;
                    let reconciliationError: unknown;
                    try {
                        this.clearResolvedIndexPolicyRuntime(canonicalRoot);
                    } catch (error) {
                        reconciliationError = error;
                    }
                    this.indexPolicyRuntimeService.setPolicyFileToken(canonicalRoot, null);
                    if (reconciliationError) throw reconciliationError;
                },
            );
        };
        try {
            publishMutation(publish);
            if (publicationCount !== 1) {
                throw new Error('Index policy removal returned without publishing.');
            }
        } catch (error) {
            if (committed) {
                throw new IndexPolicyPublicationError(
                    `Index policy removal committed before its publication receipt failed: ${error instanceof Error ? error.message : String(error)}`,
                    receipt,
                    error,
                );
            }
            throw error;
        }
        return receipt;
    }
    /**
     * Published-state activation hook invoked by the runtime policy service
     * after a resolved policy is activated. Context owns published bindings
     * and the published resolved policy; the runtime service owns the rest.
     */


    /**
     * Published-state clear hook invoked by the runtime policy service when
     * the runtime view of a codebase policy is cleared.
     */


    /**
     * Read-only runtime compatibility view (integration oracle; state owned by
     * IndexPolicyRuntimeService).
     */
    get policyRuntimeCompatibilityByCodebase(): ReadonlyMap<string, boolean> {
        return this.indexPolicyRuntimeService.getPolicyRuntimeCompatibilityByCodebase();
    }

    private recomputePublishedPolicyRuntimeCompatibility(canonicalRoot: string): void {
        this.indexPolicyRuntimeService.recomputePolicyRuntimeCompatibility(
            canonicalRoot,
            this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot),
        );
    }

    private refreshRuntimePolicyAuthority(canonicalRoot: string): void {
        try {
            this.loadIndexProfileForCodebase(canonicalRoot);
        } catch (error) {
            if (error instanceof SatoriRepoConfigAuthorityError) {
                throw new IndexPolicyAuthorityError(
                    `Malformed repository profile authority for '${canonicalRoot}': ${error.message}`,
                    error,
                );
            }
            throw error;
        }
        this.indexPolicyRuntimeService.loadCustomIndexPolicy(canonicalRoot);
        this.recomputePublishedPolicyRuntimeCompatibility(canonicalRoot);
    }

    private recomputeAllPublishedPolicyRuntimeCompatibility(): void {
        for (const canonicalRoot of this.indexAuthorityCoordinator.publishedResolvedPolicyRoots()) {
            this.recomputePublishedPolicyRuntimeCompatibility(canonicalRoot);
        }
    }

    /**
     * Reset ignore patterns to defaults only
     */
    resetIgnorePatternsToDefaults(): void {
        this.ignoreRuleService.setBasePatterns(DEFAULT_IGNORE_PATTERNS);
        this.recomputeAllPublishedPolicyRuntimeCompatibility();
        console.log(`[Context] 🔄 Reset ignore patterns to defaults: ${this.ignoreRuleService.getBasePatterns().length} patterns`);
    }

    private getIgnoreMatcherForCodebase(codebasePath: string): ReturnType<typeof ignore> {
        return this.ignoreRuleService.getMatcher(codebasePath);
    }

    private canonicalizeCodebasePath(codebasePath: string): string {
        const resolved = path.resolve(codebasePath);
        try {
            const realPath = typeof fs.realpathSync.native === 'function'
                ? fs.realpathSync.native(resolved)
                : fs.realpathSync(resolved);
            return this.trimTrailingSeparators(path.normalize(realPath));
        } catch {
            return this.trimTrailingSeparators(path.normalize(resolved));
        }
    }

    private assertResolvedIndexPolicyRoot(codebasePath: string, policy: ResolvedIndexPolicy): void {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        if (policy.canonicalRoot !== canonicalRoot) {
            throw new Error(
                `Resolved index policy belongs to '${policy.canonicalRoot}', not '${canonicalRoot}'.`,
            );
        }
    }

    private trimTrailingSeparators(inputPath: string): string {
        const parsedRoot = path.parse(inputPath).root;
        if (inputPath === parsedRoot) {
            return inputPath;
        }
        return inputPath.replace(/[\\/]+$/, '');
    }

    private normalizeRelativePathForCodebase(
        codebasePath: string,
        candidatePath: string,
    ): RepositoryRelativePath | null {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        const canonicalRelativePath = canonicalizeRepositoryRelativePath(canonicalRoot, candidatePath);
        if (canonicalRelativePath) return canonicalRelativePath;

        // A scanned path may use the caller's symlinked root while canonicalRoot
        // names its real target. Retry against that resolved spelling only.
        const resolvedRoot = this.trimTrailingSeparators(path.normalize(path.resolve(codebasePath)));
        return resolvedRoot === canonicalRoot
            ? null
            : canonicalizeRepositoryRelativePath(resolvedRoot, candidatePath);
    }

    private normalizeRelativePathsForCodebase(codebasePath: string, relativePaths: string[]): string[] {
        const normalized: string[] = [];
        for (const candidatePath of relativePaths) {
            const normalizedPath = this.normalizeRelativePathForCodebase(codebasePath, candidatePath);
            if (!normalizedPath) {
                continue;
            }
            normalized.push(normalizedPath);
        }
        return Array.from(new Set(normalized)).sort();
    }

    /**
     * Update embedding instance
     * @param embedding New embedding instance
     */
    updateEmbedding(embedding: Embedding): void {
        const identity = resolveValidatedEmbeddingIdentity(embedding);
        this.embedding = embedding;
        this.embeddingIdentity = identity;
        console.log(`[Context] 🔄 Updated embedding provider: ${embedding.getProvider()}`);
    }

    private assertEmbeddingIdentityCurrent(): Readonly<EmbeddingIdentity> {
        const current = resolveValidatedEmbeddingIdentity(this.embedding);
        const expected = this.embeddingIdentity;
        if (
            current.provider !== expected.provider
            || current.model !== expected.model
            || current.dimension !== expected.dimension
            || current.artifactDigest !== expected.artifactDigest
            || current.normalizationPolicy !== expected.normalizationPolicy
        ) {
            throw new Error('Embedding identity changed after it was installed into Context. Install a new embedding explicitly before continuing.');
        }
        return expected;
    }

    /**
     * Update vector database instance
     * @param vectorDatabase New vector database instance
     */
    updateVectorDatabase(vectorDatabase: VectorDatabase): void {
        this.vectorDatabase = vectorDatabase;
        this.vectorStoreProvider = vectorDatabase.getBackendInfo?.().provider === 'lancedb'
            ? 'LanceDB'
            : 'Milvus';
        console.log(`[Context] 🔄 Updated vector database`);
    }

    /**
     * Prepare vector collection
     */
    private async prepareCollection(
        codebasePath: string,
        forceReindex: boolean = false,
        assertMutationCurrent?: () => void,
    ): Promise<void> {
        // Identity drift must fail before a valid published collection is
        // dropped or a staged generation is otherwise mutated.
        const embeddingIdentity = this.assertEmbeddingIdentityCurrent();
        const isHybrid = this.getIsHybrid();
        const collectionType = isHybrid === true ? 'hybrid vector' : 'vector';
        console.log(`[Context] 🔧 Preparing ${collectionType} collection for codebase: ${codebasePath}${forceReindex ? ' (FORCE REINDEX)' : ''}`);
        const collectionName = this.getWriteCollectionName(codebasePath);

        // Check if collection already exists
        const collectionExists = await this.vectorDatabase.hasCollection(collectionName);

        if (collectionExists && !forceReindex) {
            console.log(`📋 Collection ${collectionName} already exists, skipping creation`);
            return;
        }

        if (collectionExists && forceReindex) {
            console.log(`[Context] 🗑️  Dropping existing collection ${collectionName} for force reindex...`);
            assertMutationCurrent?.();
            await this.vectorDatabase.dropCollection(collectionName);
            console.log(`[Context] ✅ Collection ${collectionName} dropped successfully`);
        }

        console.log(`[Context] 🔍 Detecting embedding dimension for ${this.embedding.getProvider()} provider...`);
        const dimension = await this.embedding.detectDimension();
        this.assertEmbeddingIdentityCurrent();
        if (dimension !== embeddingIdentity.dimension) {
            throw new Error(`Detected embedding dimension ${dimension} does not match installed identity dimension ${embeddingIdentity.dimension}.`);
        }
        console.log(`[Context] 📏 Detected dimension: ${dimension} for ${this.embedding.getProvider()}`);
        const dirName = path.basename(codebasePath);

        if (isHybrid === true) {
            assertMutationCurrent?.();
            await this.vectorDatabase.createHybridCollection(
                collectionName,
                dimension,
                `Hybrid Index for ${dirName}`,
                { deferIndexBuild: this.vectorDatabase.finalizeCollectionForSearch !== undefined },
            );
        } else {
            assertMutationCurrent?.();
            await this.vectorDatabase.createCollection(collectionName, dimension, `Index for ${dirName}`);
        }

        console.log(`[Context] ✅ Collection ${collectionName} created successfully (dimension: ${dimension})`);
    }

    private async consumePreparedIndexCollection(
        codebasePath: string,
        receipt: PreparedIndexCollectionReceipt,
        expectedBinding: PreparedIndexCollectionBinding,
        assertMutationCurrent?: () => void,
    ): Promise<void> {
        // WeakSet membership is the capability boundary. Matching strings are
        // insufficient because a caller could otherwise forge a receipt and
        // skip schema creation for a stale or unrelated collection.
        if (!this.preparedIndexCollectionReceipts.delete(receipt)) {
            throw new Error('Prepared index collection receipt is unknown or already consumed.');
        }

        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        const expectedCollectionName = this.getWriteCollectionName(canonicalRoot);
        if (
            receipt.canonicalRoot !== canonicalRoot
            || receipt.collectionName !== expectedCollectionName
            || receipt.generation !== expectedBinding.generation
            || receipt.operationId !== expectedBinding.operationId
        ) {
            throw new Error('Prepared index collection receipt does not match the current mutation and staged collection.');
        }

        assertMutationCurrent?.();
        if (!await this.vectorDatabase.hasCollection(receipt.collectionName)) {
            throw new Error(`Prepared staged collection '${receipt.collectionName}' no longer exists.`);
        }
        assertMutationCurrent?.();
    }

    private async finalizePreparedCollection(
        codebasePath: string,
        assertMutationCurrent?: () => void,
    ): Promise<void> {
        if (!this.getIsHybrid() || !this.vectorDatabase.finalizeCollectionForSearch) {
            return;
        }
        // Authority publication must remain after this boundary. Before finalization the
        // collection accepts writes but is intentionally neither indexed nor searchable.
        assertMutationCurrent?.();
        await this.vectorDatabase.finalizeCollectionForSearch(this.getWriteCollectionName(codebasePath));
    }
    private async getCodeFiles(
        codebasePath: string,
        indexPolicy?: ResolvedIndexPolicy,
    ): Promise<string[]> {
        return this.indexingPipeline.getCodeFiles(codebasePath, indexPolicy);
    }

    private async readIndexableFileObservationInsideRoot(
        filePath: string,
        codebasePath: string,
        indexPolicy?: ResolvedIndexPolicy,
    ): Promise<{ content: string; sourceHash: string } | null> {
        return this.indexingPipeline.readIndexableFileObservationInsideRoot(
            filePath,
            codebasePath,
            indexPolicy,
        );
    }

    private async readIndexableFileInsideRoot(
        filePath: string,
        codebasePath: string,
        indexPolicy?: ResolvedIndexPolicy,
    ): Promise<string | null> {
        return this.indexingPipeline.readIndexableFileInsideRoot(
            filePath,
            codebasePath,
            indexPolicy,
        );
    }

    private async analyzeIndexedFile(
        filePath: string,
        codebasePath: string,
        indexPolicy?: ResolvedIndexPolicy,
    ): Promise<AnalyzedIndexedFile | null> {
        return this.indexingPipeline.analyzeIndexedFile(
            filePath,
            codebasePath,
            indexPolicy,
        );
    }

    private buildAnalyzedFileSymbolFacts(
        analyzed: AnalyzedIndexedFile,
    ): AnalyzedFileSymbolFacts {
        return this.indexingPipeline.buildAnalyzedFileSymbolFacts(analyzed);
    }

    /**
 * Process a list of files with streaming chunk processing
 * @param filePaths Array of file paths to process
 * @param codebasePath Base path for the codebase
 * @param onFileProcessed Callback called when each file is processed
 * @returns Object with processed file count and total chunk count
 */
    private async processFileList(
        filePaths: string[],
        codebasePath: string,
        onFileProcessed?: (filePath: string, fileIndex: number, totalFiles: number) => void,
        collectionName: string = this.getWriteCollectionName(codebasePath),
        assertMutationCurrent?: () => void,
        indexPolicy?: ResolvedIndexPolicy,
    ): Promise<ProcessedFileList> {
        return this.indexingPipeline.processFileList({
            filePaths,
            codebasePath,
            collectionName,
            ...(onFileProcessed ? { onFileProcessed } : {}),
            ...(assertMutationCurrent ? { assertMutationCurrent } : {}),
            ...(indexPolicy ? { indexPolicy } : {}),
        });
    }

    public async getExpectedChunksAndSymbols(
        filePaths: string[],
        codebasePath: string,
        indexPolicy?: ResolvedIndexPolicy,
    ): Promise<{
        expectedChunks: ExpectedIndexedChunk[];
        symbolRecords: SymbolRecord[];
        symbolManifestFiles: SymbolRegistryManifestFile[];
        analysisByFile: Map<string, RelationshipAnalysisEvidence>;
    }> {
        if (indexPolicy) {
            this.assertResolvedIndexPolicyRoot(codebasePath, indexPolicy);
        }
        return this.indexingPipeline.getExpectedChunksAndSymbols(
            filePaths,
            codebasePath,
            indexPolicy,
        );
    }

    private async refreshCompletionMarkerFromCurrentSource(
        codebasePath: string,
        collectionName: string,
        options: {
            requirePayloadProof?: boolean;
            assertMutationCurrent?: () => void;
            publishMutation?: (publish: () => void) => void;
            indexPolicyHash?: string;
            runId?: string;
        } = {}
    ): Promise<void> {
        await this.loadIgnorePatterns(codebasePath);
        const codeFiles = await this.getCodeFiles(codebasePath);
        const { expectedChunks } = await this.getExpectedChunksAndSymbols(codeFiles, codebasePath);
        if (options.requirePayloadProof === true) {
            await this.ensureNavigationArtifactsReadyForMarkerRefresh(
                codebasePath,
                options.assertMutationCurrent,
                options.publishMutation,
            );
            const verification = await this.verifyCollectionPayloadMatchesCurrentSource(collectionName, codeFiles, expectedChunks);
            if (!verification.ok) {
                await this.clearIndexCompletionMarkerFromCollection(collectionName, options.assertMutationCurrent);
                throw new Error(`Cannot refresh completion marker for '${codebasePath}': ${verification.message}`);
            }
        }
        await this.writeCompletedIndexMarker(
            codebasePath,
            codeFiles.length,
            expectedChunks.length,
            collectionName,
            'completed',
            options.assertMutationCurrent,
            undefined,
            options.indexPolicyHash,
            options.runId,
        );
    }

    private async verifyPreparedSyncPublication(
        codebasePath: string,
        collectionName: string,
        preparedFileHashes: ReadonlyMap<string, string>,
        expectedTotalChunks: number,
        navigationCandidate?: StagedNavigationSidecarGeneration,
        preparedObservedTotalChunks?: number | null,
    ): Promise<void> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        if (navigationCandidate) {
            const preparedFiles = [...preparedFileHashes].map(([filePath, hash]) => ({ path: filePath, hash }));
            if (
                navigationCandidate.normalizedRootPath !== canonicalRoot
                || navigationCandidate.sourceFileCount !== preparedFileHashes.size
                || navigationCandidate.sourceFilesDigest !== computeNavigationSourceFilesDigest(preparedFiles)
            ) {
                throw new Error(
                    'Cannot publish incremental completion proof: staged navigation does not match the prepared synchronizer checkpoint.',
                );
            }
            const sealState = await readNavigationGenerationSeal(
                this.symbolRegistryStateRoot,
                canonicalRoot,
                navigationCandidate.generationId,
            );
            if (
                sealState.status !== 'ok'
                || sealState.seal.symbolRegistryManifestHash !== navigationCandidate.manifestHash
                || sealState.seal.relationshipManifestHash !== navigationCandidate.relationshipManifestHash
                || computeNavigationGenerationSealHash(sealState.seal) !== navigationCandidate.navigationSealHash
            ) {
                throw new Error('Cannot publish incremental completion proof: staged navigation seal is incompatible.');
            }
        } else {
            const registryState = await readSymbolRegistrySidecar({
                stateRoot: this.symbolRegistryStateRoot,
                normalizedRootPath: canonicalRoot,
            });
            if (registryState.status !== 'ok') {
                throw new Error(`Cannot publish incremental completion proof: navigation registry is ${registryState.status}.`);
            }
            const relationshipState = await readRelationshipSidecar({
                stateRoot: this.symbolRegistryStateRoot,
                normalizedRootPath: canonicalRoot,
                expectedSymbolRegistryManifestHash: registryState.manifestHash,
            });
            if (relationshipState.status !== 'ok') {
                throw new Error(`Cannot publish incremental completion proof: relationship evidence is ${relationshipState.status}.`);
            }

            const manifestHashes = new Map(
                registryState.registry.manifest.files.map((file) => [file.path, file.hash]),
            );
            if (manifestHashes.size !== preparedFileHashes.size) {
                throw new Error(
                    `Cannot publish incremental completion proof: synchronizer tracks ${preparedFileHashes.size} files but navigation seals ${manifestHashes.size}.`,
                );
            }
            for (const [relativePath, expectedHash] of preparedFileHashes) {
                if (manifestHashes.get(relativePath) !== expectedHash) {
                    throw new Error(
                        `Cannot publish incremental completion proof: source hash for '${relativePath}' does not match the prepared synchronizer checkpoint.`,
                    );
                }
            }
        }

        const observedTotalChunks = preparedObservedTotalChunks === undefined
            ? await this.countIndexedPayloadExactly(collectionName, undefined, expectedTotalChunks)
            : preparedObservedTotalChunks;
        if (observedTotalChunks === null) {
            throw new Error(
                `Cannot publish incremental completion proof: backend cannot prove the exact payload count for '${collectionName}'.`,
            );
        }
        if (observedTotalChunks !== expectedTotalChunks) {
            throw new Error(
                `Cannot publish incremental completion proof: expected ${expectedTotalChunks} chunks but observed ${observedTotalChunks}.`,
            );
        }
    }

    private async ensureNavigationArtifactsReadyForMarkerRefresh(
        codebasePath: string,
        assertMutationCurrent?: () => void,
        publishMutation?: (publish: () => void) => void,
    ): Promise<void> {
        const canonicalPath = this.canonicalizeCodebasePath(codebasePath);
        const registry = await readSymbolRegistrySidecar({
            stateRoot: this.symbolRegistryStateRoot,
            normalizedRootPath: canonicalPath,
        });
        if (registry.status === 'ok') {
            const relationships = await readRelationshipSidecar({
                stateRoot: this.symbolRegistryStateRoot,
                normalizedRootPath: canonicalPath,
                expectedSymbolRegistryManifestHash: registry.manifestHash,
            });
            if (relationships.status === 'ok') {
                return;
            }
        }
        await this.rebuildNavigationArtifacts(codebasePath, assertMutationCurrent, publishMutation);
    }

    private async clearCompletionMarkerAfterSyncFailure(
        codebasePath: string,
        collectionName: string,
        targetKnown: boolean,
        assertMutationCurrent?: () => void,
    ): Promise<void> {
        if (targetKnown) {
            await this.clearIndexCompletionMarkerFromCollection(collectionName, assertMutationCurrent);
            return;
        }
        await this.clearIndexCompletionMarker(codebasePath, assertMutationCurrent);
    }

    private async verifyCollectionPayloadMatchesCurrentSource(
        collectionName: string,
        codeFiles: string[],
        expectedChunks: ExpectedIndexedChunk[]
    ): Promise<CollectionPayloadVerification> {
        if (codeFiles.length === 0) {
            if (await this.collectionHasAnyIndexedPayload(collectionName)) {
                return {
                    ok: false,
                    message: `collection '${collectionName}' contains remote chunks but the current index policy finds no indexable files.`,
                };
            }
            return { ok: true, indexedFiles: 0, totalChunks: 0 };
        }

        const existingIds = new Set<string>();
        const expectedIds = expectedChunks.map((chunk) => chunk.id);
        const chunkIdBatchSize = 512;
        for (let index = 0; index < expectedIds.length; index += chunkIdBatchSize) {
            const batch = expectedIds.slice(index, index + chunkIdBatchSize);
            const rows = await this.vectorDatabase.queryDocuments(collectionName, {
                filter: { kind: 'in', field: 'id', values: batch },
                fields: ['id'],
                limit: batch.length,
            });
            for (const row of rows) {
                const id = typeof row?.id === 'string' ? row.id : '';
                if (id && id !== INDEX_COMPLETION_MARKER_DOC_ID) {
                    existingIds.add(id);
                }
            }
        }

        let missingChunksCount = 0;
        for (const chunk of expectedChunks) {
            if (!existingIds.has(chunk.id)) {
                missingChunksCount++;
            }
        }
        if (missingChunksCount > 0) {
            return {
                ok: false,
                message: `${missingChunksCount} expected chunk(s) are missing from collection '${collectionName}'.`,
            };
        }

        const maxExactPayloadProbeRows = 16384;
        const remotePayloadLimit = expectedChunks.length + 1;
        if (remotePayloadLimit > maxExactPayloadProbeRows) {
            return {
                ok: false,
                message: `cannot prove exact remote payload equality for ${expectedChunks.length} expected chunks with the current vector query limit.`,
            };
        }

        const expectedIdsSet = new Set(expectedIds);
        // Repair/sync marker restoration relies on vector backends returning up to limit rows
        // for this un-ordered payload query; limit=N+1 lets us detect stale extra chunks.
        const remotePayloadRows = await this.vectorDatabase.queryDocuments(collectionName, {
            fields: ['id'],
            limit: remotePayloadLimit,
        });
        const extraRemoteIds = new Set<string>();
        for (const row of remotePayloadRows) {
            const id = typeof row?.id === 'string' ? row.id : '';
            if (id && !expectedIdsSet.has(id)) {
                extraRemoteIds.add(id);
            }
        }

        if (remotePayloadRows.length !== expectedChunks.length || extraRemoteIds.size > 0) {
            const extraCount = Math.max(0, remotePayloadRows.length - expectedChunks.length, extraRemoteIds.size);
            return {
                ok: false,
                message: `collection '${collectionName}' contains ${extraCount || 'unexpected'} stale remote chunk(s) outside the current indexable source set.`,
            };
        }

        return { ok: true, indexedFiles: codeFiles.length, totalChunks: expectedChunks.length };
    }

    /**
     * Repair index for codebase path by rebuilding metadata without vector writes.
     */
    public async repairIndex(
        codebasePath: string,
        options: RepairIndexOptions = {}
    ): Promise<RepairIndexResult> {
        assertDescriptorBoundIndexingSupported();
        const canonicalPath = this.canonicalizeCodebasePath(codebasePath);
        const currentFingerprint = this.buildIndexCompletionFingerprint();
        const snapshotEvidence = options.snapshotEvidence ?? {
            status: 'missing' as const,
            basis: 'snapshot_fingerprint_missing',
        };
        const snapshotCompatibility = snapshotEvidence.status === 'verified'
            ? classifyRepairIndexCompatibility(snapshotEvidence.fingerprint, currentFingerprint)
            : null;
        const snapshotFingerprintMatches = snapshotCompatibility?.status === 'compatible';
        const snapshotRelationshipOnlyUpgrade =
            snapshotCompatibility?.status === 'relationship_only_upgrade';
        const proof: RepairProof = {
            collection: { status: 'not_checked' },
            snapshot: snapshotEvidence.status === 'missing'
                ? { status: 'missing', basis: snapshotEvidence.basis }
                : snapshotEvidence.status === 'unproven'
                    ? { status: 'unproven', basis: snapshotEvidence.basis }
                    : snapshotFingerprintMatches
                        ? { status: 'matched', basis: snapshotEvidence.basis }
                        : snapshotRelationshipOnlyUpgrade
                            ? { status: 'matched', basis: 'snapshot_relationship_only_upgrade' }
                        : { status: 'failed', basis: 'snapshot_fingerprint_mismatch' },
            marker: { status: 'not_checked' },
            fingerprint: { status: 'not_checked' },
            payload: { status: 'not_checked' },
            staleRemoteChunks: { status: 'not_checked' },
            navigation: { status: 'not_checked' },
        };
        const publishProof = (): void => {
            options.onProofUpdate?.({
                collection: { ...proof.collection },
                snapshot: { ...proof.snapshot },
                marker: { ...proof.marker },
                fingerprint: { ...proof.fingerprint },
                payload: { ...proof.payload },
                staleRemoteChunks: { ...proof.staleRemoteChunks },
                navigation: { ...proof.navigation },
            });
        };
        const withProof = (result: Omit<RepairIndexResult, 'proof'>): RepairIndexResult => {
            publishProof();
            return {
                ...result,
                proof,
            };
        };
        publishProof();

        try {
            await resolveCurrentNavigationGeneration(this.symbolRegistryStateRoot, canonicalPath);
        } catch (error) {
            if (
                error instanceof RetiredNavigationPointerError
                || error instanceof UnsupportedNavigationPointerError
            ) {
                proof.navigation = { status: 'failed', basis: 'unsupported_navigation_authority' };
                return withProof({
                    status: 'requires_reindex',
                    reason: 'requires_reindex',
                    message: error instanceof UnsupportedNavigationPointerError
                        ? 'Repair cannot replace navigation authority written by an unsupported newer format.'
                        : 'Repair cannot promote a retired navigation authority format.',
                });
            }
            // Malformed current-format or missing navigation state remains repairable.
        }

        // 1. Resolve collection
        try {
            this.refreshRuntimePolicyAuthority(canonicalPath);
        } catch {
            // The sealed-policy step below reports unsupported or malformed
            // authority after collection-family evidence has been recorded.
        }
        const familyCollectionNames = await this.listRelatedCollectionNames(canonicalPath);
        const activeCollectionName = this.getWriteCollectionName(canonicalPath);
        const sealedCollectionName =
            this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalPath)?.collectionName;
        const preferredCollectionName = options.preferredCollectionName?.trim();
        let selectedCollection: string | null = null;
        let collectionSelectionBasis = 'selected_active_collection';
        if (preferredCollectionName) {
            if (!familyCollectionNames.includes(preferredCollectionName)) {
                const hasRelatedCollection = familyCollectionNames.length > 0;
                proof.collection = hasRelatedCollection
                    ? {
                        status: 'failed',
                        basis: 'snapshot_collection_missing_from_family',
                        observedCount: familyCollectionNames.length,
                    }
                    : { status: 'missing', basis: 'no_related_collection', observedCount: 0 };
                return withProof({
                    status: hasRelatedCollection ? 'requires_reindex' : 'blocked',
                    reason: hasRelatedCollection ? 'requires_reindex' : 'needs_create',
                    message: `Repair snapshot collection '${preferredCollectionName}' does not exist in the codebase collection family.`,
                    missingCount: 0,
                });
            }
            selectedCollection = preferredCollectionName;
            collectionSelectionBasis = 'selected_snapshot_collection';
        } else if (
            sealedCollectionName
            && familyCollectionNames.includes(sealedCollectionName)
        ) {
            selectedCollection = sealedCollectionName;
            collectionSelectionBasis = 'selected_sealed_policy_collection';
        } else if (familyCollectionNames.includes(activeCollectionName)) {
            selectedCollection = activeCollectionName;
        } else {
            const { alternateFamilyName } = this.buildCollectionFamilies(canonicalPath);
            if (familyCollectionNames.includes(alternateFamilyName)) {
                selectedCollection = alternateFamilyName;
                collectionSelectionBasis = 'selected_alternate_collection';
            } else {
                const stagedCollections = familyCollectionNames.filter((collectionName) => collectionName.includes('__gen_'));
                if (stagedCollections.length === 1) {
                    selectedCollection = stagedCollections[0];
                    collectionSelectionBasis = 'selected_single_staged_collection';
                } else if (stagedCollections.length > 1) {
                    proof.collection = {
                        status: 'failed',
                        basis: 'multiple_staged_collections',
                        observedCount: stagedCollections.length,
                    };
                    return withProof({
                        status: 'requires_reindex',
                        reason: 'requires_reindex',
                        message: `Repair found multiple staged collections for '${canonicalPath}' and cannot choose one deterministically.`,
                        missingCount: 0,
                    });
                }
            }
        }

        if (!selectedCollection) {
            proof.collection = { status: 'missing', basis: 'no_related_collection', observedCount: 0 };
            return withProof({
                status: 'blocked',
                reason: 'needs_create',
                message: 'No existing collection found for this codebase family.',
                missingCount: 0
            });
        }
        proof.collection = {
            status: 'matched',
            basis: collectionSelectionBasis,
            observedCount: familyCollectionNames.length,
        };
        publishProof();

        // 2. Check completion marker if present in the selected collection
        let trustedMarker: IndexCompletionMarkerDocument | null = null;
        let relationshipOnlyUpgrade = false;
        const markerResolution = await this.resolveRepairCompletionMarkerForCollection(canonicalPath, selectedCollection);
        if (markerResolution.status === 'malformed') {
            proof.marker = { status: 'failed', basis: 'malformed_completion_marker' };
            proof.fingerprint = snapshotFingerprintMatches
                ? { status: 'matched', basis: snapshotEvidence.basis }
                : { status: 'unproven', basis: 'malformed_completion_marker' };
            return withProof({
                status: 'requires_reindex',
                reason: 'requires_reindex',
                message: `Repair found a malformed completion marker in collection '${selectedCollection}' and cannot trust that generation.`,
            });
        }
        if (markerResolution.status === 'matched') {
            const marker = markerResolution.marker;
            const compatibility = classifyRepairIndexCompatibility(
                marker.fingerprint,
                currentFingerprint,
            );
            if (
                compatibility.status !== 'compatible'
                && compatibility.status !== 'relationship_only_upgrade'
            ) {
                proof.marker = { status: 'failed', basis: 'completion_marker_fingerprint_mismatch' };
                proof.fingerprint = { status: 'failed', basis: 'completion_marker_fingerprint_mismatch' };
                return withProof({
                    status: 'requires_reindex',
                    reason: 'requires_reindex',
                    message: 'The existing index is incompatible with the current runtime fingerprint.',
                });
            }
            trustedMarker = marker;
            relationshipOnlyUpgrade = compatibility.status === 'relationship_only_upgrade';
            const basis = relationshipOnlyUpgrade
                ? 'completion_marker_relationship_only_upgrade'
                : 'completion_marker_fingerprint';
            proof.marker = { status: 'matched', basis };
            proof.fingerprint = { status: 'matched', basis };
        } else {
            proof.marker = { status: 'missing', basis: 'completion_marker_missing' };
            if (snapshotFingerprintMatches) {
                proof.fingerprint = { status: 'matched', basis: snapshotEvidence.basis };
            } else {
                proof.fingerprint = proof.snapshot.status === 'failed'
                    ? { status: 'failed', basis: proof.snapshot.basis }
                    : { status: 'unproven', basis: 'no_trusted_fingerprint_evidence' };
                return withProof({
                    status: 'requires_reindex',
                    reason: 'requires_reindex',
                    message: `Repair cannot prove vector provenance for collection '${selectedCollection}' because the completion marker is missing and no trusted matching fingerprint was supplied.`,
                });
            }
        }
        publishProof();

        // 3. Use the exact durable policy sealed to the generation family. Repair
        // must not reconstruct policy authority from mutable repository controls.
        try {
            this.refreshRuntimePolicyAuthority(canonicalPath);
        } catch (error) {
            if (
                error instanceof IndexFormatRequiresReindexError
                || error instanceof UnsupportedIndexAuthorityError
            ) {
                proof.marker = { status: 'failed', basis: 'sealed_policy_unavailable' };
                return withProof({
                    status: 'requires_reindex',
                    reason: 'requires_reindex',
                    message: error instanceof UnsupportedIndexAuthorityError
                        ? 'Repair cannot replace index policy authority written by an unsupported newer format.'
                        : 'Repair cannot promote a retired index policy authority format.',
                });
            }
            throw error;
        }
        const repairPolicy = this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalPath);
        if (!repairPolicy || this.indexPolicyRuntimeService.getPolicyRuntimeCompatibility(canonicalPath) !== true) {
            proof.marker = { status: 'failed', basis: 'sealed_policy_unavailable' };
            return withProof({
                status: 'requires_reindex',
                reason: 'requires_reindex',
                message: `Repair cannot publish collection '${selectedCollection}' because its sealed index policy is missing or runtime-incompatible.`,
            });
        }
        const repairBinding = this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalPath);
        let v4RepairSource: {
            marker: IndexCompletionMarkerDocument;
            binding: IndexPolicyBinding & { policyHash: string };
            preparedChanges: Awaited<ReturnType<FileSynchronizer['prepareChanges']>>;
            checkpointDocumentDigest: string;
        } | null = null;
        const publication = repairBinding?.publication;
        if (
            !trustedMarker
            || !repairBinding
            || !publication
            || repairBinding.collectionName !== selectedCollection
            || repairBinding.navigation.status !== 'sealed'
            || trustedMarker.navigation.status !== 'sealed'
            || publication.sourceCheckpoint.collectionName !== selectedCollection
            || publication.sourceCheckpoint.markerRunId !== trustedMarker.runId
            || publication.sourceCheckpoint.indexPolicyHash !== trustedMarker.indexPolicyHash
            || repairPolicy.policyHash !== trustedMarker.indexPolicyHash
        ) {
            proof.navigation = {
                status: 'failed',
                basis: relationshipOnlyUpgrade
                    ? 'relationship_upgrade_v4_authority_missing'
                    : 'v4_repair_authority_missing',
            };
            return withProof({
                status: 'requires_reindex',
                reason: 'requires_reindex',
                message: 'Repair requires one exact marker-owned v4 publication and source checkpoint.',
                trackedRelativePaths: [],
            });
        }
        {
            const synchronizer = new FileSynchronizer(
                canonicalPath,
                repairPolicy.effectiveIgnorePatterns,
                repairPolicy.supportedExtensions,
                {
                    checkpointIdentity: selectedCollection,
                    checkpointAuthority: {
                        collectionName: selectedCollection,
                        markerRunId: trustedMarker.runId,
                        indexPolicyHash: trustedMarker.indexPolicyHash,
                    },
                },
            );
            try {
                await synchronizer.initialize(undefined, undefined, {
                    requireExistingCheckpoint: true,
                });
                const checkpoint = await synchronizer.inspectOwnedSnapshot();
                if (
                    checkpoint.status !== 'valid'
                    || checkpoint.merkleRoot !== publication.sourceCheckpoint.merkleRoot
                    || checkpoint.documentDigest !== publication.sourceCheckpoint.documentDigest
                ) {
                    proof.snapshot = {
                        status: 'failed',
                        basis: 'v4_source_checkpoint_mismatch',
                    };
                    return withProof({
                        status: 'requires_reindex',
                        reason: 'requires_reindex',
                        message: 'Repair cannot prove the marker-owned v4 source checkpoint.',
                    });
                }
                const preparedChanges = await synchronizer.prepareChanges({ forceFullHash: true });
                const {
                    added,
                    removed,
                    modified,
                    partialScan,
                    unscannedDirPrefixes,
                } = preparedChanges.changes;
                if (
                    added.length > 0
                    || removed.length > 0
                    || modified.length > 0
                    || partialScan
                    || unscannedDirPrefixes.length > 0
                ) {
                    proof.snapshot = {
                        status: 'failed',
                        basis: 'source_observation_changed',
                    };
                    return withProof({
                        status: 'requires_reindex',
                        reason: 'requires_reindex',
                        message: 'Repair requires a complete zero-change source observation.',
                    });
                }
                v4RepairSource = {
                    marker: trustedMarker,
                    binding: repairBinding,
                    preparedChanges,
                    checkpointDocumentDigest: checkpoint.documentDigest,
                };
                proof.snapshot = {
                    status: 'matched',
                    basis: 'v4_checkpoint_full_hash_zero_change',
                    expectedCount: preparedChanges.fileHashes.size,
                    observedCount: preparedChanges.fileHashes.size,
                };
            } catch (error) {
                proof.snapshot = {
                    status: 'failed',
                    basis: 'v4_source_checkpoint_unavailable',
                };
                return withProof({
                    status: 'requires_reindex',
                    reason: 'requires_reindex',
                    message: `Repair cannot reopen its marker-owned v4 source checkpoint: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
        }
        const codeFiles = await this.getCodeFiles(canonicalPath, repairPolicy);
        const trackedRelativePaths = this.normalizeRelativePathsForCodebase(canonicalPath, codeFiles);

        if (codeFiles.length === 0 && !v4RepairSource) {
            if (
                typeof this.vectorDatabase.getCollectionDataObservation !== 'function'
            ) {
                proof.payload = {
                    status: 'unproven',
                    basis: 'same_state_payload_authority_unavailable',
                    expectedCount: 0,
                };
                proof.staleRemoteChunks = {
                    status: 'unproven',
                    basis: 'same_state_payload_authority_unavailable',
                };
                return withProof({
                    status: 'blocked',
                    reason: 'repair_proof_limit',
                    message: `Repair cannot prove exact remote payload equality for collection '${selectedCollection}' because this vector backend does not expose same-state payload observation authority.`,
                    missingCount: 0,
                    trackedRelativePaths,
                });
            }
            const payloadObservationBefore = await this.vectorDatabase.getCollectionDataObservation(selectedCollection);
            options.assertMutationCurrent?.();
            const observedPayloadCount = await this.countIndexedPayloadExactly(selectedCollection, undefined, 0);
            options.assertMutationCurrent?.();
            const payloadObservationAfter = await this.vectorDatabase.getCollectionDataObservation(selectedCollection);
            if (
                !payloadObservationBefore
                || !payloadObservationAfter
                || payloadObservationAfter !== payloadObservationBefore
            ) {
                proof.payload = {
                    status: 'unproven',
                    basis: 'remote_payload_changed_during_proof',
                    expectedCount: 0,
                    ...(observedPayloadCount !== null ? { observedCount: observedPayloadCount } : {}),
                };
                proof.staleRemoteChunks = {
                    status: 'unproven',
                    basis: 'remote_payload_changed_during_proof',
                };
                return withProof({
                    status: 'blocked',
                    reason: 'repair_proof_limit',
                    message: `Repair could not prove collection '${selectedCollection}' from one stable remote payload state.`,
                    missingCount: 0,
                    trackedRelativePaths,
                });
            }
            if (observedPayloadCount === null) {
                proof.payload = {
                    status: 'unproven',
                    basis: 'exact_payload_count_unavailable',
                    expectedCount: 0,
                };
                proof.staleRemoteChunks = {
                    status: 'unproven',
                    basis: 'exact_payload_count_unavailable',
                };
                return withProof({
                    status: 'blocked',
                    reason: 'repair_proof_limit',
                    message: `Repair cannot prove the exact remote payload count for collection '${selectedCollection}'.`,
                    missingCount: 0,
                    trackedRelativePaths,
                });
            }
            if (observedPayloadCount !== 0) {
                proof.payload = {
                    status: 'failed',
                    basis: 'remote_payload_without_indexable_source',
                    expectedCount: 0,
                    observedCount: observedPayloadCount,
                };
                proof.staleRemoteChunks = {
                    status: 'failed',
                    basis: 'remote_payload_without_indexable_source',
                    extraCount: observedPayloadCount,
                };
                return withProof({
                    status: 'requires_reindex',
                    reason: 'requires_reindex',
                    message: `Coverage verification failed: collection '${selectedCollection}' contains remote chunks but the current index policy finds no indexable files.`,
                    missingCount: 0,
                    trackedRelativePaths,
                });
            }
            proof.payload = {
                status: 'matched',
                basis: 'empty_source_and_payload',
                expectedCount: 0,
                observedCount: 0,
                missingCount: 0,
            };
            proof.staleRemoteChunks = {
                status: 'matched',
                basis: 'empty_source_and_payload',
                extraCount: 0,
            };
            await this.clearSymbolRegistryForCodebase(
                canonicalPath,
                options.assertMutationCurrent,
                options.publishMutation,
            );
            await this.writeCompletedIndexMarker(
                canonicalPath,
                0,
                0,
                selectedCollection,
                'completed',
                options.assertMutationCurrent,
                undefined,
                repairPolicy.policyHash,
            );
            const repairedMarker = await this.resolveCompletionMarkerForCollection(canonicalPath, selectedCollection);
            if (!repairedMarker) {
                throw new Error(`Repair did not produce a completion marker for '${selectedCollection}'.`);
            }
            await this.publishSealedPolicyBindingForMarker(
                canonicalPath,
                selectedCollection,
                repairedMarker,
                options.publishMutation,
            );
            proof.navigation = { status: 'matched', basis: 'navigation_sidecars_rebuilt' };
            return withProof({
                status: 'ok',
                message: 'No files to index. Local readiness repaired (navigation sidecars rebuilt, fresh completion marker written) without vector writes.',
                indexedFiles: 0,
                totalChunks: 0,
                warnings: [],
                trackedRelativePaths,
                collectionName: selectedCollection,
            });
        }

        // 4. Split source files and compute expected chunk IDs
        const {
            expectedChunks,
            symbolRecords,
            symbolManifestFiles,
            analysisByFile,
        } = await this.getExpectedChunksAndSymbols(codeFiles, canonicalPath, repairPolicy);
        if (
            v4RepairSource
            && (
                v4RepairSource.marker.indexedFiles !== codeFiles.length
                || v4RepairSource.marker.totalChunks !== expectedChunks.length
                || v4RepairSource.preparedChanges.fileHashes.size !== codeFiles.length
            )
        ) {
            proof.payload = {
                status: 'failed',
                basis: 'marker_source_count_mismatch',
                expectedCount: expectedChunks.length,
                observedCount: v4RepairSource.marker.totalChunks,
            };
            return withProof({
                status: 'requires_reindex',
                reason: 'requires_reindex',
                message: 'Relationship-only repair found incompatible marker, source, or payload counts.',
                trackedRelativePaths,
            });
        }

        // 5. Prove expected-ID membership and exact cardinality against one
        // observed remote payload state. A mutation lease excludes Satori writers,
        // but only the adapter can prove that the backend payload stayed unchanged.
        if (
            typeof this.vectorDatabase.getCollectionDataObservation !== 'function'
            || typeof this.vectorDatabase.countDocuments !== 'function'
        ) {
            proof.payload = {
                status: 'unproven',
                basis: 'same_state_payload_authority_unavailable',
                expectedCount: expectedChunks.length,
            };
            proof.staleRemoteChunks = {
                status: 'unproven',
                basis: 'same_state_payload_authority_unavailable',
            };
            return withProof({
                status: 'blocked',
                reason: 'repair_proof_limit',
                message: `Repair cannot prove exact remote payload equality for collection '${selectedCollection}' because this vector backend does not expose same-state payload observation authority.`,
                missingCount: 0,
                trackedRelativePaths,
            });
        }
        const payloadObservationBefore = await this.vectorDatabase.getCollectionDataObservation(selectedCollection);
        if (!payloadObservationBefore) {
            proof.payload = {
                status: 'unproven',
                basis: 'same_state_payload_observation_unavailable',
                expectedCount: expectedChunks.length,
            };
            proof.staleRemoteChunks = {
                status: 'unproven',
                basis: 'same_state_payload_observation_unavailable',
            };
            return withProof({
                status: 'blocked',
                reason: 'repair_proof_limit',
                message: `Repair cannot observe a stable remote payload state for collection '${selectedCollection}'.`,
                missingCount: 0,
                trackedRelativePaths,
            });
        }

        const existingIds = new Set<string>();
        const expectedIds = expectedChunks.map((chunk) => chunk.id);
        const chunkIdBatchSize = 512;
        for (let index = 0; index < expectedIds.length; index += chunkIdBatchSize) {
            const batch = expectedIds.slice(index, index + chunkIdBatchSize);
            const rows = await this.vectorDatabase.queryDocuments(selectedCollection, {
                filter: { kind: 'in', field: 'id', values: batch },
                fields: ['id'],
                limit: batch.length,
            });
            for (const row of rows) {
                const id = typeof row?.id === 'string' ? row.id : '';
                if (id && id !== INDEX_COMPLETION_MARKER_DOC_ID) {
                    existingIds.add(id);
                }
            }
        }

        // Check chunk coverage
        let missingChunksCount = 0;
        for (const chunk of expectedChunks) {
            if (!existingIds.has(chunk.id)) {
                missingChunksCount++;
            }
        }

        // Check file coverage (every expected indexed file must have at least one chunk in existingIds, unless it legitimately produces 0 chunks)
        const fileToChunksMap = new Map<string, string[]>();
        for (const chunk of expectedChunks) {
            if (!fileToChunksMap.has(chunk.relativePath)) {
                fileToChunksMap.set(chunk.relativePath, []);
            }
            fileToChunksMap.get(chunk.relativePath)!.push(chunk.id);
        }

        let hasFileCoverageIssue = false;
        for (const file of codeFiles) {
            const relPath = this.normalizeRelativePathForCodebase(canonicalPath, file);
            if (!relPath) continue;
            const expectedIdsForFile = fileToChunksMap.get(relPath) || [];
            if (expectedIdsForFile.length > 0) {
                const hasAny = expectedIdsForFile.some(id => existingIds.has(id));
                if (!hasAny) {
                    hasFileCoverageIssue = true;
                }
            }
        }

        options.assertMutationCurrent?.();
        const observedPayloadCount = await this.countIndexedPayloadExactly(
            selectedCollection,
            undefined,
            expectedChunks.length,
        );
        options.assertMutationCurrent?.();
        const payloadObservationAfter = await this.vectorDatabase.getCollectionDataObservation(selectedCollection);
        if (!payloadObservationAfter || payloadObservationAfter !== payloadObservationBefore) {
            proof.payload = {
                status: 'unproven',
                basis: 'remote_payload_changed_during_proof',
                expectedCount: expectedChunks.length,
                ...(observedPayloadCount !== null ? { observedCount: observedPayloadCount } : {}),
                missingCount: missingChunksCount,
            };
            proof.staleRemoteChunks = {
                status: 'unproven',
                basis: 'remote_payload_changed_during_proof',
            };
            return withProof({
                status: 'blocked',
                reason: 'repair_proof_limit',
                message: `Repair could not prove collection '${selectedCollection}' from one stable remote payload state.`,
                missingCount: missingChunksCount,
                trackedRelativePaths,
            });
        }

        if (observedPayloadCount === null) {
            proof.payload = {
                status: 'unproven',
                basis: 'exact_payload_count_unavailable',
                expectedCount: expectedChunks.length,
                observedCount: existingIds.size,
                missingCount: missingChunksCount,
            };
            proof.staleRemoteChunks = {
                status: 'unproven',
                basis: 'exact_payload_count_unavailable',
            };
            return withProof({
                status: 'blocked',
                reason: 'repair_proof_limit',
                message: `Repair cannot prove the exact remote payload count for collection '${selectedCollection}'.`,
                missingCount: missingChunksCount,
                trackedRelativePaths,
            });
        }

        if (missingChunksCount > 0 || hasFileCoverageIssue) {
            const effectiveMissingCount = missingChunksCount || 1;
            proof.payload = {
                status: 'failed',
                basis: 'expected_chunks_missing',
                expectedCount: expectedChunks.length,
                observedCount: existingIds.size,
                missingCount: effectiveMissingCount,
            };
            return withProof({
                status: 'requires_reindex',
                reason: 'requires_reindex',
                message: `Coverage verification failed: ${missingChunksCount || (hasFileCoverageIssue ? 1 : 0)} expected chunk(s) are missing from collection '${selectedCollection}'.`,
                missingCount: effectiveMissingCount,
            });
        }

        if (observedPayloadCount !== expectedChunks.length) {
            const extraCount = Math.max(0, observedPayloadCount - expectedChunks.length);
            proof.payload = {
                status: 'failed',
                basis: 'remote_payload_count_mismatch',
                expectedCount: expectedChunks.length,
                observedCount: observedPayloadCount,
                missingCount: 0,
                extraCount,
            };
            proof.staleRemoteChunks = {
                status: 'failed',
                basis: 'unexpected_remote_chunk_count',
                extraCount,
            };
            return withProof({
                status: 'requires_reindex',
                reason: 'requires_reindex',
                message: `Coverage verification failed: collection '${selectedCollection}' has ${extraCount || 'unexpected'} stale remote chunk(s) beyond the ${expectedChunks.length} chunks required by current source.`,
                missingCount: 0,
                trackedRelativePaths,
            });
        }
        proof.payload = {
            status: 'matched',
            basis: 'same_state_membership_and_exact_count',
            expectedCount: expectedChunks.length,
            observedCount: observedPayloadCount,
            missingCount: 0,
            extraCount: 0,
        };
        proof.staleRemoteChunks = {
            status: 'matched',
            basis: 'same_state_exact_count_no_extras',
            extraCount: 0,
        };
        proof.navigation = {
            status: 'unproven',
            basis: 'navigation_rebuild_in_progress',
        };
        publishProof();

        if (v4RepairSource) {
            const {
                marker,
                binding,
                preparedChanges,
                checkpointDocumentDigest,
            } = v4RepairSource;
            const toActivatedGeneration = (
                receipt: ProvenGenerationReceipt,
            ): RepairActivatedGeneration => ({
                collectionName: receipt.collectionName,
                markerRunId: receipt.marker.runId,
                sourceCheckpointDocumentDigest: checkpointDocumentDigest,
                relationshipVersion: this.getRelationshipVersion(),
                navigation: {
                    generationId: receipt.navigation.generationId,
                    sealHash: receipt.navigation.navigationSealHash,
                    symbolRegistryManifestHash: receipt.navigation.symbolRegistryManifestHash,
                    relationshipManifestHash: receipt.navigation.relationshipManifestHash,
                },
            });
            const alreadyActivated = await this.proveIndexedGeneration(canonicalPath);
            if (
                alreadyActivated
                && alreadyActivated.collectionName === selectedCollection
                && this.indexCompletionMarkersEqual(alreadyActivated.marker, marker)
                && alreadyActivated.exactPayloadCount === expectedChunks.length
            ) {
                proof.navigation = {
                    status: 'matched',
                    basis: 'v4_navigation_already_activated',
                };
                return withProof({
                    status: 'ok',
                    message: 'The existing v4 publication and navigation are already exactly proven; repair made no changes.',
                    indexedFiles: codeFiles.length,
                    totalChunks: expectedChunks.length,
                    warnings: [],
                    trackedRelativePaths,
                    collectionName: selectedCollection,
                    activatedGeneration: toActivatedGeneration(alreadyActivated),
                });
            }

            const previousNavigationGenerationId = binding.navigation.status === 'sealed'
                ? binding.navigation.generationId
                : null;
            if (!previousNavigationGenerationId) {
                throw new Error('V4 navigation repair lost its sealed source navigation binding.');
            }
            await this.waitForPublicationRetention(canonicalPath);
            options.assertMutationCurrent?.();
            let navigationCandidate: StagedNavigationSidecarGeneration | undefined;
            let activated = false;
            try {
                navigationCandidate = await this.writeSymbolRegistryForCompletedIndex(
                    canonicalPath,
                    symbolRecords,
                    symbolManifestFiles,
                    options.assertMutationCurrent,
                    analysisByFile,
                    undefined,
                    true,
                    repairPolicy,
                );
                if (!navigationCandidate) {
                    throw new Error('V4 navigation repair did not stage a navigation generation.');
                }
                await this.verifyPreparedSyncPublication(
                    canonicalPath,
                    selectedCollection,
                    preparedChanges.fileHashes,
                    expectedChunks.length,
                    navigationCandidate,
                    observedPayloadCount,
                );
                const authority = options.publicationAuthority;
                if (!authority) {
                    throw new Error('V4 navigation repair requires publication authority.');
                }
                const activationId = crypto.randomUUID();
                const publication: CanonicalPublicationBinding = {
                    activationId,
                    sourceCheckpoint: structuredClone(binding.publication!.sourceCheckpoint),
                    graph: {
                        kind: 'relationship_manifest_v2',
                        manifestHash: navigationCandidate.relationshipManifestHash,
                    },
                    receipt: {
                        ownerId: authority.ownerId,
                        generation: authority.generation,
                        operationId: authority.operationId,
                    },
                };
                await preparedChanges.assertSourceObservationCurrent();
                options.assertMutationCurrent?.();
                try {
                    this.publishResolvedIndexPolicy(
                        repairPolicy,
                        {
                            collectionName: selectedCollection,
                            navigation: {
                                status: 'sealed',
                                generationId: navigationCandidate.generationId,
                                sealHash: navigationCandidate.navigationSealHash,
                            },
                            publication,
                        },
                        options.publishMutation,
                    );
                    activated = true;
                } catch (error) {
                    if (
                        error instanceof IndexPolicyPublicationError
                        && error.receipt.operation === 'publish'
                        && error.receipt.collectionName === selectedCollection
                        && error.receipt.publication?.activationId === activationId
                    ) {
                        activated = true;
                        this.refreshRuntimePolicyAuthority(canonicalPath);
                    } else {
                        throw error;
                    }
                }

                const navigation: CurrentNavigationGeneration = {
                    generationId: navigationCandidate.generationId,
                    generationRoot: navigationCandidate.rootPath,
                    symbolRegistryManifestHash: navigationCandidate.manifestHash,
                    relationshipManifestHash: navigationCandidate.relationshipManifestHash,
                    navigationSealHash: navigationCandidate.navigationSealHash,
                };
                await this.indexAuthorityCoordinator.recordActivatedGenerationProof({
                    canonicalRoot: canonicalPath,
                    marker,
                    policy: repairPolicy,
                    exactPayloadCount: expectedChunks.length,
                    navigation,
                });
                const proven = await this.proveIndexedGeneration(canonicalPath);
                if (
                    !proven
                    || proven.collectionName !== selectedCollection
                    || !this.indexCompletionMarkersEqual(proven.marker, marker)
                    || proven.exactPayloadCount !== expectedChunks.length
                    || proven.navigation.generationId !== navigationCandidate.generationId
                    || proven.navigation.navigationSealHash !== navigationCandidate.navigationSealHash
                    || proven.navigation.symbolRegistryManifestHash !== navigationCandidate.manifestHash
                    || proven.navigation.relationshipManifestHash
                        !== navigationCandidate.relationshipManifestHash
                ) {
                    throw new Error('V4 navigation repair activation could not be proven exactly.');
                }
                const activeDataObservation = this.vectorDatabase.getCollectionDataObservation
                    ? await this.vectorDatabase.getCollectionDataObservation(selectedCollection)
                    : undefined;
                this.indexAuthorityCoordinator.schedulePublicationRetention({
                    canonicalRoot: canonicalPath,
                    activationId: publication.activationId,
                    activeCollectionName: selectedCollection,
                    previousCollectionName: selectedCollection,
                    activeNavigationGenerationId: navigationCandidate.generationId,
                    previousNavigationGenerationId,
                    ...(activeDataObservation ? { activeDataObservation } : {}),
                });
                proof.navigation = {
                    status: 'matched',
                    basis: 'v4_navigation_activated_and_proven',
                };
                return withProof({
                    status: 'ok',
                    message: 'V4 navigation repair activated a new proven graph without vector, marker, or checkpoint writes.',
                    indexedFiles: codeFiles.length,
                    totalChunks: expectedChunks.length,
                    warnings: [],
                    trackedRelativePaths,
                    collectionName: selectedCollection,
                    activatedGeneration: toActivatedGeneration(proven),
                });
            } catch (error) {
                if (!activated && navigationCandidate) {
                    await discardNavigationSidecarGeneration(navigationCandidate).catch(() => undefined);
                }
                throw error;
            }
        }

        // 6. Rebuild symbol registry/relationship sidecars
        const navigationCandidate = await this.writeSymbolRegistryForCompletedIndex(
            canonicalPath,
            symbolRecords,
            symbolManifestFiles,
            options.assertMutationCurrent,
            analysisByFile,
            options.publishMutation,
            false,
            repairPolicy,
        );

        // 7. Write new completion marker
        await this.writeCompletedIndexMarker(
            canonicalPath,
            codeFiles.length,
            expectedChunks.length,
            selectedCollection,
            'completed',
            options.assertMutationCurrent,
            navigationCandidate,
            repairPolicy.policyHash,
        );
        const repairedMarker = await this.resolveCompletionMarkerForCollection(canonicalPath, selectedCollection);
        if (!repairedMarker) {
            throw new Error(`Repair did not produce a completion marker for '${selectedCollection}'.`);
        }
        await this.publishSealedPolicyBindingForMarker(
            canonicalPath,
            selectedCollection,
            repairedMarker,
            options.publishMutation,
        );

        proof.navigation = { status: 'matched', basis: 'navigation_sidecars_rebuilt' };
        return withProof({
            status: 'ok',
            message: 'Local readiness repaired (navigation sidecars rebuilt, fresh completion marker written) without vector writes.',
            indexedFiles: codeFiles.length,
            totalChunks: expectedChunks.length,
            warnings: [],
            trackedRelativePaths,
            collectionName: selectedCollection,
        });
    }

    private getSymbolExtractorVersion(): string {
        return SYMBOL_EXTRACTOR_VERSION;
    }

    private getLanguageRouterVersion(): string {
        return 'language-router-v1';
    }

    private getRelationshipVersion(): string {
        return RELATIONSHIP_BUILDER_VERSION;
    }

    private buildIndexPolicyHash(codebasePath: string): string {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        this.indexPolicyRuntimeService.loadCustomIndexPolicy(canonicalRoot);
        const publishedPolicy = this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot);
        if (publishedPolicy) {
            return publishedPolicy.policyHash;
        }
        const profile = this.indexPolicyRuntimeService.getIndexProfile(canonicalRoot) || 'default';
        const payload = JSON.stringify({
            profile,
            extensions: this.getIndexedExtensionsForCodebase(codebasePath),
            ignorePatterns: this.getActiveIgnorePatterns(codebasePath),
        });
        return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
    }

    private buildRootFingerprint(canonicalRoot: string): string {
        return crypto.createHash('md5').update(canonicalRoot, 'utf8').digest('hex');
    }

    private async buildNavigationArtifactsForFiles(
        filePaths: string[],
        codebasePath: string
    ): Promise<{
        symbolRecords: SymbolRecord[];
        symbolManifestFiles: SymbolRegistryManifestFile[];
        analysisByFile: Map<string, RelationshipAnalysisEvidence>;
    }> {
        const symbolRecords: SymbolRecord[] = [];
        const symbolManifestFiles: SymbolRegistryManifestFile[] = [];
        const analysisByFile = new Map<string, RelationshipAnalysisEvidence>();

        for (const filePath of [...filePaths].sort((a, b) => a.localeCompare(b))) {
            const analyzed = await this.analyzeIndexedFile(filePath, codebasePath);
            if (analyzed === null) {
                throw new Error(`Indexed source no longer satisfies the active policy: ${filePath}`);
            }
            const symbolFacts = this.buildAnalyzedFileSymbolFacts(analyzed);
            analysisByFile.set(analyzed.relativePath, symbolFacts.relationshipEvidence);
            symbolRecords.push(...symbolFacts.symbolRecords);
            symbolManifestFiles.push(symbolFacts.manifestFile);
        }

        return {
            symbolRecords,
            symbolManifestFiles,
            analysisByFile,
        };
    }

    private async rebuildNavigationArtifacts(
        codebasePath: string,
        assertMutationCurrent?: () => void,
        publishMutation?: (publish: () => void) => void,
    ): Promise<void> {
        const codeFiles = await this.getCodeFiles(codebasePath);
        if (codeFiles.length === 0) {
            await this.clearSymbolRegistryForCodebase(
                codebasePath,
                assertMutationCurrent,
                publishMutation,
            );
            return;
        }

        const navigationArtifacts = await this.buildNavigationArtifactsForFiles(codeFiles, codebasePath);
        await this.writeSymbolRegistryForCompletedIndex(
            codebasePath,
            navigationArtifacts.symbolRecords,
            navigationArtifacts.symbolManifestFiles,
            assertMutationCurrent,
            navigationArtifacts.analysisByFile,
            publishMutation,
        );
    }

    private async rebuildNavigationArtifactsForSyncDelta(
        codebasePath: string,
        existingRegistry: SymbolRegistry,
        changedRelativePaths: string[],
        rebuiltSymbolRecords: SymbolRecord[],
        rebuiltManifestFiles: SymbolRegistryManifestFile[],
        assertMutationCurrent?: () => void,
        analysisByFile?: Map<string, RelationshipAnalysisEvidence>,
        publishMutation?: (publish: () => void) => void,
        existingGenerationId?: string,
        deferPublication = false,
        existingRelationshipState?: CachedNavigationDeltaState,
        onPhaseTiming?: ReindexByChangeOptions['onPhaseTiming'],
    ): Promise<NavigationDeltaBuildResult> {
        const measurePhase = async <T>(
            phase:
                | 'publication_relationship_load'
                | 'publication_relationship_delta'
                | 'publication_sidecar_stage',
            run: () => Promise<T> | T,
        ): Promise<T> => {
            const startedAt = performance.now();
            try {
                return await run();
            } finally {
                onPhaseTiming?.(phase, Math.max(0, performance.now() - startedAt));
            }
        };
        const replacedPaths = new Set<string>([
            ...changedRelativePaths.map((filePath) => filePath.replace(/\\/g, '/').replace(/^\/+/, '')),
            ...rebuiltManifestFiles.map((file) => file.path),
        ]);
        const retainedAnalysisByFile = new Map<string, RelationshipAnalysisEvidence>();
        const previousAnalysisByFile = new Map<string, RelationshipAnalysisEvidence>();
        const existingRelationships = existingRelationshipState
            ? {
                status: 'ok' as const,
                records: existingRelationshipState.records,
                analysisByFile: existingRelationshipState.analysisByFile,
            }
            : await measurePhase(
                'publication_relationship_load',
                () => readRelationshipSidecar({
                    stateRoot: this.symbolRegistryStateRoot,
                    normalizedRootPath: this.canonicalizeCodebasePath(codebasePath),
                    expectedSymbolRegistryManifestHash: computeSymbolRegistryManifestHash(existingRegistry.manifest),
                    ...(existingGenerationId ? { generationId: existingGenerationId } : {}),
                }),
            );
        if (existingRelationships.status === 'ok') {
            for (const file of existingRegistry.manifest.files) {
                const evidence = existingRelationships.analysisByFile.get(file.path);
                if (evidence) previousAnalysisByFile.set(file.path, evidence);
                if (replacedPaths.has(file.path)) continue;
                if (evidence) retainedAnalysisByFile.set(file.path, evidence);
            }
        }
        for (const [filePath, evidence] of analysisByFile ?? []) {
            retainedAnalysisByFile.set(filePath, evidence);
        }

        const mergedManifestFiles = [
            ...existingRegistry.manifest.files.filter((file) => !replacedPaths.has(file.path)),
            ...rebuiltManifestFiles,
        ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

        if (mergedManifestFiles.length === 0) {
            await this.clearSymbolRegistryForCodebase(
                codebasePath,
                assertMutationCurrent,
                publishMutation,
            );
            return {};
        }

        const mergedSymbolRecords = [
            ...existingRegistry.symbols.filter((symbol) => !replacedPaths.has(symbol.file)),
            ...rebuiltSymbolRecords,
        ];

        if (deferPublication && existingGenerationId) {
            if (existingRelationships.status !== 'ok') {
                throw new Error('Atomic navigation delta requires compatible per-file relationship contributions.');
            }
            const registry = buildSymbolRegistry({
                manifest: {
                    schemaVersion: SYMBOL_REGISTRY_SCHEMA_VERSION,
                    normalizedRootPath: this.canonicalizeCodebasePath(codebasePath),
                    rootFingerprint: this.buildRootFingerprint(codebasePath),
                    indexPolicyHash: existingRegistry.manifest.indexPolicyHash,
                    languageRouterVersion: this.getLanguageRouterVersion(),
                    extractorVersion: this.getSymbolExtractorVersion(),
                    relationshipVersion: this.getRelationshipVersion(),
                    builtAt: new Date().toISOString(),
                    files: mergedManifestFiles,
                },
                symbols: mergedSymbolRecords,
            });
            const relationshipDelta = await measurePhase(
                'publication_relationship_delta',
                () => buildRelationshipDelta({
                    previousRegistry: existingRegistry,
                    registry,
                    existingRecords: existingRelationships.records,
                    analysisByFile: retainedAnalysisByFile,
                    changedFiles: replacedPaths,
                    previousAnalysisByFile,
                }),
            );
            assertMutationCurrent?.();
            const candidate = await measurePhase(
                'publication_sidecar_stage',
                () => stageNavigationSidecarGeneration({
                    stateRoot: this.symbolRegistryStateRoot,
                    registry,
                    records: relationshipDelta.records,
                    analysisByFile: retainedAnalysisByFile,
                    deltaReuse: {
                        baseGenerationId: existingGenerationId,
                        symbolFilesToRewrite: [...replacedPaths],
                        relationshipFilesToRewrite: relationshipDelta.affectedFiles,
                    },
                }),
            );
            console.log(
                `[Context] 🧭 Staged navigation delta '${candidate.generationId}' affecting `
                + `${relationshipDelta.affectedFiles.length} relationship owner(s); `
                + `shared ${candidate.physical.sharedFiles} file(s) and wrote `
                + `${candidate.physical.physicallyWrittenBytes} physical byte(s).`,
            );
            return {
                candidate,
                state: {
                    canonicalRoot: this.canonicalizeCodebasePath(codebasePath),
                    generationId: candidate.generationId,
                    symbolRegistryManifestHash: candidate.manifestHash,
                    relationshipManifestHash: candidate.relationshipManifestHash,
                    navigationSealHash: candidate.navigationSealHash,
                    registry,
                    records: relationshipDelta.records,
                    analysisByFile: retainedAnalysisByFile,
                },
            };
        }

        return {
            candidate: await this.writeSymbolRegistryForCompletedIndex(
                codebasePath,
                mergedSymbolRecords,
                mergedManifestFiles,
                assertMutationCurrent,
                retainedAnalysisByFile,
                publishMutation,
                deferPublication,
            ),
        };
    }

    private async writeSymbolRegistryForCompletedIndex(
        codebasePath: string,
        symbolRecords: SymbolRecord[],
        symbolManifestFiles: SymbolRegistryManifestFile[],
        assertMutationCurrent?: () => void,
        suppliedAnalysisByFile?: Map<string, RelationshipAnalysisEvidence>,
        publishMutation?: (publish: () => void) => void,
        deferPublication: boolean = false,
        indexPolicy?: ResolvedIndexPolicy,
    ): Promise<StagedNavigationSidecarGeneration | undefined> {
        if (indexPolicy) {
            this.assertResolvedIndexPolicyRoot(codebasePath, indexPolicy);
        }
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        const manifestFiles = [...symbolManifestFiles].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
        const registry = buildSymbolRegistry({
            manifest: {
                schemaVersion: SYMBOL_REGISTRY_SCHEMA_VERSION,
                normalizedRootPath: canonicalRoot,
                rootFingerprint: this.buildRootFingerprint(canonicalRoot),
                indexPolicyHash: indexPolicy?.policyHash ?? this.buildIndexPolicyHash(codebasePath),
                languageRouterVersion: this.getLanguageRouterVersion(),
                extractorVersion: this.getSymbolExtractorVersion(),
                relationshipVersion: this.getRelationshipVersion(),
                builtAt: new Date().toISOString(),
                files: manifestFiles,
            },
            symbols: symbolRecords,
        });

        const analysisByFile = new Map(suppliedAnalysisByFile ?? []);
        for (const file of manifestFiles) {
            const absoluteFile = path.resolve(canonicalRoot, file.path);
            const relativeFromRoot = path.relative(canonicalRoot, absoluteFile);
            if (!relativeFromRoot || relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
                throw new Error(`Navigation manifest path '${file.path}' escapes the codebase root.`);
            }
            const content = await this.readIndexableFileInsideRoot(absoluteFile, canonicalRoot, indexPolicy);
            if (content === null) {
                throw new Error(`Navigation source no longer satisfies the active policy for '${file.path}'.`);
            }
            const observedHash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
            if (observedHash !== file.hash) {
                throw new Error(`Source changed before navigation publication for '${file.path}'.`);
            }
            if (analysisByFile.has(file.path)) {
                continue;
            }
            const analysis = await this.languageAnalyzer.analyze({
                content,
                language: file.language,
                relativePath: file.path,
            });
            analysisByFile.set(file.path, {
                moduleBindings: analysis.moduleBindings,
                callSites: analysis.callSites,
                receiverTypeBindings: analysis.receiverTypeBindings,
                pythonFlowFacts: analysis.pythonFlowFacts ?? [],
            });
        }
        const relationshipRecords = buildRelationshipsForRegistry({ registry, analysisByFile });
        assertMutationCurrent?.();
        const result = await stageNavigationSidecarGeneration({
            stateRoot: this.symbolRegistryStateRoot,
            registry,
            records: relationshipRecords,
            analysisByFile,
        });
        this.preparedNavigationDeltaStates.set(result, {
            canonicalRoot,
            generationId: result.generationId,
            symbolRegistryManifestHash: result.manifestHash,
            relationshipManifestHash: result.relationshipManifestHash,
            navigationSealHash: result.navigationSealHash,
            registry,
            records: relationshipRecords,
            analysisByFile,
        });
        console.log(`[Context] 🧭 Staged navigation generation '${result.generationId}' with ${result.symbolCount} symbols across ${result.fileShardCount} symbol shards and ${result.relationshipCount} relationships across ${result.relationshipFileShardCount} relationship shards`);
        if (!deferPublication) {
            await this.publishNavigationCandidate(result, assertMutationCurrent, publishMutation);
        }
        return result;
    }

    public async publishNavigationCandidate(
        candidate: StagedNavigationSidecarGeneration,
        assertMutationCurrent?: () => void,
        publishMutation?: (publish: () => void) => void,
    ): Promise<void> {
        const canonicalRoot = candidate.normalizedRootPath;
        const previousGeneration = await resolveCurrentNavigationGeneration(
            this.symbolRegistryStateRoot,
            canonicalRoot,
        ).catch(() => null);
        assertMutationCurrent?.();
        await publishNavigationSidecarGeneration(candidate, {
            beforePublish: assertMutationCurrent,
            publishMutation,
        });
        const preparedDeltaState = this.preparedNavigationDeltaStates.get(candidate);
        const navigationObservationToken = preparedDeltaState
            ? this.resolveNavigationObservationToken(
                canonicalRoot,
                candidate.generationId,
                false,
            )
            : null;
        if (preparedDeltaState && navigationObservationToken) {
            this.navigationDeltaState = {
                ...preparedDeltaState,
                navigationObservationToken,
            };
        }
        this.preparedNavigationDeltaStates.delete(candidate);
        console.log(`[Context] 🧭 Published navigation generation '${candidate.generationId}'.`);
        assertMutationCurrent?.();
        try {
            const sqliteResult = await importNavigationToSqlite({
                stateRoot: this.symbolRegistryStateRoot,
                normalizedRootPath: canonicalRoot,
                beforePublish: assertMutationCurrent,
            });
            console.log(`[Context] 🧭 Imported navigation sqlite cache at ${resolveNavigationSqlitePath(this.symbolRegistryStateRoot, canonicalRoot)} with ${sqliteResult.symbolCount} symbols and ${sqliteResult.relationshipCount} relationships`);
        } catch (error) {
            assertMutationCurrent?.();
            const sqlitePath = resolveNavigationSqlitePath(this.symbolRegistryStateRoot, canonicalRoot);
            try {
                await fs.promises.rm(sqlitePath, { recursive: true, force: true });
            } catch (removeError) {
                console.warn(`[Context] ⚠️  Failed to remove stale navigation sqlite cache at ${sqlitePath}: ${removeError instanceof Error ? removeError.message : String(removeError)}`);
            }
            console.warn(`[Context] ⚠️  Failed to import navigation sqlite cache for ${canonicalRoot}: ${error instanceof Error ? error.message : String(error)}`);
        }
        try {
            const retainedGenerationIds = new Set([
                candidate.generationId,
                ...(previousGeneration ? [previousGeneration.generationId] : []),
            ]);
            const generationsRoot = path.join(candidate.rootPath, 'generations');
            const generations = await fs.promises.readdir(generationsRoot, { withFileTypes: true });
            for (const obsolete of generations
                .filter((entry) => entry.isDirectory() && !retainedGenerationIds.has(entry.name))
                .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
                assertMutationCurrent?.();
                await fs.promises.rm(path.join(generationsRoot, obsolete.name), { recursive: true, force: true });
            }
        } catch (error) {
            assertMutationCurrent?.();
            console.warn(`[Context] ⚠️  Failed to collect obsolete navigation generations for ${canonicalRoot}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public async getCurrentNavigationGeneration(
        codebasePath: string,
    ): Promise<import('../symbols/sidecar').CurrentNavigationGeneration | null> {
        return resolveCurrentNavigationGeneration(
            this.symbolRegistryStateRoot,
            this.canonicalizeCodebasePath(codebasePath),
        );
    }

    public async restoreNavigationGeneration(
        codebasePath: string,
        generation: import('../symbols/sidecar').CurrentNavigationGeneration,
        assertMutationCurrent?: () => void,
        publishMutation?: (publish: () => void) => void,
    ): Promise<void> {
        if (!generation.navigationSealHash) {
            throw new Error('Cannot restore a navigation generation that predates seal binding.');
        }
        const rootPath = path.dirname(path.dirname(generation.generationRoot));
        await publishNavigationSidecarGeneration({
            rootPath,
            normalizedRootPath: this.canonicalizeCodebasePath(codebasePath),
            generationId: generation.generationId,
            manifestHash: generation.symbolRegistryManifestHash,
            relationshipManifestHash: generation.relationshipManifestHash,
            navigationSealHash: generation.navigationSealHash,
        }, {
            beforePublish: assertMutationCurrent,
            publishMutation,
        });
    }

    public async discardNavigationCandidate(
        candidate: StagedNavigationSidecarGeneration,
        assertMutationCurrent?: () => void,
    ): Promise<void> {
        await discardNavigationSidecarGeneration(candidate, assertMutationCurrent);
    }

    public async publishCompletedIndexMarker(
        codebasePath: string,
        indexedFiles: number,
        totalChunks: number,
        collectionName: string,
        indexStatus: 'completed' | 'limit_reached',
        assertMutationCurrent?: () => void,
        navigationCandidate?: StagedNavigationSidecarGeneration,
        indexPolicyHash?: string,
        runId?: string,
    ): Promise<void> {
        await this.writeCompletedIndexMarker(
            codebasePath,
            indexedFiles,
            totalChunks,
            collectionName,
            indexStatus,
            assertMutationCurrent,
            navigationCandidate,
            indexPolicyHash,
            runId,
        );
    }

    private async clearSymbolRegistryForCodebase(
        codebasePath: string,
        assertMutationCurrent?: () => void,
        publishMutation?: (publish: () => void) => void,
    ): Promise<void> {
        assertMutationCurrent?.();
        await clearSymbolRegistrySidecar({
            stateRoot: this.symbolRegistryStateRoot,
            normalizedRootPath: this.canonicalizeCodebasePath(codebasePath),
            beforeDelete: assertMutationCurrent,
            publishMutation,
        });
    }
    private async processChunkBatch(
        chunkEntries: ProjectedChunkEntry[],
        codebasePath: string,
        collectionName: string,
        assertMutationCurrent?: () => void,
        performance?: IndexingPipelineMetrics,
    ): Promise<void> {
        return this.indexingPipeline.processChunkBatch(
            chunkEntries,
            codebasePath,
            collectionName,
            assertMutationCurrent,
            performance,
        );
    }

    static async getIgnorePatternsFromFile(filePath: string): Promise<string[]> {
        return readIgnorePatternsFile(filePath);
    }

    private async loadIgnorePatterns(codebasePath: string): Promise<void> {
        return this.ignoreRuleService.loadIgnorePatterns(codebasePath);
    }

    private matchesIgnorePattern(
        filePath: string,
        codebasePath: string,
        isDirectory: boolean = false,
        matcherOverride?: ReturnType<typeof ignore>,
    ): boolean {
        return this.ignoreRuleService.matchesIgnorePattern(
            filePath,
            codebasePath,
            isDirectory,
            matcherOverride,
        );
    }

    private withIndexPolicyMutationLock<T>(
        canonicalRoot: string,
        operation: () => T,
    ): T {
        return this.indexPolicyMutationCoordinator.withLock(canonicalRoot, operation);
    }

    private async withIndexPolicyMutationLockAsync<T>(
        canonicalRoot: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        return this.indexPolicyMutationCoordinator.withLockAsync(
            canonicalRoot,
            operation,
        );
    }

    private resolveRepoConfigObservationToken(canonicalRoot: string): string | null {
        return this.resolveFilesystemObservationToken(
            path.join(canonicalRoot, SATORI_REPO_CONFIG_FILENAME),
        );
    }

    private resolveNavigationObservationToken(
        canonicalRoot: string,
        generationId: string,
        requireCurrentPointer = true,
    ): string | null {
        const observation = this.resolveNavigationObservation(canonicalRoot, generationId, requireCurrentPointer);
        return observation.status === 'valid' ? observation.token : null;
    }

    private resolveNavigationObservation(
        canonicalRoot: string,
        generationId: string,
        requireCurrentPointer = true,
    ): { status: 'valid'; token: string } | { status: 'missing' | 'incompatible' | 'corrupt' } {
        const navigationRoot = resolveNavigationSidecarRoot(this.symbolRegistryStateRoot, canonicalRoot);
        const pointerPath = path.join(navigationRoot, 'current.json');
        const generationRoot = path.join(navigationRoot, 'generations', generationId);
        const sealPath = path.join(generationRoot, 'seal.json');
        const pointerToken = requireCurrentPointer
            ? this.resolveFilesystemObservationToken(pointerPath)
            : null;
        const sealToken = this.resolveFilesystemObservationToken(sealPath);
        if ((requireCurrentPointer && !pointerToken) || !sealToken) return { status: 'missing' };

        let pointer: Record<string, unknown>;
        let rawSeal: unknown;
        try {
            pointer = requireCurrentPointer
                ? JSON.parse(fs.readFileSync(pointerPath, 'utf8')) as Record<string, unknown>
                : {};
            rawSeal = JSON.parse(fs.readFileSync(sealPath, 'utf8')) as unknown;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'missing' };
            if (error instanceof SyntaxError) return { status: 'corrupt' };
            throw error;
        }
        const seal = parseNavigationGenerationSeal(rawSeal);
        if (!seal || (requireCurrentPointer && pointer.generationId !== generationId) || seal.generationId !== generationId) {
            return { status: 'corrupt' };
        }
        const navigationSealHash = computeNavigationGenerationSealHash(seal);
        if (
            requireCurrentPointer && (
                pointer.symbolRegistryManifestHash !== seal.symbolRegistryManifestHash
                || pointer.relationshipManifestHash !== seal.relationshipManifestHash
                || typeof pointer.navigationSealHash !== 'string'
                || pointer.navigationSealHash !== navigationSealHash
            )
        ) return { status: 'incompatible' };
        const symbolRegistryManifestToken = this.resolveFilesystemObservationToken(
            path.join(generationRoot, 'manifest.json'),
        );
        const symbolIndexToken = this.resolveFilesystemObservationToken(
            path.join(generationRoot, 'symbols', 'index.json'),
        );
        const relationshipManifestToken = this.resolveFilesystemObservationToken(
            path.join(generationRoot, 'relationships', 'manifest.json'),
        );
        const symbolsDirectoryToken = this.resolveFilesystemObservationToken(path.join(generationRoot, 'symbols'));
        const relationshipsDirectoryToken = this.resolveFilesystemObservationToken(path.join(generationRoot, 'relationships'));
        const symbolShardDirectoryToken = this.resolveFilesystemObservationToken(path.join(generationRoot, 'symbols', 'by-file'));
        const relationshipShardDirectoryToken = this.resolveFilesystemObservationToken(path.join(generationRoot, 'relationships', 'by-file'));
        if (
            !symbolRegistryManifestToken
            || !symbolIndexToken
            || !relationshipManifestToken
            || !symbolsDirectoryToken
            || !relationshipsDirectoryToken
            || !symbolShardDirectoryToken
            || !relationshipShardDirectoryToken
        ) return { status: 'missing' };
        return { status: 'valid', token: JSON.stringify({
            ...(pointerToken ? { pointerToken } : {}),
            sealToken,
            symbolRegistryManifestToken,
            symbolIndexToken,
            relationshipManifestToken,
            symbolsDirectoryToken,
            relationshipsDirectoryToken,
            symbolShardDirectoryToken,
            relationshipShardDirectoryToken,
            symbolRegistryManifestHash: seal.symbolRegistryManifestHash,
            relationshipManifestHash: seal.relationshipManifestHash,
            artifactSetHash: seal.artifactSetHash,
            navigationSealHash,
        }) };
    }

    private resolveFilesystemObservationToken(targetPath: string): string | null {
        try {
            const stat = fs.statSync(targetPath, { bigint: true });
            return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs]
                .map((value) => value.toString())
                .join(':');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw error;
        }
    }

    private clearResolvedIndexPolicyRuntime(canonicalRoot: string): void {
        this.indexPolicyRuntimeService.clearResolvedIndexPolicyRuntime(canonicalRoot);
    }

    private persistCustomIndexPolicy(
        policy: ResolvedIndexPolicy,
        binding: IndexPolicyBinding,
        publishMutation?: (publish: () => void) => void,
        activate?: () => void,
    ): IndexPolicyPublicationReceipt {
        const canonicalRoot = policy.canonicalRoot;
        if (!binding.collectionName.trim()) {
            throw new Error('Index policy collection binding must be nonempty.');
        }
        if (binding.navigation.status === 'sealed') {
            if (!/^[a-zA-Z0-9_-]+$/.test(binding.navigation.generationId)) {
                throw new Error('Index policy navigation generation binding is invalid.');
            }
            if (!/^[a-f0-9]{64}$/.test(binding.navigation.sealHash)) {
                throw new Error('Index policy navigation seal binding is invalid.');
            }
        }
        const expectedPolicyHash = computeIndexPolicyHash(
            policy.profile,
            policy.supportedExtensions,
            policy.effectiveIgnorePatterns,
        );
        if (policy.policyHash !== expectedPolicyHash) {
            throw new Error('Resolved index policy hash does not match its effective inputs.');
        }
        ignore().add(policy.effectiveIgnorePatterns);
        const previousRuntimeState = {
            ...this.indexPolicyRuntimeService.captureRuntimePolicyState(canonicalRoot),
            binding: this.indexAuthorityCoordinator.getPublishedPolicyBinding(canonicalRoot),
            resolvedPolicy: this.indexAuthorityCoordinator.getPublishedResolvedPolicy(canonicalRoot),
        };
        const restoreRuntimeState = () => {
            this.indexPolicyRuntimeService.restoreRuntimePolicyState(canonicalRoot, previousRuntimeState);
            if (previousRuntimeState.binding) {
                this.indexAuthorityCoordinator.setPublishedPolicyBinding(canonicalRoot, {
                    ...previousRuntimeState.binding,
                    navigation: { ...previousRuntimeState.binding.navigation },
                    ...(previousRuntimeState.binding.publication
                        ? { publication: structuredClone(previousRuntimeState.binding.publication) }
                        : {}),
                });
            } else {
                this.indexAuthorityCoordinator.deletePublishedPolicyBinding(canonicalRoot);
            }
            if (previousRuntimeState.resolvedPolicy) {
                this.indexAuthorityCoordinator.setPublishedResolvedPolicy(canonicalRoot, {
                    ...previousRuntimeState.resolvedPolicy,
                    customExtensions: [...previousRuntimeState.resolvedPolicy.customExtensions],
                    customIgnorePatterns: [...previousRuntimeState.resolvedPolicy.customIgnorePatterns],
                    fileBasedIgnorePatterns: [...previousRuntimeState.resolvedPolicy.fileBasedIgnorePatterns],
                    supportedExtensions: [...previousRuntimeState.resolvedPolicy.supportedExtensions],
                    effectiveIgnorePatterns: [...previousRuntimeState.resolvedPolicy.effectiveIgnorePatterns],
                });
            } else {
                this.indexAuthorityCoordinator.deletePublishedResolvedPolicy(canonicalRoot);
            }
        };
        const policyBase = {
            canonicalRoot,
            customExtensions: policy.customExtensions,
            customIgnorePatterns: policy.customIgnorePatterns,
            fileBasedIgnorePatterns: policy.fileBasedIgnorePatterns,
            profile: policy.profile,
            supportedExtensions: policy.supportedExtensions,
            effectiveIgnorePatterns: policy.effectiveIgnorePatterns,
            policyHash: policy.policyHash,
            collectionName: binding.collectionName,
            navigation: binding.navigation,
        };
        const policyDocument = binding.publication && policy.controlSignature
            ? buildCanonicalIndexPolicyDocument({
                ...policyBase,
                schemaVersion: 'satori_index_policy_v5',
                publication: binding.publication,
                controlSignature: policy.controlSignature,
            })
            : binding.publication
                ? buildCanonicalIndexPolicyDocument({
                    ...policyBase,
                    schemaVersion: 'satori_index_policy_v4',
                    publication: binding.publication,
                })
            : buildCanonicalIndexPolicyDocument({
                ...policyBase,
                schemaVersion: 'satori_index_policy_v3',
            });
        const documentDigest = policyDocument.documentDigest;
        const receipt: IndexPolicyPublicationReceipt = {
            status: 'committed',
            operation: 'publish',
            canonicalRoot,
            documentDigest,
            policyHash: policy.policyHash,
            collectionName: binding.collectionName,
            navigation: { ...binding.navigation },
            ...(binding.publication ? { publication: structuredClone(binding.publication) } : {}),
        };
        let publicationCount = 0;
        let activationVisible = false;
        try {
            const publish = () => {
                publicationCount += 1;
                if (publicationCount > 1) {
                    throw new Error('Index policy publication invoked more than once.');
                }
                try {
                    this.indexPolicyDocumentStore.persistDocument(canonicalRoot, policyDocument, () => {
                        activationVisible = true;
                        activate?.();
                        this.indexPolicyRuntimeService.setPolicyFileToken(
                            canonicalRoot,
                            this.indexPolicyRuntimeService.resolveCustomIndexPolicyFileToken(canonicalRoot),
                        );
                        this.indexPolicyRuntimeService.setPolicyDocumentDigest(canonicalRoot, documentDigest);
                    });
                } catch (error) {
                    if (!activationVisible) restoreRuntimeState();
                    throw error;
                }
            };
            if (publishMutation) {
                publishMutation(publish);
                if (publicationCount !== 1) throw new Error('Index policy publication returned without publishing.');
            } else {
                publish();
            }
        } catch (error) {
            if (publicationCount > 0 && !activationVisible) {
                restoreRuntimeState();
            }
            if (activationVisible) {
                throw new IndexPolicyPublicationError(
                    `Index policy publication committed before its receipt failed: ${error instanceof Error ? error.message : String(error)}`,
                    receipt,
                    error,
                );
            }
            throw error;
        }
        return receipt;
    }

    /**
     * Get current language-analysis information.
     */
    getLanguageAnalyzerInfo(): { description: string; hasTextFallback: boolean } {
        return {
            description: this.languageAnalyzer.getDescription(),
            hasTextFallback: true,
        };
    }

    /**
     * Check whether the current analyzer has structural support for a language.
     */
    isLanguageSupported(language: string): boolean {
        return this.languageAnalyzer.getStrategyForLanguage(language).structural;
    }

    /**
     * Get which strategy would be used for a specific language
     * @param language Programming language
     */
    getLanguageAnalysisStrategy(language: string): ReturnType<LanguageAnalysisPort['getStrategyForLanguage']> {
        return this.languageAnalyzer.getStrategyForLanguage(language);
    }
}
