# Satori reranker benchmark results

Date: 2026-08-29

Status: exploratory tuning comparison; not a release or held-out quality gate.

## Decision

Keep `lightonai/LateOn-Code-edge` at depth 32. It produced the best owner-ranking
result on every reported quality measure.

- Edge-ColBERT 17M improved over the no-reranker baseline but did not beat
  LateOn.
- Edge-ColBERT 32M ranked worse than the 17M sibling on Owner@1, Owner@3, and
  MRR, tied it on Owner@10, and missed the runtime deadline on 21 fusion tasks.
- Ettin reranker 17M improved over baseline but ranked below LateOn and missed
  the runtime deadline on every fusion-scored task.
- Ettin reranker 32M passed a scorer sanity check, but its full benchmark was
  stopped before aggregate ranking metrics were produced. It is not qualified
  by this evidence.

## Completed ranking comparison

The ranking stratum contains 36 owner-discovery tasks. The negative stratum
contains 12 tasks.

| Model | Owner@1 | Owner@3 | Owner@10 | MRR | Negative exposure@3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| No-reranker baseline | 7/36 (0.1944) | 13/36 (0.3611) | 18/36 (0.5000) | 0.2900 | 0/12 |
| **LateOn-Code-edge D32** | **14/36 (0.3889)** | **23/36 (0.6389)** | **25/36 (0.6944)** | **0.5046** | **0/12** |
| Edge-ColBERT 17M D32 | 11/36 (0.3056) | 20/36 (0.5556) | 24/36 (0.6667) | 0.4253 | 0/12 |
| Ettin reranker 17M D32 | 10/36 (0.2778) | 20/36 (0.5556) | 23/36 (0.6389) | 0.3938 | 0/12 |
| Edge-ColBERT 32M D32 | 9/36 (0.2500) | 14/36 (0.3889) | 24/36 (0.6667) | 0.3631 | 0/12 |

Candidate deltas from LateOn D32:

| Candidate | Owner@1 | Owner@3 | Owner@10 | MRR |
| --- | ---: | ---: | ---: | ---: |
| Edge-ColBERT 17M | -3 owners | -3 owners | -1 owner | -0.0793 |
| Ettin reranker 17M | -4 owners | -3 owners | -2 owners | -0.1108 |
| Edge-ColBERT 32M | -5 owners | -9 owners | -1 owner | -0.1415 |

The detailed Edge-ColBERT 17M task and bootstrap analysis is recorded in
[Edge-ColBERT 17M tuning experiment](./edge-colbert-17m-tuning-experiment-2026-08-28.md).

## Runtime observations

Runtime measurements are secondary diagnostics from the same local CPU and
historical evaluation harness. They are not controlled production benchmarks.
There were 46 fusion-scored tasks; four additional tasks used the exact route
and did not invoke a reranker.

| Candidate | Model load | Warm p95 | Maximum task | Peak RSS | 2-second deadline misses |
| --- | ---: | ---: | ---: | ---: | ---: |
| Edge-ColBERT 17M | 948 ms | 1,423 ms | 1,994 ms | 750 MB | 0/46 |
| Edge-ColBERT 32M | 831 ms | 3,297 ms | 3,374 ms | 835 MB | 21/46 |
| Ettin reranker 17M | 634 ms | 14,587 ms | 15,184 ms | 2,594 MB | 46/46 |

Ettin's cross-encoder contract jointly processes every query-document pair.
That contract was much more expensive than token-level late interaction on
these depth-32 code packets in the tested ONNX CPU runtime.

## Model identities and disposition

| Model | Frozen revision | Benchmark status | Disposition |
| --- | --- | --- | --- |
| `lightonai/LateOn-Code-edge` | `07ef20f406c86badca122464808f4cac2f6e4b25` | Completed incumbent authority | Retain |
| `mixedbread-ai/mxbai-edge-colbert-v0-17m` | `592c6417c1c6687572043408ed1ae5196bce16b1` | Completed | Eliminate: below LateOn |
| `mixedbread-ai/mxbai-edge-colbert-v0-32m` | `bb13a29ec9b1e7edd4ba8f7a0776c48b55cbad66` | Completed | Eliminate: below 17M and LateOn; slower |
| `cross-encoder/ettin-reranker-17m-v1` | `9e4aa35321a6dd1a43ca313f500c4b4f7cfb5cc6` | Completed | Eliminate: below LateOn; runtime failure |
| `cross-encoder/ettin-reranker-32m-v1` | `b33e5ceb5110773ea9cf5e00c9bedc83a8c2afdd` | Incomplete | No ranking conclusion; not qualified |

The Ettin 32M scoring adapter was checked against the model card's Red Planet
example. It produced scores `[6.2069, 10.8194, 8.5481, 9.8597]` and the expected
document order `[1, 3, 2, 0]`. The full Satori run was stopped during the
second repository and did not write an aggregate result. These sanity data are
not a substitute for the missing ranking benchmark.

## Evaluation authority

- Satori evaluation revision: `057f7dd1c401cb7e5e1640b4921d645c8a0e687a`
- Candidate depth: 32
- Document projection: `search_rerank_document_v2`
- Repositories: GitNexus, Bookmark AI Organizer, Duas, VoxInfinity, RPC, and
  Edge TTS App
- Frozen tasks checked per completed candidate: 50
- Frozen document projections checked per completed candidate: 1,472
- Runtime: Node 24.19.0, Transformers.js 3.0.2, ONNX Runtime 1.19.2, CPU
- Query/document limits for late interaction: 256/2,048 tokens
- Query-document pair limit for Ettin: 2,048 tokens

Every completed candidate used identical selected candidate IDs and identical
projected document bytes. Only diagnostic rankings were compared when a task
exceeded the product deadline; deadline misses are reported separately above.

## Restrictions and interpretation

- Only the six frozen tuning repositories were used.
- Held-out repositories and held-out task results were not opened.
- No production provider, ranking policy, dependency, model asset, or runtime
  configuration changed.
- The archived ranking tooling was used as an exploratory evaluator, not as a
  current Satori release gate.
- The result supports keeping LateOn among the tested models. It does not prove
  held-out generalization or establish that no future reranker can improve on
  LateOn.

Models discussed but not run through this Satori benchmark—LightOn PW/LW,
Jina reranker v3.5, `all-MiniLM-L6-v2`, and
`potion-retrieval-32m-onnx`—remain screening-only entries in
[Reranker model fit for Satori](./reranker-model-fit-2026-08-28.md).
