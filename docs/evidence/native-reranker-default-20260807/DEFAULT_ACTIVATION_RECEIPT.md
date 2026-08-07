# Native reranker default activation receipt

Date: 2026-08-07

The native reranker order is the only ranking authority. The
`SATORI_RERANK_APPLICATION_MODE` variable and the `legacy_rrf` application
branch have been removed; if the variable is still present, CLI and MCP
configuration checks fail loudly with a rollback instruction instead of
silently ignoring it.

Verification performed for this activation:

- MCP configuration rejects a present `SATORI_RERANK_APPLICATION_MODE`.
- CLI runtime configuration reports a `rerank_application_mode` error for a
  present `SATORI_RERANK_APPLICATION_MODE`.
- Native execution tests prove provider order and retrieval-order fallback.
- Grouping and diversity preserve the accepted provider order.

The exact activation commit is recorded by git history for this repository.
