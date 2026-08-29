# Edge-ColBERT 17M tuning experiment

Date: 2026-08-28

Status: exploratory tuning result; not a release or quality gate.

## Conclusion

`mixedbread-ai/mxbai-edge-colbert-v0-17m` is technically compatible with
Satori's depth-32 late-interaction path and improves the frozen no-reranker
baseline. It does not beat `lightonai/LateOn-Code-edge` on this tuning set.
LateOn retains the stronger owner-ranking result.

## Ranking results

The quality stratum contains 36 owner-discovery tasks across six repository
families. The negative stratum contains 12 tasks.

| Model | Owner@1 | Owner@3 | Owner@10 | MRR | Negative exposure@3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| No-reranker baseline | 7/36 (0.1944) | 13/36 (0.3611) | 18/36 (0.5000) | 0.2900 | 0/12 |
| LateOn-Code-edge D32 | 14/36 (0.3889) | 23/36 (0.6389) | 25/36 (0.6944) | 0.5046 | 0/12 |
| Edge-ColBERT 17M D32 | 11/36 (0.3056) | 20/36 (0.5556) | 24/36 (0.6667) | 0.4253 | 0/12 |

Edge-ColBERT versus the baseline:

- Owner@1: +0.1111
- Owner@3: +0.1944
- Owner@10: +0.1667
- MRR: +0.1353

Edge-ColBERT versus LateOn D32:

- Owner@1: -0.0833, or three fewer first-place owners
- Owner@3: -0.0833, or three fewer owners in the top three
- Owner@10: -0.0278, or one fewer owner in the top ten
- MRR: -0.0793

The 98.75% deterministic repository-cluster bootstrap intervals were:

| Metric | Edge minus baseline | Edge minus LateOn D32 |
| --- | ---: | ---: |
| Owner@1 | [0.0000, 0.2500] | [-0.2222, 0.0000] |
| Owner@3 | [0.0833, 0.3056] | [-0.1667, 0.0000] |
| Owner@10 | [0.0278, 0.3056] | [-0.1111, 0.0000] |
| MRR | [0.0327, 0.2558] | [-0.1407, -0.0247] |

The MRR interval is entirely below zero against LateOn. On direct expected-owner
rank, Edge-ColBERT was better on 2 tasks, LateOn was better on 7, and 27 tied.
Edge-ColBERT's wins were `gitnexus-heritage` (rank 3 versus 6) and
`rpc-extension-entry` (rank 1 versus 2).

## Repository breakdown

Each cell is `Owner@1 / Owner@3 / Owner@10 / MRR`.

| Repository | Edge-ColBERT 17M | LateOn D32 |
| --- | --- | --- |
| GitNexus | 0.000 / 0.333 / 0.500 / 0.172 | 0.333 / 0.333 / 0.500 / 0.361 |
| Bookmark AI Organizer | 0.500 / 0.500 / 0.667 / 0.528 | 0.500 / 0.500 / 0.667 / 0.528 |
| Duas | 0.167 / 0.667 / 0.833 / 0.361 | 0.167 / 0.833 / 0.833 / 0.389 |
| VoxInfinity | 0.167 / 0.500 / 0.500 / 0.333 | 0.333 / 0.500 / 0.500 / 0.417 |
| RPC | 0.333 / 0.500 / 0.667 / 0.407 | 0.333 / 0.667 / 0.667 / 0.500 |
| Edge TTS App | 0.667 / 0.833 / 0.833 / 0.750 | 0.667 / 1.000 / 1.000 / 0.833 |

## Experimental authority

- Model: `mixedbread-ai/mxbai-edge-colbert-v0-17m`
- Model revision: `592c6417c1c6687572043408ed1ae5196bce16b1`
- FP32 ONNX SHA-256: `a2fb3ad410f1b68479caa31e9d6821213050ef25804cb9a3c9ba963e72503f46`
- Satori evaluation revision: `057f7dd1c401cb7e5e1640b4921d645c8a0e687a`
- Candidate depth: 32
- Document projection: `search_rerank_document_v2`
- Query/document token limits: 256/2048
- Runtime: Node 24.19.0, Transformers.js 3.0.2, ONNX Runtime 1.19.2, CPU
- Frozen tasks verified: 50
- Frozen document projections verified byte-for-byte by digest: 1,472
- Signed raw result SHA-256: `ad0b4d0ed6a2db731dd3d9d165f7b7e13ee49002d86d37c5544475e973af02b2`

The raw experimental result was generated at
`/tmp/satori-edge-colbert-17m-592c6417/edge-colbert-17m-tuning-result.json`.
Its canonical self-digest was verified after generation.

## Secondary runtime observation

The full tuning process loaded the model in 948 ms. Warm depth-32 p95 was
1,423 ms, peak RSS was 750 MB, and no request crossed the 2,000 ms deadline.
These measurements are diagnostic because the run used the historical
evaluation harness and a shared local machine; they do not change the ranking
conclusion.

## Restrictions

- Only the six frozen tuning repositories were used.
- Held-out repositories and held-out task results were not opened.
- No production provider, ranking policy, dependency, or runtime asset changed.
- Archived ranking tooling was used only as an exploratory evaluator, not as a
  current Satori release gate.
