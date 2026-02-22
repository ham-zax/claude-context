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
```

## Development Notes

- Keep routing and exposure capability-driven (no direct env checks in handlers).
- Keep snapshot format at `v3` with fingerprints.
- Preserve strict train-in-the-error messages for reindex requirements.
- Do not reintroduce compatibility aliases for removed tools.
