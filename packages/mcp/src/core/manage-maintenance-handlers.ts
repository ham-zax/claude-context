import * as fs from "fs";
import {
    COLLECTION_LIMIT_MESSAGE,
    RemoteCollectionDeletePendingError,
    computeSymbolQualitySummaryFromSidecarRead,
    formatSymbolQualityMarker,
    readSymbolRegistrySidecar,
    resolveLanguageCapabilityEvidence,
    unknownSymbolQualitySummary,
    type Context,
    type PublicationLease,
    type PublicationRef,
    type LanguageCapabilityEvidenceSummary,
    type SymbolQualitySummary,
} from "@zokizuan/satori-core";
import {
    SyncOperationError,
    type PreparedReadObservationUnavailableReason,
    type SyncManager,
} from "./sync.js";
import type {
    CompletionProbeDebugHint,
    TrackedRootReadiness,
    TrackedRootReadinessState,
} from "./tracked-root-readiness.js";
import { WARNING_CODES, type WarningCode } from "./warnings.js";
import {
    classifyVectorBackendError,
    type VectorBackendDiagnostic,
} from "./backend-diagnostics.js";
import { requireAbsoluteFilesystemPath } from "../utils.js";
import {
    MANUAL_SYNC_FRESHNESS_THRESHOLD_MS,
} from "../config.js";
import type {
    ManageIndexAction,
    ManageIndexReason,
    ManageIndexStatus,
    ManageIndexStatusDetail,
} from "./manage-types.js";
import {
    formatRuntimeOwnersStatusLine,
    type RuntimeOwnerMutationAction,
    type RuntimeOwnersSummary,
} from "./runtime-owner.js";
import {
    RootMutationInProgressError,
    RootMutationRuntime,
    formatRootMutationBlockedMessage,
    type MutationOperationPhase,
    type RootMutationActivity,
    type RootMutationOperation,
} from "@zokizuan/satori-core/integration";

type ToolArgs = Record<string, unknown>;

type ToolTextResponse = {
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
};

type ManageMaintenanceHandlersHost = {
    context: Pick<Context, "clearIndex" | "getCurrentPublication" | "listCurrentPublications" | "inspectSourceFreshnessCheckpoint">;
    mutationRuntime: RootMutationRuntime;
    syncManager: Pick<SyncManager, "ensureFreshness"> & Partial<Pick<
        SyncManager,
        "getPreparedReadObservation" | "getPreparedReadDiagnostics"
    >>;
    trackedRootReadiness: Pick<
        TrackedRootReadiness,
        "buildMissingLocalCollectionMessage"
    >;
    prepareStatusTrackedRootRead(absolutePath: string): Promise<TrackedRootReadinessState>;
    acquirePublicationLease(codebasePath: string): PublicationLease | undefined;
    isPublicationAdmitted(publication: PublicationRef): Promise<boolean>;
    getPublicationNavigationAddress(publication: PublicationRef): {
        publicationId: string;
        navigationRoot: string;
    } | null;
    buildRuntimeOwnerConflictResponseIfBlocked(
        action: Extract<RuntimeOwnerMutationAction, "clear" | "sync">,
        codebasePath: string,
    ): Promise<ToolTextResponse | null>;
    manageResponse(
        action: ManageIndexAction | string,
        path: string,
        status: ManageIndexStatus | string,
        message: string,
        options?: Record<string, unknown>,
    ): ToolTextResponse;
    buildCreateHint(codebasePath: string): Record<string, unknown>;
    buildManageActionBlockedMessage(
        codebasePath: string,
        action: Extract<RuntimeOwnerMutationAction, "clear" | "sync">,
    ): string;
    buildStatusHint(codebasePath: string): Record<string, unknown>;
    getManageRetryAfterMs(): number;
    buildIndexingMetadata(codebasePath: string): Record<string, unknown> | undefined;
    clearIndexingStats(): void;
    unwatchCodebase(codebasePath: string): Promise<void>;
    buildReindexInstruction(codebasePath: string, detail?: string): string;
    buildCompatibilityStatusLines(codebasePath: string): string;
    buildManageRequiresReindexHints(codebasePath: string): Record<string, unknown>;
    buildSyncHint(codebasePath: string): Record<string, unknown>;
    buildStaleLocalHint(codebasePath: string, reason: string): Record<string, unknown>;
    buildStaleLocalMessage(codebasePath: string, requestedPath: string, reason: string): string;
    buildReindexHint(codebasePath: string): Record<string, unknown>;
    touchWatchedCodebase(codebasePath: string): Promise<void>;
    manageVectorBackendResponse(
        action: string,
        path: string,
        diagnostic: VectorBackendDiagnostic,
        humanText?: string,
        operation?: RootMutationOperation,
    ): ToolTextResponse;
    /** Optional live MCP runtime owner summary for status diagnostics. */
    getLiveOwnersSummary?(): Promise<RuntimeOwnersSummary | null> | RuntimeOwnersSummary | null;
};

function collectErrorFragments(
    value: unknown,
    output: string[],
    visited: Set<unknown>,
    depth = 0,
): void {
    if (value === null || value === undefined || depth > 4 || output.length >= 8) {
        return;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
            output.push(trimmed);
        }
        return;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        output.push(String(value));
        return;
    }
    if (value instanceof Error) {
        collectErrorFragments(value.message, output, visited, depth + 1);
        collectErrorFragments((value as Error & { cause?: unknown }).cause, output, visited, depth + 1);
        return;
    }
    if (typeof value !== "object") {
        return;
    }
    if (visited.has(value)) {
        return;
    }
    visited.add(value);
    if (Array.isArray(value)) {
        for (const item of value) {
            collectErrorFragments(item, output, visited, depth + 1);
            if (output.length >= 8) {
                return;
            }
        }
        return;
    }
    const record = value as Record<string, unknown>;
    for (const key of ["message", "reason", "detail", "details", "error", "msg", "code", "error_code"]) {
        if (key in record) {
            collectErrorFragments(record[key], output, visited, depth + 1);
            if (output.length >= 8) {
                return;
            }
        }
    }
    for (const nestedValue of Object.values(record)) {
        collectErrorFragments(nestedValue, output, visited, depth + 1);
        if (output.length >= 8) {
            return;
        }
    }
}

function formatUnknownError(error: unknown): string {
    if (error === COLLECTION_LIMIT_MESSAGE) {
        return COLLECTION_LIMIT_MESSAGE;
    }
    const fragments: string[] = [];
    collectErrorFragments(error, fragments, new Set());
    const deduped = Array.from(new Set(fragments.map((fragment) => fragment.trim()).filter(Boolean)));
    if (deduped.length > 0) {
        return deduped.slice(0, 3).join(" | ");
    }
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function formatActiveMutationStatusLine(activity: RootMutationActivity): string {
    return `Active mutation: ${activity.action} operation=${activity.id} generation=${activity.generation} pid=${activity.pid} acquiredAt=${activity.acceptedAt}`;
}

const SOURCE_STATE_UNVERIFIED_REASONS = new Set<PreparedReadObservationUnavailableReason>([
    "watcher_manager_not_started",
    "root_not_registered",
    "watcher_starting",
    "root_watcher_not_active",
    "watcher_failed",
    "watcher_event_pending",
    "watcher_observation_gap",
    "source_observation_failed",
    "checkpoint_unverified",
    "checkpoint_observation_mismatch",
]);

export class ManageMaintenanceHandlers {
    constructor(private readonly host: ManageMaintenanceHandlersHost) {}

    public async handleClearIndex(args: ToolArgs): Promise<ToolTextResponse> {
        const codebasePath = typeof args.path === "string" ? args.path : "";
        const absolutePathResult = requireAbsoluteFilesystemPath(codebasePath, "path");
        if (!absolutePathResult.ok) {
            return this.host.manageResponse("clear", codebasePath, "error", absolutePathResult.message);
        }
        const absolutePath = absolutePathResult.absolutePath;
        if (fs.existsSync(absolutePath) && !fs.statSync(absolutePath).isDirectory()) {
            return this.host.manageResponse("clear", absolutePath, "error", `Error: Path '${absolutePath}' is not a directory`);
        }

        const runtimeOwnerConflict = await this.host.buildRuntimeOwnerConflictResponseIfBlocked("clear", absolutePath);
        if (runtimeOwnerConflict) return runtimeOwnerConflict;

        try {
            return await this.host.mutationRuntime.run(absolutePath, "clear", async () => {
                let lastOperation = this.host.mutationRuntime.getCurrentOperation(absolutePath);
                let publicationAuthorityCleared = false;
                const updateOperation = (
                    phase: MutationOperationPhase,
                    update: { progress?: number; error?: string } = {},
                ): RootMutationOperation => {
                    lastOperation = this.host.mutationRuntime.updateCurrentOperation(absolutePath, phase, update);
                    return lastOperation;
                };

                try {
                    console.log(`[CLEAR] Clearing codebase: ${absolutePath}`);
                    updateOperation("writing", { progress: 0 });
                    await this.host.context.clearIndex(absolutePath, (progress) => {
                        if (progress.phase === "Removing index data...") publicationAuthorityCleared = true;
                        const progressValue = Number.isFinite(progress.percentage)
                            ? Math.max(0, Math.min(99, progress.percentage))
                            : undefined;
                        if (progressValue !== undefined) updateOperation("writing", { progress: progressValue });
                    });
                    publicationAuthorityCleared = true;
                    updateOperation("completed", { progress: 100 });
                    this.host.clearIndexingStats();
                    await this.host.unwatchCodebase(absolutePath);

                    let resultText = `Successfully cleared codebase '${absolutePath}'`;
                    const remainingIndexed = this.host.context.listCurrentPublications().length;
                    if (remainingIndexed > 0) {
                        resultText += `\n${remainingIndexed} other indexed codebase(s) remain`;
                    }
                    return this.host.manageResponse(
                        "clear",
                        absolutePath,
                        "ok",
                        resultText,
                        lastOperation ? { operation: lastOperation } : undefined,
                    );
                } catch (error: unknown) {
                    const detail = formatUnknownError(error);
                    if (this.host.mutationRuntime.isCurrent(absolutePath)) {
                        try {
                            updateOperation("failed", { error: detail });
                        } catch (operationError) {
                            console.error("Failed to publish terminal clear operation state:", operationError);
                        }
                    }
                    if (error instanceof RemoteCollectionDeletePendingError) {
                        const errorMsg = `Publication authority has already been cleared for ${absolutePath}. Remote vector cleanup is still pending; residual physical cleanup can be retried with manage_index clear. Details: ${detail}`;
                        return this.host.manageResponse("clear", absolutePath, "error", errorMsg, {
                            reason: "remote_delete_pending",
                            hints: {
                                retry: this.host.buildStatusHint(absolutePath),
                                clear: { tool: "manage_index", args: { action: "clear", path: absolutePath } },
                            },
                            ...(lastOperation ? { operation: lastOperation } : {}),
                        });
                    }
                    const errorMsg = publicationAuthorityCleared
                        ? `Publication authority has already been cleared for ${absolutePath}, but post-clear physical/runtime cleanup failed before completion. Residual cleanup can be retried with manage_index clear. Details: ${detail}`
                        : `Failed to clear ${absolutePath} before Publication authority removal completed: ${detail}`;
                    if (detail === COLLECTION_LIMIT_MESSAGE || detail.includes(COLLECTION_LIMIT_MESSAGE)) {
                        return this.host.manageResponse("clear", absolutePath, "error", COLLECTION_LIMIT_MESSAGE, lastOperation ? { operation: lastOperation } : undefined);
                    }
                    return this.host.manageResponse(
                        "clear",
                        absolutePath,
                        "error",
                        errorMsg,
                        lastOperation ? { operation: lastOperation } : undefined,
                    );
                }
            });
        } catch (error) {
            if (error instanceof RootMutationInProgressError) {
                return this.host.manageResponse(
                    "clear",
                    absolutePath,
                    "blocked",
                    formatRootMutationBlockedMessage(error.activeMutation),
                    {
                        reason: "mutation_in_progress",
                        hints: {
                            status: this.host.buildStatusHint(absolutePath),
                            activeMutation: error.activeMutation,
                        },
                    },
                );
            }
            throw error;
        }
    }

    public async handleGetIndexingStatus(args: ToolArgs): Promise<ToolTextResponse> {
        const codebasePath = typeof args.path === "string" ? args.path : "";
        const requestedDetail = args.detail;
        const detail: ManageIndexStatusDetail = requestedDetail === "capabilities"
            || requestedDetail === "diagnostics"
            || requestedDetail === "full"
            ? requestedDetail
            : "summary";
        const includeCapabilities = detail === "capabilities" || detail === "full";
        const includeDiagnostics = detail === "diagnostics" || detail === "full";
        const absolutePathResult = requireAbsoluteFilesystemPath(codebasePath, "path");
        if (!absolutePathResult.ok) {
            return this.host.manageResponse("status", codebasePath, "error", absolutePathResult.message, { detail });
        }
        const requestedPath = absolutePathResult.absolutePath;

        try {
            const absolutePath = requestedPath;

            const latestOperation = this.host.mutationRuntime.getOperation(absolutePath);

            if (!fs.existsSync(absolutePath)) {
                return this.host.manageResponse("status", absolutePath, "error", `Error: Path '${absolutePath}' does not exist. Original input: '${codebasePath}'`, {
                    detail,
                    ...(latestOperation ? { operation: latestOperation } : {}),
                });
            }

            const stat = fs.statSync(absolutePath);
            if (!stat.isDirectory()) {
                return this.host.manageResponse("status", absolutePath, "error", `Error: Path '${absolutePath}' is not a directory`, { detail });
            }

            const liveSyncMutation = this.host.mutationRuntime.getActiveMutation(absolutePath);
            if (liveSyncMutation?.action === "sync") {
                const matchingOperation = this.host.mutationRuntime.getOperation(absolutePath);
                return this.host.manageResponse(
                    "status",
                    liveSyncMutation.canonicalRoot,
                    "not_ready",
                    `Codebase '${liveSyncMutation.canonicalRoot}' is being synchronized. ${formatActiveMutationStatusLine(liveSyncMutation)}`,
                    {
                        detail,
                        reason: "indexing",
                        hints: {
                            status: this.host.buildStatusHint(liveSyncMutation.canonicalRoot),
                            retryAfterMs: this.host.getManageRetryAfterMs(),
                            indexing: this.host.buildIndexingMetadata(liveSyncMutation.canonicalRoot),
                            activeMutation: liveSyncMutation,
                        },
                        ...(matchingOperation ? { operation: matchingOperation } : {}),
                    },
                );
            }

            const trackedRootState = await this.host.prepareStatusTrackedRootRead(absolutePath);
            if (trackedRootState.state === "requires_reindex") {
                const operation = this.host.mutationRuntime.getOperation(trackedRootState.codebasePath);
                const statusMessage = this.host.buildReindexInstruction(trackedRootState.codebasePath, trackedRootState.message);
                const compatibilityStatus = includeDiagnostics
                    ? this.host.buildCompatibilityStatusLines(trackedRootState.codebasePath)
                    : "";
                const activeMutation = this.host.mutationRuntime.getActiveMutation(trackedRootState.codebasePath);
                const activeMutationLine = activeMutation ? `\n${formatActiveMutationStatusLine(activeMutation)}` : "";
                const pathInfo = codebasePath !== trackedRootState.codebasePath
                    ? `\nNote: Input path '${codebasePath}' was resolved to absolute path '${trackedRootState.codebasePath}'`
                    : "";
                return this.host.manageResponse(
                    "status",
                    trackedRootState.codebasePath,
                    "requires_reindex",
                    statusMessage + compatibilityStatus + activeMutationLine + pathInfo,
                    {
                        detail,
                        reason: "requires_reindex",
                        hints: {
                            ...this.host.buildManageRequiresReindexHints(trackedRootState.codebasePath),
                            ...(activeMutation ? { activeMutation } : {}),
                        },
                        ...(operation ? { operation } : {}),
                    },
                );
            }

            const sourceCheckpointEvidence = trackedRootState.state === "ready"
                && trackedRootState.publication.publication.status === "complete"
                ? await this.host.context.inspectSourceFreshnessCheckpoint(trackedRootState.root.path)
                : null;

            let sourceObservationUnavailableReason: PreparedReadObservationUnavailableReason | undefined;
            if (
                trackedRootState.state === "ready"
                && trackedRootState.publication.publication.status === "complete"
                && typeof this.host.syncManager.getPreparedReadObservation === "function"
                && typeof this.host.syncManager.getPreparedReadDiagnostics === "function"
            ) {
                const watcherDiagnostics = this.host.syncManager.getPreparedReadDiagnostics(
                    trackedRootState.root.path,
                );
                const sourceObservation = this.host.syncManager.getPreparedReadObservation(
                    trackedRootState.root.path,
                );
                if (
                    watcherDiagnostics.configured
                    && !sourceObservation.available
                    && SOURCE_STATE_UNVERIFIED_REASONS.has(sourceObservation.reason)
                ) {
                    sourceObservationUnavailableReason = sourceObservation.reason;
                }
            }

            let statusMessage = "";
            let envelopePath = absolutePath;
            let envelopeStatus: ManageIndexStatus = "ok";
            let envelopeReason: ManageIndexReason | undefined;
            let envelopeHints: Record<string, unknown> | undefined;
            let proofDebugHint: CompletionProbeDebugHint | undefined;
            let envelopeMessage: string | undefined;

            if (trackedRootState.state === "not_indexed") {
                envelopeStatus = "not_indexed";
                envelopeReason = "not_indexed";
                envelopeHints = { create: this.host.buildCreateHint(absolutePath) };
                statusMessage = `❌ Codebase '${absolutePath}' is not indexed. Call manage_index with {"action":"create","path":"${absolutePath}"} to index it first.`;
            } else if (trackedRootState.state === "stale_local") {
                envelopePath = trackedRootState.codebasePath;
                envelopeStatus = "requires_reindex";
                envelopeReason = "requires_reindex";
                envelopeHints = {
                    reindex: this.host.buildReindexHint(trackedRootState.codebasePath),
                    staleLocal: this.host.buildStaleLocalHint(trackedRootState.codebasePath, trackedRootState.reason),
                };
                statusMessage = `❌ ${this.host.buildStaleLocalMessage(trackedRootState.codebasePath, absolutePath, trackedRootState.reason)} Run manage_index with {"action":"reindex","path":"${trackedRootState.codebasePath}"} to establish fresh authoritative state.`;
            } else if (trackedRootState.state === "missing_collection") {
                envelopePath = trackedRootState.codebasePath;
                envelopeStatus = "not_indexed";
                envelopeReason = "not_indexed";
                envelopeHints = { create: this.host.buildCreateHint(trackedRootState.codebasePath) };
                statusMessage = `❌ ${this.host.trackedRootReadiness.buildMissingLocalCollectionMessage(
                    trackedRootState.codebasePath,
                    absolutePath,
                    trackedRootState.collectionName,
                )}`;
                proofDebugHint = trackedRootState.proofDebugHint;
            } else if (trackedRootState.state === "indexing") {
                envelopePath = trackedRootState.codebasePath;
                envelopeStatus = "not_ready";
                envelopeReason = "indexing";
                envelopeHints = {
                    status: this.host.buildStatusHint(trackedRootState.codebasePath),
                    retryAfterMs: this.host.getManageRetryAfterMs(),
                    indexing: this.host.buildIndexingMetadata(trackedRootState.codebasePath),
                };
                const activeMutation = this.host.mutationRuntime.getActiveMutation(trackedRootState.codebasePath);
                const operation = activeMutation
                    ? this.host.mutationRuntime.getOperation(trackedRootState.codebasePath)
                    : undefined;
                if (operation?.progress !== undefined) {
                    statusMessage = `🔄 Codebase '${trackedRootState.codebasePath}' is currently being indexed. Progress: ${operation.progress.toFixed(1)}%`;
                    if (operation.progress < 10) {
                        statusMessage += " (Preparing and scanning files...)";
                    } else if (operation.progress < 100) {
                        statusMessage += " (Processing files and generating embeddings...)";
                    }
                    statusMessage += `\n🕐 Last updated: ${new Date(operation.updatedAt).toLocaleString()}`;
                } else {
                    statusMessage = `🔄 Codebase '${trackedRootState.codebasePath}' is currently being indexed.`;
                }
            } else if (trackedRootState.state === "index_failed") {
                envelopePath = trackedRootState.codebasePath;
                envelopeStatus = "error";
                const failedInfo = trackedRootState.info;
                if (typeof failedInfo.errorMessage === "string") {
                    statusMessage = `❌ Codebase '${trackedRootState.codebasePath}' indexing failed.`;
                    statusMessage += `\n🚨 Error: ${failedInfo.errorMessage}`;
                    envelopeMessage = `Codebase '${trackedRootState.codebasePath}' indexing failed: ${failedInfo.errorMessage}`;
                    if (typeof failedInfo.lastAttemptedPercentage === "number" && Number.isFinite(failedInfo.lastAttemptedPercentage)) {
                        statusMessage += `\n📊 Failed at: ${failedInfo.lastAttemptedPercentage.toFixed(1)}% progress`;
                    }
                    if (typeof failedInfo.lastUpdated === "string") {
                        statusMessage += `\n🕐 Failed at: ${new Date(failedInfo.lastUpdated).toLocaleString()}`;
                    }
                    statusMessage += `\n💡 Retry with manage_index action='create'.`;
                } else {
                    statusMessage = `❌ Codebase '${trackedRootState.codebasePath}' indexing failed. You can retry indexing.`;
                }
            } else {
                envelopePath = trackedRootState.root.path;
                proofDebugHint = trackedRootState.proofDebugHint;
                const publication = trackedRootState.publication.publication;
                const isPartial = publication.status === "partial";
                statusMessage = isPartial
                    ? `⚠️ Codebase '${trackedRootState.root.path}' is partially indexed (limit_reached).`
                    : `✅ Codebase '${trackedRootState.root.path}' is fully indexed and ready for search.`;
                statusMessage += `\n📊 Statistics: ${publication.vector.indexedFiles} files, ${publication.vector.totalChunks} chunks`;
                statusMessage += `\n📅 Status: ${isPartial ? "limit_reached" : "completed"}`;
                if (isPartial) {
                    statusMessage += `\nSearch may return incomplete results; file_outline/call_graph are unavailable until a full reindex completes.`;
                }
                statusMessage += `\n🕐 Published: ${new Date(publication.createdAt).toLocaleString()}`;
            }

            if (trackedRootState.state === "ready" && sourceObservationUnavailableReason) {
                envelopePath = trackedRootState.root.path;
                envelopeStatus = "not_ready";
                envelopeReason = "source_state_unverified";
                envelopeHints = {
                    ...(envelopeHints || {}),
                    sync: this.host.buildSyncHint(trackedRootState.root.path),
                    sourceFreshness: {
                        status: "unverified",
                        reason: sourceObservationUnavailableReason,
                        action: "Run manage_index sync to establish current-source authority for the current Publication.",
                    },
                };
                statusMessage = `⏳ Codebase '${trackedRootState.root.path}' has a completed Publication, but its current source state is unverified (${sourceObservationUnavailableReason}). Run manage_index with {"action":"sync","path":"${trackedRootState.root.path}"} before search or navigation.`;
            }

            const warnings: WarningCode[] = [];
            if (proofDebugHint) {
                statusMessage += `\n⚠️ Completion proof check is temporarily unavailable (probe_failed); keeping local status.`;
                warnings.push(WARNING_CODES.IGNORE_POLICY_PROBE_FAILED);
            }
            if (
                trackedRootState.state === "ready"
                && trackedRootState.navigationStatus
                && trackedRootState.navigationStatus !== "valid"
                && trackedRootState.navigationStatus !== "not_bound"
            ) {
                warnings.push(WARNING_CODES.NAVIGATION_REINDEX_REQUIRED);
                envelopeHints = {
                    ...(envelopeHints || {}),
                    reindex: this.host.buildReindexHint(trackedRootState.root.path),
                    navigation: {
                        status: trackedRootState.navigationStatus,
                        action: "Run manage_index reindex to rebuild authoritative local navigation.",
                    },
                };
                statusMessage += `\n⚠️ Local navigation is ${trackedRootState.navigationStatus}; vector search remains proven, but authoritative symbol navigation requires manage_index reindex.`;
            }
            if (sourceCheckpointEvidence && sourceCheckpointEvidence.status !== "valid") {
                envelopeHints = {
                    ...(envelopeHints || {}),
                    reindex: this.host.buildReindexHint(trackedRootState.state === "ready" ? trackedRootState.root.path : envelopePath),
                    sourceFreshness: {
                        status: sourceCheckpointEvidence.status,
                        action: "Run manage_index reindex to restore a source-bound incremental-sync baseline.",
                    },
                };
                statusMessage += `\n⚠️ Source freshness checkpoint is ${sourceCheckpointEvidence.status}; proven vector search remains available, but incremental sync is disabled until reindex.`;
            }

            // F9: observed symbol quality from registry (not parser-cause diagnosis).
            let symbolQuality: SymbolQualitySummary | undefined;
            let languageCapabilities: LanguageCapabilityEvidenceSummary | undefined;
            // Attach observed quality for lifecycle statuses that refer to a real root path.
            if (envelopeStatus === "ok" || envelopeStatus === "not_ready" || envelopeStatus === "not_indexed") {
                const lease = trackedRootState.state === 'ready'
                    ? this.host.acquirePublicationLease(envelopePath)
                    : undefined;
                const leaseMatchesReadiness = Boolean(
                    lease
                    && trackedRootState.state === 'ready'
                    && lease.id === trackedRootState.publication.id
                    && await this.host.isPublicationAdmitted(lease)
                );
                const navigation = leaseMatchesReadiness && lease
                    ? this.host.getPublicationNavigationAddress(lease)
                    : null;
                try {
                    const registryRead = navigation
                        ? await readSymbolRegistrySidecar({
                            normalizedRootPath: envelopePath,
                            publicationId: navigation.publicationId,
                            navigationRoot: navigation.navigationRoot,
                        })
                        : undefined;
                    const evidenceAvailability: SymbolQualitySummary['evidenceAvailability'] =
                        trackedRootState.state === 'ready'
                            && trackedRootState.navigationStatus === 'valid'
                            && registryRead?.status === 'ok'
                            ? 'ready'
                            : !registryRead || registryRead.status === 'missing'
                                ? 'missing'
                                : 'unverified';
                    symbolQuality = registryRead
                        ? {
                            ...computeSymbolQualitySummaryFromSidecarRead(registryRead),
                            evidenceAvailability,
                        }
                        : {
                            ...unknownSymbolQualitySummary('Observed symbol quality unavailable (Publication navigation missing).'),
                            evidenceAvailability,
                        };
                    if (includeCapabilities && registryRead && navigation) {
                        languageCapabilities = await resolveLanguageCapabilityEvidence({
                            normalizedRootPath: envelopePath,
                            searchable: envelopeStatus === "ok" && evidenceAvailability === 'ready',
                            publicationId: navigation.publicationId,
                            navigationRoot: navigation.navigationRoot,
                            registryRead,
                        });
                    }
                    if (envelopeStatus === "ok") {
                        const observedSymbolQuality = symbolQuality;
                        if (observedSymbolQuality) {
                            statusMessage += `\n🧭 ${formatSymbolQualityMarker(observedSymbolQuality)}: ${observedSymbolQuality.message}`;
                        }
                    }
                } finally {
                    lease?.release();
                }
            }

            const pathInfo = codebasePath !== envelopePath
                ? `\nNote: Input path '${codebasePath}' was resolved to absolute path '${envelopePath}'`
                : "";
            const compatibilityStatus = includeDiagnostics
                ? this.host.buildCompatibilityStatusLines(envelopePath)
                : "";
            let runtimeOwnersLine = "";
            if (includeDiagnostics && typeof this.host.getLiveOwnersSummary === "function") {
                try {
                    const ownersSummary = await this.host.getLiveOwnersSummary();
                    if (ownersSummary) {
                        runtimeOwnersLine = `\n👥 ${formatRuntimeOwnersStatusLine(ownersSummary)}`;
                        envelopeHints = {
                            ...(envelopeHints || {}),
                            runtimeOwners: ownersSummary,
                        };
                    }
                } catch {
                    // Diagnostic only; never fail status on owner registry issues.
                }
            }

            const activeMutation = this.host.mutationRuntime.getActiveMutation(envelopePath);
            const activeMutationLine = activeMutation ? `\n${formatActiveMutationStatusLine(activeMutation)}` : "";
            if (activeMutation) {
                envelopeHints = {
                    ...(envelopeHints || {}),
                    activeMutation,
                };
            }

            const operation = this.host.mutationRuntime.getOperation(envelopePath);
            const publication = trackedRootState.state === "ready"
                ? {
                    publicationId: trackedRootState.publication.id,
                    collectionName: trackedRootState.publication.publication.vector.collectionName,
                    policyHash: trackedRootState.publication.publication.policy.policyHash,
                }
                : undefined;

            return this.host.manageResponse(
                "status",
                envelopePath,
                envelopeStatus,
                statusMessage + compatibilityStatus + pathInfo + runtimeOwnersLine + activeMutationLine,
                {
                    detail,
                    reason: envelopeReason,
                    hints: envelopeHints,
                    warnings,
                    ...(symbolQuality ? {
                        symbolQuality: includeCapabilities
                            ? symbolQuality
                            : {
                                status: symbolQuality.status,
                                basis: symbolQuality.basis,
                                message: symbolQuality.message,
                                evidenceAvailability: symbolQuality.evidenceAvailability,
                            },
                    } : {}),
                    ...(languageCapabilities ? { languageCapabilities } : {}),
                    ...(operation ? { operation } : {}),
                    ...(publication ? { publication } : {}),
                    ...(envelopeMessage ? { message: envelopeMessage } : {}),
                },
            );
        } catch (error: unknown) {
            return this.host.manageResponse("status", requestedPath, "error", `Error getting indexing status: ${formatUnknownError(error)}`, { detail });
        }
    }

    public async handleSyncCodebase(args: ToolArgs): Promise<ToolTextResponse> {
        const codebasePath = typeof args.path === "string" ? args.path : "";
        const absolutePathResult = requireAbsoluteFilesystemPath(codebasePath, "path");
        if (!absolutePathResult.ok) {
            return this.host.manageResponse("sync", codebasePath, "error", absolutePathResult.message);
        }
        const requestedPath = absolutePathResult.absolutePath;

        try {
            const absolutePath = requestedPath;

            if (!fs.existsSync(absolutePath)) {
                return this.host.manageResponse("sync", absolutePath, "error", `Error: Path '${absolutePath}' does not exist. Original input: '${codebasePath}'`);
            }

            const stat = fs.statSync(absolutePath);
            if (!stat.isDirectory()) {
                return this.host.manageResponse("sync", absolutePath, "error", `Error: Path '${absolutePath}' is not a directory`);
            }

            const runtimeOwnerConflict = await this.host.buildRuntimeOwnerConflictResponseIfBlocked("sync", absolutePath);
            if (runtimeOwnerConflict) {
                return runtimeOwnerConflict;
            }

            const currentPublication = this.host.context.getCurrentPublication(absolutePath);
            if (!currentPublication) {
                return this.host.manageResponse(
                    "sync",
                    absolutePath,
                    "not_indexed",
                    `Error: Codebase '${absolutePath}' is not indexed. Call manage_index with {"action":"create","path":"${absolutePath}"} first.`,
                    {
                        reason: "not_indexed",
                        hints: {
                            create: this.host.buildCreateHint(absolutePath),
                        },
                    },
                );
            }
            if (currentPublication.publication.status !== "complete") {
                return this.host.manageResponse(
                    "sync",
                    absolutePath,
                    "requires_reindex",
                    this.host.buildReindexInstruction(absolutePath, "The current Publication is partial; incremental sync requires a complete Publication baseline."),
                    {
                        reason: "requires_reindex",
                        hints: {
                            reindex: this.host.buildReindexHint(absolutePath),
                            status: this.host.buildStatusHint(absolutePath),
                        },
                    },
                );
            }

            console.log(`[SYNC] Manually triggering incremental sync for: ${absolutePath}`);
            const decision = await this.host.syncManager.ensureFreshness(
                absolutePath,
                MANUAL_SYNC_FRESHNESS_THRESHOLD_MS,
            );
            const operationOptions = decision.operation ? { operation: decision.operation } : undefined;

            if (decision.mode === "ignore_reload_failed") {
                const fallbackLine = decision.fallbackSyncExecuted
                    ? "\nFallback incremental sync was executed, but ignore-rule reconciliation did not complete deterministically."
                    : "";
                return this.host.manageResponse(
                    "sync",
                    absolutePath,
                    "error",
                    `Error syncing codebase: ignore-rule reconciliation failed (${decision.errorMessage || "unknown_ignore_reload_error"}).${fallbackLine}`,
                    operationOptions,
                );
            }

            if (decision.mode === "skipped_indexing") {
                return this.host.manageResponse(
                    "sync",
                    absolutePath,
                    "not_ready",
                    this.host.buildManageActionBlockedMessage(absolutePath, "sync"),
                    {
                        reason: "indexing",
                        hints: {
                            status: this.host.buildStatusHint(absolutePath),
                            retryAfterMs: this.host.getManageRetryAfterMs(),
                            indexing: this.host.buildIndexingMetadata(absolutePath),
                        },
                    },
                );
            }

            if (decision.mode === "skipped_mutation_in_progress") {
                const activeMutation = decision.activeMutation;
                return this.host.manageResponse(
                    "sync",
                    absolutePath,
                    "blocked",
                    activeMutation
                        ? formatRootMutationBlockedMessage(activeMutation)
                        : `Another mutation is already in progress for '${absolutePath}'. Use manage_index status to observe it.`,
                    {
                        reason: "mutation_in_progress",
                        hints: {
                            status: this.host.buildStatusHint(absolutePath),
                            ...(activeMutation ? { activeMutation } : {}),
                        },
                    },
                );
            }

            if (decision.mode === "skipped_requires_reindex") {
                return this.host.manageResponse(
                    "sync",
                    absolutePath,
                    "requires_reindex",
                    this.host.buildReindexInstruction(absolutePath, "Sync blocked because this codebase requires reindex."),
                    {
                        reason: "requires_reindex",
                        hints: {
                            reindex: this.host.buildReindexHint(absolutePath),
                            status: this.host.buildStatusHint(absolutePath),
                        },
                        ...(decision.operation ? { operation: decision.operation } : {}),
                    },
                );
            }

            if (decision.mode === "skipped_source_checkpoint_unavailable") {
                return this.host.manageResponse(
                    "sync",
                    absolutePath,
                    "requires_reindex",
                    this.host.buildReindexInstruction(
                        absolutePath,
                        `Incremental sync is unavailable because its source checkpoint is ${decision.checkpointStatus || "unavailable"}.`,
                    ),
                    {
                        reason: "requires_reindex",
                        hints: {
                            reindex: this.host.buildReindexHint(absolutePath),
                            status: this.host.buildStatusHint(absolutePath),
                            sourceFreshness: {
                                status: decision.checkpointStatus || "unavailable",
                                message: decision.errorMessage,
                            },
                        },
                    },
                );
            }

            if (decision.mode === "skipped_missing_path") {
                return this.host.manageResponse("sync", absolutePath, "error", `Error: Codebase path '${absolutePath}' no longer exists.`, operationOptions);
            }

            const added = decision.stats?.added ?? 0;
            const removed = decision.stats?.removed ?? 0;
            const modified = decision.stats?.modified ?? 0;
            const syncStats = { added, removed, modified };
            const ignoredDeletes = decision.deletedFiles ?? 0;
            const totalChanges = added + removed + modified;

            if (decision.mode === "coalesced") {
                if (typeof decision.errorMessage === "string" && decision.errorMessage.trim().length > 0) {
                    const fallbackLine = decision.fallbackSyncExecuted
                        ? "\nFallback incremental sync was executed, but ignore-rule reconciliation did not complete deterministically."
                        : "";
                    return this.host.manageResponse(
                        "sync",
                        absolutePath,
                        "error",
                        `Error syncing codebase: coalesced in-flight reconcile failed (${decision.errorMessage}).${fallbackLine}`,
                        operationOptions,
                    );
                }
                await this.host.touchWatchedCodebase(absolutePath);
                return this.host.manageResponse("sync", absolutePath, "ok", `🔄 Sync request coalesced for '${absolutePath}'. Reused in-flight sync result.`, {
                    ...operationOptions,
                    syncStats,
                });
            }

            if (decision.mode === "reconciled_ignore_change") {
                if (totalChanges === 0 && ignoredDeletes === 0) {
                    await this.host.touchWatchedCodebase(absolutePath);
                    return this.host.manageResponse("sync", absolutePath, "ok", `✅ Ignore-rule reconciliation completed for '${absolutePath}'. No additional index changes were required.`, {
                        ...operationOptions,
                        syncStats,
                    });
                }

                const resultMessage =
                    `🔄 Incremental sync + ignore-rule reconciliation completed for '${absolutePath}'.\n\n` +
                    `📊 Sync changes:\n+ ${added} file(s) added\n- ${removed} file(s) removed\n~ ${modified} file(s) modified\n` +
                    `🧹 Ignored paths removed from index: ${ignoredDeletes}\n` +
                    `\nTotal changes: ${totalChanges + ignoredDeletes}`;
                console.log(`[SYNC] ✅ Sync+ignore reconcile completed: +${added}, -${removed}, ~${modified}, ignoredDeleted=${ignoredDeletes}`);
                await this.host.touchWatchedCodebase(absolutePath);
                return this.host.manageResponse("sync", absolutePath, "ok", resultMessage, {
                    ...operationOptions,
                    syncStats,
                });
            }

            if (totalChanges === 0) {
                await this.host.touchWatchedCodebase(absolutePath);
                return this.host.manageResponse("sync", absolutePath, "ok", `✅ No changes detected for codebase '${absolutePath}'. Index is up to date.`, {
                    ...operationOptions,
                    syncStats,
                });
            }

            const resultMessage = `🔄 Incremental sync completed for '${absolutePath}'.\n\n📊 Changes:\n+ ${added} file(s) added\n- ${removed} file(s) removed\n~ ${modified} file(s) modified\n\nTotal changes: ${totalChanges}`;
            console.log(`[SYNC] ✅ Sync completed: +${added}, -${removed}, ~${modified}`);
            await this.host.touchWatchedCodebase(absolutePath);
            return this.host.manageResponse("sync", absolutePath, "ok", resultMessage, {
                ...operationOptions,
                syncStats,
            });
        } catch (error: unknown) {
            console.error("[SYNC] Error during sync:", error);
            const operation = error instanceof SyncOperationError ? error.operation : undefined;
            const vectorBackendDiagnostic = classifyVectorBackendError(error);
            if (vectorBackendDiagnostic) {
                return this.host.manageVectorBackendResponse("sync", requestedPath, vectorBackendDiagnostic, undefined, operation);
            }
            return this.host.manageResponse("sync", requestedPath, "error", `Error syncing codebase: ${formatUnknownError(error)}`, operation ? { operation } : undefined);
        }
    }
}
