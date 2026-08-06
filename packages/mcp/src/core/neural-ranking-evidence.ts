import type { ValidatedRerankResponseV1 } from './rerank-evidence.js';

export interface NeuralRankingEvidenceV1 {
    schemaVersion: 'neural_ranking_evidence_v1';
    candidateId: string;
    providerKey: string;
    rank: number;
    rawScore: number;
    withinQueryPercentile: number;
    candidateToTopMargin: number;
    topToSecondMargin: number;
}

function finite(value: number, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${label} must be finite.`);
    }
    return value;
}

function roundMetric(value: number): number {
    return Number(value.toFixed(6));
}

/**
 * D7: derive the bounded neural evidence vector from one complete validated
 * provider response (plan §4.4). Only raw authority plus within-query
 * percentile and margin summaries are derived here; no cross-query or
 * cross-provider normalization ever happens.
 */
export function buildNeuralRankingEvidence(
    response: ValidatedRerankResponseV1,
    providerKey = 'validated',
): readonly NeuralRankingEvidenceV1[] {
    if (typeof providerKey !== 'string' || providerKey.length === 0) {
        throw new Error('providerKey must be non-empty.');
    }
    if (!response || response.schemaVersion !== 'validated_rerank_response_v1') {
        throw new Error('Neural evidence requires a validated rerank response.');
    }
    const candidates = response.orderedCandidates;
    if (!Array.isArray(candidates) || candidates.length === 0) {
        throw new Error('Neural evidence requires a non-empty candidate response.');
    }
    const scores = candidates.map((candidate) => finite(candidate.rawScore, 'rawScore'));
    const top = Math.max(...scores);
    const bottom = Math.min(...scores);
    const second = [...scores].sort((left, right) => right - left)[1] ?? top;
    const span = top - bottom;
    const topToSecond = top - second;
    return candidates.map((candidate, index) => {
        const score = scores[index];
        const withinQueryPercentile = span === 0
            ? 1
            : roundMetric((score - bottom) / span);
        const candidateToTopMargin = roundMetric(top - score);
        return {
            schemaVersion: 'neural_ranking_evidence_v1',
            candidateId: candidate.candidateId,
            providerKey,
            rank: index + 1,
            rawScore: score,
            withinQueryPercentile,
            candidateToTopMargin,
            topToSecondMargin: roundMetric(topToSecond),
        };
    });
}
