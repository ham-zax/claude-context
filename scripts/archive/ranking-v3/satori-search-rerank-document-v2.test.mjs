import assert from "node:assert/strict";
import test from "node:test";
import {
    SEARCH_RERANK_DOCUMENT_V2_POLICY,
    buildSearchRerankDocumentV2,
} from "./satori-search-rerank-document-v2.mjs";
import {
    SEARCH_RERANK_DOCUMENT_V2_POLICY as PRODUCTION_SEARCH_RERANK_DOCUMENT_V2_POLICY,
    buildSearchRerankDocumentV2 as buildProductionSearchRerankDocumentV2,
} from "../packages/mcp/src/core/search-rerank-document-v2.ts";

test("projection v2 compatibility entrypoint is byte-identical to its production owner", () => {
    const input = {
        relativePath: "src/café.ts",
        language: "typescript",
        symbolKind: "function",
        canonicalSymbolLabel: "serveRequest",
        symbolSpan: { startLine: 1, endLine: 4 },
        content: [
            "export async function serveRequest(request: Request) {",
            "  const ignored = prepareFallback();",
            "  return routeAuthenticatedRequest(request);",
            "}",
        ].join("\n"),
        query: "route authenticated request",
    };

    assert.deepEqual(
        buildSearchRerankDocumentV2(input),
        buildProductionSearchRerankDocumentV2(input),
    );
    assert.deepEqual(
        SEARCH_RERANK_DOCUMENT_V2_POLICY,
        PRODUCTION_SEARCH_RERANK_DOCUMENT_V2_POLICY,
    );
});

test("projection v2 serializes the frozen fields deterministically within its UTF-8 budget", () => {
    const input = {
        relativePath: "src/café.ts",
        language: "typescript",
        symbolKind: "function",
        canonicalSymbolLabel: "serveRequest",
        symbolSpan: { startLine: 1, endLine: 4 },
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
        "authoritative_symbol_span_declaration_or_file_heading_or_config_declaration_v2",
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
        symbolSpan: { startLine: 1, endLine: 184 },
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
        symbolSpan: { startLine: 1, endLine: 6 },
        content: [
            "This preamble is not a declaration.",
            "# Operations",
            "## Recovery",
            "Rotate the lease before resuming the worker.",
            "Routine setup notes.",
            "More routine notes.",
        ].join("\n"),
        query: "rotate lease resuming worker",
    });
    const parsed = JSON.parse(projection.text);

    assert.equal(parsed.signature_or_declaration, "# Operations");
    assert.match(parsed.query_relevant_source_excerpt, /Rotate the lease/);
});

test("projection v2 recognizes Markdown by path when indexing reports text", () => {
    const projection = buildSearchRerankDocumentV2({
        relativePath: "README.md",
        language: "text",
        symbolKind: "file",
        canonicalSymbolLabel: "README.md",
        symbolSpan: { startLine: 1, endLine: 2 },
        content: "# Product guide\nRun the worker locally.",
        query: "run worker",
    });

    assert.equal(JSON.parse(projection.text).signature_or_declaration, "# Product guide");
});

test("projection v2 uses the canonical file label when no structural heading exists", () => {
    const projection = buildSearchRerankDocumentV2({
        relativePath: "notes.txt",
        language: "text",
        symbolKind: "file",
        canonicalSymbolLabel: "notes.txt",
        symbolSpan: { startLine: 1, endLine: 1 },
        content: "plain operational notes",
        query: "operational notes",
    });

    assert.equal(JSON.parse(projection.text).signature_or_declaration, "notes.txt");
});

test("projection v2 preserves every required owner sibling in contract order", () => {
    const projection = buildSearchRerankDocumentV2({
        relativePath: "src/worker.ts",
        language: "typescript",
        symbolKind: "method",
        canonicalSymbolLabel: "Worker.run",
        symbolSpan: { startLine: 1, endLine: 1 },
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
        symbolSpan: { startLine: 1, endLine: 1 },
        content: `function ${"x".repeat(4_100)}() {}`,
        query: "oversized",
    }), /inferred signatureOrDeclaration exceeds 1000 UTF-8 bytes/);
});

test("projection v2 uses the authoritative symbol span over full-file source", () => {
    const projection = buildSearchRerankDocumentV2({
        relativePath: "src/worker.ts",
        language: "typescript",
        symbolKind: "function",
        canonicalSymbolLabel: "runWorker",
        symbolSpan: { startLine: 4, endLine: 6 },
        evidenceSpans: [{ startLine: 5, endLine: 5 }],
        content: [
            "const unrelated = true;",
            "function decoy() {}",
            "",
            "function runWorker() {",
            "  return queue.next();",
            "}",
        ].join("\n"),
        query: "queue next",
    });
    const parsed = JSON.parse(projection.text);

    assert.equal(parsed.signature_or_declaration, "function runWorker() {");
    assert.doesNotMatch(parsed.query_relevant_source_excerpt, /decoy/);
    assert.match(parsed.query_relevant_source_excerpt, /queue\.next/);
    assert.ok(projection.selectionAttemptCount <= 14);
});

test("projection v2 rejects noncanonical paths and evidence outside the owner span", () => {
    const base = {
        relativePath: "src/worker.ts",
        language: "typescript",
        symbolKind: "function",
        canonicalSymbolLabel: "runWorker",
        symbolSpan: { startLine: 1, endLine: 2 },
        content: "function runWorker() {\n  return true;\n}",
        query: "run worker",
    };
    for (const relativePath of ["./src/worker.ts", "src//worker.ts", "C:/worker.ts", "src\\worker.ts", "src/\0worker.ts"]) {
        assert.throws(
            () => buildSearchRerankDocumentV2({ ...base, relativePath }),
            /canonical repository-relative path/,
        );
    }
    assert.throws(() => buildSearchRerankDocumentV2({
        ...base,
        evidenceSpans: [{ startLine: 2, endLine: 3 }],
    }), /evidenceSpans\[0\].*contained by symbolSpan/);
});

test("projection v2 accepts bounded authoritative documentation and structural config declarations", () => {
    const projection = buildSearchRerankDocumentV2({
        relativePath: "config/service.toml",
        language: "toml",
        symbolKind: "file",
        canonicalSymbolLabel: "service.toml",
        symbolSpan: { startLine: 1, endLine: 3 },
        content: "# service configuration\n[worker]\nqueue = \"primary\"",
        documentationExcerpt: "Worker queue settings.\nAuthoritative deployment configuration.",
        query: "worker queue",
    });
    const parsed = JSON.parse(projection.text);

    assert.equal(parsed.signature_or_declaration, "[worker]");
    assert.match(parsed.documentation_excerpt, /Authoritative deployment/);
    assert.throws(() => buildSearchRerankDocumentV2({
        relativePath: "src/worker.ts",
        language: "typescript",
        symbolKind: "function",
        canonicalSymbolLabel: "runWorker",
        symbolSpan: { startLine: 1, endLine: 1 },
        content: "function runWorker() {}",
        documentationExcerpt: "x".repeat(1_001),
    }), /documentationExcerpt physical line exceeds 512 UTF-8 bytes/);
});
