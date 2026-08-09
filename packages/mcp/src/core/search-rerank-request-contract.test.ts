import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import type { Reranker } from "@zokizuan/satori-core";
import {
    SEARCH_RERANK_STRUCTURAL_CONTEXT_POLICY,
    buildSearchRerankRequestContractFixtures,
    buildSearchRerankRequestContractManifest,
    computeSearchRerankRequestContractSha256,
    loadSearchRerankRequestContract,
    parseSearchRerankRequestContract,
    resolveSearchRerankRequestContractAssetPath,
    resolveSearchRerankRequestIdentity,
} from "./search-rerank-request-contract.js";

function fakeReranker(overrides: Partial<Reranker> = {}): Reranker {
    return {
        getIdentity: () => ({ provider: "lateon", model: "LateOn-Code-edge", profile: "lateon_offline_quality_projection_v3_d32_v1" }),
        rerank: async () => [],
        ...overrides,
    };
}

test("committed rerank request contract matches runtime fixture recomputation", () => {
    const manifest = loadSearchRerankRequestContract();
    const recomputed = buildSearchRerankRequestContractManifest();
    assert.equal(manifest.contractSha256, recomputed.contractSha256);
    assert.deepEqual(manifest.fixtures, recomputed.fixtures);
    assert.equal(manifest.contractSha256, computeSearchRerankRequestContractSha256(manifest.fixtures));
});

test("request contract fixtures bind focus, query, role, and document projection behavior", () => {
    const fixtures = buildSearchRerankRequestContractFixtures();
    assert.equal(
        fixtures.answerFocusResolution["how does Shariah compliance checking block trades"],
        "implementation",
    );
    assert.ok(fixtures.queryProjectionV1.implementation?.includes("Answer focus: implementation"));
    assert.equal(
        fixtures.queryProjectionV2.implementation,
        [
            "Question:",
            "how does Shariah compliance checking block trades",
            "",
            "Requested answer type:",
            "production implementation, control flow, and integration path",
        ].join("\n"),
    );
    assert.equal(
        fixtures.queryProjectionV2.implementation?.toLowerCase().includes("test"),
        false,
        "contract fixture must keep the implementation projection positive-only",
    );
    assert.equal(fixtures.candidateRoleClassification["tests/veto.test.ts|typescript"], "test");
    assert.ok(fixtures.documentProjectionV3.includes('"candidate_role":"implementation"'));
    assert.ok(
        fixtures.documentProjectionV4.includes(
            '"structural_context":{"direct_callees":[],"direct_callers":[],"supporting_tests":[]}',
        ),
        "v4 fixture must carry the empty answer-packet structural context",
    );
    assert.ok(fixtures.documentProjectionV4Structural.includes('"TradingCore.__init__"'));
    assert.ok(fixtures.documentProjectionV4Structural.includes('"relation":"test_support"'));
    assert.ok(fixtures.documentProjectionV4SourceFirst.includes('validate_order_for_exact_question'));
    assert.ok(fixtures.sourceSelectionPolicyIdentity.includes("search_rerank_document_v3"));
    assert.ok(fixtures.sourceSelectionPolicyIdentity.includes("source_before_references_v1"));
    assert.equal(
        fixtures.structuralContext.callAdmission,
        "high_confidence_or_proof_backed_authoritative_call_v1",
    );
    assert.deepEqual(fixtures.structuralContext.proofBackedAuthorities, ["direct_binding", "origin_flow"]);
    assert.equal(fixtures.structuralContext.exactInstanceIdentityRequired, true);
    assert.equal(fixtures.structuralContext.maxDirectCallers, 3);
    assert.equal(fixtures.structuralContext.maxDirectCallees, 3);
    assert.equal(fixtures.structuralContext.maxSupportingTests, 2);
    assert.equal(fixtures.structuralContext.referenceSourceText, false);
    assert.deepEqual(fixtures.partialProjectionSemantics.warnings, [
        "RERANKER_INPUT_DEGRADED",
        "RERANKER_SKIPPED_INPUT",
        "RERANKER_FAILED",
    ]);
});

test("any fixture behavior change moves the request contract digest", () => {
    const baseline = buildSearchRerankRequestContractFixtures();
    const mutatedQuery = {
        ...baseline,
        queryProjectionV1: { ...baseline.queryProjectionV1, implementation: `${baseline.queryProjectionV1.implementation}\nextra` },
    };
    const mutatedRole = {
        ...baseline,
        candidateRoleClassification: { ...baseline.candidateRoleClassification, "tests/veto.test.ts|typescript": "implementation" },
    };
    const mutatedDocument = { ...baseline, documentProjectionV3: `${baseline.documentProjectionV3}x` };
    const mutatedV4Structural = {
        ...baseline,
        documentProjectionV4Structural: `${baseline.documentProjectionV4Structural}x`,
    };
    const baselineDigest = computeSearchRerankRequestContractSha256(baseline);
    assert.notEqual(computeSearchRerankRequestContractSha256(mutatedQuery), baselineDigest);
    assert.notEqual(computeSearchRerankRequestContractSha256(mutatedRole), baselineDigest);
    assert.notEqual(computeSearchRerankRequestContractSha256(mutatedDocument), baselineDigest);
    assert.notEqual(computeSearchRerankRequestContractSha256(mutatedV4Structural), baselineDigest);
});

test("contract parser rejects malformed and drifted manifests", () => {
    const manifest = buildSearchRerankRequestContractManifest();
    assert.throws(() => parseSearchRerankRequestContract({ ...manifest, extraKey: 1 }), /unexpected keys/);
    assert.throws(() => parseSearchRerankRequestContract({ ...manifest, schemaVersion: "other" }), /unsupported/);
    assert.throws(
        () => parseSearchRerankRequestContract({ ...manifest, contractSha256: "f".repeat(64) }),
        /does not match/,
    );
    const driftedStructuralContext = {
        ...manifest.fixtures.structuralContext,
        maxDirectCallers: 9,
    } as unknown as typeof SEARCH_RERANK_STRUCTURAL_CONTEXT_POLICY;
    assert.throws(
        () => parseSearchRerankRequestContract({
            ...manifest,
            fixtures: { ...manifest.fixtures, structuralContext: driftedStructuralContext },
            contractSha256: computeSearchRerankRequestContractSha256({
                ...manifest.fixtures,
                structuralContext: driftedStructuralContext,
            }),
        }),
        /drifted from the runtime policy/,
    );
});

test("resolveSearchRerankRequestIdentity binds provider, projections, and contract digest", () => {
    const identity = resolveSearchRerankRequestIdentity(fakeReranker({
        getQueryProjectionVersion: () => "search_rerank_query_v1",
        getDocumentProjectionVersion: () => "search_rerank_document_v3",
    }));
    assert.deepEqual(
        { provider: identity.provider, model: identity.model, profile: identity.profile },
        { provider: "lateon", model: "LateOn-Code-edge", profile: "lateon_offline_quality_projection_v3_d32_v1" },
    );
    assert.equal(identity.queryProjectionIdentity, "search_rerank_query_v1");
    assert.equal(identity.documentProjectionIdentity, "search_rerank_document_v3");
    assert.equal(identity.requestContractSha256, loadSearchRerankRequestContract().contractSha256);
});

test("providers without advertised projections fall back to raw identities", () => {
    const identity = resolveSearchRerankRequestIdentity(fakeReranker());
    assert.equal(identity.queryProjectionIdentity, "semantic_query_raw_v1");
    assert.equal(identity.documentProjectionIdentity, "semantic_document_raw_v1");
});

test("contract asset round-trips through disk", () => {
    const raw = JSON.parse(fs.readFileSync(resolveSearchRerankRequestContractAssetPath(), "utf8"));
    const parsed = parseSearchRerankRequestContract(raw);
    assert.equal(parsed.contractSha256, loadSearchRerankRequestContract().contractSha256);
});
