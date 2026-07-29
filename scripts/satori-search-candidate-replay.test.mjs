import assert from "node:assert/strict";
import test from "node:test";
import { replayCoreFusion } from "./satori-search-candidate-replay.mjs";

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
