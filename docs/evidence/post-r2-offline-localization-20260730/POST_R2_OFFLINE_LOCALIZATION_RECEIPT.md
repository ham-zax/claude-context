# Post-R2 offline localization receipt

Date: 2026-07-30 (Asia/Shanghai)

## Verdict

The five R1 hard misses do not share one cause:

* one is a query-route and lexical product-admission failure;
* one is a dense-depth and core-fusion-limit failure;
* one is a core-fusion admission failure despite strong lexical recall; and
* two are benchmark identity/granularity mismatches, not retrieval misses.

The `tradingview-qap-owner` incompatibility is localized to the
publication-bound source-checkpoint comparison. The manifest bytes, relevant
source bytes, candidate chunk identities and canonical symbol instance are the
same as the successful live owner receipt. The immutable R1 evidence does not
retain whether the checkpoint comparison returned `differs` or `unavailable`,
so it cannot prove the remaining subcause.

This evidence does not authorize R3 or held-out access. The owner-publication
boundary must be explained and requalified before an owner-authority ablation.
The three real retrieval/admission failures should be routed separately rather
than sent directly to an embedding-model experiment.

## Authority and boundary

This diagnosis used only:

```text
R0/R1 manifest seal:
  dd93051e0d56c2070078d050e7145708cecca5f4f7ea56b0dadeae8b78ab3eaa
R1 archive SHA-256:
  c5bab8e806f159e7eb52340ecb9c44732aa746a603886ea27fa09c43a84d6d92
R2 archive SHA-256:
  162f7262967c1627ac8c1bf5f07dd540df70b97a438f83ec7b4252bd5ce20966
successful owner-aware live receipt SHA-256:
  e3971ccb9bdfbceee83e235ec038e64fb75fb41c2cfc01875791a6a5764a6a62
```

Pinned source blobs named by the manifest were inspected read-only to validate
oracle meaning. No index was created, queried or modified. No search provider,
embedding model, reranker or held-out artifact was accessed. No production
code or policy was changed.

For source symbols, the trace follows the canonical `symbolInstanceId` found
in `mcp_replay_signals` back through every captured stage. It does not treat
another chunk from the expected file as the expected owner.

## Hard-miss classification

| Task | Dense | Lexical | First wrong boundary | Registry/chunking | Oracle result | Route |
| --- | --- | --- | --- | --- | --- | --- |
| `tradingview-backtest` | not run | exact owner rank 82 in fallback arm | fallback arm to product `core_result`; product limit was 80 and `core_result` was empty | exact `run_backtest` instance present | owner correct | query planning and lexical admission |
| `satori-final-score` | exact owner rank 151 | exact owner absent | removed after `core_fusion` with `core_fusion_limit` | exact function instance and chunk present | owner correct | Track F candidate depth/projection, then fusion |
| `satori-query-plan` | exact-owner chunks at 115 and 158 | exact-owner chunks at 2, 16 and 24 | removed after `core_fusion` with `core_fusion_limit` | exact function instance and chunks present | owner correct | fusion admission; not embeddings first |
| `satori-entrypoint-intent-test` | owning test instance rank 1 | owning test instance rank 1 | no retrieval failure; grouping converts the accepted owner to a file result | instance survives fusion rank 1, filtering rank 1 and local ranking rank 1 | named test is correct, but symbol-only acceptance is too strict | benchmark identity/granularity |
| `satori-ranking-plan-document` | owning document instance rank 1 | owning document instance rank 1 | no retrieval failure; grouping converts the accepted owner to a file result | document instance survives filtering and local ranking at rank 1 | document is correct, but heading-symbol acceptance is too strict | benchmark identity/granularity |

### `tradingview-backtest`

The query was:

```text
Which function runs a complete backtest for a configured pair?
```

The word `configured` selected:

```text
route:
  configuration
retrieval:
  lexical
semantic passes:
  1
rerank calls:
  0
```

No dense stage was executed. Strict lexical retrieval returned zero candidates.
The fallback lexical trace contained the exact owner:

```text
file:
  src/python/core/backtest/runner.py
symbol:
  run_backtest
symbolInstanceId:
  syminst_9b2784d30a6597411b49b8e709ac9bb2
candidate:
  chunk_711e284622336460
fallback lexical rank:
  82 of 160
product candidate limit:
  80
```

The next product stage, `core_result`, contained zero candidates, and no
eligibility stage was reached. Replay-signal reconstruction independently
resolved the same function instance and chunk. The pinned implementation owns
the complete backtest workflow, so the oracle is not contradicted.

This is not evidence that the dense embedding missed the owner: dense retrieval
was disabled by the route. The first investigation owner is query routing,
specifically the broad `configured` configuration cue, followed by lexical
fallback product admission.

### `satori-final-score`

The exact owner was:

```text
file:
  packages/mcp/src/core/search-ranking-policy.ts
symbol:
  computeSearchCandidateFinalScore
symbolInstanceId:
  syminst_f9424ff93d2944b05790ba295aa67161
candidate:
  chunk_836a535239ae3893
dense rank:
  151 of 160
product candidate limit:
  80
removal:
  core_fusion_limit
```

The lexical fallback found related constants and functions in the same file but
not the exact function. The exact owner never entered the eligible union.
The pinned function is the score-composition owner, so the oracle remains
correct.

This is a real first-stage product-depth miss. Track F should first compare
candidate depth and document/query projection; an embedding change is only one
possible treatment.

### `satori-query-plan`

The exact owner was:

```text
file:
  packages/mcp/src/core/search-query-planning.ts
symbol:
  buildSearchQueryPlan
symbolInstanceId:
  syminst_1e08e53209d47a52744cdda160e7ba7e
dense ranks:
  115, 158
fallback lexical ranks:
  2, 16, 24
removal:
  core_fusion_limit
```

The exact function was strongly present in the lexical fallback arm but absent
from `core_fusion`, `mcp_pass`, the eligible union and disclosure. The pinned
function returns the production query plan, so the oracle remains correct.

Because lexical recall already placed the owner at rank 2, this should route to
fallback-arm and core-fusion admission before any embedding evaluation.

### `satori-entrypoint-intent-test`

The captured test instance was:

```text
file:
  packages/mcp/src/core/search-query-support.test.ts
symbolInstanceId:
  syminst_b549925e0042ec83d4fcebe0796181cd
raw dense:
  rank 1
fallback lexical:
  rank 1
core fusion:
  rank 1
mcp filtered:
  rank 1
mcp ranked:
  rank 1
disclosed:
  file result at rank 2
```

The instance covers the pinned named test, including the mixed-cue cases. The
grouped result has file identity and no symbol label, so the benchmark's
symbol-only matcher reports a hard miss even though the correct test file is
disclosed second.

The semantic oracle is correct. Its accepted result identity is not compatible
with Satori's grouped representation for this test node. This task needs a
preregistered file-level acceptable owner or a qualified test-symbol identity;
it must not be used as a retrieval miss in its current form.

### `satori-ranking-plan-document`

The captured document instance was:

```text
file:
  docs/plans/SATORI_CROSS_REPOSITORY_RANKING_ABLATION_PLAN.md
symbolInstanceId:
  syminst_7ba93a1ef41f05e7d29ce4325be48ed8
raw dense:
  rank 1
fallback lexical:
  rank 1
mcp filtered:
  rank 1
mcp ranked:
  rank 1
disclosed:
  file result at rank 1
```

The expected plan is already the first disclosed result. Its chunks share a
document instance without a projected heading label, and grouping discloses the
file. Requiring the Markdown title as a symbol therefore creates a false hard
miss.

The document oracle is correct. Its acceptance identity should be file-level
for grouped disclosure.

## Owner-publication reconciliation

Both observations use the same repository revision and Git tree:

```text
revision:
  8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7
tree:
  2969002a2aa46948d6557ac5f5c70e19355c80a7
```

The live checkout had unrelated dirty files while the R1 worktree was clean.
The two authoritative owner inputs were nevertheless byte-identical:

```text
pyproject.toml:
  2a6ee46bfa6ac61b03d1c2caf12857efa37cf2d5560fef6e485adbc17dc663e7
src/cli/main.py:
  f8460655bd60dd8311585e6071c47508af388f3b15f69f1eec882b7c4a01b71f
```

| Identity | R1 publication | Successful live publication |
| --- | --- | --- |
| Collection | `hybrid_code_chunks_b13bdd72__gen_run_c18d6f3b_5b22_4c22_8d2e_b7b181189949` | `hybrid_code_chunks_a28de7b6__gen_run_24c3ceb9_ffa4_47c5_8a9a_9b1e94345c3c` |
| Marker | `51a6e80a-e377-4557-87e8-59f10e7d6cbb` | `11276d2f-7a64-49ae-81ca-2cecbcac296f` |
| Resolved index-policy hash | `0e19e8c19c7dbc7c7625e297278984859ddffd9276e7ed498d64c391176a4092` | same |
| Policy-document digest | `f2f280495813ae04dd062fe82f4a88bb95963001daa4515b85993b16310be5aa` | `52fdc078772afaa08ebc8085172e9e7587c685861366b7dd70c0e4534ec3cf7f` |
| Navigation generation | `symmanifest_4cc3-a724219a74ccb3f9` | `symmanifest_b3f3-776f707b4c7f29cd` |
| Registry manifest | `symmanifest_4cc3fa01d1ae44387bb15e970d3de1d5` | `symmanifest_b3f3d52c998c9dffd78059b0ae76aa78` |
| Publication identity | `5501f0728c8b8eb08b265e3cb4e834799a55c9a68c551b2cbf99f1225c74e177` | `080fe33dcdf899cd53dc6e96c5d07bf242a83e04a865bfbb316a2937d217e171` |
| Manifest source identity | `2a6ee46b...63e7` | same |
| `symbolInstanceId` | `syminst_edc7e64840cd907f000b078ad184d322` in captured candidates | same exact resolved owner |
| `symbolKey` | not retained after fail-closed replacement | `symkey_58d375ee2d736e2b8072373783290969` |
| Resolution | declared 1, exposed resolved 0, `publication_incompatible` | declared 1, resolved 1, exact |

The different policy-document digests do not imply different path policy. The
canonical policy document includes the canonical root, collection, navigation
and publication binding; those identities differ while the resolved
index-policy hash is identical.

The two owner chunks also have identical persisted candidate identities in
both publications:

```text
chunk_f804cc86e9cf92d5
chunk_b91d4a3d223aef76
```

Both bind to the same `cli_entry_point` symbol instance. R1 applies zero owner
score; the live receipt applies `0.35`.

## First wrong owner-evidence boundary

The ranking handler:

1. prepares the manifest and attempts owner resolution against the publication
   registry;
2. calls `compareSourcePathsToFreshnessCheckpoint(..., ["pyproject.toml"])`;
3. accepts the prepared resolution only when that comparison returns
   `matches`; and
4. replaces every other comparison result with `publication_incompatible`,
   clears owners, and discards the prepared resolution.

R1 reached step 4. The successful live receipt reached step 3. R1 does not
retain the prepared resolution that existed before step 4, so it cannot prove
whether that discarded resolution already contained the exact owner.

The relevant lifecycle difference is:

```text
R1 cold and warm observations:
  freshness mode = skipped_recent
  owner status = publication_incompatible

successful live publication, first owner-aware query:
  freshness mode = synced
  sync changes = added 0, removed 0, modified 0
  owner status = resolved

later live queries:
  freshness mode = skipped_source_unchanged
  owner status = resolved
```

The byte-identical manifest and source, identical owner chunks, and identical
canonical symbol instance make a parser, target-path or registry mismatch
unlikely. The first directly observed mismatch is ownership or validation of
the publication's source freshness checkpoint.

The strongest artifact-supported hypothesis is that the freshly indexed R1
publication could not validate `pyproject.toml` through its owned checkpoint,
while the live publication could after a zero-change sync refreshed or
re-established that checkpoint authority. This is a hypothesis, not a proven
subcause: the capture collapses `differs` and `unavailable` into the same
status and does not retain the checkpoint's expected path hash or comparison
reason.

## Routing decision

```text
tradingview-backtest
  -> query-route qualification, then lexical product admission

satori-final-score
  -> Track F candidate-depth/projection investigation

satori-query-plan
  -> fallback lexical/core-fusion admission investigation

satori-entrypoint-intent-test
  -> benchmark accepted-identity correction

satori-ranking-plan-document
  -> benchmark accepted-identity correction

tradingview-qap-owner
  -> source-checkpoint publication-binding diagnosis and deterministic
     owner-evidence requalification
```

R3/LateOn remains closed. It cannot repair a disabled owner-evidence path, a
query routed away from dense retrieval, or candidates discarded before the
eligible union.

R2's frozen decision remains unchanged: keep baseline `B`. Before another
ranking or neural experiment, the benchmark should stop counting the two
grouped file answers as retrieval misses, and the owner-publication boundary
must retain enough comparison evidence to distinguish source drift from
checkpoint unavailability.
