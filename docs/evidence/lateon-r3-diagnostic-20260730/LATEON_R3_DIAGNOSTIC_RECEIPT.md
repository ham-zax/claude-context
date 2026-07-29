# LateOn C0/R3 diagnostic receipt

**Decision:** `retain_baseline_b_lateon_quality_directional_but_not_qualified_or_deployable`

**Date:** 2026-07-30

## Authority

The evaluation used the sealed tuning manifest:

```text
ca85f0f0142c64ef7e2a6fca615ba897aa8776475f113303f1c0981b87128445
```

No held-out repository, index, task, or result was created, queried, or opened.
No source was sent to a connected provider.

The immutable evidence archive is:

```text
docs/evidence/lateon-r3-diagnostic-20260730/lateon-r3-diagnostic-artifacts.tar.gz
SHA-256 f63ffc2b9d7b378bf099f79484d13712494424aa1eba39d0a6cbfb773b1bdb16
```

It contains the C0 reference/native result, six isolated tuning score
artifacts, twelve positive/negative neural replays, and the complete R3 result.
The artifacts contain candidate identities, projection digests, scores, and
rank transitions; they do not contain reconstructed source text.

The score artifacts bind clean tooling revision:

```text
ea35d7150e935c855ed445856e4902fe9900d43b
tree a297a1bd425eee96fbb7370201e021b82c6c5dae
```

The final evaluator binds clean tooling revision:

```text
a73a688d1e47d4c733ef4ff6c85d91099c7b0213
tree 759dd6f9b391b0eef1f2fcdd261266f9c5d8817d
```

The complete R3 result has canonical self-digest:

```text
93d6e6ed7ce289b6378a5f9617ff02f294e018b757bf8ea69c7f0332d228ab7c
```

## C0 model and runtime conformance

The frozen contract is
`evals/search-ranking/lateon/c0-contract.json`, SHA-256:

```text
698d865a35ef9219c7aadcbb850a947c907d46fc7f42abb38c6190b4c9991f2d
```

Checkpoint:

```text
lightonai/LateOn-Code-edge
revision 07ef20f406c86badca122464808f4cac2f6e4b25
Apache-2.0
```

The selected FP32 ONNX artifact:

```text
67,970,609 bytes
ac5a92a685512b163c3c591438f518379309d2a98c4818a9c6e2986f789dc8ef
```

matched the pinned PyLate 1.3.4 reference:

```text
token identities                    exact
retained token counts               exact
maximum vector absolute error       5.924989561340022e-7
maximum MaxSim score absolute error 1.3163751679812208e-6
repeat score absolute error         0
```

The published INT8 ONNX artifact was rejected. It did not reproduce the PyLate
vectors or MaxSim scores and collapsed the fixture scores near `14.998`.

The native C0 fixture passed its isolated model/runtime gates, but that small
fixture did not establish real-candidate deployability.

## Frozen diagnostic method

The diagnostic compared:

```text
B       current deterministic baseline
D-L16   LateOn over at most 16 eligible candidates
D-L32   LateOn over at most 32 eligible candidates
```

For every neural task, the scorer:

1. verified the pinned source revision and clean source worktree;
2. reconstructed persisted chunks through the production language analyzer and
   exact persisted chunk identity;
3. verified the captured rerank-document UTF-8 byte count;
4. used production projection `search_rerank_document_v1`;
5. used the production reranker family/candidate-pool order;
6. emitted projection digests rather than source;
7. replayed the neural order through production RRF composition, local scoring,
   grouping, diversity, and disclosure; and
8. required identity-equal candidate membership and eligibility.

Scores that exceeded the product deadline were retained only as
`diagnosticRanking`. The product `ranking` remained empty, `policyAffected`
remained false, and deterministic fallback remained mandatory.

Task authority:

```text
quality owner-survival tasks 19
negative-exposure tasks       6
exact-identifier controls     1
```

## Quality result

Repository-macro results:

| Metric | B | D-L16 | D-L32 |
| --- | ---: | ---: | ---: |
| owner at 1 | 0.2889 | 0.3306 | 0.3306 |
| owner at 3 | 0.3722 | 0.4944 | 0.4944 |
| owner at 10 | 0.5611 | 0.5611 | 0.6028 |
| reciprocal rank | 0.3602 | 0.4011 | 0.4174 |
| hard-negative exposure at 3 | 0 | 0 | 0 |

Measured deltas from `B`:

```text
D-L16 MRR delta       +0.040925925926
D-L16 owner@3 delta   +0.122222222222
D-L32 MRR delta       +0.057245370371
D-L32 owner@3 delta   +0.122222222222
D-L32 over D-L16 MRR  +0.016319444445
```

`D-L32` cleared the frozen `0.01` depth-effect threshold over `D-L16`.

The MRR gains were positive in all three repositories:

| Repository | D-L16 MRR delta | D-L32 MRR delta |
| --- | ---: | ---: |
| Satori | +0.0417 | +0.0573 |
| tradingview_ratio | +0.0394 | +0.0728 |
| Shopify theme | +0.0417 | +0.0417 |

The 97.5% repository-bootstrap MRR intervals excluded zero:

```text
D-L16 [0.039444444445, 0.041666666667]
D-L32 [0.041666666667, 0.072777777778]
```

However, neither contender passed every frozen quality gate. The owner-at-three
interval lower bound was `0` because Satori's repository-level owner-at-three
did not improve. This fails the preregistered strict-positive lower-bound rule
despite the positive macro delta.

Notable owner transitions:

```text
D-L16/D-L32 satori-entrypoint-intent-test 2 -> 1
D-L16       tradingview-lazy-map         9 -> 3
D-L32       tradingview-lazy-map         9 -> 2
D-L16/D-L32 shopify-recommendations      4 -> 2
D-L32       satori-final-score           absent -> 8

D-L16/D-L32 satori-finalization          2 -> 3
D-L16/D-L32 tradingview-root-cli         8 -> 10
```

All six hard-negative top-three exposures remained zero. Candidate membership,
eligibility, and the exact-identifier control remained identity-equal.

Quality conclusion:

```text
LateOn shows consistent directional MRR improvement.
D-L32 is the stronger diagnostic depth.
Neither depth is fully qualified under the frozen quality contract.
```

## Deployability result

Both depths failed the frozen WSL/offline resource contract:

| Gate | D-L16 | D-L32 | Frozen limit |
| --- | ---: | ---: | ---: |
| maximum measured peak RSS | 1,487,437,824 B | 1,500,053,504 B | 536,870,912 B |
| warm p95 | 2,749 ms | 6,016 ms | 750 / 1,500 ms |
| query deadline | failures | failures | 2,000 ms |

D-L16 cold times were `2,723–2,901 ms`, above the frozen `2,500 ms` limit.
D-L32 was slower and was not eligible to rescue D-L16.

The in-process JavaScript timer cannot preempt synchronous ONNX execution.
Deadline results therefore fail closed after the call: no late neural order is
eligible for product use.

Deployability conclusion:

```text
LateOn-Code-edge is not deployable under the current Satori WSL/offline
resource and deadline profile.
```

## Terminal plan decision

```text
quality diagnostic winner  D-L32
fully quality-qualified     no
resource-qualified          no
product policy              B
neural finalist             none
held-out opened             no
production changed          no
```

R4 finalist qualification and R5 held-out adjudication are closed because no
neural contender passed tuning admission. Opening held-out evidence cannot
change the product decision and would spend sealed evidence without an
admissible contender.

