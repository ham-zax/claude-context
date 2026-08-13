import test from 'node:test';
import assert from 'node:assert/strict';
import { IndexTeardownWorkflow } from './index-teardown-workflow';

test('IndexTeardownWorkflow preserves the current cross-domain clear ordering', async () => {
    const events: string[] = [];
    const progress: string[] = [];
    const workflow = new IndexTeardownWorkflow({
        canonicalizeCodebasePath: (value) => value,
        indexPolicyMutationCoordinator: {
            withLockAsync: async (_root, operation) => {
                events.push('lock:start');
                const result = await operation();
                events.push('lock:end');
                return result;
            },
        },
        indexPolicyDocumentStore: {
            recoverTombstonesWhileLocked: () => events.push('policy:recover'),
            deleteDocumentWhileLocked: () => events.push('policy:delete'),
        },
        listRelatedCollectionNames: async () => {
            events.push('collections:list');
            return ['active', 'active__gen_staged'];
        },
        deleteCollectionWithVerification: async (collectionName, options) => {
            events.push(`collection:delete:${collectionName}`);
            options?.beforeDropAttempt?.();
        },
        clearResolvedIndexPolicyRuntime: () => events.push('policy:runtime-clear'),
        setPolicyFileToken: (_root, token) => events.push(`policy:token:${token}`),
        clearSymbolRegistryForCodebase: async (_root, assertMutationCurrent, publishMutation) => {
            events.push('navigation:clear');
            assertMutationCurrent?.();
            publishMutation?.(() => events.push('navigation:publish'));
        },
        deleteSnapshot: async () => {
            events.push('snapshot:delete');
        },
        resolveCollectionName: () => 'active',
        clearSynchronizerForCollection: (collectionName) => events.push(`sync:clear:${collectionName}`),
        deleteIgnoreCodebaseState: () => events.push('ignore:clear'),
        deleteIndexProfile: () => events.push('profile:clear'),
        clearLegacyWriteCollectionOverride: () => events.push('compatibility:clear'),
    });

    await workflow.clearIndex(
        '/repo',
        (value) => progress.push(value.phase),
        { assertMutationCurrent: () => events.push('mutation:assert') },
    );

    assert.deepEqual(progress, [
        'Checking existing index...',
        'Removing index data...',
        'Index cleared',
    ]);
    assert.deepEqual(events, [
        'lock:start',
        'policy:recover',
        'collections:list',
        'collection:delete:active',
        'mutation:assert',
        'collection:delete:active__gen_staged',
        'mutation:assert',
        'mutation:assert',
        'policy:delete',
        'policy:runtime-clear',
        'policy:token:null',
        'navigation:clear',
        'mutation:assert',
        'mutation:assert',
        'snapshot:delete',
        'sync:clear:active',
        'ignore:clear',
        'compatibility:clear',
        'profile:clear',
        'lock:end',
    ]);
});

test('IndexTeardownWorkflow stops before policy withdrawal when collection deletion is unproven', async () => {
    const events: string[] = [];
    const workflow = new IndexTeardownWorkflow({
        canonicalizeCodebasePath: (value) => value,
        indexPolicyMutationCoordinator: {
            withLockAsync: async (_root, operation) => operation(),
        },
        indexPolicyDocumentStore: {
            recoverTombstonesWhileLocked: () => events.push('policy:recover'),
            deleteDocumentWhileLocked: () => events.push('policy:delete'),
        },
        listRelatedCollectionNames: async () => ['active'],
        deleteCollectionWithVerification: async () => {
            events.push('collection:delete');
            throw new Error('remote deletion pending');
        },
        clearResolvedIndexPolicyRuntime: () => events.push('policy:runtime-clear'),
        setPolicyFileToken: () => events.push('policy:token'),
        clearSymbolRegistryForCodebase: async () => {
            events.push('navigation:clear');
        },
        deleteSnapshot: async () => {
            events.push('snapshot:delete');
        },
        resolveCollectionName: () => 'active',
        clearSynchronizerForCollection: () => events.push('sync:clear'),
        deleteIgnoreCodebaseState: () => events.push('ignore:clear'),
        deleteIndexProfile: () => events.push('profile:clear'),
        clearLegacyWriteCollectionOverride: () => events.push('compatibility:clear'),
    });

    await assert.rejects(() => workflow.clearIndex('/repo'), /remote deletion pending/);
    assert.deepEqual(events, ['policy:recover', 'collection:delete']);
});
