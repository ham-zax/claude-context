import assert from "node:assert/strict";
import test from "node:test";
import {
    applyFrozenNeuralOrder,
    replayCoreFusion,
} from "./satori-search-candidate-replay.mjs";

function candidate(candidateId, stage, relativePath, score) {
    return {
        candidateId,
        candidateIdKind: "persisted",
        ownerId: JSON.stringify(["symbol", relativePath, `${candidateId}-owner`]),
        evidenceOccurrenceId: JSON.stringify([candidateId, stage, 1]),
        relativePath,
        startLine: 1,
        endLine: 2,
        language: "typescript",
        rank: 1,
        score,
        passId: "attempt:1/primary",
    };
}

function stage(name, candidates) {
    return {
        stage: name,
        passId: "attempt:1/primary",
        totalOccurrences: candidates.length,
        uniqueCandidates: candidates.length,
        omittedOccurrences: 0,
        candidates,
    };
}

test("baseline Core replay uses fallback lexical when precise lexical is empty", () => {
    const denseCandidate = candidate(
        "dense-candidate",
        "raw_dense",
        "src/dense.ts",
        0.9,
    );
    const fallbackCandidate = candidate(
        "fallback-candidate",
        "raw_lexical_fallback",
        "src/fallback.ts",
        0.8,
    );

    const replayed = replayCoreFusion(
        stage("raw_dense", [denseCandidate]),
        stage("raw_lexical", []),
        stage("raw_lexical_fallback", [fallbackCandidate]),
        2,
        "fallback-only regression",
    );

    assert.deepEqual(
        replayed.map(({ candidate: entry }) => entry.candidateId),
        ["dense-candidate", "fallback-candidate"],
    );
    assert.ok(replayed.every(({ score }) => score === 1 / 101));
});

test("baseline Core replay assigns arm ranks after repeated owners are removed", () => {
    const firstOwnerChunk = candidate("owner-a-1", "raw_dense", "src/owner-a.ts", 3);
    const secondOwnerChunk = candidate("owner-a-2", "raw_dense", "src/owner-a.ts", 2);
    secondOwnerChunk.ownerId = firstOwnerChunk.ownerId;
    const distinctOwner = candidate("owner-b", "raw_dense", "src/owner-b.ts", 1);

    const replayed = replayCoreFusion(
        stage("raw_dense", [firstOwnerChunk, secondOwnerChunk, distinctOwner]),
        stage("raw_lexical", []),
        undefined,
        3,
        "owner-level arm regression",
    );

    assert.deepEqual(
        replayed.map(({ candidate: entry }) => entry.candidateId),
        ["owner-a-1", "owner-b"],
    );
    assert.equal(replayed[1]?.score, 1 / 102);
});

test("neural replay applies production RRF scoring without changing eligibility", () => {
    const localCandidate = (candidateId, fusionScore) => ({
        candidate: {
            candidateId,
            relativePath: `src/${candidateId}.ts`,
        },
        result: {
            relativePath: `src/${candidateId}.ts`,
            startLine: 1,
            endLine: 2,
        },
        fusionScore,
        lexicalScore: 0,
        pathMultiplier: 1,
        changedFilesMultiplier: 1,
        agentFitMultiplier: 1,
        entrypointOwnerScoreBoost: 0,
        finalScore: fusionScore,
        exactLexicalMatch: false,
        passesMatchedMust: false,
        exactMatchPinned: false,
        rerankAdjusted: false,
    });
    const localScoring = {
        candidates: [
            localCandidate("semantic-runner-up", 0.015),
            localCandidate("neural-owner", 0.01),
        ],
        removed: [{ candidateId: "filtered", reason: "scope_filter" }],
        mustMatchesFirst: false,
    };

    const adjusted = applyFrozenNeuralOrder(localScoring, [
        { candidateId: "neural-owner", score: 10 },
        { candidateId: "semantic-runner-up", score: 9 },
    ], { exactMatchPinningEnabled: false });

    assert.deepEqual(
        adjusted.candidates.map(({ candidate: entry }) => entry.candidateId),
        ["neural-owner", "semantic-runner-up"],
    );
    assert.deepEqual(adjusted.removed, localScoring.removed);
    assert.equal(adjusted.candidates.every(({ rerankAdjusted }) => rerankAdjusted), true);
    assert.deepEqual(
        localScoring.candidates.map(({ fusionScore }) => fusionScore),
        [0.015, 0.01],
        "neural replay must not mutate the reproduced baseline",
    );
});

test("neural replay rejects candidates outside the eligible union", () => {
    assert.throws(() => applyFrozenNeuralOrder({
        candidates: [],
        removed: [],
        mustMatchesFirst: false,
    }, [{ candidateId: "missing", score: 1 }]), /outside the eligible union/);
});
