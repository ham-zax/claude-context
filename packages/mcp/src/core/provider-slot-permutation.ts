export interface RankedCandidateV3 {
    candidateId: string;
    deterministicV3Score: number;
    postPolicyRank: number;
}

export interface ProviderSlotPermutationInput {
    deterministicOrder: readonly RankedCandidateV3[];
    baselineAdmissionIds: readonly string[];
    providerOrder: readonly string[];
}

function finite(value: number, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${label} must be finite.`);
    }
    return value;
}

/**
 * D7: the provider-derived slot permutation (plan §4.3, §4.4). The provider
 * order must be a complete permutation of the baseline-admitted identities;
 * duplicates, omissions, foreign IDs, and rank gaps are rejected, never
 * repaired. The emitted one-based postPolicyRank values are contiguous and
 * agree with array position (position i carries postPolicyRank i+1). The
 * authoritative ordered array is the final ranking authority — no downstream
 * component may re-sort by score.
 */
export function applyProviderSlotPermutation(
    input: ProviderSlotPermutationInput,
): RankedCandidateV3[] {
    if (!Array.isArray(input.deterministicOrder) || input.deterministicOrder.length === 0) {
        throw new Error('Deterministic order must be a non-empty array.');
    }
    if (!Array.isArray(input.baselineAdmissionIds) || input.baselineAdmissionIds.length === 0) {
        throw new Error('Baseline admission set must be non-empty.');
    }
    if (input.deterministicOrder.length !== input.baselineAdmissionIds.length) {
        throw new Error('Deterministic order and admission set sizes disagree.');
    }
    if (input.providerOrder.length !== input.baselineAdmissionIds.length) {
        throw new Error('Provider order must be a complete permutation of the admission set.');
    }

    const admissionIds = new Set(input.baselineAdmissionIds);
    if (admissionIds.size !== input.baselineAdmissionIds.length) {
        throw new Error('Baseline admission set contains duplicates.');
    }
    const byCandidateId = new Map<string, RankedCandidateV3>();
    for (const candidate of input.deterministicOrder) {
        if (typeof candidate.candidateId !== 'string' || candidate.candidateId.length === 0) {
            throw new Error('Deterministic candidate id must be non-empty.');
        }
        finite(candidate.deterministicV3Score, `deterministicV3Score for ${candidate.candidateId}`);
        if (byCandidateId.has(candidate.candidateId)) {
            throw new Error(`Duplicate deterministic candidate '${candidate.candidateId}'.`);
        }
        byCandidateId.set(candidate.candidateId, { ...candidate });
    }
    if (byCandidateId.size !== admissionIds.size) {
        throw new Error('Deterministic order must cover exactly the admission set.');
    }

    const seen = new Set<string>();
    for (const candidateId of input.providerOrder) {
        if (typeof candidateId !== 'string' || candidateId.length === 0) {
            throw new Error('Provider order contains an empty candidate id.');
        }
        if (!admissionIds.has(candidateId)) {
            throw new Error(`Foreign provider candidate '${candidateId}'.`);
        }
        if (seen.has(candidateId)) {
            throw new Error(`Duplicate provider candidate '${candidateId}'.`);
        }
        seen.add(candidateId);
    }
    if (seen.size !== admissionIds.size) {
        throw new Error('Provider order omits admitted candidates.');
    }

    return input.providerOrder.map((candidateId, index) => ({
        candidateId,
        deterministicV3Score: byCandidateId.get(candidateId)!.deterministicV3Score,
        postPolicyRank: index + 1,
    }));
}
