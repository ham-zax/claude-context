# Cold First-Use `call_graph` Characterization Receipt

## Terminal outcome

```text
cold_graph_multi_owner
```

The first `call_graph` after a fresh MCP process start has two independent
multi-second owners:

1. completion/checkpoint proof validation;
2. relationship-sidecar load, parse, validation, and materialization.

Neither sidecar I/O alone nor adjacency construction is the complete dominant
owner.

## Evidence boundary

```text
Satori revision: 4138b1eba5606a8291b45395f767a46b946070fb
Satori tree:     7df3676ef379e047a8019eda6a98ca943c8c838e
Target revision: 8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7
Target tree:     2969002a2aa46948d6557ac5f5c70e19355c80a7
Node:            v24.13.0
Kernel:          Linux 6.18.33.2-microsoft-standard-WSL2 x86_64
MCP:             6.3.0
Navigation:      JSON serving backend
Relationship:    relationship-v9+python-constructor-receivers+python-native-resolution-v1
```

The ready task-owned publication contained:

```text
tracked files:          1,519
chunks:                 19,741
symbol records:         14,824
non-file symbols:       13,305
relationship records:  27,732
persisted claims:       79,173
```

The exact graph target was:

```json
{
  "file": "src/python/core/signals.py",
  "symbolId": "syminst_db0684c3f6f05b6df0addc5c3cb17e8e",
  "span": {
    "startLine": 290,
    "endLine": 538
  }
}
```

All cold and warm responses were `status=ok` with 20 nodes and 20 edges.

## Uninstrumented latency

Percentiles use median p50 and nearest-rank p95.

| Boundary | Samples | p50 | p95 | Range |
| --- | ---: | ---: | ---: | ---: |
| Fresh-process runtime startup and MCP initialization | 10 | 645.95 ms | 707.75 ms | 601.15–707.75 ms |
| First `call_graph` after startup | 10 | 7,204.25 ms | 7,530.10 ms | 6,828.12–7,530.10 ms |
| Warm `call_graph` after two primers | 20 | 11.97 ms | 13.57 ms | 10.97–22.77 ms |

The two warm primers were 9,398.66 ms and 1,267.91 ms. The second primer was
required because the first follow-up call filled the prepared navigation cache;
it was not mislabeled as a warm sample.

## Instrumented cold boundaries

The boundary run was separate from the uninstrumented latency run.

| Boundary | p50 | p95 | Interpretation |
| --- | ---: | ---: | --- |
| Publication snapshot discovery | 6.49 ms | 7.58 ms | Snapshot reload only |
| Readiness residual outside completion proof | 4.07 ms | 4.71 ms | Tracked-root/readiness residual |
| Completion/checkpoint validation | 3,239.18 ms | 3,587.30 ms | First dominant owner |
| Symbol registry load | 644.73 ms | 700.05 ms | Material but secondary |
| Relationship compatibility envelope | 3,199.01 ms | 3,374.04 ms | Includes relationship load |
| Relationship load | 2,586.10 ms | 2,720.87 ms | Second dominant owner |
| Relationship manifest I/O | 1.00 ms | 1.16 ms | Not dominant |
| Relationship shard I/O | 987.39 ms | 1,039.53 ms | Material sub-owner |
| Relationship JSON parse | 780.38 ms | 807.43 ms | 305,199,213 parsed bytes |
| Validation/materialization residual | 825.70 ms | 882.59 ms | Material sub-owner |
| `getGraphNeighbors`/graph-build upper bound | 22.65 ms | 24.49 ms | Not dominant |
| Adjacency construction estimate | 20.64 ms | 22.47 ms | Cold build minus stable warm build |
| Target-symbol resolution upper bound | 2.22 ms | 2.31 ms | Includes the small inter-boundary gap |
| MCP JSON response formatting | 0.07 ms | 0.09 ms | Not dominant |

`getGraphNeighbors` is reported as an upper bound because the wrapped
`RelationshipBackedCallGraph.build` also performs the bounded TESTS lookup and
graph projection. Target resolution is also an upper bound: it is the interval
between symbol-file load and compatibility load and may include adjacent source
span checks. Both upper bounds are far below either dominant owner.

## Classification rationale

The completion proof and relationship compatibility/load phases each consume
about three seconds. The relationship owner further divides into roughly one
second of shard I/O, 0.8 seconds of JSON parsing, and 0.8 seconds of validation
and materialization. Classifying only sidecar I/O, parsing, or adjacency as the
single dominant owner would discard a comparably large independent phase.

Therefore:

```text
COLD_GRAPH_OUTCOME=cold_graph_multi_owner
```

## Isolation and limitations

- No product file was edited.
- No prewarming or budget change was made.
- Each cold sample used an independent MCP process.
- Shared-runtime indirection and the watcher were disabled.
- A task-owned preload redirected only this experiment's runtime-owner registry
  directory. The mutation gate remained active.
- Instrumentation accumulated timing records in memory and flushed after each
  call. Product latency percentiles therefore come from the separate
  uninstrumented run.
- The OS page cache was not forcibly dropped; each fresh process observed the
  host's normal cache state.

Portable raw evidence and commands are under `raw/`,
`characterization-summary.json`, and `SAMPLING_COMMANDS.md` beside this receipt.
