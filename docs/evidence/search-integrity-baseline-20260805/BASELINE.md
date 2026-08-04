HEAD: 6188001cbfd72318fe09e8e1eb259ad623a110e4
BRANCH: ## master...origin/master [ahead 2]
TIME: 2026-08-04T19:15:47Z
core_typecheck=0
mcp_typecheck=0
versions_check=0
diff_check=0

## Suite results (pre-change baseline)

| Check | Result |
| --- | --- |
| core typecheck | pass (exit 0) |
| mcp typecheck | pass (exit 0) |
| core test | 612 tests, 611 pass, 0 fail (1 skipped) |
| mcp test | 1145 tests, 1145 pass, 0 fail |
| versions:check | pass |
| git diff --check | clean |

Baseline includes only the two documentation/configuration commits on top of
`403723ee`: `ba76dd6` (chore: ignore pi-subagents artifacts and refine
delegation wording) and `6188001` (docs(search): record weakness verification
and implementation plan). No production code changed since `403723ee`.

## Fixture scenarios (Task 0)

Deterministic fixtures the tasks must reproduce; timing-free by construction:

1. `must:` match outside the normal candidate pool — lexical projection whose
   top-N candidates exclude a file containing the literal must token.
2. VoyageAI request that never resolves — injected fetch that neither resolves
   nor rejects until an abort/timeout fires (fake timers or injected timeout).
3. Cross-module Python constructor call — `from pkg.rules import Class;
   Class(...)` / aliased / qualified-module forms with one canonical target.
4. Brand-new untracked source file — `git status --porcelain=v1 -z
   --untracked-files=all` shows `??` inside index scope.
5. Payload complete but marker absent — indexed payload count matches
   `marker.totalChunks` while the completion-marker control record is missing.
6. Continuation cache not admissible — ranked result set exceeding the
   coordinator's reserved replay byte budget with remaining groups.
