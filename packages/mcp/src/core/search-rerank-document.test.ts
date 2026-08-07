import assert from "node:assert/strict";
import test from "node:test";
import {
    buildSearchRerankDocument,
    SEARCH_RERANK_DOCUMENT_PROJECTION_VERSION,
} from "./search-rerank-document.js";

test("buildSearchRerankDocument retains the production projection contract", () => {
    assert.equal(SEARCH_RERANK_DOCUMENT_PROJECTION_VERSION, "search_rerank_document_v1");
    assert.equal(
        buildSearchRerankDocument({
            relativePath: "src/search.ts",
            language: "typescript",
            symbolLabel: "function rankCandidates",
            content: "export function rankCandidates() {\n    return [];\n}",
        }),
        [
            "src/search.ts",
            "typescript",
            "function rankCandidates",
            "export function rankCandidates() {",
            "    return [];",
            "}",
        ].join("\n"),
    );
});

test("buildSearchRerankDocument carries no ranking or score state", () => {
    const document = buildSearchRerankDocument({
        relativePath: "src/search.ts",
        language: "typescript",
        symbolLabel: "function rankCandidates",
        content: "export function rankCandidates() {\n    return [];\n}",
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
        assert.ok(!document.includes(field), `document must not leak ${field}`);
    }
});
