import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveNavigationSidecarRoot } from '../symbols';
import {
    DurableAuthorityRestoreTransactionMechanics,
    type DurableAuthorityRestoreEntry,
    type DurableAuthorityRestoreTransaction,
    type DurableAuthorityRecoveryPublisher,
} from './restore-transaction';

interface Harness {
    root: string;
    canonicalRoot: string;
    policyPath: string;
    pointerPath: string;
    journalRoot: string;
    mechanics: DurableAuthorityRestoreTransactionMechanics;
    lockRoots: string[];
}

function createHarness(): Harness {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-restore-tx-'));
    const codebasePath = path.join(root, 'repo');
    fs.mkdirSync(codebasePath, { recursive: true });
    const canonicalRoot = fs.realpathSync(codebasePath);
    const policyRoot = path.join(root, 'policies');
    const navigationStateRoot = path.join(root, 'navigation-state');
    const policyPath = path.join(
        policyRoot,
        `${crypto.createHash('sha256').update(canonicalRoot).digest('hex')}.json`,
    );
    const pointerPath = path.join(
        resolveNavigationSidecarRoot(navigationStateRoot, canonicalRoot),
        'current.json',
    );
    fs.mkdirSync(path.dirname(policyPath), { recursive: true });
    fs.mkdirSync(path.dirname(pointerPath), { recursive: true });
    const journalRoot = path.join(policyRoot, 'restore-transactions');
    const lockRoots: string[] = [];
    const mechanics = new DurableAuthorityRestoreTransactionMechanics({
        indexPolicyStateRoot: policyRoot,
        canonicalizeCodebasePath: (codebasePath) => fs.realpathSync(codebasePath),
        resolvePolicyPath: (canonicalRoot) => path.join(
            policyRoot,
            `${crypto.createHash('sha256').update(canonicalRoot).digest('hex')}.json`,
        ),
        resolveNavigationPointerPath: (canonicalRoot) => (
            path.join(resolveNavigationSidecarRoot(navigationStateRoot, canonicalRoot), 'current.json')
        ),
        withMutationLock: (canonicalRoot, operation) => {
            lockRoots.push(canonicalRoot);
            operation();
        },
    });
    return {
        root,
        canonicalRoot,
        policyPath,
        pointerPath,
        journalRoot,
        mechanics,
        lockRoots,
    };
}

function buildEntries(
    harness: Harness,
    id: string,
    desired: string[],
    expected: string[],
): DurableAuthorityRestoreEntry[] {
    return [harness.policyPath, harness.pointerPath].map((targetPath, index) => ({
        targetPath,
        temporaryPath: `${targetPath}.restore-${id}`,
        displacedPath: `${targetPath}.rollback-${id}`,
        content: desired[index]!,
        digest: crypto.createHash('sha256').update(desired[index]!, 'utf8').digest('hex'),
        expectedDigest: crypto.createHash('sha256').update(expected[index]!, 'utf8').digest('hex'),
    }));
}

function stageTemporaries(entries: DurableAuthorityRestoreEntry[]): void {
    for (const entry of entries) fs.writeFileSync(entry.temporaryPath, entry.content!, 'utf8');
}

function writeJournal(harness: Harness, transaction: DurableAuthorityRestoreTransaction): string {
    const journalPath = path.join(harness.journalRoot, `${transaction.id}.json`);
    fs.mkdirSync(harness.journalRoot, { recursive: true });
    fs.writeFileSync(journalPath, JSON.stringify(transaction), 'utf8');
    return journalPath;
}

function publishingRecoveryPublisher(publish: () => void): DurableAuthorityRecoveryPublisher {
    return (_root, _owner, invoke) => {
        publish();
        invoke();
        return true;
    };
}

test('restore transaction writer persists the unchanged journal format (schemaVersion 1, prepared/swapping/committed phases)', () => {
    const harness = createHarness();
    try {
        const desired = ['{"desiredPolicy":true}\n', '{"desiredPointer":true}\n'];
        const expected = ['{"expectedPolicy":true}\n', '{"expectedPointer":true}\n'];
        const id = crypto.randomUUID();
        const entries = buildEntries(harness, id, desired, expected);
        const transaction: DurableAuthorityRestoreTransaction = {
            schemaVersion: 1,
            id,
            canonicalRoot: harness.canonicalRoot,
            phase: 'prepared',
            nextEntry: 0,
            mutationOwner: { ownerId: 'owner-a', generation: 7, operationId: 'operation-a' },
            entries,
        };
        const journalPath = path.join(harness.journalRoot, `${id}.json`);
        fs.mkdirSync(harness.journalRoot, { recursive: true });

        harness.mechanics.writeDurableAuthorityRestoreTransaction(journalPath, transaction);

        // The persisted journal is the exact compact JSON of the transaction:
        // same shape, same phase semantics, no reformatting.
        assert.equal(fs.readFileSync(journalPath, 'utf8'), JSON.stringify(transaction));
        const parsed = harness.mechanics.parseDurableAuthorityRestoreTransaction(journalPath);
        assert.deepEqual(parsed, transaction);
        assert.equal(parsed.phase, 'prepared');
        assert.equal(parsed.nextEntry, 0);
        assert.deepEqual(parsed.mutationOwner, { ownerId: 'owner-a', generation: 7, operationId: 'operation-a' });
    } finally {
        fs.rmSync(harness.root, { recursive: true, force: true });
    }
});

test('restore transaction completes a prepared journal and cleans every auxiliary artifact', () => {
    const harness = createHarness();
    try {
        const desired = ['{"desiredPolicy":true}\n', '{"desiredPointer":true}\n'];
        const expected = ['{"expectedPolicy":true}\n', '{"expectedPointer":true}\n'];
        fs.writeFileSync(harness.policyPath, expected[0]!, 'utf8');
        fs.writeFileSync(harness.pointerPath, expected[1]!, 'utf8');
        const id = crypto.randomUUID();
        const entries = buildEntries(harness, id, desired, expected);
        stageTemporaries(entries);
        const transaction: DurableAuthorityRestoreTransaction = {
            schemaVersion: 1,
            id,
            canonicalRoot: harness.canonicalRoot,
            phase: 'prepared',
            nextEntry: 0,
            entries,
        };
        const journalPath = writeJournal(harness, transaction);

        harness.mechanics.completeDurableAuthorityRestoreTransaction(journalPath, transaction);

        assert.equal(fs.readFileSync(harness.policyPath, 'utf8'), desired[0]);
        assert.equal(fs.readFileSync(harness.pointerPath, 'utf8'), desired[1]);
        assert.equal(fs.existsSync(journalPath), false);
        for (const entry of entries) {
            assert.equal(fs.existsSync(entry.temporaryPath), false);
            assert.equal(fs.existsSync(entry.displacedPath), false);
        }
    } finally {
        fs.rmSync(harness.root, { recursive: true, force: true });
    }
});

test('restore transaction recovery completes an interrupted swapping journal under the mutation lock', () => {
    const harness = createHarness();
    try {
        const desired = ['{"desiredPolicy":true}\n', '{"desiredPointer":true}\n'];
        const expected = ['{"expectedPolicy":true}\n', '{"expectedPointer":true}\n'];
        fs.writeFileSync(harness.policyPath, expected[0]!, 'utf8');
        fs.writeFileSync(harness.pointerPath, expected[1]!, 'utf8');
        const id = crypto.randomUUID();
        const entries = buildEntries(harness, id, desired, expected);
        stageTemporaries(entries);
        // Entry 0 was swapped: its target was displaced before interruption.
        fs.renameSync(harness.policyPath, entries[0]!.displacedPath);
        const transaction: DurableAuthorityRestoreTransaction = {
            schemaVersion: 1,
            id,
            canonicalRoot: harness.canonicalRoot,
            phase: 'swapping',
            nextEntry: 0,
            mutationOwner: { ownerId: 'owner-a', generation: 7, operationId: 'operation-a' },
            entries,
        };
        writeJournal(harness, transaction);

        harness.mechanics.recoverDurableIndexAuthorityTransactions(publishingRecoveryPublisher(() => {}));

        assert.equal(fs.readFileSync(harness.policyPath, 'utf8'), desired[0]);
        assert.equal(fs.readFileSync(harness.pointerPath, 'utf8'), desired[1]);
        assert.deepEqual(fs.readdirSync(harness.journalRoot), []);
        assert.deepEqual(harness.lockRoots, [harness.canonicalRoot]);
        for (const entry of entries) {
            assert.equal(fs.existsSync(entry.temporaryPath), false);
            assert.equal(fs.existsSync(entry.displacedPath), false);
        }
    } finally {
        fs.rmSync(harness.root, { recursive: true, force: true });
    }
});

test('restore transaction recovery finishes cleanup of a committed journal after partial auxiliary removal', () => {
    const harness = createHarness();
    try {
        const desired = ['{"desiredPolicy":true}\n', '{"desiredPointer":true}\n'];
        const expected = ['{"expectedPolicy":true}\n', '{"expectedPointer":true}\n'];
        fs.writeFileSync(harness.policyPath, desired[0]!, 'utf8');
        fs.writeFileSync(harness.pointerPath, desired[1]!, 'utf8');
        const id = '123e4567-e89b-42d3-a456-426614174000';
        const entries = buildEntries(harness, id, desired, expected);
        fs.writeFileSync(entries[0]!.displacedPath, expected[0]!, 'utf8');
        fs.writeFileSync(entries[1]!.temporaryPath, desired[1]!, 'utf8');
        fs.writeFileSync(entries[1]!.displacedPath, expected[1]!, 'utf8');
        const transaction: DurableAuthorityRestoreTransaction = {
            schemaVersion: 1,
            id,
            canonicalRoot: harness.canonicalRoot,
            phase: 'committed',
            nextEntry: entries.length,
            entries,
        };
        writeJournal(harness, transaction);
        fs.rmSync(entries[0]!.displacedPath);

        harness.mechanics.recoverDurableIndexAuthorityTransactions(publishingRecoveryPublisher(() => {}));

        assert.equal(fs.readFileSync(harness.policyPath, 'utf8'), desired[0]);
        assert.equal(fs.readFileSync(harness.pointerPath, 'utf8'), desired[1]);
        assert.deepEqual(fs.readdirSync(harness.journalRoot), []);
        for (const entry of entries) {
            assert.equal(fs.existsSync(entry.temporaryPath), false);
            assert.equal(fs.existsSync(entry.displacedPath), false);
        }
    } finally {
        fs.rmSync(harness.root, { recursive: true, force: true });
    }
});

test('restore transaction recovery requires a fenced recovery publisher when journals are pending', () => {
    const harness = createHarness();
    try {
        const desired = ['{"desiredPolicy":true}\n', '{"desiredPointer":true}\n'];
        const expected = ['{"expectedPolicy":true}\n', '{"expectedPointer":true}\n'];
        const id = crypto.randomUUID();
        const entries = buildEntries(harness, id, desired, expected);
        stageTemporaries(entries);
        const transaction: DurableAuthorityRestoreTransaction = {
            schemaVersion: 1,
            id,
            canonicalRoot: harness.canonicalRoot,
            phase: 'prepared',
            nextEntry: 0,
            entries,
        };
        writeJournal(harness, transaction);

        assert.throws(
            () => harness.mechanics.recoverDurableIndexAuthorityTransactions(undefined),
            /no fenced recovery publisher is configured/i,
        );
    } finally {
        fs.rmSync(harness.root, { recursive: true, force: true });
    }
});

test('restore transaction recovery fails closed when the publisher cannot acquire the mutation fence', () => {
    const harness = createHarness();
    try {
        const desired = ['{"desiredPolicy":true}\n', '{"desiredPointer":true}\n'];
        const expected = ['{"expectedPolicy":true}\n', '{"expectedPointer":true}\n'];
        fs.writeFileSync(harness.policyPath, expected[0]!, 'utf8');
        fs.writeFileSync(harness.pointerPath, expected[1]!, 'utf8');
        const id = crypto.randomUUID();
        const entries = buildEntries(harness, id, desired, expected);
        stageTemporaries(entries);
        const transaction: DurableAuthorityRestoreTransaction = {
            schemaVersion: 1,
            id,
            canonicalRoot: harness.canonicalRoot,
            phase: 'prepared',
            nextEntry: 0,
            entries,
        };
        const journalPath = writeJournal(harness, transaction);
        const journalBeforeRecovery = fs.readFileSync(journalPath, 'utf8');

        assert.throws(
            () => harness.mechanics.recoverDurableIndexAuthorityTransactions(() => false),
            /could not acquire the mutation fence/i,
        );
        assert.equal(fs.readFileSync(journalPath, 'utf8'), journalBeforeRecovery);
        assert.deepEqual(harness.lockRoots, []);
    } finally {
        fs.rmSync(harness.root, { recursive: true, force: true });
    }
});

test('restore transaction recovery rejects a publisher that publishes more than once', () => {
    const harness = createHarness();
    try {
        const desired = ['{"desiredPolicy":true}\n', '{"desiredPointer":true}\n'];
        const expected = ['{"expectedPolicy":true}\n', '{"expectedPointer":true}\n'];
        fs.writeFileSync(harness.policyPath, expected[0]!, 'utf8');
        fs.writeFileSync(harness.pointerPath, expected[1]!, 'utf8');
        const id = crypto.randomUUID();
        const entries = buildEntries(harness, id, desired, expected);
        stageTemporaries(entries);
        const transaction: DurableAuthorityRestoreTransaction = {
            schemaVersion: 1,
            id,
            canonicalRoot: harness.canonicalRoot,
            phase: 'prepared',
            nextEntry: 0,
            entries,
        };
        writeJournal(harness, transaction);

        assert.throws(
            () => harness.mechanics.recoverDurableIndexAuthorityTransactions(
                (_root, _owner, invoke) => {
                    invoke();
                    invoke();
                    return true;
                },
            ),
            /published more than once/i,
        );
    } finally {
        fs.rmSync(harness.root, { recursive: true, force: true });
    }
});

test('restore transaction recovery refuses a swapping journal after newer authority is published', () => {
    const harness = createHarness();
    try {
        const desired = ['{"desiredPolicy":true}\n', '{"desiredPointer":true}\n'];
        const expected = ['{"expectedPolicy":true}\n', '{"expectedPointer":true}\n'];
        const newer = ['{"newerPolicy":true}\n', '{"newerPointer":true}\n'];
        fs.writeFileSync(harness.policyPath, expected[0]!, 'utf8');
        fs.writeFileSync(harness.pointerPath, expected[1]!, 'utf8');
        const id = crypto.randomUUID();
        const entries = buildEntries(harness, id, desired, expected);
        stageTemporaries(entries);
        const transaction: DurableAuthorityRestoreTransaction = {
            schemaVersion: 1,
            id,
            canonicalRoot: harness.canonicalRoot,
            phase: 'swapping',
            nextEntry: 0,
            entries,
        };
        const journalPath = writeJournal(harness, transaction);

        // Newer authority replaces both targets after the interruption.
        fs.writeFileSync(harness.policyPath, newer[0]!, 'utf8');
        fs.writeFileSync(harness.pointerPath, newer[1]!, 'utf8');
        const journalBeforeRecovery = fs.readFileSync(journalPath, 'utf8');

        assert.throws(
            () => harness.mechanics.recoverDurableIndexAuthorityTransactions(
                publishingRecoveryPublisher(() => {}),
            ),
            /no longer owns current authority/i,
        );

        assert.equal(fs.readFileSync(harness.policyPath, 'utf8'), newer[0]);
        assert.equal(fs.readFileSync(harness.pointerPath, 'utf8'), newer[1]);
        assert.equal(fs.readFileSync(journalPath, 'utf8'), journalBeforeRecovery);
        for (const entry of entries) {
            assert.equal(fs.existsSync(entry.temporaryPath), true);
            assert.equal(fs.existsSync(entry.displacedPath), false);
        }
    } finally {
        fs.rmSync(harness.root, { recursive: true, force: true });
    }
});

test('restore transaction validation rejects a prepared journal whose target no longer matches the expected digest', () => {
    const harness = createHarness();
    try {
        const desired = ['{"desiredPolicy":true}\n', '{"desiredPointer":true}\n'];
        const expected = ['{"expectedPolicy":true}\n', '{"expectedPointer":true}\n'];
        fs.writeFileSync(harness.policyPath, expected[0]!, 'utf8');
        fs.writeFileSync(harness.pointerPath, expected[1]!, 'utf8');
        const id = crypto.randomUUID();
        const entries = buildEntries(harness, id, desired, expected);
        stageTemporaries(entries);
        const transaction: DurableAuthorityRestoreTransaction = {
            schemaVersion: 1,
            id,
            canonicalRoot: harness.canonicalRoot,
            phase: 'prepared',
            nextEntry: 0,
            entries,
        };

        // The prepared state is valid while every target still matches its expected digest.
        harness.mechanics.validateDurableAuthorityRestoreTransactionState(transaction);

        fs.writeFileSync(harness.policyPath, '{"foreignPolicy":true}\n', 'utf8');
        assert.throws(
            () => harness.mechanics.validateDurableAuthorityRestoreTransactionState(transaction),
            /no longer owns current authority for entry 0/i,
        );
    } finally {
        fs.rmSync(harness.root, { recursive: true, force: true });
    }
});

test('restore transaction parser rejects journals whose auxiliary paths escape owned authority paths', () => {
    const harness = createHarness();
    try {
        const desired = ['{"desiredPolicy":true}\n', '{"desiredPointer":true}\n'];
        const expected = ['{"expectedPolicy":true}\n', '{"expectedPointer":true}\n'];
        fs.writeFileSync(harness.policyPath, expected[0]!, 'utf8');
        fs.writeFileSync(harness.pointerPath, expected[1]!, 'utf8');
        const id = crypto.randomUUID();
        const entries = buildEntries(harness, id, desired, expected);
        const externalSentinel = path.join(harness.root, 'external-sentinel');
        fs.writeFileSync(externalSentinel, 'sentinel', 'utf8');
        entries[0]!.temporaryPath = externalSentinel;
        const transaction: DurableAuthorityRestoreTransaction = {
            schemaVersion: 1,
            id,
            canonicalRoot: harness.canonicalRoot,
            phase: 'swapping',
            nextEntry: 0,
            entries,
        };
        const journalPath = writeJournal(harness, transaction);

        assert.throws(
            () => harness.mechanics.parseDurableAuthorityRestoreTransaction(journalPath),
            /has an invalid entry/i,
        );
        assert.equal(fs.readFileSync(externalSentinel, 'utf8'), 'sentinel');
    } finally {
        fs.rmSync(harness.root, { recursive: true, force: true });
    }
});
