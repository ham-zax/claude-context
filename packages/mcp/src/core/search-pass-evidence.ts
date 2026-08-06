export interface SearchPassContributionV1 {
    passId: string;
    rank: number;
    rrfK: number;
    weight: number;
    contribution: number;
}
export interface SearchPassEvidenceV1 {
    schemaVersion: 'search_pass_evidence_v1';
    candidateId: string;
    contributions: SearchPassContributionV1[];
    totalContribution: number;
}
function text(value: string, label: string): string { if (!value) throw new Error(`${label} must be non-empty.`); return value; }
function positive(value: number, label: string): number { if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer.`); return value; }
function finite(value: number, label: string): number { if (!Number.isFinite(value)) throw new Error(`${label} must be finite.`); return value; }
export function buildSearchPassEvidenceV1(input: {
    candidateId: string;
    passes: readonly { passId: string; rank: number; rrfK: number; weight?: number }[];
}): SearchPassEvidenceV1 {
    const seen = new Set<string>();
    const contributions = [...input.passes].map((pass) => {
        const passId = text(pass.passId, 'passId');
        if (seen.has(passId)) throw new Error(`Duplicate passId '${passId}'.`);
        seen.add(passId);
        const rank = positive(pass.rank, 'rank');
        const rrfK = finite(pass.rrfK, 'rrfK');
        if (rrfK <= 0) throw new Error('rrfK must be positive.');
        const weight = pass.weight === undefined ? 1 : positive(pass.weight, 'weight');
        // Mirrors the execution fusion delta passWeight * (1 / (K + rank))
        // so the evidence sum is the exact deterministic fusion contribution.
        return { passId, rank, rrfK, weight, contribution: weight * (1 / (rrfK + rank)) };
    }).sort((left, right) => left.passId.localeCompare(right.passId));
    const totalContribution = contributions.reduce((sum, item) => sum + item.contribution, 0);
    return { schemaVersion: 'search_pass_evidence_v1', candidateId: text(input.candidateId, 'candidateId'), contributions, totalContribution };
}
