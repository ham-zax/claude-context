# Go `calls_v0` Promotion Implementation Plan

**Rebaseline:** 2026-08-25 against `5de0dde383548caa4beddca73744c7f5145cfc68`, after the Publication clean break.

**Readiness:** Ready with the changes below. The original product goal remains sound; the cleanup removed several stale MCP owners and made the promotion materially simpler.

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

- Keep the work limited to Go call-resolution correctness, the Go capability declaration, current-facing Go graph claims, and the evidence needed to justify promotion.
- Do not add `if (language === "go")` branches to `packages/core/src/relationships/builder.ts`, `packages/core/src/generation/index-generation-workflow.ts`, `packages/core/src/core/context.ts`, or MCP navigation handlers.
- Keep Go `TESTS`, imports/exports, and type-receiver-aware public tiers unchanged. This promotion is `CALLS v0` only.
- Preserve the public `call_graph` request/response contract. Do not add a Go-specific MCP tool or response shape.
- Ambiguous, duplicate, unresolved, or unproven targets must abstain. A wrong authoritative edge is a blocker; lower recall is acceptable.
- Do not add a second graph store, sidecar, compatibility reader, or Go-specific Publication format.
- Do not introduce a helper abstraction only for Go if the existing generic CBM path already owns the behavior.
- This plan does not itself authorize test creation or execution. Full promotion requires explicit testing authorization when implementation begins; without it, do not start the promotion wave because the semantic identity change and capability flip must land with their qualification evidence.

## Rebaseline decisions

### 1. Fix module ownership in the native semantic engine

The existing `extract_module_name()` model is not safe for nested or multi-module repositories. Replace it with one bounded module table built from all `go.mod` auxiliaries.

Each `.go` source must bind to the deepest `go.mod` module root that is an ancestor path boundary of the source. `go.work` remains an observed invalidation/topology input; module ownership comes from `go.mod` roots.

### 2. Canonicalize module-owned package identity to import-path identity

The first plan said to preserve the internal root-module identity exactly. That is too strict: the current special case maps a module-root `package main` to the global string `"main"`, which can collide across nested modules.

Preserve observable single-module resolution behavior, not that internal string. For every module-owned package, including a module-root `package main`, use the canonical import-path identity:

```text
modulePath + sourceDirectoryRelativeToModuleRoot
```

At the module root, the package identity is the module path itself. A source outside every known module keeps the existing module-less repository-relative fallback and must not borrow an unrelated module path.

### 3. Remove the test-only Go contribution wrapper instead of versioning it

`packages/core/src/relationships/contributions/go.ts` is not used by production dispatch; it wraps `CbmSemanticContributionEngine("go")` and is referenced only by its own test. Keeping separate provider constants there duplicates the descriptor as a second truth source.

Delete that wrapper and its wrapper-only test during the promotion. Keep Go-specific qualification in `go-call-characterization.test.ts` and generic admission behavior in the existing CBM tests.

### 4. Keep the existing global relationship compatibility boundary

Publication/symbol/relationship compatibility is keyed by the global `relationshipVersion`; the relationship manifest does not carry a per-language semantic-provider compatibility map. A Go semantic/provider change therefore cannot safely reuse a pre-promotion Publication once Go becomes publicly graph-capable.

Bump `RELATIONSHIP_BUILDER_VERSION` for Go v2 and accept the existing clean-break consequence: pre-promotion Publications become relationship-incompatible and require reindex after the upgrade. Do not add a per-Go compatibility reader, repair path, or second version mechanism just to avoid that reindex.

### 5. Do not rebuild deleted MCP test/sidecar architecture

The old plan named deleted files such as `handlers.call_graph.test.ts`, `handlers.file_outline.test.ts`, and `core/call-graph.ts`. They are no longer owners. The current public path already consumes Publication relationship navigation and capability gates.

The expected production MCP change is only the capability-driven tool wording in `packages/mcp/src/tools/call_graph.ts`. Any further MCP production edit requires a demonstrated failure after the capability flip.

## Current implementation file map

### Production and generated artifacts

- `third_party/cbm-semantic/satori_semantic.c`
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

The wrapper is imported only by its test, so delete both in the same authorized change. Do not delete `go.ts` alone.

### Qualification/evidence files when testing is authorized

- `packages/core/src/relationships/go-call-characterization.test.ts`
- `packages/core/src/generation/semantic-workflow-delta.test.ts`
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

A required edit to one of these files is evidence that a generic contract is missing; fix that contract only if the failure is real, and do not add a Go branch.

## Task 1: Correct Go module/package identity and regenerate the semantic engine

**Files:**

- Modify `third_party/cbm-semantic/satori_semantic.c`.
- Modify `packages/core/assets/semantic-engine/semantic-languages.json`.
- Modify `scripts/build-semantic-engine.mjs`.
- Modify `packages/core/src/language-analysis/versions.ts`.
- Regenerate the committed JS/WASM runtime and manifest.

The test-only Go contribution wrapper is removed with its importing test in Task 2, not ahead of it.

**Implementation:**

- Replace `extract_module_name()` with a bounded table of `{ moduleRoot, modulePath }` parsed from every `go.mod` auxiliary.
- Treat the repository-root module root as `""`; nested module roots are normalized slash-separated repository-relative directories.
- Ignore `go.sum` and `go.work` for ownership. They remain observable semantic inputs and therefore already participate in Publication source freshness and delta invalidation.
- For each `.go` source, choose the longest module root that matches the source at a path-component boundary.
- For a module-owned source, compute package identity from the owning `modulePath` plus the source directory relative to that module root. Do not append the repository-relative module-root prefix twice.
- Use the module path itself for a source at the module root, including `package main`; do not collapse module-root main packages to the global `"main"` identity.
- For a source outside all module roots, keep the existing module-less repository-relative package fallback.
- Keep imported Go package paths as the package identity used for cross-package binding.
- Make target lookup unique. The current `def_locs_find()` returns the first matching qualified name; replace or constrain it so duplicate qualified targets abstain instead of selecting an arbitrary definition.
- Preserve the `SatoriSemanticResultV1` ABI and exact target file/byte-span provenance.
- Bump Go semantic identity from v1 to v2 in the descriptor/build recipe and bump the global relationship version's Go component from `go-cbm-v1` to `go-cbm-v2` so existing Publications cannot be treated as Go-v2 relationship truth. This intentionally requires reindex for pre-promotion Publications under the current clean-break compatibility contract.
- Rebuild the committed semantic engine with the pinned Emscripten toolchain.

**Acceptance:**

- A normal single-module repository still resolves the same observable calls.
- A nested source uses its nearest module path, not the first/root manifest.
- Two modules with the same short package/function names but different module paths bind imports to the exact module-qualified target.
- Two definitions that collapse to the same qualified identity do not produce a first-match authoritative edge.
- A source outside every module cannot resolve through an unrelated `go.mod`.
- Module-root `package main` identities do not collide across modules.
- The native ABI remains 64 bytes and target provenance remains exact.

**Required non-test checks:**

```bash
pnpm semantic:build
pnpm semantic:verify
```

## Task 2: Qualify Go relationship behavior while Go remains `symbol_only`

This task is required before promotion but is test work. Execute it only when the implementation request explicitly authorizes test changes/execution.

Reuse the real owners already present:

- Delete `packages/core/src/relationships/contributions/go.ts` together with `packages/core/src/relationships/contributions/go.test.ts`; production already dispatches through the generic CBM engine.
- `packages/core/src/relationships/go-call-characterization.test.ts` for end-to-end semantic evidence -> canonical `RelationshipRecord` qualification.
- `packages/core/src/generation/semantic-workflow-delta.test.ts` for auxiliary/source invalidation and whole-language semantic reanalysis.
- Existing generic CBM admission tests for proof, exact-span, callable-caller, and ambiguity contracts. Do not copy those cases into Go-specific files.

Qualification must cover:

- existing direct function calls;
- existing receiver-method calls;
- cross-file same-package calls;
- imported package aliases;
- nested modules with nearest-`go.mod` ownership;
- two modules with the same short package/function names but different module paths;
- module-root `package main` in more than one module;
- source outside all module roots;
- unresolved calls;
- duplicate/ambiguous target identities;
- zero authoritative `CALLS` for any unproven case;
- no Go-specific `TESTS` relationships.

Go remains publicly `symbol_only` until this qualification is green.

## Task 3: Promote the canonical Go capability

**Production owner:** `packages/core/src/languages/capabilities.ts`.

Do not use `fullNavigationLanguage(...)` for Go because that helper also declares production `testReferenceCapability`. Go needs symbol/owner support plus production calls, with tests/imports/type-aware tiers still disabled. Use one direct declaration unless another current language genuinely needs the same tier.

The promoted Go declaration must be:

- `searchEligibility: production_ready`
- `parserCapability: production_ready`
- `symbolExtractionCapability: production_ready`
- `ownerExtractionCapability: production_ready`
- `callsCapability: production_ready`
- `importExportCapability: none`
- `typeReceiverAwareCapability: none`
- `testReferenceCapability: none`
- `publicClaim: calls_v0`

When test/evidence changes are authorized:

- add `fixtures.calls` pointing to the real Go relationship qualification;
- move Go out of the `symbol_only` expectations and into the production call-graph set;
- update language-evidence expectations so Go call-graph readiness requires compatible Publication relationship navigation;
- update the registry expectation so `.go` derives `callGraph`, `callGraphBuild`, and `callGraphQuery` as true;
- add one deterministic call to `fixtures/navigation/go-basic-symbols/svc.go`, record the expected edge, and change its public navigation expectation from `unsupported_language` to graph-ready.

**Acceptance:** the capability flip alone admits Go into production `buildRelationshipsForRegistry()` through generic `cbm_semantic` dispatch. No Go branch is added to the builder or workflow.

## Task 4: Make current public MCP/docs claims capability-driven

The cleanup already completed the serving architecture. Do not recreate old handler/sidecar code.

**Production changes:**

- Change `packages/mcp/src/tools/call_graph.ts` from the hard-coded "TS/JS/Python" description to capability-based wording.
- Update `README.md` so the current call-graph support text names Go as production `calls_v0` after the capability flip.
- Update `satori-landing/docs/index.html` so Go no longer appears in the `symbol_only` group.

No production edit is expected in `handlers.ts`, `navigation-handlers.ts`, or `relationship-backed-call-graph.ts`: they already gate by `callGraphQuery`, load compatible Publication relationship navigation, and traverse `RelationshipRecord`s.

When tests are authorized:

- move the generic `unsupported_language` witness in `packages/mcp/src/core/search-group-results.inbound-recovery.test.ts` from Go to a language that remains symbol-only, such as Rust;
- update `packages/mcp/src/tools/registry.test.ts` only if it snapshots or asserts the changed tool description;
- do not resurrect the deleted handler test suite merely to add a Go case. The real public path is better proven by the product witness below.

**Acceptance:** a Go symbol is graph-ready only when both the capability and current Publication relationship navigation are compatible; missing/incompatible navigation keeps the existing structured reindex/not-ready behavior.

## Task 5: Real TruffleHog public-product witness

This is qualification/test work and requires explicit authorization before creation or execution.

Create `scripts/trufflehog-go-call-graph-product-run.ts`, modeled on `scripts/trufflehog-mvcc-product-run.ts` without creating a shared harness abstraction.

The witness must:

- require clean Satori and TruffleHog worktrees;
- record and hold one exact Satori HEAD and one exact TruffleHog HEAD;
- build the exact Satori HEAD and use an isolated Satori state root;
- use one live MCP runtime for create/status polling because mutation phase/progress/error are process-lifetime state;
- index `/home/hamza/repo/trufflehog` through public `manage_index`;
- search for `CheckPackageDir` in `hack/checksecretparts/check.go` and require a canonical target with `navigation.graph="ready"`;
- call public `call_graph(direction="callees")` for that returned target and require `CheckPackageDir -> checkFiles`;
- resolve `checkFiles`, call `call_graph(direction="callers")`, and require `CheckPackageDir`;
- require call site, files, symbol IDs, and `navigationAuthority.publicationId` to agree with the current Publication;
- leave both repositories clean and remove isolated state in `finally` unless an explicitly requested debugging mode preserves it.

The real repository witness is intentionally single-module. Synthetic qualification in Task 2 owns nested/multi-module correctness.

## Task 6: Freeze one candidate and qualify it

Complete all production/docs changes before freezing the candidate HEAD. Do not write a receipt and then create another functional commit.

Without test authorization, the candidate-final checks are limited to the relevant non-test gates:

```bash
pnpm semantic:verify
pnpm run check
pnpm run build
```

A production `calls_v0` claim is not complete without the qualification lane. When explicit testing/release qualification is authorized, run the proportional exact-head gates needed to prove the capability:

```bash
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-mcp test
pnpm run release:check
pnpm --filter @zokizuan/satori-mcp exec tsx ../../scripts/trufflehog-go-call-graph-product-run.ts
```

All qualification commands must run on the same exact HEAD. Stop when the required gates pass; do not begin another language in this wave.

## Promotion exit criteria

Go may be called production `calls_v0` only when all of these are true:

1. Module ownership is nearest-`go.mod`, and module-owned package identity is canonical import-path identity.
2. Direct, receiver, alias, cross-file, nested-module, and multi-module call cases resolve to exact target file/span/instance identities.
3. Ambiguous, duplicate, unresolved, and unproven calls produce zero wrong authoritative edges.
4. Production indexing admits Go only through generic `cbm_semantic` dispatch; there is no Go branch in the generic workflow/builder.
5. Go capability metadata reports `calls_v0` while imports/exports, type-aware, and test-reference tiers remain unchanged.
6. Search/file-outline graph hints require compatible Publication relationship navigation.
7. Public `call_graph` traverses Go `RelationshipRecord`s in caller and callee directions from the serving Publication.
8. The TruffleHog witness proves `CheckPackageDir -> checkFiles` through the public MCP surface on the exact qualified HEAD.
9. Required semantic/build checks and explicitly authorized qualification/release gates pass on that same HEAD.
10. The repository is clean after qualification.

After promotion, Go is the reference CBM language: future CBM language promotions should reuse descriptor -> semantic engine -> generic CBM contribution -> capability gate -> Publication relationship navigation -> public `call_graph`, not add language-specific pipeline machinery.
