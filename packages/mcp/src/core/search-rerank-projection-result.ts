import type { SearchCandidateRole } from "./search-rerank-context.js";

export type SearchRerankStructuralContextStatus = "available" | "unavailable" | "incompatible";

export type SearchRerankProjectionFailureReason =
    | "generation_receipt_missing"
    | "navigation_status_invalid"
    | "registry_load_failed"
    | "registry_manifest_mismatch"
    | "owner_not_found"
    | "candidate_span_invalid"
    | "source_unavailable"
    | "source_hash_mismatch"
    | "projection_contract_failed";

export type SearchRerankProjectionResult =
    | Readonly<{
        ok: true;
        document: string;
        utf8Bytes: number;
        sha256: string;
        candidateRole: SearchCandidateRole;
        projectionIdentity: string;
        structuralContextStatus?: SearchRerankStructuralContextStatus;
    }>
    | Readonly<{
        ok: false;
        candidateId: string;
        reason: SearchRerankProjectionFailureReason;
    }>;
