import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION,
    RELATIONSHIP_MANIFEST_SCHEMA_VERSION,
    SYMBOL_REGISTRY_SCHEMA_VERSION,
} from './contracts';
import {
    RetiredNavigationPointerError,
    UnsupportedNavigationPointerError,
    computeNavigationGenerationSealHash,
    readNavigationGenerationSeal,
    readRelationshipSidecar,
    readSymbolRegistrySidecar,
    resolveCurrentNavigationGeneration,
    resolveNavigationGeneration,
    resolveNavigationSidecarRoot,
} from './sidecar-reads';

const NORMALIZED_ROOT = '/repo';

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'satori-sidecar-reads-'));
    try {
        await fn(dir);
    } finally {
        await fs.promises.rm(dir, { recursive: true, force: true });
    }
}

function writeJson(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function symbolRegistryManifest(normalizedRootPath = NORMALIZED_ROOT) {
    return {
        schemaVersion: SYMBOL_REGISTRY_SCHEMA_VERSION,
        normalizedRootPath,
        rootFingerprint: 'root-fingerprint',
        indexPolicyHash: 'policy-hash',
        languageRouterVersion: 'router-v1',
        extractorVersion: 'extractor-v1',
        relationshipVersion: 'relationship-v1',
        builtAt: '2026-06-17T00:00:00.000Z',
        files: [],
    };
}

function relationshipManifest(symbolRegistryManifestHash: string) {
    return {
        schemaVersion: RELATIONSHIP_MANIFEST_SCHEMA_VERSION,
        fileContributionSchemaVersion: RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION,
        symbolRegistryManifestHash,
        relationshipVersion: 'relationship-v1',
        builtAt: '2026-06-17T00:00:00.000Z',
        files: [],
    };
}

test('sidecar read boundary resolves generation pointers with exact statuses', async () => {
    await withTempDir(async (stateRoot) => {
        const rootPath = resolveNavigationSidecarRoot(stateRoot, NORMALIZED_ROOT);

        assert.equal(await resolveCurrentNavigationGeneration(stateRoot, NORMALIZED_ROOT), null);
        assert.deepEqual(
            await readNavigationGenerationSeal(stateRoot, NORMALIZED_ROOT),
            { status: 'missing', rootPath, reason: 'navigation generation pointer is missing' },
        );

        writeJson(path.join(rootPath, 'current.json'), {
            schemaVersion: 'navigation_current_v1',
            generationId: 'g1',
        });
        await assert.rejects(
            () => resolveCurrentNavigationGeneration(stateRoot, NORMALIZED_ROOT),
            RetiredNavigationPointerError,
        );
        const retired = await readNavigationGenerationSeal(stateRoot, NORMALIZED_ROOT);
        assert.equal(retired.status, 'incompatible');
        assert.match(retired.reason, /retired navigation_current_v1 pointer requires reindex/i);

        writeJson(path.join(rootPath, 'current.json'), {
            schemaVersion: 'navigation_current_v4',
            generationId: 'g1',
        });
        await assert.rejects(
            () => resolveCurrentNavigationGeneration(stateRoot, NORMALIZED_ROOT),
            UnsupportedNavigationPointerError,
        );
        const future = await readNavigationGenerationSeal(stateRoot, NORMALIZED_ROOT);
        assert.equal(future.status, 'incompatible');
        assert.match(future.reason, /unsupported navigation_current_v4 pointer requires a newer runtime/i);

        await assert.rejects(
            () => resolveNavigationGeneration(stateRoot, NORMALIZED_ROOT, '../escape'),
            /navigation generation id is invalid/,
        );
        const missingGeneration = await readNavigationGenerationSeal(stateRoot, NORMALIZED_ROOT, 'unknown-generation');
        assert.equal(missingGeneration.status, 'corrupt');
    });
});

test('readNavigationGenerationSeal rejects a seal that does not match the current pointer', async () => {
    await withTempDir(async (stateRoot) => {
        const rootPath = resolveNavigationSidecarRoot(stateRoot, NORMALIZED_ROOT);
        const seal = {
            schemaVersion: 'navigation_generation_seal_v1' as const,
            generationId: 'g2',
            symbolRegistryManifestHash: 'symmanifest_' + 'a'.repeat(32),
            relationshipManifestHash: 'b'.repeat(64),
            artifactSetHash: 'c'.repeat(64),
            symbolQuality: { indexedFileCount: 0, languages: [] },
        };
        writeJson(path.join(rootPath, 'generations', 'g1', 'seal.json'), seal);
        writeJson(path.join(rootPath, 'current.json'), {
            schemaVersion: 'navigation_current_v3',
            generationId: 'g1',
            symbolRegistryManifestHash: seal.symbolRegistryManifestHash,
            relationshipManifestHash: seal.relationshipManifestHash,
            navigationSealHash: computeNavigationGenerationSealHash(seal),
        });

        const result = await readNavigationGenerationSeal(stateRoot, NORMALIZED_ROOT);
        assert.equal(result.status, 'incompatible');
        assert.equal(result.reason, 'navigation generation seal does not match current pointer');
    });
});

test('readSymbolRegistrySidecar classifies corrupt and index-incomplete registry states', async () => {
    await withTempDir(async (stateRoot) => {
        const rootPath = resolveNavigationSidecarRoot(stateRoot, NORMALIZED_ROOT);
        fs.mkdirSync(rootPath, { recursive: true });

        writeJson(path.join(rootPath, 'manifest.json'), '{not json');
        const corrupt = await readSymbolRegistrySidecar({ stateRoot, normalizedRootPath: NORMALIZED_ROOT });
        assert.equal(corrupt.status, 'corrupt');

        writeJson(path.join(rootPath, 'manifest.json'), symbolRegistryManifest());
        const noIndex = await readSymbolRegistrySidecar({ stateRoot, normalizedRootPath: NORMALIZED_ROOT });
        assert.equal(noIndex.status, 'incompatible');
        assert.match(noIndex.reason, /index\.json/);
    });
});

test('readRelationshipSidecar classifies relationship states', async () => {
    await withTempDir(async (stateRoot) => {
        const rootPath = resolveNavigationSidecarRoot(stateRoot, NORMALIZED_ROOT);
        fs.mkdirSync(path.join(rootPath, 'relationships'), { recursive: true });

        const missing = await readRelationshipSidecar({
            stateRoot,
            normalizedRootPath: NORMALIZED_ROOT,
            expectedSymbolRegistryManifestHash: 'symmanifest_' + 'a'.repeat(32),
        });
        assert.equal(missing.status, 'missing');
        assert.equal(missing.reason, 'relationship manifest is missing');

        writeJson(path.join(rootPath, 'relationships', 'manifest.json'), '{not json');
        const corrupt = await readRelationshipSidecar({
            stateRoot,
            normalizedRootPath: NORMALIZED_ROOT,
            expectedSymbolRegistryManifestHash: 'symmanifest_' + 'a'.repeat(32),
        });
        assert.equal(corrupt.status, 'corrupt');

        writeJson(
            path.join(rootPath, 'relationships', 'manifest.json'),
            relationshipManifest('symmanifest_' + 'b'.repeat(32)),
        );
        const mismatch = await readRelationshipSidecar({
            stateRoot,
            normalizedRootPath: NORMALIZED_ROOT,
            expectedSymbolRegistryManifestHash: 'symmanifest_' + 'a'.repeat(32),
        });
        assert.equal(mismatch.status, 'incompatible');
        assert.match(mismatch.reason, /relationship manifest hash does not match symbol registry manifest hash/);
    });
});
