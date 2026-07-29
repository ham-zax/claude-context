# R1 baseline qualification receipt

Date: 2026-07-30 (Asia/Shanghai)

## Verdict

Baseline `B` reproduced exactly for all 20 positive-owner tasks and all six
negative-exposure tasks in the three tuning repositories. Candidate capture,
route replay, candidate survival, removal diagnostics, production grouping,
production disclosure, and neural-disabled gates passed.

This receipt closes R1 baseline qualification only. It does not authorize R2,
held-out access, a ranking-policy change, LateOn integration, or production
activation.

## Frozen authority

```text
manifest:
  evals/search-ranking/cross-repository-v2.manifest.json
manifest seal:
  dd93051e0d56c2070078d050e7145708cecca5f4f7ea56b0dadeae8b78ab3eaa
manifest artifact SHA-256:
  9226a0c155461054ffd0872641217ac796f890b9fd5156bd8f166a366996a2b4
plan artifact SHA-256:
  6106808c0f110a920a326d0c3111ff8394730f56e7411bdbdadfc4874b9bc512
qualification tooling commit:
  e1bf041fb29ba36ebaa1065277a6966d046558e7
qualification tooling tree:
  386e5b7d6f15cc7d6c06dd8f3fea372adc2878c0
qualification runtime SHA-256:
  117b556e1322a7481655ff79031655a1ba47f0234372e2c2293262edbf860312
compiled runtime SHA-256:
  48e6b620e9798a31c4f1de4a26634c284bd2088cf644bd7228db1e91d1f5b51f
Node:
  v24.13.0
```

The plan and manifest contain no `B-P1` reference. The deterministic
contenders remain `B-P0` and `B-A0`, with the frozen `0.05 / 2 = 97.5%`
multiple-comparison intervals.

The obsolete-seal cleanup is recorded separately in
`docs/evidence/r1-obsolete-seal-cleanup-20260730/R1_OBSOLETE_SEAL_CLEANUP_RECEIPT.md`.

## Source worktrees

Each detached worktree remained clean after qualification.

| Repository | Worktree | Revision | Git tree | Source-tree SHA-256 |
| --- | --- | --- | --- | --- |
| Satori | `/home/hamza/repo/satori-r1-dd93051e0d56/satori` | `5c1896e6a70b9d31a801e17c207b2a65b44348c5` | `9f3eafdc82834a097c196032813fb830805f613f` | `cf9a1431a03d335361e8bad71b4f76f7dec4d33b9988af08f1f0853227bcafb4` |
| tradingview_ratio | `/home/hamza/repo/satori-r1-dd93051e0d56/tradingview-ratio` | `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` | `2969002a2aa46948d6557ac5f5c70e19355c80a7` | `ee70d61453220d57988cf5267011e55290565c99db5843a8b980993c7ec21c5f` |
| noor-and-knot-shopify | `/home/hamza/repo/satori-r1-dd93051e0d56/shopify-theme` | `34a00887a5904c091c5c049843e383c96ff41f6f` | `95fb149c531370eba964d6c0f1a61f9f83629d50` | `675ce8b037f9fc4f4f6fb70a83b2df9d3c98b3af8002ef72064b14fc3097302a` |

No held-out worktree or held-out index was created or queried.

## Published index identities

Every identity below is the tuple of manifest seal, repository ID, pinned
revision, collection and completion marker, index-policy digest, policy
document digest, and embedding identity.

### tradingview-r0

```text
collection:
  hybrid_code_chunks_b13bdd72__gen_run_c18d6f3b_5b22_4c22_8d2e_b7b181189949
completion marker:
  51a6e80a-e377-4557-87e8-59f10e7d6cbb
index policy:
  0e19e8c19c7dbc7c7625e297278984859ddffd9276e7ed498d64c391176a4092
policy document:
  f2f280495813ae04dd062fe82f4a88bb95963001daa4515b85993b16310be5aa
```

### satori-r0

```text
collection:
  hybrid_code_chunks_8a55a72a__gen_run_f8120135_f3cd_4e93_b6e7_ef8939e95b09
completion marker:
  53fd7d9b-9758-4c5e-a8f3-c970a55734bf
index policy:
  d2d4d0f9a671ddd7f45fbfcc84b6b0f3613e299598bfca71e6182c65eb6b7253
policy document:
  4d92bd5636021a55a0300fca49d3f6f488a71cbc48d5883bcce16f511b661dc6
```

### shopify-theme-r0

```text
collection:
  hybrid_code_chunks_d90affa1__gen_run_6e4aed8f_dd03_4a67_beba_f116fbcfb059
completion marker:
  ef549a0e-0b87-4429-9983-c3e949ba1f05
index policy:
  0833b11bf94e94210da84f64d322a2595c6f206c755b883a2fbfabb955ca6b69
policy document:
  d4216f27f6a1c2b911bf73b8f0fd4a11c80c9c2fb43b32a92b9d85c185b15905
```

All three use:

```text
provider:
  Potion
model:
  minishlab/potion-code-16M-v2@e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b
dimension:
  256
embedding artifact:
  bfda80d97aeb585e20650b1c54e9063a65068ce284317f0e0a812e20964dcee7
```

## Capture and replay result

| Repository | Positive tasks | Negative tasks | Cold/warm observations | Result statuses | Capture/replay result |
| --- | ---: | ---: | ---: | --- | --- |
| tradingview-r0 | 6 | 2 | 16 | 14 `ok`, 2 trace-complete `zero_result` | pass |
| satori-r0 | 8 | 2 | 20 | 20 `ok` | pass |
| shopify-theme-r0 | 6 | 2 | 16 | 16 `ok` | pass |
| **Total** | **20** | **6** | **52** | **50 `ok`, 2 `zero_result`** | **pass** |

For every task:

* `--require-replay-ready` passed;
* `--require-grouping-ready` passed;
* `--require-neural-disabled` passed;
* stage candidate membership and local scores reproduced;
* all recorded removals reproduced and `omittedRemovals` is zero;
* grouped and disclosed order reproduced exactly;
* neural capability, calls, candidates, and input bytes remained zero; and
* publication and measured-runtime identities remained bound.

The two `zero_result` observations are the cold and warm samples for
`tradingview-backtest`. They retain a complete replayable trace and correctly
route that task away from ranking ablation.

One initial Shopify measurement failed closed when the persistent Satori
daemon completed a zero-change sync during the measured task. It wrote no
observation. The source and publication identities remained unchanged; after
the operation record stabilized, one bounded restart completed with identical
publication authority and all gates passing.

## R2 routing evidence

Baseline scoring found the required owner in the eligible local candidate set
for 14 policy-applicable tasks:

```text
tradingview-qap-owner              rank 37
tradingview-root-cli               rank 11
tradingview-lazy-map               rank 18
tradingview-engine-intent          rank 59

satori-entrypoint-evidence         rank 1
satori-group-results               rank 2
satori-disclosure                  rank 1
satori-finalization                rank 1

shopify-cart-items                 rank 15
shopify-predictive-search          rank 3
shopify-facets                     rank 12
shopify-focus-trap                 rank 5
shopify-publish-event              rank 2
shopify-recommendations            rank 8
```

`tradingview-cointegration-exact` reproduced as a policy-invariant exact
identifier control at rank 1 and is not a deterministic ranking contender
task.

The following five tasks are hard misses and must be routed to retrieval or
oracle analysis, not “fixed” by R2 ranking:

```text
tradingview-backtest
satori-final-score
satori-query-plan
satori-entrypoint-intent-test
satori-ranking-plan-document
```

## Immutable artifacts

`r1-baseline-artifacts.tar.gz` is a deterministic archive containing, for each
repository, the positive and negative observations, captures and baseline
replays, plus the positive baseline score receipt.

```text
archive bytes:
  10498587
archive SHA-256:
  c5bab8e806f159e7eb52340ecb9c44732aa746a603886ea27fa09c43a84d6d92
```

The source JSON artifacts also retain their own canonical capture, replay,
score, publication, runtime, task-suite and evaluation-authority digests.

## Boundary

R1 is complete. The three index publications must remain immutable. R2 remains
closed pending explicit authorization and may operate only on the 14
policy-applicable owner-survival tasks above, with neural reranking disabled.
