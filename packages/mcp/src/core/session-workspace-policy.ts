import fs from "node:fs";
import path from "node:path";

/**
 * Canonical workspace authorization for one MCP session.
 *
 * The policy is immutable: roots are fixed at construction from launcher
 * configuration and cannot be expanded by tool arguments or by mutating the
 * exposed `roots` array. Authorization is canonical separator-boundary
 * containment of real paths, never string-prefix containment.
 */

export type WorkspaceAuthorizationCode =
    | "ROOT_NOT_AUTHORIZED"
    | "BROAD_ROOT_NOT_ALLOWED"
    | "INVALID_WORKSPACE_ROOT"
    | "WORKSPACE_POLICY_NOT_BOUND";

export class WorkspaceAuthorizationError extends Error {
    readonly code: WorkspaceAuthorizationCode;

    constructor(code: WorkspaceAuthorizationCode, message: string) {
        super(message);
        this.name = "WorkspaceAuthorizationError";
        this.code = code;
    }
}

export type AuthorizedWorkspacePath = Readonly<{
    workspaceRoot: string;
    canonicalPath: string;
    relativePath: string;
}>;

export interface SessionWorkspacePolicy {
    readonly roots: readonly string[];
    authorizeRoot(candidateRoot: string): AuthorizedWorkspacePath;
    authorizePath(candidatePath: string): AuthorizedWorkspacePath;
}

/**
 * Resolve to an absolute path and, when the target exists, its real path
 * (follows symlinks). For non-existent paths, resolve the deepest existing
 * ancestor and re-append the missing suffix, so a symlinked prefix cannot
 * smuggle a not-yet-existing path outside the root. Non-existent paths with
 * no resolvable ancestor keep path.resolve output so `..` segments are still
 * collapsed.
 */
function canonicalizePath(inputPath: string): string {
    const resolved = path.resolve(inputPath);
    try {
        return fs.realpathSync.native(resolved);
    } catch {
        const missingParts: string[] = [];
        let current = resolved;
        for (;;) {
            try {
                const real = fs.realpathSync.native(current);
                if (missingParts.length === 0) {
                    return real;
                }
                return path.join(real, ...missingParts.reverse());
            } catch {
                const parent = path.dirname(current);
                if (parent === current) {
                    return resolved;
                }
                missingParts.push(path.basename(current));
                current = parent;
            }
        }
    }
}

/**
 * Separator-boundary containment of a canonical path inside a canonical root.
 * Never a string-prefix match: `/repo` does not contain `/repo-other`.
 */
function isPathInsideRoot(canonicalPath: string, canonicalRoot: string): boolean {
    if (canonicalRoot === path.sep) {
        return canonicalPath.startsWith(path.sep);
    }
    return canonicalPath === canonicalRoot || canonicalPath.startsWith(`${canonicalRoot}${path.sep}`);
}

function normalizeRelativePath(value: string): string {
    return value.replace(/\\/g, "/");
}

export function createSessionWorkspacePolicy(input: {
    roots: readonly string[];
    homeDirectory: string;
    stateRoot: string;
    allowBroadRoots?: boolean;
}): SessionWorkspacePolicy {
    const allowBroadRoots = input.allowBroadRoots === true;

    const canonicalRoots: string[] = [];
    for (const root of input.roots) {
        if (typeof root !== "string" || !path.isAbsolute(root)) {
            throw new WorkspaceAuthorizationError(
                "INVALID_WORKSPACE_ROOT",
                `Workspace roots must be absolute paths; rejected root: ${String(root)}`,
            );
        }
        canonicalRoots.push(canonicalizePath(root));
    }

    const canonicalHome = canonicalizePath(input.homeDirectory);
    const canonicalStateRoot = canonicalizePath(input.stateRoot);

    const isBroadPath = (canonicalPath: string): boolean =>
        canonicalPath === path.sep
        || canonicalPath === canonicalHome
        || canonicalPath === canonicalStateRoot;

    if (!allowBroadRoots) {
        for (const root of canonicalRoots) {
            if (isBroadPath(root)) {
                throw new WorkspaceAuthorizationError(
                    "BROAD_ROOT_NOT_ALLOWED",
                    `Broad workspace root is not allowed without allowBroadRoots: ${root}`,
                );
            }
        }
    }

    // Reduce duplicate and nested roots to the narrowest set that expresses
    // the same authority: a root contained in another root adds nothing.
    const reducedRoots: string[] = [];
    const sorted = [...canonicalRoots].sort((a, b) => a.length - b.length);
    for (const root of sorted) {
        if (reducedRoots.some((kept) => isPathInsideRoot(root, kept))) {
            continue;
        }
        reducedRoots.push(root);
    }
    const roots = Object.freeze(reducedRoots);

    const authorize = (candidate: string): AuthorizedWorkspacePath => {
        if (typeof candidate !== "string" || !path.isAbsolute(candidate)) {
            throw new WorkspaceAuthorizationError(
                "INVALID_WORKSPACE_ROOT",
                `Authorization candidates must be absolute paths; rejected candidate: ${String(candidate)}`,
            );
        }
        const canonicalPath = canonicalizePath(candidate);
        if (!allowBroadRoots && isBroadPath(canonicalPath)) {
            throw new WorkspaceAuthorizationError(
                "BROAD_ROOT_NOT_ALLOWED",
                `Broad path is not authorized: ${canonicalPath}`,
            );
        }
        for (const root of roots) {
            if (isPathInsideRoot(canonicalPath, root)) {
                return Object.freeze({
                    workspaceRoot: root,
                    canonicalPath,
                    relativePath: normalizeRelativePath(path.relative(root, canonicalPath)),
                });
            }
        }
        throw new WorkspaceAuthorizationError(
            "ROOT_NOT_AUTHORIZED",
            `Path is not inside any authorized workspace root: ${canonicalPath}`,
        );
    };

    return Object.freeze({
        roots,
        authorizeRoot: (candidateRoot: string): AuthorizedWorkspacePath => authorize(candidateRoot),
        authorizePath: (candidatePath: string): AuthorizedWorkspacePath => authorize(candidatePath),
    });
}
