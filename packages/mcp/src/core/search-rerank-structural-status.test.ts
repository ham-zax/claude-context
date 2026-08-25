import assert from "node:assert/strict";
import test from "node:test";
import { resolveSearchRerankStructuralContextStatus } from "./search-rerank-structural-status.js";

test("structural-context status distinguishes optional absence from incompatibility", () => {
    assert.equal(resolveSearchRerankStructuralContextStatus({ relationshipStatus: "ok" }), "available");
    assert.equal(resolveSearchRerankStructuralContextStatus({ relationshipStatus: "missing" }), "unavailable");
    assert.equal(resolveSearchRerankStructuralContextStatus({ relationshipStatus: "incompatible" }), "incompatible");
});
