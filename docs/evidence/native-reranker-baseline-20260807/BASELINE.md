# Native reranker baseline

Captured against the corrected `master` before implementation.

## Repository identity

```text
base commit: 013b0b10aecabbf7ede9f6bbb79a76b0d74593c1
base tree:   7201cc2251d55ccdc396a7af4d6ce78c7a47f20b
branch:      master
tracked worktree: clean
pre-existing untracked user file: 2026-08-07-satori-native-reranker-ordering.md
```

The untracked plan file is user-provided input and is intentionally not part of the
implementation baseline or any implementation commit.

## Current relevance-opinion inventory

The current production owner is `packages/mcp/src/core/search-execution.ts`, called
by `runSearchExecution`.

| Symbol or constant | Baseline behavior |
| --- | --- |
| `SCOPE_PATH_MULTIPLIERS` | Converts path categories into numeric relevance multipliers. |
| `SEARCH_CHANGED_FIRST_MULTIPLIER` | Multiplies candidates associated with changed files. |
| `SEARCH_RERANK_RRF_K` / `SEARCH_RERANK_WEIGHT` | Converts provider rank into `1 / (10 + rank)` and adds it to `fusionScore`. |
| `computeSearchCandidateFinalScore` | Multiplies fusion, path, changed-file, agent-fit, and lexical/owner components into `finalScore`. |
| `resolveAgentFitMultiplier` | Applies intent, symbol-role, path, and writer-owner relevance values. |
| `resolveEntrypointOwnerScoreComponent` | Adds a bounded entrypoint-owner relevance component. |
| `scoreCandidateLexicalEvidence` | Returns numeric lexical evidence consumed by candidate scoring and diagnostics. |
| `rerankSearchCandidates` | Validates only result indices, mutates selected candidates with fixed RRF arithmetic, then invokes the legacy score path. |
| `computeSearchGroupScore` | Adds a bounded support boost to a representative score. |
| `sortGroupedSearchResults` | Sorts by score and applies near-tie symbol-kind/declaration/span preferences. |

## Contracts preserved by the replacement

- `must:`, `exclude:`, `lang:`, and `path:` eligibility filtering;
- exact registry and exact identifier/symbol ownership;
- source freshness, fingerprints, publication authority, and workspace authorization;
- reranker selection, provider limits, document and UTF-8 byte ceilings;
- timeouts, cancellation, queue/capacity fallback, and failure diagnostics;
- immutable ranked-set identity, disclosure, pagination, and continuation revalidation;
- grouping, duplicate declaration collapse, and diversity as order-preserving stages.

## Ranking V3 status

The tracked Ranking V3 plan is historical documentation only. It has no runtime,
dispatch, registry, receipt, corpus, experiment, or release-gate authority. No V3
artifact is copied into this implementation.

## Baseline verification

```text
node --import tsx --test \
  packages/mcp/src/core/search-execution.exact-pin-rerank.test.ts \
  packages/mcp/src/core/search-group-ordering.test.ts \
  packages/mcp/src/core/search-ranking-policy.test.ts \
  packages/mcp/src/core/search-rerank-document.test.ts \
  packages/mcp/src/core/search-rerank-document-v2.test.ts \
  packages/mcp/src/core/search-rerank-projection.test.ts \
  packages/mcp/src/core/search-result-set-identity.test.ts
pnpm exec tsc --noEmit -p packages/mcp/tsconfig.json
pnpm exec tsc --noEmit -p packages/cli/tsconfig.json
pnpm diff --check
```

Result: focused tests 29/29 passed; MCP and CLI type checks passed; diff check
passed. The `pnpm diff --check` line above denotes the equivalent executed command
`git diff --check`.
