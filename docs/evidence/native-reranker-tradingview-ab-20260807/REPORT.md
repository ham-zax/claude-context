# TradingView Ranking A/B — Published Hardcoded Satori (6.8.1) vs Local Native-Reranker Satori (master/6.8.2)

Date: 2026-08-07. Observational production comparison — no ranking code was
modified or tuned on either side. Identities, provider config, corpus parity,
and deviations: see `MANIFEST.json`. Issues found for future master fixes:
`ISSUES.md`.

## 1. Question

Did the old hardcoded ranking (RRF fusion + scope/path multipliers +
changed-file boost + agent-fit + local final-score re-sort) improve or damage
the reranker's native judgments, compared with the new policy where the
validated LateOn reranker order is authoritative?

## 2. Setup (abbreviated)

- Corpus: `~/repo/tradingview_ratio` @ `8d65bf2` (3 dirty files), 1520 files,
  indexed identically by both versions (same runtime fingerprint, same
  `indexPolicyHash 0e19e8c1…`, same per-language file counts).
- Providers identical: Potion embeddings (byte-identical helper/model),
  LanceDB, LateOn `LateOn-Code-edge@07ef20f…` with
  `lateon_offline_quality_projection_v2_d32_v2` /
  `lateon_d32_owner_default_v1`.
- 4 variants: `{old, native} × {rerank, norerank}`; 22 frozen queries
  (sha256 `59652bc4…`), 1 repeat each (user-directed deviation from 3),
  variants parallel per query with old/native paired in the same batch.
  88/88 runs succeeded after retrying 18 startup-sync races (ISSUES.md #5).
- Raw envelopes kept out of the repo (39MB): retained at
  `/tmp/satori-tradingview-ab/evidence/{old,native}/raw/`; metrics:
  `comparison.json`; latency: `latency.json`; slimmed per-run rows:
  `extracted.json`.

## 3. Headline result

**The old hardcoded ranking substantially overrides the reranker's native
order; the native build preserves it exactly.**

| Metric (rerank variants, top-10) | old (6.8.1) | native (master) |
|---|---|---|
| Order authority field | not present (legacy) | `reranker_order` 12/22, `retrieval_order` 10/22 |
| Kendall(reranker output → final chunk order) | **0.43** | **1.00** |
| Mean displacement of reranked chunks (of 32) | **7.1 positions** | **0.17** |
| Overlap(reranker top-3 → final top-3) | 0.155 | 0.435 |
| Overlap(reranker top-10 → final top-10) | 0.120 | 0.328 |
| LateOn applied | 12/22 | 12/22 (same trigger population) |

Native's residual chunk displacement (0.17) is grouping/dedup at the symbol
boundary, not re-ranking. Where the reranker ran, the published order is the
reranker's order.

## 4. Old vs native final-order disagreement

| Cell | top-1 agree | overlap@3 | overlap@10 | Kendall top-10 | mean displacement |
|---|---|---|---|---|---|
| rerank variants | 0.227 | 0.145 | 0.294 | 0.274 | 2.93 |
| norerank variants | 0.227 | 0.190 | 0.273 | 0.263 | 2.30 |

Interpretation:

- The rerank cell disagreement (Kendall 0.27) is driven by the old side's
  re-sort (section 3) — when LateOn applied, old moved reranked chunks by
  ~7 positions on average.
- The norerank cell also disagrees (Kendall 0.26): retrieval itself evolved
  between 6.8.1 and master (projections, selection, fusion limits). This A/B
  therefore measures **ranking-application + retrieval evolution together**;
  it cannot isolate ranking application alone. Reranker input documents also
  differ by version (ISSUES.md #3).

## 5. Did the old re-sort help or hurt?

Qualitative spot-checks against the corpus:

- q08 ("Which Shopify component updates the cart drawer…") has no Shopify
  code in this corpus; both sides returned marginal trading-tracking files in
  reversed orders (Kendall −1.00). No ground truth exists — honest
  no-answer query.
- Across reranker-applied queries, the old side's re-sort consistently
  promotes path-multiplier/changed-file/agent-fit signals over provider
  scores (visible in `candidateSurvival` replay: `pathMultiplier`,
  `changedFilesMultiplier`, `agentFitMultiplier`, `fusionScore`). With 1
  repeat and no per-query ground truth for 22 queries, this run cannot
  statistically adjudicate quality; it proves the mechanism: the old policy
  does not trust the reranker and rewrites ~half its ordering signal
  (Kendall 0.43), while the new policy publishes it untouched.

Conclusion on the core question: the old hardcoded ranking **overrode**
LateOn's native judgments rather than refining them — 7.1/32 mean
displacement and 0.43 rank correlation is a rewrite, not a tiebreak. Whether
that rewrite was net-beneficial on this corpus is undecidable from this
run without per-query relevance judgments (recommended follow-up, not
performed here per plan scope).

## 6. Robustness and honesty of fallbacks (native)

- 10/22 native rerank queries published `retrieval_order`: reranker skipped
  by policy (low ambiguity / exact-pin / 0–1 candidates) on 9, and 1 true
  failure — q14 `lateon_execution_timeout` (reproduced on both versions
  under parallel CPU load) with a truthful `RERANKER_FAILED` warning and the
  frozen retrieval order published. Contract behaved exactly as specified.
- No `RERANKER_FAILED` warning on zero-byte admission paths (none occurred).

## 7. Latency (search-only, server telemetry; 4-way parallel load)

| Cell | median | mean | min | max |
|---|---|---|---|---|
| old/rerank | 24.7s | 21.8s | 10.2s | 32.3s |
| old/norerank | ~11.4s | — | — | — |
| native/rerank | 24.3s* | 19.0s | 5.6s | 31.8s |
| native/norerank | ~11.3s | — | — | — |

(*q14 timeout inflates native median; under contention, see ISSUES.md #6.)
Rerank adds roughly 2× search latency on both versions; versions are
latency-equivalent within noise. Full stats in `latency.json`.

## 8. Per-query table (old vs native)

`o@3/o@10/τ` = overlap@3, overlap@10, Kendall top-10 of final orders;
`auth` = native order authority; `resort τ` = Kendall(reranker output →
final) per side.

| q | rerank o@3 | rerank o@10 | rerank τ | norerank o@10 | native auth | old resort τ | native resort τ |
|---|---|---|---|---|---|---|---|
| q01 | 0.00 | 0.18 | −0.33 | 0.05 | reranker_order | 0.18 | 1.00 |
| q02 | 0.20 | 0.11 | 1.00 | 0.00 | reranker_order | — | 1.00 |
| q03 | 0.00 | 0.05 | — | 0.05 | retrieval_order | — | — |
| q04 | 0.20 | 0.33 | 0.40 | 0.25 | reranker_order | — | 1.00 |
| q05 | 0.00 | 0.05 | — | 0.05 | reranker_order | 0.34 | 1.00 |
| q06 | 1.00 | 1.00 | — | 1.00 | retrieval_order | — | — |
| q07 | 0.00 | 0.25 | 0.67 | 0.25 | reranker_order | 0.53 | 1.00 |
| q08 | 0.00 | 0.11 | −1.00 | 0.43 | reranker_order | — | 1.00 |
| q09 | 0.00 | 0.05 | — | 0.05 | reranker_order | — | 1.00 |
| q10 | 0.00 | 0.11 | −1.00 | 0.11 | retrieval_order | — | — |
| q11 | 0.00 | 0.11 | 1.00 | 0.18 | reranker_order | −0.07 | 1.00 |
| q12 | — | — | — | — | retrieval_order | — | — |
| q13 | 0.00 | 0.18 | 0.33 | 0.18 | reranker_order | 0.17 | 1.00 |
| q14 | 0.20 | 0.05 | — | 0.05 | retrieval_order (timeout) | timeout | timeout |
| q15 | 0.20 | 0.67 | 0.93 | 0.54 | reranker_order | 0.93 | 1.00 |
| q16 | 0.50 | 0.82 | 0.67 | 0.67 | reranker_order | 0.64 | 1.00 |
| q17 | 0.20 | 0.67 | 0.07 | 0.67 | retrieval_order | — | — |
| q18 | — | — | — | — | retrieval_order | — | — |
| q19 | 0.20 | 0.18 | 0.33 | 0.11 | retrieval_order | 0.73 | — |
| q20 | 0.00 | 0.18 | 0.33 | 0.18 | retrieval_order | — | — |
| q21 | 0.00 | 0.54 | 0.05 | 0.54 | retrieval_order | — | — |
| q22 | 0.20 | 0.25 | 0.67 | 0.11 | reranker_order | 0.41 | 1.00 |

## 9. Limitations

- 1 repeat (user-directed): no within-cell stability estimate; LateOn
  timeouts under parallel load affect q14 on both sides.
- Retrieval pipelines differ between versions; the norerank baseline proves
  this contaminates the rerank comparison.
- Reranker input documents differ by version (projection rollout).
- Archived queries q01–q08 came from another corpus's QAP set; several have
  no ground truth in this repo.
- Latency measured under 4-way parallel CPU contention.

## 10. Verdict

On identical corpus, embedding, and reranker configuration, the published
6.8.1 hardcoded ranking rewrote the reranker's native ordering
(Kendall 0.43, ~7-position mean displacement), while master publishes the
validated reranker order untouched (Kendall 1.00) with truthful, observable
fallbacks. The mechanism question is answered; the quality question
("was the rewrite net-helpful") requires per-query relevance judgments and
was intentionally out of scope.
