# Agent-Facing Freshness F0 Receipt

## Decision

```text
F0_BASE_REVISION=2a69144be52e0b4f9ea9894dd5695666c7f7dce9
F0_OUTCOME=freshness_projection_minor_compatible
PUBLIC_SCHEMA_DECISION=versioned ordinary-response projection
PACKAGE_VERSION_DECISION=MCP 6.5.0; no additional package bump required
RESPONSE_FORMAT_VERSION_DECISION=search response format 3
FIELD_OMISSION_SEMANTICS=absent
PRODUCT_CODE_CHANGED=no during F0
BLOCKER=none
```

The implementation was authorized after the F0 source/schema audit. Product
changes remain uncommitted at the time of this receipt.

## Current owners and compatibility

- `packages/mcp/src/core/search-types.ts` owns the public search envelope and
  response-format version.
- `packages/mcp/src/core/search-response-envelopes.ts` owns successful grouped
  and raw projection.
- `packages/mcp/src/core/tool-response-builders.ts` owns search blockers.
- `packages/mcp/src/core/handlers.ts` owns the search request barrier, retrieval
  attempt, publication read lease, and bounded retry.
- `packages/mcp/src/core/navigation-handlers.ts` owns non-mutating graph and
  outline projection.
- `packages/mcp/src/core/sync.ts` owns watcher coverage, pending-event,
  checkpoint-observation, and active-sync evidence.

The MCP tool output schema does not declare `freshnessDecision` or
`freshnessSummary` as required JSON properties. The TypeScript search envelope
previously required `freshnessDecision`; response format 3 makes it optional
while internal construction inputs continue to require the full decision.
First-party telemetry uses handler metadata and retains only a compatibility
fallback for older parsed envelopes.

## Accepted source proof

Normal search success requires:

1. a compatible prepared publication authority observation;
2. a publication read lease for the retrieval attempt;
3. a non-null prepared source observation;
4. watcher coverage `ready`, with the root registered and active;
5. no pending watcher event or observation gap;
6. no active synchronization or ignore reconciliation;
7. a valid source checkpoint whose registered observation matches the
   comparison-owned observation;
8. the same authority and source observations at final projection.

`coverageGapSinceEpoch` makes the source observation unavailable until the
existing freshness owner completes a comparison through the gap. This is the
observation-continuity proof; watcher epoch equality alone is not accepted.

No separate watcher-unavailable proof was established. Search may establish a
new proof through the existing freshness owner. `call_graph` and `file_outline`
remain non-mutating and block when the proof is unavailable.

## Retrieval-publication binding

Each search attempt acquires the existing publication read lease and captures
the authority and source observations used by the prepared read. Before
projection, it compares both observations again.

If either changes, the attempt releases its lease and discards its payload. The
first drift starts one complete new attempt. A second drift returns
`source_changed_during_request` with no results. No candidates, grouping,
continuation state, or receipts are shared between attempts.

## Public blocker mapping

| Condition | Status | Reason | Action | Payload |
| --- | --- | --- | --- | --- |
| Missing index/path | `not_indexed` | existing reason | create | none |
| Index operation active | `not_ready` | existing reason | status | none |
| Reindex required | `requires_reindex` | existing reason | reindex or established repair | none |
| Source checkpoint missing/corrupt | `requires_reindex` | `requires_reindex` | reindex | none |
| Source observation unavailable | `not_ready` | `source_state_unverified` | sync | none |
| Source changes during both attempts | `not_ready` | `source_changed_during_request` | retry original search | none |
| Navigation source event/gap/unavailable watcher | `not_ready` | `source_state_unverified` | sync | no graph/outline |
| Backend/provider failure | existing status/reason | existing reason | existing recovery | none |

Ordinary blockers omit internal freshness decisions. Existing status and
recovery vocabulary is retained where it already expresses the condition.

## Projection and performance decisions

Normal successful grouped and raw responses omit:

```text
$.freshnessDecision
$.freshnessSummary
```

Explicit `debugMode="freshness"` and `debugMode="full"` retain approved
freshness evidence. Status and maintenance tools retain their existing
diagnostics.

The clean-path budget is structural:

- two bounded prepared-read observation captures per successful search attempt;
- zero new source-tree scans;
- zero additional synchronization/publication flights;
- zero new durable state;
- at most one complete retry, only after post-proof source drift.

Focused fixture searches, including retry and second-drift paths, completed
within the existing affected test envelope. No production repository latency
claim is made by this receipt.

## Cancellation and reuse

No request-level `AbortSignal` propagation was found in the affected handler
path. The change does not add cancellation ownership and does not cancel a
shared freshness flight.

No Codebase Memory code was copied. The existing Satori response builders and
prepared-read owners already provided the smaller implementation boundary.

## Verification

Focused checks:

- freshness/source-observation subset of `handlers.scope.test.ts`: 19 passed;
- checkpoint-unavailable projection regression: 1 passed;
- affected search, watcher, graph, golden, setup, and compact-contract tests:
  90 passed;
- MCP typecheck: passed;
- MCP lint: passed;
- MCP build: passed;
- generated documentation check: passed;
- manifest check: passed;
- `git diff --check`: passed.

Full Core and MCP suites were not run by explicit request; no claim depends on
them.
