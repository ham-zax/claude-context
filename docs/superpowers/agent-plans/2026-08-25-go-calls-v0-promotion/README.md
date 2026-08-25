# Go `calls_v0` Promotion — Agent Coordination

**Repository:** `/home/hamza/repo/satori`  
**Source of truth:** `docs/plans/2026-08-20-go-calls-v0-promotion-plan.md`  
**Implementation base:** `de5c439f77d49d1e88287739cc062eb361edec57`  
**Execution shape:** parallel Wave 1, then integration/qualification  
**Current wave:** 1

## Current frontier

| Mission | Type | Status | Can start | Workspace | Isolation reason | Blocked by |
|---|---|---|---|---|---|---|
| Agent A — Tier-3 direct-call admission boundary | executable | ready | now | `/home/hamza/repo/satori-agent-a-go-calls-v0` | concurrent writer; owns generic semantic/CBM files | none |
| Agent B — Native Go semantic v2 correctness | executable/config | ready | now | `/home/hamza/repo/satori-agent-b-go-calls-v0` | concurrent writer; owns native engine/assets/version files | none |

## Dependency map

```text
                         Wave 1
      +-------------------------------------------+
      |                                           |
Agent A: generic Tier-3 boundary      Agent B: Go semantic v2
      |                                           |
      +-------------------+-----------------------+
                          |
                 planner integration review
                          |
               explicit test authorization
                          |
                          v
      Wave 2: Go qualification while symbol_only
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
- Agent A must not edit Agent B's native engine, descriptor, build-recipe, generated-asset, or relationship-version files.
- Agent B must not edit Agent A's generic semantic analyzer or CBM contribution files.

## Workspace policy

Wave 1 has two genuinely concurrent executable writers, so each receives an isolated branch/worktree from the same coordination base. Their primary write sets are disjoint. Do not create additional worktrees or move work between the assigned workspaces.

- Agent A branch: `agent/go-calls-v0-a-direct-boundary`
- Agent A worktree: `/home/hamza/repo/satori-agent-a-go-calls-v0`
- Agent B branch: `agent/go-calls-v0-b-semantic-v2`
- Agent B worktree: `/home/hamza/repo/satori-agent-b-go-calls-v0`

## Integration policy

Do not merge either branch merely because its local mission completes. The planner/integration session must inspect both complete diffs together because Agent A defines which semantic strategies may become authoritative while Agent B changes the Go evidence and global relationship compatibility identity.

The public Go capability remains `symbol_only` in Wave 1. No capability flip, MCP/docs promotion, or release claim is part of these missions.

## Execution lifetime policy

Both Wave-1 missions are ordinary bounded implementation sessions. Use normal repository tools. If a semantic engine build becomes persistent or wait-heavy, the receiving session may use `persistent-agent-loop`, but it is not required by default.

## Validation policy

No test creation, test modification, or test execution is authorized in Wave 1. Agent B may run `pnpm semantic:build` because regeneration is part of its implementation artifact and may run the non-test `pnpm semantic:verify` check from the source plan. Agent A has no required validation command in this wave beyond direct code/diff inspection unless mandatory repository policy requires one.

## Future / blocked work

- Direct Go relationship qualification while Go remains `symbol_only` — blocked on both Wave-1 candidates and explicit test authorization.
- Remove the test-only Go contribution wrapper/test — belongs to the authorized qualification wave, not Wave 1.
- Go capability promotion to `calls_v0` — blocked on qualification evidence.
- MCP/docs claim update — blocked on capability promotion.
- TruffleHog `CheckPackageDir -> checkFiles` product witness — blocked on promotion and explicit test/qualification authorization.
- Exact-head Core/MCP/release/product qualification — blocked on the completed candidate and explicit test/qualification authorization.

## Status log

- `2026-08-25` — Wave 1 materialized from clean implementation base `de5c439f`: two disjoint production candidates, no tests authorized.
