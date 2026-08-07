import type { SearchAnswerFocus } from "./search-rerank-context.js";

export const SEARCH_RERANK_QUERY_PROJECTION_VERSION =
    "search_rerank_query_v1" as const;

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

export function buildSearchRerankQuery(input: {
    semanticQuery: string;
    answerFocus: SearchAnswerFocus;
}): string {
    const semanticQuery = input.semanticQuery.trim();
    if (semanticQuery.length === 0) {
        throw new Error("search rerank query requires a non-empty semantic query");
    }
    return [
        "Question:",
        semanticQuery,
        "",
        `Answer focus: ${input.answerFocus}`,
        "",
        "Guidance:",
        GUIDANCE[input.answerFocus],
    ].join("\n");
}
