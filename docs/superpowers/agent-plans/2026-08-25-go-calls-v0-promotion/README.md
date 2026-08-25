# Go `calls_v0` Promotion — Agent Coordination

**Repository:** `/home/hamza/repo/satori`  
**Source of truth:** `docs/plans/2026-08-20-go-calls-v0-promotion-plan.md`  
**Implementation base:** `de5c439f77d49d1e88287739cc062eb361edec57`  
**Execution shape:** parallel Wave 1 integrated; qualification/promotion remains sequential
**Current wave:** Wave 2 — authorized Go qualification while `symbol_only`

## Current frontier

| Mission | Type | Status | Can start | Workspace | Isolation reason | Blocked by |
|---|---|---|---|---|---|---|
| Agent A — Tier-3 direct-call admission boundary | executable | integrated | complete | `/home/hamza/repo/satori-agent-a-go-calls-v0` | concurrent writer; owned generic semantic/CBM files | none |
| Agent B — Native Go semantic v2 correctness | executable/config | integrated | complete | prior Agent B branch/worktree | concurrent writer; owned native engine/assets/version files | none |
| Agent B — Go `calls_v0` qualification while `symbol_only` | mixed executable/test evidence | ready | now | `/home/hamza/repo/satori-agent-b-go-calls-v0` on `agent/go-calls-v0-b-qualification` | single writer; reuses existing worktree to avoid new isolation | integrated Wave 1 |

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
                    qualification green
                          |
                          v
      Wave 3: capability flip + MCP/docs + product witness
                          |
                          v
             exact-head final qualification
```

## Shared contracts

- Public target remains Go Tier-3 `calls_v0`: conservative direct function calls only.
- Receiver/type/embedded/interface/callback/callable-alias evidence is not authoritative Tier-3 `CALLS`.
- Package-qualified `pkg.Func()` is a direct call only when import binding is exact.
- `SatoriSemanticResultV1` ABI stays v1 / 64 bytes.
- Publication relationship navigation remains the sole serving authority.
- No Go-specific branch may be added to `relationships/builder.ts`, `IndexGenerationWorkflow`, `Context`, or MCP serving handlers.
- Wave-1 file ownership is historical after integration. The single Wave-2 writer may repair either native Go or generic CBM/WASM owners only when a focused qualification case demonstrates an in-scope Task-3 defect.

## Workspace policy

Wave 1 used two isolated concurrent worktrees. Wave 2 has one writer, so no new worktree is justified. Reuse Agent B's existing worktree on a fresh branch cut from the integrated coordination HEAD.

- Agent A historical branch: `agent/go-calls-v0-a-direct-boundary`
- Agent A worktree: `/home/hamza/repo/satori-agent-a-go-calls-v0`
- Agent B historical semantic-v2 branch: `agent/go-calls-v0-b-semantic-v2`
- Agent B Wave-2 branch: `agent/go-calls-v0-b-qualification`
- Agent B worktree: `/home/hamza/repo/satori-agent-b-go-calls-v0`

## Integration policy

Wave 1 was jointly inspected before integration. No overlapping files or Blocker/Major integration finding survived review. Agent A was integrated as `2eab4c02`; Agent B was integrated as `d6e227fb` on `integrate/language-spine-cbm-go`.

The public Go capability remains `symbol_only`. No capability flip, MCP/docs promotion, or release claim is authorized until the qualification wave passes.

## Execution lifetime policy

Wave 2 is one ordinary bounded qualification session. Use normal repository tools. If a focused validation command becomes persistent or wait-heavy, Agent B may use `persistent-agent-loop` for process observation, but it is not required by default.

## Validation policy

No test creation, test modification, or test execution was authorized in Wave 1. Agent B ran `pnpm semantic:build` and `pnpm semantic:verify`, both passing on its isolated candidate. After integration, the planner ran `pnpm --filter @zokizuan/satori-core typecheck` and `git diff --check f6c59194..HEAD`; both passed. No Wave-1 tests were run.

The user explicitly authorized testing for Wave 2 on 2026-08-25. Agent B may create/modify/run the focused Core qualification evidence required by Task 3. Full Core/MCP/release/product gates remain deferred to the later exact-head qualification wave.

## Future / blocked work

- Direct Go relationship qualification while Go remains `symbol_only` — ready now; assigned to Agent B in `agent-b-go-qualification.md`.
- Remove the test-only Go contribution wrapper/test — included in Wave 2.
- Go capability promotion to `calls_v0` — blocked on green Wave-2 qualification evidence.
- MCP/docs claim update — blocked on capability promotion.
- TruffleHog `CheckPackageDir -> checkFiles` product witness — blocked on promotion and explicit test/qualification authorization.
- Exact-head Core/MCP/release/product qualification — blocked on the completed candidate and explicit test/qualification authorization.

## Status log

- `2026-08-25` — Wave 1 materialized from clean implementation base `de5c439f`: two disjoint production candidates, no tests authorized.
- `2026-08-25` — Agent A report verified: source commit `6a010d30`, integrated as `2eab4c02`; generic Tier-3 admission is direct-call-only and unknown strategies fail closed.
- `2026-08-25` — Agent B report verified: source commit `d1382df6`, integrated as `d6e227fb`; Go semantic v2/module-package/build-context candidate and generated assets integrated. Agent B semantic build/verify passed.
- `2026-08-25` — Combined integration review found no Blocker/Major issue. Core typecheck and integrated diff check passed. Go remains `symbol_only`.
- `2026-08-25` — User explicitly authorized test creation/modification/execution. Wave 2 materialized as one coherent Agent B qualification mission; capability promotion remains blocked until that mission is green.
