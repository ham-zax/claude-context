# Satori Single-Runtime Memory-Owner Qualification Plan

**Status:** M0 is in progress in isolated task-owned WSL state. One secondary
`per_context_cost` is localized, but the material representative-runtime
anonymous-memory owner is not yet localized. No production repair is justified
by the current evidence. Shared-host implementation remains deferred.

**Repository truth:** `c9ece273fb18300cd19d80c2175eb7321955ebaf`

**Runtime under investigation:** MCP `6.2.0`, Core `3.1.0`, managed offline
Potion + LanceDB on Linux x64 / WSL.

## 1. Decision

Defer
`docs/plans/SATORI_SHARED_OFFLINE_RUNTIME_HOST_PLAN.md`.

Before adding a persistent host, private socket, startup lock, or multi-session
lifecycle, determine why one initialized MCP runtime retains far more memory
than an idle runtime and the Potion worker.

Use this sequence:

```text
M0  localize the single-runtime memory owner
    -> M1 apply only evidence-backed direct repairs
    -> M2 remeasure one/two/four direct runtimes
    -> decide whether shared-host complexity is still justified
```

The shared-host plan remains the preserved conditional design. It is not the
default next implementation.

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

### 3.3 In-progress M0 findings — 2026-07-23

The task-owned evidence root is:

```text
/home/hamza/repo/satori-single-runtime-memory-evidence/20260723-c9ece27
```

The diagnostic harness runs the built MCP `6.2.0` server in-process with its
normal MCP framing, offline Potion worker, and LanceDB adapter. It records
process and owner counts without storing source, query, vector, or credential
contents. Every measured runtime uses an isolated `HOME`,
`SATORI_STATE_ROOT`, and `LANCEDB_PATH`.

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

The vector-first order was higher in all three repetitions. Its median retained
delta was 6,974 KiB (6.81 MiB), and the matching count changed from one to two
provider `Context` and LanceDB-adapter owners.

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

These are not yet classified as leaks or assigned to a production owner.

#### Repeated representative search

Three fresh processes each ran one warmup and 20 identical searches against the
same frozen generation:

| Repetition | Warm-search PSS | Search 10 PSS | Search 20 PSS | 60-second idle PSS |
|---|---:|---:|---:|---:|
| 1 | 353,721 KiB | 394,817 KiB | 414,137 KiB | 413,947 KiB |
| 2 | 354,049 KiB | 399,593 KiB | 410,429 KiB | 410,311 KiB |
| 3 | 352,469 KiB | 391,109 KiB | 410,489 KiB | 410,355 KiB |

The median warm-to-idle retained delta is 56,634 KiB (55.31 MiB). Growth
continued from search 10 to search 20 in all three repetitions. At the same
time, V8 heap and Node external bytes did not grow in the same direction, the
provider-context count remained one, and the result-set/continuation cache
remained empty.

This satisfies the plan's condition for one bounded 100-search extension. It
does not yet identify whether the owner is a LanceDB/Arrow native allocation,
native allocator high-water behavior, or a live native retention edge.

#### Long-lived exploratory process

The previously observed managed process later changed from approximately
1.95 GiB resident PSS to:

```text
PSS:       683,697 KiB
Anonymous: 675,048 KiB
Swap:    1,280,416 KiB
```

Its resident reduction came with approximately 1.22 GiB of swap, so it is not
evidence that the original anonymous allocation was released. Because its
workload history remains unknown, this remains exploratory corroboration only.

#### Current M0 decision

```text
secondary owner: per_context_cost localized at 6.81 MiB
material owner: unresolved anonymous/native retention
production changes: none
next falsifying experiment:
    100-search bounded extension
    -> logical provider/adapter close
    -> one diagnostic forced-GC comparison
stopping condition:
    classify the retained delta as live native retention, allocator high-water,
    or unresolved native memory before considering M1
```

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
- report the median steady-state delta, not the best run.

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

### M0D — Repeated-search retention

Run one warmup and 20 identical searches against the same frozen generation.
Sample after searches 1, 5, 10, and 20 and after the idle windows.

Extend once to 100 searches only if the second half continues adding retained
steady-state memory rather than approaching a plateau. Stop after that
extension.

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

M1 begins only after M0 records `single_runtime_memory_owner_localized`. The
current program authorization permits the smallest direct production repair
whose owner and witness satisfy Section 9; it does not authorize adjacent
memory cleanup.

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

## 11. M2 — Direct-runtime requalification

After all authorized M1 repairs, run fresh direct runtimes with identical
configuration and task-owned state:

### Workload I — Connected but idle

Start one, two, and four MCP clients, initialize them, and keep them idle for
the frozen 60-second window without provider-backed work.

### Workload II — Simultaneously active

Start one, two, and four MCP clients. Give each the same frozen warm search
workload concurrently against the same complete publication.

For both workloads:

- run three repetitions;
- retain every process and child row;
- report aggregate RSS and PSS;
- report incremental PSS per additional direct runtime;
- report Potion-worker count;
- report warm-search p50 and empirical p95;
- verify deterministic result equality;
- verify zero external network attempts; and
- keep publication and mutation behavior unchanged.

## 12. Shared-host reactivation gate

Reactivate
`docs/plans/SATORI_SHARED_OFFLINE_RUNTIME_HOST_PLAN.md`
only when all of these are established after direct repair:

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

If the gate passes, record `shared_runtime_host_recommended` and reactivate H0
only. It does not authorize H1-H4 automatically.

If the gate does not pass, record `shared_runtime_host_deferred` and retain the
host plan as a frozen design.

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

Store task evidence outside the repository and checksum-seal the completed
decision. Record:

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

## 16. Execution authority and boundary

The current instruction authorizes:

```text
freeze task-owned fixtures and measurement identity
    -> implement the diagnostic-only harness
    -> run M0A-M0F
    -> checksum-seal one M0 decision
    -> apply only localized M1 direct repairs
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

If M0 records `single_runtime_memory_owner_unresolved` and the smallest next
step requires a new native profiler or dependency, stop with
`single_runtime_memory_qualification_incomplete` rather than installing it
implicitly.
