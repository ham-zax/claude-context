# Watcher and LateOn Lifecycle Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the watcher bootstrap/source-readiness mismatch and LateOn transient bootstrap outage while retaining truthful diagnostics and all frozen search behavior.

**Architecture:** `SyncManager` owns a candidate-bound watcher-generation capture and exact full-index source handoff; `ManageIndexingHandlers` only coordinates it around the already authoritative checkpoint/publication sequence. `LateOnReranker` owns one bounded retry for retryable pre-ready failures and retains the initial/final terminal causes. Status projects source unavailability without weakening durable generation authority.

**Tech Stack:** TypeScript, Node.js child processes, Chokidar, Node test runner, pnpm.

## Global Constraints

- Do not reopen Issues 21–24 behaviorally.
- Do not change ranking, retrieval, admission, provider ordering, grouping, projection budgets, ignore semantics, or pagination.
- Watcher observation during indexing must never initiate a competing freshness mutation.
- Candidate watcher matching must use the candidate policy's effective ignore patterns.
- Cover only an epoch captured from the same ready watcher generation.
- Validate the exact already-proven canonical generation/checkpoint without relying on completed snapshot status.
- `watcher_disabled` keeps its established full-source-comparison fallback.
- LateOn gets one retry only for retryable pre-ready failures; deterministic identity/protocol failures get zero retries.
- The existing 2,000 ms LateOn readiness deadline remains per attempt; queries never wait.
- Preserve pre-existing staged and unstaged work. Commit task-owned files only and do not push.

---

### Task 1: Candidate-bound watcher source handoff

**Files:**
- Modify: `packages/mcp/src/core/sync.ts`
- Modify: `packages/mcp/src/core/manage-indexing-handlers.ts`
- Modify: `packages/mcp/src/core/manage-maintenance-handlers.ts`
- Modify only if the host contract requires it: `packages/mcp/src/core/handlers.ts`
- Test: `packages/mcp/src/core/sync.test.ts`
- Test: `packages/mcp/src/core/manage-indexing-handlers.test.ts`
- Test: `packages/mcp/src/core/handlers.status.test.ts`
- Test only if navigation integration is not already exercised by the owner tests: `packages/mcp/src/core/handlers.watchers.test.ts`

**Interfaces:**
- Produces: a frozen `WatcherBootstrapCapture` containing canonical root, watcher generation, captured event epoch, and candidate policy hash.
- Produces: a `SyncManager` full-index source-handoff method accepting the capture, candidate policy identity, already-proven canonical generation/checkpoint evidence, and mutation fence.
- Consumes: `ObservedResolvedIndexPolicy`, the full-index checkpoint evidence, and the proven canonical generation already available in `startBackgroundIndexing()`.
- Preserves: `SyncManager.getPreparedReadObservation()` as the final prepared-source authority.

- [ ] **Step 1: Add failing observation-vs-mutation tests**

Add focused `SyncManager` tests that place the snapshot in `indexing`, register a candidate-policy watcher, and prove an event increments the observation epoch without calling `ensureFreshness`, `syncCodebase`, or another mutation owner. Include a candidate ignore-policy change where a path ignored by the old policy but included by the candidate emits an event.

- [ ] **Step 2: Run the new observation tests and verify RED**

Run the smallest Node test command targeting the new names in `packages/mcp/src/core/sync.test.ts`. Expected failure: indexing roots cannot currently retain/register watcher events and candidate effective patterns cannot currently be supplied to the watcher owner.

- [ ] **Step 3: Split observation eligibility from freshness-mutation eligibility**

In `SyncManager`, introduce separately named predicates for observation and freshness mutation. Registration/retention/event recording uses observation eligibility; `ensureFreshness` and mutation paths retain the existing completed-state gate. Bind the indexing watcher matcher to the candidate effective ignore patterns without creating duplicate watcher event streams.

- [ ] **Step 4: Run observation tests and verify GREEN**

Run the same focused command. Expected: indexing events are retained, candidate-relevant paths are visible, and no freshness mutation runs.

- [ ] **Step 5: Add failing same-generation handoff tests**

Add tests for the requested capture/handoff API:

```text
same watcher generation + matching candidate policy + exact proven checkpoint
→ prepared source observation available

event after capture
→ watcher_event_pending

watcher replaced after capture
→ watcher observation remains unavailable

watcher never ready / failed
→ no capture and no source-ready claim
```

The expected values must be literal and must not be computed by the implementation helper.

- [ ] **Step 6: Run handoff tests and verify RED**

Expected failure: no generation-bound capture or dedicated full-index checkpoint handoff exists.

- [ ] **Step 7: Implement the dedicated full-index handoff**

Add a monotonically increasing watcher generation, capture validation, and a dedicated handoff that consumes already-proven canonical generation/checkpoint evidence. It must validate root, candidate policy, canonical generation/checkpoint observation, same ready watcher generation, and mutation ownership before setting checkpoint state and covering only the captured epoch. It must not call the ordinary snapshot-status-gated checkpoint validator.

- [ ] **Step 8: Run handoff tests and verify GREEN**

Run the same focused command and confirm all source-handoff cases pass.

- [ ] **Step 9: Add the failing full-index coordinator and status regressions**

Using the real `ManageIndexingHandlers` coordinator fixture, prove a completed full index invokes the handoff after canonical publication and before lifecycle completion. Add status cases:

```text
completed generation + enabled watcher + unproven/pending observation
→ not_ready / source_state_unverified / sync hint

completed generation + watcher_disabled
→ preserve existing ready/fallback status; no watcher repair hint
```

- [ ] **Step 10: Run coordinator/status tests and verify RED**

Expected failure: full indexing does not complete the watcher/checkpoint handoff and status still claims ready with an unproven enabled watcher.

- [ ] **Step 11: Wire the coordinator and status projection**

Capture immediately before the forced full-hash checkpoint, complete the handoff only after exact canonical publication is proven, and keep lifecycle completion last. Project an enabled-watcher source gap as `source_state_unverified`; preserve disabled-watcher fallback.

- [ ] **Step 12: Verify Task 1**

Run the focused sync, manage-indexing, status, and watcher suites; MCP typecheck; and targeted ESLint for changed files. Inspect the task diff for ranking/search-policy changes and remove any unrelated edits.

- [ ] **Step 13: Commit Task 1**

Commit only Task 1 files with message:

```text
fix(indexing): bind watcher bootstrap to source authority
```

### Task 2: Bounded LateOn bootstrap recovery and retained causes

**Files:**
- Modify: `packages/mcp/src/server/lateon-reranker.ts`
- Test: `packages/mcp/src/server/lateon-reranker.test.ts`
- Modify only if operational identity requires an explicit bound: `packages/mcp/src/server/lateon-reranker-protocol.ts` and the active runtime-profile assets/identity consumers.

**Interfaces:**
- Produces: bounded bootstrap diagnostics with attempt count, initial failure, and last failure.
- Preserves: `LateOnOperationalError`, immediate loading fallback, post-ready restart behavior, and `close()` ownership.
- Consumes: existing 2,000 ms per-attempt readiness bound.

- [ ] **Step 1: Add failing retry-classification tests**

Extend the fake worker with deterministic per-process-attempt behavior and add tests for:

```text
attempt 1 process exit → attempt 2 ready
attempt 1 readiness timeout → attempt 2 ready
two retryable failures → unhealthy, retained final reason, exactly two workers
identity mismatch → unhealthy, exactly one worker
```

- [ ] **Step 2: Run the new tests and verify RED**

Run only the named LateOn tests. Expected failure: pre-ready failures currently terminate without retry and later calls reclassify the cause.

- [ ] **Step 3: Implement one bounded bootstrap retry**

Classify pre-ready failures at their existing source. Retry process error, pre-ready exit, readiness timeout, and initialization failure once. Never retry identity mismatch or malformed/unsupported protocol. Retain initial and last failures. Ensure the second attempt gets its own existing readiness timer and no third worker can spawn.

- [ ] **Step 4: Verify retry tests GREEN**

Run the same tests and confirm attempt counts and terminal reasons exactly match the contract.

- [ ] **Step 5: Add failing non-interference lifecycle tests**

Prove calls during initial loading and recovery immediately return `lateon_not_ready`, terminal calls return the retained terminal cause, post-ready restart behavior remains unchanged, and `close()` during pending recovery cannot spawn another worker.

- [ ] **Step 6: Run lifecycle tests and verify RED**

Expected failure: current code loses terminal cause and has no recovery state to close.

- [ ] **Step 7: Complete lifecycle state handling**

Make retry scheduling synchronous with worker termination ownership, prevent close/retry races, and expose only bounded redacted operational diagnostics. Do not wait in `rerank()` and do not change search fallback classification.

- [ ] **Step 8: Verify Task 2**

Run the complete LateOn test file, MCP typecheck, targeted ESLint, and request-contract check. If an operational profile identity changes, regenerate only its authoritative active-profile consumers and run their frozen-profile checks; otherwise prove the active request/profile digests are unchanged.

- [ ] **Step 9: Commit Task 2**

Commit only Task 2 files with message:

```text
fix(reranker): recover one transient LateOn bootstrap
```

### Task 3: Handoff closure and final verification

**Files:**
- Modify: `tmp/SATORI_TRADINGVIEW_TOOLING_INVESTIGATION_HANDOFF_2026-08-10.md`

**Interfaces:**
- Consumes: reviewed Task 1 and Task 2 commits and their exact test evidence.
- Produces: a temporary ledger that distinguishes code closure from exact-current live-runtime qualification.

- [ ] **Step 1: Update only confirmed handoff statuses**

Record the demonstrated root causes, final owner contracts, commit SHAs, focused verification, and remaining live qualification. Do not rewrite historical issue evidence or claim a TradingView live run that did not occur.

- [ ] **Step 2: Run final verification**

Run the smallest combined affected MCP suites, MCP typecheck, contract/manifest/docs checks only if invalidated, `git diff --check`, and inspect the complete diff from the pre-task base. Confirm no ranking, admission, grouping, provider-order, projection-budget, ignore-semantics, or pagination change.

- [ ] **Step 3: Commit handoff and plan artifacts**

Commit the final handoff plus these approved plan/spec files without including `tmp/review.md` or unrelated staged work. Use message:

```text
docs(handoff): close watcher and LateOn lifecycle work
```

- [ ] **Step 4: Stop**

Do not push. Do not perform a live TradingView reindex or ranking tournament. Report the exact-current MCP restart qualification as the only external evidence step if it remains unperformed.
