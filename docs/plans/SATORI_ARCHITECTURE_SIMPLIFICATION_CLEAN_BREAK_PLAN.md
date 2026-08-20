# Satori Architecture Simplification Clean-Break Implementation Plan

**Goal:** Replace Satori's current multi-authority publication/proof graph with one immutable publication model, one atomic current-publication pointer, and verification only at real trust or concurrency boundaries.

**Architecture:** Build vector data, navigation data, source freshness state, and the effective index policy as one private immutable publication generation. Activate that generation with one atomic pointer swap under the existing root mutation lease. Readers pin one publication ID for their complete request; old publications remain until their read leases drain, then garbage collection removes their physical resources.

**Tech Stack:** TypeScript/Node.js 22, LanceDB and Milvus vector backends, filesystem-backed local state, MCP runtime, existing Satori language/navigation/indexing pipeline.

## Status and baseline

- **Status:** proposed clean-break follow-on architecture; no production implementation is authorized by this document alone.
- **Repository:** `/home/hamza/repo/satori`
- **Branch reviewed:** `integrate/language-spine-cbm-go`
- **WSL baseline HEAD:** `203cd09dc941`
- **Review source:** the real WSL repository through `mcp-harness-local`, not the GitHub mirror or a ChatGPT-side copy.
- **Current MVCC qualification:** `docs/superpowers/plans/2026-08-15-stale-while-sync-qualification-mvcc.md` Task 7 remains intentionally pending at the time this plan was written. This plan does not mark it complete.
- **Historical architecture source:** `docs/plans/SATORI_HOTSPOT_DECOMPOSITION_PLAN.md` explains how proof owners, ports, compatibility surfaces, and authority coordinators were introduced. This plan intentionally changes that direction where the user has now authorized a clean break.

## Global constraints

- **No backward-compatibility layer.** Do not keep legacy readers, aliases, compatibility façades, dual-format writers, migration adapters, deprecated overloads, or fallback authority paths for the architecture replaced by this plan.
- **Old reconstructable local state may be discarded.** A breaking release may require deleting/rebuilding Satori local index state. Prefer a fresh reindex to migration code.
- **Migrate first-party callers and delete the old contract in the same coordinated wave.** Do not leave permanent old/new paths.
- **Public/internal API breakage is allowed for this refactor.** Narrow the `@zokizuan/satori-core` surface to intentional product APIs instead of preserving accidental internals.
- **Preserve product behavior, not historical machinery.** Stale-while-sync still means one request sees one immutable publication, existing readers survive activation, new readers see the new publication, and cleanup waits for readers.
- **Keep real safety boundaries.** Preserve writer mutation fencing, publication read leases, root/path/symlink safety, stable source-file observation, atomic pointer publication, external asset digests, and backend-specific checks that catch real storage failures. Move the root writer fence to Core with the publication owner instead of leaving publication safety owned by MCP.
- **Preserve exclusion-policy safety.** `.satoriignore`, `.gitignore`, and repository profile/custom-selection changes can remove data from the allowed searchable set. Treat selection-policy drift as a fail-closed read-admission condition until a publication built under the new policy is active, unless the same exclusion can be proven and enforced at read time. Do not downgrade this to ordinary stale-source metadata.
- **Do not confuse SHA-256 with the architectural problem.** Hashing is cheap and useful at real boundaries. The target is to remove duplicate authorities and proof-of-proof chains, not to ban cryptographic hashes.
- **Do not add speculative abstractions.** Prefer one owner and direct calls over new factories, ports, capability registries, or receipt types.
- **Do not broaden this effort into ranking, reranker quality, semantic invalidation, or Go `calls_v0` promotion.** Those remain separate tracks unless a concrete dependency is discovered during implementation.
- **Preserve unrelated work.** Rebaseline HEAD and working-tree status before each implementation wave; do not edit or absorb another agent's unrelated files.

## Why this refactor exists

The current design protects a publication by representing its identity in many places, then repeatedly proving that those representations agree. The same logical publication is encoded through combinations of:

- synchronizer file hashes and Merkle root;
- synchronizer snapshot document digest;
- completion marker and marker run ID;
- index policy hash and policy document digest;
- `CanonicalPublicationBinding`;
- vector collection name and exact payload count;
- navigation generation ID;
- symbol manifest hash;
- relationship manifest hash;
- per-shard hashes;
- navigation artifact-set hash;
- navigation seal hash;
- profile/policy filesystem observation tokens;
- vector publication observation;
- navigation observation token;
- `ProvenVectorGenerationReceipt` and `ProvenGenerationReceipt`;
- process-local proof caches/flights and prepared-receipt registries;
- durable rollback captures and restore journals.

The result is a proof graph. Correctness depends on many pairwise comparisons and on re-proving data that Satori itself just constructed. This is visible in the current WSL code, not merely inferred from naming.

### Current proof graph

```text
repo control files
      |
      v
policy inputs -----> policyHash -----> policy document -----> documentDigest
                                           |                       |
                                           |                       v
source files -> file hashes -> Merkle -> checkpoint -> checkpoint documentDigest
       |                                     |                  |
       |                                     +------------------+
       v                                                        |
vector collection -> completion marker -> navigation binding    |
       |                   |                 |                   |
       |                   v                 v                   |
       |              marker/runId     navigation generation     |
       |                                     |                   |
       |                              symbol manifest hash        |
       |                              relationship hash           |
       |                              shard hashes                |
       |                              artifact-set hash           |
       |                              navigation seal hash        |
       |                                     |                   |
       +------------------ CanonicalPublicationBinding ----------+
                                      |
                                      v
                         Proven*GenerationReceipt
                                      |
                    proof cache / observation identity
                                      |
                                      v
                              MCP prepared read
```

The target removes the graph as the source of authority. A publication is valid because the publication owner built it privately and atomically activated its immutable ID.

## WSL-verified simplification findings

The findings below were rechecked against current WSL HEAD `203cd09dc941`.

### 1. Core and MCP independently verify the same full-index source coverage

- `packages/mcp/src/core/full-index-operation.ts` has `assertCheckpointMatchesIndexedSources()`.
- `packages/core/src/generation/index-generation-workflow.ts` has `assertExactIndexedFileHashesMatchPrepared()`.
- Both compare indexed hashes/counts with the prepared source checkpoint and account for semantic auxiliary files.

**Decision:** Core owns source consumption and candidate construction. Verify this relationship once in Core. MCP must not duplicate the proof.

### 2. Prepared source authenticity is enforced with a process-local `WeakSet`

- `packages/core/src/sync/prepared-change-set-authority.ts` registers `PreparedFileChangeSet` objects in a `WeakSet`.
- `FileSynchronizer` registers a prepared change set.
- `IndexGenerationWorkflow` refuses a prepared object that is not present in the set.
- Git history shows this machinery was added after structural/cloned prepared objects were used to bypass contract assumptions (`284b1979`, `8a7c0be0`, `dd5fb428`).

**Decision:** Do not invent a better authenticity token. Stop passing a forgeable prepared capability across the public workflow boundary. The build owner invokes source preparation directly and owns the result.

### 3. Prepared collection sequencing is enforced with another `WeakSet`

- `IndexGenerationWorkflow.preparedIndexCollectionReceipts` is a `WeakSet<PreparedIndexCollectionReceipt>`.
- `Context.prepareIndexCollection()` creates/registers a one-shot receipt.
- MCP transports the receipt through `IndexMutationPort` and later consumes/discards it.

**Decision:** The same operation owns collection creation, population, finalization, and publication. Remove the prepared-collection receipt capability instead of authenticating workflow sequencing across layers.

### 4. Proven-generation receipts have another process-local authenticity registry

`IndexAuthorityCoordinator` owns:

- generation proof cache;
- proof-flight map;
- navigation-flight map;
- `preparedReceipts: WeakMap<ProvenGenerationReceipt, string>`.

**Decision:** Replace proof-bearing receipt objects with a publication reference/lease whose identity is the publication ID. Do not authenticate copies of state Satori already owns.

### 5. `PreparedReadCacheOwner` reconstructs a publication identity from many other identities

`packages/mcp/src/core/prepared-read-cache-owner.ts` derives cache/currentness identity from combinations of:

- collection name;
- marker run ID;
- policy document digest;
- policy hash;
- navigation generation ID;
- symbol/relationship manifest hashes;
- navigation seal hash;
- navigation observation token;
- vector authority observation;
- mutation generation;
- source observation.

It then revalidates those observations before and after cache use and may invoke generation proof again.

**Decision:** Immutable publication data is cached by `publicationId`. If the request owns a lease for publication N, N does not need to be reconstructed from its component hashes on every read.

### 6. Full-index source handoff re-compares an already-proven generation field by field

`packages/mcp/src/core/source-observation-state.ts` owns checkpoint-observation maps and handoff barriers. `completeHandoff()` compares collection, marker, policy, payload, and observation fields, then proves the vector generation again, verifies the checkpoint again, and checks the registered observation before recording the handoff.

**Decision:** Source freshness remains a separate concept, but its publication join is `publicationId + source observation`, not a structural re-comparison of a full generation receipt.

### 7. Navigation uses a deep integrity chain for a local reconstructable immutable cache

Current navigation storage uses:

- per-file source hashes;
- per-shard content hashes;
- symbol manifest hash;
- relationship manifest hash;
- artifact-set hash;
- navigation generation seal;
- hash of the seal;
- current navigation pointer carrying the hashes;
- read-time re-hashing and cross-checking.

Relevant files:

- `packages/core/src/symbols/sidecar-writes.ts`
- `packages/core/src/symbols/sidecar-lifecycle.ts`
- `packages/core/src/symbols/sidecar-reads.ts`
- `packages/core/src/symbols/sidecar-validators.ts`

**Decision:** Navigation becomes immutable data inside one publication generation. Keep schema/path validation and rebuild on corruption. Remove the separate navigation-current authority and repeated read-time SHA chain. If a generation-level integrity digest is retained, it is diagnostic/storage integrity, not a second authority.

### 8. Navigation delta reuse already uses hard links

`sidecar-writes.ts` uses `fs.promises.link()` to share unchanged immutable symbol and relationship shards between generations.

**Decision:** Preserve immutable hard-link reuse if it materially improves delta cost. Hard-link construction already shares exact bytes; do not re-prove unchanged local shards through an independent authority chain on each read.

### 9. Full-index navigation staging rereads and re-hashes source already captured by the indexing pipeline

`IndexingPipeline.processFileList()` already returns:

- `indexedFileHashes`;
- `symbolRecords`;
- `symbolManifestFiles`;
- `analysisByFile`;
- semantic source text/hashes when required.

But `IndexGenerationWorkflow.stageSymbolRegistryForCompletedIndex()` rereads each manifest source from disk and hashes it again before navigation publication.

**Decision:** Build navigation from the immutable source observations/results produced by the same candidate build. Perform one final source/policy drift check before activation instead of rereading every source to reconstruct trust.

### 10. `sourceHash` and `contentHash` are duplicate source identities in the indexing path

`IndexingPipeline.analyzeIndexedFile()` retains a SHA-256 over read bytes as `sourceHash` and computes another SHA-256 over the decoded UTF-8 source as `contentHash`.

**Decision:** During implementation, inventory consumers and converge on one source-content identity where the two hashes have the same contract. Keep two only if a verified byte-vs-text semantic difference is required.

### 11. The source snapshot carries several overlapping integrity/ownership mechanisms

A generation-scoped synchronizer snapshot currently contains:

- individual file hashes;
- file stats;
- Merkle root over file hashes;
- full snapshot document digest;
- canonical root;
- checkpoint/collection identity;
- marker run ID;
- index policy hash.

The synchronizer additionally uses stat-based observation tokens containing device/inode/size/mtime/ctime plus document digest.

**Decision:** Keep per-file hashes/stats because they directly support change detection. Make the source checkpoint a child of the publication by location/ID. Remove marker/policy ownership fields and duplicate whole-document authority hashes unless a measured fast-comparison need justifies one optional aggregate digest.

### 12. The index policy document is also the active publication pointer

`IndexAuthorityCoordinator.publishResolvedIndexPolicy()` writes `satori_index_policy_v5`, which combines:

- effective policy inputs;
- policy hash;
- vector collection name;
- navigation binding;
- `CanonicalPublicationBinding`;
- control signature;
- policy document digest.

This makes a configuration document part of data-publication authority.

**Decision:** Policy/configuration is an input to a build, not a second publication authority. Capture the effective policy used by a publication inside the immutable publication descriptor. Observe repository control files to decide whether another build is needed; do not invalidate a pinned immutable publication because live config files later changed.

### 13. Policy authority requires tombstone/digest rollback machinery

`packages/core/src/policy/index-policy-document-store.ts` implements temporary writes, fsync, rename, byte capture, SHA digest verification, removal tombstones, tombstone rollback, and tombstone recovery.

**Decision:** Once policy is no longer a separately mutable publication authority, delete the policy-publication store/tombstone protocol. Keep only the repository policy-input reader/resolver needed to build a new publication.

### 14. Two mutable authority files require a durable restore journal

`packages/core/src/generation/restore-transaction.ts` journals restoration of exactly two durable authority artifacts: the policy document and navigation `current.json`. It has `prepared/swapping/committed` phases, desired/expected digests, temporary/displaced files, crash recovery, fsync, ownership validation, and mutation fencing.

`IndexAuthorityCoordinator.restoreDurableIndexAuthority()` orchestrates that restore.

**Decision:** This entire subsystem is a candidate for deletion. A private immutable generation plus one atomic current-publication pointer has simple crash semantics and does not need a two-file authority transaction.

### 15. `publishMutation(callback)` is threaded through many layers

Current Core/MCP passes a mutation-fenced publication callback through Context, ports, synchronizer, navigation lifecycle, policy publication, generation workflow, and MCP operations. Multiple layers independently count callback invocations and reject "published twice" or "returned without publishing" conditions.

**Decision:** The mutation lease remains. Only the publication owner performs the final atomic `activate(publicationId, lease)` operation. Staging components do not receive a publication callback.

### 16. The mutation lease is a real boundary and should remain

`packages/mcp/src/core/mutation-lease.ts` provides cross-process writer exclusion and fences publication by root, generation, operation, process identity, and liveness.

The ownership is misplaced: the lease lives in MCP even though Core owns the mutation APIs. `scripts/trufflehog-experiment.ts` calls `Context.indexCodebase()` directly, demonstrating that Core mutation is not inherently mediated by MCP.

**Decision:** Keep the safety concept but move its owner into Core. After Task 0 removes repair, every Core create/reindex/sync/clear path acquires the same root mutation operation; MCP consumes that Core operation instead of fencing Core from outside. The lease then protects the build and one activation point without publication callbacks threaded through storage owners.

### 17. Reader retention is a real boundary but can be keyed directly by publication ID

`IndexAuthorityCoordinator` currently keeps root-level read gates, staged-publication IDs, retention flags, queues, and proof rebinding.

**Decision:** Keep read leases. Target a simple per-publication reference count/lease set. A non-current publication can be deleted when its lease count reaches zero. GC should not require rebuilding proof identity.

### 18. Index teardown is complex because state has many independent authorities

`packages/core/src/generation/index-teardown-workflow.ts` orders deletion of vector collections, policy document, runtime policy state, navigation, snapshots, synchronizers, ignore state, legacy write target, and profile under a policy mutation lock.

**Decision:** Clearing authoritative index state becomes one current-publication clear under the mutation lease, followed by cleanup of unreferenced physical publications/caches. Configuration state is not publication authority and should not require transactional teardown with index data.

### 19. MCP reparses and reclones Core proof internals

`packages/mcp/src/core/completion-proof.ts` parses completion-marker evidence, validates old/current versions, reconstructs `ProvenVectorGenerationReceipt` / `ProvenGenerationReceipt`, checks policy/document/payload/navigation fields, and reconciles navigation proof status.

**Decision:** MCP should consume a high-level Core publication-read result, not reconstruct Core's internal proof graph. Most or all of `completion-proof.ts` should disappear.

### 20. Interrupted-index recovery exists because MCP lifecycle state can disagree with authority state

`packages/mcp/src/core/interrupted-index-recovery-coordinator.ts` uses stale timers, mutation leases, operation phases, completion-marker proof, and snapshot mutation to decide whether an interrupted `indexing` state can be promoted to `indexed`.

**Decision:** Durable indexed truth comes from `PublicationStore.current(root)`. After restart:

- valid current publication => indexed/searchable;
- no current publication => no indexed authority;
- private/orphan generation => prune when safe.

MCP does not need a second durable index-state database after PublicationStore exists. Active operation/progress is live runtime state; indexed/searchable truth is reconstructed from PublicationStore after restart.

### 21. `SnapshotManager` still carries legacy formats and authority-adjacent state

`packages/mcp/src/config.ts` defines `CodebaseSnapshotV1`, V2, V3 and a union. `packages/mcp/src/core/snapshot.ts` reads/migrates V1/V2, stores clear tombstones, operation receipts, indexing/searchable states, fingerprint data, access gates, corruption quarantine, and cross-process merge state.

**Decision:** Delete V1/V2 readers, compatibility types, and ultimately durable `SnapshotManager` itself. Finding 30 traces the broader deletion: indexed roots come from PublicationStore, indexed paths/policy from the Publication, and active progress from the Core mutation owner.

### 22. Collection families encode authority discovery that a publication pointer should make unnecessary

`packages/core/src/core/collection-naming.ts` maintains active/alternate family names plus staged `__gen_` names. Context scans related collections and applies family priority while looking for a marker that matches policy and navigation proofs.

**Decision:** Give every publication one exact vector collection name derived from root/publication ID and store that name in the immutable descriptor. The current publication pointer selects authority; collection enumeration is for garbage collection, not authority discovery.

### 23. Generation proof cache identity is larger than the state it represents

`IndexAuthorityCoordinator.resolveGenerationProofIdentity()` joins policy/config observations, policy document digest/hash, collection name, navigation binding/observation, and backend publication observation. Proof caching then checks that composite identity again before reuse.

**Decision:** The publication ID is the cache key. Keep a backend data-observation token only if a backend can mutate an allegedly immutable publication outside the publication owner and the token detects that real threat.

### 24. Activation immediately records a proof of the publication just created

`IndexAuthorityCoordinator.recordActivatedGenerationProof()` reconstructs a large receipt and caches it after activation.

**Decision:** Successful atomic activation returns/retains the immutable `Publication` descriptor. There is no separate "prove what I just published" step unless the backend requires an external acknowledgement check.

### 25. Retention has to rebind proof identity after deleting a LanceDB sibling

`rebindGenerationProofAfterRetention()` exists because the broad Lance publication observation includes control-table state that can change when an inactive sibling is deleted even though active collection data is unchanged.

**Decision:** Never make shared collection-list/control metadata part of publication identity. If a backend observation is retained, scope it to the active publication data. GC should not invalidate or rebind an immutable publication merely by deleting another publication.

### 26. `repairIndex()` is a second authority-salvage proof graph

`packages/core/src/generation/index-generation-workflow.ts` currently dedicates about 981 lines to `repairIndex()`. Its `RepairProof` tracks independent evidence for:

- collection selection;
- MCP snapshot fingerprint;
- completion marker;
- runtime fingerprint;
- exact remote payload membership/count;
- stale remote chunks;
- navigation authority.

The repair path enumerates active/alternate/staged collections, classifies marker/fingerprint formats, reloads sealed policy authority, reopens the marker-owned source checkpoint, performs a forced full-hash zero-change observation, proves remote payload stability/membership/cardinality, stages navigation, republishes authority, records a generation proof, proves that new proof again, and schedules retention. `manage_index` exposes this as a separate `repair` action and can return the multi-part `repairProof` object.

**Decision:** Delete forensic authority salvage as a product architecture. Under the Publication model:

- an intact current Publication is authoritative;
- cheap derived caches may rebuild automatically from that Publication when their inputs are intact;
- source convergence is `sync`;
- missing/corrupt authoritative Publication metadata or vector resources requires a fresh `reindex`/new Publication.

Do not keep a user-facing `repair` action merely to preserve the old API. If a truly disposable derived cache can be rebuilt safely from an intact Publication, make that normal load/runtime behavior rather than a proof-bearing mutation operation.

### 27. `index-authority-contract.ts` is frozen architecture ceremony with no production consumer

`packages/core/src/generation/index-authority-contract.ts` freezes the Phase-4 writer, owned/non-owned domains, proof-state source, narrow port types, and authority operation union around `IndexAuthorityCoordinator`. WSL repository search finds no production caller outside that module; its contract test is the consumer that preserves the witness.

**Decision:** Delete the contract witness when the old coordinator is removed. Do not port this frozen decomposition contract to PublicationStore. The new architecture is enforced by actual ownership/dependency direction, not by a parallel type-level description of the previous architecture.

### 28. `PreparedPublicationReadSession` may become a one-function wrapper after proof revalidation disappears

`packages/mcp/src/core/prepared-publication-read-session.ts` currently earns its existence by ordering readiness, lease acquisition, execution, authority revalidation, and exactly-once release across several callers.

**Decision:** Preserve the ordering requirement, not the class. After reads become Publication-ID leases, reassess the final call sites. If the abstraction is only `acquire -> try/finally -> release`, replace it with one small Core `withPublicationRead(...)` operation or direct structured `try/finally`. Do not preserve the generic session class for compatibility.

### 29. Navigation currently maintains two stores even though JSON is still canonical

The current WSL implementation writes canonical JSON navigation sidecars and then imports an additive `navigation.sqlite` copy. `packages/core/src/navigation/runtime.ts` can dual-read JSON/SQLite for parity, can experimentally serve SQLite via `SATORI_NAVIGATION_BACKEND=sqlite`, and falls back to JSON on missing/incompatible SQLite. `packages/core/src/navigation/sqlite.ts` implements the importer, SQLite store, parity validator, and cache path. The accepted relationship/navigation plan explicitly says JSON remains canonical/default and SQLite import failures are warning-only.

This means Satori currently pays for:

- two persisted navigation representations;
- a `NavigationStore` interface with multiple implementations;
- JSON-to-SQLite import after navigation publication;
- parity validation;
- dual-read mode;
- runtime backend selection;
- SQLite-to-JSON fallback;
- shared-runtime identity fields for both experimental flags;
- SQLite cleanup/rebuild paths during restore/publication.

**Decision:** For this simplification, keep one canonical immutable JSON navigation representation and delete the additive SQLite backend/migration machinery. `NavigationStore` becomes one concrete JSON-backed reader (or direct query helpers) rather than an interface/factory preserved for a hypothetical backend switch. If a future measured workload proves SQLite is needed, design it later as the single chosen representation or a separately justified derived index—not as a permanent dual-store compatibility system.

### 30. `SnapshotManager` is a second durable database of publication/lifecycle truth

`packages/mcp/src/core/snapshot.ts` is about 2,052 lines and persists a large parallel view of index state. It owns or stores:

- V1/V2/V3 snapshot format migration;
- codebase indexed/indexing/requires-reindex lifecycle state;
- runtime fingerprint/access-gate state;
- collection name and indexed file count;
- indexed-path manifest;
- ignore rules version/control signature;
- call-graph sidecar metadata;
- durable mutation operation receipts/phases;
- clear tombstones;
- cross-process snapshot lock acquisition/stale-lock breaking;
- merge rules between in-memory and persisted snapshots;
- corrupt snapshot quarantine/replacement handling.

The snapshot is then read by full indexing, sync, maintenance, `read_file`, `list_codebases`, interrupted recovery, handlers, and call-graph publication to reconstruct or gate state that the new Publication model can own directly.

**Decision:** Delete durable `SnapshotManager` rather than migrate it into a smaller parallel authority. Replace its uses with:

- `PublicationStore.listCurrent()` / `getCurrent(root)` for indexed roots and publication metadata;
- the Publication-owned source checkpoint for indexed paths and captured selection policy;
- the live Core root mutation coordinator for active operation ID/generation/phase/progress;
- direct navigation/call-graph state for navigation capability metadata;
- ordinary fresh status derivation after restart.

Do not preserve durable “last operation after restart” receipts unless a separate explicit product requirement justifies a tiny status log later. Losing historical progress/failure metadata on process restart is preferable to retaining a second authority database with locks, merges, tombstones, and recovery semantics.

### 31. The v3 `CallGraphSidecarManager` is a parallel graph build with no production query caller

`packages/mcp/src/core/call-graph.ts` still builds and persists a separate v3 call-graph sidecar from source files. Full index and sync invoke that rebuild path through `RelationshipBackedCallGraph.rebuildForIndex()` / `rebuildForSyncDelta()`, and SnapshotManager stores its metadata.

But WSL production search shows `CallGraphSidecarManager.queryGraph()` has no production caller. Current `call_graph` traversal uses `RelationshipBackedCallGraph` over the canonical relationship-backed navigation store. Even `handlers.ts::loadRegistryValidatedCallGraphSidecar()` is now a stale name: it checks relationship navigation compatibility rather than loading the v3 call-graph sidecar.

The old module also duplicates response-domain types already present in `packages/mcp/src/core/search-types.ts` (`CallGraphDirection`, node/edge/note/test-reference shapes).

**Decision:** Delete the separate v3 call-graph sidecar build/storage/manager and make relationship-backed navigation the only graph authority. Remove its full-index/sync rebuild hooks, snapshot metadata, provider/shared-runtime manager, and duplicate type definitions. Reuse the existing call-graph response types from `search-types.ts` (or move only the minimum neutral shapes there). Rename stale “sidecar” readiness helpers/response metadata where they no longer describe a sidecar.

Keep Core's `callGraphBuild` language capability: relationship builders and Python relationship resolution still use it to decide which languages can contribute graph relationships. The deletion is of the *parallel persisted MCP call-graph sidecar*, not of relationship extraction or the `call_graph` tool.

## Quantitative signal, not a deletion target by itself

At the reviewed WSL head, these selected production files total roughly 14.8k lines:

- `packages/core/src/core/persisted-index-authority.ts` — 764
- `packages/core/src/generation/index-authority-coordinator.ts` — 1,585
- `packages/core/src/generation/index-generation-workflow.ts` — 3,789
- `packages/core/src/sync/synchronizer.ts` — 1,491
- `packages/core/src/sync/snapshot-codec.ts` — 265
- `packages/core/src/symbols/sidecar-reads.ts` — 868
- `packages/core/src/symbols/sidecar-lifecycle.ts` — 624
- `packages/core/src/core/index-mutation-port.ts` — 353
- `packages/core/src/sync/source-freshness-port.ts` — 138
- `packages/mcp/src/core/full-index-operation.ts` — 1,047
- `packages/mcp/src/core/search-request-coordinator.ts` — 2,789
- `packages/mcp/src/core/prepared-read-cache-owner.ts` — 643
- `packages/mcp/src/core/completion-proof.ts` — 503

Selected non-test identity occurrences across Core+MCP are also high: `ProvenGenerationReceipt` 83, `ProvenVectorGenerationReceipt` 111, `indexPolicyHash` 98, `relationshipManifestHash` 96, `symbolRegistryManifestHash` 92, `navigationSealHash` 72, `markerRunId` 59, `documentDigest` 51, and `merkleRoot` 50.

Additional simplification-only machinery reviewed in the second pass includes `packages/mcp/src/core/snapshot.ts` (2,052 lines), `packages/core/src/navigation/runtime.ts` (454), `packages/core/src/navigation/sqlite.ts` (1,223), `packages/mcp/src/core/call-graph.ts` (854), `packages/core/src/generation/index-authority-contract.ts` (145), and `packages/core/src/core/repair-proof.ts` (60). The ~981-line `repairIndex()` workflow is already inside the `index-generation-workflow.ts` count above.

These counts do not prove individual lines are bad. They show that publication identity, dual-store migration, lifecycle persistence, and recovery have spread widely enough that simplifying ownership can remove substantial downstream machinery.

## Target model

### One publication is the unit of truth

```text
              one Core-owned writer lease
                       |
                       v
repo + policy ---> observe once
                       |
                       v
                build Publication N+1 privately
                /          |             \
               /           |              \
        vector collection  source state   navigation
               \           |              /
                \          |             /
                 +---- immutable generation ----+
                              |
                    final drift/backend checks
                              |
                              v
                 atomic current.json swap
                              |
             +----------------+----------------+
             |                                 |
      old readers keep N                 new readers use N+1
             |                                 |
             +-------- GC after leases --------+
```

### Durable layout

Use one current pointer and immutable generation directories. Exact names can follow existing state-root conventions, but the ownership must be this simple:

```text
<SATORI_STATE_ROOT>/publications/<root-key>/
  current.json
  generations/
    <publication-id>/
      publication.json
      source.json
      navigation/
        ...
```

`current.json` is intentionally tiny:

```ts
interface CurrentPublicationPointer {
    version: 1;
    publicationId: string;
}
```

`publication.json` is current-format only:

```ts
interface Publication {
    version: 1;
    id: string;
    canonicalRoot: string;
    createdAt: string;
    status: 'complete' | 'partial';
    policy: {
        profile: 'default' | 'minimal' | 'all-text';
        supportedExtensions: string[];
        effectiveIgnorePatterns: string[];
        controlSignature: string;
    };
    format: {
        indexFormatVersion: string;
        embeddingIdentity: string;
        relationshipVersion: string;
    };
    vector: {
        collectionName: string;
        indexedFiles: number;
        totalChunks: number;
    };
    navigation: null | {
        relativeRoot: 'navigation';
    };
}
```

This shape is intentionally illustrative, not an instruction to add every field exactly as shown. During implementation, keep only values needed to:

1. open the exact immutable resources for a publication;
2. decide current-runtime compatibility;
3. report status/counts;
4. support the next incremental source comparison.

Do not add hashes merely because a previous object had them.

`source.json` contains the per-file source checkpoint needed for change detection. Its authority comes from being inside `generations/<publication-id>/`, not from carrying marker/policy ownership proofs.

### Clean runtime contracts

Prefer these concepts over the current receipt/proof graph:

```ts
type PublicationId = string;

interface PublicationRef {
    id: PublicationId;
    publication: Publication;
}

interface PublicationLease extends PublicationRef {
    release(): void;
}
```

A stale read is not "a currently revalidated receipt for an older marker." It is simply a read lease on immutable publication N while N+1 is being built.

### Build lifecycle

```text
1. acquire the Core-owned root mutation lease
2. observe effective policy + selected source
3. allocate publicationId
4. build a new vector collection for publicationId
5. build source checkpoint and navigation from the same captured source observations
6. finalize vector collection
7. perform the one backend-specific activation check that is actually needed
8. revalidate mutation lease and source/policy observation once
9. fsync the complete local candidate generation and required containing directories
10. write/fsync a temporary current pointer, atomically rename it to current.json, then fsync the pointer's parent directory while the same Core-owned lease is current
11. publish runtime notification / release writer lease
12. GC old unpinned publications asynchronously
```

No component receives a generic cross-layer `publishMutation(callback)`. The Core mutation owner already holds the writer fence when `PublicationStore.activate()` swaps the pointer.

### Read lifecycle

```text
1. atomically resolve + pin the current publication through PublicationStore.acquireCurrentRead(root)
2. receive one immutable PublicationLease containing the exact publicationId/resources retained for this request
3. verify the pinned publication's captured selection-policy signature is still admissible
4. load/cache immutable Publication state by the pinned publicationId
5. execute vector/navigation read only against the pinned publication's resources
6. where current fail-closed policy semantics require it, revalidate the selection-policy admission token before returning results
7. release the PublicationLease
```

Working-tree source freshness may decide whether to schedule sync or annotate freshness, but it must not mutate the identity of a pinned publication. Selection-policy freshness is stricter: a read must be admitted only when the publication's captured selection policy still matches the currently accepted selection policy, or when an equivalent current exclusion gate is applied before any result can escape.

`acquireCurrentRead(root)` is a required atomic retention primitive, not shorthand for `getCurrent(root)` followed later by `acquireRead(publicationId)`. Current-publication resolution and retention pinning must be serialized with activation/GC so there is no window in which N can be selected, N+1 activated, and N deleted before the reader establishes its lease. `getCurrent()` may still exist for diagnostics/status, but normal GC-sensitive reads must not compose the two steps themselves.

### Crash semantics

- Crash before current pointer swap: current publication is unchanged. Candidate resources are orphaned and may be garbage-collected.
- Crash during pointer write: activation uses `write temp -> fsync(temp) -> rename(temp, current.json) -> fsync(parent directory)`, so readers see old or new complete pointer, never a multi-file half-publication, and the rename is durably recorded.
- Crash after pointer swap: pointer references a fully staged immutable generation.
- No policy/navigation two-file rollback transaction is required.
- If explicit operator rollback is ever needed, it is an atomic pointer move to an existing retained publication, not a journal that reconstructs several mutable authority files.

The candidate generation must be durably complete before its ID can become reachable from `current.json`. `PublicationStore.activate()` therefore owns the ordering: finish/fsync required publication-local metadata and directories first, then perform the pointer temp-write/fsync/rename/parent-directory-fsync sequence. A successfully returned activation means both the referenced generation and the current pointer are crash-durable according to that contract.

## Verification model: one check per real boundary

| Boundary | Keep | Remove/simplify |
| --- | --- | --- |
| Repository path safety | root-bound open, no-follow, symlink/escape checks | none |
| One source file changing while read | stable file-handle/stat observation | repeated later rereads solely to rebuild trust |
| Concurrent writers | one Core-owned root writer fence, based on the current `MutationLeaseCoordinator` semantics | MCP-owned mutation authority and publication callbacks threaded through every subsystem |
| Candidate vector writes | backend errors and one activation-time completeness check when backend semantics require it | exact payload recount on ordinary reads/proof reconstruction |
| External downloaded model/runtime | cryptographic artifact digest | none |
| Local immutable publication metadata | current schema/shape/path validation | nested policy/marker/seal/document authority hash chain |
| Navigation local cache | parse/schema/path checks; rebuild on corruption | per-read shard SHA + artifact-set + seal cross-proof unless justified by a concrete corruption threat |
| Activation | fsync private generation + atomic current pointer rename under writer lease | two-file policy/navigation transaction, restore journal, tombstone rollback |
| Read consistency | publication-ID lease | giant receipt equality and observation-token reconstruction |
| Retention | publication ID is non-current and has zero read leases | proof rebind after deleting unrelated sibling resources |
| Source freshness | compare live source to publication-owned checkpoint | marker/policy hashes used to authenticate the checkpoint |
| Selection-policy drift | one current policy/control signature gate at read admission and, where required to preserve current fail-closed semantics, before response publication | policy document as a second durable data authority; giant receipt reconstruction |
| Runtime compatibility | one current-format compatibility description in Publication | legacy fingerprint shapes and relationship-only compatibility/promotion ladders |

## File-level target map

### New or replacement owner

- **Create:** `packages/core/src/generation/publication-store.ts`
  - Own current publication pointer I/O.
  - Load current-format publication descriptors.
  - Atomically activate/clear one publication under Core's root mutation fence.
  - Own publication read-lease counts and current/non-current eligibility.
  - Expose publication lookup by ID for pinned readers.
  - Do not own source scanning, vector writes, or navigation building.

- **Move/replace:** `packages/mcp/src/core/mutation-lease.ts` -> `packages/core/src/generation/root-mutation-coordinator.ts`
  - Preserve the real cross-process root writer exclusion, generation/operation identity, PID/start-time liveness, and stale-lock handling.
  - Make Core the owner because Core owns index mutation and publication activation.
  - MCP may project operation identity into status, but it does not fence Core from outside.

Avoid immediately creating a directory full of publication abstractions. Start with one cohesive owner; split only if the implementation proves a second independent responsibility exists.

### Existing owners to shrink

- `packages/core/src/generation/index-generation-workflow.ts`
  - Remains the candidate builder/orchestrator.
  - Own source observation, vector build, navigation build, final drift check, and call to `PublicationStore.activate()`.
  - Stops constructing completion/policy/publication proof graphs.

- `packages/core/src/sync/synchronizer.ts`
  - Becomes source observation/change detection and publication-owned checkpoint generation.
  - Stops being a separately authenticated publication authority.

- `packages/core/src/core/indexing-pipeline.ts`
  - Remains the single source-read/analyze pipeline.
  - Its source observations feed vector and navigation construction without rereading files.

- `packages/core/src/symbols/sidecar-reads.ts`, `sidecar-writes.ts`, `sidecar-lifecycle.ts`, `sidecar-validators.ts`
  - Remain immutable navigation storage/read code where useful.
  - Remove independent current pointer/seal authority and redundant read-time hashes.

- `packages/core/src/core/context.ts`
  - Remains composition/public product façade only where useful.
  - Delegates to the smaller publication/build owners.
  - Deletes legacy compatibility state and proof reconstruction APIs.

- `packages/mcp/src/core/full-index-operation.ts`, `sync.ts`, `search-request-coordinator.ts`
  - Use high-level publication/build/read APIs.
  - Stop duplicating Core authority/proof logic.

- `packages/mcp/src/core/snapshot.ts`
  - Delete after callers migrate to PublicationStore and the live Core mutation-operation view.

### Strong deletion candidates once callers migrate

- `packages/core/src/sync/prepared-change-set-authority.ts`
- `packages/core/src/core/persisted-index-authority.ts`
- `packages/core/src/generation/restore-transaction.ts`
- `packages/core/src/core/repair-proof.ts`
- the ~981-line forensic `IndexGenerationWorkflow.repairIndex()` path
- `packages/core/src/generation/index-authority-contract.ts`
- `packages/core/src/policy/index-policy-document-store.ts` as publication authority storage
- `packages/core/src/navigation/runtime.ts`
- `packages/core/src/navigation/sqlite.ts`
- `packages/core/src/core/index-mutation-port.ts` if it remains only a forwarding shell
- `packages/core/src/sync/source-freshness-port.ts` if direct cohesive owner methods replace the pass-through factory
- most or all of `packages/core/src/generation/index-authority-coordinator.ts` after read leases move to `PublicationStore`
- `packages/mcp/src/core/completion-proof.ts`
- `packages/mcp/src/core/call-graph.ts` after shared response types move to the canonical call-graph response/type owner
- most or all of `packages/mcp/src/core/prepared-read-cache-owner.ts`
- `packages/mcp/src/core/snapshot.ts` and its V1/V2/V3 snapshot/lock/merge/tombstone/quarantine machinery
- `manage_index action="repair"`, `repairProof`, and the MCP repair handler chain
- proof-promotion portions of `packages/mcp/src/core/interrupted-index-recovery-coordinator.ts` and `indexing-recovery.ts`
- legacy V1/V2 snapshot readers/types
- `Context.setWriteCollectionOverride` and `legacyWriteCollectionOverrides`
- current broad `packages/core/contracts/published-surface.json` compatibility freeze, replacing it only with a deliberately small public surface if an API guard is still desired

## Implementation plan

### Task 0: Delete forensic `repair` before migrating publication ownership

**Files:**
- Delete: `packages/core/src/core/repair-proof.ts`
- Modify: `packages/core/src/context.ts`
- Modify: `packages/core/src/core/context.ts`
- Modify: `packages/core/src/core/persisted-index-authority.ts`
- Modify: `packages/core/src/generation/index-authority-coordinator.ts`
- Modify: `packages/core/src/generation/index-generation-workflow.ts`
- Modify: `packages/core/src/core/index-mutation-port.ts`
- Modify: `packages/mcp/src/tools/manage_index.ts`
- Modify: `packages/mcp/src/core/manage-types.ts`
- Modify: `packages/mcp/src/core/manage-indexing-handlers.ts`
- Modify: `packages/mcp/src/core/manage-maintenance-handlers.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/core/runtime-owner.ts`
- Modify: `packages/mcp/src/core/search-request-coordinator.ts`
- Modify: `packages/mcp/src/core/tracked-root-readiness.ts`
- Modify: `packages/mcp/src/core/search-frontdoor.ts`
- Modify: `packages/mcp/src/core/search-response-helpers.ts`
- Modify: `packages/mcp/src/core/snapshot.ts`
- Modify: `packages/mcp/src/core/tool-response-builders.ts`
- Modify: `packages/mcp/src/core/interrupted-index-recovery-coordinator.ts`
- Modify: `packages/mcp/src/server/provider-runtime.ts`
- Modify: `packages/mcp/src/core/mutation-lease.ts`

**Interfaces:**
- Consumes: existing `sync`, `reindex`, current readiness/status behavior, and ordinary derived-cache load paths.
- Produces: lifecycle API with no `repair` action and no `RepairProof`; incompatible or unprovable authoritative state routes directly to reindex.

**Steps:**
- [ ] Remove `repair` from `MANAGE_INDEX_ACTIONS`, tool schema/description/provider routing, runtime-owner/mutation action unions, readiness/search hints, operation-receipt parsing, handler routing, and response builders.
- [ ] Delete `RepairProof`, `RepairSnapshotEvidence`, `RepairActivatedGeneration`, `RepairIndexResult`, Context repair options/delegates, IndexMutationPort repair methods, and the ~981-line `IndexGenerationWorkflow.repairIndex()` path plus repair-only helpers.
- [ ] Remove `repair_proof_limit`, `repairProof`, and guidance that asks users to run `manage_index repair`; route authoritative uncertainty to `reindex` and source convergence to `sync`.
- [ ] Remove relationship-only compatibility/promotion from normal generation proof. A relationship-version mismatch is an incompatible current Publication/index and requires reindex rather than a special repair path.
- [ ] Keep cheap derived-cache reconstruction only where existing load/runtime code can derive it from already-authoritative exact inputs. Do not add a replacement repair command or proof object.
- [ ] Delete or update contract fixtures/docs that exist only to advertise the removed public `repair` action; do not keep a compatibility alias.

**Acceptance criteria:**
- `manage_index` has no `repair` action.
- Core exports no repair proof/result contract and has no authority-salvage `repairIndex()` workflow.
- No readiness/search/status message recommends repair.
- A relationship/index-format incompatibility routes to fresh reindex.
- This deletion lands before Task 1, so the old repair mutation does not have to be migrated into the new Core mutation owner.

### Task 1: Establish the current-only Publication contract and atomic owner

**Files:**
- Create: `packages/core/src/generation/publication-store.ts`
- Create by moving/reworking the current implementation: `packages/core/src/generation/root-mutation-coordinator.ts`
- Delete after all first-party callers move: `packages/mcp/src/core/mutation-lease.ts`
- Modify: `packages/core/src/generation/contracts.ts`
- Modify: `packages/core/src/core/context.ts`
- Modify: `packages/mcp/src/server/provider-runtime.ts`
- Modify: `packages/mcp/src/server/shared-runtime.ts`
- Modify: `packages/mcp/src/core/full-index-operation.ts`
- Modify: `packages/mcp/src/core/interrupted-index-recovery-coordinator.ts`
- Modify: `packages/mcp/src/core/sync.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/core/vector-backend-maintenance.ts`
- Modify: `packages/mcp/src/core/source-observation-state.ts`
- Modify: `packages/mcp/src/core/manage-indexing-handlers.ts`
- Modify: `packages/mcp/src/core/manage-maintenance-handlers.ts`
- Modify: `packages/mcp/src/core/snapshot.ts`
- Modify: `packages/core/src/index.ts` only if an intentionally public product API is required; otherwise keep Publication internals unexported.

**Interfaces:**
- Consumes: canonical root and state root.
- Produces: current-format `Publication`, `PublicationId`, `PublicationRef`, `PublicationLease`, `getCurrent()`, `getById()`, atomic `acquireCurrentRead()`, `activate()`, `clearCurrent()`, lease/GC eligibility operations, and the one Core-owned root mutation operation used by all mutation paths.

**Steps:**
- [ ] Define one current-only `Publication` descriptor with no legacy union.
- [ ] Move the existing mutation-lease semantics from MCP into Core rather than creating a second writer lock. Migrate create/reindex/sync/clear to that one owner; Task 0 has already removed repair.
- [ ] Ensure direct Core mutation entry points cannot bypass the writer fence. Current non-MCP callers such as `scripts/trufflehog-experiment.ts` demonstrate why publication safety cannot remain MCP-owned.
- [ ] Use one generation directory per publication and one `current.json` pointer per root.
- [ ] Implement candidate descriptor/resource durability before activation; no publication ID may become reachable from `current.json` until every required publication-local file/directory is durably complete.
- [ ] Implement current pointer replacement as `write temp -> fsync(temp) -> atomic rename -> fsync(parent directory)`, matching the durability discipline already used by the current policy/restore code.
- [ ] Put read-lease ownership in the same publication owner initially; key leases by publication ID.
- [ ] Make `PublicationStore.acquireCurrentRead(root)` atomically resolve the current publication and establish its retention lease with respect to activation/GC. Do not implement normal reads as `getCurrent()` followed by a later `acquireRead(id)`.
- [ ] Make `PublicationStore.activate()` perform the pointer replacement while the Core-owned mutation operation is current. Do not pass an MCP publication callback into Core.
- [ ] Do not add a compatibility reader for completion markers, policy v3/v4/v5, navigation current pointers, or existing synchronizer authority.
- [ ] Keep old code live only until first-party callers are migrated in subsequent tasks; do not add adapter code from old formats into Publication.

**Acceptance criteria:**
- One file is the durable selector of current authority.
- Direct Core mutations and MCP-driven mutations share one Core-owned writer-fence owner.
- Publication N remains addressable by ID after N+1 becomes current.
- A candidate that never reaches `activate()` cannot become readable authority.
- `acquireCurrentRead(root)` cannot return a publication that GC can delete before the returned lease is established.
- A successful `activate()` has fsynced both the newly referenced publication state and the parent directory containing the atomically replaced current pointer.
- Destructive GC is disabled or conservative when the supported single publication-runtime ownership boundary for the state root cannot be established.
- The new owner has no dependency on MCP.

### Task 2: Make Core own full candidate construction end to end

**Files:**
- Modify: `packages/core/src/generation/index-generation-workflow.ts`
- Modify: `packages/core/src/core/indexing-pipeline.ts`
- Modify: `packages/core/src/sync/synchronizer.ts`
- Delete: `packages/core/src/sync/prepared-change-set-authority.ts`
- Modify: `packages/core/src/core/context.ts`
- Modify: `packages/mcp/src/core/full-index-operation.ts`
- Modify: `packages/mcp/src/core/manage-indexing-handlers.ts`

**Interfaces:**
- Consumes: Core-owned root mutation operation, policy update, vector backend, source observer.
- Produces: a staged `Publication` candidate and then an activated publication ID/result.

**Steps:**
- [ ] Move source preparation inside the Core build operation instead of accepting a public `PreparedFileChangeSet` capability from MCP.
- [ ] Remove the `WeakSet` authenticity registry and the public prepared-change-set provenance check.
- [ ] Make collection preparation/population/finalization part of the same Core operation; remove `PreparedIndexCollectionReceipt` process-local authenticity where no independent caller remains.
- [ ] Delete MCP `assertCheckpointMatchesIndexedSources()`; retain one source-consumption check in the Core owner while the build path is being simplified.
- [ ] Feed navigation construction directly from `IndexingPipeline` results (`symbolRecords`, manifest files, analysis evidence, semantic sources, indexed source hashes).
- [ ] Stop rereading every full-index source file solely to hash it again before navigation staging.
- [ ] Resolve `sourceHash` versus `contentHash` consumers and keep one identity where they are semantically equivalent.
- [ ] Return publication/build status to MCP; do not return proof-bearing receipts.

**Acceptance criteria:**
- MCP cannot fabricate, clone, or transport a prepared source/collection capability because those capabilities no longer cross the boundary.
- Full indexing has one source observation pipeline and one source-coverage owner.
- Vector and navigation candidate artifacts are derived from the same captured source observations.

### Task 3: Make source freshness a child of Publication

**Files:**
- Modify: `packages/core/src/sync/synchronizer.ts`
- Modify or delete: `packages/core/src/sync/snapshot-codec.ts`
- Modify: `packages/core/src/sync/sync-scan.ts`
- Modify: `packages/core/src/generation/index-generation-workflow.ts`
- Modify: `packages/mcp/src/core/source-observation-state.ts`
- Modify: `packages/mcp/src/core/sync.ts`

**Interfaces:**
- Consumes: current `Publication` and its `source.json` checkpoint.
- Produces: source change set and a compact live-source observation used to decide whether a build/sync is needed.

**Steps:**
- [ ] Persist file hashes/stats in `generations/<publicationId>/source.json`.
- [ ] Remove checkpoint ownership by collection name, marker run ID, policy hash, and checkpoint document digest.
- [ ] Remove Merkle root as authority. Retain an aggregate source digest only if it measurably improves full-tree equality checks; treat it as an optimization, not publication identity.
- [ ] Keep per-file stable-read/path checks and the metadata/hash scan optimization.
- [ ] Replace full-index handoff barriers that structurally compare a proven generation with a simple publication/source observation join.
- [ ] Make source freshness capable of saying "publication N is stale relative to working tree" without making N internally invalid.
- [ ] Keep selection-policy drift separate from ordinary source drift: if the accepted ignore/profile/custom-selection policy changed, block new reads from the old publication until the new policy is represented by the active publication or an equivalent live exclusion gate is proven.

**Acceptance criteria:**
- Source checkpoint ownership is unambiguous from publication directory/ID alone.
- A pinned publication can remain readable while its source checkpoint differs from the live working tree.
- No marker/policy hash is required to authenticate a source checkpoint.

### Task 4: Make navigation subordinate to the publication generation

**Files:**
- Modify: `packages/core/src/symbols/sidecar-writes.ts`
- Modify: `packages/core/src/symbols/sidecar-reads.ts`
- Modify: `packages/core/src/symbols/sidecar-lifecycle.ts`
- Modify: `packages/core/src/symbols/sidecar-validators.ts`
- Modify: `packages/core/src/navigation/store.ts`
- Modify: `packages/core/src/navigation/query.ts`
- Modify: `packages/core/src/navigation/index.ts`
- Delete: `packages/core/src/navigation/runtime.ts`
- Delete: `packages/core/src/navigation/sqlite.ts`
- Modify: `packages/core/src/core/context.ts`
- Modify: `packages/core/src/generation/index-authority-coordinator.ts` while it still exists
- Modify: `packages/core/src/generation/index-generation-workflow.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/server/shared-runtime-identity.ts`

**Interfaces:**
- Consumes: publication generation directory and already-built navigation facts.
- Produces: immutable navigation files addressable by publication ID.

**Steps:**
- [ ] Write navigation directly under the candidate publication generation.
- [ ] Remove the separate navigation `current.json` pointer; `PublicationStore.current()` is the only current selector.
- [ ] Remove navigation seal hash as publication authority.
- [ ] Remove artifact-set hash and per-read shard SHA verification unless a concrete storage-corruption requirement cannot be met by parse/schema validation plus rebuild.
- [ ] Keep deterministic shard names/layout if they are useful for hard-link delta reuse and direct lookup.
- [ ] Keep hard-link reuse for unchanged immutable shards if supported; fail or fall back to full rebuild rather than introducing another compatibility path.
- [ ] Address navigation reads by explicit publication ID, never by a second independently mutable current pointer.
- [ ] Delete the additive `navigation.sqlite` writer/importer, `SQLiteNavigationStore`, parity validator, `RuntimeNavigationStore`, dual-read mode, backend selector, JSON fallback, and `SATORI_NAVIGATION_BACKEND` / `SATORI_NAVIGATION_DUAL_READ` runtime identity inputs.
- [ ] Keep one JSON-backed navigation reader. Remove the multi-implementation `NavigationStore` interface/factory if only one concrete implementation remains; preserve the useful query methods/cache without preserving backend-switch abstraction.
- [ ] Remove SQLite import/rebuild/cleanup calls from Context and durable-authority restoration code instead of translating them to the new Publication model.
- [ ] Delete SQLite/runtime-store contract fixtures that exist only to preserve the retired dual-store experiment.

**Acceptance criteria:**
- Publication N points to exactly one immutable navigation tree.
- Navigation has one persisted representation, not JSON plus a derived SQLite shadow.
- Activating N+1 requires only the publication pointer swap; no navigation pointer mutation participates in activation.
- Corrupt local navigation results in unavailable/rebuild behavior, not a multi-hash authority reconciliation path.

### Task 4A: Delete the parallel v3 call-graph sidecar

**Files:**
- Delete after type migration: `packages/mcp/src/core/call-graph.ts`
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/relationship-backed-call-graph.ts`
- Modify: `packages/mcp/src/core/relationship-evidence.ts`
- Modify: `packages/mcp/src/core/navigation-handlers.ts`
- Modify: `packages/mcp/src/core/search-debug-helpers.ts`
- Modify: `packages/mcp/src/core/tracked-root-readiness.ts`
- Modify: `packages/mcp/src/core/tool-response-builders.ts`
- Modify: `packages/mcp/src/core/python-call-fallback.ts`
- Modify: `packages/mcp/src/core/prepared-relationship-traversal.ts`
- Modify: `packages/mcp/src/core/relationship-continuation.ts`
- Modify: `packages/mcp/src/core/symbol-context-composer.ts`
- Modify: `packages/mcp/src/core/search-request-coordinator.ts`
- Modify: `packages/mcp/src/core/full-index-operation.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/config.ts`
- Modify: `packages/mcp/src/core/snapshot.ts` while it still exists before Task 8
- Modify: `packages/mcp/src/server/provider-runtime.ts`
- Modify: `packages/mcp/src/server/shared-runtime.ts`

**Interfaces:**
- Consumes: Publication-bound relationship navigation and the existing `callGraphBuild` language capability used by relationship extraction.
- Produces: one relationship-backed `call_graph` traversal implementation and one set of call-graph response types.

**Steps:**
- [ ] Move/reuse `CallGraphDirection`, node, edge, note, and test-reference shapes in `search-types.ts`; delete the duplicate v3-sidecar response/type family from `call-graph.ts`.
- [ ] Remove `CallGraphSidecarManager`, `SupportedSourceDeltaPolicy`, source-file recollection/building, v3 sidecar file I/O, and the unused production `queryGraph()` implementation.
- [ ] Remove `RelationshipBackedCallGraph` dependencies on `CallGraphSidecarManager` and SnapshotManager, plus `rebuildForIndex()`, `rebuildForSyncDelta()`, and `commitCallGraphSidecar()`.
- [ ] Remove full-index/sync call-graph rebuild hooks and previous `callGraphSidecar` preservation.
- [ ] Remove `CallGraphSidecarInfo` from MCP config/snapshot/status state, and remove provider/shared-runtime construction/injection of the manager.
- [ ] Rename `loadRegistryValidatedCallGraphSidecar()` to relationship/navigation terminology because it now checks canonical relationship evidence, not a v3 call-graph sidecar.
- [ ] Rename the public traversal response's `sidecar` summary to current graph/traversal terminology; add no compatibility alias for the old field. Treat this as an intentional public contract break and record it in the clean-break release notes/API migration notes.
- [ ] Keep Core `callGraphBuild` language capability and its relationship-builder uses. Do not disable relationship extraction or the `call_graph` tool.

**Acceptance criteria:**
- No production v3 call-graph sidecar is built, loaded, persisted, or mentioned in status.
- Full index and sync publish one graph representation: relationship-backed navigation inside the Publication.
- `call_graph` continues to traverse relationship evidence and source-backed fallbacks where currently supported.
- The `callGraphBuild` capability still controls relationship contribution eligibility; only the duplicate MCP sidecar is gone.

### Task 5: Replace policy/marker authority with the Publication descriptor

**Files:**
- Modify: `packages/core/src/policy/index-policy-runtime-service.ts`
- Modify: `packages/core/src/core/index-policy-input-observer.ts`
- Modify: `packages/core/src/generation/index-generation-workflow.ts`
- Modify: `packages/core/src/core/context.ts`
- Delete after callers migrate: `packages/core/src/core/persisted-index-authority.ts`
- Delete after callers migrate: `packages/core/src/policy/index-policy-document-store.ts`
- Modify: vector control-record code where the completion marker is currently persisted.

**Interfaces:**
- Consumes: live repository policy controls at build time.
- Produces: one effective policy snapshot embedded in the immutable Publication plus a current-runtime compatibility result.

**Steps:**
- [ ] Keep `observeIndexPolicyInputs()` or an equivalent stable control-file observation to capture build inputs.
- [ ] Store the effective policy snapshot with the Publication.
- [ ] Preserve user-supplied `manage_index` custom extensions/ignore patterns as part of the active Publication policy so incremental reconciliation can inherit them. If the product later needs preferences that outlive the index itself, persist them as explicit repository/user configuration—not as publication authority.
- [ ] Revalidate source/policy controls once immediately before activation to reject a candidate built from stale controls.
- [ ] Remove active publication state from the durable policy document.
- [ ] Remove policy document digest from publication/read identity.
- [ ] Replace the current policy-document proof graph with one explicit selection-policy admission rule: publication selection signature must match the accepted current selection signature for new reads, unless the active read layer can enforce the new exclusions equivalently. Preserve the existing fail-closed exclusion semantics by default.
- [ ] Remove completion marker as primary authority. If a backend-local control record is still useful for diagnostics or recovery, make it non-authoritative and keyed to publication ID; otherwise delete it.
- [ ] Collapse the current fingerprint to the minimum current-only compatibility contract. Prefer one `indexFormatVersion` plus embedding identity and any independently upgradable data version that still has a real current product path.
- [ ] Remove legacy fingerprint shapes and relationship-only compatibility/promotion logic. A relationship-version mismatch requires a fresh Publication under the clean-break model.

**Acceptance criteria:**
- Current authority can be resolved without loading a policy document or completion marker.
- Changing `.satoriignore`, `.gitignore`, or repo selection config after activation does not corrupt the immutable publication bytes, but it does block that publication from admission for new reads when the change can alter the allowed searchable set. Existing in-flight behavior must preserve the repository's current fail-closed policy-drift semantics.
- Only the current format is readable.

### Task 6: Delete multi-file rollback/restore transaction machinery

**Files:**
- Delete: `packages/core/src/generation/restore-transaction.ts`
- Remove restore/capture APIs from: `packages/core/src/generation/index-authority-coordinator.ts` or its replacement
- Modify: `packages/mcp/src/core/full-index-operation.ts`
- Modify: `packages/core/src/generation/index-teardown-workflow.ts`
- Modify: `packages/core/src/core/context.ts`

**Interfaces:**
- Consumes: Core-owned root mutation operations, `PublicationStore.activate()` / `clearCurrent()`, and orphan-candidate cleanup.
- Produces: simple crash recovery based on one pointer and immutable candidates.

**Steps:**
- [ ] Delete durable capture of policy + navigation pointer as a rollback snapshot.
- [ ] Delete prepared/swapping/committed restore journal parsing, digest verification, and recovery.
- [ ] Remove policy tombstone rollback paths that existed to coordinate authority deletion.
- [ ] Change candidate failure handling to "discard unpublished candidate"; never restore old authority because old authority was never replaced before activation.
- [ ] Change clear-index authority to atomically clear the current publication under the mutation lease, then clean physical resources.
- [ ] On startup, prune private/orphan publication generations that are not current and not protected by an active lease/recovery rule.

**Acceptance criteria:**
- No authority rollback journal is required for normal full-index/sync failure.
- Failure before pointer swap leaves current publication unchanged.
- Clear operation has one authority mutation rather than a cross-domain transactional deletion order.

### Task 7: Collapse proof receipts and read preparation to publication leases

**Files:**
- Modify/delete large portions of: `packages/core/src/generation/index-authority-coordinator.ts`
- Delete: `packages/core/src/generation/index-authority-contract.ts`
- Modify: `packages/core/src/generation/contracts.ts`
- Modify: `packages/core/src/core/context.ts`
- Delete or replace: `packages/mcp/src/core/completion-proof.ts`
- Delete or radically shrink: `packages/mcp/src/core/prepared-read-cache-owner.ts`
- Modify: `packages/mcp/src/core/prepared-publication-read-session.ts`
- Modify: `packages/mcp/src/core/tracked-root-readiness.ts`
- Modify: `packages/mcp/src/core/search-frontdoor.ts`
- Modify: `packages/mcp/src/core/search-request-coordinator.ts`

**Interfaces:**
- Consumes: `PublicationStore.acquireCurrentRead(root)` for normal current-publication reads. `acquireRead(publicationId)` is only for a publication ID that is already explicitly pinned/retained by a higher-level continuation or equivalent publication-bound context; it must not be used as `getCurrent(root)` followed by a later lease acquisition.
- Produces: a request-bound immutable publication lease and simple readiness/freshness metadata.

**Steps:**
- [ ] Replace `ProvenVectorGenerationReceipt` and `ProvenGenerationReceipt` use in normal read paths with a publication reference/lease.
- [ ] Remove policy/marker/navigation clones from read authority.
- [ ] Remove generation proof caches/flights whose purpose is avoiding repeated reconstruction of the same publication proof.
- [ ] Delete the frozen Phase-4 `index-authority-contract.ts` witness and its old writer/owned-domain/proof-state operation vocabulary instead of porting it to PublicationStore.
- [ ] Cache immutable loaded publication/navigation state directly by publication ID where caching is still useful.
- [ ] Make prepared-read cache currentness a publication-ID question; retain source freshness/mutation-generation data only for deciding whether to schedule/retry sync, not for proving immutable publication contents.
- [ ] Preserve the useful ordering behind `PreparedPublicationReadSession`—prepare, acquire lease, execute, release—but do not preserve the class automatically. After callers converge on Publication leases, replace it with a small Core `withPublicationRead(...)` helper or direct `try/finally` if that is all that remains. A lease on immutable publication N remains valid even if N+1 became current while the request ran.
- [ ] Ensure stale-while-sync uses the prior publication lease deliberately and disables working-tree evidence exactly as the existing behavioral contract requires.

**Acceptance criteria:**
- One request holds one publication ID from start to finish.
- Every ordinary read that begins from a root obtains that ID and its retention lease through one atomic `acquireCurrentRead(root)` call.
- Activation during a request does not make that request's publication lease stale.
- No read performs exact payload recount, marker comparison, policy-document digest comparison, or navigation seal re-proof merely to use an already-pinned immutable publication.

### Task 8: Delete durable MCP SnapshotManager and derive status from real owners

**Files:**
- Modify: `packages/mcp/src/config.ts`
- Delete: `packages/mcp/src/core/snapshot.ts`
- Delete: `packages/mcp/src/core/interrupted-index-recovery-coordinator.ts`
- Delete: `packages/mcp/src/core/indexing-recovery.ts`
- Modify: `packages/mcp/src/server/provider-runtime.ts`
- Modify: `packages/mcp/src/server/shared-runtime.ts`
- Modify: `packages/mcp/src/tools/types.ts`
- Modify: `packages/mcp/src/tools/list_codebases.ts`
- Modify: `packages/mcp/src/tools/read_file.ts`
- Modify: `packages/mcp/src/core/full-index-operation.ts`
- Modify: `packages/mcp/src/core/vector-backend-maintenance.ts`
- Modify: `packages/mcp/src/core/sync.ts`
- Modify: `packages/mcp/src/core/manage-maintenance-handlers.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/core/manage-indexing-handlers.ts`
- Modify: `packages/mcp/src/core/relationship-backed-call-graph.ts`

**Interfaces:**
- Consumes: `PublicationStore.listCurrent()` / `getCurrent(root)`, Publication source/policy/navigation metadata, and the Core root mutation coordinator's live operation state.
- Produces: status/list/read admission derived from current Publication plus live in-process operation progress. No separate durable lifecycle database.

**Steps:**
- [ ] Delete `CodebaseSnapshotV1`, V2, V3, `CodebaseSnapshot`, snapshot migration readers/mappers, `SnapshotManager`, snapshot locks, stale-lock breaking, merge rules, clear tombstones, corruption quarantine, and snapshot save/refresh APIs.
- [ ] Move any still-useful live operation projection (`id`, generation, phase, progress, error) onto the Core root mutation coordinator or a process-local view of that same operation; do not persist a second copy to disk.
- [ ] Make `list_codebases` enumerate current Publications plus live operations rather than reading a snapshot registry.
- [ ] Make `read_file`/search tracked-root admission ask the Core publication/read owner directly rather than trusting snapshot status rows.
- [ ] Make sync read indexed paths and captured selection-policy state from the Publication-owned source/policy data instead of `indexManifest`, ignore-rule version, or ignore-control-signature snapshot fields.
- [ ] Make full-index/sync/maintenance progress update the live Core mutation operation rather than repeatedly saving snapshot phases.
- [ ] Read navigation/call-graph capability metadata from the actual current Publication navigation state; remove snapshot copies of call-graph sidecar metadata.
- [ ] On restart, enumerate current Publications to restore watchers/tracked roots. An orphan candidate is handled by PublicationStore GC; there is no stale `indexing` row to repair or promote.
- [ ] Accept that completed/failed operation history is not durable across restart. Do not add a replacement status-log file in this refactor.
- [ ] Treat the loss of persisted post-restart operation receipts as an intentional public behavior change: today `manage_index status` advertises that it can return the latest persisted operation after restart. Update the public tool description/release notes so the new process-lifetime operation semantics are explicit rather than an accidental regression.

**Acceptance criteria:**
- No MCP code reads or writes the old codebase snapshot file.
- Indexed/searchable/tracked-root truth after restart is derived from PublicationStore.
- Active progress is live mutation state, not a cross-process merged snapshot record.
- Snapshot V1/V2/V3 migration, lock, merge, tombstone, quarantine, and interrupted-promotion code is gone.
- Public `manage_index status` documentation no longer claims persisted operation history survives process restart.

### Task 9: Collapse pass-through ports and intentionally shrink the Core surface

**Files:**
- Delete or replace: `packages/core/src/core/index-mutation-port.ts`
- Delete or replace: `packages/core/src/sync/source-freshness-port.ts`
- Modify: `packages/core/src/core/context.ts`
- Modify: `packages/core/src/index.ts`
- Modify or replace: `packages/core/src/core/published-surface.ts`
- Modify or delete: `packages/core/contracts/published-surface.json`
- Modify first-party imports in `packages/mcp/src/**` and `packages/cli/src/**` as required.

**Interfaces:**
- Consumes: cohesive Core owners/operations.
- Produces: deliberately small public product API and direct first-party integration.

**Steps:**
- [ ] Remove `IndexMutationPortDependencies -> IndexMutationPort -> one-line forwarding factory` if it still adds no policy/behavior after previous tasks.
- [ ] Remove `SourceFreshnessPort` forwarding factory if source freshness now has one concrete owner with direct high-level operations.
- [ ] Let MCP call a small cohesive Core API instead of transporting primitive callbacks and proof receipts.
- [ ] Remove MCP ownership of `MutationLeaseCoordinator`; MCP requests/observes Core mutation operations instead of fencing Core from outside.
- [ ] Delete `Context.setWriteCollectionOverride` and `legacyWriteCollectionOverrides`.
- [ ] Stop exporting prepared receipts, authority internals, mutation ports, source-freshness ports, persisted-authority parsers, and proof types from the main Core barrel.
- [ ] Remove the old broad published-surface compatibility freeze. If an API guard is still valuable, replace it with a small allowlist containing only intentionally supported product APIs.
- [ ] Migrate all repository callers in this wave; add no adapters for removed names.

**Acceptance criteria:**
- No first-party code uses removed compatibility façades.
- The public Core barrel no longer exposes internal publication mechanics merely because older releases did.
- Production forwarding wrappers that only mirror another interface are gone unless they enforce a real boundary.

### Task 10: Simplify vector collection identity and publication GC

**Files:**
- Modify: `packages/core/src/core/collection-naming.ts`
- Modify: `packages/core/src/core/collection-family-listing.ts`
- Modify: `packages/core/src/vectordb/lancedb-vectordb.ts`
- Modify: Milvus adapters only where naming/GC behavior requires it.
- Modify: `packages/core/src/generation/publication-store.ts`
- Modify: `packages/core/src/generation/index-generation-workflow.ts`

**Interfaces:**
- Consumes: root key + publication ID.
- Produces: exact vector collection name for one publication and GC enumeration.

**Steps:**
- [ ] Derive or record one exact collection name per publication.
- [ ] Remove active-vs-alternate family priority as authority selection.
- [ ] Keep prefix/family parsing only to enumerate Satori-owned resources for GC if needed.
- [ ] Make GC retain current publication and every publication with an active read lease; delete other vector collections/generation directories.
- [ ] Stop using broad Lance control-table/list observations as publication identity. If a backend mutation observation remains useful, use the active collection's data observation only.
- [ ] Remove retention proof rebinding after sibling deletion.
- [ ] Preserve the current product restriction that incremental atomic publication is available only where the backend can build an independent candidate safely; do not fake atomic delta support for Milvus.

**Acceptance criteria:**
- Current vector authority is obtained from Publication, not by scanning/priority-ranking collection families.
- Deleting an unrelated old publication cannot make the current publication's identity change.
- Old pinned readers prevent deletion of their exact collection and local generation.

### Task 11: Remove current-format-obsolete compatibility/version machinery

**Files:**
- Sweep: `packages/core/src/**`, `packages/mcp/src/**`, `packages/cli/src/**`
- Update architecture docs under `docs/` that describe the old authority model as current.

**Interfaces:**
- Consumes: final target contracts from Tasks 1-10.
- Produces: one current contract per subsystem.

**Steps:**
- [ ] Remove completion-marker v1/v2 readers and version classification.
- [ ] Remove policy v2/v3/v4 readers and `requires_reindex` branches that exist only to classify those formats.
- [ ] Remove legacy fingerprint field shapes and `legacy_unverified_fingerprint` migration state.
- [ ] Confirm SnapshotManager V1/V2/V3 symbols are gone after Task 8; do not leave dead format types in `packages/mcp/src/config.ts`.
- [ ] Remove `Context.setWriteCollectionOverride` / `legacyWriteCollectionOverrides` rather than preserving the documented compatibility stub.
- [ ] Remove the ignored `MCP_WATCH_DEBOUNCE_MS` compatibility input, `DEFAULT_WATCH_DEBOUNCE_MS` alias, installer-managed-env allowance, help text, and qualification-script fixtures; watcher observation-only behavior does not use that knob.
- [ ] Remove the `search_codebase debug:true` compatibility alias and its argument-combination branches; keep `debugMode` as the one current diagnostics contract.
- [ ] Remove the deprecated `POTION_INFERENCE_CONTRACT_DIGEST` export, which has no production consumer beyond the published-surface compatibility fixture; retain the current semantic/artifact identity contracts.
- [ ] Delete any navigation `primaryStore`/`fallbackStore` compatibility aliases if Task 4 has not already deleted `navigation/runtime.ts` entirely.
- [ ] Search for other explicit `@deprecated`, `backward-compatible`, `compatibility alias/stub`, and `kept for existing imports` production seams. Delete only seams whose sole purpose is old-call compatibility; do not remove a currently documented product option merely because its implementation has historical commentary.
- [ ] Remove tests/fixtures whose only purpose is preserving deleted compatibility contracts; do not replace them with equivalent compatibility tests.
- [ ] Remove dead helper functions, receipt clone/equality helpers, proof cache APIs, and obsolete error types left after caller migration.
- [ ] Update current architecture documentation to describe Publication as the sole data authority.

**Acceptance criteria:**
- Repository search finds no production legacy reader for the deleted authority formats.
- No production code maintains old and new publication paths simultaneously.
- Repository search finds no explicit compatibility alias/stub retained solely to preserve a removed internal/public contract in the refactored surface.
- A fresh index is the only supported upgrade path from the pre-refactor local state.

## Inherited behavioral contract and verification strategy

This plan simplifies *how* correctness is established; it does not weaken the observable MVCC behavior already specified by `docs/superpowers/specs/2026-08-15-concurrent-published-reads-during-sync-design.md`.

The final implementation must continue to prove these product-level facts:

1. a healthy published generation remains readable while a new generation builds;
2. `acquireCurrentRead(root)` atomically resolves and pins one immutable publication, including the race where activation/retention starts concurrently;
3. one search request reads exactly one immutable publication;
4. five parallel stale reads can use the same prior publication during an active sync;
5. activation makes a distinct new publication current for new requests;
6. a reader already pinned to the old publication survives activation;
7. the old publication is not physically removed until its readers release it;
8. destructive GC refuses or conservatively retains old publications when the supported single-publication-runtime ownership boundary cannot be established;
9. stale reads do not mix working-tree/current-source evidence with the pinned publication;
10. activation durability proves the candidate is complete before reachability and the current-pointer rename is followed by parent-directory fsync;
11. after activation, a query for uniquely changed source proves the new publication is actually being searched.

Do not recreate the old internal proof tests merely because their symbols disappear. Reuse or adapt product/integration oracles to the new Publication contract. Internal tests that only assert legacy schemas, giant receipt shapes, pairwise hash equality, or compatibility façades should be deleted with those contracts.

At final qualification, inherit the repository's relevant exact-head gates rather than inventing a second verification framework. In particular, the stale-while-sync product characterization remains the strongest end-to-end oracle:

```bash
pnpm --filter @zokizuan/satori-mcp exec tsx ../../scripts/trufflehog-mvcc-product-run.ts
```

Use the normal workspace/package/release checks required by the repository at the candidate final state. During implementation waves, prefer the narrowest existing check that catches the actual boundary changed; do not add repetitive verification at every layer.

## Clean-break rollout

This architecture intentionally does not migrate old local authority formats.

The breaking release/runbook should state:

```text
Old Satori local index/publication state is not compatible with this release.
Remove/reinitialize the local Satori state and perform a fresh index.
```

Do not add code that translates old completion markers, policy documents, synchronizer snapshots, navigation pointers, proof receipts, or MCP snapshots into the new Publication model.

If package consumers outside this repository depend on internal exports removed here, that is an intentional breaking API change and should be released accordingly; do not restore adapters inside the architecture to avoid a major-version break.

Also call out these user-visible contract changes explicitly in the breaking release notes:

- `manage_index status` no longer promises a durable completed/failed operation receipt after process restart; live operation state comes from the current Core mutation owner.
- `call_graph` no longer exposes the legacy `sidecar`-named traversal summary after the v3 sidecar is deleted; the replacement field uses relationship/navigation/graph terminology with no compatibility alias.

## Execution ordering and stopping rules

1. Finish or explicitly supersede the current exact-head Task 7 qualification before claiming the old MVCC branch complete. Do not rewrite its historical receipts.
2. Rebaseline this plan against current WSL HEAD before implementation; another agent may have moved the branch since `203cd09dc941`.
3. Execute one ownership-bounded wave at a time.
4. Within a wave, migrate every in-scope caller and delete the old path before stopping.
5. Do not carry temporary compatibility adapters across waves. If a temporary bridge is mechanically required inside one uncommitted wave, delete it before that wave is considered complete.
6. Do not create a new abstraction merely to preserve an old boundary. Prefer direct ownership.
7. Inspect the final diff of each wave for dual authority paths, legacy branches, and duplicated checks.
8. Stop a wave when its target owner is singular and the old owner/path is gone; do not opportunistically clean unrelated subsystems.

## Risks that must shape implementation

### Remote vector storage

A local atomic pointer does not make a remote vector service transactionally perfect. Candidate collections remain private until activation, but the builder may still need one exact completeness/readiness check before the pointer swap. Keep that check backend-specific and once-per-activation. Do not make every read recount payload as compensation.

### LanceDB shared physical files

Lance candidate collections and navigation deltas use hard-link/COW-style reuse. GC must not remove physical resources still referenced by a retained publication. Existing per-publication collection/directory ownership plus filesystem hard-link semantics should make this tractable, but implementation must verify deletion ownership rather than assuming every inode is unique.

### Partial/limit-reached indexes

The current product exposes `limit_reached`. The Publication descriptor must state whether a partial publication is searchable and whether navigation is absent. Do not resurrect a separate marker authority to represent this state.

### Runtime compatibility

A clean break removes legacy formats, but current runtime incompatibility still matters: changing embedding dimension/model/artifact or an incompatible index format requires a fresh publication. Keep a small current-only compatibility contract sufficient to make that decision.

### External mutation

If users or another Satori process can mutate a vector collection behind PublicationStore, the backend needs a scoped observation/fence. Prefer ownership and collection isolation; add only the smallest observation needed for the verified threat.

### Loss of local publication state with remote vectors

The target deliberately makes the local current-publication pointer the authority. If that pointer/descriptor is lost or corrupt while a remote Milvus collection still exists, do not reconstruct authority from a remote completion marker as a hidden compatibility/recovery path. Treat the publication as unavailable and require a fresh index unless a future explicit product requirement authorizes a separate remote-authority recovery design.

### Reader coordination across processes

The current shared-runtime design centralizes root-keyed read/retention state in one host process, but Core also exposes direct `Context` read/mutation APIs. This plan must therefore define the GC support boundary explicitly rather than assuming every possible reader is represented in one process-local lease map.

For this clean break, prefer the smaller product rule instead of inventing a distributed lease service:

> All readers that participate in destructive publication GC for one Satori state root must be coordinated by the same publication-runtime owner. Independent Core processes concurrently reading that same state root while another process activates/GCs publications are unsupported.

Encode/enforce that support boundary before destructive GC is enabled. If Core cannot establish that the state root has one supported publication-runtime owner, GC must be conservative and retain old publications rather than infer safety from a zero process-local reader count. Direct Core APIs remain usable, but they must not create a configuration in which one process can delete a publication another supported process may still be reading.

If the product later chooses to support independent concurrent Core readers against the same state root, that is the point to add cross-process publication read leases/liveness. Do not pre-build distributed reader coordination in this refactor.

## Explicit non-goals

- Learned ranking/reranker policy redesign.
- Reranker reliability benchmarking.
- Package-aware semantic invalidation.
- Go multi-module semantic qualification.
- Go public `calls_v0` promotion.
- General dependency cleanup unrelated to publication architecture.
- Preserving old local state or public internal APIs.

## Final architecture acceptance criteria

The refactor is complete when all of the following are true:

- `current.json` (or its final equivalent) is the sole durable selector of current index publication.
- Its activation durability contract is explicit: candidate publication durable first, then pointer temp write/fsync, atomic rename, and parent-directory fsync.
- A Publication ID is sufficient to locate all vector, source-checkpoint, and navigation resources for that publication.
- Core owns the single root mutation fence; direct Core mutation and MCP-driven mutation cannot bypass it.
- Candidate construction never mutates current publication state before the atomic activation point.
- A read pins one Publication ID and can finish after a newer publication activates.
- Current-publication resolution and read retention are one atomic `acquireCurrentRead(root)` operation with respect to activation/GC.
- GC uses publication liveness/read leases, not proof reconstruction, to decide when old resources can be removed.
- Destructive GC is enabled only inside the explicit supported reader-coordination boundary; a zero local lease count is not sufficient if another supported process could still be reading the state root.
- Policy/configuration is a captured build input, not an independently mutable publication authority.
- Selection-policy drift remains fail-closed for read admission when it can change which files are allowed to be disclosed.
- Source freshness describes divergence from live source; it does not retroactively invalidate immutable publication contents.
- MCP does not reparse or re-prove Core publication internals.
- Normal reads do not exact-recount vector payload, re-hash navigation shards, or recompare a giant generation receipt.
- `PreparedFileChangeSet`, prepared collection receipt authenticity, prepared generation receipt authenticity, and equivalent process-local capability registries are gone from the normal publication flow.
- Multi-file authority restore journals and policy tombstone rollback are gone.
- `manage_index repair`, `RepairProof`, and forensic authority-salvage code are gone; authoritative loss routes to a fresh Publication/reindex.
- Durable MCP `SnapshotManager` and its V1/V2/V3 migration, lock, merge, tombstone, quarantine, and interrupted-promotion machinery are gone.
- Navigation has one persisted representation; the additive SQLite backend, dual-read parity, backend selector, and JSON fallback are gone.
- The obsolete v3 MCP call-graph sidecar build/storage/manager is gone; relationship-backed navigation is the graph authority.
- `publishMutation(callback)` is gone from the cross-layer architecture; the Core-owned writer lease protects the mutation and single activation operation directly.
- `PublicationStore.activate()` makes the candidate durably complete before reachability, then persists the current-pointer transition with temp-file fsync, atomic rename, and parent-directory fsync.
- Old policy/completion/snapshot compatibility readers and deprecated architecture adapters are gone.
- The Core public surface contains only intentional product APIs.
- The stale-while-sync product behavior remains correct end to end on the exact final head.
