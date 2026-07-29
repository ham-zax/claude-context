#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

if (process.env.SATORI_EVAL_PUBLISHED_INDEX !== "1") {
    throw new Error("SATORI_EVAL_PUBLISHED_INDEX=1 is required for the no-sync evaluation runtime.");
}

const sourceRevision = process.env.SATORI_EVAL_SOURCE_REVISION;
if (!/^[0-9a-f]{40}$/i.test(sourceRevision ?? "")) {
    throw new Error(
        "SATORI_EVAL_SOURCE_REVISION must bind the no-sync evaluation runtime to an exact Git commit.",
    );
}

const entryArg = process.argv[2];
if (typeof entryArg !== "string" || entryArg.length === 0) {
    throw new Error("The exact MCP dist entry path is required as the first argument.");
}

const entryPath = path.resolve(entryArg);
const syncModulePath = path.join(path.dirname(entryPath), "core", "sync.js");
const syncModule = await import(pathToFileURL(syncModulePath).href);
const SyncManager = syncModule.SyncManager;
if (typeof SyncManager !== "function" || typeof SyncManager.prototype.ensureFreshness !== "function") {
    throw new Error(`The exact MCP runtime at '${entryPath}' exposes no patchable SyncManager.`);
}

SyncManager.prototype.ensureFreshness = async function noSyncPublishedIndexFreshness(
    _codebasePath,
    thresholdMs = 60_000,
) {
    const checkedAtMs = Date.now();
    return {
        mode: "skipped_recent",
        checkedAt: new Date(checkedAtMs).toISOString(),
        thresholdMs,
    };
};
SyncManager.prototype.getWatcherObservation = function publishedIndexWatcherObservation() {
    return {
        observedEventEpoch: 0,
        comparedThroughEventEpoch: 0,
        latestEpochByReason: {
            source_changed: 0,
            ignore_rules_changed: 0,
            directory_changed: 0,
        },
        coverage: "ready",
        pending: false,
    };
};
SyncManager.prototype.getPreparedReadObservation = function publishedIndexPreparedReadObservation() {
    return {
        available: true,
        observation: {
            freshnessEpoch: 0,
            watcherState: "ready",
            checkpointObservation: `published-index:${sourceRevision.toLowerCase()}`,
        },
    };
};
SyncManager.prototype.getPreparedReadDiagnostics = function publishedIndexPreparedReadDiagnostics() {
    return {
        configured: false,
        managerStarted: false,
        rootRegistered: true,
        watcherActive: false,
        checkpointStatus: "valid",
        evaluationPublishedIndex: true,
        sourceRevision: sourceRevision.toLowerCase(),
    };
};

const routePolicy = process.env.SATORI_EVAL_SEARCH_ROUTE_POLICY;
if (routePolicy !== undefined) {
    const supportedPolicies = new Set([
        "baseline_path_anywhere_v1",
        "semantic_cues_before_heuristic_path_v1",
    ]);
    if (!supportedPolicies.has(routePolicy)) {
        throw new Error(`Unsupported SATORI_EVAL_SEARCH_ROUTE_POLICY '${routePolicy}'.`);
    }
    const planningModulePath = path.join(path.dirname(entryPath), "core", "search-query-planning.js");
    const supportModulePath = path.join(path.dirname(entryPath), "core", "search-query-support.js");
    const planningModule = await import(pathToFileURL(planningModulePath).href);
    const supportModule = await import(pathToFileURL(supportModulePath).href);
    if (
        typeof planningModule.buildSearchQueryPlan !== "function"
        || typeof supportModule.SearchQuerySupport !== "function"
    ) {
        throw new Error(`The exact MCP runtime at '${entryPath}' exposes no patchable search planner.`);
    }
    supportModule.SearchQuerySupport.prototype.buildSearchQueryPlan = function buildEvaluationSearchQueryPlan(
        semanticQuery,
        parsedOperators,
    ) {
        return planningModule.buildSearchQueryPlan(
            semanticQuery,
            this.runtimeFingerprint.schemaVersion.startsWith("hybrid"),
            parsedOperators,
            routePolicy,
        );
    };
}

process.argv = [process.argv[0], entryPath, ...process.argv.slice(3)];
await import(pathToFileURL(entryPath).href);
