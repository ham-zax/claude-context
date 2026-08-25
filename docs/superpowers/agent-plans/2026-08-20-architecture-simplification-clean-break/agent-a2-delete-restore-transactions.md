# Agent A2 — Delete Multi-File Rollback / Restore Transactions

**Repository:** `/home/hamza/repo/satori`
**Artifact type:** executable
**Workspace:** current checkout `/home/hamza/repo/satori`
**Isolation reason:** none; one implementation writer in this checkout
**Can start:** immediately after Task 5 integration acceptance
**Depends on:** Tasks 0–5 complete and integration-reviewed in the current working tree
**Execution lifetime:** ordinary bounded coding mission
**Wake strategy:** none
**Developer visibility:** headless

## Read first

- `AGENTS.md` — repository rules and ownership discipline.
- `docs/plans/SATORI_ARCHITECTURE_SIMPLIFICATION_CLEAN_BREAK_PLAN.md` — authoritative source plan, especially Task 6.
- `docs/superpowers/agent-plans/2026-08-20-architecture-simplification-clean-break/README.md` — current dependency map, accepted contracts, and validation policy.
- Inspect the current Publication activation, clear, candidate-failure, teardown, and retention paths before editing. The live tree is authoritative if a path named below has moved.

## Objective

Own Task 6 only: remove the obsolete multi-file durable rollback/restore transaction architecture now that Task 5 made `PublicationStore.current.json` the only durable authority switch.

The intended failure model is simple:

```text
build Publication candidate privately
        |
        +-- failure before pointer swap --> discard unpublished candidate
        |                                  current Publication unchanged
        |
        v
PublicationStore.activate()
        |
        +-- pointer switched --> new Publication is authority

clear:
root mutation lease
        |
        v
PublicationStore.clearCurrent()
        |
        v
best-effort / retryable physical cleanup
(no authority restoration)
```

There must be no durable policy/navigation rollback snapshot, prepared/swapping/committed restore journal, tombstone transaction, or replay path whose purpose is to reconstruct authority across several files.

## Accepted baseline

Tasks 0–5 are accepted on:

```text
branch: integrate/language-spine-cbm-go
HEAD:   86393ae334adba8213ae33bec6cb9c353482577e
```

Task 5 integration acceptance observed:

```text
93 tracked files changed
3525 insertions
17438 deletions
staged files: 0
changed test files: 0
```

Accepted untracked Core owners remain:

```text
packages/core/src/generation/publication-store.ts
packages/core/src/generation/root-mutation-coordinator.ts
```

Preserve the accepted working tree. Do not revert, stash, stage, commit, reset, clean, rename, rewrite, or replace prior work.

A separate read-only verification session may inspect this same checkout concurrently. It is not an implementation writer and must not be treated as a write-coordination conflict.

## Current live ownership map

The source plan is authoritative. Current inspection adds these concrete facts that matter for a complete Task 6 clean break.

1. `packages/core/src/generation/restore-transaction.ts` still contains the old prepared/swapping/committed durable restore journal, digest verification, rollback-path naming, and replay machinery. It no longer has a live production runtime caller.

2. Remaining production reachability is type/public-contract residue:
   - `packages/core/src/core/context.ts` re-exports `DurableAuthorityMutationOwner`, `DurableAuthorityRecoveryPublisher`, and `DurableIndexAuthorityArtifact`;
   - `packages/core/src/generation/index-authority-contract.ts` still imports `DurableAuthorityRestoreTransactionMechanics` and exposes `DurableRestoreMechanicsPort` / `durableRestoreMechanics` despite no current runtime owner;
   - the published Core surface fixture still contains the three restore types.

   Delete this contract residue with the restore module. Do not preserve aliases or move the same transaction model elsewhere.

3. `PublicationStore.clearCurrent(root, lease)` already exists and durably removes the one `current.json` selector under the Core root mutation lease, but it currently has **zero production callers**.

4. `IndexTeardownWorkflow.clearIndex()` currently deletes the vector collection family first and only then clears process-local runtime state. It does not clear the Publication selector at all. This can physically remove the selected vector collection while `current.json` still points at the Publication if cleanup fails midway. Task 6 must make Publication authority clearing the first durable authority mutation under the mutation lease; later physical cleanup failure must not restore the pointer.

5. Failed full-index and atomic-sync candidates already avoid legacy policy/marker restoration. They currently clean staged navigation and vector collections, but Publication candidate staging can leave a generation directory containing `source.json` and/or other private candidate files. Task 6 owns the clean model: discard an unpublished candidate rather than restore old authority. Prefer one PublicationStore-owned candidate-generation discard boundary over scattered child cleanup when that is the smallest complete owner.

6. `PublicationStore` currently has no production API that deletes an unpublished/orphan Publication generation directory. Its `isGcEligible()` method is conservative runtime-GC logic and returns false unless single-runtime reader coordination is explicitly enabled. Do not weaken that runtime read-safety contract merely to satisfy startup cleanup.

7. The source plan explicitly requires startup pruning of private/orphan Publication generations that are not current and are not protected by an active lease/recovery rule. After Task 6 there is no restore-journal recovery rule. Implement this as Publication-owned cleanup with a clearly safe process-cold/current-selector boundary. Never delete the generation selected by `current.json`. Do not invent a second selector or migration format.

8. Current process-local staged/retention coordination in `IndexAuthorityCoordinator` tracks active staged Publication IDs and reader/retention gates. Task 7 later owns the broad read-lease migration; Task 10 later owns broader collection naming/GC simplification. Task 6 may use existing coordination where directly required, but do not absorb those later missions.

9. MCP `FullIndexOperation` still restores SnapshotManager lifecycle metadata for the previous complete generation after a rejected candidate. That is not durable index authority now. Preserve it only insofar as it truthfully mirrors the still-current Publication after a pre-activation failure. Do not delete SnapshotManager; Task 8 owns that. Remove only direct rollback-authority assumptions invalidated by Task 6.

## Ownership

You own:

- deletion of `packages/core/src/generation/restore-transaction.ts`;
- deletion of its remaining Core type/public-contract reachability;
- removal of obsolete durable-restore dependency declarations from generation authority contracts;
- PublicationStore-owned disposal of unpublished candidate generation directories when candidate construction fails before activation;
- safe startup cleanup of orphan/private Publication generation directories required by Task 6;
- clear-index authority ordering so `PublicationStore.clearCurrent()` is the one durable authority mutation before physical cleanup;
- direct Core/MCP caller adjustments required by that model;
- Task-6-specific published-surface synchronization caused by deleted public restore types;
- removal of direct rollback/restore terminology that would otherwise describe deleted authority behavior incorrectly.

Neighboring missions own:

- **Task 7:** broad `Proven*Receipt`, prepared-read cache/session, and Publication read-lease simplification;
- **Task 8:** SnapshotManager deletion and status reconstruction;
- **Task 9:** broad pass-through/public-surface cleanup unrelated to Task 6;
- **Task 10:** broader vector collection naming/retention/GC cleanup;
- **Task 11:** final obsolete-configuration cleanup and qualification.

Do not absorb those missions.

## Coordination contract

### Failure before activation preserves old authority

If full index or atomic changed-source sync fails before the Publication pointer swap, the previous `current.json` selection must remain byte-for-byte authoritative. Cleanup may remove only candidate-owned unpublished resources.

Do not restore old authority because it was never replaced.

### Candidate discard is Publication-owned

A staged Publication generation can contain more than navigation: `source.json`, navigation children, and eventually `publication.json` may exist before successful selection. Candidate cleanup must reason at the Publication generation boundary rather than assuming deleting only navigation is sufficient.

A candidate-discard operation must refuse to delete the currently selected Publication ID. It must run under the correct mutation ownership/fence or an equivalently safe owner boundary.

### Clear authority first

`clearIndex()` must perform exactly one durable authority mutation: clear the Publication selector under the root mutation lease.

Only after that succeeds should it delete vector collections and process-local/indexing state.

If physical cleanup later fails:

- current authority remains cleared;
- do not restore `current.json`;
- surface the cleanup failure normally so leftovers can be retried/cleaned later.

### Startup orphan cleanup

At process-cold startup / PublicationStore initialization or the smallest equivalent startup boundary, remove Publication generation directories that are provably private/orphaned and are not selected by `current.json`.

Do not weaken normal runtime reader/retention safety to do this. Do not use filename age heuristics, stale compatibility readers, or a restore journal.

If selector state cannot be safely interpreted, fail closed rather than guessing which generation is authoritative.

### No replacement transaction

Do not replace `restore-transaction.ts` with another journal, two-phase commit, tombstone protocol, compatibility wrapper, backup pointer, or multi-file rollback abstraction. The architecture simplification is the removal of that concept.

## Success conditions

Task 6 is complete when all are true:

1. `packages/core/src/generation/restore-transaction.ts` is deleted.
2. No production import/export/type/public-surface contract references the deleted `DurableAuthority*` / restore-mechanics family.
3. No prepared/swapping/committed authority restore journal parsing, digest verification, rollback-file naming, replay, or recovery path remains in production.
4. Full-index and atomic-sync failure before pointer swap leave the previous Publication current and discard unpublished candidate Publication resources instead of restoring authority.
5. Candidate generation cleanup is Publication-bound and cannot delete the ID selected by `current.json`.
6. `clearIndex()` clears `PublicationStore.current` under the Core root mutation lease before deleting physical vector resources.
7. Failure after clear authority but during physical cleanup does not restore the previous Publication selector.
8. Startup cleanup removes safe orphan/private Publication generation directories while preserving the selected Publication.
9. Existing `PublicationStore.activate()` `visible_unconfirmed` / `durable` semantics from Task 2 remain intact.
10. Task 3 source checkpoint semantics, Task 4 Publication-local navigation, Task 4A single relationship graph, and Task 5 Publication policy/format authority remain intact.
11. SnapshotManager remains for Task 8; the broad Task-7 read architecture and Task-10 vector retention redesign are not absorbed.
12. Core published surface no longer advertises deleted restore types if they were previously exported.

## Required direct non-test validation

Testing is not authorized. Do not create, modify, delete, or run tests. Do not run package typecheck, build, broad package suites, or release checks.

After the candidate final state, gather focused non-test evidence only:

1. Production search proving `restore-transaction.ts` and the `DurableAuthority*` / restore-mechanics contract family have zero production ownership.
2. Static full-index failure trace proving a pre-activation failure discards the unpublished candidate and does not mutate/restore the previous current selector.
3. Static atomic-sync failure trace with the same property.
4. Direct temporary-state PublicationStore exercise:
   - establish current Publication N;
   - create an unpublished candidate N+1 with staged Publication-owned state;
   - discard N+1;
   - prove `current.json` still selects N and N's generation remains;
   - prove candidate N+1 generation is removed.
5. Direct clear-order exercise using a temporary state root / narrow fake physical-cleanup port:
   - establish current Publication N;
   - invoke the real Task-6 clear path under a root mutation lease;
   - force physical collection cleanup to fail after authority clear;
   - prove `current.json` is absent/cleared and is not restored.
6. Direct startup-orphan cleanup exercise:
   - one selected current Publication;
   - at least one complete or partial orphan/private generation;
   - initialize/invoke the real startup cleanup boundary;
   - prove current survives and orphan/private generation directories are removed.
7. Production search proving `PublicationStore.clearCurrent()` now has the intended clear-path caller and no second durable authority mutation is performed by clear.
8. Verify no new rollback journal, backup pointer, tombstone transaction, or compatibility restore abstraction was introduced.
9. If Core public declarations change, run the existing non-test published-surface collector and synchronize `packages/core/contracts/published-surface.json`.
10. `git diff --check`.
11. Output-based trailing-whitespace/final-newline checks for accepted untracked Core owners.
12. Changed-test-file count remains zero.
13. Staged-file count remains zero.
14. Inspect the complete final production diff once after the final production edit.

## Integration continuation finding

The first Task 6 completion report is not yet accepted. Live integration review confirmed the Core architecture and direct filesystem exercises, but found one Major caller-contract defect in the MCP clear path.

`packages/mcp/src/core/manage-maintenance-handlers.ts` still handles `RemoteCollectionDeletePendingError` as though clear were transactional. After Task 6, `IndexTeardownWorkflow.clearIndex()` has already called `PublicationStore.clearCurrent()` before physical vector deletion can throw. The handler nevertheless returns:

```text
Remote deletion is still pending ... Local index state was not changed.
```

That statement is false under the new selector-first model. A direct non-test handler reproduction set the simulated authority-cleared state before throwing the real package `RemoteCollectionDeletePendingError`; the returned `manage_index clear` response still contained `Local index state was not changed.`

Close this seam without starting Task 8:

- make the remote-delete-pending clear response state truthfully that Publication authority is already cleared while physical backend cleanup remains pending/retryable;
- inspect the generic post-clear cleanup-error response in the same handler and ensure it does not imply that the authoritative clear was rolled back or never happened;
- preserve the existing ability to retry residual physical cleanup while SnapshotManager still exists for Task 8; do not redesign or delete SnapshotManager here;
- do not restore `current.json`, add a rollback transaction, or mark a failed physical cleanup as an authoritative Publication again.

Required direct non-test verification for this continuation: exercise `handleClearIndex()` with a post-selector `RemoteCollectionDeletePendingError` and prove the returned response describes cleared Publication authority plus pending physical cleanup; inspect the generic post-clear failure response for the same semantic truthfulness; rerun the Task 6 static/hygiene gates. Testing/typecheck/build remain unauthorized.

## Final integration acceptance

The continuation closed the remaining MCP contract defect. Live integration review confirmed that `handleClearIndex()` observes the existing `Removing index data...` phase only after `IndexTeardownWorkflow` has successfully cleared `PublicationStore.current`, and now distinguishes all three relevant failure states truthfully:

- post-selector remote deletion pending: Publication authority is already cleared, remote vector cleanup remains pending, and residual cleanup can be retried with `manage_index clear`;
- other post-selector cleanup failure: Publication authority is already cleared, physical/runtime cleanup failed, and residual cleanup can be retried;
- pre-selector failure: the response does not claim Publication authority was removed.

Direct handler reproductions confirmed both post-clear failure branches retain SnapshotManager retry bookkeeping without calling `markCodebaseCleared()`. The restore/journal contract family remains absent, candidate discard and selector-first clear remain intact, startup cleanup remains conservative, the published Core surface matches, `git diff --check` is clean, accepted Core whitespace checks pass, and staged/test changes remain zero. Task 6 is complete / verified and Task 7 is the next frontier.

## Out of scope

- Do not start Task 7's broad Publication read-lease / receipt / prepared-cache migration.
- Do not delete or redesign SnapshotManager; Task 8 owns that.
- Do not perform Task 9 broad API/pass-through cleanup beyond declarations directly invalidated by Task 6.
- Do not redesign vector collection naming or general retention/GC; Task 10 owns that.
- Do not touch the Go `calls_v0` plan.
- Do not edit coordination files.
- Do not create worktrees, branches, commits, stashes, staging operations, resets, cleans, or history rewrites.

## Working style

Use Causal Coding and Ponytail principles. Trace the real current-selector and candidate lifecycle before deleting machinery. Prefer extending the existing `PublicationStore` / `IndexTeardownWorkflow` ownership boundaries over creating a new cleanup coordinator.

The key simplification is deletion: old authority remains valid until the one pointer switch, so pre-activation failure needs cleanup, not rollback.

Do not keep dead restore types or journal schemas merely because stale tests or `dist` declarations still refer to them. Testing remains deferred and stale generated declarations are not source authority.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. workspace, branch, HEAD, tracked aggregate, staged count, changed-test count, and confirmation of no Git history/worktree operations;
3. restore/journal module and public contract deletion summary;
4. unpublished candidate discard owner and failure ordering for full index + atomic sync;
5. clear-index authority ordering and post-clear physical-cleanup failure semantics;
6. startup orphan/private Publication generation cleanup behavior and safety rule;
7. any direct MCP lifecycle adjustments made without starting Task 8;
8. published-surface changes, if any;
9. direct non-test validation actually performed and observed results;
10. confirmation Tasks 0–5 and Task 7+ boundaries were preserved;
11. unresolved risks/blockers before Task 7.
