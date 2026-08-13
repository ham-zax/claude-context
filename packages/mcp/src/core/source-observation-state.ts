/**
 * Phase 5.1 — single mutable MCP state owner for generation-scoped checkpoint
 * observations, full-index source handoff, and derived readiness inputs.
 *
 * This module owns the three checkpoint-observation maps that used to live on
 * SyncManager (source checkpoint observations, checkpoint statuses, and
 * full-index handoff barriers) plus the full-index handoff lifecycle
 * (begin/reject/complete/supersede). SyncManager keeps thin compatibility
 * delegates that forward to this owner so every public method signature and
 * observable behavior is preserved.
 *
 * Keying note: callers pass the same keys they used when the maps lived on
 * SyncManager (canonical watcher roots where SyncManager computed them, raw
 * codebase paths where it did not). This owner never canonicalizes, so the
 * stored key space is identical to the previous implementation.
 */
import type {
    ProvenSourceFreshnessCheckpointEvidence,
    ProvenVectorGenerationReceipt,
} from "@zokizuan/satori-core";
import type { RootMutationLease } from "./mutation-lease.js";
import type {
    FullIndexSourceHandoffBarrierInput,
    FullIndexSourceHandoffInput,
    WatcherBootstrapCapture,
} from "./sync.js";

export type SourceCheckpointObservationStatus = 'valid' | 'missing' | 'corrupt';

/**
 * SyncManager-owned collaborators the handoff lifecycle needs. The owner stays
 * the single mutable owner of checkpoint observation/handoff state while the
 * watcher capture machinery remains SyncManager-owned.
 */
export interface SourceObservationStateDependencies {
    assertMutationCurrent(lease?: RootMutationLease): void;
    hasCurrentWatcherCapture(root: string, capture: WatcherBootstrapCapture): boolean;
    coverWatcherObservation(root: string, observedEventEpoch: number | undefined): void;
    proveVectorGeneration(root: string): Promise<ProvenVectorGenerationReceipt | null>;
    inspectSourceFreshnessCheckpoint(
        root: string,
        checkpointIdentity?: string,
        requestBoundReceipt?: ProvenVectorGenerationReceipt,
    ): Promise<ProvenSourceFreshnessCheckpointEvidence>;
    getRegisteredSourceFreshnessCheckpointObservation(root: string): string | null;
    isPreparedReadAvailable(root: string): boolean;
}

export class SourceObservationState {
    private readonly sourceCheckpointObservations: Map<string, string> = new Map();
    private readonly sourceCheckpointStatuses: Map<string, SourceCheckpointObservationStatus> = new Map();
    private readonly fullIndexSourceHandoffBarriers: Map<string, FullIndexSourceHandoffBarrierInput> = new Map();
    private readonly deps: SourceObservationStateDependencies;

    constructor(deps: SourceObservationStateDependencies) {
        this.deps = deps;
    }

    /**
     * The owned checkpoint observation map. Exposed for SyncManager's legacy
     * private-field compatibility; all production mutation goes through the
     * named methods below.
     */
    get checkpointObservations(): Map<string, string> {
        return this.sourceCheckpointObservations;
    }

    /**
     * The owned checkpoint status map. Exposed for SyncManager's legacy
     * private-field compatibility; all production mutation goes through the
     * named methods below.
     */
    get checkpointStatuses(): Map<string, SourceCheckpointObservationStatus> {
        return this.sourceCheckpointStatuses;
    }

    // ------------------------------------------------------------------
    // Checkpoint observation recording (generation-scoped)
    // ------------------------------------------------------------------

    /**
     * Record a valid checkpoint observation for a codebase. Returns the
     * previously recorded observation token (or undefined) so callers can
     * detect observation changes.
     */
    recordValidCheckpointObservation(codebasePath: string, observationToken: string): string | undefined {
        const previous = this.sourceCheckpointObservations.get(codebasePath);
        this.sourceCheckpointStatuses.set(codebasePath, 'valid');
        this.sourceCheckpointObservations.set(codebasePath, observationToken);
        return previous;
    }

    /**
     * Record that the codebase's checkpoint is unavailable (missing/corrupt):
     * the status is set and any recorded observation is cleared.
     */
    recordUnavailableCheckpoint(codebasePath: string, status: 'missing' | 'corrupt'): void {
        this.sourceCheckpointStatuses.set(codebasePath, status);
        this.sourceCheckpointObservations.delete(codebasePath);
    }

    /**
     * Record a checkpoint observation token without touching the status
     * (used by the fenced-checkpoint join path).
     */
    recordCheckpointObservation(codebasePath: string, observationToken: string): void {
        this.sourceCheckpointObservations.set(codebasePath, observationToken);
    }

    /**
     * Clear a recorded checkpoint observation without touching the status.
     */
    clearCheckpointObservation(codebasePath: string): void {
        this.sourceCheckpointObservations.delete(codebasePath);
    }

    getCheckpointObservation(codebasePath: string): string | undefined {
        return this.sourceCheckpointObservations.get(codebasePath);
    }

    getCheckpointStatus(codebasePath: string): SourceCheckpointObservationStatus | undefined {
        return this.sourceCheckpointStatuses.get(codebasePath);
    }

    hasHandoffBarrier(codebasePath: string): boolean {
        return this.fullIndexSourceHandoffBarriers.has(codebasePath);
    }

    clearCodebase(codebasePath: string): void {
        this.sourceCheckpointObservations.delete(codebasePath);
        this.sourceCheckpointStatuses.delete(codebasePath);
        this.fullIndexSourceHandoffBarriers.delete(codebasePath);
    }

    clearAll(): void {
        this.sourceCheckpointObservations.clear();
        this.sourceCheckpointStatuses.clear();
        this.fullIndexSourceHandoffBarriers.clear();
    }

    // ------------------------------------------------------------------
    // Full-index source handoff lifecycle
    // ------------------------------------------------------------------

    /**
     * Open a full-index source handoff barrier for a codebase. The barrier
     * keeps prepared reads failing closed (checkpoint_unverified) until the
     * handoff completes or is rejected/superseded.
     */
    beginHandoff(
        codebasePath: string,
        input: FullIndexSourceHandoffBarrierInput,
        mutationLease?: RootMutationLease,
    ): void {
        this.deps.assertMutationCurrent(mutationLease);
        if (input.candidatePolicyHash.length === 0 || input.markerRunId.length === 0) {
            throw new TypeError('Full-index source handoff requires a candidate policy hash and marker run ID.');
        }
        this.fullIndexSourceHandoffBarriers.set(codebasePath, Object.freeze({ ...input }));
    }

    /**
     * Reject an open full-index source handoff barrier. Returns true when the
     * barrier matched the input and was removed.
     */
    rejectHandoff(
        codebasePath: string,
        input: FullIndexSourceHandoffBarrierInput,
        mutationLease?: RootMutationLease,
    ): boolean {
        this.deps.assertMutationCurrent(mutationLease);
        const barrier = this.fullIndexSourceHandoffBarriers.get(codebasePath);
        if (
            barrier?.candidatePolicyHash !== input.candidatePolicyHash
            || barrier.markerRunId !== input.markerRunId
        ) {
            return false;
        }
        this.fullIndexSourceHandoffBarriers.delete(codebasePath);
        return true;
    }

    /**
     * Supersede (remove) a handoff barrier after a sync produced the proven
     * completed generation the barrier was waiting for.
     */
    supersedeHandoffAfterSync(
        codebasePath: string,
        provenGeneration: ProvenVectorGenerationReceipt | undefined,
    ): boolean {
        const barrier = this.fullIndexSourceHandoffBarriers.get(codebasePath);
        if (
            !barrier
            || provenGeneration?.marker.runId !== barrier.markerRunId
            || provenGeneration.marker.indexStatus !== 'completed'
            || provenGeneration.marker.indexPolicyHash !== barrier.candidatePolicyHash
            || provenGeneration.policy.canonicalRoot !== codebasePath
            || provenGeneration.policy.policyHash !== barrier.candidatePolicyHash
        ) {
            return false;
        }
        this.fullIndexSourceHandoffBarriers.delete(codebasePath);
        return true;
    }

    /**
     * Binds an already-proven completed generation/checkpoint to the watcher
     * observation captured for the same candidate. This deliberately does not
     * use the ordinary snapshot-status-gated checkpoint validator: the full
     * index lifecycle is still marked indexing until this handoff succeeds or
     * fails closed.
     */
    async completeHandoff(
        codebasePath: string,
        input: FullIndexSourceHandoffInput,
        mutationLease?: RootMutationLease,
    ): Promise<boolean> {
        this.deps.assertMutationCurrent(mutationLease);
        const barrier = this.fullIndexSourceHandoffBarriers.get(codebasePath);
        if (
            barrier?.candidatePolicyHash !== input.candidatePolicyHash
            || barrier.markerRunId !== input.provenGeneration.marker.runId
            || input.capture.canonicalRoot !== codebasePath
            || input.capture.candidatePolicyHash !== input.candidatePolicyHash
            || input.checkpointObservation.length === 0
            || input.provenGeneration.collectionName.length === 0
            || input.provenGeneration.policy.canonicalRoot !== codebasePath
            || input.provenGeneration.marker.indexStatus !== 'completed'
            || input.provenGeneration.marker.indexPolicyHash !== input.candidatePolicyHash
        ) {
            return false;
        }

        const matchesProvenGeneration = (
            current: ProvenVectorGenerationReceipt,
        ): boolean => current.collectionName === input.provenGeneration.collectionName
            && current.marker.runId === input.provenGeneration.marker.runId
            && current.marker.indexStatus === 'completed'
            && current.marker.indexedFiles === input.provenGeneration.marker.indexedFiles
            && current.marker.totalChunks === input.provenGeneration.marker.totalChunks
            && current.marker.indexPolicyHash === input.candidatePolicyHash
            && current.policyDocumentDigest === input.provenGeneration.policyDocumentDigest
            && current.policy.canonicalRoot === input.provenGeneration.policy.canonicalRoot
            && current.policy.policyHash === input.provenGeneration.policy.policyHash
            && current.policy.controlSignature === input.provenGeneration.policy.controlSignature
            && current.exactPayloadCount === input.provenGeneration.exactPayloadCount
            && current.observations.profileFileToken === input.provenGeneration.observations.profileFileToken
            && current.observations.policyFileToken === input.provenGeneration.observations.policyFileToken;

        if (!this.deps.hasCurrentWatcherCapture(codebasePath, input.capture)) return false;

        try {
            const currentGeneration = await this.deps.proveVectorGeneration(codebasePath);
            if (!currentGeneration || !matchesProvenGeneration(currentGeneration)) {
                return false;
            }

            const currentCheckpoint = await this.deps.inspectSourceFreshnessCheckpoint(
                codebasePath,
                input.provenGeneration.collectionName,
                input.provenGeneration,
            );
            if (
                currentCheckpoint.status !== 'valid'
                || currentCheckpoint.observationToken !== input.checkpointObservation
                || (
                    currentCheckpoint.generationReceipt !== undefined
                    && !matchesProvenGeneration(currentCheckpoint.generationReceipt)
                )
            ) {
                return false;
            }

            const registeredObservation = this.deps
                .getRegisteredSourceFreshnessCheckpointObservation(codebasePath);
            if (registeredObservation !== input.checkpointObservation) return false;
        } catch {
            return false;
        }

        this.deps.assertMutationCurrent(mutationLease);
        if (!this.deps.hasCurrentWatcherCapture(codebasePath, input.capture)) return false;
        this.sourceCheckpointStatuses.set(codebasePath, 'valid');
        this.sourceCheckpointObservations.set(codebasePath, input.checkpointObservation);
        this.deps.coverWatcherObservation(codebasePath, input.capture.observedEventEpoch);
        this.fullIndexSourceHandoffBarriers.delete(codebasePath);
        return this.deps.isPreparedReadAvailable(codebasePath);
    }
}
