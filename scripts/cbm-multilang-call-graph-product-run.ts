import assert from 'node:assert/strict';
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
const POTION_ASSETS = path.join(MCP_ROOT, 'assets', 'potion', 'linux-x64');
const POLL_INTERVAL_MS = 100;
const OPERATION_TIMEOUT_MS = 5 * 60_000;

type JsonRecord = Record<string, unknown>;

type OperationIdentity = {
    readonly id: string;
    readonly phase: string;
};

type PublicationIdentity = {
    readonly publicationId: string;
    readonly collectionName: string;
};

type SymbolRef = {
    readonly file: string;
    readonly symbolId: string;
    readonly span: {
        readonly startLine: number;
        readonly endLine: number;
    };
};

type Fixture = {
    readonly language: 'java' | 'csharp' | 'cpp' | 'rust';
    readonly label: string;
    readonly directCaller: { readonly file: string; readonly name: string; readonly callNeedle: string };
    readonly directTarget: { readonly file: string; readonly name: string };
    readonly receiverCaller: { readonly file: string; readonly name: string };
    readonly receiverTarget: { readonly file: string; readonly name: string };
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
    if (!operation || typeof operation.id !== 'string' || typeof operation.phase !== 'string') {
        return undefined;
    }
    return { id: operation.id, phase: operation.phase };
}

function readPublication(response: JsonRecord): PublicationIdentity | undefined {
    const publication = asRecord(response.publication);
    if (
        !publication
        || typeof publication.publicationId !== 'string'
        || publication.publicationId.length === 0
        || typeof publication.collectionName !== 'string'
        || publication.collectionName.length === 0
    ) {
        return undefined;
    }
    return {
        publicationId: publication.publicationId,
        collectionName: publication.collectionName,
    };
}

function requirePublication(response: JsonRecord, label: string): PublicationIdentity {
    const publication = readPublication(response);
    if (!publication) throw new Error(`${label} did not expose a Publication identity.`);
    return publication;
}

function writeFixture(root: string, relativePath: string, source: string): void {
    const destination = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, source);
}

function createFixtureRepository(): { root: string; fixtures: readonly Fixture[] } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-cbm-multilang-repo-'));

    const javaMain = `package demo;
public class Main {
  public static int JavaDirectCaller() {
    return Util.JavaDirectTarget();
  }
}
`;
    const javaUtil = `package demo;
public class Util {
  public static int JavaDirectTarget() {
    return 1;
  }
}
`;
    const javaReceiver = `package demo;
public class ReceiverProbe {
  public int JavaReceiverTarget() {
    return 1;
  }
  public int JavaReceiverCaller() {
    return JavaReceiverTarget();
  }
}
`;
    writeFixture(root, 'java/pom.xml', '<project><modelVersion>4.0.0</modelVersion><groupId>demo</groupId><artifactId>demo</artifactId><version>1</version></project>\n');
    writeFixture(root, 'java/src/main/java/demo/Main.java', javaMain);
    writeFixture(root, 'java/src/main/java/demo/Util.java', javaUtil);
    writeFixture(root, 'java/src/main/java/demo/ReceiverProbe.java', javaReceiver);

    const csharpMain = `namespace Demo;
public static class MainEntry {
  public static int CSharpDirectCaller() {
    return Util.CSharpDirectTarget();
  }
}
`;
    const csharpUtil = `namespace Demo;
public static class Util {
  public static int CSharpDirectTarget() {
    return 1;
  }
}
`;
    const csharpReceiver = `namespace Demo;
public class ReceiverProbe {
  public int CSharpReceiverTarget() {
    return 1;
  }
  public int CSharpReceiverCaller() {
    return CSharpReceiverTarget();
  }
}
`;
    writeFixture(root, 'csharp/Demo.csproj', '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>\n');
    writeFixture(root, 'csharp/Main.cs', csharpMain);
    writeFixture(root, 'csharp/Util.cs', csharpUtil);
    writeFixture(root, 'csharp/ReceiverProbe.cs', csharpReceiver);

    const cppSource = `int CppDirectTarget() {
  return 1;
}
int CppDirectCaller() {
  return CppDirectTarget();
}
struct ReceiverProbe {
  int CppReceiverTarget() {
    return 1;
  }
  int CppReceiverCaller() {
    return CppReceiverTarget();
  }
};
`;
    writeFixture(root, 'cpp/main.cpp', cppSource);

    const rustLib = `mod util;
pub fn rust_direct_caller() -> i32 {
    crate::util::rust_direct_target()
}
pub struct ReceiverProbe;
impl ReceiverProbe {
    pub fn rust_receiver_target(&self) -> i32 {
        1
    }
    pub fn rust_receiver_caller(&self) -> i32 {
        self.rust_receiver_target()
    }
}
`;
    const rustUtil = `pub fn rust_direct_target() -> i32 {
    1
}
`;
    writeFixture(root, 'rust/Cargo.toml', '[package]\nname = "satori-cbm-witness"\nversion = "0.1.0"\nedition = "2021"\n');
    writeFixture(root, 'rust/src/lib.rs', rustLib);
    writeFixture(root, 'rust/src/util.rs', rustUtil);

    return {
        root,
        fixtures: [
            {
                language: 'java',
                label: 'Java',
                directCaller: {
                    file: 'java/src/main/java/demo/Main.java',
                    name: 'JavaDirectCaller',
                    callNeedle: 'return Util.JavaDirectTarget();',
                },
                directTarget: { file: 'java/src/main/java/demo/Util.java', name: 'JavaDirectTarget' },
                receiverCaller: { file: 'java/src/main/java/demo/ReceiverProbe.java', name: 'JavaReceiverCaller' },
                receiverTarget: { file: 'java/src/main/java/demo/ReceiverProbe.java', name: 'JavaReceiverTarget' },
            },
            {
                language: 'csharp',
                label: 'C#',
                directCaller: { file: 'csharp/Main.cs', name: 'CSharpDirectCaller', callNeedle: 'return Util.CSharpDirectTarget();' },
                directTarget: { file: 'csharp/Util.cs', name: 'CSharpDirectTarget' },
                receiverCaller: { file: 'csharp/ReceiverProbe.cs', name: 'CSharpReceiverCaller' },
                receiverTarget: { file: 'csharp/ReceiverProbe.cs', name: 'CSharpReceiverTarget' },
            },
            {
                language: 'cpp',
                label: 'C++',
                directCaller: { file: 'cpp/main.cpp', name: 'CppDirectCaller', callNeedle: 'return CppDirectTarget();' },
                directTarget: { file: 'cpp/main.cpp', name: 'CppDirectTarget' },
                receiverCaller: { file: 'cpp/main.cpp', name: 'CppReceiverCaller' },
                receiverTarget: { file: 'cpp/main.cpp', name: 'CppReceiverTarget' },
            },
            {
                language: 'rust',
                label: 'Rust',
                directCaller: { file: 'rust/src/lib.rs', name: 'rust_direct_caller', callNeedle: 'crate::util::rust_direct_target()' },
                directTarget: { file: 'rust/src/util.rs', name: 'rust_direct_target' },
                receiverCaller: { file: 'rust/src/lib.rs', name: 'rust_receiver_caller' },
                receiverTarget: { file: 'rust/src/lib.rs', name: 'rust_receiver_target' },
            },
        ],
    };
}

function lineContaining(root: string, relativePath: string, needle: string): number {
    const lines = fs.readFileSync(path.join(root, relativePath), 'utf8').split(/\r?\n/);
    const matches = lines.flatMap((line, index) => line.includes(needle) ? [index + 1] : []);
    assert.equal(matches.length, 1, `Expected one '${needle}' in ${relativePath}.`);
    return matches[0];
}

async function connect(repoRoot: string, stateRoot: string): Promise<CliMcpSession> {
    if (!fs.existsSync(RUNTIME_ENTRY)) {
        throw new Error(`Built MCP runtime is missing: ${RUNTIME_ENTRY}. Run pnpm run build first.`);
    }
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
            SATORI_SESSION_ROOTS_JSON: JSON.stringify([repoRoot]),
        },
        startupTimeoutMs: 30_000,
        callTimeoutMs: OPERATION_TIMEOUT_MS,
        writeStderr: (chunk) => process.stderr.write(chunk),
    });
}

async function readStatus(session: CliMcpSession, repoRoot: string): Promise<JsonRecord> {
    return parseFirstText(await session.callTool('manage_index', { action: 'status', path: repoRoot }));
}

async function establishPublication(session: CliMcpSession, repoRoot: string): Promise<PublicationIdentity> {
    const initial = await readStatus(session, repoRoot);
    assert.equal(initial.status, 'not_indexed', `Expected fresh fixture state, saw ${String(initial.status)}.`);

    const start = parseFirstText(await session.callTool('manage_index', { action: 'create', path: repoRoot }));
    const started = readOperation(start);
    const deadline = Date.now() + OPERATION_TIMEOUT_MS;

    while (Date.now() < deadline) {
        const status = await readStatus(session, repoRoot);
        const operation = readOperation(status);
        if (operation?.phase === 'failed' || operation?.phase === 'blocked') {
            throw new Error(`Fixture indexing ${operation.phase}: ${JSON.stringify(status)}`);
        }
        if (operation?.phase === 'completed' && (!started || operation.id === started.id)) {
            return requirePublication(status, 'Fixture index');
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error('Timed out waiting for the CBM fixture Publication.');
}

async function searchSymbol(
    session: CliMcpSession,
    repoRoot: string,
    file: string,
    symbolName: string,
): Promise<{ readonly codebaseRoot: string; readonly target: SymbolRef }> {
    const response = parseFirstText(await session.callTool('search_codebase', {
        path: repoRoot,
        query: `path:${file} must:${symbolName} ${symbolName}`,
        scope: 'runtime',
        resultMode: 'grouped',
        groupBy: 'symbol',
        limit: 20,
        disclosureLimit: 20,
        includeResultIndex: true,
    }));
    assert.equal(response.status, 'ok', `search_codebase ${symbolName} failed: ${JSON.stringify(response)}`);

    const matches = asRecords(response.results).filter((result) => {
        const target = asRecord(result.target);
        const navigation = asRecord(result.navigation);
        return target?.file === file
            && typeof target.symbolId === 'string'
            && target.symbolId.length > 0
            && typeof result.displayLabel === 'string'
            && result.displayLabel.includes(symbolName)
            && navigation?.graph === 'ready';
    });
    assert.equal(matches.length, 1, `Expected one graph-ready ${symbolName} result in ${file}, saw ${matches.length}.`);

    const target = asRecord(matches[0].target)!;
    return {
        codebaseRoot: requireString(response, 'codebaseRoot', `search_codebase ${symbolName}`),
        target: {
            file: requireString(target, 'file', `${symbolName} target`),
            symbolId: requireString(target, 'symbolId', `${symbolName} target`),
            span: requireSpan(target, `${symbolName} target`),
        },
    };
}

async function callGraph(
    session: CliMcpSession,
    codebaseRoot: string,
    symbolRef: SymbolRef,
    direction: 'callers' | 'callees',
    publicationId: string,
): Promise<JsonRecord> {
    const response = parseFirstText(await session.callTool('call_graph', {
        path: codebaseRoot,
        symbolRef,
        direction,
        depth: 1,
        limit: 20,
    }));
    assert.equal(response.status, 'ok', `call_graph ${direction} returned ${JSON.stringify(response)}`);
    assert.equal(response.supported, true, `call_graph ${direction} unexpectedly unsupported.`);
    const authority = asRecord(response.navigationAuthority);
    assert.ok(authority, `call_graph ${direction} omitted navigationAuthority.`);
    assert.equal(authority.publicationId, publicationId, `call_graph ${direction} changed Publication.`);
    return response;
}

function requireDirectEdge(
    response: JsonRecord,
    caller: SymbolRef,
    target: SymbolRef,
    expectedFile: string,
    expectedLine: number,
    label: string,
): void {
    const matches = asRecords(response.edges).filter((edge) => {
        const site = asRecord(edge.site);
        return edge.srcSymbolId === caller.symbolId
            && edge.dstSymbolId === target.symbolId
            && edge.kind === 'call'
            && site?.file === expectedFile
            && site.startLine === expectedLine;
    });
    assert.equal(matches.length, 1, `${label} expected one exact direct-call edge, saw ${matches.length}.`);
}

function requireNoReceiverEdge(response: JsonRecord, caller: SymbolRef, target: SymbolRef, label: string): void {
    const leaked = asRecords(response.edges).filter((edge) => (
        edge.srcSymbolId === caller.symbolId
        && edge.dstSymbolId === target.symbolId
        && edge.kind === 'call'
    ));
    assert.equal(leaked.length, 0, `${label} leaked receiver/type dispatch into Tier-3 CALLS v0.`);
}

async function qualifyFixture(
    session: CliMcpSession,
    repoRoot: string,
    publicationId: string,
    fixture: Fixture,
): Promise<void> {
    const caller = await searchSymbol(session, repoRoot, fixture.directCaller.file, fixture.directCaller.name);
    const target = await searchSymbol(session, repoRoot, fixture.directTarget.file, fixture.directTarget.name);
    assert.equal(caller.codebaseRoot, target.codebaseRoot, `${fixture.label} direct symbols disagreed on codebase root.`);
    const callLine = lineContaining(repoRoot, fixture.directCaller.file, fixture.directCaller.callNeedle);

    const callees = await callGraph(session, caller.codebaseRoot, caller.target, 'callees', publicationId);
    requireDirectEdge(callees, caller.target, target.target, fixture.directCaller.file, callLine, `${fixture.label} callees`);

    const callers = await callGraph(session, target.codebaseRoot, target.target, 'callers', publicationId);
    requireDirectEdge(callers, caller.target, target.target, fixture.directCaller.file, callLine, `${fixture.label} callers`);

    const receiverCaller = await searchSymbol(session, repoRoot, fixture.receiverCaller.file, fixture.receiverCaller.name);
    const receiverTarget = await searchSymbol(session, repoRoot, fixture.receiverTarget.file, fixture.receiverTarget.name);
    const receiverGraph = await callGraph(
        session,
        receiverCaller.codebaseRoot,
        receiverCaller.target,
        'callees',
        publicationId,
    );
    requireNoReceiverEdge(receiverGraph, receiverCaller.target, receiverTarget.target, fixture.label);

    console.log(`PASS ${fixture.label}: direct edge visible in both directions; receiver/type dispatch excluded.`);
}

async function main(): Promise<void> {
    console.log('='.repeat(80));
    console.log('CBM MULTI-LANGUAGE PUBLIC CALL-GRAPH PRODUCT WITNESS');
    console.log('Java · C# · C++ · Rust');
    console.log('='.repeat(80));

    const fixtureRepo = createFixtureRepository();
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'satori-cbm-multilang-state-'));
    let session: CliMcpSession | undefined;

    try {
        session = await connect(fixtureRepo.root, stateRoot);
        console.log('[1/2] Indexing the four-language fixture through public manage_index...');
        const publication = await establishPublication(session, fixtureRepo.root);
        console.log(`Publication: ${publication.collectionName} / ${publication.publicationId}`);

        console.log('[2/2] Proving public search_codebase -> call_graph behavior...');
        for (const fixture of fixtureRepo.fixtures) {
            await qualifyFixture(session, fixtureRepo.root, publication.publicationId, fixture);
        }

        const finalPublication = requirePublication(
            await readStatus(session, fixtureRepo.root),
            'Final fixture status',
        );
        assert.deepEqual(finalPublication, publication, 'Serving Publication changed during the witness.');

        console.log('='.repeat(80));
        console.log('CBM MULTI-LANGUAGE PRODUCT WITNESS PASSED');
        console.log(' - Java cross-file static direct call proved within one Maven root');
        console.log(' - C# cross-file static direct call proved within one .csproj root');
        console.log(' - C++ same-translation-unit direct call proved');
        console.log(' - Rust cross-file direct call proved within one Cargo root');
        console.log(' - receiver/type dispatch stayed out of public Tier-3 CALLS v0 for all four languages');
        console.log(' - every traversal stayed pinned to one serving Publication');
        console.log('='.repeat(80));
    } finally {
        if (session) await session.close();
        fs.rmSync(stateRoot, { recursive: true, force: true });
        fs.rmSync(fixtureRepo.root, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error('CBM multi-language product witness failed:', error);
    process.exit(1);
});
