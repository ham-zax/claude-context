import type { RootMutationLease, MutationLeaseCoordinator } from './mutation-lease.js';
import type {
    CustomIndexPolicyUpdate,
    IndexMutationPort,
    PreparedIndexCollectionReceipt,
    SourceFreshnessPort,
} from '@zokizuan/satori-core';
import type { SnapshotManager } from './snapshot.js';
import type { SyncManager } from './sync.js';
import type { IndexFingerprint, IndexOperationPhase } from '../config.js';

export interface FullIndexOperationInput {
    readonly codebasePath: string;
    readonly forceReindex: boolean;
    readonly writeCollectionName?: string;
    readonly mutationLease?: RootMutationLease;
    readonly previousIndexedInfo?: Record<string, unknown>;
    readonly policyUpdate?: CustomIndexPolicyUpdate;
    readonly preparedCollectionReceipt?: PreparedIndexCollectionReceipt;
}

export interface FullIndexOperationHost {
    readonly mutationLeaseCoordinator?: MutationLeaseCoordinator | null;
    readonly indexMutationPort: IndexMutationPort;
    readonly sourceFreshnessPort?: SourceFreshnessPort;
    readonly snapshotManager?: SnapshotManager;
    readonly syncManager?: SyncManager;
    readonly runtimeFingerprint?: IndexFingerprint;
    readonly startBackgroundIndexing?: (
        codebasePath: string,
        forceReindex: boolean,
        writeCollectionName?: string,
        mutationLease?: RootMutationLease,
        previousIndexedInfo?: Record<string, unknown>,
        policyUpdate?: CustomIndexPolicyUpdate,
        preparedCollectionReceipt?: PreparedIndexCollectionReceipt,
    ) => Promise<void> | void;
    readonly saveSnapshotIfSupported?: () => void;
    readonly loadIndexProfileForCodebase?: (codebasePath: string) => { profile: string; configPath?: string };
    readonly getContextActiveIgnorePatterns?: (codebasePath: string) => string[];
    readonly getContextIndexedExtensions?: (codebasePath: string) => string[];
    readonly canonicalizeCodebasePath?: (codebasePath: string) => string;
    readonly pruneIndexedCollectionFamily?: (
        codebasePath: string,
        keepCollectionName: string,
        assertMutationCurrent?: () => void,
    ) => Promise<string[]>;
    readonly pruneUnprovenStagedCollectionFamily?: (
        codebasePath: string,
        assertMutationCurrent?: () => void,
        discardUnprovenPayload?: boolean,
    ) => Promise<string[]>;
    readonly getContextTrackedRelativePaths?: (codebasePath: string) => string[];
    readonly setIndexingStats?: (stats: { indexedFiles: number; totalChunks: number } | null) => void;
    readonly rebuildCallGraphForIndex?: (
        codebasePath: string,
        assertMutationCurrent?: () => void,
        effectiveIgnorePatterns?: string[],
    ) => Promise<void>;
    readonly getSnapshotIndexingProgress?: (codebasePath: string) => number | undefined;
    readonly clearIndexCompletionMarker?: (codebasePath: string, assertMutationCurrent?: () => void) => Promise<void>;
}

function formatUnknownError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    return String(error);
}

export class FullIndexOperation {
    constructor(private readonly host: FullIndexOperationHost) {}

    public launch(input: FullIndexOperationInput): void {
        const startBackgroundIndexing = this.host.startBackgroundIndexing
            ?? ((
                codebasePath: string,
                forceReindex: boolean,
                writeCollectionName?: string,
                mutationLease?: RootMutationLease,
                previousIndexedInfo?: Record<string, unknown>,
                policyUpdate?: CustomIndexPolicyUpdate,
                preparedCollectionReceipt?: PreparedIndexCollectionReceipt,
            ) => this.run({
                codebasePath,
                forceReindex,
                writeCollectionName,
                mutationLease,
                previousIndexedInfo,
                policyUpdate,
                preparedCollectionReceipt,
            }));

        const backgroundIndexing = startBackgroundIndexing(
            input.codebasePath,
            input.forceReindex,
            input.writeCollectionName,
            input.mutationLease,
            input.previousIndexedInfo,
            input.policyUpdate,
            input.preparedCollectionReceipt,
        );

        const launchedLease = input.mutationLease;
        const absolutePath = input.codebasePath;

        void Promise.resolve(backgroundIndexing)
            .catch((backgroundError: unknown) => {
                console.error(`[BACKGROUND-INDEX] Detached worker rejected for '${absolutePath}':`, backgroundError);
                if (
                    launchedLease
                    && this.host.mutationLeaseCoordinator?.isCurrent(launchedLease)
                ) {
                    try {
                        this.persistDetachedFailure(absolutePath, launchedLease, backgroundError);
                    } catch (receiptError) {
                        console.error(`[BACKGROUND-INDEX] Failed to persist detached worker failure for '${absolutePath}':`, receiptError);
                    }
                }
            })
            .finally(() => {
                if (launchedLease) {
                    this.host.mutationLeaseCoordinator?.release(launchedLease);
                }
            });
    }

    private persistDetachedFailure(
        absolutePath: string,
        lease: RootMutationLease,
        backgroundError: unknown,
    ): void {
        const snapshotManager = this.host.snapshotManager;
        if (!snapshotManager) {
            return;
        }

        const mutateSnapshot = () => {
            snapshotManager.setCodebaseIndexFailed(
                absolutePath,
                formatUnknownError(backgroundError),
                this.host.getSnapshotIndexingProgress?.(absolutePath),
            );
        };

        if (typeof snapshotManager.commitOperationPhase === "function") {
            snapshotManager.commitOperationPhase(
                lease,
                "failed",
                mutateSnapshot,
                () => this.host.mutationLeaseCoordinator?.assertCurrent(lease),
            );
        } else if (typeof snapshotManager.transitionOperation === "function") {
            snapshotManager.transitionOperation(lease, "failed");
            mutateSnapshot();
            if (snapshotManager.saveCodebaseSnapshot() === false) {
                console.error(`[BACKGROUND-INDEX] Failed to persist failed receipt for '${absolutePath}'.`);
            }
        } else {
            mutateSnapshot();
            this.host.saveSnapshotIfSupported?.();
        }
    }

    public async run(input: FullIndexOperationInput): Promise<void> {
        // Full background run implementation will be migrated in Task 2.
    }
}
