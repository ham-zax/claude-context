# Agent A — Publication-Owned Source Freshness (Third Mission)

**Repository:** `/home/hamza/repo/satori`
**Artifact type:** executable
**Workspace:** current checkout `/home/hamza/repo/satori`
**Isolation reason:** none; Wave 4 has one implementation writer and must build on the accepted uncommitted Task 0–2 state
**Can start:** immediately — continuation after the second Task 3 integration review
**Depends on:** Task 0, Task 1, and Task 2 complete and integration-reviewed in the current working tree
**Execution lifetime:** ordinary
**Wake strategy:** none
**Developer visibility:** headless

## Read first

- `docs/plans/SATORI_ARCHITECTURE_SIMPLIFICATION_CLEAN_BREAK_PLAN.md` — authoritative clean-break architecture and Task 3 requirements.
- `docs/superpowers/agent-plans/2026-08-20-architecture-simplification-clean-break/README.md` — current working-tree baseline and integration findings.
- `AGENTS.md` — repository ownership, scope, safety, and verification rules.
- Current source-freshness, synchronizer, incremental-sync, PublicationStore, and Task 2 candidate-construction code before editing.

## Objective

Own **Task 3 only**: make source freshness an immutable child of a Publication.

The target ownership is:

```text
Publication <id>
  publication.json
  source.json      <- one current-format source checkpoint for that publication
```

`source.json` is addressed by publication ID and generation directory. It is not authenticated by collection name, completion-marker run ID, policy hash, Merkle root, or a separate checkpoint document digest.

The live working tree already has a current-only `PublicationStore`, a Core root writer lease, and Core-owned full-index candidate construction. Extend that foundation just enough for source freshness; do not start navigation, policy/marker, read-lease, SnapshotManager, or collection-GC migrations.

## Accepted baseline

Integration review accepted Tasks 0–2 on HEAD `86393ae334adba8213ae33bec6cb9c353482577e`.

Current production working-tree aggregate before Task 3:

- 38 tracked files changed;
- 742 insertions / 3,561 deletions;
- untracked `packages/core/src/generation/publication-store.ts`;
- untracked `packages/core/src/generation/root-mutation-coordinator.ts`;
- no changed test files;
- `git diff --check` clean;
- Core published-surface collector matches `packages/core/contracts/published-surface.json`;
- full-index prepared source/collection capabilities no longer cross MCP/Core;
- Task 2 `PublicationStore.activate()` distinguishes `visible_unconfirmed` from crash-durable activation and never reports parent-directory-fsync failure as ordinary activated success.

Preserve all of that state. Do not revert, stash, stage, commit, rename, rewrite, or replace prior work.

The unrelated untracked Go plan and this coordination package are out of scope.

The current Task 3 candidate is accepted in place as the continuation starting point. The live second-pass candidate has 43 tracked files changed with 1,427 insertions / 6,133 deletions. It already includes Publication-owned `source.json`, explicit partial coverage, process-local full-hash cadence, atomic-sync PublicationStore activation, dead non-atomic-path deletion, published-surface synchronization, and final selection-control revalidation. Preserve that work; fix the remaining runtime-cache finding below rather than restarting the migration.

### Historical integration findings from the first Task 3 review — resolved in the second pass

1. **Fix partial Publication source coverage, not only the immediate assertion.** In the `limit_reached` full-index path, `source.json` is built from `result.sourceFiles`, which contains the source observations consumed before the chunk limit stopped indexing. `PreparedFileChangeSet.assertSourceObservationCurrent()` then scans the full selected tree and treats already-known unprocessed files as additions. Use a bounded final validation or another explicit partial-coverage model so the captured/consumed files must still match, while known unprocessed files do not invalidate the candidate merely because the Publication is intentionally partial. Ensure later source-freshness comparison for a partial Publication does not accidentally reinterpret the same known coverage gap as post-publication source drift.
2. **Separate operational full-hash cadence from immutable source authority.** The new `PublicationSourceCheckpoint` currently persists `fullHashCounter`. `performReindexByChange()` intentionally avoids a new Publication on a no-op source scan and no longer commits a new durable checkpoint in that branch. Because each later sync reconstructs `FileSynchronizer` from the unchanged `source.json`, the counter can stay frozen and `SATORI_SYNC_FULL_HASH_EVERY_N` can stop reaching its configured interval. Do not mint Publications solely to bump an optimization counter. Prefer removing the counter from immutable source authority and keeping any every-N cadence as runtime/scan state, or another equally small design that preserves the configured behavior without making it publication identity.
3. **Delete the dead non-atomic changed-source implementation.** After the atomic-candidate checks, `performReindexByChange()` now executes `throw new AtomicIncrementalPublicationUnsupportedError();`, but the former in-place mutation path remains immediately afterward and is unreachable. Delete that obsolete branch in this clean-break wave. Do not keep it as fallback or compatibility scaffolding.
4. **Update the frozen Core surface to the actual Task 3 contract.** Current `collectPublishedSurface()` differs from `packages/core/contracts/published-surface.json`: the fixture still lists the deleted source-checkpoint authority/error types and the old three-argument `Context.inspectSourceFreshnessCheckpoint` signature. Synchronize the fixture to production; do not restore deleted aliases or types to satisfy it.
5. **Run the complete Task 3 validation after the final edits.** Re-run the old-authority/V2/V3 searches, trace both full index and atomic changed-source sync into the matching `source.json` + `PublicationStore.activate()`, inspect `visible_unconfirmed`, and prove selection-policy admission remains fail-closed. A control-file change during sync must not become a served stale-selection Publication; if the existing read-admission compatibility gate is the protection, identify that path explicitly. Only add a final control-signature check if the existing gate is insufficient.

The second Task 3 pass resolved items 1–5 above.

### Current integration finding — resolve before declaring Task 3 complete

6. **Keep process-local synchronizer state reusable across metadata-only no-op observations of the same Publication.** `source.json` correctly no longer persists `fullHashCounter`, and no-op sync correctly commits process-local state. But the reuse gate in `performReindexByChange()` calls `registeredSynchronizer.matchesSourceCheckpoint(currentPublicationSource.checkpoint)`, and `matchesSourceCheckpoint()` currently compares the full source checkpoint including immutable `fileStats`. If bytes are unchanged but mtime/ctime changes, the no-op scan hashes the file and commits refreshed runtime stats. The current Publication and immutable `source.json` correctly stay unchanged, but the registered synchronizer then fails exact checkpoint equality. The next sync reconstructs a new synchronizer from the old Publication stats, losing both the refreshed metadata cache and `fullHashCounter`. This repeats indefinitely: with `SATORI_SYNC_FULL_HASH_EVERY_N=3`, one metadata-only change followed by four sync checks reproduced `fullHashRun=false` on all four checks, with the same file rehashed each time. Fix the runtime ownership model so a synchronizer remains reusable while it is still bound to the same active Publication even when its live stat/cache state has advanced beyond immutable checkpoint metadata. Do not merely ignore `fileStats` in a way that can accidentally reuse runtime state across a different Publication or selection policy with coincidentally equal source hashes; keep an explicit current-Publication/policy ownership boundary or an equivalently strong condition.

## Replan findings from the live tree

The source plan's Task 3 file list is incomplete relative to the current implementation. Task 3 may also touch these files only where source-freshness/publication ownership requires it:

- `packages/core/src/sync/source-freshness-port.ts`;
- `packages/core/src/core/context.ts`;
- `packages/core/src/generation/publication-store.ts`;
- `packages/core/src/generation/contracts.ts` if the current Publication/source contract genuinely requires a type change;
- `packages/core/src/core/published-surface.ts` and `packages/core/contracts/published-surface.json` for Task-3-invalidated public source-freshness declarations.

This is not authorization for Task 7 or Task 9 broad port/public-surface cleanup.

### Critical live-tree boundary: incremental sync does not yet advance PublicationStore

Full indexing now activates `PublicationStore`, but incremental sync still publishes through the legacy policy/navigation/checkpoint authority and does **not** call `PublicationStore.activate()`.

That is a Task 3 blocker if left unchanged: after sync, the legacy generation can be N+1 while `PublicationStore.current` still points at N, so a `source.json` owned by "the current Publication" would be false.

Task 3 must therefore move the **incremental-sync publication transition** onto the existing PublicationStore activation boundary far enough that every successfully published source checkpoint belongs to the Publication that becomes current.

Use the existing Core root mutation lease as the publication operation identity. Do not create a second independent source-publication authority. Preserve Task 2's activation durability distinction and transitional legacy rollback/reconciliation while legacy policy/navigation owners still exist.

This is not Task 4 or Task 5: navigation may remain legacy-owned and the Publication descriptor may continue to use `navigation: null`; policy/completion-marker authority may remain transitional. The required change is that source checkpoint ownership and current Publication identity agree for both full index and incremental sync.

## Current source-freshness machinery to remove or simplify

Current production code still carries source-checkpoint authority through:

- `checkpointIdentity` / collection name;
- `SourceFreshnessCheckpointAuthority.collectionName`;
- `markerRunId`;
- `indexPolicyHash`;
- snapshot V2/V3 shapes;
- `documentDigest` authenticity;
- Merkle root as authority;
- MCP full-index/source-handoff barriers that structurally join marker/policy/generation receipt fields;
- SourceFreshnessPort options/evidence whose source-checkpoint validity depends on those old authority fields.

Task 3 should replace these with one current source checkpoint format located by Publication ID.

Do not preserve V2/V3 checkpoint readers, migration code, aliases, or collection-named fallback paths merely for old local state. This project has an explicit clean-break decision; unsupported derived local state is reindexed.

An aggregate source digest may remain only if it is a useful equality optimization. It must not be required to authenticate the publication or checkpoint.

## Source checkpoint content and ownership

Keep the source checkpoint small and deterministic. It needs the data required for current source-drift comparison, such as:

- canonical publication/root identity only where needed for parse/path safety;
- selected repository-relative paths;
- exact source hashes;
- stable stat signatures used by the metadata/hash scan optimization;
- a current format/version if useful for parse rejection.

Do not copy policy authority, marker identity, collection identity, navigation authority, or proof receipts into `source.json`.

`source.json` must be staged inside the candidate publication generation **before** `PublicationStore.activate()` makes that publication ID current. The existing activation fsync tree must therefore cover it. A candidate that never activates may leave an orphaned immutable source checkpoint; it must not become current authority.

Prefer a narrow internal PublicationStore/source-checkpoint contract over a generic publication-resource framework. PublicationStore remains internal to Core.

## Full index and incremental sync

Both paths must converge on the same source ownership model:

### Full index

- Reuse Task 2's exact path/hash/stat observations from the indexing pipeline.
- Build `source.json` from those observations without rereading the full source tree solely to establish checkpoint authenticity.
- Perform the existing final live-source drift check before activation.
- Stage `source.json` under the candidate publication ID and activate once.

### Incremental sync

- Read the active Publication's `source.json` as the baseline.
- Compute the live source change set using the existing stable-read and metadata/hash scan optimizations.
- Build the next source checkpoint from the resulting source state.
- Publish the next vector/navigation transitional generation as currently required, but make the same successful operation activate a new Publication whose `source.json` is the source owner.
- Do not mutate the old Publication's source checkpoint in place.
- A no-op sync may avoid creating a new Publication if the active Publication/source state truly remains identical and no other publication-bearing state changes; do not mint generations by ritual.

Do not use collection name or completion-marker identity as the source checkpoint path after this migration.

## Source drift versus selection-policy drift

Preserve the clean-break safety distinction:

- **ordinary source drift:** Publication N remains internally valid and may remain readable by a pinned reader while the working tree has changed;
- **selection-policy drift:** if current ignore/profile/custom-selection controls could exclude files that Publication N contains, new read admission must remain fail-closed until the active Publication represents the new policy or an equivalent current exclusion gate is proven.

Task 3 may use the active Publication's captured policy/control signature and the existing live policy-input observation to maintain this gate. Do not encode policy authority back into `source.json`.

Do not weaken selection-policy admission merely because source freshness is simpler.

## MCP/Core boundary

MCP may ask Core for a live-source observation and may retain compact lifecycle/watcher state, but it must not authenticate `source.json` by rebuilding the old marker/policy/collection proof chain.

Replace full-index handoff logic that compares `candidatePolicyHash`, `markerRunId`, collection identity, and generation receipts for source ownership with a compact Publication/source observation join.

Do **not** perform Task 7's broad read-receipt collapse. If a current read caller still needs a vector/generation receipt until Task 7, keep only the transitional binding genuinely required by that caller. `source.json` validity itself must depend on Publication ID/path + parse/schema/path safety, not on the receipt.

## Coordination contract

Preserve:

- no forensic repair or salvage path;
- one Core-owned root writer fence;
- no Core dependency on MCP;
- current-only Publication formats; no legacy Publication reader;
- Task 2 full candidate construction ownership;
- Task 2 activation durability semantics, including `visible_unconfirmed` failure behavior;
- configured periodic full-hash behavior remains meaningful without making an operational scan counter part of immutable Publication identity, including after metadata-only no-op observations that refresh runtime stat signatures;
- partial Publication source coverage has explicit semantics and does not mistake known unprocessed paths for source drift;
- no normal read-path migration to Publication leases yet;
- no navigation storage/current-pointer migration yet;
- no policy/completion-marker authority migration yet.

Do not add compatibility adapters, proof receipts, capability registries, or another mutable source-current pointer.

## Success conditions

Task 3 is complete when all of these are true:

- every authoritative current-format source checkpoint is `generations/<publicationId>/source.json` under the Publication root;
- source checkpoint ownership is derivable from Publication root + Publication ID alone;
- production source checkpoint validity no longer depends on collection name, marker run ID, policy hash, document digest, or Merkle root authority;
- current source checkpoint code has no V2/V3 compatibility reader/migration path for old local derived state;
- full indexing stages the exact consumed source observations into candidate `source.json` before Publication activation;
- incremental sync reads the active Publication's source checkpoint and, when it publishes changed state, activates the corresponding next Publication rather than leaving PublicationStore behind the legacy generation;
- the old Publication/source checkpoint remains immutable after N+1 activation;
- ordinary working-tree source drift does not make a pinned Publication internally invalid;
- selection-policy drift remains a separate fail-closed new-read admission gate;
- MCP no longer authenticates source freshness with the old marker/policy/collection structural handoff chain;
- SourceFreshnessPort and any Task-3-specific public declarations reflect the new source model without performing broad Task 7/9 cleanup;
- the obsolete non-atomic changed-source implementation is deleted once the atomic-only failure boundary makes it unreachable;
- no-op source checks do not silently disable `SATORI_SYNC_FULL_HASH_EVERY_N`, and `source.json` contains source authority rather than mutable scan-cadence bookkeeping;
- partial Publication validation and later freshness checks distinguish intentionally unprocessed coverage from actual post-capture changes;
- Task 4+ work is not started.

## Required direct validation

Do **not** create, modify, or run tests for this mission.

Do not run package typecheck, build, broad package suites, or release checks.

Before reporting complete, provide direct non-test evidence for:

1. production search showing source checkpoint authority no longer uses `markerRunId`, `indexPolicyHash`, collection-name `checkpointIdentity`, or `documentDigest` as checkpoint authenticity/ownership fields;
2. production search/inspection showing no V2/V3 source-checkpoint compatibility reader or migration path remains for current source authority;
3. full-index trace: Task 2 source observations -> candidate `source.json` -> final drift check -> Publication activation;
4. incremental-sync trace: active Publication/source checkpoint -> change set -> next `source.json` -> next Publication activation;
5. inspection that the sync path cannot successfully switch legacy source-bearing generation state while leaving `PublicationStore.current` on the previous publication;
6. inspection that a `visible_unconfirmed` Publication activation failure preserves the same non-cleanup/non-normal-success semantics after Task 3;
7. inspection that ordinary source drift remains distinct from selection-policy drift and the selection-policy fail-closed gate remains active;
8. published-surface collector comparison if Task 3 changes the exported source-freshness surface;
9. focused inspection showing no-op sync preserves the configured periodic full-hash semantics without minting Publications merely to advance an operational counter;
10. direct metadata-only no-op reproduction showing the same active Publication keeps its process-local synchronizer/cache and the every-N counter continues to advance rather than resetting on every subsequent sync;
11. focused inspection showing the non-atomic changed-source path has one explicit unsupported outcome and no unreachable legacy mutation implementation remains after it;
12. `git diff --check` and output-based whitespace checks for accepted/new untracked Core source files;
13. one complete final diff inspection.

If a required old authority term remains for a later navigation/policy/read task, identify the exact surviving owner and show it is not used to authenticate the new `source.json` checkpoint rather than deleting unrelated later-task code.

## Out of scope

- Test creation, modification, or execution.
- Task 4 navigation-in-Publication storage, navigation pointer removal, SQLite deletion.
- Task 4A v3 MCP call-graph sidecar deletion.
- Task 5 policy/completion-marker authority migration.
- Task 6 restore-transaction deletion.
- Task 7 broad proof/read-preparation migration to Publication leases.
- Task 8 SnapshotManager deletion.
- Task 9 broad port/public-surface cleanup.
- Task 10 collection-family/GC redesign beyond what is strictly required to identify the candidate Publication.
- Task 11 general compatibility sweep outside the source-checkpoint format being replaced here.
- Go `calls_v0` work.
- New branches, worktrees, commits, stashes, staging, or history rewrites.

## Working style

Use Causal Coding and Ponytail principles. Find the actual source checkpoint owner first, then delete redundant authority rather than translating it into new proof structures. Prefer one current `source.json` format and direct Publication ownership.

Use the current checkout. Agent B is intentionally idle during this wave. If another implementation writer starts modifying the same checkout, stop and report the conflict.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. workspace, branch, HEAD, and whether any commits/staging/history operations occurred;
3. exact new `source.json` ownership/layout and current-format contract;
4. old source-checkpoint authority/version/proof machinery deleted or retained, with reasons;
5. full-index source publication flow;
6. incremental-sync source publication flow, including how PublicationStore advances;
7. selection-policy drift behavior after the migration;
8. SourceFreshnessPort/MCP boundary changes;
9. required direct non-test validation actually performed;
10. confirmation Tasks 0–2, Go plan, and coordination files were preserved;
11. unresolved risks or blockers before Task 4.