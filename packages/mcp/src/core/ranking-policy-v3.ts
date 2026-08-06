export interface DeterministicV3ScoreInput {
    preRerankBaselineScore: number;
    normalizedFeatures: readonly number[];
    weights: readonly number[];
    maximumResidual: number;
}

export interface DeterministicV3ScoreResult {
    residual: number;
    deterministicV3Score: number;
}

function finiteNumber(value: number, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${label} must be finite.`);
    }
    return value;
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}

/**
 * D7: the one deterministic residual scorer (plan §4.1, §4.4). The residual is
 * a bounded dot product over the normalized feature vector; a zero residual
 * proves equality with the pre-rerank baseline score. This module is the only
 * implementation of residual scoring shared by runtime and evaluation.
 */
export function scoreDeterministicV3(input: DeterministicV3ScoreInput): DeterministicV3ScoreResult {
    const baseline = finiteNumber(input.preRerankBaselineScore, 'preRerankBaselineScore');
    const maximumResidual = finiteNumber(input.maximumResidual, 'maximumResidual');
    if (maximumResidual < 0) {
        throw new Error('maximumResidual must be non-negative.');
    }
    if (!Array.isArray(input.normalizedFeatures) || !Array.isArray(input.weights)) {
        throw new Error('normalizedFeatures and weights must be arrays.');
    }
    if (input.normalizedFeatures.length !== input.weights.length) {
        throw new Error('normalizedFeatures and weights must have equal length.');
    }
    let dot = 0;
    for (let index = 0; index < input.normalizedFeatures.length; index += 1) {
        const feature = finiteNumber(input.normalizedFeatures[index], `normalizedFeatures[${index}]`);
        const weight = finiteNumber(input.weights[index], `weights[${index}]`);
        dot += feature * weight;
    }
    const residual = clamp(dot, -maximumResidual, maximumResidual);
    return {
        residual,
        deterministicV3Score: baseline + residual,
    };
}
