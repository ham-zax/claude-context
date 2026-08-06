import assert from 'node:assert/strict';
import test from 'node:test';
import { deliverSearchExecutionRankingV3Evidence } from './search-execution.js';

const outcome = { kind: 'ok', scored: [{ id: 'a' }], warnings: [] } as const;
const envelope = { schemaVersion: 'search_execution_ranking_v3_evidence_v1', mode: 'enabled', admittedCandidateIds: ['a'], semanticPasses: [] } as const;

test('evidence_hooks_preserve_baseline_enabled_and_disabled_envelopes', () => {
    const baselineBytes = JSON.stringify(outcome);
    const delivered: unknown[] = [];
    const enabled = deliverSearchExecutionRankingV3Evidence(outcome, envelope, (value) => delivered.push(value));
    const disabled = deliverSearchExecutionRankingV3Evidence(outcome, { ...envelope, mode: 'disabled' }, (value) => delivered.push(value));
    assert.equal(enabled, outcome);
    assert.equal(disabled, outcome);
    assert.equal(JSON.stringify(enabled), baselineBytes);
    assert.equal(JSON.stringify(disabled), baselineBytes);
    assert.deepEqual(delivered.map((value) => (value as { mode: string }).mode), ['enabled', 'disabled']);
});
