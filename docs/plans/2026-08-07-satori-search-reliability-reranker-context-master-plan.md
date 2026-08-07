# Satori Search Reliability and Reranker Context Master Implementation Plan

> **STATUS (2026-08-08): IMPLEMENTED / HISTORICAL.** Superseded by the
> context-v4 plan (`docs/plans/2026-08-08-satori-search-contracts-focus-rerank-v4-master-plan.md`),
> which repaired the remaining contract/identity regressions (v1/v2 query
> compatibility, complete request identity, activation-policy truthfulness,
> subdirectory scope, must-recall disclosure, projection diagnostics,
> continuation/retry semantics, navigation-generation attribution, aggregated
> exact-symbol validation) and replaced the v3 rerank context with the
> positive-only query-v2 + answer-packet document-v4 context activated as the
> managed default. This document is retained for historical record only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan strictly one task at a time. Do not parallelize tasks, do not use subagents, and do not begin a later task until the current task is committed and its focused verification is green. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the production reliability and observability defects found during the TradingView runs, then improve the reranker input contract so LateOn receives the user's exact question, a deterministic answer-focus signal, and factual candidate roles—without reintroducing hardcoded ranking weights or local score-based reordering.

**Architecture:** Reliability fixes land first: Potion packaging/runtime repair, state-root-correct mutation ownership, bounded startup readiness, LateOn timeout diagnostics, and partial/diagnosable document projection. Only after those are stable does the reranker contract move to version 3, adding factual candidate roles and a compact query-focus envelope while preserving validated provider order as the final ranking authority. The project ends with production integration tests and documentation; no further A/B, labeling, tuning, or ranking-quality gates are part of this plan.

**Tech Stack:** TypeScript, Node.js 22.13+, pnpm workspaces, Node's built-in test runner with `tsx`, existing Satori Core/MCP/CLI packages, canonical JSON, SHA-256, LateOn's existing worker/profile system, npm pack/install smoke tests.

## Global Constraints

- Execute all tasks sequentially in the exact order in §4.
- Record the actual implementation base with `git rev-parse HEAD`; the public repository was last inspected at `fa9742a62fb7287b436a5a1350a3fc4953adfacd`, but the executing agent must use and record the current local `master`.
- Preserve native reranker ordering as the only production relevance authority.
- Do not restore path multipliers, test/docs penalties, changed-file boosts, agent-fit boosts, group score boosts, lexical weights, reranker RRF, or any other local relevance score manipulation.
- Do not add per-repository rules or TradingView-specific behavior.
- Do not train, tune, calibrate, or threshold reranker scores.
- Do not run another comparative quality evaluation, blind preference study, MRR/NDCG gate, or query-labeling exercise as part of implementation.
- Tests in this plan are contract/regression tests only. They prove behavior; they do not select ranking parameters.
- The exact user semantic question is the reranker question. Retrieval-only expansion text such as `implementation runtime source entrypoint` must never enter the reranker query.
- Candidate role and answer focus are factual metadata, not ranking weights.
- Provider order remains final after complete validation. Downstream grouping, diversity, disclosure, pagination, and continuation may omit or group results but may not score-sort them.
- Exact ownership, `must:`, `exclude:`, `lang:`, `path:`, scope, permissions, source freshness, publication authority, provider limits, byte limits, and failure fallback remain deterministic contracts.
- Projection failures must not be mislabeled as provider failures.
- A single unprojectable candidate must not cancel a useful rerank of other safely projectable candidates.
- No source text, API key, full provider payload, or absolute workspace path may be added to normal diagnostics.
- Per-document hashes and byte counts are available only in `debugMode=full` and are computed from the exact bytes sent to the provider.
- Do not increase LateOn's qualified timeouts or make them adaptive in this project.
- Preserve historical projection/profile versions for compatibility; introduce new identities rather than mutating v1/v2 bytes or meanings.
- Before every commit run `git diff --check`, the task's focused tests, and the named neighboring tests.
- Each task produces one semantic commit using the commit message specified in the task.

---

## 1. Source Findings and Design Decisions

This plan resolves the production issues recorded in `docs/evidence/native-reranker-tradingview-ab-20260807/ISSUES.md`:

1. A published npm tarball can lose the Potion helper execute bit.
2. `RuntimeOwnerRegistry` is currently global rather than scoped to the configured local state root.
3/8. Exact per-document reranker input bytes/hashes are not observable.
5. A cold search can race transient startup readiness and return `not_ready:indexing` without deterministic retry guidance.
6. LateOn can exceed wall-clock expectations under CPU starvation even though its qualified deadline remains fixed.
9. The reranker receives no explicit factual candidate role or answer-focus signal.
10. One projection failure currently aborts the entire rerank and hides the specific reason.

The controlled same-input comparison establishes the implementation direction but is not a release gate:

- Native order correctly publishes the validated provider sequence.
- Legacy hardcoded ranking was somewhat stronger on the small controlled preference/anchor sample.
- Native losses concentrated on implementation-seeking questions where test candidates ranked above the production mechanism.
- A global test/docs penalty is invalid because other queries were best answered by tests.

Therefore the approved fix is:

```text
exact user question
+ deterministic answer focus
+ factual candidate role
+ bounded source evidence
-> reranker decides relevance
-> provider order remains final
```

Not:

```text
test *= 0.65
docs *= 0.45
implementation *= 1.25
```

---

## 2. Final Runtime Contracts

### 2.1 Reranker query contract

The reranker receives one stable query string derived from the exact semantic question:

```text
Question:
<exact semanticQuery, outer whitespace trimmed, internal text unchanged>

Answer focus: <implementation|tests|documentation|configuration|references|neutral>

Guidance:
<one fixed sentence selected by answer focus>
```

The query must not include retrieval expansion text, file paths, candidate labels, scores, or repository-specific keywords.

### 2.2 Answer focus contract

```ts
export type SearchAnswerFocus =
    | "implementation"
    | "tests"
    | "documentation"
    | "configuration"
    | "references"
    | "neutral";
```

Resolution priority:

1. explicit test-seeking cues -> `tests`;
2. explicit documentation-seeking cues -> `documentation`;
3. configuration route/cues -> `configuration`;
4. references route/cues -> `references`;
5. implementation-seeking, ownership, structural, or natural-language `how does/how do` mechanism questions -> `implementation`;
6. otherwise -> `neutral`.

The resolver emits reasons for debug/tests but no numeric confidence or weight.

### 2.3 Candidate-role contract

```ts
export type SearchCandidateRole =
    | "implementation"
    | "test"
    | "documentation"
    | "configuration"
    | "generated"
    | "fixture"
    | "example"
    | "unknown";
```

Role is derived from existing path/language/symbol facts. It is included in the reranker document as a factual field and never used in local ordering arithmetic.

### 2.4 Projection result contract

```ts
export type SearchRerankProjectionFailureReason =
    | "generation_receipt_missing"
    | "navigation_status_invalid"
    | "registry_load_failed"
    | "registry_manifest_mismatch"
    | "owner_not_found"
    | "candidate_span_invalid"
    | "source_unavailable"
    | "source_hash_mismatch"
    | "projection_contract_failed";

export type SearchRerankProjectionResult =
    | Readonly<{
        ok: true;
        document: string;
        utf8Bytes: number;
        sha256: string;
        candidateRole: SearchCandidateRole;
        projectionIdentity: string;
    }>
    | Readonly<{
        ok: false;
        candidateId: string;
        reason: SearchRerankProjectionFailureReason;
    }>;
```

### 2.5 Partial projection behavior

```text
selected candidates
-> project each candidate independently
-> retain projectable candidates in original selected order
-> record projection failures
-> apply provider count/byte ceilings to projectable subset
-> if >= 2 candidates remain: rerank only those slots
-> if < 2 remain: skip provider and preserve retrieval order
```

Warnings:

- some candidates omitted but provider called: `RERANKER_INPUT_DEGRADED`;
- fewer than two safe documents remain: `RERANKER_SKIPPED_INPUT`;
- provider call/response fails: `RERANKER_FAILED`.

### 2.6 Debug observability contract

`debugMode=full` may expose, for each document actually sent:

```ts
{
    candidateId: string;
    rank: number;
    documentUtf8Bytes: number;
    documentSha256: string;
    candidateRole: SearchCandidateRole;
    answerFocus: SearchAnswerFocus;
    projectionIdentity: string;
    queryProjectionIdentity: string;
}
```

It must not expose document text.

### 2.7 Runtime-owner scope contract

- Local LanceDB runtimes use `<canonical SATORI_STATE_ROOT>/runtime-owner/owners.json`.
- Separate local state roots do not conflict.
- Runtimes sharing the same local state root still conflict when identity/version differs.
- Remote Milvus runtimes retain a user-global registry keyed by canonical endpoint hash, so two state roots cannot mutate the same remote backend under incompatible identities.
- Conflict messages print the actual registry and lock paths used by that registry instance.

### 2.8 Startup readiness contract

- A real create/reindex operation remains fail-closed.
- A transient sync over an already-proven generation may be awaited once through a bounded coalescing path.
- A still-not-ready response includes `retryAfterMs: 2000` and the current operation action/phase when known.
- Search never waits indefinitely.

### 2.9 LateOn timeout contract

Qualified timeout values remain unchanged. Full diagnostics add:

```ts
{
    queueWaitMs?: number;
    effectiveScoreDeadlineMs?: number;
    effectiveStageDeadlineMs?: number;
    observedWallMs?: number;
    deadlineLatenessMs?: number;
}
```

This distinguishes a model timeout from a timer firing late under event-loop/CPU starvation.

---

## 3. Central File Ownership and Sequential Order

| File | Exclusive task sequence |
|---|---|
| `packages/core/src/embedding/potion-embedding.ts` | Task 1 only |
| `packages/mcp/scripts/release-smoke.ts` | Task 2 only |
| `packages/mcp/src/config.ts` | Task 3, then Task 14 |
| `packages/mcp/src/core/runtime-owner.ts` | Task 3 only |
| `packages/mcp/src/server/shared-runtime.ts` | Task 3 only |
| `packages/mcp/src/core/tracked-root-readiness.ts` | Task 4 only |
| `packages/mcp/src/core/search-frontdoor.ts` | Task 4 only |
| `packages/mcp/src/core/search-types.ts` | Task 4, Task 5, Task 7, Task 8, Task 13, Task 15 |
| `packages/core/src/reranker/reranker.ts` | Task 5, then Task 14 |
| `packages/mcp/src/server/lateon-reranker.ts` | Task 5, then Task 14 |
| `packages/mcp/src/core/search-rerank-context.ts` | Task 6 only |
| `packages/mcp/src/core/search-rerank-projection.ts` | Task 6, then Task 12 |
| `packages/mcp/src/core/handlers.ts` | Task 4, Task 6, then Task 13 |
| `packages/mcp/src/core/search-execution.ts` | Task 5, Task 6, Task 7, Task 8, Task 13 |
| `packages/mcp/src/core/search-candidate-survival.ts` | Task 8 only |
| `packages/mcp/src/core/search-result-finalization.ts` | Task 5, then Task 8 |
| `packages/mcp/src/core/search-query-planning.ts` | Task 9 only |
| `packages/mcp/src/core/search-lexical-scoring.ts` | Task 9 only |
| `packages/mcp/src/core/search-ranking-policy.ts` | Task 10 only |
| `packages/mcp/src/core/search-rerank-document-v3.ts` | Task 12 only |
| LateOn profile/config/CLI files | Task 14 only |

No two tasks may be implemented concurrently.

---

## 4. Mandatory Task Order

```text
Task 0  Freeze current base and issue inventory
Task 1  Repair trusted Potion executable mode in Core
Task 2  Add packed direct-install Potion release smoke
Task 3  Scope RuntimeOwnerRegistry to the correct authority root
Task 4  Make startup indexing responses bounded and retryable
Task 5  Add LateOn deadline and contention observability
Task 6  Return typed publication-bound projection results
Task 7  Degrade projection per candidate instead of all-or-nothing
Task 8  Add per-document rerank observability and candidate-survival v4
Task 9  Add deterministic answer-focus classification
Task 10 Add deterministic factual candidate roles
Task 11 Add exact-question rerank query projection
Task 12 Add rerank document projection v3
Task 13 Integrate context v3 through production search execution
Task 14 Add and select the LateOn projection-v3 runtime profile
Task 15 Complete end-to-end contract verification and documentation
```

---

## Task 0: Freeze Current Base and Issue Inventory

**Files:**
- Create: `docs/evidence/search-reliability-context-baseline-20260807/BASELINE.md`

**Interfaces:**
- Consumes: current clean repository HEAD.
- Produces: exact base commit/tree, issue-to-task map, current projection/profile IDs, and focused command inventory.

- [ ] **Step 1: Record repository identity**

```bash
git status --short
git rev-parse HEAD
git rev-parse HEAD^{tree}
git log -1 --format='%H%n%aI%n%s'
```

Expected: clean worktree. If dirty, stop and classify pre-existing changes before proceeding.

- [ ] **Step 2: Record current source identities**

```bash
git hash-object packages/mcp/src/core/search-rerank-projection.ts
git hash-object packages/mcp/src/core/search-rerank-document-v2.ts
git hash-object packages/mcp/assets/lateon/runtime-profile-v2-d32.json
git grep -n 'search_rerank_document_v2\|lateon_offline_quality_projection_v2_d32_v2' -- packages
```

- [ ] **Step 3: Write `BASELINE.md`**

Include:

```text
base commit/tree
current package versions
issues 1,2,5,6,8,9,10 and owning tasks
current rerank query source = input.semanticQuery
current retrieval-only expansion string
current all-or-nothing projection loop
current runtime-owner registry path behavior
current LateOn score/stage deadline maxima
```

- [ ] **Step 4: Verify baseline document only**

```bash
git diff --check -- docs/evidence/search-reliability-context-baseline-20260807/BASELINE.md
```

- [ ] **Step 5: Commit**

```bash
git add docs/evidence/search-reliability-context-baseline-20260807/BASELINE.md
git commit -m "docs(search): record reliability and context baseline"
```

---

## Task 1: Repair Trusted Potion Executable Mode in Core

**Files:**
- Modify: `packages/core/src/embedding/potion-embedding.ts`
- Modify: `packages/core/src/embedding/potion-embedding.test.ts`

**Interfaces:**

Add:

```ts
export async function restoreVerifiedOwnerExecutableBit(input: {
    filePath: string;
    expectedSha256: string;
    label: string;
}): Promise<void>;
```

Required sequence:

```text
lstat -> regular file and not symlink
sha256 exact match
if owner execute bit absent: chmod(existingMode | S_IXUSR)
X_OK check
```

No group/world execute bits are added.

- [ ] **Step 1: Write the failing mode-repair test**

```ts
test("repairs only the owner execute bit after exact helper verification", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "potion-mode-"));
    const helper = path.join(root, "satori-potion");
    fs.writeFileSync(helper, Buffer.from("trusted-helper"));
    fs.chmodSync(helper, 0o644);
    const expected = crypto.createHash("sha256").update("trusted-helper").digest("hex");

    await restoreVerifiedOwnerExecutableBit({
        filePath: helper,
        expectedSha256: expected,
        label: "helper",
    });

    assert.equal(fs.statSync(helper).mode & 0o777, 0o744);
    fs.accessSync(helper, fs.constants.X_OK);
});
```

Also add tests that:

- checksum mismatch does not chmod;
- symlink is rejected;
- directory is rejected;
- an already executable `0744` file remains `0744`.

- [ ] **Step 2: Run RED**

```bash
node --import tsx --test packages/core/src/embedding/potion-embedding.test.ts
```

Expected: FAIL because `restoreVerifiedOwnerExecutableBit` does not exist.

- [ ] **Step 3: Implement the trusted repair**

Use `fs.promises.lstat`, the existing SHA-256 helper, `fs.promises.chmod`, and `fs.promises.access`. Replace the final helper `X_OK` block in `verifyPinnedPotionArtifacts()` with this function. Model/tokenizer/config files remain checksum-only.

- [ ] **Step 4: Run GREEN**

```bash
node --import tsx --test packages/core/src/embedding/potion-embedding.test.ts
pnpm --filter @zokizuan/satori-core typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/embedding/potion-embedding.ts packages/core/src/embedding/potion-embedding.test.ts
git commit -m "fix(potion): repair trusted helper execute permission"
```

---

## Task 2: Add Packed Direct-Install Potion Release Smoke

**Files:**
- Modify: `packages/mcp/scripts/release-smoke.ts`
- Create: `packages/mcp/scripts/release-smoke.test.ts`
- Modify: `packages/mcp/package.json`

**Interfaces:**

Export from `release-smoke.ts`:

```ts
export function resolveInstalledPotionPaths(runtimeRoot: string): {
    helperPath: string;
    modelPath: string;
};

export async function runPackedPotionSmoke(runtimeRoot: string): Promise<void>;
```

- [ ] **Step 1: Make the release-smoke module import-safe**

Wrap `main()` with:

```ts
if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
    void main().catch(/* existing error handling */);
}
```

- [ ] **Step 2: Write the failing packed-runtime test**

The test must:

1. pack Core and MCP;
2. install them with `--ignore-scripts` into a temporary prefix;
3. locate `assets/potion/linux-x64/satori-potion`;
4. force mode `0644` to emulate npm normalization;
5. call `runPackedPotionSmoke(runtimeRoot)`;
6. assert owner execute bit exists afterward;
7. assert a 256-dimensional embedding is returned from one tiny local request, then close the embedding.

Skip the execution portion only when platform is not Linux x64; mode/path validation still runs.

- [ ] **Step 3: Run RED**

```bash
node --import tsx --test packages/mcp/scripts/release-smoke.test.ts
```

- [ ] **Step 4: Implement packed Potion smoke**

Dynamically import installed `@zokizuan/satori-core`, call `PotionEmbedding.create({ helperPath, modelPath })`, run one `embedQuery("release smoke")`, require length `256` and finite values, and close it.

Call `runPackedPotionSmoke()` from the existing release smoke after packed installation and before MCP initialization.

Add to MCP scripts:

```json
"test:release-smoke": "node --import tsx --test scripts/release-smoke.test.ts"
```

- [ ] **Step 5: Run GREEN**

```bash
node --import tsx --test packages/mcp/scripts/release-smoke.test.ts
pnpm -C packages/mcp release:smoke
```

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/scripts/release-smoke.ts packages/mcp/scripts/release-smoke.test.ts packages/mcp/package.json
git commit -m "test(release): exercise packed Potion runtime"
```

---

## Task 3: Scope Runtime-Owner Registry to the Correct Authority Root

**Files:**
- Create: `packages/mcp/src/core/runtime-state-root.ts`
- Create: `packages/mcp/src/core/runtime-state-root.test.ts`
- Modify: `packages/mcp/src/config.ts`
- Modify: `packages/mcp/src/core/runtime-owner.ts`
- Modify: `packages/mcp/src/core/runtime-owner.test.ts`
- Modify: `packages/mcp/src/server/shared-runtime.ts`
- Modify: `packages/mcp/src/server/shared-runtime-host.test.ts`

**Interfaces:**

```ts
export function resolveSatoriStateRoot(input: {
    configured?: string;
    homeDir: string;
}): string;

export function resolveRuntimeOwnerStateDir(input: {
    stateRoot: string;
    vectorStoreProvider: "LanceDB" | "Milvus";
    milvusEndpoint?: string;
    homeDir: string;
}): string;
```

Add to `ContextMcpConfig`:

```ts
stateRoot?: string;
```

`createMcpConfig()` populates a canonical absolute state root.

Rules:

```text
LanceDB -> <stateRoot>/runtime-owner
Milvus  -> <home>/.satori/runtime-owner/milvus/<sha256(normalizedEndpoint)>
```

Add public registry accessors:

```ts
public getRegistryPath(): string;
public getLockPath(): string;
```

Change formatter signatures:

```ts
formatRuntimeOwnerConflictMessage({
    currentVersion,
    currentPid,
    conflictingOwners,
    registryError,
    registryPath,
    lockPath,
})
formatRuntimeOwnerConflictNextStep(conflictingOwners, {
    registryPath,
    lockPath,
})
```

- [ ] **Step 1: Write failing root-resolution tests**

Cover:

- default state root;
- explicit absolute state root;
- relative state root rejection;
- two LanceDB state roots produce different owner directories;
- same Milvus endpoint across state roots produces the same owner directory;
- different Milvus endpoints produce different directories.

- [ ] **Step 2: Run RED**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/runtime-state-root.test.ts \
  packages/mcp/src/core/runtime-owner.test.ts
```

- [ ] **Step 3: Implement resolver and registry path plumbing**

`SharedRuntimeHost` passes:

```ts
stateDir: resolveRuntimeOwnerStateDir({
    stateRoot: config.stateRoot ?? resolveSatoriStateRoot({ homeDir: os.homedir() }),
    vectorStoreProvider: config.vectorStoreProvider,
    milvusEndpoint: config.milvusEndpoint,
    homeDir: os.homedir(),
})
```

- [ ] **Step 4: Add integration tests**

Required tests:

```text
same LanceDB state root + differing identity -> mutation blocked
different LanceDB state roots + differing identity -> neither registry sees the other
different state roots + same Milvus endpoint -> conflict remains
conflict message prints actual registry and lock paths
```

- [ ] **Step 5: Run GREEN**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/runtime-state-root.test.ts \
  packages/mcp/src/core/runtime-owner.test.ts \
  packages/mcp/src/server/shared-runtime-host.test.ts
pnpm --filter @zokizuan/satori-mcp typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/core/runtime-state-root.ts packages/mcp/src/core/runtime-state-root.test.ts \
  packages/mcp/src/config.ts packages/mcp/src/core/runtime-owner.ts \
  packages/mcp/src/core/runtime-owner.test.ts packages/mcp/src/server/shared-runtime.ts \
  packages/mcp/src/server/shared-runtime-host.test.ts
git commit -m "fix(runtime): scope mutation ownership to backend authority"
```

---

## Task 4: Make Startup Indexing Responses Bounded and Retryable

**Files:**
- Modify: `packages/mcp/src/core/tracked-root-readiness.ts`
- Modify: `packages/mcp/src/core/search-frontdoor.ts`
- Modify: `packages/mcp/src/core/search-frontdoor.test.ts`
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/core/handlers.status.test.ts`

**Interfaces:**

Extend indexing readiness:

```ts
| {
    state: "indexing";
    codebasePath: string;
    operation?: {
        action: "create" | "reindex" | "sync" | "repair";
        phase: string;
        generation: number;
    };
    searchableGenerationAvailable: boolean;
}
```

Add to blocked search envelopes:

```ts
retryAfterMs?: number;
indexingOperation?: {
    action: string;
    phase: string;
    generation: number;
};
```

Add host function:

```ts
waitForSearchableSync?: (codebasePath: string, timeoutMs: number) => Promise<boolean>;
```

- [ ] **Step 1: Write failing response tests**

Test that create/reindex indexing responses immediately return:

```json
{
  "status": "not_ready",
  "reason": "indexing",
  "retryAfterMs": 2000,
  "indexingOperation": { "action": "reindex", "phase": "writing", "generation": 4 }
}
```

- [ ] **Step 2: Write failing sync-coalescing test**

Simulate:

```text
initial readiness = indexing(action=sync, searchableGenerationAvailable=true)
waitForSearchableSync returns true
second readiness = ready
```

Assert search proceeds instead of returning `not_ready`.

Also assert:

- wait is invoked at most once;
- timeout is exactly `DEFAULT_MANAGE_RETRY_AFTER_MS`;
- create/reindex never enters the wait path;
- unresolved sync returns `not_ready` with retry hint.

- [ ] **Step 3: Run RED**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-frontdoor.test.ts \
  packages/mcp/src/core/handlers.status.test.ts
```

- [ ] **Step 4: Implement operation-aware bounded retry**

`runSearchFrontDoor()` may retry only when all are true:

```ts
state.state === "indexing"
&& state.operation?.action === "sync"
&& state.searchableGenerationAvailable
&& host.waitForSearchableSync
```

After the one bounded wait, call `prepareInitialTrackedRootRead()` again. No loop beyond that single retry.

- [ ] **Step 5: Run GREEN**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-frontdoor.test.ts \
  packages/mcp/src/core/handlers.status.test.ts \
  packages/mcp/src/core/handlers.scope.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/core/tracked-root-readiness.ts packages/mcp/src/core/search-frontdoor.ts \
  packages/mcp/src/core/search-frontdoor.test.ts packages/mcp/src/core/search-types.ts \
  packages/mcp/src/core/handlers.ts packages/mcp/src/core/handlers.status.test.ts
git commit -m "fix(search): bound cold-start readiness retry"
```

---

## Task 5: Add LateOn Deadline and Contention Observability

**Files:**
- Modify: `packages/core/src/reranker/reranker.ts`
- Modify: `packages/core/src/reranker/voyageai-reranker.ts`
- Modify: `packages/core/src/reranker/voyageai-reranker.test.ts`
- Modify: `packages/mcp/src/server/lateon-reranker.ts`
- Modify: `packages/mcp/src/server/lateon-reranker.test.ts`
- Modify: `packages/mcp/src/core/search-execution.ts`
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/search-result-finalization.ts`
- Modify: `packages/mcp/src/core/search-result-finalization.native-order.test.ts`

**Interfaces:**

```ts
export interface RerankExecutionDiagnostics {
    attempts: number;
    retries: number;
    timeouts: number;
    queueWaitMs?: number;
    effectiveScoreDeadlineMs?: number;
    effectiveStageDeadlineMs?: number;
    observedWallMs?: number;
    deadlineLatenessMs?: number;
}
```

Update `RerankOptions.onExecutionDiagnostics` to use this interface.

LateOn `QueuedRerank` adds:

```ts
executionStartedAt?: number;
```

- [ ] **Step 1: Write failing LateOn diagnostics tests**

Using fake timers or an injected clock, assert:

- successful execution reports queue wait, effective deadlines, and observed wall time;
- execution timeout reports deadline lateness `max(0, observedWallMs - effectiveDeadlineMs)`;
- no qualified deadline value is increased;
- diagnostics callback failure never changes rerank behavior.

- [ ] **Step 2: Run RED**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/server/lateon-reranker.test.ts \
  packages/core/src/reranker/voyageai-reranker.test.ts
```

- [ ] **Step 3: Implement diagnostics**

LateOn reports once on success or terminal failure. Voyage continues to report attempts/retries/timeouts; optional LateOn-only fields remain absent.

- [ ] **Step 4: Project bounded debug fields**

Add optional fields under `hints.debugSearch.rerank`:

```ts
queueWaitMs?: number;
effectiveScoreDeadlineMs?: number;
effectiveStageDeadlineMs?: number;
observedWallMs?: number;
deadlineLatenessMs?: number;
```

Normal non-debug responses remain unchanged except existing warning codes.

- [ ] **Step 5: Run GREEN**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/server/lateon-reranker.test.ts \
  packages/mcp/src/core/search-result-finalization.native-order.test.ts
pnpm --filter @zokizuan/satori-core test
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/reranker/reranker.ts packages/core/src/reranker/voyageai-reranker.ts \
  packages/core/src/reranker/voyageai-reranker.test.ts packages/mcp/src/server/lateon-reranker.ts \
  packages/mcp/src/server/lateon-reranker.test.ts packages/mcp/src/core/search-execution.ts \
  packages/mcp/src/core/search-types.ts packages/mcp/src/core/search-result-finalization.ts \
  packages/mcp/src/core/search-result-finalization.native-order.test.ts
git commit -m "feat(rerank): expose qualified deadline diagnostics"
```

---

## Task 6: Return Typed Publication-Bound Projection Results

**Files:**
- Modify: `packages/mcp/src/core/search-rerank-projection.ts`
- Modify: `packages/mcp/src/core/search-rerank-projection.test.ts`
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/core/search-execution.ts`
- Modify: `packages/mcp/src/core/search-native-rerank.integration.test.ts`
- Create: `packages/mcp/src/core/search-rerank-context.ts`
- Create: `packages/mcp/src/core/search-rerank-projection-result.ts`

**Interfaces:**

Create `search-rerank-context.ts` with the exact `SearchAnswerFocus` and `SearchCandidateRole` unions from §§2.2–2.3. This task defines types only; Tasks 9–10 add the resolvers.

Create the exact `SearchRerankProjectionFailureReason` and `SearchRerankProjectionResult` types from §2.4.

Add:

```ts
export async function projectPublicationBoundSearchRerankDocumentV2(input: {
    candidateId: string;
    codebaseRoot: string;
    semanticQuery: string;
    result: SearchResultLike;
    registry: SymbolRegistry;
    readSourceEvidence?: CurrentSourceEvidenceReader;
}): Promise<SearchRerankProjectionResult>;
```

Keep the historical wrapper for compatibility:

```ts
export async function buildPublicationBoundSearchRerankDocumentV2(input: {
    codebaseRoot: string;
    semanticQuery: string;
    result: SearchResultLike;
    registry: SymbolRegistry;
    readSourceEvidence?: CurrentSourceEvidenceReader;
}): Promise<string | undefined> {
    const result = await projectPublicationBoundSearchRerankDocumentV2({
        ...input,
        candidateId: [
            input.result.relativePath,
            input.result.startLine ?? 0,
            input.result.endLine ?? 0,
        ].join(":"),
    });
    return result.ok ? result.document : undefined;
}
```

- [ ] **Step 1: Write one failing test per reason**

Use small exact fixtures and assert the reason rather than `undefined`:

```text
owner_not_found
candidate_span_invalid
source_unavailable
source_hash_mismatch
projection_contract_failed
```

Handler-level tests cover:

```text
generation_receipt_missing
navigation_status_invalid
registry_load_failed
registry_manifest_mismatch
```

- [ ] **Step 2: Run RED**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-rerank-projection.test.ts \
  packages/mcp/src/core/handlers.golden.test.ts
```

- [ ] **Step 3: Implement typed projection**

For successful v2 projection compute:

```ts
const utf8Bytes = Buffer.byteLength(document, "utf8");
const sha256 = crypto.createHash("sha256").update(document, "utf8").digest("hex");
```

Use `candidateRole: "unknown"` temporarily; Task 10 supplies factual roles.

- [ ] **Step 4: Change `SearchExecutionHost.buildRerankDocument`**

New signature:

```ts
buildRerankDocument?: (
    rerankQuery: string,
    result: SearchResultLike,
) => Promise<SearchRerankProjectionResult>;
```

Do not change execution behavior in this task; adapt the existing caller by translating failed results to the current all-or-nothing failure until Task 7.

- [ ] **Step 5: Run GREEN**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-rerank-projection.test.ts \
  packages/mcp/src/core/handlers.golden.test.ts \
  packages/mcp/src/core/search-native-rerank.integration.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/core/search-rerank-context.ts packages/mcp/src/core/search-rerank-projection-result.ts \
  packages/mcp/src/core/search-rerank-projection.ts \
  packages/mcp/src/core/search-rerank-projection.test.ts packages/mcp/src/core/handlers.ts \
  packages/mcp/src/core/search-execution.ts packages/mcp/src/core/search-native-rerank.integration.test.ts
git commit -m "refactor(rerank): expose projection failure reasons"
```

---

## Task 7: Degrade Projection Per Candidate Instead of All-or-Nothing

**Files:**
- Modify: `packages/mcp/src/core/search-execution.ts`
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/warnings.ts`
- Modify: `packages/mcp/src/core/search-native-rerank.integration.test.ts`

**Interfaces:**

Add warning codes:

```ts
RERANKER_INPUT_DEGRADED
RERANKER_SKIPPED_INPUT
```

Add projection summary:

```ts
projection: {
    requestedCandidates: number;
    projectedCandidates: number;
    omittedCandidates: number;
    failureCounts: Partial<Record<SearchRerankProjectionFailureReason, number>>;
    firstFailure?: {
        candidateId: string;
        reason: SearchRerankProjectionFailureReason;
    };
}
```

- [ ] **Step 1: Write failing partial-projection tests**

Required cases:

1. Four selected candidates, one projection failure: provider receives three, successful provider order applies only to those three slots, failed candidate remains at its original slot, warning is `RERANKER_INPUT_DEGRADED`.
2. Two selected candidates, one projection failure: provider receives zero calls, retrieval order remains, warning is `RERANKER_SKIPPED_INPUT`.
3. Every candidate fails with one shared authority reason: no provider call, diagnostics show all failures, no `RERANKER_FAILED`.
4. Provider later times out after partial projection: warnings include input degradation and `RERANKER_FAILED`; fallback remains the full frozen retrieval order.

- [ ] **Step 2: Run RED**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-native-rerank.integration.test.ts
```

- [ ] **Step 3: Replace `Promise.all` abort behavior**

Use:

```ts
const projectionRows = await Promise.all(
    providerBoundedSelection.map(async (candidate) => ({
        candidate,
        projection: await host.buildRerankDocument!(
            input.rerankQuery ?? input.semanticQuery,
            candidate.result,
        ),
    })),
);
const projectable = projectionRows.filter((row) => row.projection.ok);
const failed = projectionRows.filter((row) => !row.projection.ok);
```

Preserve the original selected candidate order. Pass only projectable candidate/document pairs into the existing provider-limit and byte-limit logic.

Never mutate `scored` before provider validation succeeds.

- [ ] **Step 4: Separate local input failures from provider failure counters**

- projection omissions do not increment `rerankerFailures`;
- provider call/parse failures still increment exactly once;
- `rerankerAttempted` remains false when fewer than two projectable documents remain.

- [ ] **Step 5: Run GREEN**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-native-rerank.integration.test.ts \
  packages/mcp/src/core/search-execution*.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/src/core/search-execution.ts packages/mcp/src/core/search-types.ts \
  packages/mcp/src/core/warnings.ts packages/mcp/src/core/search-native-rerank.integration.test.ts
git commit -m "fix(rerank): skip unprojectable candidates safely"
```

---

## Task 8: Add Per-Document Observability and Candidate-Survival v4

**Files:**
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/search-candidate-survival.ts`
- Modify: `packages/mcp/src/core/search-candidate-survival.test.ts`
- Modify: `packages/mcp/src/core/search-execution.ts`
- Modify: `packages/mcp/src/core/search-result-finalization.ts`
- Modify: `packages/mcp/src/core/search-result-finalization.native-order.test.ts`
- Modify: `packages/mcp/src/core/handlers.scope.test.ts`
- Modify: `scripts/satori-search-candidate-capture.mjs`
- Modify: `scripts/satori-search-candidate-capture.test.mjs`

**Interfaces:**

Add occurrence metadata:

```ts
rerankInput?: {
    documentUtf8Bytes: number;
    documentSha256: string;
    candidateRole: SearchCandidateRole;
    answerFocus?: SearchAnswerFocus;
    projectionIdentity: string;
    queryProjectionIdentity?: string;
};
```

Task 8 populates document bytes/hash/role/projection identity. Task 13 begins populating `answerFocus` and `queryProjectionIdentity` for every actual provider input.

Bump:

```ts
schemaVersion: "search_candidate_survival_v4";
```

Add removal reasons:

```ts
"reranker_document_projection_failed"
"reranker_input_insufficient"
```

- [ ] **Step 1: Write RED observability tests**

Assert:

- metadata appears only for `reranker_input` occurrences;
- before Task 13, `answerFocus` may be absent; after Task 13 it is required for every provider input;
- SHA-256 matches the exact document passed to the fake reranker;
- byte count matches `Buffer.byteLength(document, "utf8")`;
- no document text appears anywhere in serialized full debug output;
- non-full debug contains no per-document metadata;
- projection failures appear as removals with candidate identity and no source text.

- [ ] **Step 2: Run RED**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-candidate-survival.test.ts \
  packages/mcp/src/core/search-result-finalization.native-order.test.ts
```

- [ ] **Step 3: Implement v4 trace**

`appendSearchCandidateStage()` accepts optional occurrence metadata keyed by candidate ID. Populate it only from the exact projectable records selected after the byte budget.

- [ ] **Step 4: Run GREEN**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-candidate-survival.test.ts \
  packages/mcp/src/core/search-result-finalization.native-order.test.ts \
  packages/mcp/src/core/search-native-rerank.integration.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/core/search-types.ts packages/mcp/src/core/search-candidate-survival.ts \
  packages/mcp/src/core/search-candidate-survival.test.ts packages/mcp/src/core/search-execution.ts \
  packages/mcp/src/core/search-result-finalization.ts \
  packages/mcp/src/core/search-result-finalization.native-order.test.ts \
  packages/mcp/src/core/handlers.scope.test.ts scripts/satori-search-candidate-capture.mjs \
  scripts/satori-search-candidate-capture.test.mjs
git commit -m "feat(rerank): expose bounded input provenance"
```

---

## Task 9: Add Deterministic Answer-Focus Classification

**Files:**
- Modify: `packages/mcp/src/core/search-lexical-scoring.ts`
- Modify: `packages/mcp/src/core/search-query-planning.ts`
- Modify: `packages/mcp/src/core/search-query-planning.test.ts`
- Create: `packages/mcp/src/core/search-answer-focus.ts`
- Create: `packages/mcp/src/core/search-answer-focus.test.ts`

**Interfaces:**

```ts
import type { SearchAnswerFocus } from "./search-rerank-context.js";
export type { SearchAnswerFocus } from "./search-rerank-context.js";

export type SearchAnswerFocusResolution = Readonly<{
    focus: SearchAnswerFocus;
    reasons: readonly string[];
}>;

export function resolveSearchAnswerFocus(
    plan: SearchQueryPlan,
): SearchAnswerFocusResolution;
```

Extend `SearchQueryPlan`:

```ts
documentationSeeking: boolean;
```

Explicit docs cues:

```regex
\b(doc|docs|documentation|documented|readme|guide|manual)\b
```

Implementation focus also covers:

```regex
\bhow\s+(?:does|do|is|are)\b
|\bwhere\s+is\b.*\bimplemented\b
|\bwhat\s+(?:blocks|prevents|validates|gates|controls)\b
```

unless tests/docs/config/reference focus already won by priority.

- [ ] **Step 1: Write exact table tests**

```ts
const cases = [
    ["how does Shariah compliance checking block trades", "implementation"],
    ["how does regime filtering gate entry decisions", "implementation"],
    ["find tests for trade veto behavior", "tests"],
    ["where is trade veto documented", "documentation"],
    ["where is the risk threshold configured", "configuration"],
    ["who calls validate_order", "references"],
    ["trading risk management", "neutral"],
] as const;
```

Assert reasons are stable and no numeric values are emitted.

- [ ] **Step 2: Run RED**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-answer-focus.test.ts \
  packages/mcp/src/core/search-query-planning.test.ts
```

- [ ] **Step 3: Implement resolver**

Do not alter retrieval mode, rerank admission, exact pinning, or ranking order.

- [ ] **Step 4: Run GREEN**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-answer-focus.test.ts \
  packages/mcp/src/core/search-query-planning.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/core/search-lexical-scoring.ts packages/mcp/src/core/search-query-planning.ts \
  packages/mcp/src/core/search-query-planning.test.ts packages/mcp/src/core/search-answer-focus.ts \
  packages/mcp/src/core/search-answer-focus.test.ts
git commit -m "feat(search): classify requested answer focus"
```

---

## Task 10: Add Deterministic Factual Candidate Roles

**Files:**
- Create: `packages/mcp/src/core/search-candidate-role.ts`
- Create: `packages/mcp/src/core/search-candidate-role.test.ts`
- Modify: `packages/mcp/src/core/search-ranking-policy.ts`

**Interfaces:**

```ts
import type { SearchCandidateRole } from "./search-rerank-context.js";
export type { SearchCandidateRole } from "./search-rerank-context.js";

export function resolveSearchCandidateRole(input: {
    relativePath: string;
    language?: string;
    symbolKind?: string;
}): SearchCandidateRole;
```

Rules in exact priority:

1. existing `isTestPath` -> `test`;
2. existing `isDocPath` -> `documentation`;
3. existing `isGeneratedPath` -> `generated`;
4. existing `isFixturePath` -> `fixture`;
5. `classifyPathCategory(input.relativePath) === "example"` -> `example`;
6. config-like language/extension or symbol kind `config` -> `configuration`;
7. categories `core`, `srcRuntime`, `scriptRuntime`, `adapter`, `entrypoint`, `neutral` -> `implementation`;
8. otherwise -> `unknown`.

Config extensions:

```text
.json .jsonc .yaml .yml .toml .ini .xml .properties .env
Dockerfile
```

- [ ] **Step 1: Write RED table tests**

Cover Python/TS tests, docs, runtime source, config, generated, fixtures, examples, and unknown binary-like paths.

- [ ] **Step 2: Run RED**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 packages/mcp/src/core/search-candidate-role.test.ts
```

- [ ] **Step 3: Implement role mapping**

Reuse exported existing path predicates; do not duplicate their regexes.

- [ ] **Step 4: Run GREEN**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-candidate-role.test.ts \
  packages/mcp/src/core/search-ranking-policy.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/core/search-candidate-role.ts packages/mcp/src/core/search-candidate-role.test.ts \
  packages/mcp/src/core/search-ranking-policy.ts
git commit -m "feat(search): classify factual candidate roles"
```

---

## Task 11: Add Exact-Question Rerank Query Projection

**Files:**
- Create: `packages/mcp/src/core/search-rerank-query.ts`
- Create: `packages/mcp/src/core/search-rerank-query.test.ts`

**Interfaces:**

```ts
export const SEARCH_RERANK_QUERY_PROJECTION_VERSION =
    "search_rerank_query_v1" as const;

export function buildSearchRerankQuery(input: {
    semanticQuery: string;
    answerFocus: SearchAnswerFocus;
}): string;
```

Exact guidance text:

```ts
const GUIDANCE: Record<SearchAnswerFocus, string> = {
    implementation:
        "Rank the production mechanism and its integration path first. Tests and documentation are supporting evidence unless they are the clearest direct answer.",
    tests:
        "Rank tests that directly prove the requested behavior first. Production code may be supporting context.",
    documentation:
        "Rank documentation that directly explains the requested topic first. Code may be supporting context.",
    configuration:
        "Rank active configuration declarations and the code that loads or applies them first.",
    references:
        "Rank direct callers, callees, references, and integration sites that answer the relationship question first.",
    neutral:
        "Rank the candidate that most directly answers the question. Candidate role is evidence, not a fixed preference.",
};
```

Serialization:

```ts
return [
    "Question:",
    semanticQuery.trim(),
    "",
    `Answer focus: ${answerFocus}`,
    "",
    "Guidance:",
    GUIDANCE[answerFocus],
].join("\n");
```

- [ ] **Step 1: Write RED exact-byte tests**

Assert:

- the original question appears exactly once;
- line endings are stable;
- no `implementation runtime source entrypoint` expansion appears;
- no repository path, candidate role, score, or provider identity appears;
- every focus produces the exact guidance above.

- [ ] **Step 2: Run RED**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 packages/mcp/src/core/search-rerank-query.test.ts
```

- [ ] **Step 3: Implement exact projection**

Reject an empty trimmed semantic query.

- [ ] **Step 4: Run GREEN**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 packages/mcp/src/core/search-rerank-query.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/core/search-rerank-query.ts packages/mcp/src/core/search-rerank-query.test.ts
git commit -m "feat(rerank): preserve exact question with answer focus"
```

---

## Task 12: Add Rerank Document Projection v3

**Files:**
- Create: `packages/mcp/src/core/search-rerank-document-v3.ts`
- Create: `packages/mcp/src/core/search-rerank-document-v3.test.ts`
- Modify: `packages/mcp/src/core/search-rerank-projection.ts`
- Modify: `packages/mcp/src/core/search-rerank-projection.test.ts`

**Interfaces:**

```ts
export const SEARCH_RERANK_DOCUMENT_V3_POLICY = Object.freeze({
    id: "search_rerank_document_v3",
    previousVersion: "search_rerank_document_v2",
    maximumUtf8Bytes: 4_000,
    serialization: "canonical_json_utf8",
});
```

V3 canonical fields:

```ts
interface SearchRerankDocumentV3Projection {
    repository_relative_path: string;
    language: string;
    candidate_role: SearchCandidateRole;
    symbol_kind: string;
    canonical_symbol_label: string;
    signature_or_declaration: string;
    documentation_excerpt: string;
    query_relevant_source_excerpt: string;
    required_owner_siblings: readonly {
        repository_relative_path: string;
        canonical_symbol_label: string;
    }[];
}
```

V3 must reuse v2 source selection, declaration, documentation, owner sibling, and 4,000-byte algorithms exactly. The only new serialized field is `candidate_role`.

Add:

```ts
export interface SearchRerankDocumentV3Input {
    readonly relativePath: string;
    readonly language: string;
    readonly candidateRole: SearchCandidateRole;
    readonly symbolKind: string;
    readonly canonicalSymbolLabel: string;
    readonly symbolSpan: SourceLineSpan;
    readonly content: string;
    readonly signatureOrDeclaration?: string;
    readonly documentationExcerpt?: string;
    readonly query?: string;
    readonly evidenceSpans?: readonly SourceLineSpan[];
    readonly requiredOwnerSiblings?: readonly SearchRerankDocumentV2Sibling[];
}

export function buildSearchRerankDocumentV3(
    rawInput: unknown,
): SearchRerankDocumentV3Result;

export async function projectPublicationBoundSearchRerankDocumentV3(input: {
    candidateId: string;
    codebaseRoot: string;
    semanticQuery: string;
    result: SearchResultLike;
    registry: SymbolRegistry;
    readSourceEvidence?: CurrentSourceEvidenceReader;
}): Promise<SearchRerankProjectionResult>;
```

- [ ] **Step 1: Write v2/v3 parity tests**

For the same fixture:

- source excerpts are identical;
- declaration/documentation/sibling fields are identical;
- v3 differs only by `candidate_role` and projection identity;
- v3 remains <= 4,000 UTF-8 bytes;
- every role serializes exactly;
- v2 output bytes remain unchanged.

- [ ] **Step 2: Run RED**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-rerank-document-v3.test.ts \
  packages/mcp/src/core/search-rerank-projection.test.ts
```

- [ ] **Step 3: Implement v3**

Extract only genuinely shared v2 internals into non-exported helpers if required. Do not alter v2 policy constants or canonical bytes.

- [ ] **Step 4: Run GREEN**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-rerank-document-v2.test.ts \
  packages/mcp/src/core/search-rerank-document-v3.test.ts \
  packages/mcp/src/core/search-rerank-projection.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/core/search-rerank-document-v3.ts \
  packages/mcp/src/core/search-rerank-document-v3.test.ts \
  packages/mcp/src/core/search-rerank-projection.ts \
  packages/mcp/src/core/search-rerank-projection.test.ts
git commit -m "feat(rerank): add factual document projection v3"
```

---

## Task 13: Integrate Context v3 Through Production Search Execution

**Files:**
- Modify: `packages/mcp/src/core/handlers.ts`
- Modify: `packages/mcp/src/core/search-execution.ts`
- Modify: `packages/mcp/src/core/search-types.ts`
- Modify: `packages/mcp/src/core/search-native-rerank.integration.test.ts`
- Create: `packages/mcp/src/core/search-rerank-context.integration.test.ts`

**Interfaces:**

Extend `SearchExecutionInput`:

```ts
answerFocus: SearchAnswerFocus;
rerankQuery: string;
rerankQueryProjectionIdentity: typeof SEARCH_RERANK_QUERY_PROJECTION_VERSION;
```

Production setup:

```ts
const answerFocus = resolveSearchAnswerFocus(queryPlan).focus;
const rerankQuery = buildSearchRerankQuery({
    semanticQuery: parsedOperators.semanticQuery,
    answerFocus,
});
const rerankQueryProjectionIdentity = SEARCH_RERANK_QUERY_PROJECTION_VERSION;
```

`runSearchExecution()` continues using its retrieval expansion only for semantic retrieval passes. `host.reranker.rerank()` receives `input.rerankQuery`, never the expanded retrieval query.

The host projection uses v3 and `resolveSearchCandidateRole()`.

- [ ] **Step 1: Write failing production-context tests**

Required cases:

1. Query `how does Shariah compliance checking block trades` -> `answerFocus=implementation`.
2. Query `find tests for trade veto behavior` -> `answerFocus=tests`.
3. Query `where is the risk threshold configured` -> `answerFocus=configuration`.
4. Fake reranker captures the exact query and documents:
   - exact user question appears once;
   - no retrieval expansion appears;
   - implementation/test candidate documents contain correct factual roles;
   - no score multiplier or preference number appears.
5. Provider returns test first for an implementation query: final product still follows provider order, proving context did not reintroduce local reranking.

- [ ] **Step 2: Run RED**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-rerank-context.integration.test.ts \
  packages/mcp/src/core/search-native-rerank.integration.test.ts
```

- [ ] **Step 3: Implement production plumbing**

Update ranked-set projection identity to v3 whenever a v3-profile reranker applies. Retrieval-only results remain `not_applicable`.

- [ ] **Step 4: Run GREEN**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-rerank-context.integration.test.ts \
  packages/mcp/src/core/search-native-rerank.integration.test.ts \
  packages/mcp/src/core/search-result-set-identity.test.ts \
  packages/mcp/src/core/handlers.scope.test.ts
pnpm --filter @zokizuan/satori-mcp typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/core/handlers.ts packages/mcp/src/core/search-execution.ts packages/mcp/src/core/search-types.ts \
  packages/mcp/src/core/search-native-rerank.integration.test.ts \
  packages/mcp/src/core/search-rerank-context.integration.test.ts
git commit -m "feat(search): send focused question context to reranker"
```

---

## Task 14: Add and Select the LateOn Projection-v3 Runtime Profile

**Files:**
- Create: `packages/mcp/assets/lateon/runtime-profile-v3-d32.json`
- Modify: `packages/mcp/src/server/lateon-reranker-protocol.ts`
- Modify: `packages/mcp/src/server/lateon-reranker.ts`
- Modify: `packages/mcp/src/server/lateon-reranker.test.ts`
- Modify: `packages/mcp/src/config.ts`
- Modify: `packages/mcp/src/server/shared-runtime-identity.ts`
- Modify: `packages/mcp/src/server/shared-runtime-identity.test.ts`
- Modify: `packages/cli/src/lateon-model-store.ts`
- Modify: `packages/cli/src/test-fixtures/lateon-fixture.ts`
- Modify: `packages/cli/src/lateon-model-store.test.ts`
- Modify: `packages/core/src/reranker/reranker.ts`

**Interfaces:**

Add ID:

```ts
contextV3D32: "lateon_offline_quality_projection_v3_d32_v1"
```

Add a new profile type rather than widening the meaning of v2:

```ts
export type LateOnRuntimeProfileV3 = Omit<
    LateOnRuntimeProfileV2,
    "schemaVersion" | "profileId" | "identity"
> & Readonly<{
    schemaVersion: "satori_lateon_runtime_profile_v3";
    profileId: "lateon_offline_quality_projection_v3_d32_v1";
    identity: LateOnRuntimeProfileBase["identity"] & Readonly<{
        projectionVersion: "search_rerank_document_v3";
        projectionSha256: string;
        queryProjectionVersion: "search_rerank_query_v1";
    }>;
}>;
```

Extend `Reranker` with an optional stable query-projection identity:

```ts
getQueryProjectionVersion?(): string | undefined;
```

LateOn returns `search_rerank_query_v1` for the v3 profile and `semantic_query_raw_v1` for historical v1/v2 profiles.

The v3 profile:

- uses the same model repository/revision and artifacts as v2 d32;
- uses projection version `search_rerank_document_v3`;
- keeps candidate depth `32`;
- keeps all existing execution and operational bounds unchanged;
- has a new canonical profile digest because the projection contract changed.

Default LateOn profile becomes v3. V2 d16/d32 remain loadable for compatibility when explicitly selected.

- [ ] **Step 1: Write failing profile tests**

Assert:

- v3 profile parses;
- its projection identity is v3;
- candidate depth and all timeout/thread/resource values equal v2 d32;
- v2 profile remains parseable;
- default constructor selects v3;
- shared-runtime identity changes between v2 and v3 profile IDs;
- CLI model-store environment exports the v3 default profile.

- [ ] **Step 2: Run RED**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/server/lateon-reranker.test.ts \
  packages/mcp/src/server/shared-runtime-identity.test.ts
pnpm --filter @zokizuan/satori-cli test
```

- [ ] **Step 3: Create profile and update selectors**

Compute the projection SHA-256 from the canonical v3 policy source/contract using the existing repository convention. Do not copy the v2 SHA.

- [ ] **Step 4: Run GREEN**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/server/lateon-reranker.test.ts \
  packages/mcp/src/server/shared-runtime-identity.test.ts \
  packages/mcp/src/core/search-rerank-context.integration.test.ts
pnpm --filter @zokizuan/satori-cli test
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/assets/lateon/runtime-profile-v3-d32.json \
  packages/mcp/src/server/lateon-reranker-protocol.ts packages/mcp/src/server/lateon-reranker.ts \
  packages/mcp/src/server/lateon-reranker.test.ts packages/mcp/src/config.ts \
  packages/mcp/src/server/shared-runtime-identity.ts packages/mcp/src/server/shared-runtime-identity.test.ts \
  packages/cli/src/lateon-model-store.ts packages/cli/src/lateon-model-store.test.ts \
  packages/cli/src/test-fixtures/lateon-fixture.ts packages/core/src/reranker/reranker.ts
git commit -m "feat(lateon): activate focused projection v3 profile"
```

---

## Task 15: Complete End-to-End Contract Verification and Documentation

**Files:**
- Create: `packages/mcp/src/core/search-reliability-context.e2e.test.ts`
- Modify: `README.md`
- Modify: `packages/mcp/README.md`
- Create: `docs/evidence/search-reliability-context-production-20260807/PRODUCTION_RECEIPT.md`
- Modify: `docs/evidence/native-reranker-tradingview-ab-20260807/ISSUES.md`

**End-to-end test scenarios:**

### Scenario A: exact question and factual roles

Input:

```text
how does Shariah compliance checking block trades
```

Provider capture must show:

```text
Answer focus: implementation
Question appears exactly once
implementation file role=implementation
test file role=test
no numeric preference or multiplier
```

### Scenario B: test-seeking query

Input:

```text
find tests that prove Shariah trade rejection
```

Must show `Answer focus: tests` while still publishing provider order unchanged.

### Scenario C: partial projection

One of four candidates fails `source_hash_mismatch`. Provider receives the other three. The failed candidate stays in place; valid slots follow provider order; warning is `RERANKER_INPUT_DEGRADED`.

### Scenario D: no safe documents

Every projection fails. Provider calls remain zero; retrieval order is unchanged; warning is `RERANKER_SKIPPED_INPUT`; no `RERANKER_FAILED`.

### Scenario E: provider timeout under diagnostic delay

Provider timeout publishes frozen retrieval order and reports qualified deadline plus observed wall/deadline lateness. No timeout value changes.

### Scenario F: state-root isolation

Two local LanceDB runtimes with different state roots can each mutate. Two incompatible runtimes sharing one state root still conflict.

### Scenario G: cold-start sync

A same-root transient sync is joined once and search succeeds. A reindex remains `not_ready` with `retryAfterMs=2000`.

### Scenario H: packed Potion closure

Installed packed MCP with helper mode forced to `0644` repairs it only after checksum validation and successfully produces one local embedding.

- [ ] **Step 1: Write/run the E2E test**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 packages/mcp/src/core/search-reliability-context.e2e.test.ts
```

- [ ] **Step 2: Run focused complete matrix**

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/core/search-rerank-projection.test.ts \
  packages/mcp/src/core/search-native-rerank.integration.test.ts \
  packages/mcp/src/core/search-rerank-context.integration.test.ts \
  packages/mcp/src/core/search-reliability-context.e2e.test.ts \
  packages/mcp/src/core/search-frontdoor.test.ts \
  packages/mcp/src/core/runtime-owner.test.ts \
  packages/mcp/src/server/lateon-reranker.test.ts
```

- [ ] **Step 3: Run package and repository verification**

```bash
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-cli test
pnpm --filter @zokizuan/satori-mcp test
pnpm test:scripts
pnpm check
pnpm build
pnpm -C packages/mcp release:smoke
```

Record exact exit codes and counts in the receipt.

- [ ] **Step 4: Run static prohibition checks**

```bash
! git grep -n -E 'SEARCH_RERANK_RRF_K|SEARCH_RERANK_WEIGHT|SCOPE_PATH_MULTIPLIERS|SEARCH_AGENT_FIT_|SEARCH_CHANGED_FIRST_MULTIPLIER' -- packages
! git grep -n -E 'candidateRole.*multiplier|answerFocus.*weight|test.*0\.65|docs.*0\.45' -- packages
```

- [ ] **Step 5: Update documentation**

Document:

- exact question + answer focus;
- factual candidate roles;
- provider order remains final;
- partial projection behavior and warning distinctions;
- full-debug document hashes/bytes without text;
- state-root mutation ownership;
- `retryAfterMs` readiness behavior;
- LateOn fixed deadlines and lateness diagnostics;
- no global test/docs penalties.

Update ISSUES.md statuses:

```text
#1 fixed
#2 fixed
#5 fixed with bounded retry semantics
#6 observability fixed; adaptive timeout explicitly rejected
#8 fixed
#9 fixed by projection v3 context
#10 fixed by typed/partial projection
#3 superseded by exact per-document observability; root cause no longer inferred from aggregate bytes
```

- [ ] **Step 6: Write production receipt**

The receipt must include:

```text
base and final commits
task commit list
projection/profile IDs
warning semantics
exact verification commands/counts
confirmation that no comparative quality evaluation or tuning was run
confirmation that provider order remains final
```

- [ ] **Step 7: Commit**

```bash
git add packages/mcp/src/core/search-reliability-context.e2e.test.ts README.md packages/mcp/README.md \
  docs/evidence/search-reliability-context-production-20260807/PRODUCTION_RECEIPT.md \
  docs/evidence/native-reranker-tradingview-ab-20260807/ISSUES.md
git commit -m "docs(search): seal focused reranker context rollout"
```

---

## 5. Explicit Non-Goals

This plan does not include:

- another TradingView A/B;
- additional relevance judgments;
- MRR, Hit@k, nDCG, sign tests, or blind-judge gates;
- no-answer/abstention redesign;
- LateOn model fine-tuning;
- embedding or retrieval-fusion changes;
- dynamic timeout inflation;
- adaptive LateOn thread counts;
- score blending;
- test/docs/path multipliers;
- per-repository ranking configuration;
- click/implicit-feedback learning;
- full reranker document text in diagnostics.

If a future task wants to change LateOn threads, deadlines, model, or candidate depth, it requires a separate runtime-profile qualification and is not an extension of this plan.

---

## 6. Final Definition of Done

The project is complete only when:

- plain packed MCP installation can use Potion even if npm normalized helper mode to `0644`;
- separate local `SATORI_STATE_ROOT`s no longer block one another's mutations;
- the same local mutation authority still rejects incompatible simultaneous owners;
- transient sync startup races have one bounded join path and deterministic retry hints;
- full diagnostics distinguish qualified deadline from wall-clock lateness;
- every projection failure has a stable reason;
- one projection failure no longer aborts all useful reranking;
- debug full mode records exact per-document byte/hash provenance without text;
- reranker query contains the exact user question, one answer-focus label, and fixed generic guidance only;
- reranker documents contain factual candidate roles;
- implementation-seeking questions are marked as implementation focus without locally demoting tests;
- explicit test/docs/config/reference queries select the corresponding focus;
- LateOn v3 projection/profile identity is stable and v2 remains explicitly loadable;
- provider order remains final and no local relevance weights return;
- all focused, package, release-smoke, check, and build commands pass;
- the final working tree is clean.

---

## 7. Execution Log (append-only)

Rule: after each task passes its acceptance checks and is committed, append one entry
here before starting the next task. Record the commit, whether the task completed
exactly as planned, and every deviation (extra/missing files, renamed test targets,
pre-existing failures observed, contract interpretations). Do not rewrite earlier
entries.

- **Task 0 — done — `15cb77f` (prior session).** Baseline frozen as planned.
- **Task 1 — done — `bc3b0ae` (prior session).** Potion exec-bit repair after checksum verification, as planned.
- **Task 2 — done — `600f5d0` (prior session).** Packed release smoke, as planned.
- **Task 3 — done — `45d666e`.** Completed the prior session's unstaged work (same model, trusted) and added the Step-4 integration tests. Deviation: conflict message now prints both `Registry:` and `Lock:` paths per §2.7 (previously registry path only); `getRegistryPath()`/`getLockPath()` accessors added to support it.
- **Task 4 — done — `45e75dd`.** As planned: operation-aware indexing readiness, `retryAfterMs` + `indexingOperation` on blocked envelopes, single bounded sync join via `waitForSearchableSync`.
- **Task 5 — done — `4368477`.** Deviations:
  1. Also modified `packages/core/src/reranker/index.ts` (barrel export) — required for mcp to see `RerankExecutionDiagnostics`; not in the plan's file list.
  2. `packages/core/src/reranker/voyageai-reranker.ts` listed by the plan but unchanged: Voyage reports only attempts/retries/timeouts; the absence of LateOn-only fields is asserted by typed tests instead.
  3. Plan's GREEN names `search-result-finalization.native-order.test.ts`; the actual file is `search-execution.native-order.test.ts`. The new execution-capture test was added there.
  4. Pre-existing failure observed, unrelated and identical at HEAD (`45e75dd`): `packages/core/src/net/fetch-with-deadline.test.ts` — "retries a listed retryable network error up to maxAttempts" (ECONNREFUSED not retried in this environment). Left untouched; separate finding.
- **Task 6 — done — `3202426`.** Typed projection results as planned (`search-rerank-context.ts`, `search-rerank-projection-result.ts`, `projectPublicationBoundSearchRerankDocumentV2`, historical wrapper kept, host signature typed, failed projections still translate to the all-or-nothing `document_projection` fallback). Deviations:
  1. Exported `searchRerankCandidateId(result)` from `search-rerank-projection.ts` and used it in both the compatibility wrapper and the handler wiring; the plan inlined the candidateId computation in the wrapper.
  2. Handler-level reasons (`generation_receipt_missing`, `navigation_status_invalid`, `registry_load_failed`, `registry_manifest_mismatch`) are exercised at the `SearchExecutionHost` boundary in `search-native-rerank.integration.test.ts` via typed host fakes: no handler harness carries a live reranker (`handlers.golden.test.ts` runs `reranker: null`). The golden suite was still run as the plan's regression guard.
  3. The pre-existing fake in "projection failure falls back without calling the provider" now returns reason `projection_contract_failed` instead of `undefined`.
- **Task 7 — done — `2e2d035`.** Per-candidate projection degradation, `RERANKER_INPUT_DEGRADED`/`RERANKER_SKIPPED_INPUT` warnings, projection summary, provider skipped below two projectable documents without counting a provider failure. Deviations:
  1. Partial degradation applies on the typed `host.buildRerankDocument` path only; the synchronous `searchQuerySupport.buildRerankDocument` fallback keeps its all-or-nothing behavior because it cannot emit typed reasons. The plan's Step 3 snippet assumes `host.buildRerankDocument!` unconditionally; `input.rerankQuery` is deferred to Task 11, so the query stays `input.semanticQuery`.
  2. `byteSelection.inputBytes` was hoisted to `byteSelectionInputBytes` because byte selection now happens inside each branch (the previous shared variable went out of scope).
  3. `RerankPhaseResult.warning?: "RERANKER_FAILED"` became `warnings: WarningCode[]`; `RERANKER_FAILED` is appended last on terminal provider/parse failure. Projection summary surfaces on the ok outcome as `rerankerProjection`.
  4. The Task 6 host-boundary tests were updated in place to the §2.5 contract (no `document_projection` failure phase; `RERANKER_SKIPPED_INPUT` plus failure counts instead).
- **Task 8 — done — `6f64ceb`.** Candidate-survival v4 with per-document rerank input provenance (bytes/hash/role/projection identity, never text) and `reranker_document_projection_failed`/`reranker_input_insufficient` removal reasons. Deviations:
  1. `search-result-finalization.ts` listed by the plan but unchanged: the trace already flows into full-debug `debugSearch.candidateSurvival` via `structuredClone`, so metadata and removals surface without finalization edits.
  2. `scripts/satori-search-candidate-capture.mjs`/`.test.mjs` no longer exist at that path; they were archived under `scripts/archive/ranking-v3/` and are not part of the live test suite, so they were left untouched.
  3. The plan's RED names `search-result-finalization.native-order.test.ts`; no such file exists. The end-to-end provenance tests were added to `search-native-rerank.integration.test.ts` alongside the existing survival test, plus a unit test in `search-candidate-survival.test.ts`.
  4. `answerFocus`/`queryProjectionIdentity` remain absent as planned; Task 13 populates them.
- **Task 9 — done — `fb60e35`.** Deterministic answer-focus resolver with §2.2 priority (tests > documentation > configuration > references > implementation > neutral), `documentationSeeking` added to `SearchQueryPlan`, exact table cases pass, reasons are stable non-numeric strings. No retrieval mode, rerank admission, exact pinning, or ranking changes. Deviations:
  1. Configuration and references focus are derived from the plan's existing `route.kind` (`configuration`/`references`) and `referenceSeeking`; implementation focus combines `implementationSeeking` with the plan's question-cue regex applied to `semanticQuery` inside the resolver. The plan did not specify which plan signals map to each focus, only the priority and cues.
  2. Two extra priority tests beyond the exact table (tests > documentation, documentation > configuration) were added to pin the §2.2 ordering.
  3. RED/GREEN ran from `packages/mcp` with `./src/test-state-root.ts` (same invocation convention as Tasks 3–8).
- **Task 10 — done — `512e809`.** `resolveSearchCandidateRole` with the plan's exact priority chain (test > documentation > generated > fixture > example > configuration > implementation categories > unknown), reusing the exported ranking-policy predicates without duplicating regexes. Table covers Python/TS tests, docs, runtime sources, config, generated, fixtures, examples, and unknown artifact/landing paths. Deviations:
  1. The plan's Modify of `search-ranking-policy.ts` had no specified content; added an exported `isConfigurationPath` predicate there (config extensions + `Dockerfile`) so path-classification authority stays in one owner and the resolver reuses it. Config-like languages (`json`, `jsonc`, `yaml`, `toml`, `ini`, `xml`, `properties`, `dockerfile`) and `symbolKind === "config"` are checked in the resolver.
  2. Rule 7 is implemented as a category-set membership check on `classifyPathCategory` output (`core`, `srcRuntime`, `scriptRuntime`, `adapter`, `entrypoint`, `neutral` → implementation; remaining `landing`/`artifact` fall to `unknown`), which is equivalent to the plan's enumeration.
- **Task 11 — done — `81801eb`.** As planned: `SEARCH_RERANK_QUERY_PROJECTION_VERSION = "search_rerank_query_v1"`, exact fixed guidance per focus, exact-byte serialization (`Question:` / question / blank / `Answer focus:` / blank / `Guidance:` / guidance), empty trimmed question rejected. Deviation: the "no candidate role" assertion strips the neutral guidance's fixed sentence ("Candidate role is evidence, not a fixed preference.") before checking, since that sentence is part of the mandated guidance text.
- **Task 12 — done — `36b5296`.** Projection v3 = v2 algorithms + one new `candidate_role` field; parity tests prove identical source/declaration/documentation/sibling fields, key-set delta of exactly `candidate_role`, ≤4,000 bytes, all eight roles serializing exactly, and unchanged v2 canonical bytes. `projectPublicationBoundSearchRerankDocumentV3` resolves the factual role via `resolveSearchCandidateRole` and keeps all v2 fail-closed reasons. Deviations:
  1. The plan said to extract shared v2 internals into "non-exported helpers"; they are exported instead (`isRecord`, `requireString`, `requireSafeRelativePath`, `sourceLines`, `requireBoundedPhysicalLine`, `requireBoundedDocumentation`, `requireLineSpan`, `normalizeEvidenceSpans`, `sourceLinesInSpan`, `firstStructuralDeclaration`, `normalizeRequiredOwnerSiblings`, `selectedExcerptText`, `selectSource`, and the budgeted loop as `selectRerankSourceWithinBudget`) because v3 lives in a separate module and must reuse the exact algorithms. No v2 constants, logic, or canonical bytes changed (v2 suite re-run green after the extraction).
  2. `search-rerank-document-v2.ts` is therefore modified but was not in the plan's commit file list; it was included in the Task 12 commit (amended before any push) to avoid leaving the tree broken.
  3. The v2/v3 publication-bound guard chain was factored into a shared `resolvePublicationBoundEvidence` helper plus a `success` builder in `search-rerank-projection.ts`; behavior is byte-identical (all existing typed tests pass unchanged).
- **Task 13 — done — `e9774a0`.** `SearchExecutionInput` carries `answerFocus`, `rerankQuery`, and `rerankQueryProjectionIdentity`; handlers compute them exactly as specified (`resolveSearchAnswerFocus(queryPlan).focus`, `buildSearchRerankQuery({ semanticQuery: parsedOperators.semanticQuery, answerFocus })`); the provider receives `input.rerankQuery` and never the expanded retrieval query; the host projection gate now admits v2 or v3 document projection identities and dispatches `projectPublicationBoundSearchRerankDocumentV3` for v3; survival metadata populates `answerFocus`/`queryProjectionIdentity`. New `search-rerank-context.integration.test.ts` covers the three focus derivations, exact-query/factual-role capture, provider-order authority, and survival metadata. Deviations:
  1. Document projection still receives the raw `semanticQuery` (via `host.buildRerankDocument`) for excerpt selection; only the provider query switched to the exact-question projection. The plan specified the provider-query switch but not the projection query source; using the raw question keeps v2-era excerpt selection semantics.
  2. `search-types.ts` listed in the plan's commit list but unchanged: the `rerankInput.answerFocus`/`queryProjectionIdentity` fields already landed in Task 8. The commit instead includes `search-execution.native-order.test.ts` and `search-execution.must-lane.test.ts`, whose input builders needed the three new required fields (not listed by the plan).
  3. The accumulated §7 execution log (Tasks 0–12) was swept into this commit instead of waiting for Task 15; content is unchanged, only the commit it landed in differs.
  4. Ranked-set projection identity needs no code change here: `resolveSearchRerankerProjectionIdentity` already reports `reranker.getDocumentProjectionVersion()` when applied and `not_applicable` otherwise, so Task 14's v3 profile flips it automatically.
- **Task 14 — done — `3b4fff8`.** v3 D32 runtime profile added and selected as the default: new `runtime-profile-v3-d32.json` asset (v2 D32 repo/revision/artifacts/depth-32/bounds reused verbatim), `LateOnRuntimeProfileV3` union member, `LATEON_RUNTIME_PROFILE_IDS.contextV3D32`, reranker default flipped, `getQueryProjectionVersion()` on the core `Reranker` interface (LateOn: `search_rerank_query_v1` for v3, `semantic_query_raw_v1` for v1/v2), config default and owner-default activation policy flipped, shared-runtime identity binds the resolved default profile, CLI acquisition chain flipped to the v3 profile/manifest/frozen digest. Deviations:
  1. Extra files beyond the plan's 11-file list, all required by the default flip: `packages/mcp/assets/lateon/runtime-profile-v3-d32.acquisition.json` (new manifest binding profile sha256 `a7890686...`), `packages/mcp/src/server/lateon-reranker-worker.ts` (three `schemaVersion === v2` guards generalized to `!== v1` so v3 gets identical truncation/session/token-limit treatment), `packages/mcp/src/server/runtime-bootstrap.test.ts`, `packages/cli/src/{doctor,runtime-config,install,install-preflight}.test.ts` (v2-d32 literals flipped to the v3 id), and `packages/cli/scripts/release-smoke.ts` (asset filenames).
  2. v3 profile `identity.projectionSha256` = `54b5436e...` = SHA-256 of the current `search-rerank-document-v3.ts` source file, following the O0 receipt convention (projection source hash at receipt time); frozen profile file digest `a7890686...` is bound by `FROZEN_LATEON_D32_PROFILE_SHA256` and the acquisition manifest.
  3. `qualificationStatus` set to `disabled_optional_not_track_o_or_held_out_candidate` (judgment call: v3 is not a Track O candidate and the plan did not specify the value).
  4. `lateon_d32_owner_default_v1` activation policy now requires exactly `contextV3D32` (the new owner default) instead of the v2 D32 id; explicit v2 D32 remains loadable without a policy. This keeps CLI runtime-config's `=== DEFAULT_LATEON_PROFILE_ID` check consistent automatically; the three consumer test regexes were updated to match.
  5. Shared-runtime identity payload now binds the resolved default LateOn profile (`contextV3D32` when provider is lateon and no explicit env), so releases with different defaults do not share a runtime host; covered by new `shared-runtime-identity.test.ts` cases.
  6. LateOn thread-policy error message generalized to "LateOn bounded thread policy is immutable at N intra-op threads." (existing test regex still matches); `isV2Profile` guard renamed to `hasBoundedExecutionContract` covering v2|v3 with a shared `validateBoundedExecutionContract` helper.
  7. Test-narrowing guards (`if (profile.schemaVersion !== "...") throw`) added in `lateon-reranker.test.ts` because `assert.equal` does not narrow the profile union for v2/v3-only field access.
  8. Pre-existing failure observed, unrelated to Task 14 and identical at HEAD: `src/server/shared-runtime.test.ts` 6/9 tests fail — its `config()` sets `vectorStoreProvider: "Milvus"` without `milvusEndpoint`, which `resolveRuntimeOwnerStateDir` (Task 3, `45d666e`) now rejects; Task 3 added `stateRoot` to that fixture but not `milvusEndpoint`. Left untouched; separate finding for Task 15 consideration.


  - **Task 15 — done — `689c804`.** E2E scenario suite `search-reliability-context.e2e.test.ts` (Scenarios A–H, 8/8) reuses production owners end to end; focused matrix 98/98; both static prohibition greps return zero matches; ISSUES.md statuses (#1, #2, #3, #5, #6, #8, #9, #10), README.md, and packages/mcp/README.md updated; `PRODUCTION_RECEIPT.md` sealed with commits, identities (`search_rerank_query_v1`, `search_rerank_document_v3` projectionSha256 `54b5436e86337b2c356a7d8ecf698a2d7b833349230098826e4b02c16d779a83`, frozen profile digest `a78906862ee684828354edb0449f15b4c0024c973368b0e03536db70770a88af`), warning semantics, exact counts, and the no-quality-evaluation / provider-order-final confirmations. Deviations:
  1. Extra files beyond the plan's 5-file pathspec, all rollout-caused fixes surfaced by Step 3 verification: `packages/cli/src/install.test.ts` (owner registry path moved to `<stateRoot>/runtime-owner/owners.json` by Task 3; `shared-runtime-identity.js` gained a `lateon-reranker-protocol.js` import in Task 14, copied alongside in the direct-lifecycle test), `packages/mcp/src/core/runtime-owner.ts` and `packages/mcp/src/core/search-rerank-context.integration.test.ts` (two unused variables introduced by the rollout, caught by `pnpm check`), and `packages/mcp/src/server/shared-runtime.test.ts` (the latent Task 3 fixture regression noted in Task 14's entry: added `milvusEndpoint: "localhost:19530"`; 9/9).
  2. Scenario H uses a deterministic checksummed fake Potion worker to prove repair-after-digest-verification plus one local embedding; the real packed closure is proven by `pnpm -C packages/mcp release:smoke` (exit 0), which exercises the actual pinned helper and model.
  3. Final verification results: mcp 1417/1417 exit 0 (one intermediate timing flake in `shared-runtime-host.test.ts`, green isolated and in the final run); cli 339/339 exit 0 after the install.test.ts fixes; core exit 1 with only the pre-existing environmental `fetch-with-deadline.test.ts` failure (recorded in Task 5's entry; a transient `milvus-restful-http.test.ts` runner-deserialization crash did not reproduce isolated; no core source changed by this rollout); `pnpm test:scripts` exit 1 with one pre-existing failure — stale eval pin `known-exact-target` (189–604 vs current 186–603 in `search-exact-fast-path.ts`); pin and source are byte-identical to base `15cb77f`, so it predates the rollout and was left untouched; `pnpm check`, `pnpm build`, `release:smoke`, and mcp typecheck all exit 0.
  4. No comparative quality evaluation or tuning was run, per plan; Scenario A/B assert structural context (exact question once, deterministic focus, factual roles, no numeric weights) and provider-order authority, not ranking quality.
