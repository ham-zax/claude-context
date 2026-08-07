import path from "node:path";

export type RequestedSearchSubdirectory = Readonly<{
    relativePrefix: string; // canonical repo-relative, no trailing slash
}>;

export function resolveRequestedSearchSubdirectory(input: {
    indexedRoot: string;
    requestedPath: string;
}): RequestedSearchSubdirectory | null {
    const indexedRoot = path.resolve(input.indexedRoot);
    const requested = path.resolve(input.requestedPath);
    if (requested === indexedRoot) {
        return null;
    }
    const relative = path.relative(indexedRoot, requested);
    if (!relative || relative === "." || relative.startsWith("..") || path.isAbsolute(relative)) {
        return null;
    }
    const relativePrefix = relative.split(path.sep).join("/").replace(/\/+$/, "");
    if (!relativePrefix) {
        return null;
    }
    return Object.freeze({ relativePrefix });
}

export function candidateWithinRequestedSubdirectory(
    relativePath: string,
    requested: RequestedSearchSubdirectory | null,
): boolean {
    if (!requested) {
        return true;
    }
    const normalized = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
    return normalized === requested.relativePrefix
        || normalized.startsWith(`${requested.relativePrefix}/`);
}
