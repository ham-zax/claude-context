# Python Structural Analysis Release A Qualification Receipt

Date: 2026-07-26

## Identity

```text
M0_FINALIZATION_BASE=e9745207b517e812cc7e5754ba536a9e32fdc182
TARGET_REVISION=8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7
TARGET_TRACKED_PYTHON_FILES=1013
CORE_VERSION=3.4.0
MCP_VERSION=6.5.0
CLI_VERSION=1.6.0
METRIC_VERSION=python_structural_v1
```

No product code changed in this finalization batch. Watcher-unavailable
freshness architecture and its open RSS blocker were not modified or
requalified.

## Architecture decision

M0 formally selects on-demand analysis for Release A:

```text
file_outline(
    path,
    file,
    resolveMode="exact",
    symbolIdExact="<canonical symbol instance id>",
    detail="analysis"
)
```

One explicit request resolves one canonical Python function or method, reads
current source under the existing publication lease and prepared-source
observation, parses through the existing Tree-sitter owner, computes
`python_structural_v1`, and revalidates the source barrier before returning.

Release A adds no persisted analysis, sidecar, stored-schema migration,
publication or checkpoint authority, synchronization owner, default indexing
work, or graph-derived Release B data.

Persistence may be reconsidered only if later repository-local evidence proves
that repeated latency, transient memory, an approved offline reuse workflow, or
an authorized generation-bound consumer requires it and can own the added
migration, retention, and rollback costs.

## Frozen budgets and results

| Measurement | Budget | Result | Decision |
| --- | ---: | ---: | --- |
| Cold selected-symbol request | 4,000 ms | 49.810 ms | Pass |
| Repeated selected-symbol p95 | 250 ms | 51.333 ms | Pass |
| Paired analysis overhead p95 | 150 ms | 1.235 ms | Pass |
| 123,835-byte production file | 1,000 ms | 144.766 ms | Pass |
| Peak RSS increase over summary | 64 MiB | 0.219 MiB | Pass |
| Retained RSS increase | 32 MiB | 7.059 MiB | Pass |
| Successful response size | 8,192 bytes | 1,611 bytes | Pass |
| Default summary latency | <=5% and <=25 ms | 0% / 0 ms | Pass |

The primary symbol was
`src/cli/main.py::cli_entry_point`
(`syminst_edc7e64840cd907f000b078ad184d322`).

The large supported production sample was
`src/cli/commands/discover.py::main`
(`syminst_16f9fbe19f62a865d46957dec2198929`).

The 525,434-byte generated operations script returned the existing
`OUTLINE_SYMBOL_SPAN_UNVERIFIED` blocker for its selected symbol. It was
retained as fail-closed compatibility evidence rather than misclassified as an
analysis-performance sample.

## Unused default path and compatibility

Omitting `detail` and passing `detail="summary"` produced normalized-identical
responses. The sole permitted per-call difference was the existing
`outline.symbols[].callGraphHint.validatedAt` observation timestamp.

```text
analysis field:
    absent

persisted analysis artifacts:
    none before
    none after

active publication:
    unchanged

last operation:
    unchanged

latency regression:
    0 ms
    0 percent
```

The optional parameter and optional response field are additive. Existing
omitted/summary callers retain their prior normalized response. Unsupported or
unverified requests fail closed without adding a persistence requirement.

```text
ARCHITECTURE_COMPATIBILITY=additive_optional_route
STORED_SCHEMA_DECISION=no_change
PUBLIC_ROUTE_DECISION=minor_compatible
```

## Verification

Passed:

```text
production benchmark:
    all frozen budgets

Core build:
    passed

MCP runtime build:
    passed

benchmark JSON:
    valid
```

The complete Core suite did not finish. It stalled in:

```text
Context retention cannot pass an active publication reader through two activations
```

The suite was interrupted after 416.736 seconds, with 48 tests passed before
the stall. A focused reproduction of that exact existing test timed out after
60 seconds with:

```text
Promise resolution is still pending but the event loop has already resolved
```

The second activation did not resolve after the test released its publication
read lease. This is not owned by structural analysis, but the requested stop
condition applies to any full-suite regression.

The complete MCP suite was not run after the stop condition fired. No attempt
was made to change the freshness, retention, checkpoint, publication, or
synchronization owners.

## Decision

```text
M0_OUTCOME=symbol_analysis_v1_contract_ready
STORAGE_MODEL=on_demand
RELEASE_A_PERFORMANCE=pass
RELEASE_A_COMPATIBILITY=additive_optional_route
RELEASE_A_OUTCOME=symbol_analysis_release_a_qualification_blocked
CORE_FULL_SUITE=blocked_pending_promise
MCP_FULL_SUITE=not_run_stop_condition
PACKAGE_VERSION_DECISION=hold Core 3.4.0 and MCP 6.5.0 release candidacy
PERSISTED_ANALYSIS=not_implemented
GRAPH_DERIVED_RELEASE_B=not_implemented
BLOCKER=Context retention cannot pass an active publication reader through two activations does not complete
```

## Raw evidence

- `qualify-symbol-analysis-release-a.mjs`
- `symbol-analysis-release-a-benchmark.json`
