# @zokizuan/satori-mcp

MCP server for Satori.
Satori means "sudden insight"; this package turns core indexing/search into agent-safe MCP actions.

Maintained by: `ham-zax` (`@zokizuan`).

## Breaking Change (v1.0.0)

Tool surface is now hard-broken to 4 tools only:

- `manage_index`
- `search_codebase`
- `read_file`
- `list_codebases`

Removed tools from pre-1.0 releases are no longer routed.

## Features

- Capability-driven execution via `CapabilityResolver`.
- Unified `search_codebase` flow with optional reranker override:
  - `useReranker=true`: force rerank (errors if capability missing)
  - `useReranker=false`: disable rerank
  - `useReranker` omitted: auto behavior by capability/profile
- Snapshot `v3` safety with index fingerprints and strict `requires_reindex` access gates.
- Deterministic train-in-the-error responses for incompatible or legacy index states.
- Query-time exclusion support with `.gitignore`-style matching.
- Structured search telemetry logs (`[TELEMETRY]` JSON to `stderr`).
- Zod-first tool schemas converted to MCP JSON Schema for `ListTools`.
- Auto-generated tool docs in this README from live tool schemas.
- `read_file` line-range retrieval with default large-file truncation guard.
- Optional proactive sync watcher mode (debounced filesystem events).
- Index-time AST scope breadcrumbs (TS/JS/Python) rendered in search output as `🧬 Scope`.
- Fingerprint schema bump to `dense_v2`/`hybrid_v2` with strict reindex gate for legacy `*_v1` indexes.

## Architecture Evolution

### Before (pre-v1.0.0)

- Monolithic routing and execution concentrated in `index.ts` + `handlers.ts`.
- Redundant tool surface (9 tools) increased agent/tool-selection ambiguity.
- Inline JSON schemas and docs drift risk.
- Environment checks leaked across runtime paths.
- Snapshot state lacked robust fingerprint protection for model/provider changes.

### After (v1.0.0+)

- Lightweight bootstrap in `index.ts` with registry-based tool routing.
- Hard-break 4-tool surface optimized for agent cognition.
- Modular tool execution in `src/tools/*.ts` with a shared `ToolContext`.
- Zod schemas as canonical source, converted to JSON Schema at runtime.
- Snapshot `v3` + fingerprint compatibility gates for safe multi-provider usage.
- Deterministic train-in-the-error messages for self-healing agent loops.
- Search observability via structured telemetry.
- `read_file` upgraded for context-density control (ranges + truncation guard).

### Architectural Shape (Current)

```text
[MCP Client]
    -> [index.ts bootstrap + ListTools/CallTool]
    -> [tool registry]
    -> [manage_index | search_codebase | read_file | list_codebases]
    -> [ToolContext DI]
       -> [CapabilityResolver]
       -> [SnapshotManager v3 + access gate]
       -> [Context / Vector store / Embedding / Reranker adapters]
```

## Phase Summary

- Phase 1 (state safety + API hard break):
  - 9 tools -> 4 tools
  - capability-driven behavior
  - snapshot `v3` with index fingerprinting and strict reindex gating
- Phase 2 (modularization + observability):
  - tool registry and modular `src/tools/*`
  - Zod-first schemas and generated docs
  - structured search telemetry
- Phase 3 (context density):
  - `read_file` line-range semantics
  - safe clamping for out-of-range requests
  - `READ_FILE_MAX_LINES` truncation and continuation hints
- Phase 5A (advanced context density, search-first):
  - index-time AST breadcrumbs stored in chunk metadata (`breadcrumbs`)
  - `search_codebase` scope rendering (`🧬 Scope: outer > inner`) across standard and rerank views
  - fingerprint schema version bump to `*_v2` requiring reindex for `*_v1` snapshots

## read_file Behavior

- Supports optional `start_line` and `end_line` (1-based, inclusive).
- When no range is provided and file length exceeds `READ_FILE_MAX_LINES` (default `1000`), output is truncated and includes a continuation hint with `path` and next `start_line`.

## Proactive Sync (Optional)

- Enabled by default. Set `MCP_ENABLE_WATCHER=false` to disable.
- Debounce window via `MCP_WATCH_DEBOUNCE_MS` (default `5000`).
- Watch events reuse the same incremental sync pipeline (`reindexByChange`) and keep `manage_index(action="sync")` as explicit fallback.
- Safety gates:
  - watch-triggered sync only runs for `indexed`/`sync_completed` codebases.
  - events are dropped for `indexing`, `indexfailed`, and `requires_reindex`.
  - ignored/hidden paths are excluded to avoid watcher explosion (`node_modules`, `.git`, build artifacts, dotfiles).
- On shutdown (`SIGINT`/`SIGTERM`), watchers are explicitly closed.

## Future Plan

### 1) Agent Context Density

- Add optional `read_file` paging ergonomics beyond current line ranges (for very large files/workflows).
- Explore syntax-aware snippet shaping in `search_codebase` so results preserve function/class boundaries more reliably.

### 2) Proactive Sync

- Introduce optional filesystem watching with debounce for near-real-time incremental indexing.
- Keep manual `manage_index(action="sync")` as explicit fallback.

### 3) Provider Expansion

- Extend reranker adapters (for example, Cohere) behind the same capability model.
- Evaluate local vector-store adapters to support fully offline deployments.

### 4) Observability Productization

- Expand telemetry consumption into a local stats/report workflow (latency, reranker utilization, filter/drop rates).
- Keep CI fast with deterministic unit/in-memory tests; run provider-backed integration checks on scheduled/manual workflows.

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

Read file content from the local filesystem, with optional 1-based inclusive line ranges and safe truncation.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `path` | string | yes |  | ABSOLUTE path to the file. |
| `start_line` | integer | no |  | Optional start line (1-based, inclusive). |
| `end_line` | integer | no |  | Optional end line (1-based, inclusive). |

### `list_codebases`

List tracked codebases and their indexing state.

No parameters.


<!-- TOOLS_END -->

## Run Locally

```bash
pnpm --filter @zokizuan/satori-mcp start
```

## Example MCP Configuration

```json
{
  "mcpServers": {
    "satori": {
      "command": "npx",
      "args": ["@zokizuan/satori-mcp@latest"],
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
pnpm --filter @zokizuan/satori-mcp build
pnpm --filter @zokizuan/satori-mcp typecheck
pnpm --filter @zokizuan/satori-mcp test
pnpm --filter @zokizuan/satori-mcp docs:check
```

`build` automatically runs docs generation from tool schemas.
