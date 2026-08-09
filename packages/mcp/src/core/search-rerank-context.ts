export type SearchAnswerFocus =
    | "implementation"
    | "tests"
    | "documentation"
    | "configuration"
    | "references"
    | "neutral";

export const SEARCH_CANDIDATE_ROLES = [
    "implementation",
    "test",
    "documentation",
    "configuration",
    "generated",
    "fixture",
    "example",
    "unknown",
] as const;

export type SearchCandidateRole = typeof SEARCH_CANDIDATE_ROLES[number];

const SEARCH_CANDIDATE_ROLE_SET = new Set<string>(SEARCH_CANDIDATE_ROLES);

export function isSearchCandidateRole(value: unknown): value is SearchCandidateRole {
    return typeof value === "string" && SEARCH_CANDIDATE_ROLE_SET.has(value);
}
