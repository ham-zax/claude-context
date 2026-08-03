import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
    openTrackOHeldOut,
    sha256Bytes,
    sha256Canonical,
    validateTrackOHeldOutOpeningRecord,
} from "./satori-track-o-heldout-opening.mjs";

function writeJson(file, value) {
    const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.writeFileSync(file, bytes);
    return bytes;
}

function observationRow(ordinal) {
    const row = { ordinal, outcome: "passed" };
    return { ...row, observationSha256: sha256Canonical(row) };
}

function buildFixture(tempDir) {
    const repoRoot = path.join(tempDir, "repository");
    const modelRoot = path.join(tempDir, "model");
    fs.mkdirSync(repoRoot);
    fs.mkdirSync(modelRoot);

    const artifactSpecs = [
        ["onnx_fp32", "model.onnx", "model fixture"],
        ["tokenizer", "tokenizer.json", "tokenizer fixture"],
        ["tokenizer_config", "tokenizer_config.json", "tokenizer config fixture"],
        ["onnx_config", "onnx_config.json", "onnx config fixture"],
        ["special_tokens", "special_tokens_map.json", "special tokens fixture"],
    ];
    const artifacts = artifactSpecs.map(([role, artifactPath, contents]) => {
        const bytes = Buffer.from(contents, "utf8");
        fs.writeFileSync(path.join(modelRoot, artifactPath), bytes);
        return { role, path: artifactPath, sha256: sha256Bytes(bytes) };
    });

    const implementationArtifacts = {};
    for (const [role, relativePath, contents] of [
        ["projectionSource", "projection.mjs", "projection source"],
        ["runtimeSource", "runtime.mjs", "runtime source"],
        ["measurementScript", "measurement.mjs", "measurement source"],
    ]) {
        const bytes = Buffer.from(contents, "utf8");
        fs.writeFileSync(path.join(repoRoot, relativePath), bytes);
        implementationArtifacts[role] = { path: relativePath, sha256: sha256Bytes(bytes) };
    }

    const candidate = {
        id: "projection-v2-d-l32",
        candidateDepth: 32,
        projection: {
            id: "search_rerank_document_v2",
            sha256: "a".repeat(64),
        },
        model: {
            repository: "lightonai/LateOn-Code-edge",
            revision: "1".repeat(40),
        },
        artifacts,
    };
    const targetHost = { cpu: "fixture", logicalCores: 1 };
    const observationCounts = {
        processColdWorkerStarts: 1,
        coldFirstScoreRequests: 1,
        warmRequests: 1,
        queueSaturationRepetitions: 1,
        queuedCancellationRepetitions: 1,
        executingCancellationRepetitions: 1,
        activeAndQueuedShutdownRepetitions: 1,
        malformedOutputRepetitions: 1,
        workerFailureRepetitions: 1,
    };
    const operationalBounds = {
        maximumReadinessP95Milliseconds: 1300,
        maximumReadinessMilliseconds: 2000,
        maximumColdFirstScoreMilliseconds: 2000,
        maximumWarmScoreP95Milliseconds: 1750,
        maximumScoreMilliseconds: 2000,
        maximumRerankerStageMilliseconds: 2500,
        maximumProcessPeakRssBytes: 872415232,
        maximumProcessRetainedRssBytes: 671088640,
        maximumInvalidOrIncompleteOrders: 0,
        maximumSafetyOrIdentityFailures: 0,
    };
    const manifestUnsigned = {
        version: 3,
        kind: "satori_cross_repository_ranking_manifest",
        opaqueFixture: true,
    };
    const manifest = { ...manifestUnsigned, sha256: sha256Canonical(manifestUnsigned) };
    const manifestFile = path.join(tempDir, "manifest.json");
    const manifestBytes = writeJson(manifestFile, manifest);
    const o0Authority = {
        version: 1,
        kind: "satori_lateon_track_o_authority",
        phase: "O0",
        status: "prospective_authority_outputs_unopened",
        candidate: {
            ...candidate,
            serviceClass: "offline_quality",
        },
        qualifiedServiceProfile: {
            id: "lateon_offline_quality_projection_v2_d32_v1",
            operationalBounds,
        },
        operationalQualification: { observationCounts },
        heldOutDecision: {
            manifest: {
                version: 3,
                fileSha256: sha256Bytes(manifestBytes),
                canonicalSealSha256: manifest.sha256,
            },
            split: "held_out",
            opening: {
                requiresPassingO2Receipt: true,
                durableExclusiveOneTimeRecord: true,
                failureConsumesOpening: true,
            },
        },
        targetHost,
        state: {
            o2MeasurementsOpened: false,
            heldOutIndexCreatedOrQueried: false,
            heldOutCaptureCreated: false,
            heldOutScoresOpened: false,
            productionActivated: false,
        },
    };
    const o0AuthorityFile = path.join(tempDir, "o0.json");
    const o0Bytes = writeJson(o0AuthorityFile, o0Authority);
    const profile = {
        schemaVersion: "satori_lateon_runtime_profile_v2",
        profileId: "lateon_offline_quality_projection_v2_d32_v1",
        qualificationStatus: "disabled_track_o_candidate",
        identity: {
            repository: candidate.model.repository,
            revision: candidate.model.revision,
            projectionVersion: candidate.projection.id,
            projectionSha256: candidate.projection.sha256,
        },
        artifacts: artifacts.map(({ path: artifactPath, sha256 }) => ({
            path: artifactPath,
            sha256,
        })),
        inference: {
            candidateDepth: 32,
            queryTokenLimit: 256,
            documentTokenLimit: 2048,
            documentBatchSize: 1,
            profileIntraOpThreads: 8,
            interOpThreads: 1,
        },
        operationalBounds: {
            maximumActiveReranks: 1,
            maximumQueuedReranks: 1,
            maximumQueueWaitMilliseconds: 250,
            maximumReadinessMilliseconds: 2000,
            maximumScoreMilliseconds: 2000,
            maximumRerankerStageMilliseconds: 2500,
            maximumProcessPeakRssBytes: 872415232,
            maximumProcessRetainedRssBytes: 671088640,
        },
    };
    const profileFile = path.join(tempDir, "profile.json");
    const profileBytes = writeJson(profileFile, profile);
    const profileBinding = {
        id: profile.profileId,
        assetFileSha256: sha256Bytes(profileBytes),
        assetCanonicalSha256: sha256Canonical(profile),
        effectiveIdentitySha256: sha256Canonical({
            profile,
            effectiveOperationalBounds: {
                maximumActiveReranks: profile.operationalBounds.maximumActiveReranks,
                maximumQueuedReranks: profile.operationalBounds.maximumQueuedReranks,
                maximumQueueWaitMilliseconds:
                    profile.operationalBounds.maximumQueueWaitMilliseconds,
                maximumScoreMilliseconds: profile.operationalBounds.maximumScoreMilliseconds,
                maximumRerankerStageMilliseconds:
                    profile.operationalBounds.maximumRerankerStageMilliseconds,
            },
            intraOpThreads: profile.inference.profileIntraOpThreads,
        }),
    };
    const o0AuthoritySha256 = sha256Bytes(o0Bytes);
    const sourceIdentity = {
        revision: "2".repeat(40),
        tree: "3".repeat(40),
    };
    const evidenceAuthority = {
        o0AuthoritySha256,
        manifestFileSha256: sha256Bytes(manifestBytes),
        manifestCanonicalSealSha256: manifest.sha256,
    };
    const observations = Object.fromEntries([
        "processColdReadiness",
        "coldFirstScore",
        "warmScore",
        "queueSaturation",
        "queuedCancellation",
        "executingCancellation",
        "activeAndQueuedShutdown",
        "malformedOutput",
        "workerFailure",
    ].map((key) => [key, [observationRow(1)]]));
    const zeroGate = (limit = 0) => ({ passed: true, actual: 0, limit });
    const gates = {
        authorityIdentity: zeroGate(null),
        modelArtifactIdentity: zeroGate(null),
        sourceIdentity: zeroGate(null),
        tuningRequestReconstruction: zeroGate(null),
        processColdFailures: zeroGate(0),
        processColdReadinessP95: zeroGate(operationalBounds.maximumReadinessP95Milliseconds),
        processColdReadinessMaximum: zeroGate(operationalBounds.maximumReadinessMilliseconds),
        coldFirstScoreMaximum: zeroGate(operationalBounds.maximumColdFirstScoreMilliseconds),
        warmScoreP95: zeroGate(operationalBounds.maximumWarmScoreP95Milliseconds),
        warmScoreMaximum: zeroGate(operationalBounds.maximumScoreMilliseconds),
        rerankerStageMaximum: zeroGate(operationalBounds.maximumRerankerStageMilliseconds),
        peakRss: zeroGate(operationalBounds.maximumProcessPeakRssBytes),
        retainedRss: zeroGate(operationalBounds.maximumProcessRetainedRssBytes),
        invalidOrIncompleteOrders: zeroGate(0),
        candidateMembership: zeroGate(0),
        eligibility: zeroGate(0),
        groupIdentity: zeroGate(0),
        paginationExactMustControls: zeroGate(0),
        fallbackResultState: zeroGate(0),
        lifecycleLeaks: zeroGate(0),
        scenarioCounts: { passed: true, actual: observationCounts, limit: observationCounts },
    };
    const evidenceUnsigned = {
        schemaVersion: "satori_lateon_track_o_o2_evidence_v1",
        status: "passed",
        result: "passed",
        sourceRevision: sourceIdentity.revision,
        sourceTree: sourceIdentity.tree,
        targetHostIdentitySha256: sha256Canonical(targetHost),
        authority: evidenceAuthority,
        profile: profileBinding,
        candidate,
        tuningRequestSet: { requestSetSha256: "4".repeat(64) },
        methodology: { observationCounts },
        observations,
        resources: {},
        gates,
        implementationArtifacts,
    };
    const evidence = { ...evidenceUnsigned, sha256: sha256Canonical(evidenceUnsigned) };
    const o2EvidenceFile = path.join(tempDir, "o2-evidence.json");
    const evidenceBytes = writeJson(o2EvidenceFile, evidence);
    const o2Unsigned = {
        version: 1,
        kind: "satori_lateon_track_o_operational_qualification_receipt",
        stage: "O2",
        status: "passed",
        operationalQualificationResult: "passed",
        sourceRevision: sourceIdentity.revision,
        sourceTree: sourceIdentity.tree,
        targetHostIdentitySha256: sha256Canonical(targetHost),
        authority: {
            o0AuthoritySha256,
            manifestFileSha256: sha256Bytes(manifestBytes),
            manifestCanonicalSealSha256: manifest.sha256,
        },
        profile: profileBinding,
        candidate,
        implementationArtifacts,
        qualificationEvidence: {
            schemaVersion: evidence.schemaVersion,
            fileSha256: sha256Bytes(evidenceBytes),
            resultSha256: evidence.sha256,
        },
    };
    const o2Receipt = { ...o2Unsigned, sha256: sha256Canonical(o2Unsigned) };
    const o2ReceiptFile = path.join(tempDir, "o2.json");
    writeJson(o2ReceiptFile, o2Receipt);
    return {
        candidate,
        expected: {
            expectedO0AuthoritySha256: o0AuthoritySha256,
            expectedManifestFileSha256: sha256Bytes(manifestBytes),
            expectedManifestSealSha256: manifest.sha256,
            expectedCandidate: candidate,
            sourceIdentity,
        },
        input: {
            repoRoot,
            manifestFile,
            o0AuthorityFile,
            o2ReceiptFile,
            o2EvidenceFile,
            profileFile,
            modelRoot,
            markerFile: path.join(tempDir, "opening.json"),
        },
    };
}

test("Track O opening validates authority without loading a model and consumes once", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "satori-track-o-opening-"));
    try {
        const fixture = buildFixture(tempDir);
        const opening = openTrackOHeldOut(fixture.input, {
            expectedO0AuthoritySha256: fixture.expected.expectedO0AuthoritySha256,
            sourceIdentity: fixture.expected.sourceIdentity,
            openedAt: "2026-08-04T00:00:00.000Z",
        });
        const durable = JSON.parse(fs.readFileSync(fixture.input.markerFile, "utf8"));

        assert.equal(opening.status, "consumed_authorized");
        assert.deepEqual(durable, opening);
        assert.doesNotThrow(() => validateTrackOHeldOutOpeningRecord(durable, fixture.expected));
        assert.throws(
            () => openTrackOHeldOut(fixture.input, {
                expectedO0AuthoritySha256: fixture.expected.expectedO0AuthoritySha256,
                sourceIdentity: fixture.expected.sourceIdentity,
            }),
            /already consumed/,
        );
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("Track O opening treats the held-out manifest as opaque before the marker exists", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "satori-track-o-opening-"));
    try {
        const fixture = buildFixture(tempDir);
        const opaqueBytes = Buffer.from("sealed held-out bytes are not materialized here", "utf8");
        fs.writeFileSync(fixture.input.manifestFile, opaqueBytes);

        const o0 = JSON.parse(fs.readFileSync(fixture.input.o0AuthorityFile, "utf8"));
        o0.heldOutDecision.manifest.fileSha256 = sha256Bytes(opaqueBytes);
        const o0Bytes = writeJson(fixture.input.o0AuthorityFile, o0);
        const o0Sha256 = sha256Bytes(o0Bytes);

        const evidence = JSON.parse(fs.readFileSync(fixture.input.o2EvidenceFile, "utf8"));
        evidence.authority.o0AuthoritySha256 = o0Sha256;
        evidence.authority.manifestFileSha256 = sha256Bytes(opaqueBytes);
        const { sha256: _ignoredEvidence, ...unsignedEvidence } = evidence;
        const updatedEvidence = {
            ...unsignedEvidence,
            sha256: sha256Canonical(unsignedEvidence),
        };
        const evidenceBytes = writeJson(fixture.input.o2EvidenceFile, updatedEvidence);

        const receipt = JSON.parse(fs.readFileSync(fixture.input.o2ReceiptFile, "utf8"));
        receipt.authority.o0AuthoritySha256 = o0Sha256;
        receipt.authority.manifestFileSha256 = sha256Bytes(opaqueBytes);
        receipt.qualificationEvidence.fileSha256 = sha256Bytes(evidenceBytes);
        receipt.qualificationEvidence.resultSha256 = updatedEvidence.sha256;
        const { sha256: _ignored, ...unsignedReceipt } = receipt;
        writeJson(fixture.input.o2ReceiptFile, {
            ...unsignedReceipt,
            sha256: sha256Canonical(unsignedReceipt),
        });

        const opening = openTrackOHeldOut(fixture.input, {
            expectedO0AuthoritySha256: o0Sha256,
            sourceIdentity: fixture.expected.sourceIdentity,
            openedAt: "2026-08-04T00:00:00.000Z",
        });
        assert.equal(opening.authority.manifestFileSha256, sha256Bytes(opaqueBytes));
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("Track O opening fails before creating a marker when O2 is not passing", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "satori-track-o-opening-"));
    try {
        const fixture = buildFixture(tempDir);
        const receipt = JSON.parse(fs.readFileSync(fixture.input.o2ReceiptFile, "utf8"));
        receipt.status = "failed";
        const { sha256: _ignored, ...unsigned } = receipt;
        writeJson(fixture.input.o2ReceiptFile, { ...unsigned, sha256: sha256Canonical(unsigned) });

        assert.throws(
            () => openTrackOHeldOut(fixture.input, {
                expectedO0AuthoritySha256: fixture.expected.expectedO0AuthoritySha256,
                sourceIdentity: fixture.expected.sourceIdentity,
            }),
            /not a passing/,
        );
        assert.equal(fs.existsSync(fixture.input.markerFile), false);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("Track O opening rejects a passing receipt without complete measured evidence", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "satori-track-o-opening-"));
    try {
        const fixture = buildFixture(tempDir);
        const evidence = JSON.parse(fs.readFileSync(fixture.input.o2EvidenceFile, "utf8"));
        evidence.observations.warmScore = [];
        const { sha256: _ignored, ...unsignedEvidence } = evidence;
        const changedEvidence = {
            ...unsignedEvidence,
            sha256: sha256Canonical(unsignedEvidence),
        };
        const evidenceBytes = writeJson(fixture.input.o2EvidenceFile, changedEvidence);
        const receipt = JSON.parse(fs.readFileSync(fixture.input.o2ReceiptFile, "utf8"));
        receipt.qualificationEvidence.fileSha256 = sha256Bytes(evidenceBytes);
        receipt.qualificationEvidence.resultSha256 = changedEvidence.sha256;
        const { sha256: _ignoredReceipt, ...unsignedReceipt } = receipt;
        writeJson(fixture.input.o2ReceiptFile, {
            ...unsignedReceipt,
            sha256: sha256Canonical(unsignedReceipt),
        });

        assert.throws(
            () => openTrackOHeldOut(fixture.input, {
                expectedO0AuthoritySha256: fixture.expected.expectedO0AuthoritySha256,
                sourceIdentity: fixture.expected.sourceIdentity,
            }),
            /warmScore.*count is incomplete/,
        );
        assert.equal(fs.existsSync(fixture.input.markerFile), false);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("Track O opening failure after exclusive creation remains consumed", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "satori-track-o-opening-"));
    const originalFsyncSync = fs.fsyncSync;
    try {
        const fixture = buildFixture(tempDir);
        fs.fsyncSync = () => {
            const error = new Error("injected fsync failure");
            error.code = "EIO";
            throw error;
        };
        assert.throws(
            () => openTrackOHeldOut(fixture.input, {
                expectedO0AuthoritySha256: fixture.expected.expectedO0AuthoritySha256,
                sourceIdentity: fixture.expected.sourceIdentity,
            }),
            /injected fsync failure/,
        );
        fs.fsyncSync = originalFsyncSync;

        assert.equal(fs.existsSync(fixture.input.markerFile), true);
        assert.throws(
            () => openTrackOHeldOut(fixture.input, {
                expectedO0AuthoritySha256: fixture.expected.expectedO0AuthoritySha256,
                sourceIdentity: fixture.expected.sourceIdentity,
            }),
            /already consumed/,
        );
    } finally {
        fs.fsyncSync = originalFsyncSync;
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("Track O opening records fail closed after tampering", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "satori-track-o-opening-"));
    try {
        const fixture = buildFixture(tempDir);
        const opening = openTrackOHeldOut(fixture.input, {
            expectedO0AuthoritySha256: fixture.expected.expectedO0AuthoritySha256,
            sourceIdentity: fixture.expected.sourceIdentity,
        });
        assert.throws(
            () => validateTrackOHeldOutOpeningRecord({
                ...opening,
                profile: { ...opening.profile, id: "lateon_projection_v2_d16_v1" },
            }, fixture.expected),
            /digest does not match/,
        );
        const { sha256: _ignored, ...unsigned } = opening;
        const altered = {
            ...unsigned,
            profile: { ...unsigned.profile, id: "lateon_projection_v2_d16_v1" },
        };
        assert.throws(
            () => validateTrackOHeldOutOpeningRecord({
                ...altered,
                sha256: sha256Canonical(altered),
            }, fixture.expected),
            /profile ID.*frozen Track O authority/i,
        );
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
