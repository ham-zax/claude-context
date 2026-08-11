import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
    readStableRootBoundFileWindow,
    RootBoundFileWindowLimitError,
} from './root-bound-file-window';
import { RootBoundFileError } from './root-bound-fs';

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

async function mutateAfterFirstStreamChunk(
    t: TestContext,
    absolutePath: string,
    mutate: () => void,
): Promise<void> {
    const probeHandle = await fsp.open(absolutePath, 'r');
    const fileHandlePrototype = Object.getPrototypeOf(probeHandle) as {
        createReadStream: fsp.FileHandle['createReadStream'];
    };
    const originalCreateReadStream = fileHandlePrototype.createReadStream;
    await probeHandle.close();

    t.mock.method(fileHandlePrototype, 'createReadStream', function createReadStream(
        this: fsp.FileHandle,
        options?: Parameters<fsp.FileHandle['createReadStream']>[0],
    ) {
        const source = originalCreateReadStream.call(this, options);
        let mutationPending = true;
        return Readable.from((async function* streamWithMutation() {
            for await (const chunk of source) {
                yield chunk;
                if (mutationPending) {
                    mutationPending = false;
                    mutate();
                }
            }
        })());
    });
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

test('readStableRootBoundFileWindow uses universal newline semantics', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-root-window-newlines-'));
    try {
        for (const [name, lineEnding] of [
            ['lf', '\n'],
            ['crlf', '\r\n'],
            ['cr', '\r'],
        ] as const) {
            const relativePath = `src/${name}.ts`;
            const absolutePath = path.join(root, relativePath);
            const source = ['before', 'target', 'after'].join(lineEnding);
            fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
            fs.writeFileSync(absolutePath, source, 'utf8');

            const evidence = await readStableRootBoundFileWindow({
                canonicalRoot: root,
                relativePath,
                requestedLineRange: { startLine: 2, endLine: 2 },
                maxFileBytes: 1024,
                maxWindowBytes: 1024,
            });

            assert.equal(evidence.utf8Window, `target${lineEnding}`, name);
            assert.equal(evidence.totalLineCount, 3, name);
            assert.deepEqual(evidence.lineMappings, [{
                localLine: 1,
                originalLine: 2,
                startUtf16Offset: 0,
                endUtf16Offset: `target${lineEnding}`.length,
            }], name);
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('readStableRootBoundFileWindow treats CRLF split across stream chunks as one newline', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-root-window-split-crlf-'));
    const relativePath = 'src/split-crlf.ts';
    const absolutePath = path.join(root, relativePath);
    const firstLine = 'x'.repeat((64 * 1024) - 1);
    const source = `${firstLine}\r\ntarget\r\nafter`;
    try {
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, source, 'utf8');

        const evidence = await readStableRootBoundFileWindow({
            canonicalRoot: root,
            relativePath,
            requestedLineRange: { startLine: 2, endLine: 2 },
            maxFileBytes: 128 * 1024,
            maxWindowBytes: 1024,
        });

        assert.equal(Buffer.byteLength(`${firstLine}\r`, 'utf8'), 64 * 1024);
        assert.equal(evidence.utf8Window, 'target\r\n');
        assert.equal(evidence.totalLineCount, 3);
        assert.deepEqual(evidence.originalLineRange, { startLine: 2, endLine: 2 });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('readStableRootBoundFileWindow counts a final bare CR as a trailing empty line', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-root-window-final-cr-'));
    const relativePath = 'src/final-cr.ts';
    const absolutePath = path.join(root, relativePath);
    try {
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, 'before\r', 'utf8');

        const evidence = await readStableRootBoundFileWindow({
            canonicalRoot: root,
            relativePath,
            requestedLineRange: { startLine: 2, endLine: 2 },
            maxFileBytes: 1024,
            maxWindowBytes: 1024,
        });

        assert.equal(evidence.totalLineCount, 2);
        assert.equal(evidence.utf8Window, '');
        assert.deepEqual(evidence.originalLineRange, { startLine: 2, endLine: 2 });
        assert.deepEqual(evidence.lineMappings, [{
            localLine: 1,
            originalLine: 2,
            startUtf16Offset: 0,
            endUtf16Offset: 0,
        }]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('readStableRootBoundFileWindow rejects growth during its streamed read', async (t) => {
    const fixture = createFixture();
    try {
        await mutateAfterFirstStreamChunk(t, fixture.absolutePath, () => {
            fs.appendFileSync(fixture.absolutePath, 'x');
        });

        await assert.rejects(
            () => readStableRootBoundFileWindow({
                canonicalRoot: fixture.root,
                relativePath: fixture.relativePath,
                requestedLineRange: { startLine: 3_001, endLine: 3_003 },
                maxFileBytes: 8 * 1024 * 1024,
                maxWindowBytes: 4 * 1024,
            }),
            (error) => error instanceof RootBoundFileError
                && error.code === 'source_changed_during_inspection',
        );
    } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
    }
});

test('readStableRootBoundFileWindow rejects truncation during its streamed read', async (t) => {
    const fixture = createFixture();
    try {
        await mutateAfterFirstStreamChunk(t, fixture.absolutePath, () => {
            fs.truncateSync(fixture.absolutePath, 70 * 1024);
        });

        await assert.rejects(
            () => readStableRootBoundFileWindow({
                canonicalRoot: fixture.root,
                relativePath: fixture.relativePath,
                requestedLineRange: { startLine: 3_001, endLine: 3_003 },
                maxFileBytes: 8 * 1024 * 1024,
                maxWindowBytes: 4 * 1024,
            }),
            (error) => error instanceof RootBoundFileError
                && error.code === 'source_changed_during_inspection',
        );
    } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
    }
});

test('readStableRootBoundFileWindow rejects pathname replacement during its streamed read', async (t) => {
    const fixture = createFixture();
    const replacementPath = path.join(fixture.root, 'replacement.ts');
    try {
        fs.writeFileSync(replacementPath, fixture.source.replace('owner', 'replacementOwner'), 'utf8');
        await mutateAfterFirstStreamChunk(t, fixture.absolutePath, () => {
            fs.renameSync(replacementPath, fixture.absolutePath);
        });

        await assert.rejects(
            () => readStableRootBoundFileWindow({
                canonicalRoot: fixture.root,
                relativePath: fixture.relativePath,
                requestedLineRange: { startLine: 3_001, endLine: 3_003 },
                maxFileBytes: 8 * 1024 * 1024,
                maxWindowBytes: 4 * 1024,
            }),
            (error) => error instanceof RootBoundFileError
                && (
                    error.code === 'source_changed_during_inspection'
                    || error.code === 'path_identity_changed_during_inspection'
                ),
        );
    } finally {
        fs.rmSync(fixture.root, { recursive: true, force: true });
    }
});
