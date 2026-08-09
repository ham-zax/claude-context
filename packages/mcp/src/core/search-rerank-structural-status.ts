import type { SearchRerankStructuralContextStatus } from "./search-rerank-projection-result.js";

/**
 * Resolve optional structural-enrichment authority without weakening the
 * source/symbol publication. Missing support is unavailable; an explicit
 * incompatibility or manifest mismatch is an integrity degradation.
 */
export function resolveSearchRerankStructuralContextStatus(input: {
    relationshipStatus: string;
    relationshipManifestHash?: string;
    expectedRelationshipManifestHash: string;
}): SearchRerankStructuralContextStatus {
    if (input.relationshipStatus === "incompatible") return "incompatible";
    if (input.relationshipStatus !== "ok") return "unavailable";
    return input.relationshipManifestHash === input.expectedRelationshipManifestHash
        ? "available"
        : "incompatible";
}
