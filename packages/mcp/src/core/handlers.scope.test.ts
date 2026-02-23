import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ToolHandlers } from './handlers.js';
import { IndexFingerprint } from '../config.js';

const RUNTIME_FINGERPRINT: IndexFingerprint = {
    embeddingProvider: 'VoyageAI',
    embeddingModel: 'voyage-4-large',
    embeddingDimension: 1024,
    vectorStoreProvider: 'Milvus',
    schemaVersion: 'hybrid_v2'
};

function withTempRepo<T>(fn: (repoPath: string) => Promise<T>): Promise<T> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-context-mcp-handlers-'));
    const repoPath = path.join(tempDir, 'repo');
    fs.mkdirSync(repoPath, { recursive: true });
    return fn(repoPath).finally(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });
}

function createHandlers(repoPath: string, searchResults?: any[]) {
    const defaultResults = [{
        content: 'return session.isValid();',
        relativePath: 'src/auth.ts',
        startLine: 3,
        endLine: 3,
        language: 'typescript',
        score: 0.99,
        breadcrumbs: ['class SessionManager', 'method validateSession(token: string)']
    }];

    const context = {
        getEmbeddingEngine: () => ({ getProvider: () => 'VoyageAI' }),
        semanticSearch: async () => (searchResults || defaultResults)
    } as any;

    const snapshotManager = {
        getAllCodebases: () => [],
        getIndexedCodebases: () => [repoPath],
        getIndexingCodebases: () => [],
        ensureFingerprintCompatibilityOnAccess: () => ({ allowed: true, changed: false })
    } as any;

    const syncManager = {
        ensureFreshness: async () => undefined
    } as any;

    const handlers = new ToolHandlers(context, snapshotManager, syncManager, RUNTIME_FINGERPRINT);
    (handlers as any).syncIndexedCodebasesFromCloud = async () => undefined;
    return handlers;
}

test('handleSearchCode returnRaw includes breadcrumbs in result metadata', async () => {
    await withTempRepo(async (repoPath) => {
        fs.mkdirSync(path.join(repoPath, 'src'), { recursive: true });
        fs.writeFileSync(path.join(repoPath, 'src', 'auth.ts'), 'export class SessionManager {\n  validateSession(token: string) {\n    return session.isValid();\n  }\n}\n');

        const handlers = createHandlers(repoPath);
        const response = await handlers.handleSearchCode({
            path: repoPath,
            query: 'validate session',
            limit: 5,
            returnRaw: true,
            useIgnoreFiles: false
        });

        assert.equal(response.isError, undefined);
        const payload = JSON.parse(response.content[0]?.text || '{}');
        assert.deepEqual(payload.results?.[0]?.metadata?.breadcrumbs, ['class SessionManager', 'method validateSession(token: string)']);
    });
});

test('handleSearchCode formatted output renders scope line when breadcrumbs exist', async () => {
    await withTempRepo(async (repoPath) => {
        fs.mkdirSync(path.join(repoPath, 'src'), { recursive: true });
        fs.writeFileSync(path.join(repoPath, 'src', 'auth.ts'), 'export class SessionManager {\n  validateSession(token: string) {\n    return session.isValid();\n  }\n}\n');

        const handlers = createHandlers(repoPath);
        const response = await handlers.handleSearchCode({
            path: repoPath,
            query: 'validate session',
            limit: 5,
            returnRaw: false,
            useIgnoreFiles: false
        });

        assert.equal(response.isError, undefined);
        const text = response.content[0]?.text || '';
        assert.match(text, /🧬 Scope: class SessionManager > method validateSession\(token: string\)/);
    });
});

test('handleSearchCode does not merge adjacent chunks when breadcrumbs differ', async () => {
    await withTempRepo(async (repoPath) => {
        fs.mkdirSync(path.join(repoPath, 'src'), { recursive: true });
        fs.writeFileSync(
            path.join(repoPath, 'src', 'auth.ts'),
            'function firstScope() {\n  return "one";\n}\n\nfunction secondScope() {\n  return "two";\n}\n'
        );

        const handlers = createHandlers(repoPath, [
            {
                content: 'return "one";',
                relativePath: 'src/auth.ts',
                startLine: 1,
                endLine: 2,
                language: 'typescript',
                score: 0.95,
                breadcrumbs: ['function firstScope()']
            },
            {
                content: 'return "two";',
                relativePath: 'src/auth.ts',
                startLine: 5,
                endLine: 6,
                language: 'typescript',
                score: 0.90,
                breadcrumbs: ['function secondScope()']
            }
        ]);

        const response = await handlers.handleSearchCode({
            path: repoPath,
            query: 'return value',
            limit: 5,
            returnRaw: false,
            useIgnoreFiles: false
        });

        assert.equal(response.isError, undefined);
        const text = response.content[0]?.text || '';
        assert.match(text, /Scope: function firstScope\(\)/);
        assert.match(text, /Scope: function secondScope\(\)/);
        assert.match(text, /Location: src\/auth\.ts:1-2/);
        assert.match(text, /Location: src\/auth\.ts:5-6/);
    });
});
