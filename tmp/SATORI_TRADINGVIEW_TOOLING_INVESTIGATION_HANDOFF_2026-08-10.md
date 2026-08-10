# Issues Found During TradingView A/B Execution (candidates for master fixes)

> **Temporary handoff (2026-08-10):** this file was moved to `tmp/` for the
> next coding session. It is an investigation ledger, not release, runtime,
> strategy, or governance authority. Issues 21–24 now have implemented,
> package-verified fixes in the 2026-08-10 local commit series.
> Earlier entries retain their historical status and must not be reopened
> without a fresh reproduction.

Found on 2026-08-07 while driving published `@zokizuan/satori-mcp@6.8.1` and local
master (6.8.2, `e43ff3f`) over raw MCP stdio against
`~/repo/tradingview_ratio` with isolated `SATORI_STATE_ROOT`s.
All observations below were reproduced with production JS builds, not tsx.

## Context-v4 Rollout Status (corrected 2026-08-09)

Entries 11–18 remain closed by their cited implementation tasks. The earlier
2026-08-08 receipt overstated mapped contract suites as the original live acceptance
gate and is superseded. A production-JS sweep against a clean detached
`tradingview_ratio` worktree passed F-1 through F-8; the raw selected MCP responses,
implementation identity, and exact requests are recorded in
`docs/evidence/search-contracts-focus-v4-production-20260808/artifacts/live-f-gate-20260809.json`
and the corrected receipt beside it. Acceptance mapping remains F-1 → Task 6,
F-2 → Task 5, F-3 → Task 8, F-4 → Task 1, F-5 → Task 7, F-6 → Task 8,
F-7 → Task 9, F-8 → Task 10.

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
- **Status (corrected 2026-08-09 context-v4)**: fixed — Task 6, hardened by `6f8ff21`. `must:` now always publishes `exhaustive: false`, case-sensitive raw-substring semantics, bounded lane state, and `moreMayExist`; `lane_completed_within_backend_results` replaces the prior overclaim. The original live query passed with `lane_skipped_primary_limit_filled` and the incomplete-results warning. No exhaustive scan was added (explicit non-goal).

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
- **Status (corrected 2026-08-09 context-v4)**: fixed — Task 5, hardened by `6f8ff21`. The requested subdirectory is a hard candidate scope before reranker admission across every retrieval arm and the exact fast path; out-of-root requested paths and absolute candidate paths fail closed. The live sibling-core/support probe returned disjoint, wholly in-scope pools.

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
- **Status (corrected 2026-08-09 context-v4)**: fixed — Task 8 (`68a259b`). Grouped envelopes publish `omittedBeyondLimitGroupCount` (available − caller-bounded frozen set) whenever positive, and `continuation: "complete"` means only caller-bounded completion. The live `trading` limit-one probe returned available=30, frozen=1, omitted-beyond-limit=29, and `continuation: "complete"`.

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
- **Status (corrected 2026-08-09 context-v4)**: fixed — Task 7 (`66cb96b`). Typed local projection degradation (`hints.debugSearch.rerankerProjection` with `skippedCandidates`, `failureCounts`, `firstFailure`) is published in full debug and dedicated warnings distinguish it from provider failure. The live F-5 evidence reports three `source_unavailable` projection skips, `RERANKER_INPUT_DEGRADED`, applied LateOn ordering, and no `RERANKER_FAILED`.

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
- **Status (corrected 2026-08-09 context-v4)**: fixed — Task 8 (`68a259b`). Every `not_ready` reason="indexing" path carries `retryAfterMs: 2000` plus `indexingOperation {action,phase,generation}` when known. The live fresh reindex returned that envelope at progress 100 before terminal publication.

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
- **Status (corrected 2026-08-09 context-v4)**: fixed — Task 9, corrected by `3615d54`. Ok call-graph traversals publish `navigationAuthority {generationId, navigationSealSha256, relationshipManifestSha256, relationshipBuiltAt, publicationCompletedAt}`. The live fresh-generation response retained both distinct timestamps and the serving seal/manifest identities.

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
- **Status (corrected 2026-08-09 context-v4)**: fixed — Task 10 (`121a4f5`/`d95d3a7`). `open_symbol` is validated as one unit: missing version, conflicting identities, missing operation, missing `mode`, and inner shape violations appear in one response at stable field paths. The live invalid vector returned all four applicable diagnostics together.

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
- **Status (corrected 2026-08-09 context-v4)**: fixed — Task 1 (`3a26a11`). `RELATIONSHIP_BUILDER_VERSION` is `relationship-v10+python-cross-module-constructors+python-native-resolution-v1`; stale pre-fix sidecars require reindex. A fresh live full reindex returned the `trading_core.py` `__init__` call edge to `TradingEntryVetoes` at lines 296–302.

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

## 19. Implementation-focus retrieval can miss the implementation owner at reranker admission

- **Status (corrected and fixed 2026-08-09):** fixed by capability-owned admission. The earlier pre-Core-loss diagnosis came from a diagnostic-mode perturbation recorded in issue #20. On the corrected product path, both implementation owners survive retrieval and deterministic filtering but were outside the legacy 12-document admission prefix.
- **Corrected live boundary:** for `how does entry veto validation work` with `scope=runtime`, `limit=2`, query-v2, and document-v4, the two `trading_entry_vetoes.py` chunks were dense ranks 23/28, Core ranks 22/27, and `mcp_filtered` family ranks 17/22 in a 26-family pool. The legacy result-limit heuristic admitted only 12 documents, so LateOn could not evaluate either owner.
- **Capacity evidence:** the active LateOn profile advertises `candidateDepth: 32`. Its frozen D32 qualification exercised exactly 32 documents on all 34 neural-eligible tasks. A bounded current context-v4 check also completed a 32/32 permutation in 1,458 ms under the 2,500 ms stage bound, with approximately 499 MB peak and 419 MB cooldown RSS under the frozen process bounds.
- **Fix:** `selectRerankCandidates()` is now the single count-admission owner. A valid advertised provider maximum admits the existing family-pool byte order up to `min(global maximum, provider maximum, pool size)`, independently of visible result limit. Missing or invalid capability preserves the legacy adaptive fallback. Diagnostics truthfully distinguish `complete_family_pool`, `provider_limit`, `global_limit`, and legacy `family_ambiguity`. UTF-8 input bytes remain a later ordered-prefix bound.
- **Closure evidence:** the production-JS live rerun admitted and projected all 26 families (36,105 bytes, zero byte omissions), called LateOn once, and received a complete validated permutation with worker/provider `observedWallMs=860` in that run and no retry, timeout, or failure. A later final verification repeat reported worker/provider `observedWallMs=827`; these are separate executions of the same frozen request, not competing clocks. LateOn placed the two implementation chunks at provider ranks 1 and 2; `mcp_ranked` and disclosure preserved that exact order. No weights, role quotas, artifact penalties, repository-specific boosts, or post-provider reorder were added.

## 20. Full candidate diagnostics could change product search semantics

- **Status (2026-08-09):** fixed by separating product retrieval from diagnostic retrieval.
- **Symptom:** the Issue 19 reproduction used `debugMode=full` plus `debugCandidateLimit=160`. When precise lexical retrieval returned zero candidates, the diagnostic any-term fallback was fed into actual RRF product fusion. The resulting path produced 16 filtered families instead of the normal product path's 26. Enabling a diagnostic limit of 32 was sufficient to reproduce the difference because it enabled fallback capture.
- **Additional contract risk:** deep tracing asked the backend for 160 candidates and derived the product prefix from that enlarged request. LanceDB returned the same first 32 dense IDs as a direct top-32 request in the observed generation, but backend prefix invariance was not an established product contract and is no longer assumed.
- **Fix:** product dense/lexical retrieval now executes with the exact normal product limits and modes. Optional deeper dense/lexical and any-term fallback requests populate only diagnostic arms and candidate-survival evidence. Diagnostic-only candidates cannot enter product fusion, deterministic filtering, expansion decisions, reranker input, grouping, continuation, or disclosure. Full diagnostics may perform additional bounded vector work but cannot change product semantics.
- **Closure evidence:** on the same indexed generation and query, shallow full diagnostics and `debugCandidateLimit=160` produced identical ordered IDs at `core_fusion`, `mcp_filtered`, `reranker_input`, `reranker_output`, `mcp_ranked`, `grouped`, and `disclosed`. Deep diagnostics still exposed 160 candidates in the explicitly diagnostic dense stage and the fallback arm. Diagnostic-only backend failures now publish bounded per-arm `available`/`unavailable` status with `backend_request_failed` while preserving product results; genuine generation-authority loss remains blocking. Generic Core tests cover deliberately non-prefix backend responses, deep dense/lexical failures, and an unavailable any-term fallback; MCP coverage preserves diagnostic-only causality and proves identical semantic-query attempts, reranker input, grouping, and disclosed results with diagnostics off/on.

## 21. Ignore control signatures can diverge from sealed policy authority

- **Status (fixed and package-verified 2026-08-10):** confirmed root cause and
  implemented the authority repair. This is not an
  `ignore` parser defect: the repository's installed `ignore@7.0.5` correctly
  treats `/data/` as root-anchored. The defect is a split between live ignore
  rules, durable index-policy authority, and the lifecycle signature.
- **Symptom:** changing `.satoriignore` from `data/` to `/data/` caused one
  reconciliation to add the nested `src/python/core/data/` and
  `src/python/data/` source files, then a later sync removed them again. Even
  explicit negations only held temporarily. Removing every active data pattern
  also failed: the next completed sync still excluded the same 27 tracked
  Python files under directories named `data`.
- **Current-state evidence:** the lifecycle snapshot records the exact SHA-256
  of the current pattern-free `.satoriignore`
  (`46170db2059744902c95ed3cf51484cb965ce84c9ec941d465e58fa0d280787b`).
  Completed sync generation 4228 binds that signature and reports 1,521
  indexed paths, but zero paths matching `(^|/)data/`. The durable v4
  index-policy document was republished at the same completion boundary and
  still contains the retired bare `data/`. Its matcher therefore excludes the
  27 files while a matcher built from the current root ignore files includes
  them.
- **Primary source-confirmed race (best explanation of the observed durable
  state):** full indexing resolves and freezes `candidatePolicy` before the
  long payload build (`manage-indexing-handlers.ts:1602-1609`). After publishing
  that policy, its marker, checkpoint, and navigation authority, the coordinator
  calls `recordCurrentIgnoreControlSignature()` (`:1885`). That method computes
  the signature from whatever control-file bytes exist at that later instant;
  it is not passed the candidate policy or the bytes used to resolve it
  (`sync.ts:656-691`). An edit during indexing can therefore publish the old
  bare `data/` policy and then bless the new pattern-free signature.
- **Why watcher/lease protection does not close the race:** watcher events are
  accepted only for searchable states, so ignore-file events while the root is
  `indexing` are dropped. The mutation lease serializes Satori writers but does
  not freeze or validate repository bytes. The current TradingView root files
  also disprove the fallback theory that `.gitignore` still supplies bare
  `data/`: it contains only scoped `data/cache/`, `data/external/`,
  `data/exports/`, and `data/*.json` rules.
- **Second source-confirmed gap:** incremental
  `reconcileIgnoreRulesChange()` reloads current rules but does not resolve and
  publish a replacement `ResolvedIndexPolicy`. The existing Core delta path is
  built around the previously sealed policy. A genuine policy mismatch should
  therefore fail closed before payload deletion or signature acknowledgement
  unless a new candidate policy can be published atomically.
- **Impact:** ignore-rule edits can silently flap indexed membership and leave
  the accepted manifest inconsistent with the operator's current rules. A
  daemon restart or later policy publication can resurrect retired patterns
  without triggering reconciliation because the control signature already
  matches current bytes.
- **Implemented boundary:** `observeIndexPolicyInputs()` now reads root
  `.satoriignore`, root `.gitignore`, and `satori.toml` once through stable,
  root-bound, no-follow descriptors and returns both parsed policy inputs and
  their exact v1 control signature. Full indexing carries that observed
  signature through candidate publication and acknowledges only that value;
  it no longer re-reads later repository bytes and relabels the generation.
  Canonical `satori_index_policy_v5` binds the signature into the durable
  policy digest and generation proof. Immediately before candidate authority
  publication, the MCP coordinator re-observes the controls through the same
  Core owner. Byte drift aborts candidate activation as typed
  `index_policy_changed`, without marker/policy/navigation publication,
  watcher acknowledgement, or accepted-signature advancement.
- **Incremental behavior:** reconciliation observes one complete candidate and
  compares its semantic policy hash with durable accepted authority before
  refreshing matchers, deleting payload, syncing, or advancing lifecycle
  identity. A changed policy fails closed as `requires_reindex` with reason
  `index_policy_changed`. A semantically identical legacy v4 policy is upgraded
  atomically to v5 with the observed signature; this prevents an already-stale
  v4 snapshot signature from hiding the incident after upgrade or restart.
- **Regression coverage:** tests bind exact candidate bytes across later file
  drift, candidate-signature acknowledgement after full indexing, durable v5
  digest tamper detection, restart behavior, legacy-v4 upgrade, precedence of
  generation-sealed identity over lifecycle snapshot identity, and zero
  payload/signature mutation when policy drift requires reindex. The bounded
  control fixture also binds no-file, bare `data/`, anchored `/data/`, ordered
  cross-file negation, same-size replacement, deletion, oversized input, and
  existing symlink rejection behavior.
- **Do not use daemon restart as the discriminator:** startup can reload the
  same stale durable policy, so continued exclusion after restart does not
  prove a built-in `data` skip. Source inspection and the installed `ignore`
  matcher show no generic built-in `data/` exclusion.

### Issue 21 ignore-policy implementation audit

This is the reviewed current contract, not a proposed replacement:

- `IgnoreRuleService.findIgnoreFiles()` reads only root `.satoriignore` and
  root `.gitignore`, in that fixed order. Symlinks and non-regular files are
  rejected. Nested `.gitignore` files are not discovered, and watcher control
  handling explicitly treats `nested/.gitignore` as an ordinary path rather
  than an ignore-control file.
- `parseIgnorePatterns()` preserves rule order and gitignore-significant
  whitespace. It removes CR from CRLF, empty lines, and lines whose first
  character is `#`; it does not trim patterns.
- The effective matcher order is defaults, runtime custom patterns, root
  `.satoriignore`, then root `.gitignore`. The implementation passes that
  ordered list to `ignore`, so later rules can override earlier rules subject
  to gitignore parent-directory and negation semantics. Consequently,
  `.satoriignore` is not currently the final override authority: a later root
  `.gitignore` rule can change its result.
- A successful file reload replaces the prior file-based rule set and rebuilds
  the matcher. If runtime observation of an ignore file fails, the reload logs
  a warning and deliberately retains the previous active patterns.
- Ignore-file reads are root-bound, no-follow, stable-observation reads with a
  1 MiB maximum. This protects rule authority but means unreadable, oversized,
  replaced, or symlinked control files must be covered as failure cases rather
  than silently treated as empty.
- `FileSynchronizer` and the watcher both evaluate normalized repository-
  relative paths through the active `ignore` matcher; directories are checked
  in both `path` and `path/` forms. The watcher rebuilds its matcher from
  `Context.getActiveIgnorePatterns()`, which is intended to be the single
  runtime source of truth.
- Search builds another active matcher from the same Context patterns and
  fails closed by treating all paths as ignored if matcher construction fails.
  Separately, search-noise guidance maintains a cached matcher for root
  `.gitignore` only, keyed by observed mtime/size with periodic forced reload.
  That cache filters suggested ignore patterns; it is not index-membership
  authority and must not be used as evidence that the accepted manifest obeys
  current policy.
- Resolved index policy records the exact ordered file-based and effective
  patterns. Publishing or reloading that policy calls
  `setFileBasedPatterns(policy.fileBasedIgnorePatterns)`. This is the path that
  can restore retired durable rules after a live reload; it is authority
  behavior, not evidence of a built-in directory skip.
- There is no generic built-in `data/` default. The observed 27-file exclusion
  is explained by stale durable policy containing the retired bare `data/`
  rule; the post-policy eligible-file count is not independent evidence of a
  hidden directory skip.

Existing focused tests cover significant whitespace/CRLF parsing, ordered
negation within one root ignore file, persisted-policy restart behavior,
ignore-signature reconciliation (including same-size content changes), and
watcher recognition of root control files. A targeted source/test search found
no direct regression that binds root anchoring and cross-file precedence
through initial indexing, incremental reconciliation, watcher sync, durable
publication, restart, and search authorization as one lifecycle.

The repair deliberately preserves the existing cross-file authority:
`.satoriignore` followed by `.gitignore` as one ordered rule stream. It does
not add nested `.gitignore` discovery or change parser/matcher semantics.

Required bounded audit matrix for the Issue 21 regression fixture:

| Dimension | Cases that must be bound |
|---|---|
| Root rule shape | no ignore files; bare `data/`; anchored `/data/`; ordered negation |
| Cross-file order | `.satoriignore` plus `.gitignore` with conflicting ignore/re-include rules |
| Parent semantics | ignored parent with child negation; explicitly re-included parent and child |
| File parsing | LF/CRLF, comments, escaped or leading `#`, significant leading/trailing spaces |
| Control-file transitions | edit, deletion, same-size replacement, unreadable/oversized/symlink failure |
| Execution surface | fresh full index, manual incremental reconcile, watcher-triggered sync, restart, search/read authorization |
| Published identity | current ignore-file bytes/signature, resolved ordered rules and policy hash, accepted manifest, completion marker/source checkpoint, watcher rule version |

The acceptance condition is not merely that the nested `data` files appear
once. After the policy transition, every execution surface must resolve the
same rule set; a follow-up sync and restarted Context must retain the same
manifest; and the durable policy must no longer contain the retired rule.

## 22. Reranker projection rejects indexed candidates from files above 256 KiB

- **Status (fixed 2026-08-10 on the current branch):** the confirmed 6.9.0
  failure now has a root-bound streamed projection path and focused regression
  coverage. No ranking, admission, provider-order, or projection-selection
  policy changed.
- **Live symptom:** `must:tzinfo must:replace` admitted 32 reranker candidates
  but projected only 29. The response reported three
  `source_unavailable` failures and emitted `RERANKER_INPUT_DEGRADED`. The first
  failed candidate was a valid indexed span at lines 774-778 of
  `scripts/ops/phase6p_pair_relationship_observation_source.py`. The file is
  tracked, the span exists, and a direct bounded `read_file` of that span
  succeeds.
- **Demonstrated mismatch:** that file is 525,434 bytes. Its recognized Python
  extension is index-eligible independently of the 1 MiB fallback all-text cap;
  `SATORI_ALL_TEXT_MAX_BYTES` is not a universal index ceiling. Published-source
  reads default to 8 MiB
  (`packages/mcp/src/core/published-source-reader.ts`), but
  `readCurrentSourceEvidence()` hard-caps the whole-file evidence read at
  256 KiB (`packages/mcp/src/core/current-source-symbols.ts:15,59-87`).
  `resolvePublicationBoundEvidence()` maps the resulting unavailable evidence
  to the generic `source_unavailable` projection failure
  (`search-rerank-projection.ts:72-121`).
- **Impact:** valid candidates from files accepted by the index can never be
  scored by the configured reranker. Large source files therefore predictably
  degrade ordering even when the exact candidate span is small and readable;
  the diagnostic also hides the actionable `file_too_large` cause.
- **Required fix boundary:** retain publication/hash authority without requiring
  the entire file to fit the 256 KiB projection buffer. A bounded span read plus
  streamed full-file hash verification is one compatible shape. At minimum,
  expose a distinct size-limit failure reason rather than calling the source
  unavailable.
- **Regression contract:** index a file between 256 KiB and the accepted index
  maximum with a small canonical symbol, admit that symbol to reranking, and
  prove projection succeeds from hash-matched current source without retaining
  the complete file text. Preserve fail-closed behavior for hash mismatch and
  source replacement races.

### Issue 22 implementation investigation

- The 256 KiB limit belongs to general current-symbol validation. Raising it is
  not the narrow repair: an existing test intentionally binds that validator's
  bounded behavior.
- `prepareInspectableSource()` can read a larger file only when given a larger
  limit, but it buffers the complete file. `readFileHandleExactly()` also
  concatenates the complete content. `FileSynchronizer.hashFileBytes()` streams
  a hash but is private, does not capture a source window, and does not provide
  the exact descriptor/path race contract needed by projection. No reusable
  root-bound streamed-hash-plus-window primitive exists today.
- Add one root-bound primitive that opens without following symlinks, snapshots
  identity/size, streams exactly the observed bytes into SHA-256 while retaining
  only a bounded line window, rejects growth/truncation, verifies descriptor
  metadata, then reopens and verifies the path identity. Return no partial
  evidence on any race.
- Add a projection-specific evidence type carrying the original line offset so
  v2/v3/v4 can validate and remap owner/candidate spans without pretending a
  window is the whole file. Preserve the exact existing projection bytes for
  files that already fit the current reader.
- The projection maximum must derive from accepted index/runtime policy rather
  than another unrelated magic number. Candidate byte offsets are optional, so
  the bounded reader needs a line-based path rather than requiring byte spans.
- Add a distinct typed size-limit reason to
  `SearchRerankProjectionFailureReason`; update the exhaustive typed-reason
  integration table and diagnostics. Hash disagreement remains
  `source_hash_mismatch`.

### Issue 22 implementation closure

- `readStableRootBoundFileWindow()` is the reusable Core owner. It opens a
  root-confined regular file without following the final symlink, binds a
  publishable file identity and observed size, streams exactly the observed
  bytes through SHA-256, retains only the requested bounded line window,
  rejects truncation/growth, and revalidates descriptor plus current pathname
  identity before returning evidence.
- Publication-bound projection v2/v3/v4 keeps the existing whole-source path
  byte-for-byte for files within the 256 KiB current-symbol reader. Only an
  unavailable default read falls back to the streamed window; injected readers
  retain their existing fail-closed contract. The candidate span is remapped
  into the retained window while owner and full-file hash checks remain against
  canonical publication metadata.
- The maximum full file accepted by this projection path is the existing
  configured published-source/read ceiling (`READ_FILE_MAX_BYTES`, 8 MiB by
  default), which is already part of runtime configuration. A file or retained
  window above its policy limit reports
  `source_exceeds_projection_limit`; hash disagreement remains
  `source_hash_mismatch`.
- Regression coverage uses a real source above 256 KiB with a three-line owner
  and proves v2/v3/v4 success, bounded retention, complete raw-byte SHA-256,
  typed limit failure, hash-mismatch failure, multibyte lines spanning stream
  chunks, and the existing descriptor/path replacement and growth rejection
  primitives.
- Focused verification passed: Core typecheck; 19 root-bound/window tests; Core
  clean build; MCP typecheck; 41 projection/native-rerank tests; and 187 handler
  search-scope tests.

The implementation remains split at the intended ownership boundary: the Core
root-bound primitive and race contract, then MCP publication-bound projection
with a real source above 256 KiB. No ranking, admission, provider-order, or
projection-text tuning was included.

## 23. Must-lane admission can stop at the chunk limit before filling grouped results

- **Status (fixed 2026-08-10 on the current branch):** the confirmed 6.9.0
  grouped-search shortfall now has a mode-aware admission fix and a real
  handler/finalization regression.
- **Live symptom:** `must:cache_repo` with `limit=10` returned seven grouped
  results, while `hints.mustCoverage` reported
  `lane_skipped_primary_limit_filled`, `laneAttempted:false`, and
  `candidatesExamined:0`. The response consequently warned that additional
  must-matches may exist even though the dedicated conjunctive lane was never
  queried. Full candidate survival recorded 15 `mcp_filtered` chunks before
  those chunks collapsed to seven caller-visible groups.
- **Root cause:** `runSearchExecution()` decides whether to run the must lane
  from the count of filtered chunk candidates before later symbol/file grouping
  (`packages/mcp/src/core/search-execution.ts:1427-1460`). Enough chunks can
  satisfy `retrievalResultLimit` while collapsing to fewer distinct output
  groups, so the lane is skipped even though the caller-visible result bound is
  not filled. Existing tests bind the skip when primary candidates fill the
  limit, but do not cover post-group family collapse.
- **Related diagnostic evidence:** an actually empty scoped must query emitted
  `FILTER_MUST_UNSATISFIED`,
  `MUST_NOT_SATISFIED_WITHIN_RETRIEVAL_BUDGET`, and
  `MUST_RESULTS_MAY_BE_INCOMPLETE_WITHIN_RETRIEVAL_BUDGET` together. Those
  codes are individually compatible with bounded, non-exhaustive recall, but
  the three-message presentation is redundant and obscures the decisive lane
  status.
- **Impact:** deterministic all-terms retrieval can be bypassed by duplicate
  chunks from too few families, leaving visible grouped capacity unused and
  making must-constrained recall depend on primary retrieval diversity.
- **Required fix boundary:** make the must-lane skip decision against the
  caller-visible grouping/family capacity, or reserve bounded conjunctive-lane
  admission before final grouping. Keep the existing all-terms backend contract
  and bounded-recall honesty; do not claim exhaustive recall.
- **Regression contract:** supply at least the retrieval-result-limit number of
  primary chunks that satisfy `must:` but collapse below the requested grouped
  limit, plus a dedicated-lane match from another family. Assert the lane runs,
  the additional family is recoverable, grouping remains deterministic, and
  warning codes reflect the final coverage state without duplicate empty-result
  guidance.

### Issue 23 implementation investigation

- The skip owner is `runSearchExecution()`, but canonical symbol grouping is
  not available there. Final grouping may repair/reject owner metadata through
  the registry, fall back to path/proximity buckets, collapse declarations,
  and apply diversity. The reranker family key is therefore not an equivalent
  caller-visible group identity.
- Do not call `buildVisibleGroupedSearchResults()` early and do not duplicate
  owner/grouping policy in execution. The smallest safe repair is to pass
  `resultMode` into `SearchExecutionInput`, preserve the chunk-count skip for
  raw mode, and always reserve the existing bounded `all_terms` must lane for
  grouped mode. Final grouping remains the only grouping authority.
- Put the failing cross-boundary fixture at the handler/finalization level: at
  least 15 primary chunks collapse to seven groups under `limit=10`, while one
  lane-only family is recoverable. Keep the existing execution-unit test that
  proves raw-mode primary-limit skipping.
- This changes some grouped responses from
  `lane_skipped_primary_limit_filled` to an attempted bounded status, but the
  existing public `SearchMustCoverage` schema can represent that without a
  schema-version change.

### Issue 23 implementation closure

- `SearchExecutionInput` now carries the public `resultMode`. Raw mode retains
  the established chunk-count skip when primary chunks fill the result limit;
  grouped mode cannot infer final visible capacity at execution time and always
  reserves the existing bounded conjunctive lane when `must:` tokens exist.
- Lane candidates still enter through the existing stable chunk identity,
  normal deterministic filters, and native ordering. Final symbol/file grouping
  remains the only grouping authority; no grouping or reranker-family policy
  was copied into execution.
- The handler regression supplies 15 primary chunks across seven file groups
  under `limit=10` plus one lane-only eighth file. The bounded `all_terms` lane
  is attempted on repeated executions, the eighth group is recovered, and
  final grouped order is stable. Existing execution and handler tests prove raw
  mode still publishes `lane_skipped_primary_limit_filled`.
- Empty attempted lanes now emit the single specific
  `MUST_NOT_SATISFIED_WITHIN_RETRIEVAL_BUDGET` warning; its message already
  carries the bounded/non-exhaustive caveat. Failed and unavailable lanes keep
  their specific diagnostic plus incomplete-recall warning. The authoritative
  `SearchMustCoverage` status remains unchanged and never claims exhaustive
  recall.
- Focused verification passed: MCP typecheck; 10 must-lane execution tests;
  188 handler search-scope tests; the native-order, native-rerank, reliability,
  and rerank-context suites; 242 tests total across the implicated files; and
  targeted ESLint/diff checks.

`OR` syntax remains out of scope.

## 24. Full-index progress reaches 100% before proof and publication complete

- **Status (fixed 2026-08-10 on the current branch):** the MCP coordinator now
  reserves public 100% for terminal completion. Search/read readiness and Core's
  payload-processing progress contract are unchanged.
- **Symptom:** `manage_index status` can report 100% while the operation remains
  in `writing`/`proving`/`publishing` and all reads still return
  `not_ready reason:indexing`. The observed post-100% interval was roughly
  30-90 seconds on the 970-file TradingView repository.
- **Root cause:** `Context.indexCodebase()` assigns the file-processing range
  through 100% and emits `Indexing complete!` at 100 after vector payload and
  staged navigation construction (`packages/core/src/core/context.ts:3117-3133,
  3204-3210`). The MCP full-index coordinator persists that value as the public
  indexing percentage before it performs exact source-checkpoint proof, call
  graph rebuild, completion-marker publication, durable policy publication,
  and navigation-pointer activation
  (`packages/mcp/src/core/manage-indexing-handlers.ts:1642-1663,1693-1898`).
  Those later phases correctly keep the operation non-terminal.
- **Retry contract:** blocked reads always publish the fixed
  `DEFAULT_MANAGE_RETRY_AFTER_MS=2000` (`packages/mcp/src/config.ts:62`), which
  is a polling interval rather than an estimated remaining duration. The
  response does include the durable operation phase, but the 100% headline
  makes the longer proof/publication window look stalled or inconsistent.
- **Impact:** clients cannot distinguish completed payload processing from a
  completed searchable generation, and may perform dozens of futile retries
  after being shown 100%. This also makes two calls straddling final publication
  look like contradictory readiness evidence.
- **Required fix boundary:** reserve progress space for proof/publication or
  publish a phase-aware progress model where 100% is terminal-only. Keep
  completion-marker and navigation authority fail-closed. Label the fixed
  `retryAfterMs` as a retry cadence unless a separately measured ETA is added.
- **Regression contract:** pause a full rebuild after the Core callback reaches
  its final value but before marker/navigation publication. Assert public status
  is non-terminal and below terminal completion (or explicitly phase-complete),
  reads remain `not_ready`, and only the accepted `completed` receipt can expose
  terminal 100%/ready state.

### Issue 24 implementation investigation

- `Context.indexCodebase()` owns payload-processing progress and may retain its
  final 100 callback for direct callers. MCP deliberately defers full
  publication, so `ManageIndexingHandlers.startBackgroundIndexing()` owns the
  public projection of that callback.
- The smallest compatible repair is to cap the active MCP snapshot value below
  100 (for example `min(corePercentage, 99)`) until the coordinator commits the
  `completed` operation and replaces `indexing` with `indexed`. No response
  schema or Core callback change is required.
- Extend the real indexing-handler harness so `setCodebaseIndexing()` records
  values instead of being a no-op. Invoke Core's 100 callback, pause
  `publishNavigationCandidate()`, assert the operation is `publishing` and the
  public value is below 100, then release publication and assert the final
  indexed/completed state.
- Keep `retryAfterMs=2000` as retry cadence. An ETA or adding operation phase to
  every indexing metadata object is a separate product change and is not
  required to close this defect.

### Issue 24 implementation closure

- `ManageIndexingHandlers.startBackgroundIndexing()` now projects every active
  Core callback as `min(corePercentage, 99)` before writing public indexing
  state. Core may still report payload processing at 100 to direct callers.
- The real coordinator harness invokes Core's 100 callback and pauses inside
  `publishNavigationCandidate()`. While paused, it proves the durable operation
  is `publishing`, lifecycle remains `indexing`, no indexed snapshot exists,
  and public progress is 99. After release, the existing completed transition
  atomically exposes `completed`/`indexed` readiness.
- Focused verification passed: 84 indexing-coordinator and read-blocking tests,
  MCP typecheck, targeted ESLint, clean MCP runtime build, and diff hygiene. An
  independent review found no correctness or test-coverage blocker.
- `retryAfterMs=2000` remains a retry cadence. No response schema, completion
  proof, navigation authority, source checkpoint, or Core progress behavior was
  changed.

## Temporary next-session handoff

### Confirmed open work

None from Issues 21–24. The only remaining item in the authorized rubric is an
optional documentation-only clarification of pagination parameter wording; it
does not require a runtime change or a live index mutation.

### Confirmed non-defects and closed branches

- **Issue 21 ignore-policy authority is fixed in the current worktree.** One
  observed input tuple now owns parsed policy plus signature; full publication
  and incremental reconciliation cannot acknowledge a different observation.
  Durable v5 authority closes the restart/crash window, while genuine policy
  changes require a full reindex before indexed membership can change.
- **Pagination works.** Live 6.9.0 verification with `limit=20` and
  `disclosureLimit=6` returned six groups plus a continuation handle at offset
  6; `continue_search` returned the next six distinct groups at offset 12 with
  the same frozen ranked-set digest. `limit` is the total frozen bound,
  `disclosureLimit` is the initial page size, and `availableGroupCount` includes
  pool entries outside the caller limit.
- **Path scoping works** in the current runtime for both the path parameter and
  the `path:` operator. The nested data-path failure belongs to Issue 21.
- **TradingEntryVetoes call graph works** on the current generation: depth-two
  traversal returned 14 sealed edges, including the reported constructor and
  veto-evaluation callers.
- **Exact-symbol validation is fixed:** conflicting identities plus missing
  mode are reported together. Bounded large-symbol reads are intentional.
- **Fingerprint mismatch remains intentionally fail-closed.** Component-only
  rebuild or stale lexical serving is a feature proposal, not a confirmed bug.
- **Runtime-owner and stale-codebase claims were not reproduced** on the
  current shared runtime. Do not add heartbeat expiry that could declare a live
  writer dead without a separate safety proof.

### Small-model pagination documentation follow-up

This is a non-defect documentation improvement. Front-load these meanings in
the `search_codebase` schema instead of adding more prose to the already dense
description:

- `limit`: total frozen result-set size across all pages, not page size;
- `disclosureLimit`: initial page size; set it below `limit` to obtain a handle
  when enough frozen results exist;
- example: `limit=20, disclosureLimit=6` returns six initially and freezes up to
  twenty;
- `continuation: complete` means the caller-bounded frozen set is complete, not
  that `availableGroupCount` was exhausted.

Update generated MCP documentation/manifest checks only if this wording change
is implemented. No pagination runtime or ranking change is warranted.

### Closing verification record

- Live read-only checks used the repository-backed server reporting Satori
  6.9.0 against `/home/hamza/repo/tradingview_ratio`.
- The 2026-08-10 implementation investigation used four independent read-only
  subagent lanes, one per open issue, followed by parent source/test
  verification. Codebase-memory generation `2026-08-10T00:21:35Z` reported no
  recorded gap for the cited runtime source paths; relevant tests are excluded
  from that graph mode and were inspected directly.
- Focused current-contract checks passed 23/23: Core ignore-policy persistence
  3/3, MCP ignore reconciliation 5/5, current-source/large-inspection 3/3,
  must-lane execution 10/10, and indexing status/snapshot validation 2/2. The
  first Core invocation hit a Node test-runner IPC deserialization error after
  one passing test; rerunning the same three tests with
  `--test-isolation=none` passed 3/3, so it is recorded as harness/environment
  noise rather than product evidence.
- No live create, reindex, clear, process termination, or ranking tournament was
  performed.
- Focused disclosure, must-lane, and reranker-projection suites passed 33/33;
  they bind current behavior and expose the missing regression cases above.
- Issue 21 implementation verification: Core and MCP typechecks passed; all
  affected policy/sync/public-lifecycle tests passed; the package-wide Core run
  found only four stale v4 schema expectations introduced by v5, and their
  corrected focused rerun passed 4/4 while all other Core tests passed; the
  package-wide MCP suite passed; and the clean root build completed without
  generating any additional tracked diff.
- The historical ledger has 23 numbered entries: issue number 4 was already
  absent. Do not invent or renumber a historical issue merely to close the gap.
- Repository-state warning at session close: the pre-existing Git index still
  records the historical evidence file as renamed to this temporary handoff.
  This session added further unstaged documentation to that already-staged
  rename. Reconcile the index deliberately before any commit so the final
  handoff content, rather than the earlier staged snapshot, is retained.
