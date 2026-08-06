import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
    SEARCH_CANDIDATE_FINAL_SCORE_POLICY_ID,
    SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,
} from "../packages/mcp/src/core/search-ranking-policy.ts";
import {
    buildSearchCandidateCapture,
    main as captureMain,
} from "./satori-search-candidate-capture.mjs";
import {
    orderCapturedCoreArm,
    replayBaselineCandidateCapture,
    replayCandidateCapture,
} from "./satori-search-candidate-replay.mjs";
import { canonicalJson, validateTaskSuite } from "./satori-useful-context.mjs";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);
const CAPTURE_PUBLICATION = Object.freeze({
    collectionName: "generation-7",
    markerRunId: "marker-run-7",
    indexPolicyHash: DIGEST_A,
    policyDocumentDigest: DIGEST_B,
});
const ENTRYPOINT_PUBLICATION_BINDING = Object.freeze({
    collectionName: CAPTURE_PUBLICATION.collectionName,
    markerRunId: CAPTURE_PUBLICATION.markerRunId,
    policyDocumentDigest: CAPTURE_PUBLICATION.policyDocumentDigest,
    policyHash: CAPTURE_PUBLICATION.indexPolicyHash,
    navigationGenerationId: "navigation-generation-7",
    symbolRegistryManifestHash: "symbol-manifest-7",
});
const SCRIPT_PATH = fileURLToPath(new URL("./satori-search-candidate-capture.mjs", import.meta.url));
const REPLAY_SCRIPT_PATH = fileURLToPath(new URL("./satori-search-candidate-replay.mjs", import.meta.url));

function sha256Canonical(value) {
    return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

test("captured Core arms slice adapter order before normalized score ranking", () => {
    const candidates = [
        occurrence("raw_dense", 1, 0.4),
        occurrence("raw_dense", 2, 0.9),
        occurrence("raw_dense", 3, 1.0),
    ].map((candidate) => ({
        ...candidate,
        ownerId: JSON.stringify(["symbol", candidate.relativePath, candidate.candidateId]),
    }));
    const stage = {
        stage: "raw_dense",
        totalOccurrences: candidates.length,
        uniqueCandidates: candidates.length,
        omittedOccurrences: 0,
        candidates,
    };

    assert.deepEqual(
        orderCapturedCoreArm(stage, 2).map((candidate) => candidate.candidateId),
        ["candidate-2", "candidate-1"],
    );
});

function taskSuite() {
    return {
        version: 1,
        tasks: [{
            id: "ignore-owner",
            queryClass: "owner_discovery",
            language: "typescript",
            expected: { ownerFile: "src/sync.ts", ownerSymbol: "reconcileIgnoreRules" },
            workload: {
                setup: [{ tool: "manage_index", args: { action: "status", path: "/repo" } }],
                invocations: [{
                    tool: "search_codebase",
                    args: {
                        path: "/repo",
                        query: "where are ignore rules reconciled",
                        scope: "runtime",
                        resultMode: "grouped",
                        groupBy: "symbol",
                        rankingMode: "default",
                        debugMode: "full",
                    },
                }],
                phaseProtocol: { cold: "cold", warm: "warm" },
            },
        }],
    };
}

function occurrence(stage, rank, score = 1 / rank) {
    return {
        candidateId: `candidate-${rank}`,
        candidateIdKind: "persisted",
        ownerId: '["symbol","src/sync.ts","reconcileIgnoreRules"]',
        evidenceOccurrenceId: JSON.stringify([`candidate-${rank}`, stage, rank]),
        relativePath: "src/sync.ts",
        startLine: 10,
        endLine: 20,
        language: "typescript",
        rank,
        score,
        passId: "attempt:1/primary",
    };
}

function candidateTrace() {
    return {
        schemaVersion: "search_candidate_survival_v1",
        maxEntriesPerStage: 160,
        corePasses: [{
            passId: "attempt:1/primary",
            productCandidateLimit: 80,
        }],
        queryEmbeddings: [{ passId: "attempt:1/primary", sha256: DIGEST_C }],
        lexicalRequests: [{
            passId: "attempt:1/primary",
            role: "primary",
            querySha256: DIGEST_B,
            matchMode: "all_terms",
        }],
        stages: [
            {
                stage: "raw_dense",
                passId: "attempt:1/primary",
                totalOccurrences: 1,
                uniqueCandidates: 1,
                omittedOccurrences: 0,
                candidates: [occurrence("raw_dense", 1)],
            },
            {
                stage: "raw_lexical",
                passId: "attempt:1/primary",
                totalOccurrences: 1,
                uniqueCandidates: 1,
                omittedOccurrences: 0,
                candidates: [occurrence("raw_lexical", 1)],
            },
            {
                stage: "core_fusion",
                passId: "attempt:1/primary",
                totalOccurrences: 1,
                uniqueCandidates: 1,
                omittedOccurrences: 0,
                candidates: [occurrence("core_fusion", 1, 2 / 101)],
            },
            {
                stage: "mcp_pass",
                passId: "attempt:1/primary",
                weight: 1,
                totalOccurrences: 1,
                uniqueCandidates: 1,
                omittedOccurrences: 0,
                candidates: [occurrence("mcp_pass", 1, 2 / 101)],
            },
            {
                stage: "mcp_fusion",
                passId: "attempt:1",
                totalOccurrences: 1,
                uniqueCandidates: 1,
                omittedOccurrences: 0,
                candidates: [occurrence("mcp_fusion", 1, 1 / 61)],
            },
            {
                stage: "disclosed",
                totalOccurrences: 1,
                uniqueCandidates: 1,
                omittedOccurrences: 0,
                candidates: [occurrence("disclosed", 1)],
            },
        ],
        removals: [],
        omittedRemovals: 0,
    };
}

function replayReadyCandidateTrace() {
    const trace = candidateTrace();
    const fallbackTerms = ["ignore", "rules", "reconciled"];
    const lexical = structuredClone(trace.stages.find((stage) => stage.stage === "raw_lexical"));
    lexical.stage = "raw_lexical_fallback";
    lexical.candidates = lexical.candidates.map((candidate) => ({
        ...candidate,
        candidateId: "fallback-candidate",
        ownerId: '["symbol","src/fallback.ts","fallbackOwner"]',
        evidenceOccurrenceId: JSON.stringify(["fallback-candidate", "raw_lexical_fallback", 1]),
        relativePath: "src/fallback.ts",
        rank: 1,
    }));
    trace.lexicalRequests.push({
        passId: "attempt:1/primary",
        role: "fallback_or",
        querySha256: crypto.createHash("sha256").update(fallbackTerms.join(" "), "utf8").digest("hex"),
        matchMode: "any_terms",
        terms: fallbackTerms,
    });
    trace.stages.splice(2, 0, lexical);
    const replaySignal = (candidate, replay, score) => ({
        ...candidate,
        evidenceOccurrenceId: JSON.stringify([
            candidate.candidateId,
            "mcp_replay_signals",
            "attempt:1/replay:1",
            candidate.rank,
        ]),
        passId: "attempt:1/replay:1",
        score,
        replay,
    });
    const primary = trace.stages.find((stage) => stage.stage === "mcp_fusion").candidates[0];
    const fallback = lexical.candidates[0];
    const primaryReplay = {
        lexicalScore: 0.1,
        pathMultiplier: 1,
        changedFilesMultiplier: 1,
        agentFitMultiplier: 1,
        exactLexicalMatch: false,
        passesMatchedMust: true,
        rerankFamilyId: "owner:primary",
        rerankDocumentUtf8Bytes: 120,
        symbolLabel: "reconcileIgnoreRules",
        symbolId: "primary-symbol",
    };
    const fallbackReplay = {
        lexicalScore: 0.2,
        pathMultiplier: 1,
        changedFilesMultiplier: 1,
        agentFitMultiplier: 1,
        exactLexicalMatch: false,
        passesMatchedMust: true,
        rerankFamilyId: "owner:fallback",
        rerankDocumentUtf8Bytes: 80,
        symbolLabel: "fallbackOwner",
        symbolId: "fallback-symbol",
    };
    const primaryFinalScore = (1 / 61) + primaryReplay.lexicalScore;
    trace.stages.push({
        stage: "mcp_replay_signals",
        passId: "attempt:1/replay:1",
        totalOccurrences: 2,
        uniqueCandidates: 2,
        omittedOccurrences: 0,
        candidates: [
            replaySignal(primary, primaryReplay, primaryFinalScore),
            replaySignal(fallback, fallbackReplay, fallbackReplay.lexicalScore),
        ],
    });
    trace.stages.push({
        stage: "mcp_filtered",
        passId: "attempt:1",
        totalOccurrences: 1,
        uniqueCandidates: 1,
        omittedOccurrences: 0,
        candidates: [occurrence("mcp_filtered", 1, primaryFinalScore)],
    });
    trace.stages.push({
        stage: "reranker_input",
        totalOccurrences: 1,
        uniqueCandidates: 1,
        omittedOccurrences: 0,
        candidates: [occurrence("reranker_input", 1, primaryFinalScore)],
    });
    return trace;
}

function replayReadyCandidateTraceV2() {
    const trace = replayReadyCandidateTrace();
    trace.schemaVersion = "search_candidate_survival_v2";
    trace.scorePolicy = {
        finalScorePolicyId: SEARCH_CANDIDATE_FINAL_SCORE_POLICY_ID,
        entrypointOwnerMaxContribution: SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,
    };
    const replaySignals = trace.stages.find((stage) => stage.stage === "mcp_replay_signals");
    replaySignals.candidates = replaySignals.candidates.map((candidate) => {
        const isEntrypointOwner = candidate.candidateId === "candidate-1";
        const entrypointOwnerScoreBoost = isEntrypointOwner
            ? SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST
            : 0;
        return {
            ...candidate,
            score: candidate.score + entrypointOwnerScoreBoost,
            replay: {
                ...candidate.replay,
                entrypointOwnerScoreBoost,
                entrypointOwnerScoreReason: isEntrypointOwner
                    ? "manifest_entrypoint_owner"
                    : "not_applicable",
            },
        };
    });
    for (const stageName of ["mcp_filtered", "reranker_input"]) {
        const stage = trace.stages.find((candidateStage) => candidateStage.stage === stageName);
        stage.candidates = stage.candidates.map((candidate) => ({
            ...candidate,
            score: candidate.score + SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,
        }));
    }
    return trace;
}

function entrypointOwnerEvidence() {
    const publicationIdentity = crypto.createHash("sha256").update(JSON.stringify([
        ENTRYPOINT_PUBLICATION_BINDING.collectionName,
        ENTRYPOINT_PUBLICATION_BINDING.markerRunId,
        ENTRYPOINT_PUBLICATION_BINDING.policyDocumentDigest,
        ENTRYPOINT_PUBLICATION_BINDING.policyHash,
        ENTRYPOINT_PUBLICATION_BINDING.navigationGenerationId,
        ENTRYPOINT_PUBLICATION_BINDING.symbolRegistryManifestHash,
    ]), "utf8").digest("hex");
    return {
        status: "resolved",
        owners: [{
            command: "ignore",
            declaration: {
                relativePath: "pyproject.toml",
                startLine: 5,
                endLine: 5,
            },
            target: {
                module: "sync",
                relativePath: "src/sync.ts",
                symbol: "reconcileIgnoreRules",
                symbolKey: "symkey-ignore",
                symbolInstanceId: "reconcileIgnoreRules",
            },
            sourceIdentity: DIGEST_C,
            publicationIdentity,
            resolutionConfidence: "exact",
            resolutionBasis: "pep621_project_script_supported_root_canonical_symbol",
        }],
        declaredOwnerCount: 1,
        resolvedOwnerCount: 1,
        resolutionComplete: true,
        manifestSourceIdentity: DIGEST_C,
        publicationBinding: { ...ENTRYPOINT_PUBLICATION_BINDING },
        publicationIdentity,
    };
}

function contenderPolicy() {
    return {
        version: 1,
        kind: "satori_search_candidate_policy",
        policyId: "conditional-or-v1",
        core: {
            candidateDepth: 80,
            rrfK: 100,
            weights: {
                dense: 1,
                preciseLexical: 1,
                fallbackLexical: 1,
            },
            minimums: {
                dense: 0,
                preciseLexical: 0,
                fallbackLexical: 1,
            },
            fallback: {
                enabled: true,
                preciseUniqueCountBelow: 2,
            },
        },
        mcp: { rrfK: 100 },
    };
}

function frozenComponentPolicy(policyId) {
    const components = {
        B: {
            pathMultiplier: "captured",
            entrypointOwnerScore: "captured",
        },
        "B-P0": {
            pathMultiplier: "neutral",
            entrypointOwnerScore: "captured",
        },
        "B-A0": {
            pathMultiplier: "captured",
            entrypointOwnerScore: "disabled",
        },
    };
    return {
        version: 2,
        kind: "satori_search_candidate_policy",
        policyId,
        candidateSet: "frozen_baseline",
        scoring: components[policyId],
    };
}

function debugSearch(trace = candidateTrace()) {
    return {
        route: { kind: "semantic" },
        queryIntent: {
            classification: "semantic",
            confidence: "high",
            reasons: ["natural_language"],
            lexicalTerms: ["ignore", "rules", "reconciled"],
            semanticQuery: "where are ignore rules reconciled",
        },
        retrieval: {
            mode: "hybrid",
            scorePolicyKind: "topk_only",
            backendScoreKinds: ["rrf_fusion"],
        },
        mcpFusion: { rrfK: 60 },
        providerWork: {
            semanticSearchAttempts: 1,
            embeddingCallsByCurrentContract: 1,
            denseQueriesByCurrentContract: 1,
            sparseQueriesByCurrentContract: 1,
            rerankerCalls: 1,
            rerankerCandidates: 1,
            rerankerInputBytes: 120,
            candidatesWithSemanticEvidence: 1,
            candidatesWithLexicalEvidence: 1,
            candidatesWithCurrentSourceEvidence: 0,
        },
        candidateSurvival: trace,
        passesUsed: ["primary"],
        candidateLimit: 80,
        mustRetry: { attempts: 1, maxAttempts: 2, applied: false, satisfied: true, finalCount: 1 },
        operatorSummary: { language: [], path: [], excludePath: [], must: [], exclude: [] },
        semanticExpansion: {
            attempted: false,
            expand: false,
            reason: "primary_candidate_pool_sufficient",
            primaryScopedCandidateCount: 1,
        },
        rankingProvenance: {
            semanticPassesUsed: ["primary"],
            lexicalPassesUsed: [],
            livePathSupplementUsed: false,
            lexicalFileScanUsed: false,
            rerankApplied: true,
            exactMatchPinningApplied: false,
            registryRepairGroupCount: 0,
        },
        filterSummary: {
            removedByScope: 0,
            removedByLanguage: 0,
            removedByPathInclude: 0,
            removedByPathExclude: 0,
            removedByMust: 0,
            removedByExclude: 0,
        },
        diversitySummary: {
            maxPerFile: 2,
            maxPerSymbol: 1,
            relaxedFileCap: 3,
            skippedByFileCap: 0,
            skippedBySymbolCap: 0,
            usedRelaxedCap: false,
        },
        changedFilesBoost: {
            enabled: false,
            applied: false,
            available: false,
            changedCount: 0,
            maxChangedFilesForBoost: 50,
            skippedForLargeChangeSet: false,
            multiplier: 1,
            boostedCandidates: 0,
        },
        rerank: {
            enabledByPolicy: true,
            skippedByScopeDocs: false,
            skippedByIdentifierIntent: false,
            skippedByExactPin: false,
            capabilityPresent: true,
            rerankerPresent: true,
            enabled: true,
            attempted: true,
            applied: true,
            exactMatchPinningEnabled: false,
            exactMatchPinningApplied: false,
            candidatesIn: 1,
            candidatesReranked: 1,
            familyCount: 1,
            supplementalCandidates: 0,
            candidatePoolCount: 1,
            candidateBudget: 1,
            budgetReason: "complete_family_pool",
            topK: 50,
            rankK: 10,
            weight: 1,
            docMaxLines: 200,
            docMaxChars: 4000,
            requestedResultLimit: 5,
            selectionPolicy: {
                minAmbiguousCandidates: 12,
                ambiguousCandidatesPerResult: 4,
                boundedCandidatesPerResult: 2,
                maxSupplementalChunksPerFamily: 2,
            },
        },
    };
}

function observationSet(suite = taskSuite()) {
    const runtimeFingerprint = { vectorStoreProvider: "LanceDB", embeddingProvider: "VoyageAI" };
    const publication = structuredClone(CAPTURE_PUBLICATION);
    const generationReceipt = { canonicalRoot: "/repo", runtimeFingerprint, publication };
    const makeObservation = (taskId, phase, sample) => {
        const response = {
            status: "ok",
            hints: { debugSearch: debugSearch() },
            results: [{ target: { file: "src/sync.ts" }, displayLabel: "reconcileIgnoreRules" }],
        };
        return {
            taskId,
            phase,
            sample,
            generationReceipt: structuredClone(generationReceipt),
            status: "ok",
            latencyMs: phase === "cold" ? 10 : 5,
            contextBytes: 100,
            responseBytes: Buffer.byteLength(JSON.stringify(response), "utf8"),
            response,
            results: [{ kind: "symbol", file: "src/sync.ts", symbol: "reconcileIgnoreRules" }],
            toolCalls: 1,
            callsToSource: null,
            sourceReached: false,
            sourceMode: null,
            freshnessModes: ["skipped_recent"],
        };
    };
    const indexProof = {
        id: "sync-7",
        action: "sync",
        canonicalRoot: "/repo",
        generation: 7,
        phase: "completed",
        lastDurableTransitionAt: "2026-07-18T00:00:00.000Z",
        runtimeFingerprint,
        publication: structuredClone(publication),
    };
    return {
        version: 3,
        warmSampleCount: 1,
        metadata: {
            repoRoot: "/repo",
            gitRevision: "d".repeat(40),
            taskSuiteSha256: sha256Canonical(validateTaskSuite(suite)),
            qualificationRuntime: { sha256: DIGEST_C },
            armIndexProof: {
                canonicalRoot: "/repo",
                generation: 7,
                runtimeFingerprint,
                publication: structuredClone(publication),
            },
            taskRuns: suite.tasks.map((task) => ({
                taskId: task.id,
                syncStats: { added: 0, removed: 0, modified: 0 },
                indexProof: structuredClone(indexProof),
                finalIndexProof: structuredClone(indexProof),
            })),
        },
        observations: suite.tasks.flatMap((task) => [
            makeObservation(task.id, "cold", 0),
            makeObservation(task.id, "warm", 1),
        ]),
    };
}

function replayReadyObservationSet(suite, traceFactory = replayReadyCandidateTrace) {
    const observations = observationSet(suite);
    for (const observation of observations.observations) {
        const trace = traceFactory();
        observation.response.hints.debugSearch = {
            ...debugSearch(trace),
            ...(trace.schemaVersion === "search_candidate_survival_v2"
                ? { entrypointOwnerEvidence: entrypointOwnerEvidence() }
                : {}),
            diagnosticCandidateLimit: 160,
        };
        observation.responseBytes = Buffer.byteLength(JSON.stringify(observation.response), "utf8");
    }
    return observations;
}

function groupingReadyObservationSet(suite) {
    const observations = replayReadyObservationSet(suite, replayReadyCandidateTraceV2);
    for (const observation of observations.observations) {
        const debug = observation.response.hints.debugSearch;
        const trace = debug.candidateSurvival;
        trace.stages = trace.stages.filter((stage) => (
            stage.stage !== "reranker_input" && stage.stage !== "disclosed"
        ));
        const primary = trace.stages
            .find((stage) => stage.stage === "mcp_filtered")
            .candidates[0];
        const groupedScore = primary.score + Math.log1p(1) * 0.01;
        const groupedOccurrence = {
            ...primary,
            evidenceOccurrenceId: JSON.stringify([primary.candidateId, "grouped", 1, 1]),
            rank: 1,
            score: groupedScore,
            groupReplay: {
                displayLabel: "function reconcileIgnoreRules",
                symbolKind: "function",
                declarationLike: true,
                exactLexicalMatch: false,
                symbolKey: "owner:primary",
                symbolInstanceId: "reconcileIgnoreRules",
            },
        };
        delete groupedOccurrence.passId;
        trace.stages.push({
            stage: "grouped",
            totalOccurrences: 1,
            uniqueCandidates: 1,
            omittedOccurrences: 0,
            candidates: [groupedOccurrence],
        });
        trace.stages.push({
            stage: "disclosed",
            totalOccurrences: 1,
            uniqueCandidates: 1,
            omittedOccurrences: 0,
            candidates: [{
                ...groupedOccurrence,
                evidenceOccurrenceId: JSON.stringify([
                    primary.candidateId,
                    "disclosed",
                    1,
                    1,
                ]),
            }],
        });
        debug.providerWork.rerankerCalls = 0;
        debug.providerWork.rerankerCandidates = 0;
        debug.providerWork.rerankerInputBytes = 0;
        debug.rankingProvenance.rerankApplied = false;
        debug.rerank = {
            ...debug.rerank,
            enabledByPolicy: false,
            capabilityPresent: false,
            rerankerPresent: false,
            enabled: false,
            attempted: false,
            applied: false,
            candidatesIn: 0,
            candidatesReranked: 0,
            familyCount: 0,
            supplementalCandidates: 0,
            candidatePoolCount: 0,
            candidateBudget: 0,
        };
        delete debug.rerank.budgetReason;
        observation.responseBytes = Buffer.byteLength(
            JSON.stringify(observation.response),
            "utf8",
        );
    }
    return observations;
}

test("candidate capture binds stable query, runtime, publication, and trace authority", () => {
    const suite = taskSuite();
    const capture = buildSearchCandidateCapture(suite, observationSet(suite));

    assert.equal(capture.version, 1);
    assert.equal(capture.policyId, "baseline");
    assert.equal(capture.captures[0].stableSampleCount, 2);
    assert.deepEqual(capture.captures[0].expected, {
        ownerFile: "src/sync.ts",
        ownerSymbol: "reconcileIgnoreRules",
        ownerMatch: "symbol",
    });
    assert.equal(
        capture.captures[0].queryPlan.queryUtf8Sha256,
        crypto.createHash("sha256").update("where are ignore rules reconciled", "utf8").digest("hex"),
    );
    assert.deepEqual(capture.captures[0].queryPlan.queryEmbeddings, [{
        passId: "attempt:1/primary",
        sha256: DIGEST_C,
    }]);
    assert.match(capture.captures[0].queryPlanDigest, /^[0-9a-f]{64}$/);
    assert.match(capture.captures[0].passConfigurationDigest, /^[0-9a-f]{64}$/);
    assert.equal(capture.replayReadiness.fusionReady, false);
    assert.equal(capture.replayReadiness.survivalReady, false);
    assert.equal(capture.replayReadiness.agentReady, false);
    assert.deepEqual(capture.captures[0].readiness.fusionReasons, [
        "conditional_or_superset_not_recorded",
        "conditional_or_terms_not_recorded",
        "diagnostic_candidate_limit_below_160",
    ]);
    assert.deepEqual(capture.captures[0].readiness.survivalReasons, [
        "conditional_or_superset_not_recorded",
        "conditional_or_terms_not_recorded",
        "diagnostic_candidate_limit_below_160",
        "mcp_replay_signals_not_recorded",
    ]);
    assert.match(capture.sha256, /^[0-9a-f]{64}$/);
});

test("candidate capture and replay preserve explicit safety-control authority", () => {
    const suite = taskSuite();
    suite.version = 2;
    suite.tasks[0].split = "tuning";
    suite.tasks[0].safetyControls = ["exact_identifier", "must"];
    suite.tasks[0].expected.ownerMatch = "symbol";

    const capture = buildSearchCandidateCapture(suite, observationSet(suite));
    const replay = replayBaselineCandidateCapture(capture);

    assert.deepEqual(capture.captures[0].safetyControls, ["exact_identifier", "must"]);
    assert.deepEqual(replay.tasks[0].safetyControls, ["exact_identifier", "must"]);
});

test("candidate capture retains the production ranked-set digest for pagination controls", () => {
    const suite = taskSuite();
    suite.tasks[0].expected.ownerMatch = "symbol";
    const observations = groupingReadyObservationSet(suite);
    for (const observation of observations.observations) {
        observation.response.rankedSetDigest = DIGEST_C;
        observation.responseBytes = Buffer.byteLength(JSON.stringify(observation.response), "utf8");
    }

    const capture = buildSearchCandidateCapture(suite, observations);

    assert.equal(capture.captures[0].rankedSetDigest, DIGEST_C);
});

test("candidate capture permits distinct frozen-set digests across equivalent search requests", () => {
    const suite = taskSuite();
    suite.tasks[0].expected.ownerMatch = "symbol";
    const observations = groupingReadyObservationSet(suite);
    observations.observations[0].response.rankedSetDigest = DIGEST_C;
    observations.observations[1].response.rankedSetDigest = DIGEST_A;
    for (const observation of observations.observations) {
        observation.responseBytes = Buffer.byteLength(JSON.stringify(observation.response), "utf8");
    }

    const capture = buildSearchCandidateCapture(suite, observations);

    assert.equal(capture.captures[0].rankedSetDigest, DIGEST_C);
    assert.equal(capture.captures[0].stableSampleCount, 2);
});

test("candidate capture accepts status-only preparation and rejects mixed sync evidence", () => {
    const suite = taskSuite();
    const observations = observationSet(suite);
    for (const taskRun of observations.metadata.taskRuns) {
        taskRun.preparationMode = "status-only";
        delete taskRun.syncStats;
    }

    const capture = buildSearchCandidateCapture(suite, observations);
    assert.equal(capture.captures.length, 1);

    observations.metadata.taskRuns[0].syncStats = { added: 0, removed: 0, modified: 0 };
    assert.throws(
        () => buildSearchCandidateCapture(suite, observations),
        /status-only preparation must not contain syncStats/,
    );
});

test("candidate capture preserves a trace-complete zero-result baseline", () => {
    const suite = taskSuite();
    suite.tasks[0].workload.invocations[0].args.debugCandidateLimit = 160;
    suite.tasks[0].workload.invocations[0].args.limit = 5;
    suite.tasks[0].workload.invocations[0].args.disclosureLimit = 5;
    const observations = groupingReadyObservationSet(suite);
    for (const observation of observations.observations) {
        observation.status = "zero_result";
        observation.results = [];
        observation.response.results = [];
        const stages = observation.response.hints.debugSearch.candidateSurvival.stages;
        for (const stage of stages) {
            stage.totalOccurrences = 0;
            stage.uniqueCandidates = 0;
            stage.candidates = [];
        }
        observation.responseBytes = Buffer.byteLength(
            JSON.stringify(observation.response),
            "utf8",
        );
    }

    const capture = buildSearchCandidateCapture(suite, observations, {
        requireReplayReady: true,
        requireGroupingReady: true,
        requireNeuralDisabled: true,
    });
    const replay = replayBaselineCandidateCapture(capture);

    assert.deepEqual(capture.captures[0].rankedResults, []);
    assert.deepEqual(replay.tasks[0].groupingDisclosure.disclosedResults, []);

    observations.observations[0].status = "error";
    observations.observations[0].response.status = "error";
    observations.observations[0].responseBytes = Buffer.byteLength(
        JSON.stringify(observations.observations[0].response),
        "utf8",
    );
    assert.throws(
        () => buildSearchCandidateCapture(suite, observations),
        /ok or trace-complete zero-result observation/,
    );
});

test("candidate capture admits a complete depth-160 AND and OR superset", () => {
    const suite = taskSuite();
    suite.tasks[0].workload.invocations[0].args.debugCandidateLimit = 160;
    const capture = buildSearchCandidateCapture(
        suite,
        replayReadyObservationSet(suite),
        { requireReplayReady: true },
    );

    assert.equal(capture.replayReadiness.fusionReady, true);
    assert.equal(capture.replayReadiness.survivalReady, true);
    assert.equal(capture.replayReadiness.agentReady, false);
    assert.deepEqual(capture.captures[0].readiness.fusionReasons, []);
    assert.deepEqual(capture.captures[0].readiness.survivalReasons, []);
    assert.deepEqual(capture.captures[0].readiness.agentReasons, [
        "agent_replay_not_implemented",
    ]);
    assert.equal(capture.captures[0].queryPlan.candidateLimit, 80);
    assert.equal(capture.captures[0].queryPlan.diagnosticCandidateLimit, 160);
    assert.deepEqual(
        capture.captures[0].queryPlan.lexicalRequests.map(({ role, matchMode }) => ({ role, matchMode })),
        [
            { role: "primary", matchMode: "all_terms" },
            { role: "fallback_or", matchMode: "any_terms" },
        ],
    );
});

test("baseline replay recomputes both Core and MCP fusion from one capture", () => {
    const suite = taskSuite();
    const capture = buildSearchCandidateCapture(suite, observationSet(suite));
    const replay = replayBaselineCandidateCapture(capture);

    assert.equal(capture.version, 1);
    assert.equal(
        capture.captures[0].candidateTrace.schemaVersion,
        "search_candidate_survival_v1",
    );
    assert.equal(replay.version, 1);
    assert.equal(replay.policyId, "baseline");
    assert.deepEqual(replay.tasks, [{
        taskId: "ignore-owner",
        route: { kind: "fusion", fusionReplay: "exact" },
        policyAffected: true,
        corePasses: [{
            passId: "attempt:1/primary",
            mode: "hybrid",
            candidateCount: 1,
        }],
        mcpAttempts: [{
            attemptId: "attempt:1",
            passCount: 1,
            candidateCount: 1,
        }],
    }]);
    assert.equal(replay.replayRuntime.measuredRuntimeSha256, DIGEST_C);
    assert.deepEqual(
        replay.replayRuntime.artifacts.map((artifact) => artifact.role),
        [
            "replay_executable",
            "canonical_json_helper",
            "production_scoring_owner",
            "production_grouping_owner",
            "production_group_ordering_owner",
            "production_diversity_owner",
            "production_disclosure_owner",
            "typescript_loader",
            "typescript_loader_manifest",
            "dependency_lockfile",
        ],
    );
    assert.ok(replay.replayRuntime.artifacts.every((artifact) => (
        Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0 && /^[0-9a-f]{64}$/.test(artifact.sha256)
    )));
    assert.equal(replay.replayRuntime.policySource.kind, "canonical_inline");
    assert.equal(replay.replayRuntime.typescriptLoader.name, "tsx");
    assert.match(replay.replayRuntime.typescriptLoader.version, /^\d+\.\d+\.\d+/);
    assert.match(replay.replayRuntime.sha256, /^[0-9a-f]{64}$/);
    assert.match(replay.sha256, /^[0-9a-f]{64}$/);
});

test("version 2 baseline replay preserves authoritative owner scoring", () => {
    const suite = taskSuite();
    suite.tasks[0].workload.invocations[0].args.debugCandidateLimit = 160;
    const capture = buildSearchCandidateCapture(
        suite,
        replayReadyObservationSet(suite, replayReadyCandidateTraceV2),
        { requireReplayReady: true },
    );

    const baseline = replayBaselineCandidateCapture(capture);
    const contender = replayCandidateCapture(capture, contenderPolicy());
    const primary = contender.tasks[0].mcpAttempts[0].candidates.find(
        (candidate) => candidate.candidateId === "candidate-1",
    );

    assert.equal(capture.version, 2);
    assert.equal(
        capture.captures[0].candidateTrace.schemaVersion,
        "search_candidate_survival_v2",
    );
    assert.equal(baseline.version, 2);
    assert.equal(contender.version, 2);
    assert.equal(contender.baselineReproduced, true);
    assert.deepEqual(capture.captures[0].candidateTrace.scorePolicy, {
        finalScorePolicyId: SEARCH_CANDIDATE_FINAL_SCORE_POLICY_ID,
        entrypointOwnerMaxContribution: SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,
    });
    assert.equal(capture.captures[0].entrypointOwnerEvidence.status, "resolved");
    assert.deepEqual(
        capture.captures[0].entrypointOwnerEvidence.publicationBinding,
        ENTRYPOINT_PUBLICATION_BINDING,
    );
    assert.match(
        capture.captures[0].entrypointOwnerEvidenceDigest,
        /^[0-9a-f]{64}$/,
    );
    assert.equal(
        primary.entrypointOwnerScoreBoost,
        SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,
    );
    assert.equal(primary.entrypointOwnerScoreReason, "manifest_entrypoint_owner");
    assert.equal(
        primary.finalScore,
        primary.fusionScore
            + primary.lexicalScore
            + SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,
    );

    const inconsistentObservations = replayReadyObservationSet(
        suite,
        replayReadyCandidateTraceV2,
    );
    for (const observation of inconsistentObservations.observations) {
        const signals = observation.response.hints.debugSearch.candidateSurvival.stages.find(
            (stage) => stage.stage === "mcp_replay_signals",
        );
        signals.candidates[0].replay.entrypointOwnerScoreReason = "not_applicable";
        observation.responseBytes = Buffer.byteLength(
            JSON.stringify(observation.response),
            "utf8",
        );
    }
    assert.throws(
        () => buildSearchCandidateCapture(suite, inconsistentObservations),
        /owner score and reason are inconsistent/,
    );

    const overCapObservations = replayReadyObservationSet(
        suite,
        replayReadyCandidateTraceV2,
    );
    for (const observation of overCapObservations.observations) {
        const signals = observation.response.hints.debugSearch.candidateSurvival.stages.find(
            (stage) => stage.stage === "mcp_replay_signals",
        );
        signals.candidates[0].replay.entrypointOwnerScoreBoost =
            SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST + 1;
        observation.responseBytes = Buffer.byteLength(
            JSON.stringify(observation.response),
            "utf8",
        );
    }
    assert.throws(
        () => buildSearchCandidateCapture(suite, overCapObservations),
        /exceeds the captured policy cap/,
    );

    const incompatibleEvidence = replayReadyObservationSet(
        suite,
        replayReadyCandidateTraceV2,
    );
    for (const observation of incompatibleEvidence.observations) {
        observation.response.hints.debugSearch
            .entrypointOwnerEvidence.publicationBinding.collectionName = "other-generation";
        observation.responseBytes = Buffer.byteLength(
            JSON.stringify(observation.response),
            "utf8",
        );
    }
    assert.throws(
        () => buildSearchCandidateCapture(suite, incompatibleEvidence),
        /does not match the captured vector publication/,
    );

    const incompatibleReplayPolicy = structuredClone(capture);
    incompatibleReplayPolicy.captures[0]
        .candidateTrace.scorePolicy.entrypointOwnerMaxContribution += 0.01;
    incompatibleReplayPolicy.captures[0].candidateTraceDigest = sha256Canonical(
        incompatibleReplayPolicy.captures[0].candidateTrace,
    );
    const { sha256: _incompatibleDigest, ...unsignedIncompatibleReplayPolicy } =
        incompatibleReplayPolicy;
    incompatibleReplayPolicy.sha256 = sha256Canonical(unsignedIncompatibleReplayPolicy);
    assert.throws(
        () => replayBaselineCandidateCapture(incompatibleReplayPolicy),
        /cap is incompatible/,
    );
});

test("version 2 capture retains removal diagnostics beyond the stage-entry bound", () => {
    const suite = taskSuite();
    const traceFactory = () => {
        const trace = replayReadyCandidateTraceV2();
        trace.maxRemovalEntries = 320;
        trace.removals = Array.from({ length: 161 }, (_, index) => ({
            candidateId: `removed-${index}`,
            afterStage: "disclosed",
            reason: "visible_limit",
        }));
        return trace;
    };
    const capture = buildSearchCandidateCapture(
        suite,
        replayReadyObservationSet(suite, traceFactory),
        { requireReplayReady: true },
    );

    assert.equal(capture.captures[0].candidateTrace.maxEntriesPerStage, 160);
    assert.equal(capture.captures[0].candidateTrace.maxRemovalEntries, 320);
    assert.equal(capture.captures[0].candidateTrace.removals.length, 161);
    assert.equal(capture.captures[0].readiness.removalReasonsComplete, true);
});

test("exact-registry hits reproduce as policy-invariant routes without fusion work", () => {
    const suite = taskSuite();
    suite.tasks[0].queryClass = "exact_identifier";
    suite.tasks[0].expected = {
        ownerFile: "src/sync.ts",
        ownerSymbol: "reconcileIgnoreRules",
    };
    const observations = observationSet(suite);
    for (const observation of observations.observations) {
        observation.results = [{
            kind: "symbol",
            file: "src/sync.ts",
            symbol: "reconcileIgnoreRules",
        }];
        const debug = observation.response.hints.debugSearch;
        debug.route = {
            kind: "exact_identifier",
            reason: "identifier_intent",
            deterministicFirst: true,
        };
        debug.retrieval = { mode: "lexical", scorePolicyKind: "topk_only" };
        delete debug.diagnosticCandidateLimit;
        debug.passesUsed = ["exact_registry"];
        debug.exactRegistry = {
            attempted: true,
            status: "hit",
            reason: "symbol_name",
            matchedSymbolInstanceId: "syminst-exact-owner",
        };
        debug.providerWork = Object.fromEntries(
            Object.keys(debug.providerWork).map((field) => [field, 0]),
        );
        debug.rerank = {
            ...debug.rerank,
            attempted: false,
            applied: false,
            candidatesReranked: 0,
        };
        debug.candidateSurvival.corePasses = [];
        debug.candidateSurvival.queryEmbeddings = [];
        debug.candidateSurvival.lexicalRequests = [];
        debug.candidateSurvival.stages = [];
        debug.candidateSurvival.removals = [];
        debug.candidateSurvival.omittedRemovals = 0;
        observation.responseBytes = Buffer.byteLength(JSON.stringify(observation.response), "utf8");
    }
    const capture = buildSearchCandidateCapture(suite, observations, { requireReplayReady: true });

    assert.deepEqual(capture.replayReadiness.policyInvariantTaskIds, ["ignore-owner"]);
    assert.deepEqual(capture.replayReadiness.fusionTaskIds, []);
    assert.equal(capture.captures[0].readiness.fusionReplayStatus, "not_applicable");

    const baseline = replayBaselineCandidateCapture(capture);
    const contender = replayCandidateCapture(capture, contenderPolicy());
    const frozenComponent = replayCandidateCapture(
        capture,
        frozenComponentPolicy("B-P0"),
    );
    assert.equal(baseline.tasks[0].route.kind, "exact_registry");
    assert.equal(baseline.tasks[0].policyAffected, false);
    assert.deepEqual(baseline.tasks[0].corePasses, []);
    assert.deepEqual(contender.tasks[0].rankedResults, baseline.tasks[0].rankedResults);
    assert.equal(contender.tasks[0].policyAffected, false);
    assert.deepEqual(
        frozenComponent.tasks[0].rankedResults,
        baseline.tasks[0].rankedResults,
    );
    assert.deepEqual(frozenComponent.tasks[0].invariants, {
        candidateMembershipIdentityEqual: true,
        eligibilityIdentityEqual: true,
        exactIdentifierIdentityEqual: true,
    });
});

test("baseline replay uses the captured product depth for each Core pass", () => {
    const suite = taskSuite();
    const observations = observationSet(suite);
    for (const observation of observations.observations) {
        const trace = observation.response.hints.debugSearch.candidateSurvival;
        trace.corePasses[0].productCandidateLimit = 1;
        for (const stageName of ["raw_dense", "raw_lexical"]) {
            const stage = trace.stages.find((candidate) => candidate.stage === stageName);
            stage.candidates.push({
                ...stage.candidates[0],
                candidateId: "candidate-2",
                ownerId: '["file","src/secondary.ts"]',
                evidenceOccurrenceId: JSON.stringify(["candidate-2", stageName, 2]),
                relativePath: "src/secondary.ts",
                rank: 2,
                score: 0.5,
            });
            stage.totalOccurrences = 2;
            stage.uniqueCandidates = 2;
        }
        observation.responseBytes = Buffer.byteLength(JSON.stringify(observation.response), "utf8");
    }
    const capture = buildSearchCandidateCapture(suite, observations);

    const replay = replayBaselineCandidateCapture(capture);

    assert.equal(capture.captures[0].queryPlan.candidateLimit, 80);
    assert.equal(capture.captures[0].candidateTrace.corePasses[0].productCandidateLimit, 1);
    assert.equal(replay.tasks[0].corePasses[0].candidateCount, 1);
});

test("contender replay proves baseline first and carries a conditional OR candidate through both RRF stages", () => {
    const suite = taskSuite();
    suite.tasks[0].workload.invocations[0].args.debugCandidateLimit = 160;
    const capture = buildSearchCandidateCapture(
        suite,
        replayReadyObservationSet(suite),
        { requireReplayReady: true },
    );
    const replay = replayCandidateCapture(capture, contenderPolicy());

    assert.equal(capture.version, 1);
    assert.equal(replay.version, 1);
    assert.equal(replay.baselineReproduced, true);
    assert.equal(replay.providerValidationRequired, true);
    assert.deepEqual(replay.replayCoverage, {
        coreFusion: true,
        mcpFusion: true,
        postFusionLocalScoring: true,
        rerankerAdmission: true,
        rerankerProviderOutput: false,
        groupingAndDisclosure: false,
        groupingMembership: "frozen_production_capture",
        responseByteBudget: false,
        fusionTaskCount: 1,
        exactRegistryPolicyInvariantTaskCount: 0,
    });
    assert.equal(replay.tasks[0].corePasses[0].fallbackActivated, true);
    assert.deepEqual(
        replay.tasks[0].corePasses[0].candidates.map((candidate) => candidate.candidateId),
        ["candidate-1", "fallback-candidate"],
    );
    assert.deepEqual(
        replay.tasks[0].mcpAttempts[0].candidates.map((candidate) => candidate.candidateId),
        ["fallback-candidate", "candidate-1"],
    );
    assert.deepEqual(
        replay.tasks[0].mcpAttempts[0].candidates.map((candidate) => candidate.symbolLabel),
        ["fallbackOwner", "reconcileIgnoreRules"],
    );
    assert.deepEqual(
        replay.tasks[0].mcpAttempts[0].candidates.map((candidate) => candidate.symbolId),
        ["fallback-symbol", "primary-symbol"],
    );
    assert.deepEqual(
        replay.tasks[0].rerankerAdmission.selectedCandidateIds,
        ["fallback-candidate", "candidate-1"],
    );
    assert.equal(replay.tasks[0].rerankerAdmission.inputUtf8Bytes, 200);
    assert.equal(replay.replayRuntime.policySource.kind, "canonical_inline");
    assert.match(replay.replayRuntime.policySource.sha256, /^[0-9a-f]{64}$/);

    const malformed = contenderPolicy();
    malformed.core.unrecognized = true;
    assert.throws(
        () => replayCandidateCapture(capture, malformed),
        /must contain exactly/,
    );
});

test("version 2 baseline and contender replay production grouping and disclosure order", () => {
    const suite = taskSuite();
    suite.version = 2;
    suite.tasks[0].split = "tuning";
    Object.assign(suite.tasks[0].workload.invocations[0].args, {
        limit: 10,
        disclosureLimit: 5,
        debugCandidateLimit: 160,
    });
    const capture = buildSearchCandidateCapture(
        suite,
        groupingReadyObservationSet(suite),
        {
            requireReplayReady: true,
            requireGroupingReady: true,
            requireNeuralDisabled: true,
        },
    );

    const baseline = replayBaselineCandidateCapture(
        capture,
        { requireGroupingReady: true, requireNeuralDisabled: true },
    );
    const groupingPolicy = contenderPolicy();
    groupingPolicy.policyId = "grouping-neutral-v1";
    groupingPolicy.core.minimums.fallbackLexical = 0;
    groupingPolicy.core.fallback.preciseUniqueCountBelow = 1;
    groupingPolicy.mcp.rrfK = 100;
    const contender = replayCandidateCapture(
        capture,
        groupingPolicy,
        {
            split: "tuning",
            requireGroupingReady: true,
            requireNeuralDisabled: true,
        },
    );

    assert.equal(baseline.routeCoverage.groupingDisclosureExact, true);
    assert.equal(capture.replayReadiness.groupingDisclosureReady, true);
    assert.equal(capture.replayReadiness.neuralDisabled, true);
    assert.equal(baseline.routeCoverage.groupingDisclosureTaskCount, 1);
    assert.deepEqual(
        baseline.tasks[0].groupingDisclosure.groupedResults,
        baseline.tasks[0].groupingDisclosure.disclosedResults,
    );
    assert.equal(contender.replayCoverage.groupingAndDisclosure, true);
    assert.equal(contender.replayCoverage.groupingMembership, "frozen_production_capture");
    assert.equal(contender.replayCoverage.responseByteBudget, false);
    assert.deepEqual(contender.groupingIncompleteTasks, []);
    assert.deepEqual(
        contender.tasks[0].groupingDisclosure.groupedResults,
        contender.tasks[0].groupingDisclosure.disclosedResults,
    );
    assert.notEqual(
        contender.tasks[0].groupingDisclosure.groupedResults[0].score,
        baseline.tasks[0].groupingDisclosure.groupedResults[0].score,
    );
});

test("R2 component policies preserve frozen candidates and vary only the authorized score component", () => {
    const suite = taskSuite();
    suite.version = 2;
    suite.tasks[0].split = "tuning";
    Object.assign(suite.tasks[0].workload.invocations[0].args, {
        limit: 10,
        disclosureLimit: 5,
        debugCandidateLimit: 160,
    });
    const capture = buildSearchCandidateCapture(
        suite,
        groupingReadyObservationSet(suite),
        {
            requireReplayReady: true,
            requireGroupingReady: true,
            requireNeuralDisabled: true,
        },
    );
    const replayOptions = {
        split: "tuning",
        requireGroupingReady: true,
        requireNeuralDisabled: true,
    };

    const explicitBaseline = replayCandidateCapture(
        capture,
        frozenComponentPolicy("B"),
        replayOptions,
    );
    const neutralPath = replayCandidateCapture(
        capture,
        frozenComponentPolicy("B-P0"),
        replayOptions,
    );
    const disabledAuthority = replayCandidateCapture(
        capture,
        frozenComponentPolicy("B-A0"),
        replayOptions,
    );
    const baselineCandidate = explicitBaseline.tasks[0].mcpAttempts[0].candidates[0];
    const neutralPathCandidate = neutralPath.tasks[0].mcpAttempts[0].candidates[0];
    const disabledAuthorityCandidate =
        disabledAuthority.tasks[0].mcpAttempts[0].candidates[0];

    assert.equal(explicitBaseline.baselineReproduced, true);
    assert.equal(explicitBaseline.providerValidationRequired, false);
    assert.deepEqual(explicitBaseline.tasks[0].invariants, {
        candidateMembershipIdentityEqual: true,
        eligibilityIdentityEqual: true,
    });
    assert.deepEqual(
        explicitBaseline.tasks[0].groupingDisclosure,
        replayBaselineCandidateCapture(capture, replayOptions).tasks[0].groupingDisclosure,
    );
    assert.equal(neutralPathCandidate.capturedPathMultiplier, 1);
    assert.equal(neutralPathCandidate.pathMultiplier, 1);
    assert.equal(
        disabledAuthorityCandidate.capturedEntrypointOwnerScoreBoost,
        SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,
    );
    assert.equal(disabledAuthorityCandidate.entrypointOwnerScoreBoost, 0);
    assert.equal(
        baselineCandidate.finalScore - disabledAuthorityCandidate.finalScore,
        SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,
    );

    const malformed = frozenComponentPolicy("B-P0");
    malformed.scoring.entrypointOwnerScore = "disabled";
    assert.throws(
        () => replayCandidateCapture(capture, malformed, replayOptions),
        /changes an unauthorized component/,
    );
});

test("version 2 negative-exposure tasks retain replayable candidate traces", () => {
    const suite = taskSuite();
    suite.version = 2;
    Object.assign(suite.tasks[0], {
        split: "tuning",
        queryClass: "negative_exposure",
        expected: {
            hardNegativeOwners: [{
                file: "src/sync.ts",
                symbol: "reconcileIgnoreRules",
            }],
        },
    });
    Object.assign(suite.tasks[0].workload.invocations[0].args, {
        limit: 10,
        disclosureLimit: 5,
        debugCandidateLimit: 160,
    });

    const capture = buildSearchCandidateCapture(
        suite,
        groupingReadyObservationSet(suite),
        {
            requireReplayReady: true,
            requireGroupingReady: true,
            requireNeuralDisabled: true,
        },
    );
    const replay = replayBaselineCandidateCapture(
        capture,
        {
            requireGroupingReady: true,
            requireNeuralDisabled: true,
        },
    );

    assert.deepEqual(capture.captures[0].expected, {
        hardNegativeOwners: [{
            file: "src/sync.ts",
            symbol: "reconcileIgnoreRules",
        }],
    });
    assert.equal(capture.captures[0].queryClass, "negative_exposure");
    assert.equal(capture.replayReadiness.groupingDisclosureReady, true);
    assert.equal(capture.replayReadiness.neuralDisabled, true);
    assert.equal(replay.routeCoverage.groupingDisclosureExact, true);
    assert.equal(replay.tasks[0].groupingDisclosure.disclosedResults.length, 1);
});

test("R2 capture qualification rejects neural capability or provider work", () => {
    const suite = taskSuite();
    suite.tasks[0].workload.invocations[0].args.debugCandidateLimit = 160;

    assert.throws(
        () => buildSearchCandidateCapture(
            suite,
            replayReadyObservationSet(suite),
            {
                requireReplayReady: true,
                requireNeuralDisabled: true,
            },
        ),
        /neural reranking authority or work/,
    );
});

test("contender tuning replay does not process validation captures", () => {
    const suite = taskSuite();
    suite.tasks[0].workload.invocations[0].args.debugCandidateLimit = 160;
    const capture = buildSearchCandidateCapture(
        suite,
        replayReadyObservationSet(suite),
        { requireReplayReady: true },
    );
    const template = capture.captures[0];
    capture.captures = [
        { ...structuredClone(template), taskId: "tuning-ignore-owner" },
        { ...structuredClone(template), taskId: "validation-ignore-owner" },
    ];
    const { sha256: _captureSha256, ...unsignedCapture } = capture;
    capture.sha256 = sha256Canonical(unsignedCapture);

    const replay = replayCandidateCapture(capture, contenderPolicy(), { taskPrefix: "tuning" });
    assert.equal(replay.taskPrefix, "tuning");
    assert.deepEqual(replay.tasks.map((task) => task.taskId), ["tuning-ignore-owner"]);
});

test("task-suite v2 replay selects explicit splits independently of task IDs", () => {
    const template = taskSuite().tasks[0];
    const suite = {
        version: 2,
        tasks: [
            { ...structuredClone(template), id: "arbitrary-a", split: "tuning" },
            { ...structuredClone(template), id: "arbitrary-b", split: "held_out" },
        ],
    };
    for (const task of suite.tasks) {
        task.workload.invocations[0].args.debugCandidateLimit = 160;
    }
    const capture = buildSearchCandidateCapture(
        suite,
        replayReadyObservationSet(suite, replayReadyCandidateTraceV2),
        { requireReplayReady: true },
    );

    const replay = replayCandidateCapture(capture, contenderPolicy(), {
        split: "held_out",
    });

    assert.equal(capture.taskSuiteVersion, 2);
    assert.equal(capture.version, 2);
    assert.deepEqual(
        capture.captures.map(({ taskId, split }) => ({ taskId, split })),
        [
            { taskId: "arbitrary-a", split: "tuning" },
            { taskId: "arbitrary-b", split: "held_out" },
        ],
    );
    assert.equal(replay.split, "held_out");
    assert.deepEqual(replay.tasks.map((task) => task.taskId), ["arbitrary-b"]);
    assert.throws(
        () => replayCandidateCapture(capture, contenderPolicy(), {
            taskPrefix: "tuning",
        }),
        /do not accept legacy taskPrefix/,
    );
});

test("candidate capture CLI rejects held-out material without an opening record", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "satori-heldout-capture-gate-"));
    try {
        const tasksFile = path.join(tempDir, "tasks.json");
        const observationsFile = path.join(tempDir, "observations.json");
        fs.writeFileSync(tasksFile, JSON.stringify({
            version: 2,
            tasks: [{ id: "opaque-task", split: "held_out" }],
        }));
        fs.writeFileSync(observationsFile, "{}");

        assert.throws(
            () => captureMain(["--tasks", tasksFile, "--observations", observationsFile]),
            /requires --held-out-opening/,
        );
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("contender replay excludes a fallback candidate with a recorded diagnostic removal", () => {
    const suite = taskSuite();
    suite.tasks[0].workload.invocations[0].args.debugCandidateLimit = 160;
    const observations = replayReadyObservationSet(suite);
    for (const observation of observations.observations) {
        const trace = observation.response.hints.debugSearch.candidateSurvival;
        const signals = trace.stages.find((stage) => stage.stage === "mcp_replay_signals");
        signals.candidates = signals.candidates.filter(
            (candidate) => candidate.candidateId !== "fallback-candidate",
        );
        signals.totalOccurrences = signals.candidates.length;
        signals.uniqueCandidates = signals.candidates.length;
        trace.removals.push({
            candidateId: "fallback-candidate",
            afterStage: "mcp_filtered",
            reason: "scope_filter",
            passId: "attempt:1/diagnostic_replay",
        });
        observation.responseBytes = Buffer.byteLength(JSON.stringify(observation.response), "utf8");
    }
    const capture = buildSearchCandidateCapture(suite, observations, { requireReplayReady: true });

    const replay = replayCandidateCapture(capture, contenderPolicy());

    assert.deepEqual(replay.tasks[0].mcpAttempts[0].removed, [{
        candidateId: "fallback-candidate",
        reason: "scope_filter",
    }]);
    assert.deepEqual(replay.tasks[0].rerankerAdmission.selectedCandidateIds, ["candidate-1"]);
});

test("contender replay remains complete when only diagnostic removal reasons are truncated", () => {
    const suite = taskSuite();
    suite.tasks[0].workload.invocations[0].args.debugCandidateLimit = 160;
    const observations = replayReadyObservationSet(suite);
    for (const observation of observations.observations) {
        const trace = observation.response.hints.debugSearch.candidateSurvival;
        const signals = trace.stages.find((stage) => stage.stage === "mcp_replay_signals");
        signals.candidates = signals.candidates.filter(
            (candidate) => candidate.candidateId !== "fallback-candidate",
        );
        signals.totalOccurrences = signals.candidates.length;
        signals.uniqueCandidates = signals.candidates.length;
        trace.omittedRemovals = 1;
        observation.responseBytes = Buffer.byteLength(JSON.stringify(observation.response), "utf8");
    }
    const capture = buildSearchCandidateCapture(
        suite,
        observations,
        { requireReplayReady: true },
    );

    const replay = replayCandidateCapture(capture, contenderPolicy());
    assert.equal(capture.replayReadiness.survivalReady, true);
    assert.equal(capture.replayReadiness.removalReasonsComplete, false);
    assert.deepEqual(replay.tasks[0].mcpAttempts[0].removed, [{
        candidateId: "fallback-candidate",
        reason: "filtered_before_local_scoring_reason_unrecorded",
    }]);
});

test("replay CLI binds the exact policy-file bytes and executable manifest", () => {
    const suite = taskSuite();
    suite.tasks[0].workload.invocations[0].args.debugCandidateLimit = 160;
    const capture = buildSearchCandidateCapture(
        suite,
        replayReadyObservationSet(suite),
        { requireReplayReady: true },
    );
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "satori-candidate-replay-identity-"));
    try {
        const captureFile = path.join(temp, "capture.json");
        const policyFile = path.join(temp, "contender.json");
        const outputFile = path.join(temp, "replay.json");
        const policyBytes = Buffer.from(`${JSON.stringify(contenderPolicy(), null, 2)}\n`, "utf8");
        fs.writeFileSync(captureFile, JSON.stringify(capture));
        fs.writeFileSync(policyFile, policyBytes);

        const run = spawnSync(process.execPath, [
            "--import", "tsx",
            REPLAY_SCRIPT_PATH,
            "--capture", captureFile,
            "--policy-file", policyFile,
            "--out", outputFile,
        ], { encoding: "utf8" });
        assert.equal(run.status, 0, run.stderr);
        const replay = JSON.parse(fs.readFileSync(outputFile, "utf8"));
        assert.equal(replay.replayRuntime.policySource.kind, "file_bytes");
        assert.equal(replay.replayRuntime.policySource.fileName, "contender.json");
        assert.equal(replay.replayRuntime.policySource.bytes, policyBytes.length);
        assert.equal(
            replay.replayRuntime.policySource.sha256,
            crypto.createHash("sha256").update(policyBytes).digest("hex"),
        );
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test("replay CLI rejects unknown or mismatched sealed authority digests", () => {
    const suite = taskSuite();
    suite.tasks[0].workload.invocations[0].args.debugCandidateLimit = 160;
    const capture = buildSearchCandidateCapture(
        suite,
        replayReadyObservationSet(suite),
        { requireReplayReady: true },
    );
    const sha = (character) => character.repeat(64);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "satori-replay-authority-"));
    try {
        const captureFile = path.join(temp, "capture.json");
        const policyFile = path.join(temp, "contender.json");
        const outputFile = path.join(temp, "replay.json");
        const policyBytes = Buffer.from(`${JSON.stringify(contenderPolicy(), null, 2)}\n`, "utf8");
        fs.writeFileSync(captureFile, JSON.stringify(capture));
        fs.writeFileSync(policyFile, policyBytes);
        const sealed = {
            contractSha256: sha("a"),
            policySha256: sha256Canonical(JSON.parse(policyBytes.toString("utf8"))),
            qualificationTargetSha256: sha("c"),
        };
        const invoke = (authoritiesFile) => spawnSync(process.execPath, [
            "--import", "tsx",
            REPLAY_SCRIPT_PATH,
            "--capture", captureFile,
            "--policy-file", policyFile,
            "--authorities", authoritiesFile,
            "--out", outputFile,
        ], { encoding: "utf8" });

        const mismatched = path.join(temp, "authorities-mismatch.json");
        fs.writeFileSync(mismatched, JSON.stringify({ ...sealed, policySha256: sha("d") }));
        const mismatchRun = invoke(mismatched);
        assert.equal(mismatchRun.status, 1);
        assert.match(mismatchRun.stderr, /sealed authority/);

        const unknown = path.join(temp, "authorities-unknown.json");
        fs.writeFileSync(unknown, JSON.stringify({ ...sealed, extra: sha("e") }));
        const unknownRun = invoke(unknown);
        assert.equal(unknownRun.status, 1);

        const malformed = path.join(temp, "authorities-malformed.json");
        fs.writeFileSync(malformed, JSON.stringify({ ...sealed, contractSha256: "not-a-digest" }));
        const malformedRun = invoke(malformed);
        assert.equal(malformedRun.status, 1);

        const valid = path.join(temp, "authorities.json");
        fs.writeFileSync(valid, JSON.stringify(sealed));
        const validRun = invoke(valid);
        assert.equal(validRun.status, 0, validRun.stderr);
        const replay = JSON.parse(fs.readFileSync(outputFile, "utf8"));
        assert.deepEqual(replay.authorities, sealed);
        assert.match(replay.sha256, /^[0-9a-f]{64}$/);
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test("replay executable routes direct invocation through the pinned TypeScript loader", () => {
    const executed = spawnSync(REPLAY_SCRIPT_PATH, ["--help"], {
        encoding: "utf8",
    });

    assert.equal(executed.status, 0, executed.stderr);
    assert.match(executed.stdout, /--import tsx/);
});

test("baseline replay rejects fusion score drift and tampered capture bytes", () => {
    const suite = taskSuite();
    const capture = buildSearchCandidateCapture(suite, observationSet(suite));
    const tampered = structuredClone(capture);
    tampered.captures[0].candidateTrace.stages.find(
        (stage) => stage.stage === "core_fusion",
    ).candidates[0].score = 0.5;
    assert.throws(
        () => replayBaselineCandidateCapture(tampered),
        /digest does not match/,
    );

    const internallyConsistent = structuredClone(tampered);
    internallyConsistent.captures[0].candidateTraceDigest = sha256Canonical(
        internallyConsistent.captures[0].candidateTrace,
    );
    const { sha256: _ignored, ...unsigned } = internallyConsistent;
    internallyConsistent.sha256 = sha256Canonical(unsigned);
    assert.throws(
        () => replayBaselineCandidateCapture(internallyConsistent),
        /Core pass.*score mismatch/,
    );
});

test("candidate capture rejects drift between cold and warm traces", () => {
    const suite = taskSuite();
    const observations = observationSet(suite);
    observations.observations[1].response.hints.debugSearch.candidateSurvival.stages[0]
        .candidates[0].candidateId = "different-candidate";
    observations.observations[1].responseBytes = Buffer.byteLength(
        JSON.stringify(observations.observations[1].response),
        "utf8",
    );

    assert.throws(
        () => buildSearchCandidateCapture(suite, observations),
        /changed candidateTraceDigest across cold\/warm samples/,
    );
});

test("candidate capture accepts complete source-unchanged no-sync evidence", () => {
    const suite = taskSuite();
    const observations = observationSet(suite);
    observations.observations[1].freshnessModes = ["skipped_source_unchanged"];

    assert.doesNotThrow(() => buildSearchCandidateCapture(suite, observations));
});

test("candidate capture rejects missing no-sync evidence or a changed final index proof", () => {
    const suite = taskSuite();
    const mutatingObservation = observationSet(suite);
    mutatingObservation.observations[0].freshnessModes = ["synced"];
    assert.throws(
        () => buildSearchCandidateCapture(suite, mutatingObservation),
        /requires authoritative no-sync freshness evidence/,
    );

    const driftedProof = observationSet(suite);
    driftedProof.metadata.taskRuns[0].finalIndexProof.generation = 8;
    assert.throws(
        () => buildSearchCandidateCapture(suite, driftedProof),
        /index proof changed during measured samples/,
    );
});

test("candidate capture fails closed when replay readiness is required", () => {
    const suite = taskSuite();
    assert.throws(
        () => buildSearchCandidateCapture(suite, observationSet(suite), { requireReplayReady: true }),
        /not replay-ready/,
    );
});

test("candidate capture rejects a dense plan without a query-vector digest", () => {
    const suite = taskSuite();
    const observations = observationSet(suite);
    for (const observation of observations.observations) {
        observation.response.hints.debugSearch.candidateSurvival.queryEmbeddings[0].sha256 = null;
        observation.responseBytes = Buffer.byteLength(JSON.stringify(observation.response), "utf8");
    }
    assert.throws(
        () => buildSearchCandidateCapture(suite, observations),
        /requires a query-embedding SHA-256 digest/,
    );
});

test("candidate capture rejects source-bearing or publication-unbound traces", () => {
    const suite = taskSuite();
    const sourceBearing = observationSet(suite);
    sourceBearing.observations[0].response.hints.debugSearch.candidateSurvival.stages[0]
        .candidates[0].content = "source must not enter the capture";
    sourceBearing.observations[0].responseBytes = Buffer.byteLength(
        JSON.stringify(sourceBearing.observations[0].response),
        "utf8",
    );
    assert.throws(
        () => buildSearchCandidateCapture(suite, sourceBearing),
        /must not contain source-bearing field 'content'/,
    );

    const republished = observationSet(suite);
    republished.observations[1].generationReceipt.publication.markerRunId = "replacement";
    assert.throws(
        () => buildSearchCandidateCapture(suite, republished),
        /not bound to the arm publication identity/,
    );
});

test("candidate capture rejects lexical fallback terms that do not match the recorded query digest", () => {
    const suite = taskSuite();
    const observations = replayReadyObservationSet(suite);
    observations.observations[0].response.hints.debugSearch.candidateSurvival.lexicalRequests[1]
        .terms.push("different");
    observations.observations[0].responseBytes = Buffer.byteLength(
        JSON.stringify(observations.observations[0].response),
        "utf8",
    );
    assert.throws(
        () => buildSearchCandidateCapture(suite, observations),
        /terms do not match querySha256/,
    );
});

test("candidate capture CLI rejects evaluation artifacts inside the indexed repository", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "satori-candidate-capture-"));
    try {
        const repoRoot = path.join(temporary, "repo");
        const outside = path.join(temporary, "outside");
        fs.mkdirSync(repoRoot);
        fs.mkdirSync(outside);
        const suite = taskSuite();
        const observations = observationSet(suite);
        observations.metadata.repoRoot = repoRoot;
        const tasksFile = path.join(repoRoot, "tasks.json");
        const observationsFile = path.join(outside, "observations.json");
        fs.writeFileSync(tasksFile, JSON.stringify(suite));
        fs.writeFileSync(observationsFile, JSON.stringify(observations));

        const result = spawnSync(process.execPath, [
            SCRIPT_PATH,
            "--tasks", tasksFile,
            "--observations", observationsFile,
        ], { encoding: "utf8" });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Task suite must be outside the indexed repository/);
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});

test("survival_v3_round_trips_without_source_payload", async () => {
    const { buildSurvivalV3Record, roundTripSurvivalV3Record } = await import("./satori-search-candidate-capture.mjs");
    // The canonical structure for schemaVersion 'search_candidate_survival_v3'
    // is the per-candidate bounded record with sourcePayloadAbsent: true.
    const value = {
        queryId: "q1",
        candidateId: "c1",
        admissionRank: 1,
        baselineScore: 0.5,
        finalScore: 0.75,
        passes: [
            { passId: "attempt:1/primary", rank: 1, contribution: 0.75 },
            { passId: "attempt:2/primary", rank: 2, contribution: 0.5 },
        ],
    };
    const captured = buildSurvivalV3Record(value);
    assert.equal(captured.schemaVersion, "search_candidate_survival_v3");
    assert.equal(captured.sourcePayloadAbsent, true);
    assert.deepEqual(Object.keys(captured).sort(), [
        "schemaVersion", "queryId", "candidateId", "admissionRank",
        "baselineScore", "finalScore", "passes", "sourcePayloadAbsent",
    ].sort());
    assert.deepEqual(
        roundTripSurvivalV3Record(JSON.parse(JSON.stringify(captured))),
        captured,
    );
    assert.throws(
        () => roundTripSurvivalV3Record({ ...captured, content: "secret" }),
        /contain exactly/,
    );
    assert.throws(
        () => roundTripSurvivalV3Record({ ...captured, sourcePayloadAbsent: false }),
        /sourcePayloadAbsent must be true/,
    );
});
