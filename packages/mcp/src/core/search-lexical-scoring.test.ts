import test from "node:test";
import assert from "node:assert/strict";
import {
    detectSearchExactLexicalEvidence,
    detectSearchLexicalEvidence,
} from "./search-lexical-scoring.js";
import { buildSearchQueryPlan, parseSearchOperators } from "./search-query-planning.js";

function planFor(query: string) {
    const parsed = parseSearchOperators(query);
    return buildSearchQueryPlan(parsed.semanticQuery, true, parsed);
}

test("exact lexical evidence identifies a whole symbol term", () => {
    const plan = planFor("HurstGateState");
    const evidence = detectSearchExactLexicalEvidence(plan, {
        relativePath: "src/state.ts",
        symbolLabel: "type HurstGateState",
        content: "export type HurstGateState = 'open' | 'blocked';",
    });

    assert.equal(evidence.exactLexicalMatch, true);
    assert.equal(evidence.matchedWholeTerms.includes("hurstgatestate"), true);
    assert.deepEqual(evidence.matchedQuotedPhrases, []);
});

test("exact lexical evidence identifies path-segment and quoted-content matches", () => {
    const pathPlan = planFor("search-execution.ts");
    const pathEvidence = detectSearchExactLexicalEvidence(pathPlan, {
        relativePath: "packages/mcp/src/core/search-execution.ts",
        content: "export function runSearchExecution() {}",
    });
    assert.equal(pathEvidence.exactLexicalMatch, true);

    const phrasePlan = planFor('"replace(tzinfo=None)"');
    const phraseEvidence = detectSearchExactLexicalEvidence(phrasePlan, {
        relativePath: "src/time.ts",
        content: "return replace(tzinfo=None);",
    });
    assert.equal(phraseEvidence.exactLexicalMatch, true);
    assert.deepEqual(phraseEvidence.matchedQuotedPhrases, ["replace(tzinfo=none)"]);
});

test("fragment-only evidence is retrieval evidence but not an exact owner", () => {
    const plan = planFor("gate");
    const fragmentPlan = {
        ...plan,
        lexicalTerms: [{ value: "gate", kind: "fragment" as const }],
    };
    const evidence = detectSearchLexicalEvidence(fragmentPlan, {
        relativePath: "src/regime_gate.ts",
        symbolLabel: "function checkRegimeGate()",
        content: "return true;",
    });

    assert.equal(evidence.hasLexicalEvidence, true);
    assert.equal(evidence.exactLexicalMatch, false);
    assert.deepEqual(evidence.matchedWholeTerms, []);
});

test("reference declaration evidence is not promoted to an exact owner", () => {
    const plan = planFor("where is HurstGateState used");
    const evidence = detectSearchLexicalEvidence(plan, {
        relativePath: "src/state.ts",
        symbolLabel: "type HurstGateState",
        content: "export type HurstGateState = 'open' | 'blocked';",
    });

    assert.equal(evidence.hasLexicalEvidence, true);
    assert.equal(evidence.exactLexicalMatch, false);
    assert.equal(evidence.matchedWholeTerms.includes("hurstgatestate"), true);
});

test("a sibling structural anchor is not treated as an exact lexical match", () => {
    const plan = planFor("search_12");
    const evidence = detectSearchExactLexicalEvidence(plan, {
        relativePath: "src/search_13.ts",
        symbolLabel: "function search_13()",
        content: "return search_13();",
    });

    assert.equal(evidence.exactLexicalMatch, false);
    assert.deepEqual(evidence.matchedWholeTerms, []);
    assert.deepEqual(evidence.matchedQuotedPhrases, []);
});
