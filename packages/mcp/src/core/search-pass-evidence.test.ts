import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSearchPassEvidenceV1 } from './search-pass-evidence.js';

test('pass_evidence_contributions_are_stable_and_exact', () => {
    const input = { candidateId: 'c1', passes: [{ passId: 'expanded', rank: 2, rrfK: 60 }, { passId: 'primary', rank: 1, rrfK: 60 }] } as const;
    const first = buildSearchPassEvidenceV1(input);
    const second = buildSearchPassEvidenceV1(input);
    assert.deepEqual(first, second);
    assert.deepEqual(first.contributions.map((item) => item.passId), ['expanded', 'primary']);
    assert.equal(first.totalContribution, first.contributions.reduce((sum, item) => sum + item.contribution, 0));
});

test('pass_evidence_weight_scales_contribution_exactly', () => {
    // Weighted passes (e.g. the dirty overlay) must mirror the execution
    // fusion delta passWeight * (1 / (K + rank)) exactly.
    const evidence = buildSearchPassEvidenceV1({
        candidateId: 'c1',
        passes: [{ passId: 'attempt:1/dirty_overlay', rank: 3, rrfK: 60, weight: 2 }],
    });
    assert.deepEqual(evidence.contributions, [{
        passId: 'attempt:1/dirty_overlay',
        rank: 3,
        rrfK: 60,
        weight: 2,
        contribution: 2 * (1 / (60 + 3)),
    }]);
    assert.equal(evidence.totalContribution, evidence.contributions[0].contribution);
});
