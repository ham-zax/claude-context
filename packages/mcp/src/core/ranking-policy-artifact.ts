import crypto from 'node:crypto';

export interface NormalizationContractV1 {
    schemaVersion: 'ranking_normalization_contract_v1';
    featureOrder: string[];
    means: number[];
    scales: number[];
    missingValuePolicy: 'indicator_zero_fill';
}

export interface ResidualModelV1 {
    schemaVersion: 'ranking_residual_model_v1';
    featureSchema: 'search_features_v1';
    createdFromCommit: string;
    trainingFoldManifestSha256: string;
    trainingCodeSha256: string;
    trainingContractSha256: string;
    normalization: NormalizationContractV1;
    weights: number[];
    residualBounds: { maximumResidual: number };
}

export type FoldContenderDescriptorV1 =
    | {
        schemaVersion: 'ranking_fold_contender_v1';
        mode: 'disabled';
        residualModelSha256: string;
        qualificationTargetSha256: string;
        evaluationFoldManifestSha256: string;
    }
    | {
        schemaVersion: 'ranking_fold_contender_v1';
        mode: 'provider_derived';
        residualModelSha256: string;
        qualificationTargetSha256: string;
        providerRequestContractSha256: string;
        evaluationFoldManifestSha256: string;
    };

export type RankingPolicyV3Artifact = {
    schemaVersion: 'ranking_policy_v3';
    policyId: 'search_ranking_policy_v3';
    featureSchema: 'search_features_v1';
    createdFromCommit: string;
    trainingManifestSha256: string;
    trainingCodeSha256: string;
    trainingContractSha256: string;
    qualificationTargetSha256: string;
    residualModelSha256: string;
    normalization: NormalizationContractV1;
    weights: number[];
    residualBounds: { maximumResidual: number };
    neuralReorderPolicy:
        | { mode: 'disabled' }
        | {
            mode: 'provider_derived';
            providerKey: string;
            minimumCandidates: number;
            minimumNormalizedTopToSecondMargin: number;
        };
    applicability:
        | {
            mode: 'disabled';
            baselinePolicyIdentity: 'search_candidate_final_score_v2';
            featureContractSha256: string;
            runtimeScoringContractId: string;
            retrievalContractId: string;
            supportedProviderKeys: [];
        }
        | {
            mode: 'provider_derived';
            baselinePolicyIdentity: 'search_candidate_final_score_v2';
            featureContractSha256: string;
            runtimeScoringContractId: string;
            retrievalContractId: string;
            supportedProviderKeys: [string];
            rerankerProjectionIdentity: string;
            providerConfigurationDigest: string;
            providerRequestContractSha256: string;
        };
};

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

function asRecord(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} must be an object.`);
    }
    return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
    const actual = Object.keys(value).sort();
    const sorted = [...expected].sort();
    if (actual.length !== sorted.length || actual.some((key, index) => key !== sorted[index])) {
        throw new Error(`${label} must contain exact keys: ${sorted.join(', ')}.`);
    }
}

function sha256(value: unknown, label: string): string {
    if (typeof value !== 'string' || !SHA256.test(value)) {
        throw new Error(`${label} must be a lowercase SHA-256 digest.`);
    }
    return value;
}

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${label} must be non-empty.`);
    }
    return value;
}

function finite(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${label} must be finite.`);
    }
    return value;
}

function positiveInteger(value: unknown, label: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 1) {
        throw new Error(`${label} must be a positive safe integer.`);
    }
    return value as number;
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

export function canonicalizeRankingPolicyArtifactV3(value: unknown, options: ParseArtifactOptions = {}): string {
    return `${canonicalJson(parseRankingPolicyV3Artifact(value, options))}\n`;
}

export function canonicalRankingPolicyArtifactSha256V3(value: unknown, options: ParseArtifactOptions = {}): string {
    return crypto.createHash('sha256').update(canonicalizeRankingPolicyArtifactV3(value, options)).digest('hex');
}

function parseNormalizationContractV1(value: unknown): NormalizationContractV1 {
    const input = asRecord(value, 'NormalizationContractV1');
    exactKeys(input, ['schemaVersion', 'featureOrder', 'means', 'scales', 'missingValuePolicy'], 'NormalizationContractV1');
    if (input.schemaVersion !== 'ranking_normalization_contract_v1') {
        throw new Error('Normalization contract schemaVersion mismatch.');
    }
    if (input.missingValuePolicy !== 'indicator_zero_fill') {
        throw new Error('Normalization missingValuePolicy mismatch.');
    }
    if (!Array.isArray(input.featureOrder) || input.featureOrder.length === 0 || input.featureOrder.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
        throw new Error('Normalization featureOrder must contain non-empty strings.');
    }
    if (new Set(input.featureOrder).size !== input.featureOrder.length) {
        throw new Error('Normalization featureOrder contains duplicates.');
    }
    if (!Array.isArray(input.means) || !Array.isArray(input.scales) || input.means.length !== input.featureOrder.length || input.scales.length !== input.featureOrder.length) {
        throw new Error('Normalization vectors must match featureOrder length.');
    }
    const means = input.means.map((entry, index) => finite(entry, `means[${index}]`));
    const scales = input.scales.map((entry, index) => {
        const parsed = finite(entry, `scales[${index}]`);
        if (parsed <= 0) throw new Error('Normalization scales must be positive.');
        return parsed;
    });
    return {
        schemaVersion: 'ranking_normalization_contract_v1',
        featureOrder: [...input.featureOrder] as string[],
        means,
        scales,
        missingValuePolicy: 'indicator_zero_fill',
    };
}

function parseResidualBounds(value: unknown): { maximumResidual: number } {
    const input = asRecord(value, 'residualBounds');
    exactKeys(input, ['maximumResidual'], 'residualBounds');
    const maximumResidual = finite(input.maximumResidual, 'maximumResidual');
    if (maximumResidual < 0 || maximumResidual > 1) {
        throw new Error('maximumResidual must be between 0 and 1.');
    }
    return { maximumResidual };
}

export function parseResidualModelV1(value: unknown): ResidualModelV1 {
    const input = asRecord(value, 'ResidualModelV1');
    exactKeys(input, [
        'schemaVersion', 'featureSchema', 'createdFromCommit', 'trainingFoldManifestSha256',
        'trainingCodeSha256', 'trainingContractSha256', 'normalization', 'weights', 'residualBounds',
    ], 'ResidualModelV1');
    if (input.schemaVersion !== 'ranking_residual_model_v1' || input.featureSchema !== 'search_features_v1') {
        throw new Error('Residual model schema mismatch.');
    }
    if (typeof input.createdFromCommit !== 'string' || !COMMIT.test(input.createdFromCommit)) {
        throw new Error('createdFromCommit must be a lowercase Git commit SHA.');
    }
    const normalization = parseNormalizationContractV1(input.normalization);
    if (!Array.isArray(input.weights) || input.weights.length !== normalization.featureOrder.length) {
        throw new Error('Residual weights must match normalization featureOrder length.');
    }
    return {
        schemaVersion: 'ranking_residual_model_v1',
        featureSchema: 'search_features_v1',
        createdFromCommit: input.createdFromCommit,
        trainingFoldManifestSha256: sha256(input.trainingFoldManifestSha256, 'trainingFoldManifestSha256'),
        trainingCodeSha256: sha256(input.trainingCodeSha256, 'trainingCodeSha256'),
        trainingContractSha256: sha256(input.trainingContractSha256, 'trainingContractSha256'),
        normalization,
        weights: input.weights.map((entry, index) => finite(entry, `weights[${index}]`)),
        residualBounds: parseResidualBounds(input.residualBounds),
    };
}

export function parseFoldContenderDescriptorV1(value: unknown): FoldContenderDescriptorV1 {
    const input = asRecord(value, 'FoldContenderDescriptorV1');
    const providerDerived = input.mode === 'provider_derived';
    exactKeys(input, providerDerived
        ? ['schemaVersion', 'mode', 'residualModelSha256', 'qualificationTargetSha256', 'providerRequestContractSha256', 'evaluationFoldManifestSha256']
        : ['schemaVersion', 'mode', 'residualModelSha256', 'qualificationTargetSha256', 'evaluationFoldManifestSha256'], 'FoldContenderDescriptorV1');
    if (input.schemaVersion !== 'ranking_fold_contender_v1') throw new Error('Fold contender schema mismatch.');
    if (input.mode !== 'disabled' && input.mode !== 'provider_derived') throw new Error('Fold contender mode is invalid.');
    const common = {
        schemaVersion: 'ranking_fold_contender_v1' as const,
        residualModelSha256: sha256(input.residualModelSha256, 'residualModelSha256'),
        qualificationTargetSha256: sha256(input.qualificationTargetSha256, 'qualificationTargetSha256'),
        evaluationFoldManifestSha256: sha256(input.evaluationFoldManifestSha256, 'evaluationFoldManifestSha256'),
    };
    return input.mode === 'disabled'
        ? { ...common, mode: 'disabled' }
        : { ...common, mode: 'provider_derived', providerRequestContractSha256: sha256(input.providerRequestContractSha256, 'providerRequestContractSha256') };
}

export interface ParseArtifactOptions {
    expectedQualificationTargetSha256?: string;
    expectedProviderRequestContractSha256?: string;
}

export function parseRankingPolicyV3Artifact(value: unknown, options: ParseArtifactOptions = {}): RankingPolicyV3Artifact {
    const input = asRecord(value, 'RankingPolicyV3Artifact');
    exactKeys(input, [
        'schemaVersion', 'policyId', 'featureSchema', 'createdFromCommit', 'trainingManifestSha256',
        'trainingCodeSha256', 'trainingContractSha256', 'qualificationTargetSha256', 'residualModelSha256',
        'normalization', 'weights', 'residualBounds', 'neuralReorderPolicy', 'applicability',
    ], 'RankingPolicyV3Artifact');
    if (input.schemaVersion !== 'ranking_policy_v3' || input.policyId !== 'search_ranking_policy_v3' || input.featureSchema !== 'search_features_v1') {
        throw new Error('Ranking policy artifact identity mismatch.');
    }
    if (typeof input.createdFromCommit !== 'string' || !COMMIT.test(input.createdFromCommit)) {
        throw new Error('createdFromCommit must be a lowercase Git commit SHA.');
    }
    const qualificationTargetSha256 = sha256(input.qualificationTargetSha256, 'qualificationTargetSha256');
    if (options.expectedQualificationTargetSha256 && qualificationTargetSha256 !== options.expectedQualificationTargetSha256) {
        throw new Error('Qualification target digest mismatch.');
    }
    const normalization = parseNormalizationContractV1(input.normalization);
    if (!Array.isArray(input.weights) || input.weights.length !== normalization.featureOrder.length) {
        throw new Error('Artifact weights must match normalization featureOrder length.');
    }
    const policy = asRecord(input.neuralReorderPolicy, 'neuralReorderPolicy');
    const applicability = asRecord(input.applicability, 'applicability');
    if (policy.mode !== applicability.mode) {
        throw new Error('Neural reorder policy and applicability modes must match.');
    }

    let parsedPolicy: RankingPolicyV3Artifact['neuralReorderPolicy'];
    let parsedApplicability: RankingPolicyV3Artifact['applicability'];
    if (policy.mode === 'disabled') {
        exactKeys(policy, ['mode'], 'disabled neuralReorderPolicy');
        exactKeys(applicability, [
            'mode', 'baselinePolicyIdentity', 'featureContractSha256', 'runtimeScoringContractId',
            'retrievalContractId', 'supportedProviderKeys',
        ], 'disabled applicability');
        if (applicability.mode !== 'disabled' || applicability.baselinePolicyIdentity !== 'search_candidate_final_score_v2') {
            throw new Error('Disabled applicability identity mismatch.');
        }
        if (!Array.isArray(applicability.supportedProviderKeys) || applicability.supportedProviderKeys.length !== 0) {
            throw new Error('Disabled applicability must have no supported provider keys.');
        }
        parsedPolicy = { mode: 'disabled' };
        parsedApplicability = {
            mode: 'disabled',
            baselinePolicyIdentity: 'search_candidate_final_score_v2',
            featureContractSha256: sha256(applicability.featureContractSha256, 'featureContractSha256'),
            runtimeScoringContractId: text(applicability.runtimeScoringContractId, 'runtimeScoringContractId'),
            retrievalContractId: text(applicability.retrievalContractId, 'retrievalContractId'),
            supportedProviderKeys: [],
        };
    } else if (policy.mode === 'provider_derived') {
        exactKeys(policy, ['mode', 'providerKey', 'minimumCandidates', 'minimumNormalizedTopToSecondMargin'], 'provider-derived neuralReorderPolicy');
        exactKeys(applicability, [
            'mode', 'baselinePolicyIdentity', 'featureContractSha256', 'runtimeScoringContractId', 'retrievalContractId',
            'supportedProviderKeys', 'rerankerProjectionIdentity', 'providerConfigurationDigest', 'providerRequestContractSha256',
        ], 'provider-derived applicability');
        if (applicability.mode !== 'provider_derived' || applicability.baselinePolicyIdentity !== 'search_candidate_final_score_v2') {
            throw new Error('Provider-derived applicability identity mismatch.');
        }
        const providerKey = text(policy.providerKey, 'providerKey');
        if (!Array.isArray(applicability.supportedProviderKeys) || applicability.supportedProviderKeys.length !== 1 || applicability.supportedProviderKeys[0] !== providerKey) {
            throw new Error('Provider-derived supportedProviderKeys must contain exactly the selected providerKey.');
        }
        const providerRequestContractSha256 = sha256(applicability.providerRequestContractSha256, 'providerRequestContractSha256');
        if (!options.expectedProviderRequestContractSha256) {
            throw new Error('Provider-derived artifact parsing requires expectedProviderRequestContractSha256 from R1.2.');
        }
        if (providerRequestContractSha256 !== options.expectedProviderRequestContractSha256) {
            throw new Error('Provider request contract digest mismatch.');
        }
        const margin = finite(policy.minimumNormalizedTopToSecondMargin, 'minimumNormalizedTopToSecondMargin');
        if (margin < 0) throw new Error('minimumNormalizedTopToSecondMargin must be non-negative.');
        parsedPolicy = {
            mode: 'provider_derived',
            providerKey,
            minimumCandidates: positiveInteger(policy.minimumCandidates, 'minimumCandidates'),
            minimumNormalizedTopToSecondMargin: margin,
        };
        parsedApplicability = {
            mode: 'provider_derived',
            baselinePolicyIdentity: 'search_candidate_final_score_v2',
            featureContractSha256: sha256(applicability.featureContractSha256, 'featureContractSha256'),
            runtimeScoringContractId: text(applicability.runtimeScoringContractId, 'runtimeScoringContractId'),
            retrievalContractId: text(applicability.retrievalContractId, 'retrievalContractId'),
            supportedProviderKeys: [providerKey],
            rerankerProjectionIdentity: text(applicability.rerankerProjectionIdentity, 'rerankerProjectionIdentity'),
            providerConfigurationDigest: sha256(applicability.providerConfigurationDigest, 'providerConfigurationDigest'),
            providerRequestContractSha256,
        };
    } else {
        throw new Error('Neural reorder policy mode is invalid.');
    }

    return {
        schemaVersion: 'ranking_policy_v3',
        policyId: 'search_ranking_policy_v3',
        featureSchema: 'search_features_v1',
        createdFromCommit: input.createdFromCommit,
        trainingManifestSha256: sha256(input.trainingManifestSha256, 'trainingManifestSha256'),
        trainingCodeSha256: sha256(input.trainingCodeSha256, 'trainingCodeSha256'),
        trainingContractSha256: sha256(input.trainingContractSha256, 'trainingContractSha256'),
        qualificationTargetSha256,
        residualModelSha256: sha256(input.residualModelSha256, 'residualModelSha256'),
        normalization,
        weights: input.weights.map((entry, index) => finite(entry, `weights[${index}]`)),
        residualBounds: parseResidualBounds(input.residualBounds),
        neuralReorderPolicy: parsedPolicy,
        applicability: parsedApplicability,
    };
}
