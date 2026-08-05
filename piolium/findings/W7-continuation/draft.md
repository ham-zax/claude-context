---
id: W7
slug: continuation
severity: medium
title: "Continuation handle absence is silent: oversized ranked sets are stripped with no total/available group disclosure"
class: continuation-observability
poc_kind: theoretical
exploitability: local-exploitable
satori_priority: P2
source: docs/remediation/2026-08-04-search-weakness-report-verification.md
plan_task: 8
fix_commit: "feat(search): report continuation availability"
status: fixed
introduced_at: "403723ee09ed9762195d983b3c4595985a917f5d"
verified_at: "403723ee09ed9762195d983b3c4595985a917f5d"
fixed_in: "189448f908fb956c291b3d8598ec1ad509d5d52d"
fix_verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"
---

# W7 — `continue_search` handle was not surfaced

## Finding

A continuation handle is attached only when the ranked set has remaining
groups and the continuation coordinator admits it; oversized sets are
stripped (`SEARCH_RESULT_SET_NOT_CACHE_ADMISSIBLE`) with no total/available
group disclosure. Observed: no `handle` field in any search response, even at
44 available groups.

## Verified mechanism

- A continuation is attached only when `resultCounts.remainingGroupCount > 0`
  (`packages/mcp/src/core/search-result-finalization.ts:678`) and the
  continuation coordinator admits the ranked set
  (`packages/mcp/src/core/handlers.ts:4507-4532`).
- If the store returns `not_admissible`, the handle is stripped and
  `SEARCH_RESULT_SET_NOT_CACHE_ADMISSIBLE` is added to warnings — the
  not-admissible path is silent about the total group count
  (`reservedReplayBytes` / `responseByteLimit`).

## Reproducer

A search with 44 available groups whose ranked set exceeds the reserved
replay byte budget returns no handle and no total/available group counts. See
`docs/evidence/search-integrity-baseline-20260805/` fixtures.

## Fix

Plan Task 8 — expose `SearchPaginationEvidence`
(`totalGroupCount`, `returnedGroupCount`,
`continuation: "complete" | "attached" | "not_admissible"`); on
`not_admissible` preserve `SEARCH_RESULT_SET_NOT_CACHE_ADMISSIBLE`, report
total/returned counts, and never fabricate a handle. Do not raise
replay-byte limits in the same commit — first collect evidence on rejection
rates. Acceptance: the plan's search-result-finalization regression tests
pass (red → green).
