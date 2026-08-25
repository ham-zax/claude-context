# Satori Architecture Simplification — Agent Coordination

**Repository:** `/home/hamza/repo/satori`
**Source of truth:** `docs/plans/SATORI_ARCHITECTURE_SIMPLIFICATION_CLEAN_BREAK_PLAN.md`
**Coordination base:** `86393ae334adba8213ae33bec6cb9c353482577e`
**Execution shape:** sequential foundation; replan before any parallel coding wave
**Current wave:** 13

## Current frontier

| Mission | Type | Status | Can start | Workspace | Isolation reason | Blocked by |
|---|---|---|---|---|---|---|
| Agent A — Delete forensic repair | executable | complete / verified | done | current checkout `/home/hamza/repo/satori` | none | none |
| Agent B — Publication foundation and Core writer ownership | executable | complete / verified | done | current checkout `/home/hamza/repo/satori` | none | Agent A complete |
| Agent A — Core candidate construction ownership (second mission) | executable | complete / verified | done | current checkout `/home/hamza/repo/satori` | none | Agent B / Task 1 complete |
| Agent A — Publication-owned source freshness (third mission) | executable | complete / verified | done | current checkout `/home/hamza/repo/satori` | none | Task 2 complete / verified |
| Agent A — Publication-owned navigation and single JSON store (fourth mission) | executable | complete / verified | done | current checkout `/home/hamza/repo/satori` | none | Task 3 complete / verified |
| Agent A2 — Delete parallel v3 call-graph sidecar (fifth mission) | executable | complete / verified | done | current checkout `/home/hamza/repo/satori` | none | Task 4 complete / verified |
| Agent A2 — Publication descriptor as policy/marker authority (sixth mission) | executable | complete / verified | done | current checkout `/home/hamza/repo/satori` | none | Task 4A complete / verified |
| Agent A2 — Delete multi-file rollback / restore transactions (seventh mission) | executable | complete / verified | done | current checkout `/home/hamza/repo/satori` | none | Task 5 complete / verified |
| Agent A2 — Collapse read proofs to Publication leases (eighth mission) | executable | complete / verified | done | current checkout `/home/hamza/repo/satori` | none | Task 6 complete / verified |
| Agent C — Delete durable MCP SnapshotManager and derive status from real owners (ninth mission) | executable | complete / verified | done | current checkout `/home/hamza/repo/satori` | none | Task 7 complete / verified |
| Agent C — Collapse pass-through ports and shrink Core surface (tenth mission) | executable | complete / verified | done | current checkout `/home/hamza/repo/satori` | none | Task 8 complete / verified |
| Agent C — Simplify vector collection identity and Publication GC (eleventh mission) | executable | complete / verified | done | current checkout `/home/hamza/repo/satori` | none | Task 9 complete / verified |
| Agent C — Remove current-format-obsolete compatibility/version machinery (twelfth mission) | executable | complete / verified | done | current checkout `/home/hamza/repo/satori` | none | Task 10 complete / verified |

## Why the current frontier is still not parallel

Task 6 is complete. Durable rollback/restore transactions are gone; failure before activation discards only the unpublished Publication candidate; clear removes the one Publication selector before physical cleanup and never restores it; safe cold-start cleanup removes only provably private descriptor-less candidates; and MCP now reports post-selector cleanup failure as an already-cleared authority plus retryable residual cleanup.

Task 7 is complete. Production read proof receipts/caches/flights are gone; ordinary root reads select and pin through `PublicationStore.acquireCurrentRead(root)`; MCP sessions carry exact `PublicationLease`s; stale-while-sync deliberately binds the previous Publication; selection controls remain fail closed; source freshness does not redefine read identity; and ambiguous family-wide `__gen_...` cleanup is now conservative so it cannot delete resources named by a live historical Publication lease.

Task 8 is complete. SnapshotManager and its durable lifecycle database are gone; restart/list/read/sync/status derive from current Publications plus the live Core mutation owner. The final continuation also makes terminal process-local operation status generation-aware, so an older operation projection disappears when another Core coordinator advances the durable root generation.

Task 9 is complete. `IndexMutationPort` and `SourceFreshnessPort` are deleted; MCP no longer owns or transports raw Core mutation leases/coordinators; one shared Core `RootMutationRuntime` supplies the mutation boundary for local/provider contexts; legacy write-collection overrides and dead unscoped synchronizer compatibility are gone; and the Core package contract is now an explicit 119-export product root plus an 8-export first-party integration subpath. The final continuation removed the stale teardown callback left after legacy write-override deletion, and direct `Context.clearIndex()` now completes successfully.

Task 10 is complete. Current vector authority comes only from the selected Publication's exact `vector.collectionName`; active/alternate/staged collection-family authority helpers are gone. MCP local/provider Contexts share one opaque Core `SharedPublicationRuntime`, so supported destructive GC sees one Publication lease map for the state root. Historical GC retains current and pinned Publications, removes exact descriptor-named vector/generation resources only after the final lease drains, and remains conservative for direct/unsupported owners that do not establish the shared-reader boundary. Selector-first clear preserves pinned former-current resources and never restores authority.

The checkout intentionally carries the accepted uncommitted Tasks 0–11 as one dirty architecture-simplification baseline. All architecture implementation missions are now complete and integration-verified. A separate read-only verification session may continue auditing this checkout; it is not a writer and does not require isolation.

Wave 13 is complete. Task 11 removed the final pre-clean-break compatibility readers/aliases and current-facing stale contracts: retired production authority families are absent, watcher-debounce compatibility is gone, `search_codebase` is strict on `debugMode`, the Potion compatibility digest is gone, and the landing documentation now distinguishes durable Publication state from process-lifetime mutation phase/progress/error. The Core surface remains 118 root exports / 10 integration exports, and all 300 first-party Core bindings resolve.

## Integration review gate

Every returned implementation mission is reviewed against the **live WSL working tree** before the next mission is unlocked. Agent reports are inputs, not acceptance by themselves.

For each handoff:

- rebaseline HEAD/status/diff and preserve accepted prior work;
- inspect the changed ownership path and failure ordering, not only the reported search results;
- run only the direct non-test consistency checks authorized for that wave;
- distinguish blocking defects from intentionally deferred later-task work;
- fold every concrete blocking or relevant deferred finding into the next/continuation agent brief;
- do not mark a phase complete or start a dependent task until the current mission passes this review gate.

If a review finding belongs to a later task, record it in the coordination map and put it into that task's eventual prompt rather than expanding the current mission silently.

## Dependency map

```text
86393ae3 coordination base
        |
        v
Agent A / Task 0
forensic repair deleted
        |
        v
Agent B / Task 1
PublicationStore + Core root writer owner
        |
        v
verified A+B working tree
34 tracked files, +252/-2289
+ publication-store.ts + root-mutation-coordinator.ts
        |
        v
Agent A / Task 2 (second mission)
Core owns source + collection candidate construction
prepared capabilities stop crossing MCP/Core boundary
        |
        v
Task 2 integration review passed
38 tracked files, +742/-3561
durability control flow verified
        |
        v
Agent A / Task 3 (third mission)
source.json becomes a Publication child
incremental sync advances PublicationStore
        |
        v
Task 3 integration review passed
43 tracked files, +1523/-6142
publication-bound synchronizer cache verified
        |
        v
Agent A / Task 4 (fourth mission)
navigation becomes Publication-local JSON
separate navigation current/seal/SQLite authority deleted
        |
        v
Task 4 integration review passed
66 tracked files, +3034/-10921
one Publication selector + JSON navigation verified
        |
        v
Agent A2 / Task 4A (fifth mission)
delete duplicate MCP v3 call-graph sidecar
keep relationship-backed call_graph traversal
        |
        v
Task 4A integration review passed
76 tracked files, +3159/-12179
legacy snapshot metadata scrub verified
        |
        v
Agent A2 / Task 5 (sixth mission)
Publication descriptor replaces policy/marker authority
        |
        v
Task 5 integration review passed
93 tracked files, +3525/-17438
current Publication proof/status contract verified
        |
        v
Agent A2 / Task 6 (seventh mission)
delete multi-file rollback/restore transaction machinery
clear Publication authority before physical cleanup
discard unpublished Publication candidates
        |
        v
Task 6 integration review passed
93 tracked files, +3665/-17914
selector-first clear failure semantics verified
        |
        v
Agent A2 / Task 7 (eighth mission)
collapse proof receipts/read preparation to Publication leases
atomic root select+pin through PublicationStore.acquireCurrentRead(root)
        |
        v
Task 7 integration review passed
96 tracked files, +3740/-20903
active historical Publication resources survive preflight cleanup
        |
        v
Agent C / Task 8 (ninth mission)
delete durable MCP SnapshotManager
restore roots/status from PublicationStore + live root mutation state
        |
        v
Task 8 integration review passed
99 tracked files, +4219/-25643
cross-coordinator terminal-operation generation invalidation verified
        |
        v
Agent C / Task 9 (tenth mission)
collapse pass-through ports and intentionally shrink Core surface
remove raw MCP mutation-coordinator/lease ownership
        |
        v
Task 9 integration review passed
100 tracked files, +4346/-26879
119 root exports + 8 integration exports; clear regression verified
        |
        v
Agent C / Task 10 (eleventh mission)
exact Publication vector identity + reader-safe historical GC
shared Core Publication/read-lease owner for supported destructive GC
        |
        v
Task 10 integration review passed
102 tracked files, +4432/-27160
118 root exports + 10 integration exports; shared-reader GC lifecycle verified
        |
        v
Agent C / Task 11 (twelfth mission)
remove current-format-obsolete compatibility/version machinery
keep only current Publication/search/watcher product contracts
```

## Shared contracts

Accepted Task 0–3 baseline:

- `manage_index repair`, repair proof/results, authority-salvage `repairIndex()`, and relationship-only repair promotion are gone;
- source convergence remains `sync`; incompatible/lost/unprovable authoritative state routes to `reindex`;
- the single production `MutationLeaseCoordinator` is Core-owned and covers `create | reindex | sync | clear`;
- direct Core mutation entry points and MCP-driven mutations use that same Core root writer owner;
- `PublicationStore` is current-format only, has one `current.json` selector, durable activation ordering, ID-keyed read leases, atomic `acquireCurrentRead(root)`, and conservative GC eligibility;
- full-index candidate construction is Core-owned and full-index activation uses `PublicationStore`;
- `PublicationStore.activate()` distinguishes pointer visibility from crash durability; parent-directory-fsync failure is surfaced as `visible_unconfirmed`, not normal activated success;
- Core has no production dependency on MCP;
- the old MCP mutation-lease owner and prepared source/collection authenticity machinery are deleted;
- all-file full-index source capture is lightweight path/hash/stat evidence, with source text retained only for semantic-project consumers.

Task 3 adds these accepted contracts:

- authoritative source checkpoint state is `generations/<publicationId>/source.json` with current-only `version`, `canonicalRoot`, `fileHashes`, `fileStats`, and `unprocessedPaths`;
- source checkpoint ownership no longer depends on collection name, marker run ID, policy hash, Merkle-root authority, checkpoint document digest, or a persisted full-hash counter;
- full index stages `source.json` from Task 2's captured source observations before Publication activation;
- changed-source atomic sync stages the next `source.json` and activates the corresponding next Publication; a successful sync cannot leave `PublicationStore.current` behind;
- process-local synchronizer/cache state is bound to exact active Publication ID and may advance metadata/full-hash cadence without mutating immutable `source.json`;
- partial Publications preserve explicit `unprocessedPaths` coverage and do not mistake known unprocessed files for post-publication drift;
- ordinary source drift makes the active Publication stale relative to the working tree, not internally invalid;
- selection-policy drift remains a separate fail-closed new-read admission boundary, including a final live control-signature check before atomic sync activation.

Task 4 adds these accepted contracts:

- completed Publications own one immutable JSON navigation tree at `generations/<publicationId>/navigation`; partial Publications keep `navigation: null`;
- Publication ID is the navigation identity and `PublicationStore.current.json` is the only current selector;
- full index and atomic sync stage Publication-local navigation before the same Publication activation that selects vector/source state;
- navigation reads are addressed by explicit `publicationId + navigationRoot` and never resolve an independent current navigation generation;
- navigation pointer/seal/artifact-set authority, SQLite shadow storage, runtime backend/dual-read selection, and `symbolRegistryStateRoot` production ownership are deleted;
- navigation is not pruned independently from its owning Publication;
- surviving symbol/relationship manifest hashes are JSON consistency, descriptive, or reuse metadata, not a second Publication selector/authenticator.

Task 4A adds these accepted contracts:

- Publication-owned relationship navigation is the only persisted call-graph/relationship representation;
- the duplicate MCP v3 `CallGraphSidecarManager`, graph file I/O/build lifecycle, runtime manager wiring, snapshot metadata, and rebuild hooks are deleted;
- `call_graph` remains relationship-backed with the supported Python source fallbacks, suppression/test-reference/coverage behavior, and Publication navigation attribution;
- the public success summary is `graph`, not `sidecar`, with no compatibility alias;
- old v3 snapshot `callGraphSidecar` metadata is discarded at the current-shape decode boundary and is not written back on save/merge;
- Core `callGraphBuild` / `callGraphQuery` capability semantics remain for relationship construction/traversal.

Task 5 adds these accepted contracts:

- the selected immutable `Publication` is sufficient durable authority for policy, current format, vector collection identity, and Publication-local navigation identity;
- `Publication.policy` preserves explicit custom extensions/ignore patterns, accepted file-based patterns, expanded effective policy, `policyHash`, and the accepted live-control signature needed for restart/incremental reconciliation;
- `Publication.format` is the current-only compatibility boundary (`indexFormatVersion`, embedding identity, relationship version); retired marker/fingerprint formats are not promoted or migrated;
- the durable policy document, completion marker/vector control record, policy-document digest identity, marker run-ID identity, and their compatibility readers are deleted;
- full index and atomic sync perform final source/control checks before the single `PublicationStore.activate()` authority switch;
- runtime policy state is reconstructed from the selected Publication; live repository selection controls remain a separate fail-closed new-read admission check and do not mutate Publication bytes;
- MCP Publication validation consumes the real `PublicationRef`/navigation-proof contract; `PublicationNavigationProof` now has only `valid | not_bound | missing | incompatible | corrupt`, while whole-Publication format incompatibility remains the separate top-level `requires_reindex` result.

Task 6 adds these accepted contracts:

- the durable multi-file restore journal, rollback snapshot/type family, recovery publisher/mechanics, and restore-facing Core surface are deleted rather than replaced;
- pre-activation full-index/atomic-sync failure discards the unpublished Publication generation while leaving the previous `current.json` selection untouched;
- selected, `visible_unconfirmed`, and already-activated Publications are never rolled back by candidate cleanup;
- `clearIndex()` clears `PublicationStore.current` under the Core root mutation lease before vector/process-local cleanup; later cleanup failure does not restore authority;
- post-selector MCP clear failures state truthfully that Publication authority is already cleared and residual physical cleanup is retryable; failed cleanup does not call `markCodebaseCleared()` while SnapshotManager remains for Task 8;
- cold-start Publication cleanup removes only provably private descriptor-less generations, preserves the selected Publication, and conservatively preserves descriptor-bearing historical Publications until later reader-safe retention/GC work;
- runtime `PublicationStore.isGcEligible()` remains conservative; general historical Publication/vector GC is not Task 6.

Task 7 adds these accepted contracts:

- ordinary root-based semantic/search/navigation reads get Publication identity and the retention pin from the same atomic `PublicationStore.acquireCurrentRead(root)` operation;
- request-bound `PublicationLease` replaces cloned generation receipts/proof caches/flights/currentness reconstruction;
- a leased Publication N remains valid when N+1 becomes current, while a later root-starting read acquires N+1;
- stale-while-sync explicitly leases the previous Publication and disables current-working-tree evidence/reranking that could alter that Publication's results;
- selection controls remain a separate fail-closed admission boundary and source freshness remains sync/retry evidence rather than read identity;
- Core semantic retrieval uses the exact collection named by the leased Publication; navigation reads use that Publication's exact local navigation root;
- broad historical/vector reclamation remains conservative until Task 10; family-wide `__gen_...` preflight cleanup is non-destructive because naming alone cannot prove a collection unpublished;
- exact unpublished-candidate failure cleanup still deletes the explicitly owned candidate Publication/collection.

Task 8 adds these accepted contracts:

- durable MCP `SnapshotManager`, V1/V2/V3 snapshot formats, snapshot locks/merges/tombstones/quarantine, and interrupted-snapshot recovery are deleted rather than replaced;
- `PublicationStore.listCurrent()` / `Context.listCurrentPublications()` reconstruct indexed roots after restart without MCP parsing hashed Publication storage;
- `read_file` published coverage comes from the current Publication's `source.json`; partial `unprocessedPaths` are not treated as published indexed payload;
- sync reconstructs accepted control identity from `Publication.policy.controlSignature` and indexed paths from Publication source state rather than snapshot fallback fields;
- startup watcher/tracked-root state is seeded from current Publications;
- mutation phase/progress/error is process-local state on the Core root mutation owner, not a durable lifecycle database;
- terminal operation history is not reconstructed after restart, and a cached terminal operation N is suppressed once the durable root mutation generation advances to N+1;
- public `manage_index` wording describes operation state as process-lifetime only.

Task 9 adds these accepted contracts:

- production `IndexMutationPort` / `SourceFreshnessPort` forwarding factories and compatibility fallbacks are deleted;
- MCP no longer constructs, transports, acquires, or releases raw `MutationLeaseCoordinator` / `RootMutationLease` capability;
- one Core-owned `RootMutationRuntime` is shared across MCP local/provider Contexts and owns the hidden root writer scope plus process-local operation projection;
- direct Core mutation and MCP-driven mutation continue to use the same durable root generation authority;
- legacy write-collection override state and its teardown callback are deleted rather than preserved as no-ops;
- dead unscoped synchronizer compatibility and `matchesSourceCheckpoint()` are gone while Publication-bound synchronizer registration remains;
- the Core product root is an explicit 119-export allowlist and first-party mutation/source integration is isolated to the 8-export `@zokizuan/satori-core/integration` subpath;
- the old 394-export plus public-Context-member compatibility freeze is gone; first-party imports resolve against the intentional post-Task-9 surface.

Task 10 adds these accepted contracts:

- current vector authority is always the exact `Publication.vector.collectionName`; collection-family priority/staged-generation authority helpers are deleted;
- supported destructive GC uses one shared Core `SharedPublicationRuntime` across all participating MCP Contexts, so one ID-keyed lease map protects old readers;
- default/direct Core Contexts without that shared owner remain conservatively non-destructive for descriptor-bearing historical Publications; no distributed reader lease protocol exists;
- historical GC runs under the Core root writer generation, reserves exact non-current/unleased Publications, deletes their exact descriptor-named vector collection, then removes the exact local generation; current selection is never changed by GC;
- pinned Publication N survives N+1 activation and selector-first clear; a later bounded sweep reclaims N only after the final lease releases;
- exact unpublished-candidate failure cleanup remains destructive and does not use collection-family guessing;
- transitional `pruneIndexedCollectionFamily` / `pruneUnprovenStagedCollectionFamily` and their MCP preflight path are deleted;
- obsolete vector publication/data observation hooks and Lance manifest-observation proof remnants are deleted;
- LanceDB retains `collection_fork` atomic incremental publication while both Milvus adapters remain `unsupported`;
- the intentional Core surface is 118 root exports plus 10 integration exports, including only the opaque shared Publication-runtime contracts needed by first-party MCP.

Agent C must preserve all accepted Task 0–10 contracts while completing Task 11.

### Task 4A continuation finding from live integration review

The first Task 4A pass is structurally strong: live production searches found zero `CallGraphSidecarManager`, `SupportedSourceDeltaPolicy`, `CallGraphSidecarInfo`, `callGraphSidecar` typed ownership, rebuild/commit hooks, or stale call-graph-sidecar helper terminology. `packages/mcp/src/core/call-graph.ts` is deleted; relationship-backed traversal uses explicit Publication navigation; full index and sync no longer rebuild a second graph; the public response uses `graph`; `callGraphBuild` / `callGraphQuery` remain; SnapshotManager remains for Task 8; `git diff --check` and accepted Core whitespace checks pass; staged/test changes remain zero.

One Major acceptance defect remains in `packages/mcp/src/core/snapshot.ts`: the snapshot decoder validates only known required fields but returns the raw object unchanged. A pre-Task-4A v3 entry containing `callGraphSidecar` therefore retains that unknown property in `codebaseInfoMap`, and both ordinary save and the disk-merge path serialize it back to the v3 snapshot. Integration review reproduced this directly: after `loadCodebaseSnapshot()` followed by `saveCodebaseSnapshot(true)`, the saved codebase entry still contained `callGraphSidecar` (`retained:true`).

Task 4A continuation must discard this retired derived metadata at the current snapshot decode boundary (or an equivalent central boundary used by initial load and disk merge). Do not restore the old type, inspect/migrate the old sidecar, or add compatibility machinery. After the fix, reproduce an old v3 entry carrying `callGraphSidecar` and prove a load/save cycle removes it from current in-memory and durable snapshot state.

### Task 4A final integration result and Task 5 replan

Agent A2's continuation fixed the only Task 4A blocker. Live review independently reproduced an old valid v3 snapshot containing `callGraphSidecar`; the current decoder removed it in memory and a forced save removed it from disk (`saved=true`, `inMemoryHas=false`, `diskHas=false`). Production searches still show zero retired v3 graph owner/lifecycle symbols. Full index and sync still build no second graph, the public `graph` response contract remains in place, `callGraphBuild` / `callGraphQuery` remain, `git diff --check` is clean, accepted Core whitespace checks pass, and staged/test changes remain zero. Task 4A is accepted.

Live Task-5 inspection found these concrete ownership seams:

1. `Publication.policy` already stores profile, expanded supported extensions, expanded effective ignore patterns, and the control signature, but it does **not** store the explicit user `customExtensions` / `customIgnorePatterns` that incremental reconciliation currently inherits from the durable policy document/runtime cache. Task 5 must make the Publication policy snapshot sufficient to reconstruct those active user inputs after restart before deleting the policy document.
2. `IndexPolicyRuntimeService.loadCustomIndexPolicy()` still reads and authenticates `satori_index_policy_v5`, and `IndexPolicyDocumentStore` still owns atomic policy-file persistence/removal/tombstones. That durable file must cease to be authority and the store should be deleted after callers migrate.
3. `persisted-index-authority.ts` still owns policy V3/V4/V5 parsing, completion-marker V1/V2/V3 parsing, completion fingerprints, policy-document digests, and legacy publication/navigation binding proof structures. Task 5 should delete this owner rather than relocate its proof graph.
4. Full index and atomic sync still write/read a completion marker and switch durable policy/binding authority **before** `PublicationStore.activate()`, then carry rollback code to restore that legacy authority if candidate activation fails. Task 5 must make `PublicationStore.activate()` the authority switch; Task 6 still owns wholesale deletion of the remaining restore transaction module.
5. Core `IndexAuthorityCoordinator` / `Context` and MCP readiness identities still rely on `policyDocumentDigest`, completion-marker equality/run ID/fingerprint, and policy-file tokens. Task 5 must remove policy-document/marker identity from current authority and read admission without prematurely performing Task 7's broad Publication-lease/read-session rewrite.
6. The current `Publication.format` (`indexFormatVersion`, embedding identity, relationship version) is already the intended current-only compatibility direction. Prefer it over the completion-marker fingerprint family; unsupported old formats require reindex rather than promotion/migration.
7. Task 3's final live selection-control signature check and new-read fail-closed gate remain the safety boundary to preserve. Control drift changes admission, not immutable Publication bytes.

### Task 3 replan findings from integration review

Live-tree inspection after Task 2 found two boundaries the source-plan file list does not state explicitly:

1. `packages/core/src/sync/source-freshness-port.ts`, `packages/core/src/core/context.ts`, the internal `PublicationStore`, and Task-3-specific public-surface declarations participate in source checkpoint ownership. Agent A may change only the source-freshness pieces required by Task 3; this is not broad Task 7/9 cleanup.
2. Incremental sync currently never calls `PublicationStore.activate()`. Its atomic delta path still publishes only the legacy policy/navigation/checkpoint authority. Task 3 cannot truthfully make source freshness a Publication child unless successful sync publication also advances `PublicationStore.current`. The next mission must fix that while preserving navigation/policy as transitional later-task owners.

### Task 3 continuation findings from live integration review

Agent A's first Task 3 pass has moved the main ownership boundary, but Task 3 is **not accepted yet**. The live WSL candidate is 42 tracked files with 1,334 insertions / 5,857 deletions on the same HEAD, with no changed tests. Review found these continuation items:

1. **Partial Publication source coverage is not modeled correctly yet.** The `limit_reached` full-index path builds `source.json` from the consumed/captured subset and then calls `PreparedFileChangeSet.assertSourceObservationCurrent()`, which scans the full selected tree. Already-known unprocessed indexable paths therefore appear as additions and can reject an otherwise valid partial Publication. Fix the final check without weakening drift detection for the files actually consumed. Also make the resulting partial-source comparison semantics explicit enough that known unprocessed files are not later confused with post-publication drift merely because `source.json` contains only consumed source evidence.
2. **Do not persist the periodic full-hash scan counter in immutable source authority unless no-op semantics can preserve its contract.** `source.json` currently stores `fullHashCounter`, but no-op sync intentionally does not mint a new Publication and no longer commits durable synchronizer state. Each later sync reconstructs a new `FileSynchronizer` from the unchanged Publication, so `SATORI_SYNC_FULL_HASH_EVERY_N` can stop advancing across no-op scans. This environment input is part of shared runtime identity. Prefer keeping operational scan cadence out of immutable source authority, or otherwise preserve the configured every-N behavior without creating Publications solely to bump a counter.
3. **Delete the unreachable legacy non-atomic changed-source branch.** `performReindexByChange()` now unconditionally throws `AtomicIncrementalPublicationUnsupportedError` when it cannot use atomic candidate publication, but the old in-place sync implementation remains after that throw (roughly the remainder of the method until `publishSealedPolicyBindingForMarker`). This clean-break mission should delete the dead path instead of carrying a second obsolete mutation architecture that cannot execute.
4. **Synchronize the public surface.** The production collector no longer exports `FileSynchronizerInitializeOptions`, `SourceFreshnessCheckpointAuthority`, `SourceFreshnessCheckpointEvidence`, `StagedSourceFreshnessCheckpoint`, `SynchronizerCheckpointPublicationError`, or `SynchronizerCheckpointStagingCleanupError`, and `Context.inspectSourceFreshnessCheckpoint` has a new signature. `packages/core/contracts/published-surface.json` still advertises the old declarations.
5. The final mission validation still needs to be run after these fixes. In particular, re-prove the full-index and incremental source-to-Publication traces and the selection-policy fail-closed admission path. If selection controls can change during an atomic sync, either show the existing post-activation admission gate prevents serving the stale policy or add the smallest current-control revalidation required by the mission; do not move policy authority into `source.json`.

Agent A's second Task 3 pass resolved the five findings above: partial coverage now uses explicit `unprocessedPaths`, `fullHashCounter` is no longer persisted in `source.json`, the dead non-atomic branch is deleted, the published surface matches, and atomic sync now performs a final live control-signature check. The live second-pass candidate is 43 tracked files with 1,427 insertions / 6,133 deletions on the same HEAD, with no changed tests.

A second live integration review found **one remaining Task 3 blocker**:

6. **Do not key runtime synchronizer reuse on exact immutable `source.json` equality after a metadata-only no-op.** `FileSynchronizer` now correctly keeps `fullHashCounter` and refreshed stat signatures in process-local state. However, `performReindexByChange()` reuses the registered synchronizer only when `registeredSynchronizer.matchesSourceCheckpoint(currentPublicationSource.checkpoint)` is true, and `matchesSourceCheckpoint()` currently compares the full serialized checkpoint including `fileStats`. A content-equivalent metadata change updates runtime `fileStats` on no-op commit without minting a Publication, so the runtime synchronizer stops matching the unchanged immutable `source.json`. Every later sync then reconstructs a new synchronizer from the old checkpoint, discards the process-local counter/stat cache, and can prevent `SATORI_SYNC_FULL_HASH_EVERY_N` from ever reaching its interval. Direct reproduction with interval `3` and one metadata-only change produced four consecutive `fullHashRun=false` scans, each rehashing the file. Preserve process-local state across metadata-only no-op checks while the same Publication remains current. Do not solve this by weakening equality in a way that can reuse a synchronizer across a different Publication or selection policy merely because hashes happen to match; bind runtime cache reuse to the active Publication identity (or an equivalently strong current owner) while allowing live stat/cache state to diverge from immutable Publication metadata.

The final Task 3 continuation resolved finding 6 by binding `SynchronizerRegistry` entries to the exact active Publication ID. Integration review reproduced metadata-only reuse and every-N cadence successfully, confirmed different Publication IDs cannot reuse the old runtime state, and found no remaining Task 3 blocker. Task 3 is accepted.

### Task 4 replan findings from the live tree

Live inspection before materializing Task 4 found several boundaries not explicit in the source-plan file list:

1. `PublicationStore` already accepts `navigation: { relativeRoot: 'navigation' }` and verifies that directory during activation, but current navigation staging still lives under a separate sidecar root with a random navigation `generationId`. Task 4 should write the immutable JSON tree directly under the candidate Publication generation and use Publication ID as the navigation resource identity rather than preserving another generation namespace.
2. `Context.publishNavigationCandidate()` currently performs a second publication transaction: it swaps navigation `current.json`, imports `navigation.sqlite`, and prunes sidecar generations. Task 4 must delete that selector/import transaction so `PublicationStore.activate()` is the one activation switch.
3. Navigation reads still resolve the second pointer and repeatedly cross-check `seal.json`, `navigationSealHash`, `artifactSetHash`, manifest hashes, and shard hashes. Keep parse/schema/path safety, but remove the independent seal/current proof chain. Any surviving hash must have a concrete non-authority data/cache/reuse purpose.
4. `navigation/runtime.ts`, `navigation/sqlite.ts`, MCP runtime-store construction, and `SATORI_NAVIGATION_BACKEND` / `SATORI_NAVIGATION_DUAL_READ` shared-runtime identity inputs are one retired dual-store experiment and should disappear in this wave.
5. The current `NavigationStore` interface/factory exists for JSON/SQLite switching. After SQLite deletion, keep the useful JSON query/cache behavior but remove multi-backend abstraction/aliases that no longer have a real second implementation.
6. Durable authority capture/restore still snapshots navigation `current.json`. Task 4 must remove navigation-pointer participation now; Task 6 still owns deleting the remaining policy restore transaction itself.
7. Current receipts/readiness/prepared-read plumbing carries navigation generation/seal identity. Task 7 still owns broad receipt/read-session deletion, but Task 4 must shrink the navigation-specific part enough that those surviving contracts no longer select or authenticate an independent navigation generation.
8. `ContextConfig.symbolRegistryStateRoot` has only navigation production owners in the live tree. If none remain after Publication-local navigation, remove that dead configuration surface rather than keeping a compatibility alias.
9. Task 4A remains blocked. It will delete the duplicate MCP v3 call-graph sidecar after Task 4 establishes Publication-bound relationship navigation; Task 4 may make only the navigation-storage plumbing changes needed in overlapping files.
10. `IndexAuthorityCoordinator.schedulePublicationRetention()` still prunes navigation generations independently via `pruneNavigationSidecarGenerations()`. That becomes unsafe/meaningless once navigation is a Publication child: old Publication N must retain `navigation/` for as long as N remains addressable/pinned. Task 4 must remove navigation-specific pruning/retention arguments from that path, while leaving the remaining vector-retention machinery for Task 10 rather than expanding into Publication GC now.

### Task 4 integration result and Task 4A replan

Live WSL integration review accepted Task 4 on the same HEAD. The reviewed production aggregate is 66 tracked files with 3,034 insertions / 10,921 deletions, zero staged files, zero changed test files, and clean `git diff --check`.

Direct review confirmed:

1. `PublicationStore.current.json` is the only production current selector; completed Publications require their local `navigation/`, while partial Publications remain `navigation: null`.
2. Full index and atomic sync stage navigation inside the candidate Publication before one `PublicationStore.activate()` operation.
3. Navigation reads require explicit `publicationId + navigationRoot`; no current-navigation fallback, generation seal, `navigationSealHash`, `artifactSetHash`, SQLite store, runtime backend selector, or independent navigation retention remains in production.
4. Transitional policy/marker navigation equality selects by Publication ID only. Marker manifest hashes are descriptive; effective navigation proof resolves the Publication resource and reads its actual JSON.
5. Malformed Publication-local navigation JSON fails closed as corrupt.
6. Task 3 source/policy/durability/synchronizer invariants remain present, and the Core published-surface collector matches its frozen fixture.
7. The separate MCP v3 `CallGraphSidecarManager` remains present exactly as required for the Task 4A boundary.

The live Task 4A owner is now the duplicate MCP v3 graph lifecycle, not Core Publication navigation. In particular, `call-graph.ts`, `RelationshipBackedCallGraph` rebuild hooks, `CallGraphSidecarInfo` snapshot/config state, provider/shared-runtime manager construction, full-index/sync rebuild hooks, and stale `sidecar` response terminology form the current Task 4A seam. The relationship-backed `build()` path, Python source-backed fallback, coverage evidence, test references, and Core `callGraphBuild` capability must survive.

## Workspace policy

Use the current checkout for Agent C. There is still one implementation writer, so a worktree would add ceremony and would not naturally include the accepted uncommitted Task 0–10 state. The independent Verification Agent V is read-only and may inspect the same checkout concurrently.

Agent C's Task 11 baseline is intentionally dirty:

- HEAD remains `86393ae334adba8213ae33bec6cb9c353482577e`;
- accepted tracked Task 0–10 production diff is 102 files, 4,432 insertions, 27,160 deletions;
- accepted untracked Core production files are `packages/core/src/generation/publication-store.ts`, `packages/core/src/generation/root-mutation-coordinator.ts`, `packages/core/src/generation/root-mutation-runtime.ts`, and `packages/core/src/integration.ts`;
- `docs/plans/2026-08-20-go-calls-v0-promotion-plan.md` is unrelated untracked user/other-agent work;
- this coordination package is untracked coordination input.

Agent C must build on the accepted Task 0–10 state. Do not revert, stash, stage, commit, rename, or rewrite those changes. Do not edit the Go plan or coordination package. If another implementation writer starts touching the same checkout, stop and report the conflict. Read-only verification is not a write conflict.

## Integration policy

No branch integration is required for Wave 13 because Agent C is the sole implementation writer and consumes the accepted Task 0–10 working-tree state directly. There is still no clean commit boundary between tasks; the next planner must rebaseline the real repository rather than attribute the aggregate diff to one mission.

## Execution lifetime policy

Agent C's Task 11 mission is an ordinary bounded coding mission. `persistent-agent-loop` is not required unless the receiving session discovers genuinely long-lived process/wait work.

## Validation policy

Testing is not authorized by this coordination package. Do not create, modify, delete, or run tests during Task 11. Do not run broad package/release suites or use package typecheck as a Wave 13 gate. Source-plan test-only compatibility cleanup remains deferred until test work is explicitly authorized.

Required direct non-test evidence for Wave 13 is defined in `agent-c-remove-current-format-compatibility.md` and includes:

- final production zero sweeps for the pre-clean-break authority formats already retired by Tasks 0–10, without confusing current schema/version identities for compatibility readers;
- complete removal of `MCP_WATCH_DEBOUNCE_MS`, `DEFAULT_WATCH_DEBOUNCE_MS`, deprecated `watchDebounceMs` transport/reporting, installer allowance, current help/contributor text, and active qualification-script inputs;
- a watcher ownership trace proving the watcher remains observation-only after the obsolete debounce configuration is removed;
- direct `search_codebase` schema/tool evidence that `debugMode=full` remains current, `debugCandidateLimit` still requires full diagnostics, and the old `debug:true` alias is rejected/absent;
- deletion of compatibility-only `POTION_INFERENCE_CONTRACT_DIGEST` while current Potion runtime/artifact/semantic identities remain intact;
- causal classification of any remaining explicit `@deprecated` / backward-compatible / compatibility-alias production seams;
- current help/contributor/architecture documentation accuracy without rewriting truthful historical plans/audits/evidence;
- published-surface/import synchronization only if Core exports change, focused parse/import checks where needed, `git diff --check`, accepted/new untracked Core whitespace checks, zero changed tests, zero staged files, and one complete final implementation/config/current-doc diff inspection.

## Future / blocked work

- Tasks 0–11 architecture implementation are complete / verified.
- Final architecture/product qualification is the next separate phase; no broad test/build/release qualification has been run as part of Tasks 0–11.
- Go `calls_v0` promotion remains out of scope until the clean-break architecture is implemented and requalified.
- Stale test-source migration remains a separate explicitly authorized future activity; do not fold it into architecture missions while testing remains prohibited.
- Current tests also still encode pre-clean-break contracts. Keep that as a deferred test-contract migration item until test work is explicitly authorized; do not keep or restore production compatibility merely to satisfy stale tests.

## Status log

- `2026-08-20 / 86393ae3` — Wave 1 coordination materialized. Parallel coding rejected at the initial frontier; Agent A assigned Task 0.
- `2026-08-20 / working tree on 86393ae3` — Agent A verified complete: 26 tracked files, +75/-1856, forensic repair surface removed. Wave 2 unlocked Agent B.
- `2026-08-20 / working tree on 86393ae3` — Agent B report verified against WSL: 34 tracked files, +252/-2289, two new untracked Core owner files, one production Core writer owner, MCP mutation owner deleted, no test files changed, `git diff --check` clean. Wave 3 unlocked as a single-writer Task 2 mission for Agent A (second mission); Agent B remains available but idle for this wave.
- `2026-08-20 / working tree on 86393ae3` — Agent A Task 2 first pass returned incomplete. Review observed 38 tracked files, +665/-3559 plus the accepted two untracked Task 1 Core files. Prepared source/collection capabilities are removed from the MCP full-index boundary and `prepared-change-set-authority.ts` is deleted, but Task 2 remained blocked on public-surface synchronization, activation failure-ordering coherence, the all-file source-text retention regression, and the final direct validation pass.
- `2026-08-20 / working tree on 86393ae3` — Agent A Task 2 second pass reported complete. Review confirmed 38 tracked files, +723/-3560; prepared-boundary searches are clean, published-surface collector matches, `git diff --check` is clean, untracked Core whitespace checks are clean, and lightweight source capture is restored. One Major durability finding remains: post-rename parent-directory fsync failure is currently converted into normal activation success. Task 2 remains in continuation and Task 3 stays locked.
- `2026-08-20 / working tree on 86393ae3` — Agent A Task 2 final durability continuation verified complete: 38 tracked files, +742/-3561. `PublicationStore.activate()` now distinguishes `visible_unconfirmed` from `durable`; complete and partial workflows reconcile only `durable`; the MCP target collection is assigned only after successful Core return. `DURABILITY_CONTROL_FLOW_OK`, published-surface match, prepared-boundary searches, and `git diff --check` all passed. Task 2 accepted. Wave 4 unlocks Agent A Task 3; Agent B remains idle.
- `2026-08-20 / working tree on 86393ae3` — Agent A Task 3 first pass returned incomplete. Live review observed 42 tracked files, +1334/-5857. Publication-owned `source.json`, source-authority cleanup, and atomic-sync PublicationStore activation are substantially implemented, but Task 3 remains open on partial-source coverage semantics, the frozen no-op full-hash cadence, deletion of the unreachable legacy non-atomic sync branch, public-surface synchronization, and the final direct validation pass. Task 4 remains locked; Agent B remains idle.
- `2026-08-20 / working tree on 86393ae3` — Agent A Task 3 second pass reported complete. Live review observed 43 tracked files, +1427/-6133. Partial coverage, immutable source schema, dead-branch deletion, published-surface synchronization, atomic Publication activation, `visible_unconfirmed`, and final selection-control revalidation all checked out. One Major runtime-cache issue remains: a metadata-only no-op changes process-local `fileStats`, making exact `source.json` equality fail on the next sync; the synchronizer is recreated and the process-local full-hash counter can reset indefinitely. Task 3 remains in continuation; Task 4 stays locked and Agent B remains idle.

- `2026-08-20 / working tree on 86393ae3` — Agent A Task 3 final runtime-cache continuation integration-reviewed complete: 43 tracked files, +1523/-6142, no changed tests. Publication-owned `source.json`, partial coverage, atomic sync Publication activation, selection-control gates, `visible_unconfirmed`, and published surface remain valid. Direct metadata-only reproduction returned `METADATA_ONLY_PUBLICATION_CACHE_OK`: the same Publication reused the same synchronizer, interval 3 reached a full hash, the following no-op reused refreshed stats, and a different Publication ID could not reuse the old state. Task 3 accepted. Wave 5 unlocks Agent A Task 4; Agent B remains idle.
- `2026-08-21 / working tree on 86393ae3` — Agent A Task 4 integration-reviewed complete: 66 tracked files, +3034/-10921, zero staged files, zero changed tests, clean diff. Publication-local JSON navigation, one selector, explicit Publication-bound reads, retired pointer/seal/SQLite authority deletion, no independent navigation retention, malformed-JSON fail-closed behavior, Task 3 invariants, and published-surface match were verified against live WSL. Task 4 accepted. Wave 6 unlocks Agent A2 on Task 4A; Agent B remains idle.
- `2026-08-21 / working tree on 86393ae3` — Agent A2 Task 4A first completion report integration-reviewed: 76 tracked files, +3156/-12178, zero staged files, zero changed tests, clean diff. Duplicate v3 graph owner/lifecycle, manager wiring, snapshot typed metadata, and public `sidecar` terminology are removed; relationship-backed Publication traversal and language capabilities are preserved. One Major remains: old v3 snapshot entries retain an unknown `callGraphSidecar` property through load/save because snapshot decoding returns the raw validated object. Direct reproduction returned `retained:true`. Task 4A remains in continuation; Task 5 stays locked.
- `2026-08-21 / working tree on 86393ae3` — Agent A2 Task 4A continuation integration-reviewed complete: 76 tracked files, +3159/-12179, zero staged files, zero changed tests, clean diff. Independent old-v3 snapshot reproduction returned `saved=true`, `inMemoryHas=false`, `diskHas=false`; the retired graph owner/lifecycle remains absent; Publication relationship traversal, the public `graph` response contract, and `callGraphBuild` / `callGraphQuery` remain intact. Task 4A accepted. Wave 7 unlocks Agent A2 Task 5; Agent B remains idle.
- `2026-08-22 / working tree on 86393ae3` — Agent A2 Task 5 first completion report integration-reviewed: 91 tracked files, +3533/-17414, zero staged files, zero changed tests, clean diff. Publication-owned policy/format identity, one-switch activation, durable policy/marker/control deletion, and live control-signature admission are substantially in place. Two Majors remain: exported `vectordb/test-adapter.ts` still imports the deleted `VectorControlRecord` and implements removed control APIs; MCP `completion-proof.ts` parses `PublicationRef`/navigation with a pre-Task-5 shape, causing valid current Publication evidence to return `stale_local / invalid_payload`. Task 5 remains in continuation; Task 6 stays locked.
- `2026-08-24 / working tree on 86393ae3` — Agent A2 Task 5 first continuation integration-reviewed: 93 tracked files, +3527/-17432, zero staged files, zero changed tests, clean diff. The vector adapter/control-record defect and Publication evidence parser shape defect are closed; direct complete/partial Publication proof reproduction now returns valid, `maintainCompletionMarker` / `marker_doc` residue is gone, published surface matches, and accepted Core whitespace checks pass. One Major remains: Core source narrowed `PublicationNavigationProof` to current-only statuses, but MCP `completion-proof.ts`, `prepared-read-cache-owner.ts`, and `search-request-coordinator.ts` still admit/compare retired `requires_reindex` / `unsupported` navigation-proof statuses. Stale Core dist declarations currently mask the source contract mismatch; a regenerated Core declaration surface would expose it. Task 5 remains in continuation; Task 6 stays locked.
- `2026-08-24 / working tree on 86393ae3` — Agent A2 Task 5 final continuation integration-reviewed complete: 93 tracked files, +3525/-17438, zero staged files, zero changed tests, clean diff. MCP navigation-proof parsing/revalidation now matches the current Core `PublicationNavigationProof` union; no production `navigationProof.status` path compares against retired `requires_reindex` / `unsupported`; direct complete and partial Publication proof reproductions return valid; the separate top-level Publication `requires_reindex` result remains intact; retired policy/marker/control authority searches remain clean. Task 5 accepted. Wave 8 unlocks Agent A2 Task 6; Agent B remains idle, and the independent Verification Agent V may continue read-only auditing in parallel.
- `2026-08-24 / working tree on 86393ae3` — Agent A2 Task 6 first completion report integration-reviewed: 93 tracked files, +3641/-17910, zero staged files, zero changed tests, clean diff. Restore/journal ownership is deleted; direct Publication candidate-discard, selector-first clear-failure, startup private-orphan cleanup, and published-surface checks pass. One Major remains in `manage_index clear`: after selector-first clear, a `RemoteCollectionDeletePendingError` response still says `Local index state was not changed`, which is false because Publication authority has already been cleared. Task 6 remains in continuation; Task 7 stays locked.
- `2026-08-24 / working tree on 86393ae3` — Agent A2 Task 6 final continuation integration-reviewed complete: 93 tracked files, +3665/-17914, zero staged files, zero changed tests, clean diff. Direct MCP reproductions confirmed post-selector remote-pending and generic cleanup failures now state that Publication authority is already cleared and expose residual `manage_index clear` retry guidance; neither failure marks SnapshotManager cleared. A pre-selector failure does not claim authority removal. Restore/journal absence, candidate discard, selector-first clear, conservative startup cleanup, published surface, and accepted Core whitespace gates remain valid. Task 6 accepted. Wave 9 unlocks Agent A2 Task 7; Agent B remains idle and Verification Agent V may continue read-only auditing.
- `2026-08-24 / working tree on 86393ae3` — Agent A2 Task 7 first completion report integration-reviewed: 96 tracked files, +3739/-20837, zero staged files, zero changed tests, clean diff. Production proof receipts/coordinator/caches/flights and `index-authority-contract.ts` are gone; ordinary semantic reads reach atomic `PublicationStore.acquireCurrentRead(root)`; MCP search/navigation sessions carry exact Publication leases; stale-while-sync and selection-control admission are structurally preserved; published surface matches. One Major remains in retention cleanup: `Context.pruneUnprovenStagedCollectionFamily()` plus create/reindex preflight still deletes any non-current `__gen_...` collection when `discardUnprovenPayload` is true. Direct reproduction with real `PublicationStore` proved Publication N was actively leased and `isGcEligible(N) === false`, N1 was current, yet preflight cleanup deleted N's vector collection while leaving N's descriptor/lease alive. Task 7 remains in continuation; Task 8 stays locked.
- `2026-08-24 / working tree on 86393ae3` — Agent A2 Task 7 final continuation integration-reviewed complete: 96 tracked files, +3740/-20903, zero staged files, zero changed tests, clean diff. `Context.pruneUnprovenStagedCollectionFamily()` is now conservatively non-destructive. Independent live reproduction held Publication N through `acquireCurrentRead()`, activated N1, invoked create/reindex-style preflight cleanup under a writer lease, and observed `pruned=[]` with N's collection and descriptor still present. Explicit unpublished-candidate failure cleanup remains in `IndexGenerationWorkflow`; proof-family searches remain zero; stale-while-sync gates and the 392-export/60-Context-member published surface remain intact. Task 7 accepted. Wave 10 unlocks Agent C Task 8 with a self-contained mission brief carrying the accepted Tasks 0–7 architecture.
- `2026-08-24 / working tree on 86393ae3` — Agent C Task 8 first completion report integration-reviewed: 99 tracked files, +4219/-25643, zero staged files, zero changed tests, clean diff. SnapshotManager, V1/V2/V3 snapshot formats, snapshot load/save/merge/lock/tombstone/quarantine ownership, and interrupted-snapshot recovery are gone; fresh-process `PublicationStore.listCurrent()` rediscovery works without a snapshot file; sync derives policy/source state from Publications; watcher seeding, public process-lifetime wording, and the 394-export/62-Context-member surface check pass. One Major remains in `MutationLeaseCoordinator.getOperation(root)`: process-local terminal operation state is not invalidated when another Core coordinator advances the same durable root generation. Direct reproduction observed coordinator A still returning failed generation 1 after coordinator B completed generation 2. Because direct Core mutation callers legitimately bypass MCP's runtime-owner registry while sharing the Core mutation fence, `manage_index status` can attach stale operation N to newer Publication state N+1. Task 8 remains in continuation; Task 9 stays locked.
- `2026-08-24 / working tree on 86393ae3` — Agent C Task 8 final continuation integration-reviewed complete: 99 tracked files, +4219/-25643, zero staged files, zero changed tests, clean diff. `MutationLeaseCoordinator.getOperation(root)` now validates cached process-local terminal state against the durable root generation under the existing root lock. Independent reproduction proved terminal N remains visible after release while N is latest, same-coordinator N+1 replaces it, exact active lookup preserves matching operation ID/progress, coordinator A's failed generation 1 disappears after coordinator B advances the same durable root to generation 2, and a fresh coordinator reconstructs no terminal history. Snapshot-family production ownership remains zero, public process-lifetime wording remains correct, and the Core surface still matches at 394 root exports / 62 Context members. Task 8 accepted. Wave 11 unlocks Agent C Task 9 with a self-contained pass-through/public-surface contraction mission.
- `2026-08-25 / working tree on 86393ae3` — Agent C Task 9 first completion report integration-reviewed: 100 tracked files, +4347/-26878, zero staged files, zero changed tests, clean diff. `IndexMutationPort` / `SourceFreshnessPort` forwarding ownership is deleted; MCP no longer imports/transports raw `MutationLeaseCoordinator` / `RootMutationLease`; one shared Core `RootMutationRuntime` owns hidden mutation scope; direct Context mutation and generation-aware operation projection reproduce correctly; legacy write overrides, unscoped synchronizer registration, and `matchesSourceCheckpoint()` are gone; the public allowlist matches at 119 root exports / 8 integration exports with 297 first-party import bindings resolved. One Major remains: `IndexTeardownWorkflowPorts` still requires `clearLegacyWriteCollectionOverride()` and `clearIndex()` still invokes it, while Task 9 removed the implementation and `Context` no longer supplies the port. Direct real `Context.clearIndex()` reproduction throws `TypeError: this.ports.clearLegacyWriteCollectionOverride is not a function`. Task 9 remains in continuation; Task 10 stays locked.
- `2026-08-25 / working tree on 86393ae3` — Agent C Task 9 final continuation integration-reviewed complete: 100 tracked files, +4346/-26879, zero staged files, zero changed tests, clean diff. The obsolete `clearLegacyWriteCollectionOverride` teardown port/call is deleted with no replacement stub. Independent real `Context.clearIndex()` reproduction now completes successfully. Production old-port/source-port/legacy-write/raw-MCP-lease sweeps remain zero; Publication-bound synchronizer registration remains; direct Core mutation and generation-aware operation projection still reproduce; the public surface matches at 119 root exports / 8 integration exports; and 297 first-party Core import bindings resolve. Task 9 accepted. Wave 12 unlocks Agent C Task 10 with a self-contained Publication-vector identity/reader-safe GC mission.
- `2026-08-25 / working tree on 86393ae3` — Agent C Task 10 integration-reviewed complete: 102 tracked files, +4432/-27160, zero staged files, zero changed tests, clean diff. Independent real lifecycle validation confirmed two Contexts sharing one `SharedPublicationRuntime` see the same Publication lease map: pinned N survives N+1 activation and GC, then exact N vector/generation resources are reclaimed after the final lease releases; selector-first clear leaves pinned former-current resources intact and later reclaims them without restoring authority; a default/direct Core owner remains conservatively non-destructive; and exact failed-candidate cleanup remains private. Family-priority/staged-generation authority helpers, transitional prune/preflight APIs, and obsolete vector observation hooks are gone. The surface matches at 118 root exports / 10 integration exports with 300 first-party Core bindings resolved. Task 10 accepted. Wave 13 unlocks the final Agent C Task 11 compatibility/version cleanup mission.
- `2026-08-25 / working tree on 86393ae3` — Agent C Task 11 first completion report integration-reviewed: 111 tracked files, +4490/-27395, zero staged files, zero changed tests. Independent review confirmed retired production authority families, watcher-debounce compatibility, the `search_codebase debug:true` alias, Potion compatibility digest, and explicit clean-break compatibility shims are gone; watcher callbacks remain observation-only; direct schema exercise accepts `debugMode=full` and rejects `debug:true`; the Core surface matches at 118 root / 10 integration exports; and all 300 first-party Core import bindings resolve. One Minor current-facing documentation mismatch remained: `satori-landing/docs/index.html` told users to poll until a “durable operation” reached a terminal state, contradicting the accepted process-lifetime-only mutation projection contract stated by the same page and `manage_index`. Task 11 continued only for that wording correction.
- `2026-08-25 / working tree on 86393ae3` — Agent C Task 11 documentation continuation integration-reviewed complete: 111 tracked files, +4496/-27398, zero staged files, zero changed test sources, clean diff. The landing quick-start now scopes operation polling to the same active runtime, states that mutation phase/progress/error are process-lifetime and not reconstructed after restart, and states that restart status reports durable current Publication state. Independent current-facing stale-contract and production/config Task-11 sweeps are clean. Task 11 accepted. Tasks 0–11 architecture implementation are complete / verified; final architecture/product qualification remains a separate next phase.
