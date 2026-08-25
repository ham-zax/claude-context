# Agent A — Delete Forensic Repair

**Repository:** `/home/hamza/repo/satori`  
**Artifact type:** executable behavior / public contract deletion  
**Workspace:** current checkout `/home/hamza/repo/satori`  
**Isolation reason:** none; Wave 1 intentionally has one implementation writer  
**Can start:** immediately  
**Depends on:** none beyond coordination base `86393ae334adba8213ae33bec6cb9c353482577e`  
**Execution lifetime:** ordinary  
**Wake strategy:** none  
**Developer visibility:** headless

## Read first

- `docs/plans/SATORI_ARCHITECTURE_SIMPLIFICATION_CLEAN_BREAK_PLAN.md` — authoritative clean-break requirements, especially Task 0.
- `docs/superpowers/agent-plans/2026-08-20-architecture-simplification-clean-break/README.md` — dependency map, workspace policy, and neighboring ownership.
- `AGENTS.md` — repository engineering and scope rules.

Inspect the current repository before editing. The source plan's file list is an evidence-backed starting point, not permission to make unrelated changes.

## Objective

Complete Task 0 of the clean-break architecture plan: remove forensic authority repair as a product/runtime path so the later Publication architecture does not have to migrate or preserve it.

The end state has no `manage_index repair`, no `RepairProof` family, and no authority-salvage `repairIndex()` workflow. Source changes converge through `sync`; authoritative incompatibility, loss, or unprovable state routes to a fresh `reindex`. Do not replace repair with a renamed salvage mechanism.

## Current state

- Coordination base is `86393ae334adba8213ae33bec6cb9c353482577e` on `integrate/language-spine-cbm-go`.
- The architecture plan is committed and explicitly sequences Task 0 before PublicationStore/root-writer migration.
- `repairIndex()` is a large proof/salvage path spanning Core and MCP contracts, handlers, readiness/status hints, mutation action unions, and recovery behavior.
- The unrelated untracked `docs/plans/2026-08-20-go-calls-v0-promotion-plan.md` must remain untouched.

## Ownership

You own:

- deletion of the public/internal `repair` lifecycle action;
- deletion of Core repair proof/result contracts and the authority-salvage workflow;
- removal of repair-only relationship compatibility/promotion behavior;
- first-party Core/MCP callers, hints, action unions, response fields, and recovery branches invalidated by that deletion;
- routing resulting authoritative uncertainty to `reindex` and ordinary source convergence to `sync`.

Neighboring work owns:

- `PublicationStore`, the new Core root mutation owner, atomic current-publication activation, and publication read leases (Task 1+);
- source-checkpoint, navigation, policy, rollback, SnapshotManager, port-surface, and GC redesign beyond what is strictly made dead by deleting repair;
- Go `calls_v0` promotion.

## Coordination contract

Do not start Task 1 or introduce PublicationStore/root-writer abstractions in this mission.

Do not preserve repair through aliases, compatibility shims, hidden fallback actions, or a new proof object. When deleting repair exposes code that only existed to service repair, delete that code if it has no independent current caller. When a behavior has a non-repair owner/use, preserve it rather than broadening this mission.

The public lifecycle contract after this mission is:

```text
source divergence / normal change  -> sync
authoritative incompatibility/loss -> reindex
cheap derived cache missing        -> rebuild only from already-authoritative exact inputs when current code supports it safely
```

If repository evidence shows a supposedly repair-only mechanism is required by a separate current product path, preserve that mechanism and report the dependency rather than expanding into another architecture task.

## Success conditions

- `manage_index` no longer accepts, routes, documents, or returns an action named `repair`.
- Core exports no `RepairProof`, `RepairSnapshotEvidence`, `RepairActivatedGeneration`, or `RepairIndexResult` product contract.
- The authority-salvage `IndexGenerationWorkflow.repairIndex()` path and repair-only helpers/delegates are gone.
- `repair_proof_limit`, `repairProof`, repair-specific operation/action union members, and user guidance recommending repair are gone from production Core/MCP surfaces.
- Relationship/index-format incompatibility no longer has a repair-only promotion route and instead leads to reindex under the existing lifecycle semantics.
- No compatibility alias or renamed forensic-repair API is introduced.
- Task 1 PublicationStore/root-writer work has not been started.
- The unrelated Go plan remains untouched.

## Required validation

Do **not** create, modify, or run tests for this mission.

Use direct non-test evidence only:

1. focused repository searches across production Core/MCP code for `repairIndex`, `RepairProof`, `repair_proof_limit`, `repairProof`, and `manage_index`/action-union occurrences of `repair`; investigate only matches that can still represent live product behavior;
2. inspect the resulting public action/status/hint paths to confirm uncertainty routes to `reindex` and source convergence remains `sync`;
3. run `git diff --check`;
4. inspect the complete diff once before finishing.

Do not run broad package, release, or test suites unless a mandatory repository rule discovered during the mission explicitly requires one.

## Out of scope

- Task 1 PublicationStore or root mutation coordinator implementation.
- Atomic read-pin or Publication GC work.
- Navigation JSON/SQLite simplification.
- v3 call-graph sidecar deletion except for a strictly repair-only reference that becomes dead as part of this mission.
- SnapshotManager deletion beyond repair-only branches/fields made dead by this mission.
- General compatibility cleanup unrelated to repair.
- Go language/call-graph work.
- New tests or test rewrites.

## Working style

Apply the repository's Causal Coding and Ponytail principles: identify the real owner, delete rather than adapt where the repair contract is obsolete, reuse existing `sync`/`reindex` lifecycle behavior, and make the smallest complete cross-package deletion. Avoid new abstractions, compatibility scaffolding, extra proof machinery, or opportunistic cleanup.

Keep the current checkout safe. Do not stage, delete, rename, or modify the untracked Go plan. Do not create another worktree unless a real concurrent-write conflict appears; report that conflict instead.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. workspace/branch and commits created, if any;
3. concise summary of the repair surface deleted and the resulting `sync`/`reindex` behavior;
4. direct validation actually performed; explicitly state that tests were not run;
5. any surviving repair-named symbol and why it is not a live forensic-repair contract;
6. anything the next PublicationStore mission needs to know, including changed/deleted interfaces;
7. unresolved risks, deviations, or decisions needed.
