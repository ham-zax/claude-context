import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
    createIndexMutationPort,
    createSourceFreshnessPort,
    FileSynchronizer,
} from "@zokizuan/satori-core";
import type {
    IndexMutationPort,
    IndexMutationPortDependencies,
    SourceFreshnessPort,
    SourceFreshnessPortDependencies,
} from "@zokizuan/satori-core";
import { ManageIndexingHandlers } from "./manage-indexing-handlers.js";
import type {
    IndexFingerprint,
    IndexOperationPhase,
    IndexOperationReceipt,
} from "../config.js";
import {
    MutationLeaseCoordinator,
    type RootMutationLease,
} from "./mutation-lease.js";

function unimplementedPortOp(): never {
    throw new Error("Unexpected port operation invoked by the test host.");
}

function testIndexMutationPort(overrides: object = {}): IndexMutationPort {
    return createIndexMutationPort({
        checkCollectionLimit: () => unimplementedPortOp(),
        deleteCollectionWithVerification: () => unimplementedPortOp(),
        prepareIndexCollection: () => unimplementedPortOp(),
        discardPreparedIndexCollection: () => unimplementedPortOp(),
        proveVectorGeneration: () => unimplementedPortOp(),
        proveIndexedGeneration: () => unimplementedPortOp(),
        repairIndex: () => unimplementedPortOp(),
        captureDurableIndexAuthority: () => unimplementedPortOp(),
        restoreDurableIndexAuthority: () => unimplementedPortOp(),
        publishCompletedIndexMarker: () => unimplementedPortOp(),
        publishNavigationCandidate: () => unimplementedPortOp(),
        discardNavigationCandidate: () => unimplementedPortOp(),
        resolveIndexPolicyForReindex: () => unimplementedPortOp(),
        resolveIndexPolicyForCodebase: () => unimplementedPortOp(),
        describeEmbeddingProvider: () => unimplementedPortOp(),
        indexCodebase: () => unimplementedPortOp(),
        isObservedIndexPolicyControlSignatureCurrent: () => unimplementedPortOp(),
        publishResolvedIndexPolicy: () => unimplementedPortOp(),
        registerSynchronizer: () => unimplementedPortOp(),
        indexCompletionMarkersEqual: () => unimplementedPortOp(),
        ...overrides,
    } as unknown as IndexMutationPortDependencies);
}

function testSourceFreshnessPort(overrides: object = {}): SourceFreshnessPort {
    return createSourceFreshnessPort({
        inspectSourceFreshnessCheckpoint: () => unimplementedPortOp(),
        compareSourceObservationToFreshnessCheckpoint: () => unimplementedPortOp(),
        compareAllSourceToFreshnessCheckpoint: () => unimplementedPortOp(),
        getRegisteredSourceFreshnessCheckpointObservation: () => unimplementedPortOp(),
        ...overrides,
    } as unknown as SourceFreshnessPortDependencies);
}

const RUNTIME_FINGERPRINT: IndexFingerprint = {
    embeddingProvider: "VoyageAI",
    embeddingModel: "voyage-code-3",
    embeddingDimension: 1024,
    embeddingArtifactDigest: null,
    embeddingNormalizationPolicy: "provider_output_v1",
    vectorStoreProvider: "Milvus",
    schemaVersion: "hybrid_v3",
    parserVersion: "parser-v1",
    extractorVersion: "extractor-v1",
    relationshipVersion: "relationships-v1",
    embeddingProjectionVersion: "embedding-projection-v1",
    lexicalProjectionVersion: "lexical-projection-v1",
};

const DEFAULT_INDEX_SOURCE = "export const value = 1;\n";

function buildMarker(codebasePath: string, overrides: Record<string, unknown> = {}) {
    return {
        kind: 'satori_index_completion_v3' as const,
        codebasePath,
        fingerprint: RUNTIME_FINGERPRINT,
        indexedFiles: 3,
        totalChunks: 9,
        completedAt: new Date(0).toISOString(),
        runId: 'test-run',
        indexPolicyHash: 'a'.repeat(64),
        indexStatus: 'completed' as const,
        navigation: { status: 'not_bound' as const },
        ...overrides,
    };
}

const REPAIR_PROOF = {
    collection: { status: "matched", basis: "selected_snapshot_collection" },
    snapshot: { status: "matched", basis: "verified_snapshot_fingerprint" },
    marker: { status: "missing", basis: "completion_marker_missing" },
    fingerprint: { status: "matched", basis: "verified_snapshot_fingerprint" },
    payload: { status: "matched", expectedCount: 2, observedCount: 2, missingCount: 0 },
    staleRemoteChunks: { status: "matched", extraCount: 0 },
    navigation: { status: "matched", basis: "navigation_sidecars_rebuilt" },
} as const;

function withTempRepo<T>(fn: (repoPath: string) => Promise<T>): Promise<T> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "satori-mcp-manage-indexing-"));
    const repoPath = path.join(tempDir, "repo");
    fs.mkdirSync(repoPath, { recursive: true });
    fs.writeFileSync(path.join(repoPath, "index.ts"), DEFAULT_INDEX_SOURCE);
    return fn(repoPath).finally(async () => {
        await FileSynchronizer.deleteSnapshot(repoPath);
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
}

function resolveCollectionName(codebasePath: string): string {
    const digest = crypto.createHash("md5").update(path.resolve(codebasePath)).digest("hex").slice(0, 8);
    return `hybrid_code_chunks_${digest}`;
}

type RepairResult = {
    status: "ok" | "blocked" | "requires_reindex";
    reason?: "needs_create" | "requires_reindex" | "repair_proof_limit";
    message: string;
    missingCount?: number;
    warnings?: string[];
    indexedFiles?: number;
    totalChunks?: number;
    trackedRelativePaths?: string[];
    collectionName?: string;
    activatedGeneration?: {
        collectionName: string;
        markerRunId: string;
        sourceCheckpointDocumentDigest: string;
        relationshipVersion: string;
        navigation: {
            generationId: string;
            sealHash: string;
            symbolRegistryManifestHash: string;
            relationshipManifestHash: string;
        };
    };
    proof?: Record<string, { status: string; [key: string]: unknown }>;
};

type RepairOptionsLike = {
    onProofUpdate?: (proof: Record<string, { status: string; [key: string]: unknown }>) => void;
    assertMutationCurrent?: () => void;
    publishMutation?: (publish: () => void) => void;
    publicationAuthority?: {
        ownerId: string;
        generation: number;
        operationId: string;
    };
};

function provenRepairGeneration(
    collectionName = "repair-collection",
    indexedFiles = 1,
    totalChunks = 2,
) {
    return {
        collectionName,
        marker: {
            runId: "repair-marker",
            indexedFiles,
            totalChunks,
        },
        exactPayloadCount: totalChunks,
        navigation: {
            generationId: "repair-navigation",
            navigationSealHash: "a".repeat(64),
            symbolRegistryManifestHash: "symmanifest_00000000000000000000000000000000",
            relationshipManifestHash: "b".repeat(64),
        },
    };
}

function createRepairReceiptHarness(
    repoPath: string,
    options: {
        withLease?: boolean;
        failAcceptedSave?: boolean;
        repairIndex?: (repairOptions?: RepairOptionsLike) => Promise<RepairResult>;
        touchWatchedCodebase?: () => Promise<void>;
        proveIndexedGeneration?: () => Promise<ReturnType<typeof provenRepairGeneration> | null>;
        inspectSourceFreshnessCheckpoint?: () => Promise<{
            status: "valid" | "missing" | "corrupt";
            documentDigest?: string;
        }>;
    } = {},
) {
    const events: string[] = [];
    const persisted: Array<{ phase: IndexOperationPhase; indexed: boolean }> = [];
    let receipt: IndexOperationReceipt | undefined;
    let indexed = false;
    let compatibilitySaveCalls = 0;
    let repairCalls = 0;
    let failedAcceptedSave = false;
    const coordinator = options.withLease === false
        ? undefined
        : new MutationLeaseCoordinator({
            stateDir: path.join(path.dirname(repoPath), "repair-receipt-leases"),
            ownerId: "repair-receipt-owner",
        });

    const handler = new ManageIndexingHandlers({
        indexMutationPort: testIndexMutationPort({
            repairIndex: async (_codebasePath: string, repairOptions?: RepairOptionsLike) => {
                repairCalls += 1;
                events.push("repair");
                return options.repairIndex
                    ? options.repairIndex(repairOptions)
                    : {
                        status: "ok" as const,
                        message: "repaired",
                        indexedFiles: 1,
                        totalChunks: 2,
                        warnings: [],
                        trackedRelativePaths: ["src/repaired.ts"],
                        collectionName: "repair-collection",
                        proof: REPAIR_PROOF,
                    };
            },
            proveIndexedGeneration: options.proveIndexedGeneration
                ?? (async () => provenRepairGeneration()),
        }),
        sourceFreshnessPort: testSourceFreshnessPort({
            inspectSourceFreshnessCheckpoint: options.inspectSourceFreshnessCheckpoint
                ?? (async () => ({
                    status: "valid" as const,
                    documentDigest: "c".repeat(64),
                })),
        }),
        snapshotManager: {
            startOperation: (lease: RootMutationLease) => {
                events.push("start:accepted");
                receipt = {
                    id: lease.operationId,
                    action: lease.action,
                    canonicalRoot: lease.canonicalRoot,
                    generation: lease.generation,
                    acceptedAt: lease.acquiredAt,
                    phase: "accepted",
                    lastDurableTransitionAt: lease.acquiredAt,
                    runtimeFingerprint: RUNTIME_FINGERPRINT,
                    writer: {
                        ownerId: lease.ownerId,
                        pid: lease.pid,
                        satoriVersion: "test",
                    },
                };
                return receipt;
            },
            transitionOperation: (_lease: RootMutationLease, phase: IndexOperationPhase) => {
                assert.ok(receipt);
                events.push(`transition:${phase}`);
                receipt = {
                    ...receipt,
                    phase,
                    lastDurableTransitionAt: new Date().toISOString(),
                };
                return receipt;
            },
            saveCodebaseSnapshot: () => {
                assert.ok(receipt);
                events.push(`save:${receipt.phase}`);
                if (options.failAcceptedSave && receipt.phase === "accepted" && !failedAcceptedSave) {
                    failedAcceptedSave = true;
                    return false;
                }
                persisted.push({ phase: receipt.phase, indexed });
                return true;
            },
            setCodebaseIndexed: () => {
                events.push("set:indexed");
                indexed = true;
            },
            setCodebaseIndexManifest: () => events.push("set:manifest"),
        },
        syncManager: {},
        runtimeFingerprint: RUNTIME_FINGERPRINT,
        manageResponse: (action: string, responsePath: string, status: string, message: string, responseOptions?: Record<string, unknown>) => ({
            content: [{ type: "text", text: JSON.stringify({ action, path: responsePath, status, message, ...responseOptions }) }],
        }),
        buildRuntimeOwnerConflictResponseIfBlocked: async () => null,
        recoverStaleIndexingStateIfNeeded: async () => {
            events.push("recover-stale-indexing");
        },
        getSnapshotIndexingCodebases: () => [],
        getSnapshotCodebaseInfo: () => ({
            status: "indexed",
            collectionName: "repair-collection",
            indexFingerprint: RUNTIME_FINGERPRINT,
            fingerprintSource: "verified",
        }),
        buildManageActionBlockedMessage: () => "blocked",
        buildCreateHint: (codebasePath: string) => ({ tool: "manage_index", args: { action: "create", path: codebasePath } }),
        buildReindexHint: (codebasePath: string) => ({ tool: "manage_index", args: { action: "reindex", path: codebasePath } }),
        buildStatusHint: (codebasePath: string) => ({ tool: "manage_index", args: { action: "status", path: codebasePath } }),
        getManageRetryAfterMs: () => 2000,
        buildIndexingMetadata: () => undefined,
        buildManageRequiresReindexHints: () => ({}),
        manageVectorBackendResponse: (
            action: string,
            responsePath: string,
            diagnostic: { code: string; message: string },
            _humanText?: string,
            operation?: IndexOperationReceipt,
            repairProof?: Record<string, unknown>,
        ) => ({
            content: [{
                type: "text",
                text: JSON.stringify({
                    action,
                    path: responsePath,
                    status: "error",
                    code: diagnostic.code,
                    message: diagnostic.message,
                    operation,
                    repairProof,
                }),
            }],
        }),
        getContextTrackedRelativePaths: () => [],
        setIndexingStats: () => undefined,
        rebuildCallGraphForIndex: async () => events.push("rebuild:call-graph"),
        touchWatchedCodebase: options.touchWatchedCodebase
            ?? (async () => { events.push("touch:watch"); }),
        saveSnapshotIfSupported: () => {
            compatibilitySaveCalls += 1;
            events.push("save:compatibility");
        },
        mutationLeaseCoordinator: coordinator,
    } as unknown as ConstructorParameters<typeof ManageIndexingHandlers>[0]);

    return {
        coordinator,
        events,
        get compatibilitySaveCalls() {
            return compatibilitySaveCalls;
        },
        get persisted() {
            return persisted;
        },
        get repairCalls() {
            return repairCalls;
        },
        handler,
    };
}

function createIndexLaunchHarness(
    repoPath: string,
    options: {
        canonicalizeCodebasePath?: (codebasePath: string) => string;
        startBackgroundIndexing?: (codebasePath: string, lease?: RootMutationLease) => Promise<void> | void;
        touchWatchedCodebase?: (codebasePath: string) => Promise<void>;
        assertIndexMutationCapabilities?: (coordinator: MutationLeaseCoordinator) => void;
        initialIndexed?: boolean;
    } = {},
) {
    const coordinator = new MutationLeaseCoordinator({
        stateDir: path.join(path.dirname(repoPath), "launch-leases"),
        ownerId: "launch-owner",
    });
    let lifecycle: "not_found" | "indexing" | "indexed" | "indexfailed" = options.initialIndexed ? "indexed" : "not_found";
    let failedCalls = 0;
    let saveCalls = 0;
    let canonicalizeCalls = 0;
    let writeCollectionOverride: string | null = null;
    let preparedReceipt: object | null = null;
    const launchedRoots: string[] = [];
    const failedRoots: string[] = [];
    const ownerCheckedRoots: string[] = [];
    const preflightRoots: string[] = [];
    const handler = new ManageIndexingHandlers({
        indexMutationPort: testIndexMutationPort({
            checkCollectionLimit: async () => true,
            deleteCollectionWithVerification: async (
                collectionName: string,
                deleteOptions?: { beforeDropAttempt?: () => void },
            ) => {
                if (writeCollectionOverride === null) {
                    return { collectionName, attempts: 0, verifiedAbsent: true };
                }
                deleteOptions?.beforeDropAttempt?.();
                writeCollectionOverride = null;
                return { collectionName, attempts: 1, verifiedAbsent: true };
            },
            prepareIndexCollection: async (
                codebasePath: string,
                binding: { generation: number; operationId: string; collectionName: string },
                assertMutationCurrent?: () => void,
            ) => {
                assertMutationCurrent?.();
                writeCollectionOverride = binding.collectionName;
                preparedReceipt = Object.freeze({
                    canonicalRoot: path.resolve(codebasePath),
                    collectionName: binding.collectionName,
                    generation: binding.generation,
                    operationId: binding.operationId,
                });
                return preparedReceipt;
            },
            discardPreparedIndexCollection: (receipt: object) => {
                if (receipt === preparedReceipt) {
                    preparedReceipt = null;
                }
            },
            proveVectorGeneration: async () => options.initialIndexed ? {
                collectionName: resolveCollectionName(repoPath),
                marker: buildMarker(repoPath, {
                    indexedFiles: 3,
                    totalChunks: 9,
                    indexStatus: 'completed',
                }),
            } : null,
        }),
        snapshotManager: {
            setCodebaseIndexing: () => { lifecycle = "indexing"; },
            setCodebaseIndexFailed: (codebasePath: string) => {
                lifecycle = "indexfailed";
                failedCalls += 1;
                failedRoots.push(codebasePath);
            },
            setCodebaseIndexed: () => { lifecycle = "indexed"; },
            saveCodebaseSnapshot: () => {
                saveCalls += 1;
                return true;
            },
        },
        syncManager: {},
        runtimeFingerprint: RUNTIME_FINGERPRINT,
        startBackgroundIndexing: (codebasePath: string, _force: boolean, _collection?: string, lease?: RootMutationLease) => {
            launchedRoots.push(codebasePath);
            return options.startBackgroundIndexing?.(codebasePath, lease);
        },
        manageResponse: (action: string, responsePath: string, status: string, message: string, responseOptions?: Record<string, unknown>) => ({
            content: [{ type: "text", text: JSON.stringify({ action, path: responsePath, status, message, ...responseOptions }) }],
        }),
        buildRuntimeOwnerConflictResponseIfBlocked: async (_action: string, codebasePath: string) => {
            ownerCheckedRoots.push(codebasePath);
            return null;
        },
        recoverStaleIndexingStateIfNeeded: async () => undefined,
        getSnapshotIndexingCodebases: () => lifecycle === "indexing" ? [repoPath] : [],
        getSnapshotCodebaseInfo: () => lifecycle === "not_found" ? undefined : lifecycle === "indexed" || (options.initialIndexed && lifecycle === "indexing") ? {
            status: lifecycle,
            indexedFiles: 3,
            totalChunks: 9,
            indexStatus: 'completed',
            indexFingerprint: RUNTIME_FINGERPRINT,
            fingerprintSource: 'verified',
            collectionName: resolveCollectionName(repoPath),
        } : { status: lifecycle },
        getSnapshotIndexedCodebases: () => lifecycle === "indexed" ? [repoPath] : [],
        buildManageActionBlockedMessage: () => "blocked",
        buildCreateHint: () => ({}),
        buildReindexHint: () => ({}),
        buildStatusHint: () => ({}),
        getManageRetryAfterMs: () => 2000,
        buildIndexingMetadata: () => undefined,
        buildReindexInstruction: () => "reindex",
        buildManageRequiresReindexHints: () => ({}),
        validateCompletionProof: async () => ({ outcome: "stale_local", reason: "missing_marker_doc" }),
        recoverIndexedSnapshotFromCompletionProof: async () => false,
        isZillizBackend: () => false,
        resolveCollectionName,
        dropZillizCollectionForCreate: async () => ({ status: "unmapped" }),
        resolveStagedCollectionName: (codebasePath: string, generationId: string) => `${resolveCollectionName(codebasePath)}__gen_${generationId}`,
        buildCollectionLimitMessage: async () => "collection limit",
        manageVectorBackendResponse: () => ({ content: [{ type: "text", text: "backend error" }] }),
        saveSnapshotIfSupported: () => {
            saveCalls += 1;
        },
        touchWatchedCodebase: options.touchWatchedCodebase ?? (async () => undefined),
        setWriteCollectionOverride: (_codebasePath: string, collectionName: string | null) => {
            writeCollectionOverride = collectionName;
        },
        loadIndexProfileForCodebase: () => ({ profile: "default" }),
        getContextActiveIgnorePatterns: () => [],
        getContextIndexedExtensions: () => [".ts"],
        canonicalizeCodebasePath: (codebasePath: string) => {
            canonicalizeCalls += 1;
            return options.canonicalizeCodebasePath?.(codebasePath) ?? fs.realpathSync(codebasePath);
        },
        pruneIndexedCollectionFamily: async () => [],
        pruneUnprovenStagedCollectionFamily: async () => [],
        getContextTrackedRelativePaths: () => [],
        setIndexingStats: () => undefined,
        rebuildCallGraphForIndex: async () => undefined,
        getSnapshotIndexingProgress: () => 0,
        clearIndexCompletionMarker: async () => undefined,
        evaluateReindexPreflight: (codebasePath: string) => {
            preflightRoots.push(codebasePath);
            return { outcome: "unknown", warnings: [] };
        },
        assertIndexMutationCapabilities: () => options.assertIndexMutationCapabilities?.(coordinator),
        mutationLeaseCoordinator: coordinator,
    } as unknown as ConstructorParameters<typeof ManageIndexingHandlers>[0]);

    return {
        coordinator,
        handler,
        launchedRoots,
        get canonicalizeCalls() {
            return canonicalizeCalls;
        },
        get failedCalls() {
            return failedCalls;
        },
        failedRoots,
        get lifecycle() {
            return lifecycle;
        },
        ownerCheckedRoots,
        preflightRoots,
        get preparedReceipt() {
            return preparedReceipt;
        },
        get saveCalls() {
            return saveCalls;
        },
        get writeCollectionOverride() {
            return writeCollectionOverride;
        },
    };
}


test("handleIndexCodebase launcher releases an injected worker lease exactly once", async () => {
    await withTempRepo(async (repoPath) => {
        let finishWorker!: () => void;
        const worker = new Promise<void>((resolve) => { finishWorker = resolve; });
        const harness = createIndexLaunchHarness(repoPath, {
            startBackgroundIndexing: () => worker,
        });
        const originalRelease = harness.coordinator.release.bind(harness.coordinator);
        let releaseCalls = 0;
        harness.coordinator.release = (lease) => {
            releaseCalls += 1;
            return originalRelease(lease);
        };

        const response = await harness.handler.handleIndexCodebase({ path: repoPath });
        const payload = JSON.parse(response.content[0].text);
        const activeLease = harness.coordinator.getActiveLease(repoPath);
        assert.equal(payload.status, "ok");
        assert.ok(activeLease);
        assert.equal(releaseCalls, 0);

        finishWorker();
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(harness.coordinator.getActiveLease(repoPath), undefined);
        assert.equal(releaseCalls, 1);
    });
});

test("handleIndexCodebase launcher publishes failed lifecycle when an injected worker rejects", async () => {
    await withTempRepo(async (repoPath) => {
        let rejectWorker!: (error: Error) => void;
        const worker = new Promise<void>((_resolve, reject) => { rejectWorker = reject; });
        const harness = createIndexLaunchHarness(repoPath, {
            startBackgroundIndexing: () => worker,
        });

        const response = await harness.handler.handleIndexCodebase({ path: repoPath });
        assert.equal(JSON.parse(response.content[0].text).status, "ok");

        rejectWorker(new Error("injected worker failed"));
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(harness.lifecycle, "indexfailed");
        assert.equal(harness.failedCalls, 1);
        assert.equal(harness.saveCalls, 2);
        assert.equal(harness.coordinator.getActiveLease(repoPath), undefined);
    });
});

test("handleIndexCodebase validates mutation capabilities before acquiring a lease", async () => {
    await withTempRepo(async (repoPath) => {
        let capabilityChecks = 0;
        let leaseWasActiveDuringCapabilityCheck = false;
        const harness = createIndexLaunchHarness(repoPath, {
            assertIndexMutationCapabilities: (coordinator) => {
                capabilityChecks += 1;
                leaseWasActiveDuringCapabilityCheck = coordinator.getActiveLease(repoPath) !== undefined;
                throw new Error("mutation capabilities unavailable");
            },
        });

        const response = await harness.handler.handleIndexCodebase({ path: repoPath });
        const payload = JSON.parse(response.content[0].text);

        assert.equal(payload.status, "error");
        assert.match(payload.message, /mutation capabilities unavailable/i);
        assert.equal(capabilityChecks, 1);
        assert.equal(leaseWasActiveDuringCapabilityCheck, false);
        assert.equal(harness.lifecycle, "not_found");
        assert.equal(harness.saveCalls, 0);
        assert.deepEqual(harness.launchedRoots, []);
        assert.equal(harness.coordinator.getActiveLease(repoPath), undefined);
    });
});

test("handleIndexCodebase foreground failure after indexing publication becomes indexfailed", async () => {
    await withTempRepo(async (repoPath) => {
        const harness = createIndexLaunchHarness(repoPath, {
            touchWatchedCodebase: async () => {
                throw new Error("watcher setup failed");
            },
        });

        const response = await harness.handler.handleIndexCodebase({ path: repoPath });
        const payload = JSON.parse(response.content[0].text);

        assert.equal(payload.status, "error");
        assert.match(payload.message, /watcher setup failed/i);
        assert.equal(harness.lifecycle, "indexfailed");
        assert.equal(harness.failedCalls, 1);
        assert.equal(harness.saveCalls, 2);
        assert.equal(harness.launchedRoots.length, 0);
        assert.equal(harness.preparedReceipt, null);
        assert.equal(harness.writeCollectionOverride, null);
        assert.equal(harness.coordinator.getActiveLease(repoPath), undefined);
    });
});

test("handleIndexCodebase restores a live proven generation when force-reindex launch fails", async () => {
    await withTempRepo(async (repoPath) => {
        const harness = createIndexLaunchHarness(repoPath, {
            initialIndexed: true,
            touchWatchedCodebase: async () => {
                throw new Error("watcher setup failed");
            },
        });

        const response = await harness.handler.handleIndexCodebase({ path: repoPath, force: true });
        const payload = JSON.parse(response.content[0].text);

        assert.equal(payload.status, "error");
        assert.equal(harness.lifecycle, "indexed");
        assert.equal(harness.failedCalls, 0);
        assert.equal(harness.launchedRoots.length, 0);
    });
});

test("handleIndexCodebase keeps the canonical root when foreground publication fails", async () => {
    await withTempRepo(async (repoPath) => {
        const aliasPath = path.join(path.dirname(repoPath), "repo-failure-alias");
        fs.symlinkSync(repoPath, aliasPath, "dir");
        const harness = createIndexLaunchHarness(repoPath, {
            canonicalizeCodebasePath: (candidate) => fs.realpathSync(candidate),
            touchWatchedCodebase: async () => {
                throw new Error("watcher setup failed");
            },
        });

        const response = await harness.handler.handleIndexCodebase({ path: aliasPath });
        const payload = JSON.parse(response.content[0].text);

        assert.equal(payload.status, "error");
        assert.equal(payload.path, repoPath);
        assert.deepEqual(harness.failedRoots, [repoPath]);
        assert.equal(harness.canonicalizeCalls, 1);
    });
});

test("handleIndexCodebase canonicalizes the root once before lifecycle and launch", async () => {
    await withTempRepo(async (repoPath) => {
        const aliasPath = path.join(path.dirname(repoPath), "repo-alias");
        fs.symlinkSync(repoPath, aliasPath, "dir");
        const harness = createIndexLaunchHarness(repoPath, {
            canonicalizeCodebasePath: (candidate) => fs.realpathSync(candidate),
        });

        const response = await harness.handler.handleIndexCodebase({ path: aliasPath });
        const payload = JSON.parse(response.content[0].text);
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(payload.status, "ok");
        assert.equal(payload.path, repoPath);
        assert.deepEqual(harness.launchedRoots, [repoPath]);
        assert.equal(harness.canonicalizeCalls, 1);
    });
});

test("handleReindexCodebase canonicalizes once before ownership, preflight, and launch", async () => {
    await withTempRepo(async (repoPath) => {
        const aliasPath = path.join(path.dirname(repoPath), "repo-reindex-alias");
        fs.symlinkSync(repoPath, aliasPath, "dir");
        const harness = createIndexLaunchHarness(repoPath, {
            canonicalizeCodebasePath: (candidate) => fs.realpathSync(candidate),
        });

        const response = await harness.handler.handleReindexCodebase({ path: aliasPath });
        const payload = JSON.parse(response.content[0].text);
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(payload.status, "ok");
        assert.equal(payload.path, repoPath);
        assert.equal(harness.canonicalizeCalls, 1);
        assert.deepEqual(harness.preflightRoots, [repoPath]);
        assert.ok(harness.ownerCheckedRoots.length > 0);
        assert.ok(harness.ownerCheckedRoots.every((candidate) => candidate === repoPath));
        assert.deepEqual(harness.launchedRoots, [repoPath]);
    });
});

test("handleIndexCodebase synchronous startBackgroundIndexing throw does not transfer lease ownership", async () => {
    await withTempRepo(async (repoPath) => {
        let releaseCalls = 0;
        let startCalls = 0;
        const harness = createIndexLaunchHarness(repoPath, {
            startBackgroundIndexing: () => {
                startCalls += 1;
                throw new Error("synchronous startBackgroundIndexing throw");
            },
        });
        const originalRelease = harness.coordinator.release.bind(harness.coordinator);
        harness.coordinator.release = (lease) => {
            releaseCalls += 1;
            return originalRelease(lease);
        };

        const response = await harness.handler.handleIndexCodebase({ path: repoPath });
        const payload = JSON.parse(response.content[0].text);

        assert.equal(payload.status, "error");
        assert.match(payload.message, /synchronous startBackgroundIndexing throw/i);
        assert.equal(startCalls, 1);
        assert.equal(harness.lifecycle, "indexfailed");
        assert.equal(harness.failedCalls, 1);
        assert.equal(harness.preparedReceipt, null);
        assert.equal(harness.coordinator.getActiveLease(repoPath), undefined);
        assert.equal(releaseCalls, 1);
    });
});

test("handleIndexCodebase asynchronous startBackgroundIndexing rejection transfers lease ownership to background handler", async () => {
    await withTempRepo(async (repoPath) => {
        let rejectWorker!: (error: Error) => void;
        const worker = new Promise<void>((_resolve, reject) => { rejectWorker = reject; });
        const harness = createIndexLaunchHarness(repoPath, {
            startBackgroundIndexing: () => worker,
        });
        let releaseCalls = 0;
        const originalRelease = harness.coordinator.release.bind(harness.coordinator);
        harness.coordinator.release = (lease) => {
            releaseCalls += 1;
            return originalRelease(lease);
        };

        const response = await harness.handler.handleIndexCodebase({ path: repoPath });
        const payload = JSON.parse(response.content[0].text);
        assert.equal(payload.status, "ok");
        assert.match(payload.message, /Started background indexing/i);
        assert.equal(releaseCalls, 0);
        assert.ok(harness.coordinator.getActiveLease(repoPath));

        rejectWorker(new Error("asynchronous background failure"));
        await new Promise((resolve) => setImmediate(resolve));

        assert.equal(harness.lifecycle, "indexfailed");
        assert.equal(harness.failedCalls, 1);
        assert.equal(harness.coordinator.getActiveLease(repoPath), undefined);
        assert.equal(releaseCalls, 1);
    });
});

test("handleRepairIndex saves the manifest paths verified by repair", async () => {
    await withTempRepo(async (repoPath) => {
        let manifestPaths: string[] | null = null;
        let repairOptions: Record<string, unknown> | undefined;
        const handler = new ManageIndexingHandlers({
            indexMutationPort: testIndexMutationPort({
                repairIndex: async (_codebasePath: string, options?: Record<string, unknown>) => {
                    repairOptions = options;
                    return {
                        status: "ok",
                        message: "repaired",
                        indexedFiles: 1,
                        totalChunks: 2,
                        warnings: [],
                        trackedRelativePaths: ["src/repaired.ts"],
                        collectionName: "snapshot-selected-collection",
                    };
                },
                proveIndexedGeneration: async () => provenRepairGeneration(
                    "snapshot-selected-collection",
                ),
            }),
            sourceFreshnessPort: testSourceFreshnessPort({
                inspectSourceFreshnessCheckpoint: async () => ({
                    status: "valid",
                    documentDigest: "c".repeat(64),
                }),
            }),
            snapshotManager: {
                setCodebaseIndexed: () => undefined,
                setCodebaseIndexManifest: (_codebasePath: string, paths: string[]) => {
                    manifestPaths = paths;
                },
            },
            syncManager: {},
            runtimeFingerprint: RUNTIME_FINGERPRINT,
            manageResponse: (action: string, responsePath: string, status: string, message: string, options?: Record<string, unknown>) => ({
                content: [{ type: "text", text: JSON.stringify({ action, path: responsePath, status, message, ...options }) }],
            }),
            buildRuntimeOwnerConflictResponseIfBlocked: async () => null,
            recoverStaleIndexingStateIfNeeded: async () => undefined,
            getSnapshotIndexingCodebases: () => [],
            getSnapshotCodebaseInfo: () => ({
                status: "indexed",
                lastUpdated: new Date(0).toISOString(),
                collectionName: "snapshot-selected-collection",
                indexFingerprint: RUNTIME_FINGERPRINT,
                fingerprintSource: "verified",
            }),
            getSnapshotIndexedCodebases: () => [],
            buildManageActionBlockedMessage: () => "blocked",
            buildCreateHint: (codebasePath: string) => ({ tool: "manage_index", args: { action: "create", path: codebasePath } }),
            buildStatusHint: (codebasePath: string) => ({ tool: "manage_index", args: { action: "status", path: codebasePath } }),
            getManageRetryAfterMs: () => 2000,
            buildIndexingMetadata: () => undefined,
            buildReindexInstruction: () => "reindex",
            buildManageRequiresReindexHints: () => ({}),
            validateCompletionProof: async () => ({ outcome: "missing_collection" }),
            recoverIndexedSnapshotFromCompletionProof: () => false,
            isZillizBackend: () => false,
            resolveCollectionName,
            dropZillizCollectionForCreate: async () => ({}),
            resolveStagedCollectionName: (codebasePath: string, generationId: string) => `${resolveCollectionName(codebasePath)}__gen_${generationId}`,
            buildCollectionLimitMessage: async () => "collection limit",
            manageVectorBackendResponse: (action: string, responsePath: string) => ({
                content: [{ type: "text", text: JSON.stringify({ action, path: responsePath, status: "error" }) }],
            }),
            saveSnapshotIfSupported: () => undefined,
            touchWatchedCodebase: async () => undefined,
            setWriteCollectionOverride: () => undefined,
            loadIndexProfileForCodebase: () => ({ profile: "default" }),
            getContextActiveIgnorePatterns: () => [],
            getContextIndexedExtensions: () => [".ts"],
            canonicalizeCodebasePath: (codebasePath: string) => path.resolve(codebasePath),
            pruneIndexedCollectionFamily: async () => [],
            pruneUnprovenStagedCollectionFamily: async () => [],
            getContextTrackedRelativePaths: () => ["stale/from-context.ts"],
            setIndexingStats: () => undefined,
            rebuildCallGraphForIndex: async () => undefined,
            getSnapshotIndexingProgress: () => undefined,
            clearIndexCompletionMarker: async () => undefined,
            evaluateReindexPreflight: () => ({ allowed: true }),
        } as unknown as ConstructorParameters<typeof ManageIndexingHandlers>[0]);

        const response = await handler.handleRepairIndex({ path: repoPath });
        const payload = JSON.parse(response.content[0].text);

        assert.equal(payload.status, "ok");
        assert.deepEqual(manifestPaths, ["src/repaired.ts"]);
        assert.equal(typeof repairOptions?.onProofUpdate, "function");
        const proofOptions = { ...(repairOptions || {}) };
        delete proofOptions.onProofUpdate;
        assert.deepEqual(proofOptions, {
            snapshotEvidence: {
                status: "verified",
                basis: "verified_snapshot_fingerprint",
                fingerprint: RUNTIME_FINGERPRINT,
            },
            preferredCollectionName: "snapshot-selected-collection",
        });
    });
});

test("handleRepairIndex recovers abandoned indexing before the indexing gate", async () => {
    await withTempRepo(async (repoPath) => {
        let recoverCalls = 0;
        let indexingProbeCalls = 0;
        let stillIndexing = true;
        const handler = new ManageIndexingHandlers({
            indexMutationPort: testIndexMutationPort({
                repairIndex: async () => ({
                    status: "ok",
                    message: "repaired",
                    indexedFiles: 1,
                    totalChunks: 2,
                    warnings: [],
                    trackedRelativePaths: ["src/repaired.ts"],
                    collectionName: "snapshot-selected-collection",
                    proof: {
                        collection: { status: "matched" },
                        snapshot: { status: "matched" },
                        marker: { status: "matched" },
                        fingerprint: { status: "matched" },
                        payload: { status: "matched" },
                        staleRemoteChunks: { status: "matched" },
                        navigation: { status: "not_checked" },
                    },
                }),
                proveIndexedGeneration: async () => provenRepairGeneration(
                    "snapshot-selected-collection",
                ),
            }),
            sourceFreshnessPort: testSourceFreshnessPort({
                inspectSourceFreshnessCheckpoint: async () => ({
                    status: "valid",
                    documentDigest: "c".repeat(64),
                }),
            }),
            snapshotManager: {
                setCodebaseIndexed: () => undefined,
                setCodebaseIndexManifest: () => undefined,
            },
            syncManager: {},
            runtimeFingerprint: RUNTIME_FINGERPRINT,
            manageResponse: (action: string, responsePath: string, status: string, message: string, options?: Record<string, unknown>) => ({
                content: [{ type: "text", text: JSON.stringify({ action, path: responsePath, status, message, ...options }) }],
            }),
            buildRuntimeOwnerConflictResponseIfBlocked: async () => null,
            recoverStaleIndexingStateIfNeeded: async () => {
                recoverCalls += 1;
                stillIndexing = false;
            },
            getSnapshotIndexingCodebases: () => {
                indexingProbeCalls += 1;
                return stillIndexing ? [repoPath] : [];
            },
            getSnapshotCodebaseInfo: () => ({
                status: "indexed",
                collectionName: "snapshot-selected-collection",
                indexFingerprint: RUNTIME_FINGERPRINT,
                fingerprintSource: "verified",
            }),
            buildStatusHint: (codebasePath: string) => ({ tool: "manage_index", args: { action: "status", path: codebasePath } }),
            getManageRetryAfterMs: () => 2000,
            buildIndexingMetadata: () => undefined,
            buildManageActionBlockedMessage: () => "blocked-by-indexing",
            buildReindexInstruction: () => "reindex",
            buildManageRequiresReindexHints: () => ({}),
            buildCreateHint: (codebasePath: string) => ({ tool: "manage_index", args: { action: "create", path: codebasePath } }),
            getContextTrackedRelativePaths: () => [],
            setIndexingStats: () => undefined,
            rebuildCallGraphForIndex: async () => undefined,
            touchWatchedCodebase: async () => undefined,
            saveSnapshotIfSupported: () => undefined,
            getSnapshotIndexingProgress: () => undefined,
            clearIndexCompletionMarker: async () => undefined,
        } as unknown as ConstructorParameters<typeof ManageIndexingHandlers>[0]);

        const response = await handler.handleRepairIndex({ path: repoPath });
        const payload = JSON.parse(response.content[0].text);

        assert.equal(recoverCalls, 1);
        assert.ok(indexingProbeCalls >= 1);
        assert.equal(payload.status, "ok");
        assert.notEqual(payload.reason, "indexing");
    });
});

test("handleRepairIndex does not publish success after lease loss during exact generation proof", async () => {
    await withTempRepo(async (repoPath) => {
        const coordinator = new MutationLeaseCoordinator({
            stateDir: path.join(path.dirname(repoPath), "lease-state"),
            ownerId: "owner-a",
        });
        let indexedCalls = 0;
        let saveCalls = 0;
        const handler = new ManageIndexingHandlers({
            indexMutationPort: testIndexMutationPort({
                repairIndex: async () => ({
                    status: "ok",
                    message: "repaired",
                    indexedFiles: 1,
                    totalChunks: 2,
                    warnings: [],
                    trackedRelativePaths: ["src/repaired.ts"],
                    collectionName: "snapshot-selected-collection",
                }),
                proveIndexedGeneration: async () => {
                    const lease = coordinator.getActiveLease(repoPath);
                    assert.ok(lease);
                    coordinator.release(lease);
                    return provenRepairGeneration("snapshot-selected-collection");
                },
            }),
            snapshotManager: {
                setCodebaseIndexed: () => { indexedCalls += 1; },
                setCodebaseIndexManifest: () => undefined,
            },
            syncManager: {},
            runtimeFingerprint: RUNTIME_FINGERPRINT,
            manageResponse: (action: string, responsePath: string, status: string, message: string) => ({
                content: [{ type: "text", text: JSON.stringify({ action, path: responsePath, status, message }) }],
            }),
            buildRuntimeOwnerConflictResponseIfBlocked: async () => null,
            recoverStaleIndexingStateIfNeeded: async () => undefined,
            getSnapshotIndexingCodebases: () => [],
            getSnapshotCodebaseInfo: () => ({
                status: "indexed",
                collectionName: "snapshot-selected-collection",
                indexFingerprint: RUNTIME_FINGERPRINT,
                fingerprintSource: "verified",
            }),
            buildStatusHint: (codebasePath: string) => ({ tool: "manage_index", args: { action: "status", path: codebasePath } }),
            getManageRetryAfterMs: () => 2000,
            buildIndexingMetadata: () => undefined,
            buildReindexInstruction: () => "reindex",
            buildManageRequiresReindexHints: () => ({}),
            buildCreateHint: (codebasePath: string) => ({ tool: "manage_index", args: { action: "create", path: codebasePath } }),
            getContextTrackedRelativePaths: () => [],
            setIndexingStats: () => undefined,
            rebuildCallGraphForIndex: async () => {
                throw new Error("legacy call graph rebuild must not run");
            },
            touchWatchedCodebase: async () => undefined,
            saveSnapshotIfSupported: () => { saveCalls += 1; },
            getSnapshotIndexingProgress: () => undefined,
            clearIndexCompletionMarker: async () => undefined,
            mutationLeaseCoordinator: coordinator,
        } as unknown as ConstructorParameters<typeof ManageIndexingHandlers>[0]);

        const response = await handler.handleRepairIndex({ path: repoPath });
        const payload = JSON.parse(response.content[0].text);

        assert.equal(payload.status, "error");
        assert.match(payload.message, /mutation lease .* is no longer current/i);
        assert.equal(indexedCalls, 0);
        assert.equal(saveCalls, 0);
    });
});

test("handleRepairIndex durably accepts before repair and commits completed receipt with lifecycle", async () => {
    await withTempRepo(async (repoPath) => {
        let repairPublicationRan = false;
        const harness = createRepairReceiptHarness(repoPath, {
            repairIndex: async (repairOptions) => {
                assert.equal(typeof repairOptions?.assertMutationCurrent, "function");
                assert.equal(typeof repairOptions?.publishMutation, "function");
                assert.equal(repairOptions?.publicationAuthority?.ownerId, "repair-receipt-owner");
                assert.equal(repairOptions?.publicationAuthority?.generation, 1);
                assert.equal(
                    repairOptions?.publicationAuthority?.operationId,
                    harness.coordinator?.getActiveLease(repoPath)?.operationId,
                );
                repairOptions?.publishMutation?.(() => {
                    repairPublicationRan = true;
                });
                return {
                    status: "ok",
                    message: "repaired",
                    indexedFiles: 1,
                    totalChunks: 2,
                    warnings: [],
                    trackedRelativePaths: ["src/repaired.ts"],
                    collectionName: "repair-collection",
                    proof: REPAIR_PROOF,
                };
            },
        });

        const response = await harness.handler.handleRepairIndex({ path: repoPath });
        const payload = JSON.parse(response.content[0].text) as {
            status: string;
            operation?: IndexOperationReceipt;
        };

        assert.equal(payload.status, "ok");
        assert.equal(payload.operation?.phase, "completed");
        assert.deepEqual(
            harness.persisted.map((entry) => entry.phase),
            ["accepted", "proving", "publishing", "completed"],
        );
        assert.equal(harness.persisted.at(-1)?.indexed, true);
        assert.equal(repairPublicationRan, true);
        assert.ok(harness.events.indexOf("save:accepted") < harness.events.indexOf("repair"));
        assert.ok(harness.events.indexOf("save:proving") < harness.events.indexOf("repair"));
        assert.ok(harness.events.indexOf("set:indexed") < harness.events.indexOf("save:completed"));
        assert.equal(harness.coordinator?.getActiveLease(repoPath), undefined);
    });
});

test("handleRepairIndex accepts a relationship-only repair only after exact generation and checkpoint proof", async () => {
    await withTempRepo(async (repoPath) => {
        const proven = provenRepairGeneration();
        const harness = createRepairReceiptHarness(repoPath, {
            repairIndex: async () => ({
                status: "ok",
                message: "relationship navigation repaired",
                indexedFiles: 1,
                totalChunks: 2,
                warnings: [],
                trackedRelativePaths: ["src/repaired.ts"],
                collectionName: proven.collectionName,
                proof: REPAIR_PROOF,
                activatedGeneration: {
                    collectionName: proven.collectionName,
                    markerRunId: proven.marker.runId,
                    sourceCheckpointDocumentDigest: "c".repeat(64),
                    relationshipVersion: RUNTIME_FINGERPRINT.relationshipVersion!,
                    navigation: {
                        generationId: proven.navigation.generationId,
                        sealHash: proven.navigation.navigationSealHash,
                        symbolRegistryManifestHash:
                            proven.navigation.symbolRegistryManifestHash,
                        relationshipManifestHash:
                            proven.navigation.relationshipManifestHash,
                    },
                },
            }),
            proveIndexedGeneration: async () => proven,
        });

        const response = await harness.handler.handleRepairIndex({ path: repoPath });
        const payload = JSON.parse(response.content[0].text) as {
            status: string;
            repairProof?: typeof REPAIR_PROOF;
        };

        assert.equal(payload.status, "ok");
        assert.equal(
            payload.repairProof?.navigation.basis,
            "activated_generation_proven",
        );
        assert.equal(harness.events.includes("rebuild:call-graph"), false);
    });
});

test("handleRepairIndex rejects generic repair success when the effective source checkpoint is invalid", async () => {
    await withTempRepo(async (repoPath) => {
        const harness = createRepairReceiptHarness(repoPath, {
            inspectSourceFreshnessCheckpoint: async () => ({
                status: "corrupt",
            }),
        });

        const response = await harness.handler.handleRepairIndex({ path: repoPath });
        const payload = JSON.parse(response.content[0].text) as {
            status: string;
            message?: string;
            operation?: IndexOperationReceipt;
        };

        assert.equal(payload.status, "error");
        assert.match(payload.message ?? "", /did not preserve a valid source checkpoint/i);
        assert.equal(payload.operation?.phase, "failed");
        assert.equal(harness.persisted.at(-1)?.indexed, false);
    });
});

test("handleRepairIndex refuses repair side effects when accepted receipt is not durable", async () => {
    await withTempRepo(async (repoPath) => {
        const harness = createRepairReceiptHarness(repoPath, { failAcceptedSave: true });

        const response = await harness.handler.handleRepairIndex({ path: repoPath });
        const payload = JSON.parse(response.content[0].text) as {
            status: string;
            operation?: IndexOperationReceipt;
        };

        assert.equal(payload.status, "error");
        assert.equal(payload.operation?.phase, "failed");
        assert.equal(harness.repairCalls, 0);
        assert.deepEqual(harness.persisted.map((entry) => entry.phase), ["failed"]);
        assert.equal(harness.coordinator?.getActiveLease(repoPath), undefined);
    });
});

test("handleRepairIndex publishes blocked receipt when proof requires reindex", async () => {
    await withTempRepo(async (repoPath) => {
        const harness = createRepairReceiptHarness(repoPath, {
            repairIndex: async () => ({
                status: "requires_reindex",
                reason: "requires_reindex",
                message: "fingerprint mismatch",
                proof: {
                    ...REPAIR_PROOF,
                    marker: { status: "failed", basis: "completion_marker_fingerprint_mismatch" },
                    fingerprint: { status: "failed", basis: "completion_marker_fingerprint_mismatch" },
                    payload: { status: "not_checked" },
                    staleRemoteChunks: { status: "not_checked" },
                    navigation: { status: "not_checked" },
                },
            }),
        });

        const response = await harness.handler.handleRepairIndex({ path: repoPath });
        const payload = JSON.parse(response.content[0].text) as {
            status: string;
            operation?: IndexOperationReceipt;
            repairProof?: typeof REPAIR_PROOF;
            hints?: Record<string, unknown>;
        };

        assert.equal(payload.status, "requires_reindex");
        assert.equal(payload.operation?.phase, "blocked");
        assert.equal(payload.repairProof?.marker.status, "failed");
        assert.deepEqual(payload.hints?.nextAction, {
            tool: "manage_index",
            args: { action: "reindex", path: repoPath },
        });
        assert.equal(harness.persisted.at(-1)?.phase, "blocked");
        assert.equal(harness.coordinator?.getActiveLease(repoPath), undefined);
    });
});

test("handleRepairIndex publishes blocked proof-limit receipt without remediation hints", async () => {
    await withTempRepo(async (repoPath) => {
        const harness = createRepairReceiptHarness(repoPath, {
            repairIndex: (async () => ({
                status: "blocked",
                reason: "repair_proof_limit",
                message: "backend cannot prove one stable payload state",
                proof: {
                    ...REPAIR_PROOF,
                    payload: { status: "unproven", basis: "same_state_payload_authority_unavailable" },
                    staleRemoteChunks: { status: "unproven", basis: "same_state_payload_authority_unavailable" },
                    navigation: { status: "not_checked" },
                },
            })) as unknown as (repairOptions?: RepairOptionsLike) => Promise<RepairResult>,
        });

        const response = await harness.handler.handleRepairIndex({ path: repoPath });
        const payload = JSON.parse(response.content[0].text) as {
            version: number;
            status: string;
            reason?: string;
            hints?: Record<string, unknown>;
            operation?: IndexOperationReceipt;
            repairProof?: typeof REPAIR_PROOF;
        };

        assert.equal(payload.status, "blocked");
        assert.equal(payload.reason, "repair_proof_limit");
        assert.equal(payload.operation?.phase, "blocked");
        assert.equal(payload.repairProof?.payload.status, "unproven");
        assert.equal(payload.hints, undefined);
        assert.equal(harness.persisted.at(-1)?.phase, "blocked");
        assert.equal(harness.coordinator?.getActiveLease(repoPath), undefined);
    });
});

test("handleRepairIndex publishes failed receipt when repair throws", async () => {
    await withTempRepo(async (repoPath) => {
        const harness = createRepairReceiptHarness(repoPath, {
            repairIndex: async () => {
                throw new Error("repair exploded");
            },
        });

        const response = await harness.handler.handleRepairIndex({ path: repoPath });
        const payload = JSON.parse(response.content[0].text) as {
            status: string;
            operation?: IndexOperationReceipt;
        };

        assert.equal(payload.status, "error");
        assert.equal(payload.operation?.phase, "failed");
        assert.equal(harness.persisted.at(-1)?.phase, "failed");
        assert.equal(harness.coordinator?.getActiveLease(repoPath), undefined);
    });
});

test("handleRepairIndex preserves partial proof when the vector backend fails", async () => {
    await withTempRepo(async (repoPath) => {
        const harness = createRepairReceiptHarness(repoPath, {
            repairIndex: async (repairOptions) => {
                repairOptions?.onProofUpdate?.({
                    ...REPAIR_PROOF,
                    payload: { status: "not_checked" },
                    staleRemoteChunks: { status: "not_checked" },
                    navigation: { status: "not_checked" },
                });
                throw new Error("milvus connection closed during repair proof");
            },
        });

        const response = await harness.handler.handleRepairIndex({ path: repoPath });
        const payload = JSON.parse(response.content[0].text) as {
            status: string;
            code?: string;
            repairProof?: typeof REPAIR_PROOF;
            operation?: IndexOperationReceipt;
        };

        assert.equal(payload.status, "error");
        assert.equal(payload.code, "VECTOR_BACKEND_CONNECTION_CLOSED");
        assert.equal(payload.operation?.phase, "failed");
        assert.equal(payload.repairProof?.collection.status, "matched");
        assert.equal(payload.repairProof?.navigation.status, "not_checked");
        assert.equal(harness.coordinator?.getActiveLease(repoPath), undefined);
    });
});

test("handleRepairIndex treats watcher touch as best effort after navigation proof", async () => {
    await withTempRepo(async (repoPath) => {
        const harness = createRepairReceiptHarness(repoPath, {
            touchWatchedCodebase: async () => {
                throw new Error("watcher touch failed");
            },
        });

        const response = await harness.handler.handleRepairIndex({ path: repoPath });
        const payload = JSON.parse(response.content[0].text) as {
            status: string;
            message: string;
            repairProof?: typeof REPAIR_PROOF;
            operation?: IndexOperationReceipt;
        };

        assert.equal(payload.status, "ok");
        assert.equal(payload.operation?.phase, "completed");
        assert.equal(payload.repairProof?.navigation.status, "matched");
        assert.equal(payload.repairProof?.navigation.basis, "activated_generation_proven");
    });
});

test("handleRepairIndex without lease capability does not fabricate a receipt", async () => {
    await withTempRepo(async (repoPath) => {
        const harness = createRepairReceiptHarness(repoPath, { withLease: false });

        const response = await harness.handler.handleRepairIndex({ path: repoPath });
        const payload = JSON.parse(response.content[0].text) as {
            status: string;
            operation?: IndexOperationReceipt;
        };

        assert.equal(payload.status, "ok");
        assert.equal(payload.operation, undefined);
        assert.deepEqual(harness.persisted, []);
        assert.equal(harness.compatibilitySaveCalls, 1);
    });
});
