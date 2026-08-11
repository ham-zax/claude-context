import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMerkleRoot } from './merkle';
import {
    assertValidCurrentSnapshot,
    assertValidGenerationSnapshot,
    buildSnapshotPayload,
    parseSnapshotDocument,
    serializeSnapshot,
    type SnapshotCheckpointState,
    type SnapshotV3,
} from './snapshot-codec';

test('snapshot codec preserves deterministic V2/V3 bytes and validation', () => {
    const canonicalRoot = '/repo';
    const fileHashes = new Map([
        ['z.ts', 'b'.repeat(64)],
        ['a.ts', 'a'.repeat(64)],
    ]);
    const fileStats = new Map([
        ['z.ts', { size: 2, mtimeMs: 2, ctimeMs: 2 }],
        ['a.ts', { size: 1, mtimeMs: 1, ctimeMs: 1 }],
    ]);
    const checkpoint: SnapshotCheckpointState = {
        fileHashes,
        fileStats,
        merkleRoot: computeMerkleRoot(fileHashes),
        partialScan: false,
        unscannedDirPrefixes: [],
        fullHashCounter: 3,
    };

    const v2 = buildSnapshotPayload(checkpoint, canonicalRoot, null, null);
    const v2Bytes = serializeSnapshot(v2);
    assert.equal(
        v2Bytes,
        JSON.stringify({
            snapshotVersion: 2,
            fileHashes: [
                ['a.ts', 'a'.repeat(64)],
                ['z.ts', 'b'.repeat(64)],
            ],
            fileStats: [
                ['a.ts', { size: 1, mtimeMs: 1, ctimeMs: 1 }],
                ['z.ts', { size: 2, mtimeMs: 2, ctimeMs: 2 }],
            ],
            merkleRoot: checkpoint.merkleRoot,
            partialScan: false,
            unscannedDirPrefixes: [],
            fullHashCounter: 3,
        }),
    );
    assert.deepEqual(parseSnapshotDocument(v2Bytes), v2);
    assert.doesNotThrow(() => assertValidCurrentSnapshot(parseSnapshotDocument(v2Bytes), canonicalRoot));

    const authority = {
        collectionName: 'generation-a',
        markerRunId: 'run-generation-a',
        indexPolicyHash: 'c'.repeat(64),
    };
    const v3 = buildSnapshotPayload(checkpoint, canonicalRoot, authority.collectionName, authority) as SnapshotV3;
    const v3Bytes = serializeSnapshot(v3);
    assert.deepEqual(parseSnapshotDocument(v3Bytes), v3);
    assert.doesNotThrow(() => assertValidGenerationSnapshot(
        parseSnapshotDocument(v3Bytes),
        {
            canonicalRoot,
            checkpointIdentity: authority.collectionName,
            checkpointAuthority: authority,
        },
    ));

    const malformed = { ...parseSnapshotDocument(v2Bytes), merkleRoot: '0'.repeat(64) };
    assert.throws(
        () => assertValidCurrentSnapshot(malformed, canonicalRoot),
        /Invalid current-format snapshot/i,
    );
});
