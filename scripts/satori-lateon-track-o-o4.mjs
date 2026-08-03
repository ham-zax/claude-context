#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
    TRACK_O_CANDIDATE_ID,
    TRACK_O_MANIFEST_FILE_SHA256,
    TRACK_O_MANIFEST_SEAL_SHA256,
    TRACK_O_O0_AUTHORITY_SHA256,
    TRACK_O_PROFILE_ID,
} from "./satori-track-o-heldout-opening.mjs";
import { canonicalJson } from "./satori-useful-context.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const O3_KIND = "satori_lateon_track_o_o3_held_out_adjudication_receipt";
const O4_KIND = "satori_lateon_track_o_o4_activation_decision_receipt";
const SCORER_ID = "satori_lateon_track_o_o3_d32_scorer_v1";
const QUALIFIED = "offline_lateon_held_out_qualified_retained_disabled";
const REJECTED = "offline_lateon_rejected_by_held_out";
const INSUFFICIENT = "offline_lateon_insufficient_held_out_evidence";
const OUTCOME_STATUS = Object.freeze({
    [QUALIFIED]: "passed",
    [REJECTED]: "rejected",
    [INSUFFICIENT]: "insufficient_evidence",
});
const O4_STATUS = Object.freeze({
    [QUALIFIED]: "retained_disabled",
    [REJECTED]: "rejected",
    [INSUFFICIENT]: "insufficient_evidence",
});
const PRACTICAL_GATES = Object.freeze([
    "ownerAt3",
    "reciprocalRank",
    "ownerAt1",
    "ownerAt10",
    "hardNegativeExposureAt3",
    "unacceptableOwnerExposureAt3",
]);
const CONFIDENCE_GATES = PRACTICAL_GATES;
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

function requireEqual(actual, expected, label) {
    if (canonicalJson(actual) !== canonicalJson(expected)) {
        throw new Error(`${label} is incompatible.`);
    }
    return actual;
}

function requireExactKeys(value, expectedKeys, label) {
    const keys = Object.keys(requireRecord(value, label)).sort();
    requireEqual(keys, [...expectedKeys].sort(), `${label} keys`);
    return value;
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

function validateBooleanGates(value, expectedKeys, label) {
    const gates = requireExactKeys(value, expectedKeys, label);
    for (const key of expectedKeys) {
        if (typeof gates[key] !== "boolean") throw new Error(`${label}.${key} must be boolean.`);
    }
    return Object.values(gates).every(Boolean);
}

function validateCandidate(candidate) {
    requireEqual(candidate, TRACK_O_CANDIDATE, "O3 D32 candidate identity");
    return candidate;
}

function validateProfile(profile, currentRuntimeProfileFileSha256) {
    const identity = requireExactKeys(profile, [
        "id",
        "assetFileSha256",
        "assetCanonicalSha256",
        "effectiveIdentitySha256",
    ], "O3 runtime profile identity");
    if (identity.id !== TRACK_O_PROFILE_ID) {
        throw new Error("O3 runtime profile is not the frozen Track O profile.");
    }
    requireSha256(identity.assetCanonicalSha256, "O3 runtime profile canonical digest");
    requireSha256(identity.effectiveIdentitySha256, "O3 runtime profile effective digest");
    requireEqual(
        requireSha256(identity.assetFileSha256, "O3 runtime profile file digest"),
        requireSha256(currentRuntimeProfileFileSha256, "Current runtime profile file digest"),
        "Current runtime profile file digest",
    );
    return identity;
}

function validateO3Authority(authority, currentIdentities) {
    const identity = requireExactKeys(authority, [
        "openingRecordSha256",
        "o0AuthoritySha256",
        "o2ReceiptSha256",
        "manifestFileSha256",
        "manifestCanonicalSealSha256",
        "candidate",
        "profile",
        "scorer",
        "evaluatorSha256",
    ], "O3 authority");
    requireSha256(identity.openingRecordSha256, "O3 opening record digest");
    requireEqual(
        requireSha256(identity.o0AuthoritySha256, "O3 O0 authority digest"),
        TRACK_O_O0_AUTHORITY_SHA256,
        "O3 O0 authority digest",
    );
    requireSha256(identity.o2ReceiptSha256, "O3 O2 receipt digest");
    requireEqual(
        requireSha256(identity.manifestFileSha256, "O3 manifest file digest"),
        TRACK_O_MANIFEST_FILE_SHA256,
        "O3 manifest file digest",
    );
    requireEqual(
        requireSha256(identity.manifestCanonicalSealSha256, "O3 manifest seal digest"),
        TRACK_O_MANIFEST_SEAL_SHA256,
        "O3 manifest seal digest",
    );
    const candidate = validateCandidate(identity.candidate);
    const profile = validateProfile(identity.profile, currentIdentities.runtimeProfileFileSha256);
    const scorer = requireExactKeys(identity.scorer, [
        "id",
        "sourceSha256",
        "runtimeSha256",
        "workerSha256",
        "projectionSha256",
        "capturedProjectionAdapterSha256",
    ], "O3 scorer identity");
    if (scorer.id !== SCORER_ID) throw new Error("O3 scorer identity is unsupported.");
    requireEqual(
        requireSha256(scorer.sourceSha256, "O3 scorer source digest"),
        requireSha256(currentIdentities.scorerSourceSha256, "Current scorer source digest"),
        "Current scorer source digest",
    );
    requireEqual(
        requireSha256(scorer.runtimeSha256, "O3 scorer runtime digest"),
        requireSha256(currentIdentities.scorerRuntimeSha256, "Current scorer runtime digest"),
        "Current scorer runtime digest",
    );
    requireEqual(
        requireSha256(scorer.workerSha256, "O3 scorer worker digest"),
        requireSha256(currentIdentities.scorerWorkerSha256, "Current scorer worker digest"),
        "Current scorer worker digest",
    );
    requireEqual(
        requireSha256(scorer.projectionSha256, "O3 projection owner digest"),
        requireSha256(currentIdentities.projectionSourceSha256, "Current projection owner digest"),
        "Current projection owner digest",
    );
    requireEqual(
        requireSha256(
            scorer.capturedProjectionAdapterSha256,
            "O3 captured projection owner digest",
        ),
        requireSha256(
            currentIdentities.capturedProjectionAdapterSha256,
            "Current captured projection owner digest",
        ),
        "Current captured projection owner digest",
    );
    requireEqual(
        requireSha256(identity.evaluatorSha256, "O3 adjudicator source digest"),
        requireSha256(currentIdentities.adjudicatorSourceSha256, "Current adjudicator source digest"),
        "Current adjudicator source digest",
    );
    return { identity, candidate, profile, scorer };
}

function validateO3Outcome(receipt) {
    const decision = requireExactKeys(
        receipt.decision,
        ["outcome", "productPolicy", "activationAuthorized"],
        "O3 decision",
    );
    const expectedStatus = OUTCOME_STATUS[decision.outcome];
    if (!expectedStatus || receipt.status !== expectedStatus) {
        throw new Error("O3 status and terminal outcome are incompatible.");
    }
    if (decision.productPolicy !== "B" || decision.activationAuthorized !== false) {
        throw new Error("O3 must retain baseline B without activation authority.");
    }
    const gates = requireExactKeys(receipt.gates, ["practical", "confidence", "safety"], "O3 gates");
    const practicalPasses = validateBooleanGates(gates.practical, PRACTICAL_GATES, "O3 practical gates");
    const confidencePasses = validateBooleanGates(gates.confidence, CONFIDENCE_GATES, "O3 confidence gates");
    if (typeof gates.safety !== "boolean") throw new Error("O3 safety gate must be boolean.");
    const safety = requireExactKeys(receipt.safety, ["failures"], "O3 safety");
    const failures = requireArray(safety.failures, "O3 safety failures");
    if (gates.safety !== (failures.length === 0)) {
        throw new Error("O3 safety gate and failures are incompatible.");
    }
    const derivedOutcome = !gates.safety || !practicalPasses
        ? REJECTED
        : !confidencePasses
            ? INSUFFICIENT
            : QUALIFIED;
    if (decision.outcome !== derivedOutcome) {
        throw new Error("O3 outcome does not follow its frozen gates.");
    }
    return decision.outcome;
}

export function buildTrackOTerminalDecision(input) {
    const receipt = validateSelfDigest(input.o3Receipt, "O3 held-out adjudication receipt");
    requireExactKeys(receipt, [
        "version",
        "kind",
        "stage",
        "status",
        "authority",
        "excludedEvidence",
        "artifactBindings",
        "evidence",
        "metrics",
        "safety",
        "gates",
        "decision",
        "sha256",
    ], "O3 held-out adjudication receipt");
    if (receipt.version !== 1 || receipt.kind !== O3_KIND || receipt.stage !== "O3") {
        throw new Error("O3 receipt identity is unsupported.");
    }
    const o3ReceiptFileSha256 = requireSha256(
        input.o3ReceiptFileSha256,
        "O3 receipt file digest",
    );
    const authority = validateO3Authority(receipt.authority, input.currentIdentities);
    const outcome = validateO3Outcome(receipt);
    const unsigned = {
        version: 1,
        kind: O4_KIND,
        stage: "O4",
        status: O4_STATUS[outcome],
        authority: {
            o3ReceiptFileSha256,
            o3ReceiptSha256: receipt.sha256,
            openingRecordSha256: authority.identity.openingRecordSha256,
            o0AuthoritySha256: authority.identity.o0AuthoritySha256,
            o2ReceiptSha256: authority.identity.o2ReceiptSha256,
            manifestFileSha256: authority.identity.manifestFileSha256,
            manifestCanonicalSealSha256: authority.identity.manifestCanonicalSealSha256,
        },
        candidate: authority.candidate,
        profile: authority.profile,
        implementationIdentities: {
            scorer: authority.scorer,
            adjudicatorSourceSha256: authority.identity.evaluatorSha256,
            runtimeProfileFileSha256: authority.profile.assetFileSha256,
        },
        decision: {
            outcome,
            productPolicy: "B",
            activation: {
                authorized: false,
                performed: false,
                disposition: outcome === QUALIFIED
                    ? "separate_prospective_action_and_receipt_required"
                    : "not_eligible",
            },
        },
        execution: {
            heldOutOpened: false,
            productionActivationPerformed: false,
            syntheticTerminalizationOnly: true,
        },
    };
    return { ...unsigned, sha256: sha256Canonical(unsigned) };
}

function parseArguments(argv) {
    const values = {};
    const allowed = new Set([
        "o3-receipt",
        "o3-file-sha256",
        "scorer-source-sha256",
        "scorer-runtime-sha256",
        "scorer-worker-sha256",
        "projection-source-sha256",
        "captured-projection-adapter-sha256",
        "adjudicator-source-sha256",
        "runtime-profile-file-sha256",
        "output",
    ]);
    for (let index = 0; index < argv.length; index += 2) {
        const argument = argv[index];
        const value = argv[index + 1];
        if (!argument?.startsWith("--") || value === undefined) {
            throw new Error("Arguments must use --name value pairs.");
        }
        const key = argument.slice(2);
        if (!allowed.has(key)) throw new Error(`Unsupported --${key}.`);
        if (values[key] !== undefined) throw new Error(`Duplicate --${key}.`);
        values[key] = value;
    }
    for (const key of allowed) {
        if (values[key] === undefined) throw new Error(`Missing --${key}.`);
    }
    return values;
}

function resolveExclusiveOutput(file) {
    const parent = fs.realpathSync(path.dirname(path.resolve(file)));
    const target = path.join(parent, path.basename(file));
    const relative = path.relative(fs.realpathSync(REPOSITORY_ROOT), target);
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
        throw new Error("O4 output must be outside the repository.");
    }
    if (fs.existsSync(target)) throw new Error("O4 output already exists.");
    return target;
}

export function main(argv = process.argv.slice(2)) {
    const options = parseArguments(argv);
    const output = resolveExclusiveOutput(options.output);
    const o3Bytes = fs.readFileSync(path.resolve(options["o3-receipt"]));
    const o3ReceiptFileSha256 = requireSha256(
        options["o3-file-sha256"],
        "O3 receipt file digest",
    );
    if (sha256Bytes(o3Bytes) !== o3ReceiptFileSha256) {
        throw new Error("O3 receipt file digest does not match its bytes.");
    }
    let o3Receipt;
    try {
        o3Receipt = JSON.parse(o3Bytes.toString("utf8"));
    } catch (error) {
        throw new Error(`O3 receipt is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const terminalReceipt = buildTrackOTerminalDecision({
        o3Receipt,
        o3ReceiptFileSha256,
        currentIdentities: {
            scorerSourceSha256: options["scorer-source-sha256"],
            scorerRuntimeSha256: options["scorer-runtime-sha256"],
            scorerWorkerSha256: options["scorer-worker-sha256"],
            projectionSourceSha256: options["projection-source-sha256"],
            capturedProjectionAdapterSha256:
                options["captured-projection-adapter-sha256"],
            adjudicatorSourceSha256: options["adjudicator-source-sha256"],
            runtimeProfileFileSha256: options["runtime-profile-file-sha256"],
        },
    });
    fs.writeFileSync(output, `${JSON.stringify(terminalReceipt, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
    });
    return terminalReceipt;
}

function usage() {
    return "Usage: node scripts/satori-lateon-track-o-o4.mjs --o3-receipt <receipt.json> --o3-file-sha256 <sha256> --scorer-source-sha256 <sha256> --scorer-runtime-sha256 <sha256> --scorer-worker-sha256 <sha256> --projection-source-sha256 <sha256> --captured-projection-adapter-sha256 <sha256> --adjudicator-source-sha256 <sha256> --runtime-profile-file-sha256 <sha256> --output <external-receipt.json>";
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`satori-lateon-track-o-o4: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
        process.exitCode = 1;
    }
}
