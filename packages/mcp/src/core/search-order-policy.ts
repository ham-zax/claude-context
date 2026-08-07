export const SEARCH_LEGACY_RANKING_POLICY_ID = "search_candidate_final_score_v2";
export const SEARCH_NATIVE_RETRIEVAL_ORDER_POLICY_ID = "search_native_retrieval_order_v1";
export const SEARCH_NATIVE_RERANKER_ORDER_POLICY_ID = "search_native_reranker_order_v1";

export type SearchOrderAuthority = "legacy_score" | "retrieval_order" | "reranker_order";
export type SearchRerankApplicationMode = "legacy_rrf" | "native_order";

export function resolveSearchRankingPolicyIdentity(input: {
    orderAuthority: SearchOrderAuthority;
    rerankApplicationMode: SearchRerankApplicationMode;
}): string {
    if (input.rerankApplicationMode === "legacy_rrf") {
        return SEARCH_LEGACY_RANKING_POLICY_ID;
    }
    return input.orderAuthority === "reranker_order"
        ? SEARCH_NATIVE_RERANKER_ORDER_POLICY_ID
        : SEARCH_NATIVE_RETRIEVAL_ORDER_POLICY_ID;
}

