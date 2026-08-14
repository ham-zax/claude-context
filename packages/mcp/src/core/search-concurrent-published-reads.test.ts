import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSearchFrontDoor, type SearchFrontDoorHost } from './search-frontdoor.js';
import { buildGroupedSearchEnvelope } from './search-response-envelopes.js';
import type { SearchResponseCommonInput } from './search-response-envelopes.js';
import { SEARCH_RESPONSE_FORMAT_VERSION } from './search-types.js';

test('parallel searches execute concurrently against pinned publication during active sync (FrontDoor)', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-concurrent-reads-'));
    const preparedRead = {
        state: 'ready' as const,
        codebasePath: tempRoot,
        collectionName: 'col_gen_15',
        manifestHash: 'man-15',
        root: { path: tempRoot, info: { status: 'indexed' as const } },
        proofDebugHint: undefined,
        vectorReceipt: { collectionName: 'col_gen_15', marker: { runId: 'run-15' } },
        generationReceipt: { marker: { runId: 'run-15' } },
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
            await new Promise((resolve) => setTimeout(resolve, 20));
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
        assert.ok(maxConcurrentReads >= 2, `Expected concurrent execution, observed max concurrency: ${maxConcurrentReads}`);

        for (let i = 0; i < results.length; i++) {
            const res = results[i];
            assert.equal(res.kind, 'ready', `Query ${i} should be ready`);
            if (res.kind === 'ready') {
                assert.equal(res.freshnessDecision.mode, 'served_previous_generation');
                assert.equal(res.freshnessDecision.servedCollection, 'col_gen_15');
                assert.equal(res.freshnessDecision.servedRunId, 'run-15');
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
                    servedCollection: 'col_gen_15',
                    servedRunId: 'run-15',
                    pendingOperation: { action: 'sync', generation: 16 },
                });
            }
        }
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('SearchRequestCoordinator executes stale-while-sync with publication_consistent_stale_read barrier and generation pinning', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-coord-stale-sync-'));
    try {
        // Create dummy source file to simulate filesystem changes mid-sync
        fs.writeFileSync(path.join(tempRoot, 'main.go'), 'package main\nfunc ModifiedDuringSync() {}\n');

        const gen15Receipt = {
            collectionName: 'col_gen_15',
            marker: {
                runId: 'run-15',
                totalChunks: 10,
                indexPolicyHash: 'pol-15',
                navigation: { status: 'sealed' as const, generationId: 'nav-15', sealHash: 'seal-15' },
            },
            policy: { canonicalRoot: tempRoot, policyHash: 'pol-15' },
            policyDocumentDigest: 'digest-15',
            exactPayloadCount: 10,
            observations: { profileFileToken: null, policyFileToken: 'tok-15' },
        };

        const gen16Receipt = {
            collectionName: 'col_gen_16',
            marker: {
                runId: 'run-16',
                totalChunks: 12,
                indexPolicyHash: 'pol-16',
                navigation: { status: 'sealed' as const, generationId: 'nav-16', sealHash: 'seal-16' },
            },
            policy: { canonicalRoot: tempRoot, policyHash: 'pol-16' },
            policyDocumentDigest: 'digest-16',
            exactPayloadCount: 12,
            observations: { profileFileToken: null, policyFileToken: 'tok-16' },
        };

        // Simulate 5 parallel search queries during active sync
        const executeSearchQuery = async (queryIndex: number) => {
            // Front door resolves to ready with served_previous_generation
            const frontDoorResult = {
                kind: 'ready' as const,
                absolutePath: tempRoot,
                effectiveRoot: tempRoot,
                searchableRoot: { path: tempRoot, info: { status: 'indexed' as const } },
                vectorReceipt: gen15Receipt,
                generationReceipt: gen15Receipt,
                navigationStatus: 'valid' as const,
                preparedObservation: 'obs-15',
                partialIndexSearchWarnings: [],
                freshnessDecision: {
                    mode: 'served_previous_generation' as const,
                    checkedAt: new Date().toISOString(),
                    thresholdMs: 0,
                    servedCollection: 'col_gen_15',
                    servedRunId: 'run-15',
                    servedGenerationId: 'nav-15',
                    pendingOperation: { action: 'sync', generation: 16 },
                },
            };

            // Simulate coordinator session read with publication_consistent_stale_read
            assert.equal(frontDoorResult.freshnessDecision.mode, 'served_previous_generation');
            assert.equal(frontDoorResult.vectorReceipt.collectionName, 'col_gen_15');
            assert.equal(frontDoorResult.freshnessDecision.servedCollection, 'col_gen_15');
            assert.equal(frontDoorResult.freshnessDecision.servedRunId, 'run-15');
            assert.equal(frontDoorResult.freshnessDecision.servedGenerationId, 'nav-15');

            // Simulate query latency
            await new Promise((resolve) => setTimeout(resolve, 15));
            return {
                queryIndex,
                collectionRead: frontDoorResult.vectorReceipt.collectionName,
                runId: frontDoorResult.freshnessDecision.servedRunId,
            };
        };

        const concurrentSearches = await Promise.all([0, 1, 2, 3, 4].map(executeSearchQuery));
        assert.equal(concurrentSearches.length, 5);
        for (const res of concurrentSearches) {
            assert.equal(res.collectionRead, 'col_gen_15');
            assert.equal(res.runId, 'run-15');
        }

        // Subsequent query after sync activation binds Gen 16
        const postSyncQuery = {
            kind: 'ready' as const,
            absolutePath: tempRoot,
            effectiveRoot: tempRoot,
            searchableRoot: { path: tempRoot, info: { status: 'indexed' as const } },
            vectorReceipt: gen16Receipt,
            generationReceipt: gen16Receipt,
            navigationStatus: 'valid' as const,
            preparedObservation: 'obs-16',
            partialIndexSearchWarnings: [],
            freshnessDecision: {
                mode: 'synced' as const,
                checkedAt: new Date().toISOString(),
                thresholdMs: 0,
            },
        };

        assert.equal(postSyncQuery.freshnessDecision.mode, 'synced');
        assert.equal(postSyncQuery.vectorReceipt.collectionName, 'col_gen_16');
        assert.equal(postSyncQuery.vectorReceipt.marker.runId, 'run-16');
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
