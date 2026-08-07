#!/usr/bin/env -S node --import tsx
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
    LateOnReranker,
    loadLateOnRuntimeProfile,
} from "../packages/mcp/src/server/lateon-reranker.ts";
import {
    replayBaselineCandidateCapture,
    replayNeuralCandidateCapture,
} from "./satori-search-candidate-replay.mjs";
import { verifyCapturePair } from "./satori-search-ranking-r3-score.mjs";
import { buildCapturedRerankProjectionV2 } from "./satori-captured-rerank-projection-v2.mjs";
import {
    TRACK_O_CANDIDATE_ID,
    TRACK_O_O0_AUTHORITY_SHA256,
    TRACK_O_PROFILE_ID,
    validateTrackOHeldOutOpeningRecord,
} from "./satori-track-o-heldout-opening.mjs";
import { canonicalJson } from "./satori-useful-context.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const RUNTIME_PATH = path.join(REPOSITORY_ROOT, "packages/mcp/src/server/lateon-reranker.ts");
const WORKER_PATH = path.join(
    REPOSITORY_ROOT,
    "packages/mcp/dist/server/lateon-reranker-worker.js",
);
const PROJECTION_PATH = path.join(
    REPOSITORY_ROOT,
    "packages/mcp/src/core/search-rerank-document-v2.ts",
);
const CAPTURED_PROJECTION_PATH = fileURLToPath(
    new URL("./satori-captured-rerank-projection-v2.mjs", import.meta.url),
);
const SCORE_SCHEMA = "satori_search_ranking_track_l_scores_v2";
const SCORER_ID = "satori_lateon_track_o_o3_d32_scorer_v1";
const PROJECTION_VERSION = "search_rerank_document_v2";
const PROTOCOL_EXCLUSIONS = Object.freeze([Object.freeze({
    taskId: "promptready-primary-action",
    reason: "pre_open_held_out_payload_exposure",
    decisionBearing: false,
    scored: false,
})]);
const O0_PROTOCOL_EXCLUSION_REASON =
    "pre_open_read_only_lane_access_before_o2_no_edits_or_results";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;

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
    const digest = requireString(value, label).toLowerCase();
    if (!SHA256_PATTERN.test(digest)) throw new Error(`${label} must be a SHA-256 digest.`);
    return digest;
}

function requireRevision(value, label) {
    const revision = requireString(value, label).toLowerCase();
    if (!REVISION_PATTERN.test(revision)) throw new Error(`${label} must be a git revision.`);
    return revision;
}

function sha256Bytes(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Canonical(value) {
    return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}

function sha256File(file) {
    return sha256Bytes(fs.readFileSync(file));
}

function requireCanonicalEqual(actual, expected, label) {
    if (canonicalJson(actual) !== canonicalJson(expected)) {
        throw new Error(`${label} does not match the frozen Track O authority.`);
    }
}

function validateSigned(value, label) {
    const record = requireRecord(value, label);
    const supplied = requireSha256(record.sha256, `${label}.sha256`);
    const { sha256: _ignored, ...unsigned } = record;
    if (sha256Canonical(unsigned) !== supplied) {
        throw new Error(`${label} digest does not match its contents.`);
    }
    return record;
}

function bindOpening(value, opening) {
    const { sha256: _ignored, ...unsigned } = requireRecord(value, "Track O held-out artifact");
    const bound = { ...unsigned, heldOutOpeningSha256: opening.sha256 };
    return { ...bound, sha256: sha256Canonical(bound) };
}

function normalizedCandidate(authority) {
    const candidate = requireRecord(authority.candidate, "O0 candidate");
    return {
        id: requireString(candidate.id, "O0 candidate ID"),
        candidateDepth: candidate.candidateDepth,
        projection: {
            id: requireString(candidate.projection?.id, "O0 projection ID"),
            sha256: requireSha256(candidate.projection?.sha256, "O0 projection digest"),
        },
        model: {
            repository: requireString(candidate.model?.repository, "O0 model repository"),
            revision: requireRevision(candidate.model?.revision, "O0 model revision"),
        },
        artifacts: requireArray(candidate.artifacts, "O0 model artifacts").map((artifact, index) => ({
            role: requireString(artifact?.role, `O0 model artifact ${index + 1} role`),
            path: requireString(artifact?.path, `O0 model artifact ${index + 1} path`),
            sha256: requireSha256(artifact?.sha256, `O0 model artifact ${index + 1} digest`),
        })),
    };
}

function profileBinding(profile, profileFileSha256) {
    const effectiveOperationalBounds = {
        maximumActiveReranks: profile.operationalBounds?.maximumActiveReranks,
        maximumQueuedReranks: profile.operationalBounds?.maximumQueuedReranks,
        maximumQueueWaitMilliseconds: profile.operationalBounds?.maximumQueueWaitMilliseconds,
        maximumScoreMilliseconds: profile.operationalBounds?.maximumScoreMilliseconds,
        maximumRerankerStageMilliseconds:
            profile.operationalBounds?.maximumRerankerStageMilliseconds,
    };
    return {
        id: requireString(profile.profileId, "Track O profile ID"),
        assetFileSha256: requireSha256(profileFileSha256, "Track O profile file digest"),
        assetCanonicalSha256: sha256Canonical(profile),
        effectiveIdentitySha256: sha256Canonical({
            profile,
            effectiveOperationalBounds,
            intraOpThreads: profile.inference?.profileIntraOpThreads,
        }),
    };
}

function validateRuntimeProfile(profile, candidate, fileSha256) {
    const record = requireRecord(profile, "Track O runtime profile");
    if (record.schemaVersion !== "satori_lateon_runtime_profile_v2"
        || record.profileId !== TRACK_O_PROFILE_ID
        || record.qualificationStatus !== "disabled_track_o_candidate"
        || record.inference?.candidateDepth !== 32) {
        throw new Error("Runtime profile is not the frozen Track O D32 profile.");
    }
    requireCanonicalEqual({
        repository: record.identity?.repository,
        revision: record.identity?.revision,
        projectionVersion: record.identity?.projectionVersion,
        projectionSha256: record.identity?.projectionSha256,
    }, {
        repository: candidate.model.repository,
        revision: candidate.model.revision,
        projectionVersion: candidate.projection.id,
        projectionSha256: candidate.projection.sha256,
    }, "Runtime profile model and projection identity");
    requireCanonicalEqual(record.artifacts, candidate.artifacts.map(({ path: artifactPath, sha256 }) => ({
        path: artifactPath,
        sha256,
    })), "Runtime profile model artifacts");
    return profileBinding(record, fileSha256);
}

export function validateTrackOScoringAuthority(input, options = {}) {
    const opening = validateTrackOHeldOutOpeningRecord(
        input.openingRecord,
        options.openingValidation,
    );
    const o0AuthorityFileSha256 = requireSha256(
        input.o0AuthorityFileSha256,
        "O0 authority file digest",
    );
    if (o0AuthorityFileSha256 !== opening.authority.o0AuthoritySha256
        || o0AuthorityFileSha256 !== (options.expectedO0AuthoritySha256
            ?? TRACK_O_O0_AUTHORITY_SHA256)) {
        throw new Error("O0 authority file does not match the exact opening authority.");
    }
    const authority = requireRecord(input.o0Authority, "O0 authority");
    if (authority.version !== 1
        || authority.kind !== "satori_lateon_track_o_authority"
        || authority.phase !== "O0"
        || authority.status !== "prospective_authority_outputs_unopened") {
        throw new Error("O0 authority identity is invalid.");
    }
    const candidate = normalizedCandidate(authority);
    if (candidate.id !== TRACK_O_CANDIDATE_ID
        || candidate.candidateDepth !== 32
        || candidate.projection.id !== PROJECTION_VERSION) {
        throw new Error("O0 authority does not authorize the sole Track O D32 candidate.");
    }
    requireCanonicalEqual(candidate, opening.candidate, "Opening D32 candidate");
    requireCanonicalEqual(authority.heldOutDecision?.protocolExclusions, [{
        taskId: PROTOCOL_EXCLUSIONS[0].taskId,
        reason: O0_PROTOCOL_EXCLUSION_REASON,
    }], "O0 protocol exclusion");
    requireCanonicalEqual(authority.heldOutDecision?.preOpenAccessIncidents, [
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
    ], "O0 pre-open access incidents");
    if (authority.heldOutDecision?.decisionBearingQualityOwnerTasks !== 35) {
        throw new Error("O0 decision-bearing held-out task count is invalid.");
    }
    const manifest = requireRecord(authority.heldOutDecision?.manifest, "O0 held-out manifest");
    if (manifest.fileSha256 !== opening.authority.manifestFileSha256
        || manifest.canonicalSealSha256
            !== opening.authority.manifestCanonicalSealSha256) {
        throw new Error("O0 manifest identity does not match the exact opening.");
    }
    const profile = validateRuntimeProfile(
        input.runtimeProfile,
        candidate,
        input.runtimeProfileFileSha256,
    );
    requireCanonicalEqual(profile, opening.profile, "Opening effective D32 profile");

    const receipt = validateSigned(input.o2Receipt, "O2 receipt");
    if (receipt.version !== 1
        || receipt.kind !== "satori_lateon_track_o_operational_qualification_receipt"
        || receipt.stage !== "O2"
        || receipt.status !== "passed"
        || receipt.operationalQualificationResult !== "passed"
        || receipt.sha256 !== opening.authority.o2ReceiptSha256) {
        throw new Error("O2 receipt is not the passing receipt authorized by the opening.");
    }
    requireCanonicalEqual(receipt.authority, {
        o0AuthoritySha256: o0AuthorityFileSha256,
        manifestFileSha256: opening.authority.manifestFileSha256,
        manifestCanonicalSealSha256: opening.authority.manifestCanonicalSealSha256,
    }, "O2 authority binding");
    requireCanonicalEqual(receipt.profile, profile, "O2 effective D32 profile");
    requireCanonicalEqual(receipt.candidate, candidate, "O2 D32 candidate");
    return { opening, authority, receipt, profile, candidate };
}

function validateModelArtifacts(modelRoot, artifacts) {
    const root = fs.realpathSync(modelRoot);
    for (const artifact of artifacts) {
        const file = path.resolve(root, artifact.path);
        const relative = path.relative(root, file);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
            throw new Error(`Unsafe Track O model artifact path '${artifact.path}'.`);
        }
        if (sha256File(file) !== artifact.sha256) {
            throw new Error(`Track O model artifact digest mismatch: ${artifact.path}.`);
        }
    }
    return root;
}

function resolveSourceIdentity(sourceRoot) {
    const absoluteRoot = fs.realpathSync(sourceRoot);
    const git = (arguments_) => execFileSync("git", ["-C", absoluteRoot, ...arguments_], {
        encoding: "utf8",
    }).trim();
    const revision = requireRevision(git(["rev-parse", "HEAD"]), "Source revision");
    if (git(["status", "--porcelain=v1"]).length !== 0) {
        throw new Error("Pinned held-out source worktree must be clean.");
    }
    return {
        absoluteRoot,
        revision,
        tree: requireRevision(git(["rev-parse", "HEAD^{tree}"]), "Source tree"),
        sourceTreeSha256: sha256Bytes(execFileSync(
            "git",
            ["-C", absoluteRoot, "ls-tree", "-r", "--full-tree", revision],
        )),
    };
}

function loadCapture(file) {
    const bytes = fs.readFileSync(file);
    return {
        capture: JSON.parse(bytes.toString("utf8")),
        fileName: path.basename(file),
        fileSha256: sha256Bytes(bytes),
    };
}

function validateCapture(source, opening, role) {
    const capture = validateSigned(source.capture, `${role} capture`);
    if (capture.version !== 2
        || capture.kind !== "satori_search_candidate_capture"
        || capture.taskSuiteVersion !== 2
        || capture.policyId !== "baseline"
        || capture.heldOutOpeningSha256 !== opening.sha256) {
        throw new Error(`${role} capture is not bound to the exact Track O opening.`);
    }
    const tasks = requireArray(capture.captures, `${role} capture tasks`);
    if (tasks.length === 0) throw new Error(`${role} capture must contain tasks.`);
    const taskIds = new Set();
    for (const task of tasks) {
        const taskId = requireString(task?.taskId, `${role} capture task ID`);
        if (taskIds.has(taskId)) throw new Error(`${role} capture duplicates task '${taskId}'.`);
        taskIds.add(taskId);
        if (taskId === PROTOCOL_EXCLUSIONS[0].taskId) {
            throw new Error(`Protocol-excluded task '${taskId}' must not reach Track O scoring.`);
        }
        if (task.split !== "held_out") {
            throw new Error(`${role} capture task '${taskId}' is not held-out.`);
        }
        const isNegative = task.queryClass === "negative_exposure";
        if ((role === "positive" && isNegative) || (role === "negative" && !isNegative)) {
            throw new Error(`${role} capture task '${taskId}' has the wrong held-out stratum.`);
        }
    }
    requireRecord(capture.authority?.armPublication, `${role} capture publication authority`);
    return { ...source, capture, tasks };
}

function validateProductionRuntime(profileFile, expectedProfile) {
    const profile = loadLateOnRuntimeProfile(profileFile);
    requireCanonicalEqual(profile, expectedProfile, "Production D32 runtime profile");
    return fs.realpathSync(WORKER_PATH);
}

function createProductionRuntime({ modelDirectory, profileFile, workerPath }) {
    return new LateOnReranker({
        modelDirectory,
        profileId: profileFile,
        workerPath,
    });
}

function completeRanking(result, selectedCandidateIds, taskId) {
    if (!Array.isArray(result) || result.length !== selectedCandidateIds.length) {
        throw new Error(`Task '${taskId}' returned an incomplete neural order.`);
    }
    const indexes = new Set();
    return result.map(({ index, relevanceScore }) => {
        if (!Number.isSafeInteger(index)
            || index < 0
            || index >= selectedCandidateIds.length
            || indexes.has(index)
            || !Number.isFinite(relevanceScore)) {
            throw new Error(`Task '${taskId}' returned an invalid neural order.`);
        }
        indexes.add(index);
        return { candidateId: selectedCandidateIds[index], score: relevanceScore };
    });
}

async function scoreCapturedTasks({
    taskCaptures,
    candidateDepth,
    sourceRoot,
    runtime,
    buildProjection = buildCapturedRerankProjectionV2,
}) {
    const tasks = [];
    for (const taskCapture of taskCaptures) {
        if (taskCapture.readiness?.route === "exact_registry") {
            tasks.push({
                taskId: taskCapture.taskId,
                split: taskCapture.split,
                queryClass: taskCapture.queryClass,
                ...(taskCapture.safetyControls ? {
                    safetyControls: [...taskCapture.safetyControls],
                } : {}),
                route: "exact_registry",
                policyAffected: false,
                selectedCandidateIds: [],
                ranking: [],
                projections: [],
                elapsedMilliseconds: 0,
            });
            continue;
        }
        const projection = await buildProjection({
            taskCapture,
            candidateDepth,
            sourceRoot,
        });
        const started = performance.now();
        const result = await runtime.rerank(projection.query, projection.documents, {
            identities: projection.selectedCandidateIds,
        });
        const elapsedMilliseconds = performance.now() - started;
        const ranking = completeRanking(result, projection.selectedCandidateIds, taskCapture.taskId);
        tasks.push({
            taskId: taskCapture.taskId,
            split: taskCapture.split,
            queryClass: taskCapture.queryClass,
            ...(taskCapture.safetyControls ? {
                safetyControls: [...taskCapture.safetyControls],
            } : {}),
            route: "fusion",
            status: "scored",
            policyAffected: true,
            fallbackBaselineRequired: false,
            candidateDepth,
            familyCount: projection.familyCount,
            supplementalCandidateCount: projection.supplementalCandidateCount,
            candidatePoolCount: projection.candidatePoolCount,
            selectedCandidateIds: projection.selectedCandidateIds,
            ranking,
            diagnosticRanking: ranking,
            projections: projection.projections,
            elapsedMilliseconds,
        });
    }
    return tasks;
}

function scorerIdentity() {
    return {
        id: SCORER_ID,
        sourceSha256: sha256File(SCRIPT_PATH),
        runtimeSha256: sha256File(RUNTIME_PATH),
        workerSha256: sha256File(WORKER_PATH),
        projectionSha256: sha256File(PROJECTION_PATH),
        capturedProjectionAdapterSha256: sha256File(CAPTURED_PROJECTION_PATH),
    };
}

function scoreResources(tasks) {
    return {
        processPeakRssBytes: process.resourceUsage().maxRSS * 1024,
        retainedRssBytes: process.memoryUsage().rss,
        taskElapsedMilliseconds: tasks.map(({ taskId, elapsedMilliseconds }) => ({
            taskId,
            elapsedMilliseconds,
        })),
    };
}

function buildScore({
    authority,
    baseline,
    captureSource,
    candidate,
    modelRuntime,
    opening,
    profile,
    repositoryId,
    scorer,
    source,
    tasks,
}) {
    const rejectionReasons = tasks.some((task) => task.status === "deadline_exceeded")
        ? ["query_deadline_exceeded"]
        : [];
    const allOrNothingFallbackPreserved = tasks
        .filter((task) => task.status === "deadline_exceeded")
        .every((task) => task.ranking.length === 0 && task.policyAffected === false);
    if (rejectionReasons.length > 0 || !allOrNothingFallbackPreserved) {
        throw new Error("Track O requires complete product-deadline D32 scores for every task.");
    }
    return bindOpening({
        schemaVersion: SCORE_SCHEMA,
        contenderId: candidate.id,
        candidateDepth: candidate.candidateDepth,
        contract: {
            manifestFileSha256: opening.authority.manifestFileSha256,
            manifestSeal: opening.authority.manifestCanonicalSealSha256,
            repositoryId,
            projectionVersion: candidate.projection.id,
            trackO: {
                openingRecordSha256: opening.sha256,
                o2ReceiptSha256: opening.authority.o2ReceiptSha256,
                profile,
                candidate,
                scorer,
                exclusions: PROTOCOL_EXCLUSIONS.map((exclusion) => ({ ...exclusion })),
            },
        },
        modelRuntime,
        source: {
            repositoryId,
            revision: source.revision,
            tree: source.tree,
            sourceTreeSha256: source.sourceTreeSha256,
        },
        captures: [{
            fileName: captureSource.fileName,
            fileSha256: captureSource.fileSha256,
            captureSha256: captureSource.capture.sha256,
            baselineReplaySha256: baseline.sha256,
        }],
        authority,
        tasks,
        resources: scoreResources(tasks),
        qualification: {
            passed: true,
            rejectionReasons: [],
            allOrNothingFallbackPreserved,
        },
    }, opening);
}

async function scoreOneCapture({
    candidate,
    captureSource,
    lateOnRuntime,
    modelRuntime,
    opening,
    profile,
    repositoryId,
    scorer,
    source,
}, dependencies) {
    const baseline = dependencies.replayBaseline(captureSource.capture, {
        requireNeuralDisabled: true,
        requireGroupingReady: true,
    });
    const tasks = await dependencies.scoreTasks({
        taskCaptures: captureSource.tasks,
        candidateDepth: candidate.candidateDepth,
        sourceRoot: source.absoluteRoot,
        runtime: lateOnRuntime,
        buildProjection: dependencies.buildProjection,
    });
    const score = buildScore({
        authority: captureSource.capture.authority,
        baseline,
        captureSource,
        candidate,
        modelRuntime,
        opening,
        profile: profileBinding(profile, opening.profile.assetFileSha256),
        repositoryId,
        scorer,
        source,
        tasks,
    });
    const unboundReplay = dependencies.replayNeural(
        captureSource.capture,
        score,
        {
            expectedManifestSeal: opening.authority.manifestCanonicalSealSha256,
            allowedContenderIds: [candidate.id],
            diagnosticQualityOnly: false,
        },
    );
    return {
        score,
        replay: bindOpening(unboundReplay, opening),
        baselineSha256: baseline.sha256,
        unboundReplaySha256: unboundReplay.sha256,
    };
}

export async function scoreTrackOHeldOutCapturePair(input, overrides = {}) {
    const dependencies = {
        validateModelArtifacts,
        validateProductionRuntime,
        resolveSourceIdentity,
        loadCapture,
        createRuntime: createProductionRuntime,
        replayBaseline: replayBaselineCandidateCapture,
        replayNeural: replayNeuralCandidateCapture,
        scoreTasks: scoreCapturedTasks,
        buildProjection: buildCapturedRerankProjectionV2,
        scorerIdentity,
        ...overrides,
    };
    const validated = validateTrackOScoringAuthority(input, overrides);

    // Opening/O0/O2/profile authority must pass before model, capture, or source payload access.
    const modelRoot = dependencies.validateModelArtifacts(
        input.modelDirectory,
        validated.candidate.artifacts,
    );
    const workerPath = dependencies.validateProductionRuntime(
        input.runtimeProfileFile,
        input.runtimeProfile,
    );
    const source = dependencies.resolveSourceIdentity(input.sourceRoot);
    const positive = validateCapture(
        dependencies.loadCapture(input.positiveCaptureFile),
        validated.opening,
        "positive",
    );
    const negative = validateCapture(
        dependencies.loadCapture(input.negativeCaptureFile),
        validated.opening,
        "negative",
    );
    verifyCapturePair(positive, negative);
    if (positive.capture.authority.gitRevision !== source.revision) {
        throw new Error("Capture pair revision does not match the pinned held-out source.");
    }
    const repositoryId = requireString(input.repositoryId, "Track O repository ID");
    const lateOnRuntime = await dependencies.createRuntime({
        modelDirectory: modelRoot,
        profileFile: input.runtimeProfileFile,
        workerPath,
    });
    const shared = {
        candidate: validated.candidate,
        lateOnRuntime,
        modelRuntime: lateOnRuntime.getIdentity(),
        opening: validated.opening,
        profile: input.runtimeProfile,
        repositoryId,
        scorer: dependencies.scorerIdentity(),
        source,
    };
    try {
        await lateOnRuntime.waitUntilReady();
        const positiveArtifacts = await scoreOneCapture({
            ...shared,
            captureSource: positive,
        }, dependencies);
        const negativeArtifacts = await scoreOneCapture({
            ...shared,
            captureSource: negative,
        }, dependencies);
        return { positive: positiveArtifacts, negative: negativeArtifacts };
    } finally {
        await lateOnRuntime.close();
    }
}

export function parseTrackOScoreArguments(argv) {
    const values = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith("--") || value === undefined) {
            throw new Error("Arguments must use --name value pairs.");
        }
        values.set(key.slice(2), value);
    }
    const required = [
        "opening-record",
        "o0-authority",
        "o2-receipt",
        "runtime-profile",
        "model-directory",
        "source-root",
        "repository-id",
        "positive-capture",
        "negative-capture",
        "positive-score-output",
        "negative-score-output",
        "positive-replay-output",
        "negative-replay-output",
    ];
    for (const key of required) {
        if (!values.has(key)) throw new Error(`Missing --${key}.`);
    }
    return Object.fromEntries(values);
}

function readJsonSource(file, label) {
    const bytes = fs.readFileSync(file);
    try {
        return { value: JSON.parse(bytes.toString("utf8")), fileSha256: sha256Bytes(bytes) };
    } catch (error) {
        throw new Error(`${label} is not valid JSON: ${error.message}`);
    }
}

function writeJson(file, value) {
    fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
    });
}

function isInside(root, file) {
    const relative = path.relative(root, file);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function validateTrackOOutputPaths(files, sourceRoot) {
    const roots = [fs.realpathSync(REPOSITORY_ROOT), fs.realpathSync(sourceRoot)];
    const resolved = files.map((file) => {
        const parent = fs.realpathSync(path.dirname(path.resolve(file)));
        const target = path.join(parent, path.basename(file));
        if (fs.existsSync(target)) {
            throw new Error(`Track O output '${target}' already exists.`);
        }
        if (roots.some((root) => isInside(root, target))) {
            throw new Error("Track O outputs must be outside clean source repositories.");
        }
        return target;
    });
    if (new Set(resolved).size !== resolved.length) {
        throw new Error("Track O score and replay output paths must be distinct.");
    }
    return resolved;
}

export async function main(argv = process.argv.slice(2)) {
    const arguments_ = parseTrackOScoreArguments(argv);
    const outputKeys = [
        "positive-score-output",
        "negative-score-output",
        "positive-replay-output",
        "negative-replay-output",
    ];
    const outputFiles = validateTrackOOutputPaths(
        outputKeys.map((key) => arguments_[key]),
        arguments_["source-root"],
    );
    const opening = readJsonSource(arguments_["opening-record"], "Track O opening record");
    const o0 = readJsonSource(arguments_["o0-authority"], "O0 authority");
    const o2 = readJsonSource(arguments_["o2-receipt"], "O2 receipt");
    const profile = readJsonSource(arguments_["runtime-profile"], "D32 runtime profile");
    const result = await scoreTrackOHeldOutCapturePair({
        openingRecord: opening.value,
        o0Authority: o0.value,
        o0AuthorityFileSha256: o0.fileSha256,
        o2Receipt: o2.value,
        runtimeProfile: profile.value,
        runtimeProfileFileSha256: profile.fileSha256,
        runtimeProfileFile: path.resolve(arguments_["runtime-profile"]),
        modelDirectory: arguments_["model-directory"],
        sourceRoot: arguments_["source-root"],
        repositoryId: arguments_["repository-id"],
        positiveCaptureFile: arguments_["positive-capture"],
        negativeCaptureFile: arguments_["negative-capture"],
    });
    writeJson(outputFiles[0], result.positive.score);
    writeJson(outputFiles[1], result.negative.score);
    writeJson(outputFiles[2], result.positive.replay);
    writeJson(outputFiles[3], result.negative.replay);
    return result;
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.stack : String(error));
        process.exitCode = 1;
    });
}
