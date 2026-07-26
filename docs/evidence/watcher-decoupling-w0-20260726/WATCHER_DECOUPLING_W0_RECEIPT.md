# Watcher decoupling W0 receipt

**Decision:** `watcher_decoupling_supported`

**Scope:** Evidence and contract freeze only. No product behavior changed.

## Identity and preservation

- Satori revision: `ad443b872c467eb7ad6f4305b056c8fdc27dede5`
- MCP: `6.4.0`
- Core: `3.3.0`
- CLI: `1.5.0`
- Runtime: local Potion, LanceDB, shared runtime disabled
- Watcher: enabled, 5,000 ms debounce
- Qualified large target revision:
  `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7`
- The large target was materialized from `git archive`; its dirty source
  worktree was not modified.
- The already staged plan blob was preserved. W0 added no product source
  changes and did not stage, unstage, reset, stash, clean, or commit anything.

## Current ownership established

`SyncManager.scheduleWatcherSync` currently performs two operations:

1. it immediately changes the process-local freshness observation; and
2. it arms or replaces a trailing timer that calls the existing
   `ensureFreshness(root, 0)` synchronization owner.

Search, periodic background work, explicit sync, and the watcher already enter
the same synchronization owner. `call_graph` and `file_outline` do not invoke
freshness; the current timer therefore provides autonomous convergence for a
navigation-only workflow, but it is not a separate correctness authority.

The target contract may remove that autonomous publication only if navigation
tools disclose pending observed events and recommend the existing explicit sync
action. They must remain non-mutating.

## Event-level workload

A task-owned external harness exercised the real `SyncManager` and Chokidar
event path while replacing `ensureFreshness` with a counter. This isolated
watcher registration, event classification, timer coalescing, and retained
process cost from embedding and publication.

| Repository | Watcher ready | RSS at ready | Events | Timer calls |
|---|---:|---:|---:|---:|
| two-file fixture | 13.57 ms | 200,462,336 B | 8 | 5 |
| qualified large materialization | 508.47 ms | 210,898,944 B | 8 | 5 |

The eight events include one cleanup deletion outside the four named scenarios;
its timer call is included in the totals.

For both repositories:

- one normal save produced one accepted event and one timer call;
- ten writes 20 ms apart produced four Chokidar events and one timer call;
- an atomic save produced one accepted event and one timer call;
- an ignore-control edit produced one `ignore_rules_changed` event and one
  `ignore_change` timer call.

The timer fired about five seconds after the last accepted event. The event-only
large run ended at 220,991,488 B RSS, 10,092,544 B above watcher-ready RSS. This
is a bounded harness observation, not a product memory guarantee.

Raw task-run digests:

- small event run:
  `dcb28b714af75a387f12c0f326039c7274be3d776215767504fd28f40e0b9420`
- large event run:
  `77f20e4415e5bb2e2572157e3f0e5c948281cba45dc35c98e0f6a7a590625cea`

The repository-local JSON summary preserves the decision-relevant rows.

## Current-build runtime workload

A second task-owned harness used the current built MCP runtime, a two-file
Python fixture, isolated Satori state, Potion, and LanceDB. It created a fresh
index, activated the watcher through search, then waited seven seconds after
each edit before issuing the verification search.

| Scenario | Timer-owned result | Approximate work after timer entry | Aggregate process-tree RSS range |
|---|---|---:|---:|
| single save | one changed publication, then one zero-change comparison caused by overlapping existing freshness work | 140 ms changed path; 4 ms zero-change path | 384,124–413,600 KiB |
| ten-write burst | one changed publication attempted; complete-generation postcondition failed | 128 ms | 413,700–418,144 KiB |
| atomic save | one changed publication attempted; complete-generation postcondition failed | 131 ms | 418,188–419,836 KiB |
| timestamp-only event | exact zero-change comparison | 4 ms | 419,856–421,928 KiB |
| ignore-control edit | successful ignore reconciliation and zero-change source comparison | 23 ms | 421,976–422,652 KiB |

The changed searches returned the expected exact identifiers. The two
postcondition failures were logged by the watcher path as:

```text
Incremental publication ... is not readable as one complete generation.
```

W0 does not diagnose or repair that publication behavior. It establishes that
timer-owned work is real, can overlap another freshness trigger, can perform
zero-change work, and can fail outside a requesting tool boundary. Removing the
timer must not weaken the existing publication validator.

Raw current-build run digest:

`7707a114d765c319d2aab9213d971f1b90da48d7081c6a76ba33884c8ac82444`

## Existing-trigger and contract evidence

- Corrected C4 already proves explicit add, modify, and delete publication on
  the qualified runtime for `.py` under runtime scope and `.txt` under mixed
  scope:
  `../repair-authority-c4-20260726/REPAIR_AUTHORITY_C4_RECEIPT.md`.
- Existing sync tests prove burst coalescing and one durable synchronization
  owner for joined callers.
- Existing continuation tests prove:
  - a changed available source observation rejects the continuation with
    `SEARCH_RESULT_SET_STALE`;
  - consistently unavailable source observation preserves current continuation
    behavior;
  - transitions between available and unavailable observations are stale.
- Search currently blocks structured reindex, ignore-reconcile failure, and a
  failed coalesced flight. A direct synchronization exception remains a tool
  failure. The observation-only design must not introduce stale fallback.
- Watcher disablement or failure leaves background and explicit synchronization
  available. Epoch equality alone cannot prove source stability across that
  observation gap.

Focused current tests passed:

```text
sync.test.ts                         48 passed
handlers.watchers.test.ts             6 passed
config.freshness-timing.test.ts        2 passed
continuation focused control           1 passed
provider lifecycle focused controls    5 passed
total                                 62 passed
```

Current Core and MCP runtime builds also passed.

## Frozen W0 contracts

### Search

An accepted pending event must bypass `skipped_recent` and enter the existing
freshness owner. If comparison or publication fails, preserve the current
fail-closed behavior; do not silently serve the prior publication as fresh.

### Continuations

- A continuation created with valid continuous observation is bound to its
  event observation and becomes `SEARCH_RESULT_SET_STALE` after a later
  accepted event.
- When observation is unavailable for both creation and continuation, preserve
  the current publication/session-bound behavior.
- A transition into or out of observation availability remains stale.

### Navigation

`call_graph` and `file_outline` remain non-mutating. While an event is pending,
they must not claim working-tree freshness. Where their current envelopes allow
it, return a machine-readable pending-source warning and the existing
`manage_index sync` action. Otherwise fail conservatively using the nearest
existing stale-navigation contract.

### Ignore controls

An accepted ignore-control event remains pending until search, explicit sync,
or periodic background work runs the existing ignore-reconciliation owner.
Search cannot use recency to bypass it. Navigation remains non-mutating and
discloses the pending policy event.

### Observation gaps

Watcher `starting`, `disabled`, `failed`, or interrupted states do not establish
continuous observation. After startup or registration, watcher readiness alone
is insufficient; one successful comparison establishes the baseline.

### Covering outcomes

Only these outcomes may cover a flight's captured event epoch:

- an exact zero-change source comparison;
- a successful changed-source publication whose effective checkpoint and
  publication authority validate;
- a successful ignore-policy reconciliation.

A joined caller may inherit the result but cannot widen the flight epoch.
`skipped_recent`, `requires_reindex`, checkpoint unavailable, mutation blocked
or in progress, cancellation, failure, and a join to a flight that did not
capture the event do not cover it.

## Performance limits frozen for later batches

- Event-only watcher registration on the qualified large repository: at most
  1 second.
- Event-only retained RSS increase for that repository class: at most 16 MiB.
- Event recording remains constant-time apart from current ignore matching.
- One root retains one bounded observation record; no per-event queue.
- Warm no-change search p95: no more than 5% regression from the candidate
  baseline measured in W2.
- First search after one changed file: at most the approved 7 second p95
  one-file synchronization budget.
- Incremental publication: at most the approved 1.6 GiB process-tree RSS
  allowance.
- W3 acceptance: waiting longer than the former debounce causes zero
  watcher-owned comparison, embedding, lease, or publication.

## Decision and stopping condition

W0 returns `watcher_decoupling_supported`.

The evidence supports separating observation from publication. It does not
authorize deletion of the timer yet. W1 is the next eligible batch and must be
behavior-preserving: extract root-keyed event observation state while retaining
the existing debounce scheduler. W2–W4 remain unauthorized.

