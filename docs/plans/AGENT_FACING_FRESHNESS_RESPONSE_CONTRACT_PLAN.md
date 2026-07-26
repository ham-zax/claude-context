# Agent-Facing Freshness Response Contract Plan

**Status:** amended after technical review; F0 is the next evidence batch;
no product implementation is authorized
**Date:** 2026-07-26
**Review base revision:** `5634f5e13c278c917c4667c17e465298b6ffdd2a`
**Base verification:** matched local `master` and `origin/master` when this
amendment was prepared
**Primary owner:** `packages/mcp`
**Existing comparison/publication owner:** `packages/core`
**Related plan:** `MCP_WATCHER_OBSERVATION_AND_SYNC_DECOUPLING_PLAN.md`
**Independent companion:** `PERSISTED_SYMBOL_ANALYSIS_METADATA_PLAN.md`
**External reference:**
<https://github.com/DeusData/codebase-memory-mcp/tree/97ce23f9827177fff3858831156e9795c6832b18>

## 1. Goal and public contract

Keep Satori's internal freshness proof rich while making ordinary agent
responses quiet and decisive.

The target contract is:

> Results are backed by a publication verified against the source at the
> request's final freshness barrier, or the request returns exactly one
> actionable blocker.

This is a bounded request-time guarantee. A source event after the final
validated barrier belongs to the next request; Satori does not claim perpetual
real-time truth.

Normal successful responses must not expose:

- freshness decision modes;
- watcher epochs or coverage state;
- recency thresholds, ages, or last-sync timestamps;
- checkpoint or publication internals;
- mutation leases, receipts, fallbacks, or timings.

Do not replace those fields with a routine `sourceState: "current"` field.
Internal evidence remains available to debug/status, logs, validation, and
durable qualification receipts.

## 2. Independent contracts

Do not combine:

```text
source freshness
    The response publication is compatible with the source at the request's
    final freshness barrier.

relationship coverage
    The graph provider is qualified for the requested language and pattern.

semantic relevance
    Retrieved candidates are meaningful enough for the query.
```

A response can be source-current while relationship coverage remains partial.
A source-current semantic query can still have weak relevance. Neither is a
freshness failure.

This program does not include persisted symbol analysis.

## 3. Current contract evidence

The source-read baseline at the review revision is:

- `FreshnessDecision` contains internal comparison, threshold, watcher,
  checkpoint, mutation, operation, and fallback evidence.
- `SearchResponseEnvelope` currently requires `freshnessDecision` and may
  expose `freshnessSummary`.
- normal grouped and raw search builders emit those fields;
- blocked builders may emit the complete internal decision;
- the compact first-party `search_codebase` wrapper consumes public freshness
  fields;
- `search_codebase` already enters the existing freshness owner;
- `continue_search` already binds to prepared publication and source
  observations and returns `SEARCH_RESULT_SET_STALE` after drift;
- `call_graph` and `file_outline` remain non-mutating and currently disclose
  pending or unavailable freshness through warnings.

The current search status vocabulary is:

```text
ok
requires_reindex
not_indexed
not_ready
```

The current executable action field is `recommendedNextAction`.

F0 must preserve the complete file/schema/consumer inventory in:

```text
docs/evidence/agent-facing-freshness-f0-<date>/
```

The plan records decisions; the receipt records raw source findings, response
samples, sizes, and compatibility evidence.

## 4. One internal request barrier

MCP owns one operation-local barrier concept equivalent to:

```text
RequestFreshnessBarrier
    canonical root
    watcher observation coverage state
    observation continuity evidence from the qualified watcher owner
    observed event epoch, only when coverage is valid
    prepared source observation/checkpoint digest
    observed active publication identity

RequestRetrievalContext
    immutable retrieval publication identity
    publication read lease
```

These are operation-local structures, not durable state, a new checkpoint, or
a publication identity.

Every retrieval handler whose successful response asserts request-time source
compatibility must use the same barrier owner. Such handlers must not
independently decide what “current” means. Status, debug inspection, and
maintenance receipts may report state without asserting that a retrieval
payload is current.

A request may return success only when:

```text
the publication used for retrieval
    is compatible with
the source observation represented by the final request barrier
```

Epoch equality is evidence only while watcher observation coverage is valid.
When watcher coverage is disabled, starting, failed, stopped, or interrupted,
Satori must use an established source comparison or other existing read-only
proof. If no accepted proof exists, the request blocks.

Matching initial/final coverage states and epochs are insufficient if watcher
continuity was lost between them. F0 must prove continuity through the existing
qualified watcher owner. The current candidate evidence is
`coverageGapSinceEpoch` plus its rule that only a successful comparison may
cover and clear the gap.

If that owner cannot prove one continuous valid interval or a successful
comparison after the gap, watcher epoch equality must be removed from the
accepted proof whitelist. Do not create durable watcher authority for this
program.

### 4.1 Closed source-proof whitelist

F0 must replace provisional language such as “other existing read-only proof”
with a closed whitelist of accepted proofs and owners.

The starting matrix to verify is:

| Situation | Search | Graph/outline |
| --- | --- | --- |
| Continuous watcher coverage for the relevant interval, no pending event/gap, valid matching checkpoint/source observation, compatible retrieval publication, no proof-changing reconciliation | Return | Return |
| Pending watcher event | Run or join the existing freshness flight | Block |
| Freshness flight active | Join and await through the existing owner | Block, or await only if F0 proves waiting does not make navigation a synchronization trigger |
| Ignore reconciliation pending | Join/await through the existing search owner | Block |
| Publication activation active while a compatible frozen read context exists | Follow retrieval-publication compatibility rule | Return only when the frozen entry/final proof remains valid; otherwise block |
| Watcher unavailable and an exact accepted read-only source proof succeeds | Return | Return |
| Watcher unavailable and no accepted proof exists | Block | Block |
| Comparison or synchronization fails | Block | Block |
| Publication is incompatible | Block | Block |
| Source changes once after successful search proof | Retry once | Follow the frozen non-mutating policy; never publish |
| Source changes again | Block | Block |

F0 may correct these rows when source evidence identifies the actual owner, but
its receipt must finish with a closed list. An implementation may not add a new
proof by analogy. F0 must decide tool-by-tool whether absence of an active sync
is a proof requirement or whether search may safely join it.

## 5. Tool behavior

### 5.1 `search_codebase`

```text
capture barrier
-> run or join the existing freshness flight
-> compare/publish through the existing owner when necessary
-> retrieve from the compatible publication
-> capture and validate the final barrier
-> project the response
```

If source observation changes after successful freshness proof and before
response projection:

1. create one new barrier;
2. discard the first payload, candidates, grouping, continuation state, and
   receipts;
3. release or close the first publication read context through its existing
   owner;
4. retry once through the normal existing freshness owner;
5. resolve the retrieval publication again and rerun retrieval completely;
6. if source observation changes again, return the dominant
   `source_changed_during_request` blocker.

Retry only for that exact post-proof source-observation drift.
Never combine state from the first and second attempts.

Do not retry:

- `requires_reindex`;
- comparison or synchronization failure;
- invalid publication;
- unavailable watcher observation without another accepted proof;
- blocked mutation authority;
- missing or unusable index.

Do not recurse or loop indefinitely.

If freshness cannot be proven, return no stale vector results.

The request must also keep its publication identity coherent:

```text
retrieval begins against publication P
-> another flight may activate publication Q
-> the request either finishes against a still-readable P that remains
   compatible with its final source barrier
-> or follows the normal bounded retry/blocker path
```

No response may combine results, navigation, receipts, or source observations
from different publication identities. The existing publication read lease may
retain P, but retention alone is not final source compatibility proof.

### 5.2 `continue_search`

Preserve the existing behavior:

- the continuation remains bound to its original publication and source
  observation;
- a later accepted event or publication change returns
  `SEARCH_RESULT_SET_STALE`;
- no old ranking is silently continued or rebuilt.

Removing freshness fields from the public base envelope must not remove the
private continuation authority.

### 5.3 `call_graph` and `file_outline`

Keep both tools non-mutating.

```text
pending event
    -> block with one sync action

watcher observation unavailable
    -> attempt an established non-mutating source proof
    -> return normally if that proof establishes compatibility
    -> otherwise block

source incompatibility or unverified state
    -> block with one actionable reason
```

Do not add a full repository scan to every graph or outline request unless F0
proves that an existing accepted and affordable read-only owner already
provides it.

Do not:

- trigger indexing or publication;
- return old graph/outline data with a warning;
- treat partial graph coverage as a freshness blocker.

The simplest final policy to qualify is:

```text
verified at entry and final barrier
    return the frozen navigation payload

event, proof-changing reconciliation, or incompatible activation during
traversal
    discard the payload
    block
    do not publish
```

F0 must freeze whether waiting for an already active freshness flight remains a
non-mutating read or creates unacceptable coupling. Graph/outline never initiate
the flight.

### 5.4 `manage_index`

`manage_index status` remains the agent-facing diagnostic surface for detailed
lifecycle and freshness evidence.

Existing create, sync, repair, reindex, and operation receipts retain their
authority. This program changes them only if F0 proves a shared public contract
must be synchronized.

### 5.5 Cancellation and timeout audit

Current source inspection has not established operation-level tool
cancellation propagation. The MCP call handler invokes tools without forwarding
a request `AbortSignal`, and a client-side timeout does not by itself prove
that shared server work was cancelled.

F0 must record:

- MCP transport cancellation behavior;
- session handler behavior;
- CLI timeout behavior;
- whether a waiting caller can leave while shared freshness work continues;
- whether any existing owner may cancel a flight joined by other callers.

No cancellation subsystem is authorized by this plan. If existing cancellation
is observed, the target projection must return no stale result and must not
claim freshness success after that caller is cancelled. It must not cancel work
owned by other joined callers unless the established shared-flight contract
already permits it.

If a caller disconnects and no response can be delivered, no public freshness
projection is required; shared work follows its existing ownership. A
client-side timeout must not be described as server-side cancellation unless
the transport and handler propagate it. If server-side cancellation exists, a
cancelled caller receives no successful freshness projection, and joined work
continues unless its existing owner permits cancellation.

If satisfying the freshness contract requires new end-to-end cancellation
propagation, F0 must return that as a separate scope/architecture decision
rather than adding it silently to F1–F3.

The absence of request-level cancellation is not itself an F0 blocker unless
freshness correctness depends on cancellation propagation.

## 6. Public projection and blocker vocabulary

### Normal success

```json
{
  "status": "ok",
  "results": []
}
```

Result membership, grouping, ordering, recommended actions, continuation
semantics, and disclosure remain unchanged.

### Normal blocker

Return:

- one existing compatible status;
- one precise reason;
- one concise message;
- one executable `recommendedNextAction`;
- no stale usable results;
- no internal failure chain.

F0 must freeze the exact mapping from actual schemas and consumers. Preferred
shape:

| Condition | Existing status direction |
| --- | --- |
| No usable index | `not_indexed` |
| Index or mutation operation active | `not_ready` |
| Rebuild required | `requires_reindex` |
| Transient comparison/sync failure | existing compatible status plus precise reason |
| Source changes twice during one request | existing compatible status plus `source_changed_during_request` |

Do not add `status: "blocked"` when an existing status expresses the state.
Do not rename `recommendedNextAction`.

The mapping must also state whether the action is a tool invocation or a retry
of the original request and whether any payload is present. Candidate recovery
directions to verify against the current action schema are:

| Condition | Action direction |
| --- | --- |
| No usable index | `manage_index create` |
| Rebuild required | `manage_index reindex` |
| Retryable source-state verification failure | `manage_index sync` |
| Source changes twice during one request | Retry the original operation after active editing settles |
| Existing operation owns progress | Inspect status or retry later through an existing supported action |

Do not recommend sync or reindex when retrying the original read is the actual
recovery. Use only actions representable by the established public action
schema.

### Dominant blocker order

F0 must derive deterministic precedence from actual combinations of reachable
states and the action most likely to make progress. The provisional order to
test is:

```text
requires reindex
missing/unusable index
active operation
source changed during request
comparison/synchronization failure
source state unverified
```

Only the blocker that can guide the next action belongs in the ordinary
response. Contributing details remain in debug/status. F0 must include fixtures
with multiple simultaneous internal conditions and prove that the selected
blocker preserves the valid recovery path; conceptual severity alone does not
set precedence.

For every freshness-related blocker:

```text
result payload absent
grouped rows absent
raw candidates absent
graph/outline payload absent
continuation absent
```

A diagnostic identifier may appear only when an existing contract explicitly
requires it and it cannot be used to continue stale results.

## 7. Debug and diagnostic projection

Debug/status may expose:

```text
freshnessDecision
request barrier
source observation
watcher coverage
checkpoint compatibility
publication identity
timings and fallback evidence
```

Debug output may add evidence but cannot make a blocked stale result usable.

One authoritative freshness-to-public-policy mapper must own:

- status and reason selection;
- dominant blocker precedence;
- freshness-field visibility;
- recommended action;
- stale-payload prohibition.

It may feed separate existing builders for grouped search, raw search, compact
MCP presentation, graph/outline blockers, debug, and status. Do not force
unrelated tools into one universal JSON envelope.

Prefer separate types:

```text
InternalSearchResult
    always contains complete freshness evidence

PublicSearchResponse
    contains only approved ordinary projection

DebugSearchResponse
    adds selected internal evidence
```

Do not make internal freshness evidence optional merely because the public
projection omits it.

F0 must freeze JSON omission semantics. The target for normal responses is:

```text
normal success
    $.freshnessDecision absent
    $.freshnessSummary absent

normal blocker
    internal freshness-decision fields absent

debug/status
    approved internal evidence present
```

Property absence and `null` are different compatibility contracts. F0 must
inspect TypeScript requiredness, generated schemas, serializers, golden
fixtures, compact consumers, and public examples before choosing.

## 8. Compatibility decision

F0 makes no product code changes. Documentation and evidence artifacts are
allowed.

At F0 start, verify that the repository HEAD still equals the recorded review
base. Revalidate every current-contract statement against that exact F0 base;
do not inherit an earlier source-read statement after the base changes.

F0 must determine:

1. whether freshness fields are required by TypeScript types, generated public
   schemas, response format versions, or only current projections;
2. every first-party consumer and golden response that depends on them;
3. whether omission is minor-compatible;
4. whether fields require one optional/deprecated compatibility release;
5. whether graph/outline blocked behavior is a breaking contract change;
6. which existing statuses and reasons can represent every target blocker;
7. the exact package and response-format version decision;
8. the closed source-proof whitelist;
9. concurrent-publication behavior;
10. current cancellation and timeout ownership;
11. observation-continuity proof ownership;
12. retrieval-publication binding;
13. exact field omission semantics;
14. internal/public type separation;
15. normal-path performance budgets.

Terminal outcome:

```text
freshness_projection_minor_compatible
freshness_projection_breaking_change
freshness_contract_evidence_insufficient
```

No product implementation begins until F0 records one outcome.

After an accepted F0 decision, F1–F3 may be authorized as one end-to-end
implementation goal rather than separate approval gates.

## 9. Reuse-first implementation policy

Inspect the pinned Codebase Memory implementation before writing equivalent
projection code:

```text
src/mcp/mcp.c
    compact normal responses, selectable diagnostic fields, grouped rows, and
    pagination projection

src/watcher/watcher.c
    internal observation/retry evidence normally kept out of query results
```

Port or translate useful compact projections, schemas, helpers, and fixtures
when doing so reduces Satori-authored code. Preserve pinned-source attribution
and the MIT notice for copied or substantially translated material.

Satori-specific code should be limited to:

- mapping `FreshnessDecision` into approved projections;
- request-barrier enforcement;
- existing status/reason/action compatibility;
- continuation and non-mutating navigation integration;
- generated contracts and first-party consumer migration.

Do not port another watcher, synchronizer, checkpoint, or publication
authority. Reuse is an implementation method, not authorization for unrelated
Codebase Memory features.

## 10. Proposed execution

### F0 — evidence and compatibility freeze

No product code.

Produce:

- source/schema/consumer inventory;
- normalized ordinary and debug response samples;
- response byte baselines;
- clean warm and exact search latency baselines;
- verified graph/outline latency baselines;
- barrier capture, revalidation, and serialization cost;
- one-retry latency;
- request-barrier owner decision;
- observation-continuity proof decision;
- retrieval-publication binding decision;
- retry decision;
- non-mutating graph/outline proof decision;
- closed source-proof whitelist;
- exact condition → status → reason → `recommendedNextAction` → payload-present
  blocker mapping;
- simultaneous-condition blocker precedence fixtures;
- concurrent-publication P/Q decision;
- cancellation and timeout audit;
- field-omission and internal/public type decisions;
- normal-path performance budget;
- compatibility and version outcome;
- upstream reuse ledger.

The clean success path must use bounded existing evidence and must not add a
source-tree scan. F0 must freeze exact acceptable limits rather than leaving
“no material regression” undefined.

Seal:

```text
F0_BASE_REVISION=<hash>
F0_OUTCOME=<terminal outcome>
PUBLIC_SCHEMA_DECISION=<exact decision>
PACKAGE_VERSION_DECISION=<exact decision>
RESPONSE_FORMAT_VERSION_DECISION=<exact decision>
FIELD_OMISSION_SEMANTICS=absent|null|deprecated-present
BLOCKER_MAPPING_RECEIPT=<repository-relative path>
ACCEPTED_SOURCE_PROOFS=<closed list or receipt section>
OBSERVATION_CONTINUITY_PROOF=<exact owner and rule>
RETRIEVAL_PUBLICATION_BINDING=<exact rule>
GRAPH_OUTLINE_POLICY=<exact policy>
CANCELLATION_TIMEOUT_DECISION=<existing contract or separate scope required>
INTERNAL_PUBLIC_TYPE_BOUNDARY=<exact decision>
NORMAL_PATH_PERFORMANCE_BUDGET=<exact limits>
UPSTREAM_REUSE_DECISION=<summary>
F0_EVIDENCE_COMMIT=<hash when commit authorization is included>
PRODUCT_CODE_CHANGED=no
BLOCKER=<none or exact blocker>
```

### F1–F3 — one end-to-end product goal

Conditional on explicit authorization after F0:

```text
create one projection owner
-> simplify ordinary success
-> preserve debug/status evidence
-> enforce and revalidate the request barrier
-> block instead of returning stale data
-> preserve continuation invalidation
-> migrate first-party consumers and contracts
-> qualify all affected tools
```

F1–F3 are internal ownership checkpoints, not independent product programs.

## 11. Acceptance witnesses

1. Clean verified search returns results without freshness internals.
2. A pending event uses exactly one existing freshness flight.
3. Add, modify, and delete are reflected before search success.
4. Zero-change comparison permits normal success.
5. Comparison failure returns no stale result and one action.
6. `requires_reindex` retains its existing status and recovery action.
7. Watcher unavailable uses an accepted alternate proof or blocks.
8. An event between proof and projection causes exactly one retry.
9. A second event returns `source_changed_during_request`.
10. Non-retryable outcomes never retry.
11. Concurrent searches retain one flight and one publication owner.
12. A concurrent activation of Q after retrieval begins against P either keeps
    the response entirely bound to a still-readable and source-compatible P or
    causes the bounded retry/blocker; identities are never mixed.
13. Continuations become `SEARCH_RESULT_SET_STALE` after drift.
14. Graph and outline remain non-mutating and block only when no accepted
    source proof exists.
15. Relationship partial coverage remains independently disclosed.
16. Semantic relevance behavior remains unchanged.
17. Debug/status retain the complete internal evidence.
18. F0 records cancellation and timeout behavior without inventing an
    unproven shared-flight cancellation contract.
19. A source event after final barrier validation affects the next request and
    does not invalidate the completed receipt retroactively.
20. Every blocker case strips grouped rows, raw candidates, graph/outline
    payloads, and continuations. Cover at least missing index,
    `requires_reindex`, active operation, comparison failure, unverified source,
    source changes twice, incompatible publication, and watcher gap without an
    alternate proof.
21. Multiple simultaneous internal failures produce the one blocker whose
    supported action can make progress.
22. Clean successful calls use bounded existing evidence, perform no new
    source-tree scan, and remain within the frozen F0 latency budget.
23. Normalized before/after responses prove:

```text
before.results == after.results
before.grouping == after.grouping
before.ordering == after.ordering
before.continuation semantics == after.continuation semantics
```

Only approved freshness implementation fields and stale-success behavior may
change.

## 12. Verification and stop conditions

Run the smallest affected search, continuation, watcher, graph, outline,
status, schema, generated-documentation, and compact-consumer checks. Final
qualification includes invalidated MCP tests, typecheck, lint, build, contract
checks, response-size comparison, clean and retry-path latency comparison,
attribution checks, and `git diff --check`.

Stop if:

- correctness requires another synchronization/publication authority;
- Core V4 semantics must change;
- watcher gaps cannot be distinguished from verified observation;
- no established affordable non-mutating graph/outline proof exists and the
  required blocked behavior is not compatibility-approved;
- private continuation authority depends on public fields being removed;
- one blocker/action cannot preserve a required recovery path;
- ranking, result membership, relationship semantics, or relevance policy
  changes.

Terminal product outcome:

```text
agent_facing_freshness_contract_pass
agent_facing_freshness_contract_blocked
agent_facing_freshness_contract_regressed
```

## 13. Completion

The program passes only when:

```text
ordinary success
    contains no freshness implementation details
    uses a publication compatible with the final request barrier

ordinary freshness failure
    returns no stale usable result
    returns one dominant blocker and action

debug/status
    retain sufficient internal evidence

authority
    remains with existing freshness and V4 publication owners
```
