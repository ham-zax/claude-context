export interface ValidatedRerankResponseV1 {
    schemaVersion: 'validated_rerank_response_v1';
    orderedCandidates: Array<{ candidateId: string; rawScore: number }>;
}

function assertExactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
    const actual = Object.keys(value).sort();
    const sorted = [...expected].sort();
    if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
        throw new Error(`${label} must contain exact keys.`);
    }
}

export function parseValidatedRerankResponseV1(value: unknown, expectedCandidateIds: readonly string[]): ValidatedRerankResponseV1 {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ValidatedRerankResponseV1 must be an object.');
    const input = value as Record<string, unknown>;
    assertExactKeys(input, ['schemaVersion','orderedCandidates'], 'ValidatedRerankResponseV1');
    if (input.schemaVersion !== 'validated_rerank_response_v1') throw new Error('ValidatedRerankResponseV1 schema mismatch.');
    if (!Array.isArray(input.orderedCandidates)) throw new Error('orderedCandidates must be an array.');
    if (new Set(expectedCandidateIds).size !== expectedCandidateIds.length) throw new Error('Expected candidate IDs contain duplicates.');
    if (input.orderedCandidates.length !== expectedCandidateIds.length) throw new Error('Provider response must be a complete permutation; candidates are missing.');
    const expected = new Set(expectedCandidateIds);
    const seen = new Set<string>();
    const orderedCandidates = input.orderedCandidates.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Provider candidate must be an object.');
        const candidate = item as Record<string, unknown>;
        assertExactKeys(candidate, ['candidateId','rawScore'], 'Provider candidate');
        if (typeof candidate.candidateId !== 'string' || candidate.candidateId.length === 0) throw new Error('candidateId must be non-empty.');
        if (!expected.has(candidate.candidateId)) throw new Error(`Foreign provider candidate '${candidate.candidateId}'.`);
        if (seen.has(candidate.candidateId)) throw new Error(`Duplicate provider candidate '${candidate.candidateId}'.`);
        if (typeof candidate.rawScore !== 'number' || !Number.isFinite(candidate.rawScore)) throw new Error('Provider rawScore must be finite.');
        seen.add(candidate.candidateId);
        return { candidateId: candidate.candidateId, rawScore: candidate.rawScore };
    });
    if (seen.size !== expected.size) throw new Error('Provider response is incomplete.');
    return { schemaVersion: 'validated_rerank_response_v1', orderedCandidates };
}
