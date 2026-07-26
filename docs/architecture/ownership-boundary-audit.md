# Ownership Boundary Audit

Audit date: 2026-07-26

Scope: read-only architecture audit of the Core and MCP runtime ownership
boundaries. No production code, tests, configuration, schemas, generated
artifacts, dependencies, or repository history were changed.

## Executive summary

The repository has several well-defined low-level authorities: `FileSynchronizer`
owns source snapshots and checkpoints, `SnapshotManager` owns the MCP snapshot
and durable operation receipts, `MutationLeaseCoordinator` owns root mutation
leases, and the navigation sidecar/registry modules own their serialized
artifacts. Existing plans and tests also establish `SyncManager` as the single
durable synchronization owner. Those are useful foundations.

Ownership is weaker at the orchestration boundaries. Correctness work has
accumulated in the Core `Context` and in MCP handler host objects. The result is
not proven to be a current data-corruption defect, but it makes the authoritative
writer and lifecycle contract harder to identify and makes new behavior likely
to cross several domains at once.

The three confirmed findings are:

1. **High:** `Context` is the actual owner of indexing, generation authority,
   publication/retention, repair, navigation publication, source synchronizer
   registration, and semantic-search behavior. It is therefore not operating
   as the composition root and compatibility façade required by the repository
   policy.
2. **Medium:** `ManageIndexingHandlers` is an explicit coordinator, but its
   `ManageIndexingHandlersHost` is a broad capability bag that lets the MCP
   handler layer decide lifecycle policy while directly reaching Core,
   snapshots, leases, vector cleanup, and navigation publication.
3. **Medium:** `SyncManager` is the correct synchronization coordinator, but it
   depends on the whole `Context` and mirrors source-checkpoint observations
   that are also registered by Core. This makes the boundary easy to widen and
   leaves the source-freshness contract spread across two objects.

The highest-risk mutable-state problem is the group of Context collections
`publishedPolicyBindingsByCodebase`, `generationProofs`,
`publicationRetentionQueues`, and `publicationReadGates`. They jointly control
which vector collection, completion marker, policy, and navigation generation
is considered current. They currently share an owner with full indexing,
repair, search, and source-synchronizer lifecycle logic. A future path that
updates one part without the matching proof and retention protocol can expose
an inconsistent generation even when each individual helper is correct.

The recommended first remediation is a bounded extraction of generation and
publication authority from `Context`, preserving the existing Context methods
as compatibility delegates. It is an **XL** effort: roughly 3–6 engineer-weeks
of implementation after a 2–4 day design/inventory phase, with the main
uncertainty being the number of first-party callers that rely on the current
method shapes and state timing.

This audit is bounded rather than exhaustive. It covers the main runtime
composition roots, Core `Context`, indexing/repair/publication, MCP search and
sync paths, their primary persistence/lease owners, representative tests, and
the highest-signal graph hotspots. It does not prove complete dynamic caller
coverage, inspect every backend adapter or CLI path, or establish that the
current working-tree changes are correct.

## Repository ownership model

The following describes the ownership that is actually present. “Healthy”
means the observed authority is reasonably singular and its lifecycle is
explicit; it does not mean the surrounding orchestration is small.

| Domain or responsibility | Current owner | Authoritative state or policy | Main callers | Ownership assessment |
| ------------------------ | ------------- | ----------------------------- | ------------ | -------------------- |
| Runtime composition | `ProviderRuntime.createRuntime`; `SharedRuntimeHost` | Construction and wiring of `Context`, `SyncManager`, `SnapshotManager`, `MutationLeaseCoordinator`, and `ToolHandlers` | MCP provider/session setup | Healthy composition root. It currently passes broad objects into downstream handlers, which is a source of the confirmed handler-boundary finding. |
| Core indexing and vector writes | `Context.indexCodebase`, `Context.reindexByChange`, `Context.processFileList` | Embedding/vector writes, index policy resolution, collection preparation, completion state | `ManageIndexingHandlers`; `SyncManager` | Authoritative but overloaded. It combines pipeline, policy, persistence, navigation, and lifecycle concerns. |
| Source snapshot and change detection | `FileSynchronizer`; registered by `Context` | Source snapshot files, file hashes, prepared changes, freshness checkpoint evidence | `Context`; `SyncManager` | The synchronizer is a valid low-level owner. The registry and public compatibility methods remain on Context. |
| Generation and publication authority | `Context` plus `persisted-index-authority.ts` contracts | Published policy bindings, generation proofs, completion markers, collection activation, publication retention/read gates | Core index methods; MCP manage, sync, and search readiness | Policy/contract code is separated, but the mutable authority and its lifecycle are still in Context. This is the highest-risk confirmed boundary. |
| Repair and recovery | `Context.repairIndex`; MCP `ManageIndexingHandlers.handleRepairIndex` | Core repair proof and navigation repair; MCP operation receipt, lease, and response projection | `manage_index` repair; tests | The Core algorithm and MCP operation coordinator are distinct, but the handler host exposes enough raw capabilities to blur the contract. |
| Watcher and synchronization lifecycle | `SyncManager.ensureFreshness` and `syncCodebase` | Watcher lifecycle, freshness epochs, sync coalescing, source-observation cache, sync operation entry | Search, explicit sync, periodic work, watcher events | The repository’s plans establish one synchronization owner here. Keep this owner; narrow its Core dependency rather than creating another watcher authority. |
| MCP snapshot persistence | `SnapshotManager` | `mcp-codebase-snapshot.json`, indexed/indexing status, operation phases, manifests, tombstones, runtime fingerprint | `SyncManager`, manage handlers, maintenance handlers | Healthy persistence owner. It should receive operation-level updates, not become a second vector or generation authority. |
| Root mutation lease | `MutationLeaseCoordinator` | Root lock state, lease generation, operation ID, owner identity, current-lease checks | `SyncManager`, manage handlers, runtime setup | Healthy authority. The lease is a concurrency fence, not proof of external vector-backend state. |
| Navigation storage and read projection | `symbols/sidecar.ts`, `symbols/registry.ts`, navigation SQLite/store modules; MCP `NavigationHandlers` | Sidecar generations, seals, registry manifests, SQLite/read projections | Context publication methods; navigation tools | Storage ownership is reasonably explicit. Publication decisions remain coupled to Context and MCP readiness. |
| Search readiness and execution | `runSearchFrontDoor`, `TrackedRootReadiness`, `SearchExecution`, `SearchQuerySupport`, `ToolResponseBuilders`, with `ToolHandlers` as façade | Readiness proof, freshness gate, query plan, search execution, response envelopes, continuation state | `ToolHandlers`; public search tool | Partially decomposed and directionally sound. `ToolHandlers` still owns several derived caches and a large orchestration method; this remains a suspected issue pending a cache-authority contract. |
| MCP tool adaptation | `ToolHandlers`, `ManageIndexingHandlers`, `NavigationHandlers`, maintenance handlers | Request validation, response mapping, delegation, and some lifecycle orchestration | MCP tool definitions and `ToolContext` | The adapter layer is not consistently thin. The confirmed capability-bag finding concerns indexing lifecycle; search façade growth is listed separately as suspected. |

## Hotspot inventory

Metrics below come from the codebase-memory symbol graph. Cyclomatic
complexity is the graph’s independent-path decision metric; cognitive
complexity adds structural-flow and nesting penalties. They are investigation
signals, not ownership proof. Caller counts are also graph signals: dynamic
dispatch and registration can make inbound counts incomplete.

| File or symbol | Cyclomatic complexity | Cognitive complexity | Centrality or caller signal | Suspected responsibilities | Investigated? |
| -------------- | --------------------: | -------------------: | --------------------------- | -------------------------- | ------------- |
| `packages/core/src/core/context.ts:Context.repairIndex` | 63 | 128 | inbound 1; outbound 30 | Repair proof, source/navigation validation, policy restoration, collection cleanup, publication | Yes; confirmed finding 1 |
| `packages/core/src/core/context.ts:Context.performReindexByChange` | 49 | 98 | inbound 2; outbound 34 | Incremental source diff, collection mutation, navigation delta, marker/publication and retention | Yes; confirmed finding 1 |
| `packages/core/src/core/context.ts:Context.performAtomicDeltaPublication` | 18 | 40 | inbound 1; outbound 22 | Staged collection fork, payload replacement, navigation candidate, activation and cleanup | Yes; confirmed finding 1 |
| `packages/core/src/core/context.ts:Context.proveGenerationAuthorityExactly` | 19 | 21 | inbound 2; outbound 18 | Generation proof and navigation/marker authority validation | Yes; confirmed finding 1 |
| `packages/mcp/src/core/manage-indexing-handlers.ts:ManageIndexingHandlers.startBackgroundIndexing` | 83 | 248 | inbound 1; outbound 8 | Background index lifecycle, lease fence, snapshot phases, source checkpoint, publication, rollback | Yes; confirmed finding 2 |
| `packages/mcp/src/core/manage-indexing-handlers.ts:ManageIndexingHandlers.handleIndexCodebaseInternal` | 61 | 177 | inbound 2; outbound 13 | Tool action validation, preflight, lease/operation setup, background launch and response state | Yes; confirmed finding 2 |
| `packages/mcp/src/core/manage-indexing-handlers.ts:ManageIndexingHandlers.handleRepairIndex` | 32 | 79 | inbound 0; outbound 6; inbound graph is incomplete for dispatch | Repair request, lease, snapshot phases, proof projection and recovery | Yes; confirmed finding 2 |
| `packages/mcp/src/core/sync.ts:SyncManager.syncCodebase` | 35 | 85 | inbound 1; outbound 9 | Sync lifecycle, lease join, Context mutation, snapshot phase and checkpoint commit | Yes; confirmed finding 3 |
| `packages/mcp/src/core/sync.ts:SyncManager.ensureFreshness` | 17 | 31 | inbound 4; outbound 7 | Unified freshness gate, ignore reconciliation, throttling, sync coalescing | Yes; confirmed finding 3; existing owner preserved |
| `packages/mcp/src/core/sync.ts:SyncManager.assertMutationCurrent` | 1 | 1 | inbound 31; outbound 0 | Mutation-fence assertion used across lifecycle paths | Yes; healthy central helper |
| `packages/mcp/src/core/handlers.ts:ToolHandlers.handleSearchCode` | 30 | 65 | inbound 0; outbound 21; public dispatch is dynamic | Search validation, front-door host wiring, freshness/readiness, execution, continuation and response projection | Partly; suspected issue only |

The physical hotspot sizes are also notable: `context.ts` is 9,268 lines,
`handlers.ts` is 4,856 lines, `manage-indexing-handlers.ts` is 2,135 lines,
and `sync.ts` is 2,030 lines. These sizes direct investigation but are not
findings by themselves. The repository currently has no ESLint rules or other
CI checks for `max-lines`, method size, cyclomatic complexity, cognitive
complexity, or architecture dependencies.

## Confirmed findings

### [high] `Context` is the authoritative owner of several major Core domains

**Confidence:** high

**Evidence**

The repository policy says that `Context` may compose, wire, expose established
compatibility APIs, and delegate, but must not acquire new domain logic or
mutable domain state (`AGENTS.md:70-88`). The current class spans
`packages/core/src/core/context.ts:987-9268` and directly stores state for
multiple unrelated lifecycles:

- index policy overlays, policy tokens, policy digests, and published policy
  bindings (`context.ts:995-1005`);
- synchronizer registrations and mutation targets (`context.ts:1007-1008`);
- serialized incremental-reindex queues and publication-retention queues
  (`context.ts:1008-1010`);
- publication read gates, generation proofs, proof flights, navigation proof
  flights, prepared generation receipts, and navigation delta state
  (`context.ts:1010-1017`); and
- vector-store/provider state and language-analysis dependencies
  (`context.ts:987-1032`).

The same class contains the full-index pipeline
`indexCodebase` (`context.ts:3158-3416`), incremental publication
`reindexByChange`/`performReindexByChange` (`context.ts:3418-4531`), exact
generation proof (`context.ts:2279-2480`), repair (`context.ts:6890-7848`),
semantic search with a generation receipt (`context.ts:4658-4972`), durable
authority restore (`context.ts:5586-5734`), and navigation publication
(`context.ts:8147-8198`).

The graph metrics show that this is not only a large façade:

- `repairIndex`: 959 lines, cyclomatic 63, cognitive 128, 30 outbound
  relationships;
- `performReindexByChange`: 517 lines, cyclomatic 49, cognitive 98, 34
  outbound relationships;
- `performAtomicDeltaPublication`: 313 lines, cyclomatic 18, cognitive 40;
- `processFileList`: 170 lines, cyclomatic 19, cognitive 50; and
- `restoreDurableIndexAuthority`: 149 lines, cyclomatic 22, cognitive 39.

The Satori call graph for `repairIndex` reaches `FileSynchronizer`, the
persisted-authority compatibility functions, navigation sidecar generation
and pruning, navigation SQLite import, and the root-bound indexing guard. The
Satori graph is explicitly advisory for inbound coverage; deterministic source
inspection confirms the MCP call sites at:

- `packages/mcp/src/core/manage-indexing-handlers.ts:1215`
  (`context.repairIndex`);
- `manage-indexing-handlers.ts:1644` (`context.indexCodebase`);
- `manage-indexing-handlers.ts:1870` and `2071` (navigation publication and
  durable authority restoration); and
- `packages/mcp/src/core/sync.ts:1201`, `1244`, and `1279` (clear,
  synchronizer recreation, and incremental reindex).

History supports accumulation rather than a single isolated method. Examples
include:

- `ee47835` added 1,119 lines and removed 137 for generation-policy and
  navigation integrity;
- `4775e86` changed 644 lines for relationship-only publication repair;
- `ccb4bcd` changed 543 lines for publication readiness proofs;
- `bb45459` changed 400 lines for atomic delta publication; and
- `b125e7f` changed 513 lines for atomic generation activation.

The predecessor `packages/core/src/indexer.ts` introduced by `77caf43` was
294 lines. The current class is not merely that original indexer with a larger
implementation; it has become the authority for several lifecycle domains.

| Behavior or state | Current apparent owner | Actual authority | Callers | Lifecycle | Persistence boundary | Competing owners | Violated invariant |
| ----------------- | --------------------- | ---------------- | ------- | --------- | -------------------- | ----------------- | ------------------ |
| Vector indexing and incremental publication | `Context` | `Context` writes vector payloads and invokes marker/navigation publication | MCP manage handlers; `SyncManager` | prepare → write → validate → activate → retain/prune | Vector collection, completion marker, navigation sidecars | `ManageIndexingHandlers` sequences the operation; `SyncManager` triggers incremental paths | One owner is responsible for indexing plus several second major domains |
| Published policy and generation proof | `Context` | `publishedPolicyBindingsByCodebase`, `generationProofs`, proof flights, and publication queues in Context | Core search/index methods; MCP readiness and lifecycle paths | capture → prove → publish → read/retain → restore/prune | Policy files, completion markers, collection binding, sidecar seals | `persisted-index-authority.ts` defines contracts but does not own the mutable lifecycle | Authority must have one dedicated owner; a façade must not own mutable domain state |
| Repair and navigation repair | `Context.repairIndex` | Core repair proof and navigation candidate activation/cleanup | `ManageIndexingHandlers.handleRepairIndex`; tests | inspect → prove → repair/rebuild → activate or require reindex | Vector payload, marker, policy binding, navigation sidecars | MCP handler owns lease/operation response lifecycle | Cross-domain repair should be a dedicated owner behind a narrow contract |
| Source synchronizer registry | `Context` | Context owns the map of `FileSynchronizer` instances and lifecycle methods | Core index/reindex; `SyncManager` | create/reuse → inspect → mutate → delete/recreate | Per-root source snapshot/checkpoint files | `FileSynchronizer` owns snapshot content; `SyncManager` owns watcher observations | A façade should delegate source lifecycle rather than own another mutable domain |

**Ownership mismatch**

`Context` is the actual implementation owner, not a composition root or
compatibility façade. The contract files and storage modules provide useful
sub-boundaries, but the mutable maps and the decisions that bind them remain in
the same object as source scanning, embedding, vector writes, semantic search,
repair, and navigation publication. The correct owner is not a new generic
context: it is a small set of dedicated Core owners, beginning with a
generation/publication authority that uses the existing persisted-authority,
sidecar, synchronizer, and vector-adapter contracts.

**Impact**

The present design raises the risk of:

- activating a vector collection without the matching marker, policy binding,
  source checkpoint, or navigation seal;
- restoring policy or navigation state from a lifecycle path that did not use
  the same generation proof and retention gate;
- adding a new caller that mutates a Context collection instead of going
  through the authoritative publication path; and
- making unrelated consumers understand internal sequencing that should be
  enforced by one owner.

No current data-corruption failure was declared from this evidence. Existing
leases, completion proofs, repair proofs, and fail-closed paths are meaningful
mitigations. The finding is architectural: the protections are concentrated in
an object whose public surface and state model span too many domains.

**Recommendation**

Freeze `Context` as the compatibility façade for new work. Preserve existing
public methods as delegates while extracting one domain at a time. The first
vertical extraction should be a provisional `IndexAuthorityCoordinator`,
unless an existing project name is selected during design. It should own:

- published policy bindings and generation-proof caches/flight coordination;
- collection/marker/navigation binding validation;
- publication retention and read gates; and
- activation, rollback, and restoration of a proven generation.

It should not own source scanning, embedding, semantic ranking, MCP snapshot
state, or root leases. Its inputs should be narrow ports for the existing
`FileSynchronizer` checkpoint evidence, vector collection publication, marker
and policy contracts, navigation sidecars, and mutation fencing. `Context`
would retain compatibility methods such as `proveGenerationAuthorityExactly`,
`publishNavigationCandidate`, and `restoreDurableIndexAuthority`, but those
methods would delegate rather than write the authority maps themselves.

The smallest complete extraction decision is:

| Existing problem | Evidence | Proposed owner | Responsibility transferred | Contract | Callers affected |
| ---------------- | -------- | -------------- | -------------------------- | -------- | ----------------- |
| Context owns policy, generation proof, retention, and activation state while also indexing and repairing | Context fields `1002-1017`; `performAtomicDeltaPublication`; `repairIndex`; history additions above | Provisional `IndexAuthorityCoordinator` | The mutable authority maps, proof flights, retention/read gates, and generation activation/restore sequencing | Given a canonical root, proven source/collection/marker/navigation evidence, and mutation fence, return or publish one generation-bound authority receipt; reject mismatches without partial activation | Context compatibility methods first; then `ManageIndexingHandlers`, `SyncManager`, and readiness/search consumers through the existing Context façade |

Do not extract all of `Context` in one rewrite. After this seam is proven, use
the same ledger for the remaining pipeline, repair, and search responsibilities
only when the next change demonstrates that they are separate owners.

**Effort**

- **Band:** XL.
- **Realistic range:** 3–6 engineer-weeks of implementation after design;
  more than 2 engineer-weeks and therefore requires decomposition.
- **Confidence:** medium. The existence of the authority state is clear; the
  exact migration size depends on private-method coupling and first-party
  consumers.
- **Analysis/design:** 2–4 engineer-days to freeze the authority contract,
  enumerate writers/readers, and choose the existing/provisional owner name.
- **Implementation:** 3–6 engineer-weeks for the authority seam, delegates,
  and the minimum affected call paths.
- **Migration/compatibility:** 2–5 engineer-days for compatibility delegates
  and any test fixtures that construct Context directly. No persisted-data
  migration is required if marker, policy, collection, and sidecar formats
  remain unchanged.
- **Migration risks:** moving proof-flight and retention state at the wrong
  point could invalidate warm receipts or allow an old generation to remain
  readable; migration must preserve the existing compatibility methods until
  the new owner is proven.
- **Verification:** 3–5 engineer-days for generation activation, rollback,
  repair, incremental publication, stale-source, lease-loss, and navigation
  focused tests plus an architecture/dependency check.
- **Main cost drivers:** private Context method coupling, proof-flight state
  transfer, ordering between vector/marker/policy/navigation activation, and
  compatibility with Core and MCP tests.
- **Affected owners and consumers:** `Context`, `FileSynchronizer`, vector
  adapters, sidecar/registry modules, `ManageIndexingHandlers`, `SyncManager`,
  readiness/search, and Context-focused tests.
- **Optional cleanup excluded:** splitting every large method, renaming all
  Context methods, generalized search redesign, and unrelated complexity
  cleanup are not part of this estimate.
- **Unknown that could materially change the estimate:** a caller or test may
  depend on the identity or timing of a private Context cache rather than only
  the established public receipt contract.

**Verification**

After implementation, verify the existing Core and MCP authority tests and
add only the missing owner-level checks:

- one writer for each authority collection;
- no marker/policy/navigation activation without the same generation receipt;
- lease loss and source drift fail closed;
- repair and incremental publication preserve the current response and
  persisted formats; and
- Context compatibility methods delegate without reintroducing mutable
  authority state.

The architecture check should inspect imports and writes, not just file size.

**Stopping condition**

Stop when one dedicated authority owns the generation/policy/publication state,
all current public Context entrypoints delegate to it, no MCP caller writes
that authority directly, focused authority tests pass, and persisted contracts
are unchanged. Do not continue into a general Context rewrite in the same
batch.

### [medium] MCP indexing lifecycle is behind a broad capability-bag contract

**Confidence:** high

**Evidence**

`ManageIndexingHandlers` is a legitimate named coordinator, so the problem is
not that cross-domain work exists in a handler. The problem is the shape of its
contract. `ManageIndexingHandlersHost` in
`packages/mcp/src/core/manage-indexing-handlers.ts:124-218` receives direct
references to `Context`, `SnapshotManager`, `SyncManager`, runtime fingerprint,
and `MutationLeaseCoordinator`, plus callbacks for collection pruning, policy
loading, context ignore/extensions, source paths, snapshot phases, call-graph
rebuild, completion-marker clearing, write-collection override, and response
building.

The implementation then carries domain lifecycle policy in methods that are
also responsible for tool-level behavior:

- `handleIndexCodebaseInternal` spans `manage-indexing-handlers.ts:370-1014`
  and has 645 graph lines, cyclomatic 61, cognitive 177;
- `handleRepairIndex` spans `:1076-1443` and has 368 graph lines, cyclomatic
  32, cognitive 79; and
- `startBackgroundIndexing` spans `:1445-2134` and has 690 graph lines,
  cyclomatic 83, cognitive 248.

`startBackgroundIndexing` directly sequences staged collection state, source
checkpoint evidence, candidate policy, navigation candidate cleanup, durable
authority rollback, mutation fencing, and snapshot terminal phases. The
handler also calls the current Context authority directly, including
`repairIndex` at `:1215`, `indexCodebase` at `:1644`, navigation publication at
`:1870`, and authority restoration at `:2071`.

`ToolHandlers` constructs this broad host in
`packages/mcp/src/core/handlers.ts:965-1021`, binding many of its own methods
and even exposing `startBackgroundIndexing` through a cast-based internal
bridge. Public lifecycle tests reach the same internal seam through a cast in
`packages/mcp/src/tools/lifecycle.public-tools.test.ts:583-622`. This is useful
regression coverage, but it also shows that the operation lifecycle contract is
implemented as a private object graph rather than a narrow operation contract.

| Behavior or state | Current apparent owner | Actual authority | Callers | Lifecycle | Persistence boundary | Competing owners | Violated invariant |
| ----------------- | --------------------- | ---------------- | ------- | --------- | -------------------- | ----------------- | ------------------ |
| Create/reindex lifecycle and operation phases | `ManageIndexingHandlers` through `ToolHandlers` host callbacks | Snapshot phase is persisted by `SnapshotManager`; vector/generation/navigation mutation is performed by `Context` | `manage_index` tool; `ToolHandlers` delegation; tests | validate → lease → accepted → stage/write → publish → completed/failed/blocked | Snapshot file, vector collection, marker/policy files, sidecars | `Context`, `SyncManager`, `MutationLeaseCoordinator`, `ToolResponseBuilders` | A named coordinator is allowed, but its contract must not expose all participating domain primitives |
| Repair lifecycle and rollback | `ManageIndexingHandlers.handleRepairIndex` | Core repair proof and authority restoration are in `Context`; lease and operation receipt are MCP-owned | `manage_index` repair | inspect → acquire → recover → repair → publish/restore → terminal response | Vector payload, marker, policy, sidecar, MCP snapshot | `Context.repairIndex`, `SnapshotManager`, lease coordinator | Cross-domain policy and infrastructure decisions are mixed into the protocol handler |
| Staged collection cleanup and write override | Handler host callbacks | Vector adapter/Context publication path should own collection and authority cleanup | Background indexing and failure paths | stage → use → discard/prune or rollback | Vector collection and marker/sidecar state | Context vector store, handler cleanup, maintenance handlers | Mutable publication state has more than one reachable orchestration boundary |

**Ownership mismatch**

The handler is an explicit coordinator, but it is also a service locator for
Core and persistence capabilities. That makes `ManageIndexingHandlersHost`
the de facto contract for several domains instead of a named operation contract.
The actual authoritative owners are split correctly at the primitive level,
but the handler can decide the order and policy of their interactions through
raw callbacks. The correct model is to retain one explicit manage-index
coordinator while narrowing its inputs to operation-level ports.

**Impact**

Adding a new lifecycle phase or failure path requires edits to the handler,
Context, snapshot, lease, and response contracts. A callback can accidentally
persist a snapshot phase without the matching generation proof, bypass the
dedicated publication owner, or make a recovery path differ from the normal
path. Tests become coupled to private `ToolHandlers` fields and casts instead
of verifying a stable coordinator contract. Current leases and fail-closed
checks reduce the immediate risk, but they do not remove the ownership
ambiguity.

**Recommendation**

Keep `ManageIndexingHandlers` as the explicit MCP coordinator for
`manage_index`; do not move this workflow into generic `Context`. Narrow the
host in dependency order:

The smallest complete remediation for this finding is to remove raw Core,
vector, and persistence capabilities from the handler host while preserving
one explicit operation-level coordinator contract and the existing public
responses.

| Existing problem | Evidence | Proposed owner | Responsibility transferred | Contract | Callers affected |
| ---------------- | -------- | -------------- | -------------------------- | -------- | ----------------- |
| Handler receives raw Context, snapshot, sync, lease, vector-cleanup, and publication callbacks | `ManageIndexingHandlersHost:124-218`; ToolHandlers bridge `handlers.ts:965-1021` | Provisional `IndexMutationPort`, backed first by existing Context methods and later by the extracted authority owner | Core collection preparation, generation publication/restore, navigation candidate cleanup, and proof-bound mutation | Operation-level calls accept a canonical root, operation receipt/lease, source observation, and candidate receipt; return typed stats/proof/terminal outcome; no direct response-builder or raw vector-store access | `ManageIndexingHandlers`, `ToolHandlers`, `manage_index` tests |
| Handler mixes protocol validation and durable operation sequencing | `handleIndexCodebaseInternal`, `handleRepairIndex`, `startBackgroundIndexing` spans and metrics above | `ManageIndexingHandlers` remains coordinator; `SnapshotManager` remains persistence owner | Keep request/action validation and response projection at MCP; keep snapshot phase persistence in SnapshotManager; move Core policy decisions behind the port | One named lifecycle contract for accepted/staged/published/failed/blocked, with lease and generation evidence explicit | Public tool definitions and lifecycle tests; response shapes remain compatible |

The port name is provisional and should be replaced by an established project
concept if design review finds one. The extraction is justified by the existing
raw-capability problem and does not authorize a rewrite of the manage tool.

**Effort**

- **Band:** L.
- **Realistic range:** 1–2 engineer-weeks.
- **Confidence:** medium-high. The host and call paths are explicit; recovery
  ordering and private test seams add uncertainty.
- **Analysis/design:** 1–2 engineer-days to define the operation-level contract
  and list the current phase transitions.
- **Implementation:** 5–8 engineer-days to narrow the host, route Core
  mutation through the port, and preserve the three manage actions.
- **Migration/compatibility:** 1–3 engineer-days for test harnesses, lifecycle
  shims, and unchanged response/operation receipts. No data migration is
  expected.
- **Migration risks:** changing the order of lease, snapshot, staged-collection,
  and rollback transitions could alter blocked/failed responses or leave an
  unreferenced candidate; retain the current phase contract during migration.
- **Verification:** 2–4 engineer-days for create, reindex, repair, lease
  contention/loss, interrupted recovery, rollback, and snapshot-phase tests.
- **Main cost drivers:** preserving operation phase ordering, staged collection
  cleanup, and the public `manage_index` response contract.
- **Affected owners and consumers:** `ManageIndexingHandlers`, `ToolHandlers`,
  `Context`/the extracted authority owner, `SnapshotManager`,
  `MutationLeaseCoordinator`, vector adapters, and MCP lifecycle tests.
- **Optional cleanup excluded:** renaming handlers, splitting every response
  helper, and general MCP façade cleanup.
- **Unknown that could materially change the estimate:** whether any external
  or hidden consumer depends on the cast-based `startBackgroundIndexing` seam
  or on exact intermediate snapshot phase timing.

**Verification**

Run the focused manage-index and lifecycle tests, then add a contract test only
for a demonstrated gap:

- each action reaches one terminal snapshot phase;
- a lost lease prevents publication and cleanup from using stale authority;
- repair and reindex use the same generation/collection contract;
- failure rollback does not restore a different generation; and
- the handler cannot call a raw vector store or write a marker outside its
  operation port.

**Stopping condition**

Stop when the handler host contains only operation-level dependencies, all
Core publication and repair decisions cross one named contract, existing MCP
responses and operation receipts remain unchanged, and focused lifecycle tests
pass. Do not turn this into a general handler-module split.

### [medium] `SyncManager` has a broad Core dependency and split freshness representation

**Confidence:** high for the dependency boundary; medium for the long-term
need to relocate the mirrored observation cache.

**Evidence**

The repository’s watcher-decoupling evidence explicitly establishes
`SyncManager.ensureFreshness` as the synchronization owner for search,
periodic work, explicit sync, and watcher-triggered sync. That is a healthy
existing decision and is not disputed by this finding.

The implementation nevertheless stores both broad domain references and
freshness state in `packages/mcp/src/core/sync.ts:250-278`:

- `context: Context` and `snapshotManager: SnapshotManager`;
- watcher lifecycle, ignore reconciliation, active-sync, and freshness-epoch
  maps; and
- `sourceCheckpointObservations` and `sourceCheckpointStatuses`.

`getPreparedReadObservation` and `getPreparedReadDiagnostics` read the
manager’s checkpoint maps and compare them with Context’s registered source
checkpoint observation (`sync.ts:430-521`). Validation and post-sync paths
write those maps in several lifecycle methods (`sync.ts:522-580`, `:868-880`,
`:1238`, `:1524-1525`, and clear them at `:1863-1864` and `:2014-2015`).

The sync path also reaches directly into Context for source comparison,
synchronizer recreation, index clearing, and incremental reindex:

- `sync.ts:692-880` implements the freshness gate and invokes the sync flight;
- `sync.ts:1141-1381` owns the sync operation and calls Context mutation methods;
- `sync.ts:1023-1025`, `:1201`, `:1242-1244`, and `:1279` show representative
  direct Context calls; and
- `SyncManager.syncCodebase` has 241 graph lines, cyclomatic 35, cognitive 85;
  `ensureFreshness` has 189 graph lines, cyclomatic 17, cognitive 31.

The split is not two writers to the same map: the manager writes its own
observation cache, while Core owns the registered checkpoint evidence. That
distinction is why this is a boundary finding rather than a confirmed
duplicate-writer defect. The problem is that the contract is implicit in
method calls and optional capability checks instead of a narrow source-freshness
port.

`SnapshotManager` and `MutationLeaseCoordinator` are clearer owners: the
snapshot class owns its mutable operation/status maps and snapshot lock, while
the lease coordinator owns root lock state and current-lease checks. They
should remain separate.

| Behavior or state | Current apparent owner | Actual authority | Callers | Lifecycle | Persistence boundary | Competing owners | Violated invariant |
| ----------------- | --------------------- | ---------------- | ------- | --------- | -------------------- | ----------------- | ------------------ |
| Watcher, freshness, and sync coalescing | `SyncManager` | `SyncManager.ensureFreshness`/`syncCodebase` | Search front door, periodic sync, explicit sync, watcher events | observe → validate → coalesce/throttle → sync/reconcile → commit | Watcher process state plus SnapshotManager operation receipts | None confirmed; docs establish one sync owner | No violation in the owner itself; preserve the explicit coordinator |
| Source checkpoint evidence | `FileSynchronizer`/Context persistence plus SyncManager observation cache | Core checkpoint files and Context registration are authoritative; manager cache is derived coordination state | Context index/reindex; SyncManager freshness/readiness | stage → validate → compare → commit or invalidate | Per-root source snapshot/checkpoint files | SyncManager’s mirrored status/token maps | New domain services should depend on a narrow port, not broad Context; derived and authoritative state need an explicit contract |
| Index mutation called by sync | `SyncManager` as caller | Context today; future dedicated Core owner after finding 1 | `syncCodebase` | lease → clear/recreate/reindex → snapshot commit | Vector/index marker/navigation state and MCP snapshot | Manage handlers can launch parallel lifecycle paths, serialized by leases | Cross-domain coordinator should not become an implicit second index owner |

**Ownership mismatch**

`SyncManager` is correctly named and is the right coordinator for freshness and
sync lifecycle. Its mismatch is narrower: it uses `Context` as a broad port for
source evidence, synchronizer lifecycle, index mutation, and cleanup while
also maintaining a second representation of freshness observations. This
means a change to source checkpoint semantics must understand both Core and MCP
objects, and a new method can accidentally expand SyncManager into an index or
publication owner.

**Impact**

The likely failure modes are contract drift rather than an already-proven
incorrect result:

- a Core checkpoint change updates the authoritative source evidence but not
  the manager’s cached status/observation rules;
- a new sync path calls a Context mutation method without the same source,
  generation, snapshot, and lease evidence as the established path; or
- a future service takes `SyncManager`’s broad Context dependency and begins
  owning policy or publication decisions by reachability.

The existing `SyncManager` tests, watcher evidence, and lease checks are
important mitigations. Do not replace the synchronization owner or remove the
watcher lifecycle as part of this remediation.

**Recommendation**

Keep `SyncManager` as the explicit synchronization coordinator. Introduce a
provisional `SourceFreshnessPort` only at the next causal change that needs to
cross this boundary, or use an existing typed port if one is selected during
design. The port should expose only:

The smallest complete remediation for this finding is one narrow source-
freshness seam for new sync behavior, with the manager’s checkpoint maps
explicitly derived/cache-only; a wholesale legacy dependency migration is not
required.

- inspect/validate the current source checkpoint;
- compare selected source paths against a bound checkpoint/generation;
- register or recreate a synchronizer for a root; and
- return an immutable source-observation result.

`FileSynchronizer`/Core remains the source-evidence owner, `SyncManager` owns
watcher and sync lifecycle, the future Core authority owner owns vector/index
mutation, `SnapshotManager` owns MCP lifecycle persistence, and
`MutationLeaseCoordinator` owns the concurrency fence. Existing direct
dependencies do not need a broad legacy migration; the first new service or
new domain behavior must use the narrow port as required by `AGENTS.md`.

| Existing problem | Evidence | Proposed owner | Responsibility transferred | Contract | Callers affected |
| ---------------- | -------- | -------------- | -------------------------- | -------- | ----------------- |
| SyncManager calls broad Context methods for checkpoint, synchronizer, and index behavior | `sync.ts:430-580`, `:1023-1025`, `:1201`, `:1279`; constructor stores `Context` | Provisional `SourceFreshnessPort` for source evidence; existing `SyncManager` remains coordinator | Source checkpoint inspection/comparison and synchronizer lifecycle access become typed capabilities; index publication remains outside SyncManager | Root-keyed, immutable observation/checkpoint results; no vector writes, policy publication, snapshot persistence, or lease acquisition in the port | `SyncManager`, `SearchFrontDoor`, Context adapter, focused sync/readiness tests |
| Derived observation cache has no explicit relation to Core authority | Manager maps `:269-270`; Context registered observation reads | `SyncManager` for derived cache; `FileSynchronizer`/Context for authority | Document and test that manager maps are invalidation/readiness cache only, not a second source writer | Cache entries must be derived from a returned source observation and invalidated on epoch/status changes | `getPreparedReadObservation`, search readiness, watcher tests |

**Effort**

- **Band:** M for the narrow first seam; a full replacement of all existing
  Context calls would be L and is not included.
- **Realistic range:** 3–5 engineer-days for the first port and its focused
  call-path migration.
- **Confidence:** medium. The direct calls are known; the required public
  compatibility surface is not fully enumerated.
- **Analysis/design:** 1 engineer-day to define source-observation semantics
  and distinguish authoritative checkpoint state from derived watcher cache.
- **Implementation:** 2–3 engineer-days for the adapter, constructor wiring,
  and one sync/readiness path.
- **Migration/compatibility:** 0.5–1 engineer-day; no data migration, but
  existing Context entrypoints remain compatibility-compatible.
- **Migration risks:** treating the derived SyncManager observation cache as
  authoritative, or changing checkpoint invalidation timing, could make a
  stale source appear fresh; preserve the current fail-closed outcomes.
- **Verification:** 1–2 engineer-days for sync, watcher, freshness-blocking,
  source-drift, and checkpoint-unavailable cases.
- **Main cost drivers:** optional capability behavior, source-observation
  invalidation, and sequencing with the generation/publication extraction.
- **Affected owners and consumers:** `SyncManager`, `FileSynchronizer`,
  `Context` or its authority adapter, `SearchFrontDoor`, readiness, and sync
  tests.
- **Optional cleanup excluded:** watcher redesign, timer removal, and broad
  Context dependency migration.
- **Unknown that could materially change the estimate:** whether the first
  extraction must also move `recreateSynchronizerForCodebase` or can leave it
  behind a compatibility adapter.

**Verification**

Use the existing `packages/mcp/src/core/sync.test.ts` and watcher/readiness
tests, with focused additions only if a real gap is found:

- all search, periodic, explicit, and watcher paths still enter one
  `ensureFreshness` owner;
- source observation mismatch, unavailable checkpoint, ignore-rule changes,
  and pending events remain fail-closed;
- no sync path publishes after lease loss or without the current generation
  evidence; and
- the manager cache is invalidated when its source observation or freshness
  epoch changes.

**Stopping condition**

Stop when the first new sync-related behavior consumes the narrow source port,
the manager’s checkpoint maps are explicitly derived/cache-only, existing
freshness outcomes remain unchanged, and focused tests pass. Do not migrate all
legacy Context calls or redesign watcher scheduling in this finding.

## Suspected issues requiring more evidence

These are plausible concerns, but the bounded evidence is insufficient to call
them confirmed ownership violations.

1. **`ToolHandlers` may still be a search/navigation composition root.**
   `handlers.ts:682-4856` is a 4,856-line façade with mutable
   `changedFilesCache`, `rootGitignoreMatcherCache`, prepared-read/navigation
   caches, and a large `handleSearchCodeAttempt` path. The graph reports 836
   lines, cyclomatic 30, cognitive 65 for the search method. However, the
   repository already has `runSearchFrontDoor`, `TrackedRootReadiness`,
   `SearchQuerySupport`, `SearchExecution`, `NavigationHandlers`,
   `SearchContinuationCoordinator`, and `ToolResponseBuilders`. Missing
   evidence is an explicit contract showing whether the remaining caches are
   authoritative domain state or bounded derived read state. The current
   working-tree changes in `handlers.ts`, `handlers.watchers.test.ts`,
   `navigation-handlers.ts`, `tracked-root-readiness.ts`, and
   `tracked-root-readiness.test.ts` also affect this path. Before extracting
   anything, identify the cache owner and prove that another module is not
   already its intended authority.

2. **Multiple writers to persisted generation or navigation state were not
   proven.** Direct source inspection shows Context as the apparent Core writer,
   while MCP handlers and SyncManager call Context. The graph’s `WRITES`
   relationship did not return usable rows for these TypeScript fields, and
   backend adapters can mutate external state outside the repository graph.
   Missing evidence is a complete static/dynamic writer inventory for marker,
   policy, collection-control, and navigation-sidecar writes. Treat this as a
   guardrail candidate, not as a current duplicate-writer finding.

3. **The `ToolContext` object may be a permanent broad application context.**
   `packages/mcp/src/tools/types.ts:27-48` exposes `Context`, `SnapshotManager`,
   `SyncManager`, capabilities, runtime identity, and `ToolHandlers` together.
   It is currently a runtime composition contract and may be intentionally
   public to tool definitions. Missing evidence is a consumer-by-consumer
   inventory showing that tools use domain behavior directly rather than only
   dispatching to `ToolHandlers`. Do not split it solely because it is broad.

## Recommended remediation order

Only confirmed findings are ordered here.

| Order | Finding | Why now | Dependencies | Effort | Stopping condition |
| ----: | ------- | ------- | ------------ | ------ | ------------------ |
| 1 | Context multi-domain authority | It is the deepest shared owner and the source of the broad MCP and sync dependencies; every later boundary depends on knowing where generation authority lives. | Existing authority contracts, sidecar/registry, synchronizer and vector adapter behavior; no data migration | XL, 3–6 engineer-weeks implementation after 2–4 design days | One dedicated generation/publication owner exists; Context delegates; focused authority tests and unchanged persisted contracts pass |
| 2 | MCP indexing capability-bag contract | It is the highest-risk consumer of Context authority and currently binds protocol lifecycle to raw Core/persistence capabilities. | Order 1’s authority seam, or a temporary operation-level compatibility port | L, 1–2 engineer-weeks | Manage handler depends on operation-level contracts only; lease/snapshot/publication ownership remains singular; lifecycle responses pass |
| 3 | SyncManager broad dependency and freshness contract | It is the second major consumer of Context and can otherwise recreate an index owner while narrowing the handler path. | Order 1’s index authority boundary; existing sync owner and source checkpoint tests | M, 3–5 engineer-days for the first seam | New sync behavior uses a narrow source port; derived cache semantics are explicit; existing sync/watcher outcomes pass |

## Proposed ownership map

This is the smallest target model needed for the confirmed findings. Existing
names are preferred. Names marked **provisional** are contracts to validate in
design, not instructions to create every listed service immediately.

| Proposed owner | Owns | Does not own | Inputs or ports | Consumers |
| -------------- | ---- | ------------ | --------------- | --------- |
| `ProviderRuntime` / `SharedRuntimeHost` | Runtime construction, dependency wiring, process/session lifecycle | Domain policy, vector publication, source checkpoints, tool-specific business behavior | Configuration, provider factories, runtime owner and lease construction | `ToolContext`, `Context`, `SyncManager`, `ToolHandlers` |
| `Context` as compatibility façade | Established public Core API, compatibility delegation, construction/wiring where already required | New indexing/search/generation/publication/retention/repair/navigation state or policy; cross-domain coordination | Narrow Core services and typed domain results | Existing Core consumers, MCP compatibility calls |
| **Provisional `IndexAuthorityCoordinator`** | Published policy binding, generation proof, collection/marker/navigation binding, activation, retention/read gates, rollback/restore | Source scanning, embedding, vector query ranking, MCP snapshot persistence, root leases | Source checkpoint port, vector publication port, marker/policy contracts, sidecar/registry port, mutation fence | Context delegates, manage lifecycle port, sync mutation path, readiness/search receipt validation |
| `FileSynchronizer` | Per-root source snapshot, hashes, prepared changes, checkpoint evidence | Vector writes, generation activation, MCP operation receipts, watcher scheduling | Root-bound filesystem and checkpoint paths | Context adapter, SyncManager source port |
| `SyncManager` | Watcher lifecycle, freshness epochs, sync coalescing, ignore reconciliation, sync coordinator | Source checkpoint authority, vector/publication policy, MCP snapshot schema, root lease ownership | Provisional `SourceFreshnessPort`, future index mutation port, `SnapshotManager` operation methods, `MutationLeaseCoordinator` | Search front door, periodic/explicit sync, watcher events |
| `SnapshotManager` | MCP snapshot file, indexed/indexing status, operation receipts/phases, manifests and tombstones | Vector collection authority, generation proof, source checkpoint truth, lease semantics | Typed operation-phase mutations | Sync and manage coordinators, status/maintenance tools |
| `MutationLeaseCoordinator` | Root mutation lease, lock and owner identity, current-lease fence | External vector-backend snapshot proof, policy or publication decisions | Canonical root and mutation action | Sync, manage lifecycle, runtime setup, publication fence callbacks |
| `ManageIndexingHandlers` as named MCP coordinator | `manage_index` request validation, action-level orchestration, response projection, explicit operation contract | Raw vector cleanup, generation/policy decisions, source checkpoint authority, MCP snapshot internals beyond its phase contract | Provisional `IndexMutationPort`, snapshot phase contract, lease contract, response builders | `manage_index` tool definitions and lifecycle tests |
| `runSearchFrontDoor` + readiness/execution modules | Search path validation, readiness/freshness gate composition, query execution and response preparation | Index mutation, generation publication, source checkpoint writes, MCP snapshot persistence | `SyncManager` freshness result, readiness proof, search execution/query ports | `ToolHandlers`, search tools |
| Navigation sidecar/registry/store modules | Sidecar serialization, registry manifests, seals, navigation read storage/projection | Deciding which generation is authoritative, vector publication policy, MCP operation phases | Generation-bound receipts and sidecar contracts | Context authority owner, navigation handlers, call-graph/read tools |

## Guardrail recommendations

The current ESLint configuration (`eslint.config.mjs`) has no size,
complexity, forbidden-dependency, or architecture-boundary rules. The checks
below are based on demonstrated hotspots and use structural ownership evidence;
they do not prescribe arbitrary line counts.

| Failure prevented | Evidence it occurs here | Enforcement mechanism | Exceptions | Rollout effort |
| ----------------- | ----------------------- | --------------------- | ---------- | -------------- |
| New domain state or policy is added to `Context` instead of a dedicated owner | `Context` already stores policy, generation, retention, synchronizer, navigation, and vector lifecycle state; the policy explicitly forbids new Context domain state | TypeScript AST/architecture test with an explicit allowlist of existing compatibility methods and fields; fail when new mutable fields or domain imports are added to `Context` without an owner decision | Existing compatibility delegates, constructor wiring, tests/fixtures, and the staged extraction allowlist | M, 2–5 engineer-days for a baseline and CI check |
| MCP handler hosts gain raw access to Core, vector, marker, or persistence primitives | `ManageIndexingHandlersHost:124-218` and `ToolHandlers` bridge `handlers.ts:965-1021` expose those capabilities today | Dependency/contract test that checks handler host types and imports for operation-level ports; initially warn on new raw capability fields, then fail after the baseline is reduced | `ProviderRuntime` composition, existing compatibility shims during the ordered migration, and test doubles | M, 2–5 engineer-days |
| A second writer publishes generation, marker, policy, or navigation authority | Context owns the apparent writer, but manage/sync paths reach the same state and the graph could not prove all writes; existing plans stress one publication authority | AST/source ownership test for approved write functions plus focused single-writer tests that exercise full index, incremental sync, repair, and rollback paths | Vector/storage adapters, the approved authority owner, generated/test fixtures, and temporary migration wrappers with an expiry | L, 1–2 engineer-weeks because writer inventory must be completed first |
| New domain services depend on a broad application `Context` | `SyncManager` stores `Context`; `ToolContext` and handler hosts expose it broadly; repository policy requires narrow ports for new services | Import/dependency graph check in CI: new services under domain directories may use domain types/ports but not `Context`; allowlist composition roots and compatibility façades | Runtime composition roots, existing legacy dependencies until touched, tests, and generated declarations | S–M, 1–4 engineer-days |
| Complexity and size growth hides a second owner before extraction is considered | `repairIndex`, `startBackgroundIndexing`, `handleIndexCodebaseInternal`, and `handleSearchCodeAttempt` are large/high-cognitive hotspots; current CI has no metrics rules | Reporting-only code-intelligence job that records per-symbol cyclomatic/cognitive complexity, physical size, and responsibility/owner review prompts; derive thresholds from repository distributions before making any limit blocking | Generated files, fixtures, snapshots, test data, and intentionally cohesive owners with an explicit review note | S, 0.5–2 engineer-days for reporting; numeric failure thresholds are deliberately deferred |

Do not add a hard file-size limit from this audit alone. The evidence supports
an owner decision before further growth and a baseline metric report; it does
not establish a defensible repository-wide number or exception policy.

## Out of scope

- Production remediation, tests, configuration, schema, generated artifact,
  dependency, branch, and history changes were not authorized and were not
  performed.
- The audit did not inspect every file. CLI-only behavior, release scripts,
  backend adapter internals, evaluation harnesses, generated documentation,
  and all language-analysis implementations were not followed unless they lay
  on a selected ownership path.
- No complete dynamic writer inventory was possible from the available static
  graph. External vector-backend mutation and runtime registration paths need a
  separate targeted audit if the single-writer guardrail is adopted.
- No numeric file or method budget is recommended yet. The repository has no
  current enforced budgets, and size/complexity alone cannot distinguish a
  cohesive owner from a tangled one.
- Existing repository documentation and focused tests were used as evidence,
  but this audit did not rerun the full test, build, lint, typecheck, release,
  performance, security, or integration suites. The report states focused
  verification required after remediation rather than claiming those checks
  passed here.
- The initial worktree status was clean (`master...origin/master [ahead 1]`).
  During the audit, uncommitted changes appeared and expanded in
  `packages/mcp/src/core/handlers.ts`,
  `packages/mcp/src/core/handlers.watchers.test.ts`,
  `packages/mcp/src/core/navigation-handlers.ts`,
  `packages/mcp/src/core/tracked-root-readiness.test.ts`, and
  `packages/mcp/src/core/tracked-root-readiness.ts`. They were inspected and
  preserved, not authored by this audit, and are excluded from causal claims
  about the confirmed findings where their behavior could change the result.
  Satori was reindexed after authorization and incrementally synced after
  dirty-file changes; direct source inspection was used for the affected
  paths.
- Satori and codebase-memory inbound call graphs are advisory and can omit
  dynamic tool registration or low-confidence edges. Deterministic source
  searches were used for the reported MCP Context call sites, and empty or
  incomplete inbound results were not treated as proof of no callers.
