import type { ChildProcess } from "node:child_process";
import { fork } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Reranker, RerankOptions, RerankResult } from "@zokizuan/satori-core";
import type {
    LateOnRuntimeProfile,
    LateOnWorkerRequest,
    LateOnWorkerResponse,
} from "./lateon-reranker-protocol.js";

const PROFILE_PATH = fileURLToPath(
    new URL("../../assets/lateon/runtime-profile-v1.json", import.meta.url),
);

type PendingRequest = {
    resolve: (response: LateOnWorkerResponse) => void;
    reject: (error: Error) => void;
};

export type LateOnRerankerConfig = Readonly<{
    modelDirectory: string;
    requestDeadlineMilliseconds?: number;
    intraOpThreads?: number;
    workerPath?: string;
}>;

function positiveSafeInteger(value: unknown, label: string): number {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
        throw new Error(`${label} must be a positive safe integer.`);
    }
    return value as number;
}

export function loadLateOnRuntimeProfile(
    profilePath: string = PROFILE_PATH,
): LateOnRuntimeProfile {
    const parsed = JSON.parse(fs.readFileSync(profilePath, "utf8")) as Partial<LateOnRuntimeProfile>;
    if (
        parsed.schemaVersion !== "satori_lateon_runtime_profile_v1"
        || parsed.identity?.license !== "Apache-2.0"
        || parsed.identity.projectionVersion !== "search_rerank_document_v1"
        || !Array.isArray(parsed.artifacts)
        || parsed.artifacts.length === 0
        || parsed.runtime?.executionProvider !== "cpu"
        || parsed.inference?.documentBatchSize !== 1
    ) {
        throw new Error("LateOn runtime profile is malformed or unsupported.");
    }
    positiveSafeInteger(parsed.inference.candidateDepth, "LateOn candidate depth");
    positiveSafeInteger(
        parsed.measuredProfile?.requestDeadlineMilliseconds,
        "LateOn request deadline",
    );
    return parsed as LateOnRuntimeProfile;
}

export class LateOnReranker implements Reranker {
    private readonly profile: LateOnRuntimeProfile;
    private readonly modelDirectory: string;
    private readonly requestDeadlineMilliseconds: number;
    private readonly intraOpThreads: number;
    private readonly workerPath: string;
    private worker: ChildProcess | null = null;
    private workerReady: Promise<ChildProcess> | null = null;
    private readonly pending = new Map<number, PendingRequest>();
    private nextRequestId = 1;
    private queue: Promise<void> = Promise.resolve();
    private closed = false;

    constructor(config: LateOnRerankerConfig) {
        this.profile = loadLateOnRuntimeProfile();
        this.modelDirectory = path.resolve(config.modelDirectory);
        this.requestDeadlineMilliseconds = positiveSafeInteger(
            config.requestDeadlineMilliseconds
                ?? this.profile.measuredProfile.requestDeadlineMilliseconds,
            "LateOn request deadline",
        );
        this.intraOpThreads = positiveSafeInteger(
            config.intraOpThreads
                ?? Math.min(
                    this.profile.inference.profileIntraOpThreads,
                    Math.max(1, os.availableParallelism()),
                ),
            "LateOn intra-op thread count",
        );
        this.workerPath = config.workerPath
            ? path.resolve(config.workerPath)
            : fileURLToPath(new URL("./lateon-reranker-worker.js", import.meta.url));
    }

    getMaxDocuments(): number {
        return this.profile.inference.candidateDepth;
    }

    async rerank(
        query: string,
        documents: string[],
        options: RerankOptions = {},
    ): Promise<RerankResult[]> {
        if (this.closed) throw new Error("LateOn reranker is closed.");
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
        const deadlineAt = Date.now() + this.requestDeadlineMilliseconds;

        let resolveResult!: (results: RerankResult[]) => void;
        let rejectResult!: (error: Error) => void;
        const result = new Promise<RerankResult[]>((resolve, reject) => {
            resolveResult = resolve;
            rejectResult = reject;
        });
        const execute = async (): Promise<void> => {
            try {
                resolveResult(await this.rerankOnce(
                    query,
                    documents,
                    identities,
                    deadlineAt,
                ));
            } catch (error) {
                rejectResult(error instanceof Error ? error : new Error(String(error)));
            }
        };
        this.queue = this.queue.then(execute, execute);
        return result;
    }

    private async rerankOnce(
        query: string,
        documents: readonly string[],
        identities: readonly string[],
        deadlineAt: number,
    ): Promise<RerankResult[]> {
        const timeoutError = new Error(
            `LateOn reranking exceeded ${this.requestDeadlineMilliseconds} ms.`,
        );
        const remainingMilliseconds = deadlineAt - Date.now();
        if (remainingMilliseconds <= 0) throw timeoutError;
        let timeout: NodeJS.Timeout | undefined;
        const operation = (async () => {
            const worker = await this.ensureWorker();
            const requestId = this.nextRequestId++;
            const response = await new Promise<LateOnWorkerResponse>((resolve, reject) => {
                this.pending.set(requestId, { resolve, reject });
                worker.send({
                    type: "rerank",
                    requestId,
                    query,
                    documents,
                    identities,
                } satisfies LateOnWorkerRequest);
            });
            if (response.type !== "result" || response.requestId !== requestId) {
                throw new Error("LateOn worker returned an invalid response.");
            }
            if (response.results.length !== documents.length) {
                throw new Error("LateOn worker returned an incomplete result set.");
            }
            const indexes = new Set<number>();
            return response.results.map((row) => {
                if (
                    !Number.isSafeInteger(row.index)
                    || row.index < 0
                    || row.index >= documents.length
                    || indexes.has(row.index)
                    || !Number.isFinite(row.relevanceScore)
                ) {
                    throw new Error("LateOn worker returned an invalid result row.");
                }
                indexes.add(row.index);
                return {
                    index: row.index,
                    relevanceScore: row.relevanceScore,
                };
            });
        })();
        const deadline = new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => {
                this.resetWorker(timeoutError);
                reject(timeoutError);
            }, remainingMilliseconds);
            timeout.unref();
        });
        try {
            return await Promise.race([operation, deadline]);
        } finally {
            if (timeout) clearTimeout(timeout);
        }
    }

    private ensureWorker(): Promise<ChildProcess> {
        if (this.workerReady) return this.workerReady;
        this.workerReady = new Promise<ChildProcess>((resolve, reject) => {
            const worker = fork(this.workerPath, [], {
                stdio: ["ignore", "ignore", "ignore", "ipc"],
                execArgv: process.execArgv.filter(
                    (argument) => !argument.startsWith("--input-type"),
                ),
            });
            this.worker = worker;
            const failInitialization = (error: Error): void => {
                if (this.worker === worker) this.resetWorker(error);
                reject(error);
            };
            worker.once("error", failInitialization);
            worker.once("exit", (code, signal) => {
                const error = new Error(
                    `LateOn worker exited before completion (${signal ?? code ?? "unknown"}).`,
                );
                if (this.worker === worker) this.resetWorker(error, false);
                reject(error);
            });
            worker.on("message", (message: LateOnWorkerResponse) => {
                if (message.type === "ready") {
                    resolve(worker);
                    return;
                }
                if (message.type === "error" && message.requestId === undefined) {
                    failInitialization(new Error(message.message));
                    return;
                }
                if (message.type === "result" || message.type === "error") {
                    const requestId = message.requestId;
                    if (requestId === undefined) return;
                    const pending = this.pending.get(requestId);
                    if (!pending) return;
                    this.pending.delete(requestId);
                    if (message.type === "error") {
                        pending.reject(new Error(message.message));
                    } else {
                        pending.resolve(message);
                    }
                }
            });
            worker.send({
                type: "initialize",
                modelDirectory: this.modelDirectory,
                profile: this.profile,
                intraOpThreads: this.intraOpThreads,
            } satisfies LateOnWorkerRequest);
        });
        return this.workerReady;
    }

    private resetWorker(error: Error, kill: boolean = true): void {
        const worker = this.worker;
        this.worker = null;
        this.workerReady = null;
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
        if (kill && worker && !worker.killed) worker.kill("SIGKILL");
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        await this.queue.catch(() => undefined);
        this.resetWorker(new Error("LateOn reranker is closed."));
    }
}
