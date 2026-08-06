import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNeuralRankingEvidence } from './neural-ranking-evidence.js';
import type { ValidatedRerankResponseV1 } from './rerank-evidence.js';

const RESPONSE: ValidatedRerankResponseV1 = {
    schemaVersion: 'validated_rerank_response_v1',
    orderedCandidates: [
        { candidateId: 'a', rawScore: 0.9 },
        { candidateId: 'b', rawScore: 0.7 },
        { candidateId: 'c', rawScore: 0.5 },
    ],
};

test('derives_bounded_within_query_evidence_from_raw_authority', () => {
    const evidence = buildNeuralRankingEvidence(RESPONSE, 'voyage');
    assert.equal(evidence.length, 3);
    for (const entry of evidence) {
        assert.equal(entry.schemaVersion, 'neural_ranking_evidence_v1');
        assert.equal(entry.providerKey, 'voyage');
        assert.ok(entry.withinQueryPercentile >= 0 && entry.withinQueryPercentile <= 1);
        assert.ok(entry.candidateToTopMargin >= 0);
    }
    const byId = new Map(evidence.map((entry) => [entry.candidateId, entry]));
    assert.equal(byId.get('a')?.withinQueryPercentile, 1);
    assert.equal(byId.get('c')?.withinQueryPercentile, 0);
    assert.equal(byId.get('a')?.candidateToTopMargin, 0);
    assert.equal(byId.get('a')?.topToSecondMargin, 0.2);
    assert.equal(byId.get('a')?.rank, 1);
});

test('all_equal_scores_do_not_divide_by_zero', () => {
    const flat: ValidatedRerankResponseV1 = {
        schemaVersion: 'validated_rerank_response_v1',
        orderedCandidates: [
            { candidateId: 'a', rawScore: 0.5 },
            { candidateId: 'b', rawScore: 0.5 },
        ],
    };
    const evidence = buildNeuralRankingEvidence(flat);
    assert.equal(evidence.every((entry) => entry.withinQueryPercentile === 1), true);
    assert.equal(evidence.every((entry) => entry.candidateToTopMargin === 0), true);
});

test('rejects_malformed_responses', () => {
    assert.throws(() => buildNeuralRankingEvidence({ schemaVersion: 'wrong', orderedCandidates: [] }));
    assert.throws(() => buildNeuralRankingEvidence({
        schemaVersion: 'validated_rerank_response_v1',
        orderedCandidates: [],
    }));
    assert.throws(() => buildNeuralRankingEvidence({
        schemaVersion: 'validated_rerank_response_v1',
        orderedCandidates: [{ candidateId: 'a', rawScore: Number.NaN }],
    }));
    assert.throws(() => buildNeuralRankingEvidence(RESPONSE, ''));
});
