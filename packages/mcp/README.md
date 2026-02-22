# @zokizuan/claude-context-mcp

MCP server for Claude Context.

Maintained by: `ham-zax` (`@zokizuan`).

## Breaking Change (v1.0.0)

Tool surface is now hard-broken to 4 tools only:

- `manage_index`
- `search_codebase`
- `read_file`
- `list_codebases`

Removed tools from pre-1.0 releases are no longer routed.

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
        "EMBEDDING_PROVIDER": "VoyageAI",
        "VOYAGEAI_API_KEY": "your-api-key",
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
pnpm --filter @zokizuan/claude-context-mcp test
```
