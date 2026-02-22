import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileTool } from './read_file.js';
import { ToolContext } from './types.js';

function withTempDir<T>(fn: (dir: string) => Promise<T> | T): Promise<T> | T {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-read-file-test-'));
    const run = async () => await fn(dir);
    return run().finally(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });
}

function buildContext(readFileMaxLines: number): ToolContext {
    return {
        readFileMaxLines
    } as unknown as ToolContext;
}

async function runReadFile(args: unknown, readFileMaxLines = 1000) {
    return readFileTool.execute(args, buildContext(readFileMaxLines));
}

test('read_file schema rejects invalid line parameters', async () => {
    const fractional = await runReadFile({
        path: '/tmp/test.txt',
        start_line: 1.5
    });

    assert.equal(fractional.isError, true);
    assert.match(fractional.content[0].text, /Invalid arguments for 'read_file'/);
    assert.match(fractional.content[0].text, /start_line/);

    const zero = await runReadFile({
        path: '/tmp/test.txt',
        end_line: 0
    });

    assert.equal(zero.isError, true);
    assert.match(zero.content[0].text, /end_line/);
});

test('read_file returns full content for small files when range is omitted', async () => {
    await withTempDir(async (dir) => {
        const filePath = path.join(dir, 'small.ts');
        fs.writeFileSync(filePath, 'a\nb\nc\n', 'utf8');

        const response = await runReadFile({ path: filePath }, 1000);
        assert.equal(response.isError, undefined);
        assert.equal(response.content[0].text, 'a\nb\nc');
    });
});

test('read_file auto-truncates large files and returns dynamic continuation hint', async () => {
    await withTempDir(async (dir) => {
        const filePath = path.join(dir, 'large.ts');
        fs.writeFileSync(filePath, 'L1\nL2\nL3\nL4\nL5\n', 'utf8');

        const response = await runReadFile({ path: filePath }, 3);
        assert.equal(response.isError, undefined);
        assert.equal(
            response.content[0].text,
            `L1\nL2\nL3\n\n(File truncated at line 3. To read more, call read_file with path="${filePath}" and start_line=4.)`
        );
    });
});

test('read_file start_line-only requests use a capped window and continuation hint', async () => {
    await withTempDir(async (dir) => {
        const filePath = path.join(dir, 'window.ts');
        fs.writeFileSync(filePath, 'L1\nL2\nL3\nL4\nL5\n', 'utf8');

        const response = await runReadFile({ path: filePath, start_line: 2 }, 3);
        assert.equal(response.isError, undefined);
        assert.equal(
            response.content[0].text,
            `L2\nL3\nL4\n\n(File truncated at line 4. To read more, call read_file with path="${filePath}" and start_line=5.)`
        );
    });
});

test('read_file start_line + end_line returns exact inclusive range', async () => {
    await withTempDir(async (dir) => {
        const filePath = path.join(dir, 'range.ts');
        fs.writeFileSync(filePath, 'L1\nL2\nL3\nL4\n', 'utf8');

        const response = await runReadFile({ path: filePath, start_line: 2, end_line: 3 }, 3);
        assert.equal(response.isError, undefined);
        assert.equal(response.content[0].text, 'L2\nL3');
    });
});

test('read_file clamps out-of-range inputs safely', async () => {
    await withTempDir(async (dir) => {
        const filePath = path.join(dir, 'clamp.ts');
        fs.writeFileSync(filePath, 'L1\nL2\nL3\nL4\nL5\n', 'utf8');

        const highClamp = await runReadFile({ path: filePath, start_line: 999, end_line: 1000 }, 3);
        assert.equal(highClamp.isError, undefined);
        assert.equal(highClamp.content[0].text, 'L5');

        const endOnly = await runReadFile({ path: filePath, end_line: 2 }, 3);
        assert.equal(endOnly.isError, undefined);
        assert.equal(endOnly.content[0].text, 'L1\nL2');
    });
});

test('read_file preserves missing-file and non-file errors', async () => {
    await withTempDir(async (dir) => {
        const missingPath = path.join(dir, 'missing.ts');
        const missing = await runReadFile({ path: missingPath }, 1000);
        assert.equal(missing.isError, true);
        assert.match(missing.content[0].text, /not found/);

        const nonFile = await runReadFile({ path: dir }, 1000);
        assert.equal(nonFile.isError, true);
        assert.match(nonFile.content[0].text, /is not a file/);
    });
});
