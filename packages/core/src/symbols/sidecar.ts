import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
    RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION,
    RELATIONSHIP_MANIFEST_SCHEMA_VERSION,
    isRelationshipManifest,
} from './contracts';
import { isRepositoryRelativePath } from '../paths/repository-path';
import {
    computeSymbolRegistryManifestHash,
} from './registry';
import type {
    RelationshipManifest,
    RelationshipManifestFile,
    RelationshipRecord,
    SymbolRecord,
    SymbolRegistryManifestFile,
} from './contracts';
import type { SymbolRegistry } from './registry';
import type { RelationshipAnalysisEvidence } from '../relationships';
import {
    CURRENT_GENERATION_SCHEMA_VERSION,
    NAVIGATION_GENERATION_SEAL_SCHEMA_VERSION,
    SYMBOL_INDEX_SCHEMA_VERSION,
    isRelationshipRecord,
    isSymbolIndexFile,
    isSymbolRecord,
    parseNavigationGenerationSeal,
} from './sidecar-validators';
import type {
    NavigationGenerationSeal,
    NavigationSymbolQualityAggregate,
    SymbolIndexFileEntry,
} from './sidecar-validators';
import type {
    PythonFlowFact,
    SourceSpan,
} from '../language-analysis';
import type {
    ResolutionClaim,
    ResolutionProofStep,
} from '../relationships/resolution';
import {
    CURRENT_GENERATION_FILE_NAME,
    GENERATIONS_DIR_NAME,
    NAVIGATION_GENERATION_SEAL_FILE_NAME,
    RELATIONSHIPS_DIR_NAME,
    SYMBOL_FILE_CONTRIBUTION_SCHEMA_VERSION,
    SYMBOLS_DIR_NAME,
    buildNavigationSymbolQualityAggregate,
    buildSymbolIndex,
    compareRelationshipRecords,
    compareStrings,
    computeNavigationGenerationSealHash,
    computeNavigationSourceFilesDigest,
    fileShardName,
    hashSerializedJson,
    hashSerializedString,
    readJson,
    resolveCurrentNavigationGeneration,
    resolveNavigationGeneration,
    resolveNavigationSidecarRoot,
    serializeJson,
} from './sidecar-reads';

const TEMP_ENTRY_PREFIX = '.satori-tmp-';
const BACKUP_ENTRY_PREFIX = '.satori-backup-';
const CLEANUP_ENTRY_PREFIX = '.satori-cleanup-';
const SHARD_IO_CONCURRENCY = 64;
const RELATIONSHIP_SHARD_IO_CONCURRENCY = 8;

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

export { isRelationshipRecord, isSymbolRecord, parseNavigationGenerationSeal };
export type { NavigationGenerationSeal, NavigationSymbolQualityAggregate };
export {
    RetiredNavigationPointerError,
    UnsupportedNavigationPointerError,
    computeNavigationGenerationSealHash,
    computeNavigationSourceFilesDigest,
    computeRelationshipManifestHash,
    readNavigationGenerationSeal,
    readRelationshipSidecar,
    readSymbolRegistrySidecar,
    resolveCurrentNavigationGeneration,
    resolveNavigationGeneration,
    resolveNavigationSidecarRoot,
    verifyNavigationGenerationSealArtifacts,
} from './sidecar-reads';
export type {
    CurrentNavigationGeneration,
    ReadNavigationGenerationSealResult,
    ReadRelationshipSidecarInput,
    ReadRelationshipSidecarResult,
    ReadSymbolRegistrySidecarInput,
    ReadSymbolRegistrySidecarResult,
} from './sidecar-reads';

export interface WriteSymbolRegistrySidecarInput {
    registry: SymbolRegistry;
    stateRoot?: string;
    beforePublish?: () => void;
}

export interface WriteSymbolRegistrySidecarResult {
    rootPath: string;
    manifestHash: string;
    fileShardCount: number;
    symbolCount: number;
}

export interface WriteRelationshipSidecarInput {
    normalizedRootPath: string;
    symbolRegistryManifestHash: string;
    relationshipVersion: string;
    builtAt: string;
    records: RelationshipRecord[];
    analysisByFile?: Map<string, RelationshipAnalysisEvidence> | Record<string, RelationshipAnalysisEvidence>;
    files?: SymbolRegistryManifestFile[];
    stateRoot?: string;
    beforePublish?: () => void;
}

export interface WriteRelationshipSidecarResult {
    rootPath: string;
    manifestHash: string;
    fileShardCount: number;
    relationshipCount: number;
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

async function writeJson(filePath: string, value: unknown): Promise<void> {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, serializeJson(value), 'utf8');
}

async function writeSerializedJson(filePath: string, serialized: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, serialized, 'utf8');
}

async function fsyncPath(targetPath: string): Promise<void> {
    const handle = await fs.promises.open(targetPath, 'r');
    try {
        await handle.sync();
    } finally {
        await handle.close();
    }
}

function samePathIdentity(expected: fs.Stats, actual: fs.Stats): boolean {
    return expected.dev === actual.dev && expected.ino === actual.ino;
}

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

function uniqueSidecarEntryName(kind: string): string {
    return `${kind}${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

async function writeJsonAtomically(filePath: string, value: unknown, beforePublish?: () => void): Promise<void> {
    const directory = path.dirname(filePath);
    await fs.promises.mkdir(directory, { recursive: true });
    const temporaryPath = path.join(directory, uniqueSidecarEntryName(TEMP_ENTRY_PREFIX));
    try {
        await fs.promises.writeFile(temporaryPath, serializeJson(value), 'utf8');
        beforePublish?.();
        await fs.promises.rename(temporaryPath, filePath);
    } catch (error) {
        await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
    }
}

async function replaceDirectoryWithRollback(
    finalPath: string,
    temporaryPath: string,
    afterReplace?: () => Promise<void>,
    beforePublish?: () => void,
): Promise<void> {
    const parentDirectory = path.dirname(finalPath);
    const backupPath = path.join(parentDirectory, uniqueSidecarEntryName(BACKUP_ENTRY_PREFIX));
    let backupCreated = false;

    beforePublish?.();
    try {
        await fs.promises.rename(finalPath, backupPath);
        backupCreated = true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            await fs.promises.rm(temporaryPath, { recursive: true, force: true }).catch(() => undefined);
            throw error;
        }
    }

    try {
        beforePublish?.();
        await fs.promises.rename(temporaryPath, finalPath);
        if (afterReplace) {
            await afterReplace();
        }
        if (backupCreated) {
            await fs.promises.rm(backupPath, { recursive: true, force: true });
        }
    } catch (error) {
        await fs.promises.rm(finalPath, { recursive: true, force: true }).catch(() => undefined);
        if (backupCreated) {
            await fs.promises.rename(backupPath, finalPath).catch(() => undefined);
        }
        await fs.promises.rm(temporaryPath, { recursive: true, force: true }).catch(() => undefined);
        throw error;
    }
}

function groupSymbolsByFile(symbols: SymbolRecord[]): Map<string, SymbolRecord[]> {
    const grouped = new Map<string, SymbolRecord[]>();
    for (const symbol of symbols) {
        const existing = grouped.get(symbol.file);
        if (existing) {
            existing.push(symbol);
            continue;
        }
        grouped.set(symbol.file, [symbol]);
    }
    return grouped;
}

function buildRelationshipManifest(
    registryManifestHash: string,
    relationshipVersion: string,
    builtAt: string,
    files: RelationshipManifestFile[],
): RelationshipManifest {
    return {
        schemaVersion: RELATIONSHIP_MANIFEST_SCHEMA_VERSION,
        fileContributionSchemaVersion: RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION,
        symbolRegistryManifestHash: registryManifestHash,
        relationshipVersion,
        builtAt,
        files: [...files].sort((a, b) => compareStrings(a.path, b.path)),
    };
}

function groupRelationshipsByFile(records: RelationshipRecord[]): Map<string, RelationshipRecord[]> {
    const grouped = new Map<string, RelationshipRecord[]>();
    for (const record of records) {
        const existing = grouped.get(record.file);
        if (existing) {
            existing.push(record);
            continue;
        }
        grouped.set(record.file, [record]);
    }
    return grouped;
}

function getRelationshipAnalysisEvidence(
    analysisByFile: WriteRelationshipSidecarInput['analysisByFile'],
    filePath: string,
): RelationshipAnalysisEvidence | undefined {
    if (!analysisByFile) return undefined;
    return analysisByFile instanceof Map ? analysisByFile.get(filePath) : analysisByFile[filePath];
}

function getRelationshipAnalysisEvidencePaths(
    analysisByFile: WriteRelationshipSidecarInput['analysisByFile'],
): string[] {
    if (!analysisByFile) return [];
    return analysisByFile instanceof Map
        ? [...analysisByFile.keys()]
        : Object.keys(analysisByFile);
}

function canonicalizeSourceSpan(span: SourceSpan): SourceSpan {
    return { ...span };
}

function canonicalizePythonFlowFact(fact: PythonFlowFact): PythonFlowFact {
    if (fact.kind === 'assignment_origin') {
        return {
            kind: fact.kind,
            targetText: fact.targetText,
            valueText: fact.valueText,
            valueKind: fact.valueKind,
            ...(fact.constructorTypeName === undefined ? {} : { constructorTypeName: fact.constructorTypeName }),
            ...(fact.calleeName === undefined ? {} : { calleeName: fact.calleeName }),
            span: canonicalizeSourceSpan(fact.span),
            contextSpan: canonicalizeSourceSpan(fact.contextSpan),
        };
    }
    if (fact.kind === 'call_argument') {
        return {
            kind: fact.kind,
            calleeText: fact.calleeText,
            ...(fact.argumentName === undefined ? {} : { argumentName: fact.argumentName }),
            ...(fact.argumentIndex === undefined ? {} : { argumentIndex: fact.argumentIndex }),
            valueText: fact.valueText,
            span: canonicalizeSourceSpan(fact.span),
            contextSpan: canonicalizeSourceSpan(fact.contextSpan),
        };
    }
    return {
        kind: fact.kind,
        className: fact.className,
        baseNames: [...fact.baseNames],
        span: canonicalizeSourceSpan(fact.span),
        contextSpan: canonicalizeSourceSpan(fact.contextSpan),
    };
}

function compareResolutionClaims(left: ResolutionClaim, right: ResolutionClaim): number {
    if (left.sourceFile !== right.sourceFile) return compareStrings(left.sourceFile, right.sourceFile);
    if (left.callSpan.startByte !== right.callSpan.startByte) return left.callSpan.startByte - right.callSpan.startByte;
    if (left.callSpan.endByte !== right.callSpan.endByte) return left.callSpan.endByte - right.callSpan.endByte;
    if (left.decision !== right.decision) return compareStrings(left.decision, right.decision);
    return compareStrings(left.targetSymbol ?? '', right.targetSymbol ?? '');
}

function canonicalizeResolutionProofStep(step: ResolutionProofStep): ResolutionProofStep {
    return {
        kind: step.kind,
        subject: step.subject,
        ...(step.detail === undefined ? {} : { detail: step.detail }),
        ...(step.span === undefined ? {} : { span: canonicalizeSourceSpan(step.span) }),
        ...(step.hop === undefined ? {} : { hop: step.hop }),
    };
}

function canonicalizeResolutionClaim(claim: ResolutionClaim): ResolutionClaim {
    return {
        providerId: claim.providerId,
        providerVersion: claim.providerVersion,
        environmentConfigId: claim.environmentConfigId,
        sourceFile: claim.sourceFile,
        ...(claim.sourceInstanceId === undefined ? {} : { sourceInstanceId: claim.sourceInstanceId }),
        ...(claim.targetInstanceId === undefined ? {} : { targetInstanceId: claim.targetInstanceId }),
        ...(claim.targetSymbol === undefined ? {} : { targetSymbol: claim.targetSymbol }),
        callSpan: canonicalizeSourceSpan(claim.callSpan),
        decision: claim.decision,
        relationshipType: claim.relationshipType,
        resolutionAuthority: claim.resolutionAuthority,
        proofSteps: claim.proofSteps.map((step) => canonicalizeResolutionProofStep(step)),
        dependencyKeys: [...claim.dependencyKeys].sort(compareStrings),
        flowHops: claim.flowHops,
    };
}

function canonicalizeRelationshipAnalysisEvidence(
    evidence: RelationshipAnalysisEvidence | undefined,
): RelationshipAnalysisEvidence | undefined {
    if (!evidence) return undefined;
    return {
        moduleBindings: [...evidence.moduleBindings],
        callSites: [...evidence.callSites],
        receiverTypeBindings: [...(evidence.receiverTypeBindings ?? [])],
        ...(evidence.pythonFlowFacts && evidence.pythonFlowFacts.length > 0
            ? { pythonFlowFacts: evidence.pythonFlowFacts.map((fact) => canonicalizePythonFlowFact(fact)) }
            : {}),
        ...(evidence.resolutionClaims === undefined
            ? {}
            : {
                resolutionClaims: [...evidence.resolutionClaims]
                    .sort(compareResolutionClaims)
                    .map((claim) => canonicalizeResolutionClaim(claim)),
            }),
    };
}

type SymbolShardReuse = Readonly<{
    sourceRoot: string;
    filesByPath: ReadonlyMap<string, SymbolIndexFileEntry>;
    filesToRewrite: ReadonlySet<string>;
    sharedFileSizes: Map<string, number>;
}>;

type RelationshipShardReuse = Readonly<{
    sourceRoot: string;
    filesByPath: ReadonlyMap<string, RelationshipManifestFile>;
    filesToRewrite: ReadonlySet<string>;
    sharedFileSizes: Map<string, number>;
}>;

function shardSharingError(sourcePath: string, targetPath: string, error: unknown): Error {
    const code = error && typeof error === 'object' && 'code' in error
        ? String((error as NodeJS.ErrnoException).code)
        : 'unknown';
    return new Error(
        'Atomic navigation delta requires same-filesystem hard-link support; '
        + `cannot share '${sourcePath}' into '${targetPath}' (${code}). `
        + 'Run a safe full rebuild instead.',
    );
}

async function linkReusableShard(sourcePath: string, targetPath: string): Promise<number> {
    try {
        const sourceStat = await fs.promises.lstat(sourcePath);
        if (!sourceStat.isFile()) {
            throw new Error('source contribution is not a regular file');
        }
        await fs.promises.link(sourcePath, targetPath);
        return sourceStat.size;
    } catch (error) {
        throw shardSharingError(sourcePath, targetPath, error);
    }
}

async function writeSymbolRegistrySidecarInternal(
    input: WriteSymbolRegistrySidecarInput,
    reuse?: SymbolShardReuse,
): Promise<WriteSymbolRegistrySidecarResult> {
    const rootPath = resolveNavigationSidecarRoot(input.stateRoot, input.registry.manifest.normalizedRootPath);
    const symbolsDir = path.join(rootPath, SYMBOLS_DIR_NAME);
    const temporarySymbolsDir = path.join(rootPath, uniqueSidecarEntryName(TEMP_ENTRY_PREFIX));
    const byFileDir = path.join(temporarySymbolsDir, 'by-file');
    const manifestHash = computeSymbolRegistryManifestHash(input.registry.manifest);
    const groupedSymbols = groupSymbolsByFile(
        reuse
            ? input.registry.symbols.filter((symbol) => reuse.filesToRewrite.has(symbol.file))
            : input.registry.symbols,
    );

    try {
        await fs.promises.mkdir(rootPath, { recursive: true });
        await fs.promises.mkdir(byFileDir, { recursive: true });

        const shardHashes = new Map<string, string>();
        for (let offset = 0; offset < input.registry.manifest.files.length; offset += SHARD_IO_CONCURRENCY) {
            const batch = input.registry.manifest.files.slice(offset, offset + SHARD_IO_CONCURRENCY);
            await Promise.all(batch.map(async (file) => {
                const shardFileName = fileShardName(file.path, file.hash);
                const targetPath = path.join(byFileDir, shardFileName);
                if (reuse && !reuse.filesToRewrite.has(file.path)) {
                    const source = reuse.filesByPath.get(file.path);
                    if (
                        !source
                        || source.hash !== file.hash
                        || source.language !== file.language
                        || source.symbolCount !== file.symbolCount
                        || source.definitionStatus !== file.definitionStatus
                        || path.basename(source.shardPath) !== shardFileName
                    ) {
                        throw new Error(`Reusable symbol contribution is incompatible for '${file.path}'; reindex is required.`);
                    }
                    // The base generation seal already binds this immutable shard's
                    // hash and metadata. Reusing that authority avoids serializing
                    // unchanged symbols merely to derive the same hash again.
                    shardHashes.set(file.path, source.shardHash);
                    const sharedSize = await linkReusableShard(
                        path.join(reuse.sourceRoot, source.shardPath),
                        targetPath,
                    );
                    reuse.sharedFileSizes.set(source.shardPath, sharedSize);
                } else {
                    const symbols = groupedSymbols.get(file.path) || [];
                    const shard = {
                        schemaVersion: SYMBOL_FILE_CONTRIBUTION_SCHEMA_VERSION,
                        path: file.path,
                        hash: file.hash,
                        language: file.language,
                        symbols,
                    };
                    const shardHash = hashSerializedJson(shard);
                    shardHashes.set(file.path, shardHash);
                    await writeJson(targetPath, shard);
                }
            }));
        }
        await writeJson(path.join(temporarySymbolsDir, 'index.json'), buildSymbolIndex(input.registry.manifest, manifestHash, shardHashes));

        await replaceDirectoryWithRollback(
            symbolsDir,
            temporarySymbolsDir,
            () => writeJsonAtomically(path.join(rootPath, 'manifest.json'), input.registry.manifest, input.beforePublish),
            input.beforePublish,
        );

    } catch (error) {
        await fs.promises.rm(temporarySymbolsDir, { recursive: true, force: true }).catch(() => undefined);
        throw error;
    }

    return {
        rootPath,
        manifestHash,
        fileShardCount: input.registry.manifest.files.length,
        symbolCount: input.registry.symbols.length,
    };
}

export async function writeSymbolRegistrySidecar(
    input: WriteSymbolRegistrySidecarInput,
): Promise<WriteSymbolRegistrySidecarResult> {
    return writeSymbolRegistrySidecarInternal(input);
}

async function writeRelationshipSidecarInternal(
    input: WriteRelationshipSidecarInput,
    reuse?: RelationshipShardReuse,
): Promise<WriteRelationshipSidecarResult> {
    const rootPath = resolveNavigationSidecarRoot(input.stateRoot, input.normalizedRootPath);
    const relationshipsDir = path.join(rootPath, RELATIONSHIPS_DIR_NAME);
    const temporaryRelationshipsDir = path.join(rootPath, uniqueSidecarEntryName(TEMP_ENTRY_PREFIX));
    const relationshipByFileDir = path.join(temporaryRelationshipsDir, 'by-file');
    const groupedRelationships = groupRelationshipsByFile(
        (reuse
            ? input.records.filter((record) => reuse.filesToRewrite.has(record.file))
            : [...input.records]
        ).sort(compareRelationshipRecords),
    );
    const filesByPath = new Map((input.files || []).map((file) => [file.path, file]));
    const allowedEvidencePaths = input.files ? new Set(filesByPath.keys()) : undefined;
    if (allowedEvidencePaths) {
        const foreignRecord = input.records.find((record) => !allowedEvidencePaths.has(record.file));
        if (foreignRecord) {
            throw new Error(`Relationship record for '${foreignRecord.file}' is outside the supplied symbol manifest.`);
        }
    }
    const shardPaths = allowedEvidencePaths
        ? new Set(allowedEvidencePaths)
        : new Set(groupedRelationships.keys());
    for (const filePath of getRelationshipAnalysisEvidencePaths(input.analysisByFile)) {
        if (!allowedEvidencePaths || allowedEvidencePaths.has(filePath)) {
            shardPaths.add(filePath);
        }
    }

    let manifestHash = '';
    try {
        await fs.promises.mkdir(rootPath, { recursive: true });
        await fs.promises.mkdir(relationshipByFileDir, { recursive: true });
        const manifestFiles: RelationshipManifestFile[] = [];

        const sortedShardPaths = [...shardPaths].sort(compareStrings);
        for (
            let offset = 0;
            offset < sortedShardPaths.length;
            offset += RELATIONSHIP_SHARD_IO_CONCURRENCY
        ) {
            const batch = sortedShardPaths.slice(offset, offset + RELATIONSHIP_SHARD_IO_CONCURRENCY);
            const batchFiles = await Promise.all(batch.map(async (filePath): Promise<RelationshipManifestFile> => {
                const fileHash = filesByPath.get(filePath)?.hash || input.symbolRegistryManifestHash;
                const shardPath = path.posix.join(RELATIONSHIPS_DIR_NAME, 'by-file', fileShardName(filePath, fileHash));
                const targetPath = path.join(temporaryRelationshipsDir, 'by-file', path.basename(shardPath));
                if (reuse && !reuse.filesToRewrite.has(filePath)) {
                    const source = reuse.filesByPath.get(filePath);
                    if (
                        !source
                        || source.hash !== fileHash
                        || source.shardPath !== shardPath
                    ) {
                        throw new Error(`Reusable relationship contribution is incompatible for '${filePath}'; reindex is required.`);
                    }
                    // As with symbol shards, the sealed base manifest is the
                    // authority for an explicitly unchanged contribution.
                    const sharedSize = await linkReusableShard(
                        path.join(reuse.sourceRoot, source.shardPath),
                        targetPath,
                    );
                    reuse.sharedFileSizes.set(source.shardPath, sharedSize);
                    return { ...source };
                }

                const records = groupedRelationships.get(filePath) ?? [];
                const analysisEvidence = !allowedEvidencePaths || allowedEvidencePaths.has(filePath)
                    ? canonicalizeRelationshipAnalysisEvidence(
                        getRelationshipAnalysisEvidence(input.analysisByFile, filePath),
                    )
                    : undefined;
                const shard = {
                    schemaVersion: RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION,
                    path: filePath,
                    hash: fileHash,
                    relationships: records,
                    analysisEvidence,
                };
                const serializedShard = serializeJson(shard);
                const shardHash = hashSerializedString(serializedShard);
                await writeSerializedJson(targetPath, serializedShard);
                return {
                    path: filePath,
                    hash: fileHash,
                    shardPath,
                    shardHash,
                    relationshipCount: records.length,
                    analysisEvidencePresent: analysisEvidence !== undefined,
                };
            }));
            manifestFiles.push(...batchFiles);
        }

        const manifest = buildRelationshipManifest(
            input.symbolRegistryManifestHash,
            input.relationshipVersion,
            input.builtAt,
            manifestFiles,
        );
        const serializedManifest = serializeJson(manifest);
        manifestHash = hashSerializedString(serializedManifest);
        await writeSerializedJson(
            path.join(temporaryRelationshipsDir, 'manifest.json'),
            serializedManifest,
        );

        await replaceDirectoryWithRollback(relationshipsDir, temporaryRelationshipsDir, undefined, input.beforePublish);
    } catch (error) {
        await fs.promises.rm(temporaryRelationshipsDir, { recursive: true, force: true }).catch(() => undefined);
        throw error;
    }

    return {
        rootPath,
        manifestHash,
        fileShardCount: shardPaths.size,
        relationshipCount: input.records.length,
    };
}

export async function writeRelationshipSidecar(
    input: WriteRelationshipSidecarInput,
): Promise<WriteRelationshipSidecarResult> {
    return writeRelationshipSidecarInternal(input);
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
