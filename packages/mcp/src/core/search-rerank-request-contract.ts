import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Reranker } from "@zokizuan/satori-core";
import { serializeCanonicalJson } from "./canonical-json.js";
import { resolveSearchAnswerFocus } from "./search-answer-focus.js";
import { resolveSearchCandidateRole } from "./search-candidate-role.js";
import { SEARCH_RERANK_DOCUMENT_V3_POLICY, buildSearchRerankDocumentV3 } from "./search-rerank-document-v3.js";
import { buildSearchRerankQuery } from "./search-rerank-query.js";
import { buildSearchRerankQueryV2 } from "./search-rerank-query-v2.js";
import { SEARCH_RERANK_QUERY_RAW_IDENTITY } from "./search-rerank-query-routing.js";
import { buildSearchQueryPlan, parseSearchOperators } from "./search-query-planning.js";

export const SEARCH_RERANK_REQUEST_CONTRACT_SCHEMA_VERSION =
    "satori_rerank_request_contract_v1" as const;
export const SEARCH_RERANK_REQUEST_CONTRACT_ASSET_RELPATH =
    "assets/lateon/rerank-request-contract-v1.json";
export const SEARCH_RERANK_DOCUMENT_RAW_IDENTITY = "semantic_document_raw_v1" as const;

export const SEARCH_RERANK_STRUCTURAL_CONTEXT_POLICY = Object.freeze({
    maxDirectCallers: 3,
    maxDirectCallees: 3,
    maxSupportingTests: 2,
    orderBy: ["relation", "repository_relative_path", "canonical_symbol_label"] as const,
    referenceSourceText: false,
});

export const SEARCH_RERANK_PARTIAL_PROJECTION_SEMANTICS = Object.freeze({
    warnings: [
        "RERANKER_INPUT_DEGRADED",
        "RERANKER_SKIPPED_INPUT",
        "RERANKER_FAILED",
    ] as const,
    providerNeverCalledOnZeroProjectable: true,
});

export interface SearchRerankRequestIdentityV1 {
    provider: string;
    model: string;
    profile: string;
    queryProjectionIdentity: string;
    documentProjectionIdentity: string;
    requestContractSha256: string;
}

export type SearchRerankRequestContractFixtures = Readonly<{
    answerFocusResolution: Record<string, string>;
    queryProjectionV1: Record<string, string>;
    queryProjectionV2: Record<string, string>;
    candidateRoleClassification: Record<string, string>;
    documentProjectionV3: string;
    sourceSelectionPolicyIdentity: string;
    canonicalJsonIdentity: string;
    structuralContext: typeof SEARCH_RERANK_STRUCTURAL_CONTEXT_POLICY;
    partialProjectionSemantics: typeof SEARCH_RERANK_PARTIAL_PROJECTION_SEMANTICS;
}>;

export type SearchRerankRequestContractManifest = Readonly<{
    schemaVersion: typeof SEARCH_RERANK_REQUEST_CONTRACT_SCHEMA_VERSION;
    contractSha256: string;
    fixtures: SearchRerankRequestContractFixtures;
}>;

const FOCUS_FIXTURE_QUESTIONS: Record<string, string> = {
    implementation: "how does Shariah compliance checking block trades",
    tests: "find tests for trade veto behavior",
    documentation: "what do the docs say about order validation",
    configuration: "where is the risk threshold configured",
    references: "who calls validate_order",
    neutral: "order validation overview",
};

const ROLE_FIXTURES: readonly { relativePath: string; language: string }[] = [
    { relativePath: "src/core/veto.ts", language: "typescript" },
    { relativePath: "tests/veto.test.ts", language: "typescript" },
    { relativePath: "docs/architecture.md", language: "markdown" },
    { relativePath: "config/risk.toml", language: "toml" },
];

const DOCUMENT_PROJECTION_FIXTURE = Object.freeze({
    relativePath: "src/core/veto.ts",
    language: "typescript",
    candidateRole: "implementation",
    symbolKind: "function",
    canonicalSymbolLabel: "validate_order",
    symbolSpan: { startLine: 1, endLine: 3 },
    content: [
        "function validate_order(order) {",
        "    return check_shariah_compliance(order);",
        "}",
    ].join("\n"),
    query: FOCUS_FIXTURE_QUESTIONS.implementation,
});

export function buildSearchRerankRequestContractFixtures(): SearchRerankRequestContractFixtures {
    const answerFocusResolution: Record<string, string> = {};
    const queryProjectionV1: Record<string, string> = {};
    const queryProjectionV2: Record<string, string> = {};
    for (const [focus, question] of Object.entries(FOCUS_FIXTURE_QUESTIONS)) {
        const parsedOperators = parseSearchOperators(question);
        const queryPlan = buildSearchQueryPlan(parsedOperators.semanticQuery, true, parsedOperators);
        answerFocusResolution[question] = resolveSearchAnswerFocus(queryPlan).focus;
        const answerFocus = focus as Parameters<typeof buildSearchRerankQuery>[0]["answerFocus"];
        queryProjectionV1[focus] = buildSearchRerankQuery({
            semanticQuery: question,
            answerFocus,
        });
        queryProjectionV2[focus] = buildSearchRerankQueryV2({
            semanticQuery: question,
            answerFocus,
        });
    }
    const candidateRoleClassification: Record<string, string> = {};
    for (const fixture of ROLE_FIXTURES) {
        candidateRoleClassification[`${fixture.relativePath}|${fixture.language}`] =
            resolveSearchCandidateRole(fixture);
    }
    return {
        answerFocusResolution,
        queryProjectionV1,
        queryProjectionV2,
        candidateRoleClassification,
        documentProjectionV3: buildSearchRerankDocumentV3(DOCUMENT_PROJECTION_FIXTURE).text,
        sourceSelectionPolicyIdentity: serializeCanonicalJson(SEARCH_RERANK_DOCUMENT_V3_POLICY),
        canonicalJsonIdentity: serializeCanonicalJson({ b: 1, a: [2, { d: "x", c: null }] }),
        structuralContext: SEARCH_RERANK_STRUCTURAL_CONTEXT_POLICY,
        partialProjectionSemantics: SEARCH_RERANK_PARTIAL_PROJECTION_SEMANTICS,
    };
}

export function computeSearchRerankRequestContractSha256(
    fixtures: SearchRerankRequestContractFixtures,
): string {
    return crypto.createHash("sha256")
        .update(serializeCanonicalJson(fixtures), "utf8")
        .digest("hex");
}

export function buildSearchRerankRequestContractManifest(): SearchRerankRequestContractManifest {
    const fixtures = buildSearchRerankRequestContractFixtures();
    return {
        schemaVersion: SEARCH_RERANK_REQUEST_CONTRACT_SCHEMA_VERSION,
        contractSha256: computeSearchRerankRequestContractSha256(fixtures),
        fixtures,
    };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Rerank request contract ${label} must be an object.`);
    }
    return value as Record<string, unknown>;
}

function requireStringRecord(value: unknown, label: string): Record<string, string> {
    const record = requireRecord(value, label);
    for (const [key, entry] of Object.entries(record)) {
        if (typeof entry !== "string") {
            throw new Error(`Rerank request contract ${label}.${key} must be a string.`);
        }
    }
    return record as Record<string, string>;
}

export function parseSearchRerankRequestContract(raw: unknown): SearchRerankRequestContractManifest {
    const record = requireRecord(raw, "manifest");
    const keys = Object.keys(record).sort();
    const expected = ["contractSha256", "fixtures", "schemaVersion"];
    if (serializeCanonicalJson(keys) !== serializeCanonicalJson(expected)) {
        throw new Error("Rerank request contract manifest carries unexpected keys.");
    }
    if (record.schemaVersion !== SEARCH_RERANK_REQUEST_CONTRACT_SCHEMA_VERSION) {
        throw new Error(`Rerank request contract schema '${String(record.schemaVersion)}' is unsupported.`);
    }
    if (typeof record.contractSha256 !== "string" || !/^[0-9a-f]{64}$/.test(record.contractSha256)) {
        throw new Error("Rerank request contract digest must be a SHA-256 hex string.");
    }
    const fixturesRecord = requireRecord(record.fixtures, "fixtures");
    const fixtureKeys = Object.keys(fixturesRecord).sort();
    const expectedFixtureKeys = [
        "answerFocusResolution",
        "candidateRoleClassification",
        "canonicalJsonIdentity",
        "documentProjectionV3",
        "partialProjectionSemantics",
        "queryProjectionV1",
        "queryProjectionV2",
        "sourceSelectionPolicyIdentity",
        "structuralContext",
    ];
    if (serializeCanonicalJson(fixtureKeys) !== serializeCanonicalJson(expectedFixtureKeys)) {
        throw new Error("Rerank request contract fixtures carry unexpected keys.");
    }
    const structuralContext = requireRecord(fixturesRecord.structuralContext, "fixtures.structuralContext");
    if (
        structuralContext.maxDirectCallers !== SEARCH_RERANK_STRUCTURAL_CONTEXT_POLICY.maxDirectCallers
        || structuralContext.maxDirectCallees !== SEARCH_RERANK_STRUCTURAL_CONTEXT_POLICY.maxDirectCallees
        || structuralContext.maxSupportingTests !== SEARCH_RERANK_STRUCTURAL_CONTEXT_POLICY.maxSupportingTests
        || structuralContext.referenceSourceText !== SEARCH_RERANK_STRUCTURAL_CONTEXT_POLICY.referenceSourceText
        || serializeCanonicalJson(structuralContext.orderBy)
            !== serializeCanonicalJson(SEARCH_RERANK_STRUCTURAL_CONTEXT_POLICY.orderBy)
    ) {
        throw new Error("Rerank request contract structural-context policy drifted from the runtime policy.");
    }
    const partialProjection = requireRecord(
        fixturesRecord.partialProjectionSemantics,
        "fixtures.partialProjectionSemantics",
    );
    if (
        serializeCanonicalJson(partialProjection.warnings)
            !== serializeCanonicalJson(SEARCH_RERANK_PARTIAL_PROJECTION_SEMANTICS.warnings)
        || partialProjection.providerNeverCalledOnZeroProjectable
            !== SEARCH_RERANK_PARTIAL_PROJECTION_SEMANTICS.providerNeverCalledOnZeroProjectable
    ) {
        throw new Error("Rerank request contract partial-projection semantics drifted from the runtime policy.");
    }
    if (typeof fixturesRecord.documentProjectionV3 !== "string") {
        throw new Error("Rerank request contract document projection fixture must be a string.");
    }
    if (typeof fixturesRecord.sourceSelectionPolicyIdentity !== "string") {
        throw new Error("Rerank request contract source-selection identity must be a string.");
    }
    if (typeof fixturesRecord.canonicalJsonIdentity !== "string") {
        throw new Error("Rerank request contract canonical-JSON identity must be a string.");
    }
    const manifest: SearchRerankRequestContractManifest = {
        schemaVersion: SEARCH_RERANK_REQUEST_CONTRACT_SCHEMA_VERSION,
        contractSha256: record.contractSha256,
        fixtures: {
            answerFocusResolution: requireStringRecord(
                fixturesRecord.answerFocusResolution,
                "fixtures.answerFocusResolution",
            ),
            queryProjectionV1: requireStringRecord(
                fixturesRecord.queryProjectionV1,
                "fixtures.queryProjectionV1",
            ),
            queryProjectionV2: requireStringRecord(
                fixturesRecord.queryProjectionV2,
                "fixtures.queryProjectionV2",
            ),
            candidateRoleClassification: requireStringRecord(
                fixturesRecord.candidateRoleClassification,
                "fixtures.candidateRoleClassification",
            ),
            documentProjectionV3: fixturesRecord.documentProjectionV3,
            sourceSelectionPolicyIdentity: fixturesRecord.sourceSelectionPolicyIdentity,
            canonicalJsonIdentity: fixturesRecord.canonicalJsonIdentity,
            structuralContext: SEARCH_RERANK_STRUCTURAL_CONTEXT_POLICY,
            partialProjectionSemantics: SEARCH_RERANK_PARTIAL_PROJECTION_SEMANTICS,
        },
    };
    if (computeSearchRerankRequestContractSha256(manifest.fixtures) !== manifest.contractSha256) {
        throw new Error("Rerank request contract digest does not match its fixtures.");
    }
    return manifest;
}

export function resolveSearchRerankRequestContractAssetPath(): string {
    return path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "..",
        "..",
        SEARCH_RERANK_REQUEST_CONTRACT_ASSET_RELPATH,
    );
}

let cachedManifest: SearchRerankRequestContractManifest | null = null;

export function loadSearchRerankRequestContract(): SearchRerankRequestContractManifest {
    if (cachedManifest) return cachedManifest;
    const raw = JSON.parse(fs.readFileSync(resolveSearchRerankRequestContractAssetPath(), "utf8"));
    cachedManifest = parseSearchRerankRequestContract(raw);
    return cachedManifest;
}

export function resolveSearchRerankRequestIdentity(reranker: Reranker): SearchRerankRequestIdentityV1 {
    const identity = reranker.getIdentity();
    const queryProjectionIdentity = reranker.getQueryProjectionVersion?.()?.trim();
    const documentProjectionIdentity = reranker.getDocumentProjectionVersion?.()?.trim();
    return {
        provider: identity.provider,
        model: identity.model,
        profile: identity.profile,
        queryProjectionIdentity: queryProjectionIdentity || SEARCH_RERANK_QUERY_RAW_IDENTITY,
        documentProjectionIdentity: documentProjectionIdentity || SEARCH_RERANK_DOCUMENT_RAW_IDENTITY,
        requestContractSha256: loadSearchRerankRequestContract().contractSha256,
    };
}
