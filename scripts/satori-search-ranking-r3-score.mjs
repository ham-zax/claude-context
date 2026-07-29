#!/usr/bin/env -S node --import tsx
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createLanguageAnalysisService } from "../packages/core/src/language-analysis/service.ts";
import { buildIndexedChunkId } from "../packages/core/src/core/indexed-chunk-identity.ts";
import {
    SEARCH_RERANK_DOCUMENT_PROJECTION_VERSION,
    buildSearchRerankDocument,
} from "../packages/mcp/src/core/search-rerank-document.ts";
import { buildRerankCandidatePool } from "../packages/mcp/src/core/search-rerank-policy.ts";
import { replayBaselineCandidateCapture } from "./satori-search-candidate-replay.mjs";
import { createLateOnRuntime } from "./satori-lateon-c0-native.mjs";
import { canonicalJson } from "./satori-useful-context.mjs";

const RESULT_SCHEMA = "satori_search_ranking_r3_scores_v1";

function parseArguments(argv) {
    const values = new Map();
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith("--") || value === undefined) {
            throw new Error("Arguments must use --name value pairs.");
        }
        values.set(key.slice(2), value);
    }
    const required = [
        "contract",
        "model-directory",
        "transformers-module",
        "onnxruntime-module",
        "source-root",
        "positive-capture",
        "negative-capture",
        "depth",
        "output",
    ];
    for (const key of required) {
        if (!values.has(key)) throw new Error(`Missing --${key}.`);
    }
    const depth = Number(values.get("depth"));
    if (![16, 32].includes(depth)) throw new Error("--depth must be 16 or 32.");
    return { ...Object.fromEntries(values), depth };
}

function sha256Bytes(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function sha256File(filePath) {
    return sha256Bytes(fs.readFileSync(filePath));
}

function sha256Canonical(value) {
    return sha256Bytes(Buffer.from(canonicalJson(value), "utf8"));
}

function compareContractStrings(left, right) {
    if (left === right) return 0;
    return left < right ? -1 : 1;
}

function requireRecord(value, label) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${label} must be an object.`);
    }
    return value;
}

function requireString(value, label) {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`${label} must be a non-empty string.`);
    }
    return value;
}

function loadCapture(filePath) {
    const bytes = fs.readFileSync(filePath);
    const capture = JSON.parse(bytes.toString("utf8"));
    const replay = replayBaselineCandidateCapture(capture, {
        requireNeuralDisabled: true,
        requireGroupingReady: true,
    });
    return {
        capture,
        fileName: path.basename(filePath),
        fileSha256: sha256Bytes(bytes),
        replaySha256: replay.sha256,
    };
}

function verifyCapturePair(positive, negative) {
    const fields = [
        ["gitRevision", positive.capture.authority.gitRevision, negative.capture.authority.gitRevision],
        [
            "publication",
            canonicalJson(positive.capture.authority.armPublication),
            canonicalJson(negative.capture.authority.armPublication),
        ],
        ["runtimeSha256", positive.capture.authority.runtimeSha256, negative.capture.authority.runtimeSha256],
    ];
    for (const [label, left, right] of fields) {
        if (left !== right) throw new Error(`Capture pair ${label} mismatch.`);
    }
}

function verifySourceRoot(sourceRoot, revision) {
    const absoluteRoot = path.resolve(sourceRoot);
    const actualRevision = execFileSync("git", ["-C", absoluteRoot, "rev-parse", "HEAD"], {
        encoding: "utf8",
    }).trim();
    if (actualRevision !== revision) {
        throw new Error(`Source revision mismatch (${actualRevision} != ${revision}).`);
    }
    const status = execFileSync("git", ["-C", absoluteRoot, "status", "--porcelain=v1"], {
        encoding: "utf8",
    });
    if (status.length !== 0) throw new Error("Pinned source worktree must be clean.");
    const tree = execFileSync("git", ["-C", absoluteRoot, "rev-parse", "HEAD^{tree}"], {
        encoding: "utf8",
    }).trim();
    return { absoluteRoot, revision: actualRevision, tree };
}

function finalFilteredStage(taskCapture) {
    const stages = taskCapture.candidateTrace.stages.filter(
        (stage) => stage.stage === "mcp_filtered",
    );
    if (stages.length === 0) {
        throw new Error(`Task '${taskCapture.taskId}' has no filtered candidate stage.`);
    }
    return stages.at(-1);
}

function replaySignalsForAttempt(taskCapture, attemptId) {
    const prefix = `${attemptId}/replay:`;
    const signals = new Map();
    for (const stage of taskCapture.candidateTrace.stages) {
        if (
            stage.stage !== "mcp_replay_signals"
            || (stage.passId !== attemptId && !stage.passId?.startsWith(prefix))
        ) {
            continue;
        }
        for (const candidate of stage.candidates) {
            if (signals.has(candidate.candidateId)) {
                throw new Error(
                    `Task '${taskCapture.taskId}' has duplicate replay signal '${candidate.candidateId}'.`,
                );
            }
            signals.set(candidate.candidateId, candidate);
        }
    }
    return signals;
}

function ownerResultFields(ownerId, label) {
    let parsed;
    try {
        parsed = JSON.parse(ownerId);
    } catch {
        throw new Error(`${label} ownerId is not JSON.`);
    }
    if (parsed?.[0] === "symbol" && parsed.length === 3) {
        return { ownerSymbolInstanceId: requireString(parsed[2], `${label} owner symbol`) };
    }
    if (parsed?.[0] === "file" && parsed.length === 2) return {};
    throw new Error(`${label} ownerId has an unsupported shape.`);
}

function selectTaskCandidates(taskCapture, depth) {
    const filtered = finalFilteredStage(taskCapture);
    const signals = replaySignalsForAttempt(taskCapture, filtered.passId);
    const candidates = filtered.candidates.map((candidate) => {
        const signal = signals.get(candidate.candidateId);
        if (!signal) {
            throw new Error(
                `Task '${taskCapture.taskId}' candidate '${candidate.candidateId}' has no replay signal.`,
            );
        }
        return {
            candidateId: candidate.candidateId,
            result: {
                relativePath: candidate.relativePath,
                startLine: candidate.startLine,
                endLine: candidate.endLine,
                language: candidate.language,
                symbolLabel: signal.replay?.symbolLabel ?? undefined,
                ...ownerResultFields(
                    candidate.ownerId,
                    `Task '${taskCapture.taskId}' candidate '${candidate.candidateId}'`,
                ),
            },
            capturedDocumentUtf8Bytes: signal.replay?.rerankDocumentUtf8Bytes,
        };
    });
    const pool = buildRerankCandidatePool(candidates);
    return {
        candidates: pool.candidates.slice(0, depth),
        familyCount: pool.familyCount,
        supplementalCandidateCount: pool.supplementalCandidateCount,
        candidatePoolCount: pool.candidates.length,
    };
}

async function reconstructDocuments(sourceRoot, selectedCandidates, analysisService) {
    const candidatesByFile = new Map();
    for (const candidate of selectedCandidates) {
        const existing = candidatesByFile.get(candidate.result.relativePath) ?? [];
        existing.push(candidate);
        candidatesByFile.set(candidate.result.relativePath, existing);
    }
    const documents = new Map();
    for (const [relativePath, candidates] of candidatesByFile) {
        if (
            relativePath.startsWith("/")
            || relativePath.split(/[\\/]/).includes("..")
        ) {
            throw new Error(`Unsafe captured relative path '${relativePath}'.`);
        }
        const absolutePath = path.join(sourceRoot, relativePath);
        const content = fs.readFileSync(absolutePath, "utf8");
        const languages = new Set(candidates.map((candidate) => candidate.result.language));
        if (languages.size !== 1) {
            throw new Error(`Captured file '${relativePath}' has inconsistent languages.`);
        }
        const language = [...languages][0];
        const analysis = await analysisService.analyze({ content, relativePath, language });
        const chunksById = new Map();
        analysis.chunks.forEach((chunk, index) => {
            const candidateId = buildIndexedChunkId(relativePath, chunk, index);
            if (chunksById.has(candidateId)) {
                throw new Error(`Source analysis emitted duplicate chunk '${candidateId}'.`);
            }
            chunksById.set(candidateId, chunk);
        });
        for (const candidate of candidates) {
            const chunk = chunksById.get(candidate.candidateId);
            if (!chunk) {
                throw new Error(
                    `Captured chunk '${candidate.candidateId}' was not reconstructed from '${relativePath}'.`,
                );
            }
            const result = {
                relativePath,
                language,
                content: chunk.content,
                symbolLabel: chunk.metadata.symbolLabel ?? candidate.result.symbolLabel,
            };
            const document = buildSearchRerankDocument(result);
            const utf8Bytes = Buffer.byteLength(document, "utf8");
            if (utf8Bytes !== candidate.capturedDocumentUtf8Bytes) {
                throw new Error(
                    `Projection byte mismatch for '${candidate.candidateId}' `
                    + `(${utf8Bytes} != ${candidate.capturedDocumentUtf8Bytes}).`,
                );
            }
            documents.set(candidate.candidateId, {
                text: document,
                sha256: sha256Bytes(Buffer.from(document, "utf8")),
                utf8Bytes,
            });
        }
    }
    return documents;
}

export function resolveLateOnScoreOutcome({
    elapsedMilliseconds,
    timeoutMilliseconds,
    selectedCandidates,
    scores,
}) {
    const diagnosticRanking = selectedCandidates.map((candidate, index) => ({
        candidateId: candidate.candidateId,
        score: scores[index],
    })).sort((left, right) => (
        right.score - left.score
        || compareContractStrings(left.candidateId, right.candidateId)
    ));
    if (elapsedMilliseconds > timeoutMilliseconds) {
        return {
            status: "deadline_exceeded",
            policyAffected: false,
            fallbackBaselineRequired: true,
            ranking: [],
            diagnosticRanking,
        };
    }
    return {
        status: "scored",
        policyAffected: true,
        fallbackBaselineRequired: false,
        ranking: diagnosticRanking,
        diagnosticRanking,
    };
}

async function scoreTask({
    taskCapture,
    depth,
    sourceRoot,
    analysisService,
    lateOnRuntime,
    timeoutMilliseconds,
}) {
    if (taskCapture.readiness?.route === "exact_registry") {
        return {
            taskId: taskCapture.taskId,
            split: taskCapture.split,
            queryClass: taskCapture.queryClass,
            route: "exact_registry",
            policyAffected: false,
            selectedCandidateIds: [],
            ranking: [],
            projections: [],
            elapsedMilliseconds: 0,
        };
    }
    const selected = selectTaskCandidates(taskCapture, depth);
    const documents = await reconstructDocuments(
        sourceRoot,
        selected.candidates,
        analysisService,
    );
    const query = requireString(
        taskCapture.queryPlan?.queryIntent?.semanticQuery,
        `Task '${taskCapture.taskId}' semantic query`,
    );
    const documentTexts = selected.candidates.map(
        (candidate) => documents.get(candidate.candidateId).text,
    );
    const started = performance.now();
    const scored = await lateOnRuntime.score(query, documentTexts);
    const elapsedMilliseconds = performance.now() - started;
    const outcome = resolveLateOnScoreOutcome({
        elapsedMilliseconds,
        timeoutMilliseconds,
        selectedCandidates: selected.candidates,
        scores: scored.scores,
    });
    return {
        taskId: taskCapture.taskId,
        split: taskCapture.split,
        queryClass: taskCapture.queryClass,
        route: "fusion",
        ...outcome,
        candidateDepth: depth,
        familyCount: selected.familyCount,
        supplementalCandidateCount: selected.supplementalCandidateCount,
        candidatePoolCount: selected.candidatePoolCount,
        selectedCandidateIds: selected.candidates.map(({ candidateId }) => candidateId),
        projections: selected.candidates.map((candidate) => {
            const projection = documents.get(candidate.candidateId);
            return {
                candidateId: candidate.candidateId,
                sha256: projection.sha256,
                utf8Bytes: projection.utf8Bytes,
            };
        }),
        queryEncoding: {
            retainedTokenCount: scored.query.vectors.length,
            inputIdSha256: sha256Canonical(scored.query.inputIds),
        },
        documentEncodings: selected.candidates.map((candidate, index) => ({
            candidateId: candidate.candidateId,
            retainedTokenCount: scored.documents[index].vectors.length,
            inputIdSha256: sha256Canonical(scored.documents[index].inputIds),
        })),
        elapsedMilliseconds,
    };
}

async function run() {
    const arguments_ = parseArguments(process.argv.slice(2));
    const contractBytes = fs.readFileSync(arguments_.contract);
    const contract = JSON.parse(contractBytes.toString("utf8"));
    if (contract.r3Projection?.version !== SEARCH_RERANK_DOCUMENT_PROJECTION_VERSION) {
        throw new Error("C0 document projection is incompatible with production.");
    }
    const positive = loadCapture(arguments_["positive-capture"]);
    const negative = loadCapture(arguments_["negative-capture"]);
    verifyCapturePair(positive, negative);
    const source = verifySourceRoot(
        arguments_["source-root"],
        positive.capture.authority.gitRevision,
    );
    const lateOnRuntime = await createLateOnRuntime({
        contract,
        modelDirectory: path.resolve(arguments_["model-directory"]),
        transformersModule: arguments_["transformers-module"],
        onnxruntimeModule: arguments_["onnxruntime-module"],
    });
    const analysisService = createLanguageAnalysisService();
    const taskCaptures = [...positive.capture.captures, ...negative.capture.captures];
    const tasks = [];
    try {
        for (const taskCapture of taskCaptures) {
            const task = await scoreTask({
                taskCapture,
                depth: arguments_.depth,
                sourceRoot: source.absoluteRoot,
                analysisService,
                lateOnRuntime,
                timeoutMilliseconds: contract.inference.timeoutMilliseconds,
            });
            tasks.push(task);
        }
    } finally {
        await lateOnRuntime.dispose();
    }
    const fusionTimings = tasks
        .filter((task) => task.route === "fusion")
        .map((task) => task.elapsedMilliseconds);
    const processPeakRssBytes = process.resourceUsage().maxRSS * 1024;
    const rejectionReasons = [
        ...(tasks.some((task) => task.status === "deadline_exceeded")
            ? ["query_deadline_exceeded"]
            : []),
        ...(fusionTimings[0] > contract.resourceBudgets.maximumColdD16Milliseconds
            ? ["cold_latency_budget_exceeded"]
            : []),
        ...(processPeakRssBytes > contract.resourceBudgets.maximumProcessPeakRssBytes
            ? ["peak_rss_budget_exceeded"]
            : []),
    ];
    const result = {
        schemaVersion: RESULT_SCHEMA,
        contenderId: `D-L${arguments_.depth}`,
        candidateDepth: arguments_.depth,
        contract: {
            sha256: sha256Bytes(contractBytes),
            checkpoint: contract.checkpoint,
            projectionVersion: contract.r3Projection.version,
        },
        modelRuntime: lateOnRuntime.identity,
        modelLoadResources: lateOnRuntime.loadResources,
        source,
        captures: [positive, negative].map((capture) => ({
            fileName: capture.fileName,
            fileSha256: capture.fileSha256,
            captureSha256: capture.capture.sha256,
            baselineReplaySha256: capture.replaySha256,
        })),
        authority: positive.capture.authority,
        tasks,
        resources: {
            processPeakRssBytes,
            coldFirstFusionTaskMilliseconds: fusionTimings[0] ?? 0,
            warmFusionTaskMilliseconds: fusionTimings.slice(1),
        },
        qualification: {
            passed: rejectionReasons.length === 0,
            rejectionReasons,
            allOrNothingFallbackPreserved: tasks
                .filter((task) => task.status === "deadline_exceeded")
                .every((task) => task.ranking.length === 0 && task.policyAffected === false),
        },
    };
    const signed = { ...result, sha256: sha256Canonical(result) };
    fs.writeFileSync(arguments_.output, `${JSON.stringify(signed, null, 2)}\n`, "utf8");
}

const isDirectExecution = process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
    run().catch((error) => {
        console.error(error instanceof Error ? error.stack : String(error));
        process.exitCode = 1;
    });
}
