#!/usr/bin/env -S node --import tsx
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
    computeSearchCandidateFinalScore,
    SEARCH_CANDIDATE_FINAL_SCORE_POLICY_ID,
    SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,
    sortSearchCandidates,
} from "../packages/mcp/src/core/search-ranking-policy.ts";
import {
    SEARCH_RERANK_RRF_K,
    SEARCH_RERANK_WEIGHT,
} from "../packages/mcp/src/core/search-constants.ts";
import {
    computeSearchGroupScore,
    rankAndDiversifySearchGroups,
} from "../packages/mcp/src/core/search-group-results.ts";
import { projectGroupedDisclosure } from "../packages/mcp/src/core/search-disclosure.ts";
import { canonicalJson } from "./satori-useful-context.mjs";

const CORE_RRF_K = 100;
const SCORE_TOLERANCE = 1e-12;
const TRACE_SCHEMA_V1 = "search_candidate_survival_v1";
const TRACE_SCHEMA_V2 = "search_candidate_survival_v2";
const ENTRYPOINT_OWNER_SCORE_REASONS = new Set([
    "manifest_entrypoint_owner",
    "not_applicable",
]);
const REPLAY_SCRIPT_PATH = fileURLToPath(import.meta.url);
const CANONICAL_JSON_HELPER_PATH = fileURLToPath(
    new URL("./satori-useful-context.mjs", import.meta.url),
);
const PRODUCTION_SCORING_OWNER_PATH = fileURLToPath(
    new URL("../packages/mcp/src/core/search-ranking-policy.ts", import.meta.url),
);
const PRODUCTION_GROUPING_OWNER_PATH = fileURLToPath(
    new URL("../packages/mcp/src/core/search-group-results.ts", import.meta.url),
);
const PRODUCTION_GROUP_ORDERING_OWNER_PATH = fileURLToPath(
    new URL("../packages/mcp/src/core/search-group-ordering.ts", import.meta.url),
);
const PRODUCTION_DIVERSITY_OWNER_PATH = fileURLToPath(
    new URL("../packages/mcp/src/core/search-grouping.ts", import.meta.url),
);
const PRODUCTION_DISCLOSURE_OWNER_PATH = fileURLToPath(
    new URL("../packages/mcp/src/core/search-disclosure.ts", import.meta.url),
);
const TSX_LOADER_PATH = fileURLToPath(import.meta.resolve("tsx"));
const REPOSITORY_LOCKFILE_PATH = fileURLToPath(new URL("../pnpm-lock.yaml", import.meta.url));

function resolvePackageManifest(startPath, expectedName) {
    let current = path.dirname(startPath);
    while (current !== path.dirname(current)) {
        const manifestPath = path.join(current, "package.json");
        if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            if (manifest.name === expectedName) {
                return { manifestPath, manifest };
            }
        }
        current = path.dirname(current);
    }
    throw new Error(`Unable to resolve package manifest for '${expectedName}'.`);
}

const TSX_PACKAGE = resolvePackageManifest(TSX_LOADER_PATH, "tsx");

function sha256FileArtifact(file, role) {
    const bytes = fs.readFileSync(file);
    return {
        role,
        fileName: path.basename(file),
        bytes: bytes.length,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    };
}

const REPLAY_EXECUTABLE_ARTIFACTS = Object.freeze([
    Object.freeze(sha256FileArtifact(REPLAY_SCRIPT_PATH, "replay_executable")),
    Object.freeze(sha256FileArtifact(CANONICAL_JSON_HELPER_PATH, "canonical_json_helper")),
    Object.freeze(sha256FileArtifact(PRODUCTION_SCORING_OWNER_PATH, "production_scoring_owner")),
    Object.freeze(sha256FileArtifact(PRODUCTION_GROUPING_OWNER_PATH, "production_grouping_owner")),
    Object.freeze(sha256FileArtifact(
        PRODUCTION_GROUP_ORDERING_OWNER_PATH,
        "production_group_ordering_owner",
    )),
    Object.freeze(sha256FileArtifact(PRODUCTION_DIVERSITY_OWNER_PATH, "production_diversity_owner")),
    Object.freeze(sha256FileArtifact(
        PRODUCTION_DISCLOSURE_OWNER_PATH,
        "production_disclosure_owner",
    )),
    Object.freeze(sha256FileArtifact(TSX_LOADER_PATH, "typescript_loader")),
    Object.freeze(sha256FileArtifact(TSX_PACKAGE.manifestPath, "typescript_loader_manifest")),
    Object.freeze(sha256FileArtifact(REPOSITORY_LOCKFILE_PATH, "dependency_lockfile")),
]);

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
    const normalized = requireString(value, label).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalized)) {
        throw new Error(`${label} must be a SHA-256 hex digest.`);
    }
    return normalized;
}

function requireExactKeys(value, keys, label) {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    if (canonicalJson(actual) !== canonicalJson(expected)) {
        throw new Error(`${label} must contain exactly: ${expected.join(", ")}.`);
    }
}

function requirePositiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error(`${label} must be a positive safe integer.`);
    }
    return value;
}

function requireNonNegativeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${label} must be a non-negative safe integer.`);
    }
    return value;
}

function requirePositiveFinite(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new Error(`${label} must be a positive finite number.`);
    }
    return value;
}

function requireNonNegativeFinite(value, label) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new Error(`${label} must be a non-negative finite number.`);
    }
    return value;
}

function sha256Canonical(value) {
    return crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function buildReplayRuntimeManifest(capture, policyValue, options = {}) {
    const policySourceBytes = options.policySourceBytes === undefined
        ? Buffer.from(policyValue === "baseline" ? "baseline" : canonicalJson(policyValue), "utf8")
        : Buffer.from(options.policySourceBytes);
    if (policyValue !== "baseline" && options.policySourceBytes !== undefined) {
        let parsedPolicySource;
        try {
            parsedPolicySource = JSON.parse(policySourceBytes.toString("utf8"));
        } catch {
            throw new Error("Replay policy source bytes must contain valid JSON.");
        }
        if (canonicalJson(parsedPolicySource) !== canonicalJson(policyValue)) {
            throw new Error("Replay policy source bytes do not match the replay policy.");
        }
    }
    const policySource = {
        kind: options.policySourceBytes === undefined ? "canonical_inline" : "file_bytes",
        ...(options.policySourceFileName
            ? { fileName: path.basename(options.policySourceFileName) }
            : {}),
        bytes: policySourceBytes.length,
        sha256: crypto.createHash("sha256").update(policySourceBytes).digest("hex"),
    };
    const manifest = {
        schemaVersion: 1,
        measuredRuntimeSha256: requireSha256(
            capture.authority?.runtimeSha256,
            "Candidate capture runtimeSha256",
        ),
        node: {
            version: process.version,
            platform: process.platform,
            arch: process.arch,
        },
        typescriptLoader: {
            name: "tsx",
            version: requireString(TSX_PACKAGE.manifest.version, "tsx package version"),
            resolvedArtifact: path.basename(TSX_LOADER_PATH),
        },
        artifacts: REPLAY_EXECUTABLE_ARTIFACTS.map((artifact) => ({ ...artifact })),
        policySource,
    };
    return { ...manifest, sha256: sha256Canonical(manifest) };
}

function requireCompleteStage(stage, label) {
    const record = requireRecord(stage, label);
    if (!Array.isArray(record.candidates)) throw new Error(`${label}.candidates must be an array.`);
    if (record.omittedOccurrences !== 0 || record.totalOccurrences !== record.candidates.length) {
        throw new Error(`${label} is truncated and cannot be replayed.`);
    }
    return record;
}

function compareCandidateIdentity(left, right) {
    return left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : 0;
}

function compareContractStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

function assertSameCandidatePayload(left, right, label) {
    const identity = (candidate) => ({
        candidateId: candidate.candidateId,
        ownerId: candidate.ownerId,
        relativePath: candidate.relativePath,
        startLine: candidate.startLine,
        endLine: candidate.endLine,
        language: candidate.language,
    });
    if (canonicalJson(identity(left)) !== canonicalJson(identity(right))) {
        throw new Error(`${label} contains conflicting payloads for candidate '${left.candidateId}'.`);
    }
}

function compactRankedArm(stage, label) {
    const seen = new Map();
    const ranked = [];
    for (const rawCandidate of requireCompleteStage(stage, label).candidates) {
        const candidate = requireRecord(rawCandidate, `${label} candidate`);
        requireString(candidate.candidateId, `${label} candidateId`);
        const prior = seen.get(candidate.candidateId);
        if (prior) {
            assertSameCandidatePayload(prior, candidate, label);
            continue;
        }
        seen.set(candidate.candidateId, candidate);
        ranked.push(candidate);
    }
    return ranked;
}

export function orderCapturedCoreArm(stage, depth, label = "Captured Core arm") {
    const candidates = requireCompleteStage(stage, label).candidates
        .slice(0, requirePositiveInteger(depth, `${label} depth`))
        .map((rawCandidate) => {
            const candidate = requireRecord(rawCandidate, `${label} candidate`);
            requireString(candidate.candidateId, `${label} candidateId`);
            if (typeof candidate.score !== "number" || !Number.isFinite(candidate.score)) {
                throw new Error(`${label} candidate '${candidate.candidateId}' has no finite score.`);
            }
            return candidate;
        })
        .sort((left, right) => (
            right.score - left.score || compareCandidateIdentity(left, right)
        ));
    const seen = new Map();
    const seenOwnerIds = new Set();
    const ranked = [];
    for (const candidate of candidates) {
        const prior = seen.get(candidate.candidateId);
        if (prior) {
            assertSameCandidatePayload(prior, candidate, label);
            continue;
        }
        seen.set(candidate.candidateId, candidate);
        const ownerId = requireString(candidate.ownerId, `${label} ownerId`);
        if (seenOwnerIds.has(ownerId)) {
            continue;
        }
        seenOwnerIds.add(ownerId);
        ranked.push(candidate);
    }
    return ranked;
}

export function replayCoreFusion(
    denseStage,
    preciseLexicalStage,
    fallbackLexicalStage,
    limit,
    label,
) {
    const byId = new Map();
    const addArm = (stage, armLabel) => {
        if (!stage) return;
        const candidates = orderCapturedCoreArm(stage, limit, `${label} ${armLabel}`);
        candidates.forEach((candidate, index) => {
            const score = 1 / (CORE_RRF_K + index + 1);
            const existing = byId.get(candidate.candidateId);
            if (existing) {
                assertSameCandidatePayload(existing.candidate, candidate, label);
                existing.score += score;
            } else {
                byId.set(candidate.candidateId, { candidate, score });
            }
        });
    };
    addArm(denseStage, "dense");
    const preciseLexical = preciseLexicalStage
        ? requireCompleteStage(preciseLexicalStage, `${label} precise lexical`).candidates
        : [];
    addArm(
        preciseLexical.length > 0 ? preciseLexicalStage : fallbackLexicalStage,
        preciseLexical.length > 0 ? "precise lexical" : "fallback lexical",
    );
    return [...byId.values()]
        .sort((left, right) => right.score - left.score || compareCandidateIdentity(
            left.candidate,
            right.candidate,
        ))
        .slice(0, limit);
}

function normalizeReplayPolicy(value) {
    const policy = requireRecord(value, "Replay policy");
    if (policy.version === 2) {
        requireExactKeys(
            policy,
            ["version", "kind", "policyId", "candidateSet", "scoring"],
            "Replay policy",
        );
        if (policy.kind !== "satori_search_candidate_policy") {
            throw new Error("Replay policy version or kind is unsupported.");
        }
        const policyId = requireString(policy.policyId, "Replay policy policyId");
        if (!["B", "B-P0", "B-A0"].includes(policyId)) {
            throw new Error("Frozen-component replay policyId must be B, B-P0, or B-A0.");
        }
        if (policy.candidateSet !== "frozen_baseline") {
            throw new Error("Frozen-component replay requires candidateSet=frozen_baseline.");
        }
        const scoring = requireRecord(policy.scoring, "Replay policy scoring");
        requireExactKeys(
            scoring,
            ["pathMultiplier", "entrypointOwnerScore"],
            "Replay policy scoring",
        );
        if (!["captured", "neutral"].includes(scoring.pathMultiplier)) {
            throw new Error("Replay policy scoring.pathMultiplier is unsupported.");
        }
        if (!["captured", "disabled"].includes(scoring.entrypointOwnerScore)) {
            throw new Error("Replay policy scoring.entrypointOwnerScore is unsupported.");
        }
        const expectedComponents = {
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
        if (canonicalJson(scoring) !== canonicalJson(expectedComponents[policyId])) {
            throw new Error(`Replay policy '${policyId}' changes an unauthorized component.`);
        }
        return {
            version: 2,
            kind: "satori_search_candidate_policy",
            policyId,
            candidateSet: "frozen_baseline",
            scoring: {
                pathMultiplier: scoring.pathMultiplier,
                entrypointOwnerScore: scoring.entrypointOwnerScore,
            },
        };
    }
    requireExactKeys(policy, ["version", "kind", "policyId", "core", "mcp"], "Replay policy");
    if (policy.version !== 1 || policy.kind !== "satori_search_candidate_policy") {
        throw new Error("Replay policy version or kind is unsupported.");
    }
    const policyId = requireString(policy.policyId, "Replay policy policyId");
    if (policyId === "baseline") {
        throw new Error("A contender policy must not use the reserved policyId 'baseline'.");
    }
    const core = requireRecord(policy.core, "Replay policy core");
    requireExactKeys(
        core,
        ["candidateDepth", "rrfK", "weights", "minimums", "fallback"],
        "Replay policy core",
    );
    const candidateDepth = requirePositiveInteger(core.candidateDepth, "Replay policy candidateDepth");
    if (![80, 120, 160].includes(candidateDepth)) {
        throw new Error("Replay policy candidateDepth must be one of 80, 120, or 160.");
    }
    const weights = requireRecord(core.weights, "Replay policy core.weights");
    const minimums = requireRecord(core.minimums, "Replay policy core.minimums");
    const sourceNames = ["dense", "preciseLexical", "fallbackLexical"];
    requireExactKeys(weights, sourceNames, "Replay policy core.weights");
    requireExactKeys(minimums, sourceNames, "Replay policy core.minimums");
    const normalizedWeights = Object.fromEntries(sourceNames.map((name) => [
        name,
        requirePositiveFinite(weights[name], `Replay policy core.weights.${name}`),
    ]));
    const normalizedMinimums = Object.fromEntries(sourceNames.map((name) => [
        name,
        requireNonNegativeInteger(minimums[name], `Replay policy core.minimums.${name}`),
    ]));
    if (Object.values(normalizedMinimums).reduce((total, count) => total + count, 0) > candidateDepth) {
        throw new Error("Replay policy source minimums must not exceed candidateDepth in total.");
    }
    const fallback = requireRecord(core.fallback, "Replay policy core.fallback");
    requireExactKeys(
        fallback,
        ["enabled", "preciseUniqueCountBelow"],
        "Replay policy core.fallback",
    );
    if (typeof fallback.enabled !== "boolean") {
        throw new Error("Replay policy core.fallback.enabled must be boolean.");
    }
    if (!fallback.enabled && normalizedMinimums.fallbackLexical !== 0) {
        throw new Error("Disabled fallback requires a zero fallbackLexical minimum.");
    }
    const mcp = requireRecord(policy.mcp, "Replay policy mcp");
    requireExactKeys(mcp, ["rrfK"], "Replay policy mcp");
    return {
        version: 1,
        kind: "satori_search_candidate_policy",
        policyId,
        core: {
            candidateDepth,
            rrfK: requirePositiveInteger(core.rrfK, "Replay policy core.rrfK"),
            weights: normalizedWeights,
            minimums: normalizedMinimums,
            fallback: {
                enabled: fallback.enabled,
                preciseUniqueCountBelow: requireNonNegativeInteger(
                    fallback.preciseUniqueCountBelow,
                    "Replay policy core.fallback.preciseUniqueCountBelow",
                ),
            },
        },
        mcp: {
            rrfK: requirePositiveInteger(mcp.rrfK, "Replay policy mcp.rrfK"),
        },
    };
}

function replayPolicyCorePass(capture, outputStage, policy) {
    const stages = capture.candidateTrace.stages;
    const passId = requireString(outputStage.passId, "Core output passId");
    const denseStage = stageByNameAndPass(stages, "raw_dense", passId);
    const preciseStage = stageByNameAndPass(stages, "raw_lexical", passId);
    const fallbackStage = stageByNameAndPass(stages, "raw_lexical_fallback", passId);
    const arms = {
        dense: denseStage
            ? orderCapturedCoreArm(
                denseStage,
                policy.core.candidateDepth,
                `Task '${capture.taskId}' dense '${passId}'`,
            )
            : [],
        preciseLexical: preciseStage
            ? orderCapturedCoreArm(
                preciseStage,
                policy.core.candidateDepth,
                `Task '${capture.taskId}' precise lexical '${passId}'`,
            )
            : [],
        fallbackLexical: fallbackStage
            ? orderCapturedCoreArm(
                fallbackStage,
                policy.core.candidateDepth,
                `Task '${capture.taskId}' fallback lexical '${passId}'`,
            )
            : [],
    };
    const fallbackActivated = policy.core.fallback.enabled
        && arms.preciseLexical.length < policy.core.fallback.preciseUniqueCountBelow;
    if (fallbackActivated && !fallbackStage) {
        throw new Error(`Task '${capture.taskId}' pass '${passId}' has no captured fallback arm.`);
    }
    const activeSources = [
        ["dense", arms.dense],
        ["preciseLexical", arms.preciseLexical],
        ...(fallbackActivated ? [["fallbackLexical", arms.fallbackLexical]] : []),
    ];
    const byId = new Map();
    for (const [source, candidates] of activeSources) {
        candidates.forEach((candidate, index) => {
            const contribution = policy.core.weights[source] / (policy.core.rrfK + index + 1);
            const existing = byId.get(candidate.candidateId);
            if (existing) {
                assertSameCandidatePayload(existing.candidate, candidate, `Task '${capture.taskId}' pass '${passId}'`);
                existing.score += contribution;
                existing.sources.add(source);
            } else {
                byId.set(candidate.candidateId, {
                    candidate,
                    score: contribution,
                    sources: new Set([source]),
                });
            }
        });
    }
    const fused = [...byId.values()].sort((left, right) => (
        right.score - left.score || compareCandidateIdentity(left.candidate, right.candidate)
    ));
    const admittedIds = new Set();
    for (const [source, candidates] of activeSources) {
        const minimum = policy.core.minimums[source];
        for (const candidate of candidates) {
            if (admittedIds.size >= policy.core.candidateDepth || minimum === 0) break;
            const admittedFromSource = [...admittedIds].filter((candidateId) => (
                byId.get(candidateId)?.sources.has(source)
            )).length;
            if (admittedFromSource >= minimum) break;
            admittedIds.add(candidate.candidateId);
        }
    }
    for (const candidate of fused) {
        if (admittedIds.size >= policy.core.candidateDepth) break;
        admittedIds.add(candidate.candidate.candidateId);
    }
    const ranked = fused.filter(({ candidate }) => admittedIds.has(candidate.candidateId));
    return {
        passId,
        mode: denseStage && preciseStage ? "hybrid" : denseStage ? "dense" : "lexical",
        fallbackActivated,
        sourceCounts: Object.fromEntries(Object.entries(arms).map(([source, candidates]) => [
            source,
            candidates.length,
        ])),
        candidates: ranked.map((entry, index) => ({
            candidate: entry.candidate,
            score: entry.score,
            sources: [...entry.sources].sort(),
            rank: index + 1,
        })),
    };
}

function assertRankedStageMatches(actual, expectedStage, label) {
    const expected = requireCompleteStage(expectedStage, label).candidates;
    if (actual.length !== expected.length) {
        throw new Error(`${label} replay count mismatch (${actual.length} != ${expected.length}).`);
    }
    for (let index = 0; index < actual.length; index += 1) {
        const replayed = actual[index];
        const recorded = requireRecord(expected[index], `${label} candidate ${index + 1}`);
        if (replayed.candidate.candidateId !== recorded.candidateId) {
            throw new Error(
                `${label} replay order mismatch at rank ${index + 1} `
                + `(${replayed.candidate.candidateId} score=${replayed.score} `
                + `path=${replayed.candidate.relativePath}:${replayed.candidate.startLine} != `
                + `${recorded.candidateId} score=${recorded.score} `
                + `path=${recorded.relativePath}:${recorded.startLine}).`,
            );
        }
        if (typeof replayed.score !== "number"
            || !Number.isFinite(replayed.score)
            || typeof recorded.score !== "number"
            || !Number.isFinite(recorded.score)
            || Math.abs(replayed.score - recorded.score) > SCORE_TOLERANCE) {
            throw new Error(`${label} replay score mismatch for '${recorded.candidateId}'.`);
        }
    }
}

function assertLocalScoringMatches(actual, expectedStage, label) {
    const expected = requireCompleteStage(expectedStage, label).candidates;
    if (actual.length !== expected.length) {
        throw new Error(`${label} replay count mismatch (${actual.length} != ${expected.length}).`);
    }
    for (let index = 0; index < actual.length; index += 1) {
        const replayed = actual[index];
        const recorded = requireRecord(expected[index], `${label} candidate ${index + 1}`);
        if (replayed.candidate.candidateId !== recorded.candidateId) {
            throw new Error(
                `${label} replay order mismatch at rank ${index + 1} `
                + `(${replayed.candidate.candidateId} score=${replayed.finalScore} `
                + `path=${replayed.candidate.relativePath}:${replayed.candidate.startLine} != `
                + `${recorded.candidateId} score=${recorded.score} `
                + `path=${recorded.relativePath}:${recorded.startLine}).`,
            );
        }
        if (typeof recorded.score !== "number"
            || !Number.isFinite(recorded.score)
            || Math.abs(replayed.finalScore - recorded.score) > SCORE_TOLERANCE) {
            throw new Error(`${label} replay score mismatch for '${recorded.candidateId}'.`);
        }
    }
}

function assertCandidateIdsMatchStage(candidates, expectedStage, label) {
    const expected = requireCompleteStage(expectedStage, label).candidates;
    const actualIds = candidates.map((candidate) => candidate.candidate.candidateId);
    const expectedIds = expected.map((candidate) => candidate.candidateId);
    if (canonicalJson(actualIds) !== canonicalJson(expectedIds)) {
        throw new Error(`${label} replay candidate order does not match the recorded stage.`);
    }
}

function assertCandidateMembershipMatchesStage(candidates, expectedStage, label) {
    const expected = requireCompleteStage(expectedStage, label).candidates;
    const actualIds = candidates
        .map((candidate) => candidate.candidate.candidateId)
        .sort(compareContractStrings);
    const expectedIds = expected
        .map((candidate) => candidate.candidateId)
        .sort(compareContractStrings);
    if (canonicalJson(actualIds) !== canonicalJson(expectedIds)) {
        throw new Error(`${label} replay candidate membership does not match the recorded stage.`);
    }
}

function assertRemovalIdentityMatchesBaseline(actual, expected, label) {
    const normalize = (entries) => entries
        .map(({ candidateId, reason }) => ({ candidateId, reason }))
        .sort((left, right) => (
            compareContractStrings(left.candidateId, right.candidateId)
            || compareContractStrings(left.reason, right.reason)
        ));
    if (canonicalJson(normalize(actual)) !== canonicalJson(normalize(expected))) {
        throw new Error(`${label} replay eligibility removals do not match baseline.`);
    }
}

function stageByNameAndPass(stages, stageName, passId) {
    return stages.find((stage) => stage.stage === stageName && stage.passId === passId);
}

function replaySignalStagesForAttempt(stages, attemptId) {
    const chunkPrefix = `${attemptId}/replay:`;
    return stages.filter((stage) => (
        stage.stage === "mcp_replay_signals"
        && (stage.passId === attemptId || stage.passId?.startsWith(chunkPrefix))
    ));
}

function productCandidateLimitForPass(capture, passId) {
    const matches = capture.candidateTrace.corePasses.filter((entry) => entry.passId === passId);
    if (matches.length !== 1) {
        throw new Error(`Task '${capture.taskId}' Core pass '${passId}' has no unique product candidate limit.`);
    }
    return requirePositiveInteger(
        matches[0].productCandidateLimit,
        `Task '${capture.taskId}' Core pass '${passId}' productCandidateLimit`,
    );
}

function replayCorePasses(capture) {
    const stages = capture.candidateTrace.stages;
    const outputStages = stages.filter((stage) => (
        stage.stage === "core_fusion" || stage.stage === "core_result"
    ));
    return outputStages.map((outputStage) => {
        const passId = requireString(outputStage.passId, "Core output passId");
        const dense = stageByNameAndPass(stages, "raw_dense", passId);
        const preciseLexical = stageByNameAndPass(stages, "raw_lexical", passId);
        const fallbackLexical = stageByNameAndPass(
            stages,
            "raw_lexical_fallback",
            passId,
        );
        if (outputStage.stage === "core_fusion") {
            if (!dense || !preciseLexical) {
                throw new Error(`Core hybrid pass '${passId}' is missing a raw retrieval arm.`);
            }
            const replayed = replayCoreFusion(
                dense,
                preciseLexical,
                fallbackLexical,
                productCandidateLimitForPass(capture, passId),
                `Task '${capture.taskId}' Core pass '${passId}'`,
            );
            assertRankedStageMatches(
                replayed,
                outputStage,
                `Task '${capture.taskId}' Core pass '${passId}'`,
            );
            return { passId, mode: "hybrid", candidateCount: replayed.length };
        }
        const rawStage = dense ?? preciseLexical;
        if (!rawStage) throw new Error(`Core pass '${passId}' is missing its raw retrieval stage.`);
        const replayed = compactRankedArm(
            rawStage,
            `Task '${capture.taskId}' Core pass '${passId}'`,
        )
            .slice(0, productCandidateLimitForPass(capture, passId))
            .map((candidate) => ({ candidate, score: candidate.score }));
        assertRankedStageMatches(
            replayed,
            outputStage,
            `Task '${capture.taskId}' Core pass '${passId}'`,
        );
        return { passId, mode: dense ? "dense" : "lexical", candidateCount: replayed.length };
    });
}

function mcpCandidateKey(candidate) {
    return JSON.stringify([
        candidate.relativePath,
        candidate.startLine,
        candidate.endLine,
        candidate.language || "unknown",
    ]);
}

function capturedMcpRrfK(capture) {
    return requirePositiveInteger(
        requireRecord(
            capture.passConfiguration?.mcpFusion,
            `Task '${capture.taskId}' MCP fusion policy`,
        ).rrfK,
        `Task '${capture.taskId}' MCP fusion rrfK`,
    );
}

function replaySignalByCandidate(capture, attemptId) {
    const signalStages = replaySignalStagesForAttempt(
        capture.candidateTrace.stages,
        attemptId,
    );
    if (signalStages.length === 0) {
        throw new Error(`Task '${capture.taskId}' MCP attempt '${attemptId}' has no replay signals.`);
    }
    const signals = new Map();
    for (let stageIndex = 0; stageIndex < signalStages.length; stageIndex += 1) {
        const signalStage = requireCompleteStage(
            signalStages[stageIndex],
            `Task '${capture.taskId}' MCP replay signals '${attemptId}' chunk ${stageIndex + 1}`,
        );
        for (const rawCandidate of signalStage.candidates) {
            const candidate = requireRecord(rawCandidate, `Task '${capture.taskId}' MCP replay signal`);
            const candidateId = requireString(candidate.candidateId, "MCP replay signal candidateId");
            if (signals.has(candidateId)) {
                throw new Error(`Task '${capture.taskId}' has duplicate replay signals for '${candidateId}'.`);
            }
            const replay = requireRecord(candidate.replay, `MCP replay signal '${candidateId}'`);
            signals.set(candidateId, { candidate, replay });
        }
    }
    return signals;
}

function diagnosticRemovalByCandidate(capture, attemptId) {
    const passId = `${attemptId}/diagnostic_replay`;
    const removals = new Map();
    for (const rawRemoval of capture.candidateTrace.removals) {
        if (rawRemoval.passId !== passId) continue;
        const removal = requireRecord(rawRemoval, `Task '${capture.taskId}' diagnostic removal`);
        const candidateId = requireString(removal.candidateId, "Diagnostic removal candidateId");
        if (removals.has(candidateId) && removals.get(candidateId) !== removal.reason) {
            throw new Error(`Task '${capture.taskId}' has conflicting removals for '${candidateId}'.`);
        }
        removals.set(candidateId, requireString(removal.reason, "Diagnostic removal reason"));
    }
    return removals;
}

function replayPostFusionLocalScoring(capture, attempt, scoringPolicy = {
    pathMultiplier: "captured",
    entrypointOwnerScore: "captured",
}) {
    const signals = replaySignalByCandidate(capture, attempt.attemptId);
    const removals = diagnosticRemovalByCandidate(capture, attempt.attemptId);
    const scored = [];
    const removed = [];
    for (const entry of attempt.candidates) {
        const candidateId = entry.candidate.candidateId;
        const signal = signals.get(candidateId);
        if (!signal) {
            removed.push({
                candidateId,
                reason: removals.get(candidateId) ?? "filtered_before_local_scoring_reason_unrecorded",
            });
            continue;
        }
        assertSameCandidatePayload(
            entry.candidate,
            signal.candidate,
            `Task '${capture.taskId}' MCP local scoring '${attempt.attemptId}'`,
        );
        const replay = signal.replay;
        const lexicalScore = requireNonNegativeFinite(
            replay.lexicalScore,
            `Task '${capture.taskId}' candidate '${candidateId}' lexicalScore`,
        );
        const capturedPathMultiplier = requirePositiveFinite(
            replay.pathMultiplier,
            `Task '${capture.taskId}' candidate '${candidateId}' pathMultiplier`,
        );
        const pathMultiplier = scoringPolicy.pathMultiplier === "neutral"
            ? 1
            : capturedPathMultiplier;
        const changedFilesMultiplier = requirePositiveFinite(
            replay.changedFilesMultiplier,
            `Task '${capture.taskId}' candidate '${candidateId}' changedFilesMultiplier`,
        );
        const agentFitMultiplier = requirePositiveFinite(
            replay.agentFitMultiplier,
            `Task '${capture.taskId}' candidate '${candidateId}' agentFitMultiplier`,
        );
        const capturedEntrypointOwnerScoreBoost =
            capture.candidateTrace.schemaVersion === TRACE_SCHEMA_V2
            ? requireNonNegativeFinite(
                replay.entrypointOwnerScoreBoost,
                `Task '${capture.taskId}' candidate '${candidateId}' entrypointOwnerScoreBoost`,
            )
            : 0;
        if (
            capture.candidateTrace.schemaVersion === TRACE_SCHEMA_V2
            && capturedEntrypointOwnerScoreBoost
                > capture.candidateTrace.scorePolicy.entrypointOwnerMaxContribution
        ) {
            throw new Error(
                `Task '${capture.taskId}' candidate '${candidateId}' entrypointOwnerScoreBoost exceeds the captured policy cap.`,
            );
        }
        const entrypointOwnerScoreReason = capture.candidateTrace.schemaVersion === TRACE_SCHEMA_V2
            ? requireString(
                replay.entrypointOwnerScoreReason,
                `Task '${capture.taskId}' candidate '${candidateId}' entrypointOwnerScoreReason`,
            )
            : "legacy_not_recorded";
        if (capture.candidateTrace.schemaVersion === TRACE_SCHEMA_V2) {
            if (!ENTRYPOINT_OWNER_SCORE_REASONS.has(entrypointOwnerScoreReason)) {
                throw new Error(
                    `Task '${capture.taskId}' candidate '${candidateId}' has an unsupported entrypointOwnerScoreReason.`,
                );
            }
            if (
                (entrypointOwnerScoreReason === "not_applicable"
                    && capturedEntrypointOwnerScoreBoost !== 0)
                || (entrypointOwnerScoreReason === "manifest_entrypoint_owner"
                    && capturedEntrypointOwnerScoreBoost <= 0)
            ) {
                throw new Error(
                    `Task '${capture.taskId}' candidate '${candidateId}' has inconsistent entrypoint owner scoring evidence.`,
                );
            }
        }
        const entrypointOwnerScoreBoost =
            scoringPolicy.entrypointOwnerScore === "disabled"
                ? 0
                : capturedEntrypointOwnerScoreBoost;
        if (typeof replay.exactLexicalMatch !== "boolean"
            || typeof replay.passesMatchedMust !== "boolean") {
            throw new Error(`Task '${capture.taskId}' candidate '${candidateId}' has invalid replay flags.`);
        }
        const fusionScore = requireNonNegativeFinite(
            entry.score,
            `Task '${capture.taskId}' candidate '${candidateId}' fusionScore`,
        );
        scored.push({
            ...entry,
            result: {
                relativePath: signal.candidate.relativePath,
                startLine: signal.candidate.startLine,
                endLine: signal.candidate.endLine,
                symbolLabel: replay.symbolLabel ?? null,
                symbolId: replay.symbolId ?? null,
            },
            fusionScore,
            lexicalScore,
            capturedPathMultiplier,
            pathMultiplier,
            changedFilesMultiplier,
            agentFitMultiplier,
            capturedEntrypointOwnerScoreBoost,
            entrypointOwnerScoreBoost,
            entrypointOwnerScoreReason,
            exactLexicalMatch: replay.exactLexicalMatch,
            passesMatchedMust: replay.passesMatchedMust,
            rerankFamilyId: requireString(
                replay.rerankFamilyId,
                `Task '${capture.taskId}' candidate '${candidateId}' rerankFamilyId`,
            ),
            rerankDocumentUtf8Bytes: requireNonNegativeInteger(
                replay.rerankDocumentUtf8Bytes,
                `Task '${capture.taskId}' candidate '${candidateId}' rerankDocumentUtf8Bytes`,
            ),
            symbolLabel: replay.symbolLabel ?? null,
            symbolId: replay.symbolId ?? null,
            exactMatchPinned: false,
            rerankAdjusted: false,
            retrievalPasses: [],
            backendScoreKindsSeen: [],
            finalScore: computeSearchCandidateFinalScore({
                fusionScore,
                lexicalScore,
                pathMultiplier,
                changedFilesMultiplier,
                agentFitMultiplier,
                entrypointOwnerScoreBoost,
            }),
        });
    }
    const rerank = requireRecord(
        capture.passConfiguration.rerank,
        `Task '${capture.taskId}' rerank policy`,
    );
    const mustMatchesFirst = Array.isArray(capture.queryPlan.operatorSummary?.must)
        && capture.queryPlan.operatorSummary.must.length > 0;
    sortSearchCandidates(
        scored,
        rerank.exactMatchPinningEnabled === true,
        mustMatchesFirst,
    );
    return { candidates: scored, removed, mustMatchesFirst };
}

function normalizeGroupReplay(value, label) {
    const replay = requireRecord(value, label);
    requireExactKeys(replay, [
        "displayLabel",
        "symbolKind",
        "declarationLike",
        "exactLexicalMatch",
        "symbolKey",
        "symbolInstanceId",
    ], label);
    if (typeof replay.declarationLike !== "boolean"
        || typeof replay.exactLexicalMatch !== "boolean") {
        throw new Error(`${label} must contain Boolean ordering evidence.`);
    }
    for (const field of ["symbolKind", "symbolKey", "symbolInstanceId"]) {
        if (replay[field] !== null && typeof replay[field] !== "string") {
            throw new Error(`${label}.${field} must be a string or null.`);
        }
    }
    return {
        displayLabel: requireString(replay.displayLabel, `${label}.displayLabel`),
        symbolKind: replay.symbolKind,
        declarationLike: replay.declarationLike,
        exactLexicalMatch: replay.exactLexicalMatch,
        symbolKey: replay.symbolKey,
        symbolInstanceId: replay.symbolInstanceId,
    };
}

function groupedStageAuthority(stage, label) {
    const complete = requireCompleteStage(stage, label);
    const byRank = new Map();
    for (const rawOccurrence of complete.candidates) {
        const occurrence = requireRecord(rawOccurrence, `${label} occurrence`);
        const rank = requirePositiveInteger(occurrence.rank, `${label} rank`);
        const groupReplay = normalizeGroupReplay(
            occurrence.groupReplay,
            `${label} rank ${rank} ordering evidence`,
        );
        const existing = byRank.get(rank);
        if (existing) {
            for (const field of [
                "ownerId",
                "relativePath",
                "startLine",
                "endLine",
                "language",
                "score",
            ]) {
                if (existing[field] !== occurrence[field]) {
                    throw new Error(`${label} rank ${rank} has inconsistent '${field}'.`);
                }
            }
            if (canonicalJson(existing.groupReplay) !== canonicalJson(groupReplay)) {
                throw new Error(`${label} rank ${rank} has inconsistent ordering evidence.`);
            }
            existing.candidateIds.push(requireString(
                occurrence.candidateId,
                `${label} candidateId`,
            ));
            continue;
        }
        byRank.set(rank, {
            rank,
            ownerId: requireString(occurrence.ownerId, `${label} ownerId`),
            relativePath: requireString(
                occurrence.relativePath,
                `${label} relativePath`,
            ),
            startLine: requirePositiveInteger(
                occurrence.startLine,
                `${label} startLine`,
            ),
            endLine: requirePositiveInteger(occurrence.endLine, `${label} endLine`),
            language: requireString(occurrence.language, `${label} language`),
            score: requireNonNegativeFinite(occurrence.score, `${label} score`),
            groupReplay,
            candidateIds: [requireString(occurrence.candidateId, `${label} candidateId`)],
        });
    }
    const groups = [...byRank.values()].sort((left, right) => left.rank - right.rank);
    groups.forEach((group, index) => {
        if (group.rank !== index + 1) {
            throw new Error(`${label} group ranks must be contiguous.`);
        }
        if (new Set(group.candidateIds).size !== group.candidateIds.length) {
            throw new Error(`${label} rank ${group.rank} contains duplicate candidates.`);
        }
    });
    return groups;
}

function parseOwnerId(ownerId, label) {
    let parsed;
    try {
        parsed = JSON.parse(ownerId);
    } catch {
        throw new Error(`${label} ownerId must be canonical JSON.`);
    }
    if (!Array.isArray(parsed) || !["symbol", "file"].includes(parsed[0])) {
        throw new Error(`${label} ownerId is unsupported.`);
    }
    if (parsed[0] === "symbol" && parsed.length === 3) {
        return {
            kind: "symbol",
            file: requireString(parsed[1], `${label} owner file`),
            symbolId: requireString(parsed[2], `${label} owner symbol`),
        };
    }
    if (parsed[0] === "file" && parsed.length === 2) {
        return {
            kind: "file",
            file: requireString(parsed[1], `${label} owner file`),
        };
    }
    throw new Error(`${label} ownerId has an invalid shape.`);
}

function compareGroupedReplay(actual, expected, label) {
    if (actual.length !== expected.length) {
        throw new Error(`${label} group count mismatch (${actual.length} != ${expected.length}).`);
    }
    for (let index = 0; index < actual.length; index += 1) {
        const replayed = actual[index];
        const recorded = expected[index];
        const replayedIdentity = {
            ownerId: replayed.__frozenOwnerId,
            candidateIds: replayed.__candidateIds,
        };
        const recordedIdentity = {
            ownerId: recorded.ownerId,
            candidateIds: recorded.candidateIds,
        };
        if (canonicalJson(replayedIdentity) !== canonicalJson(recordedIdentity)) {
            throw new Error(
                `${label} order mismatch at rank ${index + 1} `
                + `(replayed=${canonicalJson({
                    ...replayedIdentity,
                    file: replayed.target?.file,
                    score: replayed.score,
                })} recorded=${canonicalJson({
                    ...recordedIdentity,
                    file: recorded.relativePath,
                    score: recorded.score,
                })}).`,
            );
        }
        if (Math.abs(replayed.score - recorded.score) > SCORE_TOLERANCE) {
            throw new Error(`${label} score mismatch at rank ${index + 1}.`);
        }
    }
}

function groupingDisclosureAvailability(capture) {
    const args = capture.queryPlan?.invocationArgs;
    if (args?.resultMode !== "grouped") return "result_mode_not_grouped";
    if (!["symbol", "file"].includes(args.groupBy)) return "group_by_not_recorded";
    if (!Number.isSafeInteger(args.limit) || args.limit < 1) return "caller_limit_not_recorded";
    if (!Number.isSafeInteger(args.disclosureLimit) || args.disclosureLimit < 1) {
        return "disclosure_limit_not_recorded";
    }
    const grouped = capture.candidateTrace.stages.find((stage) => stage.stage === "grouped");
    const disclosed = capture.candidateTrace.stages.find((stage) => stage.stage === "disclosed");
    if (!grouped || !disclosed) return "grouped_or_disclosed_stage_missing";
    if (grouped.omittedOccurrences !== 0 || disclosed.omittedOccurrences !== 0) {
        return "grouped_or_disclosed_stage_truncated";
    }
    if (capture.passConfiguration.rerank?.applied === true) {
        return "neural_reranker_order_not_replayable";
    }
    return null;
}

function replayFrozenGroupingAndDisclosure(
    capture,
    localScoring,
    { assertBaseline = false } = {},
) {
    const unavailableReason = groupingDisclosureAvailability(capture);
    if (unavailableReason) {
        throw new Error(
            `Task '${capture.taskId}' grouping/disclosure replay is unavailable: ${unavailableReason}.`,
        );
    }
    const groupedAuthority = groupedStageAuthority(
        capture.candidateTrace.stages.find((stage) => stage.stage === "grouped"),
        `Task '${capture.taskId}' grouped authority`,
    );
    const disclosedAuthority = groupedStageAuthority(
        capture.candidateTrace.stages.find((stage) => stage.stage === "disclosed"),
        `Task '${capture.taskId}' disclosed authority`,
    );
    const localById = new Map(localScoring.candidates.map((candidate) => [
        candidate.candidate.candidateId,
        candidate,
    ]));
    const groupedCandidateIds = new Set(groupedAuthority.flatMap(({ candidateIds }) => (
        candidateIds
    )));
    const invalidGroupCandidateIds = new Set(
        capture.candidateTrace.removals
            .filter((removal) => (
                removal.afterStage === "grouped"
                && removal.reason === "invalid_group_target"
            ))
            .map((removal) => removal.candidateId),
    );
    for (const candidateId of localById.keys()) {
        if (!groupedCandidateIds.has(candidateId) && !invalidGroupCandidateIds.has(candidateId)) {
            throw new Error(
                `Task '${capture.taskId}' candidate '${candidateId}' has no frozen group authority.`,
            );
        }
    }
    const groupedResults = groupedAuthority.map((group) => {
        const chunks = group.candidateIds.map((candidateId) => {
            const candidate = localById.get(candidateId);
            if (!candidate) {
                throw new Error(
                    `Task '${capture.taskId}' frozen group candidate '${candidateId}' is absent.`,
                );
            }
            return {
                ...candidate,
                result: {
                    relativePath: candidate.candidate.relativePath,
                    startLine: candidate.candidate.startLine,
                    endLine: candidate.candidate.endLine,
                },
                exactMatchPinned: false,
                rerankAdjusted: false,
            };
        });
        sortSearchCandidates(
            chunks,
            capture.passConfiguration.rerank.exactMatchPinningEnabled === true,
            localScoring.mustMatchesFirst,
        );
        const representative = chunks[0];
        const owner = parseOwnerId(
            group.ownerId,
            `Task '${capture.taskId}' grouped rank ${group.rank}`,
        );
        const displayLabel = group.groupReplay.displayLabel;
        const symbolKind = group.groupReplay.symbolKind ?? undefined;
        return {
            target: {
                file: group.relativePath,
                span: {
                    startLine: group.startLine,
                    endLine: group.endLine,
                },
                ...(owner.kind === "symbol" ? { symbolId: owner.symbolId } : {}),
            },
            displayLabel,
            language: group.language,
            ...(symbolKind ? { symbolKind } : {}),
            score: computeSearchGroupScore(representative.finalScore, chunks.length),
            quality: {
                owner: "medium",
                semantic: "medium",
            },
            preview: group.groupReplay.declarationLike
                ? "function __satori_replay_declaration__()"
                : "",
            navigation: { supported: false, reason: "not_available" },
            __groupId: group.ownerId,
            __candidateIds: [...group.candidateIds],
            ...(group.groupReplay.symbolKey
                ? { __symbolKey: group.groupReplay.symbolKey }
                : {}),
            ...(group.groupReplay.symbolInstanceId
                ? { __symbolInstanceId: group.groupReplay.symbolInstanceId }
                : owner.kind === "symbol"
                    ? { __symbolInstanceId: owner.symbolId }
                    : {}),
            __exactLexicalMatch: group.groupReplay.exactLexicalMatch,
            __frozenOwnerId: group.ownerId,
        };
    });
    const args = capture.queryPlan.invocationArgs;
    const ranked = rankAndDiversifySearchGroups({
        groupedResults,
        // The frozen grouped stage is already downstream of declaration
        // collapse. R2 changes scores, not group membership or ownership.
        collapseDuplicateDeclarations: false,
        exactMatchPinningEnabled:
            capture.passConfiguration.rerank.exactMatchPinningEnabled === true,
        limit: args.limit,
        groupBy: args.groupBy,
    });
    if (assertBaseline) {
        compareGroupedReplay(
            ranked.rankedResults,
            groupedAuthority,
            `Task '${capture.taskId}' grouped replay`,
        );
    }
    const disclosure = projectGroupedDisclosure({
        orderedResults: ranked.disclosureOrder,
        callerLimit: args.limit,
        disclosureLimit: args.disclosureLimit,
        // Captures intentionally contain no source previews. Byte-budget
        // behavior remains a live metric; R1 replays the production count and
        // ordering policy only when no byte truncation occurred.
        maxResponseBytes: Number.MAX_SAFE_INTEGER,
        includeSummary: args.disclosureLimit < args.limit
            || ranked.disclosureOrder.length > args.limit,
        buildEnvelope: (results, summary) => ({
            status: "ok",
            results: [...results],
            ...(summary ? { disclosure: summary } : {}),
        }),
    });
    if (assertBaseline) {
        compareGroupedReplay(
            disclosure.results,
            disclosedAuthority,
            `Task '${capture.taskId}' disclosed replay`,
        );
    }
    const toIdentity = (group, index) => ({
        rank: index + 1,
        ownerId: group.__frozenOwnerId,
        candidateIds: [...group.__candidateIds],
        score: group.score,
    });
    return {
        groupedResults: ranked.rankedResults.map(toIdentity),
        disclosureOrder: ranked.disclosureOrder.map(toIdentity),
        disclosedResults: disclosure.results.map(toIdentity),
        diversitySummary: ranked.diversitySummary,
        exactMatchPinningApplied: ranked.exactMatchPinningApplied,
        responseByteBudgetReplayed: false,
    };
}

function shouldSkipRerankForExactPin(candidates, rerank, mustMatchesFirst) {
    if (candidates.length === 0 || candidates[0].exactLexicalMatch !== true) return false;
    if (rerank.exactMatchPinningEnabled === true) return true;
    if (mustMatchesFirst && candidates[0].passesMatchedMust === true) return true;
    return candidates.length === 1;
}

function replayRerankerAdmission(capture, localScoring) {
    const rerank = requireRecord(
        capture.passConfiguration.rerank,
        `Task '${capture.taskId}' rerank policy`,
    );
    const selectionPolicy = requireRecord(
        rerank.selectionPolicy,
        `Task '${capture.taskId}' rerank selectionPolicy`,
    );
    const enabledBeforeExactPin = rerank.enabledByPolicy === true
        && rerank.skippedByScopeDocs !== true
        && rerank.skippedByIdentifierIntent !== true
        && rerank.capabilityPresent === true
        && rerank.rerankerPresent === true;
    const skippedByExactPin = enabledBeforeExactPin && shouldSkipRerankForExactPin(
        localScoring.candidates,
        rerank,
        localScoring.mustMatchesFirst,
    );
    if (!enabledBeforeExactPin || skippedByExactPin || localScoring.candidates.length === 0) {
        return {
            enabled: enabledBeforeExactPin && !skippedByExactPin,
            skippedByExactPin,
            selected: [],
            familyCount: 0,
            supplementalCandidateCount: 0,
            candidatePoolCount: 0,
            budget: 0,
            budgetReason: null,
            inputUtf8Bytes: 0,
        };
    }

    const representatives = [];
    const representedFamilies = new Set();
    const supplementalByFamily = new Map();
    const maxSupplemental = requireNonNegativeInteger(
        selectionPolicy.maxSupplementalChunksPerFamily,
        `Task '${capture.taskId}' rerank maxSupplementalChunksPerFamily`,
    );
    for (const candidate of localScoring.candidates) {
        if (!representedFamilies.has(candidate.rerankFamilyId)) {
            representatives.push(candidate);
            representedFamilies.add(candidate.rerankFamilyId);
            continue;
        }
        const supplemental = supplementalByFamily.get(candidate.rerankFamilyId) ?? [];
        if (supplemental.length < maxSupplemental) {
            supplementalByFamily.set(candidate.rerankFamilyId, [...supplemental, candidate]);
        }
    }
    const supplementalCandidates = [];
    for (let index = 0; index < maxSupplemental; index += 1) {
        for (const candidates of supplementalByFamily.values()) {
            if (candidates[index]) supplementalCandidates.push(candidates[index]);
        }
    }
    const candidatePool = [...representatives, ...supplementalCandidates];
    const requestedLimit = requirePositiveInteger(
        rerank.requestedResultLimit,
        `Task '${capture.taskId}' rerank requestedResultLimit`,
    );
    const ambiguous = representatives.length > requestedLimit;
    const adaptiveBudget = ambiguous
        ? Math.max(
            requirePositiveInteger(
                selectionPolicy.minAmbiguousCandidates,
                `Task '${capture.taskId}' rerank minAmbiguousCandidates`,
            ),
            requestedLimit * requirePositiveInteger(
                selectionPolicy.ambiguousCandidatesPerResult,
                `Task '${capture.taskId}' rerank ambiguousCandidatesPerResult`,
            ),
        )
        : requestedLimit * requirePositiveInteger(
            selectionPolicy.boundedCandidatesPerResult,
            `Task '${capture.taskId}' rerank boundedCandidatesPerResult`,
        );
    const budget = Math.min(
        requirePositiveInteger(rerank.topK, `Task '${capture.taskId}' rerank topK`),
        candidatePool.length,
        adaptiveBudget,
    );
    const selected = candidatePool.slice(0, budget);
    return {
        enabled: true,
        skippedByExactPin: false,
        selected,
        familyCount: representatives.length,
        supplementalCandidateCount: supplementalCandidates.length,
        candidatePoolCount: candidatePool.length,
        budget,
        budgetReason: candidatePool.length <= adaptiveBudget
            ? "complete_family_pool"
            : "family_ambiguity",
        inputUtf8Bytes: selected.reduce(
            (total, candidate) => total + candidate.rerankDocumentUtf8Bytes,
            0,
        ),
    };
}

function replayMcpAttempt(capture, attemptStage) {
    const attemptId = requireString(attemptStage.passId, "MCP fusion attempt passId");
    const passPrefix = `${attemptId}/`;
    const passStages = capture.candidateTrace.stages.filter((stage) => (
        stage.stage === "mcp_pass" && stage.passId?.startsWith(passPrefix)
    ));
    if (passStages.length === 0) {
        throw new Error(`Task '${capture.taskId}' MCP attempt '${attemptId}' has no raw pass stages.`);
    }
    const rrfK = capturedMcpRrfK(capture);
    const byChunkKey = new Map();
    for (const rawStage of passStages) {
        const stage = requireCompleteStage(
            rawStage,
            `Task '${capture.taskId}' MCP pass '${rawStage.passId}'`,
        );
        if (typeof stage.weight !== "number" || !Number.isFinite(stage.weight) || stage.weight <= 0) {
            throw new Error(`Task '${capture.taskId}' MCP pass '${stage.passId}' has no valid weight.`);
        }
        stage.candidates.forEach((candidate, index) => {
            const key = mcpCandidateKey(candidate);
            const contribution = stage.weight / (rrfK + index + 1);
            const existing = byChunkKey.get(key);
            if (existing) existing.score += contribution;
            else byChunkKey.set(key, { candidate, score: contribution });
        });
    }
    const replayed = [...byChunkKey.values()].sort((left, right) => (
        right.score - left.score || compareCandidateIdentity(left.candidate, right.candidate)
    ));
    assertRankedStageMatches(
        replayed,
        attemptStage,
        `Task '${capture.taskId}' MCP attempt '${attemptId}'`,
    );
    return {
        attemptId,
        passCount: passStages.length,
        candidateCount: replayed.length,
        candidates: replayed.map((entry, index) => ({
            candidate: entry.candidate,
            score: entry.score,
            rank: index + 1,
        })),
    };
}

function replayPolicyMcpAttempt(capture, attemptStage, corePasses, policy) {
    const attemptId = requireString(attemptStage.passId, "MCP fusion attempt passId");
    const passPrefix = `${attemptId}/`;
    const recordedPasses = capture.candidateTrace.stages.filter((stage) => (
        stage.stage === "mcp_pass" && stage.passId?.startsWith(passPrefix)
    ));
    if (recordedPasses.length === 0) {
        throw new Error(`Task '${capture.taskId}' MCP attempt '${attemptId}' has no raw pass stages.`);
    }
    const coreByPassId = new Map(corePasses.map((pass) => [pass.passId, pass]));
    const byChunkKey = new Map();
    for (const rawStage of recordedPasses) {
        const stage = requireCompleteStage(
            rawStage,
            `Task '${capture.taskId}' MCP pass '${rawStage.passId}'`,
        );
        if (typeof stage.weight !== "number" || !Number.isFinite(stage.weight) || stage.weight <= 0) {
            throw new Error(`Task '${capture.taskId}' MCP pass '${stage.passId}' has no valid weight.`);
        }
        const policyCorePass = coreByPassId.get(stage.passId);
        const candidates = policyCorePass
            ? policyCorePass.candidates.map((candidate) => candidate.candidate)
            : compactRankedArm(stage, `Task '${capture.taskId}' MCP pass '${stage.passId}'`);
        candidates.forEach((candidate, index) => {
            const key = mcpCandidateKey(candidate);
            const contribution = stage.weight / (policy.mcp.rrfK + index + 1);
            const existing = byChunkKey.get(key);
            if (existing) {
                assertSameCandidatePayload(
                    existing.candidate,
                    candidate,
                    `Task '${capture.taskId}' MCP attempt '${attemptId}'`,
                );
                existing.score += contribution;
                existing.passes.add(stage.passId);
            } else {
                byChunkKey.set(key, {
                    candidate,
                    score: contribution,
                    passes: new Set([stage.passId]),
                });
            }
        });
    }
    const ranked = [...byChunkKey.values()].sort((left, right) => (
        right.score - left.score || compareCandidateIdentity(left.candidate, right.candidate)
    ));
    return {
        attemptId,
        passCount: recordedPasses.length,
        candidates: ranked.map((entry, index) => ({
            candidate: entry.candidate,
            candidateId: entry.candidate.candidateId,
            ownerId: entry.candidate.ownerId,
            relativePath: entry.candidate.relativePath,
            startLine: entry.candidate.startLine,
            endLine: entry.candidate.endLine,
            language: entry.candidate.language,
            rank: index + 1,
            score: entry.score,
            passes: [...entry.passes].sort(),
        })),
    };
}

function replayTaskCapture(capture) {
    const record = requireRecord(capture, "Task capture");
    const trace = requireRecord(record.candidateTrace, `Task '${record.taskId}' candidateTrace`);
    const digestedFields = [
        ["queryPlanDigest", record.queryPlan],
        ["passConfigurationDigest", record.passConfiguration],
        ["candidateTraceDigest", trace],
        ["rankedResultIdentityDigest", record.rankedResults],
    ];
    if (trace.schemaVersion === TRACE_SCHEMA_V2) {
        digestedFields.push([
            "entrypointOwnerEvidenceDigest",
            record.entrypointOwnerEvidence,
        ]);
    }
    for (const [field, value] of digestedFields) {
        if (sha256Canonical(value) !== record[field]) {
            throw new Error(`Task '${record.taskId}' ${field} does not match its contents.`);
        }
    }
    if (!Array.isArray(trace.stages)) throw new Error(`Task '${record.taskId}' trace stages must be an array.`);
    if (record.readiness?.route === "exact_registry") {
        if (record.readiness.policyInvariant !== true
            || record.readiness.fusionReplayStatus !== "not_applicable"
            || record.readiness.fusionNotApplicableReason !== "exact_registry_hit") {
            throw new Error(`Task '${record.taskId}' has incomplete exact-registry route authority.`);
        }
        const rankedResults = requireArray(
            record.rankedResults,
            `Task '${record.taskId}' exact-registry ranked results`,
        );
        if (record.queryClass !== "negative_exposure") {
            const expected = requireRecord(
                record.expected,
                `Task '${record.taskId}' expected owner`,
            );
            const first = requireRecord(
                rankedResults[0],
                `Task '${record.taskId}' exact-registry first result`,
            );
            if (first.file !== expected.ownerFile || first.symbol !== expected.ownerSymbol) {
                throw new Error(
                    `Task '${record.taskId}' exact-registry target does not match frozen owner authority.`,
                );
            }
        }
        return {
            taskId: record.taskId,
            ...(record.split ? { split: record.split } : {}),
            ...(record.safetyControls ? { safetyControls: [...record.safetyControls] } : {}),
            route: {
                kind: "exact_registry",
                fusionReplay: "not_applicable",
                reason: "exact_registry_hit",
                matchedSymbolInstanceId: record.passConfiguration.exactRegistry.matchedSymbolInstanceId,
            },
            policyAffected: false,
            rankedResults,
            corePasses: [],
            mcpAttempts: [],
            providerWork: {
                semanticSearchAttempts: 0,
                embeddingCallsByCurrentContract: 0,
                rerankerCalls: 0,
                rerankerCandidates: 0,
                rerankerInputBytes: 0,
            },
        };
    }
    const corePasses = replayCorePasses(record);
    const internalMcpAttempts = trace.stages
        .filter((stage) => stage.stage === "mcp_fusion")
        .map((stage) => replayMcpAttempt(record, stage));
    if (corePasses.length === 0 || internalMcpAttempts.length === 0) {
        throw new Error(`Task '${record.taskId}' does not contain complete Core and MCP fusion stages.`);
    }
    const signalsComplete = internalMcpAttempts.every((attempt) => (
        replaySignalStagesForAttempt(trace.stages, attempt.attemptId).length > 0
    ));
    let localScoring;
    let rerankerAdmission;
    let groupingDisclosure;
    if (signalsComplete) {
        const localAttempts = internalMcpAttempts.map((attempt) => {
            const local = replayPostFusionLocalScoring(record, attempt);
            const recordedStage = stageByNameAndPass(
                trace.stages,
                "mcp_filtered",
                attempt.attemptId,
            );
            if (!recordedStage) {
                throw new Error(`Task '${record.taskId}' MCP attempt '${attempt.attemptId}' has no filtered stage.`);
            }
            assertLocalScoringMatches(
                local.candidates,
                recordedStage,
                `Task '${record.taskId}' MCP local scoring '${attempt.attemptId}'`,
            );
            return { attemptId: attempt.attemptId, ...local };
        });
        const finalLocal = localAttempts.at(-1);
        rerankerAdmission = replayRerankerAdmission(record, finalLocal);
        const recordedRerankerInput = trace.stages.find((stage) => stage.stage === "reranker_input");
        if (rerankerAdmission.selected.length > 0) {
            if (!recordedRerankerInput) {
                throw new Error(`Task '${record.taskId}' has no recorded reranker input stage.`);
            }
            assertCandidateIdsMatchStage(
                rerankerAdmission.selected,
                recordedRerankerInput,
                `Task '${record.taskId}' reranker admission`,
            );
        } else if (recordedRerankerInput) {
            throw new Error(`Task '${record.taskId}' recorded reranker input but replay selected none.`);
        }
        const providerWork = requireRecord(
            record.passConfiguration.providerWork,
            `Task '${record.taskId}' provider work`,
        );
        if (rerankerAdmission.selected.length !== requireNonNegativeInteger(
            providerWork.rerankerCandidates,
            `Task '${record.taskId}' provider rerankerCandidates`,
        )) {
            throw new Error(`Task '${record.taskId}' reranker candidate count does not match provider work.`);
        }
        if (rerankerAdmission.inputUtf8Bytes !== requireNonNegativeInteger(
            providerWork.rerankerInputBytes,
            `Task '${record.taskId}' provider rerankerInputBytes`,
        )) {
            throw new Error(`Task '${record.taskId}' reranker input bytes do not match provider work.`);
        }
        localScoring = localAttempts.map((attempt) => ({
            attemptId: attempt.attemptId,
            candidateCount: attempt.candidates.length,
            removedCount: attempt.removed.length,
        }));
        if (groupingDisclosureAvailability(record) === null) {
            groupingDisclosure = replayFrozenGroupingAndDisclosure(
                record,
                finalLocal,
                { assertBaseline: true },
            );
        }
    }
    const mcpAttempts = internalMcpAttempts.map((attempt) => ({
        attemptId: attempt.attemptId,
        passCount: attempt.passCount,
        candidateCount: attempt.candidateCount,
    }));
    return {
        taskId: record.taskId,
        ...(record.split ? { split: record.split } : {}),
        ...(record.safetyControls ? { safetyControls: [...record.safetyControls] } : {}),
        route: { kind: "fusion", fusionReplay: "exact" },
        policyAffected: true,
        corePasses,
        mcpAttempts,
        ...(localScoring ? { localScoring } : {}),
        ...(rerankerAdmission ? {
            rerankerAdmission: {
                selectedCandidateIds: rerankerAdmission.selected.map(
                    (candidate) => candidate.candidate.candidateId,
                ),
                familyCount: rerankerAdmission.familyCount,
                supplementalCandidateCount: rerankerAdmission.supplementalCandidateCount,
                candidatePoolCount: rerankerAdmission.candidatePoolCount,
                budget: rerankerAdmission.budget,
                budgetReason: rerankerAdmission.budgetReason,
                inputUtf8Bytes: rerankerAdmission.inputUtf8Bytes,
            },
        } : {}),
        ...(groupingDisclosure ? { groupingDisclosure } : {}),
        ...(groupingDisclosure ? {
            frozenPagination: buildFrozenPaginationReplay(
                groupingDisclosure,
                record.queryPlan.invocationArgs.disclosureLimit,
            ),
        } : {}),
    };
}

function assertProductionScorePolicyCompatibility(taskCapture) {
    if (taskCapture.candidateTrace?.schemaVersion !== TRACE_SCHEMA_V2) return;
    const scorePolicy = requireRecord(
        taskCapture.candidateTrace.scorePolicy,
        `Task '${taskCapture.taskId}' scorePolicy`,
    );
    if (scorePolicy.finalScorePolicyId !== SEARCH_CANDIDATE_FINAL_SCORE_POLICY_ID) {
        throw new Error(
            `Task '${taskCapture.taskId}' final-score policy is incompatible with this replay runtime.`,
        );
    }
    if (scorePolicy.entrypointOwnerMaxContribution
        !== SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST) {
        throw new Error(
            `Task '${taskCapture.taskId}' entrypoint-owner cap is incompatible with this replay runtime.`,
        );
    }
}

function selectReplayTasks(capture, options) {
    const taskSuiteVersion = capture.taskSuiteVersion ?? 1;
    if (taskSuiteVersion === 2) {
        if (options.taskPrefix !== undefined) {
            throw new Error("Explicit-split captures do not accept legacy taskPrefix selection.");
        }
        const split = options.split ?? "all";
        if (!["tuning", "held_out", "all"].includes(split)) {
            throw new Error("Replay split must be tuning, held_out, or all.");
        }
        if (capture.captures.some((taskCapture) => (
            !["tuning", "held_out"].includes(taskCapture.split)
        ))) {
            throw new Error("Task-suite v2 captures require an explicit split on every task.");
        }
        return {
            selectedCaptures: capture.captures.filter((taskCapture) => (
                split === "all" || taskCapture.split === split
            )),
            selection: { split },
            taskSuiteVersion,
        };
    }
    if (taskSuiteVersion !== 1) {
        throw new Error("Candidate capture taskSuiteVersion is unsupported.");
    }
    if (options.split !== undefined) {
        throw new Error("Legacy task-suite captures require taskPrefix selection.");
    }
    const taskPrefix = options.taskPrefix ?? "all";
    if (!["tuning", "validation", "all"].includes(taskPrefix)) {
        throw new Error("Replay taskPrefix must be tuning, validation, or all.");
    }
    return {
        selectedCaptures: capture.captures.filter((taskCapture) => (
            taskPrefix === "all" || taskCapture.taskId.startsWith(`${taskPrefix}-`)
        )),
        selection: { taskPrefix },
        taskSuiteVersion,
    };
}

export function replayBaselineCandidateCapture(value, options = {}) {
    const capture = requireRecord(value, "Candidate capture");
    if (![1, 2].includes(capture.version) || capture.kind !== "satori_search_candidate_capture") {
        throw new Error("Candidate capture version or kind is unsupported.");
    }
    const suppliedDigest = requireString(capture.sha256, "Candidate capture sha256");
    const { sha256: _ignored, ...unsignedCapture } = capture;
    const computedDigest = sha256Canonical(unsignedCapture);
    if (computedDigest !== suppliedDigest) {
        throw new Error("Candidate capture digest does not match its contents.");
    }
    if (capture.policyId !== "baseline") {
        throw new Error("Baseline replay requires policyId=baseline.");
    }
    if (!Array.isArray(capture.captures)) throw new Error("Candidate capture tasks must be an array.");
    if (options.requireNeuralDisabled === true
        && capture.replayReadiness?.neuralDisabled !== true) {
        throw new Error("Baseline replay requires a neural-disabled candidate capture.");
    }
    const expectedTraceSchema = capture.version === 2 ? TRACE_SCHEMA_V2 : TRACE_SCHEMA_V1;
    if (capture.captures.some((taskCapture) => (
        taskCapture.candidateTrace?.schemaVersion !== expectedTraceSchema
    ))) {
        throw new Error(
            `Candidate capture version ${capture.version} requires ${expectedTraceSchema}.`,
        );
    }
    selectReplayTasks(capture, {});
    capture.captures.forEach(assertProductionScorePolicyCompatibility);
    const tasks = capture.captures.map(replayTaskCapture);
    const groupingDisclosureIncompleteTasks = capture.captures
        .filter((taskCapture) => taskCapture.readiness?.route === "fusion")
        .map((taskCapture) => ({
            taskId: taskCapture.taskId,
            reason: groupingDisclosureAvailability(taskCapture),
        }))
        .filter(({ reason }) => reason !== null);
    if (options.requireGroupingReady === true
        && groupingDisclosureIncompleteTasks.length > 0) {
        throw new Error(
            "Baseline grouping/disclosure replay is incomplete: "
            + groupingDisclosureIncompleteTasks
                .map(({ taskId, reason }) => `${taskId} (${reason})`)
                .join(", "),
        );
    }
    const replayRuntime = buildReplayRuntimeManifest(capture, "baseline", options);
    const replay = {
        version: capture.version,
        kind: "satori_search_candidate_baseline_replay",
        taskSuiteVersion: capture.taskSuiteVersion ?? 1,
        sourceCaptureSha256: suppliedDigest,
        policyId: "baseline",
        replayRuntime,
        routeCoverage: {
            fusionTaskCount: tasks.filter((task) => task.route.kind === "fusion").length,
            exactRegistryTaskCount: tasks.filter((task) => task.route.kind === "exact_registry").length,
            groupingDisclosureExact: groupingDisclosureIncompleteTasks.length === 0,
            groupingDisclosureTaskCount: tasks.filter(
                (task) => task.groupingDisclosure,
            ).length,
            groupingDisclosureIncompleteTasks,
        },
        tasks,
    };
    return { ...replay, sha256: sha256Canonical(replay) };
}

export function applyFrozenNeuralOrder(localScoring, neuralRanking, {
    exactMatchPinningEnabled,
} = {}) {
    const candidates = localScoring.candidates.map((candidate) => ({
        ...candidate,
        candidate: { ...candidate.candidate },
        result: { ...candidate.result },
    }));
    const candidatesById = new Map(candidates.map((candidate) => [
        candidate.candidate.candidateId,
        candidate,
    ]));
    const rankedIds = new Set();
    for (let index = 0; index < neuralRanking.length; index += 1) {
        const entry = requireRecord(neuralRanking[index], `Neural rank ${index + 1}`);
        const candidateId = requireString(entry.candidateId, `Neural rank ${index + 1} candidateId`);
        requireNonNegativeFinite(entry.score, `Neural rank ${index + 1} score`);
        if (rankedIds.has(candidateId)) {
            throw new Error(`Neural ranking contains duplicate candidate '${candidateId}'.`);
        }
        rankedIds.add(candidateId);
        const candidate = candidatesById.get(candidateId);
        if (!candidate) {
            throw new Error(`Neural ranking candidate '${candidateId}' is outside the eligible union.`);
        }
        const rank = index + 1;
        candidate.fusionScore += SEARCH_RERANK_WEIGHT / (SEARCH_RERANK_RRF_K + rank);
        candidate.finalScore = computeSearchCandidateFinalScore(candidate);
        candidate.rerankAdjusted = true;
    }
    sortSearchCandidates(
        candidates,
        exactMatchPinningEnabled === true,
        localScoring.mustMatchesFirst,
    );
    return {
        candidates,
        removed: localScoring.removed.map((removal) => ({ ...removal })),
        mustMatchesFirst: localScoring.mustMatchesFirst,
    };
}

export function buildFrozenPaginationReplay(groupingDisclosure, pageSize) {
    const groupedResults = requireArray(
        groupingDisclosure?.groupedResults,
        "Frozen pagination grouped results",
    );
    const disclosedResults = requireArray(
        groupingDisclosure?.disclosedResults,
        "Frozen pagination disclosed results",
    );
    const normalizedPageSize = requirePositiveInteger(pageSize, "Frozen pagination page size");
    const orderedGroups = groupedResults.map((group, index) => {
        const record = requireRecord(group, `Frozen pagination group ${index + 1}`);
        return {
            rank: record.rank,
            ownerId: requireString(record.ownerId, `Frozen pagination group ${index + 1} ownerId`),
            candidateIds: [...requireArray(
                record.candidateIds,
                `Frozen pagination group ${index + 1} candidateIds`,
            )],
            score: requireNonNegativeFinite(
                record.score,
                `Frozen pagination group ${index + 1} score`,
            ),
        };
    });
    const disclosedOwnerIds = disclosedResults.map((group, index) => requireString(
        group?.ownerId,
        `Frozen pagination disclosed group ${index + 1} ownerId`,
    ));
    const expectedInitialOwnerIds = orderedGroups
        .slice(0, disclosedOwnerIds.length)
        .map(({ ownerId }) => ownerId);
    if (canonicalJson(disclosedOwnerIds) !== canonicalJson(expectedInitialOwnerIds)) {
        throw new Error("Frozen pagination initial disclosure is not a grouped-order prefix.");
    }
    const pages = [];
    for (let offset = 0; offset < orderedGroups.length; offset += normalizedPageSize) {
        pages.push({
            offset,
            ownerIds: orderedGroups
                .slice(offset, offset + normalizedPageSize)
                .map(({ ownerId }) => ownerId),
        });
    }
    return {
        pageSize: normalizedPageSize,
        orderedGroupDigest: sha256Canonical(orderedGroups),
        initialDisclosureOwnerIds: disclosedOwnerIds,
        pages,
        additionalRerankerCalls: 0,
    };
}

export function validateNeuralScoreArtifact(value) {
    const artifact = requireRecord(value, "Neural score artifact");
    const legacy = artifact.schemaVersion === "satori_search_ranking_r3_scores_v1";
    const trackL = artifact.schemaVersion === "satori_search_ranking_track_l_scores_v2";
    if (!legacy && !trackL) {
        throw new Error("Neural score artifact schema is unsupported.");
    }
    const suppliedDigest = requireSha256(artifact.sha256, "Neural score artifact sha256");
    const { sha256: _ignored, ...unsignedArtifact } = artifact;
    if (sha256Canonical(unsignedArtifact) !== suppliedDigest) {
        throw new Error("Neural score artifact digest does not match its contents.");
    }
    if (legacy && !["D-L16", "D-L32"].includes(artifact.contenderId)) {
        throw new Error("Neural score artifact contender is unsupported.");
    }
    if (trackL) {
        const match = /^projection-v([12])-d-l(16|32|50)$/.exec(artifact.contenderId);
        if (!match || Number(match[2]) !== artifact.candidateDepth) {
            throw new Error("Track L contender and candidate depth are incompatible.");
        }
        const expectedProjection = `search_rerank_document_v${match[1]}`;
        if (artifact.contract?.projectionVersion !== expectedProjection) {
            throw new Error("Track L contender and projection identity are incompatible.");
        }
        requireSha256(artifact.contract?.manifestSeal, "Track L manifest seal");
        requireArray(artifact.captures, "Track L score captures");
        requireArray(artifact.tasks, "Track L score tasks");
    }
    return artifact;
}

export function assertTrackLNeuralAuthority(artifact, options) {
    if (artifact.schemaVersion !== "satori_search_ranking_track_l_scores_v2") return;
    const expectedManifestSeal = requireSha256(
        options?.expectedManifestSeal,
        "Expected Track L manifest seal",
    );
    if (artifact.contract.manifestSeal !== expectedManifestSeal) {
        throw new Error("Neural score artifact does not match the expected Track L manifest seal.");
    }
    const allowedContenderIds = requireArray(
        options?.allowedContenderIds,
        "Allowed Track L contender IDs",
    );
    if (!allowedContenderIds.includes(artifact.contenderId)) {
        throw new Error(`Neural score artifact contender '${artifact.contenderId}' is not allowed.`);
    }
}

export function replayNeuralCandidateCapture(captureValue, neuralValue, options = {}) {
    const capture = requireRecord(captureValue, "Candidate capture");
    const neural = validateNeuralScoreArtifact(neuralValue);
    assertTrackLNeuralAuthority(neural, options);
    const baseline = replayBaselineCandidateCapture(capture, {
        requireNeuralDisabled: true,
        requireGroupingReady: true,
    });
    const captureAuthority = neural.captures.find(
        (entry) => entry.captureSha256 === capture.sha256,
    );
    if (!captureAuthority) {
        throw new Error("Neural score artifact does not bind this candidate capture.");
    }
    if (
        neural.authority.gitRevision !== capture.authority.gitRevision
        || canonicalJson(neural.authority.armPublication)
            !== canonicalJson(capture.authority.armPublication)
    ) {
        throw new Error("Neural score artifact publication authority is incompatible.");
    }
    const diagnosticQualityOnly = options.diagnosticQualityOnly === true;
    const neuralByTaskId = new Map(neural.tasks.map((task) => [task.taskId, task]));
    const baselineByTaskId = new Map(baseline.tasks.map((task) => [task.taskId, task]));
    const tasks = capture.captures.map((taskCapture) => {
        const baselineTask = baselineByTaskId.get(taskCapture.taskId);
        const neuralTask = neuralByTaskId.get(taskCapture.taskId);
        if (!baselineTask || !neuralTask) {
            throw new Error(`Task '${taskCapture.taskId}' is missing baseline or neural authority.`);
        }
        if (taskCapture.readiness?.route === "exact_registry") {
            if (neuralTask.route !== "exact_registry" || neuralTask.policyAffected !== false) {
                throw new Error(`Task '${taskCapture.taskId}' exact route was changed by neural scoring.`);
            }
            return {
                taskId: taskCapture.taskId,
                split: taskCapture.split,
                ...(taskCapture.safetyControls ? {
                    safetyControls: [...taskCapture.safetyControls],
                } : {}),
                queryClass: taskCapture.queryClass,
                language: taskCapture.language,
                expected: taskCapture.expected,
                route: { kind: "exact_registry", fusionReplay: "not_applicable" },
                policyAffected: false,
                rankedResults: baselineTask.rankedResults,
                invariants: {
                    candidateMembershipIdentityEqual: true,
                    eligibilityIdentityEqual: true,
                    exactIdentifierIdentityEqual: true,
                },
            };
        }
        const ranking = neuralTask.status === "scored"
            ? neuralTask.ranking
            : diagnosticQualityOnly
                ? neuralTask.diagnosticRanking
                : [];
        if (neuralTask.status !== "scored" && !diagnosticQualityOnly) {
            throw new Error(
                `Task '${taskCapture.taskId}' neural output is unavailable under the product deadline.`,
            );
        }
        if (canonicalJson(ranking.map(({ candidateId }) => candidateId).sort())
            !== canonicalJson([...neuralTask.selectedCandidateIds].sort())) {
            throw new Error(`Task '${taskCapture.taskId}' neural candidate membership mismatch.`);
        }
        const internalAttempts = taskCapture.candidateTrace.stages
            .filter((stage) => stage.stage === "mcp_fusion")
            .map((stage) => replayMcpAttempt(taskCapture, stage));
        if (internalAttempts.length === 0) {
            throw new Error(`Task '${taskCapture.taskId}' has no replayable MCP attempt.`);
        }
        const baselineLocal = replayPostFusionLocalScoring(
            taskCapture,
            internalAttempts.at(-1),
        );
        const recordedStage = stageByNameAndPass(
            taskCapture.candidateTrace.stages,
            "mcp_filtered",
            internalAttempts.at(-1).attemptId,
        );
        assertLocalScoringMatches(
            baselineLocal.candidates,
            recordedStage,
            `Task '${taskCapture.taskId}' neural baseline scoring`,
        );
        const adjusted = applyFrozenNeuralOrder(baselineLocal, ranking, {
            exactMatchPinningEnabled:
                taskCapture.passConfiguration.rerank.exactMatchPinningEnabled === true,
        });
        assertCandidateMembershipMatchesStage(
            adjusted.candidates,
            recordedStage,
            `Task '${taskCapture.taskId}' neural candidate membership`,
        );
        assertRemovalIdentityMatchesBaseline(
            adjusted.removed,
            baselineLocal.removed,
            `Task '${taskCapture.taskId}' neural eligibility`,
        );
        const groupingDisclosure = replayFrozenGroupingAndDisclosure(
            taskCapture,
            adjusted,
            { assertBaseline: false },
        );
        const frozenPagination = buildFrozenPaginationReplay(
            groupingDisclosure,
            taskCapture.queryPlan.invocationArgs.disclosureLimit,
        );
        return {
            taskId: taskCapture.taskId,
            split: taskCapture.split,
            ...(taskCapture.safetyControls ? {
                safetyControls: [...taskCapture.safetyControls],
            } : {}),
            queryClass: taskCapture.queryClass,
            language: taskCapture.language,
            expected: taskCapture.expected,
            route: {
                kind: "fusion",
                fusionReplay: diagnosticQualityOnly ? "diagnostic_neural" : "neural",
            },
            policyAffected: ranking.length > 0,
            neuralStatus: neuralTask.status,
            selectedCandidateIds: [...neuralTask.selectedCandidateIds],
            ranking,
            mcpAttempts: [{
                attemptId: internalAttempts.at(-1).attemptId,
                candidates: adjusted.candidates.map((candidate, index) => ({
                    candidateId: candidate.candidate.candidateId,
                    ownerId: candidate.candidate.ownerId,
                    relativePath: candidate.candidate.relativePath,
                    symbolLabel: candidate.symbolLabel,
                    symbolId: candidate.symbolId,
                    rank: index + 1,
                    fusionScore: candidate.fusionScore,
                    lexicalScore: candidate.lexicalScore,
                    finalScore: candidate.finalScore,
                })),
                removed: adjusted.removed,
            }],
            groupingDisclosure,
            frozenPagination,
            invariants: {
                candidateMembershipIdentityEqual: true,
                eligibilityIdentityEqual: true,
            },
        };
    });
    const replay = {
        version: 1,
        kind: "satori_search_candidate_neural_replay",
        contenderId: neural.contenderId,
        diagnosticQualityOnly,
        sourceCaptureSha256: capture.sha256,
        sourceNeuralScoreSha256: neural.sha256,
        baselineReplaySha256: baseline.sha256,
        tasks,
    };
    return { ...replay, sha256: sha256Canonical(replay) };
}

export function replayCandidateCapture(value, policyValue = "baseline", options = {}) {
    const baseline = replayBaselineCandidateCapture(value, options);
    if (policyValue === "baseline") return baseline;
    const capture = requireRecord(value, "Candidate capture");
    if (capture.replayReadiness?.survivalReady !== true) {
        throw new Error(
            "Contender replay requires complete depth-160 fusion and candidate-survival authority.",
        );
    }
    const policy = normalizeReplayPolicy(policyValue);
    const { selectedCaptures, selection, taskSuiteVersion } = selectReplayTasks(
        capture,
        options,
    );
    const replayRuntime = buildReplayRuntimeManifest(capture, policy, options);
    const baselineByTaskId = new Map(baseline.tasks.map((task) => [task.taskId, task]));
    if (selectedCaptures.length === 0) {
        throw new Error("Candidate capture has no tasks for the requested selection.");
    }
    const tasks = selectedCaptures.map((taskCapture) => {
        const baselineTask = baselineByTaskId.get(taskCapture.taskId);
        if (!baselineTask) {
            throw new Error(`Task '${taskCapture.taskId}' has no reproduced baseline.`);
        }
        if (taskCapture.readiness?.route === "exact_registry") {
            if (baselineTask.route?.kind !== "exact_registry") {
                throw new Error(`Task '${taskCapture.taskId}' has no reproduced exact-registry baseline.`);
            }
            return {
                taskId: taskCapture.taskId,
                ...(taskCapture.split ? { split: taskCapture.split } : {}),
                ...(taskCapture.safetyControls ? {
                    safetyControls: [...taskCapture.safetyControls],
                } : {}),
                queryClass: taskCapture.queryClass,
                language: taskCapture.language,
                expected: taskCapture.expected,
                route: baselineTask.route,
                policyAffected: false,
                rankedResults: baselineTask.rankedResults,
                corePasses: [],
                mcpAttempts: [],
                rerankerAdmission: {
                    enabled: false,
                    skippedByExactPin: false,
                    selectedCandidateIds: [],
                    familyCount: 0,
                    supplementalCandidateCount: 0,
                    candidatePoolCount: 0,
                    budget: 0,
                    budgetReason: "exact_registry_not_applicable",
                    inputUtf8Bytes: 0,
                },
                ...(policy.version === 2 ? {
                    invariants: {
                        candidateMembershipIdentityEqual: true,
                        eligibilityIdentityEqual: true,
                        exactIdentifierIdentityEqual: true,
                    },
                } : {}),
            };
        }
        const frozenComponentPolicy = policy.version === 2;
        let corePasses;
        let internalMcpAttempts;
        if (frozenComponentPolicy) {
            corePasses = baselineTask.corePasses;
            internalMcpAttempts = taskCapture.candidateTrace.stages
                .filter((stage) => stage.stage === "mcp_fusion")
                .map((stage) => replayMcpAttempt(taskCapture, stage));
        } else {
            const diagnosticLimit = taskCapture.queryPlan?.diagnosticCandidateLimit;
            if (!Number.isSafeInteger(diagnosticLimit) || diagnosticLimit < policy.core.candidateDepth) {
                throw new Error(
                    `Task '${taskCapture.taskId}' diagnostic capture does not cover depth ${policy.core.candidateDepth}.`,
                );
            }
            const outputStages = taskCapture.candidateTrace.stages.filter((stage) => (
                stage.stage === "core_fusion" || stage.stage === "core_result"
            ));
            corePasses = outputStages.map((stage) => replayPolicyCorePass(
                taskCapture,
                stage,
                policy,
            ));
            internalMcpAttempts = taskCapture.candidateTrace.stages
                .filter((stage) => stage.stage === "mcp_fusion")
                .map((stage) => replayPolicyMcpAttempt(taskCapture, stage, corePasses, policy));
        }
        const localAttempts = internalMcpAttempts.map((attempt) => ({
            attemptId: attempt.attemptId,
            ...replayPostFusionLocalScoring(
                taskCapture,
                attempt,
                frozenComponentPolicy ? policy.scoring : undefined,
            ),
        }));
        if (frozenComponentPolicy) {
            const baselineLocalAttempts = internalMcpAttempts.map((attempt) => ({
                attemptId: attempt.attemptId,
                ...replayPostFusionLocalScoring(taskCapture, attempt),
            }));
            localAttempts.forEach((local, index) => {
                const recordedStage = stageByNameAndPass(
                    taskCapture.candidateTrace.stages,
                    "mcp_filtered",
                    local.attemptId,
                );
                if (!recordedStage) {
                    throw new Error(
                        `Task '${taskCapture.taskId}' MCP attempt '${local.attemptId}' has no filtered stage.`,
                    );
                }
                assertCandidateMembershipMatchesStage(
                    local.candidates,
                    recordedStage,
                    `Task '${taskCapture.taskId}' frozen candidate set '${local.attemptId}'`,
                );
                assertRemovalIdentityMatchesBaseline(
                    local.removed,
                    baselineLocalAttempts[index].removed,
                    `Task '${taskCapture.taskId}' frozen eligibility '${local.attemptId}'`,
                );
                if (policy.policyId === "B") {
                    assertLocalScoringMatches(
                        local.candidates,
                        recordedStage,
                        `Task '${taskCapture.taskId}' explicit B scoring '${local.attemptId}'`,
                    );
                }
            });
        }
        const rerankerAdmission = replayRerankerAdmission(taskCapture, localAttempts.at(-1));
        const groupingDisclosure = groupingDisclosureAvailability(taskCapture) === null
            ? replayFrozenGroupingAndDisclosure(taskCapture, localAttempts.at(-1), {
                assertBaseline: frozenComponentPolicy && policy.policyId === "B",
            })
            : null;
        return {
            taskId: taskCapture.taskId,
            ...(taskCapture.split ? { split: taskCapture.split } : {}),
            ...(taskCapture.safetyControls ? {
                safetyControls: [...taskCapture.safetyControls],
            } : {}),
            queryClass: taskCapture.queryClass,
            language: taskCapture.language,
            expected: taskCapture.expected,
            route: { kind: "fusion", fusionReplay: "contender" },
            policyAffected: true,
            corePasses: frozenComponentPolicy
                ? corePasses
                : corePasses.map((pass) => ({
                    passId: pass.passId,
                    mode: pass.mode,
                    fallbackActivated: pass.fallbackActivated,
                    sourceCounts: pass.sourceCounts,
                    candidates: pass.candidates.map((entry) => ({
                        candidateId: entry.candidate.candidateId,
                        ownerId: entry.candidate.ownerId,
                        relativePath: entry.candidate.relativePath,
                        rank: entry.rank,
                        score: entry.score,
                        sources: entry.sources,
                    })),
                })),
            mcpAttempts: internalMcpAttempts.map((attempt, index) => ({
                attemptId: attempt.attemptId,
                passCount: attempt.passCount,
                candidates: localAttempts[index].candidates.map((candidate, rankIndex) => ({
                    candidateId: candidate.candidate.candidateId,
                    ownerId: candidate.candidate.ownerId,
                    relativePath: candidate.candidate.relativePath,
                    symbolLabel: candidate.symbolLabel,
                    symbolId: candidate.symbolId,
                    rank: rankIndex + 1,
                    fusionScore: candidate.fusionScore,
                    lexicalScore: candidate.lexicalScore,
                    capturedPathMultiplier: candidate.capturedPathMultiplier,
                    pathMultiplier: candidate.pathMultiplier,
                    capturedEntrypointOwnerScoreBoost:
                        candidate.capturedEntrypointOwnerScoreBoost,
                    entrypointOwnerScoreBoost: candidate.entrypointOwnerScoreBoost,
                    entrypointOwnerScoreReason: candidate.entrypointOwnerScoreReason,
                    finalScore: candidate.finalScore,
                    passes: candidate.passes,
                })),
                removed: localAttempts[index].removed,
            })),
            ...(frozenComponentPolicy ? {
                invariants: {
                    candidateMembershipIdentityEqual: true,
                    eligibilityIdentityEqual: true,
                },
            } : {}),
            rerankerAdmission: {
                enabled: rerankerAdmission.enabled,
                skippedByExactPin: rerankerAdmission.skippedByExactPin,
                selectedCandidateIds: rerankerAdmission.selected.map(
                    (candidate) => candidate.candidate.candidateId,
                ),
                familyCount: rerankerAdmission.familyCount,
                supplementalCandidateCount: rerankerAdmission.supplementalCandidateCount,
                candidatePoolCount: rerankerAdmission.candidatePoolCount,
                budget: rerankerAdmission.budget,
                budgetReason: rerankerAdmission.budgetReason,
                inputUtf8Bytes: rerankerAdmission.inputUtf8Bytes,
            },
            ...(groupingDisclosure ? { groupingDisclosure } : {}),
            ...(groupingDisclosure ? {
                frozenPagination: buildFrozenPaginationReplay(
                    groupingDisclosure,
                    taskCapture.queryPlan.invocationArgs.disclosureLimit,
                ),
            } : {}),
        };
    });
    const groupingIncompleteTasks = selectedCaptures
        .filter((taskCapture) => (
            taskCapture.readiness?.route === "fusion"
            && groupingDisclosureAvailability(taskCapture) !== null
        ))
        .map((taskCapture) => ({
            taskId: taskCapture.taskId,
            reason: groupingDisclosureAvailability(taskCapture),
        }));
    const replay = {
        version: capture.version,
        kind: "satori_search_candidate_policy_replay",
        taskSuiteVersion,
        sourceCaptureSha256: capture.sha256,
        baselineReplaySha256: baseline.sha256,
        baselineReproduced: true,
        policy,
        policySha256: sha256Canonical(policy),
        ...selection,
        replayRuntime,
        providerValidationRequired: policy.version !== 2,
        replayCoverage: {
            coreFusion: true,
            mcpFusion: true,
            postFusionLocalScoring: true,
            rerankerAdmission: true,
            rerankerProviderOutput: false,
            groupingAndDisclosure: groupingIncompleteTasks.length === 0,
            groupingMembership: "frozen_production_capture",
            responseByteBudget: false,
            fusionTaskCount: tasks.filter((task) => task.policyAffected).length,
            exactRegistryPolicyInvariantTaskCount: tasks.filter((task) => !task.policyAffected).length,
        },
        groupingIncompleteTasks,
        liveValidationReasons: policy.version === 2
            ? ["grouped_response_byte_budget_requires_live_validation"]
            : [
                "new_candidates_have_no_frozen_reranker_scores",
                "grouped_response_byte_budget_requires_live_validation",
            ],
        tasks,
    };
    return { ...replay, sha256: sha256Canonical(replay) };
}

function usage() {
    return "Usage: node --import tsx scripts/satori-search-candidate-replay.mjs --capture <capture.json> [--policy-file <policy.json>] [--split <tuning|held_out|all> | --task-prefix <tuning|validation|all>] [--require-grouping-ready] [--require-neural-disabled] [--out <replay.json>]";
}

export function main(argv = process.argv.slice(2)) {
    let captureFile;
    let policyFile;
    let split;
    let taskPrefix;
    let outFile;
    let requireGroupingReady = false;
    let requireNeuralDisabled = false;
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === "--capture") captureFile = path.resolve(argv[++index]);
        else if (argv[index] === "--policy-file") policyFile = path.resolve(argv[++index]);
        else if (argv[index] === "--split") split = argv[++index];
        else if (argv[index] === "--task-prefix") taskPrefix = argv[++index];
        else if (argv[index] === "--require-grouping-ready") requireGroupingReady = true;
        else if (argv[index] === "--require-neural-disabled") requireNeuralDisabled = true;
        else if (argv[index] === "--out") outFile = path.resolve(argv[++index]);
        else if (argv[index] === "--help") {
            process.stdout.write(`${usage()}\n`);
            return null;
        } else throw new Error(`Unknown argument: ${argv[index]}`);
    }
    if (!captureFile) throw new Error("--capture is required.");
    const capture = JSON.parse(fs.readFileSync(captureFile, "utf8"));
    const policySourceBytes = policyFile ? fs.readFileSync(policyFile) : undefined;
    const policy = policySourceBytes
        ? JSON.parse(policySourceBytes.toString("utf8"))
        : "baseline";
    const replay = replayCandidateCapture(capture, policy, {
        ...(split !== undefined ? { split } : {}),
        ...(taskPrefix !== undefined ? { taskPrefix } : {}),
        requireGroupingReady,
        requireNeuralDisabled,
        ...(policySourceBytes ? { policySourceBytes } : {}),
        ...(policyFile ? { policySourceFileName: policyFile } : {}),
    });
    const serialized = `${JSON.stringify(replay, null, 2)}\n`;
    if (outFile) fs.writeFileSync(outFile, serialized);
    else process.stdout.write(serialized);
    return replay;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === REPLAY_SCRIPT_PATH) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`satori-search-candidate-replay: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
        process.exitCode = 1;
    }
}
