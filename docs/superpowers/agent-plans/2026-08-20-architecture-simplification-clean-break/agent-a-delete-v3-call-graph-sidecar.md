# Agent A2 — Delete the Parallel v3 Call-Graph Sidecar

**Repository:** `/home/hamza/repo/satori`
**Artifact type:** executable
**Workspace:** current checkout `/home/hamza/repo/satori`
**Isolation reason:** none; Wave 6 has one implementation writer and must build on the accepted uncommitted Task 0–4 state
**Can start:** immediately
**Depends on:** Tasks 0, 1, 2, 3, and 4 complete and integration-reviewed in the current working tree
**Execution lifetime:** ordinary
**Wake strategy:** none
**Developer visibility:** headless

## Session recovery

Use this file, the coordination README, the source plan, `AGENTS.md`, and the live repository as the durable mission state. Do not infer ownership or prior decisions from stale tests or old names; reconstruct the current production path first.

## Read first

- `AGENTS.md` — repository and task-boundary rules.
- `docs/plans/SATORI_ARCHITECTURE_SIMPLIFICATION_CLEAN_BREAK_PLAN.md` — source architecture plan, especially Task 4A.
- `docs/superpowers/agent-plans/2026-08-20-architecture-simplification-clean-break/README.md` — accepted Task 0–4 contracts, live-tree findings, and downstream boundaries.
- Inspect the current production implementations of:
  - `packages/mcp/src/core/call-graph.ts`;
  - `packages/mcp/src/core/relationship-backed-call-graph.ts`;
  - `packages/mcp/src/core/search-types.ts`;
  - the call-graph tool/handler/readiness path;
  - full-index/sync hooks that rebuild/preserve call-graph sidecar state;
  - MCP config/snapshot/runtime construction that owns `CallGraphSidecarInfo` / `CallGraphSidecarManager`.

## Objective

Own Task 4A only: delete the duplicate MCP v3 call-graph sidecar so Publication-owned relationship navigation is the single persisted graph representation.

The `call_graph` product capability must remain. It should traverse the canonical relationship evidence already stored under the current Publication navigation and keep the currently supported source-backed fallback behavior. What disappears is the separate MCP-maintained v3 graph file, its manager, its rebuild lifecycle, its snapshot metadata, and terminology that falsely implies the traversal is backed by that sidecar.

Target mental model:

```text
Publication N
  navigation/
    symbols/
    relationships/   <- one persisted CALLS/relationship representation
        |
        v
relationship-backed traversal
  + current source-backed fallbacks where supported
        |
        v
call_graph response
```

There must be no second persisted `call-graph-v3` representation rebuilt after full index or sync.

## Accepted baseline

Tasks 0–4 are accepted in the current dirty checkout on:

```text
branch: integrate/language-spine-cbm-go
HEAD:   86393ae334adba8213ae33bec6cb9c353482577e
```

Task 4 integration review observed the current production aggregate:

```text
66 tracked files changed
3034 insertions
10921 deletions
staged files: 0
changed test files: 0
```

Accepted untracked Core owners remain:

```text
packages/core/src/generation/publication-store.ts
packages/core/src/generation/root-mutation-coordinator.ts
```

Preserve all accepted Task 0–4 work. Do not revert, stash, stage, commit, reset, clean, rename, rewrite, or replace it.

Task 4 now guarantees:

- Publication ID is the navigation identity;
- `PublicationStore.current.json` is the only current selector;
- completed Publications own immutable JSON `navigation/`;
- partial Publications use `navigation: null`;
- JSON navigation reads carry explicit `publicationId + navigationRoot`;
- the old navigation pointer/seal/SQLite/runtime-backend authority is gone;
- navigation has no independent retention/GC path;
- `symbolRegistryStateRoot` has no production owner;
- surviving navigation manifest/shard hashes are descriptive or reuse metadata, not Publication selectors/authenticators.

Do not regress those contracts.

## Live Task 4A ownership map

The source plan is directionally correct, but the live tree after Task 4 has these concrete seams. Rediscover callers before editing and treat this list as an orientation map, not a line-by-line recipe.

1. `packages/mcp/src/core/call-graph.ts` still contains the duplicate v3 sidecar owner:
   - `CallGraphSidecarManager`;
   - `SupportedSourceDeltaPolicy` / rebuild policy;
   - source-file recollection and language analysis;
   - v3 JSON file load/write/query logic;
   - a duplicate family of call-graph node/edge/note/test-reference/response types.

2. `packages/mcp/src/core/relationship-backed-call-graph.ts` already performs real traversal from Publication-owned relationship navigation. Its `build()` path is the capability to keep. It still depends on `CallGraphSidecarManager` and `SnapshotManager` only for obsolete `rebuildForIndex()`, `rebuildForSyncDelta()`, and `commitCallGraphSidecar()` lifecycle work.

3. The public traversal envelope in `packages/mcp/src/core/search-types.ts` already has call-graph result shapes, but still exposes a `sidecar` summary field. That field now counts records in the returned relationship traversal, not a persisted v3 sidecar. Rename it to truthful traversal/graph terminology with no compatibility alias.

4. `packages/mcp/src/tools/call_graph.ts` still documents `sidecar.nodeCount` / `sidecar.edgeCount`. Update the tool contract text to the new response field/name.

5. `packages/mcp/src/config.ts` and `packages/mcp/src/core/snapshot.ts` still persist/merge `CallGraphSidecarInfo` / `callGraphSidecar` metadata. Delete only that metadata family. SnapshotManager itself remains until Task 8.

6. `packages/mcp/src/server/provider-runtime.ts`, `packages/mcp/src/server/shared-runtime.ts`, and `packages/mcp/src/core/handlers.ts` still construct, own, or inject `CallGraphSidecarManager`. Remove that runtime object and its dependency plumbing.

7. `packages/mcp/src/core/full-index-operation.ts` still preserves previous `callGraphSidecar` metadata and calls handlers that rebuild the duplicate sidecar after publication. Delete those hooks/preservation paths. Full index should stop after the Publication-owned relationship navigation is published; Task 4A must not add a replacement build.

8. Sync/handler paths still expose call-graph rebuild methods that delegate to `RelationshipBackedCallGraph.rebuildForSyncDelta()`. Remove those hooks. Source changes already produce next-Publication relationship navigation through Core atomic sync.

9. `Handlers.loadRegistryValidatedCallGraphSidecar()` no longer loads the retired v3 sidecar at all. It checks Publication navigation compatibility/relationship readiness. Rename it and its host/plumbing to relationship/navigation terminology rather than deleting useful readiness behavior.

10. Search debug/finalization and navigation handling still use `sidecar` as an in-memory `{ nodes, edges }` label or `sidecarBuiltAt` naming even when the data is derived directly from Publication relationships. Rename only the Task-4A terminology that implies the deleted persisted v3 sidecar. Do not perform broad response/debug redesign.

11. Python source-backed call fallback, inbound coverage evidence, test-reference extraction, suppression notes, relationship traversal, and `navigationAuthority` attribution are product behavior to preserve. Do not remove them merely because their types currently import from `call-graph.ts`.

12. The Core language capability `callGraphBuild` is still used by relationship extraction. Keep it. Deleting the duplicate MCP sidecar must not disable relationship construction or `call_graph` language eligibility.

## Ownership

You own:

- deletion of `packages/mcp/src/core/call-graph.ts` after all production type/lifecycle callers migrate;
- one canonical call-graph traversal type family in `search-types.ts` or the smallest equivalent existing MCP contract owner;
- removal of `CallGraphSidecarManager`, source recollection/building, v3 sidecar file I/O, and unused `queryGraph()`;
- removal of full-index/sync duplicate sidecar rebuild hooks;
- removal of `CallGraphSidecarInfo` / `callGraphSidecar` from MCP config/snapshot/status state;
- removal of manager construction/injection from provider/shared runtime and handlers;
- removal of `RelationshipBackedCallGraph` dependencies on the manager and SnapshotManager that exist only for duplicate sidecar persistence;
- truthful renaming of the public traversal response field currently called `sidecar`;
- truthful renaming of current helper/plumbing names such as `loadRegistryValidatedCallGraphSidecar()` where they now mean Publication relationship readiness;
- Task-4A-specific public tool descriptions, envelopes, debug labels, and API/release migration notes required by the intentional response-field break.

Neighboring missions own:

- **Task 5:** policy document and completion-marker authority deletion;
- **Task 6:** remaining durable restore transaction deletion;
- **Task 7:** broad read receipt/session collapse to Publication leases;
- **Task 8:** deletion of SnapshotManager itself;
- **Task 9+:** broad port/surface/GC cleanup.

Keep this mission focused. Do not start those later tasks merely because Task 4A touches their files.

## Coordination contract

### One persisted graph representation

After Task 4A, the only persisted graph relationship representation is Publication-owned JSON relationship navigation. Do not write a replacement cache/sidecar/database for call graph traversal.

### Preserve traversal behavior

`call_graph` remains relationship-backed. Preserve:

- caller/callee/both traversal;
- bounded depth/limit behavior;
- low-confidence suppression notes;
- test references;
- inbound coverage evidence;
- source-backed Python fallback where the current prepared read authorizes it;
- current hints/warnings that remain semantically correct;
- `navigationAuthority` attribution to the serving Publication relationship artifact.

If a behavior was implemented only by the obsolete `CallGraphSidecarManager.queryGraph()` and has no production caller, delete it rather than porting it.

### Types

Do not keep `call-graph.ts` merely as a type bag. Move or reuse the needed direction/node/edge/note/test-reference types in the existing search/call-graph response contract owner, avoiding duplicate near-identical families.

Prefer the existing `CallGraph*Result` types in `search-types.ts` when they already represent the product contract. Use aliases only when they reduce duplication and have a current caller; do not preserve old sidecar nomenclature as compatibility scaffolding.

### Intentional public response break

The current success envelope field:

```text
sidecar: { builtAt, nodeCount, edgeCount }
```

is misleading because those counts now describe the returned relationship-backed traversal. Rename it to truthful graph/traversal terminology. Do not include both old and new fields.

Update the `call_graph` tool description and any response builders/types/documented contract in scope. If the repository has a clean-break API migration/release-note location already used by the architecture plan, record the break there; do not invent a new documentation system.

### Snapshot boundary

Task 4A removes only the `callGraphSidecar` metadata and persistence operations from SnapshotManager. Task 8 still owns deleting SnapshotManager and its broader lifecycle database.

### Publication navigation boundary

All graph reads continue to use the Task 4 `publicationId + navigationRoot` address. Do not reintroduce collection/marker/navigation-generation lookup as graph identity.

### Language capabilities

Keep `callGraphBuild` and `callGraphQuery` language capability semantics unless a specific obsolete v3-only use is proven. Relationship extraction remains the producer for CALLS evidence.

## Success conditions

Task 4A is complete when all are true:

1. `packages/mcp/src/core/call-graph.ts` is deleted from production after its necessary types move/reuse.
2. `CallGraphSidecarManager`, `SupportedSourceDeltaPolicy`, v3 sidecar load/write/query, source recollection/building, and sidecar path ownership have zero production references.
3. Full index does not rebuild or preserve a separate call-graph sidecar after Core publishes the Publication.
4. Sync does not rebuild a separate call-graph sidecar after Core publishes changed-source relationship navigation.
5. `RelationshipBackedCallGraph.build()` remains the traversal implementation and no longer depends on `CallGraphSidecarManager` or SnapshotManager for duplicate graph persistence.
6. MCP config/snapshot/status state no longer contains `CallGraphSidecarInfo` / `callGraphSidecar` metadata.
7. Provider/shared runtime and handlers no longer construct/inject a call-graph manager.
8. `loadRegistryValidatedCallGraphSidecar` and equivalent stale names are renamed to relationship/navigation terminology while preserving the useful Publication relationship readiness check.
9. The public success envelope no longer exposes a field called `sidecar`; the replacement name truthfully describes the returned traversal/graph summary, with no old-field compatibility alias.
10. `call_graph` tool description and in-scope response/debug terminology match the new contract.
11. `call_graph` still traverses Publication-owned CALLS relationships and preserves current fallback/coverage/test-reference behavior.
12. `callGraphBuild` capability remains present and still participates in Core relationship construction eligibility.
13. Task 4 Publication-local navigation identity/addressing remains intact; no second persisted graph representation or selector is introduced.
14. Task 5 policy/completion-marker authority remains untouched except for incidental type imports that Task 4A genuinely invalidates.
15. SnapshotManager remains present for non-call-graph state; Task 8 is not started.
16. No legacy v3 call-graph file compatibility reader, migration, alias, or fallback is added. This is a clean break for derived local state.
17. Loading and saving an existing MCP v3 snapshot cannot preserve a retired `callGraphSidecar` property as an untyped/unknown field. SnapshotManager may remain for Task 8, but Task 4A must scrub this retired metadata from durable snapshot state rather than silently carrying it forward.

## Integration-review continuation finding

The first Task 4A completion pass removed every typed production owner and the duplicate graph lifecycle, but live integration review found one remaining durable-state defect in `packages/mcp/src/core/snapshot.ts`.

`isValidCodebaseInfoShape()` accepts additional unknown properties and `toCodebaseInfo()` returns the raw object unchanged. `mapFromV3Snapshot()` therefore retains a pre-Task-4A `callGraphSidecar` property in `codebaseInfoMap`, while `mapToCodebaseRecord()` and `saveCodebaseSnapshot()` write that same unknown property back to disk. The regular disk-merge path also reloads the unsanitized object before every save.

Direct reproduction against the live candidate:

```text
existing v3 snapshot entry contains callGraphSidecar
  -> SnapshotManager.loadCodebaseSnapshot()
  -> SnapshotManager.saveCodebaseSnapshot(true)
  -> callGraphSidecar is still present in the saved v3 snapshot
```

Observed result:

```text
{"saved":true,"retained":true,"keys":["callGraphSidecar","indexStatus","indexedFiles","lastUpdated","status","totalChunks"]}
```

Fix only this ownership leak. The smallest acceptable design is to sanitize retired `callGraphSidecar` metadata at the snapshot decode/current-shape boundary (or an equivalently central boundary used by both initial load and disk merge) so it cannot enter current in-memory `CodebaseInfo` state and cannot be re-persisted. Do not restore the old type, validate it, migrate it, read its file, or add a compatibility path. The old metadata is derived local state and should simply be discarded.

After the fix, rerun the same old-v3-snapshot load/save exercise and prove `callGraphSidecar` is absent from both the in-memory current entry and the rewritten snapshot. Preserve every already-accepted Task 4A deletion/traversal change.

## Required direct validation

Testing is not authorized. Do not create, modify, delete, or run tests. Do not run typecheck, build, broad package suites, or release checks.

After the candidate final state, run focused non-test evidence only:

1. Production search showing zero `CallGraphSidecarManager`, `SupportedSourceDeltaPolicy`, v3 sidecar path/load/write/query, `rebuildForIndex`, `rebuildForSyncDelta`, and `commitCallGraphSidecar` ownership.
2. Production search showing zero `CallGraphSidecarInfo` / `callGraphSidecar` config, SnapshotManager, full-index, status, or runtime ownership.
3. Focused full-index trace proving no duplicate call-graph rebuild occurs after Publication activation.
4. Focused sync trace proving no duplicate call-graph rebuild occurs after atomic Publication sync.
5. Focused call-graph request trace:
   prepared Publication navigation -> relationship-backed traversal -> public response.
6. Inspect Python fallback, inbound coverage evidence, test references, suppression notes, hints/warnings, and navigation attribution to ensure they still have live paths.
7. Production search proving `callGraphBuild` still exists in Core language capability / relationship construction code.
8. Production search proving the public traversal success envelope and tool description no longer use `sidecar` for the deleted v3 representation. If a local variable named `sidecar` remains for an unrelated concept, identify it and prove it is not the retired persisted graph.
9. Inspect `snapshot.ts` and runtime construction to prove SnapshotManager remains but call-graph sidecar metadata/manager wiring is gone.
10. `git diff --check`.
11. Output-based whitespace checks for the accepted untracked Core files.
12. Changed-test-file search remains zero.
13. Staged-file count remains zero.
14. One complete final diff inspection after the final production edit.
15. Direct old-snapshot scrub exercise: write/load a valid v3 snapshot entry containing a retired `callGraphSidecar`, save it with the current SnapshotManager, and prove the rewritten current snapshot no longer contains that property. This is a discard check, not a compatibility migration.

If Task 4A changes any intentionally frozen/public contract fixture, synchronize that fixture using the repository's existing non-test collector/check rather than restoring deleted aliases.

## Out of scope

- Do not start Task 5 policy/completion-marker authority deletion.
- Do not delete SnapshotManager or interrupted-index lifecycle state; Task 8 owns that.
- Do not collapse generation receipts/prepared reads; Task 7 owns that.
- Do not alter Publication storage/navigation/source contracts except where a direct Task-4A caller signature requires the existing address.
- Do not modify Core relationship extraction to remove `callGraphBuild`.
- Do not redesign source-backed Python fallback.
- Do not implement general response/API cleanup beyond terminology and types invalidated by deleting the v3 sidecar.
- Do not touch the Go `calls_v0` plan.
- Do not edit coordination files.
- Do not create worktrees, branches, commits, stashes, staging operations, resets, or history rewrites.

## Working style

Use Causal Coding and Ponytail principles. Trace the actual product call-graph request from tool/handler through prepared Publication navigation into `RelationshipBackedCallGraph.build()` before deleting machinery. Then remove the duplicate persisted owner and only the plumbing it made necessary.

Prefer deletion over adapters. Do not port obsolete `CallGraphSidecarManager` behavior merely because it exists. A production-unreachable method such as the manager's standalone v3 `queryGraph()` should disappear with the owner.

The checkout is intentionally dirty with accepted prior architecture work. Every production edit must be necessary for Task 4A or for synchronizing an invalidated direct contract.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. workspace, branch, HEAD, tracked aggregate, staged count, changed-test count, and confirmation of no Git history/worktree operations;
3. exact v3 sidecar owner/files/contracts deleted;
4. final call-graph request/traversal flow;
5. public response/type/terminology changes, including the old `sidecar` field replacement;
6. full-index and sync lifecycle changes;
7. SnapshotManager/config/runtime-manager cleanup performed while preserving Task 8 scope;
8. confirmation `callGraphBuild` relationship capability remains;
9. direct non-test validation actually run and results;
10. confirmation Tasks 0–4, Task 5+, Go, and coordination boundaries were preserved;
11. unresolved risks/blockers before Task 5.
