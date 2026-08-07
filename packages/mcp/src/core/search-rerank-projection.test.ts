import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
    buildSymbolRegistry,
    SYMBOL_REGISTRY_SCHEMA_VERSION,
    type SymbolRecord,
} from "@zokizuan/satori-core";
import { buildPublicationBoundSearchRerankDocumentV2 } from "./search-rerank-projection.js";

const source = [
    "export function owner() {",
    "  const first = prepare();",
    "  return execute(first);",
    "}",
].join("\n");
const fileHash = crypto.createHash("sha256").update(source, "utf8").digest("hex");
const owner: SymbolRecord = {
    symbolKey: "typescript:src/owner.ts:owner",
    symbolInstanceId: "symbol-owner",
    language: "typescript",
    kind: "function",
    name: "owner",
    qualifiedName: "owner",
    label: "owner",
    file: "src/owner.ts",
    span: { startLine: 1, endLine: 4 },
    parentQualifiedNamePath: [],
    fileHash,
    extractorVersion: "test",
};

function registry() {
    return buildSymbolRegistry({
        manifest: {
            schemaVersion: SYMBOL_REGISTRY_SCHEMA_VERSION,
            normalizedRootPath: "/repo",
            rootFingerprint: "fingerprint",
            indexPolicyHash: "policy",
            languageRouterVersion: "test",
            extractorVersion: "test",
            relationshipVersion: "test",
            builtAt: "2026-08-04T00:00:00.000Z",
            files: [{
                path: owner.file,
                hash: fileHash,
                language: "typescript",
                symbolCount: 1,
                definitionStatus: "definitions_present",
            }],
        },
        symbols: [owner],
    });
}

test("projection v2 uses a hash-matched owner-contained candidate span", async () => {
    const text = await buildPublicationBoundSearchRerankDocumentV2({
        codebaseRoot: "/repo",
        semanticQuery: "execute prepared request",
        result: {
            content: "return execute(first);",
            relativePath: owner.file,
            startLine: 2,
            endLine: 3,
            language: "typescript",
            score: 1,
            symbolKind: "function",
            symbolLabel: "owner",
            ownerSymbolInstanceId: owner.symbolInstanceId,
        },
        registry: registry(),
        readSourceEvidence: async () => ({
            canonicalRoot: "/repo",
            relativeFile: owner.file,
            sourceBytes: Buffer.from(source),
            source,
            observedHash: fileHash,
        }),
    });

    assert.ok(text);
    const projection = JSON.parse(text) as Record<string, unknown>;
    assert.equal(projection.canonical_symbol_label, "owner");
    assert.match(String(projection.query_relevant_source_excerpt), /execute/);
});

test("projection v2 fails closed for stale source or a span outside its owner", async () => {
    const base = {
        content: source,
        relativePath: owner.file,
        language: "typescript",
        score: 1,
        ownerSymbolInstanceId: owner.symbolInstanceId,
    };
    assert.equal(await buildPublicationBoundSearchRerankDocumentV2({
        codebaseRoot: "/repo",
        semanticQuery: "owner",
        result: { ...base, startLine: 1, endLine: 4 },
        registry: registry(),
        readSourceEvidence: async () => ({
            canonicalRoot: "/repo",
            relativeFile: owner.file,
            sourceBytes: Buffer.from(source),
            source,
            observedHash: "0".repeat(64),
        }),
    }), undefined);
    assert.equal(await buildPublicationBoundSearchRerankDocumentV2({
        codebaseRoot: "/repo",
        semanticQuery: "owner",
        result: { ...base, startLine: 1, endLine: 5 },
        registry: registry(),
        readSourceEvidence: async () => {
            throw new Error("must not read an invalid span");
        },
    }), undefined);
});

test("projection v2 fails closed without a registry owner", async () => {
    const base = {
        content: source,
        relativePath: owner.file,
        language: "typescript",
        score: 1,
        startLine: 1,
        endLine: 4,
    };
    const readSourceEvidence = async () => {
        throw new Error("must not read source without a registry owner");
    };
    assert.equal(await buildPublicationBoundSearchRerankDocumentV2({
        codebaseRoot: "/repo",
        semanticQuery: "owner",
        result: { ...base, ownerSymbolInstanceId: "symbol-missing" },
        registry: registry(),
        readSourceEvidence,
    }), undefined);
    assert.equal(await buildPublicationBoundSearchRerankDocumentV2({
        codebaseRoot: "/repo",
        semanticQuery: "owner",
        result: base,
        registry: registry(),
        readSourceEvidence,
    }), undefined);
});

test("projection v2 fails closed for absolute or owner-foreign paths", async () => {
    const base = {
        content: source,
        language: "typescript",
        score: 1,
        startLine: 1,
        endLine: 4,
        ownerSymbolInstanceId: owner.symbolInstanceId,
    };
    const readSourceEvidence = async () => {
        throw new Error("must not read source for a non-canonical path");
    };
    assert.equal(await buildPublicationBoundSearchRerankDocumentV2({
        codebaseRoot: "/repo",
        semanticQuery: "owner",
        result: { ...base, relativePath: "/repo/src/owner.ts" },
        registry: registry(),
        readSourceEvidence,
    }), undefined);
    assert.equal(await buildPublicationBoundSearchRerankDocumentV2({
        codebaseRoot: "/repo",
        semanticQuery: "owner",
        result: { ...base, relativePath: "src/other.ts" },
        registry: registry(),
        readSourceEvidence,
    }), undefined);
});
