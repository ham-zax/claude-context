# Track O O3 protocol failure receipt

## Decision

```text
stage                    O3 held-out adjudication
outcome                  offline_lateon_opening_consumed_without_valid_decision
product policy           baseline B
activation authorized    false
held-out quality result  unavailable
```

D32-v2 remains operationally qualified by O2, but no held-out quality or
activation authority was produced. D16 remains an explicit, disabled,
unqualified developer-experiment profile. Neither profile becomes a product
default through this receipt.

## Opening authority

```text
opening path             /home/hamza/repo/satori-track-o-opening-20260804-b1YU92/track-o-heldout-opening.json
opened at                2026-08-03T20:51:47.224Z
opening status           consumed_authorized
opening canonical SHA    760e90e3841261d1ab725a31432dc91eb02a7f0c0709cad8865c8fe10a0ae276
opening file SHA         c62147880d5eb2311e03b85e425a9ecd1901987f7eaf5a117adea5deeab3aa23
manifest file SHA        281c5354d98c42e8d576e607de50046230e7d31ca4059a6d77d89e7454b1db09
manifest canonical seal  05fb273715d6205bcdf5adc1fdec94a892d8b40fc651a386ab36ccfb9475b7bc
O0 authority SHA         337201db7c1d0e2b5281104f3a1ad7a6f406dfb9c006cfccc4864bc1c42a0526
O2 receipt path          /home/hamza/repo/satori-track-o-o2-v2-20260804-thab79/o2-receipt.json
O2 receipt canonical SHA de3c693c2461d11ede5f0ffa8ea410e4fbabe0053d87b43e52707b2f4d92fde4
O2 receipt file SHA      8eb27428c07a764fe84f700b847f6032c1471cacf98acffd4072ff6e953f38f4
O2 evidence path         /home/hamza/repo/satori-track-o-o2-v2-20260804-thab79/o2-evidence.json
O2 evidence file SHA     68e4cae255a33758cd4ce0e862fe30b363949a5f682d95072a993cbab4b7c9a3
```

The plan froze this rule before opening:

> Failure after the durable write-once opening consumes the opening and cannot
> be retried.

## First invalidating event

After the opening and materialization, the first real PromptReady capture
returned no usable observation because a valid paginated result set reached a
strict canonical serializer with response-optional `undefined` fields. The
external diagnostic response is retained as:

```text
/home/hamza/repo/satori-track-o-heldout-20260804/artifacts/promptready-debug-response.json
SHA-256 b0ca1ad85a5c056f88e1887bbf4109ce3e42188860fa83e66cb6d1b984b1bc6c
```

This was a general cache-accounting defect, not a LateOn result. Nevertheless,
it occurred after the one-time opening and therefore consumed O3 without a
valid decision.

## Subsequent diagnostic work

The following general corrections were made after the opening:

| Commit | Correction |
| --- | --- |
| `03f12c8` | measure pageable cache values with response JSON semantics |
| `9a40ff8` | accept checkpoint-bound cold evidence |
| `d38b76f` | reuse watcher-disabled status proofs |
| `f8a3793` | accept fully compared prepared-cold proofs |
| `013e56c` | accept checkpoint-revalidated warm proofs |
| `23b2e7d` | identify measured freshness mutations |
| `78071da` | compare complete source before fallback sync, after ignore reconciliation |
| `a2b6026` | validate checkpoint-backed readiness phases |
| `207229a` | accept complete source-unchanged capture isolation |
| `8c6f79a` | refresh exact-path readiness diagnostics after the final source barrier |

The authoritative lifecycle decision changed in
`packages/mcp/src/core/sync.ts`, with its caller contract in
`packages/mcp/src/core/handlers.ts`. Recorder validators changed only in
`scripts/satori-useful-context-record.mjs`,
`scripts/satori-useful-context.mjs`, and
`scripts/satori-search-candidate-capture.mjs`; their adjacent tests retain the
publication, digest, membership, eligibility, grouping, ordering, and replay
oracles.

The product repair preserves these invariants:

```text
watcher disabled + complete unchanged source -> no sync
source content differs                       -> normal sync
ignore policy differs                        -> ignore reconciliation and sync
checkpoint unavailable or incompatible       -> normal fail-closed path
```

Focused product tests proved unchanged-source skip, changed-source sync,
ignore-reconciliation failure retention, and the handler-to-SyncManager
ownership contract. Recorder/capture changes accept only complete checkpoint-
bound proof shapes and `skipped_recent` or `skipped_source_unchanged`; they do
not relax publication identity, candidate digest, grouping, eligibility, or
exact replay gates.

Post-fix PromptReady, FastContext, and Recovery Dashboard captures and exact
baseline replays were produced under the already-consumed opening. They are
preserved outside the repository for incident audit and explicitly have no
quality-decision authority. AI Studio Prompt Library indexing completed, but
its positive observation run stopped when the exact fast-path response exposed
stale pre-barrier readiness diagnostics. Portfolio and Supply Chain API were
not indexed. No D32 held-out scoring, bootstrap aggregate, or quality metric was
run or opened.

## Split authority failure

Materialization audit:

```text
path     /home/hamza/repo/satori-track-o-o3-materialize-20260804-1XAnhP/track-o-o3-materialization-audit.json
SHA-256 e182ac190e037676095e94ee06ac90b8b789b8a5ee74b349f45cc143e9303f37
```

| Repository | Decision-bearing quality | Safety | Negative |
| --- | ---: | ---: | ---: |
| PromptReady | 5 | 0 | 2 |
| FastContext | 6 | 0 | 2 |
| Recovery Dashboard | 6 | 0 | 2 |
| AI Studio Prompt Library | 6 | 1 | 2 |
| Portfolio | 6 | 1 | 2 |
| Supply Chain API | 6 | 1 | 2 |

The frozen authority requires at least six decision-bearing quality tasks per
repository. PromptReady fails that minimum after the pre-open exclusion of
`promptready-primary-action`. Even without the consumed-opening failure, this
split could produce at most diagnostic evidence and could not authorize
`offline_lateon_held_out_qualified` or activation.

## Terminal boundary

Track O is complete with a protocol terminal, not a model-quality verdict.
Historical Track L remains `baseline_b_retained`. Track P and Track I remain
qualified. D32-v2's O2 operational pass remains valid. A future LateOn held-out
decision requires a newly sealed, independently reviewed suite and a new
prospective opening authority; exposed tasks from this split cannot be reused
as unseen evidence.
