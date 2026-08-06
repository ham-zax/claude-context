import type { ValidatedRerankResponseV1 } from './rerank-evidence.js';

export interface RerankEvidenceRetentionV1 {
    schemaVersion: 'search_rerank_evidence_retention_v1';
    queryId: string;
    response: ValidatedRerankResponseV1;
    retainedAt: string;
}

export interface RerankEvidenceRetentionInput {
    queryId: string;
    response: ValidatedRerankResponseV1;
    retainedAt: string;
}

/**
 * B3: retain exactly one complete raw validated provider response per query.
 * The raw authority (candidate order + finite raw scores) is kept byte-for-byte;
 * no derived fields (percentiles, margins, normalized scores) are ever stored —
 * D7 derives those exclusively during E2/H4 (plan §4.4, §6.3).
 */
export function retainValidatedRerankResponseV1(
    input: RerankEvidenceRetentionInput,
): RerankEvidenceRetentionV1 {
    if (typeof input.queryId !== 'string' || input.queryId.length === 0) {
        throw new Error('queryId must be non-empty.');
    }
    if (typeof input.retainedAt !== 'string' || input.retainedAt.length === 0) {
        throw new Error('retainedAt must be non-empty.');
    }
    const response = input.response;
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
        throw new Error('Retention requires a validated rerank response object.');
    }
    if (response.schemaVersion !== 'validated_rerank_response_v1') {
        throw new Error('Retention requires the validated_rerank_response_v1 schema.');
    }
    if (!Array.isArray(response.orderedCandidates) || response.orderedCandidates.length === 0) {
        throw new Error('Retention requires a complete non-empty candidate response.');
    }
    for (const candidate of response.orderedCandidates) {
        if (typeof candidate.rawScore !== 'number' || !Number.isFinite(candidate.rawScore)) {
            throw new Error('Retention requires finite raw scores.');
        }
    }
    // Deep-clone so the retained record is immutable against later caller mutation.
    const cloned = structuredClone(response) as ValidatedRerankResponseV1;
    return {
        schemaVersion: 'search_rerank_evidence_retention_v1',
        queryId: input.queryId,
        response: cloned,
        retainedAt: input.retainedAt,
    };
}
