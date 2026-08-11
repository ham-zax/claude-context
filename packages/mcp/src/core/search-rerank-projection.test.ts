import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
    buildSymbolRegistry,
    SYMBOL_REGISTRY_SCHEMA_VERSION,
    type SymbolRecord,
} from "@zokizuan/satori-core";
import type { CurrentSourceEvidence } from "./current-source-symbols.js";
import { SEARCH_RERANK_DOCUMENT_V2_POLICY } from "./search-rerank-document-v2.js";
import { SEARCH_RERANK_DOCUMENT_V3_POLICY } from "./search-rerank-document-v3.js";
import type { SearchResultLike } from "./search-lexical-scoring.js";
import {
    buildPublicationBoundSearchRerankDocumentV2,
    projectPublicationBoundSearchRerankDocumentV2,
    projectPublicationBoundSearchRerankDocumentV3,
    projectPublicationBoundSearchRerankDocumentV4,
    searchRerankCandidateId,
} from "./search-rerank-projection.js";

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

const candidateId = searchRerankCandidateId({
    relativePath: owner.file,
    startLine: 1,
    endLine: 4,
});

function ownedResult(overrides: Partial<SearchResultLike> = {}): SearchResultLike {
    return {
        content: source,
        relativePath: owner.file,
        language: "typescript",
        score: 1,
        startLine: 1,
        endLine: 4,
        ownerSymbolInstanceId: owner.symbolInstanceId,
        ...overrides,
    };
}

function evidence(overrides: Partial<CurrentSourceEvidence> = {}): CurrentSourceEvidence {
    return {
        canonicalRoot: "/repo",
        relativeFile: owner.file,
        sourceBytes: Buffer.from(source),
        source,
        observedHash: fileHash,
        ...overrides,
    };
}

test("typed projection reports owner_not_found without a resolvable registry owner", async () => {
    const readSourceEvidence = async () => {
        throw new Error("must not read source without a registry owner");
    };
    for (const result of [
        ownedResult({ ownerSymbolInstanceId: undefined }),
        ownedResult({ ownerSymbolInstanceId: "symbol-missing" }),
        ownedResult({ relativePath: "src/other.ts" }),
    ]) {
        assert.deepEqual(await projectPublicationBoundSearchRerankDocumentV2({
            candidateId,
            codebaseRoot: "/repo",
            semanticQuery: "owner",
            result,
            registry: registry(),
            readSourceEvidence,
        }), { ok: false, candidateId, reason: "owner_not_found" });
    }
});

test("typed projection reports candidate_span_invalid for a span outside its owner", async () => {
    const readSourceEvidence = async () => {
        throw new Error("must not read an invalid span");
    };
    for (const span of [
        { startLine: 1, endLine: 5 },
        { startLine: 0, endLine: 4 },
        { startLine: 3, endLine: 2 },
    ]) {
        assert.deepEqual(await projectPublicationBoundSearchRerankDocumentV2({
            candidateId,
            codebaseRoot: "/repo",
            semanticQuery: "owner",
            result: ownedResult(span),
            registry: registry(),
            readSourceEvidence,
        }), { ok: false, candidateId, reason: "candidate_span_invalid" });
    }
});

test("typed projection reports source_unavailable when the evidence read fails", async () => {
    const base = {
        candidateId,
        codebaseRoot: "/repo",
        semanticQuery: "owner",
        result: ownedResult(),
        registry: registry(),
    };
    assert.deepEqual(await projectPublicationBoundSearchRerankDocumentV2({
        ...base,
        readSourceEvidence: async () => undefined,
    }), { ok: false, candidateId, reason: "source_unavailable" });
    assert.deepEqual(await projectPublicationBoundSearchRerankDocumentV2({
        ...base,
        readSourceEvidence: async () => {
            throw new Error("read failed");
        },
    }), { ok: false, candidateId, reason: "source_unavailable" });
});

test("typed projection reports source_hash_mismatch for stale or foreign evidence", async () => {
    const base = {
        candidateId,
        codebaseRoot: "/repo",
        semanticQuery: "owner",
        result: ownedResult(),
        registry: registry(),
    };
    assert.deepEqual(await projectPublicationBoundSearchRerankDocumentV2({
        ...base,
        readSourceEvidence: async () => evidence({ observedHash: "0".repeat(64) }),
    }), { ok: false, candidateId, reason: "source_hash_mismatch" });
    assert.deepEqual(await projectPublicationBoundSearchRerankDocumentV2({
        ...base,
        readSourceEvidence: async () => evidence({ relativeFile: "src/other.ts" }),
    }), { ok: false, candidateId, reason: "source_hash_mismatch" });
});

test("typed projection enforces the configured source limit on small-file evidence", async () => {
    assert.deepEqual(await projectPublicationBoundSearchRerankDocumentV2({
        candidateId,
        codebaseRoot: "/repo",
        semanticQuery: "owner",
        result: ownedResult(),
        registry: registry(),
        maxSourceBytes: Buffer.byteLength(source, "utf8") - 1,
        readSourceEvidence: async () => evidence(),
    }), {
        ok: false,
        candidateId,
        reason: "source_exceeds_projection_limit",
    });
});

test("typed projection reports projection_contract_failed when the v2 contract throws", async () => {
    const outcome = await projectPublicationBoundSearchRerankDocumentV2({
        candidateId,
        codebaseRoot: "/repo",
        semanticQuery: "owner",
        result: ownedResult(),
        registry: registry(),
        readSourceEvidence: async () => evidence({ source: "short" }),
    });
    assert.deepEqual(outcome, {
        ok: false,
        candidateId,
        reason: "projection_contract_failed",
    });
});

test("typed projection success carries bounded provenance fields", async () => {
    const outcome = await projectPublicationBoundSearchRerankDocumentV2({
        candidateId,
        codebaseRoot: "/repo",
        semanticQuery: "execute prepared request",
        result: ownedResult({ startLine: 2, endLine: 3 }),
        registry: registry(),
        readSourceEvidence: async () => evidence(),
    });
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.match(outcome.document, /execute/);
    assert.equal(outcome.utf8Bytes, Buffer.byteLength(outcome.document, "utf8"));
    assert.equal(
        outcome.sha256,
        crypto.createHash("sha256").update(outcome.document, "utf8").digest("hex"),
    );
    assert.equal(outcome.candidateRole, "unknown");
    assert.equal(outcome.projectionIdentity, SEARCH_RERANK_DOCUMENT_V2_POLICY.id);
});

test("typed v3 projection carries the factual candidate role and v3 identity", async () => {
    const outcome = await projectPublicationBoundSearchRerankDocumentV3({
        candidateId,
        codebaseRoot: "/repo",
        semanticQuery: "execute prepared request",
        result: ownedResult({ startLine: 2, endLine: 3 }),
        registry: registry(),
        readSourceEvidence: async () => evidence(),
    });
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.candidateRole, "implementation");
    assert.equal(outcome.projectionIdentity, SEARCH_RERANK_DOCUMENT_V3_POLICY.id);
    assert.equal(
        (JSON.parse(outcome.document) as Record<string, unknown>).candidate_role,
        "implementation",
    );
    assert.equal(outcome.utf8Bytes, Buffer.byteLength(outcome.document, "utf8"));
    assert.equal(
        outcome.sha256,
        crypto.createHash("sha256").update(outcome.document, "utf8").digest("hex"),
    );
});

test("typed v3 projection fails closed like v2 without a registry owner", async () => {
    assert.deepEqual(await projectPublicationBoundSearchRerankDocumentV3({
        candidateId,
        codebaseRoot: "/repo",
        semanticQuery: "owner",
        result: ownedResult({ ownerSymbolInstanceId: "symbol-missing" }),
        registry: registry(),
        readSourceEvidence: async () => {
            throw new Error("must not read source without a registry owner");
        },
    }), { ok: false, candidateId, reason: "owner_not_found" });
});


test("typed v4 projection keeps publication-bound source evidence when structural context is unavailable", async () => {
    const outcome = await projectPublicationBoundSearchRerankDocumentV4({
        candidateId,
        codebaseRoot: "/repo",
        semanticQuery: "execute prepared request",
        result: ownedResult({ startLine: 2, endLine: 3 }),
        registry: registry(),
        structuralContextStatus: "unavailable",
        readSourceEvidence: async () => evidence(),
    });
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.structuralContextStatus, "unavailable");
    assert.deepEqual(
        (JSON.parse(outcome.document) as { structural_context: unknown }).structural_context,
        { direct_callers: [], direct_callees: [], supporting_tests: [] },
    );
});

test("typed v4 projection defaults missing structural preparation to unavailable", async () => {
    const outcome = await projectPublicationBoundSearchRerankDocumentV4({
        candidateId,
        codebaseRoot: "/repo",
        semanticQuery: "execute prepared request",
        result: ownedResult({ startLine: 2, endLine: 3 }),
        registry: registry(),
        readSourceEvidence: async () => evidence(),
    });
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    assert.equal(outcome.structuralContextStatus, "unavailable");
});

test("typed v4 projection distinguishes explicit empty relationships from incompatible authority", async () => {
    const common = {
        candidateId,
        codebaseRoot: "/repo",
        semanticQuery: "execute prepared request",
        result: ownedResult({ startLine: 2, endLine: 3 }),
        registry: registry(),
        readSourceEvidence: async () => evidence(),
    };
    const available = await projectPublicationBoundSearchRerankDocumentV4({
        ...common,
        relationships: [],
    });
    assert.equal(available.ok, true);
    if (available.ok) assert.equal(available.structuralContextStatus, "available");

    const incompatible = await projectPublicationBoundSearchRerankDocumentV4({
        ...common,
        structuralContextStatus: "incompatible",
    });
    assert.equal(incompatible.ok, true);
    if (incompatible.ok) assert.equal(incompatible.structuralContextStatus, "incompatible");
});

function createLargeProjectionFixture(lineEnding: "\n" | "\r") {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "satori-large-rerank-projection-"));
    const relativeFile = "src/large-owner.ts";
    const absoluteFile = path.join(root, relativeFile);
    const prefixLines = Array.from({ length: 3_000 }, (_, index) => (
        `// padding ${String(index).padStart(4, "0")} ${"x".repeat(90)}`
    ));
    const ownerLines = [
        "export function largeOwner() {",
        "  return executeLargeOwner();",
        "}",
    ];
    const largeSource = [...prefixLines, ...ownerLines].join(lineEnding);
    const largeHash = crypto.createHash("sha256").update(largeSource, "utf8").digest("hex");
    const largeOwner: SymbolRecord = {
        symbolKey: `${relativeFile}:largeOwner`,
        symbolInstanceId: "large-owner-instance",
        language: "typescript",
        kind: "function",
        name: "largeOwner",
        qualifiedName: "largeOwner",
        label: "largeOwner",
        file: relativeFile,
        span: { startLine: 3_001, endLine: 3_003 },
        parentQualifiedNamePath: [],
        fileHash: largeHash,
        extractorVersion: "test",
    };

    fs.mkdirSync(path.dirname(absoluteFile), { recursive: true });
    fs.writeFileSync(absoluteFile, largeSource, "utf8");
    assert.ok(fs.statSync(absoluteFile).size > 256 * 1024);
    const largeRegistry = buildSymbolRegistry({
        manifest: {
            schemaVersion: SYMBOL_REGISTRY_SCHEMA_VERSION,
            normalizedRootPath: root,
            rootFingerprint: "fingerprint",
            indexPolicyHash: "policy",
            languageRouterVersion: "test",
            extractorVersion: "test",
            relationshipVersion: "test",
            builtAt: "2026-08-10T00:00:00.000Z",
            files: [{
                path: relativeFile,
                hash: largeHash,
                language: "typescript",
                symbolCount: 1,
                definitionStatus: "definitions_present",
            }],
        },
        symbols: [largeOwner],
    });
    const largeResult: SearchResultLike = {
        content: ownerLines.join("\n"),
        relativePath: relativeFile,
        language: "typescript",
        score: 1,
        startLine: 3_001,
        endLine: 3_003,
        symbolKind: "function",
        symbolLabel: "largeOwner",
        ownerSymbolInstanceId: largeOwner.symbolInstanceId,
    };
    return {
        root,
        absoluteFile,
        common: {
            candidateId: searchRerankCandidateId(largeResult),
            codebaseRoot: root,
            semanticQuery: "execute large owner",
            result: largeResult,
            registry: largeRegistry,
        },
    };
}

test("publication-bound v2 v3 and v4 retain large LF source through a bounded window", async () => {
    const { root, common } = createLargeProjectionFixture("\n");
    try {
        for (const project of [
            projectPublicationBoundSearchRerankDocumentV2,
            projectPublicationBoundSearchRerankDocumentV3,
            projectPublicationBoundSearchRerankDocumentV4,
        ]) {
            const outcome = await project(common);
            assert.equal(outcome.ok, true, JSON.stringify(outcome));
            if (outcome.ok) assert.match(outcome.document, /executeLargeOwner/);
        }
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("publication-bound v4 uses universal newlines without changing historical v2/v3 semantics", async () => {
    // Bare CR binds universal-newline handling across the streamed fallback
    // and the current v4 selector. Historical v2/v3 profiles retain their
    // byte-frozen LF-only selector semantics.
    const { root, absoluteFile, common } = createLargeProjectionFixture("\r");
    try {
        for (const project of [
            projectPublicationBoundSearchRerankDocumentV2,
            projectPublicationBoundSearchRerankDocumentV3,
        ]) {
            const outcome = await project(common);
            assert.deepEqual(outcome, {
                ok: false,
                candidateId: common.candidateId,
                reason: "projection_contract_failed",
            });
        }

        const v4Outcome = await projectPublicationBoundSearchRerankDocumentV4(common);
        assert.equal(v4Outcome.ok, true, JSON.stringify(v4Outcome));
        if (v4Outcome.ok) assert.match(v4Outcome.document, /executeLargeOwner/);

        assert.deepEqual(await projectPublicationBoundSearchRerankDocumentV4({
            ...common,
            maxSourceBytes: 256 * 1024,
        }), {
            ok: false,
            candidateId: common.candidateId,
            reason: "source_exceeds_projection_limit",
        });

        fs.appendFileSync(absoluteFile, "\r// changed after publication", "utf8");
        assert.deepEqual(await projectPublicationBoundSearchRerankDocumentV4(common), {
            ok: false,
            candidateId: common.candidateId,
            reason: "source_hash_mismatch",
        });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
