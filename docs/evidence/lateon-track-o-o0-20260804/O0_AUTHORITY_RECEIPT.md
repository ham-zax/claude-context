# Track O offline LateOn O0 authority receipt

**Status:** `o0_authority_sealed_implementation_unopened`

**Date:** 2026-08-04

## Prospective authority seal

```text
authority revision
    6666604c46b28f7c81374109d9f1d60178a85507

authority tree
    254165bc402912b3bd31e544f62a6861b3376ece

initial Track O contract revision
    c15f09bce7ea823014c951498527bedb3781e359

Track O plan
    docs/plans/SATORI_OFFLINE_LATEON_OPERATIONAL_QUALIFICATION_PLAN.md

Track O plan SHA-256
    dd900296a02f80a58f921121e9e93b55139d9c2f12fa635f452a1e2c34711569

O0 executable authority
    evals/search-ranking/lateon/offline-quality-d32-v1.authority.json

O0 executable authority SHA-256
    b1db9ac92597ce625746b2812f294afa99b0d4f6d00a2b2e321e3a976c0d30b2
```

No O2 measurement or held-out access occurred before this O0 revision was
committed and sealed. O1 and O2 must run from later clean committed revisions
that retain this authority unchanged and bind their implementation artifacts in
their own receipts.

## Historical authority preserved

```text
L3 receipt SHA-256
    05661b8d86c328a18a9710c8510bfed924670af54f7032ddfed66c3378a8daee

L3 artifact archive SHA-256
    71faba8d308c239e9e49b029b363957662288ec1470876b2c9c796256fb168b1

L3 aggregate tuning-capture SHA-256
    0e425bbf16fe3fdec61767399b46b69bbe6204aa8f638f62c88b46c3317672b9

historical runtime receipt SHA-256
    c0d023835cf2a45b434659e26d7c80fdc4eee04c78b6138993de7632e95bc0ff

historical L3 outcome
    baseline_b_retained

historical selected contender
    none
```

L3 selected no LateOn contender because none passed its historical
900-millisecond warm-p95 service profile. Track O prospectively nominates
projection-v2 D32 for a different offline-quality service class; it does not
rewrite or supersede L3.

## Candidate and artifact authority

```text
Track O candidate                     projection-v2-d-l32
service class                         offline_quality
model revision                        lightonai/LateOn-Code-edge@07ef20f406c86badca122464808f4cac2f6e4b25
ONNX FP32 SHA-256                      ac5a92a685512b163c3c591438f518379309d2a98c4818a9c6e2986f789dc8ef
tokenizer SHA-256                      a388b94942e98e5c661c6c23f919842285738bfd123a0d148dea0c56287505d0
tokenizer-config SHA-256               1621afee1f3dbc2c42901841ca46016c83102a8e070d32b90f80f80b214172a4
ONNX-config SHA-256                    fa4fef89820dcdc33c5504c62c1d5efc19603cfbfebf02368a70d51a4dbe6651
special-tokens SHA-256                 6edfb9d64c0d7e5cbaa53516e90280fe1f42ba5ea7923d005a5f9b6e082142cf
projection-v2 source SHA-256           635b0a683b2a1c7dec8b6f0822f21e750724d5d4d18503eee112c4dbd242d687
owner-admission source SHA-256          fe8fd56e4d50eedf2bbec9edf5a80b94b32cfc9778c121584bd9667b0931d6b5
LateOn loader source SHA-256            9f1195d5c67b5c19e01cee079508c2affde4e23c5d0a4388243af5641a5d1fdc
L3 scorer source SHA-256                eb06c31decefcbbac7af418b37e7af917feca5544fb073b3c51f864f30c522d2
L3 evaluator source SHA-256             b88a06995b32c323eca1d8f0c4a402256ff6b89785a689cab31091f9f1715d09
candidate capture source SHA-256        d19ff4f062b4685cecded77567e8725ac5e948e5fe86c6028a7c02e037c45111
candidate replay source SHA-256         5a05bb8fa25fef55f0374ddf1964ab481824526f2f8df06d6fd15e6ff0e40d29
candidate score source SHA-256          b790ec7b8e29778dd17e666f47b49fa16a3d9d96c6c95a6f567a13f9c861cf5c
dependency lockfile SHA-256             35293d291cab8f0529329ae40fba1807f7604b835142dfdfd52c01a506d2a51a
```

The separately selectable `lateon_projection_v2_d16_v1` profile is a disabled
operator option. It is not the Track O or held-out candidate and cannot inherit
D32 qualification. D32 never falls back to D16 automatically; any failure
restores baseline `B`.

## Decision-bearing manifest authority

```text
manifest path
    evals/search-ranking/cross-repository-v3.manifest.json

manifest version
    3

canonical seal SHA-256
    05fb273715d6205bcdf5adc1fdec94a892d8b40fc651a386ab36ccfb9475b7bc

file SHA-256
    281c5354d98c42e8d576e607de50046230e7d31ca4059a6d77d89e7454b1db09

held-out oracle authority SHA-256
    e12c50759ee0c703657a4c71daaa08c6635e781368c3e4d24bb0b617ef39830a

held-out negative authority SHA-256
    69f00e7968785168e6d429aa2dfb596aedd907a8e1b07bce51698c6d5704c8ab

held-out safety-control authority SHA-256
    26b7409e020dab22089a7f878e46a4b5dc05753301da8a78aded8934abdeb4cc
```

The held-out authority contains six independent repository families, 36
quality-owner tasks, 12 negative tasks, and the exact controls
`prompt-library-state-exact-control`, `portfolio-page-items-must-control`, and
`supply-fastapi-configuration-control`. Its oracle reviewers are
`local_source_oracle_review_2026_07_30` and
`local_source_oracle_review_2026_08_03`.

Before reading a held-out task payload, O3 must validate the opaque manifest
file/seal, this O0 authority, a passing O2 receipt, and D32's effective profile
and artifact identities, then atomically create and fsync a durable write-once
opening record. A failed opening remains consumed and cannot be retried. The
capture cannot exist before task materialization; the post-opening O3 receipt
must bind the resulting index, publication, capture, replay, score, and evaluator
digests before adjudication.

## Frozen operational profile

```text
profile ID                              lateon_offline_quality_projection_v2_d32_v1
worker processes                        1
active model sessions                   1
candidate depth                         32
execution provider                      CPU
intra-op threads                        8
inter-op threads                        1
execution mode                          sequential
graph optimization                      all
query/document batch size               1 / 1, documents encoded serially
tokenizer parallelism                   disabled
query/document token limit              256 / 2,048
aggregate request token limit            65,792
padding                                 none for single-sequence inputs
truncation                              right
warmup requests                         2
active/queued reranks                   1 / 1
maximum queue wait                      250 ms
process-cold readiness p95              1,300 ms
process-cold readiness maximum          2,000 ms
cold first-score maximum                2,000 ms
warm scoring p95                        1,750 ms
scoring hard maximum                    2,000 ms
reranker-stage deadline                 2,500 ms including queue wait
peak total-process RSS                  872,415,232 bytes
retained total-process RSS              671,088,640 bytes
incomplete/invalid neural orders        0
safety/identity failures                0
```

Projection, depth, model/tokenizer behavior, admission, scoring, threads, and
batching cannot be overridden. An operator may only reduce capacity or deadline
bounds. Every override produces a derived effective profile identity and may
increase baseline fallback without changing neural scoring.

## Target deployment class

```text
CPU                         AMD Ryzen 7 3800X 8-Core Processor
physical/logical cores      8 / 16
RAM                         8,325,328,896 bytes
Windows                     10.0.26200.8875
WSL                         2.7.10.0
WSL kernel                  6.18.33.2-2
Node                        24.13.0
Python                      3.12.3
ONNX Runtime Node           1.19.2
Transformers.js             3.0.2
power mode                  not observable from WSL; not decision-bearing
```

`Process-cold` means a new worker without model initialization in that process;
the OS page cache is not forcibly cleared.

## Frozen O2 method

```text
process-cold worker starts                    30
cold first-score requests                     30
warm D32 requests                            200
queue-saturation repetitions                  20
queued cancellation repetitions               10
executing cancellation repetitions            10
active-plus-queued shutdown repetitions        10
malformed-output repetitions                   10
worker-failure repetitions                     10
```

The request is selected by aggregate retained token count, then aggregate input
tensor bytes, then canonical identity. The warm schedule is canonical, reverse,
then rotated by repository/task offsets. P95 uses nearest rank. RSS is sampled
every 25 milliseconds; retained RSS is read after an idle 1,000-millisecond
cool-down without explicit garbage collection. Warmups are excluded, and slow,
failed, or timed-out observations cannot be selectively rerun.

## Frozen O3 decision

O3 compares only D32 against `B`. It uses 10,000 deterministic
repository-cluster percentile bootstrap resamples, the manifest seal as seed,
and a two-sided 95% interval for this single prospectively nominated candidate.
A pass requires both a `+0.05` owner-at-three improvement and `+0.03` macro-MRR
improvement with lower bounds above zero, owner-at-one and owner-at-ten
non-inferiority margins of `-0.02` and `-0.01`, exposure deltas no worse than
`+0.02`, and zero exact, `must:`, configuration, membership, eligibility,
fallback, or pagination failures. Otherwise the result is rejection or
`offline_lateon_insufficient_held_out_evidence`; thresholds cannot change after
the opening.

## Unopened state

```text
O2 measurement opened                  false
held-out index created or queried      false
held-out capture created               false
held-out scores opened                 false
production default changed             false
offline-quality profile activated      false
```

O2, O3, and O4 require separate receipts. An O2 pass is not an O3 or activation
decision.
