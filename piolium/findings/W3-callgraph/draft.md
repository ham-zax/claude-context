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
status: mitigated
verified_at: "7c961512c7d7ec14859f616de038488f61ff0d70"
fixed_in: "7c961512c7d7ec14859f616de038488f61ff0d70"
fix_verified_at: "7c961512c7d7ec14859f616de038488f61ff0d70"
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

## Resolution (2026-08-06 — audit reissue)

**Status: mitigated — residual open (Medium product-integrity).** The audited commit
`7c961512` is itself the inbound-coverage fix: empty inbound results now carry structured
`InboundCoverageEvidence` (`no_relationships_extracted` | `suppressed_low_confidence` |
`fallback_failed`, retrieved/suppressed counts, fallback attempt/recovery counts, Python
constructor applicability), and `CALL_GRAPH_INBOUND_COVERAGE_PARTIAL` plus a deterministic
`must:` next step are emitted instead of implying "no callers". Cross-module Python
constructor calls resolve for direct imports, imported aliases, module aliases, and plain
qualified module access, with ambiguity failing closed.

**Residual defect (rewritten from the original finding):** same-module bare Python
constructor calls still deliberately emit no `CALLS` edge (release receipt 2026-08-04,
documented in the W-fix plan), and the more consequential consequence stands: **a class
with one recovered cross-module caller and one omitted same-module caller yields a
non-empty graph with no partial-coverage evidence**, even though the result is incomplete.
Residual wording: "Python same-module constructor callers are omitted, and non-empty but
incomplete inbound graphs do not always disclose partial coverage." This is a legitimate
Medium product-integrity limitation for blast-radius analysis — not the older W3 mechanism
(silent empty-graph ambiguity), which is fixed.
