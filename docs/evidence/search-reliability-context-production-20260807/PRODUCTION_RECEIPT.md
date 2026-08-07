# Production Receipt: Search Reliability + Reranker Context v3 Rollout

Date: 2026-08-07. Plan: `docs/plans/2026-08-07-satori-search-reliability-reranker-context-master-plan.md`.

## Commits

- Base commit: `15cb77f` (Task 0, `docs(search): record reliability and context baseline`).
- Final commit: the commit containing this receipt, `docs(search): seal focused reranker context rollout` (Task 15).

Task commit list (sequential):

| Task | Commit | Message |
|---|---|---|
| 0 | `15cb77f` | docs(search): record reliability and context baseline |
| 1 | `bc3b0ae` | fix(potion): repair trusted helper execute permission |
| 2 | `600f5d0` | test(release): exercise packed Potion runtime |
| 3 | `45d666e` | fix(runtime): scope mutation ownership to backend authority |
| 4 | `45e75dd` | fix(search): bound cold-start readiness retry |
| 5 | `4368477` | feat(rerank): expose qualified deadline diagnostics |
| 6 | `3202426` | refactor(rerank): expose projection failure reasons |
| 7 | `2e2d035` | fix(rerank): skip unprojectable candidates safely |
| 8 | `6f64ceb` | feat(rerank): expose bounded input provenance |
| 9 | `fb60e35` | feat(search): classify requested answer focus |
| 10 | `512e809` | feat(search): classify factual candidate roles |
| 11 | `81801eb` | feat(rerank): preserve exact question with answer focus |
| 12 | `36b5296` | feat(rerank): add factual document projection v3 |
| 13 | `e9774a0` | feat(search): send focused question context to reranker |
| 14 | `3b4fff8` | feat(lateon): activate focused projection v3 profile |
| 15 | (this commit) | docs(search): seal focused reranker context rollout |

## Projection and profile identities

- Rerank query projection: `search_rerank_query_v1` — exact question sent once, plus a
  deterministic answer focus (`implementation` / `tests` / `documentation` / `neutral`)
  and factual `candidate_role` context. No score multipliers, ranking weights, or
  artifact-type preferences are encoded anywhere in the projection.
- Rerank document projection: `search_rerank_document_v3`;
  `projectionSha256 = 54b5436e86337b2c356a7d8ecf698a2d7b833349230098826e4b02c16d779a83`
  (SHA-256 of the `packages/mcp/src/core/search-rerank-document-v3.ts` source at receipt time).
- Default LateOn profile: `lateon_offline_quality_projection_v3_d32_v1` (depth 32).
  Frozen profile file digest `a78906862ee684828354edb0449f15b4c0024c973368b0e03536db70770a88af`
  is bound by `FROZEN_LATEON_D32_PROFILE_SHA256` and the acquisition manifest
  `packages/mcp/assets/lateon/runtime-profile-v3-d32.acquisition.json`.
- Explicit legacy selections remain available and are never substituted:
  `lateon_offline_quality_projection_v2_d32_v2`, `lateon_projection_v2_d16_v1`,
  `lateon_projection_v1_d16_legacy`. LateOn request/stage deadlines were never increased.

## Warning semantics

- `RERANKER_INPUT_DEGRADED` — some candidates failed typed projection; they were skipped
  and counted, and the reranker ran on the remaining documents.
- `RERANKER_SKIPPED_INPUT` — every candidate failed projection; the provider was never
  called; retrieval order is published. This is never reported as `RERANKER_FAILED`.
- `RERANKER_FAILED` — provider call or parse failure after retries (including timeout).
  Terminal rerank execution reports qualified diagnostics: attempts, retries, timeouts,
  effective deadline, observed wall time, deadline lateness.
- Full-debug (`debugMode=full`) candidate survival records per-document rerank input
  provenance — UTF-8 bytes, SHA-256, candidate role, projection identities — never source text.

## Verification (exact commands and results)

Run from repository root unless noted. All runs used the production builds (tsx for TS
test execution, compiled dist for CLI/release smoke).

1. E2E scenario suite:
   `node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 packages/mcp/src/core/search-reliability-context.e2e.test.ts`
   → tests 8, pass 8, fail 0 (Scenarios A–H).
2. Focused matrix (`search-rerank-projection.test.ts`, `search-native-rerank.integration.test.ts`,
   `search-rerank-context.integration.test.ts`, `search-reliability-context.e2e.test.ts`,
   `search-frontdoor.test.ts`, `runtime-owner.test.ts`, `lateon-reranker.test.ts`):
   tests 98, pass 98, fail 0.
3. Package and repository verification:
   - `pnpm --filter @zokizuan/satori-mcp test` → exit 0, tests 1417, pass 1417, fail 0.
     One intermediate rerun showed a single timing flake
     (`shared-runtime-host.test.ts` "private socket host keeps MCP sessions independent
     and shares one runtime owner"); it passes in isolation and in the final full run.
   - `pnpm --filter @zokizuan/satori-cli test` → final exit 0, tests 339, pass 339, fail 0.
     The first run exposed two rollout regressions in `packages/cli/src/install.test.ts`
     (owner registry moved from `~/.satori/runtime/` to `<stateRoot>/runtime-owner/` in
     Task 3; `shared-runtime-identity.js` gained a `lateon-reranker-protocol.js` import in
     Task 14). Both tests were updated in this task; one timing-sensitive launcher test
     (`preserves time for cooperative shutdown`) flaked once under suite concurrency and
     passes in isolation and in the final full run.
   - `pnpm --filter @zokizuan/satori-core test` → exit 1, tests 675, pass 672, fail 2.
     Isolated rerun of the two failing files: tests 20, pass 19, fail 1 — the only
     reproducible failure is `src/net/fetch-with-deadline.test.ts`
     "retries a listed retryable network error up to maxAttempts", a pre-existing
     environmental failure already recorded in the Task 5 execution-log entry
     (ECONNREFUSED is not retried in this environment). The
     `milvus-restful-http.test.ts` file-level crash was a transient test-runner
     deserialization artifact, not an assertion failure. No packages/core source was
     modified by this rollout.
   - `pnpm test:scripts` → exit 1, tests 337, pass 336, fail 1. The single failure is the
     pre-existing stale eval pin `known-exact-target` (pinned span 189–604 vs current
     186–603 in `packages/mcp/src/core/search-exact-fast-path.ts`); both the pin and the
     source file are byte-identical to base `15cb77f`, so the failure predates this rollout.
   - `pnpm check` → exit 0 (after this task removed two unused variables introduced by the
     rollout: `packages/mcp/src/core/runtime-owner.ts` and
     `packages/mcp/src/core/search-rerank-context.integration.test.ts`).
   - `pnpm build` → exit 0.
   - `pnpm -C packages/mcp release:smoke` → exit 0 (packed Potion runtime exercised).
   - `pnpm --filter @zokizuan/satori-mcp typecheck` → exit 0.
4. Static prohibition checks (both exit 1 = zero matches):
   - `git grep -n -E 'SEARCH_RERANK_RRF_K|SEARCH_RERANK_WEIGHT|SCOPE_PATH_MULTIPLIERS|SEARCH_AGENT_FIT_|SEARCH_CHANGED_FIRST_MULTIPLIER' -- packages`
   - `git grep -n -E 'candidateRole.*multiplier|answerFocus.*weight|test.*0\.65|docs.*0\.45' -- packages`

## Confirmations

- No comparative quality evaluation, judging, or tuning was run during this rollout.
  Context v3 inputs were verified structurally (exact question once, deterministic focus,
  factual roles, no numeric weights), not by ranking-quality measurement.
- Provider order remains final: Satori applies the reranker's published order without
  ranking weights, score multipliers, or global artifact-type penalties. Automatic
  fallback to retrieval order happens only on reranker failure or skipped input, with the
  warning distinctions above.
- LateOn deadlines were never increased; operator overrides may only reduce them.
