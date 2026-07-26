# Agent-Facing Freshness F0 Receipt

## Decision

```text
F0_BASE_REVISION=2a69144be52e0b4f9ea9894dd5695666c7f7dce9
CORRECTIVE_REVIEW_BASE_REVISION=384a615d002db331f9e3600d47907d5c375d41ee
F0_OUTCOME=freshness_projection_versioned_candidate
IMPLEMENTATION_OUTCOME=agent_facing_freshness_candidate_focused_pass
PUBLIC_SCHEMA_DECISION=format-3 candidate; consumer compatibility remains unqualified
PACKAGE_VERSION_DECISION=release decision pending consumer compatibility evidence
RESPONSE_FORMAT_VERSION_DECISION=search response format 3
FIELD_OMISSION_SEMANTICS=absent
PRODUCT_CODE_CHANGED=no during F0
BLOCKER=none
```

The implementation was authorized after the F0 source/schema audit. This
receipt records a focused candidate, not final package or broad-suite
qualification.

The original F0 inventory remains bound to its recorded base. The correctness
review and repairs in this amended receipt were performed against `384a615d002db331f9e3600d47907d5c375d41ee`;
the older base was not rewritten as though the audit happened later.

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
3. either:
   - a non-null prepared source observation under continuous ready watcher
     coverage; or
   - a successful read-only full comparison against the effective source
     checkpoint when watcher observation is unavailable;
4. no pending watcher event or proof-changing reconciliation;
5. a valid source checkpoint bound to the effective V4 publication;
6. the same authority/source barrier at final projection.

`coverageGapSinceEpoch` makes the source observation unavailable until the
existing freshness owner completes a comparison through the gap. This is the
observation-continuity proof; watcher epoch equality alone is not accepted.

Watcher-disabled, failed, starting, and interrupted search uses the existing
Core comparison owner to compare the complete source against the effective
checkpoint twice, without publishing or adding durable authority. Navigation
remains non-mutating: it validates prepared V4 readiness under a publication
read lease and requires one unchanged ready watcher-event barrier across
construction. It blocks when that proof is unavailable.

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

Ordinary blockers omit internal freshness decisions. Explicit
`debugMode="freshness"` and `"full"` retain approved evidence for successful
and blocked search responses. Existing status and recovery vocabulary is
retained where it already expresses the condition.

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

Focused checks include:

- watcher-disabled and unavailable-source search barrier tests;
- watcher lifecycle, retry, second-drift, and navigation-event barrier tests;
- complete `handlers.file_outline.test.ts`;
- compact response-contract tests;
- MCP typecheck: passed;
- MCP lint: passed;
- MCP build: passed;
- generated documentation check: passed;
- manifest check: passed;
- `git diff --check`: passed.

Full Core and MCP suites and external consumer compatibility were not run by
explicit request. This receipt therefore does not claim final product or
minor-version compatibility qualification.
