import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const {
    Context,
    EMBEDDING_NORMALIZATION_POLICY_VERSION,
} = require('../../packages/core/dist/index.js');
const { LanceDbVectorDatabase } = require('../../packages/core/dist/lancedb.js');
const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const builtCorePath = path.join(repositoryRoot, 'packages/core/dist/index.js');

class IntegrationEmbedding {
    config = { model: 'integration-embedding-v1' };

    async detectDimension() {
        return 2;
    }

    embedText(text) {
        const lower = text.toLowerCase();
        return {
            vector: [lower.includes('auth') ? 1 : 0.25, Math.min(1, lower.length / 1000)],
            dimension: 2,
        };
    }

    async embedQuery(text) {
        return this.embedText(text);
    }

    async embedDocuments(texts) {
        return texts.map((text) => this.embedText(text));
    }

    getDimension() {
        return 2;
    }

    getProvider() {
        return 'IntegrationEmbedding';
    }

    getIdentity() {
        return Object.freeze({
            provider: this.getProvider(),
            model: this.config.model,
            dimension: this.getDimension(),
            artifactDigest: null,
            normalizationPolicy: EMBEDDING_NORMALIZATION_POLICY_VERSION,
        });
    }
}

test('built Core LanceDB adapter is visible from a fresh Node process', async (t) => {
    const databasePath = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-lancedb-built-'));
    t.after(() => fs.rmSync(databasePath, { recursive: true, force: true }));
    const collectionName = 'hybrid_code_chunks_built__gen_current';
    const database = new LanceDbVectorDatabase({ databasePath });
    t.after(() => database.close());

    await database.createHybridCollection(collectionName, 2, undefined, { deferIndexBuild: true });
    await database.writeDocuments(collectionName, [{
        document: {
            id: 'built-document',
            vector: [1, 0],
            content: 'export const built = true;',
            relativePath: 'src/built.ts',
            startLine: 1,
            endLine: 1,
            fileExtension: '.ts',
            metadata: { language: 'typescript' },
        },
        projections: {
            embeddingText: 'built document embedding',
            lexicalText: 'builtprocessprobe',
            embeddingVersion: 'embedding_projection_v1',
            lexicalVersion: 'lexical_projection_v1',
        },
    }]);
    await database.finalizeCollectionForSearch(collectionName);
    await database.insertControl(collectionName, {
        id: 'built-control',
        kind: 'publication_probe',
        metadata: { owner: 'integration' },
    });

    const childScript = `
        const { LanceDbVectorDatabase } = require(${JSON.stringify(path.join(path.dirname(builtCorePath), "lancedb.js"))});
        (async () => {
            const database = new LanceDbVectorDatabase({ databasePath: process.env.SATORI_TEST_LANCEDB_PATH });
            const collection = process.env.SATORI_TEST_LANCEDB_COLLECTION;
            const lexical = await database.retrieveLexical(collection, { query: 'builtprocessprobe', limit: 5 });
            const control = await database.getControl(collection, 'built-control');
            await database.close();
            process.stdout.write(JSON.stringify({ ids: lexical.map((entry) => entry.document.id), control }));
        })().catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
    `;
    const child = await execFileAsync(process.execPath, ['--eval', childScript], {
        cwd: repositoryRoot,
        env: {
            ...process.env,
            SATORI_TEST_LANCEDB_PATH: databasePath,
            SATORI_TEST_LANCEDB_COLLECTION: collectionName,
        },
    });

    assert.deepEqual(JSON.parse(child.stdout), {
        ids: ['built-document'],
        control: {
            id: 'built-control',
            kind: 'publication_probe',
            metadata: { owner: 'integration' },
        },
    });
});

test('Core publishes and reopens a LanceDB-backed hybrid generation', async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-lancedb-context-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const repositoryPath = path.join(root, 'repo');
    const databasePath = path.join(root, 'database');
    fs.mkdirSync(repositoryPath, { recursive: true });
    fs.writeFileSync(
        path.join(repositoryPath, 'auth.ts'),
        'export function authenticate(token: string): boolean { return token.length > 0; }',
        'utf8',
    );
    const previousHybridMode = process.env.HYBRID_MODE;
    process.env.HYBRID_MODE = 'true';
    t.after(() => {
        if (previousHybridMode === undefined) delete process.env.HYBRID_MODE;
        else process.env.HYBRID_MODE = previousHybridMode;
    });

    const database = new LanceDbVectorDatabase({ databasePath });
    t.after(() => database.close());
    const context = new Context({
        embedding: new IntegrationEmbedding(),
        vectorDatabase: database,
        vectorStoreProvider: 'LanceDB',
        symbolRegistryStateRoot: path.join(root, 'navigation'),
        indexPolicyStateRoot: path.join(root, 'policy'),
    });

    const stats = await context.indexCodebase(repositoryPath, undefined, true);
    assert.ok(stats.totalChunks > 0);
    const collectionName = await context.getActiveIndexedCollectionName(repositoryPath);
    assert.ok(collectionName);
    const marker = await context.getIndexCompletionMarker(repositoryPath);
    assert.equal(marker?.fingerprint.vectorStoreProvider, 'LanceDB');

    const results = await context.semanticSearch({
        codebasePath: repositoryPath,
        query: 'authenticate auth token',
        topK: 5,
        retrievalMode: 'hybrid',
        scorePolicy: { kind: 'topk_only' },
    });
    assert.ok(results.some((result) => result.relativePath === 'auth.ts'));

    await database.close();
    const reopenedDatabase = new LanceDbVectorDatabase({ databasePath });
    t.after(() => reopenedDatabase.close());
    const reopenedContext = new Context({
        embedding: new IntegrationEmbedding(),
        vectorDatabase: reopenedDatabase,
        vectorStoreProvider: 'LanceDB',
        symbolRegistryStateRoot: path.join(root, 'navigation'),
        indexPolicyStateRoot: path.join(root, 'policy'),
    });
    assert.equal(
        await reopenedContext.getActiveIndexedCollectionName(repositoryPath),
        collectionName,
    );
});

test('LanceDB all-terms lexical retrieval excludes partial-term matches', async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-lancedb-conjunctive-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const repositoryPath = path.join(root, 'repo');
    const databasePath = path.join(root, 'database');
    fs.mkdirSync(repositoryPath, { recursive: true });
    // The all-token candidate carries each token exactly once; the single-token
    // files repeat their token heavily. Only conjunctive (all-terms) retrieval
    // must surface both.ts. This test proves genuine conjunctive semantics on
    // a real LanceDB index; outside-primary-pool recovery is covered by the
    // mocked must-lane MCP test, not by this integration test.
    fs.writeFileSync(path.join(repositoryPath, 'both.ts'), 'export const both = "alpha beta";\n', 'utf8');
    for (let index = 0; index < 4; index += 1) {
        fs.writeFileSync(
            path.join(repositoryPath, `alpha-${index}.ts`),
            `// ${'alpha '.repeat(40)}\nexport const a${index} = 1;\n`,
            'utf8',
        );
        fs.writeFileSync(
            path.join(repositoryPath, `beta-${index}.ts`),
            `// ${'beta '.repeat(40)}\nexport const b${index} = 1;\n`,
            'utf8',
        );
    }

    const previousHybridMode = process.env.HYBRID_MODE;
    process.env.HYBRID_MODE = 'true';
    t.after(() => {
        if (previousHybridMode === undefined) delete process.env.HYBRID_MODE;
        else process.env.HYBRID_MODE = previousHybridMode;
    });

    const database = new LanceDbVectorDatabase({ databasePath });
    t.after(() => database.close());
    const context = new Context({
        embedding: new IntegrationEmbedding(),
        vectorDatabase: database,
        vectorStoreProvider: 'LanceDB',
        symbolRegistryStateRoot: path.join(root, 'navigation'),
        indexPolicyStateRoot: path.join(root, 'policy'),
    });
    const stats = await context.indexCodebase(repositoryPath, undefined, true);
    assert.ok(stats.totalChunks > 0);

    const allTerms = await context.semanticSearch({
        codebasePath: repositoryPath,
        query: 'alpha beta',
        topK: 5,
        retrievalMode: 'lexical',
        lexicalMatchMode: 'all_terms',
        scorePolicy: { kind: 'topk_only' },
    });
    assert.ok(
        allTerms.some((result) => result.relativePath === 'both.ts'),
        'all-terms retrieval must surface the candidate containing every term',
    );

    const anyTerms = await context.semanticSearch({
        codebasePath: repositoryPath,
        query: 'alpha beta',
        topK: 50,
        retrievalMode: 'lexical',
        lexicalMatchMode: 'any_terms',
        scorePolicy: { kind: 'topk_only' },
    });
    assert.ok(
        anyTerms.some((result) => result.relativePath.startsWith('alpha-')),
        'any-terms retrieval must surface single-token candidates',
    );
    assert.ok(
        anyTerms.some((result) => result.relativePath.startsWith('beta-')),
        'any-terms retrieval must surface single-token candidates',
    );
    // Conjunctive contrast: any-terms returns documents that lack one of the
    // mandatory terms, while all-terms retrieval never does.
    const anyTermsMissingToken = anyTerms.filter((result) => {
        const content = result.content || '';
        const hasAlpha = /alpha/.test(content);
        const hasBeta = /beta/.test(content);
        return !(hasAlpha && hasBeta);
    });
    assert.ok(
        anyTermsMissingToken.length > 0,
        'any-terms must return documents missing at least one query term',
    );
    assert.ok(
        allTerms.every((result) => {
            const content = result.content || '';
            return /alpha/.test(content) && /beta/.test(content);
        }),
        'all-terms retrieval must return only documents containing every term',
    );
});
