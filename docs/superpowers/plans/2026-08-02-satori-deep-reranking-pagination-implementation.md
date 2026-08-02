# Satori Deep Reranking and Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to execute this plan task-by-task.
> Use `superpowers:test-driven-development` for every behavior change and
> `superpowers:verification-before-completion` before every completion claim.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and qualify frozen result-set pagination first, then run
the already-designed LateOn qualification without changing the default ranking
policy unless every frozen gate passes.

**Architecture:** The authoritative product and evidence contract is
[`docs/plans/SATORI_DEEP_LATEON_RERANKING_AND_PAGINATED_DISCLOSURE_PLAN.md`](../../plans/SATORI_DEEP_LATEON_RERANKING_AND_PAGINATED_DISCLOSURE_PLAN.md)
at source commit `a7062a2ac6e99bbf39a83aae344e7d8571f04853`.
Its P0 derivation boundary is corrected by
[`docs/plans/SATORI_DEEP_PAGINATION_P0_AUTHORITY_AMENDMENT.md`](../../plans/SATORI_DEEP_PAGINATION_P0_AUTHORITY_AMENDMENT.md).
This document controls execution order, task ownership, review gates, and
stopping conditions; it does not replace or relax the authority plan. Search
policy owns limits, the result-set cache owns continuation state, grouping and
disclosure remain downstream of ranking, and `Context` remains a composition
root and compatibility façade.

**Tech Stack:** TypeScript, Node.js test runner, Zod, pnpm workspaces, existing
Satori benchmark/capture/replay tooling, ONNX Runtime through the existing
isolated LateOn worker.

## Global Constraints

- Work only in the isolated branch/worktree created for this plan.
- Do not modify either authority document during implementation. A
  contradiction is a blocker requiring another explicit plan correction, not
  permission to improvise.
- Track order is `P0 → P1 → P1.1 → P1.2 → P2`. Task 7/L0 may begin only after
  P2 has a passing immutable receipt; Tasks 8–10 remain closed until L0 freezes
  six independent repository families in every decision-bearing split or
  records `insufficient_evidence`.
- Track I is terminally deferred as `compact_result_index_deferred`. Do not add
  its public option, fields, or implementation in this execution. Preserve the
  decision in
  `docs/evidence/deep-result-index-i0-20260802/I0_DEFERRAL_RECEIPT.md`.
- Baseline `B` remains the default product ranking policy. Every neural
  candidate stays disabled until held-out adjudication and a separate
  production-policy decision pass.
- Do not create, query, or inspect held-out indexes before Task 10 explicitly
  opens them. Do not tune after any held-out result is visible.
- Do not add dependencies, create a second persisted neural index, change global
  path weights, add query/repository exceptions, or move domain logic into
  `Context`.
- One implementation writer is active at a time. Read-only discovery may run in
  parallel. Latency, memory, indexing, and neural measurements run sequentially
  in isolated processes.
- Every behavior change follows RED → verify expected failure → minimal GREEN →
  focused verification. Tests assert observable behavior and hand-derived
  values rather than source text or production helper output.
- Every task receives an independent spec-and-quality review. A task is complete
  only after findings are resolved, focused verification passes, the complete
  task diff is inspected, and its evidence is recorded in the SDD ledger.
- Candidate membership, eligibility, publication/source identity, exact pins,
  grouping, fallback product state, and continuation order are zero-regression
  invariants.
- A blocked prerequisite stops its dependent tasks. Never reinterpret a local
  test pass as authorization to enter the next track.

## Controller procedure

1. Run `sdd-workspace` for this file and keep the plan-qualified ledger in the
   returned directory.
2. Before each task, record `BASE=$(git rev-parse HEAD)` and generate that task's
   brief with `task-brief`.
3. Give a fresh implementer only the brief, required interfaces from completed
   tasks, an owned report path, and the global constraints above.
4. After implementation, inspect repository status and the complete diff. Run
   the task's focused checks directly; never rely only on an agent report.
5. Generate a review package from the recorded base and dispatch an independent
   reviewer. Resolve findings through the bounded fix loop before advancing.
6. Record task status, revisions, commands, results, artifact digests, reviewer
   verdict, and any terminal outcome in the ledger.
7. At the end, dispatch one whole-branch reviewer and run only the broader checks
   invalidated by the complete change.

---

### Task 1: Freeze Track P/P0 authority

**Files:**
- Create: `scripts/satori-search-pagination-bound-measure.mjs`
- Create: `scripts/satori-search-pagination-bound-measure.test.mjs`
- Create: `docs/evidence/deep-pagination-p0-20260802/P0_BOUND_RECEIPT.md`
- Inspect only: `packages/mcp/src/core/search-constants.ts`
- Inspect only: `packages/mcp/src/core/search-policy.ts`
- Inspect only: `packages/mcp/src/core/search-result-set-cache.ts`
- Inspect only: `packages/mcp/src/core/search-disclosure.ts`
- Inspect only: `packages/mcp/src/core/search-exact-fast-path.ts`
- Inspect only: `packages/mcp/src/core/search-query-support.ts`
- Inspect only: `packages/mcp/src/core/search-execution.ts`

**Interfaces:**
- Consumes: authority-plan P0 formula and current response/cache contracts.
- Produces: exact frozen values and formulas for Task 2, or terminal outcome
  `pagination_bound_derivation_blocked`.

- [ ] **Step 1: Record the immutable input identity**

  Record source revision/tree, authority-plan digest, Node/pnpm versions, and
  every source constant consumed by the measurement.

- [ ] **Step 2: Write a failing measurement-contract test**

  The test must fail until the measurement reports all of:
  `requestedTotal`, `MAX_FROZEN_RESULTS`, `MAX_PAGE_SIZE`,
  `MAX_RESULT_SET_ENTRY_BYTES`, `MAX_RESULT_SET_CACHE_BYTES`,
  `MIN_RESIDENT_RESULT_SETS`, normal/debug response bytes, semantic-pass count,
  supplement depths, and exact-fast-path maximum. It must reject non-safe
  integers, per-entry/global budget conflation, and a cache unable to retain the
  frozen minimum resident count.

- [ ] **Step 3: Verify RED**

  Run:

  ```bash
  node --import tsx --test scripts/satori-search-pagination-bound-measure.test.mjs
  ```

  Expected: failure because the bounded measurement artifact is absent.

- [ ] **Step 4: Implement the deterministic measurement**

  Derive the semantic-path union as:

  ```text
  2 * SEARCH_MAX_CANDIDATES
    + MAX_TRACKED_LEXICAL_RESULTS
    + MAX_DIRTY_OVERLAY_RESULTS
    + MAX_LIVE_PATH_RESULTS
  = 200
  ```

  Treat `200` as admissible only if the exact-registry path is planned to clamp
  to the same bound. Measure canonical maximum-shape grouped projections and
  frozen-set serialization rather than assuming an average result size. Keep
  per-entry and per-session aggregate cache budgets distinct. Ten full results
  remain the default initial page; `MAX_PAGE_SIZE` is an independently derived
  maximum.

- [ ] **Step 5: Verify GREEN and freeze the receipt**

  Run the measurement test plus existing focused policy/cache/disclosure tests.
  The receipt must include every formula, fixture digest, observation, exact
  consumer, uncertainty, and the terminal decision. If a numeric value remains
  unsupported, record `pagination_bound_derivation_blocked` and stop; do not
  select a convenient constant.

### Task 2: Separate logical total, retrieval, reranker, page, and cursor limits

**Files:**
- Modify: `packages/mcp/src/core/search-constants.ts`
- Modify: `packages/mcp/src/core/search-policy.ts`
- Modify: `packages/mcp/src/core/search-policy.test.ts`
- Modify: `packages/mcp/src/core/capabilities.ts`
- Modify: `packages/mcp/src/core/capabilities.test.ts`
- Modify: `packages/mcp/src/tools/search_codebase.ts`
- Modify: `packages/mcp/src/tools/search_codebase.test.ts`
- Modify: `packages/mcp/src/tools/continue_search.ts`
- Modify: `packages/mcp/src/tools/continue_search.test.ts`
- Modify: `packages/mcp/src/tools/registry.test.ts`
- Modify: `packages/mcp/src/core/search-exact-fast-path.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/core/handlers.scope.test.ts`

**Interfaces:**
- Consumes: exact P0 values and policy identity from Task 1.
- Produces: one production-owned pagination policy consumed by schemas,
  handlers, exact retrieval, continuation validation, and capability
  advertisement.

- [ ] Write failing tests proving that a slow Potion profile accepts logical
  totals above 15, `disclosureLimit` and continuation page size use only
  `MAX_PAGE_SIZE`, offsets use only `MAX_FROZEN_RESULTS`, and exact-fast-path
  admission never exceeds `MAX_FROZEN_RESULTS`.
- [ ] Verify the new tests fail for the current profile-coupled behavior.
- [ ] Implement positive-safe-integer validation at public and direct-handler
  boundaries. Preserve adaptive retrieval at a maximum depth of 80 and keep
  reranker depth independent.
- [ ] Run the focused policy/capability/tool/exact-path tests and inspect the
  complete task diff.

### Task 3: Preserve the complete bounded grouped result set

**Files:**
- Modify: `packages/mcp/src/core/search-result-finalization.ts`
- Modify: `packages/mcp/src/core/search-disclosure.ts`
- Modify: `packages/mcp/src/core/search-disclosure.test.ts`
- Modify: `packages/mcp/src/core/search-exact-registry-hit.ts`
- Create: `packages/mcp/src/core/search-exact-registry-hit.test.ts`
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/search-response-envelopes.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/core/handlers.scope.test.ts`

**Interfaces:**
- Consumes: Task 2 pagination policy.
- Produces: requested/effective/available/frozen/returned/remaining counts and a
  complete bounded final group order independent of initial disclosure.

- [ ] Write failing tests for totals `1, 10, 15, 16, 32, 50, 80`, a request
  larger than available groups, normal UTF-8 response truncation, and an
  initial first group that cannot fit after preview truncation. The last case
  must return the explicit page-too-large failure and must not create a handle.
- [ ] Verify the current `completeDisclosureOrder.slice(0, input.limit)` and
  profile-coupled paths fail the intended contract.
- [ ] Implement the smallest finalization/envelope changes preserving grouping,
  diversity, scores, actions, and initial default disclosure of 10. Route exact
  registry groups through the same count/byte/continuation finalization without
  adding vector work or weakening exact pins.
- [ ] Run focused finalization/disclosure/handler tests and inspect the task diff.

### Task 4: Bind every frozen ranked-set payload

**Files:**
- Create: `packages/mcp/src/core/search-result-set-identity.ts`
- Create: `packages/mcp/src/core/search-result-set-identity.test.ts`
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/core/handlers.scope.test.ts`

**Interfaces:**
- Consumes: Task 3 final group projection.
- Produces: canonical per-group projection digests and `rankedSetDigest` bound to
  publication, source observations, query/ranking/disclosure policies, provider
  model/profile or baseline identity, projection identity, and complete order.

- [ ] Write failing tests proving that changing target, score, evidence,
  navigation, recommended action, order, publication, policy, model, or
  projection changes the digest while equivalent object key order does not.
- [ ] Verify RED, then implement canonical serialization and hashing in the new
  pure owner.
- [ ] Publish the digest in the initial continuation contract, echo it on every
  page, consume the existing `queryPolicyDigest`, and remove a handle on any
  binding mismatch.
- [ ] Run identity and continuation tests and inspect the task diff.

### Task 5: Separate cache entry admission from aggregate capacity

**Files:**
- Modify: `packages/mcp/src/core/search-result-set-cache.ts`
- Modify: `packages/mcp/src/core/search-result-set-cache.test.ts`
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/core/handlers.scope.test.ts`
- Modify: `packages/mcp/src/server/shared-runtime.ts`
- Modify: `packages/mcp/src/server/shared-runtime.test.ts`
- Modify: `packages/mcp/src/server/provider-runtime.ts`
- Modify: `packages/mcp/src/server/provider-runtime.test.ts`

**Interfaces:**
- Consumes: the P0 authority amendment's byte/session budgets and Task 4 bound
  frozen set.
- Produces: explicit cache-admission result and warning
  `SEARCH_RESULT_SET_NOT_CACHE_ADMISSIBLE` without an invalid handle, plus one
  runtime aggregate budget that preserves session-scoped handle authority.

- [ ] Write failing unit tests for per-entry rejection, aggregate LRU eviction,
  replay-page reservation, resident-set capacity, and unchanged state after a
  failed admission.
- [ ] Write failing runtime tests proving two sessions share aggregate capacity,
  cannot resolve each other's handles, route local/provider owners only within
  one scope, and purge owned payloads on shutdown.
- [ ] Write a failing handler test proving an oversized frozen set returns its
  valid initial page, truthful counts, no handle, and the explicit warning.
- [ ] Verify RED, then implement typed admission without throwing away the valid
  initial search response or silently dropping tail groups.
- [ ] Run focused cache/handler tests and inspect the task diff.

### Task 6: Qualify Track P/P2 continuation

**Files:**
- Modify: `packages/mcp/src/core/handlers.scope.test.ts`
- Modify only if a test demonstrates a defect: `packages/mcp/src/core/handlers.ts`
- Modify only if a test demonstrates a defect: `packages/mcp/src/core/search-disclosure.ts`
- Modify only if a test demonstrates a defect: `packages/mcp/src/core/search-result-set-cache.ts`
- Create: `docs/evidence/deep-pagination-p2-20260802/P2_QUALIFICATION_RECEIPT.md`

**Interfaces:**
- Consumes: Tasks 2–5 frozen result-set implementation.
- Produces: one Track P terminal receipt.

- [ ] Add the cross-track regression: paginate an already-LateOn-ranked frozen
  set and prove exact neural final order plus zero additional reranker calls,
  candidates, or bytes.
- [ ] Prove every group appears exactly once across initial and continuation
  pages; retries are byte-identical; expiry, eviction, wrong offset, owner
  shutdown, publication/source mismatch, and response-byte truncation fail
  explicitly without recomputation.
- [ ] Run the focused Track P matrix, MCP typecheck, and MCP package tests.
- [ ] Freeze source/tree, policy, test-command, result, and artifact digests in
  the P2 receipt. Stop on any identity, safety, or order failure.

### Task 7: Expand and freeze Track L/L0 authority

**Files:**
- Modify: the versioned cross-repository task manifest and its schema/builder.
- Modify: the manifest/builder focused tests.
- Create: `docs/evidence/deep-lateon-l0-20260802/L0_AUTHORITY_RECEIPT.md`

**Interfaces:**
- Consumes: passing Task 6 receipt and immutable prior D-L16/D-L32 artifacts.
- Produces: sealed tuning/held-out repository identities, preregistered new-arm
  artifacts, and an L0 authority receipt.

- [ ] Add independently reviewed repositories until every decision-bearing
  split has at least six repository families, six positive tasks and two
  reviewed negative tasks per repository, and at least 48 tasks.
- [ ] Reject every repository/task with leakage from prior LateOn tuning,
  `tradingview_ratio`, owner-score calibration, or implementation fixtures.
- [ ] Seal explicit split fields, revisions, tree/source digests, oracles,
  negative owners, candidate captures, model/tokenizer/ONNX/loader/profile,
  projection, execution order, quality gates, and absolute resource profile.
- [ ] Do not create/query held-out indexes or view contender outputs. If the
  repository minimum cannot be met, record `insufficient_evidence` and stop
  Tasks 8–10.

### Task 8: Replay known authority and measure only new arms

**Files:**
- Modify only the existing benchmark/capture/replay/scoring owners required by a
  demonstrated compatibility failure.
- Create: `docs/evidence/deep-lateon-l1-l2-20260802/L1_L2_RECEIPT.md`

**Interfaces:**
- Consumes: passing L0 receipt, immutable D-L16/D-L32 projection-v1 artifacts,
  and the Track P baseline.
- Produces: exact replay evidence for known arms and preregistered results only
  for projection-v1 D-L50 and frozen projection-v2 arms.

- [ ] Revalidate and replay known D-L16/D-L32 membership, eligibility, scores,
  order, model, candidates, and projection digest without rescoring unchanged
  work.
- [ ] Score only preregistered new quality arms. Run optimized D16/D32/D50
  resource measurements in isolated, counterbalanced processes.
- [ ] Preserve neural-disabled baseline and frozen candidates; stop on any
  identity, fallback, exact-control, negative-safety, or pagination mismatch.
- [ ] Record complete rank transitions, quality intervals, latency, memory,
  projected bytes, and immutable artifact digests.

### Task 9: Apply L3 and conditionally extend the disabled provider

**Files:**
- Modify only if one new arm passes every L3 gate:
  `packages/mcp/src/server/lateon-reranker-protocol.ts`,
  `packages/mcp/src/server/lateon-reranker.ts`, its runtime-profile owner, and
  their focused tests.
- Modify only if projection v2 is the selected passing arm:
  `packages/mcp/src/core/search-rerank-document.ts` and its tests,
  `packages/mcp/src/server/lateon-reranker-worker.ts` and its tests, and the
  versioned runtime-profile asset and loader.
- Create: `docs/evidence/deep-lateon-l3-l4-20260802/L3_L4_RECEIPT.md`

**Interfaces:**
- Consumes: Task 8 receipt and the authority plan's mechanical decision rules.
- Produces: `baseline_b_retained`, `insufficient_evidence`, a rejection outcome,
  or exactly one disabled candidate implementation.

- [ ] Select none unless one new arm clears practical effects, adjusted
  intervals, protected margins, absolute resources, identity, fallback, and
  pagination safety.
- [ ] If none passes, write the terminal receipt and make no runtime code change.
- [ ] If one passes, write failing protocol/profile/queue/cancellation tests,
  verify RED, then add only the selected depth/projection as disabled.
- [ ] Prove projection identity negotiation, bounded active/queued work,
  cancellation in every phase, deadline including queue wait, terminated worker
  shutdown, and untouched deterministic fallback.

### Task 10: Held-out adjudication and final policy receipt

**Files:**
- Create only after explicit held-out authorization:
  `docs/evidence/deep-lateon-l5-l6-20260802/L5_L6_RECEIPT.md`

**Interfaces:**
- Consumes: exact reproduction of Task 9's tuning receipt.
- Produces: one Track L terminal outcome. It does not itself authorize release.

- [ ] Enter this task only if Task 9 produced exactly one selected disabled
  candidate implementation and explicit held-out authorization exists. If Task
  9 retained `B`, rejected every arm, or recorded `insufficient_evidence`, keep
  that terminal outcome and do not access any held-out artifact.
- [ ] Confirm held-out opening authority, immutable seal, and one-time execution
  procedure before accessing any held-out artifact.
- [ ] Run the selected disabled candidate once against held-out evidence without
  tuning or threshold changes.
- [ ] Retain baseline `B` on any failed or inconclusive gate. A full pass may
  record `lateon_default_policy_qualified_after_held_out`, but production
  activation remains a separate policy decision.
- [ ] Dispatch a whole-branch reviewer, resolve any load-bearing finding, run the
  final invalidated verification set, and freeze independent Track P, L, and I
  terminal outcomes.
