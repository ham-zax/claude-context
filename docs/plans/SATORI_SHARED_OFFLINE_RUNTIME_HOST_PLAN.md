# Satori Shared Offline Runtime Host Plan

**Status:** proposed and deferred pending the single-runtime memory-owner
qualification in
`docs/plans/SATORI_SINGLE_RUNTIME_MEMORY_OWNER_QUALIFICATION_PLAN.md`.
H0-H4 are inactive. Reactivate this plan only if that prerequisite records
`shared_runtime_host_recommended`. This document does not authorize
implementation by itself.

**Repository truth:** `c9ece273fb18300cd19d80c2175eb7321955ebaf`

The diagnostic evidence, host/session ownership model, socket-security
contract, offline-only sharing gate, and publication/upgrade constraints below
remain preserved. Deferral does not reject the architecture; it prevents the
architecture from masking an unexplained single-process memory owner.

## 1. Decision

For the managed offline Potion + LanceDB runtime, replace one expensive Satori
runtime per stdio connection with:

```text
Codex / Claude Code / OpenCode / subagent
                    |
             stdio launcher
                    |
        private Unix-domain socket
                    |
       one shared Satori runtime host
         |        |          |
    MCP session  MCP session  MCP session
         \        |          /
          one provider/runtime authority
          one LanceDB context and cache
          one Potion worker
          one root-keyed repository-state authority
          one watcher coordinator
```

Every client still receives an independent MCP session. JSON-RPC request IDs,
initialization state, disconnect handling, and continuation ownership are not
mixed between clients.

The runtime host shares only expensive internal authorities. It is not a raw
multi-client proxy into one MCP protocol stream.

## 2. Observable outcome

When multiple harnesses or subagents use the same exact managed offline
runtime:

- they use one Satori runtime host;
- they use one persistent Potion worker;
- they share one LanceDB/provider context and its bounded caches;
- repository-specific synchronization, watcher, snapshot, proof, and mutation
  state remains keyed by canonical root;
- each retains an independent MCP session;
- compatible searches may run concurrently;
- repository mutations remain fenced and serialized;
- one client disconnect cannot close another client's session or continuation;
- a host failure cannot partially publish an index generation; and
- connected, Ollama, incompatible, or differently configured runtimes are not
  silently combined.

The purpose is to remove multiplicative runtime memory. It is not an
authorization to redesign retrieval, ranking, publication, or Potion.

## 3. Demonstrated baseline

On 2026-07-23, the live WSL environment had five managed Satori stdio
connections. Each connection had:

- one managed launcher process; and
- one MCP runtime process.

Only one connection had initialized provider-backed search, so only that
runtime had a Potion worker.

Linux proportional-set-size readings from `/proc/<pid>/smaps_rollup` were:

| State | Observed proportional memory |
|---|---:|
| One idle launcher + MCP runtime | 76.8–84.3 MiB |
| Active launcher + MCP runtime + Potion worker | approximately 849.0 MiB |
| Potion worker alone | approximately 106.6 MiB |
| Five observed Satori connections together | approximately 1.15 GiB |

The active MCP runtime itself accounted for approximately 732.5 MiB. Therefore
sharing only the 106.6 MiB Potion worker would not solve the demonstrated
problem. The provider/Lance/runtime authority must also be shared.

These live readings are diagnostic, not release benchmarks. They establish the
owner and the multiplicative failure mode. Qualification must use a
task-owned repository and a frozen workload.

The diagnostic used `ps` to identify managed launcher, MCP runtime, and Potion
worker descendants, then read `Rss` and `Pss` from each live process's
`/proc/<pid>/smaps_rollup`. Qualification must retain the raw per-process rows
instead of only the aggregate.

Relevant current authorities:

- the managed launcher starts one child MCP runtime per stdio connection;
- `ProviderRuntime` single-flights and reuses one embedding-capable context
  only within one process;
- `PotionEmbedding` starts and reuses one native worker only within one
  process;
- `RuntimeOwnerRegistry` identifies live runtime configurations;
- `MutationLeaseCoordinator` fences repository mutations; and
- publication receipts and generation leases already protect old-or-new
  searchable state.

## 4. Expansion permit

```text
authorized outcome
    prevent compatible offline subagents from multiplying expensive Satori
    provider/runtime memory

evidence
    five stdio connections created five launcher/runtime pairs; one active
    pair consumed approximately 849 MiB proportional memory; existing reuse
    stops at the process boundary

required additional owners
    managed launcher lifecycle and MCP server/session lifecycle

stopping condition
    one exact offline runtime identity produces one host, one Potion worker,
    independent MCP sessions, preserved publication safety, and bounded
    per-session memory
```

This permit does not authorize a general daemon framework, remote service,
public transport option, or connected-provider credential sharing.

## 5. Scope

### Included

- managed Linux x64 / WSL offline Potion + LanceDB installations;
- a private machine-local Unix-domain socket;
- one host per exact shared-runtime identity;
- thin stdio-to-socket launchers for existing MCP clients;
- independent MCP sessions inside the shared host;
- reuse of existing provider, proof, publication, runtime-owner, and mutation
  authorities;
- bounded idle shutdown and stale-host recovery;
- install, upgrade, uninstall, runtime-retention, doctor, and postflight
  changes mechanically required by the new lifecycle; and
- focused correctness, concurrency, restart, memory, and latency proof.

### Excluded

- connected Voyage, OpenAI, Gemini, Milvus, or Zilliz sharing;
- Ollama sharing;
- TCP, HTTP, SSE, or remote MCP hosting;
- native Windows or macOS support;
- changing Potion inference or model identity;
- changing LanceDB publication semantics;
- ranking, reranking, LateOn, NextPLAID, or retrieval qualification;
- changing MCP tools or their public schemas;
- a general service manager or plugin framework;
- automatic killing of old or incompatible runtimes; and
- optimizing the absolute memory of one active host unless the shared-host
  qualification relocalizes a concrete leak.

Connected providers remain per-connection because the existing runtime
identity intentionally excludes secret credentials. Reusing the first
client's API key or token for another client would be incorrect. Ollama already
owns its model in a separate daemon and has no demonstrated equivalent need in
this task.

## 6. Identity and isolation

### 6.1 Shared-runtime identity

The host identity must compose, not replace, the existing
`RuntimeOwnerIdentity`.

It contains:

- current MCP package version;
- current runtime-owner identity hash;
- execution and network profile;
- embedding provider, model, inference digest, and dimension;
- vector provider and canonical LanceDB path;
- publication schema and source-projection identities;
- watcher enablement and debounce policy;
- any other effective option that changes shared host behavior; and
- a shared-host protocol version.

It contains no credential value, source path, query, source content, or vector.

One lightweight pure identity owner must derive this identity from the
effective launch-time configuration for both launcher attachment and host
startup. The generated launcher must not independently reimplement
`RuntimeOwnerIdentity` normalization, and it must not load the expensive MCP
server merely to discover the socket. The host recomputes and verifies the
identity before accepting a session.

The durable host metadata uses the full identity hash under `~/.satori`, but
the Unix socket uses a short fixed-length digest because Linux socket paths
have a small platform limit:

```text
metadata: ~/.satori/runtime-host/<shared-runtime-hash>/host.json
socket:   $XDG_RUNTIME_DIR/satori/<short-hash>.sock
```

When `XDG_RUNTIME_DIR` is unavailable or cannot be proven user-owned, use a
user-specific directory below `os.tmpdir()` only after creating it as mode
`0700` and rejecting symlinks or a different owner. The socket is mode `0600`.
The resolved path must fit the platform limit before host startup. Lifecycle
metadata and socket access are user-only.

The startup winner records its selected socket path in `host.json`. Later
launchers for the same full identity use that recorded path after validating
the metadata and live host, even when their `XDG_RUNTIME_DIR` differs.

`host.json` is lifecycle evidence, not live attachment authority. Two unequal
full identities never attach to the same host. A short-digest collision, stale
metadata, incompatible protocol, or unrelated same-user listener fails closed
through the live handshake in Section 8.2.

### 6.2 Initial sharing gate

The launcher uses the shared host only when all of these are true:

```text
SATORI_RUNTIME_PROFILE=offline
EMBEDDING_PROVIDER=Potion
VECTOR_STORE_PROVIDER=LanceDB
platform=linux
architecture=x64
```

Every other configuration preserves the current direct stdio child process.

Excluded configurations use the existing direct stdio lifecycle. An eligible
shared configuration does not fall back to a second full runtime after attach
or host-start failure. It fails with actionable lifecycle diagnostics so
concurrent launchers cannot recreate per-connection runtimes.

## 7. Ownership split

The host uses a root-neutral process with root-keyed repository state. Canonical
repository identity is deliberately absent from the shared-host identity
because one MCP session may operate on more than one repository and the
repository is not known when the launcher initially connects.

This is not one repository context masquerading as a global singleton. H0 must
inventory every mutable field in `ContextMcpServer`, `ProviderRuntime`,
`Context`, `SyncManager`, `SnapshotManager`, watcher ownership,
`CallGraphSidecarManager`, generation-proof coordination, and
`MutationLeaseCoordinator`, and classify it as:

```text
host-global
root-keyed
session-local
operation-local
```

No mutable repository-specific state may remain in a host-global singleton.
The existing root-keyed maps and durable authorities must be reused; this does
not authorize a parallel repository registry.

At the recorded repository revision, `Context` already holds most mutable
policy, synchronizer, proof, retention, and read-gate state in root- or
collection-keyed maps; `SyncManager` holds root-keyed sync, watcher, debounce,
and freshness maps; `SnapshotManager` holds per-codebase entries; and
`MutationLeaseCoordinator` fences canonical roots independently. This evidence
supports the root-neutral model but does not replace H0's field-by-field audit
of remaining singular caches and lifecycle state.

### 7.1 Host-global state

Exactly one runtime host owns:

- normalized configuration and shared-runtime identity;
- `RuntimeOwnerRegistry` registration;
- provider bootstrap and `ProviderRuntime`;
- one embedding-capable `Context`;
- one LanceDB vector backend;
- one `PotionEmbedding` worker;
- one provider `SyncManager` acting as a root-keyed coordinator;
- one watcher coordinator;
- startup recovery coordination; and
- the lifecycle lock, listener, metadata, and host diagnostics.

Startup recovery runs once per host, before the host reports ready. It does not
run once per attached client.

### 7.2 Root-keyed state

Existing authorities remain keyed by canonical repository root:

- snapshot and indexed-codebase entries;
- synchronization flights, freshness observations, and policy state;
- at most one watcher and debounce lifecycle per active canonical root;
- mutation leases and mutation generations;
- navigation, call-graph, checkpoint, and completion authorities;
- generation proofs, publication read gates, and retention queues; and
- active read/publication generation leases.

One host may therefore serve root A and root B without sharing either root's
mutable repository state. Cross-root operations may share the provider,
embedding worker, and LanceDB process-level authority only.

### 7.3 Session-owned state

Every accepted socket owns:

- one MCP SDK `Server`;
- one transport and initialization lifecycle;
- request/response identifiers;
- one session/tool-handler facade over host services;
- one bounded continuation coordinator shared only by handler instances
  belonging to that session;
- one continuation owner identity;
- session-local cancellation and disconnect state; and
- no provider, vector database, model worker, watcher, or runtime-owner
  registration.

No continuation registry, token namespace, or lookup map is shared across
sessions. Disconnect releases only that session's continuations and
operation-owned leases at their safe boundaries. The shared provider remains
available to other sessions.

### 7.4 Operation-owned state

Every accepted request owns its response delivery, cancellation observation,
active-operation count, and any read-generation lease. Mutation requests also
retain the existing root mutation/publication authority until they reach a
complete commit or rollback boundary.

### 7.5 Required internal split

The current `ContextMcpServer` and `ProviderRuntime` combine host and session
state. Split only the ownership required above:

```text
SharedRuntimeHost
    expensive provider and vector state
    root-keyed publication, watcher, proof, and recovery coordination

McpSession
    one Server + transport + per-session tool/continuation ownership
```

Do not introduce a generic dependency-injection container, transport plugin
system, or service registry.

## 8. Launcher and host lifecycle

### 8.1 Connect or start

For an eligible offline runtime, the managed launcher:

1. derives the exact shared-runtime identity;
2. resolves valid durable metadata and its recorded private socket;
3. attempts to connect and complete the live attach handshake;
4. if absent or provably stale, acquires the lifecycle startup lock;
5. rechecks metadata, socket, process identity, and live handshake after
   acquiring the lock;
6. starts the installed MCP package in internal host mode when still absent;
7. waits for the bounded live attach handshake;
8. releases the startup lock; and
9. pipes client stdin/stdout to that accepted MCP session.

Concurrent launchers either start the host or join it. They must not start one
host each after the same initial connection failure.

The launcher continues forwarding termination and EOF for its own session. It
does not terminate the host while another session is attached.

### 8.2 Live attach handshake

Before MCP framing begins, the launcher and live host exchange one bounded
private handshake:

```text
launcher -> host
    shared-host protocol version
    full shared-runtime identity hash
    installed runtime identity
    launcher nonce

host -> launcher
    accepted or rejected
    shared-host protocol version
    full shared-runtime identity hash
    installed runtime root and MCP identity
    host PID
    Linux boot ID and process start time
    echoed launcher nonce
```

Only an accepted handshake authorizes MCP traffic. The host rejects a full
identity, protocol, or installed-runtime mismatch; malformed or oversized
handshakes; and MCP bytes sent before attachment completes. `host.json` alone
never authorizes a listener.

### 8.3 Metadata, lifecycle lock, and stale recovery

Each durable host directory contains:

```text
host.json
startup.lock
```

The socket remains in the short runtime path selected by Section 6.1.

`host.json` is atomically written and contains:

- format version;
- host PID;
- Linux boot ID and `/proc/<pid>/stat` process start time;
- MCP version;
- shared-runtime identity hash;
- installed runtime root;
- host ownership token;
- socket path;
- socket identity required for owned cleanup; and
- ready timestamp.

H0 must select the smallest lifecycle lock available without adding an
unapproved dependency. It must either be automatically released on process
death or carry a complete stale-owner contract containing PID, boot ID,
process start time, and a unique ownership token.

A launcher may remove stale socket, lock, or metadata only while holding the
lifecycle authority and only after proving that the recorded process is dead,
belongs to a different boot, or has a different process-start identity. PID
existence alone is insufficient because of PID reuse.

An alive but unready matching host is waited on for a bounded interval, then
reported as an error. A launcher never kills it automatically.

### 8.4 Detached host process

The host is not a child lifecycle extension of the first launcher:

- host stdin is not the launching client's stdin;
- host stdout is never inherited as MCP protocol output;
- host stderr does not remain attached to a client pipe;
- EOF, signal, or exit of the first launcher does not terminate the host;
- signalling a thin launcher closes only that launcher's session;
- readiness is established by the private handshake, not stdout text; and
- H0 identifies a bounded existing local diagnostic sink, or explicitly uses
  discarded stdout/stderr plus lifecycle health metadata without adding a
  logging framework.

The launcher waits only until the detached host accepts the live handshake,
then releases its child-process ownership.

### 8.5 Idle shutdown

The host maintains active-session and active-operation counts.

When both reach zero, it starts one internal 60-second idle grace period. A new
connection accepted before listener closure cancels the timer. At expiry it:

1. acquires the same lifecycle authority used for startup;
2. marks the listener as closing and rechecks active sessions and operations;
3. stops root watchers/background synchronization;
4. closes the listener, LanceDB, and Potion worker;
5. unregisters the runtime owner;
6. removes the socket only if its recorded identity still belongs to this
   host;
7. removes `host.json` only if PID, boot ID, process start time, full runtime
   identity, ownership token, and socket identity still match this host;
8. releases the lifecycle authority; and
9. exits.

It must not exit while a request, mutation lease, publication proof, read
generation lease, or candidate activation remains active.

A launcher arriving after shutdown commits waits or retries through the same
startup protocol. An exiting host may never remove replacement-host state by
path name alone.

The 60-second grace is an internal constant, not new public configuration.

## 9. Request, mutation, and continuation behavior

- Node's event loop may accept requests from several sessions.
- The Potion worker remains one bounded queue.
- Search operations retain the exact receipt/generation selected for that
  operation.
- Mutation operations continue through the existing per-root lease.
- A second mutation does not bypass, replace, or broaden the existing
  `indexing`/lease response.
- Same-identity runtime clients no longer appear as separate runtime owners.
- Different identities remain separate runtime owners and preserve the
  existing conflict gate.
- Continuation handles remain bound to their originating tool-handler owner.
- Disconnecting one session invalidates only its handles.
- A handle is never accepted by a different session because coordinators are
  not shared across sessions.

No freshness, receipt, retention, or publication rule is weakened to enable
sharing.

### 9.1 Shared initialization

Provider bootstrap and other host-global single-flight work are not canceled
by one session disconnect or cancellation. The disconnected session stops
awaiting or delivering the result; remaining waiters continue to use the same
flight.

### 9.2 Reads

Session cancellation stops response delivery and releases that session's
read-generation lease at the existing safe boundary. It does not invalidate
another session's read, shared proof, or provider cache. H0 must freeze whether
an underlying read can be interrupted safely or must finish without delivery.

### 9.3 Mutations

A disconnected or canceled mutation keeps its root mutation and publication
authority until the existing operation reaches a complete activation,
rollback, or recovery-owned boundary. Session loss never releases a mutation
lease prematurely and never terminates the host.

### 9.4 Transport and per-session bounds

H0 must freeze:

- maximum pre-handshake bytes;
- maximum JSON-RPC frame bytes;
- maximum accepted concurrent or pending requests per session, or concrete
  proof that the selected transport already provides bounded backpressure;
- continuation count and result-set bounds; and
- disconnect cleanup for buffered input, pending responses, cancellations,
  continuations, and read leases.

Use existing SDK or repository limits when they are sufficient. Do not invent
a general quota system.

## 10. Failure, restart, and upgrade

### Host failure

- Existing active publications remain searchable after restart.
- In-flight MCP calls fail with a closed transport; they are not replayed.
- The next launcher proves the old host dead and starts a replacement.
- Existing startup recovery handles an interrupted mutation.

### Client failure

- The socket closes and only that session is released.
- Other sessions, provider state, and active generations remain usable.
- Shared initialization continues for remaining waiters.
- Reads and mutations follow the operation-ownership boundaries in Section 9.

### Upgrade

- Candidate preflight always uses an isolated direct process. It must not
  attach to an already-running host and accidentally validate the old runtime.
- The stable launcher is switched only after the existing candidate checks
  pass.
- Existing sessions may finish on the old host.
- New sessions use the new launcher and new shared-runtime identity.
- Existing runtime-owner conflict rules block incompatible mutations while old
  and new hosts overlap.
- Reads continue against complete generations.
- The upgrader does not delete a runtime directory referenced by a live host.

The host design does not broaden the current CLI/runtime two-phase transaction.

### Uninstall and runtime retention

- Uninstall removes only the selected managed client configuration and does
  not kill a host with active sessions or operations.
- A host with no remaining sessions exits through the normal idle lifecycle.
- Runtime cleanup never deletes an installed runtime root referenced by a live
  host's validated metadata and process identity.
- A stale runtime root becomes removable only after the lifecycle authority
  proves that no live host owns it.

H3 must identify the existing CLI runtime-retention owner and change only the
checks invalidated by this host lifecycle.

## 11. Implementation batches

### H0 — Freeze host/session and memory contracts

- Add a task-owned fixture and deterministic 1/2/4-client workload.
- Inventory every mutable runtime field and freeze its host-global, root-keyed,
  session-local, or operation-local owner.
- Freeze the root-neutral host and root-keyed repository-state model.
- Freeze the one authoritative shared-runtime identity derivation.
- Freeze the live attach handshake and its input bounds.
- Freeze the lifecycle lock, boot/process identity, stale-owner, and owned
  cleanup contracts.
- Freeze host detachment and diagnostics.
- Freeze cancellation ownership and transport/session resource bounds.
- Freeze the exact qualification environment, workload, repetitions, sampling,
  aggregation, and one/four-client latency statistics.
- Freeze current direct-mode behavior.
- Prove the SDK transport can run two independent `Server` sessions over two
  in-process duplex streams while sharing one host facade.

Exit: `shared_runtime_contract_pass`,
`shared_runtime_contract_blocked`, or `memory_owner_relocalized`.

### H1 — Separate host and MCP session in one process

- Extract `SharedRuntimeHost` from `ContextMcpServer`.
- Construct independent `McpSession` instances over the same host.
- Keep ordinary direct stdio startup working through one host plus one session.
- Prove independent initialization, request IDs, disconnect, errors, and
  continuation ownership.
- Prove one provider context and one Potion worker under concurrent sessions.
- Prove two canonical roots remain isolated behind the shared provider.
- Prove one session cannot cancel shared initialization required by another.

Exit: `shared_runtime_session_pass` or `shared_runtime_protocol_fail`.

### H2 — Add the private host socket and thin launcher

- Add internal host mode to the MCP package.
- Add the live handshake, lifecycle lock, metadata, stale recovery, detached
  process contract, resource bounds, and serialized idle shutdown.
- Update only the managed offline Potion launcher path.
- Preserve direct mode for all excluded configurations.
- Fail closed rather than starting a direct runtime when an eligible shared
  configuration cannot attach or start.
- Prove simultaneous launcher startup creates exactly one host.

Exit: `shared_runtime_transport_pass`,
`shared_runtime_protocol_fail`, or `shared_runtime_transport_blocked`.

### H3 — Preserve lifecycle and upgrade safety

- Run startup recovery once per host.
- Prove mutation serialization across sessions.
- Prove failed publication preserves the prior searchable generation.
- Prove daemon crash/restart and stale socket recovery.
- Prove candidate preflight cannot attach to the active host.
- Prove old/new runtime overlap preserves current conflict behavior.
- Prove uninstall and runtime cleanup retain roots owned by a live host.
- Update doctor/postflight only where the new lifecycle invalidates their
  existing checks.

Exit: `shared_runtime_lifecycle_pass` or
`shared_runtime_lifecycle_blocked`.

### H4 — Memory and latency qualification

- Run the frozen 1/2/4-client workload.
- Run three repetitions after the frozen warmup.
- Record raw PID, role, RSS, and PSS rows during the frozen steady-state
  sampling window, plus process counts, worker counts, search latency, and
  mutation outcomes.
- Report median aggregate PSS across repetitions and warm-search p95
  separately for one and four active clients.
- Update directly affected public documentation.

Exit: one final decision from Section 14.

## 12. Focused verification

Use task-owned runtime state. Do not clear or rebuild a user's index.

Required focused proofs:

- two MCP sessions may use the same host concurrently;
- two repositories may use the same host without sharing mutable root state;
- request IDs and responses never cross sessions;
- one session disconnect does not affect another;
- continuations cannot cross sessions;
- a disconnected session cannot cancel shared provider bootstrap needed by
  another session;
- a disconnected mutation retains authority through commit or rollback;
- simultaneous cold launch creates one host;
- a starter that dies cannot permanently retain startup authority;
- two launchers racing after stale discovery create one replacement host;
- a stale socket with a dead PID is recovered;
- a reused PID, different boot ID, or different process-start identity is not
  trusted;
- an alive unready host is not deleted;
- short-hash collision, stale metadata, protocol mismatch, or exact identity
  mismatch never attaches;
- no MCP bytes reach a session before handshake acceptance;
- different launcher runtime directories reuse the valid socket recorded in
  host metadata;
- launcher A may start the host and disconnect while launcher B remains
  functional;
- a connection arriving during cancellable idle shutdown keeps the host alive;
- an old host cannot remove replacement-host socket or metadata;
- stale cleanup is serialized with replacement-host creation;
- one runtime owner, provider context, watcher coordinator, LanceDB context,
  and Potion worker exist for matching clients, with at most one watcher per
  active canonical root;
- oversized handshake and JSON-RPC frames fail without unbounded buffering;
- per-session pending requests remain within the frozen bound;
- one repository mutation runs at a time;
- failed and interrupted mutations retain the previous publication;
- restart recovery remains correct;
- direct connected/Ollama mode remains unchanged;
- eligible host failure does not silently start a direct runtime;
- upgrade preflight executes the candidate itself;
- uninstall does not kill or delete a runtime owned by active sessions;
- JSON-RPC stdout remains protocol-only; and
- zero external TCP, HTTP, or provider-network attempts remain true for
  Potion. The private Unix-domain socket is the only newly authorized
  transport.

Run affected Core/MCP/CLI tests, typecheck, focused lint, build, package smoke,
and `git diff --check` only after their boundaries are changed.

## 13. Qualification gates

### 13.1 Frozen measurement protocol

H0 records before implementation:

- repository revision and task-owned fixture revision;
- machine, WSL, kernel, CPU, and memory configuration;
- MCP/Core/CLI, Potion model/helper, Node, and LanceDB identities;
- exact index generation and source observation;
- runtime environment and watcher settings;
- exact query and mutation workload;
- warmup and measured request counts;
- concurrency schedule for one, two, and four clients;
- steady-state sample timing, including its relation to initialization and
  garbage collection;
- raw PID, role, RSS, and PSS rows;
- three independent repetition records;
- median aggregate-PSS calculation across repetitions; and
- empirical latency-p95 calculation for one and four active clients.

Exploratory readings remain separate from acceptance evidence. A single noisy
`/proc` sample cannot decide the product result.

### 13.2 Gates

Correctness:

- exactly one host and one Potion worker for one shared identity;
- repository-specific mutable state remains canonical-root keyed;
- independent MCP session semantics;
- old-or-new publication behavior preserved;
- mutation and runtime-owner gates preserved;
- crash, restart, upgrade, and stale-host behavior pass;
- no credential or incompatible-config sharing; and
- no public MCP schema change.

Memory:

- four simultaneously active clients use no more than `1.25x` the PSS of one
  active client under the same frozen workload;
- each additional connected session adds at most 32 MiB PSS after the host is
  warm;
- no additional Potion worker or provider/Lance context appears; and
- one-host PSS does not exceed the direct one-client baseline by more than 10%.

Performance:

- warm search p95 remains at most 500 ms for one active client;
- warm search p95 remains at most 500 ms for four concurrently active clients,
  reported separately;
- candidate publication gates are unchanged; and
- host connection overhead does not force reindexing or embedding.

If one shared host still has unacceptable absolute memory after multiplicative
duplication is removed, stop and identify its measured owner. Do not turn this
program into a general memory optimization task.

## 14. Decisions

Batch decisions:

- `shared_runtime_contract_pass`: H0 freezes a representable host/session,
  identity, lifecycle, and measurement contract.
- `shared_runtime_contract_blocked`: H0 proves that the required host-global,
  root-keyed, session-local, or operation-local ownership split cannot be
  represented without an out-of-scope architecture or dependency.
- `shared_runtime_session_pass`: H1 proves independent MCP sessions over one
  in-process shared host without changing direct stdio behavior.
- `shared_runtime_transport_pass`: H2 proves one private host under concurrent
  cold launcher startup, live attachment, detachment, resource bounds, and
  fail-closed eligible routing.
- `shared_runtime_transport_blocked`: H2 proves safe private attachment cannot
  be implemented without expanding into a general daemon, service manager, or
  unapproved dependency.
- `shared_runtime_lifecycle_pass`: H3 proves mutation, publication, restart,
  stale-host, preflight, upgrade, uninstall, and runtime-retention behavior.

`shared_runtime_protocol_fail`, `shared_runtime_lifecycle_blocked`, and
`memory_owner_relocalized` may also terminate the owning batch as defined
below.

These are implementation checkpoints, not the final product decision.

The program ends with exactly one applicable final decision. A protocol,
lifecycle, contract, or relocalization failure may stop its owning batch.
After H0-H3 pass, H4 chooses `shared_runtime_pass`,
`shared_runtime_correct_but_memory_fail`, or
`shared_runtime_correct_but_latency_fail`.

### `shared_runtime_pass`

All correctness gates pass, matching clients share one host/worker, and memory
and latency gates pass.

### `shared_runtime_correct_but_memory_fail`

Correctness passes and duplicate processes/workers are removed, but one or more
memory gates fail. Report the remaining measured owner.

### `shared_runtime_correct_but_latency_fail`

Correctness and memory gates pass, but one- or four-client warm-search p95
exceeds 500 ms. Report the remaining measured owner without weakening the
target.

### `shared_runtime_protocol_fail`

Session isolation, continuation ownership, transport framing, disconnect, or
restart correctness cannot be proven.

### `shared_runtime_lifecycle_blocked`

The existing launcher, upgrade, recovery, mutation, or publication authority
cannot safely host the bounded lifecycle without a broader architecture change.
Report the exact owner and minimum required change.

### `memory_owner_relocalized`

The demonstrated material memory cost is not caused by per-connection runtime
duplication after controlled measurement. Report the actual owner and do not
implement the host.

## 15. Expected implementation owners

Likely causal owners:

- `packages/mcp/src/server/start-server.ts`
- `packages/mcp/src/server/provider-runtime.ts`
- one small pure shared-runtime identity owner used by launcher and host
- a small MCP-owned runtime-host/session module
- a small MCP/CLI-owned lifecycle transport boundary
- `packages/cli/src/managed-launcher-script.mjs`
- the focused launcher/install/upgrade/uninstall/doctor/postflight tests
  invalidated by the lifecycle
- directly affected README/feature documentation

Do not change Core embedding, vector publication, ranking, or MCP tool schemas
unless a focused failing proof demonstrates that an existing owner cannot
express the frozen contract.

## 16. Final report

Report:

- starting and ending revisions;
- direct and shared process trees;
- runtime, launcher, Potion-worker, watcher, and Lance context counts;
- one/four-client RSS and PSS;
- incremental PSS per client;
- warm search p95;
- session-isolation results;
- mutation/publication safety;
- crash, restart, stale-host, and upgrade behavior;
- connected/Ollama fallback behavior;
- tests and builds run;
- commits;
- repository status; and
- one final decision.
