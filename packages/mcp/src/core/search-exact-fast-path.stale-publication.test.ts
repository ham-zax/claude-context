import assert from "node:assert/strict";
import test from "node:test";
import type { SymbolRegistry, SymbolRecord } from "@zokizuan/satori-core";
import { runExactRegistryFastPath, type SearchExactFastPathHost, type SearchExactFastPathInput } from "./search-exact-fast-path.js";
import { buildSearchQueryPlan, parseSearchOperators } from "./search-query-planning.js";
import { SearchQuerySupport } from "./search-query-support.js";
import type { CapabilityResolver } from "./capabilities.js";

const testSymbol: SymbolRecord = {
    symbolInstanceId: "sym-1",
    name: "TargetFunction",
    qualifiedName: "TargetFunction",
    parentQualifiedNamePath: [],
    kind: "function",
    file: "src/target.ts",
    label: "function TargetFunction()",
    span: { startLine: 10, endLine: 20 },
    language: "typescript",
    characterOffsets: { start: 100, end: 200 },
};

function buildInput(): SearchExactFastPathInput {
    const parsedOperators = parseSearchOperators("TargetFunction");
    const queryPlan = buildSearchQueryPlan("TargetFunction", true, parsedOperators);
    return {
        absolutePath: "/repo/src/target.ts",
        effectiveRoot: "/repo",
        requestedSubdirectory: null,
        query: "TargetFunction",
        scope: "runtime",
        groupBy: "symbol",
        resultMode: "grouped",
        limit: 5,
        disclosureLimit: 10,
        includeResultIndex: false,
        debugMode: "none",
        rankingMode: "default",
        semanticQuery: "TargetFunction",
        parsedOperators,
        queryPlan,
        freshnessDecision: {
            mode: "served_previous_generation",
            checkedAt: new Date().toISOString(),
            thresholdMs: 0,
        },
        freshnessSummary: {
            syncMode: "served_previous_generation",
            lastSyncAt: null,
            changedFileCount: 1,
            gitDirtyFilesConsidered: true,
            changedFilesBoostApplied: false,
            changedFilesBoostSkippedForLargeChangeSet: false,
        },
        partialIndexSearchWarnings: [],
        phaseTimings: {},
        readiness: {
            proofMode: "warm",
            invalidationReason: "none",
            operations: {
                preparedCacheLookups: 0,
                preparedCacheHits: 0,
                coldReadinessChecks: 0,
                postFreshnessColdChecks: 0,
                warmReceiptRevalidations: 0,
                exactPayloadRecounts: 0,
                registryLoads: 0,
            },
        },
        candidateLimit: 10,
        maxAttempts: 1,
        operatorSummary: { prefixBlockChars: 0, lang: [], path: [], excludePath: [], must: [], exclude: [] },
        filterSummary: {
            removedByRequestedSubdirectory: 0,
            removedByScope: 0,
            removedByLanguage: 0,
            removedByPathInclude: 0,
            removedByPathExclude: 0,
            removedByMust: 0,
            removedByExclude: 0,
        },
        changedFilesState: { available: true, files: new Set(["src/target.ts"]) },
        observedChangedFilesState: { available: true, files: new Set(["src/target.ts"]) },
        changedFilesCount: 1,
        changedFilesBoostSkippedForLargeChangeSet: false,
        dirtyFilesNotFreshened: true,
        rankingProvenance: {
            semanticPassesUsed: [],
            lexicalPassesUsed: [],
            livePathSupplementUsed: false,
            lexicalFileScanUsed: false,
            rerankApplied: false,
            exactMatchPinningApplied: false,
            registryRepairGroupCount: 0,
        },
        previewMaxBytes: 1000,
        navigationAuthority: "valid",
    };
}

test("runExactRegistryFastPath uses publication-only symbols without reading current source during served_previous_generation", async () => {
    const mockRegistry: SymbolRegistry = {
        manifestHash: "man-1",
        manifest: { builtAt: "2026-08-15T00:00:00Z" } as any,
        symbols: [testSymbol],
        symbolsByInstanceId: new Map([["sym-1", testSymbol]]),
        symbolsByName: new Map([["TargetFunction", [testSymbol]]]),
        symbolsByFile: new Map([["src/target.ts", [testSymbol]]]),
        fileIdentifiers: new Map(),
        exactSymbols: new Map([["TargetFunction", [testSymbol]]]),
        fileDigests: new Map(),
    };

    const support = new SearchQuerySupport({
        normalizeSearchPath: (value) => value,
        hasPathSegment: () => false,
        isGeneratedPath: () => false,
        isTestPath: () => false,
        isFixturePath: () => false,
        isDocPath: () => false,
        getContextActiveIgnorePatterns: () => [],
        getContextTrackedRelativePaths: () => [],
        classifyPathCategory: () => "core",
        shouldIncludeCategoryInScope: () => true,
        getSyncWatchDebounceMs: () => 0,
        capabilities: {
            hasReranker: () => false,
            getDefaultRerankEnabled: () => false,
        } as unknown as CapabilityResolver,
        runtimeFingerprint: {} as never,
        reranker: null,
        gitignoreForceReloadEveryN: 1000,
    });

    const host: SearchExactFastPathHost = {
        searchQuerySupport: support,
        measureSearchPhase: async (_phase, run) => run(),
        loadRegistryManifest: async () => ({
            status: "ok",
            registry: mockRegistry,
            manifestHash: "man-1",
        }),
        loadRegistryValidatedCallGraphSidecar: async () => ({ relationshipReady: true }),
        buildRelationshipBackedCallGraph: async () => null,
        buildChangedCodeDebug: async () => undefined,
        buildGeneratedArtifactsVerificationHint: () => undefined,
        getSearchNavigationHelpers: () => ({
            now: () => Date.now(),
            sanitizeIndexedRelativeFilePath: (f: string) => f,
            isCallGraphLanguageSupported: () => false,
            getOutlineStatusForLanguage: () => "valid" as any,
            buildSearchCandidateHierarchy: () => undefined,
            buildSearchCandidateRelationships: () => undefined,
            buildSearchCandidateTestCoverage: () => undefined,
        } as any),
        now: () => Date.now(),
    };

    const outcome = await runExactRegistryFastPath(buildInput(), host);

    assert.equal(outcome.kind, "handled");
    if (outcome.kind === "handled") {
        assert.equal(outcome.finalized.kind, "ok");
        if (outcome.finalized.kind === "ok") {
            const envelope = outcome.finalized.envelope;
            assert.equal(envelope.results.length, 1);
            const group = envelope.results[0]!;
            assert.equal(group.target.file, "src/target.ts");
            assert.equal(group.target.symbolId, "sym-1");
            assert.equal(group.displayLabel, "function TargetFunction()");
            // Stale mode must produce empty preview instead of reading disk
            assert.equal(group.preview, "");
        }
    }
});
