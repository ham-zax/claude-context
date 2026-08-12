import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
    RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION,
    isRelationshipManifest,
} from './contracts';
import type { RelationshipRecord } from './contracts';
import { isRepositoryRelativePath } from '../paths/repository-path';
import type { SymbolRegistry } from './registry';
import type { RelationshipAnalysisEvidence } from '../relationships';
import {
    CURRENT_GENERATION_SCHEMA_VERSION,
    NAVIGATION_GENERATION_SEAL_SCHEMA_VERSION,
    SYMBOL_INDEX_SCHEMA_VERSION,
    isSymbolIndexFile,
    parseNavigationGenerationSeal,
} from './sidecar-validators';
import type {
    NavigationGenerationSeal,
} from './sidecar-validators';
import {
    CURRENT_GENERATION_FILE_NAME,
    GENERATIONS_DIR_NAME,
    NAVIGATION_GENERATION_SEAL_FILE_NAME,
    RELATIONSHIPS_DIR_NAME,
    SYMBOLS_DIR_NAME,
    buildNavigationSymbolQualityAggregate,
    compareStrings,
    computeNavigationGenerationSealHash,
    computeNavigationSourceFilesDigest,
    hashSerializedJson,
    readJson,
    resolveCurrentNavigationGeneration,
    resolveNavigationGeneration,
    resolveNavigationSidecarRoot,
    serializeJson,
} from './sidecar-reads';
import type { WriteSymbolRegistrySidecarResult } from './sidecar-writes';
import {
    BACKUP_ENTRY_PREFIX,
    SHARD_IO_CONCURRENCY,
    TEMP_ENTRY_PREFIX,
    fsyncPath,
    getRelationshipAnalysisEvidence,
    samePathIdentity,
    uniqueSidecarEntryName,
    writeJson,
    writeRelationshipSidecarInternal,
    writeSymbolRegistrySidecarInternal,
} from './sidecar-writes';
import type {
    RelationshipShardReuse,
    SymbolShardReuse,
} from './sidecar-writes';

const CLEANUP_ENTRY_PREFIX = '.satori-cleanup-';
export class NavigationSidecarStagingCleanupError extends Error {
    readonly cleanupStatus = 'unresolved' as const;

    constructor(
        readonly cleanupPath: string,
        readonly stagingCause: unknown,
        readonly cleanupCause: unknown,
    ) {
        super(
            `Navigation sidecar staging failed and cleanup is unresolved for '${cleanupPath}': ${
                cleanupCause instanceof Error ? cleanupCause.message : String(cleanupCause)
            }`,
        );
        this.name = 'NavigationSidecarStagingCleanupError';
    }
}

class NavigationSidecarCleanupFailure extends Error {
    constructor(
        readonly cleanupPath: string,
        readonly cleanupCause: unknown,
    ) {
        super(
            `Navigation sidecar cleanup failed for '${cleanupPath}': ${
                cleanupCause instanceof Error ? cleanupCause.message : String(cleanupCause)
            }`,
        );
        this.name = 'NavigationSidecarCleanupFailure';
    }
}

export interface ClearSymbolRegistrySidecarInput {
    normalizedRootPath: string;
    stateRoot?: string;
    beforeDelete?: () => void;
    publishMutation?: (publish: () => void) => void;
}

export interface WriteNavigationSidecarGenerationInput {
    registry: SymbolRegistry;
    records: RelationshipRecord[];
    analysisByFile: Map<string, RelationshipAnalysisEvidence> | Record<string, RelationshipAnalysisEvidence>;
    stateRoot?: string;
    beforePublish?: () => void;
    publishMutation?: (publish: () => void) => void;
    deltaReuse?: {
        baseGenerationId: string;
        symbolFilesToRewrite: readonly string[];
        relationshipFilesToRewrite: readonly string[];
    };
}

export interface WriteNavigationSidecarGenerationResult extends WriteSymbolRegistrySidecarResult {
    generationId: string;
    relationshipCount: number;
    relationshipFileShardCount: number;
}

export interface StagedNavigationSidecarGeneration extends WriteNavigationSidecarGenerationResult {
    normalizedRootPath: string;
    relationshipManifestHash: string;
    navigationSealHash: string;
    sourceFileCount: number;
    sourceFilesDigest: string;
    physical: {
        logicalBytes: number;
        physicallyWrittenBytes: number;
        sharedFiles: number;
        writtenFiles: number;
    };
}

export type NavigationGenerationPointerCandidate = Pick<
    StagedNavigationSidecarGeneration,
    'rootPath' | 'normalizedRootPath' | 'generationId' | 'manifestHash' | 'relationshipManifestHash' | 'navigationSealHash'
>;

async function confirmPathAbsent(targetPath: string): Promise<void> {
    try {
        await fs.promises.lstat(targetPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
    }
    throw new Error(`Staged navigation artifact still exists after cleanup: ${targetPath}`);
}

async function restoreDetachedNavigationGeneration(input: {
    generationRoot: string;
    cleanupPath: string;
    detachedStat: fs.Stats;
}): Promise<void> {
    try {
        await fs.promises.lstat(input.generationRoot);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await fs.promises.rename(input.cleanupPath, input.generationRoot);
        const restoredStat = await fs.promises.lstat(input.generationRoot);
        if (!samePathIdentity(input.detachedStat, restoredStat)) {
            throw new Error(`detached navigation artifact identity changed while restoring ${input.generationRoot}`);
        }
        await fsyncPath(path.dirname(input.generationRoot));
        return;
    }
    throw new Error(`cannot restore detached navigation artifact because ${input.generationRoot} is occupied`);
}

async function cleanupStagedNavigationGeneration(input: {
    generationRoot: string;
    generationId: string;
    generationStat?: fs.Stats;
    navigationSealHash?: string;
}): Promise<void> {
    if (!input.generationStat || !input.navigationSealHash) {
        throw new Error('staged navigation generation identity was not fully established');
    }

    const cleanupPath = path.join(
        path.dirname(input.generationRoot),
        uniqueSidecarEntryName(CLEANUP_ENTRY_PREFIX),
    );
    let detached = false;
    let detachedStat: fs.Stats | undefined;
    let ownershipValidated = false;
    try {
        try {
            await fs.promises.rename(input.generationRoot, cleanupPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                await fsyncPath(path.dirname(input.generationRoot));
                return;
            }
            throw error;
        }
        detached = true;
        detachedStat = await fs.promises.lstat(cleanupPath);
        if (
            !detachedStat.isDirectory()
            || detachedStat.isSymbolicLink()
            || !samePathIdentity(input.generationStat, detachedStat)
        ) {
            throw new Error(`staged navigation generation identity changed at ${input.generationRoot}`);
        }

        const seal = parseNavigationGenerationSeal(
            await readJson(path.join(cleanupPath, NAVIGATION_GENERATION_SEAL_FILE_NAME)),
        );
        if (
            !seal
            || seal.generationId !== input.generationId
            || computeNavigationGenerationSealHash(seal) !== input.navigationSealHash
        ) {
            throw new Error(`staged navigation generation seal changed at ${input.generationRoot}`);
        }
        ownershipValidated = true;

        await fs.promises.rm(cleanupPath, { recursive: true, force: false });
        await confirmPathAbsent(cleanupPath);
        await fsyncPath(path.dirname(input.generationRoot));
    } catch (error) {
        if (detached && !ownershipValidated && detachedStat) {
            try {
                await restoreDetachedNavigationGeneration({
                    generationRoot: input.generationRoot,
                    cleanupPath,
                    detachedStat,
                });
            } catch (restoreError) {
                throw new NavigationSidecarCleanupFailure(cleanupPath, restoreError);
            }
            throw error;
        }
        if (detached) {
            throw new NavigationSidecarCleanupFailure(cleanupPath, error);
        }
        throw error;
    }
}

async function collectDirectoryTreePaths(
    rootPath: string,
    files: string[],
    directories: string[],
): Promise<void> {
    const entries = await fs.promises.readdir(rootPath, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => compareStrings(left.name, right.name))) {
        const entryPath = path.join(rootPath, entry.name);
        if (entry.isDirectory()) {
            await collectDirectoryTreePaths(entryPath, files, directories);
        } else if (entry.isFile()) {
            files.push(entryPath);
        }
    }
    directories.push(rootPath);
}

async function fsyncDirectoryTree(
    rootPath: string,
    sharedFileSizes: ReadonlyMap<string, number> = new Map(),
): Promise<StagedNavigationSidecarGeneration['physical']> {
    const files: string[] = [];
    const directories: string[] = [];
    await collectDirectoryTreePaths(rootPath, files, directories);
    let logicalBytes = 0;
    let physicallyWrittenBytes = 0;
    let sharedFiles = 0;
    const writtenFiles: string[] = [];
    for (let offset = 0; offset < files.length; offset += SHARD_IO_CONCURRENCY) {
        const batch = files.slice(offset, offset + SHARD_IO_CONCURRENCY);
        const stats = await Promise.all(batch.map(async (filePath) => {
            const relativePath = path.relative(rootPath, filePath).replace(/\\/g, '/');
            const sharedSize = sharedFileSizes.get(relativePath);
            return sharedSize === undefined
                ? { filePath, size: (await fs.promises.stat(filePath)).size, shared: false }
                : { filePath, size: sharedSize, shared: true };
        }));
        for (const { filePath, size, shared } of stats) {
            logicalBytes += size;
            if (shared) {
                sharedFiles += 1;
            } else {
                physicallyWrittenBytes += size;
                writtenFiles.push(filePath);
            }
        }
    }
    for (let offset = 0; offset < writtenFiles.length; offset += SHARD_IO_CONCURRENCY) {
        await Promise.all(writtenFiles.slice(offset, offset + SHARD_IO_CONCURRENCY).map(fsyncPath));
    }
    for (const directory of directories) await fsyncPath(directory);
    return {
        logicalBytes,
        physicallyWrittenBytes,
        sharedFiles,
        writtenFiles: writtenFiles.length,
    };
}

async function publishCurrentGenerationPointer(
    rootPath: string,
    pointer: {
        schemaVersion: typeof CURRENT_GENERATION_SCHEMA_VERSION;
        generationId: string;
        symbolRegistryManifestHash: string;
        relationshipManifestHash: string;
        navigationSealHash: string;
    },
    beforePublish?: () => void,
    publishMutation?: (publish: () => void) => void,
): Promise<void> {
    await fs.promises.mkdir(rootPath, { recursive: true });
    const pointerPath = path.join(rootPath, CURRENT_GENERATION_FILE_NAME);
    const temporaryPath = path.join(rootPath, uniqueSidecarEntryName(TEMP_ENTRY_PREFIX));
    let published = false;
    let publicationCount = 0;
    try {
        await fs.promises.writeFile(temporaryPath, serializeJson(pointer), 'utf8');
        if (publishMutation) {
            publishMutation(() => {
                publicationCount += 1;
                if (publicationCount > 1) {
                    throw new Error('Navigation generation publication callback invoked publish more than once.');
                }
                fs.renameSync(temporaryPath, pointerPath);
                published = true;
            });
            if (!published || publicationCount !== 1) {
                throw new Error('Navigation generation publication callback returned without publishing the pointer.');
            }
        } else {
            beforePublish?.();
            await fs.promises.rename(temporaryPath, pointerPath);
            published = true;
        }
    } finally {
        if (!published) {
            await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
        }
    }
}

export async function writeNavigationSidecarGeneration(
    input: WriteNavigationSidecarGenerationInput,
): Promise<StagedNavigationSidecarGeneration> {
    const staged = await stageNavigationSidecarGeneration(input);
    await publishNavigationSidecarGeneration(staged, {
        beforePublish: input.beforePublish,
        publishMutation: input.publishMutation,
    });
    return staged;
}

async function loadNavigationShardReuse(
    stateRoot: string | undefined,
    normalizedRootPath: string,
    input: NonNullable<WriteNavigationSidecarGenerationInput['deltaReuse']>,
): Promise<{ symbols: SymbolShardReuse; relationships: RelationshipShardReuse }> {
    const generation = await resolveNavigationGeneration(
        stateRoot,
        normalizedRootPath,
        input.baseGenerationId,
    );
    const rawSymbolIndex = await readJson(path.join(generation.generationRoot, SYMBOLS_DIR_NAME, 'index.json'));
    if (!isSymbolIndexFile(rawSymbolIndex) || rawSymbolIndex.schemaVersion !== SYMBOL_INDEX_SCHEMA_VERSION) {
        throw new Error('Atomic navigation delta source lacks reusable symbol contributions; reindex is required.');
    }
    if (rawSymbolIndex.manifestHash !== generation.symbolRegistryManifestHash) {
        throw new Error('Atomic navigation delta source symbol identity is incompatible; reindex is required.');
    }

    const relationshipManifestPath = path.join(generation.generationRoot, RELATIONSHIPS_DIR_NAME, 'manifest.json');
    const serializedRelationshipManifest = await fs.promises.readFile(relationshipManifestPath, 'utf8');
    const rawRelationshipManifest = JSON.parse(serializedRelationshipManifest) as unknown;
    if (
        !isRelationshipManifest(rawRelationshipManifest)
        || rawRelationshipManifest.fileContributionSchemaVersion
            !== RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION
    ) {
        throw new Error('Atomic navigation delta source lacks reusable relationship contributions; reindex is required.');
    }
    const relationshipManifestHash = crypto.createHash('sha256')
        .update(serializedRelationshipManifest, 'utf8')
        .digest('hex');
    if (relationshipManifestHash !== generation.relationshipManifestHash) {
        throw new Error('Atomic navigation delta source relationship identity is incompatible; reindex is required.');
    }
    const rawSeal = await readJson(path.join(generation.generationRoot, NAVIGATION_GENERATION_SEAL_FILE_NAME));
    const seal = parseNavigationGenerationSeal(rawSeal);
    const artifactSet = [
        ...rawSymbolIndex.files.map((file) => ({ path: file.shardPath, hash: file.shardHash })),
        ...rawRelationshipManifest.files.map((file) => ({ path: file.shardPath, hash: file.shardHash })),
    ].sort((left, right) => compareStrings(left.path, right.path));
    if (!seal || hashSerializedJson(artifactSet) !== seal.artifactSetHash) {
        throw new Error('Atomic navigation delta source artifact identity is incompatible; reindex is required.');
    }

    const validateRewritePaths = (paths: readonly string[], kind: string): Set<string> => {
        const normalized = new Set<string>();
        for (const filePath of paths) {
            const candidate = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
            if (!isRepositoryRelativePath(candidate)) {
                throw new Error(`Atomic navigation delta ${kind} rewrite path '${filePath}' is invalid.`);
            }
            normalized.add(candidate);
        }
        return normalized;
    };
    const sharedFileSizes = new Map<string, number>();
    return {
        symbols: {
            sourceRoot: generation.generationRoot,
            filesByPath: new Map(rawSymbolIndex.files.map((file) => [file.path, file])),
            filesToRewrite: validateRewritePaths(input.symbolFilesToRewrite, 'symbol'),
            sharedFileSizes,
        },
        relationships: {
            sourceRoot: generation.generationRoot,
            filesByPath: new Map(rawRelationshipManifest.files.map((file) => [file.path, file])),
            filesToRewrite: validateRewritePaths(input.relationshipFilesToRewrite, 'relationship'),
            sharedFileSizes,
        },
    };
}

export async function stageNavigationSidecarGeneration(
    input: Omit<WriteNavigationSidecarGenerationInput, 'beforePublish' | 'publishMutation'>,
): Promise<StagedNavigationSidecarGeneration> {
    const rootPath = resolveNavigationSidecarRoot(
        input.stateRoot,
        input.registry.manifest.normalizedRootPath,
    );
    for (const file of input.registry.manifest.files) {
        if (!getRelationshipAnalysisEvidence(input.analysisByFile, file.path)) {
            throw new Error(`Relationship analysis evidence is missing for manifest file '${file.path}'.`);
        }
    }
    const reuse = input.deltaReuse
        ? await loadNavigationShardReuse(
            input.stateRoot,
            input.registry.manifest.normalizedRootPath,
            input.deltaReuse,
        )
        : undefined;

    const buildStateRoot = path.join(rootPath, uniqueSidecarEntryName(TEMP_ENTRY_PREFIX));
    let generationRoot: string | undefined;
    let generationRenamed = false;
    let generationStat: fs.Stats | undefined;
    let navigationSealHash: string | undefined;
    try {
        const symbolResult = await writeSymbolRegistrySidecarInternal({
            stateRoot: buildStateRoot,
            registry: input.registry,
        }, reuse?.symbols);
        const relationshipResult = await writeRelationshipSidecarInternal({
            stateRoot: buildStateRoot,
            normalizedRootPath: input.registry.manifest.normalizedRootPath,
            symbolRegistryManifestHash: symbolResult.manifestHash,
            relationshipVersion: input.registry.manifest.relationshipVersion,
            builtAt: input.registry.manifest.builtAt,
            files: input.registry.manifest.files,
            records: input.records,
            analysisByFile: input.analysisByFile,
        }, reuse?.relationships);

        const builtRoot = symbolResult.rootPath;
        const generationId = `${symbolResult.manifestHash.slice(0, 16)}-${crypto.randomBytes(8).toString('hex')}`;
        generationRoot = path.join(rootPath, GENERATIONS_DIR_NAME, generationId);
        await fs.promises.mkdir(path.dirname(generationRoot), { recursive: true });
        await fs.promises.rename(builtRoot, generationRoot);
        generationRenamed = true;
        generationStat = await fs.promises.lstat(generationRoot);

        const symbolIndex = await readJson(path.join(generationRoot, SYMBOLS_DIR_NAME, 'index.json'));
        const relationshipManifest = await readJson(path.join(generationRoot, RELATIONSHIPS_DIR_NAME, 'manifest.json'));
        if (!isSymbolIndexFile(symbolIndex) || !isRelationshipManifest(relationshipManifest)) {
            throw new Error('Staged navigation generation cannot be sealed because its artifact manifests are invalid.');
        }
        const artifactSet = [
            ...symbolIndex.files.map((file) => ({ path: file.shardPath, hash: file.shardHash })),
            ...relationshipManifest.files.map((file) => ({ path: file.shardPath, hash: file.shardHash })),
        ].sort((left, right) => compareStrings(left.path, right.path));
        const seal: NavigationGenerationSeal = {
            schemaVersion: NAVIGATION_GENERATION_SEAL_SCHEMA_VERSION,
            generationId,
            symbolRegistryManifestHash: symbolResult.manifestHash,
            relationshipManifestHash: relationshipResult.manifestHash,
            artifactSetHash: hashSerializedJson(artifactSet),
            symbolQuality: buildNavigationSymbolQualityAggregate(input.registry),
        };
        await writeJson(path.join(generationRoot, NAVIGATION_GENERATION_SEAL_FILE_NAME), seal);
        navigationSealHash = computeNavigationGenerationSealHash(seal);
        const physical = await fsyncDirectoryTree(
            generationRoot,
            reuse?.symbols.sharedFileSizes,
        );
        await fsyncPath(path.dirname(generationRoot));
        await fsyncPath(rootPath);

        return {
            rootPath,
            normalizedRootPath: input.registry.manifest.normalizedRootPath,
            manifestHash: symbolResult.manifestHash,
            fileShardCount: symbolResult.fileShardCount,
            symbolCount: symbolResult.symbolCount,
            generationId,
            relationshipManifestHash: relationshipResult.manifestHash,
            relationshipCount: relationshipResult.relationshipCount,
            relationshipFileShardCount: relationshipResult.fileShardCount,
            navigationSealHash,
            sourceFileCount: input.registry.manifest.files.length,
            sourceFilesDigest: computeNavigationSourceFilesDigest(input.registry.manifest.files),
            physical,
        };
    } catch (error) {
        if (generationRenamed && generationRoot) {
            try {
                await cleanupStagedNavigationGeneration({
                    generationRoot,
                    generationId: path.basename(generationRoot),
                    generationStat,
                    navigationSealHash,
                });
            } catch (cleanupError) {
                const unresolvedCleanupPath = cleanupError instanceof NavigationSidecarCleanupFailure
                    ? cleanupError.cleanupPath
                    : generationRoot;
                throw new NavigationSidecarStagingCleanupError(
                    unresolvedCleanupPath,
                    error,
                    cleanupError,
                );
            }
        }
        throw error;
    } finally {
        await fs.promises.rm(buildStateRoot, { recursive: true, force: true }).catch(() => undefined);
    }
}

export async function publishNavigationSidecarGeneration(
    candidate: NavigationGenerationPointerCandidate,
    options: Pick<WriteNavigationSidecarGenerationInput, 'beforePublish' | 'publishMutation'> = {},
): Promise<void> {
    await publishCurrentGenerationPointer(
        candidate.rootPath,
        {
            schemaVersion: CURRENT_GENERATION_SCHEMA_VERSION,
            generationId: candidate.generationId,
            symbolRegistryManifestHash: candidate.manifestHash,
            relationshipManifestHash: candidate.relationshipManifestHash,
            navigationSealHash: candidate.navigationSealHash,
        },
        options.beforePublish,
        options.publishMutation,
    );
}

export async function discardNavigationSidecarGeneration(
    candidate: StagedNavigationSidecarGeneration,
    beforeDelete?: () => void,
): Promise<void> {
    beforeDelete?.();
    await fs.promises.rm(
        path.join(candidate.rootPath, GENERATIONS_DIR_NAME, candidate.generationId),
        { recursive: true, force: true },
    );
}

export async function pruneNavigationSidecarGenerations(input: {
    stateRoot?: string;
    normalizedRootPath: string;
    keepGenerationIds: ReadonlySet<string>;
}): Promise<string[]> {
    const rootPath = resolveNavigationSidecarRoot(input.stateRoot, input.normalizedRootPath);
    const generationsRoot = path.join(rootPath, GENERATIONS_DIR_NAME);
    const keepGenerationIds = new Set(input.keepGenerationIds);
    const current = await resolveCurrentNavigationGeneration(
        input.stateRoot,
        input.normalizedRootPath,
    ).catch(() => null);
    if (current) keepGenerationIds.add(current.generationId);

    let entries: fs.Dirent[];
    try {
        entries = await fs.promises.readdir(generationsRoot, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
    const removed: string[] = [];
    for (const entry of entries
        .filter((candidate) => candidate.isDirectory() && !keepGenerationIds.has(candidate.name))
        .sort((left, right) => compareStrings(left.name, right.name))) {
        await fs.promises.rm(path.join(generationsRoot, entry.name), { recursive: true, force: true });
        removed.push(entry.name);
    }
    if (removed.length > 0) await fsyncPath(generationsRoot);
    return removed;
}

export async function clearSymbolRegistrySidecar(input: ClearSymbolRegistrySidecarInput): Promise<void> {
    const rootPath = resolveNavigationSidecarRoot(input.stateRoot, input.normalizedRootPath);
    if (input.publishMutation) {
        const detachedPath = path.join(
            path.dirname(rootPath),
            uniqueSidecarEntryName(BACKUP_ENTRY_PREFIX),
        );
        let detached = false;
        input.publishMutation(() => {
            try {
                fs.renameSync(rootPath, detachedPath);
                detached = true;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    throw error;
                }
            }
        });
        if (detached) {
            await fs.promises.rm(detachedPath, { recursive: true, force: true });
        }
        return;
    }
    input.beforeDelete?.();
    await fs.promises.rm(rootPath, { recursive: true, force: true });
}
