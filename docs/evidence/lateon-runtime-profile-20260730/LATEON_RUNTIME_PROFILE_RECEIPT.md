# LateOn local WSL runtime profile receipt

**Decision:** `admit_lateon_d16_for_production_implementation`

**Date:** 2026-07-30

## Scope

This experiment replaced the earlier assumed 512 MiB profile with measurements
from the actual local WSL host. No candidate identity, projection, score
composition, ranking oracle, or quality metric changed.

The selected model remains:

```text
lightonai/LateOn-Code-edge
revision 07ef20f406c86badca122464808f4cac2f6e4b25
FP32 ONNX ac5a92a685512b163c3c591438f518379309d2a98c4818a9c6e2986f789dc8ef
Apache-2.0
```

The versioned measured profile is:

```text
evals/search-ranking/lateon/local-wsl-runtime-profile-v1.json
SHA-256 86ee8fbcffcfabbdb06cdb524dbdf16a8501bf4e7fba51199f9368b48aa08faf
```

The immutable artifact archive is:

```text
docs/evidence/lateon-runtime-profile-20260730/lateon-runtime-profile-artifacts.tar.gz
SHA-256 9f28d8ea275e214c753554ba68f0e8eb9848e7fe0d66c4ecd3791904380d6d6b
```

It contains only contracts and score/measurement artifacts. Reconstructed
source text is not retained.

## Model choice

Three model classes were considered:

| Model | Decision | Reason |
| --- | --- | --- |
| LateOn-Code-edge | selected | Apache-2.0, 17M code-specific late-interaction model, already demonstrated positive Satori MRR |
| Jina Reranker v2 | diagnostic only | 278M cross-encoder with code retrieval support, but repository weights are CC-BY-NC-4.0 and therefore unsuitable as an unrestricted bundled production default |
| Zerank-1-small | rejected for local default | Apache-2.0 but 1.7B parameters and 32k context place it in a server/GPU resource class |

Primary source captures:

```text
Jina    Khiip 01KYS8JANMKEPM2RNEFB8WDMHQ
Zerank  Khiip 01KYS8JC69BVD5C8Q7F5QG40TP
LateOn  Khiip 01KYQWQMVC09KG1ZPAMTF9EQFE
```

## Padding diagnosis

The first qualification encoded all 16 documents in one padded batch.
Production projections vary substantially in token length, so every document
was padded to the longest candidate. The resulting tensor amplification—not
the 17M model weights—caused most of the latency and peak memory.

The same `tradingview-qap-owner` candidate set was scored in isolated
processes:

| Document batch size | Score time | Peak process RSS |
| ---: | ---: | ---: |
| 1 | 1,457 ms | 570,290,176 B |
| 2 | 1,813 ms | 580,935,680 B |
| 4 | 2,090 ms | 692,211,712 B |
| 8 | 2,450 ms | 759,435,264 B |
| 16 | 2,874 ms | 1,043,787,776 B |

All five runs produced byte-identical ranking orders and scores.

Batch size `1` is therefore selected. This is not a smaller quality surface;
it performs the same sixteen document encodings without cross-document
padding.

## CPU thread selection

With document batch size `1`:

| Intra-op threads | Score time | Peak process RSS |
| ---: | ---: | ---: |
| 1 | 1,392 ms | 544,518,144 B |
| 2 | 820 ms | 546,349,056 B |
| 4 | 660 ms | 545,419,264 B |
| 8 | 640 ms | 552,890,368 B |

The host has eight physical cores and sixteen logical CPUs. Eight intra-op
threads are selected because they produced the lowest measured latency with
only a small RSS difference. Inter-op threads remain `1`.

## Complete D-L16 measurement

The selected configuration was run over all 25 frozen fusion tasks across:

```text
satori-r0
tradingview-r0
shopify-theme-r0
```

Results:

```text
model load maximum      604.616 ms
score p50               388.154 ms
score p95               683.496 ms
score maximum           686.696 ms
peak process RSS        648,372,224 B
retained process RSS    529,059,840 B
model-load RSS delta    157,036,544 B
deadline failures       0
```

The optimized run was compared with the earlier qualified D-L16 artifacts:

```text
candidate scores compared          400
maximum absolute score difference  0
ranking order mismatches           0
```

Quality therefore remains:

```text
baseline macro MRR       0.360185185185
LateOn D-L16 macro MRR   0.401111111111
MRR delta               +0.040925925926
baseline owner@3         0.372222222222
LateOn D-L16 owner@3     0.494444444444
hard-negative exposure@3 0
```

Candidate membership, eligibility, and exact-identifier behavior remain
identity-equal.

## Limits derived after measurement

The profile values are derived mechanically from the measured maxima:

| Limit | Value | Derivation |
| --- | ---: | --- |
| Model load | 1,000 ms | measured maximum × 1.5, rounded to 100 ms |
| Warm p95 | 900 ms | measured p95 × 1.25, rounded to 100 ms |
| Request deadline | 2,000 ms | `(maximum load + maximum score) × 1.5`, rounded to 500 ms |
| Peak process RSS | 872,415,232 B (832 MiB) | measured peak × 1.25, rounded to 64 MiB |
| Retained process RSS | 671,088,640 B (640 MiB) | measured retained × 1.25, rounded to 64 MiB |

These values are qualification and default-profile evidence. Production must
load them through a versioned configuration owner and permit explicit operator
override; they must not be duplicated as unrelated code constants.

## Production entry conditions

Production implementation may proceed with:

```text
candidate depth       16
document batch        1
intra-op threads      8
inter-op threads      1
execution provider    CPU
projection            search_rerank_document_v1
fallback              complete deterministic baseline
```

ONNX execution must run outside the MCP process. Synchronous Node ONNX work
cannot be safely interrupted by an in-process timer. Worker isolation is
required so timeout, crash, or unavailable model preserves the complete
baseline order and cannot destabilize the MCP server.

