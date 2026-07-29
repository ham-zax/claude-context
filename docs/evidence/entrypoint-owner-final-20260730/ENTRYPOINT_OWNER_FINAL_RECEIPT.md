# Entrypoint-owner final live receipt

Date: 2026-07-30 (Asia/Shanghai)

## Result

The bounded Python installed-command correction passes its preregistered local
gate on the frozen `tradingview_ratio` publication:

| Query | Baseline owner rank | Owner-aware rank | Baseline score | Owner-aware score |
| --- | ---: | ---: | ---: | ---: |
| Find the function that creates and launches the user-facing command line interface. | 1 | 1 | 0.497045 | 0.847045 |
| How does running the qap terminal command enter the application? | 10 | 1 | 0.105928 | 0.455928 |
| Which function is the installed command target? | 5 | 2 | 0.463859 | 0.813859 |
| `cli_entry_point` | 1 | 1 | 1 | 1 |
| `must:cli_entry_point cli_entry_point` | 1 | 1 | 1 | 1 |

The three natural-language probes place the qualified owner in the top three.
The plain exact-ranking control and the `must:` index/resolution control remain
first. The result does not qualify the `0.35` component across repositories:
the installed-target query still exposes an unrelated script above the owner,
which remains tuning evidence for the cross-repository ablation.

The first natural-language oracle is valid for this revision. The pinned
implementation creates the Click command from the Typer application, attaches
lazy loading, and invokes the command inside `cli_entry_point`; it is not only
the manifest invocation boundary.

## Live calibration and result-list diff

The rank-three cutoff is taken from the unmodified baseline disclosure. The
minimum lift is zero when the owner already passes the gate; otherwise it is
the nominal score gap the owner must strictly exceed before deterministic tie
handling:

| Query | Baseline owner score | Baseline rank-three cutoff | Nominal minimum lift | Applied lift | Remaining margin |
| --- | ---: | ---: | ---: | ---: | ---: |
| Creates and launches the CLI | 0.497045 | 0.451990 | 0 | 0.350000 | 0.350000 |
| Running `qap` enters the application | 0.105928 | 0.163531 | 0.057603 | 0.350000 | 0.292397 |
| Installed command target | 0.463859 | 0.738958 | 0.275099 | 0.350000 | 0.074901 |

The disclosed membership is identity-equal before and after for all three
natural-language queries. Every unrelated result preserves its relative order.
The complete rank transitions are:

```text
creates/launches:
  owner 1 -> 1; every unrelated result remains at its original rank

running qap:
  owner 10 -> 1
  prior unrelated ranks 1..9 -> 2..10
  prior unrelated ranks 11..15 -> unchanged

installed target:
  owner 5 -> 2
  prior unrelated rank 1 -> unchanged
  prior unrelated ranks 2..4 -> 3..5
  prior unrelated ranks 6..15 -> unchanged
```

The live end-to-end latencies were:

| Task | Baseline ms | Owner-aware ms |
| --- | ---: | ---: |
| Creates and launches the CLI | 6001 | 6086 |
| Running `qap` enters the application | 342 | 378 |
| Installed command target | 325 | 368 |
| Plain exact control | 121 | 123 |
| `must:` control | 85 | 89 |

The first call in each arm includes the zero-change freshness check. These
single observations bind the receipt but do not isolate causal owner-evidence
overhead or qualify a general latency budget.

## Frozen authority

Target source:

```text
repository: /home/hamza/repo/tradingview_ratio
revision:   8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7
tree:       2969002a2aa46948d6557ac5f5c70e19355c80a7
source identity:
            e9622c9cb7830cb9a4d7f933c8a70d62afa2fae6465df44687e960a0ec4fbda0
pyproject.toml:
            2a6ee46bfa6ac61b03d1c2caf12857efa37cf2d5560fef6e485adbc17dc663e7
src/cli/main.py:
            f8460655bd60dd8311585e6071c47508af388f3b15f69f1eec882b7c4a01b71f
```

The checkout contained unrelated user changes. Both observations record the
complete status, tracked-diff digest, and untracked-file digests. The two
oracle files were unchanged and are bound independently above.

Search publication:

```text
collection:
  hybrid_code_chunks_a28de7b6__gen_run_24c3ceb9_ffa4_47c5_8a9a_9b1e94345c3c
marker:
  11276d2f-7a64-49ae-81ca-2cecbcac296f
index policy:
  0e19e8c19c7dbc7c7625e297278984859ddffd9276e7ed498d64c391176a4092
policy document:
  52fdc078772afaa08ebc8085172e9e7587c685861366b7dd70c0e4534ec3cf7f
embedding:
  minishlab/potion-code-16M-v2@e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b
```

Both arms used this identity-equal publication. The first call performed a
zero-change sync (`added=0`, `removed=0`, `modified=0`); later calls observed
unchanged source.

Owner-aware runtime:

```text
Satori source revision:
  5c1896e6a70b9d31a801e17c207b2a65b44348c5
source tree:
  9f3eafdc82834a097c196032813fb830805f613f
runtime identity:
  df543f045662591b3cb5bbc47fd3d450b2dcf1f948cb4b9666dfab57e6a7b133
runtime artifact:
  671c6196f7dc04e9613300e028885a76e580e83dd03081af221b1b6dc9c70c62
candidate trace:
  search_candidate_survival_v2
score policy:
  search_candidate_final_score_v2
maximum owner contribution:
  0.35
```

The baseline used the installed pre-change `6.7.0` runtime. Its runtime was not
Git-bound, so the receipt binds the exact command and recorder artifacts rather
than claiming a source revision. Its candidate trace is
`search_candidate_survival_v1`, where absence of an owner component means zero.

## Artifacts

| Artifact | Embedded canonical digest | Compressed-file digest |
| --- | --- | --- |
| `baseline-live-receipt.json.gz` | `74a00ff7bdf13a72fc2ddab2ed5e0a8f39f59967ef559ddfa942b52f4c44a4c1` | `7e94ea42df6f61d5a26ad592ffd43f33dda75530c948c96b38467795e10cfb3b` |
| `owner-aware-live-receipt.json.gz` | `40c7b88b50cff7ea382f4e7d76434c61fda88a55a58f5bb1e8b499cd9517c022` | `e3971ccb9bdfbceee83e235ec038e64fb75fb41c2cfc01875791a6a5764a6a62` |

The compressed receipts contain the complete disclosed lists, candidate-stage
traces, owner provenance, publication identities, and source-state receipts.
Decompress with `gzip -dc`.

## Focused classifier proof

Command:

```text
cd packages/mcp
node --import tsx --import ./src/test-state-root.ts \
  --test --test-concurrency=1 \
  --test-name-pattern="distinguishes entrypoint ownership" \
  src/core/search-query-support.test.ts
```

Result:

```text
pass: 1
fail: 0
duration: 895.946862 ms
```

This includes the mixed-cue controls for `mock CLI startup`,
`fixture application start`, and `stub command entrypoint`.
