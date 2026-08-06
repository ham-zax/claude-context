import assert from 'node:assert/strict';
import test from 'node:test';
import { rankingPolicyIdentityV1 } from './ranking-policy-identity.js';

test('disabled_mode_uses_reranker_disabled_v1', () => {
    assert.deepEqual(rankingPolicyIdentityV1({ mode: 'disabled', configuredRerankerIdentity: 'must-not-leak' }), {
        policyIdentity: 'search_ranking_policy_v3',
        rerankerIdentity: 'reranker_disabled_v1',
    });
});
