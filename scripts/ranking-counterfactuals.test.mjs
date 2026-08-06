import assert from 'node:assert/strict';
import test from 'node:test';
import { checkRankingCounterfactualsV1 } from './ranking-counterfactuals.mjs';

const BASELINE = ['a', 'b', 'c', 'd'];
const CONTROLS = [['a', 'b'], ['c', 'd']];

test('synthetic_shortcut_policy_fails', () => {
    // Baseline evidence order: a before b, c before d. A shortcut policy that
    // reverses them (ranking by a protected attribute) must fail.
    const shortcutRanking = ['b', 'a', 'd', 'c'];
    const result = checkRankingCounterfactualsV1({
        ranking: shortcutRanking,
        baselineRanking: BASELINE,
        protectedControls: CONTROLS,
    });
    assert.equal(result.passed, false, 'a shortcut policy must fail the counterfactual check');
    assert.equal(result.violations.length, 2);
    assert.deepEqual(result.violations[0].pair, ['a', 'b']);
    assert.deepEqual(result.violations[1].pair, ['c', 'd']);
});

test('legitimate_evidence_policy_passes', () => {
    // A policy preserving every protected pair's baseline relative order passes.
    const legitimateRanking = ['a', 'c', 'b', 'd'];
    const result = checkRankingCounterfactualsV1({
        ranking: legitimateRanking,
        baselineRanking: BASELINE,
        protectedControls: CONTROLS,
    });
    assert.equal(result.passed, true);
    assert.deepEqual(result.violations, []);

    // The baseline itself trivially passes.
    const identity = checkRankingCounterfactualsV1({
        ranking: BASELINE,
        baselineRanking: BASELINE,
        protectedControls: CONTROLS,
    });
    assert.equal(identity.passed, true);
});

test('validation_is_fail_closed', () => {
    assert.throws(() => checkRankingCounterfactualsV1({
        ranking: [],
        baselineRanking: BASELINE,
        protectedControls: CONTROLS,
    }));
    assert.throws(() => checkRankingCounterfactualsV1({
        ranking: ['a', 'a'],
        baselineRanking: BASELINE,
        protectedControls: CONTROLS,
    }));
    assert.throws(() => checkRankingCounterfactualsV1({
        ranking: ['a', 'b'],
        baselineRanking: BASELINE,
        protectedControls: [],
    }));
    assert.throws(() => checkRankingCounterfactualsV1({
        ranking: ['a', 'b', 'c', 'd'],
        baselineRanking: BASELINE,
        protectedControls: [['a', 'z']],
    }));
    assert.throws(() => checkRankingCounterfactualsV1({
        ranking: ['a', 'z', 'c', 'd'],
        baselineRanking: BASELINE,
        protectedControls: CONTROLS,
    }));
});
