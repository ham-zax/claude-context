import type { SearchCandidateRole } from "./search-rerank-context.js";
import {
    classifyPathCategory,
    isConfigurationPath,
    isDocPath,
    isFixturePath,
    isGeneratedPath,
    isTestPath,
    normalizeSearchPath,
} from "./search-ranking-policy.js";
export type { SearchCandidateRole } from "./search-rerank-context.js";

const CONFIGURATION_LANGUAGES = new Set([
    "json", "jsonc", "yaml", "toml", "ini", "xml", "properties", "dockerfile",
]);

const IMPLEMENTATION_CATEGORIES = new Set<string>([
    "core", "srcRuntime", "scriptRuntime", "adapter", "entrypoint", "neutral",
]);

export function resolveSearchCandidateRole(input: {
    relativePath: string;
    language?: string;
    symbolKind?: string;
}): SearchCandidateRole {
    const normalized = normalizeSearchPath(input.relativePath);
    if (isTestPath(normalized)) return "test";
    if (isDocPath(normalized)) return "documentation";
    if (isGeneratedPath(normalized)) return "generated";
    if (isFixturePath(normalized)) return "fixture";
    const category = classifyPathCategory(input.relativePath);
    if (category === "example") return "example";
    const language = input.language?.toLowerCase();
    if (
        isConfigurationPath(normalized)
        || (language !== undefined && CONFIGURATION_LANGUAGES.has(language))
        || input.symbolKind === "config"
    ) {
        return "configuration";
    }
    if (IMPLEMENTATION_CATEGORIES.has(category)) return "implementation";
    return "unknown";
}
