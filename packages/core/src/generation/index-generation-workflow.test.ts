import test from 'node:test';
import assert from 'node:assert/strict';
import {
    IndexGenerationWorkflow,
    type IndexGenerationWorkflowPorts,
} from './index-generation-workflow';

type WorkflowInternals = {
    reindexByChangeQueues: Map<string, Promise<void>>;
    runSerializedReindexByChange<T>(canonicalRoot: string, operation: () => Promise<T>): Promise<T>;
};

function getWorkflowInternals(workflow: IndexGenerationWorkflow): WorkflowInternals {
    return workflow as unknown as WorkflowInternals;
}

function createWorkflow(): IndexGenerationWorkflow {
    return new IndexGenerationWorkflow({} as IndexGenerationWorkflowPorts);
}

test('IndexGenerationWorkflow removes serialized reindex queue entries after success and failure', async () => {
    const workflow = createWorkflow();
    const internals = getWorkflowInternals(workflow);

    await internals.runSerializedReindexByChange('/repo', async () => 'completed');
    assert.equal(internals.reindexByChangeQueues.size, 0);

    await assert.rejects(
        () => internals.runSerializedReindexByChange('/repo', async () => {
            throw new Error('reindex failed');
        }),
        /reindex failed/,
    );
    assert.equal(internals.reindexByChangeQueues.size, 0);
});

test('IndexGenerationWorkflow removes the final queue entry after concurrent serialization', async () => {
    const workflow = createWorkflow();
    const internals = getWorkflowInternals(workflow);
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstReleased = new Promise<void>((resolve) => {
        releaseFirst = resolve;
    });
    let firstStarted!: () => void;
    const firstStartedPromise = new Promise<void>((resolve) => {
        firstStarted = resolve;
    });

    const first = internals.runSerializedReindexByChange('/repo', async () => {
        order.push('first');
        firstStarted();
        await firstReleased;
    });
    await firstStartedPromise;

    const second = internals.runSerializedReindexByChange('/repo', async () => {
        order.push('second');
    });
    assert.equal(internals.reindexByChangeQueues.size, 1);

    releaseFirst();
    await Promise.all([first, second]);

    assert.deepEqual(order, ['first', 'second']);
    assert.equal(internals.reindexByChangeQueues.size, 0);
});
