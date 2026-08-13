/**
 * Phase 9.2D — query projection routing.
 *
 * One executable query projection (`search_rerank_query_v2`) plus the raw
 * fallback identity (`semantic_query_raw_v1`). The historical v1 projection is
 * retired; its frozen fixture bytes survive only as inert contract evidence in
 * `search-rerank-request-contract.ts`.
 */
import { SEARCH_RERANK_QUERY_PROJECTION_IDENTITY } from "./search-rerank-query.js";

export const SEARCH_RERANK_QUERY_RAW_IDENTITY = "semantic_query_raw_v1" as const;

export type SearchRerankQueryProjectionIdentity =
    | typeof SEARCH_RERANK_QUERY_RAW_IDENTITY
    | typeof SEARCH_RERANK_QUERY_PROJECTION_IDENTITY;

export function resolveSearchRerankQuery(input: {
    semanticQuery: string;
    focusedQueryV2?: string;
    projectionIdentity: string | undefined;
}): Readonly<{
    query: string;
    queryProjectionIdentity: SearchRerankQueryProjectionIdentity;
}> {
    const identity = input.projectionIdentity?.trim();
    if (!identity || identity === SEARCH_RERANK_QUERY_RAW_IDENTITY) {
        return {
            query: input.semanticQuery,
            queryProjectionIdentity: SEARCH_RERANK_QUERY_RAW_IDENTITY,
        };
    }
    if (identity === SEARCH_RERANK_QUERY_PROJECTION_IDENTITY) {
        if (typeof input.focusedQueryV2 !== "string" || input.focusedQueryV2.trim().length === 0) {
            throw new Error("search_rerank_query_v2_projection_unavailable");
        }
        return {
            query: input.focusedQueryV2,
            queryProjectionIdentity: SEARCH_RERANK_QUERY_PROJECTION_IDENTITY,
        };
    }
    throw new Error(`search_rerank_query_projection_identity_unknown:${identity}`);
}
