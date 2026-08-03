import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createLanguageAnalysisService } from "../packages/core/src/language-analysis/service.ts";
import { buildIndexedChunkId } from "../packages/core/src/core/indexed-chunk-identity.ts";
import { buildSearchRerankDocumentV2 } from "../packages/mcp/src/core/search-rerank-document-v2.ts";
import { buildRerankCandidatePool } from "../packages/mcp/src/core/search-rerank-policy.ts";

function requireString(value, label) {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`${label} must be a non-empty string.`);
    }
    return value;
}

function sha256Bytes(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function finalFilteredStage(taskCapture) {
    const stages = taskCapture.candidateTrace?.stages?.filter(
        (stage) => stage.stage === "mcp_filtered",
    ) ?? [];
    if (stages.length === 0) {
        throw new Error(`Task '${taskCapture.taskId}' has no filtered candidate stage.`);
    }
    return stages.at(-1);
}

function replaySignalsForAttempt(taskCapture, attemptId) {
    const prefix = `${attemptId}/replay:`;
    const signals = new Map();
    for (const stage of taskCapture.candidateTrace.stages) {
        if (stage.stage !== "mcp_replay_signals"
            || (stage.passId !== attemptId && !stage.passId?.startsWith(prefix))) {
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

function selectCapturedCandidates(taskCapture, candidateDepth) {
    if (!Number.isSafeInteger(candidateDepth) || candidateDepth < 1) {
        throw new Error("Captured rerank candidate depth must be a positive safe integer.");
    }
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
        };
    });
    const pool = buildRerankCandidatePool(candidates);
    return {
        candidates: pool.candidates.slice(0, candidateDepth),
        familyCount: pool.familyCount,
        supplementalCandidateCount: pool.supplementalCandidateCount,
        candidatePoolCount: pool.candidates.length,
    };
}

function safeSourcePath(sourceRoot, relativePath) {
    const normalized = requireString(relativePath, "Captured candidate relative path");
    if (path.isAbsolute(normalized) || normalized.split(/[\\/]/).includes("..")) {
        throw new Error(`Unsafe captured relative path '${normalized}'.`);
    }
    return path.join(sourceRoot, normalized);
}

async function reconstructProjections(sourceRoot, selectedCandidates, query, analysisService) {
    const candidatesByFile = new Map();
    for (const candidate of selectedCandidates) {
        const existing = candidatesByFile.get(candidate.result.relativePath) ?? [];
        candidatesByFile.set(candidate.result.relativePath, [...existing, candidate]);
    }
    const projections = new Map();
    for (const [relativePath, candidates] of candidatesByFile) {
        const content = fs.readFileSync(safeSourcePath(sourceRoot, relativePath), "utf8");
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
            if (candidate.result.startLine !== chunk.metadata.startLine
                || candidate.result.endLine !== chunk.metadata.endLine) {
                throw new Error(`Captured span mismatch for '${candidate.candidateId}'.`);
            }
            const projection = buildSearchRerankDocumentV2({
                relativePath,
                language,
                symbolKind: chunk.metadata.symbolKind ?? "file",
                canonicalSymbolLabel:
                    chunk.metadata.symbolLabel
                    ?? candidate.result.symbolLabel
                    ?? path.basename(relativePath),
                content,
                symbolSpan: {
                    startLine: candidate.result.startLine,
                    endLine: candidate.result.endLine,
                },
                query,
            });
            projections.set(candidate.candidateId, {
                candidateId: candidate.candidateId,
                text: projection.text,
                evidence: {
                    candidateId: candidate.candidateId,
                    sha256: sha256Bytes(Buffer.from(projection.text, "utf8")),
                    utf8Bytes: projection.utf8Bytes,
                    version: projection.version,
                    selectedSourceLineCount: projection.selectedSourceLineCount,
                    selectedSourceExcerptCount: projection.selectedSourceExcerptCount,
                    sourceTruncated: projection.sourceTruncated,
                    selectionAttemptCount: projection.selectionAttemptCount,
                },
            });
        }
    }
    return projections;
}

export async function buildCapturedRerankProjectionV2({
    taskCapture,
    candidateDepth,
    sourceRoot,
    analysisService = createLanguageAnalysisService(),
}) {
    const query = requireString(
        taskCapture.queryPlan?.queryIntent?.semanticQuery,
        `Task '${taskCapture.taskId}' semantic query`,
    );
    const selected = selectCapturedCandidates(taskCapture, candidateDepth);
    const projections = await reconstructProjections(
        sourceRoot,
        selected.candidates,
        query,
        analysisService,
    );
    return {
        query,
        candidateDepth,
        familyCount: selected.familyCount,
        supplementalCandidateCount: selected.supplementalCandidateCount,
        candidatePoolCount: selected.candidatePoolCount,
        selectedCandidateIds: selected.candidates.map(({ candidateId }) => candidateId),
        documents: selected.candidates.map(({ candidateId }) => projections.get(candidateId).text),
        projections: selected.candidates.map(({ candidateId }) => (
            projections.get(candidateId).evidence
        )),
    };
}
