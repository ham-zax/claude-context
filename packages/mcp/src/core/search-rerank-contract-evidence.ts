/**
 * Inert historical contract evidence (Phase 9.2B).
 *
 * The frozen rerank request contract serializes a V3 document projection and
 * the V3 source-selection policy. Production search must never execute these;
 * they exist only so the current contract identity (`contractSha256` in
 * `assets/lateon/rerank-request-contract-v1.json`) stays byte-identical.
 * Nothing outside `search-rerank-request-contract.ts` may import this module.
 */
import { serializeCanonicalJson } from "./canonical-json.js";
import {
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
    type SearchRerankDocumentV2Sibling,
} from "./search-rerank-projection-primitives.js";
import type { SourceLineSpan } from "./bounded-source-selector.js";

export const SEARCH_RERANK_DOCUMENT_V3_POLICY_EVIDENCE = Object.freeze({
    id: "search_rerank_document_v3",
    previousVersion: "search_rerank_document_v2",
    maximumUtf8Bytes: 4_000,
    serialization: "canonical_json_utf8",
    serializedKeyOrder: "lexicographic_recursive_canonical_json_v1",
    addedField: "candidate_role",
});

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

export interface SearchRerankDocumentV3ContractInput {
    readonly relativePath: string;
    readonly language: string;
    readonly candidateRole: string;
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

export function buildSearchRerankDocumentV3ContractEvidence(
    rawInput: unknown,
): string {
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
            1_000,
        )
        : requireBoundedPhysicalLine(
            rawInput.signatureOrDeclaration,
            "signatureOrDeclaration",
            1_000,
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
    if (
        !signatureOrDeclaration
        || minimumBytes > SEARCH_RERANK_DOCUMENT_V3_POLICY_EVIDENCE.maximumUtf8Bytes
    ) {
        throw new RangeError(
            `Projection v3 mandatory projection exceeds ${SEARCH_RERANK_DOCUMENT_V3_POLICY_EVIDENCE.maximumUtf8Bytes} UTF-8 bytes.`,
        );
    }

    const selection = selectRerankSourceWithinBudget({
        normalized,
        minimumText,
        buildProjectionText,
    });

    return selection.text;
}
