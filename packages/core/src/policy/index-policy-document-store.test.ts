import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IndexPolicyDocumentStore } from './index-policy-document-store';
import { IndexPolicyMutationCoordinator } from '../core/index-policy-mutation-coordinator';
import {
    buildCanonicalIndexPolicyDocument,
    type CanonicalIndexPolicyDocument,
} from '../core/persisted-index-authority';
import { computeIndexPolicyHash } from './index-policy-runtime-service';
import { normalizeSupportedExtensions } from '../config/index-policy';
import {
    getSupportedExtensionsForIndexProfile,
} from '../config/defaults';

/**
 * Contract mirror of the digest verification Context wires into the store:
 * parse the durable document and return its canonical digest.
 */
function verifyPolicyDocumentDigest(policyPath: string): string {
    const parsed = JSON.parse(fs.readFileSync(policyPath, 'utf8')) as { documentDigest?: unknown };
    if (!parsed || typeof parsed.documentDigest !== 'string') {
        throw new Error('Index policy document digest is invalid.');
    }
    return parsed.documentDigest;
}

interface Harness {
    root: string;
    canonicalRoot: string;
    policyPath: string;
    coordinator: IndexPolicyMutationCoordinator;
    store: IndexPolicyDocumentStore;
}

function createHarness(): Harness {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-policy-doc-store-'));
    const canonicalRoot = path.join(root, 'repo');
    fs.mkdirSync(canonicalRoot, { recursive: true });
    const coordinator = new IndexPolicyMutationCoordinator({
        stateRoot: path.join(root, 'state'),
        verifyPolicyDocumentDigest,
    });
    const store = new IndexPolicyDocumentStore({
        mutationCoordinator: coordinator,
        verifyPolicyDocumentDigest,
        fsyncPath: (targetPath) => {
            const fd = fs.openSync(targetPath, 'r');
            try {
                fs.fsyncSync(fd);
            } finally {
                fs.closeSync(fd);
            }
        },
    });
    return {
        root,
        canonicalRoot,
        policyPath: coordinator.resolvePolicyPath(canonicalRoot),
        coordinator,
        store,
    };
}

function buildPolicyDocument(
    canonicalRoot: string,
    options: {
        collectionName?: string;
        customExtensions?: string[];
    } = {},
): CanonicalIndexPolicyDocument {
    const customExtensions = options.customExtensions ?? ['.custom'];
    const customIgnorePatterns = ['custom/**'];
    const fileBasedIgnorePatterns = ['file-based/**'];
    const supportedExtensions = normalizeSupportedExtensions([
        ...getSupportedExtensionsForIndexProfile('default'),
        ...customExtensions,
    ]);
    const effectiveIgnorePatterns = [
        'node_modules/**',
        ...customIgnorePatterns,
        ...fileBasedIgnorePatterns,
    ];
    const policyHash = computeIndexPolicyHash('default', supportedExtensions, effectiveIgnorePatterns);
    return buildCanonicalIndexPolicyDocument({
        canonicalRoot,
        schemaVersion: 'satori_index_policy_v5',
        customExtensions,
        customIgnorePatterns,
        fileBasedIgnorePatterns,
        profile: 'default',
        supportedExtensions,
        effectiveIgnorePatterns,
        policyHash,
        collectionName: options.collectionName ?? 'fixture-collection',
        navigation: {
            status: 'sealed',
            generationId: 'gen-1',
            sealHash: 'a'.repeat(64),
        },
        publication: {
            activationId: 'activation-1',
            sourceCheckpoint: {
                collectionName: options.collectionName ?? 'fixture-collection',
                markerRunId: 'marker-1',
                indexPolicyHash: policyHash,
                merkleRoot: 'b'.repeat(64),
                documentDigest: 'c'.repeat(64),
            },
            graph: { kind: 'relationship_manifest_v2', manifestHash: 'd'.repeat(64) },
            receipt: { ownerId: 'test', generation: 1, operationId: 'op-1' },
        },
        controlSignature: 'v1:default',
    });
}

function pendingTombstonePaths(policyPath: string): string[] {
    const directory = path.dirname(policyPath);
    const prefix = `${path.basename(policyPath)}.removed-`;
    return fs.readdirSync(directory)
        .filter((entry) => entry.startsWith(prefix))
        .map((entry) => path.join(directory, entry));
}

function tmpArtifactPaths(policyPath: string): string[] {
    const directory = path.dirname(policyPath);
    return fs.readdirSync(directory)
        .filter((entry) => entry.startsWith(`${path.basename(policyPath)}.tmp-`))
        .map((entry) => path.join(directory, entry));
}

test('persistDocument writes the exact durable document format at the coordinator-resolved path', () => {
    const harness = createHarness();
    const { root, canonicalRoot, policyPath, store } = harness;
    try {
        const document = buildPolicyDocument(canonicalRoot);
        store.persistDocument(canonicalRoot, document);
        assert.equal(
            fs.readFileSync(policyPath, 'utf8'),
            JSON.stringify(document, null, 2),
        );
        assert.deepEqual(JSON.parse(fs.readFileSync(policyPath, 'utf8')), document);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('persistDocument runs onCommitted inside the shared mutation lock and releases it afterwards', () => {
    const harness = createHarness();
    const { root, canonicalRoot, policyPath, coordinator, store } = harness;
    try {
        const document = buildPolicyDocument(canonicalRoot);
        let observedDuringCommit: { lockHeld: boolean; documentVisible: boolean } | undefined;
        store.persistDocument(canonicalRoot, document, () => {
            const lockPath = `${policyPath}.mutation.lock`;
            let reacquireError: unknown;
            try {
                coordinator.withLock(canonicalRoot, () => undefined);
            } catch (error) {
                reacquireError = error;
            }
            observedDuringCommit = {
                lockHeld: fs.existsSync(lockPath),
                documentVisible: fs.existsSync(policyPath),
            };
            assert.match(
                reacquireError instanceof Error ? reacquireError.message : String(reacquireError),
                /already held in this process/,
            );
        });
        assert.deepEqual(observedDuringCommit, { lockHeld: true, documentVisible: true });
        assert.equal(fs.existsSync(`${policyPath}.mutation.lock`), false);
        // The lock is released: a new locked operation succeeds.
        coordinator.withLock(canonicalRoot, () => undefined);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('persistDocument reuses the shared mutation lock owner instead of a second lock', () => {
    const harness = createHarness();
    const { root, canonicalRoot, coordinator, store } = harness;
    try {
        const document = buildPolicyDocument(canonicalRoot);
        coordinator.withLock(canonicalRoot, () => {
            assert.throws(
                () => store.persistDocument(canonicalRoot, document),
                /already held in this process/,
            );
        });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('persistDocument recovers a matching pending removal tombstone before renaming', () => {
    const harness = createHarness();
    const { root, canonicalRoot, policyPath, store } = harness;
    try {
        const first = buildPolicyDocument(canonicalRoot, { collectionName: 'first-collection' });
        const second = buildPolicyDocument(canonicalRoot, { collectionName: 'second-collection' });
        store.persistDocument(canonicalRoot, first);
        // Simulate a removal interrupted after the document was moved aside.
        const interruptedTombstone = `${policyPath}.removed-${process.pid}-${crypto.randomUUID()}`;
        fs.renameSync(policyPath, interruptedTombstone);
        assert.equal(fs.existsSync(policyPath), false);

        store.persistDocument(canonicalRoot, second);
        assert.deepEqual(JSON.parse(fs.readFileSync(policyPath, 'utf8')), second);
        assert.equal(fs.existsSync(interruptedTombstone), false);
        assert.deepEqual(pendingTombstonePaths(policyPath), []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('persistDocument keeps the document committed and cleans the temporary file when onCommitted fails', () => {
    const harness = createHarness();
    const { root, canonicalRoot, policyPath, store } = harness;
    try {
        const document = buildPolicyDocument(canonicalRoot);
        assert.throws(
            () => store.persistDocument(canonicalRoot, document, () => {
                throw new Error('activation failed');
            }),
            /activation failed/,
        );
        assert.deepEqual(JSON.parse(fs.readFileSync(policyPath, 'utf8')), document);
        assert.deepEqual(tmpArtifactPaths(policyPath), []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('captureDocument returns the durable bytes and digest, and null when absent', () => {
    const harness = createHarness();
    const { root, canonicalRoot, policyPath, store } = harness;
    try {
        assert.equal(store.captureDocument(canonicalRoot), null);
        const document = buildPolicyDocument(canonicalRoot);
        store.persistDocument(canonicalRoot, document);
        const capture = store.captureDocument(canonicalRoot);
        assert.ok(capture);
        const content = fs.readFileSync(policyPath, 'utf8');
        assert.equal(capture.content, content);
        assert.equal(
            capture.digest,
            crypto.createHash('sha256').update(content, 'utf8').digest('hex'),
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('removeDocument removes the document, reports its digest, and cleans committed tombstones', () => {
    const harness = createHarness();
    const { root, canonicalRoot, policyPath, store } = harness;
    try {
        const document = buildPolicyDocument(canonicalRoot);
        store.persistDocument(canonicalRoot, document);
        let removedDigest: string | null = 'unset';
        store.removeDocument(canonicalRoot, undefined, (digest) => {
            removedDigest = digest;
        });
        assert.equal(removedDigest, document.documentDigest);
        assert.equal(fs.existsSync(policyPath), false);
        assert.deepEqual(pendingTombstonePaths(policyPath), []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('removeDocument with a matching expected digest commits the removal', () => {
    const harness = createHarness();
    const { root, canonicalRoot, policyPath, store } = harness;
    try {
        const document = buildPolicyDocument(canonicalRoot);
        store.persistDocument(canonicalRoot, document);
        let removedDigest: string | null = 'unset';
        store.removeDocument(canonicalRoot, document.documentDigest, (digest) => {
            removedDigest = digest;
        });
        assert.equal(removedDigest, document.documentDigest);
        assert.equal(fs.existsSync(policyPath), false);
        assert.deepEqual(pendingTombstonePaths(policyPath), []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('removeDocument with a mismatched expected digest rolls the document back and throws', () => {
    const harness = createHarness();
    const { root, canonicalRoot, policyPath, store } = harness;
    try {
        const document = buildPolicyDocument(canonicalRoot);
        store.persistDocument(canonicalRoot, document);
        const wrongDigest = 'a'.repeat(64);
        assert.throws(
            () => store.removeDocument(canonicalRoot, wrongDigest, () => {
                throw new Error('onCommitted must not run for a rolled-back removal');
            }),
            /Index policy changed before removal/,
        );
        assert.deepEqual(JSON.parse(fs.readFileSync(policyPath, 'utf8')), document);
        assert.deepEqual(pendingTombstonePaths(policyPath), []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('removeDocument with an expected digest and no document present throws without a tombstone', () => {
    const harness = createHarness();
    const { root, canonicalRoot, policyPath, store } = harness;
    try {
        assert.throws(
            () => store.removeDocument(canonicalRoot, 'a'.repeat(64), () => undefined),
            /expected document 'a{64}' but no document was present/,
        );
        assert.equal(fs.existsSync(policyPath), false);
        assert.deepEqual(pendingTombstonePaths(policyPath), []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('removeDocument runs onCommitted inside the lock with the removal durably in place', () => {
    const harness = createHarness();
    const { root, canonicalRoot, policyPath, coordinator, store } = harness;
    try {
        const document = buildPolicyDocument(canonicalRoot);
        store.persistDocument(canonicalRoot, document);
        let observedDuringCommit: { lockHeld: boolean; targetAbsent: boolean } | undefined;
        store.removeDocument(canonicalRoot, document.documentDigest, () => {
            let reacquireError: unknown;
            try {
                coordinator.withLock(canonicalRoot, () => undefined);
            } catch (error) {
                reacquireError = error;
            }
            assert.match(
                reacquireError instanceof Error ? reacquireError.message : String(reacquireError),
                /already held in this process/,
            );
            observedDuringCommit = {
                lockHeld: fs.existsSync(`${policyPath}.mutation.lock`),
                targetAbsent: !fs.existsSync(policyPath),
            };
        });
        assert.deepEqual(observedDuringCommit, { lockHeld: true, targetAbsent: true });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('deleteDocumentWhileLocked removes the document while the caller holds the mutation lock', () => {
    const harness = createHarness();
    const { root, canonicalRoot, policyPath, coordinator, store } = harness;
    try {
        const document = buildPolicyDocument(canonicalRoot);
        store.persistDocument(canonicalRoot, document);
        coordinator.withLock(canonicalRoot, () => {
            store.deleteDocumentWhileLocked(canonicalRoot);
            assert.equal(fs.existsSync(policyPath), false);
        });
        assert.equal(fs.existsSync(policyPath), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('recoverTombstonesWhileLocked restores a pending tombstone when the target is absent', () => {
    const harness = createHarness();
    const { root, canonicalRoot, policyPath, coordinator, store } = harness;
    try {
        const document = buildPolicyDocument(canonicalRoot);
        store.persistDocument(canonicalRoot, document);
        const interruptedTombstone = `${policyPath}.removed-${process.pid}-${crypto.randomUUID()}`;
        fs.renameSync(policyPath, interruptedTombstone);

        coordinator.withLock(canonicalRoot, () => {
            store.recoverTombstonesWhileLocked(canonicalRoot);
        });
        assert.deepEqual(JSON.parse(fs.readFileSync(policyPath, 'utf8')), document);
        assert.equal(fs.existsSync(interruptedTombstone), false);
        assert.deepEqual(pendingTombstonePaths(policyPath), []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('recoverTombstonesWhileLocked removes committed tombstones while preserving the target', () => {
    const harness = createHarness();
    const { root, canonicalRoot, policyPath, coordinator, store } = harness;
    try {
        const document = buildPolicyDocument(canonicalRoot);
        store.persistDocument(canonicalRoot, document);
        const committedTombstone = `${policyPath}.removed-committed-${process.pid}-${crypto.randomUUID()}`;
        fs.writeFileSync(committedTombstone, fs.readFileSync(policyPath));

        coordinator.withLock(canonicalRoot, () => {
            store.recoverTombstonesWhileLocked(canonicalRoot);
        });
        assert.deepEqual(JSON.parse(fs.readFileSync(policyPath, 'utf8')), document);
        assert.equal(fs.existsSync(committedTombstone), false);
        assert.deepEqual(pendingTombstonePaths(policyPath), []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
