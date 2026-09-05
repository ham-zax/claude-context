# Clean API Contract Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove stale compatibility freezes and prose-coupled lifecycle tests, replace them with consumer-driven package/runtime contracts, then verify, integrate, push, and exercise the local Satori build on multiple real repositories.

**Architecture:** Delete the broad Core export snapshot machinery and let real workspace consumers plus focused package-entrypoint checks define the supported API. Rewrite `manage_index` tests to assert current schema/runtime semantics instead of historical description wording or eager provider routing. Preserve the already-approved automatic-maintenance and productization work, then validate the merged result and run local Satori against several repositories without using the published `npx ...@latest` binary.

**Tech Stack:** TypeScript, Node.js test runner, pnpm workspaces, static docs/site, Git, Satori CLI/MCP/Core packages.

**Spec:** `docs/superpowers/specs/2026-09-05-clean-api-contract-migration-design.md`

## Global Constraints

- Delete stale compatibility artifacts instead of restoring obsolete APIs.
- Preserve current supervised sync and automatic managed-offline reindex semantics.
- Keep `cancel` in the public `manage_index` action set.
- Do not reintroduce eager provider resolution for `sync` merely to satisfy an old test.
- Do not weaken real response/schema/backend diagnostics tests.
- Use the local workspace build for real-repository product testing; do not use `@zokizuan/satori-cli@latest` for that exercise.
- Push only after full fresh verification on the final integrated tree.

---

### Task 1: Remove the broad Core surface-freeze artifacts

**Files:**
- Delete: `packages/core/src/core/published-surface.ts`
- Delete: `packages/core/src/core/published-surface.test.ts`
- Delete: `packages/core/contracts/published-surface.json`
- Inspect/modify as needed: `packages/core/package.json`, Core tests/build configuration only if they explicitly reference the deleted files.

**Interfaces:**
- Consumes: declared package exports in `packages/core/package.json` and actual MCP/CLI imports.
- Produces: no broad export snapshot; build/typecheck becomes the primary consumer contract.

- [ ] **Step 1: Prove the stale guard is isolated**

Run:

```bash
rg -n "published-surface|PublishedSurfaceSnapshot|collectPublishedSurface" packages/core packages/mcp packages/cli tests
```

Expected: only the collector/test/fixture and historical documentation references, with no production runtime dependency.

- [ ] **Step 2: Delete the collector, test, and fixture**

Delete the three files exactly; do not add a replacement export-name snapshot.

- [ ] **Step 3: Run Core typecheck/build and Core tests**

Run:

```bash
pnpm --filter @zokizuan/satori-core build
pnpm --filter @zokizuan/satori-core test
```

Expected: both exit 0. If another current file references the deleted guard, remove that stale reference rather than restoring the guard.

---

### Task 2: Add/confirm consumer-driven package entrypoint coverage

**Files:**
- Inspect: `packages/core/package.json`
- Inspect: `packages/mcp/src/**`, `packages/cli/src/**`
- Inspect/modify if needed: `tests/integration/context.integration.test.mjs` or a focused Core package-entrypoint smoke test file.

**Interfaces:**
- Consumes: package exports `.`, `./integration`, `./semantic`, `./lancedb`.
- Produces: evidence that supported entrypoints resolve and representative public symbols remain usable without enumerating all exports.

- [ ] **Step 1: Map actual first-party consumers**

Run:

```bash
rg -n "@zokizuan/satori-core(/integration|/semantic|/lancedb)?" packages/mcp/src packages/cli/src tests
```

Expected: concrete imports from the declared entrypoints.

- [ ] **Step 2: Decide whether existing build/integration coverage is sufficient**

If `pnpm typecheck`, Core build, MCP build/tests, and existing integration tests already import every supported entrypoint used by first-party consumers, add no redundant snapshot test. If a declared supported subpath has no executable/import coverage, add one small smoke assertion that imports one representative symbol from that subpath.

- [ ] **Step 3: Run the focused entrypoint/integration proof**

Run the narrow test/build command that exercises any added/confirmed coverage, then rerun:

```bash
pnpm run typecheck
```

Expected: exit 0.

---

### Task 3: Migrate `manage_index` tests to current behavior

**Files:**
- Modify: `packages/mcp/src/tools/manage_index.test.ts`
- Modify: `packages/mcp/src/tools/registry.test.ts`
- Modify only if current description lacks durable concepts: `packages/mcp/src/tools/manage_index.ts`

**Interfaces:**
- Consumes: `MANAGE_INDEX_ACTIONS`, current `manage_index` schema, current supervised sync/provider routing, automatic managed-offline reindex semantics.
- Produces: tests that protect schema and behavior without freezing obsolete prose/routing.

- [ ] **Step 1: Keep action/schema tests current**

Assert the public action set is:

```ts
["create", "reindex", "sync", "status", "cancel", "clear"]
```

Keep validation that unknown actions fail and `cancel` requires `operationId`.

- [ ] **Step 2: Remove stale eager-provider assumptions for sync**

Tests for provider-runtime connection failures must exercise an operation that still requires eager provider acquisition (for example `reindex`) rather than expecting `sync` to call `providerRuntime.requireToolContext()` before its supervised handler path.

- [ ] **Step 3: Replace historical description regexes with durable concepts**

Keep only concise assertions that the description communicates:

```text
create/reindex/sync/status/cancel/clear
managed offline automatic reindex
explicit reindex recovery override
process-lifetime operation state
cancel operationId semantics
```

Do not assert exact historical paragraph fragments such as an old slash-separated list without `cancel` or old manual-reindex-first wording.

- [ ] **Step 4: Keep registry coverage non-duplicative**

`registry.test.ts` should prove the tool is registered and that critical product guidance exists, but should not duplicate the entire `manage_index` description contract. Remove obsolete ignore-remediation prose assertions if equivalent behavior is protected by focused tool tests/docs/runtime tests.

- [ ] **Step 5: Run focused tool tests**

Run:

```bash
pnpm --filter @zokizuan/satori-mcp exec node --import tsx --import ./src/test-state-root.ts --test --test-reporter=../../scripts/satori-test-reporter.mjs src/tools/manage_index.test.ts src/tools/registry.test.ts
```

Expected: exit 0.

---

### Task 4: Clear remaining repository gates without compatibility restoration

**Files:**
- Inspect/modify only if necessary: `packages/mcp/src/core/sync.ts`
- Modify docs/generated descriptions only if required by current docs contract.

**Interfaces:**
- Consumes: repository lint/typecheck/version/docs checks.
- Produces: CI-clean repository without unrelated architectural changes.

- [ ] **Step 1: Run repository check**

Run:

```bash
pnpm check
```

Expected: exit 0. Existing lint warnings may remain if the configured linter exits 0; errors must be resolved narrowly.

- [ ] **Step 2: If the known unused catch binding remains, remove only the unused binding**

For a construct like:

```ts
try {
    // ...
} catch (error) {
    // body does not use error
}
```

change only to:

```ts
try {
    // ...
} catch {
    // unchanged body
}
```

Then rerun the focused lint and `pnpm check`.

- [ ] **Step 3: Run generated docs and whitespace gates**

Run:

```bash
pnpm --filter @zokizuan/satori-mcp docs:check
git diff --check
```

Expected: both exit 0.

---

### Task 5: Full verification before integration

**Files:**
- No planned source mutation.

**Interfaces:**
- Consumes: final working tree.
- Produces: fresh evidence for commit/integration readiness.

- [ ] **Step 1: Run full tests**

```bash
pnpm test
```

Expected: Core and MCP suites pass; intentional skips are reported but no failures.

- [ ] **Step 2: Run full repository check**

```bash
pnpm check
```

Expected: exit 0.

- [ ] **Step 3: Run docs and diff checks**

```bash
pnpm --filter @zokizuan/satori-mcp docs:check
git diff --check
```

Expected: exit 0.

- [ ] **Step 4: Review aggregate diff**

Confirm the final diff contains the approved automatic-maintenance repair, productization/docs/site work, clean API-contract migration, and no accidental restoration of stale compatibility APIs.

---

### Task 6: Commit on feature branch, merge to master, and push

**Files:**
- Git metadata only.

**Interfaces:**
- Consumes: verified working tree.
- Produces: merged and pushed `origin/master`.

- [ ] **Step 1: Create/switch to a feature branch carrying the current dirty tree**

```bash
git switch -c feat/satori-productization-clean-migration
```

If the branch already exists, switch to it without discarding changes.

- [ ] **Step 2: Stage and commit the full approved change set**

```bash
git add -A
git commit -m "feat: productize satori and automate local index recovery"
```

- [ ] **Step 3: Switch to `master` and merge the feature branch**

```bash
git switch master
git merge --no-ff feat/satori-productization-clean-migration
```

- [ ] **Step 4: Re-run the final verification gate on merged master**

```bash
pnpm test
pnpm check
pnpm --filter @zokizuan/satori-mcp docs:check
git diff --check
```

Expected: all exit 0.

- [ ] **Step 5: Push without force**

```bash
git push origin master
```

Expected: remote advances to the merged master commit.

---

### Task 7: Build and install/run the local Satori workspace version

**Files:**
- Inspect: root `package.json`
- Inspect: `scripts/install-local-mcp-runtime.mjs`
- Inspect: `packages/cli/package.json`
- Inspect: local CLI entrypoint/install scripts as needed.

**Interfaces:**
- Consumes: merged local source tree.
- Produces: a locally built Satori runtime/CLI used for real-repository validation without `npx @zokizuan/satori-cli@latest`.

- [ ] **Step 1: Discover the sanctioned local-runtime path**

Inspect:

```bash
node -p "require('./package.json').scripts"
sed -n '1,240p' scripts/install-local-mcp-runtime.mjs
cat packages/cli/package.json
```

Prefer the existing `dev:install-local-mcp` / local CLI build path.

- [ ] **Step 2: Build the local workspace**

Run the repository's local build command required by that installer/runtime path.

- [ ] **Step 3: Install or launch the local MCP runtime**

Use the repository-provided local install/runtime script. Confirm the resulting launcher/config points into the local repository/build and not the npm cache or `@latest` package.

- [ ] **Step 4: Record the exact executable/runtime path**

Use process/config inspection to prove which local files are executing.

---

### Task 8: Exercise local Satori on multiple real repositories

**Files:**
- No Satori source mutation unless a real product defect is discovered.
- Temporary index/runtime state may be created under normal Satori state directories.

**Interfaces:**
- Consumes: local built Satori runtime.
- Produces: real product evidence across multiple repositories/languages.

- [ ] **Step 1: Inventory candidate repositories**

Run:

```bash
find /home/hamza/repo -mindepth 1 -maxdepth 2 -type d -name .git -printf '%h\n' | sort
```

Choose at least three repositories with meaningfully different size/language/content profiles.

- [ ] **Step 2: Index repository A with local Satori**

Create/index using the local CLI/MCP runtime, then observe status until ready.

- [ ] **Step 3: Query repository A**

Run at least:

```text
behavior/ownership semantic search
file outline or exact source read
relationship/navigation query when language support applies
status/freshness inspection
```

- [ ] **Step 4: Repeat for repositories B and C**

Use different queries relevant to each repository, not copied fixture phrases.

- [ ] **Step 5: Exercise maintenance behavior on one disposable/safe repository state**

Trigger or observe an ordinary source/index-policy change where practical, verify status/freshness behavior, and confirm the local runtime remains usable. Do not modify another project's source unless the change is safe, intentional, and restored afterward; a temporary test repository is acceptable for destructive lifecycle checks.

- [ ] **Step 6: Summarize real-use results**

Record repository names, local runtime path, index/status results, representative queries, useful outputs, navigation behavior, maintenance behavior, and any limitations/errors encountered.
