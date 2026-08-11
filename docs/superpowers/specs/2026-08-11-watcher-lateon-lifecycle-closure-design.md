# Watcher and LateOn Lifecycle Closure Design

**Date:** 2026-08-11

**Goal:** Close the two confirmed post-Issue-21–24 lifecycle defects without reopening indexing, projection, ranking, admission, grouping, provider ordering, or pagination behavior.

## Constraints

- A completed durable index generation and a proven current-source observation are distinct authorities.
- Source reads remain fail-closed when watcher/checkpoint evidence is unavailable.
- Watchers may observe during a full-index mutation but may not start a competing freshness mutation.
- A full-index source handoff is valid only for the candidate policy, exact published generation/checkpoint, same watcher generation, and captured event epoch.
- `watcher_disabled` retains the existing full-source-comparison fallback and does not receive a misleading watcher-sync remediation.
- LateOn queries never wait for bootstrap or recovery. While loading, they immediately use the existing `lateon_not_ready` fallback.
- LateOn performs at most one automatic retry after a retryable pre-ready failure. The existing 2,000 ms readiness deadline applies independently to each attempt.
- Readiness identity mismatch and malformed protocol are deterministic contract failures and are not retried.
- No new ranking, retrieval, admission, provider-order, projection-budget, ignore-semantics, or pagination behavior is authorized.

## Watcher source handoff

`SyncManager` remains the sole owner of watcher generation, event epochs, checkpoint observation state, and prepared-source availability. `ManageIndexingHandlers` coordinates the full-index lifecycle but does not mutate watcher internals directly.

Watcher eligibility is split explicitly:

```text
canObserveRoot
    indexing | indexed | sync_completed

canRunFreshnessMutation
    indexed | sync_completed
```

An observer active during indexing records events. It does not schedule or execute a sync while the full-index mutation owns the root.

Every watcher registration receives a monotonically increasing in-process generation. A candidate-bound capture contains:

```ts
type WatcherBootstrapCapture = Readonly<{
    canonicalRoot: string;
    watcherGeneration: number;
    observedEventEpoch: number;
    candidatePolicyHash: string;
}>;
```

The watcher matcher used for the capture is built from the candidate policy's effective ignore patterns. A reindex must not rely on the previous active generation's matcher.

The full-index sequence is:

```text
resolve candidate policy
→ establish/update candidate-bound watcher observation
→ index candidate
→ capture same ready watcher generation + current event epoch
→ force full-hash checkpoint and compare it to indexed source hashes
→ publish exact canonical generation
→ completeFullIndexSourceHandoff(proven generation, checkpoint observation, capture)
→ verify candidate policy, canonical generation, checkpoint, watcher generation
→ bind source checkpoint state and cover only captured epoch
→ publish lifecycle completion
```

Events after capture remain pending. Watcher replacement, failed/starting coverage, candidate-policy mismatch, generation/checkpoint mismatch, or a missing capture leaves source state unverified.

If durable generation publication succeeds but the source handoff cannot be proven, the generation remains durable. `manage_index status` reports `not_ready`, reason `source_state_unverified`, with a normal sync hint when the watcher is enabled and its observation is unproven or pending. Disabled watcher mode retains the existing fallback semantics.

## LateOn bootstrap recovery

`LateOnReranker` owns worker attempts and terminal bootstrap diagnostics. `ProviderRuntime` continues to construct the reranker and does not wait for readiness.

Bootstrap state retains bounded diagnostics:

```ts
type LateOnBootstrapDiagnostics = Readonly<{
    attemptCount: number;
    initialFailure?: LateOnOperationalError;
    lastFailure?: LateOnOperationalError;
}>;
```

The lifecycle is:

```text
attempt 1 (2,000 ms qualification)
├─ ready → normal operation
├─ retryable pre-ready failure → retain failure, start attempt 2
└─ deterministic contract failure → terminal unhealthy

attempt 2 (2,000 ms qualification)
├─ ready → normal operation, retain bounded historical diagnostics
└─ any failure → terminal unhealthy, no third worker
```

Retryable pre-ready failures are process error, pre-ready process exit, readiness timeout, and worker-reported initialization failure. Readiness identity mismatch and malformed/unsupported protocol are deterministic and terminal immediately.

During either attempt, `rerank()` returns immediate `lateon_not_ready`. After terminal failure, `rerank()` exposes the retained terminal `LateOnOperationalError` instead of reclassifying it. Existing post-ready restart behavior and `close()` cancellation remain unchanged; `close()` prevents a pending retry from spawning.

## Verification boundaries

Watcher regressions must prove:

- indexing-time events are recorded without a sync mutation;
- same-generation handoff makes prepared source reads immediately available;
- post-capture events remain pending;
- watcher replacement fails closed;
- candidate-policy changes cannot hide candidate-relevant events;
- failed/no-ready handoff yields `source_state_unverified` status;
- disabled watcher status does not recommend watcher repair.

LateOn regressions must prove:

- first process exit then ready succeeds on attempt two;
- first readiness timeout then ready succeeds on attempt two;
- two retryable failures become terminal with no third worker;
- readiness identity mismatch performs no retry;
- calls during loading/recovery immediately return `lateon_not_ready`;
- terminal calls retain the actual final cause;
- post-ready restart and close behavior remain unchanged.

The final temporary handoff records these closures and leaves exact-current TradingView runtime qualification as evidence work requiring a restarted MCP client. No live reindex or ranking tournament is part of this design.
