import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
    TRACK_O_MANIFEST_FILE_SHA256,
    TRACK_O_MANIFEST_SEAL_SHA256,
    TRACK_O_O0_AUTHORITY_SHA256,
} from "./satori-track-o-heldout-opening.mjs";
import { canonicalJson } from "./satori-useful-context.mjs";
import {
    buildTrackOTerminalDecision,
    main,
} from "./satori-lateon-track-o-o4.mjs";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const DIGEST_D = "d".repeat(64);
const DIGEST_E = "e".repeat(64);
const QUALIFIED = "offline_lateon_held_out_qualified_retained_disabled";
const REJECTED = "offline_lateon_rejected_by_held_out";
const INSUFFICIENT = "offline_lateon_insufficient_held_out_evidence";
const CANDIDATE = Object.freeze({
    id: "projection-v2-d-l32",
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
const PROFILE = Object.freeze({
    id: "lateon_offline_quality_projection_v2_d32_v1",
    assetFileSha256: DIGEST_A,
    assetCanonicalSha256: DIGEST_B,
    effectiveIdentitySha256: DIGEST_C,
});
const IDENTITIES = Object.freeze({
    scorerSourceSha256: DIGEST_B,
    scorerRuntimeSha256: DIGEST_C,
    scorerWorkerSha256: DIGEST_D,
    projectionSourceSha256: DIGEST_E,
    capturedProjectionAdapterSha256: DIGEST_A,
    adjudicatorSourceSha256: DIGEST_D,
    runtimeProfileFileSha256: DIGEST_A,
});

function sha256Bytes(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function sign(value) {
    return { ...value, sha256: sha256Bytes(Buffer.from(canonicalJson(value), "utf8")) };
}

function gateValues(value = true) {
    return {
        ownerAt3: value,
        reciprocalRank: value,
        ownerAt1: value,
        ownerAt10: value,
        hardNegativeExposureAt3: value,
        unacceptableOwnerExposureAt3: value,
    };
}

function o3Receipt(outcome = QUALIFIED) {
    const practical = gateValues();
    const confidence = gateValues();
    const safety = { failures: [] };
    if (outcome === INSUFFICIENT) confidence.ownerAt3 = false;
    if (outcome === REJECTED) practical.ownerAt3 = false;
    const status = outcome === QUALIFIED
        ? "passed"
        : outcome === INSUFFICIENT
            ? "insufficient_evidence"
            : "rejected";
    return sign({
        version: 1,
        kind: "satori_lateon_track_o_o3_held_out_adjudication_receipt",
        stage: "O3",
        status,
        authority: {
            openingRecordSha256: DIGEST_E,
            o0AuthoritySha256: TRACK_O_O0_AUTHORITY_SHA256,
            o2ReceiptSha256: DIGEST_A,
            manifestFileSha256: TRACK_O_MANIFEST_FILE_SHA256,
            manifestCanonicalSealSha256: TRACK_O_MANIFEST_SEAL_SHA256,
            candidate: CANDIDATE,
            profile: PROFILE,
            scorer: {
                id: "satori_lateon_track_o_o3_d32_scorer_v1",
                sourceSha256: IDENTITIES.scorerSourceSha256,
                runtimeSha256: IDENTITIES.scorerRuntimeSha256,
                workerSha256: IDENTITIES.scorerWorkerSha256,
                projectionSha256: IDENTITIES.projectionSourceSha256,
                capturedProjectionAdapterSha256:
                    IDENTITIES.capturedProjectionAdapterSha256,
            },
            evaluatorSha256: IDENTITIES.adjudicatorSourceSha256,
        },
        excludedEvidence: [],
        artifactBindings: [],
        evidence: {},
        metrics: {},
        safety,
        gates: {
            practical,
            confidence,
            safety: safety.failures.length === 0,
        },
        decision: {
            outcome,
            productPolicy: "B",
            activationAuthorized: false,
        },
    });
}

function build(receipt) {
    return buildTrackOTerminalDecision({
        o3Receipt: receipt,
        o3ReceiptFileSha256: DIGEST_E,
        currentIdentities: IDENTITIES,
    });
}

function cliArguments(o3File, o3FileSha256, output) {
    return [
        "--o3-receipt", o3File,
        "--o3-file-sha256", o3FileSha256,
        "--scorer-source-sha256", IDENTITIES.scorerSourceSha256,
        "--scorer-runtime-sha256", IDENTITIES.scorerRuntimeSha256,
        "--scorer-worker-sha256", IDENTITIES.scorerWorkerSha256,
        "--projection-source-sha256", IDENTITIES.projectionSourceSha256,
        "--captured-projection-adapter-sha256",
        IDENTITIES.capturedProjectionAdapterSha256,
        "--adjudicator-source-sha256", IDENTITIES.adjudicatorSourceSha256,
        "--runtime-profile-file-sha256", IDENTITIES.runtimeProfileFileSha256,
        "--output", output,
    ];
}

test("O4 retains a held-out-qualified candidate disabled and binds exact O3 identities", () => {
    const receipt = o3Receipt();
    const terminal = build(receipt);

    assert.equal(terminal.stage, "O4");
    assert.equal(terminal.status, "retained_disabled");
    assert.equal(terminal.decision.outcome, QUALIFIED);
    assert.deepEqual(terminal.decision.activation, {
        authorized: false,
        performed: false,
        disposition: "separate_prospective_action_and_receipt_required",
    });
    assert.deepEqual(terminal.execution, {
        heldOutOpened: false,
        productionActivationPerformed: false,
        syntheticTerminalizationOnly: true,
    });
    assert.equal(terminal.authority.o3ReceiptFileSha256, DIGEST_E);
    assert.equal(terminal.authority.o3ReceiptSha256, receipt.sha256);
    assert.deepEqual(terminal.candidate, CANDIDATE);
    assert.deepEqual(terminal.profile, PROFILE);
    assert.deepEqual(terminal.implementationIdentities, {
        scorer: receipt.authority.scorer,
        adjudicatorSourceSha256: IDENTITIES.adjudicatorSourceSha256,
        runtimeProfileFileSha256: IDENTITIES.runtimeProfileFileSha256,
    });
    const { sha256, ...unsigned } = terminal;
    assert.equal(sha256, sha256Bytes(Buffer.from(canonicalJson(unsigned), "utf8")));
});

test("O4 maps rejected and insufficient O3 outcomes without activation eligibility", () => {
    for (const [outcome, status] of [
        [REJECTED, "rejected"],
        [INSUFFICIENT, "insufficient_evidence"],
    ]) {
        const terminal = build(o3Receipt(outcome));
        assert.equal(terminal.status, status);
        assert.equal(terminal.decision.outcome, outcome);
        assert.deepEqual(terminal.decision.activation, {
            authorized: false,
            performed: false,
            disposition: "not_eligible",
        });
    }
});

test("O4 rejects a tampered O3 receipt and outcomes inconsistent with frozen gates", () => {
    const tampered = { ...o3Receipt(), status: "rejected" };
    assert.throws(() => build(tampered), /digest does not match/);

    const inconsistent = o3Receipt();
    inconsistent.gates.practical.ownerAt3 = false;
    const { sha256: _ignored, ...unsigned } = inconsistent;
    assert.throws(
        () => build(sign(unsigned)),
        /outcome does not follow its frozen gates/,
    );
});

test("O4 rejects changed opening, candidate, scorer, adjudicator, and profile identities", () => {
    const mutations = [
        (receipt) => { receipt.authority.openingRecordSha256 = "not-a-digest"; },
        (receipt) => { receipt.authority.candidate.candidateDepth = 16; },
        (receipt) => { receipt.authority.scorer.sourceSha256 = DIGEST_E; },
        (receipt) => { receipt.authority.evaluatorSha256 = DIGEST_E; },
        (receipt) => { receipt.authority.profile.assetFileSha256 = DIGEST_E; },
    ];
    for (const mutate of mutations) {
        const receipt = structuredClone(o3Receipt());
        mutate(receipt);
        const { sha256: _ignored, ...unsigned } = receipt;
        assert.throws(() => build(sign(unsigned)), /digest|candidate|incompatible/i);
    }
});

test("O4 CLI writes one exclusive receipt outside the repository from synthetic O3 only", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "satori-o4-"));
    try {
        const receipt = o3Receipt();
        const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
        const o3File = path.join(temporary, "o3.json");
        const output = path.join(temporary, "o4.json");
        fs.writeFileSync(o3File, bytes);
        const arguments_ = cliArguments(o3File, sha256Bytes(bytes), output);

        const terminal = main(arguments_);
        assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), terminal);
        assert.throws(() => main(arguments_), /already exists/);
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});

test("O4 CLI rejects repository output and does not expose held-out input options", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "satori-o4-"));
    try {
        const receipt = o3Receipt();
        const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
        const o3File = path.join(temporary, "o3.json");
        fs.writeFileSync(o3File, bytes);
        const repositoryOutput = path.join(
            path.dirname(new URL(import.meta.url).pathname),
            "satori-lateon-track-o-o4-should-not-exist.json",
        );
        assert.throws(
            () => main(cliArguments(o3File, sha256Bytes(bytes), repositoryOutput)),
            /outside the repository/,
        );
        assert.throws(
            () => main([...cliArguments(o3File, sha256Bytes(bytes), path.join(temporary, "o4.json")),
                "--opening", path.join(temporary, "opening.json")]),
            /Unsupported --opening/,
        );
        assert.equal(fs.existsSync(repositoryOutput), false);
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});
