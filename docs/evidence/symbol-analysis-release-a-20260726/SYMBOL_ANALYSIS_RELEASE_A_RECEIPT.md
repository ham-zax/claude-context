# Python Structural Analysis Release A Qualification Receipt

Date: 2026-07-26

## Identity

```text
STRUCTURAL_RELEASE_BASE=2a69144be52e0b4f9ea9894dd5695666c7f7dce9
QUALIFIED_CANDIDATE=0873dd9ffb875ff3e8616db332641abe3df4b53c
TARGET_REVISION=8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7
TARGET_TRACKED_PYTHON_FILES=1013
CORE_VERSION=3.5.0
MCP_VERSION=6.6.0
CLI_VERSION=1.7.0
METRIC_VERSION=python_structural_v1
```

This candidate was constructed from the released pre-freshness base and
contains only Structural Release A, its Core read-lease retention repair, and
the package-version closure. The blocked watcher-unavailable freshness-memory
candidate is not an ancestor of this branch.

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
| Cold selected-symbol request | 4,000 ms | 1,306.404 ms | Pass |
| Repeated selected-symbol p95 | 250 ms | 45.864 ms | Pass |
| Paired analysis overhead p95 | 150 ms | 2.350 ms | Pass |
| 123,835-byte production file | 1,000 ms | 143.488 ms | Pass |
| Peak RSS increase over summary | 64 MiB | 0.094 MiB | Pass |
| Retained RSS increase | 32 MiB | 13.012 MiB | Pass |
| Successful response size | 8,192 bytes | 1,621 bytes | Pass |
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

setup synchronization:
    harness-issued through manage_index
    no analysis-owned synchronization

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

focused Core retention:
    4 passed
    P -> Q -> R, reader multiplicity and release ordering,
      cleanup failure/recovery, contrasting no-reader validation

focused Python structural analysis:
    7 passed

focused MCP route:
    3 passed

complete Core:
    605 passed, 1 skipped, 0 failed

complete MCP:
    1057 passed, 0 failed

complete CLI:
    212 passed, 0 failed

Core, MCP, CLI:
    typecheck passed
    lint passed
    builds passed

generated contracts:
    docs check passed
    manifest check passed
    version freshness passed

packed release:
    MCP installed packed closure passed
    CLI -> MCP -> Core packed closure and offline Potion runtime passed
```

The demonstrated hang was owned by `performAtomicDeltaPublication`: activation
waited for retention, while retention correctly waited for the active reader
of P. Q therefore could not complete, so the test could not activate R and
release P. The repair keeps the existing owners: activation returns its
generation-bound proof while readers retain P; queued retention performs
eventual cleanup only after the final reader releases. It does not delete a
leased generation, weaken validation, or add another retention authority.

## Decision

```text
M0_OUTCOME=symbol_analysis_v1_contract_ready
STORAGE_MODEL=on_demand
RELEASE_A_PERFORMANCE=pass
RELEASE_A_COMPATIBILITY=additive_optional_route
RELEASE_A_OUTCOME=symbol_analysis_release_a_pass
CORE_FULL_SUITE=605_passed_1_skipped_0_failed
MCP_FULL_SUITE=1057_passed_0_failed
CLI_FULL_SUITE=212_passed_0_failed
PACKAGE_VERSION_DECISION=Core 3.5.0; MCP 6.6.0; CLI 1.7.0
PERSISTED_ANALYSIS=not_implemented
GRAPH_DERIVED_RELEASE_B=not_implemented
BLOCKER=none
```

## Raw evidence

- `qualify-symbol-analysis-release-a.mjs`
- `symbol-analysis-release-a-benchmark.json`
