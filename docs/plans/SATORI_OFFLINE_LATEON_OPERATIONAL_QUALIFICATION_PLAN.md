# Satori Offline LateOn Operational Qualification Plan

**Status:** O0 prospective authority being frozen. Held-out evidence is sealed
and the historical product policy remains baseline `B`.

**Date:** 2026-08-04

## 1. Boundary

This is an independent post-experiment engineering track:

```text
Track O — Offline LateOn operational qualification
```

The historical L3 result remains `baseline_b_retained` under its frozen
900-millisecond warm-p95 profile. Track O neither revises nor supersedes that
outcome. L3 selected no LateOn contender. Track O prospectively nominates its
strongest tuning arm, projection-v2 D32, as the sole operational and held-out
candidate for a distinct offline-quality service class:

```text
model          lightonai/LateOn-Code-edge
revision       07ef20f406c86badca122464808f4cac2f6e4b25
ONNX           FP32 ac5a92a685512b163c3c591438f518379309d2a98c4818a9c6e2986f789dc8ef
projection     search_rerank_document_v2
depth          32
admission      existing owner-diverse production policy
score policy   existing complete-order LateOn application
fallback       complete deterministic baseline B
```

Projection, depth, artifacts, tokenizer behavior, candidate admission, scoring,
thread policy, batch policy, benchmark tasks, and quality thresholds cannot
change within a named profile during Track O. D16 and D50 are not Track O or
held-out contenders.

O1 also exposes the already-observed projection-v2 D16 shape as the separately
identified disabled profile `lateon_projection_v2_d16_v1`. This is an operator
selection option, not an O3 contender, and it cannot inherit D32's operational
or held-out qualification. Selection is explicit before search; the runtime
never changes depth adaptively and never falls back from D32 to D16.

## 2. Evidence and metric provenance

Two earlier suites have different denominators:

| Evidence | Families | Baseline owner@3 | Baseline MRR | D32 owner@3 | D32 MRR |
| --- | ---: | ---: | ---: | ---: | ---: |
| Historical diagnostic suite | 3 | 0.3722 | 0.3602 | 0.4944 | 0.4174 |
| L3 decision-bearing tuning suite | 6 | 0.3611 | 0.2900 | 0.6389 | 0.5046 |

Track O uses the six-family L3 suite as tuning authority. It must never combine
or compare these point estimates as if they came from one task population.

## 3. O0 — prospective offline-quality service profile

Freeze this service profile before new operational measurements or held-out
outputs are opened:

| Contract | Frozen value |
| --- | ---: |
| Profile ID | `lateon_offline_quality_projection_v2_d32_v1` |
| Active reranks | 1 |
| Queued reranks | 1 |
| Maximum queue wait | 250 ms |
| Process-cold readiness p95 | 1,300 ms |
| Process-cold readiness maximum | 2,000 ms |
| Cold first-score maximum | 2,000 ms |
| Warm scoring p95 | 1,750 ms |
| Scoring hard maximum | 2,000 ms |
| Reranker-stage deadline including queue | 2,500 ms |
| Peak total-process RSS | 872,415,232 bytes (832 MiB) |
| Retained total-process RSS | 671,088,640 bytes (640 MiB) |
| Invalid or incomplete neural orders | 0 |
| Safety or identity failures | 0 |

The readiness and scoring limits are post-experiment engineering targets. The
1,300-millisecond readiness p95 and 1,750-millisecond warm p95 give about 25%
headroom over the observed L3 D32 values of 1,017 and 1,378 milliseconds. The
2,000-millisecond maxima preserve a hard bound without treating one harmless
readiness outlier as a failed user request. These targets do not retroactively
change the L3 result.

Model load is readiness work, not request work. The persistent worker loads and
verifies artifacts before it becomes ready. Searches arriving while the worker
is loading or unhealthy use baseline `B` immediately; they do not wait for
initialization.

The versioned profile binds these immutable scoring variables:

```text
profile schema and ID
projection identity and source digest
candidate depth                                      32
model/tokenizer/ONNX/runtime/loader artifact digests
worker processes                                      1
active model sessions                                 1
ONNX execution provider                               CPU
intra-op threads                                      8
inter-op threads                                      1
execution mode                                        sequential
graph optimization                                    all
query batch size                                      1
document batch size                                   1, encoded serially
tokenizer parallelism                                 disabled
query token limit                                     256
document token limit                                  2,048
aggregate request token limit                         65,792
padding                                               none for single-sequence inputs
truncation                                            right, longest suffix discarded
warmup requests                                       2
readiness, scoring, queue, and reranker-stage deadlines
active and queued capacities
memory envelope
fallback, cancellation, and shutdown policy
```

Projection, depth, artifacts, tokenizer behavior, admission, scoring, threads,
and batching are identity-bearing and cannot be overridden. An operator may
only reduce queue capacity, queue wait, scoring deadline, reranker-stage
deadline, or active capacity. Such an override changes the effective profile
identity used by diagnostics and ranked-set binding and may increase baseline
fallback; it cannot change neural scores or candidate membership.

## 4. O1 — disabled versioned implementation

Implement the frozen D32 profile and the separately identified D16 option; keep
both disabled by default.

1. Promote the already-frozen projection-v2 implementation into the production
   rerank-document owner without changing its bytes or policy.
2. Version the runtime protocol/profile for projection v2 with immutable named
   depth-16 and depth-32 profiles.
3. Verify the profile and every artifact before worker readiness.
4. Start model loading independently from ordinary search requests.
5. Replace the unbounded promise chain with one active slot and one bounded
   queued slot.
6. Include queue wait in the reranker-stage deadline. Queue saturation or a
   250-millisecond queue wait rejects neural work and preserves `B`.
7. Make timeout, cancellation, malformed output, crash, and shutdown
   transactional: no partial neural order may reach grouping or pagination.
8. Reject and drain queued/pending work on shutdown; leave no worker or live
   request promise.
9. Emit bounded operational reasons without source/model input:

```text
lateon_applied
lateon_not_ready
lateon_capacity_fallback
lateon_queue_timeout
lateon_execution_timeout
lateon_cancelled
lateon_invalid_output
lateon_worker_failure
```

Profile identity must remain part of the existing ranked-set binding.

The queued slot absorbs only short overlaps. Track O does not guarantee that
every concurrent offline-quality request receives LateOn. Capacity pressure
must prefer immediate deterministic fallback over queue accumulation. More
workers or concurrent model sessions require a separately measured profile.

## 5. O2 — operational qualification

O2 uses tuning artifacts only and runs in isolated processes. Freeze these
counts:

```text
real-model process-cold worker starts            30
real-model cold first-score requests             30
real-model warm D32 requests                    200
queue-saturation repetitions                    20
queued cancellation repetitions                 10
executing cancellation repetitions              10
active-plus-queued shutdown repetitions          10
malformed-output/worker-failure repetitions      10 each
```

`Process-cold` means a fresh worker process with no initialized model in that
process; Track O does not claim to clear the operating-system page cache. Worker
readiness ends only after artifact verification, tokenizer load, ONNX session
creation, and a validated ready identity. Cold first-score measures the first
D32 inference after readiness. Warm inference begins only after the two frozen
warmup requests.

The frozen L3 tuning authority contains 36 quality/control tasks. Thirty-four
produce a projection-v2 candidate set and are neural-eligible. The two
exact-registry controls `edge-tts-app-r0/edge-voice-options` and
`rpc-r0/rpc-strictness-config`
intentionally terminate before reranker admission; they remain required policy
controls but must not be given fabricated projections or neural calls.

The process-cold request is selected from the 34 neural-eligible requests using
the frozen tokenizer and truncation policy: highest aggregate retained token
count, then highest aggregate input-tensor bytes, then canonical request identity.
Projected UTF-8 size is not a selection criterion. The 200 warm observations
also schedule only these 34 requests, while O2 reconstruction and control
authority continues to cover all 36 tasks.

The 200 warm observations use a deterministic counterbalanced schedule:

```text
cycle 1     canonical repository/task order
cycle 2     reverse canonical order
later       canonical order with repository and task start offsets rotated by cycle
```

Warmup observations are excluded. P95 uses nearest rank
`sorted[ceil(0.95 * n) - 1]`. RSS is sampled every 25 milliseconds across the
parent and worker; retained RSS is observed after the queue becomes idle and a
1,000-millisecond cool-down, without explicit garbage collection. No slow,
failed, or timed-out observation may be selectively rerun or removed. Failure
and lifecycle scenarios use a controllable worker fixture; they do not repeat
expensive model inference to prove state-machine behavior.

O2 passes only when:

```text
exact frozen artifacts, projection, depth, and effective profile identity
zero process-cold load or artifact-verification failures
process-cold readiness p95 <= 1,300 ms and maximum <= 2,000 ms
cold first-score maximum <= 2,000 ms
warm p95 <= 1,750 ms and warm maximum <= 2,000 ms
reranker-stage maximum <= 2,500 ms including queue wait
peak/retained RSS within profile
zero incomplete or invalid applied orders
candidate membership and eligibility remain unchanged
canonical group membership and identity remain unchanged
LateOn may change only the complete final group order
pagination reproduces that final order with zero additional reranker calls
exact and must: controls retain their frozen behavior
every injected failure restores byte-identical baseline product result state:
membership, scores, relative order, grouping, and disclosure
zero leaked worker, pending request, queued entry, timer, or promise after close
```

Truthful bounded failure warnings and operational diagnostics may differ from
the baseline response. The reranker stage starts when the completed deterministic
baseline is offered to LateOn and ends when a complete validated LateOn order is
committed or fallback occurs; retrieval latency is outside this bound.

Stop with a failure receipt on the first identity or safety mismatch. Aggregate
latency/resource misses are evaluated only after the frozen observation counts
complete.

## 6. O3 — one held-out opening

Held-out remains sealed until O2 passes. The decision-bearing authority is:

```text
manifest                 evals/search-ranking/cross-repository-v3.manifest.json
manifest canonical seal  05fb273715d6205bcdf5adc1fdec94a892d8b40fc651a386ab36ccfb9475b7bc
manifest file SHA-256     281c5354d98c42e8d576e607de50046230e7d31ca4059a6d77d89e7454b1db09
independent families      6
manifest quality-owner tasks 36
decision-bearing quality tasks 35
protocol-excluded task    promptready-primary-action
negative controls         12
safety controls           3: exact_identifier, must, configuration_pin
oracle reviewers          local_source_oracle_review_2026_07_30
                          local_source_oracle_review_2026_08_03
```

The manifest binds every task ID, query digest, required owner, acceptable
alternative, hard negative, source revision, source blob, and publication
authority. Before reading any held-out task payload, a Track O opening authority
must validate the opaque manifest file and canonical seal, O0 authority, a
passing O2 receipt, the D32 profile/artifact identities, and absence of an
earlier opening marker. It must then atomically create and fsync a durable
write-once opening record. Failure after that point consumes the opening and
cannot be retried.

Before O2 measurement, an isolated read-only implementation lane accidentally
printed the record for `promptready-primary-action`. The lane was stopped before
editing and did not communicate the task payload or oracle to the scorer,
adjudicator, or primary implementation lane. No model output or ranking result
was opened. That task is nevertheless excluded from every O3 decision metric;
it remains only a bound protocol-incident record. The remaining 35 quality
tasks, all 12 negative tasks, and all three safety controls retain decision
authority. Thresholds, aggregation, and uncertainty rules are unchanged.

After that exclusion was sealed, one synthetic tooling test process parsed the
manifest before failing on an unrelated historical capture-artifact digest, and
one structural search reported only manifest field names and line locations.
Neither operation emitted or exposed a task query, owner oracle, source payload,
model output, aggregate metric, or ranking result. This is recorded as automated
pre-open structural access with no decision-bearing exclusion: no human or
implementation lane received new task evidence, and the already-frozen
candidate, thresholds, aggregation, and task authorities remain unchanged.

A candidate-capture digest cannot exist before task materialization. After the
opening is consumed, O3 may materialize the held-out tasks and capture. The O3
receipt must bind the resulting index, publication, capture, replay, score, and
evaluator digests before evaluating or reporting aggregate quality. Low-level
capture, replay, and score entrypoints must reject held-out or mixed-split work
without the exact opening record; tuning-only behavior remains unchanged.

Held-out compares exactly D32 against B using the frozen manifest formulas:

```text
paired unit                         task
aggregation                         metric within repository, then unweighted repository mean
uncertainty                         deterministic repository-cluster percentile bootstrap
resamples                           10,000
seed                                manifest canonical seal
confidence interval                 two-sided 95% (one prospectively nominated candidate)
minimum owner-at-three improvement  +0.05 with lower bound > 0
minimum macro-MRR improvement        +0.03 with lower bound > 0
owner-at-one margin                 -0.02
owner-at-ten margin                 -0.01
hard-negative exposure-at-three     no more than +0.02
unacceptable-owner exposure-at-three no more than +0.02
exact/must/config/membership/eligibility/fallback/pagination failures  0
```

An interval that does not establish every improvement and protected margin is
`offline_lateon_insufficient_held_out_evidence`, not a pass. The 95% interval is
prospectively selected because O3 tests one candidate, rather than choosing
among the four L3 arms.

Open held-out exactly once with D32, projection v2, artifacts, admission, score
application, grouping, fallback, quality thresholds, and negative-exposure
thresholds frozen.

Held-out answers only:

> Does the D32 tuning improvement reproduce on unseen repositories and tasks
> without safety or negative-exposure regression?

Do not select among D16/D32/D50, change excerpts, or revise thresholds after
held-out output is visible. A failure retains `B` for every service profile.

## 7. O4 — profile-scoped activation

Held-out success permits a separate activation decision; it does not itself
change defaults.

```text
offline-quality profile
    -> D32 preferred
    -> B on not-ready, capacity, timeout, cancellation, invalid output, or failure

fast/balanced profiles
    -> B remains default
```

An activation receipt must bind target hardware, default scope, exact profile,
fallback, rollback, resource envelope, source-free telemetry, and a production
canary. Universal offline activation is outside Track O.

## 8. Stage receipts and terminal outcomes

Successive evidence is recorded separately:

```text
O2_OPERATIONAL_QUALIFICATION_RECEIPT
O3_HELD_OUT_ADJUDICATION_RECEIPT
O4_ACTIVATION_DECISION_RECEIPT
```

Terminal Track O outcomes are:

```text
offline_lateon_profile_activated
offline_lateon_held_out_qualified_retained_disabled
offline_lateon_operationally_qualified_held_out_not_authorized
offline_lateon_rejected_for_identity
offline_lateon_rejected_for_safety
offline_lateon_rejected_for_resources
offline_lateon_rejected_by_held_out
offline_lateon_insufficient_held_out_evidence
```

Track O is complete when it has a terminal receipt. Historical Track L remains
unchanged regardless of the Track O outcome.
