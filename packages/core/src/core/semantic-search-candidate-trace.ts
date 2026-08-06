export interface SemanticSearchCandidateTraceV2 {
    schemaVersion: 'semantic_search_candidate_trace_v2';
    candidateId: string;
    rawDenseRank: number | null;
    rawLexicalRank: number | null;
    rawFallbackLexicalRank: number | null;
    coreFusionRank: number | null;
}

const TRACE_KEYS = [
    'schemaVersion', 'candidateId', 'rawDenseRank', 'rawLexicalRank',
    'rawFallbackLexicalRank', 'coreFusionRank',
] as const;

function assertExactKeys(value: Record<string, unknown>): void {
    const actual = Object.keys(value).sort();
    const expected = [...TRACE_KEYS].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
        throw new Error(`SemanticSearchCandidateTraceV2 must contain exact keys: ${expected.join(', ')}.`);
    }
}

function parseRank(value: unknown, field: string): number | null {
    if (value === null) return null;
    if (!Number.isSafeInteger(value) || (value as number) < 1) {
        throw new Error(`${field} must be null or a positive safe integer.`);
    }
    return value as number;
}

export function parseSemanticSearchCandidateTraceV2(value: unknown): SemanticSearchCandidateTraceV2 {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('SemanticSearchCandidateTraceV2 must be an object.');
    }
    const record = value as Record<string, unknown>;
    assertExactKeys(record);
    if (record.schemaVersion !== 'semantic_search_candidate_trace_v2') {
        throw new Error('SemanticSearchCandidateTraceV2 schemaVersion mismatch.');
    }
    if (typeof record.candidateId !== 'string' || record.candidateId.length === 0) {
        throw new Error('candidateId must be non-empty.');
    }
    return {
        schemaVersion: record.schemaVersion,
        candidateId: record.candidateId,
        rawDenseRank: parseRank(record.rawDenseRank, 'rawDenseRank'),
        rawLexicalRank: parseRank(record.rawLexicalRank, 'rawLexicalRank'),
        rawFallbackLexicalRank: parseRank(record.rawFallbackLexicalRank, 'rawFallbackLexicalRank'),
        coreFusionRank: parseRank(record.coreFusionRank, 'coreFusionRank'),
    };
}
