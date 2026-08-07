import assert from "node:assert/strict";
import test from "node:test";
import {
    SEARCH_LEGACY_RANKING_POLICY_ID,
    SEARCH_NATIVE_RERANKER_ORDER_POLICY_ID,
    SEARCH_NATIVE_RETRIEVAL_ORDER_POLICY_ID,
    resolveSearchRankingPolicyIdentity,
} from "./search-order-policy.js";

test("ranking policy identity distinguishes legacy, retrieval, and provider order", () => {
    assert.equal(
        resolveSearchRankingPolicyIdentity({
            orderAuthority: "legacy_score",
            rerankApplicationMode: "legacy_rrf",
        }),
        SEARCH_LEGACY_RANKING_POLICY_ID,
    );
    assert.equal(
        resolveSearchRankingPolicyIdentity({
            orderAuthority: "retrieval_order",
            rerankApplicationMode: "native_order",
        }),
        SEARCH_NATIVE_RETRIEVAL_ORDER_POLICY_ID,
    );
    assert.equal(
        resolveSearchRankingPolicyIdentity({
            orderAuthority: "reranker_order",
            rerankApplicationMode: "native_order",
        }),
        SEARCH_NATIVE_RERANKER_ORDER_POLICY_ID,
    );
});
