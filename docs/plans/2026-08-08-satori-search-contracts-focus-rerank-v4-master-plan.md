# Satori Search Contracts + Focus-Aware Rerank v4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Execute one task at a time; do not use parallel agents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the contract/identity regressions in the completed context-v3 rollout, resolve TradingView issues 11–18, and replace isolated role labels plus verbose guidance with a focus-aware, structurally contextual rerank request while keeping provider order final and restoring no local relevance weights.

**Architecture:** Deterministic code continues to own authorization, subdirectory scope, exact matches, `must:` semantics, freshness, publication validity, resource ceilings, and continuation. The reranker receives one provider-compatible query projection and one bounded answer packet per admitted candidate containing factual role plus trusted structural context. The reranker remains the only relevance authority; all downstream stages preserve its validated order.

**Tech Stack:** TypeScript, Node.js 22.13+, pnpm 10, Node test runner, Satori Core/MCP/CLI, LateOn-Code-edge, canonical JSON, generation-bound symbol/relationship sidecars.

## Global Constraints

- Baseline for this plan is the actual clean repository HEAD at execution time; expected review head is `786dbe347d6a7605f9d053ca030f2a3820ff0767`.
- Execute tasks strictly in order. One semantic commit per task.
- Do not restore path/test/docs/changed-file/agent-fit/entrypoint/group/RRF score weights.
- Do not introduce repository-specific ranking rules or TradingView-only behavior.
- Do not train, calibrate, or threshold provider scores.
- Provider order remains final after full response validation.
- Exact ownership, filters, requested subdirectory, freshness, publication authority, candidate limits, byte limits, timeouts, grouping, disclosure, and continuation remain deterministic contracts.
- Do not mutate existing projection/profile/policy identities in place. New semantics require new identities.
- Explicit old LateOn profiles must preserve their historical query and document projection behavior.
- No broad A/B, MRR/nDCG gate, human preference study, or tuning exercise is part of this plan.
- Real-model smoke may verify runtime compatibility only; it must not choose weights or thresholds.
- Before every commit run `git diff --check`, focused tests, and the named neighboring tests.
- Preserve unrelated user changes; never reset or clean them away.

---

## 1. End-to-End Review Verdict

### 1.1 Did context v3 address the legacy-vs-native weakness?

**Yes, architecturally.** It replaced global score penalties with:

```text
exact question
+ answer focus
+ factual candidate role
+ bounded source excerpt
-> LateOn order
-> provider order remains final
```

That is the correct category of solution. It allows tests to lead when the user asks for tests or when the test is the clearest evidence, while allowing implementation queries to ask for production mechanism and integration context.

### 1.2 What is still unproven?

The rollout structurally proves that the context reaches LateOn. It does not prove that LateOn interprets it as intended. LateOn scores encoded query/document representations; it is not a generative instruction-following agent. Verbose guidance that mentions non-target roles can increase similarity to those roles rather than demote them.

For example, the current implementation-focus guidance includes the words `Tests` and `documentation`. Those words may make test/document candidates *more* similar to the query. The next query projection therefore uses **positive-only focus language** and never names competing artifact classes.

### 1.3 Blocking review findings in the completed rollout

1. **Explicit v1/v2 profiles receive the wrong query.** `getQueryProjectionVersion()` says they use `semantic_query_raw_v1`, but production passes the focused v3 query unconditionally.
2. **Ranked-set identity binds document projection only.** Query projection and its contract digest are not bound, so a query-projection change may not stale continuations.
3. **The v3 projection hash is incomplete and not enforced.** It hashes only `search-rerank-document-v3.ts`, although output also depends on exported v2 helpers, bounded source selection, canonical JSON, role classification, and publication-bound projection code.
4. **Activation-policy identity was mutated.** `lateon_d32_owner_default_v1` historically meant projection-v2 D32 but was changed to require projection-v3 D32.
5. **Profile status contradicts activation.** The default v3 profile is marked `disabled_optional_not_track_o_or_held_out_candidate` while being activated as the managed default.
6. **Context v3 still ranks isolated candidates.** It carries role metadata but little trusted call/integration evidence, so implementation questions may still favor a test excerpt with stronger lexical overlap.
7. **The relationship-builder semantic fix was not versioned.** Pre-fix sidecars remain falsely compatible.
8. **Repository verification is not fully green.** The final receipt records one reproducible Core test failure and one stale script pin; the old plan's literal “all checks pass” definition was not met.
9. **Documentation contains possible mojibake.** Strings such as `ΓÇö`, `Γëñ`, and `┬º` must be byte-checked and corrected when present in repository files.

---

## 2. Final Rerank Method

### 2.1 Provider-compatible query projection

Each reranker advertises a query projection identity.

```ts
export type SearchRerankQueryProjectionIdentity =
    | "semantic_query_raw_v1"
    | "search_rerank_query_v1"
    | "search_rerank_query_v2";
```

Routing:

```text
v1/v2 LateOn profile -> exact raw semantic query
v3 profile           -> historical focused-query v1
v4 profile           -> positive-only focused-query v2
providers without identity -> raw semantic query
```

### 2.2 Positive-only focused query v2

```text
Question:
<exact semantic question>

Requested answer type:
<one positive description>
```

Exact descriptions:

```ts
const ANSWER_TYPE: Record<SearchAnswerFocus, string> = {
    implementation: "production implementation, control flow, and integration path",
    tests: "tests that directly verify the requested behavior",
    documentation: "documentation that directly explains the requested topic",
    configuration: "active configuration declarations and the code that applies them",
    references: "direct callers, callees, references, and integration sites",
    neutral: "the most direct answer to the question",
};
```

The implementation query never contains `test`, `tests`, `documentation`, `supporting`, or other competing-role words.

### 2.3 Candidate answer packet

Every admitted candidate remains a candidate; membership does not change. The document becomes a bounded answer packet:

```ts
export type SearchRerankAnswerPacketV1 = Readonly<{
    repository_relative_path: string;
    candidate_role: SearchCandidateRole;
    symbol_kind: string;
    canonical_symbol_label: string;
    signature_or_declaration: string;
    query_relevant_source_excerpt: string;
    structural_context: Readonly<{
        direct_callers: readonly SearchRerankStructuralReference[];
        direct_callees: readonly SearchRerankStructuralReference[];
        supporting_tests: readonly SearchRerankStructuralReference[];
    }>;
}>;
```

References contain only trusted factual metadata:

```ts
export type SearchRerankStructuralReference = Readonly<{
    repository_relative_path: string;
    canonical_symbol_label: string;
    relation: "caller" | "callee" | "test_support";
}>;
```

Limits:

```text
direct callers:      3
direct callees:      3
supporting tests:    2
all references sorted by relation, path, symbol label
no source text from references
complete document <= 4,000 UTF-8 bytes
```

No field expresses a preference or score. The packet gives LateOn enough context to distinguish “this test proves X” from “this implementation performs X.”

### 2.4 Composite request identity

```ts
export type SearchRerankRequestIdentityV1 = Readonly<{
    provider: string;
    model: string;
    profile: string;
    queryProjectionIdentity: string;
    documentProjectionIdentity: string;
    requestContractSha256: string;
}>;
```

The request-contract digest is generated from canonical behavior fixtures, not from one source file. It binds:

- answer-focus resolution fixtures;
- query projection bytes for every focus;
- candidate-role fixtures;
- document projection fixture bytes;
- source-selection policy identity;
- canonical JSON identity;
- structural-context ordering and limits;
- partial-projection semantics.

Shared-runtime identity and ranked-set binding include this complete request identity.

---

## 3. Issue 11–18 Disposition

| Issue | Decision |
|---|---|
| 11 `must:` recall | Publish honest bounded-coverage status; do not pretend exhaustive. No repository-wide scan in this plan. |
| 12 subdirectory `path` | Fix behavior: requested subdirectory becomes a hard candidate scope across every retrieval arm. |
| 13 continuation “complete” | Clarify envelope/docs with beyond-limit omission count; no semantic change. |
| 14 projection degradation | Publish typed projection summary and dedicated warning detail. |
| 15 post-100% block | Preserve fail-closed behavior; align every `not_ready:indexing` path with retry/operation metadata. |
| 16 stale `builtAt` | Add serving navigation generation/seal attribution. |
| 17 split validation | Aggregate exact-symbol shape and mode errors in one response; flatten union issues. |
| 18 stale relationship sidecars | Immediate relationship-builder version bump and compatibility regression test. |

---

## 3.5 Final Constraints and Acceptance Gate (owner-frozen, 2026-08-08)

Do not redesign or expand the architecture beyond these constraints.

### 3.5.1 Final acceptance gate

After the plan is fully implemented and built, run the original F-1 through F-8 repros
against the production build before declaring the architecture cycle closed.

Expected outcomes:

- **F-1 `must:`** — explicitly reports bounded/non-exhaustive recall. Do NOT add an exhaustive
  repository scan as part of this plan.
- **F-2 `path`** — subdirectory path is a real hard scope; zero out-of-scope results.
- **F-3 continuation** — clearly distinguishes caller-bounded completion from groups omitted
  beyond the requested limit.
- **F-4 constructor callers** — after a fresh full reindex with the bumped relationship-builder
  version, `TradingEntryVetoes` callers must include the expected `TradingCore.__init__`
  constructor edge. If it still fails, record it as a normal extraction bug rather than
  redesigning ranking.
- **F-5 degradation** — distinguish typed local projection failure from actual provider failure
  in the public/full-debug evidence.
- **F-6 post-100% finalization** — deterministic `not_ready + retryAfterMs + indexing operation`
  until publication is proven.
- **F-7 navigation freshness** — response exposes serving generation identity/seal together with
  `builtAt`.
- **F-8 read/open-symbol validation** — all applicable validation errors appear in one response.

These are regression/contract acceptance cases, NOT another quality A/B. The gate runs in
Task 15 and its outcomes are recorded in the production receipt.

### 3.5.2 `must:` boundary

Do not claim positive-only reranker queries or structural answer packets improve candidates
that retrieval never admitted. They improve ranking/context only AFTER candidate retrieval.
`must:` remains a bounded relevance-search contract unless a separate exhaustive/audit feature
is explicitly designed later.

### 3.5.3 Correct interpretation of legacy vs native

Do not describe tests-first results as being caused by the old handcrafted penalties. The
controlled same-input evaluation showed the opposite can happen: LateOn/native sometimes ranked
tests above implementation, while legacy's hardcoded re-sort sometimes pulled implementation
upward.

The reason we are still removing legacy weights is that global multipliers are an unsafe way to
compensate for incomplete reranker context. The intended replacement is:

```text
clean positive query intent
+ factual candidate role
+ bounded structural implementation/caller/callee context
-> LateOn decides
-> provider order remains final
```

### 3.5.4 Do not assume LateOn rejects `must:`-heavy queries

Current evidence already identifies local projection failures (`owner_not_found`,
`source_hash_mismatch`) and separate LateOn execution timeouts. Keep these failure classes
separate. If the final diagnostics later prove a genuine LateOn/provider failure specific to
`must:` inputs, record it as an incremental runtime/provider bug.

### 3.5.5 Freeze architecture after completion

Once the plan is implemented, the production build passes the normal repository verification,
and F-1…F-8 acceptance passes, consider the search/ranking architecture frozen.

No more TradingView tournaments, ranking weights, global test/docs penalties, tuning systems,
or redesigns. Any later failure starts as a specific incremental bug unless evidence proves an
architectural contract is wrong.

---

## 4. Mandatory Task Order

```text
Task 0  Freeze the actual head and reproduce review findings
Task 1  Bump relationship-builder identity (Issue 18)
Task 2  Restore profile-specific query compatibility
Task 3  Bind complete rerank request identity
Task 4  Correct activation-policy and qualification identities
Task 5  Enforce requested-subdirectory scope (Issue 12)
Task 6  Publish honest must-recall coverage (Issue 11)
Task 7  Publish projection degradation diagnostics (Issue 14)
Task 8  Clarify continuation and indexing retry semantics (Issues 13/15)
Task 9  Bind call-graph output to navigation generation (Issue 16)
Task 10 Aggregate read/open-symbol validation (Issue 17)
Task 11 Add positive-only query projection v2
Task 12 Build trusted structural answer context
Task 13 Add answer-packet document projection v4
Task 14 Add LateOn context-v4 profile and production integration
Task 15 Restore complete repository verification and seal the rollout
```

No task after Task 4 starts until Tasks 1–4 are green; those tasks repair identity and compatibility defects in the current default.

---

## Task 0: Freeze Actual Head and Reproduce Review Findings

**Files:**
- Create: `docs/evidence/search-contracts-focus-v4-baseline-20260808/BASELINE.md`

**Produces:** exact HEAD/tree, dirty-state classification, active identities, failures reproduced, and command map.

- [ ] **Step 1: Record repository state**

```bash
git status --short
git rev-parse HEAD
git rev-parse HEAD^{tree}
git log -1 --format='%H%n%aI%n%s'
```

- [ ] **Step 2: Prove the explicit-v2 query mismatch**

Add no code. Use or temporarily instrument a focused test to show an explicit `lateon_offline_quality_projection_v2_d32_v2` reranker advertises `semantic_query_raw_v1` while `runSearchExecution()` passes the focused v1 query.

Record the failing command/output in `BASELINE.md`.

- [ ] **Step 3: Record current contract identities**

Record:

```text
LateOn profile IDs and activation policy IDs
query projection IDs
document projection IDs
profile qualificationStatus values
ranked-set reranker projection fields
RELATIONSHIP_BUILDER_VERSION
current Core/script failures
```

- [ ] **Step 4: Byte-scan documentation**

```bash
git grep -n $'ΓÇ\|Γë\|┬º' -- README.md packages docs || true
```

Record whether mojibake is committed or only a terminal/export artifact.

- [ ] **Step 5: Commit**

```bash
git add docs/evidence/search-contracts-focus-v4-baseline-20260808/BASELINE.md
git commit -m "docs(search): freeze contracts and focus-v4 baseline"
```

---

## Task 1: Bump Relationship-Builder Identity (Issue 18)

**Files:**
- Modify: `packages/core/src/language-analysis/versions.ts`
- Modify: relationship-version compatibility tests under `packages/core/src/core/`
- Modify: `packages/core/src/relationships/builder.test.ts`
- Modify: `packages/mcp/src/core/handlers.call_graph.test.ts`
- Modify generated/pinned fixture files reported by focused failures only.

**Interface:**

```ts
export const RELATIONSHIP_BUILDER_VERSION =
    "relationship-v10+python-cross-module-constructors+python-native-resolution-v1";
```

- [ ] **Step 1: Write RED compatibility test**

Assert a persisted fingerprint carrying the previous relationship-v9 identity is incompatible with the new runtime and recommends reindex.

- [ ] **Step 2: Write RED functional fixture**

Use the `TradingEntryVetoes` import/constructor shape. Assert a fresh v10 relationship build emits the `TradingCore.__init__` caller edge.

- [ ] **Step 3: Run RED**

```bash
pnpm --filter @zokizuan/satori-core test -- relationships
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/handlers.call_graph.test.ts
```

Use exact-file commands if package filtering expands broad globs.

- [ ] **Step 4: Bump version and update exact fixtures**

Do not alter extraction behavior; the semantic fix already exists. This task invalidates stale sidecars.

- [ ] **Step 5: Run GREEN and commit**

```bash
git add packages/core packages/mcp/src/core/handlers.call_graph.test.ts
git commit -m "fix(relationships): invalidate pre-cross-module sidecars"
```

---

## Task 2: Restore Profile-Specific Query Compatibility

**Files:**
- Create: `packages/mcp/src/core/search-rerank-query-routing.ts`
- Create: `packages/mcp/src/core/search-rerank-query-routing.test.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/core/search-execution.ts`
- Modify: `packages/mcp/src/core/search-rerank-context.integration.test.ts`
- Modify: `packages/mcp/src/server/lateon-reranker.test.ts`

**Interface:**

```ts
export function resolveSearchRerankQuery(input: {
    semanticQuery: string;
    focusedQueryV1: string;
    focusedQueryV2?: string;
    projectionIdentity: string | undefined;
}): Readonly<{
    query: string;
    queryProjectionIdentity: string;
}>;
```

Rules:

```text
semantic_query_raw_v1 or missing -> raw semantic query
search_rerank_query_v1           -> focusedQueryV1
search_rerank_query_v2           -> focusedQueryV2 (required)
unknown identity                 -> fail startup/request construction, never guess
```

- [ ] **Step 1: Write RED tests**

Prove explicit v1/v2 profiles receive the raw question exactly and v3 receives query-v1 bytes.

- [ ] **Step 2: Run RED**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-rerank-query-routing.test.ts \
  packages/mcp/src/core/search-rerank-context.integration.test.ts \
  packages/mcp/src/server/lateon-reranker.test.ts
```

- [ ] **Step 3: Route by advertised identity**

`SearchExecutionInput` carries one resolved query and identity. It must not independently infer profile behavior.

- [ ] **Step 4: Run GREEN and commit**

```bash
git add packages/mcp/src/core packages/mcp/src/server/lateon-reranker.test.ts
git commit -m "fix(rerank): honor profile-specific query projections"
```

---

## Task 3: Bind the Complete Rerank Request Identity

**Files:**
- Create: `packages/mcp/src/core/search-rerank-request-contract.ts`
- Create: `packages/mcp/src/core/search-rerank-request-contract.test.ts`
- Create: `packages/mcp/scripts/generate-rerank-request-contract.ts`
- Create: `packages/mcp/assets/lateon/rerank-request-contract-v1.json`
- Modify: `packages/mcp/src/core/search-result-set-identity.ts`
- Modify: `packages/mcp/src/core/search-result-set-identity.test.ts`
- Modify: `packages/mcp/src/server/shared-runtime-identity.ts`
- Modify: `packages/mcp/src/server/shared-runtime-identity.test.ts`
- Modify: MCP manifest/check scripts.

**Interfaces:**

```ts
export interface SearchRerankRequestIdentityV1 {
    provider: string;
    model: string;
    profile: string;
    queryProjectionIdentity: string;
    documentProjectionIdentity: string;
    requestContractSha256: string;
}

export function resolveSearchRerankRequestIdentity(
    reranker: Reranker,
): SearchRerankRequestIdentityV1;
```

Generated contract manifest binds canonical fixture outputs rather than one source file.

- [ ] **Step 1: Write RED identity tests**

Changing query projection, role mapping, document bytes, source selector identity, structural-context ordering, or partial-projection behavior must change `requestContractSha256` or fail manifest check.

- [ ] **Step 2: Write RED continuation test**

Two request identities with the same provider/model/document projection but different query projection or request digest produce different ranked-set digests and stale continuations.

- [ ] **Step 3: Implement generator and runtime parser**

The generated file uses canonical JSON and exact-key parsing. No runtime hashing of TypeScript source paths.

- [ ] **Step 4: Run GREEN**

```bash
pnpm -C packages/mcp manifest:check
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-rerank-request-contract.test.ts \
  packages/mcp/src/core/search-result-set-identity.test.ts \
  packages/mcp/src/server/shared-runtime-identity.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp
git commit -m "feat(rerank): bind complete request contract identity"
```

---

## Task 4: Correct Activation Policy and Qualification Identity

**Files:**
- Modify: `packages/mcp/src/server/lateon-reranker-protocol.ts`
- Create: `packages/mcp/assets/lateon/runtime-profile-v3-d32-v2.json`
- Create: `packages/mcp/assets/lateon/runtime-profile-v3-d32-v2.acquisition.json`
- Modify: `packages/mcp/src/config.ts`
- Modify: `packages/mcp/src/server/runtime-bootstrap.test.ts`
- Modify: `packages/cli/src/lateon-model-store.ts`
- Modify: `packages/cli/src/runtime-config.ts`
- Modify CLI install/doctor tests and fixture files.

**New profile/policy identities:**

```ts
export const LATEON_RUNTIME_PROFILE_IDS = Object.freeze({
    // existing historical IDs remain unchanged
    contextV3D32Activated: "lateon_offline_quality_projection_v3_d32_v2",
});

export const LATEON_ACTIVATION_POLICY_IDS = Object.freeze({
    ownerDefaultD32V2: "lateon_d32_owner_default_v1",
    ownerDefaultContextV3: "lateon_context_v3_d32_owner_default_v1",
});
```

Historical meaning is immutable:

```text
lateon_d32_owner_default_v1 -> projection-v2 D32 only
lateon_offline_quality_projection_v3_d32_v1 -> historical rollout artifact; never rewritten
lateon_context_v3_d32_owner_default_v1 -> lateon_offline_quality_projection_v3_d32_v2 only
```

The new v3-d32-v2 profile copies the v3 request behavior and operational bounds but carries truthful status:

```text
owner_activated_operationally_qualified_not_held_out
```

Do not modify the existing v3-d32-v1 profile file or call an active default `disabled`.

- [ ] **Step 1: Write RED historical-identity tests**

Old policy + v2 passes. Old policy + either v3 profile fails with migration instruction. New policy + v3-d32-v2 passes. New policy + v2 or historical v3-d32-v1 fails.

- [ ] **Step 2: Write RED managed-upgrade migration test**

CLI upgrade rewrites the current historical-v3+old-policy combination to the new v3-d32-v2 profile and new policy atomically while preserving rollback on failure.

- [ ] **Step 3: Implement new identity and status**

Do not rewrite historical receipts; add a new activation decision/receipt.

- [ ] **Step 4: Run GREEN and commit**

```bash
pnpm --filter @zokizuan/satori-cli test
pnpm --filter @zokizuan/satori-mcp test

git add packages/mcp packages/cli docs/evidence
git commit -m "fix(lateon): version context-v3 activation authority"
```

---

## Task 5: Enforce Requested-Subdirectory Scope (Issue 12)

**Files:**
- Create: `packages/mcp/src/core/search-requested-scope.ts`
- Create: `packages/mcp/src/core/search-requested-scope.test.ts`
- Modify: `packages/mcp/src/core/search-frontdoor.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/core/search-execution.ts`
- Modify: `packages/mcp/src/core/search-query-support.ts`
- Modify: `packages/mcp/src/core/search-exact-fast-path.ts`
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/tools/search_codebase.ts`
- Add focused end-to-end tests.

**Interface:**

```ts
export type RequestedSearchSubdirectory = Readonly<{
    relativePrefix: string; // canonical repo-relative, no trailing slash
}>;

export function resolveRequestedSearchSubdirectory(input: {
    indexedRoot: string;
    requestedPath: string;
}): RequestedSearchSubdirectory | null;

export function candidateWithinRequestedSubdirectory(
    relativePath: string,
    requested: RequestedSearchSubdirectory | null,
): boolean;
```

Apply before reranker admission to:

```text
exact-registry results
semantic/core results
MCP pass union
tracked lexical scan
live/dirty overlay
```

- [ ] **Step 1: Write RED tests**

Two sibling subdirectories must return disjoint pools; no candidate outside the requested prefix reaches the provider. Root requests remain unchanged.

- [ ] **Step 2: Implement hard scope and filter ledger**

Add `removedByRequestedSubdirectory` to debug filter summary. Do not inject path text into the reranker query.

- [ ] **Step 3: Run GREEN and commit**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-requested-scope.test.ts \
  packages/mcp/src/core/handlers.scope.test.ts \
  packages/mcp/src/core/search-native-rerank.integration.test.ts

git add packages/mcp/src
git commit -m "fix(search): enforce requested subdirectory scope"
```

---

## Task 6: Publish Honest `must:` Recall Coverage (Issue 11)

**Files:**
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/search-execution.ts`
- Modify: `packages/mcp/src/core/search-result-finalization.ts`
- Modify: `packages/mcp/src/tools/search_codebase.ts`
- Modify: `packages/mcp/src/core/warnings.ts`
- Modify must-lane tests.

**Interface:**

```ts
export type SearchMustCoverage = Readonly<{
    semantics: "case_sensitive_raw_substring_all";
    status:
        | "complete_within_examined_candidates"
        | "partial_candidate_budget"
        | "lane_skipped_primary_limit_filled"
        | "lane_unavailable"
        | "lane_failed";
    laneAttempted: boolean;
    candidatesExamined: number;
    candidateBudget: number;
    moreMayExist: boolean;
}>;
```

Warning:

```text
MUST_RESULTS_MAY_BE_INCOMPLETE_WITHIN_RETRIEVAL_BUDGET
```

must appear whenever `moreMayExist` is true, including when the lane is skipped because the primary result count filled the caller limit.

- [ ] **Step 1: Write RED tests**

Cover lane run, budget exhausted, lane skipped by filled primary result, unavailable, and failed.

- [ ] **Step 2: Implement coverage truthfulness**

Do not add an exhaustive filesystem scan. Document exact substring semantics.

- [ ] **Step 3: Run GREEN and commit**

```bash
git add packages/mcp/src
git commit -m "feat(search): report bounded must-query coverage"
```

---

## Task 7: Publish Projection Degradation Diagnostics (Issue 14)

**Files:**
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/search-result-finalization.ts`
- Modify: `packages/mcp/src/core/search-response-helpers.ts`
- Modify: `packages/mcp/src/core/warnings.ts`
- Modify focused projection/native rerank tests.

**Debug shape:**

```ts
rerankerProjection?: Readonly<{
    requestedCandidates: number;
    projectedCandidates: number;
    skippedCandidates: number;
    failureCounts: Partial<Record<SearchRerankProjectionFailureReason, number>>;
    firstFailure?: {
        candidateId: string;
        reason: SearchRerankProjectionFailureReason;
    };
}>;
```

Dedicated warning details explain local projection degradation and distinguish it from provider failure.

- [ ] **Step 1: Write RED envelope tests**
- [ ] **Step 2: Project summary only in ranking/full debug; warning details remain bounded**
- [ ] **Step 3: Run GREEN and commit**

```bash
git add packages/mcp/src/core
git commit -m "feat(rerank): publish projection degradation reasons"
```

---

## Task 8: Clarify Continuation and Indexing Retry Semantics (Issues 13/15)

**Files:**
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/search-disclosure.ts`
- Modify: `packages/mcp/src/core/search-result-finalization.ts`
- Modify: `packages/mcp/src/core/tool-response-builders.ts`
- Modify: `packages/mcp/src/core/search-frontdoor.ts`
- Modify: `packages/mcp/src/tools/search_codebase.ts`
- Modify continuation/readiness tests and docs.

**Add:**

```ts
omittedBeyondLimitGroupCount?: number;
```

`continuation: "complete"` means complete for the caller-bounded frozen set. The response explicitly reports groups excluded by caller limit.

Every `not_ready` indexing path includes:

```ts
retryAfterMs: 2000;
indexingOperation?: { action; phase; generation };
```

- [ ] **Step 1: Write RED semantic-clarity tests**
- [ ] **Step 2: Align response builders**
- [ ] **Step 3: Run GREEN and commit**

```bash
git add packages/mcp/src/core packages/mcp/src/tools/search_codebase.ts README.md packages/mcp/README.md
git commit -m "feat(search): clarify bounded continuation and retry"
```

---

## Task 9: Bind Call-Graph Results to Navigation Generation (Issue 16)

**Files:**
- Modify: `packages/mcp/src/core/search-types.ts` or call-graph response types.
- Modify: `packages/mcp/src/core/relationship-backed-call-graph.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify call-graph tests.

**Response attribution:**

```ts
navigationAuthority: {
    generationId: string;
    navigationSealSha256: string;
    relationshipManifestSha256: string;
    builtAt: string;
}
```

- [ ] **Step 1: Write RED current-generation test**
- [ ] **Step 2: Emit attribution from the exact serving generation**
- [ ] **Step 3: Run GREEN and commit**

```bash
git add packages/mcp/src/core
git commit -m "feat(call-graph): expose serving generation authority"
```

---

## Task 10: Aggregate Exact-Symbol Validation (Issue 17)

**Files:**
- Modify: `packages/mcp/src/tools/read_file.ts`
- Modify: `packages/mcp/src/core/symbol-context-public-contract.ts`
- Modify: `packages/mcp/src/tools/types.ts`
- Modify corresponding tests/docs.

**Behavior:**

- An `open_symbol` object carrying any exact-symbol marker (`contractVersion`, `symbolId`, `symbolLabel`, `context`, `continuation`) is validated as one unit.
- Missing mode and inner shape violations appear in one response.
- Direct span reads remain exempt.
- Zod union sub-issues are flattened into stable field paths.

- [ ] **Step 1: Write RED multi-error test**

Input with both `symbolId` and `symbolLabel`, omitted `mode`, and omitted `contractVersion` must return all actionable errors in one response.

- [ ] **Step 2: Implement outer `superRefine` and flattened formatter**
- [ ] **Step 3: Run GREEN and commit**

```bash
git add packages/mcp/src/tools packages/mcp/src/core/symbol-context-public-contract.ts
git commit -m "fix(read): report complete exact-symbol validation"
```

---

## Task 11: Add Positive-Only Query Projection v2

**Files:**
- Create: `packages/mcp/src/core/search-rerank-query-v2.ts`
- Create: `packages/mcp/src/core/search-rerank-query-v2.test.ts`
- Modify: `packages/mcp/src/core/search-rerank-query-routing.ts`
- Modify request-contract generator/manifest.

**Identity:**

```ts
export const SEARCH_RERANK_QUERY_PROJECTION_V2 = "search_rerank_query_v2";
```

- [ ] **Step 1: Write exact-byte tests**

For implementation focus, assert query contains the exact question plus `production implementation, control flow, and integration path` and does not contain `test`, `documentation`, `supporting`, numeric values, paths, provider names, or scores.

- [ ] **Step 2: Implement positive-only projection**
- [ ] **Step 3: Regenerate request-contract manifest**
- [ ] **Step 4: Run GREEN and commit**

```bash
git add packages/mcp/src/core packages/mcp/scripts packages/mcp/assets
git commit -m "feat(rerank): add positive-only focus query v2"
```

---

## Task 12: Build Trusted Structural Answer Context

**Files:**
- Create: `packages/mcp/src/core/search-rerank-structural-context.ts`
- Create: `packages/mcp/src/core/search-rerank-structural-context.test.ts`
- Modify: `packages/mcp/src/core/search-rerank-projection.ts`
- Modify: `packages/mcp/src/core/handlers.ts`

**Interfaces:**

```ts
export interface SearchRerankStructuralContext {
    directCallers: readonly SearchRerankStructuralReference[];
    directCallees: readonly SearchRerankStructuralReference[];
    supportingTests: readonly SearchRerankStructuralReference[];
}

export function buildSearchRerankStructuralContext(input: {
    candidate: SearchResultLike;
    registry: SymbolRegistry;
    relationships: readonly RelationshipRecord[];
}): SearchRerankStructuralContext;
```

**Trust rules:**

- Exact owner identity required.
- References must resolve to the same sealed navigation generation.
- No fuzzy suffix-only relationship is admitted.
- Unknown or ambiguous references are omitted.
- Output is deterministically sorted and capped.

- [ ] **Step 1: Write RED tests**

Cover implementation with direct caller/callee, test supporting an implementation, ambiguous relation omission, and empty context.

- [ ] **Step 2: Implement bounded factual context**
- [ ] **Step 3: Run GREEN and commit**

```bash
git add packages/mcp/src/core
git commit -m "feat(rerank): add trusted structural answer context"
```

---

## Task 13: Add Answer-Packet Document Projection v4

**Files:**
- Create: `packages/mcp/src/core/search-rerank-document-v4.ts`
- Create: `packages/mcp/src/core/search-rerank-document-v4.test.ts`
- Modify: `packages/mcp/src/core/search-rerank-projection.ts`
- Modify request-contract generator/manifest.

**Identity:**

```ts
export const SEARCH_RERANK_DOCUMENT_V4_POLICY = {
    id: "search_rerank_document_v4",
    previousVersion: "search_rerank_document_v3",
    maximumUtf8Bytes: 4000,
};
```

**Budget priority:**

```text
mandatory path/role/symbol/declaration
query-relevant primary source
structural context references
optional documentation excerpt
```

Structural references never displace the mandatory declaration and must not cause projection failure; truncate reference lists first.

- [ ] **Step 1: Write RED v3/v4 parity tests**

Primary source/declaration selection remains identical when structural context is empty. v4 differs only by `structural_context` and identity.

- [ ] **Step 2: Write 4,000-byte stress test**
- [ ] **Step 3: Implement and regenerate contract**
- [ ] **Step 4: Run GREEN and commit**

```bash
git add packages/mcp/src/core packages/mcp/scripts packages/mcp/assets
git commit -m "feat(rerank): add structural answer-packet projection v4"
```

---

## Task 14: Add LateOn Context-v4 Profile and Production Integration

**Files:**
- Create: `packages/mcp/assets/lateon/runtime-profile-v4-d32.json`
- Create: `packages/mcp/assets/lateon/runtime-profile-v4-d32.acquisition.json`
- Modify: `packages/mcp/src/server/lateon-reranker-protocol.ts`
- Modify: `packages/mcp/src/server/lateon-reranker.ts`
- Modify: `packages/mcp/src/config.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/core/search-execution.ts`
- Modify: CLI model-store/install/runtime/doctor files and tests.
- Modify shared-runtime and ranked-set identity tests.

**New IDs:**

```text
profile: lateon_offline_quality_projection_v4_d32_v1
query projection: search_rerank_query_v2
document projection: search_rerank_document_v4
activation policy: lateon_context_v4_d32_owner_default_v1
```

**Required compatibility:**

```text
v1/v2 profiles -> raw query + historical docs
v3 profile     -> query-v1 + document-v3
v4 profile     -> query-v2 + document-v4
```

- [ ] **Step 1: Write RED compatibility matrix**
- [ ] **Step 2: Add profile bound to generated request-contract digest**
- [ ] **Step 3: Integrate v4 projection and keep provider order final**
- [ ] **Step 4: Update managed default with a new activation decision**
- [ ] **Step 5: Run full MCP/CLI focused matrix and release smoke**
- [ ] **Step 6: Commit**

```bash
git add packages/mcp packages/cli packages/core/src/reranker docs/evidence
git commit -m "feat(lateon): activate structural context-v4 reranking"
```

---

## Task 15: Restore Complete Verification and Seal the Rollout

**Files:**
- Modify only files required to fix the two recorded pre-existing verification failures.
- Create: `docs/evidence/search-contracts-focus-v4-production-20260808/PRODUCTION_RECEIPT.md`
- Modify: `README.md`, `packages/mcp/README.md`, `ISSUES.md`
- Mark prior context-v3 plan implemented/historical.

### 15.1 Fix the reproducible Core test failure

`fetch-with-deadline.test.ts` must use an injected deterministic retryable failure rather than relying on environment-dependent `ECONNREFUSED` classification. Do not change production retry semantics unless a separate defect is proved.

### 15.2 Repair the stale script pin

Regenerate or update `known-exact-target` only after the pinning script verifies the current source bytes/symbol anchor. Record old and new digests.

### 15.3 Mojibake cleanup

Replace committed encoding corruption only where byte scan proves it exists. Do not rewrite historical binary evidence.

### 15.4 Final commands

```bash
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-mcp test
pnpm --filter @zokizuan/satori-cli test
pnpm test:scripts
pnpm check
pnpm build
pnpm -C packages/mcp release:smoke
pnpm --filter @zokizuan/satori-mcp typecheck
git diff --check
git status --short
```

All must exit `0`; no “pre-existing failure” exception remains for this final plan.

### 15.5 Static prohibitions

```bash
! git grep -n -E 'SEARCH_RERANK_RRF_K|SEARCH_RERANK_WEIGHT|SCOPE_PATH_MULTIPLIERS|SEARCH_AGENT_FIT_|SEARCH_CHANGED_FIRST_MULTIPLIER' -- packages
! git grep -n -E 'candidateRole.*multiplier|answerFocus.*weight|test.*0\.65|docs.*0\.45' -- packages
```

### 15.6 F-1…F-8 acceptance gate (owner-frozen, see 3.5.1)

Run the original F-1 through F-8 repros against the production build after the 15.4 commands
pass. Record each outcome (pass/fail + evidence pointer) in the production receipt:

```text
F-1 must: bounded recall disclosure          -> Task 6 contract
F-2 path: hard subdirectory scope            -> Task 5 contract
F-3 continuation: bounded completion         -> Task 8 contract
F-4 constructor callers after fresh reindex  -> Task 1 identity + extraction evidence
F-5 typed projection vs provider failure     -> Task 7 contract
F-6 deterministic not_ready retry contract   -> Task 8 contract
F-7 serving generation authority             -> Task 9 contract
F-8 aggregated exact-symbol validation       -> Task 10 contract
```

A failing gate item is recorded as a specific incremental bug (per 3.5.4/3.5.5), not as
authorization for ranking redesign. F-4 failure specifically is recorded as a normal extraction
bug, not a ranking issue.

- [ ] **Step 1: Write the production receipt with exact identities and counts**
- [ ] **Step 2: Run the 15.6 F-1…F-8 acceptance gate and record outcomes in the receipt**
- [ ] **Step 3: Update issue statuses 11–18**
- [ ] **Step 4: Commit**

```bash
git add packages docs README.md
git commit -m "docs(search): seal search contracts and context-v4 rollout"
```

---

## 5. Final Definition of Done

The project is complete when:

- stale relationship sidecars are invalidated;
- explicit v1/v2/v3/v4 profiles receive their promised query/document projections;
- request identity binds query, document, role, structural context, and partial-projection semantics;
- shared runtimes and continuations cannot cross request-contract identities;
- activation policy IDs retain immutable historical meaning;
- active profiles carry truthful activation/qualification status;
- requested subdirectories are hard retrieval scopes;
- `must:` responses truthfully state bounded coverage;
- projection degradation publishes typed diagnostics;
- continuation and indexing retry wording is unambiguous;
- call graphs expose the exact serving navigation generation;
- read/open-symbol validation returns all actionable errors at once;
- context-v4 query text uses positive-only answer focus;
- documents carry trusted structural context without weights;
- provider order remains final;
- all package, script, check, build, smoke, type, and diff commands pass;
- the 15.6 F-1…F-8 acceptance gate passes against the production build and the
  search/ranking architecture is declared frozen per 3.5.5;
- the final working tree is clean.

## 6. Explicit Non-Goals

- No global test/docs penalties.
- No local post-reranker sorting.
- No learned ranker or model fine-tuning.
- No repository-specific policy.
- No exhaustive `must:` filesystem scan.
- No abstention redesign.
- No candidate-depth, timeout, thread-count, or model-size change.
- No broad relevance benchmark or human-labeling project.

---

## 7. Execution Log

### Task 0 — Freeze Actual Head and Reproduce Review Findings — DONE (c87f8f5)

- Head frozen at `c8459fd70ad8929dfe55afc5c5e2753a883b89cf`; evidence in `docs/evidence/search-contracts-focus-v4-baseline-20260808/BASELINE.md`.
- Reproduced the v2 query mismatch: handlers sent focused v1 unconditionally while `lateon-reranker.ts` advertised `semantic_query_raw_v1` for v1/v2 profiles.
- Confirmed pre-existing failures carried into Task 15 scope: core `fetch-with-deadline` environmental failure and the stale known-exact-target pin (span 189–604 vs 186–603). No mojibake in committed sources.

### Task 1 — Bump Relationship-Builder Identity (Issue 18) — DONE (3a26a11)

- Fixed: 18 stale relationship sidecars are now rejected. `RELATIONSHIP_BUILDER_VERSION` bumped to `relationship-v10+python-cross-module-constructors+python-native-resolution-v1`.
- RED proved before the bump (compat test failed against v9); GREEN after: `compareIndexCompatibility` → `requires_reindex` on `relationshipVersion`, `classifyRepairIndexCompatibility` → `relationship_only_upgrade`, and the `TradingCore.__init__` constructor-caller edge fixture passes.
- Verification: 108 persisted-index-authority + 247 builder + 36 neighbor tests green.

### Task 2 — Restore Profile-Specific Query Compatibility — DONE (fb02f6f)

- Fixed: query projection is now routed by the reranker-advertised identity (`semantic_query_raw_v1` | `search_rerank_query_v1` | `search_rerank_query_v2`); unknown identities fail closed (`search_rerank_query_projection_identity_unknown`).
- v2 identity resolves only when a focused v2 query is available, otherwise `search_rerank_query_v2_projection_unavailable` (prepares Task 11).
- Verification: 31 focused routing/binding tests + 20 neighboring integration tests + typecheck green. Note: first commit (a708f50) missed two untracked files via pathspec commit; corrected by fb02f6f.

### Task 3 — Bind the Complete Rerank Request Identity — DONE (5b8f03a)

- Fixed: ranked-set bindings now bind the full rerank request identity (`provider`, `model`, `profile`, `queryProjectionIdentity`, `documentProjectionIdentity`, `requestContractSha256`). Continuations crossing any request-contract change go stale by digest, by design.
- New canonical-fixture contract `assets/lateon/rerank-request-contract-v1.json` (digest `f9f07b1ecd56851062598a52e804508ae288e32ba8b034bec5a12799f77533d0`), generated/checked via `pnpm contract:generate` / `contract:check`; parser rejects extra keys, wrong schema, digest mismatch, and structural/partial-projection drift.
- Applied reranking refuses to bind without a complete request identity; deterministic baselines refuse to carry one. Shared runtime identity binds `lateOnRequestContractSha256` for lateon hosts only (fail-open otherwise).
- Verification: manifest:check + contract:check green; 21 focused tests (contract, ranked-set identity, shared-runtime identity) green; 19 neighboring rerank tests green; typecheck green.

### Task 4 — Correct Activation-Policy and Qualification Identities — DONE (7d2d75d)

- Fixed: activation authority is now versioned truthfully. New activated profile `lateon_offline_quality_projection_v3_d32_v2` (qualificationStatus `owner_activated_operationally_qualified_not_held_out`) ships as `runtime-profile-v3-d32-v2.json` + acquisition manifest (profile sha256 `d0e5c33e1a8281f61d95563cf5af29b82896e15127fab92fadfadcf4c2b8db79`); artifacts and request behavior are byte-identical to the historical v3 profile, which stays on disk unmodified.
- New policy `lateon_context_v3_d32_owner_default_v1` pairs only with the activated v2 profile; historical meanings are immutable — `lateon_d32_owner_default_v1` still means projection-v2 D32 only, and the historical v3 combination gets doctor/install migration guidance (`satori upgrade`) instead of a silent pass.
- CLI defaults flipped to the v2 profile + new policy (`DEFAULT_LATEON_PROFILE_ID`, `LATEON_D32_ACTIVATION_POLICY`, `LATEON_PROFILE_FILE`, frozen digest); `satori upgrade` admits the historical combination and migrates it atomically (launcher env rewritten only after preflight + probe; probe failure leaves the launcher byte-identical — new regression test covers both halves).
- Verification: mcp suite 1438/1438 green; cli suite 341/341 green (includes new migration-atomicity, historical-policy doctor, and pairing-matrix tests); typecheck green for both packages. Release smoke now asserts the new frozen identity.

### Task 5 — Enforce Requested Subdirectory Scope — DONE (fa2676a)

- Fixed: a requested subdirectory is now a hard scope applied before reranker admission, not just a display path. New owner module `search-requested-scope.ts` resolves `RequestedSearchSubdirectory` (segment-safe `relativePrefix`, `null` for root or out-of-root requests) and admits candidates on exact-segment prefixes (no `alpha` vs `alpha-x` collision, backslash/leading-slash normalized).
- Enforcement points: `runSearchExecution`'s single `evaluateCandidate` choke point (covers semantic, MCP-union, lexical, dirty-source, and must-lane arms) records `requested_subdirectory_filter` removals and `removedByRequestedSubdirectory` counts; the exact fast path filters through `buildExactRegistrySymbolFilter`; root requests admit everything.
- Verification: RED proved (sibling leakage in handler scope test + unscoped provider admission); GREEN — plan battery 212/212 (6 new unit tests, 2 new execution-integration tests, 1 new handler scope test), 24 neighboring execution tests green, mcp typecheck clean.

### Task 6 — Publish Honest must: Recall Coverage — DONE (405388b)

- Fixed: must: recall is now reported truthfully via `SearchMustCoverage` (`semantics: case_sensitive_raw_substring_all`, five statuses, `moreMayExist`) published as `hints.mustCoverage` in both raw and grouped envelopes. The previously silent skip case — primary results already fill the caller limit — is now tracked (`lane_skipped_primary_limit_filled`) instead of dropped.
- `MUST_RESULTS_MAY_BE_INCOMPLETE_WITHIN_RETRIEVAL_BUDGET` now fires whenever `moreMayExist` is true: exhausted lane budget, skipped lane, unavailable conjunctive retrieval, and failed lane (the two failed-lane handler expectations were updated accordingly); a fully examined budget stays silent. Existing `FILTER_MUST_UNSATISFIED`, `MUST_NOT_SATISFIED_WITHIN_RETRIEVAL_BUDGET`, and conjunctive unavailable/failed warnings keep their meanings.
- Tool description documents the exact substring semantics and bounded recall; no exhaustive filesystem scan was added.
- Verification: RED proved (coverage undefined); GREEN — must-lane 10/10, 8 must-related handler tests + new skipped-lane handler test, full handlers.scope 185/185, frontdoor/response-builder/golden/compact-contract 45/45, neighboring warning/execution tests 26/26, mcp typecheck clean.

### Task 7 — Publish Projection Degradation Diagnostics — DONE (66cb96b)

- Fixed: local reranker-document projection degradation is now visible and honestly attributed. `SearchRerankProjectionSummary` publishes `skippedCandidates` (renamed from the ambiguous `omittedCandidates`) and is surfaced as `hints.debugSearch.rerankerProjection` — ranking/full debug only; summary/none stay silent.
- Dedicated warning details for `RERANKER_INPUT_DEGRADED` and `RERANKER_SKIPPED_INPUT` now explain local projection degradation, state explicitly that it is not a reranker provider failure, and point at `debugMode=ranking` for per-reason counts (`failureCounts`, `firstFailure`). The `MUST_RESULTS_MAY_BE_INCOMPLETE_WITHIN_RETRIEVAL_BUDGET` detail message was broadened to match Task 6's honest semantics (budget exhausted, lane skipped, unavailable, or failed).
- Verification: RED proved (fallback warning detail lacked the projection explanation); GREEN — new envelope test covers all four debug modes plus warning attribution, native-rerank + response-helpers 36/36, rerank-context/reliability/request-contract/compact/golden 50/50, full handlers.scope 186/186, mcp typecheck clean.

### Task 8 — Clarify Continuation and Indexing Retry Semantics (Issues 13/15) — DONE (68a259b)

- Fixed: grouped envelopes now publish `omittedBeyondLimitGroupCount` (available − caller-bounded frozen set) whenever positive, derived once in `resolveOmittedBeyondLimitGroupCount` (search-disclosure) and published by the single grouped-envelope builder — initial, exact fast-path, and continue_search page envelopes all carry it; `pagination.continuation="complete"` now explicitly means complete for the caller-bounded frozen set only, documented on the envelope type, both tool descriptions, and READMEs.
- Fixed: every `not_ready` reason="indexing" path carries `retryAfterMs: 2000`. `buildNotReadySearchPayload` now embeds the deterministic retry hint (covering the freshness `skipped_indexing` path), and the frontdoor enriches freshness-blocked indexing payloads with `indexingOperation {action,phase,generation}` from the durable operation receipt when one exists (readiness-gated indexing already carried both).
- Verification: RED proved (missing export, missing `omittedBeyondLimitGroupCount`, missing retry hint on all three not-ready surfaces); GREEN — 5 new tests (1 disclosure unit, 1 handler envelope, 1 builder retry hint, 2 frontdoor freshness-indexing enrichment) + full mcp suite 1460/1460 (was 1455), cli 341/341, docs:check + manifest:check + contract:check green, mcp typecheck clean.

### Task 9 — Bind Call-Graph Results to Navigation Generation (Issue 16) — DONE (5613b6c)

- Fixed: ok call-graph traversals now publish `navigationAuthority {generationId, navigationSealSha256, relationshipManifestSha256, builtAt}` resolved from the exact serving navigation generation — the generation receipt's sealed navigation + marker `completedAt` (canonical mode) or the source-backed marker binding, which now also carries `builtAt` from the completion marker. Attribution is emitted only when the complete authority is known; partial evidence yields no attribution rather than a guessed one (`resolveCallGraphNavigationAuthority`, relationship-backed-call-graph).
- The `sidecar.builtAt` (call-graph sidecar build time) remains distinct from `navigationAuthority.builtAt` (serving navigation generation build time), closing the stale-`builtAt` ambiguity of Issue 16.
- Verification: RED proved (both canonical receipt and source-backed sealed-marker paths lacked attribution; source-backed also failed closed earlier on registry/relationship manifest binding checks once the binding carried the manifest hashes); GREEN — 2 new current-generation tests (receipt path + source-backed path) + full mcp suite 1462/1462 (was 1460), call-graph/tracked-readiness/watchers 57/57, mcp typecheck clean.

### Task 10 — Aggregate Exact-Symbol Validation (Issue 17) — DONE (121a4f5 + d95d3a7)

- Fixed: `open_symbol` is now validated as one unit. Any exact-symbol marker (`contractVersion`, `symbolId`, `symbolLabel`, `context`, `continuation`) commits the whole object to exact-symbol validation via an outer `superRefine` over a permissive strict base: missing/wrong `contractVersion`, conflicting identities, missing `context`/`continuation` operation, mixed direct-span fields, and inner shape errors (`context.preset`, continuation `endLine` order, blank identities) all appear in ONE response at stable field paths. Direct spans (no exact marker) remain exempt and keep `startLine`/`endLine` + order validation.
- The read_file `mode` requirement now fires for any exact-symbol-marked request (previously only when the exact schema already parsed), so missing `mode` is reported together with the other violations. `formatZodError` now flattens `invalid_union` sub-issues into explicit `path: message` lines instead of a single opaque "Invalid input".
- All 9 frozen Phase-0 wire-contract discrimination vectors keep their accept/reject classification (regression-tested by the frozen suite).
- Verification: RED proved (single opaque `invalid_union`, mode hidden); GREEN — 5 new tests (3 contract unit + 2 read_file end-to-end) + contract/read_file/registry/outline/call_graph/search/golden 139/139 + full mcp suite 1467/1467 (was 1462), mcp typecheck clean. Note: first commit 121a4f5 missed the contract test file via pathspec; corrected by d95d3a7 (same message, mirroring Task 2's follow-up pattern).

### Task 11 — Add Positive-Only Query Projection v2 — DONE (afb08af)

- Added: `search-rerank-query-v2.ts` owns `SEARCH_RERANK_QUERY_PROJECTION_V2 = "search_rerank_query_v2"` and `buildSearchRerankQueryV2` — the positive-only `Question: <exact semantic question>` + `Requested answer type: <one positive description>` projection. The implementation description (`production implementation, control flow, and integration path`) never names competing artifact classes; no guidance, no focus labels, no numbers/paths/providers/scores.
- The routing module now imports the canonical identity from the v2 module (single source of truth), and `handleSearchCode` supplies `focusedQueryV2` to the resolver so v2 profiles receive the v2 bytes (fail-closed `search_rerank_query_v2_projection_unavailable` unchanged).
- The request-contract fixture set now binds `queryProjectionV2` bytes for every focus; manifest regenerated (digest `f9f07b1e…` → `c9b3d407…`), parser key list and drift coverage updated.
- Verification: RED proved (module missing); GREEN — 4 new exact-byte unit tests + contract fixture assertion + focused routing/contract/integration/lateon 43/43 + full mcp suite 1471/1471 (was 1467), contract:check + typecheck clean.

### Task 12 — Build Trusted Structural Answer Context — DONE (f5ddc0b)

- Added: `search-rerank-structural-context.ts` — `buildSearchRerankStructuralContext({candidate, registry, relationships})` emits bounded `directCallers`/`directCallees`/`supportingTests` reference lists (relation, repo-relative path, canonical symbol label) with the plan's trust rules: exact registry owner required (`resolveCanonicalOwner`, now exported from the projection module — single source of truth), references resolved only through the supplied serving registry/relationship pair (same sealed navigation generation by construction), high-confidence records with exact instance identities only (key-only, unresolved, suffix-fuzzy, and low-confidence edges omitted), deterministic sort by relation/path/label, capped by `SEARCH_RERANK_STRUCTURAL_CONTEXT_POLICY` (3/3/2).
- Projection inputs (v2/v3) now accept the optional `relationships` record set; the handlers rerank-document closure lazily loads and same-generation-validates the serving relationship records (`relationship_manifest_mismatch` failure reason added) and threads them into the projection — consumed by document projection v4 in Task 13 (the v4 gate is a widened local `wantsV4StructuralContext` check until the v4 policy identity exists).
- Verification: RED proved (module missing); GREEN — 5 new trust-rule tests (callers/callees, tests, ambiguous/unresolved/low-confidence omission, empty context, deterministic sort + caps) + full mcp suite 1476/1476 (was 1471), mcp typecheck clean.

### Task 13 — Add Answer-Packet Document Projection v4 — DONE (322750a)

- Added: `search-rerank-document-v4.ts` — `SEARCH_RERANK_DOCUMENT_V4_POLICY` (`search_rerank_document_v4`, 4,000 UTF-8 bytes) and `buildSearchRerankDocumentV4`, emitting the §2.3 answer packet: `repository_relative_path`, `candidate_role`, `symbol_kind`, `canonical_symbol_label`, `signature_or_declaration`, `query_relevant_source_excerpt`, and `structural_context {direct_callers, direct_callees, supporting_tests}` (canonical JSON).
- Budget discipline: structural references are the lowest priority after the mandatory declaration and query-relevant source. When the full packet exceeds the byte budget with an empty source excerpt, reference lists are truncated deterministically (supporting tests first, then callees, then callers, from the end) before source reduction runs; the mandatory declaration can never be displaced, and a projection that still exceeds with zero references fails closed (`RangeError`). Declaration and primary-source selection share the v2/v3 machinery, so selection stays identical to v3 when structural context is empty (parity-tested).
- `projectPublicationBoundSearchRerankDocumentV4` builds the trusted structural context per candidate (registry + same-generation relationships) and the handlers rerank-document closure now dispatches v4/v3/v2 and admits v4 in the projection gate; `wantsV4StructuralContext` now uses the real policy identity (replacing the Task 12 interim literal).
- Request-contract manifest now binds the v4 answer-packet fixture bytes (digest `c9b3d407…` → `d5aa4a07…`); parser key list and drift coverage updated.
- Verification: RED proved (module missing); GREEN — 4 new projection tests (packet shape, v3 parity, 4,000-byte stress with reference truncation, mandatory-over-budget fail-closed) + contract fixture assertion + focused rerank battery 53/53 + full mcp suite 1480/1480 (was 1476), contract:check + typecheck clean.
