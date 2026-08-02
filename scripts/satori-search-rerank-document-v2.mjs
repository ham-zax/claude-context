#!/usr/bin/env -S node --import tsx
import {
    BOUNDED_SOURCE_SELECTION_POLICY_VERSION,
    selectBoundedSource,
} from "../packages/mcp/src/core/bounded-source-selector.ts";

const MAXIMUM_UTF8_BYTES = 4_000;
const MAXIMUM_LINES = 200;
const MAXIMUM_EXCERPTS = 5;
const MAXIMUM_EXCERPT_LINES = 40;
const CONTEXT_LINES = 2;

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
        version: BOUNDED_SOURCE_SELECTION_POLICY_VERSION,
        queryTokens: "normalized_query_tokens_v1",
        maxExcerpts: MAXIMUM_EXCERPTS,
        maxExcerptLines: MAXIMUM_EXCERPT_LINES,
        contextLines: CONTEXT_LINES,
        evidenceSpans: "validated_only",
        stableTieOrder: BOUNDED_SOURCE_SELECTION_POLICY_VERSION,
        declarationRetention: "mandatory_or_minimum_projection_exceeds_budget",
    }),
    declarationSelection: "first_nonempty_normalized_physical_line_v1",
    documentationSelection: "authoritative_caller_value_or_empty_v1",
    requiredOwnerSiblingOrder:
        "repository_relative_path_then_canonical_symbol_label_contract_string_v1",
    queryFormatting: Object.freeze({
        semanticQuery: "captured_query_plan_semantic_query_utf8",
        runtimePrefix: "c0_contract_inference_query_prefix",
        normalization: "c0_contract_inference_lowercase",
    }),
});

function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (isRecord(value)) {
        return Object.fromEntries(
            Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
        );
    }
    return value;
}

function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
}

function requireString(value, label, { allowEmpty = false } = {}) {
    if (typeof value !== "string" || (!allowEmpty && value.trim().length === 0)) {
        throw new TypeError(`${label} must be ${allowEmpty ? "a string" : "a non-empty string"}.`);
    }
    return value;
}

function requireSafeRelativePath(value) {
    const relativePath = requireString(value, "relativePath").replaceAll("\\", "/");
    if (relativePath.startsWith("/") || relativePath.split("/").includes("..")) {
        throw new TypeError("relativePath must be a safe repository-relative path.");
    }
    return relativePath;
}

function compareContractStrings(left, right) {
    if (left === right) return 0;
    return left < right ? -1 : 1;
}

function sourceLines(content) {
    return content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
}

function firstDeclaration(lines) {
    return lines.find((line) => line.trim().length > 0)?.trim() ?? "";
}

function normalizeRequiredOwnerSiblings(value) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw new TypeError("requiredOwnerSiblings must be an array when provided.");
    }
    const seen = new Set();
    return value.map((rawSibling, index) => {
        if (!isRecord(rawSibling)) {
            throw new TypeError(`requiredOwnerSiblings[${index}] must be an object.`);
        }
        const sibling = {
            repository_relative_path: requireSafeRelativePath(rawSibling.relativePath),
            canonical_symbol_label: requireString(
                rawSibling.canonicalSymbolLabel,
                `requiredOwnerSiblings[${index}].canonicalSymbolLabel`,
            ),
        };
        const identity = canonicalJson(sibling);
        if (seen.has(identity)) {
            throw new TypeError(`requiredOwnerSiblings contains duplicate '${identity}'.`);
        }
        seen.add(identity);
        return sibling;
    }).sort((left, right) => (
        compareContractStrings(left.repository_relative_path, right.repository_relative_path)
        || compareContractStrings(left.canonical_symbol_label, right.canonical_symbol_label)
    ));
}

function selectedExcerptText(source) {
    return source.excerpts.map(({ content }) => content).join("\n...\n");
}

function buildProjection(input, queryRelevantSourceExcerpt) {
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

function selectSource(input, maxSourceBytes) {
    const bytes = Buffer.from(input.content, "utf8");
    const lineCount = sourceLines(input.content).length;
    return selectBoundedSource({
        sourceBytes: bytes,
        symbolSpan: { startLine: 1, endLine: lineCount },
        budgets: {
            maxSourceBytes,
            maxSourceLines: MAXIMUM_LINES,
            maxExcerpts: MAXIMUM_EXCERPTS,
            maxExcerptBytes: maxSourceBytes,
            maxExcerptLines: MAXIMUM_EXCERPT_LINES,
            contextLines: CONTEXT_LINES,
            // This bounds selector metadata, not the final projection. The final
            // canonical JSON byte budget is enforced below.
            maxSerializedSourceBytes: 64_000,
        },
        capabilities: {
            localLexical: "available",
            lineWindows: "available",
            syntaxBoundaries: "not_requested",
            controlFlowAnchors: "not_requested",
        },
        ...(input.query ? { query: input.query } : {}),
        ...(input.evidenceSpans ? { evidenceSpans: input.evidenceSpans } : {}),
    });
}

export function buildSearchRerankDocumentV2(rawInput) {
    if (!isRecord(rawInput)) throw new TypeError("Projection input must be an object.");
    const content = requireString(rawInput.content, "content", { allowEmpty: true });
    const lines = sourceLines(content);
    const signatureOrDeclaration = rawInput.signatureOrDeclaration === undefined
        ? firstDeclaration(lines)
        : requireString(rawInput.signatureOrDeclaration, "signatureOrDeclaration");
    const input = {
        relativePath: requireSafeRelativePath(rawInput.relativePath),
        language: requireString(rawInput.language, "language"),
        symbolKind: requireString(rawInput.symbolKind, "symbolKind"),
        canonicalSymbolLabel: requireString(
            rawInput.canonicalSymbolLabel,
            "canonicalSymbolLabel",
        ),
        signatureOrDeclaration,
        documentationExcerpt: rawInput.documentationExcerpt === undefined
            ? ""
            : requireString(rawInput.documentationExcerpt, "documentationExcerpt", {
                allowEmpty: true,
            }),
        requiredOwnerSiblings: normalizeRequiredOwnerSiblings(rawInput.requiredOwnerSiblings),
        content,
        query: rawInput.query === undefined
            ? ""
            : requireString(rawInput.query, "query", { allowEmpty: true }),
        evidenceSpans: rawInput.evidenceSpans,
    };

    const minimumText = canonicalJson(buildProjection(input, ""));
    const minimumBytes = Buffer.byteLength(minimumText, "utf8");
    if (!signatureOrDeclaration || minimumBytes > MAXIMUM_UTF8_BYTES) {
        throw new RangeError(
            `Projection v2 mandatory projection exceeds ${MAXIMUM_UTF8_BYTES} UTF-8 bytes.`,
        );
    }

    let sourceBudget = Math.max(1, MAXIMUM_UTF8_BYTES - minimumBytes);
    let selectedSource;
    let text = minimumText;
    while (sourceBudget >= 1) {
        const selection = selectSource(input, sourceBudget);
        if (selection.status !== "selected") {
            sourceBudget -= 1;
            continue;
        }
        const excerpt = selectedExcerptText(selection.source);
        const candidateText = canonicalJson(buildProjection(input, excerpt));
        const candidateBytes = Buffer.byteLength(candidateText, "utf8");
        if (candidateBytes <= MAXIMUM_UTF8_BYTES) {
            selectedSource = selection.source;
            text = candidateText;
            break;
        }
        sourceBudget -= Math.max(1, candidateBytes - MAXIMUM_UTF8_BYTES);
    }

    if (!selectedSource) {
        const emptySelection = selectSource(input, 1);
        selectedSource = emptySelection.status === "selected"
            ? emptySelection.source
            : { returnedLines: 0, excerptCount: 0, truncated: content.length > 0 };
    }
    return {
        version: SEARCH_RERANK_DOCUMENT_V2_POLICY.id,
        text,
        utf8Bytes: Buffer.byteLength(text, "utf8"),
        selectedSourceLineCount: selectedSource.returnedLines,
        selectedSourceExcerptCount: selectedSource.excerptCount,
        sourceTruncated: selectedSource.truncated,
    };
}
