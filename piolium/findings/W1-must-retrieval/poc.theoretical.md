---
id: W1
---

# Theoretical reproducer

Reproducer: search-query-planning / search-execution regression test where the only file matching must:"replace(tzinfo=None)" lies beyond the normal top-N lexical pool; assert the file is recovered and MUST_NOT_SATISFIED_WITHIN_RETRIEVAL_BUDGET / MUST_RESULTS_MAY_BE_INCOMPLETE_WITHIN_RETRIEVAL_BUDGET notes fire correctly. Red before Task 1, green after.
