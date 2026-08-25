# Agent C — Delete Durable MCP SnapshotManager and Derive Status from Real Owners

**Repository:** `/home/hamza/repo/satori`
**Artifact type:** executable
**Workspace:** current checkout `/home/hamza/repo/satori`
**Can start:** after Task 7 integration acceptance
**Depends on:** Tasks 0–7 complete and integration-reviewed in the current working tree
**Execution lifetime:** ordinary bounded coding mission

## Read first

Read these before editing:

- `AGENTS.md`
- `docs/plans/SATORI_ARCHITECTURE_SIMPLIFICATION_CLEAN_BREAK_PLAN.md`, especially Finding 30 and Task 8
- `docs/superpowers/agent-plans/2026-08-20-architecture-simplification-clean-break/README.md`
- this mission file
- the current implementations of `packages/mcp/src/core/snapshot.ts`, `packages/mcp/src/core/sync.ts`, `packages/mcp/src/core/handlers.ts`, `packages/mcp/src/core/manage-maintenance-handlers.ts`, `packages/mcp/src/core/manage-indexing-handlers.ts`, `packages/mcp/src/core/full-index-operation.ts`, `packages/mcp/src/tools/list_codebases.ts`, `packages/mcp/src/tools/read_file.ts`, `packages/mcp/src/server/shared-runtime.ts`, `packages/mcp/src/server/provider-runtime.ts`, `packages/core/src/generation/publication-store.ts`, and `packages/core/src/generation/root-mutation-coordinator.ts`.

This brief is intentionally self-contained. Prior implementation sessions are no longer the working context for this agent. Treat the current WSL tree plus the source plan and coordination package as authoritative.

## Objective

Own Task 8 only: delete MCP's durable `SnapshotManager` database and derive index/tracked-root/status state from the owners that now actually own it.

The target model is:

```text
PublicationStore
  current Publications
  Publication-owned source/policy/navigation/vector metadata
        |
        +--> indexed/tracked roots after restart
        +--> indexed paths / partial coverage
        +--> current collection / index counts
        +--> current policy + control signature

MutationLeaseCoordinator / same-operation live projection
  active mutation id + action + generation + phase/progress
        |
        +--> process-lifetime manage_index status
        +--> indexing/sync/clear blocking and progress

No mcp-codebase-snapshot.json
No snapshot migration/lock/merge/tombstone/quarantine database
No interrupted indexing promotion/recovery row
```

A process restart may forget completed/failed operation history. That is an intentional clean-break behavior change. Current Publications survive restart and are rediscovered from PublicationStore. Active mutations are live operation state, not a second durable lifecycle database.

## Accepted architecture you inherit

Do not reconstruct or restore any architecture removed by Tasks 0–7.

### Tasks 0–2 — repair deletion, Publication foundation, Core-owned candidate construction

- Forensic repair/salvage authority is deleted. Source convergence is `sync`; unsupported/unprovable authority requires reindex.
- Core owns the one root mutation lease (`MutationLeaseCoordinator` / `RootMutationLease`). MCP does not own a parallel writer fence.
- `PublicationStore.current.json` is the single current selector.
- Full-index candidates are built privately in Core and selected through `PublicationStore.activate()` only after candidate resources are ready.
- Activation distinguishes pre-pointer failure, `visible_unconfirmed`, and durable selection. Never add rollback to an earlier authority state.

### Task 3 — Publication-owned source freshness

- Each Publication owns `source.json` with current-only `canonicalRoot`, `fileHashes`, `fileStats`, and `unprocessedPaths`.
- Source freshness is not Publication identity.
- Partial coverage is explicit: paths in `unprocessedPaths` are selected-but-not-indexed. For read/indexed-path derivation, do not treat them as published payload.
- Working-tree drift schedules/controls sync; it does not mutate an immutable Publication.

### Tasks 4 and 4A — Publication-owned navigation and one persisted call graph

- Completed Publications own immutable JSON `navigation/`; partial Publications have `navigation: null`.
- Publication ID is navigation identity. There is no second navigation current pointer, SQLite shadow, seal authority, or independent navigation GC.
- The duplicate MCP v3 call-graph sidecar is deleted. Relationship navigation is the only persisted graph representation.

### Task 5 — Publication is policy/format/vector authority

- `Publication.policy` contains explicit custom extensions/ignore rules, file-based rules, effective extensions/ignore patterns, `policyHash`, and `controlSignature`.
- `Publication.format` owns current compatibility (`indexFormatVersion`, embedding identity, relationship version).
- Durable policy documents, completion markers, vector control records, marker fingerprints/run IDs, and compatibility proof graphs are deleted.
- Live selection controls remain a separate fail-closed admission boundary.

### Task 6 — no restore transaction

- The restore journal/type family is deleted.
- Pre-activation failure discards only the unpublished candidate.
- `clearIndex()` clears `current.json` before physical cleanup and never restores it if cleanup later fails.
- Cold-start Publication cleanup removes only provably private descriptor-less candidate generations. Descriptor-bearing historical Publications are retained until Task 10.

### Task 7 — Publication leases replace read proofs

- Production `ProvenVectorGenerationReceipt`, `ProvenGenerationReceipt`, `GenerationProofCoordinator`, proof caches/flights, prepared proof receipts, exact-recount read authority, and `index-authority-contract.ts` are gone.
- Ordinary root reads acquire identity and retention atomically through `PublicationStore.acquireCurrentRead(root)`.
- MCP search/navigation sessions carry exact `PublicationLease`s.
- A request holding Publication N remains on N if N+1 becomes current.
- Stale-while-sync explicitly leases the previous Publication and disables working-tree enrichment/reranking that could alter old-Publication results.
- Selection controls still fail closed without requiring the leased Publication to remain current.
- Family-wide staged/vector preflight cleanup is deliberately non-destructive because `__gen_...` naming cannot distinguish unpublished candidates from historical Publications. Exact candidate-owned failure cleanup remains destructive. General historical/vector GC is Task 10.

## Baseline

Task 7 final integration acceptance is on:

```text
branch: integrate/language-spine-cbm-go
HEAD:   86393ae334adba8213ae33bec6cb9c353482577e
tracked dirty files: 96
aggregate tracked diff: +3740 / -20903
staged files: 0
changed test files: 0
```

Accepted untracked Core source owners are part of the implementation baseline, not disposable scratch files:

```text
packages/core/src/generation/publication-store.ts
packages/core/src/generation/root-mutation-coordinator.ts
```

Preserve all accepted Tasks 0–7 work. Do not revert, stash, stage, commit, reset, clean, checkout, create branches/worktrees, or rewrite history.

The unrelated untracked Go `calls_v0` plan and the coordination package are not implementation targets.

## Current live ownership map

The source plan is authoritative. Current inspection adds these facts so you do not have to reconstruct prior-session history from scratch.

1. `packages/mcp/src/core/snapshot.ts` still exists and is about 1,993 lines. It remains a second durable database containing codebase lifecycle rows, indexed-path manifests, ignore metadata, operation receipts, V1/V2/V3 migration, locking, stale-lock breaking, disk merge, tombstones, and corruption quarantine.

2. `packages/mcp/src/core/interrupted-index-recovery-coordinator.ts` still exists and is almost entirely SnapshotManager-era recovery. `packages/mcp/src/core/indexing-recovery.ts` is already deleted by earlier work. Delete the remaining interrupted-snapshot recovery owner rather than replacing it.

3. `packages/mcp/src/config.ts` still declares:
   - `IndexOperationReceipt` with `lastDurableTransitionAt` and runtime fingerprint/writer durability semantics;
   - `CodebaseSnapshotV1`, `CodebaseSnapshotV2`, `CodebaseSnapshotV3`, `CodebaseSnapshot`;
   - `CodebaseInfo*`, manifest/tombstone and snapshot compatibility fields.

   Remove snapshot-format contracts. Preserve only a minimal process-lifetime operation/status shape if current public responses still need one; do not keep `durable`, `persisted`, or post-restart semantics as compatibility aliases.

4. `MutationLeaseCoordinator` currently owns durable cross-process writer fencing and exposes `RootMutationLease` identity (`canonicalRoot`, generation, operation ID, action, owner, pid, acquiredAt), but it does not currently own phase/progress/error projection. Task 8 must put any still-useful live operation projection on this same operation owner or a tightly coupled process-local view of that exact lease. Do not create another durable file/database.

5. `PublicationStore` currently has `getCurrent(root)`, `acquireCurrentRead(root)`, `acquireRead(root,id)`, source/navigation access, and startup cleanup, but no `listCurrent()` method. Task 8 needs safe current-Publication enumeration after restart. Add the smallest Core enumeration API needed by MCP and expose it through the cohesive Core/Context boundary. Do not make MCP scan PublicationStore internals directly.

6. `list_codebases` still begins from `ctx.snapshotManager.getAllCodebases()`, then re-probes Publications. Reverse that ownership: enumerate current Publications first, add live active mutations where useful, apply the session workspace gate, and derive capability details from each Publication/navigation. Remove snapshot corruption warnings because the snapshot no longer exists.

7. `read_file` still uses snapshot rows to discover indexed roots and `indexManifest.indexedPaths` to decide whether a path belongs to the published index. Replace that with current Publication enumeration plus Publication-owned `source.json`.

   For a Publication source checkpoint, published indexed paths are the checkpoint paths that are actually covered by that Publication; do not authorize `unprocessedPaths` in a partial Publication as indexed payload. Preserve the existing separately controlled live-changed-path behavior only where it is still product-correct.

8. `TrackedRootReadiness`, search/status preparation, and handlers still expose snapshot helper methods such as `getSnapshotAllCodebases`, `getSnapshotIndexedCodebases`, `getSnapshotIndexingCodebases`, `getSnapshotCodebaseInfo`, and snapshot refresh/recovery helpers. Delete the snapshot dependency rather than renaming those helpers.

9. `SyncManager` remains heavily SnapshotManager-dependent. Important current dependencies include:
   - `getCodebaseStatus()` gates;
   - `getCodebaseIndexedPaths()` manifest fallback;
   - persisted ignore-control signature fallback;
   - `setCodebaseRequiresReindex()` rows;
   - `setCodebaseSyncCompleted()` lifecycle rows;
   - durable operation receipt start/phase/observation;
   - `getIndexedCodebases()` for periodic sync roots.

   Replace them with current Publication/source/policy state and the live root mutation operation. Task 5 already made `Publication.policy.controlSignature` the accepted policy-control identity; do not use snapshot ignore-control metadata as a fallback. Task 3 already made `source.json` the source/coverage owner; do not keep snapshot manifests as fallback authority.

10. `SyncManager.watchedCodebases` is process-local and currently populated lazily by `touchWatchedCodebase()`. On restart, Task 8 must seed tracking/watchers from current Publication enumeration so indexed roots do not disappear just because the snapshot file is gone. The snapshot-named `refreshWatchersFromSnapshot()` is already only a pass-through to the watch list and should be renamed/deleted as appropriate.

11. `FullIndexOperation`, manage-indexing, maintenance, sync, and vector-backend maintenance still write SnapshotManager lifecycle/progress/operation state. After Task 8, they may update the same live mutation operation projection, but they must not save a parallel durable lifecycle record.

12. `manage_index status` currently mixes a live `RootMutationLease` with `snapshotManager.getLatestOperation()`. Replace this with current Publication/readiness plus the live operation for the active lease. Completed/failed operation history may disappear after restart. Do not add a status-log file.

13. `packages/mcp/src/tools/manage_index.ts` still promises a durable operation receipt and says status returns the latest persisted receipt after restart. Update that public description to explicit process-lifetime operation semantics.

14. `ProviderRuntime`, `SharedRuntimeHost`, `ToolContext`, and `ToolHandlers` still carry a `SnapshotManager` dependency through construction. Remove that dependency end to end. `SharedRuntimeHost` currently constructs and loads the snapshot before sessions; after Task 8 there is no snapshot load.

15. `SharedRuntimeHost.recoverInterruptedIndexingAtStartup()` currently consults snapshot indexing rows. Delete the interrupted-snapshot promotion/recovery behavior. Stale writer leases are already owned by `MutationLeaseCoordinator`; unpublished candidate cleanup is owned by PublicationStore/candidate cleanup.

16. Some Task 8 file names in the original source plan are already obsolete because earlier tasks removed their responsibilities. In particular:
   - `packages/mcp/src/core/indexing-recovery.ts` is already deleted;
   - Task 4A already removed SnapshotManager call-graph metadata as an authority;
   - Task 7 already migrated read identity to `PublicationLease`.

   Replan from the current tree; do not resurrect those old seams merely to match the original file list.

## Ownership

You own:

- deletion of `packages/mcp/src/core/snapshot.ts` and all production `SnapshotManager` construction, injection, reads, writes, migration, locks, merge, tombstone, and quarantine behavior;
- deletion of `packages/mcp/src/core/interrupted-index-recovery-coordinator.ts` and snapshot-based interrupted-index promotion/recovery;
- deletion of V1/V2/V3 snapshot types and snapshot lifecycle types in `packages/mcp/src/config.ts` that have no current owner;
- the minimal Core current-Publication enumeration API required to restore tracked roots after restart;
- the minimal live operation projection required for current-process status/progress, attached to the Core root mutation operation rather than a new durable store;
- migration of `list_codebases`, `read_file`, tracked-root admission, status, full index, sync, maintenance, runtime startup, and watcher seeding away from SnapshotManager;
- migration of sync indexed-path/policy-control reads to Publication source/policy state;
- public `manage_index` description changes required by loss of persisted post-restart operation history;
- direct public/Core surface synchronization caused by the minimal new enumeration/live-operation API if it changes exported contracts.

Neighboring missions own:

- **Task 9:** broad `IndexMutationPort` / `SourceFreshnessPort` pass-through deletion and broad Core public-surface contraction;
- **Task 10:** final collection-family naming and general historical Publication/vector GC;
- **Task 11:** obsolete runtime/config/release-state cleanup and final qualification.

Do not absorb those tasks.

## Required architecture contracts

### One durable index authority

After Task 8, there is no durable MCP lifecycle database. Current Publication truth comes from PublicationStore. Do not replace SnapshotManager with another JSON/SQLite/status file, cache journal, or migration layer.

### Current Publications restore tracked roots

A fresh process must be able to enumerate current Publications from the state root and recover the set of indexed roots without a snapshot file. Enumeration must validate Publication/root ownership using the same fail-closed discipline as PublicationStore.

MCP must consume a Core API; it must not duplicate PublicationStore's hashed-root directory parsing.

### Live operation status belongs to the live root mutation

An active create/reindex/sync/clear operation may expose phase/progress/error/status information, but that projection must be keyed to the exact current `RootMutationLease`/operation ID. A later lease generation must not inherit an earlier operation's phase.

No process restart guarantee is required for completed/failed operation history. Do not keep `lastDurableTransitionAt`, runtime-fingerprint proof, disk merge, or persisted terminal receipts merely for compatibility.

### Publication source/policy replace snapshot manifest/control state

For current Publication P:

- indexed root and collection/counts come from `P`;
- indexed source coverage comes from P's `source.json` and partial `unprocessedPaths` semantics;
- policy/control identity comes from `P.policy`;
- navigation capability comes from P's actual navigation state.

Do not retain snapshot `indexManifest`, ignore-control signature, ignore-rules version, or fingerprint fields as authority/fallback.

### Restart behavior is simple

On restart:

1. PublicationStore discovers current Publications.
2. current Publications become tracked roots / watcher candidates.
3. no stale `indexing` snapshot row is promoted, repaired, or marked failed.
4. stale mutation leases are handled by the existing root mutation owner.
5. private candidates are handled by PublicationStore/candidate cleanup.

Historical operation receipts are not reconstructed.

### Clear is still selector-first

Task 6 remains authoritative. Clear removes current Publication authority before physical cleanup. Removing SnapshotManager must not reintroduce a lifecycle row that pretends the index remains selected until cleanup finishes.

### Reads remain Publication-leased

Task 7 remains authoritative. Removing snapshot root discovery must not reintroduce a select-then-pin path or receipt/proof graph. Search/navigation reads continue to acquire one exact Publication lease.

## Success conditions

Task 8 is complete when all are true:

1. `packages/mcp/src/core/snapshot.ts` is deleted.
2. Production has zero `SnapshotManager`, snapshot load/save/refresh, snapshot lock/merge/tombstone/quarantine, and V1/V2/V3 snapshot format ownership.
3. `packages/mcp/src/core/interrupted-index-recovery-coordinator.ts` is deleted and no snapshot-based interrupted-index recovery/promotion replacement exists.
4. A fresh process can enumerate current Publications through Core and restore indexed/tracked roots without `mcp-codebase-snapshot.json`.
5. `list_codebases` derives ready roots from current Publications and active indexing roots from live mutations, still applying workspace authorization.
6. `read_file` root discovery/admission and published-path coverage no longer depend on snapshot status/manifest rows.
7. Search/tracked-root readiness no longer trusts snapshot lifecycle rows.
8. Sync no longer reads/writes snapshot indexed-path manifests, ignore-control signatures, ignore-rule versions, requires-reindex rows, or sync-completed rows as authority.
9. Full index/sync/clear/maintenance no longer save durable operation phases to a snapshot. Active progress/status uses the exact live mutation operation.
10. Startup watcher/tracking state is seeded from current Publications.
11. `manage_index status` reports current Publication/readiness plus live process operation state and does not promise terminal operation history after restart.
12. `packages/mcp/src/tools/manage_index.ts` no longer advertises durable/persisted operation receipts after restart.
13. `ProviderRuntime`, `SharedRuntimeHost`, `ToolContext`, and `ToolHandlers` have no SnapshotManager dependency.
14. Current Publication/navigation/source/policy semantics from Tasks 3–7 remain intact.
15. Task 7 lease retention remains conservative; Task 8 does not implement Task 10 GC.
16. No compatibility wrapper preserves SnapshotManager or snapshot format names.
17. No tests are changed or run under this mission.

## Required direct non-test validation

Testing is not authorized. Do not create, modify, delete, or run tests. Do not run package typecheck, build, broad package suites, or release checks.

After the candidate final state, gather focused evidence only:

1. Production search proving `snapshot.ts`, `SnapshotManager`, `CodebaseSnapshotV1/V2/V3`, snapshot load/save/refresh, lock, merge, tombstone, quarantine, and interrupted-snapshot recovery ownership are gone.
2. Direct fresh-process Publication enumeration exercise:
   - create/activate at least two current Publications in temporary state;
   - instantiate a new Core/runtime view against that state;
   - prove both current roots are enumerated without a snapshot file.
3. Direct tracked-root/list exercise through the narrowest real production seam proving a root present only through PublicationStore appears as indexed/ready after restart.
4. Direct `read_file` root/coverage exercise or equivalent production helper trace proving indexed-path membership comes from Publication `source.json`, including that a partial Publication's `unprocessedPaths` are not treated as published indexed payload.
5. Direct live-operation exercise proving phase/progress belongs to the exact active root mutation operation and does not leak to a later lease generation.
6. Restart/process-lifetime exercise proving no completed/failed durable operation receipt is reconstructed from disk and no `mcp-codebase-snapshot.json` is required.
7. Static/full-index/sync/clear traces proving they no longer call snapshot save/set lifecycle APIs.
8. Static sync trace proving policy-control identity comes from Publication policy and indexed coverage comes from Publication source state, not snapshot fallback.
9. Startup watcher/tracked-root trace proving current Publications seed process-local tracking after restart.
10. Public `manage_index` description search proving persisted/durable post-restart operation claims are gone.
11. If Core exports/public members change, run the existing non-test published-surface collector and synchronize `packages/core/contracts/published-surface.json` only if the intended Task 8 contract requires it.
12. `git diff --check`.
13. Output-based trailing-whitespace/final-newline checks for the accepted untracked Core owners.
14. Changed-test-file count remains zero.
15. Staged-file count remains zero.
16. Inspect the complete final production diff once after the final production edit.

## Integration continuation finding

The first Task 8 completion report is not yet accepted. Live integration review confirms the SnapshotManager/snapshot-format deletion, fresh Publication enumeration, Publication-owned read coverage, sync source/policy migration, startup watcher seeding, process-lifetime public wording, published-surface synchronization, and hygiene. One Major remains in the new live operation projection.

`MutationLeaseCoordinator.getOperation(root)` currently returns the process-local `operationsByRoot` entry without checking the durable root mutation generation. That is safe when the same coordinator acquires the next lease because `acquire()` overwrites the map, but it is not safe when another Core coordinator/process advances the shared durable generation.

Independent integration reproduction against the real coordinator state showed:

- coordinator A acquired generation 1, published a terminal `failed` operation, and released it;
- coordinator B, sharing the same durable mutation state directory, acquired generation 2, completed it, and released it;
- coordinator A observed durable generation 2 but `getOperation(root)` still returned its generation-1 failed operation.

This is reachable in the accepted architecture because direct Core callers can create a `Context`/`MutationLeaseCoordinator` and mutate the same state root without going through MCP's runtime-owner registry. The Core mutation fence intentionally supports those direct callers. `manage_index status` calls `getOperation(root)` whenever no mutation is currently active, so an MCP process can attach an obsolete terminal operation from generation N to Publication/status state produced by a later direct-Core generation N+1.

Close this seam without adding durable operation history:

- a process-local terminal operation may remain visible only while its generation is still the latest durable mutation generation for that root;
- `getOperation(root)` must return undefined (and may evict its local entry) once the durable coordinator state has advanced to a later generation;
- preserve process-lifetime terminal status after this process's own lease release when no newer generation exists;
- preserve exact active-lease progress and the no-post-restart-history behavior;
- do not add cross-process phase/progress persistence, a status journal, snapshot compatibility, or another lifecycle database.

Required continuation verification is narrow and non-test:

1. Same-coordinator behavior: terminal generation N remains available after release until a newer generation exists; acquiring N+1 replaces it.
2. Cross-coordinator behavior: A retains terminal N, B advances the same durable root to N+1, then A's `getOperation(root)` returns undefined rather than N.
3. Active operation progress remains exact-ID/generation scoped and `getOperationForLease(activeLease)` still works.
4. A fresh coordinator still reconstructs no completed/failed operation history.
5. Re-run the Task 8 snapshot-family zero sweep, Publication enumeration check, public wording check, published-surface collector, `git diff --check`, accepted Core whitespace/final-newline checks, zero changed tests, and zero staged files.
6. Inspect the final production diff once after the final production edit.

Testing, typecheck, build, broad suites, release checks, Task 9+, and Go work remain unauthorized.

## Final integration acceptance

Task 8 is accepted and closed on the live working tree.

The continuation fix is confined to the Core root-mutation owner. `MutationLeaseCoordinator.getOperation(root)` now validates its process-local cached operation against the durable root mutation generation under the existing per-root lock. A terminal operation remains visible while its generation is still current, but a later durable generation evicts/suppresses the older projection.

Independent integration reproduction proved:

- terminal generation 1 remained visible after release while generation 1 was still latest;
- same-coordinator generation 2 replaced generation 1 and exact active lookup retained the matching operation ID/progress;
- on a separate root, coordinator A retained failed generation 1, coordinator B advanced the shared durable state to generation 2, and A then returned no operation rather than stale generation 1;
- a fresh coordinator reconstructed no terminal operation history.

Task 8's broader accepted state remains intact: SnapshotManager/snapshot formats/recovery are gone, restart discovery comes from current Publications, source coverage/policy come from Publication state, startup tracking comes from current Publications, public operation wording is process-lifetime only, and the Core published surface matches the Task 8 fixture at 394 root exports / 62 Context members.

Task 9 is now the implementation frontier.

## Out of scope

- Do not create or run tests.
- Do not run typecheck, build, broad package suites, release checks, or final product qualification.
- Do not delete the entire `IndexMutationPort` / `SourceFreshnessPort` pass-through architecture merely because SnapshotManager callers disappear; Task 9 owns that contraction.
- Do not redesign collection-family naming or reclaim general historical Publication/vector resources; Task 10 owns that.
- Do not perform Task 11 runtime/config/release cleanup except the exact snapshot-format/public-description deletions required by Task 8.
- Do not touch the Go `calls_v0` plan.
- Do not edit coordination files.
- Do not create branches, worktrees, commits, stashes, staging operations, resets, cleans, checkouts, or history rewrites.

## Working style

Use Causal Coding, Clean Migration, and Ponytail principles.

Prefer deletion over adapters. Prefer one direct Core query over reconstructing another cache. Preserve current product behavior only where the source plan still requires it; persisted operation history after restart is explicitly not preserved.

Trace these paths end to end before editing:

```text
restart -> current Publication enumeration -> list/read/search root discovery
manage_index status -> current Publication + active mutation
full index -> progress -> activation -> status
sync -> Publication source/policy -> mutation -> new Publication
clear -> selector removal -> physical cleanup -> status
```

Stop when Task 8's observable contracts pass. Do not continue into Tasks 9–11.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. branch, HEAD, tracked aggregate, staged count, changed-test count, and confirmation of no Git/worktree/history operations;
3. deleted SnapshotManager/snapshot-format/interrupted-recovery ownership;
4. final Core current-Publication enumeration contract and restart root discovery flow;
5. final live operation/status contract and explicit post-restart behavior;
6. `list_codebases`, `read_file`, search/readiness migration summary;
7. sync source/policy/indexed-path migration summary;
8. full-index/sync/clear/maintenance progress/status migration summary;
9. startup watcher/tracked-root restoration behavior;
10. public `manage_index` operation-description change;
11. direct non-test validation actually run and observed results;
12. published-surface changes, if any;
13. confirmation Tasks 0–7 remained intact and Tasks 9–11/Go were not absorbed;
14. unresolved blockers/risks before Task 9.
