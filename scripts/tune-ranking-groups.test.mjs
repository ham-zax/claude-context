import assert from 'node:assert/strict';
import test from 'node:test';
import { tuneRankingGroupsV1 } from './tune-ranking-groups.mjs';

const MANIFEST = {
    groups: [
        { groupId: 'a', score: 0.9 },
        { groupId: 'b', score: 0.5 },
        { groupId: 'c' },
        { groupId: 'd', score: 0.7 },
    ],
};

test('search_is_reproducible_with_sealed_grid_seed_and_tiebreak', () => {
    const first = tuneRankingGroupsV1({ manifest: MANIFEST, seed: 42 });
    const second = tuneRankingGroupsV1({ manifest: MANIFEST, seed: 42 });
    assert.deepEqual(second, first, 'repeat run must select the identical grouped ranking');
    assert.equal(first.schemaVersion, 'ranking_v3_grouped_comparator_v1');
    assert.equal(typeof first.receiptSha256, 'string');
    assert.equal(first.receiptSha256.length, 64);

    // Seeded groups with explicit scores keep their relative order (score desc).
    const ids = first.rankedGroups.map((group) => group.groupId);
    const indexOf = (id) => ids.indexOf(id);
    assert.equal(indexOf('a') < indexOf('d'), true);
    assert.equal(indexOf('d') < indexOf('b'), true);
    // The unseeded group (c) is deterministically placed by the sealed seed.
    assert.equal(ids.includes('c'), true);
    assert.equal(new Set(ids).size, 4);

    // A different seed may move only the seeded-random group, never the explicit scores.
    const other = tuneRankingGroupsV1({ manifest: MANIFEST, seed: 7 });
    assert.equal(other.rankedGroups.map((group) => group.groupId).indexOf('a')
        < other.rankedGroups.map((group) => group.groupId).indexOf('d'), true);
    assert.notDeepEqual(other, first);
});
