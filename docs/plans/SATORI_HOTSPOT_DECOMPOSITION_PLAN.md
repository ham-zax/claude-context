# Satori Hotspot Decomposition Roadmap

Date: 2026-08-12

Baseline repository: `/home/hamza/repo/satori`

Original baseline implementation: `6a5ee87680ccc09fc08ef5fe739fb0398e3b9401`

Source review: `docs/plans/SATORI_HOTSPOT_DECOMPOSITION_REVIEW.md`

Status: master roadmap. No implementation is authorized by this document. Each
implementation batch requires a fresh, bounded batch sheet derived from its current
HEAD; this document must not be executed continuously as one change.

## Execution checkpoint

Checkpoint HEAD: `319ea00`

Completed ownership-bounded batches:

- Phase 0.2 / F024: `e56c973`;
- Phase 0.3 / F023: `83fb255`;
- Phase 1.1 / root gitignore matcher cache: `f70f972`;
- Phase 1.2 / pure sidecar validators: `7932fa8`.
- Phase 1.3 / stateless synchronizer snapshot codec: `9f77131`;
- Phase 1.4 / CLI install boundaries: `cec0d14`;
- Phase 2.1 / complete sidecar read boundary: `06bb5db`;
- Phase 2.2 / synchronizer scan boundary: `6bde22a`;
- Phase 2.3 / extract the Python relationship-resolution engine: `4389fe0`;
- Phase 2.4 / complete sidecar write/lifecycle decomposition: `c43ff1a`;
- Phase 3.1 / IndexPolicyRuntimeService ownership: `e665659`;
- Phase 3.2 / IndexPolicyDocumentStore ownership: `9cd239e`;
- Phase 3.3 / durable restore-transaction mechanics: `4db73b0`;
- Phase 4.1 / generation authority contract freeze: `1106ff4`;
- Phase 4.2 / proof state behind IndexAuthorityCoordinator: `c5806b7`;
- Phase 4.3 / publication/read/retention gate ownership: `9091a26`;
- Phase 4.4 / activation/rollback/retention/restore authority decisions: `9f96970`;
- Phase 4.5 / IndexGenerationWorkflow repair and full-index orchestration: `60a142e`;
- Phase 4.6 / SynchronizerRegistry synchronizer lifecycle ownership: `ca15dfe`;
- Phase 5.1 / SourceFreshnessPort read-facing source readiness: `5032875`;
- Phase 5.1 repair / single MCP checkpoint observation/handoff state owner + SourceFreshnessPort read-path migration: `61d8163`;
- Phase 5.2 / prepared publication-read session: `505358b`.
- Phase 5.3 / operation-level IndexMutationPort boundary: `319ea00`.

Next open batch at this checkpoint: Phase 6.1. Refresh this checkpoint only after an
accepted batch is committed; preserve the original baseline above as historical
lineage.

## Goal

Reduce the major Satori hotspots by moving behavior to its demonstrated owner while
preserving current public behavior, persisted contracts, ranking contracts, and
compatibility façades.

Success is an ownership result, not a line-count result:

- one authoritative writer for each mutable domain;
- narrow dependency contracts;
- `Context` becomes a compatibility façade;
- MCP coordinators no longer receive raw cross-domain capability bags;
- unchanged public and persisted contracts remain byte/behavior compatible;
- each extraction is independently reviewable and reversible.

## Non-goals

- No ranking, admission, provider-order, fusion, reranker, grouping, pagination,
  projection, or ignore-semantics changes.
- No new completion-marker state or speculative `replacing` marker.
- No persisted-format migration unless separately reviewed and authorized.
- No hard file-size CI limit.
- No broad rewrite of `Context`, `ToolHandlers`, `SyncManager`, or
  `ManageIndexingHandlers`.
- No test deletion or oracle weakening.

## Global invariants

### Publication and reads

```text
candidate staging may overlap retention waiting for readers
destructive retention excludes candidate staging
newer in-flight activation makes older retention abandon cleanup
publication-bound reads hold their lease through final authority revalidation
```

### In-place incremental mutation

```text
completion authority is withdrawn before payload mutation
no result is disclosed without post-retrieval authority revalidation
completion authority is republished only after exact payload/policy/navigation proof
```

### Ownership: current and target

Current state at the execution checkpoint:

```text
Context owns broad active generation/publication authority
GenerationProofCoordinator owns generation proof state
FileSynchronizer owns source checkpoint persistence and comparisons
MutationLeaseCoordinator owns persisted root mutation fencing
SyncManager owns watcher/sync coordination but still depends on Context
ManageIndexingHandlers owns MCP action orchestration but still depends on Context
```

Target state:

```text
FileSynchronizer owns source checkpoint persistence and comparisons
SnapshotManager owns MCP lifecycle persistence and merge arbitration
MutationLeaseCoordinator continues to own root mutation fencing
IndexAuthorityCoordinator owns active generation/publication authority
SyncManager owns watcher/sync coordination, not Core checkpoint truth
ManageIndexingHandlers owns MCP action orchestration, not Core publication policy
```

### Extraction migration

For every mutable-state migration:

```text
1. characterize the current owner, invariant, writer, persistence boundary, and façade;
2. introduce the destination type or port with zero duplicate mutable state;
3. move the state collection and every mutation method for that collection together;
4. make Context/the prior owner a delegate in the same batch;
5. prove the prior owner can no longer mutate that state directly;
6. only then migrate the next collection.
```

Never mirror authoritative writes or retain two authoritative caches during a
transition. This applies in particular to generation bindings, proof caches/flights,
policy bindings, retention state, source-checkpoint observations, and synchronizer
registries.

### Dependency direction

```text
Context → domain coordinator → narrow stores/ports
MCP action/read coordinator → Core public or narrow mutation/read port

Never: domain owner → Context
Never: Core → MCP
```

## Required batch protocol

Production batches run sequentially by default. Parallelism is allowed for read-only
investigation. Parallel production work requires a preflight proving that the complete
touched-file sets are disjoint, including public export barrels, shared tests, package
manifests, and generated-contract assets.

Before implementation, create a batch sheet from the current HEAD with:

```text
owner before / owner after
exact state and functions moving
exact files touched and dependency direction
compatibility façade
regression or characterization oracle
forbidden adjacent changes
verification command(s)
stopping condition
```

Every stopping condition in that sheet must resolve to exact existing test names and
commands or be marked `new oracle required`. A new oracle must fail against the
pre-move defect or characterize the current behavior before production code moves.

Every batch must then follow this sequence:

1. confirm current HEAD and preserve unrelated work;
2. identify invariant, owner, writer, persistence boundary, callers, and façade;
3. add or identify a regression/contract test capable of detecting drift;
4. make one ownership-bounded change;
5. run focused tests and typecheck for the affected package;
6. run the relevant package suite;
7. inspect the complete diff and public exports;
8. if commit authorization exists, stage only the exact batch paths, inspect the
   staged diff, and commit one ownership-bounded batch; otherwise leave the verified
   diff unstaged and record its exact paths and verification;
9. stop before the next batch.

For delegated read-only reviews, use an isolated checkout or equivalent
write-isolated workspace. Record HEAD and `git status --porcelain` before and after
the review. Unexpected writes invalidate that review evidence and must be reconciled
before another batch starts.

### Risk rubric

```text
S  pure or owner-local extraction with no authority transition
M  bounded stateful owner or compatibility boundary
L  cross-owner workflow, public contract, or lifecycle transition
XL authority, persistence, concurrency, rollback, or multi-owner transaction
```

For behavior-preserving refactors, request/profile/embedding identities must remain
unchanged. A clean build may change the compiled-runtime tree identity because files
move; measure that identity only from the exact clean implementation commit when an
evidence receipt requires it.

## Phase 0 — Rebaseline and close live authority defects

### 0.1 Current finding ledger

Record current disposition:

- F021: resolved by `6a5ee87`;
- F022: torn semantic-search disclosure resolved by `6a5ee87`;
- F067: the marker-withdrawn interval remains intentional fail-closed availability
  behavior, not an open defect; do not add a speculative completion or `replacing`
  marker. A future mutation-intent record would require separate authorization and a
  durable contract;
- F050: resolved by provider-backed lazy startup recovery;
- F024: resolved by `e56c973`;
- F023: resolved by `83fb255`.

Stopping condition: no implementation task refers to F021, F022, F023, F024, F050,
or F067 as an unfixed incident.

### 0.2 F024 durable-recovery prerequisite — completed by `e56c973`

Add phase-aware validation for `swapping` restore journals. Before resuming each
entry, every target, temporary artifact, and displaced artifact must match the
allowed digest/state for that transaction phase and entry. A mismatched or newer
authority fails closed; recovery must not move it aside.

Required test:

```text
interrupted swapping journal
+ newer authority publication
→ recovery refuses displacement
→ newer authority remains exact
```

Stopping condition: durable recovery proves transaction ownership before replacing
any remaining authority path, and it has a complete phase/state contract before
extraction.

### 0.3 F023 staging-owner prerequisite — completed by `83fb255`

Owners:

- navigation sidecar staging;
- synchronizer checkpoint staging.

Required behavior:

```text
post-rename qualification/fsync failure
→ staging owner verifies the final path still belongs to this staging attempt
→ staging owner removes only that identity-bound final artifact and fsyncs its parent
→ cleanup confirmation is recorded before claiming the artifact is absent

cleanup/remove/parent-fsync cannot be confirmed
→ caller receives failure with explicit unresolved-cleanup evidence
→ artifact never becomes authoritative
```

Do not broadly remove a final path merely because a prior rename succeeded.

Required tests: deterministic failure after final rename for each staging owner,
including an identity change before cleanup and an unconfirmable cleanup path.

Stopping condition: no artifact created by a failed attempt remains when
identity-bound removal and parent-directory durability can be confirmed; otherwise
the owner preserves explicit unresolved-cleanup evidence and never treats the artifact
as authoritative.

## Phase 1 — Low-risk owner-internal extractions

Execute these batches sequentially unless the required production parallelism preflight
proves their complete touched-file sets are disjoint.

### 1.1 Move the root gitignore matcher cache

Completed by `f70f972`.

Move `rootGitignoreMatcherCache` into `SearchQuerySupport`, preserving the existing
`ToolHandlers` lifecycle and reload policy.

Risk: S.

Stopping condition: cache behavior, force-reload cadence, path canonicalization,
and search outputs are unchanged.

### 1.2 Extract pure sidecar validators

Completed by `7932fa8`.

Create a validator module for symbol, relationship, seal, resolution-proof, and
analysis-evidence parsing. Preserve `symbols/index.ts` re-exports.

Do not move atomic write or publication callbacks in this batch.

Risk: S.

Stopping condition: existing sidecar fixtures round-trip identically and malformed
inputs receive unchanged classifications.

### 1.3 Extract only stateless synchronizer snapshot codec logic

Completed by `9f77131`.

Move serialization, parsing, and stateless validation only.

Keep these in `FileSynchronizer`:

- checkpoint staging and commit;
- atomic write/fsync/rename;
- snapshot loading into instance state;
- checkpoint authority and observation tokens;
- freshness comparisons.

Risk: M.

Stopping condition: V2/V3 migration and byte-level payload fixtures remain exact. The
Phase 1.3 batch sheet must resolve the exact fixture names — e.g. `FileSynchronizer
defers legacy snapshot replacement until a prepared checkpoint commits`, `FileSynchronizer
snapshot JSON key order is independent of String.prototype.localeCompare`, and
`FileSynchronizer rejects corrupt current-format snapshots` in
`packages/core/src/sync/synchronizer.test.ts` — or mark `new oracle required`; the sheet
must state explicitly whether byte-exact payload fixtures already exist or are new.

### 1.4 Extract CLI neutral contracts, detection, and runtime paths

Completed by `cec0d14`.

Create bounded modules for:

- install/client contracts;
- client target resolution and detection;
- pure managed-runtime path resolution.

Keep `install.ts` as a compatibility façade and re-export established public symbols.

Risk: M.

Stopping condition: client auto/all detection, configured path handling, and public
imports remain unchanged.

## Phase 2 — Core utility/storage seams

### 2.1 Complete the sidecar read boundary

Completed by `06bb5db`.

Order:

1. shared generation/seal helpers;
2. seal verification and generation resolution;
3. symbol-registry reads;
4. relationship reads.

Keep sidecar-specific rollback/replace behavior with the write lifecycle.

Risk: M.

Stopping condition: navigation seal, registry, and relationship read contracts remain
exact through existing package exports.

### 2.2 Extract synchronizer scanning behind an explicit context

Define a scan context containing only:

- canonical root identity;
- ignore matcher;
- supported extensions;
- hash/full-hash policy;
- bounded concurrency;
- prior stat/hash evidence needed by the scan.

Return immutable scan results. `FileSynchronizer` retains checkpoint and freshness
state.

Risk: M.

Stopping condition: symlink/root safety, partial scans, cached stat behavior, full
hashing, and concurrency fixtures remain unchanged.

The Phase 2.2 batch sheet must add a deterministic bounded-concurrency oracle; no
current synchronizer fixture directly proves the scan worker bound. Resolve the
remaining named behaviors to exact existing fixtures under the normal batch-sheet
gate.

### 2.3 Extract the Python relationship-resolution engine

Define a real engine contract rather than reusing only generic proof helpers.

Inputs must explicitly include module/symbol indexes, flow facts, ownership evidence,
and resolution settings. Outputs must contain resolved edges and proof evidence without
publishing side effects.

Keep `builder.ts` as the analyze → resolve → emit pipeline façade.

Risk: L.

Stopping condition: full rebuild and delta relationship outputs are identical,
including proof steps and deterministic order.

### 2.4 Complete sidecar write/lifecycle decomposition

After read contracts are stable, separate:

- symbol writes;
- relationship writes;
- generation staging/publish/discard/prune;
- sidecar-specific atomic replacement/rollback.

The sidecar modules store artifacts. They do not decide which generation is active.

Risk: L.

Stopping condition: F023 remains closed and publication/rollback fixtures are exact.

## Phase 3 — Policy ownership

### 3.1 Extract `IndexPolicyRuntimeService`

Own:

- runtime profile/custom extension/custom ignore composition;
- policy hash resolution;
- runtime compatibility evaluation.

Do not own `publishedPolicyBindingsByCodebase` or active generation state.

Risk: L.

Stopping condition: policy hashes, compatibility outcomes, and control signatures are
unchanged for all current fixtures.

### 3.2 Extract `IndexPolicyDocumentStore`

Own durable policy document I/O and reuse the existing policy mutation lock owner.
Do not create a second broadly named policy coordinator.

Risk: M.

Stopping condition: durable formats and locking behavior remain unchanged; no active
generation state enters the store.

The Phase 3.2 batch sheet must add direct owner-level document-store and mutation-lock
contract tests before moving production I/O. Existing `Context` policy fixtures remain
integration oracles, not substitutes for the extracted owner's contract.

### 3.3 Extract durable restore transaction mechanics

Move the corrected F024 transaction parser/writer/executor behind a narrow internal
contract. It remains an infrastructure dependency of generation authority.

Risk: M.

Stopping condition: prepared/swapping/recovery/newer-authority fixtures pass without
changing persisted journal format unless separately authorized.

## Phase 4 — Core generation authority

This is the XL track. Execute incrementally; do not rewrite `Context` in one batch.

### 4.1 Freeze the authority contract

Define the coordinator's inputs and results before moving mutable state.

Current proof state belongs to the coordinator created by
`createGenerationProofCoordinator()`. This batch must decide whether that owner is
composed by or re-parented into the authority coordinator; it must not create a
second proof cache or proof-flight registry.

Own:

- generation proof caches and proof flights;
- published collection/marker/navigation/policy binding;
- current phase-aware read/publication/retention gate;
- activation, rollback, retention, proof rebinding, and durable restoration.

Do not own:

- scanning or embedding;
- semantic ranking;
- MCP snapshots or root leases;
- navigation artifact serialization;
- source checkpoint persistence.

Add focused authority-contract tests before moving state.

Risk: M.

Stopping condition: the contract names one writer for proof state, publication
bindings, activation, rollback, retention, and durable restore decisions; every
dependency is a narrow port/type and no production state has moved yet.

### 4.2 Move proof state and exact binding validation

Move one mutable collection at a time. Keep `Context` methods as delegates.

Risk: L.

Stopping condition: warm proof, ABA, marker, payload-count, policy, navigation, and
observation-token tests pass without public API changes.

### 4.3 Move the current publication/read/retention state machine unchanged

Preserve the `6a5ee87` invariant. Do not fully serialize publication behind reader
drainage.

Risk: XL.

Stopping condition: F021 fork race, active-reader Q/R publication, retention cleanup,
failure recovery, and reader-drain tests all pass.

### 4.4 Move activation, rollback, retention, and durable restoration

Wire vector publication, marker/policy contracts, sidecar artifact ports, and source
checkpoint evidence through narrow dependencies.

Phase 3.3 owns restore transaction parsing/writing/execution mechanics. This batch
owns the authority decision to invoke those mechanics and must not duplicate them.
Use the existing Core checkpoint-evidence types behind a narrow dependency; do not
prematurely create the MCP read-facing `SourceFreshnessPort` from Phase 5.1.

Risk: XL.

Stopping condition: one owner writes active generation authority; Context delegates;
no persisted format or externally observable behavior changes.

### 4.5 Extract repair and full-index orchestration

After the authority owner is stable, extract a Core `IndexGenerationWorkflow` for
repair and full-index domain workflow. It owns Core candidate-generation operations,
generation proof, calls to publication/rollback/retention operations, and Core domain
results. It does not own MCP snapshot lifecycle, mutation leases, status/progress,
response envelopes, checkpoint persistence, or sidecar activation policy.

Here `generation proof` means orchestrating proof requests and consuming proof
results. Proof caches, proof flights, and exact binding validation remain exclusively
owned by the authority/proof owner established in Phases 4.1–4.2.

It calls the authority owner through narrow dependencies; it must not acquire
authority state by reachability through `Context`.

Risk: XL.

Stopping condition: repair, full index, partial limit, rollback, and navigation
publication fixtures pass through operation-level contracts.

### 4.6 Extract synchronizer registry last

Move registry/lifecycle access only after authority and policy consumers use narrow
ports.

Risk: M.

Stopping condition: Context retains compatibility delegates but no synchronizer
domain state or policy decisions.

## Phase 5 — MCP read, freshness, and mutation boundaries

### 5.1 Centralize source readiness and full-index handoff

Define separately:

- a narrow Core `SourceFreshnessPort`, built on the existing checkpoint-evidence
  types, for read-facing preparation and revalidation;
- one MCP state owner for generation-scoped observations, handoff, and derived
  readiness.

The read-facing port must establish `prepareCurrentSourceObservation(...)` and
`revalidateCurrentSourceObservation(...)` before prepared reads are extracted.
Migrate `SyncManager`, full-index handoff, and direct search checkpoint inspection to
that owner before removing old paths.

Risk: L.

Stopping condition: one mutable MCP owner exists for checkpoint observation/handoff;
watcher, sync, source-state-unverified, and no-watcher fallback fixtures pass.

### 5.2 Extract a prepared publication-read session

Own the full lifetime:

```text
prepare readiness
→ acquire publication read lease
→ execute search/navigation read
→ revalidate authority
→ release lease
```

Do not place a short-lived lease callback inside readiness preparation.
Depend on `SourceFreshnessPort` from the first batch; do not take a new direct
dependency on `SyncManager` or `ToolHandlers` readiness internals.

R3 resolution (sealed with the 5.1 repair): the search session's revalidation
callable remains `finalBarrierChanged` (compatibility rule), and its
source-freshness components are port-backed — full-comparison branches call
`compareCurrentSourceToCheckpoint` / `compareAllCurrentSourceToCheckpoint` and
the prepared-read cache flows through `SyncManager → SourceObservationState →
port.currentObservationToken`. The port's registered-token
`revalidateCurrentSourceObservation` is not substituted because it cannot
reproduce the richer barrier semantics. Navigation sessions revalidate
navigation/watcher identity and are out of source-freshness scope.

Risk: M.

Stopping condition: search, outline, call-graph, continuation, and failure paths prove
lease release and final revalidation.

### 5.3 Introduce an operation-level `IndexMutationPort`

The port exposes Core mutation/publication operations. It does not contain MCP
snapshot phases or response projection.

Keep `ManageIndexingHandlers` as the request/action coordinator. The concrete large
workflow is `ManageIndexingHandlers.startBackgroundIndexing()`. If it needs a file
move, extract a named MCP `FullIndexActionCoordinator` with explicit inputs/results.
It owns request/action interpretation, mutation-lease use, MCP lifecycle phases,
calls to `IndexMutationPort`, status/progress, and response projection. It does not
own generation authority, policy publication rules, checkpoint storage, or sidecar
activation rules.

Risk: L.

Stopping condition: handler host no longer exposes raw Context/vector/publication
capabilities; operation phase order and responses remain unchanged.

## Phase 6 — MCP search/navigation decomposition

### 6.1 Extract `SearchRequestCoordinator`

Move the dominant search attempt only after prepared-read and freshness boundaries
exist. Depend on existing leaf modules and bounded collaborators, not dozens of
private `ToolHandlers` callbacks.

Risk: L.

Stopping condition: exact registry, semantic execution, grouping, continuation
admission, hints, diagnostics, and source-drift retry behavior remain unchanged.

### 6.2 Move continuation handling

Continuation must depend on the bounded search/read owner, not `ToolHandlers` as an
ownership token and capability bag.

Risk: M.

Stopping condition: frozen set identity, offset, runtime/publication/source
revalidation, cache mutation, and response projection fixtures remain exact.

### 6.3 Extract pure retrieval-pass execution

Return ordered, labelled retrieval-pass outcomes only. Keep fusion, filtering,
`must:` admission, survival diagnostics, reranker admission, and provider ordering in
the established owner.

Risk: L.

Stopping condition: canonical request/ranking/diagnostic fixtures and provider-order
tests remain byte/order equivalent; no request/profile digest changes occur.

### 6.4 Extract call-graph request handling

Do this after prepared-read session extraction so the new module does not recreate
the broad readiness/currentness host.

Risk: M.

Stopping condition: exact-symbol resolution, depth, continuation, sealed authority,
and partial-coverage behavior remain unchanged.

### 6.5 Leave cohesive owners alone

- Keep `SnapshotManager` intact.
- Keep `symbol-context-composer.ts` until a new demonstrated owner appears.
- Keep runtime-owner domain logic in `runtime-owner.ts`; move only MCP response
  adaptation if it materially shrinks handlers.

## Phase 7 — CLI decomposition

Execute sequentially by default while preserving `install.ts` exports:

1. Client config mutation builders. Risk: M. Stop when exact Codex, Claude Code,
   and OpenCode mutation fixtures remain unchanged.
2. Client config inspection/runtime authority. Risk: L. Stop when all supported
   client inspection fixtures and managed-launcher precedence remain unchanged.
3. Runtime and reranker/vector-store selection. Risk: M. Stop when offline/connected
   defaults, explicit overrides, dimensions, and provider selections remain exact.
4. Install planning as a pure mutation plan. Risk: M. Stop when dry-run, auto/all
   detection, prepared target sets, and no-write guarantees remain exact.
5. Install application/activation/lock/cleanup as a separate executor. Risk: L. Stop
   when activation, mutation locking, cleanup, local developer install, and rollback
   fixtures remain exact. Preserve the existing
   `installLocalMcpRuntime delegates exact local selection and preflights before
   activation` script fixture; add an executor-level oracle only if that fixture does
   not cross the extracted application boundary.
6. Runtime upgrade orchestration last. Risk: L. Stop when version selection,
   published-runtime activation, launcher precedence, and rollback fixtures remain
   exact.

Do not merge planning and application into one generic module. When a batch changes
`install.ts` exports, package entrypoints, runtime-path resolution, or client
discovery, run the relevant packed-artifact proof in addition to source-tree tests
(using the existing package-installability or packed release-smoke owner as applicable).

Privacy-safe doctor output remains a cross-batch public oracle whenever inspection,
runtime authority, selection, or launcher behavior moves.

## Test migration policy

There is no final “test split” phase. Each production extraction owns its test move.

Keep public integration oracles while adding owner-level contracts. Suggested
destinations include:

- generation proof;
- publication/read/retention;
- policy runtime;
- policy document store;
- durable restoration;
- repair/full index;
- synchronizer registry;
- source readiness/handoff;
- prepared publication reads;
- search request/continuation;
- sidecar read/write lifecycle;
- Python resolution engine;
- CLI mutation, inspection, selection, planning, and application.

Do not weaken, delete, or rewrite expected behavior merely to permit a move.

## Architecture guardrails after extraction

Add checks only after the target boundary exists:

- no new mutable domain state in `Context`;
- no raw Context/vector/persistence capabilities in new MCP handler hosts;
- only the approved authority owner writes generation/marker/policy/navigation
  activation state;
- new domain services may not depend on broad `Context`;
- enforce `Context → domain coordinator → narrow stores/ports` and MCP coordinator
  → Core public/narrow port imports; reject Core → MCP imports;
- when a target boundary first exists, add an enforceable import/ownership check in
  that same batch before relying on the boundary as an invariant;
- public façade exports remain stable;
- size/complexity metrics remain reporting signals, not hard gates.

## Completion criteria

The decomposition is complete only when:

1. every mutable domain has one named authoritative owner;
2. F023/F024 are closed before their code is moved;
3. F021/F022 behavior remains closed without full serialization or a speculative
   completion marker;
4. `Context` delegates established APIs and owns no new domain state;
5. MCP mutation/read/search coordinators use bounded contracts;
6. all package tests/typechecks and affected contract manifests pass;
7. public exports and persisted formats remain compatible;
8. each batch is independently reviewable and, when commit authorization exists,
   independently committed;
9. no unrelated user work is staged, modified, or committed.

## Recommended next implementation batch

At checkpoint `cec0d14`, start with Phase 2.1: complete the sidecar read boundary.
Derive a current-HEAD batch sheet naming the exact shared generation/seal helpers,
seal verification and generation resolution, symbol-registry reads, relationship
reads, and affected contract tests. Keep sidecar-specific rollback, replace, and
write lifecycle behavior with its existing owner.
