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
const SAMPLE_COUNT = 10;

// Frozen in the M0 plan before this benchmark was executed.
const BUDGETS = Object.freeze({
    coldRequestMs: 4_000,
    repeatedP95Ms: 250,
    pairedAnalysisOverheadP95Ms: 150,
    largeFileRequestMs: 1_000,
    processTreePeakDeltaMiB: 64,
    retainedProcessTreeDeltaMiB: 32,
    responseBytes: 8_192,
    unusedSummaryP95RegressionPercent: 5,
    unusedSummaryP95RegressionMs: 25,
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

function processTreeSnapshot(rootPid) {
    const result = spawnSync("ps", ["-eo", "pid=,ppid=,rss=,args="], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
    });
    if (result.status !== 0) return null;
    const rows = result.stdout.trim().split("\n").map((line) => {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
        return match
            ? {
                pid: Number(match[1]),
                ppid: Number(match[2]),
                rssKiB: Number(match[3]),
                args: match[4],
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

async function settleRss(rootPid) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return processTreeSnapshot(rootPid);
}

async function timedTool(session, tool, args) {
    const before = processTreeSnapshot(session.child.pid);
    const samples = before ? [before] : [];
    const sample = () => {
        const snapshot = processTreeSnapshot(session.child.pid);
        if (snapshot) samples.push(snapshot);
    };
    const timer = setInterval(sample, 25);
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
            text,
            payload,
            beforeRssKiB: before?.totalRssKiB ?? null,
            peakRssKiB: peak?.totalRssKiB ?? null,
            peakProcesses: peak?.processes ?? [],
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
            throw new Error(`Index did not become ready: ${JSON.stringify(payload)}`);
        }
        if (Date.now() >= deadline) {
            throw new Error(`Index did not become ready within ${READY_TIMEOUT_MS}ms.`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
}

async function callOutlineWhenReady(session, args) {
    let lastSample;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const sample = await timedTool(session, "file_outline", args);
        lastSample = sample;
        if (sample.payload?.status !== "not_ready") return sample;
        const sync = await callAndDecode(session, {
            tool: "manage_index",
            args: { action: "sync", path: args.path },
        });
        if (!["ok", "not_ready"].includes(sync.payload?.status)) {
            throw new Error(`Setup sync failed: ${JSON.stringify(sync.payload)}`);
        }
        if (sync.payload?.status === "not_ready") {
            await waitUntilReady(session, args.path);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`file_outline remained not_ready: ${JSON.stringify({
        args,
        payload: lastSample?.payload,
    })}`);
}

function requireOk(sample, label) {
    if (sample.payload?.status !== "ok") {
        throw new Error(`${label} failed: ${JSON.stringify(sample.payload)}`);
    }
}

function normalizeSummaryPayload(payload) {
    const normalized = structuredClone(payload);
    for (const symbol of normalized.outline?.symbols ?? []) {
        if (symbol?.callGraphHint) delete symbol.callGraphHint.validatedAt;
    }
    return normalized;
}

async function resolveSymbol(session, repoRoot, file, name) {
    const sample = await callOutlineWhenReady(session, {
        path: repoRoot,
        file,
        resolveMode: "outline",
        limitSymbols: 500,
    });
    requireOk(sample, `Symbol discovery for ${file}`);
    const symbol = sample.payload.outline?.symbols?.find((entry) => entry?.name === name);
    if (!symbol?.symbolId) {
        throw new Error(`Could not resolve '${name}' in '${file}'.`);
    }
    return {
        file,
        name,
        symbolId: symbol.symbolId,
        qualifiedName: symbol.qualifiedName,
        span: symbol.span,
    };
}

function artifactNames(stateRoot) {
    const result = spawnSync(
        "find",
        [stateRoot, "-type", "f", "-print"],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
    if (result.status !== 0) return [];
    return result.stdout
        .split("\n")
        .filter((entry) => /symbol[-_]analysis|structural[-_]analysis/i.test(entry))
        .map((entry) => path.relative(stateRoot, entry))
        .sort();
}

function analysisArgs(repoRoot, symbol) {
    return {
        path: repoRoot,
        file: symbol.file,
        resolveMode: "exact",
        symbolIdExact: symbol.symbolId,
        detail: "analysis",
    };
}

function summaryArgs(repoRoot, symbol, detail) {
    return {
        path: repoRoot,
        file: symbol.file,
        resolveMode: "exact",
        symbolIdExact: symbol.symbolId,
        ...(detail ? { detail } : {}),
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
    fs.mkdirSync(path.join(options["state-root"], "home"), { recursive: true });
    fs.mkdirSync(path.join(options["state-root"], "runtime"), {
        recursive: true,
        mode: 0o700,
    });

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
            MCP_ENABLE_WATCHER: "true",
        },
        startupTimeoutMs: 30_000,
        callTimeoutMs: READY_TIMEOUT_MS,
        closeTimeoutMs: 10_000,
    });

    const result = {
        schemaVersion: "symbol-analysis-release-a-benchmark-v1",
        recordedAt: new Date().toISOString(),
        satoriRevision: git(options["satori-root"], ["rev-parse", "HEAD"]),
        target: {
            revision: targetRevision,
            trackedPythonFileCount: Number(
                git(options.repo, ["ls-files", "*.py"]).split("\n").filter(Boolean).length,
            ),
        },
        runtime: {
            core: "3.4.0",
            mcp: "6.5.0",
            cli: "1.6.0",
            provider: "Potion",
            model: POTION_MODEL,
            vectorStore: "LanceDB",
            watcher: "enabled",
        },
        budgets: BUDGETS,
    };

    try {
        await session.start();
        result.serverInfo = session.serverInfo;
        const initialStatus = await timedTool(session, "manage_index", {
            action: "status",
            path: options.repo,
            detail: "full",
        });
        let ready = initialStatus.payload;
        if (initialStatus.payload?.status === "not_indexed") {
            const create = await timedTool(session, "manage_index", {
                action: "create",
                path: options.repo,
            });
            if (["error", "blocked", "requires_reindex"].includes(create.payload?.status)) {
                throw new Error(`Create failed: ${JSON.stringify(create.payload)}`);
            }
            ready = await waitUntilReady(session, options.repo);
            result.createWallMs = create.wallMs;
        } else if (initialStatus.payload?.status !== "ok") {
            throw new Error(`Existing index was not reusable: ${JSON.stringify(initialStatus.payload)}`);
        }
        result.publication = ready.publication;
        result.stats = ready.stats;

        const primary = await resolveSymbol(
            session,
            options.repo,
            "src/cli/main.py",
            "cli_entry_point",
        );
        const large = await resolveSymbol(
            session,
            options.repo,
            "src/cli/commands/discover.py",
            "main",
        );
        result.symbols = { primary, large };

        const artifactsBefore = artifactNames(options["state-root"]);
        const statusBeforeSummary = await callAndDecode(session, {
            tool: "manage_index",
            args: { action: "status", path: options.repo, detail: "full" },
        });

        const omittedSummary = await callOutlineWhenReady(
            session,
            summaryArgs(options.repo, primary),
        );
        const explicitSummary = await callOutlineWhenReady(
            session,
            summaryArgs(options.repo, primary, "summary"),
        );
        requireOk(omittedSummary, "Omitted-detail summary");
        requireOk(explicitSummary, "Explicit summary");
        if (
            JSON.stringify(normalizeSummaryPayload(omittedSummary.payload))
            !== JSON.stringify(normalizeSummaryPayload(explicitSummary.payload))
        ) {
            fs.writeFileSync(options.output, `${JSON.stringify({
                schemaVersion: "symbol-analysis-release-a-default-comparison-v1",
                omitted: omittedSummary.payload,
                explicit: explicitSummary.payload,
            }, null, 2)}\n`, "utf8");
            throw new Error("Omitted detail and detail=summary were not byte-identical.");
        }
        if (Object.hasOwn(explicitSummary.payload.outline?.symbols?.[0] ?? {}, "analysis")) {
            throw new Error("Default summary unexpectedly exposed structural analysis.");
        }

        const preAnalysisRetained = await settleRss(session.child.pid);
        const cold = await callOutlineWhenReady(
            session,
            analysisArgs(options.repo, primary),
        );
        requireOk(cold, "Cold structural analysis");
        if (
            cold.payload.outline?.symbols?.[0]?.analysis?.analysisVersion
            !== "python_structural_v1"
        ) {
            throw new Error("Structural analysis returned the wrong model version.");
        }

        const preparation = [];
        for (let index = 0; index < 2; index += 1) {
            const sample = await callOutlineWhenReady(
                session,
                analysisArgs(options.repo, primary),
            );
            requireOk(sample, `Analysis preparation ${index + 1}`);
            preparation.push(sample);
        }

        const repeated = [];
        for (let index = 0; index < SAMPLE_COUNT; index += 1) {
            const sample = await callOutlineWhenReady(
                session,
                analysisArgs(options.repo, primary),
            );
            requireOk(sample, `Repeated analysis ${index + 1}`);
            repeated.push(sample);
        }

        const omittedSummarySamples = [];
        const explicitSummarySamples = [];
        const pairedSummary = [];
        const pairedAnalysis = [];
        for (let index = 0; index < SAMPLE_COUNT; index += 1) {
            const omitted = await callOutlineWhenReady(
                session,
                summaryArgs(options.repo, primary),
            );
            const explicit = await callOutlineWhenReady(
                session,
                summaryArgs(options.repo, primary, "summary"),
            );
            const summary = await callOutlineWhenReady(
                session,
                summaryArgs(options.repo, primary, "summary"),
            );
            const analysis = await callOutlineWhenReady(
                session,
                analysisArgs(options.repo, primary),
            );
            requireOk(omitted, `Omitted summary ${index + 1}`);
            requireOk(explicit, `Explicit summary ${index + 1}`);
            requireOk(summary, `Paired summary ${index + 1}`);
            requireOk(analysis, `Paired analysis ${index + 1}`);
            if (
                JSON.stringify(normalizeSummaryPayload(omitted.payload))
                !== JSON.stringify(normalizeSummaryPayload(explicit.payload))
            ) {
                throw new Error(`Default summary diverged at sample ${index + 1}.`);
            }
            omittedSummarySamples.push(omitted);
            explicitSummarySamples.push(explicit);
            pairedSummary.push(summary);
            pairedAnalysis.push(analysis);
        }

        await callOutlineWhenReady(session, analysisArgs(options.repo, large));
        const largeFile = await callOutlineWhenReady(
            session,
            analysisArgs(options.repo, large),
        );
        requireOk(largeFile, "Large-file structural analysis");

        const postAnalysisRetained = await settleRss(session.child.pid);
        const statusAfterAnalysis = await callAndDecode(session, {
            tool: "manage_index",
            args: { action: "status", path: options.repo, detail: "full" },
        });
        const artifactsAfter = artifactNames(options["state-root"]);

        const repeatedMs = repeated.map((sample) => sample.wallMs);
        const overheadMs = pairedAnalysis.map(
            (sample, index) => Math.max(0, sample.wallMs - pairedSummary[index].wallMs),
        );
        const omittedMs = omittedSummarySamples.map((sample) => sample.wallMs);
        const explicitMs = explicitSummarySamples.map((sample) => sample.wallMs);
        const omittedP95 = percentile(omittedMs, 0.95);
        const explicitP95 = percentile(explicitMs, 0.95);
        const summaryRegressionMs = Math.max(0, explicitP95 - omittedP95);
        const summaryRegressionPercent = omittedP95 === 0
            ? 0
            : (summaryRegressionMs / omittedP95) * 100;

        const summaryPeakDeltaKiB = Math.max(
            ...pairedSummary.map((sample) =>
                Math.max(0, (sample.peakRssKiB ?? 0) - (sample.beforeRssKiB ?? 0))),
        );
        const analysisPeakDeltaKiB = Math.max(
            ...pairedAnalysis.map((sample) =>
                Math.max(0, (sample.peakRssKiB ?? 0) - (sample.beforeRssKiB ?? 0))),
        );
        const analysisPeakOverSummaryMiB = Math.max(
            0,
            analysisPeakDeltaKiB - summaryPeakDeltaKiB,
        ) / 1024;
        const retainedDeltaMiB = Math.max(
            0,
            (postAnalysisRetained?.totalRssKiB ?? 0)
                - (preAnalysisRetained?.totalRssKiB ?? 0),
        ) / 1024;
        const responseBytes = Math.max(
            cold.responseBytes,
            largeFile.responseBytes,
            ...repeated.map((sample) => sample.responseBytes),
        );

        result.measurements = {
            coldRequestMs: cold.wallMs,
            repeated: {
                sampleCount: repeated.length,
                wallMs: repeatedMs,
                p50Ms: percentile(repeatedMs, 0.5),
                p95Ms: percentile(repeatedMs, 0.95),
            },
            pairedAnalysisOverhead: {
                sampleCount: overheadMs.length,
                wallMs: overheadMs,
                p50Ms: percentile(overheadMs, 0.5),
                p95Ms: percentile(overheadMs, 0.95),
            },
            largeFile: {
                bytes: fs.statSync(path.join(options.repo, large.file)).size,
                wallMs: largeFile.wallMs,
            },
            memory: {
                pairedSummaryPeakDeltaMiB: summaryPeakDeltaKiB / 1024,
                pairedAnalysisPeakDeltaMiB: analysisPeakDeltaKiB / 1024,
                analysisPeakOverSummaryMiB,
                preAnalysisRetainedMiB:
                    (preAnalysisRetained?.totalRssKiB ?? 0) / 1024,
                postAnalysisRetainedMiB:
                    (postAnalysisRetained?.totalRssKiB ?? 0) / 1024,
                retainedDeltaMiB,
                peakProcesses: pairedAnalysis
                    .reduce((current, sample) =>
                        (sample.peakRssKiB ?? 0) > (current.peakRssKiB ?? 0)
                            ? sample
                            : current, pairedAnalysis[0])
                    .peakProcesses,
            },
            responseBytes,
            unusedDefaultPath: {
                normalizedByteIdentical: true,
                allowedVolatileField: "outline.symbols[].callGraphHint.validatedAt",
                omittedP95Ms: omittedP95,
                explicitSummaryP95Ms: explicitP95,
                regressionMs: summaryRegressionMs,
                regressionPercent: summaryRegressionPercent,
                analysisFieldAbsent: true,
                artifactsBefore,
                artifactsAfter,
                persistentArtifactsAdded:
                    artifactsAfter.filter((entry) => !artifactsBefore.includes(entry)),
                publicationBefore: statusBeforeSummary.payload?.publication,
                publicationAfter: statusAfterAnalysis.payload?.publication,
                operationBefore: statusBeforeSummary.payload?.operation,
                operationAfter: statusAfterAnalysis.payload?.operation,
            },
        };

        const checks = {
            coldRequest: cold.wallMs <= BUDGETS.coldRequestMs,
            repeatedP95:
                result.measurements.repeated.p95Ms <= BUDGETS.repeatedP95Ms,
            pairedOverheadP95:
                result.measurements.pairedAnalysisOverhead.p95Ms
                    <= BUDGETS.pairedAnalysisOverheadP95Ms,
            largeFile:
                result.measurements.largeFile.wallMs <= BUDGETS.largeFileRequestMs,
            peakMemory:
                analysisPeakOverSummaryMiB <= BUDGETS.processTreePeakDeltaMiB,
            retainedMemory:
                retainedDeltaMiB <= BUDGETS.retainedProcessTreeDeltaMiB,
            responseSize: responseBytes <= BUDGETS.responseBytes,
            defaultBytes:
                result.measurements.unusedDefaultPath.normalizedByteIdentical,
            defaultAnalysisAbsent:
                result.measurements.unusedDefaultPath.analysisFieldAbsent,
            defaultArtifacts:
                result.measurements.unusedDefaultPath.persistentArtifactsAdded.length === 0,
            defaultLatencyAbsolute:
                summaryRegressionMs <= BUDGETS.unusedSummaryP95RegressionMs,
            defaultLatencyRelative:
                summaryRegressionPercent
                    <= BUDGETS.unusedSummaryP95RegressionPercent,
        };
        result.checks = checks;
        result.outcome = Object.values(checks).every(Boolean) ? "pass" : "fail";
        fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
        if (result.outcome !== "pass") {
            throw new Error(`Release A budget failed: ${JSON.stringify(checks)}`);
        }
    } finally {
        await session.close().catch(() => undefined);
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
});
