# Contributing to @zokizuan/claude-context-mcp

Thanks for contributing to the Claude Context MCP server.

## Current Tool Surface (v1.0.0+)

Only these tools are supported:

- `manage_index` (`action`: `create | sync | status | clear`)
- `search_codebase`
- `read_file`
- `list_codebases`

Legacy tool names from pre-1.0 are intentionally removed.

## Quick Commands

```bash
# Build MCP server
pnpm build:mcp

# Watch mode
pnpm dev:mcp

# Start server
pnpm --filter @zokizuan/claude-context-mcp start

# Typecheck
pnpm --filter @zokizuan/claude-context-mcp typecheck

# Unit tests
pnpm --filter @zokizuan/claude-context-mcp test

# Check README tool docs are in sync
pnpm --filter @zokizuan/claude-context-mcp docs:check
```

`pnpm --filter @zokizuan/claude-context-mcp build` already runs docs generation.

## Development Notes

- Keep routing and exposure capability-driven (no direct env checks in handlers).
- Keep tool schemas canonical in `src/tools/*` Zod definitions and generate JSON Schema from them.
- Keep snapshot format at `v3` with fingerprints.
- Preserve strict train-in-the-error messages for reindex requirements.
- Do not reintroduce compatibility aliases for removed tools.
- Keep `search_codebase` telemetry as structured stderr JSON (`event=search_executed`).
- Keep `read_file` range semantics as 1-based inclusive (`start_line`/`end_line`) with deterministic truncation hints when capped by `READ_FILE_MAX_LINES`.
