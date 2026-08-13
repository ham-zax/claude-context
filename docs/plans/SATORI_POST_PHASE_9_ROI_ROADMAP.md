# Satori Post-Phase 9 ROI Roadmap

> **Core Governance Rule:**
> **Architecture work requires a measurable hypothesis. LOC reduction, file count, coordinator count, graph centrality, or cognitive complexity alone are NOT sufficient justification for an engineering phase.**
>
> Every proposed initiative must define:
> `measurable problem / product goal | disproving check / baseline metric | bounded acceptance condition`
>
> **Candidate bets are hypotheses, not executable plans. A candidate becomes authorized only after a phase-specific experiment plan records its measured baseline, disconfirming condition, and bounded acceptance threshold.**

**Status:** Authoritative Post-Phase 9 Master Roadmap  
**Parent Baseline Commit:** `0121875` (*fix(generation): complete Phase 9 authority invariants and source checkpoint lifecycle*)  
**Reviewed Baseline HEAD:** `0142d97` (*fix(lint): remove unreachable code in index workflow and unused test constant*)  
**Target Packages:** `@zokizuan/satori-core`, `@zokizuan/satori-mcp`, `@zokizuan/satori-cli`

---

## 1. Mission & Conceptual Model

Improve real developer/agent value and operational reliability while preserving proven generation, authority, and source-freshness correctness.

* **Conceptual Model**: A searchable Satori state is a **proven publication of generation-bound vector, navigation, policy, and source-freshness evidence under one logical authority**. No individual durable store or generated projection independently determines currentness.
* **Architecture Boundary**: This concept defines our mental model and invariants—it does **NOT** authorize creating new abstract software layers (`IndexPublication`, `PublicationManager`, etc.) unless evidence demonstrates an unavoidable need.

---

## 2. Invariants & Compatibility Gates

### Phase 9 Safety Invariants (`0121875` Baseline)
All future work must preserve the invariants proven at `0121875`:

1. **One Synchronizer Lifecycle**: Deferred full indexing maintains a single file synchronizer lifecycle.
2. **Exact Source Revalidation Before Commit**: Full index checkpoint must assert exact observation currentness immediately prior to canonical authority commit.
3. **Unified Post-Commit Promotion**: Staged checkpoints and navigation generation pointers are promoted only after canonical authority is durable.
4. **Disposable Staged Failure Cleanup**: Indexing failures clean up only disposable staged collections; proven prior generations remain intact on `limit_reached` or failure.
5. **No Checkpoint Mutation Capability Leak**: `IndexCodebaseResult` exposes read-only evidence, not mutable checkpoint capabilities.
6. **Race Safety / Fail-Closed on Source Drift**: File modifications during full indexing fail closed before canonical publication, preserving data integrity.

### Current Compatibility Gates
* Unrelated refactors must preserve the current rerank request contract byte-for-byte (`packages/mcp/assets/lateon/rerank-request-contract-v1.json` with `contractSha256: f4e8ec82841f0496a592246008fc7bd05e61a66b4d482ef74b11db0e3fa3dd5d`) and pass `pnpm -C packages/mcp contract:check`.
* Intentional contract evolution requires a separately authorized, versioned contract change.

---

## 3. Active Authorized Execution Sequence

```text
┌─────────────────────────────────────────────────────────────┐
│ R0 Qualification & R1 Structural Baseline                   │
│   • Verify clean typecheck, full package tests, contracts   │
│   • Document static imports vs. runtime IoC callbacks       │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ R2: FullIndexOperation Extraction                           │
│   • Extract startBackgroundIndexing + launch into operation │
│   • Single owner for run, detached error, & lease release   │
│   • Atomic handoff: launch() return transfers ownership     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
═══════════════════════════════════════════════════════════════
                 PRODUCT / ROI EVIDENCE GATE
═══════════════════════════════════════════════════════════════
                               │
                [ Choose ONE Highest-Value Bet ]
                               │
  ┌────────────────────────────┼────────────────────────────┐
  ▼                            ▼                            ▼
Bet A: Zero-Friction         Bet B: Polyglot              Bet C: ACID
Semantic Search Activation   Relationship Intelligence    Control-Plane SQLite
```

---

### Step 1: R0 Qualification & R1 Structural Baseline

* **Purpose**: Establish verified branch health and structural baseline.
* **Verification Gate**:
  ```bash
  git status --short
  git diff --check
  pnpm run check
  pnpm --filter @zokizuan/satori-core test
  pnpm --filter @zokizuan/satori-mcp test
  pnpm --filter @zokizuan/satori-cli test
  pnpm -C packages/mcp contract:check
  ```
* **Structural Reality**:
  * `@zokizuan/satori-core` has **zero** imports from `@zokizuan/satori-mcp`.
  * `assertMutationCurrent` is an **Inversion of Control (IoC)** callback injected by MCP's `MutationLeaseCoordinator` into Core's `IndexMutationPort`, not an illegal package dependency.

---

### Step 2: Phase R2 — `FullIndexOperation` Extraction

* **Plan File**: [`docs/superpowers/plans/2026-08-14-r2-mcp-full-index-operation.md`](../superpowers/plans/2026-08-14-r2-mcp-full-index-operation.md)
* **Problem**: `ManageIndexingHandlers` mixes request-level admission with background full-index lifecycle orchestration and detached promise rejection handling (Cyclomatic 83, Cognitive 248).
* **Bounded Scope**:
  1. `ManageIndexingHandlers` performs request-level admission, path validation, runtime-owner gating, already-indexed decisions, reindex preflight, remote collection deletion, and lease acquisition.
  2. At the launch boundary, the acquired `RootMutationLease` is transferred to `FullIndexOperation.launch(input)`.
  3. `FullIndexOperation.launch()` has atomic acceptance semantics: normal return means it fully owns detached execution, rejection handling (`.catch`), failure persistence, and terminal `mutationLeaseCoordinator.release(lease)`. A synchronous throw means no detached work was retained and caller cleanup remains authoritative.
  4. The request-level `leaseTransferred` guard remains in `ManageIndexingHandlers`, becoming `true` only after `launch()` returns normally.
  5. The existing `startBackgroundIndexing` host override seam is preserved for testability.
* **Stopping Condition**: Background full-index lifecycle, detached failure handling, and terminal lease release have one explicit per-run owner; public behavior, override seams, and compatibility paths are unchanged; all authority/race/contract tests pass. Complexity reduction is recorded as a secondary outcome, not an acceptance criterion.

---

## 4. Product / ROI Evidence Gate (Post-R2)

**No additional architecture phase is pre-authorized after R2.** 

Upon completing R2 and standard release qualification (`pnpm run release:check`), the next initiative is selected from competing candidate bets based on measured real-world friction, reliability problems, or product value:

```text
Measure:
1. Real-World Discovery (tested on a handful of real/unseen repositories):
   - Where does Satori actually fall short on real code maintenance and navigation questions?
   - Did relationship/navigation evidence materially help vs. lexical search?
2. Product Activation Friction: Time from install → MCP startup → first useful semantic search result.
3. Failure Diagnostics: Frequency and cause of indexing, provider, or lease recovery errors.
4. Language Quality: Baseline precision and recall of code navigation across supported languages.
5. Coordinator Friction: Actual engineering hours blocked by search coordinator complexity.
6. Persistence Tax: Runtime bugs or complexity traceable to mutable SnapshotManager JSON files.
```

---

## 5. Candidate ROI Bets (Compete for Next Phase)

### Candidate Bet A — Zero-Friction First Useful Search
* **Hypothesis**: Provider configuration materially increases time-to-first-useful-semantic-search or causes activation failure.
* **Target Scope**: Embedded local embedding model defaults or graceful lexical-first progressive search activation.

### Candidate Bet B — Polyglot Relationship Intelligence
* **Hypothesis**: Upgrading one currently `symbol_only` language (Go, Java, Rust, C#, C++, Scala) to qualified relationship navigation materially improves cross-file and member-call navigation quality on representative repositories.
* **Target Scope**: Implement and benchmark a qualified relationship resolution provider for Go or Java against baseline precision/recall on unseen repositories.

### Candidate Bet C — ACID Control-Plane SQLite
* **Hypothesis**: Replacing mutable `SnapshotManager` JSON persistence with SQLite transactions can eliminate application-managed snapshot locking/merge paths and reduce crash/contention failure modes while preserving existing generation authority and fencing semantics.
* **Target Scope**: Prototype only the mutable MCP control state currently owned by `SnapshotManager`:
  - Repository lifecycle and status
  - Durable operation receipts and phases
  - Tombstones and runtime bookkeeping
* **Explicitly Excluded Initially**: Core generation authority, vector generation payloads, LanceDB storage, navigation generation artifacts, source-freshness proof semantics, and mutation fencing semantics.

### Candidate Bet D — Search Control-Flow Linearization
* **Status**: **Dormant**.
* **Activation Condition**: Activate only if measured evidence shows that `SearchRequestCoordinator` orchestration materially blocks ranking/retrieval experiments, increases regression frequency, or dominates search feature development time.
* **Until Then**: Do not refactor it.

### Candidate Bet E — Context Façade Attrition (Opportunistic)
* **Policy**: No standalone "Context refactoring phase." New and modified first-party code binds directly to domain owners or narrow exported ports (`IndexMutationPort`). `Context` remains the frozen 79-member external compatibility façade and shrinks over time through standard development attrition.

---

## 6. Continuous Test Strangler Policy

* **Rule**: Do NOT create a standalone "Test Refactoring Phase."
* **Policy**:
  1. No new behavior tests may be added to [`handlers.scope.test.ts`](../../packages/mcp/src/core/handlers.scope.test.ts) (~14k LOC) or [`context.test.ts`](../../packages/core/src/core/context.test.ts) (~12k LOC) unless testing those specific façades.
  2. Whenever a domain is substantially modified during an authorized bet, write focused tests in dedicated domain test suites (e.g., [`manage-indexing-handlers.test.ts`](../../packages/mcp/src/core/manage-indexing-handlers.test.ts) or `full-index-operation.test.ts`).
  3. Legacy monolithic test files will naturally starve and shrink over time.

---

## 7. Operating Cadence: Rebaseline & Stop

After every authorized bet:
1. Run relevant tests + normal release qualification (`pnpm run release:check`).
2. Inspect the diff.
3. Merge / rebaseline.
4. Stop before authorizing more architecture.
