import test from 'node:test';
import assert from 'node:assert/strict';
import { SourceObservationState } from './source-observation-state.js';
import type { SourceObservationStateDependencies } from './source-observation-state.js';
import type {
    FullIndexSourceHandoffInput,
    WatcherBootstrapCapture,
} from './sync.js';
import type { ProvenVectorGenerationReceipt } from '@zokizuan/satori-core';

const ROOT = '/tmp/owner-root';

function capture(): WatcherBootstrapCapture {
    return {
        canonicalRoot: ROOT,
        watcherGeneration: 1,
        observedEventEpoch: 2,
        candidatePolicyHash: POLICY_HASH,
    };
}

const POLICY_HASH = 'a'.repeat(64);

function provenGeneration(): ProvenVectorGenerationReceipt {
    return {
        collectionName: 'collection-1',
        marker: {
            runId: 'run-1',
            indexStatus: 'completed',
            indexPolicyHash: POLICY_HASH,
            indexedFiles: 10,
            totalChunks: 100,
            startedAt: '2026-01-01T00:00:00.000Z',
            completedAt: '2026-01-01T00:00:01.000Z',
        },
        policy: {
            canonicalRoot: ROOT,
            policyHash: POLICY_HASH,
        },
        policyDocumentDigest: 'digest-1',
        exactPayloadCount: 100,
        observations: {
            profileFileToken: null,
            policyFileToken: 'policy-token',
        },
    } as unknown as ProvenVectorGenerationReceipt;
}

function handoffInput(): FullIndexSourceHandoffInput {
    return {
        capture: capture(),
        candidatePolicyHash: POLICY_HASH,
        checkpointObservation: 'checkpoint-token',
        provenGeneration: provenGeneration(),
    };
}

function stubDeps(overrides: Partial<SourceObservationStateDependencies> = {}): SourceObservationStateDependencies {
    return {
        assertMutationCurrent: () => undefined,
        hasCurrentWatcherCapture: () => true,
        coverWatcherObservation: () => undefined,
        proveVectorGeneration: async () => provenGeneration(),
        inspectSourceFreshnessCheckpoint: async () => ({
            status: 'valid',
            observationToken: 'checkpoint-token',
            merkleRoot: 'merkle-root',
            documentDigest: 'document-digest',
        }),
        getRegisteredSourceFreshnessCheckpointObservation: () => 'checkpoint-token',
        isPreparedReadAvailable: () => true,
        ...overrides,
    };
}

test('recordValidCheckpointObservation returns the previous token for epoch detection', () => {
    const owner = new SourceObservationState(stubDeps());
    assert.equal(owner.recordValidCheckpointObservation(ROOT, 'token-1'), undefined);
    assert.equal(owner.recordValidCheckpointObservation(ROOT, 'token-2'), 'token-1');
    assert.equal(owner.getCheckpointObservation(ROOT), 'token-2');
    assert.equal(owner.getCheckpointStatus(ROOT), 'valid');
});

test('recordUnavailableCheckpoint sets the status and clears the observation', () => {
    const owner = new SourceObservationState(stubDeps());
    owner.recordValidCheckpointObservation(ROOT, 'token-1');
    owner.recordUnavailableCheckpoint(ROOT, 'corrupt');
    assert.equal(owner.getCheckpointStatus(ROOT), 'corrupt');
    assert.equal(owner.getCheckpointObservation(ROOT), undefined);
});

test('beginHandoff rejects empty candidate policy hash or marker run id', () => {
    const owner = new SourceObservationState(stubDeps());
    assert.throws(
        () => owner.beginHandoff(ROOT, { candidatePolicyHash: '', markerRunId: 'run-1' }),
        TypeError,
    );
    assert.throws(
        () => owner.beginHandoff(ROOT, { candidatePolicyHash: POLICY_HASH, markerRunId: '' }),
        TypeError,
    );
});

test('beginHandoff opens a fail-closed barrier and rejectHandoff closes a matching barrier only', () => {
    const owner = new SourceObservationState(stubDeps());
    const barrier = { candidatePolicyHash: POLICY_HASH, markerRunId: 'run-1' };
    owner.beginHandoff(ROOT, barrier);
    assert.equal(owner.hasHandoffBarrier(ROOT), true);

    assert.equal(owner.rejectHandoff(ROOT, { candidatePolicyHash: POLICY_HASH, markerRunId: 'other-run' }), false);
    assert.equal(owner.hasHandoffBarrier(ROOT), true);

    assert.equal(owner.rejectHandoff(ROOT, barrier), true);
    assert.equal(owner.hasHandoffBarrier(ROOT), false);
});

test('supersedeHandoffAfterSync removes the barrier only for the proven completed generation', () => {
    const owner = new SourceObservationState(stubDeps());
    owner.beginHandoff(ROOT, { candidatePolicyHash: POLICY_HASH, markerRunId: 'run-1' });

    const wrongGeneration = {
        ...provenGeneration(),
        marker: { ...provenGeneration().marker, runId: 'run-2' },
    } as unknown as ProvenVectorGenerationReceipt;
    assert.equal(owner.supersedeHandoffAfterSync(ROOT, wrongGeneration), false);
    assert.equal(owner.hasHandoffBarrier(ROOT), true);

    assert.equal(owner.supersedeHandoffAfterSync(ROOT, provenGeneration()), true);
    assert.equal(owner.hasHandoffBarrier(ROOT), false);
});

test('completeHandoff validates barrier, checkpoint, and capture before recording', async () => {
    const owner = new SourceObservationState(stubDeps());
    owner.beginHandoff(ROOT, { candidatePolicyHash: POLICY_HASH, markerRunId: 'run-1' });

    const completed = await owner.completeHandoff(ROOT, handoffInput());
    assert.equal(completed, true);
    assert.equal(owner.getCheckpointStatus(ROOT), 'valid');
    assert.equal(owner.getCheckpointObservation(ROOT), 'checkpoint-token');
    assert.equal(owner.hasHandoffBarrier(ROOT), false);
});

test('completeHandoff returns false when the proven generation does not match the barrier', async () => {
    const owner = new SourceObservationState(stubDeps());
    owner.beginHandoff(ROOT, { candidatePolicyHash: POLICY_HASH, markerRunId: 'run-1' });

    const input = {
        ...handoffInput(),
        provenGeneration: {
            ...handoffInput().provenGeneration,
            marker: { ...handoffInput().provenGeneration.marker, runId: 'run-2' },
        },
    } as unknown as FullIndexSourceHandoffInput;
    assert.equal(await owner.completeHandoff(ROOT, input), false);
    assert.equal(owner.hasHandoffBarrier(ROOT), true);
});

test('completeHandoff covers the watcher observation and checks prepared-read availability', async () => {
    let coveredEpoch: number | undefined;
    let availabilityCheck = false;
    const owner = new SourceObservationState(stubDeps({
        coverWatcherObservation: (root, epoch) => {
            coveredEpoch = epoch;
        },
        isPreparedReadAvailable: () => {
            availabilityCheck = true;
            return true;
        },
    }));
    owner.beginHandoff(ROOT, { candidatePolicyHash: POLICY_HASH, markerRunId: 'run-1' });

    const completed = await owner.completeHandoff(ROOT, handoffInput());
    assert.equal(completed, true);
    assert.equal(coveredEpoch, 2);
    assert.equal(availabilityCheck, true);
});

test('clearCodebase removes all owned state for one root', () => {
    const owner = new SourceObservationState(stubDeps());
    owner.recordValidCheckpointObservation(ROOT, 'token-1');
    owner.beginHandoff(ROOT, { candidatePolicyHash: POLICY_HASH, markerRunId: 'run-1' });
    owner.clearCodebase(ROOT);
    assert.equal(owner.getCheckpointObservation(ROOT), undefined);
    assert.equal(owner.getCheckpointStatus(ROOT), undefined);
    assert.equal(owner.hasHandoffBarrier(ROOT), false);
});

test('clearAll removes all owned state', () => {
    const owner = new SourceObservationState(stubDeps());
    owner.recordValidCheckpointObservation(ROOT, 'token-1');
    owner.beginHandoff(ROOT, { candidatePolicyHash: POLICY_HASH, markerRunId: 'run-1' });
    owner.clearAll();
    assert.equal(owner.getCheckpointObservation(ROOT), undefined);
    assert.equal(owner.hasHandoffBarrier(ROOT), false);
});
