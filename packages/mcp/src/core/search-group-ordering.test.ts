import test from "node:test";
import assert from "node:assert/strict";
import {
    collapseDuplicateDeclarationGroups,
    sortNativeGroupedSearchResults,
} from "./search-group-ordering.js";
import type { SearchGroupResult } from "./search-types.js";

type Sortable = SearchGroupResult & { __exactLexicalMatch: boolean };
type GroupInput = Partial<SearchGroupResult> & {
    file: string;
    displayLabel: string;
    score: number;
    span?: { startLine: number; endLine: number };
    symbolId?: string;
};

function group(partial: GroupInput): Sortable {
    const span = partial.span || { startLine: 1, endLine: 10 };
    return {
        target: {
            file: partial.file,
            span,
            ...(partial.symbolId ? { symbolId: partial.symbolId } : {}),
        },
        displayLabel: partial.displayLabel,
        language: partial.language || "typescript",
        symbolKind: partial.symbolKind,
        score: partial.score,
        quality: { owner: "medium", semantic: "medium" },
        preview: partial.preview || partial.displayLabel,
        navigation: { graph: "missing_symbol" },
        __groupId: partial.__groupId || `grp_${partial.file}_${partial.displayLabel}`,
        __candidateIds: partial.__candidateIds || [`candidate_${partial.file}_${span.startLine}_${span.endLine}`],
        ...(partial.__symbolKey ? { __symbolKey: partial.__symbolKey } : {}),
        ...(partial.__symbolInstanceId ? { __symbolInstanceId: partial.__symbolInstanceId } : {}),
        __exactLexicalMatch: partial.__exactLexicalMatch || false,
        ...(partial.__authoritativeRank !== undefined
            ? { __authoritativeRank: partial.__authoritativeRank }
            : {}),
    };
}

test("native grouped ordering follows authoritative rank instead of score", () => {
    const results: Sortable[] = [
        group({
            file: "score-first.ts",
            displayLabel: "class ScoreFirst",
            symbolKind: "class",
            score: 0.99,
            __authoritativeRank: 4,
        }),
        group({
            file: "provider-first.ts",
            displayLabel: "function ProviderFirst()",
            symbolKind: "function",
            score: 0.10,
            __authoritativeRank: 1,
        }),
    ];

    sortNativeGroupedSearchResults(results, false);
    assert.deepEqual(results.map((result) => result.target.file), [
        "provider-first.ts",
        "score-first.ts",
    ]);
});

test("exact ownership remains a deterministic grouped control", () => {
    const results: Sortable[] = [
        group({
            file: "ordinary.ts",
            displayLabel: "function ordinary()",
            score: 0.99,
            __authoritativeRank: 1,
        }),
        group({
            file: "exact.ts",
            displayLabel: "function Exact()",
            score: 0.01,
            __authoritativeRank: 2,
            __exactLexicalMatch: true,
        }),
    ];

    const applied = sortNativeGroupedSearchResults(results, true);
    assert.equal(applied, true);
    assert.equal(results[0].target.file, "exact.ts");
});

test("native duplicate declaration collapse keeps the earliest authoritative group", () => {
    const groups = [
        group({
            file: "a.ts",
            displayLabel: "function foo()",
            symbolKind: "function",
            __symbolKey: "k1",
            score: 0.99,
            __authoritativeRank: 8,
        }),
        group({
            file: "a.ts",
            displayLabel: "function foo()",
            symbolKind: "function",
            __symbolKey: "k1",
            score: 0.01,
            __authoritativeRank: 2,
        }),
    ];

    const collapsed = collapseDuplicateDeclarationGroups(groups, "reranker_order");
    assert.equal(collapsed.length, 1);
    assert.equal(collapsed[0].__authoritativeRank, 2);
});
