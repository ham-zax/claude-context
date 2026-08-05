---
id: W3
slug: callgraph
severity: medium
title: "Inbound call-graph coverage is per-symbol and silently incomplete; unresolvable constructor receivers emit nothing"
class: call-graph-coverage
poc_kind: theoretical
exploitability: local-exploitable
satori_priority: P2
source: docs/remediation/2026-08-04-search-weakness-report-verification.md
plan_task: 3,4
fix_commit: "fix(call-graph): expose inbound coverage reasons"
status: open
introduced_at: "403723ee09ed9762195d983b3c4595985a917f5d"
verified_at: "403723ee09ed9762195d983b3c4595985a917f5d"
fixed_in: ""
fix_verified_at: ""
---

# W3 — Call-graph coverage is per-symbol and silently incomplete

## Finding

Inbound call-graph coverage is per-symbol and silently incomplete: the
partial-coverage warning cannot distinguish "no callers" from "unknown
callers", and unresolvable constructor-receiver references emit no record, no
fallback, and no note. Observed: `TradingEntryVetoes` → 0 inbound edges +
`CALL_GRAPH_INBOUND_COVERAGE_PARTIAL`, while a `must:` search found two real
call sites.

## Verified mechanism

- `CALL_GRAPH_INBOUND_COVERAGE_PARTIAL`
  (`packages/mcp/src/core/relationship-backed-call-graph.ts:113,527`) is
  emitted whenever the combined inbound edge set is empty — it cannot
  distinguish "no callers exist" from "callers unknown/unindexed".
- Low-confidence records are suppressed at query time
  (`packages/core/src/navigation/query.ts:570-595`); the source-backed
  fallback runs only when suppressed records exist
  (`relationship-backed-call-graph.ts:445-458`).
- Constructor-receiver resolution exists
  (`resolvePythonClassReference` / `pythonConstructorExpression`,
  `packages/core/src/relationships/builder.ts:149`) but is same-module /
  reference-graph driven; unresolvable cross-module or qualified references
  emit no relationship record at all.

## Reproducer

Cross-module Python constructor call (`from package.rules import
TradingEntryVetoes; TradingEntryVetoes(...)`) produces zero inbound edges for
the class symbol with only a generic partial-coverage warning. See
`docs/evidence/search-integrity-baseline-20260805/` fixtures.

## Fix

Plan Tasks 3–4 — attach structured `InboundCoverageEvidence`
(`no_relationships_extracted` | `suppressed_low_confidence` | `fallback_failed`)
to the existing warning, and resolve cross-module constructor callers via the
caller module's import bindings (direct imports, aliases, qualified module
aliases) with fail-closed ambiguity handling and no global class-name
matching. Acceptance: the plan's handlers.call_graph, relationships, and
navigation regression tests pass (red → green); existing follow-up hints stay.
