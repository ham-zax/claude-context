import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalReceiptSha256V1 } from './ranking-qualification-receipts.js';
import { parseHeldoutReceiptChainV1 } from './ranking-heldout-receipts.js';
import { qualificationScopeKeyV1 } from './ranking-policy-qualification.js';

const sha = (char: string) => char.repeat(64);
const scope = {
    serviceClass: 'online' as const,
    qualificationTargetSha256: sha('c'),
    selectedArtifactMode: 'disabled' as const,
    qualifiedRerankers: [],
};
const base = {
    issuedAt: '2026-08-06T00:00:00.000Z',
    issuerIdentity: 'ranking-v3-test',
    contractSealSha256: sha('a'),
    implementationSealSha256: sha('b'),
    artifactSha256: sha('f'),
    ...scope,
    qualificationScopeKey: qualificationScopeKeyV1(scope),
};

test('heldout_chain_rejects_foreign_previous_receipt_digest', () => {
    const owner = {
        ...base,
        schemaVersion: 'owner_authorization_receipt_v1',
        receiptType: 'owner_authorization',
        heldoutManifestSha256: sha('1'),
        h10RegistrySha256: sha('2'),
        authorizationDecisionSha256: sha('3'),
    };
    const opening = {
        ...base,
        schemaVersion: 'heldout_opening_record_v1',
        receiptType: 'heldout_opening',
        previousReceiptSha256: canonicalReceiptSha256V1(owner),
        ownerAuthorizationReceiptSha256: canonicalReceiptSha256V1(owner),
        heldoutManifestSha256: sha('1'),
        verifiedRegistrySha256: sha('2'),
        executableManifestSha256: sha('4'),
    };
    const execution = {
        ...base,
        schemaVersion: 'heldout_execution_receipt_v1',
        receiptType: 'heldout_execution',
        previousReceiptSha256: canonicalReceiptSha256V1(opening),
        openingRecordSha256: canonicalReceiptSha256V1(opening),
        heldoutManifestSha256: sha('1'),
        resultsSha256: sha('5'),
        executionCommandSha256: sha('6'),
    };
    const acceptance = {
        ...base,
        schemaVersion: 'heldout_acceptance_receipt_v1',
        receiptType: 'heldout_acceptance',
        previousReceiptSha256: canonicalReceiptSha256V1(execution),
        executionReceiptSha256: canonicalReceiptSha256V1(execution),
        decision: 'accepted',
        adjudicationResultSha256: sha('7'),
    };
    const chain = [owner, opening, execution, acceptance];
    assert.equal(parseHeldoutReceiptChainV1(chain).length, 4);
    assert.throws(() => parseHeldoutReceiptChainV1([owner, { ...opening, previousReceiptSha256: sha('f') }, execution, acceptance]), /foreign previous|predecessor/i);
});
