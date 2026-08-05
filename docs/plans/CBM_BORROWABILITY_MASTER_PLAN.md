# CBM Borrowability Master Plan — What Satori Should Copy From codebase-memory-mcp

**Status:** review complete; planning gate. No implementation authorized by this document.
**Date:** 2026-08-05
**Review base revision:** `633c1d4a334655163844af6c3f6905d0ca5df793` (satori master, clean tree)
**External reference:** `DeusData/codebase-memory-mcp` at `ad96bf3` (cloned depth-1 at `/home/hamza/repo/codebase-memory-mcp`)
**Primary owner:** `packages/core`
**Public projection owner:** `packages/mcp`
**Review basis:** 12 parallel deep-dive agents (8 on cbm, 4 on satori), parent spot-checks of every high-leverage claim. Agent reports: `/tmp/satori-review/{cbm-architecture,cbm-graph-schema,cbm-search-query,cbm-trace-cross-service,cbm-ops,cbm-ux-distribution,cbm-tests-ci,cbm-hybrid-lsp,satori-core-index,satori-search,satori-graph-navigation,satori-ops-tests}.md`; synthesis: `/tmp/satori-review/SYNTHESIS.md`.
**Related plans (coordinate, do not duplicate):**
- `PERSISTED_SYMBOL_ANALYSIS_METADATA_PLAN.md` — on-demand Python structural analysis (complexity metrics, M0 storage-model decision). This plan's Phase 3 complexity work extends it to persisted index-time metrics.
- `RELATIONSHIP_BACKED_NAVIGATION_AND_SQLITE_STORE_PLAN.md` — relationship-backed navigation + SQLite store (already implemented; this plan's graph tools read that store).
- `SYMBOL_OWNED_RETRIEVAL_IMPLEMENTATION_PLAN.md` — complete; symbol-owned retrieval + proof-graded Python resolution.
- `SATORI_PYTHON_INBOUND_RELATIONSHIP_COVERAGE_REPAIR_PLAN.md` — complete; Python caller coverage.
- `LANGUAGE_CAPABILITY_MATRIX_AND_SYMBOL_EXTRACTOR_HARNESS_PLAN.md` — historical; superseded by `MULTI_LANGUAGE_SYMBOL_DEFINITION_PARITY_PLAN.md`.
- `AGENT_FACING_FRESHNESS_RESPONSE_CONTRACT_PLAN.md` — freshness contract for agent-facing responses.

---

## 1. How to read this plan (for an agent with zero context)

This document is a **roadmap + design plan**, not a per-line implementation ticket.
An engineer executing any phase must first read sections 2 and 3 (orientation), then the
phase's tasks. Every task states:

- **Files** — exact paths to create/modify/test.
- **Interfaces** — exact function/type signatures the task consumes and produces
  (an implementer sees only their own task; this block is how they learn neighbors' contracts).
- **Steps** — ordered work with verification commands.
- **Acceptance** — the observable proof that the task is done.

The repo's own plan discipline: **no phase may mutate public behavior without first
recording evidence** (dated `docs/evidence/<experiment>-<date>/` dirs are the repo
convention — see `docs/evidence/`). Phases with an "M0 decision" step require the
evidence-backed storage/format decision *before* implementation, exactly like
`PERSISTED_SYMBOL_ANALYSIS_METADATA_PLAN.md` did.

Every claim about cbm in this document was verified against its source at
`/home/hamza/repo/codebase-memory-mcp` (paths like `src/mcp/mcp.c:10121` are repo-relative
to that clone). Every claim about satori was verified against master `633c1d4a`.

---

## 2. Orientation: what satori is

### 2.1 Product

Satori ("a codebase map for AI coding agents before they edit", v0.6.0) is an MCP server +
CLI that indexes a codebase into a **semantic search index** (dense + lexical vectors) plus
**navigation data** (symbols, relationships, call graph), keeps the index **fresh** against
working-tree changes, and serves agent-facing tools:

- `search_codebase` / `continue_search` — grouped semantic search with frozen result sets
- `call_graph` — registry-resolved caller/callee traversal (heuristic, advisory)
- `file_outline` — symbol outline per file (sidecar-backed)
- `read_file` — canonical-path-enforced file reads with `open_symbol` context contracts
- `manage_index` — index lifecycle: `create | reindex | sync | status | clear | repair`
- `list_codebases` — tracked codebases + readiness

### 2.2 Repo map (TypeScript/pnpm monorepo)

| Path | Responsibility |
|---|---|
| `packages/core/src/` | The engine. Indexing pipeline, embeddings, vector store, freshness, symbols, relationships, navigation, sync. |
| `packages/mcp/src/` | MCP server: tool schemas, handlers, search orchestration, envelope contracts. |
| `packages/cli/src/` | CLI: install/doctor/upgrade/terminate, managed runtime. |
| `evals/` | Evaluation harnesses (search-quality, useful-context, search-ranking, vector-stacks, code-intelligence-vs, agent-discovery, agent-disclosure). |
| `tests/integration/` | Integration tests (context, lancedb, synchronizer). |
| `scripts/` | Release graph, typecheck-all, version freshness, install-local-mcp-runtime, eval drivers. |
| `docs/plans/` | Design/decision plans (this repo's plan convention — all-caps filenames, Status/Date/Review-base headers). |
| `docs/evidence/` | Dated, evidence-per-experiment dirs (repo convention for proof-driven changes). |
| `fixtures/` | Test fixtures. |
| `queries/`, `experiments/` | Manual queries and experiments. |

### 2.3 Key concepts (glossary — used throughout this plan)

- **Codebase root**: an absolute filesystem path tracked as an index target. The
  `list_codebases`/`manage_index`/`search_codebase` `path` parameter.
- **Index collection**: vector-store collection holding chunk documents + control records.
  Default embedded store: LanceDB (hardlink-CoW atomic publication). Remote: Milvus/Zilliz
  (dense + BM25 sparse).
- **Completion marker**: control document `satori_index_completion_v3` inside the collection
  proving index completion; carries `IndexFingerprint` (embedding provider/model/dimension,
  vector store provider, schema/parser/extractor/relationship versions, projection versions).
  Fingerprint mismatch ⇒ `requires_reindex`. See `packages/core/src/core/persisted-index-authority.ts`.
- **Freshness**: merkle-rooted snapshots of file signatures (`{size, mtimeMs, ctimeMs}`),
  generation checkpoints, atomic staged publication, mutation fencing, TOCTOU-hardened
  root-bound reads. See `packages/core/src/sync/{synchronizer.ts,merkle.ts}`.
- **Symbol registry**: per-file sidecar shards under `~/.satori/navigation/<md5(normalizedRoot)>/`
  (`SATORI_STATE_ROOT` override). `symbolKey = sha256('symkey_' + JSON{relativePath, language, kind,
  qualifiedName, parentQualifiedNamePath})[0:32]`; `symbolInstanceId = sha256('syminst_' + JSON{symbolKey,
  fileHash, span, extractorVersion})`. Versions: `symbol_registry_v3`, current pointer
  `navigation_current_v3`, seal `navigation_generation_seal_v1`.
- **Relationships**: `CALLS IMPORTS EXPORTS EXTENDS IMPLEMENTS REFERENCES TESTS GENERATES CONFIGURES`
  with `confidence: 'high'|'medium'|'low'` and (Python) `ResolutionClaim.resolutionAuthority` ∈
  `direct_binding | origin_flow | heuristic_reference | ambiguous | unresolved | unsupported`.
  Built at index time by `packages/core/src/relationships/builder.ts`
  (`buildRelationshipsForRegistry`, `buildCallRelationshipsForRegistry`); the current heuristic is
  `confidence: target.file === source.file ? 'high' : 'low'`.
- **Navigation store**: `packages/core/src/navigation/` — `query.ts` (`getGraphNeighbors`),
  `store.ts`, `runtime.ts` (`RuntimeNavigationStore`), `sqlite.ts` (SQLite variant:
  tables `symbols`, `relationships`, `files`, `navigation_manifest`; serving is
  parity-gated vs canonical JSON).
- **Language capabilities**: `packages/core/src/languages/capabilities.ts` —
  `fullNavigationLanguage` (symbols + owner + calls): `javascript, typescript, python`;
  `symbolOnlyLanguage`: `cpp, csharp, go, java, rust, scala`; ~150 search-only declarations.
- **Language analysis**: `packages/core/src/language-analysis/` — `service.ts` backends:
  oxc (JS/TS), tree-sitter WASM (python/go/rust/java/csharp/cpp/scala), bounded-text fallback.
  `chunks.ts`: chunkSize 2500 chars, overlap 300, symbol-span-anchored chunking.
- **Search pipeline** (mcp): `search-query-planning.ts` (operators: `lang: path: -path: must: exclude:`,
  escape `\`, `\n\n` body split) → `search-frontdoor.ts` (readiness) →
  `search-execution.ts` (passes: primary/expanded/dirty_overlay/lexical_files/live_path/must_lane;
  RRF fusion k=100 core / k=60 mcp) → `search-ranking-policy.ts`
  (`computeSearchCandidateFinalScore`: `(fusionScore + lexicalScore) × pathMultiplier ×
  changedFilesMultiplier × agentFitMultiplier + min(0.35, entrypointOwnerScoreBoost)`) →
  rerank (`search-rerank-policy.ts`; Voyage remote or lateon local ONNX in a forked worker) →
  grouping (`search-group-results.ts`, diversity caps 2/file) → disclosure
  (`search-disclosure.ts`, default 10) → frozen set (`search-result-set-cache.ts`, 48-hex handle,
  TTL 15 min, idempotent `advance(expectedOffset)`).
- **Operation receipts**: durable index-operation state machine
  (`accepted → preflight → scanning → writing → proving → publishing → completed | failed | blocked`)
  persisted in the snapshot store; leases via `packages/mcp/src/core/mutation-lease.ts`
  (PID + Linux processStartTime liveness) and `packages/core/src/core/index-policy-mutation-coordinator.ts`.
- **Repair proof**: `packages/core/src/core/repair-proof.ts` — proof items
  `collection | snapshot | marker | fingerprint | payload | staleRemoteChunks | navigation`.
- **Watch**: chokidar-based live watcher, `packages/mcp/src/core/sync.ts:registerCodebaseWatcher`
  (~1971), per-codebase ignore matchers, watcher coverage states, event reasons
  (`source_changed | directory_changed | ignore_rules_changed`).

### 2.4 Commands (verification vocabulary used by every task)

```bash
pnpm typecheck            # repo-wide typecheck (scripts/typecheck-all.mjs)
pnpm lint                 # repo-wide lint
pnpm test:integration     # core integration tests (tests/integration/*.integration.test.mjs)
pnpm -C packages/core test -- <file>          # core unit tests (node --test style)
pnpm -C packages/mcp test -- <file>           # mcp unit tests
pnpm run eval:search-candidates:capture       # evals (see evals/ dirs)
pnpm run release:check                        # full release gate
```

### 2.5 Current known-good state (observed 2026-08-05)

- `satori_list_codebases`: `/home/hamza/repo/satori` = **Requires Reindex**
  (`navigation_recovery_failed` — ignore-rule reconciliation deleted indexed paths and sync
  recovery failed, or navigation sidecar recovery failed during delta sync). Reindex must be
  authorized before satori-on-satori experiments.
- 4 stale failed worktree roots (`stale_local:invalid_policy_authority` / `invalid_payload`) —
  harmless legacy state.

---

## 3. Orientation: what codebase-memory-mcp is

### 3.1 Product

codebase-memory-mcp (cbm) is a **pure-C, zero-dependency, single-binary** code intelligence
engine: tree-sitter parsing for 158 languages + in-binary "Hybrid LSP" type resolvers for 10
languages, building a persistent **knowledge graph** (nodes/edges in SQLite) queried through 15
MCP tools, with a RAM-first staged indexing pipeline, an own **Cypher engine**, HTTP-route and
async-channel extraction, cross-repo link matching, complexity analytics, a git-poll watcher,
an embedded 3D graph UI, and serious test/CI discipline.

### 3.2 What the review verified as REAL (source-cited)

| Capability | Evidence (cbm repo) |
|---|---|
| SQLite store: contentless FTS5 BM25 + camelCase-split insert-time tokenization | `src/store/store.c:350-372,483-560,722` |
| Structural label boosting (Function/Method +10, Route +8, type-likes +5; noise labels excluded) | `src/mcp/mcp.c:2877-2882` |
| BM25 early-termination + inner candidate cap (2000) + stable pagination (`ORDER BY rank, id`) | `src/mcp/mcp.c:2849-2925` |
| Regex `name_pattern` search with LIKE pre-filter hints | `src/store/store.c:4054,4084-4174` |
| Cypher engine (lexer+recursive descent, MATCH/WHERE/RETURN/UNWIND/OPTIONAL, 100k ceiling, 30s deadline) | `src/cypher/cypher.c` (4941 lines) |
| `trace_path`: calls/data_flow/cross_service modes; risk labels hop→CRITICAL/HIGH/MEDIUM/LOW; exact totals + watermark cursor + stale-cursor errors; include_evidence strategy classes (`lsp\|language_rule\|heuristic\|unresolved`) + confidence + `candidates` count | `src/mcp/mcp.c:5625-6315`; `src/store/store.c:4722` |
| Complexity metrics (cyclomatic, cognitive, loop_count/depth, max_access_depth; call-site smells linear_scan_in_loop/alloc_in_loop/unguarded_recursion) + `transitive_loop_depth` propagation along CALLS (memoized DFS, 3-state cycle detection, cap 256) | `internal/cbm/helpers.c:595-695`; `internal/cbm/cbm.c:1490-1560`; `src/pipeline/pass_complexity.c` |
| Route nodes (`__route__<METHOD>__<canonical_path>`), path canonicalization (`:x`/`{x}`/`<x>`→`{}`), HANDLES edges, HTTP_CALLS/ASYNC_CALLS/GRPC/GRAPHQL/TRPC_CALLS, framework tables | `src/pipeline/pass_route_nodes.c`; `internal/cbm/service_patterns.c`; `internal/cbm/extract_channels.c` |
| Cross-repo CROSS_* edges (canonical-QN rendezvous, bidirectional idempotent writes, `cross-repo-intelligence` mode) | `src/pipeline/pass_cross_repo.c` |
| `detect_changes`: 3 merged git sources (committed+unstaged+untracked), hunk-scoped seeds (`--unified=0` line overlap, cap 4096), one multi-source BFS, exact `impacted_total`, `impacted_modules` rollup, `merge_base` SHA | `src/mcp/mcp.c:10121` |
| Per-file index coverage (classes `parse_partial`/`skipped`/`not_indexed`, caps + truncated flags), `check_index_coverage` tool | `src/mcp/mcp.c:3887,4217` |
| Env-access extraction (per-language function allowlists, MIN_ENV_NAME_LEN=2) | `internal/cbm/extract_env_accesses.c`; `internal/cbm/lang_specs.c` |
| MinHash near-clone `SIMILAR_TO` (K=64, AST node-type trigrams, Jaccard ≥0.95, ≤10 edges/node, LSH 32×2) | `src/simhash/minhash.c`; `src/pipeline/pass_similarity.c` |
| Git-poll watcher with dirty-state signature (reindex only when dirty *state* changes; baselines committed only after success) | `src/watcher/watcher.c` |
| ADR store (per-project blob in SQLite `project_summaries`, MCP↔UI parity, legacy file migration) | `src/store/store.c:7845`; `src/mcp/mcp.c:10717` |
| Quality: no-skips test policy, zero-loss parallel suite harness with union guard, seeded MCP-stdio fuzz with replay, pinned SHA actions + read-only default CI permissions, dimension-tagged eval plan (D1–D5) | `scripts/check-no-test-skips.sh`, `scripts/run-tests-parallel.sh`, `scripts/security-fuzz-random.sh`, `.github/workflows/_test.yml`, `docs/EVALUATION_PLAN.md` |

### 3.3 What the review found is MARKETING or a TRAP — do not copy

| Claim | Reality (verified) |
|---|---|
| `ingest_traces` tool | **Stub**: returns `"accepted"` + `"Runtime edge creation from traces not yet implemented"`; creates no edges (`src/mcp/mcp.c:10921`). |
| "Dead code detection" README bullet | No dedicated tool; only user-written Cypher recipes. |
| Linux-kernel 3 min / 120× fewer tokens / 83% answer quality / arXiv 2603.27277 | README-only; `docs/BENCHMARK.md` is dated v0.3.0; `docs/EVALUATION_PLAN.md` is a plan, not results; arXiv not verifiable in-repo. |
| "6768 passing tests" badge | Count drifted (7102 `TEST(` at review time); no CI gate validates it. |
| `trace_path.parameter_name` | **Dead parameter** (parsed, never applied). |
| Hard-coded confidence floor 0.6 | No knob; cbm regrets it ("revisit when telemetry justifies a knob"). Satori should make its floor configurable from day one. |
| Pure-C implementation strategy / RAM-first arenas / RaBitQ quantization / algorithmic embeddings | Satori has real embeddings incl. local Potion (offline) — no gap; the C machinery is not portable and not needed. |
| Full Cypher engine | Satori should NOT port a Cypher engine; it needs a bounded read-only query surface over its SQLite navigation store (Phase 4, task 4.5). |

---

## 4. The verdict: gap matrix (what to copy, ranked)

Legend: **T1** = small/high-leverage, **T2** = medium (differentiator), **T3** = large/architectural.
"cbm source" is the verified reference; "satori gap" is the verified current state.

| # | Tier | Copy item | cbm source | Satori gap today | Effort | Satori owner |
|---|---|---|---|---|---|---|
| 1 | T1 | Risk labels by hop (CRITICAL/HIGH/MEDIUM/LOW) on `call_graph` | `store.c:4722` `cbm_hop_to_risk` | No severity anywhere; only confidence floats | trivial | `packages/mcp` call_graph + core traversal |
| 2 | T1 | Configurable traversal depth >3 with per-depth node budget | `trace_path` depth semantics | `callGraphInputSchema.depth` hard-capped `max(3)`; both engines clamp `Math.min(3, …)` | small | schema + both engines |
| 3 | T1 | Exact totals + `truncated` + cursor on call_graph (totals counted under the same filter as visible rows) | `mcp.c` trace pagination contract | Bounded windows, no exact totals | small–med | core traversal + mcp |
| 4 | T1 | Edge resolution evidence: closed strategy class + confidence + `candidates` count per edge | `mcp.c:5747` 4-class vocab | Confidence exists; no closed class, no candidates telemetry | small | relationships + call_graph |
| 5 | T1 | Test-file filter with matching totals (default exclude) | `mcp.c:5676` `is_test_file` | Tests mixed into caller lists | small | call_graph |
| 6 | T1 | Cycle/back-edge notes in traversal; transitive `recursionState` | `pass_complexity.c` cycle flags | `visited` set silently skips; recursion = direct self-loop only | small | core traversal |
| 7 | T1 | `pattern:` regex operator (cbm `name_pattern` with LIKE pre-filter) | `store.c:4054-4174` | Token-boundary matching only; no regex | small–med | `search-query-planning.ts` + `search-query-support.ts` |
| 8 | T1 | Structural label boosting in final score (callables +, File/Folder/Variable noise −) | `mcp.c:2877-2882` | Only path-category multipliers | small | `search-ranking-policy.ts` |
| 9 | T1 | Per-file index coverage report (`parse_partial`/`skipped`/`not_indexed` + line ranges) | `mcp.c:3887,4217` | Marker has `indexedFiles`/`limit_reached` only | small | core + `manage_index` detail |
| 10 | T1 | `list_codebases` metadata parity (branch, head_sha, worktree, canonical_root, nodes, edges, size) | `list_projects` | Thin status lines | small | `packages/mcp` |
| 11 | T1 | Env-access extraction (per-language allowlists) → config↔code queries | `extract_env_accesses.c` | None | small | `language-analysis` |
| 12 | T1 | MCP prompts (`explore_codebase`, `review_change_impact`) + tool profiles (analysis/scout) + per-tool annotations | `mcp.c` prompts/profile machinery | None | small | `packages/mcp` |
| 13 | T1 | Formalized output contracts: exact totals, `truncated` flags, quoting rules (keep output line-grep-parseable) | `compact_out.c` conventions | Envelope exists; formalize | small | `packages/mcp` |
| 14 | T2 | `detect_changes` blast radius: 3 git sources, hunk-scoped seeds, multi-source BFS, exact `impacted_total` + module rollup, `merge_base` SHA | `mcp.c:10121` | Nothing (freshness only) | medium | new mcp tool + core closure query |
| 15 | T2 | Complexity metrics at index time + `transitive_loop_depth` along CALLS | `helpers.c:595`; `pass_complexity.c` | Python on-demand only (`analyzePythonSymbolStructure`) | medium | `language-analysis` + relationships |
| 16 | T2 | Route extraction (TS: Express/Fastify/Next; Python: FastAPI/Flask): Route nodes + HANDLES + HTTP_CALLS + canonicalization | `pass_route_nodes.c`; `service_patterns.c` | None anywhere | medium–large (phased) | new routes owner in core |
| 17 | T2 | Dead-code/orphan detection tool (no callers ∧ not exported ∧ not test-referenced) | Cypher recipe (cbm has no tool) | Data exists; no tool | small–med | new mcp tool |
| 18 | T2 | Search ranking with call-graph centrality (bounded multiplier) | `search_graph` degree filters | `graph:"ready"` hint computed but never scores | medium | `search-ranking-policy.ts` |
| 19 | T2 | Schema introspection (`get_graph_schema`-style) | `mcp.c:2594` | Fixed schemas; no introspection tool | small | `packages/mcp` |
| 20 | T2 | Seeded MCP-stdio fuzz with replay; no-skips test policy; step-0 static contract gates | `scripts/security-fuzz-random.sh`; `check-no-test-skips.sh`; `scripts/test.sh` step 0 | None; CI uses unpinned `@v4` actions | small–med | `scripts/` + `ci.yml` |
| 21 | T2 | Bug-repro corpus with RED/GREEN controls (`repro_issue*` lane) | `tests/repro/` | evals + fixtures, no per-issue repro lane | medium (discipline) | repo `repro/` + integration |
| 22 | T2 | Dimension-tagged eval rubric (D1–D5) + PASS/PARTIAL/FAIL + attempt counts | `docs/EVALUATION_PLAN.md` | Strong evals; no dimension taxonomy | medium | `evals/` |
| 23 | T2 | Per-language fixture floors (`min_defs` catastrophe floor) | `tests/grammar_cases.h` | No per-language floor contract | medium | `fixtures/` + core integration |
| 24 | T2 | SIMILAR_TO near-clone edges (MinHash+LSH) | `minhash.c`; `pass_similarity.c` | None | medium | new core pass (lower priority: vector embeddings cover much) |
| 25 | T2 | llms.txt + dated benchmark docs (methodology, not unverifiable claims) | `docs/llms.txt`, `docs/BENCHMARK.md` | docs/ + evals, no llms.txt | small | docs/ |
| 26 | T3 | Cross-repo CROSS_* edges (canonical route QN rendezvous, bidirectional idempotent writes, `cross-repo-intelligence` mode) | `pass_cross_repo.c` | Single-repo per index | large | new pass; builds on #16 |
| 27 | T3 | Bounded graph-query surface (query_graph-lite over SQLite navigation store; parameterized, read-only, capped) — NOT a Cypher port | `cypher.c` guards (30s, 100k) | Fixed-shape navigation reads only | large | `packages/mcp` + navigation |
| 28 | T3 | Git-poll watcher with dirty-state signature (fallback only; satori already has chokidar) | `watcher.c` | chokidar watcher exists | small–med | `sync.ts` (only if watch gaps proven) |
| 29 | T3 | Local graph UI | `src/ui/` | satori-landing exists; low agent value | large | defer |

**Recommended sequencing:** T1 sweep → #14+#15+#19 (the "graph intelligence" differentiators) →
#16 routes (TS first, then Python) → #26 cross-repo on top → #17+#18 → quality infrastructure
(#20–#23) continuously.

---

## 5. Coordination with existing plans (anti-duplication contract)

| This plan's item | Existing plan | Relationship |
|---|---|---|
| #15 complexity metrics | `PERSISTED_SYMBOL_ANALYSIS_METADATA_PLAN.md` | That plan selected on-demand Python analysis (M0). Task 3.1 must re-open the M0 storage-model decision for **persisted, all-language** metrics (its Option B: "existing optional navigation contribution"). Do not re-implement its Python on-demand path. |
| #14/#17/#19 graph tools | `RELATIONSHIP_BACKED_NAVIGATION_AND_SQLITE_STORE_PLAN.md` (implemented) | Tools consume the SQLite/JSON navigation store; no new store work. |
| #18 centrality ranking | `SYMBOL_OWNED_RETRIEVAL_IMPLEMENTATION_PLAN.md` (complete) | Centrality reads relationship sidecars; must not change symbol-owned retrieval identities. |
| #7/#8 search | `AGENT_FACING_FRESHNESS_RESPONSE_CONTRACT_PLAN.md` | New operators/multipliers must respect the freshness response contract (blockers before results). |

---

## 6. Phases

Each phase is independently shippable, testable, and gated. Phases do not depend on each
other unless stated. TDD per task: write the failing test first, run it, implement, run again.

---

### Phase 1 — call_graph intelligence (T1 items #1–#6)

Goal: make `call_graph` results carry severity, evidence, exact scale, and cycle awareness —
the trust multipliers cbm agents rely on.

#### Task 1.1: Risk labels by hop distance

**Files:**
- Modify: `packages/mcp/src/tools/call_graph.ts` (schema: add optional `riskLabels` param)
- Modify: `packages/mcp/src/core/navigation-handlers.ts` (`handleCallGraph`, ~line 846)
- Modify: `packages/mcp/src/core/search-types.ts` (response types)
- Test: `packages/mcp/src/core/call-graph-risk.test.ts` (new)

**Interfaces:**
- Consumes: `GetGraphNeighborsOk` from `packages/core/src/navigation/query.ts` — records carry
  per-hop traversal distance? *(verify: `getGraphNeighbors` returns `records` + `visitedSymbolInstanceIds`;
  hop distance must be computed in the handler from BFS order — see Task 1.2 which adds explicit hop metadata.)*
- Produces: `CallGraphRiskLabel = 'critical' | 'high' | 'medium' | 'low'`; per-edge
  `risk?: CallGraphRiskLabel` with rule **hop 1 → critical, hop 2 → high, hop 3 → medium,
  hop ≥4 → low** (cbm `cbm_hop_to_risk`, `src/store/store.c:4722`); `riskLabels: true` opt-in
  (off by default, matching cbm's opt-in `risk_labels`).

**Steps:**
1. Write `call-graph-risk.test.ts`: golden test asserting hop→label mapping for a 5-hop
   synthetic graph; assert opt-in default is `false` and absent from output when not requested.
2. Run: `pnpm -C packages/mcp test -- core/call-graph-risk.test.ts` — expect FAIL (no module).
3. Add `riskLabels: z.boolean().optional()` to `callGraphInputSchema`; thread through
   `handleCallGraph`; compute per-edge hop distance (min hop from seed after dedup, matching
   cbm's keep-minimum-hop rule) and attach `risk`.
4. Rerun test — PASS. Run `pnpm typecheck && pnpm lint`.
5. Extend the tool `description()` text: "risk labels are hop-distance bands, advisory, not
   a compiler-grade severity analysis."

**Acceptance:** `call_graph` with `riskLabels: true` returns per-edge `risk` with the exact
cbm band mapping; default output unchanged; unit + typecheck + lint green.

#### Task 1.2: Configurable depth with per-depth budget

**Files:**
- Modify: `packages/mcp/src/tools/call_graph.ts` (schema: `depth` max 3 → 6)
- Modify: `packages/mcp/src/core/navigation-handlers.ts` + `relationship-backed-call-graph.ts`
  (replace `Math.min(3, …)` clamps with a shared `MAX_CALL_GRAPH_DEPTH = 6`)
- Modify: `packages/core/src/navigation/query.ts` (`getGraphNeighbors` — add per-depth node
  budget so depth 6 cannot explode; keep `visitedSymbolInstanceIds` for cycle notes)
- Test: `packages/core/src/navigation/query.depth.test.ts` (new)

**Interfaces:**
- Consumes: `GetGraphNeighborsInput { symbolInstanceId, depth, direction, allowedTypes?, allowedConfidences?, limit? }`.
- Produces: `depthBudgetPerLevel?: number` (default e.g. 200 nodes/level, capped total
  `limit`); `hopMetadata` exposed on records (needed by Task 1.1) — produce
  `traversalHop: number` per returned record.

**Steps:**
1. Failing test: 6-level synthetic chain via the store, assert records at depth 6 are
   reachable and that a 2000-node fan-out at level 2 is budget-truncated with a `truncated`
   warning, not a hang.
2. Implement budget in `getGraphNeighbors`; keep `visitedSymbolInstanceIds` semantics.
3. Update schema `max(6)`; remove handler clamps; wire `traversalHop`.
4. Rerun tests; `pnpm typecheck`.

**Acceptance:** depth 6 works with bounded resource use; `traversalHop` present; backward
compat (depth ≤3 requests behave identically).

#### Task 1.3: Exact totals + truncated + cursor

**Files:**
- Modify: `packages/mcp/src/core/navigation-handlers.ts` (response envelope)
- Modify: `packages/mcp/src/core/search-types.ts` (`CallGraphResponse`)
- Modify: `packages/core/src/navigation/query.ts` (count support: exact
  `callersTotal`/`calleesTotal` computed under the same filters as visible rows)
- Test: `packages/mcp/src/core/call-graph-totals.test.ts` (new)

**Interfaces:**
- Consumes: `GetGraphNeighborsOk`.
- Produces: `callersTotal: number` / `calleesTotal: number` (exact, filter-matched);
  `truncated: boolean`; `next?: { watermark: string; expectedOffset: number }` —
  watermark = canonical `(direction, hop, symbolInstanceId)` tuple; stale watermark
  (generation changed) → `stale_cursor` error teaching re-run (cbm pattern).

**Steps:**
1. Failing test: graph with 5 callers, `limit: 2` → response has `callersTotal: 5`,
   `truncated: true`, and a watermark that resumes at the next page with no duplicates/omissions.
2. Implement exact counting in the query layer (count under identical filters — the cbm
   invariant: "totals must match visible rows"), watermark cursor in handler.
3. Rerun tests; update `description()` with the stale-cursor contract.

**Acceptance:** totals always exact; pagination loop (advance → replay) yields the full set
exactly once; stale cursor returns the documented error.

#### Task 1.4: Edge resolution evidence — strategy class + candidates count

**Files:**
- Modify: `packages/core/src/relationships/types.ts` (add `resolutionStrategyClass`)
- Modify: `packages/core/src/relationships/builder.ts` (populate per call site from
  `ResolutionClaim.resolutionAuthority`)
- Modify: `packages/mcp/src/core/navigation-handlers.ts` (expose via opt-in `includeEvidence`)
- Modify: `packages/mcp/src/core/search-types.ts`
- Test: `packages/core/src/relationships/evidence-class.test.ts` (new)

**Interfaces:**
- Consumes: `ResolutionClaim` (authority ∈ `direct_binding | origin_flow | heuristic_reference |
  ambiguous | unresolved | unsupported`).
- Produces: closed 4-class vocabulary (cbm `cbm_mcp_edge_strategy_class`):
  `registry_resolved` (direct_binding/origin_flow), `heuristic_reference`
  (heuristic_reference), `unresolved` (unresolved/ambiguous), `unsupported` (unsupported).
  Per-edge: `resolutionStrategyClass`, `confidence`, `candidates: number` (count of candidate
  targets considered — cbm's free telemetry). **Pin the closed vocabulary with a test** that
  fails on any new authority value (cbm pins its vocabulary the same way).

**Steps:**
1. Failing test: a heuristic edge reports class `heuristic_reference` + `candidates ≥ 1`; a
  direct-binding edge reports `registry_resolved`; a new invented authority fails the pinning
  test.
2. Implement mapping + population; expose `includeEvidence: true` opt-in.
3. Rerun; `pnpm typecheck && pnpm lint`.

**Acceptance:** every CALLS edge can report class+confidence+candidates under opt-in; pinning
test enforces the closed vocabulary.

#### Task 1.5: Test-file filter with matching totals

**Files:**
- Modify: `packages/mcp/src/tools/call_graph.ts` (add `includeTests?: boolean` default `false`)
- Modify: `packages/mcp/src/core/navigation-handlers.ts` (filter + count under same filter)
- Test: `packages/mcp/src/core/call-graph-test-filter.test.ts` (new)

**Interfaces:**
- Consumes: relationship records with `TESTS` type + test-path detection helpers
  (exists in core; verify location — used by `CallGraphTestReference` extraction).
- Produces: `includeTests: false` (default) excludes test-file nodes from caller/callee lists
  **and** from totals; `testReferences` (existing feature) unaffected.

**Steps:**
1. Failing test: caller list with 2 prod + 1 test caller → default shows 2, `callersTotal: 2`;
  `includeTests: true` shows 3/3.
2. Implement; rerun; typecheck.

**Acceptance:** totals always match visible rows under either mode.

#### Task 1.6: Cycle/back-edge notes + transitive recursion

**Files:**
- Modify: `packages/core/src/navigation/query.ts` (`getGraphNeighbors` — emit back edges)
- Modify: `packages/mcp/src/core/navigation-handlers.ts` (surface `cycleDetected`,
  `backEdgeCount`, upgrade `recursionState`)
- Test: `packages/core/src/navigation/query.cycles.test.ts` (new)

**Interfaces:**
- Consumes: `visitedSymbolInstanceIds` (already returned).
- Produces: `cycleDetected: boolean`, `backEdges: Array<{from, to}>` when a visited node is
  re-reached; `recursionState: 'confirmed' | 'not_observed' | 'unknown'` upgraded from
  direct-self-loop-only to transitive (any back edge in the traversal).

**Steps:**
1. Failing test: A→B→A cycle at depth 2 → `cycleDetected: true`, `recursionState: 'confirmed'`.
2. Implement; rerun; typecheck.

**Acceptance:** cycles are reported, not silently skipped; recursionState covers transitive cycles.

**Phase 1 gate:** all six tasks green; `docs/evidence/call-graph-intelligence-<date>/`
recording before/after output diffs on a real repo (use `/home/hamza/repo/tradingview_ratio`).

---

### Phase 2 — Search operator + ranking upgrades (T1 #7–#8, T2 #18)

#### Task 2.1: `pattern:` regex operator

**Files:**
- Modify: `packages/mcp/src/core/search-query-planning.ts` (`SEARCH_OPERATOR_KEYS` add
  `pattern`; `ParsedSearchOperators` add `pattern?: string`)
- Modify: `packages/mcp/src/core/search-query-support.ts` (route `pattern:` to a
  regex-over-symbol-label/path filter reusing the symbol registry)
- Modify: `packages/mcp/src/core/search-execution.ts` (pattern lane; `pattern` + `lang`/
  `path:` compose)
- Modify: `packages/mcp/src/tools/search_codebase.ts` (schema description)
- Test: `packages/mcp/src/core/search-pattern-operator.test.ts` (new)

**Interfaces:**
- Consumes: `parseSearchOperators(query)` (existing), symbol registry label index
  (`buildSymbolRegistry` label lookup).
- Produces: `pattern: <regex>` operator — regex over `symbolLabel` (and optionally
  `relativePath`); invalid regex → structured `invalid_pattern` error (never silent);
  candidates pre-filtered before scoring (reuse exact-fast-path registry reads).

**Steps:**
1. Failing test: `pattern: ^handle.*Order` over a fixture registry returns only matching
  symbols; `pattern: [` returns the structured invalid-regex error; `pattern:` combined with
  `lang: python` intersects correctly.
2. Implement operator key + filter lane; escape semantics consistent with existing operators
  (`\:` escape).
3. Rerun; typecheck; update tool description + operator docs in `search-query-planning.ts`.

**Acceptance:** regex operator works across scopes; invalid regex never 0-matches silently
(cbm's #282/#283 lesson).

#### Task 2.2: Structural label boosting in final score

**Files:**
- Modify: `packages/mcp/src/core/search-ranking-policy.ts` (add `labelMultiplier` term)
- Modify: `packages/mcp/src/core/search-execution.ts` (compute label multiplier from
  result symbol kind)
- Test: `packages/mcp/src/core/search-ranking-policy.label-boost.test.ts` (new)

**Interfaces:**
- Consumes: `computeSearchCandidateFinalScore(input: {fusionScore, lexicalScore,
  pathMultiplier, changedFilesMultiplier, agentFitMultiplier, entrypointOwnerScoreBoost})`.
- Produces: additive `labelBoost ∈ {1.0 function/method, 0.8 route/endpoint-kind (future),
  0.5 type-likes, 0 noise (File/Folder/Variable demoted)}` applied as
  `score = base × (1 + labelBoost × 0.05)` — a bounded, evidence-recorded constant; keep the
  exact formula in one exported constant object for evals.

**Steps:**
1. Failing test: same lexical score, a `function`-kind result ranks above a `variable`-kind
  result; boost is bounded (≤ 5% relative).
2. Implement; rerun; run `evals/search-quality` before/after to confirm no regression
  (`pnpm --filter @zokizuan/satori-mcp exec node evals/search-quality/run.ts`).

**Acceptance:** deterministic label-aware ordering with bounded effect; eval delta recorded
in `docs/evidence/`.

#### Task 2.3: Call-graph centrality multiplier

**Files:**
- Modify: `packages/mcp/src/core/search-ranking-policy.ts` (optional `centralityMultiplier`)
- Modify: `packages/mcp/src/core/search-execution.ts` (load inbound CALLS count from
  relationship sidecar when `graph:"ready"`)
- Test: `packages/mcp/src/core/search-centrality.test.ts` (new)

**Interfaces:**
- Consumes: `GetRelationshipsForFileInput`/`getGraphNeighbors`-style inbound counts; the
  `navigation.graph="ready"` gate (`buildSearchGraphNavigation`, `search-response-helpers.ts`).
- Produces: `centralityMultiplier ∈ [1.0, 1.15]` from `log1p(inboundCallerCount)` scaled;
  applied only when graph is ready; `reason: 'inbound_centrality'` surfaced in debug.

**Steps:**
1. Failing test: symbol with 40 callers outranks an otherwise-identical symbol with 1 caller
  within the bound; multiplier caps at 1.15; absent graph → 1.0.
2. Implement (bounded, evidence-recorded constant); rerun; record search-quality eval delta.

**Acceptance:** centrality is a bounded tiebreak, never a rewrite of ranking; debug exposes reason.

**Phase 2 gate:** search-quality eval deltas recorded; no agent-facing freshness contract regressions.

---

### Phase 3 — Index-time symbol metadata (T1 #9–#11, T2 #15)

#### Task 3.1: Persisted complexity metrics (M0 decision gate)

**Files (implementation — after M0):**
- Modify: `packages/core/src/language-analysis/` (compute metrics in oxc/tree-sitter adapters:
  one AST walk — cyclomatic, cognitive, loop_count, loop_depth, max_access_depth, param_count)
- Modify: `packages/core/src/symbols/contracts.ts` (`SymbolRecord` + optional
  `analysis?: { complexity, cognitive, loopCount, loopDepth, maxAccessDepth, paramCount }`)
- Modify: `packages/core/src/symbols/registry.ts` + sidecar versions (registry schema bump —
  must follow the sidecar versioning discipline of `symbol_registry_v3`)
- Modify: `packages/core/src/relationships/builder.ts` (transitive_loop_depth propagation
  along CALLS — memoized DFS, 3-state cycle detection, cap 256, cbm `pass_complexity.c`)
- Modify: `packages/mcp/src/core/registry-file-outline.ts` (surface metrics in
  `detail=analysis` for all supported languages)
- Test: `packages/core/src/language-analysis/complexity.test.ts` (new)

**Interfaces:**
- Consumes: `analyzeIndexedFile()` → `LanguageAnalysisResult` (symbols already carry spans);
  `PERSISTED_SYMBOL_ANALYSIS_METADATA_PLAN.md` M0 decision (Option A on-demand Python vs
  Option B persisted).
- Produces: `SymbolAnalysis` persisted per symbol; `transitiveLoopDepth` on callable symbols;
  all metrics **optional** — they must not change symbol keys, instance IDs, canonical
  identity, or base publication (the invariant from `PERSISTED_SYMBOL_ANALYSIS_METADATA_PLAN.md` §2).

**M0 gate (required before implementation):** record a dated decision in
`docs/evidence/complexity-persistence-m0-<date>/` comparing (a) on-demand per-language
compute vs (b) persisted index-time metrics — evaluate cold/repeated latency, parser
availability, determinism, memory, offline behavior, source/publication binding, schema
version coupling, and invalidation. Default recommendation: persisted (Option B) with
metrics carried as optional contribution fields, matching cbm's "gated emission"
discipline (cbm emits zero-avoiding lean props: `{complexity, lines, is_exported, is_test,
is_entry_point}` on non-callables — see `pass_definitions.c:254-266`).

**Steps (post-M0):**
1. Failing tests per metric with hand-computed fixtures (branching, nesting, member chains).
2. Implement per-language metric walk; populate `analysis`; propagate transitive depth.
3. Surface in `file_outline detail=analysis`; extend `search` debug fields.
4. Rerun; `pnpm typecheck`; full core test suite.

**Acceptance:** metrics deterministic, optional, versioned; no identity/publication change;
Python path matches the existing on-demand implementation's numbers on shared fixtures.

#### Task 3.2: Env-access extraction

**Files:**
- Create: `packages/core/src/language-analysis/env-access.ts` (per-language allowlists:
  Python `os.getenv`/`os.environ.get`; JS/TS `process.env`; Go `os.Getenv`; Rust `std::env::var`;
  Java `System.getenv`; C/C++ `getenv` — cbm `extract_env_accesses.c` + `lang_specs.c` allowlists)
- Modify: `packages/core/src/language-analysis/service.ts` (wire into analysis result)
- Modify: `packages/core/src/symbols/contracts.ts` (`envAccesses?: Array<{ key: string, file, line }>`)
- Test: `packages/core/src/language-analysis/env-access.test.ts` (new)

**Interfaces:**
- Consumes: `LanguageAnalysisResult` (moduleBindings/callSites already provide callee identity).
- Produces: `envAccesses` per file; key = first string arg (unquoted) or member access;
  `MIN_ENV_NAME_LEN = 2` guard (cbm rule).

**Steps:**
1. Failing tests per language fixture.
2. Implement; rerun; typecheck.

**Acceptance:** config↔code queryable; deterministic output; no impact on other analysis.

#### Task 3.3: Per-file index coverage report

**Files:**
- Modify: `packages/core/src/core/indexing-pipeline.ts` (record per-file outcome:
  `indexed | parse_partial (with line ranges) | skipped | not_indexed_by_ignore`)
- Modify: `packages/core/src/core/persisted-index-authority.ts` (marker extension:
  coverage digest — version bump discipline required)
- Modify: `packages/mcp/src/tools/manage_index.ts` (`detail: 'coverage'` projection on `status`)
- Modify: `packages/mcp/src/core/manage-indexing-handlers.ts`
- Test: `packages/mcp/src/core/index-coverage.test.ts` (new)

**Interfaces:**
- Consumes: `IndexingPipeline` per-file outcomes; ignore-rule service.
- Produces: coverage report classes (cbm taxonomy): `parse_partial` (indexed, constructs in
  listed 1-based line ranges may be missing), `skipped` (not indexed), `not_indexed`
  (**by-design** exclusions via .satoriignore/.gitignore — "deliberate, not failures");
  caps (128 entries/class) + `truncated` flags; plain-language caveat: "best-effort, not a
  completeness guarantee".

**Steps:**
1. Failing test: fixture with an ignored dir + a partially-parseable file → report classes
  correct, caps honored.
2. Implement; rerun; update `status` description.

**Acceptance:** agents can verify negative search results against coverage (cbm's trust model).

#### Task 3.4: list_codebases metadata enrichment

**Files:**
- Modify: `packages/mcp/src/tools/list_codebases.ts`
- Test: `packages/mcp/src/core/list-codebases-metadata.test.ts` (new)

**Interfaces:**
- Consumes: snapshot manager + git context (already captured in index policy documents).
- Produces: per-entry `{ branch, headSha, isWorktree, canonicalRoot, symbolCount, relationshipCount }`
  when available; missing git metadata → omitted fields, never invented.

**Steps:**
1. Failing test for field presence/absence rules.
2. Implement; rerun.

**Acceptance:** parity with cbm `list_projects` metadata shape, honest omission otherwise.

**Phase 3 gate:** coverage + complexity recorded in `docs/evidence/`; marker/sidecar version
bumps documented per repo discipline.

---

### Phase 4 — Graph-intelligence tools (T2 #14, #17, #19; T1 #12, #13)

#### Task 4.1: `detect_changes` blast-radius tool

**Files:**
- Create: `packages/mcp/src/tools/detect_changes.ts` (schema: `path`, `baseBranch?` default
  `main`, `since?` alias, `scope: 'files'|'impact'` default `impact`, `direction:
  'inbound'|'outbound'|'both'` default `inbound`, `depth` default 2 max 5, `limit` default 200)
- Create: `packages/mcp/src/core/detect-changes.ts` (git diff sources + seed selection + closure)
- Modify: `packages/mcp/src/core/navigation-handlers.ts` (register tool)
- Test: `packages/mcp/src/core/detect-changes.test.ts` (new)

**Interfaces:**
- Consumes: git CLI via the repo's existing git-context/validation discipline (cbm uses
  contained shell subprocess with `cbm_validate_shell_arg`; satori must reuse its own
  root-bound/git-context code — verify location, `packages/core/src/core/` git module);
  relationship store (`getGraphNeighbors` multi-seed = repeat calls or a new
  `getGraphNeighborsMulti` in `navigation/query.ts`).
- Produces (cbm output contract): `base`, `mergeBase` SHAs; `changedFiles`; `seedSymbols`;
  impacted rows `{name, label, hop}`; exact `impactedTotal`; `impactedModules` rollup
  (2-segment path quotient, cap 256 + `(other)`); `truncated` + hints.
  Rules (cbm): seeds = definitions whose span overlaps a hunk (`git diff --unified=0` line
  ranges, cap 4096, fallback whole-file on cap); container labels never seeds; changed-file
  reached from another changed file not double-counted; seeds excluded from impacted.

**Steps:**
1. Failing tests: (a) hunk-scoped seed selection — one-line edit seeds one function, not the
  whole file; (b) blast radius correctness on a fixture graph with known callers; (c)
  `impactedTotal` exact with `limit` truncation; (d) shell-injection guard on `baseBranch`
  (leading `-` rejected — cbm rule).
2. Implement git-diff collection (3 sources: committed vs merge-base, unstaged, untracked —
  cbm `mcp.c:10121`), seed selection, closure.
3. Rerun; typecheck; add tool to `packages/mcp/src/tools/index.ts` registry.

**Acceptance:** matches cbm's blast-radius contract on a shared fixture repo;
`impactedTotal` always exact.

#### Task 4.2: Dead-code/orphan detection tool

**Files:**
- Create: `packages/mcp/src/tools/dead_code.ts` (`path`, `scope?: 'file'|'root'`,
  `includeTests?` default false, `limit`)
- Create: `packages/mcp/src/core/dead-code.ts`
- Test: `packages/mcp/src/core/dead-code.test.ts` (new)

**Interfaces:**
- Consumes: symbol registry + relationship sidecar (inbound CALLS/REFERENCES counts; TESTS
  records; `exported` flag — note: `exported` is currently **declared but never populated**;
  task must first populate it in extractors, or rely on export relationships).
- Produces: orphan symbols = `no inbound CALLS/REFERENCES ∧ not exported ∧ not test-referenced`;
  rows with file/line; `orphanTotal` exact; honest caveat text (advisory, per-file
  suppression possible).

**Steps:**
1. Failing tests on fixture with known orphan + false-positive guards (exported, entrypoint,
  test-referenced).
2. Populate `exported` in extractors (small, prerequisite); implement query.
3. Rerun; typecheck.

**Acceptance:** no false positives on exported/entry/test-referenced symbols in fixture.

#### Task 4.3: Schema introspection tool

**Files:**
- Create: `packages/mcp/src/tools/get_graph_schema.ts`
- Modify: `packages/mcp/src/core/navigation-handlers.ts`
- Test: `packages/mcp/src/core/graph-schema.test.ts` (new)

**Interfaces:**
- Produces: `{ relationshipTypes, confidenceValues, resolutionAuthorities, symbolKinds,
  manifestIdentities: { symbolRegistryManifestHash, relationshipManifestHash, sealHash } }`
  filtered to agent-obtainable fields (cbm blocks internal similarity intermediates via
  `sg_field_blocked`, `mcp.c:2615`).

**Steps:**
1. Failing test asserting the exact shape.
2. Implement from navigation manifest + constants.
3. Rerun.

**Acceptance:** one-call agent self-orientation; no internal-only fields leak.

#### Task 4.4: MCP prompts + tool profiles + per-tool annotations

**Files:**
- Modify: `packages/mcp/src/server/` (initialize handler: server instructions + prompts
  capability `explore_codebase` / `review_change_impact`)
- Modify: `packages/mcp/src/tools/*` (per-tool `readOnly`/`destructive`/`idempotent`
  annotations in the McpTool type)
- Test: `packages/mcp/src/server/prompts-profiles.test.ts` (new)

**Interfaces:**
- Consumes: existing tools.
- Produces: `tools/list` profile filtering (`analysis` = read-only subset; `scout` = fast
  discovery subset: search_codebase, continue_search, call_graph, file_outline, read_file,
  list_codebases) + instructions text at initialize steering tool ordering and pagination.

**Steps:**
1. Failing test: profile filter returns only allowed tools; annotations present on all tools.
2. Implement; rerun.

**Acceptance:** hosts get guardrails; zero cost to existing flows.

#### Task 4.5 (T3): Bounded graph-query surface — `query_navigation`

**Files:**
- Create: `packages/mcp/src/tools/query_navigation.ts`
- Create: `packages/core/src/navigation/graph-query.ts` (parameterized, read-only)
- Test: `packages/mcp/src/core/query-navigation.test.ts` (new)

**Interfaces:**
- Consumes: SQLite navigation store (`navigation/sqlite.ts`).
- Produces: fixed vocabulary, NOT Cypher: `{ kind: 'callers-of'|'callees-of'|'unreachable-from-entrypoints'|'hot-path' (future), symbol?, depth?, limit }`; hard guards: read-only, `limit ≤ 1000`, 30s deadline, row ceiling — cbm's `CYPHER_RESULT_CEILING`/`CYPHER_DEADLINE_BUDGET_MS` pattern (`cypher.c:2792,2797`).

**Steps:**
1. Failing tests per kind.
2. Implement over the store; register tool.

**Acceptance:** covers architecture/dead-code/global queries without a query language.

**Phase 4 gate:** tools documented in README tool table; `detect_changes` cross-checked
against cbm on the same fixture repo (expected: equal impacted sets on a small repo).

---

### Phase 5 — Routes, then cross-repo (T2 #16 → T3 #26)

#### Task 5.1: Route extraction — TS/JS first (Express/Fastify/Next)

**Files:**
- Create: `packages/core/src/routes/` (owner module: `types.ts` — `RouteRecord {method,
  path, canonicalPath, handlerSymbolKey, framework, sourceSpan}`; `extract-ts-routes.ts`)
- Modify: `packages/core/src/language-analysis/` (route evidence from oxc: `app.get('/x',
  handler)`, `router.post(...)`, Next.js file-based `app/`/`pages/` routes)
- Modify: `packages/core/src/relationships/builder.ts` (new `ROUTES`/`HANDLES` relationship
  kinds — version bump per discipline)
- Modify: `packages/core/src/symbols/contracts.ts` (route symbol kind)
- Modify: `packages/mcp/src/core/search-response-helpers.ts` (`navigation.graph` hints for routes)
- Test: `packages/core/src/routes/extract-ts-routes.test.ts` (new)

**Interfaces:**
- Consumes: oxc analysis results (callSites + moduleBindings).
- Produces: `RouteRecord` with **canonicalPath** normalization — cbm rule: `:name`/`{name}`/
  `<name>`/`${name}` placeholders all collapse to `{}` (`pass_route_nodes.c` `cbm_route_canon_path`),
  param names discarded; method from callee name (`app.get` → GET); handlers resolved through
  moduleBindings.

**Steps:**
1. Failing tests: Express + Fastify + Next fixtures → routes, methods, canonical paths,
  handler binding.
2. Implement; rerun; typecheck.

**Acceptance:** route-aware queries possible (`HANDLES` inbound = "who calls this endpoint?").

#### Task 5.2: Route extraction — Python (FastAPI/Flask) + HTTP_CALLS edges

**Files:**
- Create: `packages/core/src/routes/extract-python-routes.ts`
- Modify: `packages/core/src/routes/` (shared canonicalizer)
- Modify: `packages/core/src/relationships/builder.ts` (HTTP_CALLS from HTTP-client call sites
  re-targeted to Route nodes — cbm `service_patterns.c` two-level matching: library
  identifier in resolved QN → edge kind; method suffix → verb)
- Test: `packages/core/src/routes/extract-python-routes.test.ts` (new)

**Steps:**
1. Failing tests: FastAPI decorators (`@app.get`), Flask (`@app.route`), client libs
  (`requests`/`httpx`/`aiohttp`) → HTTP_CALLS with `urlPath`.
2. Implement; rerun.

**Acceptance:** cross-service traceability within one repo (caller → route → handler).

#### Task 5.3 (T3): Cross-repo CROSS_* edges

**Files:**
- Create: `packages/core/src/relationships/cross-repo.ts` (matching pass)
- Modify: `packages/mcp/src/tools/manage_index.ts` (mode `cross-repo-intelligence` +
  `targetProjects` param)
- Test: `packages/core/src/relationships/cross-repo.test.ts` (new)

**Interfaces:**
- Consumes: `RouteRecord` canonical QNs from ≥2 codebases.
- Produces: `CROSS_HTTP_CALLS`/`CROSS_ASYNC_CALLS` (bidirectional writes, idempotent upsert,
  re-run deletes prior CROSS_* first — cbm `pass_cross_repo.c:210-211,656,738,818-830,1304-1316`);
  exact QN match → `ANY` method retry → fuzzy segment-wise template match (`/v2/orders/123`
  ↔ `/v2/orders/{}`); only routes with a real HANDLES edge qualify.

**Steps:**
1. Failing tests: two fixture repos with a matching route pair → edges in both stores; stale
  edges removed on re-run.
2. Implement; rerun.

**Acceptance:** multi-repo "who calls this service" answers with honest matching caveats.

**Phase 5 gate:** routes feature-flagged and documented as heuristic (never authoritative);
cross-repo mode opt-in per `index_repository` style.

---

### Phase 6 — Quality infrastructure (T2 #20–#23, #25)

#### Task 6.1: Seeded MCP-stdio fuzz with replay

**Files:**
- Create: `scripts/fuzz-mcp-stdio.mjs` (adversarial JSON-RPC sessions: malformed init,
  unknown tools, huge payloads, abrupt EOF; `--seed` log + replay)
- Modify: `ci.yml` (new job or step)
- Test: `scripts/fuzz-mcp-stdio.test.mjs` (self-test that the harness detects a planted crash)

**Steps:**
1. Self-test: harness must fail on a planted panic, pass on clean runtime.
2. Wire into CI (bounded runtime, e.g. 60s).
3. Run against the built mcp server; fix any crash found (separate tickets).

**Acceptance:** deterministic replay of every crash (cbm `CBM_FUZZ_SEED` pattern).

#### Task 6.2: No-skips test policy + step-0 contract gates

**Files:**
- Create: `scripts/check-no-test-skips.mjs` (forbid `it.skip`/`describe.skip`/`test.skip`/
  `.only` in committed `*.test.ts`/`*.test.mjs`; allow documented platform-gated patterns)
- Create: `scripts/test-contracts.mjs` (step-0 static gates: fixture contract, harness
  self-test, parity check)
- Modify: `ci.yml` (lint job)
- Test: `scripts/check-no-test-skips.test.mjs`

**Steps:**
1. Failing test: a file containing `.skip(` fails the gate.
2. Implement; clean existing skips (audit first — count and justify each).
3. Wire CI; rerun.

**Acceptance:** CI red on any new skip/only.

#### Task 6.3: Pin CI actions + least-privilege permissions

**Files:**
- Modify: `.github/workflows/ci.yml`, `.github/workflows/release.yml` (pin every action to
  full commit SHA with `# vX.Y.Z` comment; default `permissions: contents: read`; scoped
  writes only where required)

**Steps:**
1. Enumerate actions; pin all.
2. Verify workflows still run (dry-run).

**Acceptance:** no unpinned `@v4`-style tags remain; permissions explicit.

#### Task 6.4: Bug-repro corpus with RED/GREEN controls

**Files:**
- Create: `repro/` at repo root (`repro_issue_<N>.ts` per historical bug, RED reproduction +
  GREEN control; `repro_harness.ts`)
- Modify: `package.json` (`test:repro` script)
- Test: `repro/repro_harness.test.ts`

**Steps:**
1. Migrate 3 known historical bugs (pick from git history of core) as the first corpus entries.
2. Wire `test:repro` into `ci.yml` as a non-gating informational lane (cbm keeps `make
  test-repro` out of the gating `make test`).

**Acceptance:** each repro fails on the pre-fix revision, passes on post-fix (verify via `git stash`/checkout in a worktree).

#### Task 6.5: Per-language fixture floors + dimension-tagged eval rubric

**Files:**
- Modify: `fixtures/` (per-language `min_symbols` floor contract — cbm `grammar_cases.h` + `min_defs`)
- Modify: `packages/core/src/language-analysis/service.test.ts` (floor enforcement)
- Modify: `evals/search-quality/` (tag questions D1 def/API discovery, D2 call graph, D3
  targeted retrieval, D4 architecture, D5 cross-cutting — cbm `docs/EVALUATION_PLAN.md`;
  PASS/PARTIAL/FAIL rubric + attempt counts)

**Steps:**
1. Add floors for the 8 native languages; failing test when a fixture drops below floor.
2. Tag existing eval questions; record attempt counts in results.

**Acceptance:** a silently-broken grammar fails CI; eval results carry rubric + attempts.

#### Task 6.6: llms.txt + benchmark docs

**Files:**
- Create: `docs/llms.txt` (tool list, capabilities, performance, distribution)
- Create: `docs/BENCHMARK.md` (dated methodology + results tables; **never** unverifiable claims)

**Steps:**
1. Draft from README + tool registry (generate, don't hand-maintain drift).
2. Add a CI check that llms.txt stays in sync with the tool registry (cbm's docs drift
  lesson: BENCHMARK referenced removed tools).

**Acceptance:** docs match the tool registry at CI time.

**Phase 6 gate:** all CI gates green; zero new skips; fuzz replay documented.

---

## 7. Non-goals (explicitly out of scope)

1. **Porting the C engine, arenas, or RAM-first pipeline** — irrelevant to a TS runtime.
2. **A Cypher engine** — replaced by Task 4.5's bounded vocabulary.
3. **`ingest_traces`** — cbm's own is a stub; if runtime-trace enrichment is ever wanted,
   design it as `{caller, callee, count}` → edge-weight fusion with a real publication path.
4. **Algorithmic embeddings / RaBitQ / simhash clone edges as a priority** — satori has real
   embeddings incl. local Potion; SIMILAR_TO (#24) is deferred behind Phase 5.
5. **Graph UI** — low agent value; satori-landing exists.
6. **Copying cbm's unverifiable marketing claims** (benchmarks, test counts) — satori's
   evidence discipline (`docs/evidence/`) is the antidote, not a badge.
7. **`trace_path.parameter_name` dead-parameter pattern** — satori must never ship parsed-but-unused parameters; each new tool's params are exercised by tests.

## 8. Risks and open questions

- **Depth 6 performance** (Task 1.2): unbounded fan-out; mitigated by per-depth budget, but
  budget constants must be validated against `/home/hamza/repo/tradingview_ratio`-scale repos
  before shipping.
- **Centrality ranking** (2.3): risk of amplifying index bias; bounded at 1.15× and gated on
  `graph="ready"`, but eval deltas must be recorded before merge.
- **Route extraction quality** (Phase 5): framework-specific heuristics will over/under-match;
  feature-flag + honest description required; cross-repo matching inherits route errors.
- **`exported` population** (4.2 prerequisite): currently dead schema surface; populating it
  changes extractor output — must follow extractor-version bump discipline (`extractorVersion`
  is part of the fingerprint ⇒ reindex).
- **Complexity persistence** (3.1): the M0 gate must not re-litigate the existing
  on-demand Python decision; it extends the storage model to all languages.
- **Operational**: `/home/hamza/repo/satori` index currently `requires_reindex
  (navigation_recovery_failed)` — reindex must be authorized before Phase 2+ experiments use
  satori-on-satori.

## 9. Evidence index

| Claim | Where verified |
|---|---|
| cbm risk bands, totals/cursor contract, strategy classes | `/tmp/satori-review/cbm-trace-cross-service.md`; spot-check `src/store/store.c:4722` |
| cbm complexity + transitive propagation | `/tmp/satori-review/cbm-graph-schema.md`; spot-check `internal/cbm/helpers.c:599` |
| cbm detect_changes contract | `/tmp/satori-review/cbm-ops.md`; spot-check `src/mcp/mcp.c:10121` |
| cbm routes/cross-repo | `/tmp/satori-review/cbm-trace-cross-service.md`, `cbm-hybrid-lsp.md` |
| cbm tests/CI discipline | `/tmp/satori-review/cbm-tests-ci.md` |
| satori call_graph/navigation internals | `/tmp/satori-review/satori-graph-navigation.md`; spot-check `packages/mcp/src/tools/call_graph.ts`, `packages/core/src/navigation/query.ts:498` |
| satori search pipeline | `/tmp/satori-review/satori-search.md`; spot-check `search-ranking-policy.ts:392`, `search-query-planning.ts:169` |
| satori ops/receipts/evals | `/tmp/satori-review/satori-ops-tests.md` |
| satori indexing/freshness/symbols | `/tmp/satori-review/satori-core-index.md` |

---

*End of plan. Phases are gated and independent; nothing in this document authorizes
implementation. Each phase requires its own authorization before execution.*
