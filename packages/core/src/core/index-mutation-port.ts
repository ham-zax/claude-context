/**
 * Phase 5.3 — Core IndexMutationPort.
 *
 * A narrow, operation-level port for index mutation and publication
 * operations. MCP mutation coordination depends on this port instead of
 * reaching into Context, the vector store, or the embedding engine. The port
 * contains no MCP snapshot phases, mutation leases, or response projection.
 */
import type {
    CustomIndexPolicyUpdate,
    DurableIndexAuthoritySnapshot,
    IndexCodebaseResult,
    IndexPolicyPublicationReceipt,
    ObservedResolvedIndexPolicy,
    PreparedIndexCollectionBinding,
    PreparedIndexCollectionReceipt,
    ProvenGenerationReceipt,
    ProvenVectorGenerationReceipt,
} from '../generation/contracts';
import type { ResolvedIndexPolicy } from '../policy/index-policy-runtime-service';
import type {
    RepairIndexResult,
    RepairProof,
    RepairSnapshotEvidence,
} from './repair-proof';
import type { DurableAuthorityMutationOwner } from '../generation/restore-transaction';
import type { IndexPolicyRuntimeBinding } from '../policy/index-policy-runtime-service';
import type { StagedNavigationSidecarGeneration } from '../symbols';
import type { FileSynchronizer } from '../sync/synchronizer';
import type { IndexCompletionMarkerDocument } from '../vectordb';
import type {
    VerifiedCollectionDeleteOptions,
    VerifiedCollectionDeleteResult,
} from '../vectordb/remote-delete';

export type IndexMutationProgressCallback = (
    progress: { phase: string; current: number; total: number; percentage: number },
) => void;

export type IndexMutationOptions = {
    assertMutationCurrent?: () => void;
    publishMutation?: (publish: () => void) => void;
    deferFullIndexPublication?: boolean;
    indexPolicy?: ResolvedIndexPolicy;
    preparedCollectionReceipt?: PreparedIndexCollectionReceipt;
    preparedCollectionBinding?: PreparedIndexCollectionBinding;
};

export type IndexMutationRepairOptions = {
    snapshotEvidence?: RepairSnapshotEvidence;
    preferredCollectionName?: string;
    assertMutationCurrent?: () => void;
    publishMutation?: (publish: () => void) => void;
    onProofUpdate?: (proof: RepairProof) => void;
    publicationAuthority?: DurableAuthorityMutationOwner;
};

export type DurableIndexAuthorityRestoreOutcome =
    | { status: 'restored_current' }
    | { status: 'restored_requires_reindex' }
    | { status: 'restored_unsupported_authority' };

export type EmbeddingProviderDescription = {
    provider: string;
    dimension: number;
};

/**
 * Narrow dependencies the port needs from its host (Context).
 */
export interface IndexMutationPortDependencies {
    checkCollectionLimit(): Promise<boolean>;
    deleteCollectionWithVerification(
        collectionName: string,
        options?: VerifiedCollectionDeleteOptions,
    ): Promise<VerifiedCollectionDeleteResult>;
    prepareIndexCollection(
        codebasePath: string,
        binding: PreparedIndexCollectionBinding,
        assertMutationCurrent?: () => void,
    ): Promise<PreparedIndexCollectionReceipt>;
    discardPreparedIndexCollection(receipt: PreparedIndexCollectionReceipt): void;
    proveVectorGeneration(codebasePath: string): Promise<ProvenVectorGenerationReceipt | null>;
    proveIndexedGeneration(codebasePath: string): Promise<ProvenGenerationReceipt | null>;
    repairIndex(
        codebasePath: string,
        options?: IndexMutationRepairOptions,
    ): Promise<RepairIndexResult>;
    captureDurableIndexAuthority(codebasePath: string): DurableIndexAuthoritySnapshot;
    restoreDurableIndexAuthority(
        snapshot: DurableIndexAuthoritySnapshot,
        publishMutation: (publish: () => void) => void,
        expectedCurrent: DurableIndexAuthoritySnapshot,
        mutationOwner?: DurableAuthorityMutationOwner,
    ): Promise<DurableIndexAuthorityRestoreOutcome>;
    publishCompletedIndexMarker(
        codebasePath: string,
        indexedFiles: number,
        totalChunks: number,
        collectionName: string,
        indexStatus: 'completed' | 'limit_reached',
        assertMutationCurrent?: () => void,
        navigationCandidate?: StagedNavigationSidecarGeneration,
        indexPolicyHash?: string,
        runId?: string,
    ): Promise<void>;
    publishNavigationCandidate(
        candidate: StagedNavigationSidecarGeneration,
        assertMutationCurrent?: () => void,
        publishMutation?: (publish: () => void) => void,
    ): Promise<void>;
    discardNavigationCandidate(
        candidate: StagedNavigationSidecarGeneration,
        assertMutationCurrent?: () => void,
    ): Promise<void>;
    resolveIndexPolicyForReindex(
        codebasePath: string,
        update?: CustomIndexPolicyUpdate,
    ): Promise<ObservedResolvedIndexPolicy>;
    resolveIndexPolicyForCodebase(
        codebasePath: string,
        update?: CustomIndexPolicyUpdate,
    ): Promise<ObservedResolvedIndexPolicy>;
    describeEmbeddingProvider(): EmbeddingProviderDescription;
    indexCodebase(
        codebasePath: string,
        progressCallback?: IndexMutationProgressCallback,
        forceReindex?: boolean,
        options?: IndexMutationOptions,
    ): Promise<IndexCodebaseResult>;
    isObservedIndexPolicyControlSignatureCurrent(
        policy: ObservedResolvedIndexPolicy,
    ): Promise<boolean>;
    publishResolvedIndexPolicy(
        policy: ResolvedIndexPolicy,
        binding: IndexPolicyRuntimeBinding,
        publishMutation?: (publish: () => void) => void,
    ): IndexPolicyPublicationReceipt;
    registerSynchronizer(collectionName: string, synchronizer: FileSynchronizer): void;
    indexCompletionMarkersEqual(
        left: IndexCompletionMarkerDocument,
        right: IndexCompletionMarkerDocument,
    ): boolean;
}

/**
 * Operation-level mutation/publication port for the MCP indexing coordinator.
 */
export interface IndexMutationPort {
    checkCollectionLimit(): Promise<boolean>;
    deleteCollectionWithVerification(
        collectionName: string,
        options?: VerifiedCollectionDeleteOptions,
    ): Promise<VerifiedCollectionDeleteResult>;
    prepareIndexCollection(
        codebasePath: string,
        binding: PreparedIndexCollectionBinding,
        assertMutationCurrent?: () => void,
    ): Promise<PreparedIndexCollectionReceipt>;
    discardPreparedIndexCollection(receipt: PreparedIndexCollectionReceipt): void;
    proveVectorGeneration(codebasePath: string): Promise<ProvenVectorGenerationReceipt | null>;
    proveIndexedGeneration(codebasePath: string): Promise<ProvenGenerationReceipt | null>;
    repairIndex(
        codebasePath: string,
        options?: IndexMutationRepairOptions,
    ): Promise<RepairIndexResult>;
    captureDurableIndexAuthority(codebasePath: string): DurableIndexAuthoritySnapshot;
    restoreDurableIndexAuthority(
        snapshot: DurableIndexAuthoritySnapshot,
        publishMutation: (publish: () => void) => void,
        expectedCurrent: DurableIndexAuthoritySnapshot,
        mutationOwner?: DurableAuthorityMutationOwner,
    ): Promise<DurableIndexAuthorityRestoreOutcome>;
    publishCompletedIndexMarker(
        codebasePath: string,
        indexedFiles: number,
        totalChunks: number,
        collectionName: string,
        indexStatus: 'completed' | 'limit_reached',
        assertMutationCurrent?: () => void,
        navigationCandidate?: StagedNavigationSidecarGeneration,
        indexPolicyHash?: string,
        runId?: string,
    ): Promise<void>;
    publishNavigationCandidate(
        candidate: StagedNavigationSidecarGeneration,
        assertMutationCurrent?: () => void,
        publishMutation?: (publish: () => void) => void,
    ): Promise<void>;
    discardNavigationCandidate(
        candidate: StagedNavigationSidecarGeneration,
        assertMutationCurrent?: () => void,
    ): Promise<void>;
    resolveIndexPolicyForReindex(
        codebasePath: string,
        update?: CustomIndexPolicyUpdate,
    ): Promise<ObservedResolvedIndexPolicy>;
    resolveIndexPolicyForCodebase(
        codebasePath: string,
        update?: CustomIndexPolicyUpdate,
    ): Promise<ObservedResolvedIndexPolicy>;
    describeEmbeddingProvider(): EmbeddingProviderDescription;
    indexCodebase(
        codebasePath: string,
        progressCallback?: IndexMutationProgressCallback,
        forceReindex?: boolean,
        options?: IndexMutationOptions,
    ): Promise<IndexCodebaseResult>;
    isObservedIndexPolicyControlSignatureCurrent(
        policy: ObservedResolvedIndexPolicy,
    ): Promise<boolean>;
    publishResolvedIndexPolicy(
        policy: ResolvedIndexPolicy,
        binding: IndexPolicyRuntimeBinding,
        publishMutation?: (publish: () => void) => void,
    ): IndexPolicyPublicationReceipt;
    registerSynchronizer(collectionName: string, synchronizer: FileSynchronizer): void;
    indexCompletionMarkersEqual(
        left: IndexCompletionMarkerDocument,
        right: IndexCompletionMarkerDocument,
    ): boolean;
}

export function createIndexMutationPort(
    deps: IndexMutationPortDependencies,
): IndexMutationPort {
    return {
        async checkCollectionLimit() {
            return deps.checkCollectionLimit();
        },

        async deleteCollectionWithVerification(collectionName, options) {
            return deps.deleteCollectionWithVerification(collectionName, options);
        },

        async prepareIndexCollection(codebasePath, binding, assertMutationCurrent) {
            return deps.prepareIndexCollection(codebasePath, binding, assertMutationCurrent);
        },

        discardPreparedIndexCollection(receipt) {
            return deps.discardPreparedIndexCollection(receipt);
        },

        async proveVectorGeneration(codebasePath) {
            return deps.proveVectorGeneration(codebasePath);
        },

        async proveIndexedGeneration(codebasePath) {
            return deps.proveIndexedGeneration(codebasePath);
        },

        async repairIndex(codebasePath, options) {
            return deps.repairIndex(codebasePath, options);
        },

        captureDurableIndexAuthority(codebasePath) {
            return deps.captureDurableIndexAuthority(codebasePath);
        },

        async restoreDurableIndexAuthority(snapshot, publishMutation, expectedCurrent, mutationOwner) {
            return deps.restoreDurableIndexAuthority(
                snapshot,
                publishMutation,
                expectedCurrent,
                mutationOwner,
            );
        },

        async publishCompletedIndexMarker(
            codebasePath,
            indexedFiles,
            totalChunks,
            collectionName,
            indexStatus,
            assertMutationCurrent,
            navigationCandidate,
            indexPolicyHash,
            runId,
        ) {
            return deps.publishCompletedIndexMarker(
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
        },

        async publishNavigationCandidate(candidate, assertMutationCurrent, publishMutation) {
            return deps.publishNavigationCandidate(candidate, assertMutationCurrent, publishMutation);
        },

        async discardNavigationCandidate(candidate, assertMutationCurrent) {
            return deps.discardNavigationCandidate(candidate, assertMutationCurrent);
        },

        async resolveIndexPolicyForReindex(codebasePath, update) {
            return deps.resolveIndexPolicyForReindex(codebasePath, update);
        },

        async resolveIndexPolicyForCodebase(codebasePath, update) {
            return deps.resolveIndexPolicyForCodebase(codebasePath, update);
        },

        describeEmbeddingProvider() {
            return deps.describeEmbeddingProvider();
        },

        async indexCodebase(codebasePath, progressCallback, forceReindex, options) {
            return deps.indexCodebase(codebasePath, progressCallback, forceReindex, options);
        },

        async isObservedIndexPolicyControlSignatureCurrent(policy) {
            return deps.isObservedIndexPolicyControlSignatureCurrent(policy);
        },

        publishResolvedIndexPolicy(policy, binding, publishMutation) {
            return deps.publishResolvedIndexPolicy(policy, binding, publishMutation);
        },

        registerSynchronizer(collectionName, synchronizer) {
            return deps.registerSynchronizer(collectionName, synchronizer);
        },

        indexCompletionMarkersEqual(left, right) {
            return deps.indexCompletionMarkersEqual(left, right);
        },
    };
}
