import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';
import { envManager } from '../utils/env-manager';
import {
    openRegularFileInsideRootNoFollow,
    readFileHandleExactly,
    verifyStableFileObservation,
} from '../sync/root-bound-fs';

type IgnoreMatcher = ReturnType<typeof ignore>;

type IgnoreRuleServiceConfig = Readonly<{
    canonicalizeCodebasePath: (codebasePath: string) => string;
    setFileBasedPatternsForCodebase: (
        codebasePath: string,
        patterns: string[],
    ) => void;
    getActiveIgnorePatterns: (codebasePath: string) => string[];
    getIgnoreMatcherForCodebase: (codebasePath: string) => IgnoreMatcher;
}>;

export function parseIgnorePatterns(content: string): string[] {
    return content
        .split('\n')
        .map((line) => line.endsWith('\r') ? line.slice(0, -1) : line)
        .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export async function readIgnorePatternsFile(filePath: string): Promise<string[]> {
    try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        return parseIgnorePatterns(content);
    } catch (error) {
        console.warn(`[Context] ⚠️  Could not read ignore file ${filePath}: ${error}`);
        return [];
    }
}

export function getCustomExtensionsFromEnvironment(): string[] {
    const configured = envManager.get('CUSTOM_EXTENSIONS');
    if (!configured) return [];
    try {
        return configured
            .split(',')
            .map((extension) => extension.trim())
            .filter((extension) => extension.length > 0)
            .map((extension) => (
                extension.startsWith('.') ? extension : `.${extension}`
            ));
    } catch (error) {
        console.warn(`[Context] ⚠️  Failed to parse CUSTOM_EXTENSIONS: ${error}`);
        return [];
    }
}

export function getCustomIgnorePatternsFromEnvironment(): string[] {
    const configured = envManager.get('CUSTOM_IGNORE_PATTERNS');
    if (!configured) return [];
    try {
        return configured
            .split(',')
            .map((pattern) => pattern.trim())
            .filter((pattern) => pattern.length > 0);
    } catch (error) {
        console.warn(`[Context] ⚠️  Failed to parse CUSTOM_IGNORE_PATTERNS: ${error}`);
        return [];
    }
}

export class IgnoreRuleService {
    private readonly canonicalizeCodebasePath: (
        codebasePath: string,
    ) => string;
    private readonly setFileBasedPatternsForCodebase: (
        codebasePath: string,
        patterns: string[],
    ) => void;
    private readonly getActiveIgnorePatterns: (
        codebasePath: string,
    ) => string[];
    private readonly getIgnoreMatcherForCodebase: (
        codebasePath: string,
    ) => IgnoreMatcher;

    constructor(config: IgnoreRuleServiceConfig) {
        this.canonicalizeCodebasePath = config.canonicalizeCodebasePath;
        this.setFileBasedPatternsForCodebase = config.setFileBasedPatternsForCodebase;
        this.getActiveIgnorePatterns = config.getActiveIgnorePatterns;
        this.getIgnoreMatcherForCodebase = config.getIgnoreMatcherForCodebase;
    }

    async loadIgnorePatterns(codebasePath: string): Promise<void> {
        try {
            const ignoreFiles = await this.findIgnoreFiles(codebasePath);
            const fileBasedPatterns: string[] = [];
            for (const ignoreFile of ignoreFiles) {
                fileBasedPatterns.push(...await this.loadIgnoreFile(
                    ignoreFile,
                    path.basename(ignoreFile),
                    codebasePath,
                ));
            }
            this.setFileBasedPatternsForCodebase(codebasePath, fileBasedPatterns);
            if (fileBasedPatterns.length > 0) {
                console.log(
                    `[Context] 🚫 Loaded total ${fileBasedPatterns.length} ignore patterns from supported root ignore files`,
                );
            } else {
                console.log(
                    '📄 No ignore files found; effective rules reset to base + runtime custom',
                );
            }
        } catch (error) {
            console.warn(`[Context] ⚠️ Failed to load ignore patterns: ${error}`);
            // Existing patterns remain authoritative when observation fails.
        }
    }

    matchesIgnorePattern(
        filePath: string,
        codebasePath: string,
        isDirectory: boolean = false,
        matcherOverride?: IgnoreMatcher,
    ): boolean {
        if (
            !matcherOverride
            && this.getActiveIgnorePatterns(codebasePath).length === 0
        ) {
            return false;
        }
        const relativePath = path.relative(codebasePath, filePath)
            .replace(/\\/g, '/')
            .replace(/^\/+/, '');
        if (!relativePath || relativePath.startsWith('..')) return false;
        const matcher = matcherOverride
            ?? this.getIgnoreMatcherForCodebase(codebasePath);
        if (isDirectory) {
            const withSlash = relativePath.endsWith('/')
                ? relativePath
                : `${relativePath}/`;
            return matcher.ignores(relativePath) || matcher.ignores(withSlash);
        }
        return matcher.ignores(relativePath);
    }

    async findIgnoreFiles(codebasePath: string): Promise<string[]> {
        const ignoreFiles: string[] = [];
        for (const fileName of ['.satoriignore', '.gitignore']) {
            const absolutePath = path.join(codebasePath, fileName);
            try {
                const stat = await fs.promises.lstat(absolutePath);
                if (stat.isSymbolicLink()) {
                    throw new Error(
                        `Ignore file '${fileName}' must not be a symbolic link.`,
                    );
                }
                if (!stat.isFile()) {
                    throw new Error(`Ignore file '${fileName}' is not a regular file.`);
                }
                ignoreFiles.push(absolutePath);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
                throw error;
            }
        }
        if (ignoreFiles.length > 0) {
            console.log(
                `📄 Found ${ignoreFiles.length} supported root ignore file(s).`,
            );
        }
        return ignoreFiles;
    }

    async loadIgnoreFile(
        filePath: string,
        fileName: string,
        codebasePath: string,
    ): Promise<string[]> {
        const canonicalRoot = this.canonicalizeCodebasePath(codebasePath);
        const handle = await openRegularFileInsideRootNoFollow(
            filePath,
            canonicalRoot,
        );
        let content: string;
        try {
            const stat = await handle.stat();
            const maximumIgnoreFileBytes = 1_048_576;
            if (stat.size > maximumIgnoreFileBytes) {
                throw new Error(
                    `${fileName} exceeds the ${maximumIgnoreFileBytes}-byte policy limit.`,
                );
            }
            content = (await readFileHandleExactly(handle, stat.size)).toString('utf8');
            await verifyStableFileObservation(handle, filePath, canonicalRoot, stat, {
                rejectFinalSymlink: true,
            });
        } finally {
            await handle.close().catch(() => undefined);
        }
        const patterns = parseIgnorePatterns(content);
        if (patterns.length > 0) {
            console.log(
                `[Context] 🚫 Loaded ${patterns.length} ignore patterns from ${fileName}`,
            );
            return patterns;
        }
        console.log(`📄 ${fileName} file found but no valid patterns detected`);
        return [];
    }
}
