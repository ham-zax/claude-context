#!/usr/bin/env -S node --import tsx
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
    averageTaskMetrics,
    bootstrapInterval,
    buildBootstrapSamples,
    metricForRank,
    ownerRank,
} from "./satori-search-ranking-r2.mjs";
import {
    buildFrozenPaginationReplay,
    replayBaselineCandidateCapture,
    replayNeuralCandidateCapture,
} from "./satori-search-candidate-replay.mjs";
import {
    bindTrackOHeldOutOpening,
    TRACK_O_CANDIDATE_ID,
    TRACK_O_MANIFEST_FILE_SHA256,
    TRACK_O_MANIFEST_SEAL_SHA256,
    TRACK_O_PROFILE_ID,
    validateTrackOHeldOutOpeningRecord,
} from "./satori-track-o-heldout-opening.mjs";
import { canonicalJson } from "./satori-useful-context.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const SCORE_SCRIPT_PATH = fileURLToPath(new URL("./satori-lateon-track-o-o3-score.mjs", import.meta.url));
const RERANKER_RUNTIME_PATH = fileURLToPath(
    new URL("../packages/mcp/src/server/lateon-reranker.ts", import.meta.url),
);
const RERANKER_WORKER_PATH = fileURLToPath(
    new URL("../packages/mcp/dist/server/lateon-reranker-worker.js", import.meta.url),
);
const PROJECTION_OWNER_PATH = fileURLToPath(
    new URL("../packages/mcp/src/core/search-rerank-document-v2.ts", import.meta.url),
);
const CAPTURED_PROJECTION_ADAPTER_PATH = fileURLToPath(
    new URL("./satori-captured-rerank-projection-v2.mjs", import.meta.url),
);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;
const REQUIRED_REPOSITORY_COUNT = 6;
const REQUIRED_QUALITY_OWNER_COUNT = 35;
const REQUIRED_OWNER_CONTROL_COUNT = 3;
const REQUIRED_NEGATIVE_COUNT = 12;
const EXCLUDED_TASK = Object.freeze({
    taskId: "promptready-primary-action",
    reason: "pre_open_held_out_payload_exposure",
    decisionBearing: false,
    scored: false,
});
const CONTROL_TASKS = Object.freeze({
    exact_identifier: "prompt-library-state-exact-control",
    must: "portfolio-page-items-must-control",
    configuration_pin: "supply-fastapi-configuration-control",
});
const QUALITY_METRICS = Object.freeze([
    "ownerAt1",
    "ownerAt3",
    "ownerAt10",
    "reciprocalRank",
]);
const RESAMPLES = 10_000;
const CONFIDENCE = 0.95;
const THRESHOLDS = Object.freeze({
    ownerAt3: 0.05,
    reciprocalRank: 0.03,
    ownerAt1: -0.02,
    ownerAt10: -0.01,
    hardNegativeExposureAt3: 0.02,
    unacceptableOwnerExposureAt3: 0.02,
});

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

function requireSha256(value, label) {
    const digest = requireString(value, label);
    if (!SHA256_PATTERN.test(digest)) throw new Error(`${label} must be a SHA-256 digest.`);
    return digest;
}

function requireRevision(value, label) {
    const revision = requireString(value, label);
    if (!REVISION_PATTERN.test(revision)) throw new Error(`${label} must be a Git revision.`);
    return revision;
}

function requireEqual(actual, expected, label) {
    if (canonicalJson(actual) !== canonicalJson(expected)) {
        throw new Error(`${label} is incompatible.`);
    }
    return actual;
}

function sha256Bytes(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Canonical(value) {
    return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}

function validateSelfDigest(value, label) {
    const record = requireRecord(value, label);
    const supplied = requireSha256(record.sha256, `${label} sha256`);
    const { sha256: _ignored, ...unsigned } = record;
    if (sha256Canonical(unsigned) !== supplied) {
        throw new Error(`${label} digest does not match its contents.`);
    }
    return record;
}

function compareStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function roundMetric(value) {
    return Number(value.toFixed(12));
}

function mean(values) {
    if (values.length === 0) throw new Error("Cannot average an empty metric stratum.");
    return values.reduce((total, value) => total + value, 0) / values.length;
}

function taskMap(tasks, label) {
    const entries = requireArray(tasks, `${label} tasks`).map((task, index) => {
        const record = requireRecord(task, `${label} task ${index + 1}`);
        return [requireString(record.taskId, `${label} task ${index + 1} id`), record];
    });
    const result = new Map(entries);
    if (result.size !== entries.length) throw new Error(`${label} has duplicate task IDs.`);
    return result;
}

function normalizeOwner(owner, label) {
    const record = requireRecord(owner, label);
    const file = requireString(record.file, `${label} file`);
    const symbol = record.symbol === undefined ? undefined : requireString(record.symbol, `${label} symbol`);
    return {
        file,
        ...(symbol ? { symbol } : {}),
        match: record.match === "file" || symbol === undefined ? "file" : "symbol",
    };
}

function normalizeManifestOwner(owner, ownerMatch, label) {
    const record = requireRecord(owner, label);
    const file = requireString(record.file, `${label} file`);
    const symbol = record.symbol === undefined ? undefined : requireString(record.symbol, `${label} symbol`);
    const match = ownerMatch === "file" || symbol === undefined ? "file" : "symbol";
    return { file, ...(symbol ? { symbol } : {}), match };
}

function normalizedSafetyControls(task, label) {
    const controls = requireArray(task.safetyControls ?? [], `${label} safetyControls`);
    if (new Set(controls).size !== controls.length
        || controls.some((control) => !(control in CONTROL_TASKS))) {
        throw new Error(`${label} has invalid safety controls.`);
    }
    return [...controls];
}

function expectedTaskFromManifest(task, repository) {
    const label = `Manifest task '${task.id}'`;
    const oracle = requireRecord(task.oracle, `${label} oracle`);
    const safetyControls = normalizedSafetyControls(task, label);
    if (task.split !== "held_out") throw new Error(`${label} is not held out.`);
    const common = {
        taskId: requireString(task.id, `${label} id`),
        split: "held_out",
        queryClass: requireString(task.queryClass, `${label} queryClass`),
        safetyControls,
        language: requireString(repository.primaryLanguage, `${label} language`),
    };
    if (oracle.kind === "negative") {
        if (safetyControls.length > 0) throw new Error(`${label} negative oracle has safety controls.`);
        return {
            ...common,
            suite: "negative",
            expected: {
                hardNegativeOwners: requireArray(oracle.hardNegativeOwners, `${label} hard negatives`)
                    .map((owner, index) => normalizeManifestOwner(
                        owner,
                        owner.match,
                        `${label} hard negative ${index + 1}`,
                    )),
                acceptableAlternativeOwners: requireArray(
                    oracle.acceptableAlternativeOwners ?? [],
                    `${label} acceptable alternatives`,
                ).map((owner, index) => normalizeManifestOwner(
                    owner,
                    owner.match,
                    `${label} acceptable alternative ${index + 1}`,
                )),
            },
        };
    }
    if (oracle.kind !== "owner") throw new Error(`${label} has an unsupported oracle.`);
    const owner = normalizeManifestOwner(oracle.requiredOwner, oracle.ownerMatch, `${label} owner`);
    return {
        ...common,
        suite: "positive",
        expected: {
            ownerFile: owner.file,
            ...(owner.symbol ? { ownerSymbol: owner.symbol } : {}),
            ownerMatch: owner.match,
        },
    };
}

function parseHeldOutManifestBytes(manifestBytes, opening) {
    if (!Buffer.isBuffer(manifestBytes)) {
        throw new Error("O3 manifest must be supplied as unopened raw bytes.");
    }
    if (sha256Bytes(manifestBytes) !== opening.authority.manifestFileSha256) {
        throw new Error("O3 manifest file bytes do not match the opening record.");
    }
    let parsed;
    try {
        parsed = JSON.parse(manifestBytes.toString("utf8"));
    } catch (error) {
        throw new Error(`O3 manifest is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const manifest = validateSelfDigest(parsed, "O3 held-out manifest");
    if (manifest.version !== 3
        || manifest.kind !== "satori_cross_repository_ranking_manifest"
        || manifest.sha256 !== opening.authority.manifestCanonicalSealSha256) {
        throw new Error("O3 manifest does not match the exact opening record.");
    }
    const repositoriesById = new Map();
    for (const repository of requireArray(manifest.repositories, "O3 manifest repositories")) {
        if (repository.split !== "held_out") continue;
        const id = requireString(repository.id, "O3 manifest repository id");
        if (repositoriesById.has(id)) throw new Error(`O3 manifest duplicates repository '${id}'.`);
        repositoriesById.set(id, {
            id,
            family: requireString(repository.family, `Manifest repository '${id}' family`),
            revision: requireRevision(repository.revision, `Manifest repository '${id}' revision`),
            gitTree: requireRevision(repository.gitTree, `Manifest repository '${id}' tree`),
            sourceTreeSha256: requireSha256(
                repository.sourceTreeSha256,
                `Manifest repository '${id}' source tree digest`,
            ),
            primaryLanguage: requireString(
                repository.primaryLanguage,
                `Manifest repository '${id}' language`,
            ),
            tasks: new Map(),
        });
    }
    if (repositoriesById.size !== REQUIRED_REPOSITORY_COUNT) {
        throw new Error(`O3 requires ${REQUIRED_REPOSITORY_COUNT} held-out repositories.`);
    }
    for (const task of requireArray(manifest.tasks, "O3 manifest tasks")) {
        if (task.split !== "held_out") continue;
        const repository = repositoriesById.get(task.repositoryId);
        if (!repository) throw new Error(`Manifest task '${task.id}' has no repository authority.`);
        const expected = expectedTaskFromManifest(task, repository);
        if (repository.tasks.has(expected.taskId)) throw new Error(`O3 manifest duplicates task '${expected.taskId}'.`);
        repository.tasks.set(expected.taskId, expected);
    }
    const excluded = [...repositoriesById.values()]
        .flatMap((repository) => [...repository.tasks.values()])
        .filter(({ taskId }) => taskId === EXCLUDED_TASK.taskId);
    if (excluded.length !== 1 || excluded[0].suite !== "positive"
        || excluded[0].safetyControls.length !== 0) {
        throw new Error("O3 manifest does not contain the exact excluded non-decision task.");
    }
    return { manifest, repositoriesById };
}

function captureExpected(task) {
    if (task.suite === "negative") {
        return {
            hardNegativeOwners: task.expected.hardNegativeOwners.map(({ file, symbol }) => ({
                file,
                ...(symbol ? { symbol } : {}),
            })),
        };
    }
    return task.expected;
}

function validateCaptureTasks(capture, expectedTasks, label) {
    const captures = taskMap(capture.captures, label);
    requireEqual(
        [...captures.keys()].sort(compareStrings),
        [...expectedTasks.keys()].sort(compareStrings),
        `${label} task IDs`,
    );
    for (const [taskId, taskCapture] of captures) {
        const expected = expectedTasks.get(taskId);
        requireEqual(taskCapture.split, "held_out", `${label} '${taskId}' split`);
        requireEqual(taskCapture.queryClass, expected.queryClass, `${label} '${taskId}' query class`);
        requireEqual(
            normalizedSafetyControls(taskCapture, `${label} '${taskId}'`),
            expected.safetyControls,
            `${label} '${taskId}' controls`,
        );
        requireEqual(taskCapture.language, expected.language, `${label} '${taskId}' language`);
        requireEqual(taskCapture.expected, captureExpected(expected), `${label} '${taskId}' oracle`);
    }
    return captures;
}

function validateIndexReceipt(indexReceiptBytes, fileSha256, repository, opening) {
    const label = `Repository '${repository.id}' index receipt`;
    if (!Buffer.isBuffer(indexReceiptBytes)) throw new Error(`${label} must be supplied as raw bytes.`);
    if (sha256Bytes(indexReceiptBytes) !== requireSha256(fileSha256, `${label} file digest`)) {
        throw new Error(`${label} file digest is incompatible.`);
    }
    const indexReceipt = requireRecord(
        JSON.parse(indexReceiptBytes.toString("utf8")),
        label,
    );
    if (indexReceipt.version !== 1
        || indexReceipt.repositoryId !== repository.id
        || indexReceipt.manifestSeal !== opening.authority.manifestCanonicalSealSha256) {
        throw new Error(`${label} identity is incompatible.`);
    }
    requireEqual(indexReceipt.repository, {
        ...indexReceipt.repository,
        revision: repository.revision,
        gitTree: repository.gitTree,
        sourceTreeSha256: repository.sourceTreeSha256,
        clean: true,
    }, `${label} source identity`);
    return {
        canonicalRoot: requireString(indexReceipt.repository.path, `${label} source root`),
        publication: requireRecord(indexReceipt.index?.publication, `${label} publication`),
    };
}

function expectedTrackOBinding(opening) {
    return {
        openingRecordSha256: opening.sha256,
        o2ReceiptSha256: opening.authority.o2ReceiptSha256,
        profile: opening.profile,
        candidate: opening.candidate,
        exclusions: [EXCLUDED_TASK],
    };
}

function expectedScorerIdentity() {
    return {
        id: "satori_lateon_track_o_o3_d32_scorer_v1",
        sourceSha256: sha256Bytes(fs.readFileSync(SCORE_SCRIPT_PATH)),
        runtimeSha256: sha256Bytes(fs.readFileSync(RERANKER_RUNTIME_PATH)),
        workerSha256: sha256Bytes(fs.readFileSync(RERANKER_WORKER_PATH)),
        projectionSha256: sha256Bytes(fs.readFileSync(PROJECTION_OWNER_PATH)),
        capturedProjectionAdapterSha256:
            sha256Bytes(fs.readFileSync(CAPTURED_PROJECTION_ADAPTER_PATH)),
    };
}

function validateScoreIdentity(score, capture, unboundBaseline, repository, opening, label) {
    if (score.schemaVersion !== "satori_search_ranking_track_l_scores_v2"
        || score.contenderId !== TRACK_O_CANDIDATE_ID
        || score.candidateDepth !== 32
        || score.heldOutOpeningSha256 !== opening.sha256) {
        throw new Error(`${label} score identity is unsupported.`);
    }
    const contract = requireRecord(score.contract, `${label} score contract`);
    requireEqual(contract.projectionVersion, opening.candidate.projection.id, `${label} projection`);
    requireEqual(contract.manifestSeal, opening.authority.manifestCanonicalSealSha256, `${label} manifest seal`);
    requireEqual(contract.manifestFileSha256, opening.authority.manifestFileSha256, `${label} manifest file`);
    requireEqual(contract.repositoryId, repository.id, `${label} repository`);
    const trackO = requireRecord(contract.trackO, `${label} Track O binding`);
    const { scorer: scorerValue, ...trackOBinding } = trackO;
    requireEqual(trackOBinding, expectedTrackOBinding(opening), `${label} Track O binding`);
    const scorer = requireRecord(scorerValue, `${label} scorer`);
    requireEqual(scorer, expectedScorerIdentity(), `${label} scorer identity`);
    requireEqual(score.source, {
        ...score.source,
        repositoryId: repository.id,
        revision: repository.revision,
        tree: repository.gitTree,
        sourceTreeSha256: repository.sourceTreeSha256,
    }, `${label} score source`);
    requireEqual(score.authority, capture.authority, `${label} score capture authority`);
    const bindings = requireArray(score.captures, `${label} score captures`);
    if (bindings.length !== 1
        || bindings[0].captureSha256 !== capture.sha256
        || bindings[0].baselineReplaySha256 !== unboundBaseline.sha256) {
        throw new Error(`${label} score does not bind its capture and production baseline.`);
    }
    if (score.qualification?.passed !== true
        || score.qualification?.allOrNothingFallbackPreserved !== true) {
        throw new Error(`${label} score did not pass the frozen all-or-nothing contract.`);
    }
    requireEqual(
        [...taskMap(score.tasks, `${label} score`).keys()].sort(compareStrings),
        [...taskMap(capture.captures, `${label} capture`).keys()].sort(compareStrings),
        `${label} score task membership`,
    );
    return scorer;
}

function validateSuiteArtifacts(suite, expectedTasks, repository, opening, indexIdentity, replayApi) {
    const label = `Repository '${repository.id}' ${suite.name}`;
    const fileSha256 = requireRecord(suite.fileSha256, `${label} file digests`);
    for (const field of ["capture", "baselineReplay", "neuralScore", "neuralReplay"]) {
        requireSha256(fileSha256[field], `${label} ${field} file digest`);
    }
    const capture = validateSelfDigest(suite.capture, `${label} capture`);
    const storedBaseline = validateSelfDigest(suite.baselineReplay, `${label} baseline replay`);
    const score = validateSelfDigest(suite.neuralScore, `${label} D32 score`);
    const storedNeural = validateSelfDigest(suite.neuralReplay, `${label} D32 replay`);
    for (const [name, artifact] of [
        ["capture", capture],
        ["baseline replay", storedBaseline],
        ["D32 score", score],
        ["D32 replay", storedNeural],
    ]) {
        if (artifact.heldOutOpeningSha256 !== opening.sha256) {
            throw new Error(`${label} ${name} is not opening-bound.`);
        }
    }
    if (capture.version !== 2
        || capture.kind !== "satori_search_candidate_capture"
        || capture.taskSuiteVersion !== 2
        || capture.policyId !== "baseline"
        || capture.authority?.gitRevision !== repository.revision) {
        throw new Error(`${label} capture identity is incompatible.`);
    }
    requireEqual(
        capture.authority.armPublication.canonicalRoot,
        indexIdentity.canonicalRoot,
        `${label} source root`,
    );
    requireEqual(
        capture.authority.armPublication.publication,
        indexIdentity.publication,
        `${label} publication`,
    );
    validateCaptureTasks(capture, expectedTasks, `${label} capture`);
    const unboundBaseline = replayApi.replayBaseline(capture, {
        requireNeuralDisabled: true,
        requireGroupingReady: true,
    });
    requireEqual(
        storedBaseline,
        replayApi.bindOpening(unboundBaseline, opening),
        `${label} production baseline replay`,
    );
    const scorer = validateScoreIdentity(
        score,
        capture,
        unboundBaseline,
        repository,
        opening,
        label,
    );
    const unboundNeural = replayApi.replayNeural(capture, score, {
        expectedManifestSeal: opening.authority.manifestCanonicalSealSha256,
        allowedContenderIds: [TRACK_O_CANDIDATE_ID],
        diagnosticQualityOnly: false,
    });
    requireEqual(
        storedNeural,
        replayApi.bindOpening(unboundNeural, opening),
        `${label} production neural replay`,
    );
    return {
        capture,
        baseline: storedBaseline,
        score,
        replay: storedNeural,
        scorer,
        captureById: taskMap(capture.captures, `${label} capture`),
        unboundBaselineSha256: unboundBaseline.sha256,
        unboundNeuralSha256: unboundNeural.sha256,
        fileSha256,
    };
}

function finalAttempt(task, label) {
    return requireRecord(requireArray(task.mcpAttempts, `${label} attempts`).at(-1), `${label} final attempt`);
}

function candidateMembership(task, label) {
    if (task.route?.kind === "exact_registry") {
        return requireArray(task.rankedResults, `${label} exact results`).map((result) => (
            canonicalJson([result.file, result.symbol ?? null])
        )).sort(compareStrings);
    }
    return requireArray(finalAttempt(task, label).candidates, `${label} candidates`)
        .map((candidate) => requireString(candidate.candidateId, `${label} candidate ID`))
        .sort(compareStrings);
}

function eligibilityIdentity(task, label) {
    if (task.route?.kind === "exact_registry") return [];
    return requireArray(finalAttempt(task, label).removed ?? [], `${label} removals`)
        .map((removal) => canonicalJson(removal)).sort(compareStrings);
}

function groupingMembership(task, label) {
    if (task.route?.kind === "exact_registry") return candidateMembership(task, label);
    return requireArray(task.groupingDisclosure?.groupedResults, `${label} groups`)
        .map((group) => ({
            ownerId: requireString(group.ownerId, `${label} owner ID`),
            candidateIds: [...requireArray(group.candidateIds, `${label} group candidates`)]
                .sort(compareStrings),
        })).sort((left, right) => compareStrings(left.ownerId, right.ownerId));
}

function validatePagination(task, label) {
    if (task.route?.kind === "exact_registry") return true;
    const frozen = requireRecord(task.frozenPagination, `${label} pagination`);
    return frozen.additionalRerankerCalls === 0
        && canonicalJson(frozen) === canonicalJson(buildFrozenPaginationReplay(
            task.groupingDisclosure,
            frozen.pageSize,
        ));
}

function ownerFromCapture(taskCapture, label) {
    const expected = requireRecord(taskCapture.expected, `${label} expected owner`);
    const ownerFile = requireString(expected.ownerFile, `${label} owner file`);
    const ownerSymbol = expected.ownerSymbol === undefined
        ? undefined
        : requireString(expected.ownerSymbol, `${label} owner symbol`);
    return {
        file: ownerFile,
        ...(ownerSymbol ? { symbol: ownerSymbol } : {}),
        match: expected.ownerMatch === "file" || ownerSymbol === undefined ? "file" : "symbol",
    };
}

function exactOwnerRank(task, owner, label) {
    const index = requireArray(task.rankedResults, `${label} exact results`).findIndex((result) => (
        result.file === owner.file && (owner.match === "file" || result.symbol === owner.symbol)
    ));
    return index < 0 ? null : index + 1;
}

function ownerRankForTask(task, owner, label) {
    return task.route?.kind === "exact_registry"
        ? exactOwnerRank(task, owner, label)
        : ownerRank(task, owner);
}

function exposureAt3(task, owners, label) {
    return owners.some((owner, index) => {
        const rank = ownerRankForTask(
            task,
            normalizeOwner(owner, `${label} owner ${index + 1}`),
            label,
        );
        return rank !== null && rank <= 3;
    }) ? 1 : 0;
}

function unacceptableExposureAt3(task, acceptableOwners, label) {
    const acceptableRanks = new Set(acceptableOwners.map((owner, index) => ownerRankForTask(
        task,
        normalizeOwner(owner, `${label} acceptable owner ${index + 1}`),
        label,
    )).filter((rank) => rank !== null && rank <= 3));
    const disclosedRanks = task.route?.kind === "exact_registry"
        ? requireArray(task.rankedResults, `${label} exact results`)
            .slice(0, 3).map((_result, index) => index + 1)
        : requireArray(task.groupingDisclosure?.disclosedResults, `${label} disclosed groups`)
            .map((group) => group.rank).filter((rank) => rank <= 3);
    return disclosedRanks.some((rank) => !acceptableRanks.has(rank)) ? 1 : 0;
}

function evaluateSuitePair({ captureById, baseline, replay, suiteName }) {
    const baselineById = taskMap(baseline.tasks, `${suiteName} baseline`);
    const replayById = taskMap(replay.tasks, `${suiteName} D32`);
    const safetyFailures = [];
    for (const [taskId, taskCapture] of captureById) {
        const label = `${suiteName} task '${taskId}'`;
        const baselineTask = baselineById.get(taskId);
        const replayTask = replayById.get(taskId);
        if (canonicalJson(candidateMembership(baselineTask, `${label} baseline`))
            !== canonicalJson(candidateMembership(replayTask, `${label} D32`))
            || canonicalJson(eligibilityIdentity(baselineTask, `${label} baseline`))
                !== canonicalJson(eligibilityIdentity(replayTask, `${label} D32`))
            || canonicalJson(groupingMembership(baselineTask, `${label} baseline`))
                !== canonicalJson(groupingMembership(replayTask, `${label} D32`))
            || replayTask.invariants?.candidateMembershipIdentityEqual !== true
            || replayTask.invariants?.eligibilityIdentityEqual !== true) {
            safetyFailures.push({ taskId, kind: "candidate_eligibility_or_grouping" });
        }
        if (!validatePagination(baselineTask, `${label} baseline`)
            || !validatePagination(replayTask, `${label} D32`)) {
            safetyFailures.push({ taskId, kind: "frozen_pagination" });
        }
        const controls = normalizedSafetyControls(taskCapture, label);
        if (controls.length > 0) {
            const owner = ownerFromCapture(taskCapture, label);
            const baselineRank = ownerRankForTask(baselineTask, owner, `${label} baseline`);
            const contenderRank = ownerRankForTask(replayTask, owner, `${label} D32`);
            const exactOrderChanged = controls.includes("exact_identifier")
                && canonicalJson(baselineTask.rankedResults) !== canonicalJson(replayTask.rankedResults);
            if (baselineRank !== 1 || contenderRank !== 1 || exactOrderChanged) {
                safetyFailures.push({
                    taskId,
                    kind: "query_control",
                    controls,
                    baselineRank,
                    contenderRank,
                    exactOrderChanged,
                });
            }
        }
    }
    return { baselineById, replayById, safetyFailures };
}

function evaluateRepository(repository, positive, negative) {
    const positivePair = evaluateSuitePair({
        captureById: positive.captureById,
        baseline: positive.baseline,
        replay: positive.replay,
        suiteName: `${repository.id}/positive`,
    });
    const negativePair = evaluateSuitePair({
        captureById: negative.captureById,
        baseline: negative.baseline,
        replay: negative.replay,
        suiteName: `${repository.id}/negative`,
    });
    const quality = { baseline: [], contender: [] };
    const hardNegative = { baseline: [], contender: [] };
    const unacceptable = { baseline: [], contender: [] };
    const controlCounts = Object.fromEntries(Object.keys(CONTROL_TASKS).map((control) => [control, 0]));
    for (const [taskId, taskCapture] of positive.captureById) {
        const controls = normalizedSafetyControls(taskCapture, `${repository.id}/${taskId}`);
        for (const control of controls) controlCounts[control] += 1;
        if (controls.length > 0) continue;
        const owner = ownerFromCapture(taskCapture, `${repository.id}/${taskId}`);
        quality.baseline.push({ metrics: metricForRank(ownerRankForTask(
            positivePair.baselineById.get(taskId), owner, `${repository.id}/${taskId}/baseline`,
        )) });
        quality.contender.push({ metrics: metricForRank(ownerRankForTask(
            positivePair.replayById.get(taskId), owner, `${repository.id}/${taskId}/D32`,
        )) });
    }
    for (const [taskId, taskCapture] of negative.captureById) {
        const expected = requireRecord(taskCapture.expected, `${repository.id}/${taskId} expected`);
        const hardOwners = requireArray(expected.hardNegativeOwners, `${repository.id}/${taskId} hard owners`);
        const manifestTask = repository.tasks.get(taskId);
        const acceptableOwners = manifestTask.expected.acceptableAlternativeOwners;
        const baselineTask = negativePair.baselineById.get(taskId);
        const replayTask = negativePair.replayById.get(taskId);
        hardNegative.baseline.push(exposureAt3(baselineTask, hardOwners, `${taskId}/baseline`));
        hardNegative.contender.push(exposureAt3(replayTask, hardOwners, `${taskId}/D32`));
        unacceptable.baseline.push(unacceptableExposureAt3(
            baselineTask,
            acceptableOwners,
            `${taskId}/baseline`,
        ));
        unacceptable.contender.push(unacceptableExposureAt3(
            replayTask,
            acceptableOwners,
            `${taskId}/D32`,
        ));
    }
    return {
        repositoryId: repository.id,
        family: repository.family,
        qualityTaskCount: quality.baseline.length,
        controlCounts,
        negativeTaskCount: hardNegative.baseline.length,
        quality: {
            baseline: averageTaskMetrics(quality.baseline),
            contender: averageTaskMetrics(quality.contender),
        },
        hardNegativeExposureAt3: {
            baseline: roundMetric(mean(hardNegative.baseline)),
            contender: roundMetric(mean(hardNegative.contender)),
        },
        unacceptableOwnerExposureAt3: {
            baseline: roundMetric(mean(unacceptable.baseline)),
            contender: roundMetric(mean(unacceptable.contender)),
        },
        safetyFailures: [...positivePair.safetyFailures, ...negativePair.safetyFailures],
    };
}

function aggregate(repositoryResults, selector, samples) {
    const baseline = repositoryResults.map((result) => selector(result).baseline);
    const contender = repositoryResults.map((result) => selector(result).contender);
    const deltas = contender.map((value, index) => value - baseline[index]);
    return {
        baseline: roundMetric(mean(baseline)),
        contender: roundMetric(mean(contender)),
        delta: roundMetric(mean(deltas)),
        repositoryDeltas: Object.fromEntries(repositoryResults.map((result, index) => [
            result.repositoryId,
            roundMetric(deltas[index]),
        ])),
        interval: bootstrapInterval(deltas, samples, CONFIDENCE),
    };
}

function trackOOutcome(safetyPasses, practicalPasses, confidencePasses) {
    if (!safetyPasses || !practicalPasses) return "offline_lateon_rejected_by_held_out";
    if (!confidencePasses) return "offline_lateon_insufficient_held_out_evidence";
    return "offline_lateon_held_out_qualified_retained_disabled";
}

export function adjudicateTrackOHeldOut(input, options = {}) {
    const opening = validateTrackOHeldOutOpeningRecord(
        input.openingRecord,
        options.openingValidation,
    );
    const expectedManifestSeal = options.expectedManifestSealSha256
        ?? TRACK_O_MANIFEST_SEAL_SHA256;
    const expectedManifestFile = options.expectedManifestFileSha256
        ?? TRACK_O_MANIFEST_FILE_SHA256;
    requireEqual(opening.authority.manifestCanonicalSealSha256, expectedManifestSeal, "O3 manifest seal");
    requireEqual(opening.authority.manifestFileSha256, expectedManifestFile, "O3 manifest file digest");
    if (opening.candidate.id !== TRACK_O_CANDIDATE_ID
        || opening.candidate.candidateDepth !== 32
        || opening.profile.id !== TRACK_O_PROFILE_ID) {
        throw new Error("O3 opening does not authorize the sole D32 candidate.");
    }
    const manifestAuthority = parseHeldOutManifestBytes(input.manifestBytes, opening);
    const replayApi = {
        replayBaseline: options.replayBaseline ?? replayBaselineCandidateCapture,
        replayNeural: options.replayNeural ?? replayNeuralCandidateCapture,
        bindOpening: options.bindOpening ?? bindTrackOHeldOutOpening,
    };
    const inputRepositories = requireArray(input.repositories, "O3 repositories");
    if (inputRepositories.length !== REQUIRED_REPOSITORY_COUNT) {
        throw new Error(`O3 requires exactly ${REQUIRED_REPOSITORY_COUNT} repositories.`);
    }
    const repositories = [...inputRepositories].sort((left, right) => compareStrings(left.id, right.id));
    const repositoryResults = [];
    const artifactBindings = [];
    const seenFamilies = new Set();
    const seenTaskIds = new Set();
    let scorerIdentity = null;
    for (const inputRepository of repositories) {
        const repositoryId = requireString(inputRepository.id, "O3 repository id");
        const repository = manifestAuthority.repositoriesById.get(repositoryId);
        if (!repository) throw new Error(`Repository '${repositoryId}' is not authorized by the manifest.`);
        requireEqual(inputRepository.family, repository.family, `Repository '${repositoryId}' family`);
        requireEqual(inputRepository.revision, repository.revision, `Repository '${repositoryId}' revision`);
        requireEqual(inputRepository.gitTree, repository.gitTree, `Repository '${repositoryId}' tree`);
        requireEqual(
            inputRepository.sourceTreeSha256,
            repository.sourceTreeSha256,
            `Repository '${repositoryId}' source tree digest`,
        );
        if (seenFamilies.has(repository.family)) throw new Error(`O3 duplicates family '${repository.family}'.`);
        seenFamilies.add(repository.family);
        const indexIdentity = validateIndexReceipt(
            inputRepository.indexReceiptBytes,
            inputRepository.indexReceiptFileSha256,
            repository,
            opening,
        );
        const expectedPositive = new Map([...repository.tasks]
            .filter(([taskId, task]) => task.suite === "positive" && taskId !== EXCLUDED_TASK.taskId));
        const expectedNegative = new Map([...repository.tasks]
            .filter(([, task]) => task.suite === "negative"));
        for (const taskId of [...expectedPositive.keys(), ...expectedNegative.keys()]) {
            if (seenTaskIds.has(taskId)) throw new Error(`O3 duplicates task '${taskId}'.`);
            seenTaskIds.add(taskId);
        }
        const positive = validateSuiteArtifacts(
            { name: "positive", ...inputRepository.positive },
            expectedPositive,
            repository,
            opening,
            indexIdentity,
            replayApi,
        );
        const negative = validateSuiteArtifacts(
            { name: "negative", ...inputRepository.negative },
            expectedNegative,
            repository,
            opening,
            indexIdentity,
            replayApi,
        );
        requireEqual(positive.capture.authority, negative.capture.authority, `${repositoryId} capture authority`);
        requireEqual(positive.scorer, negative.scorer, `${repositoryId} scorer identity`);
        if (scorerIdentity === null) scorerIdentity = positive.scorer;
        else requireEqual(positive.scorer, scorerIdentity, "O3 scorer identity");
        const result = evaluateRepository(repository, positive, negative);
        repositoryResults.push(result);
        artifactBindings.push({
            repositoryId,
            source: {
                revision: repository.revision,
                gitTree: repository.gitTree,
                sourceTreeSha256: repository.sourceTreeSha256,
            },
            indexReceiptFileSha256: inputRepository.indexReceiptFileSha256,
            publication: indexIdentity.publication,
            positive: {
                fileSha256: positive.fileSha256,
                captureSha256: positive.capture.sha256,
                baselineReplaySha256: positive.baseline.sha256,
                baselineUnboundSha256: positive.unboundBaselineSha256,
                d32ScoreSha256: positive.score.sha256,
                d32ReplaySha256: positive.replay.sha256,
                d32ReplayUnboundSha256: positive.unboundNeuralSha256,
            },
            negative: {
                fileSha256: negative.fileSha256,
                captureSha256: negative.capture.sha256,
                baselineReplaySha256: negative.baseline.sha256,
                baselineUnboundSha256: negative.unboundBaselineSha256,
                d32ScoreSha256: negative.score.sha256,
                d32ReplaySha256: negative.replay.sha256,
                d32ReplayUnboundSha256: negative.unboundNeuralSha256,
            },
        });
    }
    requireEqual(
        repositories.map(({ id }) => id),
        [...manifestAuthority.repositoriesById.keys()].sort(compareStrings),
        "O3 repository IDs",
    );
    const qualityOwnerTaskCount = repositoryResults.reduce((sum, result) => sum + result.qualityTaskCount, 0);
    const negativeTaskCount = repositoryResults.reduce((sum, result) => sum + result.negativeTaskCount, 0);
    const controlCounts = Object.fromEntries(Object.keys(CONTROL_TASKS).map((control) => [
        control,
        repositoryResults.reduce((sum, result) => sum + result.controlCounts[control], 0),
    ]));
    if (qualityOwnerTaskCount !== REQUIRED_QUALITY_OWNER_COUNT
        || negativeTaskCount !== REQUIRED_NEGATIVE_COUNT
        || Object.values(controlCounts).reduce((sum, count) => sum + count, 0) !== REQUIRED_OWNER_CONTROL_COUNT
        || Object.entries(CONTROL_TASKS).some(([control, taskId]) => {
            const owner = [...manifestAuthority.repositoriesById.values()]
                .find((repository) => repository.tasks.has(taskId));
            const task = owner?.tasks.get(taskId);
            return controlCounts[control] !== 1 || !task?.safetyControls.includes(control);
        })) {
        throw new Error("O3 task strata do not match the frozen 35+1 excluded+3+12 authority.");
    }
    const samples = buildBootstrapSamples(
        REQUIRED_REPOSITORY_COUNT,
        RESAMPLES,
        opening.authority.manifestCanonicalSealSha256,
    );
    const quality = Object.fromEntries(QUALITY_METRICS.map((metric) => [
        metric,
        aggregate(repositoryResults, (result) => ({
            baseline: result.quality.baseline[metric],
            contender: result.quality.contender[metric],
        }), samples),
    ]));
    const hardNegativeExposureAt3 = aggregate(
        repositoryResults,
        (result) => result.hardNegativeExposureAt3,
        samples,
    );
    const unacceptableOwnerExposureAt3 = aggregate(
        repositoryResults,
        (result) => result.unacceptableOwnerExposureAt3,
        samples,
    );
    const safetyFailures = repositoryResults.flatMap((result) => result.safetyFailures.map((failure) => ({
        repositoryId: result.repositoryId,
        ...failure,
    })));
    const practical = {
        ownerAt3: quality.ownerAt3.delta >= THRESHOLDS.ownerAt3,
        reciprocalRank: quality.reciprocalRank.delta >= THRESHOLDS.reciprocalRank,
        ownerAt1: quality.ownerAt1.delta >= THRESHOLDS.ownerAt1,
        ownerAt10: quality.ownerAt10.delta >= THRESHOLDS.ownerAt10,
        hardNegativeExposureAt3:
            hardNegativeExposureAt3.delta <= THRESHOLDS.hardNegativeExposureAt3,
        unacceptableOwnerExposureAt3:
            unacceptableOwnerExposureAt3.delta <= THRESHOLDS.unacceptableOwnerExposureAt3,
    };
    const confidence = {
        ownerAt3: quality.ownerAt3.interval.lower > 0,
        reciprocalRank: quality.reciprocalRank.interval.lower > 0,
        ownerAt1: quality.ownerAt1.interval.lower >= THRESHOLDS.ownerAt1,
        ownerAt10: quality.ownerAt10.interval.lower >= THRESHOLDS.ownerAt10,
        hardNegativeExposureAt3:
            hardNegativeExposureAt3.interval.upper <= THRESHOLDS.hardNegativeExposureAt3,
        unacceptableOwnerExposureAt3:
            unacceptableOwnerExposureAt3.interval.upper
                <= THRESHOLDS.unacceptableOwnerExposureAt3,
    };
    const safetyPasses = safetyFailures.length === 0;
    const practicalPasses = Object.values(practical).every(Boolean);
    const confidencePasses = Object.values(confidence).every(Boolean);
    const outcome = trackOOutcome(safetyPasses, practicalPasses, confidencePasses);
    const receipt = {
        version: 1,
        kind: "satori_lateon_track_o_o3_held_out_adjudication_receipt",
        stage: "O3",
        status: outcome === "offline_lateon_held_out_qualified_retained_disabled"
            ? "passed"
            : outcome === "offline_lateon_insufficient_held_out_evidence"
                ? "insufficient_evidence"
                : "rejected",
        authority: {
            openingRecordSha256: opening.sha256,
            o0AuthoritySha256: opening.authority.o0AuthoritySha256,
            o2ReceiptSha256: opening.authority.o2ReceiptSha256,
            manifestFileSha256: opening.authority.manifestFileSha256,
            manifestCanonicalSealSha256: opening.authority.manifestCanonicalSealSha256,
            candidate: opening.candidate,
            profile: opening.profile,
            scorer: scorerIdentity,
            evaluatorSha256: sha256Bytes(fs.readFileSync(SCRIPT_PATH)),
        },
        excludedEvidence: [EXCLUDED_TASK],
        artifactBindings,
        evidence: {
            repositoryCount: repositoryResults.length,
            independentFamilyCount: seenFamilies.size,
            qualityOwnerTaskCount,
            excludedTaskCount: 1,
            ownerSafetyControlCount: Object.values(controlCounts).reduce((sum, count) => sum + count, 0),
            negativeTaskCount,
            controlCounts,
            bootstrap: {
                resamples: RESAMPLES,
                seed: opening.authority.manifestCanonicalSealSha256,
                confidence: CONFIDENCE,
            },
        },
        metrics: { quality, hardNegativeExposureAt3, unacceptableOwnerExposureAt3 },
        safety: { failures: safetyFailures },
        gates: { practical, confidence, safety: safetyPasses },
        decision: { outcome, productPolicy: "B", activationAuthorized: false },
    };
    return { ...receipt, sha256: sha256Canonical(receipt) };
}

function readJsonArtifact(file, expectedFileSha256, label, selfDigested = true) {
    const bytes = fs.readFileSync(file);
    if (sha256Bytes(bytes) !== requireSha256(expectedFileSha256, `${label} file digest`)) {
        throw new Error(`${label} file digest is incompatible.`);
    }
    const value = requireRecord(JSON.parse(bytes.toString("utf8")), label);
    return selfDigested ? validateSelfDigest(value, label) : value;
}

function readArtifactBytes(file, expectedFileSha256, label) {
    const bytes = fs.readFileSync(file);
    if (sha256Bytes(bytes) !== requireSha256(expectedFileSha256, `${label} file digest`)) {
        throw new Error(`${label} file digest is incompatible.`);
    }
    return bytes;
}

function loadInputManifest(file, opening) {
    const manifest = validateSelfDigest(JSON.parse(fs.readFileSync(file, "utf8")), "O3 input manifest");
    if (manifest.version !== 1
        || manifest.kind !== "satori_lateon_track_o_o3_inputs"
        || manifest.openingRecordSha256 !== opening.sha256) {
        throw new Error("O3 input manifest identity is incompatible.");
    }
    const base = path.dirname(file);
    const loadBinding = (binding, label, selfDigested = true) => {
        const record = requireRecord(binding, `${label} binding`);
        return readJsonArtifact(
            path.resolve(base, requireString(record.file, `${label} file`)),
            record.fileSha256,
            label,
            selfDigested,
        );
    };
    return requireArray(manifest.repositories, "O3 input repositories").map((entry) => {
        const repository = requireRecord(entry, "O3 input repository");
        const indexBinding = requireRecord(repository.indexReceipt, `${repository.id} index receipt binding`);
        const indexReceiptBytes = readArtifactBytes(
            path.resolve(base, requireString(indexBinding.file, `${repository.id} index receipt file`)),
            indexBinding.fileSha256,
            `${repository.id} index receipt`,
        );
        const suite = (name) => {
            const record = requireRecord(repository[name], `${repository.id} ${name}`);
            const bindings = Object.fromEntries([
                "capture",
                "baselineReplay",
                "neuralScore",
                "neuralReplay",
            ].map((field) => [
                field,
                requireRecord(record[field], `${repository.id} ${name} ${field} binding`),
            ]));
            return {
                capture: loadBinding(bindings.capture, `${repository.id} ${name} capture`),
                baselineReplay: loadBinding(bindings.baselineReplay, `${repository.id} ${name} baseline replay`),
                neuralScore: loadBinding(bindings.neuralScore, `${repository.id} ${name} D32 score`),
                neuralReplay: loadBinding(bindings.neuralReplay, `${repository.id} ${name} D32 replay`),
                fileSha256: Object.fromEntries(Object.entries(bindings).map(([field, binding]) => [
                    field,
                    binding.fileSha256,
                ])),
            };
        };
        return {
            id: repository.id,
            family: repository.family,
            revision: repository.revision,
            gitTree: repository.gitTree,
            sourceTreeSha256: repository.sourceTreeSha256,
            indexReceiptBytes,
            indexReceiptFileSha256: repository.indexReceipt.fileSha256,
            positive: suite("positive"),
            negative: suite("negative"),
        };
    });
}

function usage() {
    return "Usage: node --import tsx scripts/satori-lateon-track-o-o3.mjs --opening <opening.json> --manifest <manifest.json> --inputs <inputs.json> --output <receipt.json>";
}

export function validateTrackOReceiptOutput(file) {
    const requested = path.resolve(requireString(file, "O3 receipt output"));
    if (fs.existsSync(requested)) throw new Error("O3 receipt output already exists.");
    const parent = fs.realpathSync(path.dirname(requested));
    const target = path.join(parent, path.basename(requested));
    const relativeToRepository = path.relative(REPOSITORY_ROOT, target);
    if (relativeToRepository === ""
        || (!relativeToRepository.startsWith("..") && !path.isAbsolute(relativeToRepository))) {
        throw new Error("O3 receipt output must be outside the clean source repository.");
    }
    return target;
}

export function main(argv = process.argv.slice(2)) {
    const values = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) {
            throw new Error("Arguments must use --name value pairs.");
        }
        values.set(argv[index].slice(2), argv[index + 1]);
    }
    for (const key of ["opening", "manifest", "inputs", "output"]) {
        if (!values.has(key)) throw new Error(`Missing --${key}.`);
    }
    const openingRecord = JSON.parse(fs.readFileSync(path.resolve(values.get("opening")), "utf8"));
    const opening = validateTrackOHeldOutOpeningRecord(openingRecord);
    const output = validateTrackOReceiptOutput(values.get("output"));
    const manifestBytes = fs.readFileSync(path.resolve(values.get("manifest")));
    if (sha256Bytes(manifestBytes) !== opening.authority.manifestFileSha256) {
        throw new Error("O3 manifest file bytes do not match the opening record.");
    }
    const repositories = loadInputManifest(path.resolve(values.get("inputs")), opening);
    const receipt = adjudicateTrackOHeldOut({ openingRecord, manifestBytes, repositories });
    fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
    });
    return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`satori-lateon-track-o-o3: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
        process.exitCode = 1;
    }
}
