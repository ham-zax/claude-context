# Track I compact result index qualification receipt

**Terminal outcome:** `compact_result_index_qualified`

**Date:** 2026-08-04

## Authority

```text
I0 authority
    docs/evidence/deep-result-index-i0-20260804/I0_AUTHORITY_RECEIPT.md

implementation revision
    20b7f7ca7837536688e04578cd003c59b27ee514

implementation tree
    f1f60be17da3126ebac40c8355df699f6d195fb8

held-out evidence opened
    false

production activation authorized
    false
```

Track I did not rerun retrieval, reranking, indexing, or any Track L model
experiment. It qualified one optional response projection over the already
frozen grouped order.

## Qualified contract

`search_codebase` accepts:

```text
includeResultIndex?: boolean
default false
valid only when resultMode="grouped"
```

When requested and admissible, the initial response exposes
`search_result_index_v1` as an exact prefix of the frozen ranked groups. Each
entry contains only its 1-based rank, canonical symbol/file target,
repository-relative file, existing display label, and one bounded evidence
label. It contains no source, preview, score, internal path, generated summary,
or separately computed order.

Frozen bounds are:

```text
maximum frozen groups       200
maximum index entries       200
maximum index UTF-8 bytes   32,768
normal response bytes       131,072
```

The complete response and index are measured independently. Admission stops
only between complete entries, preserves full-result membership/order and the
initial disclosure count, and reports truthful available/returned counts.

Continuation pages echo the initial `rankedSetDigest`, omit `resultIndex`, and
reuse the cached ranked set. A cache-admission failure removes both the handle
and index. An exact-registry response without a proven vector/source binding
remains usable but omits the index and reports
`SEARCH_RESULT_INDEX_NOT_ADMISSIBLE`; it does not manufacture a digest.

## Verification

```text
pnpm --filter @zokizuan/satori-mcp typecheck
    passed

node --import tsx --test \
  packages/mcp/src/core/search-result-index.test.ts \
  packages/mcp/src/core/search-exact-registry-hit.test.ts \
  packages/mcp/src/core/search-response-helpers.test.ts \
  packages/mcp/src/tools/search_codebase.test.ts
    35 passed, 0 failed

node --import tsx --import ./packages/mcp/src/test-state-root.ts \
  --test --test-concurrency=1 \
  --test-name-pattern='handleSearchCode exact registry fast path returns a grouped symbol despite watcher maintenance failure|search continuation preserves deterministic and LateOn-ranked grouped order without recomputation' \
  packages/mcp/src/core/handlers.scope.test.ts
    2 passed, 0 failed

pnpm --filter @zokizuan/satori-mcp docs:check
    passed

pnpm --filter @zokizuan/satori-mcp manifest:check
    passed

git diff --check
    passed
```

The focused evidence proves:

1. omission preserves the default response contract;
2. raw-mode requests reject the option;
3. entries preserve exact frozen order and canonical group identity;
4. count, UTF-8, and total-response bounds truncate only between entries;
5. index admission never changes the disclosed full-result page;
6. LateOn-ranked pagination preserves exact neural order and performs zero
   additional reranker or retrieval calls;
7. fusion and exact-registry routes either bind the same authority or fail
   closed without inventing one; and
8. cache-admission failure never exposes an unusable index.

## Decision

Track I is qualified as optional compact navigation metadata. This is not an
agent-utility claim and does not activate LateOn or any production policy.

Together with:

```text
Track P  pagination_complete_frozen_set_qualified
Track L  baseline_b_retained
Track I  compact_result_index_qualified
```

every authorized track in the deep reranking and paginated disclosure plan now
has a terminal receipt. Held-out evaluation and production activation remain
closed.
