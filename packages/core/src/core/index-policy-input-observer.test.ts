import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ignore from 'ignore';
import {
    computeIndexPolicyControlSignature,
    observeIndexPolicyInputs,
} from './index-policy-input-observer';

function createRoot(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'satori-index-policy-inputs-'));
}

test('policy observation preserves root anchoring and cross-file rule order', async () => {
    const root = createRoot();
    try {
        assert.deepEqual((await observeIndexPolicyInputs(root)).fileBasedIgnorePatterns, []);

        fs.writeFileSync(path.join(root, '.satoriignore'), 'data/\n', 'utf8');
        let observed = await observeIndexPolicyInputs(root);
        assert.deepEqual(observed.fileBasedIgnorePatterns, ['data/']);
        assert.equal(ignore().add(observed.fileBasedIgnorePatterns).ignores('src/data/value.ts'), true);

        fs.writeFileSync(path.join(root, '.satoriignore'), '/data/\n', 'utf8');
        observed = await observeIndexPolicyInputs(root);
        const anchoredMatcher = ignore().add(observed.fileBasedIgnorePatterns);
        assert.equal(anchoredMatcher.ignores('data/value.ts'), true);
        assert.equal(anchoredMatcher.ignores('src/data/value.ts'), false);

        fs.writeFileSync(path.join(root, '.satoriignore'), 'data/\n', 'utf8');
        fs.writeFileSync(path.join(root, '.gitignore'), '!data/\n!data/keep.ts\n', 'utf8');
        observed = await observeIndexPolicyInputs(root);
        assert.deepEqual(observed.fileBasedIgnorePatterns, [
            'data/',
            '!data/',
            '!data/keep.ts',
        ]);
        assert.equal(ignore().add(observed.fileBasedIgnorePatterns).ignores('data/keep.ts'), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('control signatures detect same-size replacement and deletion', async () => {
    const root = createRoot();
    const ignorePath = path.join(root, '.satoriignore');
    try {
        fs.writeFileSync(ignorePath, 'data/\n', 'utf8');
        const initial = await computeIndexPolicyControlSignature(root);
        const originalTimes = fs.statSync(ignorePath);

        fs.writeFileSync(ignorePath, '/data\n', 'utf8');
        fs.utimesSync(ignorePath, originalTimes.atime, originalTimes.mtime);
        const replaced = await computeIndexPolicyControlSignature(root);
        assert.notEqual(replaced, initial);

        fs.rmSync(ignorePath);
        const deleted = await computeIndexPolicyControlSignature(root);
        assert.notEqual(deleted, replaced);
        assert.match(deleted, /^v1:\.satoriignore:missing\|/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('policy observation rejects oversized control files', async () => {
    const root = createRoot();
    try {
        fs.writeFileSync(path.join(root, '.satoriignore'), Buffer.alloc(1_048_577, 0x78));
        await assert.rejects(
            () => observeIndexPolicyInputs(root),
            /exceeds the 1048576-byte policy limit/,
        );
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
