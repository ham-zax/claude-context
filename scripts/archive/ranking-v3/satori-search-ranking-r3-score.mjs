#!/usr/bin/env -S node --import tsx
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLanguageAnalysisService } from "../packages/core/src/language-analysis/service.ts";
import { buildIndexedChunkId } from "../packages/core/src/core/indexed-chunk-identity.ts";
import {
    SEARCH_RERANK_DOC_MAX_CHARS,
    SEARCH_RERANK_DOC_MAX_LINES,
} from "../packages/mcp/src/core/search-constants.ts";
import {
    SEARCH_RERANK_DOCUMENT_PROJECTION_VERSION,
    buildSearchRerankDocument,
} from "../packages/mcp/src/core/search-rerank-document.ts";
import { buildRerankCandidatePool } from "../packages/mcp/src/core/search-rerank-policy.ts";
import {
    SEARCH_RERANK_DOCUMENT_V2_POLICY,
    buildSearchRerankDocumentV2,
} from "./satori-search-rerank-document-v2.mjs";
import { replayBaselineCandidateCapture } from "./satori-search-candidate-replay.mjs";
import { createLateOnRuntime } from "./satori-lateon-c0-native.mjs";
import { canonicalJson } from "./satori-useful-context.mjs";

const RESULT_SCHEMA = "satori_search_ranking_r3_scores_v1";
const TRACK_L_RESULT_SCHEMA = "satori_search_ranking_track_l_scores_v2";
const TOOL_REPOSITORY_ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);
const TOOL_ARTIFACTS = Object.freeze([
    ["r3_scorer", fileURLToPath(import.meta.url)],
    ["lateon_runtime", fileURLToPath(new URL("./satori-lateon-c0-native.mjs", import.meta.url))],
    ["baseline_replay", fileURLToPath(new URL("./satori-search-candidate-replay.mjs", import.meta.url))],
    [
        "chunk_identity_owner",
        fileURLToPath(new URL(
            "../packages/core/src/core/indexed-chunk-identity.ts",
            import.meta.url,
        )),
    ],
    [
        "rerank_document_owner",
        fileURLToPath(new URL(
            "../packages/mcp/src/core/search-rerank-document.ts",
            import.meta.url,
        )),
    ],
    [
        "rerank_candidate_pool_owner",
        fileURLToPath(new URL(
            "../packages/mcp/src/core/search-rerank-policy.ts",
            import.meta.url,
        )),
    ],
    [
        "rerank_document_v2_owner",
        fileURLToPath(new URL("./satori-search-rerank-document-v2.mjs", import.meta.url)),
    ],
    ["dependency_lockfile", fileURLToPath(new URL("../pnpm-lock.yaml", import.meta.url))],
]);
const RERANK_DOCUMENT_V1_PATH = fileURLToPath(new URL(
    "../packages/mcp/src/core/search-rerank-document.ts",
    import.meta.url,
));
const RERANK_DOCUMENT_V2_PATH = fileURLToPath(new URL(
    "./satori-search-rerank-document-v2.mjs",
    import.meta.url,
));
const RERANK_CANDIDATE_POOL_PATH = fileURLToPath(new URL(
    "../packages/mcp/src/core/search-rerank-policy.ts",
    import.meta.url,
));
const LATEON_RUNTIME_PATH = fileURLToPath(new URL(
    "./satori-lateon-c0-native.mjs",
    import.meta.url,
));
const TRACK_L_SCORER_PATH = fileURLToPath(import.meta.url);
const CANDIDATE_REPLAY_PATH = fileURLToPath(new URL(
    "./satori-search-candidate-replay.mjs",
    import.meta.url,
));
const TRACK_L_EVALUATOR_PATH = fileURLToPath(new URL(
    "./satori-search-ranking-r3.mjs",
    import.meta.url,
));
const CANDIDATE_CAPTURE_PATH = fileURLToPath(new URL(
    "./satori-search-candidate-capture.mjs",
    import.meta.url,
));
const TASK_SUITE_CONTRACT_PATH = fileURLToPath(new URL(
    "./satori-useful-context.mjs",
    import.meta.url,
));
const BOUNDED_SOURCE_SELECTOR_PATH = fileURLToPath(new URL(
    "../packages/mcp/src/core/bounded-source-selector.ts",
    import.meta.url,
));
const SEARCH_CONSTANTS_PATH = fileURLToPath(new URL(
    "../packages/mcp/src/core/search-constants.ts",
    import.meta.url,
));
const RUNTIME_PROFILE_LOADER_PATH = fileURLToPath(new URL(
    "../packages/mcp/src/server/lateon-reranker.ts",
    import.meta.url,
));
const WORKER_PROTOCOL_PATH = fileURLToPath(new URL(
    "../packages/mcp/src/server/lateon-reranker-protocol.ts",
    import.meta.url,
));
const RUNTIME_PROFILE_ASSET_PATH = fileURLToPath(new URL(
    "../packages/mcp/assets/lateon/runtime-profile-v1.json",
    import.meta.url,
));
const DEPENDENCY_LOCKFILE_PATH = fileURLToPath(new URL("../pnpm-lock.yaml", import.meta.url));

const TRACK_L_QUERY_FORMATTING_POLICY = Object.freeze({
    policy: "captured_semantic_query_plus_c0_prefix_v1",
    semanticQuerySource: "candidate_capture.queryPlan.queryIntent.semanticQuery",
    sourceOwner: Object.freeze({
        role: "lateon_query_formatting",
        path: "scripts/satori-lateon-c0-native.mjs",
    }),
});

const TRACK_L_OWNER_FAMILY_ADMISSION_POLICY = Object.freeze({
    policy: "owner_representative_then_bounded_supplemental_rounds_v1",
    familyKeyPrecedence: Object.freeze([
        "ownerSymbolInstanceId",
        "ownerSymbolKey",
        "exactChunkIdentity",
    ]),
    representativeSelection: "first_candidate_in_frozen_order_v1",
    supplementalSelection: "fair_rounds_in_frozen_family_order_v1",
    sourceOwner: Object.freeze({
        role: "owner_family_admission",
        path: "packages/mcp/src/core/search-rerank-policy.ts",
    }),
});

export function parseR3ScoreArguments(argv) {
    const values = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith("--") || value === undefined) {
            throw new Error("Arguments must use --name value pairs.");
        }
        values.set(key.slice(2), value);
    }
    if (values.has("prepare-capture-authority")) {
        for (const key of ["manifest", "manifest-seal", "output"]) {
            if (!values.has(key)) throw new Error(`Missing --${key}.`);
        }
        return { mode: "prepare_capture_authority", ...Object.fromEntries(values) };
    }
    const required = [
        "contract",
        "model-directory",
        "transformers-module",
        "onnxruntime-module",
        "source-root",
        "positive-capture",
        "negative-capture",
        "output",
    ];
    for (const key of required) {
        if (!values.has(key)) throw new Error(`Missing --${key}.`);
    }
    const trackLKeys = [
        "manifest",
        "manifest-seal",
        "arm",
        "runtime-profile",
        "repository-id",
        "capture-authority",
    ];
    const suppliedTrackLKeys = trackLKeys.filter((key) => values.has(key));
    if (suppliedTrackLKeys.length > 0 && suppliedTrackLKeys.length !== trackLKeys.length) {
        throw new Error(
            "Track L scoring requires --manifest, --manifest-seal, --arm, --runtime-profile, --repository-id, and --capture-authority together.",
        );
    }
    if (suppliedTrackLKeys.length === trackLKeys.length) {
        if (values.has("depth")) {
            throw new Error("--depth cannot be combined with the manifest-selected --arm.");
        }
        return { mode: "score", ...Object.fromEntries(values) };
    }
    if (!values.has("depth")) throw new Error("Missing --depth.");
    const depth = Number(values.get("depth"));
    if (![16, 32].includes(depth)) throw new Error("--depth must be 16 or 32.");
    return { mode: "score", ...Object.fromEntries(values), depth };
}

function sha256Bytes(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha256File(filePath) {
    return sha256Bytes(fs.readFileSync(filePath));
}

function sha256Canonical(value) {
    return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}

function requireSha256(value, label) {
    const digest = requireString(value, label).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(digest)) {
        throw new Error(`${label} must be a SHA-256 digest.`);
    }
    return digest;
}

function verifyTrackLManifestSeal(manifest, expectedManifestSeal) {
    const manifestRecord = requireRecord(manifest, "Track L manifest");
    const suppliedSeal = requireSha256(manifestRecord.sha256, "Track L manifest seal");
    const { sha256: _ignored, ...unsignedManifest } = manifestRecord;
    if (sha256Canonical(unsignedManifest) !== suppliedSeal) {
        throw new Error("Track L manifest seal does not match its contents.");
    }
    if (suppliedSeal !== requireSha256(expectedManifestSeal, "Expected Track L manifest seal")) {
        throw new Error("Track L manifest does not match the expected L0 seal.");
    }
    if (manifestRecord.version !== 3) {
        throw new Error("Track L scoring requires manifest version 3.");
    }
    return { manifest: manifestRecord, manifestSeal: suppliedSeal };
}

function normalizeSafetyControls(value, label) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`${label} must be a non-empty array when present.`);
    }
    const controls = value.map((control, index) => requireString(
        control,
        `${label}[${index}]`,
    ));
    if (new Set(controls).size !== controls.length) {
        throw new Error(`${label} contains duplicate controls.`);
    }
    return controls;
}

function normalizeTaskAuthority(task, idField, label) {
    const record = requireRecord(task, label);
    return {
        taskId: requireString(record[idField], `${label} ${idField}`),
        split: requireString(record.split, `${label} split`),
        queryClass: requireString(record.queryClass, `${label} queryClass`),
        safetyControls: normalizeSafetyControls(
            record.safetyControls,
            `${label} safetyControls`,
        ),
    };
}

function sortedUniqueCaptureTasks(capture, label) {
    const captures = Array.isArray(capture?.capture?.captures)
        ? capture.capture.captures
        : [];
    const tasks = captures.map((task, index) => normalizeTaskAuthority(
        task,
        "taskId",
        `${label} task ${index + 1}`,
    )).sort((left, right) => compareContractStrings(left.taskId, right.taskId));
    const taskIds = tasks.map(({ taskId }) => taskId);
    if (new Set(taskIds).size !== tasks.length) {
        throw new Error(`${label} contains duplicate task IDs.`);
    }
    return tasks;
}

function repositoryAuthorityFromManifest(manifest, repositoryId) {
    const repository = (Array.isArray(manifest.repositories) ? manifest.repositories : [])
        .find((candidate) => candidate?.id === repositoryId);
    if (!repository || repository.split !== "tuning") {
        throw new Error(`Track L repository '${repositoryId}' is not a frozen tuning repository.`);
    }
    return {
        id: requireString(repository.id, "Track L repository id"),
        revision: requireString(repository.revision, `Repository '${repositoryId}' revision`),
        gitTree: requireString(repository.gitTree, `Repository '${repositoryId}' git tree`),
        sourceTreeSha256: requireSha256(
            repository.sourceTreeSha256,
            `Repository '${repositoryId}' source tree digest`,
        ),
    };
}

function tuningRepositoryIds(manifest) {
    const repositoryIds = (Array.isArray(manifest.repositories) ? manifest.repositories : [])
        .filter((repository) => repository?.split === "tuning")
        .map((repository, index) => requireString(
            repository.id,
            `Track L tuning repository ${index + 1} id`,
        ))
        .sort(compareContractStrings);
    if (repositoryIds.length < 6 || new Set(repositoryIds).size !== repositoryIds.length) {
        throw new Error("Track L capture authority requires at least six unique tuning repositories.");
    }
    return repositoryIds;
}

function expectedRepositoryTasks(manifest, repositoryId) {
    const positive = [];
    const negative = [];
    const taskIds = new Set();
    for (const task of Array.isArray(manifest.tasks) ? manifest.tasks : []) {
        if (task?.repositoryId !== repositoryId) continue;
        const manifestTaskAuthority = normalizeTaskAuthority(
            task,
            "id",
            `Repository '${repositoryId}' task`,
        );
        if (manifestTaskAuthority.split !== "tuning") {
            throw new Error(
                `Task '${manifestTaskAuthority.taskId}' is not a frozen tuning task.`,
            );
        }
        const taskAuthority = {
            ...manifestTaskAuthority,
            queryClass: task.oracle?.kind === "negative"
                ? "negative_exposure"
                : task.queryClass === "exact_identifier"
                    ? "exact_identifier"
                    : "owner_discovery",
        };
        if (taskIds.has(taskAuthority.taskId)) {
            throw new Error(`Task '${taskAuthority.taskId}' is duplicated.`);
        }
        taskIds.add(taskAuthority.taskId);
        const target = task.oracle?.kind === "owner"
            ? positive
            : task.oracle?.kind === "negative"
                ? negative
                : null;
        if (!target) throw new Error(`Task '${task?.id}' has unsupported Track L oracle authority.`);
        target.push(taskAuthority);
    }
    positive.sort((left, right) => compareContractStrings(left.taskId, right.taskId));
    negative.sort((left, right) => compareContractStrings(left.taskId, right.taskId));
    if (positive.length === 0 || negative.length === 0) {
        throw new Error(`Repository '${repositoryId}' requires positive and negative Track L tasks.`);
    }
    return { positive, negative };
}

function normalizeCaptureBinding(capture, expectedTasks, label) {
    const tasks = sortedUniqueCaptureTasks(capture, label);
    assertCanonicalEqual(tasks, expectedTasks, `${label} tasks`);
    return {
        fileSha256: requireSha256(capture.fileSha256, `${label} file digest`),
        captureSha256: requireSha256(capture.capture?.sha256, `${label} capture digest`),
        baselineReplaySha256: requireSha256(
            capture.replaySha256,
            `${label} baseline replay digest`,
        ),
        tasks,
    };
}

export function buildTrackLCaptureAuthority({
    manifest,
    expectedManifestSeal,
    capturePairs,
}) {
    const sealed = verifyTrackLManifestSeal(manifest, expectedManifestSeal);
    if (!Array.isArray(capturePairs)) {
        throw new Error("Track L capture pairs must be an array.");
    }
    const tuningRepositories = tuningRepositoryIds(sealed.manifest);
    const pairIds = capturePairs.map(({ repositoryId }) => repositoryId)
        .sort(compareContractStrings);
    assertCanonicalEqual(pairIds, tuningRepositories, "Track L capture repository IDs");
    const repositories = capturePairs.map((pair) => {
        const repository = repositoryAuthorityFromManifest(sealed.manifest, pair.repositoryId);
        const tasks = expectedRepositoryTasks(sealed.manifest, repository.id);
        verifyCapturePair(pair.positive, pair.negative);
        if (pair.positive.capture.authority.gitRevision !== repository.revision) {
            throw new Error(`Repository '${repository.id}' positive capture revision mismatch.`);
        }
        return {
            ...repository,
            tasks,
            publicationSha256: sha256Canonical(pair.positive.capture.authority.armPublication),
            positive: normalizeCaptureBinding(
                pair.positive,
                tasks.positive,
                `Repository '${repository.id}' positive capture`,
            ),
            negative: normalizeCaptureBinding(
                pair.negative,
                tasks.negative,
                `Repository '${repository.id}' negative capture`,
            ),
        };
    }).sort((left, right) => compareContractStrings(left.id, right.id));
    const unsigned = {
        schemaVersion: "satori_search_ranking_track_l_capture_authority_v2",
        manifestSeal: sealed.manifestSeal,
        digestBinding: sealed.manifest.lateOnL0Authority?.candidateCaptureContract?.digestBinding,
        repositories,
        aggregateCaptureSha256: sha256Canonical(repositories),
    };
    if (unsigned.digestBinding !== "sha256_canonical_json_after_capture_before_scoring") {
        throw new Error("Track L capture digest binding is unsupported.");
    }
    return { ...unsigned, sha256: sha256Canonical(unsigned) };
}

export function resolveTrackLCaptureAuthority({
    manifest,
    expectedManifestSeal,
    authority,
    repositoryId,
    positive,
    negative,
}) {
    const sealed = verifyTrackLManifestSeal(manifest, expectedManifestSeal);
    const record = requireRecord(authority, "Track L capture authority");
    const suppliedDigest = requireSha256(record.sha256, "Track L capture authority digest");
    const { sha256: _ignored, ...unsigned } = record;
    if (sha256Canonical(unsigned) !== suppliedDigest) {
        throw new Error("Track L capture authority digest does not match its contents.");
    }
    if (
        record.schemaVersion !== "satori_search_ranking_track_l_capture_authority_v2"
        || record.manifestSeal !== sealed.manifestSeal
        || record.digestBinding !== "sha256_canonical_json_after_capture_before_scoring"
    ) {
        throw new Error("Track L capture authority is incompatible with the sealed manifest.");
    }
    if (!Array.isArray(record.repositories)) {
        throw new Error("Track L capture authority repositories must be an array.");
    }
    if (sha256Canonical(record.repositories) !== record.aggregateCaptureSha256) {
        throw new Error("Track L capture authority aggregate digest does not match its contents.");
    }
    const expectedRepositoryIds = tuningRepositoryIds(sealed.manifest);
    const authorityRepositoryIds = record.repositories.map((candidate, index) => requireString(
        candidate?.id,
        `Track L capture authority repository ${index + 1} id`,
    )).sort(compareContractStrings);
    assertCanonicalEqual(
        authorityRepositoryIds,
        expectedRepositoryIds,
        "Track L capture repository IDs",
    );
    const expectedTasksByRepository = new Map();
    for (const candidate of record.repositories) {
        const expectedRepository = repositoryAuthorityFromManifest(sealed.manifest, candidate.id);
        const expectedTasks = expectedRepositoryTasks(sealed.manifest, candidate.id);
        assertCanonicalEqual(
            {
                id: candidate.id,
                revision: candidate.revision,
                gitTree: candidate.gitTree,
                sourceTreeSha256: candidate.sourceTreeSha256,
            },
            expectedRepository,
            `Repository '${candidate.id}' authority`,
        );
        assertCanonicalEqual(
            candidate.tasks,
            expectedTasks,
            `Repository '${candidate.id}' tasks`,
        );
        expectedTasksByRepository.set(candidate.id, expectedTasks);
    }
    const repository = record.repositories.find((candidate) => candidate?.id === repositoryId);
    if (!repository) {
        throw new Error(`Track L capture authority has no repository '${repositoryId}'.`);
    }
    const expectedTasks = expectedTasksByRepository.get(repositoryId);
    assertCanonicalEqual(
        repository.positive,
        normalizeCaptureBinding(positive, expectedTasks.positive, "Positive capture"),
        "Positive capture binding",
    );
    assertCanonicalEqual(
        repository.negative,
        normalizeCaptureBinding(negative, expectedTasks.negative, "Negative capture"),
        "Negative capture binding",
    );
    verifyCapturePair(positive, negative);
    if (sha256Canonical(positive.capture.authority.armPublication) !== repository.publicationSha256) {
        throw new Error("Capture publication does not match the post-capture authority.");
    }
    return { sha256: suppliedDigest, aggregateCaptureSha256: record.aggregateCaptureSha256, repository };
}

function artifactAuthority(role, relativePath, absolutePath) {
    return {
        role,
        path: relativePath,
        sha256: sha256File(absolutePath),
    };
}

export function getTrackLScoringToolingAuthority() {
    return {
        queryFormatting: {
            ...TRACK_L_QUERY_FORMATTING_POLICY,
            sourceOwner: artifactAuthority(
                TRACK_L_QUERY_FORMATTING_POLICY.sourceOwner.role,
                TRACK_L_QUERY_FORMATTING_POLICY.sourceOwner.path,
                LATEON_RUNTIME_PATH,
            ),
        },
        ownerFamilyAdmission: {
            ...TRACK_L_OWNER_FAMILY_ADMISSION_POLICY,
            familyKeyPrecedence: [...TRACK_L_OWNER_FAMILY_ADMISSION_POLICY.familyKeyPrecedence],
            sourceOwner: artifactAuthority(
                TRACK_L_OWNER_FAMILY_ADMISSION_POLICY.sourceOwner.role,
                TRACK_L_OWNER_FAMILY_ADMISSION_POLICY.sourceOwner.path,
                RERANK_CANDIDATE_POOL_PATH,
            ),
        },
        projectionV1: {
            id: SEARCH_RERANK_DOCUMENT_PROJECTION_VERSION,
            status: "known_diagnostic_replay_only",
            serialization: "newline_delimited_fields",
            maximumLines: SEARCH_RERANK_DOC_MAX_LINES,
            maximumCharacters: SEARCH_RERANK_DOC_MAX_CHARS,
            fieldOrder: [
                "repository_relative_path",
                "language",
                "canonical_symbol_label",
                "content",
            ],
            sourceOwner: artifactAuthority(
                "rerank_document_v1",
                "packages/mcp/src/core/search-rerank-document.ts",
                RERANK_DOCUMENT_V1_PATH,
            ),
        },
        projectionV2: {
            ...SEARCH_RERANK_DOCUMENT_V2_POLICY,
            fieldOrder: [...SEARCH_RERANK_DOCUMENT_V2_POLICY.fieldOrder],
            selector: { ...SEARCH_RERANK_DOCUMENT_V2_POLICY.selector },
            queryFormatting: { ...SEARCH_RERANK_DOCUMENT_V2_POLICY.queryFormatting },
            status: "prospective_frozen",
            sourceOwner: artifactAuthority(
                "rerank_document_v2",
                "scripts/satori-search-rerank-document-v2.mjs",
                RERANK_DOCUMENT_V2_PATH,
            ),
        },
        runtimeArtifacts: [
            artifactAuthority(
                "candidate_capture",
                "scripts/satori-search-candidate-capture.mjs",
                CANDIDATE_CAPTURE_PATH,
            ),
            artifactAuthority(
                "task_suite_contract",
                "scripts/satori-useful-context.mjs",
                TASK_SUITE_CONTRACT_PATH,
            ),
            artifactAuthority(
                "lateon_score",
                "scripts/satori-search-ranking-r3-score.mjs",
                TRACK_L_SCORER_PATH,
            ),
            artifactAuthority(
                "candidate_replay",
                "scripts/satori-search-candidate-replay.mjs",
                CANDIDATE_REPLAY_PATH,
            ),
            artifactAuthority(
                "quality_decision",
                "scripts/satori-search-ranking-r3.mjs",
                TRACK_L_EVALUATOR_PATH,
            ),
            artifactAuthority(
                "lateon_loader",
                "scripts/satori-lateon-c0-native.mjs",
                LATEON_RUNTIME_PATH,
            ),
            artifactAuthority(
                "rerank_document_v1",
                "packages/mcp/src/core/search-rerank-document.ts",
                RERANK_DOCUMENT_V1_PATH,
            ),
            artifactAuthority(
                "rerank_document_v2",
                "scripts/satori-search-rerank-document-v2.mjs",
                RERANK_DOCUMENT_V2_PATH,
            ),
            artifactAuthority(
                "owner_family_admission",
                "packages/mcp/src/core/search-rerank-policy.ts",
                RERANK_CANDIDATE_POOL_PATH,
            ),
            artifactAuthority(
                "bounded_source_selector",
                "packages/mcp/src/core/bounded-source-selector.ts",
                BOUNDED_SOURCE_SELECTOR_PATH,
            ),
            artifactAuthority(
                "search_constants",
                "packages/mcp/src/core/search-constants.ts",
                SEARCH_CONSTANTS_PATH,
            ),
            artifactAuthority(
                "runtime_profile_loader",
                "packages/mcp/src/server/lateon-reranker.ts",
                RUNTIME_PROFILE_LOADER_PATH,
            ),
            artifactAuthority(
                "worker_protocol",
                "packages/mcp/src/server/lateon-reranker-protocol.ts",
                WORKER_PROTOCOL_PATH,
            ),
            artifactAuthority(
                "runtime_profile",
                "packages/mcp/assets/lateon/runtime-profile-v1.json",
                RUNTIME_PROFILE_ASSET_PATH,
            ),
            artifactAuthority(
                "dependency_lockfile",
                "pnpm-lock.yaml",
                DEPENDENCY_LOCKFILE_PATH,
            ),
        ],
    };
}

function assertCanonicalEqual(actual, expected, label) {
    if (canonicalJson(actual) !== canonicalJson(expected)) {
        throw new Error(`${label} does not match the frozen Track L authority.`);
    }
}

function runtimeProfileAuthority(runtimeProfile) {
    const selection = requireRecord(runtimeProfile.selection, "Runtime profile selection");
    const limits = requireRecord(runtimeProfile.derivedLimits, "Runtime profile derived limits");
    const limitValue = (name) => {
        const limit = requireRecord(limits[name], `Runtime profile ${name}`);
        if (!Number.isSafeInteger(limit.value) || limit.value <= 0) {
            throw new Error(`Runtime profile ${name}.value must be a positive safe integer.`);
        }
        return limit.value;
    };
    return {
        profile: requireString(runtimeProfile.host?.profile, "Runtime host profile"),
        maximumModelLoadMilliseconds: limitValue("maximumModelLoadMilliseconds"),
        maximumWarmP95Milliseconds: limitValue("maximumWarmP95Milliseconds"),
        requestDeadlineMilliseconds: limitValue("requestDeadlineMilliseconds"),
        maximumProcessPeakRssBytes: limitValue("maximumProcessPeakRssBytes"),
        maximumProcessRetainedRssBytes: limitValue("maximumProcessRetainedRssBytes"),
        documentBatchSize: selection.documentBatchSize,
        intraOpThreads: selection.intraOpThreads,
        interOpThreads: selection.interOpThreads,
        executionProvider: selection.executionProvider,
    };
}

export function resolveTrackLScoringAuthority({
    manifest,
    expectedManifestSeal,
    armId,
    c0Contract,
    c0ContractSha256,
    runtimeProfile,
    runtimeProfileSha256,
}) {
    const sealed = verifyTrackLManifestSeal(manifest, expectedManifestSeal);
    const manifestRecord = sealed.manifest;
    const suppliedSeal = sealed.manifestSeal;
    const authority = requireRecord(
        manifestRecord.lateOnL0Authority,
        "Track L L0 authority",
    );
    const arms = Array.isArray(authority.newArms) ? authority.newArms : [];
    const arm = arms.find((candidate) => candidate?.id === armId);
    if (!arm || arm.status !== "preregistered_unopened") {
        throw new Error(`Track L arm '${armId}' is not preregistered and unopened.`);
    }
    if (![16, 32, 50].includes(arm.candidateDepth)) {
        throw new Error(`Track L arm '${armId}' has unsupported candidate depth.`);
    }
    const expectedArmId = arm.projectionVersion === SEARCH_RERANK_DOCUMENT_PROJECTION_VERSION
        ? `projection-v1-d-l${arm.candidateDepth}`
        : arm.projectionVersion === SEARCH_RERANK_DOCUMENT_V2_POLICY.id
            ? `projection-v2-d-l${arm.candidateDepth}`
            : null;
    if (arm.id !== expectedArmId) {
        throw new Error(`Track L arm '${arm.id}' has incompatible projection/depth identity.`);
    }

    const tooling = getTrackLScoringToolingAuthority();
    const frozenRuntimeArtifacts = Array.isArray(authority.runtime?.artifacts)
        ? authority.runtime.artifacts
        : [];
    const frozenRuntimeArtifactsByRole = new Map();
    for (const artifact of frozenRuntimeArtifacts) {
        if (frozenRuntimeArtifactsByRole.has(artifact?.role)) {
            throw new Error(`Track L runtime tooling role '${artifact?.role}' is duplicated.`);
        }
        frozenRuntimeArtifactsByRole.set(artifact?.role, artifact);
    }
    for (const expectedArtifact of tooling.runtimeArtifacts) {
        assertCanonicalEqual(
            frozenRuntimeArtifactsByRole.get(expectedArtifact.role),
            expectedArtifact,
            `Track L runtime tooling artifact '${expectedArtifact.role}'`,
        );
    }
    const knownArtifacts = Array.isArray(authority.knownEvidence?.artifacts)
        ? authority.knownEvidence.artifacts
        : [];
    const requireKnownArtifactDigest = (role, actualSha256, label) => {
        const artifact = knownArtifacts.find((candidate) => candidate?.role === role);
        if (!artifact || artifact.sha256 !== actualSha256) {
            throw new Error(`${label} artifact digest does not match the frozen Track L authority.`);
        }
    };
    requireKnownArtifactDigest("c0_contract", c0ContractSha256, "C0 contract");
    requireKnownArtifactDigest(
        "measured_runtime_profile",
        runtimeProfileSha256,
        "Measured runtime profile",
    );
    const expectedProjection = arm.projectionVersion === SEARCH_RERANK_DOCUMENT_PROJECTION_VERSION
        ? tooling.projectionV1
        : tooling.projectionV2;
    const projection = (Array.isArray(authority.projectionPolicies)
        ? authority.projectionPolicies
        : []).find(({ id }) => id === arm.projectionVersion);
    assertCanonicalEqual(projection, expectedProjection, "Projection policy");

    const inference = requireRecord(c0Contract?.inference, "C0 inference contract");
    const expectedQueryFormatting = {
        ...tooling.queryFormatting,
        queryPrefix: requireString(inference.queryPrefix, "C0 query prefix"),
        documentPrefix: requireString(inference.documentPrefix, "C0 document prefix"),
        lowercase: inference.lowercase,
        queryTokenLimit: inference.queryTokenLimit,
        documentTokenLimit: inference.documentTokenLimit,
    };
    assertCanonicalEqual(
        authority.queryFormatting,
        expectedQueryFormatting,
        "Query formatting policy",
    );
    assertCanonicalEqual(
        authority.ownerFamilyAdmission,
        tooling.ownerFamilyAdmission,
        "Owner-family admission policy",
    );
    const expectedRuntimeProfile = runtimeProfileAuthority(requireRecord(
        runtimeProfile,
        "Measured runtime profile",
    ));
    assertCanonicalEqual(
        authority.resourceProfile,
        expectedRuntimeProfile,
        "Runtime resource profile",
    );
    return {
        manifestSeal: suppliedSeal,
        armId: arm.id,
        candidateDepth: arm.candidateDepth,
        projectionVersion: arm.projectionVersion,
        projectionPolicy: projection,
        queryFormatting: authority.queryFormatting,
        ownerFamilyAdmission: authority.ownerFamilyAdmission,
        ...expectedRuntimeProfile,
    };
}

function compareContractStrings(left, right) {
    if (left === right) return 0;
    return left < right ? -1 : 1;
}

function percentile95(values) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.ceil(sorted.length * 0.95) - 1];
}

function requireRecord(value, label) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} must be an object.`);
    }
    return value;
}

function requireString(value, label, { allowEmpty = false } = {}) {
    if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
        throw new Error(`${label} must be ${allowEmpty ? "a string" : "a non-empty string"}.`);
    }
    return value;
}

function loadCapture(filePath) {
    const bytes = fs.readFileSync(filePath);
    const capture = JSON.parse(bytes.toString("utf8"));
    const replay = replayBaselineCandidateCapture(capture, {
        requireNeuralDisabled: true,
        requireGroupingReady: true,
    });
    return {
        capture,
        fileName: path.basename(filePath),
        fileSha256: sha256Bytes(bytes),
        replaySha256: replay.sha256,
    };
}

function prepareTrackLCaptureAuthority(arguments_) {
    const manifestBytes = fs.readFileSync(arguments_.manifest);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const pairsPath = path.resolve(arguments_["prepare-capture-authority"]);
    const pairInput = JSON.parse(fs.readFileSync(pairsPath, "utf8"));
    if (!Array.isArray(pairInput.repositories)) {
        throw new Error("Track L capture-pair input repositories must be an array.");
    }
    const pairDirectory = path.dirname(pairsPath);
    const resolveCapture = (value, label) => {
        const relativeOrAbsolute = requireString(value, label);
        return loadCapture(path.isAbsolute(relativeOrAbsolute)
            ? relativeOrAbsolute
            : path.resolve(pairDirectory, relativeOrAbsolute));
    };
    const authority = buildTrackLCaptureAuthority({
        manifest,
        expectedManifestSeal: arguments_["manifest-seal"],
        capturePairs: pairInput.repositories.map((pair, index) => ({
            repositoryId: requireString(
                pair?.repositoryId,
                `Capture pair ${index + 1} repositoryId`,
            ),
            positive: resolveCapture(
                pair?.positiveCapture,
                `Capture pair ${index + 1} positiveCapture`,
            ),
            negative: resolveCapture(
                pair?.negativeCapture,
                `Capture pair ${index + 1} negativeCapture`,
            ),
        })),
    });
    fs.writeFileSync(arguments_.output, `${JSON.stringify(authority, null, 2)}\n`, "utf8");
}

export function verifyCapturePair(positive, negative) {
    const fields = [
        ["gitRevision", positive.capture.authority.gitRevision, negative.capture.authority.gitRevision],
        [
            "publication",
            canonicalJson(positive.capture.authority.armPublication),
            canonicalJson(negative.capture.authority.armPublication),
        ],
    ];
    for (const [label, left, right] of fields) {
        if (left !== right) throw new Error(`Capture pair ${label} mismatch.`);
    }
}

export function selectR3ScoreTasks(taskCaptures, taskId) {
    if (!taskId) return [...taskCaptures];
    const selected = taskCaptures.filter((task) => task.taskId === taskId);
    if (selected.length === 0) {
        throw new Error(`No capture task matches '${taskId}'.`);
    }
    return selected;
}

function verifySourceRoot(sourceRoot, repositoryAuthority) {
    const absoluteRoot = path.resolve(sourceRoot);
    const revision = typeof repositoryAuthority === "string"
        ? repositoryAuthority
        : repositoryAuthority.revision;
    const actualRevision = execFileSync("git", ["-C", absoluteRoot, "rev-parse", "HEAD"], {
        encoding: "utf8",
    }).trim();
    if (actualRevision !== revision) {
        throw new Error(`Source revision mismatch (${actualRevision} != ${revision}).`);
    }
    const status = execFileSync("git", ["-C", absoluteRoot, "status", "--porcelain=v1"], {
        encoding: "utf8",
    });
    if (status.length !== 0) throw new Error("Pinned source worktree must be clean.");
    const tree = execFileSync("git", ["-C", absoluteRoot, "rev-parse", "HEAD^{tree}"], {
        encoding: "utf8",
    }).trim();
    if (typeof repositoryAuthority === "string") {
        return { absoluteRoot, revision: actualRevision, tree };
    }
    if (tree !== repositoryAuthority.gitTree) {
        throw new Error(`Source git tree mismatch (${tree} != ${repositoryAuthority.gitTree}).`);
    }
    const sourceTreeSha256 = sha256Bytes(execFileSync(
        "git",
        ["-C", absoluteRoot, "ls-tree", "-r", "--full-tree", actualRevision],
    ));
    if (sourceTreeSha256 !== repositoryAuthority.sourceTreeSha256) {
        throw new Error(
            `Source tree digest mismatch (${sourceTreeSha256} != `
            + `${repositoryAuthority.sourceTreeSha256}).`,
        );
    }
    return {
        absoluteRoot,
        repositoryId: repositoryAuthority.id,
        revision: actualRevision,
        tree,
        sourceTreeSha256,
    };
}

function verifyToolingIdentity() {
    const revision = execFileSync(
        "git",
        ["-C", TOOL_REPOSITORY_ROOT, "rev-parse", "HEAD"],
        { encoding: "utf8" },
    ).trim();
    const status = execFileSync(
        "git",
        ["-C", TOOL_REPOSITORY_ROOT, "status", "--porcelain=v1"],
        { encoding: "utf8" },
    );
    if (status.length !== 0) {
        throw new Error("R3 scorer requires a clean, committed tooling worktree.");
    }
    return {
        gitRevision: revision,
        gitTree: execFileSync(
            "git",
            ["-C", TOOL_REPOSITORY_ROOT, "rev-parse", "HEAD^{tree}"],
            { encoding: "utf8" },
        ).trim(),
        artifacts: TOOL_ARTIFACTS.map(([role, filePath]) => ({
            role,
            fileName: path.basename(filePath),
            bytes: fs.statSync(filePath).size,
            sha256: sha256File(filePath),
        })),
    };
}

function finalFilteredStage(taskCapture) {
    const stages = taskCapture.candidateTrace.stages.filter(
        (stage) => stage.stage === "mcp_filtered",
    );
    if (stages.length === 0) {
        throw new Error(`Task '${taskCapture.taskId}' has no filtered candidate stage.`);
    }
    return stages.at(-1);
}

function replaySignalsForAttempt(taskCapture, attemptId) {
    const prefix = `${attemptId}/replay:`;
    const signals = new Map();
    for (const stage of taskCapture.candidateTrace.stages) {
        if (
            stage.stage !== "mcp_replay_signals"
            || (stage.passId !== attemptId && !stage.passId?.startsWith(prefix))
        ) {
            continue;
        }
        for (const candidate of stage.candidates) {
            if (signals.has(candidate.candidateId)) {
                throw new Error(
                    `Task '${taskCapture.taskId}' has duplicate replay signal '${candidate.candidateId}'.`,
                );
            }
            signals.set(candidate.candidateId, candidate);
        }
    }
    return signals;
}

function ownerResultFields(ownerId, label) {
    let parsed;
    try {
        parsed = JSON.parse(ownerId);
    } catch {
        throw new Error(`${label} ownerId is not JSON.`);
    }
    if (parsed?.[0] === "symbol" && parsed.length === 3) {
        return { ownerSymbolInstanceId: requireString(parsed[2], `${label} owner symbol`) };
    }
    if (parsed?.[0] === "file" && parsed.length === 2) return {};
    throw new Error(`${label} ownerId has an unsupported shape.`);
}

function selectTaskCandidates(taskCapture, depth) {
    const filtered = finalFilteredStage(taskCapture);
    const signals = replaySignalsForAttempt(taskCapture, filtered.passId);
    const candidates = filtered.candidates.map((candidate) => {
        const signal = signals.get(candidate.candidateId);
        if (!signal) {
            throw new Error(
                `Task '${taskCapture.taskId}' candidate '${candidate.candidateId}' has no replay signal.`,
            );
        }
        return {
            candidateId: candidate.candidateId,
            result: {
                relativePath: candidate.relativePath,
                startLine: candidate.startLine,
                endLine: candidate.endLine,
                language: candidate.language,
                symbolLabel: signal.replay?.symbolLabel ?? undefined,
                ...ownerResultFields(
                    candidate.ownerId,
                    `Task '${taskCapture.taskId}' candidate '${candidate.candidateId}'`,
                ),
            },
            capturedDocumentUtf8Bytes: signal.replay?.rerankDocumentUtf8Bytes,
        };
    });
    const pool = buildRerankCandidatePool(candidates);
    return {
        candidates: pool.candidates.slice(0, depth),
        familyCount: pool.familyCount,
        supplementalCandidateCount: pool.supplementalCandidateCount,
        candidatePoolCount: pool.candidates.length,
    };
}

export function buildR3DocumentProjection({
    candidate,
    chunk,
    projectionVersion,
    query,
    sourceContent,
}) {
    const result = {
        relativePath: candidate.result.relativePath,
        language: candidate.result.language,
        content: chunk.content,
        symbolLabel: chunk.metadata.symbolLabel ?? candidate.result.symbolLabel,
    };
    if (projectionVersion === SEARCH_RERANK_DOCUMENT_PROJECTION_VERSION) {
        const text = buildSearchRerankDocument(result);
        return {
            version: projectionVersion,
            text,
            utf8Bytes: Buffer.byteLength(text, "utf8"),
        };
    }
    if (projectionVersion !== SEARCH_RERANK_DOCUMENT_V2_POLICY.id) {
        throw new Error(`Unsupported R3 projection '${projectionVersion}'.`);
    }
    return buildSearchRerankDocumentV2({
        relativePath: result.relativePath,
        language: result.language,
        symbolKind: chunk.metadata.symbolKind ?? "file",
        canonicalSymbolLabel: result.symbolLabel ?? path.basename(result.relativePath),
        content: requireString(sourceContent, "Projection v2 full-file source", {
            allowEmpty: true,
        }),
        symbolSpan: {
            startLine: candidate.result.startLine,
            endLine: candidate.result.endLine,
        },
        query,
    });
}

async function reconstructDocuments(
    sourceRoot,
    selectedCandidates,
    analysisService,
    { projectionVersion, query },
) {
    const candidatesByFile = new Map();
    for (const candidate of selectedCandidates) {
        const existing = candidatesByFile.get(candidate.result.relativePath) ?? [];
        existing.push(candidate);
        candidatesByFile.set(candidate.result.relativePath, existing);
    }
    const documents = new Map();
    for (const [relativePath, candidates] of candidatesByFile) {
        if (
            relativePath.startsWith("/")
            || relativePath.split(/[\\/]/).includes("..")
        ) {
            throw new Error(`Unsafe captured relative path '${relativePath}'.`);
        }
        const absolutePath = path.join(sourceRoot, relativePath);
        const content = fs.readFileSync(absolutePath, "utf8");
        const languages = new Set(candidates.map((candidate) => candidate.result.language));
        if (languages.size !== 1) {
            throw new Error(`Captured file '${relativePath}' has inconsistent languages.`);
        }
        const language = [...languages][0];
        const analysis = await analysisService.analyze({ content, relativePath, language });
        const chunksById = new Map();
        analysis.chunks.forEach((chunk, index) => {
            const candidateId = buildIndexedChunkId(relativePath, chunk, index);
            if (chunksById.has(candidateId)) {
                throw new Error(`Source analysis emitted duplicate chunk '${candidateId}'.`);
            }
            chunksById.set(candidateId, chunk);
        });
        for (const candidate of candidates) {
            const chunk = chunksById.get(candidate.candidateId);
            if (!chunk) {
                throw new Error(
                    `Captured chunk '${candidate.candidateId}' was not reconstructed from '${relativePath}'.`,
                );
            }
            if (
                candidate.result.startLine !== chunk.metadata.startLine
                || candidate.result.endLine !== chunk.metadata.endLine
            ) {
                throw new Error(
                    `Captured span mismatch for '${candidate.candidateId}' `
                    + `(${candidate.result.startLine}-${candidate.result.endLine} != `
                    + `${chunk.metadata.startLine}-${chunk.metadata.endLine}).`,
                );
            }
            const projection = buildR3DocumentProjection({
                candidate,
                chunk,
                projectionVersion,
                query,
                sourceContent: content,
            });
            if (
                projectionVersion === SEARCH_RERANK_DOCUMENT_PROJECTION_VERSION
                && projection.utf8Bytes !== candidate.capturedDocumentUtf8Bytes
            ) {
                throw new Error(
                    `Projection byte mismatch for '${candidate.candidateId}' `
                    + `(${projection.utf8Bytes} != ${candidate.capturedDocumentUtf8Bytes}).`,
                );
            }
            documents.set(candidate.candidateId, {
                text: projection.text,
                sha256: sha256Bytes(Buffer.from(projection.text, "utf8")),
                utf8Bytes: projection.utf8Bytes,
                version: projection.version,
                ...(projection.selectedSourceLineCount !== undefined ? {
                    selectedSourceLineCount: projection.selectedSourceLineCount,
                    selectedSourceExcerptCount: projection.selectedSourceExcerptCount,
                    sourceTruncated: projection.sourceTruncated,
                    selectionAttemptCount: projection.selectionAttemptCount,
                } : {}),
            });
        }
    }
    return documents;
}

export function resolveLateOnScoreOutcome({
    elapsedMilliseconds,
    timeoutMilliseconds,
    selectedCandidates,
    scores,
}) {
    const diagnosticRanking = selectedCandidates.map((candidate, index) => ({
        candidateId: candidate.candidateId,
        score: scores[index],
    })).sort((left, right) => (
        right.score - left.score
        || compareContractStrings(left.candidateId, right.candidateId)
    ));
    if (elapsedMilliseconds > timeoutMilliseconds) {
        return {
            status: "deadline_exceeded",
            policyAffected: false,
            fallbackBaselineRequired: true,
            ranking: [],
            diagnosticRanking,
        };
    }
    return {
        status: "scored",
        policyAffected: true,
        fallbackBaselineRequired: false,
        ranking: diagnosticRanking,
        diagnosticRanking,
    };
}

async function scoreTask({
    taskCapture,
    depth,
    sourceRoot,
    analysisService,
    lateOnRuntime,
    timeoutMilliseconds,
    projectionVersion,
}) {
    if (taskCapture.readiness?.route === "exact_registry") {
        return {
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
        };
    }
    const selected = selectTaskCandidates(taskCapture, depth);
    const query = requireString(
        taskCapture.queryPlan?.queryIntent?.semanticQuery,
        `Task '${taskCapture.taskId}' semantic query`,
    );
    const documents = await reconstructDocuments(
        sourceRoot,
        selected.candidates,
        analysisService,
        { projectionVersion, query },
    );
    const documentTexts = selected.candidates.map(
        (candidate) => documents.get(candidate.candidateId).text,
    );
    const started = performance.now();
    const scored = await lateOnRuntime.score(query, documentTexts);
    const elapsedMilliseconds = performance.now() - started;
    const outcome = resolveLateOnScoreOutcome({
        elapsedMilliseconds,
        timeoutMilliseconds,
        selectedCandidates: selected.candidates,
        scores: scored.scores,
    });
    return {
        taskId: taskCapture.taskId,
        split: taskCapture.split,
        queryClass: taskCapture.queryClass,
        ...(taskCapture.safetyControls ? {
            safetyControls: [...taskCapture.safetyControls],
        } : {}),
        route: "fusion",
        ...outcome,
        candidateDepth: depth,
        familyCount: selected.familyCount,
        supplementalCandidateCount: selected.supplementalCandidateCount,
        candidatePoolCount: selected.candidatePoolCount,
        selectedCandidateIds: selected.candidates.map(({ candidateId }) => candidateId),
        projections: selected.candidates.map((candidate) => {
            const projection = documents.get(candidate.candidateId);
            return {
                candidateId: candidate.candidateId,
                sha256: projection.sha256,
                utf8Bytes: projection.utf8Bytes,
                version: projection.version,
                ...(projection.selectedSourceLineCount !== undefined ? {
                    selectedSourceLineCount: projection.selectedSourceLineCount,
                    selectedSourceExcerptCount: projection.selectedSourceExcerptCount,
                    sourceTruncated: projection.sourceTruncated,
                    selectionAttemptCount: projection.selectionAttemptCount,
                } : {}),
            };
        }),
        queryEncoding: {
            retainedTokenCount: scored.query.vectors.length,
            inputIdSha256: sha256Canonical(scored.query.inputIds),
        },
        documentEncodings: selected.candidates.map((candidate, index) => ({
            candidateId: candidate.candidateId,
            retainedTokenCount: scored.documents[index].vectors.length,
            inputIdSha256: sha256Canonical(scored.documents[index].inputIds),
        })),
        elapsedMilliseconds,
    };
}

async function run() {
    const arguments_ = parseR3ScoreArguments(process.argv.slice(2));
    if (arguments_.mode === "prepare_capture_authority") {
        prepareTrackLCaptureAuthority(arguments_);
        return;
    }
    const contractBytes = fs.readFileSync(arguments_.contract);
    const contract = JSON.parse(contractBytes.toString("utf8"));
    let scoringAuthority;
    let runtimeProfileIdentity;
    let manifest;
    if (arguments_.arm) {
        const manifestBytes = fs.readFileSync(arguments_.manifest);
        const runtimeProfileBytes = fs.readFileSync(arguments_["runtime-profile"]);
        manifest = JSON.parse(manifestBytes.toString("utf8"));
        const runtimeProfile = JSON.parse(runtimeProfileBytes.toString("utf8"));
        scoringAuthority = resolveTrackLScoringAuthority({
            manifest,
            expectedManifestSeal: arguments_["manifest-seal"],
            armId: arguments_.arm,
            c0Contract: contract,
            c0ContractSha256: sha256Bytes(contractBytes),
            runtimeProfile,
            runtimeProfileSha256: sha256Bytes(runtimeProfileBytes),
        });
        runtimeProfileIdentity = {
            manifestFileSha256: sha256Bytes(manifestBytes),
            runtimeProfileFileSha256: sha256Bytes(runtimeProfileBytes),
        };
    } else {
        if (contract.r3Projection?.version !== SEARCH_RERANK_DOCUMENT_PROJECTION_VERSION) {
            throw new Error("C0 document projection is incompatible with production.");
        }
        scoringAuthority = {
            armId: `D-L${arguments_.depth}`,
            candidateDepth: arguments_.depth,
            projectionVersion: SEARCH_RERANK_DOCUMENT_PROJECTION_VERSION,
            requestDeadlineMilliseconds: contract.inference.timeoutMilliseconds,
        };
    }
    const runtimeContract = arguments_.arm ? {
        ...contract,
        inference: {
            ...contract.inference,
            executionProvider: scoringAuthority.executionProvider,
            documentBatchSize: scoringAuthority.documentBatchSize,
            intraOpThreads: scoringAuthority.intraOpThreads,
            interOpThreads: scoringAuthority.interOpThreads,
            timeoutMilliseconds: scoringAuthority.requestDeadlineMilliseconds,
        },
    } : contract;
    const positive = loadCapture(arguments_["positive-capture"]);
    const negative = loadCapture(arguments_["negative-capture"]);
    verifyCapturePair(positive, negative);
    let captureAuthorityIdentity;
    if (arguments_.arm) {
        const captureAuthorityBytes = fs.readFileSync(arguments_["capture-authority"]);
        const captureAuthority = JSON.parse(captureAuthorityBytes.toString("utf8"));
        captureAuthorityIdentity = resolveTrackLCaptureAuthority({
            manifest,
            expectedManifestSeal: arguments_["manifest-seal"],
            authority: captureAuthority,
            repositoryId: arguments_["repository-id"],
            positive,
            negative,
        });
        captureAuthorityIdentity.fileSha256 = sha256Bytes(captureAuthorityBytes);
    }
    const tooling = verifyToolingIdentity();
    const source = verifySourceRoot(
        arguments_["source-root"],
        captureAuthorityIdentity?.repository ?? positive.capture.authority.gitRevision,
    );
    const lateOnRuntime = await createLateOnRuntime({
        contract: runtimeContract,
        modelDirectory: path.resolve(arguments_["model-directory"]),
        transformersModule: arguments_["transformers-module"],
        onnxruntimeModule: arguments_["onnxruntime-module"],
    });
    const analysisService = createLanguageAnalysisService();
    const allTaskCaptures = [...positive.capture.captures, ...negative.capture.captures];
    const taskCaptures = selectR3ScoreTasks(allTaskCaptures, arguments_["task-id"]);
    const tasks = [];
    try {
        for (const taskCapture of taskCaptures) {
            const task = await scoreTask({
                taskCapture,
                depth: scoringAuthority.candidateDepth,
                sourceRoot: source.absoluteRoot,
                analysisService,
                lateOnRuntime,
                timeoutMilliseconds: scoringAuthority.requestDeadlineMilliseconds,
                projectionVersion: scoringAuthority.projectionVersion,
            });
            tasks.push(task);
        }
    } finally {
        await lateOnRuntime.dispose();
    }
    const fusionTimings = tasks
        .filter((task) => task.route === "fusion")
        .map((task) => task.elapsedMilliseconds);
    const retainedRssBytes = process.memoryUsage().rss;
    const processPeakRssBytes = process.resourceUsage().maxRSS * 1024;
    const legacyRejectionReasons = [
        ...(tasks.some((task) => task.status === "deadline_exceeded")
            ? ["query_deadline_exceeded"]
            : []),
        ...(fusionTimings[0] > contract.resourceBudgets.maximumColdD16Milliseconds
            ? ["cold_latency_budget_exceeded"]
            : []),
        ...(processPeakRssBytes > contract.resourceBudgets.maximumProcessPeakRssBytes
            ? ["peak_rss_budget_exceeded"]
            : []),
    ];
    const warmP95Milliseconds = percentile95(fusionTimings.slice(1));
    const trackLRejectionReasons = [
        ...(tasks.some((task) => task.status === "deadline_exceeded")
            ? ["query_deadline_exceeded"]
            : []),
        ...(lateOnRuntime.loadResources.modelLoadMilliseconds
            > scoringAuthority.maximumModelLoadMilliseconds
            ? ["model_load_budget_exceeded"]
            : []),
        ...(warmP95Milliseconds === null
            || warmP95Milliseconds > scoringAuthority.maximumWarmP95Milliseconds
            ? ["warm_latency_budget_exceeded"]
            : []),
        ...(processPeakRssBytes > scoringAuthority.maximumProcessPeakRssBytes
            ? ["peak_rss_budget_exceeded"]
            : []),
        ...(retainedRssBytes > scoringAuthority.maximumProcessRetainedRssBytes
            ? ["retained_rss_budget_exceeded"]
            : []),
    ];
    const rejectionReasons = arguments_.arm
        ? trackLRejectionReasons
        : legacyRejectionReasons;
    const result = {
        schemaVersion: arguments_.arm ? TRACK_L_RESULT_SCHEMA : RESULT_SCHEMA,
        contenderId: scoringAuthority.armId,
        candidateDepth: scoringAuthority.candidateDepth,
        contract: {
            sha256: sha256Bytes(contractBytes),
            checkpoint: contract.checkpoint,
            projectionVersion: scoringAuthority.projectionVersion,
            ...(arguments_.arm ? {
                manifestSeal: scoringAuthority.manifestSeal,
                queryFormatting: scoringAuthority.queryFormatting,
                ownerFamilyAdmission: scoringAuthority.ownerFamilyAdmission,
                resourceProfile: {
                    profile: scoringAuthority.profile,
                    maximumModelLoadMilliseconds:
                        scoringAuthority.maximumModelLoadMilliseconds,
                    maximumWarmP95Milliseconds:
                        scoringAuthority.maximumWarmP95Milliseconds,
                    requestDeadlineMilliseconds:
                        scoringAuthority.requestDeadlineMilliseconds,
                    maximumProcessPeakRssBytes:
                        scoringAuthority.maximumProcessPeakRssBytes,
                    maximumProcessRetainedRssBytes:
                        scoringAuthority.maximumProcessRetainedRssBytes,
                    documentBatchSize: scoringAuthority.documentBatchSize,
                    intraOpThreads: scoringAuthority.intraOpThreads,
                    interOpThreads: scoringAuthority.interOpThreads,
                    executionProvider: scoringAuthority.executionProvider,
                },
                ...runtimeProfileIdentity,
                repositoryId: arguments_["repository-id"],
                captureAuthority: {
                    sha256: captureAuthorityIdentity.sha256,
                    fileSha256: captureAuthorityIdentity.fileSha256,
                    aggregateCaptureSha256:
                        captureAuthorityIdentity.aggregateCaptureSha256,
                },
            } : {}),
        },
        modelRuntime: lateOnRuntime.identity,
        modelLoadResources: lateOnRuntime.loadResources,
        tooling,
        source,
        captures: [positive, negative].map((capture) => ({
            fileName: capture.fileName,
            fileSha256: capture.fileSha256,
            captureSha256: capture.capture.sha256,
            baselineReplaySha256: capture.replaySha256,
        })),
        authority: positive.capture.authority,
        tasks,
        resources: {
            processPeakRssBytes,
            retainedRssBytes,
            coldFirstFusionTaskMilliseconds: fusionTimings[0] ?? 0,
            warmFusionTaskMilliseconds: fusionTimings.slice(1),
            warmP95Milliseconds,
        },
        qualification: {
            passed: rejectionReasons.length === 0,
            rejectionReasons,
            allOrNothingFallbackPreserved: tasks
                .filter((task) => task.status === "deadline_exceeded")
                .every((task) => task.ranking.length === 0 && task.policyAffected === false),
        },
    };
    const signed = { ...result, sha256: sha256Canonical(result) };
    fs.writeFileSync(arguments_.output, `${JSON.stringify(signed, null, 2)}\n`, "utf8");
}

const isDirectExecution = process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
    run().catch((error) => {
        console.error(error instanceof Error ? error.stack : String(error));
        process.exitCode = 1;
    });
}
