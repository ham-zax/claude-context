# Agent A — Publication-Owned Navigation and Single JSON Store

**Repository:** `/home/hamza/repo/satori`
**Artifact type:** executable
**Workspace:** current checkout `/home/hamza/repo/satori`
**Isolation reason:** none; Wave 5 has one implementation writer and must build on the accepted uncommitted Task 0–3 state
**Can start:** immediately
**Depends on:** Tasks 0, 1, 2, and 3 complete and integration-reviewed in the current working tree
**Execution lifetime:** ordinary
**Wake strategy:** none
**Developer visibility:** headless

## Read first

- `docs/plans/SATORI_ARCHITECTURE_SIMPLIFICATION_CLEAN_BREAK_PLAN.md` — authoritative architecture plan, especially Task 4.
- `docs/superpowers/agent-plans/2026-08-20-architecture-simplification-clean-break/README.md` — current dependency map, accepted contracts, and live-tree findings.
- `AGENTS.md` — repository instructions.
- Inspect the current navigation build/read/storage paths, `PublicationStore`, `IndexGenerationWorkflow`, `IndexAuthorityCoordinator`, and MCP navigation consumers before editing.

## Objective

Own Task 4 only: make navigation an immutable child of the same Publication generation that owns vector identity and `source.json`, and reduce persisted navigation to one JSON representation.

Target layout:

```text
<stateRoot>/publications/<rootKey>/
  current.json
  generations/<publicationId>/
    publication.json
    source.json
    navigation/
      ... immutable JSON navigation files ...
```

The Publication ID is the navigation resource identity. `PublicationStore.current.json` is the only current selector. Navigation must no longer have its own current pointer, independent generation identity, seal authority, SQLite shadow, or backend-selection runtime.

## Accepted current state

Tasks 0–3 are accepted in place on HEAD `86393ae334adba8213ae33bec6cb9c353482577e`.

Current tracked production aggregate at the Task 3 integration gate:

```text
43 files changed, 1523 insertions(+), 6142 deletions(-)
```

Accepted untracked Core owners remain:

```text
packages/core/src/generation/publication-store.ts
packages/core/src/generation/root-mutation-coordinator.ts
```

Preserve all current Task 0–3 work. Do not revert, stash, stage, commit, rename, rewrite, or replace the accepted working state.

Task 3 now guarantees:

- `source.json` is Publication-owned and current-format only;
- full index and changed-source atomic sync advance `PublicationStore`;
- selection-policy drift remains a separate fail-closed read-admission boundary;
- `PublicationStore.activate()` preserves `visible_unconfirmed` versus crash-durable activation;
- process-local synchronizer state is bound to exact active Publication ID, not immutable stat equality.

Do not weaken those contracts while moving navigation.

## Live Task 4 ownership map

The source plan's Task 4 file list is incomplete relative to the current implementation. Rediscover the exact callers before editing, but the live tree currently has these important seams:

1. `IndexGenerationWorkflow` builds navigation with `stageNavigationSidecarGeneration()`. That builder writes under the separate navigation sidecar root and invents a random navigation `generationId`.
2. `Context.publishNavigationCandidate()` separately swaps navigation `current.json`, imports `navigation.sqlite`, and prunes sidecar generations after publication.
3. `PublicationStore` already accepts `Publication.navigation = { relativeRoot: 'navigation' }` and verifies that directory during activation, but it does not yet own navigation staging/addressing.
4. Full-index and atomic-sync Publication descriptors still use the Task 2 transitional navigation shape rather than making the built navigation directory the Publication child.
5. `sidecar-reads.ts`, `sidecar-lifecycle.ts`, `Context`, `IndexAuthorityCoordinator`, and other callers can still resolve `resolveCurrentNavigationGeneration()` from a separate navigation pointer.
6. Navigation read compatibility still uses `seal.json`, `navigationSealHash`, `artifactSetHash`, manifest/shard hash chains, and pointer cross-checks as authority.
7. `navigation/runtime.ts` selects JSON versus SQLite and dual-read parity through `SATORI_NAVIGATION_BACKEND` / `SATORI_NAVIGATION_DUAL_READ`; `navigation/sqlite.ts` persists the additive SQLite shadow.
8. `navigation/query.ts` defaults through `createRuntimeNavigationStore()` and the multi-implementation `NavigationStore` interface.
9. MCP constructs/injects that runtime navigation store, and several MCP/Core readers still carry navigation generation/seal identity in receipts, readiness, prepared-read state, maintenance/status, or query plumbing.
10. Durable authority capture/restore still includes the separate navigation pointer. Task 4 must remove navigation-pointer restoration rather than translating that pointer into the Publication model; Task 6 still owns deleting the broader restore transaction.
11. `ContextConfig.symbolRegistryStateRoot` is currently a navigation-only storage-root override in production. If Task 4 leaves no real owner for it, delete that dead configuration surface rather than retaining an alias.
12. Task 4A's v3 call-graph sidecar remains separate work. Some Task 4 plumbing may touch files that Task 4A will later simplify, but do not delete or redesign the v3 call-graph sidecar in this mission.
13. `IndexAuthorityCoordinator.schedulePublicationRetention()` still prunes independent navigation generations through `pruneNavigationSidecarGenerations()` while separately retaining vector collections. Once navigation is a child of Publication N, navigation must not be collected independently from N: a pinned/addressable old Publication must retain its own navigation tree. Remove the navigation-generation inputs/pruning from this retention path. Keep the remaining vector-retention machinery in place for later Task 10 cleanup; do not broaden Task 4 into Publication GC.

## Ownership

You own the Task 4 navigation storage/authority migration end to end:

- navigation candidate placement under the candidate Publication generation;
- Publication descriptor navigation binding for complete Publications and `navigation: null` for partial Publications;
- full-index and atomic-sync navigation staging/activation ordering;
- Core JSON navigation reads addressed by Publication identity / Publication generation path;
- removal of the independent navigation current pointer and its restoration/rollback role;
- removal of navigation seal/artifact-set authority and repeated read-time shard SHA proof chains;
- removal of the SQLite navigation shadow and runtime backend/dual-read selection;
- simplification from multi-store `NavigationStore` abstraction to the one real JSON reader/query path;
- the Task-4-specific contract changes required in current receipts/readiness/MCP plumbing so they no longer treat an independent navigation generation/seal as authority;
- Task-4-specific public-surface fixture updates.

Neighboring missions own:

- **Task 4A:** deleting the duplicate MCP v3 call-graph sidecar and renaming public call-graph sidecar terminology;
- **Task 5:** deleting policy document/completion-marker authority itself;
- **Task 6:** deleting the remaining multi-file durable restore transaction;
- **Task 7:** broad replacement of proof receipts/read-preparation machinery with Publication leases;
- **Task 8+:** SnapshotManager/status and later surface/GC cleanup.

## Coordination contract

### One navigation identity

Do not preserve a second random navigation-generation identity merely because current sidecar APIs use one. The immutable navigation resource belongs to `<publicationId>/navigation`. If a helper needs an address, use the Publication ID / generation directory, not a separately generated selector or authority token.

### One current selector

After Task 4, activating Publication N+1 must not mutate a navigation `current.json`. The only selector change is PublicationStore's durable `current.json` swap.

Any transitional marker/policy fields that survive until Task 5 may contain navigation-derived descriptive data only where a current caller genuinely needs it; they must not select or authenticate navigation. Do not synthesize fake seal hashes or compatibility aliases to keep old proof shapes alive.

### Publication-bound reads

Navigation reads must address the Publication resource explicitly. Do not silently call `resolveCurrentNavigationGeneration()` as a fallback. Task 7 still owns broad read-lease migration, so use the smallest current Publication identity already available at each caller rather than absorbing the whole read architecture.

If an existing proof/receipt type must survive until Task 7, shrink its navigation component to Publication-bound information needed by current callers. Do not preserve independent generation/seal authenticity just because the receipt exists.

### Integrity versus authority

Keep parse/schema/path safety and stable-read checks that prevent unsafe filesystem use. Corrupt or malformed local navigation should become unavailable / require rebuild or reindex according to the existing product flow.

Remove navigation `seal.json` as publication authority, `navigationSealHash`, `artifactSetHash`, and repeated read-time shard SHA cross-proof unless a concrete non-authority storage check remains necessary. Manifest hashes or deterministic file hashes may remain only where they are useful data-format/cache/reuse metadata; they must not act as a second current/publication authority.

### Hard-link reuse

Preserve useful hard-link reuse for unchanged immutable JSON shards if it still simplifies incremental publication. Reuse must source from the previous Publication's navigation tree and produce files inside the new Publication's navigation tree. A reuse optimization must not require a second navigation pointer or generation authority.

If reuse cannot be established safely, fall back to rebuilding the JSON navigation candidate rather than creating compatibility machinery.

### Publication-level retention

Do not independently prune navigation after activation. Navigation lifetime is the lifetime of its owning Publication generation: Publication N's `navigation/` remains present while Publication N remains addressable/pinned. Task 4 should remove navigation-generation pruning/retention arguments from `IndexAuthorityCoordinator.schedulePublicationRetention()` and any equivalent navigation-only cleanup path. Preserve unrelated vector-retention behavior for now; Task 10 owns Publication/vector GC and may later collapse that remaining machinery.

### One persisted representation

Delete the additive SQLite navigation path:

- `packages/core/src/navigation/sqlite.ts` production implementation;
- `packages/core/src/navigation/runtime.ts` production backend/dual-read layer;
- SQLite import/rebuild/parity/cleanup calls;
- `SATORI_NAVIGATION_BACKEND` and `SATORI_NAVIGATION_DUAL_READ` production/runtime-identity inputs;
- runtime primary/fallback/candidate store aliases that exist only for the retired dual-store experiment.

Keep one JSON-backed navigation query implementation and its useful in-memory cache. Remove the interface/factory ceremony if only one implementation remains.

### Transitional policy/marker boundary

Task 5 still owns removal of completion-marker and policy-document authority. Task 4 may change only their navigation-specific fields/validation as required so retired navigation pointer/seal proof is no longer authoritative.

Do not move policy authority into navigation or Publication-local JSON beyond the already accepted Publication descriptor policy snapshot.

## Success conditions

Task 4 is complete when all of these are true:

1. A completed Publication owns exactly one immutable JSON navigation tree under `generations/<publicationId>/navigation`.
2. A `limit_reached` partial Publication truthfully keeps `navigation: null` and does not publish a fake navigation tree.
3. Full index stages `source.json` and navigation under the same candidate Publication ID before `PublicationStore.activate()`.
4. Atomic changed-source sync builds/reuses navigation from Publication N and stages the resulting navigation inside Publication N+1 before N+1 activation.
5. `PublicationStore.current.json` is the only current selector. No production navigation `current.json` is read, written, restored, or required for activation.
6. No separately generated navigation generation ID is required to identify the active navigation resource.
7. Navigation reads are addressed by explicit Publication identity/path rather than resolving an independently mutable navigation current pointer.
8. `navigation.sqlite`, `SQLiteNavigationStore`, `RuntimeNavigationStore`, parity validation, backend selector, dual-read mode, and JSON fallback machinery are gone from production.
9. `SATORI_NAVIGATION_BACKEND` and `SATORI_NAVIGATION_DUAL_READ` are gone from production configuration/runtime identity.
10. The production navigation query path is one JSON-backed implementation; no multi-store abstraction remains solely for a hypothetical backend switch.
11. Navigation pointer restoration is removed from durable-authority capture/restore. Do not delete the remaining policy restore transaction that belongs to Task 6.
12. Navigation seal/artifact-set/per-read shard-hash proof chains are no longer publication authority. Corrupt JSON returns unavailable/rebuild behavior through parse/schema/path validation instead of forensic reconciliation.
13. Navigation has no independent retention/GC path: old Publication navigation is not pruned separately from its owning Publication, and current vector-retention machinery is not expanded into Task 10 work.
14. If `symbolRegistryStateRoot` has no remaining production owner, it is deleted rather than retained as dead compatibility configuration.
15. Task 3 source ownership, policy admission gates, synchronizer Publication binding, and activation durability semantics remain intact.
16. Task 4A's v3 call-graph sidecar is still present and functional at its existing boundary; only navigation-storage plumbing needed by Task 4 may change there.
17. No legacy/fallback navigation reader or compatibility alias is added for old derived local navigation state. Unsupported old state is reindexed/rebuilt.

## Required direct validation

Testing is not authorized. Do not create, modify, delete, or run tests for this mission. Do not run typecheck, build, broad package suites, or release checks.

Use focused non-test evidence only after the candidate final state:

1. Production search showing no navigation sidecar `current.json` selector/read/write remains outside PublicationStore's publication pointer.
2. Production search showing zero `SQLiteNavigationStore`, `RuntimeNavigationStore`, SQLite import/parity, `SATORI_NAVIGATION_BACKEND`, and `SATORI_NAVIGATION_DUAL_READ` ownership.
3. Focused full-index trace: candidate Publication ID -> Publication-local `source.json` + `navigation/` -> one `PublicationStore.activate()` selector swap.
4. Focused atomic-sync trace: Publication N navigation -> candidate N+1 navigation -> N+1 activation, with no navigation pointer publication.
5. Focused read trace showing current navigation queries/readiness use explicit Publication identity/path and cannot silently resolve a separate current navigation generation.
6. Focused partial-index trace showing `navigation: null` remains truthful.
7. Focused corruption behavior inspection showing malformed/missing Publication-local navigation becomes unavailable/rebuild/reindex without repair or multi-hash reconciliation.
8. Search proving navigation pointer capture/restore is gone while broader Task 6 policy restore machinery remains.
9. Search/inspection proving `navigationSealHash`, `artifactSetHash`, and per-read shard hashing no longer act as navigation publication proof. If any hash survives, identify its non-authority purpose.
10. Search/inspection proving `schedulePublicationRetention()` and related cleanup no longer prune navigation independently from Publication lifetime, while unrelated vector-retention behavior remains intentionally deferred.
11. Search proving no production owner remains for `symbolRegistryStateRoot`, or identify the exact legitimate surviving non-retired owner if one exists.
12. Current Core published-surface collector versus `packages/core/contracts/published-surface.json` if Task 4 changes exported navigation/config contracts.
13. `git diff --check` plus output-based whitespace checks for the accepted untracked Core files.
14. Changed-test-file search must remain zero.
15. One complete final diff inspection after the final production edit.

If a surviving later-task contract still mentions retired navigation proof fields, identify exactly why that field cannot be removed in Task 4 and prove it no longer selects/authenticates navigation. Do not silently defer a live second authority.

## Out of scope

- Do not start Task 4A call-graph sidecar deletion or public call-graph response rename.
- Do not delete the policy document or completion marker wholesale; Task 5 owns that.
- Do not delete the entire durable restore journal/transaction; Task 6 owns that after navigation pointer participation is removed.
- Do not perform Task 7 broad read-session/receipt replacement beyond the minimal navigation identity changes Task 4 requires.
- Do not delete SnapshotManager or change operation-history semantics; Task 8 owns that.
- Do not perform Task 9 general port/public-surface cleanup except Task-4-invalidated navigation contracts.
- Do not implement Publication GC/collection-family cleanup from Task 10.
- Do not touch the Go `calls_v0` plan.
- Do not edit the coordination files.
- Do not create worktrees, branches, commits, stashes, staging operations, or history rewrites.

## Working style

Use Causal Coding and Ponytail principles. First trace the real navigation write/read/authority path and identify the true owners. Prefer deletion and direct Publication ownership over adapters. Do not preserve old navigation formats, fallback readers, backend selectors, or compatibility aliases for derived local state.

Keep the smallest complete Task 4 change. Do not absorb later architecture tasks merely because the old proof graph crosses them; shrink only the navigation-specific part needed to make Publication the one navigation owner.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. workspace, branch, HEAD, and confirmation of no Git history/staging/worktree operations;
3. final Publication-local navigation layout and identity contract;
4. full-index and atomic-sync navigation publication flow;
5. navigation read/addressing flow after the migration;
6. exact navigation pointer/seal/SQLite/runtime-store contracts deleted or retained, with reason for any retained hash;
7. Task-4-specific transitional marker/policy/receipt changes;
8. `symbolRegistryStateRoot` outcome;
9. direct non-test validation actually run;
10. confirmation Tasks 0–3 and Task 4A+/Go/coordination boundaries were preserved;
11. unresolved risks/blockers before Task 4A / Task 5.
