import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const authorityRevision = "a7062a2ac6e99bbf39a83aae344e7d8571f04853";
const authorityPlanPath = "docs/plans/SATORI_DEEP_LATEON_RERANKING_AND_PAGINATED_DISCLOSURE_PLAN.md";
const sourcePaths = {
    searchConstants: "packages/mcp/src/core/search-constants.ts",
    searchPolicy: "packages/mcp/src/core/search-policy.ts",
    searchResultSetCache: "packages/mcp/src/core/search-result-set-cache.ts",
    searchDisclosure: "packages/mcp/src/core/search-disclosure.ts",
    searchExactFastPath: "packages/mcp/src/core/search-exact-fast-path.ts",
    searchQuerySupport: "packages/mcp/src/core/search-query-support.ts",
    searchExecution: "packages/mcp/src/core/search-execution.ts",
};

function readRepositoryFile(relativePath) {
    return commandOutput("git", ["show", `${authorityRevision}:${relativePath}`]);
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function commandOutput(command, args) {
    return execFileSync(command, args, {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    }).trim();
}

function readNumericConstant(source, name) {
    const match = source.match(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*([^;]+);`));
    if (!match) {
        throw new Error(`Unable to locate source constant ${name}.`);
    }
    const expression = match[1].trim();
    if (!/^\d+(?:\s*\*\s*\d+)*$/.test(expression)) {
        throw new Error(`Source constant ${name} is not a bounded integer product.`);
    }
    const value = expression.split("*").reduce((product, factor) => product * Number(factor.trim()), 1);
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`Source constant ${name} is not a positive safe integer.`);
    }
    return value;
}

function assertPositiveSafeInteger(value, label) {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${label} must be a positive safe integer.`);
    }
}

export function validateRequestedTotal(value) {
    assertPositiveSafeInteger(value, "requestedTotal");
}

export function validatePaginationBoundMeasurement(measurement) {
    if (
        measurement.requestedTotal?.kind !== "caller_supplied"
        || measurement.requestedTotal?.validation !== "positive_safe_integer"
        || measurement.requestedTotal?.performanceProfileCap !== null
    ) {
        throw new Error("requestedTotal must retain its caller-supplied positive-safe-integer contract.");
    }
    validateRequestedTotal(measurement.requestedTotalSample);
    for (const key of [
        "MAX_FROZEN_RESULTS",
        "normalResponseBytes",
        "debugResponseBytes",
        "semanticPassCount",
        "requiredExactFastPathMaximum",
    ]) {
        assertPositiveSafeInteger(measurement[key], key);
    }
    for (const [key, value] of Object.entries(measurement.supplementDepths ?? {})) {
        assertPositiveSafeInteger(value, `supplementDepths.${key}`);
    }
    if (measurement.currentExactFastPathMaximum !== null) {
        assertPositiveSafeInteger(
            measurement.currentExactFastPathMaximum,
            "currentExactFastPathMaximum",
        );
    }
    if (measurement.requiredExactFastPathMaximum !== measurement.MAX_FROZEN_RESULTS) {
        throw new Error("The required exact-fast-path clamp must equal MAX_FROZEN_RESULTS.");
    }

    const entryBytes = measurement.MAX_RESULT_SET_ENTRY_BYTES;
    const cacheBytes = measurement.MAX_RESULT_SET_CACHE_BYTES;
    const residentSets = measurement.MIN_RESIDENT_RESULT_SETS;
    for (const [key, value] of [
        ["MAX_PAGE_SIZE", measurement.MAX_PAGE_SIZE],
        ["MAX_RESULT_SET_ENTRY_BYTES", entryBytes],
        ["MAX_RESULT_SET_CACHE_BYTES", cacheBytes],
        ["MIN_RESIDENT_RESULT_SETS", residentSets],
    ]) {
        if (value !== null) assertPositiveSafeInteger(value, key);
    }
    if (entryBytes !== null && cacheBytes !== null && entryBytes >= cacheBytes) {
        throw new Error("The per-entry byte budget must be smaller than the global cache byte budget.");
    }
    if (
        entryBytes !== null
        && cacheBytes !== null
        && residentSets !== null
        && entryBytes * residentSets > cacheBytes
    ) {
        throw new Error("The cache cannot retain the frozen minimum resident result sets.");
    }

    if (measurement.terminalDecision !== "pagination_bound_derivation_blocked") {
        throw new Error("This measurement does not prove a non-blocked terminal decision.");
    }
    for (const key of measurement.unsupportedValues ?? []) {
        if (measurement[key] !== null) {
            throw new Error(`${key} must remain null while its derivation is blocked.`);
        }
    }
    if (!Array.isArray(measurement.blockers) || measurement.blockers.length === 0) {
        throw new Error("A blocked measurement must report exact blockers.");
    }
}

export function measurePaginationBounds() {
    const sources = Object.fromEntries(
        Object.entries(sourcePaths).map(([name, relativePath]) => [
            name,
            { relativePath, text: readRepositoryFile(relativePath) },
        ]),
    );
    const searchConstants = sources.searchConstants.text;
    const searchQuerySupport = sources.searchQuerySupport.text;
    const searchExecution = sources.searchExecution.text;
    const exactFastPath = sources.searchExactFastPath.text;

    const sourceConstants = {
        SEARCH_MAX_CANDIDATES: readNumericConstant(searchConstants, "SEARCH_MAX_CANDIDATES"),
        SEARCH_DEFAULT_DISCLOSURE_LIMIT: readNumericConstant(
            searchConstants,
            "SEARCH_DEFAULT_DISCLOSURE_LIMIT",
        ),
        SEARCH_GROUPED_RESPONSE_MAX_UTF8_BYTES: readNumericConstant(
            searchConstants,
            "SEARCH_GROUPED_RESPONSE_MAX_UTF8_BYTES",
        ),
        SEARCH_GROUPED_DEBUG_RESPONSE_MAX_UTF8_BYTES: readNumericConstant(
            searchConstants,
            "SEARCH_GROUPED_DEBUG_RESPONSE_MAX_UTF8_BYTES",
        ),
        SEARCH_TRACKED_LEXICAL_MAX_RESULTS: readNumericConstant(
            searchQuerySupport,
            "SEARCH_TRACKED_LEXICAL_MAX_RESULTS",
        ),
        SEARCH_DIRTY_OVERLAY_MAX_RESULTS: readNumericConstant(
            searchQuerySupport,
            "SEARCH_DIRTY_OVERLAY_MAX_RESULTS",
        ),
        SEARCH_LIVE_PATH_SUPPLEMENT_MAX_RESULTS: readNumericConstant(
            searchQuerySupport,
            "SEARCH_LIVE_PATH_SUPPLEMENT_MAX_RESULTS",
        ),
    };
    const semanticPassIds = ["primary", "expanded"].filter((passId) => (
        new RegExp(`id:\\s*["']${passId}["']`).test(searchExecution)
    ));
    if (semanticPassIds.length !== 2) {
        throw new Error("Unable to establish the bounded primary/expanded semantic pass set.");
    }
    const currentExactFastPathUsesCallerLimit = exactFastPath.includes(
        "resultSymbols = peerSymbols.slice(0, input.limit)",
    );
    if (!currentExactFastPathUsesCallerLimit) {
        throw new Error("Unable to establish the current exact-fast-path limit owner.");
    }

    const supplementDepths = {
        trackedLexicalResults: sourceConstants.SEARCH_TRACKED_LEXICAL_MAX_RESULTS,
        dirtyOverlayResults: sourceConstants.SEARCH_DIRTY_OVERLAY_MAX_RESULTS,
        livePathResults: sourceConstants.SEARCH_LIVE_PATH_SUPPLEMENT_MAX_RESULTS,
    };
    const semanticPassCount = semanticPassIds.length;
    const maxFrozenResults = (
        semanticPassCount * sourceConstants.SEARCH_MAX_CANDIDATES
        + supplementDepths.trackedLexicalResults
        + supplementDepths.dirtyOverlayResults
        + supplementDepths.livePathResults
    );
    const sourceDigests = Object.fromEntries(
        Object.values(sources).map(({ relativePath, text }) => [relativePath, sha256(text)]),
    );
    const fixtureAuthority = {
        kind: "maximum_shape_fixture_authority",
        status: "unavailable",
        maxFrozenResults,
        sourceDigests,
        missingContracts: [
            "bounded_grouped_result_and_envelope_fields",
            "bounded_frozen_set_payload",
            "process_global_live_result_set_sessions",
        ],
    };

    const measurement = {
        schemaVersion: 1,
        terminalDecision: "pagination_bound_derivation_blocked",
        inputIdentity: {
            sourceRevision: authorityRevision,
            sourceTree: commandOutput("git", ["rev-parse", `${authorityRevision}^{tree}`]),
            authorityPlan: {
                relativePath: authorityPlanPath,
                sha256: sha256(readRepositoryFile(authorityPlanPath)),
            },
            nodeVersion: process.version,
            pnpmVersion: commandOutput("pnpm", ["--version"]),
            sourceDigests,
        },
        sourceConstants,
        requestedTotal: {
            kind: "caller_supplied",
            validation: "positive_safe_integer",
            performanceProfileCap: null,
        },
        requestedTotalSample: maxFrozenResults,
        MAX_FROZEN_RESULTS: maxFrozenResults,
        MAX_PAGE_SIZE: null,
        MAX_RESULT_SET_ENTRY_BYTES: null,
        MAX_RESULT_SET_CACHE_BYTES: null,
        MIN_RESIDENT_RESULT_SETS: null,
        normalResponseBytes: sourceConstants.SEARCH_GROUPED_RESPONSE_MAX_UTF8_BYTES,
        debugResponseBytes: sourceConstants.SEARCH_GROUPED_DEBUG_RESPONSE_MAX_UTF8_BYTES,
        defaultInitialPageSize: sourceConstants.SEARCH_DEFAULT_DISCLOSURE_LIMIT,
        semanticPassCount,
        semanticPassIds,
        supplementDepths,
        currentExactFastPathMaximum: null,
        requiredExactFastPathMaximum: maxFrozenResults,
        fixtureDigest: sha256(JSON.stringify(fixtureAuthority)),
        fixtureAuthority,
        formulas: {
            effectiveFrozenTotal: "min(requestedTotal, availableGroupedResults, MAX_FROZEN_RESULTS)",
            MAX_FROZEN_RESULTS: "2 * 80 + 16 + 16 + 8 = 200",
            MAX_PAGE_SIZE: "max n whose canonical maximum-shape normal and debug grouped projections fit their response-byte budgets",
            MAX_RESULT_SET_ENTRY_BYTES: "maximum serialized frozen set bytes + one reserved maximum replay-page bytes",
            MAX_RESULT_SET_CACHE_BYTES: "at least MAX_RESULT_SET_ENTRY_BYTES * MIN_RESIDENT_RESULT_SETS, and strictly greater than one entry",
        },
        exactConsumers: {
            requestedTotalContract: "search_codebase schema and handler",
            MAX_FROZEN_RESULTS: "result-set construction, cursor/offset validation, cache admission, and required exact-registry clamp",
            MAX_PAGE_SIZE: "initial disclosureLimit, continue_search.limit, and page projection",
            MAX_RESULT_SET_ENTRY_BYTES: "one frozen-set admission plus one maximum replay page",
            MAX_RESULT_SET_CACHE_BYTES: "process-global aggregate storage, eviction, and capacity accounting",
            MIN_RESIDENT_RESULT_SETS: "process-global concurrent result-set lifecycle",
            normalResponseBytes: "normal grouped initial and continuation projection",
            debugResponseBytes: "debug grouped initial and continuation projection",
        },
        observations: [
            "The semantic union is bounded by two passes of 80 plus supplements of 16, 16, and 8.",
            "Ten remains the default initial disclosure; it is not evidence for MAX_PAGE_SIZE.",
            "The current exact-registry relationship path slices by input.limit and has no local 200-result clamp.",
            "Disclosure truncates preview content, but stored/query/path/hint payload fields do not have a complete maximum-shape byte contract.",
            "The current cache constructor defaults are implementation settings, not a lifecycle-derived process-global session bound.",
        ],
        unsupportedValues: [
            "MAX_PAGE_SIZE",
            "MAX_RESULT_SET_ENTRY_BYTES",
            "MAX_RESULT_SET_CACHE_BYTES",
            "MIN_RESIDENT_RESULT_SETS",
            "currentExactFastPathMaximum",
        ],
        blockers: [
            {
                values: ["MAX_PAGE_SIZE"],
                reason: "No complete byte cap exists for every non-preview grouped envelope/result field, so a canonical maximum-shape page cannot be serialized reproducibly.",
            },
            {
                values: ["MAX_RESULT_SET_ENTRY_BYTES"],
                reason: "The frozen stored query/path/hint/result payload and reserved replay page do not have a complete maximum serialized shape.",
            },
            {
                values: ["MIN_RESIDENT_RESULT_SETS", "MAX_RESULT_SET_CACHE_BYTES"],
                reason: "No process-global maximum live-session/result-set lifecycle contract exists from which to derive the minimum resident set count and aggregate cache budget.",
            },
            {
                values: ["currentExactFastPathMaximum"],
                reason: "The exact-registry relationship path slices by the caller limit and has no independent frozen-set clamp; 200 remains prospective until that owner is changed.",
            },
        ],
        uncertainties: [
            "A future bounded payload contract may make the page and per-entry measurements finite.",
            "A future process-global concurrency/lifecycle contract is required before aggregate cache capacity can be frozen.",
        ],
    };
    validatePaginationBoundMeasurement(measurement);
    return measurement;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.stdout.write(`${JSON.stringify(measurePaginationBounds(), null, 2)}\n`);
}
