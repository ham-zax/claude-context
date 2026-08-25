# Agent C — Simplify Vector Collection Identity and Publication GC

**Repository:** `/home/hamza/repo/satori`
**Artifact type:** executable behavior + Core/MCP integration surface
**Workspace:** current checkout
**Isolation reason:** none; this wave has one implementation writer
**Can start:** immediately after Task 9 integration acceptance
**Depends on:** Tasks 0–9 complete / verified
**Execution lifetime:** ordinary bounded coding mission
**Wake strategy:** none
**Developer visibility:** headless

## Read first

- `docs/plans/SATORI_ARCHITECTURE_SIMPLIFICATION_CLEAN_BREAK_PLAN.md` — Task 10 is authoritative, especially Task 10 itself and the `Reader coordination across processes` section.
- `docs/superpowers/agent-plans/2026-08-20-architecture-simplification-clean-break/README.md` — accepted architecture, dirty-tree baseline, dependencies, and integration policy.
- `AGENTS.md` — repository ownership, scope, and verification rules.
- Current Core/MCP source for Publication leases, collection naming/enumeration, activation, clear, and vector adapters.

Do not depend on conversational context from Agent A/A2/B. Tasks 0–9 are preserved in the current live working tree and summarized below. Treat the WSL repository, source plan, and coordination package as authoritative.

## Objective

Own **Task 10 only**: make vector identity a direct property of one immutable Publication and make historical Publication/vector reclamation reader-safe without rebuilding proof authority.

The target model is:

```text
current.json -> Publication N+1
                  |
                  +-- exact vector collection name
                  +-- source.json
                  +-- navigation/

Publication N lease count > 0
        -> retain N descriptor + N vector collection

Publication N non-current + lease count == 0
        -> eligible for bounded historical GC
        -> drop exactly N.vector.collectionName
        -> remove exactly N generation directory

No collection-family priority is used to decide current authority.
```

Collection-family parsing may remain only where it is useful to enumerate Satori-owned physical resources for cleanup. It must not select, authenticate, or rediscover the current Publication.

## Accepted baseline you inherit

Tasks 0–9 are complete and integration-reviewed. Preserve these facts:

- Forensic repair/salvage authority is deleted; incompatible or unavailable authority requires reindex.
- `PublicationStore.current.json` is the single durable current selector.
- Full-index and atomic-sync candidates are immutable Publications staged privately and selected by one `PublicationStore.activate()` operation.
- Publication-owned `source.json` owns immutable source coverage/freshness baseline.
- Publication-owned JSON `navigation/` is the only navigation/relationship representation.
- `Publication.policy` and `Publication.format` replace the old durable policy document, completion marker/fingerprint, and vector control-record authorities.
- Multi-file rollback/restore journals are deleted. Clear removes Publication authority before physical cleanup and never restores it.
- Ordinary reads atomically select and pin through `PublicationStore.acquireCurrentRead(root)` and hold one `PublicationLease` for the request.
- Stale-while-sync deliberately pins the previous Publication and does not mix current working-tree evidence into that read.
- `SnapshotManager` and its durable lifecycle/status database are deleted; restart state comes from current Publications and live Core mutation state.
- `RootMutationRuntime` is the Core-owned mutation integration boundary. MCP does not own raw `MutationLeaseCoordinator` / `RootMutationLease` capability.
- Task 8 live terminal operation projection is generation-aware and process-local only.
- `IndexMutationPort` and `SourceFreshnessPort` are deleted.
- The Core product root is an explicit allowlist; first-party integration uses the narrow `@zokizuan/satori-core/integration` subpath.
- Legacy write-collection override state, unscoped synchronizer compatibility, and `matchesSourceCheckpoint()` are deleted.

Do not restore any proof receipt, marker, policy document, snapshot database, rollback journal, compatibility adapter, family-priority authority, or cross-package raw mutation lease to implement GC.

## Current accepted working-tree baseline

Repository:
`/home/hamza/repo/satori`

Branch:
`integrate/language-spine-cbm-go`

HEAD:
`86393ae334adba8213ae33bec6cb9c353482577e`

Accepted tracked aggregate after Task 9:
- **100 tracked files changed**
- **4,346 insertions**
- **26,879 deletions**
- **0 staged files**
- **0 changed tests**

Accepted untracked Core production files:
- `packages/core/src/generation/publication-store.ts`
- `packages/core/src/generation/root-mutation-coordinator.ts`
- `packages/core/src/generation/root-mutation-runtime.ts`
- `packages/core/src/integration.ts`

These are accepted production baseline state. Do not delete, revert, replace, stage, or treat them as disposable untracked work.

The unrelated untracked Go plan and this coordination directory are not Task 10 implementation targets.

## Current live Task 10 seams

The source-plan assumptions were rechecked after Task 9. These are the current owners and risks.

### 1. Exact vector identity is already stored in Publication

Every current Publication descriptor contains:

```text
publication.vector.collectionName
```

Reads already use this exact name. `Context.getActiveIndexedCollectionName()` and semantic search resolve the selected Publication rather than ranking collection families.

Full index and atomic LanceDB sync still create candidate names through the old vocabulary:

```text
active family name
    + "__gen_"
    + normalized mutation/publication ID
```

A collection that becomes a completed Publication is therefore still called a "staged" generation by helpers such as `resolveStagedCollectionName()` / `isStagedGenerationCollectionName()`.

Task 10 may simplify/rename this grammar where doing so reduces ambiguity, but do not change names merely for aesthetics. The required invariant is that one Publication has one exact vector collection identity and current authority comes from the Publication descriptor.

### 2. Active/alternate family logic survives only as physical enumeration machinery

`Context.buildCollectionFamilies()` still creates an "active" family based on current hybrid mode and an "alternate" family for the other mode. `collection-family-listing.ts` scans both families.

This no longer selects current vector authority, but it still drives destructive `clearIndex()` physical enumeration. The `IndexGenerationWorkflow` port still declares `buildCollectionFamilies()` / `listRelatedCollectionNames()` even though the workflow no longer uses them.

Remove dead workflow plumbing. If family enumeration remains for clear/GC, express it as Satori-owned physical-resource enumeration, not active-vs-alternate authority priority.

### 3. The current read-lease map is per PublicationStore instance

`PublicationStore` owns the correct ID-keyed lease count and exposes `isGcEligible(root, id)`, but destructive GC is currently disabled unless `singleRuntimeReaderCoordination` is explicitly true.

That conservative gate is correct.

After Task 9, the MCP host shares one `RootMutationRuntime` across local/provider Contexts, but **each Context still constructs its own PublicationStore**. Therefore simply setting `singleRuntimeReaderCoordination: true` on the existing per-Context stores would be unsafe: a lease held by Context A would be invisible to GC initiated through Context B.

Before enabling destructive historical GC for the MCP/shared-runtime path, establish one Core-owned Publication/read-lease runtime owner for that Satori state root and make every participating MCP Context use that same lease map.

Do not add distributed/cross-process reader leases.

### 4. The supported cross-process boundary is already decided by the source plan

The authoritative plan states:

> All readers that participate in destructive publication GC for one Satori state root must be coordinated by the same publication-runtime owner. Independent Core processes concurrently reading that same state root while another process activates/GCs publications are unsupported.

Encode that boundary before destructive GC is enabled.

The default/direct-Core configuration must remain conservative unless the caller explicitly establishes the same supported Publication-runtime ownership boundary. A zero lease count in one arbitrary `Context` is not sufficient evidence that another supported reader cannot exist.

Prefer one shared Core owner, not a second reader registry. If a narrow first-party integration type is required so MCP can construct/share that owner, put it on the existing explicit `./integration` subpath rather than the root product barrel.

### 5. Historical GC is currently disabled

`Context.pruneIndexedCollectionFamily()` is a no-op left from Task 7.

`Context.pruneUnprovenStagedCollectionFamily()` is also deliberately non-destructive because `__gen_...` names cannot distinguish a private candidate from a descriptor-bearing historical Publication.

MCP create/reindex preflight still calls the latter even though it returns `[]`.

Do not make that ambiguous family-wide preflight destructive again. Prefer deleting the dead preflight/wrapper surface once exact candidate cleanup and exact Publication GC own all real cleanup.

### 6. Explicit unpublished-candidate cleanup already exists and must remain exact

`IndexGenerationWorkflow` knows the candidate Publication ID and candidate vector collection. Pre-activation failure discards the exact unpublished generation and drops the exact candidate collection.

That is the correct destructive path for private candidates. Preserve it. Do not replace it with a family scan or naming heuristic.

### 7. Activation currently retains every historical Publication/vector

After N+1 activates, `IndexGenerationWorkflow` intentionally does no physical historical cleanup. That was the safe Task 7 state.

Task 10 must add a bounded exact-Publication GC sweep under the existing Core root mutation authority:

- current Publication is never eligible;
- any Publication with an active read lease is never eligible;
- an eligible historical descriptor provides the exact vector collection name to delete;
- remove the corresponding local generation only after it is safe to retire;
- failure must not change current Publication identity.

Do not infer vector identity by ranking/listing sibling families.

### 8. `clearIndex()` is selector-first but physical deletion is not lease-aware yet

Task 6 correctly made clear remove `current.json` first. After that, `IndexTeardownWorkflow` enumerates the entire related vector family and deletes it.

Task 10 must preserve selector-first clear **and** reader safety. A read lease that already pins the former current Publication must be able to finish after clear removes authority. Clear must not drop that exact vector collection/generation until the lease is released and a later eligible GC sweep reclaims it.

Do not restore current authority merely because physical cleanup is deferred or fails.

### 9. Immediate on-release cross-domain cleanup is not required

Keep the design small. It is sufficient for lease release to make a historical Publication eligible and for the next explicit/bounded GC sweep to reclaim it. Do not invent a callback graph, durable retention queue, timer service, background journal, or cross-domain on-release vector deleter solely to make cleanup instantaneous.

Direct validation should prove:

```text
hold N lease -> activate N+1 -> GC keeps N
release N -> next GC sweep -> N collection + generation are removed
```

### 10. Obsolete LanceDB observation hooks remain

`VectorDatabase.getPublicationObservation()` has no current production consumer.

`getCollectionDataObservation()` is read during atomic sync, but its value is immediately discarded after the Task 7 retention/proof-rebinding deletion.

LanceDB implements both through `currentManifestObservation()`.

If the final caller trace remains this way, delete these obsolete proof/retention observation methods and helper code rather than carrying a proof-rebinding remnant into the final architecture. Keep backend checks that still protect real candidate-fork/search correctness.

### 11. Milvus atomic incremental publication remains unsupported

Both Milvus adapters advertise:

```text
atomicCandidatePublication: "unsupported"
```

Preserve that product restriction. Task 10 must not fake atomic delta publication for Milvus merely to unify naming/GC. Full rebuilds may still build an independent candidate collection and activate a new Publication.

## Ownership

You own:

- exact Publication vector collection identity/naming required by Task 10;
- removal of active/alternate family *authority* semantics and dead family-priority plumbing;
- physical family enumeration only where it remains useful for Satori-owned cleanup;
- one shared Core Publication/read-lease runtime boundary for supported destructive GC;
- wiring all MCP local/provider Contexts to that same Publication/read-lease owner;
- conservative direct-Core behavior when that ownership boundary is not established;
- historical Publication/vector GC after activation and during clear/maintenance where required;
- reader-safe exact-generation cleanup;
- deletion of Task-7 no-op prune/preflight compatibility surfaces if no real caller remains after exact GC;
- deletion of obsolete vector publication/data observation hooks if they remain unconsumed;
- any narrow `./integration` export and public-surface allowlist synchronization strictly required by the new shared Publication runtime owner.

Neighboring work owns:

- **Task 11:** broad current-format compatibility/version cleanup, watcher debounce alias removal, search debug alias removal, Potion deprecated exports, stale version branches, and final architecture docs cleanup.
- Go `calls_v0` promotion remains out of scope until the clean-break architecture is complete.

## Required end state

Task 10 is complete only when all of these are true.

1. Current vector authority is always read from the selected Publication's exact `vector.collectionName`; no collection-family scan/priority selects current authority.
2. One Publication maps to one exact vector collection identity. Naming helpers no longer describe completed Publications as merely private "staged" resources if that terminology still drives behavior.
3. Active/alternate family concepts, if retained at all, are limited to physical Satori-owned resource enumeration for cleanup and cannot change authority identity.
4. All MCP Contexts that participate in destructive GC for one state root share one Core-owned Publication lease map/runtime owner.
5. Destructive historical GC is disabled/conservative when that supported single-Publication-runtime boundary is not established.
6. Do not add distributed reader leases, durable read-lease files, reader heartbeats, retention receipts, or a second reader registry.
7. Historical GC runs under the existing Core root mutation authority and retains the current Publication plus every Publication with an active read lease.
8. GC deletes an eligible historical Publication by the exact vector collection name stored in its descriptor and then removes that exact local generation. Deleting a sibling must never mutate or redefine the current Publication.
9. A pinned old reader survives activation and continues to address its exact vector/navigation/source resources.
10. Releasing the final old lease makes that Publication reclaimable by a subsequent bounded GC sweep.
11. Selector-first `clearIndex()` remains intact. Clear never restores authority, and it does not delete vector/generation resources still pinned by active Publication leases.
12. Explicit unpublished-candidate failure cleanup remains exact and destructive.
13. Ambiguous family-wide create/reindex preflight does not infer "unpublished" from `__gen_` or non-current status. Delete the no-op path if it no longer has a real role.
14. Obsolete retention/proof vector observation hooks are gone if the final caller trace is zero; no replacement proof token is introduced.
15. LanceDB remains the only backend with `collection_fork` atomic incremental publication; Milvus remains `unsupported`.
16. Tasks 0–9 behavior remains intact and Task 11/Go work is not absorbed.
17. No tests are created, modified, deleted, or run.

## Failure ordering

Preserve these rules:

- Candidate failure before activation may delete only the exact private candidate.
- Activation makes N+1 current before historical GC can retire N.
- GC failure after activation does not roll back `current.json` to N.
- If vector deletion of an eligible historical Publication fails, leave enough local Publication metadata to identify/retry that exact cleanup; do not fabricate a new current authority.
- If the Publication-runtime ownership boundary is ambiguous, retain rather than delete.
- Clear removes current authority first; pinned readers may keep historical physical resources after clear until an eligible later sweep.

Choose vector/local generation deletion ordering so a recoverable cleanup failure cannot turn a still-supported read into a broken Publication. Do not solve cleanup errors with restore journals.

## Required direct non-test validation

Testing is not authorized. Do not create, modify, delete, or run tests. Do not run package typecheck, build, broad package suites, release checks, or final product qualification.

After the candidate final production state, gather focused evidence only.

1. **Shared-runtime lease ownership:** construct the real supported shared Publication runtime used by MCP with at least two Contexts sharing it. Prove a lease acquired through Context A is visible to GC eligibility initiated through Context B; do not prove this with two independent lease maps.
2. **Activation retention:** activate Publication N, acquire N through the real atomic current-read API, activate N+1, invoke the real Task-10 GC path, and prove:
   - current remains N+1;
   - N's exact vector collection survives;
   - N's generation directory survives;
   - N+1 resources survive.
3. **Post-release reclamation:** release N's final lease, run the next real GC sweep, and prove N's exact vector collection and local generation are deleted while N+1/current identity is unchanged.
4. **Clear with pinned reader:** hold a lease on current N, run real selector-first clear, and prove current authority is absent while N's exact resources remain readable/present until release; after release, a later GC sweep may reclaim them without restoring current authority.
5. **Conservative unsupported boundary:** construct the default/direct-Core publication owner without the supported shared-runtime GC boundary and prove zero local leases does **not** authorize destructive historical deletion.
6. **Exact candidate cleanup:** force a pre-activation candidate failure through the narrow existing candidate-owned path and prove the exact private candidate collection/generation is removed without family-wide guessing.
7. **Authority trace:** statically/directly prove current semantic/search/navigation/vector selection uses Publication identity and exact `publication.vector.collectionName`, not family priority or sibling enumeration.
8. **Naming/enumeration sweep:** report the final production callers for collection-family helpers. Any surviving active/alternate/family parser must have a cleanup/enumeration role, not an authority-selection role.
9. **Observation sweep:** report final production callers for `getPublicationObservation`, `getCollectionDataObservation`, and Lance manifest-observation helpers; delete them if no real non-proof purpose remains.
10. **Backend capability check:** prove LanceDB still advertises `collection_fork` and both Milvus adapters still advertise `unsupported` for atomic candidate publication.
11. If Task 10 changes the intentional Core root/integration surface, run the existing non-test published-surface collector and synchronize the allowlist. Keep any new first-party integration export narrow and actually consumed.
12. Run a focused source import/parse smoke for changed Core/MCP production modules only if needed to disprove import-shape/syntax mistakes; do not substitute a broad build/typecheck.
13. `git diff --check`.
14. Output-based trailing-whitespace/final-newline checks for all accepted/new untracked Core production owners.
15. Changed-test-file count remains zero.
16. Staged-file count remains zero.
17. Inspect the complete final production diff once after the final production edit.

If a required non-test check would mutate generated build output, do not run it. Use the narrowest read-only/source-level equivalent.

## Out of scope

Do not:

- add cross-process/distributed Publication read leases, liveness files, reader heartbeats, or a lease service;
- restore proof receipts, retention receipts, marker identity, SnapshotManager, or rollback journals;
- make family-name scans an authority fallback;
- restore current authority after clear/GC failure;
- fake Milvus atomic incremental publication;
- perform Task 11's broad compatibility/version cleanup;
- remove watcher debounce compatibility, search `debug:true` alias, Potion deprecated exports, or unrelated old-format branches merely because you notice them;
- touch the Go `calls_v0` plan;
- create, modify, delete, or run tests;
- run typecheck, build, broad package suites, release checks, or final product qualification;
- stage, commit, stash, reset, clean, checkout, create branches/worktrees, or rewrite history;
- edit coordination files.

## Working style

Use Causal Coding, Clean Migration, and Ponytail principles.

Find the owner before adding a runtime. Publication read/retention state belongs to a dedicated Core publication owner, not to MCP and not to a second mutable map in `Context`. `Context` may wire/delegate but must not become the retention state owner.

Prefer deletion and exact descriptor-based cleanup over generalized collection-discovery abstractions. Do not add a new GC journal, retention manager hierarchy, callback mesh, or background scheduler when an explicit bounded sweep is sufficient.

Stop when Task 10's observable contracts pass. Do not continue into Task 11.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. branch, HEAD, tracked aggregate, staged count, changed-test count, and confirmation that no Git/worktree/history operations were performed;
3. final exact vector collection naming/identity contract and the fate of active/alternate/staged family terminology;
4. final shared Core Publication/read-lease runtime boundary and how MCP Contexts share it;
5. conservative behavior for direct Core / unsupported multi-process reader ownership;
6. historical GC owner, trigger points, deletion ordering, and failure behavior;
7. direct proof that pinned N survives N+1 activation and that a later post-release GC sweep removes N without affecting N+1;
8. direct proof that selector-first clear preserves pinned resources and never restores authority;
9. final fate of `pruneIndexedCollectionFamily`, `pruneUnprovenStagedCollectionFamily`, and create/reindex preflight cleanup;
10. final fate of Lance/vector publication/data observation hooks;
11. Lance/Milvus atomic candidate-publication capability result;
12. public/integration-surface changes, if any, and allowlist collector result;
13. direct non-test validation actually run and observed results;
14. confirmation Tasks 0–9 remain intact and Task 11/Go were not absorbed;
15. unresolved blockers/risks before Task 11.


## Final integration acceptance

Task 10 is accepted and closed on the live working tree at HEAD `86393ae334adba8213ae33bec6cb9c353482577e`.

Independent integration review reproduced the supported shared-reader lifecycle through real Core Contexts. Two Contexts sharing one `SharedPublicationRuntime` used the same `PublicationStore`; Publication N remained physically present while leased after N+1 activation, and the next GC sweep after final N lease release removed exactly N's descriptor-named vector collection and local generation without changing N+1. Selector-first clear removed current authority while the former-current Publication remained pinned, then later reclaimed its exact resources after release without restoring `current.json`. A default/direct Core Context without the supported shared Publication runtime remained conservatively non-destructive.

Final accepted production baseline:

- 102 tracked files changed;
- 4,432 insertions / 27,160 deletions;
- zero staged files;
- zero changed tests;
- accepted/new untracked Core production files remain `publication-store.ts`, `root-mutation-coordinator.ts`, `root-mutation-runtime.ts`, and `integration.ts`.

Final integration evidence also reconfirmed:

- current vector authority is the selected Publication's exact `vector.collectionName`;
- old active/alternate/staged family authority helpers and Task-7 prune/preflight APIs are absent from production;
- exact unpublished-candidate failure cleanup remains destructive and generation-specific;
- obsolete `getPublicationObservation`, `getCollectionDataObservation`, and Lance manifest-observation proof hooks are gone;
- LanceDB advertises `collection_fork`; Milvus and Milvus REST remain `unsupported`;
- MCP/CLI still have zero raw `MutationLeaseCoordinator` / `RootMutationLease` boundary;
- the Core surface matches at 118 root exports / 10 integration exports;
- 300 first-party Core import bindings resolve;
- `git diff --check` and accepted/new Core whitespace/final-newline checks pass.

A deliberate misuse case with two independently created `SharedPublicationRuntime` handles for the same state root was also examined. It creates independent lease maps, but the integration contract explicitly excludes that configuration from the supported destructive-GC boundary, and the only first-party host constructs one handle and shares it across every participating Context. No distributed/singleton reader service is required by Task 10.

Task 11 is now the final eligible architecture implementation mission.
