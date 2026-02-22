# Claude Context

Claude Context is a semantic code indexing system focused on two runtime packages:

- `@zokizuan/claude-context-core`: indexing, chunking, embeddings, vector storage, and incremental sync
- `@zokizuan/claude-context-mcp`: MCP server surface for agent tools (`manage_index`, `search_codebase`, `read_file`, `list_codebases`)

This repository intentionally excludes UI extensions and evaluation sidecars. It is optimized for production MCP + core workflows.

Maintainer: `ham-zax` (`@zokizuan`).

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
pnpm --filter @zokizuan/claude-context-mcp start
```

Key environment variables:

- `EMBEDDING_PROVIDER`
- `EMBEDDING_MODEL`
- `OPENAI_API_KEY` / `VOYAGEAI_API_KEY` / `GEMINI_API_KEY`
- `MILVUS_ADDRESS`
- `MILVUS_TOKEN`
- `VOYAGEAI_RERANKER_MODEL` (optional)

## Release

```bash
pnpm release:core
pnpm release:mcp
```

## License

MIT

---
*Note: This project was inspired by the [Zilliz Claude Context](https://github.com/zilliztech/claude-context) project.*
