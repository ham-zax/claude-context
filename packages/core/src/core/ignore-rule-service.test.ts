import test from "node:test";
import assert from "node:assert/strict";
import { IgnoreRuleService } from "./ignore-rule-service.js";

function createService(): IgnoreRuleService {
    return new IgnoreRuleService({
        basePatterns: ["node_modules/**", "dist/**"],
        canonicalizeCodebasePath: (codebasePath) => codebasePath,
        resolveCollectionName: (codebasePath) => codebasePath,
        ensureRuntimePolicyLoaded: () => {},
    });
}

test("getMatcher reuses the compiled matcher while patterns are unchanged", () => {
    const service = createService();
    const first = service.getMatcher("/repo");
    const second = service.getMatcher("/repo");
    assert.equal(second, first);
});

test("setFileBasedPatterns invalidates the compiled matcher", () => {
    const service = createService();
    const first = service.getMatcher("/repo");
    service.setFileBasedPatterns("/repo", ["generated/**"]);
    const second = service.getMatcher("/repo");
    assert.notEqual(second, first);
    assert.equal(second.ignores("generated/artifact.ts"), true);
    assert.equal(second.ignores("node_modules/pkg/index.ts"), true);
});
