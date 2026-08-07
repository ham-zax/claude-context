import assert from "node:assert/strict";
import test from "node:test";
import {
    buildSearchRankedSetBinding,
    verifySearchRankedSetBinding,
    type SearchRankedSetBindingInput,
} from "./search-result-set-identity.js";
import { SEARCH_NATIVE_RERANKER_ORDER_POLICY_ID } from "./search-order-policy.js";

function input(): SearchRankedSetBindingInput {
    return {
        queryPolicyDigest: "a".repeat(64),
        rankingPolicyIdentity: SEARCH_NATIVE_RERANKER_ORDER_POLICY_ID,
        disclosurePolicyVersion: "search_disclosure_v1",
        publicationIdentity: {
            collectionName: "repo-generation",
            marker: { runId: "run-1", indexPolicyHash: "b".repeat(64) },
            policyDocumentDigest: "c".repeat(64),
            navigation: {
                status: "sealed",
                receipt: { generationId: "navigation-1", sealHash: "d".repeat(64) },
            },
        },
        preparedObservation: "prepared-1",
        sourceObservation: "source-1",
        rerankerIdentity: {
            kind: "provider",
            provider: "lateon",
            model: "lightonai/LateOn-Code-edge@revision-1",
            profile: "e".repeat(64),
        },
        rerankerProjectionIdentity: "search_rerank_document_v1",
        orderedResults: [{
            target: {
                file: "src/owner.ts",
                span: { startLine: 10, endLine: 20 },
                symbolId: "owner-symbol",
            },
            displayLabel: "owner",
            language: "typescript",
            symbolKind: "function",
            score: 0.75,
            quality: { owner: "high", semantic: "high" },
            evidenceChunks: 2,
            preview: "export function owner() {}",
            evidenceSpan: { startLine: 12, endLine: 14 },
            navigation: {
                graph: "ready",
                inbound: "verify",
                callerSearchTerm: "owner",
            },
            debug: {
                representativeChunkCount: 2,
                pathCategory: "srcRuntime",
                pathMultiplier: 1.1,
                topChunkScore: 0.7,
                lexicalScore: 0.2,
                exactLexicalMatch: false,
            },
        }, {
            target: {
                file: "src/helper.ts",
                span: { startLine: 1, endLine: 4 },
            },
            displayLabel: "src/helper.ts",
            language: "typescript",
            score: 0.5,
            quality: { owner: "low", semantic: "medium" },
            preview: "export const helper = true;",
            navigation: { graph: "missing_symbol" },
        }],
        recommendedActions: [{
            tool: "read_file",
            args: {
                path: "/repo/src/owner.ts",
                open_symbol: { contractVersion: 2, symbolId: "owner-symbol" },
            },
            reason: "Read the canonical owner.",
        }, null],
    };
}

function withMutation(
    mutate: (value: SearchRankedSetBindingInput) => SearchRankedSetBindingInput,
): SearchRankedSetBindingInput {
    return mutate(structuredClone(input()));
}

test("ranked-set binding is canonical across equivalent object key order", () => {
    const baseline = buildSearchRankedSetBinding(input());
    const reordered = withMutation((value) => ({
        ...value,
        publicationIdentity: {
            navigation: {
                status: "sealed",
                receipt: { sealHash: "d".repeat(64), generationId: "navigation-1" },
            },
            policyDocumentDigest: "c".repeat(64),
            marker: { indexPolicyHash: "b".repeat(64), runId: "run-1" },
            collectionName: "repo-generation",
        },
    }));

    assert.deepEqual(buildSearchRankedSetBinding(reordered), baseline);
    assert.match(baseline.rankedSetDigest, /^[a-f0-9]{64}$/);
    assert.equal(baseline.orderedGroups.length, 2);
    assert.equal(verifySearchRankedSetBinding(baseline, reordered), true);
});

test("ranked-set digest binds every pageable group field and complete order", () => {
    const baseline = buildSearchRankedSetBinding(input()).rankedSetDigest;
    const variants = [
        withMutation((value) => {
            value.orderedResults[0]!.target.file = "src/other.ts";
            return value;
        }),
        withMutation((value) => {
            value.orderedResults[0]!.score = 0.74;
            return value;
        }),
        withMutation((value) => {
            value.orderedResults[0]!.evidenceSpan = { startLine: 13, endLine: 14 };
            return value;
        }),
        withMutation((value) => {
            value.orderedResults[0]!.navigation = { graph: "missing_relationship_sidecar" };
            return value;
        }),
        withMutation((value) => ({
            ...value,
            recommendedActions: value.recommendedActions.map((action, index) => (
                index === 0 && action ? { ...action, reason: "Different action." } : action
            )),
        })),
        withMutation((value) => ({
            ...value,
            orderedResults: [...value.orderedResults].reverse(),
            recommendedActions: [...value.recommendedActions].reverse(),
        })),
    ];

    for (const variant of variants) {
        assert.notEqual(buildSearchRankedSetBinding(variant).rankedSetDigest, baseline);
    }
});

test("ranked-set digest binds publication, observations, policies, model, and projection", () => {
    const baseline = buildSearchRankedSetBinding(input()).rankedSetDigest;
    const variants = [
        withMutation((value) => ({
            ...value,
            publicationIdentity: { ...value.publicationIdentity, collectionName: "other" },
        })),
        withMutation((value) => ({ ...value, preparedObservation: "prepared-2" })),
        withMutation((value) => ({ ...value, sourceObservation: "source-2" })),
        withMutation((value) => ({ ...value, queryPolicyDigest: "f".repeat(64) })),
        withMutation((value) => ({ ...value, rankingPolicyIdentity: "ranking-v2" })),
        withMutation((value) => ({ ...value, disclosurePolicyVersion: "disclosure-v2" })),
        withMutation((value) => ({
            ...value,
            rerankerIdentity: { ...value.rerankerIdentity, model: "other-model" },
        })),
        withMutation((value) => ({ ...value, rerankerProjectionIdentity: "projection-v2" })),
    ];

    for (const variant of variants) {
        const binding = buildSearchRankedSetBinding(variant);
        assert.notEqual(binding.rankedSetDigest, baseline);
        assert.equal(verifySearchRankedSetBinding(binding, input()), false);
    }
});

test("ranked-set binding rejects unpaired result and action sequences", () => {
    assert.throws(() => buildSearchRankedSetBinding({
        ...input(),
        recommendedActions: [],
    }), /paired/);
});

test("ranked-set binding rejects incomplete publication authority", () => {
    assert.throws(() => buildSearchRankedSetBinding({
        ...input(),
        publicationIdentity: {
            ...input().publicationIdentity,
            policyDocumentDigest: "",
        },
    }), /publication identity must be complete/);
    assert.throws(() => buildSearchRankedSetBinding({
        ...input(),
        rerankerIdentity: {
            kind: "provider",
            provider: "lateon",
            model: "",
            profile: "e".repeat(64),
        },
    }), /reranker model identity must be non-empty/);
});
