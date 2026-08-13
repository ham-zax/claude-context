import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SyncManager, SyncOperationError } from './sync.js';
import {
    AtomicIncrementalPublicationUnsupportedError,
} from '@zokizuan/satori-core';
import {
    MutationLeaseCoordinator,
    type MutationLeaseProcessSnapshot,
    type RootMutationLease,
} from './mutation-lease.js';
import {
    BACKGROUND_FRESHNESS_THRESHOLD_MS,
    DEFAULT_WATCH_DEBOUNCE_MS,
    type IndexFingerprint,
    type IndexOperationReceipt,
} from '../config.js';

type CodebaseStatus = 'indexed' | 'indexing' | 'indexfailed' | 'sync_completed' | 'requires_reindex' | 'not_found';
type SyncContext = ConstructorParameters<typeof SyncManager>[0];
type SyncSnapshotManager = ConstructorParameters<typeof SyncManager>[1];
type SyncManagerTestAccess = {
    backgroundSyncEnabled: boolean;
    backgroundSyncTimer: NodeJS.Timeout | null;
    runBackgroundSync(): Promise<void>;
    handleSyncIndex(): Promise<void>;
    ensureFreshness(codebasePath: string, thresholdMs: number): Promise<{ mode: 'synced' }>;
    watcherModeStarted: boolean;
    watchers: Map<string, { close: () => Promise<void> | void }>;
    watchedCodebases: Set<string>;
    watcherLifecycleStates: Map<string, 'starting' | 'ready' | 'failed' | 'stopped'>;
    watcherObservations: Map<string, {
        observedEventEpoch: number;
        comparedThroughEventEpoch: number;
        latestEpochByReason: Map<'source_changed' | 'ignore_rules_changed' | 'directory_changed', number>;
        coverage: 'starting' | 'ready' | 'failed' | 'stopped' | 'disabled';
        coverageGapSinceEpoch?: number;
        lastEventAt?: number;
        lastWatcherError?: string;
    }>;
    setWatcherCoverage(
        codebasePath: string,
        coverage: 'starting' | 'ready' | 'failed' | 'stopped' | 'disabled',
        error?: string,
    ): void;
    watcherIgnoreMatchers: Map<string, unknown>;
    shouldIgnoreWatchPath(codebasePath: string, filePath: string): boolean;
    isIgnoreRuleControlFile(relativePath: string): boolean;
    touchWatchedCodebase(
        codebasePath: string,
        candidatePolicy?: { policyHash: string; effectiveIgnorePatterns: readonly string[] },
    ): Promise<void>;
    restoreActiveWatcherPolicy(
        codebasePath: string,
        candidatePolicyHash: string,
    ): Promise<boolean>;
    captureWatcherBootstrap(
        codebasePath: string,
        candidatePolicyHash: string,
    ): {
        canonicalRoot: string;
        watcherGeneration: number;
        observedEventEpoch: number;
        candidatePolicyHash: string;
    } | undefined;
    beginFullIndexSourceHandoff(
        codebasePath: string,
        input: {
            candidatePolicyHash: string;
            markerRunId: string;
        },
    ): void;
    rejectFullIndexSourceHandoff(
        codebasePath: string,
        input: {
            candidatePolicyHash: string;
            markerRunId: string;
        },
    ): boolean;
    completeFullIndexSourceHandoff(
        codebasePath: string,
        input: {
            capture: {
                canonicalRoot: string;
                watcherGeneration: number;
                observedEventEpoch: number;
                candidatePolicyHash: string;
            };
            candidatePolicyHash: string;
            checkpointObservation: string;
            provenGeneration: Record<string, unknown>;
        },
    ): Promise<boolean>;
    unwatchCodebase(codebasePath: string): Promise<void>;
    lastSyncTimes: Map<string, number>;
    ignoreRulesVersions: Map<string, number>;
    freshnessEpochs: Map<string, number>;
    sourceObservationState: {
        recordValidCheckpointObservation(codebasePath: string, observationToken: string): string | undefined;
        getCheckpointObservation(codebasePath: string): string | undefined;
    };
    handleWatcherError(codebasePath: string, error: unknown): Promise<void>;
};

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-sync-test-'));
}

function createSnapshot(statusByPath: Map<string, CodebaseStatus>) {
    const indexManifestByPath = new Map<string, string[]>();
    const ignoreRulesVersionByPath = new Map<string, number>();
    const ignoreControlSignatureByPath = new Map<string, string>();
    const requiresReindexByPath = new Map<string, { reason: string; message?: string }>();
    const receiptHistory: IndexOperationReceipt[] = [];
    let latestOperation: IndexOperationReceipt | undefined;
    const runtimeFingerprint: IndexFingerprint = {
        embeddingProvider: 'VoyageAI',
        embeddingModel: 'voyage-code-3',
        embeddingDimension: 1024,
        vectorStoreProvider: 'Milvus',
        schemaVersion: 'hybrid_v3',
    };

    return {
        getCodebaseStatus(codebasePath: string): CodebaseStatus {
            return statusByPath.get(codebasePath) || 'not_found';
        },
        getIndexedCodebases(): string[] {
            return Array.from(statusByPath.entries())
                .filter(([, status]) => status === 'indexed' || status === 'sync_completed')
                .map(([p]) => p);
        },
        setCodebaseSyncCompleted() { },
        setCodebaseIndexManifest(codebasePath: string, indexedPaths: string[]) {
            indexManifestByPath.set(codebasePath, indexedPaths.slice());
        },
        getCodebaseIndexedPaths(codebasePath: string): string[] {
            return indexManifestByPath.get(codebasePath)?.slice() || [];
        },
        setCodebaseIgnoreRulesVersion(codebasePath: string, version: number) {
            ignoreRulesVersionByPath.set(codebasePath, version);
        },
        getCodebaseIgnoreRulesVersion(codebasePath: string): number | undefined {
            return ignoreRulesVersionByPath.get(codebasePath);
        },
        setCodebaseIgnoreControlSignature(codebasePath: string, signature: string) {
            ignoreControlSignatureByPath.set(codebasePath, signature);
        },
        getCodebaseIgnoreControlSignature(codebasePath: string): string | undefined {
            return ignoreControlSignatureByPath.get(codebasePath);
        },
        getCodebaseRequiresReindex(codebasePath: string) {
            return requiresReindexByPath.get(codebasePath);
        },
        setCodebaseRequiresReindex(codebasePath: string, reason: string, message?: string) {
            statusByPath.set(codebasePath, 'requires_reindex');
            requiresReindexByPath.set(codebasePath, { reason, message });
        },
        startOperation(lease: RootMutationLease): IndexOperationReceipt {
            latestOperation = {
                id: lease.operationId,
                action: lease.action,
                canonicalRoot: lease.canonicalRoot,
                generation: lease.generation,
                acceptedAt: lease.acquiredAt,
                phase: 'accepted',
                lastDurableTransitionAt: lease.acquiredAt,
                runtimeFingerprint,
                writer: {
                    ownerId: lease.ownerId,
                    pid: lease.pid,
                    satoriVersion: 'test',
                },
            };
            return structuredClone(latestOperation);
        },
        transitionOperation(lease: RootMutationLease, phase: IndexOperationReceipt['phase']): IndexOperationReceipt {
            assert.equal(latestOperation?.id, lease.operationId);
            latestOperation = {
                ...latestOperation!,
                phase,
                lastDurableTransitionAt: new Date().toISOString(),
            };
            return structuredClone(latestOperation);
        },
        getLatestOperation(): IndexOperationReceipt | undefined {
            return latestOperation ? structuredClone(latestOperation) : undefined;
        },
        observeDurableLatestOperation(): IndexOperationReceipt | undefined {
            return latestOperation ? structuredClone(latestOperation) : undefined;
        },
        operationMatchesRuntimeFingerprint(receipt: IndexOperationReceipt): boolean {
            return JSON.stringify(receipt.runtimeFingerprint) === JSON.stringify(runtimeFingerprint);
        },
        getReceiptHistory(): IndexOperationReceipt[] {
            return structuredClone(receiptHistory);
        },
        saveCodebaseSnapshot() {
            if (latestOperation) {
                receiptHistory.push(structuredClone(latestOperation));
            }
            return true;
        },
        removeIndexedCodebase(codebasePath: string) {
            statusByPath.delete(codebasePath);
            indexManifestByPath.delete(codebasePath);
            ignoreRulesVersionByPath.delete(codebasePath);
            ignoreControlSignatureByPath.delete(codebasePath);
            requiresReindexByPath.delete(codebasePath);
        }
    };
}

function createContext() {
    let calls = 0;
    return {
        get calls() {
            return calls;
        },
        getActiveIgnorePatterns() {
            return ['node_modules/**', 'dist/**', '.git/**'];
        },
        hasSynchronizerForCodebase() {
            return false;
        },
        async reindexByChange() {
            calls += 1;
            return { added: 0, removed: 0, modified: 0 };
        }
    };
}

function buildProvenVectorGeneration(
    codebasePath: string,
    policyHash: string,
    collectionName = 'generation-candidate-v1',
) {
    return {
        collectionName,
        marker: {
            runId: 'marker-candidate-v1',
            indexStatus: 'completed' as const,
            indexedFiles: 1,
            totalChunks: 1,
            indexPolicyHash: policyHash,
        },
        policy: {
            canonicalRoot: path.resolve(codebasePath),
            policyHash,
            controlSignature: 'v1:candidate-control-signature',
        },
        policyDocumentDigest: 'a'.repeat(64),
        exactPayloadCount: 1,
        observations: {
            profileFileToken: null,
            policyFileToken: 'candidate-policy-file-token',
        },
    };
}

async function withCandidateWatcher<T>(
    options: {
        activeIgnorePatterns?: readonly string[];
        candidateIgnorePatterns?: readonly string[];
        beforeStart?: (codebasePath: string) => void;
    },
    run: (fixture: {
        codebasePath: string;
        manager: SyncManager;
        access: SyncManagerTestAccess;
        checkpointObservation: string;
        provenGeneration: ReturnType<typeof buildProvenVectorGeneration>;
        mutationCalls: () => number;
        setStatus: (status: CodebaseStatus) => void;
    }) => Promise<T>,
): Promise<T> {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexing']]);
    const checkpointObservation = 'checkpoint-candidate-v1';
    const provenGeneration = buildProvenVectorGeneration(codebasePath, 'candidate-policy-v1');
    let mutationCalls = 0;
    const context = {
        getActiveIgnorePatterns() {
            return [...(options.activeIgnorePatterns ?? [])];
        },
        getRegisteredSourceFreshnessCheckpointObservation() {
            return checkpointObservation;
        },
        async proveVectorGeneration() {
            return provenGeneration;
        },
        async inspectSourceFreshnessCheckpoint() {
            return {
                status: 'valid' as const,
                observationToken: checkpointObservation,
                merkleRoot: 'merkle-candidate-v1',
                documentDigest: 'document-candidate-v1',
                generationReceipt: provenGeneration,
            };
        },
        async reindexByChange() {
            mutationCalls += 1;
            return {
                added: 0,
                removed: 0,
                modified: 0,
                changedFiles: [],
                collectionName: provenGeneration.collectionName,
                generationReceipt: provenGeneration,
            };
        },
    };
    const manager = new SyncManager(
        context as unknown as SyncContext,
        createSnapshot(statusByPath) as unknown as SyncSnapshotManager,
        { watchEnabled: true },
    );
    const access = manager as unknown as SyncManagerTestAccess;

    try {
        options.beforeStart?.(codebasePath);
        await manager.startWatcherMode();
        await access.touchWatchedCodebase(codebasePath, {
            policyHash: 'candidate-policy-v1',
            effectiveIgnorePatterns: options.candidateIgnorePatterns ?? [],
        });
        while (access.watcherLifecycleStates.get(codebasePath) !== 'ready') {
            await wait(5);
        }
        return await run({
            codebasePath,
            manager,
            access,
            checkpointObservation,
            provenGeneration,
            mutationCalls: () => mutationCalls,
            setStatus: (status) => statusByPath.set(codebasePath, status),
        });
    } finally {
        await manager.stopWatcherMode();
        fs.rmSync(codebasePath, { recursive: true, force: true });
    }
}

function installAcceptedPolicyReconciliation(context: Record<string, unknown>): void {
    if (typeof context.observeIndexPolicyForIncrementalReconciliation !== 'function') {
        context.observeIndexPolicyForIncrementalReconciliation = async () => ({
            controlSignature: 'v1:test-policy-observation',
        });
    }
    if (typeof context.activateObservedIndexPolicyForIncrementalReconciliation !== 'function') {
        context.activateObservedIndexPolicyForIncrementalReconciliation = async () => {
            const reload = context.reloadIgnoreRulesForCodebase;
            if (typeof reload === 'function') {
                await reload();
            }
            return true;
        };
    }
}

function createCrossProcessSyncHarness(options: {
    ownerFailure?: Error;
    runtimeCompatible?: boolean;
    joinTimeoutMs?: number;
} = {}) {
    const codebasePath = createTempDir();
    const stateDir = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    let releaseOwner!: () => void;
    const ownerGate = new Promise<void>((resolve) => {
        releaseOwner = resolve;
    });
    let signalOwnerStarted!: () => void;
    const ownerStarted = new Promise<void>((resolve) => {
        signalOwnerStarted = resolve;
    });
    let sourceCurrent = false;
    let reindexCalls = 0;
    let waiterBoundToCurrentCheckpoint = false;
    let waiterRebindCalls = 0;
    const inspectSourceFreshnessCheckpoint = async () => ({
        status: 'valid' as const,
        observationToken: sourceCurrent ? 'checkpoint-current' : 'checkpoint-previous',
        merkleRoot: 'a'.repeat(64),
        documentDigest: 'b'.repeat(64),
    });
    const ownerContext = {
        inspectSourceFreshnessCheckpoint,
        async compareSourcePathsToFreshnessCheckpoint() {
            return { status: sourceCurrent ? 'matches' as const : 'differs' as const };
        },
        async reindexByChange() {
            reindexCalls += 1;
            signalOwnerStarted();
            await ownerGate;
            if (options.ownerFailure) {
                throw options.ownerFailure;
            }
            sourceCurrent = true;
            return {
                added: 0,
                removed: 0,
                modified: 1,
                changedFiles: ['src/owner.ts'],
                collectionName: 'generation-current',
            };
        },
    };
    const waiterContext = {
        inspectSourceFreshnessCheckpoint,
        getRegisteredSourceFreshnessCheckpointObservation() {
            return waiterBoundToCurrentCheckpoint
                ? 'checkpoint-current'
                : 'checkpoint-previous';
        },
        async recreateSynchronizerForCodebase() {
            waiterRebindCalls += 1;
            waiterBoundToCurrentCheckpoint = true;
        },
        async compareSourcePathsToFreshnessCheckpoint() {
            return {
                status: waiterBoundToCurrentCheckpoint && sourceCurrent
                    ? 'matches' as const
                    : 'unavailable' as const,
            };
        },
        async reindexByChange() {
            throw new Error('cross-process waiter must not start a second writer');
        },
    };
    const ownerCoordinator = new MutationLeaseCoordinator({
        stateDir,
        ownerId: 'cross-process-owner',
    });
    const waiterCoordinator = new MutationLeaseCoordinator({
        stateDir,
        ownerId: 'cross-process-waiter',
    });
    let signalWaiterObserved!: () => void;
    const waiterObserved = new Promise<void>((resolve) => {
        signalWaiterObserved = resolve;
    });
    let waiterObservationSignaled = false;
    const ownerManager = new SyncManager(
        ownerContext as unknown as SyncContext,
        snapshot as unknown as SyncSnapshotManager,
        {
            watchEnabled: false,
            mutationLeaseCoordinator: ownerCoordinator,
        },
    );
    const waiterSnapshot = {
        ...snapshot,
        observeDurableLatestOperation() {
            if (!waiterObservationSignaled) {
                waiterObservationSignaled = true;
                signalWaiterObserved();
            }
            return snapshot.observeDurableLatestOperation();
        },
        operationMatchesRuntimeFingerprint: options.runtimeCompatible === false
            ? () => false
            : snapshot.operationMatchesRuntimeFingerprint,
    };
    const waiterManager = new SyncManager(
        waiterContext as unknown as SyncContext,
        waiterSnapshot as unknown as SyncSnapshotManager,
        {
            watchEnabled: false,
            mutationLeaseCoordinator: waiterCoordinator,
            crossProcessJoinTimeoutMs: options.joinTimeoutMs ?? 1_000,
            crossProcessJoinPollMs: 5,
        },
    );
    const freshnessOptions = {
        skipIgnoreControlCheck: true,
        exactSourceComparisonPaths: ['src/owner.ts'],
    } as const;

    return {
        codebasePath,
        stateDir,
        snapshot,
        ownerCoordinator,
        ownerManager,
        waiterManager,
        ownerStarted,
        waiterObserved,
        releaseOwner,
        freshnessOptions,
        get reindexCalls() {
            return reindexCalls;
        },
        get waiterRebindCalls() {
            return waiterRebindCalls;
        },
        cleanup() {
            fs.rmSync(codebasePath, { recursive: true, force: true });
            fs.rmSync(stateDir, { recursive: true, force: true });
        },
    };
}

test('background sync skips recent roots without lease churn and compares expired roots', async () => {
    const codebasePath = createTempDir();
    const stateDir = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const context = createContext();
    const snapshot = createSnapshot(statusByPath);
    const coordinator = new MutationLeaseCoordinator({ stateDir, ownerId: 'background-owner' });
    const originalAcquire = coordinator.acquire.bind(coordinator);
    let acquireCalls = 0;
    coordinator.acquire = (...args) => {
        acquireCalls += 1;
        return originalAcquire(...args);
    };
    let now = 10_000;
    const manager = new SyncManager(
        context as unknown as SyncContext,
        snapshot as unknown as SyncSnapshotManager,
        {
            watchEnabled: false,
            mutationLeaseCoordinator: coordinator,
            now: () => now,
        },
    );
    const access = manager as unknown as SyncManagerTestAccess;
    access.lastSyncTimes.set(codebasePath, now);

    try {
        await manager.handleSyncIndex();
        assert.equal(acquireCalls, 0);
        assert.equal(context.calls, 0);
        assert.equal(access.freshnessEpochs.get(codebasePath), undefined);
        assert.deepEqual(snapshot.getReceiptHistory(), []);

        now += BACKGROUND_FRESHNESS_THRESHOLD_MS;
        await manager.handleSyncIndex();
        assert.equal(acquireCalls, 1);
        assert.equal(context.calls, 1);
        assert.equal(access.freshnessEpochs.get(codebasePath), 2);
        assert.deepEqual(snapshot.getReceiptHistory().map((receipt) => receipt.phase), [
            'accepted',
            'writing',
            'completed',
        ]);
    } finally {
        fs.rmSync(codebasePath, { recursive: true, force: true });
        fs.rmSync(stateDir, { recursive: true, force: true });
    }
});

test('watcher events are observed during indexing without scheduling freshness mutation', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexing']]);
    const context = createContext();
    const snapshot = createSnapshot(statusByPath);
    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    (manager as unknown as SyncManagerTestAccess).watcherModeStarted = true;
    const epoch = manager.recordWatcherEvent(codebasePath, 'source_changed');

    assert.equal(epoch, 1);
    assert.equal(context.calls, 0);
    assert.equal(manager.getWatcherObservation(codebasePath).observedEventEpoch, 1);
    assert.equal(manager.getWatcherObservation(codebasePath).pending, true);
    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness clears core index artifacts when an indexed path is deleted', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    let clearCalls = 0;
    let reindexCalls = 0;
    const clearedPaths: string[] = [];

    const context = {
        getActiveIgnorePatterns() {
            return ['node_modules/**'];
        },
        hasSynchronizerForCodebase() {
            return false;
        },
        async clearIndex(pathToClear: string) {
            clearCalls += 1;
            clearedPaths.push(pathToClear);
        },
        async reindexByChange() {
            reindexCalls += 1;
            return { added: 0, removed: 0, modified: 0, changedFiles: [] };
        },
    };

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });

    fs.rmSync(codebasePath, { recursive: true, force: true });
    const decision = await manager.ensureFreshness(codebasePath, 0, { skipIgnoreControlCheck: true });

    assert.equal(decision.mode, 'skipped_missing_path');
    assert.equal(clearCalls, 1);
    assert.deepEqual(clearedPaths, [codebasePath]);
    assert.equal(reindexCalls, 0);
    assert.equal(statusByPath.has(codebasePath), false);

    await manager.stopWatcherMode();
});

test('ensureFreshness does not mutate while another process owns the root lease', async () => {
    const codebasePath = createTempDir();
    const stateDir = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshotManager = createSnapshot(statusByPath);
    const processes = new Map<number, MutationLeaseProcessSnapshot>([
        [101, { pid: 101, processStartTime: 'first' }],
        [202, { pid: 202, processStartTime: 'second' }],
    ]);
    const processInspector = {
        inspect(pid: number) {
            return processes.get(pid) ?? null;
        },
    };
    const owner = new MutationLeaseCoordinator({
        stateDir,
        ownerId: 'first-owner',
        currentProcess: processes.get(101),
        processInspector,
    });
    const contender = new MutationLeaseCoordinator({
        stateDir,
        ownerId: 'second-owner',
        currentProcess: processes.get(202),
        processInspector,
    });
    assert.equal(owner.acquire(codebasePath, 'create').acquired, true);

    const context = createContext();
    const manager = new SyncManager(
        context as unknown as SyncContext,
        snapshotManager as unknown as SyncSnapshotManager,
        { watchEnabled: false, mutationLeaseCoordinator: contender },
    );
    const decision = await manager.ensureFreshness(codebasePath, 0, { skipIgnoreControlCheck: true });

    assert.equal(decision.mode, 'skipped_mutation_in_progress');
    assert.equal(decision.activeMutation?.ownerId, 'first-owner');
    assert.equal(context.calls, 0);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
});

test('coalesced sync callers receive the same durable completed receipt', async () => {
    const codebasePath = createTempDir();
    const stateDir = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    let releaseSync!: () => void;
    const syncGate = new Promise<void>((resolve) => {
        releaseSync = resolve;
    });
    let syncStarted!: () => void;
    const started = new Promise<void>((resolve) => {
        syncStarted = resolve;
    });
    let atomicPublicationObserved = false;
    const context = {
        async reindexByChange(_path: string, _progress: unknown, options: {
            publishMutation?: (publish: () => void) => void;
        }) {
            assert.equal(typeof options.publishMutation, 'function');
            options.publishMutation?.(() => {
                atomicPublicationObserved = true;
            });
            syncStarted();
            await syncGate;
            return { added: 1, removed: 0, modified: 0, changedFiles: ['src/new.ts'] };
        },
    };
    const coordinator = new MutationLeaseCoordinator({ stateDir, ownerId: 'sync-owner' });
    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
        mutationLeaseCoordinator: coordinator,
    });

    const first = manager.ensureFreshness(codebasePath, 0, { skipIgnoreControlCheck: true });
    await started;
    const second = manager.ensureFreshness(codebasePath, 0, { skipIgnoreControlCheck: true });
    assert.deepEqual(snapshot.getReceiptHistory().map((receipt) => receipt.phase), ['accepted', 'writing']);
    releaseSync();

    const [firstDecision, secondDecision] = await Promise.all([first, second]);
    assert.equal(firstDecision.mode, 'synced');
    assert.equal(secondDecision.mode, 'coalesced');
    assert.equal(firstDecision.operation?.phase, 'completed');
    assert.equal(secondDecision.operation?.id, firstDecision.operation?.id);
    assert.equal(atomicPublicationObserved, true);
    assert.equal(coordinator.getActiveLease(codebasePath), undefined);

    fs.rmSync(codebasePath, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
});

test('freshness flight covers only its captured watcher event epoch', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    let syncCalls = 0;
    let releaseSync!: () => void;
    let markSyncStarted!: () => void;
    const syncGate = new Promise<void>((resolve) => {
        releaseSync = resolve;
    });
    const syncStarted = new Promise<void>((resolve) => {
        markSyncStarted = resolve;
    });
    const context = {
        async reindexByChange() {
            syncCalls += 1;
            if (syncCalls === 1) {
                markSyncStarted();
                await syncGate;
            }
            return { added: 0, removed: 0, modified: 0 };
        },
    };
    const manager = new SyncManager(
        context as unknown as SyncContext,
        snapshot as unknown as SyncSnapshotManager,
        { watchEnabled: true },
    );
    const access = manager as unknown as SyncManagerTestAccess;
    access.watcherModeStarted = true;
    access.setWatcherCoverage(codebasePath, 'ready');

    assert.equal(manager.recordWatcherEvent(codebasePath, 'source_changed'), 1);
    const owner = manager.ensureFreshness(codebasePath, 60_000, { skipIgnoreControlCheck: true });
    await syncStarted;

    assert.equal(manager.recordWatcherEvent(codebasePath, 'directory_changed'), 2);
    const joiner = manager.ensureFreshness(codebasePath, 60_000, { skipIgnoreControlCheck: true });
    releaseSync();

    const [ownerDecision, joinerDecision] = await Promise.all([owner, joiner]);
    assert.equal(ownerDecision.mode, 'synced');
    assert.equal(joinerDecision.mode, 'coalesced');
    assert.equal(syncCalls, 1);
    assert.deepEqual(manager.getWatcherObservation(codebasePath), {
        observedEventEpoch: 2,
        comparedThroughEventEpoch: 1,
        latestEpochByReason: {
            source_changed: 0,
            ignore_rules_changed: 0,
            directory_changed: 2,
        },
        lastEventAt: manager.getWatcherObservation(codebasePath).lastEventAt,
        coverage: 'ready',
        pending: true,
    });

    const followup = await manager.ensureFreshness(codebasePath, 60_000, { skipIgnoreControlCheck: true });
    assert.equal(followup.mode, 'synced');
    assert.equal(syncCalls, 2);
    assert.equal(manager.getWatcherObservation(codebasePath).pending, false);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('watcher observation is root-keyed and retains each reason independently', async () => {
    const codebasePathA = createTempDir();
    const codebasePathB = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([
        [codebasePathA, 'indexed'],
        [codebasePathB, 'indexed'],
    ]);
    const manager = new SyncManager(
        createContext() as unknown as SyncContext,
        createSnapshot(statusByPath) as unknown as SyncSnapshotManager,
        { watchEnabled: true, now: () => 1234 },
    );
    const access = manager as unknown as SyncManagerTestAccess;
    access.watcherModeStarted = true;
    access.setWatcherCoverage(codebasePathA, 'ready');
    access.setWatcherCoverage(codebasePathB, 'ready');

    manager.recordWatcherEvent(codebasePathA, 'source_changed');
    manager.recordWatcherEvent(codebasePathA, 'ignore_rules_changed');
    manager.recordWatcherEvent(codebasePathA, 'source_changed');
    manager.recordWatcherEvent(codebasePathB, 'directory_changed');

    assert.deepEqual(manager.getWatcherObservation(codebasePathA), {
        observedEventEpoch: 3,
        comparedThroughEventEpoch: 0,
        latestEpochByReason: {
            source_changed: 3,
            ignore_rules_changed: 2,
            directory_changed: 0,
        },
        lastEventAt: 1234,
        coverage: 'ready',
        pending: true,
    });
    assert.deepEqual(manager.getWatcherObservation(codebasePathB), {
        observedEventEpoch: 1,
        comparedThroughEventEpoch: 0,
        latestEpochByReason: {
            source_changed: 0,
            ignore_rules_changed: 0,
            directory_changed: 1,
        },
        lastEventAt: 1234,
        coverage: 'ready',
        pending: true,
    });

    await manager.stopWatcherMode();
    fs.rmSync(codebasePathA, { recursive: true, force: true });
    fs.rmSync(codebasePathB, { recursive: true, force: true });
});

test('failed freshness leaves the captured watcher event pending', async (t) => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const manager = new SyncManager(
        {
            async reindexByChange() {
                throw new Error('expected sync failure');
            },
        } as unknown as SyncContext,
        createSnapshot(statusByPath) as unknown as SyncSnapshotManager,
        { watchEnabled: true },
    );
    const access = manager as unknown as SyncManagerTestAccess;
    access.watcherModeStarted = true;
    access.setWatcherCoverage(codebasePath, 'ready');
    t.mock.method(console, 'error', () => undefined);

    manager.recordWatcherEvent(codebasePath, 'source_changed');
    await assert.rejects(
        manager.ensureFreshness(codebasePath, 60_000, { skipIgnoreControlCheck: true }),
        /expected sync failure/,
    );

    assert.deepEqual(manager.getWatcherObservation(codebasePath), {
        observedEventEpoch: 1,
        comparedThroughEventEpoch: 0,
        latestEpochByReason: {
            source_changed: 1,
            ignore_rules_changed: 0,
            directory_changed: 0,
        },
        lastEventAt: manager.getWatcherObservation(codebasePath).lastEventAt,
        coverage: 'ready',
        pending: true,
    });

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('independent sync runtimes join one durable owner and prove the requested source observation', async () => {
    const harness = createCrossProcessSyncHarness();
    try {
        const owner = harness.ownerManager.ensureFreshness(
            harness.codebasePath,
            0,
            harness.freshnessOptions,
        );
        await harness.ownerStarted;
        const waiter = harness.waiterManager.ensureFreshness(
            harness.codebasePath,
            0,
            harness.freshnessOptions,
        );
        await harness.waiterObserved;
        harness.releaseOwner();

        const [ownerDecision, waiterDecision] = await Promise.all([owner, waiter]);
        assert.equal(ownerDecision.mode, 'synced');
        assert.equal(waiterDecision.mode, 'coalesced');
        assert.equal(waiterDecision.errorMessage, undefined);
        assert.equal(waiterDecision.operation?.phase, 'completed');
        assert.equal(waiterDecision.operation?.id, ownerDecision.operation?.id);
        assert.equal(harness.reindexCalls, 1);
        assert.equal(harness.waiterRebindCalls, 1);
        assert.deepEqual(
            harness.snapshot.getReceiptHistory().map((receipt) => receipt.phase),
            ['accepted', 'writing', 'completed'],
        );
    } finally {
        harness.cleanup();
    }
});

test('cross-process sync join fails closed when the durable owner fails', async () => {
    const harness = createCrossProcessSyncHarness({ ownerFailure: new Error('owner failed') });
    try {
        const owner = harness.ownerManager.ensureFreshness(
            harness.codebasePath,
            0,
            harness.freshnessOptions,
        );
        await harness.ownerStarted;
        const waiter = harness.waiterManager.ensureFreshness(
            harness.codebasePath,
            0,
            harness.freshnessOptions,
        );
        await harness.waiterObserved;
        harness.releaseOwner();

        await assert.rejects(owner, (error: unknown) => {
            assert.ok(error instanceof SyncOperationError);
            assert.equal(error.operation?.phase, 'failed');
            return true;
        });
        const waiterDecision = await waiter;
        assert.equal(waiterDecision.mode, 'coalesced');
        assert.equal(waiterDecision.operation?.phase, 'failed');
        assert.match(waiterDecision.errorMessage ?? '', /terminal phase 'failed'/);
        assert.equal(harness.reindexCalls, 1);
    } finally {
        harness.cleanup();
    }
});

test('cross-process sync join rejects incompatible runtime identity', async () => {
    const harness = createCrossProcessSyncHarness({ runtimeCompatible: false });
    try {
        const owner = harness.ownerManager.ensureFreshness(
            harness.codebasePath,
            0,
            harness.freshnessOptions,
        );
        await harness.ownerStarted;
        const waiterDecision = await harness.waiterManager.ensureFreshness(
            harness.codebasePath,
            0,
            harness.freshnessOptions,
        );

        assert.equal(waiterDecision.mode, 'coalesced');
        assert.match(waiterDecision.errorMessage ?? '', /incompatible runtime fingerprint/);
        assert.equal(waiterDecision.operation?.phase, 'writing');
        harness.releaseOwner();
        assert.equal((await owner).mode, 'synced');
        assert.equal(harness.reindexCalls, 1);
    } finally {
        harness.cleanup();
    }
});

test('cross-process sync join is bounded and never starts a second writer', async () => {
    const harness = createCrossProcessSyncHarness({ joinTimeoutMs: 20 });
    try {
        const owner = harness.ownerManager.ensureFreshness(
            harness.codebasePath,
            0,
            harness.freshnessOptions,
        );
        await harness.ownerStarted;
        const waiterDecision = await harness.waiterManager.ensureFreshness(
            harness.codebasePath,
            0,
            harness.freshnessOptions,
        );

        assert.equal(waiterDecision.mode, 'coalesced');
        assert.match(waiterDecision.errorMessage ?? '', /Timed out/);
        assert.equal(waiterDecision.operation?.phase, 'writing');
        assert.equal(harness.reindexCalls, 1);
        harness.releaseOwner();
        assert.equal((await owner).mode, 'synced');
    } finally {
        harness.cleanup();
    }
});

test('cross-process sync join rejects owner loss before durable completion', async () => {
    const harness = createCrossProcessSyncHarness();
    try {
        const owner = harness.ownerManager.ensureFreshness(
            harness.codebasePath,
            0,
            harness.freshnessOptions,
        );
        await harness.ownerStarted;
        const activeLease = harness.ownerCoordinator.getActiveLease(harness.codebasePath);
        assert.ok(activeLease);
        const waiter = harness.waiterManager.ensureFreshness(
            harness.codebasePath,
            0,
            harness.freshnessOptions,
        );
        await harness.waiterObserved;
        assert.equal(harness.ownerCoordinator.release(activeLease), true);

        const waiterDecision = await waiter;
        assert.equal(waiterDecision.mode, 'coalesced');
        assert.match(waiterDecision.errorMessage ?? '', /lost its durable owner/);
        assert.equal(waiterDecision.operation?.phase, 'writing');
        harness.releaseOwner();
        await assert.rejects(owner, /no longer current/);
        assert.equal(harness.reindexCalls, 1);
    } finally {
        harness.cleanup();
    }
});

test('sync failure persists and throws the exact failed receipt before lease release', async () => {
    const codebasePath = createTempDir();
    const stateDir = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    const coordinator = new MutationLeaseCoordinator({ stateDir, ownerId: 'sync-owner' });
    const manager = new SyncManager({
        async reindexByChange() {
            throw new Error('sync exploded');
        },
    } as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
        mutationLeaseCoordinator: coordinator,
    });

    await assert.rejects(
        manager.ensureFreshness(codebasePath, 0, { skipIgnoreControlCheck: true }),
        (error: unknown) => {
            assert.ok(error instanceof SyncOperationError);
            assert.equal(error.operation?.phase, 'failed');
            assert.equal(error.operation?.id, snapshot.getLatestOperation()?.id);
            return true;
        },
    );
    assert.equal(snapshot.getLatestOperation()?.phase, 'failed');
    assert.equal(coordinator.getActiveLease(codebasePath), undefined);

    fs.rmSync(codebasePath, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
});

test('ensureFreshness does not persist a missing ignore baseline while another process owns the root lease', async () => {
    const codebasePath = createTempDir();
    const stateDir = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshotManager = createSnapshot(statusByPath);
    let signatureWrites = 0;
    const setSignature = snapshotManager.setCodebaseIgnoreControlSignature.bind(snapshotManager);
    snapshotManager.setCodebaseIgnoreControlSignature = (root: string, signature: string) => {
        signatureWrites += 1;
        setSignature(root, signature);
    };
    const processes = new Map<number, MutationLeaseProcessSnapshot>([
        [101, { pid: 101, processStartTime: 'first' }],
        [202, { pid: 202, processStartTime: 'second' }],
    ]);
    const processInspector = {
        inspect(pid: number) {
            return processes.get(pid) ?? null;
        },
    };
    const owner = new MutationLeaseCoordinator({
        stateDir,
        ownerId: 'first-owner',
        currentProcess: processes.get(101),
        processInspector,
    });
    const contender = new MutationLeaseCoordinator({
        stateDir,
        ownerId: 'second-owner',
        currentProcess: processes.get(202),
        processInspector,
    });
    assert.equal(owner.acquire(codebasePath, 'create').acquired, true);

    const context = createContext();
    const manager = new SyncManager(
        context as unknown as SyncContext,
        snapshotManager as unknown as SyncSnapshotManager,
        { watchEnabled: false, mutationLeaseCoordinator: contender },
    );
    const decision = await manager.ensureFreshness(codebasePath, 0);

    assert.equal(decision.mode, 'skipped_mutation_in_progress');
    assert.equal(signatureWrites, 0);
    assert.equal(snapshotManager.getCodebaseIgnoreControlSignature(codebasePath), undefined);
    assert.equal(context.calls, 0);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
    fs.rmSync(stateDir, { recursive: true, force: true });
});

test('ensureFreshness does not treat mutation lease loss as a missing root', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshotManager = createSnapshot(statusByPath);
    let assertions = 0;
    let clearCalls = 0;
    const lease = {
        canonicalRoot: codebasePath,
        generation: 1,
        operationId: 'operation',
        action: 'sync' as const,
        ownerId: 'owner',
        pid: process.pid,
        acquiredAt: new Date(0).toISOString(),
    };
    const mutationLeaseCoordinator = {
        assertCurrent() {
            assertions += 1;
            if (assertions === 2) {
                throw new Error('lease_lost');
            }
        },
        release() {
            return false;
        },
    };
    const context = {
        ...createContext(),
        async clearIndex() {
            clearCalls += 1;
        },
    };
    const manager = new SyncManager(
        context as unknown as SyncContext,
        snapshotManager as unknown as SyncSnapshotManager,
        {
            watchEnabled: false,
            mutationLeaseCoordinator: mutationLeaseCoordinator as unknown as MutationLeaseCoordinator,
        },
    );

    await assert.rejects(
        manager.ensureFreshness(codebasePath, 0, { skipIgnoreControlCheck: true, mutationLease: lease }),
        /lease_lost/,
    );
    assert.equal(clearCalls, 0);
    assert.equal(snapshotManager.getCodebaseStatus(codebasePath), 'indexed');

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness lets Core resolve incremental authority instead of trusting lifecycle metadata', async () => {
    const codebasePath = createTempDir();
    const committedCollection = 'hybrid_code_chunks_committed';
    const generationReceipt = { collectionName: committedCollection } as never;
    const activatedGenerationReceipt = { collectionName: `${committedCollection}_next` } as never;
    const inspectedReceipts: unknown[] = [];
    let receivedOptions: unknown;
    let persistedCollection: string | undefined;

    const context = {
        async inspectSourceFreshnessCheckpoint(
            _path: string,
            _checkpointIdentity?: string,
            requestBoundReceipt?: unknown,
        ) {
            inspectedReceipts.push(requestBoundReceipt);
            return {
                status: 'valid' as const,
                observationToken: 'checkpoint-v1',
                merkleRoot: 'a'.repeat(64),
                documentDigest: 'b'.repeat(64),
                generationReceipt,
            };
        },
        getActiveIgnorePatterns() {
            return ['node_modules/**'];
        },
        hasSynchronizerForCodebase() {
            return true;
        },
        async reindexByChange(_path: string, _progress: unknown, options: unknown) {
            receivedOptions = options;
            return {
                added: 1,
                removed: 0,
                modified: 0,
                changedFiles: ['src/new.ts'],
                collectionName: committedCollection,
                generationReceipt: activatedGenerationReceipt,
            };
        },
        getTrackedRelativePaths() {
            return ['src/new.ts'];
        }
    };
    const snapshot = {
        getCodebaseStatus: () => 'indexed',
        getCodebaseCollectionName: () => committedCollection,
        getCodebaseIgnoreControlSignature: () => 'current',
        setCodebaseIndexManifest() {},
        setCodebaseSyncCompleted(_path: string, _stats: unknown, _fingerprint: unknown, _source: unknown, collectionName?: string) {
            persistedCollection = collectionName;
        },
        saveCodebaseSnapshot() {},
        setCodebaseIgnoreControlSignature() {},
    };

    fs.writeFileSync(path.join(codebasePath, '.gitignore'), '', 'utf8');
    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });

    const decision = await manager.ensureFreshness(codebasePath, 0, { skipIgnoreControlCheck: true });

    assert.equal(decision.mode, 'synced');
    assert.deepEqual(receivedOptions, {
        maintainCompletionMarker: true,
        sourceGenerationReceipt: generationReceipt,
    });
    assert.equal(inspectedReceipts.at(-1), activatedGenerationReceipt);
    assert.equal(persistedCollection, committedCollection);
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness disables incremental sync when a completed generation checkpoint is missing or corrupt', async () => {
    const codebasePath = createTempDir();
    const committedCollection = 'hybrid_code_chunks_checkpoint_evidence';
    let checkpointStatus: 'valid' | 'missing' | 'corrupt' = 'valid';
    let syncCalls = 0;
    let receivedSyncOptions: unknown;
    const context = {
        async inspectSourceFreshnessCheckpoint() {
            return checkpointStatus === 'valid'
                ? { status: 'valid' as const, observationToken: 'checkpoint-v1', merkleRoot: 'a'.repeat(64) }
                : { status: checkpointStatus, message: `checkpoint ${checkpointStatus}` };
        },
        getRegisteredSourceFreshnessCheckpointObservation() {
            return checkpointStatus === 'valid' ? 'checkpoint-v1' : null;
        },
        async reindexByChange(_path: string, _progress: unknown, options: unknown) {
            syncCalls += 1;
            receivedSyncOptions = options;
            return { added: 0, removed: 0, modified: 0, changedFiles: [], collectionName: committedCollection };
        },
        getActiveIgnorePatterns() {
            return [];
        },
        hasSynchronizerForCodebase() {
            return true;
        },
        getTrackedRelativePaths() {
            return ['index.ts'];
        },
    };
    const snapshot = {
        getCodebaseStatus: () => 'indexed',
        getCodebaseInfo: () => ({ indexStatus: 'completed' }),
        getCodebaseCollectionName: () => committedCollection,
        getCodebaseIgnoreControlSignature: () => 'current',
        setCodebaseIndexManifest() {},
        setCodebaseSyncCompleted() {},
        saveCodebaseSnapshot() {},
    };
    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        now: () => 10_000,
    });
    const access = manager as unknown as SyncManagerTestAccess;
    access.watcherModeStarted = true;
    access.watchedCodebases.add(codebasePath);
    access.watcherLifecycleStates.set(codebasePath, 'ready');
    access.watchers.set(codebasePath, { close: async () => undefined });

    const initial = await manager.ensureFreshness(codebasePath, 0, { skipIgnoreControlCheck: true });
    assert.equal(initial.mode, 'synced');
    assert.equal(syncCalls, 1);
    assert.deepEqual(receivedSyncOptions, { maintainCompletionMarker: true });
    assert.equal(manager.getPreparedReadObservation(codebasePath).available, true);

    const warm = await manager.ensureFreshness(codebasePath, 60_000, { skipIgnoreControlCheck: true });
    assert.equal(warm.mode, 'skipped_recent');
    assert.equal(syncCalls, 1);

    checkpointStatus = 'missing';
    assert.deepEqual(manager.getPreparedReadObservation(codebasePath), {
        available: false,
        reason: 'checkpoint_observation_mismatch',
        freshnessEpoch: 2,
        watcherState: 'ready',
    });
    const missing = await manager.ensureFreshness(codebasePath, 60_000, { skipIgnoreControlCheck: true });
    assert.equal(missing.mode, 'skipped_source_checkpoint_unavailable');
    assert.equal(missing.checkpointStatus, 'missing');
    assert.equal(syncCalls, 1);
    assert.deepEqual(manager.getPreparedReadObservation(codebasePath), {
        available: false,
        reason: 'checkpoint_missing',
        freshnessEpoch: 3,
        watcherState: 'ready',
    });

    checkpointStatus = 'corrupt';
    const corrupt = await manager.ensureFreshness(codebasePath, 0, { skipIgnoreControlCheck: true });
    assert.equal(corrupt.mode, 'skipped_source_checkpoint_unavailable');
    assert.equal(corrupt.checkpointStatus, 'corrupt');
    assert.equal(syncCalls, 1);
    assert.deepEqual(manager.getPreparedReadObservation(codebasePath), {
        available: false,
        reason: 'checkpoint_corrupt',
        freshnessEpoch: 4,
        watcherState: 'ready',
    });

    await manager.unwatchCodebase(codebasePath);
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness forwards a request-bound vector receipt to checkpoint inspection', async () => {
    const codebasePath = createTempDir();
    const preparedVectorReceipt = { collectionName: 'generation-bound' } as never;
    let receivedReceipt: unknown;
    const context = {
        async inspectSourceFreshnessCheckpoint(
            _path: string,
            _checkpointIdentity?: string,
            requestBoundReceipt?: unknown,
        ) {
            receivedReceipt = requestBoundReceipt;
            return { status: 'missing' as const, message: 'checkpoint unavailable' };
        },
    };
    const snapshot = {
        getCodebaseStatus: () => 'indexed',
        getCodebaseInfo: () => ({ indexStatus: 'completed' }),
    };
    const manager = new SyncManager(
        context as unknown as SyncContext,
        snapshot as unknown as SyncSnapshotManager,
        { watchEnabled: false },
    );

    const decision = await manager.ensureFreshness(codebasePath, 60_000, {
        skipIgnoreControlCheck: true,
        preparedVectorReceipt,
    });

    assert.equal(decision.mode, 'skipped_source_checkpoint_unavailable');
    assert.equal(receivedReceipt, preparedVectorReceipt);
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness skips publication only when exact dirty paths match the active checkpoint', async () => {
    const codebasePath = createTempDir();
    const preparedVectorReceipt = { collectionName: 'generation-bound' } as never;
    let comparisonStatus: 'matches' | 'differs' | 'unavailable' = 'matches';
    let syncCalls = 0;
    const comparisons: Array<{ paths: readonly string[]; receipt: unknown }> = [];
    const context = {
        async inspectSourceFreshnessCheckpoint() {
            return {
                status: 'valid' as const,
                observationToken: 'checkpoint-v1',
                merkleRoot: 'a'.repeat(64),
                documentDigest: 'b'.repeat(64),
            };
        },
        async compareSourcePathsToFreshnessCheckpoint(
            _path: string,
            paths: readonly string[],
            receipt?: unknown,
        ) {
            comparisons.push({ paths: [...paths], receipt });
            return { status: comparisonStatus };
        },
        async reindexByChange() {
            syncCalls += 1;
            return {
                added: 0,
                removed: 0,
                modified: 1,
                changedFiles: ['src/owner.ts'],
                collectionName: 'generation-next',
            };
        },
        getActiveIgnorePatterns() {
            return [];
        },
        hasSynchronizerForCodebase() {
            return true;
        },
        getTrackedRelativePaths() {
            return ['src/owner.ts'];
        },
    };
    const snapshot = {
        getCodebaseStatus: () => 'indexed',
        getCodebaseInfo: () => ({ indexStatus: 'completed' }),
        getCodebaseIgnoreControlSignature: () => 'current',
        setCodebaseIndexManifest() {},
        setCodebaseSyncCompleted() {},
        saveCodebaseSnapshot() {},
    };
    const manager = new SyncManager(
        context as unknown as SyncContext,
        snapshot as unknown as SyncSnapshotManager,
        { watchEnabled: false },
    );
    const options = {
        skipIgnoreControlCheck: true,
        preparedVectorReceipt,
        exactSourceComparisonPaths: ['src/owner.ts'],
    };

    const unchanged = await manager.ensureFreshness(codebasePath, 0, options);
    assert.equal(unchanged.mode, 'skipped_source_unchanged');
    assert.equal(syncCalls, 0);
    assert.deepEqual(comparisons, [{
        paths: ['src/owner.ts'],
        receipt: preparedVectorReceipt,
    }]);

    comparisonStatus = 'differs';
    const changed = await manager.ensureFreshness(codebasePath, 0, options);
    assert.equal(changed.mode, 'synced');
    assert.equal(syncCalls, 1);

    comparisonStatus = 'unavailable';
    const unavailable = await manager.ensureFreshness(codebasePath, 0, options);
    assert.equal(unavailable.mode, 'synced');
    assert.equal(syncCalls, 2);

    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness skips watcher-disabled publication only after a complete source comparison', async () => {
    const codebasePath = createTempDir();
    const preparedVectorReceipt = { collectionName: 'generation-bound' } as never;
    let comparisonStatus: 'matches' | 'differs' = 'matches';
    let syncCalls = 0;
    let comparedReceipt: unknown;
    const context = {
        async inspectSourceFreshnessCheckpoint() {
            return {
                status: 'valid' as const,
                observationToken: 'checkpoint-v1',
                merkleRoot: 'a'.repeat(64),
                documentDigest: 'b'.repeat(64),
            };
        },
        async compareAllSourceToFreshnessCheckpoint(_path: string, receipt?: unknown) {
            comparedReceipt = receipt;
            return { status: comparisonStatus };
        },
        async reindexByChange() {
            syncCalls += 1;
            return {
                added: 0,
                removed: 0,
                modified: 1,
                changedFiles: ['src/owner.ts'],
                collectionName: 'generation-next',
            };
        },
        getActiveIgnorePatterns() {
            return [];
        },
        hasSynchronizerForCodebase() {
            return true;
        },
        getTrackedRelativePaths() {
            return ['src/owner.ts'];
        },
    };
    const snapshot = {
        getCodebaseStatus: () => 'indexed',
        getCodebaseInfo: () => ({ indexStatus: 'completed' }),
        getCodebaseIgnoreControlSignature: () => 'current',
        setCodebaseIndexManifest() {},
        setCodebaseSyncCompleted() {},
        saveCodebaseSnapshot() {},
    };
    const manager = new SyncManager(
        context as unknown as SyncContext,
        snapshot as unknown as SyncSnapshotManager,
        { watchEnabled: false },
    );
    const options = {
        skipIgnoreControlCheck: true,
        preparedVectorReceipt,
        fullSourceComparison: true,
    };

    const unchanged = await manager.ensureFreshness(codebasePath, 0, options);
    assert.equal(unchanged.mode, 'skipped_source_unchanged');
    assert.equal(comparedReceipt, preparedVectorReceipt);
    assert.equal(syncCalls, 0);

    comparisonStatus = 'differs';
    const changed = await manager.ensureFreshness(codebasePath, 0, options);
    assert.equal(changed.mode, 'synced');
    assert.equal(syncCalls, 1);

    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness validates the authority checkpoint before ignore reconciliation', async () => {
    const codebasePath = createTempDir();
    let reloadCalls = 0;
    let syncCalls = 0;
    const context = {
        async inspectSourceFreshnessCheckpoint() {
            return { status: 'missing' as const, message: 'authority checkpoint missing' };
        },
        async reloadIgnoreRulesForCodebase() {
            reloadCalls += 1;
            return [];
        },
        async reindexByChange() {
            syncCalls += 1;
            return { added: 0, removed: 0, modified: 0, changedFiles: [] };
        },
        getActiveIgnorePatterns() {
            return [];
        },
        hasSynchronizerForCodebase() {
            return true;
        },
        getTrackedRelativePaths() {
            return ['index.ts'];
        },
    };
    const snapshot = {
        getCodebaseStatus: () => 'indexed',
        getCodebaseInfo: () => ({ indexStatus: 'completed' }),
        getCodebaseIgnoreControlSignature: () => 'stale-signature',
        getCodebaseIndexedPaths: () => ['index.ts'],
        saveCodebaseSnapshot() {},
    };
    fs.writeFileSync(path.join(codebasePath, '.gitignore'), '*.generated.ts\n', 'utf8');
    const manager = new SyncManager(
        context as unknown as SyncContext,
        snapshot as unknown as SyncSnapshotManager,
        { watchEnabled: false },
    );

    const regular = await manager.ensureFreshness(codebasePath, 0);
    assert.equal(regular.mode, 'skipped_source_checkpoint_unavailable');
    const watcher = await manager.ensureFreshness(codebasePath, 0, { reason: 'ignore_change' });
    assert.equal(watcher.mode, 'skipped_source_checkpoint_unavailable');
    assert.equal(reloadCalls, 0);
    assert.equal(syncCalls, 0);

    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness persists collection resolved by incremental sync for legacy snapshots', async () => {
    const codebasePath = createTempDir();
    const resolvedCollection = 'hybrid_code_chunks_resolved';
    let receivedOptions: unknown;
    let persistedCollection: string | undefined;

    const context = {
        getActiveIgnorePatterns() {
            return ['node_modules/**'];
        },
        hasSynchronizerForCodebase() {
            return true;
        },
        async reindexByChange(_path: string, _progress: unknown, options: unknown) {
            receivedOptions = options;
            return { added: 0, removed: 0, modified: 0, changedFiles: [], collectionName: resolvedCollection };
        },
        getTrackedRelativePaths() {
            return ['src/existing.ts'];
        }
    };
    const snapshot = {
        getCodebaseStatus: () => 'indexed',
        getCodebaseCollectionName: () => undefined,
        getCodebaseIgnoreControlSignature: () => 'current',
        setCodebaseIndexManifest() {},
        setCodebaseSyncCompleted(_path: string, _stats: unknown, _fingerprint: unknown, _source: unknown, collectionName?: string) {
            persistedCollection = collectionName;
        },
        saveCodebaseSnapshot() {},
        setCodebaseIgnoreControlSignature() {},
    };

    fs.writeFileSync(path.join(codebasePath, '.gitignore'), '', 'utf8');
    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });

    const decision = await manager.ensureFreshness(codebasePath, 0, { skipIgnoreControlCheck: true });

    assert.equal(decision.mode, 'synced');
    assert.deepEqual(receivedOptions, { maintainCompletionMarker: true });
    assert.equal(persistedCollection, resolvedCollection);
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness treats satori.toml policy changes as requiring a full reindex', async () => {
    const codebasePath = createTempDir();
    fs.writeFileSync(path.join(codebasePath, 'satori.toml'), '[index]\nprofile = "minimal"\n', 'utf8');
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const context = createContext();
    Object.assign(context, {
        async observeIndexPolicyForIncrementalReconciliation() {
            return { controlSignature: 'v1:changed-profile-observation' };
        },
        activateObservedIndexPolicyForIncrementalReconciliation() {
            return false;
        },
    });
    const snapshot = createSnapshot(statusByPath);
    snapshot.setCodebaseIgnoreControlSignature(codebasePath, 'stale-signature');
    snapshot.setCodebaseIndexManifest(codebasePath, ['src/app.ts']);

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });

    const decision = await manager.ensureFreshness(codebasePath, 60000);

    assert.equal(decision.mode, 'skipped_requires_reindex');
    assert.equal(context.calls, 0);
    assert.equal(snapshot.getCodebaseRequiresReindex(codebasePath)?.reason, 'index_policy_changed');
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness prefers the control signature sealed into generation authority', async () => {
    const codebasePath = createTempDir();
    fs.writeFileSync(path.join(codebasePath, '.gitignore'), '*.generated.ts\n', 'utf8');
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    const context = {
        async inspectSourceFreshnessCheckpoint() {
            return {
                status: 'valid' as const,
                observationToken: 'checkpoint-v1',
                merkleRoot: 'a'.repeat(64),
                documentDigest: 'b'.repeat(64),
                generationReceipt: {
                    policy: { controlSignature: 'v1:sealed-generation-signature' },
                } as never,
            };
        },
        async observeIndexPolicyForIncrementalReconciliation() {
            return { controlSignature: 'v1:current-policy-observation' };
        },
        activateObservedIndexPolicyForIncrementalReconciliation() {
            return false;
        },
    };
    snapshot.setCodebaseIndexManifest(codebasePath, ['src/app.ts']);

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });
    await manager.recordCurrentIgnoreControlSignature(codebasePath);
    const currentSnapshotSignature = snapshot.getCodebaseIgnoreControlSignature(codebasePath);

    const decision = await manager.ensureFreshness(codebasePath, 60_000);

    assert.equal(decision.mode, 'skipped_requires_reindex');
    assert.equal(snapshot.getCodebaseIgnoreControlSignature(codebasePath), currentSnapshotSignature);
    assert.equal(snapshot.getCodebaseRequiresReindex(codebasePath)?.reason, 'index_policy_changed');
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness revalidates legacy generation policy even when the lifecycle signature is current', async () => {
    const codebasePath = createTempDir();
    fs.writeFileSync(path.join(codebasePath, '.satoriignore'), '# current policy\n', 'utf8');
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    const context = {
        async inspectSourceFreshnessCheckpoint() {
            return {
                status: 'valid' as const,
                observationToken: 'checkpoint-v1',
                merkleRoot: 'a'.repeat(64),
                documentDigest: 'b'.repeat(64),
                generationReceipt: {
                    policy: { policyHash: 'c'.repeat(64) },
                } as never,
            };
        },
        async observeIndexPolicyForIncrementalReconciliation() {
            return { controlSignature: 'v1:current-policy-observation' };
        },
        activateObservedIndexPolicyForIncrementalReconciliation() {
            return false;
        },
    };
    snapshot.setCodebaseIndexManifest(codebasePath, ['src/app.ts']);

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });
    await manager.recordCurrentIgnoreControlSignature(codebasePath);
    const currentSnapshotSignature = snapshot.getCodebaseIgnoreControlSignature(codebasePath);

    const decision = await manager.ensureFreshness(codebasePath, 60_000);

    assert.equal(decision.mode, 'skipped_requires_reindex');
    assert.equal(snapshot.getCodebaseIgnoreControlSignature(codebasePath), currentSnapshotSignature);
    assert.equal(snapshot.getCodebaseRequiresReindex(codebasePath)?.reason, 'index_policy_changed');
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('watcher event bursts record bounded observation without scheduling sync', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const context = createContext();
    const snapshot = createSnapshot(statusByPath);
    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    (manager as unknown as SyncManagerTestAccess).watcherModeStarted = true;
    for (let event = 0; event < 10; event += 1) {
        manager.recordWatcherEvent(codebasePath, event % 2 === 0 ? 'source_changed' : 'directory_changed');
    }
    await wait(120);

    assert.equal(context.calls, 0);
    const observation = manager.getWatcherObservation(codebasePath);
    assert.equal(typeof observation.lastEventAt, 'number');
    assert.deepEqual({ ...observation, lastEventAt: undefined }, {
        observedEventEpoch: 10,
        comparedThroughEventEpoch: 0,
        latestEpochByReason: {
            source_changed: 9,
            ignore_rules_changed: 0,
            directory_changed: 10,
        },
        lastEventAt: undefined,
        coverage: 'starting',
        coverageGapSinceEpoch: 0,
        pending: true,
    });
    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('real watcher events do not schedule work after the former debounce interval', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const context = createContext();
    const manager = new SyncManager(
        context as unknown as SyncContext,
        createSnapshot(statusByPath) as unknown as SyncSnapshotManager,
        { watchEnabled: true, watchDebounceMs: 1 },
    );
    const access = manager as unknown as SyncManagerTestAccess;

    await manager.startWatcherMode();
    await manager.touchWatchedCodebase(codebasePath);
    while (access.watcherLifecycleStates.get(codebasePath) !== 'ready') {
        await wait(5);
    }

    fs.writeFileSync(path.join(codebasePath, 'observed.ts'), 'export const observed = true;\n', 'utf8');
    const deadline = Date.now() + 2_000;
    while (manager.getWatcherObservation(codebasePath).observedEventEpoch === 0) {
        assert.ok(Date.now() < deadline, 'Expected Chokidar to report the source event.');
        await wait(10);
    }

    await wait(DEFAULT_WATCH_DEBOUNCE_MS + 100);
    assert.equal(context.calls, 0);
    assert.equal(manager.getWatcherObservation(codebasePath).pending, true);
    assert.equal(manager.getActiveLifecycleOperationCount(), 0);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('stopWatcherMode closes active watchers and clears observation state', async () => {
    const context = createContext();
    const snapshot = createSnapshot(new Map());
    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    (manager as unknown as SyncManagerTestAccess).watcherModeStarted = true;
    let closeCalls = 0;
    const fakeWatcher = {
        close: async () => {
            closeCalls += 1;
        }
    };

    const access = manager as unknown as SyncManagerTestAccess;
    access.watchers.set('/tmp/repo', fakeWatcher);
    access.watcherModeStarted = true;
    access.setWatcherCoverage('/tmp/repo', 'ready');
    manager.recordWatcherEvent('/tmp/repo', 'source_changed');
    access.sourceObservationState.recordValidCheckpointObservation('/tmp/repo', 'checkpoint-v1');

    await manager.stopWatcherMode();

    assert.equal(closeCalls, 1);
    assert.equal(access.watchers.size, 0);
    assert.equal(access.watcherObservations.size, 0);
    assert.equal(access.sourceObservationState.getCheckpointObservation('/tmp/repo'), undefined);
});

test('stopAndDrainLifecycle joins active background work without watcher-owned mutation', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const context = createContext();
    const snapshot = createSnapshot(statusByPath);
    let activityChanges = 0;
    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 1,
        onLifecycleActivityChanged: () => {
            activityChanges += 1;
        },
    });
    const access = manager as unknown as SyncManagerTestAccess;
    let releaseBackground!: () => void;
    let markBackgroundStarted!: () => void;
    const backgroundGate = new Promise<void>((resolve) => {
        releaseBackground = resolve;
    });
    const backgroundStarted = new Promise<void>((resolve) => {
        markBackgroundStarted = resolve;
    });
    access.handleSyncIndex = async () => {
        markBackgroundStarted();
        await backgroundGate;
    };
    access.backgroundSyncEnabled = true;
    access.watcherModeStarted = true;

    const background = access.runBackgroundSync();
    manager.recordWatcherEvent(codebasePath, 'source_changed');
    await backgroundStarted;
    assert.equal(manager.getActiveLifecycleOperationCount(), 1);

    let drainCompleted = false;
    const drain = manager.stopAndDrainLifecycle().then(() => {
        drainCompleted = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(drainCompleted, false);

    releaseBackground();
    await background;
    await drain;
    assert.equal(drainCompleted, true);
    assert.equal(manager.getActiveLifecycleOperationCount(), 0);
    assert.equal(activityChanges, 2);
    assert.equal(access.backgroundSyncEnabled, false);
    assert.equal(access.backgroundSyncTimer, null);

    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('watch filter allowlists root ignore controls and hidden supported files', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const context = createContext();
    const snapshot = createSnapshot(statusByPath);
    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    const shouldIgnore = (manager as unknown as SyncManagerTestAccess).shouldIgnoreWatchPath(
        codebasePath,
        path.join(codebasePath, '.satoriignore')
    );
    assert.equal(shouldIgnore, false);

    const shouldIgnoreRootGitIgnore = (manager as unknown as SyncManagerTestAccess).shouldIgnoreWatchPath(
        codebasePath,
        path.join(codebasePath, '.gitignore')
    );
    assert.equal(shouldIgnoreRootGitIgnore, false);

    const shouldIgnoreHiddenSupportedFile = (manager as unknown as SyncManagerTestAccess).shouldIgnoreWatchPath(
        codebasePath,
        path.join(codebasePath, '.hidden/runtime.ts')
    );
    assert.equal(shouldIgnoreHiddenSupportedFile, false);

    assert.equal((manager as unknown as SyncManagerTestAccess).isIgnoreRuleControlFile('.gitignore'), true);
    assert.equal((manager as unknown as SyncManagerTestAccess).isIgnoreRuleControlFile('.satoriignore'), true);
    assert.equal((manager as unknown as SyncManagerTestAccess).isIgnoreRuleControlFile('nested/.gitignore'), false);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness baselines missing ignore signature only when no manifest or synchronizer exists', async () => {
    const codebasePath = createTempDir();
    fs.writeFileSync(path.join(codebasePath, '.satoriignore'), 'dist/**\n', 'utf8');

    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    let syncCalls = 0;
    let reloadCalls = 0;

    const context = {
        getActiveIgnorePatterns() {
            return ['node_modules/**'];
        },
        hasSynchronizerForCodebase() {
            return false;
        },
        async reloadIgnoreRulesForCodebase() {
            reloadCalls += 1;
            return ['node_modules/**', 'dist/**'];
        },
        async reindexByChange() {
            syncCalls += 1;
            return { added: 0, removed: 0, modified: 0, changedFiles: [] };
        }
    };

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });

    const decision = await manager.ensureFreshness(codebasePath, 60_000);
    assert.equal(decision.mode, 'synced');
    assert.equal(syncCalls, 1);
    assert.equal(reloadCalls, 0);
    assert.equal(typeof snapshot.getCodebaseIgnoreControlSignature(codebasePath), 'string');

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness marks requires_reindex when incremental navigation recovery fails', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    let syncCalls = 0;

    const context = {
        getActiveIgnorePatterns() {
            return ['node_modules/**'];
        },
        hasSynchronizerForCodebase() {
            return false;
        },
        async reindexByChange() {
            syncCalls += 1;
            return {
                added: 1,
                removed: 0,
                modified: 0,
                changedFiles: ['src/new.go'],
                navigationRecovery: 'failed',
            };
        }
    };

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });

    const decision = await manager.ensureFreshness(codebasePath, 0);

    assert.equal(syncCalls, 1);
    assert.equal(decision.mode, 'skipped_requires_reindex');
    assert.equal(statusByPath.get(codebasePath), 'requires_reindex');
    assert.equal(snapshot.getCodebaseRequiresReindex(codebasePath)?.reason, 'navigation_recovery_failed');

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness truthfully routes non-atomic backends to the supported full-rebuild lifecycle', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    const context = {
        getActiveIgnorePatterns() {
            return ['node_modules/**'];
        },
        hasSynchronizerForCodebase() {
            return false;
        },
        async reindexByChange() {
            throw new AtomicIncrementalPublicationUnsupportedError();
        },
    };
    const manager = new SyncManager(
        context as unknown as SyncContext,
        snapshot as unknown as SyncSnapshotManager,
        { watchEnabled: false },
    );

    const decision = await manager.ensureFreshness(codebasePath, 0);

    assert.equal(decision.mode, 'skipped_requires_reindex');
    assert.equal(statusByPath.get(codebasePath), 'requires_reindex');
    assert.deepEqual(snapshot.getCodebaseRequiresReindex(codebasePath), {
        reason: 'backend_requires_full_rebuild',
        message: 'The active vector backend cannot stage an atomic incremental publication; a full rebuild is required.',
    });

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness reconciles missing ignore signature when an indexed manifest exists', async () => {
    const codebasePath = createTempDir();
    fs.writeFileSync(path.join(codebasePath, '.satoriignore'), 'src/ignored.ts\n', 'utf8');

    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    snapshot.setCodebaseIndexManifest(codebasePath, ['src/keep.ts', 'src/ignored.ts']);

    let activePatterns: string[] = [];
    let trackedPaths = ['src/keep.ts', 'src/ignored.ts'];
    let reloadCalls = 0;
    let syncCalls = 0;
    const deletedPaths: string[][] = [];

    const context = {
        getActiveIgnorePatterns() {
            return activePatterns;
        },
        hasSynchronizerForCodebase() {
            return false;
        },
        async reloadIgnoreRulesForCodebase() {
            reloadCalls += 1;
            activePatterns = ['src/ignored.ts'];
            trackedPaths = ['src/keep.ts'];
            return activePatterns;
        },
        async recreateSynchronizerForCodebase() {
            return;
        },
        async deleteIndexedPathsByRelativePaths(_codebasePath: string, relativePaths: string[]) {
            deletedPaths.push(relativePaths.slice());
            return relativePaths.length;
        },
        getTrackedRelativePaths() {
            return trackedPaths.slice();
        },
        async reindexByChange() {
            syncCalls += 1;
            return { added: 0, removed: 0, modified: 0, changedFiles: [] };
        }
    };
    installAcceptedPolicyReconciliation(context);

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });

    const decision = await manager.ensureFreshness(codebasePath, 60_000);
    assert.equal(decision.mode, 'reconciled_ignore_change');
    assert.equal(decision.deletedFiles, 1);
    assert.equal(reloadCalls, 1);
    assert.equal(syncCalls, 1);
    assert.deepEqual(deletedPaths, [['src/ignored.ts']]);
    assert.equal(typeof snapshot.getCodebaseIgnoreControlSignature(codebasePath), 'string');

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('recordCurrentIgnoreControlSignature persists the current root ignore signature', async () => {
    const codebasePath = createTempDir();
    fs.writeFileSync(path.join(codebasePath, '.gitignore'), 'dist/**\n', 'utf8');

    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    const context = createContext();

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });

    await manager.recordCurrentIgnoreControlSignature(codebasePath);

    const signature = snapshot.getCodebaseIgnoreControlSignature(codebasePath);
    assert.equal(typeof signature, 'string');
    assert.match(signature || '', /^v1:/);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('recordObservedIgnoreControlSignature does not relabel an accepted policy after control files drift', async () => {
    const codebasePath = createTempDir();
    const ignorePath = path.join(codebasePath, '.satoriignore');
    fs.writeFileSync(ignorePath, 'data/\n', 'utf8');

    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    const manager = new SyncManager(
        createContext() as unknown as SyncContext,
        snapshot as unknown as SyncSnapshotManager,
        { watchEnabled: false },
    );

    await manager.recordCurrentIgnoreControlSignature(codebasePath);
    const acceptedSignature = snapshot.getCodebaseIgnoreControlSignature(codebasePath);
    assert.equal(typeof acceptedSignature, 'string');
    fs.writeFileSync(ignorePath, '# pattern removed\n', 'utf8');

    await manager.recordObservedIgnoreControlSignature(codebasePath, acceptedSignature!);
    assert.equal(snapshot.getCodebaseIgnoreControlSignature(codebasePath), acceptedSignature);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ignore-policy changes require reindex before reconciliation mutates indexed payload or acknowledges the new signature', async () => {
    const codebasePath = createTempDir();
    const ignorePath = path.join(codebasePath, '.satoriignore');
    fs.writeFileSync(ignorePath, '# no rules\n', 'utf8');

    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    snapshot.setCodebaseIndexManifest(codebasePath, ['src/keep.ts', 'src/data/value.ts']);
    let activateCalls = 0;
    let deleteCalls = 0;
    let syncCalls = 0;
    const context = {
        ...createContext(),
        async observeIndexPolicyForIncrementalReconciliation() {
            return { controlSignature: 'v1:changed-policy-observation' };
        },
        activateObservedIndexPolicyForIncrementalReconciliation() {
            activateCalls += 1;
            return false;
        },
        async deleteIndexedPathsByRelativePaths() {
            deleteCalls += 1;
            return 0;
        },
        async reindexByChange() {
            syncCalls += 1;
            return { added: 0, removed: 0, modified: 0 };
        },
    };
    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });

    await manager.recordCurrentIgnoreControlSignature(codebasePath);
    const acceptedSignature = snapshot.getCodebaseIgnoreControlSignature(codebasePath);
    fs.writeFileSync(ignorePath, 'data/\n', 'utf8');

    const decision = await manager.ensureFreshness(codebasePath, 60_000);
    assert.equal(decision.mode, 'skipped_requires_reindex');
    assert.equal(activateCalls, 1);
    assert.equal(deleteCalls, 0);
    assert.equal(syncCalls, 0);
    assert.equal(snapshot.getCodebaseIgnoreControlSignature(codebasePath), acceptedSignature);
    assert.equal(snapshot.getCodebaseRequiresReindex(codebasePath)?.reason, 'index_policy_changed');

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness does not baseline ignore control signature for non-searchable states', async () => {
    const codebasePath = createTempDir();
    fs.writeFileSync(path.join(codebasePath, '.satoriignore'), 'dist/**\n', 'utf8');

    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'requires_reindex']]);
    const snapshot = createSnapshot(statusByPath);
    const context = createContext();

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });

    const decision = await manager.ensureFreshness(codebasePath, 60_000);
    assert.equal(decision.mode, 'skipped_requires_reindex');
    assert.equal(snapshot.getCodebaseIgnoreControlSignature(codebasePath), undefined);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness returns skipped_indexing for actively indexing codebases', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexing']]);
    const snapshot = createSnapshot(statusByPath);
    const context = createContext();

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });

    const decision = await manager.ensureFreshness(codebasePath, 60_000);
    assert.equal(decision.mode, 'skipped_indexing');
    assert.equal(context.calls, 0);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness detects ignore control signature changes and reconciles before skipped_recent', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    snapshot.setCodebaseIndexManifest(codebasePath, ['src/keep.ts', 'src/ignored.ts']);

    let activePatterns: string[] = [];
    let trackedPaths = ['src/keep.ts', 'src/ignored.ts'];
    let syncCalls = 0;
    const deletedPaths: string[][] = [];

    const context = {
        getActiveIgnorePatterns() {
            return activePatterns;
        },
        hasSynchronizerForCodebase() {
            return false;
        },
        async reloadIgnoreRulesForCodebase() {
            activePatterns = ['src/ignored.ts'];
            trackedPaths = ['src/keep.ts'];
            return activePatterns;
        },
        async recreateSynchronizerForCodebase() {
            return;
        },
        async deleteIndexedPathsByRelativePaths(_codebasePath: string, relativePaths: string[]) {
            deletedPaths.push(relativePaths.slice());
            return relativePaths.length;
        },
        getTrackedRelativePaths() {
            return trackedPaths.slice();
        },
        async reindexByChange() {
            syncCalls += 1;
            return { added: 0, removed: 0, modified: 0, changedFiles: [] };
        }
    };
    installAcceptedPolicyReconciliation(context);

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });

    await manager.recordCurrentIgnoreControlSignature(codebasePath);
    const baseline = await manager.ensureFreshness(codebasePath, 0);
    assert.equal(baseline.mode, 'synced');
    const baselineSignature = snapshot.getCodebaseIgnoreControlSignature(codebasePath);
    assert.equal(typeof baselineSignature, 'string');
    assert.equal(syncCalls, 1);

    fs.writeFileSync(path.join(codebasePath, '.satoriignore'), 'src/ignored.ts\n', 'utf8');

    const decision = await manager.ensureFreshness(codebasePath, 60_000);
    assert.equal(decision.mode, 'reconciled_ignore_change');
    assert.equal(decision.deletedFiles, 1);
    assert.deepEqual(deletedPaths, [['src/ignored.ts']]);
    assert.equal(syncCalls, 2);

    const updatedSignature = snapshot.getCodebaseIgnoreControlSignature(codebasePath);
    assert.equal(typeof updatedSignature, 'string');
    assert.notEqual(updatedSignature, baselineSignature);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness detects same-size ignore control content changes with unchanged mtime', async () => {
    const codebasePath = createTempDir();
    const ignorePath = path.join(codebasePath, '.satoriignore');
    const fixedTime = new Date('2026-03-16T12:00:00.000Z');
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    snapshot.setCodebaseIndexManifest(codebasePath, ['src/keep.ts', 'src/b.ts']);

    fs.writeFileSync(ignorePath, 'src/a.ts\n', 'utf8');
    fs.utimesSync(ignorePath, fixedTime, fixedTime);

    let activePatterns = ['src/a.ts'];
    let trackedPaths = ['src/keep.ts', 'src/b.ts'];
    let syncCalls = 0;
    const deletedPaths: string[][] = [];

    const context = {
        getActiveIgnorePatterns() {
            return activePatterns;
        },
        hasSynchronizerForCodebase() {
            return false;
        },
        async reloadIgnoreRulesForCodebase() {
            activePatterns = fs.readFileSync(ignorePath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
            trackedPaths = ['src/keep.ts'];
            return activePatterns;
        },
        async recreateSynchronizerForCodebase() {
            return;
        },
        async deleteIndexedPathsByRelativePaths(_codebasePath: string, relativePaths: string[]) {
            deletedPaths.push(relativePaths.slice());
            return relativePaths.length;
        },
        getTrackedRelativePaths() {
            return trackedPaths.slice();
        },
        async reindexByChange() {
            syncCalls += 1;
            return { added: 0, removed: 0, modified: 0, changedFiles: [] };
        }
    };
    installAcceptedPolicyReconciliation(context);

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });

    await manager.recordCurrentIgnoreControlSignature(codebasePath);
    const baseline = await manager.ensureFreshness(codebasePath, 0);
    assert.equal(baseline.mode, 'synced');
    const baselineSignature = snapshot.getCodebaseIgnoreControlSignature(codebasePath);
    assert.equal(typeof baselineSignature, 'string');
    assert.equal(syncCalls, 1);

    fs.writeFileSync(ignorePath, 'src/b.ts\n', 'utf8');
    fs.utimesSync(ignorePath, fixedTime, fixedTime);

    const decision = await manager.ensureFreshness(codebasePath, 60_000);
    assert.equal(decision.mode, 'reconciled_ignore_change');
    assert.equal(decision.deletedFiles, 1);
    assert.deepEqual(deletedPaths, [['src/b.ts']]);
    assert.equal(syncCalls, 2);
    assert.notEqual(snapshot.getCodebaseIgnoreControlSignature(codebasePath), baselineSignature);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ensureFreshness coalesces non-watcher ignore signature reconciles while one is in flight', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    snapshot.setCodebaseIndexManifest(codebasePath, ['src/keep.ts', 'src/ignored.ts']);

    let activePatterns: string[] = [];
    let trackedPaths = ['src/keep.ts', 'src/ignored.ts'];
    let reloadCalls = 0;
    let syncCalls = 0;
    const deletedPaths: string[][] = [];

    const context = {
        getActiveIgnorePatterns() {
            return activePatterns;
        },
        hasSynchronizerForCodebase() {
            return false;
        },
        async reloadIgnoreRulesForCodebase() {
            reloadCalls += 1;
            activePatterns = ['src/ignored.ts'];
            trackedPaths = ['src/keep.ts'];
            await wait(40);
            return activePatterns;
        },
        async recreateSynchronizerForCodebase() {
            return;
        },
        async deleteIndexedPathsByRelativePaths(_codebasePath: string, relativePaths: string[]) {
            deletedPaths.push(relativePaths.slice());
            return relativePaths.length;
        },
        getTrackedRelativePaths() {
            return trackedPaths.slice();
        },
        async reindexByChange() {
            syncCalls += 1;
            return { added: 0, removed: 0, modified: 0, changedFiles: [] };
        }
    };
    installAcceptedPolicyReconciliation(context);

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: false,
    });

    await manager.recordCurrentIgnoreControlSignature(codebasePath);
    const baseline = await manager.ensureFreshness(codebasePath, 0);
    assert.equal(baseline.mode, 'synced');
    assert.equal(syncCalls, 1);

    fs.writeFileSync(path.join(codebasePath, '.satoriignore'), 'src/ignored.ts\n', 'utf8');
    const p1 = manager.ensureFreshness(codebasePath, 60_000);
    await wait(5);
    const p2 = manager.ensureFreshness(codebasePath, 60_000);

    const first = await p1;
    const second = await p2;

    assert.equal(first.mode, 'reconciled_ignore_change');
    assert.equal(second.mode, 'coalesced');
    assert.equal(reloadCalls, 1);
    assert.equal(syncCalls, 2);
    assert.deepEqual(deletedPaths, [['src/ignored.ts']]);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ignore-change reconciliation deletes newly ignored indexed paths and forces sync', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);

    let activePatterns = ['dist/**'];
    let syncCalls = 0;
    const deletedPaths: string[][] = [];

    const snapshot = createSnapshot(statusByPath);
    snapshot.setCodebaseIndexManifest(codebasePath, ['src/keep.ts', 'src/ignored.ts']);

    const context = {
        getActiveIgnorePatterns() {
            return activePatterns;
        },
        hasSynchronizerForCodebase() {
            return false;
        },
        async reloadIgnoreRulesForCodebase() {
            activePatterns = ['dist/**', 'src/ignored.ts'];
            return activePatterns;
        },
        async recreateSynchronizerForCodebase() {
            return;
        },
        async deleteIndexedPathsByRelativePaths(_codebasePath: string, relativePaths: string[]) {
            deletedPaths.push(relativePaths.slice());
            return relativePaths.length;
        },
        getTrackedRelativePaths() {
            return ['src/keep.ts', 'src/new.ts'];
        },
        async reindexByChange() {
            syncCalls += 1;
            return { added: 1, removed: 0, modified: 0, changedFiles: ['src/new.ts'] };
        }
    };
    installAcceptedPolicyReconciliation(context);

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    const decision = await manager.ensureFreshness(codebasePath, 0, {
        reason: 'ignore_change',
        coalescedEdits: 2,
    });

    assert.equal(decision.mode, 'reconciled_ignore_change');
    assert.equal(decision.deletedFiles, 1);
    assert.equal(decision.newlyIgnoredFiles, 1);
    assert.equal(decision.addedFiles, 1);
    assert.equal(decision.coalescedEdits, 2);
    assert.equal(decision.ignoreRulesVersion, 1);
    assert.equal(syncCalls, 1);
    assert.deepEqual(deletedPaths, [['src/ignored.ts']]);
    assert.deepEqual(snapshot.getCodebaseIndexedPaths(codebasePath), ['src/keep.ts', 'src/new.ts']);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ignore-change reconciliation marks requires_reindex when sync fails after deleting ignored indexed paths', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);

    let activePatterns = ['dist/**'];
    let syncCalls = 0;
    const deletedPaths: string[][] = [];

    const snapshot = createSnapshot(statusByPath);
    snapshot.setCodebaseIndexManifest(codebasePath, ['src/keep.ts', 'src/ignored.ts']);

    const context = {
        getActiveIgnorePatterns() {
            return activePatterns;
        },
        hasSynchronizerForCodebase() {
            return false;
        },
        async reloadIgnoreRulesForCodebase() {
            activePatterns = ['dist/**', 'src/ignored.ts'];
            return activePatterns;
        },
        async recreateSynchronizerForCodebase() {
            return;
        },
        async deleteIndexedPathsByRelativePaths(_codebasePath: string, relativePaths: string[]) {
            deletedPaths.push(relativePaths.slice());
            return relativePaths.length;
        },
        getTrackedRelativePaths() {
            return ['src/keep.ts'];
        },
        async reindexByChange() {
            syncCalls += 1;
            throw new Error('forced sync failure');
        }
    };
    installAcceptedPolicyReconciliation(context);

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    const decision = await manager.ensureFreshness(codebasePath, 0, {
        reason: 'ignore_change',
        coalescedEdits: 1,
    });

    assert.equal(decision.mode, 'ignore_reload_failed');
    assert.equal(decision.fallbackSyncExecuted, false);
    assert.equal(syncCalls, 2);
    assert.deepEqual(deletedPaths, [['src/ignored.ts']]);
    assert.equal(statusByPath.get(codebasePath), 'requires_reindex');
    assert.equal(snapshot.getCodebaseRequiresReindex(codebasePath)?.reason, 'navigation_recovery_failed');
    assert.match(snapshot.getCodebaseRequiresReindex(codebasePath)?.message || '', /Ignore-rule reconciliation/);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ignore-change reconcile uses manifest paths captured before reload even when post-reload synchronizer excludes them', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);

    let activePatterns = ['dist/**'];
    const snapshot = createSnapshot(statusByPath);
    snapshot.setCodebaseIndexManifest(codebasePath, ['src/keep.ts', 'src/ignored.ts']);

    const deletedPaths: string[][] = [];
    let syncCalls = 0;
    const context = {
        getActiveIgnorePatterns() {
            return activePatterns;
        },
        hasSynchronizerForCodebase() {
            return true;
        },
        async reloadIgnoreRulesForCodebase() {
            activePatterns = ['dist/**', 'src/ignored.ts'];
            return activePatterns;
        },
        async recreateSynchronizerForCodebase() {
            return;
        },
        getTrackedRelativePaths() {
            // Post-reload view no longer includes ignored file; reconcile must still delete it from manifest.
            return ['src/keep.ts'];
        },
        async deleteIndexedPathsByRelativePaths(_codebasePath: string, relativePaths: string[]) {
            deletedPaths.push(relativePaths.slice());
            return relativePaths.length;
        },
        async reindexByChange() {
            syncCalls += 1;
            return { added: 0, removed: 0, modified: 0, changedFiles: [] };
        },
    };
    installAcceptedPolicyReconciliation(context);

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    const decision = await manager.ensureFreshness(codebasePath, 0, {
        reason: 'ignore_change',
        coalescedEdits: 1,
    });

    assert.equal(decision.mode, 'reconciled_ignore_change');
    assert.equal(decision.deletedFiles, 1);
    assert.deepEqual(deletedPaths, [['src/ignored.ts']]);
    assert.equal(syncCalls, 1);
    assert.deepEqual(snapshot.getCodebaseIndexedPaths(codebasePath), ['src/keep.ts']);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ignore-change reconciliation runs after in-flight sync and is not skipped by freshness window', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);

    const snapshot = createSnapshot(statusByPath);
    snapshot.setCodebaseIndexManifest(codebasePath, ['src/a.ts']);

    let syncCalls = 0;
    let releaseFirstSync: () => void = () => {
        assert.fail('First sync gate was not initialized.');
    };
    const firstSyncGate = new Promise<void>((resolve) => {
        releaseFirstSync = resolve;
    });

    const context = {
        getActiveIgnorePatterns() {
            return [];
        },
        hasSynchronizerForCodebase() {
            return false;
        },
        async reloadIgnoreRulesForCodebase() {
            return [];
        },
        async recreateSynchronizerForCodebase() {
            return;
        },
        async deleteIndexedPathsByRelativePaths() {
            return 0;
        },
        getTrackedRelativePaths() {
            return ['src/a.ts'];
        },
        async reindexByChange() {
            syncCalls += 1;
            if (syncCalls === 1) {
                await firstSyncGate;
            }
            return { added: 0, removed: 0, modified: 0, changedFiles: [] };
        }
    };
    installAcceptedPolicyReconciliation(context);

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    await manager.recordCurrentIgnoreControlSignature(codebasePath);
    const inFlightSync = manager.ensureFreshness(codebasePath, 0);
    await wait(20);

    const ignoreDecisionPromise = manager.ensureFreshness(codebasePath, 60_000, {
        reason: 'ignore_change',
        coalescedEdits: 1,
    });

    await wait(20);
    assert.equal(syncCalls, 1);

    releaseFirstSync();
    await inFlightSync;

    const ignoreDecision = await ignoreDecisionPromise;
    assert.equal(ignoreDecision.mode, 'reconciled_ignore_change');
    assert.equal(syncCalls, 2);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ignore-change returns ignore_reload_failed with fallback sync when manifest and synchronizer are missing', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);

    let syncCalls = 0;
    const context = {
        getActiveIgnorePatterns() {
            return [];
        },
        hasSynchronizerForCodebase() {
            return false;
        },
        async reloadIgnoreRulesForCodebase() {
            return [];
        },
        async recreateSynchronizerForCodebase() {
            return;
        },
        async reindexByChange() {
            syncCalls += 1;
            return { added: 0, removed: 0, modified: 0, changedFiles: [] };
        }
    };
    installAcceptedPolicyReconciliation(context);

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    const decision = await manager.ensureFreshness(codebasePath, 0, {
        reason: 'ignore_change',
        coalescedEdits: 1,
    });

    assert.equal(decision.mode, 'ignore_reload_failed');
    assert.equal(decision.fallbackSyncExecuted, true);
    assert.equal(syncCalls, 1);
    assert.match(String(decision.errorMessage), /missing_manifest_and_synchronizer/);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('ignore_rules_changed remains pending until the existing reconcile path runs', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const snapshot = createSnapshot(statusByPath);
    snapshot.setCodebaseIndexManifest(codebasePath, ['src/keep.ts', 'src/ignored.ts']);

    let activePatterns = ['dist/**'];
    let syncCalls = 0;
    const deletedPaths: string[][] = [];
    const context = {
        getActiveIgnorePatterns() {
            return activePatterns;
        },
        hasSynchronizerForCodebase() {
            return false;
        },
        async reloadIgnoreRulesForCodebase() {
            activePatterns = ['dist/**', 'src/ignored.ts'];
            return activePatterns;
        },
        async recreateSynchronizerForCodebase() {
            return;
        },
        async deleteIndexedPathsByRelativePaths(_codebasePath: string, relativePaths: string[]) {
            deletedPaths.push(relativePaths.slice());
            return relativePaths.length;
        },
        getTrackedRelativePaths() {
            return ['src/keep.ts'];
        },
        async reindexByChange() {
            syncCalls += 1;
            return { added: 0, removed: 0, modified: 0, changedFiles: [] };
        }
    };
    installAcceptedPolicyReconciliation(context);

    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    const access = manager as unknown as SyncManagerTestAccess;
    access.watcherModeStarted = true;
    access.setWatcherCoverage(codebasePath, 'ready');
    manager.recordWatcherEvent(codebasePath, 'ignore_rules_changed');
    await wait(100);

    assert.equal(syncCalls, 0);
    assert.equal(manager.getWatcherObservation(codebasePath).pending, true);

    const decision = await manager.ensureFreshness(codebasePath, 0, {
        reason: 'ignore_change',
        coalescedEdits: 1,
    });

    assert.equal(decision.mode, 'reconciled_ignore_change');
    assert.equal(syncCalls, 1);
    assert.deepEqual(deletedPaths, [['src/ignored.ts']]);
    assert.equal(snapshot.getCodebaseIgnoreRulesVersion(codebasePath), 1);
    assert.equal(manager.getWatcherObservation(codebasePath).pending, false);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('registering watcher does not increment ignore rules version', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const context = createContext();
    const snapshot = createSnapshot(statusByPath);
    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    (manager as unknown as SyncManagerTestAccess).watcherModeStarted = true;
    await manager.registerCodebaseWatcher(codebasePath);
    assert.equal(snapshot.getCodebaseIgnoreRulesVersion(codebasePath), undefined);

    await manager.unregisterCodebaseWatcher(codebasePath);
    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('registering watcher contains ignore matcher failures', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const context = createContext();
    const snapshot = createSnapshot(statusByPath);
    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });
    const access = manager as unknown as SyncManagerTestAccess & {
        buildIgnoreMatcherForCodebase(codebasePath: string): Promise<unknown>;
    };

    access.watcherModeStarted = true;
    access.buildIgnoreMatcherForCodebase = async () => {
        throw new Error('invalid ignore matcher');
    };

    await manager.registerCodebaseWatcher(codebasePath);

    assert.equal(access.watchers.has(codebasePath), false);
    assert.equal(access.watcherIgnoreMatchers.has(codebasePath), false);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('candidate-bound watcher observes paths included by the candidate policy', async () => {
    await withCandidateWatcher({
        activeIgnorePatterns: ['src/generated/**'],
        beforeStart(codebasePath) {
            fs.mkdirSync(path.join(codebasePath, 'src', 'generated'), { recursive: true });
        },
    }, async ({ codebasePath, manager, mutationCalls }) => {
        const observedBeforeWrite = manager.getWatcherObservation(codebasePath).observedEventEpoch;
        fs.writeFileSync(path.join(codebasePath, 'src', 'generated', 'included.ts'), 'export const included = true;\n');
        const deadline = Date.now() + 2_000;
        while (manager.getWatcherObservation(codebasePath).observedEventEpoch <= observedBeforeWrite) {
            assert.ok(Date.now() < deadline, 'Expected candidate-bound watcher to observe the included path.');
            await wait(10);
        }

        const observation = manager.getWatcherObservation(codebasePath);
        assert.ok(observation.observedEventEpoch > observedBeforeWrite);
        assert.equal(observation.pending, true);
        assert.equal(mutationCalls(), 0);
    });
});

test('candidate watcher capture binds the ready generation and event epoch to its policy', async () => {
    await withCandidateWatcher({}, async ({ codebasePath, access }) => {
        const capture = access.captureWatcherBootstrap(codebasePath, 'candidate-policy-v1');
        assert.deepEqual(capture, {
            canonicalRoot: path.resolve(codebasePath),
            watcherGeneration: 1,
            observedEventEpoch: 0,
            candidatePolicyHash: 'candidate-policy-v1',
        });
    });
});

test('candidate watcher capture fails closed while the watcher is starting or failed', async () => {
    await withCandidateWatcher({}, async ({ codebasePath, access }) => {
        access.setWatcherCoverage(codebasePath, 'starting');
        assert.equal(
            access.captureWatcherBootstrap(codebasePath, 'candidate-policy-v1'),
            undefined,
        );
        access.setWatcherCoverage(codebasePath, 'failed', 'WATCHER_FAILED');
        assert.equal(
            access.captureWatcherBootstrap(codebasePath, 'candidate-policy-v1'),
            undefined,
        );
    });
});

test('failed candidate observation restores the active ignore policy with a new watcher generation', async () => {
    await withCandidateWatcher({ activeIgnorePatterns: ['src/generated/**'] }, async ({
        codebasePath,
        access,
    }) => {
        const capture = access.captureWatcherBootstrap(codebasePath, 'candidate-policy-v1');
        assert.ok(capture);
        assert.equal(
            access.shouldIgnoreWatchPath(codebasePath, path.join(codebasePath, 'src/generated/file.ts')),
            false,
        );

        assert.equal(
            await access.restoreActiveWatcherPolicy(codebasePath, 'candidate-policy-v1'),
            true,
        );
        while (access.watcherLifecycleStates.get(codebasePath) !== 'ready') {
            await wait(5);
        }

        assert.equal(
            access.shouldIgnoreWatchPath(codebasePath, path.join(codebasePath, 'src/generated/file.ts')),
            true,
        );
        const restoredCapture = access.captureWatcherBootstrap(codebasePath, 'candidate-policy-v1');
        assert.equal(restoredCapture, undefined);
    });
});

test('full-index source handoff binds the exact checkpoint and makes prepared reads available', async () => {
    await withCandidateWatcher({}, async ({
        codebasePath,
        manager,
        access,
        checkpointObservation,
        provenGeneration,
    }) => {
        const capture = access.captureWatcherBootstrap(codebasePath, 'candidate-policy-v1');
        assert.ok(capture);
        access.beginFullIndexSourceHandoff(codebasePath, {
            candidatePolicyHash: 'candidate-policy-v1',
            markerRunId: provenGeneration.marker.runId,
        });

        const handedOff = await access.completeFullIndexSourceHandoff(codebasePath, {
            capture,
            candidatePolicyHash: 'candidate-policy-v1',
            checkpointObservation,
            provenGeneration,
        });

        assert.equal(handedOff, true);
        assert.deepEqual(manager.getPreparedReadObservation(codebasePath), {
            available: true,
            observation: {
                freshnessEpoch: 0,
                watcherState: 'ready',
                checkpointObservation,
            },
        });
    });
});

test('same-policy full-index candidate explicitly blocks an older prepared-source proof until rollback', async () => {
    await withCandidateWatcher({}, async ({
        codebasePath,
        manager,
        access,
        checkpointObservation,
        provenGeneration,
    }) => {
        const capture = access.captureWatcherBootstrap(codebasePath, 'candidate-policy-v1');
        assert.ok(capture);
        access.beginFullIndexSourceHandoff(codebasePath, {
            candidatePolicyHash: 'candidate-policy-v1',
            markerRunId: provenGeneration.marker.runId,
        });
        assert.equal(await access.completeFullIndexSourceHandoff(codebasePath, {
            capture,
            candidatePolicyHash: 'candidate-policy-v1',
            checkpointObservation,
            provenGeneration,
        }), true);
        assert.equal(manager.getPreparedReadObservation(codebasePath).available, true);

        access.beginFullIndexSourceHandoff(codebasePath, {
            candidatePolicyHash: 'candidate-policy-v1',
            markerRunId: 'marker-candidate-v2',
        });

        const rejectedGeneration = {
            ...provenGeneration,
            marker: {
                ...provenGeneration.marker,
                runId: 'marker-candidate-v2',
            },
        };
        assert.equal(await access.completeFullIndexSourceHandoff(codebasePath, {
            capture,
            candidatePolicyHash: 'candidate-policy-v1',
            checkpointObservation,
            provenGeneration: rejectedGeneration,
        }), false);

        assert.deepEqual(manager.getPreparedReadObservation(codebasePath), {
            available: false,
            reason: 'checkpoint_unverified',
            freshnessEpoch: 0,
            watcherState: 'ready',
        });
        assert.equal(manager.getPreparedReadDiagnostics(codebasePath).checkpointStatus, 'unverified');
        assert.equal(access.rejectFullIndexSourceHandoff(codebasePath, {
            candidatePolicyHash: 'candidate-policy-v1',
            markerRunId: 'marker-candidate-v2',
        }), true);
        assert.equal(manager.getPreparedReadObservation(codebasePath).available, true);
    });
});

test('a successful exact sync supersedes a retained full-index source handoff barrier', async () => {
    await withCandidateWatcher({}, async ({
        codebasePath,
        manager,
        access,
        provenGeneration,
        setStatus,
    }) => {
        access.beginFullIndexSourceHandoff(codebasePath, {
            candidatePolicyHash: 'candidate-policy-v1',
            markerRunId: provenGeneration.marker.runId,
        });
        setStatus('indexed');

        const decision = await manager.ensureFreshness(codebasePath, 0, {
            skipIgnoreControlCheck: true,
        });

        assert.equal(decision.mode, 'synced');
        assert.equal(manager.getPreparedReadObservation(codebasePath).available, true);
    });
});

test('full-index source handoff leaves an event after capture pending', async () => {
    await withCandidateWatcher({}, async ({
        codebasePath,
        manager,
        access,
        checkpointObservation,
        provenGeneration,
    }) => {
        const capture = access.captureWatcherBootstrap(codebasePath, 'candidate-policy-v1');
        assert.ok(capture);
        access.beginFullIndexSourceHandoff(codebasePath, {
            candidatePolicyHash: 'candidate-policy-v1',
            markerRunId: provenGeneration.marker.runId,
        });
        assert.equal(manager.recordWatcherEvent(codebasePath, 'source_changed'), 1);

        const handedOff = await access.completeFullIndexSourceHandoff(codebasePath, {
            capture,
            candidatePolicyHash: 'candidate-policy-v1',
            checkpointObservation,
            provenGeneration,
        });

        assert.equal(handedOff, false);
        assert.deepEqual(manager.getPreparedReadObservation(codebasePath), {
            available: false,
            reason: 'watcher_event_pending',
            freshnessEpoch: 1,
            watcherState: 'ready',
        });
    });
});

test('full-index source handoff fails closed when the watcher generation is replaced', async () => {
    await withCandidateWatcher({}, async ({
        codebasePath,
        manager,
        access,
        checkpointObservation,
        provenGeneration,
    }) => {
        const capture = access.captureWatcherBootstrap(codebasePath, 'candidate-policy-v1');
        assert.ok(capture);
        access.beginFullIndexSourceHandoff(codebasePath, {
            candidatePolicyHash: 'candidate-policy-v1',
            markerRunId: provenGeneration.marker.runId,
        });

        await access.touchWatchedCodebase(codebasePath, {
            policyHash: 'candidate-policy-v2',
            effectiveIgnorePatterns: [],
        });
        while (access.watcherLifecycleStates.get(codebasePath) !== 'ready') {
            await wait(5);
        }

        const handedOff = await access.completeFullIndexSourceHandoff(codebasePath, {
            capture,
            candidatePolicyHash: 'candidate-policy-v1',
            checkpointObservation,
            provenGeneration,
        });

        assert.equal(handedOff, false);
        assert.notEqual(manager.getPreparedReadObservation(codebasePath).available, true);
    });
});

test('startWatcherMode does not automatically watch every indexed codebase from snapshot state', async () => {
    const codebasePathA = createTempDir();
    const codebasePathB = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([
        [codebasePathA, 'indexed'],
        [codebasePathB, 'sync_completed'],
    ]);
    const context = createContext();
    const snapshot = createSnapshot(statusByPath);
    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    await manager.startWatcherMode();

    assert.equal((manager as unknown as SyncManagerTestAccess).watchers.size, 0);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePathA, { recursive: true, force: true });
    fs.rmSync(codebasePathB, { recursive: true, force: true });
});

test('touchWatchedCodebase registers only explicitly touched codebases and unwatchCodebase removes them', async () => {
    const codebasePathA = createTempDir();
    const codebasePathB = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([
        [codebasePathA, 'indexed'],
        [codebasePathB, 'indexed'],
    ]);
    const context = createContext();
    const snapshot = createSnapshot(statusByPath);
    const manager = new SyncManager(context as unknown as SyncContext, snapshot as unknown as SyncSnapshotManager, {
        watchEnabled: true,
        watchDebounceMs: 20,
    });

    await manager.startWatcherMode();
    await (manager as unknown as SyncManagerTestAccess).touchWatchedCodebase(codebasePathA);

    assert.equal((manager as unknown as SyncManagerTestAccess).watchers.has(codebasePathA), true);
    assert.equal((manager as unknown as SyncManagerTestAccess).watchers.has(codebasePathB), false);

    await (manager as unknown as SyncManagerTestAccess).touchWatchedCodebase(codebasePathB);
    assert.equal((manager as unknown as SyncManagerTestAccess).watchers.has(codebasePathB), true);

    await (manager as unknown as SyncManagerTestAccess).unwatchCodebase(codebasePathA);
    assert.equal((manager as unknown as SyncManagerTestAccess).watchers.has(codebasePathA), false);
    assert.equal((manager as unknown as SyncManagerTestAccess).watchers.has(codebasePathB), true);

    await manager.stopWatcherMode();
    fs.rmSync(codebasePathA, { recursive: true, force: true });
    fs.rmSync(codebasePathB, { recursive: true, force: true });
});

test('prepared read observation fails closed on watcher activity and root eviction clears passive state', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const manager = new SyncManager(
        createContext() as unknown as SyncContext,
        createSnapshot(statusByPath) as unknown as SyncSnapshotManager,
        { watchEnabled: true, watchDebounceMs: 60_000 },
    );
    const access = manager as unknown as SyncManagerTestAccess;

    await manager.startWatcherMode();
    await manager.touchWatchedCodebase(codebasePath);
    while (access.watcherLifecycleStates.get(codebasePath) !== 'ready') {
        await wait(5);
    }
    const observation = access.watcherObservations.get(codebasePath);
    assert.ok(observation);
    delete observation.coverageGapSinceEpoch;
    access.lastSyncTimes.set(codebasePath, 1);
    access.ignoreRulesVersions.set(codebasePath, 2);

    const before = manager.getPreparedReadObservation(codebasePath);
    assert.deepEqual(before, {
        available: true,
        observation: { freshnessEpoch: 0, watcherState: 'ready' },
    });

    manager.recordWatcherEvent(codebasePath, 'source_changed');
    assert.deepEqual(manager.getPreparedReadObservation(codebasePath), {
        available: false,
        reason: 'watcher_event_pending',
        freshnessEpoch: 1,
        watcherState: 'ready',
    });

    await manager.unwatchCodebase(codebasePath);
    assert.equal(access.lastSyncTimes.has(codebasePath), false);
    assert.equal(access.ignoreRulesVersions.has(codebasePath), false);
    assert.deepEqual(manager.getPreparedReadObservation(codebasePath), {
        available: false,
        reason: 'root_not_registered',
        freshnessEpoch: 0,
    });

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('prepared read observation distinguishes watcher startup from readiness', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const manager = new SyncManager(
        createContext() as unknown as SyncContext,
        createSnapshot(statusByPath) as unknown as SyncSnapshotManager,
        { watchEnabled: true },
    );
    const access = manager as unknown as SyncManagerTestAccess;
    access.watcherModeStarted = true;
    access.watchedCodebases.add(codebasePath);
    access.watchers.set(codebasePath, { close: async () => undefined });
    access.setWatcherCoverage(codebasePath, 'starting');

    assert.deepEqual(manager.getPreparedReadObservation(codebasePath), {
        available: false,
        reason: 'watcher_starting',
        freshnessEpoch: 0,
        watcherState: 'starting',
    });
    assert.deepEqual(manager.getPreparedReadDiagnostics(codebasePath), {
        configured: true,
        managerStarted: true,
        rootRegistered: true,
        watcherActive: false,
        lifecycleState: 'starting',
        checkpointStatus: 'unverified',
    });

    access.setWatcherCoverage(codebasePath, 'ready');
    assert.deepEqual(manager.getPreparedReadObservation(codebasePath), {
        available: false,
        reason: 'watcher_observation_gap',
        freshnessEpoch: 0,
        watcherState: 'ready',
    });

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('prepared read observation fails closed after a watcher error', async (t) => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const manager = new SyncManager(
        createContext() as unknown as SyncContext,
        createSnapshot(statusByPath) as unknown as SyncSnapshotManager,
        { watchEnabled: true, watchDebounceMs: 60_000 },
    );
    const access = manager as unknown as SyncManagerTestAccess;
    t.mock.method(console, 'error', () => undefined);

    await manager.startWatcherMode();
    await manager.touchWatchedCodebase(codebasePath);
    while (access.watcherLifecycleStates.get(codebasePath) !== 'ready') {
        await wait(5);
    }
    const observation = access.watcherObservations.get(codebasePath);
    assert.ok(observation);
    delete observation.coverageGapSinceEpoch;
    assert.equal(manager.getPreparedReadObservation(codebasePath).available, true);

    await access.handleWatcherError(codebasePath, new Error('watcher failed'));

    assert.deepEqual(manager.getPreparedReadObservation(codebasePath), {
        available: false,
        reason: 'watcher_failed',
        freshnessEpoch: 1,
        watcherState: 'failed',
    });
    assert.equal(access.watchers.has(codebasePath), false);
    assert.equal(access.freshnessEpochs.get(codebasePath), 1);
    assert.deepEqual(manager.getPreparedReadDiagnostics(codebasePath), {
        configured: true,
        managerStarted: true,
        rootRegistered: true,
        watcherActive: false,
        lifecycleState: 'failed',
        lastErrorCode: 'WATCHER_ERROR',
        checkpointStatus: 'unverified',
    });

    await manager.stopWatcherMode();
    fs.rmSync(codebasePath, { recursive: true, force: true });
});

test('watcher diagnostics retain ENOSPC after watcher mode shuts down', async () => {
    const codebasePath = createTempDir();
    const statusByPath = new Map<string, CodebaseStatus>([[codebasePath, 'indexed']]);
    const manager = new SyncManager(
        createContext() as unknown as SyncContext,
        createSnapshot(statusByPath) as unknown as SyncSnapshotManager,
        { watchEnabled: true },
    );
    const access = manager as unknown as SyncManagerTestAccess;
    access.watcherModeStarted = true;
    access.watchedCodebases.add(codebasePath);
    access.watcherLifecycleStates.set(codebasePath, 'ready');
    access.watchers.set(codebasePath, { close: async () => undefined });

    const watcherError = Object.assign(new Error('inotify watch limit reached'), {
        code: 'ENOSPC',
    });
    await access.handleWatcherError(codebasePath, watcherError);

    assert.deepEqual(manager.getPreparedReadDiagnostics(codebasePath), {
        configured: true,
        managerStarted: false,
        rootRegistered: false,
        watcherActive: false,
        lastErrorCode: 'ENOSPC',
        checkpointStatus: 'unverified',
    });
    assert.deepEqual(manager.getPreparedReadObservation(codebasePath), {
        available: false,
        reason: 'watcher_manager_not_started',
        freshnessEpoch: 0,
    });

    fs.rmSync(codebasePath, { recursive: true, force: true });
});
