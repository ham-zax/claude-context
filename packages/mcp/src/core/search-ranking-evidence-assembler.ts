import { parseDeterministicRankingEvidenceV1, type DeterministicRankingEvidenceV1, type SemanticSearchCandidateTraceV2Like } from './search-ranking-evidence.js';
import type { RankingFeatureVectorV1 } from './ranking-features-v1.js';
import type { RawValidatedRerankEvidenceV1 } from './search-rerank-evidence-retention.js';
import type { SearchPassEvidenceV1 } from './search-pass-evidence.js';

export interface SearchRankingEvidenceRecordV1 {
    schemaVersion: 'search_ranking_evidence_record_v1';
    candidateId: string;
    deterministicEvidence: DeterministicRankingEvidenceV1;
    features: RankingFeatureVectorV1;
    rawRerankEvidence: RawValidatedRerankEvidenceV1 | null;
}

export function assembleSearchRankingEvidenceV1(input: {
    queryId: string;
    evidenceStage: 'post_admission_pre_residual';
    candidates: readonly {
        candidateId: string;
        baselineScore: number;
        admissionRank: number;
        candidateTrace: SemanticSearchCandidateTraceV2Like;
        passEvidence: SearchPassEvidenceV1;
        features: RankingFeatureVectorV1;
        rawRerankEvidence: RawValidatedRerankEvidenceV1 | null;
    }[];
}): SearchRankingEvidenceRecordV1[] {
    if (input.evidenceStage !== 'post_admission_pre_residual') throw new Error('Evidence assembly is allowed only post-admission and pre-residual.');
    if (typeof input.queryId !== 'string' || input.queryId.length === 0) throw new Error('queryId must be non-empty.');
    const seen = new Set<string>();
    return input.candidates.map((candidate, index) => {
        if (seen.has(candidate.candidateId)) throw new Error(`Duplicate candidate '${candidate.candidateId}'.`);
        seen.add(candidate.candidateId);
        if (candidate.admissionRank !== index + 1) throw new Error('Admission ranks must be one-based, contiguous, and match candidate order.');
        if (candidate.passEvidence.candidateId !== candidate.candidateId) throw new Error('Pass evidence candidateId mismatch.');
        if (candidate.features.featureSchema !== 'search_features_v1' || candidate.features.values.length !== candidate.features.featureOrder.length) {
            throw new Error('Ranking feature vector is invalid.');
        }
        if (candidate.rawRerankEvidence && !candidate.rawRerankEvidence.requestCandidateIds.includes(candidate.candidateId)) {
            throw new Error('Raw rerank evidence does not cover the candidate.');
        }
        const deterministicEvidence = parseDeterministicRankingEvidenceV1({
            schemaVersion: 'deterministic_ranking_evidence_v1',
            evidenceStage: 'post_admission_pre_residual',
            queryId: input.queryId,
            candidateId: candidate.candidateId,
            baselineScore: candidate.baselineScore,
            admissionRank: candidate.admissionRank,
            candidateTrace: candidate.candidateTrace,
            retrievalPasses: candidate.passEvidence.contributions.map((item) => item.passId),
            rrfContributions: candidate.passEvidence.contributions.map(({ passId, contribution }) => ({ passId, contribution })),
        });
        return {
            schemaVersion: 'search_ranking_evidence_record_v1',
            candidateId: candidate.candidateId,
            deterministicEvidence,
            features: { ...candidate.features, featureOrder: candidate.features.featureOrder, values: [...candidate.features.values] },
            rawRerankEvidence: candidate.rawRerankEvidence ? structuredClone(candidate.rawRerankEvidence) : null,
        };
    });
}
