import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchOperators, buildSearchQueryPlan } from './search-query-planning.js';
import { resolveSearchPolicy } from './search-policy.js';
import {
    runSearchExecution,
    type BaselineAdmissionSnapshotV1,
    type RankingEvidenceHooksV1,
    type SearchExecutionHost,
    type SearchExecutionInput,
} from './search-execution.js';
import type { SearchDiagnostics } from './search-types.js';
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
    const parsed = parseSearchOperators('where is naive utc handling');
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

function buildHost(primaryResults: MockResult[], rerankerEnabled: boolean) {
    const host: SearchExecutionHost = {
        searchQuerySupport: buildSupport(),
        semanticSearch: async () => primaryResults,
        reranker: rerankerEnabled
            ? {
                getIdentity: () => ({
                    provider: 'test',
                    model: 'test-v1',
                    profile: 'test',
                }),
                rerank: async (_query, documents) => documents.map((_, index) => ({
                    index,
                    relevanceScore: 1 - index * 0.01,
                    configuredRank: index,
                })),
            }
            : null,
        shouldForceSearchPassFailure: () => false,
        classifyEmbeddingProviderError: () => null,
        classifyVectorBackendError: () => null,
        measureSearchPhase: async (_phase, run) => run(),
    };
    return host;
}

async function run(input: SearchExecutionInput, host: SearchExecutionHost) {
    return runSearchExecution(input, host, {} as SearchDiagnostics);
}

test('evidence_hooks_preserve_baseline_enabled_and_disabled_envelopes', async () => {
    const primary = [
        result({ relativePath: 'src/a.ts', content: 'export function first() {}' }),
        result({ relativePath: 'src/b.ts', content: 'export function second() {}' }),
        result({ relativePath: 'src/c.ts', content: 'export function third() {}' }),
    ];

    for (const rerankerEnabled of [false, true]) {
        // Baseline run: no hooks.
        const baselineOutcome = await run(
            buildInput(),
            buildHost(primary, rerankerEnabled),
        );

        // Hooked run: advisory hooks record the admission snapshot.
        const snapshots: BaselineAdmissionSnapshotV1[] = [];
        const hooks: RankingEvidenceHooksV1 = {
            onBaselineAdmissionSnapshot: (snapshot) => snapshots.push(snapshot),
        };
        const hookedOutcome = await run(
            buildInput({ evidenceHooks: hooks }),
            buildHost(primary, rerankerEnabled),
        );

        // Envelope bytes are identical with and without hooks.
        assert.deepEqual(hookedOutcome, baselineOutcome, `rerankerEnabled=${rerankerEnabled} envelope must be byte-identical`);

        // The hook fired exactly once with the frozen post-admission order.
        assert.equal(snapshots.length, 1);
        const snapshot = snapshots[0];
        assert.equal(snapshot.queryId, 'where is naive utc handling');
        assert.deepEqual(
            snapshot.candidates.map((candidate) => candidate.admissionRank),
            snapshot.candidates.map((_, index) => index + 1),
            'admission ranks are 1-based contiguous',
        );
        assert.equal(
            new Set(snapshot.candidates.map((candidate) => candidate.candidateId)).size,
            snapshot.candidates.length,
            'admission snapshot has no duplicate candidate identities',
        );
        assert.equal(
            snapshot.candidates.every((candidate) => Number.isFinite(candidate.baselineScore)),
            true,
        );
    }
});
