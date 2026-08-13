import test from 'node:test';
import assert from 'node:assert/strict';
import { createIndexMutationPort } from './index-mutation-port';
import type {
    IndexMutationPortDependencies,
} from './index-mutation-port';

function stubDeps(overrides: Partial<IndexMutationPortDependencies> = {}): IndexMutationPortDependencies {
    const unimplemented = (): never => {
        throw new Error('Unexpected index mutation port dependency invocation.');
    };
    return {
        clearIndex: () => unimplemented(),
        checkCollectionLimit: () => unimplemented(),
        deleteCollectionWithVerification: () => unimplemented(),
        prepareIndexCollection: () => unimplemented(),
        discardPreparedIndexCollection: () => unimplemented(),
        proveVectorGeneration: () => unimplemented(),
        proveIndexedGeneration: () => unimplemented(),
        repairIndex: () => unimplemented(),
        captureDurableIndexAuthority: () => unimplemented(),
        restoreDurableIndexAuthority: () => unimplemented(),
        publishCompletedIndexMarker: () => unimplemented(),
        publishNavigationCandidate: () => unimplemented(),
        discardNavigationCandidate: () => unimplemented(),
        resolveIndexPolicyForReindex: () => unimplemented(),
        resolveIndexPolicyForCodebase: () => unimplemented(),
        describeEmbeddingProvider: () => unimplemented(),
        indexCodebase: () => unimplemented(),
        isObservedIndexPolicyControlSignatureCurrent: () => unimplemented(),
        publishResolvedIndexPolicy: () => unimplemented(),
        registerSynchronizer: () => unimplemented(),
        indexCompletionMarkersEqual: () => unimplemented(),
        ...overrides,
    };
}

test('clearIndex delegates the teardown workflow through the operation port', async () => {
    const progress = () => undefined;
    const options = { assertMutationCurrent: () => undefined };
    const seen: unknown[] = [];
    const port = createIndexMutationPort(stubDeps({
        clearIndex: async (...args: unknown[]) => {
            seen.push(args);
        },
    }));

    await port.clearIndex('/repo', progress, options);
    assert.deepEqual(seen, [['/repo', progress, options]]);
});

test('checkCollectionLimit delegates to the vector store capability probe', async () => {
    let seen = 0;
    const port = createIndexMutationPort(stubDeps({
        checkCollectionLimit: async () => {
            seen += 1;
            return false;
        },
    }));
    assert.equal(await port.checkCollectionLimit(), false);
    assert.equal(seen, 1);
});

test('deleteCollectionWithVerification passes the collection name and options through', async () => {
    let seen: unknown;
    const port = createIndexMutationPort(stubDeps({
        deleteCollectionWithVerification: async (...args: unknown[]) => {
            seen = args;
            return { collectionName: 'staged-collection', attempts: 1, verifiedAbsent: true };
        },
    }));
    const result = await port.deleteCollectionWithVerification('staged-collection', {
        beforeDropAttempt: () => undefined,
    });
    assert.equal(result.verifiedAbsent, true);
    const [collectionName, options] = (seen as [string, { beforeDropAttempt?: unknown }]);
    assert.equal(collectionName, 'staged-collection');
    assert.equal(typeof options.beforeDropAttempt, 'function');
});

test('prepareIndexCollection passes the generation binding and mutation guard through', async () => {
    let seen: unknown;
    const guard = () => undefined;
    const port = createIndexMutationPort(stubDeps({
        prepareIndexCollection: async (...args: unknown[]) => {
            seen = args;
            return {
                canonicalRoot: '/tmp/root',
                collectionName: 'staged',
                generation: 1,
                operationId: 'operation-1',
            };
        },
    }));
    const receipt = await port.prepareIndexCollection(
        '/tmp/root',
        { generation: 1, operationId: 'operation-1', collectionName: 'staged' },
        guard,
    );
    assert.equal(receipt.collectionName, 'staged');
    const [, binding, assertMutationCurrent] = (seen as [
        string,
        { generation: number; operationId: string; collectionName: string },
        () => void,
    ]);
    assert.deepEqual(binding, { generation: 1, operationId: 'operation-1', collectionName: 'staged' });
    assert.equal(assertMutationCurrent, guard);
});

test('discardPreparedIndexCollection delegates the one-shot receipt discard', () => {
    let discarded: unknown;
    const receipt = {
        canonicalRoot: '/tmp/root',
        collectionName: 'staged',
        generation: 1,
        operationId: 'operation-1',
    };
    const port = createIndexMutationPort(stubDeps({
        discardPreparedIndexCollection: (value) => {
            discarded = value;
        },
    }));
    port.discardPreparedIndexCollection(receipt);
    assert.equal(discarded, receipt);
});

test('proveVectorGeneration and proveIndexedGeneration delegate generation proof reads', async () => {
    const vectorReceipt = {
        collectionName: 'collection-1',
        marker: { runId: 'run-1' },
    };
    let vectorSeen = 0;
    let indexedSeen = 0;
    const port = createIndexMutationPort(stubDeps({
        proveVectorGeneration: async () => {
            vectorSeen += 1;
            return vectorReceipt as never;
        },
        proveIndexedGeneration: async () => {
            indexedSeen += 1;
            return vectorReceipt as never;
        },
    }));
    await port.proveVectorGeneration('/tmp/root');
    await port.proveIndexedGeneration('/tmp/root');
    assert.equal(vectorSeen, 1);
    assert.equal(indexedSeen, 1);
});

test('repairIndex passes repair options through and returns the repair result', async () => {
    let seen: unknown;
    const port = createIndexMutationPort(stubDeps({
        repairIndex: async (...args: unknown[]) => {
            seen = args;
            return {
                status: 'ok',
                message: 'repaired',
                indexedFiles: 1,
                totalChunks: 2,
                warnings: [],
                collectionName: 'collection-1',
                proof: { snapshot: { status: 'matched' } },
            } as never;
        },
    }));
    const result = await port.repairIndex('/tmp/root', {
        preferredCollectionName: 'collection-1',
    });
    assert.equal(result.status, 'ok');
    const [, options] = (seen as [string, { preferredCollectionName?: string }]);
    assert.equal(options.preferredCollectionName, 'collection-1');
});

test('capture and restore durable index authority delegate authority snapshots', async () => {
    const snapshot = { canonicalRoot: '/tmp/root' };
    const restoreResult = { status: 'restored_current' as const };
    const publishMutation = (publish: () => void) => publish();
    let restored: unknown;
    const port = createIndexMutationPort(stubDeps({
        captureDurableIndexAuthority: () => snapshot as never,
        restoreDurableIndexAuthority: async (...args: unknown[]) => {
            restored = args;
            return restoreResult;
        },
    }));
    assert.equal(port.captureDurableIndexAuthority('/tmp/root'), snapshot);
    const result = await port.restoreDurableIndexAuthority(
        snapshot as never,
        publishMutation,
        snapshot as never,
    );
    assert.equal(result.status, 'restored_current');
    const [restoreSnapshot, mutationPublisher, expectedCurrent] = (restored as [
        unknown,
        typeof publishMutation,
        unknown,
    ]);
    assert.equal(restoreSnapshot, snapshot);
    assert.equal(mutationPublisher, publishMutation);
    assert.equal(expectedCurrent, snapshot);
});

test('publishCompletedIndexMarker passes the complete marker publication arguments through', async () => {
    let seen: unknown;
    const guard = () => undefined;
    const navigationCandidate = { generationId: 'generation-1' };
    const port = createIndexMutationPort(stubDeps({
        publishCompletedIndexMarker: async (...args: unknown[]) => {
            seen = args;
        },
    }));
    await port.publishCompletedIndexMarker(
        '/tmp/root',
        3,
        9,
        'collection-1',
        'completed',
        guard,
        navigationCandidate as never,
        'policy-hash',
        'run-1',
    );
    assert.deepEqual(seen, [
        '/tmp/root',
        3,
        9,
        'collection-1',
        'completed',
        guard,
        navigationCandidate,
        'policy-hash',
        'run-1',
    ]);
});

test('publishNavigationCandidate and discardNavigationCandidate delegate sidecar publication', async () => {
    const candidate = { generationId: 'generation-1' };
    const guard = () => undefined;
    const publishMutation = (publish: () => void) => publish();
    let published: unknown;
    let discarded: unknown;
    const port = createIndexMutationPort(stubDeps({
        publishNavigationCandidate: async (...args: unknown[]) => {
            published = args;
        },
        discardNavigationCandidate: async (...args: unknown[]) => {
            discarded = args;
        },
    }));
    await port.publishNavigationCandidate(candidate as never, guard, publishMutation);
    await port.discardNavigationCandidate(candidate as never, guard);
    assert.deepEqual(published, [candidate, guard, publishMutation]);
    assert.deepEqual(discarded, [candidate, guard]);
});

test('policy resolution delegates the reindex and codebase variants separately', async () => {
    let reindexCalls = 0;
    let codebaseCalls = 0;
    const observed = { canonicalRoot: '/tmp/root', profile: 'default' };
    const port = createIndexMutationPort(stubDeps({
        resolveIndexPolicyForReindex: async () => {
            reindexCalls += 1;
            return observed as never;
        },
        resolveIndexPolicyForCodebase: async () => {
            codebaseCalls += 1;
            return observed as never;
        },
    }));
    await port.resolveIndexPolicyForReindex('/tmp/root', { customExtensions: ['.tsx'] });
    await port.resolveIndexPolicyForCodebase('/tmp/root');
    assert.equal(reindexCalls, 1);
    assert.equal(codebaseCalls, 1);
});

test('describeEmbeddingProvider delegates the provider description', () => {
    const port = createIndexMutationPort(stubDeps({
        describeEmbeddingProvider: () => ({ provider: 'VoyageAI', dimension: 1024 }),
    }));
    assert.deepEqual(port.describeEmbeddingProvider(), { provider: 'VoyageAI', dimension: 1024 });
});

test('indexCodebase passes progress callback, force flag, and mutation options through', async () => {
    let seen: unknown;
    const progress = (): void => undefined;
    const options = { deferFullIndexPublication: true };
    const port = createIndexMutationPort(stubDeps({
        indexCodebase: async (...args: unknown[]) => {
            seen = args;
            return { indexedFiles: 1, totalChunks: 1, status: 'completed' } as never;
        },
    }));
    const result = await port.indexCodebase('/tmp/root', progress, false, options);
    assert.equal(result.status, 'completed');
    const [codebasePath, progressCallback, forceReindex, mutationOptions] = (seen as [
        string,
        typeof progress,
        boolean,
        { deferFullIndexPublication?: boolean },
    ]);
    assert.equal(codebasePath, '/tmp/root');
    assert.equal(progressCallback, progress);
    assert.equal(forceReindex, false);
    assert.equal(mutationOptions, options);
});

test('policy control signature revalidation and resolved policy publication delegate', async () => {
    const policy = { canonicalRoot: '/tmp/root', profile: 'default' };
    const binding = { collectionName: 'collection-1', navigation: { status: 'not_bound' as const } };
    const receipt = { status: 'committed' as const, operation: 'publish' as const };
    let signatureCalls = 0;
    let published: unknown;
    const port = createIndexMutationPort(stubDeps({
        isObservedIndexPolicyControlSignatureCurrent: async () => {
            signatureCalls += 1;
            return true;
        },
        publishResolvedIndexPolicy: (...args: unknown[]) => {
            published = args;
            return receipt as never;
        },
    }));
    assert.equal(await port.isObservedIndexPolicyControlSignatureCurrent(policy as never), true);
    assert.equal(port.publishResolvedIndexPolicy(policy as never, binding as never), receipt);
    assert.equal(signatureCalls, 1);
    assert.equal((published as unknown[])[1], binding);
});

test('registerSynchronizer and indexCompletionMarkersEqual delegate synchronizer and marker operations', () => {
    const synchronizer = { canonicalRoot: '/tmp/root' };
    const left = { runId: 'run-1' };
    const right = { runId: 'run-1' };
    let registered: unknown;
    let compared: unknown;
    const port = createIndexMutationPort(stubDeps({
        registerSynchronizer: (...args: unknown[]) => {
            registered = args;
        },
        indexCompletionMarkersEqual: (...args: unknown[]) => {
            compared = args;
            return true;
        },
    }));
    port.registerSynchronizer('collection-1', synchronizer as never);
    assert.equal(port.indexCompletionMarkersEqual(left as never, right as never), true);
    assert.deepEqual(registered, ['collection-1', synchronizer]);
    assert.deepEqual(compared, [left, right]);
});
