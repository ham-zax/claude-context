# Native reranker production receipt

Date: 2026-08-07

This receipt seals the native reranker ordering rollout (plan:
`docs/superpowers/plans/2026-08-07-satori-native-reranker-ordering.md`,
historical). Baseline before implementation:
`013b0b10aecabbf7ede9f6bbb79a76b0d74593c1`.

## Production assertions

- Provider order is final after complete validation: a reranker response is
  validated in full (cardinality, duplicate/foreign/out-of-range indexes,
  non-finite scores, identity completeness) on detached state before any
  candidate is mutated, then applied only to the selected slots.
- Raw provider scores are bounded diagnostics only; they are never blended,
  calibrated, thresholded, or used in any ordering arithmetic.
- An exact-owned rank-1 prefix is immutable; a sole exact result skips the
  provider; only the eligible suffix is reranked.
- No partial provider response can be observed: any malformed, incomplete,
  duplicated, foreign, or non-finite response discards the whole attempt.
- No local relevance multiplier or reranker RRF remains:
  `SEARCH_RERANK_RRF_K`, `SEARCH_RERANK_WEIGHT`, `SCOPE_PATH_MULTIPLIERS`,
  `SEARCH_CHANGED_FIRST_MULTIPLIER`, agent-fit multipliers, entrypoint-owner
  score boost, group support boost, near-tie preferences, and numeric lexical
  weights are deleted from production ranking authority. Path classification,
  exact lexical detection, and must/exclude matching remain for eligibility
  and diagnostics.
- A missing or unconfigured reranker means retrieval order
  (`search_native_retrieval_order_v1`).
- Any reranker failure (timeout, thrown error, invalid output, projection
  failure) publishes the exact frozen pre-rerank retrieval order with
  truthful `RERANKER_FAILED` diagnostics. If the byte budget admits zero
  candidates, no provider attempt happens, retrieval order is published, and
  no `RERANKER_FAILED` warning is emitted.
- Grouping, diversity, disclosure, and frozen pagination preserve the
  authoritative order; continuation serves the frozen ranked set and performs
  zero new reranker calls, relevance decisions, or sorts.
- The retired `SATORI_RERANK_APPLICATION_MODE` variable fails clearly at MCP
  configuration, CLI doctor, and the shared-runtime attach boundary instead
  of being silently ignored.
- No cross-repository quality threshold, MRR, or Owner@k metric was used as a
  release gate. No smoke repositories were run as gates.

## Static removal checks

```bash
git grep -n 'SEARCH_RERANK_RRF_K\|SEARCH_RERANK_WEIGHT\|SCOPE_PATH_MULTIPLIERS\|SEARCH_CHANGED_FIRST_MULTIPLIER\|SEARCH_AGENT_FIT_\|SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST' -- packages scripts
git grep -n 'lexicalWeight' -- packages scripts
git grep -n 'legacy_rrf' -- packages scripts README.md
```

Result: no active production references. Remaining hits are the archived
historical tooling under `scripts/archive/ranking-v3/` (unwired from
`package.json`), one negative assertion
(`'lexicalWeight' in plan === false`), and the deliberate loud-rejection
messages/tests for the retired variable.

## Verification evidence

Focused native-order contracts (all exit 0):

```text
node --import tsx --test \
  packages/mcp/src/core/search-native-rerank.test.ts \
  packages/mcp/src/core/search-rerank-boundary.test.ts \
  packages/mcp/src/core/search-retrieval-order.test.ts \
  packages/mcp/src/core/search-order-policy.test.ts \
  packages/mcp/src/core/search-group-ordering.test.ts \
  packages/mcp/src/core/search-group-results.ownership.test.ts \
  packages/mcp/src/core/search-result-set-identity.test.ts \
  packages/mcp/src/core/search-native-rerank.integration.test.ts
# 43 + 12 integration cases: 55 pass, 0 fail

node --import tsx --test \
  packages/mcp/src/core/search-execution*.test.ts \
  packages/mcp/src/core/search-group*.test.ts \
  packages/mcp/src/core/search-ranking-policy.test.ts \
  packages/mcp/src/core/search-lexical-scoring.test.ts \
  packages/mcp/src/core/search-query-planning.test.ts \
  packages/mcp/src/core/search-query-support.test.ts \
  packages/mcp/src/core/search-candidate-survival.test.ts
# 60 pass, 0 fail

node --import tsx --test \
  packages/mcp/src/core/search-rerank-document.test.ts \
  packages/mcp/src/core/search-rerank-document-v2.test.ts \
  packages/mcp/src/core/search-rerank-projection.test.ts
# 8 pass, 0 fail
```

Negative proof for the shared-runtime attach rejection: with the rejection
temporarily removed, the stale-variable attach test hangs because the client
silently attaches to the live host (test timeout, cancelled 1); with the
rejection restored the same test passes in ~17 ms and records zero host
sessions.

Package/build checks:

```text
pnpm --filter @zokizuan/satori-core test   # 672 pass, 1 skipped, 0 fail
pnpm --filter @zokizuan/satori-cli test    # 339 pass, 0 fail
pnpm --filter @zokizuan/satori-mcp test    # see count recorded below
pnpm exec tsc --noEmit -p packages/mcp/tsconfig.json   # exit 0
pnpm exec tsc --noEmit -p packages/cli/tsconfig.json   # exit 0
```

MCP full suite result: 1307 pass, 0 fail, 0 skipped, exit 0.

## Process deviations

The rollout deviated from the plan's staged-release discipline. These are
recorded here instead of being covered by fabricated retroactive stage
receipts:

- The plan defined three releases (opt-in, native default, legacy removal),
  each with its own receipt and verification. All three were executed in a
  single session with no independent release verification between stages, so
  no Release-1 opt-in receipt exists; this receipt attests only to the final
  state.
- Plan Task 4 (projection contract tests) was skipped during execution and
  backfilled afterwards in commit `67d9049`
  (`test(search): freeze reranker projection contracts`), which adds the
  ranking-field-absence, line-ceiling, canonical-path, and fail-closed
  projection cases listed above.
- Commit `ae381f9` (`test(search): cover native reranker production
  contracts`) also carried production deletions; its test-only label
  understates that diff.

## Externally blocked verification

Live provider-backed end-to-end reranking (real Voyage/LateOn credentials and
hardware) was not executed in this environment. The production integration
path is proven instead by hermetic provider fakes in
`search-native-rerank.integration.test.ts` and the continuation contracts in
`handlers.scope.test.ts`, which exercise the same public execution path. This
is the only externally blocked verification; it does not change the code
state above.
