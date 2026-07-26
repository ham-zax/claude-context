# WU1 watcher-unavailable request-proof optimization receipt

Date: 2026-07-26

## Identity

```text
BASE_REVISION=a5c7afa041e3be0387a2e39ac59d1084caa9b487
PREVIOUS_FAILED_CANDIDATE_DIFF_SHA256=ffa7bc94779d94e472481db694b15732a2777bae9e0ca828ad4019d4b27302ca
WU1_REPAIR_DELTA_SHA256=b1f7b1aa1733d525d0cfdccf6409c615ed2d7128b089230902f82cbe1bf9106f
TARGET_REVISION=8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7
TARGET_TRACKED_PYTHON_FILES=1013
```

The previous failed receipt and benchmark remain unchanged under
`docs/evidence/final-candidate-qualification-20260726/`.

## Demonstrated mismatch and repair

The previous watcher-unavailable request performed:

```text
existing ensureFreshness owner
-> explicit full comparison before retrieval
-> retrieval
-> explicit full comparison before return
```

Focused call-count tests demonstrated two full comparisons per successful
request after the freshness owner had already completed.

WU1 keeps the same owners and changes only the request-local proof:

```text
existing ensureFreshness owner completes
-> capture its active source-checkpoint/publication tuple
-> post-freshness prepared read proves the same tuple
-> acquire and use that publication
-> one final full comparison
```

When Git supplies exact changed paths, the first attempt passes those paths to
the existing freshness owner even when watcher observation is unavailable.
The retry attempt deliberately omits the exact-path shortcut and uses the
existing forced full freshness path.

The request-local proof is not persisted and is not a checkpoint, publication
pointer, synchronizer, or mutation authority.

Focused verification:

```text
watcher-disabled full-flight proof:
    checkpoint bindings = 1
    pre-retrieval full comparisons = 0
    final full comparisons = 1

watcher-disabled exact-path proof:
    exact path count = 1
    checkpoint bindings = 1
    pre-retrieval full comparisons = 0
    final full comparisons = 1

real MCP/Core add-modify-delete lifecycle:
    three requests
    three final full comparisons

3 tests passed, 0 failed
MCP typecheck passed
MCP runtime build passed
```

## Frozen budgets

The budgets were not changed:

```text
unchanged watcher-disabled search p95 <= 7000 ms
one-file changed watcher-disabled search <= 7000 ms
watcher-disabled process-tree peak RSS <= 1600 MiB
```

## Production rerun

The first WU1 run used the same pinned target and isolated Potion/LanceDB
configuration as the failed qualification.

```text
unchanged samples:
    4299.206 ms
    4228.633 ms
    4069.394 ms
    3660.956 ms
    3795.278 ms

unchanged p50:
    4069.394 ms

unchanged p95:
    4299.206 ms
    PASS

one-file changed search:
    14425.845 ms
    exact probe returned
    FAIL

process-tree peak RSS:
    1870.340 MiB
    FAIL
```

Relative to the preserved failed attempt:

```text
unchanged p95:
    6718.435 ms -> 4299.206 ms
    36.01% reduction

one-file changed:
    17156.686 ms -> 14425.845 ms
    15.92% reduction
```

The raw rerun was produced by the immutable earlier benchmark harness. Its
embedded `fullSourceComparisonContract` object describes the earlier harness
contract and is not a runtime call-count measurement for WU1. The focused
debug/call-count tests above are the authority for WU1's one-final-comparison
structure.

The first run already violated two frozen budgets. The required stop condition
therefore fired before the requested second sample set, delete/rename timing,
broader suites, or symbol-analysis work.

Raw evidence:

- `wu1-production-run-1.json`

## Decision

```text
WU1_OUTCOME=watcher_unavailable_budget_failed
FRESHNESS_FINAL_OUTCOME=agent_facing_freshness_contract_blocked
SELECTED_NEXT_DECISION=A
```

Decision A means watcher-unavailable automatic freshness remains a supported
goal, but it requires a separately approved performance architecture change.
This batch does not authorize that change.

The evidence does not support raising the budget. It also does not authorize
changing watcher-unavailable search into a blocked operational mode.

## Verification and package decision

```text
FULL_CORE_SUITE=not_run_stop_condition
FULL_MCP_SUITE=not_run_stop_condition
FULL_CLI_SUITE=not_run_stop_condition
SYMBOL_M0=not_started
MCP_VERSION_DECISION=blocked_no_6.5.1_release_candidate
```

## Blocker

```text
BLOCKER=one-file changed search 14425.845 ms > 7000 ms and process-tree peak RSS 1870.340 MiB > 1600 MiB
```
