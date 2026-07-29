import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CliError } from "./errors.js";
import {
    managedRuntimeClosureMatches,
    resolveLanceDbNativePackage,
    writeManagedRuntimeClosureManifest,
} from "./managed-runtime-closure.js";

test("resolves the exact WSL Linux GNU LanceDB native package", () => {
    assert.equal(
        resolveLanceDbNativePackage({
            vectorStore: "LanceDB",
            platform: "linux",
            architecture: "x64",
            libc: "gnu",
        }),
        "@lancedb/lancedb-linux-x64-gnu@0.31.0",
    );
});

test("resolves supported Linux musl and Windows architectures deterministically", () => {
    assert.equal(
        resolveLanceDbNativePackage({
            vectorStore: "LanceDB",
            platform: "linux",
            architecture: "arm64",
            libc: "musl",
        }),
        "@lancedb/lancedb-linux-arm64-musl@0.31.0",
    );
    assert.equal(
        resolveLanceDbNativePackage({
            vectorStore: "LanceDB",
            platform: "win32",
            architecture: "x64",
        }),
        "@lancedb/lancedb-win32-x64-msvc@0.31.0",
    );
});

test("rejects a platform without a published LanceDB native closure", () => {
    assert.throws(
        () => resolveLanceDbNativePackage({
            vectorStore: "LanceDB",
            platform: "darwin",
            architecture: "x64",
        }),
        (error: unknown) => (
            error instanceof CliError
            && error.token === "E_USAGE"
            && /unsupported on darwin\/x64/.test(error.message)
        ),
    );
});

test("runtime closure manifest distinguishes slim LanceDB and Milvus installs", () => {
    const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "satori-runtime-closure-"));
    try {
        const lanceDbClosure = {
            vectorStore: "LanceDB" as const,
            platform: "linux" as const,
            architecture: "x64",
            libc: "gnu" as const,
        };
        assert.equal(managedRuntimeClosureMatches(runtimeRoot, lanceDbClosure), false);

        writeManagedRuntimeClosureManifest(runtimeRoot, lanceDbClosure);

        assert.equal(managedRuntimeClosureMatches(runtimeRoot, lanceDbClosure), true);
        assert.equal(managedRuntimeClosureMatches(runtimeRoot, {
            ...lanceDbClosure,
            vectorStore: "Milvus",
        }), false);
    } finally {
        fs.rmSync(runtimeRoot, { recursive: true, force: true });
    }
});
