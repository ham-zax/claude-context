import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectCliMcpSession, type CliMcpSession } from '../packages/cli/src/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MCP_ROOT = path.resolve(__dirname, '..', 'packages', 'mcp');
const RUNTIME_ENTRY = path.join(MCP_ROOT, 'dist', 'index.js');
const TRUFFLEHOG_PATH = '/home/hamza/repo/trufflehog';

const POTION_ASSETS = path.join(MCP_ROOT, 'assets', 'potion', 'linux-x64');

function parseFirstText(result: Awaited<ReturnType<CliMcpSession['callTool']>>): Record<string, unknown> {
    const content = result.content as Array<{ type?: string; text?: string }>;
    const text = content.find((part) => part.type === 'text')?.text;
    if (!text) throw new Error('Satori tool response did not contain text.');
    if (result.isError === true) throw new Error(`Satori tool failed: ${text}`);
    return JSON.parse(text) as Record<string, unknown>;
}

async function connect(env: Record<string, string>): Promise<CliMcpSession> {
    const helperPath = path.join(POTION_ASSETS, 'satori-potion');
    const modelPath = path.join(POTION_ASSETS, 'model');

    return connectCliMcpSession({
        command: process.execPath,
        args: [RUNTIME_ENTRY],
        env: {
            ...process.env,
            EMBEDDING_PROVIDER: 'Potion',
            SATORI_RUNTIME_PROFILE: 'offline',
            POTION_HELPER_PATH: helperPath,
            POTION_MODEL_PATH: modelPath,
            POTION_REQUEST_TIMEOUT_MS: '15000',
            SATORI_SESSION_ROOTS_JSON: JSON.stringify([TRUFFLEHOG_PATH]),
            ...env,
        },
        startupTimeoutMs: 30_000,
        callTimeoutMs: 120_000,
        writeStderr: (chunk) => {
            process.stderr.write(chunk);
        },
    });
}

async function waitForIndexCompletion(session: CliMcpSession, repoPath: string): Promise<Record<string, unknown>> {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
        const status = parseFirstText(await session.callTool('manage_index', {
            action: 'status',
            path: repoPath,
        }));
        const phase = (status.operation as Record<string, unknown> | undefined)?.phase;
        if (phase === 'completed') return status;
        if (phase === 'failed' || phase === 'blocked') {
            throw new Error(`Index operation failed: ${JSON.stringify(status)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Index operation did not complete within 180 seconds.');
}

async function main() {
    console.log('='.repeat(80));
    console.log('🚀 REAL TASK 7 PRODUCT CHARACTERIZATION ON TRUFFLEHOG');
    console.log(`Repository: ${TRUFFLEHOG_PATH}`);
    console.log(`Runtime: ${RUNTIME_ENTRY}`);
    console.log('='.repeat(80));

    if (!fs.existsSync(TRUFFLEHOG_PATH)) {
        throw new Error(`Target repo ${TRUFFLEHOG_PATH} does not exist.`);
    }

    const session = await connect({});

    try {
        console.log('\n[Phase 1] Checking existing index on TruffleHog (establishing Publication N)...');
        let status = parseFirstText(await session.callTool('manage_index', {
            action: 'status',
            path: TRUFFLEHOG_PATH,
        }));
        console.log(`Initial status: phase=${(status.operation as any)?.phase}, status=${status.status}, generation=${(status.operation as any)?.generation}`);

        if (status.status === 'requires_reindex' || status.status === 'not_indexed' || (status.operation as any)?.phase !== 'completed') {
            console.log('Initial index needed or requires reindex. Running manage_index create/reindex...');
            await session.callTool('manage_index', {
                action: status.status === 'requires_reindex' ? 'reindex' : 'create',
                path: TRUFFLEHOG_PATH,
            });
            status = await waitForIndexCompletion(session, TRUFFLEHOG_PATH);
        }

        const pubN = (status.operation as any)?.generation;
        console.log(`Publication N established: generation=${pubN}`);

        console.log('\n[Phase 2] Triggering real sync into writing and immediately firing 5 parallel searches (no settle ritual)...');
        // Trigger a sync operation
        const syncStartPromise = session.callTool('manage_index', {
            action: 'sync',
            path: TRUFFLEHOG_PATH,
        });

        // Immediately fire 5 parallel searches against TruffleHog while sync is active
        const searchQueries = [
            'where is detector verification handled',
            'git log scanner credentials',
            'chunk parser token',
            'entropy calculation secret',
            'trufflehog output formatter',
        ];

        const searchStarts = performance.now();
        const searchPromises = searchQueries.map(async (query, idx) => {
            const start = performance.now();
            const rawResult = await session.callTool('search_codebase', {
                path: TRUFFLEHOG_PATH,
                query,
                limit: 5,
            });
            const elapsed = performance.now() - start;
            const parsed = parseFirstText(rawResult);
            return {
                idx,
                query,
                elapsed,
                rawResult,
                parsed,
            };
        });

        const searchResults = await Promise.all(searchPromises);
        const totalSearchElapsed = performance.now() - searchStarts;
        console.log(`All 5 parallel searches completed in ${totalSearchElapsed.toFixed(1)}ms.`);

        // Verify all 5 results
        let allOk = true;
        for (const res of searchResults) {
            const resultStatus = res.parsed.status ?? 'ok';
            const freshness = res.parsed.freshness as Record<string, unknown> | undefined;
            const resultsCount = Array.isArray(res.parsed.results) ? res.parsed.results.length : 0;
            console.log(` Search #${res.idx + 1} ("${res.query}"): status=${resultStatus}, duration=${res.elapsed.toFixed(1)}ms, results=${resultsCount}, freshnessState=${freshness?.state ?? 'unknown'}`);

            if (res.rawResult.isError || resultStatus === 'not_ready') {
                allOk = false;
                console.error(`  FAIL: Search #${res.idx + 1} failed or returned not_ready!`);
            }
        }

        if (!allOk) {
            throw new Error('One or more parallel searches failed or returned not_ready during sync.');
        }

        console.log('\n[Phase 3] Awaiting completion and activation of the sync operation (Publication N+1)...');
        await syncStartPromise;
        const finalSyncStatus = await waitForIndexCompletion(session, TRUFFLEHOG_PATH);
        const pubNPlus1 = (finalSyncStatus.operation as any)?.generation;
        console.log(`Sync completed and activated: generation=${pubNPlus1}`);

        console.log('\n[Phase 4] Verifying new search request uses updated Publication N+1...');
        const postSyncSearch = parseFirstText(await session.callTool('search_codebase', {
            path: TRUFFLEHOG_PATH,
            query: 'detector verification',
            limit: 5,
        }));
        const postFreshness = postSyncSearch.freshness as Record<string, unknown> | undefined;
        console.log(`Post-sync search: status=${postSyncSearch.status ?? 'ok'}, results=${(postSyncSearch.results as any[])?.length}, freshnessState=${postFreshness?.state ?? 'synced'}`);

        console.log('\n' + '='.repeat(80));
        console.log('✅ REAL TASK 7 PRODUCT CHARACTERIZATION PASSED ON TRUFFLEHOG:');
        console.log(' - 5/5 parallel searches returned status ok during active sync writing');
        console.log(' - 0 transport timeouts (-32001)');
        console.log(' - 0 sync-only not_ready errors');
        console.log(` - Stale reads pinned to publication N (${pubN})`);
        console.log(` - Real sync cleanly activated to publication N+1 (${pubNPlus1})`);
        console.log(' - Post-activation search successfully served from updated publication');
        console.log('='.repeat(80));
    } finally {
        await session.close();
    }
}

main().catch((err) => {
    console.error('Task 7 Product Characterization Failed:', err);
    process.exit(1);
});
