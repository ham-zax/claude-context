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
    buildFrozenPaginationReplay,
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
const TRACK_L_CONTROL_NAMES = Object.freeze([
    "exact_identifier",
    "must",
    "configuration_pin",
]);
const TRACK_L_TERMINAL_BY_ARM = Object.freeze({
    "projection-v1-d-l50": "lateon_depth_50_disabled_candidate",
    "projection-v2-d-l16": "lateon_projection_v2_disabled_candidate",
    "projection-v2-d-l32": "lateon_projection_v2_disabled_candidate",
    "projection-v2-d-l50": "lateon_projection_v2_disabled_candidate",
});
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

function compareContractStrings(left, right) {
    if (left === right) return 0;
    return left < right ? -1 : 1;
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

export function resolveTrackLEvaluationAuthority(manifest) {
    const manifestRecord = requireRecord(manifest, "Track L manifest");
    const manifestSeal = requireString(manifestRecord.sha256, "Track L manifest seal");
    const { sha256: _ignored, ...unsignedManifest } = manifestRecord;
    if (sha256Canonical(unsignedManifest) !== manifestSeal) {
        throw new Error("Track L manifest seal does not match its contents.");
    }
    if (manifestRecord.version !== 3) {
        throw new Error("Track L evaluation requires manifest version 3.");
    }
    if (manifestRecord.kind !== "satori_cross_repository_ranking_manifest") {
        throw new Error("Track L manifest kind is incompatible.");
    }
    const tuningRepositories = requireArray(
        manifestRecord.repositories,
        "Track L repositories",
    ).filter(({ split }) => split === "tuning");
    const repositoryIds = tuningRepositories.map(({ id }, index) => (
        requireString(id, `Track L tuning repository ${index + 1}`)
    ));
    if (repositoryIds.length < 6 || new Set(repositoryIds).size !== repositoryIds.length) {
        throw new Error("Track L evaluation requires at least six unique tuning repositories.");
    }
    const tasks = requireArray(manifestRecord.tasks, "Track L tasks");
    const taskIds = new Set();
    const taskAuthorityByRepository = Object.fromEntries(repositoryIds.map((repositoryId) => [
        repositoryId,
        {
            positiveTaskIds: [],
            qualityTaskIds: [],
            negativeTaskIds: [],
            controls: {},
            tasksById: {},
        },
    ]));
    for (const task of tasks) {
        const taskRecord = requireRecord(task, "Track L task");
        const taskId = requireString(taskRecord.id, "Track L task id");
        if (taskIds.has(taskId)) throw new Error(`Track L task '${taskId}' is duplicated.`);
        taskIds.add(taskId);
        if (taskRecord.split !== "tuning") continue;
        const repositoryId = requireString(taskRecord.repositoryId, `Task '${taskId}' repository`);
        const repositoryTasks = taskAuthorityByRepository[repositoryId];
        if (!repositoryTasks) {
            throw new Error(`Track L task '${taskId}' references a non-tuning repository.`);
        }
        const oracleKind = taskRecord.oracle?.kind;
        const target = oracleKind === "negative"
            ? repositoryTasks.negativeTaskIds
            : oracleKind === "owner"
                ? repositoryTasks.positiveTaskIds
                : null;
        if (!target) throw new Error(`Track L task '${taskId}' has an unsupported oracle.`);
        target.push(taskId);
        repositoryTasks.tasksById[taskId] = {
            split: taskRecord.split,
            queryClass: oracleKind === "negative"
                ? "negative_exposure"
                : taskRecord.queryClass === "exact_identifier"
                    ? "exact_identifier"
                    : "owner_discovery",
            safetyControls: [...(taskRecord.safetyControls ?? [])],
        };
        for (const control of taskRecord.safetyControls ?? []) {
            if (!TRACK_L_CONTROL_NAMES.includes(control)) continue;
            repositoryTasks.controls[control] ??= [];
            repositoryTasks.controls[control].push(taskId);
        }
        if (oracleKind === "owner" && !(taskRecord.safetyControls ?? []).some(
            (control) => TRACK_L_CONTROL_NAMES.includes(control),
        )) {
            repositoryTasks.qualityTaskIds.push(taskId);
        }
    }
    const contract = requireRecord(
        manifestRecord.statisticalContract,
        "Track L statistical contract",
    );
    for (const [field, value] of [
        ["positiveTasksPerRepository", contract.positiveTasksPerRepository],
        ["negativeTasksPerRepository", contract.negativeTasksPerRepository],
    ]) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new Error(`Track L statistical contract '${field}' is incompatible.`);
        }
    }
    for (const [repositoryId, repositoryTasks] of Object.entries(taskAuthorityByRepository)) {
        if (
            repositoryTasks.positiveTaskIds.length < contract.positiveTasksPerRepository
            || repositoryTasks.qualityTaskIds.length < contract.positiveTasksPerRepository
            || repositoryTasks.negativeTaskIds.length < contract.negativeTasksPerRepository
        ) {
            throw new Error(`Track L repository '${repositoryId}' lacks its frozen task minimums.`);
        }
    }
    for (const control of TRACK_L_CONTROL_NAMES) {
        if (!Object.values(taskAuthorityByRepository).some(({ controls }) => (
            (controls[control]?.length ?? 0) > 0
        ))) {
            throw new Error(`Track L tuning authority lacks '${control}' safety controls.`);
        }
    }
    const authority = requireRecord(
        manifestRecord.lateOnL0Authority,
        "Track L L0 authority",
    );
    const contenders = requireArray(authority.newArms, "Track L new arms").map(
        (arm, index) => {
            const record = requireRecord(arm, `Track L new arm ${index + 1}`);
            if (record.status !== "preregistered_unopened") {
                throw new Error(`Track L arm '${record.id}' is not preregistered and unopened.`);
            }
            const contenderId = requireString(record.id, `Track L arm ${index + 1} id`);
            const projectionVersion = requireString(
                record.projectionVersion,
                `Track L arm ${index + 1} projection`,
            );
            if (!["search_rerank_document_v1", "search_rerank_document_v2"]
                .includes(projectionVersion)) {
                throw new Error(`Track L arm '${contenderId}' has an unsupported projection.`);
            }
            if (!Number.isSafeInteger(record.candidateDepth)
                || ![16, 32, 50].includes(record.candidateDepth)
                || contenderId !== `${projectionVersion.replace("search_rerank_document_", "projection-")}-d-l${record.candidateDepth}`) {
                throw new Error(`Track L arm '${contenderId}' has incompatible depth or projection.`);
            }
            return {
                contenderId,
                projectionVersion,
                candidateDepth: record.candidateDepth,
            };
        },
    );
    if (new Set(contenders.map(({ contenderId }) => contenderId)).size !== contenders.length) {
        throw new Error("Track L contender IDs must be unique.");
    }
    const executionOrder = requireArray(
        authority.executionOrder?.qualityArms,
        "Track L quality arm order",
    );
    if (canonicalJson(executionOrder) !== canonicalJson(
        contenders.map(({ contenderId }) => contenderId),
    )) {
        throw new Error("Track L quality-arm execution order is incompatible.");
    }
    const statisticalContract = contract;
    const confidence = statisticalContract.multiplicityAdjustedConfidence?.newContenders;
    if (confidence !== 0.9875 || statisticalContract.newContenderCount !== contenders.length) {
        throw new Error("Track L adjusted confidence does not match its contender family.");
    }
    if (
        statisticalContract.clusterBootstrapResamples !== 10_000
        || statisticalContract.bootstrapSeed !== "sealed_manifest_sha256"
    ) {
        throw new Error("Track L bootstrap authority is incompatible.");
    }
    if (
        statisticalContract.metricApplicability?.requiredRoleCoverage
            !== "not_applicable_no_required_role_oracle"
        || statisticalContract.metricApplicability?.ownerAt10
            !== "applicable_protected_retrieval_depth_metric"
    ) {
        throw new Error("Track L metric applicability authority is incompatible.");
    }
    return {
        manifestSeal,
        repositoryIds,
        taskAuthorityByRepository,
        contenders,
        confidence,
        bootstrapResamples: statisticalContract.clusterBootstrapResamples,
        statisticalContract,
        resourceProfile: requireRecord(
            authority.resourceProfile,
            "Track L resource profile",
        ),
    };
}

export function buildTrackLDecision(contenders, minimumDepthMrrDelta) {
    if (!Array.isArray(contenders) || contenders.length === 0) {
        throw new Error("Track L decision requires at least one contender.");
    }
    const projectionRank = (contender) => (
        (contender.projectionVersion ?? contender.contenderId).includes("v1") ? 1 : 2
    );
    const admissible = contenders.filter(({ productAdmissible }) => productAdmissible === true)
        .sort((left, right) => (
            left.candidateDepth - right.candidateDepth
            || projectionRank(left) - projectionRank(right)
            || compareContractStrings(left.contenderId, right.contenderId)
        ));
    if (admissible.length === 0) {
        const inconclusive = contenders.every(({ evidenceConclusive }) => (
            evidenceConclusive !== true
        ));
        return {
            outcome: inconclusive ? "insufficient_evidence" : "baseline_b_retained",
            selectedContenderId: null,
            productPolicy: "B",
            heldOutOpened: false,
        };
    }
    let selected = admissible[0];
    for (const contender of admissible.slice(1)) {
        const shallowerOrSimpler = admissible.filter((candidate) => (
            candidate !== contender
            && (
                candidate.candidateDepth < contender.candidateDepth
                || (
                    candidate.candidateDepth === contender.candidateDepth
                    && projectionRank(candidate) < projectionRank(contender)
                )
            )
        ));
        const clearsEveryPrior = shallowerOrSimpler.every((prior) => (
            contender.qualityMetrics.reciprocalRank.contender
                - prior.qualityMetrics.reciprocalRank.contender
            >= minimumDepthMrrDelta
        ));
        if (clearsEveryPrior) {
            selected = contender;
        }
    }
    const outcome = TRACK_L_TERMINAL_BY_ARM[selected.contenderId];
    if (!outcome) {
        throw new Error(`Track L selected arm '${selected.contenderId}' has no terminal mapping.`);
    }
    return {
        outcome,
        selectedContenderId: selected.contenderId,
        productPolicy: "B",
        heldOutOpened: false,
    };
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

function requireUniqueTaskMap(replay, label) {
    const tasks = requireArray(replay.tasks, `${label} tasks`);
    const entries = tasks.map((task, index) => {
        const record = requireRecord(task, `${label} task ${index + 1}`);
        return [requireString(record.taskId, `${label} task ${index + 1} id`), record];
    });
    const result = new Map(entries);
    if (result.size !== entries.length) throw new Error(`${label} contains duplicate task IDs.`);
    return result;
}

function expectedOwnerFromCapture(taskCapture) {
    const expected = requireRecord(
        taskCapture.expected,
        `Task '${taskCapture.taskId}' expected owner`,
    );
    return {
        file: requireString(expected.ownerFile, `Task '${taskCapture.taskId}' owner file`),
        symbol: requireString(expected.ownerSymbol, `Task '${taskCapture.taskId}' owner symbol`),
        match: expected.ownerMatch === "file" ? "file" : "symbol",
    };
}

function exactRegistryOwnerRank(task, owner) {
    const results = requireArray(task.rankedResults, `Task '${task.taskId}' exact results`);
    const index = results.findIndex((result) => (
        result.file === owner.file
        && (owner.match === "file" || result.symbol === owner.symbol)
    ));
    return index < 0 ? null : index + 1;
}

function trackLOwnerRank(task, owner) {
    return task.route?.kind === "exact_registry"
        ? exactRegistryOwnerRank(task, owner)
        : ownerRank(task, owner);
}

function trackLQualityTasks(replay, capture) {
    const replayTasks = requireUniqueTaskMap(replay, "Track L positive replay");
    return requireArray(capture.captures, "Track L positive captures")
        .filter(({ safetyControls = [] }) => !safetyControls.some(
            (control) => TRACK_L_CONTROL_NAMES.includes(control),
        ))
        .map((taskCapture) => {
            const taskId = requireString(taskCapture.taskId, "Track L positive task id");
            const task = replayTasks.get(taskId);
            if (!task) throw new Error(`Track L replay lacks positive task '${taskId}'.`);
            const rank = trackLOwnerRank(task, expectedOwnerFromCapture(taskCapture));
            return { taskId, rank, metrics: metricForRank(rank), task };
        });
}

function assertTrackLTaskParity(capture, replay, expectedTaskIds, tasksById, label) {
    const captureIds = requireArray(capture.captures, `${label} captures`)
        .map(({ taskId }, index) => requireString(taskId, `${label} capture ${index + 1} id`));
    const replayIds = [...requireUniqueTaskMap(replay, `${label} replay`).keys()];
    for (const [name, values] of [["capture", captureIds], ["replay", replayIds]]) {
        if (canonicalJson([...values].sort(compareContractStrings))
            !== canonicalJson([...expectedTaskIds].sort(compareContractStrings))) {
            throw new Error(`Track L ${label} ${name} task authority is incompatible.`);
        }
    }
    for (const taskCapture of capture.captures) {
        const expected = tasksById[taskCapture.taskId];
        const actual = {
            split: taskCapture.split,
            queryClass: taskCapture.queryClass,
            safetyControls: [...(taskCapture.safetyControls ?? [])],
        };
        if (!expected || canonicalJson(actual) !== canonicalJson(expected)) {
            throw new Error(
                `Track L ${label} task '${taskCapture.taskId}' metadata is incompatible.`,
            );
        }
    }
}

function validateFrozenPagination(task) {
    if (task.route?.kind === "exact_registry") return true;
    const frozen = requireRecord(
        task.frozenPagination,
        `Task '${task.taskId}' frozen pagination`,
    );
    const recomputed = buildFrozenPaginationReplay(
        task.groupingDisclosure,
        frozen.pageSize,
    );
    return canonicalJson(recomputed) === canonicalJson(frozen)
        && frozen.additionalRerankerCalls === 0;
}

function trackLSafetyEvidence({ baseline, contender, positiveCapture, negativeCapture }) {
    const failures = {
        candidateMembershipOrEligibility: [],
        queryControls: [],
        frozenPagination: [],
        disclosedMembership: [],
    };
    const disclosedDiffs = [];
    const baselinePositive = requireUniqueTaskMap(baseline.positive, "Track L baseline positive");
    const contenderPositive = requireUniqueTaskMap(contender.positive, "Track L contender positive");
    const baselineNegative = requireUniqueTaskMap(baseline.negative, "Track L baseline negative");
    const contenderNegative = requireUniqueTaskMap(contender.negative, "Track L contender negative");
    for (const [suite, capture, baselineTasks, contenderTasks] of [
        ["positive", positiveCapture, baselinePositive, contenderPositive],
        ["negative", negativeCapture, baselineNegative, contenderNegative],
    ]) {
        for (const taskCapture of capture.captures) {
            const taskId = taskCapture.taskId;
            const baselineTask = baselineTasks.get(taskId);
            const contenderTask = contenderTasks.get(taskId);
            if (!baselineTask || !contenderTask) {
                throw new Error(`Track L ${suite} task '${taskId}' is missing from replay.`);
            }
            if (
                contenderTask.invariants?.candidateMembershipIdentityEqual !== true
                || contenderTask.invariants?.eligibilityIdentityEqual !== true
            ) {
                failures.candidateMembershipOrEligibility.push({ suite, taskId });
            }
            if (!validateFrozenPagination(contenderTask)) {
                failures.frozenPagination.push({ suite, taskId });
            }
            if (baselineTask.route?.kind !== "exact_registry") {
                const diff = diffDisclosedLists(baselineTask, contenderTask);
                disclosedDiffs.push({ suite, taskId, ...diff });
                if (!diff.membershipIdentityEqual) {
                    failures.disclosedMembership.push({ suite, taskId });
                }
            }
            if (suite === "positive" && (taskCapture.safetyControls ?? []).some(
                (control) => TRACK_L_CONTROL_NAMES.includes(control),
            )) {
                const owner = expectedOwnerFromCapture(taskCapture);
                const baselineRank = trackLOwnerRank(baselineTask, owner);
                const contenderRank = trackLOwnerRank(contenderTask, owner);
                const exactOrderChanged = taskCapture.safetyControls.includes("exact_identifier")
                    && baselineTask.route?.kind === "exact_registry"
                    && canonicalJson(baselineTask.rankedResults)
                        !== canonicalJson(contenderTask.rankedResults);
                if (baselineRank !== 1 || contenderRank !== 1 || exactOrderChanged) {
                    failures.queryControls.push({
                        taskId,
                        controls: [...taskCapture.safetyControls],
                        baselineRank,
                        contenderRank,
                        exactOrderChanged,
                    });
                }
            }
        }
    }
    return { failures, disclosedDiffs };
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

function summarizeTrackL(repositoryIds, repositoryResults, policyId) {
    const repositoryQuality = {};
    const repositoryNegative = {};
    for (const repositoryId of repositoryIds) {
        const result = repositoryResults[repositoryId][policyId];
        if (result.quality.length === 0 || result.negative.length === 0) {
            throw new Error(`Track L repository '${repositoryId}' has an empty metric stratum.`);
        }
        repositoryQuality[repositoryId] = averageTaskMetrics(result.quality);
        repositoryNegative[repositoryId] = roundMetric(mean(
            result.negative.map((task) => task.exposureAt3),
        ));
    }
    return {
        repositoryQuality,
        repositoryNegative,
        macroQuality: averageTaskMetrics(repositoryIds.map((repositoryId) => ({
            metrics: repositoryQuality[repositoryId],
        }))),
        macroNegativeExposureAt3: roundMetric(mean(Object.values(repositoryNegative))),
    };
}

function buildTrackLResourceSummary(repositoryIds, scoreArtifacts, contenderId, profile) {
    const artifacts = repositoryIds.map((repositoryId) => (
        scoreArtifacts[repositoryId][contenderId]
    ));
    const modelLoad = artifacts.map((artifact) => (
        artifact.modelLoadResources.modelLoadMilliseconds
    ));
    const warm = artifacts.flatMap((artifact) => artifact.resources.warmFusionTaskMilliseconds);
    const warmP95 = percentile95(warm);
    const peak = Math.max(...artifacts.map((artifact) => artifact.resources.processPeakRssBytes));
    const retained = Math.max(...artifacts.map((artifact) => artifact.resources.retainedRssBytes));
    const deadlineFailures = artifacts.flatMap((artifact) => artifact.tasks
        .filter((task) => task.status === "deadline_exceeded")
        .map((task) => ({ repositoryId: artifact.contract.repositoryId, taskId: task.taskId })));
    const qualificationFailures = artifacts.flatMap((artifact) => (
        artifact.qualification.passed === true
            ? []
            : [{
                repositoryId: artifact.contract.repositoryId,
                reasons: [...artifact.qualification.rejectionReasons],
            }]
    ));
    const fallbackFailures = artifacts.flatMap((artifact) => (
        artifact.qualification.allOrNothingFallbackPreserved === true
            ? []
            : [{ repositoryId: artifact.contract.repositoryId }]
    ));
    const gates = {
        modelLoad: modelLoad.every((value) => value <= profile.maximumModelLoadMilliseconds),
        warmLatency: warmP95 !== null && warmP95 <= profile.maximumWarmP95Milliseconds,
        deadline: deadlineFailures.length === 0,
        peakRss: peak <= profile.maximumProcessPeakRssBytes,
        retainedRss: retained <= profile.maximumProcessRetainedRssBytes,
        scorerQualification: qualificationFailures.length === 0,
        allOrNothingFallback: fallbackFailures.length === 0,
    };
    return {
        modelLoadMillisecondsByRepository: Object.fromEntries(
            repositoryIds.map((repositoryId, index) => [repositoryId, modelLoad[index]]),
        ),
        warmP95Milliseconds: warmP95,
        peakRssBytes: peak,
        retainedRssBytes: retained,
        deadlineFailures,
        qualificationFailures,
        fallbackFailures,
        gates,
        passesEveryGate: Object.values(gates).every(Boolean),
    };
}

function evaluateTrackLContender({
    contender,
    repositoryIds,
    repositoryResults,
    summaries,
    bootstrapSamples,
    authority,
    resources,
}) {
    const baseline = summaries.B;
    const current = summaries[contender.contenderId];
    const qualityMetrics = {};
    for (const metric of ["ownerAt1", "ownerAt3", "ownerAt10", "reciprocalRank"]) {
        const repositoryDeltas = repositoryIds.map((repositoryId) => (
            current.repositoryQuality[repositoryId][metric]
                - baseline.repositoryQuality[repositoryId][metric]
        ));
        qualityMetrics[metric] = {
            baseline: baseline.macroQuality[metric],
            contender: current.macroQuality[metric],
            delta: roundMetric(current.macroQuality[metric] - baseline.macroQuality[metric]),
            repositoryDeltas: Object.fromEntries(repositoryIds.map(
                (repositoryId, index) => [repositoryId, roundMetric(repositoryDeltas[index])],
            )),
            interval: bootstrapInterval(
                repositoryDeltas,
                bootstrapSamples,
                authority.confidence,
            ),
        };
    }
    const negativeDeltas = repositoryIds.map((repositoryId) => (
        current.repositoryNegative[repositoryId] - baseline.repositoryNegative[repositoryId]
    ));
    const negativeExposure = {
        baseline: baseline.macroNegativeExposureAt3,
        contender: current.macroNegativeExposureAt3,
        delta: roundMetric(
            current.macroNegativeExposureAt3 - baseline.macroNegativeExposureAt3,
        ),
        interval: bootstrapInterval(
            negativeDeltas,
            bootstrapSamples,
            authority.confidence,
        ),
    };
    const safetyFailures = {
        candidateMembershipOrEligibility: [],
        queryControls: [],
        frozenPagination: [],
        disclosedMembership: [],
    };
    const disclosedDiffs = [];
    for (const repositoryId of repositoryIds) {
        const safety = repositoryResults[repositoryId][contender.contenderId].safety;
        for (const field of Object.keys(safetyFailures)) {
            safetyFailures[field].push(...safety.failures[field].map((failure) => ({
                repositoryId,
                ...failure,
            })));
        }
        disclosedDiffs.push(...safety.disclosedDiffs.map((diff) => ({ repositoryId, ...diff })));
    }
    const { minimumEffects, nonInferiorityMargins } = authority.statisticalContract;
    const safetyPasses = Object.values(safetyFailures).every((failures) => failures.length === 0);
    const qualityGates = {
        ownerAt3Improvement:
            qualityMetrics.ownerAt3.delta >= minimumEffects.ownerAt3
            && qualityMetrics.ownerAt3.interval.lower > 0,
        reciprocalRankImprovement:
            qualityMetrics.reciprocalRank.delta >= minimumEffects.macroReciprocalRank
            && qualityMetrics.reciprocalRank.interval.lower > 0,
        ownerAt1NonInferiority:
            qualityMetrics.ownerAt1.interval.lower >= nonInferiorityMargins.ownerAt1,
        ownerAt10NonInferiority:
            qualityMetrics.ownerAt10.interval.lower >= nonInferiorityMargins.ownerAt10,
        negativeExposureNonInferiority:
            negativeExposure.delta <= nonInferiorityMargins.hardNegativeExposureAt3
            && negativeExposure.interval.upper
                <= nonInferiorityMargins.hardNegativeExposureAt3,
        zeroFailureSafety: safetyPasses,
    };
    const evidenceConclusive = repositoryIds.length >= 6
        && Object.values(qualityMetrics).every(({ interval }) => (
            Number.isFinite(interval.lower) && Number.isFinite(interval.upper)
        ))
        && Number.isFinite(negativeExposure.interval.lower)
        && Number.isFinite(negativeExposure.interval.upper);
    const passesEveryQualityGate = Object.values(qualityGates).every(Boolean);
    return {
        contenderId: contender.contenderId,
        projectionVersion: contender.projectionVersion,
        candidateDepth: contender.candidateDepth,
        qualityMetrics,
        negativeExposure,
        qualitySafety: { failures: safetyFailures, disclosedDiffs },
        qualityGates,
        evidenceConclusive,
        passesEveryQualityGate,
        resources,
        productAdmissible:
            evidenceConclusive && passesEveryQualityGate && resources.passesEveryGate,
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

function resolveTrackLScorePath(scoreDir, repositoryId, contenderId) {
    return path.join(scoreDir, repositoryId, `${contenderId}.json`);
}

export function assertTrackLScoreBinding(
    scoreArtifact,
    repositoryId,
    contender,
    authority,
    expectedTaskIds,
    tasksById,
) {
    if (scoreArtifact.schemaVersion !== "satori_search_ranking_track_l_scores_v2") {
        throw new Error(`Track L score for '${repositoryId}' has an unsupported schema.`);
    }
    const expected = {
        contenderId: contender.contenderId,
        candidateDepth: contender.candidateDepth,
        projectionVersion: contender.projectionVersion,
        manifestSeal: authority.manifestSeal,
        repositoryId,
        resourceProfile: authority.resourceProfile,
    };
    const actual = {
        contenderId: scoreArtifact.contenderId,
        candidateDepth: scoreArtifact.candidateDepth,
        projectionVersion: scoreArtifact.contract?.projectionVersion,
        manifestSeal: scoreArtifact.contract?.manifestSeal,
        repositoryId: scoreArtifact.contract?.repositoryId,
        resourceProfile: scoreArtifact.contract?.resourceProfile,
    };
    if (canonicalJson(actual) !== canonicalJson(expected)) {
        throw new Error(
            `Track L score '${repositoryId}/${contender.contenderId}' authority is incompatible.`,
        );
    }
    const scoreTaskIds = requireArray(scoreArtifact.tasks, "Track L score tasks")
        .map(({ taskId }, index) => requireString(taskId, `Track L score task ${index + 1} id`));
    if (new Set(scoreTaskIds).size !== scoreTaskIds.length
        || canonicalJson([...scoreTaskIds].sort(compareContractStrings))
            !== canonicalJson([...expectedTaskIds].sort(compareContractStrings))) {
        throw new Error(
            `Track L score '${repositoryId}/${contender.contenderId}' task authority is incompatible.`,
        );
    }
    for (const scoreTask of scoreArtifact.tasks) {
        const expectedTask = tasksById[scoreTask.taskId];
        const actualTask = {
            split: scoreTask.split,
            queryClass: scoreTask.queryClass,
            safetyControls: [...(scoreTask.safetyControls ?? [])],
        };
        if (!expectedTask || canonicalJson(actualTask) !== canonicalJson(expectedTask)) {
            throw new Error(
                `Track L score '${repositoryId}/${contender.contenderId}' task metadata is incompatible.`,
            );
        }
    }
}

function evaluateTrackLInto({ manifest, r1Dir, scoreDir, replayDir }) {
    const authority = resolveTrackLEvaluationAuthority(manifest);
    fs.mkdirSync(replayDir, { recursive: true });
    const repositoryResults = {};
    const scoreArtifacts = {};
    let aggregateCaptureSha256 = null;
    for (const repositoryId of authority.repositoryIds) {
        const repositoryR1 = path.join(r1Dir, repositoryId);
        const positiveCapture = readJson(
            path.join(repositoryR1, "positive-capture.json"),
            `${repositoryId} positive capture`,
        );
        const negativeCapture = readJson(
            path.join(repositoryR1, "negative-capture.json"),
            `${repositoryId} negative capture`,
        );
        const baselinePositive = replayCandidateCapture(positiveCapture, "baseline", {
            requireNeuralDisabled: true,
            requireGroupingReady: true,
        });
        const baselineNegative = replayCandidateCapture(negativeCapture, "baseline", {
            requireNeuralDisabled: true,
            requireGroupingReady: true,
        });
        const taskAuthority = authority.taskAuthorityByRepository[repositoryId];
        assertTrackLTaskParity(
            positiveCapture,
            baselinePositive,
            taskAuthority.positiveTaskIds,
            taskAuthority.tasksById,
            `${repositoryId} positive`,
        );
        assertTrackLTaskParity(
            negativeCapture,
            baselineNegative,
            taskAuthority.negativeTaskIds,
            taskAuthority.tasksById,
            `${repositoryId} negative`,
        );
        const baselineQuality = trackLQualityTasks(baselinePositive, positiveCapture);
        if (canonicalJson(baselineQuality.map(({ taskId }) => taskId).sort(compareContractStrings))
            !== canonicalJson([...taskAuthority.qualityTaskIds].sort(compareContractStrings))) {
            throw new Error(`Track L repository '${repositoryId}' quality task authority is incompatible.`);
        }
        repositoryResults[repositoryId] = {
            B: {
                quality: baselineQuality,
                negative: negativeTasks(baselineNegative, negativeCapture),
            },
        };
        scoreArtifacts[repositoryId] = {};
        const repositoryReplayDir = path.join(replayDir, repositoryId);
        fs.mkdirSync(repositoryReplayDir, { recursive: true });
        for (const contender of authority.contenders) {
            const scoreArtifact = readJson(
                resolveTrackLScorePath(scoreDir, repositoryId, contender.contenderId),
                `${repositoryId} ${contender.contenderId} score`,
            );
            assertTrackLScoreBinding(
                scoreArtifact,
                repositoryId,
                contender,
                authority,
                [...taskAuthority.positiveTaskIds, ...taskAuthority.negativeTaskIds],
                taskAuthority.tasksById,
            );
            const contenderAggregate = requireString(
                scoreArtifact.contract?.captureAuthority?.aggregateCaptureSha256,
                `${repositoryId} ${contender.contenderId} aggregate capture digest`,
            );
            if (aggregateCaptureSha256 === null) aggregateCaptureSha256 = contenderAggregate;
            else if (aggregateCaptureSha256 !== contenderAggregate) {
                throw new Error("Track L score artifacts do not share one capture authority.");
            }
            scoreArtifacts[repositoryId][contender.contenderId] = scoreArtifact;
            const replayOptions = {
                diagnosticQualityOnly: true,
                expectedManifestSeal: authority.manifestSeal,
                allowedContenderIds: authority.contenders.map(({ contenderId }) => contenderId),
            };
            const positiveReplay = replayNeuralCandidateCapture(
                positiveCapture,
                scoreArtifact,
                replayOptions,
            );
            const negativeReplay = replayNeuralCandidateCapture(
                negativeCapture,
                scoreArtifact,
                replayOptions,
            );
            assertTrackLTaskParity(
                positiveCapture,
                positiveReplay,
                taskAuthority.positiveTaskIds,
                taskAuthority.tasksById,
                `${repositoryId} ${contender.contenderId} positive`,
            );
            assertTrackLTaskParity(
                negativeCapture,
                negativeReplay,
                taskAuthority.negativeTaskIds,
                taskAuthority.tasksById,
                `${repositoryId} ${contender.contenderId} negative`,
            );
            writeSignedJson(
                path.join(repositoryReplayDir, `positive-${contender.contenderId}.json`),
                Object.fromEntries(Object.entries(positiveReplay).filter(([key]) => key !== "sha256")),
            );
            writeSignedJson(
                path.join(repositoryReplayDir, `negative-${contender.contenderId}.json`),
                Object.fromEntries(Object.entries(negativeReplay).filter(([key]) => key !== "sha256")),
            );
            repositoryResults[repositoryId][contender.contenderId] = {
                quality: trackLQualityTasks(positiveReplay, positiveCapture),
                negative: negativeTasks(negativeReplay, negativeCapture),
                safety: trackLSafetyEvidence({
                    baseline: { positive: baselinePositive, negative: baselineNegative },
                    contender: { positive: positiveReplay, negative: negativeReplay },
                    positiveCapture,
                    negativeCapture,
                }),
            };
        }
    }
    const policyIds = ["B", ...authority.contenders.map(({ contenderId }) => contenderId)];
    const summaries = Object.fromEntries(policyIds.map((policyId) => [
        policyId,
        summarizeTrackL(authority.repositoryIds, repositoryResults, policyId),
    ]));
    const bootstrapSamples = buildBootstrapSamples(
        authority.repositoryIds.length,
        authority.bootstrapResamples,
        authority.manifestSeal,
    );
    const contenders = authority.contenders.map((contender) => evaluateTrackLContender({
        contender,
        repositoryIds: authority.repositoryIds,
        repositoryResults,
        summaries,
        bootstrapSamples,
        authority,
        resources: buildTrackLResourceSummary(
            authority.repositoryIds,
            scoreArtifacts,
            contender.contenderId,
            authority.resourceProfile,
        ),
    }));
    const result = {
        version: 1,
        kind: "satori_search_ranking_track_l_result",
        manifestSeal: authority.manifestSeal,
        aggregateCaptureSha256,
        repositoryIds: authority.repositoryIds,
        contenderIds: authority.contenders.map(({ contenderId }) => contenderId),
        taskCounts: {
            positive: authority.repositoryIds.reduce((total, repositoryId) => (
                total
                + authority.taskAuthorityByRepository[repositoryId].positiveTaskIds.length
            ), 0),
            quality: authority.repositoryIds.reduce((total, repositoryId) => (
                total + repositoryResults[repositoryId].B.quality.length
            ), 0),
            negative: authority.repositoryIds.reduce((total, repositoryId) => (
                total + repositoryResults[repositoryId].B.negative.length
            ), 0),
            controls: Object.fromEntries(TRACK_L_CONTROL_NAMES.map((control) => [
                control,
                authority.repositoryIds.reduce((total, repositoryId) => (
                    total
                    + (authority.taskAuthorityByRepository[repositoryId].controls[control]?.length ?? 0)
                ), 0),
            ])),
        },
        statisticalContract: authority.statisticalContract,
        resourceProfile: authority.resourceProfile,
        tooling: evaluatorToolingIdentity(),
        summaries,
        contenders,
        decision: buildTrackLDecision(
            contenders,
            authority.statisticalContract.minimumEffects.simplicityTie,
        ),
    };
    return { ...result, sha256: sha256Canonical(result) };
}

export function evaluateTrackL({ manifest, r1Dir, scoreDir, replayDir }) {
    const absoluteReplayDir = path.resolve(replayDir);
    if (fs.existsSync(absoluteReplayDir)) {
        throw new Error("Track L replay output directory must not already exist.");
    }
    const stagingReplayDir = `${absoluteReplayDir}.staging-${process.pid}`;
    if (fs.existsSync(stagingReplayDir)) {
        throw new Error("Track L replay staging directory already exists.");
    }
    try {
        const result = evaluateTrackLInto({
            manifest,
            r1Dir,
            scoreDir,
            replayDir: stagingReplayDir,
        });
        fs.renameSync(stagingReplayDir, absoluteReplayDir);
        return result;
    } catch (error) {
        fs.rmSync(stagingReplayDir, { recursive: true, force: true });
        throw error;
    }
}

async function run() {
    const arguments_ = parseArguments(process.argv.slice(2));
    const manifest = JSON.parse(fs.readFileSync(arguments_.manifest, "utf8"));
    if (manifest.version === 3 && fs.existsSync(arguments_.output)) {
        throw new Error("Track L result output must not already exist.");
    }
    const evaluator = manifest.version === 3 ? evaluateTrackL : evaluateR3;
    const result = evaluator({
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
