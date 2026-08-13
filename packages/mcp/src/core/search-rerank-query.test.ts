import assert from "node:assert/strict";
import test from "node:test";
import {
    SEARCH_RERANK_QUERY_PROJECTION_IDENTITY,
    buildSearchRerankQuery,
} from "./search-rerank-query.js";
import type { SearchAnswerFocus } from "./search-rerank-context.js";

const QUESTION = "how does Shariah compliance checking block trades";

const FORBIDDEN_COMPETING_ROLE_WORDS = [
    "test",
    "tests",
    "documentation",
    "supporting",
    "score",
];

test("implementation focus query is positive-only and byte-exact", () => {
    const query = buildSearchRerankQuery({
        semanticQuery: QUESTION,
        answerFocus: "implementation",
    });
    assert.equal(
        query,
        "Question:\n"
        + QUESTION
        + "\n\n"
        + "Requested answer type:\n"
        + "production implementation, control flow, and integration path",
    );
    for (const word of FORBIDDEN_COMPETING_ROLE_WORDS) {
        assert.equal(query.toLowerCase().includes(word), false, `implementation query must not contain '${word}'`);
    }
    assert.equal(/[0-9]/.test(query), false, "query must not contain numeric values");
    assert.equal(/\//.test(query), false, "query must not contain paths");
    assert.equal(query.includes(".ts"), false, "query must not contain file extensions");
    assert.equal(/lateon|voyage|openai|provider/i.test(query), false, "query must not name providers");
});

test("every answer focus query follows the positive-only Question/Requested answer type shape", () => {
    const expectedDescriptions: Record<SearchAnswerFocus, string> = {
        implementation: "production implementation, control flow, and integration path",
        tests: "tests that directly verify the requested behavior",
        documentation: "documentation that directly explains the requested topic",
        configuration: "active configuration declarations and the code that applies them",
        references: "direct callers, callees, references, and integration sites",
        neutral: "the most direct answer to the question",
    };
    for (const focus of Object.keys(expectedDescriptions) as SearchAnswerFocus[]) {
        const query = buildSearchRerankQuery({ semanticQuery: QUESTION, answerFocus: focus });
        assert.equal(
            query,
            ["Question:", QUESTION, "", "Requested answer type:", expectedDescriptions[focus]].join("\n"),
            focus,
        );
        assert.equal(query.includes("Guidance:"), false, `${focus} must not carry v1 guidance`);
        assert.equal(query.includes(`Answer focus: ${focus}`), false, `${focus} must not carry the v1 focus label`);
    }
});

test("query projection identity is the canonical search_rerank_query_v2 string", () => {
    assert.equal(SEARCH_RERANK_QUERY_PROJECTION_IDENTITY, "search_rerank_query_v2");
});

test("query requires a non-empty semantic query", () => {
    assert.throws(
        () => buildSearchRerankQuery({ semanticQuery: "   ", answerFocus: "neutral" }),
        /non-empty semantic query/,
    );
});
