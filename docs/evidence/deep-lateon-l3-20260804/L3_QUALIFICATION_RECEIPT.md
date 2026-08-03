# Deep LateOn L3 qualification receipt

**Decision:** `baseline_b_retained`

**Quality conclusion:** every new arm cleared the frozen tuning-quality gates;
`projection-v2-d-l32` produced the strongest macro owner-at-three and reciprocal-rank
result.

**Deployability conclusion:** no arm cleared the frozen local WSL CPU resource
profile, so no contender was selected, held-out evidence remained sealed, and
baseline `B` remains the product policy.

**Date:** 2026-08-04

## Authority and evidence

| Item | Identity |
| --- | --- |
| Final manifest seal | `05fb273715d6205bcdf5adc1fdec94a892d8b40fc651a386ab36ccfb9475b7bc` |
| Final manifest file SHA-256 | `281c5354d98c42e8d576e607de50046230e7d31ca4059a6d77d89e7454b1db09` |
| Pinned evaluator revision | `d2c8bbac55757fd36bdf89c25304581ed27d18c8` |
| Pinned evaluator tree | `5f064056552c219d4e1c9963c82253e178e9c3a4` |
| Capture aggregate SHA-256 | `0e425bbf16fe3fdec61767399b46b69bbe6204aa8f638f62c88b46c3317672b9` |
| Final result canonical SHA-256 | `a339320e3acd60429125fa3ea988066ad40df901ccc236a1ae5650f4ecef8273` |
| Final result file SHA-256 | `cbe2b429f6b3a4825eab4cfa922e94d4f157f1e4e5d7c9ba56cc087c27462c62` |
| Final score-rebinding receipt | `17668773c64353a475066be3ab1c12e057193cba360a85c9b4e9a0323442b459` |
| Evidence archive SHA-256 | `71faba8d308c239e9e49b029b363957662288ec1470876b2c9c796256fb168b1` |

The immutable evidence archive is:

```text
docs/evidence/deep-lateon-l3-20260804/deep-lateon-l3-artifacts.tar.gz
```

It contains the sealed manifest, capture authority, 24 score artifacts, 48
positive/negative neural replays, the complete result with every disclosed-list
transition, and the two evaluator-only score-authority rebinding receipts. It
does not contain reconstructed source text.

No held-out repository, index, capture, task, score, or result was created,
queried, or opened. No production ranking policy or activation setting changed.

## Frozen method

The six tuning repositories were weighted by repository-macro aggregation:

```text
gitnexus-r0
bookmark-ai-organizer-r0
duas-r0
vox-infinity-r0
rpc-r0
edge-tts-app-r0
```

GitNexus is one independent benchmark family, not a Satori dependency or donor.
It has the same macro weight as each other repository.

The comparison used 36 owner-quality tasks, 12 negative-exposure tasks, and the
three frozen exact, `must:`, and configuration controls. Candidate membership,
eligibility, grouping, disclosure, and continuation were replayed from immutable
captures. Neural inference did not run during replay or pagination.

The four new preregistered arms were:

```text
projection-v1-d-l50
projection-v2-d-l16
projection-v2-d-l32
projection-v2-d-l50
```

The checkpoint remained `lightonai/LateOn-Code-edge` at revision
`07ef20f406c86badca122464808f4cac2f6e4b25`, using the pinned FP32 ONNX artifact
and the frozen query, projection, owner-family admission, runtime, and resource
profiles.

## Evaluator corrections and score reuse

The first aggregate evaluation attempts stopped transactionally and emitted no
decision because they exposed two generic evaluator-contract defects:

1. compact baseline negative tasks did not retain full replay candidate arrays;
   their hard-negative ranks must be derived from the authoritative capture;
2. visible first-page membership changes were incorrectly treated as frozen-set
   membership failures, although reranking is expected to move an already-frozen
   candidate into or out of the first page.

The final evaluator retains all disclosed membership changes and complete rank
diffs as diagnostics. Its zero-failure safety gate covers the actual invariants:
complete candidate membership and eligibility, exact/configuration controls,
and frozen pagination.

The model was not executed again after either evaluator-only correction. A
fail-closed rebinding tool verified that the old and new manifests were
identity-equal after removing only evaluator identity and its source revision/tree,
and that capture authority changed only by manifest binding. It then updated the
24 signed score envelopes and emitted old-to-new digest mappings. Model outputs,
resource observations, candidate identities, projections, and scores remained
unchanged.

## Quality result

Repository-macro results:

| Policy | owner at 1 | owner at 3 | owner at 10 | MRR | hard-negative exposure at 3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline `B` | 0.1944 | 0.3611 | 0.5000 | 0.2900 | 0 |
| projection v1, depth 50 | 0.3611 | 0.6111 | 0.6944 | 0.4931 | 0 |
| projection v2, depth 16 | 0.3611 | 0.6111 | 0.6944 | 0.4838 | 0 |
| projection v2, depth 32 | **0.3889** | **0.6389** | **0.6944** | **0.5046** | 0 |
| projection v2, depth 50 | **0.3889** | 0.6111 | 0.6667 | 0.4854 | 0 |

Measured deltas from baseline:

| Arm | owner-at-three delta | MRR delta | owner-at-three interval | MRR interval |
| --- | ---: | ---: | --- | --- |
| projection v1, depth 50 | +0.2500 | +0.2030 | `[0.1667, 0.3889]` | `[0.1271, 0.2873]` |
| projection v2, depth 16 | +0.2500 | +0.1938 | `[0.0833, 0.4167]` | `[0.0991, 0.2829]` |
| projection v2, depth 32 | **+0.2778** | **+0.2146** | `[0.1667, 0.4167]` | `[0.1106, 0.3102]` |
| projection v2, depth 50 | +0.2500 | +0.1954 | `[0.1667, 0.3333]` | `[0.1014, 0.2815]` |

Every arm passed all frozen quality gates:

```text
owner-at-three practical improvement
reciprocal-rank practical improvement
owner-at-one non-inferiority
owner-at-ten non-inferiority
negative-exposure non-inferiority
zero-failure safety
```

For every arm, complete candidate membership and eligibility remained identical,
all query controls passed, frozen pagination passed, hard-negative exposure at
three remained zero, and continuation recorded zero additional reranker calls.
First-page membership changed on 39–41 tasks as an expected consequence of
reranking; the archive retains every addition, removal, and rank transition.

Quality conclusion:

```text
LateOn materially improves the frozen tuning ranking matrix.
Projection v2 at depth 32 is the strongest observed quality arm.
Depth 50 does not improve on depth 32 and is not justified by quality.
```

## Deployability result

The frozen local WSL CPU profile required:

```text
model load       <= 1,000 ms
warm p95         <=   900 ms
request deadline <= 2,000 ms with zero deadline failures
peak RSS         <=   832 MiB
retained RSS     <=   640 MiB
```

| Arm | max model load | warm p95 | peak RSS | retained RSS | deadline failures |
| --- | ---: | ---: | ---: | ---: | ---: |
| projection v1, depth 50 | 633 ms | 1,427 ms | 686 MiB | 533 MiB | 1 |
| projection v2, depth 16 | 1,083 ms | **1,014 ms** | 705 MiB | **482 MiB** | **0** |
| projection v2, depth 32 | 1,017 ms | 1,378 ms | 713 MiB | 516 MiB | **0** |
| projection v2, depth 50 | 658 ms | 1,910 ms | 726 MiB | 525 MiB | 2 |

All arms met both memory ceilings. None met every frozen latency, model-load,
deadline, and scorer-qualification gate. Projection v2 at depth 16 was the
closest deployable shape, but its observed warm p95 exceeded the preregistered
limit by about 13% and its maximum model load exceeded the limit by about 8%.
Those limits cannot be loosened after inspecting contender output without making
the decision post-hoc.

Deployability conclusion:

```text
No new arm is deployable under the frozen target profile.
```

## Terminal decision

```text
Track L outcome          baseline_b_retained
quality winner           projection-v2-d-l32
selected contender       none
product policy           B
held-out opened          false
production activated     false
```

Because no contender was product-admissible, L4/L5 did not open and no disabled
candidate was promoted into a production-selection path. A future deployment
profile experiment would require a new prospective authority; this receipt must
not be reinterpreted by adjusting its limits after the fact.
