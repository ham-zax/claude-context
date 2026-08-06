import assert from 'node:assert/strict';
import test from 'node:test';
import { RANKING_FEATURE_ORDER_V1 } from './ranking-features-v1.js';
import { assembleSearchRankingEvidenceV1 } from './search-ranking-evidence-assembler.js';

const trace = (candidateId: string) => ({
    schemaVersion: 'semantic_search_candidate_trace_v2' as const,
    candidateId,
    rawDenseRank: 1,
    rawLexicalRank: null,
    rawFallbackLexicalRank: null,
    coreFusionRank: 1,
});
const features = { featureSchema: 'search_features_v1' as const, featureOrder: RANKING_FEATURE_ORDER_V1, values: RANKING_FEATURE_ORDER_V1.map(() => 0) };

test('assembles_one_record_per_post_eligibility_candidate', () => {
    const records = assembleSearchRankingEvidenceV1({
        queryId: 'q1',
        evidenceStage: 'post_admission_pre_residual',
        candidates: ['c1', 'c2'].map((candidateId, index) => ({
            candidateId,
            baselineScore: 1 - index / 10,
            admissionRank: index + 1,
            candidateTrace: trace(candidateId),
            passEvidence: { schemaVersion: 'search_pass_evidence_v1', candidateId, contributions: [], totalContribution: 0 },
            features,
            rawRerankEvidence: null,
        })),
    });
    assert.deepEqual(records.map((record) => record.candidateId), ['c1', 'c2']);
    assert.equal(new Set(records.map((record) => record.candidateId)).size, 2);
    assert.throws(() => assembleSearchRankingEvidenceV1({
        queryId: 'q1', evidenceStage: 'pre_admission' as never, candidates: [],
    }), /post-admission/i);
    assert.throws(() => assembleSearchRankingEvidenceV1({
        queryId: 'q1', evidenceStage: 'post_admission_pre_residual',
        candidates: [
            { candidateId: 'c1', baselineScore: 1, admissionRank: 1, candidateTrace: trace('c1'), passEvidence: { schemaVersion: 'search_pass_evidence_v1', candidateId: 'c1', contributions: [], totalContribution: 0 }, features, rawRerankEvidence: null },
            { candidateId: 'c1', baselineScore: 1, admissionRank: 2, candidateTrace: trace('c1'), passEvidence: { schemaVersion: 'search_pass_evidence_v1', candidateId: 'c1', contributions: [], totalContribution: 0 }, features, rawRerankEvidence: null },
        ],
    }), /duplicate/i);
});
