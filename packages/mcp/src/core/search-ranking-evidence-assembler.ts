import type { DeterministicRankingEvidenceV1, SemanticSearchCandidateTraceV2Like } from './search-ranking-evidence.js';
import { parseDeterministicRankingEvidenceV1 } from './search-ranking-evidence.js';
import type { SearchPassEvidenceV1 } from './search-pass-evidence.js';

export interface DeterministicEvidenceAssemblyInput {
    queryId: string;
    /** The authoritative post-admission candidate order (baseline admission set). */
    admissionOrder: readonly string[];
    baselineScoreByCandidateId: ReadonlyMap<string, number>;
    candidateTraceByCandidateId: ReadonlyMap<string, SemanticSearchCandidateTraceV2Like>;
    passEvidenceByCandidateId: ReadonlyMap<string, SearchPassEvidenceV1>;
}

/**
 * B4: assemble exactly one DeterministicRankingEvidenceV1 record per
 * post-admission eligible candidate. Candidates outside the frozen admission
 * set, missing evidence, or duplicate order entries are rejected — the
 * assembler never invents or repairs membership (plan §3.1, §4.2).
 */
export function assembleDeterministicRankingEvidenceV1(
    input: DeterministicEvidenceAssemblyInput,
): DeterministicRankingEvidenceV1[] {
    if (typeof input.queryId !== 'string' || input.queryId.length === 0) {
        throw new Error('queryId must be non-empty.');
    }
    if (!Array.isArray(input.admissionOrder) || input.admissionOrder.length === 0) {
        throw new Error('Admission order must be a non-empty post-admission candidate list.');
    }
    const seen = new Set<string>();
    const records: DeterministicRankingEvidenceV1[] = [];
    input.admissionOrder.forEach((candidateId, admissionIndex) => {
        if (typeof candidateId !== 'string' || candidateId.length === 0) {
            throw new Error('Admission order contains an empty candidate id.');
        }
        if (seen.has(candidateId)) {
            throw new Error(`Duplicate post-admission candidate '${candidateId}'.`);
        }
        seen.add(candidateId);
        const baselineScore = input.baselineScoreByCandidateId.get(candidateId);
        if (baselineScore === undefined || !Number.isFinite(baselineScore)) {
            throw new Error(`Missing finite baseline score for '${candidateId}'.`);
        }
        const candidateTrace = input.candidateTraceByCandidateId.get(candidateId);
        if (!candidateTrace || candidateTrace.candidateId !== candidateId) {
            throw new Error(`Missing or mismatched candidate trace for '${candidateId}'.`);
        }
        const passEvidence = input.passEvidenceByCandidateId.get(candidateId);
        if (!passEvidence || passEvidence.candidateId !== candidateId) {
            throw new Error(`Missing or mismatched pass evidence for '${candidateId}'.`);
        }
        const record = parseDeterministicRankingEvidenceV1({
            schemaVersion: 'deterministic_ranking_evidence_v1',
            evidenceStage: 'post_admission_pre_residual',
            queryId: input.queryId,
            candidateId,
            baselineScore,
            admissionRank: admissionIndex + 1,
            candidateTrace,
            retrievalPasses: passEvidence.passes.map((pass) => pass.passId),
            rrfContributions: passEvidence.passes.map((pass) => ({
                passId: pass.passId,
                contribution: pass.contribution,
            })),
        });
        records.push(record);
    });
    return records;
}
