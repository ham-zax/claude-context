import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverSearchExecutionRankingV3Evidence } from './search-execution.js';

test('phase0_envelopes_are_byte_identical', () => {
    const baseline = { kind: 'ok', scored: [{ id: 'c1', score: 1 }], warnings: [] } as const;
    const bytes = Buffer.from(JSON.stringify(baseline));
    const baseEvidence = { schemaVersion: 'search_execution_ranking_v3_evidence_v1', admittedCandidateIds: ['c1'], semanticPasses: [] } as const;
    const enabled = deliverSearchExecutionRankingV3Evidence(baseline, { ...baseEvidence, mode: 'enabled' }, () => undefined);
    const disabled = deliverSearchExecutionRankingV3Evidence(baseline, { ...baseEvidence, mode: 'disabled' }, () => undefined);
    assert.deepEqual(Buffer.from(JSON.stringify(enabled)), bytes);
    assert.deepEqual(Buffer.from(JSON.stringify(disabled)), bytes);
});
