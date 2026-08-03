# Track I compact result index authority receipt

**Status:** `authority_frozen_implementation_unopened`

**Date:** 2026-08-04

## Source authority

```text
source revision
    111865e948e5ac5cf53814e7b5b0c6f2635ece9c

source tree
    6ae82f8ef51a81134063dc804cfb67bfba4f0e61

authority plan
    docs/plans/SATORI_DEEP_LATEON_RERANKING_AND_PAGINATED_DISCLOSURE_PLAN.md

authority plan SHA-256
    fb548a4e75430588b630799ed42a606b321a23c7d6dedb4cff9589b2da56c2be
```

The earlier `compact_result_index_deferred` receipt is superseded only for
Track I. Track P remains qualified, Track L remains `baseline_b_retained`, and
held-out evidence and production activation remain closed.

## Public request contract

```text
search_codebase.includeResultIndex?: boolean
default false
valid only when resultMode="grouped"
```

When false or omitted, response membership, order, bytes, and fields remain
unchanged.

## Initial response contract

An admitted index is returned only on the initial grouped response:

```text
resultIndex.contractVersion          "search_result_index_v1"
resultIndex.rankedSetDigest          exact frozen ranked-set digest
resultIndex.disclosurePolicyVersion  "search_disclosure_v1"
resultIndex.availableEntryCount      final frozen group count
resultIndex.returnedEntryCount       emitted prefix length
resultIndex.complete                 returnedEntryCount == availableEntryCount
resultIndex.entries                  exact prefix of final frozen group order
```

Each entry contains only:

```text
rank                 1-based final frozen rank
kind                 "symbol" or "file"
target.file          repository-relative path
target.symbolId      canonical symbol instance ID for symbol groups only
displayLabel         existing public group label
evidenceLabel        one bounded deterministic label
```

Allowed evidence labels, in precedence order, are:

```text
high_owner_confidence
medium_owner_confidence
high_semantic_confidence
medium_semantic_confidence
ranked_candidate
```

The index contains no preview/source excerpt, score, internal path, generated
summary, model output, or independently computed order. A structured target is
the canonical group identity and must match exactly one full group in the same
frozen result set.

## Frozen bounds

```text
MAX_RESULT_INDEX_ENTRIES     200
MAX_RESULT_INDEX_UTF8_BYTES  32,768
normal grouped response      131,072 bytes
```

The entry limit equals `SEARCH_MAX_FROZEN_RESULTS`; the index can describe the
complete bounded set but cannot expand it. The index byte limit is one quarter
of the existing normal grouped-response budget. Both the index serialization
and the complete initial response must satisfy their respective UTF-8 limits.

The index is built only after the full-result page is frozen. It never removes,
truncates, or reorders a full result group to make room. Entries are admitted in
rank order until the entry count, index byte budget, or remaining initial
response byte budget is exhausted. The emitted entries are therefore always an
exact prefix. Truncation returns `complete=false` with truthful available and
returned counts.

If even the empty index authority cannot fit after preserving the full-result
page, the response omits `resultIndex` and reports
`SEARCH_RESULT_INDEX_NOT_ADMISSIBLE`; the search result itself remains usable.

## Continuation contract

Continuation responses:

```text
echo the same rankedSetDigest
do not repeat resultIndex
perform zero additional embedding, retrieval, eligibility, grouping, or reranking
```

The initial index and every continuation page must resolve against one immutable
ranked-set binding. A cache-admission failure removes continuation and the index
together; it must not expose entries for groups that cannot be paged.

## Qualification gates

Track I may close as `compact_result_index_qualified` only if focused tests prove:

1. default-false byte and response identity;
2. grouped-only input validation;
3. exact prefix order and canonical identity resolution;
4. count and UTF-8 truncation with no partial entry;
5. the index never changes full-result membership, order, or disclosure count;
6. continuation echoes the digest, omits the index, and performs zero reranker calls;
7. exact-registry and fusion grouped routes obey the same contract;
8. cache-admission failure does not expose an unusable index.

No agent-utility claim is required for the optional field to exist. Product
documentation must describe it as compact navigation metadata, not evidence.
