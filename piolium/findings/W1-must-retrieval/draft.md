---
id: W1
slug: must-retrieval
severity: high
title: "must: is a post-retrieval substring filter; matching files outside the retrieved candidate set are silently invisible"
class: search-retrieval-integrity
poc_kind: theoretical
exploitability: local-exploitable
satori_priority: P1
source: docs/remediation/2026-08-04-search-weakness-report-verification.md
plan_task: 1
fix_commit: "fix(search): add bounded must-constrained retrieval"
status: fixed
introduced_at: "403723ee09ed9762195d983b3c4595985a917f5d"
verified_at: "403723ee09ed9762195d983b3c4595985a917f5d"
fixed_in: "14ddc476c363f8210126bce002758501f851d0a3"
fix_verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"
---

# W1 — `must:` is a post-retrieval substring filter

## Finding

`must:` is a post-retrieval substring filter over the retrieved candidate
set, not a pre-retrieval constraint; matching files outside the retrieval set
are silently invisible. Quoted `must:` values are the only exact-phrase path
and are still retrieval-gated.

## Verified mechanism

- `must:` is consumed three ways: joined into the semantic query text
  (`deriveOperatorOnlySemanticQuery`, `packages/mcp/src/core/search-query-planning.ts:151`),
  enforced post-retrieval in `evaluateCandidate`
  (`packages/mcp/src/core/search-execution.ts:1113`), and matched as a plain
  substring (`tokenMatchesAnyField`, `packages/mcp/src/core/search-query-support.ts:1248`).
- Retrieval happens first (lexical projection, candidate budget). The
  `operator_constraint` pool expansion and the bounded `mustRetry` loop are
  capped by candidate limits — files containing the tokens can remain
  invisible.

## Reproducer

A `must:` query whose only matching file lies beyond the normal top-N lexical
pool returns no results for that file, with no indication that retrieval was
budget-capped. See `docs/evidence/search-integrity-baseline-20260805/`
fixtures.

## Fix

Plan Task 1 — add a bounded `must:` lexical retrieval lane (every `must:`
value as a mandatory literal term, quoted values as one exact token, hard
budget = operator-constraint candidate maximum, merged by stable candidate
identity, re-evaluated by the normal evaluator; never bypass path, language,
repository, fingerprint, or exclusion checks; never unbounded direct repo
scan). Emit `MUST_NOT_SATISFIED_WITHIN_RETRIEVAL_BUDGET` when nothing
survives, `MUST_RESULTS_MAY_BE_INCOMPLETE_WITHIN_RETRIEVAL_BUDGET` on partial
recovery with exhausted budget. Acceptance: the plan's search-query-planning /
search-execution regression tests pass (red → green), and queries without
`must:` remain byte-equivalent.
