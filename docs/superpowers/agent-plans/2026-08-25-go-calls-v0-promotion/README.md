# Go `calls_v0` Promotion — Agent Coordination

**Repository:** `/home/hamza/repo/satori`  
**Source of truth:** `docs/plans/2026-08-20-go-calls-v0-promotion-plan.md`  
**Implementation base:** `de5c439f77d49d1e88287739cc062eb361edec57`  
**Execution shape:** Wave 1 parallel foundation; Waves 2–4 sequential promotion/qualification
**Current wave:** Wave 3 — promote qualified Go direct calls to public `calls_v0`

## Current frontier

| Mission | Type | Status | Can start | Workspace | Isolation reason | Blocked by |
|---|---|---|---|---|---|---|
| Agent A — Tier-3 direct-call admission boundary | executable | integrated | complete | `/home/hamza/repo/satori-agent-a-go-calls-v0` | concurrent writer; owned generic semantic/CBM files | none |
| Agent B — Native Go semantic v2 correctness | executable/config | integrated | complete | prior Agent B branch/worktree | concurrent writer; owned native engine/assets/version files | none |
| Agent B — Go `calls_v0` qualification while `symbol_only` | mixed executable/test evidence | integrated | complete | historical `agent/go-calls-v0-b-qualification` | single writer; reused existing worktree | integrated Wave 1 |
| Agent A — Public Go `calls_v0` promotion | mixed executable/test/docs | ready | now | `/home/hamza/repo/satori-agent-a-go-calls-v0` on `agent/go-calls-v0-a-promotion` | single writer; reuses existing worktree | integrated Wave 2 |

## Dependency map

```text
                         Wave 1
      +-------------------------------------------+
      |                                           |
Agent A: generic Tier-3 boundary      Agent B: Go semantic v2
      |                                           |
      +-------------------+-----------------------+
                          |
              integrated on `integrate/language-spine-cbm-go`
                 (`2eab4c02`, `d6e227fb`)
                          |
               test authorization granted
                          |
                          v
      Wave 2: Go qualification while symbol_only
                          |
        integrated as `c75c4b98`; 47/47 green
                          |
                          v
      Wave 3: capability flip + fixtures + MCP/docs
                          |
                          v
      Wave 4: TruffleHog witness + exact-head final qualification
```

## Shared contracts

- Public target remains Go Tier-3 `calls_v0`: conservative direct function calls only.
- Receiver/type/embedded/interface/callback/callable-alias evidence is not authoritative Tier-3 `CALLS`.
- Package-qualified `pkg.Func()` is a direct call only when import binding is exact.
- `SatoriSemanticResultV1` ABI stays v1 / 64 bytes.
- Publication relationship navigation remains the sole serving authority.
- No Go-specific branch may be added to `relationships/builder.ts`, `IndexGenerationWorkflow`, `Context`, or MCP serving handlers.
- Wave-1 ownership is historical after integration. Wave 2 found and fixed one qualified native receiver-provenance defect and is accepted.
- Wave 3 must preserve the accepted semantic boundary and change only the public capability/evidence/fixture/MCP/docs contract unless a promotion-focused test demonstrates a real regression.

## Workspace policy

Wave 1 used two isolated concurrent worktrees. Later waves have one writer at a time, so no additional worktrees are justified; reuse the existing agent worktrees on fresh branches cut from the latest coordination HEAD.

- Agent A historical Tier-3 branch: `agent/go-calls-v0-a-direct-boundary`
- Agent A Wave-3 branch: `agent/go-calls-v0-a-promotion`
- Agent A worktree: `/home/hamza/repo/satori-agent-a-go-calls-v0`
- Agent B historical semantic-v2 branch: `agent/go-calls-v0-b-semantic-v2`
- Agent B historical Wave-2 branch: `agent/go-calls-v0-b-qualification`
- Agent B worktree: `/home/hamza/repo/satori-agent-b-go-calls-v0`

## Integration policy

Wave 1 was jointly inspected before integration. No overlapping files or Blocker/Major integration finding survived review. Agent A was integrated as `2eab4c02`; Agent B was integrated as `d6e227fb`.

Wave 2 Agent B qualification was reviewed and integrated as `c75c4b98`. The integration branch reproduced the focused lane at 47/47, `pnpm semantic:verify` passed, Core typecheck passed, and Go remained `symbol_only`.

Wave 3 may now flip the canonical Go capability and synchronize current-facing capability/evidence/navigation/MCP/docs claims. The real TruffleHog product witness and exact-head release qualification remain a separate downstream wave.

## Execution lifetime policy

Wave 3 is one ordinary bounded promotion session. Use normal repository tools. If an authorized focused validation command becomes persistent or wait-heavy, Agent A may use `persistent-agent-loop` for process observation, but it is not required by default.

## Validation policy

No test creation, test modification, or test execution was authorized in Wave 1. Agent B ran `pnpm semantic:build` and `pnpm semantic:verify`, both passing on its isolated candidate. After integration, the planner ran `pnpm --filter @zokizuan/satori-core typecheck` and `git diff --check f6c59194..HEAD`; both passed. No Wave-1 tests were run.

The user explicitly authorized testing for this promotion effort on 2026-08-25. Wave 2 qualification completed and was independently reproduced after integration at 47/47. Wave 3 may create/modify/run focused Core/MCP tests required by Tasks 4 and 5 plus the accepted Go qualification lane. Full release/product gates remain deferred to Wave 4.

## Future / blocked work

- Direct Go relationship qualification while Go remains `symbol_only` — complete and integrated as `c75c4b98`.
- Test-only Go contribution wrapper/test — deleted in Wave 2.
- Go capability promotion to `calls_v0` plus capability/evidence/navigation/MCP/docs synchronization — ready now; assigned to Agent A in `agent-a-go-promotion.md`.
- TruffleHog `CheckPackageDir -> checkFiles` product witness — blocked on integrated Wave-3 public promotion.
- Exact-head Core/MCP/release/product qualification — blocked on completed Wave 3 and product witness creation.

## Status log

- `2026-08-25` — Wave 1 materialized from clean implementation base `de5c439f`: two disjoint production candidates, no tests authorized.
- `2026-08-25` — Agent A report verified: source commit `6a010d30`, integrated as `2eab4c02`; generic Tier-3 admission is direct-call-only and unknown strategies fail closed.
- `2026-08-25` — Agent B report verified: source commit `d1382df6`, integrated as `d6e227fb`; Go semantic v2/module-package/build-context candidate and generated assets integrated. Agent B semantic build/verify passed.
- `2026-08-25` — Combined integration review found no Blocker/Major issue. Core typecheck and integrated diff check passed. Go remains `symbol_only`.
- `2026-08-25` — User explicitly authorized test creation/modification/execution. Wave 2 materialized as one coherent Agent B qualification mission.
- `2026-08-25` — Agent B Wave-2 report verified and integrated as `c75c4b98`. Integrated focused qualification reproduced at 47/47; semantic verification and Core typecheck passed; Go still `symbol_only`.
- `2026-08-25` — Wave 3 materialized as one Agent A public-promotion mission. Product witness/final release qualification intentionally remain downstream.
