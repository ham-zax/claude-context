# Post-R2 corrective tuning qualification receipt

Date: 2026-07-30 (Asia/Shanghai)

## Verdict

The bounded post-R2 corrective patch passed tuning qualification across the
three sealed repositories.

Baseline `B` reproduced exactly for all 20 positive-owner tasks and all six
negative-exposure tasks. Candidate membership, eligibility removals, local
scores, production grouping, disclosure order, exact-identifier behavior, and
the neural-disabled invariant replayed without mismatch.

Four of the five previously localized hard misses are now owner-survival
tasks. One hard miss remains:

```text
satori-final-score
```

This receipt qualifies the corrected tuning authority only. It does not open
held-out evidence, R3/LateOn, a production ranking-policy change, or production
activation.

## Frozen authority

```text
manifest:
  evals/search-ranking/cross-repository-v2.manifest.json
manifest seal:
  ca85f0f0142c64ef7e2a6fca615ba897aa8776475f113303f1c0981b87128445
manifest artifact SHA-256:
  79ef96256f6af0300fb84edc76b75bd28596e0a36284e78fe8d4f10edff03d30
plan artifact SHA-256:
  6106808c0f110a920a326d0c3111ff8394730f56e7411bdbdadfc4874b9bc512
final replay tooling commit:
  23dabd24b463ec36dd481635e00f9238faf5d3a8
final replay tooling tree:
  d52293d31ab9a04234015ce0cae0a7d1604bd5ca
compiled MCP entry SHA-256:
  56553b127ac28ec9d2d951ed2e7e942795e1ecb6bfc761812208751c14185823
compiled runtime aggregate SHA-256:
  ab0b8af05af828542c278f8246c5b3b419039bcce1c710991022de19192af018
Node:
  v24.13.0
```

The tradingview observations were recorded at tooling commit `4158410` after
the status-only recorder learned to accept a completed `create` publication.
Their immutable captures were replayed at `23dabd2` after baseline replay was
corrected to consume `raw_lexical_fallback` when the precise lexical arm is
empty. Satori and Shopify observations, captures, and replays were all
produced at `23dabd2`. All three used the same compiled runtime aggregate and
MCP entry digests shown above.

## Source worktrees

Each detached tuning worktree matched the sealed revision, Git tree,
source-tree digest, origin, and clean-state requirement.

| Repository | Worktree | Revision | Git tree | Source-tree SHA-256 |
| --- | --- | --- | --- | --- |
| Satori | `/home/hamza/repo/satori-r1-ca85f0f0142c/satori` | `5c1896e6a70b9d31a801e17c207b2a65b44348c5` | `9f3eafdc82834a097c196032813fb830805f613f` | `cf9a1431a03d335361e8bad71b4f76f7dec4d33b9988af08f1f0853227bcafb4` |
| tradingview_ratio | `/home/hamza/repo/satori-r1-ca85f0f0142c/tradingview-ratio` | `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` | `2969002a2aa46948d6557ac5f5c70e19355c80a7` | `ee70d61453220d57988cf5267011e55290565c99db5843a8b980993c7ec21c5f` |
| noor-and-knot-shopify | `/home/hamza/repo/satori-r1-ca85f0f0142c/shopify-theme` | `34a00887a5904c091c5c049843e383c96ff41f6f` | `95fb149c531370eba964d6c0f1a61f9f83629d50` | `675ce8b037f9fc4f4f6fb70a83b2df9d3c98b3af8002ef72064b14fc3097302a` |

No held-out worktree or held-out index was created or queried.

## Published index identities

### tradingview-r0

```text
collection:
  hybrid_code_chunks_c1f69457__gen_run_15548dde_3a1a_466e_9475_f4c82a02b82e
completion marker:
  229097d1-e3bd-495a-bd0e-7e5f2bbec2e9
index policy:
  0e19e8c19c7dbc7c7625e297278984859ddffd9276e7ed498d64c391176a4092
policy document:
  206a113adfd1036dbf037ef3093ab811e84d5a9c117fbec31a18c263c871d5cf
```

### satori-r0

```text
collection:
  hybrid_code_chunks_5794f5ff__gen_run_459daf12_a78a_4dd6_8a03_dcc03c68a185
completion marker:
  5ad12d1a-eb3a-493d-8198-a626a98ba280
index policy:
  d2d4d0f9a671ddd7f45fbfcc84b6b0f3613e299598bfca71e6182c65eb6b7253
policy document:
  fb45fab3797a4d99df3dbf77b4058aed54b2915203a6751112f3433f08bac839
```

### shopify-theme-r0

```text
collection:
  hybrid_code_chunks_e8d4482f__gen_run_c77171a7_ccb1_4e4a_b9c1_e30574d2b165
completion marker:
  6448df8d-9bf2-432c-9760-982beed158ae
index policy:
  0833b11bf94e94210da84f64d322a2595c6f206c755b883a2fbfabb955ca6b69
policy document:
  2ccb955656bcae22aa6e3b2c0ed7438e919a899fea99308d8a95b858c7f18aec
```

All three publications were `symbol_rich` and used:

```text
provider:
  Potion
model:
  minishlab/potion-code-16M-v2@e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b
dimension:
  256
embedding artifact:
  bfda80d97aeb585e20650b1c54e9063a65068ce284317f0e0a812e20964dcee7
embedding projection:
  embedding_projection_v2
lexical projection:
  lexical_projection_v1
```

## Capture and replay result

| Repository | Positive tasks | Negative tasks | Cold/warm observations | Exact replay |
| --- | ---: | ---: | ---: | --- |
| tradingview-r0 | 6 | 2 | 16 | pass |
| satori-r0 | 8 | 2 | 20 | pass |
| shopify-theme-r0 | 6 | 2 | 16 | pass |
| **Total** | **20** | **6** | **52** | **pass** |

All 52 observations completed with status `ok`. For every capture:

* `--require-replay-ready` passed;
* `--require-grouping-ready` passed;
* `--require-neural-disabled` passed;
* candidate membership and eligibility removals remained identity-equal;
* local scores, grouped order, and disclosed order reproduced exactly;
* neural capability, calls, candidates, and input bytes remained zero; and
* publication and runtime identities remained bound.

The exact-identifier control `tradingview-cointegration-exact` remained a
policy-invariant rank-one result.

## Corrective outcome

| Task | Previous result | Corrected result | Outcome |
| --- | ---: | ---: | --- |
| `tradingview-backtest` | hard miss | rank 21 | fixed |
| `satori-query-plan` | hard miss | rank 10 | fixed |
| `satori-entrypoint-intent-test` | hard miss under symbol oracle | file rank 1 | corrected file-level oracle and fixed |
| `satori-ranking-plan-document` | hard miss under symbol oracle | file rank 1 | corrected file-level oracle and fixed |
| `satori-final-score` | hard miss | hard miss | remains |

Aggregate owner survival changed from 15/20 to 19/20. Owner top-three changed
from 7/20 to 10/20.

The entrypoint-owner path also closed its publication-binding failure:

```text
task:
  tradingview-qap-owner
previous local rank:
  37
corrected local rank:
  1
entrypoint evidence:
  resolved
declared/resolved owners:
  1 / 1
resolution complete:
  true
owner score contribution:
  bounded by the frozen 0.35 cap
```

This proves that a valid completed publication can resolve owner evidence after
a runtime restart without a preparatory sync. Genuine source/publication drift
continues to fail closed in the focused runtime tests.

The remaining `satori-final-score` miss is still absent from the eligible local
candidate set at depth 80. Ranking and deterministic path-policy ablations
cannot restore it; it remains routed to retrieval/projection analysis.

## Immutable artifacts

`post-r2-corrective-qualification-artifacts.tar.gz` is a deterministic archive
of the 21 observation, capture, replay, and score artifacts.

```text
archive bytes:
  10794908
archive SHA-256:
  252bc9975cc5141ad173c81762ee7ccc005462eb207592628ca60824c1cdb341
```

Key artifact SHA-256 values:

| Repository | Positive capture | Positive replay | Negative capture | Negative replay | Positive score |
| --- | --- | --- | --- | --- | --- |
| tradingview-r0 | `d0978a76a5ae01163178f3fdbd5c4461357d5e4bfc2a58232213588f561b2990` | `c89668b78ef8d8ecb960a81594919e7cfb1a6ccac451b62a741991798cfcb9ff` | `281128259c98d05b42dc97c15eee2cdbfbd0a353d89be9f5c0780b621c9f0e96` | `b7c7a0a9b2fb0624d6d6101bb1299810f330bb1030988301d0e548c0f6799f67` | `8698ebfe082d1035b359b0ad6d3f18e6b5b5ecb2d450e79dd2c6bf990c6b1fd5` |
| satori-r0 | `e128aa0b1d4571020c89ec8688ab273b1424b945d724bb76e81ca4e325075223` | `d430e8bb4ea157a1909754ddbae6b47e1a5a408b78778349001c908394535810` | `2c438b93df3d0394c9e0c42899d5fbc4671246f2091c0837ff6907cecc7c00c8` | `35ca564a120699086b81fd5e5eec4f0222487e9db1a502204e84ad2d90e1135c` | `011c85b8c19675b5e6602b4ff261f3b37d614cabdb056f40ee09b2dd5b2a34c2` |
| shopify-theme-r0 | `5cc9c552571644c1d0d606f265f74c397037756df807bcab452db88fdcb23329` | `9d13c66e7dc578a279152b1d5a5148febc638119f075a8ff94a08ff94522bb3c` | `b7e41ac64e1f574a4cdf3c76f04d9cb238446937916980cf4002aab090cd4043` | `855fa7a075f41349e6e2ffeec64c13132e9513551cd2084f1a3222b98990246e` | `c106557af809f1a66afbde46bf30345afaa82a5fc853483f0e9d8ad36a30d97c` |

## Fail-closed events

Three non-authoritative attempts failed closed before the successful run:

1. a conflicting live Satori runtime blocked mutation;
2. a short-lived CLI process exited before the background canary index wrote a
   completion marker, and recovery rejected that generation; and
3. the recorder rejected a completed `create` publication because its
   status-only proof contract accepted only `sync`.

Those attempts produced no usable benchmark evidence. The recorder contract
was corrected in `4158410`, and the final publications above were created in
persistent MCP sessions that remained alive through their completion markers.

The first immutable canary replay then exposed that baseline tooling ignored a
captured fallback-lexical arm when precise lexical retrieval was empty. Commit
`23dabd2` corrected that replay contract. The existing captures were retained;
no recapture or reindex was used to make replay pass.

## Boundary

The corrected tuning baseline is qualified. The three index publications and
artifact archive must remain immutable.

Held-out evidence remains sealed. R3/LateOn, dependency changes, production
policy changes, and production activation remain closed.
