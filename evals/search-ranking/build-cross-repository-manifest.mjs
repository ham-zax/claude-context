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
        oracle: {
            kind: "owner",
            ...(options.ownerMatch ? { ownerMatch: options.ownerMatch } : {}),
            requiredOwner: { file, symbol },
            acceptableAlternativeOwners: options.acceptableAlternativeOwners ?? [],
            hardNegativeOwners: options.hardNegativeOwners ?? [],
            rationale,
            reviewer: REVIEWER,
            evidence: { file, symbol },
        },
    };
}

function negativeTask(repositoryId, id, query, file, symbol, rationale) {
    return {
        id,
        repositoryId,
        queryClass: "negative",
        query,
        criticality: "diagnostic",
        oracle: {
            kind: "negative",
            acceptableAlternativeOwners: [],
            hardNegativeOwners: [{ file, symbol }],
            rationale,
            reviewer: REVIEWER,
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

function materializeTask(task, repositoriesById) {
    const repository = repositoriesById.get(task.repositoryId);
    const sourceBytes = runGit(
        repository,
        ["show", `${repository.revision}:${task.oracle.evidence.file}`],
        null,
    );
    if (!sourceBytes.includes(Buffer.from(task.oracle.evidence.symbol, "utf8"))) {
        throw new Error(
            `Task '${task.id}' oracle symbol is absent from its pinned evidence file.`,
        );
    }
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

export function buildCrossRepositoryManifest() {
    const repositories = REPOSITORIES.map(materializeRepository);
    const repositoriesById = new Map(repositories.map((repository) => [
        repository.id,
        repository,
    ]));
    const tasks = TASKS.map((task) => materializeTask(task, repositoriesById));
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

function main(argv = process.argv.slice(2)) {
    let outFile;
    for (let index = 0; index < argv.length; index += 1) {
        if (argv[index] === "--out") outFile = path.resolve(argv[++index]);
        else if (argv[index] === "--help") {
            process.stdout.write(
                "Usage: node evals/search-ranking/build-cross-repository-manifest.mjs --out <manifest.json>\n",
            );
            return null;
        } else {
            throw new Error(`Unknown argument: ${argv[index]}`);
        }
    }
    if (!outFile) throw new Error("--out is required.");
    const manifest = buildCrossRepositoryManifest();
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
