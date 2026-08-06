import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyProviderSlotPermutation,
    type RankedCandidateV3,
} from './provider-slot-permutation.js';

function ranked(candidateIds: string[], scores: number[]): RankedCandidateV3[] {
    return candidateIds.map((candidateId, index) => ({
        candidateId,
        deterministicV3Score: scores[index],
        postPolicyRank: index + 1,
    }));
}

test('provider_permutation_is_final_complete_and_rank_contiguous', () => {
    const deterministicOrder = ranked(['a', 'b', 'c'], [10, 8, 5]);
    const result = applyProviderSlotPermutation({
        deterministicOrder,
        baselineAdmissionIds: ['a', 'b', 'c'],
        providerOrder: ['c', 'a', 'b'],
    });

    assert.deepEqual(result.map((candidate) => candidate.candidateId), ['c', 'a', 'b']);
    for (const [index, candidate] of result.entries()) {
        assert.equal(candidate.postPolicyRank, index + 1, 'postPolicyRank is 1-based contiguous');
        // The deterministic score is preserved but is NOT the ordering authority.
        assert.equal(candidate.deterministicV3Score, deterministicOrder.find((entry) => entry.candidateId === candidate.candidateId)?.deterministicV3Score);
    }
    // No score-based re-sort can reproduce the provider order for this case.
    const scoreSorted = [...result].sort((left, right) => right.deterministicV3Score - left.deterministicV3Score);
    assert.notDeepEqual(scoreSorted.map((candidate) => candidate.candidateId), ['c', 'a', 'b'], 'provider order is not score order');

    // Identity permutation and stability.
    const identity = applyProviderSlotPermutation({
        deterministicOrder,
        baselineAdmissionIds: ['a', 'b', 'c'],
        providerOrder: ['a', 'b', 'c'],
    });
    assert.deepEqual(identity, deterministicOrder);
});

test('rejects_duplicates_omissions_foreign_ids_and_gaps', () => {
    const deterministicOrder = ranked(['a', 'b', 'c'], [10, 8, 5]);
    const base = {
        deterministicOrder,
        baselineAdmissionIds: ['a', 'b', 'c'],
    };

    assert.throws(() => applyProviderSlotPermutation({ ...base, providerOrder: ['a', 'a', 'c'] }), /Duplicate/);
    assert.throws(() => applyProviderSlotPermutation({ ...base, providerOrder: ['a', 'b'] }), /complete permutation/);
    assert.throws(() => applyProviderSlotPermutation({ ...base, providerOrder: ['a', 'b', 'foreign'] }), /Foreign/);
    assert.throws(() => applyProviderSlotPermutation({ ...base, providerOrder: ['a', 'b', 'c', 'd'] }), /complete permutation/);
    assert.throws(() => applyProviderSlotPermutation({ ...base, providerOrder: ['a', 'b', 'c', 'c'] }), /complete permutation/);
});

test('rejects_duplicate_or_mismatched_deterministic_input', () => {
    assert.throws(() => applyProviderSlotPermutation({
        deterministicOrder: ranked(['a', 'a'], [1, 1]),
        baselineAdmissionIds: ['a', 'b'],
        providerOrder: ['a', 'b'],
    }), /Duplicate deterministic/);
    assert.throws(() => applyProviderSlotPermutation({
        deterministicOrder: ranked(['a', 'b'], [1, 1]),
        baselineAdmissionIds: ['a', 'b', 'c'],
        providerOrder: ['a', 'b', 'c'],
    }), /sizes disagree/);
    assert.throws(() => applyProviderSlotPermutation({
        deterministicOrder: ranked(['a', 'b'], [1, Number.NaN]),
        baselineAdmissionIds: ['a', 'b'],
        providerOrder: ['a', 'b'],
    }), /finite/);
});
