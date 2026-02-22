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

<!-- TOOLS_START -->

## Tool Reference

### `manage_index`

Manage index lifecycle operations (create/sync/status/clear) for a codebase path.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `action` | enum("create", "sync", "status", "clear") | yes |  | Required operation to run. |
| `path` | string | yes |  | ABSOLUTE path to the target codebase. |
| `force` | boolean | no |  | Only for action='create'. Force rebuild from scratch. |
| `splitter` | enum("ast", "langchain") | no |  | Only for action='create'. Code splitter strategy. |
| `customExtensions` | array<string> | no |  | Only for action='create'. Additional file extensions to include. |
| `ignorePatterns` | array<string> | no |  | Only for action='create'. Additional ignore patterns to apply. |

### `search_codebase`

Unified semantic search tool. Supports optional reranking and query-time excludes. Reranker is available. If useReranker is omitted, reranking is enabled automatically for fast/standard profiles.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `path` | string | yes |  | ABSOLUTE path to an indexed codebase or subdirectory. |
| `query` | string | yes |  | Natural-language query. |
| `limit` | integer | no | `50` | Maximum results to return. |
| `extensionFilter` | array<string> | no | `[]` | Optional file-extension filter (e.g. ['.ts','.py']). |
| `useIgnoreFiles` | boolean | no | `true` | Apply repo ignore files at search-time. |
| `excludePatterns` | array<string> | no | `[]` | Optional query-time exclude patterns. |
| `returnRaw` | boolean | no | `false` | Return machine-readable JSON results. |
| `showScores` | boolean | no | `false` | Include similarity scores in formatted output. |
| `useReranker` | boolean | no |  | Optional override: true=force rerank, false=disable rerank, omitted=resolver default. |

### `read_file`

Read full content of a file from the local filesystem.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `path` | string | yes |  | ABSOLUTE path to the file. |

### `list_codebases`

List tracked codebases and their indexing state.

No parameters.


<!-- TOOLS_END -->

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
pnpm --filter @zokizuan/claude-context-mcp docs:generate
pnpm --filter @zokizuan/claude-context-mcp docs:check
```
