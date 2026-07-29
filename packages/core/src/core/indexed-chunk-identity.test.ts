import assert from "node:assert/strict";
import test from "node:test";
import { buildIndexedChunkId } from "./indexed-chunk-identity";

test("buildIndexedChunkId binds path, ordinal, byte span, line span, and content", () => {
    const chunk = {
        content: "export const value = 1;",
        metadata: {
            language: "typescript",
            startLine: 1,
            endLine: 1,
            startByte: 0,
            endByte: 23,
        },
    };
    const baseline = buildIndexedChunkId("src/value.ts", chunk, 0);

    assert.match(baseline, /^chunk_[0-9a-f]{16}$/);
    assert.notEqual(buildIndexedChunkId("src/other.ts", chunk, 0), baseline);
    assert.notEqual(buildIndexedChunkId("src/value.ts", chunk, 1), baseline);
    assert.notEqual(
        buildIndexedChunkId(
            "src/value.ts",
            { ...chunk, content: "export const value = 2;" },
            0,
        ),
        baseline,
    );
});
