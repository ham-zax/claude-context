import crypto from 'node:crypto';
import {
    parseQualifiedRerankerV1,
    qualificationScopeKeyV1,
    type QualifiedRerankerV1,
    type SelectedArtifactMode,
    type ServiceClass,
} from './ranking-policy-qualification.js';

export const POST_G7_RECEIPT_BASE_KEYS = [
    'schemaVersion', 'receiptType', 'issuedAt', 'issuerIdentity',
    'contractSealSha256', 'implementationSealSha256',
] as const;

export const ARTIFACT_RECEIPT_BASE_KEYS = [
    ...POST_G7_RECEIPT_BASE_KEYS,
    'artifactSha256', 'qualificationTargetSha256', 'serviceClass',
    'selectedArtifactMode', 'qualificationScopeKey', 'qualifiedRerankers',
] as const;

export interface PostG7ReceiptBaseV1 {
    schemaVersion: string;
    receiptType: string;
    issuedAt: string;
    issuerIdentity: string;
    contractSealSha256: string;
    implementationSealSha256: string;
}

export interface ArtifactReceiptBaseV1 extends PostG7ReceiptBaseV1 {
    artifactSha256: string;
    qualificationTargetSha256: string;
    serviceClass: ServiceClass;
    selectedArtifactMode: SelectedArtifactMode;
    qualificationScopeKey: string;
    qualifiedRerankers: QualifiedRerankerV1[];
}

const SHA256 = /^[a-f0-9]{64}$/;

export function canonicalJsonV1(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJsonV1).join(',')}]`;
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonV1(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function canonicalReceiptSha256V1(value: unknown): string {
    return crypto.createHash('sha256').update(canonicalJsonV1(value)).digest('hex');
}

export function asReceiptRecordV1(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    return value as Record<string, unknown>;
}

export function assertReceiptExactKeysV1(input: Record<string, unknown>, extensionKeys: readonly string[], label: string): void {
    const expected = [...ARTIFACT_RECEIPT_BASE_KEYS, ...extensionKeys].sort();
    const actual = Object.keys(input).sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
        throw new Error(`${label} must contain exact fields.`);
    }
}

function exactPostG7(input: Record<string, unknown>, extensionKeys: readonly string[], label: string): void {
    const expected = [...POST_G7_RECEIPT_BASE_KEYS, ...extensionKeys].sort();
    const actual = Object.keys(input).sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
        throw new Error(`${label} must contain exact fields.`);
    }
}

export function parseReceiptSha256V1(value: unknown, label: string): string {
    if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
    return value;
}

function parseText(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be non-empty.`);
    return value;
}

function parseIssuedAt(value: unknown): string {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
        throw new Error('issuedAt must be canonical ISO-8601.');
    }
    return value;
}

function parseServiceClass(value: unknown): ServiceClass {
    if (value !== 'online' && value !== 'offline_linux_x64') throw new Error('serviceClass is invalid.');
    return value;
}

function parseSelectedMode(value: unknown): SelectedArtifactMode {
    if (value !== 'disabled' && value !== 'provider_derived') throw new Error('selectedArtifactMode is invalid.');
    return value;
}

export function parseArtifactReceiptBaseFieldsV1(input: Record<string, unknown>): ArtifactReceiptBaseV1 {
    const selectedArtifactMode = parseSelectedMode(input.selectedArtifactMode);
    if (!Array.isArray(input.qualifiedRerankers)) throw new Error('qualifiedRerankers must be an array.');
    const qualifiedRerankers = input.qualifiedRerankers.map(parseQualifiedRerankerV1);
    if (selectedArtifactMode === 'disabled' && qualifiedRerankers.length !== 0) throw new Error('Disabled receipts must have no qualified rerankers.');
    if (selectedArtifactMode === 'provider_derived' && qualifiedRerankers.length !== 1) throw new Error('Provider-derived receipts require one qualified reranker.');
    const base: ArtifactReceiptBaseV1 = {
        schemaVersion: parseText(input.schemaVersion, 'schemaVersion'),
        receiptType: parseText(input.receiptType, 'receiptType'),
        issuedAt: parseIssuedAt(input.issuedAt),
        issuerIdentity: parseText(input.issuerIdentity, 'issuerIdentity'),
        contractSealSha256: parseReceiptSha256V1(input.contractSealSha256, 'contractSealSha256'),
        implementationSealSha256: parseReceiptSha256V1(input.implementationSealSha256, 'implementationSealSha256'),
        artifactSha256: parseReceiptSha256V1(input.artifactSha256, 'artifactSha256'),
        qualificationTargetSha256: parseReceiptSha256V1(input.qualificationTargetSha256, 'qualificationTargetSha256'),
        serviceClass: parseServiceClass(input.serviceClass),
        selectedArtifactMode,
        qualificationScopeKey: parseReceiptSha256V1(input.qualificationScopeKey, 'qualificationScopeKey'),
        qualifiedRerankers,
    };
    if (qualificationScopeKeyV1(base) !== base.qualificationScopeKey) {
        throw new Error('qualificationScopeKey does not match receipt scope fields.');
    }
    return base;
}

function parsePostG7BaseFields(input: Record<string, unknown>): PostG7ReceiptBaseV1 {
    return {
        schemaVersion: parseText(input.schemaVersion, 'schemaVersion'),
        receiptType: parseText(input.receiptType, 'receiptType'),
        issuedAt: parseIssuedAt(input.issuedAt),
        issuerIdentity: parseText(input.issuerIdentity, 'issuerIdentity'),
        contractSealSha256: parseReceiptSha256V1(input.contractSealSha256, 'contractSealSha256'),
        implementationSealSha256: parseReceiptSha256V1(input.implementationSealSha256, 'implementationSealSha256'),
    };
}

function parseStringArray(value: unknown, label: string): string[] {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
        throw new Error(`${label} must contain non-empty strings.`);
    }
    if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicates.`);
    return [...value];
}

function parseComparator(value: unknown): 'available' | 'unavailable' | 'not_required' {
    if (value !== 'available' && value !== 'unavailable' && value !== 'not_required') throw new Error('groupedComparator is invalid.');
    return value;
}

export function parseSelectedModeReplayReceiptV1(value: unknown): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'SelectedModeReplayReceiptV1');
    assertReceiptExactKeysV1(input, ['mode', 'replayManifestSha256', 'replayResultsSha256', 'derivedNeuralEvidenceSha256'], 'SelectedModeReplayReceiptV1');
    const base = parseArtifactReceiptBaseFieldsV1(input);
    if (base.schemaVersion !== 'selected_mode_replay_receipt_v1' || base.receiptType !== 'selected_mode_replay' || input.mode !== base.selectedArtifactMode) {
        throw new Error('Selected-mode replay receipt identity mismatch.');
    }
    return {
        ...base,
        mode: base.selectedArtifactMode,
        replayManifestSha256: parseReceiptSha256V1(input.replayManifestSha256, 'replayManifestSha256'),
        replayResultsSha256: parseReceiptSha256V1(input.replayResultsSha256, 'replayResultsSha256'),
        derivedNeuralEvidenceSha256: input.derivedNeuralEvidenceSha256 === null ? null : parseReceiptSha256V1(input.derivedNeuralEvidenceSha256, 'derivedNeuralEvidenceSha256'),
    };
}

export function parseBaselineReplayReceiptV1(value: unknown): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'BaselineReplayReceiptV1');
    assertReceiptExactKeysV1(input, ['replayManifestSha256', 'replayResultsSha256', 'productEnvelopeSha256'], 'BaselineReplayReceiptV1');
    const base = parseArtifactReceiptBaseFieldsV1(input);
    if (base.schemaVersion !== 'baseline_replay_receipt_v1' || base.receiptType !== 'baseline_replay') throw new Error('Baseline replay receipt identity mismatch.');
    return { ...base, replayManifestSha256: parseReceiptSha256V1(input.replayManifestSha256, 'replayManifestSha256'), replayResultsSha256: parseReceiptSha256V1(input.replayResultsSha256, 'replayResultsSha256'), productEnvelopeSha256: parseReceiptSha256V1(input.productEnvelopeSha256, 'productEnvelopeSha256') };
}

function parseGateReceipt(value: unknown, schemaVersion: string, receiptType: string, resultField: string, failureField: string): Record<string, unknown> {
    const input = asReceiptRecordV1(value, receiptType);
    assertReceiptExactKeysV1(input, ['selectedModeReplayReceiptSha256', resultField, 'passed', failureField], receiptType);
    const base = parseArtifactReceiptBaseFieldsV1(input);
    if (base.schemaVersion !== schemaVersion || base.receiptType !== receiptType) throw new Error(`${receiptType} identity mismatch.`);
    if (typeof input.passed !== 'boolean') throw new Error(`${receiptType}.passed must be boolean.`);
    return { ...base, selectedModeReplayReceiptSha256: parseReceiptSha256V1(input.selectedModeReplayReceiptSha256, 'selectedModeReplayReceiptSha256'), [resultField]: parseReceiptSha256V1(input[resultField], resultField), passed: input.passed, [failureField]: parseStringArray(input[failureField], failureField) };
}

export const parseSliceGateReceiptV1 = (value: unknown): Record<string, unknown> => parseGateReceipt(value, 'slice_gate_receipt_v1', 'slice_gate', 'sliceResultSha256', 'failedSliceCodes');
export const parseCounterfactualGateReceiptV1 = (value: unknown): Record<string, unknown> => parseGateReceipt(value, 'counterfactual_gate_receipt_v1', 'counterfactual_gate', 'counterfactualResultSha256', 'failureCodes');
export const parseResourceGateReceiptV1 = (value: unknown): Record<string, unknown> => {
    const input = asReceiptRecordV1(value, 'ResourceGateReceiptV1');
    assertReceiptExactKeysV1(input, ['selectedModeReplayReceiptSha256', 'resourceHarnessResultSha256', 'environmentIdentitySha256', 'passed', 'failureCodes'], 'ResourceGateReceiptV1');
    const base = parseArtifactReceiptBaseFieldsV1(input);
    if (base.schemaVersion !== 'resource_gate_receipt_v1' || base.receiptType !== 'resource_gate') throw new Error('Resource gate receipt identity mismatch.');
    if (typeof input.passed !== 'boolean') throw new Error('Resource gate passed must be boolean.');
    return { ...base, selectedModeReplayReceiptSha256: parseReceiptSha256V1(input.selectedModeReplayReceiptSha256, 'selectedModeReplayReceiptSha256'), resourceHarnessResultSha256: parseReceiptSha256V1(input.resourceHarnessResultSha256, 'resourceHarnessResultSha256'), environmentIdentitySha256: parseReceiptSha256V1(input.environmentIdentitySha256, 'environmentIdentitySha256'), passed: input.passed, failureCodes: parseStringArray(input.failureCodes, 'failureCodes') };
};

export function parseOfflineQualificationReceiptV1(value: unknown): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'OfflineQualificationReceiptV1');
    assertReceiptExactKeysV1(input, [
        'registryReadyReceiptSha256', 'expectedRegistrySha256', 'groupedComparator',
        'selectedModeReplayReceiptSha256', 'baselineReplayReceiptSha256', 'sliceGateReceiptSha256',
        'counterfactualGateReceiptSha256', 'resourceGateReceiptSha256', 'tuningManifestSha256',
        'corpusManifestSha256', 'verdict',
    ], 'OfflineQualificationReceiptV1');
    const base = parseArtifactReceiptBaseFieldsV1(input);
    if (base.schemaVersion !== 'offline_qualification_receipt_v1' || base.receiptType !== 'offline_qualification' || input.verdict !== 'offline_qualified') {
        throw new Error('Offline qualification receipt identity mismatch.');
    }
    return {
        ...base,
        registryReadyReceiptSha256: parseReceiptSha256V1(input.registryReadyReceiptSha256, 'registryReadyReceiptSha256'),
        expectedRegistrySha256: parseReceiptSha256V1(input.expectedRegistrySha256, 'expectedRegistrySha256'),
        groupedComparator: parseComparator(input.groupedComparator),
        selectedModeReplayReceiptSha256: parseReceiptSha256V1(input.selectedModeReplayReceiptSha256, 'selectedModeReplayReceiptSha256'),
        baselineReplayReceiptSha256: parseReceiptSha256V1(input.baselineReplayReceiptSha256, 'baselineReplayReceiptSha256'),
        sliceGateReceiptSha256: parseReceiptSha256V1(input.sliceGateReceiptSha256, 'sliceGateReceiptSha256'),
        counterfactualGateReceiptSha256: parseReceiptSha256V1(input.counterfactualGateReceiptSha256, 'counterfactualGateReceiptSha256'),
        resourceGateReceiptSha256: parseReceiptSha256V1(input.resourceGateReceiptSha256, 'resourceGateReceiptSha256'),
        tuningManifestSha256: parseReceiptSha256V1(input.tuningManifestSha256, 'tuningManifestSha256'),
        corpusManifestSha256: parseReceiptSha256V1(input.corpusManifestSha256, 'corpusManifestSha256'),
        verdict: 'offline_qualified',
    };
}

export function parseOfflineQualificationRejectionReceiptV1(value: unknown): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'OfflineQualificationRejectionReceiptV1');
    assertReceiptExactKeysV1(input, ['registryReadyReceiptSha256', 'expectedRegistrySha256', 'groupedComparator', 'selectedModeReplayReceiptSha256', 'failedGateReceiptSha256', 'verdict'], 'OfflineQualificationRejectionReceiptV1');
    const base = parseArtifactReceiptBaseFieldsV1(input);
    if (base.schemaVersion !== 'offline_qualification_rejection_receipt_v1' || base.receiptType !== 'offline_qualification_rejection' || input.verdict !== 'rejected') throw new Error('Offline rejection receipt identity mismatch.');
    return { ...base, registryReadyReceiptSha256: parseReceiptSha256V1(input.registryReadyReceiptSha256, 'registryReadyReceiptSha256'), expectedRegistrySha256: parseReceiptSha256V1(input.expectedRegistrySha256, 'expectedRegistrySha256'), groupedComparator: parseComparator(input.groupedComparator), selectedModeReplayReceiptSha256: parseReceiptSha256V1(input.selectedModeReplayReceiptSha256, 'selectedModeReplayReceiptSha256'), failedGateReceiptSha256: parseReceiptSha256V1(input.failedGateReceiptSha256, 'failedGateReceiptSha256'), verdict: 'rejected' };
}

export function parseOfflineQualificationInsufficientEvidenceReceiptV1(value: unknown): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'OfflineQualificationInsufficientEvidenceReceiptV1');
    assertReceiptExactKeysV1(input, ['registryReadyReceiptSha256', 'expectedRegistrySha256', 'groupedComparator', 'selectedModeReplayReceiptSha256', 'missingEvidenceCodes', 'verdict'], 'OfflineQualificationInsufficientEvidenceReceiptV1');
    const base = parseArtifactReceiptBaseFieldsV1(input);
    if (base.schemaVersion !== 'offline_qualification_insufficient_receipt_v1' || base.receiptType !== 'offline_qualification_insufficient' || input.verdict !== 'insufficient_evidence') throw new Error('Offline insufficient receipt identity mismatch.');
    return { ...base, registryReadyReceiptSha256: parseReceiptSha256V1(input.registryReadyReceiptSha256, 'registryReadyReceiptSha256'), expectedRegistrySha256: parseReceiptSha256V1(input.expectedRegistrySha256, 'expectedRegistrySha256'), groupedComparator: parseComparator(input.groupedComparator), selectedModeReplayReceiptSha256: input.selectedModeReplayReceiptSha256 === null ? null : parseReceiptSha256V1(input.selectedModeReplayReceiptSha256, 'selectedModeReplayReceiptSha256'), missingEvidenceCodes: parseStringArray(input.missingEvidenceCodes, 'missingEvidenceCodes'), verdict: 'insufficient_evidence' };
}

export function parseRegistryInitializationReceiptV1(value: unknown): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'RegistryInitializationReceiptV1');
    exactPostG7(input, ['trustedRootIdentitySha256', 'previousRegistrySha256', 'newRegistrySha256', 'transitionKind'], 'RegistryInitializationReceiptV1');
    const base = parsePostG7BaseFields(input);
    if (base.schemaVersion !== 'registry_initialization_receipt_v1' || base.receiptType !== 'registry_initialization' || input.previousRegistrySha256 !== null || input.transitionKind !== 'initialize_genesis') throw new Error('Registry initialization receipt identity mismatch.');
    return { ...base, trustedRootIdentitySha256: parseReceiptSha256V1(input.trustedRootIdentitySha256, 'trustedRootIdentitySha256'), previousRegistrySha256: null, newRegistrySha256: parseReceiptSha256V1(input.newRegistrySha256, 'newRegistrySha256'), transitionKind: 'initialize_genesis' };
}

export function parseRegistryReadyReceiptV1(value: unknown): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'RegistryReadyReceiptV1');
    const hasInitialization = Object.prototype.hasOwnProperty.call(input, 'initializationReceiptSha256');
    exactPostG7(input, hasInitialization
        ? ['trustedRootIdentitySha256', 'currentRegistrySha256', 'initializationReceiptSha256', 'platformCapabilityDecisionSha256']
        : ['trustedRootIdentitySha256', 'currentRegistrySha256', 'platformCapabilityDecisionSha256'], 'RegistryReadyReceiptV1');
    const base = parsePostG7BaseFields(input);
    if (base.schemaVersion !== 'registry_ready_receipt_v1' || base.receiptType !== 'registry_ready') throw new Error('Registry ready receipt identity mismatch.');
    return { ...base, trustedRootIdentitySha256: parseReceiptSha256V1(input.trustedRootIdentitySha256, 'trustedRootIdentitySha256'), currentRegistrySha256: parseReceiptSha256V1(input.currentRegistrySha256, 'currentRegistrySha256'), ...(hasInitialization ? { initializationReceiptSha256: parseReceiptSha256V1(input.initializationReceiptSha256, 'initializationReceiptSha256') } : {}), platformCapabilityDecisionSha256: parseReceiptSha256V1(input.platformCapabilityDecisionSha256, 'platformCapabilityDecisionSha256') };
}

export function transitionChainSha256V1(input: {
    previousTransitionReceiptSha256: string | null;
    transitionKind: string;
    previousRegistrySha256: string;
    newRegistrySha256: string;
    triggeringReceiptSha256: string;
}): string {
    return canonicalReceiptSha256V1({
        previousTransitionReceiptSha256: input.previousTransitionReceiptSha256,
        transitionKind: input.transitionKind,
        previousRegistrySha256: input.previousRegistrySha256,
        newRegistrySha256: input.newRegistrySha256,
        triggeringReceiptSha256: input.triggeringReceiptSha256,
    });
}

export function parseRegistryTransitionReceiptV1(value: unknown, options: { expectedPreviousReceiptSha256?: string | null } = {}): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'RegistryTransitionReceiptV1');
    assertReceiptExactKeysV1(input, [
        'transitionKind', 'previousRegistrySha256', 'newRegistrySha256', 'entryKey', 'entryBeforeSha256',
        'entryAfterSha256', 'triggeringReceiptSha256', 'previousReceiptSha256',
        'previousTransitionReceiptSha256', 'transitionChainSha256',
    ], 'RegistryTransitionReceiptV1');
    const base = parseArtifactReceiptBaseFieldsV1(input);
    if (base.schemaVersion !== 'registry_transition_receipt_v1' || base.receiptType !== 'registry_transition') throw new Error('Registry transition receipt identity mismatch.');
    const transitionKind = input.transitionKind;
    if (!['create_pending_heldout', 'activate_pending', 'reject_pending', 'administrative_revoke'].includes(String(transitionKind))) throw new Error('Registry transitionKind is invalid.');
    const entryKey = asReceiptRecordV1(input.entryKey, 'entryKey');
    const entryKeyFields = Object.keys(entryKey).sort();
    if (entryKeyFields.join(',') !== 'artifactSha256,qualificationScopeKey,serviceClass') throw new Error('entryKey must contain exact fields.');
    const parsedEntryKey = {
        artifactSha256: parseReceiptSha256V1(entryKey.artifactSha256, 'entryKey.artifactSha256'),
        serviceClass: entryKey.serviceClass,
        qualificationScopeKey: parseReceiptSha256V1(entryKey.qualificationScopeKey, 'entryKey.qualificationScopeKey'),
    };
    if (parsedEntryKey.artifactSha256 !== base.artifactSha256 || parsedEntryKey.serviceClass !== base.serviceClass || parsedEntryKey.qualificationScopeKey !== base.qualificationScopeKey) {
        throw new Error('Registry transition entryKey does not match artifact receipt scope.');
    }
    const previousReceiptSha256 = input.previousReceiptSha256 === null ? null : parseReceiptSha256V1(input.previousReceiptSha256, 'previousReceiptSha256');
    const triggeringReceiptSha256 = parseReceiptSha256V1(input.triggeringReceiptSha256, 'triggeringReceiptSha256');
    if (options.expectedPreviousReceiptSha256 !== undefined && previousReceiptSha256 !== options.expectedPreviousReceiptSha256) {
        throw new Error('Registry transition previous receipt does not match expected semantic predecessor.');
    }
    if (transitionKind === 'create_pending_heldout' && previousReceiptSha256 !== null) throw new Error('create_pending_heldout previousReceiptSha256 must be null.');
    if (transitionKind !== 'create_pending_heldout' && previousReceiptSha256 !== triggeringReceiptSha256) {
        throw new Error('Registry transition previous receipt and triggering receipt must match.');
    }
    const previousTransitionReceiptSha256 = input.previousTransitionReceiptSha256 === null ? null : parseReceiptSha256V1(input.previousTransitionReceiptSha256, 'previousTransitionReceiptSha256');
    const previousRegistrySha256 = parseReceiptSha256V1(input.previousRegistrySha256, 'previousRegistrySha256');
    const newRegistrySha256 = parseReceiptSha256V1(input.newRegistrySha256, 'newRegistrySha256');
    const expectedChain = transitionChainSha256V1({ previousTransitionReceiptSha256, transitionKind: String(transitionKind), previousRegistrySha256, newRegistrySha256, triggeringReceiptSha256 });
    if (input.transitionChainSha256 !== expectedChain) throw new Error('Registry transition chain digest mismatch.');
    return {
        ...base,
        transitionKind,
        previousRegistrySha256,
        newRegistrySha256,
        entryKey: parsedEntryKey,
        entryBeforeSha256: input.entryBeforeSha256 === null ? null : parseReceiptSha256V1(input.entryBeforeSha256, 'entryBeforeSha256'),
        entryAfterSha256: parseReceiptSha256V1(input.entryAfterSha256, 'entryAfterSha256'),
        triggeringReceiptSha256,
        previousReceiptSha256,
        previousTransitionReceiptSha256,
        transitionChainSha256: expectedChain,
    };
}

export function parseRevocationAuthorizationReceiptV1(value: unknown): Record<string, unknown> {
    const input = asReceiptRecordV1(value, 'RevocationAuthorizationReceiptV1');
    assertReceiptExactKeysV1(input, ['reasonCode', 'ownerDecisionSha256'], 'RevocationAuthorizationReceiptV1');
    const base = parseArtifactReceiptBaseFieldsV1(input);
    if (base.schemaVersion !== 'revocation_authorization_receipt_v1' || base.receiptType !== 'revocation_authorization') throw new Error('Revocation authorization receipt identity mismatch.');
    return { ...base, reasonCode: parseText(input.reasonCode, 'reasonCode'), ownerDecisionSha256: parseReceiptSha256V1(input.ownerDecisionSha256, 'ownerDecisionSha256') };
}
