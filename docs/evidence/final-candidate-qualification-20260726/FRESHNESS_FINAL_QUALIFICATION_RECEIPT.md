# Agent-facing freshness final qualification receipt

Date: 2026-07-26

## Identity

```text
BASE_REVISION=a5c7afa041e3be0387a2e39ac59d1084caa9b487
CANDIDATE_PRODUCT_INDEX_DIFF_SHA256=ffa7bc94779d94e472481db694b15732a2777bae9e0ca828ad4019d4b27302ca
TARGET_REVISION=8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7
TARGET_TRACKED_PYTHON_FILES=1013
CORE_VERSION=3.4.0
MCP_VERSION=6.5.0
CLI_VERSION=1.6.0
```

The runtime was built from the base revision plus the six staged MCP
navigation/freshness repair blobs. The staged product diff was not unstaged,
rewritten, or committed by this qualification.

## Format-3 compatibility decision

```text
PUBLIC_SCHEMA_DECISION=format3_supported_transport_and_first_party_consumers_pass
FIELD_OMISSION_SEMANTICS=absent
ARBITRARY_PRIVATE_FORMAT2_PARSERS=not_claimed
```

The MCP protocol transports tool results as JSON text and does not publish a
typed output schema that requires the removed freshness fields. The supported
first-party consumers are compatible:

- the MCP tool wrapper delegates the format-3 projection and consumes bounded
  telemetry independently of the public freshness fields;
- CLI diagnostics parse `status`, result count, and bounded warnings without
  requiring `formatVersion`, `freshnessDecision`, or `freshnessSummary`;
- grouped and raw format-3 compact contracts preserve explicit versioning;
- normal runtime responses omit both freshness properties, while explicit
  debug projection remains separately tested.

Focused compatibility verification:

```text
pnpm --filter @zokizuan/satori-mcp build:runtime
    passed

packages/mcp/src/core/search-compact-contract.test.ts
packages/mcp/src/tools/search_codebase.test.ts
    22 passed, 0 failed

packages/cli/src/local-diagnostics.test.ts
    13 passed, 0 failed
```

This establishes compatibility for the repository-owned clients and the MCP
text transport. It does not claim that an unknown private consumer hard-coded
to the format-2 object shape accepts format 3.

## Frozen watcher-unavailable budgets

The following limits were sealed in the benchmark harness before execution:

```text
unchanged watcher-disabled search p95 <= 7000 ms
one-file changed watcher-disabled search <= 7000 ms
watcher-disabled process-tree peak RSS <= 1600 MiB
```

The search limits reuse the accepted one-file synchronization budget. The
memory limit reuses the accepted incremental-publication runtime allowance.

## Production benchmark

The benchmark used a detached, initially clean copy of the pinned production
Python repository and isolated Potion/LanceDB state. The configured watcher
was permanently disabled. `MCP_WATCH_DEBOUNCE_MS=5300` remained accepted and
ignored.

```text
unchanged search samples:
    6616.721 ms
    6009.572 ms
    6190.685 ms
    6507.658 ms
    6718.435 ms

unchanged p50:
    6507.658 ms

unchanged p95:
    6718.435 ms
    PASS

one-file changed search:
    17156.686 ms
    exact probe returned
    FAIL (budget 7000 ms)

process-tree peak RSS:
    1215.504 MiB
    PASS
```

The fallback performs two explicit full-source comparisons per attempt and may
perform four after the single bounded retry. The changed-file measurement
demonstrates that this correct fail-closed fallback is not acceptable under
the existing one-file product budget on the pinned repository.

Machine-readable evidence:

- `watcher-unavailable-production-benchmark.json`
- `qualify-watcher-unavailable.mjs`

```text
benchmark JSON SHA-256:
    2df78e8f2e0e6cb497f9c54e56eb1bae48fc5369044a81c57413494199f4ea02

benchmark harness SHA-256:
    1f4ef42b2fe5eb2d184620fac5844729ee3ad73480d2ae3532c723594eaa7a3f
```

## Release and verification decision

```text
FRESHNESS_FINAL_OUTCOME=agent_facing_freshness_contract_blocked
PERFORMANCE_OUTCOME=watcher_unavailable_changed_search_budget_failed
FULL_CORE_SUITE=not_run_stop_condition
FULL_MCP_SUITE=not_run_stop_condition
FULL_CLI_SUITE=not_run_stop_condition
SYMBOL_M0_FINALIZATION=not_started_due_freshness_stop_condition
SYMBOL_RELEASE_A_BENCHMARK=not_started_due_freshness_stop_condition
```

The task required an immediate stop when watcher-disabled performance exceeded
an acceptable product budget. Therefore broad suites and the second
symbol-analysis program were not started after the measured failure.

The candidate does not require a new checkpoint, publication, or
synchronization owner. The blocker is product cost, not correctness authority.

Registry state checked on 2026-07-26:

```text
published @zokizuan/satori-core = 3.4.0
published @zokizuan/satori-mcp  = 6.5.0
published @zokizuan/satori-cli  = 1.6.0
```

No package version was changed. Because MCP 6.5.0 is already published, any
later release containing the staged MCP repair must use a new MCP version
(at least 6.5.1 under the existing patch workflow). No Core or CLI source
change from this qualification requires a version change.

## Blocker

```text
BLOCKER=watcher-disabled one-file search took 17156.686 ms against a frozen 7000 ms budget
```
