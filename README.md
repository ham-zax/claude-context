# Satori

Satori is a semantic code indexing system focused on two runtime packages:

- `@zokizuan/satori-core`: indexing, chunking, embeddings, vector storage, and incremental sync
- `@zokizuan/satori-mcp`: MCP server surface for agent tools (`manage_index`, `search_codebase`, `read_file`, `list_codebases`)

This repository intentionally excludes UI extensions and evaluation sidecars. It is optimized for production MCP + core workflows.

Maintainer: `ham-zax` (`@zokizuan`).

## Key Features

- Hard-break MCP API with exactly 4 tools: `manage_index`, `search_codebase`, `read_file`, `list_codebases`.
- Capability-driven runtime behavior (no direct env checks in tool handlers).
- Unified `search_codebase` with optional reranker override and automatic reranking when omitted on fast/standard profiles.
- Snapshot `v3` with index fingerprints (`provider`, `model`, `dimension`, `vector store`, `schema`) to prevent incompatible-query corruption.
- Strict lazy access gate that transitions incompatible/legacy entries to `requires_reindex` with deterministic train-in-the-error guidance.
- Structured telemetry for search operations (`event=search_executed`) with latency/results/reranker usage metrics.
- Zod-first tool schemas with JSON Schema generation for MCP exposure.
- Auto-generated MCP README tool docs from live schemas (`docs:generate` / `docs:check`).
- `read_file` context-density safeguards:
  - optional `start_line` / `end_line` (1-based, inclusive)
  - default auto-truncation for large files via `READ_FILE_MAX_LINES` (default `1000`)
  - deterministic continuation hints including `path` + next `start_line`
- Index-time AST breadcrumbs for TS/JS/Python chunks, surfaced in search output as `🧬 Scope: ...`.
- Fingerprint schema upgrade to `dense_v2`/`hybrid_v2`, with strict reindex gating for legacy `*_v1` indexes.
- Multi-provider embedding support (OpenAI, VoyageAI, Gemini, Ollama) with Milvus/Zilliz vector storage.
- Background sync worker for incremental refresh.

## MCP Behavior Model

- Tool exposure is fixed to the 4-tool surface and is routing-safe.
- Capability resolver controls reranker behavior and profile-aware defaults.
- Access to stale/incompatible indexes is blocked with explicit recovery instructions:
  - `manage_index` with `action="create"` and `force=true`.
- Error messages are designed for agent correction (train-in-the-error), not generic failures.

## Repository Layout

```text
packages/
  core/
    src/
      core/
      config/
      embedding/
      splitter/
      sync/
      vectordb/
  mcp/
    src/
      core/
      config.ts
      embedding.ts
      index.ts
      utils.ts
tests/
  integration/
```

## Requirements

- Node.js >= 20 and < 24
- pnpm >= 10
- Milvus/Zilliz endpoint and token (for real deployments)
- Embedding provider credentials (OpenAI/VoyageAI/Gemini/Ollama)

## Install

```bash
pnpm install
```

## Build

```bash
pnpm build
```

## Integration Tests

```bash
pnpm test:integration
```

The integration tests validate:

1. end-to-end indexing
2. semantic retrieval
3. incremental sync add/modify/remove behavior

## Run MCP Server (local)

```bash
pnpm --filter @zokizuan/satori-mcp start
```

Key environment variables:

- `EMBEDDING_PROVIDER`
- `EMBEDDING_MODEL`
- `EMBEDDING_OUTPUT_DIMENSION` (VoyageAI supported: `256 | 512 | 1024 | 2048`)
- `OPENAI_API_KEY` / `VOYAGEAI_API_KEY` / `GEMINI_API_KEY`
- `MILVUS_ADDRESS`
- `MILVUS_TOKEN`
- `VOYAGEAI_RERANKER_MODEL` (optional)
- `READ_FILE_MAX_LINES` (optional, default `1000`)
- `MCP_ENABLE_WATCHER` (optional, default `true`)
- `MCP_WATCH_DEBOUNCE_MS` (optional, default `5000`)

## Release

```bash
pnpm release:core
pnpm release:mcp
```

## License

MIT

---
*Note: This project was inspired by the [Zilliz Claude Context](https://github.com/zilliztech/claude-context) project.*
