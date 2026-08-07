# Controlled Same-Input Ranking Comparison: NATIVE vs LEGACY (2026-08-07)

Summary of the controlled evaluation comparing the native reranker-order policy
(master 6.8.2) against the legacy 6.8.1 hardcoded post-rerank ranking, under a
frozen common upstream state. Raw captures/replays stay outside the repo
(`/tmp/satori-tradingview-ab/controlled/`); this file carries metrics and
conclusions only.

## Contract

- One common frozen upstream state per query: identical retrieval pool,
  identical LateOn documents, one validated LateOn response per rerank-path
  query. NATIVE publishes the provider order; LEGACY applies the actual 6.8.1
  dist functions (RRF rerank fusion + multipliers + group scoring + diversity)
  to the same inputs. No tuning of either policy; no query/ranking changes
  from intermediate results (preregistration held).
- Seals: query pool `pool.sha256 = 63dad1d4…` (36 queries, batch1 16 +
  reserves 20, opened sequentially via the batch gate); frozen captures
  `FROZEN-STATE.sha256 = face8d61…` (batch 1), `FROZEN-STATE-reserves.sha256
  = 708b6f89…` (reserves). Replays are deterministic (hash-stable re-runs).
- Repo under test: `~/repo/tradingview_ratio` (STRATOS/QAP v1.5.0), offline
  stack (Potion + LanceDB + LateOn-Code-edge).

## Conclusion 1 — mechanism (from the earlier production A/B)

The native ordering mechanism works as contracted: provider order published
verbatim when applied, truthful retrieval-order fallback with `RERANKER_FAILED`
on failure, exact/grouping/dedup contracts intact. Mechanism evidence does not
support any quality claim; quality is assessed only in conclusions 2–3.

## Conclusion 2 — controlled same-input preference evidence

8 conceptual queries judged (blinded normalized top-5, 3 independent judge
passes each; one dispute escalated and human-adjudicated):

| query | rerank ran | verdict | authority |
|---|---|---|---|
| c01 | yes | native | 3/0 triage |
| c02 | yes | legacy | 3/0 triage |
| c03 | yes | legacy | 3/0 triage |
| c04 | NO (issue #10) | legacy | 3/0 triage |
| c05 | n/a (empty) | equivalent | automatic |
| c06 | yes | legacy | 3/0 triage |
| c07 | yes | legacy | human (judges 2-1) |
| c08 | NO (issue #10) | native | 3/0 triage |

- Decisive tally: native 2, legacy 5. Beta-binomial with uniform prior:
  posterior Beta(3,6), P(legacy preferred > native) ≈ 0.86.
- Reranked-only subset (c01, c02, c03, c06, c07): native 1, legacy 4.
- Model votes are proxy evidence only; the human decided the single dispute
  (c07 → legacy, closer to the ideal implementation-first order).
- Caveat: c04/c08 were never reranked in the frozen state (master projection
  failure, ISSUES #10); they evidence post-retrieval ordering policy only.

## Conclusion 3 — objective anchor metrics (20 anchored queries, both batches)

| policy | Hit@1 | Hit@3 | MRR |
|---|---|---|---|
| native | 11/20 | 12/20 | 0.6038 |
| legacy | 11/20 | 15/20 | 0.6488 |

Legacy's edge concentrates in Hit@3/MRR; Hit@1 is tied. Notable deltas:
e05 (5 vs 3, rerank skipped by policy — multiplier effect only), i04 (5 vs 2),
i08 (5 vs 2, rerank failed — projection issue, not ranking policy), t02 (3 vs 2).
Exact-identifier anchors tie at rank 1 (shared fast path). No-answer queries
(n01–n04): neither policy abstained; both returned 20 groups — abstention is
not a differentiator here.

## Artifact-type pattern (per the no-global-weights directive)

Implementation-seeking "how does X work" queries are where native loses: on
reranked losses the reranker ordered tests above the production implementation
(c03, c06, c07; batch-1 pattern 2/2). Counterexample preserved: c01/c08, where
a test was the clearest available evidence and native's surfacing of it won —
so artifact usefulness is query-dependent and a global tests/docs penalty is
falsified. Direction recorded in ISSUES #9 (give the reranker factual role +
query-intent evidence; do not multiply scores).

## New issues found (appended to ISSUES.md)

- #8: no per-document rerank-input observability in master diagnostics.
- #9: reranker input carries no factual candidate role or query-intent signal.
- #10: rerank dies all-or-nothing at `document_projection` for some queries;
  LateOn never called (4/20 reserve queries; root cause still open).

## Disposition

No ranking or query changes made. Per directive, the fix direction is
reranker-input evidence (role + intent), not restored hardcoded weights.
