# Agent A — Core Candidate Construction Ownership (Second Mission)

**Repository:** `/home/hamza/repo/satori`
**Artifact type:** executable
**Workspace:** current checkout `/home/hamza/repo/satori`
**Isolation reason:** none; Wave 3 has one implementation writer and must build on the accepted uncommitted Agent A+B state
**Status:** complete / integration-reviewed on the live WSL tree
**Can start:** no — historical Task 2 mission; use `agent-a-publication-source-freshness.md` for the current wave
**Depends on:** Agent A / Task 0 and Agent B / Task 1 complete and verified in the current working tree
**Execution lifetime:** ordinary
**Wake strategy:** none
**Developer visibility:** headless

## Read first

- `docs/plans/SATORI_ARCHITECTURE_SIMPLIFICATION_CLEAN_BREAK_PLAN.md` — authoritative clean-break architecture and Task 2 requirements.
- `docs/superpowers/agent-plans/2026-08-20-architecture-simplification-clean-break/README.md` — current working-tree baseline, dependencies, and boundary corrections discovered after Tasks 0–1.
- `AGENTS.md` — repository ownership, scope, safety, and verification rules.
- Relevant current Core/MCP code for full indexing, source preparation, collection preparation, indexing-pipeline output, navigation candidate construction, and the new Task 1 PublicationStore/root mutation owner.

## Objective

Own **Task 2 only**: make Core own full candidate construction end to end so MCP stops constructing or transporting trusted prepared source/collection capabilities across the package boundary.

The desired boundary is simple:

```text
MCP lifecycle request / progress
        |
        v
Core root mutation operation
        |
        +--> capture source once
        +--> run indexing pipeline
        +--> build/finalize vector candidate
        +--> derive navigation candidate from the same captured evidence
        +--> perform the one Core source-consumption check
        +--> construct/activate the Task-2 Publication result
        |
        v
high-level build/publication status back to MCP
```

MCP should coordinate product lifecycle/status only. It must not prepare a `PreparedFileChangeSet`, prepare a collection capability, or independently prove that Core consumed the source it was handed.

## Current state

This is a continuation on top of HEAD `86393ae334adba8213ae33bec6cb9c353482577e`.

The accepted Task 0 + Task 1 baseline was 34 tracked files with 252 insertions / 2,289 deletions plus the two untracked Core owner files. The current Task 2 implementation has expanded the tracked working diff to **38 files, 723 insertions / 3,560 deletions** while preserving that accepted baseline.

Current live-tree facts:

- no test files are changed;
- `packages/core/src/generation/publication-store.ts` remains an accepted untracked Task 1 source file;
- `packages/core/src/generation/root-mutation-coordinator.ts` remains an accepted untracked Task 1 source file;
- the former MCP `mutation-lease.ts` owner is deleted;
- the only production `MutationLeaseCoordinator` implementation is Core-owned;
- `Context.indexCodebase()`, `Context.reindexByChange()`, and `Context.clearIndex()` still enforce the Core root writer fence;
- the Task 2 first pass removed the prepared source/collection capability transport from MCP full indexing, deleted `prepared-change-set-authority.ts`, moved actual collection/source candidate construction into Core, and added Task 2 Publication activation;
- `PublicationStore` is still not the normal read owner; Tasks 3–7 remain separate migrations;
- Task 0 forensic repair deletion remains intact.

Also present and out of scope:

- untracked `docs/plans/2026-08-20-go-calls-v0-promotion-plan.md`;
- untracked coordination files under this agent-plan directory.

Treat all existing tracked and untracked Task 0/1 implementation as accepted baseline state. Do not revert, stash, stage, commit, rename, rewrite, or replace it merely to simplify your diff.

### Rebaseline finding that corrects the original Task 2 file list

The source plan names the main Task 2 owners, but current WSL inspection shows the prepared capability also crosses these live production surfaces:

- `packages/core/src/core/index-mutation-port.ts`;
- `packages/mcp/src/core/handlers.ts`;
- `packages/core/src/core/published-surface.ts`;
- `packages/core/contracts/published-surface.json`.

Task 2 may remove the prepared-source/collection pieces from those files as required to complete the ownership migration. This is **not** authorization to do Task 9's broad port/public-surface cleanup.

Before the first Task 2 pass, production evidence showed MCP-owned `FileSynchronizer.prepareChanges()`, `assertCheckpointMatchesIndexedSources()`, prepared source/collection transport, and two process-local authenticity registries. The first pass removed those production boundary mechanisms. `PreparedFileChangeSet` intentionally remains inside Core synchronizer/incremental-sync implementation, while the stale published-surface fixture still needs synchronization.

Those were the initial Task 2 targets. The first pass removed most of them successfully, but the mission remains open.

### Integration review findings — resolve before declaring Task 2 complete

The second live WSL review confirmed that the earlier four continuation items are resolved: the public-surface fixture matches the collector, ordinary pre-activation legacy rollback is coherent, all-file source observations are lightweight again, and the required direct non-test checks were completed. Preserve those fixes.

One remaining **Major** durability defect must be fixed before Task 2 can be accepted:

1. **Separate pointer visibility from crash-durable activation.** In `PublicationStore.activate()`, `pointerReplaced` becomes true immediately after `renameSync(temporaryPointer, current.json)` and before `fsyncDirectory(publicationRoot)`. Therefore a parent-directory fsync failure is wrapped as `PublicationActivationError`. The full-index workflow currently catches every matching `PublicationActivationError`, logs it, sets `publicationStatus = 'activated'`, and returns normal success. That violates the authoritative plan's Task 1 invariant that a successful activation means the new publication state **and the parent directory containing the replaced current pointer have been fsynced**.

Preserve the important part of the current fix: once `current.json` has been renamed to the new publication, do not clean that generation as though it were definitely uncommitted and do not roll only the legacy selector backward. But do **not** convert a rename-without-confirmed-parent-fsync into ordinary success. Distinguish at least these states internally:

- failure before pointer rename: uncommitted candidate; existing rollback/cleanup path applies;
- failure after pointer rename but before parent-directory fsync is confirmed: pointer may be visible but crash durability is unconfirmed; retain selectors/generation coherently and surface a committed/visibility-preserving failure rather than returning normal activated success;
- failure only after the parent-directory fsync has completed: the activation is crash-durable and may be reconciled as committed even if a later acknowledgement/cleanup step fails.

Use the smallest internal contract necessary. Do not expose `PublicationStore` publicly, do not start Task 3/4/5, and do not add a compatibility layer. If preserving a visible-but-not-durably-confirmed rename requires an explicit high-level committed-error handoff to MCP so it does not delete the staged collection, make that boundary minimal and specific rather than swallowing the durability error.

Known stale tests are **not** part of this continuation. Tests still refer to deleted mutation/prepared contracts and old indexing-pipeline result shapes; do not change production behavior to satisfy them and do not modify/run tests in this mission.

## Ownership

You own:

- moving full-index source preparation inside the Core build operation;
- removing MCP transport of prepared source state and prepared collection capabilities;
- deleting process-local prepared-change-set authenticity/provenance machinery once its cross-owner boundary is gone;
- deleting prepared collection receipt authenticity/bookkeeping when no independent production caller remains;
- making collection preparation/population/finalization part of the Core full-index operation rather than a capability MCP must acquire and later return;
- removing MCP's duplicate full-index source-coverage assertion and leaving one Core source-consumption owner;
- using the same captured source/indexing-pipeline evidence for vector and navigation candidate construction instead of independent full-source proof rereads;
- consuming the Task 1 Core root lease and PublicationStore foundation for the Task 2 build/publication result;
- synchronizing only the Task-2-specific Core public-surface contract pieces invalidated by deleting the prepared capability.

Later missions own:

- Task 3 source checkpoint persistence/authority redesign;
- Task 4 moving navigation storage under the Publication generation, deleting its separate current pointer, and removing JSON/SQLite dual storage;
- Task 4A v3 MCP call-graph sidecar deletion;
- Task 5 policy/completion-marker authority collapse;
- Task 6 restore-transaction deletion;
- Task 7 normal read-path proof/receipt migration to Publication leases;
- Task 8 SnapshotManager deletion;
- Task 9 broad port/public-surface cleanup;
- Tasks 10–11 collection/GC and remaining compatibility cleanup.

## Coordination contract

Preserve all accepted Task 0/1 invariants:

- no repair lifecycle action or authority-salvage path;
- one Core-owned root writer fence for `create | reindex | sync | clear`;
- no production Core dependency on MCP;
- current-only PublicationStore with no legacy Publication reader;
- candidate durability before current-pointer reachability;
- atomic current read pinning and conservative destructive-GC eligibility.

For Task 2, **ownership replaces authenticity**. Do not replace the prepared `WeakSet` checks with a new token, brand, opaque wrapper, receipt, registry, hash, or capability system. Remove the cross-owner prepared object instead.

Likewise, do not preserve `PreparedIndexCollectionReceipt` merely under a renamed type if its only purpose was proving MCP had called collection preparation first. If collection preparation has one Core owner, use ordinary Core control flow.

The full-index source observation must have one owner. MCP may request indexing and receive progress/result information, but it must not construct a source checkpoint and then ask Core to prove it used that checkpoint.

Navigation construction in this mission should consume the same indexing/source evidence as vector construction. Do **not** perform Task 4's storage migration merely to achieve that: Task 4 still owns where navigation is persisted and how its current selector is removed.

Task 2 must use the new Publication foundation honestly. Do not encode false Publication metadata just to claim activation. If a Publication field would assert ownership of a resource that Task 3/4/5 still owns elsewhere, keep the Task 2 representation truthful and use only the minimum transitional publication result the source plan permits. If satisfying the Task 2 "activated publication" requirement would necessarily require a material Task 3/4/5 migration, stop expansion and report the exact contract blocker rather than inventing a compatibility adapter or silently absorbing later tasks.

Do not make `PublicationStore` public from the Core package merely because Task 2 uses it internally.

## Success conditions

- MCP production code no longer imports, constructs, stores, or passes `PreparedFileChangeSet` for full indexing.
- MCP production code no longer acquires/transports `PreparedIndexCollectionReceipt`, `PreparedIndexCollectionBinding`, `preparedCollectionReceipt`, or `preparedCollectionBinding` for full indexing.
- `packages/core/src/sync/prepared-change-set-authority.ts` is deleted when no production caller remains; no replacement authenticity registry/token is introduced.
- `IndexGenerationWorkflow` no longer uses a prepared collection receipt `WeakSet` or equivalent one-shot authenticity registry when collection preparation is Core-owned.
- `Context` / `IndexMutationPort` / MCP handler contracts no longer expose Task-2 prepared source/collection capability methods or option fields across the MCP/Core boundary.
- MCP `full-index-operation.ts` no longer calls `FileSynchronizer.prepareChanges()` for the full-index handoff and no longer owns `assertCheckpointMatchesIndexedSources()`.
- Core owns the remaining full-index source-consumption validation exactly once while the architecture is transitioning.
- Full-index vector and navigation candidates are produced from the same captured source/indexing-pipeline evidence; there is no second full-source reread solely to reconstruct trust for navigation.
- The captured-source representation does not retain every indexed file's full source text for the duration of the build when only hash/stat/path evidence is needed; semantic source text is retained only where a current consumer needs it.
- Task 2 constructs/returns the appropriate Core Publication/build result and consumes the Task 1 Core writer/PublicationStore contract without reintroducing MCP writer ownership.
- The transitional legacy-authority + PublicationStore activation path cannot report an ordinary failed/uncommitted result after one authority has already switched to the new generation while the other remains old.
- A normal successful Task 2 activation is reported only after `current.json`'s parent-directory fsync has succeeded; rename-visible but durability-unconfirmed activation is retained coherently but surfaced as a failure/committed-warning state rather than ordinary success.
- Task-2-specific public-surface entries for removed prepared capabilities are removed/synchronized; no compatibility alias is added.
- Task 0 repair deletion and Task 1 writer/publication foundation remain intact.
- Task 3+ authority/storage/read migrations are not started merely to make Task 2 look complete.
- The unrelated Go plan and coordination files remain untouched.

## Required validation

Do **not** create, modify, or run tests for this mission.

Do not run broad package/release suites. Do not use package typecheck as a completion gate because current test sources still reference intentionally deleted clean-break contracts from earlier waves.

Required direct non-test evidence:

1. focused production search showing MCP has zero full-index uses/imports of `PreparedFileChangeSet`, `PreparedIndexCollectionReceipt`, `PreparedIndexCollectionBinding`, `preparedChanges`, `preparedCollectionReceipt`, and `preparedCollectionBinding`;
2. focused production search showing prepared-change-set authenticity and prepared collection WeakSet authenticity machinery are gone when their callers are gone;
3. focused inspection showing MCP full indexing no longer calls `FileSynchronizer.prepareChanges()` or owns `assertCheckpointMatchesIndexedSources()`;
4. focused Core inspection tracing one source preparation/consumption path through vector and navigation candidate construction;
5. focused inspection of the Task 2 Publication/build handoff showing it uses the Core root lease/PublicationStore foundation without starting later authority migrations or adding a compatibility reader;
6. run the repository's existing non-test published-surface collector/comparison and show that `packages/core/contracts/published-surface.json` matches the current intended production surface;
7. inspect the full-index legacy-policy/navigation/checkpoint/PublicationStore activation ordering and show both: (a) pre-activation failure cannot leave the operation reported as uncommitted while selectors disagree, and (b) a failure after `current.json` rename but before parent-directory fsync cannot be converted into normal activated success;
8. inspect the final indexing-pipeline result shape and show that all-file source text is not retained unnecessarily while the single-read source identity is preserved;
9. `git diff --check`, plus an output-based whitespace check for accepted/new untracked Core source files that are still untracked;
10. one complete final diff inspection before reporting completion.

If an independently mandatory repository rule discovered during the mission explicitly requires another non-test check, run only that required check and report it.

## Out of scope

- Any test creation, modification, or execution.
- Task 3 source checkpoint format/ownership migration.
- Task 4 navigation current-pointer/storage/SQLite migration.
- Task 4A v3 call-graph sidecar deletion.
- Task 5 policy/completion-marker authority migration.
- Task 6 restore-journal deletion.
- Task 7 read-proof/readiness migration.
- Task 8 SnapshotManager deletion.
- Task 9 broad deletion of `IndexMutationPort` / `SourceFreshnessPort` or general Core barrel cleanup beyond Task-2-invalidated prepared capability fields.
- Task 10 collection naming/GC redesign.
- Task 11 general compatibility sweep.
- Go `calls_v0` work.
- New compatibility adapters or migrations for old local state.
- New worktrees, branches, commits, stashes, staging, or history rewrites.

## Working style

Use Causal Coding and Ponytail principles. Trace the real full-index transaction before editing. Prefer deletion and direct Core ownership over replacement receipts, token systems, wrappers, or new abstractions. Keep one source-consumption owner and the smallest complete Task 2 boundary change.

Use the current checkout. Preserve the accepted Task 0 + Task 1 working-tree state. Agent B is intentionally idle during this mission. If Agent B or another writer begins modifying the same checkout, or a required change would materially enter Task 3+, stop expansion and report the coordination conflict instead of silently widening scope.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. workspace, branch, HEAD, and whether any commits/staging/history operations occurred;
3. concise summary of how full candidate construction ownership moved into Core;
4. exact prepared source/collection contracts and authenticity machinery deleted or retained, with reasons;
5. summary of the resulting MCP/Core full-index boundary and Publication/build result;
6. required direct non-test validation actually performed;
7. exact changed/deleted interfaces the next mission must know;
8. confirmation that Task 0 repair deletion, Task 1 writer/publication foundation, the Go plan, and coordination files were preserved;
9. any unresolved risk or contract blocker that must be settled before Task 3/4.
