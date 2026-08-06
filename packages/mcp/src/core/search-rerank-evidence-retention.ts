import { parseValidatedRerankResponseV1, type ValidatedRerankResponseV1 } from './rerank-evidence.js';

export interface RawValidatedRerankEvidenceV1 {
    schemaVersion: 'raw_validated_rerank_evidence_v1';
    serviceClass: 'online' | 'offline_linux_x64';
    providerKey: string;
    rerankerIdentity: string;
    rerankerProjectionIdentity: string;
    providerConfigurationDigest: string;
    providerRequestContractSha256: string;
    baselineAdmissionSetSha256: string;
    canonicalRequestSha256: string;
    canonicalResponseSha256: string;
    requestCandidateIds: string[];
    response: ValidatedRerankResponseV1;
    outcome: { status: 'complete'; timeoutMs: number; attempts: number };
}

const SHA256 = /^[a-f0-9]{64}$/;
const EXACT_KEYS = [
    'serviceClass', 'providerKey', 'rerankerIdentity', 'rerankerProjectionIdentity',
    'providerConfigurationDigest', 'providerRequestContractSha256',
    'baselineAdmissionSetSha256', 'canonicalRequestSha256', 'canonicalResponseSha256',
    'requestCandidateIds', 'response', 'outcome',
].sort();

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
    const actual = Object.keys(value).sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
        throw new Error(`${label} must contain exact keys; derived fields are forbidden.`);
    }
}
function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be non-empty.`);
    return value;
}
function digest(value: unknown, label: string): string {
    if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
    return value;
}
function positiveInteger(value: unknown, label: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(`${label} must be a positive safe integer.`);
    return value as number;
}

export function retainRawValidatedRerankEvidenceV1(value: unknown): RawValidatedRerankEvidenceV1 {
    const input = record(value, 'RawValidatedRerankEvidenceV1 input');
    const acceptedKeys = Object.prototype.hasOwnProperty.call(input, 'schemaVersion')
        ? ['schemaVersion', ...EXACT_KEYS].sort()
        : EXACT_KEYS;
    exactKeys(input, acceptedKeys, 'RawValidatedRerankEvidenceV1 input');
    if (input.schemaVersion !== undefined && input.schemaVersion !== 'raw_validated_rerank_evidence_v1') {
        throw new Error('Raw validated evidence schema mismatch.');
    }
    if (input.serviceClass !== 'online' && input.serviceClass !== 'offline_linux_x64') {
        throw new Error('serviceClass is invalid.');
    }
    if (!Array.isArray(input.requestCandidateIds) || input.requestCandidateIds.length === 0) {
        throw new Error('requestCandidateIds must be a non-empty array.');
    }
    const requestCandidateIds = input.requestCandidateIds.map((entry, index) => text(entry, `requestCandidateIds[${index}]`));
    if (new Set(requestCandidateIds).size !== requestCandidateIds.length) throw new Error('requestCandidateIds contains duplicates.');
    const response = parseValidatedRerankResponseV1(input.response, requestCandidateIds);
    const outcome = record(input.outcome, 'outcome');
    exactKeys(outcome, ['attempts', 'status', 'timeoutMs'], 'outcome');
    if (outcome.status !== 'complete') throw new Error('Only a complete validated response may be retained.');
    return {
        schemaVersion: 'raw_validated_rerank_evidence_v1',
        serviceClass: input.serviceClass,
        providerKey: text(input.providerKey, 'providerKey'),
        rerankerIdentity: text(input.rerankerIdentity, 'rerankerIdentity'),
        rerankerProjectionIdentity: text(input.rerankerProjectionIdentity, 'rerankerProjectionIdentity'),
        providerConfigurationDigest: digest(input.providerConfigurationDigest, 'providerConfigurationDigest'),
        providerRequestContractSha256: digest(input.providerRequestContractSha256, 'providerRequestContractSha256'),
        baselineAdmissionSetSha256: digest(input.baselineAdmissionSetSha256, 'baselineAdmissionSetSha256'),
        canonicalRequestSha256: digest(input.canonicalRequestSha256, 'canonicalRequestSha256'),
        canonicalResponseSha256: digest(input.canonicalResponseSha256, 'canonicalResponseSha256'),
        requestCandidateIds,
        response,
        outcome: {
            status: 'complete',
            timeoutMs: positiveInteger(outcome.timeoutMs, 'timeoutMs'),
            attempts: positiveInteger(outcome.attempts, 'attempts'),
        },
    };
}
