# Watcher Observation-Only Final Qualification Receipt

## Decision

```text
WATCHER_FINAL_OUTCOME=watcher_observation_only_pass
MASTER_MERGED=no
REMOTE_PUBLISHED=no
```

The watcher now records bounded, process-local event evidence and never starts
source comparison, embedding, or publication. Search, explicit sync, and
periodic background synchronization remain the only freshness triggers and
continue through the existing `ensureFreshness` and Core publication owners.

The earlier `watcher_decoupling_blocked` receipt remains valid historical
evidence of an independent incremental-publication race. That race was repaired
and the complete watcher qualification was rerun from the preserved candidate.

## Identities

| Identity | Value |
| --- | --- |
| Base revision | `ad443b872c467eb7ad6f4305b056c8fdc27dede5` |
| W0 evidence commit | `29c2d7f04f716c9e4e436295d57bfb5cd69db48d` |
| Historical blocked evidence commit | `0650898e2ec454aa96e9f57d783168634c86a2c0` |
| Watcher candidate commit | `43ec6299be3c042b25c761c72c93acc73f50e976` |
| Delete-publication repair commits | `d381fc0279dea0dd8e75a7d7c15d63d14ce7dc0e`, `3e5decdd3edb3c5071b2175e6be27092f5882bb8` |
| MCP | `6.4.0` |
| Core | `3.3.0` |
| CLI | `1.5.0` |

## Qualified behavior

- Every accepted watcher event advances one canonical-root event epoch.
- The latest accepted epoch is retained independently for bounded source,
  ignore-rule, and directory reasons.
- Ignored events do not advance observation state.
- One freshness flight captures one epoch; joiners cannot widen coverage.
- Only exact zero-change comparison, successful source publication, or
  successful ignore reconciliation may cover the captured epoch.
- Events arriving during work and failed or blocked work remain pending.
- Watcher starting, disabled, failed, and stopped states do not claim continuous
  source observation.
- Prepared source observations and continuations become stale after a later
  accepted event.
- `call_graph` and `file_outline` remain non-mutating and disclose pending or
  unverified working-tree freshness through the existing guidance envelope.
- Ignore-rule events reconcile through the next existing freshness trigger.
- Root teardown removes owned watcher observation state.
- Restart begins with process-local observation authority unestablished.
- `MCP_WATCH_DEBOUNCE_MS` remains accepted for compatibility, is deprecated and
  ignored, and no longer changes shared-runtime attachment identity.

No watcher debounce timer, watcher-owned active sync promise, or direct watcher
call to `ensureFreshness` remains.

## Runtime witness

The final isolated run used the candidate-built MCP, Potion, LanceDB, a
task-owned TypeScript fixture, an isolated state root, watcher debounce
configuration set to one millisecond, and direct stdio.

After allowing the distinct periodic-startup pass to settle:

```text
ten-write event burst
-> wait 5.3 seconds
-> no operation identity change
-> search publishes the added source
-> search publishes the modified source
-> search publishes the deletion
-> restart reads the active publication
```

Results:

| Witness | Result |
| --- | --- |
| Watcher-owned automatic publication | not observed |
| Add search | exact result present |
| Modify search | old result absent; new result present |
| Delete search | result absent; complete generation readable |
| Restart | active publication readable; expected result present |
| Process-local pending epoch after restart | not claimed |

The add, modify, delete, and restart operation identities were distinct
publication operations started by allowed freshness owners. The operation
identity did not change during the former debounce interval.

## Performance

| Measurement | Result |
| --- | ---: |
| Initial search | 104.97 ms |
| First search after added source | 31.56 ms |
| Search after modification | 195.70 ms |
| Search after deletion | 193.32 ms |
| Warm no-change search p95 | 19.55 ms |
| Quiet interval proving no automatic work | 5,300 ms |

The changed searches remain far below the approved seven-second one-file sync
budget. W0 measured watcher readiness on the qualified large repository at
508.47 ms and retained RSS growth of 10,092,544 bytes, below its 16 MiB bound.
Those W0 measurements remain the bounded watcher observation-state evidence;
the final runtime did not repeat a separate external RSS sample.

No valid pre-change W2 latency baseline exists because the earlier run stopped
on the delete-publication defect. The values above are therefore the first
complete observation-only runtime baseline, not a claimed five-percent
comparison against an unavailable sample.

## Verification

| Check | Result |
| --- | --- |
| Real add/modify/delete/restart runtime | passed |
| Former-debounce no-work witness | passed |
| Direct incremental delete repair regression | passed |
| Focused atomic publication and retention batch | 6 passed |
| Complete Core package | passed; one new test over the recorded 595-pass baseline, 1 skipped |
| Complete MCP package | 1,051 passed, 0 failed |
| Core and MCP typecheck | passed |
| Owned-file lint | passed |
| Core and MCP build | passed |
| Generated documentation and manifest checks | passed |
| Version freshness | passed |
| Dependency and forbidden-artifact inspection | no runtime dependency or generated database introduced |
| `git diff --check` | passed before receipt creation |

The complete MCP suite includes the event-state, single-flight, continuation,
prepared-read, watcher lifecycle, ignore reconciliation, navigation guidance,
shared-runtime identity, explicit sync, and background synchronization
witnesses required by this change.

## Scope

This qualification changes watcher scheduling only. It does not change Core V4
authority semantics, ranking, retrieval, Python relationship semantics, CodeQL,
semantic abstention, or cold `call_graph` behavior. It adds no synchronizer,
publication pointer, manifest, lock, snapshot service, durable watcher epoch,
or mutation owner.
