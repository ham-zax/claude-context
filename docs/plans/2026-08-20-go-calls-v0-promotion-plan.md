# Go `calls_v0` Promotion Implementation Plan

**Rebaseline:** 2026-08-25 against the post-clean-break code state at `5de0dde383548caa4beddca73744c7f5145cfc68`, re-reviewed at `3c51716a5a3b86912645b1b9f031547c3d3f9a63` (plan-only delta since the code baseline).

**Readiness:** Ready after the correctness corrections in this revision. The product goal remains sound, but production Go `calls_v0` is deliberately narrower than the native resolver's existing capability: only conservative direct calls are promotable in this wave.

**Goal:** Promote Go from `symbol_only` to production `calls_v0` through the existing CBM/WASM relationship pipeline and Publication-owned navigation, then prove the public `search_codebase -> call_graph` path on a real Go repository.

## Current architecture and ownership

The live production path is now:

```text
Publication source + semantic auxiliaries
  -> ThreadedWasmSemanticProjectAnalyzer
  -> CbmSemanticContributionEngine
  -> central proof-backed CALLS admission
  -> buildRelationshipsForRegistry / buildRelationshipDelta
  -> stagePublicationNavigation
  -> PublicationStore activation
  -> search/file_outline capability hint
  -> NavigationHandlers.handleCallGraph
  -> RelationshipBackedCallGraph
```

Important current facts:

- Go is still declared with `symbolOnlyLanguage(...)`; `callsCapability` is not production-ready.
- Go already uses `strategy: "cbm_semantic"` and the generic CBM dispatch in `packages/core/src/relationships/builder.ts`.
- `IndexGenerationWorkflow` already discovers all semantic auxiliaries for a language. `go.mod`, `go.sum`, and `go.work` are observable source inputs, enter the Publication source checkpoint, and trigger Go semantic reanalysis when changed.
- Publication navigation is now the only graph authority. The old MCP `CallGraphSidecarManager`, SnapshotManager path, and legacy handler test files named in the first version of this plan are gone and must not be recreated.
- Public call-graph admission already flows through `isLanguageCapabilitySupportedForLanguage(..., "callGraphQuery")`; after a truthful capability flip, Go does not need a new handler branch.
- The current native Go semantic engine is still `go-v1` and still applies the first discovered `go.mod` module path to every source file.
- `/home/hamza/repo/trufflehog` remains a viable real-product witness: `hack/checksecretparts/check.go` still contains `CheckPackageDir -> checkFiles`.

## Scope and constraints

- Keep the work limited to Go direct-call correctness, the Go capability declaration, current-facing Go graph claims, and the evidence needed to justify promotion.
- Treat the authoritative Tier-3 contract literally: `calls_v0` is conservative direct-call extraction. Package-qualified functions such as `pkg.Func()` are direct calls when the import binding is exact; receiver/type dispatch, embedded dispatch, interface dispatch, callable aliases/callbacks, and other non-direct strategies are not production `CALLS` in this wave.
- Do not add `if (language === "go")` branches to `packages/core/src/relationships/builder.ts`, `packages/core/src/generation/index-generation-workflow.ts`, `packages/core/src/core/context.ts`, or MCP navigation handlers.
- Keep Go `TESTS`, imports/exports, and `type_receiver_aware` public tiers unchanged.
- Preserve the public `call_graph` request/response contract. Do not add a Go-specific MCP tool or response shape.
- Any source or target whose Go build inclusion depends on an unmodeled build context must be ineligible for authoritative Go `CALLS`. Lower recall is preferable to a cross-build false edge.
- Ambiguous, duplicate, unresolved, or unproven targets must abstain. A wrong authoritative edge is a blocker.
- Do not add a second graph store, sidecar, compatibility reader, per-language Publication format, or Go-specific serving path.
- This plan does not itself authorize test creation or execution. Full promotion requires explicit testing authorization when implementation begins; without it, do not start the promotion wave because the capability flip must land with its qualification evidence.

## Rebaseline decisions

### 1. Enforce the Tier-3 direct-call boundary before promotion

The native Go engine already emits `direct_call`, `type_dispatch`, `embed_dispatch`, and `interface_dispatch` evidence. It also emits callable-alias strategies that currently arrive at TypeScript as WASM `UNKNOWN`; `WasmSemanticProjectAnalyzer` presently defaults every unrecognized raw strategy to `direct_call`. That is too permissive for a Tier-3 public claim.

Keep native semantic evidence available for later tiers, but make public CBM admission capability-aware:

- map WASM `UNKNOWN` to semantic strategy `unknown`, not `direct_call`;
- allow a CBM occurrence to become an authoritative `CALLS` candidate only when `proof.strategy === "direct_call"`, unless that language's `typeReceiverAwareCapability` is explicitly production-ready in a later promotion;
- keep package-qualified `pkg.Func()` calls in `direct_call` when their import binding is exact;
- do not promote receiver-method, embedded, interface, callback/callable-alias, or unknown-strategy success as part of Go `calls_v0`.

This belongs in the generic semantic/CBM boundary, not a Go branch in the relationship builder.

### 2. Model modules and packages separately

Replace the one-global-module `extract_module_name()` model with deterministic module and package tables built from the already-bounded semantic inputs.

Module table entry:

```text
{ moduleRoot, modulePath }
```

Package table entry:

```text
{ moduleRoot, modulePath, sourceDir, importPath, declaredPackageName, callsEligible }
```

Rules:

- parse every `go.mod` auxiliary and bind each source to the deepest ancestor `moduleRoot` at a path-component boundary;
- at a module root, `importPath` is the module path; below it, `importPath` is `modulePath + sourceDirectoryRelativeToModuleRoot`;
- do not collapse module-root `package main` to a global `"main"` identity;
- a source outside all module roots uses a module-less repository-relative local identity and must not borrow another module path;
- for a default import, bind the local selector from the unique target package's `declaredPackageName`, not from the import-path basename. Thus `import "example.com/project/v2"` may correctly bind selector `project`;
- an explicit import alias continues to use the explicit local name, but the target package identity remains the exact import path;
- multiple eligible package declarations for one source directory/import path are ambiguous. Do not merge them into one namespace or choose one by input order.

### 3. Fail closed on unmodeled Go build context

The current semantic project receives every indexed `.go` file and does not evaluate Go build selection. A project-wide registry can therefore join files that never coexist in one Go build.

Go v2 will not implement a full `go/build` evaluator. Instead, mark a file `callsEligible=false` when any of these apply:

- a leading build-constraint region contains `//go:build` or legacy `// +build`;
- the basename carries a recognized implicit GOOS/GOARCH suffix (`*_GOOS.go`, `*_GOARCH.go`, or `*_GOOS_GOARCH.go`), using one deterministic native table tied to the Go semantic revision;
- the file is `*_test.go`, because this wave does not model normal-build versus `go test` package composition;
- the file imports pseudo-package `"C"`, because this wave does not model `CGO_ENABLED`.

Do not register authoritative call targets from an ineligible file and do not emit authoritative calls from it. This guarantees that an unconstrained source cannot bind to a platform/test/cgo-only target and that constrained callers do not publish edges for an unknown build context.

An external test package such as `package foo_test` must therefore not contaminate the importable `foo` package identity. Qualification should prove that its presence does not change ordinary package resolution, while `_test.go` itself remains outside the initial Go `CALLS` evidence set.

### 4. Make ambiguity and resource failure deterministic

Do not add a second silent capacity policy. The semantic ABI already bounds inputs at `SATORI_MAX_AUXILIARIES` and `SATORI_MAX_SOURCES`; size module/package working storage from those bounded inputs or fail allocation explicitly.

Failure rules:

- exceeding existing semantic input/result/string-table limits returns the existing `SATORI_SEMANTIC_ERR_RESOURCE_LIMIT_EXCEEDED` path;
- allocation failure returns the existing out-of-memory path;
- a malformed `go.mod` that cannot provide one usable module directive, or duplicate normalized module roots with conflicting module paths, fails semantic resolution rather than falling back to a parent/module-less identity;
- longest-ancestor selection and package-table construction must be deterministic independent of auxiliary/source input order;
- one import path mapping to more than one eligible local package is ambiguous and that import must abstain;
- one qualified callable identity mapping to more than one eligible definition is ambiguous. Replace first-match `def_locs_find()` behavior with a unique lookup/result state so no arbitrary target is emitted;
- an ambiguous source directory/package identity must not fall back to a merged namespace.

### 5. Define the complete Go v2 identity bump

Use these exact production identities:

```text
providerId:          satori-cbm-semantic-go        (unchanged)
semanticRevision:    go-v2
engine/providerVersion:
                     cbm-d150ebe4+satori-go-semantic-v2
environmentConfigId: cbm-go-semantic-v2
relationshipVersion: relationship-v11+go-cbm-v2+python-cross-module-constructors+python-native-resolution-v1
ABI version:         1                              (unchanged)
```

Update all live owners of those identities:

- `third_party/cbm-semantic/satori_semantic.c` engine version;
- `packages/core/assets/semantic-engine/semantic-languages.json` descriptor identity;
- `scripts/build-semantic-engine.mjs` compiled Go semantic revision;
- `packages/core/src/language-analysis/versions.ts` global relationship compatibility identity;
- regenerated JS/WASM artifacts and `semantic-engine.manifest.json`.

When tests are authorized, update assertions that intentionally track the live production identity, including the default-descriptor assertion in `packages/core/src/semantic/descriptor.test.ts` and the engine-version assertion in `packages/core/src/semantic/wasm/wasm-smoke.test.ts`. Audit synthetic descriptors such as `cbm-multi-language-acceptance.test.ts`; do not mechanically rewrite `go-v1` literals whose purpose is merely to exercise a custom descriptor.

The global relationship-version bump intentionally makes pre-promotion Publications relationship-incompatible and requires reindex. Do not add per-Go compatibility or repair machinery to avoid that clean break.

### 6. Remove the test-only Go contribution wrapper

`packages/core/src/relationships/contributions/go.ts` is not used by production dispatch; it only wraps `CbmSemanticContributionEngine("go")` and is imported by its own test. Delete the wrapper and test together when test changes are authorized. Keep Go qualification in the real generic CBM path.

### 7. Do not rebuild deleted MCP graph architecture

Publication relationship navigation is already the sole serving authority. The deleted handler test files, SnapshotManager path, and legacy `core/call-graph.ts`/sidecar manager are not part of this promotion and must not return.

The expected production MCP change is the capability-driven public wording in `packages/mcp/src/tools/call_graph.ts`. Any additional MCP production edit requires a demonstrated failure through the current Publication-backed path.

## Current implementation file map

### Production and generated artifacts

- `third_party/cbm-semantic/satori_semantic.c`
- `packages/core/src/semantic/wasm/wasm-analyzer.ts`
- `packages/core/src/relationships/contributions/cbm.ts`
- `packages/core/assets/semantic-engine/semantic-languages.json`
- `scripts/build-semantic-engine.mjs`
- `packages/core/src/language-analysis/versions.ts`
- `packages/core/src/languages/capabilities.ts`
- `packages/mcp/src/tools/call_graph.ts`
- `README.md`
- `satori-landing/docs/index.html`
- regenerated `packages/core/assets/semantic-engine/satori-semantic-engine.js`
- regenerated `packages/core/assets/semantic-engine/satori-semantic-engine.wasm`
- regenerated `packages/core/assets/semantic-engine/semantic-engine.manifest.json`

### Remove as obsolete duplication when test changes are authorized

- `packages/core/src/relationships/contributions/go.ts`
- `packages/core/src/relationships/contributions/go.test.ts`

### Qualification/evidence files when testing is authorized

- `packages/core/src/relationships/go-call-characterization.test.ts`
- `packages/core/src/relationships/contributions/cbm.test.ts`
- `packages/core/src/generation/semantic-workflow-delta.test.ts`
- `packages/core/src/semantic/descriptor.test.ts`
- `packages/core/src/semantic/wasm/wasm-smoke.test.ts`
- `packages/core/src/semantic/wasm/wasm-engine.test.ts`
- `packages/core/src/relationships/cbm-multi-language-acceptance.test.ts` (audit only; change only production-coupled assertions)
- `packages/core/src/languages/capabilities.test.ts`
- `packages/core/src/languages/evidence.test.ts`
- `packages/core/src/language/registry.test.ts`
- `packages/mcp/src/core/search-group-results.inbound-recovery.test.ts`
- `packages/mcp/src/tools/registry.test.ts` only if its tool-description contract changes
- `fixtures/navigation/go-basic-symbols/svc.go`
- `fixtures/navigation/go-basic-symbols/expected_edges.json`
- `fixtures/navigation/go-basic-symbols/expected_tool_outputs.json`
- `scripts/trufflehog-go-call-graph-product-run.ts`

### Files that should not need production changes

- `packages/core/src/relationships/builder.ts`
- `packages/core/src/generation/index-generation-workflow.ts`
- `packages/core/src/core/context.ts`
- `packages/mcp/src/core/handlers.ts`
- `packages/mcp/src/core/navigation-handlers.ts`
- `packages/mcp/src/core/relationship-backed-call-graph.ts`

A required edit to one of these files is evidence that a generic contract is missing; fix that contract only if the failure is real, and never add a Go-specific branch.

## Task 1: Freeze the direct `calls_v0` semantic boundary

**Production owners:**

- `packages/core/src/semantic/wasm/wasm-analyzer.ts`
- `packages/core/src/relationships/contributions/cbm.ts`

**Implementation:**

- Map raw WASM strategy `UNKNOWN` to semantic `unknown`; do not default unrecognized native strategies to `direct_call`.
- In generic CBM relationship contribution, permit authoritative `CALLS` admission for `direct_call` evidence only while `typeReceiverAwareCapability` is not production-ready.
- Keep non-direct semantic evidence available but non-authoritative for Tier 3.
- Do not add a Go special case: the admission rule must follow the language capability declaration.

**Acceptance:**

- package-local `Func()` and exactly bound imported `pkg.Func()` evidence can reach the existing proof-backed admission path;
- `type_dispatch`, `embed_dispatch`, `interface_dispatch`, `unknown`, and callable-alias/callback evidence cannot become public Go `CALLS` under `calls_v0`;
- the native resolver may continue producing receiver evidence for a future `type_receiver_aware` promotion without changing the public Tier-3 claim.

## Task 2: Correct Go project identity/build selection and produce semantic v2

**Production owners:**

- `third_party/cbm-semantic/satori_semantic.c`
- `packages/core/assets/semantic-engine/semantic-languages.json`
- `scripts/build-semantic-engine.mjs`
- `packages/core/src/language-analysis/versions.ts`
- generated semantic engine artifacts

**Implementation:**

- Build the module/package tables and exact default-import binding described above.
- Exclude build-context-sensitive files from authoritative call source/target registration.
- Make module/package/import/definition ambiguity fail closed with the deterministic rules above.
- Preserve exact target file/byte-span provenance and the 64-byte `SatoriSemanticResultV1` ABI.
- Apply the exact Go v2 identity values above.
- Rebuild the committed semantic engine with the pinned Emscripten toolchain.

**Required non-test checks:**

```bash
pnpm semantic:build
pnpm semantic:verify
```

**Acceptance:**

- ordinary single-module direct calls still resolve observably;
- nearest-`go.mod` ownership works for nested modules;
- module-root `package main` identities do not collide across modules;
- a default import whose declared package name differs from its path basename resolves through the declared name;
- external `_test` packages do not merge into the importable package namespace;
- explicit/implicit build-constrained, `_test.go`, and cgo files cannot create authoritative cross-context targets;
- duplicate/ambiguous package or callable identities never resolve by first/input order;
- malformed/conflicting module ownership and resource overflow cannot silently degrade into fallback identity.

## Task 3: Qualify direct Go behavior while Go remains `symbol_only`

This task is required before promotion and is test work. Execute it only when implementation is explicitly authorized to change/run tests.

Delete the test-only Go wrapper and its test here, then qualify through `WasmSemanticProjectAnalyzer -> CbmSemanticContributionEngine -> central admission`.

Positive qualification cases:

- same-file direct function call;
- cross-file same-package direct function call;
- exact imported package function with explicit alias;
- exact imported package function with default selector derived from `declaredPackageName`, including a versioned import path whose basename differs;
- nested/multi-module imported direct function call;
- same short function name in another module/package is not selected;
- two module-root `package main` projects remain isolated.

Negative/fail-closed qualification cases:

- receiver/type dispatch, embedded dispatch, interface dispatch, callable alias/callback, and unknown strategies produce no authoritative Tier-3 `CALLS`;
- unresolved and duplicate/ambiguous targets produce no authoritative `CALLS`;
- explicit `//go:build` and legacy `// +build` constrained source/target files produce no authoritative edge;
- mutually exclusive GOOS/GOARCH filename-constrained files produce no authoritative edge;
- `_test.go` and external `package foo_test` files do not contaminate ordinary package resolution or produce initial v2 `CALLS`;
- cgo-sensitive files (`import "C"`) produce no authoritative edge;
- source outside all module roots cannot borrow an unrelated module;
- malformed/conflicting module metadata fails closed;
- Go still emits no language-specific `TESTS` relationships.

Use `semantic-workflow-delta.test.ts` only for the existing owner boundary: changing `go.mod`/`go.work` or relevant Go source must cause the whole affected Go semantic project to be reanalyzed for the candidate Publication. Do not create package-scoped incremental machinery in this promotion.

Go remains publicly `symbol_only` until this qualification is green.

## Task 4: Promote the canonical Go capability

**Production owner:** `packages/core/src/languages/capabilities.ts`.

Do not use `fullNavigationLanguage(...)` for Go because it also declares production `testReferenceCapability`. Use a direct declaration unless another current language genuinely needs the same tier.

The promoted Go declaration is exactly:

```text
searchEligibility:            production_ready
parserCapability:             production_ready
symbolExtractionCapability:   production_ready
ownerExtractionCapability:    production_ready
callsCapability:              production_ready
importExportCapability:       none
typeReceiverAwareCapability:  none
testReferenceCapability:      none
publicClaim:                  calls_v0
```

When test/evidence changes are authorized:

- add `fixtures.calls` pointing at direct-call Go qualification evidence;
- move Go out of `symbol_only` expectations and into the production call-graph set;
- update language-evidence expectations so Go call-graph readiness requires compatible Publication relationship navigation;
- update `.go` registry expectations so `callGraph`, `callGraphBuild`, and `callGraphQuery` are true;
- make `fixtures/navigation/go-basic-symbols` contain one deterministic direct function call and change its public graph expectation from `unsupported_language` to ready.

**Acceptance:** the capability flip makes production `buildRelationshipsForRegistry()` admit qualified Go through the existing generic `cbm_semantic` path. No Go branch is added to the builder, workflow, Context, or MCP serving code.

## Task 5: Update current public MCP/docs claims

The Publication-backed serving path already supports any language whose canonical capability says `callGraphQuery` and whose current Publication has compatible relationship navigation.

**Production/docs changes:**

- make `packages/mcp/src/tools/call_graph.ts` capability-based rather than hard-coded to TS/JS/Python;
- update `README.md` to list Go as production `calls_v0` while keeping the claim explicitly conservative/direct-call and advisory;
- update `satori-landing/docs/index.html` so Go leaves the `symbol_only` group and does not imply receiver/type-aware support.

When tests are authorized:

- move the generic `unsupported_language` witness in `packages/mcp/src/core/search-group-results.inbound-recovery.test.ts` from Go to a language that remains symbol-only, such as Rust;
- update `packages/mcp/src/tools/registry.test.ts` only where its description contract is affected;
- do not recreate deleted handler tests merely to add a Go case.

**Acceptance:** a Go symbol is graph-ready only when both the Go capability and current Publication relationship navigation are compatible; missing/incompatible navigation keeps the existing structured not-ready/reindex behavior.

## Task 6: Prove the real public path on TruffleHog

This is qualification/test work and requires explicit authorization before creation or execution.

Create `scripts/trufflehog-go-call-graph-product-run.ts`, modeled directly on `scripts/trufflehog-mvcc-product-run.ts` without introducing a shared harness abstraction.

The witness must:

- require clean Satori and TruffleHog worktrees;
- hold one exact Satori HEAD and one exact TruffleHog HEAD;
- build the exact Satori HEAD and use isolated Satori state;
- use one live MCP runtime for create/status polling because mutation phase/progress/error are process-lifetime state;
- index `/home/hamza/repo/trufflehog` through public `manage_index`;
- search for `CheckPackageDir` in `hack/checksecretparts/check.go` and require its canonical result to report `navigation.graph="ready"`;
- call `call_graph(direction="callees")` and require the direct `CheckPackageDir -> checkFiles` edge;
- resolve `checkFiles`, call `call_graph(direction="callers")`, and require `CheckPackageDir`;
- require call site, files, symbol IDs, and `navigationAuthority.publicationId` to agree with the serving Publication;
- leave both repositories clean and remove isolated state in `finally` unless an explicitly requested debugging mode preserves it.

The real witness is intentionally a direct single-module call. Synthetic qualification owns nested modules, build constraints, package-name mismatches, and ambiguity negatives.

## Task 7: Freeze one candidate and qualify it

Complete production, generated, test/evidence, and docs changes before freezing the candidate HEAD. Do not record a qualification receipt and then create another functional commit.

Without test authorization, do not start this promotion wave. The following non-test commands remain useful implementation checks but are not sufficient to ship `calls_v0`:

```bash
pnpm semantic:verify
pnpm run check
pnpm run build
```

When explicit testing/release qualification is authorized, run the exact-head promotion gates:

```bash
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-mcp test
pnpm run release:check
pnpm --filter @zokizuan/satori-mcp exec tsx ../../scripts/trufflehog-go-call-graph-product-run.ts
```

All qualification commands must run on the same exact HEAD. Stop when they pass; do not begin another language in the same wave.

## Promotion exit criteria

Go may be called production `calls_v0` only when all of these are true on one exact candidate:

1. Public CBM admission accepts only Tier-3 direct-call strategies for Go; receiver/type/embedded/interface/callback/unknown semantic evidence is not exposed as authoritative `CALLS`.
2. Every source binds to deterministic nearest-`go.mod` ownership, with package/import identity using exact import path plus declared package name.
3. Build-tagged, GOOS/GOARCH-specific, `_test.go`, external-test-package, and cgo-sensitive files cannot create authoritative cross-context edges.
4. Direct same-file, same-package cross-file, explicit-alias import, default-declared-name import, nested-module, and multi-module cases bind exact target file/span/instance identities.
5. Ambiguous package/import/callable identities, malformed/conflicting module ownership, unresolved calls, and resource-limit paths fail closed; no first/input-order target wins.
6. Go v2 identity is exactly `go-v2` / `cbm-d150ebe4+satori-go-semantic-v2` / `cbm-go-semantic-v2` / `relationship-v11+go-cbm-v2+python-cross-module-constructors+python-native-resolution-v1`, with ABI v1 unchanged.
7. Production indexing admits Go only through generic `cbm_semantic` dispatch; there is no Go branch in the generic workflow/builder/serving path.
8. Go capability metadata reports `calls_v0` while imports/exports, `type_receiver_aware`, and test-reference tiers remain disabled.
9. Search/file-outline graph hints require compatible Publication relationship navigation, and public `call_graph` traverses the serving Publication's Go `RelationshipRecord`s in both directions.
10. The TruffleHog witness proves direct `CheckPackageDir -> checkFiles` end to end on the same qualified HEAD.
11. Required semantic/build checks and explicitly authorized Core/MCP/release/product gates pass on that exact HEAD.
12. The repository is clean after qualification.

After promotion, Go is the reference Tier-3 CBM language: future CBM `calls_v0` promotions should reuse descriptor -> semantic engine -> generic CBM direct-call admission -> capability gate -> Publication relationship navigation -> public `call_graph`. Receiver/type-aware promotion is a separate later tier.
