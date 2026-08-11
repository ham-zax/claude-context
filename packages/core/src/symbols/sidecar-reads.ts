import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION,
    isRelationshipManifest,
    isSymbolRegistryManifest,
} from './contracts';
import { buildSymbolRegistry, computeSymbolRegistryManifestHash } from './registry';
import type {
    RelationshipManifest,
    RelationshipRecord,
    SymbolRecord,
    SymbolRegistryManifest,
    SymbolRegistryManifestFile,
} from './contracts';
import type { SymbolRegistry } from './registry';
import type { RelationshipAnalysisEvidence } from '../relationships';
import {
    NAVIGATION_GENERATION_SEAL_SCHEMA_VERSION,
    SYMBOL_INDEX_SCHEMA_VERSION,
    isCurrentGenerationPointer,
    isRecord,
    isRelationshipAnalysisEvidence,
    isRelationshipRecord,
    isSymbolIndexFile,
    isSymbolRecord,
    parseNavigationGenerationSeal,
} from './sidecar-validators';
import type {
    NavigationGenerationSeal,
    NavigationSymbolQualityAggregate,
    SymbolIndexFile,
} from './sidecar-validators';

// Sidecar layout constants shared by reads and the write lifecycle
export const NAVIGATION_DIR_NAME = 'navigation';
export const SYMBOLS_DIR_NAME = 'symbols';
export const RELATIONSHIPS_DIR_NAME = 'relationships';
export const SYMBOL_FILE_CONTRIBUTION_SCHEMA_VERSION = 'symbol_file_contribution_v1';
export const GENERATIONS_DIR_NAME = 'generations';
export const CURRENT_GENERATION_FILE_NAME = 'current.json';
export const NAVIGATION_GENERATION_SEAL_FILE_NAME = 'seal.json';

// Pointer/generation read errors
export class RetiredNavigationPointerError extends Error {}

export class UnsupportedNavigationPointerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsupportedNavigationPointerError';
    }
}

// Read boundary input/result contracts
export interface CurrentNavigationGeneration {
    generationId: string;
    generationRoot: string;
    symbolRegistryManifestHash: string;
    relationshipManifestHash: string;
    navigationSealHash: string;
}

export type ReadNavigationGenerationSealResult =
    | { status: 'ok'; rootPath: string; seal: NavigationGenerationSeal }
    | { status: 'missing' | 'incompatible' | 'corrupt'; rootPath: string; reason: string };

export interface ReadSymbolRegistrySidecarInput {
    normalizedRootPath: string;
    stateRoot?: string;
    generationId?: string;
}

export type ReadSymbolRegistrySidecarResult =
    | {
        status: 'ok';
        rootPath: string;
        manifestHash: string;
        registry: SymbolRegistry;
        warnings: string[];
    }
    | {
        status: 'missing' | 'incompatible' | 'corrupt';
        rootPath: string;
        reason: string;
        registry?: undefined;
        warnings?: undefined;
        manifestHash?: undefined;
    };

export interface ReadRelationshipSidecarInput {
    normalizedRootPath: string;
    expectedSymbolRegistryManifestHash: string;
    stateRoot?: string;
    generationId?: string;
}

export type ReadRelationshipSidecarResult =
    | {
        status: 'ok';
        rootPath: string;
        manifestHash: string;
        manifest: RelationshipManifest;
        records: RelationshipRecord[];
        analysisByFile: Map<string, RelationshipAnalysisEvidence>;
        warnings: string[];
        reason?: undefined;
    }
    | {
        status: 'missing' | 'incompatible' | 'corrupt';
        rootPath: string;
        reason: string;
        manifestHash?: undefined;
        manifest?: undefined;
        records?: undefined;
        analysisByFile?: undefined;
        warnings?: undefined;
    };

// Shared path and file helpers
export function compareStrings(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeRootPath(rootPath: string): string {
    const normalized = path.resolve(rootPath).replace(/\\/g, '/');
    return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function hashRootPath(rootPath: string): string {
    return crypto.createHash('md5').update(normalizeRootPath(rootPath), 'utf8').digest('hex');
}

function defaultStateRoot(): string {
    return process.env.SATORI_STATE_ROOT || path.join(os.homedir(), '.satori');
}

export function resolveNavigationSidecarRoot(stateRoot: string | undefined, normalizedRootPath: string): string {
    return path.join(stateRoot || defaultStateRoot(), NAVIGATION_DIR_NAME, hashRootPath(normalizedRootPath));
}

export function fileShardName(filePath: string, fileHash: string): string {
    const digest = crypto.createHash('sha256')
        .update(`${filePath}\0${fileHash}`, 'utf8')
        .digest('hex')
        .slice(0, 32);
    return `${digest}.json`;
}

// Shared serialization/hash helpers
export function serializeJson(value: unknown): string {
    return `${JSON.stringify(value, null, 2)}\n`;
}

export function hashSerializedJson(value: unknown): string {
    return crypto.createHash('sha256').update(serializeJson(value), 'utf8').digest('hex');
}

export function hashSerializedString(serialized: string): string {
    return crypto.createHash('sha256').update(serialized, 'utf8').digest('hex');
}

// Generation/seal digest helpers
export function computeNavigationSourceFilesDigest(
    files: readonly Pick<SymbolRegistryManifestFile, 'path' | 'hash'>[],
): string {
    return hashSerializedJson(
        files
            .map((file) => ({ path: file.path, hash: file.hash }))
            .sort((left, right) => compareStrings(left.path, right.path)),
    );
}

export function computeRelationshipManifestHash(manifest: RelationshipManifest): string {
    return hashSerializedJson(manifest);
}

export function computeNavigationGenerationSealHash(seal: NavigationGenerationSeal): string {
    return hashSerializedJson(seal);
}

export function buildNavigationSymbolQualityAggregate(registry: SymbolRegistry): NavigationSymbolQualityAggregate {
    const nonFileSymbolsByPath = new Map<string, number>();
    for (const symbol of registry.symbols) {
        if (symbol.kind !== 'file') {
            nonFileSymbolsByPath.set(symbol.file, (nonFileSymbolsByPath.get(symbol.file) ?? 0) + 1);
        }
    }
    const languageStats = new Map<string, NavigationSymbolQualityAggregate['languages'][number]>();
    for (const file of registry.manifest.files) {
        const language = file.language.trim().toLowerCase() || 'unknown';
        const stats = languageStats.get(language) ?? {
            language,
            indexedFiles: 0,
            filesWithNonFileSymbols: 0,
            nonFileSymbolCount: 0,
        };
        const nonFileSymbolCount = nonFileSymbolsByPath.get(file.path) ?? 0;
        stats.indexedFiles += 1;
        stats.filesWithNonFileSymbols += nonFileSymbolCount > 0 ? 1 : 0;
        stats.nonFileSymbolCount += nonFileSymbolCount;
        languageStats.set(language, stats);
    }
    return {
        indexedFileCount: registry.manifest.files.length,
        languages: [...languageStats.values()].sort((left, right) => compareStrings(left.language, right.language)),
    };
}

// Deterministic relationship record ordering
export function compareRelationshipRecords(a: RelationshipRecord, b: RelationshipRecord): number {
    if (a.file !== b.file) return compareStrings(a.file, b.file);
    if (a.type !== b.type) return compareStrings(a.type, b.type);
    if (a.sourceKey !== b.sourceKey) return compareStrings(a.sourceKey, b.sourceKey);
    const aTarget = a.targetKey || a.targetInstanceId || a.targetPath || '';
    const bTarget = b.targetKey || b.targetInstanceId || b.targetPath || '';
    if (aTarget !== bTarget) return compareStrings(aTarget, bTarget);
    const aLine = a.span?.startLine ?? 0;
    const bLine = b.span?.startLine ?? 0;
    if (aLine !== bLine) return aLine - bLine;
    return compareStrings(a.sourceInstanceId || '', b.sourceInstanceId || '');
}

// Generation pointer resolution
export async function resolveCurrentNavigationGeneration(
    stateRoot: string | undefined,
    normalizedRootPath: string,
): Promise<CurrentNavigationGeneration | null> {
    const rootPath = resolveNavigationSidecarRoot(stateRoot, normalizedRootPath);
    const pointerPath = path.join(rootPath, CURRENT_GENERATION_FILE_NAME);
    let rawPointer: unknown;
    try {
        rawPointer = await readJson(pointerPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
    if (!isCurrentGenerationPointer(rawPointer)) {
        if (
            isRecord(rawPointer)
            && (rawPointer.schemaVersion === 'navigation_current_v1'
                || rawPointer.schemaVersion === 'navigation_current_v2')
        ) {
            throw new RetiredNavigationPointerError(
                `retired ${rawPointer.schemaVersion} pointer requires reindex`,
            );
        }
        const pointerSchemaVersion = isRecord(rawPointer)
            && typeof rawPointer.schemaVersion === 'string'
            ? rawPointer.schemaVersion
            : null;
        const futureVersion = pointerSchemaVersion
            ? /^navigation_current_v([1-9]\d*)$/.exec(pointerSchemaVersion)
            : null;
        if (futureVersion && Number(futureVersion[1]) > 3) {
            throw new UnsupportedNavigationPointerError(
                `unsupported ${pointerSchemaVersion} pointer requires a newer runtime`,
            );
        }
        throw new Error('navigation current-generation pointer is invalid or incompatible');
    }
    const generationsRoot = path.join(rootPath, GENERATIONS_DIR_NAME);
    const generationRoot = path.resolve(generationsRoot, rawPointer.generationId);
    const relative = path.relative(generationsRoot, generationRoot);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('navigation current-generation pointer escapes the generations root');
    }
    await fs.promises.access(generationRoot, fs.constants.R_OK);
    return {
        generationId: rawPointer.generationId,
        generationRoot,
        symbolRegistryManifestHash: rawPointer.symbolRegistryManifestHash,
        relationshipManifestHash: rawPointer.relationshipManifestHash,
        navigationSealHash: rawPointer.navigationSealHash,
    };
}

export async function resolveNavigationGeneration(
    stateRoot: string | undefined,
    normalizedRootPath: string,
    generationId: string,
): Promise<CurrentNavigationGeneration> {
    if (!/^[a-zA-Z0-9_-]+$/.test(generationId)) {
        throw new Error('navigation generation id is invalid');
    }
    const rootPath = resolveNavigationSidecarRoot(stateRoot, normalizedRootPath);
    const generationsRoot = path.join(rootPath, GENERATIONS_DIR_NAME);
    const generationRoot = path.resolve(generationsRoot, generationId);
    const relative = path.relative(generationsRoot, generationRoot);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('navigation generation escapes the generations root');
    }
    const rawSeal = await readJson(path.join(generationRoot, NAVIGATION_GENERATION_SEAL_FILE_NAME));
    const seal = parseNavigationGenerationSeal(rawSeal);
    if (!seal || seal.generationId !== generationId) {
        throw new Error('navigation generation seal is invalid or incompatible');
    }
    return {
        generationId,
        generationRoot,
        symbolRegistryManifestHash: seal.symbolRegistryManifestHash,
        relationshipManifestHash: seal.relationshipManifestHash,
        navigationSealHash: computeNavigationGenerationSealHash(seal),
    };
}

async function resolveReadableNavigationRoot(
    stateRoot: string | undefined,
    normalizedRootPath: string,
    generationId?: string,
): Promise<{ rootPath: string; readableRoot: string; generation: CurrentNavigationGeneration | null }> {
    const rootPath = resolveNavigationSidecarRoot(stateRoot, normalizedRootPath);
    const generation = generationId
        ? await resolveNavigationGeneration(stateRoot, normalizedRootPath, generationId)
        : await resolveCurrentNavigationGeneration(stateRoot, normalizedRootPath);
    return { rootPath, readableRoot: generation?.generationRoot || rootPath, generation };
}

// Navigation generation seal read and artifact verification
export async function readNavigationGenerationSeal(
    stateRoot: string | undefined,
    normalizedRootPath: string,
    generationId?: string,
): Promise<ReadNavigationGenerationSealResult> {
    const rootPath = resolveNavigationSidecarRoot(stateRoot, normalizedRootPath);
    let generation: CurrentNavigationGeneration | null;
    try {
        generation = generationId
            ? await resolveNavigationGeneration(stateRoot, normalizedRootPath, generationId)
            : await resolveCurrentNavigationGeneration(stateRoot, normalizedRootPath);
    } catch (error) {
        return {
            status: error instanceof RetiredNavigationPointerError
                || error instanceof UnsupportedNavigationPointerError
                ? 'incompatible'
                : 'corrupt',
            rootPath,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
    if (!generation) return { status: 'missing', rootPath, reason: 'navigation generation pointer is missing' };
    let value: unknown;
    try {
        value = await readJson(path.join(generation.generationRoot, NAVIGATION_GENERATION_SEAL_FILE_NAME));
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? { status: 'missing', rootPath, reason: 'navigation generation seal is missing' }
            : { status: 'corrupt', rootPath, reason: error instanceof Error ? error.message : String(error) };
    }
    const seal = parseNavigationGenerationSeal(value);
    if (!seal) {
        return { status: 'corrupt', rootPath, reason: 'navigation generation seal is invalid' };
    }
    if (
        seal.generationId !== generation.generationId
        || seal.symbolRegistryManifestHash !== generation.symbolRegistryManifestHash
        || seal.relationshipManifestHash !== generation.relationshipManifestHash
        || computeNavigationGenerationSealHash(seal) !== generation.navigationSealHash
    ) {
        return { status: 'incompatible', rootPath, reason: 'navigation generation seal does not match current pointer' };
    }
    return { status: 'ok', rootPath, seal };
}

export async function verifyNavigationGenerationSealArtifacts(input: {
    stateRoot?: string;
    normalizedRootPath: string;
    generationId?: string;
    registry: SymbolRegistry;
    relationshipManifest: RelationshipManifest;
}): Promise<ReadNavigationGenerationSealResult> {
    const sealRead = await readNavigationGenerationSeal(
        input.stateRoot,
        input.normalizedRootPath,
        input.generationId,
    );
    if (sealRead.status !== 'ok') return sealRead;
    const generation = input.generationId
        ? await resolveNavigationGeneration(input.stateRoot, input.normalizedRootPath, input.generationId)
        : await resolveCurrentNavigationGeneration(input.stateRoot, input.normalizedRootPath);
    if (!generation) {
        return { status: 'missing', rootPath: sealRead.rootPath, reason: 'navigation generation pointer is missing' };
    }
    let symbolIndex: unknown;
    try {
        symbolIndex = await readJson(path.join(generation.generationRoot, SYMBOLS_DIR_NAME, 'index.json'));
    } catch (error) {
        return { status: 'corrupt', rootPath: sealRead.rootPath, reason: error instanceof Error ? error.message : String(error) };
    }
    if (!isSymbolIndexFile(symbolIndex) || !isRelationshipManifest(input.relationshipManifest)) {
        return { status: 'corrupt', rootPath: sealRead.rootPath, reason: 'navigation artifact manifests are invalid' };
    }
    const artifactSet = [
        ...symbolIndex.files.map((file) => ({ path: file.shardPath, hash: file.shardHash })),
        ...input.relationshipManifest.files.map((file) => ({ path: file.shardPath, hash: file.shardHash })),
    ].sort((left, right) => compareStrings(left.path, right.path));
    const expectedSeal: NavigationGenerationSeal = {
        schemaVersion: NAVIGATION_GENERATION_SEAL_SCHEMA_VERSION,
        generationId: generation.generationId,
        symbolRegistryManifestHash: generation.symbolRegistryManifestHash,
        relationshipManifestHash: generation.relationshipManifestHash,
        artifactSetHash: hashSerializedJson(artifactSet),
        symbolQuality: buildNavigationSymbolQualityAggregate(input.registry),
    };
    if (computeNavigationGenerationSealHash(expectedSeal) !== computeNavigationGenerationSealHash(sealRead.seal)) {
        return { status: 'incompatible', rootPath: sealRead.rootPath, reason: 'navigation generation seal does not match validated artifacts' };
    }
    return sealRead;
}

// Symbol registry reads
export function buildSymbolIndex(
    manifest: SymbolRegistryManifest,
    manifestHash: string,
    shardHashes: ReadonlyMap<string, string>,
): SymbolIndexFile {
    return {
        schemaVersion: SYMBOL_INDEX_SCHEMA_VERSION,
        manifestHash,
        files: [...manifest.files]
            .map((file) => ({
                path: file.path,
                hash: file.hash,
                language: file.language,
                symbolCount: file.symbolCount,
                definitionStatus: file.definitionStatus,
                shardPath: path.posix.join(SYMBOLS_DIR_NAME, 'by-file', fileShardName(file.path, file.hash)),
                shardHash: shardHashes.get(file.path) ?? '',
            }))
            .sort((a, b) => compareStrings(a.path, b.path)),
    };
}

function symbolIndexMatchesManifest(
    indexFile: SymbolIndexFile,
    manifest: SymbolRegistryManifest,
    manifestHash: string,
): boolean {
    const expected = buildSymbolIndex(
        manifest,
        manifestHash,
        new Map(indexFile.files.map((file) => [file.path, file.shardHash])),
    );
    if (
        indexFile.manifestHash !== expected.manifestHash
        || indexFile.files.length !== expected.files.length
    ) {
        return false;
    }
    return expected.files.every((file, index) => {
        const actual = indexFile.files[index];
        return actual?.path === file.path
            && actual.hash === file.hash
            && actual.language === file.language
            && actual.symbolCount === file.symbolCount
            && actual.definitionStatus === file.definitionStatus
            && actual.shardPath === file.shardPath;
    });
}

export async function readJson(filePath: string): Promise<unknown> {
    return JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
}

export async function readSymbolRegistrySidecar(input: ReadSymbolRegistrySidecarInput): Promise<ReadSymbolRegistrySidecarResult> {
    const rootPath = resolveNavigationSidecarRoot(input.stateRoot, input.normalizedRootPath);
    let readableRoot: string;
    let generation: CurrentNavigationGeneration | null;
    try {
        ({ readableRoot, generation } = await resolveReadableNavigationRoot(
            input.stateRoot,
            input.normalizedRootPath,
            input.generationId,
        ));
    } catch (error) {
        return {
            status: 'incompatible',
            rootPath,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
    const manifestPath = path.join(readableRoot, 'manifest.json');
    const indexPath = path.join(readableRoot, SYMBOLS_DIR_NAME, 'index.json');

    try {
        await fs.promises.access(manifestPath, fs.constants.R_OK);
    } catch {
        return {
            status: 'missing',
            rootPath,
            reason: 'symbol registry manifest is missing',
        };
    }

    let manifest: SymbolRegistryManifest;
    let indexFile: SymbolIndexFile;
    try {
        const rawManifest = await readJson(manifestPath);
        if (!isSymbolRegistryManifest(rawManifest)) {
            return {
                status: isRecord(rawManifest) && typeof rawManifest.schemaVersion === 'string'
                    ? 'incompatible'
                    : 'corrupt',
                rootPath,
                reason: 'symbol registry manifest is invalid or incompatible',
            };
        }
        manifest = rawManifest;

        const rawIndex = await readJson(indexPath);
        if (!isSymbolIndexFile(rawIndex)) {
            return {
                status: 'corrupt',
                rootPath,
                reason: 'symbol registry index is invalid or incompatible',
            };
        }
        indexFile = rawIndex;
    } catch (error) {
        return {
            status: error instanceof SyntaxError ? 'corrupt' : 'incompatible',
            rootPath,
            reason: error instanceof Error ? error.message : String(error),
        };
    }

    const manifestHash = computeSymbolRegistryManifestHash(manifest);
    if (generation && generation.symbolRegistryManifestHash !== manifestHash) {
        return {
            status: 'incompatible',
            rootPath,
            reason: 'navigation generation pointer hash does not match symbol registry manifest',
        };
    }
    if (normalizeRootPath(manifest.normalizedRootPath) !== normalizeRootPath(input.normalizedRootPath)) {
        return {
            status: 'incompatible',
            rootPath,
            reason: 'symbol registry manifest root does not match requested codebase root',
        };
    }
    if (!symbolIndexMatchesManifest(indexFile, manifest, manifestHash)) {
        return {
            status: 'incompatible',
            rootPath,
            reason: 'symbol registry index does not exactly match the manifest and deterministic shard layout',
        };
    }

    try {
        const expectedShardNames = indexFile.files
            .map((file) => path.basename(file.shardPath))
            .sort(compareStrings);
        const actualShardNames = (await fs.promises.readdir(path.join(readableRoot, SYMBOLS_DIR_NAME, 'by-file'), { withFileTypes: true }))
            .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
            .map((entry) => entry.name)
            .sort(compareStrings);
        if (
            actualShardNames.length !== expectedShardNames.length
            || actualShardNames.some((name, index) => name !== expectedShardNames[index])
        ) {
            return {
                status: 'incompatible',
                rootPath,
                reason: 'symbol registry shard set does not exactly match the manifest index',
            };
        }
        const symbols: SymbolRecord[] = [];
        for (const file of indexFile.files) {
            const shardPath = path.join(readableRoot, file.shardPath);
            const serializedShard = await fs.promises.readFile(shardPath, 'utf8');
            if (crypto.createHash('sha256').update(serializedShard, 'utf8').digest('hex') !== file.shardHash) {
                return {
                    status: 'incompatible',
                    rootPath,
                    reason: `symbol registry shard hash does not match index for ${file.path}`,
                };
            }
            const shard = JSON.parse(serializedShard) as {
                schemaVersion?: unknown;
                manifestHash?: unknown;
                path?: unknown;
                hash?: unknown;
                language?: unknown;
                symbols?: unknown;
            };
            const shardSymbols = shard.symbols;
            const contributionIdentityValid = indexFile.schemaVersion === SYMBOL_INDEX_SCHEMA_VERSION
                ? shard.schemaVersion === SYMBOL_FILE_CONTRIBUTION_SCHEMA_VERSION
                : shard.manifestHash === manifestHash;
            if (
                !contributionIdentityValid
                || shard.path !== file.path
                || shard.hash !== file.hash
                || shard.language !== file.language
                || !Array.isArray(shardSymbols)
            ) {
                return {
                    status: 'incompatible',
                    rootPath,
                    reason: `symbol registry shard is invalid for ${file.path}`,
                };
            }
            if (shardSymbols.length !== file.symbolCount) {
                return {
                    status: 'incompatible',
                    rootPath,
                    reason: `symbol registry shard symbol count does not match manifest for ${file.path}`,
                };
            }
            if (!shardSymbols.every((symbol) =>
                isSymbolRecord(symbol)
                && symbol.file === file.path
                && symbol.fileHash === file.hash
                && symbol.language === file.language
            )) {
                return {
                    status: 'incompatible',
                    rootPath,
                    reason: `symbol registry shard record is invalid for ${file.path}`,
                };
            }
            symbols.push(...(shardSymbols as SymbolRecord[]));
        }
        const registry = buildSymbolRegistry({ manifest, symbols });
        return {
            status: 'ok',
            rootPath,
            manifestHash,
            registry,
            warnings: registry.warnings,
        };
    } catch (error) {
        return {
            status: error instanceof SyntaxError ? 'corrupt' : 'incompatible',
            rootPath,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
}

// Relationship reads
export async function readRelationshipSidecar(input: ReadRelationshipSidecarInput): Promise<ReadRelationshipSidecarResult> {
    const rootPath = resolveNavigationSidecarRoot(input.stateRoot, input.normalizedRootPath);
    let readableRoot: string;
    let generation: CurrentNavigationGeneration | null;
    try {
        ({ readableRoot, generation } = await resolveReadableNavigationRoot(
            input.stateRoot,
            input.normalizedRootPath,
            input.generationId,
        ));
    } catch (error) {
        return {
            status: 'incompatible',
            rootPath,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
    const relationshipsRoot = path.join(readableRoot, RELATIONSHIPS_DIR_NAME);
    const manifestPath = path.join(relationshipsRoot, 'manifest.json');
    const byFileDir = path.join(relationshipsRoot, 'by-file');

    try {
        await fs.promises.access(manifestPath, fs.constants.R_OK);
    } catch {
        return {
            status: 'missing',
            rootPath,
            reason: 'relationship manifest is missing',
        };
    }

    let manifest: RelationshipManifest;
    let manifestHash: string;
    try {
        const serializedManifest = await fs.promises.readFile(manifestPath, 'utf8');
        const rawManifest = JSON.parse(serializedManifest) as unknown;
        manifestHash = crypto.createHash('sha256').update(serializedManifest, 'utf8').digest('hex');
        if (
            generation
            && manifestHash !== generation.relationshipManifestHash
        ) {
            return {
                status: 'incompatible',
                rootPath,
                reason: 'navigation generation pointer hash does not match relationship manifest',
            };
        }
        if (!isRelationshipManifest(rawManifest)) {
            return {
                status: isRecord(rawManifest) && typeof rawManifest.schemaVersion === 'string'
                    ? 'incompatible'
                    : 'corrupt',
                rootPath,
                reason: 'relationship manifest is invalid or incompatible',
            };
        }
        manifest = rawManifest;
    } catch (error) {
        return {
            status: error instanceof SyntaxError ? 'corrupt' : 'incompatible',
            rootPath,
            reason: error instanceof Error ? error.message : String(error),
        };
    }

    if (manifest.symbolRegistryManifestHash !== input.expectedSymbolRegistryManifestHash) {
        return {
            status: 'incompatible',
            rootPath,
            reason: 'relationship manifest hash does not match symbol registry manifest hash',
        };
    }

    const records: RelationshipRecord[] = [];
    const analysisByFile = new Map<string, RelationshipAnalysisEvidence>();
    const warnings: string[] = [];
    try {
        const expectedShardNames = manifest.files.map((file) => path.basename(file.shardPath)).sort(compareStrings);
        const actualShardNames = (await fs.promises.readdir(byFileDir, { withFileTypes: true }))
            .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
            .map((entry) => entry.name)
            .sort(compareStrings);
        if (
            actualShardNames.length !== expectedShardNames.length
            || actualShardNames.some((name, index) => name !== expectedShardNames[index])
        ) {
            return {
                status: 'incompatible',
                rootPath,
                reason: 'relationship shard set does not exactly match the relationship manifest',
            };
        }
        for (const file of manifest.files) {
            const expectedShardPath = path.posix.join(
                RELATIONSHIPS_DIR_NAME,
                'by-file',
                fileShardName(file.path, file.hash),
            );
            if (file.shardPath !== expectedShardPath) {
                return {
                    status: 'incompatible',
                    rootPath,
                    reason: `relationship manifest has a non-deterministic shard path for ${file.path}`,
                };
            }
            const shardPath = path.join(readableRoot, file.shardPath);
            const rawText = await fs.promises.readFile(shardPath, 'utf8');
            const actualShardHash = crypto.createHash('sha256').update(rawText, 'utf8').digest('hex');
            const rawShard = JSON.parse(rawText) as unknown;
            if (typeof rawShard !== 'object' || rawShard === null || Array.isArray(rawShard)) {
                return {
                    status: 'incompatible',
                    rootPath,
                    reason: `relationship shard is invalid for ${file.path}`,
                };
            }
            const shard = rawShard as {
                schemaVersion?: unknown;
                manifestHash?: unknown;
                path?: unknown;
                hash?: unknown;
                relationships?: unknown;
                records?: unknown;
                analysisEvidence?: unknown;
            };
            const contributionIdentityValid = manifest.fileContributionSchemaVersion
                === RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION
                ? shard.schemaVersion === RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION
                : shard.manifestHash === input.expectedSymbolRegistryManifestHash;
            if (!contributionIdentityValid) {
                return {
                    status: 'incompatible',
                    rootPath,
                    reason: `relationship shard contribution identity does not match manifest for ${file.path}`,
                };
            }
            if (shard.path !== file.path || shard.hash !== file.hash) {
                return {
                    status: 'incompatible',
                    rootPath,
                    reason: `relationship shard metadata is invalid for ${file.path}`,
                };
            }
            const shardRecords = Array.isArray(shard.relationships) ? shard.relationships : shard.records;
            if (!Array.isArray(shardRecords) || shardRecords.length !== file.relationshipCount) {
                return {
                    status: 'incompatible',
                    rootPath,
                    reason: `relationship shard record count is invalid for ${file.path}`,
                };
            }
            for (const record of shardRecords) {
                if (!isRelationshipRecord(record) || record.file !== shard.path) {
                    return {
                        status: 'incompatible',
                        rootPath,
                        reason: `relationship shard record is invalid for ${file.path}`,
                    };
                }
                records.push(record);
            }
            if ((shard.analysisEvidence !== undefined) !== file.analysisEvidencePresent) {
                return {
                    status: 'incompatible',
                    rootPath,
                    reason: `relationship analysis evidence presence does not match manifest for ${file.path}`,
                };
            }
            if (shard.analysisEvidence !== undefined) {
                if (!isRelationshipAnalysisEvidence(shard.analysisEvidence)) {
                    return {
                        status: 'incompatible',
                        rootPath,
                        reason: `relationship analysis evidence is invalid for ${file.path}`,
                    };
                }
                if ((shard.analysisEvidence.resolutionClaims ?? []).some((claim) => claim.sourceFile !== shard.path)) {
                    return {
                        status: 'incompatible',
                        rootPath,
                        reason: `relationship resolution claim source does not match ${file.path}`,
                    };
                }
                analysisByFile.set(shard.path, shard.analysisEvidence);
            }
            if (actualShardHash !== file.shardHash) {
                return {
                    status: 'incompatible',
                    rootPath,
                    reason: `relationship shard content hash does not match manifest for ${file.path}`,
                };
            }
        }
    } catch (error) {
        return {
            status: error instanceof SyntaxError ? 'corrupt' : 'incompatible',
            rootPath,
            reason: error instanceof Error ? error.message : String(error),
        };
    }

    return {
        status: 'ok',
        rootPath,
        manifestHash,
        manifest,
        records: records.sort(compareRelationshipRecords),
        analysisByFile,
        warnings: [...new Set(warnings)].sort(compareStrings),
    };
}
