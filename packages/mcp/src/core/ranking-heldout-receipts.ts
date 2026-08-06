import {
    ARTIFACT_RECEIPT_BASE_KEYS,
    asReceiptRecordV1,
    assertReceiptExactKeysV1,
    canonicalReceiptSha256V1,
    parseArtifactReceiptBaseFieldsV1,
    parseReceiptSha256V1,
} from './ranking-qualification-receipts.js';

function parseReceipt(value: unknown, options: {
    schemaVersion: string;
    receiptType: string;
    extensionKeys: readonly string[];
}): Record<string, unknown> {
    const input = asReceiptRecordV1(value, options.receiptType);
    assertReceiptExactKeysV1(input, options.extensionKeys, options.receiptType);
    const base = parseArtifactReceiptBaseFieldsV1(input);
    if (base.schemaVersion !== options.schemaVersion || base.receiptType !== options.receiptType) {
        throw new Error(`${options.receiptType} identity mismatch.`);
    }
    return { ...base };
}

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be non-empty.`);
    return value;
}

export function parseOwnerAuthorizationReceiptV1(value: unknown): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'OwnerAuthorizationReceiptV1');
    const base = parseReceipt(input, { schemaVersion: 'owner_authorization_receipt_v1', receiptType: 'owner_authorization', extensionKeys: ['heldoutManifestSha256', 'h10RegistrySha256', 'authorizationDecisionSha256'] });
    return { ...base, heldoutManifestSha256: parseReceiptSha256V1(input.heldoutManifestSha256, 'heldoutManifestSha256'), h10RegistrySha256: parseReceiptSha256V1(input.h10RegistrySha256, 'h10RegistrySha256'), authorizationDecisionSha256: parseReceiptSha256V1(input.authorizationDecisionSha256, 'authorizationDecisionSha256') };
}

export function parseHeldoutOpeningRecordV1(value: unknown): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'HeldoutOpeningRecordV1');
    const base = parseReceipt(input, { schemaVersion: 'heldout_opening_record_v1', receiptType: 'heldout_opening', extensionKeys: ['previousReceiptSha256', 'ownerAuthorizationReceiptSha256', 'heldoutManifestSha256', 'verifiedRegistrySha256', 'executableManifestSha256'] });
    return { ...base, previousReceiptSha256: parseReceiptSha256V1(input.previousReceiptSha256, 'previousReceiptSha256'), ownerAuthorizationReceiptSha256: parseReceiptSha256V1(input.ownerAuthorizationReceiptSha256, 'ownerAuthorizationReceiptSha256'), heldoutManifestSha256: parseReceiptSha256V1(input.heldoutManifestSha256, 'heldoutManifestSha256'), verifiedRegistrySha256: parseReceiptSha256V1(input.verifiedRegistrySha256, 'verifiedRegistrySha256'), executableManifestSha256: parseReceiptSha256V1(input.executableManifestSha256, 'executableManifestSha256') };
}

export function parseHeldoutExecutionReceiptV1(value: unknown): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'HeldoutExecutionReceiptV1');
    const base = parseReceipt(input, { schemaVersion: 'heldout_execution_receipt_v1', receiptType: 'heldout_execution', extensionKeys: ['previousReceiptSha256', 'openingRecordSha256', 'heldoutManifestSha256', 'resultsSha256', 'executionCommandSha256'] });
    return { ...base, previousReceiptSha256: parseReceiptSha256V1(input.previousReceiptSha256, 'previousReceiptSha256'), openingRecordSha256: parseReceiptSha256V1(input.openingRecordSha256, 'openingRecordSha256'), heldoutManifestSha256: parseReceiptSha256V1(input.heldoutManifestSha256, 'heldoutManifestSha256'), resultsSha256: parseReceiptSha256V1(input.resultsSha256, 'resultsSha256'), executionCommandSha256: parseReceiptSha256V1(input.executionCommandSha256, 'executionCommandSha256') };
}

function parseAdjudicationReceipt(value: unknown, decision: 'accepted' | 'rejected'): Record<string, unknown> {
    const input = asReceiptRecordV1(value, `Heldout${decision}ReceiptV1`);
    const schemaVersion = decision === 'accepted' ? 'heldout_acceptance_receipt_v1' : 'heldout_rejection_receipt_v1';
    const receiptType = decision === 'accepted' ? 'heldout_acceptance' : 'heldout_rejection';
    const base = parseReceipt(input, { schemaVersion, receiptType, extensionKeys: ['previousReceiptSha256', 'executionReceiptSha256', 'decision', 'adjudicationResultSha256'] });
    if (input.decision !== decision) throw new Error(`Held-out decision must be ${decision}.`);
    return { ...base, previousReceiptSha256: parseReceiptSha256V1(input.previousReceiptSha256, 'previousReceiptSha256'), executionReceiptSha256: parseReceiptSha256V1(input.executionReceiptSha256, 'executionReceiptSha256'), decision, adjudicationResultSha256: parseReceiptSha256V1(input.adjudicationResultSha256, 'adjudicationResultSha256') };
}

export const parseHeldoutAcceptanceReceiptV1 = (value: unknown): Record<string, unknown> => parseAdjudicationReceipt(value, 'accepted');
export const parseHeldoutRejectionReceiptV1 = (value: unknown): Record<string, unknown> => parseAdjudicationReceipt(value, 'rejected');

export function parseRolloutSelectionReceiptV1(value: unknown): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'RolloutSelectionReceiptV1');
    const base = parseReceipt(input, { schemaVersion: 'rollout_selection_receipt_v1', receiptType: 'rollout_selection', extensionKeys: ['previousReceiptSha256', 'fromSelection', 'toSelection', 'selectedArtifactSha256', 'configurationDigest'] });
    if (!['baseline', 'learned_v3'].includes(String(input.fromSelection)) || !['baseline', 'learned_v3'].includes(String(input.toSelection))) throw new Error('Rollout selection values are invalid.');
    if (input.toSelection === 'learned_v3' && input.selectedArtifactSha256 === null) throw new Error('learned_v3 rollout requires selectedArtifactSha256.');
    if (input.toSelection === 'baseline' && input.selectedArtifactSha256 !== null) throw new Error('baseline rollout must not select an artifact.');
    return { ...base, previousReceiptSha256: parseReceiptSha256V1(input.previousReceiptSha256, 'previousReceiptSha256'), fromSelection: input.fromSelection, toSelection: input.toSelection, selectedArtifactSha256: input.selectedArtifactSha256 === null ? null : parseReceiptSha256V1(input.selectedArtifactSha256, 'selectedArtifactSha256'), configurationDigest: parseReceiptSha256V1(input.configurationDigest, 'configurationDigest') };
}

export function parseRollbackDrillReceiptV1(value: unknown): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'RollbackDrillReceiptV1');
    const base = parseReceipt(input, { schemaVersion: 'rollback_drill_receipt_v1', receiptType: 'rollback_drill', extensionKeys: ['previousReceiptSha256', 'learnedSelectionReceiptSha256', 'baselineSelectionReceiptSha256', 'reselectionReceiptSha256', 'staleContinuationProofSha256'] });
    return { ...base, previousReceiptSha256: parseReceiptSha256V1(input.previousReceiptSha256, 'previousReceiptSha256'), learnedSelectionReceiptSha256: parseReceiptSha256V1(input.learnedSelectionReceiptSha256, 'learnedSelectionReceiptSha256'), baselineSelectionReceiptSha256: parseReceiptSha256V1(input.baselineSelectionReceiptSha256, 'baselineSelectionReceiptSha256'), reselectionReceiptSha256: parseReceiptSha256V1(input.reselectionReceiptSha256, 'reselectionReceiptSha256'), staleContinuationProofSha256: parseReceiptSha256V1(input.staleContinuationProofSha256, 'staleContinuationProofSha256') };
}

export function parseLimitedActivationReceiptV1(value: unknown): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'LimitedActivationReceiptV1');
    const base = parseReceipt(input, { schemaVersion: 'limited_activation_receipt_v1', receiptType: 'limited_activation', extensionKeys: ['previousReceiptSha256', 'rollbackDrillReceiptSha256', 'activationConfigurationDigest'] });
    return { ...base, previousReceiptSha256: parseReceiptSha256V1(input.previousReceiptSha256, 'previousReceiptSha256'), rollbackDrillReceiptSha256: parseReceiptSha256V1(input.rollbackDrillReceiptSha256, 'rollbackDrillReceiptSha256'), activationConfigurationDigest: parseReceiptSha256V1(input.activationConfigurationDigest, 'activationConfigurationDigest') };
}

const RECEIPT_PARSERS: Record<string, (value: unknown) => Record<string, unknown>> = {
    owner_authorization: parseOwnerAuthorizationReceiptV1,
    heldout_opening: parseHeldoutOpeningRecordV1,
    heldout_execution: parseHeldoutExecutionReceiptV1,
    heldout_acceptance: parseHeldoutAcceptanceReceiptV1,
    heldout_rejection: parseHeldoutRejectionReceiptV1,
    rollout_selection: parseRolloutSelectionReceiptV1,
    rollback_drill: parseRollbackDrillReceiptV1,
    limited_activation: parseLimitedActivationReceiptV1,
};

export function parseHeldoutReceiptChainV1(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value) || value.length === 0) throw new Error('Held-out receipt chain must be a non-empty array.');
    const parsed: Record<string, unknown>[] = [];
    let previousDigest: string | null = null;
    let terminalDecision: 'accepted' | 'rejected' | null = null;
    for (let index = 0; index < value.length; index += 1) {
        const input = asReceiptRecordV1(value[index], `heldout chain receipt ${index}`);
        const parser = typeof input.receiptType === 'string' ? RECEIPT_PARSERS[input.receiptType] : undefined;
        if (!parser) throw new Error(`Unknown held-out receipt type '${String(input.receiptType)}'.`);
        const receipt = parser(input);
        if (index === 0) {
            if (receipt.receiptType !== 'owner_authorization') throw new Error('Held-out chain must begin with owner authorization.');
        } else {
            if (receipt.previousReceiptSha256 !== previousDigest) {
                throw new Error('Held-out receipt has a foreign previous receipt digest instead of its predecessor.');
            }
        }
        if (receipt.receiptType === 'heldout_acceptance' || receipt.receiptType === 'heldout_rejection') {
            const decision = receipt.receiptType === 'heldout_acceptance' ? 'accepted' : 'rejected';
            if (terminalDecision && terminalDecision !== decision) throw new Error('Held-out acceptance and rejection are mutually exclusive.');
            terminalDecision = decision;
        }
        previousDigest = canonicalReceiptSha256V1(receipt);
        parsed.push(receipt);
    }
    return parsed;
}

void ARTIFACT_RECEIPT_BASE_KEYS;
void text;
