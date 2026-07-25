# Satori checkpoint integrity repair review

Status: proposed for technical review

Created: 2026-07-25

Current authorization: C0 only, after the decisions in section 12 are accepted

Evidence index:
[OPEN_FINDINGS_REVIEW_INDEX.md](./OPEN_FINDINGS_REVIEW_INDEX.md)

## 1. Purpose and bounded decision

The Satori 6.3.0 qualification found a usable vector generation whose source
checkpoint could not validate against the active completion marker.
Incremental sync then required reindex. This plan determines where that
incompatible tuple first arose and defines the smallest truthful repair.

Authorize only a durable reproduction and first-wrong-boundary trace. Do not
authorize a new publication mechanism, marker interpretation, lock, manifest,
or production repair until C0 distinguishes:

- corruption introduced by repair;
- corruption that predated repair;
- corruption introduced during restart or recovery;
- a legacy-authority path; and
- failure to reproduce the reported scenario.

This plan does not own Python call-graph coverage, semantic abstention, general
watcher latency, or progress-event ordering.

## 2. Repair contract

| Contract item | Requirement |
| --- | --- |
| Observable outcome | A successful repair leaves a source checkpoint compatible with the selected readable publication; the next explicit incremental sync does not require reindex |
| Smallest disproof | Repair returns `ok`, changes the selected marker identity, leaves the checkpoint owned by an incompatible identity, and the next sync rejects it |
| Nearest Core readback | Selected canonical publication tuple, completion marker, source checkpoint, policy binding, graph/navigation authority, and mutation receipt after restart |
| Nearest product readback | Canonical `manage_index repair`, restart, explicit zero-change sync, then add/modify/delete exact-token witnesses |
| Must preserve | Proven vector membership, source authority, mutation-lease ownership, previous readable publication on failure, deterministic navigation, and restart readback |
| Forbidden in healthy/navigation-only modes | Embedding or vector payload writes; metadata rewritten merely to make incompatible identities look equal |

Repair modes remain separate:

| Mode | Required behavior |
| --- | --- |
| Healthy and exactly proven | Exact no-op; no authority-bearing artifact changes |
| Navigation damaged; source tuple valid and stable | Activate only a newly sealed graph/navigation component through an already proven publication model, or fail closed |
| Marker/checkpoint missing or corrupt | Do not call it navigation-only repair; require reindex unless a separately authorized source-publication path truthfully recreates source authority |
| Source or payload changed | Use the existing sync/reindex decision; do not repair metadata over changed data |

Vector usability alone does not establish checkpoint integrity.

## 3. Recorded failure and evidence boundary

Five corrected add/modify/delete cycles returned no exact-token groups.
Recovery `manage_index sync` returned:

```text
Generation checkpoint does not belong to the active completion marker.
```

Search lifecycle remained `status=ok`; therefore the vector generation was
readable while incremental source publication was disabled.

The retained report does not establish whether the mismatch existed before
repair, was introduced by repair, or appeared during a later lifecycle
transition. It also does not retain the original complete repair request.
C0 must use a newly frozen canonical request unless an original durable request
is recovered.

## 4. Current model: source-read facts

At the frozen Satori revision:

- `Context.writeCompletedIndexMarker(...)` in
  `packages/core/src/core/context.ts:1943` defaults `runId` to a new UUID.
- `Context.repairIndex(...)` begins at
  `packages/core/src/core/context.ts:6795`.
- Its generic successful path reaches
  `packages/core/src/core/context.ts:7720`, writes a new completion marker, and
  publishes a sealed policy binding without staging a matching source
  checkpoint in that path.
- `Context.publishSealedPolicyBindingForMarker(...)` at line 2945 passes only
  collection and navigation when it must publish a changed binding. It does
  not carry the current V4 `publication` or construct a replacement
  source-checkpoint tuple.
- `Context.persistCustomIndexPolicy(...)` at line 9071 serializes a V4 policy
  only when `binding.publication` is present. The generic repair binding
  therefore serializes as V3 when it is republished. If the binding is judged
  unchanged and publication is skipped instead, the retained V4
  source-checkpoint tuple still names the preceding marker.
- `FileSynchronizer.assertValidGenerationSnapshot(...)` in
  `packages/core/src/sync/synchronizer.ts:1096` requires the checkpoint
  collection, `markerRunId`, and policy hash to match selected authority. The
  recorded message is raised at line 1115.
- `ManageIndexingHandlers.handleRepairIndex(...)` proves collection, marker,
  payload count, and navigation after generic repair. Its source-checkpoint
  inspection at `packages/mcp/src/core/manage-indexing-handlers.ts:1260` runs
  only when Core returns `activatedGeneration`, which the relationship-only
  path does and the generic path does not.
- `CanonicalPublicationBinding` in
  `packages/core/src/core/persisted-index-authority.ts` already separates an
  activation ID, source-checkpoint tuple, relationship graph manifest, and
  mutation receipt.
- The relationship-only repair branch proves a marker-owned checkpoint,
  performs a complete zero-change source observation, preserves the source
  tuple, stages navigation, and activates a graph through a new publication
  binding.
- That branch is selected only for `relationship_only_upgrade`; a
  fingerprint-compatible repair can still reach the generic marker writer.
- Existing tests cover relationship-only restart preservation. The generic
  missing-navigation test does not assert immediate checkpoint validation and
  incremental sync.

These facts support a defect-capable mechanism. They do not prove that the
generic path caused the recorded failure.

The source-supported transition is now:

```text
valid V4 marker + matching source checkpoint
-> fingerprint-compatible generic repair
-> fresh marker runId
-> no checkpoint staged for that runId
-> changed binding is serialized as V3, or an unchanged V4 binding retains
   the preceding source-checkpoint markerRunId
-> generic MCP success proof omits checkpoint readback
-> repair can return ok
-> the next synchronizer loads the old checkpoint under fresh marker authority
-> exact ownership validation rejects it
```

This is the leading mechanism, not yet the historical root cause. One focused
V4 fixture must move this chain from `mechanism-supported` to
`intervention-proven`.

The durable identities currently include:

```text
completion marker runId
source checkpoint authority:
    collectionName
    markerRunId
    indexPolicyHash
source checkpoint:
    merkleRoot
    documentDigest
publication activationId
navigation generationId and sealHash
relationship manifestHash
mutation receipt:
    ownerId
    generation
    operationId
```

Do not add a new identity until C0 proves the current V4 model cannot express
the required transition.

## 5. Canonical reproduction and C0 state matrix

### 5.1 Canonical request

First search the task-owned evidence bundle for an original serialized repair
request. Use it only if its provenance and digest are verified. Otherwise:

1. construct a canonical request from retained facts and the current public
   schema;
2. freeze it before running the repair;
3. record each field using the provenance vocabulary in the review index; and
4. call the result a scenario reproduction, not an exact replay.

The receipt must preserve the complete serialized request and response,
including absent optional fields.

### 5.2 Required state history

C0 must exercise this matrix in task-owned state:

| Starting state | Transition |
| --- | --- |
| Healthy V4 publication and authority checkpoint, with navigation removed or made repairable | Generic compatible repair, checkpoint inspection, and zero-change sync |
| Healthy V4 publication | Generic compatible repair |
| Healthy V4 publication | Relationship-only upgrade |
| V4 valid source tuple with missing navigation | Repair |
| V4 publication with an already corrupt checkpoint | Repair |
| Legacy V3 publication | Satori 6.3 open and repair |
| Prior relationship fingerprint | Authorized reindex, then repair |
| Healthy or selected candidate | Restart before repair |
| Committed repair candidate | Restart after repair |

Where the available migration fixtures permit it, include a runtime-version
transition and a checkpoint mismatch present before repair.

The first row is the priority causal witness. Run it before the wider state
matrix:

```text
publish healthy V4 tuple
-> prove checkpoint valid
-> remove only repairable navigation authority
-> run generic repair
-> capture selected policy schema, marker, and checkpoint
-> inspect source freshness checkpoint
-> run explicit zero-change sync
```

Expected source-supported failure:

```text
repair status=ok
and markerRunId changes
and no matching checkpoint is published
and policy is downgraded to V3 or retains a stale V4 source tuple
and checkpoint inspection or sync reports marker ownership mismatch
```

If that witness does not reproduce, stop the generic-repair hypothesis before
considering a production edit and use the remaining matrix to identify which
precondition differs.

For every case, capture:

- the branch and writer actually executed;
- the authority resolver's selected publication tuple;
- marker, checkpoint, policy, graph, navigation, and receipt documents plus
  hashes;
- exact vector membership/count proof;
- the validator and reason selected after restart; and
- all writes grouped by owning component.

Required C0 terminal outcomes are:

```text
checkpoint_mismatch_reproduced_by_repair
checkpoint_mismatch_preexisted_repair
checkpoint_mismatch_introduced_on_restart
checkpoint_legacy_authority_path_observed
checkpoint_original_scenario_not_reproducible
checkpoint_first_wrong_boundary_blocked
```

Do not collapse these into a generic “still open” result.

## 6. Stable source observation

A complete hash of a live working tree is not an atomic filesystem snapshot.
The required invariant is narrower: the activated graph, vector payload,
marker, and checkpoint must describe one internally consistent observed source
state. A source write after final validation may be the next incremental delta;
it need not invalidate an already consistent publication merely because it
occurred immediately before or after activation.

C0 must determine what the current system can prove through:

- `PreparedChanges.assertSourceObservationCurrent` or its actual owner;
- watcher/source observation generations;
- file stat and content hashes;
- publication-generation leases; and
- any existing task-owned source snapshot mechanism.

The accepted production contract is:

1. build from one prepared source observation;
2. revalidate that observation after graph staging and immediately before
   synchronous activation;
3. reject or restart when source differs at that final validation;
4. activate a tuple that remains bound to the prepared checkpoint; and
5. preserve any later source write as an observable next incremental delta.

An immutable filesystem snapshot is not required unless the existing prepared
observation cannot satisfy this contract.

The qualification source itself is an immutable task-owned materialization.
The failure harness must additionally cover:

```text
external write during source hashing
external write after staging but before final source validation
external write after final validation but before synchronous activation
watcher event queued while repair holds the mutation lease
```

The first two pre-validation cases must restart proof or fail closed while
retaining the previous publication. The post-validation case may activate the
prepared tuple only if the checkpoint remains valid and an immediate next
full-source scan reports the write as a delta.

## 7. Candidate repairs, conditional on C0

### 7.1 Healthy-generation no-op

Before any repair write, prove:

- the selected marker, source checkpoint, policy binding, graph manifest, and
  navigation seal are mutually compatible and readable;
- exact vector membership and exact count under one stable backend
  observation;
- expected/observed counts and missing/extra counts;
- source observation identity; and
- no unresolved staged or competing authority exists.

If all checks pass, return `already_proven_no_change`.

Preserve every authority-bearing artifact byte-for-byte:

- selected marker and source checkpoint;
- active publication/policy binding;
- graph/navigation pointer, manifest, and seal;
- selected collection/completion identity; and
- mutation authority that selects the publication.

Append-only non-authoritative audit records are permitted. They must not alter
selection, compatibility, or publication identity.

### 7.2 Navigation-only activation

If C0 proves navigation must be rebuilt while the source tuple remains valid:

1. reopen the exact V4 publication and marker-owned checkpoint;
2. establish one stable complete source observation with zero changes;
3. prove exact vector membership/count under one stable backend observation;
4. stage and seal the new graph/navigation component;
5. revalidate source observation and lease authority immediately before
   activation;
6. activate through the existing canonical publication binding and mutation
   receipt;
7. preserve marker and checkpoint bytes; and
8. prove the selected tuple after restart.

If the V4 model cannot select a new graph without reinterpreting an immutable
marker or relabelling an old checkpoint, stop
`checkpoint_publication_model_blocked`.

### 7.3 Missing or corrupt source authority

Do not copy an old checkpoint under a new marker ID or preserve a marker while
mutating the publication it purports to identify. If existing recovery cannot
publish a truthful complete tuple, return `requires_reindex` without replacing
readable authority.

A staged source-publication redesign is a separate scope expansion. It requires
an observed failed recovery witness, an identified atomic activation owner,
and explicit authorization.

## 8. Execution batches

### C0 — Durable reproduction and first-wrong-boundary trace

Owners:

- nearest `Context.repairIndex` and synchronizer tests;
- nearest `manage_index repair` and `sync` handler tests; and
- a task-owned bounded evidence harness.

Tasks:

1. Freeze the canonical request and exact effective configuration.
2. Run the priority V4 generic-repair witness in section 5.2 through real Core
   and MCP owners.
3. Capture the selected policy schema and publication tuple before repair,
   immediately after repair, and after restart.
4. Inspect the source checkpoint immediately after repair, then run explicit
   zero-change sync and a controlled add/modify/delete exact-token
   witness where the starting state permits it.
5. Trace the repair branch, marker writer, V3/V4 serializer, MCP success proof,
   authority resolver, checkpoint validator, and every durable write.
6. Complete the remaining state matrix after the priority witness establishes
   or falsifies the leading mechanism.
7. Determine whether current source-observation evidence can survive external
   writes at the three boundaries in section 6.
8. Record baseline wall time, source files/bytes read, vector rows/bytes read,
   full observations, peak memory, and writes for:
   - healthy no-op candidate;
   - navigation rebuild candidate; and
   - fallback full proof.
9. Preserve commands, outputs, timestamps, versions, configuration digests,
   source hashes, and initial/final Git state.

Exit only with one exact C0 terminal outcome and a first-wrong-boundary trace.
C0 does not authorize production changes.

#### C0 priority witness execution record — 2026-07-25

The focused task-owned Core fixture now exists as:

```text
Context.repairIndex generic navigation repair preserves a valid v4 source checkpoint
```

Command:

```bash
pnpm --filter @zokizuan/satori-core exec node \
  --import tsx \
  --import ./src/test-state-root.ts \
  --test \
  --test-concurrency=1 \
  --test-name-pattern="Context.repairIndex generic navigation repair preserves a valid v4 source checkpoint" \
  src/core/context.test.ts
```

The fixture established a healthy V4 publication and valid authority-scoped
checkpoint, removed only navigation state, ran generic repair, restarted
authority resolution, inspected the checkpoint, and attempted zero-change
synchronizer initialization.

Observed receipt:

```text
repairStatus: ok
policySchema: satori_index_policy_v3
markerRunIdBefore: f5d46002-0273-464a-bf4d-099c7d036152
markerRunIdAfter: 87e4cbdd-2da5-44cd-bae1-5193c9896935
publicationCheckpointMarkerRunId: null
checkpointAfter.status: corrupt
checkpointAfter.message:
    [Synchronizer] Generation checkpoint does not belong to the active
    completion marker.
zeroChangeSyncError:
    [Synchronizer] Generation checkpoint does not belong to the active
    completion marker.
```

The UUID values identify this disposable run only. The stable evidence is that
the marker changed, V4 publication authority was lost, no replacement
checkpoint was published, and both nearest readbacks rejected the resulting
tuple.

Decision:

```text
checkpoint_mismatch_reproduced_by_repair
```

First wrong durable boundary:

```text
Context.repairIndex generic publication
-> fresh completion marker is written without a matching staged checkpoint
-> publishSealedPolicyBindingForMarker receives no V4 publication
-> persistCustomIndexPolicy serializes V3 authority
```

The generic MCP success path can subsequently accept collection, marker,
payload, and navigation proof because it performs source-checkpoint readback
only for `activatedGeneration`.

Evidence level:

- intervention-proven for this controlled V4 navigation-repair fixture;
- mechanism-supported, but not exact historical replay, for the retained
  `tradingview_ratio` qualification.

The desired-invariant test is intentionally red on the current implementation:
expected checkpoint status `valid`, observed `corrupt`. Do not weaken it to
accept the defect.

#### C0 model-selection controls — 2026-07-25

The same desired-invariant fixture was repeated without removing navigation.
It produced the same stable result:

```text
healthy V4 repair status: ok
policy after repair: satori_index_policy_v3
markerRunId: changed
checkpoint after restart: corrupt
zero-change synchronizer initialization: marker ownership mismatch
```

Therefore the defect is not conditional on damaged navigation. A healthy V4
repair also reaches the unsafe generic writer. C1's exact no-op is the selected
healthy-generation repair.

Contrasting controls:

| Control | Result | Decision |
| --- | --- | --- |
| Existing relationship-only V4 activation | Pass: marker and checkpoint preserved, graph changed, restart proof valid, no vector/checkpoint writes | Existing V4 publication model is sufficient for C2 |
| Prepared source changed before final revalidation | Pass: `FileSynchronizer` rejected the stale observation | Existing final revalidation owns the pre-activation source check |
| Source changed synchronously after final revalidation and before activation | Pass: prepared tuple remained valid and the next full scan reported `src/auth.ts` modified | Treat as the next delta; do not require an impossible instantaneous working-tree lock |
| Legacy V3 relationship-only repair | Pass: refused to infer V4 source authority | Missing/legacy source authority remains fail-closed/reindex |

Commands used the same pinned Core test runner and exact
`--test-name-pattern` for:

```text
Context.repairIndex healthy generic repair preserves a valid v4 source checkpoint
Context.repairIndex atomically upgrades only relationship navigation under a proven v4 publication
FileSynchronizer rejects a prepared publication after its source observation changes
Context.repairIndex leaves a post-validation source write as an observable next delta
Context.repairIndex does not infer relationship-only authority from a legacy v3 publication
```

Bounded technical conclusion:

```text
healthy, fully proven V4
    -> exact no-op before the generic marker writer

valid V4 source tuple with graph/navigation repair required
    -> reuse the existing staged relationship-only V4 graph activation shape

legacy V3, missing checkpoint, corrupt checkpoint, or changed source/payload
    -> fail closed with requires_reindex

every successful MCP repair
    -> inspect the source checkpoint, not only activatedGeneration results
```

No new publication manifest, pointer, lock, filesystem snapshot service, or
generation identity is justified by the reproduced evidence.

C0 has reached a causal and model-selection conclusion for the frozen
mechanism. Performance budgets, the remaining compatibility matrix, and
production implementation/qualification remain incomplete; C1-C4 are still
unauthorized.

### C1 — Healthy-generation no-op

Entry requires:

- `checkpoint_mismatch_reproduced_by_repair` through an already healthy path;
- approved proof inputs; and
- approved performance budgets.

Implement the smallest exact proof before the defect-causing writer. Prove the
authority artifacts stay byte-identical, forbidden writes are zero, repair
acknowledgement failure cannot fabricate success, restart selects the same
tuple, and immediate sync plus add/modify/delete succeeds.

Terminal outcomes:

```text
checkpoint_healthy_repair_noop_pass
checkpoint_healthy_repair_not_proven
checkpoint_performance_budget_blocked
```

### C2 — Navigation-only activation

Entry requires:

- C0 proves navigation rebuild is necessary;
- intact V4 source/checkpoint/vector authority;
- an accepted stable-source observation; and
- approved performance budgets.

Reuse existing V4 publication and mutation owners. Change readers only where
C0 demonstrates they select the wrong existing component. Reject V3, missing,
malformed, future, and ambiguous authority without replacement writes.

Terminal outcomes:

```text
checkpoint_navigation_only_activation_pass
checkpoint_publication_model_blocked
checkpoint_source_authority_unavailable
checkpoint_stable_source_observation_blocked
checkpoint_performance_budget_blocked
```

### C3 — Failure, concurrency, restart, and rollback

Use a small state-machine/failure-injection harness over every changed durable
boundary. It must exercise:

```text
sync acquires authority before repair
repair acquires authority before sync
sync queues during graph staging
lease expires during staging
second repair begins during first repair
activation commits but acknowledgement is lost
restart before staging
restart after staging but before activation
restart during/after activation
external write during source observation
external write before final source revalidation
post-validation source write observed as the next delta
watcher event queues while the repair lease is held
```

At each uncommitted failure, the prior publication remains selected. At each
committed boundary, restart selects one complete old or new tuple, never a
mixture.

Rollback is an executed witness in cloned state:

```text
retain prior runtime and compatible publication
-> prevent qualification GC from removing them
-> activate new publication
-> restart and verify
-> atomically reactivate retained prior publication
-> restart and verify
-> prove no mixed tuple
```

Any old-runtime readback uses a cloned state root in read-only mode unless
write compatibility is explicitly authorized. C0/C1 must freeze the retention
window and selection mechanism before C3.

Terminal outcomes:

```text
checkpoint_failure_atomicity_pass
checkpoint_concurrency_model_blocked
checkpoint_compatibility_migration_required
checkpoint_rollback_blocked
```

### C4 — Isolated product qualification

Use the exact task-owned target materialization, two independent state roots,
task-owned LanceDB paths, watcher disabled for deterministic operations, and
the frozen canonical request.

Run:

```text
fresh reindex
-> capture selected publication tuple
-> repair
-> restart
-> zero-change sync
-> add token / sync / exact hit
-> modify token / sync / old miss and new hit
-> delete / sync / exact miss
-> final restart and publication proof
```

Also perform one reversible source change that alters a supported relationship
or navigation input:

```text
full build
-> controlled source change
-> explicit incremental sync
-> expected graph/navigation change
-> restore source
-> explicit incremental sync
-> original graph/navigation restored
-> compare with a fresh full-build digest
```

Run the source-write failure witnesses from section 6 against the production
owners. Repeat from the second state root and compare normalized receipts.

Terminal outcomes:

```text
checkpoint_integrity_and_incremental_freshness_pass
checkpoint_repair_still_corrupts_source_authority
checkpoint_product_readback_blocked
checkpoint_configuration_reproduction_blocked
```

## 9. Frozen C0 performance and rollback decisions

The C0 fixture uses one TypeScript source file, two chunks, `TestEmbedding`,
`ForkingInMemoryLanceVectorDatabase`, a fresh Node process per sample, Node
24.13.0, and pnpm 10.28.2. These gates detect regression in the frozen fixture;
they are not universal repository latency or memory claims.

Five measured process-level repetitions produced:

| Path | Median elapsed | Maximum RSS |
| --- | ---: | ---: |
| Current healthy generic repair witness | 1.74 s | 204,000 KiB |
| Existing safe V4 graph-only repair, after one discarded warmup | 1.70 s | 205,480 KiB |

Frozen C1/C2 gates:

| Path | Elapsed gate | RSS gate | Forbidden work |
| --- | ---: | ---: | --- |
| Healthy exact no-op | median `<=2.09 s` | max `<=269,536 KiB` | embedding, vector, marker, checkpoint, policy, graph, or navigation writes |
| V4 graph-only activation | median `<=2.04 s` | max `<=271,016 KiB` | embedding, vector, marker, or checkpoint writes; no extra source/vector proof pass beyond the existing repair proof |

Both paths must remain at or below 1.20x the respective C0 median and no more
than 64 MiB above the C0 maximum RSS. Operation-level assertions, not timing
alone, prove forbidden work is zero.

Fallback full publication is not authorized by C1/C2. Legacy, missing, corrupt,
or ambiguous source authority returns `requires_reindex`.

Retention and rollback are frozen as:

- reuse the current publication-retention owner and read/retention leases;
- retain the preceding V4 policy bytes and preceding graph generation through
  activation, restart, checkpoint inspection, and zero-change sync;
- do not permit qualification cleanup to prune that preceding generation;
- use `captureDurableIndexAuthority(...)` and
  `restoreDurableIndexAuthority(...)` under the existing mutation fence as the
  rollback activation owner;
- prove rollback by selecting the prior policy, restarting, and reading the
  prior graph/checkpoint tuple; and
- do not test old-runtime writes. Compatibility readback uses cloned,
  task-owned state only.

## 10. Verification and closure

Required checks for the changed owners before C4:

```bash
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-core typecheck
pnpm --filter @zokizuan/satori-core build
pnpm --filter @zokizuan/satori-mcp test
pnpm --filter @zokizuan/satori-mcp typecheck
pnpm --filter @zokizuan/satori-mcp build:runtime
pnpm exec eslint <changed TypeScript files>
git diff --check
```

The checkpoint finding closes only if:

1. the first wrong transition is intervention-proven;
2. the selected publication tuple remains complete and compatible after
   restart;
3. stable source observation rejects pre-validation changes and exposes later
   writes as the next delta;
4. exact membership and count are proven without forbidden writes;
5. zero-change and add/modify/delete explicit sync succeed without reindex;
6. failure/concurrency tests preserve one complete old or new tuple;
7. operational rollback succeeds;
8. approved absolute and relative performance budgets pass; and
9. the two-state-root product receipt passes.

This closes checkpoint integrity and explicit incremental sync for the tested
publication model. It does not close watcher latency generally.

## 11. Durable receipt

The receipt must retain:

- source, target, runtime, package, and configuration identities;
- canonical request provenance manifest;
- complete requests/responses and timestamps;
- selected authority tuples before/after/restart;
- marker, checkpoint, policy, graph/navigation, and receipt documents plus
  hashes;
- exact membership proof basis and counts;
- source-observation tokens and external-write traces;
- commands, exit codes, bounded logs, and benchmark samples;
- rollback activation/readback;
- both state-root normalized digests; and
- initial/final Git state.

External sources may explain a mechanism but cannot prove Satori behavior.
Where external evidence is retained, record canonical URL, capture time,
content digest, exact relevant location, and a portable exported artifact.

## 12. C1/C2 authorization decisions

1. Confirm the observed C0 outcome:
   `checkpoint_mismatch_reproduced_by_repair`.
2. Confirm prepared-source revalidation plus next-delta observability as the
   stable-source contract.
3. Confirm exact no-op for a fully proven healthy V4 publication.
4. Confirm reuse of existing V4 graph-only activation when navigation repair is
   genuinely required.
5. Confirm `requires_reindex` for legacy, missing, or corrupt source authority.
6. What absolute and relative performance budgets apply to each repair path?
7. How long are the prior runtime and publication retained, and what owner
   atomically selects rollback?

Items 1-5 were accepted by the C1/C2 authorization. Decisions 6-7 are frozen
in section 9. They do not authorize C3 or C4.

## 13. Terminal decision vocabulary

The final checkpoint record must retain the exact terminal outcome from the
batches above. In addition:

```text
checkpoint_integrity_and_incremental_freshness_pass
    All closure conditions passed for the frozen publication model.

checkpoint_vector_ready_freshness_open
    Vector search remains readable, but checkpoint integrity is not closed.

checkpoint_original_scenario_not_reproducible
    The canonical scenario did not reproduce the historical failure; no
    production repair is authorized from that historical claim.
```

No terminal cause is reduced to a generic open status. If a summary is needed,
it must retain the exact reason alongside the summary.

## 14. C1/C2 execution record

Status: `checkpoint_c1_c2_pass`

Integration base:
`3764b740d0f55081f98cc33fd4f6236046de8712`. The resulting revision is the
owner-bounded commit containing this record and is retained in the integration
receipt alongside the exact committed path list.

The implemented repair boundary now has exactly three outcomes:

1. a fully proven healthy V4 publication returns success without changing
   vector, marker, checkpoint, policy, graph, or navigation authority;
2. a valid V4 source publication whose navigation requires repair stages and
   activates only a new graph/navigation generation while preserving its
   marker and source-checkpoint authority; and
3. V3, missing checkpoint, corrupt checkpoint, changed source, or ambiguous
   publication authority returns `requires_reindex`.

The MCP repair handler now validates the effective source checkpoint after
every successful exact generation proof. A V4 activation receipt must also
name that checkpoint's exact document digest before success can be published.

The source-stability boundary is:

```text
checkpoint-owned complete observation
-> exact payload proof
-> prepared-source revalidation
-> graph-only activation
```

A filesystem write after prepared-source revalidation is intentionally not
folded into the repaired publication. The next forced incremental observation
reports it as the next delta.

The existing V4 authority model remains the sole owner. This batch added no
manifest, lock, snapshot service, publication identity, or synchronizer
compatibility relaxation.

Compatibility decision: no persisted schema, public MCP schema, package
version, or runtime fingerprint changed. Existing valid V4 publications remain
readable; a graph-only activation may bind a newer sealed navigation
generation while retaining the marker-owned source checkpoint. V3 and
missing/corrupt/ambiguous V4 source authority remain incompatible with repair
and require reindex. No compatibility relaxation or migration path was added.

### Performance result

Five post-change process-level repetitions produced:

| Path | Samples (seconds) | Median | Maximum RSS | Gate |
| --- | --- | ---: | ---: | --- |
| Healthy exact no-op | 1.93, 1.65, 1.80, 1.69, 1.75 | 1.75 s | 227,192 KiB | pass |
| V4 graph-only activation | 1.73, 1.80, 1.71, 1.77, 2.60 | 1.77 s | 205,724 KiB | pass |

The healthy path stayed below 2.09 seconds median and 269,536 KiB maximum RSS.
The graph-only path stayed below 2.04 seconds median and 271,016 KiB maximum
RSS. Operation-level assertions proved the forbidden writes were zero.

### Lifecycle and rollback evidence

The focused Core matrix passed all 27 `Context.repairIndex` tests. It includes:

- the two desired V4 checkpoint invariants;
- the four contrasting controls;
- V3, missing, corrupt, and ambiguous authority rejection;
- exact payload and source-observation failure paths;
- activation failure and acknowledgement-loss recovery;
- restart and zero-change synchronizer readback;
- a post-validation source write observed as the next delta;
- retention of the preceding V4 policy and graph generation; and
- actual rollback activation with `restoreDurableIndexAuthority(...)`,
  followed by restart and readback of the prior graph/checkpoint tuple.

All 13 focused MCP repair-handler tests passed. The complete MCP package passed
1,047 of 1,047 tests. Core and MCP typecheck, focused lint, Core build through
the MCP package, MCP runtime build, and `git diff --check` passed.

The complete Core package result was 584 passed, 3 failed, and 1 skipped out of
588 tests. The three failures concern generation-proof probe-count
expectations and do not invoke repair. A controlled run with the effective
navigation resolver restored byte-for-byte to its pre-C1/C2 behavior produced
the same three failures, so this batch did not alter those owners.

### Current stopping decision

C1 and C2 are complete for the frozen V4 repair model. C3 and C4 remain
unauthorized. Consequently this record does not yet claim the terminal
`checkpoint_integrity_and_incremental_freshness_pass` product qualification or
general watcher-latency closure.
