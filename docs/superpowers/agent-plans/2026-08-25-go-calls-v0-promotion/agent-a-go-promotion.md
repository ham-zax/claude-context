# Agent A — Promote Go to production `calls_v0`

**Repository:** `/home/hamza/repo/satori`
**Artifact type:** mixed executable/test evidence/docs
**Workspace:** `/home/hamza/repo/satori-agent-a-go-calls-v0`
**Branch:** `agent/go-calls-v0-a-promotion`
**Isolation reason:** no new worktree; reuse Agent A's existing isolated worktree for the single Wave-3 writer
**Can start:** immediately after checking out the coordination HEAD that includes integrated Wave-2 qualification
**Depends on:** integrated Wave-2 qualification commit `c75c4b98`
**Execution lifetime:** ordinary; use `persistent-agent-loop` only if an authorized validation command becomes persistent/wait-heavy

## Read first

- `docs/plans/2026-08-20-go-calls-v0-promotion-plan.md` — authoritative source plan, especially Tasks 4 and 5
- `docs/superpowers/agent-plans/2026-08-25-go-calls-v0-promotion/README.md` — current coordination state
- `docs/superpowers/agent-plans/2026-08-25-go-calls-v0-promotion/agent-a-direct-calls-boundary.md` — integrated Tier-3 boundary
- `docs/superpowers/agent-plans/2026-08-25-go-calls-v0-promotion/agent-b-go-semantic-v2.md` — integrated semantic-v2 contract
- `docs/superpowers/agent-plans/2026-08-25-go-calls-v0-promotion/agent-b-go-qualification.md` — accepted Wave-2 evidence
- `AGENTS.md`
- authoritative Tier-3/Tier-4 language-capability contract referenced by the source plan

## Objective

Promote the already-qualified Go direct-call implementation from public `symbol_only` to production Tier-3 `calls_v0`, and synchronize the current capability/evidence/navigation/MCP/docs contracts that become truthful because of that promotion.

Do not extend the semantic capability. The implementation being promoted is exactly the qualified direct-call boundary from Wave 2.

## Accepted baseline

Wave 1 and Wave 2 are integrated before this mission begins.

Accepted behavior includes:

- raw unknown WASM strategy fails closed;
- generic CBM Tier-3 admission accepts only direct-call evidence while receiver-aware capability is disabled;
- native Go semantic v2 handles module/package/build-context ambiguity conservatively;
- focused Wave-2 qualification is green at 47/47 on the integration branch;
- Go is still declared through `symbolOnlyLanguage(...)` before this mission.

Do not reopen semantic-v2 or Tier-3 qualification unless a promotion-specific test demonstrates a real regression in an accepted baseline contract.

## Ownership

You own the canonical public promotion surfaces required by Tasks 4 and 5:

- `packages/core/src/languages/capabilities.ts` Go declaration;
- capability/evidence/registry tests coupled to the public Go declaration;
- `fixtures/navigation/go-basic-symbols/**` as needed to make the existing Go navigation fixture truthfully demonstrate one deterministic direct function `CALLS` edge and graph readiness;
- current search/navigation evidence that changes from unsupported Go to supported Go;
- `packages/mcp/src/tools/call_graph.ts` public description if it remains hard-coded to TS/JS/Python;
- MCP tests directly coupled to the changed public capability/description, including moving a generic `unsupported_language` witness from Go to a language that remains symbol-only (prefer Rust when still appropriate);
- root/current-facing documentation that classifies Go capability, including `README.md` and `satori-landing/docs/index.html` when still current owners;
- generated MCP docs/manifest artifacts only when the repository's existing generator requires synchronization after tool-description changes.

## Required canonical Go declaration

Promote Go to exactly:

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

Do not use a helper that silently enables imports, receiver-aware calls, or test-reference capability.

## Coordination contract

- Production indexing must continue to admit Go through the existing generic `cbm_semantic` builder path only.
- Do not add a Go branch to `relationships/builder.ts`, `IndexGenerationWorkflow`, `Context`, `handlers.ts`, `navigation-handlers.ts`, or `relationship-backed-call-graph.ts`.
- Do not modify native Go semantic resolution merely to increase recall.
- Do not enable receiver/type/embed/interface/callback `CALLS`.
- Do not enable Go `TESTS` or import/export public tiers.
- Publication relationship navigation remains the sole graph serving authority.
- Missing/incompatible Publication relationship navigation must retain the current structured not-ready/reindex behavior.
- Public wording must describe Go support conservatively as direct-call `calls_v0`; do not imply complete Go call graph or receiver-aware resolution.

## Success conditions

1. Canonical Go capability reports `publicClaim: calls_v0` and production-ready `callsCapability`, while import/export, receiver-aware, and test-reference capabilities remain `none`.
2. `.go` language adapter/registry derives `callGraph`, `callGraphBuild`, and `callGraphQuery` as supported.
3. Production Go relationship dispatch still uses generic `cbm_semantic`; no language-specific production branch is added.
4. Go capability evidence points to real direct-call qualification rather than the deleted wrapper test.
5. The existing Go navigation fixture contains a deterministic direct function call, expected `CALLS` edge, and graph-ready public expectation rather than `unsupported_language`.
6. Generic unsupported-language MCP/search evidence no longer relies on Go; it uses a language that remains symbol-only.
7. `call_graph` public wording is capability-based/current and no longer hard-codes only TS/JS/Python.
8. README/landing documentation places Go in production `calls_v0` without claiming receiver-aware or test-reference capability.
9. Focused Core/MCP tests coupled to the changed promotion surfaces pass.
10. Go semantic-v2 focused qualification remains green after the capability flip.
11. Worktree is clean after a logically scoped commit.

## Testing and validation authorization

Testing is explicitly authorized for this mission.

Run the smallest focused test set that proves the changed Core capability/evidence/navigation and MCP contract surfaces. Include the accepted Go qualification lane so the capability flip cannot accidentally widen Tier-3 behavior.

At candidate-final state also run:

```bash
pnpm semantic:verify
pnpm --filter @zokizuan/satori-core typecheck
pnpm --filter @zokizuan/satori-mcp typecheck
```

If changing MCP generated docs/manifest, run the repository's existing docs/manifest consistency command required by that generator.

Do not run `release:check` or the real TruffleHog product witness in this mission. Those belong to the next exact-product qualification wave.

Inspect `git diff --check` and the complete mission diff before finishing.

## Out of scope

- native Go semantic-v2 redesign or broader build-context support;
- receiver/type-aware Tier-4 promotion;
- Go import/export or `TESTS` promotion;
- second graph implementation or sidecar;
- TruffleHog product witness creation/execution;
- full release qualification;
- unrelated language capability cleanup.

## Working style

Use Causal Coding for source mutation. Preserve the accepted Wave-2 boundary and make the smallest complete public-contract promotion. If a focused test exposes a real promotion regression, fix only the demonstrated owner. Do not broaden into semantic improvements or unrelated cleanup.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. branch and commit(s);
3. exact final Go capability declaration;
4. capability/evidence/fixture/MCP/docs changes made;
5. focused tests and non-test checks actually run with results;
6. confirmation receiver-aware/import-export/test-reference tiers remain disabled;
7. confirmation no Go-specific builder/workflow/serving branch was added;
8. anything the TruffleHog/final-qualification session must know;
9. unresolved risks/deviations.
