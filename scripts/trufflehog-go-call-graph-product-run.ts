import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectCliMcpSession, type CliMcpSession } from '../packages/cli/src/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SATORI_ROOT = path.resolve(__dirname, '..');
const MCP_ROOT = path.join(SATORI_ROOT, 'packages', 'mcp');
const RUNTIME_ENTRY = path.join(MCP_ROOT, 'dist', 'index.js');
const TARGET_REPO = process.env.SATORI_GO_CALL_GRAPH_REPO || '/home/hamza/repo/trufflehog';
const TARGET_FILE = 'hack/checksecretparts/check.go';
const POTION_ASSETS = path.join(MCP_ROOT, 'assets', 'potion', 'linux-x64');
const POLL_INTERVAL_MS = 100;
const OPERATION_TIMEOUT_MS = 10 * 60_000;
const DEBUG = process.env.SATORI_GO_CALL_GRAPH_DEBUG !== '0';
const KEEP_FAILED_STATE = process.env.SATORI_GO_CALL_GRAPH_KEEP_STATE_ON_FAILURE === '1';

type JsonRecord = Record<string, unknown>;

type OperationIdentity = {
    id: string;
    action: string;
    generation: number;
    phase: string;
};

type PublicationIdentity = {
    publicationId: string;
    collectionName: string;
};

type SymbolRef = {
    file: string;
    symbolId: string;
    span: {
        startLine: number;
        endLine: number;
    };
};

type SourceFacts = {
    checkPackageDirLine: number;
    checkFilesLine: number;
    callSiteLine: number;
};

function asRecord(value: unknown): JsonRecord | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as JsonRecord
        : undefined;
}

function asRecords(value: unknown): JsonRecord[] {
    return Array.isArray(value)
        ? value.map(asRecord).filter((record): record is JsonRecord => Boolean(record))
        : [];
}

function formatError(error: unknown): string {
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function debug(label: string, value?: unknown): void {
    if (!DEBUG) return;
    if (value === undefined) {
        console.error(`[GO-CALL-GRAPH-DEBUG] ${label}`);
        return;
    }
    console.error(`[GO-CALL-GRAPH-DEBUG] ${label}:\n${JSON.stringify(value, null, 2)}`);
}

function parseFirstText(result: Awaited<ReturnType<CliMcpSession['callTool']>>): JsonRecord {
    const content = result.content as Array<{ type?: string; text?: string }>;
    const text = content.find((part) => part.type === 'text')?.text;
    if (!text) throw new Error('Satori tool response did not contain text.');
    if (result.isError === true) throw new Error(`Satori tool failed: ${text}`);
    return JSON.parse(text) as JsonRecord;
}

function requireString(record: JsonRecord, key: string, label: string): string {
    const value = record[key];
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${label} is missing required string '${key}'.`);
    }
    return value;
}

function requireSpan(record: JsonRecord, label: string): SymbolRef['span'] {
    const span = asRecord(record.span);
    if (!span || typeof span.startLine !== 'number' || typeof span.endLine !== 'number') {
        throw new Error(`${label} is missing a valid line span.`);
    }
    return { startLine: span.startLine, endLine: span.endLine };
}

function readOperation(response: JsonRecord): OperationIdentity | undefined {
    const operation = asRecord(response.operation);
    if (!operation) return undefined;
    if (
        typeof operation.id !== 'string'
        || typeof operation.action !== 'string'
        || typeof operation.generation !== 'number'
        || typeof operation.phase !== 'string'
    ) return undefined;
    return {
        id: operation.id,
        action: operation.action,
        generation: operation.generation,
        phase: operation.phase,
    };
}

function readPublication(response: JsonRecord): PublicationIdentity | undefined {
    const publication = asRecord(response.publication);
    if (
        !publication
        || typeof publication.publicationId !== 'string'
        || publication.publicationId.length === 0
        || typeof publication.collectionName !== 'string'
        || publication.collectionName.length === 0
    ) return undefined;
    return {
        publicationId: publication.publicationId,
        collectionName: publication.collectionName,
    };
}

function requirePublication(response: JsonRecord, label: string): PublicationIdentity {
    const publication = readPublication(response);
    if (!publication) {
        debug(`${label} response missing publication`, response);
        throw new Error(`${label} did not expose a proven publication identity.`);
    }
    return publication;
}

function git(args: string[], cwd = SATORI_ROOT): string {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
}

function assertCleanWorktree(repoPath: string, label: string): void {
    const dirty = git(['status', '--porcelain', '--untracked-files=all'], repoPath);
    if (dirty.length > 0) {
        throw new Error(`${label} must be clean. Dirty paths:\n${dirty}`);
    }
}

function assertHead(repoPath: string, expectedHead: string, label: string): void {
    const actualHead = git(['rev-parse', 'HEAD'], repoPath);
    if (actualHead !== expectedHead) {
        throw new Error(`${label} HEAD moved during qualification (${expectedHead} -> ${actualHead}).`);
    }
}

function buildExactHead(): string {
    assertCleanWorktree(SATORI_ROOT, 'Satori worktree');
    const head = git(['rev-parse', 'HEAD']);
    execFileSync('pnpm', ['run', 'build'], {
        cwd: SATORI_ROOT,
        stdio: 'inherit',
        env: process.env,
    });
    assertCleanWorktree(SATORI_ROOT, 'Satori worktree after build');
    assertHead(SATORI_ROOT, head, 'Satori');
    if (!fs.existsSync(RUNTIME_ENTRY)) {
        throw new Error(`Built MCP runtime is missing: ${RUNTIME_ENTRY}`);
    }
    return head;
}

function sourceFacts(): SourceFacts {
    const filePath = path.join(TARGET_REPO, TARGET_FILE);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Required TruffleHog witness file is missing: ${filePath}`);
    }
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    const findUniqueLine = (needle: string): number => {
        const matches = lines.flatMap((line, index) => line.includes(needle) ? [index + 1] : []);
        if (matches.length !== 1) {
            throw new Error(`Expected exactly one '${needle}' in ${TARGET_FILE}, saw ${matches.length}.`);
        }
        return matches[0];
    };
    return {
        checkPackageDirLine: findUniqueLine('func CheckPackageDir('),
        checkFilesLine: findUniqueLine('func checkFiles('),
        callSiteLine: findUniqueLine('return checkFiles('),
    };
}

async function connect(stateRoot: string): Promise<CliMcpSession> {
    const helperPath = path.join(POTION_ASSETS, 'satori-potion');
    const modelPath = path.join(POTION_ASSETS, 'model');
    const childEnv = { ...process.env };
    delete childEnv.SATORI_LATEON_PROFILE;
    delete childEnv.SATORI_LATEON_ACTIVATION_POLICY;
    delete childEnv.SATORI_LATEON_MODEL_PATH;

    return connectCliMcpSession({
        command: process.execPath,
        args: [RUNTIME_ENTRY],
        env: {
            ...childEnv,
            EMBEDDING_PROVIDER: 'Potion',
            VECTOR_STORE_PROVIDER: 'LanceDB',
            LANCEDB_PATH: path.join(stateRoot, 'lancedb'),
            SATORI_STATE_ROOT: stateRoot,
            SATORI_RUNTIME_PROFILE: 'offline',
            SATORI_RERANKER_PROVIDER: 'none',
            POTION_HELPER_PATH: helperPath,
            POTION_MODEL_PATH: modelPath,
            POTION_REQUEST_TIMEOUT_MS: '15000',
            SATORI_SESSION_ROOTS_JSON: JSON.stringify([TARGET_REPO]),
        },
        startupTimeoutMs: 30_000,
        callTimeoutMs: OPERATION_TIMEOUT_MS,
        writeStderr: (chunk) => process.stderr.write(chunk),
    });
}

async function readStatus(session: CliMcpSession): Promise<JsonRecord> {
    return parseFirstText(await session.callTool('manage_index', {
        action: 'status',
        path: TARGET_REPO,
    }));
}

async function waitForCompletedOperation(
    session: CliMcpSession,
    startedOperation: OperationIdentity | undefined,
    description: string,
): Promise<JsonRecord> {
    const deadline = Date.now() + OPERATION_TIMEOUT_MS;
    let lastSignature = '';

    while (Date.now() < deadline) {
        const status = await readStatus(session);
        const operation = readOperation(status);
        const signature = JSON.stringify({
            status: status.status,
            reason: status.reason,
            operation,
            publication: readPublication(status),
        });
        if (signature !== lastSignature) {
            debug(`${description} status`, { status: status.status, reason: status.reason, operation, publication: readPublication(status) });
            lastSignature = signature;
        }

        if (operation) {
            if (operation.phase === 'failed' || operation.phase === 'blocked') {
                throw new Error(`Index operation ${operation.id} ${operation.phase}: ${JSON.stringify(status)}`);
            }
            if (
                operation.phase === 'completed'
                && (!startedOperation || operation.id === startedOperation.id)
            ) {
                return status;
            }
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error(`Timed out waiting for ${description}.`);
}

async function establishPublication(session: CliMcpSession): Promise<PublicationIdentity> {
    const initial = await readStatus(session);
    debug('Initial isolated-state status', initial);
    if (initial.status !== 'not_indexed' && initial.status !== 'requires_reindex') {
        throw new Error(`Isolated state unexpectedly returned status=${String(initial.status)}.`);
    }

    const action = initial.status === 'requires_reindex' ? 'reindex' : 'create';
    const start = parseFirstText(await session.callTool('manage_index', {
        action,
        path: TARGET_REPO,
    }));
    debug(`${action} start response`, start);
    const completed = await waitForCompletedOperation(session, readOperation(start), `${action} completion`);
    return requirePublication(completed, 'Indexed TruffleHog publication');
}

async function searchCanonicalSymbol(
    session: CliMcpSession,
    symbolName: 'CheckPackageDir' | 'checkFiles',
    expectedLine: number,
): Promise<{ codebaseRoot: string; target: SymbolRef; result: JsonRecord }> {
    const response = parseFirstText(await session.callTool('search_codebase', {
        path: TARGET_REPO,
        query: `path:${TARGET_FILE} must:${symbolName} ${symbolName}`,
        scope: 'runtime',
        resultMode: 'grouped',
        groupBy: 'symbol',
        limit: 20,
        disclosureLimit: 20,
        includeResultIndex: true,
    }));
    debug(`search_codebase ${symbolName}`, response);
    if (response.status !== 'ok') {
        throw new Error(`search_codebase ${symbolName} returned status=${String(response.status)} reason=${String(response.reason)}.`);
    }

    const codebaseRoot = requireString(response, 'codebaseRoot', `search_codebase ${symbolName}`);
    const expectedRoot = fs.realpathSync(TARGET_REPO);
    if (fs.realpathSync(codebaseRoot) !== expectedRoot) {
        throw new Error(`search_codebase ${symbolName} served unexpected root ${codebaseRoot}.`);
    }

    const matches = asRecords(response.results).filter((result) => {
        const target = asRecord(result.target);
        const navigation = asRecord(result.navigation);
        const span = target ? asRecord(target.span) : undefined;
        return target?.file === TARGET_FILE
            && typeof target.symbolId === 'string'
            && target.symbolId.length > 0
            && typeof result.displayLabel === 'string'
            && result.displayLabel.includes(symbolName)
            && result.symbolKind === 'function'
            && span?.startLine === expectedLine
            && navigation?.graph === 'ready';
    });
    if (matches.length !== 1) {
        throw new Error(`Expected exactly one graph-ready canonical ${symbolName} result in ${TARGET_FILE}:${expectedLine}, saw ${matches.length}.`);
    }

    const result = matches[0];
    const targetRecord = asRecord(result.target)!;
    return {
        codebaseRoot,
        target: {
            file: requireString(targetRecord, 'file', `${symbolName} target`),
            symbolId: requireString(targetRecord, 'symbolId', `${symbolName} target`),
            span: requireSpan(targetRecord, `${symbolName} target`),
        },
        result,
    };
}

async function callGraph(
    session: CliMcpSession,
    codebaseRoot: string,
    symbolRef: SymbolRef,
    direction: 'callers' | 'callees',
    expectedPublicationId: string,
): Promise<JsonRecord> {
    const response = parseFirstText(await session.callTool('call_graph', {
        path: codebaseRoot,
        symbolRef,
        direction,
        depth: 1,
        limit: 20,
    }));
    debug(`call_graph ${direction}`, response);
    if (response.status !== 'ok' || response.supported !== true) {
        throw new Error(`call_graph ${direction} failed closed: status=${String(response.status)} reason=${String(response.reason)}.`);
    }
    if (requireString(response, 'path', `call_graph ${direction}`) !== codebaseRoot) {
        throw new Error(`call_graph ${direction} served a different codebase root.`);
    }
    const navigationAuthority = asRecord(response.navigationAuthority);
    if (!navigationAuthority) {
        throw new Error(`call_graph ${direction} omitted navigationAuthority.`);
    }
    const publicationId = requireString(navigationAuthority, 'publicationId', `call_graph ${direction} navigationAuthority`);
    if (publicationId !== expectedPublicationId) {
        throw new Error(`call_graph ${direction} served Publication ${publicationId}, expected ${expectedPublicationId}.`);
    }
    return response;
}

function requireNode(response: JsonRecord, symbolId: string, expectedFile: string, label: string): JsonRecord {
    const matches = asRecords(response.nodes).filter((node) => node.symbolId === symbolId && node.file === expectedFile);
    if (matches.length !== 1) {
        throw new Error(`${label} graph node mismatch for ${symbolId}: expected one node in ${expectedFile}, saw ${matches.length}.`);
    }
    return matches[0];
}

function requireEdge(input: {
    response: JsonRecord;
    sourceSymbolId: string;
    targetSymbolId: string;
    expectedCallSiteLine: number;
    label: string;
}): JsonRecord {
    const matches = asRecords(input.response.edges).filter((edge) => {
        const site = asRecord(edge.site);
        return edge.srcSymbolId === input.sourceSymbolId
            && edge.dstSymbolId === input.targetSymbolId
            && edge.kind === 'call'
            && site?.file === TARGET_FILE
            && site.startLine === input.expectedCallSiteLine;
    });
    if (matches.length !== 1) {
        throw new Error(`${input.label} expected exactly one CheckPackageDir -> checkFiles edge at ${TARGET_FILE}:${input.expectedCallSiteLine}, saw ${matches.length}.`);
    }
    return matches[0];
}

async function main(): Promise<void> {
    console.log('='.repeat(80));
    console.log('GO calls_v0: TRUFFLEHOG PUBLIC CALL-GRAPH PRODUCT WITNESS');
    console.log(`Target repository: ${TARGET_REPO}`);
    console.log(`Target source: ${TARGET_FILE}`);
    console.log('='.repeat(80));

    if (!fs.existsSync(TARGET_REPO)) throw new Error(`Target repository does not exist: ${TARGET_REPO}`);
    assertCleanWorktree(TARGET_REPO, 'TruffleHog worktree');
    assertCleanWorktree(SATORI_ROOT, 'Satori worktree');

    const truffleHogHead = git(['rev-parse', 'HEAD'], TARGET_REPO);
    const facts = sourceFacts();
    const satoriHead = buildExactHead();
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-go-call-graph-'));
    let session: CliMcpSession | undefined;
    let failure: unknown;

    try {
        assertHead(TARGET_REPO, truffleHogHead, 'TruffleHog');
        session = await connect(stateRoot);

        console.log('\n[1/5] Indexing TruffleHog through public manage_index on one live MCP runtime...');
        const publication = await establishPublication(session);
        console.log(`Publication: ${publication.collectionName} / ${publication.publicationId}`);

        console.log('[2/5] Resolving canonical CheckPackageDir through public search_codebase...');
        const checkPackageDir = await searchCanonicalSymbol(session, 'CheckPackageDir', facts.checkPackageDirLine);
        console.log(`CheckPackageDir: ${checkPackageDir.target.symbolId} @ ${checkPackageDir.target.file}:${checkPackageDir.target.span.startLine}-${checkPackageDir.target.span.endLine}`);

        console.log('[3/5] Traversing CheckPackageDir callees through public call_graph...');
        const callees = await callGraph(
            session,
            checkPackageDir.codebaseRoot,
            checkPackageDir.target,
            'callees',
            publication.publicationId,
        );
        requireNode(callees, checkPackageDir.target.symbolId, TARGET_FILE, 'CheckPackageDir');
        const checkFilesNodeCandidates = asRecords(callees.nodes).filter((node) => (
            node.file === TARGET_FILE
            && typeof node.symbolId === 'string'
            && typeof node.symbolLabel === 'string'
            && node.symbolLabel.includes('checkFiles')
        ));
        if (checkFilesNodeCandidates.length !== 1) {
            throw new Error(`Expected one checkFiles node in CheckPackageDir callees, saw ${checkFilesNodeCandidates.length}.`);
        }
        const checkFilesNode = checkFilesNodeCandidates[0];
        const calleeTargetId = requireString(checkFilesNode, 'symbolId', 'checkFiles callee node');
        requireEdge({
            response: callees,
            sourceSymbolId: checkPackageDir.target.symbolId,
            targetSymbolId: calleeTargetId,
            expectedCallSiteLine: facts.callSiteLine,
            label: 'Callee traversal',
        });

        console.log('[4/5] Resolving checkFiles and proving the reverse caller relationship...');
        const checkFiles = await searchCanonicalSymbol(session, 'checkFiles', facts.checkFilesLine);
        if (checkFiles.codebaseRoot !== checkPackageDir.codebaseRoot) {
            throw new Error('CheckPackageDir and checkFiles searches disagreed on codebaseRoot.');
        }
        if (checkFiles.target.symbolId !== calleeTargetId) {
            throw new Error(`Callee edge target ${calleeTargetId} disagreed with canonical checkFiles search target ${checkFiles.target.symbolId}.`);
        }
        const callers = await callGraph(
            session,
            checkFiles.codebaseRoot,
            checkFiles.target,
            'callers',
            publication.publicationId,
        );
        requireNode(callers, checkPackageDir.target.symbolId, TARGET_FILE, 'CheckPackageDir caller');
        requireNode(callers, checkFiles.target.symbolId, TARGET_FILE, 'checkFiles');
        requireEdge({
            response: callers,
            sourceSymbolId: checkPackageDir.target.symbolId,
            targetSymbolId: checkFiles.target.symbolId,
            expectedCallSiteLine: facts.callSiteLine,
            label: 'Caller traversal',
        });

        console.log('[5/5] Verifying serving Publication and repository identities stayed fixed...');
        const finalStatus = await readStatus(session);
        const finalPublication = requirePublication(finalStatus, 'Final manage_index status');
        if (
            finalPublication.publicationId !== publication.publicationId
            || finalPublication.collectionName !== publication.collectionName
        ) {
            throw new Error('Serving Publication changed during the public call-graph witness.');
        }
        assertHead(SATORI_ROOT, satoriHead, 'Satori');
        assertHead(TARGET_REPO, truffleHogHead, 'TruffleHog');
        assertCleanWorktree(SATORI_ROOT, 'Satori worktree after witness');
        assertCleanWorktree(TARGET_REPO, 'TruffleHog worktree after witness');

        const calleeAuthority = asRecord(callees.navigationAuthority)!;
        const callerAuthority = asRecord(callers.navigationAuthority)!;
        console.log('\n' + '='.repeat(80));
        console.log('GO calls_v0 TRUFFLEHOG PRODUCT WITNESS PASSED');
        console.log(`Satori HEAD:     ${satoriHead}`);
        console.log(`TruffleHog HEAD: ${truffleHogHead}`);
        console.log(`Publication ID:  ${publication.publicationId}`);
        console.log(`CheckPackageDir: ${checkPackageDir.target.symbolId} (${TARGET_FILE}:${checkPackageDir.target.span.startLine}-${checkPackageDir.target.span.endLine})`);
        console.log(`checkFiles:      ${checkFiles.target.symbolId} (${TARGET_FILE}:${checkFiles.target.span.startLine}-${checkFiles.target.span.endLine})`);
        console.log(`Call site:       ${TARGET_FILE}:${facts.callSiteLine}`);
        console.log(`Callee authority publication: ${String(calleeAuthority.publicationId)}`);
        console.log(`Caller authority publication: ${String(callerAuthority.publicationId)}`);
        console.log(' - search_codebase returned canonical graph-ready CheckPackageDir and checkFiles symbols');
        console.log(' - callees proved CheckPackageDir -> checkFiles with exact symbol IDs and source call site');
        console.log(' - callers proved the same CheckPackageDir -> checkFiles relationship in reverse traversal');
        console.log(' - both call_graph traversals were attributed to the serving Publication');
        console.log('='.repeat(80));
    } catch (error) {
        failure = error;
        console.error(`[GO-CALL-GRAPH-FAIL] ${formatError(error)}`);
        if (session) {
            try {
                debug('Final manage_index status after failure', await readStatus(session));
            } catch (statusError) {
                console.error(`[GO-CALL-GRAPH-FAIL] Could not read final status: ${formatError(statusError)}`);
            }
        }
        throw error;
    } finally {
        if (session) await session.close();
        if (failure && KEEP_FAILED_STATE) {
            console.error(`[GO-CALL-GRAPH-DEBUG] Preserving failed isolated state root: ${stateRoot}`);
        } else {
            fs.rmSync(stateRoot, { recursive: true, force: true });
        }
        assertHead(SATORI_ROOT, satoriHead, 'Satori');
        assertHead(TARGET_REPO, truffleHogHead, 'TruffleHog');
        assertCleanWorktree(SATORI_ROOT, 'Satori worktree after cleanup');
        assertCleanWorktree(TARGET_REPO, 'TruffleHog worktree after cleanup');
    }
}

main().catch((error) => {
    console.error('Go calls_v0 TruffleHog Product Witness Failed:', error);
    process.exit(1);
});
