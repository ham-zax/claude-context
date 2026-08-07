import assert from "node:assert/strict";
import test from "node:test";
import {
    buildSearchCandidateProvenance,
    classifyPathCategory,
    shouldIncludeCategoryInScope,
} from "./search-ranking-policy.js";

test("path classification remains an eligibility control, not a relevance score", () => {
    assert.equal(classifyPathCategory("src/core/search.ts"), "core");
    assert.equal(classifyPathCategory("tests/search.test.ts"), "tests");
    assert.equal(classifyPathCategory("docs/search.md"), "docs");
    assert.equal(shouldIncludeCategoryInScope("runtime", "docs"), false);
    assert.equal(shouldIncludeCategoryInScope("docs", "docs"), true);
});

test("candidate provenance reports retrieval and exact evidence without score policy", () => {
    const provenance = buildSearchCandidateProvenance({
        result: { relativePath: "src/search.ts" },
        exactMatchPinned: true,
        exactLexicalMatch: true,
        rerankAdjusted: true,
        retrievalPasses: ["expanded", "primary"],
        backendScoreKindsSeen: ["dense_similarity"],
    });

    assert.deepEqual(provenance, {
        retrievalPasses: ["expanded", "primary"],
        backendScoreKinds: ["dense_similarity"],
        semanticCandidate: true,
        lexicalCandidate: false,
        rerankAdjusted: true,
        exactMatchPinned: true,
        ownerRepairApplied: false,
    });
});
