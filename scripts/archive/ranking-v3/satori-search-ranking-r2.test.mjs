import assert from "node:assert/strict";
import test from "node:test";
import {
    bootstrapInterval,
    diffDisclosedLists,
    expectedR2TaskCounts,
} from "./satori-search-ranking-r2.mjs";

function replayTask(groups) {
    return {
        taskId: "task",
        groupingDisclosure: {
            disclosedResults: groups.map((group, index) => ({
                rank: index + 1,
                ownerId: group.ownerId,
                candidateIds: group.candidateIds,
                score: group.score,
            })),
        },
    };
}

test("R2 bootstrap interval uses the frozen paired repository samples", () => {
    const interval = bootstrapInterval(
        [0.1, 0.2, -0.1],
        [
            [0, 1, 2],
            [0, 0, 0],
            [1, 1, 1],
            [2, 2, 2],
        ],
        0.5,
    );

    assert.deepEqual(interval, {
        lower: -0.1,
        upper: 0.1,
    });
});

test("R2 derives quality and safety task counts from the sealed tuning manifest", () => {
    assert.deepEqual(expectedR2TaskCounts({
        tasks: [
            { split: "tuning", queryClass: "ownership_implementation" },
            { split: "tuning", queryClass: "natural_language_behavior" },
            { split: "tuning", queryClass: "negative" },
            { split: "tuning", queryClass: "exact_identifier" },
            { split: "held_out", queryClass: "negative" },
        ],
    }), {
        quality: 2,
        negative: 1,
        exact: 1,
    });
});

test("R2 disclosed-list diff reports every rank transition and boundary change", () => {
    const baseline = replayTask([
        { ownerId: "owner-a", candidateIds: ["a"], score: 0.3 },
        { ownerId: "owner-b", candidateIds: ["b"], score: 0.2 },
    ]);
    const contender = replayTask([
        { ownerId: "owner-b", candidateIds: ["b"], score: 0.4 },
        { ownerId: "owner-c", candidateIds: ["c"], score: 0.1 },
    ]);

    const diff = diffDisclosedLists(baseline, contender);

    assert.equal(diff.membershipIdentityEqual, false);
    assert.deepEqual(diff.additions, ["owner-c"]);
    assert.deepEqual(diff.removals, ["owner-a"]);
    assert.deepEqual(
        diff.transitions.map(({ ownerId, baselineRank, contenderRank }) => ({
            ownerId,
            baselineRank,
            contenderRank,
        })),
        [
            { ownerId: "owner-a", baselineRank: 1, contenderRank: null },
            { ownerId: "owner-b", baselineRank: 2, contenderRank: 1 },
            { ownerId: "owner-c", baselineRank: null, contenderRank: 2 },
        ],
    );
});
