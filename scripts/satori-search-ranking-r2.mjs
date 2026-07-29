#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./satori-useful-context.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const POLICY_IDS = Object.freeze(["B", "B-P0", "B-A0"]);
const CONTENDER_IDS = Object.freeze(["B-P0", "B-A0"]);
const SCORE_TOLERANCE = 1e-12;

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, label) {
    if (!isRecord(value)) throw new Error(`${label} must be an object.`);
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

function readJson(file, label) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        throw new Error(`${label} '${file}' is unreadable: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function validateSelfDigest(value, label) {
    const record = requireRecord(value, label);
    const supplied = requireString(record.sha256, `${label} sha256`);
    const { sha256: _ignored, ...unsigned } = record;
    const computed = sha256Canonical(unsigned);
    if (computed !== supplied) {
        throw new Error(`${label} digest does not match its contents.`);
    }
    return supplied;
}

function compareContractStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalSymbolName(symbolLabel) {
    if (typeof symbolLabel !== "string") return null;
    return symbolLabel.replace(
        /^(?:class|constant|constructor|enum|function|interface|method|property|type|variable)\s+/,
        "",
    );
}

function candidateMatchesOwner(candidate, owner) {
    return candidate.relativePath === owner.file
        && canonicalSymbolName(candidate.symbolLabel) === owner.symbol;
}

function finalCandidates(task) {
    const attempts = requireArray(task.mcpAttempts, `Task '${task.taskId}' MCP attempts`);
    const finalAttempt = attempts.at(-1);
    if (!finalAttempt) throw new Error(`Task '${task.taskId}' has no final MCP attempt.`);
    return requireArray(finalAttempt.candidates, `Task '${task.taskId}' final candidates`);
}

function disclosedResults(task) {
    const grouping = requireRecord(
        task.groupingDisclosure,
        `Task '${task.taskId}' grouping disclosure`,
    );
    return requireArray(
        grouping.disclosedResults,
        `Task '${task.taskId}' disclosed results`,
    );
}

function ownerRank(task, owner) {
    const ownerCandidateIds = new Set(
        finalCandidates(task)
            .filter((candidate) => candidateMatchesOwner(candidate, owner))
            .map((candidate) => candidate.candidateId),
    );
    if (ownerCandidateIds.size === 0) return null;
    const match = disclosedResults(task).find((group) => (
        requireArray(group.candidateIds, "Disclosed candidateIds")
            .some((candidateId) => ownerCandidateIds.has(candidateId))
    ));
    return match?.rank ?? null;
}

function metricForRank(rank) {
    return {
        ownerAt1: rank === 1 ? 1 : 0,
        ownerAt3: rank !== null && rank <= 3 ? 1 : 0,
        ownerAt10: rank !== null && rank <= 10 ? 1 : 0,
        reciprocalRank: rank === null ? 0 : 1 / rank,
    };
}

function mean(values) {
    return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundMetric(value) {
    return Number(value.toFixed(12));
}

function averageTaskMetrics(tasks) {
    const metricNames = ["ownerAt1", "ownerAt3", "ownerAt10", "reciprocalRank"];
    return Object.fromEntries(metricNames.map((metric) => [
        metric,
        roundMetric(mean(tasks.map((task) => task.metrics[metric]))),
    ]));
}

function buildBootstrapSamples(repositoryCount, resamples, seed) {
    return Array.from({ length: resamples }, (_, sample) => {
        const digest = crypto.createHash("sha256")
            .update(`${seed}:${sample}`, "utf8")
            .digest();
        return Array.from({ length: repositoryCount }, (_unused, pick) => (
            digest.readUInt32BE(pick * 4) % repositoryCount
        ));
    });
}

function percentile(sorted, probability) {
    return sorted[Math.floor(probability * (sorted.length - 1))];
}

export function bootstrapInterval(repositoryDeltas, samples, confidence) {
    const estimates = samples.map((indices) => (
        mean(indices.map((index) => repositoryDeltas[index]))
    )).sort((left, right) => left - right);
    const tail = (1 - confidence) / 2;
    return {
        lower: roundMetric(percentile(estimates, tail)),
        upper: roundMetric(percentile(estimates, 1 - tail)),
    };
}

function normalizeDisclosedList(task) {
    return disclosedResults(task).map((group) => ({
        rank: group.rank,
        ownerId: requireString(group.ownerId, "Disclosed ownerId"),
        candidateIds: [...requireArray(group.candidateIds, "Disclosed candidateIds")],
        score: group.score,
    }));
}

export function diffDisclosedLists(baselineTask, contenderTask) {
    const baseline = normalizeDisclosedList(baselineTask);
    const contender = normalizeDisclosedList(contenderTask);
    const baselineByOwner = new Map(baseline.map((entry) => [entry.ownerId, entry]));
    const contenderByOwner = new Map(contender.map((entry) => [entry.ownerId, entry]));
    const orderedOwners = [
        ...baseline.map((entry) => entry.ownerId),
        ...contender
            .map((entry) => entry.ownerId)
            .filter((ownerId) => !baselineByOwner.has(ownerId)),
    ];
    const transitions = orderedOwners.map((ownerId) => {
        const before = baselineByOwner.get(ownerId);
        const after = contenderByOwner.get(ownerId);
        return {
            ownerId,
            baselineRank: before?.rank ?? null,
            contenderRank: after?.rank ?? null,
            rankDelta: before && after ? before.rank - after.rank : null,
            candidateIdsIdentityEqual: before && after
                ? canonicalJson(before.candidateIds) === canonicalJson(after.candidateIds)
                : false,
            scoreDelta: before && after
                ? roundMetric(after.score - before.score)
                : null,
            changed: before?.rank !== after?.rank
                || (before && after
                    && canonicalJson(before.candidateIds) !== canonicalJson(after.candidateIds))
                || (before && after && Math.abs(before.score - after.score) > SCORE_TOLERANCE),
        };
    });
    return {
        baseline,
        contender,
        membershipIdentityEqual:
            canonicalJson([...baselineByOwner.keys()].sort(compareContractStrings))
            === canonicalJson([...contenderByOwner.keys()].sort(compareContractStrings)),
        additions: contender
            .filter((entry) => !baselineByOwner.has(entry.ownerId))
            .map((entry) => entry.ownerId),
        removals: baseline
            .filter((entry) => !contenderByOwner.has(entry.ownerId))
            .map((entry) => entry.ownerId),
        transitions,
    };
}

function expectedOwnerGroupId(task, owner) {
    const ownerCandidateIds = new Set(
        finalCandidates(task)
            .filter((candidate) => candidateMatchesOwner(candidate, owner))
            .map((candidate) => candidate.candidateId),
    );
    return disclosedResults(task).find((group) => (
        group.candidateIds.some((candidateId) => ownerCandidateIds.has(candidateId))
    ))?.ownerId ?? null;
}

function classifyUnrelatedMembershipChange(diff, baselineTask, contenderTask, expectedOwner) {
    if (diff.membershipIdentityEqual) return false;
    const baselineOwner = expectedOwnerGroupId(baselineTask, expectedOwner);
    const contenderOwner = expectedOwnerGroupId(contenderTask, expectedOwner);
    const ownerVisibilityChanged = (baselineOwner === null) !== (contenderOwner === null);
    if (!ownerVisibilityChanged || diff.additions.length !== 1 || diff.removals.length !== 1) {
        return true;
    }
    return baselineOwner === null
        ? diff.additions[0] !== contenderOwner
        : diff.removals[0] !== baselineOwner;
}

function assertReplayBinding(replay, capture, policyId, label) {
    validateSelfDigest(replay, label);
    if (replay.policyId !== policyId || replay.policy?.policyId !== policyId) {
        throw new Error(`${label} does not bind policy '${policyId}'.`);
    }
    if (replay.sourceCaptureSha256 !== capture.sha256 || replay.baselineReproduced !== true) {
        throw new Error(`${label} does not bind and reproduce its frozen capture.`);
    }
    if (replay.providerValidationRequired !== false) {
        throw new Error(`${label} unexpectedly requires provider validation.`);
    }
}

function taskMap(replay, label) {
    return new Map(requireArray(replay.tasks, `${label} tasks`).map((task) => [
        requireString(task.taskId, `${label} taskId`),
        task,
    ]));
}

function compareCandidateAndEligibilityInvariants(baselineTask, contenderTask) {
    if (contenderTask.invariants?.candidateMembershipIdentityEqual !== true
        || contenderTask.invariants?.eligibilityIdentityEqual !== true) {
        return false;
    }
    if (baselineTask.route?.kind === "exact_registry") {
        return contenderTask.invariants.exactIdentifierIdentityEqual === true
            && canonicalJson(contenderTask.rankedResults) === canonicalJson(baselineTask.rankedResults);
    }
    const baselineAttempts = requireArray(baselineTask.mcpAttempts, "Baseline MCP attempts");
    const contenderAttempts = requireArray(contenderTask.mcpAttempts, "Contender MCP attempts");
    if (baselineAttempts.length !== contenderAttempts.length) return false;
    return baselineAttempts.every((attempt, index) => {
        const contenderAttempt = contenderAttempts[index];
        const candidateIds = (value) => requireArray(value.candidates, "MCP candidates")
            .map((candidate) => candidate.candidateId)
            .sort(compareContractStrings);
        const removals = (value) => requireArray(value.removed, "MCP removals")
            .map(({ candidateId, reason }) => ({ candidateId, reason }))
            .sort((left, right) => (
                compareContractStrings(left.candidateId, right.candidateId)
                || compareContractStrings(left.reason, right.reason)
            ));
        return canonicalJson(candidateIds(attempt)) === canonicalJson(candidateIds(contenderAttempt))
            && canonicalJson(removals(attempt)) === canonicalJson(removals(contenderAttempt));
    });
}

function loadRepositoryArtifacts(r1Dir, replayDir, repositoryId) {
    const repositoryR1 = path.join(r1Dir, repositoryId);
    const repositoryReplay = path.join(replayDir, repositoryId);
    const positiveCapture = readJson(
        path.join(repositoryR1, "positive-capture.json"),
        `${repositoryId} positive capture`,
    );
    const negativeCapture = readJson(
        path.join(repositoryR1, "negative-capture.json"),
        `${repositoryId} negative capture`,
    );
    const positiveScore = readJson(
        path.join(repositoryR1, "positive-score.json"),
        `${repositoryId} positive score`,
    );
    validateSelfDigest(positiveCapture, `${repositoryId} positive capture`);
    validateSelfDigest(negativeCapture, `${repositoryId} negative capture`);
    validateSelfDigest(positiveScore, `${repositoryId} positive score`);
    const replays = Object.fromEntries(POLICY_IDS.map((policyId) => {
        const slug = policyId.toLowerCase();
        const positive = readJson(
            path.join(repositoryReplay, `positive-${slug}.json`),
            `${repositoryId} positive ${policyId} replay`,
        );
        const negative = readJson(
            path.join(repositoryReplay, `negative-${slug}.json`),
            `${repositoryId} negative ${policyId} replay`,
        );
        assertReplayBinding(
            positive,
            positiveCapture,
            policyId,
            `${repositoryId} positive ${policyId} replay`,
        );
        assertReplayBinding(
            negative,
            negativeCapture,
            policyId,
            `${repositoryId} negative ${policyId} replay`,
        );
        return [policyId, { positive, negative }];
    }));
    return { positiveCapture, negativeCapture, positiveScore, replays };
}

function buildQualityResult(repositoryId, artifacts, policyId) {
    const replayTasks = taskMap(
        artifacts.replays[policyId].positive,
        `${repositoryId} ${policyId} positive`,
    );
    const scoreTasks = requireArray(
        artifacts.positiveScore.tasks,
        `${repositoryId} positive score tasks`,
    );
    return scoreTasks
        .filter((task) => task.policyApplicable === true && task.ownerSurvives === true)
        .map((scoreTask) => {
            const task = replayTasks.get(scoreTask.taskId);
            if (!task) throw new Error(`${repositoryId} ${policyId} lacks '${scoreTask.taskId}'.`);
            const expected = requireRecord(task.expected, `Task '${task.taskId}' expected`);
            const rank = ownerRank(task, {
                file: requireString(expected.ownerFile, "Expected ownerFile"),
                symbol: requireString(expected.ownerSymbol, "Expected ownerSymbol"),
            });
            return { taskId: task.taskId, rank, metrics: metricForRank(rank), task };
        });
}

function buildNegativeResult(repositoryId, artifacts, policyId) {
    const replayTasks = taskMap(
        artifacts.replays[policyId].negative,
        `${repositoryId} ${policyId} negative`,
    );
    return [...replayTasks.values()].map((task) => {
        const expected = requireRecord(task.expected, `Task '${task.taskId}' expected`);
        const owners = requireArray(
            expected.hardNegativeOwners,
            `Task '${task.taskId}' hard negative owners`,
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

function summarizePolicy(repositoryIds, qualityByRepository, negativeByRepository) {
    const repositoryQuality = Object.fromEntries(repositoryIds.map((repositoryId) => [
        repositoryId,
        averageTaskMetrics(qualityByRepository[repositoryId]),
    ]));
    const repositoryNegative = Object.fromEntries(repositoryIds.map((repositoryId) => [
        repositoryId,
        roundMetric(mean(
            negativeByRepository[repositoryId].map((task) => task.exposureAt3),
        )),
    ]));
    return {
        repositoryQuality,
        repositoryNegative,
        macroQuality: averageTaskMetrics(repositoryIds.flatMap((repositoryId) => (
            [{
                metrics: repositoryQuality[repositoryId],
            }]
        ))),
        macroNegativeExposureAt3: roundMetric(mean(Object.values(repositoryNegative))),
    };
}

function metricDelta(contender, baseline, metric) {
    return roundMetric(contender[metric] - baseline[metric]);
}

function evaluateContender({
    contenderId,
    repositoryIds,
    summaries,
    bootstrapSamples,
    confidence,
    statisticalContract,
    safety,
}) {
    const baseline = summaries.B;
    const contender = summaries[contenderId];
    const qualityMetrics = {};
    for (const metric of ["ownerAt1", "ownerAt3", "ownerAt10", "reciprocalRank"]) {
        const repositoryDeltas = repositoryIds.map((repositoryId) => (
            contender.repositoryQuality[repositoryId][metric]
            - baseline.repositoryQuality[repositoryId][metric]
        ));
        qualityMetrics[metric] = {
            baseline: baseline.macroQuality[metric],
            contender: contender.macroQuality[metric],
            delta: metricDelta(contender.macroQuality, baseline.macroQuality, metric),
            repositoryDeltas: Object.fromEntries(repositoryIds.map(
                (repositoryId, index) => [repositoryId, roundMetric(repositoryDeltas[index])],
            )),
            interval: bootstrapInterval(repositoryDeltas, bootstrapSamples, confidence),
        };
    }
    const negativeRepositoryDeltas = repositoryIds.map((repositoryId) => (
        contender.repositoryNegative[repositoryId] - baseline.repositoryNegative[repositoryId]
    ));
    const negativeExposure = {
        baseline: baseline.macroNegativeExposureAt3,
        contender: contender.macroNegativeExposureAt3,
        delta: roundMetric(
            contender.macroNegativeExposureAt3 - baseline.macroNegativeExposureAt3,
        ),
        repositoryDeltas: Object.fromEntries(repositoryIds.map(
            (repositoryId, index) => [
                repositoryId,
                roundMetric(negativeRepositoryDeltas[index]),
            ],
        )),
        interval: bootstrapInterval(
            negativeRepositoryDeltas,
            bootstrapSamples,
            confidence,
        ),
    };
    const minimumEffects = statisticalContract.minimumEffects;
    const margins = statisticalContract.nonInferiorityMargins;
    const gates = {
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
        candidateMembershipAndEligibility: safety.invariantFailures.length === 0,
        exactIdentifier: safety.exactFailures.length === 0,
        unrelatedDisclosedMembership: safety.unrelatedMembershipChanges.length === 0,
    };
    return {
        policyId: contenderId,
        qualityMetrics,
        negativeExposure,
        safety,
        gates,
        passesEveryGate: Object.values(gates).every(Boolean),
    };
}

function selectFinalist(contenders, simplicityTie) {
    const passing = contenders.filter((contender) => contender.passesEveryGate);
    if (passing.length === 0) {
        return { selectedPolicyId: null, reason: "no_contender_passed_every_gate" };
    }
    if (passing.length === 1) {
        return { selectedPolicyId: passing[0].policyId, reason: "only_passing_contender" };
    }
    const ordered = [...passing].sort((left, right) => (
        right.qualityMetrics.reciprocalRank.delta
        - left.qualityMetrics.reciprocalRank.delta
    ));
    const difference = (
        ordered[0].qualityMetrics.reciprocalRank.delta
        - ordered[1].qualityMetrics.reciprocalRank.delta
    );
    if (difference < simplicityTie) {
        return {
            selectedPolicyId: null,
            reason: "passing_contenders_within_simplicity_tie_without_unique_simpler_policy",
        };
    }
    return {
        selectedPolicyId: ordered[0].policyId,
        reason: "largest_repository_macro_mrr_improvement",
    };
}

export function evaluateR2({ manifest, r1Dir, replayDir }) {
    if (manifest.version !== 2 || manifest.kind !== "satori_cross_repository_ranking_manifest") {
        throw new Error("R2 requires the version-2 cross-repository manifest.");
    }
    const manifestSeal = requireString(manifest.sha256, "Manifest seal");
    const { sha256: _ignoredManifestSeal, ...unsignedManifest } = manifest;
    if (sha256Canonical(unsignedManifest) !== manifestSeal) {
        throw new Error("Manifest seal does not match its canonical contents.");
    }
    const repositoryIds = requireArray(manifest.repositories, "Manifest repositories")
        .filter((repository) => repository.split === "tuning")
        .map((repository) => repository.id);
    if (repositoryIds.length !== 3) {
        throw new Error("R2 requires exactly three frozen tuning repositories.");
    }
    const statisticalContract = requireRecord(
        manifest.statisticalContract,
        "Manifest statistical contract",
    );
    const confidence = statisticalContract.multiplicityAdjustedConfidence?.deterministic;
    if (confidence !== 0.975) {
        throw new Error("R2 deterministic confidence must remain frozen at 0.975.");
    }
    const repositoryArtifacts = Object.fromEntries(repositoryIds.map((repositoryId) => [
        repositoryId,
        loadRepositoryArtifacts(r1Dir, replayDir, repositoryId),
    ]));
    const qualityByPolicy = {};
    const negativeByPolicy = {};
    const summaries = {};
    for (const policyId of POLICY_IDS) {
        qualityByPolicy[policyId] = {};
        negativeByPolicy[policyId] = {};
        for (const repositoryId of repositoryIds) {
            qualityByPolicy[policyId][repositoryId] = buildQualityResult(
                repositoryId,
                repositoryArtifacts[repositoryId],
                policyId,
            );
            negativeByPolicy[policyId][repositoryId] = buildNegativeResult(
                repositoryId,
                repositoryArtifacts[repositoryId],
                policyId,
            );
        }
        summaries[policyId] = summarizePolicy(
            repositoryIds,
            qualityByPolicy[policyId],
            negativeByPolicy[policyId],
        );
    }
    const qualityTaskCount = repositoryIds.reduce(
        (total, repositoryId) => total + qualityByPolicy.B[repositoryId].length,
        0,
    );
    const negativeTaskCount = repositoryIds.reduce(
        (total, repositoryId) => total + negativeByPolicy.B[repositoryId].length,
        0,
    );
    if (qualityTaskCount !== 14 || negativeTaskCount !== 6) {
        throw new Error(
            `R2 task authority mismatch (quality=${qualityTaskCount}, negative=${negativeTaskCount}).`,
        );
    }
    const exactControls = [];
    for (const repositoryId of repositoryIds) {
        const scoreTasks = repositoryArtifacts[repositoryId].positiveScore.tasks;
        const exactTaskIds = scoreTasks
            .filter((task) => task.queryClass === "exact_identifier")
            .map((task) => task.taskId);
        for (const taskId of exactTaskIds) {
            exactControls.push({ repositoryId, taskId });
        }
    }
    if (exactControls.length !== 1) {
        throw new Error(`R2 requires exactly one exact-identifier control, found ${exactControls.length}.`);
    }
    const bootstrapSamples = buildBootstrapSamples(
        repositoryIds.length,
        statisticalContract.clusterBootstrapResamples,
        manifestSeal,
    );
    const rankAndListDiffs = {};
    const contenderResults = CONTENDER_IDS.map((contenderId) => {
        const safety = {
            invariantFailures: [],
            exactFailures: [],
            unrelatedMembershipChanges: [],
        };
        rankAndListDiffs[contenderId] = [];
        for (const repositoryId of repositoryIds) {
            const artifacts = repositoryArtifacts[repositoryId];
            const baselinePositive = taskMap(
                artifacts.replays.B.positive,
                `${repositoryId} B positive`,
            );
            const contenderPositive = taskMap(
                artifacts.replays[contenderId].positive,
                `${repositoryId} ${contenderId} positive`,
            );
            for (const baselineQuality of qualityByPolicy.B[repositoryId]) {
                const taskId = baselineQuality.taskId;
                const baselineTask = baselinePositive.get(taskId);
                const contenderTask = contenderPositive.get(taskId);
                if (!compareCandidateAndEligibilityInvariants(baselineTask, contenderTask)) {
                    safety.invariantFailures.push({ repositoryId, taskId, suite: "quality" });
                }
                const expected = baselineTask.expected;
                const diff = diffDisclosedLists(baselineTask, contenderTask);
                const unrelated = classifyUnrelatedMembershipChange(diff, baselineTask, contenderTask, {
                    file: expected.ownerFile,
                    symbol: expected.ownerSymbol,
                });
                if (unrelated) {
                    safety.unrelatedMembershipChanges.push({
                        repositoryId,
                        taskId,
                        suite: "quality",
                        additions: diff.additions,
                        removals: diff.removals,
                    });
                }
                rankAndListDiffs[contenderId].push({
                    repositoryId,
                    taskId,
                    suite: "quality",
                    baselineOwnerRank: baselineQuality.rank,
                    contenderOwnerRank: qualityByPolicy[contenderId][repositoryId]
                        .find((task) => task.taskId === taskId).rank,
                    unrelatedMembershipChange: unrelated,
                    ...diff,
                });
            }
            const baselineNegative = taskMap(
                artifacts.replays.B.negative,
                `${repositoryId} B negative`,
            );
            const contenderNegative = taskMap(
                artifacts.replays[contenderId].negative,
                `${repositoryId} ${contenderId} negative`,
            );
            for (const baselineNegativeTask of negativeByPolicy.B[repositoryId]) {
                const taskId = baselineNegativeTask.taskId;
                const baselineTask = baselineNegative.get(taskId);
                const contenderTask = contenderNegative.get(taskId);
                if (!compareCandidateAndEligibilityInvariants(baselineTask, contenderTask)) {
                    safety.invariantFailures.push({ repositoryId, taskId, suite: "negative" });
                }
                const diff = diffDisclosedLists(baselineTask, contenderTask);
                if (!diff.membershipIdentityEqual) {
                    safety.unrelatedMembershipChanges.push({
                        repositoryId,
                        taskId,
                        suite: "negative",
                        additions: diff.additions,
                        removals: diff.removals,
                    });
                }
                rankAndListDiffs[contenderId].push({
                    repositoryId,
                    taskId,
                    suite: "negative",
                    baselineHardNegativeRanks: baselineNegativeTask.ranks,
                    contenderHardNegativeRanks: negativeByPolicy[contenderId][repositoryId]
                        .find((task) => task.taskId === taskId).ranks,
                    unrelatedMembershipChange: !diff.membershipIdentityEqual,
                    ...diff,
                });
            }
        }
        for (const { repositoryId, taskId } of exactControls) {
            const artifacts = repositoryArtifacts[repositoryId];
            const baselineTask = taskMap(
                artifacts.replays.B.positive,
                `${repositoryId} B positive`,
            ).get(taskId);
            const contenderTask = taskMap(
                artifacts.replays[contenderId].positive,
                `${repositoryId} ${contenderId} positive`,
            ).get(taskId);
            if (!compareCandidateAndEligibilityInvariants(baselineTask, contenderTask)
                || canonicalJson(baselineTask.rankedResults)
                    !== canonicalJson(contenderTask.rankedResults)) {
                safety.exactFailures.push({ repositoryId, taskId });
            }
            rankAndListDiffs[contenderId].push({
                repositoryId,
                taskId,
                suite: "exact_identifier",
                identityEqual: canonicalJson(baselineTask.rankedResults)
                    === canonicalJson(contenderTask.rankedResults),
                baseline: baselineTask.rankedResults,
                contender: contenderTask.rankedResults,
            });
        }
        return evaluateContender({
            contenderId,
            repositoryIds,
            summaries,
            bootstrapSamples,
            confidence,
            statisticalContract,
            safety,
        });
    });
    const selection = selectFinalist(
        contenderResults,
        statisticalContract.minimumEffects.simplicityTie,
    );
    const result = {
        version: 1,
        kind: "satori_search_ranking_r2_result",
        manifestSeal,
        statisticalContract,
        taskAuthority: {
            qualityTaskCount,
            negativeTaskCount,
            exactIdentifierTaskCount: exactControls.length,
            excludedHardMissTaskCount: 5,
        },
        baseline: summaries.B,
        contenders: contenderResults,
        rankAndListDiffs,
        selection,
    };
    return { ...result, sha256: sha256Canonical(result) };
}

function usage() {
    return "Usage: node scripts/satori-search-ranking-r2.mjs --manifest <manifest.json> --r1-dir <extracted-r1> --replay-dir <r2-replays> [--out <result.json>]";
}

export function main(argv = process.argv.slice(2)) {
    let manifestFile;
    let r1Dir;
    let replayDir;
    let outFile;
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === "--manifest") manifestFile = path.resolve(argv[++index]);
        else if (argv[index] === "--r1-dir") r1Dir = path.resolve(argv[++index]);
        else if (argv[index] === "--replay-dir") replayDir = path.resolve(argv[++index]);
        else if (argv[index] === "--out") outFile = path.resolve(argv[++index]);
        else if (argv[index] === "--help") {
            process.stdout.write(`${usage()}\n`);
            return null;
        } else {
            throw new Error(`Unknown argument: ${argv[index]}`);
        }
    }
    if (!manifestFile || !r1Dir || !replayDir) throw new Error(usage());
    const result = evaluateR2({
        manifest: readJson(manifestFile, "R2 manifest"),
        r1Dir,
        replayDir,
    });
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    if (outFile) fs.writeFileSync(outFile, serialized);
    else process.stdout.write(serialized);
    return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
    try {
        main();
    } catch (error) {
        process.stderr.write(
            `satori-search-ranking-r2: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        process.exitCode = 1;
    }
}
