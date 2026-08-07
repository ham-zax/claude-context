# Issues Found During TradingView A/B Execution (candidates for master fixes)

Found on 2026-08-07 while driving published `@zokizuan/satori-mcp@6.8.1` and local
master (6.8.2, `e43ff3f`) over raw MCP stdio against
`~/repo/tradingview_ratio` with isolated `SATORI_STATE_ROOT`s.
All observations below were reproduced with production JS builds, not tsx.

## 1. Published npm tarball ships the pinned Potion helper without the exec bit

- **Status (2026-08-07 master rollout)**: fixed — the owner execute bit is restored only after exact checksum verification of the pinned helper, and the packed direct-install release smoke asserts the closure. Exec-bit regression is covered by core tests and release smoke.

- **Symptom**: every `manage_index`/`search_codebase` call on a plain
  `npm install @zokizuan/satori-mcp@6.8.1` fails with
  `Pinned Potion helper is not executable.` The server keeps running and
  status polls silently report nothing useful, so it looks like a hang.
- **Evidence**:
  - `tar -tvzf satori-mcp-6.8.1.tgz` (fetched from registry.npmjs.org):
    `-rw-r--r-- package/assets/potion/linux-x64/satori-potion`.
  - `npm pack` of current master (`packages/mcp`):
    `-rwxr-xr-x package/assets/potion/linux-x64/satori-potion`.
  - The managed installer copy at
    `~/.satori/mcp-runtime/@zokizuan-satori-mcp@6.8.1/.../satori-potion` is
    `-rwxr--r--` — the managed installer compensates (chmod-equivalent), which
    is why production npx users never see this.
- **Root cause hypothesis**: the 6.8.1 publish pipeline normalized file modes
  before upload; master's local `npm pack` retains modes, so either the
  pipeline was fixed or the divergence happens between pack and publish.
- **Suggested master fix**: add a publish/pack gate test that extracts the
  tarball and asserts the executable bit on `assets/potion/*/satori-potion`
  (and any other pinned native helper), failing the release otherwise. Also
  consider a startup fallback that returns a precise, actionable error naming
  the exact path and the missing mode (the current message already does this
  well — the gap is only that nothing prevents shipping the broken tarball).

## 2. Runtime-owner registry is global, not state-root scoped

- **Status (2026-08-07 master rollout)**: fixed — the registry is now scoped to the backend authority root: LanceDB state roots get `<stateRoot>/runtime-owner`, Milvus endpoints get an endpoint-hash directory under `~/.satori/runtime-owner/milvus/`, and the conflict message prints both the registry and lock paths.

- **Symptom**: `manage_index create/reindex/sync/clear` fail closed with
  `runtime_owner_conflict` even when every runtime uses a fully isolated
  `SATORI_STATE_ROOT`, because the owner registry lives at
  `$HOME/.satori/runtime/owners.json` regardless of state root.
- **Evidence**: `new RuntimeOwnerRegistry({...})` at
  `packages/mcp/src/server/shared-runtime.ts:205` passes no `stateDir`, so
  `defaultRuntimeStateDir()` (`~/.satori/runtime`) is always used
  (`packages/mcp/src/core/runtime-owner.ts`). The identity hash includes
  `lanceDbPath`, so two isolated experiments with different vector paths
  conflict even though they cannot touch each other's data.
- **Impact**: legitimate multi-config setups (CI matrices, A/B experiments,
  per-project state roots) block each other's index mutations; the only
  workarounds are sequential single-identity operation or overriding `HOME`.
  Searches are unaffected (not gated).
- **Suggested master fix**: scope the owner registry under the resolved state
  root (e.g. `<SATORI_STATE_ROOT>/runtime/owners.json`) when
  `SATORI_STATE_ROOT` is explicitly set, and/or document an explicit
  registry-location env var. If the global scope is intentional (fleet-wide
  single-writer guarantee), that rationale should be stated in the conflict
  message, which currently implies the conflict is about the same index.
- **Secondary finding**: a crashed/lingering `node --test` process registered
  as an owner blocks unrelated mutations until prune/stale logic sees it dead;
  `process.kill(pid, 0)` liveness plus `/proc` inspection handled this
  correctly once the process actually exited, so no defect there — but the
  message telling operators to `kill <pids>` is the only recovery path and
  deserves to mention test-process leftovers explicitly.

## 3. Reranker input projection diverges between 6.8.1 and 6.8.2

- **Status (2026-08-07 master rollout)**: superseded by exact per-document observability — full-debug candidate survival now records per-document UTF-8 bytes and SHA-256 for every reranker input, so projection drift is provable per document and root cause is no longer inferred from aggregate bytes.

- **Symptom**: for the identical query, index corpus, and 32 selected
  candidates, telemetry shows different reranker input sizes:
  6.8.1 `reranker_input_bytes=48114` vs master `reranker_input_bytes=36383`.
- **Evidence**: `[TELEMETRY]` lines from both builds on query q01; 6.8.1
  replays also carry per-candidate `rerankDocumentUtf8Bytes` in
  `candidateSurvival` while master does not expose that field at the same
  location.
- **Impact**: an old-vs-new ranking comparison is not purely
  "ranking-application policy" — the reranker saw different documents. This
  is expected fallout of the projection-contract rollout (now frozen by the
  `search-rerank-projection` contract tests), but it should be called out in
  any A/B interpretation.
- **Suggested master fix**: none for behavior; suggest keeping
  `rerankDocumentUtf8Bytes` (or an equivalent per-candidate byte count)
  visible in `candidateSurvival` replay so future drift is observable without
  diffing telemetry totals.

## 5. First search after server boot races the startup sync (`not_ready: indexing`)

- **Status (2026-08-07 master rollout)**: fixed with bounded retry semantics — a cold-start search joins one transient same-root sync (bounded by `retryAfterMs`) and succeeds when it completes; non-joinable operations return `not_ready` with `retryAfterMs=2000` and the active `indexingOperation`.

- **Symptom**: a freshly spawned server against an already-completed index
  returns `{"status":"not_ready","reason":"indexing"}` for the first
  `search_codebase` call when the workspace has dirty files. In this run
  18/88 one-shot invocations hit it across both versions.
- **Evidence**: TradingView repo had 3 dirty files (staged additions +
  modified `opencode.jsonc`). Each boot starts a sync for them; the first
  search arrives before it finishes. The identical call succeeds seconds
  later (`status: ok`, `freshnessDecision.mode: synced`).
- **Impact**: one-shot CLI-style usage (spawn, search, exit) is unreliable on
  dirty workspaces; the failure is silent unless callers inspect `status`.
- **Suggested master fix**: for a cold start against an existing index,
  either await the initial sync before answering searches (it is bounded by
  the dirty-file count), or make the `not_ready` response carry an
  `expectedReadyMs`/retry-after hint so drivers can wait deterministically.

## 6. LateOn execution timeout is reproducible under CPU contention (both versions)

- **Status (2026-08-07 master rollout)**: observability fixed; adaptive timeout explicitly rejected — terminal rerank executions now report qualified deadline diagnostics (attempts, retries, timeouts, effective deadline, observed wall, deadline lateness) alongside the frozen retrieval order. Deadlines remain fixed by plan; a contention-adaptive timeout was explicitly not adopted.

- **Symptom**: query q14 failed LateOn with `lateon_execution_timeout` on
  both 6.8.1 and master (reproduced twice), falling back to
  `retrieval_order` with a truthful `RERANKER_FAILED` warning.
- **Evidence**: both sides report `applied=false,
  operationalReason=lateon_execution_timeout, latency≈27s` for q14 while the
  other 3 servers ran concurrently; the same query's rerank path succeeded
  when the machine was idle in smoke tests.
- **Impact**: under parallel MCP servers (multi-window IDE usage), LateOn's
  timeout can fire from CPU starvation rather than model pathology. The
  fallback behavior itself worked exactly as contracted (retrieval order
  published, warning emitted).
- **Suggested master fix**: consider a contention-aware timeout (scale with
  candidate count / observed CPU pressure) or surface the timeout budget in
  the warning so operators can distinguish load starvation from model hangs.

## 7. Minor: `manage_index status detail=full` humanText empty on 6.8.1 during active indexing

- **Symptom**: while an index operation was active on 6.8.1, each status poll
  returned no human-readable progress text (empty `humanText`), making it hard
  to distinguish "indexing in progress" from "stuck" without inspecting disk.
  Master prints `[BACKGROUND-INDEX] Progress: ...` lines and richer status.
- **Suggested master fix**: none (already improved in master); noted for the
  record since it cost debugging time during this experiment.

## 8. No per-document rerank-input observability anywhere in master diagnostics

- **Status (2026-08-07 master rollout)**: fixed — under `debugMode=full`, the `reranker_input` candidate-survival stage records per-document UTF-8 bytes, SHA-256, factual candidate role, and projection identities (never source text), and projection failures appear as typed removals.

- **Symptom**: while building the controlled same-input native-vs-legacy
  evaluation (2026-08-07), the exact documents handed to LateOn could not be
  read from any diagnostic surface: `hints.debugSearch.rerank` carries only
  aggregates (`candidatesIn`, `candidatesReranked`, `inputBytes`,
  `byteBudgetOmittedCandidates`), and `candidateSurvival`
  `reranker_input`/`reranker_output` stages carry identities only
  (`candidateId`, `ownerId`, span, `rank`), capped at 160 entries/stage.
  `rerankDocumentUtf8Bytes` was deleted entirely by commit `373fcdd`
  ("refactor(search): retire legacy ranking contract fields").
- **Evidence**: `buildSearchDiagnosticsRerank` shape at
  `packages/mcp/src/core/search-types.ts:580-619`; stage occurrence shape at
  `packages/mcp/src/core/search-candidate-survival.ts:70-96`; the only exact
  capture point is the `host.reranker.rerank` call site
  (`packages/mcp/src/core/search-execution.ts:549`) or
  `LateOnReranker.prototype.rerank`
  (`packages/mcp/src/server/lateon-reranker.ts:338`).
- **Impact**: any third-party evaluation, debugging, or regression forensics
  that needs the exact reranker input (e.g. replaying a validated LateOn
  response against an alternative ordering policy) must patch the reranker
  in-process; there is no supported read path. 6.8.1 was closer (per-candidate
  byte counts in replay), but neither version exposed document text.
- **Suggested master fix**: extend #3's suggestion — behind `debugMode=full`,
  optionally emit per-document UTF-8 byte counts and a content hash (not
  necessarily full text) in the `reranker_input` stage, so frozen-state
  capture and drift forensics work without monkey-patching. A content hash
  would also make projection-contract drift provable across versions.

## 9. Reranker input carries no factual candidate role or query-intent signal (controlled same-input evidence)

- **Status (2026-08-07 master rollout)**: fixed by projection v3 context — the rerank query now carries the exact question once plus a deterministic answer focus, and projection-v3 documents carry a factual `candidate_role`; the provider order remains final and no score multipliers or global test/docs penalties were added.

- **Symptom**: on implementation-seeking conceptual queries, native
  (reranker-order-authoritative) output can lead with test results ahead of
  the production implementation they verify. Found during the controlled
  same-input eval (batch 1, 2026-08-07) where both policies consume the
  identical LateOn response.
- **Evidence**:
  - Query "how does Shariah compliance checking block trades" (c07): native
    top-5 = test, test, test, implementation, integration; the
    `halal_firewall.py → validate_order` mechanism landed at ranks 4-5.
    Blinded judges split 2-1; human adjudication preferred the legacy order
    (implementation-first), noting neither matched the ideal.
  - Query "how does regime filtering gate entry decisions" (c03): native
    buried `_check_regime_filter` (gates.py) at rank 3 behind two test-file
    results; blinded judges 3-0 for the implementation-first order.
  - Counterexample "how are trading entries validated and vetoed before
    submission" (c01): a JIT-veto integration test was the clearest evidence
    and its surfacing won 3-0 for native — artifact usefulness is
    query-dependent, so no global artifact-type multiplier is the fix.
- **Impact**: the reranker cannot distinguish test/implementation/docs
  candidates or know what kind of answer the query wants, so ordering
  mistakes concentrate on implementation-seeking queries. This is a
  reranker-input evidence gap, not a ranking-application bug; the native
  order-publication mechanism itself worked as contracted.
- **Suggested master fix** (direction only, no change made in this eval):
  supply the reranker with factual evidence — per-candidate role labels
  (test / implementation / documentation, derivable deterministically from
  path classification already present in `search-query-support`) and a small
  deterministic query-intent category (test-seeking / documentation-seeking
  / implementation-seeking / neutral, from explicit cues only) in the rerank
  document projection and query text. Let the reranker decide how those
  facts affect relevance; do not encode them as score multipliers.

## 10. Rerank dies all-or-nothing at `document_projection` for some queries; LateOn never called

- **Status (2026-08-07 master rollout)**: fixed by typed/partial projection — projections return typed failure reasons per candidate; unprojectable candidates are omitted individually (`RERANKER_INPUT_DEGRADED`), zero projectable documents skip the provider without `RERANKER_FAILED` (`RERANKER_SKIPPED_INPUT`), and failure counts/first failure are published in the rerank projection summary.

- **Symptom**: on master (6.8.2, this tree), some queries on a warm,
  fully-synced index fail reranking with `failurePhase: "document_projection"`,
  `attempted: false`, `inputBytes: 0`, a `RERANKER_FAILED` warning, and a
  silent fallback to `retrieval_order` — the reranker is never invoked.
  Deterministically query-dependent: on the same state root, query i05
  ("shadow execution ledger for paper trades") fails every run while i02
  ("Engle-Granger cointegration test with half-life estimation") passes,
  back-to-back. Found in the controlled eval reserve batch (4 of 20
  queries: i05, i08, c04, c08; none of batch 1's rerank-path queries).
- **Evidence**:
  - `[TELEMETRY]` for failing queries: `reranker_attempted: false,
    reranker_used: false`, real-query latency ~230ms (no rerank); rerank
    hint carries `failurePhase: "document_projection"` and
    `orderAuthority: "retrieval_order"`.
  - Prototype-level capture patch on `LateOnReranker.prototype.rerank`
    recorded zero calls for the failing queries (LateOn truly never ran).
  - Offline replay of every V2 strict check over all 54 `mcp_filtered`
    candidates of i05 against the live registry: 0 failures (owners
    resolve, file hashes match disk, candidate spans inside owner spans).
    So the failure is upstream of per-candidate projection — consistent
    with the handler-level guard in `handlers.ts`
    (`!generationReceipt || navigationStatus !== "valid"`) or the
    registry-manifest load/hash comparison inside `buildRerankDocument`
    returning `undefined` for every document, which `search-execution.ts`
    converts into an all-or-nothing `reranker_document_projection_failed`
    (one undefined document aborts the whole rerank, lines ~488-502).
  - Readiness debug for failing and passing queries is indistinguishable:
    `proofMode: "warm"`, `checkpointStatus: "valid"`, identical
    freshness (`skipped_source_unchanged`). Nothing in the response tells
    the caller why projection failed.
  - Adding a 20s post-ready delay before the search did NOT change the
    outcome (i05 still fails), so it is not a simple timing window at
    the harness's ready gate.
- **Impact**: (1) rerank availability is query-dependent and invisible —
  the only signal is the generic `RERANKER_FAILED` warning, which implies
  a provider problem rather than a local projection/guard failure;
  (2) any evaluation or A/B that assumes the reranker ran for
  rerank-eligible queries silently includes retrieval-order-only results;
  (3) one unprojectable candidate (or one guard mismatch) poisons the
  entire rerank instead of degrading per-candidate.
- **Suggested master fix**:
  - Make the failure diagnosable: publish the projection-failure reason
    (guard state, registry-load status, first failing candidate identity)
    in `hints.debugSearch.rerank` under `debugMode=full`, and distinguish
    local projection failure from provider failure in the warning code.
  - Degrade per-candidate: skip unprojectable candidates (and count them)
    instead of aborting the whole rerank when at least some documents
    project.
  - Root-cause why `navigationStatus`/registry availability is
    query-dependent on an identical warm state (not yet identified;
    recorded here so the hunt continues from the evidence above).

## Driver-level caveats (not Satori defects, recorded for reproducibility)

- One-shot stdio drivers must write large JSON results with synchronous
  writes (`fs.writeSync`) before exiting; async `process.stdout.write` +
  immediate `process.exit` truncates payloads larger than the pipe buffer.
- MCP server workspace roots default to the server process cwd; the smallest
  common contract across 6.8.1 and master is spawning the server with
  `cwd = target repo` (`SATORI_SESSION_ROOTS_JSON` does not exist in 6.8.1).
