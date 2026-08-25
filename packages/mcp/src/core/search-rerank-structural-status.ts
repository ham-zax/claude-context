import type { SearchRerankStructuralContextStatus } from "./search-rerank-projection-result.js";

/**
 * Resolve optional structural-enrichment authority without weakening the
 * source/symbol publication. Missing support is unavailable; an explicit
 * incompatibility or manifest mismatch is an integrity degradation.
 */
export function resolveSearchRerankStructuralContextStatus(input: {
    relationshipStatus: string;
}): SearchRerankStructuralContextStatus {
    if (input.relationshipStatus === "incompatible") return "incompatible";
    return input.relationshipStatus === "ok" ? "available" : "unavailable";
}
