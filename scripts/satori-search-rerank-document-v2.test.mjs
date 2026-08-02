import assert from "node:assert/strict";
import test from "node:test";
import {
    SEARCH_RERANK_DOCUMENT_V2_POLICY,
    buildSearchRerankDocumentV2,
} from "./satori-search-rerank-document-v2.mjs";

test("projection v2 serializes the frozen fields deterministically within its UTF-8 budget", () => {
    const input = {
        relativePath: "src/café.ts",
        language: "typescript",
        symbolKind: "function",
        canonicalSymbolLabel: "serveRequest",
        content: [
            "export async function serveRequest(request: Request) {",
            "  const ignored = prepareFallback();",
            "  return routeAuthenticatedRequest(request);",
            "}",
        ].join("\n"),
        query: "route authenticated request",
    };

    const first = buildSearchRerankDocumentV2(input);
    const second = buildSearchRerankDocumentV2(input);
    const parsed = JSON.parse(first.text);

    assert.equal(SEARCH_RERANK_DOCUMENT_V2_POLICY.id, "search_rerank_document_v2");
    assert.equal(
        SEARCH_RERANK_DOCUMENT_V2_POLICY.declarationSelection,
        "first_nonempty_normalized_physical_line_v1",
    );
    assert.deepEqual(first, second);
    assert.equal(first.utf8Bytes, Buffer.byteLength(first.text, "utf8"));
    assert.ok(first.utf8Bytes <= 4_000);
    assert.equal(parsed.repository_relative_path, "src/café.ts");
    assert.equal(parsed.language, "typescript");
    assert.equal(parsed.symbol_kind, "function");
    assert.equal(parsed.canonical_symbol_label, "serveRequest");
    assert.equal(
        parsed.signature_or_declaration,
        "export async function serveRequest(request: Request) {",
    );
    assert.match(parsed.query_relevant_source_excerpt, /routeAuthenticatedRequest/);
    assert.deepEqual(Object.keys(parsed), [...Object.keys(parsed)].sort());
});

test("projection v2 retains the declaration while selecting bounded query-relevant source", () => {
    const content = [
        "function reconcileInvoice(invoice) {",
        ...Array.from({ length: 90 }, (_, index) => `  const filler${index} = ${index};`),
        "  persistInvoiceTransaction(invoice);",
        ...Array.from({ length: 90 }, (_, index) => `  const tail${index} = ${index};`),
        "  return invoice;",
        "}",
    ].join("\n");

    const projection = buildSearchRerankDocumentV2({
        relativePath: "src/invoice.ts",
        language: "typescript",
        symbolKind: "function",
        canonicalSymbolLabel: "reconcileInvoice",
        content,
        query: "persist invoice transaction",
    });
    const parsed = JSON.parse(projection.text);

    assert.equal(parsed.signature_or_declaration, "function reconcileInvoice(invoice) {");
    assert.match(parsed.query_relevant_source_excerpt, /persistInvoiceTransaction/);
    assert.ok(projection.selectedSourceLineCount <= 200);
    assert.ok(projection.utf8Bytes <= 4_000);
});

test("projection v2 gives file-level Markdown a heading declaration and relevant text", () => {
    const projection = buildSearchRerankDocumentV2({
        relativePath: "docs/operations.md",
        language: "markdown",
        symbolKind: "file",
        canonicalSymbolLabel: "operations.md",
        content: [
            "# Operations",
            "",
            "Routine setup notes.",
            "",
            "## Recovery",
            "Rotate the lease before resuming the worker.",
        ].join("\n"),
        query: "rotate lease resuming worker",
    });
    const parsed = JSON.parse(projection.text);

    assert.equal(parsed.signature_or_declaration, "# Operations");
    assert.match(parsed.query_relevant_source_excerpt, /Rotate the lease/);
});

test("projection v2 preserves every required owner sibling in contract order", () => {
    const projection = buildSearchRerankDocumentV2({
        relativePath: "src/worker.ts",
        language: "typescript",
        symbolKind: "method",
        canonicalSymbolLabel: "Worker.run",
        content: "run() { return this.queue.next(); }",
        query: "run worker",
        requiredOwnerSiblings: [
            { relativePath: "src/worker.ts", canonicalSymbolLabel: "Worker.stop" },
            { relativePath: "src/worker.ts", canonicalSymbolLabel: "Worker.create" },
        ],
    });
    const parsed = JSON.parse(projection.text);

    assert.deepEqual(parsed.required_owner_siblings, [
        { canonical_symbol_label: "Worker.create", repository_relative_path: "src/worker.ts" },
        { canonical_symbol_label: "Worker.stop", repository_relative_path: "src/worker.ts" },
    ]);
});

test("projection v2 fails closed when its mandatory declaration cannot fit", () => {
    assert.throws(() => buildSearchRerankDocumentV2({
        relativePath: "src/oversized.ts",
        language: "typescript",
        symbolKind: "function",
        canonicalSymbolLabel: "oversized",
        content: `function ${"x".repeat(4_100)}() {}`,
        query: "oversized",
    }), /mandatory projection exceeds 4000 UTF-8 bytes/);
});
