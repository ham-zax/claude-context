import assert from 'node:assert/strict';
import test from 'node:test';
import type { SemanticSearchCandidateTraceV2Like } from './search-ranking-evidence.js';
import type { SearchPassEvidenceV1 } from './search-pass-evidence.js';
import { buildSearchPassEvidenceV1 } from './search-pass-evidence.js';
import { assembleDeterministicRankingEvidenceV1 } from './search-ranking-evidence-assembler.js';

const TRACE: SemanticSearchCandidateTraceV2Like = {
    schemaVersion: 'semantic_search_candidate_trace_v2',
    candidateId: '',
    rawDenseRank: 1,
    rawLexicalRank: 2,
    rawFallbackLexicalRank: null,
    coreFusionRank: 1,
};

function passEvidence(candidateId: string): SearchPassEvidenceV1 {
    return buildSearchPassEvidenceV1({
        candidateId,
        passes: [
            { passId: 'core-dense', rank: 1, rrfK: 100 },
            { passId: 'core-lexical', rank: 2, rrfK: 100 },
        ],
    });
}

function input() {
    const admissionOrder = ['a', 'b', 'c'];
    return {
        queryId: 'query-1',
        admissionOrder,
        baselineScoreByCandidateId: new Map([['a', 10], ['b', 8], ['c', 5]]),
        candidateTraceByCandidateId: new Map(admissionOrder.map((id) => [
            id,
            { ...TRACE, candidateId: id },
        ])),
        passEvidenceByCandidateId: new Map(admissionOrder.map((id) => [id, passEvidence(id)])),
    };
}

test('assembles_one_record_per_post_eligibility_candidate', () => {
    const records = assembleDeterministicRankingEvidenceV1(input());

    // Exactly one record per post-admission candidate, in admission order.
    assert.deepEqual(records.map((record) => record.candidateId), ['a', 'b', 'c']);
    assert.equal(new Set(records.map((record) => record.candidateId)).size, 3);

    for (const [index, record] of records.entries()) {
        assert.equal(record.schemaVersion, 'deterministic_ranking_evidence_v1');
        assert.equal(record.evidenceStage, 'post_admission_pre_residual');
        assert.equal(record.admissionRank, index + 1);
        assert.equal(record.queryId, 'query-1');
        assert.equal(record.candidateTrace.candidateId, record.candidateId);
        assert.deepEqual(record.retrievalPasses, ['core-dense', 'core-lexical']);
        assert.deepEqual(record.rrfContributions.map((entry) => entry.passId), ['core-dense', 'core-lexical']);
    }

    // Missing candidate evidence is rejected (no invented membership).
    const missingTrace = input();
    missingTrace.candidateTraceByCandidateId = new Map([['a', { ...TRACE, candidateId: 'a' }]]);
    assert.throws(() => assembleDeterministicRankingEvidenceV1(missingTrace));

    // Duplicate admission entries are rejected.
    const duplicate = input();
    duplicate.admissionOrder = ['a', 'a', 'b'];
    assert.throws(() => assembleDeterministicRankingEvidenceV1(duplicate));

    // Pre-admission candidates cannot appear (unknown trace/score/pass evidence rejected).
    const foreign = input();
    foreign.admissionOrder = ['a', 'b', 'c', 'not-admitted'];
    assert.throws(() => assembleDeterministicRankingEvidenceV1(foreign));

    // Empty admission set is rejected.
    const empty = input();
    empty.admissionOrder = [];
    assert.throws(() => assembleDeterministicRankingEvidenceV1(empty));
});
