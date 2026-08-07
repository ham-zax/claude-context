import crypto from "node:crypto";
import path from "node:path";
import type {
    SymbolRecord,
    SymbolRegistry,
} from "@zokizuan/satori-core";
import { readCurrentSourceEvidence } from "./current-source-symbols.js";
import { resolveSearchCandidateRole } from "./search-candidate-role.js";
import type { SearchCandidateRole } from "./search-rerank-context.js";
import type { SearchResultLike } from "./search-lexical-scoring.js";
import {
    buildSearchRerankDocumentV2,
    SEARCH_RERANK_DOCUMENT_V2_POLICY,
} from "./search-rerank-document-v2.js";
import {
    buildSearchRerankDocumentV3,
    SEARCH_RERANK_DOCUMENT_V3_POLICY,
} from "./search-rerank-document-v3.js";
import type {
    SearchRerankProjectionFailureReason,
    SearchRerankProjectionResult,
} from "./search-rerank-projection-result.js";

type CurrentSourceEvidenceReader = typeof readCurrentSourceEvidence;

export function searchRerankCandidateId(result: SearchResultLike): string {
    return [
        result.relativePath,
        result.startLine ?? 0,
        result.endLine ?? 0,
    ].join(":");
}

function resolveCanonicalOwner(
    result: SearchResultLike,
    registry: SymbolRegistry,
): SymbolRecord | undefined {
    const instanceId = typeof result.ownerSymbolInstanceId === "string"
        ? result.ownerSymbolInstanceId.trim()
        : "";
    if (instanceId) return registry.symbolsByInstanceId.get(instanceId);

    const symbolKey = typeof result.ownerSymbolKey === "string"
        ? result.ownerSymbolKey.trim()
        : "";
    if (!symbolKey) return undefined;
    const matches = (registry.symbolsByKey.get(symbolKey) ?? []).filter(
        (symbol) => symbol.file === result.relativePath,
    );
    return matches.length === 1 ? matches[0] : undefined;
}

function failure(
    candidateId: string,
    reason: SearchRerankProjectionFailureReason,
): SearchRerankProjectionResult {
    return { ok: false, candidateId, reason };
}

/**
 * Project the frozen projection-v2 bytes only from a registry-owned candidate and
 * hash-matched current source. The candidate span is retained because it is part
 * of the qualified L3 projection, but it must remain inside the canonical owner.
 */
async function resolvePublicationBoundEvidence(input: {
    codebaseRoot: string;
    result: SearchResultLike;
    registry: SymbolRegistry;
    readSourceEvidence?: CurrentSourceEvidenceReader;
}): Promise<
    | { ok: true; evidence: NonNullable<Awaited<ReturnType<CurrentSourceEvidenceReader>>> }
    | { ok: false; reason: SearchRerankProjectionFailureReason }
> {
    const owner = resolveCanonicalOwner(input.result, input.registry);
    const startLine = input.result.startLine;
    const endLine = input.result.endLine;
    if (
        !owner
        || owner.file !== input.result.relativePath
        || !/^[a-f0-9]{64}$/.test(owner.fileHash)
    ) {
        return { ok: false, reason: "owner_not_found" };
    }
    if (
        !Number.isSafeInteger(startLine)
        || !Number.isSafeInteger(endLine)
        || (startLine as number) < owner.span.startLine
        || (endLine as number) > owner.span.endLine
        || (endLine as number) < (startLine as number)
    ) {
        return { ok: false, reason: "candidate_span_invalid" };
    }

    let evidence;
    try {
        evidence = await (input.readSourceEvidence ?? readCurrentSourceEvidence)(
            input.codebaseRoot,
            owner.file,
        );
    } catch {
        return { ok: false, reason: "source_unavailable" };
    }
    if (!evidence) {
        return { ok: false, reason: "source_unavailable" };
    }
    if (
        evidence.relativeFile !== owner.file
        || evidence.observedHash !== owner.fileHash
    ) {
        return { ok: false, reason: "source_hash_mismatch" };
    }
    return { ok: true, evidence };
}

function success(
    document: string,
    candidateRole: SearchCandidateRole,
    projectionIdentity: string,
): SearchRerankProjectionResult {
    return {
        ok: true,
        document,
        utf8Bytes: Buffer.byteLength(document, "utf8"),
        sha256: crypto.createHash("sha256").update(document, "utf8").digest("hex"),
        candidateRole,
        projectionIdentity,
    };
}

export async function projectPublicationBoundSearchRerankDocumentV2(input: {
    candidateId: string;
    codebaseRoot: string;
    semanticQuery: string;
    result: SearchResultLike;
    registry: SymbolRegistry;
    readSourceEvidence?: CurrentSourceEvidenceReader;
}): Promise<SearchRerankProjectionResult> {
    const { candidateId } = input;
    const resolved = await resolvePublicationBoundEvidence(input);
    if (!resolved.ok) return failure(candidateId, resolved.reason);

    let document: string;
    try {
        document = buildSearchRerankDocumentV2({
            relativePath: input.result.relativePath,
            language: input.result.language,
            symbolKind: input.result.symbolKind ?? "file",
            canonicalSymbolLabel:
                input.result.symbolLabel ?? path.posix.basename(input.result.relativePath),
            content: resolved.evidence.source,
            symbolSpan: {
                startLine: input.result.startLine as number,
                endLine: input.result.endLine as number,
            },
            query: input.semanticQuery,
        }).text;
    } catch {
        return failure(candidateId, "projection_contract_failed");
    }
    return success(document, "unknown", SEARCH_RERANK_DOCUMENT_V2_POLICY.id);
}

export async function projectPublicationBoundSearchRerankDocumentV3(input: {
    candidateId: string;
    codebaseRoot: string;
    semanticQuery: string;
    result: SearchResultLike;
    registry: SymbolRegistry;
    readSourceEvidence?: CurrentSourceEvidenceReader;
}): Promise<SearchRerankProjectionResult> {
    const { candidateId } = input;
    const resolved = await resolvePublicationBoundEvidence(input);
    if (!resolved.ok) return failure(candidateId, resolved.reason);

    const candidateRole = resolveSearchCandidateRole({
        relativePath: input.result.relativePath,
        ...(typeof input.result.language === "string"
            ? { language: input.result.language }
            : {}),
        ...(typeof input.result.symbolKind === "string"
            ? { symbolKind: input.result.symbolKind }
            : {}),
    });
    let document: string;
    try {
        document = buildSearchRerankDocumentV3({
            relativePath: input.result.relativePath,
            language: input.result.language,
            candidateRole,
            symbolKind: input.result.symbolKind ?? "file",
            canonicalSymbolLabel:
                input.result.symbolLabel ?? path.posix.basename(input.result.relativePath),
            content: resolved.evidence.source,
            symbolSpan: {
                startLine: input.result.startLine as number,
                endLine: input.result.endLine as number,
            },
            query: input.semanticQuery,
        }).text;
    } catch {
        return failure(candidateId, "projection_contract_failed");
    }
    return success(document, candidateRole, SEARCH_RERANK_DOCUMENT_V3_POLICY.id);
}

export async function buildPublicationBoundSearchRerankDocumentV2(input: {
    codebaseRoot: string;
    semanticQuery: string;
    result: SearchResultLike;
    registry: SymbolRegistry;
    readSourceEvidence?: CurrentSourceEvidenceReader;
}): Promise<string | undefined> {
    const result = await projectPublicationBoundSearchRerankDocumentV2({
        ...input,
        candidateId: searchRerankCandidateId(input.result),
    });
    return result.ok ? result.document : undefined;
}
