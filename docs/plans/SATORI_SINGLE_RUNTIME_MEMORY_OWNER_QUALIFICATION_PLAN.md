# Satori Single-Runtime Memory-Owner Qualification Plan

**Status:** complete. M0 completed on 2026-07-24 with
`single_runtime_memory_cost_explained`. Search and indexing memory is dominated
by bounded `@lancedb/lancedb` / Arrow native allocation and allocator
high-water, plus the live provider context and Potion worker. Repository state
and incremental mutation costs are comparatively small. M1 records no safe
direct repair: retiring the live provider after indexing would require new
operation, watcher, and reinitialization lifecycle semantics while leaving
approximately 460 MiB of post-index parent high-water. M2 records
`shared_runtime_host_recommended`. The shared-host plan is reactivated at H0
only; this plan authorizes no host implementation.

**Runtime revision under evidence:**
`c9ece273fb18300cd19d80c2175eb7321955ebaf`.

**Documentation revision:** `4badd90955e134b446dec50c7a8277fd87711b33`.

**Runtime under investigation:** MCP `6.2.0`, Core `3.1.0`, managed offline
Potion + LanceDB on Linux x64 / WSL.

## 1. Decision

The completed decision sequence was:

```text
M0  localize the single-runtime memory owner
    -> single_runtime_memory_cost_explained
    -> M1 no safe bounded direct repair
    -> M2 remeasure one/two/four direct runtimes
    -> shared_runtime_host_recommended
```

Reactivate H0 of
`docs/plans/SATORI_SHARED_OFFLINE_RUNTIME_HOST_PLAN.md`.

The balanced product boundary is:

- keep the current direct runtime for excluded configurations;
- do not add speculative LanceDB tuning, forced GC, provider idle timers, or a
  post-index context reset;
- share the already-valid offline Potion + LanceDB provider/runtime authority
  only across compatible active MCP sessions; and
- keep repository state root-keyed and session protocol state independent.

H0 must still freeze the host/session ownership, transport, lifecycle, and
resource contracts before implementation. This decision does not authorize
H1-H4.

## 2. Observable outcome

Produce a reproducible account of the memory added by:

- MCP startup and local-only tooling;
- repository snapshot registration;
- vector-only provider initialization;
- embedding-capable provider initialization;
- LanceDB connection and table use;
- navigation and relationship reads;
- first and repeated searches;
- Potion worker startup;
- one incremental mutation;
- a second repository; and
- idle time after work completes.

The result must distinguish:

```text
V8 heap
V8 committed but unused heap
Node external / ArrayBuffer memory
anonymous native memory
file-backed mappings
Potion child-process memory
LanceDB adapter, connection, and table lifetimes
provider and ToolContext multiplicity
bounded navigation/result caches
watcher and synchronization state
temporary query/index buffers
retained growth versus allocator high-water behavior
```

Do not call an owner a leak unless a bounded repeated workload demonstrates
continuing retained growth rather than a stable plateau.

## 3. Frozen diagnostic observations

### 3.1 Original observation

The 2026-07-23 shared-host investigation recorded:

| State | Observed PSS |
|---|---:|
| Idle launcher + MCP runtime | 76.8–84.3 MiB |
| Active launcher + MCP runtime + Potion worker | approximately 849.0 MiB |
| Potion worker | approximately 106.6 MiB |
| Active MCP runtime excluding Potion | approximately 732.5 MiB |
| Five Satori connections | approximately 1.15 GiB |

This established process-level multiplication but did not identify the active
runtime's internal owner.

### 3.2 Reconciliation observation

A read-only `/proc` sample during plan reconciliation found one long-lived
managed MCP 6.2.0 process in an unknown prior workload state:

| Process state | RSS | PSS | Anonymous | Threads |
|---|---:|---:|---:|---:|
| Active MCP runtime | 1,968,284 KiB | 1,950,496 KiB | 1,927,848 KiB | 54 |
| Potion worker | 108,696 KiB | 107,142 KiB | 106,492 KiB | not qualified |
| Three idle MCP runtimes | 85,944–88,944 KiB | 70,688–73,707 KiB | 69,812–72,832 KiB | 23 each |

The active process had approximately 1.93 GiB of private dirty anonymous
memory. This makes a file-mapped Potion model an insufficient explanation, but
does not distinguish V8, Arrow/LanceDB, native allocator retention, or a
retained application object.

This second sample is exploratory. Its repository, query history, mutation
history, and initialization order were not frozen, so it is not an acceptance
baseline and must not be used to claim a regression or leak.

### 3.3 Completed M0 findings — 2026-07-23 to 2026-07-24

The task-owned evidence root is:

```text
/home/hamza/repo/satori-single-runtime-memory-evidence/20260723-c9ece27
```

The diagnostic harness runs the built MCP `6.2.0` server in-process with its
normal MCP framing, offline Potion worker, and LanceDB adapter. It records
process and owner counts without storing source, query, vector, or credential
contents. Every measured runtime uses an isolated `HOME`,
`SATORI_STATE_ROOT`, and `LANCEDB_PATH`.

The in-process harness is authoritative for controlled deltas and internal
ownership counts. Its absolute PSS includes diagnostic-harness overhead and is
not the final managed-runtime acceptance value. M2 black-box managed runtimes
remain authoritative for final aggregate memory.

The first clean initialized sample, before any provider context existed,
recorded:

| Parent state | PSS | Anonymous | V8 heap used | Node external | Provider contexts |
|---|---:|---:|---:|---:|---:|
| MCP initialized, empty state | 102,763 KiB | 98,568 KiB | 55,235,728 bytes | 21,665,620 bytes | 0 |

This disproves the hypothesis that the gigabyte-scale cost is an unavoidable
base-process cost.

#### Provider initialization order

Three fresh-process repetitions compared:

```text
vector-only proof -> semantic search
semantic search -> vector-only proof
```

The 60-second steady-state parent results were:

| Order | PSS samples | Median PSS | Retained provider contexts |
|---|---:|---:|---:|
| Vector then embedding | 207,120 / 208,622 / 208,643 KiB | 208,622 KiB | 2 |
| Embedding then vector | 201,648 / 206,087 / 199,770 KiB | 201,648 KiB | 1 |

The vector-first order was higher in all three repetitions. The difference
between the two median PSS values was 6,974 KiB (6.81 MiB), and the matching
count changed from one to two provider `Context` and LanceDB-adapter owners.

This records a localized secondary owner:

```text
classification: per_context_cost
owner: ProviderRuntime vectorRuntimePromise + embeddingRuntimePromise
prevention witness: embedding-first reuses one capability-superset context
median retained cost: 6.81 MiB
```

It is real but not material enough to explain the original 732 MiB–1.95 GiB
parent observation. M0 therefore does not authorize a production change for
this owner yet.

#### Representative publication and first search

One preserved task-owned 488-file Satori worktree was rebuilt once under the
current extractor and relationship identities. The completed publication has
11,068 chunks.

The same-process publication build recorded:

| Checkpoint | Parent PSS | Anonymous | V8 heap used | Node external |
|---|---:|---:|---:|---:|
| Empty initialized process | 101,619 KiB | 96,304 KiB | 54 MiB | 20 MiB |
| Publication completed | 850,530 KiB | 787,920 KiB | 188 MiB | 52 MiB |
| 60 seconds idle | 855,562 KiB | 792,440 KiB | 189 MiB | 52 MiB |

The retained owner is not represented by application cache counts: the
completed process held one provider context, one synchronizer, one generation
proof, one publication read gate, one prepared read, and no result-set or
prepared-navigation entries. Most of the retained delta is anonymous memory
outside live V8 heap and Node external bytes.

A fresh process opening the same complete publication recorded:

| Checkpoint | Parent PSS | Anonymous | V8 heap used | Node external | Potion PSS |
|---|---:|---:|---:|---:|---:|
| Registered, provider unopened | 118,735 KiB | 98,496 KiB | 54 MiB | 20 MiB | 0 |
| First search delivered | 362,037 KiB | 292,444 KiB | 137 MiB | 43 MiB | 109,224 KiB |
| 60 seconds idle | 357,669 KiB | 294,164 KiB | 113 MiB | 24 MiB | 109,229 KiB |

This separates two costs:

- publication/index construction leaves a much larger same-process high-water
  state than reopening the completed publication in a fresh process; and
- first dense + lexical search against 11,068 chunks adds approximately
  233 MiB of retained parent PSS relative to the registered unopened process,
  independently of the Potion child.

These are not leaks. The bounded repeated-search, direct-adapter, close, and GC
comparisons below assign the search cost to the native LanceDB/Arrow query
boundary and split live provider state from allocator high-water.

#### Repeated representative search

Three fresh processes each ran one warmup and 20 identical searches against the
same frozen generation:

| Repetition | Warm-search PSS | Search 10 PSS | Search 20 PSS | 60-second idle PSS | Paired warm-to-idle delta |
|---|---:|---:|---:|---:|---:|
| 1 | 353,721 KiB | 394,817 KiB | 414,137 KiB | 413,947 KiB | 60,226 KiB |
| 2 | 354,049 KiB | 399,593 KiB | 410,429 KiB | 410,311 KiB | 56,262 KiB |
| 3 | 352,469 KiB | 391,109 KiB | 410,489 KiB | 410,355 KiB | 57,886 KiB |

The median paired warm-to-idle retained delta is 57,886 KiB (56.53 MiB).
Growth continued from search 10 to search 20 in all three repetitions.

The median component values make the mismatch inspectable:

| Checkpoint | Anonymous | V8 heap used | Node external | ArrayBuffers |
|---|---:|---:|---:|---:|
| Warm search | 292,996 KiB | 142,338,528 bytes | 48,170,169 bytes | 43,920,542 bytes |
| Search 10 | 334,092 KiB | 105,018,128 bytes | 33,125,224 bytes | 24,926,079 bytes |
| Search 20 | 349,764 KiB | 133,629,624 bytes | 38,798,427 bytes | 26,646,888 bytes |
| 60 seconds idle | 349,624 KiB | 137,009,552 bytes | 39,124,126 bytes | 26,972,587 bytes |

Anonymous memory rose while V8 heap, Node external bytes, and ArrayBuffers
ended below the warm checkpoint. The provider-context count remained one, and
the result-set/continuation cache remained empty.

This satisfied the plan's condition for one bounded 100-search extension.
Three fresh repetitions produced the following median parent checkpoints:

| Checkpoint | Median parent PSS |
|---|---:|
| Warm search | 353,987 KiB |
| Search 10 | 392,411 KiB |
| Search 20 | 409,199 KiB |
| Search 40 | 433,071 KiB |
| Search 60 | 455,924 KiB |
| Search 80 | 474,523 KiB |
| Search 100 | 419,484 KiB |
| 60 seconds idle | 419,346 KiB |

The median paired warm-to-idle delta was 64,834 KiB (63.31 MiB). Every
repetition peaked at search 80 and fell by search 100 without a context-count
change or task-owned swap. This disproves monotonic per-query retention and
classifies the repeated-query behavior as bounded native allocation cycling
plus allocator high-water.

A separate fresh `--expose-gc` process reduced V8 heap used from approximately
137 MiB to 74 MiB, but parent PSS fell only 9,970 KiB and remained unchanged
through the 60-second post-GC window. Reachable JavaScript heap is therefore
not the material retained owner.

#### Direct LanceDB operation isolation

Fresh direct-adapter processes reused the same complete read-only publication
and removed MCP, provider, navigation, grouping, and Potion owners from the
query loop.

| Checkpoint | Dense PSS | Dense anonymous | Lexical PSS | Lexical anonymous |
|---|---:|---:|---:|---:|
| Adapter opened | 50,119 KiB | 23,600 KiB | 50,619 KiB | 24,116 KiB |
| Warm query | 95,394 KiB | 45,436 KiB | 81,547 KiB | 30,108 KiB |
| Query 20 | 139,351 KiB | 89,232 KiB | 98,334 KiB | 46,736 KiB |
| Query 80 | 172,777 KiB | 122,656 KiB | 111,503 KiB | 59,872 KiB |
| Query 100 | 168,469 KiB | 118,348 KiB | 118,195 KiB | 66,564 KiB |
| Close + 10 seconds idle | 165,611 KiB | 115,164 KiB | 113,537 KiB | 61,516 KiB |

Both direct query paths reproduce retained anonymous growth. Dense search has
the larger transient and retained cost and shows the same non-monotonic
behavior as the complete hybrid search. Adapter close does not materially
return the retained pages. V8 heap remained approximately 8–15 MiB and Node
external memory approximately 1–7 MiB, so these direct deltas lie below the
normal JavaScript accounting boundary.

This localizes the search-related material allocation to the
`@lancedb/lancedb` / Arrow native query boundary rather than Satori result,
continuation, navigation, or provider-context caches.

#### Provider close and post-index lifecycle

Three fresh 20-search processes shut down the provider after the normal
60-second idle checkpoint:

| Repetition | Before close | 60 seconds after close | Parent PSS released |
|---|---:|---:|---:|
| 1 | 416,708 KiB | 268,263 KiB | 148,445 KiB |
| 2 | 418,312 KiB | 265,864 KiB | 152,448 KiB |
| 3 | 417,369 KiB | 264,241 KiB | 153,128 KiB |

The provider context and embedding counts changed from one to zero and the
Potion child exited. The median parent release was 152,448 KiB (148.88 MiB).
The median parent still retained approximately 147,129 KiB above the unopened
representative baseline. This proves both live provider ownership and material
native allocator high-water.

The required second representative build then isolated post-index shutdown:

| Checkpoint | Parent PSS | Anonymous | Task aggregate PSS |
|---|---:|---:|---:|
| Empty initialized state | 113,562 KiB | 98,092 KiB | 113,562 KiB |
| Index complete, 60 seconds idle | 843,822 KiB | 763,876 KiB | 953,003 KiB |
| Provider shut down, 60 seconds idle | 584,635 KiB | 504,588 KiB | 584,635 KiB |

Provider shutdown released 259,187 KiB from the parent and removed the
109,181 KiB Potion child, for an aggregate release of 368,368 KiB. The parent
still retained 471,073 KiB (460.03 MiB) above its clean initialized baseline.
The live provider is therefore a material lifecycle owner, but most of the
post-index residual is native indexing high-water that provider shutdown does
not return.

Retiring and recreating the provider immediately after publication is not a
bounded M1 repair. The provider context also owns watchers, synchronizers,
prepared generation state, and future tool reuse. Safe retirement would need
new operation exclusion, watcher transfer, and lazy reinitialization semantics,
while still leaving the larger post-index high-water demonstrated above.

#### Repository and incremental scaling

Three paired fresh-process repetitions added a second small repository after
the first repository was already searched. The second root added:

```text
8,908 / 9,832 / 9,196 KiB parent PSS
median: 9,196 KiB (8.98 MiB)
```

Watcher, synchronizer, prepared-read, and prepared-navigation root counts each
changed exactly from one to two. Repository-root state is therefore a small,
predictable `per_repository_cost`, not the material owner.

Three fresh processes applied one small body edit and completed incremental
synchronization:

```text
25,827 / 24,690 / 26,055 KiB warm-to-idle parent PSS
median: 25,827 KiB (25.22 MiB)
```

Every resulting generation was searchable and no task-owned process swapped.
A small incremental mutation does not reproduce full-index high-water.

#### Long-lived exploratory process

The previously observed managed process later changed from approximately
1.95 GiB resident PSS to:

```text
PSS:       683,697 KiB
Anonymous: 675,048 KiB
Swap:    1,280,416 KiB
```

Its resident reduction coincided with approximately 1.22 GiB of swap, so it is
not evidence that the original anonymous allocation was released. Because its
workload history remains unknown, this remains exploratory corroboration only.

#### M0 terminal decision

```text
decision: single_runtime_memory_cost_explained
secondary owner: per_context_cost localized at 6.81 MiB
search allocation boundary: LanceDB/Arrow native query path
search retention class: bounded native allocation cycle + allocator high-water
live provider release: 148.88 MiB median after repeated search
post-index live provider release: 253.11 MiB parent + 106.62 MiB Potion
post-index residual: 460.03 MiB parent above clean baseline
second repository: 8.98 MiB median
small incremental mutation: 25.22 MiB median
production changes: none
M1: no direct repair; post-index retirement is a new lifecycle design
next action: M2 one/two/four direct-runtime qualification
```

### 3.4 M2 direct-runtime qualification — 2026-07-24

The black-box harness started the installed MCP `6.2.0` runtime entry directly
with isolated task-owned state. Every client completed a readiness warm-up
before the measured simultaneous search so a shared freshness check could not
turn first-use `not_ready` responses into false retrieval differences.

The clean and comparable results were:

| Clients | Idle aggregate PSS | Active aggregate PSS | Potion workers | Search result |
|---:|---:|---:|---:|---|
| 1, repetition 1 | 114,185 KiB | 418,170 KiB | 1 | 5 identical identities |
| 1, repetition 2 | 114,811 KiB | 468,017 KiB | 1 | 5 identical identities |
| 2, repetition 1 | 210,250 KiB | 884,208 KiB | 2 | identical across clients |
| 2, repetition 2 | 210,479 KiB | 859,629 KiB | 2 | identical across clients |
| 4, clean repetition | 401,801 KiB | 1,575,695 KiB | 4 | identical across clients |

No task-owned process swapped in those rows. Direct active memory and Potion
worker count scale with process count. The second four-client run corroborated
the active aggregate at 1,632,273 KiB, but the host was near its resource
ceiling (`SwapFree=65,504 KiB`) and the task recorded 64 KiB of swap, so it is
not used as an acceptance aggregate.

The third four-client run completed but is explicitly excluded:

```text
task aggregate PSS: 1,209,510 KiB
task swap at completion: 5,352 KiB
SwapFree: 59,880 KiB
empirical p95 latency: 42.86 seconds
```

That run measured WSL memory pressure and swapping rather than an equivalent
runtime state. It is not replaced with an assumed value and is not included in
an aggregate. The filesystem was not the limiting resource: the evidence root
was 2.8 GiB and the filesystem still had approximately 850 GiB available.

The clean one-client upper result plus the preserved 32 MiB incremental-session
gate projects a four-session shared host no larger than:

```text
468,017 KiB + (3 * 32,768 KiB) = 566,321 KiB
```

Against the clean measured four-runtime aggregate of 1,575,695 KiB, this is a
projected reduction of 64.1%. The projection exceeds the 40% reactivation gate
without assuming any LanceDB or Potion optimization.

Measured direct-runtime p95 latency was 258–348 ms for one client, 954–1,763 ms
for two simultaneous clients, and 1,618 ms for the clean four-client run.
Every accepted response contained the same five stable result identities.

M2 therefore records:

```text
decision: shared_runtime_host_recommended
basis:
    valid memory is duplicated per direct process
    Potion workers scale exactly 1:1 with active processes
    one Context already owns two roots with only 8.98 MiB median added cost
    projected four-session PSS reduction is 64.1%
boundary:
    reactivate H0 only
    no direct-runtime or retrieval semantic change
```

### 3.5 Experiment inventory

The conclusion is based on 50 sealed JSONL scenario records and 21 per-client
runtime logs, not one favorable process sample.

| Experiment group | Recorded runs |
|---|---:|
| Harness smoke and publication/setup preparation | 6 |
| Provider initialization order | 6 |
| First-use and representative first-search ladders | 2 |
| Repeated 20-search qualification | 3 |
| Exploratory and accepted 100-search extensions | 4 |
| Dense, lexical, and hybrid native-boundary isolation | 3 |
| Fresh provider-close repetitions | 3 |
| Forced-GC comparison | 1 |
| Representative post-index close comparison | 1 |
| One-root/two-root scaling | 6 |
| Incremental mutation | 3 |
| Exploratory direct-runtime client matrix | 3 |
| Corrected direct-runtime acceptance matrix | 9 |
| **Total JSONL scenario records** | **50** |

Of these, six were smoke/setup/publication preparation and 44 were diagnostic
or qualification runs. The matrix covered:

- two full representative publication builds;
- three 20-search repetitions;
- four 100-search histories;
- three fresh provider-close histories;
- three repository-scaling pairs;
- three incremental mutations;
- direct LanceDB dense and lexical execution outside MCP;
- one forced-GC control;
- one-, two-, and four-client direct-runtime execution; and
- both clean and resource-pressure boundary observations.

Exploratory, pressure-contaminated, and acceptance evidence remain separately
labelled. No paid provider, user index, user repository mutation, or production
telemetry was used.

The final seal covers 128 fixture, log, and measurement files:

```text
manifest:
    /home/hamza/repo/satori-single-runtime-memory-evidence/
    20260723-c9ece27/manifests/final-evidence.sha256
manifest SHA-256:
    c9f0187c64236e1114d447d4a5cf771cbe94f87b2e967de2915b775bfc576814
```

Disposable LanceDB/state copies are preserved outside Git but excluded from the
content manifest because the sealed measurements already bind their
task-specific hashes and runtime identities.

## 4. Current repository ownership map

The following are concrete investigation targets, not asserted causes.

### 4.1 Always-present local context

`ContextMcpServer` constructs:

- one local-only `Context`;
- one local-only `SyncManager`;
- one local-only `ToolHandlers`;
- one `SnapshotManager`;
- one `CallGraphSidecarManager`; and
- one `ProviderRuntime`.

The local-only `Context` still constructs language-analysis and root-keyed
state even though its vector backend is intentionally unconfigured.

### 4.2 Provider context multiplicity

`ProviderRuntime` owns separate promises for:

```text
vectorRuntimePromise
embeddingRuntimePromise
```

It retains every created provider `ToolContext` in `activeContexts` and every
embedding in `activeEmbeddings` until process shutdown.

A vector-only operation before the first embedding operation can therefore
create:

```text
local-only Context
vector-only provider Context + LanceDB adapter
embedding-capable provider Context + second LanceDB adapter + Potion worker
```

If embedding initialization happens first, later vector-only operations reuse
the embedding-capable context. M0 must compare these two operation orders.
This is a falsifiable context-duplication hypothesis, not a proven memory
owner.

### 4.3 LanceDB ownership

Each `LanceDbVectorDatabase` retains one lazy connection until `close()`.
Ordinary table operations open and close table handles, while some control
reads create and close separate transient connections.

M0 must distinguish:

- one versus two retained adapters/connections;
- first connection versus first table/query cost;
- table handles that close normally;
- transient connection churn;
- memory released by adapter close; and
- memory retained by the native allocator after logical close.

Do not change LanceDB configuration or blame the backend until this boundary is
measured directly.

### 4.4 Handler and navigation state

Existing result-set and navigation caches have entry or byte bounds in several
places, including the 16 MiB search-result-set cache. Other prepared-read,
changed-file, gitignore, navigation, proof, and synchronizer maps must have
their actual entry counts and retained payload sizes recorded.

The existence of a cache is not evidence that it owns the observed memory.

### 4.5 Potion ownership

Potion runs in a separate child process and is measured independently. Potion
inference, tokenizer, pooling, model identity, and worker protocol are outside
this program unless evidence shows the parent process is retaining duplicated
request or response buffers.

## 5. Scope

### Included

- managed offline Potion + LanceDB on Linux x64 / WSL;
- task-owned repositories, state roots, and LanceDB paths;
- read-only `/proc` process and mapping evidence;
- a diagnostic-only in-process harness for existing runtime owners;
- real managed-MCP black-box checkpoints;
- one bounded repeated-search sequence;
- one bounded small-file mutation;
- zero-, one-, and two-repository single-process cases;
- one-, two-, and four-process direct-runtime remeasurement after any direct
  repair; and
- the final shared-host recommendation decision.

### Excluded

- implementing the shared host;
- Unix sockets, daemon lifecycle, or session multiplexing;
- paid embedding providers;
- modifying Potion inference, tokenizer, pooling, or dimensions;
- ranking, reranking, retrieval tuning, or quality qualification;
- changing publication, receipt, recovery, or freshness semantics;
- changing public MCP tools or schemas;
- a permanent memory-observability framework;
- heap dumps containing user source, queries, credentials, or vectors;
- production telemetry or a new public configuration surface;
- blind LanceDB tuning;
- cold-publication optimization; and
- native profiler installation without a separately justified decision.

## 6. Evidence and safety contract

- Never clear, mutate, or reindex a user's active repository state.
- Use a fresh `SATORI_STATE_ROOT`, LanceDB path, and task-owned fixture.
- Block external TCP, HTTP, and provider-network attempts.
- Local Potion inference is allowed.
- Reuse an existing compatible task-owned representative publication when
  available.
- If no compatible representative publication exists, record the reason
  before performing at most one representative build.
- Keep source contents, vectors, credentials, and query text out of memory
  evidence.
- Record exact repository, runtime, model, helper, Node, LanceDB, OS, WSL,
  kernel, CPU, and memory identities.
- Keep exploratory observations separate from acceptance samples.
- Do not force percentages to sum to 100%; native and process measurements
  overlap.

The diagnostic harness must be task-owned and non-public. Prefer an existing
script/test boundary and injected factories over production logging. It may
inspect test-visible lifecycle state, but it must not add an MCP tool,
diagnostic environment contract, service, or reusable instrumentation
framework.

## 7. Measurement protocol

### 7.1 Repetition and sampling

For every acceptance scenario:

- start a fresh process and isolated state;
- perform one frozen warmup where the scenario contains a query;
- run three independent repetitions;
- sample before the action, immediately after completion, after 10 seconds
  idle, and after 60 seconds idle;
- retain raw samples from every repetition; and
- report the median paired steady-state delta, not the difference between
  independently selected aggregates or the best run.

Do not run manual garbage collection in acceptance samples.

One separate `--expose-gc` diagnostic may compare pre/post-GC memory only to
distinguish reachable V8 state from allocator/native retention. It is excluded
from acceptance totals and cannot by itself justify a production change.

### 7.2 Per-process metrics

Record for the MCP parent and every child:

- PID, parent PID, role, elapsed time, and thread count;
- RSS and PSS;
- private clean and private dirty memory;
- anonymous memory, anonymous huge pages, and swap;
- `VmSize`, `VmData`, and file-backed RSS;
- file-descriptor count; and
- relevant mapping categories aggregated without source paths.

At the start and end of every repetition also record:

- `/proc/meminfo` `MemAvailable`, `SwapFree`, and `SwapTotal`;
- aggregate PSS for the task-owned parent and children; and
- whether any task-owned process swapped.

Do not treat runs under materially different host-memory or swap pressure as
equivalent acceptance repetitions.

### 7.3 In-process metrics

The diagnostic harness records selected non-sensitive values:

- `process.memoryUsage()` RSS, heap total, heap used, external, and
  `arrayBuffers`;
- V8 heap statistics and heap-space totals;
- active resource counts by non-sensitive resource type;
- local-only, vector-only, and embedding-capable `Context` counts;
- `ToolHandlers`, `SyncManager`, embedding, and LanceDB-adapter counts;
- retained `ProviderRuntime.activeContexts` count;
- persistent and transient LanceDB connection counts;
- open table count at each checkpoint;
- root/watcher/synchronizer counts;
- prepared-read, navigation, result-set, and continuation cache entry and byte
  counts where already available; and
- Potion request/response byte totals for the frozen operation.

The repeated-operation loop must discard each completed protocol response and
parsed payload before starting the next request. Evidence output retains only
scalar durations, byte counts, statuses, and sampled owner metrics; it must not
accumulate response or result objects.

Do not use `process.report` or heap snapshots as a shortcut because they may
capture environment values, paths, source, or query data.

## 8. M0 checkpoint matrix

### M0A — Base process ladder

Use an empty task-owned state root:

```text
A0  Node process imports the MCP entry
A1  MCP initializes and lists tools
A2  snapshot metadata registers one task-owned repository without provider use
A3  remain idle for 60 seconds
```

This separates module load, local-only context, SDK/server, snapshot, and idle
background state.

### M0B — Provider initialization order

Run both orders in fresh processes:

```text
B1  vector-only operation -> embedding search
B2  embedding search -> vector-only operation
```

At every step record:

- provider `Context` count;
- LanceDB-adapter and connection count;
- embedding count;
- Potion worker count; and
- steady-state PSS and anonymous-memory delta.

If B1 retains a second provider context while B2 does not, close or avoid that
context in a diagnostic branch and test whether the memory delta reverses.

### M0C — LanceDB and first-use ladder

Against one compatible task-owned publication:

```text
C0  provider context constructed, connection unopened
C1  LanceDB connection opened
C2  completion/control proof read
C3  navigation manifest read
C4  first dense + lexical search
C5  search response delivered
C6  60-second idle
C7  adapter closed in the diagnostic harness
```

Record table and connection counts. A logical close that leaves high PSS may
show allocator high-water behavior; it does not prove a live Satori reference.

Before requesting a native profiler, repeat the query boundary directly in
fresh adapter-only processes:

```text
connection/count only
dense query
lexical query
logical adapter close
```

The direct process must reuse the same complete publication read-only and omit
MCP, provider, navigation, grouping, and Potion owners.

### M0D — Repeated-search retention

Run one warmup and 20 identical searches against the same frozen generation.
Sample after searches 1, 5, 10, and 20 and after the idle windows.

Extend to 100 searches only if the second half continues adding retained
steady-state memory rather than approaching a plateau. The 100-search
acceptance extension uses three fresh repetitions and samples warm, 10, 20,
40, 60, 80, 100, 10-second idle, and 60-second idle checkpoints. Stop after
that extension.

Run close and GC comparisons separately from the 100-search extension:

```text
fresh process A
    warm search -> 20 searches -> 60-second idle
    -> logical provider/adapter close -> 60-second idle

fresh --expose-gc process B
    warm search -> 20 searches -> 60-second idle
    -> forced GC -> 60-second idle
```

The GC process is diagnostic only. A close result is interpreted together with
owner counts; disappearing owners without a material PSS reduction is
consistent with allocator high-water behavior, not proof of a live leak.

Stable inputs must return the established deterministic result contract.
Memory qualification must not alter ranking or expected output.

### M0E — Repository scaling

In fresh single processes, compare:

```text
zero registered repositories
one registered and searched repository
two registered and searched repositories
```

Record per-root watcher, synchronizer, proof, navigation-cache, and LanceDB
state counts. Do not infer per-repository cost by subtracting unmatched
process histories.

### M0F — One mutation

On the small task-owned fixture:

```text
warm search
one small body edit
incremental synchronization
completed publication proof
search resulting generation
10-second and 60-second idle
```

Record temporary peak separately from retained steady-state memory. Verify the
previous generation remains searchable on an injected failed publication
using existing focused lifecycle proof only if the eventual repair changes
that boundary.

### M0G — Post-index lifecycle comparison

The representative same-process build produced the largest controlled delta,
so compare fresh indexing lifecycles independently:

```text
G1  build representative publication -> 60-second idle
G2  build representative publication -> logical provider/adapter close
    -> 60-second idle
G3  fresh process opens the G1 publication -> one search -> 60-second idle
```

G1 may reuse the existing completed build evidence. G2 requires one additional
representative build because the close must occur in the process that performed
indexing; record that necessity before starting it. G3 reuses the existing
fresh-open evidence.

If G2 removes live owner counts but not PSS, classify the post-index cost as
consistent with native allocator high-water unless another retained native
owner is demonstrated. If G2 materially lowers PSS, name the exact lifecycle
owner before proposing M1. Do not infer that indexing should move to a
disposable process; that is outside the direct-repair contract.

## 9. Localization rules

A memory owner is localized only when:

1. one controlled action or ownership toggle changes memory in the same
   direction in all three repetitions;
2. the corresponding object, context, connection, cache, or mapping count
   changes as predicted;
3. avoidance, close, eviction, or alternate operation order prevents or
   reverses the retained delta where the owner supports that action; and
4. the nearest responsible constructor, retention edge, or native boundary is
   named.

Classify the observed cost as exactly one of:

```text
base_process_cost
per_context_cost
per_repository_cost
per_connection_or_table_cost
bounded_cache_cost
temporary_peak_released
allocator_high_water
monotonic_retention
child_process_cost
unresolved_anonymous_native
```

Do not label allocator high-water memory as a leak without continuing
operation-count growth and a retained resource witness.

If Node/V8 and application counts cannot explain material anonymous memory,
run the LanceDB adapter-isolation and logical-close comparisons before
requesting a native profiler. If the owner remains unresolved, finish M0 with
`single_runtime_memory_owner_unresolved` and state the smallest additional
native diagnostic required. Do not improvise a profiler or dependency in this
program.

## 10. M1 — Evidence-backed direct repair

M1 ended without a production edit. M0 did not identify a safe bounded repair
for the material owner:

- the duplicate provider order costs only 6.81 MiB;
- forced GC does not return the native allocation;
- provider shutdown is already the terminal lifecycle and cannot be inserted
  after publication without new operation, watcher, and reinitialization
  semantics; and
- most post-index high-water remains after provider shutdown.

The following contract is retained for any separately authorized future direct
repair. Such work begins only after a new witness records
`single_runtime_memory_owner_localized`.

Freeze for each repair:

```text
visible retained-memory witness
responsible owner
smallest code path capable of removing the retention
correctness and latency behavior that must remain unchanged
one focused regression test
one repeated memory witness
```

Examples are admissible only when M0 proves them:

- avoid a duplicate vector-only provider context;
- share an already compatible in-process LanceDB adapter;
- release a completed temporary buffer;
- bound a demonstrated unbounded cache;
- close an obsolete connection or context;
- avoid retaining a superseded generation object; or
- lazy-load a large navigation contribution that is not needed by the current
  operation.

These examples are not pre-approved fixes. Do not:

- tune Potion or LanceDB speculatively;
- clear caches globally;
- trade publication correctness for lower PSS;
- weaken proof, freshness, recovery, or receipt behavior;
- add a generic resource manager; or
- combine unrelated owners in one repair.

After each localized repair, rerun only its M0 witness and directly affected
correctness/performance checks. Stop repairing that owner once its witness and
must-preserve checks pass, then continue to M2.

## 11. Completed M2 direct-runtime requalification

Fresh direct runtimes used identical configuration and task-owned state.

### Workload I — Connected but idle

One, two, and four MCP clients were initialized and kept idle for the frozen
60-second window without provider-backed work.

### Workload II — Simultaneously active

One, two, and four MCP clients received the same frozen warm search workload
concurrently against the same complete publication.

Three repetitions were scheduled and completed for every client count. Runs
under materially different WSL memory pressure remain recorded but are
excluded from comparable aggregates. The evidence retains:

- every process and child row;
- aggregate RSS and PSS;
- incremental PSS per additional direct runtime;
- Potion-worker count;
- warm-search p50 and empirical p95;
- deterministic result identities; and
- unchanged publication and mutation behavior.

The child environments used only offline Potion + LanceDB configuration and
removed connected-provider credentials. This memory program did not add a
network tracer; it reuses the installed offline runtime contract rather than
claiming a new packet-level qualification.

## 12. Shared-host reactivation gate

The gate required:

- the majority of remaining active-runtime memory is valid, retained, and not
  removable by a smaller direct fix;
- the remaining material memory is duplicated per direct process;
- the frozen two- and four-client active workload reproduces that
  multiplication;
- a thin session remains plausibly within the preserved 32 MiB incremental-PSS
  gate;
- the root-neutral/root-keyed split does not require a Core redesign;
- projected four-client aggregate PSS falls by at least 40% under one host;
  and
- the projection uses measured owner counts and PSS, not object-size guesses.

The observed existence of several idle client connections is not sufficient.
The decision depends on the simultaneously active workload because idle direct
runtimes are already approximately 71–84 MiB PSS.

The gate passed:

- bounded LanceDB/Arrow and live-provider state explains the majority of the
  remaining active cost;
- exact provider and Potion owner counts multiply per direct process;
- clean one-, two-, and four-client execution reproduces the multiplication;
- the existing Context handled two canonical roots without Core redesign;
- the 32 MiB thin-session ceiling projects a 64.1% four-client reduction; and
- results remained stable across accepted simultaneous searches.

Decision: `shared_runtime_host_recommended`. H0 is reactivated; H1-H4 are not
authorized automatically.

## 13. Verification ownership

M0 is diagnostic and adds no production behavior tests.

M1 adds a test only when:

```text
changed behavior
    a demonstrated owner is no longer duplicated or retained

realistic regression
    the same construction/order/close path could retain it again

missing coverage
    existing lifecycle tests do not observe that ownership edge
```

Use the smallest existing correctness check crossing the repaired boundary:

- ProviderRuntime focused tests for provider/context ownership;
- LanceDB adapter tests for connection/table closure;
- handler cache tests for a cache-bound change;
- affected Core/MCP typecheck and focused lint;
- a publication/restart test only if that authority changed; and
- `git diff --check`.

Do not run release smoke, paid-provider suites, retrieval qualification, or
shared-host lifecycle tests during M0/M1.

## 14. Decisions

### M0 decisions

#### `single_runtime_memory_owner_localized`

The material retained delta has a reproducible action, matching resource
count, responsible owner, and prevention or release witness.

#### `single_runtime_memory_owner_unresolved`

The material delta remains anonymous/native or crosses owners without a
falsifiable retention edge after the bounded matrix. Report the smallest
additional diagnostic needed; do not guess or implement a repair.

#### `single_runtime_memory_cost_explained`

The observed cost is reproducibly explained as valid bounded state or allocator
high-water behavior, and no smaller safe direct repair exists.

### M1 decisions

#### `single_runtime_memory_repair_pass`

The localized retained delta is removed or bounded, directly affected
correctness and latency checks pass, and no unrelated behavior changed.

#### `single_runtime_memory_repair_fail`

The direct repair cannot remove the localized cost without violating
correctness, latency, publication safety, or task scope. Preserve the
localization evidence and revert the unsuccessful repair.

### Final M2 decisions

Choose exactly one:

#### `shared_runtime_host_recommended`

Direct repairs are complete or unavailable, the remaining valid memory is
materially duplicated under the active multi-client workload, and every
Section 12 gate passes.

#### `shared_runtime_host_deferred`

Direct repair makes multiplication insufficient to justify the host, active
multi-client use does not reproduce a material aggregate cost, the projected
saving is below the gate, or the ownership split would require broader Core
redesign.

#### `single_runtime_memory_qualification_incomplete`

Correctness, reproducibility, or owner attribution fails, so neither direct
repair success nor shared-host value can be claimed.

## 15. Evidence record

Task evidence is stored outside the repository and checksum-sealed. The record
contains:

- starting and ending revisions;
- installed/runtime package identities;
- exact commands and environment allowlist;
- task-owned state and publication identities;
- raw checkpoint samples;
- process trees and child counts;
- V8, external, ArrayBuffer, RSS, PSS, anonymous, mapping, thread, and
  descriptor metrics;
- context, handler, adapter, connection, table, root, watcher, synchronizer,
  proof, and cache counts;
- every exploratory versus acceptance distinction;
- direct repairs and focused checks, if authorized;
- one/two/four-client idle and active results;
- shared-host projected saving calculation;
- repository status; and
- one final decision.

Do not commit evidence directories.

## 16. Completed execution boundary

This program executed:

```text
freeze task-owned fixtures and measurement identity
    -> implement the diagnostic-only harness
    -> run M0A-M0G
    -> checksum-seal one M0 decision
    -> record that no localized safe M1 direct repair exists
    -> rerun invalidated M0 witnesses and focused correctness checks
    -> run M2 direct-runtime qualification
    -> checksum-seal one final decision
    -> stop before shared-host implementation
```

This authority includes local Potion inference, task-owned LanceDB indexing,
process inspection, controlled process termination, and disposable
diagnostic state inside the isolated WSL environment. It does not authorize
paid providers, mutation or deletion of active user indexes, new dependencies,
or the deferred shared-host implementation.

The program stopped before shared-host implementation. No native profiler,
dependency, production telemetry, retrieval change, or user-index mutation was
introduced.
