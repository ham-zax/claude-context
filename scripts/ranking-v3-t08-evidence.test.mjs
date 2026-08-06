// Focused validation for T08 RED->GREEN evidence (B1-B9 audit results).
// Validates every evidence object in the ranking-v3 T08 evidence index:
// exact key sets, sha256-format digests, evidenceSha256 recomputation,
// index binding, indexSha256 recomputation, and RED!=0 / GREEN==0 exit codes.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const AUTHORITIES_DIR = fileURLToPath(
    new URL("../evals/search-ranking/ranking-v3-authorities/", import.meta.url),
);
const INDEX_PATH = path.join(AUTHORITIES_DIR, "T08_EVIDENCE_INDEX.json");
const EVIDENCE_DIR = path.join(AUTHORITIES_DIR, "evidence");

const EXPECTED_EVIDENCE_KEYS = [
    "taskId",
    "redBaseCommit",
    "greenHeadCommit",
    "testCommand",
    "expectedRedFailure",
    "observedRedExitCode",
    "observedGreenExitCode",
    "testOutputSha256",
    "evidenceSha256",
].sort();

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (isRecord(value)) {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, canonicalize(value[key])]),
        );
    }
    return value;
}

function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
}

function sha256Hex(value) {
    return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const COMMIT_HEX = /^[0-9a-f]{40}$/;

const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
const entries = index.entries;
const entryKeys = Object.keys(entries).sort();

test("t08 index has expected schema and canonical self-digest", () => {
    assert.equal(index.schemaVersion, "ranking_v3_t08_evidence_index_v1");
    assert.match(index.indexSha256, SHA256_HEX);
    const withoutSelfDigest = { ...index };
    delete withoutSelfDigest.indexSha256;
    assert.equal(
        sha256Hex(canonicalJson(withoutSelfDigest)),
        index.indexSha256,
        "indexSha256 must be the digest of the canonical index without indexSha256",
    );
});

test("every indexed evidence object is valid and bound", () => {
    assert.ok(entryKeys.length >= 1, "index must contain at least one entry");
    for (const card of entryKeys) {
        const entry = entries[card];
        assert.ok(isRecord(entry), `entries.${card} must be an object`);
        assert.deepEqual(Object.keys(entry).sort(), ["evidenceSha256", "greenHeadCommit", "redBaseCommit", "taskId"]);
        assert.equal(entry.taskId, card, `entries.${card}.taskId must match its key`);

        const evidencePath = path.join(EVIDENCE_DIR, `T08-${entry.taskId}.json`);
        assert.ok(fs.existsSync(evidencePath), `evidence file must exist: ${evidencePath}`);
        const obj = JSON.parse(fs.readFileSync(evidencePath, "utf8"));

        assert.deepEqual(
            Object.keys(obj).sort(),
            EXPECTED_EVIDENCE_KEYS,
            `T08-${card} evidence object must have exactly the evidence keys`,
        );
        assert.equal(obj.taskId, card);
        assert.match(obj.evidenceSha256, SHA256_HEX);
        assert.match(obj.testOutputSha256, SHA256_HEX);
        assert.match(obj.redBaseCommit, COMMIT_HEX);
        assert.match(obj.greenHeadCommit, COMMIT_HEX);

        const withoutEvidenceDigest = { ...obj };
        delete withoutEvidenceDigest.evidenceSha256;
        assert.equal(
            sha256Hex(canonicalJson(withoutEvidenceDigest)),
            obj.evidenceSha256,
            `T08-${card} evidenceSha256 must be the digest of the canonical object without evidenceSha256`,
        );

        assert.equal(entry.evidenceSha256, obj.evidenceSha256, `index binding for ${card} evidenceSha256`);
        assert.equal(entry.redBaseCommit, obj.redBaseCommit, `index binding for ${card} redBaseCommit`);
        assert.equal(entry.greenHeadCommit, obj.greenHeadCommit, `index binding for ${card} greenHeadCommit`);
    }
});

test("every evidence object records a genuine RED->GREEN exit-code transition", () => {
    for (const card of entryKeys) {
        const obj = JSON.parse(
            fs.readFileSync(path.join(EVIDENCE_DIR, `T08-${entries[card].taskId}.json`), "utf8"),
        );
        assert.notEqual(obj.observedRedExitCode, 0, `T08-${card} RED run must exit nonzero`);
        assert.equal(obj.observedGreenExitCode, 0, `T08-${card} GREEN run must exit zero`);
    }
});
