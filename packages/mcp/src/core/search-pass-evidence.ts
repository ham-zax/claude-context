export interface SearchPassEvidenceV1 {
    schemaVersion: 'search_pass_evidence_v1';
    candidateId: string;
    passes: Array<{
        passId: string;
        rank: number;
        rrfK: number;
        contribution: number;
    }>;
    totalContribution: number;
}

export interface SearchPassEvidenceInput {
    candidateId: string;
    passes: Array<{
        passId: string;
        rank: number;
        rrfK: number;
    }>;
}

export const RRF_CORE_K_V1 = 100;
export const RRF_MCP_K_V1 = 60;
export const RRF_RERANK_K_V1 = 10;
export const RRF_RERANK_WEIGHT_V1 = 1;

function validatePass(pass: SearchPassEvidenceInput['passes'][number]): void {
    if (typeof pass.passId !== 'string' || pass.passId.length === 0) {
        throw new Error('Pass id must be non-empty.');
    }
    if (!Number.isSafeInteger(pass.rank) || pass.rank < 1) {
        throw new Error(`Pass '${pass.passId}' rank must be a positive safe integer.`);
    }
    if (!Number.isFinite(pass.rrfK) || pass.rrfK <= 0) {
        throw new Error(`Pass '${pass.passId}' rrfK must be a positive finite number.`);
    }
}

function roundMetric(value: number): number {
    return Number(value.toFixed(6));
}

/**
 * Deterministic per-pass RRF contribution evidence (plan §2.2). The reranker
 * RRF bucket (k=10, weight 1.0) is a baseline-mode compatibility behavior only
 * and is never applied by learned modes (plan §4.2); callers supply the rrfK
 * per pass so the same builder serves core (100), MCP multi-pass (60), and the
 * baseline-only rerank bucket.
 */
export function buildSearchPassEvidenceV1(input: SearchPassEvidenceInput): SearchPassEvidenceV1 {
    if (typeof input.candidateId !== 'string' || input.candidateId.length === 0) {
        throw new Error('candidateId must be non-empty.');
    }
    if (!Array.isArray(input.passes) || input.passes.length === 0) {
        throw new Error('Pass evidence requires at least one pass.');
    }
    const seen = new Set<string>();
    for (const pass of input.passes) {
        validatePass(pass);
        if (seen.has(pass.passId)) {
            throw new Error(`Duplicate pass '${pass.passId}'.`);
        }
        seen.add(pass.passId);
    }
    const passes = input.passes.map((pass) => {
        const contribution = roundMetric(1 / (pass.rrfK + pass.rank));
        return {
            passId: pass.passId,
            rank: pass.rank,
            rrfK: pass.rrfK,
            contribution,
        };
    });
    const totalContribution = roundMetric(
        passes.reduce((total, pass) => total + pass.contribution, 0),
    );
    return {
        schemaVersion: 'search_pass_evidence_v1',
        candidateId: input.candidateId,
        passes,
        totalContribution,
    };
}
