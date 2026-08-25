# Agent B — Native Go semantic v2 correctness

**Repository:** `/home/hamza/repo/satori`  
**Artifact type:** executable/configuration/generated artifacts  
**Workspace:** `/home/hamza/repo/satori-agent-b-go-calls-v0`  
**Branch:** `agent/go-calls-v0-b-semantic-v2`  
**Isolation reason:** concurrent Agent A writes the generic semantic/CBM admission boundary; this mission owns native Go evidence and versioned artifacts  
**Can start:** immediately  
**Depends on:** none  
**Execution lifetime:** ordinary; use `persistent-agent-loop` only if semantic build/regeneration becomes wait-heavy  
**Wake strategy:** none by default  
**Developer visibility:** headless

## Read first

- `docs/plans/2026-08-20-go-calls-v0-promotion-plan.md`
- `docs/superpowers/agent-plans/2026-08-25-go-calls-v0-promotion/README.md`
- `AGENTS.md`
- current `third_party/cbm-semantic/satori_semantic.c`
- current Go resolver files under `third_party/cbm-semantic/languages/go/`

## Objective

Produce the native Go semantic-v2 candidate required for a truthful future direct `calls_v0` promotion. Correct module/package/import identity, make unmodeled build contexts fail closed for authoritative call evidence, remove input-order/first-match ambiguity, and regenerate the versioned semantic-engine artifacts without changing the public Go capability.

## Current state

- Native resolution applies the first discovered `go.mod` module path globally.
- Default import selector currently falls back to the import-path basename rather than the target package's declared package name.
- Every supplied `.go` source can enter one registry regardless of Go build constraints.
- `def_locs_find()` returns the first qualified-name match.
- Current production identities are Go v1.
- Agent A separately owns the generic Tier-3 admission boundary; do not solve public direct-vs-receiver policy in native code solely for this mission.

## Ownership

You own:

- native Go semantic project identity/build-context correctness under `third_party/cbm-semantic/` as required by the source plan;
- `packages/core/assets/semantic-engine/semantic-languages.json`;
- `scripts/build-semantic-engine.mjs`;
- `packages/core/src/language-analysis/versions.ts`;
- regenerated committed semantic-engine JS/WASM/manifest artifacts.

Agent A owns:

- `packages/core/src/semantic/wasm/wasm-analyzer.ts`;
- `packages/core/src/relationships/contributions/cbm.ts`;
- generic Tier-3/Tier-4 semantic-strategy admission.

## Coordination contract

Implement the source-plan invariants, not a parallel architecture:

- nearest ancestor `go.mod` owns each source at a path-component boundary;
- package identity distinguishes exact `importPath` from `declaredPackageName`;
- default import binding uses the unique target package's declared name, while explicit aliases remain explicit;
- module-root `package main` must not collapse to a global `main` namespace;
- source outside every module must not borrow another module;
- ambiguous package/import/callable identity must abstain/fail closed, never choose by source/auxiliary order;
- build-context-sensitive files are ineligible as authoritative call sources/targets for v2 when they use explicit build tags, recognized GOOS/GOARCH filename constraints, `_test.go`, or cgo `import "C"`;
- malformed/conflicting module ownership and resource overflow must not silently fall back to a different identity;
- preserve ABI v1 / 64-byte `SatoriSemanticResultV1` and exact target file/span provenance.

Use these exact v2 production identities:

```text
providerId:             satori-cbm-semantic-go
semanticRevision:       go-v2
engine/providerVersion: cbm-d150ebe4+satori-go-semantic-v2
environmentConfigId:    cbm-go-semantic-v2
relationshipVersion:    relationship-v11+go-cbm-v2+python-cross-module-constructors+python-native-resolution-v1
ABI version:            1
```

Do not edit Agent A's generic boundary files. Do not flip Go's public capability.

## Success conditions

- Module ownership is deterministic nearest-`go.mod` and independent of auxiliary input ordering.
- Package/import binding can represent import path and declared package name separately.
- A versioned import path whose basename differs from the declared package name can be bound correctly by the native project model.
- External test packages cannot merge into the importable package namespace; `_test.go` remains ineligible for initial authoritative call evidence.
- Explicit build-tagged, implicit GOOS/GOARCH-constrained, `_test.go`, and cgo-sensitive files cannot create authoritative call source/target evidence.
- Duplicate/ambiguous qualified callable targets no longer resolve by first match.
- Malformed/conflicting module metadata and bounded-resource failure cannot silently degrade to fallback identity.
- The exact Go v2 descriptor/engine/environment/global relationship identities are synchronized.
- Committed JS/WASM/manifest artifacts are regenerated from the pinned semantic build path.
- Public Go capability remains `symbol_only`.
- Complete diff stays within native semantic-v2 ownership plus necessary generated/version artifacts.

## Required validation

Do not create, modify, or run tests.

Implementation requires:

```bash
pnpm semantic:build
```

After regeneration, run the source-plan non-test reproducibility check:

```bash
pnpm semantic:verify
```

Report both commands and results. Do not escalate to Core/MCP suites or release qualification.

## Out of scope

- Generic CBM Tier-3/Tier-4 admission policy.
- Go public capability flip.
- Test/fixture modification or execution.
- Removing the test-only Go contribution wrapper/test.
- MCP/docs promotion.
- TruffleHog product witness.
- Full Go build-context evaluation or `go/build` parity.
- Receiver-aware Tier-4 promotion.

## Working style

Trace the current native owner before editing and keep the implementation bounded. Prefer existing semantic-engine error/resource machinery over a new compatibility layer. Do not create extra worktrees. Commit only this mission's logically scoped changes on the assigned branch. Do not merge or rebase Agent A.

## Finish report

Return:
1. status: complete / blocked / needs decision;
2. branch and commit(s);
3. semantic-v2 behavior and exact identities/artifacts changed;
4. `semantic:build` / `semantic:verify` results;
5. anything the integration/qualification session must know;
6. unresolved risks or deviations.
