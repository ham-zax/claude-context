import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
    buildTrackLCaptureAuthority,
    buildR3DocumentProjection,
    getTrackLScoringToolingAuthority,
    parseR3ScoreArguments,
    resolveLateOnScoreOutcome,
    resolveTrackLScoringAuthority,
    resolveTrackLCaptureAuthority,
    selectR3ScoreTasks,
    verifyCapturePair,
} from "./satori-search-ranking-r3-score.mjs";
import { canonicalJson } from "./satori-useful-context.mjs";

function seal(value) {
    return {
        ...value,
        sha256: crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex"),
    };
}

function resealCaptureAuthority(authority) {
    const unsigned = structuredClone(authority);
    delete unsigned.sha256;
    unsigned.aggregateCaptureSha256 = crypto.createHash("sha256")
        .update(canonicalJson(unsigned.repositories), "utf8")
        .digest("hex");
    return seal(unsigned);
}

function trackLFixture() {
    const tooling = getTrackLScoringToolingAuthority();
    const c0Contract = {
        inference: {
            queryPrefix: "[Q] ",
            documentPrefix: "[D] ",
            lowercase: true,
            queryTokenLimit: 256,
            documentTokenLimit: 2048,
        },
    };
    const runtimeProfile = {
        schemaVersion: "satori_lateon_local_wsl_runtime_profile_v1",
        host: { profile: "local_wsl_cpu" },
        selection: {
            documentBatchSize: 1,
            executionProvider: "cpu",
            intraOpThreads: 8,
            interOpThreads: 1,
        },
        derivedLimits: {
            maximumModelLoadMilliseconds: { value: 1_000 },
            maximumWarmP95Milliseconds: { value: 900 },
            requestDeadlineMilliseconds: { value: 2_000 },
            maximumProcessPeakRssBytes: { value: 872_415_232 },
            maximumProcessRetainedRssBytes: { value: 671_088_640 },
        },
    };
    const lateOnL0Authority = {
        queryFormatting: {
            ...tooling.queryFormatting,
            queryPrefix: "[Q] ",
            documentPrefix: "[D] ",
            lowercase: true,
            queryTokenLimit: 256,
            documentTokenLimit: 2048,
        },
        ownerFamilyAdmission: tooling.ownerFamilyAdmission,
        projectionPolicies: [tooling.projectionV1, tooling.projectionV2],
        runtime: { artifacts: tooling.runtimeArtifacts },
        knownEvidence: {
            artifacts: [
                { role: "c0_contract", sha256: "c".repeat(64) },
                { role: "measured_runtime_profile", sha256: "d".repeat(64) },
            ],
        },
        newArms: [{
            id: "projection-v2-d-l50",
            projectionVersion: "search_rerank_document_v2",
            candidateDepth: 50,
            status: "preregistered_unopened",
        }],
        resourceProfile: {
            profile: "local_wsl_cpu",
            maximumModelLoadMilliseconds: 1_000,
            maximumWarmP95Milliseconds: 900,
            requestDeadlineMilliseconds: 2_000,
            maximumProcessPeakRssBytes: 872_415_232,
            maximumProcessRetainedRssBytes: 671_088_640,
            documentBatchSize: 1,
            intraOpThreads: 8,
            interOpThreads: 1,
            executionProvider: "cpu",
        },
        candidateCaptureContract: {
            digestBinding: "sha256_canonical_json_after_capture_before_scoring",
        },
    };
    const tuningRepositories = Array.from({ length: 6 }, (_, index) => ({
        id: `repo-${index + 1}`,
        split: "tuning",
        revision: String(index + 1).repeat(40),
        gitTree: String(index + 1).repeat(40),
        sourceTreeSha256: String(index + 1).repeat(64),
    }));
    const repositories = [
        ...tuningRepositories,
        {
            id: "repo-heldout",
            split: "heldout",
            revision: "7".repeat(40),
            gitTree: "7".repeat(40),
            sourceTreeSha256: "7".repeat(64),
        },
    ];
    const tasks = repositories.flatMap((repository) => ([
        {
            id: `${repository.id}-owner`,
            repositoryId: repository.id,
            split: repository.split,
            queryClass: "entrypoint",
            safetyControls: ["exact_identifier", "must"],
            oracle: { kind: "owner" },
        },
        {
            id: `${repository.id}-negative`,
            repositoryId: repository.id,
            split: repository.split,
            queryClass: "negative",
            safetyControls: ["configuration_pin"],
            oracle: { kind: "negative" },
        },
    ]));
    const manifest = seal({ version: 3, repositories, tasks, lateOnL0Authority });
    return {
        manifest,
        expectedManifestSeal: manifest.sha256,
        armId: "projection-v2-d-l50",
        c0Contract,
        c0ContractSha256: "c".repeat(64),
        runtimeProfile,
        runtimeProfileSha256: "d".repeat(64),
    };
}

test("LateOn score outcome discards every neural score after the frozen deadline", () => {
    const outcome = resolveLateOnScoreOutcome({
        elapsedMilliseconds: 2001,
        timeoutMilliseconds: 2000,
        selectedCandidates: [{ candidateId: "owner" }, { candidateId: "decoy" }],
        scores: [10, 9],
    });

    assert.deepEqual(outcome, {
        status: "deadline_exceeded",
        policyAffected: false,
        fallbackBaselineRequired: true,
        ranking: [],
        diagnosticRanking: [
            { candidateId: "owner", score: 10 },
            { candidateId: "decoy", score: 9 },
        ],
    });
});

test("LateOn score outcome uses deterministic candidate identity ties within the deadline", () => {
    const outcome = resolveLateOnScoreOutcome({
        elapsedMilliseconds: 100,
        timeoutMilliseconds: 2000,
        selectedCandidates: [{ candidateId: "zeta" }, { candidateId: "alpha" }],
        scores: [5, 5],
    });

    assert.deepEqual(outcome, {
        status: "scored",
        policyAffected: true,
        fallbackBaselineRequired: false,
        ranking: [
            { candidateId: "alpha", score: 5 },
            { candidateId: "zeta", score: 5 },
        ],
        diagnosticRanking: [
            { candidateId: "alpha", score: 5 },
            { candidateId: "zeta", score: 5 },
        ],
    });
});

test("capture pairing permits independently qualified runtimes on one publication", () => {
    const armPublication = {
        canonicalRoot: "/repo",
        generation: 1,
        publication: { collectionName: "frozen" },
    };
    assert.doesNotThrow(() => verifyCapturePair(
        {
            capture: {
                authority: {
                    gitRevision: "revision",
                    runtimeSha256: "positive-runtime",
                    armPublication,
                },
            },
        },
        {
            capture: {
                authority: {
                    gitRevision: "revision",
                    runtimeSha256: "negative-runtime",
                    armPublication,
                },
            },
        },
    ));
});

test("R3 scorer can isolate one frozen task for runtime experiments", () => {
    const tasks = [{ taskId: "first" }, { taskId: "second" }];

    assert.deepEqual(selectR3ScoreTasks(tasks, "second"), [{ taskId: "second" }]);
    assert.throws(
        () => selectR3ScoreTasks(tasks, "missing"),
        /No capture task matches 'missing'/,
    );
});

test("Track L scorer resolves only a sealed preregistered arm and its explicit policies", () => {
    const fixture = trackLFixture();
    const authority = resolveTrackLScoringAuthority({
        ...fixture,
        armId: "projection-v2-d-l50",
    });

    assert.equal(authority.armId, "projection-v2-d-l50");
    assert.equal(authority.candidateDepth, 50);
    assert.equal(authority.projectionVersion, "search_rerank_document_v2");
    assert.equal(authority.requestDeadlineMilliseconds, 2_000);
    assert.deepEqual(authority.queryFormatting, fixture.manifest.lateOnL0Authority.queryFormatting);
    assert.deepEqual(
        authority.ownerFamilyAdmission,
        fixture.manifest.lateOnL0Authority.ownerFamilyAdmission,
    );
});

test("Track L scorer fails closed on arm, projection, query-format, admission, or profile drift", () => {
    const fixture = trackLFixture();
    const mutations = [
        (input) => { input.armId = "projection-v2-d-l32"; },
        (input) => { input.manifest.lateOnL0Authority.newArms[0].candidateDepth = 51; },
        (input) => { input.manifest.lateOnL0Authority.queryFormatting.queryPrefix = "changed"; },
        (input) => { input.manifest.lateOnL0Authority.ownerFamilyAdmission.policy = "changed"; },
        (input) => { input.runtimeProfile.selection.intraOpThreads = 1; },
    ];

    for (const mutate of mutations) {
        const input = structuredClone(fixture);
        mutate(input);
        if (input.armId === undefined) input.armId = "projection-v2-d-l50";
        assert.throws(
            () => resolveTrackLScoringAuthority(input),
            /arm|seal|projection|query|admission|profile|thread/i,
        );
    }
});

test("Track L scoring CLI requires one explicit arm, manifest, and runtime profile", () => {
    const common = [
        "--contract", "c0.json",
        "--model-directory", "model",
        "--transformers-module", "transformers.js",
        "--onnxruntime-module", "onnxruntime.js",
        "--source-root", "source",
        "--positive-capture", "positive.json",
        "--negative-capture", "negative.json",
        "--output", "scores.json",
    ];
    const parsed = parseR3ScoreArguments([
        ...common,
        "--manifest", "manifest.json",
        "--manifest-seal", "a".repeat(64),
        "--arm", "projection-v2-d-l50",
        "--runtime-profile", "profile.json",
        "--repository-id", "repo-1",
        "--capture-authority", "capture-authority.json",
    ]);

    assert.equal(parsed.arm, "projection-v2-d-l50");
    assert.equal(parsed.manifest, "manifest.json");
    assert.equal(parsed["manifest-seal"], "a".repeat(64));
    assert.equal(parsed["runtime-profile"], "profile.json");
    assert.equal(parsed["repository-id"], "repo-1");
    assert.deepEqual(parseR3ScoreArguments([
        "--prepare-capture-authority", "capture-pairs.json",
        "--manifest", "manifest.json",
        "--manifest-seal", "a".repeat(64),
        "--output", "capture-authority.json",
    ]), {
        mode: "prepare_capture_authority",
        "prepare-capture-authority": "capture-pairs.json",
        manifest: "manifest.json",
        "manifest-seal": "a".repeat(64),
        output: "capture-authority.json",
    });
    assert.throws(
        () => parseR3ScoreArguments([...common, "--arm", "projection-v2-d-l50"]),
        /manifest.*manifest-seal.*runtime-profile/i,
    );
    assert.throws(
        () => parseR3ScoreArguments([
            ...common,
            "--manifest", "manifest.json",
            "--manifest-seal", "a".repeat(64),
            "--arm", "projection-v2-d-l50",
            "--runtime-profile", "profile.json",
            "--repository-id", "repo-1",
            "--capture-authority", "capture-authority.json",
            "--depth", "50",
        ]),
        /depth.*arm|arm.*depth/i,
    );
});

function captureFixture(repository, task, fileSha256) {
    const queryClass = task.queryClass === "exact_identifier"
        ? "exact_identifier"
        : task.queryClass === "negative"
            ? "negative_exposure"
            : "owner_discovery";
    return {
        fileName: `${task.id}.json`,
        fileSha256,
        replaySha256: "f".repeat(64),
        capture: seal({
            kind: "satori_search_candidate_capture",
            version: 2,
            authority: {
                gitRevision: repository.revision,
                runtimeSha256: "a".repeat(64),
                armPublication: {
                    canonicalRoot: `/repo/${repository.id}`,
                    generation: 1,
                    publication: { collectionName: repository.id },
                },
            },
            captures: [{
                taskId: task.id,
                split: task.split,
                queryClass,
                ...(task.safetyControls ? {
                    safetyControls: [...task.safetyControls],
                } : {}),
            }],
        }),
    };
}

function capturePairsFixture(fixture) {
    const digestCharacters = "123456789abcdef";
    const tuningRepositories = fixture.manifest.repositories.filter(
        ({ split }) => split === "tuning",
    );
    return tuningRepositories.map((repository, index) => ({
        repositoryId: repository.id,
        positive: captureFixture(
            repository,
            fixture.manifest.tasks.find(({ id }) => id === `${repository.id}-owner`),
            digestCharacters[index].repeat(64),
        ),
        negative: captureFixture(
            repository,
            fixture.manifest.tasks.find(({ id }) => id === `${repository.id}-negative`),
            digestCharacters[index + 6].repeat(64),
        ),
    }));
}

test("Track L scoring binds one repository to a post-capture authority over all tuning captures", () => {
    const fixture = trackLFixture();
    const capturePairs = capturePairsFixture(fixture);
    const authority = buildTrackLCaptureAuthority({
        manifest: fixture.manifest,
        expectedManifestSeal: fixture.expectedManifestSeal,
        capturePairs,
    });

    assert.equal(authority.repositories.length, 6);
    assert.equal(authority.schemaVersion, "satori_search_ranking_track_l_capture_authority_v2");
    assert.equal(authority.repositories.some(({ id }) => id === "repo-heldout"), false);
    assert.match(authority.aggregateCaptureSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(
        resolveTrackLCaptureAuthority({
            manifest: fixture.manifest,
            expectedManifestSeal: fixture.expectedManifestSeal,
            authority,
            repositoryId: "repo-1",
            positive: capturePairs[0].positive,
            negative: capturePairs[0].negative,
        }).repository.tasks,
        {
            positive: [{
                taskId: "repo-1-owner",
                split: "tuning",
                queryClass: "owner_discovery",
                safetyControls: ["exact_identifier", "must"],
            }],
            negative: [{
                taskId: "repo-1-negative",
                split: "tuning",
                queryClass: "negative_exposure",
                safetyControls: ["configuration_pin"],
            }],
        },
    );
    assert.throws(() => resolveTrackLCaptureAuthority({
        manifest: fixture.manifest,
        expectedManifestSeal: fixture.expectedManifestSeal,
        authority,
        repositoryId: "repo-heldout",
        positive: capturePairs[0].positive,
        negative: capturePairs[0].negative,
    }), /no repository 'repo-heldout'/i);

    const tampered = structuredClone(authority);
    tampered.repositories[0].positive.fileSha256 = "e".repeat(64);
    assert.throws(() => resolveTrackLCaptureAuthority({
        manifest: fixture.manifest,
        expectedManifestSeal: fixture.expectedManifestSeal,
        authority: tampered,
        repositoryId: "repo-1",
        positive: capturePairs[0].positive,
        negative: capturePairs[0].negative,
    }), /digest|capture authority|contents/i);

    const incomplete = structuredClone(authority);
    incomplete.repositories.pop();
    assert.throws(() => resolveTrackLCaptureAuthority({
        manifest: fixture.manifest,
        expectedManifestSeal: fixture.expectedManifestSeal,
        authority: resealCaptureAuthority(incomplete),
        repositoryId: "repo-1",
        positive: capturePairs[0].positive,
        negative: capturePairs[0].negative,
    }), /capture repository IDs does not match/i);
});

test("Track L capture authority rejects task metadata drift despite matching task IDs", () => {
    const fixture = trackLFixture();
    const capturePairs = capturePairsFixture(fixture);
    const authority = buildTrackLCaptureAuthority({
        manifest: fixture.manifest,
        expectedManifestSeal: fixture.expectedManifestSeal,
        capturePairs,
    });
    const mutations = [
        (task) => { delete task.safetyControls; },
        (task) => { task.safetyControls[0] = "configuration_pin"; },
        (task) => { task.safetyControls[0] = "unknown_control"; },
        (task) => { task.safetyControls.reverse(); },
        (task) => { task.split = "heldout"; },
        (task) => { task.queryClass = "exact_identifier"; },
        (task) => { task.taskId = "unknown-task"; },
    ];

    for (const mutate of mutations) {
        const positive = structuredClone(capturePairs[0].positive);
        mutate(positive.capture.captures[0]);
        assert.throws(() => resolveTrackLCaptureAuthority({
            manifest: fixture.manifest,
            expectedManifestSeal: fixture.expectedManifestSeal,
            authority,
            repositoryId: "repo-1",
            positive,
            negative: capturePairs[0].negative,
        }), /Positive capture tasks does not match the frozen Track L authority/);
    }
});

test("Track L capture authority rejects internally resealed unknown task authority", () => {
    const fixture = trackLFixture();
    const capturePairs = capturePairsFixture(fixture);
    const authority = buildTrackLCaptureAuthority({
        manifest: fixture.manifest,
        expectedManifestSeal: fixture.expectedManifestSeal,
        capturePairs,
    });
    const unknownAuthority = structuredClone(authority);
    unknownAuthority.repositories[0].tasks.positive[0].taskId = "unknown-task";

    assert.throws(() => resolveTrackLCaptureAuthority({
        manifest: fixture.manifest,
        expectedManifestSeal: fixture.expectedManifestSeal,
        authority: resealCaptureAuthority(unknownAuthority),
        repositoryId: "repo-1",
        positive: capturePairs[0].positive,
        negative: capturePairs[0].negative,
    }), /Repository 'repo-1' tasks does not match the frozen Track L authority/);
});

test("Track L scorer rejects a different resealed manifest or external artifact bytes", () => {
    const fixture = trackLFixture();
    const changedManifest = structuredClone(fixture.manifest);
    changedManifest.lateOnL0Authority.newArms[0].candidateDepth = 32;
    const { sha256: _ignored, ...unsigned } = changedManifest;
    const resealedManifest = seal(unsigned);

    assert.throws(() => resolveTrackLScoringAuthority({
        ...fixture,
        manifest: resealedManifest,
    }), /expected L0 seal/i);
    assert.throws(() => resolveTrackLScoringAuthority({
        ...fixture,
        c0ContractSha256: "e".repeat(64),
    }), /C0 contract artifact digest/i);
});

test("Track L scorer builds the projection selected by the sealed arm", () => {
    const candidate = {
        candidateId: "chunk-1",
        result: {
            relativePath: "src/run.ts",
            startLine: 2,
            endLine: 2,
            language: "typescript",
            symbolLabel: "run",
        },
        capturedDocumentUtf8Bytes: 0,
    };
    const chunk = {
        content: "export function run() { return startWorker(); }",
        metadata: {
            startLine: 2,
            endLine: 2,
            symbolLabel: "run",
            symbolKind: "function",
        },
    };

    const projection = buildR3DocumentProjection({
        candidate,
        chunk,
        projectionVersion: "search_rerank_document_v2",
        query: "start worker",
        sourceContent: "const decoy = true;\nexport function run() { return startWorker(); }",
    });

    assert.equal(projection.version, "search_rerank_document_v2");
    assert.equal(JSON.parse(projection.text).symbol_kind, "function");
    assert.match(JSON.parse(projection.text).query_relevant_source_excerpt, /startWorker/);
});
