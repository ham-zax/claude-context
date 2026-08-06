import crypto from 'node:crypto';

export type ServiceClass = 'online' | 'offline_linux_x64';
export type SelectedArtifactMode = 'disabled' | 'provider_derived';

export interface QualifiedRerankerV1 {
    providerKey: string;
    rerankerIdentity: string;
    rerankerProjectionIdentity: string;
    providerConfigurationDigest: string;
    providerRequestContractSha256: string;
}

export interface QualificationEntryKeyV1 {
    artifactSha256: string;
    serviceClass: ServiceClass;
    qualificationScopeKey: string;
}

export interface QualificationRegistryEntryBaseV1 extends QualificationEntryKeyV1 {
    qualificationTargetSha256: string;
    selectedArtifactMode: SelectedArtifactMode;
    qualifiedRerankers: QualifiedRerankerV1[];
    offlineQualificationReceiptSha256: string;
}

export type QualificationRegistryEntryV1 =
    | QualificationRegistryEntryBaseV1 & { status: 'pending_heldout' }
    | QualificationRegistryEntryBaseV1 & { status: 'activation_qualified'; heldoutAcceptanceReceiptSha256: string }
    | QualificationRegistryEntryBaseV1 & {
        status: 'revoked';
        terminalEvidence:
            | { reason: 'heldout_rejected'; heldoutRejectionReceiptSha256: string }
            | { reason: 'administrative_revocation'; revocationAuthorizationReceiptSha256: string };
    };

export interface RankingPolicyQualificationRegistryV1 {
    schemaVersion: 'ranking_policy_qualification_registry_v1';
    entries: QualificationRegistryEntryV1[];
}

const SHA256 = /^[a-f0-9]{64}$/;

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
        throw new Error(`${label} must contain exact keys.`);
    }
}

function sha(value: unknown, label: string): string {
    if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a SHA-256 digest.`);
    return value;
}

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be non-empty.`);
    return value;
}

function serviceClass(value: unknown): ServiceClass {
    if (value !== 'online' && value !== 'offline_linux_x64') throw new Error('serviceClass is invalid.');
    return value;
}

function selectedMode(value: unknown): SelectedArtifactMode {
    if (value !== 'disabled' && value !== 'provider_derived') throw new Error('selectedArtifactMode is invalid.');
    return value;
}

export function parseQualifiedRerankerV1(value: unknown): QualifiedRerankerV1 {
    const input = asRecord(value, 'QualifiedRerankerV1');
    exact(input, ['providerKey', 'rerankerIdentity', 'rerankerProjectionIdentity', 'providerConfigurationDigest', 'providerRequestContractSha256'], 'QualifiedRerankerV1');
    return {
        providerKey: text(input.providerKey, 'providerKey'),
        rerankerIdentity: text(input.rerankerIdentity, 'rerankerIdentity'),
        rerankerProjectionIdentity: text(input.rerankerProjectionIdentity, 'rerankerProjectionIdentity'),
        providerConfigurationDigest: sha(input.providerConfigurationDigest, 'providerConfigurationDigest'),
        providerRequestContractSha256: sha(input.providerRequestContractSha256, 'providerRequestContractSha256'),
    };
}

function parseQualifiedRerankers(value: unknown, mode: SelectedArtifactMode): QualifiedRerankerV1[] {
    if (!Array.isArray(value)) throw new Error('qualifiedRerankers must be an array.');
    const parsed = value.map(parseQualifiedRerankerV1);
    if (mode === 'disabled' && parsed.length !== 0) throw new Error('Disabled mode must have no qualified rerankers.');
    if (mode === 'provider_derived' && parsed.length !== 1) throw new Error('Provider-derived mode must have exactly one qualified reranker.');
    if (new Set(parsed.map((entry) => `${entry.providerKey}\0${entry.rerankerIdentity}\0${entry.rerankerProjectionIdentity}`)).size !== parsed.length) {
        throw new Error('qualifiedRerankers contains duplicates.');
    }
    return parsed;
}

export function qualificationScopeKeyV1(input: {
    serviceClass: ServiceClass;
    qualificationTargetSha256: string;
    selectedArtifactMode: SelectedArtifactMode;
    qualifiedRerankers: readonly QualifiedRerankerV1[];
}): string {
    const normalized = {
        serviceClass: serviceClass(input.serviceClass),
        qualificationTargetSha256: sha(input.qualificationTargetSha256, 'qualificationTargetSha256'),
        selectedArtifactMode: selectedMode(input.selectedArtifactMode),
        qualifiedRerankers: parseQualifiedRerankers([...input.qualifiedRerankers], input.selectedArtifactMode),
    };
    return crypto.createHash('sha256').update(canonicalJson(normalized)).digest('hex');
}

function parseEntry(value: unknown): QualificationRegistryEntryV1 {
    const input = asRecord(value, 'QualificationRegistryEntryV1');
    const status = input.status;
    if (status === 'pending_heldout') {
        exact(input, ['artifactSha256', 'serviceClass', 'qualificationScopeKey', 'qualificationTargetSha256', 'selectedArtifactMode', 'qualifiedRerankers', 'offlineQualificationReceiptSha256', 'status'], 'pending entry');
    } else if (status === 'activation_qualified') {
        exact(input, ['artifactSha256', 'serviceClass', 'qualificationScopeKey', 'qualificationTargetSha256', 'selectedArtifactMode', 'qualifiedRerankers', 'offlineQualificationReceiptSha256', 'status', 'heldoutAcceptanceReceiptSha256'], 'active entry');
    } else if (status === 'revoked') {
        exact(input, ['artifactSha256', 'serviceClass', 'qualificationScopeKey', 'qualificationTargetSha256', 'selectedArtifactMode', 'qualifiedRerankers', 'offlineQualificationReceiptSha256', 'status', 'terminalEvidence'], 'revoked entry');
    } else {
        throw new Error('Qualification registry status is invalid.');
    }
    const mode = selectedMode(input.selectedArtifactMode);
    const rerankers = parseQualifiedRerankers(input.qualifiedRerankers, mode);
    const common: QualificationRegistryEntryBaseV1 = {
        artifactSha256: sha(input.artifactSha256, 'artifactSha256'),
        serviceClass: serviceClass(input.serviceClass),
        qualificationScopeKey: sha(input.qualificationScopeKey, 'qualificationScopeKey'),
        qualificationTargetSha256: sha(input.qualificationTargetSha256, 'qualificationTargetSha256'),
        selectedArtifactMode: mode,
        qualifiedRerankers: rerankers,
        offlineQualificationReceiptSha256: sha(input.offlineQualificationReceiptSha256, 'offlineQualificationReceiptSha256'),
    };
    const expectedScopeKey = qualificationScopeKeyV1(common);
    if (common.qualificationScopeKey !== expectedScopeKey) throw new Error('qualificationScopeKey does not match canonical scope fields.');
    if (status === 'pending_heldout') return { ...common, status };
    if (status === 'activation_qualified') {
        return { ...common, status, heldoutAcceptanceReceiptSha256: sha(input.heldoutAcceptanceReceiptSha256, 'heldoutAcceptanceReceiptSha256') };
    }
    const terminal = asRecord(input.terminalEvidence, 'terminalEvidence');
    if (terminal.reason === 'heldout_rejected') {
        exact(terminal, ['reason', 'heldoutRejectionReceiptSha256'], 'heldout terminalEvidence');
        return { ...common, status: 'revoked', terminalEvidence: { reason: 'heldout_rejected', heldoutRejectionReceiptSha256: sha(terminal.heldoutRejectionReceiptSha256, 'heldoutRejectionReceiptSha256') } };
    }
    if (terminal.reason === 'administrative_revocation') {
        exact(terminal, ['reason', 'revocationAuthorizationReceiptSha256'], 'administrative terminalEvidence');
        return { ...common, status: 'revoked', terminalEvidence: { reason: 'administrative_revocation', revocationAuthorizationReceiptSha256: sha(terminal.revocationAuthorizationReceiptSha256, 'revocationAuthorizationReceiptSha256') } };
    }
    throw new Error('terminalEvidence reason is invalid.');
}

function logicalKey(entry: QualificationEntryKeyV1): string {
    return `${entry.artifactSha256}\0${entry.serviceClass}\0${entry.qualificationScopeKey}`;
}

export function parseRankingPolicyQualificationRegistryV1(value: unknown): RankingPolicyQualificationRegistryV1 {
    const input = asRecord(value, 'RankingPolicyQualificationRegistryV1');
    exact(input, ['schemaVersion', 'entries'], 'RankingPolicyQualificationRegistryV1');
    if (input.schemaVersion !== 'ranking_policy_qualification_registry_v1') throw new Error('Qualification registry schema mismatch.');
    if (!Array.isArray(input.entries)) throw new Error('Qualification registry entries must be an array.');
    const entries = input.entries.map(parseEntry);
    const keys = entries.map(logicalKey);
    if (new Set(keys).size !== keys.length) throw new Error('Qualification registry contains a duplicate logical entry key.');
    for (let index = 1; index < keys.length; index += 1) {
        if (Buffer.compare(Buffer.from(keys[index - 1], 'utf8'), Buffer.from(keys[index], 'utf8')) >= 0) {
            throw new Error('Qualification registry entries are not in canonical order.');
        }
    }
    return { schemaVersion: 'ranking_policy_qualification_registry_v1', entries };
}
