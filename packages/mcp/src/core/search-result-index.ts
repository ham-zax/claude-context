import {
    SEARCH_MAX_RESULT_INDEX_ENTRIES,
    SEARCH_MAX_RESULT_INDEX_UTF8_BYTES,
} from "./search-constants.js";
import type {
    SearchCompactResultIndex,
    SearchGroupedResponseEnvelope,
    SearchGroupedResultV2,
    SearchResultIndexEntry,
    SearchResultIndexEvidenceLabel,
} from "./search-types.js";

export type AttachCompactSearchResultIndexResult =
    | {
        status: "attached";
        envelope: SearchGroupedResponseEnvelope;
        resultIndex: SearchCompactResultIndex;
    }
    | {
        status: "not_admissible";
        envelope: SearchGroupedResponseEnvelope;
    };

function utf8JsonBytes(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function resolveEvidenceLabel(result: SearchGroupedResultV2): SearchResultIndexEvidenceLabel {
    if (result.quality.owner === "high") return "high_owner_confidence";
    if (result.quality.owner === "medium") return "medium_owner_confidence";
    if (result.quality.semantic === "high") return "high_semantic_confidence";
    if (result.quality.semantic === "medium") return "medium_semantic_confidence";
    return "ranked_candidate";
}

function projectEntry(result: SearchGroupedResultV2, index: number): SearchResultIndexEntry {
    const shared = {
        rank: index + 1,
        displayLabel: result.displayLabel,
        evidenceLabel: resolveEvidenceLabel(result),
    };
    if (result.target.symbolId !== undefined) {
        return {
            ...shared,
            kind: "symbol",
            target: {
                file: result.target.file,
                symbolId: result.target.symbolId,
            },
        };
    }
    return {
        ...shared,
        kind: "file",
        target: { file: result.target.file },
    };
}

function buildResultIndex(input: {
    rankedSetDigest: string;
    availableEntryCount: number;
    entries: SearchResultIndexEntry[];
}): SearchCompactResultIndex {
    return {
        contractVersion: "search_result_index_v1",
        rankedSetDigest: input.rankedSetDigest,
        disclosurePolicyVersion: "search_disclosure_v1",
        availableEntryCount: input.availableEntryCount,
        returnedEntryCount: input.entries.length,
        complete: input.entries.length === input.availableEntryCount,
        entries: input.entries,
    };
}

function attachIndex(
    envelope: SearchGroupedResponseEnvelope,
    resultIndex: SearchCompactResultIndex,
): SearchGroupedResponseEnvelope {
    return {
        ...envelope,
        resultIndex,
    };
}

export function attachCompactSearchResultIndex(input: {
    envelope: SearchGroupedResponseEnvelope;
    orderedResults: readonly SearchGroupedResultV2[];
    rankedSetDigest: string;
    maxResponseBytes: number;
}): AttachCompactSearchResultIndexResult {
    if (!Number.isSafeInteger(input.maxResponseBytes) || input.maxResponseBytes <= 0) {
        throw new Error("Search result-index response byte budget must be a positive safe integer.");
    }

    const availableEntryCount = input.orderedResults.length;
    const emptyIndex = buildResultIndex({
        rankedSetDigest: input.rankedSetDigest,
        availableEntryCount,
        entries: [],
    });
    const emptyEnvelope = attachIndex(input.envelope, emptyIndex);
    if (
        utf8JsonBytes(emptyIndex) > SEARCH_MAX_RESULT_INDEX_UTF8_BYTES
        || utf8JsonBytes(emptyEnvelope) > input.maxResponseBytes
    ) {
        return {
            status: "not_admissible",
            envelope: input.envelope,
        };
    }

    let entries: SearchResultIndexEntry[] = [];
    const candidateCount = Math.min(availableEntryCount, SEARCH_MAX_RESULT_INDEX_ENTRIES);
    for (let index = 0; index < candidateCount; index += 1) {
        const result = input.orderedResults[index];
        if (!result) break;
        const candidateEntries = [...entries, projectEntry(result, index)];
        const candidateIndex = buildResultIndex({
            rankedSetDigest: input.rankedSetDigest,
            availableEntryCount,
            entries: candidateEntries,
        });
        if (
            utf8JsonBytes(candidateIndex) > SEARCH_MAX_RESULT_INDEX_UTF8_BYTES
            || utf8JsonBytes(attachIndex(input.envelope, candidateIndex)) > input.maxResponseBytes
        ) {
            break;
        }
        entries = candidateEntries;
    }

    const resultIndex = buildResultIndex({
        rankedSetDigest: input.rankedSetDigest,
        availableEntryCount,
        entries,
    });
    return {
        status: "attached",
        envelope: attachIndex(input.envelope, resultIndex),
        resultIndex,
    };
}
