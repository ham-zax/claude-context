import assert from "node:assert/strict";
import test from "node:test";
import {
    SEARCH_RERANK_DOCUMENT_V2_POLICY,
    buildSearchRerankDocumentV2,
} from "./search-rerank-document-v2.js";

test("buildSearchRerankDocumentV2 owns the frozen projection contract", () => {
    const projection = buildSearchRerankDocumentV2({
        relativePath: "src/worker.ts",
        language: "typescript",
        symbolKind: "function",
        canonicalSymbolLabel: "runWorker",
        symbolSpan: { startLine: 1, endLine: 3 },
        content: [
            "function runWorker() {",
            "  return queue.next();",
            "}",
        ].join("\n"),
        query: "queue next",
    });
    const parsed = JSON.parse(projection.text) as Record<string, unknown>;

    assert.equal(SEARCH_RERANK_DOCUMENT_V2_POLICY.id, "search_rerank_document_v2");
    assert.equal(projection.version, SEARCH_RERANK_DOCUMENT_V2_POLICY.id);
    assert.equal(projection.utf8Bytes, Buffer.byteLength(projection.text, "utf8"));
    assert.ok(projection.utf8Bytes <= SEARCH_RERANK_DOCUMENT_V2_POLICY.maximumUtf8Bytes);
    assert.equal(parsed.signature_or_declaration, "function runWorker() {");
    assert.match(String(parsed.query_relevant_source_excerpt), /queue\.next/);
    assert.deepEqual(Object.keys(parsed), [...Object.keys(parsed)].sort());
});
