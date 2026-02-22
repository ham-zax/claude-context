# Contributing

## Scope

This repository is intentionally scoped to:

- `packages/core`: semantic indexing engine
- `packages/mcp`: MCP server integration

Do not add UI extension packages or parallel product surfaces in this repo.

## Setup

```bash
pnpm install
```

## Common Commands

```bash
pnpm build
pnpm typecheck
pnpm lint
pnpm test:integration
```

## Architecture Guardrails

- Keep orchestration logic in `src/core/` modules.
- Keep provider/config code isolated from business flow.
- Keep indexing, search, and sync behavior testable without external services.
- Prefer small focused modules over monolithic handlers.

## Testing

Before opening a PR, run:

```bash
pnpm build
pnpm test:integration
```

Integration tests must continue to validate:

1. indexing works end-to-end
2. semantic search returns relevant snippets
3. incremental sync correctly handles add/modify/remove changes

## Pull Requests

- Keep PRs small and scoped.
- Include rationale for architecture-impacting changes.
- Avoid bundling unrelated refactors.

## License

By contributing, you agree your changes are released under the MIT license.
