#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
    validateRankingBenchmarkManifest,
} from "../../scripts/satori-ranking-benchmark-manifest.mjs";

const REVIEWER = "local_source_oracle_review_2026_07_30";
const L0_REVIEWER = "local_source_oracle_review_2026_08_03";
const BUILDER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const L0_SOURCE_REVISION = "ca3671af8b6116b9e63fc68b143a9a97a9485ea7";
const L0_SOURCE_TREE = "b239bfb7c13e1824fa2abf53efcb5ded30779cdd";
const SEARCH = Object.freeze({
    scope: "mixed",
    resultMode: "grouped",
    groupBy: "symbol",
    limit: 15,
    disclosureLimit: 10,
});
const STATISTICAL_CONTRACT = Object.freeze({
    version: 1,
    independentRepositoryFamiliesPerSplit: 3,
    positiveTasksPerRepository: 6,
    negativeTasksPerRepository: 2,
    decisionStratumMinimumTasks: 4,
    decisionStratumMinimumRepositoryFamilies: 2,
    pairedEstimator: "repository_macro_mean_of_paired_task_deltas",
    uncertainty: "deterministic_repository_cluster_percentile_bootstrap",
    clusterBootstrapResamples: 10000,
    bootstrapSeed: "sealed_manifest_sha256",
    multiplicityAdjustedConfidence: {
        deterministic: 0.975,
        neural: 0.975,
    },
    minimumEffects: {
        ownerAt3: 0.05,
        macroReciprocalRank: 0.03,
        lateOn32Over16MacroReciprocalRank: 0.01,
        simplicityTie: 0.01,
    },
    nonInferiorityMargins: {
        ownerAt1: -0.02,
        ownerAt10: -0.01,
        requiredRoleCoverage: -0.01,
        hardNegativeExposureAt3: 0.02,
        unacceptableOwnerExposureAt3: 0.02,
    },
    deterministicPerformance: {
        p95Multiplier: 1.1,
        p95AdditionalMs: 10,
        peakRssMultiplier: 1.05,
    },
    zeroFailureControls: [
        "exact_identifier",
        "must",
        "configuration_pin",
        "candidate_membership",
        "eligibility",
    ],
    contenderSelection: "largest_repository_macro_mrr_then_simpler_within_0.01",
});
const ENTRYPOINT_TUNING_QUERIES = Object.freeze([
    "Find the function that creates and launches the user-facing command line interface.",
    "How does running the qap terminal command enter the application?",
    "Which function is the installed command target?",
    "cli_entry_point",
    "must:cli_entry_point cli_entry_point",
]);

const REPOSITORIES = [
    {
        id: "satori-r0",
        family: "satori",
        split: "tuning",
        sourceRepository: "https://github.com/ham-zax/satori.git",
        checkoutRoot: "/home/hamza/repo/satori",
        revision: "5c1896e6a70b9d31a801e17c207b2a65b44348c5",
        primaryLanguage: "typescript",
    },
    {
        id: "tradingview-r0",
        family: "tradingview_ratio",
        split: "tuning",
        sourceRepository: "https://github.com/ham-zax/tradingview_ratio.git",
        checkoutRoot: "/home/hamza/repo/tradingview_ratio",
        revision: "8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7",
        primaryLanguage: "python",
    },
    {
        id: "shopify-theme-r0",
        family: "noor_and_knot_shopify",
        split: "tuning",
        sourceRepository: "https://github.com/ham-zax/noor-and-knot-shopify.git",
        checkoutRoot: "/home/hamza/repo/noor-and-knot-shopify",
        revision: "34a00887a5904c091c5c049843e383c96ff41f6f",
        primaryLanguage: "javascript",
    },
    {
        id: "promptready-r0",
        family: "promptready",
        split: "held_out",
        sourceRepository: "https://github.com/ham-zax/PromptReady.git",
        checkoutRoot: "/home/hamza/repo/PromptReady",
        revision: "517df1ff06d81fe5d9f772525948de3a1f4af157",
        primaryLanguage: "typescript",
    },
    {
        id: "fastcontext-r0",
        family: "fastcontext",
        split: "held_out",
        sourceRepository: "https://github.com/microsoft/fastcontext.git",
        checkoutRoot: "/home/hamza/repo/fastcontext",
        revision: "788342a5c1f5ffbd9280fdbc813cc6bdb0024db4",
        primaryLanguage: "python",
    },
    {
        id: "recovery-dashboard-r0",
        family: "recovery_dashboard",
        split: "held_out",
        sourceRepository: "https://github.com/ham-zax/recovery_dashboard.git",
        checkoutRoot: "/home/hamza/repo/recovery_dashboard",
        revision: "14dfdaf380aa705205497402c17a382fae650677",
        primaryLanguage: "typescript",
    },
];

function ownerTask(repositoryId, id, queryClass, query, file, symbol, rationale, options = {}) {
    return {
        id,
        repositoryId,
        queryClass,
        query,
        criticality: options.criticality ?? "important",
        ...(options.safetyControls
            ? { safetyControls: [...options.safetyControls] }
            : {}),
        oracle: {
            kind: "owner",
            ...(options.ownerMatch ? { ownerMatch: options.ownerMatch } : {}),
            requiredOwner: { file, symbol },
            acceptableAlternativeOwners: options.acceptableAlternativeOwners ?? [],
            hardNegativeOwners: options.hardNegativeOwners ?? [],
            rationale,
            reviewer: options.reviewer ?? REVIEWER,
            evidence: { file, symbol },
        },
    };
}

function negativeTask(repositoryId, id, query, file, symbol, rationale, options = {}) {
    return {
        id,
        repositoryId,
        queryClass: "negative",
        query,
        criticality: "diagnostic",
        oracle: {
            kind: "negative",
            acceptableAlternativeOwners: [],
            hardNegativeOwners: options.hardNegativeOwners ?? [{ file, symbol }],
            rationale,
            reviewer: options.reviewer ?? REVIEWER,
            evidence: { file, symbol },
        },
    };
}

const TASKS = [
    ownerTask("satori-r0", "satori-entrypoint-evidence", "ownership_implementation",
        "Which function prepares publication-bound installed-command owner evidence?",
        "packages/mcp/src/core/entrypoint-owner-evidence.ts", "prepareEntrypointOwnerEvidence",
        "The function parses the prepared manifest, resolves canonical symbols, and returns the bounded evidence relation."),
    ownerTask("satori-r0", "satori-final-score", "natural_language_behavior",
        "Where is the final local candidate score composed from fusion, lexical, path, changed-file, agent-fit, and owner evidence?",
        "packages/mcp/src/core/search-ranking-policy.ts", "computeSearchCandidateFinalScore",
        "This is the production score-composition owner used by runtime and replay."),
    ownerTask("satori-r0", "satori-group-results", "path_role",
        "Which function groups scored chunks into visible symbol or file results?",
        "packages/mcp/src/core/search-group-results.ts", "buildVisibleGroupedSearchResults",
        "This function owns chunk grouping, representative selection, target construction, ordering, and diversity invocation."),
    ownerTask("satori-r0", "satori-query-plan", "natural_language_behavior",
        "Which function builds the search query plan and route from operators and intent?",
        "packages/mcp/src/core/search-query-planning.ts", "buildSearchQueryPlan",
        "This function returns the normalized production query plan."),
    ownerTask("satori-r0", "satori-disclosure", "configuration",
        "Where is grouped search disclosure bounded by caller, initial, and UTF-8 response budgets?",
        "packages/mcp/src/core/search-disclosure.ts", "projectGroupedDisclosure",
        "This function owns grouped disclosure projection and truncation reasons."),
    ownerTask("satori-r0", "satori-finalization", "ownership_implementation",
        "Which coordinator turns ranked search candidates into the final raw or grouped response?",
        "packages/mcp/src/core/search-result-finalization.ts", "finalizeSearchResults",
        "This coordinator owns final route-specific result construction and diagnostic projection."),
    ownerTask("satori-r0", "satori-entrypoint-intent-test", "tests_fixtures",
        "Which regression test distinguishes installed-command ownership from mock, fixture, development, and runtime-helper startup queries?",
        "packages/mcp/src/core/search-query-support.test.ts",
        "buildSearchQueryPlan distinguishes entrypoint ownership from adjacent CLI intent",
        "The named test contains the mixed-cue positive and negative classifier matrix.",
        { ownerMatch: "file" }),
    ownerTask("satori-r0", "satori-ranking-plan-document", "documentation",
        "Which document defines the cross-repository ranking ablation phases and decision boundaries?",
        "docs/plans/SATORI_CROSS_REPOSITORY_RANKING_ABLATION_PLAN.md",
        "Satori Cross-Repository Ranking Ablation Plan",
        "The pinned plan is the authority for R0-R5 scope, controls, and routing.",
        { ownerMatch: "file" }),
    negativeTask("satori-r0", "satori-negative-payments",
        "Which Satori function charges a customer credit card?",
        "packages/mcp/src/core/search-ranking-policy.ts", "computeSearchCandidateFinalScore",
        "Satori has no payment domain; the scoring function is a reviewed semantically unrelated hard negative."),
    negativeTask("satori-r0", "satori-negative-product-gallery",
        "Which browser component renders a product image gallery?",
        "packages/mcp/src/core/search-group-results.ts", "buildVisibleGroupedSearchResults",
        "Search result grouping is not a browser product-gallery implementation."),

    ownerTask("tradingview-r0", "tradingview-qap-owner", "entrypoint",
        "How does running the qap terminal command enter the application?",
        "src/cli/main.py", "cli_entry_point",
        "The pinned PEP 621 declaration targets this function, which constructs and invokes the Click command.",
        { criticality: "critical" }),
    ownerTask("tradingview-r0", "tradingview-backtest", "natural_language_behavior",
        "Which function runs a complete backtest for a configured pair?",
        "src/python/core/backtest/runner.py", "run_backtest",
        "This function is the source owner of the backtest workflow."),
    ownerTask("tradingview-r0", "tradingview-root-cli", "ownership_implementation",
        "Which function defines the root Typer command and its global options?",
        "src/cli/main.py", "main",
        "The decorated root command owns the application-level CLI options."),
    ownerTask("tradingview-r0", "tradingview-lazy-map", "configuration",
        "Where are lazy CLI subcommand and alias maps assembled from command specifications?",
        "src/cli/main.py", "_build_lazy_maps",
        "This helper derives the three lazy-loading maps from the frozen command specifications."),
    ownerTask("tradingview-r0", "tradingview-engine-intent", "configuration",
        "Which function loads the engine intent policy used by the backtest runner?",
        "src/python/core/backtest/runner.py", "_load_engine_intent_policy",
        "This function owns the runner's policy-file loading boundary."),
    ownerTask("tradingview-r0", "tradingview-cointegration-exact", "exact_identifier",
        "check_cointegration",
        "src/python/core/backtest/runner.py", "check_cointegration",
        "The exact identifier resolves to this pinned function.",
        { criticality: "critical" }),
    negativeTask("tradingview-r0", "tradingview-negative-react-routes",
        "Which React component declares the browser route table?",
        "src/cli/main.py", "main",
        "This Python CLI command is a reviewed hard negative for a nonexistent React route owner."),
    negativeTask("tradingview-r0", "tradingview-negative-cart-drawer",
        "Which Shopify component updates the cart drawer after an item is added?",
        "src/cli/main.py", "cli_entry_point",
        "The installed Python command owner is unrelated to Shopify cart rendering."),

    ownerTask("shopify-theme-r0", "shopify-cart-items", "natural_language_behavior",
        "Which component updates cart item quantities and removes cart lines?",
        "assets/cart.js", "CartItems",
        "The custom element owns cart-line updates and section refresh behavior."),
    ownerTask("shopify-theme-r0", "shopify-predictive-search", "natural_language_behavior",
        "Which component fetches and renders predictive search results?",
        "assets/predictive-search.js", "PredictiveSearch",
        "This custom element owns predictive-search requests, caching, and rendering."),
    ownerTask("shopify-theme-r0", "shopify-facets", "ownership_implementation",
        "Which component applies collection facet filters and updates the product grid?",
        "assets/facets.js", "FacetFiltersForm",
        "This custom element coordinates filter history and section rendering."),
    ownerTask("shopify-theme-r0", "shopify-focus-trap", "natural_language_behavior",
        "Which function traps keyboard focus inside an open modal or drawer?",
        "assets/global.js", "trapFocus",
        "The function installs the focus-in, focus-out, and keydown handlers."),
    ownerTask("shopify-theme-r0", "shopify-publish-event", "callers_references",
        "Which function broadcasts a named theme event to all subscribers?",
        "assets/pubsub.js", "publish",
        "The function invokes every callback registered for the event name."),
    ownerTask("shopify-theme-r0", "shopify-recommendations", "natural_language_behavior",
        "Which component lazily fetches product recommendations when visible?",
        "assets/global.js", "ProductRecommendations",
        "The custom element observes visibility and loads recommendation markup."),
    negativeTask("shopify-theme-r0", "shopify-negative-backtest",
        "Which Python function executes a statistical backtest?",
        "assets/cart.js", "CartItems",
        "The JavaScript cart element is a reviewed hard negative for an absent Python backtest."),
    negativeTask("shopify-theme-r0", "shopify-negative-token-refresh",
        "Where is an OAuth access token refreshed on the server?",
        "assets/predictive-search.js", "PredictiveSearch",
        "Client-side predictive search is unrelated to server token refresh."),

    ownerTask("promptready-r0", "promptready-primary-action", "natural_language_behavior",
        "Which function records the primary CTA and opens the configured Chrome store URL?",
        "src/App.tsx", "handlePrimaryAction",
        "The nested handler records analytics and opens the environment-owned destination."),
    ownerTask("promptready-r0", "promptready-route-table", "configuration",
        "Which component declares the landing-page route table and page-view transition wrapper?",
        "src/router/LandingFlowRouter.tsx", "AnimatedRoutes",
        "This component owns route declarations and transition/page-view behavior."),
    ownerTask("promptready-r0", "promptready-canonical-url", "natural_language_behavior",
        "Which function creates a canonical production URL from a pathname?",
        "src/utils/canonicalUrl.ts", "getCanonicalUrl",
        "This utility normalizes the path against the production domain."),
    ownerTask("promptready-r0", "promptready-seo-hook", "ownership_implementation",
        "Which hook derives canonical, social, and robots metadata for the current page?",
        "src/hooks/useSEO.ts", "useSEO",
        "The hook composes SEO values from route and deployment context."),
    ownerTask("promptready-r0", "promptready-analytics", "callers_references",
        "Which function sends a named analytics event with an optional payload?",
        "src/hooks/useAnalytics.ts", "trackEvent",
        "This is the shared analytics event boundary used by feature-specific helpers."),
    ownerTask("promptready-r0", "promptready-hero-actions", "ownership_implementation",
        "Which component chooses the hero CTA variant and tracks primary and demo actions?",
        "src/components/Hero/HeroActions.tsx", "HeroActions",
        "This component owns CTA feature-flag text and interaction callbacks."),
    negativeTask("promptready-r0", "promptready-negative-migration",
        "Which function applies database schema migrations?",
        "src/router/LandingFlowRouter.tsx", "AnimatedRoutes",
        "The browser route component is a reviewed hard negative for an absent database migration owner."),
    negativeTask("promptready-r0", "promptready-negative-cli-install",
        "Which Python console-script function installs the application command?",
        "src/App.tsx", "handlePrimaryAction",
        "The browser CTA handler is unrelated to Python packaging and console scripts."),

    ownerTask("fastcontext-r0", "fastcontext-ripgrep", "development_script",
        "Which function builds and executes the ripgrep subprocess command?",
        "src/fastcontext/agent/tool/grep.py", "run_rg",
        "This function owns rg argument construction, execution, and output/error handling."),
    ownerTask("fastcontext-r0", "fastcontext-system-prompt", "configuration",
        "Which function loads a system prompt template and renders built-in arguments?",
        "src/fastcontext/agent/utils.py", "_load_system_prompt",
        "This helper owns prompt-file loading and template rendering."),
    ownerTask("fastcontext-r0", "fastcontext-final-answer", "natural_language_behavior",
        "Which function extracts the final answer section from an agent response?",
        "src/fastcontext/agent/utils.py", "get_final_answer",
        "This function owns final-answer extraction."),
    ownerTask("fastcontext-r0", "fastcontext-file-score", "natural_language_behavior",
        "Which public function scores predicted citation files against edited files?",
        "benchmark/evaluation/utils.py", "calculate_score_file",
        "This evaluator computes file-level citation precision, recall, and exploration score."),
    ownerTask("fastcontext-r0", "fastcontext-line-score", "natural_language_behavior",
        "Which function scores whether predicted citation line ranges overlap edits?",
        "benchmark/evaluation/utils.py", "calculate_score_line",
        "This evaluator owns line-range overlap scoring."),
    ownerTask("fastcontext-r0", "fastcontext-container-setup", "development_script",
        "Which function installs and configures FastContext inside a benchmark container?",
        "benchmark/evaluation/bench_mini_swe_agent.py", "setup_fastcontext_in_container",
        "This function owns container-side benchmark setup."),
    negativeTask("fastcontext-r0", "fastcontext-negative-react-route",
        "Which React component defines the browser route table?",
        "src/fastcontext/agent/tool/grep.py", "run_rg",
        "The Python rg executor is a reviewed hard negative for an absent React router."),
    negativeTask("fastcontext-r0", "fastcontext-negative-sql-transaction",
        "Which function commits a customer payment SQL transaction?",
        "benchmark/evaluation/utils.py", "calculate_score_file",
        "The citation evaluator is unrelated to payments or SQL transaction ownership."),

    ownerTask("recovery-dashboard-r0", "recovery-dashboard-api", "ownership_implementation",
        "Which route handler serves dashboard data for the requested day range?",
        "src/app/api/dashboard/route.ts", "GET",
        "This Next.js route validates the range and delegates dashboard data retrieval."),
    ownerTask("recovery-dashboard-r0", "recovery-weekly-review", "natural_language_behavior",
        "Which function assembles the weekly recovery review response?",
        "src/lib/reviewData.ts", "getWeeklyReviewData",
        "This function owns the weekly review query and response assembly."),
    ownerTask("recovery-dashboard-r0", "recovery-day-normalization", "natural_language_behavior",
        "Which function normalizes a date to the start of its UTC day?",
        "src/lib/validation.ts", "startOfDayUtc",
        "This utility constructs the UTC midnight boundary."),
    ownerTask("recovery-dashboard-r0", "recovery-protocol-update", "ownership_implementation",
        "Which function closes the active protocol and creates its replacement transactionally?",
        "src/lib/protocol.ts", "updateActiveProtocol",
        "This function owns the protocol transition transaction and audit relation."),
    ownerTask("recovery-dashboard-r0", "recovery-protocol-lock", "natural_language_behavior",
        "Which function determines whether protocol edits are locked?",
        "src/lib/lock.ts", "isProtocolLocked",
        "This function queries the lock condition used by protocol update callers."),
    ownerTask("recovery-dashboard-r0", "recovery-checkin-form", "ownership_implementation",
        "Which component owns the daily check-in fields and submission request?",
        "src/components/CheckInForm.tsx", "CheckInForm",
        "This component owns form state, validation conversion, and API submission."),
    negativeTask("recovery-dashboard-r0", "recovery-negative-compiler",
        "Which function parses and type-checks a Rust source file?",
        "src/lib/validation.ts", "startOfDayUtc",
        "The date utility is a reviewed hard negative for an absent compiler frontend."),
    negativeTask("recovery-dashboard-r0", "recovery-negative-cli-entry",
        "Which installed terminal command starts this application?",
        "src/app/api/dashboard/route.ts", "GET",
        "The HTTP route is not an installed terminal-command owner."),
];

const V3_REPOSITORIES = [
    {
        id: "gitnexus-r0", family: "gitnexus", split: "tuning",
        sourceRepository: "https://github.com/abhigyanpatwari/GitNexus.git",
        checkoutRoot: "/home/hamza/repo/GitNexus",
        revision: "6c18ae08f7480be5120602908aa19b4ce38e18dc",
        primaryLanguage: "typescript", requireHead: true,
    },
    {
        id: "bookmark-ai-organizer-r0", family: "bookmark_ai_organizer", split: "tuning",
        sourceRepository: "https://github.com/Edmon02/bookmark-ai-organizer.git",
        checkoutRoot: "/home/hamza/repo/bookmark-ai-organizer",
        revision: "da961257cbbb3d7b50bc3e375a8e2ed4759a93bc",
        primaryLanguage: "typescript", requireHead: true,
    },
    {
        id: "duas-r0", family: "duas", split: "tuning",
        sourceRepository: "https://github.com/ham-zax/duas.git",
        checkoutRoot: "/home/hamza/repo/duas",
        revision: "673df7ac7aa8fc28dc10aebaf76f14aac234a470",
        primaryLanguage: "typescript", requireHead: true,
    },
    {
        id: "vox-infinity-r0", family: "vox_infinity", split: "tuning",
        sourceRepository: "https://github.com/ham-zax/VoxInfinity.git",
        checkoutRoot: "/home/hamza/repo/free_voice_gen",
        revision: "1cb93c66dd28bb4ccca4e1ec510df4b08d392838",
        primaryLanguage: "javascript", requireHead: true,
    },
    {
        id: "rpc-r0", family: "rpc_learner_engine", split: "tuning",
        sourceRepository: "https://github.com/ham-zax/rpc.git",
        checkoutRoot: "/home/hamza/repo/rpc",
        revision: "5a1e5bbf395a2bb815dc7a12ce8266604a7fa644",
        primaryLanguage: "typescript", requireHead: true,
    },
    {
        id: "edge-tts-app-r0", family: "edge_tts_app", split: "tuning",
        sourceRepository: "https://github.com/ham-zax/edge-tts-app.git",
        checkoutRoot: "/home/hamza/repo/edge-tts-app",
        revision: "48dadeec920a7e3f229169405fe8818ca6cf91b5",
        primaryLanguage: "python", requireHead: true,
    },
    ...REPOSITORIES.filter(({ split }) => split === "held_out").map((repository) => ({
        ...repository,
        requireHead: true,
    })),
    {
        id: "ai-studio-prompt-library-r0", family: "ai_studio_prompt_library", split: "held_out",
        sourceRepository: "https://github.com/ham-zax/ai-studio-prompt-library.git",
        checkoutRoot: "/home/hamza/repo/ai-studio-prompt-library",
        revision: "3b2f996d047c76e9b27e7b0932ac93fb93058bb5",
        primaryLanguage: "typescript", requireHead: true,
    },
    {
        id: "portfolio-r0", family: "portfolio", split: "held_out",
        sourceRepository: "https://github.com/ham-zax/portfolio.git",
        checkoutRoot: "/home/hamza/repo/portfolio",
        revision: "14f37d4cc651227578dc685bae8c47cb16fb05ac",
        primaryLanguage: "typescript", requireHead: true,
    },
    {
        id: "supply-chain-api-r0", family: "supply_chain_api", split: "held_out",
        sourceRepository: "https://github.com/ham-zax/Supply_Chain_API.git",
        checkoutRoot: "/home/hamza/repo/Supply_Chain_API",
        revision: "77484710f91dbae2f56d779c4d5a7dec1e705c8c",
        primaryLanguage: "python", requireHead: true,
    },
];

const V3_NEW_TASKS = [
    ownerTask("gitnexus-r0", "gitnexus-analyze-command", "entrypoint",
        "Which command analyzes a repository and builds its GitNexus knowledge graph?",
        "gitnexus/src/cli/analyze.ts", "analyzeCommand",
        "This command owns the end-to-end repository analysis workflow."),
    ownerTask("gitnexus-r0", "gitnexus-heritage", "natural_language_behavior",
        "Which ingestion function records class inheritance and interface implementation relationships?",
        "gitnexus/src/core/ingestion/heritage-processor.ts", "processHeritage",
        "This function owns heritage relationship extraction for parsed files."),
    ownerTask("gitnexus-r0", "gitnexus-processes", "natural_language_behavior",
        "Which function detects execution processes from repository graph memberships?",
        "gitnexus/src/core/ingestion/process-processor.ts", "processProcesses",
        "This function owns process detection during ingestion."),
    ownerTask("gitnexus-r0", "gitnexus-walk-repository", "development_script",
        "Which function walks repository paths while applying ignore and language filters?",
        "gitnexus/src/core/ingestion/filesystem-walker.ts", "walkRepositoryPaths",
        "This function owns repository filesystem discovery."),
    ownerTask("gitnexus-r0", "gitnexus-process-calls", "callers_references",
        "Which function resolves call relationships during GitNexus ingestion?",
        "gitnexus/src/core/ingestion/call-processor.ts", "processCalls",
        "This function owns call-edge processing for parsed sources."),
    ownerTask("gitnexus-r0", "gitnexus-create-graph", "ownership_implementation",
        "Which factory creates a new GitNexus knowledge graph?",
        "gitnexus/src/core/graph/graph.ts", "createKnowledgeGraph",
        "This factory owns knowledge-graph construction."),
    negativeTask("gitnexus-r0", "gitnexus-negative-sql-migration",
        "Which function applies a relational database schema migration?",
        "gitnexus/src/core/ingestion/community-processor.ts", "processCommunities",
        "Community analysis and repository metadata are reviewed hard negatives for an absent SQL migration.",
        { hardNegativeOwners: [
            { file: "gitnexus/src/core/ingestion/community-processor.ts", symbol: "processCommunities" },
            { file: "gitnexus/src/storage/repo-manager.ts", symbol: "saveMeta" },
        ] }),
    negativeTask("gitnexus-r0", "gitnexus-negative-oauth-refresh",
        "Which function refreshes an OAuth access token?",
        "gitnexus/src/core/ingestion/filesystem-walker.ts", "readFileContents",
        "Filesystem reading and storage-path selection are reviewed hard negatives for absent OAuth refresh.",
        { hardNegativeOwners: [
            { file: "gitnexus/src/core/ingestion/filesystem-walker.ts", symbol: "readFileContents" },
            { file: "gitnexus/src/storage/repo-manager.ts", symbol: "getStoragePath" },
        ] }),

    ownerTask("bookmark-ai-organizer-r0", "bookmark-route-message", "ownership_implementation",
        "Which function routes extension messages to bookmark and classification operations?",
        "src/background/service-worker.ts", "routeMessage",
        "This function owns background message dispatch."),
    ownerTask("bookmark-ai-organizer-r0", "bookmark-create", "natural_language_behavior",
        "Which function creates a bookmark under a normalized folder path?",
        "src/utils/bookmark-manager.ts", "createBookmark",
        "This method owns folder resolution and bookmark creation."),
    ownerTask("bookmark-ai-organizer-r0", "bookmark-classify-url", "natural_language_behavior",
        "Which function classifies a URL together with page metadata using the configured language model?",
        "src/utils/llm-classifier.ts", "classifyUrlWithMeta",
        "This function owns metadata-aware URL classification."),
    ownerTask("bookmark-ai-organizer-r0", "bookmark-openrouter-models", "natural_language_behavior",
        "Which function fetches the available OpenRouter models?",
        "src/utils/openrouter.ts", "fetchOpenRouterModels",
        "This function owns the OpenRouter model-list request."),
    ownerTask("bookmark-ai-organizer-r0", "bookmark-popup-classify", "ownership_implementation",
        "Which popup function classifies the current page before saving its bookmark?",
        "src/popup/popup.ts", "classifyBookmark",
        "This function owns the popup classification interaction."),
    ownerTask("bookmark-ai-organizer-r0", "bookmark-store-api-key", "configuration",
        "Which function stores and migrates the extension API key?",
        "src/utils/security.ts", "storeApiKey",
        "This method owns API-key persistence."),
    negativeTask("bookmark-ai-organizer-r0", "bookmark-negative-csv-export",
        "Which function exports all bookmarks as a CSV file?",
        "src/utils/bookmark-manager.ts", "createBookmark",
        "Bookmark creation is a reviewed nearby owner for an absent CSV exporter."),
    negativeTask("bookmark-ai-organizer-r0", "bookmark-negative-jwt-decrypt",
        "Which function decrypts and verifies a JSON Web Token?",
        "src/utils/security.ts", "storeApiKey",
        "API-key storage is a reviewed nearby owner for absent JWT decryption."),

    ownerTask("duas-r0", "duas-reader-items", "natural_language_behavior",
        "Which selector builds reader items for the chosen source and path?",
        "src/domain/selectors.ts", "getReaderItems",
        "This selector owns reader-list materialization."),
    ownerTask("duas-r0", "duas-sync-write", "ownership_implementation",
        "Which function resolves an incoming user-state write against the remote snapshot?",
        "src/cloudflare/sync.ts", "resolveSyncWrite",
        "This function owns synchronization conflict resolution."),
    ownerTask("duas-r0", "duas-login-post", "entrypoint",
        "Which Cloudflare request handler processes login POST requests?",
        "functions/api/login.ts", "onRequestPost",
        "This exported handler owns the login request boundary."),
    ownerTask("duas-r0", "duas-reader-path", "path_role",
        "Which function constructs a reader route from source and identifier inputs?",
        "src/app/routes.ts", "buildReaderPath",
        "This function owns reader URL construction."),
    ownerTask("duas-r0", "duas-builtin-paths", "configuration",
        "Where are the built-in dua reading paths declared?",
        "src/domain/paths.ts", "builtinPaths",
        "This declaration owns the built-in path catalog."),
    ownerTask("duas-r0", "duas-reader-flow-test", "tests_fixtures",
        "Which test proves reader lists work for topic-list and my-dua-list sources?",
        "src/app/flow.test.ts", "builds reader lists for topic-list and my-dua-list sources",
        "The named test owns the cross-source reader-flow regression.",
        { ownerMatch: "file" }),
    negativeTask("duas-r0", "duas-negative-python-backtest",
        "Which Python function runs a statistical trading backtest?",
        "src/domain/selectors.ts", "getReaderItems",
        "The TypeScript reader selector is a reviewed hard negative for an absent Python backtest."),
    negativeTask("duas-r0", "duas-negative-oauth-migration",
        "Which SQL migration creates an OAuth token table?",
        "src/cloudflare/sync.ts", "resolveSyncWrite",
        "User-state synchronization is a reviewed hard negative for an absent OAuth SQL migration."),

    ownerTask("vox-infinity-r0", "vox-split-text", "natural_language_behavior",
        "Which userscript function splits long text into generation chunks?",
        "scripts/vox-infinity-direct-api.user.js", "splitLongText",
        "This function owns long-form text chunking."),
    ownerTask("vox-infinity-r0", "vox-build-payload", "natural_language_behavior",
        "Which function builds the direct speech-generation request payload?",
        "scripts/vox-infinity-direct-api.user.js", "buildPayload",
        "This function owns direct API payload construction."),
    ownerTask("vox-infinity-r0", "vox-create-speech", "natural_language_behavior",
        "Which function sends one direct speech-generation request and creates its audio clip?",
        "scripts/vox-infinity-direct-api.user.js", "directCreateSpeech",
        "This function owns one direct speech request."),
    ownerTask("vox-infinity-r0", "vox-generation-queue", "ownership_implementation",
        "Which function admits queued chunks up to the configured generation concurrency?",
        "scripts/vox-infinity-direct-api.user.js", "pumpGenerationQueue",
        "This function owns direct generation queue admission."),
    ownerTask("vox-infinity-r0", "vox-boot", "entrypoint",
        "Which userscript function boots the Vox Infinity controls?",
        "scripts/vox-infinity-direct-api.user.js", "boot",
        "This function owns userscript initialization."),
    ownerTask("vox-infinity-r0", "vox-configure-patch", "development_script",
        "Which Python function patches target values into a userscript template?",
        "configure.py", "patch",
        "This function owns deterministic configuration patching."),
    negativeTask("vox-infinity-r0", "vox-negative-oauth-refresh",
        "Which function refreshes an OAuth access token?",
        "scripts/vox-infinity-direct-api.user.js", "directCreateSpeech",
        "Direct speech generation is a reviewed hard negative for absent OAuth refresh."),
    negativeTask("vox-infinity-r0", "vox-negative-relational-insert",
        "Which function inserts a row in a relational database transaction?",
        "configure.py", "patch",
        "The configuration patcher is a reviewed hard negative for absent relational persistence."),

    ownerTask("rpc-r0", "rpc-choose-next-task", "natural_language_behavior",
        "Which function chooses the learner's next adaptive task?",
        "pi-cog-engine/extensions/cog-engine/adapt.ts", "chooseNextTask",
        "This function owns adaptive next-task selection."),
    ownerTask("rpc-r0", "rpc-grade-attempt", "natural_language_behavior",
        "Which function grades a learner attempt against task rubric checks?",
        "pi-cog-engine/extensions/cog-engine/grader.ts", "gradeAttempt",
        "This function owns deterministic attempt grading."),
    ownerTask("rpc-r0", "rpc-rebuild-recall", "ownership_implementation",
        "Which function rebuilds the due recall queue from learner state?",
        "pi-cog-engine/extensions/cog-engine/athar.ts", "rebuildDueRecallQueue",
        "This function owns due-recall queue reconstruction."),
    ownerTask("rpc-r0", "rpc-format-term", "natural_language_behavior",
        "Which function formats a learner term for display?",
        "pi-cog-engine/extensions/cog-engine/terms.ts", "formatTerm",
        "This function owns term display formatting."),
    ownerTask("rpc-r0", "rpc-strictness-config", "exact_identifier",
        "must:MODE_STRICTNESS_CONFIG MODE_STRICTNESS_CONFIG",
        "pi-cog-engine/extensions/cog-engine/config.ts", "MODE_STRICTNESS_CONFIG",
        "This declaration owns mode strictness parameters."),
    ownerTask("rpc-r0", "rpc-extension-entry", "entrypoint",
        "Which function registers the cognitive learner engine extension?",
        "pi-cog-engine/extensions/cog-engine/index.ts", "cogEngineExtension",
        "This function owns extension registration."),
    ownerTask("rpc-r0", "rpc-strictness-safety-control", "configuration",
        "must:MODE_STRICTNESS_CONFIG MODE_STRICTNESS_CONFIG",
        "pi-cog-engine/extensions/cog-engine/config.ts", "MODE_STRICTNESS_CONFIG",
        "The existing reviewed strictness declaration provides an additive must/configuration control.",
        { safetyControls: ["must", "configuration_pin"] }),
    negativeTask("rpc-r0", "rpc-negative-email-digest",
        "Which function emails a daily learner progress digest?",
        "pi-cog-engine/extensions/cog-engine/terms.ts", "formatTerm",
        "Term formatting is a reviewed hard negative for an absent email digest."),
    negativeTask("rpc-r0", "rpc-negative-db-migration",
        "Which function applies the learner database schema migration?",
        "pi-cog-engine/extensions/cog-engine/config.ts", "MODE_STRICTNESS_CONFIG",
        "Strictness configuration is a reviewed hard negative for an absent database migration."),

    ownerTask("edge-tts-app-r0", "edge-voice-options", "exact_identifier",
        "get_voice_options",
        "tts_core.py", "get_voice_options",
        "This function owns voice-option enumeration."),
    ownerTask("edge-tts-app-r0", "edge-generate-audio", "natural_language_behavior",
        "Which function generates audio for text and a selected voice?",
        "tts_core.py", "generate_audio",
        "This function owns text-to-speech audio generation."),
    ownerTask("edge-tts-app-r0", "edge-start-server", "entrypoint",
        "Which method starts the local HTTP server for the desktop UI?",
        "ui.py", "start_server",
        "This method owns local server startup."),
    ownerTask("edge-tts-app-r0", "edge-http-get", "ownership_implementation",
        "Which request-handler method serves HTTP GET requests?",
        "ui.py", "do_GET",
        "This method owns GET request handling."),
    ownerTask("edge-tts-app-r0", "edge-http-post", "ownership_implementation",
        "Which request-handler method processes text-to-speech POST actions?",
        "ui.py", "do_POST",
        "This method owns POST request handling."),
    ownerTask("edge-tts-app-r0", "edge-player-stop", "natural_language_behavior",
        "Which player method stops current audio playback?",
        "player.py", "stop",
        "This method owns playback termination."),
    ownerTask("edge-tts-app-r0", "edge-voice-options-safety-control", "exact_identifier",
        "get_voice_options",
        "tts_core.py", "get_voice_options",
        "The existing reviewed voice-option owner provides an additive exact-identifier control.",
        { safetyControls: ["exact_identifier"] }),
    negativeTask("edge-tts-app-r0", "edge-negative-sql-migration",
        "Which function applies a SQL database migration?",
        "tts_core.py", "generate_audio",
        "Audio generation is a reviewed hard negative for absent SQL migrations."),
    negativeTask("edge-tts-app-r0", "edge-negative-browser-routes",
        "Which function declares a browser application's route table?",
        "ui.py", "do_GET",
        "The local HTTP GET handler is a reviewed hard negative for an absent browser router."),

    ownerTask("ai-studio-prompt-library-r0", "prompt-library-state", "natural_language_behavior",
        "Which function reads the prompt library state from extension storage?",
        "extension/src/shared/storage.ts", "getState",
        "This function owns stored-state retrieval."),
    ownerTask("ai-studio-prompt-library-r0", "prompt-library-import", "natural_language_behavior",
        "Which function validates and imports a JSON prompt library?",
        "extension/src/shared/storage.ts", "importJson",
        "This function owns JSON import and replacement safeguards."),
    ownerTask("ai-studio-prompt-library-r0", "prompt-library-textarea", "natural_language_behavior",
        "Which function finds the target system-prompt textarea?",
        "extension/src/content/index.ts", "findSystemTextarea",
        "This function owns target textarea discovery."),
    ownerTask("ai-studio-prompt-library-r0", "prompt-library-insert", "ownership_implementation",
        "Which function applies replace, append, or prepend prompt insertion?",
        "extension/src/content/index.ts", "applyInsert",
        "This function owns text insertion behavior."),
    ownerTask("ai-studio-prompt-library-r0", "prompt-library-context-menus", "ownership_implementation",
        "Which function rebuilds browser context menus from stored prompts?",
        "extension/src/background/index.ts", "rebuildContextMenus",
        "This function owns context-menu reconstruction."),
    ownerTask("ai-studio-prompt-library-r0", "prompt-library-popup-insert", "ownership_implementation",
        "Which popup function sends a selected prompt for insertion?",
        "extension/src/popup/main.ts", "sendInsert",
        "This function owns the popup insertion message."),
    ownerTask("ai-studio-prompt-library-r0", "prompt-library-state-exact-control", "exact_identifier",
        "getState",
        "extension/src/shared/storage.ts", "getState",
        "The existing reviewed state-retrieval oracle provides a metadata-only exact-identifier control.",
        { safetyControls: ["exact_identifier"] }),
    negativeTask("ai-studio-prompt-library-r0", "prompt-library-negative-remote-upload",
        "Which function uploads the prompt library to a remote server?",
        "extension/src/shared/storage.ts", "importJson",
        "Local JSON import is a reviewed hard negative for absent remote upload."),
    negativeTask("ai-studio-prompt-library-r0", "prompt-library-negative-embeddings",
        "Which function creates semantic embeddings for prompts?",
        "extension/src/content/index.ts", "findSystemTextarea",
        "Textarea discovery is a reviewed hard negative for absent semantic embeddings."),

    ownerTask("portfolio-r0", "portfolio-page-items", "natural_language_behavior",
        "Which utility returns the items for a requested pagination page?",
        "src/utils/pagination.ts", "getPageItems",
        "This utility owns page slicing."),
    ownerTask("portfolio-r0", "portfolio-writing-tags", "natural_language_behavior",
        "Which function derives all writing tags and their counts?",
        "src/utils/tags.ts", "getAllWritingTags",
        "This function owns writing-tag aggregation."),
    ownerTask("portfolio-r0", "portfolio-rss", "entrypoint",
        "Which endpoint function generates the site's RSS feed?",
        "src/pages/rss.xml.ts", "GET",
        "This endpoint owns RSS response generation."),
    ownerTask("portfolio-r0", "portfolio-project-status", "configuration",
        "Where is the allowed project status vocabulary declared?",
        "src/content.config.ts", "projectStatusSchema",
        "This schema owns project status validation."),
    ownerTask("portfolio-r0", "portfolio-writing-paths", "path_role",
        "Which function generates static routes for individual writing entries?",
        "src/pages/writing/[slug].astro", "getStaticPaths",
        "This function owns dynamic writing-route generation."),
    ownerTask("portfolio-r0", "portfolio-status-regression", "tests_fixtures",
        "Which test proves project status handling is constrained and not substring matched?",
        "tests/static-ui-regressions.test.mjs", "project status handling is constrained and not substring matched",
        "The named test owns the status-matching regression.",
        { ownerMatch: "file" }),
    ownerTask("portfolio-r0", "portfolio-page-items-must-control", "natural_language_behavior",
        "must:getPageItems getPageItems",
        "src/utils/pagination.ts", "getPageItems",
        "The existing reviewed page-slicing oracle provides a metadata-only must-operator control.",
        { safetyControls: ["must"] }),
    negativeTask("portfolio-r0", "portfolio-negative-db-migration",
        "Which function applies a database schema migration?",
        "src/utils/tags.ts", "slugifyTag",
        "Tag slugification is the reviewed nearby hard negative for an absent database migration."),
    negativeTask("portfolio-r0", "portfolio-negative-jwt-signing",
        "Which function signs a JSON Web Token?",
        "src/utils/pagination.ts", "getPageCount",
        "Pagination counting is the reviewed nearby hard negative for absent JWT signing."),

    ownerTask("supply-chain-api-r0", "supply-create-app", "ownership_implementation",
        "Which function creates and configures the supply-chain FastAPI application?",
        "src/main.py", "create_app",
        "This function owns application construction."),
    ownerTask("supply-chain-api-r0", "supply-low-stock", "natural_language_behavior",
        "Which endpoint returns inventory items below their reorder level?",
        "src/api/v1/endpoints/inventory.py", "get_low_stock_items",
        "This endpoint owns low-stock HTTP retrieval."),
    ownerTask("supply-chain-api-r0", "supply-inventory-transaction", "natural_language_behavior",
        "Which model records an inventory quantity transaction?",
        "src/models/inventory.py", "InventoryTransaction",
        "This model owns persisted inventory transaction records."),
    ownerTask("supply-chain-api-r0", "supply-create-transaction", "ownership_implementation",
        "Which service method validates and creates an inventory transaction?",
        "src/services/inventory.py", "create_transaction",
        "This method owns inventory transaction creation."),
    ownerTask("supply-chain-api-r0", "supply-running-api-doc", "documentation",
        "Which documentation section explains how to run the API?",
        "README.md", "Running the API",
        "This README section owns API startup instructions.",
        { ownerMatch: "file" }),
    ownerTask("supply-chain-api-r0", "supply-fastapi-pin", "configuration",
        "Where is the FastAPI dependency version pinned?",
        "requirements.txt", "fastapi==0.95.2",
        "This requirements entry owns the FastAPI version pin.",
        { ownerMatch: "file" }),
    ownerTask("supply-chain-api-r0", "supply-fastapi-configuration-control", "configuration",
        "path:requirements.txt fastapi==0.95.2",
        "requirements.txt", "fastapi==0.95.2",
        "The existing reviewed dependency-pin oracle provides a metadata-only configuration control.",
        { ownerMatch: "file", safetyControls: ["configuration_pin"] }),
    negativeTask("supply-chain-api-r0", "supply-negative-payment-transaction",
        "Which function charges a customer payment transaction?",
        "src/services/inventory.py", "create_transaction",
        "Inventory transaction creation is a reviewed hard negative for absent payment processing."),
    negativeTask("supply-chain-api-r0", "supply-negative-image-gallery",
        "Which function renders an image gallery?",
        "src/api/v1/endpoints/inventory.py", "get_items",
        "Inventory item retrieval is a reviewed hard negative for an absent image gallery."),
].map((task) => ({
    ...task,
    oracle: { ...task.oracle, reviewer: L0_REVIEWER },
}));

const V3_STATISTICAL_CONTRACT = Object.freeze({
    version: 2,
    independentRepositoryFamiliesPerSplit: 6,
    positiveTasksPerRepository: 6,
    negativeTasksPerRepository: 2,
    minimumTasksPerSplit: 48,
    newContenderCount: 4,
    metricApplicability: {
        requiredRoleCoverage: "not_applicable_no_required_role_oracle",
        ownerAt10: "applicable_protected_retrieval_depth_metric",
    },
    decisionStratumMinimumTasks: 4,
    decisionStratumMinimumRepositoryFamilies: 2,
    pairedEstimator: "repository_macro_mean_of_paired_task_deltas",
    uncertainty: "deterministic_repository_cluster_percentile_bootstrap",
    clusterBootstrapResamples: 10000,
    bootstrapSeed: "sealed_manifest_sha256",
    multiplicityAdjustedConfidence: {
        deterministic: 0.975,
        neural: 0.9875,
        newContenders: 0.9875,
    },
    minimumEffects: {
        ownerAt3: 0.05,
        macroReciprocalRank: 0.03,
        lateOn32Over16MacroReciprocalRank: 0.01,
        simplicityTie: 0.01,
    },
    nonInferiorityMargins: {
        ownerAt1: -0.02,
        ownerAt10: -0.01,
        requiredRoleCoverage: -0.01,
        hardNegativeExposureAt3: 0.02,
        unacceptableOwnerExposureAt3: 0.02,
    },
    deterministicPerformance: {
        p95Multiplier: 1.1,
        p95AdditionalMs: 10,
        peakRssMultiplier: 1.05,
    },
    zeroFailureControls: [
        "exact_identifier",
        "must",
        "configuration_pin",
        "candidate_membership",
        "eligibility",
        "fallback",
        "frozen_pagination",
    ],
    contenderSelection: "conjunctive_effects_adjusted_bounds_protected_margins_then_shallower_unless_mrr_gain_at_least_0.01",
});

function runGit(repository, args, encoding = "utf8") {
    const result = spawnSync("git", ["-C", repository.checkoutRoot, ...args], {
        encoding: encoding === null ? undefined : encoding,
        maxBuffer: 64 * 1024 * 1024,
    });
    if (result.status !== 0) {
        throw new Error(
            `git ${args.join(" ")} failed for '${repository.id}': ${String(result.stderr).trim()}`,
        );
    }
    return result.stdout;
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function materializeRepository(repository) {
    const origin = runGit(repository, ["remote", "get-url", "origin"]).trim();
    if (origin !== repository.sourceRepository) {
        throw new Error(
            `Repository '${repository.id}' origin does not match its sealed source identity.`,
        );
    }
    const revision = runGit(repository, ["rev-parse", `${repository.revision}^{commit}`]).trim();
    if (revision !== repository.revision) {
        throw new Error(`Repository '${repository.id}' revision did not resolve exactly.`);
    }
    if (repository.requireHead === true) {
        const head = runGit(repository, ["rev-parse", "HEAD"]).trim();
        if (head !== revision) {
            throw new Error(`Repository '${repository.id}' HEAD does not match its sealed revision.`);
        }
    }
    return {
        ...repository,
        gitTree: runGit(repository, ["rev-parse", `${revision}^{tree}`]).trim(),
        sourceTreeSha256: sha256(runGit(
            repository,
            ["ls-tree", "-r", "--full-tree", revision],
            null,
        )),
    };
}

function assertPinnedOwner(repository, owner, label) {
    const sourceBytes = runGit(
        repository,
        ["show", `${repository.revision}:${owner.file}`],
        null,
    );
    if (!sourceBytes.includes(Buffer.from(owner.symbol, "utf8"))) {
        throw new Error(`${label} symbol is absent from its pinned evidence file.`);
    }
    return sourceBytes;
}

function materializeTask(task, repositoriesById, options = {}) {
    const repository = repositoriesById.get(task.repositoryId);
    const owners = [
        ...(task.oracle.requiredOwner ? [task.oracle.requiredOwner] : []),
        ...(task.oracle.acceptableAlternativeOwners ?? []),
        ...(task.oracle.hardNegativeOwners ?? []),
    ];
    for (const [index, owner] of owners.entries()) {
        assertPinnedOwner(repository, owner, `Task '${task.id}' owner[${index}]`);
    }
    const sourceBytes = assertPinnedOwner(
        repository,
        task.oracle.evidence,
        `Task '${task.id}' evidence`,
    );
    const split = repository.split;
    return {
        id: task.id,
        split,
        repositoryId: task.repositoryId,
        queryClass: task.queryClass,
        query: task.query,
        querySha256: sha256(task.query),
        search: { ...SEARCH },
        criticality: task.criticality,
        ...(options.includeSafetyControls !== false && task.safetyControls
            ? { safetyControls: [...task.safetyControls] }
            : {}),
        oracle: {
            ...task.oracle,
            evidence: {
                kind: "source_symbol",
                revision: repository.revision,
                file: task.oracle.evidence.file,
                symbol: task.oracle.evidence.symbol,
                sourceBlobSha256: sha256(sourceBytes),
            },
        },
    };
}

function pinnedSatoriArtifact(role, artifactPath) {
    const repository = {
        id: "satori-l0-source",
        checkoutRoot: BUILDER_ROOT,
    };
    return {
        role,
        path: artifactPath,
        sha256: sha256(runGit(
            repository,
            ["show", `${L0_SOURCE_REVISION}:${artifactPath}`],
            null,
        )),
    };
}

function buildLateOnL0Authority() {
    return {
        version: 1,
        phase: "L0",
        status: "authority_frozen_outputs_unopened",
        heldOutState: "unopened_no_index_or_capture",
        knownEvidence: {
            tuningManifestSha256: "ca85f0f0142c64ef7e2a6fca615ba897aa8776475f113303f1c0981b87128445",
            projectionVersion: "search_rerank_document_v1",
            originalDecision: "retain_baseline_b_lateon_quality_directional_but_not_qualified_or_deployable",
            resultCanonicalSha256: "93d6e6ed7ce289b6378a5f9617ff02f294e018b757bf8ea69c7f0332d228ab7c",
            artifacts: [
                pinnedSatoriArtifact(
                    "known_d_l16_d_l32_archive",
                    "docs/evidence/lateon-r3-diagnostic-20260730/lateon-r3-diagnostic-artifacts.tar.gz",
                ),
                pinnedSatoriArtifact(
                    "optimized_d_l16_archive",
                    "docs/evidence/lateon-runtime-profile-20260730/lateon-runtime-profile-artifacts.tar.gz",
                ),
                pinnedSatoriArtifact("c0_contract", "evals/search-ranking/lateon/c0-contract.json"),
                pinnedSatoriArtifact(
                    "measured_runtime_profile",
                    "evals/search-ranking/lateon/local-wsl-runtime-profile-v1.json",
                ),
            ],
            candidateCaptures: [
                ["satori-r0", "positive", "bc5cefd861bf66fdac2bcffcad74f4168bb6f69741ff9b7769851788ce8a8e60", "bf8ea6f7f567d0142a2aa427d0758c19e4ac3de8336961c5638134294d33655a", "95ee3685789b4ec4861ccd548825a1e06ba8eb44c021200a5e3dd37a52a90af4"],
                ["satori-r0", "negative", "38780419f93ecac15fd60f77b98a338528163b46c6303a98f834c74493687567", "3e71ca66e6862fc4cd293b5cd3d2f9b0280a1bc67e1e95ea33d9e9d17c0b0f97", "c981119e0aa85b472d5ce55d63b4142a52d346ce47c1815eb958f76fe64ea9ef"],
                ["tradingview-r0", "positive", "d78d3e14d05d8fabc7901bc55abc2b3c6255945890840cdd889c7cc2db767e37", "badafd2aed8941cb6316cb596dc66d4aa695d12491f6114f6d1d4eb9d80adab6", "d0f9817019ed44390b76a8faeaa9657dfad642af278cc97638b506b5b5b51f0b"],
                ["tradingview-r0", "negative", "51c8539db24bc5f022b1ac03604d1a0163b32659aed7645f3e3e740330f7fd11", "fbda472a5ec9f59dc81bd84165ceb52e8afde11cb4df8d6a5390f6cdbcfd2464", "3ae0f1e6dd415b5f661ef6ce1ff08902b44daca3ea095a41bbc0246d3b4b82e3"],
                ["shopify-theme-r0", "positive", "ebf975f39019c565eb37f02d3c83f62453e1dead41813757a50097341bab0998", "f7d132f37dfa40e950b106704a659bc89f5498b6b9be2e3a0706119d4421e088", "169b359fa726220db1ba711f6801ee7f231f48e1cb212d954aba50fcc2e93c8f"],
                ["shopify-theme-r0", "negative", "780b9928e49a2b268aef3b36e2bd4962cde17304c5a8550fb87e2b72bd007174", "50df34018e98f2c5532702cffe381892f35eff619507286aba9a2fa6c07ec257", "393e99b93f771df2e30a022a6e7f8ab329de00853f70212ecdf4c01b1f5631b2"],
            ].map(([repositoryId, suite, fileSha256, captureSha256, baselineReplaySha256]) => ({
                repositoryId, suite, fileSha256, captureSha256, baselineReplaySha256,
            })),
        },
        model: {
            repository: "lightonai/LateOn-Code-edge",
            revision: "07ef20f406c86badca122464808f4cac2f6e4b25",
            license: "Apache-2.0",
            artifacts: [
                { role: "onnx_fp32", path: "model.onnx", sha256: "ac5a92a685512b163c3c591438f518379309d2a98c4818a9c6e2986f789dc8ef" },
                { role: "tokenizer", path: "tokenizer.json", sha256: "a388b94942e98e5c661c6c23f919842285738bfd123a0d148dea0c56287505d0" },
                { role: "tokenizer_config", path: "tokenizer_config.json", sha256: "1621afee1f3dbc2c42901841ca46016c83102a8e070d32b90f80f80b214172a4" },
                { role: "onnx_config", path: "onnx_config.json", sha256: "fa4fef89820dcdc33c5504c62c1d5efc19603cfbfebf02368a70d51a4dbe6651" },
                { role: "special_tokens", path: "special_tokens_map.json", sha256: "6edfb9d64c0d7e5cbaa53516e90280fe1f42ba5ea7923d005a5f9b6e082142cf" },
            ],
        },
        runtime: {
            sourceRevision: L0_SOURCE_REVISION,
            sourceTree: L0_SOURCE_TREE,
            node: "24.13.0",
            onnxruntimeNode: "1.19.2",
            transformersJs: "3.0.2",
            artifacts: [
                pinnedSatoriArtifact("candidate_capture", "scripts/satori-search-candidate-capture.mjs"),
                pinnedSatoriArtifact("candidate_replay", "scripts/satori-search-candidate-replay.mjs"),
                pinnedSatoriArtifact("lateon_loader", "scripts/satori-lateon-c0-native.mjs"),
                pinnedSatoriArtifact("lateon_score", "scripts/satori-search-ranking-r3-score.mjs"),
                pinnedSatoriArtifact("quality_decision", "scripts/satori-search-ranking-r3.mjs"),
                pinnedSatoriArtifact("bounded_source_selector", "packages/mcp/src/core/bounded-source-selector.ts"),
                pinnedSatoriArtifact("rerank_document_v1", "packages/mcp/src/core/search-rerank-document.ts"),
                pinnedSatoriArtifact("runtime_profile_loader", "packages/mcp/src/server/lateon-reranker.ts"),
                pinnedSatoriArtifact("worker_protocol", "packages/mcp/src/server/lateon-reranker-protocol.ts"),
                pinnedSatoriArtifact("runtime_profile", "packages/mcp/assets/lateon/runtime-profile-v1.json"),
            ],
        },
        projectionPolicies: [
            {
                id: "search_rerank_document_v1",
                status: "known_diagnostic_replay_only",
                serialization: "newline_delimited_fields",
                maximumLines: 200,
                maximumCharacters: 4000,
                fieldOrder: ["repository_relative_path", "language", "canonical_symbol_label", "content"],
                sourceOwner: pinnedSatoriArtifact(
                    "rerank_document_v1",
                    "packages/mcp/src/core/search-rerank-document.ts",
                ),
            },
            {
                id: "search_rerank_document_v2",
                status: "prospective_frozen",
                serialization: "canonical_json_utf8",
                maximumUtf8Bytes: 4000,
                maximumLines: 200,
                fieldOrder: [
                    "repository_relative_path",
                    "language",
                    "symbol_kind",
                    "canonical_symbol_label",
                    "signature_or_declaration",
                    "documentation_excerpt",
                    "query_relevant_source_excerpt",
                    "required_owner_siblings",
                ],
                selector: {
                    version: "bounded_source_selection_v1",
                    queryTokens: "normalized_query_tokens_v1",
                    maxExcerpts: 5,
                    maxExcerptLines: 40,
                    contextLines: 2,
                    byteBudgets: "all_source_excerpt_budgets_equal_remaining_projection_utf8_bytes",
                    evidenceSpans: "validated_only",
                    stableTieOrder: "bounded_source_selection_v1",
                    declarationRetention: "mandatory_or_minimum_projection_exceeds_budget",
                },
                fileLevelProjection: "path_heading_or_declaration_and_bounded_relevant_text",
                sourceOwner: pinnedSatoriArtifact(
                    "bounded_source_selector",
                    "packages/mcp/src/core/bounded-source-selector.ts",
                ),
            },
        ],
        candidateCaptureContract: {
            state: "prospective_not_created",
            heldOutState: "unopened_no_index_or_capture",
            candidateCaptureSha256: null,
            contenderOutputSha256: null,
            digestBinding: "sha256_canonical_json_after_capture_before_scoring",
        },
        newArms: [
            { id: "projection-v1-d-l50", projectionVersion: "search_rerank_document_v1", candidateDepth: 50, status: "preregistered_unopened" },
            { id: "projection-v2-d-l16", projectionVersion: "search_rerank_document_v2", candidateDepth: 16, status: "preregistered_unopened" },
            { id: "projection-v2-d-l32", projectionVersion: "search_rerank_document_v2", candidateDepth: 32, status: "preregistered_unopened" },
            { id: "projection-v2-d-l50", projectionVersion: "search_rerank_document_v2", candidateDepth: 50, status: "preregistered_unopened" },
        ],
        executionOrder: {
            qualityArms: [
                "projection-v1-d-l50",
                "projection-v2-d-l16",
                "projection-v2-d-l32",
                "projection-v2-d-l50",
            ],
            resourceDepthOrders: [[16, 32, 50], [32, 50, 16], [50, 16, 32]],
            processIsolation: "one_depth_per_fresh_process_no_cache_or_allocator_reuse",
            warmupRuns: 2,
        },
        resourceProfile: {
            profile: "local_wsl_cpu",
            maximumModelLoadMilliseconds: 1000,
            maximumWarmP95Milliseconds: 900,
            requestDeadlineMilliseconds: 2000,
            maximumProcessPeakRssBytes: 872415232,
            maximumProcessRetainedRssBytes: 671088640,
            documentBatchSize: 1,
            intraOpThreads: 8,
            interOpThreads: 1,
            executionProvider: "cpu",
        },
    };
}

function buildVersion2Manifest() {
    const repositories = REPOSITORIES.map(materializeRepository);
    const repositoriesById = new Map(repositories.map((repository) => [
        repository.id,
        repository,
    ]));
    const tasks = TASKS.map((task) => materializeTask(
        task,
        repositoriesById,
        { includeSafetyControls: false },
    ));
    const tuningRepositories = repositories.filter(({ split }) => split === "tuning");
    const tuningTasks = tasks.filter(({ split }) => split === "tuning");
    return validateRankingBenchmarkManifest({
        version: 2,
        kind: "satori_cross_repository_ranking_manifest",
        repositories,
        leakage: {
            tuningOnlyRepositoryFamilies: [
                ...tuningRepositories.map(({ family }) => family),
                "entrypoint_owner_implementation_fixtures",
            ],
            tuningOnlyRevisions: tuningRepositories.map(({ revision }) => revision),
            tuningOnlyTaskIds: [
                ...tuningTasks.map(({ id }) => id),
                "owner-launches-cli",
                "owner-running-qap",
                "owner-installed-target",
                "owner-plain-exact-control",
                "owner-must-control",
            ],
            tuningOnlyQuerySha256: [...new Set([
                ...tuningTasks.map(({ querySha256 }) => querySha256),
                ...ENTRYPOINT_TUNING_QUERIES.map(sha256),
            ])],
        },
        statisticalContract: STATISTICAL_CONTRACT,
        neuralTrainingOverlapReview: {
            status: "deferred_r3_closed",
            rationale: "R3 is closed; C0 must pin a neural contender and complete repository-overlap review before any neural benchmark execution.",
        },
        tasks,
    }, { requireCompleteBenchmark: true });
}

function loadVersion2Authority() {
    const repository = { id: "satori-l0-source", checkoutRoot: BUILDER_ROOT };
    const raw = JSON.parse(runGit(
        repository,
        ["show", `${L0_SOURCE_REVISION}:evals/search-ranking/cross-repository-v2.manifest.json`],
    ));
    return validateRankingBenchmarkManifest(raw, {
        requireSealed: true,
        requireCompleteBenchmark: true,
    });
}

function buildVersion3Manifest() {
    const repositories = V3_REPOSITORIES.map(materializeRepository);
    const repositoriesById = new Map(repositories.map((repository) => [
        repository.id,
        repository,
    ]));
    const heldOutRepositoryIds = new Set(repositories
        .filter(({ split }) => split === "held_out")
        .map(({ id }) => id));
    const tasks = [
        ...TASKS.filter(({ repositoryId }) => heldOutRepositoryIds.has(repositoryId)),
        ...V3_NEW_TASKS,
    ].map((task) => materializeTask(task, repositoriesById));
    const tuningRepositories = repositories.filter(({ split }) => split === "tuning");
    const tuningTasks = tasks.filter(({ split }) => split === "tuning");
    const prior = loadVersion2Authority();
    const priorTuningRepositories = prior.repositories.filter(({ split }) => split === "tuning");
    const priorTuningTasks = prior.tasks.filter(({ split }) => split === "tuning");
    return validateRankingBenchmarkManifest({
        version: 3,
        kind: "satori_cross_repository_ranking_manifest",
        repositories,
        leakage: {
            tuningOnlyRepositoryFamilies: [...new Set([
                ...tuningRepositories.map(({ family }) => family),
                ...prior.leakage.tuningOnlyRepositoryFamilies,
                "owner_score_calibration",
            ])],
            tuningOnlyRevisions: [...new Set([
                ...tuningRepositories.map(({ revision }) => revision),
                ...prior.leakage.tuningOnlyRevisions,
            ])],
            tuningOnlyTaskIds: [...new Set([
                ...tuningTasks.map(({ id }) => id),
                ...prior.leakage.tuningOnlyTaskIds,
            ])],
            tuningOnlyQuerySha256: [...new Set([
                ...tuningTasks.map(({ querySha256 }) => querySha256),
                ...prior.leakage.tuningOnlyQuerySha256,
            ])],
            priorDecisionEvidence: {
                categories: [
                    "prior_lateon_tuning",
                    "tradingview_ratio",
                    "owner_score_calibration",
                    "implementation_fixtures",
                ],
                repositoryFamilies: priorTuningRepositories.map(({ family }) => family),
                revisions: priorTuningRepositories.map(({ revision }) => revision),
                taskIds: [
                    ...priorTuningTasks.map(({ id }) => id),
                    "owner-launches-cli",
                    "owner-running-qap",
                    "owner-installed-target",
                    "owner-plain-exact-control",
                    "owner-must-control",
                ],
                querySha256: prior.leakage.tuningOnlyQuerySha256,
            },
        },
        statisticalContract: V3_STATISTICAL_CONTRACT,
        neuralTrainingOverlapReview: {
            status: "suspected_overlap",
            rationale: "The accepted repositories are public and the pinned LateOn checkpoint does not disclose an authoritative training corpus, so overlap cannot be excluded before scoring.",
        },
        lateOnL0Authority: buildLateOnL0Authority(),
        tasks,
    }, { requireCompleteBenchmark: true });
}

export function buildCrossRepositoryManifest(options = {}) {
    const version = options.version ?? 3;
    if (version === 2) return buildVersion2Manifest();
    if (version === 3) return buildVersion3Manifest();
    throw new Error("Builder version must be 2 or 3.");
}

function main(argv = process.argv.slice(2)) {
    let outFile;
    let version = 3;
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === "--out") outFile = path.resolve(argv[++index]);
        else if (argv[index] === "--version") version = Number(argv[++index]);
        else if (argv[index] === "--help") {
            process.stdout.write(
                "Usage: node evals/search-ranking/build-cross-repository-manifest.mjs --out <manifest.json> [--version 2|3]\n",
            );
            return null;
        } else {
            throw new Error(`Unknown argument: ${argv[index]}`);
        }
    }
    if (!outFile) throw new Error("--out is required.");
    const manifest = buildCrossRepositoryManifest({ version });
    fs.writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
