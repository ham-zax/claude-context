import test from 'node:test';
import assert from 'node:assert/strict';
import type {
    SearchMustConstraintHint,
    SearchResponseEnvelope,
} from './search-types.js';

/**
 * Compile-time contract: the public envelope type must expose
 * `hints.mustConstraint` with a status-discriminated union. If the public
 * contract regresses (e.g. the field is dropped or flattened into
 * Record<string, unknown>), this file stops compiling.
 */
function narrowMustConstraint(hint: SearchMustConstraintHint | undefined): string {
    if (hint?.status === 'unsupported') {
        const zeroCandidates: 0 = hint.candidatesExamined;
        return `unsupported:${zeroCandidates}`;
    }
    if (hint?.status === 'failed') {
        return `failed:${hint.candidatesExamined}`;
    }
    if (hint?.status === 'attempted') {
        return `attempted:${hint.budgetExhausted ? 'exhausted' : 'bounded'}`;
    }
    return 'none';
}

test('SearchResponseEnvelope publicly exposes the mustConstraint hint contract', () => {
    // The typed envelope literal must satisfy the public SearchResponseEnvelope.
    const envelope: SearchResponseEnvelope = {
        formatVersion: 3,
        status: 'ok',
        path: '/repo',
        query: 'must:token runtime',
        scope: 'runtime',
        groupBy: 'symbol',
        limit: 5,
        resultMode: 'grouped',
        warnings: [],
        hints: {
            version: 1,
            mustConstraint: {
                status: 'attempted',
                mustTokens: ['token'],
                candidateBudget: 80,
                candidatesExamined: 40,
                budgetExhausted: false,
            },
        },
        results: [],
    } as SearchResponseEnvelope;

    const hint = envelope.hints?.mustConstraint;
    assert.equal(narrowMustConstraint(hint), 'attempted:bounded');

    const unsupported: SearchResponseEnvelope = {
        ...envelope,
        hints: {
            version: 1,
            mustConstraint: {
                status: 'unsupported',
                mustTokens: ['token'],
                candidateBudget: 80,
                candidatesExamined: 0,
            },
        },
    } as SearchResponseEnvelope;
    assert.equal(narrowMustConstraint(unsupported.hints?.mustConstraint), 'unsupported:0');

    const failed: SearchResponseEnvelope = {
        ...envelope,
        hints: {
            version: 1,
            mustConstraint: {
                status: 'failed',
                mustTokens: ['token'],
                candidateBudget: 80,
                candidatesExamined: 0,
            },
        },
    } as SearchResponseEnvelope;
    assert.equal(narrowMustConstraint(failed.hints?.mustConstraint), 'failed:0');
});
