---
id: W2
---

# Theoretical reproducer

Reproducer: voyageai-reranker regression tests with injected 503-then-success, both-attempts-503, fake-timer timeout >30s, and 401-no-retry; assert rerankerFailures/rerankerRetries/rerankerTimeouts diagnostics and rerankAdjusted===false on terminal failure. Red before Task 2, green after.
