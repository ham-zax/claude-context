# Satori

Satori means "sudden insight." This project applies that idea to code retrieval: high-signal answers, safe state handling, and predictable agent workflows.

Satori is a semantic code indexing system focused on two runtime packages:

- `@zokizuan/satori-core`: indexing, chunking, embeddings, vector storage, and incremental sync
- `@zokizuan/satori-mcp`: MCP server surface for agent tools (`manage_index`, `search_codebase`, `read_file`, `list_codebases`)

This repository intentionally excludes UI extensions and evaluation sidecars. It is optimized for production MCP + core workflows.

Maintainer: `ham-zax` (`@zokizuan`).

## Why Satori

- Insight-first retrieval, not raw chunk dumping.
- Safe-by-default index access via fingerprints and reindex gates.
- Agent-native tool design with a small deterministic MCP surface.

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
- Non-AST files (for example Markdown/HTML) remain searchable when indexed and not ignored; they do not emit `🧬 Scope`.
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

## MCP Quickstart (Published Package)

Use this for first-time setup (recommended for non-dev users).

1. Add `satori` to your MCP config with `npx`.
2. Set `startup_timeout_ms` / `timeout` to `180000` for cold starts.
3. Add provider + Milvus env vars.
4. Restart MCP client and call `list_codebases`.

JSON-style example:

```json
{
  "mcpServers": {
    "satori": {
      "command": "npx",
      "args": ["-y", "@zokizuan/satori-mcp@1.0.2"],
      "timeout": 180000,
      "env": {
        "EMBEDDING_PROVIDER": "VoyageAI",
        "EMBEDDING_MODEL": "voyage-4-large",
        "EMBEDDING_OUTPUT_DIMENSION": "1024",
        "VOYAGEAI_API_KEY": "your-api-key",
        "VOYAGEAI_RERANKER_MODEL": "rerank-2.5",
        "MILVUS_ADDRESS": "your-milvus-endpoint",
        "MILVUS_TOKEN": "your-milvus-token"
      }
    }
  }
}
```

TOML-style example:

```toml
[mcp_servers.satori]
command = "npx"
args = ["-y", "@zokizuan/satori-mcp@1.0.2"]
startup_timeout_ms = 180000
env = { EMBEDDING_PROVIDER = "VoyageAI", EMBEDDING_MODEL = "voyage-4-large", EMBEDDING_OUTPUT_DIMENSION = "1024", VOYAGEAI_API_KEY = "your-api-key", VOYAGEAI_RERANKER_MODEL = "rerank-2.5", MILVUS_ADDRESS = "your-milvus-endpoint", MILVUS_TOKEN = "your-milvus-token" }
```

For package-specific docs and local dev config, see `packages/mcp/README.md`.

### Startup Troubleshooting (`initialize response` closed)

If your MCP client reports startup/handshake failure:

1. Pin a published version in config (for example `@zokizuan/satori-mcp@1.0.2`).
2. Use a larger startup timeout for cold starts (`180000` recommended).
3. Remove local link shadowing so `npx` resolves the published package:
   - `npm unlink -g @zokizuan/satori-mcp`
   - `npm unlink @zokizuan/satori-mcp` (inside project repo if linked)
4. Restart MCP client after config changes.

## Release

```bash
pnpm release:core
pnpm release:mcp
```

## License

MIT

---
*Note: This project was inspired by the [Zilliz Claude Context](https://github.com/zilliztech/claude-context) project.*
