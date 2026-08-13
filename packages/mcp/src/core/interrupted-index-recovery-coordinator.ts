import {
    Context,
    type IndexCompletionMarkerDocument,
} from "@zokizuan/satori-core";
import type { IndexFingerprint, IndexOperationPhase } from "../config.js";
import type { CompletionProofValidationResult } from "./completion-proof.js";
import { decideInterruptedIndexingRecovery } from "./indexing-recovery.js";
import { MutationLeaseCoordinator, type RootMutationLease } from "./mutation-lease.js";
import { SnapshotManager } from "./snapshot.js";

const STALE_INDEXING_RECOVERY_GRACE_MS = 2 * 60_000;

type CompletionMarkerCapabilities = {
    getIndexCompletionMarker?: (
        codebasePath: string,
    ) => Promise<IndexCompletionMarkerDocument | null>;
    getActiveIndexedCollectionName?: (codebasePath: string) => Promise<string | null>;
    getCompletionProofCollectionName?: (codebasePath: string) => Promise<string | null>;
};

type RecoveredIndex = {
    stats: {
        indexedFiles: number;
        totalChunks: number;
        status: "completed" | "limit_reached";
    };
    indexFingerprint: IndexFingerprint;
};

function formatRecoveryError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Owns the interrupted-index lifecycle: stale-state eligibility, lease fencing,
 * durable operation phases, completion-marker proof, and snapshot publication.
 */
export class InterruptedIndexRecoveryCoordinator {
    private readonly context: Context;
    private readonly snapshotManager: SnapshotManager;
    private readonly runtimeFingerprint: IndexFingerprint;
    private readonly now: () => number;
    private readonly mutationLeaseCoordinator: MutationLeaseCoordinator | null;

    public constructor(options: {
        context: Context;
        snapshotManager: SnapshotManager;
        runtimeFingerprint: IndexFingerprint;
        now: () => number;
        mutationLeaseCoordinator: MutationLeaseCoordinator | null;
    }) {
        this.context = options.context;
        this.snapshotManager = options.snapshotManager;
        this.runtimeFingerprint = options.runtimeFingerprint;
        this.now = options.now;
        this.mutationLeaseCoordinator = options.mutationLeaseCoordinator;
    }

    private isIndexingStateStale(
        codebasePath: string,
        graceMs: number = STALE_INDEXING_RECOVERY_GRACE_MS,
    ): boolean {
        const info = this.snapshotManager.getCodebaseInfo(codebasePath);
        if (!info || info.status !== "indexing") {
            return false;
        }

        const lastUpdatedMs = typeof info.lastUpdated === "string"
            ? Date.parse(info.lastUpdated)
            : Number.NaN;
        if (!Number.isFinite(lastUpdatedMs)) {
            return true;
        }

        return (this.now() - lastUpdatedMs) > graceMs;
    }

    private async getCompletionMarker(
        codebasePath: string,
    ): Promise<IndexCompletionMarkerDocument | null> {
        const context = this.context as unknown as CompletionMarkerCapabilities;
        return typeof context.getIndexCompletionMarker === "function"
            ? context.getIndexCompletionMarker.call(this.context, codebasePath)
            : null;
    }

    private async getActiveIndexedCollectionName(
        codebasePath: string,
    ): Promise<string | undefined> {
        const context = this.context as unknown as CompletionMarkerCapabilities;
        const resolver = context.getCompletionProofCollectionName
            ?? context.getActiveIndexedCollectionName;
        if (typeof resolver !== "function") {
            return undefined;
        }
        const collectionName = await resolver.call(this.context, codebasePath);
        return typeof collectionName === "string" && collectionName.trim().length > 0
            ? collectionName.trim()
            : undefined;
    }

    private persistRecoverySnapshot(
        codebasePath: string,
        recoveryLease: RootMutationLease | undefined,
        mutateSnapshot: () => void,
    ): void {
        if (!recoveryLease) {
            throw new Error(`Interrupted-index recovery for '${codebasePath}' requires a mutation lease.`);
        }
        this.mutationLeaseCoordinator!.assertCurrent(recoveryLease);
        const committed = this.snapshotManager.commitCodebaseLifecycleMutation(
            mutateSnapshot,
            () => this.mutationLeaseCoordinator!.assertCurrent(recoveryLease),
        );
        if (!committed) {
            throw new Error(`Failed to persist interrupted-index recovery for '${codebasePath}'.`);
        }
    }

    private persistRecoveryPhase(
        codebasePath: string,
        phase: IndexOperationPhase,
        recoveryLease: RootMutationLease | undefined,
        releaseRecoveryLease: boolean,
        mutateSnapshot?: () => void,
    ): void {
        if (!releaseRecoveryLease || !recoveryLease) {
            if (mutateSnapshot) {
                this.persistRecoverySnapshot(codebasePath, recoveryLease, mutateSnapshot);
            }
            return;
        }

        this.mutationLeaseCoordinator!.assertCurrent(recoveryLease);
        if (typeof this.snapshotManager.commitOperationPhase === "function") {
            this.snapshotManager.commitOperationPhase(
                recoveryLease,
                phase,
                mutateSnapshot,
                () => this.mutationLeaseCoordinator!.assertCurrent(recoveryLease),
            );
            return;
        }

        this.snapshotManager.transitionOperation(recoveryLease, phase);
        mutateSnapshot?.();
        if (this.snapshotManager.saveCodebaseSnapshot(
            false,
            () => this.mutationLeaseCoordinator!.assertCurrent(recoveryLease),
        ) === false) {
            throw new Error(`Failed to persist stale-index recovery phase '${phase}' for '${codebasePath}'.`);
        }
    }

    private getIndexingCodebases(): string[] {
        return typeof this.snapshotManager.getIndexingCodebases === "function"
            ? this.snapshotManager.getIndexingCodebases()
            : [];
    }

    public async recoverStaleIndexingStateIfNeeded(
        codebasePath: string,
        existingLease?: RootMutationLease,
        options?: { skipGrace?: boolean },
    ): Promise<RootMutationLease | undefined> {
        const indexingCodebases = this.getIndexingCodebases();
        if (!Array.isArray(indexingCodebases) || !indexingCodebases.includes(codebasePath)) {
            return undefined;
        }
        if (!this.mutationLeaseCoordinator) {
            return undefined;
        }

        const skipGrace = Boolean(existingLease) || options?.skipGrace === true;
        if (!skipGrace && !this.isIndexingStateStale(codebasePath)) {
            return undefined;
        }
        const context = this.context as unknown as CompletionMarkerCapabilities;
        if (typeof context.getIndexCompletionMarker !== "function") {
            return undefined;
        }

        let recoveryLease = existingLease;
        let releaseRecoveryLease = false;
        let operationTerminal = false;
        const persistPhase = (
            phase: IndexOperationPhase,
            mutateSnapshot?: () => void,
        ): void => {
            this.persistRecoveryPhase(
                codebasePath,
                phase,
                recoveryLease,
                releaseRecoveryLease,
                mutateSnapshot,
            );
            operationTerminal = phase === "completed"
                || phase === "failed"
                || phase === "blocked";
        };

        if (recoveryLease) {
            this.mutationLeaseCoordinator.assertCurrent(recoveryLease);
        } else {
            const leaseResult = this.mutationLeaseCoordinator.acquire(codebasePath, "repair");
            if (!leaseResult.acquired) {
                return leaseResult.activeLease;
            }
            recoveryLease = leaseResult.lease;
            releaseRecoveryLease = true;
        }

        try {
            if (releaseRecoveryLease && recoveryLease && typeof this.snapshotManager.startOperation === "function") {
                if (typeof this.snapshotManager.commitOperationPhase === "function") {
                    this.snapshotManager.commitOperationPhase(
                        recoveryLease,
                        "accepted",
                        undefined,
                        () => this.mutationLeaseCoordinator!.assertCurrent(recoveryLease!),
                    );
                } else {
                    this.snapshotManager.startOperation(recoveryLease);
                    if (this.snapshotManager.saveCodebaseSnapshot(
                        false,
                        () => this.mutationLeaseCoordinator!.assertCurrent(recoveryLease!),
                    ) === false) {
                        throw new Error(`Failed to persist accepted stale-index recovery receipt for '${codebasePath}'.`);
                    }
                }
            }

            if (typeof this.snapshotManager.refreshFromDiskIfChanged === "function") {
                this.snapshotManager.refreshFromDiskIfChanged();
            }
            // Exclusive ownership (caller lease or self-acquired) supersedes grace.
            if (!this.getIndexingCodebases().includes(codebasePath)) {
                persistPhase("completed");
                return undefined;
            }
            if (!recoveryLease && !this.isIndexingStateStale(codebasePath)) {
                return undefined;
            }

            let marker: IndexCompletionMarkerDocument | null = null;
            try {
                persistPhase("proving");
                marker = await this.getCompletionMarker(codebasePath);
            } catch (error: unknown) {
                console.warn(
                    `[INDEX-RECOVERY] Stale indexing recovery probe failed for '${codebasePath}': ${formatRecoveryError(error)}`,
                );
                persistPhase("failed");
                return undefined;
            }

            this.mutationLeaseCoordinator.assertCurrent(recoveryLease);
            const decision = decideInterruptedIndexingRecovery(marker, this.runtimeFingerprint);
            if (decision.action === "promote_indexed") {
                const collectionName = await this.getActiveIndexedCollectionName(codebasePath);
                this.mutationLeaseCoordinator.assertCurrent(recoveryLease);
                if (releaseRecoveryLease) {
                    persistPhase("publishing");
                }
                const publish = () => {
                    this.snapshotManager.setCodebaseIndexed(
                        codebasePath,
                        decision.stats,
                        decision.indexFingerprint,
                        "verified",
                        collectionName,
                    );
                };
                if (releaseRecoveryLease) {
                    persistPhase("completed", publish);
                } else {
                    this.persistRecoverySnapshot(codebasePath, recoveryLease, publish);
                }
                const recoveryMode = decision.reason === "valid_marker_runtime_mismatch"
                    ? " using completion marker proof from a different runtime fingerprint"
                    : " using completion marker proof";
                console.log(
                    `[INDEX-RECOVERY] Promoted stale indexing state to indexed for '${codebasePath}'${recoveryMode}.`,
                );
                return undefined;
            }

            const lastProgress = this.snapshotManager.getIndexingProgress(codebasePath);
            const fail = () => {
                this.snapshotManager.setCodebaseIndexFailed(
                    codebasePath,
                    decision.message,
                    lastProgress,
                );
            };
            if (releaseRecoveryLease) {
                persistPhase("failed", fail);
            } else {
                this.persistRecoverySnapshot(codebasePath, recoveryLease, fail);
            }
            console.log(
                `[INDEX-RECOVERY] Marked stale indexing state as failed for '${codebasePath}' (${decision.reason}).`,
            );
        } catch (error) {
            if (
                releaseRecoveryLease
                && recoveryLease
                && !operationTerminal
                && this.mutationLeaseCoordinator.isCurrent(recoveryLease)
            ) {
                try {
                    persistPhase("failed");
                } catch {
                    // Preserve the last durable receipt owned by this recovery operation.
                }
            }
            throw error;
        } finally {
            if (releaseRecoveryLease && recoveryLease) {
                this.mutationLeaseCoordinator.release(recoveryLease);
            }
        }
        return undefined;
    }

    public async recoverInterruptedIndexingAtStartup(): Promise<void> {
        const indexingCodebases = this.getIndexingCodebases();
        if (indexingCodebases.length === 0) {
            console.log("[STARTUP] No interrupted indexing states required recovery");
            return;
        }

        let attempted = 0;
        let skippedLive = 0;
        for (const codebasePath of indexingCodebases) {
            const activeLease = await this.recoverStaleIndexingStateIfNeeded(
                codebasePath,
                undefined,
                { skipGrace: true },
            );
            if (activeLease) {
                skippedLive += 1;
                console.log(
                    `[STARTUP] Skipping interrupted indexing recovery for '${codebasePath}': `
                    + `live mutation lease held (action=${activeLease.action}, `
                    + `pid=${activeLease.pid}, generation=${activeLease.generation})`,
                );
                continue;
            }
            attempted += 1;
        }
        console.log(`[STARTUP] Recovery summary: attempted=${attempted}, skippedLiveWriter=${skippedLive}`);
    }

    public extractIndexedRecoveryFromCompletionProof(
        completionProof: CompletionProofValidationResult,
    ): RecoveredIndex | null {
        if (completionProof.outcome !== "valid" && completionProof.outcome !== "fingerprint_mismatch") {
            return null;
        }
        if (!completionProof.marker) {
            return null;
        }

        const decision = decideInterruptedIndexingRecovery(
            completionProof.marker as unknown as IndexCompletionMarkerDocument,
            this.runtimeFingerprint,
        );
        return decision.action === "promote_indexed"
            ? { stats: decision.stats, indexFingerprint: decision.indexFingerprint }
            : null;
    }

    public async recoverIndexedSnapshotFromCompletionProof(
        codebasePath: string,
        completionProof: CompletionProofValidationResult,
        lease: RootMutationLease,
    ): Promise<boolean> {
        const coordinator = this.mutationLeaseCoordinator;
        if (!coordinator) {
            return false;
        }
        if (!coordinator.isLeaseForRoot(lease, codebasePath)) {
            throw new Error(`Completion-proof recovery lease does not own '${codebasePath}'.`);
        }

        const assertCurrent = () => coordinator.assertCurrent(lease);
        assertCurrent();
        const recovered = this.extractIndexedRecoveryFromCompletionProof(completionProof);
        if (!recovered) {
            return false;
        }

        assertCurrent();
        const collectionName = await this.getActiveIndexedCollectionName(codebasePath);
        assertCurrent();
        if (!collectionName) {
            return false;
        }

        const committed = this.snapshotManager.commitCodebaseLifecycleMutation(
            () => this.snapshotManager.setCodebaseIndexed(
                codebasePath,
                recovered.stats,
                recovered.indexFingerprint,
                "verified",
                collectionName,
            ),
            assertCurrent,
        );
        if (!committed) {
            throw new Error(`Failed to persist completion-proof recovery for '${codebasePath}'.`);
        }
        return true;
    }
}
