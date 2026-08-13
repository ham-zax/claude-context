/**
 * Inert historical contract evidence (Phase 9.2B; frozen in the 9.2 review repair).
 *
 * The frozen rerank request contract serializes a V3 document projection and
 * the V3 source-selection policy. Production search must never execute these;
 * they exist only so the current contract identity (`contractSha256` in
 * `assets/lateon/rerank-request-contract-v1.json`) stays byte-identical.
 * `SEARCH_RERANK_DOCUMENT_V3_CONTRACT_EVIDENCE` is a frozen literal captured from
 * the committed contract asset; nothing regenerates it from executable code.
 * Nothing outside `search-rerank-request-contract.ts` may import this module.
 */

export const SEARCH_RERANK_DOCUMENT_V3_POLICY_EVIDENCE = Object.freeze({
    id: "search_rerank_document_v3",
    previousVersion: "search_rerank_document_v2",
    maximumUtf8Bytes: 4_000,
    serialization: "canonical_json_utf8",
    serializedKeyOrder: "lexicographic_recursive_canonical_json_v1",
    addedField: "candidate_role",
});

/**
 * Frozen V3 document projection bytes for the contract document fixture
 * (`src/core/veto.ts`), captured verbatim from the committed contract asset.
 */
export const SEARCH_RERANK_DOCUMENT_V3_CONTRACT_EVIDENCE =
    "{\"candidate_role\":\"implementation\",\"canonical_symbol_label\":\"validate_order\",\"documentation_excerpt\":\"\",\"language\":\"typescript\",\"query_relevant_source_excerpt\":\"function validate_order(order) {\\n    return check_shariah_compliance(order);\\n}\",\"repository_relative_path\":\"src/core/veto.ts\",\"required_owner_siblings\":[],\"signature_or_declaration\":\"function validate_order(order) {\",\"symbol_kind\":\"function\"}";
