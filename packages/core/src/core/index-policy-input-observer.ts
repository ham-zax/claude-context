import { createHash } from 'node:crypto';
import { lstat, type FileHandle } from 'node:fs/promises';
import * as path from 'node:path';
import {
    parseSatoriRepoConfig,
    SATORI_REPO_CONFIG_FILENAME,
    type SatoriRepoConfig,
} from '../config/repo-config';
import {
    openRegularFileInsideRootNoFollow,
    readFileHandleExactly,
    verifyStableFileObservation,
} from '../sync/root-bound-fs';
import { parseIgnorePatterns } from './ignore-rule-service';

export const INDEX_POLICY_CONTROL_FILE_NAMES = [
    '.satoriignore',
    '.gitignore',
    SATORI_REPO_CONFIG_FILENAME,
] as const;

export type IndexPolicyControlFileName = typeof INDEX_POLICY_CONTROL_FILE_NAMES[number];

export type ObservedIndexPolicyInputs = Readonly<{
    profileConfig: SatoriRepoConfig;
    fileBasedIgnorePatterns: readonly string[];
    controlSignature: string;
}>;

type ObservedControlFile = Readonly<{
    name: IndexPolicyControlFileName;
    content: Buffer | null;
}>;

const MAXIMUM_CONTROL_FILE_BYTES = 1_048_576;

async function observeControlFile(
    canonicalRoot: string,
    name: IndexPolicyControlFileName,
): Promise<ObservedControlFile> {
    const filePath = path.join(canonicalRoot, name);
    let pathStat;
    try {
        pathStat = await lstat(filePath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { name, content: null };
        }
        throw error;
    }
    const isIgnoreFile = name === '.satoriignore' || name === '.gitignore';
    if (pathStat.isSymbolicLink()) {
        throw new Error(isIgnoreFile
            ? `Ignore file '${name}' must not be a symbolic link.`
            : `${name} must not be a symbolic link.`);
    }
    if (!pathStat.isFile()) {
        throw new Error(isIgnoreFile
            ? `Ignore file '${name}' is not a regular file.`
            : `${name} is not a regular file.`);
    }

    const handle: FileHandle = await openRegularFileInsideRootNoFollow(filePath, canonicalRoot);

    try {
        const stat = await handle.stat();
        if (stat.size > MAXIMUM_CONTROL_FILE_BYTES) {
            throw new Error(`${name} exceeds the ${MAXIMUM_CONTROL_FILE_BYTES}-byte policy limit.`);
        }
        const content = await readFileHandleExactly(handle, stat.size);
        await verifyStableFileObservation(handle, filePath, canonicalRoot, stat, {
            rejectFinalSymlink: true,
        });
        return { name, content };
    } finally {
        await handle.close().catch(() => undefined);
    }
}

function buildControlSignature(files: readonly ObservedControlFile[]): string {
    const parts = files.map(({ name, content }) => {
        if (content === null) return `${name}:missing`;
        const digest = createHash('sha256').update(content).digest('hex');
        return `${name}:sha256:${digest}:${content.length}`;
    });
    return `v1:${parts.join('|')}`;
}

async function observeControlFiles(canonicalRoot: string): Promise<readonly ObservedControlFile[]> {
    const files: ObservedControlFile[] = [];
    for (const name of INDEX_POLICY_CONTROL_FILE_NAMES) {
        files.push(await observeControlFile(canonicalRoot, name));
    }
    return files;
}

export async function computeIndexPolicyControlSignature(canonicalRoot: string): Promise<string> {
    return buildControlSignature(await observeControlFiles(canonicalRoot));
}

export async function observeIndexPolicyInputs(canonicalRoot: string): Promise<ObservedIndexPolicyInputs> {
    const files = await observeControlFiles(canonicalRoot);
    const byName = new Map(files.map((file) => [file.name, file.content] as const));
    const profileContent = byName.get(SATORI_REPO_CONFIG_FILENAME) ?? null;
    const profileConfig = profileContent === null
        ? { profile: 'default' as const }
        : parseSatoriRepoConfig(
            profileContent.toString('utf8'),
            path.join(canonicalRoot, SATORI_REPO_CONFIG_FILENAME),
        );
    const fileBasedIgnorePatterns = ['.satoriignore', '.gitignore']
        .flatMap((name) => {
            const content = byName.get(name as IndexPolicyControlFileName) ?? null;
            return content === null ? [] : parseIgnorePatterns(content.toString('utf8'));
        });

    return {
        profileConfig,
        fileBasedIgnorePatterns,
        controlSignature: buildControlSignature(files),
    };
}
