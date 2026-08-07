# Search Contracts + Focus-Aware Rerank v4 — Production Receipt

**Date:** 2026-08-08 · **Plan:** `docs/plans/2026-08-08-satori-search-contracts-focus-rerank-v4-master-plan.md`
**Review head:** `786dbe347d6a7605f9d053ca030f2a3820ff0767` (expected) — executed on `master`
**Sealed head:** `5c7a4583ebf76b4ffb51907733e972c5977970d7` (after Task 15 docs commit)
**Baseline:** `docs/evidence/search-contracts-focus-v4-baseline-20260808/BASELINE.md` (Task 0, `c87f8f5`)

## 1. Exact identities and counts

| Identity | Value |
|---|---|
| Activated LateOn profile | `lateon_offline_quality_projection_v4_d32_v1` (schema `satori_lateon_runtime_profile_v4`, qualification `owner_activated_operationally_qualified_not_held_out`) |
| Activation policy | `lateon_context_v4_d32_owner_default_v1` |
| Query projection | `search_rerank_query_v2` (positive-only) |
| Document projection | `search_rerank_document_v4` (answer packet, <= 4,000 UTF-8 bytes) |
| v4 projection source SHA-256 (O0 receipt convention) | `de52c67d3ce423ee0d063d9916b62d8197530cc593e0bbac37831246f93be33e` |
| Frozen v4 profile digest (acquisition authority) | `250d57c41d2f63d2302397a7ccc098918c43cb6c29874040e35aad34b283ac40` |
| Request-contract digest | `d5aa4a07e4f4251955e320c7a3f8f3ea4d1fdfbc22708a98a9cbdfab200c05f5` (binds query v1/v2, role, document v3/v4, structural-context policy, partial-projection semantics) |
| Relationship builder | `relationship-v10+python-cross-module-constructors+python-native-resolution-v1` |

Historical meanings remain immutable: `lateon_d32_owner_default_v1` = projection-v2 D32 only;
`lateon_offline_quality_projection_v3_d32_v1` = historical rollout artifact (never rewritten);
`lateon_context_v3_d32_owner_default_v1` = v3-d32-v2 only (previous managed default, migrated by `satori upgrade`).

## 2. Verification (15.4) — all exit 0

| Command | Result |
|---|---|
| `pnpm --filter @zokizuan/satori-core test` | 679 pass / 1 environment-gated skip (Potion helper absent) / 0 fail |
| `pnpm --filter @zokizuan/satori-mcp test` | 1481/1481 |
| `pnpm --filter @zokizuan/satori-cli test` | 342/342 |
| `pnpm test:scripts` | 337/337 |
| `pnpm check` (lint + typecheck + versions:check) | pass |
| `pnpm build` | pass |
| `pnpm -C packages/mcp release:smoke` | pass |
| `pnpm -C packages/cli release:smoke` | pass (packed closure 673,685,327 bytes; LateOn D32 v4 acquisition authority) |
| `pnpm --filter @zokizuan/satori-mcp typecheck` | pass |
| `git diff --check` | clean |
| `git status --short` | clean |

### 15.1 Pre-existing Core failure — fixed

`fetch-with-deadline.test.ts` "retries a listed retryable network error up to maxAttempts"
now injects a deterministic retryable failure (stub `globalThis.fetch` rejecting with a
listed `ECONNREFUSED` code) instead of relying on environment-dependent real-connection
classification. 16/16 green.

### 15.2 Stale script pins — repaired after pinning-script verification

`validateTaskKey` (evals/agent-discovery/run-opencode.mjs) verified the current source
anchors before updating:

| Task key | Old span | New span (verified) |
|---|---|---|
| `known-exact-target` (`runExactRegistryFastPath`) | 189–604 | 188–606 |
| `unknown-freshness-reuse` (`runSearchFrontDoor`) | 229–392 | 238–430 (shifted by Task 8) |
| `unknown-freshness-reuse` relation `freshnessDecisionPreservesAuthority` | 135–138 | 139–142 |

All task keys re-validated: 0 stale.

### 15.3 Mojibake

Byte scan confirms no committed UTF-8 corruption (only intentional pattern quotes in
plan/baseline docs).

## 3. Static prohibitions (15.5)

```text
! git grep -n -E 'SEARCH_RERANK_RRF_K|SEARCH_RERANK_WEIGHT|SCOPE_PATH_MULTIPLIERS|SEARCH_AGENT_FIT_|SEARCH_CHANGED_FIRST_MULTIPLIER' -- packages   -> zero matches
! git grep -n -E 'candidateRole.*multiplier|answerFocus.*weight|test.*0\.65|docs.*0\.45' -- packages                                     -> zero matches
```

## 4. F-1…F-8 acceptance gate (15.6, owner-frozen 3.5.1)

Run against the production build: the mapped contract suites (the same contracts the
original live repros exercise) plus the packed-closure release smokes on the built dist.

| Gate | Contract | Evidence | Outcome |
|---|---|---|---|
| F-1 `must:` bounded recall disclosure | Task 6 (`405388b`) | `search-execution.must-lane.test.ts` 10/10 + must handler tests; `hints.mustCoverage` five statuses, `MUST_RESULTS_MAY_BE_INCOMPLETE_WITHIN_RETRIEVAL_BUDGET` on every incomplete path | PASS |
| F-2 `path` hard subdirectory scope | Task 5 (`fa2676a`) | `search-requested-scope.test.ts` + scope handler tests (sibling disjoint pools, zero out-of-scope admission) | PASS |
| F-3 continuation bounded completion | Task 8 (`68a259b`) | `search-disclosure.test.ts` + pagination/omitted-beyond-limit envelope tests (`omittedBeyondLimitGroupCount`, `continuation:"complete"` = caller-bounded frozen set) | PASS |
| F-4 constructor callers after fresh reindex | Task 1 (`3a26a11`) | relationship builder `TradingCore.__init__` constructor-caller fixture 6/6; persisted-index-authority compatibility `requires_reindex` on `relationshipVersion`; call-graph suite 225/225 | PASS (fresh-build extraction; pre-fix sidecars invalidated) |
| F-5 typed projection vs provider failure | Task 7 (`66cb96b`) | `search-native-rerank.integration.test.ts` + envelope tests: `rerankerProjection` summary in ranking/full debug; warning details state "not a reranker provider failure" | PASS |
| F-6 deterministic `not_ready` retry contract | Task 8 (`68a259b`) | `search-frontdoor.test.ts` + `handlers.status.test.ts`: every indexing path carries `retryAfterMs: 2000` + `indexingOperation {action,phase,generation}` when known | PASS |
| F-7 serving generation authority | Task 9 (`5613b6c`) | call-graph `navigationAuthority` tests (receipt path + source-backed sealed-marker path) 225/225 incl. | PASS |
| F-8 aggregated exact-symbol validation | Task 10 (`121a4f5`/`d95d3a7`) | `symbol-context-public-contract.test.ts` + `read_file.test.ts`: all errors in one response at stable paths; 9 frozen wire-contract vectors unchanged | PASS |

## 5. Architecture freeze (3.5.5)

All 15 tasks are committed with the plan's exact messages and the final tree is clean.
The search/ranking architecture is declared frozen per §3.5.5; any later failure starts
as a specific incremental bug unless evidence proves an architectural contract is wrong.
