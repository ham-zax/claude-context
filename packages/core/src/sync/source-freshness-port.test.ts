import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceFreshnessPort } from './source-freshness-port';
import type { SourceFreshnessPortDependencies } from './source-freshness-port';
import type { ProvenSourceFreshnessCheckpointEvidence } from '../core/context';
import type {
    SourceFreshnessPathComparison,
} from './synchronizer';

const VALID_EVIDENCE: ProvenSourceFreshnessCheckpointEvidence = {
    status: 'valid',
    observationToken: 'checkpoint-observation-token',
    merkleRoot: 'merkle-root',
    documentDigest: 'document-digest',
};
const MISSING_EVIDENCE = { status: 'missing' as const, message: 'checkpoint missing' };

function stubDeps(overrides: Partial<SourceFreshnessPortDependencies> = {}): SourceFreshnessPortDependencies {
    return {
        inspectSourceFreshnessCheckpoint: async () => VALID_EVIDENCE,
        compareSourceObservationToFreshnessCheckpoint: async (): Promise<SourceFreshnessPathComparison> => (
            { status: 'matches' }
        ),
        compareAllSourceToFreshnessCheckpoint: async (): Promise<SourceFreshnessPathComparison> => (
            { status: 'matches' }
        ),
        getRegisteredSourceFreshnessCheckpointObservation: () => 'checkpoint-observation-token',
        ...overrides,
    };
}

test('prepareCurrentSourceObservation reports available with valid evidence', async () => {
    const port = createSourceFreshnessPort(stubDeps());
    const prepared = await port.prepareCurrentSourceObservation('/tmp/root');
    assert.deepEqual(prepared, { available: true, evidence: VALID_EVIDENCE });
});

test('prepareCurrentSourceObservation reports unavailable with invalid evidence', async () => {
    const port = createSourceFreshnessPort(stubDeps({
        inspectSourceFreshnessCheckpoint: async () => MISSING_EVIDENCE,
    }));
    const prepared = await port.prepareCurrentSourceObservation('/tmp/root');
    assert.deepEqual(prepared, { available: false, evidence: MISSING_EVIDENCE });
});

test('prepareCurrentSourceObservation passes checkpoint identity and request receipt through', async () => {
    let seen: unknown;
    const port = createSourceFreshnessPort(stubDeps({
        inspectSourceFreshnessCheckpoint: async (...args: unknown[]) => {
            seen = args;
            return VALID_EVIDENCE;
        },
    }));
    await port.prepareCurrentSourceObservation('/tmp/root', {
        checkpointIdentity: 'identity-1',
        requestBoundReceipt: { marker: { runId: 'run-1' } } as never,
    });
    assert.deepEqual(seen, ['/tmp/root', 'identity-1', { marker: { runId: 'run-1' } }]);
});

test('revalidateCurrentSourceObservation matches the registered observation token', async () => {
    const port = createSourceFreshnessPort(stubDeps());
    assert.equal(
        await port.revalidateCurrentSourceObservation('/tmp/root', {
            expectedObservationToken: 'checkpoint-observation-token',
        }),
        true,
    );
    assert.equal(
        await port.revalidateCurrentSourceObservation('/tmp/root', {
            expectedObservationToken: 'stale-token',
        }),
        false,
    );
});

test('compareCurrentSourceToCheckpoint delegates to the observation-based comparison', async () => {
    let seen: unknown;
    const port = createSourceFreshnessPort(stubDeps({
        compareSourceObservationToFreshnessCheckpoint: async (...args: unknown[]) => {
            seen = args;
            return { status: 'matches' };
        },
    }));
    const result = await port.compareCurrentSourceToCheckpoint('/tmp/root', { marker: { runId: 'run-1' } } as never);
    assert.equal(result.status, 'matches');
    assert.deepEqual(seen, ['/tmp/root', { marker: { runId: 'run-1' } }]);
});

test('compareAllCurrentSourceToCheckpoint delegates to the full-hash comparison', async () => {
    let seen: unknown;
    const port = createSourceFreshnessPort(stubDeps({
        compareAllSourceToFreshnessCheckpoint: async (...args: unknown[]) => {
            seen = args;
            return { status: 'matches' };
        },
    }));
    const result = await port.compareAllCurrentSourceToCheckpoint('/tmp/root', { marker: { runId: 'run-1' } } as never);
    assert.equal(result.status, 'matches');
    assert.deepEqual(seen, ['/tmp/root', { marker: { runId: 'run-1' } }]);
});

test('currentObservationToken returns the registered token', () => {
    const port = createSourceFreshnessPort(stubDeps());
    assert.equal(port.currentObservationToken('/tmp/root'), 'checkpoint-observation-token');
});
