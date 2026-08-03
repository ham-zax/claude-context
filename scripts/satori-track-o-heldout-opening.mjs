#!/usr/bin/env node
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./satori-useful-context.mjs";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;

export const TRACK_O_O0_AUTHORITY_SHA256 =
    "b1db9ac92597ce625746b2812f294afa99b0d4f6d00a2b2e321e3a976c0d30b2";
export const TRACK_O_MANIFEST_FILE_SHA256 =
    "281c5354d98c42e8d576e607de50046230e7d31ca4059a6d77d89e7454b1db09";
export const TRACK_O_MANIFEST_SEAL_SHA256 =
    "05fb273715d6205bcdf5adc1fdec94a892d8b40fc651a386ab36ccfb9475b7bc";
export const TRACK_O_PROFILE_ID = "lateon_offline_quality_projection_v2_d32_v1";
export const TRACK_O_CANDIDATE_ID = "projection-v2-d-l32";
const TRACK_O_CANDIDATE = Object.freeze({
    id: TRACK_O_CANDIDATE_ID,
    candidateDepth: 32,
    projection: {
        id: "search_rerank_document_v2",
        sha256: "635b0a683b2a1c7dec8b6f0822f21e750724d5d4d18503eee112c4dbd242d687",
    },
    model: {
        repository: "lightonai/LateOn-Code-edge",
        revision: "07ef20f406c86badca122464808f4cac2f6e4b25",
    },
    artifacts: [
        { role: "onnx_fp32", path: "model.onnx", sha256: "ac5a92a685512b163c3c591438f518379309d2a98c4818a9c6e2986f789dc8ef" },
        { role: "tokenizer", path: "tokenizer.json", sha256: "a388b94942e98e5c661c6c23f919842285738bfd123a0d148dea0c56287505d0" },
        { role: "tokenizer_config", path: "tokenizer_config.json", sha256: "1621afee1f3dbc2c42901841ca46016c83102a8e070d32b90f80f80b214172a4" },
        { role: "onnx_config", path: "onnx_config.json", sha256: "fa4fef89820dcdc33c5504c62c1d5efc19603cfbfebf02368a70d51a4dbe6651" },
        { role: "special_tokens", path: "special_tokens_map.json", sha256: "6edfb9d64c0d7e5cbaa53516e90280fe1f42ba5ea7923d005a5f9b6e082142cf" },
    ],
});

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, label) {
    if (!isRecord(value)) throw new Error(`${label} must be an object.`);
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
    if (!REVISION_PATTERN.test(revision)) {
        throw new Error(`${label} must be a full Git revision.`);
    }
    return revision;
}

function requireEqual(actual, expected, label) {
    if (canonicalJson(actual) !== canonicalJson(expected)) {
        throw new Error(`${label} does not match the frozen Track O authority.`);
    }
    return actual;
}

function requireExactKeys(value, keys, label) {
    const actual = Object.keys(requireRecord(value, label)).sort();
    requireEqual(actual, [...keys].sort(), `${label} keys`);
    return value;
}

export function sha256Bytes(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

export function sha256Canonical(value) {
    return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}

function readJsonFile(file, label) {
    const bytes = fs.readFileSync(file);
    let value;
    try {
        value = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
        throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { bytes, value: requireRecord(value, label) };
}

function unsignedDigest(value, label) {
    const record = requireRecord(value, label);
    const supplied = requireSha256(record.sha256, `${label}.sha256`);
    const { sha256: _ignored, ...unsigned } = record;
    const computed = sha256Canonical(unsigned);
    if (supplied !== computed) throw new Error(`${label} digest does not match its contents.`);
    return supplied;
}

function normalizeO0Artifacts(authority) {
    if (!Array.isArray(authority.candidate?.artifacts) || authority.candidate.artifacts.length === 0) {
        throw new Error("O0 candidate artifacts must be non-empty.");
    }
    return authority.candidate.artifacts.map((artifact, index) => ({
        role: requireString(artifact.role, `O0 candidate artifact ${index + 1} role`),
        path: requireString(artifact.path, `O0 candidate artifact ${index + 1} path`),
        sha256: requireSha256(artifact.sha256, `O0 candidate artifact ${index + 1} sha256`),
    }));
}

function validateO0Authority(authority, authorityFileSha256, expectedO0AuthoritySha256) {
    if (authorityFileSha256 !== expectedO0AuthoritySha256) {
        throw new Error("O0 authority file digest does not match the sealed Track O authority.");
    }
    if (authority.version !== 1
        || authority.kind !== "satori_lateon_track_o_authority"
        || authority.phase !== "O0"
        || authority.status !== "prospective_authority_outputs_unopened") {
        throw new Error("O0 authority identity or unopened state is invalid.");
    }
    const manifest = requireRecord(authority.heldOutDecision?.manifest, "O0 held-out manifest");
    const profile = requireRecord(authority.qualifiedServiceProfile, "O0 qualified service profile");
    if (manifest.version !== 3
        || authority.candidate?.id !== TRACK_O_CANDIDATE_ID
        || authority.candidate?.candidateDepth !== 32
        || profile.id !== TRACK_O_PROFILE_ID
        || authority.heldOutDecision?.split !== "held_out"
        || authority.heldOutDecision?.opening?.requiresPassingO2Receipt !== true
        || authority.heldOutDecision?.opening?.durableExclusiveOneTimeRecord !== true
        || authority.heldOutDecision?.opening?.failureConsumesOpening !== true) {
        throw new Error("O0 authority does not authorize the frozen unopened D32 flow.");
    }
    requireEqual(authority.state, {
        o2MeasurementsOpened: false,
        heldOutIndexCreatedOrQueried: false,
        heldOutCaptureCreated: false,
        heldOutScoresOpened: false,
        productionActivated: false,
    }, "O0 unopened state");
    return {
        manifestFileSha256: requireSha256(manifest.fileSha256, "O0 manifest fileSha256"),
        manifestSealSha256: requireSha256(
            manifest.canonicalSealSha256,
            "O0 manifest canonicalSealSha256",
        ),
        profile,
        artifacts: normalizeO0Artifacts(authority),
    };
}

function validateOpaqueManifest(manifestBytes, authority) {
    const fileSha256 = sha256Bytes(manifestBytes);
    if (fileSha256 !== authority.manifestFileSha256) {
        throw new Error("Track O held-out manifest file digest does not match O0.");
    }
    return {
        fileSha256,
        canonicalSealSha256: authority.manifestSealSha256,
    };
}

function validateProfile(profile, profileBytes, o0Authority) {
    if (profile.schemaVersion !== "satori_lateon_runtime_profile_v2"
        || profile.profileId !== TRACK_O_PROFILE_ID
        || profile.qualificationStatus !== "disabled_track_o_candidate"
        || profile.inference?.candidateDepth !== 32) {
        throw new Error("Runtime profile is not the frozen Track O D32 profile.");
    }
    requireEqual(profile.identity?.repository, o0Authority.candidate.model.repository, "Profile model repository");
    requireEqual(profile.identity?.revision, o0Authority.candidate.model.revision, "Profile model revision");
    requireEqual(profile.identity?.projectionVersion, o0Authority.candidate.projection.id, "Profile projection");
    requireEqual(profile.identity?.projectionSha256, o0Authority.candidate.projection.sha256, "Profile projection digest");
    requireEqual(
        profile.artifacts,
        o0Authority.candidate.artifacts.map(({ path: artifactPath, sha256 }) => ({
            path: artifactPath,
            sha256,
        })),
        "Profile model artifacts",
    );
    requireEqual(profile.inference?.queryTokenLimit, 256, "Profile query token limit");
    requireEqual(profile.inference?.documentTokenLimit, 2048, "Profile document token limit");
    requireEqual(profile.inference?.documentBatchSize, 1, "Profile document batch size");
    requireEqual(profile.inference?.profileIntraOpThreads, 8, "Profile intra-op threads");
    requireEqual(profile.inference?.interOpThreads, 1, "Profile inter-op threads");
    const effectiveOperationalBounds = {
        maximumActiveReranks: profile.operationalBounds?.maximumActiveReranks,
        maximumQueuedReranks: profile.operationalBounds?.maximumQueuedReranks,
        maximumQueueWaitMilliseconds:
            profile.operationalBounds?.maximumQueueWaitMilliseconds,
        maximumScoreMilliseconds: profile.operationalBounds?.maximumScoreMilliseconds,
        maximumRerankerStageMilliseconds:
            profile.operationalBounds?.maximumRerankerStageMilliseconds,
    };
    return {
        id: profile.profileId,
        assetFileSha256: sha256Bytes(profileBytes),
        assetCanonicalSha256: sha256Canonical(profile),
        effectiveIdentitySha256: sha256Canonical({
            profile,
            effectiveOperationalBounds,
            intraOpThreads: profile.inference.profileIntraOpThreads,
        }),
    };
}

function resolveGitSourceIdentity(repoRoot) {
    const read = (args) => execFileSync("git", ["-C", repoRoot, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const status = read(["status", "--porcelain=v1", "--untracked-files=all"]);
    if (status) {
        throw new Error("Track O held-out opening requires the clean O2 source worktree.");
    }
    return {
        revision: read(["rev-parse", "HEAD"]),
        tree: read(["rev-parse", "HEAD^{tree}"]),
    };
}

function validateFilesAgainstBindings(root, bindings, label) {
    const canonicalRoot = fs.realpathSync(root);
    for (const binding of bindings) {
        const relativePath = requireString(binding.path, `${label} path`);
        const file = path.resolve(canonicalRoot, relativePath);
        const relative = path.relative(canonicalRoot, file);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
            throw new Error(`${label} path '${relativePath}' escapes its authority root.`);
        }
        const expected = requireSha256(binding.sha256, `${label} '${relativePath}' sha256`);
        if (sha256Bytes(fs.readFileSync(file)) !== expected) {
            throw new Error(`${label} '${relativePath}' digest does not match its receipt.`);
        }
    }
}

const O2_OBSERVATION_KEYS = Object.freeze([
    "processColdReadiness",
    "coldFirstScore",
    "warmScore",
    "queueSaturation",
    "queuedCancellation",
    "executingCancellation",
    "activeAndQueuedShutdown",
    "malformedOutput",
    "workerFailure",
]);

const O2_OBSERVATION_COUNT_FIELDS = Object.freeze({
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

const O2_GATE_KEYS = Object.freeze([
    "authorityIdentity",
    "modelArtifactIdentity",
    "sourceIdentity",
    "tuningRequestReconstruction",
    "processColdFailures",
    "processColdReadinessP95",
    "processColdReadinessMaximum",
    "coldFirstScoreMaximum",
    "warmScoreP95",
    "warmScoreMaximum",
    "rerankerStageMaximum",
    "peakRss",
    "retainedRss",
    "invalidOrIncompleteOrders",
    "candidateMembership",
    "eligibility",
    "groupIdentity",
    "paginationExactMustControls",
    "fallbackResultState",
    "lifecycleLeaks",
    "scenarioCounts",
]);

function validateO2QualificationEvidence(evidence, evidenceBytes, inputs) {
    requireExactKeys(evidence, [
        "schemaVersion",
        "status",
        "result",
        "sourceRevision",
        "sourceTree",
        "targetHostIdentitySha256",
        "authority",
        "profile",
        "candidate",
        "tuningRequestSet",
        "methodology",
        "observations",
        "resources",
        "gates",
        "implementationArtifacts",
        "sha256",
    ], "O2 qualification evidence");
    const resultSha256 = unsignedDigest(evidence, "O2 qualification evidence");
    if (evidence.schemaVersion !== "satori_lateon_track_o_o2_evidence_v1"
        || evidence.status !== "passed"
        || evidence.result !== "passed") {
        throw new Error("O2 qualification evidence is not passing.");
    }
    requireEqual(evidence.sourceRevision, inputs.sourceIdentity.revision, "O2 evidence source revision");
    requireEqual(evidence.sourceTree, inputs.sourceIdentity.tree, "O2 evidence source tree");
    requireEqual(
        evidence.targetHostIdentitySha256,
        sha256Canonical(inputs.o0Authority.targetHost),
        "O2 evidence target host",
    );
    requireEqual(evidence.authority, {
        o0AuthoritySha256: inputs.o0AuthoritySha256,
        manifestFileSha256: inputs.manifest.fileSha256,
        manifestCanonicalSealSha256: inputs.manifest.canonicalSealSha256,
    }, "O2 evidence authority");
    requireEqual(evidence.profile, inputs.profile, "O2 evidence profile");
    requireEqual(evidence.candidate, inputs.candidate, "O2 evidence candidate");

    const frozenCounts = requireRecord(
        inputs.o0Authority.operationalQualification?.observationCounts,
        "O0 observation counts",
    );
    const methodology = requireRecord(evidence.methodology, "O2 evidence methodology");
    requireEqual(methodology.observationCounts, frozenCounts, "O2 evidence observation counts");
    const observations = requireRecord(evidence.observations, "O2 evidence observations");
    requireExactKeys(observations, O2_OBSERVATION_KEYS, "O2 evidence observations");
    for (const observationKey of O2_OBSERVATION_KEYS) {
        const rows = observations[observationKey];
        if (!Array.isArray(rows)) {
            throw new Error(`O2 evidence observation '${observationKey}' must be an array.`);
        }
        const countField = O2_OBSERVATION_COUNT_FIELDS[observationKey];
        if (rows.length !== frozenCounts[countField]) {
            throw new Error(`O2 evidence observation '${observationKey}' count is incomplete.`);
        }
        rows.forEach((row, index) => {
            const record = requireRecord(row, `O2 ${observationKey} observation ${index + 1}`);
            const supplied = requireSha256(
                record.observationSha256,
                `O2 ${observationKey} observation ${index + 1} digest`,
            );
            const { observationSha256: _ignored, ...unsigned } = record;
            if (supplied !== sha256Canonical(unsigned)) {
                throw new Error(`O2 ${observationKey} observation ${index + 1} digest mismatch.`);
            }
        });
    }

    const gates = requireRecord(evidence.gates, "O2 evidence gates");
    requireExactKeys(gates, O2_GATE_KEYS, "O2 evidence gates");
    for (const gateName of O2_GATE_KEYS) {
        const gate = requireRecord(gates[gateName], `O2 evidence gate '${gateName}'`);
        requireExactKeys(gate, ["passed", "actual", "limit"], `O2 evidence gate '${gateName}'`);
        if (gate.passed !== true) throw new Error(`O2 evidence gate '${gateName}' did not pass.`);
    }
    const bounds = inputs.o0Authority.qualifiedServiceProfile.operationalBounds;
    const expectedLimits = {
        processColdFailures: 0,
        processColdReadinessP95: bounds.maximumReadinessP95Milliseconds,
        processColdReadinessMaximum: bounds.maximumReadinessMilliseconds,
        coldFirstScoreMaximum: bounds.maximumColdFirstScoreMilliseconds,
        warmScoreP95: bounds.maximumWarmScoreP95Milliseconds,
        warmScoreMaximum: bounds.maximumScoreMilliseconds,
        rerankerStageMaximum: bounds.maximumRerankerStageMilliseconds,
        peakRss: bounds.maximumProcessPeakRssBytes,
        retainedRss: bounds.maximumProcessRetainedRssBytes,
        invalidOrIncompleteOrders: bounds.maximumInvalidOrIncompleteOrders,
        candidateMembership: 0,
        eligibility: 0,
        groupIdentity: 0,
        paginationExactMustControls: 0,
        fallbackResultState: 0,
        lifecycleLeaks: 0,
        scenarioCounts: frozenCounts,
    };
    for (const [gateName, limit] of Object.entries(expectedLimits)) {
        requireEqual(gates[gateName].limit, limit, `O2 evidence gate '${gateName}' limit`);
    }
    requireEqual(
        evidence.implementationArtifacts,
        inputs.implementationArtifacts,
        "O2 evidence implementation artifacts",
    );
    return {
        fileSha256: sha256Bytes(evidenceBytes),
        resultSha256,
    };
}

function validateO2Receipt(receipt, inputs) {
    requireExactKeys(receipt, [
        "version",
        "kind",
        "stage",
        "status",
        "operationalQualificationResult",
        "sourceRevision",
        "sourceTree",
        "targetHostIdentitySha256",
        "authority",
        "profile",
        "candidate",
        "implementationArtifacts",
        "qualificationEvidence",
        "sha256",
    ], "O2 operational qualification receipt");
    const receiptSha256 = unsignedDigest(receipt, "O2 operational qualification receipt");
    if (receipt.version !== 1
        || receipt.kind !== "satori_lateon_track_o_operational_qualification_receipt"
        || receipt.stage !== "O2"
        || receipt.status !== "passed"
        || receipt.operationalQualificationResult !== "passed") {
        throw new Error("O2 receipt is not a passing Track O operational qualification receipt.");
    }
    requireEqual(
        requireRevision(receipt.sourceRevision, "O2 receipt sourceRevision"),
        requireRevision(inputs.sourceIdentity.revision, "Current source revision"),
        "O2 source revision",
    );
    requireEqual(
        requireRevision(receipt.sourceTree, "O2 receipt sourceTree"),
        requireRevision(inputs.sourceIdentity.tree, "Current source tree"),
        "O2 source tree",
    );
    const expectedHostIdentity = sha256Canonical(inputs.o0Authority.targetHost);
    requireEqual(
        requireSha256(receipt.targetHostIdentitySha256, "O2 targetHostIdentitySha256"),
        expectedHostIdentity,
        "O2 target-host identity",
    );
    requireEqual(receipt.authority, {
        o0AuthoritySha256: inputs.o0AuthoritySha256,
        manifestFileSha256: inputs.manifest.fileSha256,
        manifestCanonicalSealSha256: inputs.manifest.canonicalSealSha256,
    }, "O2 authority binding");
    requireEqual(receipt.profile, inputs.profile, "O2 D32 profile binding");
    requireEqual(receipt.candidate, {
        id: TRACK_O_CANDIDATE_ID,
        candidateDepth: 32,
        projection: {
            id: inputs.o0Authority.candidate.projection.id,
            sha256: inputs.o0Authority.candidate.projection.sha256,
        },
        model: {
            repository: inputs.o0Authority.candidate.model.repository,
            revision: inputs.o0Authority.candidate.model.revision,
        },
        artifacts: inputs.o0Artifacts,
    }, "O2 D32 candidate binding");
    const implementation = requireRecord(receipt.implementationArtifacts, "O2 implementationArtifacts");
    const requiredRoles = ["projectionSource", "runtimeSource", "measurementScript"];
    requireEqual(Object.keys(implementation).sort(), [...requiredRoles].sort(), "O2 implementation artifact roles");
    const implementationBindings = requiredRoles.map((role) => ({
        role,
        path: requireString(implementation[role]?.path, `O2 ${role} path`),
        sha256: requireSha256(implementation[role]?.sha256, `O2 ${role} sha256`),
    }));
    requireEqual(
        implementation,
        inputs.qualificationEvidenceImplementationArtifacts,
        "O2 receipt and evidence implementation artifacts",
    );
    validateFilesAgainstBindings(inputs.repoRoot, implementationBindings, "O2 implementation artifact");
    const evidenceBinding = requireRecord(
        receipt.qualificationEvidence,
        "O2 qualification evidence binding",
    );
    requireExactKeys(evidenceBinding, [
        "schemaVersion",
        "fileSha256",
        "resultSha256",
    ], "O2 qualification evidence binding");
    if (evidenceBinding.schemaVersion !== "satori_lateon_track_o_o2_evidence_v1") {
        throw new Error("O2 qualification evidence schema is unsupported.");
    }
    requireEqual(
        requireSha256(evidenceBinding.fileSha256, "O2 qualification evidence file digest"),
        inputs.qualificationEvidence.fileSha256,
        "O2 qualification evidence file binding",
    );
    requireEqual(
        requireSha256(evidenceBinding.resultSha256, "O2 qualification evidence result digest"),
        inputs.qualificationEvidence.resultSha256,
        "O2 qualification evidence result binding",
    );
    return { receiptSha256, implementationBindings, evidenceBinding };
}

function assertMarkerOutsideRepository(markerFile, repoRoot) {
    const canonicalRoot = fs.realpathSync(repoRoot);
    const canonicalParent = fs.realpathSync(path.dirname(markerFile));
    const resolvedMarker = path.join(canonicalParent, path.basename(markerFile));
    const relative = path.relative(canonicalRoot, resolvedMarker);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
        throw new Error("Track O opening marker must be outside the repository.");
    }
    return resolvedMarker;
}

function fsyncParentDirectory(file) {
    let descriptor;
    try {
        descriptor = fs.openSync(path.dirname(file), "r");
        fs.fsyncSync(descriptor);
    } catch (error) {
        if (!(["EINVAL", "ENOTSUP", "EPERM"].includes(error?.code))) throw error;
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
    }
}

function createTrackOHeldOutOpeningRecord(bindings, openedAt = new Date().toISOString()) {
    const normalizedOpenedAt = requireString(openedAt, "Track O opening timestamp");
    if (new Date(normalizedOpenedAt).toISOString() !== normalizedOpenedAt) {
        throw new Error("Track O opening timestamp must be a canonical ISO timestamp.");
    }
    const record = {
        version: 1,
        kind: "satori_lateon_track_o_held_out_opening",
        status: "consumed_authorized",
        openedAt: normalizedOpenedAt,
        authority: {
            o0AuthoritySha256: bindings.o0AuthoritySha256,
            o2ReceiptSha256: bindings.o2ReceiptSha256,
            manifestFileSha256: bindings.manifest.fileSha256,
            manifestCanonicalSealSha256: bindings.manifest.canonicalSealSha256,
        },
        candidate: bindings.candidate,
        profile: bindings.profile,
        implementationArtifacts: bindings.implementationArtifacts,
        postOpenBindingsRequired: [
            "index_and_publication_identities",
            "candidate_capture_sha256",
            "baseline_replay_sha256",
            "d32_score_sha256",
            "evaluator_sha256",
        ],
    };
    return { ...record, sha256: sha256Canonical(record) };
}

export function validateTrackOHeldOutOpeningRecord(value, options = {}) {
    const record = requireRecord(value, "Track O held-out opening record");
    requireExactKeys(record, [
        "version",
        "kind",
        "status",
        "openedAt",
        "authority",
        "candidate",
        "profile",
        "implementationArtifacts",
        "postOpenBindingsRequired",
        "sha256",
    ], "Track O held-out opening record");
    const digest = unsignedDigest(record, "Track O held-out opening record");
    if (record.version !== 1
        || record.kind !== "satori_lateon_track_o_held_out_opening"
        || record.status !== "consumed_authorized") {
        throw new Error("Track O held-out opening record identity or status is invalid.");
    }
    const expectedO0AuthoritySha256 = options.expectedO0AuthoritySha256
        ?? TRACK_O_O0_AUTHORITY_SHA256;
    const expectedManifestFileSha256 = options.expectedManifestFileSha256
        ?? TRACK_O_MANIFEST_FILE_SHA256;
    const expectedManifestSealSha256 = options.expectedManifestSealSha256
        ?? TRACK_O_MANIFEST_SEAL_SHA256;
    const expectedCandidate = options.expectedCandidate ?? TRACK_O_CANDIDATE;
    const expectedProfileId = options.expectedProfileId ?? TRACK_O_PROFILE_ID;
    requireEqual(record.authority?.o0AuthoritySha256, expectedO0AuthoritySha256, "Opening O0 binding");
    requireEqual(record.authority?.manifestFileSha256, expectedManifestFileSha256, "Opening manifest file binding");
    requireEqual(record.authority?.manifestCanonicalSealSha256, expectedManifestSealSha256, "Opening manifest seal binding");
    requireSha256(record.authority?.o2ReceiptSha256, "Opening O2 receipt binding");
    requireEqual(record.candidate, expectedCandidate, "Opening candidate binding");
    const normalizedOpenedAt = requireString(record.openedAt, "Opening timestamp");
    if (new Date(normalizedOpenedAt).toISOString() !== normalizedOpenedAt) {
        throw new Error("Opening timestamp must be a canonical ISO timestamp.");
    }
    requireExactKeys(record.profile, [
        "id",
        "assetFileSha256",
        "assetCanonicalSha256",
        "effectiveIdentitySha256",
    ], "Opening profile binding");
    requireEqual(record.profile?.id, expectedProfileId, "Opening profile ID");
    requireSha256(record.profile?.assetFileSha256, "Opening profile file binding");
    requireSha256(record.profile?.assetCanonicalSha256, "Opening profile canonical binding");
    requireSha256(record.profile?.effectiveIdentitySha256, "Opening effective profile binding");
    requireEqual(record.postOpenBindingsRequired, [
        "index_and_publication_identities",
        "candidate_capture_sha256",
        "baseline_replay_sha256",
        "d32_score_sha256",
        "evaluator_sha256",
    ], "Opening post-open binding contract");
    return { ...record, sha256: digest };
}

export function readTrackOHeldOutOpeningRecord(file, options = {}) {
    return validateTrackOHeldOutOpeningRecord(
        readJsonFile(file, "Track O opening record").value,
        options,
    );
}

export function bindTrackOHeldOutOpening(value, openingRecord) {
    const opening = validateTrackOHeldOutOpeningRecord(openingRecord);
    const { sha256: _ignored, ...unsigned } = requireRecord(value, "Track O held-out artifact");
    const bound = { ...unsigned, heldOutOpeningSha256: opening.sha256 };
    return { ...bound, sha256: sha256Canonical(bound) };
}

export function openTrackOHeldOut(input, options = {}) {
    const repoRoot = fs.realpathSync(input.repoRoot);
    const markerFile = assertMarkerOutsideRepository(path.resolve(input.markerFile), repoRoot);
    if (fs.existsSync(markerFile)) {
        throw new Error("Track O held-out opening is already consumed.");
    }
    const o0 = readJsonFile(input.o0AuthorityFile, "O0 Track O authority");
    const expectedO0AuthoritySha256 = options.expectedO0AuthoritySha256
        ?? TRACK_O_O0_AUTHORITY_SHA256;
    const o0AuthoritySha256 = sha256Bytes(o0.bytes);
    const o0Bindings = validateO0Authority(o0.value, o0AuthoritySha256, expectedO0AuthoritySha256);
    const manifestBytes = fs.readFileSync(input.manifestFile);
    const manifest = validateOpaqueManifest(manifestBytes, o0Bindings);
    const profileSource = readJsonFile(input.profileFile, "Track O D32 runtime profile");
    const profile = validateProfile(profileSource.value, profileSource.bytes, o0.value);
    validateFilesAgainstBindings(input.modelRoot, o0Bindings.artifacts, "Track O model artifact");
    const sourceIdentity = options.sourceIdentity ?? resolveGitSourceIdentity(repoRoot);
    const qualificationEvidenceSource = readJsonFile(
        input.o2EvidenceFile,
        "O2 operational qualification evidence",
    );
    const candidate = {
        id: TRACK_O_CANDIDATE_ID,
        candidateDepth: 32,
        projection: {
            id: o0.value.candidate.projection.id,
            sha256: o0.value.candidate.projection.sha256,
        },
        model: {
            repository: o0.value.candidate.model.repository,
            revision: o0.value.candidate.model.revision,
        },
        artifacts: o0Bindings.artifacts,
    };
    const qualificationEvidence = validateO2QualificationEvidence(
        qualificationEvidenceSource.value,
        qualificationEvidenceSource.bytes,
        {
            sourceIdentity,
            o0Authority: o0.value,
            o0AuthoritySha256,
            manifest,
            profile,
            candidate,
            implementationArtifacts:
                qualificationEvidenceSource.value.implementationArtifacts,
        },
    );
    const o2 = readJsonFile(input.o2ReceiptFile, "O2 operational qualification receipt");
    const o2Binding = validateO2Receipt(o2.value, {
        repoRoot,
        o0Authority: o0.value,
        o0AuthoritySha256,
        o0Artifacts: o0Bindings.artifacts,
        manifest,
        profile,
        sourceIdentity,
        qualificationEvidence,
        qualificationEvidenceImplementationArtifacts:
            qualificationEvidenceSource.value.implementationArtifacts,
    });
    const opening = createTrackOHeldOutOpeningRecord({
        o0AuthoritySha256,
        o2ReceiptSha256: o2Binding.receiptSha256,
        manifest,
        profile,
        candidate: o2.value.candidate,
        implementationArtifacts: o2Binding.implementationBindings,
    }, options.openedAt);
    let descriptor;
    try {
        descriptor = fs.openSync(markerFile, "wx", 0o600);
        fs.writeFileSync(descriptor, `${JSON.stringify(opening, null, 2)}\n`, "utf8");
        fs.fsyncSync(descriptor);
    } catch (error) {
        if (error?.code === "EEXIST") {
            throw new Error("Track O held-out opening is already consumed.");
        }
        throw error;
    } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
    }
    fsyncParentDirectory(markerFile);
    return opening;
}

function usage() {
    return "Usage: node scripts/satori-track-o-heldout-opening.mjs --repo-root <repository> --manifest <manifest.json> --o0-authority <authority.json> --o2-receipt <receipt.json> --o2-evidence <evidence.json> --profile <profile.json> --model-root <model-directory> --marker <external-opening.json>";
}

export function main(argv = process.argv.slice(2)) {
    const input = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--help") {
            process.stdout.write(`${usage()}\n`);
            return null;
        }
        const value = argv[++index];
        if (!value) throw new Error(`Missing value after ${arg}.`);
        if (arg === "--repo-root") input.repoRoot = path.resolve(value);
        else if (arg === "--manifest") input.manifestFile = path.resolve(value);
        else if (arg === "--o0-authority") input.o0AuthorityFile = path.resolve(value);
        else if (arg === "--o2-receipt") input.o2ReceiptFile = path.resolve(value);
        else if (arg === "--o2-evidence") input.o2EvidenceFile = path.resolve(value);
        else if (arg === "--profile") input.profileFile = path.resolve(value);
        else if (arg === "--model-root") input.modelRoot = path.resolve(value);
        else if (arg === "--marker") input.markerFile = path.resolve(value);
        else throw new Error(`Unknown argument: ${arg}`);
    }
    for (const field of [
        "repoRoot",
        "manifestFile",
        "o0AuthorityFile",
        "o2ReceiptFile",
        "o2EvidenceFile",
        "profileFile",
        "modelRoot",
        "markerFile",
    ]) {
        if (!input[field]) throw new Error(`${field} is required.`);
    }
    const opening = openTrackOHeldOut(input);
    process.stdout.write(`${JSON.stringify(opening, null, 2)}\n`);
    return opening;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`satori-track-o-heldout-opening: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
        process.exitCode = 1;
    }
}
