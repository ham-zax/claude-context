#!/usr/bin/env -S node --import tsx
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLanguageAnalysisService } from "../packages/core/src/language-analysis/service.ts";
import { buildIndexedChunkId } from "../packages/core/src/core/indexed-chunk-identity.ts";
import { buildRerankCandidatePool } from "../packages/mcp/src/core/search-rerank-policy.ts";
import {
    LATEON_RUNTIME_PROFILE_IDS,
    LateOnOperationalError,
    LateOnReranker,
} from "../packages/mcp/src/server/lateon-reranker.ts";
import { buildR3DocumentProjection } from "./satori-search-ranking-r3-score.mjs";
import { canonicalJson } from "./satori-useful-context.mjs";
import { replayBaselineCandidateCapture } from "./satori-search-candidate-replay.mjs";
import {
    PAGINATION_CONTROL_TEST_NAME,
    PRODUCT_FALLBACK_TEST_NAME,
    deriveO2MeasurementOutcome,
} from "./satori-lateon-track-o-o2-evidence.mjs";

export const O2_EVIDENCE_SCHEMA = "satori_lateon_track_o_o2_evidence_v1";
export const O2_RECEIPT_KIND = "satori_lateon_track_o_operational_qualification_receipt";
const PROFILE_ID = "lateon_offline_quality_projection_v2_d32_v1";
const CANDIDATE_ID = "projection-v2-d-l32";
const EXPECTED_QUALITY_TASKS = 36;
const EXPECTED_NEURAL_REQUESTS = 34;
const EXPECTED_SAFETY_TASKS = 2;
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MCP_REQUIRE = createRequire(path.join(REPOSITORY_ROOT, "packages/mcp/package.json"));
const PRODUCTION_D32_PROFILE = path.join(
    REPOSITORY_ROOT,
    "packages/mcp/assets/lateon/runtime-profile-v2-d32.json",
);
const PRODUCTION_RUNTIME_WORKER = path.join(
    REPOSITORY_ROOT,
    "packages/mcp/dist/server/lateon-reranker-worker.js",
);
const IMPLEMENTATION_PATHS = Object.freeze({
    projectionSource: "packages/mcp/src/core/search-rerank-document-v2.ts",
    runtimeSource: "packages/mcp/src/server/lateon-reranker.ts",
    measurementScript: "scripts/satori-lateon-track-o-o2.mjs",
    scenarioWorker: "scripts/satori-lateon-track-o-o2-fixture-worker.cjs",
    evidenceDerivation: "scripts/satori-lateon-track-o-o2-evidence.mjs",
    baselineReplayOwner: "scripts/satori-search-candidate-replay.mjs",
    productFallbackTest: "packages/mcp/src/core/handlers.scope.test.ts",
});

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, label) {
    if (!isRecord(value)) throw new Error(`${label} must be an object.`);
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
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`${label} must be a SHA-256 digest.`);
    return digest;
}

function requireEqual(actual, expected, label) {
    if (canonicalJson(actual) !== canonicalJson(expected)) {
        throw new Error(`${label} does not match the frozen Track O authority.`);
    }
}

function compareContractStrings(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}

export function sha256Bytes(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

export function sha256Canonical(value) {
    return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}

function readJson(file, label) {
    const bytes = fs.readFileSync(file);
    let value;
    try {
        value = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
        throw new Error(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { bytes, value: requireRecord(value, label) };
}

function validateSelfDigest(value, label) {
    const supplied = requireSha256(value.sha256, `${label}.sha256`);
    const { sha256: _ignored, ...unsigned } = value;
    if (sha256Canonical(unsigned) !== supplied) {
        throw new Error(`${label} digest does not match its contents.`);
    }
    return supplied;
}

function sha256File(file) {
    return sha256Bytes(fs.readFileSync(file));
}

function gitOutput(root, args) {
    return execFileSync("git", ["-C", root, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    }).trim();
}

function resolveCleanGitIdentity(root, expected = undefined) {
    const canonicalRoot = fs.realpathSync(root);
    if (gitOutput(canonicalRoot, ["status", "--porcelain=v1", "--untracked-files=all"])) {
        throw new Error(`Source worktree '${canonicalRoot}' must be clean.`);
    }
    const identity = {
        canonicalRoot,
        revision: gitOutput(canonicalRoot, ["rev-parse", "HEAD"]),
        tree: gitOutput(canonicalRoot, ["rev-parse", "HEAD^{tree}"]),
        sourceTreeSha256: sha256Bytes(execFileSync(
            "git",
            ["-C", canonicalRoot, "ls-tree", "-r", "--full-tree", "HEAD"],
        )),
    };
    if (expected) {
        requireEqual(identity.revision, expected.revision, `${expected.id} source revision`);
        requireEqual(identity.tree, expected.gitTree, `${expected.id} source tree`);
        requireEqual(
            identity.sourceTreeSha256,
            expected.sourceTreeSha256,
            `${expected.id} source-tree digest`,
        );
    }
    return identity;
}

function normalizeCandidate(authority) {
    return {
        id: requireString(authority.candidate?.id, "O0 candidate id"),
        candidateDepth: authority.candidate?.candidateDepth,
        projection: {
            id: requireString(authority.candidate?.projection?.id, "O0 projection id"),
            sha256: requireSha256(authority.candidate?.projection?.sha256, "O0 projection sha256"),
        },
        model: {
            repository: requireString(authority.candidate?.model?.repository, "O0 model repository"),
            revision: requireString(authority.candidate?.model?.revision, "O0 model revision"),
        },
        artifacts: authority.candidate?.artifacts?.map((artifact, index) => ({
            role: requireString(artifact.role, `O0 artifact ${index + 1} role`),
            path: requireString(artifact.path, `O0 artifact ${index + 1} path`),
            sha256: requireSha256(artifact.sha256, `O0 artifact ${index + 1} sha256`),
        })) ?? [],
    };
}

export function validateTrackOAuthority({
    authorityFile,
    expectedAuthorityFileSha256,
    profileFile,
    modelRoot,
}) {
    if (fs.realpathSync(profileFile) !== fs.realpathSync(PRODUCTION_D32_PROFILE)) {
        throw new Error("Track O must measure the production-owned D32 runtime profile asset.");
    }
    const authoritySource = readJson(authorityFile, "Track O O0 authority");
    const authorityFileSha256 = sha256Bytes(authoritySource.bytes);
    requireSha256(expectedAuthorityFileSha256, "Expected Track O O0 authority sha256");
    if (authorityFileSha256 !== expectedAuthorityFileSha256) {
        throw new Error("Track O O0 authority file digest is not the committed seal.");
    }
    const authority = authoritySource.value;
    if (
        authority.version !== 1
        || authority.kind !== "satori_lateon_track_o_authority"
        || authority.phase !== "O0"
        || authority.status !== "prospective_authority_outputs_unopened"
        || authority.state?.o2MeasurementsOpened !== false
        || authority.state?.heldOutScoresOpened !== false
    ) {
        throw new Error("Track O O0 authority identity or unopened state is invalid.");
    }
    const candidate = normalizeCandidate(authority);
    if (candidate.id !== CANDIDATE_ID || candidate.candidateDepth !== 32) {
        throw new Error("Track O O0 authority does not nominate projection-v2 D32.");
    }
    const profileSource = readJson(profileFile, "Track O D32 profile");
    const profile = profileSource.value;
    if (
        profile.schemaVersion !== "satori_lateon_runtime_profile_v2"
        || profile.profileId !== PROFILE_ID
        || profile.qualificationStatus !== "disabled_track_o_candidate"
        || profile.inference?.candidateDepth !== 32
    ) {
        throw new Error("Track O runtime profile is not the frozen disabled D32 profile.");
    }
    requireEqual(profile.identity?.repository, candidate.model.repository, "D32 model repository");
    requireEqual(profile.identity?.revision, candidate.model.revision, "D32 model revision");
    requireEqual(profile.identity?.projectionVersion, candidate.projection.id, "D32 projection id");
    requireEqual(profile.identity?.projectionSha256, candidate.projection.sha256, "D32 projection digest");
    requireEqual(
        profile.artifacts,
        candidate.artifacts.map(({ path: artifactPath, sha256 }) => ({ path: artifactPath, sha256 })),
        "D32 artifact bindings",
    );
    for (const artifact of candidate.artifacts) {
        const file = path.resolve(modelRoot, artifact.path);
        const relative = path.relative(fs.realpathSync(modelRoot), fs.realpathSync(file));
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
            throw new Error(`Model artifact '${artifact.path}' escapes the model root.`);
        }
        if (sha256File(file) !== artifact.sha256) {
            throw new Error(`Model artifact '${artifact.path}' digest mismatch.`);
        }
    }
    const effectiveOperationalBounds = {
        maximumActiveReranks: profile.operationalBounds?.maximumActiveReranks,
        maximumQueuedReranks: profile.operationalBounds?.maximumQueuedReranks,
        maximumQueueWaitMilliseconds: profile.operationalBounds?.maximumQueueWaitMilliseconds,
        maximumScoreMilliseconds: profile.operationalBounds?.maximumScoreMilliseconds,
        maximumRerankerStageMilliseconds:
            profile.operationalBounds?.maximumRerankerStageMilliseconds,
    };
    return {
        authority,
        authorityFileSha256,
        expectedAuthorityFileSha256,
        candidate,
        profile,
        profileBinding: {
            id: profile.profileId,
            assetFileSha256: sha256Bytes(profileSource.bytes),
            assetCanonicalSha256: sha256Canonical(profile),
            effectiveIdentitySha256: sha256Canonical({
                profile,
                effectiveOperationalBounds,
                intraOpThreads: profile.inference.profileIntraOpThreads,
            }),
        },
    };
}

function finalFilteredStage(capture) {
    const stages = capture.candidateTrace?.stages?.filter(({ stage }) => stage === "mcp_filtered") ?? [];
    if (stages.length === 0) throw new Error(`Task '${capture.taskId}' has no filtered stage.`);
    return stages.at(-1);
}

function replaySignals(capture, passId) {
    const signals = new Map();
    const prefix = `${passId}/replay:`;
    for (const stage of capture.candidateTrace.stages) {
        if (
            stage.stage !== "mcp_replay_signals"
            || (stage.passId !== passId && !stage.passId?.startsWith(prefix))
        ) continue;
        for (const candidate of stage.candidates) {
            if (signals.has(candidate.candidateId)) {
                throw new Error(`Task '${capture.taskId}' has duplicate replay signals.`);
            }
            signals.set(candidate.candidateId, candidate);
        }
    }
    return signals;
}

function ownerIdentity(ownerId) {
    let parsed;
    try {
        parsed = JSON.parse(ownerId);
    } catch {
        throw new Error("Captured candidate owner identity is invalid JSON.");
    }
    if (parsed?.[0] === "symbol" && parsed.length === 3) {
        return { ownerSymbolInstanceId: requireString(parsed[2], "Captured owner symbol") };
    }
    if (parsed?.[0] === "file" && parsed.length === 2) return {};
    throw new Error("Captured candidate owner identity has an unsupported shape.");
}

function selectCandidates(capture, depth) {
    const filtered = finalFilteredStage(capture);
    const signals = replaySignals(capture, filtered.passId);
    const candidates = filtered.candidates.map((candidate) => {
        const signal = signals.get(candidate.candidateId);
        if (!signal) throw new Error(`Candidate '${candidate.candidateId}' has no replay signal.`);
        return {
            candidateId: candidate.candidateId,
            result: {
                relativePath: candidate.relativePath,
                startLine: candidate.startLine,
                endLine: candidate.endLine,
                language: candidate.language,
                symbolLabel: signal.replay?.symbolLabel ?? undefined,
                ...ownerIdentity(candidate.ownerId),
            },
        };
    });
    return buildRerankCandidatePool(candidates).candidates.slice(0, depth);
}

async function reconstructDocuments(sourceRoot, capture, candidates, analysisService) {
    const byFile = new Map();
    for (const candidate of candidates) {
        const current = byFile.get(candidate.result.relativePath) ?? [];
        current.push(candidate);
        byFile.set(candidate.result.relativePath, current);
    }
    const documents = new Map();
    const query = requireString(
        capture.queryPlan?.queryIntent?.semanticQuery,
        `Task '${capture.taskId}' semantic query`,
    );
    for (const [relativePath, fileCandidates] of byFile) {
        if (relativePath.startsWith("/") || relativePath.split(/[\\/]/).includes("..")) {
            throw new Error(`Unsafe captured path '${relativePath}'.`);
        }
        const source = fs.readFileSync(path.join(sourceRoot, relativePath), "utf8");
        const languages = new Set(fileCandidates.map(({ result }) => result.language));
        if (languages.size !== 1) throw new Error(`Inconsistent language for '${relativePath}'.`);
        const analysis = await analysisService.analyze({
            content: source,
            relativePath,
            language: [...languages][0],
        });
        const chunks = new Map();
        analysis.chunks.forEach((chunk, index) => {
            chunks.set(buildIndexedChunkId(relativePath, chunk, index), chunk);
        });
        for (const candidate of fileCandidates) {
            const chunk = chunks.get(candidate.candidateId);
            if (!chunk
                || candidate.result.startLine !== chunk.metadata.startLine
                || candidate.result.endLine !== chunk.metadata.endLine) {
                throw new Error(`Captured chunk '${candidate.candidateId}' cannot be reconstructed.`);
            }
            const projection = buildR3DocumentProjection({
                candidate,
                chunk,
                projectionVersion: "search_rerank_document_v2",
                query,
                sourceContent: source,
            });
            documents.set(candidate.candidateId, projection.text);
        }
    }
    return candidates.map(({ candidateId }) => ({
        candidateId,
        text: requireString(documents.get(candidateId), `Projection '${candidateId}'`),
    }));
}

export async function reconstructTrackOTuningRequests({
    captureRoot,
    sourceRootParent,
    authority,
}) {
    const captureAuthorityFile = path.join(captureRoot, "capture-authority-05fb2737.json");
    const captureAuthoritySource = readJson(captureAuthorityFile, "Track L capture authority");
    const captureAuthority = captureAuthoritySource.value;
    validateSelfDigest(captureAuthority, "Track L capture authority");
    requireEqual(
        captureAuthority.aggregateCaptureSha256,
        authority.historicalAuthority?.l3Archive?.aggregateTuningCaptureSha256,
        "Track L aggregate capture",
    );
    if (captureAuthority.manifestSeal !== authority.heldOutDecision?.manifest?.canonicalSealSha256) {
        throw new Error("Track L capture authority has the wrong manifest seal.");
    }
    const analysisService = createLanguageAnalysisService();
    const requests = [];
    const repositories = [];
    for (const repository of [...captureAuthority.repositories]
        .sort((a, b) => compareContractStrings(a.id, b.id))) {
        const sourceIdentity = resolveCleanGitIdentity(
            path.join(sourceRootParent, repository.id),
            repository,
        );
        const positiveFile = path.join(captureRoot, repository.id, "positive-capture.json");
        if (sha256File(positiveFile) !== repository.positive.fileSha256) {
            throw new Error(`Positive capture '${repository.id}' file digest mismatch.`);
        }
        const capture = readJson(positiveFile, `${repository.id} positive capture`).value;
        validateSelfDigest(capture, `${repository.id} positive capture`);
        requireEqual(capture.sha256, repository.positive.captureSha256, `${repository.id} capture digest`);
        const baselineReplay = replayBaselineCandidateCapture(capture, {
            requireNeuralDisabled: true,
            requireGroupingReady: true,
        });
        const authorizedTasks = new Map(repository.tasks.positive.map((task) => [task.taskId, task]));
        for (const taskCapture of capture.captures) {
            const taskAuthority = authorizedTasks.get(taskCapture.taskId);
            if (!taskAuthority || taskCapture.split !== "tuning") {
                throw new Error(`Task '${taskCapture.taskId}' lacks tuning authority.`);
            }
            const neuralEligible = taskCapture.readiness?.route === "fusion";
            let documents = [];
            if (neuralEligible) {
                const candidates = selectCandidates(taskCapture, 32);
                if (candidates.length !== 32) {
                    throw new Error(`Task '${taskCapture.taskId}' does not reconstruct D32.`);
                }
                documents = await reconstructDocuments(
                    sourceIdentity.canonicalRoot,
                    taskCapture,
                    candidates,
                    analysisService,
                );
            } else if (
                taskCapture.readiness?.route !== "exact_registry"
                || taskCapture.readiness?.policyInvariant !== true
                || taskCapture.passConfiguration?.rerank?.attempted !== false
                || taskCapture.queryPlan?.route?.currentProviderBudget?.rerankCalls !== 0
            ) {
                throw new Error(
                    `Task '${taskCapture.taskId}' is neither D32-eligible nor a frozen exact control.`,
                );
            }
            requests.push({
                id: `${repository.id}/${taskCapture.taskId}`,
                repositoryId: repository.id,
                taskId: taskCapture.taskId,
                query: taskCapture.queryPlan.queryIntent.semanticQuery,
                identities: documents.map(({ candidateId }) => candidateId),
                documents: documents.map(({ text }) => text),
                projectionSha256s: documents.map(({ candidateId, text }) => ({
                    candidateId,
                    sha256: sha256Bytes(Buffer.from(text, "utf8")),
                })),
                safetyControls: [...taskAuthority.safetyControls],
                neuralEligible,
                baselineResultStateSha256: taskCapture.rankedSetDigest,
            });
        }
        repositories.push({
            id: repository.id,
            revision: sourceIdentity.revision,
            tree: sourceIdentity.tree,
            sourceTreeSha256: sourceIdentity.sourceTreeSha256,
            positiveCaptureFileSha256: repository.positive.fileSha256,
            positiveCaptureSha256: repository.positive.captureSha256,
            baselineReplaySha256: baselineReplay.sha256,
        });
    }
    const qualityRequests = requests.filter(({ safetyControls }) => safetyControls.length === 0);
    const safetyRequests = requests.filter(({ safetyControls }) => safetyControls.length > 0);
    const eligibleNeuralRequests = qualityRequests.filter(({ neuralEligible }) => neuralEligible);
    const policyInvariantControls = qualityRequests.filter(({ neuralEligible }) => !neuralEligible);
    if (
        qualityRequests.length !== EXPECTED_QUALITY_TASKS
        || eligibleNeuralRequests.length !== EXPECTED_NEURAL_REQUESTS
        || safetyRequests.length !== EXPECTED_SAFETY_TASKS
    ) {
        throw new Error(
            `Track O requires ${EXPECTED_QUALITY_TASKS} quality tasks, `
            + `${EXPECTED_NEURAL_REQUESTS} eligible neural requests, and `
            + `${EXPECTED_SAFETY_TASKS} safety tasks.`,
        );
    }
    qualityRequests.sort((a, b) => compareContractStrings(a.id, b.id));
    safetyRequests.sort((a, b) => compareContractStrings(a.id, b.id));
    const publicRequests = [...qualityRequests, ...safetyRequests].map((request) => ({
        id: request.id,
        safetyControls: request.safetyControls,
        neuralEligible: request.neuralEligible,
        querySha256: sha256Bytes(Buffer.from(request.query, "utf8")),
        candidateIdentities: request.identities,
        projections: request.projectionSha256s,
        baselineResultStateSha256: request.baselineResultStateSha256,
    }));
    return {
        qualityRequests,
        eligibleNeuralRequests,
        safetyRequests,
        binding: {
            repositoryCount: repositories.length,
            totalTasks: qualityRequests.length,
            neuralEligibleRequests: eligibleNeuralRequests.length,
            policyInvariantControls: policyInvariantControls
                .map((request) => ({
                    id: request.id,
                    route: "exact_registry",
                    baselineResultStateSha256: request.baselineResultStateSha256,
                }))
                .sort((a, b) => compareContractStrings(a.id, b.id)),
            safetyTaskCount: safetyRequests.length,
            safetyControls: safetyRequests.map((request) => ({
                id: request.id,
                controls: request.safetyControls,
                baselineResultStateSha256: request.baselineResultStateSha256,
            })),
            captureAuthorityFileSha256: sha256Bytes(captureAuthoritySource.bytes),
            aggregateCaptureSha256: captureAuthority.aggregateCaptureSha256,
            repositories,
            requestSetSha256: sha256Canonical(publicRequests),
        },
    };
}

function retainedLength(tokenized) {
    const length = tokenized?.input_ids?.dims?.[1];
    if (!Number.isSafeInteger(length) || length <= 0) {
        throw new Error("Tokenizer emitted an invalid sequence length.");
    }
    return length;
}

export async function annotateRequestTokenMetrics(requests, tokenizer, profile) {
    const tokenize = (text, isQuery) => tokenizer(
        `${isQuery ? profile.inference.queryPrefix : profile.inference.documentPrefix}`
        + `${profile.inference.lowercase ? text.toLowerCase() : text}`,
        {
            truncation: true,
            max_length: isQuery
                ? profile.inference.queryTokenLimit
                : profile.inference.documentTokenLimit,
        },
    );
    return Promise.all(requests.map(async (request) => {
        const lengths = [
            retainedLength(await tokenize(request.query, true)),
            ...await Promise.all(request.documents.map(async (document) =>
                retainedLength(await tokenize(document, false)))),
        ];
        const aggregateRetainedTokenCount = lengths.reduce((sum, value) => sum + value, 0);
        return {
            ...request,
            aggregateRetainedTokenCount,
            aggregateInputTensorBytes: aggregateRetainedTokenCount * 2 * BigInt64Array.BYTES_PER_ELEMENT,
        };
    }));
}

export function selectWorstTrackORequest(requests) {
    if (requests.length === 0) throw new Error("Track O request set is empty.");
    return [...requests].sort((left, right) => (
        right.aggregateRetainedTokenCount - left.aggregateRetainedTokenCount
        || right.aggregateInputTensorBytes - left.aggregateInputTensorBytes
        || compareContractStrings(left.id, right.id)
    ))[0];
}

export function buildCounterbalancedWarmSchedule(requests, count) {
    if (!Number.isSafeInteger(count) || count <= 0 || requests.length === 0) {
        throw new Error("Counterbalanced schedule requires requests and a positive count.");
    }
    const byRepository = new Map();
    for (const request of [...requests].sort((a, b) => compareContractStrings(a.id, b.id))) {
        const current = byRepository.get(request.repositoryId) ?? [];
        current.push(request);
        byRepository.set(request.repositoryId, current);
    }
    const repositoryIds = [...byRepository.keys()].sort();
    const schedule = [];
    let cycle = 0;
    while (schedule.length < count) {
        let cycleRequests;
        if (cycle === 0) {
            cycleRequests = repositoryIds.flatMap((id) => byRepository.get(id));
        } else if (cycle === 1) {
            cycleRequests = repositoryIds.flatMap((id) => byRepository.get(id)).reverse();
        } else {
            const rotatedRepositories = repositoryIds.map(
                (_id, index) => repositoryIds[(index + cycle) % repositoryIds.length],
            );
            cycleRequests = rotatedRepositories.flatMap((id) => {
                const tasks = byRepository.get(id);
                const offset = cycle % tasks.length;
                return tasks.map((_task, index) => tasks[(index + offset) % tasks.length]);
            });
        }
        schedule.push(...cycleRequests.slice(0, count - schedule.length));
        cycle += 1;
    }
    return schedule;
}

export function nearestRankPercentile(values, percentile) {
    if (values.length === 0 || percentile <= 0 || percentile > 1) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.ceil(percentile * sorted.length) - 1];
}

function sealObservation(value) {
    return { ...value, observationSha256: sha256Canonical(value) };
}

function roundedMilliseconds(started) {
    return Math.round((performance.now() - started) * 1_000) / 1_000;
}

function processTreePids(rootPid = process.pid) {
    const pending = [rootPid];
    const seen = new Set();
    while (pending.length > 0) {
        const pid = pending.pop();
        if (seen.has(pid)) continue;
        seen.add(pid);
        try {
            const children = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, "utf8")
                .trim().split(/\s+/).filter(Boolean).map(Number);
            pending.push(...children);
        } catch {
            // A process may exit between samples.
        }
    }
    return [...seen];
}

function processTreeRssBytes() {
    let total = 0;
    for (const pid of processTreePids()) {
        try {
            const match = /^VmRSS:\s+(\d+)\s+kB$/m.exec(
                fs.readFileSync(`/proc/${pid}/status`, "utf8"),
            );
            if (match) total += Number(match[1]) * 1024;
        } catch {
            // A process may exit between samples.
        }
    }
    return total;
}

function startRssSampler(intervalMilliseconds) {
    let peak = processTreeRssBytes();
    const timer = setInterval(() => {
        peak = Math.max(peak, processTreeRssBytes());
    }, intervalMilliseconds);
    timer.unref();
    return {
        stop() {
            clearInterval(timer);
            peak = Math.max(peak, processTreeRssBytes());
            return peak;
        },
    };
}

export function completeOrderDigest(request, result) {
    if (result.length !== request.identities.length) {
        throw new Error(`Request '${request.id}' returned an incomplete neural order.`);
    }
    const seen = new Set();
    const order = result.map(({ index, relevanceScore }) => {
        if (
            !Number.isSafeInteger(index)
            || index < 0
            || index >= request.identities.length
            || seen.has(index)
            || !Number.isFinite(relevanceScore)
        ) {
            throw new Error(`Request '${request.id}' returned an invalid neural order.`);
        }
        seen.add(index);
        return { candidateId: request.identities[index], relevanceScore };
    });
    return sha256Canonical(order);
}

export async function measureRealModelOperations({
    runtimeFactory,
    qualityRequests,
    worstRequest,
    observationCounts,
    rssSamplingMilliseconds,
    retainedRssCooldownMilliseconds,
}) {
    const processColdReadiness = [];
    const coldFirstScore = [];
    let peakRssBytes = processTreeRssBytes();
    for (let index = 0; index < observationCounts.processColdWorkerStarts; index += 1) {
        const sampler = startRssSampler(rssSamplingMilliseconds);
        const started = performance.now();
        let runtime;
        try {
            runtime = runtimeFactory();
            try {
                await runtime.waitUntilReady();
            } catch (error) {
                processColdReadiness.push(sealObservation({
                    ordinal: index + 1,
                    requestId: worstRequest.id,
                    elapsedMilliseconds: roundedMilliseconds(started),
                    rssBytes: processTreeRssBytes(),
                    outcome: "failed",
                    operationalReason: operationalReason(error),
                }));
                coldFirstScore.push(sealObservation({
                    ordinal: index + 1,
                    requestId: worstRequest.id,
                    elapsedMilliseconds: 0,
                    rssBytes: processTreeRssBytes(),
                    outcome: "not_run_readiness_failed",
                    operationalReason: operationalReason(error),
                }));
                continue;
            }
            processColdReadiness.push(sealObservation({
                ordinal: index + 1,
                requestId: worstRequest.id,
                elapsedMilliseconds: roundedMilliseconds(started),
                rssBytes: processTreeRssBytes(),
                outcome: "ready",
            }));
            const scoreStarted = performance.now();
            try {
                const result = await runtime.rerank(
                    worstRequest.query,
                    worstRequest.documents,
                    { identities: worstRequest.identities },
                );
                coldFirstScore.push(sealObservation({
                    ordinal: index + 1,
                    requestId: worstRequest.id,
                    elapsedMilliseconds: roundedMilliseconds(scoreStarted),
                    rssBytes: processTreeRssBytes(),
                    orderSha256: completeOrderDigest(worstRequest, result),
                    permutationValidated: true,
                    outcome: "complete",
                }));
            } catch (error) {
                coldFirstScore.push(sealObservation({
                    ordinal: index + 1,
                    requestId: worstRequest.id,
                    elapsedMilliseconds: roundedMilliseconds(scoreStarted),
                    rssBytes: processTreeRssBytes(),
                    outcome: "failed",
                    operationalReason: operationalReason(error),
                }));
            }
        } finally {
            await runtime?.close();
            peakRssBytes = Math.max(peakRssBytes, sampler.stop());
        }
    }
    if (coldFirstScore.length !== observationCounts.coldFirstScoreRequests) {
        throw new Error("Cold first-score count does not match O0.");
    }
    const warmRuntime = runtimeFactory();
    const warmSampler = startRssSampler(rssSamplingMilliseconds);
    const warmScore = [];
    try {
        const schedule = buildCounterbalancedWarmSchedule(
            qualityRequests,
            observationCounts.warmRequests,
        );
        let startupError;
        try {
            await warmRuntime.waitUntilReady();
            for (let index = 0; index < 2; index += 1) {
                await warmRuntime.rerank(worstRequest.query, worstRequest.documents, {
                    identities: worstRequest.identities,
                });
            }
        } catch (error) {
            startupError = error;
        }
        for (let index = 0; index < schedule.length; index += 1) {
            const request = schedule[index];
            const started = performance.now();
            try {
                if (startupError) throw startupError;
                const result = await warmRuntime.rerank(request.query, request.documents, {
                    identities: request.identities,
                });
                warmScore.push(sealObservation({
                    ordinal: index + 1,
                    requestId: request.id,
                    elapsedMilliseconds: roundedMilliseconds(started),
                    rssBytes: processTreeRssBytes(),
                    orderSha256: completeOrderDigest(request, result),
                    permutationValidated: true,
                    outcome: "complete",
                }));
            } catch (error) {
                warmScore.push(sealObservation({
                    ordinal: index + 1,
                    requestId: request.id,
                    elapsedMilliseconds: roundedMilliseconds(started),
                    rssBytes: processTreeRssBytes(),
                    outcome: "failed",
                    operationalReason: operationalReason(error),
                }));
            }
        }
        await new Promise((resolve) => setTimeout(resolve, retainedRssCooldownMilliseconds));
        const retainedRssBytes = processTreeRssBytes();
        peakRssBytes = Math.max(peakRssBytes, warmSampler.stop());
        return {
            processColdReadiness,
            coldFirstScore,
            warmScore,
            peakRssBytes,
            retainedRssBytes,
        };
    } finally {
        await warmRuntime.close();
    }
}

function operationalReason(error) {
    return error instanceof LateOnOperationalError ? error.reason : "unexpected_error";
}

async function captureFailure(promise, baselineResultStateSha256) {
    const started = performance.now();
    try {
        await promise;
        return {
            elapsedMilliseconds: roundedMilliseconds(started),
            outcome: "unexpected_neural_success",
            operationalReason: null,
        };
    } catch (error) {
        return {
            elapsedMilliseconds: roundedMilliseconds(started),
            outcome: "baseline_fallback",
            operationalReason: operationalReason(error),
            baselineResultStateSha256,
        };
    }
}

export async function runFailureScenarios({ runtimeFactory, request, counts }) {
    const observations = {
        queueSaturation: [],
        queuedCancellation: [],
        executingCancellation: [],
        activeAndQueuedShutdown: [],
        malformedOutput: [],
        workerFailure: [],
    };
    const record = (kind, ordinal, value) => {
        observations[kind].push(sealObservation({
            ordinal,
            ...value,
            rssBytes: processTreeRssBytes(),
        }));
    };
    for (let index = 0; index < counts.queueSaturationRepetitions; index += 1) {
        const runtime = runtimeFactory();
        try {
            await runtime.waitUntilReady();
            const shortActive = runtime.rerank("fixture:short", request.documents, {
                identities: request.identities,
            });
            const queuedStarted = performance.now();
            const queued = runtime.rerank("fixture:normal", request.documents, {
                identities: request.identities,
            });
            const capacityFallback = await captureFailure(
                runtime.rerank("fixture:overflow", request.documents, {
                    identities: request.identities,
                }),
                request.baselineResultStateSha256,
            );
            await shortActive;
            const queuedResult = await queued;
            const queuedSuccess = {
                elapsedMilliseconds: roundedMilliseconds(queuedStarted),
                outcome: "complete",
                orderSha256: completeOrderDigest(request, queuedResult),
                permutationValidated: true,
            };
            const timeoutActive = runtime.rerank("fixture:slow", request.documents, {
                identities: request.identities,
            });
            const queuedTimeout = captureFailure(
                runtime.rerank("fixture:normal", request.documents, {
                    identities: request.identities,
                }),
                request.baselineResultStateSha256,
            );
            await timeoutActive;
            record("queueSaturation", index + 1, {
                shortActiveOutcome: "complete",
                queuedSuccess,
                capacityFallback,
                timeoutActiveOutcome: "complete",
                queuedTimeout: await queuedTimeout,
            });
        } finally {
            await runtime.close();
        }
    }
    for (let index = 0; index < counts.queuedCancellationRepetitions; index += 1) {
        const runtime = runtimeFactory();
        try {
            await runtime.waitUntilReady();
            const active = runtime.rerank("fixture:slow", request.documents, {
                identities: request.identities,
            });
            const controller = new AbortController();
            const queued = runtime.rerank("fixture:normal", request.documents, {
                identities: request.identities,
                signal: controller.signal,
            });
            controller.abort();
            record("queuedCancellation", index + 1, await captureFailure(
                queued,
                request.baselineResultStateSha256,
            ));
            await active;
        } finally {
            await runtime.close();
        }
    }
    for (let index = 0; index < counts.executingCancellationRepetitions; index += 1) {
        const runtime = runtimeFactory();
        try {
            await runtime.waitUntilReady();
            const controller = new AbortController();
            const active = runtime.rerank("fixture:hang", request.documents, {
                identities: request.identities,
                signal: controller.signal,
            });
            controller.abort();
            record("executingCancellation", index + 1, await captureFailure(
                active,
                request.baselineResultStateSha256,
            ));
        } finally {
            await runtime.close();
        }
    }
    for (let index = 0; index < counts.activeAndQueuedShutdownRepetitions; index += 1) {
        const runtime = runtimeFactory();
        await runtime.waitUntilReady();
        const active = runtime.rerank("fixture:hang", request.documents, {
            identities: request.identities,
        });
        const queued = runtime.rerank("fixture:normal", request.documents, {
            identities: request.identities,
        });
        const activeFallback = captureFailure(active, request.baselineResultStateSha256);
        const queuedFallback = captureFailure(queued, request.baselineResultStateSha256);
        await runtime.close();
        record("activeAndQueuedShutdown", index + 1, {
            active: await activeFallback,
            queued: await queuedFallback,
            operationalSnapshot: runtime.getOperationalSnapshot(),
        });
    }
    for (const [kind, repetitions, query] of [
        ["malformedOutput", counts.malformedOutputRepetitions, "fixture:malformed"],
        ["workerFailure", counts.workerFailureRepetitions, "fixture:crash"],
    ]) {
        for (let index = 0; index < repetitions; index += 1) {
            const runtime = runtimeFactory();
            try {
                await runtime.waitUntilReady();
                record(kind, index + 1, await captureFailure(
                    runtime.rerank(query, request.documents, { identities: request.identities }),
                    request.baselineResultStateSha256,
                ));
            } finally {
                await runtime.close();
            }
        }
    }
    return observations;
}

function defaultCommandRunner({ executable, args, cwd }) {
    const result = spawnSync(executable, args, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error || result.status !== 0) {
        const detail = (result.stderr || result.stdout || result.error?.message || "unknown error")
            .trim().slice(-2_000);
        throw new Error(`Product fallback proof command failed: ${detail}`);
    }
}

export function runProductFallbackProof({ repoRoot = REPOSITORY_ROOT, runCommand = defaultCommandRunner } = {}) {
    const packageManager = requireString(
        JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).packageManager,
        "Root packageManager",
    );
    const [packageManagerName, packageManagerVersion] = packageManager.split("@");
    if (packageManagerName !== "pnpm" || !packageManagerVersion) {
        throw new Error("Track O product fallback proof requires the pinned pnpm package manager.");
    }
    const observedPnpmVersion = execFileSync("pnpm", ["--version"], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (observedPnpmVersion !== packageManagerVersion) {
        throw new Error("Installed pnpm does not match the repository packageManager identity.");
    }
    const focusedTestCommand = (testName) => ({
        executable: process.execPath,
        args: [
            "--import",
            "tsx",
            "--import",
            "./src/test-state-root.ts",
            "--test",
            "--test-concurrency=1",
            `--test-name-pattern=^${testName}$`,
            "src/core/handlers.scope.test.ts",
        ],
        cwd: path.join(repoRoot, "packages/mcp"),
    });
    const commands = [
        {
            executable: "pnpm",
            args: ["--filter", "@zokizuan/satori-core", "build"],
            cwd: repoRoot,
        },
        focusedTestCommand(PRODUCT_FALLBACK_TEST_NAME),
        focusedTestCommand(PAGINATION_CONTROL_TEST_NAME),
    ];
    commands.forEach(runCommand);
    const testSourcePath = IMPLEMENTATION_PATHS.productFallbackTest;
    return {
        status: "passed",
        tests: [
            { role: "fallback_result_state", name: PRODUCT_FALLBACK_TEST_NAME },
            { role: "pagination_no_recomputation", name: PAGINATION_CONTROL_TEST_NAME },
        ].map((test) => ({
            ...test,
            source: {
                path: testSourcePath,
                sha256: sha256File(path.join(repoRoot, testSourcePath)),
            },
        })),
        commandIdentity: {
            packageManager,
            nodeVersion: process.versions.node,
            commands: commands.map(({ executable, args, cwd }) => ({
                executable,
                args,
                cwd: path.relative(repoRoot, cwd) || ".",
            })),
        },
    };
}

export function buildO2Evidence({
    sourceIdentity,
    authorityBinding,
    requestBinding,
    worstRequest,
    warmSchedule,
    realMeasurements,
    scenarioMeasurements,
    implementationArtifacts,
    hostIdentity,
    productFallbackProof,
}) {
    const authority = authorityBinding.authority;
    const counts = authority.operationalQualification.observationCounts;
    const observations = {
        processColdReadiness: realMeasurements.processColdReadiness,
        coldFirstScore: realMeasurements.coldFirstScore,
        warmScore: realMeasurements.warmScore,
        ...scenarioMeasurements,
    };
    const { gates, resources } = deriveO2MeasurementOutcome({
        authority,
        requestBinding,
        observations,
        peakRssBytes: realMeasurements.peakRssBytes,
        retainedRssBytes: realMeasurements.retainedRssBytes,
        productFallbackProof,
        implementationArtifacts,
    });
    const passed = Object.values(gates).every(({ passed: gatePassed }) => gatePassed);
    const unsigned = {
        schemaVersion: O2_EVIDENCE_SCHEMA,
        status: passed ? "passed" : "failed",
        result: passed ? "passed" : "failed",
        sourceRevision: sourceIdentity.revision,
        sourceTree: sourceIdentity.tree,
        targetHostIdentitySha256: sha256Canonical(hostIdentity),
        authority: {
            o0AuthoritySha256: authorityBinding.authorityFileSha256,
            manifestFileSha256: authority.heldOutDecision.manifest.fileSha256,
            manifestCanonicalSealSha256: authority.heldOutDecision.manifest.canonicalSealSha256,
        },
        profile: authorityBinding.profileBinding,
        candidate: authorityBinding.candidate,
        tuningRequestSet: {
            ...requestBinding,
            worstRequest: {
                id: worstRequest.id,
                aggregateRetainedTokenCount: worstRequest.aggregateRetainedTokenCount,
                aggregateInputTensorBytes: worstRequest.aggregateInputTensorBytes,
            },
            counterbalancedScheduleSha256: sha256Canonical(warmSchedule.map(({ id }) => id)),
        },
        methodology: {
            observationCounts: counts,
            coldDefinition: authority.operationalQualification.coldDefinition,
            requestSelection: authority.operationalQualification.requestSelection,
            warmSchedule: authority.operationalQualification.warmSchedule,
            percentile: authority.operationalQualification.percentile,
            rssSamplingMilliseconds: authority.operationalQualification.rssSamplingMilliseconds,
            retainedRssCooldownMilliseconds:
                authority.operationalQualification.retainedRssCooldownMilliseconds,
            explicitGarbageCollection: authority.operationalQualification.explicitGarbageCollection,
            selectiveRerunsPermitted: authority.operationalQualification.selectiveRerunsPermitted,
            resultStateProof: {
                candidateMembership:
                    "complete_bounded_permutation_of_every_frozen_request_candidate_identity",
                eligibility:
                    "publication_bound_reconstructed_request_authority_precedes_neural_runtime",
                groupIdentity:
                    "owner_diverse_frozen_candidate_identity_permutation",
                productFallback:
                    "focused_production_search_finalization_regression",
            },
        },
        productFallbackProof,
        observations,
        resources,
        gates,
        implementationArtifacts,
    };
    return { ...unsigned, sha256: sha256Canonical(unsigned) };
}

export function buildO2Receipt({ evidence, evidenceFileBytes, sourceIdentity, authorityBinding, implementationArtifacts }) {
    if (evidence.schemaVersion !== O2_EVIDENCE_SCHEMA || evidence.status !== "passed") {
        throw new Error("A passing O2 receipt requires passing O2 evidence.");
    }
    const receiptArtifacts = Object.fromEntries(
        [
            "projectionSource",
            "runtimeSource",
            "runtimeWorker",
            "measurementScript",
            "scenarioWorker",
            "evidenceDerivation",
            "baselineReplayOwner",
            "productFallbackTest",
        ].map((role) => [
            role,
            implementationArtifacts[role],
        ]),
    );
    const unsigned = {
        version: 1,
        kind: O2_RECEIPT_KIND,
        stage: "O2",
        status: "passed",
        operationalQualificationResult: "passed",
        sourceRevision: sourceIdentity.revision,
        sourceTree: sourceIdentity.tree,
        targetHostIdentitySha256: evidence.targetHostIdentitySha256,
        authority: {
            o0AuthoritySha256: authorityBinding.authorityFileSha256,
            manifestFileSha256: authorityBinding.authority.heldOutDecision.manifest.fileSha256,
            manifestCanonicalSealSha256:
                authorityBinding.authority.heldOutDecision.manifest.canonicalSealSha256,
        },
        profile: authorityBinding.profileBinding,
        candidate: authorityBinding.candidate,
        qualificationEvidence: {
            schemaVersion: O2_EVIDENCE_SCHEMA,
            fileSha256: sha256Bytes(evidenceFileBytes),
            resultSha256: evidence.sha256,
        },
        implementationArtifacts: receiptArtifacts,
    };
    return { ...unsigned, sha256: sha256Canonical(unsigned) };
}

function resolveProductionRuntimeWorker(runtimeWorker) {
    const canonicalWorker = fs.realpathSync(runtimeWorker);
    if (canonicalWorker !== fs.realpathSync(PRODUCTION_RUNTIME_WORKER)) {
        throw new Error("Track O must measure the production LateOn runtime worker build artifact.");
    }
    return canonicalWorker;
}

function implementationArtifactBindings(repoRoot, runtimeWorker) {
    const canonicalRoot = fs.realpathSync(repoRoot);
    const canonicalWorker = resolveProductionRuntimeWorker(runtimeWorker);
    const workerRelative = path.relative(canonicalRoot, canonicalWorker);
    if (workerRelative.startsWith("..") || path.isAbsolute(workerRelative)) {
        throw new Error("The measured LateOn runtime worker must be inside the source repository.");
    }
    const bindings = Object.fromEntries(Object.entries(IMPLEMENTATION_PATHS).map(([role, relativePath]) => [
        role,
        { path: relativePath, sha256: sha256File(path.join(repoRoot, relativePath)) },
    ]));
    bindings.runtimeWorker = {
        path: workerRelative.split(path.sep).join("/"),
        sha256: sha256File(canonicalWorker),
    };
    return bindings;
}

function resolvePackageVersion(packageName) {
    let current = path.dirname(MCP_REQUIRE.resolve(packageName));
    while (current !== path.dirname(current)) {
        const packageFile = path.join(current, "package.json");
        if (fs.existsSync(packageFile)) {
            const parsed = JSON.parse(fs.readFileSync(packageFile, "utf8"));
            if (parsed.name === packageName && typeof parsed.version === "string") {
                return parsed.version;
            }
        }
        current = path.dirname(current);
    }
    throw new Error(`Cannot resolve ${packageName} package version.`);
}

export function observeTargetHost(authorityTargetHost) {
    const cpuModel = os.cpus()[0]?.model.trim();
    const physicalPairs = new Set();
    const cpuInfo = fs.readFileSync("/proc/cpuinfo", "utf8").split("\n\n");
    for (const block of cpuInfo) {
        const physical = /^physical id\s*:\s*(\d+)$/m.exec(block)?.[1];
        const core = /^core id\s*:\s*(\d+)$/m.exec(block)?.[1];
        if (physical !== undefined && core !== undefined) physicalPairs.add(`${physical}:${core}`);
    }
    const windowsOutput = execFileSync("/mnt/c/Windows/System32/cmd.exe", ["/c", "ver"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
    });
    const wslOutput = execFileSync("/mnt/c/Windows/System32/wsl.exe", ["--version"], {
        encoding: "utf16le",
        stdio: ["ignore", "pipe", "ignore"],
    }).replaceAll("\r", "");
    const requiredVersion = (pattern, label, source) => {
        const value = pattern.exec(source)?.[1];
        if (!value) throw new Error(`Cannot observe ${label}.`);
        return value;
    };
    const observed = {
        cpu: cpuModel,
        physicalCores: physicalPairs.size,
        logicalCores: os.cpus().length,
        ramBytes: os.totalmem(),
        windowsVersion: requiredVersion(/Version\s+([^\]]+)/, "Windows version", windowsOutput),
        wslVersion: requiredVersion(/^WSL version:\s*(\S+)/m, "WSL version", wslOutput),
        wslKernel: requiredVersion(/^Kernel version:\s*(\S+)/m, "WSL kernel", wslOutput),
        node: process.versions.node,
        python: requiredVersion(
            /^Python\s+(\S+)/,
            "Python version",
            execFileSync("python3", ["--version"], { encoding: "utf8" }),
        ),
        onnxruntimeNode: resolvePackageVersion("onnxruntime-node"),
        transformersJs: resolvePackageVersion("@huggingface/transformers"),
        powerMode: "not_observable_from_wsl_not_decision_bearing",
    };
    requireEqual(observed, authorityTargetHost, "Track O target host");
    return observed;
}

async function loadTokenizer(modelRoot) {
    const imported = await import(pathToFileURL(
        MCP_REQUIRE.resolve("@huggingface/transformers"),
    ).href);
    const transformers = imported.default ?? imported;
    transformers.env.allowRemoteModels = false;
    transformers.env.allowLocalModels = true;
    transformers.env.localModelPath = `${path.dirname(modelRoot)}${path.sep}`;
    const tokenizer = await transformers.AutoTokenizer.from_pretrained(path.basename(modelRoot));
    tokenizer.truncation_side = "right";
    return tokenizer;
}

function parseArguments(argv) {
    const options = {};
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith("--") || value === undefined) {
            throw new Error("Arguments must use --name value pairs.");
        }
        options[key.slice(2)] = key === "--o0-authority-sha256"
            ? value
            : path.resolve(value);
    }
    for (const key of [
        "o0-authority", "o0-authority-sha256", "profile", "model-root", "capture-root", "source-root-parent",
        "worker", "evidence-output", "receipt-output",
    ]) {
        if (!options[key]) throw new Error(`Missing --${key}.`);
    }
    return options;
}

function assertOutputOutsideRepository(file, repoRoot) {
    const relative = path.relative(repoRoot, path.resolve(file));
    if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
        throw new Error("O2 outputs must be outside the clean source repository.");
    }
}

export async function main(argv = process.argv.slice(2)) {
    const options = parseArguments(argv);
    const sourceIdentity = resolveCleanGitIdentity(REPOSITORY_ROOT);
    assertOutputOutsideRepository(options["evidence-output"], REPOSITORY_ROOT);
    assertOutputOutsideRepository(options["receipt-output"], REPOSITORY_ROOT);
    const authorityBinding = validateTrackOAuthority({
        authorityFile: options["o0-authority"],
        expectedAuthorityFileSha256: options["o0-authority-sha256"],
        profileFile: options.profile,
        modelRoot: options["model-root"],
    });
    const hostIdentity = observeTargetHost(authorityBinding.authority.targetHost);
    const productFallbackProof = runProductFallbackProof({ repoRoot: REPOSITORY_ROOT });
    const reconstructed = await reconstructTrackOTuningRequests({
        captureRoot: options["capture-root"],
        sourceRootParent: options["source-root-parent"],
        authority: authorityBinding.authority,
    });
    const tokenizer = await loadTokenizer(options["model-root"]);
    const qualityRequests = await annotateRequestTokenMetrics(
        reconstructed.eligibleNeuralRequests,
        tokenizer,
        authorityBinding.profile,
    );
    const worstRequest = selectWorstTrackORequest(qualityRequests);
    const counts = authorityBinding.authority.operationalQualification.observationCounts;
    const runtimeWorker = resolveProductionRuntimeWorker(options.worker);
    const runtimeFactory = () => new LateOnReranker({
        modelDirectory: options["model-root"],
        profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
        workerPath: runtimeWorker,
    });
    const realMeasurements = await measureRealModelOperations({
        runtimeFactory,
        qualityRequests,
        worstRequest,
        observationCounts: counts,
        rssSamplingMilliseconds:
            authorityBinding.authority.operationalQualification.rssSamplingMilliseconds,
        retainedRssCooldownMilliseconds:
            authorityBinding.authority.operationalQualification.retainedRssCooldownMilliseconds,
    });
    const scenarioWorker = path.join(REPOSITORY_ROOT, IMPLEMENTATION_PATHS.scenarioWorker);
    const scenarioMeasurements = await runFailureScenarios({
        runtimeFactory: () => new LateOnReranker({
            modelDirectory: options["model-root"],
            profileId: LATEON_RUNTIME_PROFILE_IDS.offlineQualityD32,
            workerPath: scenarioWorker,
        }),
        request: worstRequest,
        counts,
    });
    const warmSchedule = buildCounterbalancedWarmSchedule(qualityRequests, counts.warmRequests);
    const implementationArtifacts = implementationArtifactBindings(
        REPOSITORY_ROOT,
        runtimeWorker,
    );
    const evidence = buildO2Evidence({
        sourceIdentity,
        authorityBinding,
        requestBinding: reconstructed.binding,
        worstRequest,
        warmSchedule,
        realMeasurements,
        scenarioMeasurements,
        implementationArtifacts,
        hostIdentity,
        productFallbackProof,
    });
    const evidenceBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    fs.writeFileSync(options["evidence-output"], evidenceBytes, { flag: "wx" });
    if (evidence.status !== "passed") {
        process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
        process.exitCode = 1;
        return evidence;
    }
    const receipt = buildO2Receipt({
        evidence,
        evidenceFileBytes: evidenceBytes,
        sourceIdentity,
        authorityBinding,
        implementationArtifacts,
    });
    fs.writeFileSync(options["receipt-output"], `${JSON.stringify(receipt, null, 2)}\n`, {
        flag: "wx",
    });
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        await main();
    } catch (error) {
        process.stderr.write(`satori-lateon-track-o-o2: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
