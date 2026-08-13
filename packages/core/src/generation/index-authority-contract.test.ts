import test from 'node:test';
import assert from 'node:assert/strict';
import {
    generationAuthorityWriter,
    generationAuthorityOwnedDomains,
    generationAuthorityNonOwnedDomains,
    generationProofStateSource,
    indexAuthorityContract,
    type AuthorityOperation,
    type AuthorityOperationResult,
    type GenerationAuthorityOwnedDomain,
    type GenerationAuthorityNonOwnedDomain,
} from './index-authority-contract';
import { createGenerationProofCoordinator, type GenerationProofCoordinator } from './index-authority-coordinator';

test('authority contract names exactly one writer', () => {
    assert.equal(generationAuthorityWriter, 'IndexAuthorityCoordinator');
    assert.equal(indexAuthorityContract.writer, 'IndexAuthorityCoordinator');
});

test('authority contract owns every authority domain exactly once', () => {
    const owned: GenerationAuthorityOwnedDomain[] = [...generationAuthorityOwnedDomains];
    assert.equal(new Set(owned).size, owned.length);
    for (const domain of [
        'generation-proof-caches-and-flights',
        'published-collection-marker-navigation-policy-binding',
        'phase-aware-read-publication-retention-gate',
        'activation-rollback-retention-proof-rebinding-durable-restoration',
    ] as const) {
        assert.ok(owned.includes(domain), `missing owned domain ${domain}`);
    }
});

test('authority contract excludes non-owned domains from the writer', () => {
    const nonOwned: GenerationAuthorityNonOwnedDomain[] = [...generationAuthorityNonOwnedDomains];
    assert.equal(new Set(nonOwned).size, nonOwned.length);
    for (const domain of [
        'scanning-or-embedding',
        'semantic-ranking',
        'mcp-snapshots-or-root-leases',
        'navigation-artifact-serialization',
        'source-checkpoint-persistence',
    ] as const) {
        assert.ok(nonOwned.includes(domain), `missing non-owned domain ${domain}`);
    }
    for (const domain of generationAuthorityOwnedDomains as readonly string[]) {
        assert.ok(!nonOwned.includes(domain as GenerationAuthorityNonOwnedDomain), `owned domain leaked into non-owned: ${domain}`);
    }
});

test('authority contract re-parents the existing proof coordinator without a second registry', () => {
    assert.equal(generationProofStateSource.kind, 'existing-generation-proof-coordinator-factory');
    assert.equal(generationProofStateSource.factory, 'createGenerationProofCoordinator');
    assert.equal(generationProofStateSource.proofCacheCount, 1);
    assert.equal(generationProofStateSource.proofFlightRegistryCount, 1);
    const first: GenerationProofCoordinator = createGenerationProofCoordinator();
    const second: GenerationProofCoordinator = createGenerationProofCoordinator();
    assert.notEqual(first, second);
    assert.equal(typeof first, 'object');
});

test('authority contract operations and results are closed under the contract', () => {
    const operations: AuthorityOperation[] = [
        { kind: 'publish', canonicalRoot: '/repo', policy: null as never },
        { kind: 'clear', canonicalRoot: '/repo' },
        { kind: 'restore', canonicalRoot: '/repo', snapshot: null as never },
        { kind: 'read', canonicalRoot: '/repo' },
        { kind: 'retain', canonicalRoot: '/repo' },
        { kind: 'rebind', canonicalRoot: '/repo', receipt: null as never },
        { kind: 'activate', canonicalRoot: '/repo', receipt: null as never },
    ];
    assert.deepEqual(
        operations.map((op) => op.kind),
        ['publish', 'clear', 'restore', 'read', 'retain', 'rebind', 'activate'],
    );
    const results: AuthorityOperationResult[] = [
        { kind: 'publication', receipt: null as never },
        { kind: 'navigation-proof', proof: null as never },
        { kind: 'restored', result: null },
        { kind: 'read', binding: null },
    ];
    assert.deepEqual(
        results.map((r) => r.kind),
        ['publication', 'navigation-proof', 'restored', 'read'],
    );
});
