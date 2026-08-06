import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSearchOperators, buildSearchQueryPlan } from './search-query-planning.js';
import { resolveSearchPolicy } from './search-policy.js';
import {
    deliverSearchExecutionRankingV3Evidence,
    runSearchExecution,
    type SearchExecutionHost,
    type SearchExecutionInput,
    type SearchDiagnostics,
} from './search-execution.js';
import { SearchQuerySupport } from './search-query-support.js';
import type { CapabilityResolver } from './capabilities.js';
import { searchCandidateIdentity } from './search-candidate-survival.js';
import { RANKING_FEATURE_ORDER_V1 } from './ranking-features-v1.js';
import type { RawValidatedRerankEvidenceV1 } from './search-rerank-evidence-retention.js';
import type { SearchRankingEvidenceRecordV1 } from './search-ranking-evidence-assembler.js';
import type { SearchPassEvidenceV1 } from './search-pass-evidence.js';

const outcome = { kind: 'ok', scored: [{ id: 'a' }], warnings: [] } as const;
const envelope = {
    schemaVersion: 'search_execution_ranking_v3_evidence_v1',
    mode: 'enabled',
    admittedCandidateIds: ['a'],
    semanticPasses: [],
    passEvidence: [],
    rawRerankEvidence: null,
    assembledRecords: [],
} as const;

test('evidence_hooks_preserve_baseline_enabled_and_disabled_envelopes', () => {
    const baselineBytes = JSON.stringify(outcome);
    const delivered: unknown[] = [];
    const enabled = deliverSearchExecutionRankingV3Evidence(outcome, envelope, (value) => delivered.push(value));
    const disabled = deliverSearchExecutionRankingV3Evidence(outcome, { ...envelope, mode: 'disabled' }, (value) => delivered.push(value));
    assert.equal(enabled, outcome);
    assert.equal(disabled, outcome);
    assert.equal(JSON.stringify(enabled), baselineBytes);
    assert.equal(JSON.stringify(disabled), baselineBytes);
    assert.deepEqual(delivered.map((value) => (value as { mode: string }).mode), ['enabled', 'disabled']);
});

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

function buildSupport(options: {
    reranker?: SearchExecutionHost['reranker'];
} = {}) {
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
            hasReranker: () => Boolean(options.reranker),
            getDefaultRerankEnabled: () => Boolean(options.reranker),
        } as unknown as CapabilityResolver,
        runtimeFingerprint: {} as never,
        reranker: options.reranker ?? null,
        rootGitignoreMatcherCache: new Map(),
        gitignoreForceReloadEveryN: 1000,
    });
}

function buildInput(
    parsed: ReturnType<typeof parseSearchOperators>,
    consumer: SearchExecutionInput['rankingV3EvidenceConsumer'],
    resultLimit = 10,
): SearchExecutionInput {
    return {
        effectiveRoot: '/repo',
        scope: 'runtime',
        rankingMode: 'auto_changed_first',
        limit: resultLimit,
        debugMode: 'none',
        semanticQuery: parsed.semanticQuery,
        parsedOperators: parsed,
        queryPlan: buildSearchQueryPlan(parsed.semanticQuery, true, parsed),
        exactRegistryEligible: false,
        exactRegistryFallbackForTrackedLexical: false,
        freshnessMode: 'synced',
        observedChangedFilesState: { available: false, files: new Set() },
        retrievalPolicy: resolveSearchPolicy({
            resultLimit,
            hasMustOperators: parsed.must.length > 0,
        }),
        rankingV3EvidenceConsumer: consumer,
    };
}

function buildHost(
    primaryResults: MockResult[],
    options: {
        reranker?: SearchExecutionHost['reranker'];
        rankingV3RerankEvidenceEnvironment?: SearchExecutionHost['rankingV3RerankEvidenceEnvironment'];
    } = {},
) {
    const host: SearchExecutionHost = {
        searchQuerySupport: buildSupport({ reranker: options.reranker }),
        semanticSearch: async (request) => {
            if (request.retrievalMode === 'lexical' && request.topK === 80) {
                return [];
            }
            return {
                results: primaryResults,
                candidateTrace: {
                    schemaVersion: 'semantic_search_candidate_trace_v1' as const,
                    maxEntriesPerStage: 50,
                    productCandidateLimit: request.topK,
                    queryEmbeddingSha256: null,
                    lexicalRequests: [],
                    stages: [],
                    removals: [],
                    omittedRemovals: 0,
                },
                rankingV3CandidateTraces: primaryResults.map((entry, index) => ({
                    schemaVersion: 'semantic_search_candidate_trace_v2' as const,
                    candidateId: searchCandidateIdentity(entry).candidateId,
                    rawDenseRank: index + 1,
                    rawLexicalRank: null,
                    rawFallbackLexicalRank: null,
                    coreFusionRank: index + 1,
                })),
            };
        },
        reranker: options.reranker ?? null,
        ...(options.rankingV3RerankEvidenceEnvironment
            ? { rankingV3RerankEvidenceEnvironment: options.rankingV3RerankEvidenceEnvironment }
            : {}),
        shouldForceSearchPassFailure: () => false,
        classifyEmbeddingProviderError: () => null,
        classifyVectorBackendError: () => null,
        measureSearchPhase: async (_phase, run) => run(),
    };
    return host;
}

const sha = (character: string): string => character.repeat(64);

function fakeReranker(): SearchExecutionHost['reranker'] {
    return {
        getIdentity: () => ({ provider: 'test-provider', model: 'test-model', profile: 'test-profile' }),
        getMaxDocuments: () => undefined,
        getDocumentProjectionVersion: () => 'search_rerank_document_v2',
        rerank: async (_query, documents) => documents.map((_, index) => ({
            index,
            relevanceScore: documents.length - index,
        })),
    };
}

type RankingV3Envelope = {
    schemaVersion: 'search_execution_ranking_v3_evidence_v1';
    mode: 'enabled' | 'disabled';
    admittedCandidateIds: string[];
    semanticPasses: Array<{ passId: string; candidateTraces: unknown[] }>;
    passEvidence: SearchPassEvidenceV1[];
    rawRerankEvidence: RawValidatedRerankEvidenceV1 | null;
    assembledRecords: SearchRankingEvidenceRecordV1[];
};

test('retry_scenario_emits_attempt_qualified_unique_evidence_pass_ids', async () => {
    // RED first: a must: operator keeps the attempt loop running below the
    // retrieval result limit, so plain 'primary'/'expanded' pass ids would be
    // repeated once per attempt. Evidence pass ids must be attempt-qualified
    // and unique across the whole retry sequence.
    const parsed = parseSearchOperators('must:alpha where implementation lives');
    const results = [
        result({ relativePath: 'src/a.ts', content: 'export function alphaOne() {}' }),
        result({ relativePath: 'src/b.ts', content: 'export function alphaTwo() {}' }),
    ];
    const delivered: unknown[] = [];
    const input = buildInput(parsed, (evidence) => delivered.push(evidence), 5);
    const executionOutcome = await runSearchExecution(input, buildHost(results), {} as SearchDiagnostics);
    assert.equal(executionOutcome.kind, 'ok');
    assert.equal(executionOutcome.attemptsUsed, 2, 'must: retry rounds must actually run');

    const evidence = delivered[0] as RankingV3Envelope;
    const semanticPassIds = evidence.semanticPasses.map((pass) => pass.passId);
    assert.ok(semanticPassIds.length >= 2, `expected one semantic pass per attempt, got ${semanticPassIds.join(', ')}`);
    assert.ok(
        semanticPassIds.every((passId) => /^attempt:\d+\/(primary|expanded)$/.test(passId)),
        `evidence pass ids must be attempt-qualified: ${semanticPassIds.join(', ')}`,
    );
    assert.equal(
        new Set(semanticPassIds).size,
        semanticPassIds.length,
        `duplicate evidence pass ids across retries: ${semanticPassIds.join(', ')}`,
    );

    const evidencePassIds = [...semanticPassIds];
    assert.equal(
        new Set(evidencePassIds).size,
        evidencePassIds.length,
        `duplicate evidence pass ids across retries: ${evidencePassIds.join(', ')}`,
    );
    // Pass ids may repeat across candidates (a pass covers many candidates),
    // but must never repeat within one candidate's evidence across retries.
    for (const entry of evidence.passEvidence) {
        const contributionPassIds = entry.contributions.map((item) => item.passId);
        assert.equal(
            new Set(contributionPassIds).size,
            contributionPassIds.length,
            `duplicate contribution pass ids for ${entry.candidateId}: ${contributionPassIds.join(', ')}`,
        );
        assert.ok(contributionPassIds.every((passId) => /^attempt:\d+\/(primary|expanded)$/.test(passId)));
    }
    for (const record of evidence.assembledRecords) {
        const retrievalPassIds = record.deterministicEvidence.retrievalPasses;
        assert.equal(
            new Set(retrievalPassIds).size,
            retrievalPassIds.length,
            `duplicate retrieval pass ids for ${record.candidateId}: ${retrievalPassIds.join(', ')}`,
        );
        assert.ok(retrievalPassIds.every((passId) => /^attempt:\d+\/(primary|expanded)$/.test(passId)));
    }
});

test('full_evidence_payload_arrives_through_consumer_when_reranker_enabled', async () => {
    const parsed = parseSearchOperators('where implementation lives');
    const results = [
        result({ relativePath: 'src/a.ts', content: 'export function alphaOne() {}' }),
        result({ relativePath: 'src/b.ts', content: 'export function alphaTwo() {}' }),
    ];
    const ids = results.map((entry) => searchCandidateIdentity(entry).candidateId);
    const delivered: unknown[] = [];
    const input = buildInput(parsed, (evidence) => delivered.push(evidence));
    const reranker = fakeReranker();
    const host = buildHost(results, {
        reranker,
        rankingV3RerankEvidenceEnvironment: () => ({
            serviceClass: 'offline_linux_x64' as const,
            providerKey: 'test-provider',
            providerConfigurationDigest: sha('a'),
            providerRequestContractSha256: sha('b'),
            timeoutMs: 5000,
            attempts: 1,
        }),
    });
    const executionOutcome = await runSearchExecution(input, host, {} as SearchDiagnostics);
    assert.equal(executionOutcome.kind, 'ok');
    assert.equal(executionOutcome.attemptsUsed, 1);
    assert.equal(executionOutcome.rerankerApplied, true);

    const evidence = delivered[0] as RankingV3Envelope;

    // B8: the evidence side channel must never alter execution outcome bytes.
    const withoutConsumer = await runSearchExecution(
        buildInput(parsed, undefined),
        host,
        {} as SearchDiagnostics,
    );
    assert.equal(JSON.stringify(executionOutcome), JSON.stringify(withoutConsumer));

    assert.equal(evidence.mode, 'enabled');
    assert.deepEqual(evidence.admittedCandidateIds, ids);

    // Semantic passes: one attempt-qualified entry per successful pass.
    assert.deepEqual(
        evidence.semanticPasses.map((pass) => pass.passId),
        ['attempt:1/primary'],
    );

    // Pass evidence: one record per admitted candidate with exact fusion
    // contribution sums (mirrors execution rrf = weight * (1 / (K + rank))).
    assert.equal(evidence.passEvidence.length, 2);
    for (let index = 0; index < ids.length; index++) {
        const passEvidence = evidence.passEvidence[index];
        assert.equal(passEvidence.candidateId, ids[index]);
        assert.deepEqual(passEvidence.contributions, [{
            passId: 'attempt:1/primary',
            rank: index + 1,
            rrfK: 60,
            weight: 1,
            contribution: 1 / (60 + index + 1),
        }]);
        assert.equal(
            passEvidence.totalContribution,
            passEvidence.contributions.reduce((sum, item) => sum + item.contribution, 0),
        );
    }

    // One raw validated rerank retention when the reranker is enabled.
    assert.ok(evidence.rawRerankEvidence, 'reranker enabled must retain raw validated evidence');
    const retention = evidence.rawRerankEvidence;
    assert.equal(retention.serviceClass, 'offline_linux_x64');
    assert.equal(retention.providerKey, 'test-provider');
    assert.equal(retention.rerankerIdentity, 'test-provider:test-model');
    assert.equal(retention.rerankerProjectionIdentity, 'search_rerank_document_v2');
    for (const digest of [
        retention.providerConfigurationDigest,
        retention.providerRequestContractSha256,
        retention.baselineAdmissionSetSha256,
        retention.canonicalRequestSha256,
        retention.canonicalResponseSha256,
    ]) {
        assert.match(digest, /^[a-f0-9]{64}$/);
    }
    assert.equal(retention.requestCandidateIds.length, 2);
    assert.deepEqual(new Set(retention.requestCandidateIds), new Set(ids));
    assert.equal(retention.response.orderedCandidates.length, 2);
    assert.deepEqual(new Set(retention.response.orderedCandidates.map((entry) => entry.candidateId)), new Set(ids));
    assert.ok(retention.response.orderedCandidates.every((entry) => Number.isFinite(entry.rawScore)));
    assert.deepEqual(retention.outcome, { status: 'complete', timeoutMs: 5000, attempts: 1 });

    // One assembled deterministic record per admitted candidate.
    assert.equal(evidence.assembledRecords.length, 2);
    for (let index = 0; index < ids.length; index++) {
        const record = evidence.assembledRecords[index];
        assert.equal(record.candidateId, ids[index]);
        assert.equal(record.deterministicEvidence.admissionRank, index + 1);
        assert.equal(record.deterministicEvidence.evidenceStage, 'post_admission_pre_residual');
        assert.match(record.deterministicEvidence.queryId, /^[a-f0-9]{64}$/);
        assert.equal(record.deterministicEvidence.candidateTrace.candidateId, ids[index]);
        assert.deepEqual(record.deterministicEvidence.retrievalPasses, ['attempt:1/primary']);
        assert.deepEqual(record.deterministicEvidence.rrfContributions, [{
            passId: 'attempt:1/primary',
            contribution: 1 / (60 + index + 1),
        }]);
        assert.deepEqual(record.features.featureOrder, RANKING_FEATURE_ORDER_V1);
        assert.equal(record.features.values.length, RANKING_FEATURE_ORDER_V1.length);
        // The evidence fusion feature is the pre-residual deterministic sum.
        assert.equal(
            record.features.values[RANKING_FEATURE_ORDER_V1.indexOf('fusionScore')],
            evidence.passEvidence[index].totalContribution,
        );
        assert.equal(
            record.features.values[RANKING_FEATURE_ORDER_V1.indexOf('baselineFinalScore')],
            record.deterministicEvidence.baselineScore,
        );
        assert.equal(
            record.features.values[RANKING_FEATURE_ORDER_V1.indexOf('rerankAdjusted')],
            0,
            'assembled records are pre-residual and must not observe rerank adjustment',
        );
        assert.ok(record.rawRerankEvidence, 'admitted candidates covered by the rerank request must carry the retention');
        assert.deepEqual(record.rawRerankEvidence, retention);
    }
    // Deterministic admission order: the higher-fusion candidate is rank 1.
    assert.ok(
        evidence.assembledRecords[0].deterministicEvidence.baselineScore
        > evidence.assembledRecords[1].deterministicEvidence.baselineScore,
    );
});

test('disabled_mode_emits_no_raw_rerank_retention_but_full_deterministic_evidence', async () => {
    const parsed = parseSearchOperators('where implementation lives');
    const results = [
        result({ relativePath: 'src/a.ts', content: 'export function alphaOne() {}' }),
        result({ relativePath: 'src/b.ts', content: 'export function alphaTwo() {}' }),
    ];
    const ids = results.map((entry) => searchCandidateIdentity(entry).candidateId);
    const delivered: unknown[] = [];
    const input = buildInput(parsed, (evidence) => delivered.push(evidence));
    const executionOutcome = await runSearchExecution(input, buildHost(results), {} as SearchDiagnostics);
    assert.equal(executionOutcome.kind, 'ok');

    const evidence = delivered[0] as RankingV3Envelope;
    assert.equal(evidence.mode, 'disabled');
    assert.equal(evidence.rawRerankEvidence, null);
    assert.deepEqual(evidence.admittedCandidateIds, ids);
    assert.equal(evidence.passEvidence.length, 2);
    assert.equal(evidence.assembledRecords.length, 2);
    assert.ok(evidence.assembledRecords.every((record) => record.rawRerankEvidence === null));
});
