import type { SearchGroupResult } from "./search-types.js";
import type { SearchOrderAuthority } from "./search-order-policy.js";

export function isDeclarationSearchGroup(group: SearchGroupResult): boolean {
    const label = group.displayLabel.trim().toLowerCase();
    if (/^(?:async\s+)?(?:class|type|interface|enum|struct|function|method|def)\b/.test(label)) {
        return true;
    }
    if (/^(const|let|var)\s+[a-z0-9_$]+\s*=/.test(label)) {
        return true;
    }

    const previewStart = (group.preview || "").slice(0, 240).toLowerCase();
    return /\b(class|type|interface|enum|struct|function|def)\s+[a-z0-9_]/i.test(previewStart)
        || /\b(?:const|let|var)\s+[a-z0-9_$]+\s*=\s*(?:async\s+)?function\b/i.test(previewStart)
        || /\b(?:const|let|var)\s+[a-z0-9_$]+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-z_$][\w$]*)\s*=>/i.test(previewStart);
}

function normalizeDeclarationGroupKey(group: SearchGroupResult): string | null {
    if (!group.target.file || !group.displayLabel) {
        return null;
    }
    if (!isDeclarationSearchGroup(group)) {
        return null;
    }

    const normalizedLabel = group.displayLabel
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    const ownerIdentity = group.__symbolKey || group.__symbolInstanceId;
    return ownerIdentity
        ? `${group.target.file}::${normalizedLabel}::${ownerIdentity}`
        : `${group.target.file}::${normalizedLabel}`;
}

function compareAuthoritativeRanks(a: SearchGroupResult, b: SearchGroupResult): number {
    const left = a.__authoritativeRank ?? Number.POSITIVE_INFINITY;
    const right = b.__authoritativeRank ?? Number.POSITIVE_INFINITY;
    return left - right;
}

export function sortNativeGroupedSearchResults<
    T extends SearchGroupResult & { __exactLexicalMatch: boolean },
>(results: T[], exactMatchPinningEnabled: boolean): boolean {
    const topWithoutPinning = results[0];
    results.sort((a, b) => {
        if (exactMatchPinningEnabled && a.__exactLexicalMatch !== b.__exactLexicalMatch) {
            return a.__exactLexicalMatch ? -1 : 1;
        }
        return compareAuthoritativeRanks(a, b);
    });
    const applied = Boolean(
        exactMatchPinningEnabled
        && topWithoutPinning
        && results.length > 0
        && topWithoutPinning.__exactLexicalMatch !== results[0].__exactLexicalMatch,
    );
    if (applied && results[0].debug?.provenance) {
        results[0].debug.provenance.exactMatchPinned = true;
    }
    return applied;
}

export function collapseDuplicateDeclarationGroups<T extends SearchGroupResult>(
    groups: T[],
    orderAuthority: SearchOrderAuthority = "retrieval_order",
): T[] {
    const deduped = new Map<string, T>();
    for (const group of groups) {
        const key = normalizeDeclarationGroupKey(group);
        if (!key) {
            deduped.set(`unique:${deduped.size}`, group);
            continue;
        }

        const existing = deduped.get(key);
        if (!existing) {
            deduped.set(key, group);
            continue;
        }

        const candidateIds = Array.from(new Set([
            ...existing.__candidateIds,
            ...group.__candidateIds,
        ])).sort();
        const winner = compareAuthoritativeRanks(group, existing) < 0 ? group : existing;
        deduped.set(key, { ...winner, __candidateIds: candidateIds });
    }

    return Array.from(deduped.values());
}
