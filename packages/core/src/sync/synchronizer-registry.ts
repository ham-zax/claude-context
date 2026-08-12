/**
 * Phase 4.6 — Synchronizer registry.
 *
 * Owns the per-collection synchronizer registry and its lifecycle: registration,
 * recreation, checkpoint-comparison resolution, and mutation-target tracking.
 * Context retains compatibility delegates but no synchronizer domain state or
 * policy decisions. All dependencies are narrow ports supplied by Context.
 */
import { FileSynchronizer } from './synchronizer';
import type { IndexCompletionMarkerDocument } from '../vectordb/types';
import type { ProvenGenerationReceipt } from '../core/context';

/**
 * Narrow ports the synchronizer registry needs from Context. Every dependency is
 * an explicit capability; the registry never reaches into Context state.
 */
export interface SynchronizerRegistryPorts {
    canonicalizeCodebasePath(codebasePath: string): string;
    getActiveIgnorePatterns(codebasePath?: string): string[];
    getIndexedExtensionsForCodebase(codebasePath: string): string[];
    getIsHybrid(): boolean;
    indexCompletionMarkersEqual(
        left: IndexCompletionMarkerDocument,
        right: IndexCompletionMarkerDocument,
    ): boolean;
    loadIndexProfileForCodebase(codebasePath: string): unknown;
    proveIndexedGeneration(codebasePath: string): Promise<ProvenGenerationReceipt | null>;
    resolveCollectionName(codebasePath: string): string;
}

export class SynchronizerRegistry {
    private readonly synchronizers = new Map<string, FileSynchronizer>();
    private readonly synchronizerMutationTargets = new Map<string, string>();

    constructor(private readonly ports: SynchronizerRegistryPorts) {}

    /**
     * Expose the live synchronizer map for workflow ports that consume it by
     * reference (Phase 4.5 wiring).
     */
    get synchronizerMap(): Map<string, FileSynchronizer> {
        return this.synchronizers;
    }

    /**
     * Expose the live mutation-target map for workflow ports that consume it by
     * reference (Phase 4.5 wiring).
     */
    get mutationTargetMap(): Map<string, string> {
        return this.synchronizerMutationTargets;
    }

    /**
     * Get a defensive copy of the synchronizers map.
     */
    getActiveSynchronizers(): Map<string, FileSynchronizer> {
        return new Map(this.synchronizers);
    }

    /**
     * Register a synchronizer for a collection and clear any pending mutation
     * target for it.
     */
    registerSynchronizer(collectionName: string, synchronizer: FileSynchronizer): void {
        this.synchronizers.set(collectionName, synchronizer);
        this.synchronizerMutationTargets.delete(collectionName);
    }

    /**
     * Recreate a synchronizer for a codebase using currently active ignore
     * patterns. Used when ignore rules change and deterministic reconciliation
     * is required.
     */
    async recreateSynchronizerForCodebase(
        codebasePath: string,
        assertMutationCurrent?: () => void,
        publishMutation?: (publish: () => void) => void,
        options: { requireAuthorityCheckpoint?: boolean } = {},
    ): Promise<void> {
        this.ports.loadIndexProfileForCodebase(codebasePath);
        const collectionName = this.ports.resolveCollectionName(codebasePath);
        const authorityBefore = options.requireAuthorityCheckpoint
            ? await this.ports.proveIndexedGeneration(codebasePath)
            : null;
        if (options.requireAuthorityCheckpoint && !authorityBefore) {
            throw new Error(`Cannot recreate source freshness state for '${codebasePath}': no authoritative indexed generation is available.`);
        }
        const synchronizer = new FileSynchronizer(
            codebasePath,
            this.ports.getActiveIgnorePatterns(codebasePath),
            this.ports.getIndexedExtensionsForCodebase(codebasePath),
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
            const authorityAfter = await this.ports.proveIndexedGeneration(codebasePath);
            if (
                !authorityAfter
                || authorityAfter.collectionName !== authorityBefore.collectionName
                || authorityAfter.policyDocumentDigest !== authorityBefore.policyDocumentDigest
                || !this.ports.indexCompletionMarkersEqual(authorityAfter.marker, authorityBefore.marker)
            ) {
                throw new Error(`Cannot register source freshness state for '${codebasePath}': indexed authority changed while its checkpoint was loading.`);
            }
        }
        this.synchronizers.set(collectionName, synchronizer);
        this.synchronizerMutationTargets.delete(collectionName);
    }

    /**
     * Whether a synchronizer is registered for the codebase's active collection.
     */
    hasSynchronizerForCodebase(codebasePath: string): boolean {
        return this.synchronizers.has(this.ports.resolveCollectionName(codebasePath));
    }

    /**
     * The registered synchronizer's owned snapshot observation token, or null.
     */
    getRegisteredSourceFreshnessCheckpointObservation(codebasePath: string): string | null {
        const synchronizer = this.synchronizers.get(this.ports.resolveCollectionName(codebasePath));
        return synchronizer?.getOwnedSnapshotObservationToken() ?? null;
    }

    /**
     * Resolve a synchronizer whose checkpoint identity and authority match the
     * receipt, either from the registry or by building a fresh inspector.
     */
    async resolveCheckpointComparisonSynchronizer(
        canonicalRoot: string,
        receipt: ProvenGenerationReceipt,
        observationToken: string,
    ): Promise<FileSynchronizer | null> {
        const checkpointAuthority = {
            collectionName: receipt.collectionName,
            markerRunId: receipt.marker.runId,
            indexPolicyHash: receipt.marker.indexPolicyHash,
        };
        const registered = this.synchronizers.get(this.ports.resolveCollectionName(canonicalRoot));
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
        const collectionName = this.ports.resolveCollectionName(canonicalRoot);
        this.synchronizers.set(collectionName, inspector);
        this.synchronizerMutationTargets.delete(collectionName);
        return inspector;
    }

    /**
     * Drop the synchronizer and mutation target for a collection (clear path).
     */
    clearSynchronizerForCollection(collectionName: string): void {
        this.synchronizers.delete(collectionName);
        this.synchronizerMutationTargets.delete(collectionName);
    }

    /**
     * Remove a pending mutation target for a synchronizer key.
     */
    clearMutationTarget(synchronizerKey: string): void {
        this.synchronizerMutationTargets.delete(synchronizerKey);
    }

    /**
     * Set a pending mutation target for a synchronizer key.
     */
    setMutationTarget(synchronizerKey: string, collectionName: string): void {
        this.synchronizerMutationTargets.set(synchronizerKey, collectionName);
    }
}
