# MCP Watcher Observation and Sync Decoupling Plan

**Status:** W0 evidence and contract freeze authorized; W1–W4 unauthorized
**Date:** 2026-07-26
**Review base revision:** `ad443b872c467eb7ad6f4305b056c8fdc27dede5`
**Current authority:** `packages/mcp` and `packages/core` runtime code
**Related contract:** `docs/plans/INCREMENTAL_INDEX_FRESHNESS_PLAN.md`

This is a focused post-release execution plan for the watcher lifecycle. It does
not replace the broader freshness contract or add a second synchronization
algorithm. Only W0 read-only evidence gathering and contract freeze are
authorized. No production behavior change is authorized.

## 1. Decision

Authorize W0 only.

The working hypothesis is that watcher observation and watcher-owned
publication should be separated:

```text
filesystem event
  -> record process-local event evidence immediately
  -> invalidate source-bound assumptions
  -> do not acquire a mutation lease, embed, compare, or publish

existing freshness trigger
  -> search, periodic background work, or explicit sync
  -> consume pending event evidence through the existing ensureFreshness owner
  -> compare source state
  -> publish only when the comparison proves a delta
```

This is not yet an implementation decision.

W0 must establish:

- whether five-second watcher publication provides unique product correctness;
- the current cost and no-op rate of watcher-triggered work;
- exact search, continuation, ignore-rule, navigation-tool, restart, and
  watcher-failure behavior;
- whether one flight-owned event epoch can be consumed safely by the existing
  synchronization path.

W1–W4 remain unauthorized until W0 returns
`watcher_decoupling_supported` and the required later-batch contracts are
approved.

The watcher remains an observation source. This plan does not authorize removal
of Chokidar, a second synchronizer, a new publication authority, or changes to
Core checkpoint semantics.

Release sequencing:

> Ship the stabilized native release before this work. Watcher decoupling is a
> later behavior and configuration change and must not be folded into that
> release.

## 2. Why this work exists

The current implementation is safe in intent but couples observation to an
expensive side effect:

- `MCP_ENABLE_WATCHER` defaults to enabled.
- Chokidar observes successful, actively used indexed roots.
- An accepted event advances a process-local freshness epoch.
- A five-second timer is reset on every event.
- Timer expiry calls `ensureFreshness(root, 0)`, which may embed changes and
  publish a new generation.
- Search, periodic background work, and explicit `manage_index sync` already
  reach the same `ensureFreshness` owner.

The five-second value is a write-coalescing quiet period. It is not a freshness
SLA, and there is no retained product evidence showing that five seconds is the
right default.

### Current value that must be preserved

Filesystem observation is still useful for:

- detecting that source changed without repeatedly scanning the repository;
- invalidating frozen search continuations when their source observation
  changes;
- distinguishing observed source stability from `watcher_disabled` or
  `watcher_failed`;
- detecting ignore-policy control changes;
- preventing a prepared source observation from being treated as current after
  a known event.

### Current cost and complexity to challenge

Watcher-owned publication:

- performs unsolicited embedding and publication work while a user is editing;
- can create repeated generation, memory, and storage churn;
- overlaps with search-triggered, background, and manual freshness paths;
- makes a debounce timer part of shared-runtime behavior and identity;
- obscures whether “watching” means observation or automatic mutation.

### 2.1 Evidence levels used in this plan

```text
runtime-observed
    Preserved request, response, timing, process, or durable-state evidence.

source-read
    Exact current implementation or test source was inspected.

mechanism-supported
    Source and control flow show that the mechanism can produce the outcome.

intervention-proven
    A controlled implementation change moved the predicted boundary and the
    product witness.

unresolved
    Available evidence does not determine the mechanism or product decision.
```

Unless explicitly stated otherwise, the current-behavior statements in this
document are `source-read`. The recommendation to remove watcher-owned
publication is a proposed design decision, not an intervention-proven result.

### 2.2 Exact current runtime flow

#### Configuration

`createMcpConfig` currently:

- defaults `MCP_ENABLE_WATCHER` to `true`;
- defaults `MCP_WATCH_DEBOUNCE_MS` to `5000`;
- accepts any positive integer debounce override;
- logs watcher state and the effective debounce;
- includes watcher settings in the shared-runtime attachment identity.

There is a separate five-second background startup delay. It is not the watcher
debounce and is not changed by this plan.

#### Lifecycle owner

Only an embedding-capable `ProviderRuntime` starts periodic synchronization and
watcher mode. The metadata-only/local runtime must not own this work.

```text
ProviderRuntime starts
  -> startBackgroundSync()
  -> startWatcherMode() when enabled
```

Watcher mode initially has no implied repository-wide scan. A canonical root is
added to the process-local watch list after successful use through indexing,
sync, search, file outline, or call graph paths. `refreshWatchersFromWatchList`
then registers a Chokidar watcher for eligible roots.

Consequences:

- an indexed root not yet touched by this runtime may not be watched;
- watcher coverage begins at successful registration, not at repository or
  process creation;
- watcher epochs are process-local and reset on restart.

#### Event handling

For `add`, `change`, `unlink`, `addDir`, or `unlinkDir`:

```text
normalize path
  -> classify ordinary source or ignore-control event
  -> scheduleWatcherSync
  -> reject if root is not in a searchable status
  -> bump freshnessEpoch immediately
  -> reset per-root timer
  -> after watchDebounceMs:
       ensureFreshness(root, 0)
       or ignore-rule reconcile through ensureFreshness
```

The debounce is trailing-edge: a continuing edit burst can postpone automatic
sync indefinitely.

#### Other freshness triggers

The same `ensureFreshness` owner is also reached by:

| Trigger | Current policy |
|---|---|
| Search | Three-minute recency threshold, with exact comparison for observed Git-dirty paths |
| Background | Three-minute threshold over indexed roots |
| Explicit `manage_index sync` | Threshold zero |
| Watcher | Threshold zero after five seconds of quiet |

The background loop runs sequentially to avoid resource spikes. Recent roots
may return `skipped_recent`; expired roots perform comparison.

#### Watcher error

An ordinary watcher error marks the root failed, advances the freshness epoch,
and unregisters that watcher. `ENOSPC` stops watcher mode and relies on periodic
or manual freshness paths.

### 2.3 Interaction with reads and continuations

The watcher is not merely a scheduling convenience.

`getPreparedReadObservation` returns source observation evidence only when:

- watcher configuration is enabled;
- watcher mode is started;
- the root is registered and its watcher is ready;
- no debounce, sync, or ignore reconciliation is active;
- the source checkpoint is valid and its observation matches.

The observation contains the process-local `freshnessEpoch` and checkpoint
observation.

That source observation is currently used by:

- status-prepared read revalidation;
- debug freshness diagnostics;
- frozen search continuation validation.

Important limitation:

> The ordinary prepared-read authority observation contains vector authority,
> navigation authority, and mutation generation. It does not contain
> `freshnessEpoch`.

Source-event invalidation therefore does not uniformly invalidate every warm
prepared-read path. In addition, while debounce is active, the source
observation becomes unavailable and is represented as `null` plus a reason.
The current behavior of continuations created or resumed while that observation
is unavailable must be captured in W0. This plan must not assume that the
existing watcher provides complete source-drift invalidation.

Search has a separate Git-dirty path comparison. It can force synchronization
for known changed paths, but the watcher epoch itself is not currently a
mechanical reason to bypass `skipped_recent`. W2 explicitly repairs that gap.

`call_graph` and `file_outline` do not run search freshness. They validate
available source or symbol evidence and may return stale guidance, then touch
the root for future watching. This plan does not turn them into hidden
mutation operations.

### 2.4 Existing verification and missing evidence

Current focused tests cover:

- burst events coalescing into one watcher-triggered sync;
- dropping watcher sync for non-searchable roots;
- watcher stop/drain behavior;
- watcher lifecycle startup and failure rollback;
- ignore-control filtering and reconciliation;
- successful tool paths adding roots to the watch list;
- watcher-disabled and watcher-unavailable diagnostics;
- successful search surviving best-effort watcher maintenance failure.

The repository does not currently retain a watcher-specific product
qualification proving:

- that five seconds is the correct quiet period;
- how often watcher-triggered work publishes no changes;
- how much memory or embedding work it causes during real editing;
- that automatic publication improves task completion compared with
  publication triggered by search, periodic background work, or explicit sync;
- exact continuation behavior for an event during debounce;
- event-during-sync epoch coverage.

The retained cold-graph and incremental-publication memory receipts are not a
substitute for W0:

- they were not designed as watcher comparisons;
- their watcher/background controls differ by harness;
- their retained conclusions concern cold graph ownership and bounded
  six-publication memory capacity;
- they do not prove a multi-day watcher cost or benefit.

### 2.5 Alternatives considered

#### A. Retain the current watcher and five-second auto-sync

Advantage: smallest implementation change and autonomous eventual publication.

Cost: preserves unsolicited indexing, overlapping triggers, ambiguous watcher
semantics, and an unqualified five-second default.

#### B. Keep observation, remove watcher-owned publication — recommended

Advantage: preserves cheap event evidence while removing watcher-owned
publication. Publication remains triggered by search, periodic background work,
or explicit sync through existing owners.

Cost: latest edits are not automatically published until search, background,
or explicit sync. Search must consume pending observed events correctly.

#### C. Remove the watcher completely

Advantage: fewer filesystem handles and lifecycle states.

Cost: loses immediate source-event evidence, ignore-control detection,
continuation invalidation input, and watcher diagnostics. Search would need a
replacement source-observation mechanism or more live filesystem work.

This plan rejects C unless W0 proves the watcher provides no useful source
evidence and a simpler replacement satisfies the same contracts.

#### D. Keep auto-sync behind a permanent public switch

Advantage: preserves both policies.

Cost: creates two supported lifecycle contracts, keeps debounce configuration
and tests indefinitely, and increases shared-runtime identity combinations.

This plan rejects D by default. A permanent switch requires separate product
authorization backed by a demonstrated user class that needs autonomous
publication.

### 2.6 Assumptions and unresolved questions

| Item | Current position |
|---|---|
| Watcher event delivery is complete | Not assumed; overflow/failure remains explicit |
| Filesystem event equals source change | Not assumed; the next comparison decides |
| Five seconds is optimal | Unsupported |
| Search always detects every pending source change without watcher epoch | Unsupported |
| A zero-change comparison can cover an epoch | Yes, if checkpoint and comparison authority are valid |
| Epochs survive restart | No; they are process-local evidence |
| Background may cover a pending epoch | Proposed, must be tested |
| Navigation tools should auto-sync | No |
| Ignore-rule changes require immediate publication | Unproven; next freshness trigger is the proposed contract |
| Watcher removal would improve memory materially | Unproven; W0 must measure |
| Observation-only watching is operationally cheaper | Mechanism-supported, not yet measured |

### 2.7 Reviewer decisions required

Before W1:

1. Is observation-only watching the intended default product behavior?
2. Is delayed ignore-rule reconciliation acceptable until the next search,
   background consideration, or explicit sync?
3. Must a pending observed event force best-effort search synchronization, or
   may search disclose the older publication with a warning?
4. Should background comparison be allowed to cover a pending epoch?
5. What is the exact continuation contract when watcher source observation is
   unavailable?
6. Is the proposed deprecation/removal path for
   `MCP_WATCH_DEBOUNCE_MS` compatible with version policy?
7. Which repository classes and editing workloads define the W0 performance
   budget?

The recommended answers are: yes to 1 and 4; yes to forced search
synchronization in 3; fail stale for continuation uncertainty in 5; and measure
2, 6, and 7 before freezing implementation.

## 3. Scope

### In scope

- Split watcher observation from watcher-triggered synchronization.
- Give accepted filesystem events explicit per-root epoch ownership.
- Make existing freshness work prove which event epoch it compared through.
- Make search consume a pending observed event instead of relying only on the
  three-minute process-local recency window.
- Preserve ignore-control reconciliation through the existing
  `ensureFreshness` pipeline.
- Remove or deprecate `MCP_WATCH_DEBOUNCE_MS` after watcher-owned publication is
  removed.
- Keep watcher lifecycle and failure diagnostics accurate.
- Update shared-runtime identity only when the effective behavior changes.

### Out of scope

- A new synchronizer, publication format, manifest, lock, snapshot service, or
  mutation authority.
- Full-tree hashing on every search.
- New public search modes.
- Changes to ranking, retrieval, relationship analysis, or semantic
  abstention.
- Removal of explicit `manage_index sync`.
- Redesign of the V4 publication or checkpoint model.
- A general background-sync redesign. Background work remains an existing
  freshness trigger during this bounded change.

Epoch ownership remains in MCP:

```text
SyncManager
  -> owns process-local watcher event state
  -> captures one event boundary per freshness flight
  -> calls existing ensureFreshness

Core
  -> continues to own source comparison and publication
```

Do not persist watcher epochs, add them to checkpoint identity, or pass them
through Core unless W0 proves that MCP cannot distinguish covering outcomes
from the existing freshness result. If that distinction is missing, extend the
MCP/Core result minimally without moving watcher state into Core.

## 4. Required invariants

### O1 — observation never mutates

The filesystem callback may update bounded process-local observation state. It
must not embed, acquire a mutation lease, write vector payload, or publish
navigation.

### O2 — events invalidate immediately

An accepted Chokidar event advances `observedEventEpoch` before any quiet
period or asynchronous synchronization.

### O3 — only completed comparison covers an epoch

A freshness flight captures one `flightEpoch` when the flight starts. It may
advance `comparedThroughEventEpoch` only after one of these whitelisted
outcomes, with valid checkpoint/publication authority:

```text
exact zero-change source comparison
successful changed-source publication
successful ignore-policy reconciliation
```

These outcomes do not cover an epoch:

```text
skipped_recent
requires_reindex
blocked
cancelled
failed
not_indexed
missing_path
lease conflict without a completed comparison
joined operation whose flight did not capture that epoch
```

Do not infer coverage from a generic `status=ok`.

### O4 — events during work remain pending

If `observedEventEpoch` advances after a freshness flight captures
`flightEpoch`, completing that flight covers at most `flightEpoch`. A later
event remains pending even if the underlying scan may have observed it. The
conservative extra comparison is preferable to a false freshness claim.

### O5 — search does not hide a known event behind recency

When `observedEventEpoch > comparedThroughEventEpoch`, search must not return
`skipped_recent` solely because `lastSyncTimes` is inside the three-minute
window. It starts or joins the existing forced freshness path.

### O6 — no duplicate writer

Concurrent search, background, and manual triggers continue to compose through
the existing process-local flight, mutation lease, checkpoint, and Core
publication authorities.

### O7 — navigation stays non-mutating

`call_graph` and `file_outline` do not gain an implicit indexing side effect.
After an observed source event they may return existing stale-source or sync
guidance until search, background, or explicit sync publishes current evidence.
When existing envelopes permit it, they must disclose pending observed events,
recommend `manage_index sync` or a freshness-triggering search, and avoid
claiming working-tree freshness.

### O8 — watcher failure is honest

On watcher failure, Satori stops claiming continuous observation and retains
the current conservative fallback behavior. It does not silently treat the last
epoch as complete.

### O9 — epoch equality is not source proof during an observation gap

```text
observedEventEpoch == comparedThroughEventEpoch
```

means only that no accepted event remains unprocessed. It supports continuous
source-observation evidence only while watcher coverage is `ready` with no
coverage gap.

### O10 — pending reasons clear independently

For each reason:

```text
latestEpochByReason[reason] <= comparedThroughEventEpoch
```

is required before that reason may be cleared. A comparison through an earlier
source event must not clear a later ignore-rule or directory event.

### O11 — joined callers cannot widen coverage

One freshness flight owns one captured `flightEpoch`. Joiners inherit its
result but cannot extend the epoch it covers:

```text
comparedThroughEventEpoch =
  max(comparedThroughEventEpoch, flightEpoch)
```

Never use an epoch observed by a caller that joined after the flight started.

### O12 — watcher readiness requires a baseline

A newly started or newly registered watcher remains in `starting` coverage
until one successful comparison completes after watcher readiness, or an
existing source-observation mechanism proves an equivalent baseline.

`observed=0` and `compared=0` after restart or registration are not source
stability proof.

## 5. Target state

Per canonical root, the watcher owner retains only bounded observation facts:

```ts
type WatcherObservationCoverage =
  | "starting"
  | "ready"
  | "disabled"
  | "failed"
  | "stopped";

type WatcherPendingReason =
  | "source_changed"
  | "ignore_rules_changed"
  | "directory_changed";

interface RootWatcherObservation {
  observedEventEpoch: bigint;
  comparedThroughEventEpoch: bigint;
  latestEpochByReason: Map<WatcherPendingReason, bigint>;
  coverage: WatcherObservationCoverage;
  coverageGapSinceEpoch?: bigint;
  lastEventAt?: number;
  lastWatcherError?: string;
}

interface FreshnessFlightObservation {
  root: string;
  flightEpoch: bigint;
  startedWithCoverage: WatcherObservationCoverage;
}
```

Derived state:

```text
pendingObservedEvent
  = observedEventEpoch > comparedThroughEventEpoch

pending reason R
  = latestEpochByReason[R] > comparedThroughEventEpoch

continuousObservationAvailable
  = coverage == ready && coverageGapSinceEpoch is absent
```

No timer or active watcher-sync promise is required in the final state.

### Event sequence

```text
event 1
  -> observed=1, comparedThrough=0

event 2
  -> observed=2, comparedThrough=0

search
  -> flight captures epoch=2
  -> existing ensureFreshness(root, 0)
  -> successful source comparison/publication
  -> comparedThrough=2

event 3 during publication
  -> observed=3
  -> completing publication leaves comparedThrough=2
```

The next freshness trigger covers epoch 3. There is no watcher-owned follow-up
publication loop.

### 5.1 Continuation contract to freeze before W2

When a continuation is created under valid continuous watcher coverage:

- store the event epoch or equivalent source-observation identity;
- reject it with `SEARCH_RESULT_SET_STALE` after a later accepted event;
- do not wait for publication identity to change before rejecting it.

When source observation is unavailable, W0 must select one existing-compatible
contract:

```text
A. do not issue a continuation;
B. issue a continuation bound only to publication/session identity;
C. issue it with an explicit unqualified-source warning.
```

Do not silently make every continuation unusable when watcher configuration is
disabled. Conversely, do not call a publication-bound continuation
source-current.

### 5.2 Search failure contract to freeze before W2

A pending event must prevent `skipped_recent`, but W0 must establish what
best-effort search does if the forced comparison fails:

```text
A. fail before returning results;
B. return the prior publication with explicit freshness warning and action;
C. return only a mechanically defined subset that remains valid.
```

Prefer the current best-effort response and existing warning/hint fields unless
evidence shows that they cannot represent the condition safely. Do not invent a
new public response shape during W2 without separate approval.

### 5.3 Navigation-tool contract

While an observed event is pending, `call_graph` and `file_outline`:

- remain non-mutating;
- expose pending source observation when the existing envelope can carry it;
- recommend `manage_index sync` or a freshness-triggering search;
- do not claim working-tree freshness;
- retain exact per-file stale checks already owned by navigation handlers.

W0 must record current behavior before adding any diagnostic.

### 5.4 Ignore-policy contract

An accepted ignore-control event records its own latest epoch. The next
freshness-triggering search cannot skip through recency and must run the
existing ignore reconciliation before retrieval.

Qualification must prove both:

- a newly ignored file stops appearing after the covering freshness operation;
- a newly included file is discovered even though it was previously excluded
  from indexed membership.

Navigation-only use before reconciliation must disclose pending source policy
where the current response contract permits it.

## 6. Configuration contract

### Current

```text
MCP_ENABLE_WATCHER=true
MCP_WATCH_DEBOUNCE_MS=5000
```

`MCP_ENABLE_WATCHER` currently means both “observe” and “automatically sync
after a quiet period.”

### Target

`MCP_ENABLE_WATCHER` means only:

> Observe eligible indexed roots and expose source-change evidence.

`MCP_WATCH_DEBOUNCE_MS` has no valid meaning after watcher-owned publication is
removed.

Migration:

1. In the first observation-only release, continue parsing the variable but
   report it as deprecated and ignored.
2. Exclude the ignored value from shared-runtime attachment identity.
3. Remove the variable from installer help and current documentation.
4. Make actual parser removal a later, separately approved compatibility
   decision.

Do not add a permanent `MCP_ENABLE_WATCH_AUTO_SYNC` switch merely to preserve
the old complexity. A temporary internal qualification flag is acceptable only
for before/after evidence and must not become public configuration.

## 7. Execution batches

### W0 — evidence and contract freeze

No production behavior changes.

W0 must answer four questions.

#### W0.1 Does auto-sync provide unique correctness?

Record whether any current behavior becomes correct only because the
five-second timer publishes automatically:

- search after source add, modify, and delete;
- frozen continuation after an event;
- ignore-policy reconciliation;
- `call_graph` and `file_outline`;
- watcher failure/disablement;
- restart and registration blind windows.

#### W0.2 What work does the timer cause?

Record:

- accepted events per edit burst;
- timer firings;
- actual changed publications;
- exact zero-change comparisons;
- embedding calls;
- comparison and publication duration;
- peak RSS;
- overlap with search, background, and explicit sync.

#### W0.3 Can existing triggers safely consume event evidence?

Using existing diagnostics or a task-owned external harness, trace the current
flight boundary and determine whether the proposed rule is implementable:

```text
pending event
  -> freshness flight captures one flightEpoch
  -> search cannot use skipped_recent
  -> successful covering outcome advances only through flightEpoch
  -> event during work remains pending
```

Exercise search, explicit sync, and background triggers. Do not change
repository code or runtime behavior to make the witness pass.

#### W0.4 What public behavior would change?

Freeze:

- search behavior when forced freshness fails;
- continuation behavior with valid and unavailable source observation;
- navigation-tool pending-event diagnostics and recommended action;
- ignore-rule delay semantics;
- watcher failure and coverage-gap semantics;
- configuration compatibility and shared-runtime identity;
- performance limits and measurement method.

Minimum workload matrix:

| Scenario | Purpose |
|---|---|
| One normal file save | Base behavior |
| Ten-event editor burst | Debounce and no-op cost |
| Atomic-save rename/unlink/add | Editor replacement behavior |
| Ignore-rule edit | Control-file semantics |
| Event during sync | Flight epoch race |
| Two concurrent searches | Single-flight ownership |
| Continuation followed by event | Staleness contract |
| Watcher failure or disablement | Honest fallback |
| Restart before comparison | Process-local epoch reset |

Run the matrix on one small fixture repository and the qualified large Python
repository.

Terminal outcomes:

```text
watcher_decoupling_supported
watcher_auto_sync_required
watcher_decoupling_evidence_insufficient
```

Use `watcher_decoupling_supported` only when:

- auto-sync has no unique required correctness role;
- search, explicit sync, and background can cover accepted events;
- continuation behavior is safe;
- ignore changes reconcile correctly;
- navigation tools can disclose pending events honestly;
- no duplicate writer is introduced.

Use `watcher_auto_sync_required` when a frozen product contract requires
automatic publication and existing triggers cannot preserve it without a
material regression.

Use `watcher_decoupling_evidence_insufficient` when continuation,
observation-gap, or event-during-flight behavior cannot be distinguished.

Stop after sealing W0. W1 requires a separate authorization even when W0 returns
`watcher_decoupling_supported`.

#### W0 execution record — 2026-07-26

W0 completed at Satori revision
`ad443b872c467eb7ad6f4305b056c8fdc27dede5`.

The durable receipt is
[`WATCHER_DECOUPLING_W0_RECEIPT.md`](../evidence/watcher-decoupling-w0-20260726/WATCHER_DECOUPLING_W0_RECEIPT.md).
Its terminal decision is:

```text
watcher_decoupling_supported
```

The evidence established:

- Chokidar observation remains useful and bounded;
- a ten-write burst coalesces to one trailing timer action;
- the timer performs real comparison, embedding, and publication work;
- it can duplicate a zero-change comparison after another freshness trigger
  has already published;
- search, explicit sync, and periodic background work already share the one
  synchronization owner;
- the current continuation, search-failure, navigation, ignore-policy, and
  watcher-gap contracts are frozen in the receipt;
- W1 may extract observation state without changing automatic sync behavior.

This record does not authorize W1. W2–W4 remain unauthorized.

### W1 — extract observation from scheduling

W1 is conditionally eligible for later authorization only after W0 returns
`watcher_decoupling_supported`. It must preserve current automatic sync.

Refactor the event callback into an explicit observation operation while
preserving current timer behavior:

```text
recordWatcherEvent(root, reason)
scheduleWatcherSync(root)
```

Add epoch state and prove that:

- every accepted event advances the epoch once;
- ignored events do not advance it;
- watcher errors, stop transitions, restart, and new registration establish
  explicit observation-gap/starting state;
- each reason retains its latest event epoch independently;
- state remains root-keyed and bounded;
- current debounced decisions and normalized publication content remain
  equivalent, excluding expected timestamps and operation identifiers.

Stopping condition: behavior remains unchanged and focused watcher/lifecycle
tests pass.

### W2 — make freshness consume observation

W2 is not authorized until W0 freezes:

- the continuation contract;
- the search failure contract;
- navigation pending-event behavior;
- the exact covering-outcome whitelist;
- observation-gap and post-registration baseline semantics.

Capture one `FreshnessFlightObservation` in the MCP freshness owner. Do not let
joiners replace or widen `flightEpoch`.

Implement O3–O12:

- pending observed events bypass `skipped_recent`;
- only a whitelisted outcome covers `flightEpoch`;
- an event during work remains pending;
- joined callers receive the same durable outcome but cannot widen coverage;
- reasons clear independently by their latest epoch;
- ignore-policy events use the existing reconciliation owner;
- exact zero-change comparison may cover an epoch without claiming payload
  mutation;
- watcher-disabled, failed, starting, or interrupted coverage cannot use epoch
  equality as source proof.

Keep the old debounce scheduler enabled during this batch. This isolates
correctness from policy removal.

Stopping condition: both search-driven and legacy watcher-driven paths cover
epochs correctly without duplicate publication.

### W3 — remove watcher-owned publication

W3 is the product behavior change and is not authorized by W0 or W1 approval.
It requires completed W2 evidence and a separate decision.

Delete:

- watcher debounce timers;
- active watcher-sync promises;
- pending ignore-edit counters used only for timer coalescing;
- watcher calls that directly schedule `ensureFreshness`;
- lifecycle draining that exists only for watcher-owned sync work.

Retain:

- Chokidar lifecycle;
- ignore filtering;
- event classification;
- observation epochs;
- watcher diagnostics;
- existing search, background, and manual freshness paths.

Apply only the first-release configuration migration in §6: retain parsing,
report the value deprecated/ignored, remove it from current guidance, and
exclude it from effective shared-runtime identity. Do not remove the parser in
this batch.

Stopping condition:

- an edit burst causes zero watcher-owned mutation leases, embeddings, or
  publications;
- the next search performs exactly one required freshness pass;
- explicit sync and background work can cover the pending epoch;
- continuation invalidation and watcher diagnostics remain correct.

### W4 — qualification and documentation

Run:

- focused watcher and sync tests;
- search freshness and continuation tests;
- ignore-control reconciliation tests;
- provider/shared-runtime lifecycle tests;
- affected Core and MCP suites;
- typecheck, lint, builds, documentation, manifest, and diff checks.

Perform candidate-built MCP witnesses:

1. wait longer than the former debounce period and prove no watcher-owned
   lease, embedding, comparison, or publication starts;
2. add, modify, and delete with no search during the edit burst;
3. search and prove the change becomes searchable through one existing
   freshness flight;
4. repeat with two concurrent searches;
5. send an event while a freshness flight waits on another writer;
6. send an event after source comparison begins but before publication;
7. join a search flight after a later event and prove the joiner does not widen
   flight coverage;
8. edit ignore rules to newly ignore a file;
9. edit ignore rules to newly include a file;
10. invoke `call_graph` and `file_outline` while an event is pending;
11. make a watcher ready after restart and prove coverage remains `starting`
    until the post-registration baseline comparison;
12. fail the watcher, then search and prove fallback diagnostics remain honest;
13. create a zero-change event burst and cover it without payload mutation;
14. change a file between search pages and prove the frozen continuation follows
    the W0-approved contract;
15. restart and prove no process-local epoch is presented as durable evidence.

Update user-facing wording:

> The watcher detects source changes. Satori publishes them on the next
> freshness-triggering operation; it does not index automatically after a
> five-second timer.

## 8. Test matrix

| Case | Required result |
|---|---|
| One source event | `observedEventEpoch=1`, no publication |
| Ten-event burst | event epoch and per-reason epoch advance; no debounce timer or publication |
| Search with pending event | one forced freshness flight |
| Two concurrent searches | one writer; both see compatible outcome |
| Search joiner after later event | joiner cannot widen `flightEpoch` |
| Zero-change comparison | flight epoch covered; payload identity unchanged |
| Event during sync | later event epoch remains pending |
| Sync failure | event epoch remains pending |
| Mutation lease blocked | event epoch remains pending |
| File newly ignored | next freshness path removes it from results |
| File newly included | next freshness path discovers it |
| Continuation after event | W0-approved continuation contract |
| `call_graph` after event | no implicit mutation; stale/sync guidance |
| Watcher disabled | current conservative fallback |
| Watcher failed | coverage gap explicit; no false current claim |
| Watcher newly ready | remains `starting` until baseline comparison |
| Restart | epochs reset; equality is not source proof; durable checkpoint remains authority |
| Background covers epoch | search does not repeat the same comparison |

## 9. Performance gates

Freeze exact limits in W0. Candidate starting limits:

- no-change warm search p95: no more than 5% regression;
- no watcher-triggered embedding or publication after an edit burst;
- first search after a one-file edit: within the approved one-file sync budget;
- no increase in retained root, watcher, or continuation cardinality;
- event handling remains constant-time apart from existing ignore matching;
- watcher RSS and file-handle usage do not increase materially;
- no duplicate publication under concurrent search/background/manual triggers.

These are candidate gates, not approved product budgets until W0 records the
measurement method and baseline.

## 10. Rollback

W1 is behavior-preserving. W2 changes pending-event search and continuation
semantics and therefore requires a separate, revertible commit after its
contracts are approved.

Before W3:

- retain the prior runtime artifact and compatible index generation;
- preserve a task-owned state root for before/after comparison;
- record the shared-runtime identity change;
- prove the previous runtime can read its retained generation.

If W3 causes stale search results, duplicate syncs, continuation errors, or an
unacceptable first-search regression, restore the prior runtime and its
compatible state. Do not reintroduce a second synchronizer or relax checkpoint
validation.

## 11. File ownership map

| Concern | Primary owner |
|---|---|
| Watcher lifecycle and epochs | `packages/mcp/src/core/sync.ts` |
| Search freshness decision | `packages/mcp/src/core/handlers.ts` and search front door |
| Configuration/help | `packages/mcp/src/config.ts` |
| Provider lifecycle | `packages/mcp/src/server/provider-runtime.ts` |
| Shared-host identity | `packages/mcp/src/server/shared-runtime-identity.ts` |
| Explicit sync | `packages/mcp/src/core/manage-maintenance-handlers.ts` |
| Core incremental publication | unchanged owner in `packages/core` |
| Tests | watcher, sync, handler, provider, and shared-runtime focused suites |

## 12. Closure decision

The improvement closes only when all of the following are true:

1. the watcher is an observation-only component;
2. no five-second watcher publication timer remains;
3. a known event cannot be hidden by process-local recency;
4. only a whitelisted covering outcome advances `comparedThroughEventEpoch`;
5. joined callers cannot widen flight coverage;
6. per-reason event state clears independently;
7. events during work remain pending;
8. observation gaps and post-registration baselines remain explicit;
9. search/manual/background still share the existing synchronization owner;
10. ignore-rule changes remain correct;
11. continuations follow the frozen W0 source-observation contract;
12. navigation tools gain no hidden mutation;
13. watcher-disabled and watcher-failed behavior remains explicit;
14. configuration and shared-runtime identity match effective behavior;
15. focused and package verification passes within approved budgets.

Terminal decisions:

```text
watcher_observation_only_pass
watcher_auto_sync_retained
watcher_decoupling_blocked
```

Do not claim that all freshness work is complete. This plan closes only the
watcher observation/publication coupling and the obsolete debounce behavior.

## 13. Requested technical review

Review this document as a proposed implementation and authorization plan, not
as evidence that watcher decoupling has passed.

Current authorization:

| Batch | State |
|---|---|
| W0 | Authorized after the amendments in this revision; evidence and contract freeze only |
| W1 | Unauthorized; conditionally eligible only after W0 supports decoupling |
| W2 | Unauthorized; requires frozen public and flight-coverage contracts |
| W3 | Unauthorized; product behavior and configuration change |
| W4 | Acceptance design only; execution depends on W3 |

Please assess:

1. whether the current behavior and ownership map are accurate;
2. whether observation-only watching preserves enough freshness evidence;
3. whether the epoch model is sufficient under concurrent edits, searches,
   background work, manual sync, restart, and watcher failure;
4. whether any successful-but-non-covering freshness outcome could incorrectly
   clear pending work;
5. whether continuation invalidation needs a stronger source-observation
   identity;
6. whether delayed ignore-rule reconciliation creates an unacceptable product
   gap;
7. whether configuration and shared-runtime identity migration are safe;
8. whether W0 captures enough evidence to justify removing automatic sync;
9. whether the proposed performance gates measure the user-visible cost;
10. whether any batch expands into a second synchronization or publication
    authority.

Use:

```text
finding
evidence from this plan or named source owner
impact
required amendment
batch authorization decision
```

Return an independent decision for W0, W1, W2, W3, and W4. Do not treat approval
of evidence gathering as approval of production behavior changes.

## 14. Execution record: observation-only candidate

The user subsequently authorized the complete observation/publication
decoupling as one end-to-end outcome, with W1-W4 treated as internal
ownership-bounded stages.

The candidate implemented the required root-keyed event state, flight-owned
coverage, observation-gap handling, pending navigation guidance, removal of
watcher-owned publication, and compatibility treatment for
`MCP_WATCH_DEBOUNCE_MS`.

Focused and package verification passed. A real Chokidar witness also waited
longer than the former five-second debounce and observed no automatic
comparison or publication.

Final product qualification then reached the plan's explicit stopping
condition. After the distinct background-startup pass was allowed to settle:

```text
ten-write event burst
-> no publication during 5.3-second quiet interval
-> search publishes added source
-> search publishes modified source
-> delete event remains pending
-> search consumes event
-> complete-generation validation fails closed
```

The exact failure class was:

```text
Incremental publication ... is not readable as one complete generation.
```

This is equivalent to the frozen W0 validation finding, but it now occurs
through an allowed search freshness trigger. The candidate therefore stops at:

```text
watcher_decoupling_blocked
```

No product commit was created, and nothing was merged or published. The
durable receipt is:

`../evidence/watcher-observation-only-20260726/WATCHER_OBSERVATION_ONLY_RECEIPT.md`.

## 15. Final execution record

The blocked result above remains historical evidence, but it did not reject the
observation-only design. Add and modify had passed, and the delete failure was
reproduced through the ordinary incremental owner without watcher scheduling.

The first wrong boundary was the interaction between delta completion and the
existing publication-retention queue. LanceDB sibling cleanup advanced the
family-shared publication observation after the active generation had been
proved. `performAtomicDeltaPublication` could therefore return before its
active proof had been rebased, causing immediate complete-generation validation
to reject a durable V4 generation that became readable after retention settled.

The bounded repair:

1. waits for the already-owned retention flight;
2. proves the active generation after retention;
3. fails closed if that proof cannot be obtained; and
4. registers the retained proof as the exact prepared activation receipt.

No validation, V4 identity, publication authority, schema, or fingerprint was
relaxed or added. The detailed repair receipt is:

`../evidence/incremental-delete-publication-20260726/INCREMENTAL_DELETE_PUBLICATION_RECEIPT.md`.

After that repair, the preserved watcher candidate completed the real runtime
sequence:

```text
event burst
-> no automatic work after 5.3 seconds
-> add consumed by search
-> modify consumed by search
-> delete consumed by search
-> complete generation readable
-> restart readable
```

Complete MCP verification passed 1,051 tests. Complete Core verification passed
with the new direct LanceDB regression added to the prior 595-pass baseline and
one existing skip. Typecheck, owned lint, builds, generated documentation,
manifest checks, version freshness, and diff validation passed.

The final decision is:

```text
watcher_observation_only_pass
```

The final receipt is:

`../evidence/watcher-observation-only-final-20260726/WATCHER_OBSERVATION_ONLY_FINAL_RECEIPT.md`.

The work remains isolated. Nothing was merged into `master` or published
remotely.
