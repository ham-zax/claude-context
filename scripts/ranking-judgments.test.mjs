import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJudgedPairsV1, parseRankingJudgmentV1 } from './ranking-judgments.mjs';

test('unjudged_candidate_never_becomes_grade_zero', () => {
    const judged = parseRankingJudgmentV1({ schemaVersion: 'ranking_judgment_v1', candidateId: 'a', judged: true, grade: 0, sourceSha256: 'a'.repeat(64), rationale: 'not relevant' });
    const unjudged = parseRankingJudgmentV1({ schemaVersion: 'ranking_judgment_v1', candidateId: 'b', judged: false, sourceSha256: 'b'.repeat(64) });
    assert.equal(judged.grade, 0);
    assert.equal('grade' in unjudged, false);
    assert.deepEqual(buildJudgedPairsV1([judged, unjudged]), []);
});

import { parseCandidatePoolV1, parseAdjudicatedJudgmentsV1, verifyProposalForPacketV1 } from './ranking-judgments.mjs';

const digest = (character) => character.repeat(64);

test('candidate_pool_binds_authority_and_contains_no_grades', () => {
    const pool = parseCandidatePoolV1({
        schemaVersion: 'ranking_candidate_pool_v1',
        packetId: 'packet-001',
        packetSha256: digest('a'),
        captureSha256: digest('b'),
        sourceTreeSha256: digest('c'),
        tasks: [{ taskId: 't1', taskSha256: digest('d'), candidates: [{ candidateId: 'c1', sourceSha256: digest('e') }] }],
    });
    assert.equal(pool.tasks[0].candidates[0].candidateId, 'c1');
    assert.throws(() => parseCandidatePoolV1({
        ...pool,
        tasks: [{ ...pool.tasks[0], candidates: [{ ...pool.tasks[0].candidates[0], grade: 0 }] }],
    }), /exact keys/i);
});

test('proposal_verification_binds_packet_tasks_and_source_rationale', () => {
    const proposal = {
        schemaVersion: 'ranking_proposal_v1',
        packetId: 'packet-001',
        packetSha256: digest('a'),
        agentId: 'agent-a',
        entries: [{ taskId: 't1', candidateId: 'c1', proposedGrade: 3, sourceSha256: digest('b'), rationale: 'owner source' }],
    };
    assert.equal(verifyProposalForPacketV1(proposal, { packetId: 'packet-001', packetSha256: digest('a'), taskIds: ['t1'] }).agentId, 'agent-a');
    assert.throws(() => verifyProposalForPacketV1({ ...proposal, entries: [{ ...proposal.entries[0], rationale: '' }] }, { packetId: 'packet-001', packetSha256: digest('a'), taskIds: ['t1'] }), /rationale/i);
});

test('adjudicated_parser_preserves_unjudged_without_grade', () => {
    const value = parseAdjudicatedJudgmentsV1({
        schemaVersion: 'ranking_adjudicated_judgments_v1',
        proposalAssemblySha256: digest('a'),
        judgments: [
            { schemaVersion: 'ranking_judgment_v1', taskId: 't1', candidateId: 'c1', judged: true, grade: 3, sourceSha256: digest('b'), rationale: 'owner' },
            { schemaVersion: 'ranking_judgment_v1', taskId: 't1', candidateId: 'c2', judged: false, sourceSha256: digest('c') },
        ],
    });
    assert.equal('grade' in value.judgments[1], false);
});
