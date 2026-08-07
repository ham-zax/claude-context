# Native reranker ordering

Status: approved implementation design for the post-correction master.

The search pipeline has one relevance authority at each stage:

```text
retrieval union -> deterministic eligibility -> exact boundary -> reranker order
-> grouping/disclosure -> frozen pagination
```

Deterministic filters, permissions, freshness/publication checks, exact ownership,
candidate/byte ceilings, timeout handling, transactional failure fallback, and
continuation binding remain product contracts. A reranker may only reorder admitted
candidates. Its complete validated provider sequence is authoritative for the
selected slots. `relevanceScore` is retained only for bounded diagnostics and is
never blended, calibrated, thresholded, or converted to a local ranking score.

When no reranker is configured or a reranker attempt fails, the exact pre-reranker
retrieval order is published. A provider response is applied transactionally: any
missing, duplicate, foreign, out-of-range, incomplete, malformed, or non-finite
result discards the whole response. Exact-owned rank one remains fixed; a sole exact
result skips the provider and an exact-owned suffix may be reranked.

The implementation must not depend on Ranking V3 plans, registries, receipts,
task graphs, training data, grading, qualification artifacts, or cross-repository
quality gates.
