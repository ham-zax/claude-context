import { serializeCanonicalJson } from "./canonical-json.js";
import type { SearchCandidateRole } from "./search-rerank-context.js";
import {
    SEARCH_RERANK_DOCUMENT_V2_POLICY,
    isRecord,
    firstStructuralDeclaration,
    normalizeEvidenceSpans,
    normalizeRequiredOwnerSiblings,
    requireBoundedDocumentation,
    requireBoundedPhysicalLine,
    requireLineSpan,
    requireSafeRelativePath,
    requireString,
    selectRerankSourceWithinBudget,
    sourceLines,
    sourceLinesInSpan,
    type NormalizedProjectionInput,
    type SearchRerankDocumentV2Sibling,
} from "./search-rerank-document-v2.js";
import type { SourceLineSpan } from "./bounded-source-selector.js";

export const SEARCH_RERANK_DOCUMENT_V3_POLICY = Object.freeze({
    id: "search_rerank_document_v3",
    previousVersion: SEARCH_RERANK_DOCUMENT_V2_POLICY.id,
    maximumUtf8Bytes: SEARCH_RERANK_DOCUMENT_V2_POLICY.maximumUtf8Bytes,
    serialization: "canonical_json_utf8",
    serializedKeyOrder: SEARCH_RERANK_DOCUMENT_V2_POLICY.serializedKeyOrder,
    addedField: "candidate_role",
});

export interface SearchRerankDocumentV3Input {
    readonly relativePath: string;
    readonly language: string;
    readonly candidateRole: SearchCandidateRole;
    readonly symbolKind: string;
    readonly canonicalSymbolLabel: string;
    readonly symbolSpan: SourceLineSpan;
    readonly content: string;
    readonly signatureOrDeclaration?: string;
    readonly documentationExcerpt?: string;
    readonly query?: string;
    readonly evidenceSpans?: readonly SourceLineSpan[];
    readonly requiredOwnerSiblings?: readonly SearchRerankDocumentV2Sibling[];
}

export interface SearchRerankDocumentV3Result {
    readonly version: typeof SEARCH_RERANK_DOCUMENT_V3_POLICY.id;
    readonly text: string;
    readonly utf8Bytes: number;
    readonly selectedSourceLineCount: number;
    readonly selectedSourceExcerptCount: number;
    readonly sourceTruncated: boolean;
    readonly selectionAttemptCount: number;
}

interface SearchRerankDocumentV3Projection {
    readonly repository_relative_path: string;
    readonly language: string;
    readonly candidate_role: string;
    readonly symbol_kind: string;
    readonly canonical_symbol_label: string;
    readonly signature_or_declaration: string;
    readonly documentation_excerpt: string;
    readonly query_relevant_source_excerpt: string;
    readonly required_owner_siblings: readonly {
        repository_relative_path: string;
        canonical_symbol_label: string;
    }[];
}

export function buildSearchRerankDocumentV3(rawInput: unknown): SearchRerankDocumentV3Result {
    if (!isRecord(rawInput)) throw new TypeError("Projection input must be an object.");
    const candidateRole = requireString(rawInput.candidateRole, "candidateRole");
    const content = requireString(rawInput.content, "content", { allowEmpty: true });
    const lines = sourceLines(content);
    const symbolSpan = requireLineSpan(rawInput.symbolSpan, "symbolSpan", lines.length);
    const relativePath = requireSafeRelativePath(rawInput.relativePath);
    const language = requireString(rawInput.language, "language");
    const symbolKind = requireString(rawInput.symbolKind, "symbolKind");
    const canonicalSymbolLabel = requireString(
        rawInput.canonicalSymbolLabel,
        "canonicalSymbolLabel",
    );
    const inferredDeclaration = firstStructuralDeclaration(
        sourceLinesInSpan(lines, symbolSpan),
        language,
        symbolKind,
        relativePath,
    );
    const inferredOrFileHeading = inferredDeclaration
        || (["file", "module"].includes(symbolKind) ? canonicalSymbolLabel : "");
    const signatureOrDeclaration = rawInput.signatureOrDeclaration === undefined
        ? requireBoundedPhysicalLine(
            inferredOrFileHeading,
            "inferred signatureOrDeclaration",
            SEARCH_RERANK_DOCUMENT_V2_POLICY.declarationMaximumUtf8Bytes,
        )
        : requireBoundedPhysicalLine(
            rawInput.signatureOrDeclaration,
            "signatureOrDeclaration",
            SEARCH_RERANK_DOCUMENT_V2_POLICY.declarationMaximumUtf8Bytes,
        );
    const normalized: NormalizedProjectionInput = {
        relativePath,
        language,
        symbolKind,
        canonicalSymbolLabel,
        signatureOrDeclaration,
        documentationExcerpt: rawInput.documentationExcerpt === undefined
            ? ""
            : requireBoundedDocumentation(rawInput.documentationExcerpt),
        requiredOwnerSiblings: normalizeRequiredOwnerSiblings(rawInput.requiredOwnerSiblings),
        content,
        query: rawInput.query === undefined
            ? ""
            : requireString(rawInput.query, "query", { allowEmpty: true }),
        symbolSpan,
        evidenceSpans: normalizeEvidenceSpans(rawInput.evidenceSpans, symbolSpan, lines.length),
    };

    const buildProjectionText = (queryRelevantSourceExcerpt: string): string => {
        const projection: SearchRerankDocumentV3Projection = {
            repository_relative_path: relativePath,
            language,
            candidate_role: candidateRole,
            symbol_kind: symbolKind,
            canonical_symbol_label: canonicalSymbolLabel,
            signature_or_declaration: signatureOrDeclaration,
            documentation_excerpt: normalized.documentationExcerpt,
            query_relevant_source_excerpt: queryRelevantSourceExcerpt,
            required_owner_siblings: normalized.requiredOwnerSiblings,
        };
        return serializeCanonicalJson(projection);
    };

    const minimumText = buildProjectionText("");
    const minimumBytes = Buffer.byteLength(minimumText, "utf8");
    if (!signatureOrDeclaration || minimumBytes > SEARCH_RERANK_DOCUMENT_V3_POLICY.maximumUtf8Bytes) {
        throw new RangeError(
            `Projection v3 mandatory projection exceeds ${SEARCH_RERANK_DOCUMENT_V3_POLICY.maximumUtf8Bytes} UTF-8 bytes.`,
        );
    }

    const selection = selectRerankSourceWithinBudget({
        normalized,
        minimumText,
        buildProjectionText,
    });

    return {
        version: SEARCH_RERANK_DOCUMENT_V3_POLICY.id,
        text: selection.text,
        utf8Bytes: Buffer.byteLength(selection.text, "utf8"),
        selectedSourceLineCount: selection.selectedSource?.returnedLines ?? 0,
        selectedSourceExcerptCount: selection.selectedSource?.excerptCount ?? 0,
        sourceTruncated: selection.selectedSource?.truncated ?? content.length > 0,
        selectionAttemptCount: selection.selectionAttemptCount,
    };
}
