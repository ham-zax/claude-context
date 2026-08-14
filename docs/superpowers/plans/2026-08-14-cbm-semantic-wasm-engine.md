# Language Intelligence Spine & CBM-Derived Semantic WASM Engine Implementation Plan (Final)

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Implement task-by-task with review checkpoints. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a modular, provider-driven Language Intelligence Spine in Satori Core (Phase A: zero-behavior-change refactor), then integrate an isolated WebAssembly-compiled C semantic resolution engine adapted from `DeusData/codebase-memory-mcp` (pinned to commit `d150ebe4fc78a9a3f85013d2087a849e5d59eb0f`), delivering Go `calls_v0` caller/callee navigation and a stable, pluggable foundation for future non-Python languages (Phase B).

**Architecture:** 
1. **Python Invariant**: Satori's mature 78KB native Python engine (`python-resolution.ts`) remains 100% authoritative and completely unchanged. CBM/WASM is explicitly disabled for Python (`supportsLanguage('python') === false`).
2. **Unified Generation Ownership**: `IndexGenerationWorkflow` owns both full and incremental relationship building. Full indexing invokes the async `SemanticProjectAnalyzer` port and stages relationships, matching incremental delta construction across all staging and repair paths.
3. **Structured Contribution Contract**: Phase A wraps legacy Python and Syntactic engines via `CallResolutionContribution { records, claimsByFile? }` preserving their exact authority and record/claim materialization semantics without rewriting Python.
4. **Provider-Neutral Semantic Evidence & Central Builder Admission**: The native WASM engine produces raw `SemanticResolvedOccurrence`s carrying call spans, target definition provenance, and structured proof primitives. It knows nothing about Satori's `SymbolRegistry` or relationship authority. `GoResolutionProvider` constructs `ResolutionClaim`s, and `admitResolvedCallClaims()` in the relationship builder validates definitions against `SymbolRegistry` and admits `CALLS` edges.
5. **Exact Source Snapshot, `go.mod` & `go.work` Freshness**: Semantic analysis binds to exact source strings and mandatory source hashes. `go.mod` and `go.work` are included in the authoritative observed source set via exact-filename indexing rules.
6. **Committed WASM Runtime & Digest Verification**: CBM's native C Go resolver is compiled to a portable WebAssembly binary (`satori-semantic-engine.wasm`) via pinned Emscripten (3.1.64) and committed directly to `packages/core/assets/semantic-engine/` alongside `semantic-engine.manifest.json` and third-party notices. Standard builds (`clean + tsc`) and `release:check` require no Emscripten; a source-digest check enforces WASM freshness against C source changes.

**Tech stack:** TypeScript 6.x, Node.js >= 22.13, C11, Tree-sitter C runtime, Emscripten / WebAssembly (`node` target, modularized), `@zokizuan/satori-core`.

---

## Target Architecture

```text
                                 INDEX GENERATION WORKFLOW
                                (Full & Incremental Sync)
                                            │
               ┌────────────────────────────┴────────────────────────────┐
               ▼                                                         ▼
     Structural Analysis                                       Semantic Project Analysis
    (LanguageAnalysisPort)                                     (SemanticProjectAnalyzer)
    [Exact Source Snapshot]                                     [Exact SAME Snapshot]
               │                                                         │
               ▼                                                         ▼
       SyntacticEvidence                                         SemanticEvidence
    (CallSites, ModuleBindings)                           (SemanticResolvedOccurrence[])
               │                                                         │
               └────────────────────────────┬────────────────────────────┘
                                            ▼
                              RESOLUTION STRATEGY REGISTRY
                  (Canonical Language IDs: python, javascript, typescript, go)
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               ▼                            ▼                            ▼
     Python Legacy Engine         Syntactic Legacy Engine       GoResolutionProvider
  (python-resolution.ts 100%)       (JS/TS direct calls)     (SemanticEvidence + SymbolRegistry)
    [records + claimsByFile]          [records + TESTS]              [claimsByFile]
               │                            │                            │
               └────────────────────────────┼────────────────────────────┘
                                            ▼
                                  RELATIONSHIP BUILDER
                               admitResolvedCallClaims()
                       (Target Definition Provenance Lookup &
                        Ambiguity Resolution against SymbolRegistry)
                                            │
                                            ▼
                                  RelationshipRecord[]
                                     (CALLS Edges)
```

---

## Global Constraints & Invariants

1. **Python Exclusively Uses Satori Native Engine (No CBM for Python)**: Satori's existing native Python resolution engine (`python-resolution.ts` — 78KB with origin tracing, flow hops, constructors, parameter annotations, and cross-module bindings) is preserved in full. CBM / WASM is explicitly disabled for Python (`supportsLanguage('python') === false`) and will never process Python code.
2. **No Platform-Specific Native Binaries**: The production distribution artifact is WebAssembly (`.wasm`) plus TypeScript/JS glue. Satori remains zero-native-binary portable across all Node >= 22.13 environments (`npm install` anywhere).
3. **Committed WASM Artifacts & Manifest Digest Verification**: `satori-semantic-engine.wasm`, `satori-semantic-engine.js`, and `semantic-engine.manifest.json` are checked into git in `packages/core/assets/semantic-engine/` alongside `THIRD_PARTY_LICENSES.md`. Standard Satori builds (`pnpm clean && tsc --build`) and `release:check` do NOT require Emscripten. Regeneration uses pinned Emscripten 3.1.64 via `scripts/build-semantic-engine.mjs`. A no-Emscripten digest check in `scripts/verify-semantic-engine-reproducibility.mjs` verifies that committed assets match the C source digest.
4. **Go-Only in Phase B**: Phase B scope is strictly Go caller/callee (`calls_v0`). Rust, Java, C#, C++, etc., will be enabled in subsequent plans after Go qualification and rebaselining.
5. **Strict Scope: `CALLS` Only**: This plan publishes `CALLS` edges. It does NOT publish `REFERENCES` edges or callable-reference expansions.
6. **No `TESTS` Edge Derivation for Go**: Syntactic resolution derives `TESTS` edges for JS/TS; Go deliberately declares `testReferenceCapability: 'none'` and must NOT derive `TESTS` edges.
7. **Strict Subsystem Isolation**: Do NOT import CBM's daemon, MCP server, SQLite store, graph buffer, publication pipeline, watchers, or vector search.
8. **CBM Produces Evidence, Never Satori Authority**: The WASM engine outputs raw `SemanticResolvedOccurrence`s and target definition provenance. Satori validates spans against `SymbolRegistry`, checks for ambiguity, tests freshness, and decides whether a relationship is publishable via `admitResolvedCallClaims()`.
9. **Mandatory Target Provenance**: Every resolved target emitted by the engine must include repository-relative `targetFile`, `targetStartByte`, `targetEndByte`, `targetName`, and `targetKind`. Satori binds this uniquely to a canonical `SymbolRecord`. Zero matches -> `unresolved`; >1 match -> `ambiguous`. Never publish by CBM qualified name alone.
10. **Asynchronous Engine Boundary, Synchronous Builder**: `resolveProject()` on the engine port is `Promise<SemanticProjectEvidence>`. The synchronous `buildRelationshipsForRegistry()` receives already-resolved immutable evidence.
11. **Generic Name-Based Go Call Fallback Disabled**: Go is excluded from Satori's fallback generic non-Python name-based call resolver. Every Go `CALLS` edge must originate from `GoResolutionProvider`.
12. **Bounded Go Module/Package v1 (`go.mod` & `go.work`)**: V1 supports single-root `go.mod`, standard package directories, standard imports, and explicit import aliases. `go.work` and ambiguous multi-module configurations act as project-global blockers (suppressing Go semantic `CALLS` for that project/module). Local unsupported constructs (`replace`, dot imports, unprovable packages) cause local occurrence abstention.
13. **Executable Conservative Incremental Rebuild (`semanticAffectedFiles`)**: If any Go source file changes (added/modified/deleted) or if `go.mod`/`go.work` changes, the workflow sets `semanticAffectedFiles` to all current Go files, rereads their current content using descriptor-bound source reads, re-runs Go semantic resolution, and replaces all Go relationship records and `resolutionClaims` in the delta.
14. **Qualification-Only Build Mode & Capability Gating**: Go capability remains `symbol_only` until Task B9. Tasks B5 and B8 utilize a private `RelationshipBuildMode` override (`kind: 'qualification', enabledUnpromotedCallLanguages: new Set(['go'])`) to test Go relationships without prematurely altering public capabilities.
15. **Qualification Failure Rule**: Any systematic false-edge class found during qualification causes the supported v1 subset to be narrowed before promotion. Near-total abstention cannot pass. Report eligible-v1 denominator, resolved, correct, incorrect (must be 0 on ambiguity fixtures), and abstained counts.
16. **License & Upstream Provenance**: Maintain `third_party/cbm-semantic/UPSTREAM.md` with an explicit per-component provenance table (CBM C core, Tree-sitter C runtime, Tree-sitter Go grammar, generated Go stdlib data). Satori remains AGPL-3.0-only as a combined product.

---

## Repository Organization

```text
satori/
├─ third_party/
│  └─ cbm-semantic/
│     ├─ LICENSE
│     ├─ UPSTREAM.md
│     ├─ minimal-compat/ (cbm_compat.h - attributed minimal definition/language types)
│     ├─ common/
│     │  ├─ type_rep.c / .h
│     │  ├─ scope.c / .h
│     │  ├─ type_registry.c / .h
│     │  └─ arena.c / .h
│     ├─ languages/
│     │  └─ go/
│     │     ├─ go_lsp.c / .h
│     │     ├─ go_mod.c / .h
│     │     ├─ go_stdlib_data.c
│     │     ├─ go_surface.c / .h
│     │     └─ LICENSES/
│     ├─ tree-sitter/
│     │  ├─ runtime/ (api.h, lib.c)
│     │  └─ go/ (parser.c)
│     └─ bridge/
│        ├─ satori_semantic.h
│        └─ satori_semantic.c
│
├─ packages/core/
│  ├─ assets/semantic-engine/
│  │  ├─ satori-semantic-engine.js            (committed)
│  │  ├─ satori-semantic-engine.wasm          (committed)
│  │  ├─ semantic-engine.manifest.json        (committed digest manifest)
│  │  └─ THIRD_PARTY_LICENSES.md              (committed)
│  └─ src/
│     ├─ semantic/
│     │  ├─ contracts.ts                      (SemanticProjectInput, SemanticProjectEvidence, SemanticResolvedOccurrence)
│     │  ├─ analyzer-port.ts                  (SemanticProjectAnalyzer interface)
│     │  ├─ noop-analyzer.ts                  (Phase A fallback: supportsLanguage returns false)
│     │  └─ wasm/
│     │     ├─ wasm-types.ts                  (ABI POD structs, enums & budgets)
│     │     ├─ wasm-loader.ts                 (singleton module loader)
│     │     ├─ wasm-engine.ts                 (POD deserializer & engine)
│     │     ├─ wasm-analyzer.ts               (implements SemanticProjectAnalyzer for Go)
│     │     ├─ wasm-smoke.test.ts
│     │     ├─ wasm-engine.test.ts
│     │     ├─ packed-core-smoke.test.ts
│     │     └─ utf8-span-parity.test.ts
│     ├─ relationships/
│     │  ├─ resolution-strategy-registry.ts   (LanguageResolutionStrategyRegistry & policy)
│     │  ├─ resolution.ts                     (ResolutionClaim, ResolutionAuthority, proof steps)
│     │  ├─ python-resolution.ts              (UNCHANGED 78KB Satori Native Python Engine)
│     │  ├─ builder.ts                        (orchestrates contributions & admits claims via admitResolvedCallClaims)
│     │  └─ contributions/
│     │     ├─ contracts.ts                   (CallResolutionContribution, CallResolutionEngine, RelationshipBuildMode)
│     │     ├─ python.ts                      (wraps existing python-resolution.ts unchanged)
│     │     ├─ syntactic.ts                   (wraps generic non-Python call resolver with TESTS)
│     │     └─ go.ts                          (GoResolutionProvider: SemanticEvidence -> ResolutionClaim[])
│     └─ generation/
│        └─ index-generation-workflow.ts      (owns full & incremental relationship orchestration)
│
├─ scripts/
│  ├─ build-semantic-engine.mjs               (pinned Emscripten 3.1.64 build script)
│  └─ verify-semantic-engine-reproducibility.mjs
```

---

## Memory-Safe C ABI Specification

### POD Struct Layout & Enums (`satori_semantic.h`)

```c
#ifndef SATORI_SEMANTIC_H
#define SATORI_SEMANTIC_H

#include <stdint.h>
#include <stddef.h>

#define SATORI_SEMANTIC_ABI_VERSION 1
#define SATORI_SEMANTIC_OK 0
#define SATORI_SEMANTIC_ERR_INVALID_ARGUMENT -1
#define SATORI_SEMANTIC_ERR_OUT_OF_MEMORY -2
#define SATORI_SEMANTIC_ERR_PARSE_FAILED -3
#define SATORI_SEMANTIC_ERR_RESOLVE_FAILED -4
#define SATORI_SEMANTIC_ERR_HANDLE_NOT_FOUND -5
#define SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED -6

/* Deterministic resource limits */
#define SATORI_MAX_AGGREGATE_SOURCE_BYTES (64 * 1024 * 1024) /* 64 MB */
#define SATORI_MAX_FILES 10000
#define SATORI_MAX_DEFINITIONS 100000
#define SATORI_MAX_CALL_SITES 200000
#define SATORI_MAX_RESULTS 100000
#define SATORI_MAX_RECURSION_DEPTH 32

typedef uint32_t SatoriSemanticHandle;

/* Decision enum */
enum SatoriSemanticDecision {
    SATORI_DECISION_RESOLVED = 1,
    SATORI_DECISION_UNRESOLVED = 2,
    SATORI_DECISION_AMBIGUOUS = 3
};

/* Strategy enum */
enum SatoriSemanticStrategy {
    SATORI_STRATEGY_DIRECT_CALL = 1,
    SATORI_STRATEGY_TYPE_DISPATCH = 2,
    SATORI_STRATEGY_EMBED_DISPATCH = 3,
    SATORI_STRATEGY_INTERFACE_DISPATCH = 4,
    SATORI_STRATEGY_UNKNOWN = 99
};

/* Receiver / Proof binding kind */
enum SatoriReceiverBindingKind {
    SATORI_BINDING_NONE = 0,
    SATORI_BINDING_TYPED_PARAMETER = 1,
    SATORI_BINDING_CONSTRUCTOR_RETURN = 2,
    SATORI_BINDING_COMPOSITE_LITERAL = 3,
    SATORI_BINDING_FIELD_ACCESS = 4,
    SATORI_BINDING_MULTI_RETURN = 5,
    SATORI_BINDING_RANGE_VARIABLE = 6,
    SATORI_BINDING_EMBEDDED_PROMOTED = 7
};

/* Target kind */
enum SatoriTargetKind {
    SATORI_TARGET_NONE = 0,
    SATORI_TARGET_FUNCTION = 1,
    SATORI_TARGET_METHOD = 2
};

/* Fixed-width POD result struct (exactly 64 bytes, little-endian) */
typedef struct {
    /* Source call occurrence (16 bytes) */
    uint32_t source_file_offset;
    uint32_t source_file_length;
    uint32_t call_start_byte;
    uint32_t call_end_byte;

    /* Target definition provenance (28 bytes) */
    uint32_t target_file_offset;
    uint32_t target_file_length;
    uint32_t target_name_offset;
    uint32_t target_name_length;
    uint32_t target_owner_offset;   /* optional, length 0 if none */
    uint32_t target_owner_length;
    uint32_t target_start_byte;
    uint32_t target_end_byte;

    /* Structured proof metadata (12 bytes) */
    uint32_t receiver_type_offset;  /* optional, length 0 if none */
    uint32_t receiver_type_length;
    uint32_t import_path_offset;    /* optional package import path, length 0 if none */
    uint32_t import_path_length;

    /* Decision, flags & scoring (8 bytes) */
    uint8_t receiver_binding_kind;  /* SatoriReceiverBindingKind (1 byte) */
    uint8_t target_kind;            /* SatoriTargetKind (1 byte) */
    uint8_t decision;               /* SatoriSemanticDecision (1 byte) */
    uint8_t strategy;               /* SatoriSemanticStrategy (1 byte) */
    float confidence;               /* (4 bytes) */
} SatoriSemanticResultV1;

/* Static assertion for exact struct size: 16 + 28 + 12 + 8 = 64 bytes */
#if defined(__STDC_VERSION__) && __STDC_VERSION__ >= 201112L
_Static_assert(sizeof(SatoriSemanticResultV1) == 64, "SatoriSemanticResultV1 must be exactly 64 bytes");
#endif

/* ABI lifecycle & execution functions */
uint32_t satori_semantic_abi_version(void);
const char *satori_semantic_engine_version(void);
const char *satori_semantic_global_last_error_message(void);
const char *satori_semantic_last_error_message(SatoriSemanticHandle handle);

int satori_semantic_create(const char *language, uint32_t language_len, SatoriSemanticHandle *out_handle);
int satori_semantic_add_auxiliary(SatoriSemanticHandle handle, const char *role, uint32_t role_len, const char *path, uint32_t path_len, const char *source, uint32_t source_len);
int satori_semantic_add_source(SatoriSemanticHandle handle, const char *path, uint32_t path_len, const char *source, uint32_t source_len);
int satori_semantic_resolve(SatoriSemanticHandle handle);

uint32_t satori_semantic_result_count(SatoriSemanticHandle handle);
const SatoriSemanticResultV1 *satori_semantic_results(SatoriSemanticHandle handle);
const char *satori_semantic_string_table(SatoriSemanticHandle handle, uint32_t *out_table_len);

void satori_semantic_destroy(SatoriSemanticHandle handle);

#endif /* SATORI_SEMANTIC_H */
```

### Pointer Lifetime & Memory Invariants
- **Pointer Lifetime**: Pointers returned by `satori_semantic_results()`, `satori_semantic_string_table()`, and `satori_semantic_last_error_message()` remain valid strictly until the next `satori_semantic_resolve()`, `satori_semantic_add_source()`, `satori_semantic_add_auxiliary()`, or `satori_semantic_destroy()` call on the same handle.
- **Global Error Pointer**: Pointer from `satori_semantic_global_last_error_message()` is valid until the next `satori_semantic_create()` call.

---

## Phase A: Language Intelligence Spine Enablement (Zero-Behavior-Change Refactor)

> **Phase A Invariant:** Refactor is purely structural and mechanical. No WASM code is added, no capability declarations change, Python and Syntactic engines retain 100% exact behavior, and all existing tests pass with zero behavior divergence.

### Task A1: Characterize Current Python & Syntactic Records/Claims/TESTS

- [ ] **A1.1 Document Baseline Output**:
  - Add characterization tests in `packages/core/src/relationships/builder.test.ts` capturing:
    - Python records, resolution claims, and flow proof steps.
    - JS/TS direct call records and derived `TESTS` edges.
    - Ambiguous symbol abstention and unmapped target filtering across all callers of navigation staging.

---

### Task A2: Resolution Strategy Registry with Canonical Language IDs

- [ ] **A2.1 Create `packages/core/src/relationships/resolution-strategy-registry.ts`**:
  - Define `LanguageResolutionStrategy`: `'python_native' | 'syntactic' | 'cbm_semantic' | 'none'`.
  - Implement `LanguageResolutionStrategyRegistry` using canonical language IDs from `languages/registry.ts`:
    - `python` -> `python_native`
    - `javascript`, `typescript` -> `syntactic`
    - `go`, `rust`, `java`, `csharp`, `cpp`, etc. -> `none` (initially)
  - Method `strategyForLanguage(languageId: string): LanguageResolutionStrategy`.
- [ ] **A2.2 Unit Tests (`resolution-strategy-registry.test.ts`)**:
  - Verify canonical resolution, alias normalization, and default fallback.

---

### Task A3: Introduce `CallResolutionContribution` Contract & `RelationshipBuildMode`

- [ ] **A3.1 Create `packages/core/src/relationships/contributions/contracts.ts`**:
  ```typescript
  export type RelationshipBuildMode =
      | { readonly kind: 'production' }
      | {
          readonly kind: 'qualification';
          readonly enabledUnpromotedCallLanguages: ReadonlySet<string>;
      };

  export interface CallResolutionContribution {
      readonly records: readonly RelationshipRecord[];
      readonly claimsByFile?: ReadonlyMap<string, readonly ResolutionClaim[]>;
  }

  export interface CallResolutionEngine {
      resolveCalls(input: {
          registry: SymbolRegistry;
          analysisByFile: Map<string, RelationshipAnalysisEvidence> | Record<string, RelationshipAnalysisEvidence>;
          sourceFiles?: ReadonlySet<string>;
          mode?: RelationshipBuildMode;
      }): CallResolutionContribution;
  }
  ```

---

### Task A4: Wrap Python Resolution Unchanged

- [ ] **A4.1 Create `packages/core/src/relationships/contributions/python.ts`**:
  - Implement `CallResolutionEngine` wrapping `resolvePythonRelationships()` from `python-resolution.ts`:
    ```typescript
    export class PythonResolutionContributionEngine implements CallResolutionEngine {
        resolveCalls(input: ...): CallResolutionContribution {
            const result = resolvePythonRelationships({
                registry: input.registry,
                analysisByFile: input.analysisByFile,
                settings: { sourceFiles: input.sourceFiles },
            });
            return {
                records: result.records,
                claimsByFile: result.claimsByFile,
            };
        }
    }
    ```
- [ ] **A4.2 Parity Tests (`contributions/python.test.ts`)**:
  - Verify exact output equality with `python-resolution.test.ts`.

---

### Task A5: Extract Syntactic Non-Python Resolution with `TESTS` Derivation

- [ ] **A5.1 Create `packages/core/src/relationships/contributions/syntactic.ts`**:
  - Extract the generic non-Python name-matching loop from `builder.ts` into `SyntacticResolutionContributionEngine`.
  - Preserves exact direct call matching, unambiguous target resolution, confidence assignment, and derived `TESTS` edge generation when test files call production symbols.
- [ ] **A5.2 Parity Tests (`contributions/syntactic.test.ts`)**:
  - Verify identical records and `TESTS` edges for JS/TS fixtures.

---

### Task A6: Define Provider-Neutral `SemanticProjectAnalyzer` & Exact Source Contracts

- [ ] **A6.1 Create `packages/core/src/semantic/contracts.ts`**:
  ```typescript
  export interface SemanticSourceFile {
      readonly path: string;
      readonly source: string;
      readonly sourceHash: string; /* Mandatory */
  }

  export interface SemanticAuxiliaryFile {
      readonly path: string;
      readonly role: string;
      readonly source: string;
      readonly sourceHash: string;
  }

  export interface SemanticProjectInput {
      readonly language: string;
      readonly sourceFiles: readonly SemanticSourceFile[];
      readonly auxiliaryFiles: readonly SemanticAuxiliaryFile[];
  }

  export interface SemanticResolvedOccurrence {
      readonly sourceFile: string;
      readonly callSpan: SourceSpan;
      readonly targetProvenance?: {
          readonly file: string;
          readonly span: SourceSpan;
          readonly name: string;
          readonly kind: 'function' | 'method';
          readonly ownerName?: string;
      };
      readonly proof: {
          readonly strategy: string;
          readonly packageBinding?: {
              readonly localName: string;
              readonly importPath: string;
              readonly packageIdentity: string;
              readonly span?: SourceSpan;
          };
          readonly receiverBinding?: {
              readonly kind: string;
              readonly receiverType: string;
              readonly span?: SourceSpan;
          };
      };
      readonly decision: 'resolved' | 'unresolved' | 'ambiguous';
      readonly confidence: number;
  }

  export interface SemanticProjectEvidence {
      readonly language: string;
      readonly occurrencesByFile: ReadonlyMap<string, readonly SemanticResolvedOccurrence[]>;
  }
  ```
- [ ] **A6.2 Create `packages/core/src/semantic/analyzer-port.ts` & `noop-analyzer.ts`**:
  ```typescript
  export interface SemanticProjectAnalyzer {
      supportsLanguage(language: string): boolean;
      analyze(input: SemanticProjectInput): Promise<SemanticProjectEvidence>;
  }
  ```
  - `NoopSemanticProjectAnalyzer`: `supportsLanguage()` returns `false` for all languages.

---

### Task A7: Move Full Relationship Orchestration into `IndexGenerationWorkflow`

- [ ] **A7.1 Unify Full & Incremental Relationship Construction in `IndexGenerationWorkflow`**:
  - Move relationship building out of `Context.writeSymbolRegistryForCompletedIndex()` into `IndexGenerationWorkflow`:
    - Full Indexing: Capture `semanticSources` in `ProcessedFileList` (only when `semanticAnalyzer.supportsLanguage(lang)` is true), await `semanticAnalyzer.analyze()`, and invoke `buildRelationshipsForRegistry()`.
    - Incremental Sync: Already invokes `buildRelationshipDelta()` inside `IndexGenerationWorkflow`.
    - Characterize all navigation rebuild/staging callers (repair, marker refresh, delta, full index) to ensure 100% identical outputs.
  - Retain public capability gating: Call resolution only runs for languages with `callsCapability === 'production_ready'` (or when enabled by `mode.enabledUnpromotedCallLanguages`).
  - In `packages/core/src/relationships/builder.ts`:
    - Implement `admitResolvedCallClaims()` for claim admission.
    - Dispatch through `LanguageResolutionStrategyRegistry`, `PythonResolutionContributionEngine`, and `SyntacticResolutionContributionEngine`.
    - Attach claims during emit.
- [ ] **A7.2 Wire `NoopSemanticProjectAnalyzer` in `Context`**:
  - Inject `NoopSemanticProjectAnalyzer` when constructing `IndexGenerationWorkflow`.

---

### Task A8: Parity Proof, Commit & Release Qualification Checkpoint

- [ ] **A8.1 Run Core Test Suite & Verify Zero Behavior Divergence**:
  ```bash
  pnpm --filter @zokizuan/satori-core test
  ```
- [ ] **A8.2 Commit on Clean Tree**:
  - Commit: `refactor(core): establish provider-driven language intelligence spine`.
- [ ] **A8.3 Run Full Release Qualification on Clean Commit**:
  ```bash
  pnpm run check
  pnpm run release:check
  ```
- [ ] **A8.4 STOP & Review Checkpoint**:
  - Verify: Python output identical, JS/TS output identical, zero new CALLS edges, zero capability changes.

---

## Phase B: CBM-Derived WASM Engine & Go Integration (Non-Python Only)

### Task B1: Discover Minimal CBM Closure, Attribution Header & WASM Smoke

- [ ] **B1.1 Discover, Compile & Freeze Minimal Transitive CBM Closure**:
  - Create minimal attributed compatibility header `third_party/cbm-semantic/minimal-compat/cbm_compat.h` containing definition/language types for Go resolver (avoiding huge `cbm.h`).
  - Import minimal sources:
    - Common core: `scope.c/.h`, `type_rep.c/.h`, `type_registry.c/.h`, `arena.c/.h`
    - Go resolver: `go_lsp.c/.h`, `go_stdlib_data.c`
    - Tree-sitter C runtime (`api.h`, `lib.c`) & Go grammar (`parser.c`)
  - Create `third_party/cbm-semantic/UPSTREAM.md` with complete per-component provenance table.
- [ ] **B1.2 Minimal Bridge Smoke**:
  - Implement `satori_semantic.h` & `satori_semantic.c` with smoke API: `satori_semantic_go_smoke()`.
- [ ] **B1.3 Pinned Emscripten Build Script (`scripts/build-semantic-engine.mjs`)**:
  - Enforce pinned Emscripten 3.1.64 (via Docker image digest or local `emcc --version == 3.1.64`).
  - Compile to `packages/core/assets/semantic-engine/satori-semantic-engine.js` and `.wasm`.
  - Generate `packages/core/assets/semantic-engine/semantic-engine.manifest.json` recording `abiVersion`, `upstreamCommit`, `emscriptenVersion`, `semanticSourceDigest`, `jsSha256`, `wasmSha256`.
  - Add `THIRD_PARTY_LICENSES.md` to `packages/core/assets/semantic-engine/`.
  - Add npm scripts: `"semantic:build"` and `"semantic:verify"`.
- [ ] **B1.4 Verification**:
  - `packages/core/src/semantic/wasm/wasm-smoke.test.ts` verifying WASM instantiation and smoke execution in Node >= 22.13.

---

### Task B2: Freeze POD Memory-Safe ABI, TypeScript Engine & Packed Core Smoke

- [ ] **B2.1 Implement Full C ABI in `satori_semantic.h` & `satori_semantic.c`**:
  - Implement 64-byte `SatoriSemanticResultV1` struct, UTF-8 string table, global & handle error reporting, and isolated handle lifecycle.
  - Enforce aggregate budgets: max 64MB source, max 10k files, max 100k defs, max 200k calls, max 100k results, max depth 32, max 256MB WASM memory.
  - Expose engine build identity: `cbm-d150ebe4+satori-go-semantic-v1+<sourceDigestSuffix>` via `satori_semantic_engine_version()`.
- [ ] **B2.2 Implement TypeScript WASM Layer (`packages/core/src/semantic/wasm/`)**:
  - `wasm-types.ts`: ABI POD deserialization types.
  - `wasm-loader.ts`: Singleton async module loader.
  - `wasm-engine.ts`: Deserializes fixed-width results from WASM memory.
  - `wasm-analyzer.ts`: Implements `SemanticProjectAnalyzer` for Go (`supportsLanguage('python') === false`).
- [ ] **B2.3 Session Isolation Tests (`wasm-engine.test.ts`)**:
  - Test repeated `create -> resolve -> destroy` and multiple concurrent handles.
- [ ] **B2.4 Packed Core Runtime Smoke Test (`packages/core/src/semantic/wasm/packed-core-smoke.test.ts`)**:
  - Pack `@zokizuan/satori-core` via `npm pack` writing to `os.tmpdir()` (keeping repo tree clean), install into temporary directory, require the package, and prove WASM engine initialization and resolution.

---

### Task B3: Go Semantic Surface, Exact Target Provenance, `go.mod` & `go.work` Observation & Structured Proof

- [ ] **B3.1 Include `go.mod` and `go.work` in Authoritative Source Observation**:
  - Generalize exact-filename indexing rule in `packages/core/src/config/index-policy.ts` so `go.mod` and `go.work` are included in normal observed/indexed source set.
  - Bump language-router / source-selection identity to `language-router-v2`.
- [ ] **B3.2 Implement Go Module & Workspace Parser (`languages/go/go_mod.c/.h`)**:
  - Parse root module path from `go.mod`. Map import path -> repo directory.
  - Derive default package identifier from target package clause (not directory leaf). Respect explicit aliases.
  - Project-global blocker handling: If `go.work` is present or ambiguous multiple `go.mod` files exist, suppress Go semantic `CALLS` for affected module/project.
  - Local occurrence abstention for unsupported constructs (`replace`, dot imports, unprovable packages).
- [ ] **B3.3 Implement Go AST Surface Extractor (`languages/go/go_surface.c/.h`)**:
  - Extract exact `CBMLSPDef` surface: defining module, receiver type, returns, embedded types, fields, interface methods, ordered parameter types.
  - Record exact definition spans `(def_file, def_start_byte, def_end_byte)` and call site spans `(call_file, call_start_byte, call_end_byte)`.
- [ ] **B3.4 Extend Satori Proof Kinds (`packages/core/src/relationships/resolution.ts`)**:
  - Extend `ResolutionProofStepKind` union with: `'package_binding' | 'receiver_type_binding' | 'exact_target_definition'`.
  - Update `resolutionAuthorityForProof()` to recognize these proof kinds.
- [ ] **B3.5 Definition-Span & Call-Span UTF-8 Parity Tests (`utf8-span-parity.test.ts`)**:
  - Verify exact byte-offset parity with Satori's `Utf8SourceMap` across multi-byte UTF-8 source text for:
    - Call occurrence spans
    - Target function definition spans
    - Target method definition spans

---

### Task B4: Implement `GoResolutionProvider` with Structured Proof Admission

- [ ] **B4.1 Create `packages/core/src/relationships/contributions/go.ts`**:
  - Constants:
    ```typescript
    export const CBM_GO_PROVIDER_ID = 'satori-cbm-semantic-go';
    export const CBM_GO_PROVIDER_VERSION = 'cbm-d150ebe4+satori-go-semantic-v1';
    export const CBM_GO_ENVIRONMENT_CONFIG_ID = 'cbm-go-semantic-v1';
    ```
  - Consumes `SemanticProjectEvidence` + `SymbolRegistry`.
  - Matches native occurrence by exact `sourceFile` + `startByte` + `endByte`.
  - Resolves caller owner via `ownerForCall()`.
  - **Mandatory Target Provenance Lookup**:
    - Look up target `SymbolRecord` in `SymbolRegistry` matching `target.file`, `target.name`, `target.startByte`, `target.endByte`.
    - If 0 matches -> `unresolved`, no edge.
    - If >1 matches -> `ambiguous`, no edge.
  - **Explicit Proof Admission Matrix**:
    - `DIRECT_CALL` + exact package/local binding -> `direct_binding`
    - `TYPE_DISPATCH` + `TYPED_PARAMETER` -> `direct_binding`
    - `TYPE_DISPATCH` + `COMPOSITE_LITERAL` -> `direct_binding`
    - `EMBED_DISPATCH` + exact concrete receiver + exact embedding -> `direct_binding`
    - `FIELD_ACCESS`, `MULTI_RETURN`, `RANGE_VARIABLE` -> abstain in calls_v0 (unless actual ordered flow hops exist).
    - `INTERFACE_DISPATCH` -> abstain.
  - **No `TESTS` Edges**: Does not derive `TESTS` edges.
  - Attach stable `dependencyKeys` (caller span + target file).
- [ ] **B4.2 Register Go in `LanguageResolutionStrategyRegistry`**:
  - Map `go` -> `cbm_semantic`.
- [ ] **B4.3 Unit Tests (`contributions/go.test.ts`)**:
  - Test exact span matching, missing target abstention, ambiguous target abstention, interface dispatch rejection, zero `TESTS` edge derivation, and proof step construction.

---

### Task B5: Full Indexing Integration with Qualification Build Mode

- [ ] **B5.1 Wire `CBMWasmSemanticAnalyzer` in `IndexGenerationWorkflow`**:
  - Full Indexing: When Go is eligible (or enabled via `RelationshipBuildMode.enabledUnpromotedCallLanguages`), pass ephemeral `semanticSources` from `ProcessedFileList` and `go.mod`/`go.work` to `analyzer.analyze()`, pass evidence to `GoResolutionProvider`, admit claims via `admitResolvedCallClaims()`, and attach claims.
- [ ] **B5.2 Full Pipeline Integration Tests (using Qualification Mode)**:
  - Multi-file Go project fixtures proving `CALLS` edges published into navigation sidecar when tested under qualification mode.

---

### Task B6: Conservative Incremental Go Rebuild (`semanticAffectedFiles`)

- [ ] **B6.1 Implement Go Semantic Change Detection & Invalidation Set**:
  - If any `.go` file or `go.mod`/`go.work` is added, modified, or removed:
    - Set `semanticAffectedFiles` to all current Go files in the project.
    - Reread current Go file sources using descriptor-bound source reads.
    - Re-run Go semantic analysis and `GoResolutionProvider`.
    - In `buildRelationshipDelta()`: replace all Go relationship records and `resolutionClaims` while preserving unchanged non-Go delta records and unchanged symbol/vector data.
- [ ] **B6.2 Incremental Regression Tests**:
  - Test callee rename, callee deletion, receiver type mutation, target file deletion, and `go.mod` modification triggering complete Go graph convergence.

---

### Task B7: Versioning, Packaging & Packed Core Smoke

- [ ] **B7.1 Bump Relationship Version**:
  - In `packages/core/src/language-analysis/versions.ts`:
    ```typescript
    export const RELATIONSHIP_BUILDER_VERSION = 'relationship-v11+python-cross-module-constructors+python-native-resolution-v1+cbm-go-wasm-v1';
    ```
- [ ] **B7.2 Package Configuration**:
  - Update `packages/core/package.json` `files` array to include `assets/semantic-engine/**`.
- [ ] **B7.3 Execute Packed Core Runtime Smoke Test**:
  - Run `packed-core-smoke.test.ts` proving the packaged module loads and executes cleanly.

---

### Task B8: Parity, Admission, Regression & Real-World Qualification

- [ ] **B8.1 CBM Parity Test Suite**:
  - Parameter types, return propagation, chained methods, multi-returns, range variables, composite literals, struct embedding, cross-file method dispatch.
- [ ] **B8.2 Satori Authority & Admission Test Suite**:
  - Invalid spans rejected, unmapped targets unresolved, multiple targets ambiguous, interface dynamic dispatch rejected, stale incremental edges eliminated.
- [ ] **B8.3 Real-World Repository Qualification (under Qualification Mode)**:
  - Evaluate on regression repos: `go-chi/chi`, `gorilla/mux`, `spf13/cobra`.
  - Evaluate on **one fresh, held-out Go repository**.
  - Metrics collected:
    - Eligible v1 call sites count
    - Correctly resolved calls count
    - Falsely resolved calls count (must be 0 on ambiguity fixtures)
    - Abstained calls count
    - Precision (Hard minimum: >= 90%, target >= 95%)
    - Eligible-v1 recall / coverage
    - Agent manual hop reduction on caller/callee tasks compared to `symbol_only` baseline.
  - **Qualification Failure Rule**: Systematic false-edge classes narrow v1 scope; near-total abstention fails.
  - Resource measurements: Full + incremental runtime, peak memory usage, WASM raw size, packed npm delta size.

---

### Task B9: Promote Capability to `calls_v0` & Release Qualification

- [ ] **B9.1 Add Go Calls Fixture & Promote Capability**:
  - Add Go entry to `fixtures.calls` in `packages/core/src/languages/capabilities.ts`.
  - Declare Go capability in `packages/core/src/languages/capabilities.ts`:
    ```typescript
    declaration({
        languageId: 'go',
        aliases: [],
        extensions: ['.go'],
        searchEligibility: PRODUCTION_READY,
        parserCapability: PRODUCTION_READY,
        symbolExtractionCapability: PRODUCTION_READY,
        ownerExtractionCapability: PRODUCTION_READY,
        importExportCapability: NONE,
        callsCapability: PRODUCTION_READY,
        typeReceiverAwareCapability: NONE,
        testReferenceCapability: NONE,
        publicClaim: 'calls_v0',
        fixtures: {
            navigation: [
                'fixtures/navigation/go-basic-symbols/expected_symbols.json',
                'fixtures/navigation/go-basic-symbols/expected_tool_outputs.json',
            ],
            calls: ['packages/core/src/relationships/contributions/go.test.ts'],
            symbols: ['packages/core/src/language-analysis/service.test.ts'],
            ownerMetadata: ['packages/core/src/core/context.test.ts'],
            fileOutline: ['packages/mcp/src/core/handlers.file_outline.test.ts'],
            readFileOpenSymbol: ['packages/mcp/src/tools/read_file.test.ts'],
        },
    }),
    ```
  - Update `packages/core/src/languages/capabilities.test.ts`.
- [ ] **B9.2 Commit on Clean Tree**:
  - Commit: `feat(core): promote Go semantic calls_v0 with CBM-derived wasm engine`.
- [ ] **B9.3 Full Repository Release Qualification on Clean Commit**:
  ```bash
  pnpm run check
  pnpm run release:check
  ```
- [ ] **B9.4 STOP & REBASELINE**:
  - Stop and rebaseline before considering any subsequent languages.
