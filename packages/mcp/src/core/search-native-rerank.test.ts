import assert from "node:assert/strict";
import test from "node:test";
import {
    applyNativeRerankToSelectedSlots,
    validateNativeRerankResults,
} from "./search-native-rerank.js";

test("validates complete native reranker order and retains scores", () => {
    const result = validateNativeRerankResults({
        candidateIds: ["a", "b", "c"],
        results: [
            { index: 2, relevanceScore: 0.91 },
            { index: 0, relevanceScore: 0.62 },
            { index: 1, relevanceScore: 0.14 },
        ],
    });
    assert.deepEqual(result, [
        { candidateId: "c", originalIndex: 2, providerRank: 1, relevanceScore: 0.91 },
        { candidateId: "a", originalIndex: 0, providerRank: 2, relevanceScore: 0.62 },
        { candidateId: "b", originalIndex: 1, providerRank: 3, relevanceScore: 0.14 },
    ]);
});

test("rejects malformed native reranker responses", () => {
    const cases: Array<{ name: string; results: Array<{ index: number; relevanceScore: number }>; code: string }> = [
        { name: "count mismatch", results: [{ index: 0, relevanceScore: 1 }], code: "native_rerank_result_count_mismatch" },
        { name: "duplicate index", results: [{ index: 0, relevanceScore: 1 }, { index: 0, relevanceScore: 0.5 }], code: "native_rerank_result_duplicate_index" },
        { name: "foreign index", results: [{ index: 0, relevanceScore: 1 }, { index: 2, relevanceScore: 0.5 }], code: "native_rerank_result_index_invalid" },
        { name: "NaN score", results: [{ index: 0, relevanceScore: Number.NaN }, { index: 1, relevanceScore: 0.5 }], code: "native_rerank_result_non_finite_score" },
        { name: "infinite score", results: [{ index: 0, relevanceScore: Number.POSITIVE_INFINITY }, { index: 1, relevanceScore: 0.5 }], code: "native_rerank_result_non_finite_score" },
    ];
    for (const current of cases) {
        assert.throws(
            () => validateNativeRerankResults({ candidateIds: ["a", "b"], results: current.results }),
            new RegExp(current.code),
            current.name,
        );
    }
    assert.throws(
        () => validateNativeRerankResults({ candidateIds: ["a", "a"], results: [{ index: 0, relevanceScore: 1 }, { index: 1, relevanceScore: 0.5 }] }),
        /native_rerank_candidate_ids_invalid/,
    );
});

test("reorders only selected slots and never mutates input", () => {
    const all = ["x", "a", "y", "b", "c", "z"];
    const ordered = validateNativeRerankResults({
        candidateIds: ["a", "b", "c"],
        results: [
            { index: 2, relevanceScore: 0.9 },
            { index: 0, relevanceScore: 0.8 },
            { index: 1, relevanceScore: 0.7 },
        ],
    });
    assert.deepEqual(applyNativeRerankToSelectedSlots({
        allCandidates: all,
        selectedCandidateIds: ["a", "b", "c"],
        orderedItems: ordered,
        identify: (value) => value,
    }), ["x", "c", "y", "a", "b", "z"]);
    assert.deepEqual(all, ["x", "a", "y", "b", "c", "z"]);
});

test("rejects foreign, duplicate, and incomplete applied identities", () => {
    const valid = validateNativeRerankResults({
        candidateIds: ["a", "b"],
        results: [{ index: 1, relevanceScore: 0.9 }, { index: 0, relevanceScore: 0.8 }],
    });
    assert.throws(() => applyNativeRerankToSelectedSlots({
        allCandidates: ["a", "b"],
        selectedCandidateIds: ["a", "b"],
        orderedItems: [{ ...valid[0]!, candidateId: "foreign" }, valid[1]!],
        identify: (value) => value,
    }), /native_rerank_result_foreign_candidate/);
    assert.throws(() => applyNativeRerankToSelectedSlots({
        allCandidates: ["a", "b"],
        selectedCandidateIds: ["a", "b"],
        orderedItems: [valid[0]!, { ...valid[0]! }],
        identify: (value) => value,
    }), /native_rerank_result_duplicate_candidate/);
});
