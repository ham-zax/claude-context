import assert from 'node:assert/strict';
import test from 'node:test';
import {
    RRF_CORE_K_V1,
    RRF_MCP_K_V1,
    RRF_RERANK_K_V1,
    RRF_RERANK_WEIGHT_V1,
    buildSearchPassEvidenceV1,
} from './search-pass-evidence.js';

test('pass_evidence_contributions_are_stable_and_exact', () => {
    const input = {
        candidateId: 'candidate-a',
        passes: [
            { passId: 'core-dense', rank: 1, rrfK: RRF_CORE_K_V1 },
            { passId: 'core-lexical', rank: 3, rrfK: RRF_CORE_K_V1 },
            { passId: 'mcp-pass-1', rank: 2, rrfK: RRF_MCP_K_V1 },
        ],
    };

    // Repeated construction yields canonical repeated output.
    const first = buildSearchPassEvidenceV1(input);
    const second = buildSearchPassEvidenceV1(input);
    assert.deepEqual(second, first, 'repeated construction must be canonical and stable');
    assert.equal(JSON.stringify(buildSearchPassEvidenceV1(input)), JSON.stringify(first));

    // Contribution sums agree exactly (rounded to 6 decimals).
    const sum = first.passes.reduce((total, pass) => total + pass.contribution, 0);
    assert.equal(first.totalContribution, Number(sum.toFixed(6)));
    for (const pass of first.passes) {
        assert.equal(
            pass.contribution,
            Number((1 / (pass.rrfK + pass.rank)).toFixed(6)),
            `contribution for ${pass.passId}`,
        );
    }

    // Rerank bucket is baseline-mode compatibility only (plan §4.2).
    const rerankPass = buildSearchPassEvidenceV1({
        candidateId: 'candidate-a',
        passes: [{ passId: 'rerank', rank: 1, rrfK: RRF_RERANK_K_V1 }],
    });
    assert.equal(rerankPass.passes[0].contribution, Number((RRF_RERANK_WEIGHT_V1 / (RRF_RERANK_K_V1 + 1)).toFixed(6)));

    // Validation is fail-closed.
    assert.throws(() => buildSearchPassEvidenceV1({ candidateId: '', passes: input.passes }));
    assert.throws(() => buildSearchPassEvidenceV1({ candidateId: 'c', passes: [] }));
    assert.throws(() => buildSearchPassEvidenceV1({
        candidateId: 'c',
        passes: [{ passId: 'p', rank: 0, rrfK: RRF_CORE_K_V1 }],
    }));
    assert.throws(() => buildSearchPassEvidenceV1({
        candidateId: 'c',
        passes: [
            { passId: 'p', rank: 1, rrfK: RRF_CORE_K_V1 },
            { passId: 'p', rank: 2, rrfK: RRF_CORE_K_V1 },
        ],
    }));
});
