import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
    assertTrackLScoreBinding,
    buildR3Decision,
    buildTrackLDecision,
    evaluateTrackL,
    resolveTrackLEvaluationAuthority,
    trackLOwnerRank,
} from "./satori-search-ranking-r3.mjs";

function contender(contenderId, reciprocalRank, {
    quality = false,
    resources = false,
} = {}) {
    return {
        contenderId,
        passesEveryQualityGate: quality,
        productAdmissible: quality && resources,
        qualityMetrics: {
            reciprocalRank: { contender: reciprocalRank },
        },
    };
}

test("R3 keeps baseline product policy when diagnostic quality cannot clear resources", () => {
    const decision = buildR3Decision([
        contender("D-L16", 0.4),
        contender("D-L32", 0.42),
    ], 0.01);

    assert.deepEqual(decision, {
        qualityDiagnosticWinner: "D-L32",
        qualityDiagnosticWinnerPassedEveryQualityGate: false,
        d32OverD16MacroReciprocalRank: 0.02,
        d32OverD16DepthThresholdMet: true,
        qualityConclusion: "directional_quality_improvement_not_fully_qualified",
        productPolicy: "B",
        productFinalist: null,
        productReason: "all_lateon_contenders_failed_frozen_resource_gates",
        heldOutOpened: false,
    });
});

test("Track L evaluator derives six tuning repositories and four unopened arms from the seal", () => {
    const manifest = JSON.parse(fs.readFileSync(
        "evals/search-ranking/cross-repository-v3.manifest.json",
        "utf8",
    ));

    const authority = resolveTrackLEvaluationAuthority(manifest);

    assert.equal(authority.repositoryIds.length, 6);
    assert.equal(authority.contenders.length, 4);
    assert.equal(authority.confidence, 0.9875);
    assert.equal(authority.bootstrapResamples, 10_000);
    assert.ok(authority.repositoryIds.every((id) => !id.includes("promptready")));
    assert.ok(authority.repositoryIds.every((id) => (
        authority.taskAuthorityByRepository[id].qualityTaskIds.length === 6
    )));
});

test("Track L evaluator binds score artifacts to repository, arm, profile, and tasks", () => {
    const manifest = JSON.parse(fs.readFileSync(
        "evals/search-ranking/cross-repository-v3.manifest.json",
        "utf8",
    ));
    const authority = resolveTrackLEvaluationAuthority(manifest);
    const repositoryId = authority.repositoryIds[0];
    const contender = authority.contenders[0];
    const taskAuthority = authority.taskAuthorityByRepository[repositoryId];
    const expectedTaskIds = [
        ...taskAuthority.positiveTaskIds,
        ...taskAuthority.negativeTaskIds,
    ];
    const artifact = {
        schemaVersion: "satori_search_ranking_track_l_scores_v2",
        contenderId: contender.contenderId,
        candidateDepth: contender.candidateDepth,
        contract: {
            projectionVersion: contender.projectionVersion,
            manifestSeal: authority.manifestSeal,
            repositoryId,
            resourceProfile: authority.resourceProfile,
        },
        tasks: expectedTaskIds.map((taskId) => ({
            taskId,
            ...taskAuthority.tasksById[taskId],
        })),
    };

    assert.doesNotThrow(() => assertTrackLScoreBinding(
        artifact,
        repositoryId,
        contender,
        authority,
        expectedTaskIds,
        taskAuthority.tasksById,
    ));
    assert.throws(() => assertTrackLScoreBinding(
        {
            ...artifact,
            contract: { ...artifact.contract, repositoryId: "wrong-repository" },
        },
        repositoryId,
        contender,
        authority,
        expectedTaskIds,
        taskAuthority.tasksById,
    ), /authority is incompatible/);
});

test("Track L owner rank uses captured disclosure for compact baseline replay", () => {
    const owner = {
        file: "src/owner.ts",
        symbol: "runOwner",
        match: "symbol",
    };
    const compactBaselineTask = {
        taskId: "owner-task",
        route: { kind: "fusion", fusionReplay: "exact" },
        mcpAttempts: [{ attemptId: "attempt:1", candidateCount: 20 }],
    };
    const capture = {
        taskId: "owner-task",
        rankedResults: [
            { kind: "symbol", file: "src/decoy.ts", symbol: "decoy" },
            { kind: "symbol", file: "src/owner.ts", symbol: "runOwner" },
        ],
    };

    assert.equal(trackLOwnerRank(compactBaselineTask, owner, capture), 2);
});

test("Track L evaluator refuses to mix replay output with an existing directory", () => {
    const replayDir = fs.mkdtempSync("/tmp/satori-track-l-existing-");
    try {
        assert.throws(() => evaluateTrackL({
            manifest: {},
            r1Dir: "/does-not-matter",
            scoreDir: "/does-not-matter",
            replayDir,
        }), /must not already exist/);
    } finally {
        fs.rmSync(replayDir, { recursive: true, force: true });
    }
});

test("Track L selection retains the shallower safe arm without the frozen depth effect", () => {
    const decision = buildTrackLDecision([
        {
            contenderId: "projection-v2-d-l16",
            candidateDepth: 16,
            evidenceConclusive: true,
            productAdmissible: true,
            qualityMetrics: { reciprocalRank: { contender: 0.5 } },
        },
        {
            contenderId: "projection-v2-d-l32",
            candidateDepth: 32,
            evidenceConclusive: true,
            productAdmissible: true,
            qualityMetrics: { reciprocalRank: { contender: 0.509 } },
        },
    ], 0.01);

    assert.equal(decision.outcome, "lateon_projection_v2_disabled_candidate");
    assert.equal(decision.selectedContenderId, "projection-v2-d-l16");
    assert.equal(decision.productPolicy, "B");
});

test("Track L selection reports insufficient evidence instead of choosing a point estimate", () => {
    const decision = buildTrackLDecision([
        {
            contenderId: "projection-v2-d-l50",
            candidateDepth: 50,
            evidenceConclusive: false,
            productAdmissible: false,
            qualityMetrics: { reciprocalRank: { contender: 0.9 } },
        },
    ], 0.01);

    assert.equal(decision.outcome, "insufficient_evidence");
    assert.equal(decision.selectedContenderId, null);
    assert.equal(decision.productPolicy, "B");
});

test("Track L selection keeps projection v1 at equal depth without the frozen simplicity effect", () => {
    const decision = buildTrackLDecision([
        {
            contenderId: "projection-v1-d-l50",
            candidateDepth: 50,
            projectionVersion: "search_rerank_document_v1",
            evidenceConclusive: true,
            productAdmissible: true,
            qualityMetrics: { reciprocalRank: { contender: 0.5 } },
        },
        {
            contenderId: "projection-v2-d-l50",
            candidateDepth: 50,
            projectionVersion: "search_rerank_document_v2",
            evidenceConclusive: true,
            productAdmissible: true,
            qualityMetrics: { reciprocalRank: { contender: 0.509 } },
        },
    ], 0.01);

    assert.equal(decision.selectedContenderId, "projection-v1-d-l50");
    assert.equal(decision.outcome, "lateon_depth_50_disabled_candidate");
});

test("Track L deeper selection must clear the frozen effect over every safe shallower arm", () => {
    const decision = buildTrackLDecision([
        {
            contenderId: "projection-v2-d-l16",
            candidateDepth: 16,
            projectionVersion: "search_rerank_document_v2",
            evidenceConclusive: true,
            productAdmissible: true,
            qualityMetrics: { reciprocalRank: { contender: 0.5 } },
        },
        {
            contenderId: "projection-v2-d-l32",
            candidateDepth: 32,
            projectionVersion: "search_rerank_document_v2",
            evidenceConclusive: true,
            productAdmissible: true,
            qualityMetrics: { reciprocalRank: { contender: 0.509 } },
        },
        {
            contenderId: "projection-v2-d-l50",
            candidateDepth: 50,
            projectionVersion: "search_rerank_document_v2",
            evidenceConclusive: true,
            productAdmissible: true,
            qualityMetrics: { reciprocalRank: { contender: 0.511 } },
        },
    ], 0.01);

    assert.equal(decision.selectedContenderId, "projection-v2-d-l16");
});
