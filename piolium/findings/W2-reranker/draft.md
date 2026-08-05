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
verified_at: "7c961512c7d7ec14859f616de038488f61ff0d70"
fixed_in: "7c961512c7d7ec14859f616de038488f61ff0d70"
fix_verified_at: "7c961512c7d7ec14859f616de038488f61ff0d70"
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

## Resolution (2026-08-06 — audit reissue)

**Status: fixed.** Verified present at the audited commit `7c961512`:
`VoyageAIReranker.rerank` implements a 30s per-attempt timeout, at most two attempts,
250ms backoff, retry classification (408/425/429/5xx, ETIMEDOUT, ECONNRESET, EAI_AGAIN;
never permanent failures or invalid responses), caller-cancellation propagation, and
`onExecutionDiagnostics` telemetry (`rerankerRetries`/`rerankerTimeouts`/`rerankerFailures`
surfaced in search diagnostics). The report's "raw unbounded fetch, no failure telemetry"
claim is false at the audited commit. Focused regression tests cover transient success,
terminal 503, permanent 401, hung-request timeout, retryable network errors, invalid
responses, and cancellation.
