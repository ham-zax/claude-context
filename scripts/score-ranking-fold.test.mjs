import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { scoreLofoFoldV1 } from './score-ranking-fold.mjs';

const SHA = (seed) => crypto.createHash('sha256').update(seed).digest('hex');
const FOLD = {
    candidates: [
        { candidateId: 'a', baselineScore: 10 },
        { candidateId: 'b', baselineScore: 8 },
        { candidateId: 'c' },
    ],
};

test('fold_scoring_is_deterministic_and_binds_inputs', () => {
    const first = scoreLofoFoldV1({
        foldManifest: FOLD,
        residualModelSha256: SHA('model'),
        evaluationFoldManifestSha256: SHA('eval'),
    });
    const second = scoreLofoFoldV1({
        foldManifest: FOLD,
        residualModelSha256: SHA('model'),
        evaluationFoldManifestSha256: SHA('eval'),
    });
    assert.deepEqual(second, first, 'scoring must be deterministic');
    assert.equal(first.schemaVersion, 'ranking_v3_fold_score_receipt_v1');
    assert.equal(first.receiptSha256.length, 64);
    assert.equal(first.candidates[0].candidateId, 'a');
    assert.equal(first.candidates[0].deterministicScore, 10);
    assert.equal(typeof first.candidates[2].deterministicScore, 'number');

    assert.throws(() => scoreLofoFoldV1({
        foldManifest: { candidates: [] },
        residualModelSha256: SHA('model'),
        evaluationFoldManifestSha256: SHA('eval'),
    }));
    assert.throws(() => scoreLofoFoldV1({
        foldManifest: FOLD,
        residualModelSha256: 'bad',
        evaluationFoldManifestSha256: SHA('eval'),
    }));
});
