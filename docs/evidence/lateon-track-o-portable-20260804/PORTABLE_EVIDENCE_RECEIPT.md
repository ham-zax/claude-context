# Track O portable evidence receipt

**Date:** 2026-08-04

**Result:** `track_o_closure_evidence_portable`

This receipt preserves the small decision-bearing Track O artifacts and the
larger tuning inputs required by the carry-forward verifier before the feature
worktree or temporary evidence directories are removed. It does not change any
Track O decision, reopen O3, qualify held-out quality, or authorize O4.

The [evidence-correction finalization receipt](../lateon-track-o-finalization-20260804/TRACK_O_CORRECTION_FINALIZATION_RECEIPT.md)
remains the decision authority. This receipt is the latest portability
authority; earlier absolute paths remain historical capture locations only.

## Portable O2 authority

| Artifact | File SHA-256 | Canonical/result SHA-256 |
| --- | --- | --- |
| [D32-v2 O2 receipt](../lateon-track-o-o2-v2-20260804/artifacts/o2-receipt.json) | `8eb27428c07a764fe84f700b847f6032c1471cacf98acffd4072ff6e953f38f4` | `de3c693c2461d11ede5f0ffa8ea410e4fbabe0053d87b43e52707b2f4d92fde4` |
| [D32-v2 O2 evidence](../lateon-track-o-o2-v2-20260804/artifacts/o2-evidence.json) | `68e4cae255a33758cd4ce0e862fe30b363949a5f682d95072a993cbab4b7c9a3` | `37eded0b501509cb6b79365d4afcbd1d49fd612fc2a801c580ad4883621d4b42` |

Both repository copies are byte-identical to the original files under
`/home/hamza/repo/satori-track-o-o2-v2-20260804-thab79/`.

## Portable O3 protocol evidence

| Artifact | File SHA-256 | Canonical/result SHA-256 |
| --- | --- | --- |
| [Write-once opening](../lateon-track-o-o3-protocol-20260804/artifacts/track-o-heldout-opening.json) | `c62147880d5eb2311e03b85e425a9ecd1901987f7eaf5a117adea5deeab3aa23` | `760e90e3841261d1ab725a31432dc91eb02a7f0c0709cad8865c8fe10a0ae276` |
| [Materialization audit](../lateon-track-o-o3-protocol-20260804/artifacts/track-o-o3-materialization-audit.json) | `e182ac190e037676095e94ee06ac90b8b789b8a5ee74b349f45cc143e9303f37` | `dd39e76282092e886f4c11f4cbf9da0e74e9d73ff96145b41e7d627ec0738a27` |
| [First invalidating response](../lateon-track-o-o3-protocol-20260804/artifacts/promptready-debug-response.json) | `b0ca1ad85a5c056f88e1887bbf4109ce3e42188860fa83e66cb6d1b984b1bc6c` | not applicable |

These copies preserve the opening authority, the repository-level task counts,
and the first post-opening failure. Later invalidated held-out captures remain
non-authoritative and are not promoted into the repository by this receipt.

## Portable tuning replay inputs

| Archive | Contents | SHA-256 |
| --- | --- | --- |
| [Track L scoring archive](../deep-lateon-l3-20260804/deep-lateon-l3-artifacts.tar.gz) | sealed capture authority, manifest, D16/D32/D50 scores and replays | `71faba8d308c239e9e49b029b363957662288ec1470876b2c9c796256fb168b1` |
| [Capture and baseline supplement](artifacts/track-l-capture-baseline-artifacts.tar.gz) | 12 captures and 12 deterministic baseline replays used by the carry-forward verifier | `b83aacb7f0aa9804ba60ae54778d6ff790abad7d5be7f6d6a1f58c8fe902ab3f` |

The supplement is a deterministic archive with sorted entries, normalized
ownership, a fixed `2026-08-04` modification time, and timestamp-free gzip
metadata. Its uncompressed inputs total `58,942,495` bytes.

To reconstruct the verifier inputs, extract the Track L scoring archive into a
temporary directory, then extract the supplement into that directory's
`track-l/` subdirectory. The resulting paths are:

```text
track-l/capture-authority.json
track-l/<repository>/positive-capture.json
track-l/<repository>/negative-capture.json
track-l/<repository>/positive-baseline-replay.json
track-l/<repository>/negative-baseline-replay.json
track-l/replays/<repository>/*.json
track-l/scores/<repository>/*.json
```

Run `scripts/satori-track-o-o2-carry-forward-audit.mjs` against those extracted
paths and the portable D32-v2 O2 receipt. Checkout the correction boundary
`41333ddcd02eaf5595d6c2711b0e0de21524f73d` when reproducing the committed audit
digest; later commits intentionally produce a different revision/tree binding
while retaining identical O2-owned input digests.

## Final decision

```text
Track P       qualified
Track I       qualified
Track L       baseline B retained
Track O       offline_lateon_opening_consumed_without_valid_decision
D32           operationally qualified, disabled, not held-out qualified
D16           disabled and unqualified
O4            closed
product       baseline B
```

No external evidence directory is deleted by this receipt. Cleanup may proceed
only after the merged tree is verified and the repository artifacts above are
confirmed readable.
