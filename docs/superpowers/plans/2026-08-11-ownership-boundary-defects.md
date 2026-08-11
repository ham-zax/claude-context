# Ownership Boundary Defects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the three verified ownership defects F021, F050, and F022 without broadening indexing, ranking, or lifecycle architecture.

**Architecture:** Each defect is repaired at its current authority boundary. Core publication retention will distinguish reader-waiting from destructive cleanup and protect in-flight staged generations without blocking later activation; shared-runtime startup recovery will use the existing lazy vector-only provider context; Core semantic search will revalidate its generation receipt after every product retrieval before returning results.

**Tech Stack:** TypeScript, Node.js test runner, pnpm workspace, Core `Context`/`SemanticSearchService`, MCP `SharedRuntimeHost`/`ProviderRuntime`.

## Global Constraints

- Preserve ranking, admission, provider ordering, projection, ignore semantics, pagination, and watcher behavior.
- Do not create, reindex, clear, or otherwise mutate a live Satori index.
- Use deterministic temporary repositories and in-memory vector backends in tests.
- Preserve user-owned `tmp/review.md` unchanged and unstaged.
- Implement and verify one defect at a time.

---

### Task 1: F021 deferred-retention publication coordination

**Files:**
- Modify: `packages/core/src/core/context.ts`
- Test: `packages/core/src/core/context.test.ts`

**Interfaces:**
- Consumes: `Context.runSerializedReindexByChange()`, `Context.waitForPublicationRetention()`, `Context.acquirePublicationReadLease()`.
- Produces: the invariant that retention cannot delete or prune an in-flight staged publication, while later publications may still activate during a long-lived reader.

- [x] **Step 1: Add the failing interleaving regression**

  Extend the existing atomic-retention fixtures with a deterministic barrier around `forkCollection`:

  ```text
  publish A while a publication reader is held
  start B and observe that it attempts to fork
  release the reader so A retention runs
  prove B's candidate survives and B publishes successfully
  prove only active + previous generations remain after retention settles
  ```

  Before the repair, assert that B reaches the fork barrier while A retention is pending; releasing the reader exposes deletion of B's unbound candidate.

- [x] **Step 2: Run the focused Core test and verify RED**

  Run:

  ```bash
  cd packages/core
  node --import tsx --import ./src/test-state-root.ts \
    --test --test-concurrency=1 \
    --test-name-pattern="deferred retention preserves a forked publication" \
    src/core/context.test.ts
  ```

  Expected: FAIL because the first retention operation deletes the second publication's forked candidate.

- [x] **Step 3: Coordinate retention cleanup with staged publication ownership**

  Extend the existing per-root publication gate with staged activation IDs and a distinct destructive-cleanup phase:

  ```text
  retention waiting for readers
  → later staged publications may register and proceed
  → older retention observes a different in-flight activation and retires without cleanup

  retention already performing destructive cleanup
  → a new staged publication waits until cleanup finishes
  ```

  Register each atomic candidate before its collection fork and release registration only after activation or candidate cleanup. A retention pass may clean only when no different activation is in flight. Preserve the existing Q/R activation behavior under a reader; do not serialize later publication behind reader drainage.

- [x] **Step 4: Run focused and neighboring retention tests**

  Run the focused regression, then all `Context` tests whose names contain `retention`, `reader`, or `atomic publication`.

- [x] **Step 5: Inspect the Task 1 diff**

  Confirm the diff changes only publication admission and its deterministic regression. Do not extract a new authority coordinator in this task.

---

### Task 2: F050 provider-backed startup interrupted-index recovery

**Files:**
- Modify: `packages/mcp/src/server/shared-runtime.ts`
- Modify only if a narrow public helper is required: `packages/mcp/src/server/provider-runtime.ts`
- Test: `packages/mcp/src/server/shared-runtime.test.ts` or the nearest existing shared-runtime startup lifecycle test

**Interfaces:**
- Consumes: `ProviderRuntime.requireToolContext("vector_only")` and the provider context's `ToolHandlers.recoverInterruptedIndexingAtStartup()`.
- Produces: startup recovery that can inspect durable vector completion markers without constructing an embedding or reranker runtime.

- [x] **Step 1: Add provider-backed and provider-unavailable startup tests**

  Test these two observable contracts:

  ```text
  valid vector configuration + interrupted indexing + valid marker
  → vector-only provider ToolHandlers run recovery
  → snapshot becomes indexed

  missing vector configuration
  → startup does not invoke UnconfiguredVectorDatabase marker reads
  → interrupted snapshot remains unchanged
  → recovery is deferred with a bounded warning without failing MCP startup
  ```

- [x] **Step 2: Run the focused MCP test and verify RED**

  Expected: the valid-provider fixture shows recovery still routes through `recoveryHandlers` backed by `createLocalOnlyContext()`.

- [x] **Step 3: Route startup recovery through the vector-only provider owner**

  Change `SharedRuntimeHost.recoverInterruptedIndexingAtStartup()` to request the existing vector-only provider context. If `ProviderRuntime` returns `MissingProviderConfigIssue`, emit a bounded deferral warning and return without changing the interrupted snapshot or failing startup. Otherwise invoke `toolContext.toolHandlers.recoverInterruptedIndexingAtStartup()`.

  First consult the durable snapshot owner. If it contains no interrupted indexing roots, return without constructing any provider context. This preserves lazy startup and avoids opening a configured vector client when there is no recovery work. Do not initialize embeddings or rerankers and do not start provider sync loops solely for recovery.

- [x] **Step 4: Run focused startup, shared-runtime, and provider-runtime tests**

  Verify provider-backed promotion, provider-unavailable preservation, and existing startup-mode behavior.

- [x] **Step 5: Inspect the Task 2 diff**

  Confirm local-only handlers remain the owner of provider-free tools and are no longer used for vector marker recovery.

---

### Task 3: F022 Core in-place retrieval revalidation

**Files:**
- Modify: `packages/core/src/core/semantic-search-service.ts`
- Test: `packages/core/src/core/context.test.ts` or `packages/core/src/core/semantic-search-service.test.ts`

**Interfaces:**
- Consumes: `SemanticSearchAuthority.revalidateProvenVectorGeneration()` and the receipt established before retrieval.
- Produces: no dense, lexical, or hybrid product result may return after its proven generation is withdrawn or replaced during retrieval.

- [x] **Step 1: Add a deterministic marker-clear race fixture**

  For each product retrieval mode implicated by the shared path, pause the vector backend after the initial receipt is proven, clear or replace the completion-marker authority, release retrieval, and assert that the search rejects instead of returning candidates from the mutation window.

  Include ordinary dense retrieval without diagnostics because that is the currently unguarded branch.

- [x] **Step 2: Run the focused Core test and verify RED**

  Expected: ordinary dense retrieval returns a result after authority was withdrawn because no unconditional final receipt validation runs.

- [x] **Step 3: Revalidate every product retrieval before result disclosure**

  Reuse one `assertCandidateReadAuthorityUnchanged()` owner after each product retrieval path. Receipt revalidation must run even when no external mutation-generation observer or diagnostic retrieval is configured. Preserve the stronger mutation-generation comparison where available.

- [x] **Step 4: Run semantic-search and Context search tests**

  Verify dense, lexical, hybrid, and diagnostic paths, including existing ABA and candidate-trace tests.

- [x] **Step 5: Inspect the Task 3 diff**

  Confirm no scoring, fusion, candidate limits, provider calls, or result ordering changed.

---

### Task 4: Integrated verification and commit

**Files:**
- Verify all files changed by Tasks 1–3 and this plan.

- [x] **Step 1: Run package verification invalidated by the changes**

  ```bash
  pnpm --filter @zokizuan/satori-core test
  pnpm --filter @zokizuan/satori-mcp test
  pnpm --filter @zokizuan/satori-core typecheck
  pnpm --filter @zokizuan/satori-mcp typecheck
  ```

  Verification record: the full Core suite exited successfully; the full MCP suite reported 1,536 passed, 1 skipped, and 0 failed; both package typechecks exited successfully. The MCP run initially exposed eager provider construction when no interrupted root existed. A dedicated red/green regression moved that no-work check ahead of provider construction, after which the startup-handshake suite and full MCP suite completed normally.

- [x] **Step 2: Inspect repository integrity**

  ```bash
  git diff --check
  git status --short
  git diff -- packages/core packages/mcp docs/superpowers/plans/2026-08-11-ownership-boundary-defects.md
  ```

  Confirm `tmp/review.md` remains user-owned and unchanged by this work.

- [x] **Step 3: Commit only the plan and implementation files**

  Stage exact task paths, verify the staged diff, and create one scoped commit only after all required verification passes. Do not push.
