import assert from 'node:assert/strict';
import test from 'node:test';
import {
    parseOfflineQualificationReceiptV1,
    parseRegistryTransitionReceiptV1,
    transitionChainSha256V1,
} from './ranking-qualification-receipts.js';
import { qualificationScopeKeyV1 } from './ranking-policy-qualification.js';

const sha = (char: string) => char.repeat(64);
const issuedAt = '2026-08-06T00:00:00.000Z';
const scope = {
    serviceClass: 'online' as const,
    qualificationTargetSha256: sha('c'),
    selectedArtifactMode: 'disabled' as const,
    qualifiedRerankers: [],
};
const base = {
    issuedAt,
    issuerIdentity: 'ranking-v3-test',
    contractSealSha256: sha('f'),
    implementationSealSha256: sha('1'),
    artifactSha256: sha('a'),
    ...scope,
    qualificationScopeKey: qualificationScopeKeyV1(scope),
};

test('qualification_and_registry_receipts_enforce_exact_fields_and_transition_chain', () => {
    const qualification = parseOfflineQualificationReceiptV1({
        ...base,
        schemaVersion: 'offline_qualification_receipt_v1',
        receiptType: 'offline_qualification',
        registryReadyReceiptSha256: sha('d'),
        expectedRegistrySha256: sha('e'),
        groupedComparator: 'not_required',
        selectedModeReplayReceiptSha256: sha('2'),
        baselineReplayReceiptSha256: sha('3'),
        sliceGateReceiptSha256: sha('4'),
        counterfactualGateReceiptSha256: sha('5'),
        resourceGateReceiptSha256: sha('6'),
        tuningManifestSha256: sha('7'),
        corpusManifestSha256: sha('8'),
        verdict: 'offline_qualified',
    });
    assert.equal(qualification.registryReadyReceiptSha256, sha('d'));
    const accepted = sha('2');
    const transitionFields = {
        previousTransitionReceiptSha256: sha('9'),
        transitionKind: 'activate_pending',
        previousRegistrySha256: sha('3'),
        newRegistrySha256: sha('4'),
        triggeringReceiptSha256: accepted,
    } as const;
    const transition = parseRegistryTransitionReceiptV1({
        ...base,
        schemaVersion: 'registry_transition_receipt_v1',
        receiptType: 'registry_transition',
        ...transitionFields,
        previousReceiptSha256: accepted,
        entryKey: { artifactSha256: sha('a'), serviceClass: 'online', qualificationScopeKey: base.qualificationScopeKey },
        entryBeforeSha256: sha('b'),
        entryAfterSha256: sha('c'),
        transitionChainSha256: transitionChainSha256V1(transitionFields),
    }, { expectedPreviousReceiptSha256: accepted });
    assert.equal(transition.previousReceiptSha256, accepted);
    assert.throws(() => parseRegistryTransitionReceiptV1({ ...transition, previousReceiptSha256: sha('6') }, { expectedPreviousReceiptSha256: accepted }), /previous receipt/i);
    assert.throws(() => parseRegistryTransitionReceiptV1({ ...transition, transitionChainSha256: sha('5') }), /chain digest/i);
});
