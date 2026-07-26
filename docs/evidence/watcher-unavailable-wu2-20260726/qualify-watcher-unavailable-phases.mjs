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
const READY_TIMEOUT_MS = 20 * 60 * 1000;
const POLL_INTERVAL_MS = 500;
const BUDGETS = Object.freeze({
    watcherUnavailableUnchangedSearchP95Ms: 7_000,
    watcherUnavailableChangedSearchMs: 7_000,
    watcherUnavailableProcessTreePeakRssMiB: 1_600,
});

function parseArgs(argv) {
    const result = {};
    for (let index = 0; index < argv.length; index += 2) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith("--") || !value) {
            throw new Error(`Expected --name value arguments; received '${key ?? ""}'.`);
        }
        result[key.slice(2)] = path.resolve(value);
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

function processTreeSnapshot(rootPid) {
    const result = spawnSync(
        "ps",
        ["-eo", "pid=,ppid=,rss=,comm=,args="],
        { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
    );
    if (result.status !== 0) return null;
    const rows = result.stdout.trim().split("\n").map((line) => {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
        return match
            ? {
                pid: Number(match[1]),
                ppid: Number(match[2]),
                rssKiB: Number(match[3]),
                command: match[4],
                args: match[5],
            }
            : null;
    }).filter(Boolean);
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
    const processes = rows.filter((row) => descendants.has(row.pid));
    return {
        totalRssKiB: processes.reduce((total, row) => total + row.rssKiB, 0),
        processes,
    };
}

async function timedTool(session, tool, args) {
    const samples = [];
    const sample = () => {
        const snapshot = processTreeSnapshot(session.child.pid);
        if (snapshot) samples.push(snapshot);
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
        const peak = samples.reduce(
            (current, candidate) =>
                !current || candidate.totalRssKiB > current.totalRssKiB ? candidate : current,
            null,
        );
        return {
            wallMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
            responseBytes: Buffer.byteLength(text, "utf8"),
            peakProcessTree: peak,
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

function requireSuccessfulSearch(sample, label) {
    if (sample.payload?.status !== "ok" || sample.payload?.formatVersion !== 3) {
        throw new Error(`${label} failed: ${JSON.stringify(sample.payload)}`);
    }
}

function summarizeSearch(sample) {
    const debug = sample.payload?.hints?.debugSearch;
    return {
        wallMs: sample.wallMs,
        responseBytes: sample.responseBytes,
        phaseTimingsMs: debug?.phaseTimingsMs ?? null,
        requestProof: debug?.readiness?.requestProof ?? null,
        peakProcessTree: sample.peakProcessTree,
    };
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
        benchmarkId: "watcher-unavailable-phase-qualification",
        recordedAt: new Date().toISOString(),
        satoriRevision: git(options["satori-root"], ["rev-parse", "HEAD"]),
        targetRevision,
        trackedPythonFileCount: Number(
            git(options.repo, ["ls-files", "*.py"]).split("\n").filter(Boolean).length,
        ),
        budgets: BUDGETS,
    };
    const changedFile = path.join(options.repo, "src/cli/commands/discover.py");
    let originalSource;
    try {
        fs.mkdirSync(path.join(options["state-root"], "home"), { recursive: true });
        fs.mkdirSync(path.join(options["state-root"], "runtime"), {
            recursive: true,
            mode: 0o700,
        });
        await session.start();

        const status = await callAndDecode(session, {
            tool: "manage_index",
            args: { action: "status", path: options.repo, detail: "full" },
        });
        if (status.payload?.status === "not_indexed") {
            await callAndDecode(session, {
                tool: "manage_index",
                args: { action: "create", path: options.repo },
            });
            await waitUntilReady(session, options.repo);
        } else if (status.payload?.status !== "ok") {
            throw new Error(`Index unavailable: ${JSON.stringify(status.payload)}`);
        }
        const preparation = await callAndDecode(session, {
            tool: "manage_index",
            args: { action: "sync", path: options.repo },
        });
        if (preparation.payload?.status !== "ok") {
            await waitUntilReady(session, options.repo);
        }

        const searchArgs = {
            path: options.repo,
            query: "must:discover discover",
            scope: "runtime",
            resultMode: "grouped",
            groupBy: "symbol",
            rankingMode: "default",
            debugMode: "freshness",
            limit: 10,
        };
        const warmup = await timedTool(session, "search_codebase", searchArgs);
        requireSuccessfulSearch(warmup, "warm-up search");
        const stable = [];
        for (let index = 0; index < 5; index += 1) {
            const sample = await timedTool(session, "search_codebase", searchArgs);
            requireSuccessfulSearch(sample, `stable search ${index + 1}`);
            stable.push(sample);
        }

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
        requireSuccessfulSearch(changed, "changed-file search");
        if (!changed.payload.results?.some(
            (entry) => entry?.target?.file === "src/cli/commands/discover.py",
        )) {
            throw new Error("Changed-file search did not return the probe.");
        }

        fs.writeFileSync(changedFile, originalSource, "utf8");
        originalSource = undefined;
        const restored = await callAndDecode(session, {
            tool: "manage_index",
            args: { action: "sync", path: options.repo },
        });
        if (restored.payload?.status !== "ok") {
            throw new Error(`Restoration sync failed: ${JSON.stringify(restored.payload)}`);
        }

        const stableSummaries = stable.map(summarizeSearch);
        const stableWall = stableSummaries.map((sample) => sample.wallMs);
        result.measurements = {
            warmup: summarizeSearch(warmup),
            stable: stableSummaries,
            stableP50Ms: percentile(stableWall, 0.5),
            stableP95Ms: percentile(stableWall, 0.95),
            changed: summarizeSearch(changed),
        };
        fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
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
