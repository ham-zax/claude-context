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

---

# Findings from the 2026-08-08 external solo-Satori investigation

Issues 11–18 originate from an independent opencode solo-Satori simulation
report (2026-08-08) against `~/repo/tradingview_ratio` on published 6.8.1 and
6.8.2 (`e43ff3f`). Each was investigated against master `786dbe3` on
2026-08-08 from source; claims marked "needs live repro" were not reproduced
against the live index. Entry 18 (F-4) was investigated after entries 11–17
were written and is appended at the end.

## 11. `must:` recall is rank-limited by design and the semantics are undocumented (F-1)

- **Symptom (reported)**: `must:tzinfo must:replace` found the gate test and
  helpers but only one of the known violators; `cache_repo.py` never appeared
  on either version; 6.8.1 surfaced zero violators.
- **Investigation verdict (master)**: two of the report's three hypotheses are
  disproved, one mechanism confirmed. `must:` is NOT tokenized AND: the
  post-retrieval filter is a case-sensitive raw-substring `includes()` over
  `[symbolLabel, relativePath, content]`
  (`packages/mcp/src/core/search-execution.ts:1295-1303` +
  `search-query-support.ts:1257-1264`), and the lexical index stores raw chunk
  content verbatim (`packages/core/src/core/search-projections.ts:61,81`), so
  punctuation/`None` literals survive. The real recall bound: the conjunctive
  BM25 must-lane (`search-execution.ts:1348-1408`, present in 6.8.2, absent in
  6.8.1 — which explains the zero-violator 6.8.1 result) is skipped entirely
  once the primary pass already fills the requested limit, is capped at top-80
  BM25 with no repository substring scan, and is then subject to rerank-pool
  and top-N truncation. When the limit fills, no incompleteness signal is
  published, so a limit-8 response silently mixes violators with legitimate
  `replace(tzinfo=...)` patterns.
- **Impact**: `must:` looks exhaustive but is a rank-limited subset; audit
  workflows ("find every violation") get a hypothesis space, not a list, and
  nothing tells the caller so.
- **Suggested master fix**: publish a must-recall honesty signal whenever
  `must:` is present — including a `skipped_results_satisfied` status when the
  lane did not run because the result limit was already filled — and document
  the case-sensitive exact-substring candidate-filter semantics in the
  `search_codebase` tool description. A true exhaustive mode would need a
  bounded repository scan and is a separate decision.
- **Needs live repro**: whether `cache_repo.py` was indexed at all and at
  which stage it was lost (one `debugMode=full` query with candidateSurvival
  settles it).

## 12. `path` argument is authorization-only — subdirectory scope is silently dropped (F-2)

- **Symptom (reported)**: searches scoped to two different subdirectories
  returned essentially the same global pool, including files outside both
  scopes.
- **Investigation verdict (master)**: root cause confirmed, and the behavior
  is exactly what the source prescribes. The `path` argument is used only for
  workspace authorization and to resolve to the longest containing indexed
  root (`tracked-root-readiness.ts:207-213`); the subdirectory's only effect
  is a log line (`handlers.ts:4450-4452`, "Auto-resolved subdirectory … to
  indexed root"). Retrieval receives `effectiveRoot` and query-text operators
  only (`handlers.ts:4962-4973`); the sole hard path filters are `path:` /
  `-path:` parsed from the query string (`search-execution.ts:1282-1293`).
  The tool description ("an indexed codebase or subdirectory") implies
  narrowing that does not exist.
- **Impact**: callers cannot restrict retrieval to a directory; context is
  inflated and "search only in X" workflows are impossible without query-text
  `path:` patterns.
- **Suggested master fix**: make the requested subdirectory a hard scope —
  derive `path.relative(effectiveRoot, absolutePath)` when
  `searchableRoot.path !== absolutePath` and apply it in candidate evaluation,
  the tracked-lexical scan, and the exact-registry arm, counting removals in
  the filter summary — or stop accepting subdirectories and say so in the tool
  description. Do not inject it into the reranker query.

## 13. `continue_search` handle semantics misread by callers — "complete" vs caller-limit omissions (F-3)

- **Symptom (reported)**: no continuation handle on 6.8.1; on 6.8.2
  `continuation: "complete"` while `omittedGroupCount: 19` of 27.
- **Investigation verdict (master)**: documented limitation, not a defect. The
  continuation contract (identical between `e43ff3f` and master; commits
  `cf8d378`/`db34f89`/`b8f44ca`/`6dc4142`/`f354c0f` are all ancestors of the
  tested 6.8.2) emits `continuation.handle` only when the initial page could
  not disclose the entire caller-bounded frozen set
  (`min(limit, available, SEARCH_MAX_FROZEN_RESULTS)`;
  `search-disclosure.ts:32-45`, `search-result-finalization.ts:727-747`,
  handle materialization `handlers.ts:4602-4652`). "complete" means the
  caller-bounded frozen set was fully disclosed; `omittedGroupCount` also
  counts groups beyond the caller's own `limit`, disclosed with reason
  `caller_limit` (`search-disclosure.ts:83,123-125`) and intentionally outside
  the continuable set. The reported runs used `limit` <= returned count, so
  no handle was ever expected.
- **Impact**: discoverability gap — callers reading `omittedGroupCount` next
  to `continuation: "complete"` reasonably conclude a bug; groups beyond the
  limit require a re-search with a larger `limit`.
- **Suggested master fix**: none for behavior. Optional clarity: when
  "complete" coexists with `availableGroupCount > effectiveFrozenTotal`,
  surface the beyond-limit omission at the pagination level (e.g.
  `omittedBeyondLimitGroupCount` or `disclosure.reasons: ["caller_limit"]` in
  the pagination annotation) and add one tool-description clause explaining
  that "complete" refers to the caller-bounded frozen set.

## 14. Rerank degradation concentrates on `must:`-heavy queries via unprojectable live-disk candidates (F-5)

- **Symptom (reported)**: 5/7 degraded-ranking queries were `must:`-heavy;
  non-`must:` queries ranked cleanly on both versions.
- **Investigation verdict (master)**: root cause confirmed as a mechanism.
  `must:` forces every surviving candidate to literally contain all must
  tokens and the must-lane adds lexical hits for exactly those tokens,
  concentrating the pool on a few files. Live-disk lexical candidates
  (`dirty_overlay` and tracked-lexical live scan,
  `search-query-support.ts:511-521,706+`) carry no owner binding and fail
  publication-bound projection with `owner_not_found`
  (`search-rerank-projection.ts:74-83`); indexed candidates on files modified
  after the proven generation fail `source_hash_mismatch`
  (`search-rerank-projection.ts:106-111`). Master's rollout (Tasks 6–7)
  already replaced the all-or-nothing `RERANKER_FAILED` of issue #10 with
  bounded partial degradation: typed skip-and-count, `RERANKER_INPUT_DEGRADED`
  with >=2 survivors, `RERANKER_SKIPPED_INPUT` (never `RERANKER_FAILED`) below
  that, failed candidates keeping their retrieval slot. Residual gap: the
  computed projection summary (`failureCounts`/`firstFailure`) stays
  in-process — it is not published in `hints.debugSearch.rerank`, survival
  removals carry only the generic `reranker_document_projection_failed`, and
  the two new warning codes render through the generic caution fallback.
- **Impact**: ranking degrades exactly when users ask for precision;
  attributing the typed reason for a specific run still needs
  `debugMode=full` internals.
- **Suggested master fix**: diagnostics-only — (1) publish
  `execution.rerankerProjection` in the rerank hint shape
  (`search-types.ts:594-638`, emitted from `buildRankingDebug` in
  `search-result-finalization.ts:361-398`); (2) give
  `RERANKER_INPUT_DEGRADED` / `RERANKER_SKIPPED_INPUT` dedicated entries in
  `buildSearchWarningDetail` naming the typed failure counts.
- **Needs live repro**: which typed reason fired on the reported tradingview
  runs. Overlaps issue #10 (same projection path; #10's all-or-nothing
  behavior is fixed by this rollout).

## 15. Post-100% reindex finalization still blocks searches — now with bounded retry (F-6)

- **Symptom (reported)**: on 6.8.1, after `progressPct: 100.0` /
  `phase: writing`, searches returned `not_ready` for ~30–60s until the
  completion marker; one bounce carried `progressPct: null`.
- **Investigation verdict (master)**: the blocking window is retained
  fail-closed by design — the tracked-root row stays `indexing` through
  writing→proving→publishing and flips only inside
  `persistBackgroundPhase("completed", setCodebaseIndexed)`
  (`manage-indexing-handlers.ts:1651,1705,1778-1781,1888-1891`), and the
  readiness gate resolves searchable roots only from
  `["indexed","sync_completed"]`. The sync-join path from Task 4 (`45e75dd`)
  is explicitly sync-only (`search-frontdoor.ts:286-300`,
  `handlers.ts:2446-2450`), so reindex finalization returns `not_ready` with
  `retryAfterMs: 2000` and `indexingOperation {action:"reindex", phase,
  generation}` — asserted by `search-frontdoor.test.ts:378-435` without
  waiting. Overlaps issue #5 (same gate, different trigger).
- **Impact**: automation polling `progressPct=100` still meets a blocked
  window on master, but the response is now actionable and bounded instead of
  opaque; wall duration of the window on master needs a live reindex to
  measure.
- **Suggested master fix**: none for the blocking (fail-closed until the
  completion marker is the documented read contract). Two optional
  refinements: align the freshness `skipped_indexing` path, which returns the
  bare `not_ready` payload without `retryAfterMs`/`indexingOperation`
  (`tool-response-builders.ts:346-353`), with the front-door branch; and
  document the writing→proving→publishing window in the `manage_index` status
  contract.

## 16. `sidecar.builtAt` semantics correct on master; reported staleness needs live attribution (F-7)

- **Symptom (reported)**: after a full reindex (gen 4185, Aug 7–8),
  `call_graph` still reported `sidecar.builtAt: 2026-08-04T23:20:47.090Z`.
- **Investigation verdict (master)**: all three report questions answered
  from source. Sidecars ARE regenerated per index generation: every completed
  full index and navigation-affecting sync delta stages and publishes a new
  sealed generation (`manage-indexing-handlers.ts:1778-1805`; a new sealed
  generation is mandatory for `completed`). `builtAt` is the symbol-registry
  manifest stamp of the serving navigation generation
  (`relationship-backed-call-graph.ts:653-657`,
  `packages/core/src/symbols/sidecar.ts:1060-1069`), freshly stamped at the
  only two stamp sites (`packages/core/src/core/context.ts:7134,7223`); no
  path carries a previous generation's stamp forward. Freshness is
  content-hash-chained (file hashes → shard hashes → generation seal →
  pointer verification, `sidecar.ts:1082-1095,1464-1471,2044-2078`), so a
  reused generation implies a byte-identical source snapshot. The serving
  path is identical between `e43ff3f` and master.
- **Impact**: the reported staleness cannot come from a completed full reindex
  on the same server/state root per master code — the prime suspects are a
  stale generation binding/receipt or the parallel 6.8.1 server/state root
  answering the query.
- **Suggested master fix**: diagnosability only — publish the serving
  navigation `generationId` (and seal hash) alongside `builtAt` so
  cross-generation attribution is falsifiable from the response. Live
  attribution recipe: compare response `builtAt` with the reindexed state
  root's `current.json` generation and that generation's
  `relationships/manifest.json` `builtAt` on disk.

## 17. `read_file` exact-symbol validation reveals errors one round trip at a time (F-8)

- **Symptom (reported)**: mixing `symbolId` + `symbolLabel` and omitting
  `mode` produced two sequential validation errors instead of one complete
  message.
- **Investigation verdict (master)**: confirmed. The `mode` requirement is
  gated on a successful exact-symbol parse
  (`packages/mcp/src/tools/read_file.ts:74-80`), so a symbol-shape violation
  withholds the `mode` issue until the next attempt. Shape rules
  (contractVersion literal 2, exactly-one-of `symbolId`/`symbolLabel`,
  exactly-one-of `context`/`continuation`) live in
  `exactSymbolOpenRequestSchema`
  (`symbol-context-public-contract.ts:93-114`). An omitted `contractVersion`
  additionally collapses to an unactionable `open_symbol: Invalid input`
  because `formatZodError` (`tools/types.ts:61-68`) does not flatten union
  sub-issues. Neither file was touched by the 15cb77f..HEAD rollout.
- **Impact**: extra round trips for exact-symbol reads; the exactly-one-of
  rule is absent from both the `open_symbol` field description and the tool
  description.
- **Suggested master fix**: emit the `mode` issue whenever `open_symbol`
  carries exact-symbol markers (`contractVersion`/`symbolId`/`symbolLabel`
  keys) instead of gating on the inner schema's success, so shape and mode
  violations surface in one `formatZodError` response; keep direct-span reads
  exempt. Optionally flatten union sub-issues in `formatZodError` and state
  the full required set in the field description.

## 18. Cross-module constructor callers: extraction fixed on master, but stale sidecars are never invalidated (F-4)

- **Symptom (reported)**: `call_graph(TradingEntryVetoes, direction=callers)`
  returned 0 edges with `CALL_GRAPH_INBOUND_COVERAGE_PARTIAL` and
  `inboundCoverageEvidence {reason: no_relationships_extracted,
  constructorResolutionApplicable: true}` on both 6.8.1 and 6.8.2, even though
  the class is instantiated at `src/python/core/trading_core.py:294` via a
  cross-module import.
- **Investigation verdict (master)**: the extraction gap was real and is FIXED
  on master (and was already in 6.8.2) by `c1c5636` "fix(python): resolve
  cross-module constructor callers" (2026-08-05): import-binding-aware
  constructor resolution in `packages/core/src/relationships/builder.ts`
  (import branch :551-580, fail-closed without an exact import binding
  :603-605, `direct_binding` authority via `resolution.ts:50-57`, low
  confidence promoted to medium only for proof-backed records in
  `packages/core/src/navigation/query.ts:558-596`). Builder and handler tests
  using the same `TradingEntryVetoes` shape prove master emits and traverses
  the edge (`builder.test.ts:1139-1161`,
  `handlers.call_graph.test.ts:2966-3067`). The ground-truth corpus matches
  the supported shape (runtime import at `trading_core.py:78`, instantiation
  in `TradingCore.__init__`, unique module suffix — no resolution collision).
- **The residual defect (provenance)**: `c1c5636` did NOT bump
  `RELATIONSHIP_BUILDER_VERSION` (`packages/core/src/language-analysis/versions.ts:8`
  still `relationship-v9+python-constructor-receivers+python-native-resolution-v1`,
  introduced 2026-07-24 by `ce576c7`). Compatibility gates key off that string
  (`packages/core/src/core/context.ts:1831-1839`), so a relationship sidecar
  built in the 2026-07-24→08-05 window is judged fully compatible forever and
  never rebuilt — the version string advertises constructor support that the
  persisted records lack. This explains the zero-edge observation on BOTH
  published versions: the index under test carried a pre-fix sidecar that no
  sync or compatibility check would replace. (`constructorResolutionApplicable`
  only records that the resolution path exists for the symbol —
  `relationship-backed-call-graph.ts:590-595` — never that it succeeded.)
- **Impact**: any index whose sidecar predates 2026-08-05 silently keeps the
  old extraction semantics under an identical version string; coverage
  assertions fail with misleading "no relationships extracted" evidence.
- **Suggested master fix**: bump `RELATIONSHIP_BUILDER_VERSION` (e.g.
  `relationship-v10+python-cross-module-constructors`) so window-period
  sidecars become incompatible and are rebuilt; adopt the rule that any
  semantic change to relationship emission bumps the version string. For
  evaluations: force `manage_index reindex` (not sync) before call-graph
  coverage assertions.
- **Needs live repro**: a fresh full reindex of tradingview_ratio on master,
  then `call_graph(TradingEntryVetoes, direction=callers, depth=1)` should
  return the `TradingCore.__init__` edge (kind call, confidence 0.65, no
  coverage-partial warning). The same stale-sidecar hypothesis also connects
  to issue #16's `builtAt` staleness observation.
