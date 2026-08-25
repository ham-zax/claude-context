# Go `calls_v0` Promotion Implementation Plan

**Goal:** Promote Go from `symbol_only` to production `calls_v0` using the existing CBM/WASM relationship pipeline, then prove the public `search_codebase -> call_graph` product path on a real Go repository.

**Architecture:** Keep Go relationship extraction inside the generic `cbm_semantic` path. CBM/WASM resolves calls and emits exact target provenance; Satori binds those facts to canonical `SymbolRecord`s, publishes `RelationshipRecord`s, and exposes them through the existing relationship-backed `call_graph`. The promotion must not add Go branches to `Context`, `IndexGenerationWorkflow`, or `relationships/builder.ts`.

**Tech Stack:** TypeScript, Node.js, CBM-derived C11 semantic engine, Emscripten/WASM, Tree-sitter Go, MCP relationship-backed navigation.

## Global Constraints

- Preserve the qualified MVCC baseline at or after `203cd09dc94119d19287884e9c1fd2d0d1d76847`.
- Do not modify, reformat, rename, or absorb the separate cleanup plan being written by the other agent. Re-read `git status` before implementation and leave its files untouched.
- Keep this work limited to Go relationship correctness, capability promotion, public Go graph behavior, and the qualification needed to prove them.
- Do not add `if (language === "go")` branches to `packages/core/src/relationships/builder.ts`, `packages/core/src/generation/index-generation-workflow.ts`, or `packages/core/src/core/context.ts`.
- Keep Go `TESTS` relationship production disabled in this phase. Public Go promotion is `CALLS v0`, not test-reference parity.
- Ambiguous or unproven targets must abstain. A wrong authoritative edge is a release blocker; lower recall is acceptable.
- Do not expose Go merely because the WASM backend supports it. Promotion occurs only after relationship qualification passes.
- Preserve the current public `call_graph` request/response contract. Do not add a Go-specific MCP tool or response shape.
- If the cleanup work removes a legacy call-graph path before implementation starts, adapt this plan to the cleaned tree instead of restoring that path.

## Design Decision: Fix Module Ownership Before Promotion

The current native Go resolver calls `extract_module_name()` once and applies the first discovered `go.mod` module path to every source file. That is incorrect for nested or multi-module repositories.

Do not ship a global Go `calls_v0` claim with silent empty results on multi-module repositories. The current capability model is language-global and does not provide a clean per-repository "Go graph unsupported because multiple modules exist" state. Fix module ownership instead:

- parse every `go.mod` auxiliary into `{ moduleRoot, modulePath }`;
- assign each `.go` source to its nearest ancestor `go.mod`;
- compute package identity from the source path relative to that module root;
- preserve the current single-root-module identity exactly;
- treat `go.work` as a semantic topology/invalidation input in this version; module ownership comes from `go.mod` roots;
- sources outside any module must not borrow an unrelated module path.

This makes single-module and nested-module repositories truthful without widening the public MCP contract.

## File Map

Primary implementation files:

- `third_party/cbm-semantic/satori_semantic.c` — Go module ownership and package-qualified-name construction.
- `packages/core/assets/semantic-engine/semantic-languages.json` — Go semantic/provider revision.
- `scripts/build-semantic-engine.mjs` — compiled Go semantic revision recorded in the manifest.
- `packages/core/src/relationships/contributions/go.ts` — Go provider version constants, if this wrapper still exists after cleanup.
- `packages/core/src/language-analysis/versions.ts` — relationship fingerprint version bump so old relationship state cannot be reused as Go-v2 truth.
- `packages/core/assets/semantic-engine/satori-semantic-engine.js` — regenerated committed runtime.
- `packages/core/assets/semantic-engine/satori-semantic-engine.wasm` — regenerated committed runtime.
- `packages/core/assets/semantic-engine/semantic-engine.manifest.json` — regenerated source/artifact digests and Go revision.

Qualification and capability files:

- `packages/core/src/relationships/go-call-characterization.test.ts`
- `packages/core/src/relationships/builder.test.ts`
- `packages/core/src/relationships/contributions/cbm.test.ts` only if a generic admission invariant is missing; do not duplicate existing generic cases.
- `packages/core/src/semantic/descriptor.test.ts`
- `packages/core/src/semantic/wasm/wasm-smoke.test.ts`
- `packages/core/src/languages/capabilities.ts`
- `packages/core/src/languages/capabilities.test.ts`
- `packages/core/src/languages/evidence.test.ts`
- `packages/core/src/language/registry.test.ts`
- `fixtures/navigation/go-basic-symbols/svc.go`
- `fixtures/navigation/go-basic-symbols/expected_symbols.json`
- `fixtures/navigation/go-basic-symbols/expected_edges.json`
- `fixtures/navigation/go-basic-symbols/expected_tool_outputs.json`

Public MCP files:

- `packages/mcp/src/core/handlers.file_outline.test.ts`
- `packages/mcp/src/core/handlers.call_graph.test.ts`
- `packages/mcp/src/core/handlers.scope.test.ts`
- `packages/mcp/src/core/handlers.golden.test.ts`
- `packages/mcp/src/core/search-group-results.inbound-recovery.test.ts` if it still uses Go as the unsupported-language witness.
- `packages/mcp/src/tools/call_graph.ts`
- `packages/mcp/src/tools/registry.test.ts`
- `packages/mcp/src/core/call-graph.ts` only if the still-live legacy sidecar manager produces false Go support after the capability flip. Do not broaden its syntactic graph builder to Go.

Product qualification:

- Create `scripts/trufflehog-go-call-graph-product-run.ts` as a bounded public-tool witness, modeled on the existing Task-7 TruffleHog harness patterns.

## Task 1: Correct Go module/package identity in the native semantic engine

**Files:**
- Modify: `third_party/cbm-semantic/satori_semantic.c`
- Modify: `packages/core/assets/semantic-engine/semantic-languages.json`
- Modify: `scripts/build-semantic-engine.mjs`
- Modify: `packages/core/src/relationships/contributions/go.ts` if still present
- Modify: `packages/core/src/language-analysis/versions.ts`
- Regenerate: `packages/core/assets/semantic-engine/satori-semantic-engine.js`
- Regenerate: `packages/core/assets/semantic-engine/satori-semantic-engine.wasm`
- Regenerate: `packages/core/assets/semantic-engine/semantic-engine.manifest.json`

**Interfaces:**
- Consumes: `SemanticProjectInput.sourceFiles`, semantic auxiliaries for `go.mod` / `go.sum` / `go.work`.
- Produces: the same `SatoriSemanticResultV1` ABI and exact target provenance, with corrected package identities.

**Steps:**
- [ ] Replace the one-global-module `extract_module_name()` model with a bounded module-manifest table parsed from all `go.mod` auxiliaries.
- [ ] Normalize each manifest path to its module root directory and parse one non-empty `module` directive.
- [ ] For each source file, select the deepest module root that is an ancestor path boundary of that source.
- [ ] Build the package qualified name from `modulePath + sourceDirectoryRelativeToModuleRoot`; do not append the repository-relative module-root prefix twice.
- [ ] Preserve root `go.mod` behavior for ordinary single-module repositories.
- [ ] For a source outside every known module root, retain module-less repository-relative package identity rather than borrowing the first manifest.
- [ ] Keep imported package paths as the package identity used for cross-package binding so imports can resolve across sibling/nested modules when their module paths match.
- [ ] Bump the Go semantic revision/provider identity from v1 to v2 and bump the relationship fingerprint's Go component so existing indexes require relationship regeneration.
- [ ] Rebuild the committed semantic engine with the pinned Emscripten toolchain.

**Acceptance criteria:**
- A root-module project produces the same target identities it produces today.
- A nested module does not receive the parent/root module path.
- Two modules with the same short package/function names resolve an imported call to the exact module-qualified target.
- A source outside all module roots cannot resolve through an unrelated `go.mod`.
- The 64-byte semantic ABI and exact byte-span target provenance remain unchanged.

**Required validation:**

```bash
pnpm semantic:build
pnpm semantic:verify
```

## Task 2: Complete Go relationship qualification while Go is still unpromoted

**Files:**
- Modify: `packages/core/src/relationships/go-call-characterization.test.ts`
- Modify: `packages/core/src/relationships/builder.test.ts` only for missing Go-specific delta behavior
- Modify: `packages/core/src/semantic/wasm/wasm-smoke.test.ts`
- Modify: `packages/core/src/semantic/descriptor.test.ts`

**Interfaces:**
- Consumes: real `WasmSemanticProjectAnalyzer` evidence plus `buildRelationshipsForRegistry(..., mode: { kind: "qualification", enabledUnpromotedCallLanguages: new Set(["go"]) })`.
- Produces: qualification evidence sufficient to permit the capability flip in Task 3.

**Steps:**
- [ ] Keep the existing direct function, receiver-method, and test-file `CALLS` characterization.
- [ ] Add a cross-file same-package call case.
- [ ] Add an imported package alias case and require the exact target instance/span.
- [ ] Add a nested/multi-module case that proves nearest-`go.mod` ownership and correct cross-module import resolution.
- [ ] Add a same-name decoy in another module/package and prove it is never selected by name alone.
- [ ] Add unresolved and ambiguous Go calls and require zero authoritative `CALLS` records for those sites.
- [ ] Preserve the existing generic CBM admission tests for missing provenance, exact-span mismatch, and non-callable caller binding instead of copying those cases into Go-specific files.
- [ ] Preserve the existing relationship-delta proof that a changed target is retargeted to the new `symbolInstanceId`.
- [ ] Keep the assertion that Go emits no language-specific `TESTS` edges.

**Acceptance criteria:**
- Every resolved Go `CALLS` edge has an exact caller symbol, exact target instance, exact target file/span, and proof-backed authority.
- Wrong-edge count in the qualification corpus is zero.
- Ambiguous/unresolved/missing-proof sites produce no authoritative edge.
- Nested-module package identity is correct.
- Go remains publicly `symbol_only` throughout this task.

## Task 3: Promote the canonical capability declaration

**Files:**
- Modify: `packages/core/src/languages/capabilities.ts`
- Modify: `packages/core/src/languages/capabilities.test.ts`
- Modify: `packages/core/src/languages/evidence.test.ts`
- Modify: `packages/core/src/language/registry.test.ts`
- Modify: `fixtures/navigation/go-basic-symbols/svc.go`
- Modify: `fixtures/navigation/go-basic-symbols/expected_symbols.json`
- Modify: `fixtures/navigation/go-basic-symbols/expected_edges.json`
- Modify: `fixtures/navigation/go-basic-symbols/expected_tool_outputs.json`

**Interfaces:**
- Consumes: the qualified CBM Go relationship provider from Tasks 1–2.
- Produces: `callsCapability: "production_ready"`, `publicClaim: "calls_v0"`, and derived `callGraphBuild/callGraphQuery: true` for Go.

**Steps:**
- [ ] Represent Go as symbol + owner + call-graph production support while leaving imports/exports, type-receiver-aware public tier, and test-reference capability unchanged.
- [ ] Add `fixtures.calls` pointing at the concrete Go relationship qualification evidence required by the capability-matrix contract.
- [ ] Update capability tier/count tests so Go leaves the `symbol_only` set and enters the production call-graph set.
- [ ] Update language-evidence tests so Go requires compatible relationship evidence when reporting healthy `calls_v0` capability.
- [ ] Update `language/registry` expectations so `.go` has `callGraph`, `callGraphBuild`, and `callGraphQuery` enabled.
- [ ] Turn the Go navigation fixture into real relationship truth: add one deterministic call to `svc.go`, record the expected edge, and change public tool expectations from `unsupported_language` to graph-ready behavior.

**Acceptance criteria:**
- The capability flip alone makes generic production relationship construction admit Go through `cbm_semantic`; no change is needed in `builder.ts` or `IndexGenerationWorkflow`.
- Search/file-outline graph hints can become ready for Go only when compatible relationship state exists.
- Go remains honest about unsupported capabilities: no Go-specific `TESTS`, imports/exports, or type-aware public claim is implied by `calls_v0`.

## Task 4: Make the public MCP path truthful for Go without creating a second Go graph implementation

**Files:**
- Modify: `packages/mcp/src/core/handlers.file_outline.test.ts`
- Modify: `packages/mcp/src/core/handlers.call_graph.test.ts`
- Modify: `packages/mcp/src/core/handlers.scope.test.ts`
- Modify: `packages/mcp/src/core/handlers.golden.test.ts`
- Modify: `packages/mcp/src/core/search-group-results.inbound-recovery.test.ts` if applicable
- Modify: `packages/mcp/src/tools/call_graph.ts`
- Modify: `packages/mcp/src/tools/registry.test.ts`
- Conditional: `packages/mcp/src/core/call-graph.ts`

**Interfaces:**
- Consumes: generic capability checks and published symbol/relationship sidecars.
- Produces: public Go `navigation.graph="ready"` hints and relationship-backed `call_graph` results.

**Steps:**
- [ ] Replace the current Go `file_outline` unsupported test with a Go graph-ready case backed by a compatible relationship sidecar.
- [ ] Add a handler-level Go callee/caller traversal witness and require canonical `symbolInstanceId` identities.
- [ ] Move generic `unsupported_language` golden/scope witnesses from Go to a language that remains symbol-only, such as Rust.
- [ ] Change the public `call_graph` tool description from a hard-coded TS/JS/Python list to capability-based wording so adding the next language does not require another description edit.
- [ ] Keep missing/incompatible relationship-sidecar behavior unchanged: promoted Go must still return the same structured `not_ready` states when publication evidence is absent or incompatible.
- [ ] Inspect the surviving `CallGraphSidecarManager` after the cleanup plan lands. If the Go capability flip causes that legacy syntactic sidecar to claim or rebuild Go, keep Go out of that legacy builder; public Go graph truth must come from the canonical relationship sidecar. If cleanup already removes the path, make no replacement.

**Acceptance criteria:**
- `search_codebase` or `file_outline` can hand a Go canonical symbol directly to `call_graph`.
- `call_graph` returns Go callers/callees from published `RelationshipRecord`s.
- No legacy/syntactic Go graph is introduced as a parallel source of truth.
- Rust and other unpromoted languages still return `unsupported_language`.

## Task 5: Add a real-product Go call-graph qualification witness

**Files:**
- Create: `scripts/trufflehog-go-call-graph-product-run.ts`

**Interfaces:**
- Consumes: public MCP tools through `CliMcpSession`, an isolated Satori state root, and a clean TruffleHog checkout.
- Produces: an exact-head pass/fail receipt for real public Go graph behavior.

**Steps:**
- [ ] Follow the existing TruffleHog product-harness conventions: assert both worktrees are clean, build exact Satori HEAD, use isolated Satori state, and restore/clean temporary state in `finally`.
- [ ] Index `/home/hamza/repo/trufflehog` at its exact clean HEAD. The current checkout is a single Go module (`./go.mod`), so it is a stable public-product witness independent of the synthetic multi-module qualification in Task 2.
- [ ] Search for `CheckPackageDir` in `hack/checksecretparts/check.go` and require the returned canonical target to report graph-ready navigation.
- [ ] Call `call_graph(direction="callees")` for that exact symbol and require the direct `CheckPackageDir -> checkFiles` edge.
- [ ] Resolve `checkFiles` and call `call_graph(direction="callers")`; require `CheckPackageDir` as a caller.
- [ ] Require source file, caller/callee symbol identity, direction, and relationship site to agree with the published generation.
- [ ] Require the harness to leave TruffleHog and Satori clean.

**Acceptance criteria:**
- A real indexed Go repository completes `search_codebase -> call_graph` through the public MCP surface.
- Both callee and caller traversal return the expected real relationship.
- The result is served from the current published generation, not a manually seeded test sidecar.

## Task 6: Exact-head release qualification and stop condition

**Files:**
- No new production files unless a failing gate demonstrates a real owner-local defect.
- Update architectural/status documentation only after the final qualified HEAD is fixed; do not create another functional HEAD after recording the receipt.

**Steps:**
- [ ] Freeze the candidate HEAD after the last necessary source/test change.
- [ ] Run semantic reproducibility verification.
- [ ] Run workspace checks.
- [ ] Run full Core and MCP suites because the capability promotion changes production build/query gates and public navigation behavior.
- [ ] Run the packed release qualification.
- [ ] Run the real TruffleHog Go call-graph product witness on the same exact HEAD.
- [ ] Confirm `git status --short` is clean except for any separate cleanup-plan artifact owned by the other agent; do not edit that artifact.
- [ ] Stop when all gates pass. Do not begin the next language in the same implementation wave.

**Required final gates:**

```bash
pnpm semantic:verify
pnpm run check
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-mcp test
pnpm run release:check
pnpm --filter @zokizuan/satori-mcp exec tsx ../../scripts/trufflehog-go-call-graph-product-run.ts
```

## Promotion Exit Criteria

Go is production `calls_v0` only when all of these are true on one exact HEAD:

1. Real CBM/WASM Go call extraction passes direct, receiver, package-alias, and nested-module qualification.
2. Ambiguous/unresolved/unproven calls abstain with zero wrong authoritative edges.
3. Production indexing admits Go through the generic `cbm_semantic` dispatch with no Go branch in the generic workflow/builder.
4. Go capability metadata reports `calls_v0` and requires compatible relationship evidence.
5. Public `search_codebase`/`file_outline` publishes graph-ready Go symbol refs only when relationship state is compatible.
6. Public `call_graph` traverses Go relationship records in both caller and callee directions.
7. The real TruffleHog witness proves `CheckPackageDir -> checkFiles` end to end.
8. Semantic verification, Core, MCP, packed release qualification, and the product witness all pass on the same exact HEAD.

After this point, Go is the reference CBM language. The next-language plan should reuse the same descriptor -> semantic engine -> generic CBM contribution -> capability qualification -> public `call_graph` path rather than adding language-specific pipeline machinery.
