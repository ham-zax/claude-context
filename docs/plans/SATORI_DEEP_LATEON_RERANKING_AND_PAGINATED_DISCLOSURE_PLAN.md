# Satori Deep LateOn Reranking and Paginated Disclosure Plan

**Status:** proposed; documentation only. This plan does not authorize runtime
changes, model downloads, index mutation, held-out evaluation, or production
activation.

**Date:** 2026-08-02

## 1. Outcome

Improve offline semantic-search ordering by letting LateOn evaluate a deeper,
owner-diverse candidate pool while letting an agent inspect every result in the
frozen ranked set through bounded pages.

The intended pipeline is:

```text
Potion dense retrieval + BM25 lexical retrieval
    -> bounded first-stage arms/passes at depth 80
    -> deduplicated frozen candidate union
    -> eligibility and authoritative evidence
    -> owner-family deduplication
    -> compact reranker projections
    -> qualified LateOn depth: 16, 32, or 50
    -> deterministic grouping and final order
    -> 10 full results initially
    -> optional compact title/path index
    -> continuation until the frozen set is exhausted
```

This plan separates four limits that the current capability contract partially
conflates:

| Limit | Meaning | Planned behavior |
| --- | --- | --- |
| Retrieval depth | Candidates requested from each first-stage arm/pass | Keep the existing maximum depth of 80 |
| Reranker depth | Eligible owner-diverse candidates scored by LateOn | Qualify 16, 32, and 50; select from evidence |
| Logical result-set request | How much of the frozen ranking the caller may eventually inspect | No performance-profile ceiling below the available frozen set |
| Disclosure page size | Full results returned in one response | Keep bounded; default to 10 and continue from the same frozen set |

“No limit on how much the agent can request” does not mean an unbounded response
or unbounded retrieval work. A caller may request the complete available frozen
set and page through it until exhaustion. Multiple bounded arms and semantic
passes may produce a deduplicated union larger than one arm's depth of 80.
Per-page response-byte, cache-byte, safe-integer, and expiry bounds remain
mandatory.

## 2. Current qualified baseline

The current implementation has these independent facts:

```text
SEARCH_MAX_CANDIDATES             80 per first-stage request
SEARCH_RERANK_TOP_K               50
SEARCH_DEFAULT_DISCLOSURE_LIMIT   10
LateOn candidateDepth             16
slow-profile maximum request      15
```

The generic reranker path can construct a pool of up to 50 candidates, but the
qualified LateOn provider reports a maximum of 16 documents. The offline Potion
profile is also classified as slow, which currently prevents an agent from
requesting more than 15 results even though first-stage retrieval may already
have produced a larger frozen pool.

The completed cross-repository experiment remains the baseline authority:

```text
docs/plans/SATORI_CROSS_REPOSITORY_RANKING_ABLATION_PLAN.md
docs/evidence/lateon-runtime-profile-20260730/LATEON_RUNTIME_PROFILE_RECEIPT.md
```

At D-L16 it measured a macro-MRR increase from `0.360185185185` to
`0.401111111111` and owner-at-three from `0.372222222222` to
`0.494444444444`, with zero hard-negative exposure at three. Those are tuning
results, not permission to assume that D-L32 or D-L50 is better.

## 3. Non-negotiable invariants

Every contender and implementation must preserve:

1. Candidate membership and eligibility are owned before neural reranking.
2. LateOn can reorder only admitted candidates; it cannot restore an owner that
   is absent from the frozen retrieval union.
3. Exact identifiers, `must:` controls, configuration ownership, source
   freshness, publication authority, scope filtering, and no-answer behavior
   remain deterministic and fail closed.
4. Candidate-family identity uses canonical owner evidence when available and
   never guesses ownership from a display label.
5. A LateOn timeout, crash, unavailable model, invalid response, or incomplete
   order restores the complete deterministic baseline byte-for-byte.
6. Continuation performs no new embedding, retrieval, eligibility decision,
   grouping, or reranking.
7. Pagination exposes one immutable ranked set. It cannot mix pages from
   different publications, source observations, policy identities, or model
   executions.
8. Model weights remain in one verified shared directory outside versioned MCP
   runtime closures. This work must not recreate per-version model duplication.
9. No source code or model inputs enter telemetry.
10. No query-specific exceptions, repository-specific weights, or new blanket
    path constants are permitted.

## 4. Public result and pagination contract

### 4.1 Decouple request size from performance profile

The public search contract must stop using `performanceProfile` to reject a
logical request merely because it exceeds 10, 15, 20, 30, or 50 results.

Freeze a compatibility-preserving contract with these semantics:

```text
limit
    positive safe integer expressing the caller's desired total result set
    normalized to the number of results actually available from the frozen
    retrieval/grouping pipeline

disclosureLimit
    bounded number of full groups returned in the initial response
    defaults to 10

continue_search.limit
    bounded page size, not a total-result ceiling

continuation
    remains available until every group in the frozen set has been disclosed
```

The response must report the requested, effective, available, returned, and
remaining counts. A request larger than the available frozen set is satisfied
by exhausting that set rather than rejected by the embedding performance tier.

The first implementation may keep each first-stage request at depth 80. It must
report arm, pass, union, eligible, grouped, and disclosed counts separately
instead of implying either an 80-result total ceiling or repository-wide recall.

### 4.2 Compact result index

Evaluate an optional compact index generated from the final frozen order. Each
entry may contain only:

```text
rank
canonical candidate identity
display label
repository-relative path
symbol or file kind
one bounded reason/evidence label
```

It must not contain source excerpts, model scores, internal filesystem paths,
or a separately computed order. Its byte budget and truncation state must be
explicit. The index is navigation assistance; normal full results and
`read_file` remain the evidence surface.

The product comparison must measure whether the compact index helps agents
select continuations or targeted reads. Do not ship it merely because it is
small.

## 5. Owner-diverse reranker input

Retain the existing owner-family pool as the single authority for reranker
admission:

1. Admit one representative per canonical owner family before siblings.
2. Admit bounded supplemental chunks in fair rounds across owners.
3. Retain exact chunk identity when canonical owner evidence is unavailable.
4. Record every candidate admitted, omitted, or truncated and the responsible
   reason.
5. Keep the selected candidate order deterministic before neural scoring.

The qualification receipt must report:

```text
eligible candidate count
unique owner-family count
representative count
supplemental count
provider-depth omissions
projection-byte omissions
reranked count
```

## 6. Compact projection qualification

Do not change projection and depth in the same uncontrolled comparison.

First compare the existing `search_rerank_document_v1` projection with one
prospective compact owner projection at D-L16. Freeze the compact projection
before opening D-L32 or D-L50 results.

The prospective projection should contain, when authoritative evidence exists:

```text
repository-relative path
language and symbol kind
canonical symbol label
signature or declaration
bounded docstring/documentation summary
query-relevant bounded source excerpt
bounded owner siblings only when required
```

File-level Markdown and configuration candidates need an explicit projection
using their path, heading/declaration evidence, and bounded relevant text; they
must not be forced through a symbol-only format.

The projection owner must guarantee:

* deterministic UTF-8 bytes for the same publication, query, and candidate;
* a versioned projection identity and digest;
* explicit per-document and aggregate byte observations;
* no split UTF-8 sequences or partially serialized fields;
* no mutable working-tree evidence without a valid prepared-source barrier;
* no silent loss of the declaration merely to retain a lower-value excerpt.

If the compact projection changes D-L16 ordering or scores, record that as a
projection experiment. Do not attribute the change to candidate depth.

## 7. LateOn depth qualification

### L0 — freeze authority

Before viewing new contender output, freeze:

* tuning task and negative-control identities;
* candidate captures and publication bindings;
* model, tokenizer, ONNX artifact, and loader digests;
* query formatting and compact projection identity;
* owner-family admission policy;
* D-L16, D-L32, and D-L50 executable policy artifacts;
* process isolation, thread count, warmup, and measurement order;
* exact quality, safety, practical-effect, and uncertainty rules.

Held-out tasks remain sealed during L0 through L4.

### L1 — reproduce D-L16

Run the current qualified depth through the new projection/runtime harness.
Require identical candidate membership and eligibility. If the projection is
unchanged, require identical scores and order. If the compact projection was
selected, require its preregistered non-inferiority gates and retain both
orders in the receipt.

Stop if D-L16 cannot be reproduced; deeper results would lack authority.

### L2 — measure D-L32 and D-L50

Run 16, 32, and 50 against identical frozen candidates in isolated processes.
Counterbalance execution order so later depths cannot inherit model caches or
allocator state.

Measure separately:

```text
repository-macro MRR
owner-at-one, owner-at-three, and owner-at-ten
per-task rank transitions
hard-negative exposure
exact-identifier invariants
no-answer correctness
candidate and eligibility identity
cold model-load latency
warm score p50, p95, and maximum
peak and retained total-process RSS
worker startup, timeout, and fallback behavior
projected bytes and tokens per candidate and request
```

Resource thresholds must be derived from the actual target deployment profile,
not copied from the obsolete assumed 512 MiB contract. L0 must freeze the
decision procedure before results are opened. A small latency miss is not an
automatic rejection: quality, latency, memory, and failure containment must be
reported as a Pareto comparison with the preregistered practical-effect rule.

### L3 — select at most one depth

Selection is mechanical:

```text
Any safety, identity, or fallback regression
    -> reject that depth

Deeper depth has no preregistered material quality benefit
    -> retain the shallower passing depth

Deeper depth has a material safe quality benefit and an acceptable measured
deployment profile
    -> select it

No depth improves safely
    -> retain deterministic baseline or the already-qualified D-L16 option
```

Do not select D-L50 merely because it is the largest. Do not reduce first-stage
retrieval or disclosure safety to compensate for model cost.

### L4 — production implementation

Only after L3 selects a depth:

1. Publish a new versioned LateOn runtime profile containing the selected depth
   and measured defaults.
2. Make the provider report the selected profile depth instead of an unrelated
   code constant.
3. Keep explicit operator overrides within the qualified contract.
4. Preserve worker isolation and all-or-nothing fallback.
5. Keep deterministic grouping, disclosure, and continuation downstream of the
   complete reranked order.
6. Add diagnostics that distinguish retrieval pool, eligible pool, reranker
   pool, reranked count, disclosed count, and remaining continuation count.

### L5 — held-out adjudication

Open held-out evidence once, only after the implementation reproduces its
tuning receipt. A held-out failure retains the previous product policy. Do not
tune depth, projection, weights, or thresholds after opening held-out results.

## 8. Implementation ownership

Use the existing owners rather than adding policy to `Context`:

| Responsibility | Owner |
| --- | --- |
| Retrieval and logical/disclosure limits | `packages/mcp/src/core/search-policy.ts` |
| Capability advertisement | `packages/mcp/src/core/capabilities.ts` |
| Public search and continuation validation | `packages/mcp/src/tools/search_codebase.ts`, `continue_search.ts` |
| Frozen result-set lifecycle | `packages/mcp/src/core/search-result-set-cache.ts` |
| Owner-family reranker admission | `packages/mcp/src/core/search-rerank-policy.ts` |
| Reranker execution and deterministic fallback | `packages/mcp/src/core/search-execution.ts` |
| Reranker document projection | the existing search query-support/projection owner |
| LateOn model/runtime contract | `packages/mcp/src/server/lateon-reranker*.ts` and the versioned profile asset |
| Grouping and disclosure | existing search grouping/finalization owners |

`Context` remains the composition root and compatibility façade. This work must
not move search policy, model lifecycle, continuation state, or disclosure
state back into it.

## 9. Verification matrix

At minimum, cover:

* default offline Potion searches requesting 1, 10, 15, 16, 32, 50, 80, and a
  value larger than the available frozen set;
* complete pagination with no duplicate, missing, reordered, or recomputed
  groups;
* handle expiry, eviction, owner shutdown, retry, and wrong-offset behavior;
* a compact index whose identities and order exactly match final grouping;
* D-L16, D-L32, and D-L50 with zero, partial, and complete candidate pools;
* exact and `must:` queries that skip or preserve reranking as required;
* multiple chunks from one owner and many distinct owners;
* file-level Markdown, configuration, tests, scripts, and source symbols;
* model missing, digest mismatch, timeout, crash, malformed output, incomplete
  output, and out-of-order identities;
* aggregate projection-byte exhaustion;
* unchanged candidate membership and eligibility across every depth;
* deterministic baseline restoration after every failure.

## 10. Completion receipt

The final receipt must include:

```text
source revision and tree digest
benchmark seal and split authority
publication and candidate-capture identities
model/tokenizer/ONNX/loader/profile identities
projection identity
depth-policy artifact hashes
complete quality and rank-transition results
complete latency and memory observations
negative and exact-control results
pagination and compact-index invariants
fallback evidence
selected depth or explicit retain-baseline decision
held-out opening record, if L5 was authorized
```

The plan is complete only when one of these terminal outcomes is recorded:

```text
lateon_depth_16_retained
lateon_depth_32_qualified
lateon_depth_50_qualified
deterministic_baseline_retained
blocked_by_projection_authority
blocked_by_candidate_replay
rejected_for_safety_regression
rejected_for_deployment_profile
```
