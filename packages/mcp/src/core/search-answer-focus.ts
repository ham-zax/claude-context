import type { SearchQueryPlan } from "./search-lexical-scoring.js";
import type { SearchAnswerFocus } from "./search-rerank-context.js";
export type { SearchAnswerFocus } from "./search-rerank-context.js";

export type SearchAnswerFocusResolution = Readonly<{
    focus: SearchAnswerFocus;
    reasons: readonly string[];
}>;

const IMPLEMENTATION_QUESTION_CUE = /\bhow\s+(?:does|do|is|are)\b|\bwhere\s+is\b.*\bimplemented\b|\bwhat\s+(?:blocks|prevents|validates|gates|controls)\b/;

export function resolveSearchAnswerFocus(
    plan: SearchQueryPlan,
): SearchAnswerFocusResolution {
    if (plan.testSeeking) {
        return { focus: "tests", reasons: ["test_seeking_query"] };
    }
    if (plan.documentationSeeking) {
        return { focus: "documentation", reasons: ["documentation_seeking_query"] };
    }
    if (plan.route.kind === "configuration") {
        return { focus: "configuration", reasons: ["configuration_route"] };
    }
    if (plan.route.kind === "references") {
        return { focus: "references", reasons: ["reference_route"] };
    }
    if (plan.referenceSeeking) {
        return { focus: "references", reasons: ["reference_seeking_query"] };
    }
    if (plan.implementationSeeking) {
        return { focus: "implementation", reasons: ["implementation_seeking_query"] };
    }
    if (IMPLEMENTATION_QUESTION_CUE.test(plan.semanticQuery.toLowerCase())) {
        return { focus: "implementation", reasons: ["implementation_question_cue"] };
    }
    return { focus: "neutral", reasons: ["no_focus_signal"] };
}
