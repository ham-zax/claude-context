import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreDeterministicV3 } from './ranking-policy-v3.js';

test('zero_residual_equals_pre_rerank_baseline_scores', () => {
    const baseline = 12.5;
    const input = {
        preRerankBaselineScore: baseline,
        normalizedFeatures: [1, 0.5, 0.25, 0.125],
        weights: [0, 0, 0, 0],
        maximumResidual: 1,
    };
    const result = scoreDeterministicV3(input);
    assert.equal(result.residual, 0);
    assert.equal(result.deterministicV3Score, baseline, 'zero weights must reproduce the baseline score exactly');
});

test('residual_is_bounded_and_clamped', () => {
    const result = scoreDeterministicV3({
        preRerankBaselineScore: 10,
        normalizedFeatures: [1, 1],
        weights: [10, 10],
        maximumResidual: 0.5,
    });
    assert.equal(result.residual, 0.5, 'residual must be clamped to maximumResidual');
    assert.equal(result.deterministicV3Score, 10.5);

    const negative = scoreDeterministicV3({
        preRerankBaselineScore: 10,
        normalizedFeatures: [1, 1],
        weights: [-10, -10],
        maximumResidual: 0.5,
    });
    assert.equal(negative.residual, -0.5);
    assert.equal(negative.deterministicV3Score, 9.5);
});

test('input_validation_is_fail_closed', () => {
    assert.throws(() => scoreDeterministicV3({
        preRerankBaselineScore: NaN,
        normalizedFeatures: [],
        weights: [],
        maximumResidual: 1,
    }));
    assert.throws(() => scoreDeterministicV3({
        preRerankBaselineScore: 1,
        normalizedFeatures: [1],
        weights: [],
        maximumResidual: 1,
    }));
    assert.throws(() => scoreDeterministicV3({
        preRerankBaselineScore: 1,
        normalizedFeatures: [1],
        weights: [1],
        maximumResidual: -1,
    }));
});
