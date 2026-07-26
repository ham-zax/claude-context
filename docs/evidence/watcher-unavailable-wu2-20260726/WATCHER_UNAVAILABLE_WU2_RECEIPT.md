# WU2 watcher-unavailable performance receipt

Date: 2026-07-26

## Identity

```text
BASE_REVISION=a5c7afa041e3be0387a2e39ac59d1084caa9b487
TARGET_REVISION=8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7
TARGET_TRACKED_PYTHON_FILES=1013
RUNTIME_PROFILE=offline
WATCHER=disabled
PROVIDER=Potion
VECTOR_STORE=LanceDB
```

The pre-existing staged candidate remained unchanged. WU2 product,
instrumentation, and evidence changes remain unstaged.

## Before profile

The production debug projection divided the failing changed request into its
existing owners:

```text
changed request wall:
    14725.276 ms

ensureFreshness:
    8784 ms

incremental publication:
    8696 ms

source navigation load:
    665.149 ms

payload delta:
    960.732 ms

navigation delta:
    6145.326 ms

relationship sidecar load:
    3131.121 ms

relationship delta computation:
    1075.346 ms

sidecar staging:
    1886.553 ms

post-publication relationship compatibility load:
    3177 ms

final full-source validation:
    1932 ms
```

The changed request received no exact changed path because the five-second
working-tree cache still held an empty observation:

```text
freshnessComparisonMode=full
exactPathCount=0
```

## Focused repair

The focused candidate changes only existing owners:

1. Watcher-unavailable requests bypass the five-second Git changed-path cache.
2. Full-index navigation activation seeds the existing generation-bound
   navigation-delta cache.
3. Exact ownership search uses the already-proven navigation authority and does
   not load the complete relationship sidecar merely to produce a graph hint.
   Reference routes still load and use relationship evidence normally.
4. Final validation uses the existing synchronizer checkpoint and complete
   source observation. Unchanged paths reuse their sealed hashes only when
   size, mtime, and ctime match; changed observations are hashed. The checkpoint
   and publication are revalidated after comparison.

No synchronizer, checkpoint, publication pointer, publication authority, or
durable source identity was added.

Focused tests passed:

```text
source observation detects changed bytes with restored size and mtime:
    pass

watcher-unavailable Git cache bypass:
    pass

exact ownership fast path avoids relationship compatibility load:
    pass

Core typecheck:
    pass

MCP typecheck:
    pass

Core build:
    pass

MCP runtime build:
    pass
```

## After phase profile

The fresh-state instrumented request demonstrated:

```text
changed request wall:
    9530.581 ms

ensureFreshness:
    4879 ms

incremental publication:
    4760 ms

source navigation load:
    0 ms

payload delta:
    751.898 ms

navigation delta:
    3318.934 ms

relationship sidecar load:
    0 ms

relationship delta computation:
    1000.105 ms

sidecar staging:
    2281.287 ms

post-publication relationship compatibility load:
    0 ms

final source-observation validation:
    676 ms

freshnessComparisonMode:
    exact_paths

exactPathCount:
    1

checkpointBindings:
    1

preRetrievalFullComparisons:
    0

final comparisons:
    1
```

The debug projection performs additional changed-code evidence work, so it is
not the acceptance latency measurement.

## Identical quiet benchmark

The original quiet format-3 production harness was rerun against a new isolated
state with unchanged budgets:

```text
unchanged samples:
    2459.500 ms
    2505.770 ms
    2461.655 ms
    2381.667 ms
    2360.865 ms

unchanged p50:
    2459.500 ms

unchanged p95:
    2505.770 ms
    PASS <= 7000 ms

one-file changed:
    5680.271 ms
    PASS <= 7000 ms

process-tree peak RSS:
    2125.059 MiB
    FAIL > 1600 MiB
```

The instrumented fresh-state run showed that stable searches already reached
2030.738 MiB before the changed publication. At the changed-request peak:

```text
main Node runtime:
    2029.344 MiB

Potion child:
    108.199 MiB
```

The remaining blocker is retained main-runtime capacity associated with the
complete repository relationship/navigation state, not remote access or Potion
inference. WU2 improved the latency by reusing that state, but the retained
representation violates the frozen RSS budget.

## Decision

```text
WU2_OUTCOME=watcher_unavailable_memory_budget_failed
UNCHANGED_LATENCY_OUTCOME=pass
CHANGED_LATENCY_OUTCOME=pass
MEMORY_OUTCOME=fail
FULL_CORE_SUITE=not_run_stop_condition
FULL_MCP_SUITE=not_run_stop_condition
FULL_CLI_SUITE=not_run_stop_condition
MCP_VERSION_DECISION=blocked_no_6.5.1_release_candidate
```

The required stop condition fired. No broad suites, package preparation,
symbol-analysis work, budget increase, or further memory architecture change
was started.

## Raw evidence

- `instrumented-before-detailed-3.json`
- `instrumented-after.json`
- `identical-final.json`

## Blocker

```text
BLOCKER=process-tree peak RSS 2125.059 MiB > 1600 MiB; stable retained capacity was already 2030.738 MiB before the changed publication
```
