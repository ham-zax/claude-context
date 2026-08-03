import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import {
    LATEON_RUNTIME_PROFILE_IDS,
    LateOnReranker,
} from "../packages/mcp/src/server/lateon-reranker.ts";
import {
    O2_EVIDENCE_SCHEMA,
    annotateRequestTokenMetrics,
    buildCounterbalancedWarmSchedule,
    buildO2Evidence,
    buildO2Receipt,
    completeOrderDigest,
    runProductFallbackProof,
    runFailureScenarios,
    selectWorstTrackORequest,
    sha256Canonical,
} from "./satori-lateon-track-o-o2.mjs";
import {
    PAGINATION_CONTROL_TEST_NAME,
    PRODUCT_FALLBACK_TEST_NAME,
    PRODUCT_FALLBACK_TEST_PATH,
    validateO2MeasurementOutcome,
} from "./satori-lateon-track-o-o2-evidence.mjs";

const PROFILE = {
    inference: {
        queryPrefix: "[Q] ",
        documentPrefix: "[D] ",
        lowercase: true,
        queryTokenLimit: 256,
        documentTokenLimit: 2048,
    },
};

function request(repositoryId, taskId, size = 2) {
    return {
        id: `${repositoryId}/${taskId}`,
        repositoryId,
        taskId,
        query: `query ${taskId}`,
        documents: Array.from({ length: size }, (_value, index) => `document ${index}`),
        identities: Array.from({ length: size }, (_value, index) => `${taskId}-${index}`),
        projectionSha256s: [],
        safetyControls: [],
        baselineResultStateSha256: "b".repeat(64),
    };
}

function observation(ordinal, requestId, elapsedMilliseconds, outcome = "complete") {
    const value = {
        ordinal,
        requestId,
        elapsedMilliseconds,
        ...(outcome === "complete" ? { permutationValidated: true } : {}),
        outcome,
    };
    return { ...value, observationSha256: sha256Canonical(value) };
}

function scenarioObservation(kind, ordinal = 1) {
    const value = {
        ordinal,
        outcome: "baseline_fallback",
        operationalReason: kind,
        baselineResultStateSha256: "b".repeat(64),
    };
    return { ...value, observationSha256: sha256Canonical(value) };
}

function evidenceFixture() {
    const counts = {
        processColdWorkerStarts: 2,
        coldFirstScoreRequests: 2,
        warmRequests: 4,
        queueSaturationRepetitions: 1,
        queuedCancellationRepetitions: 1,
        executingCancellationRepetitions: 1,
        activeAndQueuedShutdownRepetitions: 1,
        malformedOutputRepetitions: 1,
        workerFailureRepetitions: 1,
    };
    const candidate = {
        id: "projection-v2-d-l32",
        candidateDepth: 32,
        projection: { id: "search_rerank_document_v2", sha256: "c".repeat(64) },
        model: { repository: "lightonai/LateOn-Code-edge", revision: "d".repeat(40) },
        artifacts: [{ role: "onnx_fp32", path: "model.onnx", sha256: "e".repeat(64) }],
    };
    const authorityBinding = {
        authorityFileSha256:
            "994b79b634684c851fa21f388adaf1fc5cbec92200103d5fd48ee7e592d36a39",
        expectedAuthorityFileSha256:
            "994b79b634684c851fa21f388adaf1fc5cbec92200103d5fd48ee7e592d36a39",
        candidate,
        profileBinding: {
            id: "lateon_offline_quality_projection_v2_d32_v1",
            assetFileSha256: "1".repeat(64),
            assetCanonicalSha256: "2".repeat(64),
            effectiveIdentitySha256: "3".repeat(64),
        },
        authority: {
            targetHost: { node: process.versions.node },
            operationalQualification: {
                observationCounts: counts,
                coldDefinition: "process_cold",
                requestSelection: ["tokens", "bytes", "identity"],
                warmSchedule: "counterbalanced",
                percentile: "nearest_rank",
                rssSamplingMilliseconds: 25,
                retainedRssCooldownMilliseconds: 1000,
                explicitGarbageCollection: false,
                selectiveRerunsPermitted: false,
            },
            qualifiedServiceProfile: {
                operationalBounds: {
                    maximumReadinessP95Milliseconds: 1300,
                    maximumReadinessMilliseconds: 2000,
                    maximumColdFirstScoreMilliseconds: 2000,
                    maximumWarmScoreP95Milliseconds: 1750,
                    maximumScoreMilliseconds: 2000,
                    maximumRerankerStageMilliseconds: 2500,
                    maximumProcessPeakRssBytes: 1_000_000,
                    maximumProcessRetainedRssBytes: 900_000,
                    maximumInvalidOrIncompleteOrders: 0,
                },
            },
            heldOutDecision: {
                manifest: {
                    fileSha256: "4".repeat(64),
                    canonicalSealSha256: "5".repeat(64),
                },
            },
        },
    };
    const shutdownValue = {
        ordinal: 1,
        active: {
            outcome: "baseline_fallback",
            operationalReason: "lateon_cancelled",
            baselineResultStateSha256: "b".repeat(64),
        },
        queued: {
            outcome: "baseline_fallback",
            operationalReason: "lateon_cancelled",
            baselineResultStateSha256: "b".repeat(64),
        },
        operationalSnapshot: {
            state: "closed",
            closed: true,
            workerAttached: false,
            activeRequest: false,
            activeTask: false,
            queuedRequest: false,
            pendingWorkerRequests: 0,
            readinessTimerActive: false,
            terminationActive: false,
        },
    };
    const queueSaturationValue = {
        ordinal: 1,
        shortActiveOutcome: "complete",
        queuedSuccess: {
            elapsedMilliseconds: 100,
            outcome: "complete",
            orderSha256: "c".repeat(64),
            permutationValidated: true,
        },
        capacityFallback: {
            elapsedMilliseconds: 1,
            outcome: "baseline_fallback",
            operationalReason: "lateon_capacity_fallback",
            baselineResultStateSha256: "b".repeat(64),
        },
        queuedTimeout: {
            elapsedMilliseconds: 250,
            outcome: "baseline_fallback",
            operationalReason: "lateon_queue_timeout",
            baselineResultStateSha256: "b".repeat(64),
        },
        timeoutActiveOutcome: "complete",
    };
    const scenarioMeasurements = {
        queueSaturation: [{
            ...queueSaturationValue,
            observationSha256: sha256Canonical(queueSaturationValue),
        }],
        queuedCancellation: [scenarioObservation("lateon_cancelled")],
        executingCancellation: [scenarioObservation("lateon_cancelled")],
        activeAndQueuedShutdown: [{
            ...shutdownValue,
            observationSha256: sha256Canonical(shutdownValue),
        }],
        malformedOutput: [scenarioObservation("lateon_invalid_output")],
        workerFailure: [scenarioObservation("lateon_worker_failure")],
    };
    return {
        authorityBinding,
        sourceIdentity: { revision: "6".repeat(40), tree: "7".repeat(40) },
        requestBinding: {
            repositoryCount: 6,
            totalTasks: 36,
            neuralEligibleRequests: 34,
            policyInvariantControls: [
                {
                    id: "edge-tts-app-r0/edge-voice-options",
                    route: "exact_registry",
                    baselineResultStateSha256: "b".repeat(64),
                },
                {
                    id: "rpc-r0/rpc-strictness-config",
                    route: "exact_registry",
                    baselineResultStateSha256: "b".repeat(64),
                },
            ],
            safetyTaskCount: 2,
            safetyControls: [
                {
                    id: "edge/exact",
                    controls: ["exact_identifier"],
                    baselineResultStateSha256: "b".repeat(64),
                },
                {
                    id: "rpc/must",
                    controls: ["must", "configuration_pin"],
                    baselineResultStateSha256: "b".repeat(64),
                },
            ],
            captureAuthorityFileSha256: "8".repeat(64),
            aggregateCaptureSha256: "9".repeat(64),
            repositories: Array.from({ length: 6 }, (_value, index) => ({
                id: `repo-${index + 1}`,
                baselineReplaySha256: `${index + 1}`.repeat(64),
            })),
            requestSetSha256: "a".repeat(64),
        },
        worstRequest: {
            ...request("repo-a", "task-a"),
            aggregateRetainedTokenCount: 100,
            aggregateInputTensorBytes: 1600,
        },
        warmSchedule: Array.from({ length: 4 }, () => request("repo-a", "task-a")),
        realMeasurements: {
            processColdReadiness: [
                observation(1, "repo-a/task-a", 100, "ready"),
                observation(2, "repo-a/task-a", 110, "ready"),
            ],
            coldFirstScore: [
                observation(1, "repo-a/task-a", 200),
                observation(2, "repo-a/task-a", 210),
            ],
            warmScore: [
                observation(1, "repo-a/task-a", 150),
                observation(2, "repo-a/task-a", 160),
                observation(3, "repo-a/task-a", 170),
                observation(4, "repo-a/task-a", 180),
            ],
            peakRssBytes: 800_000,
            retainedRssBytes: 700_000,
        },
        scenarioMeasurements,
        implementationArtifacts: {
            projectionSource: { path: "projection.ts", sha256: "1".repeat(64) },
            runtimeSource: { path: "runtime.ts", sha256: "2".repeat(64) },
            runtimeWorker: { path: "worker.js", sha256: "5".repeat(64) },
            measurementScript: { path: "measurement.mjs", sha256: "3".repeat(64) },
            scenarioWorker: { path: "fixture.cjs", sha256: "4".repeat(64) },
            evidenceDerivation: { path: "evidence.mjs", sha256: "7".repeat(64) },
            baselineReplayOwner: { path: "replay.mjs", sha256: "8".repeat(64) },
            productFallbackTest: { path: PRODUCT_FALLBACK_TEST_PATH, sha256: "6".repeat(64) },
        },
        hostIdentity: { cpu: "fixture" },
        productFallbackProof: {
            status: "passed",
            tests: [
                { role: "fallback_result_state", name: PRODUCT_FALLBACK_TEST_NAME },
                { role: "pagination_no_recomputation", name: PAGINATION_CONTROL_TEST_NAME },
            ].map((entry) => ({
                ...entry,
                source: { path: PRODUCT_FALLBACK_TEST_PATH, sha256: "6".repeat(64) },
            })),
            commandIdentity: {
                packageManager: "pnpm@10.28.2",
                nodeVersion: process.versions.node,
                commands: [
                    {
                        executable: "pnpm",
                        args: ["--filter", "@zokizuan/satori-core", "build"],
                        cwd: ".",
                    },
                    {
                        executable: process.execPath,
                        args: [
                            "--import",
                            "tsx",
                            "--import",
                            "./src/test-state-root.ts",
                            "--test",
                            "--test-concurrency=1",
                            `--test-name-pattern=^${PRODUCT_FALLBACK_TEST_NAME}$`,
                            "src/core/handlers.scope.test.ts",
                        ],
                        cwd: "packages/mcp",
                    },
                    {
                        executable: process.execPath,
                        args: [
                            "--import",
                            "tsx",
                            "--import",
                            "./src/test-state-root.ts",
                            "--test",
                            "--test-concurrency=1",
                            `--test-name-pattern=^${PAGINATION_CONTROL_TEST_NAME}$`,
                            "src/core/handlers.scope.test.ts",
                        ],
                        cwd: "packages/mcp",
                    },
                ],
            },
        },
    };
}

test("Track O selects the worst request by retained tokens, tensor bytes, then identity", async () => {
    const tokenizer = async (text) => ({
        input_ids: { dims: [1, text.includes("largest") ? 20 : 10] },
    });
    const annotated = await annotateRequestTokenMetrics([
        { ...request("repo", "z"), query: "largest" },
        { ...request("repo", "a"), query: "largest" },
        request("repo", "smaller"),
    ], tokenizer, PROFILE);

    const selected = selectWorstTrackORequest(annotated);
    assert.equal(selected.id, "repo/a");
    assert.equal(selected.aggregateInputTensorBytes, selected.aggregateRetainedTokenCount * 16);
});

test("Track O warm schedule is canonical, reversed, then deterministically rotated", () => {
    const requests = [
        request("b", "2"), request("a", "2"), request("a", "1"), request("b", "1"),
    ];
    const schedule = buildCounterbalancedWarmSchedule(requests, 12).map(({ id }) => id);

    assert.deepEqual(schedule.slice(0, 4), ["a/1", "a/2", "b/1", "b/2"]);
    assert.deepEqual(schedule.slice(4, 8), ["b/2", "b/1", "a/2", "a/1"]);
    assert.deepEqual(schedule.slice(8), ["a/1", "a/2", "b/1", "b/2"]);
});

test("Track O evidence and receipt bind the complete passing qualification", () => {
    const fixture = evidenceFixture();
    const evidence = buildO2Evidence(fixture);
    const evidenceBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
    const receipt = buildO2Receipt({
        evidence,
        evidenceFileBytes: evidenceBytes,
        sourceIdentity: fixture.sourceIdentity,
        authorityBinding: fixture.authorityBinding,
        implementationArtifacts: fixture.implementationArtifacts,
    });

    assert.equal(evidence.schemaVersion, O2_EVIDENCE_SCHEMA);
    assert.equal(evidence.status, "passed");
    assert.equal(evidence.sha256, sha256Canonical((({ sha256: _ignored, ...rest }) => rest)(evidence)));
    assert.equal(receipt.qualificationEvidence.resultSha256, evidence.sha256);
    assert.equal(receipt.status, "passed");
    assert.deepEqual(
        Object.keys(receipt.implementationArtifacts).sort(),
        [
            "measurementScript",
            "projectionSource",
            "runtimeSource",
            "runtimeWorker",
            "scenarioWorker",
            "evidenceDerivation",
            "baselineReplayOwner",
            "productFallbackTest",
        ].sort(),
    );
});

test("Track O never emits a passing receipt from failed evidence", () => {
    const fixture = evidenceFixture();
    fixture.realMeasurements.warmScore[3] = observation(4, "repo-a/task-a", 2100);
    const evidence = buildO2Evidence(fixture);

    assert.equal(evidence.status, "failed");
    assert.equal(evidence.gates.warmScoreMaximum.passed, false);
    assert.throws(() => buildO2Receipt({
        evidence,
        evidenceFileBytes: Buffer.from(JSON.stringify(evidence)),
        sourceIdentity: fixture.sourceIdentity,
        authorityBinding: fixture.authorityBinding,
        implementationArtifacts: fixture.implementationArtifacts,
    }), /requires passing/);
});

test("Track O independently rejects tampered measured resources", () => {
    const fixture = evidenceFixture();
    const evidence = buildO2Evidence(fixture);
    evidence.resources.warmMaximumMilliseconds += 1;

    assert.throws(
        () => validateO2MeasurementOutcome(evidence, fixture.authorityBinding.authority),
        /O2 resources/,
    );
});

test("Track O independently rejects a re-signed incomplete observation set", () => {
    const fixture = evidenceFixture();
    const evidence = buildO2Evidence(fixture);
    evidence.observations.warmScore.pop();

    assert.throws(
        () => validateO2MeasurementOutcome(evidence, fixture.authorityBinding.authority),
        /count is incomplete/,
    );
});

test("Track O rejects out-of-bounds neural indexes", () => {
    const baseRequest = request("repo", "task", 2);
    assert.throws(() => completeOrderDigest(baseRequest, [
        { index: 0, relevanceScore: 1 },
        { index: 2, relevanceScore: 0 },
    ]), /invalid neural order/);
});

test("Track O product fallback proof uses only the fixed focused commands", () => {
    const commands = [];
    const proof = runProductFallbackProof({
        repoRoot: path.resolve("."),
        runCommand: (command) => commands.push(command),
    });

    assert.equal(proof.status, "passed");
    assert.deepEqual(proof.tests.map(({ name }) => name), [
        PRODUCT_FALLBACK_TEST_NAME,
        PAGINATION_CONTROL_TEST_NAME,
    ]);
    assert.equal(proof.tests[0].source.path, PRODUCT_FALLBACK_TEST_PATH);
    assert.equal(commands.length, 3);
    assert.deepEqual(commands[1].args.slice(-2), [
        `--test-name-pattern=^${PRODUCT_FALLBACK_TEST_NAME}$`,
        "src/core/handlers.scope.test.ts",
    ]);
    assert.deepEqual(commands[2].args.slice(-2), [
        `--test-name-pattern=^${PAGINATION_CONTROL_TEST_NAME}$`,
        "src/core/handlers.scope.test.ts",
    ]);
});

test("Track O synthetic worker proves every frozen failure outcome without a model", async (t) => {
    const fixtureWorker = path.resolve("scripts/satori-lateon-track-o-o2-fixture-worker.cjs");
    const modelRoot = fs.mkdtempSync(path.join(os.tmpdir(), "satori-o2-model-unused-"));
    t.after(() => fs.rmSync(modelRoot, { recursive: true, force: true }));
    const baseRequest = request("repo", "task", 2);
    const scenarios = await runFailureScenarios({
        runtimeFactory: () => new LateOnReranker({
            modelDirectory: modelRoot,
            profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
            workerPath: fixtureWorker,
        }),
        request: baseRequest,
        counts: {
            queueSaturationRepetitions: 1,
            queuedCancellationRepetitions: 1,
            executingCancellationRepetitions: 1,
            activeAndQueuedShutdownRepetitions: 1,
            malformedOutputRepetitions: 1,
            workerFailureRepetitions: 1,
        },
    });

    assert.equal(
        scenarios.queueSaturation[0].capacityFallback.operationalReason,
        "lateon_capacity_fallback",
    );
    assert.equal(
        scenarios.queueSaturation[0].queuedTimeout.operationalReason,
        "lateon_queue_timeout",
    );
    assert.equal(scenarios.queueSaturation[0].queuedSuccess.outcome, "complete");
    assert.equal(scenarios.queuedCancellation[0].operationalReason, "lateon_cancelled");
    assert.equal(scenarios.executingCancellation[0].operationalReason, "lateon_cancelled");
    assert.deepEqual(scenarios.activeAndQueuedShutdown[0].operationalSnapshot, {
        state: "closed",
        closed: true,
        workerAttached: false,
        activeRequest: false,
        activeTask: false,
        queuedRequest: false,
        pendingWorkerRequests: 0,
        readinessTimerActive: false,
        terminationActive: false,
    });
    assert.equal(scenarios.malformedOutput[0].operationalReason, "lateon_invalid_output");
    assert.equal(scenarios.workerFailure[0].operationalReason, "lateon_worker_failure");
});
