# Native reranker default activation receipt

Date: 2026-08-07

The missing `SATORI_RERANK_APPLICATION_MODE` value now resolves to
`native_order`. Explicit `legacy_rrf` remains available only as the temporary
rollback path until the legacy application branch is removed.

Verification performed for this activation:

- MCP configuration default and strict parsing tests pass.
- CLI runtime configuration default and strict parsing tests pass.
- Shared-runtime identity differs when the explicit mode changes.
- Native execution tests prove provider order and retrieval-order fallback.

The exact activation commit is recorded by git history for this repository.
