# 2026-08-04 Search Weakness Report Verification

## Status and scope

This document records the code-level verification of a live-observation
weakness report against the Satori search/navigation surface, together with
the remediation plan. It is a read-only investigation: no source changes were
made, no index was rebuilt, and no publication or release decision is
authorized by this document.

The investigation checked:

- Satori source revision `403723ee09ed9762195d983b3c4595985a917f5d`
  (`fix(cli): align Doctor with active runtime authority`, current master
  head at investigation time; worktree clean);
- installed MCP runtime `@zokizuan/satori-mcp@6.8.1` (the report's live
  daemon version);
- the weakness report's observed behaviors (reported live against the 6.8.1
  daemon, including a second consumer's indexing of
  `/home/hamza/repo/tradingview_ratio`-style repositories and the
  `TradingEntryVetoes` / `_evaluate_entry_authority_and_post_signal` /
  `economic_attribution.py` symbols).

Verification was performed against the checked-out source, not by replaying
the live daemon. Observed behaviors from the report are marked "observed";
statements marked "verified" are code-level conclusions at the listed
revision. Several worktrees exist; line numbers are for this checkout.

Priority meanings (consistent with
[`2026-07-23-operational-search-and-navigation-findings.md`](./2026-07-23-operational-search-and-navigation-findings.md)):

- `P1`: a valid public identity or correctness input can produce a false result.
- `P2`: a material availability, cross-tool consistency, or diagnostic defect.
- `P3`: a bounded product limitation already disclosed by the public contract.

## Verdict

| ID | Priority | Status | Finding |
| --- | --- | --- | --- |
| W1 | P1 | confirmed | `must:` is a post-retrieval substring filter over the retrieved candidate set, not a pre-retrieval constraint; matching files outside the retrieval set are silently invisible. Quoted `must:` values are the only exact-phrase path and are still retrieval-gated. |
| W2 | P2 | confirmed | Reranking is a live external fetch with no timeout, retry, or backoff; failure degrades to retrieval order with a `RERANKER_FAILED` warning and no telemetry counter. Ordering is not mislabeled as reranked. |
| W3 | P2 | confirmed | Inbound call-graph coverage is per-symbol and silently incomplete: the partial-coverage warning cannot distinguish "no callers" from "unknown callers", and unresolvable constructor-receiver references emit no record, no fallback, and no note. |
| W4 | P1 | confirmed with corrected scope | Tracked dirty files do participate in search freshness (exact content comparison + a live-path retrieval pass); the observed `opencode.jsonc` case is an ignore-policy exclusion. The real gap is that untracked files are invisible to freshness and retrieval (`--untracked-files=no`). |
| W5 | P3 | confirmed, deliberate design | After 100% progress, search stays `not_ready` until the completion-marker control record is durable; the window is the cost of the atomic marker proof and is fail-closed by design. |
| W6 | P3 | confirmed | `open_symbol` source is span-bounded with continuation fingerprints; a full-source path exists via `read_file` (explicit ranges / `presentation:"full"`) but is not advertised by the symbol tools. |
| W7 | P2 | confirmed | A continuation handle is attached only when the ranked set has remaining groups and the continuation coordinator admits it; oversized sets are stripped (`SEARCH_RESULT_SET_NOT_CACHE_ADMISSIBLE`) with no total/available group disclosure. |

Strengths to preserve (do not regress): the fail-closed fingerprint gate, the
completion-marker durability model, the explicit coverage warning with
`must:` self-verification hints, and per-candidate `rerankAdjusted`
truthfulness.

Related prior records: [`2026-07-23-operational-search-and-navigation-findings.md`](./2026-07-23-operational-search-and-navigation-findings.md)
(F8 = operator-only `must:` retrieval text, F9 = same-class/qualified Python
member calls, F11 = no-answer calibration, F12 = compact-read contract) and
[`SATORI_PYTHON_INBOUND_RELATIONSHIP_COVERAGE_REPAIR_PLAN.md`](../plans/SATORI_PYTHON_INBOUND_RELATIONSHIP_COVERAGE_REPAIR_PLAN.md)
(the `python_constructor_receiver_pass` conclusion previously falsified by
production requalification, which W3 reopens for the class-constructor case).

## W1 — `must:` is a post-retrieval substring filter

Observed: two distinct `must:` queries never surfaced the files that violate
the invariant being checked; only legitimate matches appeared. Static-rule
violations are invisible to Satori.

Verified mechanism:

- `parseSearchOperators` (`packages/mcp/src/core/search-query-planning.ts`)
  tokenizes the prefix block; quoted values are supported (the tokenizer
  keeps `"..."` together; `unquoteOperatorValue` strips quotes and escapes).
- `must:` is consumed three ways:
  1. joined into the semantic query text
     (`deriveOperatorOnlySemanticQuery`, `search-query-planning.ts:151`),
     which shapes but does not constrain retrieval;
  2. enforced as a post-retrieval filter in `evaluateCandidate`
     (`packages/mcp/src/core/search-execution.ts:1113`):
     `must.every((token) => tokenMatchesAnyField(token, [symbolLabel, relativePath, content]))`,
     removing candidates as `must_filter`;
  3. `tokenMatchesAnyField` (`packages/mcp/src/core/search-query-support.ts:1248`)
     is a plain substring check (`field.includes(token)`).
- Retrieval happens first (lexical projection, candidate budget). There is an
  `operator_constraint` pool expansion (`search-execution.ts:250`) and a
  bounded `mustRetry` loop, but both are capped by candidate limits — this is
  why files containing the tokens can remain invisible.

Answer to the report's investigation questions:

1. `must:` both shapes retrieval (soft) and filters the retrieved set (hard
   post-hoc). It does not constrain the retrieval set itself.
2. The exact-phrase path exists for quoted values (`must:"replace(tzinfo=None)"`
   becomes one token, matched literally via `includes`) — but only over the
   retrieved set. Wildcards are not supported.

## W2 — Reranking is a live external API call without timeout or retry

Observed: two searches in one session returned `RERANKER_FAILED` with
ordering falling back to retrieval-only.

Verified mechanism:

- `VoyageAIReranker.rerank` (`packages/core/src/reranker/voyageai-reranker.ts:47`)
  is a raw `fetch` with no `AbortSignal`, no timeout, no retry, no backoff.
- `measureSearchPhase` (`packages/mcp/src/core/handlers.ts:1216`) is a
  timing-only wrapper — a slow-but-successful rerank blocks the whole
  response.
- Failure handling (`packages/mcp/src/core/search-execution.ts:547-607`):
  catch sets `rerankerFailurePhase`, attaches `warning: RERANKER_FAILED`, and
  the pipeline continues with retrieval-order fusion scores.
  `candidate.rerankAdjusted` stays false on failure — ordering is not
  mislabeled as reranked.
- No telemetry counter exists: `searchDiagnostics` tracks
  `rerankerCalls/candidates/inputBytes` but not failures.

Answer to the report's investigation questions:

1. The emission site is `search-execution.ts:626` (warning attached to the
   response envelope); the fallback is implicit — retrieval-order scores
   stand as-is.
2. No timeout, retry, or backoff exists anywhere in the path.
3. `RERANKER_FAILED` is not raised as a freshness/quality counter today;
   adding one is a plan item (R2).

## W3 — Call-graph coverage is per-symbol and silently incomplete

Observed: `TradingEntryVetoes` → 0 inbound edges +
`CALL_GRAPH_INBOUND_COVERAGE_PARTIAL`, while a `must:` search found two real
call sites; `_evaluate_entry_authority_and_post_signal` → 1 edge at
confidence 0.95.

Verified mechanism:

- `CALL_GRAPH_INBOUND_COVERAGE_PARTIAL`
  (`packages/mcp/src/core/relationship-backed-call-graph.ts:113,527`) is
  emitted whenever the combined (retrieved + source-fallback) inbound edge
  set is empty. It cannot distinguish "no callers exist" from "callers
  unknown/unindexed".
- Confidence mapping (`relationship-backed-call-graph.ts:273`): high 0.95,
  medium 0.65, low 0.35.
- Low-confidence records are suppressed at query time
  (`packages/core/src/navigation/query.ts:570-595`); the source-backed
  fallback runs only when suppressed records exist
  (`relationship-backed-call-graph.ts:445-458`).
- Constructor call sites are eligible targets for class symbols
  (`packages/core/src/relationships/builder.ts:149`,
  `isEligibleCallTarget`), and constructor-receiver resolution exists
  (`resolvePythonClassReference` / `pythonConstructorExpression`), but it
  only emits when the class reference resolves (same-file module bindings /
  `classesByName`). An unresolvable reference emits no relationship record at
  all — hence no suppressed record, no fallback, and no note.

Answer to the report's investigation questions:

1. Constructor-receiver resolution is implemented but partial: it is
   same-module/reference-graph driven; cross-module or qualified class
   references that fail to resolve emit nothing. This matches the previously
   falsified `python_constructor_receiver_pass` conclusion in
   [`SATORI_PYTHON_INBOUND_RELATIONSHIP_COVERAGE_REPAIR_PLAN.md`](../plans/SATORI_PYTHON_INBOUND_RELATIONSHIP_COVERAGE_REPAIR_PLAN.md).
2. `CALL_GRAPH_INBOUND_COVERAGE_PARTIAL` is decided purely by
   "no inbound edges in the combined graph" — the user cannot distinguish
   "no callers" from "unknown callers". The `must:` follow-up hint
   (`buildInboundVerificationSearchQuery`) is attached only on empty inbound.

## W4 — Freshness: tracked dirty files handled; untracked files invisible

Observed: uncommitted changes (modified `opencode.jsonc`) were invisible to
search; the report concluded freshness is git-HEAD-based and working-tree
state is used only for preflight.

Verified correction:

- Working-tree state is part of the search freshness path for tracked files:
  `ensureSearchFreshness` (`packages/mcp/src/core/handlers.ts:3995`) →
  `getChangedFilesForCodebase` (`git status --porcelain`) → non-empty →
  `exactSourceComparisonPaths` → content-hash comparison against the
  freshness checkpoint (`packages/core/src/sync/synchronizer.ts:1291`,
  `comparePathsToOwnedCheckpoint`); a `differs` result drives a sync.
- Dirty tracked files also feed a `live_path` retrieval pass
  (`packages/mcp/src/core/search-execution.ts:1020`,
  `buildLivePathScopedSearchResults`).
- The `opencode.jsonc` case is an ignore-policy exclusion: the file is
  `.satoriignore`'d (a repository commit explicitly added
  `opencode.jsonc`/`cc.json` to `.satoriignore` to prevent freshness sync
  churn), so it is outside index scope by design and never invalidates
  freshness.
- No `head_sha`-based proof exists in the codebase; freshness is
  checkpoint/content-based.
- Real gap found: `getChangedFilesForCodebase` runs
  `git status --porcelain --untracked-files=no`
  (`packages/mcp/src/core/working-tree-state.ts:97`), so untracked files are
  invisible to freshness invalidation and to the `live_path` pass. A
  brand-new file is not searchable and does not age the index until it is
  committed.

## W5 — "indexing" false-positive window after 100%

Observed: after `progressPct: 100.0`, search returned `not_ready` for ~30s;
status flipped to completed only after the marker doc was written; two
searches bounced in that window.

Verified mechanism:

- The completion marker is a vector control record written after the payload
  writes (`packages/core/src/core/context.ts:4562-4575`,
  `writeIndexCompletionMarker`).
- Readiness requires marker proof; a missing marker is a distinct
  `missing_marker_doc` reason (`packages/mcp/src/core/search-frontdoor.ts:187`).
- During the window, search returns `status: "not_ready", reason: "indexing"`
  with `hints.debugIndexing.completionProof: "marker_doc"`
  (`packages/mcp/src/core/tool-response-builders.ts:314`). `retryAfterMs`
  exists only on `manage_*` payloads, not on search payloads.

Answer to the report's investigation question: the window is the deliberate
cost of an atomic completion proof (the durability model the report itself
lists as a strength). `countIndexedPayloadExactly`
(`context.ts:1600`) could gate a "queryable but finalizing" state, but that
trades a slice of the fail-closed guarantee for availability (plan R5, gated
on evidence that the window hurts real usage).

## W6 — Source reads are span-bounded; full files unreachable through symbol tools

Observed: `calculate_metrics` (199 lines) returned 2 lines under a 60-line
budget; 2085-line and 843-line files stayed span-only; the middle required
continuation fingerprints.

Verified mechanism:

- `selectBoundedSource` (`packages/mcp/src/core/bounded-source-selector.ts:449`
  `buildExcerpts`, `:530` complete-vs-bounded decision) returns
  `mode: "complete"` only when the whole symbol fits the budgets
  (`maxSourceBytes` / `maxSourceLines` / `maxSerializedSourceBytes`);
  otherwise it returns bounded excerpts (declaration + terminal + query /
  evidence anchors) plus continuation fingerprints
  (`packages/mcp/src/core/symbol-context-composer.ts:890-960`).
- A full-source path exists and is not part of the symbol tools:
  `read_file` explicit ranges always return exact source, and
  `presentation: "full"` returns raw multiline source
  (`packages/mcp/src/tools/read_file.ts:43,447`).

Answer to the report's investigation question: there is no
`presentation: full` on the `open_symbol`/`symbol_context` path; the bypass
is `read_file` with explicit ranges (uncapped apart from the transport
envelope), and continuation fingerprints provide paged access within
`symbol_context`.

## W7 — continue_search handle was not surfaced

Observed: no `handle` field in any search response, even at 44 available
groups.

Verified mechanism:

- A continuation is attached only when `resultCounts.remainingGroupCount > 0`
  (`packages/mcp/src/core/search-result-finalization.ts:678`) and the
  continuation coordinator admits the ranked set
  (`packages/mcp/src/core/handlers.ts:4507-4532`).
- If the store returns `not_admissible`, the handle is stripped and
  `SEARCH_RESULT_SET_NOT_CACHE_ADMISSIBLE` is added to warnings — no
  total/available group count is disclosed in that case.

Answer to the report's investigation question: the handle appears exactly
when a continuation exists and is cache-admissible; the observed absence at
44 groups is consistent with the ranked set exceeding the reserved replay
byte budget (`reservedReplayBytes` / `responseByteLimit`). The contract's
"when continuation is present" wording matches the code; disclosure
suppresses it only via the not-admissible path, which is silent about the
total group count.

## Remediation plan

The detailed implementation plan lives at
[`docs/superpowers/plans/2026-08-05-search-integrity-and-runtime-honesty.md`](../superpowers/plans/2026-08-05-search-integrity-and-runtime-honesty.md)
(Tasks 0–8, per-task red → green regression proof, one reviewable commit per
task, cross-task regression gate, release boundary). This section only maps
the findings to the plan tasks and records the plan's non-negotiables.

| Finding | Plan task | Commit (message) |
| --- | --- | --- |
| W1 `must:` post-retrieval filter | Task 1 — bounded `must:` retrieval lane | `fix(search): add bounded must-constrained retrieval` |
| W2 reranker no timeout/retry | Task 2 — VoyageAI latency bound and failure reporting | `fix(reranker): bound VoyageAI latency and report failures` |
| W3 call-graph silent incompleteness | Task 3 — inbound coverage evidence (before extraction) | `fix(call-graph): expose inbound coverage reasons` |
| W3 constructor-receiver gap | Task 4 — cross-module Python constructor resolution | `fix(python): resolve cross-module constructor callers` |
| W4 untracked-file freshness gap | Task 5 — untracked files in freshness and `live_path` | `fix(freshness): include untracked files in live search` |
| W5 not_ready window | Task 6 — `finalizing` readiness state (optional UX) | `feat(search): expose finalizing readiness state` |
| W6 span-bounded source friction | Task 7 — document `read_file` full-source path | `docs(search): document full-source retrieval` |
| W7 continuation handle absence | Task 8 — continuation availability evidence | `feat(search): report continuation availability` |

Plan non-negotiables (must not regress): the fail-closed fingerprint gate,
durable-marker readiness, `rerankAdjusted === false` on failure, empty-inbound
`must:` follow-up hints, `.satoriignore` exclusion policy, bounded recovery
lanes, and no ranking change for queries without `must:`.

Execution order: Tasks 1–5 (correctness) → full regression gate → Tasks 6–8
(UX/observability) → release bump and packed-release qualification. Do not
mix these changes into the qualified CLI `1.9.2` artifact; the release graph
is produced by the repository's release workflow, never by manual version
selection.

## Verification caveats

- This document is code-level verification at `403723ee…`. The observed
  behaviors (two `RERANKER_FAILED` events, the ~30s `not_ready` window, the
  44-group search without a handle, the `TradingEntryVetoes` inbound gap)
  come from the live-observation report and were not replayed against the
  daemon.
- The reranker findings apply to the external VoyageAI path; the local
  offline profile uses the LateOn reranker, whose operational reasons are
  captured separately (`resolveLateOnOperationalReason`).
- No index was rebuilt and no configuration was changed during this
  investigation.
