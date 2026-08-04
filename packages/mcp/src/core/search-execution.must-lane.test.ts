import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchOperators, buildSearchQueryPlan } from './search-query-planning.js';
import { resolveSearchPolicy } from './search-policy.js';
import {
    runSearchExecution,
    type SearchExecutionHost,
    type SearchExecutionInput,
    type SearchDiagnostics,
} from './search-execution.js';
import { SearchQuerySupport } from './search-query-support.js';
import type { CapabilityResolver } from './capabilities.js';

type MockResult = {
    relativePath: string;
    startLine: number;
    endLine: number;
    language: string;
    content: string;
    score: number;
};

const result = (overrides: Partial<MockResult>): MockResult => ({
    relativePath: 'src/service.ts',
    startLine: 1,
    endLine: 2,
    language: 'typescript',
    content: 'export function placeholder() { return 1; }',
    score: 0.9,
    ...overrides,
});

function buildSupport() {
    return new SearchQuerySupport({
        normalizeSearchPath: (p: string) => p,
        hasPathSegment: () => false,
        isGeneratedPath: () => false,
        isTestPath: () => false,
        isFixturePath: () => false,
        isDocPath: () => false,
        getContextActiveIgnorePatterns: () => [],
        getContextTrackedRelativePaths: () => [],
        classifyPathCategory: () => 'core',
        shouldIncludeCategoryInScope: () => true,
        getSyncWatchDebounceMs: () => 0,
        capabilities: {
            hasReranker: () => false,
            getDefaultRerankEnabled: () => false,
        } as unknown as CapabilityResolver,
        runtimeFingerprint: {} as never,
        reranker: null,
        rootGitignoreMatcherCache: new Map(),
        gitignoreForceReloadEveryN: 1000,
    });
}

function buildInput(overrides: Partial<SearchExecutionInput> = {}): SearchExecutionInput {
    const parsed = parseSearchOperators('must:tzinfo must:None where is naive utc handling');
    const base: SearchExecutionInput = {
        effectiveRoot: '/repo',
        scope: 'runtime',
        rankingMode: 'auto_changed_first',
        limit: 10,
        debugMode: 'none',
        semanticQuery: parsed.semanticQuery,
        parsedOperators: parsed,
        queryPlan: buildSearchQueryPlan(parsed.semanticQuery, true, parsed),
        exactRegistryEligible: false,
        exactRegistryFallbackForTrackedLexical: false,
        freshnessMode: 'synced',
        observedChangedFilesState: { available: false, files: new Set() },
        retrievalPolicy: resolveSearchPolicy({
            resultLimit: 10,
            hasMustOperators: parsed.must.length > 0,
        }),
    };
    return { ...base, ...overrides };
}

function buildHost(primaryResults: MockResult[], laneResults: MockResult[]) {
    const semanticSearchCalls: Array<{
        query: string;
        topK: number;
        retrievalMode: string;
    }> = [];
    const host: SearchExecutionHost = {
        searchQuerySupport: buildSupport(),
        semanticSearch: async (request) => {
            semanticSearchCalls.push({
                query: request.query,
                topK: request.topK,
                retrievalMode: request.retrievalMode,
            });
            const isLaneCall = request.retrievalMode === 'lexical'
                && request.topK === 80
                && request.query === 'tzinfo None';
            return isLaneCall ? laneResults : primaryResults;
        },
        reranker: null,
        shouldForceSearchPassFailure: () => false,
        classifyEmbeddingProviderError: () => null,
        classifyVectorBackendError: () => null,
        measureSearchPhase: async (_phase, run) => run(),
    };
    return { host, semanticSearchCalls };
}

async function run(input: SearchExecutionInput, host: SearchExecutionHost) {
    return runSearchExecution(input, host, {} as SearchDiagnostics);
}

test('must: lane recovers a match outside the normal top-N lexical pool', async () => {
    // The only file containing every must token is absent from the primary
    // lexical pool and appears only in the dedicated must: lane results.
    const primary = [
        result({ relativePath: 'src/a.ts', content: 'export function first() {}' }),
        result({ relativePath: 'src/b.ts', content: 'export function second() {}' }),
    ];
    const laneMatch = result({
        relativePath: 'src/rules/veto.ts',
        content: 'export function veto() { const local = tzinfo; local.replace(None); }',
    });
    const { host, semanticSearchCalls } = buildHost(primary, [laneMatch]);
    const outcome = await run(buildInput(), host);

    assert.equal(outcome.kind, 'ok');
    const paths = outcome.scored.map((candidate) => candidate.result.relativePath);
    assert.equal(paths.includes('src/rules/veto.ts'), true, 'must: lane match must be recovered');
    assert.equal(outcome.searchWarnings.includes('MUST_NOT_SATISFIED_WITHIN_RETRIEVAL_BUDGET'), false);

    const laneCall = semanticSearchCalls.find((call) => call.query === 'tzinfo None');
    assert.equal(laneCall !== undefined, true, 'dedicated must: lane must query the lexical projection');
    assert.equal(laneCall?.topK, 80, 'lane must use the operator-constraint candidate maximum as its hard budget');
    assert.equal(laneCall?.retrievalMode, 'lexical');

    assert.equal(outcome.mustConstraintRetrievalOutcome?.attempted, true);
    assert.equal(outcome.mustConstraintRetrievalOutcome?.candidatesExamined, 1);
    assert.equal(outcome.mustConstraintRetrievalOutcome?.candidateBudget, 80);
    assert.equal(outcome.mustConstraintRetrievalOutcome?.budgetExhausted, false);
    assert.deepEqual(outcome.mustConstraintMustTokens, ['tzinfo', 'None']);
});

test('must: lane produces the explicit note when no candidate satisfies an absent phrase', async () => {
    const { host } = buildHost(
        [result({ relativePath: 'src/a.ts', content: 'export function first() {}' })],
        [result({ relativePath: 'src/b.ts', content: 'unrelated content without the tokens' })],
    );
    const outcome = await run(buildInput(), host);

    assert.equal(outcome.kind, 'ok');
    assert.equal(outcome.scored.length, 0);
    assert.equal(
        outcome.searchWarnings.includes('MUST_NOT_SATISFIED_WITHIN_RETRIEVAL_BUDGET'),
        true,
        'absent phrase must produce the explicit budget note',
    );
    assert.equal(outcome.searchWarnings.includes('FILTER_MUST_UNSATISFIED'), true);
    assert.equal(outcome.mustConstraintRetrievalOutcome?.budgetExhausted, false);
});

test('must: lane reports incomplete results when its budget is exhausted before the result count is filled', async () => {
    const primary = [
        result({ relativePath: 'src/a.ts', content: 'export function first() {}' }),
        result({ relativePath: 'src/b.ts', content: 'export function second() {}' }),
    ];
    // The lane returns a full budget page (80 candidates), but only two of
    // them contain every must token: partial recovery with an exhausted budget.
    const laneMatches = Array.from({ length: 80 }, (_, index) => (
        index < 2
            ? result({
                relativePath: `src/lane/${index}.ts`,
                content: `export function lane${index}() { const x = tzinfo; x.replace(None); }`,
            })
            : result({
                relativePath: `src/lane/${index}.ts`,
                content: `export function lane${index}() { return ${index}; }`,
            })
    ));
    const { host } = buildHost(primary, laneMatches);
    const input = buildInput({
        limit: 5,
        retrievalPolicy: resolveSearchPolicy({ resultLimit: 5, hasMustOperators: true }),
    });
    const outcome = await run(input, host);

    assert.equal(outcome.kind, 'ok');
    assert.equal(outcome.scored.length > 0, true);
    assert.equal(outcome.scored.length < 5, true);
    assert.equal(outcome.mustConstraintRetrievalOutcome?.budgetExhausted, true);
    assert.equal(
        outcome.searchWarnings.includes('MUST_RESULTS_MAY_BE_INCOMPLETE_WITHIN_RETRIEVAL_BUDGET'),
        true,
        'exhausted lane budget before the requested count must produce the incomplete-results note',
    );
    assert.equal(outcome.searchWarnings.includes('MUST_NOT_SATISFIED_WITHIN_RETRIEVAL_BUDGET'), false);
});

test('queries without must: produce no extra lexical call and unchanged ranked candidates', async () => {
    const parsed = parseSearchOperators('where is naive utc handling');
    const input = buildInput({
        semanticQuery: parsed.semanticQuery,
        parsedOperators: parsed,
        queryPlan: buildSearchQueryPlan(parsed.semanticQuery, true, parsed),
        retrievalPolicy: resolveSearchPolicy({ resultLimit: 10, hasMustOperators: false }),
    });
    const primary = [
        result({ relativePath: 'src/a.ts', content: 'utc handling' }),
        result({ relativePath: 'src/b.ts', content: 'naive utc' }),
        result({ relativePath: 'src/c.ts', content: 'time utils' }),
        result({ relativePath: 'src/d.ts', content: 'helper functions' }),
        result({ relativePath: 'src/e.ts', content: 'more helpers' }),
    ];
    const first = buildHost(primary, []);
    const firstOutcome = await run(input, first.host);
    const second = buildHost(primary, []);
    const secondOutcome = await run(input, second.host);

    assert.equal(firstOutcome.kind, 'ok');
    assert.equal(first.host.searchQuerySupport !== undefined, true);
    const laneCalls = first.semanticSearchCalls.filter((call) => call.query === 'tzinfo None');
    assert.equal(laneCalls.length, 0, 'no must: means no dedicated lane call');
    assert.equal(first.semanticSearchCalls.length, 1, 'only the primary pass runs for an unconstrained query');
    assert.equal(second.semanticSearchCalls.length, 1);

    const identityOf = (outcome: Awaited<ReturnType<typeof run>>) => outcome.kind === 'ok'
        ? outcome.scored.map((candidate) => (
            `${candidate.result.relativePath}:${candidate.result.startLine}:${candidate.result.endLine}`
        ))
        : [];
    assert.deepEqual(identityOf(firstOutcome), identityOf(secondOutcome));
    assert.equal(firstOutcome.kind === 'ok' && firstOutcome.searchWarnings.length, 0);
});
