import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSearchFrontDoor, type SearchFrontDoorHost } from './search-frontdoor.js';
import { buildGroupedSearchEnvelope } from './search-response-envelopes.js';
import type { SearchResponseCommonInput } from './search-response-envelopes.js';
import { SEARCH_RESPONSE_FORMAT_VERSION } from './search-types.js';

test('parallel searches execute concurrently against pinned publication during active sync', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-concurrent-reads-'));
    const preparedRead = {
        state: 'ready' as const,
        codebasePath: tempRoot,
        collectionName: 'col_gen_15',
        manifestHash: 'man-15',
        root: { path: tempRoot, info: { status: 'indexed' as const } },
        proofDebugHint: undefined,
        vectorReceipt: { generation: 15, collectionName: 'col_gen_15', dimension: 256 },
        generationReceipt: { generation: 15, manifestHash: 'man-15' },
        navigationStatus: 'valid' as const,
        preparedObservation: 'obs-15',
        navigationAuthorityMode: 'canonical_v4' as const,
    };

    let concurrentReadsObserved = 0;
    let maxConcurrentReads = 0;

    const host = {
        prepareInitialTrackedRootRead: async () => {
            concurrentReadsObserved += 1;
            maxConcurrentReads = Math.max(maxConcurrentReads, concurrentReadsObserved);
            // Simulate realistic async read latency
            await new Promise((resolve) => setTimeout(resolve, 10));
            concurrentReadsObserved -= 1;
            return {
                state: 'indexing' as const,
                codebasePath: tempRoot,
                operation: { action: 'sync' as const, generation: 16, phase: 'writing', id: 'op-16' },
                searchableGenerationAvailable: true,
                searchableRead: preparedRead,
            };
        },
        getPreparedReadObservation: () => 'obs-15',
        ensureSearchFreshness: async () => {
            throw new Error('ensureSearchFreshness should not be invoked during stale-while-sync');
        },
        noteFreshnessMode: () => undefined,
        buildFreshnessBlockedSearchPayload: () => null,
        isPartialIndexNavigationUnavailable: () => false,
        partialIndexWarnings: [],
        canSyncStaleLocal: () => false,
        buildBlockedReadinessPayload: () => null,
        trackedRootReadiness: {
            buildMissingLocalCollectionSearchPayload: () => ({}),
            buildIndexFailedSearchPayload: () => ({}),
        },
    } as unknown as SearchFrontDoorHost;

    try {
        const queries = [
            'aws credential validation',
            'git commit walking',
            'entropy regex prefilter',
            'archive decompression zip',
            'source manager memory lease',
        ];

        const results = await Promise.all(
            queries.map((query) => runSearchFrontDoor({
                path: tempRoot,
                query,
                scope: 'runtime',
                groupBy: 'symbol',
                resultMode: 'grouped',
                limit: 5,
            }, host)),
        );

        assert.equal(results.length, 5);
        for (let i = 0; i < results.length; i++) {
            const res = results[i];
            assert.equal(res.kind, 'ready', `Query ${i} should be ready`);
            if (res.kind === 'ready') {
                assert.equal(res.freshnessDecision.mode, 'served_previous_generation');
                assert.equal(res.freshnessDecision.servedGeneration, 15);
                assert.deepEqual(res.freshnessDecision.pendingOperation, { action: 'sync', generation: 16 });

                // Construct envelope and verify metadata
                const commonInput: SearchResponseCommonInput = {
                    absolutePath: tempRoot,
                    codebaseRoot: tempRoot,
                    query: queries[i],
                    scope: 'runtime',
                    groupBy: 'symbol',
                    limit: 5,
                    freshnessDecision: res.freshnessDecision,
                    freshnessSummary: {
                        syncMode: res.freshnessDecision.mode,
                        lastSyncAt: '2026-08-15T00:00:00Z',
                        changedFileCount: 0,
                        gitDirtyFilesConsidered: false,
                        changedFilesBoostApplied: false,
                        changedFilesBoostSkippedForLargeChangeSet: false,
                    },
                    warnings: [],
                    debugMode: 'none',
                };

                const envelope = buildGroupedSearchEnvelope({
                    ...commonInput,
                    results: [],
                });
                assert.equal(envelope.status, 'ok');
                assert.equal(envelope.formatVersion, SEARCH_RESPONSE_FORMAT_VERSION);
                assert.deepEqual(envelope.freshness, {
                    state: 'sync_in_progress',
                    servedGeneration: 15,
                    pendingOperation: { action: 'sync', generation: 16 },
                });
            }
        }
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
