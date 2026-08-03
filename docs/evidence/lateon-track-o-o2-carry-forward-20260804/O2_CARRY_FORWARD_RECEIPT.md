# Track O D32-v2 O2 carry-forward receipt

**Date:** 2026-08-04  
**Stage:** O2 carry-forward  
**Result:** `offline_lateon_o2_carry_forward_passed`

This receipt carries the original passing D32-v2 operational qualification
across the post-O2 freshness and capture-proof corrections. It does not reopen
O3, create a new model result, qualify held-out evidence, or authorize O4.

## Authority and revision binding

| Item | Immutable identity |
| --- | --- |
| Original O2 source revision | `07fba989b73d11c4f0446210a16cc1232713a2e4` |
| Original O2 source Git tree | `0d54897bd7b3e6fb8338c1b83d80f165b40e9771` |
| Current revision | `daae615992dea1225f7bd70591a264b9b03899ac` |
| Current Git tree | `967e0111271dc9822839746b87de240222299d9b` |
| Original O2 receipt | `/home/hamza/repo/satori-track-o-o2-v2-20260804-thab79/o2-receipt.json` |
| O2 receipt file SHA-256 | `8eb27428c07a764fe84f700b847f6032c1471cacf98acffd4072ff6e953f38f4` |
| O2 receipt result SHA-256 | `de3c693c2461d11ede5f0ffa8ea410e4fbabe0053d87b43e52707b2f4d92fde4` |
| Original O2 evidence | `/home/hamza/repo/satori-track-o-o2-v2-20260804-thab79/o2-evidence.json` |
| O2 evidence file SHA-256 | `68e4cae255a33758cd4ce0e862fe30b363949a5f682d95072a993cbab4b7c9a3` |
| O2 evidence result SHA-256 | `37eded0b501509cb6b79365d4afcbd1d49fd612fc2a801c580ad4883621d4b42` |
| O2 authority SHA-256 | `337201db7c1d0e2b5281104f3a1ad7a6f406dfb9c006cfccc4864bc1c42a0526` |
| O2 manifest canonical seal | `05fb273715d6205bcdf5adc1fdec94a892d8b40fc651a386ab36ccfb9475b7bc` |

The original O2 receipt and evidence both have valid canonical self-digests and
remain `passed`. The current revision is a descendant of the qualified source
revision; no historical commit or sealed receipt was amended.

## D32-v2 identity carried forward

| Identity | Bound value |
| --- | --- |
| Profile | `lateon_offline_quality_projection_v2_d32_v2` |
| Profile file SHA-256 | `5987f5fe649cb69d1d6a4bdd91c8dfc5c01ee08507ce1cbe5194fe72fc13ec84` |
| Profile canonical SHA-256 | `ca6c68abe40e4f4ac6309afd8402c9904aa56cc8c482de8668c9db35147b431d` |
| Candidate | `projection-v2-d-l32` |
| Candidate depth | `32` |
| Projection | `search_rerank_document_v2` |
| Projection SHA-256 | `635b0a683b2a1c7dec8b6f0822f21e750724d5d4d18503eee112c4dbd242d687` |
| Model | `lightonai/LateOn-Code-edge@07ef20f406c86badca122464808f4cac2f6e4b25` |
| ONNX FP32 SHA-256 | `ac5a92a685512b163c3c591438f518379309d2a98c4818a9c6e2986f789dc8ef` |
| Tokenizer SHA-256 | `a388b94942e98e5c661c6c23f919842285738bfd123a0d148dea0c56287505d0` |
| Tokenizer config SHA-256 | `1621afee1f3dbc2c42901841ca46016c83102a8e070d32b90f80f80b214172a4` |
| ONNX config SHA-256 | `fa4fef89820dcdc33c5504c62c1d5efc19603cfbfebf02368a70d51a4dbe6651` |
| Special-token map SHA-256 | `6edfb9d64c0d7e5cbaa53516e90280fe1f42ba5ea7923d005a5f9b6e082142cf` |
| Provider | ONNX Runtime CPU; one worker, one active model session |
| Runtime identity | intra-op 8, inter-op 1, sequential execution, graph optimization `all`, document batch 1, tokenizer parallelism disabled |

The current worktree still matches every O2 model, tokenizer, projection,
runtime, worker, measurement, evidence-derivation, and replay-owner digest
recorded by the passing O2 receipt. The changed fallback regression test is
test-only and is listed in the delta below.

## Immutable tuning reconstruction and replay

The audit used only the recorded Track L tuning artifacts; it did not read or
query the consumed held-out workspace and did not run model inference.

| Artifact | Binding |
| --- | --- |
| Capture authority | `/home/hamza/repo/satori-track-l-0c8f535e/artifacts/capture-authority-05fb2737.json` |
| Capture authority file SHA-256 | `0da2dec2e05874c08158a6c75bb46f63bf4fe4ff667c8a085fd4fb5b2229b5f8` |
| Capture manifest seal | `05fb273715d6205bcdf5adc1fdec94a892d8b40fc651a386ab36ccfb9475b7bc` |
| Aggregate capture SHA-256 | `0e425bbf16fe3dec61767399b46b69bbe6204aa8f638f62c88b46c3317672b9` |
| Immutable Track L archive | `docs/evidence/deep-lateon-l3-20260804/deep-lateon-l3-artifacts.tar.gz` |
| Track L archive SHA-256 | `71faba8d308c239e9e49b029b363957662288ec1470876b2c9c796256fb168b1` |
| D32 replay root | `/home/hamza/repo/satori-track-l-0c8f535e/replay-final-05fb2737` |
| Replay verification digest | `9ab5675f173e0104d22cd62c5cd6effb2280eed66b20f4050009eb247ec0b301` |

The deterministic replay audit established:

* all 36 frozen quality/control tasks were present in the six-repository
  tuning authority;
* all 34 neural-eligible tasks had the exact recorded D32-v2 candidate
  permutation and finite recorded neural scores;
* all recorded neural candidates were admitted from the frozen candidate set;
* candidate-membership and eligibility invariants were true for every replay;
* the two exact-registry policy controls remained non-neural and unchanged;
* the two separate safety controls remained exact-registry controls with their
  candidate and eligibility invariants;
* every replay's recorded disclosure order matched its recorded pagination
  order, initial disclosure, page offsets, and page size; and
* every replay recorded zero additional reranker calls during continuation.

The six D32 replay file digests are:

| Repository | Recorded D32 replay SHA-256 |
| --- | --- |
| `bookmark-ai-organizer-r0` | `02f383ec8a097d9de40085b70280f8f9ff5745e03d6286a839fd9acd35cc2216` |
| `duas-r0` | `41acdb40e6a1a9131ae3fbdc32f93f08d89ea49bd2d4199991b77a2fba6cffa0` |
| `edge-tts-app-r0` | `633b468a6a2ccf0d7da7ed01d0475c60ccb85f39fbf1b1650f6fdb110ad4f9f3` |
| `gitnexus-r0` | `f55442c1ddc978e8276e462d4afaa0e52b33aa2f60773eca5d3dd9cf8eb9e7d3` |
| `rpc-r0` | `2430fec7dcd93d698349d79a2a1288d55ed264761c2c467791de927e9b3072ea` |
| `vox-infinity-r0` | `dd472e5c3a941f2f0b27308198e6d91bf0243c431886d38bd15d5b4031b5493f` |

## Post-O2 delta audit

The complete descendant range is:

```text
03f12c8  fix(search): measure pageable cache values as JSON
9a40ff8  fix(evals): accept checkpoint-bound cold proofs
d38b76f  fix(search): reuse watcher-disabled status proofs
f8a3793  fix(evals): accept fully compared prepared-cold proofs
013e56c  fix(evals): accept checkpoint-revalidated warm proofs
23b2e7d  chore(evals): identify measured freshness mutations
78071da  fix(search): compare complete source before fallback sync
a2b6026  fix(evals): validate checkpoint-backed readiness phases
207229a  fix(evals): accept source-compared capture isolation
8c6f79a  fix(search): refresh exact-path readiness diagnostics
daae615  docs(search): close consumed Track O opening
```

The production delta is limited to freshness/cache accounting and final
readiness diagnostics:

* `SyncManager` now performs a complete source-to-checkpoint comparison before
  a watcher-unavailable fallback can skip publication, preserving genuine drift
  detection while allowing a proven unchanged source to reuse the publication.
* The handler binds the resulting proof and refreshes exact-path readiness
  diagnostics after the final source barrier.
* Recorder and capture validators accept only complete checkpoint-bound,
  source-compared freshness proofs. The JSON-semantic cache-size correction in
  `03f12c8` is included as capture/pagination accounting infrastructure; it
  changes admissibility measurement, not search candidates or scores.
* Tests changed in the range are lifecycle, cache-accounting, recorder,
  capture, and readiness regression evidence.
* `daae615` changes only the Track O plan and protocol-failure receipt.

The following scoring and runtime inputs are byte-identical between the
original O2 revision and the current revision:

```text
packages/mcp/src/core/search-rerank-document-v2.ts
packages/mcp/src/core/search-rerank-policy.ts
packages/mcp/src/core/search-execution.ts
packages/mcp/src/core/search-finalization.ts
packages/mcp/src/server/lateon-reranker.ts
scripts/satori-captured-rerank-projection-v2.mjs
scripts/satori-lateon-track-o-o2.mjs
scripts/satori-lateon-track-o-o2-fixture-worker.cjs
scripts/satori-lateon-track-o-o2-evidence.mjs
scripts/satori-search-candidate-replay.mjs
```

Consequently, the delta does not change model or tokenizer inputs, projection
bytes, candidate membership, eligibility, neural scores, neural order, score
application, grouping, final disclosure order, pagination, profile limits,
worker protocol, concurrency, queueing, cancellation, or fallback behavior.

## Verification and disposition

Focused lifecycle and replay verification passed at the current revision:

```text
watcher-disabled unchanged-source lifecycle proof       passed
source drift / ignore drift / checkpoint mismatch paths  passed
exact-path readiness final-barrier regression             passed
36-task reconstruction                                   passed
34-task recorded D32 replay                               passed
candidate and eligibility identity checks                 passed
neural/group/disclosure/pagination order checks            passed
```

This is a non-scoring carry-forward. D32-v2 operational qualification is
retained through the verified delta. It does not create a quality decision:
O3 was consumed without a valid decision, D32 remains disabled and not
held-out-qualified, D16 remains unqualified, O4 remains unauthorized, and
baseline `B` remains the production policy.
