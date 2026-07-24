import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
    buildRuntimeIndexFingerprint,
    type ContextMcpConfig,
} from "../config.js";
import {
    SearchContinuationCoordinator,
    ToolHandlers,
    type FrozenSearchResultSet,
} from "../core/handlers.js";
import { toolRegistry } from "../tools/registry.js";
import type { ToolContext } from "../tools/types.js";
import { SharedRuntimeHost } from "./shared-runtime.js";

function config(): ContextMcpConfig {
    return {
        name: "satori-shared-runtime-test",
        version: "1.0.0",
        executionProfile: "connected",
        networkPolicy: { kind: "remote-allowed" },
        vectorStoreProvider: "Milvus",
        encoderProvider: "VoyageAI",
        encoderModel: "voyage-code-3",
        encoderOutputDimension: 1024,
        readFileMaxLines: 1000,
        watchSyncEnabled: false,
        watchDebounceMs: 5000,
    };
}

async function connectClient(host: SharedRuntimeHost, name: string) {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const session = host.createSession();
    const client = new Client({ name, version: "1.0.0" });
    await session.connect(serverTransport);
    await client.connect(clientTransport);
    return { client, session };
}

test("one runtime host serves independent MCP sessions over separate transports", async (t) => {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "satori-shared-runtime-"));
    const previousStateRoot = process.env.SATORI_STATE_ROOT;
    process.env.SATORI_STATE_ROOT = stateRoot;
    t.after(() => {
        if (previousStateRoot === undefined) delete process.env.SATORI_STATE_ROOT;
        else process.env.SATORI_STATE_ROOT = previousStateRoot;
        fs.rmSync(stateRoot, { recursive: true, force: true });
    });

    const runtimeConfig = config();
    const host = new SharedRuntimeHost(
        runtimeConfig,
        buildRuntimeIndexFingerprint(runtimeConfig, 1024),
        "cli",
    );
    t.after(() => host.shutdown());

    const first = await connectClient(host, "first");
    const second = await connectClient(host, "second");
    t.after(async () => {
        await first.client.close();
        await first.session.shutdown();
        await second.client.close();
        await second.session.shutdown();
    });

    assert.deepEqual(host.getActivity(), { sessions: 2, operations: 0 });
    assert.equal(host.getProviderRuntime(), host.getProviderRuntime());

    const [firstTools, secondTools] = await Promise.all([
        first.client.listTools(),
        second.client.listTools(),
    ]);
    assert.deepEqual(
        firstTools.tools.map((tool) => tool.name),
        secondTools.tools.map((tool) => tool.name),
    );
    assert.equal(firstTools.tools.length, 7);

    const firstInternals = first.session as unknown as {
        continuationCoordinator: SearchContinuationCoordinator;
        resources: {
            localHandlers: ToolHandlers;
            providerRuntime: { providerRuntime: unknown };
            toolContext: {
                context: unknown;
                snapshotManager: {
                    setCodebaseIndexing(path: string): void;
                    getCodebaseStatus(path: string): string;
                };
                syncManager: unknown;
                runtimeOwnerGate: unknown;
            };
        };
    };
    const secondInternals = second.session as unknown as {
        continuationCoordinator: SearchContinuationCoordinator;
        resources: typeof firstInternals.resources;
    };
    assert.equal(
        firstInternals.resources.toolContext.context,
        secondInternals.resources.toolContext.context,
    );
    assert.equal(
        firstInternals.resources.toolContext.snapshotManager,
        secondInternals.resources.toolContext.snapshotManager,
    );
    assert.equal(
        firstInternals.resources.toolContext.syncManager,
        secondInternals.resources.toolContext.syncManager,
    );
    assert.equal(
        firstInternals.resources.providerRuntime.providerRuntime,
        host.getProviderRuntime(),
    );
    assert.equal(
        secondInternals.resources.providerRuntime.providerRuntime,
        host.getProviderRuntime(),
    );
    assert.equal(
        firstInternals.resources.toolContext.runtimeOwnerGate,
        secondInternals.resources.toolContext.runtimeOwnerGate,
    );
    assert.equal(
        (firstInternals.resources.localHandlers as unknown as {
            mutationLeaseCoordinator: unknown;
        }).mutationLeaseCoordinator,
        (secondInternals.resources.localHandlers as unknown as {
            mutationLeaseCoordinator: unknown;
        }).mutationLeaseCoordinator,
    );
    const firstRoot = path.join(stateRoot, "repo-a");
    const secondRoot = path.join(stateRoot, "repo-b");
    firstInternals.resources.toolContext.snapshotManager.setCodebaseIndexing(firstRoot);
    secondInternals.resources.toolContext.snapshotManager.setCodebaseIndexing(secondRoot);
    assert.equal(
        firstInternals.resources.toolContext.snapshotManager.getCodebaseStatus(firstRoot),
        "indexing",
    );
    assert.equal(
        secondInternals.resources.toolContext.snapshotManager.getCodebaseStatus(secondRoot),
        "indexing",
    );
    const stored = firstInternals.continuationCoordinator.store(
        firstInternals.resources.localHandlers,
        {
            value: {} as FrozenSearchResultSet,
            nextOffset: 1,
            nowMs: 1,
        },
    );
    assert.equal(
        secondInternals.continuationCoordinator.lookup(stored.handle, 1).status,
        "not_found",
    );

    await first.client.close();
    await first.session.shutdown();
    assert.deepEqual(host.getActivity(), { sessions: 1, operations: 0 });

    const stillAvailable = await second.client.listTools();
    assert.equal(stillAvailable.tools.length, 7);
});

test("session shutdown waits for its active operation without stopping the host", async (t) => {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "satori-shared-operation-"));
    const previousStateRoot = process.env.SATORI_STATE_ROOT;
    process.env.SATORI_STATE_ROOT = stateRoot;
    const runtimeConfig = config();
    const host = new SharedRuntimeHost(
        runtimeConfig,
        buildRuntimeIndexFingerprint(runtimeConfig, 1024),
        "cli",
    );
    const connected = await connectClient(host, "operation-owner");
    const originalTool = toolRegistry.manage_index!;
    let releaseOperation!: () => void;
    const operationGate = new Promise<void>((resolve) => {
        releaseOperation = resolve;
    });
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
        markStarted = resolve;
    });
    toolRegistry.manage_index = {
        ...originalTool,
        execute: async () => {
            markStarted();
            await operationGate;
            return { content: [{ type: "text", text: "{}" }] };
        },
    };
    t.after(async () => {
        releaseOperation();
        toolRegistry.manage_index = originalTool;
        await connected.client.close().catch(() => undefined);
        await connected.session.shutdown();
        await host.shutdown();
        if (previousStateRoot === undefined) delete process.env.SATORI_STATE_ROOT;
        else process.env.SATORI_STATE_ROOT = previousStateRoot;
        fs.rmSync(stateRoot, { recursive: true, force: true });
    });

    const call = connected.client.callTool({
        name: "manage_index",
        arguments: { action: "status", path: stateRoot },
    }).catch(() => undefined);
    await started;
    let shutdownCompleted = false;
    const shutdown = connected.session.shutdown().then(() => {
        shutdownCompleted = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(host.getActivity(), { sessions: 0, operations: 1 });
    assert.equal(shutdownCompleted, false);

    releaseOperation();
    await Promise.all([call, shutdown]);
    assert.deepEqual(host.getActivity(), { sessions: 0, operations: 0 });
    assert.equal(shutdownCompleted, true);
});

test("disconnecting one session does not cancel shared provider bootstrap", async (t) => {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "satori-shared-bootstrap-"));
    const previousStateRoot = process.env.SATORI_STATE_ROOT;
    process.env.SATORI_STATE_ROOT = stateRoot;
    const runtimeConfig = {
        ...config(),
        voyageKey: "test-key",
        milvusEndpoint: "http://127.0.0.1:19530",
    };
    const host = new SharedRuntimeHost(
        runtimeConfig,
        buildRuntimeIndexFingerprint(runtimeConfig, 1024),
        "cli",
    );
    const first = await connectClient(host, "bootstrap-first");
    const second = await connectClient(host, "bootstrap-second");
    const firstInternals = first.session as unknown as {
        resources: { toolContext: ToolContext };
    };
    const providerRuntime = host.getProviderRuntime() as unknown as {
        createRuntime(requireEmbedding: boolean): Promise<ToolContext>;
    };
    const originalCreateRuntime = providerRuntime.createRuntime.bind(providerRuntime);
    const originalSearch = toolRegistry.search_codebase!;
    let releaseBootstrap!: () => void;
    const bootstrapGate = new Promise<void>((resolve) => {
        releaseBootstrap = resolve;
    });
    let markBootstrapStarted!: () => void;
    const bootstrapStarted = new Promise<void>((resolve) => {
        markBootstrapStarted = resolve;
    });
    let bootstrapCount = 0;
    providerRuntime.createRuntime = async () => {
        bootstrapCount += 1;
        markBootstrapStarted();
        await bootstrapGate;
        return firstInternals.resources.toolContext;
    };
    toolRegistry.search_codebase = {
        ...originalSearch,
        execute: async (_args, context) => {
            const providerContext = await context.providerRuntime.requireToolContext(
                "embedding_vector",
            );
            if ("code" in providerContext) {
                throw new Error(providerContext.message);
            }
            return { content: [{ type: "text", text: "{}" }] };
        },
    };
    t.after(async () => {
        releaseBootstrap();
        providerRuntime.createRuntime = originalCreateRuntime;
        toolRegistry.search_codebase = originalSearch;
        await first.client.close().catch(() => undefined);
        await first.session.shutdown();
        await second.client.close().catch(() => undefined);
        await second.session.shutdown();
        await host.shutdown();
        if (previousStateRoot === undefined) delete process.env.SATORI_STATE_ROOT;
        else process.env.SATORI_STATE_ROOT = previousStateRoot;
        fs.rmSync(stateRoot, { recursive: true, force: true });
    });

    const firstCall = first.client.callTool({
        name: "search_codebase",
        arguments: { path: stateRoot, query: "first" },
    }).catch(() => undefined);
    const secondCall = second.client.callTool({
        name: "search_codebase",
        arguments: { path: stateRoot, query: "second" },
    });
    await bootstrapStarted;

    let firstShutdownCompleted = false;
    const firstShutdown = first.session.shutdown().then(() => {
        firstShutdownCompleted = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(firstShutdownCompleted, false);
    assert.equal(bootstrapCount, 1);

    releaseBootstrap();
    await Promise.all([firstCall, secondCall, firstShutdown]);
    assert.equal(firstShutdownCompleted, true);
    assert.equal(bootstrapCount, 1);
    assert.equal((await second.client.listTools()).tools.length, 7);
    assert.deepEqual(host.getActivity(), { sessions: 1, operations: 0 });
});
