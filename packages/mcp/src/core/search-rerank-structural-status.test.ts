import assert from "node:assert/strict";
import test from "node:test";
import { resolveSearchRerankStructuralContextStatus } from "./search-rerank-structural-status.js";

const expectedRelationshipManifestHash = "a".repeat(64);

test("structural-context status distinguishes optional absence from incompatibility", () => {
    assert.equal(resolveSearchRerankStructuralContextStatus({
        relationshipStatus: "ok",
        relationshipManifestHash: expectedRelationshipManifestHash,
        expectedRelationshipManifestHash,
    }), "available");
    assert.equal(resolveSearchRerankStructuralContextStatus({
        relationshipStatus: "missing",
        expectedRelationshipManifestHash,
    }), "unavailable");
    assert.equal(resolveSearchRerankStructuralContextStatus({
        relationshipStatus: "incompatible",
        expectedRelationshipManifestHash,
    }), "incompatible");
    assert.equal(resolveSearchRerankStructuralContextStatus({
        relationshipStatus: "ok",
        relationshipManifestHash: "b".repeat(64),
        expectedRelationshipManifestHash,
    }), "incompatible");
});
