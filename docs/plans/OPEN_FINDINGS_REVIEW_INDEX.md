# Satori open findings review index

Status: active decision ledger

Created: 2026-07-25

Current status: the fresh-reindex owner publishes complete canonical V4
authority, healthy repair is an exact no-op, and corrected C4 add/modify/delete
freshness passes for `.py`/`runtime` and `.txt`/`mixed`. All six bounded native
Python relationship witnesses survived the lifecycle. Core passed 595 tests
with one skipped and no failures before watcher integration. The qualified
watcher candidate adds one Core regression and completes with Core 596 passed,
1 skipped, 0 failed and MCP 1,051 passed, 0 failed. Watcher observation-only
qualification passes: events no longer trigger automatic indexing after five
seconds; search, explicit sync, and periodic background synchronization remain
the only publication triggers. Pending events bypass search recency through
the existing freshness owner, later events invalidate source-bound
continuations, and `call_graph`/`file_outline` remain non-mutating.
`MCP_WATCH_DEBOUNCE_MS` is accepted but ignored and excluded from effective
shared-runtime identity. The delete-triggered completion race was repaired in
the existing retention/V4 proof owner without weakening validation or adding a
publication authority; add/modify/delete/restart qualification passed. The
previous blocked watcher qualification remains historical evidence.
General Python inbound completeness is not claimed. CodeQL is excluded from
the release runtime and rejected as authoritative Python `CALLS` evidence.
At revision `4138b1e…`, cold first `call_graph` measured `7,204.25 ms` p50 and
`7,530.10 ms` p95 after startup; calls measured after two preparation calls
were `11.97 ms` p50 and `13.57 ms` p95. Memory is
`memory_retained_capacity_bounded` over six publications, not a proven plateau
or multi-day guarantee. The separate deployment contract requires at least
2 GiB available runtime capacity based on an earlier `1,447.21 MiB`
incremental-publication peak. The cold and memory characterization was not
rerun after current master's full-reindex V4 authority-publication change, so
it remains retained release characterization rather than strict current-master
performance proof. Cold-graph optimization and semantic abstention are
deferred and are not native-release blockers.

## 1. Purpose

This index separates the two Satori 6.3.0 findings that remained without
dedicated repair plans:

1. source-checkpoint integrity after repair; and
2. calibrated semantic relevance and abstention.

They share historical qualification evidence, but they do not share an owner,
persisted state, implementation batch, public contract, or closure decision.
Neither workstream can pass or fail the other.

The independently reviewable plans are:

- [Checkpoint integrity repair review](./CHECKPOINT_INTEGRITY_REPAIR_REVIEW.md)
- [Semantic abstention qualification review](./SEMANTIC_ABSTENTION_QUALIFICATION_REVIEW.md)

Related records:

- [Current capability report](./report.md)
- [Python inbound relationship coverage repair plan](./SATORI_PYTHON_INBOUND_RELATIONSHIP_COVERAGE_REPAIR_PLAN.md)
- [General incremental freshness plan](./INCREMENTAL_INDEX_FRESHNESS_PLAN.md)
- [V4 repair authority and corrected C4](../evidence/repair-authority-c4-20260726/REPAIR_AUTHORITY_C4_RECEIPT.md)
- [Cold call-graph characterization](../evidence/cold-graph-memory-20260726/COLD_CALL_GRAPH_RECEIPT.md)
- [Incremental-publication memory characterization](../evidence/cold-graph-memory-20260726/INCREMENTAL_PUBLICATION_MEMORY_RECEIPT.md)
- [Deferred cold call-graph optimization](./COLD_CALL_GRAPH_DEFERRED_OPTIMIZATION.md)
- [Watcher observation-only final qualification](../evidence/watcher-observation-only-final-20260726/WATCHER_OBSERVATION_ONLY_FINAL_RECEIPT.md)
- [Incremental delete-publication repair](../evidence/incremental-delete-publication-20260726/INCREMENTAL_DELETE_PUBLICATION_RECEIPT.md)
- [Watcher decoupling W0 baseline](../evidence/watcher-decoupling-w0-20260726/WATCHER_DECOUPLING_W0_RECEIPT.md)
- [Historical blocked watcher qualification](../evidence/watcher-observation-only-20260726/WATCHER_OBSERVATION_ONLY_RECEIPT.md)
- [Watcher observation/publication decoupling plan](./MCP_WATCHER_OBSERVATION_AND_SYNC_DECOUPLING_PLAN.md)

This index does not reopen the closed large-index repair-proof defect or the
closed empty-inbound-graph disclosure defect.

## 2. Shared evidence freeze

| Input | Frozen value |
| --- | --- |
| Satori source revision | `3764b740d0f55081f98cc33fd4f6236046de8712` |
| Qualification target | `/home/hamza/repo/tradingview_ratio` |
| Target revision | `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` |
| Target Git state | `main...origin/main [ahead 1]`; `M opencode.jsonc`; `?? cc.json` |
| Qualifying runtime | Satori MCP 6.3.0 |
| Provider and store | Potion, dimension 256; LanceDB; `hybrid_v3` |
| Relationship fingerprint | `1a0b4c9e9d3f` |
| Final collection | `hybrid_code_chunks_a28de7b6__gen_run_286e1cf6_06fe_4c60_a993_903db817de93` |
| Final marker | `7adeab5b-1a28-4ed6-968e-9fa4399f0443` |
| Final payload | 1,519 files; 19,741 chunks |

The original qualification did not retain:

- complete serialized MCP requests and responses;
- the complete effective argument set for every semantic control;
- pre/post repair marker, checkpoint, publication, and navigation artifacts;
- exact watcher state during the freshness timing; or
- reusable raw semantic-ranking evidence.

Therefore neither plan may call a reconstructed invocation an exact replay.
Each C0/S0 receipt must freeze a **new canonical reproduction request** from
retained evidence and the current public schema, and record every field as:

```text
field
value
provenance:
    retained_original
    current_schema_required
    canonical_default
    unresolved_original
```

Comparisons to the 6.3.0 report are behavioral comparisons unless an original
durable request is recovered and its digest is verified.

Effective configuration is part of the evidence. The task-owned protected
artifact must retain the exact relevant configuration and environment values.
The portable receipt retains hashes and redacted effective values, not
credentials. `opencode.jsonc` and `cc.json` must be reproduced or proven
irrelevant to the workstream being qualified.

## 3. Evidence vocabulary

Use these terms without substitution:

| Level | Meaning |
| --- | --- |
| `runtime-observed` | A public operation or response was directly recorded |
| `artifact-observed` | Durable persisted state was directly read and hashed |
| `source-read` | Exact implementation source was inspected |
| `mechanism-supported` | Source and control flow identify a defect-capable mechanism |
| `intervention-proven` | A controlled change moves the predicted internal boundary and the product witness |
| `unresolved` | Retained evidence cannot distinguish the candidate explanations |

An exact source line is not runtime-observed behavior. A mechanism-supported
explanation is not a proven cause.

For each workstream, preserve:

```text
visible failure
-> first runtime or artifact mismatch
-> violated contract
-> responsible owner
-> falsifiable repair
-> nearest authoritative readback
```

Use task-owned source materializations, state roots, vector-store paths, and
fixtures. Do not repair, sync, reindex, clear, or otherwise mutate the user's
existing index during qualification.

## 4. Independent authorization

### Checkpoint integrity

| Batch | Current decision |
| --- | --- |
| C0 | `repair_owned_transition_proven`; use the selected V4/no-op/fail-reindex model: healthy state is an exact no-op, a valid source tuple with damaged navigation receives V4 graph/navigation activation, and missing/corrupt/changed source authority fails to explicit reindex |
| C1 | `checkpoint_c1_pass`; healthy proven V4 is an exact no-op, while V3 and missing/corrupt/ambiguous authority fail to explicit reindex |
| C2 | `checkpoint_c2_pass`; valid V4 graph-only activation preserves source authority, validates every successful MCP repair checkpoint, exposes later writes as the next delta, and retains and reactivates the prior readable V4 tuple |
| Fresh-reindex authority correction | `product_defect_fixed`; `ManageIndexingHandlers.startBackgroundIndexing` now publishes the existing canonical V4 binding after full reindex |
| C3 | Deferred and outside this release; no broader concurrency or failure-injection work is authorized |
| C4 | `pass`; corrected `.py`/`runtime` and `.txt`/`mixed` add-modify-delete lifecycles passed after healthy repair, restart, and zero-change sync |

### Semantic abstention

| Batch | Current decision |
| --- | --- |
| S0 | Deferred; do not change semantic thresholds, response contracts, or runtime abstention policy |
| S1 | Not authorized; ground truth, model search space, budgets, and applicability must be frozen first |
| S2 | Not authorized; requires one preregistered candidate to pass validation without a new dependency |
| S3 | Not authorized; response invariants, migration, and notice severity must be approved first |
| S4 | Not authorized; requires sealed holdout governance and completed lower-layer contracts |

There is no combined checkpoint-and-semantic pass/fail state. Each plan retains
its exact terminal outcome and stopping reason.

### Watcher observation and publication

| Work | Current decision |
| --- | --- |
| W0 | `watcher_decoupling_supported`; retained as the read-only baseline and cost record |
| Historical observation-only qualification | `watcher_decoupling_blocked`; preserved as evidence that the existing incremental delete owner failed complete-generation validation through an allowed search trigger |
| Incremental delete publication | `incremental_delete_publication_pass`; the retention-flight proof race is repaired through the existing canonical V4 owner, with validation unchanged |
| Final observation-only qualification | `watcher_observation_only_pass`; watcher events are observation-only, existing freshness triggers consume pending evidence, and add/modify/delete/restart readback passes |
| Publication ownership | Unchanged; no watcher-owned timer publication, second synchronizer, or second publication authority remains |

### Python relationship coverage and provider disposition

| Work | Current decision |
| --- | --- |
| Python R0–R4 | `python_inbound_recorded_sites_pass`; constructor, bounded service/callback, and ledger patterns passed while partial-coverage disclosure remains authoritative for unsupported patterns |
| Bounded native language implementation | Integrated by `cbde1a890aa81ebaffaf9deae92eab650ca61bd0`; Satori remains the owner of normalized relationship identity, publication, traversal, provenance, and completeness disclosure |
| Product budget | Approved only for the frozen repository class with at least 2 GiB runtime allowance; not approved for a roughly 1 GiB deployment |
| Production CodeQL/SCIP integration | Not authorized; the [portable CodeQL receipt](../evidence/codeql-python-20260725/CODEQL_PYTHON_RECEIPT.md) and [provider disposition](./CODEQL_RELATIONSHIP_PROVIDER_DISPOSITION.md) reject CodeQL as authoritative Python `CALLS` while retaining only optional offline/asynchronous advisory use under separate qualification |

### Release characterization

| Finding | Current decision |
| --- | --- |
| Corrected controlled freshness | Pass for `.py` with `scope=runtime` and `.txt` with `scope=mixed`; no general watcher-continuity claim is added |
| Cold first `call_graph` | At revision `4138b1e…`, startup was p50 `645.95 ms`; the first graph call after startup was p50 `7,204.25 ms`, p95 `7,530.10 ms`. `cold_graph_multi_owner`: checkpoint/completion validation about 3.24 seconds and relationship loading/validation about 2.59–3.20 seconds; adjacency construction about 21 ms |
| Warm `call_graph` | At revision `4138b1e…`, p50 `11.97 ms`, p95 `13.57 ms`, range `10.97–22.77 ms`, after two preparation calls |
| Incremental-publication memory | At revision `4138b1e…`, `memory_retained_capacity_bounded`, not a plateau: six publications with 120-second settling, three retained generations, no monotonic heap/RSS/external-memory/cache growth, peak RSS `881.82 MiB`; no multi-day guarantee |
| Runtime capacity | At least 2 GiB available capacity is required by the qualified deployment contract as an allowance, not measured steady use; earlier integration evidence observed a `1,447.21 MiB` incremental-publication peak |
| Measurement applicability | Cold and memory measurements were not rerun after current master's full-reindex V4 authority-publication change; retain them as revision-`4138b1e…` release characterization, not strict current-master proof |
| Semantic abstention | Deferred; no relevance-threshold, response-contract, or runtime-policy change is part of this release |
| Watcher observation-only | Passed; no automatic work after the former debounce interval, existing freshness triggers consume pending events, continuations invalidate after later events, and navigation tools remain non-mutating |
| Incremental delete publication | Passed; the existing retention flight settles and reproves the active generation before completion, preserving fail-closed canonical V4 validation |
| Package verification | Core 596 passed, 1 skipped, 0 failed; MCP 1,051 passed, 0 failed |

## 5. Current report status

The 2026-07-26 native-only release decision at the top of `report.md` is the
single current capability decision. Earlier 6.3.0 and 6.2.0 sections remain
historical evidence and do not override it.

The six-site Python caller-coverage finding is closed only for the static
patterns qualified by its separate Python plan. General Python inbound
coverage remains partial and non-exhaustive. Corrected controlled freshness
passes. Watcher observation-only qualification also passes without adding
publication authority; the historical blocked receipt remains preserved as the
record of the independently repaired delete-publication race. No multi-day
memory guarantee is claimed.

## 6. Integration stewardship and merge/version ledger

This ledger is the integration boundary for the authorized work. C1/C2 are
present in base `c07eb3807639810a08f59d2ce73825bc5de8caba`. The optimized
native Python implementation and its retained evidence were integrated by
`cbde1a890aa81ebaffaf9deae92eab650ca61bd0`. The fresh-reindex V4 authority
owner correction is `96332975a5f06722ccf5089d486c92c318f375b5`; its qualified
code-and-test tip is `5ebe57f099db4b355cf7c67464e8f13db491b672`, and its
durable qualification evidence is
`f8b65867ab09b18af4e94edcf65d7d11894621d4`. The CodeQL experiment did not
become runtime authority; its portable evidence is integrated from
`cfa9491bdd4c119b96b9ede2524f0e88c4bf1a9f` through the
[receipt](../evidence/codeql-python-20260725/CODEQL_PYTHON_RECEIPT.md) and
[provider disposition](./CODEQL_RELATIONSHIP_PROVIDER_DISPOSITION.md).

### Ownership and merge order

- Preserve branch, worktree, staging, and untracked-file ownership. Do not
  rebase, stash, stage, clean, or rewrite another owner's work as part of
  integration.
- The checkpoint implementation and its focused acceptance evidence landed
  first.
- Native qualification used that merged checkpoint baseline.
- The native integration passed the affected Core and MCP checks, real
  candidate-built publication, restart, six controlled syncs with source
  restoration, and full/incremental equality.

The exact source/base revisions, changed files, checks, resource observations,
compatibility decision, and artifact digests are recorded in the
[native integration receipt](../evidence/python-native-integration-20260725/NATIVE_PYTHON_INTEGRATION_RECEIPT.md).

### Version and compatibility consequences

| Change | Required consequence |
| --- | --- |
| Checkpoint C1/C2 | If the selected V4 publication, persisted schema, marker interpretation, or compatibility fingerprint changes, update the authoritative version/fingerprint and record migration/reindex requirements in the same owner-bounded change. If no persisted/public contract changes, do not invent a version bump. |
| Native Python relationship implementation | If normalized relationship semantics or navigation artifacts change, update the relationship/navigation compatibility owner and record targeted reindex/requalification impact. Preserve vector identity and do not silently accept incompatible artifacts. |
| Final integration | Run affected full tests after both implementations, then update current documentation, generated projections, release/version references, and acceptance receipts only where the merged contracts require it. |

## 7. Structural-change guard

Do not perform a structural refactor until the checkpoint and Python
acceptance gates pass. Any later refactor must be behavior-neutral: preserve
the normalized relationship digests and publication digests, introduce no new
behavior, and remain separate from compatibility or contract changes. A digest
change or new behavior is an implementation change and requires its own
decision rather than being labeled a refactor.
