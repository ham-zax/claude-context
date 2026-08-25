# Agent B — Go `calls_v0` Qualification While `symbol_only`

**Repository:** `/home/hamza/repo/satori`
**Artifact type:** mixed executable/test evidence
**Workspace:** `/home/hamza/repo/satori-agent-b-go-calls-v0`
**Branch:** `agent/go-calls-v0-b-qualification`
**Isolation reason:** reuse the existing Agent B worktree for the single Wave-2 writer; no concurrent production writer exists
**Can start:** immediately from the integrated Wave-1 coordination base
**Depends on:** integrated Agent A/B Wave-1 commits on `integrate/language-spine-cbm-go`
**Execution lifetime:** ordinary; use `persistent-agent-loop` only if an actually long-running validation process requires durable observation
**Wake strategy:** none by default
**Developer visibility:** headless

## Read first

- `docs/plans/2026-08-20-go-calls-v0-promotion-plan.md` — authoritative source plan, especially Task 3 and promotion exit criteria
- `docs/superpowers/agent-plans/2026-08-25-go-calls-v0-promotion/README.md` — coordination state and future-wave boundary
- `docs/superpowers/agent-plans/2026-08-25-go-calls-v0-promotion/agent-a-direct-calls-boundary.md` — integrated Tier-3 boundary contract
- `docs/superpowers/agent-plans/2026-08-25-go-calls-v0-promotion/agent-b-go-semantic-v2.md` — integrated native Go-v2 contract
- `AGENTS.md` — repository rules

## Objective

Qualify the integrated Go semantic-v2 candidate and generic Tier-3 CBM admission while Go remains publicly `symbol_only`. Produce direct evidence that the implementation admits only conservative direct calls, binds Go module/package/import identity correctly, and fails closed for ambiguous or build-context-sensitive cases.

Testing is explicitly authorized for this mission. The purpose is qualification, not capability promotion.

## Current state

Wave 1 is integrated on the coordination branch:

- generic WASM/CBM admission maps unknown strategies to `unknown` and admits non-direct receiver-aware strategies only for languages whose canonical `typeReceiverAwareCapability` is production-ready;
- native Go semantic v2 implements nearest-`go.mod` ownership, separate import-path/declared-package identity, build-context abstention, unique target lookup, exact target provenance, and the Go-v2 identity/assets;
- Go is still declared through `symbolOnlyLanguage(...)` and must remain so throughout this mission.

## Ownership

You own:

- direct Go qualification through the real `WasmSemanticProjectAnalyzer -> CbmSemanticContributionEngine -> central admission` path;
- focused regression/qualification tests for the integrated Tier-3 strategy boundary and native Go-v2 behavior;
- production-coupled Go-v2 identity assertions in semantic descriptor/WASM smoke tests;
- semantic workflow invalidation evidence for relevant Go source/auxiliary changes;
- deletion of the obsolete test-only `packages/core/src/relationships/contributions/go.ts` wrapper together with its wrapper-only test;
- the smallest in-scope production correction if a qualification case demonstrates a real defect in the integrated Wave-1 implementation.

Likely evidence surfaces include, but are not limited to:

- `packages/core/src/relationships/go-call-characterization.test.ts`
- `packages/core/src/relationships/contributions/cbm.test.ts`
- `packages/core/src/generation/semantic-workflow-delta.test.ts`
- `packages/core/src/semantic/descriptor.test.ts`
- `packages/core/src/semantic/wasm/wasm-smoke.test.ts`
- `packages/core/src/semantic/wasm/wasm-engine.test.ts`
- `packages/core/src/relationships/cbm-multi-language-acceptance.test.ts` only where an assertion intentionally tracks the live production identity
- `packages/core/src/languages/capabilities.test.ts` / `packages/core/src/language/registry.test.ts` only as guards that Go remains unpromoted during this wave

If a failing qualification case proves a Wave-1 production defect, you may repair the responsible owner, including native Go semantic or generic CBM/WASM code, but keep the repair limited to Task-3 correctness. Do not widen into capability or serving changes.

Neighboring/future work owns:

- Go capability flip to `calls_v0`;
- navigation fixture promotion and production call-graph readiness expectations;
- MCP tool/docs wording;
- TruffleHog public-product witness;
- final Core/MCP/release exact-head qualification.

## Coordination contract

Keep these invariants stable:

- public Tier 3 means conservative direct calls only;
- same-package `Func()` and exactly bound imported `pkg.Func()` are positive direct-call cases;
- receiver/type dispatch, embedded dispatch, interface dispatch, callable aliases/callbacks, and unknown strategies are not authoritative Go Tier-3 `CALLS`;
- exact import path and declared package name are separate facts; default selector resolution uses the target package declaration;
- build-context-sensitive files fail closed rather than being evaluated against an invented GOOS/GOARCH/test/cgo context;
- `SatoriSemanticResultV1` remains ABI v1 / 64 bytes;
- Go remains `symbol_only` through this mission;
- no Go-specific branch may be added to generic relationship builder/workflow/serving owners.

## Success conditions

Positive evidence proves all of the following through real semantic evidence and canonical relationship admission where applicable:

- same-file direct function call;
- cross-file same-package direct function call;
- exact imported package function with explicit alias;
- exact imported package function whose default selector comes from `declaredPackageName`, including an import path whose basename differs;
- nested/multi-module imported direct call uses nearest `go.mod` ownership;
- same short package/function names in different modules do not cross-bind;
- separate module-root `package main` packages remain isolated;
- exact target file/span provenance survives into admitted relationship evidence.

Negative/fail-closed evidence proves:

- type/receiver, embedded, interface, callback/callable-alias, and unknown strategies create zero authoritative Tier-3 `CALLS` for Go;
- unresolved and duplicate/ambiguous targets create zero authoritative `CALLS`;
- explicit `//go:build` and legacy `// +build` constrained files do not participate as authoritative callers/targets;
- recognized GOOS/GOARCH filename-constrained files do not create cross-context edges;
- `_test.go` and external `package foo_test` files do not contaminate ordinary package resolution and do not produce initial v2 `CALLS`;
- cgo-sensitive files importing `"C"` produce no authoritative edge;
- a source outside every module does not borrow an unrelated module;
- malformed/conflicting module metadata fails closed;
- Go still produces no language-specific `TESTS` relationship;
- production Go capability/registry expectations still report `symbol_only` / call graph unsupported during this wave.

Identity evidence intentionally coupled to production confirms:

- semantic revision `go-v2`;
- provider/engine version `cbm-d150ebe4+satori-go-semantic-v2`;
- environment config `cbm-go-semantic-v2`;
- relationship version `relationship-v11+go-cbm-v2+python-cross-module-constructors+python-native-resolution-v1`;
- ABI remains v1.

Audit synthetic descriptors before changing literals: do not rewrite a `go-v1` string merely because it appears in a test if that test is deliberately exercising an arbitrary/custom descriptor.

## Required validation

Testing is explicitly authorized. Use the narrowest focused Core test commands that exercise every qualification surface changed by this mission. The focused lane must include the Go relationship characterization, generic CBM admission boundary, native/WASM semantic behavior and identity assertions, and semantic workflow invalidation evidence.

Also run, after the candidate is stable:

```bash
pnpm semantic:verify
pnpm --filter @zokizuan/satori-core typecheck
```

Do **not** run the full Core suite, MCP suite, release check, or TruffleHog product witness in this mission; those belong to the later exact-head qualification wave unless a narrower command cannot exercise a required Task-3 success condition.

Inspect `git diff --check` and the complete mission diff before finishing.

## Out of scope

- changing `packages/core/src/languages/capabilities.ts` to promote Go;
- changing Go navigation fixtures from unsupported to ready;
- MCP production/tests/docs changes for Go public graph support;
- `scripts/trufflehog-go-call-graph-product-run.ts`;
- release qualification or public production claim;
- receiver-aware Tier-4 promotion;
- package-scoped incremental semantic analysis or a full Go build-context engine;
- unrelated cleanup/refactors.

## Working style

Explore the actual integrated code and existing tests before deciding test shape. Prefer a small number of high-value behavioral cases through real owners over large synthetic matrices. Do not weaken existing assertions simply to match the candidate. If a qualification case exposes a real production defect, repair the responsible owner and keep the evidence that demonstrates the failure boundary.

Commit only the logically scoped Wave-2 qualification changes on the assigned branch. Do not merge the coordination branch or begin Task 4 after qualification succeeds.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. branch and commit(s);
3. qualification coverage achieved, grouped into positive direct-call and negative/fail-closed cases;
4. any production defects found and the exact corrective changes made;
5. tests/checks actually run with pass/fail results;
6. confirmation that Go remains publicly `symbol_only`;
7. coordination notes needed before capability promotion;
8. unresolved risks, deviations, or blockers.
