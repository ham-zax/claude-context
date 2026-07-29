import assert from "node:assert/strict";
import test from "node:test";
import { resolveLateOnScoreOutcome } from "./satori-search-ranking-r3-score.mjs";

test("LateOn score outcome discards every neural score after the frozen deadline", () => {
    const outcome = resolveLateOnScoreOutcome({
        elapsedMilliseconds: 2001,
        timeoutMilliseconds: 2000,
        selectedCandidates: [{ candidateId: "owner" }, { candidateId: "decoy" }],
        scores: [10, 9],
    });

    assert.deepEqual(outcome, {
        status: "deadline_exceeded",
        policyAffected: false,
        fallbackBaselineRequired: true,
        ranking: [],
        diagnosticRanking: [
            { candidateId: "owner", score: 10 },
            { candidateId: "decoy", score: 9 },
        ],
    });
});

test("LateOn score outcome uses deterministic candidate identity ties within the deadline", () => {
    const outcome = resolveLateOnScoreOutcome({
        elapsedMilliseconds: 100,
        timeoutMilliseconds: 2000,
        selectedCandidates: [{ candidateId: "zeta" }, { candidateId: "alpha" }],
        scores: [5, 5],
    });

    assert.deepEqual(outcome, {
        status: "scored",
        policyAffected: true,
        fallbackBaselineRequired: false,
        ranking: [
            { candidateId: "alpha", score: 5 },
            { candidateId: "zeta", score: 5 },
        ],
        diagnosticRanking: [
            { candidateId: "alpha", score: 5 },
            { candidateId: "zeta", score: 5 },
        ],
    });
});
