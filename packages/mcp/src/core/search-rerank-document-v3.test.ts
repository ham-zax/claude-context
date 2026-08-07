import assert from "node:assert/strict";
import test from "node:test";
import type { SearchCandidateRole } from "./search-rerank-context.js";
import {
    SEARCH_RERANK_DOCUMENT_V2_POLICY,
    buildSearchRerankDocumentV2,
} from "./search-rerank-document-v2.js";
import {
    SEARCH_RERANK_DOCUMENT_V3_POLICY,
    buildSearchRerankDocumentV3,
} from "./search-rerank-document-v3.js";

const fixture = {
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
    documentationExcerpt: "Runs the next queued job.",
    requiredOwnerSiblings: [{
        relativePath: "src/queue.ts",
        canonicalSymbolLabel: "queue",
    }],
};

const ROLES: readonly SearchCandidateRole[] = [
    "implementation", "test", "documentation", "configuration",
    "generated", "fixture", "example", "unknown",
];

test("projection v3 shares v2 source selection and field algorithms exactly", () => {
    const v2 = buildSearchRerankDocumentV2(fixture);
    const v3 = buildSearchRerankDocumentV3({ ...fixture, candidateRole: "implementation" });
    const v2Parsed = JSON.parse(v2.text) as Record<string, unknown>;
    const v3Parsed = JSON.parse(v3.text) as Record<string, unknown>;

    for (const field of [
        "repository_relative_path",
        "language",
        "symbol_kind",
        "canonical_symbol_label",
        "signature_or_declaration",
        "documentation_excerpt",
        "query_relevant_source_excerpt",
        "required_owner_siblings",
    ]) {
        assert.deepEqual(v3Parsed[field], v2Parsed[field], `${field} must match v2`);
    }
});

test("projection v3 differs from v2 only by candidate_role", () => {
    const v2 = buildSearchRerankDocumentV2(fixture);
    const v3 = buildSearchRerankDocumentV3({ ...fixture, candidateRole: "test" });
    const v2Keys = Object.keys(JSON.parse(v2.text) as object).sort();
    const v3Keys = Object.keys(JSON.parse(v3.text) as object).sort();
    assert.deepEqual(v3Keys, [...v2Keys, "candidate_role"].sort());
    assert.equal(v2.text.includes("candidate_role"), false);
});

test("projection v3 stays within the 4000 UTF-8 byte ceiling", () => {
    const v3 = buildSearchRerankDocumentV3({ ...fixture, candidateRole: "implementation" });
    assert.equal(SEARCH_RERANK_DOCUMENT_V3_POLICY.maximumUtf8Bytes, 4_000);
    assert.equal(v3.utf8Bytes, Buffer.byteLength(v3.text, "utf8"));
    assert.ok(v3.utf8Bytes <= SEARCH_RERANK_DOCUMENT_V3_POLICY.maximumUtf8Bytes);
});

test("every candidate role serializes exactly in projection v3", () => {
    for (const role of ROLES) {
        const v3 = buildSearchRerankDocumentV3({ ...fixture, candidateRole: role });
        const parsed = JSON.parse(v3.text) as Record<string, unknown>;
        assert.equal(parsed.candidate_role, role);
    }
});

test("projection v2 canonical bytes remain unchanged by the v3 introduction", () => {
    assert.equal(SEARCH_RERANK_DOCUMENT_V2_POLICY.id, "search_rerank_document_v2");
    const v2 = buildSearchRerankDocumentV2(fixture);
    assert.equal(v2.version, SEARCH_RERANK_DOCUMENT_V2_POLICY.id);
    assert.equal(v2.text.includes("candidate_role"), false);
    const parsed = JSON.parse(v2.text) as Record<string, unknown>;
    assert.deepEqual(Object.keys(parsed), [...Object.keys(parsed)].sort());
});

test("projection v3 policy references v2 as its previous version", () => {
    assert.equal(SEARCH_RERANK_DOCUMENT_V3_POLICY.id, "search_rerank_document_v3");
    assert.equal(SEARCH_RERANK_DOCUMENT_V3_POLICY.previousVersion, SEARCH_RERANK_DOCUMENT_V2_POLICY.id);
    assert.equal(SEARCH_RERANK_DOCUMENT_V3_POLICY.serialization, "canonical_json_utf8");
});

test("projection v3 rejects a missing candidate role", () => {
    assert.throws(() => buildSearchRerankDocumentV3(fixture as unknown as Record<string, unknown>));
});
