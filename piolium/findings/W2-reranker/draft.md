---
id: W2
slug: reranker
severity: medium
title: "Reranking is a live external fetch with no timeout, retry, or backoff; failure is silent to telemetry"
class: external-dependency-reliability
poc_kind: theoretical
exploitability: local-exploitable
satori_priority: P2
source: docs/remediation/2026-08-04-search-weakness-report-verification.md
plan_task: 2
fix_commit: "fix(reranker): bound VoyageAI latency and report failures"
status: fixed
introduced_at: "403723ee09ed9762195d983b3c4595985a917f5d"
verified_at: "403723ee09ed9762195d983b3c4595985a917f5d"
fixed_in: "f54f98dc96f742cc99b879f03e2007661d2a3b16"
fix_verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"
---

# W2 — Reranking has no timeout, retry, or backoff

## Finding

Reranking is a live external API call with no timeout, retry, or backoff;
failure degrades to retrieval order with a `RERANKER_FAILED` warning and no
telemetry counter. Ordering is not mislabeled as reranked.

## Verified mechanism

- `VoyageAIReranker.rerank` (`packages/core/src/reranker/voyageai-reranker.ts:47`)
  is a raw `fetch` with no `AbortSignal`, no timeout, no retry, no backoff.
- `measureSearchPhase` (`packages/mcp/src/core/handlers.ts:1216`) is a
  timing-only wrapper — a slow-but-successful rerank blocks the whole
  response.
- Failure handling (`packages/mcp/src/core/search-execution.ts:547-607`)
  attaches `warning: RERANKER_FAILED`; the pipeline continues with
  retrieval-order fusion scores and `candidate.rerankAdjusted` stays false.
- `searchDiagnostics` tracks `rerankerCalls/candidates/inputBytes` but no
  failure counter exists.

## Reproducer

A VoyageAI request that never resolves (or a 503) blocks the search response
indefinitely; a failed rerank leaves no diagnostic counter. See
`docs/evidence/search-integrity-baseline-20260805/` fixtures.

## Fix

Plan Task 2 — bound latency (30s per-attempt timeout, 2 attempts, 250ms
backoff), retry only transient classes (HTTP 408/425/429/5xx, ETIMEDOUT,
ECONNRESET, EAI_AGAIN, attempt-timeout abort; never 400/401/403/404, invalid
payloads/responses, or caller cancellation), add
`rerankerFailures/rerankerRetries/rerankerTimeouts` diagnostics, and keep
`rerankAdjusted === false` for every candidate on terminal failure. Acceptance:
the plan's voyageai-reranker and reranker regression tests pass (red → green).
