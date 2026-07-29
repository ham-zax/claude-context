# Corrected baseline and R2 ranking receipt

Date: 2026-07-30 (Asia/Shanghai)

## Verdict

The remaining `satori-final-score` retrieval miss is fixed. The corrected
baseline retains all 20 expected owners in the eligible candidate set, with
zero hard misses. `satori-final-score` moved from absent to local rank 28
without increasing retrieval or disclosure limits.

The corrected R2 experiment selected no deterministic contender:

* keep baseline `B`;
* do not globally neutralize path scoring (`B-P0`);
* keep the bounded entrypoint-owner contribution (`B-A0` demonstrated that
  removing it loses the `qap` owner from the disclosed top ten); and
* route the remaining eligible-but-low-ranked owners to C0/R3 qualification.

Held-out repositories and tasks remained sealed. Neural reranking, LateOn,
dependencies, production policy, and production activation remained
untouched.

## Corrective implementation

The bounded repair is split across these semantic commits:

```text
33b8433  fix(search): project symbol terms for semantic retrieval
5b952c6  fix(evals): accept completed reindex publications
ff7b2f1  fix(search): retain technical lexical terms
a909b56  fix(search): preserve lexical query breadth
591f13d  fix(search): deduplicate owners before arm fusion
eb134b6  fix(evals): replay owner-level arm fusion
```

The retrieval changes:

* add normalized symbol components to the versioned embedding projection;
* retain identifier-shaped compounds before the existing lexical-term cap;
* retain whole query concepts before additive identifier fragments; and
* assign RRF arm ranks after repeated chunks belonging to the same canonical
  symbol/file owner are removed.

No query-specific exception, candidate-depth increase, result-limit increase,
new ranking weight, or dependency was added.

## Corrected baseline authority

```text
task manifest seal:
  ca85f0f0142c64ef7e2a6fca615ba897aa8776475f113303f1c0981b87128445
task manifest artifact SHA-256:
  79ef96256f6af0300fb84edc76b75bd28596e0a36284e78fe8d4f10edff03d30
corrected baseline archive:
  docs/evidence/corrected-ranking-baseline-20260730/corrected-baseline-artifacts.tar.gz
corrected baseline archive SHA-256:
  30c1c4f54602a39e20593d4dac2779ef104b60fd68fbc59679cae01fa35c55ce
embedding projection:
  embedding_projection_v3
```

The three isolated publications were:

| Repository | Collection |
| --- | --- |
| Satori | `hybrid_code_chunks_5794f5ff__gen_run_2f932bc5_9f5a_4632_b4a8_d2be551da319` |
| tradingview_ratio | `hybrid_code_chunks_c1f69457__gen_run_20d89c63_60a6_4c6f_9a17_fa9fbf2b8a31` |
| noor-and-knot-shopify | `hybrid_code_chunks_e8d4482f__gen_run_b5df5291_3e44_400a_bde0_c72a46311369` |

All 20 positive and six negative tasks completed cold/warm capture under the
published-index runtime. Every capture passed:

```text
--require-replay-ready
--require-grouping-ready
--require-neural-disabled
```

All six positive/negative capture pairs reproduced candidate membership,
eligibility removals, scores, grouping, and disclosed order exactly.

## Retrieval outcome

| Metric | Corrected baseline |
| --- | ---: |
| Positive tasks | 20 |
| Owner survival | 20 |
| Hard misses | 0 |
| Owner top three | 9 |
| Non-exact R2 quality tasks | 19 |
| Negative-exposure tasks | 6 |
| Exact controls | 1 |

For `satori-final-score`, the successive evidence was:

```text
old embedding projection:
  dense rank 158; absent from product union
symbol-term projection:
  dense rank 118
technical whole-term fallback:
  fallback lexical rank 70
owner-level arm fusion:
  eligible candidate; final local rank 28
```

The repair removes the retrieval miss; it does not claim that rank 28 is good
final ordering.

## Corrected R2 authority

The frozen policies remained:

```text
B:
  captured path and owner components
B-P0:
  path contribution neutralized
B-A0:
  entrypoint-owner contribution disabled
```

```text
policy seal canonical SHA-256:
  5f39cfba4316f01db243becab147491451ae8d2d9219030897dd715650d755c6
policy seal artifact SHA-256:
  aea868f67022762e7eeeee8d1aea502a83c035e88339c61df271efb18efb12ac
result canonical SHA-256:
  a39c08ae24f60a2e77c046ad811ec5dd58058c459963e2fab8497a7e3d000441
result artifact SHA-256:
  077a2e40fecfab3ee1d10e634167f68681bc11aeb500f723c9546f7dc2129e43
R2 archive:
  docs/evidence/corrected-ranking-r2-20260730/corrected-r2-artifacts.tar.gz
R2 archive SHA-256:
  b3d5ad99550c5f5b9565613b5714f028ce2baa78e1bce401cf98e427b6deff4c
```

The evaluator ran twice with byte-identical output. It used 19 quality tasks,
six negative tasks, one exact control, 10,000 deterministic
repository-cluster resamples, and 97.5% intervals.

One reporting-only correction occurred after the first result: the evaluator
still emitted the obsolete constant of five excluded hard misses. The
corrected evaluator derives this value from the frozen baseline and reports
zero. Policy bytes, replay outputs, metrics, gates, and selection did not
change. The version-4 policy seal records this sequencing explicitly.

## R2 result

Baseline repository-macro quality:

| Metric | `B` |
| --- | ---: |
| Owner at 1 | 0.288889 |
| Owner at 3 | 0.372222 |
| Owner at 10 | 0.561111 |
| Reciprocal rank | 0.360185 |
| Hard-negative exposure at 3 | 0 |

### `B-P0`

Neutral path scoring increased macro reciprocal rank by `0.045833`, but its
97.5% interval was `[-0.0375, 0.175]`. Owner-at-three improved by only
`0.025`, with interval `[-0.125, 0.2]`.

It failed:

* owner-at-three improvement;
* reciprocal-rank improvement; and
* disclosed-list safety, with 14 unrelated membership changes.

Candidate membership, eligibility, exact-control identity, and hard-negative
exposure remained safe. The result does not support globally removing path
preference.

### `B-A0`

Owner evidence was active in this corrected baseline. The
`tradingview-qap-owner` capture reported:

```text
status:
  resolved
declared/resolved owners:
  1 / 1
resolution complete:
  true
baseline B owner rank:
  1
B-A0 owner rank:
  absent from disclosed top 10
```

Disabling owner evidence reduced repository-macro owner-at-one,
owner-at-three, owner-at-ten, and reciprocal rank by `0.066667`. It failed
the owner-at-one and owner-at-ten non-inferiority gates. It produced no
candidate-membership, eligibility, exact-control, negative-exposure, or
unrelated disclosed-membership failure.

This is bounded evidence that the authoritative owner component is useful for
the declared-command case. It is not evidence for a broader global authority
boost.

## Selection and routing

```text
selected deterministic policy:
  none
production baseline:
  B
remaining non-exact owners below top three:
  11
next authorized phase:
  C0 offline reranker qualification, followed by R3 only if C0 passes
held-out status:
  sealed
```

The corrected R2 result establishes an eligible-candidate ordering residual.
It does not authorize LateOn integration, a production policy change, held-out
access, or activation.
