# Agent A — Freeze the Tier-3 direct-call admission boundary

**Repository:** `/home/hamza/repo/satori`  
**Artifact type:** executable  
**Workspace:** `/home/hamza/repo/satori-agent-a-go-calls-v0`  
**Branch:** `agent/go-calls-v0-a-direct-boundary`  
**Isolation reason:** concurrent Agent B writes native Go semantic-engine files; this mission owns only the generic semantic/CBM boundary  
**Can start:** immediately  
**Depends on:** none  
**Execution lifetime:** ordinary  
**Wake strategy:** none  
**Developer visibility:** headless

## Read first

- `docs/plans/2026-08-20-go-calls-v0-promotion-plan.md`
- `docs/superpowers/agent-plans/2026-08-25-go-calls-v0-promotion/README.md`
- `AGENTS.md`
- `docs/plans/LANGUAGE_CAPABILITY_MATRIX_AND_SYMBOL_EXTRACTOR_HARNESS_PLAN.md`, especially Tier 3 vs Tier 4

## Objective

Make the generic semantic-to-relationship boundary faithfully enforce the repository's Tier-3 contract: a language claiming `calls_v0` may expose conservative direct-call evidence, but receiver/type/embedded/interface/unknown or other non-direct semantic strategies must not become authoritative `CALLS` unless the canonical language capability explicitly reaches the later receiver-aware tier.

This is a generic contract correction, not a Go-specific serving path.

## Current state

- `WasmSemanticProjectAnalyzer` currently initializes semantic strategy as `direct_call` and only overrides known receiver strategies, so raw WASM `UNKNOWN` can be mislabeled as direct.
- The native Go resolver already emits receiver/type/interface strategies and callable-alias strategy strings.
- `CbmSemanticContributionEngine` currently proposes resolved occurrences to central admission without enforcing the Tier-3/Tier-4 capability boundary.
- Go remains publicly `symbol_only` in this wave.

## Ownership

You own:

- `packages/core/src/semantic/wasm/wasm-analyzer.ts` strategy translation correctness;
- `packages/core/src/relationships/contributions/cbm.ts` generic capability-aware semantic-strategy admission;
- the smallest directly necessary generic types/imports required by that boundary, if any.

Agent B owns:

- `third_party/cbm-semantic/**` Go/native behavior;
- semantic descriptor/version/build recipe;
- generated semantic-engine assets;
- global relationship version.

## Coordination contract

- Do not add `if (language === "go")` or equivalent Go-specific logic.
- Preserve native non-direct semantic evidence for future receiver-aware promotion; make it non-authoritative at Tier 3 rather than deleting the native capability.
- Package-qualified exact imports may remain `direct_call`.
- Unknown/unrecognized raw strategies must remain unknown/fail closed, never default to direct.
- Keep `SatoriSemanticResultV1` ABI untouched.
- Do not edit the Go public capability declaration in this wave.

If the generic capability model lacks enough information to express the Tier-3/Tier-4 gate without a new public/shared contract, stop and report the exact missing contract rather than inventing a Go exception.

## Success conditions

- Raw WASM `UNKNOWN` no longer becomes semantic `direct_call` by default.
- A resolved CBM occurrence can become an authoritative `CALLS` candidate under a `calls_v0` language only when its semantic strategy is direct-call evidence.
- Receiver/type/embedded/interface/unknown and callable-alias/callback-style evidence cannot become Tier-3 authoritative `CALLS`.
- The rule is capability-driven and generic across CBM languages.
- No Go-specific branch is added to the generic builder/workflow/serving path.
- Public Go capability remains unchanged.
- Complete diff is limited to the true generic owner and any strictly necessary adjacent type/import surface.

## Required validation

None in this wave. Do not create, modify, or run tests. Inspect the changed code and complete branch diff for contract correctness. If mandatory repository policy requires a non-test check, run only that check and report it.

## Out of scope

- Native Go module/package/build-constraint logic.
- Go semantic v2 identity/assets.
- Go capability flip.
- Go-specific qualification fixtures/tests.
- MCP/docs changes.
- TruffleHog product witness.
- Any receiver-aware Tier-4 promotion.

## Working style

Explore the real generic CBM path before editing. Make the smallest complete owner-local change. Do not create extra worktrees. Do not create, modify, or run tests. Commit only this mission's logically scoped changes on the assigned branch. Do not merge or rebase Agent B.

## Finish report

Return:
1. status: complete / blocked / needs decision;
2. branch and commit(s);
3. exact generic contract now enforced and files changed;
4. validation actually run, if any; otherwise state none;
5. anything the integration/qualification session must know;
6. unresolved risks or deviations.
