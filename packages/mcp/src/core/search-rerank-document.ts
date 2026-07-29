import {
    SEARCH_RERANK_DOC_MAX_CHARS,
    SEARCH_RERANK_DOC_MAX_LINES,
} from "./search-constants.js";
import type { SearchResultLike } from "./search-lexical-scoring.js";

export const SEARCH_RERANK_DOCUMENT_PROJECTION_VERSION =
    "search_rerank_document_v1" as const;

export function buildSearchRerankDocument(result: SearchResultLike): string {
    const relativePath = typeof result?.relativePath === "string"
        ? result.relativePath
        : "";
    const language = typeof result?.language === "string"
        ? result.language
        : "unknown";
    const symbolLabel = typeof result?.symbolLabel === "string"
        ? result.symbolLabel
        : "";
    const content = typeof result?.content === "string" ? result.content : "";
    const contentLines = content.split(/\r?\n/).slice(0, SEARCH_RERANK_DOC_MAX_LINES);
    let normalizedContent = contentLines.join("\n");
    if (normalizedContent.length > SEARCH_RERANK_DOC_MAX_CHARS) {
        normalizedContent = normalizedContent.slice(0, SEARCH_RERANK_DOC_MAX_CHARS);
    }
    return `${relativePath}\n${language}\n${symbolLabel}\n${normalizedContent}`;
}
