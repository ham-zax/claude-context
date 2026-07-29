# R2 deterministic ranking ablation receipt

Date: 2026-07-30 (Asia/Shanghai)

## Verdict

No deterministic finalist was selected.

* `B-P0` showed a limited path-policy benefit, but failed the frozen efficacy,
  uncertainty, and disclosed-list safety gates.
* `B-A0` produced no ranking or disclosed-list change because the R1 captures
  contain zero applied owner-authority boosts. It cannot establish whether
  owner evidence helps or hurts.
* Candidate membership, eligibility, exact-identifier output, neural-disabled
  behavior, and hard-negative exposure remained safe for both contenders.

This receipt closes the authorized offline R2 experiment. It does not authorize
a production policy change, held-out access, reindexing, new searches, LateOn,
or R3.

## Frozen authority

```text
manifest seal:
  dd93051e0d56c2070078d050e7145708cecca5f4f7ea56b0dadeae8b78ab3eaa
manifest artifact SHA-256:
  9226a0c155461054ffd0872641217ac796f890b9fd5156bd8f166a366996a2b4
R1 archive SHA-256:
  c5bab8e806f159e7eb52340ecb9c44732aa746a603886ea27fa09c43a84d6d92
R2 policy-seal canonical SHA-256:
  00c4248e1405a705ee2ee4c9f143884ddbfc1b5cf8f2f5d1a51a56eedf70d7f7
R2 policy-seal artifact SHA-256:
  d9b187c8aab9c75e86fa898692df639cf7e30f574242513bc181ec17636bfee4
```

The policy bytes and canonical policy identities were frozen before contender
replay:

| Policy | Changed component | Artifact SHA-256 | Canonical SHA-256 |
| --- | --- | --- | --- |
| `B` | none; captured path and owner components | `f7b2c8c282dca017078aec91eafcc5d764da7d3d46f396ede2ac21039e139ce8` | `63d1ad583110fc0e46ffd8740f194ef9a122ddaae69f32a8a54b6f766bb1238a` |
| `B-P0` | path multiplier set to `1` | `e4b87d2c63201a3c5dab095ed3b564cc6f3ff6fb9c0f18be58dd40773be50938` | `671e757855e8327e9cb3287a5febd00d080ebf976960ab445e464ad517e18e0e` |
| `B-A0` | optional entrypoint-owner score set to `0` | `260ad642ddb231a75026a11fa8bedec487cdbb06f3ac49615b86a84397791b7a` | `44140b9c043bd95b4ddbbbd850c85c3b1d50fc567b9dd317280fe38fbecdd9fa` |

The executable replay and evaluator identities are retained in
`evals/search-ranking/policies/r2-policy-seal.json`. One pre-result evaluator
amendment corrected its expectation from a redundant top-level `policyId` to
the canonical nested replay policy identity. No rank, score, list, or
contender metric was opened before that correction and reseal.

## Execution boundary

R2 used only the committed R1 archive. It performed:

1. SHA-256 verification of the R1 archive and manifest artifact;
2. safe extraction of 21 R1 JSON artifacts;
3. six fresh baseline replays;
4. identity comparison with all six archived R1 baseline replays;
5. six explicit-`B`, six `B-P0`, and six `B-A0` policy replays; and
6. one deterministic statistical evaluation, repeated byte-for-byte.

No Satori index, source worktree, MCP server, search provider, embedding model,
or reranker was accessed.

The result covered:

```text
quality tasks:
  14 owner-survival tasks
safety tasks:
  6 negative-exposure tasks
exact controls:
  1 exact-identifier task
excluded:
  5 R1 hard misses
bootstrap:
  10,000 deterministic repository-cluster resamples
confidence:
  97.5%
```

The five hard misses remained outside ranking-quality measurement.

## Baseline

Repository-macro baseline metrics:

| Metric | `B` |
| --- | ---: |
| Owner at 1 | 0.388889 |
| Owner at 3 | 0.444444 |
| Owner at 10 | 0.583333 |
| Reciprocal rank | 0.442460 |
| Hard-negative exposure at 3 | 0 |

## B-P0: neutral path score

| Metric | `B-P0` | Delta from `B` | 97.5% interval |
| --- | ---: | ---: | --- |
| Owner at 1 | 0.388889 | 0 | [0, 0] |
| Owner at 3 | 0.527778 | +0.083333 | [0, 0.25] |
| Owner at 10 | 0.666667 | +0.083333 | [0, 0.25] |
| Reciprocal rank | 0.470238 | +0.027778 | [0, 0.083333] |
| Hard-negative exposure at 3 | 0 | 0 | [0, 0] |

The only required-owner disclosure improvement was:

```text
tradingview-root-cli:
  B:     not disclosed
  B-P0: rank 3
```

The improvement was isolated to `tradingview-r0`; Satori and Shopify
repository-level owner metrics did not improve. `B-P0` failed because:

* the owner-at-3 lower interval was `0`, not above `0`;
* reciprocal-rank improvement was `0.027778`, below the frozen `0.03`;
* its reciprocal-rank lower interval was `0`, not above `0`; and
* it caused unrelated disclosed membership changes.

Disclosed ordering changed on eight of 14 quality tasks. Disclosed membership
changed without a qualifying owner-boundary explanation on six quality tasks
and five negative-exposure tasks. The six negative tasks still kept their
specified hard negatives outside the top three, but the broad list churn
violated the frozen disclosed-list safety rule.

Therefore the evidence does not support globally removing path preference.
It does show that the current path policy can demote a correct owner in at
least one query.

## B-A0: owner-authority disabled

All measured deltas and intervals were exactly zero:

| Metric | `B-A0` | Delta from `B` | 97.5% interval |
| --- | ---: | ---: | --- |
| Owner at 1 | 0.388889 | 0 | [0, 0] |
| Owner at 3 | 0.444444 | 0 | [0, 0] |
| Owner at 10 | 0.583333 | 0 | [0, 0] |
| Reciprocal rank | 0.442460 | 0 | [0, 0] |
| Hard-negative exposure at 3 | 0 | 0 | [0, 0] |

This is not evidence that owner authority is useless. Across 8,282 captured
replay-signal occurrences, zero had a positive entrypoint-owner contribution.
The one recorded entrypoint evidence attempt,
`tradingview-qap-owner`, was:

```text
status:
  publication_incompatible
declared owners:
  1
resolved owners:
  0
resolution complete:
  false
```

Consequently `B-A0` had no active treatment to remove. The owner-evidence
question remains unqualified on this R1 authority.

## Mandatory safety controls

For both contenders:

* candidate membership was identity-equal to `B`;
* eligibility and removal identities were equal to `B`;
* the exact-identifier result was identity-equal to `B`;
* all six negative-exposure tasks retained zero hard-negative exposure at 3;
* neural capability, provider calls, candidates, and bytes remained zero; and
* the five absent-owner hard misses were not included in efficacy metrics.

`B-P0` failed the separate disclosed-list safety control described above.
`B-A0` produced no disclosed rank, membership, ordering, or score transition.

The full result records every evaluated group’s baseline rank, contender rank,
score delta, candidate identity, additions and removals, plus complete baseline
and contender disclosed lists.

## Selection

```text
selected policy:
  none
reason:
  no_contender_passed_every_gate
```

The correct R2 product decision is to keep baseline `B`. This is a
non-selection, not production requalification.

## Immutable artifacts

`r2-artifacts.tar.gz` contains:

* six fresh baseline-validation replays;
* all 18 explicit policy replays;
* the complete statistical result and full disclosed-list diffs.

```text
archive bytes:
  1181885
archive SHA-256:
  162f7262967c1627ac8c1bf5f07dd540df70b97a438f83ec7b4252bd5ce20966
result canonical SHA-256:
  777189a8a23a884e5180460029e579ff49a2a8258110639478d4916a894ca417
result artifact SHA-256:
  d41cc5c8249d0c5961dd34b40841f52a9dd886ae6392c2f7e59492d44c027052
```

Repeating the evaluator produced a byte-identical result with the same
artifact SHA-256.

## Limitations

This owner-only R2 matrix has no independent required-role oracle, so the
required-role-coverage margin is not applicable. Runtime latency and RSS were
also not remeasured because the authorized experiment was offline replay and
selected no finalist. Neither omission can change the no-finalist decision:
both contenders already failed required efficacy gates, and `B-P0` also failed
disclosed-list safety.
