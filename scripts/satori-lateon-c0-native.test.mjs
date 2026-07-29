import assert from "node:assert/strict";
import test from "node:test";
import {
    maxSimScore,
    normalizeVector,
} from "./satori-lateon-c0-native.mjs";

test("normalizeVector returns an L2-normalized vector", () => {
    assert.deepEqual(normalizeVector([3, 4]), [0.6, 0.8]);
});

test("normalizeVector rejects a zero vector", () => {
    assert.throws(() => normalizeVector([0, 0]), /non-normalizable/);
});

test("maxSimScore sums each query token's best document match", () => {
    assert.equal(
        maxSimScore(
            [
                [1, 0],
                [0, 1],
            ],
            [
                [0.8, 0.2],
                [0.1, 0.9],
            ],
        ),
        1.7000000000000002,
    );
});
