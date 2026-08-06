import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { trainResidualModelV1 } from './train-ranking-residual.mjs';
import { scoreDeterministicV3 } from '../packages/mcp/src/core/ranking-policy-v3.ts';

const COMMIT = 'a'.repeat(40);
const SHA = (seed) => crypto.createHash('sha256').update(seed).digest('hex');

function zeroFold() {
    return {
        trainingFoldManifestSha256: SHA('fold-zero'),
        featureOrder: ['f1', 'f2'],
        featureRows: [[1, 0.5], [0.5, 1], [0.25, 0.75]],
        targets: [0, 0, 0],
    };
}

test('zero_residual_equals_pre_rerank_baseline_scores', () => {
    // A fold whose targets are all zero trains zero weights; scoring with the
    // model's weights must reproduce the baseline score exactly.
    const model = trainResidualModelV1({
        foldManifest: zeroFold(),
        createdFromCommit: COMMIT,
        trainingCodeSha256: SHA('code'),
        trainingContractSha256: SHA('contract'),
        maximumResidual: 1,
    });
    assert.equal(model.schemaVersion, 'ranking_residual_model_v1');
    assert.equal(model.featureSchema, 'search_features_v1');
    assert.equal(model.weights.every((weight) => Math.abs(weight) < 1e-9), true, 'zero targets must train zero weights');

    for (const features of [[1, 0.5], [0.25, 0.75], [0, 1]]) {
        const result = scoreDeterministicV3({
            preRerankBaselineScore: 7.25,
            normalizedFeatures: features,
            weights: model.weights,
            maximumResidual: model.residualBounds.maximumResidual,
        });
        assert.equal(result.residual, 0);
        assert.equal(result.deterministicV3Score, 7.25);
    }
});

test('trains_reproducibly_and_binds_sealed_authorities', () => {
    const fold = {
        trainingFoldManifestSha256: SHA('fold'),
        featureOrder: ['f1', 'f2'],
        featureRows: [[1, 0], [0, 1], [1, 1]],
        targets: [2, 3, 5],
    };
    const first = trainResidualModelV1({
        foldManifest: fold,
        createdFromCommit: COMMIT,
        trainingCodeSha256: SHA('code'),
        trainingContractSha256: SHA('contract'),
    });
    const second = trainResidualModelV1({
        foldManifest: fold,
        createdFromCommit: COMMIT,
        trainingCodeSha256: SHA('code'),
        trainingContractSha256: SHA('contract'),
    });
    assert.deepEqual(second, first, 'training must be reproducible');
    assert.equal(first.weights[0] > 0 && first.weights[1] > 0, true, 'linearly separable targets must train nonzero weights');
});

test('rejects_malformed_folds', () => {
    assert.throws(() => trainResidualModelV1({
        foldManifest: { trainingFoldManifestSha256: 'bad' },
        createdFromCommit: COMMIT,
        trainingCodeSha256: SHA('c'),
        trainingContractSha256: SHA('t'),
    }));
    assert.throws(() => trainResidualModelV1({
        foldManifest: { ...zeroFold(), featureRows: [[1], [2]] },
        createdFromCommit: COMMIT,
        trainingCodeSha256: SHA('c'),
        trainingContractSha256: SHA('t'),
    }));
    assert.throws(() => trainResidualModelV1({
        foldManifest: { ...zeroFold(), targets: [Number.NaN, 1, 2] },
        createdFromCommit: COMMIT,
        trainingCodeSha256: SHA('c'),
        trainingContractSha256: SHA('t'),
    }));
});
