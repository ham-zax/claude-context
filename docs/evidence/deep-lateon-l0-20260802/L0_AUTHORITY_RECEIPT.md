# Track L/L0 deep LateOn authority receipt

Terminal outcome: `authority_frozen_outputs_unopened`

Authority date: 2026-08-03 (Asia/Shanghai)

## Decision and boundary

The expanded cross-repository authority, LateOn projection policies, contender
family, execution order, statistical contract, and absolute resource profile are
frozen at L0. Baseline B remains the product default and decision baseline.

This receipt does not qualify or activate LateOn, change production ranking, create
or query a held-out index, create a new candidate capture, open held-out results,
run the model, score contenders, or select a winner. No production source changed.

Track P/P2 is a satisfied prerequisite: its terminal outcome is
`pagination_complete_frozen_set_qualified`. The upstream receipt is
`docs/evidence/deep-pagination-p2-20260802/P2_QUALIFICATION_RECEIPT.md`, with file
SHA-256 `23a1efa2f76991aeecbb3d1e717c3117fafd39369187afb5e258cf49a55e3bda`.

## Frozen authority

| Item | Frozen value |
| --- | --- |
| Implementation commit | `87d313d03e97c013858d4a83c467f2289d8819d5` |
| Implementation tree | `aef885032550253f9a0e2498c32bc19c602b9eda` |
| Pinned L0 source revision | `1209de56723671eaabbc041a40a95df761760860` |
| Pinned L0 source tree | `7edd68e8a1ee2589b8b54b297c577315e3e8d5c0` |
| Version 3 authority | `evals/search-ranking/cross-repository-v3.manifest.json` |
| Version 3 internal canonical seal | `72bd15767140f60d936028c4dfa07238aec1d1452ecec01f6fdd6c10aac510a5` |
| Version 3 file SHA-256 | `0288095e7579f13fc99cc9ece1c536715d4a613735260b60f0d1e1c8c262be99` |
| Preserved version 2 internal seal | `ca85f0f0142c64ef7e2a6fca615ba897aa8776475f113303f1c0981b87128445` |
| Preserved version 2 file SHA-256 | `79ef96256f6af0300fb84edc76b75bd28596e0a36284e78fe8d4f10edff03d30` |

The builder reads Satori authority artifacts from the pinned Git object, and reads
each external repository's source and oracle evidence from its pinned revision with
`git show`. It does not use external working-tree source bytes. For every one of the
12 decision-bearing repositories, generation verified the configured origin, current
`HEAD`, pinned revision, Git tree, source-tree digest, required and alternative
owners, hard-negative owners, evidence symbols, query digest, and source blob digest.

## Decision-bearing corpus

Each repository contributes exactly six positive owner tasks and two negative
exposure tasks.

| Split | Independent families | Tasks | Positive | Negative |
| --- | ---: | ---: | ---: | ---: |
| tuning | 6 | 48 | 36 | 12 |
| held-out | 6 | 48 | 36 | 12 |

The tuning families are `gitnexus`, `bookmark_ai_organizer`, `duas`,
`vox_infinity`, `rpc_learner_engine`, and `edge_tts_app`. The held-out families are
`promptready`, `fastcontext`, `recovery_dashboard`,
`ai_studio_prompt_library`, `portfolio`, and `supply_chain_api`.

The new oracle review identity is
`local_source_oracle_review_2026_08_03`. Retained held-out oracles preserve their
earlier sealed reviewer identity. Exact-identifier, literal `must:`, and
configuration queries are present as decision-bearing controls.

The former Satori, TradingView Ratio, and Noor & Knot Shopify families are absent
from the decision-bearing repositories. They are sealed only as prior decision
evidence, together with the prior LateOn tuning, owner-score calibration, and
implementation-fixture categories. Repository family, revision, task ID, and query
digest overlap against this prior evidence is rejected by validation.

The neural-training-overlap review is `suspected_overlap`: these repositories are
public, while the pinned checkpoint does not disclose an authoritative training
corpus, so training overlap cannot honestly be excluded before scoring.

## Known LateOn authority

The prior decision remains
`retain_baseline_b_lateon_quality_directional_but_not_qualified_or_deployable`.
Its canonical result digest is
`93d6e6ed7ce289b6378a5f9617ff02f294e018b757bf8ea69c7f0332d228ab7c`.

| Known artifact | SHA-256 |
| --- | --- |
| `docs/evidence/lateon-r3-diagnostic-20260730/lateon-r3-diagnostic-artifacts.tar.gz` | `f63ffc2b9d7b378bf099f79484d13712494424aa1eba39d0a6cbfb773b1bdb16` |
| `docs/evidence/lateon-runtime-profile-20260730/lateon-runtime-profile-artifacts.tar.gz` | `9f28d8ea275e214c753554ba68f0e8eb9848e7fe0d66c4ecd3791904380d6d6b` |
| `evals/search-ranking/lateon/c0-contract.json` | `698d865a35ef9219c7aadcbb850a947c907d46fc7f42abb38c6190b4c9991f2d` |
| `evals/search-ranking/lateon/local-wsl-runtime-profile-v1.json` | `86ee8fbcffcfabbdb06cdb524dbdf16a8501bf4e7fba51199f9368b48aa08faf` |

The version 3 manifest additionally binds the six known positive/negative candidate
capture, capture-content, and baseline-replay digests for Satori, TradingView, and
Shopify; the exact LateOn model revision and model/tokenizer/configuration artifact
digests; and the pinned capture, replay, loader, scoring, decision, projection,
protocol, and runtime-profile implementation artifacts.

## Prospective projection and contender authority

`search_rerank_document_v1` remains the known diagnostic replay policy. The new
`search_rerank_document_v2` prospective policy freezes canonical JSON UTF-8
serialization, exact field order, a 4,000-byte aggregate limit, a 200-line aggregate
limit, and bounded-source-selection-v1 behavior with at most five 40-line excerpts,
two context lines, validated evidence spans, stable tie order, remaining-byte
allocation, and mandatory declaration retention or explicit budget failure.

The four preregistered unopened arms, in fixed quality execution order, are:

1. `projection-v1-d-l50`
2. `projection-v2-d-l16`
3. `projection-v2-d-l32`
4. `projection-v2-d-l50`

Resource depths use the counterbalanced orders `[16, 32, 50]`, `[32, 50, 16]`, and
`[50, 16, 32]`, with one depth per fresh process and two warm-up runs.

The statistical authority requires six independent families and 48 tasks per split,
10,000 repository-cluster bootstrap resamples, 98.75% adjusted confidence for the
four new contenders, the frozen minimum effects and non-inferiority margins, and
zero failures for exact-identifier, `must:`, configuration-pin,
candidate-membership, eligibility, fallback, and frozen-pagination controls.

The absolute local WSL CPU profile is sealed at: model load no more than 1,000 ms;
warm p95 no more than 900 ms; request deadline 2,000 ms; process peak RSS no more
than 872,415,232 bytes; retained RSS no more than 671,088,640 bytes; batch size 1;
8 intra-op threads; 1 inter-op thread; CPU execution provider.

## Honest unopened-state limitation

Prospective candidate-capture and contender-output files do not exist at L0, so
their SHA-256 digests cannot yet exist without fabricating evidence. Both digest
fields are therefore `null`, the held-out state is
`unopened_no_index_or_capture`, and the sealed prospective contract requires
canonical-JSON SHA-256 binding after capture and before scoring. This is an explicit
L0 limitation, not evidence that any held-out output was opened.

## Verification

The focused acceptance checks passed from the implementation commit:

```text
rtk node --check scripts/satori-ranking-benchmark-manifest.mjs
rtk node --check evals/search-ranking/build-cross-repository-manifest.mjs
rtk node --test scripts/satori-ranking-benchmark-manifest.test.mjs
```

The test result was 13 passed, 0 failed. It proves exact version 2 compatibility,
six-family/48-task split authority, prior-evidence isolation, unopened contender and
resource contracts, tamper rejection, candidate-suite compilation, and deterministic
reproduction of the committed version 3 manifest from pinned Git objects.

`rtk git diff --check` also passed before the implementation commit. No held-out
index, candidate capture, contender output, model run, scoring result, dependency,
or production behavior was created or changed by this L0 authority task.
