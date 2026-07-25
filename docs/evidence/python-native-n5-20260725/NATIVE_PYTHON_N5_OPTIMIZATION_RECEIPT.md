# Native Python N5 performance-salvage receipt

Outcome: `native_python_product_budget_review_required`

N5 used the two permitted optimization iterations and stopped. It did not
change supported semantics, authority rules, compatibility versions, public
behavior, frozen negatives, or the target repository.

## Identity

| Item | Value |
|---|---|
| Checkpoint baseline | `074bed62f723e8b04ec36f3467417cba632687ae` |
| N5 input candidate | `35cc98c45928eed3eaebe1028dca3f390388417e` |
| N5 input evidence | `c199f259677c0b6e0964d328f4cecba0e03e9705` |
| Optimized code commit | `b6a7cb17395ad7fedf9021bdee2fb07d40d68356` |
| Candidate branch | `candidate/native-python-l4-20260725` |
| Candidate worktree | `/home/hamza/repo/satori-worktrees/native-python-l4-20260725` |
| Baseline worktree | `/home/hamza/repo/satori-worktrees/native-python-l4-baseline-20260725-01` |
| Frozen target | `/home/hamza/repo/tradingview_ratio@8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` |
| Task-owned target | `/tmp/satori-native-python-l4-target-20260725-lbEBpS` |
| Node / pnpm | `v24.13.0` / `10.28.2` |

N5 changed only:

```text
packages/core/src/navigation/query.ts
packages/core/src/navigation/store.ts
packages/core/src/relationships/builder.ts
packages/core/src/symbols/sidecar.ts
```

The candidate worktree was clean at the input evidence commit. No unrelated
staged, unstaged, or untracked file was staged or changed.

## Immutable correctness result

The optimized candidate produced the same canonical output twice:

```text
Python files: 279
symbols: 3311
relationship records: 4977
ResolutionClaims: 14876
relationship digest:
  6b0167425bf7abd85d5b8d9e607178dab327327f028449e498d1c65a7f5bb81c
claim digest:
  efbc54f93d7936968679a5c5a825342ce14e068f737721aa0a13a77a27fbed32
incremental/full digest:
  2a26f16a38ab5a28d6022db220ff689713850313b48863ba51686e75cbd6176f
full/incremental equality: true
```

The values are byte-identical to the pre-N5 qualified candidate. Therefore the
six required callers, all previously classified valid additional callers,
exact symbol IDs and spans, zero wrong authoritative callers, and all frozen
negative classifications are unchanged.

Compatibility also remains unchanged:

```text
RELATIONSHIP_BUILDER_VERSION:
  relationship-v9+python-constructor-receivers+python-native-resolution-v1
RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION:
  relationship_file_contribution_v4
RELATIONSHIP_MANIFEST_SCHEMA_VERSION:
  relationship_v2
old checkpoint evidence:
  structured requires_reindex due relationshipVersion mismatch
new sidecar restart:
  accepted
```

No legacy, ambiguous, unsupported, dynamic, name-only, or suffix-only evidence
was admitted as authoritative `CALLS`.

## Optimization iterations

| Measurement | N5 input | Iteration 1 | Iteration 2 |
|---|---:|---:|---:|
| Relationship-stage median | 582.164 ms | 227.567 ms | 164.173 ms |
| One-file relationship delta median | 303.400 ms | 156.134 ms | 60.180 ms |
| Inbound traversal median | 498.175 ms | 475.234 ms | 0.052 ms |
| Frozen-harness peak RSS | 612,904 KiB | 550,548 KiB | 493,536 KiB |

From the N5 input to iteration 2:

```text
relationship stage: -71.80%
one-file delta:     -80.16%
inbound traversal:  -99.99%
peak RSS:           -19.48%
```

Iteration 1 removed quadratic build-local array/set copying and precomputed
class closure and reverse runtime receiver types. Iteration 2:

```text
one suffix index per Python environment/file-set identity
one serialization pass per v4 relationship shard and manifest
bounded relationship-shard write concurrency (8)
generation-and-manifest-bound relationship state reuse
one prepared support/outgoing/incoming index per loaded records array
```

Published generation directories are immutable. Cache reuse requires both an
explicit generation ID and expected symbol-registry manifest hash; failures
are not cached and a new generation replaces the prior root entry.

## Profile breakdown

The same target, machine, Node version, harness, warmup policy, and package
build mode were used for the baseline and candidate.

The final profiled candidate stage timings were:

| Boundary | Elapsed |
|---|---:|
| Fact extraction | 2,741.421 ms |
| Relationship stage | 286.242 ms |
| One-file delta | 109.167 ms |
| Serialization and sidecar publication | 2,225.207 ms |
| Sidecar load and reverse-index preparation | 556.766 ms |
| Warm reverse traversal | 0.288 ms |

Inspector sampling adds overhead, so frozen medians—not profiled elapsed
times—are used for acceptance gates. Within the profiled relationship stage:

| Owner | CPU self | Sampled allocation |
|---|---:|---:|
| Module/environment index | 12.794 ms (3.68%) | 2.99 MB (2.50%) |
| Inheritance expansion | 3.342 ms (0.96%) | 1.02 MB (0.85%) |
| Origin-flow resolution | 88.649 ms (25.51%) | 19.91 MB (16.67%) |
| Claim construction | 38.262 ms (11.01%) | 17.95 MB (15.03%) |
| Certification/deduplication | 16.430 ms (4.73%) | 2.89 MB (2.42%) |
| Proof retention | 0.370 ms (0.11%) | 0.20 MB (0.17%) |

Serialization/digest work accounted for 243.897 ms of sampled CPU and 82.95 MB
of sampled allocations. Cold sidecar validation accounted for 193.074 ms of
sampled CPU and 45.78 MB. Once loaded, reverse adjacency traversal allocated no
sampled bytes in the profiled operation.

Profile artifacts:

```text
/tmp/satori-native-n5-profiles-US739Z
/tmp/satori-native-n5-iteration2-stage.json
/tmp/satori-native-n5-iteration2-relationship-profile.json
/tmp/satori-native-n5-iteration2-delta-profile.json
/tmp/satori-native-n5-iteration2-serialization-profile.json
/tmp/satori-native-n5-iteration2-load-profile.json
/tmp/satori-native-n5-iteration2-traversal-profile.json
```

Harness SHA-256 values:

```text
53c05196f613ce2489b644b2137b046207722f3c7df15dd845e6f065900431f8
  /tmp/satori-native-l4-performance-harness.mjs
90adb9e80d32d61f409f66e5e2373edd3c6a40bf10266968762f55cc40ac5a43
  /tmp/satori-native-n5-stage-profile-harness.mjs
a6ab1defe460b11259eb539c8aff27be8b1dcb38b190d650a0c530cf54da51f1
  /tmp/satori-native-n5-profile-summary.mjs
008af710e8a9340d318caac5e74640cf677b379fa9a3ccbc67d6a40464e27c2f
  /tmp/satori-native-n5-product-perf.mjs
```

## Frozen gate decision

| Gate | Baseline | Candidate | Limit | Result |
|---|---:|---:|---:|---|
| Relationship median | 26.473 ms | 164.173 ms | 31.768 ms | fail |
| Peak RSS | 317,096 KiB | 493,536 KiB | 382,632 KiB | fail |
| One-file delta | 14.046 ms | 60.180 ms | 64.046 ms | pass |
| Inbound traversal | 166.119 ms | 0.052 ms | 182.730 ms | pass |

The relationship stage remains 6.20x the checkpoint stage and RSS remains
172.30 MiB above checkpoint. Those relative gates cannot be declared passed.
The checkpoint does not retain the 14,876 claims, ordered proofs, dependency
keys, v4 contributions, or authoritative reverse projection, so the product
impact was also measured rather than treating the relative result as an
operational verdict.

## Product impact

Fresh candidate MCP state:

```text
state: /tmp/satori-native-n5-candidate-mcp-state-i01Duh
LanceDB: /tmp/satori-native-n5-candidate-mcp-lance-NhVLyR
Core entry SHA-256:
  44eb799f1ccdb475b409e804884f0a310d9081adaacbf3fa761f2a595482bc7e
MCP entry SHA-256:
  56553b127ac28ec9d2d951ed2e7e942795e1ecb6bfc761812208751c14185823
runtime relationship fingerprint: 31fb32be5862
files/chunks: 1519 / 19741
symbols/relationships: 14824 / 27732
completion marker: published
status: ready
restart status: ready
```

Fresh product comparison:

| Measurement | Baseline | Candidate | Difference |
|---|---:|---:|---:|
| Internal total reindex | 80.570 s | 86.630 s | +7.52% |
| Navigation phase | 10.949 s | 15.157 s | +38.43% |
| Client lifecycle wall time | 108.24 s | 118.08 s | +9.09% |
| Fresh-process max RSS | 1,191,732 KiB | 1,193,456 KiB | +1.68 MiB |

Candidate repeated product measurements:

```text
one-file explicit sync (6 completed samples):
  p50 = 3,183.201 ms
  p95 = 6,397.715 ms
  every response: added=0, removed=0, modified=1, phase=completed

call_graph depth=1 (20 measured samples):
  p50 = 10.537 ms
  p95 = 606.067 ms
  steady state after each target is prepared: approximately 9.7–12.3 ms
  the p95 includes two cold target loads after restart

MCP process RSS:
  idle = 151.81 MiB
  sampled peak during repeated sync = 1,482.76 MiB
```

The checkpoint comparator completed only two repeated sync samples
(3,695.681 ms and 2,167.449 ms) and then failed with:

```text
prepared source generation changed before publication
```

That is preserved as comparative evidence; it was not hidden, retried with a
tuned baseline, or used to invent a checkpoint p50/p95. The candidate completed
all six identical operations. The checkpoint's partial sampled peak
(1,086,943,232 bytes) is not a valid lower operational bound because the run
terminated before the repeated sequence completed.

## Real MCP witness after optimization and incremental restore

The candidate-built process used:

```json
{"action":"reindex","path":"/tmp/satori-native-python-l4-target-20260725-lbEBpS"}
{"action":"status","path":"/tmp/satori-native-python-l4-target-20260725-lbEBpS","detail":"full"}
```

For each target it then used:

```json
{
  "path":"/tmp/satori-native-python-l4-target-20260725-lbEBpS",
  "symbolRef":{"file":"<exact file>","symbolId":"<exact instance ID>"},
  "direction":"callers",
  "depth":3,
  "limit":100
}
```

After fresh publication, restart, six explicit one-file syncs including exact
source restoration, and another restart, the public projection returned:

| Target | Exact target ID | Direct authoritative callers | Required production spans |
|---|---|---:|---|
| `SignalGenerator.check_entry` | `syminst_db0684c3f6f05b6df0addc5c3cb17e8e` | 34 | `opportunity_ranker.py:256–261`; `pair_evaluator.py:738–743`; `trading_core.py:675–682` |
| `_evaluate_residual_type_invariant` | `syminst_5aaccd6ad2e7203a385dbce56e6a9861` | 2 | `gate_coordinator.py:475`; `phases.py:129` |
| `SignalLedger.record` | `syminst_10e3a141c4858369056b1655a60bb999` | 17 | `signal_recording.py:435–462` plus the previously validated exact callers |

The direct caller sets are identical to the pre-N5 receipt. All additional
callers retain their prior valid classifications; no wrong or unexplained
authoritative edge appeared.

The probe file was restored byte-for-byte:

```text
task-owned materialization SHA-256:
  7d0a0a452889b4d78edc4594bc09c5c62b5f9a1ff72eeba5c734a0c9b048293a
original target worktree SHA-256:
  7d0a0a452889b4d78edc4594bc09c5c62b5f9a1ff72eeba5c734a0c9b048293a
```

## Verification

| Command/check | Result |
|---|---|
| Focused relationship/navigation/sidecar/language/compatibility tests | 162 pass, 0 fail |
| Complete Core package | 592 pass, 3 fail, 1 skip |
| Complete MCP package | 1047 pass, 0 fail |
| Core typecheck | exit 0 |
| MCP typecheck | exit 0 |
| Owned-file ESLint | exit 0 |
| Core build | exit 0 |
| MCP build | exit 0 |
| `git diff --check` | exit 0 |
| Two clean deterministic harness runs | identical relationship/claim/delta digests |
| Fresh candidate MCP publication | exit 0, completion marker, ready |
| Restart and sidecar reload | exit 0, ready, same caller sets |
| Post-incremental-restore restart | exit 0, ready, same caller sets |

The three Core failures exactly reproduce the checkpoint baseline by test name
and assertion/failure class:

```text
Context bounds deferred atomic publication generations without pruning active authority
  assert.ok(vectorDatabase.queryCalls.length > 0)
Context completion validation propagates transient and unavailable payload probes
  Missing expected rejection
Context receipt-driven generation proof reuses activation authority and single-flights cold validation
  0 !== 1
```

## Decision

N5 cannot return `native_python_performance_pass` because two original relative
gates still fail. It does not return `native_python_performance_unviable`
because correctness remains fully qualified, optimization was substantial,
fresh total reindex increased only 7.52%, fresh-process max RSS changed by only
1.68 MiB, completed one-file sync is measured in seconds, and steady-state
call-graph traversal is measured in milliseconds.

The sealed terminal outcome is:

```text
native_python_product_budget_review_required
```

An owner must now accept or reject explicit absolute budgets for the added
semantic contract. N5 does not loosen the frozen gates and does not perform a
third optimization iteration.

## Git preservation proof

Candidate before evidence files:

```text
## candidate/native-python-l4-20260725
```

Original target initial and final status:

```text
## main...origin/main [ahead 1]
 M opencode.jsonc
?? cc.json
```

The original target worktree and its existing staged, unstaged, and untracked
state were not modified.
