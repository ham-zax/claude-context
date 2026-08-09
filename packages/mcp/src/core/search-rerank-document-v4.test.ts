import assert from "node:assert/strict";
import test from "node:test";
import {
    SEARCH_RERANK_DOCUMENT_V4_POLICY,
    buildSearchRerankDocumentV4,
} from "./search-rerank-document-v4.js";
import { buildSearchRerankDocumentV3 } from "./search-rerank-document-v3.js";
import type { SearchRerankStructuralReference } from "./search-rerank-structural-context.js";

const CONTENT = [
    "function validate_order(order) {",
    "    // shariah gate",
    "    return check_shariah_compliance(order);",
    "}",
    "",
    "function check_shariah_compliance(order) {",
    "    return order.risk_score > 0.8;",
    "}",
].join("\n");

function baseInput(overrides: Record<string, unknown> = {}) {
    return {
        relativePath: "src/veto.ts",
        language: "typescript",
        candidateRole: "implementation",
        symbolKind: "function",
        canonicalSymbolLabel: "validate_order",
        symbolSpan: { startLine: 1, endLine: 4 },
        content: CONTENT,
        query: "how does shariah compliance checking block trades",
        ...overrides,
    };
}

function ref(relation: SearchRerankStructuralReference["relation"], index: number): SearchRerankStructuralReference {
    return {
        repository_relative_path: `src/ref-${index}.ts`,
        canonical_symbol_label: `ref_symbol_${index}`,
        relation,
    };
}

test("v4 projection carries the answer-packet shape with bounded structural context", () => {
    const result = buildSearchRerankDocumentV4(baseInput({
        structuralContext: {
            directCallers: [ref("caller", 1), ref("caller", 2)],
            directCallees: [ref("callee", 3)],
            supportingTests: [ref("test_support", 4)],
        },
    }));
    assert.equal(result.version, "search_rerank_document_v4");
    assert.equal(result.utf8Bytes <= 4_000, true);
    const parsed = JSON.parse(result.text);
    assert.equal(parsed.repository_relative_path, "src/veto.ts");
    assert.equal(parsed.candidate_role, "implementation");
    assert.equal(parsed.symbol_kind, "function");
    assert.equal(parsed.canonical_symbol_label, "validate_order");
    assert.ok(parsed.signature_or_declaration.includes("function validate_order(order)"));
    assert.deepEqual(parsed.structural_context.direct_callers, [
        { repository_relative_path: "src/ref-1.ts", canonical_symbol_label: "ref_symbol_1", relation: "caller" },
        { repository_relative_path: "src/ref-2.ts", canonical_symbol_label: "ref_symbol_2", relation: "caller" },
    ]);
    assert.deepEqual(parsed.structural_context.direct_callees, [
        { repository_relative_path: "src/ref-3.ts", canonical_symbol_label: "ref_symbol_3", relation: "callee" },
    ]);
    assert.deepEqual(parsed.structural_context.supporting_tests, [
        { repository_relative_path: "src/ref-4.ts", canonical_symbol_label: "ref_symbol_4", relation: "test_support" },
    ]);
    assert.ok(parsed.query_relevant_source_excerpt.includes("check_shariah_compliance"));
});

test("v4 with empty structural context keeps declaration and primary source selection identical to v3", () => {
    const v3 = buildSearchRerankDocumentV3(baseInput());
    const v4 = buildSearchRerankDocumentV4(baseInput());
    assert.equal(v4.version, SEARCH_RERANK_DOCUMENT_V4_POLICY.id);
    const v3Parsed = JSON.parse(v3.text);
    const v4Parsed = JSON.parse(v4.text);
    assert.equal(
        v4Parsed.signature_or_declaration,
        v3Parsed.signature_or_declaration,
        "declaration selection must be identical to v3",
    );
    assert.ok(
        v4Parsed.query_relevant_source_excerpt.length > 0,
        "primary source selection must still run when structural context is empty",
    );
    assert.deepEqual(v4Parsed.structural_context, {
        direct_callers: [],
        direct_callees: [],
        supporting_tests: [],
    });
    assert.equal("documentation_excerpt" in v4Parsed, false);
    assert.equal("required_owner_siblings" in v4Parsed, false);
});

test("v4 stays within 4,000 UTF-8 bytes under a full structural context and truncates references before source", () => {
    const longLabel = "very_long_qualified_symbol_name_for_trade_veto_validation_flow_".repeat(8);
    const structuralContext = {
        directCallers: [1, 2, 3].map((index) => ({
            repository_relative_path: `src/deeply/nested/implementation/caller-${index}.ts`,
            canonical_symbol_label: `caller_${index}_${longLabel}`,
            relation: "caller" as const,
        })),
        directCallees: [4, 5, 6].map((index) => ({
            repository_relative_path: `src/deeply/nested/implementation/callee-${index}.ts`,
            canonical_symbol_label: `callee_${index}_${longLabel}`,
            relation: "callee" as const,
        })),
        supportingTests: [7, 8].map((index) => ({
            repository_relative_path: `tests/deeply/nested/supporting/test-${index}.test.ts`,
            canonical_symbol_label: `test_${index}_${longLabel}`,
            relation: "test_support" as const,
        })),
    };
    const result = buildSearchRerankDocumentV4(baseInput({
        structuralContext,
        content: Array.from({ length: 60 }, (_, index) => `line ${index}: export function worker_${index}() { return ${index}; }`).join("\n"),
        symbolSpan: { startLine: 1, endLine: 3 },
        canonicalSymbolLabel: "worker",
        query: "worker dispatch routing",
    }));
    assert.equal(result.utf8Bytes <= 4_000, true, `projection exceeded 4000 bytes: ${result.utf8Bytes}`);
    const parsed = JSON.parse(result.text);
    assert.ok(parsed.signature_or_declaration.length > 0, "mandatory declaration must survive truncation");
    const totalReferences = parsed.structural_context.direct_callers.length
        + parsed.structural_context.direct_callees.length
        + parsed.structural_context.supporting_tests.length;
    assert.ok(
        totalReferences <= 8,
        `reference lists must be truncatable (kept ${totalReferences} of 8)`,
    );
    assert.ok(
        result.structuralContextTruncated === true,
        "the stress fixture must have forced reference truncation",
    );
});

test("v4 rejects a mandatory projection that exceeds the byte budget even with zero references", () => {
    assert.throws(
        () => buildSearchRerankDocumentV4(baseInput({
            canonicalSymbolLabel: "x".repeat(4_000),
        })),
        /mandatory projection exceeds/,
    );
});

test("v4 keeps the same primary source excerpt when optional structural references fit beside it", () => {
    const content = Array.from(
        { length: 120 },
        (_, index) => `line ${index}: dispatch_trade_for_exact_question(${index});`,
    ).join("\n");
    const input = baseInput({
        content,
        symbolSpan: { startLine: 1, endLine: 120 },
        canonicalSymbolLabel: "dispatch_trade_for_exact_question",
        query: "dispatch trade exact question",
    });
    const withoutReferences = JSON.parse(buildSearchRerankDocumentV4(input).text);
    const longLabel = "proof_backed_call_path_".repeat(10);
    const withReferences = JSON.parse(buildSearchRerankDocumentV4({
        ...input,
        structuralContext: {
            directCallers: [1, 2, 3].map((index) => ({
                repository_relative_path: `src/callers/caller-${index}.ts`,
                canonical_symbol_label: `${longLabel}${index}`,
                relation: "caller" as const,
            })),
            directCallees: [1, 2, 3].map((index) => ({
                repository_relative_path: `src/callees/callee-${index}.ts`,
                canonical_symbol_label: `${longLabel}${index}`,
                relation: "callee" as const,
            })),
            supportingTests: [1, 2].map((index) => ({
                repository_relative_path: `tests/support-${index}.test.ts`,
                canonical_symbol_label: `${longLabel}${index}`,
                relation: "test_support" as const,
            })),
        },
    }).text);
    assert.equal(
        withReferences.query_relevant_source_excerpt,
        withoutReferences.query_relevant_source_excerpt,
        "optional references must never shrink a valid source-first excerpt",
    );
});

test("v4 normalizes only role-valid, relation-aligned, bounded structural references", () => {
    assert.throws(
        () => buildSearchRerankDocumentV4(baseInput({ candidateRole: "preference" })),
        /candidateRole must be a valid SearchCandidateRole/,
    );
    assert.throws(
        () => buildSearchRerankDocumentV4(baseInput({
            structuralContext: {
                directCallers: [ref("callee", 1)],
            },
        })),
        /directCallers\[0\]\.relation must be caller/,
    );
    assert.throws(
        () => buildSearchRerankDocumentV4(baseInput({ unexpected: true })),
        /unknown key unexpected/,
    );
    const parsed = JSON.parse(buildSearchRerankDocumentV4(baseInput({
        structuralContext: {
            directCallers: [4, 1, 2, 3].map((index) => ref("caller", index)),
        },
    })).text);
    assert.deepEqual(
        parsed.structural_context.direct_callers.map((entry: { repository_relative_path: string }) => entry.repository_relative_path),
        ["src/ref-1.ts", "src/ref-2.ts", "src/ref-3.ts"],
        "direct callers are sorted and capped by the projection contract",
    );
});

