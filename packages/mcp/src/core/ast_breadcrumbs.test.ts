import test from 'node:test';
import assert from 'node:assert/strict';
import { AstCodeSplitter } from '@zokizuan/claude-context-core';

test('AstCodeSplitter emits TS class/method breadcrumbs', async () => {
    const splitter = new AstCodeSplitter();
    const code = [
        'export class AuthManager {',
        '  async validateSession(token: string) {',
        '    return token.length > 0;',
        '  }',
        '}'
    ].join('\n');

    const chunks = await splitter.split(code, 'typescript', '/tmp/auth.ts');
    const target = chunks.find(
        (chunk) =>
            chunk.content.includes('return token.length > 0;')
            && Array.isArray(chunk.metadata.breadcrumbs)
            && chunk.metadata.breadcrumbs.length === 2
    );
    assert.ok(target);
    assert.deepEqual(target?.metadata.breadcrumbs, ['class AuthManager', 'async method validateSession(token: string)']);
});

test('AstCodeSplitter emits Python class/function breadcrumbs', async () => {
    const splitter = new AstCodeSplitter();
    const code = [
        'class SessionManager:',
        '    async def validate(self, token: str):',
        '        return token',
        ''
    ].join('\n');

    const chunks = await splitter.split(code, 'python', '/tmp/auth.py');
    const target = chunks.find(
        (chunk) =>
            chunk.content.includes('return token')
            && Array.isArray(chunk.metadata.breadcrumbs)
            && chunk.metadata.breadcrumbs.length === 2
    );
    assert.ok(target);
    assert.deepEqual(target?.metadata.breadcrumbs, ['class SessionManager', 'async function validate(self, token: str)']);
});

test('AstCodeSplitter caps breadcrumb depth at 2', async () => {
    const splitter = new AstCodeSplitter();
    const code = [
        'class A {',
        '  outer() {',
        '    const inner = () => {',
        '      return 1;',
        '    };',
        '    return inner();',
        '  }',
        '}'
    ].join('\n');

    const chunks = await splitter.split(code, 'typescript', '/tmp/depth.ts');
    for (const chunk of chunks) {
        if (Array.isArray(chunk.metadata.breadcrumbs)) {
            assert.ok(chunk.metadata.breadcrumbs.length <= 2);
        }
    }
});

test('AstCodeSplitter preserves breadcrumbs when splitting large chunks', async () => {
    const splitter = new AstCodeSplitter(80, 0);
    const repeatedBody = Array.from({ length: 30 }, (_, i) => `    const v${i} = token + ${i};`).join('\n');
    const code = [
        'class LargeAuth {',
        '  validate(token: string) {',
        repeatedBody,
        '    return token;',
        '  }',
        '}'
    ].join('\n');

    const chunks = await splitter.split(code, 'typescript', '/tmp/large.ts');
    const methodChunks = chunks.filter((chunk) => Array.isArray(chunk.metadata.breadcrumbs) && chunk.metadata.breadcrumbs.includes('method validate(token: string)'));
    assert.ok(methodChunks.length > 1);
    for (const chunk of methodChunks) {
        assert.deepEqual(chunk.metadata.breadcrumbs, ['class LargeAuth', 'method validate(token: string)']);
    }
});
