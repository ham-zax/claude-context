#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
    JsonRpcStdioSession,
    callAndDecode,
} from "../../../scripts/satori-useful-context-record.mjs";

const TARGET_REVISION = "8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7";
const POTION_MODEL =
    "minishlab/potion-code-16M-v2@e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b";
const SEARCH_SAMPLES = 5;
const POLL_INTERVAL_MS = 500;
const READY_TIMEOUT_MS = 20 * 60 * 1000;

// Frozen before execution. The search limits reuse the accepted one-file
// synchronization and incremental-publication deployment budgets.
const BUDGETS = Object.freeze({
    watcherUnavailableUnchangedSearchP95Ms: 7_000,
    watcherUnavailableChangedSearchMs: 7_000,
    watcherUnavailableProcessTreePeakRssMiB: 1_600,
});

function parseArgs(argv) {
    const result = {};
    for (let index = 0; index < argv.length; index += 1) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith("--") || !value) {
            throw new Error(`Expected --name value arguments; received '${key ?? ""}'.`);
        }
        result[key.slice(2)] = path.resolve(value);
        index += 1;
    }
    for (const required of ["repo", "runtime", "state-root", "output", "satori-root"]) {
        if (!result[required]) throw new Error(`Missing --${required}.`);
    }
    return result;
}

function git(root, args) {
    const result = spawnSync("git", ["-C", root, ...args], {
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
    });
    if (result.status !== 0) {
        throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
    }
    return result.stdout.trim();
}

function percentile(samples, fraction) {
    const sorted = [...samples].sort((left, right) => left - right);
    return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function processTreeRssKiB(rootPid) {
    const result = spawnSync("ps", ["-eo", "pid=,ppid=,rss="], {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
    });
    if (result.status !== 0) return null;
    const rows = result.stdout.trim().split("\n").map((line) => {
        const [pid, ppid, rss] = line.trim().split(/\s+/).map(Number);
        return { pid, ppid, rss };
    }).filter((row) => row.pid && Number.isFinite(row.rss));
    const descendants = new Set([rootPid]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const row of rows) {
            if (!descendants.has(row.pid) && descendants.has(row.ppid)) {
                descendants.add(row.pid);
                changed = true;
            }
        }
    }
    return rows
        .filter((row) => descendants.has(row.pid))
        .reduce((total, row) => total + row.rss, 0);
}

async function timedTool(session, tool, args) {
    const rssSamples = [];
    const sample = () => {
        const rss = processTreeRssKiB(session.child.pid);
        if (rss !== null) rssSamples.push(rss);
    };
    sample();
    const timer = setInterval(sample, 100);
    const startedAt = process.hrtime.bigint();
    try {
        const { result, payload } = await callAndDecode(session, { tool, args });
        sample();
        const text = result.content
            ?.filter((entry) => entry?.type === "text" && typeof entry.text === "string")
            .map((entry) => entry.text)
            .join("") ?? "";
        return {
            wallMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
            responseBytes: Buffer.byteLength(text, "utf8"),
            peakProcessTreeRssKiB: rssSamples.length > 0 ? Math.max(...rssSamples) : null,
            payload,
        };
    } finally {
        clearInterval(timer);
    }
}

async function waitUntilReady(session, repoRoot) {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (true) {
        const { payload } = await callAndDecode(session, {
            tool: "manage_index",
            args: { action: "status", path: repoRoot, detail: "full" },
        });
        if (payload.status === "ok") return payload;
        if (["error", "blocked", "requires_reindex"].includes(payload.status)) {
            throw new Error(
                `Index did not become ready: ${payload.status} (${payload.reason ?? "unknown"}).`,
            );
        }
        if (Date.now() >= deadline) {
            throw new Error(`Index did not become ready within ${READY_TIMEOUT_MS}ms.`);
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
}

async function warmSearchWhenReady(session, repoRoot, args) {
    const first = await timedTool(session, "search_codebase", args);
    if (first.payload?.status !== "not_ready") return first;
    await waitUntilReady(session, repoRoot);
    return timedTool(session, "search_codebase", args);
}

function requireQuietFormat3(sample, label) {
    if (sample.payload?.status !== "ok") {
        throw new Error(`${label} failed: ${JSON.stringify(sample.payload)}`);
    }
    if (sample.payload.formatVersion !== 3) {
        throw new Error(`${label} did not return formatVersion=3.`);
    }
    if (
        Object.hasOwn(sample.payload, "freshnessDecision")
        || Object.hasOwn(sample.payload, "freshnessSummary")
    ) {
        throw new Error(`${label} exposed normal-path freshness internals.`);
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const targetRevision = git(options.repo, ["rev-parse", "HEAD"]);
    if (targetRevision !== TARGET_REVISION) {
        throw new Error(`Expected target revision ${TARGET_REVISION}; found ${targetRevision}.`);
    }
    if (git(options.repo, ["status", "--porcelain"])) {
        throw new Error("Pinned qualification target must start clean.");
    }
    fs.mkdirSync(options["state-root"], { recursive: true });
    fs.mkdirSync(path.dirname(options.output), { recursive: true });

    const potionAssets = path.join(
        options["satori-root"],
        "packages/mcp/assets/potion/linux-x64",
    );
    const session = new JsonRpcStdioSession({
        command: process.execPath,
        commandArgs: [options.runtime],
        cwd: options.repo,
        env: {
            ...process.env,
            HOME: path.join(options["state-root"], "home"),
            XDG_RUNTIME_DIR: path.join(options["state-root"], "runtime"),
            SATORI_STATE_ROOT: path.join(options["state-root"], "state"),
            SATORI_RUNTIME_PROFILE: "offline",
            VECTOR_STORE_PROVIDER: "LanceDB",
            LANCEDB_PATH: path.join(options["state-root"], "lancedb"),
            EMBEDDING_PROVIDER: "Potion",
            EMBEDDING_MODEL: POTION_MODEL,
            EMBEDDING_OUTPUT_DIMENSION: "256",
            POTION_HELPER_PATH: path.join(potionAssets, "satori-potion"),
            POTION_MODEL_PATH: path.join(potionAssets, "model"),
            POTION_REQUEST_TIMEOUT_MS: "5000",
            MCP_ENABLE_WATCHER: "false",
            MCP_WATCH_DEBOUNCE_MS: "5300",
        },
        startupTimeoutMs: 30_000,
        callTimeoutMs: READY_TIMEOUT_MS,
        closeTimeoutMs: 10_000,
    });

    const result = {
        formatVersion: 1,
        benchmarkId: "watcher-unavailable-production-qualification",
        recordedAt: new Date().toISOString(),
        satoriRevision: git(options["satori-root"], ["rev-parse", "HEAD"]),
        target: {
            revision: targetRevision,
            trackedPythonFileCount: Number(
                git(options.repo, ["ls-files", "*.py"]).split("\n").filter(Boolean).length,
            ),
            representativeFile: "src/cli/commands/discover.py",
        },
        runtime: {
            core: "3.4.0",
            mcp: "6.5.0",
            cli: "1.6.0",
            watcher: "disabled",
            ignoredDebounceMs: 5300,
            provider: "Potion",
            model: POTION_MODEL,
            dimension: 256,
            store: "LanceDB",
        },
        budgets: BUDGETS,
    };

    let originalSource;
    const changedFile = path.join(options.repo, "src/cli/commands/discover.py");
    try {
        fs.mkdirSync(path.join(options["state-root"], "home"), { recursive: true });
        fs.mkdirSync(path.join(options["state-root"], "runtime"), {
            recursive: true,
            mode: 0o700,
        });
        await session.start();
        result.serverInfo = session.serverInfo;

        const initialStatus = await timedTool(session, "manage_index", {
            action: "status",
            path: options.repo,
            detail: "full",
        });
        let create = null;
        let ready = initialStatus.payload;
        if (initialStatus.payload?.status === "not_indexed") {
            create = await timedTool(session, "manage_index", {
                action: "create",
                path: options.repo,
            });
            if (["error", "blocked", "requires_reindex"].includes(create.payload?.status)) {
                throw new Error(`Create failed: ${JSON.stringify(create.payload)}`);
            }
            ready = await waitUntilReady(session, options.repo);
        } else if (initialStatus.payload?.status !== "ok") {
            throw new Error(
                `Existing index was not reusable: ${JSON.stringify(initialStatus.payload)}`,
            );
        }
        result.create = {
            reusedExistingIsolatedPublication: create === null,
            wallMs: create?.wallMs ?? null,
            operation: ready.operation,
            publication: ready.publication,
            stats: ready.stats,
        };
        const preparation = await timedTool(session, "manage_index", {
            action: "sync",
            path: options.repo,
        });
        if (preparation.payload?.status !== "ok") {
            await waitUntilReady(session, options.repo);
        }
        result.preparation = {
            status: preparation.payload?.status,
            syncStats: preparation.payload?.syncStats,
        };

        const searchArgs = {
            path: options.repo,
            query: "must:discover discover",
            scope: "runtime",
            resultMode: "grouped",
            groupBy: "symbol",
            rankingMode: "default",
            limit: 10,
        };
        const warmup = await warmSearchWhenReady(session, options.repo, searchArgs);
        requireQuietFormat3(warmup, "Watcher-disabled warm-up search");
        const stable = [];
        for (let index = 0; index < SEARCH_SAMPLES; index += 1) {
            const sample = await timedTool(session, "search_codebase", searchArgs);
            requireQuietFormat3(sample, `Watcher-disabled stable search ${index + 1}`);
            stable.push(sample);
        }
        const stableWallMs = stable.map((sample) => sample.wallMs);

        originalSource = fs.readFileSync(changedFile, "utf8");
        const probeName = "satori_qualification_watcher_disabled_probe";
        fs.appendFileSync(
            changedFile,
            `\n\ndef ${probeName}() -> str:\n    return "${probeName}"\n`,
            "utf8",
        );
        const changed = await timedTool(session, "search_codebase", {
            ...searchArgs,
            query: `must:${probeName} ${probeName}`,
        });
        requireQuietFormat3(changed, "Watcher-disabled changed-file search");
        const changedFound = changed.payload.results?.some(
            (entry) => entry?.target?.file === "src/cli/commands/discover.py",
        );
        if (!changedFound) throw new Error("Changed-file search did not return the probe.");

        fs.writeFileSync(changedFile, originalSource, "utf8");
        originalSource = undefined;
        const restored = await timedTool(session, "manage_index", {
            action: "sync",
            path: options.repo,
        });
        if (restored.payload?.status !== "ok") {
            throw new Error(`Source restoration sync failed: ${JSON.stringify(restored.payload)}`);
        }

        const allSearchRss = [warmup, ...stable, changed]
            .map((sample) => sample.peakProcessTreeRssKiB)
            .filter((value) => value !== null);
        const searchPeakRssMiB = allSearchRss.length > 0
            ? Math.max(...allSearchRss) / 1024
            : null;
        result.freshness = {
            stable: {
                sampleCount: stable.length,
                wallMs: stableWallMs,
                p50Ms: percentile(stableWallMs, 0.5),
                p95Ms: percentile(stableWallMs, 0.95),
            },
            changedFile: {
                wallMs: changed.wallMs,
                resultFound: changedFound,
                syncStats: changed.payload.syncStats,
            },
            processTreePeakRssMiB: searchPeakRssMiB,
            fullSourceComparisonContract: {
                perAttempt: 2,
                maximumAttempts: 2,
                maximumComparisons: 4,
            },
            quietFormat3: true,
        };
        const freshnessPass =
            result.freshness.stable.p95Ms
                <= BUDGETS.watcherUnavailableUnchangedSearchP95Ms
            && result.freshness.changedFile.wallMs
                <= BUDGETS.watcherUnavailableChangedSearchMs
            && result.freshness.processTreePeakRssMiB
                <= BUDGETS.watcherUnavailableProcessTreePeakRssMiB;
        result.outcomes = {
            watcherUnavailablePerformance: freshnessPass ? "pass" : "fail",
        };
        fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
        if (!freshnessPass) throw new Error("Watcher-disabled product budget failed.");
    } finally {
        if (originalSource !== undefined) {
            fs.writeFileSync(changedFile, originalSource, "utf8");
        }
        await session.close().catch(() => undefined);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
});
