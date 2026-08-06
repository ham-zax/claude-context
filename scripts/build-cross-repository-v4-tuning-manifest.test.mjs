import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCrossRepositoryV4TuningManifest } from './build-cross-repository-v4-tuning-manifest.mjs';

const sha = (c) => c.repeat(64);

test('manifest_is_tuning_only_and_binds_adjudicated_judgments', () => {
    const source = {
        version: 3,
        kind: 'cross_repository_ranking_manifest_v3',
        repositories: [
            { id: 'r1', family: 'f1', split: 'tuning' },
            { id: 'r2', family: 'f2', split: 'held_out' },
        ],
        leakage: { contract: 'sealed' },
        tasks: [
            { id: 't1', split: 'tuning', repositoryId: 'r1', querySha256: sha('1') },
            { id: 'h1', split: 'held_out', repositoryId: 'r2', querySha256: sha('2') },
        ],
        sha256: sha('a'),
    };
    const adjudicated = {
        schemaVersion: 'ranking_adjudicated_judgments_v1',
        proposalAssemblySha256: sha('b'),
        judgments: [{ schemaVersion: 'ranking_judgment_v1', taskId: 't1', candidateId: 'c1', judged: true, grade: 3, sourceSha256: sha('c'), rationale: 'owner' }],
    };
    const result = buildCrossRepositoryV4TuningManifest({ sourceManifest: source, adjudicated });
    assert.deepEqual(result.tasks.map((task) => task.id), ['t1']);
    assert.deepEqual(result.repositories.map((repo) => repo.id), ['r1']);
    assert.equal(result.tasks[0].judgmentSha256.length, 64);
    assert.equal(result.sourceHeldoutAuthoritySha256.length, 64);
    assert.throws(() => buildCrossRepositoryV4TuningManifest({
        sourceManifest: source,
        adjudicated: { ...adjudicated, judgments: [{ ...adjudicated.judgments[0], taskId: 'h1' }] },
    }), /tuning/i);
});
