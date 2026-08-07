# Satori Native Reranker Ordering Implementation Plan

> **STATUS: IMPLEMENTED / HISTORICAL — DO NOT EXECUTE.** Native reranker ordering
> is now mandatory in production (`search_native_retrieval_order_v1` /
> `search_native_reranker_order_v1`). The staged `legacy_rrf` rollout sections
> below describe implementation history only; the legacy mode, its configuration
> variable, and its scoring machinery have been deleted. Setting
> `SATORI_RERANK_APPLICATION_MODE` now fails startup by design.

**Goal:** Remove Satori's local relevance weighting and fixed reranker-RRF blend so that deterministic rules control eligibility and safety, retrieval creates the candidate pool, and a complete validated reranker response supplies the authoritative result order.

**Architecture:** Ship the change in three production-safe releases. Release 1 adds a `legacy_rrf | native_order` application mode with `legacy_rrf` as the compatibility default; Release 2 makes `native_order` the default while retaining explicit rollback; Release 3 deletes the legacy score path and its hardcoded relevance constants. The reranker may reorder only candidates already selected by retrieval and deterministic filters. Exact ownership, permissions, freshness, operator filters, byte limits, failure fallback, grouping, disclosure, frozen pagination, and continuation revalidation remain hard contracts.

**Tech Stack:** TypeScript, Node.js, existing `@zokizuan/satori-core` reranker interfaces, exact-file `node --import tsx --test` tests, pnpm workspaces, existing MCP search execution/finalization pipeline.

## Global Constraints

- Base every task on the corrected `master`; record `git rev-parse HEAD` before dispatch.
- Do not restore or depend on Ranking V3 plans, task graphs, cards, receipts, training corpora, learned artifacts, qualification registries, LOFO jobs, or held-out gates.
- Do not train, fit, calibrate, blend, normalize, or threshold reranker scores.
- `RerankResult.relevanceScore` is retained for bounded diagnostics only; provider order is the relevance decision.
- No repository-specific weights or profiles.
- No cross-repository metric is a merge or release gate. Repository smoke runs are observational only.
- Preserve deterministic eligibility: scope, `must:`, `exclude:`, `lang:`, `path:`, permissions, publication/freshness, exact registry, and byte/candidate ceilings.
- Preserve one transactional failure rule: any malformed, incomplete, duplicated, foreign, non-finite, timed-out, or failed reranker response leaves the pre-rerank order unchanged.
- Preserve frozen pagination: continuation never retrieves, scores, or reranks again.
- Preserve provider limits, reranker timeout/retry contracts, cancellation, and input byte ceilings.
- Retrieval fusion is outside this project. Core/MCP retrieval RRF may continue to produce the candidate-pool order; it must not override a successful native reranker order.
- Every code task starts with one focused failing test, makes the minimum implementation, finishes green, receives an independent review, and creates one semantic commit.
- Only the named owner may modify a central file. Tasks that need an unlisted file must stop and request a reviewed scope amendment.

---

## 1. Approved Runtime Contract

### 1.1 Configured reranker succeeds

```text
query parsing
-> semantic / lexical / exact candidate retrieval
-> deterministic eligibility and security filters
-> deterministic exact-owner boundary
-> bounded reranker candidate selection
-> labeled reranker document projection
-> complete provider response validation on detached state
-> provider order applied only to the selected candidate slots
-> grouping preserves first candidate occurrence
-> disclosure and frozen pagination preserve that order
```

### 1.2 No reranker or reranker skipped

```text
retrieval candidate union
-> deterministic eligibility and exact controls
-> stable retrieval order
-> grouping / disclosure / frozen pagination
```

### 1.3 Reranker fails

```text
pre-rerank ordered snapshot
-> provider attempt on detached data
-> any terminal failure
-> discard all provider output
-> publish the exact pre-rerank snapshot
-> truthful RERANKER_FAILED diagnostics
```

### 1.4 Exact ownership

- One sole exact candidate: skip reranking.
- Exact-owned rank 1 plus a nonempty tail: keep rank 1 fixed and rerank the eligible suffix.
- No exact-owned rank 1: rerank from position 0.
- A `must:` match by itself is not an exact-owner signal.

### 1.5 Authoritative order

A successful native rerank changes array order, not local scores. No downstream code may reorder native results by `finalScore`, path category, changed-file status, agent-fit, entrypoint ownership, grouped support boost, or near-tie owner preference.

---

## 2. Production Release Sequence

### Release 1: opt-in native ordering

- Add `SATORI_RERANK_APPLICATION_MODE=legacy_rrf|native_order`.
- Default remains `legacy_rrf`.
- Native mode uses provider order; legacy mode remains byte-compatible.
- Shared-runtime identity includes application mode, preventing clients with different modes from sharing one host.
- Rollback is configuration-only: set `legacy_rrf` and restart the managed runtime.

### Release 2: native ordering default

- Default becomes `native_order` for connected and offline runtimes.
- Explicit `legacy_rrf` remains available as an emergency compatibility rollback.
- Installer, doctor, startup summary, and documentation report the selected mode.

### Release 3: remove legacy relevance scoring

- Delete `legacy_rrf` application mode.
- Delete reranker RRF `k=10` and weight `1.0`.
- Delete path multipliers, agent-fit multipliers, changed-file relevance boost, entrypoint-owner score boost, and numeric lexical contribution to production order.
- Retain path classification only where needed for scope filtering and noise hints.
- Retain exact lexical detection separately from numeric lexical scoring.

---

## 3. Central File Ownership

| File | Exclusive owner sequence |
|---|---|
| `packages/mcp/src/core/search-execution.ts` | Task 6 -> Task 8 -> Task 13 -> Task 14, strictly sequential |
| `packages/mcp/src/core/search-constants.ts` | Task 5 -> Task 12 -> Task 13, strictly sequential |
| `packages/mcp/src/core/search-ranking-policy.ts` | Task 14 only |
| `packages/mcp/src/core/search-types.ts` | Task 7 -> Task 9 -> Task 15, strictly sequential |
| `packages/mcp/src/core/search-group-results.ts` | Task 7 -> Task 14, strictly sequential |
| `packages/mcp/src/core/search-group-ordering.ts` | Task 7 -> Task 14, strictly sequential |
| `packages/mcp/src/core/search-result-finalization.ts` | Task 9 -> Task 13 -> Task 15, strictly sequential |
| `packages/mcp/src/config.ts` | Task 5 -> Task 12 -> Task 13, strictly sequential |
| `packages/cli/src/runtime-config.ts` | Task 5 -> Task 12 -> Task 13, strictly sequential |
| `packages/mcp/src/server/shared-runtime-identity.ts` | Task 5 -> Task 13, strictly sequential |
| `packages/mcp/src/core/handlers.ts` | Task 6 -> Task 9, strictly sequential |
| `packages/mcp/src/core/search-rerank-document.ts` | Task 4 test-only contract verification; production bytes unchanged in Release 1 |
| `packages/mcp/src/core/search-rerank-document-v2.ts` | Task 4 test-only contract verification; production bytes unchanged in Release 1 |
| `packages/mcp/src/core/search-rerank-projection.ts` | Task 4 test-only contract verification; production bytes unchanged in Release 1 |
| `packages/mcp/src/core/search-query-planning.ts` | Task 15 only |
| `packages/mcp/src/core/search-lexical-scoring.ts` | Task 15 only |

Tasks 1-5 may proceed in parallel only where they do not share a file. Tasks 6-10 are sequential integration tasks. Tasks 12-15 are separate release changes and must not be merged into Release 1.

### 3.1 Mandatory small-agent card splits

The numbered tasks below are release work packages. Dispatch the following cards, not one oversized agent per parent task:

| Card | Exact files | Depends on | Focused proof | Commit message |
|---|---|---|---|---|
| 5A | `packages/mcp/src/config.ts`, `packages/mcp/src/config.test.ts`, `packages/mcp/src/core/search-constants.ts` | Task 0 | MCP config test resolves/rejects mode | `feat(config): add rerank application mode` |
| 5B | `packages/cli/src/runtime-config.ts`, `packages/cli/src/runtime-config.test.ts` | 5A | CLI doctor reports/rejects mode | `feat(cli): validate rerank application mode` |
| 5C | `packages/mcp/src/server/shared-runtime-identity.ts`, `.test.ts` | 5A | mode changes shared-runtime hash | `feat(runtime): bind rerank mode to shared identity` |
| 6A | `packages/mcp/src/core/search-execution.ts`, `packages/mcp/src/core/handlers.ts`, `packages/mcp/src/core/handlers.native-rerank-mode.test.ts` | Tasks 1-5 | config value reaches execution; native pre-rerank snapshot uses retrieval order | `feat(search): plumb native rerank mode` |
| 6B | `packages/mcp/src/core/search-execution.ts`, `packages/mcp/src/core/search-execution.native-rerank.test.ts` | 6A | complete response applies provider order; malformed response preserves snapshot | `feat(search): apply native provider order` |
| 7A | `packages/mcp/src/core/search-types.ts`, `packages/mcp/src/core/search-group-results.ts`, new native grouping test | 6B | representative follows minimum authoritative rank | `feat(search): carry authoritative candidate rank` |
| 7B | `packages/mcp/src/core/search-group-ordering.ts`, existing/new ordering tests | 7A | group sort preserves authoritative rank | `feat(search): preserve native group order` |
| 8 | `packages/mcp/src/core/search-execution.ts`, exact/native tests | 7B | fixed exact prefix plus reranked suffix | `fix(search): rerank suffix behind exact owner` |
| 9A | `packages/mcp/src/core/search-types.ts`, `packages/mcp/src/core/search-result-finalization.ts`, focused projection tests | 8 | truthful mode/order diagnostics; no native rankK/weight | `feat(search): project native order diagnostics` |
| 9B | `packages/mcp/src/core/handlers.ts`, `packages/mcp/src/core/search-result-set-identity.test.ts`, `packages/mcp/src/core/handlers.golden.test.ts` | 9A | policy identity changes ranked-set digest and stale handling | `feat(search): bind native order to ranked sets` |
| 10 | integration test file only | 9B | complete production failure matrix | `test(search): cover native reranker contracts` |
| 13A | config, CLI config, shared-runtime identity and their tests | Task 12 | `legacy_rrf` rejected and absent from identity | `refactor(config): remove legacy rerank mode` |
| 13B | `search-execution.ts`, `search-constants.ts`, execution tests | 13A | no reranker RRF arithmetic remains | `refactor(search): remove reranker score blending` |
| 13C | `search-result-finalization.ts`, diagnostic tests/docs | 13B | no rankK/weight projection remains | `refactor(search): remove legacy rerank diagnostics` |
| 14A | `search-execution.ts`, `search-constants.ts`, focused tests | 13C | path and changed-file values cannot affect order | `refactor(search): remove path and changed-file boosts` |
| 14B | `search-ranking-policy.ts`, `.test.ts`, `search-execution.ts` | 14A | agent-fit and entrypoint values cannot affect order | `refactor(search): remove agent-fit ranking` |
| 14C | `search-group-results.ts`, `search-group-ordering.ts`, grouping tests | 14B | support boost and near-tie preference cannot reorder | `refactor(search): remove grouped score heuristics` |
| 15A | `search-lexical-scoring.ts`, `.test.ts` | 14C | exact-evidence detector preserves exact semantics | `refactor(search): extract lexical exact evidence` |
| 15B | `search-query-planning.ts`, `.test.ts`, `search-execution.ts`, focused tests | 15A | lexical weights removed; execution consumes exact evidence only | `refactor(search): remove lexical ranking weights` |
| 15C | `search-types.ts`, `search-result-finalization.ts`, `search-candidate-survival.ts`, its test, capture/replay scripts and tests | 15B | schema compatibility and new emission contract | `refactor(search): retire lexical score telemetry` |

For every row: one agent, one isolated worktree, one first-RED test, one semantic commit, specification review, then code-quality review. A parent task is complete only after all of its cards merge in table order.

---

## 4. Task Breakdown

### Task 0: Freeze the corrected-master baseline and retire Ranking V3 as an active plan

**Files:**
- Create: `docs/superpowers/specs/2026-08-07-native-reranker-ordering-design.md`
- Create: `docs/evidence/native-reranker-baseline-20260807/BASELINE.md`
- Modify: `docs/plans/SATORI_RANKING_POLICY_V3_PLAN.md`; add a top-level `ABANDONED / DO NOT EXECUTE` banner without rewriting historical contents.

**Interfaces:**
- Consumes: corrected `master` commit and clean-tree proof.
- Produces: immutable baseline commit, file inventory, and explicit statement that Ranking V3 has no dispatch authority.

- [ ] **Step 1: Capture repository identity**

```bash
git status --short
git rev-parse HEAD
git rev-parse HEAD^{tree}
git log -1 --format='%H%n%aI%n%s'
```

Expected: clean tree and one exact base commit/tree.

- [ ] **Step 2: Record the relevance-opinion inventory**

In `BASELINE.md`, record symbols and current behavior for:

```text
SCOPE_PATH_MULTIPLIERS
SEARCH_CHANGED_FIRST_MULTIPLIER
SEARCH_RERANK_RRF_K
SEARCH_RERANK_WEIGHT
computeSearchCandidateFinalScore
resolveAgentFitMultiplier
resolveEntrypointOwnerScoreComponent
scoreCandidateLexicalEvidence
rerankSearchCandidates
computeSearchGroupScore
sortGroupedSearchResults
```

- [ ] **Step 3: Record preserved contracts**

```text
scope/lang/path/must/exclude filtering
exact registry and exact pinning
freshness/publication checks
reranker selection and byte limits
failure fallback
pagination and continuation identity
```

- [ ] **Step 4: Verify no active Ranking V3 runtime artifacts survived the master correction**

```bash
git ls-files | grep -E 'ranking-v3|RANKING_POLICY_V3|ranking_policy_v3' || true
```

Classify any remaining file as historical documentation, test fixture, or prohibited active machinery. Do not delete unrelated historical evidence in this task.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-08-07-native-reranker-ordering-design.md \
  docs/evidence/native-reranker-baseline-20260807/BASELINE.md \
  docs/plans/SATORI_RANKING_POLICY_V3_PLAN.md
git commit -m "docs(search): adopt native reranker ordering design"
```

---

### Task 1: Add complete native reranker response validation

**Files:**
- Create: `packages/mcp/src/core/search-native-rerank.ts`
- Create: `packages/mcp/src/core/search-native-rerank.test.ts`

**Interfaces:**
- Consumes: `RerankResult` from `@zokizuan/satori-core`.
- Produces:

```ts
export type ValidatedNativeRerankItem = Readonly<{
    candidateId: string;
    originalIndex: number;
    providerRank: number; // one-based
    relevanceScore: number;
}>;

export function validateNativeRerankResults(input: {
    candidateIds: readonly string[];
    results: readonly RerankResult[];
}): readonly ValidatedNativeRerankItem[];

export function applyNativeRerankToSelectedSlots<T>(input: {
    allCandidates: readonly T[];
    selectedCandidateIds: readonly string[];
    orderedItems: readonly ValidatedNativeRerankItem[];
    identify: (candidate: T) => string;
}): T[];
```

**Required semantics:**

- Candidate IDs are nonempty and unique.
- Result count equals candidate count.
- Every result index is an integer in range and appears once.
- Every relevance score is finite.
- Provider rank is array position + 1.
- `applyNativeRerankToSelectedSlots` creates a new array and never mutates input.
- Only slots originally occupied by selected IDs change.
- Unselected candidates remain at exactly their original indices.
- The ordered items must be a complete permutation of selected IDs.

- [ ] **Step 1: Write the failing validation tests**

```ts
test("validates_complete_native_reranker_order_and_retains_scores", () => {
    const result = validateNativeRerankResults({
        candidateIds: ["a", "b", "c"],
        results: [
            { index: 2, relevanceScore: 0.91 },
            { index: 0, relevanceScore: 0.62 },
            { index: 1, relevanceScore: 0.14 },
        ],
    });
    assert.deepEqual(result, [
        { candidateId: "c", originalIndex: 2, providerRank: 1, relevanceScore: 0.91 },
        { candidateId: "a", originalIndex: 0, providerRank: 2, relevanceScore: 0.62 },
        { candidateId: "b", originalIndex: 1, providerRank: 3, relevanceScore: 0.14 },
    ]);
});

test("rejects_duplicate_missing_foreign_and_non_finite_results", () => {
    // Separate assertions for count mismatch, duplicate index, out-of-range index,
    // NaN, +Infinity, and duplicate candidate IDs.
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
node --import tsx --test packages/mcp/src/core/search-native-rerank.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement exact validation**

Use `Number.isInteger`, `Number.isFinite`, `Set`, and deterministic error codes:

```text
native_rerank_candidate_ids_invalid
native_rerank_result_count_mismatch
native_rerank_result_index_invalid
native_rerank_result_duplicate_index
native_rerank_result_non_finite_score
native_rerank_result_incomplete
```

- [ ] **Step 4: Write the failing slot-application tests**

```ts
test("reorders_only_selected_slots", () => {
    const all = ["x", "a", "y", "b", "c", "z"];
    const ordered = validateNativeRerankResults({
        candidateIds: ["a", "b", "c"],
        results: [
            { index: 2, relevanceScore: 0.9 },
            { index: 0, relevanceScore: 0.8 },
            { index: 1, relevanceScore: 0.7 },
        ],
    });
    assert.deepEqual(applyNativeRerankToSelectedSlots({
        allCandidates: all,
        selectedCandidateIds: ["a", "b", "c"],
        orderedItems: ordered,
        identify: (value) => value,
    }), ["x", "c", "y", "a", "b", "z"]);
    assert.deepEqual(all, ["x", "a", "y", "b", "c", "z"]);
});
```

- [ ] **Step 5: Run tests and confirm GREEN**

```bash
node --import tsx --test packages/mcp/src/core/search-native-rerank.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/core/search-native-rerank.ts \
  packages/mcp/src/core/search-native-rerank.test.ts
git commit -m "feat(search): validate native reranker ordering"
```

---

### Task 2: Add exact-prefix boundary resolution

**Files:**
- Create: `packages/mcp/src/core/search-rerank-boundary.ts`
- Create: `packages/mcp/src/core/search-rerank-boundary.test.ts`

**Interfaces:**

```ts
export type RerankBoundaryDecision =
    | { kind: "skip"; reason: "sole_exact_result" }
    | { kind: "rerank"; startIndex: 0 | 1; reason: "full_set" | "exact_prefix" };

export function resolveRerankBoundary(input: {
    candidates: ReadonlyArray<{
        exactLexicalMatch: boolean;
        passesMatchedMust: boolean;
    }>;
    exactMatchPinningEnabled: boolean;
    mustTokenCount: number;
}): RerankBoundaryDecision;
```

**Required semantics:**

- Empty input returns `{ kind: "rerank", startIndex: 0, reason: "full_set" }`; caller will make no request.
- Sole exact result returns `skip`.
- Exact top owned by exact pinning returns `startIndex: 1`.
- Exact top satisfying an active `must:` contract returns `startIndex: 1` only when the existing exact-control contract says it owns the result.
- A top that merely satisfies `must:` but is not exact returns `startIndex: 0`.
- A lower-ranked exact candidate does not protect the prefix.

- [ ] **Step 1: Write failing tests**

Port the existing exact-pin cases and replace the old whole-tail skip assertion with suffix behavior.

- [ ] **Step 2: Confirm RED**

```bash
node --import tsx --test packages/mcp/src/core/search-rerank-boundary.test.ts
```

- [ ] **Step 3: Implement the pure resolver**

No imports from `search-execution.ts`.

- [ ] **Step 4: Confirm GREEN**

```bash
node --import tsx --test packages/mcp/src/core/search-rerank-boundary.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/core/search-rerank-boundary.ts \
  packages/mcp/src/core/search-rerank-boundary.test.ts
git commit -m "feat(search): preserve exact prefix during reranking"
```

---

### Task 3: Add stable native retrieval ordering

**Files:**
- Create: `packages/mcp/src/core/search-retrieval-order.ts`
- Create: `packages/mcp/src/core/search-retrieval-order.test.ts`
- No other production files. Implement the ordinal tie-breakers inside the new module so this task does not alter legacy ranking code.

**Interfaces:**

```ts
export type NativeRetrievalCandidateLike = {
    result: {
        relativePath: string;
        startLine?: number | null;
        symbolLabel?: string | null;
        symbolId?: string | null;
    };
    fusionScore: number;
    passesMatchedMust: boolean;
    exactLexicalMatch: boolean;
    exactMatchPinned: boolean;
};

export function sortNativeRetrievalCandidates<T extends NativeRetrievalCandidateLike>(
    candidates: T[],
    options: {
        exactMatchFirst: boolean;
        mustMatchesFirst: boolean;
    },
): { exactMatchPinningApplied: boolean };
```

**Required semantics:**

Order by:

1. `must:` satisfaction when required;
2. exact lexical match when exact pinning is enabled;
3. descending `fusionScore`;
4. deterministic UTF-8/ordinal path;
5. start line;
6. symbol label;
7. symbol ID.

Never inspect:

```text
pathMultiplier
changedFilesMultiplier
agentFitMultiplier
entrypointOwnerScoreBoost
lexicalScore
rerankerScore
```

- [ ] **Step 1: Write the failing test proving hardcoded weights cannot affect native order**

Create candidates where a lower-fusion test candidate carries exaggerated legacy fields and prove the higher-fusion implementation candidate remains first.

- [ ] **Step 2: Confirm RED**

```bash
node --import tsx --test packages/mcp/src/core/search-retrieval-order.test.ts
```

- [ ] **Step 3: Implement the comparator**

Use ordinal string comparison (`a < b ? -1 : 1`), not locale-dependent ordering.

- [ ] **Step 4: Confirm GREEN**

```bash
node --import tsx --test packages/mcp/src/core/search-retrieval-order.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/core/search-retrieval-order.ts \
  packages/mcp/src/core/search-retrieval-order.test.ts
git commit -m "feat(search): add weight-free retrieval ordering"
```

---

### Task 4: Lock the existing reranker projection contracts before changing order

**Files:**
- Modify: `packages/mcp/src/core/search-rerank-document.test.ts`
- Modify: `packages/mcp/src/core/search-rerank-document-v2.test.ts`
- Create: `packages/mcp/src/core/search-rerank-projection.test.ts`
- Production files are read-only in this task:
  - `packages/mcp/src/core/search-rerank-document.ts`
  - `packages/mcp/src/core/search-rerank-document-v2.ts`
  - `packages/mcp/src/core/search-rerank-projection.ts`

**Reason:** Corrected `master` already has two intentional projection contracts. The generic projection supplies path, language, symbol label, and bounded content. The publication-bound v2 projection supplies canonical JSON with path, language, symbol kind, declaration, documentation, query-relevant source, and owner siblings. Native-order rollout must not silently change either provider's qualified document bytes.

**Required semantics:**

- Generic projection remains `search_rerank_document_v1` in Release 1.
- Publication-bound projection remains `search_rerank_document_v2`.
- A provider advertising v2 receives only publication-bound v2 bytes.
- If publication/source/registry binding for v2 cannot be proven, projection returns `undefined` and the rerank attempt follows the existing fail-closed path.
- Neither projection contains local ranking multipliers, final scores, changed-file boosts, or agent-fit values.
- No absolute path or repository-external source is admitted.

- [ ] **Step 1: Strengthen the generic projection contract test**

Assert the exact v1 bytes retain repository-relative path, language, symbol label, and bounded content, and never contain score-field names.

- [ ] **Step 2: Strengthen v2 projection tests**

Assert canonical field order, byte/line ceilings, repository-relative paths, finite bounded output, and absence of local ranking fields.

- [ ] **Step 3: Add the publication-bound bridge RED test**

Create `search-rerank-projection.test.ts` proving:

```text
hash-matched registry-owned source -> v2 text
missing owner -> undefined
source hash mismatch -> undefined
candidate span outside owner -> undefined
absolute/noncanonical path -> undefined
```

- [ ] **Step 4: Run focused tests**

```bash
node --import tsx --test \
  packages/mcp/src/core/search-rerank-document.test.ts \
  packages/mcp/src/core/search-rerank-document-v2.test.ts \
  packages/mcp/src/core/search-rerank-projection.test.ts
```

Expected: tests pass without changing the three production projection files. A required production change is a scope stop, not part of native-order integration.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/core/search-rerank-document.test.ts \
  packages/mcp/src/core/search-rerank-document-v2.test.ts \
  packages/mcp/src/core/search-rerank-projection.test.ts
git commit -m "test(search): freeze reranker projection contracts"
```

---

### Task 5: Add the production rollout mode to MCP, CLI, and shared runtime identity

**Files:**
- Modify: `packages/mcp/src/config.ts`
- Modify: `packages/mcp/src/config.test.ts`
- Modify: `packages/cli/src/runtime-config.ts`
- Modify: `packages/cli/src/runtime-config.test.ts`
- Modify: `packages/mcp/src/server/shared-runtime-identity.ts`
- Modify: `packages/mcp/src/server/shared-runtime-identity.test.ts`
- Modify: `packages/mcp/src/core/search-constants.ts`

**Interfaces:**

```ts
export type RerankApplicationMode = "legacy_rrf" | "native_order";

export interface ContextMcpConfig {
    // existing fields
    rerankApplicationMode: RerankApplicationMode;
}

export function resolveRerankApplicationMode(
    value: string | undefined,
    defaultMode?: RerankApplicationMode,
): RerankApplicationMode;
```

**Release-1 default:** `legacy_rrf`.

**Environment variable:** `SATORI_RERANK_APPLICATION_MODE`.

**Required semantics:**

- Missing value resolves to the release default.
- Only exact lowercase `legacy_rrf` and `native_order` are accepted.
- Invalid values throw during MCP configuration and produce an error in CLI doctor.
- Shared runtime identity includes `rerankApplicationMode`; two clients with different modes cannot attach to one shared runtime.
- Startup configuration summary prints the selected mode.

- [ ] **Step 1: Write failing MCP config tests**

Add these exact test cases:

```text
defaults_rerank_application_mode_to_legacy_rrf_in_release_1
accepts_native_order
rejects_unknown_rerank_application_mode
```

- [ ] **Step 2: Write failing shared-runtime identity test**

Prove changing only `SATORI_RERANK_APPLICATION_MODE` changes the identity hash.

- [ ] **Step 3: Write failing CLI doctor test**

Prove selected mode is reported and invalid mode is rejected.

- [ ] **Step 4: Confirm RED**

```bash
node --import tsx --test \
  packages/mcp/src/config.test.ts \
  packages/mcp/src/server/shared-runtime-identity.test.ts \
  packages/cli/src/runtime-config.test.ts
```

- [ ] **Step 5: Implement parsing and identity binding**

Do not add ranking artifacts, external files, or runtime registry loading.

- [ ] **Step 6: Confirm GREEN**

Run the same command.

- [ ] **Complete the card-specific commits from section 3.1**

Do not create an additional parent-task commit. The parent task is complete only after every listed subcard has its own reviewed semantic commit.

---

### Task 6: Integrate native order into search execution

**Files:**
- Modify: `packages/mcp/src/core/search-execution.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Create: `packages/mcp/src/core/search-execution.native-rerank.test.ts`
- Create: `packages/mcp/src/core/handlers.native-rerank-mode.test.ts`

**Interfaces consumed:**

```ts
validateNativeRerankResults
applyNativeRerankToSelectedSlots
sortNativeRetrievalCandidates
resolveRerankBoundary
`SearchExecutionInput.rerankApplicationMode`, passed from `this.config.rerankApplicationMode` by `handlers.ts`
```

**Interface changes:**

```ts
export type SearchOrderAuthority =
    | "legacy_score"
    | "retrieval_order"
    | "reranker_order";

export type SearchExecutionInput = Readonly<{
    // existing fields
    rerankApplicationMode: RerankApplicationMode;
}>;

export type SearchCandidate = {
    // existing fields retained during Release 1 compatibility
    authoritativeRank: number; // one-based, always array index + 1 after final ordering
    rerankerRank?: number;
    rerankerScore?: number;
};
```

Add to successful execution outcome:

```ts
orderAuthority: SearchOrderAuthority;
rerankApplicationMode: RerankApplicationMode;
```

**Native execution sequence:**

1. Apply all existing filters.
2. Compute legacy fields for compatibility/debug only during Release 1.
3. Sort the native candidate snapshot using `sortNativeRetrievalCandidates`.
4. Resolve exact boundary.
5. Select reranker candidates from the suffix only.
6. Build documents and apply provider/document/byte ceilings unchanged.
7. Call `reranker.rerank` and retain complete `RerankResult[]`.
8. Validate the response before touching any candidate.
9. Apply provider order to selected slots on a detached array.
10. Copy `rerankerRank` and `rerankerScore` to the corresponding candidates only after validation.
11. Replace `scored` with the detached ordered array.
12. Assign contiguous `authoritativeRank` values.
13. Never apply reranker RRF; never invoke legacy score sorting after successful native rerank.

**Failure sequence:**

- Capture the pre-call array order and candidate diagnostic fields.
- On any failure, preserve that order and leave `rerankerRank`, `rerankerScore`, and `rerankAdjusted` unset/false.
- `orderAuthority = "retrieval_order"`.

**Legacy sequence:** unchanged in Release 1.

- [ ] **Step 1: Write the native success RED test**

Use a fake reranker returning reverse order with finite scores. Assert:

```text
output candidate IDs equal provider order in selected slots
unselected slots are unchanged
finalScore values cannot undo order
rerankerRank and rerankerScore are retained
authoritativeRank is contiguous
orderAuthority is reranker_order
```

- [ ] **Step 2: Write native failure RED tests**

Cover count mismatch, duplicate index, out-of-range index, NaN score, thrown provider call, document-projection failure, and input-byte truncation to zero.

- [ ] **Step 3: Write legacy compatibility RED test**

With mode `legacy_rrf`, assert current RRF mutation and score sort remain unchanged.

- [ ] **Step 4: Confirm RED**

```bash
node --import tsx --test \
  packages/mcp/src/core/search-execution.native-rerank.test.ts \
  packages/mcp/src/core/search-execution.exact-pin-rerank.test.ts \
  packages/mcp/src/core/handlers.native-rerank-mode.test.ts
```

- [ ] **Step 5: Implement one mode branch inside `rerankSearchCandidates`**

Do not duplicate provider invocation or failure telemetry. Share selection, projection, request, and response acquisition; branch only at application.

- [ ] **Step 6: Replace old exact helper use in native mode**

Legacy mode may retain `shouldSkipRerankForExactPin` until Task 13. Native mode uses `resolveRerankBoundary`.

- [ ] **Step 7: Confirm focused GREEN**

Run the same command.

- [ ] **Step 8: Run MCP typecheck and package tests**

```bash
pnpm exec tsc --noEmit -p packages/mcp/tsconfig.json
pnpm --filter @zokizuan/satori-mcp test
```

- [ ] **Complete the card-specific commits from section 3.1**

Do not create an additional parent-task commit. The parent task is complete only after every listed subcard has its own reviewed semantic commit.

---

### Task 7: Preserve native order through grouping and diversity

**Files:**
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/search-group-results.ts`
- Modify: `packages/mcp/src/core/search-group-ordering.ts`
- Create: `packages/mcp/src/core/search-group-results.native-rerank.test.ts`
- Create: `packages/mcp/src/core/search-group-ordering.native-rerank.test.ts`

**Interfaces:**

Extend internal group state:

```ts
export interface SearchGroupResult extends SearchGroupedResultV2 {
    // existing internal fields
    __authoritativeRank?: number;
}
```

Extend grouping input:

```ts
orderAuthority: SearchOrderAuthority;
```

**Native grouping semantics:**

- A group's representative is the candidate with the smallest `authoritativeRank`.
- `__authoritativeRank` is the minimum candidate rank in the group.
- Group ordering is exact-owned group first when applicable, then ascending `__authoritativeRank`, then deterministic target tie-breakers.
- Group support boost does not change native order.
- Near-tie symbol-kind preference does not change native order.
- Diversity may omit groups but may not reorder selected groups relative to the authoritative sequence.
- Duplicate declaration collapse keeps the smallest authoritative rank and unions candidate IDs.

**Legacy grouping semantics:** unchanged in Release 1.

- [ ] **Step 1: Write a failing group representative test**

Construct a group where a high-score candidate has rank 5 and a low-score candidate has rank 2. In native mode, rank 2 must be representative.

- [ ] **Step 2: Write a failing cross-group order test**

Create groups whose scores and symbol-kind preferences conflict with ranks 1, 2, 3. Native output must remain 1, 2, 3.

- [ ] **Step 3: Confirm RED**

```bash
node --import tsx --test \
  packages/mcp/src/core/search-group-results.native-rerank.test.ts \
  packages/mcp/src/core/search-group-ordering.native-rerank.test.ts
```

- [ ] **Step 4: Implement authority-aware grouping**

Keep the legacy comparator and native comparator separate and explicit. Do not overload a score sentinel.

- [ ] **Step 5: Confirm GREEN**

Run the same command.

- [ ] **Step 6: Run existing grouping tests**

```bash
node --import tsx --test packages/mcp/src/core/search-group*.test.ts
```

- [ ] **Complete the card-specific commits from section 3.1**

Do not create an additional parent-task commit. The parent task is complete only after every listed subcard has its own reviewed semantic commit.

---

### Task 8: Finish exact-prefix integration and provider-input selection

**Files:**
- Modify: `packages/mcp/src/core/search-execution.ts`
- Modify: `packages/mcp/src/core/search-execution.exact-pin-rerank.test.ts`
- Modify: `packages/mcp/src/core/search-execution.native-rerank.test.ts`

**Required production cases:**

1. Exact rank 1 plus three tail candidates: reranker receives only tail candidates; exact remains rank 1.
2. Sole exact result: no provider call.
3. Nonexact top satisfying `must:`: full set may rerank.
4. Exact candidate at rank 2: full set may rerank; no prefix protection.
5. Provider limit and byte budget apply after exact-prefix removal.
6. Candidate-survival `reranker_input` and `reranker_output` stages use the actual suffix IDs.

- [ ] **Step 1: Replace the old cost-tradeoff test**

Delete the assertion that exact rank 1 always skips the whole tail. Add assertions for suffix request and fixed prefix.

- [ ] **Step 2: Confirm RED**

```bash
node --import tsx --test \
  packages/mcp/src/core/search-execution.exact-pin-rerank.test.ts \
  packages/mcp/src/core/search-execution.native-rerank.test.ts
```

- [ ] **Step 3: Implement prefix-aware selection**

Apply `selectRerankCandidates` only to `scored.slice(startIndex)` and map selected slots back to the full candidate array.

- [ ] **Step 4: Confirm GREEN**

Run the same command.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/core/search-execution.ts \
  packages/mcp/src/core/search-execution.exact-pin-rerank.test.ts \
  packages/mcp/src/core/search-execution.native-rerank.test.ts
git commit -m "fix(search): rerank suffix behind exact-owned result"
```

---

### Task 9: Project truthful diagnostics and bind continuation identity

**Files:**
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/search-result-finalization.ts`
- Modify: `packages/mcp/src/core/search-result-set-identity.ts`
- Modify: `packages/mcp/src/core/search-result-set-identity.test.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/core/handlers.golden.test.ts`

**Interfaces:**

Native rerank debug:

```ts
rerank: {
    applicationMode: "legacy_rrf" | "native_order";
    orderAuthority: "legacy_score" | "retrieval_order" | "reranker_order";
    attempted: boolean;
    applied: boolean;
    // existing resource/failure fields
    rankK?: number;   // legacy only
    weight?: number;  // legacy only
}
```

Candidate debug may include, only in ranking/full debug:

```ts
rerankerRank?: number;
rerankerScore?: number;
authoritativeRank: number;
```

**Policy identities:**

```ts
export const SEARCH_LEGACY_RANKING_POLICY_ID = "search_candidate_final_score_v2";
export const SEARCH_NATIVE_RETRIEVAL_ORDER_POLICY_ID = "search_native_retrieval_order_v1";
export const SEARCH_NATIVE_RERANKER_ORDER_POLICY_ID = "search_native_reranker_order_v1";
```

`rankingPolicyIdentity` must select:

- legacy mode: legacy ID;
- native without applied reranker: native retrieval ID;
- native with applied reranker: native reranker ID.

**Required semantics:**

- Changing application mode invalidates continuation handles.
- A failed native rerank binds native retrieval identity, not reranker identity.
- Raw scores are not emitted outside ranking/full debug.
- Normal response shape remains unchanged except policy identity already carried internally.
- `rankK` and `weight` are absent in native diagnostics.

- [ ] **Step 1: Write failing identity tests**

Prove otherwise-identical ranked sets produce different binding digests for legacy, native retrieval, and native reranker policy IDs.

- [ ] **Step 2: Write failing diagnostic projection tests**

Prove native debug exposes order authority but not local RRF parameters.

- [ ] **Step 3: Confirm RED**

```bash
node --import tsx --test \
  packages/mcp/src/core/search-result-set-identity.test.ts \
  packages/mcp/src/core/handlers.golden.test.ts
```

- [ ] **Step 4: Implement policy identity selection and projection**

Do not add artifact hashes or external policy files.

- [ ] **Step 5: Confirm GREEN**

Run the same command.

- [ ] **Complete the card-specific commits from section 3.1**

Do not create an additional parent-task commit. The parent task is complete only after every listed subcard has its own reviewed semantic commit.

---

### Task 10: Add the production failure and contract matrix

**Files:**
- Create: `packages/mcp/src/core/search-native-rerank.integration.test.ts`
- Modify: existing focused tests only when an existing assertion directly conflicts with the approved contract.

**Test matrix:**

| Case | Expected order | Provider call | Warning |
|---|---|---:|---|
| no reranker | retrieval order | 0 | none |
| policy disables rerank | retrieval order | 0 | none |
| valid native response | provider order in selected slots | 1 | none |
| exact prefix | exact first + provider-ordered suffix | 1 | none |
| sole exact | exact only | 0 | none |
| timeout | retrieval order | 1 | `RERANKER_FAILED` |
| thrown provider error | retrieval order | 1 | `RERANKER_FAILED` |
| count mismatch | retrieval order | 1 | `RERANKER_FAILED` |
| duplicate index | retrieval order | 1 | `RERANKER_FAILED` |
| foreign/out-of-range index | retrieval order | 1 | `RERANKER_FAILED` |
| NaN/infinite score | retrieval order | 1 | `RERANKER_FAILED` |
| document projection failure | retrieval order | 0 API calls | `RERANKER_FAILED` |
| byte budget removes all | retrieval order | 0 | none |
| continuation page | frozen initial order | 0 new calls | none |

Also prove:

- `must`, `exclude`, `lang`, and `path` rejected candidates never reach the provider.
- Unselected candidates never move.
- No downstream score sort changes native order.
- `rerankAdjusted` is true only after a complete applied response.
- Candidate-survival stages reflect actual order.

- [ ] **Step 1: Build a reusable fake execution host**

Keep it in the test file; do not add production test hooks.

- [ ] **Step 2: Write tests and confirm any uncovered case fails**

```bash
node --import tsx --test packages/mcp/src/core/search-native-rerank.integration.test.ts
```

- [ ] **Step 3: Make only minimal corrections in currently owned integration files**

If a correction requires `search-execution.ts`, return it to the Task 6/8 owner rather than editing concurrently.

- [ ] **Step 4: Run focused and package tests**

```bash
node --import tsx --test \
  packages/mcp/src/core/search-native-rerank*.test.ts \
  packages/mcp/src/core/search-execution*.test.ts \
  packages/mcp/src/core/search-group*.test.ts \
  packages/mcp/src/core/search-result-set-identity.test.ts
pnpm --filter @zokizuan/satori-mcp test
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/core/search-native-rerank.integration.test.ts
git commit -m "test(search): cover native reranker production contracts"
```

---

### Task 11: Release 1 production documentation and opt-in rollout

**Files:**
- Modify: `README.md`
- Modify: `packages/mcp/README.md`
- Modify: `packages/cli/README.md`
- Create: `docs/evidence/native-reranker-release1-20260807/RELEASE_RECEIPT.md`

**Release-1 documentation:**

```text
SATORI_RERANK_APPLICATION_MODE=legacy_rrf  # compatibility default
SATORI_RERANK_APPLICATION_MODE=native_order # direct validated provider order
```

Explain:

- no local score blending in native mode;
- exact and filter contracts remain deterministic;
- failures return retrieval order;
- raw provider scores are diagnostics only;
- rollback is setting `legacy_rrf` and restarting the runtime;
- repository benchmark results are observational, not release gates.

**Acceptance commands:**

```bash
node --import tsx --test \
  packages/mcp/src/core/search-native-rerank*.test.ts \
  packages/mcp/src/core/search-execution*.test.ts \
  packages/mcp/src/core/search-group*.test.ts \
  packages/mcp/src/core/search-result-set-identity.test.ts \
  packages/mcp/src/config.test.ts \
  packages/mcp/src/server/shared-runtime-identity.test.ts \
  packages/cli/src/runtime-config.test.ts
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-mcp test
pnpm --filter @zokizuan/satori-cli test
pnpm exec tsc --noEmit -p packages/mcp/tsconfig.json
pnpm check
```

Optional observational smoke runs may be recorded for several repositories, but no MRR/Owner@k threshold may block release.

- [ ] **Step 1: Update documentation**
- [ ] **Step 2: Run all acceptance commands**
- [ ] **Step 3: Record exact commit, commands, exit codes, and test counts**
- [ ] **Step 4: Independently review the full Release-1 diff**
- [ ] **Step 5: Commit**

```bash
git add README.md packages/mcp/README.md packages/cli/README.md \
  docs/evidence/native-reranker-release1-20260807
git commit -m "docs(search): release native reranker ordering as opt-in"
```

**Release 1 gate:** default legacy behavior remains green; native contract matrix is green; mode appears in runtime identity and doctor; rollback command is documented.

---

### Task 12: Make native ordering the production default

**Files:**
- Modify: `packages/mcp/src/config.ts`
- Modify: `packages/mcp/src/config.test.ts`
- Modify: `packages/cli/src/runtime-config.ts`
- Modify: `packages/cli/src/runtime-config.test.ts`
- Modify: `packages/mcp/src/core/search-constants.ts`
- Modify: `packages/cli/README.md`
- Modify: `README.md`
- Modify: `packages/mcp/README.md`
- Create: `docs/evidence/native-reranker-default-20260807/DEFAULT_ACTIVATION_RECEIPT.md`

**Change:** missing `SATORI_RERANK_APPLICATION_MODE` resolves to `native_order`.

**Rollback remains:** explicit `legacy_rrf`.

- [ ] **Step 1: Change tests first**

Update the default expectation to `native_order`; keep explicit legacy acceptance.

- [ ] **Step 2: Confirm RED**

```bash
node --import tsx --test \
  packages/mcp/src/config.test.ts \
  packages/cli/src/runtime-config.test.ts
```

- [ ] **Step 3: Change one default constant/resolver**

Do not change runtime ranking code in this task.

- [ ] **Step 4: Confirm GREEN and run Release-1 matrix**

- [ ] **Step 5: Record activation and rollback proof**

Prove a runtime with no mode variable uses native order and a runtime with `legacy_rrf` uses legacy behavior and receives a different shared-runtime identity.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/config.ts packages/mcp/src/config.test.ts \
  packages/cli/src/runtime-config.ts packages/cli/src/runtime-config.test.ts \
  packages/mcp/src/core/search-constants.ts \
  docs/evidence/native-reranker-default-20260807
git commit -m "feat(search): make native reranker ordering default"
```

---

### Task 13: Delete the legacy reranker-RRF application mode

**Files:**
- Modify: `packages/mcp/src/core/search-execution.ts`
- Modify: `packages/mcp/src/core/search-constants.ts`
- Modify: `packages/mcp/src/core/search-result-finalization.ts`
- Modify: `packages/mcp/src/config.ts`
- Modify: `packages/mcp/src/config.test.ts`
- Modify: `packages/cli/src/runtime-config.ts`
- Modify: `packages/cli/src/runtime-config.test.ts`
- Modify: `packages/mcp/src/server/shared-runtime-identity.ts`
- Modify: `packages/mcp/src/server/shared-runtime-identity.test.ts`
- Modify: native/legacy execution tests.

**Delete:**

```text
SEARCH_RERANK_RRF_K
SEARCH_RERANK_WEIGHT
legacy_rrf branch
legacy rankK/weight diagnostics
legacy configuration value
legacy rollback documentation
```

**Retain:**

```text
SEARCH_RERANK_TOP_K
family/admission budgets
provider maximum
input byte budget
timeout/retry/cancellation
transactional failure fallback
```

- [ ] **Step 1: Change config tests to reject `legacy_rrf`**
- [ ] **Step 2: Change execution tests to assert no fixed reranker score mutation exists**
- [ ] **Step 3: Confirm RED**
- [ ] **Step 4: Remove the branch and constants**
- [ ] **Step 5: Remove obsolete diagnostics**
- [ ] **Step 6: Confirm focused, package, type, and full checks**
- [ ] **Complete the card-specific commits from section 3.1**

Do not create an additional parent-task commit. The parent task is complete only after every listed subcard has its own reviewed semantic commit.

---

### Task 14: Remove path, agent-fit, changed-file, entrypoint, and grouped score opinions

**Files:**
- Modify: `packages/mcp/src/core/search-execution.ts`
- Modify: `packages/mcp/src/core/search-constants.ts`
- Modify: `packages/mcp/src/core/search-ranking-policy.ts`
- Modify: `packages/mcp/src/core/search-ranking-policy.test.ts`
- Modify: `packages/mcp/src/core/search-group-results.ts`
- Modify: `packages/mcp/src/core/search-group-ordering.ts`
- Modify: all focused tests that directly assert removed relevance fields.

**Delete from production order:**

```text
SCOPE_PATH_MULTIPLIERS
SEARCH_CHANGED_FIRST_MULTIPLIER
SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST
agent-fit multiplier constants and resolver
entrypoint-owner score component
computeSearchCandidateFinalScore multiplicative formula
computeSearchGroupSupportBoost
group score near-tie preference
```

**Retain:**

```text
classifyPathCategory
shouldIncludeCategoryInScope
isTestPath / isDocPath / isGeneratedPath / isFixturePath
entrypoint owner evidence for navigation or diagnostics when independently useful
changed-file collection for freshness/debug, not relevance
exact/must sorting
stable tie-breaking
```

**Compatibility decision:**

`SearchRankingMode = "auto_changed_first"` becomes a documented no-op for one compatibility release if removing it would break the public tool schema. It must not affect order. Mark it deprecated in types/docs. Remove it only in an explicit public-schema change.

- [ ] **Step 1: Write failing tests proving relevance metadata cannot alter order**

Cover tests/docs/generated/changed/entrypoint/writer-owner candidates with conflicting old multipliers and identical retrieval ranks.

- [ ] **Step 2: Confirm RED**
- [ ] **Step 3: Simplify candidate evaluation**

In production native path:

```ts
candidate.pathCategory = classifyPathCategory(...); // filtering/debug classification only
candidate.passesMatchedMust = matchesMust;
candidate.exactLexicalMatch = scoreCandidateLexicalEvidence(
    input.queryPlan,
    candidate.result,
).exactLexicalMatch;
candidate.finalScore = candidate.fusionScore; // compatibility projection only
```

Do not use `finalScore` as an ordering authority.

- [ ] **Step 4: Remove score-driven grouped ordering**

Native groups order only by exact ownership, authoritative rank, then deterministic identity.

- [ ] **Step 5: Neutralize compatibility debug fields before deleting them**

If public response compatibility requires one release:

```text
pathMultiplier = 1
changedFilesMultiplier = 1
agentFitMultiplier = 1
entrypointOwnerScoreBoost = 0
agentFitReason = "not_used_for_ranking"
entrypointOwnerScoreReason = "not_used_for_ranking"
```

Document these as deprecated. Do not fabricate old effects.

- [ ] **Step 6: Run focused and broad tests**
- [ ] **Complete the card-specific commits from section 3.1**

Do not create an additional parent-task commit. The parent task is complete only after every listed subcard has its own reviewed semantic commit.

---

### Task 15: Separate exact lexical detection from numeric lexical scoring and remove numeric lexical order influence

**Files:**
- Modify: `packages/mcp/src/core/search-lexical-scoring.ts`
- Modify: `packages/mcp/src/core/search-lexical-scoring.test.ts`
- Modify: `packages/mcp/src/core/search-query-planning.ts`
- Modify: `packages/mcp/src/core/search-query-planning.test.ts`
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/search-result-finalization.ts`
- Modify: `packages/mcp/src/core/search-candidate-survival.ts`
- Modify: `packages/mcp/src/core/search-candidate-survival.test.ts`
- Modify: `scripts/satori-search-candidate-capture.mjs`
- Modify: `scripts/satori-search-candidate-capture.test.mjs`
- Modify: `scripts/satori-search-candidate-replay.mjs`
- Modify: `scripts/satori-search-candidate-replay.test.mjs`

**Interfaces:**

```ts
export type SearchExactLexicalEvidence = Readonly<{
    exactLexicalMatch: boolean;
    matchedWholeTerms: readonly string[];
    matchedQuotedPhrases: readonly string[];
}>;

export function detectSearchExactLexicalEvidence(
    plan: SearchQueryPlan,
    result: SearchResultLike,
): SearchExactLexicalEvidence;
```

**Delete from production contract:**

```text
SearchQueryPlan.lexicalWeight
numeric lexical score contribution
coverage boost
structural-anchor boost
near-miss numeric penalty
intent-specific values 1.35 / 0.60 / 0.30 / 0.18 / etc.
```

**Retain:**

```text
lexical terms
quoted phrases
exact-match pin eligibility
deterministic route selection
lexical retrieval mode
must/exclude token matching
reference route semantics
```

- [ ] **Step 1: Add exact-detection tests before changing existing scoring**

Cover symbol, path segment, content phrase, fragment-only, reference declaration, and false sibling-anchor cases.

- [ ] **Step 2: Confirm RED**

```bash
node --import tsx --test \
  packages/mcp/src/core/search-lexical-scoring.test.ts \
  packages/mcp/src/core/search-query-planning.test.ts
```

- [ ] **Step 3: Extract exact detection with existing semantics**

First make the existing scorer call the new detector so behavior remains stable.

- [ ] **Step 4: Remove `lexicalWeight` and numeric score use from production**

The search execution path consumes only `exactLexicalMatch` from lexical evidence. Retrieval backends still supply their own ranked candidates.

- [ ] **Step 5: Update diagnostics and compatibility projection**

Remove or deprecate `lexicalScore`. Never substitute a new arbitrary number.

- [ ] **Step 6: Update capture/replay schemas deliberately**

If old captures are retained for historical tooling, support the old field as optional input but emit the new schema without it. Do not silently reinterpret old captures.

- [ ] **Step 7: Run all focused, package, and full checks**
- [ ] **Complete the card-specific commits from section 3.1**

Do not create an additional parent-task commit. The parent task is complete only after every listed subcard has its own reviewed semantic commit.

---

### Task 16: Final production cleanup, documentation, and release proof

**Files:**
- Modify: `README.md`
- Modify: `packages/mcp/README.md`
- Modify: `packages/cli/README.md`
- Modify: `docs/plans/SATORI_RANKING_POLICY_V3_PLAN.md` only to retain its abandoned/historical banner and point to this production plan; do not rewrite its experiment history.
- Create: `docs/evidence/native-reranker-production-20260807/PRODUCTION_RECEIPT.md`

**Static removal checks:**

```bash
git grep -n 'SEARCH_RERANK_RRF_K\|SEARCH_RERANK_WEIGHT\|SCOPE_PATH_MULTIPLIERS\|SEARCH_CHANGED_FIRST_MULTIPLIER\|SEARCH_AGENT_FIT_\|SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST' -- packages scripts || true
git grep -n 'lexicalWeight' -- packages scripts || true
git grep -n 'legacy_rrf' -- packages scripts README.md || true
```

Expected: no active production references. Historical docs may remain only with clear historical status.

**Final contract tests:**

```bash
node --import tsx --test \
  packages/mcp/src/core/search-native-rerank*.test.ts \
  packages/mcp/src/core/search-rerank-boundary.test.ts \
  packages/mcp/src/core/search-retrieval-order.test.ts \
  packages/mcp/src/core/search-rerank-document.test.ts \
  packages/mcp/src/core/search-execution*.test.ts \
  packages/mcp/src/core/search-group*.test.ts \
  packages/mcp/src/core/search-result-set-identity.test.ts \
  packages/mcp/src/config.test.ts \
  packages/mcp/src/server/shared-runtime-identity.test.ts \
  packages/cli/src/runtime-config.test.ts
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-mcp test
pnpm --filter @zokizuan/satori-cli test
pnpm exec tsc --noEmit -p packages/mcp/tsconfig.json
pnpm check
```

**Production proof must state:**

- provider order is final after complete validation;
- raw scores are diagnostics only;
- exact prefix is preserved;
- no partial provider response can be observed;
- no local relevance multiplier or reranker RRF remains;
- no configured reranker means retrieval order;
- failure means exact pre-rerank order;
- grouping and continuation preserve order;
- no cross-repository quality threshold was used as a release gate;
- smoke repositories, if run, were observational only.

- [ ] **Step 1: Run static removal checks**
- [ ] **Step 2: Run full contract and package tests**
- [ ] **Step 3: Run optional observational smoke searches**

Record qualitative surprises without changing constants or creating a gate.

- [ ] **Step 4: Independently review the complete master-base diff**

Review specifically for accidental weakening of filters, freshness, security, limits, failure fallback, pagination, and shared-runtime isolation.

- [ ] **Step 5: Record exact commit, commands, exit codes, and counts**
- [ ] **Step 6: Commit**

```bash
git add README.md packages/mcp/README.md \
  docs/evidence/native-reranker-production-20260807
git commit -m "docs(search): complete native reranker production rollout"
```

---

## 5. Small-Agent Dispatch Graph

```text
Task 0 baseline/design
  |
  +--> Task 1 native response validator --------+
  +--> Task 2 exact boundary -------------------+
  +--> Task 3 retrieval order ------------------+--> Task 6 execution integration
  +--> Task 4 document projection --------------+          |
  +--> Task 5 rollout config -------------------+          v
                                                        Task 7 grouping
                                                           |
                                                           v
                                                        Task 8 exact suffix
                                                           |
                                                           v
                                                        Task 9 diagnostics/identity
                                                           |
                                                           v
                                                        Task 10 contract matrix
                                                           |
                                                           v
                                                        Task 11 Release 1
                                                           |
                                                           v
                                                        Task 12 native default
                                                           |
                                                           v
                                                        Task 13 delete legacy RRF
                                                           |
                                                           v
                                                        Task 14 remove relevance multipliers
                                                           |
                                                           v
                                                        Task 15 remove lexical weights
                                                           |
                                                           v
                                                        Task 16 final production proof
```

### Per-agent packet

Every agent receives only:

```text
task ID
dispatch commit
exact files
exact interfaces consumed/produced
first failing test name
focused command
acceptance assertions
do-not-touch list
commit message
```

Every task receives two reviews before merge:

1. **Specification review:** verifies only the task contract and scope.
2. **Code-quality review:** verifies correctness, failure behavior, tests, and no unrelated edits.

No two active agents may edit the same central file.

---

## 6. Production Acceptance — Not a Relevance Benchmark

A release is acceptable when all of these are true:

1. Complete provider order is validated before application.
2. Provider order is preserved through raw and grouped output.
3. Exact-owned prefix is immutable.
4. Filters and security controls execute before reranking.
5. Failures restore the exact pre-call order.
6. No partial result is visible.
7. No local relevance weight affects native order.
8. Pagination freezes one ordered set and continuation never reranks.
9. Mode changes alter shared-runtime and ranked-set identities.
10. All focused, package, type, and repository checks pass.

The following are explicitly not release gates:

```text
aggregate MRR
Owner@k
cross-repository average
one repository's preferred ordering
human grading throughput
learned coefficient stability
```

Unexpected smoke-search behavior should become a concrete product bug with a reproducible query and contract-level diagnosis. It must not trigger another global-weight tuning program.

---

## 7. Rollback

### Release 1 and Release 2

```text
Set SATORI_RERANK_APPLICATION_MODE=legacy_rrf
Restart the managed runtime
Verify shared-runtime identity changed
Run one search and verify diagnostics report legacy_rrf
```

No reindex is required because ranking does not alter index construction.

### Release 3

After legacy deletion, rollback is a normal code rollback to the last production commit containing the compatibility mode. Do not preserve dead scoring code behind an undocumented switch.

---

## 8. Self-Review Checklist

- [ ] Every approved deterministic contract has a preserving test.
- [ ] Every removed relevance mechanism maps to Task 13, 14, or 15.
- [ ] Provider raw score is never used in arithmetic.
- [ ] No task introduces training, artifacts, qualification, or repository-specific policy.
- [ ] No downstream sort can undo provider order.
- [ ] No central file has concurrent owners.
- [ ] Release 1 has a configuration rollback.
- [ ] Release 3 removes the rollback branch and dead constants.
- [ ] Documentation does not describe observational repository smoke checks as gates.
- [ ] No placeholder paths, interfaces, commands, or acceptance assertions remain.
