import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
    applyFrozenNeuralOrder,
    assertTrackLNeuralAuthority,
    buildFrozenPaginationReplay,
    main as replayMain,
    replayCoreFusion,
    validateNeuralScoreArtifact,
} from "./satori-search-candidate-replay.mjs";
import { canonicalJson } from "./satori-useful-context.mjs";

function seal(value) {
    return {
        ...value,
        sha256: crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex"),
    };
}

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

test("neural replay validates preregistered Track L depth and projection identities", () => {
    const artifact = seal({
        schemaVersion: "satori_search_ranking_track_l_scores_v2",
        contenderId: "projection-v2-d-l50",
        candidateDepth: 50,
        contract: {
            manifestSeal: "a".repeat(64),
            projectionVersion: "search_rerank_document_v2",
        },
        captures: [],
        authority: {},
        tasks: [],
    });

    assert.equal(validateNeuralScoreArtifact(artifact).candidateDepth, 50);
    assert.doesNotThrow(() => assertTrackLNeuralAuthority(artifact, {
        expectedManifestSeal: "a".repeat(64),
        allowedContenderIds: ["projection-v2-d-l50"],
    }));
    assert.throws(() => assertTrackLNeuralAuthority(artifact, {
        expectedManifestSeal: "b".repeat(64),
        allowedContenderIds: ["projection-v2-d-l50"],
    }), /manifest seal/i);

    const wrongDepth = seal({ ...artifact, candidateDepth: 32, sha256: undefined });
    assert.throws(
        () => validateNeuralScoreArtifact(wrongDepth),
        /contender.*depth|depth.*contender/i,
    );
    const wrongProjection = seal({
        ...artifact,
        contract: { ...artifact.contract, projectionVersion: "search_rerank_document_v1" },
        sha256: undefined,
    });
    assert.throws(
        () => validateNeuralScoreArtifact(wrongProjection),
        /contender.*projection|projection.*contender/i,
    );
});

test("frozen pagination preserves complete grouped order without another reranker call", () => {
    const pagination = buildFrozenPaginationReplay({
        groupedResults: ["a", "b", "c", "d", "e"].map((ownerId, index) => ({
            rank: index + 1,
            ownerId,
            candidateIds: [`candidate-${ownerId}`],
            score: 5 - index,
        })),
        disclosureOrder: ["a", "c", "e", "b", "d"].map((ownerId, index) => ({
            rank: index + 1,
            ownerId,
            candidateIds: [`candidate-${ownerId}`],
            score: 5 - index,
        })),
        disclosedResults: [
            { rank: 1, ownerId: "a" },
            { rank: 2, ownerId: "c" },
        ],
    }, 2);

    assert.deepEqual(
        pagination.pages.flatMap((page) => page.ownerIds),
        ["a", "c", "e", "b", "d"],
    );
    assert.equal(pagination.additionalRerankerCalls, 0);
    assert.match(pagination.orderedGroupDigest, /^[a-f0-9]{64}$/);
});

test("candidate replay CLI rejects held-out material without an opening record", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "satori-heldout-replay-gate-"));
    try {
        const captureFile = path.join(tempDir, "capture.json");
        fs.writeFileSync(captureFile, JSON.stringify({
            taskSuiteVersion: 2,
            captures: [{ taskId: "opaque-task", split: "held_out" }],
        }));

        assert.throws(
            () => replayMain(["--capture", captureFile, "--split", "held_out"]),
            /requires --held-out-opening/,
        );
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("replay_rejects_unknown_contract_policy_or_target_digest", async () => {
    const { assertRankingV3ReplayAuthorities, parseRankingV3ReplayAuthorities } = await import("./satori-search-candidate-replay.mjs");
    const sha = (character) => character.repeat(64);
    const expected = {
        contractSha256: sha("a"),
        policySha256: sha("b"),
        qualificationTargetSha256: sha("c"),
    };
    assert.deepEqual(assertRankingV3ReplayAuthorities(expected, expected), expected);
    assert.deepEqual(parseRankingV3ReplayAuthorities(expected), expected);
    for (const field of Object.keys(expected)) {
        assert.throws(
            () => assertRankingV3ReplayAuthorities({ ...expected, [field]: sha("d") }, expected),
            /sealed authority/i,
        );
    }
    assert.throws(
        () => parseRankingV3ReplayAuthorities({ ...expected, extra: sha("e") }),
        /contain exactly/i,
    );
    assert.throws(
        () => parseRankingV3ReplayAuthorities({ ...expected, contractSha256: "not-a-digest" }),
        /SHA-256/i,
    );
    assert.throws(() => parseRankingV3ReplayAuthorities(null), /must be an object/i);
});
