import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRankingPolicyQualificationRegistryV1, qualificationScopeKeyV1 } from './ranking-policy-qualification.js';

const sha = (char: string) => char.repeat(64);
const base = {
    artifactSha256: sha('a'),
    serviceClass: 'online' as const,
    qualificationTargetSha256: sha('b'),
    selectedArtifactMode: 'disabled' as const,
    qualifiedRerankers: [],
    offlineQualificationReceiptSha256: sha('c'),
};
const key = qualificationScopeKeyV1(base);
const entry = { ...base, qualificationScopeKey: key, status: 'pending_heldout' };

test('rejects_duplicate_logical_entry_keys_and_noncanonical_order', () => {
    assert.equal(parseRankingPolicyQualificationRegistryV1({ schemaVersion: 'ranking_policy_qualification_registry_v1', entries: [entry] }).entries.length, 1);
    assert.throws(() => parseRankingPolicyQualificationRegistryV1({ schemaVersion: 'ranking_policy_qualification_registry_v1', entries: [entry, entry] }), /duplicate/i);
    const later = { ...entry, artifactSha256: sha('f'), qualificationScopeKey: qualificationScopeKeyV1(base) };
    assert.throws(() => parseRankingPolicyQualificationRegistryV1({ schemaVersion: 'ranking_policy_qualification_registry_v1', entries: [later, entry] }), /canonical order/i);
});
