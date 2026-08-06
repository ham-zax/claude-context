import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { sealE3InputsV1, decideE3V1 } from './adjudicate-ranking-lofo.mjs';

const SHA = (seed) => crypto.createHash('sha256').update(seed).digest('hex');
const E2_RECEIPTS = [{ receiptSha256: SHA('e2-a') }, { receiptSha256: SHA('e2-b') }];

test('required_comparator_unavailable_is_sealed_then_decided_only_by_e3', () => {
    // Seal inputs with a required comparator that is unavailable.
    const seal = sealE3InputsV1({
        e2Receipts: E2_RECEIPTS,
        groupedComparatorPolicy: 'required',
        d1Receipt: null,
    });

    // The seal records unavailable_required and is NOT a terminal receipt.
    assert.equal(seal.schemaVersion, 'ranking_v3_e3_input_seal_v1');
    assert.equal(seal.groupedComparator.status, 'unavailable_required');
    assert.equal(seal.receiptType, undefined, 'input seal never emits a terminal receipt');
    assert.deepEqual(seal.e2ReceiptSha256s, [SHA('e2-a'), SHA('e2-b')].sort());
    assert.equal(typeof seal.inputSealSha256, 'string');

    // E3 alone emits exactly one E3InsufficientEvidenceReceiptV1.
    const receipt = decideE3V1({ inputSeal: seal, decision: { outcome: 'selected_disabled' } });
    assert.equal(receipt.schemaVersion, 'ranking_v3_e3_insufficient_evidence_receipt_v1');
    assert.equal(receipt.outcome, 'insufficient_evidence');
    assert.deepEqual(receipt.missingEvidenceCodes, ['grouped_comparator_required_unavailable']);
    assert.equal(receipt.e3InputSealSha256, seal.inputSealSha256);
    assert.equal(typeof receipt.receiptSha256, 'string');

    // The input seal cannot be coerced into a selection by E3.
    const again = decideE3V1({ inputSeal: seal, decision: { outcome: 'selected_provider_derived' } });
    assert.equal(again.outcome, 'insufficient_evidence');
});

test('available_or_optional_comparator_proceeds_through_e3_selection', () => {
    // Optional comparator, unavailable -> sealed as unavailable_optional; E3 may select.
    const optional = sealE3InputsV1({
        e2Receipts: E2_RECEIPTS,
        groupedComparatorPolicy: 'optional',
        d1Receipt: null,
    });
    assert.equal(optional.groupedComparator.status, 'unavailable_optional');
    const selected = decideE3V1({ inputSeal: optional, decision: { outcome: 'selected_disabled' } });
    assert.equal(selected.receiptType, 'e3_selection');
    assert.equal(selected.outcome, 'selected_disabled');
    assert.equal(selected.e3InputSealSha256, optional.inputSealSha256);

    // A valid D1 receipt at the barrier makes the comparator available.
    const d1 = { receiptSha256: SHA('d1') };
    const available = sealE3InputsV1({
        e2Receipts: E2_RECEIPTS,
        groupedComparatorPolicy: 'required',
        d1Receipt: d1,
    });
    assert.equal(available.groupedComparator.status, 'available');
    assert.equal(available.groupedComparator.comparatorReceiptSha256, SHA('d1'));
    const providerSelected = decideE3V1({ inputSeal: available, decision: { outcome: 'selected_provider_derived' } });
    assert.equal(providerSelected.outcome, 'selected_provider_derived');
});

test('validation_is_fail_closed', () => {
    assert.throws(() => sealE3InputsV1({ e2Receipts: [], groupedComparatorPolicy: 'optional', d1Receipt: null }));
    assert.throws(() => sealE3InputsV1({ e2Receipts: [{ receiptSha256: 'bad' }], groupedComparatorPolicy: 'optional', d1Receipt: null }));
    assert.throws(() => sealE3InputsV1({ e2Receipts: E2_RECEIPTS, groupedComparatorPolicy: 'never', d1Receipt: null }));
    assert.throws(() => decideE3V1({ inputSeal: { schemaVersion: 'wrong' }, decision: { outcome: 'selected_disabled' } }));
});
