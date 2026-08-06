import type { QualifiedRerankerV1 } from './ranking-policy-qualification.js';
import type { FixedProviderTargetV1 } from './ranking-provider-request-v1.js';
import type { ValidatedRerankResponseV1 } from './rerank-evidence.js';
import type { NeuralRankingEvidenceV1 } from './neural-ranking-evidence.js';

export type NeuralGateDecision =
    | { decision: 'apply' }
    | {
        decision: 'skip';
        reason: 'mode_disabled' | 'exact_control' | 'insufficient_margin' | 'insufficient_candidates';
    }
    | {
        decision: 'fallback_deterministic';
        reason: 'provider_mismatch' | 'invalid_response' | 'identity_mismatch' | 'non_finite_score';
    };

export type NeuralGateInput =
    | {
        policy: { mode: 'disabled' };
        target: { providerTarget: 'none' | 'fixed' };
        exactControlOwnsResult: boolean;
        baselineAdmissionIds: readonly string[];
    }
    | {
        policy: {
            mode: 'provider_derived';
            providerKey: string;
            minimumCandidates: number;
            minimumNormalizedTopToSecondMargin: number;
        };
        target: FixedProviderTargetV1;
        suppliedIdentity: QualifiedRerankerV1;
        response: ValidatedRerankResponseV1;
        evidence: readonly NeuralRankingEvidenceV1[];
        exactControlOwnsResult: boolean;
        baselineAdmissionIds: readonly string[];
    };

const MARGIN_EPSILON = 1e-12;

function identityMatches(supplied: QualifiedRerankerV1, target: FixedProviderTargetV1): boolean {
    return supplied.providerKey === target.providerKey
        && supplied.rerankerIdentity === target.rerankerIdentity
        && supplied.rerankerProjectionIdentity === target.rerankerProjectionIdentity
        && supplied.providerConfigurationDigest === target.providerConfigurationDigest;
}

function normalizedTopToSecondMargin(response: ValidatedRerankResponseV1): number | null {
    const scores = response.orderedCandidates.map((candidate) => candidate.rawScore);
    if (scores.some((score) => !Number.isFinite(score))) {
        return null;
    }
    const top = Math.max(...scores);
    const bottom = Math.min(...scores);
    const second = [...scores].sort((left, right) => right - left)[1] ?? top;
    return (top - second) / Math.max(MARGIN_EPSILON, top - bottom);
}

/**
 * D7: the pure neural confidence gate (plan §4.4, §4.5). Validates only the
 * artifact mode, the preregistered provider target, supplied identities,
 * complete candidate identity accounting, complete finite scores, minimum
 * candidate count, normalized top-to-second margin, exact-control ownership,
 * and baseline-admission membership. It never reads the qualification
 * registry and never requires an activation receipt.
 */
type ProviderDerivedGateInput = Extract<NeuralGateInput, { policy: { mode: 'provider_derived' } }>;

export function evaluateNeuralGate(input: NeuralGateInput): NeuralGateDecision {
    if (input.policy.mode === 'disabled') {
        return { decision: 'skip', reason: 'mode_disabled' };
    }
    // TypeScript cannot narrow the union through the nested policy discriminant,
    // so narrow once explicitly after the disabled early return.
    const providerInput = input as ProviderDerivedGateInput;
    if (providerInput.exactControlOwnsResult) {
        return { decision: 'skip', reason: 'exact_control' };
    }
    if (providerInput.policy.providerKey !== providerInput.target.providerKey) {
        return { decision: 'fallback_deterministic', reason: 'identity_mismatch' };
    }
    if (!identityMatches(providerInput.suppliedIdentity, providerInput.target)) {
        return { decision: 'fallback_deterministic', reason: 'provider_mismatch' };
    }
    const response = providerInput.response;
    if (!response || response.schemaVersion !== 'validated_rerank_response_v1') {
        return { decision: 'fallback_deterministic', reason: 'invalid_response' };
    }
    const candidateIds = response.orderedCandidates.map((candidate) => candidate.candidateId);
    if (candidateIds.length !== new Set(candidateIds).size) {
        return { decision: 'fallback_deterministic', reason: 'invalid_response' };
    }
    const admissionIds = new Set(providerInput.baselineAdmissionIds);
    if (candidateIds.some((candidateId) => !admissionIds.has(candidateId))) {
        return { decision: 'fallback_deterministic', reason: 'invalid_response' };
    }
    if (response.orderedCandidates.some((candidate) => !Number.isFinite(candidate.rawScore))) {
        return { decision: 'fallback_deterministic', reason: 'non_finite_score' };
    }
    if (candidateIds.length < providerInput.policy.minimumCandidates) {
        return { decision: 'skip', reason: 'insufficient_candidates' };
    }
    const margin = normalizedTopToSecondMargin(response);
    if (margin === null) {
        return { decision: 'fallback_deterministic', reason: 'non_finite_score' };
    }
    if (margin < providerInput.policy.minimumNormalizedTopToSecondMargin) {
        return { decision: 'skip', reason: 'insufficient_margin' };
    }
    return { decision: 'apply' };
}
