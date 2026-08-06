export interface SemanticSearchCandidateTraceV2Like {
    schemaVersion: 'semantic_search_candidate_trace_v2';
    candidateId: string;
    rawDenseRank: number | null;
    rawLexicalRank: number | null;
    rawFallbackLexicalRank: number | null;
    coreFusionRank: number | null;
}

export interface DeterministicRankingEvidenceV1 {
    schemaVersion: 'deterministic_ranking_evidence_v1';
    evidenceStage: 'post_admission_pre_residual';
    queryId: string;
    candidateId: string;
    baselineScore: number;
    admissionRank: number;
    candidateTrace: SemanticSearchCandidateTraceV2Like;
    retrievalPasses: string[];
    rrfContributions: Array<{ passId: string; contribution: number }>;
}

const KEYS = ['schemaVersion','evidenceStage','queryId','candidateId','baselineScore','admissionRank','candidateTrace','retrievalPasses','rrfContributions'].sort();
const TRACE_KEYS = ['schemaVersion','candidateId','rawDenseRank','rawLexicalRank','rawFallbackLexicalRank','coreFusionRank'].sort();

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, expected: string[], label: string): void {
    const keys = Object.keys(value).sort();
    if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
        throw new Error(`${label} must contain exact keys; unknown fields are forbidden.`);
    }
}
function positiveRank(value: unknown, label: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`${label} must be a positive safe integer.`);
    return value as number;
}
function nullableRank(value: unknown, label: string): number | null {
    return value === null ? null : positiveRank(value, label);
}
function finite(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite.`);
    return value;
}
function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be non-empty.`);
    return value;
}

export function parseDeterministicRankingEvidenceV1(value: unknown): DeterministicRankingEvidenceV1 {
    const input = record(value, 'DeterministicRankingEvidenceV1');
    exact(input, KEYS, 'DeterministicRankingEvidenceV1');
    if (input.schemaVersion !== 'deterministic_ranking_evidence_v1') throw new Error('Evidence schema mismatch.');
    if (input.evidenceStage !== 'post_admission_pre_residual') throw new Error('Evidence must be assembled only at post-admission pre-residual stage.');
    const candidateId = text(input.candidateId, 'candidateId');
    const trace = record(input.candidateTrace, 'candidateTrace');
    exact(trace, TRACE_KEYS, 'candidateTrace');
    if (trace.schemaVersion !== 'semantic_search_candidate_trace_v2') throw new Error('candidateTrace schema mismatch.');
    if (trace.candidateId !== candidateId) throw new Error('candidateTrace candidateId mismatch.');
    if (!Array.isArray(input.retrievalPasses) || input.retrievalPasses.some((item) => typeof item !== 'string' || item.length === 0)) throw new Error('retrievalPasses must be non-empty strings.');
    if (new Set(input.retrievalPasses).size !== input.retrievalPasses.length) throw new Error('retrievalPasses contains duplicates.');
    if (!Array.isArray(input.rrfContributions)) throw new Error('rrfContributions must be an array.');
    const rrfContributions = input.rrfContributions.map((item) => {
        const contribution = record(item, 'rrf contribution');
        exact(contribution, ['contribution','passId'], 'rrf contribution');
        return { passId: text(contribution.passId, 'passId'), contribution: finite(contribution.contribution, 'contribution') };
    });
    return {
        schemaVersion: 'deterministic_ranking_evidence_v1',
        evidenceStage: 'post_admission_pre_residual',
        queryId: text(input.queryId, 'queryId'),
        candidateId,
        baselineScore: finite(input.baselineScore, 'baselineScore'),
        admissionRank: positiveRank(input.admissionRank, 'admissionRank'),
        candidateTrace: {
            schemaVersion: 'semantic_search_candidate_trace_v2',
            candidateId,
            rawDenseRank: nullableRank(trace.rawDenseRank, 'rawDenseRank'),
            rawLexicalRank: nullableRank(trace.rawLexicalRank, 'rawLexicalRank'),
            rawFallbackLexicalRank: nullableRank(trace.rawFallbackLexicalRank, 'rawFallbackLexicalRank'),
            coreFusionRank: nullableRank(trace.coreFusionRank, 'coreFusionRank'),
        },
        retrievalPasses: [...input.retrievalPasses] as string[],
        rrfContributions,
    };
}
