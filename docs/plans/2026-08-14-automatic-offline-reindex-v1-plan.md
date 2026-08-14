# Automatic Offline Background Reindex (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide transparent, automatic background full reindexing for managed offline Satori when active repositories become outdated or incompatible, transforming explicit `manage_index(action="reindex")` into an operator recovery override rather than the normal freshness path.

**Architecture:**
- **Shared Admission Owner (`FullIndexStarter`):** Extract the authoritative full-index admission path behind a dedicated `FullIndexStarterHost`, ensuring both manual `manage_index(action="create" | "reindex")` and automatic maintenance converge on single-flight admission, unique staged collections (`resolveStagedCollectionName`), mutation lease verification, prepared lifecycle receipts, watcher setup, and atomic publication.
- **Provider-Lazy `IndexMaintenanceCoordinator`:** Root-keyed coordinator in `ProviderRuntime` managing refcounted active roots and single-flight scheduling across three escalation seams (session activation, post-sync escalation, and read readiness gateway). Uses an async starter resolver so fresh compatible roots inspect cheap snapshots without initializing real Potion/LanceDB providers.
- **Post-Sync Lease Handoff:** `SyncManager` reports `requires_reindex` via a narrow `AutoReindexRequestPort` invoked *after* its `sync` mutation lease is fully released in `finally`, eliminating logical lock contention.
- **Ref-Counted Active Roots & Session Authorization Containment:** Session workspace roots are mapped to tracked codebases and ref-counted on successful connection. In-flight rebuilds increment `ProviderRuntime.getActiveLifecycleOperationCount()` and drain cleanly during shutdown before provider resource closure.
- **AccessGateReason Whitelist & V1 Runtime Epoch Failure Semantics:** Auto-reindexing triggers only for whitelisted `AccessGateReason` values. One automatic attempt is permitted per root/current-runtime epoch (`root + currentRuntimeFingerprint`). Failed rebuilds persist `phase: "failed"` receipts and halt automatic spinning, reserving manual reindex for operator recovery.
- **Preserved Source Navigation During Active Rebuild:** When an outdated root is actively rebuilding (`state: indexing`), semantic search returns `not_ready` (`reason: "index_refreshing"`), while source-backed outline and call-graph navigation continue serving preserved previous navigation authority as long as source proof remains valid.

**Tech Stack:** Node.js, TypeScript, `@zokizuan/satori-core`, `@zokizuan/satori-mcp`, SQLite / LanceDB, Node.js Test Runner (`node:test`, `node:assert`).

---

## Global Constraints & Invariants

1. **Staged Generation Invariant:** Never rebuild directly into the active collection. Every full rebuild (manual or automatic) must pass through `FullIndexStarter` to allocate a unique `resolveStagedCollectionName(root, 'run_' + randomUUID())` and atomically publish upon proven completion.
2. **Active-Root Only & Authorization Containment:** Never automatically reindex all repositories in `~/.satori` at startup. Auto-reindexing applies strictly to *active* tracked roots contained by or intersecting connected session workspace roots, searched paths, or active watched roots. Opening an untracked/unindexed repository must **never** auto-create an index.
3. **Lease Ordering & Cross-Process Coalescing:** All mutations require a `RootMutationLease`. Sync discoveries must release the `sync` lease before escalating to `reindex`. If an active `reindex` lease is held (locally or cross-process), the coordinator treats the request as `coalesced`.
4. **Provider Laziness:** `IndexMaintenanceCoordinator` lives in `ProviderRuntime`. Session activation inspects cheap snapshot compatibility first via `SnapshotManager` and only initializes real Potion/LanceDB providers when an active root genuinely requires maintenance.
5. **Durable Lifecycle Receipts as Truth:** Lifecycle state (`accepted`, `scanning`, `writing`, `proving`, `publishing`, `completed`, `failed`) is read directly from `SnapshotManager.getLatestOperation(root)`. Do not maintain separate, lossy in-memory retry maps.
6. **Bounded V1 Failure Policy (Runtime Epoch):** Exactly one automatic rebuild attempt per root/current-runtime epoch (`root + currentRuntimeFingerprint`). If the latest operation has `action: "reindex"`, `phase: "failed"`, and matches the current runtime fingerprint, automatic scheduling halts until the runtime fingerprint changes or the operator runs manual `manage_index(action="reindex")`.
7. **Reason Whitelist:** Automatically reindex only for whitelisted `AccessGateReason` values: `fingerprint_mismatch`, `legacy_unverified_fingerprint`, `missing_fingerprint`, `index_policy_changed`, `backend_requires_full_rebuild`, `navigation_recovery_failed`. Never auto-reindex `unsupported_authority` or corrupted state.
8. **Navigation Availability During Active Rebuild:** When an index is rebuilding (`state: indexing`, `action: reindex`), `TrackedRootReadiness` serves preserved previous navigation authority for `outline` and `call_graph` if source proof passes, while semantic search returns `not_ready` (`reason: "index_refreshing"`).
9. **Operator Contract Preservation:** `manage_index(action="reindex")` preserves all custom arguments (`customExtensions`, `ignorePatterns`, `zillizDropCollection`, `allowUnnecessaryReindex`, preflight classification) above the shared starter boundary.
10. **Settlement Contract:** `FullIndexOperation.launch()` and host background indexing handlers must return an owning `Promise<void>` that settles only after all background work, lease release, and terminal durable receipt updates complete.

---

## Architecture Diagram

```text
                  SharedRuntimeHost
                         │
                session connected roots (contained tracked roots refcounted)
                         │
                         ▼
                   ProviderRuntime
                         │
             ┌───────────┴────────────┐
             │                        │
             ▼                        ▼
    IndexMaintenanceCoordinator     ManageIndexingHandlers
             │                        │
             │ (lazy starter port)    │ manual create/reindex (preflight/UX options)
             │                        │
             └───────────┬────────────┘
                         ▼
                 FullIndexStarter (FullIndexStarterHost)
                         │
             ┌───────────┴──────────┐
             │                      │
      staged collection       prepared receipt
      mutation lease          operation receipt
      watcher setup           safety checks
             │                      │
             └───────────┬──────────┘
                         ▼
                 FullIndexOperation
                         │
                owning launch() promise
                         │
            atomic proven publication
```

---

## File Structure & Responsibilities

| File Path | Action | Primary Responsibility |
| :--- | :--- | :--- |
| `packages/mcp/src/core/full-index-starter.ts` | **Create** | Authoritative shared admission owner with dedicated `FullIndexStarterHost`, managing lease acquisition, staged collection naming, receipt persistence, and watcher initialization. |
| `packages/mcp/src/core/full-index-starter.test.ts` | **Create** | Unit tests verifying staged collection allocation, lease transfer, preflight checks, and error handling. |
| `packages/mcp/src/core/full-index-operation.ts` | **Modify** | Tighten `startBackgroundIndexing` to return `Promise<void>` and update `launch()` to return an owning settlement promise. |
| `packages/mcp/src/core/index-maintenance-coordinator.ts` | **Create** | Root-keyed coordinator in `ProviderRuntime` managing refcounted active roots, lazy starter invocation, single-flight deduplication, reason whitelist dispatch, and shutdown draining. |
| `packages/mcp/src/core/index-maintenance-coordinator.test.ts` | **Create** | Unit tests for active root refcounting, single-flight coalescing, provider-lazy startup, reason whitelist enforcement, and runtime epoch failure semantics. |
| `packages/mcp/src/core/sync.ts` | **Modify** | Add `AutoReindexRequestPort` callback invoked *after* releasing the `sync` lease in `finally`. |
| `packages/mcp/src/core/sync.test.ts` | **Modify** | Verify that `SyncManager` escalates to auto-reindex without lock contention after sync lease release. |
| `packages/mcp/src/core/tracked-root-readiness.ts` | **Modify** | Use narrow `AutoReindexRequestPort` to schedule auto-reindex; serve preserved previous navigation authority during active reindexing when source proof is valid. |
| `packages/mcp/src/core/tracked-root-readiness.test.ts` | **Modify** | Verify readiness gateway auto-reindex triggers and navigation preservation during active rebuilds. |
| `packages/mcp/src/core/manage-indexing-handlers.ts` | **Modify** | Keep manual preflight/UX checks in handler and delegate admission execution through `FullIndexStarter`. |
| `packages/mcp/src/server/shared-runtime.ts` | **Modify** | Wire refcounted session activation, lazy starter resolver, active lifecycle operation counting, and shutdown draining. |
| `packages/mcp/src/server/shared-runtime-host.ts` | **Modify** | Map connected session workspace policies to contained tracked codebases for refcounted retention; release on disconnect. |
| `packages/mcp/src/core/auto-reindex.integration.test.ts` | **Create** | 14 comprehensive E2E integration scenarios verifying all safety, concurrency, laziness, and lifecycle contracts. |

---

## Task 1: Shared `FullIndexStarter` & `FullIndexOperation.launch()` Completion Contract

**Files:**
- Create: `packages/mcp/src/core/full-index-starter.ts`
- Create: `packages/mcp/src/core/full-index-starter.test.ts`
- Modify: `packages/mcp/src/core/full-index-operation.ts`

**Key Interfaces:**
```ts
import type { AccessGateReason } from "./tracked-root-readiness.js";
import type { CustomIndexPolicyUpdate } from "./custom-index-policy.js";
import type { IndexOperationReceipt } from "./indexing-operation-receipt.js";
import type { MutationLeaseCoordinator } from "./mutation-lease-coordinator.js";
import type { SnapshotManager } from "./snapshot-manager.js";
import type { IndexMutationPort } from "./index-mutation-port.js";
import type { FullIndexOperation } from "./full-index-operation.js";

export interface FullIndexStartInput {
    readonly codebasePath: string;
    readonly action: "create" | "reindex";
    readonly trigger: "manual" | "automatic";
    readonly autoReason?: AccessGateReason;
    readonly policyUpdate?: CustomIndexPolicyUpdate;
}

export interface FullIndexStartResult {
    readonly outcome: "started" | "coalesced" | "blocked";
    readonly operationReceipt?: IndexOperationReceipt;
    readonly settlementPromise?: Promise<void>;
    readonly blockedReason?: string;
}

export interface FullIndexStarterHost {
    readonly mutationLeaseCoordinator: MutationLeaseCoordinator;
    readonly snapshotManager: SnapshotManager;
    readonly indexMutationPort: IndexMutationPort;

    canonicalizeCodebasePath(targetPath: string): string;
    resolveStagedCollectionName(canonicalRoot: string, stageToken?: string): string;
    recoverStaleIndexingStateIfNeeded(canonicalRoot: string): Promise<{ recovered: boolean; reason?: string }>;
    pruneUnprovenStagedCollectionFamily(canonicalRoot: string): Promise<string[]>;
    touchWatchedCodebase(canonicalRoot: string): Promise<void>;

    createFullIndexOperation(input: {
        canonicalRoot: string;
        stagedCollectionName: string;
        action: "create" | "reindex";
        policyUpdate?: CustomIndexPolicyUpdate;
    }): FullIndexOperation;
}

export class FullIndexStarter {
    constructor(private readonly host: FullIndexStarterHost);
    startFullIndexRebuild(input: FullIndexStartInput): Promise<FullIndexStartResult>;
}
```

- [ ] **Step 1: Tighten `FullIndexOperation` completion and host contracts**
  In `packages/mcp/src/core/full-index-operation.ts`:
  - Tighten `FullIndexOperationHost.startBackgroundIndexing?: (...) => Promise<void>` (must return an owning `Promise<void>`).
  - Modify `launch(input: FullIndexOperationInput): Promise<void>` so the returned promise settles when the background indexer completes or fails, persists the terminal durable receipt, and releases its mutation lease.

- [ ] **Step 2: Write failing unit tests for `FullIndexStarter`**
  Create `packages/mcp/src/core/full-index-starter.test.ts` verifying:
  - Staged collection name allocation with `resolveStagedCollectionName(path, 'run_' + id)`.
  - Lease acquisition and conflict detection (returns `coalesced` when active lease has `action === 'reindex'`, `blocked` otherwise).
  - Preflight validation, stale state recovery, and receipt generation.
  - Correct propagation of `action` ("create" vs "reindex") and `trigger` ("manual" vs "automatic").

- [ ] **Step 3: Implement `FullIndexStarter`**
  Create `packages/mcp/src/core/full-index-starter.ts` extracting the common admission logic.

- [ ] **Step 4: Verify Task 1 tests**
  Run: `pnpm --filter @zokizuan/satori-mcp exec node --import tsx --test src/core/full-index-starter.test.ts`

---

## Task 2: `IndexMaintenanceCoordinator` Single-Flight Scheduler & Laziness Port

**Files:**
- Create: `packages/mcp/src/core/index-maintenance-coordinator.ts`
- Create: `packages/mcp/src/core/index-maintenance-coordinator.test.ts`

**Key Interfaces:**
```ts
import type { AccessGateReason } from "./tracked-root-readiness.js";
import type { SnapshotManager } from "./snapshot-manager.js";
import type { FullIndexStartInput, FullIndexStartResult } from "./full-index-starter.js";

export const AUTO_REINDEX_REASONS: readonly AccessGateReason[] = Object.freeze([
    "fingerprint_mismatch",
    "legacy_unverified_fingerprint",
    "missing_fingerprint",
    "index_policy_changed",
    "backend_requires_full_rebuild",
    "navigation_recovery_failed",
] as const);

export interface AutoReindexRequestPort {
    requestAutoReindex(canonicalRoot: string, reason: AccessGateReason): void;
}

export interface MaintenanceScheduleResult {
    readonly outcome: "started" | "coalesced" | "blocked" | "ignored";
    readonly reason?: string;
}

export interface IndexMaintenanceCoordinatorOptions {
    readonly snapshotManager: SnapshotManager;
    readonly getCurrentRuntimeFingerprint: () => string;
    readonly startFullIndex: (input: FullIndexStartInput) => Promise<FullIndexStartResult>;
    readonly onActivityChanged?: () => void;
    readonly now?: () => number;
}

export class IndexMaintenanceCoordinator implements AutoReindexRequestPort {
    constructor(options: IndexMaintenanceCoordinatorOptions);

    retainActiveRoots(canonicalRoots: string[]): () => void;
    isActiveRoot(canonicalRoot: string): boolean;
    getActiveRootCount(canonicalRoot: string): number;

    requestAutoReindex(canonicalRoot: string, reason: AccessGateReason): void;
    ensureFullReindexScheduled(
        canonicalRoot: string,
        reason: AccessGateReason,
    ): Promise<MaintenanceScheduleResult>;

    isReindexInProgress(canonicalRoot: string): boolean;
    getActiveOperationCount(): number;
    stopAcceptingNewMaintenance(): void;
    drain(): Promise<void>;
}
```

- [ ] **Step 1: Write unit tests for `IndexMaintenanceCoordinator`**
  Create `packages/mcp/src/core/index-maintenance-coordinator.test.ts` testing:
  - Reference counting of active roots across multiple sessions (`retainActiveRoots` returns a release function).
  - Provider-lazy starter invocation (starter factory is not invoked until reindex is genuinely required).
  - Single-flight deduplication: second request for an in-flight root returns `coalesced` without launching duplicate workers.
  - Cross-process lease coalescing when a reindex lease is held by another process.
  - Reason whitelist validation (rejects non-whitelisted reasons like `unsupported_authority`).
  - Runtime epoch failure policy: if latest operation has `action: "reindex"`, `phase: "failed"`, and `receipt.runtimeFingerprint === currentRuntimeFingerprint`, auto-reindex is suppressed until runtime fingerprint changes or manual reindex occurs.
  - Draining active operations on shutdown after `stopAcceptingNewMaintenance()`.

- [ ] **Step 2: Implement `IndexMaintenanceCoordinator`**
  Implement `packages/mcp/src/core/index-maintenance-coordinator.ts`.

- [ ] **Step 3: Verify Task 2 tests**
  Run: `pnpm --filter @zokizuan/satori-mcp exec node --import tsx --test src/core/index-maintenance-coordinator.test.ts`

---

## Task 3: Post-Sync Lease Handoff in `SyncManager`

**Files:**
- Modify: `packages/mcp/src/core/sync.ts`
- Modify: `packages/mcp/src/core/sync.test.ts`

- [ ] **Step 1: Write unit test in `sync.test.ts` for post-sync lease handoff**
  Add tests proving that when `SyncManager` detects `requires_reindex` (e.g. index policy changed), it completes the sync cycle, releases the `sync` lease in `finally`, and only then invokes `onRequiresFullReindex` without blocking sync completion.

- [ ] **Step 2: Implement post-sync escalation in `sync.ts`**
  In `SyncManager`:
  - Accept `autoReindexPort?: AutoReindexRequestPort` in options.
  - In `ensureFreshness()` and `runIgnoreReconcile()`:
    ```ts
    let escalation: AccessGateReason | undefined;
    try {
        // ... perform sync / ignore reconciliation ...
        if (requiresReindexReason) {
            escalation = requiresReindexReason;
        }
        return decision;
    } finally {
        if (ownsLease) {
            leaseCoordinator.release(lease);
        }
        if (escalation) {
            autoReindexPort?.requestAutoReindex(canonicalRoot, escalation);
        }
    }
    ```

- [ ] **Step 3: Verify Task 3 tests**
  Run: `pnpm --filter @zokizuan/satori-mcp exec node --import tsx --test src/core/sync.test.ts`

---

## Task 4: Read Readiness Gateway & Navigation Availability During Active Rebuild

**Files:**
- Modify: `packages/mcp/src/core/tracked-root-readiness.ts`
- Modify: `packages/mcp/src/core/tracked-root-readiness.test.ts`

- [ ] **Step 1: Write unit tests in `tracked-root-readiness.test.ts`**
  Verify that:
  - Semantic search readiness detects fingerprint mismatch, requests auto-reindex via `AutoReindexRequestPort`, and returns `state: "indexing"` with rendered UX guidance (`reason: "index_refreshing"`).
  - When candidate rebuild is actively running (`state: indexing`, `action: reindex`), navigation requests (`accessMode: "navigation"`) continue serving preserved previous navigation authority if source proof passes.
  - `unsupported_authority` fails closed and does **not** trigger auto-reindex.

- [ ] **Step 2: Implement readiness gateway auto-maintenance hook & navigation fallback**
  In `packages/mcp/src/core/tracked-root-readiness.ts`:
  - Accept `autoReindexPort?: AutoReindexRequestPort`.
  - When evaluating readiness:
    - If `accessMode === "navigation"` and the root is currently indexing (`state === "indexing"`, `operation?.action === "reindex"`), check if previous navigation authority and sidecar exist. If source proof passes, return `{ ready: true, navigationState: "source_backed_fingerprint_compatibility" }`.
    - If compatibility mismatch is detected, trigger `autoReindexPort.requestAutoReindex(root, reason)`.

- [ ] **Step 3: Verify Task 4 tests**
  Run: `pnpm --filter @zokizuan/satori-mcp exec node --import tsx --test src/core/tracked-root-readiness.test.ts`

---

## Task 5: Refactor `ManageIndexingHandlers` to Use `FullIndexStarter`

**Files:**
- Modify: `packages/mcp/src/core/manage-indexing-handlers.ts`
- Modify: `packages/mcp/src/core/manage-indexing-handlers.test.ts`

- [ ] **Step 1: Refactor manual reindex and create handlers**
  In `packages/mcp/src/core/manage-indexing-handlers.ts`:
  - Keep manual UX/preflight concerns (working-tree dirty checks, unnecessary-reindex decision, explicit Zilliz maintenance) in the handler.
  - Delegate core admission execution through `fullIndexStarter.startFullIndexRebuild({ codebasePath, action, trigger: "manual", policyUpdate })`.

- [ ] **Step 2: Verify manage_index tests**
  Run: `pnpm --filter @zokizuan/satori-mcp exec node --import tsx --test src/tools/manage_index.test.ts src/core/handlers.manage_index_blocking.test.ts`

---

## Task 6: Session Lifecycle, `ProviderRuntime` Integration & Shutdown Draining

**Files:**
- Modify: `packages/mcp/src/server/shared-runtime.ts`
- Modify: `packages/mcp/src/server/shared-runtime-host.ts`
- Modify: `packages/mcp/src/server/shared-runtime-host.test.ts`

- [ ] **Step 1: Wire active roots and coordinator in `ProviderRuntime` & `SharedRuntimeHost`**
  - In `SharedRuntimeHost`:
    - On session successful connection, map `sessionPolicy.roots` to contained/intersecting tracked codebases in snapshot and retain them via `coordinator.retainActiveRoots(trackedRoots)`.
    - On session disconnect/error, release the retain.
    - If connection fails, ensure no retain leak occurs.
  - In `ProviderRuntime`:
    - Instantiate `IndexMaintenanceCoordinator` lazily using `startFullIndex: async (input) => (await this.requireToolContext("embedding_vector")).fullIndexStarter.startFullIndexRebuild(input)`.
    - Include `indexMaintenanceCoordinator.getActiveOperationCount()` in `ProviderRuntime.getActiveLifecycleOperationCount()`.
    - Have the coordinator notify `onLifecycleActivityChanged` when its operation count changes.
    - Shutdown sequence:
      1. `coordinator.stopAcceptingNewMaintenance()`
      2. `await coordinator.drain()`
      3. Stop/drain `SyncManager` and file watchers
      4. Close vector DB
      5. Close embeddings/rerankers

- [ ] **Step 2: Verify shared runtime host tests**
  Run: `pnpm --filter @zokizuan/satori-mcp exec node --import tsx --test src/server/shared-runtime-host.test.ts`

---

## Task 7: Comprehensive E2E Integration Suite (14 Scenarios)

**Files:**
- Create: `packages/mcp/src/core/auto-reindex.integration.test.ts`

- [ ] **Step 1: Implement the 14 critical integration tests**
  1. **Sync Lease Handoff:** Sync marks `requires_reindex` on policy change, releases sync lease in `finally`, triggers reindex without lock contention.
  2. **Unique Staged Generation:** Active vector collection remains readable/untouched while candidate builds in staged collection.
  3. **Candidate Failure Isolation:** Failed rebuild preserves prior compatible generation; incompatible vectors are never served.
  4. **Multi-Session Active Root Refcounting:** Two sessions share a root; closing Session 1 keeps the root active until Session 2 closes.
  5. **Session Closure During Rebuild:** Active background rebuild keeps host alive; shutdown drains rebuild before resource closure.
  6. **Cross-Process Reindex Lease Coalescing:** When a reindex lease is already held by another process, incoming requests report `coalesced`.
  7. **Untracked Workspace Invariant:** Opening an unindexed workspace root does **not** auto-create an index.
  8. **Unsupported Authority Fail-Closed:** Outdated runtime encountering newer authority schema does **not** auto-reindex; returns operator upgrade requirement.
  9. **Navigation Availability During Active Rebuild:** When candidate rebuild is actively running (`state: indexing`), old proven navigation remains accessible for outline/call-graph while semantic search is not ready.
  10. **Manual Custom Options Preservation:** Explicit `manage_index(action="reindex")` with `customExtensions` and `ignorePatterns` passes options cleanly above the starter boundary.
  11. **Fresh Active Root Preserves Provider Laziness:** Session activation of an already-compatible root does not spawn Potion or open LanceDB.
  12. **Failed Automatic Reindex Epoch Stability:** Repeated reads after a failed automatic reindex for the current runtime epoch return stable not_ready guidance and do not launch spinning reindex loops.
  13. **Connect Failure Does Not Leak Active Root Refcount:** A session that fails connection does not retain active roots or block shutdown.
  14. **Activity & Host Idle Integration:** Active coordinator rebuilds register with `ProviderRuntime.getActiveLifecycleOperationCount()`, preventing socket host idle timeout until drained.

- [ ] **Step 2: Run integration tests**
  Run: `pnpm --filter @zokizuan/satori-mcp exec node --import tsx --test src/core/auto-reindex.integration.test.ts`

---

## Task 8: Full Monorepo Qualification Gate

- [ ] **Step 1: Typecheck and lint**
  Run: `pnpm run check`
- [ ] **Step 2: Full monorepo test suite**
  Run: `pnpm test`
- [ ] **Step 3: Release smoke & contract checks**
  Run:
  - `pnpm --filter @zokizuan/satori-cli run release:smoke`
  - `pnpm --filter @zokizuan/satori-mcp run release:smoke`
  - `pnpm run test:scripts`
  - `pnpm -C packages/mcp run contract:check`
- [ ] **Step 4: Top-level release qualification**
  Run: `pnpm run release:check`
