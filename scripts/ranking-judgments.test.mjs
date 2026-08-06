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
