import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { connectCliMcpSession, type CliMcpSession } from "../../cli/src/client.js";

const MCP_ROOT = path.resolve(import.meta.dirname, "..");
const RUNTIME_ENTRY = path.join(MCP_ROOT, "dist", "index.js");
const POTION_ASSETS = path.join(MCP_ROOT, "assets", "potion", "linux-x64");
const FORMER_DEBOUNCE_MS = 5_000;
const BACKGROUND_STARTUP_SETTLE_MS = 5_500;

function parseFirstText(result: Awaited<ReturnType<CliMcpSession["callTool"]>>): Record<string, unknown> {
    const content = result.content as Array<{ type?: string; text?: string }>;
    const text = content.find((part) => part.type === "text")?.text;
    if (!text) throw new Error("Satori tool response did not contain text.");
    if (result.isError === true) throw new Error(`Satori tool failed: ${text}`);
    return JSON.parse(text) as Record<string, unknown>;
}

function operationIdentity(payload: Record<string, unknown>): string {
    const operation = payload.operation;
    if (!operation || typeof operation !== "object") return "none";
    const record = operation as Record<string, unknown>;
    return [record.id, record.generation, record.phase].map(String).join(":");
}

function resultCount(payload: Record<string, unknown>): number {
    return Array.isArray(payload.results) ? payload.results.length : 0;
}

function percentile95(values: number[]): number {
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? 0;
}

async function waitForIndex(session: CliMcpSession, fixtureRoot: string): Promise<Record<string, unknown>> {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
        const status = parseFirstText(await session.callTool("manage_index", {
            action: "status",
            path: fixtureRoot,
        }));
        const phase = (status.operation as Record<string, unknown> | undefined)?.phase;
        if (phase === "completed") return status;
        if (phase === "failed" || phase === "blocked") {
            throw new Error(`Index operation failed: ${JSON.stringify(status)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("Index operation did not complete within 120 seconds.");
}

async function search(
    session: CliMcpSession,
    fixtureRoot: string,
    query: string,
): Promise<{ elapsedMs: number; payload: Record<string, unknown> }> {
    const started = performance.now();
    const payload = parseFirstText(await session.callTool("search_codebase", {
        path: fixtureRoot,
        query,
        scope: "runtime",
        resultMode: "grouped",
        groupBy: "symbol",
        limit: 5,
    }));
    return { elapsedMs: performance.now() - started, payload };
}

async function connect(env: Record<string, string>): Promise<CliMcpSession> {
    return connectCliMcpSession({
        command: process.execPath,
        args: [RUNTIME_ENTRY],
        env,
        startupTimeoutMs: 30_000,
        callTimeoutMs: 120_000,
        writeStderr: () => {},
    });
}

async function main(): Promise<void> {
    if (!fs.existsSync(RUNTIME_ENTRY)) {
        throw new Error(`Build the MCP runtime before qualification: ${RUNTIME_ENTRY}`);
    }
    const helperPath = path.join(POTION_ASSETS, "satori-potion");
    const modelPath = path.join(POTION_ASSETS, "model");
    if (!fs.existsSync(helperPath) || !fs.existsSync(modelPath)) {
        throw new Error("Potion qualification assets are unavailable.");
    }

    const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "satori-watcher-observation-"));
    const fixtureRoot = path.join(taskRoot, "fixture");
    const stateRoot = path.join(taskRoot, "state");
    const outputPath = process.env.SATORI_WATCHER_QUALIFICATION_OUTPUT
        ? path.resolve(process.env.SATORI_WATCHER_QUALIFICATION_OUTPUT)
        : path.join(os.tmpdir(), `satori-watcher-observation-${process.pid}.json`);
    fs.mkdirSync(path.join(fixtureRoot, "src"), { recursive: true });
    fs.writeFileSync(
        path.join(fixtureRoot, "src", "base.ts"),
        "export function stableWatcherBaseline(): string { return 'baseline'; }\n",
    );

    const env = Object.fromEntries(
        Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
    Object.assign(env, {
        HOME: taskRoot,
        SATORI_STATE_ROOT: stateRoot,
        SATORI_RUNTIME_PROFILE: "offline",
        VECTOR_STORE_PROVIDER: "LanceDB",
        LANCEDB_PATH: path.join(stateRoot, "vector", "lancedb"),
        EMBEDDING_PROVIDER: "Potion",
        EMBEDDING_MODEL: "minishlab/potion-code-16M-v2@e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b",
        EMBEDDING_OUTPUT_DIMENSION: "256",
        POTION_HELPER_PATH: helperPath,
        POTION_MODEL_PATH: modelPath,
        POTION_REQUEST_TIMEOUT_MS: "5000",
        MCP_ENABLE_WATCHER: "true",
        SATORI_SHARED_RUNTIME_DISABLE: "1",
    });

    let session: CliMcpSession | undefined;
    try {
        session = await connect(env);
        parseFirstText(await session.callTool("manage_index", {
            action: "create",
            path: fixtureRoot,
            force: true,
        }));
        const created = await waitForIndex(session, fixtureRoot);
        const initialSearch = await search(session, fixtureRoot, "stableWatcherBaseline");
        if (resultCount(initialSearch.payload) === 0) {
            throw new Error("Initial watcher baseline was not searchable.");
        }
        // The provider runtime intentionally runs one background freshness pass
        // five seconds after startup. Let that distinct owner settle before
        // observing watcher-only source-event behavior.
        await new Promise((resolve) => setTimeout(resolve, BACKGROUND_STARTUP_SETTLE_MS));

        const beforeEdit = parseFirstText(await session.callTool("manage_index", {
            action: "status",
            path: fixtureRoot,
        }));
        const beforeIdentity = operationIdentity(beforeEdit);
        const changedFile = path.join(fixtureRoot, "src", "changed.ts");
        for (let write = 0; write < 10; write += 1) {
            fs.writeFileSync(
                changedFile,
                `export function watcherAdditionMarker(): number { return ${write}; }\n`,
            );
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await new Promise((resolve) => setTimeout(resolve, FORMER_DEBOUNCE_MS + 300));
        const afterQuiet = parseFirstText(await session.callTool("manage_index", {
            action: "status",
            path: fixtureRoot,
        }));
        const afterQuietIdentity = operationIdentity(afterQuiet);
        if (afterQuietIdentity !== beforeIdentity) {
            throw new Error(`Watcher unexpectedly published during the quiet wait: ${beforeIdentity} -> ${afterQuietIdentity}`);
        }

        const addSearch = await search(session, fixtureRoot, "watcherAdditionMarker");
        if (resultCount(addSearch.payload) === 0) {
            throw new Error("First search after the edit did not publish the added source.");
        }

        fs.writeFileSync(
            changedFile,
            "export function watcherModifiedMarker(): string { return 'modified'; }\n",
        );
        await new Promise((resolve) => setTimeout(resolve, 250));
        const modifySearch = await search(session, fixtureRoot, "watcherModifiedMarker");
        if (resultCount(modifySearch.payload) === 0) {
            throw new Error("Search did not publish the modified source.");
        }

        fs.rmSync(changedFile);
        await new Promise((resolve) => setTimeout(resolve, 250));
        const deleteSearch = await search(
            session,
            fixtureRoot,
            "must:watcherModifiedMarker watcherModifiedMarker",
        );
        if (resultCount(deleteSearch.payload) !== 0) {
            throw new Error("Deleted source remained searchable.");
        }

        const warmLatencies: number[] = [];
        for (let sample = 0; sample < 5; sample += 1) {
            warmLatencies.push((await search(session, fixtureRoot, "stableWatcherBaseline")).elapsedMs);
        }

        await session.close();
        session = await connect(env);
        const restartedStatus = parseFirstText(await session.callTool("manage_index", {
            action: "status",
            path: fixtureRoot,
        }));
        const restartSearch = await search(session, fixtureRoot, "stableWatcherBaseline");
        if (resultCount(restartSearch.payload) === 0) {
            throw new Error("Published source was not readable after restart.");
        }

        const summary = {
            schemaVersion: "watcher_observation_only_qualification_v1",
            outcome: "pass",
            satoriRevision: process.env.SATORI_QUALIFICATION_REVISION ?? "dirty_candidate",
            watcher: {
                configuredDebounceMs: 1,
                backgroundStartupSettleMs: BACKGROUND_STARTUP_SETTLE_MS,
                formerDebounceWaitMs: FORMER_DEBOUNCE_MS + 300,
                operationIdentityBeforeEdit: beforeIdentity,
                operationIdentityAfterQuietWait: afterQuietIdentity,
                automaticPublicationObserved: false,
            },
            lifecycle: {
                createOperation: operationIdentity(created),
                addResultCount: resultCount(addSearch.payload),
                modifyResultCount: resultCount(modifySearch.payload),
                deleteResultCount: resultCount(deleteSearch.payload),
                restartOperation: operationIdentity(restartedStatus),
                restartResultCount: resultCount(restartSearch.payload),
            },
            performance: {
                initialSearchMs: initialSearch.elapsedMs,
                firstChangedSearchMs: addSearch.elapsedMs,
                modifySearchMs: modifySearch.elapsedMs,
                deleteSearchMs: deleteSearch.elapsedMs,
                warmNoChangeSearchMs: warmLatencies,
                warmNoChangeSearchP95Ms: percentile95(warmLatencies),
            },
        };
        fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
        process.stdout.write(`${outputPath}\n`);
    } finally {
        await session?.close();
        fs.rmSync(taskRoot, { recursive: true, force: true });
    }
}

await main();
