import test from 'node:test';
import assert from 'node:assert/strict';
import { SynchronizerRegistry, type SynchronizerRegistryPorts } from './synchronizer-registry';
import type { FileSynchronizer } from './synchronizer';

function stubPorts(overrides: Partial<SynchronizerRegistryPorts> = {}): SynchronizerRegistryPorts {
    const unimplemented = (): never => {
        throw new Error('Unexpected synchronizer registry port invocation.');
    };
    return {
        canonicalizeCodebasePath: () => unimplemented(),
        getActiveIgnorePatterns: () => unimplemented(),
        getIndexedExtensionsForCodebase: () => unimplemented(),
        getIsHybrid: () => unimplemented(),
        indexCompletionMarkersEqual: () => unimplemented(),
        loadIndexProfileForCodebase: () => unimplemented(),
        proveIndexedGeneration: () => unimplemented(),
        resolveCollectionName: () => unimplemented(),
        ...overrides,
    };
}

function stubSynchronizer(label: string): FileSynchronizer {
    return { label } as unknown as FileSynchronizer;
}

test('registerSynchronizer stores the synchronizer and clears any pending mutation target', () => {
    const registry = new SynchronizerRegistry(stubPorts());
    registry.setMutationTarget('collection-1', 'staged-1');
    registry.registerSynchronizer('collection-1', stubSynchronizer('first'));
    assert.equal(registry.getSynchronizer('collection-1')?.label, 'first');
    assert.equal(registry.getMutationTarget('collection-1'), undefined);
});

test('getSynchronizer returns undefined for unregistered collections', () => {
    const registry = new SynchronizerRegistry(stubPorts());
    assert.equal(registry.getSynchronizer('collection-unknown'), undefined);
});

test('set/get/clearMutationTarget round-trips per collection', () => {
    const registry = new SynchronizerRegistry(stubPorts());
    registry.setMutationTarget('collection-1', 'staged-1');
    assert.equal(registry.getMutationTarget('collection-1'), 'staged-1');
    registry.clearMutationTarget('collection-1');
    assert.equal(registry.getMutationTarget('collection-1'), undefined);
});

test('clearSynchronizerForCollection removes synchronizer and mutation target', () => {
    const registry = new SynchronizerRegistry(stubPorts());
    registry.registerSynchronizer('collection-1', stubSynchronizer('first'));
    registry.setMutationTarget('collection-1', 'staged-1');
    registry.clearSynchronizerForCollection('collection-1');
    assert.equal(registry.getSynchronizer('collection-1'), undefined);
    assert.equal(registry.getMutationTarget('collection-1'), undefined);
});

test('getActiveSynchronizers returns a defensive copy that cannot mutate the registry', () => {
    const registry = new SynchronizerRegistry(stubPorts());
    registry.registerSynchronizer('collection-1', stubSynchronizer('first'));
    const snapshot = registry.getActiveSynchronizers();
    snapshot.set('collection-1', stubSynchronizer('tampered'));
    snapshot.clear();
    assert.equal(registry.getSynchronizer('collection-1')?.label, 'first');
});

test('hasSynchronizerForCodebase resolves through the collection-name port', () => {
    const registry = new SynchronizerRegistry(stubPorts({
        resolveCollectionName: (codebasePath) => `resolved:${codebasePath}`,
    }));
    assert.equal(registry.hasSynchronizerForCodebase('/tmp/root'), false);
    registry.registerSynchronizer('resolved:/tmp/root', stubSynchronizer('first'));
    assert.equal(registry.hasSynchronizerForCodebase('/tmp/root'), true);
});
