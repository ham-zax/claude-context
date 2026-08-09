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
    if (!relative || relative === ".") {
        return null;
    }
    if (
        relative === ".."
        || relative.startsWith(`..${path.sep}`)
        || path.isAbsolute(relative)
    ) {
        throw new RangeError("Requested search path must remain within indexed root.");
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
    const raw = String(relativePath || "");
    if (path.posix.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
        return false;
    }
    const normalized = raw.replace(/\\/g, "/");
    return normalized === requested.relativePrefix
        || normalized.startsWith(`${requested.relativePrefix}/`);
}
