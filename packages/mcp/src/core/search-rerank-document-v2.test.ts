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
    assert.equal(parsed.repository_relative_path, "src/worker.ts");
    assert.equal(parsed.signature_or_declaration, "function runWorker() {");
    assert.match(String(parsed.query_relevant_source_excerpt), /queue\.next/);
    assert.ok(projection.selectedSourceLineCount <= SEARCH_RERANK_DOCUMENT_V2_POLICY.maximumLines);
    assert.deepEqual(Object.keys(parsed), [...Object.keys(parsed)].sort());
});

test("buildSearchRerankDocumentV2 carries no ranking state and rejects non-canonical paths", () => {
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
    for (const field of [
        "pathMultiplier",
        "changedFilesMultiplier",
        "agentFitMultiplier",
        "lexicalScore",
        "fusionScore",
        "finalScore",
        "rerankerScore",
        "authoritativeRank",
    ]) {
        assert.ok(!projection.text.includes(field), `projection must not leak ${field}`);
    }
    for (const relativePath of ["/repo/src/worker.ts", "../outside.ts"]) {
        assert.throws(
            () => buildSearchRerankDocumentV2({
                relativePath,
                language: "typescript",
                symbolKind: "function",
                canonicalSymbolLabel: "runWorker",
                symbolSpan: { startLine: 1, endLine: 3 },
                content: "function runWorker() {\n  return queue.next();\n}",
                query: "queue next",
            }),
            TypeError,
        );
    }
});
