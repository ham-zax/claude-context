#!/usr/bin/env -S node --import tsx
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
    averageTaskMetrics,
    bootstrapInterval,
    buildBootstrapSamples,
    diffDisclosedLists,
    metricForRank,
    ownerRank,
} from "./satori-search-ranking-r2.mjs";
import {
    replayCandidateCapture,
    replayNeuralCandidateCapture,
} from "./satori-search-candidate-replay.mjs";
import { canonicalJson } from "./satori-useful-context.mjs";

const REPOSITORIES = Object.freeze([
    { id: "satori-r0", scorePrefix: "satori" },
    { id: "tradingview-r0", scorePrefix: "tradingview" },
    { id: "shopify-theme-r0", scorePrefix: "shopify" },
]);
const CONTENDERS = Object.freeze(["D-L16", "D-L32"]);
const TOOL_REPOSITORY_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);
const EVALUATOR_ARTIFACTS = Object.freeze([
    ["r3_evaluator", fileURLToPath(import.meta.url)],
    ["ranking_metrics", fileURLToPath(new URL("./satori-search-ranking-r2.mjs", import.meta.url))],
    ["neural_replay", fileURLToPath(new URL("./satori-search-candidate-replay.mjs", import.meta.url))],
    ["canonical_json", fileURLToPath(new URL("./satori-useful-context.mjs", import.meta.url))],
    ["dependency_lockfile", fileURLToPath(new URL("../pnpm-lock.yaml", import.meta.url))],
]);

function parseArguments(argv) {
    const values = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith("--") || value === undefined) {
            throw new Error("Arguments must use --name value pairs.");
        }
        values.set(key.slice(2), value);
    }
    for (const key of ["manifest", "r1-dir", "score-dir", "replay-dir", "output"]) {
        if (!values.has(key)) throw new Error(`Missing --${key}.`);
    }
    return Object.fromEntries(values);
}

function requireRecord(value, label) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} must be an object.`);
    }
    return value;
}

function requireArray(value, label) {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
    return value;
}

function requireString(value, label) {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`${label} must be a non-empty string.`);
    }
    return value;
}

function sha256Canonical(value) {
    return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function readJson(filePath, label) {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const record = requireRecord(value, label);
    const supplied = requireString(record.sha256, `${label} sha256`);
    const { sha256: _ignored, ...unsigned } = record;
    if (sha256Canonical(unsigned) !== supplied) {
        throw new Error(`${label} digest does not match its contents.`);
    }
    return record;
}

function writeSignedJson(filePath, value) {
    const signed = { ...value, sha256: sha256Canonical(value) };
    fs.writeFileSync(filePath, `${JSON.stringify(signed, null, 2)}\n`, "utf8");
    return signed;
}

function evaluatorToolingIdentity() {
    const status = execFileSync(
        "git",
        ["-C", TOOL_REPOSITORY_ROOT, "status", "--porcelain=v1"],
        { encoding: "utf8" },
    );
    if (status.length !== 0) {
        throw new Error("R3 evaluation requires a clean, committed tooling worktree.");
    }
    return {
        gitRevision: execFileSync(
            "git",
            ["-C", TOOL_REPOSITORY_ROOT, "rev-parse", "HEAD"],
            { encoding: "utf8" },
        ).trim(),
        gitTree: execFileSync(
            "git",
            ["-C", TOOL_REPOSITORY_ROOT, "rev-parse", "HEAD^{tree}"],
            { encoding: "utf8" },
        ).trim(),
        artifacts: EVALUATOR_ARTIFACTS.map(([role, filePath]) => ({
            role,
            fileName: path.basename(filePath),
            bytes: fs.statSync(filePath).size,
            sha256: crypto.createHash("sha256")
                .update(fs.readFileSync(filePath))
                .digest("hex"),
        })),
    };
}

function taskMap(replay) {
    return new Map(requireArray(replay.tasks, "Replay tasks").map((task) => [
        task.taskId,
        task,
    ]));
}

function qualityTasks(replay, positiveScore) {
    const tasks = taskMap(replay);
    return positiveScore.tasks
        .filter((task) => task.policyApplicable === true && task.ownerSurvives === true)
        .map((scoreTask) => {
            const task = tasks.get(scoreTask.taskId);
            if (!task) throw new Error(`Replay lacks quality task '${scoreTask.taskId}'.`);
            const expected = requireRecord(
                scoreTask.expected,
                `Task '${task.taskId}' expected`,
            );
            const rank = ownerRank(task, {
                file: expected.ownerFile,
                symbol: expected.ownerSymbol,
                match: expected.ownerMatch === "file" ? "file" : "symbol",
            });
            return { taskId: task.taskId, rank, metrics: metricForRank(rank), task };
        });
}

function negativeTasks(replay, capture) {
    const expectedByTaskId = new Map(capture.captures.map((task) => [
        task.taskId,
        task.expected,
    ]));
    return replay.tasks.map((task) => {
        const owners = requireArray(
            expectedByTaskId.get(task.taskId)?.hardNegativeOwners,
            `Task '${task.taskId}' hard-negative owners`,
        );
        const ranks = owners.map((owner) => ownerRank(task, owner));
        return {
            taskId: task.taskId,
            ranks,
            exposureAt3: ranks.some((rank) => rank !== null && rank <= 3) ? 1 : 0,
            task,
        };
    });
}

function mean(values) {
    return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundMetric(value) {
    return Number(value.toFixed(12));
}

function summarize(repositoryResults, policyId) {
    const repositoryQuality = {};
    const repositoryNegative = {};
    for (const repository of REPOSITORIES) {
        const result = repositoryResults[repository.id][policyId];
        repositoryQuality[repository.id] = averageTaskMetrics(result.quality);
        repositoryNegative[repository.id] = roundMetric(mean(
            result.negative.map((task) => task.exposureAt3),
        ));
    }
    return {
        repositoryQuality,
        repositoryNegative,
        macroQuality: averageTaskMetrics(REPOSITORIES.map((repository) => ({
            metrics: repositoryQuality[repository.id],
        }))),
        macroNegativeExposureAt3: roundMetric(mean(Object.values(repositoryNegative))),
    };
}

function percentile95(values) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

function buildResourceSummary(scoreArtifacts, contenderId, contract) {
    const artifacts = REPOSITORIES.map(
        (repository) => scoreArtifacts[repository.id][contenderId],
    );
    const cold = artifacts.map(
        (artifact) => artifact.resources.coldFirstFusionTaskMilliseconds,
    );
    const warm = artifacts.flatMap(
        (artifact) => artifact.resources.warmFusionTaskMilliseconds,
    );
    const peak = Math.max(...artifacts.map(
        (artifact) => artifact.resources.processPeakRssBytes,
    ));
    const deadlineFailures = artifacts.flatMap((artifact) => artifact.tasks
        .filter((task) => task.status === "deadline_exceeded")
        .map((task) => task.taskId));
    const coldBudget = contract.resourceBudgets.maximumColdD16Milliseconds;
    const warmBudget = contenderId === "D-L16"
        ? contract.resourceBudgets.maximumWarmD16P95Milliseconds
        : contract.resourceBudgets.maximumWarmD32P95Milliseconds;
    const warmP95 = percentile95(warm);
    const gates = {
        deadline: deadlineFailures.length === 0,
        coldLatency: contenderId === "D-L16"
            ? cold.every((value) => value <= coldBudget)
            : true,
        warmLatency: warmP95 !== null && warmP95 <= warmBudget,
        peakRss: peak <= contract.resourceBudgets.maximumProcessPeakRssBytes,
    };
    return {
        coldMillisecondsByRepository: Object.fromEntries(
            REPOSITORIES.map((repository, index) => [repository.id, cold[index]]),
        ),
        warmP95Milliseconds: warmP95,
        peakRssBytes: peak,
        deadlineFailures,
        gates,
        passesEveryGate: Object.values(gates).every(Boolean),
    };
}

function evaluateContender({
    contenderId,
    summaries,
    repositoryResults,
    bootstrapSamples,
    confidence,
    statisticalContract,
    resources,
}) {
    const baseline = summaries.B;
    const contender = summaries[contenderId];
    const qualityMetrics = {};
    for (const metric of ["ownerAt1", "ownerAt3", "ownerAt10", "reciprocalRank"]) {
        const deltas = REPOSITORIES.map(({ id }) => (
            contender.repositoryQuality[id][metric] - baseline.repositoryQuality[id][metric]
        ));
        qualityMetrics[metric] = {
            baseline: baseline.macroQuality[metric],
            contender: contender.macroQuality[metric],
            delta: roundMetric(contender.macroQuality[metric] - baseline.macroQuality[metric]),
            repositoryDeltas: Object.fromEntries(
                REPOSITORIES.map(({ id }, index) => [id, roundMetric(deltas[index])]),
            ),
            interval: bootstrapInterval(deltas, bootstrapSamples, confidence),
        };
    }
    const negativeDeltas = REPOSITORIES.map(({ id }) => (
        contender.repositoryNegative[id] - baseline.repositoryNegative[id]
    ));
    const negativeExposure = {
        baseline: baseline.macroNegativeExposureAt3,
        contender: contender.macroNegativeExposureAt3,
        delta: roundMetric(
            contender.macroNegativeExposureAt3 - baseline.macroNegativeExposureAt3
        ),
        interval: bootstrapInterval(negativeDeltas, bootstrapSamples, confidence),
    };
    const invariantFailures = [];
    const exactFailures = [];
    const disclosedDiffs = [];
    for (const repository of REPOSITORIES) {
        const baselineResult = repositoryResults[repository.id].B;
        const contenderResult = repositoryResults[repository.id][contenderId];
        for (const suite of ["quality", "negative"]) {
            const baselineById = new Map(
                baselineResult[suite].map((task) => [task.taskId, task]),
            );
            for (const contenderTask of contenderResult[suite]) {
                const baselineTask = baselineById.get(contenderTask.taskId);
                if (
                    contenderTask.task.invariants?.candidateMembershipIdentityEqual !== true
                    || contenderTask.task.invariants?.eligibilityIdentityEqual !== true
                ) {
                    invariantFailures.push({
                        repositoryId: repository.id,
                        taskId: contenderTask.taskId,
                        suite,
                    });
                }
                disclosedDiffs.push({
                    repositoryId: repository.id,
                    taskId: contenderTask.taskId,
                    suite,
                    ...(suite === "quality" ? {
                        baselineOwnerRank: baselineTask.rank,
                        contenderOwnerRank: contenderTask.rank,
                    } : {
                        baselineHardNegativeRanks: baselineTask.ranks,
                        contenderHardNegativeRanks: contenderTask.ranks,
                    }),
                    ...diffDisclosedLists(baselineTask.task, contenderTask.task),
                });
            }
        }
        const baselineExact = repositoryResults[repository.id].B.exact;
        const contenderExact = repositoryResults[repository.id][contenderId].exact;
        if (canonicalJson(baselineExact) !== canonicalJson(contenderExact)) {
            exactFailures.push({ repositoryId: repository.id });
        }
    }
    const minimumEffects = statisticalContract.minimumEffects;
    const margins = statisticalContract.nonInferiorityMargins;
    const qualityGates = {
        ownerAt3Improvement:
            qualityMetrics.ownerAt3.delta >= minimumEffects.ownerAt3
            && qualityMetrics.ownerAt3.interval.lower > 0,
        reciprocalRankImprovement:
            qualityMetrics.reciprocalRank.delta >= minimumEffects.macroReciprocalRank
            && qualityMetrics.reciprocalRank.interval.lower > 0,
        ownerAt1NonInferiority:
            qualityMetrics.ownerAt1.interval.lower >= margins.ownerAt1,
        ownerAt10NonInferiority:
            qualityMetrics.ownerAt10.interval.lower >= margins.ownerAt10,
        negativeExposureNonInferiority:
            negativeExposure.delta <= margins.hardNegativeExposureAt3
            && negativeExposure.interval.upper <= margins.hardNegativeExposureAt3,
        candidateMembershipAndEligibility: invariantFailures.length === 0,
        exactIdentifier: exactFailures.length === 0,
    };
    return {
        contenderId,
        qualityMetrics,
        negativeExposure,
        qualitySafety: {
            invariantFailures,
            exactFailures,
            disclosedDiffs,
        },
        qualityGates,
        passesEveryQualityGate: Object.values(qualityGates).every(Boolean),
        resources,
        productAdmissible:
            Object.values(qualityGates).every(Boolean) && resources.passesEveryGate,
    };
}

export function buildR3Decision(contenders, minimumDepthMrrDelta) {
    const ordered = [...contenders].sort((left, right) => (
        right.qualityMetrics.reciprocalRank.contender
        - left.qualityMetrics.reciprocalRank.contender
        || left.contenderId.localeCompare(right.contenderId)
    ));
    const winner = ordered[0];
    const d16 = contenders.find(({ contenderId }) => contenderId === "D-L16");
    const d32 = contenders.find(({ contenderId }) => contenderId === "D-L32");
    if (!winner || !d16 || !d32) {
        throw new Error("R3 decision requires D-L16 and D-L32.");
    }
    const d32OverD16Mrr = roundMetric(
        d32.qualityMetrics.reciprocalRank.contender
        - d16.qualityMetrics.reciprocalRank.contender
    );
    return {
        qualityDiagnosticWinner: winner.contenderId,
        qualityDiagnosticWinnerPassedEveryQualityGate: winner.passesEveryQualityGate,
        d32OverD16MacroReciprocalRank: d32OverD16Mrr,
        d32OverD16DepthThresholdMet: d32OverD16Mrr >= minimumDepthMrrDelta,
        qualityConclusion: winner.passesEveryQualityGate
            ? "quality_gates_passed"
            : "directional_quality_improvement_not_fully_qualified",
        productPolicy: "B",
        productFinalist: null,
        productReason: "all_lateon_contenders_failed_frozen_resource_gates",
        heldOutOpened: false,
    };
}

export function evaluateR3({
    manifest,
    r1Dir,
    scoreDir,
    replayDir,
}) {
    const manifestSeal = requireString(manifest.sha256, "Manifest seal");
    const { sha256: _ignored, ...unsignedManifest } = manifest;
    if (sha256Canonical(unsignedManifest) !== manifestSeal) {
        throw new Error("Manifest seal does not match its contents.");
    }
    const confidence = manifest.statisticalContract
        ?.multiplicityAdjustedConfidence?.neural;
    if (confidence !== 0.975) {
        throw new Error("R3 neural confidence must remain frozen at 0.975.");
    }
    const contract = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "evals/search-ranking/lateon/c0-contract.json"), "utf8"),
    );
    const baselinePolicy = JSON.parse(fs.readFileSync(
        path.join(process.cwd(), "evals/search-ranking/policies/r2-b.json"),
        "utf8",
    ));
    fs.mkdirSync(replayDir, { recursive: true });
    const repositoryResults = {};
    const scoreArtifacts = {};
    for (const repository of REPOSITORIES) {
        const repositoryR1 = path.join(r1Dir, repository.id);
        const positiveCapture = readJson(
            path.join(repositoryR1, "positive-capture.json"),
            `${repository.id} positive capture`,
        );
        const negativeCapture = readJson(
            path.join(repositoryR1, "negative-capture.json"),
            `${repository.id} negative capture`,
        );
        const positiveScore = readJson(
            path.join(repositoryR1, "positive-score.json"),
            `${repository.id} positive score`,
        );
        const baselinePositive = replayCandidateCapture(positiveCapture, baselinePolicy, {
            requireNeuralDisabled: true,
            requireGroupingReady: true,
        });
        const baselineNegative = replayCandidateCapture(negativeCapture, baselinePolicy, {
            requireNeuralDisabled: true,
            requireGroupingReady: true,
        });
        repositoryResults[repository.id] = {
            B: {
                quality: qualityTasks(baselinePositive, positiveScore),
                negative: negativeTasks(baselineNegative, negativeCapture),
                exact: baselinePositive.tasks
                    .filter((task) => task.route.kind === "exact_registry")
                    .map((task) => task.rankedResults),
            },
        };
        scoreArtifacts[repository.id] = {};
        const repositoryReplayDir = path.join(replayDir, repository.id);
        fs.mkdirSync(repositoryReplayDir, { recursive: true });
        for (const contenderId of CONTENDERS) {
            const depth = contenderId === "D-L16" ? "16" : "32";
            const scoreArtifact = readJson(
                path.join(scoreDir, `${repository.scorePrefix}-dl${depth}.json`),
                `${repository.id} ${contenderId} scores`,
            );
            scoreArtifacts[repository.id][contenderId] = scoreArtifact;
            const positiveReplay = replayNeuralCandidateCapture(
                positiveCapture,
                scoreArtifact,
                { diagnosticQualityOnly: true },
            );
            const negativeReplay = replayNeuralCandidateCapture(
                negativeCapture,
                scoreArtifact,
                { diagnosticQualityOnly: true },
            );
            writeSignedJson(
                path.join(repositoryReplayDir, `positive-${contenderId.toLowerCase()}.json`),
                Object.fromEntries(Object.entries(positiveReplay).filter(([key]) => key !== "sha256")),
            );
            writeSignedJson(
                path.join(repositoryReplayDir, `negative-${contenderId.toLowerCase()}.json`),
                Object.fromEntries(Object.entries(negativeReplay).filter(([key]) => key !== "sha256")),
            );
            repositoryResults[repository.id][contenderId] = {
                quality: qualityTasks(positiveReplay, positiveScore),
                negative: negativeTasks(negativeReplay, negativeCapture),
                exact: positiveReplay.tasks
                    .filter((task) => task.route.kind === "exact_registry")
                    .map((task) => task.rankedResults),
            };
        }
    }
    const summaries = Object.fromEntries(
        ["B", ...CONTENDERS].map((policyId) => [
            policyId,
            summarize(repositoryResults, policyId),
        ]),
    );
    const bootstrapSamples = buildBootstrapSamples(
        REPOSITORIES.length,
        manifest.statisticalContract.clusterBootstrapResamples,
        manifestSeal,
    );
    const contenders = CONTENDERS.map((contenderId) => evaluateContender({
        contenderId,
        summaries,
        repositoryResults,
        bootstrapSamples,
        confidence,
        statisticalContract: manifest.statisticalContract,
        resources: buildResourceSummary(scoreArtifacts, contenderId, contract),
    }));
    const tooling = evaluatorToolingIdentity();
    const result = {
        version: 1,
        kind: "satori_search_ranking_r3_diagnostic",
        manifestSeal,
        repositoryIds: REPOSITORIES.map(({ id }) => id),
        taskCounts: {
            quality: REPOSITORIES.reduce(
                (total, repository) =>
                    total + repositoryResults[repository.id].B.quality.length,
                0,
            ),
            negative: REPOSITORIES.reduce(
                (total, repository) =>
                    total + repositoryResults[repository.id].B.negative.length,
                0,
            ),
            exact: REPOSITORIES.reduce(
                (total, repository) =>
                    total + repositoryResults[repository.id].B.exact.length,
                0,
            ),
        },
        tooling,
        summaries,
        contenders,
        decision: buildR3Decision(
            contenders,
            manifest.statisticalContract.minimumEffects
                .lateOn32Over16MacroReciprocalRank,
        ),
    };
    return { ...result, sha256: sha256Canonical(result) };
}

async function run() {
    const arguments_ = parseArguments(process.argv.slice(2));
    const manifest = JSON.parse(fs.readFileSync(arguments_.manifest, "utf8"));
    const result = evaluateR3({
        manifest,
        r1Dir: path.resolve(arguments_["r1-dir"]),
        scoreDir: path.resolve(arguments_["score-dir"]),
        replayDir: path.resolve(arguments_["replay-dir"]),
    });
    fs.writeFileSync(arguments_.output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

const isDirectExecution = process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
    run().catch((error) => {
        console.error(error instanceof Error ? error.stack : String(error));
        process.exitCode = 1;
    });
}
