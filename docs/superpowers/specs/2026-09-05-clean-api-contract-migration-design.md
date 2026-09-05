# Satori Clean API Contract Migration Design

## Goal

Remove stale compatibility freezes and prose-coupled tests that force Satori to preserve obsolete implementation details. Replace them with consumer-driven contracts that verify the package entrypoints and runtime behavior actually used by Satori's CLI/MCP stack.

## Problem

The current Core published-surface guard freezes exported names in `packages/core/contracts/published-surface.json`. Recent clean-break work intentionally changed first-party integration APIs, but the frozen snapshot still treated export drift as a failure even when the new exports are required by current MCP code. This creates pressure to restore compatibility declarations or update a broad fixture mechanically rather than validate the current architecture.

`manage_index` also contains tests that freeze old description wording and old provider-resolution behavior. Those tests can fail while the current runtime behavior is correct, particularly now that supervised sync and automatic managed-offline reindex changed lifecycle semantics.

Satori's own architecture simplification plan already states that the broad published-surface compatibility freeze should be removed or replaced with a deliberately small supported surface.

## Design

### 1. Remove the broad Core export snapshot

Delete:

- `packages/core/src/core/published-surface.ts`
- `packages/core/src/core/published-surface.test.ts`
- `packages/core/contracts/published-surface.json`

Do not create a replacement snapshot of every export.

### 2. Protect real consumers instead of export count/name snapshots

The supported package contract is defined by code that actually imports Satori Core:

- `@zokizuan/satori-core`
- `@zokizuan/satori-core/integration`
- other declared package subpath exports such as `/semantic` and `/lancedb`

Workspace typecheck/build must prove MCP and CLI imports still compile. Add a small package-entrypoint smoke test only where it adds evidence not already supplied by normal build/typecheck. The smoke test should import representative supported symbols and verify the built package subpaths resolve; it should not enumerate every export.

Extra internal exports do not fail the guard. Removing or changing an export fails naturally when a real consumer or focused entrypoint test relies on it.

### 3. Clean `manage_index` tests around behavior

Keep tests that protect user-visible semantics:

- public action schema including `cancel`;
- `operationId` requirements for cancel;
- absolute-path/workspace authorization;
- status detail behavior;
- provider/backend diagnostic envelopes;
- current supervised sync behavior;
- current automatic managed-offline reindex wording/semantics where the description is used as an MCP product contract.

Remove or rewrite assertions that protect stale implementation/prose details:

- exact old action-list strings that omit `cancel`;
- exact prose from the pre-supervised-sync description;
- assumptions that `sync` eagerly resolves an embedding/vector provider context before entering the handler;
- registry tests that duplicate large chunks of `manage_index` description prose rather than assert durable behavior.

Description tests may assert a few durable concepts, not a historical paragraph.

### 4. Do not restore compatibility behavior

Do not re-export old/deleted names merely to satisfy compatibility fixtures. Do not reintroduce eager provider routing for sync. Do not reintroduce manual-reindex-first UX for managed offline runtimes.

### 5. Verification and local product exercise

Before integration:

- Core tests pass;
- MCP tests pass;
- repository `pnpm check` passes (existing warnings allowed only if exit code is zero);
- MCP generated docs check passes;
- `git diff --check` passes;
- local package build succeeds.

Then exercise the local workspace build, not the published `npx @zokizuan/satori-cli@latest` install, against multiple repositories under `/home/hamza/repo`. Use the repository's local-install/dev scripts or direct local CLI build/entrypoint so the test cannot accidentally execute the published package. For each selected repository:

1. bind/install the local MCP runtime or run the local CLI/MCP entrypoint;
2. create/index the repository if needed;
3. run representative searches;
4. inspect an outline or exact source;
5. run at least one relationship/navigation query on a supported language when applicable;
6. observe status/freshness/maintenance behavior;
7. record concrete successes and any limitations.

Prefer repositories with different sizes/languages so this is a product exercise rather than one happy-path fixture.

## Git integration

Carry the existing approved productization and automatic-maintenance repair on a feature branch, commit the complete verified tree, merge it back to `master`, rerun a final verification gate on merged `master`, and push `master` to `origin` without force.

## Success criteria

- No broad `published-surface.json` compatibility freeze remains.
- No production export is restored solely for the deleted snapshot.
- `manage_index` tests assert current behavior rather than stale prose/routing.
- Full Core and MCP suites pass.
- Repository check/docs/diff gates pass.
- Local Satori is exercised successfully on multiple real repositories.
- Verified changes are committed, merged to `master`, and pushed to `origin/master`.
