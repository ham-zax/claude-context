import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
    adjudicateTrackOHeldOut,
    main,
    validateTrackOReceiptOutput,
} from "./satori-lateon-track-o-o3.mjs";
import { buildFrozenPaginationReplay } from "./satori-search-candidate-replay.mjs";
import { canonicalJson } from "./satori-useful-context.mjs";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const O0_SHA256 = "994b79b634684c851fa21f388adaf1fc5cbec92200103d5fd48ee7e592d36a39";
const EXCLUDED_TASK_ID = "promptready-primary-action";
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
        { role: "onnx_fp32", path: "model.onnx", sha256: DIGEST_A },
        { role: "tokenizer", path: "tokenizer.json", sha256: DIGEST_B },
    ],
});
const PROFILE = Object.freeze({
    id: "lateon_offline_quality_projection_v2_d32_v1",
    assetFileSha256: DIGEST_A,
    assetCanonicalSha256: DIGEST_B,
    effectiveIdentitySha256: DIGEST_C,
});
const SCORER = Object.freeze({
    id: "satori_lateon_track_o_o3_d32_scorer_v1",
    sourceSha256: sha256Bytes(fs.readFileSync(new URL("./satori-lateon-track-o-o3-score.mjs", import.meta.url))),
    runtimeSha256: sha256Bytes(fs.readFileSync(new URL("../packages/mcp/src/server/lateon-reranker.ts", import.meta.url))),
    workerSha256: sha256Bytes(fs.readFileSync(new URL("../packages/mcp/dist/server/lateon-reranker-worker.js", import.meta.url))),
    projectionSha256: sha256Bytes(fs.readFileSync(new URL("../packages/mcp/src/core/search-rerank-document-v2.ts", import.meta.url))),
    capturedProjectionAdapterSha256: sha256Bytes(fs.readFileSync(new URL("./satori-captured-rerank-projection-v2.mjs", import.meta.url))),
});
const CONTROLS = Object.freeze([
    ["prompt-library-state-exact-control", "exact_identifier"],
    ["portfolio-page-items-must-control", "must"],
    ["supply-fastapi-configuration-control", "configuration_pin"],
]);

function sha256Bytes(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Canonical(value) {
    return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}

function sign(value) {
    return { ...value, sha256: sha256Canonical(value) };
}

function artifactFileSha256(value) {
    return sha256Bytes(Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
}

function bindOpening(value, opening) {
    const { sha256: _ignored, ...unsigned } = structuredClone(value);
    return sign({ ...unsigned, heldOutOpeningSha256: opening.sha256 });
}

function openingRecord(manifestBytes, manifestSeal) {
    return sign({
        version: 1,
        kind: "satori_lateon_track_o_held_out_opening",
        status: "consumed_authorized",
        openedAt: "2026-08-04T00:00:00.000Z",
        authority: {
            o0AuthoritySha256: O0_SHA256,
            o2ReceiptSha256: DIGEST_C,
            manifestFileSha256: sha256Bytes(manifestBytes),
            manifestCanonicalSealSha256: manifestSeal,
        },
        candidate: CANDIDATE,
        profile: PROFILE,
        implementationArtifacts: [
            { role: "projectionSource", path: "projection.ts", sha256: DIGEST_A },
            { role: "runtimeSource", path: "runtime.ts", sha256: DIGEST_B },
            { role: "measurementScript", path: "measurement.mjs", sha256: DIGEST_C },
        ],
        postOpenBindingsRequired: [
            "index_and_publication_identities",
            "candidate_capture_sha256",
            "baseline_replay_sha256",
            "d32_score_sha256",
            "evaluator_sha256",
        ],
    });
}

function ownerOracle(taskId, { fileOnly = false } = {}) {
    return {
        kind: "owner",
        requiredOwner: {
            file: `src/${taskId}.ts`,
            ...(fileOnly ? {} : { symbol: `${taskId}Owner` }),
        },
        ownerMatch: fileOnly ? "file" : "symbol",
        acceptableAlternativeOwners: [],
        hardNegativeOwners: [],
    };
}

function negativeOracle(taskId) {
    return {
        kind: "negative",
        acceptableAlternativeOwners: [],
        hardNegativeOwners: [{ file: `src/${taskId}-hard.ts`, symbol: `${taskId}Hard` }],
    };
}

function buildManifest() {
    const repositories = Array.from({ length: 6 }, (_, index) => ({
        id: `repository-${index + 1}`,
        family: `family-${index + 1}`,
        split: "held_out",
        revision: String(index + 1).repeat(40),
        gitTree: "abcdef"[index].repeat(40),
        sourceTreeSha256: String.fromCharCode(97 + index).repeat(64),
        primaryLanguage: "typescript",
    }));
    const tasks = [];
    for (const [repositoryIndex, repository] of repositories.entries()) {
        for (let index = 0; index < 6; index += 1) {
            const id = repositoryIndex === 0 && index === 0
                ? EXCLUDED_TASK_ID
                : `${repository.id}-owner-${index + 1}`;
            tasks.push({
                id,
                repositoryId: repository.id,
                split: "held_out",
                queryClass: "owner_discovery",
                oracle: ownerOracle(id),
            });
        }
        for (let index = 0; index < 2; index += 1) {
            const id = `${repository.id}-negative-${index + 1}`;
            tasks.push({
                id,
                repositoryId: repository.id,
                split: "held_out",
                queryClass: "negative_exposure",
                oracle: negativeOracle(id),
            });
        }
    }
    CONTROLS.forEach(([id, control], index) => tasks.push({
        id,
        repositoryId: repositories[index].id,
        split: "held_out",
        queryClass: control === "exact_identifier" ? "exact_identifier" : "owner_discovery",
        safetyControls: [control],
        oracle: ownerOracle(id, { fileOnly: control === "configuration_pin" }),
    }));
    const manifest = sign({
        version: 3,
        kind: "satori_cross_repository_ranking_manifest",
        repositories,
        tasks,
    });
    return { manifest, bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8") };
}

function resultGroups(taskId, owner, rank) {
    const groups = Array.from({ length: 4 }, (_, index) => {
        const number = index + 1;
        const isOwner = number === 1;
        return {
            ownerId: `${taskId}-owner-${number}`,
            candidateId: `${taskId}-candidate-${number}`,
            relativePath: isOwner ? owner.file : `src/${taskId}-other-${number}.ts`,
            symbolLabel: isOwner ? owner.symbol ?? "fileOwner" : `${taskId}Other${number}`,
        };
    });
    const expected = groups.shift();
    groups.splice(rank - 1, 0, expected);
    return groups;
}

function fusionTask(taskId, owner, rank, controls = [], negative = false) {
    const groups = resultGroups(taskId, owner, rank);
    const entries = groups.map((group, index) => ({
        rank: index + 1,
        ownerId: group.ownerId,
        candidateIds: [group.candidateId],
        score: groups.length - index,
    }));
    const groupingDisclosure = {
        groupedResults: [...entries].sort((left, right) => left.ownerId.localeCompare(right.ownerId)),
        disclosureOrder: entries,
        disclosedResults: entries,
    };
    return {
        taskId,
        split: "held_out",
        ...(controls.length ? { safetyControls: controls } : {}),
        queryClass: negative ? "negative_exposure" : "owner_discovery",
        route: { kind: "fusion", fusionReplay: "neural" },
        policyAffected: true,
        selectedCandidateIds: groups.map(({ candidateId }) => candidateId),
        ranking: groups.map(({ candidateId }, index) => ({ candidateId, score: 4 - index })),
        mcpAttempts: [{
            attemptId: "attempt:1/primary",
            candidates: groups.map((group, index) => ({
                candidateId: group.candidateId,
                ownerId: group.ownerId,
                relativePath: group.relativePath,
                symbolLabel: group.symbolLabel,
                rank: index + 1,
                fusionScore: 4 - index,
                lexicalScore: 0,
                finalScore: 4 - index,
            })),
            removed: [],
        }],
        groupingDisclosure,
        frozenPagination: buildFrozenPaginationReplay(groupingDisclosure, 2),
        invariants: {
            candidateMembershipIdentityEqual: true,
            eligibilityIdentityEqual: true,
        },
    };
}

function exactTask(taskId, owner) {
    return {
        taskId,
        split: "held_out",
        safetyControls: ["exact_identifier"],
        queryClass: "exact_identifier",
        route: { kind: "exact_registry", fusionReplay: "not_applicable" },
        policyAffected: false,
        rankedResults: [{ kind: "symbol", file: owner.file, symbol: owner.symbol }],
        invariants: {
            candidateMembershipIdentityEqual: true,
            eligibilityIdentityEqual: true,
            exactIdentifierIdentityEqual: true,
        },
    };
}

function captureTask(task) {
    const controls = task.safetyControls ?? [];
    if (task.oracle.kind === "negative") {
        return {
            taskId: task.id,
            split: "held_out",
            queryClass: task.queryClass,
            language: "typescript",
            expected: { hardNegativeOwners: structuredClone(task.oracle.hardNegativeOwners) },
        };
    }
    return {
        taskId: task.id,
        split: "held_out",
        queryClass: task.queryClass,
        ...(controls.length ? { safetyControls: controls } : {}),
        language: "typescript",
        expected: {
            ownerFile: task.oracle.requiredOwner.file,
            ...(task.oracle.requiredOwner.symbol ? { ownerSymbol: task.oracle.requiredOwner.symbol } : {}),
            ownerMatch: task.oracle.ownerMatch,
        },
    };
}

function taskResult(task, contender) {
    if (task.safetyControls?.includes("exact_identifier")) {
        return exactTask(task.id, task.oracle.requiredOwner);
    }
    if (task.oracle.kind === "negative") {
        const hard = task.oracle.hardNegativeOwners[0];
        return fusionTask(task.id, hard, 4, [], true);
    }
    const rank = task.safetyControls?.length ? 1 : contender ? 1 : 4;
    return fusionTask(task.id, task.oracle.requiredOwner, rank, task.safetyControls ?? []);
}

function scoreTask(task, replayTask) {
    if (replayTask.route.kind === "exact_registry") {
        return {
            taskId: task.id,
            split: "held_out",
            queryClass: task.queryClass,
            safetyControls: [...(task.safetyControls ?? [])],
            route: "exact_registry",
            policyAffected: false,
            selectedCandidateIds: [],
            ranking: [],
        };
    }
    return {
        taskId: task.id,
        split: "held_out",
        queryClass: task.queryClass,
        safetyControls: [...(task.safetyControls ?? [])],
        route: "fusion",
        status: "scored",
        policyAffected: true,
        fallbackBaselineRequired: false,
        selectedCandidateIds: [...replayTask.selectedCandidateIds],
        ranking: structuredClone(replayTask.ranking),
    };
}

function buildSuite(tasks, repository, opening, publication, replayMaps) {
    const authority = {
        gitRevision: repository.revision,
        taskSuiteSha256: DIGEST_A,
        observationSetSha256: DIGEST_B,
        runtimeSha256: DIGEST_C,
        armPublication: {
            canonicalRoot: `/repo/${repository.id}`,
            generation: 1,
            runtimeFingerprint: { schemaVersion: "hybrid_v3" },
            publication,
        },
    };
    const capture = bindOpening(sign({
        version: 2,
        kind: "satori_search_candidate_capture",
        taskSuiteVersion: 2,
        policyId: "baseline",
        authority,
        replayReadiness: {
            groupingDisclosureReady: true,
            neuralDisabled: true,
        },
        captures: tasks.map(captureTask),
    }), opening);
    const baselineTasks = tasks.map((task) => taskResult(task, false));
    const contenderTasks = tasks.map((task) => taskResult(task, true));
    const unboundBaseline = sign({
        version: 2,
        kind: "satori_search_candidate_baseline_replay",
        taskSuiteVersion: 2,
        sourceCaptureSha256: capture.sha256,
        policyId: "baseline",
        tasks: baselineTasks,
    });
    const score = bindOpening(sign({
        schemaVersion: "satori_search_ranking_track_l_scores_v2",
        contenderId: "projection-v2-d-l32",
        candidateDepth: 32,
        contract: {
            projectionVersion: CANDIDATE.projection.id,
            manifestSeal: opening.authority.manifestCanonicalSealSha256,
            manifestFileSha256: opening.authority.manifestFileSha256,
            repositoryId: repository.id,
            trackO: {
                openingRecordSha256: opening.sha256,
                o2ReceiptSha256: opening.authority.o2ReceiptSha256,
                profile: PROFILE,
                candidate: CANDIDATE,
                exclusions: [{
                    taskId: EXCLUDED_TASK_ID,
                    reason: "pre_open_held_out_payload_exposure",
                    decisionBearing: false,
                    scored: false,
                }],
                scorer: SCORER,
            },
        },
        source: {
            repositoryId: repository.id,
            revision: repository.revision,
            tree: repository.gitTree,
            sourceTreeSha256: repository.sourceTreeSha256,
        },
        authority,
        captures: [{
            captureSha256: capture.sha256,
            baselineReplaySha256: unboundBaseline.sha256,
        }],
        qualification: {
            passed: true,
            allOrNothingFallbackPreserved: true,
        },
        tasks: tasks.map((task, index) => scoreTask(task, contenderTasks[index])),
    }), opening);
    const unboundNeural = sign({
        version: 1,
        kind: "satori_search_candidate_neural_replay",
        contenderId: "projection-v2-d-l32",
        diagnosticQualityOnly: false,
        sourceCaptureSha256: capture.sha256,
        sourceNeuralScoreSha256: score.sha256,
        baselineReplaySha256: unboundBaseline.sha256,
        tasks: contenderTasks,
    });
    replayMaps.baseline.set(capture.sha256, unboundBaseline);
    replayMaps.neural.set(`${capture.sha256}:${score.sha256}`, unboundNeural);
    const storedBaseline = bindOpening(unboundBaseline, opening);
    const storedNeural = bindOpening(unboundNeural, opening);
    return {
        capture,
        baselineReplay: storedBaseline,
        neuralScore: score,
        neuralReplay: storedNeural,
        fileSha256: {
            capture: artifactFileSha256(capture),
            baselineReplay: artifactFileSha256(storedBaseline),
            neuralScore: artifactFileSha256(score),
            neuralReplay: artifactFileSha256(storedNeural),
        },
    };
}

function syntheticInput() {
    const { manifest, bytes } = buildManifest();
    const opening = openingRecord(bytes, manifest.sha256);
    const replayMaps = { baseline: new Map(), neural: new Map() };
    const repositories = manifest.repositories.map((repository) => {
        const tasks = manifest.tasks.filter((task) => (
            task.repositoryId === repository.id && task.id !== EXCLUDED_TASK_ID
        ));
        const positiveTasks = tasks.filter((task) => task.oracle.kind === "owner");
        const negativeTasks = tasks.filter((task) => task.oracle.kind === "negative");
        const publication = {
            collectionName: `collection-${repository.id}`,
            markerRunId: `marker-${repository.id}`,
            indexPolicyHash: DIGEST_A,
            policyDocumentDigest: DIGEST_B,
        };
        const indexReceipt = {
            version: 1,
            kind: "satori_track_o_held_out_index_receipt",
            manifestSeal: manifest.sha256,
            repositoryId: repository.id,
            repository: {
                path: `/repo/${repository.id}`,
                revision: repository.revision,
                gitTree: repository.gitTree,
                sourceTreeSha256: repository.sourceTreeSha256,
                clean: true,
            },
            runtime: { neuralReranking: "disabled" },
            index: { publication },
        };
        const indexReceiptBytes = Buffer.from(`${JSON.stringify(indexReceipt, null, 2)}\n`, "utf8");
        return {
            id: repository.id,
            family: repository.family,
            revision: repository.revision,
            gitTree: repository.gitTree,
            sourceTreeSha256: repository.sourceTreeSha256,
            indexReceiptFileSha256: sha256Bytes(indexReceiptBytes),
            indexReceiptBytes,
            positive: buildSuite(positiveTasks, repository, opening, publication, replayMaps),
            negative: buildSuite(negativeTasks, repository, opening, publication, replayMaps),
            tasksById: new Map(tasks.map((task) => [task.id, task])),
        };
    });
    const calls = { baseline: 0, neural: 0 };
    const options = {
        openingValidation: {
            expectedO0AuthoritySha256: O0_SHA256,
            expectedManifestFileSha256: sha256Bytes(bytes),
            expectedManifestSealSha256: manifest.sha256,
            expectedCandidate: CANDIDATE,
        },
        expectedManifestFileSha256: sha256Bytes(bytes),
        expectedManifestSealSha256: manifest.sha256,
        replayBaseline(capture) {
            calls.baseline += 1;
            return structuredClone(replayMaps.baseline.get(capture.sha256));
        },
        replayNeural(capture, score) {
            calls.neural += 1;
            return structuredClone(replayMaps.neural.get(`${capture.sha256}:${score.sha256}`));
        },
        bindOpening,
    };
    return { openingRecord: opening, manifestBytes: bytes, repositories, options, calls };
}

test("O3 adjudicates 35 clean owners, one excluded task, three controls, and 12 negatives", () => {
    const input = syntheticInput();
    const receipt = adjudicateTrackOHeldOut(input, input.options);

    assert.equal(receipt.status, "passed");
    assert.equal(receipt.decision.outcome, "offline_lateon_held_out_qualified_retained_disabled");
    assert.equal(receipt.decision.productPolicy, "B");
    assert.equal(receipt.decision.activationAuthorized, false);
    assert.equal(receipt.evidence.qualityOwnerTaskCount, 35);
    assert.equal(receipt.evidence.excludedTaskCount, 1);
    assert.equal(receipt.evidence.ownerSafetyControlCount, 3);
    assert.equal(receipt.evidence.negativeTaskCount, 12);
    assert.deepEqual(receipt.excludedEvidence, [{
        taskId: EXCLUDED_TASK_ID,
        reason: "pre_open_held_out_payload_exposure",
        decisionBearing: false,
        scored: false,
    }]);
    assert.equal(receipt.metrics.hardNegativeExposureAt3.delta, 0);
    assert.equal(receipt.metrics.unacceptableOwnerExposureAt3.delta, 0);
    assert.equal(input.calls.baseline, 12);
    assert.equal(input.calls.neural, 12);
});

test("O3 rejects exact persisted replay drift after production recomputation", () => {
    const input = syntheticInput();
    input.repositories[0].positive.neuralReplay.tasks[0].policyAffected = false;
    const { sha256: _ignored, ...unsigned } = input.repositories[0].positive.neuralReplay;
    input.repositories[0].positive.neuralReplay = sign(unsigned);

    assert.throws(
        () => adjudicateTrackOHeldOut(input, input.options),
        /production neural replay is incompatible/,
    );
});

test("O3 rejects score identity tampering before evaluating metrics", () => {
    const input = syntheticInput();
    const score = input.repositories[0].negative.neuralScore;
    score.contract.trackO.profile = {
        ...score.contract.trackO.profile,
        effectiveIdentitySha256: DIGEST_A,
    };

    assert.throws(
        () => adjudicateTrackOHeldOut(input, input.options),
        /score digest does not match/,
    );
});

test("O3 rejects excluded-task leakage into a capture", () => {
    const input = syntheticInput();
    const repository = input.repositories[0];
    repository.positive.capture.captures.push({
        taskId: EXCLUDED_TASK_ID,
        split: "held_out",
        queryClass: "owner_discovery",
        language: "typescript",
        expected: {
            ownerFile: `src/${EXCLUDED_TASK_ID}.ts`,
            ownerSymbol: `${EXCLUDED_TASK_ID}Owner`,
            ownerMatch: "symbol",
        },
    });
    const { sha256: _ignored, ...unsigned } = repository.positive.capture;
    repository.positive.capture = sign(unsigned);

    assert.throws(
        () => adjudicateTrackOHeldOut(input, input.options),
        /task IDs is incompatible/,
    );
});

test("O3 validates raw manifest bytes before parsing task payloads", () => {
    const input = syntheticInput();
    input.manifestBytes = Buffer.from("{not-json", "utf8");

    assert.throws(
        () => adjudicateTrackOHeldOut(input, input.options),
        /manifest file bytes do not match/,
    );
});

test("O3 CLI rejects an invalid opening before reading the held-out manifest", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "satori-o3-order-"));
    const openingFile = path.join(directory, "opening.json");
    fs.writeFileSync(openingFile, "{}\n", "utf8");

    assert.throws(
        () => main([
            "--opening", openingFile,
            "--manifest", path.join(directory, "must-not-be-read.json"),
            "--inputs", path.join(directory, "inputs.json"),
            "--output", path.join(directory, "receipt.json"),
        ]),
        /opening record/i,
    );
});

test("O3 receipt output is exclusive and outside the source repository", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "satori-o3-output-"));
    try {
        const output = path.join(directory, "receipt.json");
        assert.equal(validateTrackOReceiptOutput(output), output);
        fs.writeFileSync(output, "occupied", "utf8");
        assert.throws(() => validateTrackOReceiptOutput(output), /already exists/);
        assert.throws(
            () => validateTrackOReceiptOutput(
                new URL("./o3-receipt.json", import.meta.url).pathname,
            ),
            /outside the clean source repository/,
        );
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
