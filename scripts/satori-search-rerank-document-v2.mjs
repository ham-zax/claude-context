#!/usr/bin/env -S node --import tsx
import {
    BOUNDED_SOURCE_SELECTION_POLICY_VERSION,
    selectBoundedSource,
} from "../packages/mcp/src/core/bounded-source-selector.ts";
import { validateRepositoryRelativePath } from "../packages/core/src/paths/repository-path.ts";

const MAXIMUM_UTF8_BYTES = 4_000;
const MAXIMUM_LINES = 200;
const MAXIMUM_EXCERPTS = 5;
const MAXIMUM_EXCERPT_LINES = 40;
const CONTEXT_LINES = 2;
const MAXIMUM_DECLARATION_UTF8_BYTES = 1_000;
const MAXIMUM_DOCUMENTATION_UTF8_BYTES = 1_000;
const MAXIMUM_DOCUMENTATION_LINES = 8;
const MAXIMUM_DOCUMENTATION_LINE_UTF8_BYTES = 512;
const MAXIMUM_SELECTION_ATTEMPTS = 14;

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
    const relativePath = requireString(value, "relativePath");
    try {
        return validateRepositoryRelativePath(relativePath);
    } catch {
        throw new TypeError("relativePath must be a canonical repository-relative path.");
    }
}

function compareContractStrings(left, right) {
    if (left === right) return 0;
    return left < right ? -1 : 1;
}

function sourceLines(content) {
    return content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
}

function requireBoundedPhysicalLine(value, label, maximumUtf8Bytes) {
    const line = requireString(value, label).trim();
    if (/[\r\n]/.test(line)) {
        throw new TypeError(`${label} must be one physical line.`);
    }
    if (Buffer.byteLength(line, "utf8") > maximumUtf8Bytes) {
        throw new RangeError(`${label} exceeds ${maximumUtf8Bytes} UTF-8 bytes.`);
    }
    return line;
}

function requireBoundedDocumentation(value) {
    const normalized = requireString(value, "documentationExcerpt", { allowEmpty: true })
        .replaceAll("\r\n", "\n")
        .replaceAll("\r", "\n");
    const lines = normalized.split("\n");
    if (lines.length > MAXIMUM_DOCUMENTATION_LINES) {
        throw new RangeError(
            `documentationExcerpt exceeds ${MAXIMUM_DOCUMENTATION_LINES} physical lines.`,
        );
    }
    for (const line of lines) {
        if (Buffer.byteLength(line, "utf8") > MAXIMUM_DOCUMENTATION_LINE_UTF8_BYTES) {
            throw new RangeError(
                `documentationExcerpt physical line exceeds ${MAXIMUM_DOCUMENTATION_LINE_UTF8_BYTES} UTF-8 bytes.`,
            );
        }
    }
    if (Buffer.byteLength(normalized, "utf8") > MAXIMUM_DOCUMENTATION_UTF8_BYTES) {
        throw new RangeError(
            `documentationExcerpt exceeds ${MAXIMUM_DOCUMENTATION_UTF8_BYTES} UTF-8 bytes.`,
        );
    }
    return normalized;
}

function requireLineSpan(value, label, lineCount) {
    if (
        !isRecord(value)
        || !Number.isSafeInteger(value.startLine)
        || !Number.isSafeInteger(value.endLine)
        || value.startLine < 1
        || value.endLine < value.startLine
        || value.endLine > lineCount
    ) {
        throw new RangeError(`${label} must be a valid one-based inclusive source span.`);
    }
    return { startLine: value.startLine, endLine: value.endLine };
}

function normalizeEvidenceSpans(value, symbolSpan, lineCount) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw new TypeError("evidenceSpans must be an array when provided.");
    }
    return value.map((span, index) => {
        const normalized = requireLineSpan(span, `evidenceSpans[${index}]`, lineCount);
        if (
            normalized.startLine < symbolSpan.startLine
            || normalized.endLine > symbolSpan.endLine
        ) {
            throw new RangeError(`evidenceSpans[${index}] must be contained by symbolSpan.`);
        }
        return normalized;
    });
}

function sourceLinesInSpan(lines, span) {
    return lines.slice(span.startLine - 1, span.endLine);
}

function firstStructuralDeclaration(lines, language, symbolKind, relativePath) {
    const normalizedLanguage = language.toLowerCase();
    const normalizedPath = relativePath.toLowerCase();
    const isFileLevel = symbolKind === "file" || symbolKind === "module";
    const candidates = lines.map((line) => line.trim()).filter(Boolean);
    if (!isFileLevel) return candidates[0] ?? "";
    if (
        ["markdown", "md", "mdx"].includes(normalizedLanguage)
        || /\.mdx?$/u.test(normalizedPath)
    ) {
        return candidates.find((line) => /^#{1,6}\s+\S/u.test(line)) ?? "";
    }
    const configLike = [
        "toml", "yaml", "yml", "json", "jsonc", "ini", "xml",
        "properties", "dockerfile",
    ].includes(normalizedLanguage);
    const structuralPattern = configLike
        ? /^(?:\[[^\]]+\]|[\p{L}_][\p{L}\p{N}_.-]*\s*[:=]|[{[]|<[^!?][^>]*>|---\s*$)/u
        : /^(?:(?:export\s+)?(?:async\s+)?(?:class|interface|type|enum|function|const|let|var)\b|(?:async\s+)?def\b|class\b|fn\b|func\b|package\b|module\b|namespace\b|import\b|from\b|use\b|#include\b)/u;
    return candidates.find((line) => structuralPattern.test(line)) ?? "";
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
    return selectBoundedSource({
        sourceBytes: bytes,
        symbolSpan: input.symbolSpan,
        budgets: {
            maxSourceBytes,
            maxSourceLines: MAXIMUM_LINES,
            maxExcerpts: MAXIMUM_EXCERPTS,
            maxExcerptBytes: maxSourceBytes,
            maxExcerptLines: MAXIMUM_EXCERPT_LINES,
            contextLines: CONTEXT_LINES,
            maxSerializedSourceBytes: maxSourceBytes,
        },
        capabilities: {
            localLexical: "available",
            lineWindows: "available",
            syntaxBoundaries: "not_requested",
            controlFlowAnchors: "not_requested",
        },
        ...(input.query ? { query: input.query } : {}),
        ...(input.evidenceSpans.length > 0 ? { evidenceSpans: input.evidenceSpans } : {}),
    });
}

export function buildSearchRerankDocumentV2(rawInput) {
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
    const input = {
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

    const minimumText = canonicalJson(buildProjection(input, ""));
    const minimumBytes = Buffer.byteLength(minimumText, "utf8");
    if (!signatureOrDeclaration || minimumBytes > MAXIMUM_UTF8_BYTES) {
        throw new RangeError(
            `Projection v2 mandatory projection exceeds ${MAXIMUM_UTF8_BYTES} UTF-8 bytes.`,
        );
    }

    let lowerBudget = 1;
    let upperBudget = Math.max(1, MAXIMUM_UTF8_BYTES - minimumBytes);
    let selectedSource;
    let text = minimumText;
    let selectionAttemptCount = 0;
    for (let attempt = 0; attempt < MAXIMUM_SELECTION_ATTEMPTS && lowerBudget <= upperBudget; attempt += 1) {
        selectionAttemptCount += 1;
        const sourceBudget = Math.floor((lowerBudget + upperBudget) / 2);
        const selection = selectSource(input, sourceBudget);
        if (selection.status !== "selected") {
            lowerBudget = sourceBudget + 1;
            continue;
        }
        const excerpt = selectedExcerptText(selection.source);
        const candidateText = canonicalJson(buildProjection(input, excerpt));
        const candidateBytes = Buffer.byteLength(candidateText, "utf8");
        if (candidateBytes <= MAXIMUM_UTF8_BYTES) {
            selectedSource = selection.source;
            text = candidateText;
            lowerBudget = sourceBudget + 1;
            continue;
        }
        upperBudget = sourceBudget - 1;
    }

    if (!selectedSource) {
        selectedSource = { returnedLines: 0, excerptCount: 0, truncated: content.length > 0 };
    }
    return {
        version: SEARCH_RERANK_DOCUMENT_V2_POLICY.id,
        text,
        utf8Bytes: Buffer.byteLength(text, "utf8"),
        selectedSourceLineCount: selectedSource.returnedLines,
        selectedSourceExcerptCount: selectedSource.excerptCount,
        sourceTruncated: selectedSource.truncated,
        selectionAttemptCount,
    };
}
