import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLofoFoldsV1 } from './ranking-lofo-folds.mjs';

test('related_repository_families_never_cross_fold_boundary', () => {
    const folds = buildLofoFoldsV1({
        repositories: [
            { repositoryId: 'a1', familyId: 'a' },
            { repositoryId: 'a2', familyId: 'a' },
            { repositoryId: 'b1', familyId: 'b' },
        ],
        families: ['a', 'b'],
    });
    const aFold = folds.find((fold) => fold.excludedFamilyId === 'a');
    assert.deepEqual(aFold?.excludedRepositoryIds, ['a1', 'a2']);
    assert.equal(aFold?.trainingRepositoryIds.includes('a1'), false);
    assert.equal(aFold?.trainingRepositoryIds.includes('a2'), false);
});
