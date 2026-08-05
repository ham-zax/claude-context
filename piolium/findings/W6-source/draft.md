---
id: W6
slug: source
severity: low
title: "Symbol tools return span-bounded excerpts with no advertised full-source path"
class: source-retrieval-ux
poc_kind: theoretical
exploitability: non-exploitable
satori_priority: P3
source: docs/remediation/2026-08-04-search-weakness-report-verification.md
plan_task: 7
fix_commit: "docs(search): document full-source retrieval"
status: fixed
introduced_at: "403723ee09ed9762195d983b3c4595985a917f5d"
verified_at: "403723ee09ed9762195d983b3c4595985a917f5d"
fixed_in: "a2b9da9b17b9ce07cdb57cf90543560321ed4f66"
fix_verified_at: "a2b9da9b17b9ce07cdb57cf90543560321ed4f66"
---

# W6 — Source reads are span-bounded; full files unreachable through symbol tools

## Finding

`open_symbol` / `symbol_context` source is span-bounded with continuation
fingerprints; a full-source path exists via `read_file` (explicit ranges /
`presentation: "full"`) but is not advertised by the symbol tools. The
capability gap is documentation, not mechanism.

## Verified mechanism

- `selectBoundedSource` (`packages/mcp/src/core/bounded-source-selector.ts:449`
  `buildExcerpts`, `:530` complete-vs-bounded decision) returns
  `mode: "complete"` only when the whole symbol fits the budgets
  (`maxSourceBytes` / `maxSourceLines` / `maxSerializedSourceBytes`);
  otherwise bounded excerpts (declaration + terminal + query/evidence
  anchors) plus continuation fingerprints
  (`packages/mcp/src/core/symbol-context-composer.ts:890-960`).
- `read_file` explicit ranges always return exact source; `presentation:
  "full"` returns raw multiline source (`packages/mcp/src/tools/read_file.ts:43,447`).
- No `sourceMode:"full"` exists on `symbol_context`.

## Reproducer

Request `open_symbol` for a symbol spanning more than the source budget;
observe bounded excerpts and continuation fingerprints with no pointer to the
`read_file` full-source path.

## Fix

Plan Task 7 — document in the `read_file`, `open_symbol`, and
`symbol_context` tool descriptions: symbol tools return bounded,
continuation-aware excerpts; `read_file` with explicit ranges returns the
exact requested range; `read_file` with `presentation:"full"` returns raw
multiline source subject to read_file byte/range limits. Do not add
`sourceMode:"full"` to `symbol_context` in this pass. Acceptance: description
snapshot tests updated and passing.
