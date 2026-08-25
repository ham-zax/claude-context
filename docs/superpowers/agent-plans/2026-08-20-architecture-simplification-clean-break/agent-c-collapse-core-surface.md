# Agent C — Collapse Pass-Through Ports and Intentionally Shrink the Core Surface

**Repository:** `/home/hamza/repo/satori`
**Artifact type:** executable behavior + public API/configuration surface
**Workspace:** current checkout
**Isolation reason:** none; this wave has one implementation writer
**Can start:** immediately after Task 8 integration acceptance
**Depends on:** Tasks 0–8 complete / verified
**Execution lifetime:** ordinary bounded coding mission
**Wake strategy:** none
**Developer visibility:** headless

## Read first

- `docs/plans/SATORI_ARCHITECTURE_SIMPLIFICATION_CLEAN_BREAK_PLAN.md` — Task 9 is authoritative.
- `docs/superpowers/agent-plans/2026-08-20-architecture-simplification-clean-break/README.md` — accepted architecture, dirty-tree baseline, dependencies, and integration policy.
- `AGENTS.md` — repository ownership, scope, and verification rules.
- Current Core/MCP source for the live port/coordinator/public-surface seams listed below.

Do not depend on conversational context from Agent A/A2/B. Their accepted architecture is summarized here and is present in the live working tree.

## Objective

Own **Task 9 only**: remove the remaining pass-through compatibility façades between MCP and Core and intentionally contract the Core package surface to the product/integration API the repository actually needs.

The end state is direct ownership, not renamed wrappers:

```text
MCP / CLI
    |
    | intentional Core product / first-party integration API only
    v
cohesive Core owners
    |- Context high-level read/index operations
    |- PublicationStore internally owns Publication selection/leases
    |- Core root-mutation owner internally owns writer fencing + live operation state
    |- source freshness uses the existing concrete Core source owner

No:
    IndexMutationPort forwarding factory
    SourceFreshnessPort forwarding factory
    MCP-owned MutationLeaseCoordinator fence
    RootMutationLease transport across MCP/Core
    legacy write-collection override
    broad "freeze everything we happened to export" fixture
    compatibility fallback factories in MCP
```

This is a clean migration. Migrate all first-party production callers in the same wave and delete the obsolete path. Do not leave aliases/adapters for the removed contracts.

## Accepted baseline you inherit

Tasks 0–8 are complete and integration-reviewed. Preserve these facts:

- Forensic repair/salvage authority is deleted. Source convergence is `sync`; incompatible/unprovable authority requires reindex.
- `PublicationStore.current.json` is the single durable current selector.
- Full-index and atomic-sync candidates are private immutable Publications and activate through one `PublicationStore.activate()` boundary.
- Publication-owned `source.json` owns immutable source coverage/freshness baseline.
- Publication-owned JSON `navigation/` is the only navigation/relationship representation; the old SQLite/pointer/seal/duplicate graph sidecar paths are deleted.
- `Publication.policy` / `Publication.format` replace the old policy document, completion marker, fingerprint, and vector control-record authorities.
- Multi-file restore/rollback journals are deleted. Clear removes Publication authority before physical cleanup and never restores it.
- Normal reads use `PublicationLease`; ordinary root reads atomically select+pin through `PublicationStore.acquireCurrentRead(root)`.
- Stale-while-sync pins the previous Publication explicitly. Current source state cannot rewrite/rerank that Publication's results.
- General historical Publication/vector GC remains conservative and belongs to Task 10.
- Durable MCP `SnapshotManager` and V1/V2/V3 snapshot/recovery machinery are deleted.
- After restart, indexed roots/status come from current Publications; active phase/progress/error is process-local Core mutation state only.
- Task 8's live operation projection is generation-aware: cached terminal operation N disappears when the durable root mutation generation advances to N+1.

Do not restore any deleted repair, receipt/proof, marker/policy document, navigation selector, rollback journal, snapshot database, or compatibility architecture to make Task 9 easier.

## Current accepted working-tree baseline

Repository:
`/home/hamza/repo/satori`

Branch:
`integrate/language-spine-cbm-go`

HEAD:
`86393ae334adba8213ae33bec6cb9c353482577e`

Accepted tracked aggregate after Task 8:
- **99 tracked files changed**
- **4,219 insertions**
- **25,643 deletions**
- **0 staged files**
- **0 changed tests**

Accepted untracked Core production owners:
- `packages/core/src/generation/publication-store.ts`
- `packages/core/src/generation/root-mutation-coordinator.ts`

These are accepted production baseline state. Do not delete, revert, replace, stage, or treat them as disposable untracked work.

The unrelated untracked Go plan and this coordination directory are not Task 9 implementation targets.

## Current live Task 9 seams

The source-plan assumptions were rechecked after Task 8. These are the current owners/callers to collapse.

### 1. `IndexMutationPort` is still a pure forwarding shell

`packages/core/src/core/index-mutation-port.ts` currently has:

```text
IndexMutationPortDependencies
    -> IndexMutationPort extends it unchanged
    -> createIndexMutationPort(deps)
         -> one-line delegate for every method
```

It adds no policy, sequencing, state, validation, or authority.

`Context.getIndexMutationPort()` lazily recreates the same forwarding object over existing `Context` operations.

MCP still imports/uses the port in:
- `full-index-operation.ts`
- `manage-indexing-handlers.ts`
- `manage-maintenance-handlers.ts`
- `handlers.ts`

`handlers.ts` also contains compatibility fallbacks that rebuild an `IndexMutationPort` when a host does not expose `getIndexMutationPort()`.

Task 9 should delete this façade, not rename it.

### 2. `SourceFreshnessPort` is still a forwarding factory

`packages/core/src/sync/source-freshness-port.ts` wraps existing concrete Core methods:

- inspect Publication source-checkpoint evidence;
- compare current source against a Publication checkpoint;
- compare all source against a Publication checkpoint;
- read the current Publication observation token.

`Context.getSourceFreshnessPort()` lazily builds that wrapper.

MCP still transports the port through `SyncManager`, `ToolHandlers`, `ManageIndexingHandlers`, `FullIndexOperation`, `SearchRequestCoordinator`, and runtime construction. `handlers.ts` also has a compatibility fallback that reconstructs the factory manually.

Task 9 should use the concrete cohesive Core source operations directly. Do not replace this with a differently named forwarding interface.

### 3. MCP still owns/transports the raw Core mutation coordinator

Although the mutation implementation is Core-owned, MCP still constructs and distributes the raw owner:

- `SharedRuntimeHost` constructs `new MutationLeaseCoordinator()`;
- `ProviderRuntime` accepts/stores a coordinator and injects it into provider `Context`s;
- `createLocalOnlyContext()` accepts a raw coordinator;
- `ToolContext` carries `mutationLeaseCoordinator`;
- `ToolHandlers`, `SyncManager`, indexing/maintenance handlers, vector maintenance, `list_codebases`, and `read_file` consume it directly;
- MCP acquires `RootMutationLease`s and passes them into Core mutation calls.

That is the remaining version of the old cross-layer fence. Task 9 must move the integration boundary so MCP **requests/observes Core mutation operations** but does not own the raw coordinator or transport raw `RootMutationLease` capability across the package boundary.

Core must remain the authoritative writer-fence owner for direct Core callers and MCP-driven callers.

A provider-free local runtime and provider-backed runtime still need one coherent process view of live mutation operations. Preserve that behavior without putting the raw coordinator back in MCP. If the current `Context` shape cannot share one Core mutation-runtime owner cleanly across those contexts, introduce the smallest dedicated **Core-owned** runtime/composition seam required. Do not add a new durable status system, callback/proof graph, or generalized service layer.

Repository ownership rule: `Context` is a composition root/façade. Do not move a second domain's mutable state/policy into `Context` merely to avoid one new cohesive Core owner.

### 4. Legacy write-collection override is still live

`Context` still contains:

- `legacyWriteCollectionOverrides`;
- `getLegacyWriteCollectionName()`;
- deprecated `setWriteCollectionOverride()`;
- fallback use in indexed-path deletion and incremental mutation target normalization.

Delete this compatibility path. Current mutation operations already have explicit operation-scoped/candidate collection identity. Do not preserve the map as an alias or no-op stub.

### 5. Deferred Task 3/7 dead surfaces are still present

Current production search shows:

- `FileSynchronizer.matchesSourceCheckpoint()` has **zero production callers**;
- unscoped `SynchronizerRegistry.registerSynchronizer()` has no production caller outside the `Context.registerSynchronizer()` compatibility façade;
- `Context.registerSynchronizer()` has no production caller;
- publication-bound `registerSynchronizerForPublication()` remains live and must survive.

Delete the dead unscoped compatibility path in this wave if the final live caller trace remains the same. Do not remove publication-bound synchronizer ownership.

Tests still reference some of these retired APIs. Testing/test-source migration is explicitly not authorized in this mission; do not keep production compatibility solely for stale tests.

### 6. The Core root barrel is still broad

`packages/core/src/index.ts` currently wildcard-exports many subsystems and explicitly exports:

- `SourceFreshnessPort` through `./sync/source-freshness-port`;
- `IndexMutationPort` through `./core/index-mutation-port`;
- `MutationLeaseCoordinator` and `RootMutationLease` from the root-mutation owner.

The current published-surface collector freezes **394 root exports and 62 public `Context` members**. It explicitly treats `IndexMutationPort`, `IndexMutationPortDependencies`, and `SourceFreshnessPort` as selected compatibility declarations.

Task 9 must stop treating “everything previously exported” as the contract.

Shrink the root surface to intentional product APIs and the smallest first-party integration contract. Do not mechanically re-freeze hundreds of internal symbols after deleting three names.

If MCP genuinely requires package-internal helpers/types that should not be root product API, prefer **one narrow, explicitly named first-party integration subpath** over re-exporting internals from the root barrel. Do not create a forest of internal subpaths or wildcard integration barrels. Any new package export must be justified by current first-party consumers.

The existing `./semantic` and `./lancedb` package subpaths are not Task 9 targets unless a direct caller migration requires a small declaration adjustment.

## Ownership

You own:

- deletion/replacement of `IndexMutationPort` pass-through ownership;
- deletion/replacement of `SourceFreshnessPort` pass-through ownership;
- migration of MCP/Core mutation integration so raw `MutationLeaseCoordinator` / `RootMutationLease` no longer belong to the MCP boundary;
- deletion of `Context.setWriteCollectionOverride` / `legacyWriteCollectionOverrides` and direct first-party callers/fallbacks;
- deletion of currently dead unscoped synchronizer compatibility surfaces if the live caller trace still proves them dead;
- contraction of the Core root barrel and published-surface guard to an intentionally supported product/integration API;
- all necessary first-party production import/caller migration in Core/MCP/CLI for those Task 9 contract changes.

Neighboring work owns:

- **Task 10:** collection-family naming, exact Publication vector naming, historical Publication/vector GC, destructive retention policy.
- **Task 11:** broad current-format-obsolete compatibility sweep such as watcher debounce aliases, search debug alias, Potion deprecated export, old format/version cleanup, and final docs cleanup.
- Go `calls_v0` promotion remains out of scope until the architecture simplification is finished.

## Coordination contract

Task 9 is a clean break. There are no external/legacy compatibility requirements for the internal APIs named by this mission.

When a public root export is removed:

1. inventory real first-party production consumers;
2. migrate those consumers to the intentional owner/API in this same wave;
3. remove the obsolete export/module/factory in the same final state;
4. do not add aliases, overloads, deprecated shims, fallback factories, or “temporary” compatibility exports.

Keep direct Core callers supported. A user constructing `Context` and calling high-level Core mutation/read APIs must not need MCP to provide the writer fence.

Preserve Task 8 live operation semantics:

- active operation identity/generation/phase/progress/error belongs to Core;
- process restart does not reconstruct terminal history;
- terminal operation N is invalidated when durable generation advances to N+1;
- no replacement durable lifecycle database.

Preserve Task 7 read semantics and conservative retention. Task 9 must not enable destructive historical GC simply because the public surface becomes smaller.

## Required end state

### Direct mutation integration

MCP must not construct or own the raw `MutationLeaseCoordinator` and must not pass `RootMutationLease` into Core mutation methods.

Core must still enforce one cross-process writer fence for `create | reindex | sync | clear`, including direct Core calls.

MCP may observe an intentional read-only live operation view/handle from Core for status/progress. That view must not expose mutation-authority methods or become another journal/token architecture.

Do not solve the migration by moving all mutation sequencing into `Context` if that violates the repository's owner rule. Use the existing root-mutation owner or the smallest dedicated Core composition/runtime owner around it.

### Direct source freshness integration

MCP source-freshness consumers call the existing concrete Core high-level operations/owner directly.

Delete `createSourceFreshnessPort`, `SourceFreshnessPortDependencies`, and the pass-through interface if no real second implementation/policy boundary remains.

Do not duplicate source freshness logic in MCP.

### Direct index mutation integration

MCP indexing/maintenance orchestration calls intentional Core high-level operations instead of an `IndexMutationPort` forwarding clone.

Delete `createIndexMutationPort`, `IndexMutationPortDependencies`, and `IndexMutationPort` if no real policy boundary remains.

Do not expose raw vector/database/publication internals merely to avoid the port; prefer existing high-level Core methods or one cohesive Task-9 integration owner.

### Public surface

The main Core barrel must not expose:

- `IndexMutationPort*`;
- `SourceFreshnessPort*`;
- raw mutation coordinator/lease authority merely because MCP once imported them;
- retired proof/receipt/persisted-authority internals from Tasks 0–8;
- test-only compatibility APIs.

Keep only intentional product API at the root. If a small explicit first-party integration subpath is required, make it narrow and named.

Replace/delete the 394-export broad compatibility fixture accordingly. If an API guard remains, it should guard a deliberate allowlist, not freeze incidental internals.

## Success conditions

Task 9 is complete only when all are true:

1. Production has zero `createIndexMutationPort`, `IndexMutationPortDependencies`, and pass-through `IndexMutationPort` ownership.
2. Production has zero `createSourceFreshnessPort`, `SourceFreshnessPortDependencies`, and pass-through `SourceFreshnessPort` ownership.
3. `Context.getIndexMutationPort()` and `Context.getSourceFreshnessPort()` are gone unless a remaining method has demonstrated non-forwarding behavior; do not keep compatibility names as aliases.
4. MCP `handlers.ts` no longer reconstructs compatibility fallback ports.
5. MCP no longer constructs/imports/owns the raw `MutationLeaseCoordinator` as its writer fence.
6. Raw `RootMutationLease` is no longer transported across MCP/Core mutation boundaries.
7. Core direct and MCP-driven create/reindex/sync/clear still use the same Core-owned writer-generation authority.
8. Task 8 process-local operation status remains observable through an intentional read-only Core boundary and retains generation invalidation/no-restart-history semantics.
9. `Context.setWriteCollectionOverride`, `legacyWriteCollectionOverrides`, and their fallback reads are gone.
10. Dead unscoped `registerSynchronizer` and `matchesSourceCheckpoint` surfaces are removed if the final caller trace remains zero; publication-bound synchronizer registration remains.
11. First-party MCP/CLI production imports are migrated in the same wave. No removed symbol is kept solely for a first-party caller that could be migrated.
12. The root `@zokizuan/satori-core` surface is materially smaller and intentionally specified; mutation/source authority internals are not root exports.
13. Any new first-party integration subpath is narrow, explicit, and contains only contracts actually used by production callers.
14. The old broad published-surface compatibility freeze is deleted or replaced by a small deliberate allowlist/guard.
15. Tasks 0–8 behavior remains intact; Task 10 GC/naming and Task 11 compatibility sweep are not absorbed.
16. No tests are created, modified, deleted, or run.

## Required direct non-test validation

Testing is not authorized. Do not create, modify, delete, or run tests. Do not run package typecheck, build, broad package suites, release checks, or final product qualification.

After the candidate final production state, gather focused evidence only:

1. Production zero-sweep for the deleted port/factory/compatibility names:
   - `IndexMutationPortDependencies`
   - `IndexMutationPort`
   - `createIndexMutationPort`
   - `SourceFreshnessPortDependencies`
   - `SourceFreshnessPort`
   - `createSourceFreshnessPort`
   - `getIndexMutationPort`
   - `getSourceFreshnessPort`
   - MCP compatibility fallback comments/branches for those ports.
2. Production boundary search proving MCP no longer constructs/imports `MutationLeaseCoordinator` or transports `RootMutationLease` for create/reindex/sync/clear.
3. Direct Core writer-owner exercise through the real high-level Core mutation API proving a direct `Context` mutation still acquires/releases the Core root writer generation without MCP injection.
4. Direct MCP-facing operation-observation exercise through the new intentional boundary proving:
   - one active mutation exposes exact generation/operation/progress;
   - a terminal same-generation operation may remain process-local;
   - advancing durable generation invalidates the older terminal projection;
   - a fresh process does not reconstruct terminal history.
5. Static/direct full-index, sync, and clear traces proving MCP no longer passes a raw lease into Core while Core still fences activation/clear/sync publication internally.
6. Source-freshness caller trace proving search/status/sync use the concrete Core source owner and no MCP duplicate/fallback source logic was added.
7. Production zero-sweep for `setWriteCollectionOverride`, `legacyWriteCollectionOverrides`, `getLegacyWriteCollectionName`.
8. Recheck `matchesSourceCheckpoint()` and unscoped `registerSynchronizer()` production callers. If zero, prove the compatibility methods are deleted while `registerSynchronizerForPublication()` remains live.
9. First-party import audit:
   - every production `@zokizuan/satori-core` root/subpath import resolves to the intended post-Task-9 surface;
   - no removed internal symbol is re-exported only to satisfy a stale first-party import.
10. Run the revised non-test public-surface collector/allowlist check if Task 9 retains a surface guard. Report root export count before/after and the intentional integration subpath count if one exists.
11. Focused source parse/import smoke for changed Core/MCP/CLI production modules only, sufficient to catch syntax/import-shape mistakes without running package typecheck/build.
12. `git diff --check`.
13. Output-based trailing-whitespace/final-newline checks for the accepted untracked Core owners.
14. Changed-test-file count remains zero.
15. Staged-file count remains zero.
16. Inspect the complete final production diff once after the final production edit.

If a required non-test check would mutate generated build output, do not run it. Use the narrowest read-only/source-level equivalent.

## Out of scope

Do not:

- implement Task 10 vector naming/general historical Publication/vector GC;
- make ambiguous family-wide `__gen_...` cleanup destructive again;
- change the Task 7 Publication-lease read model;
- restore SnapshotManager or durable operation history;
- perform Task 11's general compatibility/version cleanup beyond exact Task 9-owned surfaces;
- remove watcher debounce compatibility, search `debug:true` alias, Potion deprecated export, or old format/version code solely because you notice it;
- touch the Go `calls_v0` plan;
- create, modify, delete, or run tests;
- run typecheck, build, broad package suites, release checks, or final product qualification;
- stage, commit, stash, reset, clean, checkout, create branches/worktrees, or rewrite history;
- edit coordination files.

If shrinking the root barrel reveals a current documented external product API whose removal would be a protected product decision rather than an internal clean-break migration, stop only that export decision and report it. Continue all non-conflicting Task 9 work.

## Working style

Use Causal Coding, Clean Migration, and Ponytail principles.

Trace the real callers before removing a public name. Prefer deletion and direct owner calls over adapter layers. Avoid creating a new generic “service” just to replace two deleted ports.

One useful mental model is:

```text
before:
MCP -> port/fallback -> Context -> owner
MCP -> raw MutationLeaseCoordinator -> Context mutation

Task 9:
MCP -> intentional Core API -> owner
Core runtime/owner -> writer lease + operation projection
```

Keep the first-party integration surface small enough that a tired engineer can identify the supported cross-package contract directly from the barrel/subpath file.

Stop when Task 9's observable contracts pass. Do not continue into Tasks 10–11.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. branch, HEAD, tracked aggregate, staged count, changed-test count, and confirmation that no Git/worktree/history operations were performed;
3. final fate of `index-mutation-port.ts` and all first-party callers;
4. final fate of `source-freshness-port.ts` and all first-party callers;
5. final Core mutation-operation integration contract, including how MCP observes progress without owning raw coordinator/leases;
6. confirmation direct Core mutation still owns/enforces the writer fence;
7. final `Context.setWriteCollectionOverride` / unscoped synchronizer cleanup;
8. final Core root product API and any explicit first-party integration subpath introduced;
9. before/after public-surface counts and exact surface guard/allowlist behavior;
10. direct non-test validation actually run and observed results;
11. confirmation Tasks 0–8 remain intact and Tasks 10–11/Go were not absorbed;
12. unresolved blockers/risks before Task 10.

## Integration continuation finding

The first Task 9 completion report is not yet accepted. Live integration review confirms the main clean migration: `index-mutation-port.ts` and `source-freshness-port.ts` are deleted; production has zero old port/factory/getter references; MCP has zero raw `MutationLeaseCoordinator` / `RootMutationLease` boundary; one shared Core `RootMutationRuntime` owns the hidden writer scope across local/provider contexts; direct Core mutation and Task 8 generation-aware operation semantics reproduce correctly; legacy write-collection state, unscoped synchronizer registration, and `matchesSourceCheckpoint()` are gone; the 119-root / 8-integration allowlist matches; and all 297 first-party Core import bindings resolve against that intended source surface.

One Major remains in the legacy write-override deletion. `packages/core/src/generation/index-teardown-workflow.ts` still declares the required `IndexTeardownWorkflowPorts.clearLegacyWriteCollectionOverride(canonicalRoot)` method and still calls it near the end of `clearIndex()`. Task 9 removed the legacy write-override owner and `Context` no longer supplies that port when constructing `IndexTeardownWorkflow`.

Independent reproduction through the real current `Context.clearIndex()` path with a temporary Core state root and an empty vector backend reached the stale call and returned:

```text
TypeError: this.ports.clearLegacyWriteCollectionOverride is not a function
```

This also leaves the production TypeScript object literal structurally inconsistent with the required `IndexTeardownWorkflowPorts` contract, even though the authorized source parser/import checks do not perform semantic type checking.

Close this seam by deleting the obsolete teardown port member and invocation. Do not add a no-op callback or compatibility stub: the state it used to clear no longer exists.

Required continuation verification is narrow and non-test:

1. Re-run the real temporary `Context.clearIndex()` reproduction and prove clear completes successfully with no legacy write-override callback.
2. Production zero-sweep for `clearLegacyWriteCollectionOverride`, `setWriteCollectionOverride`, `legacyWriteCollectionOverrides`, and `getLegacyWriteCollectionName`.
3. Re-run the Task 9 old-port/raw-MCP-lease zero sweeps.
4. Re-run the 119-root / 8-integration surface allowlist collector and first-party import audit; the fix should not require a surface change.
5. Re-run `git diff --check`, accepted/new untracked Core whitespace/final-newline checks, changed tests = 0, and staged files = 0.
6. Inspect the complete final production diff once after the final production edit.

Tests, typecheck, build, broad suites, release checks, Task 10+, and Go work remain unauthorized.

## Final integration acceptance

Task 9 is accepted and closed on the live working tree at HEAD `86393ae334adba8213ae33bec6cb9c353482577e`.

The continuation removed the only remaining Task 9 defect: `IndexTeardownWorkflowPorts.clearLegacyWriteCollectionOverride()` and its `clearIndex()` invocation are gone, with no no-op callback or replacement compatibility state. Independent integration review exercised the real `Context.clearIndex()` path against temporary Core state and observed successful selector-first teardown instead of the prior `TypeError`.

Final accepted production baseline:

- 100 tracked files changed;
- 4,346 insertions / 26,879 deletions;
- zero staged files;
- zero changed tests;
- accepted/new untracked Core production files remain `publication-store.ts`, `root-mutation-coordinator.ts`, `root-mutation-runtime.ts`, and `integration.ts`.

Final integration evidence also reconfirmed:

- zero production `IndexMutationPort*` / `SourceFreshnessPort*` forwarding ownership;
- zero production legacy write-override ownership;
- zero raw `MutationLeaseCoordinator` / `RootMutationLease` boundary in MCP/CLI;
- Publication-bound synchronizer registration remains live;
- direct Core mutation still advances/releases the durable root writer generation;
- terminal process-local operation state still invalidates when another runtime advances the durable generation;
- the deliberate package surface matches at 119 root exports / 8 integration exports;
- all 297 first-party Core import bindings resolve against that intended source surface;
- `git diff --check` and accepted/new Core whitespace/final-newline checks pass.

Task 10 is now the next eligible mission. Task 11 and Go work remain out of scope until Task 10 passes integration review.
