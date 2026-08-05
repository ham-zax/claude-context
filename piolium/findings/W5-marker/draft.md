---
id: W5
slug: marker
severity: low
title: "After 100% progress, search stays not_ready until the completion marker is durable; the window is reported as generic indexing"
class: readiness-availability
poc_kind: theoretical
exploitability: non-exploitable
satori_priority: P3
source: docs/remediation/2026-08-04-search-weakness-report-verification.md
plan_task: 6
fix_commit: "feat(search): expose finalizing readiness state"
status: open
verified_at: "7c961512c7d7ec14859f616de038488f61ff0d70"
fixed_in: ""
fix_verified_at: ""
---

# W5 — `not_ready` "indexing" window after 100% progress

## Finding

After `progressPct: 100.0`, search returned `not_ready` for ~30s; status
flipped to completed only after the marker doc was written. Confirmed,
deliberate design: the window is the cost of the atomic completion-marker
proof (a listed strength) and is fail-closed. The gap is that the window is
indistinguishable from ordinary indexing — the response does not say the
payload is complete and only the marker is pending.

## Verified mechanism

- The completion marker is a vector control record written after the payload
  writes (`packages/core/src/core/context.ts:4562-4575`,
  `writeIndexCompletionMarker`).
- Readiness requires marker proof; a missing marker is a distinct
  `missing_marker_doc` reason (`packages/mcp/src/core/search-frontdoor.ts:187`).
- During the window, search returns `status: "not_ready", reason: "indexing"`
  (`packages/mcp/src/core/tool-response-builders.ts:314`); `retryAfterMs`
  exists only on `manage_*` payloads.

## Reproducer

Observe search readiness during the post-100%-pre-marker window (payload
count exactly matches expected; marker not yet durable). See
`docs/evidence/search-integrity-baseline-20260805/` fixtures.

## Fix

Plan Task 6 (optional UX) — when the payload count exactly matches expected
and only the marker is missing, respond `status: "not_ready", reason:
"finalizing", retryAfterMs: 1000` with `hints.debugIndexing.completionProof:
"marker_doc"`; never return results before marker proof; do not add a new
top-level status unless the MCP response schema is versioned. Acceptance: the
plan's readiness regression tests pass (red → green).

## Verification (2026-08-06 — audit reissue)

**Status: open — no fix landed.** `reason: "finalizing"` is absent from the audited
commit `7c961512` and from current HEAD (`grep finalizing packages/mcp/src` → 0 matches);
the `not_ready`/`indexing` window after 100% progress persists. Deliberate fail-closed
design (the cost of the atomic completion-marker proof); severity low, non-exploitable,
P3. Excluded from the report's headline finding counts (as in the original issue) but
remains tracked. The W-fix plan's Task 6 (optional UX) is the pending remediation.
