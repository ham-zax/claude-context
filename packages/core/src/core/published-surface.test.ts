import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    collectPublishedSurface,
    type PublishedSurfaceSnapshot,
} from "./published-surface.js";

/**
 * Phase 8.1 — freezes the published Core package surface as a NAME set
 * (barrel export names + Context public member names). Regenerate
 * contracts/published-surface.json only under breaking-API authorization.
 */
test("published Core surface matches the frozen name set", () => {
    // tsx executes these tests as ESM; the CJS build typing does not apply.
    // @ts-expect-error TS1470: import.meta is available at test runtime under tsx.
    const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
    const fixturePath = path.resolve(moduleDirectory, "..", "..", "contracts", "published-surface.json");
    const frozen = JSON.parse(readFileSync(fixturePath, "utf8")) as PublishedSurfaceSnapshot;
    assert.deepEqual(collectPublishedSurface(), frozen);
});
