import test from "node:test";
import assert from "node:assert/strict";
import {
    SEARCH_RERANK_QUERY_PROJECTION_VERSION,
    buildSearchRerankQuery,
} from "./search-rerank-query.js";
import type { SearchAnswerFocus } from "./search-answer-focus.js";

const GUIDANCE: Record<SearchAnswerFocus, string> = {
    implementation:
        "Rank the production mechanism and its integration path first. Tests and documentation are supporting evidence unless they are the clearest direct answer.",
    tests:
        "Rank tests that directly prove the requested behavior first. Production code may be supporting context.",
    documentation:
        "Rank documentation that directly explains the requested topic first. Code may be supporting context.",
    configuration:
        "Rank active configuration declarations and the code that loads or applies them first.",
    references:
        "Rank direct callers, callees, references, and integration sites that answer the relationship question first.",
    neutral:
        "Rank the candidate that most directly answers the question. Candidate role is evidence, not a fixed preference.",
};

const QUESTION = "how does Shariah compliance checking block trades";

test("rerank query preserves the exact question exactly once", () => {
    const projection = buildSearchRerankQuery({
        semanticQuery: QUESTION,
        answerFocus: "implementation",
    });
    const occurrences = projection.split(QUESTION).length - 1;
    assert.equal(occurrences, 1);
    assert.ok(projection.startsWith(`Question:\n${QUESTION}\n`));
});

test("rerank query trims the question but does not otherwise rewrite it", () => {
    const projection = buildSearchRerankQuery({
        semanticQuery: `  ${QUESTION}  `,
        answerFocus: "implementation",
    });
    assert.ok(projection.includes(`Question:\n${QUESTION}\n`));
    assert.equal(projection.includes("Question:\n  "), false);
});

test("rerank query line endings are stable LF", () => {
    for (const focus of Object.keys(GUIDANCE) as SearchAnswerFocus[]) {
        const projection = buildSearchRerankQuery({
            semanticQuery: QUESTION,
            answerFocus: focus,
        });
        assert.equal(projection.includes("\r"), false);
        assert.deepEqual(projection.split("\n"), [
            "Question:",
            QUESTION,
            "",
            `Answer focus: ${focus}`,
            "",
            "Guidance:",
            GUIDANCE[focus],
        ]);
    }
});

test("every focus emits its exact fixed guidance", () => {
    for (const [focus, guidance] of Object.entries(GUIDANCE)) {
        const projection = buildSearchRerankQuery({
            semanticQuery: QUESTION,
            answerFocus: focus as SearchAnswerFocus,
        });
        assert.ok(projection.endsWith(`Guidance:\n${guidance}`));
    }
});

test("rerank query carries no scope expansion, paths, roles, scores, or provider identity", () => {
    for (const focus of Object.keys(GUIDANCE) as SearchAnswerFocus[]) {
        const projection = buildSearchRerankQuery({
            semanticQuery: "who calls validate_order",
            answerFocus: focus,
        });
        assert.equal(projection.includes("implementation runtime source entrypoint"), false);
        assert.equal(/[\\/]src[\\/]/.test(projection), false);
        assert.equal(/candidate[_ ]role/i.test(projection.replace("Candidate role is evidence", "")), false);
        assert.equal(/score|0\.\d+/.test(projection), false);
        assert.equal(/provider|voyage|lateon/i.test(projection), false);
    }
});

test("rerank query rejects an empty trimmed question", () => {
    assert.throws(() => buildSearchRerankQuery({
        semanticQuery: "   ",
        answerFocus: "neutral",
    }));
});

test("rerank query projection identity is stable", () => {
    assert.equal(SEARCH_RERANK_QUERY_PROJECTION_VERSION, "search_rerank_query_v1");
});
