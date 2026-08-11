import * as crypto from 'crypto';
import { canonicalizeRepositoryRelativePath } from '../paths/repository-path';
import { compareContractStrings } from '../utils/compare-contract-strings';
import { computeMerkleRoot } from './merkle';

export interface SnapshotFileStatSignature {
    size: number;
    mtimeMs: number;
    ctimeMs: number;
}

export interface SnapshotV2 {
    snapshotVersion: number;
    fileHashes: [string, string][];
    fileStats: [string, SnapshotFileStatSignature][];
    merkleRoot: string;
    partialScan: boolean;
    unscannedDirPrefixes: string[];
    fullHashCounter: number;
}

export interface SnapshotV3 extends SnapshotV2 {
    snapshotVersion: 3;
    canonicalRoot: string;
    checkpointIdentity: string;
    collectionName: string;
    markerRunId: string;
    indexPolicyHash: string;
    documentDigest: string;
}

export type ParsedSnapshot = Partial<SnapshotV2> & Partial<Pick<
    SnapshotV3,
    'canonicalRoot' | 'checkpointIdentity' | 'collectionName' | 'markerRunId' | 'indexPolicyHash' | 'documentDigest'
>>;

export interface SnapshotCheckpointState {
    fileHashes: ReadonlyMap<string, string>;
    fileStats: ReadonlyMap<string, SnapshotFileStatSignature>;
    unscannedDirPrefixes: readonly string[];
    partialScan: boolean;
    merkleRoot: string;
    fullHashCounter: number;
}

export interface SnapshotCheckpointAuthority {
    readonly collectionName: string;
    readonly markerRunId: string;
    readonly indexPolicyHash: string;
}

export interface SnapshotGenerationValidationOptions {
    canonicalRoot: string;
    checkpointIdentity: string | null;
    checkpointAuthority: SnapshotCheckpointAuthority | null;
}

export const SNAPSHOT_VERSION = 2;
export const GENERATION_SNAPSHOT_VERSION = 3;

function normalizeRelPath(canonicalRoot: string, candidatePath: string): string {
    return canonicalizeRepositoryRelativePath(canonicalRoot, candidatePath) ?? '';
}

function isPathWithinPrefix(candidatePath: string, prefix: string): boolean {
    return candidatePath === prefix || candidatePath.startsWith(`${prefix}/`);
}

function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function normalizeAndCompressPrefixes(canonicalRoot: string, prefixes: Iterable<string>): string[] {
    const normalized = Array.from(prefixes)
        .map((prefix) => normalizeRelPath(canonicalRoot, prefix))
        .filter((prefix) => prefix.length > 0)
        .sort();

    const compressed: string[] = [];
    for (const prefix of normalized) {
        const covered = compressed.some((existingPrefix) => isPathWithinPrefix(prefix, existingPrefix));
        if (!covered) {
            compressed.push(prefix);
        }
    }

    return compressed;
}

export function buildSnapshotPayload(
    checkpoint: SnapshotCheckpointState,
    canonicalRoot: string,
    checkpointIdentity: string | null,
    checkpointAuthority: SnapshotCheckpointAuthority | null,
): SnapshotV2 | SnapshotV3 {
    const fileHashes = Array.from(checkpoint.fileHashes.entries())
        .sort(([a], [b]) => compareContractStrings(a, b));
    const fileStats = Array.from(checkpoint.fileStats.entries())
        .sort(([a], [b]) => compareContractStrings(a, b));
    const basePayload: SnapshotV2 = {
        snapshotVersion: SNAPSHOT_VERSION,
        fileHashes,
        fileStats,
        merkleRoot: checkpoint.merkleRoot,
        partialScan: checkpoint.partialScan,
        unscannedDirPrefixes: [...checkpoint.unscannedDirPrefixes],
        fullHashCounter: checkpoint.fullHashCounter,
    };
    if (!checkpointIdentity) return basePayload;
    if (!checkpointAuthority) {
        throw new Error('[Synchronizer] Cannot publish an authority-scoped checkpoint without marker ownership evidence.');
    }
    if (checkpointAuthority.collectionName !== checkpointIdentity) {
        throw new Error('[Synchronizer] Candidate checkpoint identity must match its collection authority.');
    }
    const generationPayload: Omit<SnapshotV3, 'documentDigest'> = {
        ...basePayload,
        snapshotVersion: GENERATION_SNAPSHOT_VERSION,
        canonicalRoot,
        checkpointIdentity,
        collectionName: checkpointAuthority.collectionName,
        markerRunId: checkpointAuthority.markerRunId,
        indexPolicyHash: checkpointAuthority.indexPolicyHash,
    };
    return {
        ...generationPayload,
        documentDigest: crypto.createHash('sha256')
            .update(JSON.stringify(generationPayload))
            .digest('hex'),
    };
}

export function serializeSnapshot(payload: SnapshotV2 | SnapshotV3): string {
    return JSON.stringify(payload);
}

export function parseSnapshotDocument(data: string): ParsedSnapshot {
    return JSON.parse(data) as ParsedSnapshot;
}

export function assertValidCurrentSnapshot(
    snapshot: Partial<SnapshotV2>,
    canonicalRoot: string,
): void {
    const invalid = (reason: string): never => {
        throw new Error(`[Synchronizer] Invalid current-format snapshot: ${reason}`);
    };
    const rawFileHashes = snapshot.fileHashes;
    const rawFileStats = snapshot.fileStats;
    if (!Array.isArray(rawFileHashes) || !Array.isArray(rawFileStats)) {
        invalid('fileHashes and fileStats must be arrays.');
    }

    const hashes = new Map<string, string>();
    for (const entry of rawFileHashes ?? []) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string') {
            invalid('fileHashes contains a malformed entry.');
        }
        const normalizedPath = normalizeRelPath(canonicalRoot, entry[0]);
        if (!normalizedPath || normalizedPath !== entry[0] || hashes.has(normalizedPath)) {
            invalid(`fileHashes contains an invalid or duplicate path '${entry[0]}'.`);
        }
        if (!/^[a-f0-9]{64}$/.test(entry[1])) {
            invalid(`fileHashes contains an invalid SHA-256 for '${normalizedPath}'.`);
        }
        hashes.set(normalizedPath, entry[1]);
    }

    const statPaths = new Set<string>();
    for (const entry of rawFileStats ?? []) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
            invalid('fileStats contains a malformed entry.');
        }
        const normalizedPath = normalizeRelPath(canonicalRoot, entry[0]);
        const signature = entry[1] as Partial<SnapshotFileStatSignature> | undefined;
        if (!normalizedPath || normalizedPath !== entry[0] || statPaths.has(normalizedPath)) {
            invalid(`fileStats contains an invalid or duplicate path '${entry[0]}'.`);
        }
        if (!signature) {
            throw new Error(`[Synchronizer] Invalid current-format snapshot: fileStats is missing a signature for '${normalizedPath}'.`);
        }
        if (!Number.isSafeInteger(signature.size) || Number(signature.size) < 0) {
            invalid(`fileStats contains an invalid size for '${normalizedPath}'.`);
        }
        if (!Number.isFinite(signature.mtimeMs) || Number(signature.mtimeMs) < 0
            || !Number.isFinite(signature.ctimeMs) || Number(signature.ctimeMs) < 0) {
            invalid(`fileStats contains invalid timestamps for '${normalizedPath}'.`);
        }
        statPaths.add(normalizedPath);
    }
    if (hashes.size !== statPaths.size || [...hashes.keys()].some((filePath) => !statPaths.has(filePath))) {
        invalid('fileHashes and fileStats must contain identical path sets.');
    }

    if (typeof snapshot.merkleRoot !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.merkleRoot)) {
        invalid('merkleRoot must be a SHA-256 digest.');
    }
    if (snapshot.merkleRoot !== computeMerkleRoot(hashes)) {
        invalid('merkleRoot does not match fileHashes.');
    }
    const rawUnscannedDirPrefixes = snapshot.unscannedDirPrefixes;
    if (typeof snapshot.partialScan !== 'boolean' || !Array.isArray(rawUnscannedDirPrefixes)) {
        invalid('partial scan metadata is malformed.');
    }
    const unscannedDirPrefixes = rawUnscannedDirPrefixes as string[];
    for (const prefix of unscannedDirPrefixes ?? []) {
        if (typeof prefix !== 'string' || !prefix || normalizeRelPath(canonicalRoot, prefix) !== prefix) {
            invalid('unscannedDirPrefixes contains an invalid path.');
        }
    }
    const canonicalPrefixes = normalizeAndCompressPrefixes(canonicalRoot, new Set(unscannedDirPrefixes));
    if (!arraysEqual(unscannedDirPrefixes, canonicalPrefixes)) {
        invalid('unscannedDirPrefixes must be canonical, unique, compressed, and deterministically ordered.');
    }
    if (unscannedDirPrefixes.length > 0 && snapshot.partialScan !== true) {
        invalid('partialScan must be true when unscannedDirPrefixes is nonempty.');
    }
    if (!Number.isSafeInteger(snapshot.fullHashCounter) || Number(snapshot.fullHashCounter) < 0) {
        invalid('fullHashCounter must be a nonnegative safe integer.');
    }
}

export function assertValidGenerationSnapshot(
    snapshot: ParsedSnapshot,
    options: SnapshotGenerationValidationOptions,
): void {
    assertValidCurrentSnapshot(snapshot, options.canonicalRoot);
    if (!options.checkpointIdentity) {
        throw new Error('[Synchronizer] Generation checkpoint cannot be loaded without an authority identity.');
    }
    if (snapshot.canonicalRoot !== options.canonicalRoot) {
        throw new Error('[Synchronizer] Generation checkpoint canonical root does not match its owner.');
    }
    if (snapshot.checkpointIdentity !== options.checkpointIdentity) {
        throw new Error('[Synchronizer] Generation checkpoint authority identity does not match its owner.');
    }
    if (!options.checkpointAuthority) {
        throw new Error('[Synchronizer] Generation checkpoint cannot be validated without exact marker ownership evidence.');
    }
    if (
        snapshot.collectionName !== options.checkpointAuthority.collectionName
        || snapshot.markerRunId !== options.checkpointAuthority.markerRunId
        || snapshot.indexPolicyHash !== options.checkpointAuthority.indexPolicyHash
    ) {
        throw new Error('[Synchronizer] Generation checkpoint does not belong to the active completion marker.');
    }
    if (typeof snapshot.documentDigest !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.documentDigest)) {
        throw new Error('[Synchronizer] Generation checkpoint document digest is invalid.');
    }
    const { documentDigest, ...unsignedSnapshot } = snapshot;
    const expectedDigest = crypto.createHash('sha256')
        .update(JSON.stringify(unsignedSnapshot))
        .digest('hex');
    if (documentDigest !== expectedDigest) {
        throw new Error('[Synchronizer] Generation checkpoint document digest does not match its payload.');
    }
}
