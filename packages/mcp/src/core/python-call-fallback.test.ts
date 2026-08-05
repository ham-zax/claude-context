import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
    SYMBOL_REGISTRY_SCHEMA_VERSION,
    buildSymbolRegistry,
    type RelationshipRecord,
    type SymbolRecord,
    type SymbolRegistryManifest,
} from "@zokizuan/satori-core";
import {
    buildSourceBackedPythonCallerFallback,
    repairSourceBackedPythonSpan,
} from "./python-call-fallback.js";

function testManifest(files: SymbolRegistryManifest['files']): SymbolRegistryManifest {
    return {
        schemaVersion: SYMBOL_REGISTRY_SCHEMA_VERSION,
        normalizedRootPath: '/repo',
        rootFingerprint: 'root-fingerprint',
        indexPolicyHash: 'policy-hash',
        languageRouterVersion: 'router-v1',
        extractorVersion: 'extractor-v1',
        relationshipVersion: 'relationship-v1',
        builtAt: '2026-06-17T00:00:00.000Z',
        files: files.map((file) => ({ ...file, definitionStatus: 'definitions_present' })),
    };
}

test("Python source repair fails closed without authorized source lines", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "satori-python-failclosed-"));
    const relativeFile = "src/example.py";
    const sourceFile = path.join(root, relativeFile);
    const source = [
        "@decorator",
        "def target():",
        "    return True",
        "",
    ].join("\n");
    const symbol: SymbolRecord = {
        symbolKey: "python:function:target",
        symbolInstanceId: "syminst_python_target",
        language: "python",
        kind: "function",
        name: "target",
        qualifiedName: "target",
        label: "function target()",
        file: relativeFile,
        span: { startLine: 2, endLine: 2 },
        parentQualifiedNamePath: [],
        fileHash: "indexed_hash",
        extractorVersion: "test",
    };
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, source, "utf8");

    try {
        // The file exists on disk, but no authorized source lines were
        // supplied: the repair must fail closed without reading the pathname.
        const repaired = repairSourceBackedPythonSpan({ codebaseRoot: root, symbol });
        assert.equal(repaired.attempted, false);
        assert.equal(repaired.validated, false);
        assert.equal(repaired.repaired, false);
        assert.deepEqual(repaired.symbol.span, { startLine: 2, endLine: 2 });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("Python source repair fails closed on a symlink escape even when lines are absent", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "satori-python-symlink-"));
    const secretFile = path.join(os.tmpdir(), `satori-python-secret-${process.pid}-${Date.now()}.py`);
    fs.writeFileSync(secretFile, "def target():\n    return 'SECRET-CONTENT'\n", "utf8");
    const relativeFile = "src/example.py";
    const sourceFile = path.join(root, relativeFile);
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.symlinkSync(secretFile, sourceFile);
    const symbol: SymbolRecord = {
        symbolKey: "python:function:target",
        symbolInstanceId: "syminst_python_target",
        language: "python",
        kind: "function",
        name: "target",
        qualifiedName: "target",
        label: "function target()",
        file: relativeFile,
        span: { startLine: 1, endLine: 1 },
        parentQualifiedNamePath: [],
        fileHash: "indexed_hash",
        extractorVersion: "test",
    };

    try {
        const repaired = repairSourceBackedPythonSpan({ codebaseRoot: root, symbol });
        assert.equal(repaired.attempted, false);
        assert.equal(repaired.validated, false);
        // No span repair may leak evidence derived from the escaped target.
        assert.deepEqual(repaired.symbol.span, { startLine: 1, endLine: 1 });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(secretFile, { force: true });
    }
});

test("Python source repair works from explicitly supplied authorized lines", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "satori-python-lines-"));
    const relativeFile = "src/example.py";
    const source = [
        "@decorator",
        "def target():",
        "    return True",
        "",
        "def next_symbol():",
        "    return False",
        "",
    ].join("\n");
    const symbol: SymbolRecord = {
        symbolKey: "python:function:target",
        symbolInstanceId: "syminst_python_target",
        language: "python",
        kind: "function",
        name: "target",
        qualifiedName: "target",
        label: "function target()",
        file: relativeFile,
        span: { startLine: 2, endLine: 2 },
        parentQualifiedNamePath: [],
        fileHash: "indexed_hash",
        extractorVersion: "test",
    };

    try {
        const repaired = repairSourceBackedPythonSpan({
            codebaseRoot: root,
            symbol,
            sourceLines: source.split("\n"),
        });
        assert.equal(repaired.validated, true);
        assert.equal(repaired.repaired, true);
        assert.deepEqual(repaired.symbol.span, { startLine: 1, endLine: 3 });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("Python source repair preserves stacked multiline decorators without absorbing a sibling", () => {
    const source = [
        "def previous():",
        "    return False",
        "",
        "@outer(",
        "    value=\"closing ) stays in the string\",",
        "    options={\"opening\": \"(\"},",
        ")",
        "@inner",
        "def target():",
        "    return True",
        "",
        "def next_symbol():",
        "    return False",
        "",
    ].join("\n");
    const symbol: SymbolRecord = {
        symbolKey: "python:function:target",
        symbolInstanceId: "syminst_python_target",
        language: "python",
        kind: "function",
        name: "target",
        qualifiedName: "target",
        label: "function target()",
        file: "src/example.py",
        span: { startLine: 9, endLine: 9 },
        parentQualifiedNamePath: [],
        fileHash: "indexed_hash",
        extractorVersion: "test",
    };

    const repaired = repairSourceBackedPythonSpan({
        codebaseRoot: "/repo",
        symbol,
        sourceLines: source.split("\n"),
    });
    assert.equal(repaired.validated, true);
    assert.equal(repaired.repaired, true);
    assert.deepEqual(repaired.symbol.span, { startLine: 4, endLine: 10 });
});

test("Python source repair does not absorb an unrelated decorator or comment", () => {
    const source = [
        "@decorator",
        "def previous():",
        "    return False",
        "",
        "# target remains undecorated",
        "def target():",
        "    return True",
        "",
    ].join("\n");
    const symbol: SymbolRecord = {
        symbolKey: "python:function:target",
        symbolInstanceId: "syminst_python_target",
        language: "python",
        kind: "function",
        name: "target",
        qualifiedName: "target",
        label: "function target()",
        file: "src/example.py",
        span: { startLine: 6, endLine: 6 },
        parentQualifiedNamePath: [],
        fileHash: "indexed_hash",
        extractorVersion: "test",
    };

    const repaired = repairSourceBackedPythonSpan({
        codebaseRoot: "/repo",
        symbol,
        sourceLines: source.split("\n"),
    });
    assert.equal(repaired.validated, true);
    assert.deepEqual(repaired.symbol.span, { startLine: 6, endLine: 7 });
});

test("caller fallback skips records whose authorized source is denied and leaks no call names", async () => {
    const target: SymbolRecord = {
        symbolKey: "python:function:target",
        symbolInstanceId: "syminst_target",
        language: "python",
        kind: "function",
        name: "target",
        qualifiedName: "target",
        label: "function target()",
        file: "src/target.py",
        span: { startLine: 1, endLine: 2 },
        parentQualifiedNamePath: [],
        fileHash: "indexed_hash",
        extractorVersion: "test",
    };
    const caller: SymbolRecord = {
        symbolKey: "python:function:caller",
        symbolInstanceId: "syminst_caller",
        language: "python",
        kind: "function",
        name: "caller",
        qualifiedName: "caller",
        label: "function caller()",
        file: "src/caller.py",
        span: { startLine: 1, endLine: 2 },
        parentQualifiedNamePath: [],
        fileHash: "indexed_hash",
        extractorVersion: "test",
    };
    const registry = buildSymbolRegistry({
        manifest: testManifest([
            { path: 'src/target.py', hash: 'indexed_hash', language: 'python', symbolCount: 1, definitionStatus: 'definitions_present' },
            { path: 'src/caller.py', hash: 'indexed_hash', language: 'python', symbolCount: 1, definitionStatus: 'definitions_present' },
        ]),
        symbols: [target, caller],
    });
    const suppressedRecords: RelationshipRecord[] = [{
        sourceKey: caller.symbolKey,
        sourceInstanceId: caller.symbolInstanceId,
        targetKey: target.symbolKey,
        targetInstanceId: target.symbolInstanceId,
        type: 'CALLS',
        file: 'src/caller.py',
        span: { startLine: 2, endLine: 2 },
        confidence: 'low',
    }];

    // The authorized reader denies every file (symlink escape / unpublished /
    // workspace-denied all surface as `undefined`). The fallback must produce
    // no edges and no symbols derived from unreadable source.
    const result = await buildSourceBackedPythonCallerFallback({
        codebaseRoot: "/repo",
        registry,
        resolvedTarget: target,
        suppressedRecords,
        sortEdges: (edges) => edges,
        sortNotes: (notes) => notes,
        readSourceLines: async () => undefined,
    });
    assert.deepEqual(result.edges, []);
    assert.deepEqual(result.symbols, []);
    assert.deepEqual(result.notes, []);
});
