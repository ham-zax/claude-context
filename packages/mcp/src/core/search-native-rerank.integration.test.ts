import assert from "node:assert/strict";
import test from "node:test";
import {
    RerankerRequestError,
    type Reranker,
    type RerankResult,
} from "@zokizuan/satori-core";
import type { CapabilityResolver } from "./capabilities.js";
import {
    runSearchExecution,
    type SearchDiagnostics,
    type SearchExecutionHost,
    type SearchExecutionInput,
} from "./search-execution.js";
import { SearchQuerySupport } from "./search-query-support.js";
import { buildSearchQueryPlan, parseSearchOperators } from "./search-query-planning.js";
import { SEARCH_RERANK_INPUT_MAX_UTF8_BYTES } from "./search-constants.js";
import { resolveSearchPolicy } from "./search-policy.js";

type FixtureCandidate = {
    candidateId: string;
    relativePath: string;
    startLine: number;
    endLine: number;
    language: string;
    content: string;
    score: number;
    symbolLabel: string;
};

function candidate(
    candidateId: string,
    relativePath: string,
    score: number,
    content = "export function implementation() { return true; }",
): FixtureCandidate {
    return {
        candidateId,
        relativePath,
        startLine: 1,
        endLine: 4,
        language: "typescript",
        content,
        score,
        symbolLabel: "function implementation()",
    };
}

function buildSupport(reranker: Reranker | null): SearchQuerySupport {
    return new SearchQuerySupport({
        normalizeSearchPath: (value) => value,
        hasPathSegment: () => false,
        isGeneratedPath: () => false,
        isTestPath: () => false,
        isFixturePath: () => false,
        isDocPath: () => false,
        getContextActiveIgnorePatterns: () => [],
        getContextTrackedRelativePaths: () => [],
        classifyPathCategory: () => "srcRuntime",
        shouldIncludeCategoryInScope: () => true,
        getSyncWatchDebounceMs: () => 0,
        capabilities: {
            hasReranker: () => reranker !== null,
            getDefaultRerankEnabled: () => reranker !== null,
        } as unknown as CapabilityResolver,
        runtimeFingerprint: {} as never,
        reranker,
        rootGitignoreMatcherCache: new Map(),
        gitignoreForceReloadEveryN: 25,
    });
}

function buildInput(
    query = "where find the relevant implementation",
    overrides: {
        limit?: number;
        queryPlan?: Partial<SearchExecutionInput["queryPlan"]>;
    } = {},
): SearchExecutionInput {
    const parsedOperators = parseSearchOperators(query);
    const baseQueryPlan = buildSearchQueryPlan(
        parsedOperators.semanticQuery,
        true,
        parsedOperators,
    );
    const queryPlan = {
        ...baseQueryPlan,
        ...(overrides.queryPlan || {}),
    };
    const limit = overrides.limit ?? 3;
    return {
        effectiveRoot: "/repo",
        scope: "runtime",
        rankingMode: "default",
        limit,
        debugMode: "none",
        semanticQuery: parsedOperators.semanticQuery,
        parsedOperators,
        queryPlan,
        exactRegistryEligible: false,
        exactRegistryFallbackForTrackedLexical: false,
        freshnessMode: "synced",
        observedChangedFilesState: { available: false, files: new Set() },
        retrievalPolicy: resolveSearchPolicy({
            resultLimit: limit,
            hasMustOperators: parsedOperators.must.length > 0,
        }),
    };
}

function buildHost(
    results: FixtureCandidate[],
    reranker: Reranker | null,
    options: {
        buildRerankDocument?: SearchExecutionHost["buildRerankDocument"];
    } = {},
): SearchExecutionHost {
    const support = buildSupport(reranker);
    return {
        searchQuerySupport: support,
        semanticSearch: async () => results,
        reranker,
        ...(options.buildRerankDocument
            ? { buildRerankDocument: options.buildRerankDocument }
            : {}),
        shouldForceSearchPassFailure: () => false,
        classifyEmbeddingProviderError: () => null,
        classifyVectorBackendError: () => null,
        measureSearchPhase: async (_phase, run) => run(),
    };
}

function buildReranker(
    buildResults: (documents: readonly string[], candidateIds: readonly string[]) => RerankResult[],
    onCall?: (documents: readonly string[], candidateIds: readonly string[]) => void,
): Reranker {
    return {
        getIdentity: () => ({ provider: "voyage", model: "test", profile: "native-order" }),
        rerank: async (_query, documents, options) => {
            const candidateIds = options?.identities || [];
            onCall?.(documents, candidateIds);
            return buildResults(documents, candidateIds);
        },
    };
}

async function run(
    input: SearchExecutionInput,
    host: SearchExecutionHost,
) {
    return runSearchExecution(input, host, {} as SearchDiagnostics);
}

function reverseResults(
    documents: readonly string[],
): RerankResult[] {
    return documents.map((_document, index) => ({
        index: documents.length - index - 1,
        relevanceScore: index / Math.max(1, documents.length),
    }));
}

test("production execution rejects every malformed provider response before fallback", async () => {
    const malformedResponses: Array<{ name: string; results: RerankResult[] }> = [
        {
            name: "cardinality",
            results: [{ index: 0, relevanceScore: 1 }],
        },
        {
            name: "duplicate index",
            results: [
                { index: 0, relevanceScore: 1 },
                { index: 0, relevanceScore: 0.5 },
                { index: 1, relevanceScore: 0.25 },
            ],
        },
        {
            name: "foreign index",
            results: [
                { index: 0, relevanceScore: 1 },
                { index: 1, relevanceScore: 0.5 },
                { index: 3, relevanceScore: 0.25 },
            ],
        },
        {
            name: "non-finite score",
            results: [
                { index: 0, relevanceScore: Number.NaN },
                { index: 1, relevanceScore: 0.5 },
                { index: 2, relevanceScore: Number.POSITIVE_INFINITY },
            ],
        },
    ];

    for (const malformed of malformedResponses) {
        const results = [
            candidate("a", "src/a.ts", 0.9),
            candidate("b", "src/b.ts", 0.8),
            candidate("c", "src/c.ts", 0.7),
        ];
        const outcome = await run(
            buildInput(),
            buildHost(results, buildReranker(() => malformed.results)),
        );

        assert.equal(outcome.kind, "ok", malformed.name);
        if (outcome.kind !== "ok") continue;
        assert.deepEqual(
            outcome.scored.map((entry) => entry.result.candidateId),
            ["a", "b", "c"],
            malformed.name,
        );
        assert.equal(outcome.orderAuthority, "retrieval_order", malformed.name);
        assert.equal(outcome.rerankerApplied, false, malformed.name);
        assert.equal(outcome.rerankerFailurePhase, "parse_results", malformed.name);
    }
});

test("filters are complete before native provider admission", async () => {
    const providerCandidateIds: string[][] = [];
    const reranker = buildReranker((documents) => reverseResults(documents), (_documents, candidateIds) => {
        providerCandidateIds.push([...candidateIds]);
    });
    const results = [
        candidate("allowed", "src/allowed.ts", 0.9),
        candidate("excluded", "src/secret.ts", 0.99),
        candidate("allowed-2", "src/allowed-2.ts", 0.8),
    ];
    const outcome = await run(
        buildInput("-path:src/secret.ts find the relevant implementation"),
        buildHost(results, reranker),
    );

    assert.equal(outcome.kind, "ok");
    if (outcome.kind !== "ok") return;
    assert.deepEqual(providerCandidateIds, [["allowed", "allowed-2"]]);
    assert.deepEqual(
        outcome.scored.map((entry) => entry.result.candidateId),
        ["allowed-2", "allowed"],
    );
});

test("native execution preserves an exact-owned prefix and reranks only its suffix", async () => {
    const providerCandidateIds: string[][] = [];
    const reranker = buildReranker((documents) => reverseResults(documents), (_documents, candidateIds) => {
        providerCandidateIds.push([...candidateIds]);
    });
    const results = [
        candidate("exact", "src/target.ts", 0.1, "export function target() {}"),
        candidate("tail-a", "src/a.ts", 0.9),
        candidate("tail-b", "src/b.ts", 0.8),
    ];
    const outcome = await run(
        buildInput("where is target implementation", {
            queryPlan: {
                exactMatchPinningEnabled: true,
                rerankAllowed: true,
            },
        }),
        buildHost(results, reranker),
    );

    assert.equal(outcome.kind, "ok");
    if (outcome.kind !== "ok") return;
    assert.deepEqual(providerCandidateIds, [["tail-a", "tail-b"]]);
    assert.deepEqual(
        outcome.scored.map((entry) => entry.result.candidateId),
        ["exact", "tail-b", "tail-a"],
    );
    assert.deepEqual(outcome.scored.map((entry) => entry.authoritativeRank), [1, 2, 3]);
});

test("provider capacity confines native permutation to admitted slots", async () => {
    const reranker = buildReranker((documents) => reverseResults(documents));
    reranker.getMaxDocuments = () => 2;
    const results = [
        candidate("a", "src/a.ts", 0.9),
        candidate("b", "src/b.ts", 0.8),
        candidate("c", "src/c.ts", 0.7),
        candidate("d", "src/d.ts", 0.6),
    ];
    const outcome = await run(buildInput(), buildHost(results, reranker));

    assert.equal(outcome.kind, "ok");
    if (outcome.kind !== "ok") return;
    assert.deepEqual(
        outcome.scored.map((entry) => entry.result.candidateId),
        ["b", "a", "c", "d"],
    );
});

test("projection failure falls back without calling the provider", async () => {
    let providerCalls = 0;
    const reranker = buildReranker(() => {
        providerCalls += 1;
        return [];
    });
    const results = [candidate("a", "src/a.ts", 0.9), candidate("b", "src/b.ts", 0.8)];
    const outcome = await run(
        buildInput(),
        buildHost(results, reranker, {
            buildRerankDocument: async () => undefined,
        }),
    );

    assert.equal(outcome.kind, "ok");
    if (outcome.kind !== "ok") return;
    assert.equal(providerCalls, 0);
    assert.equal(outcome.rerankerFailurePhase, "document_projection");
    assert.deepEqual(outcome.scored.map((entry) => entry.result.candidateId), ["a", "b"]);
});

test("zero-byte reranker admission falls back to the frozen retrieval order", async () => {
    let providerCalls = 0;
    const reranker = buildReranker(() => {
        providerCalls += 1;
        return [];
    });
    const results = [candidate("a", "src/a.ts", 0.9), candidate("b", "src/b.ts", 0.8)];
    const outcome = await run(
        buildInput(),
        buildHost(results, reranker, {
            buildRerankDocument: async () => "x".repeat(SEARCH_RERANK_INPUT_MAX_UTF8_BYTES + 1),
        }),
    );

    assert.equal(outcome.kind, "ok");
    if (outcome.kind !== "ok") return;
    assert.equal(providerCalls, 0);
    assert.equal(outcome.rerankerAttempted, false);
    assert.equal(outcome.rerankerApplied, false);
    assert.deepEqual(outcome.scored.map((entry) => entry.result.candidateId), ["a", "b"]);
});

test("provider timeout restores the frozen retrieval order", async () => {
    const reranker = buildReranker(() => {
        throw new RerankerRequestError(
            "timeout",
            null,
            2,
            "reranker request timed out",
        );
    });
    const results = [
        candidate("a", "src/a.ts", 0.9),
        candidate("b", "src/b.ts", 0.8),
        candidate("c", "src/c.ts", 0.7),
    ];
    const outcome = await run(buildInput(), buildHost(results, reranker));

    assert.equal(outcome.kind, "ok");
    if (outcome.kind !== "ok") return;
    assert.equal(outcome.rerankerFailurePhase, "api_call");
    assert.equal(outcome.rerankerFailureKind, "timeout");
    assert.equal(outcome.rerankerApplied, false);
    assert.deepEqual(
        outcome.scored.map((entry) => entry.result.candidateId),
        ["a", "b", "c"],
    );
});
