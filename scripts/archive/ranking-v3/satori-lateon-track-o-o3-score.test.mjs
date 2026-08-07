import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildIndexedChunkId } from "../packages/core/src/core/indexed-chunk-identity.ts";
import { buildCapturedRerankProjectionV2 } from "./satori-captured-rerank-projection-v2.mjs";
import { canonicalJson } from "./satori-useful-context.mjs";
import {
    scoreTrackOHeldOutCapturePair,
    validateTrackOOutputPaths,
} from "./satori-lateon-track-o-o3-score.mjs";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const REVISION = "1".repeat(40);
const TREE = "2".repeat(40);
const EXCLUDED_TASK_ID = "promptready-primary-action";

function sha256Bytes(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Canonical(value) {
    return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}

function sign(value) {
    return { ...value, sha256: sha256Canonical(value) };
}

function candidate() {
    return {
        id: "projection-v2-d-l32",
        candidateDepth: 32,
        projection: { id: "search_rerank_document_v2", sha256: DIGEST_A },
        model: { repository: "synthetic/model", revision: "3".repeat(40) },
        artifacts: [
            { role: "onnx_fp32", path: "model.onnx", sha256: DIGEST_A },
            { role: "tokenizer", path: "tokenizer.json", sha256: DIGEST_B },
            { role: "tokenizer_config", path: "tokenizer_config.json", sha256: DIGEST_C },
            { role: "onnx_config", path: "onnx_config.json", sha256: "d".repeat(64) },
            { role: "special_tokens", path: "special_tokens_map.json", sha256: "e".repeat(64) },
        ],
    };
}

function fixture() {
    const frozenCandidate = candidate();
    const profile = {
        schemaVersion: "satori_lateon_runtime_profile_v2",
        profileId: "lateon_offline_quality_projection_v2_d32_v2",
        qualificationStatus: "disabled_track_o_candidate",
        identity: {
            repository: frozenCandidate.model.repository,
            revision: frozenCandidate.model.revision,
            projectionVersion: frozenCandidate.projection.id,
            projectionSha256: frozenCandidate.projection.sha256,
        },
        artifacts: frozenCandidate.artifacts.map(({ path, sha256 }) => ({ path, sha256 })),
        runtime: {
            transformersJs: "synthetic",
            onnxruntimeNode: "synthetic",
            executionProvider: "cpu",
        },
        inference: {
            candidateDepth: 32,
            profileIntraOpThreads: 8,
            interOpThreads: 1,
        },
        operationalBounds: {
            maximumActiveReranks: 1,
            maximumQueuedReranks: 1,
            maximumQueueWaitMilliseconds: 250,
            maximumScoreMilliseconds: 2_000,
            maximumRerankerStageMilliseconds: 2_500,
        },
    };
    const profileBytes = Buffer.from(JSON.stringify(profile), "utf8");
    const profileIdentity = {
        id: profile.profileId,
        assetFileSha256: sha256Bytes(profileBytes),
        assetCanonicalSha256: sha256Canonical(profile),
        effectiveIdentitySha256: sha256Canonical({
            profile,
            effectiveOperationalBounds: profile.operationalBounds,
            intraOpThreads: profile.inference.profileIntraOpThreads,
        }),
    };
    const o0Authority = {
        version: 1,
        kind: "satori_lateon_track_o_authority",
        phase: "O0",
        status: "prospective_authority_outputs_unopened",
        candidate: frozenCandidate,
        heldOutDecision: {
            manifest: { fileSha256: DIGEST_B, canonicalSealSha256: DIGEST_C },
            decisionBearingQualityOwnerTasks: 35,
            protocolExclusions: [{
                taskId: EXCLUDED_TASK_ID,
                reason: "pre_open_read_only_lane_access_before_o2_no_edits_or_results",
            }],
            preOpenAccessIncidents: [
                {
                    id: "promptready-primary-action-record-exposure",
                    kind: "isolated_lane_task_record_printed",
                    taskPayloadObservedByIsolatedLane: true,
                    taskPayloadPropagated: false,
                    oraclePropagated: false,
                    modelOrRankingOutputOpened: false,
                    decisionImpact: "task_excluded_from_all_o3_decision_metrics",
                },
                {
                    id: "automated-manifest-structural-access-20260804",
                    kind: "synthetic_test_parse_and_field_name_search",
                    taskPayloadEmittedOrObserved: false,
                    oracleEmittedOrObserved: false,
                    modelOrRankingOutputOpened: false,
                    decisionImpact: "none",
                },
            ],
        },
    };
    const o0Bytes = Buffer.from(JSON.stringify(o0Authority), "utf8");
    const o0AuthorityFileSha256 = sha256Bytes(o0Bytes);
    const o2Receipt = sign({
        version: 1,
        kind: "satori_lateon_track_o_operational_qualification_receipt",
        stage: "O2",
        status: "passed",
        operationalQualificationResult: "passed",
        authority: {
            o0AuthoritySha256: o0AuthorityFileSha256,
            manifestFileSha256: DIGEST_B,
            manifestCanonicalSealSha256: DIGEST_C,
        },
        profile: profileIdentity,
        candidate: frozenCandidate,
    });
    const openingRecord = sign({
        version: 1,
        kind: "satori_lateon_track_o_held_out_opening",
        status: "consumed_authorized",
        openedAt: "2026-08-04T00:00:00.000Z",
        authority: {
            o0AuthoritySha256: o0AuthorityFileSha256,
            o2ReceiptSha256: o2Receipt.sha256,
            manifestFileSha256: DIGEST_B,
            manifestCanonicalSealSha256: DIGEST_C,
        },
        candidate: frozenCandidate,
        profile: profileIdentity,
        implementationArtifacts: [],
        postOpenBindingsRequired: [
            "index_and_publication_identities",
            "candidate_capture_sha256",
            "baseline_replay_sha256",
            "d32_score_sha256",
            "evaluator_sha256",
        ],
    });
    const publication = {
        canonicalRoot: "/synthetic/repository",
        generation: 7,
        publication: {
            collectionName: "synthetic-generation-7",
            markerRunId: "synthetic-run-7",
            indexPolicyHash: DIGEST_A,
        },
    };
    const makeCapture = (role) => sign({
        version: 2,
        kind: "satori_search_candidate_capture",
        taskSuiteVersion: 2,
        policyId: "baseline",
        heldOutOpeningSha256: openingRecord.sha256,
        authority: { gitRevision: REVISION, armPublication: publication },
        captures: [{
            taskId: `${role}-task`,
            split: "held_out",
            queryClass: role === "positive" ? "owner_discovery" : "negative_exposure",
        }],
    });
    return {
        input: {
            openingRecord,
            o0Authority,
            o0AuthorityFileSha256,
            o2Receipt,
            runtimeProfile: profile,
            runtimeProfileFileSha256: profileIdentity.assetFileSha256,
            runtimeProfileFile: "/synthetic/runtime-profile.json",
            modelDirectory: "/synthetic/model",
            sourceRoot: "/synthetic/repository",
            repositoryId: "synthetic-repository",
            positiveCaptureFile: "/fixtures/positive.json",
            negativeCaptureFile: "/fixtures/negative.json",
        },
        openingValidation: {
            expectedO0AuthoritySha256: o0AuthorityFileSha256,
            expectedManifestFileSha256: DIGEST_B,
            expectedManifestSealSha256: DIGEST_C,
            expectedCandidate: frozenCandidate,
        },
        captures: {
            positive: makeCapture("positive"),
            negative: makeCapture("negative"),
        },
    };
}

function syntheticDependencies(frozen) {
    const replayOptions = [];
    return {
        replayOptions,
        expectedO0AuthoritySha256: frozen.input.o0AuthorityFileSha256,
        openingValidation: frozen.openingValidation,
        validateModelArtifacts: () => "/synthetic/model",
        validateProductionRuntime: () => "/synthetic/lateon-reranker-worker.js",
        resolveSourceIdentity: () => ({
            absoluteRoot: "/synthetic/repository",
            revision: REVISION,
            tree: TREE,
            sourceTreeSha256: DIGEST_A,
        }),
        loadCapture: (file) => {
            const role = file.includes("positive") ? "positive" : "negative";
            return {
                capture: frozen.captures[role],
                fileName: `${role}.json`,
                fileSha256: role === "positive" ? DIGEST_A : DIGEST_B,
            };
        },
        createRuntime: async () => ({
            getIdentity: () => ({ provider: "lateon", model: "synthetic", profile: DIGEST_A }),
            waitUntilReady: async () => {},
            rerank: async () => [],
            close: async () => {},
        }),
        replayBaseline: (capture) => sign({
            version: 2,
            kind: "satori_search_candidate_baseline_replay",
            sourceCaptureSha256: capture.sha256,
            tasks: capture.captures.map(({ taskId }) => ({ taskId })),
        }),
        scoreTasks: async ({ taskCaptures }) => taskCaptures.map((task) => ({
            taskId: task.taskId,
            split: task.split,
            queryClass: task.queryClass,
            route: "fusion",
            status: "scored",
            policyAffected: true,
            fallbackBaselineRequired: false,
            selectedCandidateIds: [task.taskId],
            ranking: [{ candidateId: task.taskId, score: 1 }],
            diagnosticRanking: [{ candidateId: task.taskId, score: 1 }],
            elapsedMilliseconds: 1,
        })),
        scorerIdentity: () => ({
            id: "synthetic-track-o-scorer",
            sourceSha256: DIGEST_A,
            runtimeSha256: DIGEST_B,
            workerSha256: DIGEST_C,
            projectionSha256: "d".repeat(64),
            capturedProjectionAdapterSha256: "e".repeat(64),
        }),
        replayNeural: (capture, score, options) => {
            replayOptions.push(options);
            return sign({
                version: 1,
                kind: "satori_search_candidate_neural_replay",
                contenderId: score.contenderId,
                diagnosticQualityOnly: options.diagnosticQualityOnly === true,
                sourceCaptureSha256: capture.sha256,
                sourceNeuralScoreSha256: score.sha256,
                baselineReplaySha256: score.captures[0].baselineReplaySha256,
                tasks: score.tasks,
            });
        },
    };
}

test("Track O rejects invalid opening authority before capture or source payload access", async () => {
    const frozen = fixture();
    const counters = { model: 0, runtime: 0, source: 0, capture: 0 };
    const dependencies = syntheticDependencies(frozen);
    dependencies.validateModelArtifacts = () => { counters.model += 1; };
    dependencies.validateProductionRuntime = () => { counters.runtime += 1; };
    dependencies.resolveSourceIdentity = () => { counters.source += 1; };
    dependencies.loadCapture = () => { counters.capture += 1; };
    frozen.input.openingRecord = {
        ...frozen.input.openingRecord,
        status: "not_opened",
    };
    await assert.rejects(
        scoreTrackOHeldOutCapturePair(frozen.input, dependencies),
        /opening record identity or status|digest does not match/,
    );
    assert.deepEqual(counters, { model: 0, runtime: 0, source: 0, capture: 0 });
});

test("Track O emits separate opening-bound scores and product replays for the pair", async () => {
    const frozen = fixture();
    const dependencies = syntheticDependencies(frozen);
    const result = await scoreTrackOHeldOutCapturePair(frozen.input, dependencies);

    assert.notEqual(result.positive.score.sha256, result.negative.score.sha256);
    assert.equal(result.positive.score.schemaVersion, "satori_search_ranking_track_l_scores_v2");
    assert.equal(result.positive.score.heldOutOpeningSha256, frozen.input.openingRecord.sha256);
    assert.equal(result.negative.score.heldOutOpeningSha256, frozen.input.openingRecord.sha256);
    assert.equal(
        result.positive.score.captures[0].captureSha256,
        frozen.captures.positive.sha256,
    );
    assert.equal(
        result.negative.score.captures[0].captureSha256,
        frozen.captures.negative.sha256,
    );
    assert.deepEqual(result.positive.score.contract.trackO.exclusions, [{
        taskId: EXCLUDED_TASK_ID,
        reason: "pre_open_held_out_payload_exposure",
        decisionBearing: false,
        scored: false,
    }]);
    assert.deepEqual(
        result.positive.score.contract.trackO,
        result.negative.score.contract.trackO,
    );
    assert.deepEqual(result.positive.score.source, {
        repositoryId: "synthetic-repository",
        revision: REVISION,
        tree: TREE,
        sourceTreeSha256: DIGEST_A,
    });
    for (const role of ["positive", "negative"]) {
        assert.equal(result[role].replay.diagnosticQualityOnly, false);
        assert.equal(result[role].replay.sourceNeuralScoreSha256, result[role].score.sha256);
        assert.equal(
            result[role].replay.heldOutOpeningSha256,
            frozen.input.openingRecord.sha256,
        );
        assert.deepEqual(
            result[role].score.tasks.map(({ taskId }) => taskId),
            frozen.captures[role].captures.map(({ taskId }) => taskId),
        );
    }
    assert.equal(dependencies.replayOptions.length, 2);
    assert.ok(dependencies.replayOptions.every((options) => (
        options.diagnosticQualityOnly === false
        && options.expectedManifestSeal === DIGEST_C
    )));
});

test("Track O protocol exclusion cannot reach the scoring kernel", async () => {
    const frozen = fixture();
    frozen.captures.positive = sign({
        ...frozen.captures.positive,
        sha256: undefined,
        captures: [{
            taskId: EXCLUDED_TASK_ID,
            split: "held_out",
            queryClass: "owner_discovery",
        }],
    });
    const dependencies = syntheticDependencies(frozen);
    let scoreCalls = 0;
    dependencies.scoreTasks = async () => {
        scoreCalls += 1;
        return [];
    };
    await assert.rejects(
        scoreTrackOHeldOutCapturePair(frozen.input, dependencies),
        /Protocol-excluded task .* must not reach Track O scoring/,
    );
    assert.equal(scoreCalls, 0);
});

test("Track O production scoring emits replay evidence without fabricated encodings", async () => {
    const frozen = fixture();
    const dependencies = syntheticDependencies(frozen);
    delete dependencies.scoreTasks;
    dependencies.buildProjection = async ({ taskCapture, candidateDepth }) => ({
        query: `query:${taskCapture.taskId}`,
        candidateDepth,
        familyCount: 1,
        supplementalCandidateCount: 0,
        candidatePoolCount: 1,
        selectedCandidateIds: [`candidate:${taskCapture.taskId}`],
        documents: [`document:${taskCapture.taskId}`],
        projections: [{
            candidateId: `candidate:${taskCapture.taskId}`,
            sha256: DIGEST_A,
            utf8Bytes: 10,
            version: "search_rerank_document_v2",
        }],
    });
    dependencies.createRuntime = async ({ profileFile, workerPath }) => {
        assert.equal(profileFile, frozen.input.runtimeProfileFile);
        assert.equal(workerPath, "/synthetic/lateon-reranker-worker.js");
        return {
            getIdentity: () => ({ provider: "lateon", model: "synthetic", profile: DIGEST_A }),
            waitUntilReady: async () => {},
            rerank: async (_query, _documents, { identities }) => (
                identities.map((_identity, index) => ({ index, relevanceScore: 1 - index }))
            ),
            close: async () => {},
        };
    };

    const result = await scoreTrackOHeldOutCapturePair(frozen.input, dependencies);
    for (const role of ["positive", "negative"]) {
        const task = result[role].score.tasks[0];
        assert.deepEqual(task.ranking, [{
            candidateId: `candidate:${role}-task`,
            score: 1,
        }]);
        assert.equal(task.projections[0].version, "search_rerank_document_v2");
        assert.equal("queryEncoding" in task, false);
        assert.equal("documentEncodings" in task, false);
    }
});

test("captured projection owner reconstructs production v2 documents synthetically", async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "satori-track-o-projection-"));
    try {
        const sourceRoot = path.join(temporary, "source");
        const relativePath = "src/owner.ts";
        const absoluteFile = path.join(sourceRoot, relativePath);
        const content = "export function owner() {\n    return 'owner';\n}\n";
        fs.mkdirSync(path.dirname(absoluteFile), { recursive: true });
        fs.writeFileSync(absoluteFile, content, "utf8");
        const chunk = {
            content: content.trimEnd(),
            metadata: {
                startLine: 1,
                endLine: 3,
                symbolKind: "function",
                symbolLabel: "owner",
            },
        };
        const candidateId = buildIndexedChunkId(relativePath, chunk, 0);
        const taskCapture = {
            taskId: "synthetic-owner",
            queryPlan: { queryIntent: { semanticQuery: "find owner" } },
            candidateTrace: {
                stages: [
                    {
                        stage: "mcp_filtered",
                        passId: "attempt-1",
                        candidates: [{
                            candidateId,
                            relativePath,
                            startLine: 1,
                            endLine: 3,
                            language: "typescript",
                            ownerId: JSON.stringify(["symbol", "owner-key", "owner-instance"]),
                        }],
                    },
                    {
                        stage: "mcp_replay_signals",
                        passId: "attempt-1",
                        candidates: [{ candidateId, replay: { symbolLabel: "owner" } }],
                    },
                ],
            },
        };
        const result = await buildCapturedRerankProjectionV2({
            taskCapture,
            candidateDepth: 32,
            sourceRoot,
            analysisService: { analyze: async () => ({ chunks: [chunk] }) },
        });
        assert.deepEqual(result.selectedCandidateIds, [candidateId]);
        assert.equal(result.documents.length, 1);
        assert.equal(result.projections[0].version, "search_rerank_document_v2");
        assert.equal(result.projections[0].sha256.length, 64);
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});

test("Track O output paths are exclusive and outside both repositories", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "satori-track-o-outputs-"));
    try {
        const sourceRoot = path.join(temporary, "source");
        const outputRoot = path.join(temporary, "outputs");
        fs.mkdirSync(sourceRoot);
        fs.mkdirSync(outputRoot);
        const outputs = ["positive-score", "negative-score", "positive-replay", "negative-replay"]
            .map((name) => path.join(outputRoot, `${name}.json`));
        assert.deepEqual(validateTrackOOutputPaths(outputs, sourceRoot), outputs);
        assert.throws(
            () => validateTrackOOutputPaths([
                path.join(sourceRoot, "inside.json"),
                ...outputs.slice(1),
            ], sourceRoot),
            /outside clean source repositories/,
        );
        fs.writeFileSync(outputs[0], "occupied", "utf8");
        assert.throws(
            () => validateTrackOOutputPaths(outputs, sourceRoot),
            /already exists/,
        );
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});
