# Agent B — Publication Foundation and Core Writer Ownership

**Repository:** `/home/hamza/repo/satori`  
**Artifact type:** executable  
**Workspace:** current checkout `/home/hamza/repo/satori`  
**Isolation reason:** none; Wave 2 has one implementation writer and must build on Agent A's accepted uncommitted Task 0 diff  
**Can start:** immediately  
**Depends on:** Agent A / Task 0 complete and verified in the current working tree  
**Execution lifetime:** ordinary  
**Wake strategy:** none  
**Developer visibility:** headless

## Read first

- `docs/plans/SATORI_ARCHITECTURE_SIMPLIFICATION_CLEAN_BREAK_PLAN.md` — authoritative clean-break architecture and Task 1 acceptance criteria.
- `docs/superpowers/agent-plans/2026-08-20-architecture-simplification-clean-break/README.md` — current dependency map and working-tree baseline.
- `AGENTS.md` — repository ownership, scope, safety, and verification rules.
- Relevant current Core/MCP code, especially the existing MCP mutation lease, Core publication/read-retention owner, Core policy mutation coordinator, Context composition path, and the production create/reindex/sync/clear callers.

## Objective

Own **Task 1 only**: establish the current-only PublicationStore contract and move root mutation ownership into Core without beginning later candidate/source/navigation/policy/read-path migrations.

The result should create the smallest real foundation that later tasks can migrate onto:

- one Core-owned cross-process writer fence for root mutation operations;
- one current-only immutable Publication descriptor/store with a single durable current selector;
- one atomic current-publication read-pin primitive;
- no Core dependency on MCP and no legacy Publication compatibility reader.

This is an ownership move, not a rewrite of indexing or read behavior beyond what Task 1 requires.

## Current state

The working tree intentionally contains Agent A's accepted Task 0 implementation on top of HEAD `86393ae334adba8213ae33bec6cb9c353482577e`:

- 26 tracked files changed;
- 75 insertions / 1,856 deletions;
- `manage_index repair`, repair proof/result contracts, authority-salvage `repairIndex()`, and relationship-only repair promotion are gone;
- source convergence still routes to `sync` and authoritative uncertainty to `reindex`;
- the same-sync-operation marker retry and current interrupted-recovery path still exist for later architecture tasks;
- no tests were changed or run.

Also present and out of scope:

- untracked `docs/plans/2026-08-20-go-calls-v0-promotion-plan.md`;
- untracked coordination files under this agent-plan directory.

Treat all existing tracked Task 0 changes as accepted baseline state. Do not revert, stash, stage, commit, rewrite, or absorb unrelated untracked work.

The current writer fence lives in `packages/mcp/src/core/mutation-lease.ts` and depends on MCP's `DefaultProcessInspector`. Core already contains process-start/liveness and filesystem-locking logic in `packages/core/src/core/index-policy-mutation-coordinator.ts`. Inspect before deciding whether to reuse/extract that Core capability or move only the minimum required writer-liveness behavior. Do not copy MCP ownership into Core wholesale if an existing Core mechanism already covers the needed boundary.

The current publication read/retention gate is still owned by `IndexAuthorityCoordinator`. Task 1 may reuse/move the minimum semantics needed to establish the new PublicationStore contract, but do not perform Task 7's broad read-path migration in this mission.

## Ownership

You own:

- the Task 1 `Publication`, `PublicationId`, `PublicationRef`, and `PublicationLease` current-only contracts;
- `PublicationStore` persistence and current-pointer ownership;
- moving the existing root mutation lease semantics into a Core-owned coordinator;
- migrating production `create | reindex | sync | clear` mutation ownership so direct Core and MCP-driven mutations use that same Core writer owner;
- atomic PublicationStore read pinning and the conservative GC eligibility boundary required by Task 1;
- removing the old MCP mutation-coordinator production ownership once all production callers have migrated.

Later missions own:

- Task 2 full candidate construction and PreparedFileChangeSet/authenticity deletion;
- Task 3 source checkpoint migration;
- Task 4 navigation publication migration and JSON/SQLite simplification;
- Task 4A v3 call-graph sidecar deletion;
- Task 5 policy/marker authority collapse;
- Task 6 rollback-journal deletion;
- Task 7 broad proof/read preparation migration;
- Task 8 SnapshotManager deletion;
- Tasks 9–11 surface/collection/compatibility cleanup.

## Coordination contract

Preserve the accepted Task 0 deletion. Do not reintroduce repair as an action, alias, recovery path, receipt, compatibility mode, or writer action.

The new Core writer owner must preserve the real safety semantics of the existing lease: canonical-root ownership, monotonic generation, operation identity, live-process ownership, stale/dead-owner recovery, currentness assertion, and atomic persisted state publication. Simplify implementation where existing Core facilities make that possible; do not weaken the cross-process writer boundary.

`PublicationStore` is current-format only. Do not read or translate old completion markers, policy documents, navigation pointers, synchronizer snapshots, or proof receipts into a Publication.

Normal GC-sensitive reads must use an atomic `acquireCurrentRead(root)` operation. It must resolve the current Publication and establish its retention pin as one operation relative to activation/GC. `getCurrent()` followed later by `acquireRead(id)` is not an acceptable normal read sequence.

Activation durability is contractual:

`candidate durable -> write current temp -> fsync temp -> atomic rename -> fsync parent directory`

A Publication ID must not become reachable until the referenced local publication metadata/resources required by Task 1 are durable.

For the current single-publication-runtime support model, destructive GC must remain disabled/conservative whenever the supported reader-coordination boundary cannot be established. Do not invent a distributed reader-lease service in this mission.

Keep PublicationStore/domain ownership in Core. `Context` may compose/delegate but must not become the new mutable publication domain owner. Prefer not to expose PublicationStore internals from the Core package barrel. Export only the minimum cross-package contract actually required by first-party MCP callers.

## Success conditions

- Core contains one current-only PublicationStore with no legacy union/reader.
- PublicationStore uses one durable current selector per root and keeps old Publications addressable by ID after activation.
- Candidate state that never reaches `activate()` cannot become current authority.
- `activate()` makes required publication state durable before pointer reachability and performs temp write, temp fsync, atomic rename, then parent-directory fsync.
- `acquireCurrentRead(root)` cannot select a Publication that retention/GC can delete before the returned lease is established.
- Read leases are keyed to Publication ID, not only to a root-wide active-reader count.
- Destructive GC is conservative when the single supported publication-runtime ownership boundary is not established.
- Direct Core mutation entry points and MCP-driven `create | reindex | sync | clear` use one Core-owned writer-fence owner.
- Core has no dependency on MCP.
- The old MCP mutation coordinator has no production ownership/callers left and is deleted when that condition is true.
- Task 0 repair deletion remains intact.
- Task 2+ migrations have not been started merely to make Task 1 look complete.
- The unrelated Go plan and coordination files remain untouched.

## Required validation

Do **not** create, modify, or run tests for this mission.

Do not run broad package/release suites. A package typecheck is not required in this wave because the accepted Task 0 clean break intentionally leaves existing test sources that may still reference deleted repair contracts.

Required direct non-test evidence:

1. focused production search/inspection proving every production root mutation path now uses the Core-owned writer owner and no production MCP mutation-owner path remains;
2. focused inspection of PublicationStore activation showing candidate durability precedes reachability and the pointer sequence includes parent-directory fsync;
3. focused inspection of `acquireCurrentRead(root)` showing current resolution and retention pinning are atomic relative to activation/retention;
4. focused search proving Core does not import/depend on MCP and no legacy Publication-format reader was added;
5. `git diff --check`;
6. one complete final diff inspection before reporting completion.

If an existing mandatory repository rule discovered during the mission explicitly requires a non-test check, run only that required check and report it.

## Out of scope

- Any test creation, modification, or execution.
- Task 2 candidate construction or PreparedFileChangeSet migration.
- Source checkpoint redesign.
- Navigation/SQLite/v3 call-graph deletion.
- Policy/completion-marker authority migration.
- SnapshotManager deletion.
- Broad public-surface cleanup beyond the minimum contract needed to move the writer owner into Core.
- Go `calls_v0` work.
- New compatibility adapters or migrations for old local state.
- New worktrees, branches, commits, stashes, staging, or history rewrites.

## Working style

Use Causal Coding and Ponytail principles. Trace the real mutation/read ownership before editing. Prefer deletion/reuse/native Core facilities over copying MCP machinery. Keep one authoritative owner and the smallest complete Task 1 diff. Do not add factories, generic ports, compatibility layers, or future-proofing unless current production callers require them.

Use the current checkout. Preserve Agent A's accepted working-tree changes. If another writer begins modifying the same checkout or a required change would materially enter Task 2+, stop expansion and report the coordination conflict rather than silently widening scope.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. workspace, branch, HEAD, and whether any commits/staging/history operations occurred;
3. concise summary of the new PublicationStore and Core writer-owner contracts;
4. production caller migration summary and what happened to `packages/mcp/src/core/mutation-lease.ts`;
5. required direct non-test validation actually performed;
6. exact changed/deleted interfaces the next mission must know;
7. confirmation that Task 0 repair deletion, the Go plan, and coordination files were preserved;
8. any unresolved risks, deviations, or boundary decisions needed before Task 2.
