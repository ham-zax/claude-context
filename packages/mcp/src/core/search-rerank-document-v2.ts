/**
 * Historical V2 rerank document projection (Phase 9.2B retires this module).
 *
 * Phase 9.2A moved the neutral projection primitives into
 * `search-rerank-projection-primitives.ts`; this module keeps only the V2
 * policy contract, its input/result types, and its builder, and re-exports the
 * primitives so historical consumers (V3/V4) keep their existing imports.
 */
import {
    LEGACY_BOUNDED_SOURCE_SELECTION_POLICY_VERSION,
    type SourceLineSpan,
} from "./bounded-source-selector.js";
import { serializeCanonicalJson } from "./canonical-json.js";
import {
    CONTEXT_LINES,
    MAXIMUM_DECLARATION_UTF8_BYTES,
    MAXIMUM_DOCUMENTATION_LINE_UTF8_BYTES,
    MAXIMUM_DOCUMENTATION_LINES,
    MAXIMUM_DOCUMENTATION_UTF8_BYTES,
    MAXIMUM_EXCERPTS,
    MAXIMUM_EXCERPT_LINES,
    MAXIMUM_LINES,
    MAXIMUM_SELECTION_ATTEMPTS,
    MAXIMUM_UTF8_BYTES,
    firstStructuralDeclaration,
    isRecord,
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
    type NormalizedRequiredOwnerSibling,
    type SearchRerankDocumentV2Sibling,
} from "./search-rerank-projection-primitives.js";

export {
    firstStructuralDeclaration,
    isRecord,
    normalizeEvidenceSpans,
    normalizeRequiredOwnerSiblings,
    requireBoundedDocumentation,
    requireBoundedPhysicalLine,
    requireLineSpan,
    requireSafeRelativePath,
    requireString,
    selectedExcerptText,
    selectRerankSourceWithinBudget,
    selectSource,
    sourceLines,
    sourceLinesInSpan,
    type NormalizedProjectionInput,
    type NormalizedRequiredOwnerSibling,
    type SearchRerankDocumentV2Sibling,
} from "./search-rerank-projection-primitives.js";

export const SEARCH_RERANK_DOCUMENT_V2_POLICY = Object.freeze({
    id: "search_rerank_document_v2",
    serialization: "canonical_json_utf8",
    maximumUtf8Bytes: MAXIMUM_UTF8_BYTES,
    maximumLines: MAXIMUM_LINES,
    serializedKeyOrder: "lexicographic_recursive_canonical_json_v1",
    fieldOrder: Object.freeze([
        "repository_relative_path",
        "language",
        "symbol_kind",
        "canonical_symbol_label",
        "signature_or_declaration",
        "documentation_excerpt",
        "query_relevant_source_excerpt",
        "required_owner_siblings",
    ]),
    selector: Object.freeze({
        version: LEGACY_BOUNDED_SOURCE_SELECTION_POLICY_VERSION,
        queryTokens: "normalized_query_tokens_v1",
        maxExcerpts: MAXIMUM_EXCERPTS,
        maxExcerptLines: MAXIMUM_EXCERPT_LINES,
        contextLines: CONTEXT_LINES,
        evidenceSpans: "validated_only",
        stableTieOrder: LEGACY_BOUNDED_SOURCE_SELECTION_POLICY_VERSION,
        declarationRetention: "mandatory_or_minimum_projection_exceeds_budget",
        serializedSourceBudget: "remaining_projection_utf8_bytes",
        maximumSelectionAttempts: MAXIMUM_SELECTION_ATTEMPTS,
    }),
    declarationSelection:
        "authoritative_symbol_span_declaration_or_file_heading_or_config_declaration_v2",
    declarationMaximumUtf8Bytes: MAXIMUM_DECLARATION_UTF8_BYTES,
    documentationSelection: "authoritative_caller_physical_lines_or_empty_v2",
    documentationMaximumUtf8Bytes: MAXIMUM_DOCUMENTATION_UTF8_BYTES,
    documentationMaximumLines: MAXIMUM_DOCUMENTATION_LINES,
    documentationMaximumLineUtf8Bytes: MAXIMUM_DOCUMENTATION_LINE_UTF8_BYTES,
    requiredOwnerSiblingOrder:
        "repository_relative_path_then_canonical_symbol_label_contract_string_v1",
    fileLevelProjection:
        "first_heading_or_structural_declaration_plus_bounded_query_relevant_text_v2",
    queryFormatting: Object.freeze({
        semanticQuery: "captured_query_plan_semantic_query_utf8",
        runtimePrefix: "c0_contract_inference_query_prefix",
        normalization: "c0_contract_inference_lowercase",
    }),
});

export interface SearchRerankDocumentV2Input {
    readonly relativePath: string;
    readonly language: string;
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

export interface SearchRerankDocumentV2Result {
    readonly version: typeof SEARCH_RERANK_DOCUMENT_V2_POLICY.id;
    readonly text: string;
    readonly utf8Bytes: number;
    readonly selectedSourceLineCount: number;
    readonly selectedSourceExcerptCount: number;
    readonly sourceTruncated: boolean;
    readonly selectionAttemptCount: number;
}

interface SearchRerankDocumentV2Projection {
    readonly repository_relative_path: string;
    readonly language: string;
    readonly symbol_kind: string;
    readonly canonical_symbol_label: string;
    readonly signature_or_declaration: string;
    readonly documentation_excerpt: string;
    readonly query_relevant_source_excerpt: string;
    readonly required_owner_siblings: readonly NormalizedRequiredOwnerSibling[];
}

function buildProjection(
    input: NormalizedProjectionInput,
    queryRelevantSourceExcerpt: string,
): SearchRerankDocumentV2Projection {
    return {
        repository_relative_path: input.relativePath,
        language: input.language,
        symbol_kind: input.symbolKind,
        canonical_symbol_label: input.canonicalSymbolLabel,
        signature_or_declaration: input.signatureOrDeclaration,
        documentation_excerpt: input.documentationExcerpt,
        query_relevant_source_excerpt: queryRelevantSourceExcerpt,
        required_owner_siblings: input.requiredOwnerSiblings,
    };
}

export function buildSearchRerankDocumentV2(rawInput: unknown): SearchRerankDocumentV2Result {
    if (!isRecord(rawInput)) throw new TypeError("Projection input must be an object.");
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
            MAXIMUM_DECLARATION_UTF8_BYTES,
        )
        : requireBoundedPhysicalLine(
            rawInput.signatureOrDeclaration,
            "signatureOrDeclaration",
            MAXIMUM_DECLARATION_UTF8_BYTES,
        );
    const input: NormalizedProjectionInput = {
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

    const minimumText = serializeCanonicalJson(buildProjection(input, ""));
    const minimumBytes = Buffer.byteLength(minimumText, "utf8");
    if (!signatureOrDeclaration || minimumBytes > MAXIMUM_UTF8_BYTES) {
        throw new RangeError(
            `Projection v2 mandatory projection exceeds ${MAXIMUM_UTF8_BYTES} UTF-8 bytes.`,
        );
    }

    const selection = selectRerankSourceWithinBudget({
        normalized: input,
        minimumText,
        buildProjectionText: (excerpt) => serializeCanonicalJson(buildProjection(input, excerpt)),
    });
    const { text, selectedSource, selectionAttemptCount } = selection;

    return {
        version: SEARCH_RERANK_DOCUMENT_V2_POLICY.id,
        text,
        utf8Bytes: Buffer.byteLength(text, "utf8"),
        selectedSourceLineCount: selectedSource?.returnedLines ?? 0,
        selectedSourceExcerptCount: selectedSource?.excerptCount ?? 0,
        sourceTruncated: selectedSource?.truncated ?? content.length > 0,
        selectionAttemptCount,
    };
}
