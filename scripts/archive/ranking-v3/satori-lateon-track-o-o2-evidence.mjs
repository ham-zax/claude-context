import crypto from "node:crypto";
import process from "node:process";

export const PRODUCT_FALLBACK_TEST_NAME =
    "handleSearchCode restores the exact product result state for every LateOn failure";
export const PAGINATION_CONTROL_TEST_NAME =
    "search continuation preserves deterministic and LateOn-ranked grouped order without recomputation";
export const PRODUCT_FALLBACK_TEST_PATH = "packages/mcp/src/core/handlers.scope.test.ts";

const EXPECTED_QUALITY_TASKS = 36;
const EXPECTED_NEURAL_REQUESTS = 34;
const EXPECTED_SAFETY_TASKS = 2;
const POLICY_INVARIANT_CONTROLS = Object.freeze([
    "edge-tts-app-r0/edge-voice-options",
    "rpc-r0/rpc-strictness-config",
]);
const DRAINED_OPERATIONAL_SNAPSHOT = Object.freeze({
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
const OBSERVATION_COUNT_FIELDS = Object.freeze({
    processColdReadiness: "processColdWorkerStarts",
    coldFirstScore: "coldFirstScoreRequests",
    warmScore: "warmRequests",
    queueSaturation: "queueSaturationRepetitions",
    queuedCancellation: "queuedCancellationRepetitions",
    executingCancellation: "executingCancellationRepetitions",
    activeAndQueuedShutdown: "activeAndQueuedShutdownRepetitions",
    malformedOutput: "malformedOutputRepetitions",
    workerFailure: "workerFailureRepetitions",
});

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [
            key,
            canonicalize(value[key]),
        ]));
    }
    return value;
}

function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
}

function sha256Canonical(value) {
    return crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function requireEqual(actual, expected, label) {
    if (canonicalJson(actual) !== canonicalJson(expected)) {
        throw new Error(`${label} does not match the independently derived O2 value.`);
    }
}

function gate(actual, limit, passed) {
    return { passed, actual, limit };
}

function nearestRankPercentile(values, percentile) {
    if (values.length === 0 || percentile <= 0 || percentile > 1) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.ceil(percentile * sorted.length) - 1];
}

function validateObservationRows(observations, counts) {
    const actualCounts = {};
    for (const [observationKey, countField] of Object.entries(OBSERVATION_COUNT_FIELDS)) {
        const rows = observations[observationKey];
        if (!Array.isArray(rows) || rows.length !== counts[countField]) {
            throw new Error(`O2 observation '${observationKey}' count is incomplete.`);
        }
        for (const row of rows) {
            const { observationSha256, ...unsigned } = row;
            if (!/^[a-f0-9]{64}$/.test(observationSha256)
                || observationSha256 !== sha256Canonical(unsigned)) {
                throw new Error(`O2 observation '${observationKey}' digest is invalid.`);
            }
        }
        actualCounts[countField] = rows.length;
    }
    return actualCounts;
}

function validateRuntimeFailureReasons(observations) {
    const simpleReasons = {
        queuedCancellation: "lateon_cancelled",
        executingCancellation: "lateon_cancelled",
        malformedOutput: "lateon_invalid_output",
        workerFailure: "lateon_worker_failure",
    };
    for (const [kind, reason] of Object.entries(simpleReasons)) {
        if (!observations[kind].every((row) => (
            row.outcome === "baseline_fallback"
            && row.operationalReason === reason
        ))) return false;
    }
    if (!observations.queueSaturation.every((row) => (
        row.capacityFallback?.outcome === "baseline_fallback"
        && row.capacityFallback.operationalReason === "lateon_capacity_fallback"
        && row.queuedSuccess?.outcome === "complete"
        && row.queuedSuccess.permutationValidated === true
        && row.queuedTimeout?.outcome === "baseline_fallback"
        && row.queuedTimeout.operationalReason === "lateon_queue_timeout"
        && row.shortActiveOutcome === "complete"
        && row.timeoutActiveOutcome === "complete"
    ))) return false;
    return observations.activeAndQueuedShutdown.every((row) => (
        row.active?.outcome === "baseline_fallback"
        && row.active.operationalReason === "lateon_cancelled"
        && row.queued?.outcome === "baseline_fallback"
        && row.queued.operationalReason === "lateon_cancelled"
        && canonicalJson(row.operationalSnapshot) === canonicalJson(DRAINED_OPERATIONAL_SNAPSHOT)
    ));
}

function focusedTestCommand(testName) {
    return {
        executable: process.execPath,
        args: [
            "--import",
            "tsx",
            "--import",
            "./src/test-state-root.ts",
            "--test",
            "--test-concurrency=1",
            `--test-name-pattern=^${testName}$`,
            "src/core/handlers.scope.test.ts",
        ],
        cwd: "packages/mcp",
    };
}

function validateProductProof(proof, implementationArtifacts, authority) {
    const expectedCommands = [
        {
            executable: "pnpm",
            args: ["--filter", "@zokizuan/satori-core", "build"],
            cwd: ".",
        },
        focusedTestCommand(PRODUCT_FALLBACK_TEST_NAME),
        focusedTestCommand(PAGINATION_CONTROL_TEST_NAME),
    ];
    const expectedTests = [
        { role: "fallback_result_state", name: PRODUCT_FALLBACK_TEST_NAME },
        { role: "pagination_no_recomputation", name: PAGINATION_CONTROL_TEST_NAME },
    ].map((test) => ({
        ...test,
        source: implementationArtifacts.productFallbackTest,
    }));
    const commonValid = proof?.status === "passed"
        && canonicalJson(proof.tests) === canonicalJson(expectedTests)
        && proof.commandIdentity?.nodeVersion === authority.targetHost?.node
        && proof.commandIdentity?.packageManager === "pnpm@10.28.2"
        && canonicalJson(proof.commandIdentity?.commands) === canonicalJson(expectedCommands);
    return { fallback: commonValid, pagination: commonValid };
}

export function deriveO2MeasurementOutcome({
    authority,
    requestBinding,
    observations,
    peakRssBytes,
    retainedRssBytes,
    productFallbackProof,
    implementationArtifacts,
}) {
    const counts = authority.operationalQualification.observationCounts;
    const bounds = authority.qualifiedServiceProfile.operationalBounds;
    const actualCounts = validateObservationRows(observations, counts);
    const readinessTimings = observations.processColdReadiness
        .map(({ elapsedMilliseconds }) => elapsedMilliseconds);
    const coldTimings = observations.coldFirstScore
        .map(({ elapsedMilliseconds }) => elapsedMilliseconds);
    const warmTimings = observations.warmScore.map(({ elapsedMilliseconds }) => elapsedMilliseconds);
    const queueWaitTimings = observations.queueSaturation.flatMap(({
        queuedSuccess,
        queuedTimeout,
    }) => [queuedSuccess.elapsedMilliseconds, queuedTimeout.elapsedMilliseconds]);
    const scoringRows = [...observations.coldFirstScore, ...observations.warmScore];
    const incompleteOrderCount = scoringRows.filter(({ outcome }) => outcome !== "complete").length;
    const allPermutationsValid = scoringRows.every(({ outcome, permutationValidated }) => (
        outcome === "complete" && permutationValidated === true
    ));
    const requestAuthorityValid = requestBinding.totalTasks === EXPECTED_QUALITY_TASKS
        && requestBinding.neuralEligibleRequests === EXPECTED_NEURAL_REQUESTS
        && requestBinding.safetyTaskCount === EXPECTED_SAFETY_TASKS
        && /^[a-f0-9]{64}$/.test(requestBinding.requestSetSha256)
        && canonicalJson(requestBinding.policyInvariantControls.map(({ id }) => id))
            === canonicalJson(POLICY_INVARIANT_CONTROLS);
    const exactControlsValid = canonicalJson(
        requestBinding.safetyControls.flatMap(({ controls }) => controls).sort(),
    ) === canonicalJson(["configuration_pin", "exact_identifier", "must"]);
    const runtimeReasonsValid = validateRuntimeFailureReasons(observations);
    const productProof = validateProductProof(
        productFallbackProof,
        implementationArtifacts,
        authority,
    );
    const baselineReplayValid = requestBinding.repositories.length === 6
        && requestBinding.repositories.every(({ baselineReplaySha256 }) => (
            /^[a-f0-9]{64}$/.test(baselineReplaySha256)
        ));
    const lifecycleLeakCount = observations.activeAndQueuedShutdown
        .filter(({ operationalSnapshot }) => (
            canonicalJson(operationalSnapshot) !== canonicalJson(DRAINED_OPERATIONAL_SNAPSHOT)
        )).length;
    const readinessP95 = nearestRankPercentile(readinessTimings, 0.95);
    const warmP95 = nearestRankPercentile(warmTimings, 0.95);
    const readinessMaximum = Math.max(...readinessTimings);
    const coldMaximum = Math.max(...coldTimings);
    const warmMaximum = Math.max(...warmTimings);
    const rerankerStageMaximum = Math.max(...coldTimings, ...warmTimings, ...queueWaitTimings);
    const resources = {
        peakRssBytes,
        retainedRssBytes,
        readinessP95Milliseconds: readinessP95,
        readinessMaximumMilliseconds: readinessMaximum,
        coldFirstScoreMaximumMilliseconds: coldMaximum,
        warmP95Milliseconds: warmP95,
        warmMaximumMilliseconds: warmMaximum,
        queueWaitMaximumMilliseconds: Math.max(...queueWaitTimings),
    };
    const gates = {
        authorityIdentity: gate(true, true, true),
        modelArtifactIdentity: gate(true, true, true),
        sourceIdentity: gate(true, true, true),
        tuningRequestReconstruction: gate(requestAuthorityValid ? 0 : 1, 0, requestAuthorityValid),
        processColdFailures: gate(
            observations.processColdReadiness.filter(({ outcome }) => outcome !== "ready").length,
            0,
            observations.processColdReadiness.every(({ outcome }) => outcome === "ready"),
        ),
        processColdReadinessP95: gate(readinessP95, bounds.maximumReadinessP95Milliseconds,
            readinessP95 <= bounds.maximumReadinessP95Milliseconds),
        processColdReadinessMaximum: gate(readinessMaximum, bounds.maximumReadinessMilliseconds,
            readinessMaximum <= bounds.maximumReadinessMilliseconds),
        coldFirstScoreMaximum: gate(coldMaximum, bounds.maximumColdFirstScoreMilliseconds,
            coldMaximum <= bounds.maximumColdFirstScoreMilliseconds),
        warmScoreP95: gate(warmP95, bounds.maximumWarmScoreP95Milliseconds,
            warmP95 <= bounds.maximumWarmScoreP95Milliseconds),
        warmScoreMaximum: gate(warmMaximum, bounds.maximumScoreMilliseconds,
            warmMaximum <= bounds.maximumScoreMilliseconds),
        rerankerStageMaximum: gate(rerankerStageMaximum, bounds.maximumRerankerStageMilliseconds,
            rerankerStageMaximum <= bounds.maximumRerankerStageMilliseconds),
        peakRss: gate(peakRssBytes, bounds.maximumProcessPeakRssBytes,
            peakRssBytes <= bounds.maximumProcessPeakRssBytes),
        retainedRss: gate(retainedRssBytes, bounds.maximumProcessRetainedRssBytes,
            retainedRssBytes <= bounds.maximumProcessRetainedRssBytes),
        invalidOrIncompleteOrders: gate(incompleteOrderCount, bounds.maximumInvalidOrIncompleteOrders,
            incompleteOrderCount <= bounds.maximumInvalidOrIncompleteOrders),
        candidateMembership: gate(allPermutationsValid ? 0 : 1, 0, allPermutationsValid),
        eligibility: gate(baselineReplayValid ? 0 : 1, 0, baselineReplayValid),
        groupIdentity: gate(
            baselineReplayValid && allPermutationsValid ? 0 : 1,
            0,
            baselineReplayValid && allPermutationsValid,
        ),
        paginationExactMustControls: gate(
            exactControlsValid && baselineReplayValid && productProof.pagination ? 0 : 1,
            0,
            exactControlsValid && baselineReplayValid && productProof.pagination,
        ),
        runtimeFailureReasons: gate(runtimeReasonsValid ? 0 : 1, 0, runtimeReasonsValid),
        fallbackResultState: gate(productProof.fallback ? 0 : 1, 0, productProof.fallback),
        lifecycleLeaks: gate(lifecycleLeakCount, 0, lifecycleLeakCount === 0),
        scenarioCounts: gate(actualCounts, counts, canonicalJson(actualCounts) === canonicalJson(counts)),
    };
    return { resources, gates };
}

export function validateO2MeasurementOutcome(evidence, authority) {
    const derived = deriveO2MeasurementOutcome({
        authority,
        requestBinding: evidence.tuningRequestSet,
        observations: evidence.observations,
        peakRssBytes: evidence.resources.peakRssBytes,
        retainedRssBytes: evidence.resources.retainedRssBytes,
        productFallbackProof: evidence.productFallbackProof,
        implementationArtifacts: evidence.implementationArtifacts,
    });
    requireEqual(evidence.resources, derived.resources, "O2 resources");
    requireEqual(evidence.gates, derived.gates, "O2 gates");
    return derived;
}
