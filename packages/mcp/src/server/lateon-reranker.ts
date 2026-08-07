import type { ChildProcess } from "node:child_process";
import { fork } from "node:child_process";
import * as crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
    Reranker,
    RerankExecutionDiagnostics,
    RerankOptions,
    RerankResult,
} from "@zokizuan/satori-core";
import { serializeCanonicalJson } from "../core/canonical-json.js";
import type {
    LateOnEffectiveOperationalBounds,
    LateOnRuntimeProfile,
    LateOnRuntimeProfileV2,
    LateOnRuntimeProfileV3,
    LateOnWorkerRequest,
    LateOnWorkerResponse,
} from "./lateon-reranker-protocol.js";
import {
    LATEON_RUNTIME_PROFILE_IDS,
    type LateOnRuntimeProfileId,
} from "./lateon-reranker-protocol.js";

export { LATEON_RUNTIME_PROFILE_IDS } from "./lateon-reranker-protocol.js";
export type { LateOnRuntimeProfileId } from "./lateon-reranker-protocol.js";

export type LateOnOperationalReason =
    | "lateon_not_ready"
    | "lateon_capacity_fallback"
    | "lateon_queue_timeout"
    | "lateon_execution_timeout"
    | "lateon_cancelled"
    | "lateon_invalid_output"
    | "lateon_worker_failure";

export class LateOnOperationalError extends Error {
    readonly reason: LateOnOperationalReason;
    readonly cause?: unknown;

    constructor(reason: LateOnOperationalReason, message: string, cause?: unknown) {
        super(message);
        this.name = "LateOnOperationalError";
        this.reason = reason;
        this.cause = cause;
    }
}

const PROFILE_PATHS: Readonly<Record<LateOnRuntimeProfileId, string>> = Object.freeze({
    [LATEON_RUNTIME_PROFILE_IDS.legacyD16]: fileURLToPath(
        new URL("../../assets/lateon/runtime-profile-v1.json", import.meta.url),
    ),
    [LATEON_RUNTIME_PROFILE_IDS.projectionV2D16]: fileURLToPath(
        new URL("../../assets/lateon/runtime-profile-v2-d16.json", import.meta.url),
    ),
    [LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32]: fileURLToPath(
        new URL("../../assets/lateon/runtime-profile-v2-d32.json", import.meta.url),
    ),
    [LATEON_RUNTIME_PROFILE_IDS.contextV3D32]: fileURLToPath(
        new URL("../../assets/lateon/runtime-profile-v3-d32.json", import.meta.url),
    ),
    [LATEON_RUNTIME_PROFILE_IDS.contextV3D32Activated]: fileURLToPath(
        new URL("../../assets/lateon/runtime-profile-v3-d32-v2.json", import.meta.url),
    ),
});

type PendingWorkerRequest = {
    resolve: (response: LateOnWorkerResponse) => void;
    reject: (error: Error) => void;
};

type QueuedRerank = {
    query: string;
    documents: readonly string[];
    identities: readonly string[];
    offeredAt: number;
    resolve: (results: RerankResult[]) => void;
    reject: (error: Error) => void;
    signal?: AbortSignal;
    abortListener?: () => void;
    queueTimer?: NodeJS.Timeout;
    executionStartedAt?: number;
    onExecutionDiagnostics?: (diagnostics: RerankExecutionDiagnostics) => void;
};

type WorkerState = "loading" | "ready" | "unhealthy" | "closed";

export type LateOnRerankerConfig = Readonly<{
    modelDirectory: string;
    profileId?: LateOnRuntimeProfileId;
    requestDeadlineMilliseconds?: number;
    maximumQueueWaitMilliseconds?: number;
    rerankerStageDeadlineMilliseconds?: number;
    maximumActiveReranks?: 0 | 1;
    maximumQueuedReranks?: 0 | 1;
    intraOpThreads?: number;
    workerPath?: string;
}>;

function safeIntegerAtLeast(value: unknown, minimum: number, label: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < minimum) {
        throw new Error(`${label} must be a safe integer of at least ${minimum}.`);
    }
    return value as number;
}

function positiveSafeInteger(value: unknown, label: string): number {
    return safeIntegerAtLeast(value, 1, label);
}

function assertReducibleBound(
    requested: number | undefined,
    frozenMaximum: number,
    label: string,
    minimum: number = 1,
): number {
    const effective = requested === undefined
        ? frozenMaximum
        : safeIntegerAtLeast(requested, minimum, label);
    if (effective > frozenMaximum) {
        throw new Error(`${label} cannot exceed the qualified profile maximum of ${frozenMaximum}.`);
    }
    return effective;
}

function hasBoundedExecutionContract(
    profile: LateOnRuntimeProfile,
): profile is LateOnRuntimeProfileV2 | LateOnRuntimeProfileV3 {
    return profile.schemaVersion === "satori_lateon_runtime_profile_v2"
        || profile.schemaVersion === "satori_lateon_runtime_profile_v3";
}

function validateCommonProfile(profile: Partial<LateOnRuntimeProfile>): void {
    if (
        profile.identity?.license !== "Apache-2.0"
        || !Array.isArray(profile.artifacts)
        || profile.artifacts.length === 0
        || profile.runtime?.executionProvider !== "cpu"
        || profile.inference?.documentBatchSize !== 1
    ) {
        throw new Error("LateOn runtime profile is malformed or unsupported.");
    }
    positiveSafeInteger(profile.inference.candidateDepth, "LateOn candidate depth");
    positiveSafeInteger(profile.inference.profileIntraOpThreads, "LateOn intra-op thread count");
    positiveSafeInteger(profile.inference.interOpThreads, "LateOn inter-op thread count");
}

export function loadLateOnRuntimeProfile(
    profileIdOrPath: LateOnRuntimeProfileId | string = LATEON_RUNTIME_PROFILE_IDS.contextV3D32,
): LateOnRuntimeProfile {
    const profilePath = PROFILE_PATHS[profileIdOrPath as LateOnRuntimeProfileId]
        ?? path.resolve(profileIdOrPath);
    const parsed = JSON.parse(fs.readFileSync(profilePath, "utf8")) as Partial<LateOnRuntimeProfile>;
    validateCommonProfile(parsed);
    if (parsed.schemaVersion === "satori_lateon_runtime_profile_v1") {
        if (parsed.identity?.projectionVersion !== "search_rerank_document_v1") {
            throw new Error("LateOn v1 runtime profile has an incompatible projection.");
        }
        positiveSafeInteger(
            parsed.measuredProfile?.requestDeadlineMilliseconds,
            "LateOn request deadline",
        );
        positiveSafeInteger(
            parsed.measuredProfile?.maximumModelLoadMilliseconds,
            "LateOn readiness deadline",
        );
        return parsed as LateOnRuntimeProfile;
    }
    if (parsed.schemaVersion === "satori_lateon_runtime_profile_v2") {
        if (
            (parsed.profileId !== LATEON_RUNTIME_PROFILE_IDS.projectionV2D16
                && parsed.profileId !== LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32)
            || parsed.identity?.projectionVersion !== "search_rerank_document_v2"
            || !/^[a-f0-9]{64}$/.test(parsed.identity?.projectionSha256 ?? "")
        ) {
            throw new Error("LateOn v2 runtime profile is malformed or unsupported.");
        }
        validateBoundedExecutionContract(parsed);
        const expectedDepth = parsed.profileId === LATEON_RUNTIME_PROFILE_IDS.projectionV2D16
            ? 16
            : 32;
        if (parsed.inference?.candidateDepth !== expectedDepth) {
            throw new Error(`LateOn ${parsed.profileId} must use candidate depth ${expectedDepth}.`);
        }
        return parsed as LateOnRuntimeProfile;
    }
    if (parsed.schemaVersion === "satori_lateon_runtime_profile_v3") {
        if (
            (parsed.profileId !== LATEON_RUNTIME_PROFILE_IDS.contextV3D32
                && parsed.profileId !== LATEON_RUNTIME_PROFILE_IDS.contextV3D32Activated)
            || parsed.identity?.projectionVersion !== "search_rerank_document_v3"
            || !/^[a-f0-9]{64}$/.test(parsed.identity?.projectionSha256 ?? "")
            || parsed.identity?.queryProjectionVersion !== "search_rerank_query_v1"
        ) {
            throw new Error("LateOn v3 runtime profile is malformed or unsupported.");
        }
        const expectedQualification = parsed.profileId === LATEON_RUNTIME_PROFILE_IDS.contextV3D32Activated
            ? "owner_activated_operationally_qualified_not_held_out"
            : "disabled_optional_not_track_o_or_held_out_candidate";
        if (parsed.qualificationStatus !== expectedQualification) {
            throw new Error(
                `LateOn ${parsed.profileId} carries an untrusted qualification status.`,
            );
        }
        validateBoundedExecutionContract(parsed);
        if (parsed.inference?.candidateDepth !== 32) {
            throw new Error(`LateOn ${parsed.profileId} must use candidate depth 32.`);
        }
        return parsed as LateOnRuntimeProfile;
    }
    throw new Error("LateOn runtime profile schema is unsupported.");
}

function validateBoundedExecutionContract(
    parsed: Partial<LateOnRuntimeProfileV2 | LateOnRuntimeProfileV3>,
): void {
    if (
        parsed.execution?.workerProcesses !== 1
        || parsed.execution.activeModelSessions !== 1
        || parsed.execution.executionMode !== "sequential"
        || parsed.execution.graphOptimizationLevel !== "all"
        || parsed.execution.queryBatchSize !== 1
        || parsed.execution.documentEncoding !== "serial"
        || parsed.execution.tokenizerParallelism !== false
        || parsed.operationalBounds?.maximumActiveReranks !== 1
        || parsed.operationalBounds.maximumQueuedReranks !== 1
    ) {
        throw new Error("LateOn bounded execution contract is malformed or unsupported.");
    }
    positiveSafeInteger(
        parsed.operationalBounds.maximumQueueWaitMilliseconds,
        "LateOn maximum queue wait",
    );
    positiveSafeInteger(
        parsed.operationalBounds.maximumReadinessMilliseconds,
        "LateOn readiness deadline",
    );
    positiveSafeInteger(
        parsed.operationalBounds.maximumScoreMilliseconds,
        "LateOn scoring deadline",
    );
    positiveSafeInteger(
        parsed.operationalBounds.maximumRerankerStageMilliseconds,
        "LateOn reranker-stage deadline",
    );
}

function profileDigest(profile: LateOnRuntimeProfile): string {
    return crypto.createHash("sha256")
        .update(serializeCanonicalJson(profile), "utf8")
        .digest("hex");
}

function operationalError(
    reason: LateOnOperationalReason,
    message: string,
    cause?: unknown,
): LateOnOperationalError {
    return new LateOnOperationalError(
        reason,
        message,
        cause,
    );
}

export class LateOnReranker implements Reranker {
    private readonly profile: LateOnRuntimeProfile;
    private readonly rawProfileDigest: string;
    private readonly identity: ReturnType<Reranker["getIdentity"]>;
    private readonly modelDirectory: string;
    private readonly effectiveBounds: LateOnEffectiveOperationalBounds;
    private readonly readinessDeadlineMilliseconds: number;
    private readonly intraOpThreads: number;
    private readonly workerPath: string;
    private worker: ChildProcess | null = null;
    private workerState: WorkerState = "loading";
    private readinessPromise: Promise<void>;
    private resolveReadiness!: () => void;
    private rejectReadiness!: (error: Error) => void;
    private readinessTimer?: NodeJS.Timeout;
    private readonly pending = new Map<number, PendingWorkerRequest>();
    private nextRequestId = 1;
    private active = false;
    private activeRequest: QueuedRerank | null = null;
    private activeTask: Promise<void> | null = null;
    private queued: QueuedRerank | null = null;
    private termination: Promise<void> | null = null;
    private closed = false;

    constructor(config: LateOnRerankerConfig) {
        this.profile = loadLateOnRuntimeProfile(
            config.profileId ?? LATEON_RUNTIME_PROFILE_IDS.contextV3D32,
        );
        this.rawProfileDigest = profileDigest(this.profile);
        this.modelDirectory = path.resolve(config.modelDirectory);
        this.intraOpThreads = this.resolveIntraOpThreads(config.intraOpThreads);
        this.effectiveBounds = this.resolveOperationalBounds(config);
        this.readinessDeadlineMilliseconds = hasBoundedExecutionContract(this.profile)
            ? this.profile.operationalBounds.maximumReadinessMilliseconds
            : this.profile.measuredProfile.maximumModelLoadMilliseconds;
        const isUnmodifiedLegacyProfile = !hasBoundedExecutionContract(this.profile)
            && config.requestDeadlineMilliseconds === undefined
            && config.maximumQueueWaitMilliseconds === undefined
            && config.rerankerStageDeadlineMilliseconds === undefined
            && config.maximumActiveReranks === undefined
            && config.maximumQueuedReranks === undefined
            && config.intraOpThreads === undefined;
        const effectiveProfileDigest = isUnmodifiedLegacyProfile
            ? this.rawProfileDigest
            : crypto.createHash("sha256")
                .update(serializeCanonicalJson({
                    profile: this.profile,
                    effectiveOperationalBounds: this.effectiveBounds,
                    intraOpThreads: this.intraOpThreads,
                }), "utf8")
                .digest("hex");
        this.identity = Object.freeze({
            provider: "lateon",
            model: `${this.profile.identity.repository}@${this.profile.identity.revision}`,
            profile: effectiveProfileDigest,
        });
        this.workerPath = config.workerPath
            ? path.resolve(config.workerPath)
            : fileURLToPath(new URL("./lateon-reranker-worker.js", import.meta.url));
        this.readinessPromise = this.createReadinessPromise();
        this.startWorker();
    }

    getIdentity(): ReturnType<Reranker["getIdentity"]> {
        return this.identity;
    }

    getMaxDocuments(): number {
        return this.profile.inference.candidateDepth;
    }

    getDocumentProjectionVersion(): LateOnRuntimeProfile["identity"]["projectionVersion"] {
        return this.profile.identity.projectionVersion;
    }

    getQueryProjectionVersion(): string {
        return this.profile.schemaVersion === "satori_lateon_runtime_profile_v3"
            ? this.profile.identity.queryProjectionVersion
            : "semantic_query_raw_v1";
    }

    getProfileId(): LateOnRuntimeProfileId {
        return hasBoundedExecutionContract(this.profile)
            ? this.profile.profileId
            : LATEON_RUNTIME_PROFILE_IDS.legacyD16;
    }

    getOperationalState(): WorkerState {
        return this.workerState;
    }

    getOperationalSnapshot(): Readonly<{
        state: WorkerState;
        closed: boolean;
        workerAttached: boolean;
        activeRequest: boolean;
        activeTask: boolean;
        queuedRequest: boolean;
        pendingWorkerRequests: number;
        readinessTimerActive: boolean;
        terminationActive: boolean;
    }> {
        return Object.freeze({
            state: this.workerState,
            closed: this.closed,
            workerAttached: this.worker !== null,
            activeRequest: this.activeRequest !== null,
            activeTask: this.activeTask !== null,
            queuedRequest: this.queued !== null,
            pendingWorkerRequests: this.pending.size,
            readinessTimerActive: this.readinessTimer !== undefined,
            terminationActive: this.termination !== null,
        });
    }

    async waitUntilReady(): Promise<void> {
        if (this.closed) {
            throw operationalError("lateon_cancelled", "LateOn reranker is closed.");
        }
        await this.readinessPromise;
    }

    async rerank(
        query: string,
        documents: string[],
        options: RerankOptions = {},
    ): Promise<RerankResult[]> {
        if (this.closed) {
            throw operationalError("lateon_cancelled", "LateOn reranker is closed.");
        }
        if (!query.trim()) throw new Error("Query cannot be empty.");
        if (documents.length === 0) return [];
        if (documents.length > this.getMaxDocuments()) {
            throw new Error(
                `LateOn accepts at most ${this.getMaxDocuments()} documents per request.`,
            );
        }
        const identities = options.identities
            ? [...options.identities]
            : documents.map((_document, index) => String(index));
        if (identities.length !== documents.length) {
            throw new Error("LateOn candidate identities and documents must have equal lengths.");
        }
        const signal = (options as RerankOptions & { signal?: AbortSignal }).signal;
        if (signal?.aborted) {
            throw operationalError("lateon_cancelled", "LateOn rerank was cancelled.");
        }
        if (this.workerState === "loading" && !hasBoundedExecutionContract(this.profile)) {
            await this.readinessPromise;
        }
        if (this.workerState !== "ready") {
            throw operationalError(
                "lateon_not_ready",
                `LateOn profile ${this.getProfileId()} is not ready.`,
            );
        }
        if (this.effectiveBounds.maximumActiveReranks === 0) {
            throw operationalError(
                "lateon_capacity_fallback",
                "LateOn active capacity is disabled by the effective profile.",
            );
        }

        const offeredAt = Date.now();
        let submittedRequest!: QueuedRerank;
        const result = new Promise<RerankResult[]>((resolve, reject) => {
            const request: QueuedRerank = {
                query,
                documents: [...documents],
                identities,
                offeredAt,
                resolve,
                reject,
                ...(signal ? { signal } : {}),
                ...(options.onExecutionDiagnostics
                    ? { onExecutionDiagnostics: options.onExecutionDiagnostics }
                    : {}),
            };
            submittedRequest = request;
            if (signal) {
                request.abortListener = () => this.cancelRequest(request);
                signal.addEventListener("abort", request.abortListener, { once: true });
            }
            if (!this.active) {
                this.startExecution(request);
                return;
            }
            if (this.effectiveBounds.maximumQueuedReranks === 0 || this.queued) {
                reject(operationalError(
                    "lateon_capacity_fallback",
                    "LateOn rerank capacity is full; deterministic fallback is required.",
                ));
                return;
            }
            request.queueTimer = setTimeout(() => {
                if (this.queued !== request) return;
                this.queued = null;
                reject(operationalError(
                    "lateon_queue_timeout",
                    `LateOn queue wait exceeded ${this.effectiveBounds.maximumQueueWaitMilliseconds} ms.`,
                ));
            }, this.effectiveBounds.maximumQueueWaitMilliseconds);
            request.queueTimer.unref();
            this.queued = request;
        });
        return result.finally(() => {
            if (signal && submittedRequest.abortListener) {
                signal.removeEventListener("abort", submittedRequest.abortListener);
            }
        });
    }

    private resolveIntraOpThreads(requested: number | undefined): number {
        const frozen = this.profile.inference.profileIntraOpThreads;
        if (hasBoundedExecutionContract(this.profile)) {
            if (requested !== undefined && requested !== frozen) {
                throw new Error(`LateOn bounded thread policy is immutable at ${frozen} intra-op threads.`);
            }
            return frozen;
        }
        return positiveSafeInteger(
            requested ?? Math.min(frozen, Math.max(1, os.availableParallelism())),
            "LateOn intra-op thread count",
        );
    }

    private resolveOperationalBounds(config: LateOnRerankerConfig): LateOnEffectiveOperationalBounds {
        if (!hasBoundedExecutionContract(this.profile)) {
            const requestDeadline = positiveSafeInteger(
                config.requestDeadlineMilliseconds
                    ?? this.profile.measuredProfile.requestDeadlineMilliseconds,
                "LateOn request deadline",
            );
            return Object.freeze({
                maximumActiveReranks: config.maximumActiveReranks ?? 1,
                maximumQueuedReranks: config.maximumQueuedReranks ?? 1,
                maximumQueueWaitMilliseconds:
                    config.maximumQueueWaitMilliseconds ?? requestDeadline,
                maximumScoreMilliseconds: requestDeadline,
                maximumRerankerStageMilliseconds:
                    config.rerankerStageDeadlineMilliseconds ?? requestDeadline,
            });
        }
        const frozen = this.profile.operationalBounds;
        return Object.freeze({
            maximumActiveReranks: assertReducibleBound(
                config.maximumActiveReranks,
                frozen.maximumActiveReranks,
                "LateOn maximum active reranks",
                0,
            ) as 0 | 1,
            maximumQueuedReranks: assertReducibleBound(
                config.maximumQueuedReranks,
                frozen.maximumQueuedReranks,
                "LateOn maximum queued reranks",
                0,
            ) as 0 | 1,
            maximumQueueWaitMilliseconds: assertReducibleBound(
                config.maximumQueueWaitMilliseconds,
                frozen.maximumQueueWaitMilliseconds,
                "LateOn maximum queue wait",
            ),
            maximumScoreMilliseconds: assertReducibleBound(
                config.requestDeadlineMilliseconds,
                frozen.maximumScoreMilliseconds,
                "LateOn scoring deadline",
            ),
            maximumRerankerStageMilliseconds: assertReducibleBound(
                config.rerankerStageDeadlineMilliseconds,
                frozen.maximumRerankerStageMilliseconds,
                "LateOn reranker-stage deadline",
            ),
        });
    }

    private createReadinessPromise(): Promise<void> {
        const readiness = new Promise<void>((resolve, reject) => {
            this.resolveReadiness = resolve;
            this.rejectReadiness = reject;
        });
        void readiness.catch(() => undefined);
        return readiness;
    }

    private startWorker(): void {
        if (this.closed || this.worker || this.termination) return;
        this.workerState = "loading";
        this.readinessPromise = this.createReadinessPromise();
        const worker = fork(this.workerPath, [], {
            stdio: ["ignore", "ignore", "ignore", "ipc"],
            execArgv: process.execArgv.filter(
                (argument) => !argument.startsWith("--input-type"),
            ),
        });
        this.worker = worker;
        const fail = (error: LateOnOperationalError): void => {
            if (this.worker !== worker) return;
            void this.stopWorker(error, this.workerState === "ready");
        };
        worker.once("error", (error) => fail(operationalError(
            "lateon_worker_failure",
            "LateOn worker process failed.",
            error,
        )));
        worker.once("exit", (code, signal) => {
            if (this.worker !== worker) return;
            fail(operationalError(
                "lateon_worker_failure",
                `LateOn worker exited before completion (${signal ?? code ?? "unknown"}).`,
            ));
        });
        worker.on("message", (message: unknown) => {
            if (this.worker !== worker) return;
            this.handleWorkerMessage(worker, message);
        });
        this.readinessTimer = setTimeout(() => {
            fail(operationalError(
                "lateon_not_ready",
                `LateOn worker readiness exceeded ${this.readinessDeadlineMilliseconds} ms.`,
            ));
        }, this.readinessDeadlineMilliseconds);
        this.readinessTimer.unref();
        worker.send({
            type: "initialize",
            modelDirectory: this.modelDirectory,
            profile: this.profile,
            profileDigest: this.rawProfileDigest,
            intraOpThreads: this.intraOpThreads,
        } satisfies LateOnWorkerRequest);
    }

    private handleWorkerMessage(worker: ChildProcess, message: unknown): void {
        if (!message || typeof message !== "object" || !("type" in message)) {
            void this.stopWorker(operationalError(
                "lateon_invalid_output",
                "LateOn worker emitted a malformed message.",
            ), this.workerState === "ready");
            return;
        }
        const response = message as Record<string, unknown> & {
            type?: LateOnWorkerResponse["type"];
            requestId?: unknown;
        };
        if (
            response.type !== "ready"
            && response.type !== "result"
            && response.type !== "error"
        ) {
            void this.stopWorker(operationalError(
                "lateon_invalid_output",
                "LateOn worker emitted an unsupported message.",
            ), this.workerState === "ready");
            return;
        }
        if (response.type === "ready") {
            if (
                response.modelRevision !== this.profile.identity.revision
                || response.profileDigest !== this.rawProfileDigest
                || response.projectionVersion !== this.profile.identity.projectionVersion
                || response.candidateDepth !== this.profile.inference.candidateDepth
            ) {
                void this.stopWorker(operationalError(
                    "lateon_worker_failure",
                    "LateOn worker readiness identity does not match the selected profile.",
                ), false);
                return;
            }
            if (this.readinessTimer) clearTimeout(this.readinessTimer);
            this.readinessTimer = undefined;
            this.workerState = "ready";
            this.resolveReadiness();
            return;
        }
        if (response.type === "error" && response.requestId === undefined) {
            void this.stopWorker(operationalError(
                "lateon_worker_failure",
                typeof response.message === "string"
                    ? response.message
                    : "LateOn worker initialization failed.",
            ), false);
            return;
        }
        const requestId = response.requestId;
        if (!Number.isSafeInteger(requestId)) {
            void this.stopWorker(operationalError(
                "lateon_invalid_output",
                "LateOn worker response has an invalid request identity.",
            ), true);
            return;
        }
        const pending = this.pending.get(requestId as number);
        if (!pending) return;
        this.pending.delete(requestId as number);
        if (response.type === "error") {
            pending.reject(operationalError(
                "lateon_worker_failure",
                typeof response.message === "string"
                    ? response.message
                    : "LateOn worker request failed.",
            ));
        } else {
            pending.resolve(response as LateOnWorkerResponse);
        }
    }

    private startExecution(request: QueuedRerank): void {
        if (request.queueTimer) clearTimeout(request.queueTimer);
        request.executionStartedAt = Date.now();
        this.active = true;
        this.activeRequest = request;
        let task!: Promise<void>;
        task = (async () => {
            try {
                request.resolve(await this.rerankOnce(request));
            } catch (error) {
                request.reject(error instanceof Error ? error : new Error(String(error)));
            } finally {
                this.active = false;
                if (this.activeRequest === request) this.activeRequest = null;
                if (this.activeTask === task) this.activeTask = null;
                this.startQueuedIfPossible();
            }
        })();
        this.activeTask = task;
        void task.catch(() => undefined);
    }

    private cancelRequest(request: QueuedRerank): void {
        const cancellation = operationalError(
            "lateon_cancelled",
            "LateOn rerank was cancelled.",
        );
        if (this.queued === request) {
            this.queued = null;
            if (request.queueTimer) clearTimeout(request.queueTimer);
            request.reject(cancellation);
            return;
        }
        if (this.activeRequest === request) {
            void this.stopWorker(cancellation, true);
        }
    }

    private startQueuedIfPossible(): void {
        const queued = this.queued;
        if (!queued) return;
        this.queued = null;
        if (this.closed) {
            if (queued.queueTimer) clearTimeout(queued.queueTimer);
            queued.reject(operationalError("lateon_cancelled", "LateOn reranker is closed."));
            return;
        }
        if (this.workerState !== "ready") {
            if (queued.queueTimer) clearTimeout(queued.queueTimer);
            queued.reject(operationalError(
                "lateon_not_ready",
                "LateOn worker became unavailable while the request was queued.",
            ));
            return;
        }
        this.startExecution(queued);
    }

    private reportExecutionDiagnostics(
        request: QueuedRerank,
        diagnostics: RerankExecutionDiagnostics,
    ): void {
        if (!request.onExecutionDiagnostics) return;
        try {
            request.onExecutionDiagnostics(diagnostics);
        } catch {
            // Diagnostics are observational only: a throwing telemetry
            // callback must never alter ranking behavior or mask the
            // terminal error classification.
        }
    }

    private async rerankOnce(request: QueuedRerank): Promise<RerankResult[]> {
        const worker = this.worker;
        if (!worker || this.workerState !== "ready") {
            throw operationalError("lateon_not_ready", "LateOn worker is not ready.");
        }
        const executionStartedAt = request.executionStartedAt ?? Date.now();
        const queueWaitMs = Math.max(0, executionStartedAt - request.offeredAt);
        const stageRemaining = request.offeredAt
            + this.effectiveBounds.maximumRerankerStageMilliseconds
            - Date.now();
        if (stageRemaining <= 0) {
            this.reportExecutionDiagnostics(request, {
                attempts: 1,
                retries: 0,
                timeouts: 1,
                queueWaitMs,
                effectiveStageDeadlineMs: stageRemaining,
                observedWallMs: Date.now() - executionStartedAt,
            });
            throw operationalError(
                "lateon_execution_timeout",
                "LateOn reranker-stage deadline expired before execution.",
            );
        }
        const timeoutMilliseconds = Math.min(
            this.effectiveBounds.maximumScoreMilliseconds,
            stageRemaining,
        );
        const timeoutError = operationalError(
            "lateon_execution_timeout",
            `LateOn scoring exceeded its ${timeoutMilliseconds} ms effective deadline.`,
        );
        const requestId = this.nextRequestId++;
        let timeout: NodeJS.Timeout | undefined;
        let terminationAfterTimeout: Promise<void> | undefined;
        const operation = new Promise<LateOnWorkerResponse>((resolve, reject) => {
            this.pending.set(requestId, { resolve, reject });
            try {
                worker.send({
                    type: "rerank",
                    requestId,
                    query: request.query,
                    documents: request.documents,
                    identities: request.identities,
                } satisfies LateOnWorkerRequest, (error) => {
                    if (!error) return;
                    const pending = this.pending.get(requestId);
                    if (!pending) return;
                    this.pending.delete(requestId);
                    pending.reject(operationalError(
                        "lateon_worker_failure",
                        "LateOn worker request could not be sent.",
                        error,
                    ));
                });
            } catch (error) {
                this.pending.delete(requestId);
                reject(operationalError(
                    "lateon_worker_failure",
                    "LateOn worker request could not be sent.",
                    error,
                ));
            }
        });
        const deadline = new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => {
                terminationAfterTimeout = this.stopWorker(timeoutError, true);
                reject(timeoutError);
            }, timeoutMilliseconds);
            timeout.unref();
        });
        try {
            const response = await Promise.race([operation, deadline]);
            const results = this.validateResponse(response, requestId, request.documents.length);
            this.reportExecutionDiagnostics(request, {
                attempts: 1,
                retries: 0,
                timeouts: 0,
                queueWaitMs,
                effectiveScoreDeadlineMs: timeoutMilliseconds,
                effectiveStageDeadlineMs: stageRemaining,
                observedWallMs: Date.now() - executionStartedAt,
            });
            return results;
        } catch (error) {
            if (terminationAfterTimeout) await terminationAfterTimeout;
            const classified = error instanceof LateOnOperationalError
                ? error
                : operationalError("lateon_invalid_output", "LateOn emitted invalid output.", error);
            if (classified.reason !== "lateon_cancelled") {
                const observedWallMs = Date.now() - executionStartedAt;
                this.reportExecutionDiagnostics(request, {
                    attempts: 1,
                    retries: 0,
                    timeouts: classified.reason === "lateon_execution_timeout" ? 1 : 0,
                    queueWaitMs,
                    effectiveScoreDeadlineMs: timeoutMilliseconds,
                    effectiveStageDeadlineMs: stageRemaining,
                    observedWallMs,
                    ...(classified.reason === "lateon_execution_timeout"
                        ? { deadlineLatenessMs: Math.max(0, observedWallMs - timeoutMilliseconds) }
                        : {}),
                });
            }
            if (
                classified.reason === "lateon_invalid_output"
                || classified.reason === "lateon_worker_failure"
            ) {
                await this.stopWorker(classified, true);
            }
            throw classified;
        } finally {
            if (timeout) clearTimeout(timeout);
            this.pending.delete(requestId);
        }
    }

    private validateResponse(
        response: LateOnWorkerResponse,
        requestId: number,
        documentCount: number,
    ): RerankResult[] {
        if (response.type !== "result" || response.requestId !== requestId) {
            throw operationalError("lateon_invalid_output", "LateOn worker returned an invalid response.");
        }
        if (response.results.length !== documentCount) {
            throw operationalError(
                "lateon_invalid_output",
                "LateOn worker returned an incomplete result set.",
            );
        }
        const indexes = new Set<number>();
        return response.results.map((row) => {
            if (
                !Number.isSafeInteger(row.index)
                || row.index < 0
                || row.index >= documentCount
                || indexes.has(row.index)
                || !Number.isFinite(row.relevanceScore)
            ) {
                throw operationalError(
                    "lateon_invalid_output",
                    "LateOn worker returned an invalid result row.",
                );
            }
            indexes.add(row.index);
            return { index: row.index, relevanceScore: row.relevanceScore };
        });
    }

    private async stopWorker(error: LateOnOperationalError, restart: boolean): Promise<void> {
        if (this.termination) return this.termination;
        const worker = this.worker;
        this.worker = null;
        if (this.readinessTimer) clearTimeout(this.readinessTimer);
        this.readinessTimer = undefined;
        if (!this.closed) this.workerState = "unhealthy";
        this.rejectReadiness(error);
        const pendingRequests = [...this.pending.values()];
        this.pending.clear();
        const termination = (async () => {
            if (worker && worker.exitCode === null && worker.signalCode === null) {
                const exited = new Promise<void>((resolve) => worker.once("exit", () => resolve()));
                worker.kill("SIGKILL");
                await exited;
            }
        })();
        this.termination = termination;
        try {
            await termination;
        } finally {
            if (this.termination === termination) this.termination = null;
        }
        for (const pending of pendingRequests) pending.reject(error);
        if (restart && !this.closed) this.startWorker();
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        this.workerState = "closed";
        const cancellation = operationalError("lateon_cancelled", "LateOn reranker is closed.");
        const queued = this.queued;
        this.queued = null;
        if (queued) {
            if (queued.queueTimer) clearTimeout(queued.queueTimer);
            queued.reject(cancellation);
        }
        await this.stopWorker(cancellation, false);
        await this.activeTask?.catch(() => undefined);
    }
}
