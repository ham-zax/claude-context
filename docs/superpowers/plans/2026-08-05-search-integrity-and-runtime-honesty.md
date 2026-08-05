# Search Integrity and Runtime Honesty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Use TDD and request code review after every task.

**Goal:** Make `must:` retrieval complete within a bounded budget, bound external reranker latency, report call-graph uncertainty honestly, include untracked files in freshness, and expose readiness/pagination limitations without weakening existing safety guarantees.

**Architecture:** Add dedicated bounded recovery lanes rather than relaxing existing filters or fail-closed behavior. Search, call-graph, freshness, and response-presentation changes remain separate so each can be independently tested, reviewed, and reverted.

**Tech Stack:** TypeScript, Node.js, `node:test`, Satori Core, Satori MCP, LanceDB/lexical projection, VoyageAI reranking, Git working-tree inspection.

The confirmed implementations are primarily in MCP search execution, Core reranking, MCP call-graph assembly, and MCP freshness handling. Finding evidence and verification records: [`docs/remediation/2026-08-04-search-weakness-report-verification.md`](../../remediation/2026-08-04-search-weakness-report-verification.md).

## Global constraints

* Base implementation on commit `403723ee09ed9762195d983b3c4595985a917f5d`.
* Do not mix these changes into the already-qualified CLI `1.9.2` release artifact.
* Do not publish or push without explicit authorization.
* Do not weaken the fail-closed fingerprint gate.
* Do not return search results before durable marker proof.
* Preserve `rerankAdjusted === false` whenever reranking fails or is skipped.
* Preserve current empty-inbound call-graph follow-up hints.
* Preserve `.satoriignore` exclusion policy.
* All additional retrieval, retries, fallbacks, and caches must be bounded.
* No fuzzy constructor matching or basename-only cross-module resolution.
* Do not change ranking for queries without `must:`.
* Do not change the reranker-disabled path.
* Every task requires red → green regression proof.

---

## Task 0: Establish a frozen baseline

**Files:**

* Create: `docs/evidence/search-integrity-baseline-20260805/BASELINE.md`

* Do not modify production code.

* [ ] Record the current commit:

```bash
git status --short --branch
git rev-parse HEAD
git log --oneline -8
```

Expected:

```text
HEAD = 403723ee09ed9762195d983b3c4595985a917f5d
working tree clean
```

* [ ] Run the current focused and package suites:

```bash
pnpm --filter @zokizuan/satori-core typecheck
pnpm --filter @zokizuan/satori-core test

pnpm --filter @zokizuan/satori-mcp typecheck
pnpm --filter @zokizuan/satori-mcp test

pnpm run versions:check
git diff --check
```

* [ ] Capture fixtures reproducing:

```text
must: match outside normal candidate pool
VoyageAI request that never resolves
cross-module Python constructor call
brand-new untracked source file
payload complete but marker absent
continuation cache not admissible
```

Do not rely on live daemon timing for deterministic tests.

* [ ] Commit only the baseline evidence:

```bash
git add docs/evidence/search-integrity-baseline-20260805
git commit -m "test: record search integrity baselines"
```

---

## Task 1: Add a bounded `must:` retrieval lane

**Files:**

* Modify: `packages/mcp/src/core/search-execution.ts`
* Modify: `packages/mcp/src/core/search-query-support.ts`
* Modify: `packages/mcp/src/core/search-query-planning.ts`
* Modify or create focused tests beside those files.
* Add an MCP-level response test for the new note.

**Produces:**

```ts
interface MustConstraintRetrievalOutcome {
    attempted: boolean;
    candidatesExamined: number;
    candidateBudget: number;
    budgetExhausted: boolean;
}
```

### Required behavior

The current semantic/lexical retrieval remains the primary lane.

Run the dedicated `must:` lexical lane when:

```ts
queryPlan.mustTokens.length > 0
&& survivingCandidates.length < requestedResultLimit
```

The lane must:

1. Query the lexical projection using every `must:` value as a mandatory literal term.
2. Keep quoted values as one exact substring token.
3. Use the existing operator-constraint candidate maximum as its hard budget.
4. Merge candidates by the existing stable candidate identity.
5. Re-run the normal candidate evaluator.
6. Never bypass path, language, repository, fingerprint, or exclusion checks.
7. Never scan the repository directly as an unbounded fallback.

Pseudo-flow:

```ts
const primary = await retrievePrimaryCandidates(...);
let evaluated = evaluateCandidates(primary, queryPlan);

let mustOutcome: MustConstraintRetrievalOutcome | null = null;

if (
    queryPlan.mustTokens.length > 0
    && evaluated.accepted.length < requestedResultLimit
) {
    const recovery = await retrieveMandatoryLexicalCandidates({
        tokens: queryPlan.mustTokens,
        limit: operatorConstraintCandidateLimit,
        lexicalProjection,
    });

    evaluated = evaluateCandidates(
        mergeCandidatesByIdentity(primary, recovery.candidates),
        queryPlan,
    );

    mustOutcome = {
        attempted: true,
        candidatesExamined: recovery.candidates.length,
        candidateBudget: operatorConstraintCandidateLimit,
        budgetExhausted: recovery.budgetExhausted,
    };
}
```

### Response truthfulness

When no candidate survives after both lanes, attach:

```text
MUST_NOT_SATISFIED_WITHIN_RETRIEVAL_BUDGET
```

Metadata:

```ts
{
    mustTokens: string[];
    candidateBudget: number;
    candidatesExamined: number;
}
```

When some results survive but the dedicated lane exhausts its budget before filling the requested result count, use:

```text
MUST_RESULTS_MAY_BE_INCOMPLETE_WITHIN_RETRIEVAL_BUDGET
```

Do not claim that no other matching files exist.

### Tests

* [ ] Write a failing test where the only matching file is beyond the normal top-N lexical pool.
* [ ] Verify `must:"replace(tzinfo=None)"` remains one literal token.
* [ ] Verify the matching outside-pool file is recovered.
* [ ] Verify a genuinely absent phrase produces the explicit note.
* [ ] Verify partial recovery plus exhausted budget produces the incomplete-results note.
* [ ] Verify a query without `must:` produces byte-equivalent ranked candidates and no extra lexical call.
* [ ] Verify wildcards remain unsupported and are treated literally.

Run:

```bash
pnpm --filter @zokizuan/satori-mcp test -- search-query-planning
pnpm --filter @zokizuan/satori-mcp test -- search-execution
pnpm --filter @zokizuan/satori-mcp typecheck
```

Commit:

```bash
git commit -am "fix(search): add bounded must-constrained retrieval"
```

---

## Task 2: Bound VoyageAI reranker latency and expose failures

**Files:**

* Modify: `packages/core/src/reranker/voyageai-reranker.ts`
* Modify: `packages/core/src/reranker/voyageai-reranker.test.ts`
* Modify: `packages/mcp/src/core/search-execution.ts`
* Modify: `packages/mcp/src/core/search-response-helpers.ts`
* Modify related search-diagnostics tests.

**Produces:**

```ts
type RerankerFailureKind =
    | "timeout"
    | "transient_http"
    | "permanent_http"
    | "network"
    | "invalid_response";

class RerankerRequestError extends Error {
    readonly kind: RerankerFailureKind;
    readonly status: number | null;
    readonly attempts: number;
}
```

Constants:

```ts
const RERANK_TIMEOUT_MS = 30_000;
const RERANK_MAX_ATTEMPTS = 2;
const RERANK_RETRY_DELAY_MS = 250;
```

### Retry classification

Retry once for:

```text
HTTP 408
HTTP 425
HTTP 429
HTTP 5xx
ETIMEDOUT
ECONNRESET
EAI_AGAIN
Abort caused by the 30-second attempt timeout
```

Do not retry:

```text
HTTP 400
HTTP 401
HTTP 403
HTTP 404
invalid request payload
invalid successful response
caller cancellation
```

Use a per-attempt abort signal. Preserve caller cancellation independently from the request timeout.

### Diagnostics

Extend search diagnostics:

```ts
rerankerFailures: number;
rerankerRetries: number;
rerankerTimeouts: number;
```

On terminal failure:

* add `RERANKER_FAILED`;
* include bounded classification metadata;
* continue with retrieval/fusion ordering;
* keep `rerankAdjusted === false` for every candidate;
* do not label fallback scores as reranker scores.

### Tests

* [ ] First request returns 503, second succeeds.
* [ ] Both attempts return 503.
* [ ] Request exceeds 30 seconds using fake timers or an injected timeout.
* [ ] HTTP 401 fails immediately with one attempt.
* [ ] Caller cancellation is not retried.
* [ ] Failure increments `rerankerFailures`.
* [ ] Timeout increments `rerankerTimeouts`.
* [ ] Retry increments `rerankerRetries`.
* [ ] Search still returns candidates with `RERANKER_FAILED`.
* [ ] All returned candidates retain `rerankAdjusted === false`.
* [ ] Reranker-disabled searches are unchanged.

Run:

```bash
pnpm --filter @zokizuan/satori-core test -- voyageai-reranker
pnpm --filter @zokizuan/satori-core typecheck
pnpm --filter @zokizuan/satori-mcp test -- reranker
pnpm --filter @zokizuan/satori-mcp typecheck
```

Commit:

```bash
git commit -am "fix(reranker): bound VoyageAI latency and report failures"
```

---

## Task 3: Make inbound call-graph coverage honest

Implement this before improving extraction, so unresolved extraction remains observable.

**Files:**

* Modify: `packages/mcp/src/core/relationship-backed-call-graph.ts`
* Modify: `packages/mcp/src/core/handlers.call_graph.test.ts`
* Modify the response warning/evidence types used by call-graph responses.

**Produces:**

```ts
type InboundCoverageReason =
    | "no_relationships_extracted"
    | "suppressed_low_confidence"
    | "fallback_failed";

interface InboundCoverageEvidence {
    reason: InboundCoverageReason;
    retrievedRelationshipCount: number;
    suppressedRelationshipCount: number;
    fallbackAttempted: boolean;
    fallbackRecoveredCount: number;
    constructorResolutionAttempted: boolean;
}
```

### Reason selection

Use deterministic precedence:

```ts
if (suppressedRelationshipCount > 0 && fallbackRecoveredCount === 0) {
    reason = fallbackAttempted
        ? "fallback_failed"
        : "suppressed_low_confidence";
} else {
    reason = "no_relationships_extracted";
}
```

`no_relationships_extracted` must mean “no extracted relationship evidence,” not “the symbol definitely has no callers.”

Continue emitting:

```text
CALL_GRAPH_INBOUND_COVERAGE_PARTIAL
```

but attach the structured evidence.

### Tests

* [ ] Zero retrieved and zero suppressed relationships.
* [ ] Suppressed low-confidence relationships with fallback not attempted.
* [ ] Suppressed relationships with fallback attempted but no recovery.
* [ ] Fallback recovers an edge; no partial warning remains.
* [ ] Constructor target records `constructorResolutionAttempted: true`.
* [ ] Existing follow-up hints remain present.

Run:

```bash
pnpm --filter @zokizuan/satori-mcp test -- handlers.call_graph
pnpm --filter @zokizuan/satori-mcp typecheck
```

Commit:

```bash
git commit -am "fix(call-graph): expose inbound coverage reasons"
```

---

## Task 4: Resolve cross-module Python constructor callers

**Files:**

* Modify: `packages/core/src/relationships/builder.ts`
* Modify: `packages/core/src/navigation/query.ts`
* Modify or create focused builder/navigation tests.
* Modify MCP call-graph integration tests only after Core tests pass.

### Resolution rules

When direct `resolvePythonClassReference()` fails:

1. Read the caller module's import bindings.
2. Resolve direct imports:

```python
from package.rules import TradingEntryVetoes
TradingEntryVetoes(...)
```

3. Resolve aliases:

```python
from package.rules import TradingEntryVetoes as Vetoes
Vetoes(...)
```

4. Resolve qualified module aliases:

```python
import package.rules as rules
rules.TradingEntryVetoes(...)
```

5. Resolve only when the import graph produces one canonical class target.
6. Fail closed when multiple targets are possible.
7. Do not fall back to matching class names globally.
8. Preserve current confidence scoring unless stronger evidence justifies an existing higher confidence category.

Proposed interface:

```ts
interface PythonConstructorResolution {
    targetSymbolId: string | null;
    attempted: boolean;
    evidence:
        | "same_module"
        | "direct_import"
        | "import_alias"
        | "qualified_module"
        | "ambiguous"
        | "unresolved";
}
```

### Tests

* [ ] Same-module constructor remains unchanged.

**Known limitation (release receipt, 2026-08-04):** same-module bare Python
constructor calls deliberately produce no CALLS edge to the class
(`buildCallRelationshipsForRegistry leaves same-module constructor calls
unchanged` asserts `[]`). This is fail-closed by design, not a regression:
only import-binding-proven cross-module constructor calls emit edges. Retain
as a documented limitation unless a future task resolves unambiguous
same-module class constructors with the same proof discipline.

Product consequence of the same-module gap (release receipt): a class with one
cross-module caller and one same-module caller returns a nonempty edge list
without a partial-coverage warning, because the partial-coverage evidence is
attached only when the inbound edge set is empty. Python constructor coverage
must therefore never be described as complete; the documented limitation above
is the disclosure.
* [ ] Direct cross-module import creates the inbound constructor edge.
* [ ] Imported alias creates the edge.
* [ ] Qualified module alias creates the edge.
* [ ] Ambiguous imports create no edge.
* [ ] Unresolved class creates no fabricated relationship.
* [ ] A class with a directly resolved method call and cross-module constructor calls reports both kinds of callers.
* [ ] `TradingEntryVetoes` is represented only as a fixture shape, not hard-coded production behavior.

Run:

```bash
pnpm --filter @zokizuan/satori-core test -- relationships
pnpm --filter @zokizuan/satori-core test -- navigation
pnpm --filter @zokizuan/satori-core typecheck

pnpm --filter @zokizuan/satori-mcp test -- handlers.call_graph
```

Commit:

```bash
git commit -am "fix(python): resolve cross-module constructor callers"
```

---

## Task 5: Include untracked files in freshness and `live_path`

**Files:**

* Modify: `packages/mcp/src/core/working-tree-state.ts`
* Modify: `packages/mcp/src/core/handlers.ts`
* Modify focused freshness and live-path tests.

### Git command

Use:

```bash
git status --porcelain=v1 -z --untracked-files=all
```

The parser must recognize:

```text
tracked modifications
tracked deletions
renames
untracked paths marked ??
paths containing spaces
```

### Behavior

* An untracked source file inside index scope invalidates freshness.
* It enters exact source comparison as a path with no checkpoint record.
* It is eligible for the `live_path` retrieval lane.
* An untracked file excluded by `.satoriignore` remains invisible and does not trigger sync churn.
* Git's normal ignored files remain ignored.
* Do not add a HEAD-SHA freshness dependency.

### Tests

* [ ] Brand-new untracked source file triggers freshness work.

**Coverage layering (release receipt, 2026-08-04):** the handler-level test
`handleSearchCode routes untracked files through live paths and dirty overlay
but never ignored ones` proves changed-set → live_path/dirty_overlay routing
with the changed set supplied via the `getChangedFilesForCodebase` seam; the
real git-status boundary (untracked paths entering that set) is proven by the
real-Git tests in `working-tree-state.test.ts`. The two layers together cover
the plan bullets; neither alone is a full end-to-end reproduction.
* [ ] The untracked file appears in `live_path`.
* [ ] After indexing or committing, normal freshness resumes.
* [ ] Untracked `.satoriignore` path does not trigger freshness.
* [ ] Untracked path containing spaces is parsed correctly.
* [ ] Clean repositories take the same path as before.

Run:

```bash
pnpm --filter @zokizuan/satori-mcp test -- working-tree-state
pnpm --filter @zokizuan/satori-mcp test -- freshness
pnpm --filter @zokizuan/satori-mcp typecheck
```

Commit:

```bash
git commit -am "fix(freshness): include untracked files in live search"
```

---

## Task 6: Report marker finalization without weakening readiness

**REMOVED 2026-08-04 during implementation review.** The response builder cannot
prove that the exact indexed payload count equals the expected chunk count while
only the completion marker is missing; `progressPct === 100` alone is not exact
proof, and the `finalizing` reason was not part of `NonOkReason`. Per the review
disposition, the feature was reverted to the honest `reason: "indexing"` state.
Revisit only with an exact count proof (e.g. `countIndexedPayloadExactly`
plumbed through the readiness layer) and a versioned `NonOkReason` extension.

This is an optional UX task and should not return results before marker proof.

**Files:**

* Modify: `packages/mcp/src/core/tool-response-builders.ts`
* Modify: `packages/mcp/src/core/search-frontdoor.ts`
* Modify readiness tests.

Use the compatible response form:

```ts
{
    status: "not_ready",
    reason: "finalizing",
    retryAfterMs: 1_000,
    hints: {
        debugIndexing: {
            completionProof: "marker_doc",
        },
    },
}
```

Do not introduce a new top-level `status: "finalizing"` unless the MCP response schema is explicitly versioned.

### State rules

```text
Payload count differs from expected:
    status=not_ready
    reason=indexing

Payload count exactly matches expected, marker missing:
    status=not_ready
    reason=finalizing
    retryAfterMs=1000

Marker durable and valid:
    ready
```

### Tests

* [ ] Count incomplete → `indexing`.
* [ ] Count exact and marker missing → `finalizing`.
* [ ] Marker present → ready.
* [ ] No result data leaks in either not-ready state.

Commit:

```bash
git commit -am "feat(search): expose finalizing readiness state"
```

---

## Task 7: Document the supported full-source path

**Files:**

* Modify the `read_file` tool description.
* Modify the `open_symbol` and `symbol_context` descriptions in the files that declare those tools.
* Modify description/schema snapshot tests.

Document:

```text
open_symbol / symbol_context:
    bounded symbol source and continuation-aware excerpts

read_file with explicit ranges:
    exact requested source range

read_file with presentation:"full":
    raw multiline source, subject to the read_file byte/range limits
```

Do not add `sourceMode:"full"` to `symbol_context` in this pass. The existing `read_file` path already solves the capability gap.

Commit:

```bash
git commit -am "docs(search): document full-source retrieval"
```

---

## Task 8: Expose continuation availability when no handle can be stored

**Files:**

* Modify: `packages/mcp/src/core/search-result-finalization.ts`
* Modify: `packages/mcp/src/core/handlers.ts`
* Modify continuation-response schemas and tests.

Add:

```ts
interface SearchPaginationEvidence {
    totalGroupCount: number;
    returnedGroupCount: number;
    continuation:
        | "complete"
        | "attached"
        | "not_admissible";
}
```

Rules:

```text
remainingGroupCount === 0:
    continuation=complete

handle successfully stored:
    continuation=attached

remaining groups exist but replay cache rejects set:
    continuation=not_admissible
    preserve SEARCH_RESULT_SET_NOT_CACHE_ADMISSIBLE
    do not expose a fake handle
```

Do not increase replay-byte limits in the same commit. First collect evidence showing how often ranked sets are rejected.

### Tests

* [ ] Complete result set.
* [ ] Admissible continuation handle.
* [ ] Forty-four-group fixture rejected by replay budget.
* [ ] Rejected fixture reports total and returned counts.
* [ ] No continuation token is present when status is `not_admissible`.

Commit:

```bash
git commit -am "feat(search): report continuation availability"
```

---

# Cross-task regression gate

After Tasks 1–5:

```bash
pnpm --filter @zokizuan/satori-core typecheck
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-core build

pnpm --filter @zokizuan/satori-mcp typecheck
pnpm --filter @zokizuan/satori-mcp test
pnpm --filter @zokizuan/satori-mcp build

pnpm run versions:check
git diff --check
```

Run the frozen candidate replay/evaluation commands available in the repository and compare against the pre-change baseline.

Required invariants:

```text
Queries without must: retain prior candidate order.
Reranker-disabled searches retain prior candidate order.
Failed reranking never marks candidates as adjusted.
Ignored untracked files remain excluded.
Call-graph ambiguity never creates fabricated edges.
Search remains blocked until marker proof is durable.
Continuation rejection never fabricates a handle.
```

# Release boundary

These changes affect both Core and MCP. Do not manually choose package versions until implementation and testing are complete.

Use the repository's release bump/check workflow to produce the exact graph:

```bash
pnpm run release:bump
pnpm run versions:check
pnpm run release:check
```

If Core `3.6.0`, MCP `6.8.1`, and CLI `1.9.2` have all been published before this work begins, the likely patch graph is:

```text
Core 3.6.1
MCP  6.8.2
CLI  1.9.3
```

The release scripts and npm registry state remain authoritative.

# Recommended execution order

1. Task 1 — `must:` retrieval integrity
2. Task 2 — reranker timeout and retry
3. Task 3 — call-graph coverage evidence
4. Task 4 — cross-module constructor resolution
5. Task 5 — untracked freshness
6. Full correctness regression gate
7. Tasks 6–8 as a separate UX/observability batch
8. Release bump and packed-release qualification

Recommended execution mode: **subagent-driven development**, one task per agent with a code-review gate after each commit.
