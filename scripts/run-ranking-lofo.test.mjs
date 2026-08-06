import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { buildLofoTrainJobManifestV1 } from './run-ranking-lofo.mjs';

const SHA = (seed) => crypto.createHash('sha256').update(seed).digest('hex');
const FAMILIES = ['gitnexus', 'duas', 'rpc_learner_engine'];

test('train_job_manifest_is_sealed_and_immutable', () => {
    const job = buildLofoTrainJobManifestV1({
        families: FAMILIES,
        excludedFamilyId: 'duas',
        trainingRepositoryIds: ['repo-a', 'repo-b'],
        foldManifestSha256: SHA('fold'),
        trainingContractSha256: SHA('contract'),
    });
    assert.equal(job.schemaVersion, 'ranking_v3_lofo_train_job_v1');
    assert.equal(job.excludedFamilyId, 'duas');
    assert.deepEqual(job.trainingRepositoryIds, ['repo-a', 'repo-b']);
    assert.equal(typeof job.jobManifestSha256, 'string');

    const again = buildLofoTrainJobManifestV1({
        families: FAMILIES,
        excludedFamilyId: 'duas',
        trainingRepositoryIds: ['repo-b', 'repo-a'],
        foldManifestSha256: SHA('fold'),
        trainingContractSha256: SHA('contract'),
    });
    assert.deepEqual(again, job, 'repository ids are canonicalized to a stable order');

    assert.throws(() => buildLofoTrainJobManifestV1({
        families: FAMILIES,
        excludedFamilyId: 'unknown-family',
        trainingRepositoryIds: ['repo-a'],
        foldManifestSha256: SHA('fold'),
        trainingContractSha256: SHA('contract'),
    }));
    assert.throws(() => buildLofoTrainJobManifestV1({
        families: ['x', 'x'],
        excludedFamilyId: 'x',
        trainingRepositoryIds: ['repo-a'],
        foldManifestSha256: SHA('fold'),
        trainingContractSha256: SHA('contract'),
    }));
});
