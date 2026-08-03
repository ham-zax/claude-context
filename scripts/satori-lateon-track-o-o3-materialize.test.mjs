import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
    materializeTrackOHeldOutSuites,
    TRACK_O_O3_EXCLUSION,
} from "./satori-lateon-track-o-o3-materialize.mjs";
import { readTrackOHeldOutOpeningRecord } from "./satori-track-o-heldout-opening.mjs";
import { canonicalJson } from "./satori-useful-context.mjs";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const CANDIDATE = Object.freeze({
    id: "projection-v2-d-l32",
    candidateDepth: 32,
    projection: {
        id: "search_rerank_document_v2",
        sha256: DIGEST_A,
    },
    model: {
        repository: "example.test/synthetic-model",
        revision: "1".repeat(40),
    },
    artifacts: [{ role: "onnx_fp32", path: "model.onnx", sha256: DIGEST_B }],
});
const PROFILE = Object.freeze({
    id: "lateon_offline_quality_projection_v2_d32_v2",
    assetFileSha256: DIGEST_A,
    assetCanonicalSha256: DIGEST_B,
    effectiveIdentitySha256: DIGEST_C,
});

function sha256Bytes(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Canonical(value) {
    return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}

function sign(value) {
    return { ...value, sha256: sha256Canonical(value) };
}

function buildManifestBytes() {
    const manifest = sign({
        version: 3,
        kind: "satori_cross_repository_ranking_manifest",
        repositories: [],
        tasks: [],
        synthetic: true,
    });
    return {
        manifest,
        bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    };
}

function buildOpening(manifestBytes, manifestSeal) {
    return sign({
        version: 1,
        kind: "satori_lateon_track_o_held_out_opening",
        status: "consumed_authorized",
        openedAt: "2026-08-04T00:00:00.000Z",
        authority: {
            o0AuthoritySha256: DIGEST_A,
            o2ReceiptSha256: DIGEST_B,
            manifestFileSha256: sha256Bytes(manifestBytes),
            manifestCanonicalSealSha256: manifestSeal,
        },
        candidate: CANDIDATE,
        profile: PROFILE,
        implementationArtifacts: [],
        postOpenBindingsRequired: [
            "index_and_publication_identities",
            "candidate_capture_sha256",
            "baseline_replay_sha256",
            "d32_score_sha256",
            "evaluator_sha256",
        ],
    });
}

function syntheticTask(id, { control, negative = false } = {}) {
    return {
        id,
        split: "held_out",
        queryClass: negative ? "negative_exposure" : "owner_discovery",
        ...(control ? { safetyControls: [control] } : {}),
        language: "typescript",
        expected: negative
            ? { hardNegativeOwners: [{ file: `src/${id}-negative.ts`, symbol: `${id}Negative` }] }
            : { ownerFile: `src/${id}.ts`, ownerSymbol: `${id}Owner`, ownerMatch: "symbol" },
        workload: {
            setup: [{ tool: "manage_index", args: { action: "status", path: "$REPO_ROOT" } }],
            invocations: [{
                tool: "search_codebase",
                args: { path: "$REPO_ROOT", query: `synthetic query ${id}` },
            }],
            phaseProtocol: { cold: "synthetic cold", warm: "synthetic warm" },
        },
    };
}

function buildSyntheticSuites() {
    const controls = new Map([
        ["prompt-library-state-exact-control", "exact_identifier"],
        ["portfolio-page-items-must-control", "must"],
        ["supply-fastapi-configuration-control", "configuration_pin"],
    ]);
    const specialTaskIds = new Map([["0:0", TRACK_O_O3_EXCLUSION.taskId]]);
    const controlTaskIds = [
        "prompt-library-state-exact-control",
        "portfolio-page-items-must-control",
        "supply-fastapi-configuration-control",
    ];
    return Array.from({ length: 6 }, (_, repositoryIndex) => {
        const repositoryId = `repository-${repositoryIndex + 1}`;
        const qualityTasks = Array.from({ length: 6 }, (_, taskIndex) => {
            const id = specialTaskIds.get(`${repositoryIndex}:${taskIndex}`)
                ?? `${repositoryId}-owner-${taskIndex + 1}`;
            return syntheticTask(id);
        });
        const positiveTasks = repositoryIndex < controlTaskIds.length
            ? [...qualityTasks, syntheticTask(controlTaskIds[repositoryIndex], {
                control: controls.get(controlTaskIds[repositoryIndex]),
            })]
            : qualityTasks;
        const negativeTasks = Array.from({ length: 2 }, (_, taskIndex) => (
            syntheticTask(`${repositoryId}-negative-${taskIndex + 1}`, { negative: true })
        ));
        return {
            repository: {
                id: repositoryId,
                family: `family-${repositoryIndex + 1}`,
                split: "held_out",
            },
            candidateTaskSuite: {
                version: 2,
                name: `cross-repository-ranking-${repositoryId}`,
                tasks: positiveTasks,
            },
            negativeExposureSuite: {
                version: 2,
                name: `cross-repository-ranking-negative-${repositoryId}`,
                tasks: negativeTasks,
            },
        };
    });
}

function createFixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "satori-track-o-o3-materialize-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const repoRoot = path.join(root, "repository");
    fs.mkdirSync(repoRoot);
    const manifestSource = buildManifestBytes();
    const opening = buildOpening(manifestSource.bytes, manifestSource.manifest.sha256);
    const openingFile = path.join(root, "opening.json");
    const manifestFile = path.join(root, "manifest.json");
    fs.writeFileSync(openingFile, `${JSON.stringify(opening, null, 2)}\n`);
    fs.writeFileSync(manifestFile, manifestSource.bytes);
    return {
        root,
        repoRoot,
        opening,
        openingFile,
        manifest: manifestSource.manifest,
        manifestBytes: manifestSource.bytes,
        manifestFile,
        outputDirectory: path.join(root, "materialized"),
    };
}

function syntheticOptions(fixture, overrides = {}) {
    return {
        openingValidationOptions: {
            expectedO0AuthoritySha256: DIGEST_A,
            expectedManifestFileSha256: fixture.opening.authority.manifestFileSha256,
            expectedManifestSealSha256: fixture.opening.authority.manifestCanonicalSealSha256,
            expectedCandidate: CANDIDATE,
            expectedProfileId: PROFILE.id,
        },
        validateManifest: (value, options) => {
            assert.deepEqual(options, { requireSealed: true, requireCompleteBenchmark: true });
            return value;
        },
        buildSuites: buildSyntheticSuites,
        ...overrides,
    };
}

test("Track O O3 validates the opening before reading any manifest payload", (t) => {
    const fixture = createFixture(t);
    fs.writeFileSync(fixture.openingFile, "{}\n");
    let manifestReads = 0;

    assert.throws(
        () => materializeTrackOHeldOutSuites({
            repoRoot: fixture.repoRoot,
            openingFile: fixture.openingFile,
            manifestFile: fixture.manifestFile,
            outputDirectory: fixture.outputDirectory,
        }, {
            readManifestBytes: () => {
                manifestReads += 1;
                throw new Error("manifest payload was read");
            },
        }),
        /opening record keys/,
    );
    assert.equal(manifestReads, 0);
    assert.equal(fs.existsSync(fixture.outputDirectory), false);
});

test("Track O O3 materializes only positive and negative executable suites plus a sealed audit", (t) => {
    const fixture = createFixture(t);
    const events = [];
    const defaultOptions = syntheticOptions(fixture);
    const result = materializeTrackOHeldOutSuites({
        repoRoot: fixture.repoRoot,
        openingFile: fixture.openingFile,
        manifestFile: fixture.manifestFile,
        outputDirectory: fixture.outputDirectory,
    }, {
        ...defaultOptions,
        readOpening: (file, options) => {
            events.push("opening");
            return readTrackOHeldOutOpeningRecord(file, options);
        },
        readManifestBytes: (file) => {
            events.push("manifest");
            return fs.readFileSync(file);
        },
    });

    assert.deepEqual(events, ["opening", "manifest"]);
    assert.equal(result.outputDirectory, fixture.outputDirectory);
    const outputFiles = fs.readdirSync(fixture.outputDirectory).sort();
    assert.equal(outputFiles.length, 13);
    assert.equal(outputFiles.filter((file) => file.endsWith(".candidate-tasks.json")).length, 6);
    assert.equal(outputFiles.filter((file) => file.endsWith(".negative-exposure.json")).length, 6);
    assert.equal(outputFiles.includes("track-o-o3-materialization-audit.json"), true);
    assert.equal(outputFiles.some((file) => file.includes("safety")), false);

    const executableTasks = outputFiles
        .filter((file) => file !== "track-o-o3-materialization-audit.json")
        .flatMap((file) => JSON.parse(
            fs.readFileSync(path.join(fixture.outputDirectory, file), "utf8"),
        ).tasks);
    assert.equal(executableTasks.length, 50);
    assert.equal(executableTasks.some(({ id }) => id === TRACK_O_O3_EXCLUSION.taskId), false);
    assert.equal(executableTasks.filter(({ safetyControls }) => safetyControls).length, 3);

    const audit = JSON.parse(fs.readFileSync(
        path.join(fixture.outputDirectory, "track-o-o3-materialization-audit.json"),
        "utf8",
    ));
    assert.equal(audit.executable, false);
    assert.deepEqual(audit.counts, {
        repositories: 6,
        positiveTasks: 38,
        decisionBearingQualityTasks: 35,
        negativeTasks: 12,
        safetyControls: 3,
        protocolExclusions: 1,
    });
    assert.deepEqual(audit.protocolExclusions, [TRACK_O_O3_EXCLUSION]);
    assert.deepEqual(
        audit.safetyControls.map(({ taskId, control }) => ({ taskId, control })),
        [
            { taskId: "supply-fastapi-configuration-control", control: "configuration_pin" },
            { taskId: "prompt-library-state-exact-control", control: "exact_identifier" },
            { taskId: "portfolio-page-items-must-control", control: "must" },
        ],
    );
    const { sha256, ...auditUnsigned } = audit;
    assert.equal(sha256, sha256Canonical(auditUnsigned));
    for (const output of audit.outputs) {
        for (const suite of [output.positive, output.negative]) {
            assert.equal(
                sha256Bytes(fs.readFileSync(path.join(fixture.outputDirectory, suite.file))),
                suite.fileSha256,
            );
        }
    }
});

test("Track O O3 rejects raw manifest bytes not bound by the opening", (t) => {
    const fixture = createFixture(t);
    const tamperedBytes = Buffer.from(`${fixture.manifestBytes.toString("utf8")} `, "utf8");

    assert.throws(
        () => materializeTrackOHeldOutSuites({
            repoRoot: fixture.repoRoot,
            openingFile: fixture.openingFile,
            manifestFile: fixture.manifestFile,
            outputDirectory: fixture.outputDirectory,
        }, syntheticOptions(fixture, { readManifestBytes: () => tamperedBytes })),
        /file digest does not match the opening record/,
    );
    assert.equal(fs.existsSync(fixture.outputDirectory), false);
});

test("Track O O3 rejects a manifest whose canonical seal does not match its contents", (t) => {
    const fixture = createFixture(t);
    const tamperedManifest = { ...fixture.manifest, synthetic: false };
    const tamperedBytes = Buffer.from(`${JSON.stringify(tamperedManifest, null, 2)}\n`, "utf8");
    const opening = buildOpening(tamperedBytes, tamperedManifest.sha256);
    fs.writeFileSync(fixture.openingFile, `${JSON.stringify(opening, null, 2)}\n`);
    const options = syntheticOptions({ ...fixture, opening });

    assert.throws(
        () => materializeTrackOHeldOutSuites({
            repoRoot: fixture.repoRoot,
            openingFile: fixture.openingFile,
            manifestFile: fixture.manifestFile,
            outputDirectory: fixture.outputDirectory,
        }, { ...options, readManifestBytes: () => tamperedBytes }),
        /canonical seal does not match its contents/,
    );
    assert.equal(fs.existsSync(fixture.outputDirectory), false);
});

test("Track O O3 requires a new output directory outside the repository", (t) => {
    const fixture = createFixture(t);
    const insideRepository = path.join(fixture.repoRoot, "materialized");
    assert.throws(
        () => materializeTrackOHeldOutSuites({
            repoRoot: fixture.repoRoot,
            openingFile: fixture.openingFile,
            manifestFile: fixture.manifestFile,
            outputDirectory: insideRepository,
        }, syntheticOptions(fixture)),
        /outside the repository/,
    );
    assert.equal(fs.existsSync(insideRepository), false);

    fs.mkdirSync(fixture.outputDirectory);
    assert.throws(
        () => materializeTrackOHeldOutSuites({
            repoRoot: fixture.repoRoot,
            openingFile: fixture.openingFile,
            manifestFile: fixture.manifestFile,
            outputDirectory: fixture.outputDirectory,
        }, syntheticOptions(fixture)),
        /output already exists/,
    );
});
