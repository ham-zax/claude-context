import test from "node:test";
import assert from "node:assert/strict";
import { resolveSearchCandidateRole } from "./search-candidate-role.js";
import type { SearchCandidateRole } from "./search-candidate-role.js";

const cases: ReadonlyArray<readonly [
    { relativePath: string; language?: string; symbolKind?: string },
    SearchCandidateRole,
]> = [
    [{ relativePath: "tests/test_trade_veto.py", language: "python" }, "test"],
    [{ relativePath: "src/veto/veto.test.ts", language: "typescript" }, "test"],
    [{ relativePath: "packages/mcp/src/core/handlers.spec.ts" }, "test"],
    [{ relativePath: "docs/architecture.md" }, "documentation"],
    [{ relativePath: "documentation/reranker.rst" }, "documentation"],
    [{ relativePath: "src/core/search-ranking.ts", language: "typescript" }, "implementation"],
    [{ relativePath: "src/runtime/scheduler.py", language: "python" }, "implementation"],
    [{ relativePath: "scripts/build-index.mjs" }, "implementation"],
    [{ relativePath: "tools/adapters/lateon.ts" }, "implementation"],
    [{ relativePath: "src/index.ts" }, "implementation"],
    [{ relativePath: "config/settings.json", language: "json" }, "configuration"],
    [{ relativePath: "deploy/values.yaml" }, "configuration"],
    [{ relativePath: "Dockerfile" }, "configuration"],
    [{ relativePath: "app.env" }, "configuration"],
    [{ relativePath: "src/runtime/limits.ts", symbolKind: "config" }, "configuration"],
    [{ relativePath: "settings", language: "toml" }, "configuration"],
    [{ relativePath: "dist/bundle.min.js" }, "generated"],
    [{ relativePath: "src/generated/types.ts" }, "generated"],
    [{ relativePath: "data/fixtures/orders.json" }, "fixture"],
    [{ relativePath: "tests/fixtures/positions.json" }, "test"],
    [{ relativePath: "examples/basic_usage.py", language: "python" }, "example"],
    [{ relativePath: "samples/demo.ts" }, "example"],
    [{ relativePath: "reports/render-trace.bin" }, "unknown"],
    [{ relativePath: "satori-landing/assets/hero.dat" }, "unknown"],
];

for (const [input, expected] of cases) {
    test(`candidate-role classifies ${input.relativePath} as ${expected}`, () => {
        assert.equal(resolveSearchCandidateRole(input), expected);
    });
}

test("candidate-role priority prefers tests over configuration and documentation", () => {
    assert.equal(
        resolveSearchCandidateRole({ relativePath: "tests/config/settings.test.json" }),
        "test",
    );
});

test("candidate-role priority prefers documentation over configuration", () => {
    assert.equal(
        resolveSearchCandidateRole({ relativePath: "docs/config-guide.md" }),
        "documentation",
    );
});

test("candidate-role classification is deterministic for repeated input", () => {
    const input = { relativePath: "src/core/search-ranking.ts", language: "typescript" };
    assert.equal(resolveSearchCandidateRole(input), resolveSearchCandidateRole(input));
});
