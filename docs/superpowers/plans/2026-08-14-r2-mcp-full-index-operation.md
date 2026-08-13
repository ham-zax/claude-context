# Phase R2 Implementation Plan: MCP Full-Index Operation Extraction

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the background full-index execution lifecycle and detached promise handling from `ManageIndexingHandlers` (Cognitive Complexity 248) into a dedicated per-run `FullIndexOperation` module, with explicit lease ownership handoff and single-point terminal release.

**Architecture:** `ManageIndexingHandlers` performs request-level admission (path validation, runtime owner checks, collection drop preflight) and acquires the `RootMutationLease`. At the background launch boundary, the acquired lease is transferred to `FullIndexOperation.launch(input)`, which becomes the single owner of the detached background run, unexpected rejection handling (`.catch`), terminal operation failure persistence, and terminal `mutationLeaseCoordinator.release(lease)` in `finally`. Generation authority remains strictly Core-owned.

**Tech Stack:** TypeScript 6.x / Node.js 22+ (`node:test`), `@zokizuan/satori-mcp`, `@zokizuan/satori-core`.

---

## Global Constraints & Boundaries

* **Generation Authority Remains Core-Owned**: `IndexAuthorityCoordinator` and `IndexGenerationWorkflow` in `@zokizuan/satori-core` remain the sole source of truth for generation proofs, source checkpoints, and publication gating.
* **Lease Truth Remains MCP-Owned**: `MutationLeaseCoordinator` owns durable lease acquisition, validation (`assertCurrent`), and release (`release(lease)`) semantics. `RootMutationLease` is a data/capability token, NOT a state-owning object.
* **Atomic Lease Handoff**:
  - The request-level `leaseTransferred` guard (or behaviorally equivalent ownership marker) remains in `ManageIndexingHandlers`.
  - `FullIndexOperation.launch()` has atomic acceptance semantics. A normal return means it has fully accepted lifecycle/release ownership. A synchronous throw means no detached work remains owned by the operation, and request-level cleanup remains authoritative.
  - The request-level `leaseTransferred` guard becomes `true` only after `FullIndexOperation.launch(input)` returns normally.
  - The request-level `finally` releases only leases that were not transferred.
  - `FullIndexOperation` exclusively performs terminal release after transfer.
* **Single Lifecycle Ownership for Detached Promise**:
  - `ManageIndexingHandlers` acquires the lease during request admission.
  - `ManageIndexingHandlers` invokes `FullIndexOperation.launch(input)` transferring the acquired lease and returns the immediate tool response.
  - `FullIndexOperation.launch()` internally executes the background run, catches unexpected detached rejections, persists terminal failure state, and calls `mutationLeaseCoordinator.release(lease)` in its terminal `finally` block.
  - `ManageIndexingHandlers` retains **zero** detached promise handling after `launch()`.
* **Faithful Input Interface**: Matches the exact parameter surface of current `startBackgroundIndexing` on HEAD without premature API changes:
  ```typescript
  export interface FullIndexOperationInput {
      readonly codebasePath: string;
      readonly forceReindex: boolean;
      readonly writeCollectionName?: string;
      readonly mutationLease?: RootMutationLease;
      readonly previousIndexedInfo?: Record<string, unknown>;
      readonly policyUpdate?: CustomIndexPolicyUpdate;
      readonly preparedCollectionReceipt?: PreparedIndexCollectionReceipt;
  }
  ```
* **Preserve `startBackgroundIndexing` Host Override Seam**:
  - The optional `startBackgroundIndexing` hook in `ManageIndexingHandlersHost` is referenced by multiple existing test suites and must remain functional.
  - `FullIndexOperation` executes the host's override if provided, or the extracted real `run()` method, followed by the identical detached rejection and terminal release semantics.
* **Do Not Redesign Persistence Abstractions in Task 2**:
  - Do not consolidate `transitionOperation` and the background method's existing `persistBackgroundPhase` helper during Task 2; move existing semantics mechanically.
* **Preserve Critical Authority & Lifecycle Invariants (`0121875`)**:
  - One synchronizer lifecycle through deferred full indexing.
  - Candidate watcher / source handoff.
  - Previous proven generation preserved on `limit_reached`.
  - Capture rollback authority; distinguish candidate policy publication from final authority.
  - Durable MCP operation phases recorded.
  - Staged checkpoint before publication; exact source revalidation immediately before canonical authority commit.
  - Promoted staged checkpoint only after authority succeeds; register synchronizer and complete source handoff.
  - Failed cleanup restricted to disposable staged-generation collections.
  - Source drift before commit fails closed.
* **Stopping Condition**: Background full-index lifecycle, detached failure handling, and terminal lease release have one explicit per-run owner; public behavior, override seams, and compatibility paths are unchanged; all authority/race/contract tests pass. Complexity reduction is recorded as a secondary outcome, not an acceptance criterion.

---

### Task 1: Characterization Tests & `FullIndexOperation` Scaffolding

**Files:**
- Create: `packages/mcp/src/core/full-index-operation.ts`
- Modify: `packages/mcp/src/core/manage-indexing-handlers.test.ts` (or create `packages/mcp/src/core/full-index-operation.test.ts`)
- Reference: `packages/mcp/src/core/manage-indexing-handlers.ts`

**Interfaces:**
- Produces:
  ```typescript
  import type { RootMutationLease, MutationLeaseCoordinator } from './mutation-lease.js';
  import type {
      CustomIndexPolicyUpdate,
      IndexMutationPort,
      PreparedIndexCollectionReceipt,
  } from '@zokizuan/satori-core';

  export interface FullIndexOperationInput {
      readonly codebasePath: string;
      readonly forceReindex: boolean;
      readonly writeCollectionName?: string;
      readonly mutationLease?: RootMutationLease;
      readonly previousIndexedInfo?: Record<string, unknown>;
      readonly policyUpdate?: CustomIndexPolicyUpdate;
      readonly preparedCollectionReceipt?: PreparedIndexCollectionReceipt;
  }

  export interface FullIndexOperationHost {
      readonly mutationLeaseCoordinator?: MutationLeaseCoordinator;
      readonly indexMutationPort: IndexMutationPort;
      readonly startBackgroundIndexing?: (
          codebasePath: string,
          forceReindex: boolean,
          writeCollectionName?: string,
          mutationLease?: RootMutationLease,
          previousIndexedInfo?: Record<string, unknown>,
          policyUpdate?: CustomIndexPolicyUpdate,
          preparedCollectionReceipt?: PreparedIndexCollectionReceipt,
      ) => Promise<void> | void;
      // ... narrow operational dependencies from ManageIndexingHost
  }
  ```

- [ ] **Step 1: Write focused characterization tests in domain test suite**
  Add unit tests covering:
  - Successful background full-index sequence.
  - Lease preemption during indexing.
  - Source drift detection before commit.
  - Disposable staged-collection cleanup on failure.
  - **Synchronous `startBackgroundIndexing` override throw does not transfer lease ownership** (request error path owns cleanup/release).
  - **Asynchronously rejected background override transfers ownership** and is handled/released by `FullIndexOperation`.
  - Terminal `mutationLeaseCoordinator.release(lease)` execution.
- [ ] **Step 2: Run tests to establish green baseline**
  Run: `pnpm --filter @zokizuan/satori-mcp test`
- [ ] **Step 3: Scaffold `FullIndexOperation` class with `launch(input)` and `run(input)` methods**
- [ ] **Step 4: Commit Task 1**
  ```bash
  git add packages/mcp/src/core/full-index-operation.ts packages/mcp/src/core/manage-indexing-handlers.test.ts
  git commit -m "feat(mcp): scaffold FullIndexOperation and characterization tests"
  ```

---

### Task 2: Move `startBackgroundIndexing()` and Detached Promise Ownership to `FullIndexOperation`

**Files:**
- Modify: `packages/mcp/src/core/full-index-operation.ts`
- Modify: `packages/mcp/src/core/manage-indexing-handlers.ts`
- Test: `packages/mcp/src/core/manage-indexing-handlers.test.ts`

**Behavioral Contract for `FullIndexOperation.launch()`:**
`FullIndexOperation.launch()` must preserve the existing detached-rejection semantics exactly:
1. Normalize synchronous/Promise run results into a detached Promise (supporting host `startBackgroundIndexing` override seam if present).
2. Log unexpected detached rejection.
3. If the transferred lease remains current, persist `"failed"` using the same operation-receipt fallback semantics currently provided by `transitionOperation(...)` (including `commitOperationPhase`, fallback `transitionOperation + saveCodebaseSnapshot`, and basic snapshot fallback).
4. Preserve `formatUnknownError(...)` error projection.
5. Release the transferred lease exactly once in terminal `finally`.

**Atomic Handoff in `ManageIndexingHandlers`:**
```typescript
fullIndexOperation.launch(input);
leaseTransferred = mutationLease !== undefined;
```
`ManageIndexingHandlers` removes its internal `.catch/.finally` wrapper entirely.

- [ ] **Step 1: Move background indexing implementation into `FullIndexOperation.run()` verbatim**
- [ ] **Step 2: Implement `FullIndexOperation.launch()` satisfying the 5-point detached rejection contract**
- [ ] **Step 3: Wire `ManageIndexingHandlers.handleIndexCodebaseInternal()` to invoke `fullIndexOperation.launch(input)`**
  Update `leaseTransferred = mutationLease !== undefined` immediately after `launch()` returns normally, and remove the redundant `.catch/.finally` block.
- [ ] **Step 4: Run full MCP test suite and Core race tests**
  Run:
  ```bash
  pnpm --filter @zokizuan/satori-core test
  pnpm --filter @zokizuan/satori-mcp test
  pnpm -C packages/mcp contract:check
  ```
  Expected: PASS (all tests green).
- [ ] **Step 5: Commit Task 2**
  ```bash
  git add packages/mcp/src/core/full-index-operation.ts packages/mcp/src/core/manage-indexing-handlers.ts
  git commit -m "refactor(mcp): extract background indexing lifecycle and detached promise to FullIndexOperation"
  ```

---

### Task 3: Structure Internal Operation State & Remeasure

**Files:**
- Modify: `packages/mcp/src/core/full-index-operation.ts`
- Modify: `packages/mcp/src/core/manage-indexing-handlers.ts`
- Test: `packages/mcp/src/core/manage-indexing-handlers.test.ts`

- [ ] **Step 1: Group internal run variables into explicit typed per-operation state**
  Clarify state fields: distinguish `mutationLeaseGeneration` (lease fencing) from `indexGeneration` (collection generation proof); group candidate policy, target collection, staged checkpoint, synchronizer, and rollback authority.
- [ ] **Step 2: Retain request/action admission in `ManageIndexingHandlers`**
  Keep path validation, runtime-owner gating, already-indexed decisions, reindex preflight, remote collection deletion, and tool-response formatting in `ManageIndexingHandlers`.
- [ ] **Step 3: Run full suite verification & typecheck**
  Run:
  ```bash
  pnpm run check
  pnpm --filter @zokizuan/satori-core test
  pnpm --filter @zokizuan/satori-mcp test
  pnpm -C packages/mcp contract:check
  ```
- [ ] **Step 4: Commit Task 3**
  ```bash
  git add packages/mcp/src/core/full-index-operation.ts packages/mcp/src/core/manage-indexing-handlers.ts
  git commit -m "refactor(mcp): formalize FullIndexOperation internal state structure"
  ```
