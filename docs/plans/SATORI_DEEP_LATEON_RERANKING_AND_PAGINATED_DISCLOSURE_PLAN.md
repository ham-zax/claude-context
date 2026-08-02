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
    -> selected LateOn candidate depth: 16, 32, or 50
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

Execution is split into three independent tracks:

```text
Track P  frozen result-set pagination
Track L  LateOn projection and depth qualification
Track I  optional compact result index
```

Track P may qualify even if every LateOn contender is rejected. Track I may be
rejected or deferred without blocking Track P or Track L. Each track requires
its own authority, receipt, and terminal outcome.

“No limit on how much the agent can request” does not mean an unbounded response
or unbounded retrieval work. A caller may request the complete available frozen
set and page through it until exhaustion. Multiple bounded arms and semantic
passes may produce a deduplicated union larger than one arm's depth of 80.
Per-page response-byte, cache-byte, safe-integer, and expiry bounds remain
mandatory.

## 2. Current evidence authority

The current implementation has these independent facts:

```text
SEARCH_MAX_CANDIDATES             80 per first-stage request
SEARCH_RERANK_TOP_K               50
SEARCH_DEFAULT_DISCLOSURE_LIMIT   10
LateOn candidateDepth             16
slow-profile maximum request      15
```

The generic reranker path can construct a pool of up to 50 candidates, but the
runtime-qualified LateOn provider reports a maximum of 16 documents. The
offline Potion profile is also classified as slow, which currently prevents an
agent from requesting more than 15 results even though first-stage retrieval
may already have produced a larger frozen pool.

The completed cross-repository experiment remains the baseline authority:

```text
docs/plans/SATORI_CROSS_REPOSITORY_RANKING_ABLATION_PLAN.md
docs/evidence/lateon-runtime-profile-20260730/LATEON_RUNTIME_PROFILE_RECEIPT.md
```

The evidence must be interpreted narrowly:

| Arm | Previously observed quality | Authority |
| --- | --- | --- |
| `B` | Macro MRR `0.3602`, owner-at-three `0.3722` | Default qualified product ranking policy |
| `D-L16` projection v1 | Macro MRR `0.4011`, owner-at-three `0.4944` | Directional tuning quality; failed the frozen owner-at-three interval gate |
| `D-L32` projection v1 | Macro MRR `0.4174`, owner-at-three `0.4944`; MRR `+0.0163` over D-L16 | Previously observed diagnostic winner; failed the same frozen quality gate |
| Optimized D-L16 runtime | Reproduced the prior D-L16 scores and order | Runtime-qualified for optional isolated implementation, not quality-qualified as default policy |

The frozen R3 decision remains authoritative: neither D-L16 nor D-L32 passed
every quality gate, and `B` remains the default qualified ranking policy. The
later runtime receipt replaced the assumed resource envelope; it did not
replace the R3 quality decision.

The original D-L16/D-L32 resource failures are also already observed. The
optimized runtime receipt remeasured D-L16 only. Optimized D-L32 and D-L50
resource profiles remain unopened work.

D-L16 and D-L32 projection-v1 outcomes are already known. A new rule applied to
those results must be labeled revised and post-hoc and cannot be described as
preregistered evidence. Only unopened D-L50 projection-v1 results and
prospectively frozen projection-v2 arms can receive new preregistered quality
authority.

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

## 4. Track P — frozen result-set pagination

Track P is deterministic product work and does not depend on LateOn admission.

### P0 — freeze the five independent values

Before implementation, derive and freeze:

```text
requestedTotal
    caller's positive safe-integer request; not capped by performance profile

effectiveFrozenTotal
    groups actually retained in the immutable result set after applying the
    pipeline-derived MAX_FROZEN_RESULTS bound

retrievalDepth
    per first-stage arm/pass depth; initially 80

rerankerDepth
    provider-qualified neural input depth; independent of pagination

pageSize
    groups disclosed in one response after applying MAX_PAGE_SIZE and the
    response-byte budget
```

`MAX_FROZEN_RESULTS` must be derived from the bounded arm/pass union,
deduplication, grouping, result-set cache byte budget, and lifecycle—not from
`performanceProfile`. `MAX_PAGE_SIZE` must be derived from the grouped response
byte contract. P0 must record the exact numeric values, formulae, and policy
identity before P1 changes validation or observes new pagination results.
P1 and P2 remain closed until that P0 receipt exists.

### P1 — decouple request size from performance profile

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
report arm, pass, union, eligible, grouped, frozen, disclosed, and remaining
counts separately instead of implying either an 80-result total ceiling or
repository-wide recall.

### P2 — qualify frozen continuation

Qualify complete traversal independently with LateOn disabled. Require every
frozen group to appear exactly once, in final order, with no new retrieval,
eligibility, grouping, or ranking work. Expiry, eviction, server-owner shutdown,
wrong offsets, retries, and response-byte truncation must fail explicitly and
must never create a replacement ranking under the old handle.

Track P terminal outcomes are:

```text
pagination_complete_frozen_set_qualified
pagination_bound_derivation_blocked
pagination_identity_or_order_rejected
```

## 5. Track I — optional compact result index

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

Track I is independently terminal:

```text
compact_result_index_qualified
compact_result_index_rejected
compact_result_index_deferred
```

## 6. Track L — owner-diverse LateOn input

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

## 7. Compact projection qualification

Do not change projection and depth in the same uncontrolled comparison.

Reuse the immutable projection-v1 D-L16 and D-L32 scores when their model,
query, candidate identities, and projection digest are unchanged. Do not spend
new scoring work to rediscover known quality results.

Define one prospective projection v2, then freeze its D-L16, D-L32, and D-L50
arms before viewing any projection-v2 output. Those are new factorial arms and
may receive preregistered authority. Projection-v1 D-L50 is also unopened and
may be preregistered. Do not tune projection v2 after viewing its D-L16 result.

The prospective projection should contain, when authoritative evidence exists:

```text
repository-relative path
language and symbol kind
canonical symbol label
signature or declaration
bounded verbatim docstring or documentation excerpt
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

“Query-relevant” must be mechanical. Reuse the versioned
`selectBoundedSource` policy with normalized query tokens, authoritative symbol
spans, validated evidence spans, deterministic byte/line windows, and its
existing stable tie order. Do not add an LLM-generated summary, an undisclosed
heuristic, or a model-selected source window. Any selector change requires a
new selection-policy identity and its own isolated comparison.

If the compact projection changes D-L16 ordering or scores, record that as a
projection experiment. Do not attribute the change to candidate depth.

## 8. Track L — LateOn depth qualification

### L0 — freeze authority

Before viewing new contender output, freeze:

* tuning task and negative-control identities;
* candidate captures and publication bindings;
* model, tokenizer, ONNX artifact, and loader digests;
* query formatting and compact projection identity;
* owner-family admission policy;
* hashes of the already-observed projection-v1 D-L16/D-L32 artifacts and their
  original frozen quality decision;
* unopened projection-v1 D-L50 and projection-v2 D-L16/D-L32/D-L50 executable
  policy artifacts;
* process isolation, thread count, warmup, and measurement order;
* exact quality, safety, practical-effect, and uncertainty rules.

Any revised selection rule applied to the already-observed projection-v1
D-L16/D-L32 results must be declared post-hoc and reported separately. It cannot
retroactively qualify either arm or replace `B`.

Held-out tasks remain sealed during L0 through L4.

### L1 — validate and replay known authority

Validate the immutable D-L16/D-L32 artifact hashes, model identity, candidate
captures, and projection-v1 identity. Replay their existing scores without new
model scoring and require identical candidate membership, eligibility, scores,
and order.

Stop if either known arm cannot be reproduced; new depth comparisons would lack
a trustworthy control.

### L2 — measure new quality arms and optimized resources

For projection v1, score only the unopened D-L50 quality arm. Reuse the known
D-L16/D-L32 scores. If projection v2 was admitted, score its preregistered
D-L16/D-L32/D-L50 factorial arms.

Rerun resource measurements for depths 16, 32, and 50 under the optimized
runtime in isolated processes. Counterbalance execution order so later depths
cannot inherit model caches or allocator state.

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

### L3 — select at most one disabled neural candidate

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
    -> retain deterministic baseline B; D-L16 remains runtime-qualified but
       quality-directional and optional
```

Do not select D-L50 merely because it is the largest. Do not reduce first-stage
retrieval or disclosure safety to compensate for model cost.

Projection-v1 D-L16/D-L32 retain their original failed quality verdict. A new
candidate may advance only from an unopened preregistered arm. Selection at L3
creates a disabled candidate implementation; `B` remains the default policy.

### L4 — extend the existing provider as a disabled candidate

Isolated D-L16 provider support already exists. Only after L3 selects a new
candidate:

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
7. Keep the candidate disabled by default and require an explicit experimental
   selection until held-out adjudication passes.
8. Freeze maximum simultaneous reranks, bounded queue length, admission
   behavior, cancellation semantics, shutdown behavior, and worker-termination
   deadlines in the versioned runtime profile.
9. When the queue is full, a request is cancelled, or its deadline expires
   while queued, discard all neural work for that request and restore its
   deterministic baseline without a partial order.

The concurrency receipt must prove active and queued counts remain bounded,
deadlines include queue wait, shutdown rejects and drains every queued/pending
request, and no worker or promise remains live after cancellation or closure.

### L5 — held-out adjudication

Open held-out evidence once, only after the implementation reproduces its
tuning receipt. A held-out failure retains the previous product policy. Do not
tune depth, projection, weights, or thresholds after opening held-out results.

### L6 — default-policy decision

Default activation may be considered only after L5 passes every frozen quality,
safety, identity, resource, and fallback gate. Otherwise `B` remains default.
An L5 pass is necessary but does not authorize release or activation by itself;
record that decision in a separate production-policy receipt.

## 9. Implementation ownership

Use the existing owners rather than adding policy to `Context`:

| Responsibility | Owner |
| --- | --- |
| Retrieval and logical/disclosure limits | `packages/mcp/src/core/search-policy.ts` |
| Capability advertisement | `packages/mcp/src/core/capabilities.ts` |
| Public search and continuation validation | `packages/mcp/src/tools/search_codebase.ts`, `continue_search.ts` |
| Frozen result-set lifecycle | `packages/mcp/src/core/search-result-set-cache.ts` |
| Owner-family reranker admission | `packages/mcp/src/core/search-rerank-policy.ts` |
| Reranker execution and deterministic fallback | `packages/mcp/src/core/search-execution.ts` |
| Reranker document serialization | `packages/mcp/src/core/search-rerank-document.ts` |
| Mechanical bounded source selection | `packages/mcp/src/core/bounded-source-selector.ts` |
| LateOn model/runtime contract | `packages/mcp/src/server/lateon-reranker*.ts` and the versioned profile asset |
| LateOn concurrency and backpressure | `packages/mcp/src/server/lateon-reranker.ts` |
| Grouping and disclosure | existing search grouping/finalization owners |

`Context` remains the composition root and compatibility façade. This work must
not move search policy, model lifecycle, continuation state, or disclosure
state back into it.

## 10. Verification matrix

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
* simultaneous requests at, below, and above the frozen active/queue bounds;
* cancellation before admission, while queued, and during worker execution;
* shutdown with queued and active work and proof that the worker is terminated;
* aggregate projection-byte exhaustion;
* unchanged candidate membership and eligibility across every depth;
* deterministic baseline restoration after every failure.

## 11. Independent completion receipts

Tracks P, L, and I each produce a separate receipt. A combined summary may link
them but must not turn one track's rejection into another track's failure.

Each applicable receipt must include:

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

Track P records one of:

```text
pagination_complete_frozen_set_qualified
pagination_bound_derivation_blocked
pagination_identity_or_order_rejected
```

Track I records one of:

```text
compact_result_index_qualified
compact_result_index_rejected
compact_result_index_deferred
```

Track L records one of:

```text
baseline_b_retained
lateon_depth_32_disabled_candidate
lateon_depth_50_disabled_candidate
lateon_projection_v2_disabled_candidate
lateon_default_policy_qualified_after_held_out
blocked_by_projection_authority
blocked_by_candidate_replay
rejected_for_safety_regression
rejected_for_deployment_profile
```

The plan is complete when every authorized track has its own terminal receipt.
Track P completion does not require Track L or Track I authorization or success.
