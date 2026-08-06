import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateNeuralGate, type NeuralGateInput } from './neural-ranking-gate.js';
import type { ValidatedRerankResponseV1 } from './rerank-evidence.js';
import { buildNeuralRankingEvidence } from './neural-ranking-evidence.js';

const TARGET = {
    providerTarget: 'fixed' as const,
    serviceClass: 'offline_linux_x64' as const,
    providerKey: 'voyage',
    rerankerIdentity: 'rerank-v1',
    rerankerProjectionIdentity: 'proj-v1',
    providerConfigurationDigest: 'd'.repeat(64),
};
const IDENTITY = {
    providerKey: 'voyage',
    rerankerIdentity: 'rerank-v1',
    rerankerProjectionIdentity: 'proj-v1',
    providerConfigurationDigest: 'd'.repeat(64),
};
const RESPONSE: ValidatedRerankResponseV1 = {
    schemaVersion: 'validated_rerank_response_v1',
    orderedCandidates: [
        { candidateId: 'a', rawScore: 0.9 },
        { candidateId: 'b', rawScore: 0.7 },
        { candidateId: 'c', rawScore: 0.5 },
    ],
};

function providerInput(overrides: Partial<NeuralGateInput & Record<string, unknown>> = {}): NeuralGateInput {
    return {
        policy: {
            mode: 'provider_derived',
            providerKey: 'voyage',
            minimumCandidates: 3,
            minimumNormalizedTopToSecondMargin: 0.1,
        },
        target: TARGET,
        suppliedIdentity: IDENTITY,
        response: RESPONSE,
        evidence: buildNeuralRankingEvidence(RESPONSE, 'voyage'),
        exactControlOwnsResult: false,
        baselineAdmissionIds: ['a', 'b', 'c'],
        ...overrides,
    } as NeuralGateInput;
}

test('disabled_mode_never_consumes_provider_evidence', () => {
    const decision = evaluateNeuralGate({
        policy: { mode: 'disabled' },
        target: { providerTarget: 'none' },
        exactControlOwnsResult: false,
        baselineAdmissionIds: ['a', 'b', 'c'],
    });
    assert.deepEqual(decision, { decision: 'skip', reason: 'mode_disabled' });
});

test('exact_control_ownership_skips_before_any_provider_use', () => {
    const decision = evaluateNeuralGate(providerInput({ exactControlOwnsResult: true }));
    assert.deepEqual(decision, { decision: 'skip', reason: 'exact_control' });
});

test('identity_mismatch_falls_back_deterministic', () => {
    const decision = evaluateNeuralGate(providerInput({
        policy: { mode: 'provider_derived', providerKey: 'lateon', minimumCandidates: 3, minimumNormalizedTopToSecondMargin: 0.1 },
    }));
    assert.deepEqual(decision, { decision: 'fallback_deterministic', reason: 'identity_mismatch' });
});

test('provider_mismatch_falls_back_deterministic', () => {
    const decision = evaluateNeuralGate(providerInput({
        suppliedIdentity: { ...IDENTITY, providerConfigurationDigest: 'e'.repeat(64) },
    }));
    assert.deepEqual(decision, { decision: 'fallback_deterministic', reason: 'provider_mismatch' });
});

test('invalid_or_foreign_response_falls_back_deterministic', () => {
    const foreign = evaluateNeuralGate(providerInput({
        response: {
            schemaVersion: 'validated_rerank_response_v1',
            orderedCandidates: [
                { candidateId: 'a', rawScore: 0.9 },
                { candidateId: 'b', rawScore: 0.7 },
                { candidateId: 'foreign', rawScore: 0.5 },
            ],
        },
    }));
    assert.deepEqual(foreign, { decision: 'fallback_deterministic', reason: 'invalid_response' });

    const duplicate = evaluateNeuralGate(providerInput({
        response: {
            schemaVersion: 'validated_rerank_response_v1',
            orderedCandidates: [
                { candidateId: 'a', rawScore: 0.9 },
                { candidateId: 'a', rawScore: 0.7 },
                { candidateId: 'c', rawScore: 0.5 },
            ],
        },
    }));
    assert.deepEqual(duplicate, { decision: 'fallback_deterministic', reason: 'invalid_response' });
});

test('non_finite_scores_fall_back_deterministic', () => {
    const decision = evaluateNeuralGate(providerInput({
        response: {
            schemaVersion: 'validated_rerank_response_v1',
            orderedCandidates: [
                { candidateId: 'a', rawScore: Number.NaN },
                { candidateId: 'b', rawScore: 0.7 },
                { candidateId: 'c', rawScore: 0.5 },
            ],
        },
    }));
    assert.deepEqual(decision, { decision: 'fallback_deterministic', reason: 'non_finite_score' });
});

test('insufficient_candidates_or_margin_skips', () => {
    const few = evaluateNeuralGate(providerInput({
        policy: { mode: 'provider_derived', providerKey: 'voyage', minimumCandidates: 5, minimumNormalizedTopToSecondMargin: 0.1 },
    }));
    assert.deepEqual(few, { decision: 'skip', reason: 'insufficient_candidates' });

    const tight = evaluateNeuralGate(providerInput({
        policy: { mode: 'provider_derived', providerKey: 'voyage', minimumCandidates: 3, minimumNormalizedTopToSecondMargin: 0.9 },
    }));
    assert.deepEqual(tight, { decision: 'skip', reason: 'insufficient_margin' });
});

test('qualified_apply', () => {
    const decision = evaluateNeuralGate(providerInput());
    assert.deepEqual(decision, { decision: 'apply' });
});
