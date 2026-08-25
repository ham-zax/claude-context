# Go `calls_v0` Promotion — Agent Coordination

**Repository:** `/home/hamza/repo/satori`  
**Source of truth:** `docs/plans/2026-08-20-go-calls-v0-promotion-plan.md`  
**Implementation base:** `de5c439f77d49d1e88287739cc062eb361edec57`  
**Execution shape:** Wave 1 parallel foundation; Waves 2–4 sequential promotion/qualification
**Current wave:** Wave 4 — TruffleHog product witness and exact-head final qualification

## Current frontier

| Mission | Type | Status | Can start | Workspace | Isolation reason | Blocked by |
|---|---|---|---|---|---|---|
| Agent A — Tier-3 direct-call admission boundary | executable | integrated | complete | `/home/hamza/repo/satori-agent-a-go-calls-v0` | concurrent writer; owned generic semantic/CBM files | none |
| Agent B — Native Go semantic v2 correctness | executable/config | integrated | complete | prior Agent B branch/worktree | concurrent writer; owned native engine/assets/version files | none |
| Agent B — Go `calls_v0` qualification while `symbol_only` | mixed executable/test evidence | integrated | complete | historical `agent/go-calls-v0-b-qualification` | single writer; reused existing worktree | integrated Wave 1 |
| Agent A — Public Go `calls_v0` promotion | mixed executable/test/docs | integrated | complete | historical `agent/go-calls-v0-a-promotion` | single writer; reused existing worktree | integrated Wave 2 |
| Agent B — Go product witness + final qualification | mixed executable/test qualification | ready | now | `/home/hamza/repo/satori-agent-b-go-calls-v0` on `agent/go-calls-v0-b-final-qualification` | single final writer; reuses existing worktree | integrated Wave 3 |

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
        integrated as `2c58f2de`; focused lanes green
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
- Wave 3 promoted only the qualified public capability/evidence/fixture/MCP/docs contract and synchronized the generic sidecar validator with canonical proof-step kinds; it is accepted.
- Wave 4 must treat the integrated public contract as frozen except for the smallest correction demonstrated by a required exact-head gate.

## Workspace policy

Wave 1 used two isolated concurrent worktrees. Later waves have one writer at a time, so no additional worktrees are justified; reuse the existing agent worktrees on fresh branches cut from the latest coordination HEAD.

- Agent A historical Tier-3 branch: `agent/go-calls-v0-a-direct-boundary`
- Agent A historical Wave-3 branch: `agent/go-calls-v0-a-promotion`
- Agent A worktree: `/home/hamza/repo/satori-agent-a-go-calls-v0`
- Agent B historical semantic-v2 branch: `agent/go-calls-v0-b-semantic-v2`
- Agent B historical Wave-2 branch: `agent/go-calls-v0-b-qualification`
- Agent B Wave-4 branch: `agent/go-calls-v0-b-final-qualification`
- Agent B worktree: `/home/hamza/repo/satori-agent-b-go-calls-v0`

## Integration policy

Wave 1 was jointly inspected before integration. No overlapping files or Blocker/Major integration finding survived review. Agent A was integrated as `2eab4c02`; Agent B was integrated as `d6e227fb`.

Wave 2 Agent B qualification was reviewed and integrated as `c75c4b98`. The integration branch reproduced the focused lane at 47/47, `pnpm semantic:verify` passed, Core typecheck passed, and Go remained `symbol_only`.

Wave 3 Agent A promotion was reviewed and integrated as `2c58f2de`. The integration branch reproduced 47/47 accepted Go qualification tests, 7/7 language-evidence tests, 27/27 focused MCP promotion tests, `pnpm semantic:verify`, Core typecheck, MCP typecheck, and diff checks.

Wave 4 is the final integration boundary. It owns the TruffleHog public product witness and one exact candidate HEAD through the full required release gates.

## Execution lifetime policy

Wave 4 is expected to be wait-heavy and includes a persistent MCP product witness. Agent B must use `persistent-agent-loop` for execution lifetime, with Terminal + event waits for persistent runtime/process observation and bounded Bash for ordinary checks.

## Validation policy

No test creation, test modification, or test execution was authorized in Wave 1. Agent B ran `pnpm semantic:build` and `pnpm semantic:verify`, both passing on its isolated candidate. After integration, the planner ran `pnpm --filter @zokizuan/satori-core typecheck` and `git diff --check f6c59194..HEAD`; both passed. No Wave-1 tests were run.

The user explicitly authorized testing for this promotion effort on 2026-08-25. Wave 2 qualification and Wave 3 focused promotion validation were independently reproduced after integration. Wave 4 is explicitly authorized to create/run the TruffleHog product witness and must run the exact-head final gates required by Tasks 6 and 7: semantic verification, repository check/build, full Core tests, full MCP tests, `release:check`, and the TruffleHog product witness.

## Future / blocked work

- Direct Go relationship qualification while Go remains `symbol_only` — complete and integrated as `c75c4b98`.
- Test-only Go contribution wrapper/test — deleted in Wave 2.
- Go capability promotion to `calls_v0` plus capability/evidence/navigation/MCP/docs synchronization — complete and integrated as `2c58f2de`.
- TruffleHog `CheckPackageDir -> checkFiles` product witness — ready now; assigned to Agent B in `agent-b-go-final-qualification.md`.
- Exact-head Core/MCP/release/product qualification — included in Wave 4 after the witness script is complete and the candidate HEAD is frozen.

## Status log

- `2026-08-25` — Wave 1 materialized from clean implementation base `de5c439f`: two disjoint production candidates, no tests authorized.
- `2026-08-25` — Agent A report verified: source commit `6a010d30`, integrated as `2eab4c02`; generic Tier-3 admission is direct-call-only and unknown strategies fail closed.
- `2026-08-25` — Agent B report verified: source commit `d1382df6`, integrated as `d6e227fb`; Go semantic v2/module-package/build-context candidate and generated assets integrated. Agent B semantic build/verify passed.
- `2026-08-25` — Combined integration review found no Blocker/Major issue. Core typecheck and integrated diff check passed. Go remains `symbol_only`.
- `2026-08-25` — User explicitly authorized test creation/modification/execution. Wave 2 materialized as one coherent Agent B qualification mission.
- `2026-08-25` — Agent B Wave-2 report verified and integrated as `c75c4b98`. Integrated focused qualification reproduced at 47/47; semantic verification and Core typecheck passed; Go still `symbol_only`.
- `2026-08-25` — Wave 3 materialized as one Agent A public-promotion mission. Product witness/final release qualification intentionally remain downstream.
- `2026-08-26` — Agent A Wave-3 report verified and integrated as `2c58f2de`. Integrated focused validation reproduced at 47/47 Go qualification, 7/7 language evidence, and 27/27 MCP promotion tests; semantic verification and Core/MCP typechecks passed.
- `2026-08-26` — Wave 4 materialized as the single final Agent B mission: TruffleHog public witness plus exact-head Core/MCP/release/product qualification.
