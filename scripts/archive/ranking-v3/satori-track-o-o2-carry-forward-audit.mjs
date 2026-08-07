#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";

const BASELINE_REVISION = "07fba989b73d11c4f0446210a16cc1232713a2e4";
const D32_REPLAY_NAME = "projection-v2-d-l32.json";
const D32_SCORE_NAME = "projection-v2-d-l32.json";
const CONTENDER_ID = "projection-v2-d-l32";
const PROJECTION_ID = "search_rerank_document_v2";
const CANDIDATE_DEPTH = 32;
const EXPECTED_MODEL_REPOSITORY = "lightonai/LateOn-Code-edge";
const EXPECTED_MODEL_REVISION = "07ef20f406c86badca122464808f4cac2f6e4b25";
const EXPECTED_PROVIDER = "cpu";

const O2_OWNED_INPUTS = [
    "packages/mcp/src/core/search-rerank-document-v2.ts",
    "packages/mcp/src/core/search-rerank-policy.ts",
    "packages/mcp/src/core/search-execution.ts",
    "packages/mcp/src/core/search-result-finalization.ts",
    "packages/mcp/src/server/lateon-reranker.ts",
    "packages/mcp/src/server/lateon-reranker-protocol.ts",
    "packages/mcp/src/server/lateon-reranker-worker.ts",
    "packages/mcp/dist/server/lateon-reranker-worker.js",
    "packages/mcp/assets/lateon/runtime-profile-v2-d32.json",
    "scripts/satori-captured-rerank-projection-v2.mjs",
    "scripts/satori-lateon-track-o-o2.mjs",
    "scripts/satori-lateon-track-o-o2-fixture-worker.cjs",
    "scripts/satori-lateon-track-o-o2-evidence.mjs",
    "scripts/satori-search-candidate-replay.mjs",
];

const QUALIFIED_NON_GIT_INPUT_SHA256 = Object.freeze({
    "packages/mcp/dist/server/lateon-reranker-worker.js":
        "70d4ffca1ff2a7d9b2d114fe290e7b0a0982d0ad55463a6b907d974ffa6c7456",
});

function fail(message) {
    throw new Error(message);
}

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, label) {
    if (!isRecord(value)) fail(`${label} must be an object.`);
    return value;
}

function requireArray(value, label) {
    if (!Array.isArray(value)) fail(`${label} must be an array.`);
    return value;
}

function requireString(value, label) {
    if (typeof value !== "string" || value.length === 0) fail(`${label} must be a non-empty string.`);
    return value;
}

function requireFinite(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} must be finite.`);
    return value;
}

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (isRecord(value)) {
        return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
    }
    return value;
}

function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
}

function sha256Bytes(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha256Canonical(value) {
    return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}

function equalCanonical(left, right, label) {
    if (canonicalJson(left) !== canonicalJson(right)) fail(`${label} differs.`);
}

function loadJson(file, label) {
    const bytes = fs.readFileSync(file);
    let value;
    try {
        value = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
        fail(`${label} is not valid JSON: ${error.message}`);
    }
    return { value: requireRecord(value, label), rawSha256: sha256Bytes(bytes) };
}

function validateSelfDigest(value, label) {
    const supplied = requireString(value.sha256, `${label}.sha256`);
    const { sha256: _ignored, ...unsigned } = value;
    if (sha256Canonical(unsigned) !== supplied) fail(`${label} canonical digest mismatch.`);
    return supplied;
}

function taskMap(tasks, label) {
    const map = new Map();
    for (const task of requireArray(tasks, `${label}.tasks`)) {
        const record = requireRecord(task, `${label} task`);
        const taskId = requireString(record.taskId, `${label} taskId`);
        if (map.has(taskId)) fail(`${label} contains duplicate task '${taskId}'.`);
        map.set(taskId, record);
    }
    return map;
}

function sortedCanonical(value) {
    return [...value].sort((left, right) => {
        const a = canonicalJson(left);
        const b = canonicalJson(right);
        return a < b ? -1 : a > b ? 1 : 0;
    });
}

function finalAttempt(task, label) {
    const attempts = requireArray(task.mcpAttempts, `${label}.mcpAttempts`);
    if (attempts.length === 0) fail(`${label} has no MCP attempt.`);
    return requireRecord(attempts.at(-1), `${label}.finalAttempt`);
}

function capturedFilteredStage(task, label) {
    const trace = requireRecord(task.candidateTrace, `${label}.candidateTrace`);
    const stages = requireArray(trace.stages, `${label}.candidateTrace.stages`)
        .filter((stage) => stage.stage === "mcp_filtered");
    if (stages.length !== 1) fail(`${label} must contain exactly one mcp_filtered stage.`);
    return requireRecord(stages[0], `${label}.mcp_filtered`);
}

function candidateMembership(task, label) {
    if (task.route?.kind === "exact_registry") {
        return requireArray(task.rankedResults, `${label}.rankedResults`)
            .map((result, index) => {
                const record = requireRecord(result, `${label}.rankedResults[${index}]`);
                return canonicalJson([record.file, record.symbol ?? null]);
            })
            .sort();
    }
    if (task.candidateTrace) {
        return requireArray(capturedFilteredStage(task, label).candidates, `${label}.mcp_filtered.candidates`)
            .map((candidate, index) => requireString(
                requireRecord(candidate, `${label}.mcp_filtered.candidate[${index}]`).candidateId,
                `${label}.mcp_filtered.candidate[${index}].candidateId`,
            ))
            .sort();
    }
    return requireArray(finalAttempt(task, label).candidates, `${label}.candidates`)
        .map((candidate, index) => requireString(
            requireRecord(candidate, `${label}.candidate[${index}]`).candidateId,
            `${label}.candidate[${index}].candidateId`,
        ))
        .sort();
}

function eligibilityIdentity(task, label) {
    if (task.route?.kind === "exact_registry") return [];
    if (task.candidateTrace) {
        const trace = requireRecord(task.candidateTrace, `${label}.candidateTrace`);
        return sortedCanonical(requireArray(trace.removals, `${label}.candidateTrace.removals`)
            .filter((removal) => removal.afterStage === "mcp_filtered"));
    }
    return sortedCanonical(requireArray(finalAttempt(task, label).removed, `${label}.removed`));
}

function validateReplayTask({ captureTask, replayTask, scoreTask, label }) {
    if (!captureTask || !replayTask) fail(`${label} is missing from capture or D32 replay.`);
    if (replayTask.route?.kind === "exact_registry") {
        equalCanonical(replayTask.rankedResults, captureTask.rankedResults, `${label} exact registry results`);
        if (replayTask.invariants?.candidateMembershipIdentityEqual !== true
            || replayTask.invariants?.eligibilityIdentityEqual !== true
            || replayTask.invariants?.exactIdentifierIdentityEqual !== true) {
            fail(`${label} exact-control invariants are not all true.`);
        }
        if (scoreTask?.status !== undefined && scoreTask.status !== "") {
            if (scoreTask.status === "scored") fail(`${label} exact control unexpectedly has neural scores.`);
        }
        return { neuralEligible: false, exact: true };
    }

    const captureCandidates = candidateMembership(captureTask, `${label} capture`);
    const replayCandidates = candidateMembership(replayTask, `${label} replay`);
    equalCanonical(replayCandidates, captureCandidates, `${label} candidate membership`);
    equalCanonical(
        eligibilityIdentity(replayTask, `${label} replay`),
        eligibilityIdentity(captureTask, `${label} capture`),
        `${label} eligibility`,
    );
    if (replayTask.invariants?.candidateMembershipIdentityEqual !== true
        || replayTask.invariants?.eligibilityIdentityEqual !== true) {
        fail(`${label} candidate/eligibility invariants are not both true.`);
    }
    if (replayTask.route?.kind !== "fusion"
        || replayTask.policyAffected !== true
        || replayTask.neuralStatus !== "scored") {
        fail(`${label} is not a scored fusion replay.`);
    }

    const selected = requireArray(replayTask.selectedCandidateIds, `${label}.selectedCandidateIds`)
        .map((id, index) => requireString(id, `${label}.selectedCandidateIds[${index}]`));
    if (selected.length !== CANDIDATE_DEPTH || new Set(selected).size !== selected.length) {
        fail(`${label} does not have ${CANDIDATE_DEPTH} unique admitted candidates.`);
    }
    const captureCandidateSet = new Set(captureCandidates);
    if (selected.some((id) => !captureCandidateSet.has(id))) {
        fail(`${label} admits a candidate outside the frozen candidate set.`);
    }

    const ranking = requireArray(replayTask.ranking, `${label}.ranking`).map((entry, index) => {
        const record = requireRecord(entry, `${label}.ranking[${index}]`);
        return {
            candidateId: requireString(record.candidateId, `${label}.ranking[${index}].candidateId`),
            score: requireFinite(record.score, `${label}.ranking[${index}].score`),
        };
    });
    if (ranking.length !== CANDIDATE_DEPTH || new Set(ranking.map((entry) => entry.candidateId)).size !== ranking.length) {
        fail(`${label} does not have ${CANDIDATE_DEPTH} unique neural-ranked candidates.`);
    }
    equalCanonical(
        [...ranking].map((entry) => entry.candidateId).sort(),
        [...selected].sort(),
        `${label} admitted/ranked candidate set`,
    );

    if (!scoreTask || scoreTask.status !== "scored") fail(`${label} has no scored D32 task artifact.`);
    equalCanonical(scoreTask.ranking, replayTask.ranking, `${label} recorded neural order`);
    equalCanonical(scoreTask.selectedCandidateIds, replayTask.selectedCandidateIds, `${label} selected candidates`);
    if (scoreTask.candidateDepth !== CANDIDATE_DEPTH) fail(`${label} score depth is not ${CANDIDATE_DEPTH}.`);
    for (const [index, projection] of requireArray(scoreTask.projections, `${label}.projections`).entries()) {
        const record = requireRecord(projection, `${label}.projections[${index}]`);
        if (record.version !== PROJECTION_ID) fail(`${label} projection ${index} has the wrong version.`);
        requireString(record.sha256, `${label}.projections[${index}].sha256`);
    }
    if (scoreTask.projections.length !== CANDIDATE_DEPTH) {
        fail(`${label} projection count does not equal candidate depth.`);
    }

    validateGroupingAndPagination(replayTask, label);
    return { neuralEligible: true, exact: false };
}

function validateGroupingAndPagination(task, label) {
    const grouping = requireRecord(task.groupingDisclosure, `${label}.groupingDisclosure`);
    const grouped = requireArray(grouping.groupedResults, `${label}.groupedResults`);
    const disclosure = requireArray(grouping.disclosureOrder, `${label}.disclosureOrder`);
    const disclosed = requireArray(grouping.disclosedResults, `${label}.disclosedResults`);
    const normalizeGroup = (group, groupLabel) => {
        const record = requireRecord(group, groupLabel);
        return {
            rank: requireFinite(record.rank, `${groupLabel}.rank`),
            ownerId: requireString(record.ownerId, `${groupLabel}.ownerId`),
            candidateIds: [...requireArray(record.candidateIds, `${groupLabel}.candidateIds`)
                .map((id, index) => requireString(id, `${groupLabel}.candidateIds[${index}]`))],
            score: requireFinite(record.score, `${groupLabel}.score`),
        };
    };
    const normalizedDisclosure = disclosure.map((group, index) => normalizeGroup(group, `${label}.disclosure[${index}]`));
    const normalizedGrouped = grouped.map((group, index) => normalizeGroup(group, `${label}.grouped[${index}]`));
    const groupedOwnerIds = normalizedGrouped.map((group) => group.ownerId);
    if (new Set(groupedOwnerIds).size !== groupedOwnerIds.length) fail(`${label} grouped owners are not unique.`);
    const disclosureOwnerIds = normalizedDisclosure.map((group) => group.ownerId);
    if (new Set(disclosureOwnerIds).size !== disclosureOwnerIds.length) fail(`${label} disclosed owners are not unique.`);
    const groupedOwnerSet = new Set(groupedOwnerIds);
    if (disclosureOwnerIds.some((ownerId) => !groupedOwnerSet.has(ownerId))) {
        fail(`${label} disclosure contains an owner absent from grouped results.`);
    }
    equalCanonical(
        disclosed,
        normalizedDisclosure.slice(0, disclosed.length),
        `${label} initial disclosure prefix`,
    );

    const frozen = requireRecord(task.frozenPagination, `${label}.frozenPagination`);
    if (frozen.additionalRerankerCalls !== 0) fail(`${label} continuation made a reranker call.`);
    const pageSize = frozen.pageSize;
    if (!Number.isSafeInteger(pageSize) || pageSize <= 0) fail(`${label} page size is invalid.`);
    const orderedGroups = normalizedDisclosure.map((group) => ({
        rank: group.rank,
        ownerId: group.ownerId,
        candidateIds: [...group.candidateIds],
        score: group.score,
    }));
    const pages = [];
    for (let offset = 0; offset < orderedGroups.length; offset += pageSize) {
        pages.push({ offset, ownerIds: orderedGroups.slice(offset, offset + pageSize).map((group) => group.ownerId) });
    }
    const expectedFrozen = {
        pageSize,
        orderedGroupDigest: sha256Canonical(orderedGroups),
        initialDisclosureOwnerIds: disclosed.map((group) => requireString(group.ownerId, `${label}.disclosed ownerId`)),
        pages,
        additionalRerankerCalls: 0,
    };
    equalCanonical(frozen, expectedFrozen, `${label} frozen pagination`);
}

function git(repoRoot, args, label) {
    try {
        return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "buffer" });
    } catch (error) {
        fail(`${label} git command failed: ${error.message}`);
    }
}

function gitText(repoRoot, args, label) {
    return git(repoRoot, args, label).toString("utf8").trim();
}

function inputIdentity(repoRoot, relativePath) {
    const qualifiedNonGitSha256 = QUALIFIED_NON_GIT_INPUT_SHA256[relativePath];
    let oldBytes;
    let oldGitBlob = null;
    if (qualifiedNonGitSha256) {
        oldGitBlob = "not-tracked-at-qualified-revision";
    } else {
        oldBytes = git(repoRoot, ["show", `${BASELINE_REVISION}:${relativePath}`], `old ${relativePath}`);
        oldGitBlob = gitText(
            repoRoot,
            ["rev-parse", `${BASELINE_REVISION}:${relativePath}`],
            `old blob ${relativePath}`,
        );
    }
    const currentPath = path.join(repoRoot, relativePath);
    const currentBytes = fs.readFileSync(currentPath);
    const oldSha256 = qualifiedNonGitSha256 ?? sha256Bytes(oldBytes);
    const currentSha256 = sha256Bytes(currentBytes);
    const currentGitBlob = gitText(repoRoot, ["hash-object", relativePath], `current blob ${relativePath}`);
    return {
        path: relativePath,
        oldGitBlob,
        oldSha256,
        currentGitBlob,
        currentSha256,
        unchanged: oldSha256 === currentSha256
            && (Boolean(qualifiedNonGitSha256) || oldGitBlob === currentGitBlob),
    };
}

function parseArgs(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg.startsWith("--")) fail(`Unexpected argument '${arg}'.`);
        const key = arg.slice(2);
        const value = argv[index + 1];
        if (!value || value.startsWith("--")) fail(`Missing value for --${key}.`);
        options[key] = value;
        index += 1;
    }
    for (const key of ["repo-root", "capture-authority", "replay-root", "score-root", "o2-receipt", "output"]) {
        if (!options[key]) fail(`Missing --${key}.`);
    }
    return options;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const repoRoot = path.resolve(options["repo-root"]);
    const captureAuthorityPath = path.resolve(options["capture-authority"]);
    const replayRoot = path.resolve(options["replay-root"]);
    const scoreRoot = path.resolve(options["score-root"]);
    const o2ReceiptPath = path.resolve(options["o2-receipt"]);
    const outputPath = path.resolve(options.output);
    const authorityFile = loadJson(captureAuthorityPath, "capture authority");
    const authorityCanonicalSha256 = validateSelfDigest(authorityFile.value, "capture authority");
    if (authorityCanonicalSha256 !== "c00db4b039626b7152c1a4a61927053a68edec130cf8d9d21897c3e86ccc26ee") {
        fail("capture authority canonical digest is not the sealed Track L authority.");
    }
    if (authorityFile.rawSha256 !== "0da2dec2e05874c08158a6c75bb46f63bf4fe4ff667c8a085fd4fb5b2229b5f8") {
        fail("capture authority file digest is not the sealed Track L authority.");
    }
    const o2ReceiptFile = loadJson(o2ReceiptPath, "D32-v2 O2 receipt");
    const o2ReceiptCanonicalSha256 = validateSelfDigest(o2ReceiptFile.value, "D32-v2 O2 receipt");
    if (o2ReceiptCanonicalSha256 !== "de3c693c2461d11ede5f0ffa8ea410e4fbabe0053d87b43e52707b2f4d92fde4"
        || o2ReceiptFile.rawSha256 !== "8eb27428c07a764fe84f700b847f6032c1471cacf98acffd4072ff6e953f38f4") {
        fail("D32-v2 O2 receipt identity does not match the passing authority.");
    }
    const o2Receipt = o2ReceiptFile.value;
    if (o2Receipt.status !== "passed"
        || o2Receipt.sourceRevision !== BASELINE_REVISION
        || o2Receipt.sourceTree !== "0d54897bd7b3e6fb8338c1b83d80f165b40e9771"
        || o2Receipt.candidate?.id !== CONTENDER_ID
        || o2Receipt.candidate?.candidateDepth !== CANDIDATE_DEPTH
        || o2Receipt.candidate?.projection?.id !== PROJECTION_ID) {
        fail("D32-v2 O2 receipt is not the expected passing authority.");
    }

    const repositories = requireArray(authorityFile.value.repositories, "capture authority.repositories");
    if (repositories.length !== 6) fail("Expected six tuning repositories.");
    const counts = {
        positiveReplayFiles: 0,
        negativeReplayFiles: 0,
        positiveControlRecords: 0,
        decisionBearingQualityTasks: 0,
        exactRegistryQualityTasks: 0,
        additionalSafetyControls: 0,
        neuralEligibleQualityTasks: 0,
        negativeTasks: 0,
    };
    const inputs = {
        captureAuthority: { path: captureAuthorityPath, rawSha256: authorityFile.rawSha256, canonicalSha256: authorityCanonicalSha256 },
        o2Receipt: { path: o2ReceiptPath, rawSha256: o2ReceiptFile.rawSha256, canonicalSha256: o2ReceiptCanonicalSha256 },
        repositories: [],
    };
    const sharedScoreIdentity = { value: null };

    for (const repository of repositories) {
        const repoId = requireString(repository.id, "repository.id");
        const repoRootPath = path.join(replayRoot, repoId);
        const scoreFilePath = path.join(scoreRoot, repoId, D32_SCORE_NAME);
        const scoreFile = loadJson(scoreFilePath, `${repoId} D32 score`);
        const scoreCanonicalSha256 = validateSelfDigest(scoreFile.value, `${repoId} D32 score`);
        const score = scoreFile.value;
        if (score.contenderId !== CONTENDER_ID || score.candidateDepth !== CANDIDATE_DEPTH) {
            fail(`${repoId} D32 score identity is wrong.`);
        }
        const scoreIdentity = {
            contenderId: score.contenderId,
            candidateDepth: score.candidateDepth,
            projectionVersion: score.contract?.projectionVersion,
            modelRepository: score.contract?.checkpoint?.repository,
            modelRevision: score.contract?.checkpoint?.revision,
            executionProvider: score.contract?.resourceProfile?.executionProvider,
            onnxruntimeNodeVersion: score.modelRuntime?.onnxruntimeNode?.version,
            transformersJsVersion: score.modelRuntime?.transformersJs?.version,
            projectionOwnerSha256: score.tooling?.artifacts?.find((artifact) => artifact.role === "rerank_document_v2_owner")?.sha256,
        };
        if (scoreIdentity.projectionVersion !== PROJECTION_ID
            || scoreIdentity.modelRepository !== EXPECTED_MODEL_REPOSITORY
            || scoreIdentity.modelRevision !== EXPECTED_MODEL_REVISION
            || scoreIdentity.executionProvider !== EXPECTED_PROVIDER
            || !scoreIdentity.onnxruntimeNodeVersion
            || !scoreIdentity.transformersJsVersion
            || scoreIdentity.projectionOwnerSha256 !== o2Receipt.candidate.projection.sha256) {
            fail(`${repoId} D32 provider or projection identity is not authoritative.`);
        }
        if (sharedScoreIdentity.value === null) sharedScoreIdentity.value = scoreIdentity;
        else equalCanonical(scoreIdentity, sharedScoreIdentity.value, `${repoId} shared score identity`);

        const positiveReplayPath = path.join(repoRootPath, `positive-${D32_REPLAY_NAME}`);
        const negativeReplayPath = path.join(repoRootPath, `negative-${D32_REPLAY_NAME}`);
        const positiveCapturePath = path.join(path.dirname(captureAuthorityPath), repoId, "positive-capture.json");
        const negativeCapturePath = path.join(path.dirname(captureAuthorityPath), repoId, "negative-capture.json");
        const positiveBaselinePath = path.join(path.dirname(captureAuthorityPath), repoId, "positive-baseline-replay.json");
        const negativeBaselinePath = path.join(path.dirname(captureAuthorityPath), repoId, "negative-baseline-replay.json");
        const positiveReplayFile = loadJson(positiveReplayPath, `${repoId} positive D32 replay`);
        const negativeReplayFile = loadJson(negativeReplayPath, `${repoId} negative D32 replay`);
        const positiveReplayCanonicalSha256 = validateSelfDigest(positiveReplayFile.value, `${repoId} positive D32 replay`);
        const negativeReplayCanonicalSha256 = validateSelfDigest(negativeReplayFile.value, `${repoId} negative D32 replay`);
        const positiveCaptureFile = loadJson(positiveCapturePath, `${repoId} positive capture`);
        const negativeCaptureFile = loadJson(negativeCapturePath, `${repoId} negative capture`);
        const positiveCaptureCanonicalSha256 = validateSelfDigest(positiveCaptureFile.value, `${repoId} positive capture`);
        const negativeCaptureCanonicalSha256 = validateSelfDigest(negativeCaptureFile.value, `${repoId} negative capture`);
        const positiveBaselineFile = loadJson(positiveBaselinePath, `${repoId} positive baseline replay`);
        const negativeBaselineFile = loadJson(negativeBaselinePath, `${repoId} negative baseline replay`);
        const positiveBaselineCanonicalSha256 = validateSelfDigest(positiveBaselineFile.value, `${repoId} positive baseline replay`);
        const negativeBaselineCanonicalSha256 = validateSelfDigest(negativeBaselineFile.value, `${repoId} negative baseline replay`);

        if (positiveReplayFile.value.sourceNeuralScoreSha256 !== scoreCanonicalSha256
            || negativeReplayFile.value.sourceNeuralScoreSha256 !== scoreCanonicalSha256) {
            fail(`${repoId} D32 replay does not bind the rebound score artifact.`);
        }
        if (positiveReplayFile.value.sourceCaptureSha256 !== positiveCaptureCanonicalSha256
            || negativeReplayFile.value.sourceCaptureSha256 !== negativeCaptureCanonicalSha256
            || positiveReplayFile.value.baselineReplaySha256 !== positiveBaselineCanonicalSha256
            || negativeReplayFile.value.baselineReplaySha256 !== negativeBaselineCanonicalSha256) {
            fail(`${repoId} D32 replay does not bind its capture and baseline artifacts.`);
        }

        const authorityPositive = taskMap(repository.tasks?.positive, `${repoId} authority positive`);
        const authorityNegative = taskMap(repository.tasks?.negative, `${repoId} authority negative`);
        const positiveCaptureTasks = taskMap(positiveCaptureFile.value.captures, `${repoId} positive capture`);
        const negativeCaptureTasks = taskMap(negativeCaptureFile.value.captures, `${repoId} negative capture`);
        const positiveReplayTasks = taskMap(positiveReplayFile.value.tasks, `${repoId} positive D32 replay`);
        const negativeReplayTasks = taskMap(negativeReplayFile.value.tasks, `${repoId} negative D32 replay`);
        equalCanonical([...authorityPositive.keys()].sort(), [...positiveReplayTasks.keys()].sort(), `${repoId} positive authority task set`);
        equalCanonical([...authorityNegative.keys()].sort(), [...negativeReplayTasks.keys()].sort(), `${repoId} negative authority task set`);

        const scoreTasks = taskMap(score.tasks, `${repoId} D32 score`);
        for (const [taskId, task] of positiveReplayTasks) {
            const authorityTask = authorityPositive.get(taskId);
            if (!authorityTask) fail(`${repoId} positive replay task '${taskId}' is not in authority.`);
            const result = validateReplayTask({
                captureTask: positiveCaptureTasks.get(taskId),
                replayTask: task,
                scoreTask: scoreTasks.get(taskId),
                label: `${repoId} positive '${taskId}'`,
            });
            counts.positiveControlRecords += 1;
            if (Array.isArray(authorityTask.safetyControls) && authorityTask.safetyControls.length > 0) {
                counts.additionalSafetyControls += 1;
                if (task.route?.kind !== "exact_registry") fail(`${repoId} safety control '${taskId}' is not exact-registry.`);
            } else {
                counts.decisionBearingQualityTasks += 1;
                if (result.exact) counts.exactRegistryQualityTasks += 1;
                if (result.neuralEligible) counts.neuralEligibleQualityTasks += 1;
            }
        }
        for (const [taskId, task] of negativeReplayTasks) {
            if (!authorityNegative.has(taskId)) fail(`${repoId} negative replay task '${taskId}' is not in authority.`);
            const result = validateReplayTask({
                captureTask: negativeCaptureTasks.get(taskId),
                replayTask: task,
                scoreTask: scoreTasks.get(taskId),
                label: `${repoId} negative '${taskId}'`,
            });
            if (!result.neuralEligible) fail(`${repoId} negative task '${taskId}' is not neural-eligible.`);
            counts.negativeTasks += 1;
        }
        inputs.repositories.push({
            id: repoId,
            positiveReplay: {
                path: positiveReplayPath,
                rawSha256: positiveReplayFile.rawSha256,
                canonicalSha256: positiveReplayCanonicalSha256,
            },
            negativeReplay: {
                path: negativeReplayPath,
                rawSha256: negativeReplayFile.rawSha256,
                canonicalSha256: negativeReplayCanonicalSha256,
            },
            positiveCapture: { path: positiveCapturePath, rawSha256: positiveCaptureFile.rawSha256, canonicalSha256: positiveCaptureCanonicalSha256 },
            negativeCapture: { path: negativeCapturePath, rawSha256: negativeCaptureFile.rawSha256, canonicalSha256: negativeCaptureCanonicalSha256 },
            positiveBaseline: { path: positiveBaselinePath, rawSha256: positiveBaselineFile.rawSha256, canonicalSha256: positiveBaselineCanonicalSha256 },
            negativeBaseline: { path: negativeBaselinePath, rawSha256: negativeBaselineFile.rawSha256, canonicalSha256: negativeBaselineCanonicalSha256 },
            score: { path: scoreFilePath, rawSha256: scoreFile.rawSha256, canonicalSha256: scoreCanonicalSha256 },
        });
    }

    if (counts.positiveReplayFiles !== 0) fail("internal positive replay file counter invariant.");
    counts.positiveReplayFiles = repositories.length;
    counts.negativeReplayFiles = repositories.length;
    if (counts.positiveControlRecords !== 38
        || counts.decisionBearingQualityTasks !== 36
        || counts.exactRegistryQualityTasks !== 2
        || counts.additionalSafetyControls !== 2
        || counts.neuralEligibleQualityTasks !== 34
        || counts.negativeTasks !== 12) {
        fail(`Unexpected replay counts: ${canonicalJson(counts)}`);
    }
    const currentRevision = gitText(repoRoot, ["rev-parse", "HEAD"], "current revision");
    const currentTree = gitText(repoRoot, ["rev-parse", "HEAD^{tree}"], "current tree");
    inputs.o2OwnedInputs = O2_OWNED_INPUTS.map((relativePath) => inputIdentity(repoRoot, relativePath));
    if (inputs.o2OwnedInputs.some((identity) => identity.unchanged !== true)) {
        fail("An O2-owned source input differs from the qualified revision.");
    }

    const unsignedAudit = {
        schemaVersion: "satori_track_o_o2_carry_forward_audit_v1",
        verifier: {
            path: "scripts/satori-track-o-o2-carry-forward-audit.mjs",
            baselineRevision: BASELINE_REVISION,
            currentRevision,
            currentTree,
        },
        authority: {
            captureManifestSeal: authorityFile.value.manifestSeal,
            o2SourceRevision: o2Receipt.sourceRevision,
            o2SourceTree: o2Receipt.sourceTree,
            contenderId: CONTENDER_ID,
            projectionId: PROJECTION_ID,
            candidateDepth: CANDIDATE_DEPTH,
            provider: EXPECTED_PROVIDER,
        },
        counts,
        scoreIdentity: sharedScoreIdentity.value,
        inputs,
        results: {
            selfDigests: true,
            candidateMembershipIdentity: true,
            eligibilityIdentity: true,
            projectionIdentity: true,
            providerIdentity: true,
            recordedNeuralOrder: true,
            groupingDisclosureOrder: true,
            paginationOrder: true,
            continuationRerankerCalls: 0,
            modelInference: false,
            heldOutAccess: false,
        },
    };
    const audit = { ...unsignedAudit, sha256: sha256Canonical(unsignedAudit) };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    const outputBytes = fs.readFileSync(outputPath);
    process.stdout.write(`${JSON.stringify({
        status: "passed",
        output: outputPath,
        fileSha256: sha256Bytes(outputBytes),
        canonicalResultSha256: audit.sha256,
        counts,
        currentRevision,
        currentTree,
    })}\n`);
}

try {
    main();
} catch (error) {
    process.stderr.write(`carry-forward audit failed: ${error.message}\n`);
    process.exitCode = 1;
}
