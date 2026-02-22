# @zokizuan/claude-context-mcp

MCP server for Claude Context.

Maintained by: `ham-zax` (`@zokizuan`).

This package exposes tools for indexing and semantic retrieval over local codebases.

## Core Tools

- `index_codebase`
- `search_code`
- `sync_codebase`
- `clear_index`
- `get_indexing_status`
- `list_indexed_codebases`
- `rerank_results`
- `search_and_rerank`
- `read_file`

## Run Locally

```bash
pnpm --filter @zokizuan/claude-context-mcp start
```

## Example MCP Configuration

```json
{
  "mcpServers": {
    "claude-context": {
      "command": "npx",
      "args": ["@zokizuan/claude-context-mcp@latest"],
      "env": {
        "EMBEDDING_PROVIDER": "OpenAI",
        "OPENAI_API_KEY": "your-api-key",
        "MILVUS_ADDRESS": "your-milvus-endpoint",
        "MILVUS_TOKEN": "your-milvus-token"
      }
    }
  }
}
```

## Development

```bash
pnpm --filter @zokizuan/claude-context-mcp build
pnpm --filter @zokizuan/claude-context-mcp typecheck
```
