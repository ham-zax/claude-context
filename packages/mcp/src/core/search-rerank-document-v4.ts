import { serializeCanonicalJson } from "./canonical-json.js";
import type { SearchCandidateRole } from "./search-rerank-context.js";
import type { SearchRerankStructuralContext, SearchRerankStructuralReference } from "./search-rerank-structural-context.js";
import {
    SEARCH_RERANK_DOCUMENT_V2_POLICY,
    isRecord,
    firstStructuralDeclaration,
    normalizeEvidenceSpans,
    requireBoundedPhysicalLine,
    requireLineSpan,
    requireSafeRelativePath,
    requireString,
    selectRerankSourceWithinBudget,
    sourceLines,
    sourceLinesInSpan,
    type NormalizedProjectionInput,
} from "./search-rerank-document-v2.js";
import {
    SEARCH_RERANK_DOCUMENT_V3_POLICY,
} from "./search-rerank-document-v3.js";
import type { SourceLineSpan } from "./bounded-source-selector.js";

export const SEARCH_RERANK_DOCUMENT_V4_POLICY = Object.freeze({
    id: "search_rerank_document_v4",
    previousVersion: SEARCH_RERANK_DOCUMENT_V3_POLICY.id,
    maximumUtf8Bytes: 4_000,
    serialization: "canonical_json_utf8",
    serializedKeyOrder: SEARCH_RERANK_DOCUMENT_V2_POLICY.serializedKeyOrder,
    addedField: "structural_context",
    structuralContextBudget: "truncate_references_before_source_v1",
    structuralContextOrder: "relation_then_path_then_label_v1",
});

export interface SearchRerankDocumentV4Input {
    readonly relativePath: string;
    readonly language: string;
    readonly candidateRole: SearchCandidateRole;
    readonly symbolKind: string;
    readonly canonicalSymbolLabel: string;
    readonly symbolSpan: SourceLineSpan;
    readonly content: string;
    readonly signatureOrDeclaration?: string;
    readonly query?: string;
    readonly evidenceSpans?: readonly SourceLineSpan[];
    readonly structuralContext?: SearchRerankStructuralContext;
}

export interface SearchRerankDocumentV4Result {
    readonly version: typeof SEARCH_RERANK_DOCUMENT_V4_POLICY.id;
    readonly text: string;
    readonly utf8Bytes: number;
    readonly selectedSourceLineCount: number;
    readonly selectedSourceExcerptCount: number;
    readonly sourceTruncated: boolean;
    readonly selectionAttemptCount: number;
    readonly structuralContextTruncated: boolean;
}

interface SearchRerankDocumentV4Projection {
    readonly repository_relative_path: string;
    readonly candidate_role: string;
    readonly symbol_kind: string;
    readonly canonical_symbol_label: string;
    readonly signature_or_declaration: string;
    readonly query_relevant_source_excerpt: string;
    readonly structural_context: {
        readonly direct_callers: readonly SearchRerankStructuralReference[];
        readonly direct_callees: readonly SearchRerankStructuralReference[];
        readonly supporting_tests: readonly SearchRerankStructuralReference[];
    };
}

const STRUCTURAL_RELATIONS = new Set<SearchRerankStructuralReference["relation"]>([
    "caller",
    "callee",
    "test_support",
]);

function normalizeStructuralReferences(
    value: unknown,
    label: string,
): readonly SearchRerankStructuralReference[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw new TypeError(`${label} must be an array of structural references.`);
    }
    return value.map((entry, index) => {
        if (!isRecord(entry)) {
            throw new TypeError(`${label}[${index}] must be a structural reference object.`);
        }
        const relation = entry.relation;
        if (typeof relation !== "string" || !STRUCTURAL_RELATIONS.has(relation as never)) {
            throw new TypeError(`${label}[${index}].relation must be caller, callee, or test_support.`);
        }
        return Object.freeze({
            repository_relative_path: requireSafeRelativePath(entry.repository_relative_path),
            canonical_symbol_label: requireString(entry.canonical_symbol_label, `${label}[${index}].canonical_symbol_label`),
            relation: relation as SearchRerankStructuralReference["relation"],
        });
    });
}

function normalizeStructuralContext(
    rawInput: Record<string, unknown>,
): SearchRerankStructuralContext {
    const raw = rawInput.structuralContext === undefined ? {} : rawInput.structuralContext;
    if (!isRecord(raw)) {
        throw new TypeError("structuralContext must be an object.");
    }
    return {
        directCallers: normalizeStructuralReferences(raw.directCallers, "structuralContext.directCallers"),
        directCallees: normalizeStructuralReferences(raw.directCallees, "structuralContext.directCallees"),
        supportingTests: normalizeStructuralReferences(raw.supportingTests, "structuralContext.supportingTests"),
    };
}

/**
 * Structural references are the lowest budget priority after the mandatory
 * declaration and the query-relevant source. When the full packet exceeds the
 * byte budget with an empty source excerpt, reference lists are truncated
 * deterministically (supporting tests first, then callees, then callers, one
 * reference at a time from the end of each list) before any source reduction
 * runs. The mandatory declaration can never be displaced and a projection
 * that still exceeds the budget with zero references fails closed.
 */
function truncateStructuralContextToBudget(
    context: SearchRerankStructuralContext,
    buildProjectionText: (context: SearchRerankStructuralContext, queryRelevantSourceExcerpt: string) => string,
): { context: SearchRerankStructuralContext; truncated: boolean } {
    let directCallers = [...context.directCallers];
    let directCallees = [...context.directCallees];
    let supportingTests = [...context.supportingTests];
    let truncated = false;
    for (;;) {
        const current: SearchRerankStructuralContext = {
            directCallers,
            directCallees,
            supportingTests,
        };
        const minimumText = buildProjectionText(current, "");
        if (Buffer.byteLength(minimumText, "utf8") <= SEARCH_RERANK_DOCUMENT_V4_POLICY.maximumUtf8Bytes) {
            return { context: current, truncated };
        }
        if (supportingTests.length > 0) {
            supportingTests = supportingTests.slice(0, -1);
        } else if (directCallees.length > 0) {
            directCallees = directCallees.slice(0, -1);
        } else if (directCallers.length > 0) {
            directCallers = directCallers.slice(0, -1);
        } else {
            throw new RangeError(
                `Projection v4 mandatory projection exceeds ${SEARCH_RERANK_DOCUMENT_V4_POLICY.maximumUtf8Bytes} UTF-8 bytes.`,
            );
        }
        truncated = true;
    }
}

export function buildSearchRerankDocumentV4(rawInput: unknown): SearchRerankDocumentV4Result {
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
    const structuralContext = normalizeStructuralContext(rawInput);
    const normalized: NormalizedProjectionInput = {
        relativePath,
        language,
        symbolKind,
        canonicalSymbolLabel,
        signatureOrDeclaration,
        documentationExcerpt: "",
        requiredOwnerSiblings: [],
        content,
        query: rawInput.query === undefined
            ? ""
            : requireString(rawInput.query, "query", { allowEmpty: true }),
        symbolSpan,
        evidenceSpans: normalizeEvidenceSpans(rawInput.evidenceSpans, symbolSpan, lines.length),
    };

    const buildProjectionText = (
        context: SearchRerankStructuralContext,
        queryRelevantSourceExcerpt: string,
    ): string => {
        const projection: SearchRerankDocumentV4Projection = {
            repository_relative_path: relativePath,
            candidate_role: candidateRole,
            symbol_kind: symbolKind,
            canonical_symbol_label: canonicalSymbolLabel,
            signature_or_declaration: signatureOrDeclaration,
            query_relevant_source_excerpt: queryRelevantSourceExcerpt,
            structural_context: {
                direct_callers: context.directCallers,
                direct_callees: context.directCallees,
                supporting_tests: context.supportingTests,
            },
        };
        return serializeCanonicalJson(projection);
    };

    const bounded = truncateStructuralContextToBudget(structuralContext, buildProjectionText);

    const selection = selectRerankSourceWithinBudget({
        normalized,
        minimumText: buildProjectionText(bounded.context, ""),
        buildProjectionText: (excerpt) => buildProjectionText(bounded.context, excerpt),
    });

    return {
        version: SEARCH_RERANK_DOCUMENT_V4_POLICY.id,
        text: selection.text,
        utf8Bytes: Buffer.byteLength(selection.text, "utf8"),
        selectedSourceLineCount: selection.selectedSource?.returnedLines ?? 0,
        selectedSourceExcerptCount: selection.selectedSource?.excerptCount ?? 0,
        sourceTruncated: selection.selectedSource?.truncated ?? content.length > 0,
        selectionAttemptCount: selection.selectionAttemptCount,
        structuralContextTruncated: bounded.truncated,
    };
}
