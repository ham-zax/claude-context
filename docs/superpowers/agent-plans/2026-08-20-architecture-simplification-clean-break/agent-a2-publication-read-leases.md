# Agent A2 — Collapse Read Proofs to Publication Leases

**Repository:** `/home/hamza/repo/satori`
**Artifact type:** executable
**Workspace:** current checkout `/home/hamza/repo/satori`
**Isolation reason:** none; one implementation writer in this checkout
**Can start:** immediately after Task 6 integration acceptance
**Depends on:** Tasks 0–6 complete and integration-reviewed in the current working tree
**Execution lifetime:** ordinary bounded coding mission
**Wake strategy:** none
**Developer visibility:** headless

## Read first

- `AGENTS.md` — repository rules and ownership discipline.
- `docs/plans/SATORI_ARCHITECTURE_SIMPLIFICATION_CLEAN_BREAK_PLAN.md` — authoritative source plan, especially Task 7 and the read-lifecycle section.
- `docs/superpowers/agent-plans/2026-08-20-architecture-simplification-clean-break/README.md` — current dependency map, accepted contracts, and validation policy.
- Inspect the current PublicationStore lease API, generation-proof/receipt owners, MCP readiness/prepared-read flow, semantic retrieval path, source-freshness binding, and retention path before editing. The live tree is authoritative if a path named below has moved.

## Objective

Own Task 7 only: replace proof-receipt reconstruction and root-level read gates with one request-bound immutable `PublicationLease`.

The intended normal read lifecycle is:

```text
resolve root / live operation context
        |
        v
PublicationStore.acquireCurrentRead(root)
        |
        v
PublicationLease N
  ├─ Publication ID N
  ├─ exact vector collection for N
  ├─ exact Publication-local navigation for N
  └─ release()
        |
 selection-policy admission
        |
        v
load/cache immutable state by Publication ID N
        |
        v
execute vector/navigation read only from N
        |
 optional final selection-policy admission gate
        |
        v
release N
```

A request that has pinned Publication N remains valid against N even if N+1 becomes current while the request is running. Working-tree source freshness may decide whether to sync, retry, or annotate freshness, but it does not redefine the identity of the pinned Publication.

There must be no normal-read requirement to rebuild a `ProvenVectorGenerationReceipt` / `ProvenGenerationReceipt`, recount exact payload, compare a reconstructed authority observation, or re-prove immutable navigation merely because a selected Publication is being read.

## Accepted baseline

Tasks 0–6 are accepted on:

```text
branch: integrate/language-spine-cbm-go
HEAD:   86393ae334adba8213ae33bec6cb9c353482577e
```

Task 6 final integration acceptance observed:

```text
93 tracked files changed
3665 insertions
17914 deletions
staged files: 0
changed test files: 0
```

Accepted untracked Core owners remain:

```text
packages/core/src/generation/publication-store.ts
packages/core/src/generation/root-mutation-coordinator.ts
```

Preserve the accepted working tree. Do not revert, stash, stage, commit, reset, clean, rename, rewrite, or replace prior work.

A separate read-only Verification Agent V may inspect this same checkout concurrently. It is not an implementation writer and must not be treated as a write-coordination conflict.

## Current live ownership map

The source plan is authoritative. Current inspection adds these concrete facts that matter for a complete Task 7 migration.

1. `PublicationStore.acquireCurrentRead(root)` and `PublicationStore.acquireRead(root, id)` already exist, but currently have **zero production callers**. `acquireCurrentRead(root)` synchronously resolves `current.json` and increments the ID-keyed lease count in one owner operation.

2. The current public/read seam does **not** use that API. `Context.acquirePublicationReadLease(codebasePath)` delegates to `IndexAuthorityCoordinator.acquirePublicationReadLease(canonicalRoot)`, which is a separate root-level reader counter and returns only a release callback. MCP prepares a receipt/current identity first and acquires this generic root lease later. That is the select-then-pin shape Task 7 must eliminate.

3. `packages/core/src/generation/index-authority-coordinator.ts` still owns a large transitional proof system:
   - branded `GenerationProofCoordinator` state;
   - generation proof cache and proof flights;
   - navigation proof flights;
   - prepared receipt weak-map state;
   - proof identity reconstruction;
   - receipt cloning/current-authority checks;
   - exact-proof rebinding after sibling retention;
   - activation proof recording;
   - a separate root-level reader/retention gate.

   Keep only behavior that still has a real owner after Publication leases replace proof authority. Do not preserve the old proof vocabulary as aliases.

4. `packages/core/src/generation/index-authority-contract.ts` is an isolated frozen Phase-4 witness with zero production caller outside itself. It still describes generation-proof caches/flights, proof rebind, and receipt activation. Delete it rather than porting it to the Publication model.

5. `Context.getCurrentPublicationForValidation()` still proves a selected Publication by reconstructing read authority. Its proof path performs live policy/format checks, `hasCollection()`, an exact payload recount, navigation proof construction, current-pointer re-reads, proof-cache lookup/flights, and returns cloned vector/generation receipts plus `exactPayloadRecounts` / `proofSource`. Task 7 must replace this with simple current-Publication admission/readiness data. The immutable selected descriptor is the resource identity; exact payload recount is not a normal-read admission step.

6. The transitional receipt contracts still duplicate Publication state:

```text
ProvenVectorGenerationReceipt
  publicationId
  collectionName
  policy
  exactPayloadCount

ProvenGenerationReceipt
  + navigation
  + navigationObservationToken
```

   Normal read paths should carry a Publication reference/lease and explicit Publication-local navigation address/state instead.

7. `packages/core/src/core/semantic-search-service.ts` is still parameterized by a proof receipt. It calls `proveVectorGeneration()` / `revalidateProvenVectorGeneration()` before retrieval and uses `requestBoundReceipt` as the stale-read escape hatch. Migrate generation-bound semantic retrieval to the exact pinned Publication resource. A pinned read must use `lease.publication.vector.collectionName` and must not be invalidated because another Publication became current.

8. `packages/mcp/src/core/prepared-publication-read-session.ts` preserves useful ordering—prepare, acquire, execute, release—but currently acquires only a generic release callback after readiness has already selected proof state, then calls a final authority revalidation. Do not preserve that select-then-pin shape. Pre-lease preparation may determine a root and live/watcher state, but the request Publication identity for an ordinary read must come from `acquireCurrentRead(root)` itself.

9. `packages/mcp/src/core/prepared-read-cache-owner.ts` currently keys read reuse on reconstructed authority observations and receipt equality, including policy hash, navigation manifest hashes, navigation observation token, and mutation generation. Its warm-hit path can call `revalidatePreparedGeneration()`. Cache immutable Publication/navigation state by Publication ID/address where caching is still useful. Keep watcher/source observations only for sync scheduling/retry or freshness annotation, not for authenticating immutable Publication contents.

10. `packages/mcp/src/core/completion-proof.ts` remains a receipt-cloning parser over `Context.getCurrentPublicationForValidation()`. Task 8 still needs current Publication/status information for SnapshotManager-era lifecycle paths, but it does not need vector/generation receipt reconstruction. Delete or replace this module with the smallest current-Publication admission/readiness contract required by its live callers. Do not move the same proof graph under a new name.

11. `TrackedRootReadiness`, `SearchFrontDoor`, `SearchRequestCoordinator`, navigation handlers, `list_codebases`, and maintenance/status reads still transport receipt-shaped read state and generic root read leases. Migrate ordinary GC-sensitive reads to an exact Publication lease/ref. Diagnostics/status that do not read GC-sensitive Publication resources may use `getCurrent()` without a lease when that is genuinely sufficient.

12. Stale-while-sync currently identifies the readable previous generation through receipt fields. Preserve the product behavior, but make the previous Publication explicit. A stale read must pin/use Publication N and disable current working-tree evidence that could generate, suppress, rewrite, preview, repair, or rerank N's results. Pointer movement to N+1 after N was pinned is not a stale condition.

13. `packages/core/src/sync/source-freshness-port.ts`, `Context.inspect/compare*Source*`, and MCP `SyncManager` still accept optional proof receipts. Remove receipt-based read binding. Publication ID/ref/lease may be used where a request needs an explicit Publication checkpoint address. Source freshness remains evidence for whether to sync/retry/annotate; it is not immutable Publication authenticity.

14. `IndexGenerationWorkflow` still creates and consumes `ProvenGenerationReceipt` after activation, records an activated proof, proves the generation again after retention, resolves a proof identity, and marks prepared receipts. Once proof caches disappear, use the already activated Publication identity/ref and current Publication-owned resources rather than reconstructing a read proof. Do not redesign collection naming or general GC; Task 10 owns that.

15. `IndexMutationPort` still exposes `proveVectorGeneration()` / `proveIndexedGeneration()` and MCP full-index/runtime hooks still call them. Remove or migrate these receipt-specific methods/callers as part of Task 7, but do not delete the entire pass-through port/factory; broad port contraction is Task 9.

16. `ProviderRuntime` still creates a shared `GenerationProofCoordinator`, injects it into every `Context`, and uses `context.proveIndexedGeneration()` in its sync-completion hook. Delete this proof-owner wiring and make the completion check Publication-based. SnapshotManager remains for Task 8.

17. Retention safety is the critical composed invariant. `PublicationStore` tracks ID-keyed leases, but its own runtime GC eligibility is currently conservative unless explicit single-runtime reader coordination is enabled. `IndexAuthorityCoordinator` separately performs vector retention using its old root-level reader gate. Do not migrate reads to Publication leases while leaving retention blind to those leases. The smallest safe Task-7 result may conservatively defer physical historical-Publication/vector deletion until Task 10; do not invent a second lease map or partial replacement proof gate.

18. Current collection naming/family enumeration remains transitional and Task 10-owned. Task 7 may stop proof rebinding/unsafe pruning that conflicts with pinned leases, but must not redesign the collection grammar or broad GC model.

## Ownership

You own:

- deletion of the normal-read `ProvenVectorGenerationReceipt` / `ProvenGenerationReceipt` authority model and its direct production callers;
- deletion of generation proof caches/flights/prepared-receipt state and `GenerationProofCoordinator` production ownership when no longer needed;
- deletion of `packages/core/src/generation/index-authority-contract.ts`;
- a Core read API that exposes the exact `PublicationLease` acquired through `PublicationStore.acquireCurrentRead(root)` for ordinary root-based reads;
- explicit already-pinned Publication-ID read acquisition only where a real continuation/higher-level retained context requires it;
- migration of semantic retrieval, navigation reads, prepared-read/cache state, readiness, and stale-while-sync to Publication identity/resources;
- removal/replacement of receipt-specific completion-proof parsing;
- direct source-freshness and sync caller adjustments required to remove read receipt binding;
- direct `IndexGenerationWorkflow`, `IndexMutationPort`, and ProviderRuntime caller migration required by deletion of proof receipts/coordinator state;
- retention adjustments required so a live Publication lease cannot lose its exact resources during activation/cleanup;
- Task-7-specific Core public-surface synchronization caused by deleted receipt/proof declarations.

Neighboring missions own:

- **Task 8:** `SnapshotManager`, snapshot migration/locks/tombstones/interrupted recovery, and durable status/lifecycle reconstruction;
- **Task 9:** broad pass-through `IndexMutationPort` / `SourceFreshnessPort` factory deletion and intentional public Core surface contraction beyond Task-7-invalidated receipt/proof names;
- **Task 10:** final vector collection naming, exact Publication collection GC enumeration, and general historical Publication/vector GC;
- **Task 11:** current-format-obsolete configuration/version/release cleanup and final qualification.

Do not absorb those missions.

## Coordination contract

### One root read selects and pins atomically

For an ordinary read that begins with a codebase root, the Publication ID must come from the same `PublicationStore.acquireCurrentRead(root)` operation that establishes its ID-keyed lease.

Do not implement:

```text
getCurrent(root)
...async work...
acquireRead(root, id)
```

or:

```text
prepare receipt for current N
...async work...
acquire generic root reader counter
```

Those are the race Task 7 removes.

### A pinned Publication does not become stale because current moved

Once request A holds Publication lease N, activation of N+1 must not invalidate A merely because `current.json`, a current authority observation, or a mutation generation changed.

A later request B that starts from the root after activation should acquire the then-current Publication.

### Selection-policy admission remains fail closed

The immutable Publication's captured control signature must still be admitted against current accepted selection controls before results can escape. Preserve the current Task-5 policy/format boundary without rebuilding receipt identity around it.

Where current semantics require a final fail-closed control check before returning results, preserve that check. Pointer movement alone is not a reason to reject a pinned Publication.

### Source freshness is not Publication identity

Working-tree source freshness may:

- schedule or coalesce sync;
- cause a fresh attempt when product semantics require one;
- annotate/debug freshness;
- decide whether current working-tree evidence is safe to use.

It must not reconstruct or replace the pinned Publication's vector/navigation identity.

### Stale-while-sync is a pinned old Publication

`served_previous_generation` means one immutable old Publication lease, not a receipt that must remain equal to global current authority.

For that mode:

- retrieval uses the pinned Publication's vector collection;
- navigation uses that Publication's navigation tree;
- current-source preview/repair/working-tree evidence remains disabled where it could influence result content or ranking;
- N+1 activation does not invalidate N;
- the lease is released on every exit path.

### Retention must see the real lease

Do not leave a cleanup path that can delete the vector collection or local generation of a live Publication lease.

If exact Task-10 historical GC cannot yet be implemented without absorbing that mission, prefer conservative retention/deletion over a second read-gate abstraction.

### No proof-contract replacement

Do not replace receipts/caches/flights with a new token graph that copies Publication ID, collection, policy, navigation hashes, and observations into another authenticity object. The Publication lease is the read identity.

## Success conditions

Task 7 is complete when all are true:

1. Every ordinary GC-sensitive read beginning from a root obtains its exact Publication ID/resource identity and retention lease through `PublicationStore.acquireCurrentRead(root)` or a direct Core wrapper that performs exactly that operation.
2. `PublicationStore.acquireCurrentRead()` has real production callers; the previous generic `IndexAuthorityCoordinator.acquirePublicationReadLease()` root-reader identity is gone from normal reads.
3. A request holding Publication N remains bound to N across N+1 activation; a later root-starting read acquires the then-current Publication.
4. Stale-while-sync uses an explicit pinned previous Publication and cannot fall back to unpinned current semantic retrieval.
5. Normal read authority no longer uses `ProvenVectorGenerationReceipt` / `ProvenGenerationReceipt` or equivalent cloned proof objects. Any unavoidable residual occurrence must be mutation-only, explicitly justified, and not authenticate a read; prefer deleting the types entirely if all callers migrate.
6. Generation proof caches/flights, prepared receipt weak-map state, proof identity reconstruction, receipt clone/currentness methods, and `GenerationProofCoordinator` ownership are deleted rather than renamed.
7. `packages/core/src/generation/index-authority-contract.ts` is deleted.
8. `Context.getCurrentPublicationForValidation()` or its replacement no longer performs exact payload recount/proof-cache reconstruction merely to admit an immutable current Publication.
9. MCP completion/readiness handling no longer clones vector/generation receipts or exposes `exactPayloadRecounts` / proof-source identity as read authority.
10. Prepared-read/cache currentness for immutable resources is a Publication-ID/resource-address question. Source watcher/mutation observations remain only where needed for freshness scheduling/retry semantics.
11. Semantic retrieval under a Publication lease uses the exact collection from that Publication and does not revalidate against global current authority after N+1 activation.
12. Navigation reads under a Publication lease address the exact Publication-local navigation root; immutable navigation cache entries are keyed by Publication identity/address, not reconstructed proof equality.
13. Selection-control fail-closed admission from Task 5 remains intact before results escape.
14. Source freshness still drives the intended sync/retry/annotation behavior but is no longer bound through proof receipts.
15. Retention/cleanup cannot delete resources of an active Publication lease. General collection naming/GC redesign remains deferred to Task 10.
16. SnapshotManager remains for Task 8, and the broad Task-9 port/public-surface cleanup is not absorbed.
17. Core published surface no longer advertises deleted Task-7 receipt/proof/coordinator contracts if they were previously exported.
18. Accepted Tasks 0–6 behavior remains intact.

## Required direct non-test validation

Testing is not authorized. Do not create, modify, delete, or run tests. Do not run package typecheck, build, broad package suites, or release checks.

After the candidate final state, gather focused non-test evidence only:

1. Production search showing ordinary root reads now reach `PublicationStore.acquireCurrentRead(root)` and no normal read performs current-selection followed by a later separate generic pin.
2. Production search proving `index-authority-contract.ts`, `GenerationProofCoordinator`, generation proof caches/flights, prepared proof receipts, and proof-rebinding read authority have zero production ownership.
3. Production search proving `ProvenVectorGenerationReceipt` / `ProvenGenerationReceipt` no longer drive normal Core/MCP reads; enumerate and justify any residual mutation-only use if the types cannot yet be deleted.
4. Direct temporary-state lease race exercise with real `PublicationStore`:
   - activate Publication N;
   - acquire current read and prove the lease is N;
   - activate N+1 while N is held;
   - prove N's exact Publication/vector/navigation address remains usable and is not cleanup-eligible while leased;
   - acquire a new current read and prove it is N+1;
   - release both leases.
5. Direct semantic-read exercise through the real migrated Core semantic retrieval seam:
   - pin N;
   - activate N+1 before/during retrieval;
   - prove the request queries only N's collection and is not rejected solely because current moved;
   - prove a later root-starting read uses N+1.
6. Direct stale-while-sync coordinator exercise through the real production coordinator path or the narrowest real production entry seam available without running tests:
   - expose a readable previous Publication N during active sync;
   - pin N;
   - activate/surface N+1;
   - prove the stale request finishes on N;
   - prove current working-tree evidence that could alter results/ranking is disabled in the stale mode.
7. Static/direct admission exercise proving selection-control drift still fails closed for a newly admitted response without mutating the pinned Publication.
8. Source-freshness trace proving watcher/checkpoint state still decides sync/retry/annotation but does not authenticate or change a pinned Publication ID.
9. Retention trace/direct exercise proving no cleanup path deletes a vector/local generation used by an active Publication lease. If Task-7 conservatively defers physical cleanup to Task 10, prove that behavior rather than adding another reader registry.
10. Search proving normal reads no longer perform exact payload recount or expose `exactPayloadRecounts` / proof-source reconstruction as authority.
11. If Core public declarations change, run the existing non-test published-surface collector and synchronize `packages/core/contracts/published-surface.json`.
12. `git diff --check`.
13. Output-based trailing-whitespace/final-newline checks for accepted untracked Core owners.
14. Changed-test-file count remains zero.
15. Staged-file count remains zero.
16. Inspect the complete final production diff once after the final production edit.

## Integration continuation finding

The first Task 7 completion report is not yet accepted. Live integration review confirmed the main lease migration, proof-graph deletion, semantic Publication binding, stale-while-sync gates, published surface, and hygiene, but found one Major retention defect.

`Context.pruneUnprovenStagedCollectionFamily()` still classifies every non-current `__gen_...` collection as disposable whenever `discardUnprovenPayload` is true. `manage_index create/reindex` calls that path under a mutation lease before launching the new full-index operation. Every completed Publication collection is also named with `resolveStagedCollectionName(..., publicationId)`, so a superseded but still readable Publication collection is indistinguishable from an unpublished candidate in this cleanup.

Direct integration reproduction used the real `PublicationStore` with single-runtime lease accounting:

- Publication N was current and leased through `acquireCurrentRead()`;
- Publication N1 activated and became current;
- `PublicationStore.isGcEligible(root, "N")` was `false` while N's lease remained active;
- the real `Context.pruneUnprovenStagedCollectionFamily()` path was invoked with `discardUnprovenPayload: true` under a current writer lease;
- it deleted N's `code_chunks_...__gen_N` vector collection anyway while N's descriptor and lease remained live.

This violates the Task 7 invariant that cleanup cannot delete resources named by an active `PublicationLease`. It also makes the claimed conservative deferral to Task 10 incomplete.

Close this seam without absorbing Task 10's general GC redesign:

- make create/reindex preflight cleanup delete only resources that are provably unpublished/private candidates;
- do not infer "unpublished" from `__gen_` naming or "non-current" alone;
- preserve all descriptor-bearing historical Publication collections in Task 7 unless the existing `PublicationStore` lease/ownership state can directly prove a specific resource safe to remove;
- the simplest acceptable Task-7 result is conservative: stop this preflight path from deleting historical Publication collections and leave general historical/vector GC to Task 10;
- preserve unpublished candidate cleanup in the actual candidate failure path, which already knows the candidate Publication ID/collection explicitly;
- do not introduce a second read registry, proof token, collection journal, or new collection naming scheme.

Required continuation verification is narrow and non-test:

1. Re-run a real `PublicationStore` N -> N1 exercise with N leased, then invoke the create/reindex preflight staged cleanup path and prove N's vector collection is retained.
2. Prove a genuinely unpublished/private candidate can still be cleaned by its explicit candidate-owned failure/cleanup path.
3. Re-run the Task 7 production proof-family sweep, atomic lease caller trace, stale-while-sync static gates, published-surface match, `git diff --check`, accepted Core whitespace/final-newline checks, zero changed tests, and zero staged files.
4. Inspect the final production diff once after the final production edit.

Testing, typecheck, build, broad suites, release checks, Task 8, Task 9, Task 10 general GC/naming redesign, Task 11, and Go work remain unauthorized.

## Final integration result

The continuation is accepted. `pruneUnprovenStagedCollectionFamily()` is conservatively non-destructive, so family-wide create/reindex preflight cannot delete a descriptor-bearing historical Publication collection. Independent live integration reproduction held Publication N through `PublicationStore.acquireCurrentRead()`, activated N1, invoked the preflight cleanup under a current writer lease, and observed `pruned=[]` while N's collection and descriptor remained present. The explicit unpublished-candidate failure paths in `IndexGenerationWorkflow` still discard the exact candidate Publication and drop its exact candidate collection.

Final accepted Task 7 baseline: 96 tracked files, +3740/-20903, zero staged files, zero changed tests, clean diff. Production proof-family searches remain zero, stale-while-sync gates remain present, and the published Core surface still matches at 392 barrel exports / 60 Context public members.

Task 7 is complete / verified. Task 8 is owned by Agent C under `agent-c-delete-snapshot-manager.md`.

## Out of scope

- Do not delete or redesign SnapshotManager, snapshot files, snapshot migration, interrupted-index recovery, or durable operation/status history; Task 8 owns those.
- Do not delete the entire `IndexMutationPort` or `SourceFreshnessPort` merely because receipt-specific methods disappear; Task 9 owns broad pass-through contraction.
- Do not redesign collection-family grammar or implement final general Publication/vector GC; Task 10 owns those. Only make retention conservative/safe enough that Task-7 leases cannot lose resources.
- Do not perform Task 11 configuration/release cleanup or final qualification.
- Do not touch the Go `calls_v0` plan.
- Do not edit coordination files.
- Do not create worktrees, branches, commits, stashes, staging operations, resets, cleans, or history rewrites.

## Working style

Use Causal Coding, Clean Migration, and Ponytail principles. Trace one real root-to-read path and one stale-while-sync path end to end before editing. Prefer deleting proof reconstruction and passing the existing `PublicationLease` directly over inventing a replacement read token.

Keep the distinction sharp:

```text
immutable Publication identity/resources -> PublicationLease
live source state -> freshness/sync decision
live selection controls -> fail-closed admission
```

Do not merge these back into one giant proof object.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. workspace, branch, HEAD, tracked aggregate, staged count, changed-test count, and confirmation of no Git history/worktree operations;
3. final Publication read/lease contract and normal root-read acquisition flow;
4. deleted proof receipt/cache/flight/coordinator/witness ownership;
5. semantic retrieval migration and N-to-N+1 pinned-read behavior;
6. stale-while-sync behavior and working-tree evidence restrictions;
7. prepared-read/navigation cache simplification and Publication identity/addressing;
8. source-freshness/policy admission behavior after receipt deletion;
9. retention safety and what remains explicitly deferred to Task 10;
10. direct Task-7 caller changes in `IndexGenerationWorkflow`, `IndexMutationPort`, ProviderRuntime, or SnapshotManager-era code without absorbing later tasks;
11. published-surface changes, if any;
12. direct non-test validation actually performed and observed results;
13. confirmation Tasks 0–6 and Task 8+ boundaries were preserved;
14. unresolved risks/blockers before Task 8.
