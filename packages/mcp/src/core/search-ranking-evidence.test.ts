import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDeterministicRankingEvidenceV1 } from './search-ranking-evidence.js';

const valid = {
    schemaVersion: 'deterministic_ranking_evidence_v1',
    evidenceStage: 'post_admission_pre_residual',
    queryId: 'query-1',
    candidateId: 'candidate-1',
    baselineScore: 0.25,
    admissionRank: 1,
    candidateTrace: {
        schemaVersion: 'semantic_search_candidate_trace_v2',
        candidateId: 'candidate-1',
        rawDenseRank: 1,
        rawLexicalRank: null,
        rawFallbackLexicalRank: null,
        coreFusionRank: 1,
    },
    retrievalPasses: ['primary'],
    rrfContributions: [{ passId: 'primary', contribution: 0.01 }],
};

test('parses_only_post_admission_pre_residual_evidence', () => {
    assert.deepEqual(parseDeterministicRankingEvidenceV1(valid), valid);
    assert.throws(() => parseDeterministicRankingEvidenceV1({ ...valid, evidenceStage: 'pre_admission' }), /stage/i);
    assert.throws(() => parseDeterministicRankingEvidenceV1({ ...valid, providerScore: 0.9 }), /unknown|exact keys/i);
});
