import assert from 'node:assert/strict';
import test from 'node:test';
import { computeRankingV3GradedMetrics } from './search-quality-evaluation.js';

test('legacy_owner_metrics_remain_byte_compatible', () => {
    const legacy = { ownerRank: 1, reciprocalRank: 1, roleCoverage: 0.5, duplicateFamilyRate: 0 };
    const before = JSON.stringify(legacy);
    const metrics = computeRankingV3GradedMetrics({
        stages: { admitted: ['a', 'b'], final: ['b', 'a'] },
        judgments: { a: 3, b: 1 },
        pairs: [['a', 'b']],
    });
    assert.equal(metrics.stageSurvival.final, 1);
    assert.equal(metrics.judgedCoverageAt10, 1);
    assert.equal(JSON.stringify(legacy), before);
});
