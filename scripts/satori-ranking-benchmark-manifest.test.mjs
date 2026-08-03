import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    buildRankingCandidateTaskSuites,
    selectRankingBenchmarkTasks,
    validateRankingBenchmarkManifest,
} from "./satori-ranking-benchmark-manifest.mjs";
import {
    canonicalJson,
    validateTaskSuite,
} from "./satori-useful-context.mjs";
import { buildCrossRepositoryManifest } from "../evals/search-ranking/build-cross-repository-manifest.mjs";

const REVISION_A = "a".repeat(40);
const REVISION_B = "b".repeat(40);
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function queryDigest(query) {
    return crypto.createHash("sha256").update(query, "utf8").digest("hex");
}

function repository(overrides = {}) {
    return {
        id: "tuning-repo",
        family: "tuning-family",
        split: "tuning",
        sourceRepository: "https://example.test/tuning.git",
        revision: REVISION_A,
        gitTree: REVISION_A,
        sourceTreeSha256: DIGEST_A,
        primaryLanguage: "typescript",
        ...overrides,
    };
}

function task(overrides = {}) {
    const query = overrides.query ?? "Where is startup owned?";
    return {
        id: "opaque-a",
        split: "tuning",
        repositoryId: "tuning-repo",
        queryClass: "ownership_implementation",
        query,
        querySha256: queryDigest(query),
        search: {
            scope: "mixed",
            resultMode: "grouped",
            groupBy: "symbol",
            limit: 15,
            disclosureLimit: 10,
        },
        criticality: "important",
        oracle: {
            kind: "owner",
            requiredOwner: { file: "src/start.ts", symbol: "start" },
            acceptableAlternativeOwners: [],
            hardNegativeOwners: [{ file: "scripts/dev.ts", symbol: "main" }],
            rationale: "The pinned source calls start from the public command boundary.",
            reviewer: "independent-source-review",
            evidence: {
                kind: "source_symbol",
                revision: REVISION_A,
                file: "src/start.ts",
                symbol: "start",
                sourceBlobSha256: DIGEST_A,
            },
        },
        ...overrides,
    };
}

function manifest(overrides = {}) {
    return {
        version: 2,
        kind: "satori_cross_repository_ranking_manifest",
        repositories: [repository()],
        leakage: {
            tuningOnlyRepositoryFamilies: ["known-tuning-family"],
            tuningOnlyRevisions: [],
            tuningOnlyTaskIds: [],
            tuningOnlyQuerySha256: [],
        },
        statisticalContract: {
            version: 1,
            independentRepositoryFamiliesPerSplit: 3,
            positiveTasksPerRepository: 6,
            negativeTasksPerRepository: 2,
            decisionStratumMinimumTasks: 4,
            decisionStratumMinimumRepositoryFamilies: 2,
            pairedEstimator: "repository_macro_mean_of_paired_task_deltas",
            uncertainty: "deterministic_repository_cluster_percentile_bootstrap",
            clusterBootstrapResamples: 10000,
            bootstrapSeed: "sealed_manifest_sha256",
            multiplicityAdjustedConfidence: {
                deterministic: 0.975,
                neural: 0.975,
            },
            minimumEffects: {
                ownerAt3: 0.05,
                macroReciprocalRank: 0.03,
                lateOn32Over16MacroReciprocalRank: 0.01,
                simplicityTie: 0.01,
            },
            nonInferiorityMargins: {
                ownerAt1: -0.02,
                ownerAt10: -0.01,
                requiredRoleCoverage: -0.01,
                hardNegativeExposureAt3: 0.02,
                unacceptableOwnerExposureAt3: 0.02,
            },
            deterministicPerformance: {
                p95Multiplier: 1.1,
                p95AdditionalMs: 10,
                peakRssMultiplier: 1.05,
            },
            zeroFailureControls: [
                "exact_identifier",
                "must",
                "configuration_pin",
                "candidate_membership",
                "eligibility",
            ],
            contenderSelection: "largest_repository_macro_mrr_then_simpler_within_0.01",
        },
        neuralTrainingOverlapReview: {
            status: "deferred_r3_closed",
            rationale: "No neural contender is authorized during R0/R1.",
        },
        tasks: [task()],
        ...overrides,
    };
}

function seal(value) {
    return validateRankingBenchmarkManifest(value);
}

function resealNormalizedManifest(value) {
    const { sha256: _seal, ...unsealed } = structuredClone(value);
    return {
        ...unsealed,
        sha256: crypto.createHash("sha256")
            .update(canonicalJson(unsealed), "utf8")
            .digest("hex"),
    };
}

test("version 2 manifest uses explicit split authority independent of task IDs", () => {
    const query = "Which function handles startup?";
    const value = manifest({
        repositories: [
            repository(),
            repository({
                id: "held-repo",
                family: "held-family",
                split: "held_out",
                sourceRepository: "https://example.test/held.git",
                revision: REVISION_B,
                gitTree: REVISION_B,
                sourceTreeSha256: DIGEST_B,
            }),
        ],
        tasks: [
            task({ id: "held-looking-name", split: "tuning" }),
            task({
                id: "tuning-looking-name",
                split: "held_out",
                repositoryId: "held-repo",
                query,
                querySha256: queryDigest(query),
                oracle: {
                    ...task().oracle,
                    evidence: {
                        ...task().oracle.evidence,
                        revision: REVISION_B,
                        sourceBlobSha256: DIGEST_B,
                    },
                },
            }),
        ],
    });
    const sealed = seal(value);

    assert.deepEqual(
        selectRankingBenchmarkTasks(sealed, "held_out").map(({ id }) => id),
        ["tuning-looking-name"],
    );
});

test("manifest rejects repository-family and declared evidence leakage", () => {
    assert.throws(
        () => seal(manifest({
            repositories: [
                repository(),
                repository({
                    id: "held-repo",
                    split: "held_out",
                    sourceRepository: "https://example.test/held.git",
                    revision: REVISION_B,
                }),
            ],
        })),
        /crosses tuning and held_out/,
    );

    const heldQuery = "Held-out startup query";
    const heldRepository = repository({
        id: "held-repo",
        family: "known-tuning-family",
        split: "held_out",
        sourceRepository: "https://example.test/held.git",
        revision: REVISION_B,
        gitTree: REVISION_B,
        sourceTreeSha256: DIGEST_B,
    });
    assert.throws(
        () => seal(manifest({
            repositories: [repository(), heldRepository],
            tasks: [
                task(),
                task({
                    id: "held-task",
                    split: "held_out",
                    repositoryId: "held-repo",
                    query: heldQuery,
                    querySha256: queryDigest(heldQuery),
                    oracle: {
                        ...task().oracle,
                        evidence: {
                            ...task().oracle.evidence,
                            revision: REVISION_B,
                            sourceBlobSha256: DIGEST_B,
                        },
                    },
                }),
            ],
        })),
        /overlaps declared tuning evidence/,
    );
});

test("manifest rejects query leakage and a digest that does not bind exact text", () => {
    const heldQuery = "Held-out startup query";
    const heldRepository = repository({
        id: "held-repo",
        family: "held-family",
        split: "held_out",
        sourceRepository: "https://example.test/held.git",
        revision: REVISION_B,
        gitTree: REVISION_B,
        sourceTreeSha256: DIGEST_B,
    });
    const heldTask = task({
        id: "held-task",
        split: "held_out",
        repositoryId: "held-repo",
        query: heldQuery,
        querySha256: queryDigest(heldQuery),
        oracle: {
            ...task().oracle,
            evidence: {
                ...task().oracle.evidence,
                revision: REVISION_B,
                sourceBlobSha256: DIGEST_B,
            },
        },
    });
    assert.throws(
        () => seal(manifest({
            repositories: [repository(), heldRepository],
            leakage: {
                tuningOnlyRepositoryFamilies: [],
                tuningOnlyRevisions: [],
                tuningOnlyTaskIds: [],
                tuningOnlyQuerySha256: [queryDigest(heldQuery)],
            },
            tasks: [task(), heldTask],
        })),
        /task 'held-task'.*overlaps/,
    );
    assert.throws(
        () => seal(manifest({
            tasks: [task({ querySha256: DIGEST_B })],
        })),
        /does not match the exact query text/,
    );
});

test("manifest rejects search arguments outside the public Satori contract", () => {
    assert.throws(
        () => seal(manifest({
            tasks: [task({
                search: {
                    scope: "all",
                    resultMode: "grouped",
                    groupBy: "symbol",
                    limit: 15,
                    disclosureLimit: 10,
                },
            })],
        })),
        /search.scope is unsupported/,
    );
    assert.throws(
        () => seal(manifest({
            tasks: [task({
                search: {
                    scope: "mixed",
                    resultMode: "grouped",
                    groupBy: "symbol",
                    limit: 20,
                    disclosureLimit: 10,
                },
            })],
        })),
        /exceeds the frozen Potion runtime maximum/,
    );
});

test("manifest validates and normalizes task-level safety-control authority", () => {
    const normalized = seal(manifest({
        tasks: [task({
            safetyControls: ["exact_identifier", "must", "configuration_pin"],
        })],
    }));
    assert.deepEqual(
        normalized.tasks[0].safetyControls,
        ["exact_identifier", "must", "configuration_pin"],
    );

    for (const [safetyControls, expectedError] of [
        [[], /safetyControls must be a non-empty array/],
        [["must", "must"], /safetyControls must not contain duplicates/],
        [["unsupported-control"], /safetyControls\[0\] is unsupported/],
    ]) {
        assert.throws(
            () => seal(manifest({ tasks: [task({ safetyControls })] })),
            expectedError,
        );
    }
});

test("sealed digest covers normalized repositories, leakage authority, tasks, controls, and oracles", () => {
    const sealed = seal(manifest({
        tasks: [task({ safetyControls: ["exact_identifier"] })],
    }));
    const { sha256, ...unsigned } = sealed;
    assert.equal(
        sha256,
        crypto.createHash("sha256").update(canonicalJson(unsigned), "utf8").digest("hex"),
    );
    assert.doesNotThrow(() => validateRankingBenchmarkManifest(
        sealed,
        { requireSealed: true },
    ));

    const tampered = structuredClone(sealed);
    tampered.tasks[0].oracle.rationale = "Changed after sealing.";
    assert.throws(
        () => validateRankingBenchmarkManifest(tampered, { requireSealed: true }),
        /digest does not match/,
    );

    const controlTamper = structuredClone(sealed);
    controlTamper.tasks[0].safetyControls = ["must"];
    assert.throws(
        () => validateRankingBenchmarkManifest(controlTamper, { requireSealed: true }),
        /digest does not match/,
    );
});

test("committed cross-repository manifest is sealed, split-isolated, and complete", () => {
    const committed = JSON.parse(fs.readFileSync(
        path.join(
            REPO_ROOT,
            "evals/search-ranking/cross-repository-v2.manifest.json",
        ),
        "utf8",
    ));
    const normalized = validateRankingBenchmarkManifest(
        committed,
        { requireSealed: true },
    );
    const repositoryCounts = Object.fromEntries(["tuning", "held_out"].map((split) => [
        split,
        new Set(
            normalized.repositories
                .filter((repository) => repository.split === split)
                .map((repository) => repository.family),
        ).size,
    ]));
    const taskCounts = Object.fromEntries(["tuning", "held_out"].map((split) => [
        split,
        normalized.tasks.filter((task) => task.split === split).length,
    ]));

    assert.deepEqual(repositoryCounts, { tuning: 3, held_out: 3 });
    assert.ok(normalized.repositories.every((repository) => (
        repository.sourceRepository.startsWith("https://")
        && repository.canonicalRoot === undefined
    )));
    assert.ok(taskCounts.tuning >= 24);
    assert.ok(taskCounts.held_out >= 24);
    assert.deepEqual(
        new Set(normalized.tasks.map((task) => task.queryClass)),
        new Set([
            "ownership_implementation",
            "natural_language_behavior",
            "configuration",
            "entrypoint",
            "callers_references",
            "tests_fixtures",
            "development_script",
            "documentation",
            "exact_identifier",
            "path_role",
            "negative",
        ]),
    );
    for (const query of [
        "Find the function that creates and launches the user-facing command line interface.",
        "How does running the qap terminal command enter the application?",
        "Which function is the installed command target?",
        "cli_entry_point",
        "must:cli_entry_point cli_entry_point",
    ]) {
        assert.ok(
            normalized.leakage.tuningOnlyQuerySha256.includes(queryDigest(query)),
            `missing tuning-only query digest for '${query}'`,
        );
    }
});

test("candidate-suite compilation preserves explicit splits and keeps negatives separate", () => {
    const committed = JSON.parse(fs.readFileSync(
        path.join(
            REPO_ROOT,
            "evals/search-ranking/cross-repository-v2.manifest.json",
        ),
        "utf8",
    ));
    const suites = buildRankingCandidateTaskSuites(committed);
    const promptReady = suites.find(({ repository }) => (
        repository.id === "promptready-r0"
    ));

    assert.ok(promptReady);
    assert.ok(promptReady.candidateTaskSuite.tasks.length >= 6);
    assert.ok(promptReady.candidateTaskSuite.tasks.every((task) => (
        task.split === "held_out"
        && task.workload.invocations[0].args.debugCandidateLimit === 160
    )));
    assert.equal(promptReady.negativeExposureSuite.tasks.length, 2);
    assert.ok(promptReady.negativeExposureSuite.tasks.every((task) => (
        task.split === "held_out"
        && task.queryClass === "negative_exposure"
        && task.expected.hardNegativeOwners.length > 0
    )));
    assert.doesNotThrow(() => validateTaskSuite(promptReady.negativeExposureSuite));
});

test("candidate-suite compilation preserves file-level owner matching and safety controls", () => {
    const committed = JSON.parse(fs.readFileSync(
        path.join(
            REPO_ROOT,
            "evals/search-ranking/cross-repository-v2.manifest.json",
        ),
        "utf8",
    ));
    const { sha256: _oldSeal, ...unsealed } = committed;
    unsealed.tasks[0].oracle.ownerMatch = "file";
    unsealed.tasks[0].safetyControls = ["configuration_pin"];
    const sealed = seal(unsealed);

    const suite = buildRankingCandidateTaskSuites(sealed)
        .find(({ repository }) => repository.id === unsealed.tasks[0].repositoryId);

    assert.ok(suite);
    assert.equal(suite.candidateTaskSuite.tasks[0].expected.ownerMatch, "file");
    assert.deepEqual(
        suite.candidateTaskSuite.tasks[0].safetyControls,
        ["configuration_pin"],
    );
    assert.doesNotThrow(() => validateTaskSuite(suite.candidateTaskSuite));
});

test("version 2 authority remains byte-compatible after version 3 admission", () => {
    const committed = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, "evals/search-ranking/cross-repository-v2.manifest.json"),
        "utf8",
    ));

    const normalized = validateRankingBenchmarkManifest(
        committed,
        { requireSealed: true, requireCompleteBenchmark: true },
    );

    assert.equal(normalized.version, 2);
    assert.equal(normalized.sha256, "ca85f0f0142c64ef7e2a6fca615ba897aa8776475f113303f1c0981b87128445");
    assert.ok(buildRankingCandidateTaskSuites(normalized).every(({ candidateTaskSuite }) => (
        candidateTaskSuite.version === 2
    )));
    assert.deepEqual(buildCrossRepositoryManifest({ version: 2 }), committed);
});

test("version 3 authority keeps six quality tasks per repository and split safety denominators", () => {
    const committed = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, "evals/search-ranking/cross-repository-v3.manifest.json"),
        "utf8",
    ));
    const normalized = validateRankingBenchmarkManifest(
        committed,
        { requireSealed: true, requireCompleteBenchmark: true },
    );

    const splitSummary = Object.fromEntries(["tuning", "held_out"].map((split) => [
        split,
        {
            families: new Set(normalized.repositories
                .filter((repository) => repository.split === split)
                .map((repository) => repository.family)).size,
            tasks: normalized.tasks.filter((task) => task.split === split).length,
        },
    ]));
    assert.deepEqual(splitSummary, {
        tuning: { families: 6, tasks: 50 },
        held_out: { families: 6, tasks: 51 },
    });

    const safetyDenominators = Object.fromEntries(["tuning", "held_out"].map((split) => [
        split,
        Object.fromEntries(["exact_identifier", "must", "configuration_pin"].map((control) => [
            control,
            normalized.tasks.filter((task) => (
                task.split === split && task.safetyControls?.includes(control)
            )).map(({ id }) => id),
        ])),
    ]));
    assert.deepEqual(safetyDenominators, {
        tuning: {
            exact_identifier: ["edge-voice-options-safety-control"],
            must: ["rpc-strictness-safety-control"],
            configuration_pin: ["rpc-strictness-safety-control"],
        },
        held_out: {
            exact_identifier: ["prompt-library-state-exact-control"],
            must: ["portfolio-page-items-must-control"],
            configuration_pin: [
                "supply-fastapi-configuration-control",
            ],
        },
    });

    const positiveTaskCounts = new Map(normalized.repositories.map(({ id }) => [
        id,
        normalized.tasks.filter((task) => (
            task.repositoryId === id && task.oracle.kind === "owner"
        )).length,
    ]));
    assert.ok([...positiveTaskCounts.values()].every((count) => count >= 6));
    assert.deepEqual(
        [...positiveTaskCounts].filter(([, count]) => count === 7).map(([id]) => id),
        [
            "rpc-r0",
            "edge-tts-app-r0",
            "ai-studio-prompt-library-r0",
            "portfolio-r0",
            "supply-chain-api-r0",
        ],
    );

    const priorFamilies = new Set([
        "satori",
        "tradingview_ratio",
        "noor_and_knot_shopify",
    ]);
    assert.ok(normalized.repositories.every(({ family }) => !priorFamilies.has(family)));
    assert.ok([...priorFamilies].every((family) => (
        normalized.leakage.priorDecisionEvidence.repositoryFamilies.includes(family)
    )));
    assert.deepEqual(
        normalized.leakage.priorDecisionEvidence.categories,
        [
            "prior_lateon_tuning",
            "tradingview_ratio",
            "owner_score_calibration",
            "implementation_fixtures",
        ],
    );
    assert.equal(normalized.neuralTrainingOverlapReview.status, "suspected_overlap");
    assert.match(normalized.neuralTrainingOverlapReview.rationale, /does not disclose an authoritative training corpus/);
    const newRepositoryIds = new Set([
        "gitnexus-r0",
        "bookmark-ai-organizer-r0",
        "duas-r0",
        "vox-infinity-r0",
        "rpc-r0",
        "edge-tts-app-r0",
        "ai-studio-prompt-library-r0",
        "portfolio-r0",
        "supply-chain-api-r0",
    ]);
    assert.ok(normalized.tasks
        .filter(({ repositoryId }) => newRepositoryIds.has(repositoryId))
        .every(({ oracle }) => oracle.reviewer === "local_source_oracle_review_2026_08_03"));
});

test("version 3 rejects a split below six families and any prior-evidence overlap", () => {
    const committed = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, "evals/search-ranking/cross-repository-v3.manifest.json"),
        "utf8",
    ));
    const { sha256: _seal, ...unsealed } = committed;
    const belowMinimum = structuredClone(unsealed);
    belowMinimum.repositories = belowMinimum.repositories.filter(({ id }) => id !== "gitnexus-r0");
    belowMinimum.tasks = belowMinimum.tasks.filter(({ repositoryId }) => repositoryId !== "gitnexus-r0");
    assert.throws(
        () => validateRankingBenchmarkManifest(
            belowMinimum,
            { requireCompleteBenchmark: true },
        ),
        /independent repository-family minimum/,
    );

    const leaked = structuredClone(unsealed);
    leaked.leakage.priorDecisionEvidence.repositoryFamilies.push("gitnexus");
    assert.throws(
        () => validateRankingBenchmarkManifest(leaked),
        /overlaps prior decision evidence/,
    );

    const missingHeldOutMustControl = structuredClone(unsealed);
    const mustTask = missingHeldOutMustControl.tasks.find(({ id }) => (
        id === "portfolio-page-items-must-control"
    ));
    delete mustTask.safetyControls;
    assert.throws(
        () => validateRankingBenchmarkManifest(missingHeldOutMustControl),
        /held_out.*must.*safety-control denominator/,
    );
});

test("version 3 seals four unopened arms, prospective captures, statistics, and absolute resources", () => {
    const committed = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, "evals/search-ranking/cross-repository-v3.manifest.json"),
        "utf8",
    ));
    const normalized = validateRankingBenchmarkManifest(
        committed,
        { requireSealed: true, requireCompleteBenchmark: true },
    );

    assert.equal(normalized.version, 3);
    assert.equal(normalized.statisticalContract.version, 2);
    assert.equal(normalized.statisticalContract.minimumTasksPerSplit, 48);
    assert.equal(normalized.statisticalContract.clusterBootstrapResamples, 10_000);
    assert.deepEqual(normalized.statisticalContract.metricApplicability, {
        requiredRoleCoverage: "not_applicable_no_required_role_oracle",
        ownerAt10: "applicable_protected_retrieval_depth_metric",
    });
    assert.equal(normalized.statisticalContract.nonInferiorityMargins.ownerAt10, -0.01);
    assert.equal(
        normalized.statisticalContract.multiplicityAdjustedConfidence.newContenders,
        0.9875,
    );
    assert.deepEqual(
        normalized.lateOnL0Authority.newArms.map(({ id, status }) => [id, status]),
        [
            ["projection-v1-d-l50", "preregistered_unopened"],
            ["projection-v2-d-l16", "preregistered_unopened"],
            ["projection-v2-d-l32", "preregistered_unopened"],
            ["projection-v2-d-l50", "preregistered_unopened"],
        ],
    );
    assert.deepEqual(normalized.lateOnL0Authority.candidateCaptureContract, {
        state: "prospective_not_created",
        heldOutState: "unopened_no_index_or_capture",
        candidateCaptureSha256: null,
        contenderOutputSha256: null,
        digestBinding: "sha256_canonical_json_after_capture_before_scoring",
    });
    assert.deepEqual(normalized.lateOnL0Authority.resourceProfile, {
        profile: "local_wsl_cpu",
        maximumModelLoadMilliseconds: 1000,
        maximumWarmP95Milliseconds: 900,
        requestDeadlineMilliseconds: 2000,
        maximumProcessPeakRssBytes: 872415232,
        maximumProcessRetainedRssBytes: 671088640,
        documentBatchSize: 1,
        intraOpThreads: 8,
        interOpThreads: 1,
        executionProvider: "cpu",
    });
    const suites = buildRankingCandidateTaskSuites(normalized);
    assert.equal(suites.length, 12);
    assert.ok(suites.every(({ candidateTaskSuite, negativeExposureSuite }) => (
        candidateTaskSuite.version === 2
        && negativeExposureSuite.version === 2
        && candidateTaskSuite.tasks.length >= 6
        && negativeExposureSuite.tasks.length === 2
    )));
    assert.deepEqual(
        suites
            .filter(({ candidateTaskSuite }) => candidateTaskSuite.tasks.length === 7)
            .map(({ repository }) => repository.id),
        [
            "rpc-r0",
            "edge-tts-app-r0",
            "ai-studio-prompt-library-r0",
            "portfolio-r0",
            "supply-chain-api-r0",
        ],
    );
    assert.ok(suites.every(({ candidateTaskSuite }) => (
        candidateTaskSuite.tasks.every((task) => (
            normalized.tasks.find(({ id }) => id === task.id)?.safetyControls === undefined
            || task.safetyControls !== undefined
        ))
    )));

    const tampered = structuredClone(committed);
    tampered.lateOnL0Authority.newArms[0].candidateDepth = 32;
    assert.throws(
        () => validateRankingBenchmarkManifest(tampered, { requireSealed: true }),
        /new arms do not match|digest does not match/,
    );

    const applicabilityTamper = structuredClone(committed);
    applicabilityTamper.statisticalContract.metricApplicability.requiredRoleCoverage = "applicable";
    assert.throws(
        () => validateRankingBenchmarkManifest(
            resealNormalizedManifest(applicabilityTamper),
            { requireSealed: true },
        ),
        /metric applicability does not match the frozen L0 contract/,
    );
});

test("version 3 rejects a re-sealed mutation of the known LateOn projection", () => {
    const committed = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, "evals/search-ranking/cross-repository-v3.manifest.json"),
        "utf8",
    ));
    const tampered = structuredClone(committed);
    tampered.lateOnL0Authority.knownEvidence.projectionVersion = "search_rerank_document_v2";

    assert.throws(
        () => validateRankingBenchmarkManifest(
            resealNormalizedManifest(tampered),
            { requireSealed: true },
        ),
        /known LateOn evidence does not match the frozen L0 authority/,
    );
});

test("version 3 rejects a re-sealed mutation of the known LateOn decision", () => {
    const committed = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, "evals/search-ranking/cross-repository-v3.manifest.json"),
        "utf8",
    ));
    const tampered = structuredClone(committed);
    tampered.lateOnL0Authority.knownEvidence.originalDecision = "select_projection_v1_d_l32";

    assert.throws(
        () => validateRankingBenchmarkManifest(
            resealNormalizedManifest(tampered),
            { requireSealed: true },
        ),
        /known LateOn evidence does not match the frozen L0 authority/,
    );
});

test("version 3 builder reproduces the committed sealed authority from pinned Git objects", () => {
    const committed = JSON.parse(fs.readFileSync(
        path.join(REPO_ROOT, "evals/search-ranking/cross-repository-v3.manifest.json"),
        "utf8",
    ));

    assert.deepEqual(buildCrossRepositoryManifest(), committed);
});
