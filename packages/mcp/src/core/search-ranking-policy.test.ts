import assert from "node:assert/strict";
import test from "node:test";
import {
    SEARCH_RERANK_RRF_K,
    SEARCH_RRF_K,
} from "./search-constants.js";
import type {
    EntrypointOwnerEvidence,
    EntrypointOwnerEvidenceResolution,
} from "./entrypoint-owner-evidence.js";
import {
    computeSearchCandidateFinalScore,
    resolveEntrypointOwnerScoreComponent,
    SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,
} from "./search-ranking-policy.js";

function owner(
    command: string,
    relativePath: string,
    symbol: string,
): EntrypointOwnerEvidence {
    return {
        command,
        declaration: {
            relativePath: "pyproject.toml",
            startLine: 5,
            endLine: 5,
        },
        target: {
            module: relativePath.replace(/^src\//, "").replace(/\.py$/, "").replace(/\//g, "."),
            relativePath,
            symbol,
            symbolKey: `symkey_${command}`,
            symbolInstanceId: `syminst_${command}`,
        },
        sourceIdentity: "a".repeat(64),
        publicationIdentity: "b".repeat(64),
        resolutionConfidence: "exact",
        resolutionBasis: "pep621_project_script_supported_root_canonical_symbol",
    };
}

function evidence(
    owners: readonly EntrypointOwnerEvidence[],
    input: {
        declaredOwnerCount?: number;
        resolutionComplete?: boolean;
    } = {},
): EntrypointOwnerEvidenceResolution {
    const declaredOwnerCount = input.declaredOwnerCount ?? owners.length;
    return {
        status: owners.length > 0 ? "resolved" : "no_resolved_owners",
        owners,
        declaredOwnerCount,
        resolvedOwnerCount: owners.length,
        resolutionComplete: input.resolutionComplete
            ?? declaredOwnerCount === owners.length,
        manifestSourceIdentity: "a".repeat(64),
        publicationBinding: {
            collectionName: "collection",
            markerRunId: "marker",
            policyDocumentDigest: "c".repeat(64),
            policyHash: "d".repeat(64),
            navigationGenerationId: "navigation",
            symbolRegistryManifestHash: "manifest",
        },
        publicationIdentity: "b".repeat(64),
    };
}

const startupPlan = {
    semanticQuery: "Where does the command-line application start?",
    testSeeking: false,
    implementationSeeking: true,
    writerSeeking: false,
    entrypointIntent: {
        kinds: ["application_startup_ownership"] as const,
        reasons: ["application_startup_ownership_cue"] as const,
    },
    lexicalTerms: [],
};

function candidateFor(entrypointOwner: EntrypointOwnerEvidence) {
    return {
        relativePath: entrypointOwner.target.relativePath,
        symbolLabel: `function ${entrypointOwner.target.symbol}`,
        ownerSymbolKey: entrypointOwner.target.symbolKey,
        ownerSymbolInstanceId: entrypointOwner.target.symbolInstanceId,
    };
}

test("a single canonical owner receives a separately observable bounded score component", () => {
    const entrypointOwner = owner("qap", "src/cli/main.py", "cli_entry_point");
    const result = resolveEntrypointOwnerScoreComponent({
        plan: startupPlan,
        result: candidateFor(entrypointOwner),
        entrypointOwnerEvidence: evidence([entrypointOwner]),
    });

    assert.deepEqual(result, {
        scoreBoost: SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,
        reason: "manifest_entrypoint_owner",
    });
});

test("an explicit command name promotes only its canonical declared owner", () => {
    const primaryOwner = owner("qap", "src/cli/main.py", "cli_entry_point");
    const adminOwner = owner("qap-admin", "src/cli/admin.py", "admin_entry_point");
    const owners = [primaryOwner, adminOwner];
    const plan = {
        ...startupPlan,
        semanticQuery: "How does running qap-admin enter the application?",
        entrypointIntent: {
            kinds: ["installed_command_ownership"] as const,
            reasons: ["installed_command_ownership_cue"] as const,
        },
    };

    assert.equal(resolveEntrypointOwnerScoreComponent({
        plan,
        result: candidateFor(primaryOwner),
        entrypointOwnerEvidence: evidence(owners),
    }).scoreBoost, 0);
    assert.deepEqual(resolveEntrypointOwnerScoreComponent({
        plan,
        result: candidateFor(adminOwner),
        entrypointOwnerEvidence: evidence(owners),
    }), {
        scoreBoost: SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,
        reason: "manifest_entrypoint_owner",
    });
});

test("a generic startup query does not promote every owner in a multi-entrypoint package", () => {
    const owners = [
        owner("qap", "src/cli/main.py", "cli_entry_point"),
        owner("qap-admin", "src/cli/admin.py", "admin_entry_point"),
        owner("qap-worker", "src/worker/main.py", "worker_entry_point"),
    ];

    for (const entrypointOwner of owners) {
        assert.deepEqual(resolveEntrypointOwnerScoreComponent({
            plan: startupPlan,
            result: candidateFor(entrypointOwner),
            entrypointOwnerEvidence: evidence(owners),
        }), {
            scoreBoost: 0,
            reason: "not_applicable",
        });
    }
});

test("incomplete multi-entrypoint resolution never becomes a generic single owner", () => {
    const entrypointOwner = owner("qap", "src/cli/main.py", "cli_entry_point");
    const incompleteEvidence = evidence([entrypointOwner], {
        declaredOwnerCount: 2,
        resolutionComplete: false,
    });

    assert.equal(resolveEntrypointOwnerScoreComponent({
        plan: startupPlan,
        result: candidateFor(entrypointOwner),
        entrypointOwnerEvidence: incompleteEvidence,
    }).scoreBoost, 0);
    assert.equal(resolveEntrypointOwnerScoreComponent({
        plan: {
            ...startupPlan,
            semanticQuery: "How does running qap enter the application?",
            entrypointIntent: {
                kinds: ["installed_command_ownership"] as const,
                reasons: ["installed_command_ownership_cue"] as const,
            },
        },
        result: candidateFor(entrypointOwner),
        entrypointOwnerEvidence: incompleteEvidence,
    }).scoreBoost, SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST);
});

test("unknown commands and adjacent intent do not activate owner ranking", () => {
    const entrypointOwner = owner("qap", "src/cli/main.py", "cli_entry_point");
    const cases = [
        {
            semanticQuery: "How does running qap-worker enter the application?",
            kinds: ["installed_command_ownership"] as const,
        },
        {
            semanticQuery: "Which development script launches the mock application?",
            kinds: ["development_execution"] as const,
        },
        {
            semanticQuery: "Where are CLI startup tests?",
            kinds: ["test_startup"] as const,
        },
    ];

    for (const row of cases) {
        const result = resolveEntrypointOwnerScoreComponent({
            plan: {
                ...startupPlan,
                semanticQuery: row.semanticQuery,
                entrypointIntent: { kinds: row.kinds, reasons: [] },
            },
            result: candidateFor(entrypointOwner),
            entrypointOwnerEvidence: evidence([entrypointOwner]),
        });
        assert.equal(result.scoreBoost, 0, row.semanticQuery);
    }
});

test("matching path or label without canonical identity never receives owner evidence", () => {
    const entrypointOwner = owner("qap", "src/cli/main.py", "cli_entry_point");
    const result = resolveEntrypointOwnerScoreComponent({
        plan: startupPlan,
        result: {
            relativePath: entrypointOwner.target.relativePath,
            symbolLabel: "method Nested.cli_entry_point",
            ownerSymbolKey: "symkey_other",
            ownerSymbolInstanceId: "syminst_other",
        },
        entrypointOwnerEvidence: evidence([entrypointOwner]),
    });

    assert.equal(result.scoreBoost, 0);
});

test("the owner component remains capped on representative RRF-scale scores", () => {
    const ownerBeforeRerank = {
        fusionScore: (1 / (SEARCH_RRF_K + 12)) + (1 / (SEARCH_RRF_K + 13)),
        lexicalScore: 0.498,
        pathMultiplier: 0.7,
        changedFilesMultiplier: 1,
        agentFitMultiplier: 1.25,
        entrypointOwnerScoreBoost: SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,
    };
    const cappedAfterRerank = computeSearchCandidateFinalScore({
        ...ownerBeforeRerank,
        fusionScore: ownerBeforeRerank.fusionScore + (1 / (SEARCH_RERANK_RRF_K + 1)),
        entrypointOwnerScoreBoost: 10,
    });
    const expectedCappedAfterRerank = computeSearchCandidateFinalScore({
        ...ownerBeforeRerank,
        fusionScore: ownerBeforeRerank.fusionScore + (1 / (SEARCH_RERANK_RRF_K + 1)),
    });

    assert.equal(cappedAfterRerank, expectedCappedAfterRerank);
});

test("strong combined semantic and lexical evidence can outrank an entrypoint owner", () => {
    const ownerScore = computeSearchCandidateFinalScore({
        fusionScore: (1 / (SEARCH_RRF_K + 12)) + (1 / (SEARCH_RRF_K + 13)),
        lexicalScore: 0.30,
        pathMultiplier: 0.7,
        changedFilesMultiplier: 1,
        agentFitMultiplier: 1.25,
        entrypointOwnerScoreBoost: SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,
    });
    const strongerCandidateScore = computeSearchCandidateFinalScore({
        fusionScore: (2 / (SEARCH_RRF_K + 1)) + (1 / (SEARCH_RERANK_RRF_K + 1)),
        lexicalScore: 0.50,
        pathMultiplier: 1.35,
        changedFilesMultiplier: 1,
        agentFitMultiplier: 1.25,
        entrypointOwnerScoreBoost: 0,
    });

    assert.equal(strongerCandidateScore > ownerScore, true);
});
