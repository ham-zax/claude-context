import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    readStableRootBoundFileWindow,
    RootBoundFileWindowLimitError,
} from './root-bound-file-window';

function createFixture(): {
    root: string;
    relativePath: string;
    absolutePath: string;
    source: string;
} {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-root-window-'));
    const relativePath = 'src/large.ts';
    const absolutePath = path.join(root, relativePath);
    const source = [
        ...Array.from({ length: 3_000 }, (_, index) => (
            `// padding ${String(index).padStart(4, '0')} ${'x'.repeat(90)}`
        )),
        'export function owner() {',
        '  return executeOwner();',
        '}',
    ].join('\n');
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, source, 'utf8');
    return { root, relativePath, absolutePath, source };
}

test('readStableRootBoundFileWindow hashes the complete file and retains only requested lines', async () => {
    const fixture = createFixture();
    try {
        const evidence = await readStableRootBoundFileWindow({
            canonicalRoot: fixture.root,
            relativePath: fixture.relativePath,
            requestedLineRange: { startLine: 3_001, endLine: 3_003 },
            maxFileBytes: 8 * 1024 * 1024,
            maxWindowBytes: 4 * 1024,
        });

        assert.ok(evidence.observedByteSize > 256 * 1024);
        assert.equal(
            evidence.rawByteSha256,
            crypto.createHash('sha256').update(fixture.source, 'utf8').digest('hex'),
        );
        assert.equal(evidence.utf8Window, [
            'export function owner() {',
            '  return executeOwner();',
            '}',
        ].join('\n'));
        assert.equal(evidence.utf8Window.includes('padding'), false);
        assert.equal(evidence.identity.canonicalRelativePath, fixture.relativePath);
        assert.notEqual(evidence.identity.stableIdentity, 'unsupported');
        assert.deepEqual(evidence.originalLineRange, { startLine: 3_001, endLine: 3_003 });
        assert.deepEqual(evidence.lineMappings.map(({ localLine, originalLine }) => ({
            localLine,
            originalLine,
        })), [
            { localLine: 1, originalLine: 3_001 },
            { localLine: 2, originalLine: 3_002 },
            { localLine: 3, originalLine: 3_003 },
        ]);
    } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
    }
});

test('readStableRootBoundFileWindow distinguishes file and retained-window limits', async () => {
    const fixture = createFixture();
    try {
        await assert.rejects(
            () => readStableRootBoundFileWindow({
                canonicalRoot: fixture.root,
                relativePath: fixture.relativePath,
                requestedLineRange: { startLine: 3_001, endLine: 3_003 },
                maxFileBytes: 256 * 1024,
                maxWindowBytes: 4 * 1024,
            }),
            (error) => error instanceof RootBoundFileWindowLimitError
                && error.code === 'file_size_limit_exceeded',
        );
        await assert.rejects(
            () => readStableRootBoundFileWindow({
                canonicalRoot: fixture.root,
                relativePath: fixture.relativePath,
                requestedLineRange: { startLine: 3_001, endLine: 3_003 },
                maxFileBytes: 8 * 1024 * 1024,
                maxWindowBytes: 8,
            }),
            (error) => error instanceof RootBoundFileWindowLimitError
                && error.code === 'window_size_limit_exceeded',
        );
    } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
    }
});

test('readStableRootBoundFileWindow retains a requested line spanning stream chunks', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-root-window-chunk-'));
    const relativePath = 'src/chunked.ts';
    const absolutePath = path.join(root, relativePath);
    const requestedLine = `const chunked = "${'界'.repeat(24_000)}";`;
    const source = ['before', requestedLine, 'after'].join('\n');
    try {
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, source, 'utf8');

        const evidence = await readStableRootBoundFileWindow({
            canonicalRoot: root,
            relativePath,
            requestedLineRange: { startLine: 2, endLine: 2 },
            maxFileBytes: 8 * 1024 * 1024,
            maxWindowBytes: 128 * 1024,
        });

        assert.ok(Buffer.byteLength(requestedLine, 'utf8') > 64 * 1024);
        assert.equal(evidence.utf8Window, `${requestedLine}\n`);
        assert.deepEqual(evidence.originalLineRange, { startLine: 2, endLine: 2 });
        assert.deepEqual(evidence.lineMappings, [{
            localLine: 1,
            originalLine: 2,
            startUtf16Offset: 0,
            endUtf16Offset: requestedLine.length + 1,
        }]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
