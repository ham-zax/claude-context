# Satori MCP capability report

## Satori 6.3.0 requalification

This section records a bounded requalification completed on 2026-07-25. It
supersedes the current decision from the original Satori 6.2.0 assessment
below, but it does not rewrite that historical evidence.

### Decision

Satori 6.3.0 closes the large-repository repair-proof defect and the
empty-inbound-graph disclosure defect. It does **not** qualify the system as
fully resolved:

- Python inbound caller coverage still has demonstrated false negatives.
- The active source freshness checkpoint was corrupt, so incremental sync and
  freshness timing failed.
- Semantic search still has no calibrated abstention/no-answer contract.

The original two production-completeness findings therefore cannot both be
retired. The 16,384-row repair-proof finding can be retired; inbound caller
coverage cannot.

### Current implementation disposition (2026-07-25)

The requalification above remains the historical runtime record; it is not
rewritten by the current shared-worktree implementation. The checkpoint
C1/C2 execution record now reports the following frozen V4 model:

- A fully proven healthy V4 publication is an exact no-op with no vector,
  marker, checkpoint, policy, graph, or navigation authority writes.
- A valid V4 source tuple with damaged navigation activates only a new
  graph/navigation generation while preserving marker and source-checkpoint
  authority.
- V3, missing, corrupt, changed, or ambiguous source authority returns
  `requires_reindex` rather than fabricating authority.
- MCP repair success now validates the effective source checkpoint and, for a
  V4 activation, its exact document digest.

The reported bounded verification passed 27 focused Core repair tests, 13
focused MCP repair-handler tests, and all 1,047 MCP package tests. The Core
package result was 584 passed, 3 failed, and 1 skipped out of 588; a controlled
run with the prior navigation-resolver behavior reported the same three
failures. Those residual failures remain an integration record, not evidence
of a fully green product qualification. The implementation is not yet merged.

The current relationship disposition is `native_python_bounded`: bounded
native Python implementation is authorized after the architecture corrections,
while no Python implementation is present in the current shared-worktree
change set. Production SCIP integration remains unauthorized. Semantic S0 is
deferred, with no runtime abstention-policy change authorized. The checkpoint
must merge and establish its version/fingerprint/reindex consequence before
language qualification proceeds; the decision ledger records the ownership and
merge gates.

### Requalification evidence boundary

| Evidence input | Recorded value |
| --- | --- |
| Target repository | `/home/hamza/repo/tradingview_ratio` |
| Target revision | `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` |
| Initial and final target branch state | `main...origin/main [ahead 1]` |
| Initial and final target changes | `M opencode.jsonc`; `?? cc.json` |
| Satori source revision | `3764b740d0f55081f98cc33fd4f6236046de8712` |
| Runtime under evaluation | Satori MCP 6.3.0 |
| Live runtime ownership | PID 1412; one owner |
| Lifecycle generation | 3350 |
| Collection | `hybrid_code_chunks_a28de7b6__gen_run_286e1cf6_06fe_4c60_a993_903db817de93` |
| Completion marker | `7adeab5b-1a28-4ed6-968e-9fa4399f0443` |
| Provider and store | Potion, dimension 256; LanceDB; `hybrid_v3` |
| Runtime relationship fingerprint | `1a0b4c9e9d3f` |
| Final payload | 1,519 files; 19,741 chunks |
| Final search lifecycle | `status=ok`; `phase=completed` |
| Final incremental freshness state | Source checkpoint corrupt; incremental sync disabled |

No staged target changes existed. The five freshness probes were removed, and
the final target Git status matched the initial status exactly.

A reindex was required before qualification. Initial status returned
`requires_reindex` because the indexed relationship fingerprint was
`c692aa46b050` while the Satori 6.3.0 runtime required `1a0b4c9e9d3f`. Other
fingerprint components matched. The authorized reindex completed
successfully, and Python semantic search, exact symbols, outlines, and call
graph were then reported ready.

The run did not expose raw MCP progress notifications. It also did not retain
complete serialized requests and responses as durable artifacts. Claims below
are therefore bounded to the structured values and exact source reads recorded
by the qualifying agent.

### Finding decisions

The evidence levels below mean:

- `intervention-proven`: the reported outcome was reproduced through the
  relevant state transition and retained in the qualification record;
- `observed`: the public behavior or exact source state was directly observed;
- `source-supported`: source inspection identifies a defect-capable mechanism
  but no before/after intervention proves it caused the observed outcome; and
- `unresolved`: the available client or artifact could not test the contract.

| Finding | Observed evidence | Result | Evidence level | Current decision |
| --- | --- | --- | --- | --- |
| Large-repository repair proof | Repair returned `status=ok`; payload basis `same_state_membership_and_exact_count`; expected and observed 19,741; missing and extra zero; stale payload matched; no reindex hint | Pass | Intervention-proven | Retire the specific 16,384-row proof-limit defect |
| Python inbound caller coverage | All three target symbols returned zero inbound edges despite exact production callers confirmed by Satori search and reads | Fail | Observed | Keep inbound graph non-exhaustive; establish the first wrong relationship/graph boundary before repair |
| Empty-graph disclosure | Every empty inbound response included `CALL_GRAPH_INBOUND_COVERAGE_PARTIAL` and an executable `must:` verification search | Pass | Observed | Retire the missing-disclosure defect, not the coverage defect |
| Semantic abstention | All four negative controls returned ten nearest-neighbour groups without a zero-result, weak-relevance, or no-answer warning | Unqualified: `nearest_neighbor_without_calibrated_no_answer_contract` | Observed | Define and validate a calibrated contract before making a production no-answer claim |
| Freshness timing and checkpoint integrity | Five corrected add/modify/delete cycles produced no observable indexed transition; recovery sync returned `requires_reindex` because the active source checkpoint was corrupt | Fail | Observed | Isolate and repair the responsible checkpoint lifecycle owner, then repeat timing qualification |
| Broad architecture query | `COMMAND_SPECS`, `accumulation_scan`, and `screen_pairs` appeared in the initial groups; continuation reached no additional expected discovery owner | Unqualified: expected owners reached within exposed groups | Observed | Make no broad retrieval-quality claim from this sample |
| Documentation query | The original report says “canonical-policy query” but does not preserve its exact query text | Unqualified: insufficient ground truth | Observed | Preserve exact query text in future qualifications |
| Progress-event ordering | The client exposed status polling but not raw MCP progress notifications | Unqualified: `not_testable_from_current_client` | Unresolved | Require raw notifications before qualifying their ordering |

### Large-repository repair proof

The Satori 6.3.0 repair returned:

```json
{
  "status": "ok",
  "payload": {
    "status": "matched",
    "basis": "same_state_membership_and_exact_count",
    "expectedCount": 19741,
    "observedCount": 19741,
    "missingCount": 0,
    "extraCount": 0
  },
  "staleRemoteChunks": {
    "status": "matched",
    "basis": "same_state_exact_count_no_extras",
    "extraCount": 0
  },
  "collection": "matched",
  "snapshot": "matched",
  "marker": "matched",
  "fingerprint": "matched",
  "navigation": "matched",
  "warnings": [],
  "hints": {}
}
```

The index remained searchable, and the positive control still returned
`SignalGenerator.check_entry` at `src/python/core/signals.py:290`.

This real 19,741-chunk result closes the earlier proof-limit finding. It proves
the supported LanceDB path used in this qualification; backends without
same-state observation or exact-count authority must still return a bounded
proof-limit result rather than falsely claim equality.

### Python inbound caller coverage

The active post-reindex symbol identities and results were:

| Symbol | Symbol instance | Observed graph result |
| --- | --- | --- |
| `SignalGenerator.check_entry` | `syminst_db0684c3f6f05b6df0addc5c3cb17e8e` | `callers`: one node, zero edges; `both`: four nodes and three correct callee edges, but zero inbound edges |
| `_evaluate_residual_type_invariant` | `syminst_5aaccd6ad2e7203a385dbce56e6a9861` | `callers` and `both`: one node, zero edges |
| `SignalLedger.record` | `syminst_10e3a141c4858369056b1655a60bb999` | `callers` and `both`: one node, zero edges |

Every empty inbound result correctly carried
`CALL_GRAPH_INBOUND_COVERAGE_PARTIAL` and an executable `must:` verification
hint. That closes the disclosure defect.

Independent Satori searches and exact reads nevertheless confirmed production
call evidence at:

- `src/python/core/opportunity_ranker.py:135` and `:256`
- `src/python/core/pair_evaluator.py:732` and `:738`
- `src/python/core/trading_core.py:256` and `:675`
- `src/python/core/backtest/gate_coordinator.py:475`
- `src/python/core/backtest/phases.py:129`
- `src/python/core/backtest/signal_recording.py:435`

The first three files contain the constructor bindings and
`check_entry(...)` call sites relevant to the bounded receiver repair. Because
the active Satori 6.3.0 relationship generation still published no inbound
edges, the real repository outcome remains false despite focused green tests.

This run does not establish whether the first wrong boundary is receiver
analysis, relationship emission, target identity, or reverse graph traversal.
That owner must be isolated before another repair. Until then, inbound graph
results remain advisory and require the returned deterministic `must:` search
or direct source verification.

### Semantic abstention

The fixed negative controls were:

```text
nonsense concept orbital banana transaction semaphore
xylophone banana nonexistent
quantum zucchini escrow nebula
cerulean toaster jurisprudence isotope
```

All four returned ten nearest-neighbour groups. None returned zero results or
emitted a weak-relevance/no-answer warning. This confirms the current
top-K-nearest-neighbour behavior; it does not establish a safe global
threshold. A returned semantic candidate remains evidence to inspect, not
proof that the query has a meaningful answer.

### Freshness timing and source-checkpoint integrity

Five corrected reversible cycles used unique temporary text files and exact
`must:<unique_token> <unique_token>` searches with `scope="mixed"` and file
grouping. Every add and modify phase timed out with zero result groups and
`FILTER_MUST_UNSATISFIED`. Because no added or modified token ever became
visible, the delete transitions were unobservable and no median or maximum
latency can be computed.

Recovery `sync` returned `requires_reindex` with:

```text
Generation checkpoint does not belong to the active completion marker.
```

Final search lifecycle remained `status=ok`, but its effective source
checkpoint was corrupt and incremental sync was unavailable. This is a real
freshness/checkpoint-integrity defect. The recorded sequence does not prove
whether reindex, repair, or another lifecycle transition introduced the
mismatch, so it does not yet establish the responsible owner.

### Current requalification verdict

Implementation defects verified closed in the historical requalification:

- Large-index repair proof-limit misclassification.
- Missing warning and verification hint for an empty partial inbound graph.

Demonstrated defects or closure gates still open:

- Python inbound caller coverage on the recorded production call sites.
- Final merged acceptance of the source-checkpoint correction and its
  incremental-freshness consequence; the historical checkpoint failure is
  addressed by the current frozen C1/C2 implementation but not yet a merged
  product qualification.

Product behavior still unqualified:

- Calibrated semantic abstention/no-answer behavior.
- General architecture or documentation retrieval quality.
- Raw progress-notification ordering.

Accordingly, **“everything is resolved” is not supported by the Satori 6.3.0
requalification**.

## Post-qualification root-cause hypotheses and design options

> **Supersession notice (2026-07-25).** The pass/fail observations in this
> report remain current. The checkpoint-identity and semantic-solution options
> below are not implementation authorization and are superseded by the
> [open-findings review index](./OPEN_FINDINGS_REVIEW_INDEX.md),
> [checkpoint integrity review](./CHECKPOINT_INTEGRITY_REPAIR_REVIEW.md), and
> [semantic abstention review](./SEMANTIC_ABSTENTION_QUALIFICATION_REVIEW.md).
> C0 has since established a repair-owned transition, and the frozen C1/C2
> implementation is recorded as passing its bounded acceptance checks while
> remaining unmerged. Native Python is the selected bounded path after
> architecture corrections; production SCIP integration is not authorized.
> Semantic S0 remains deferred.

This section records the bounded follow-up investigation completed on
2026-07-25. It identifies defect-capable mechanisms and candidate design
directions for the open findings. Source inspection and the transient Pyright
pilot do not establish intervention-proven causes or settle the broader
language-server, publication-identity, or abstention designs. It does not
change the pass/fail decisions above.

The current bounded decision is:

> C0 established a repair-owned checkpoint transition. C1/C2 use the existing
> V4 binding with exact healthy no-op, graph-only navigation activation for a
> valid source tuple, and explicit fail-reindex for missing, corrupt, changed,
> or ambiguous authority. Their bounded execution record is passing but the
> implementation remains unmerged and the Core residual failures remain open.
> Python uses the `native_python_bounded` path after architecture corrections;
> production SCIP integration is not authorized. Semantic S0 remains deferred.

| Open finding | Current evidence | Current decision | Required experiment |
| --- | --- | --- | --- |
| Python constructor-receiver callers | Source-supported leading mechanism: the current relationship module resolver rejects absolute Python imports | Bounded native implementation authorized after architecture corrections; exact acceptance remains open | Trace each production caller through import resolution, relationship emission, identity projection, and traversal; then intervene on the first observed mismatch |
| Python callback/service callers | Source-supported gap: current facts do not represent the sampled callable and service value flows | Bounded native model authorized only under a frozen support model with precision gates | Prove a bounded allocation-site or value-origin-sensitive model against exact positives and precision negatives |
| Source checkpoint corruption | Historical source inspection found a writer-validator incompatibility capable of producing the observed marker/checkpoint mismatch | C1/C2 frozen V4 model implemented; merge, residual Core-test reconciliation, and final acceptance remain open | Record the owner-preserving merge, version/fingerprint consequence, affected full tests, and documentation reconciliation |
| Semantic no-answer behavior | Observed top-K retrieval has no calibrated relevance decision | Abstention design unresolved | Compare calibrated fused-score features, a lightweight classifier, and a reranker on held-out realistic controls |

### Python inbound relationships: local source-supported evidence

The three `SignalGenerator.check_entry` callers use absolute imports and
constructor-bound receivers:

- `src/python/core/opportunity_ranker.py`: imports
  `python.core.signals.SignalGenerator`, assigns `self.signal_gen`, and calls
  `self.signal_gen.check_entry(...)`.
- `src/python/core/pair_evaluator.py`: performs a function-local absolute
  import, assigns `signal_gen`, and calls `signal_gen.check_entry(...)`.
- `src/python/core/trading_core.py`: performs a function-local absolute import,
  assigns `self.signal_generator`, and calls
  `self.signal_generator.check_entry(...)`.

Satori's relationship builder currently has this boundary:

```text
packages/core/src/relationships/builder.ts:218-229
```

`resolveRelativeModulePath(...)` immediately returns `undefined` when the
specifier does not start with `.`. `resolvePythonClassReference(...)` at
`builder.ts:304-342` relies on that resolver for import evidence. Therefore an
absolute import such as:

```python
from python.core.signals import SignalGenerator
```

cannot currently establish the class identity needed by the constructor
receiver analysis.

The leading mechanistic chain is:

```text
exact production caller
-> absolute Python module specifier
-> module resolver rejects every non-relative specifier
-> constructor class identity remains unresolved
-> no member target relationship is emitted
-> inbound graph has no edge
```

This identifies a concrete blocker capable of preventing class identity
resolution for the recorded constructor-receiver cases. It does not prove that
the resolver received every production import, that downstream constructor
binding would succeed after resolution, or that emission, identity projection,
and reverse traversal are correct. The durable R0 reproduction in
`SATORI_PYTHON_INBOUND_RELATIONSHIP_COVERAGE_REPAIR_PLAN.md` must establish the
first observed mismatch before production repair. A bounded prototype would:

1. Resolve absolute Python module names only against explicit indexed source
   roots or package mappings.
2. Consider both `<module>.py` and `<module>/__init__.py`.
3. Accept the result only when exactly one indexed file and class identity
   match.
4. Fail closed on missing or ambiguous roots rather than fall back to a
   same-name class anywhere in the repository.
5. Preserve relative-import behavior and deterministic ordering.

The other recorded callers exercise a different boundary:

- `gate_coordinator.py:475` and `phases.py:129` call
  `services._evaluate_residual_type_invariant(...)`; the service field is a
  `Callable` populated from `engine._evaluate_residual_type_invariant`.
- `signal_recording.py:435` calls `services.signal_ledger.record(...)`; the
  `signal_ledger` field is typed as `Any`.

These are callback/service-binding cases, not ordinary direct receiver
resolution. A generic analyzer cannot safely derive the `Any` receiver target
from its annotation, and a repository-global `ServiceClass.field` fact would
collapse distinct service instances. A candidate repair therefore needs
bounded allocation-site or value-origin-sensitive binding evidence. Adding a
concrete protocol or type in the target repository is a possible repository
workaround, not closure of the Satori defect. An exact edge may be trusted
under its declared static support model, while the inbound result set remains
non-exhaustive and absence still requires deterministic verification.

### Live Pyright LSP pilot

A transient pilot used the target repository's native
`.venv/bin/pyright-langserver`, Pyright `1.1.407`, through standard LSP
initialization, `didOpen`, `textDocument/prepareCallHierarchy`, and
`callHierarchy/incomingCalls`. The server advertised
`callHierarchyProvider=true`.

| Target | Pilot result |
| --- | --- |
| `SignalGenerator.check_entry` | Exact symbol prepared; zero incoming calls |
| `_evaluate_residual_type_invariant` | Exact symbol prepared; zero incoming calls |
| `SignalLedger.record` | Multiple typed callers found, but not the `signal_recording.py:435` call through the `Any` service field |

The native pilot completed in approximately 7.4 seconds. Earlier attempts
through a Windows-global Pyright executable were discarded because WSL path
identity made them invalid evidence.

The temporary pilot script was removed and its raw JSON-RPC transcript was not
sealed as a durable artifact. These results are therefore investigation
evidence, not a reusable qualification receipt. They support only the narrow
conclusion that Pyright 1.1.407 call hierarchy did not close the exact
acceptance targets under this transient configuration.

The result is consistent with Pyright's public issue
[microsoft/pyright#794](https://github.com/microsoft/pyright/issues/794),
which documents that incoming call hierarchy does not treat a function passed
as a callback as invoked. The issue is labeled as designed. The
[LSP 3.17 call-hierarchy contract](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#call-hierarchy)
standardizes the request and response shapes; it does not promise complete
language-specific call resolution.

Consequently:

- Pyright call hierarchy cannot be a completeness authority for these sampled
  targets under the tested configuration.
- Empty Pyright results cannot override Satori's partial-coverage disclosure
  or deterministic source verification.
- Definitions, references, other server APIs, other providers, and other
  configurations remain open to a separately authorized bounded comparison.
- Any future provider would need a lifecycle identity at least as specific as
  workspace snapshot, language, configuration, interpreter or execution
  environment, and provider version. Repository root alone is insufficient.
- Any imported edge would need exact spans, provider and analysis identity,
  source generation, and explicit evidence provenance in Satori's relationship
  schema.

### External implementation candidates

| Candidate | Useful capability | Demonstrated limitation | Decision |
| --- | --- | --- | --- |
| [Pyright](https://github.com/microsoft/pyright) | Python type analysis and standard call hierarchy | Missed the exact constructor, callback, and `Any` acceptance cases in the live pilot | Possible supplementary provider after a separate bounded acceptance pilot |
| [SCIP](https://github.com/scip-code/scip) and [scip-python](https://github.com/sourcegraph/scip-python) | Language-neutral, immutable code-intelligence interchange suitable for one bounded offline evidence spike | `scip-python` is Pyright-based; the bounded provider decision does not authorize production ingestion or an external graph authority | Use only as the recorded offline P0 evidence path; `native_python_bounded` remains selected and production SCIP integration is not authorized |
| [multilspy](https://github.com/microsoft/multilspy) | Reference implementation for language-server lifecycle and JSON-RPC orchestration | It is a Python client library and currently documents Jedi for Python; Satori is TypeScript and already owns a shared runtime host | Use as design reference, not as a direct runtime dependency |
| [Stack Graphs](https://github.com/github/stack-graphs) | Declarative, incremental name resolution independent of build tools | GitHub states that the repository is no longer supported or updated | Do not adopt as a new core dependency |

None of the boundedly evaluated candidates demonstrated that it can replace
Satori's parser-derived symbols, explicit coverage disclosure, and
deterministic inbound verification. This is not an exhaustive ecosystem
conclusion.

### Freshness checkpoint: leading publication-identity hypothesis

This subsection preserves the historical source-supported mechanism observed
before C1/C2. The current frozen V4/no-op/fail-reindex behavior and its bounded
test result are recorded in the current implementation disposition above; this
historical hypothesis must not be read as the post-C1/C2 implementation state.

The follow-up inspection found a code path capable of producing exactly the
reported checkpoint mismatch:

1. `writeCompletedIndexMarker(...)` at
   `packages/core/src/core/context.ts:1943-1953` defaults `runId` to a new
   `crypto.randomUUID()`.
2. The repair path at `context.ts:7708-7740` rebuilds navigation and calls that
   marker writer without supplying the previous run ID.
3. No matching source-checkpoint rewrite or rebinding occurs in that inspected
   repair path.
4. `FileSynchronizer.assertValidGenerationSnapshot(...)` at
   `packages/core/src/sync/synchronizer.ts:1110-1115` requires the
   checkpoint's `markerRunId` to equal the active completion marker's run ID.

The current writer-validator contract is:

```text
an active completion marker and its source checkpoint must belong to the same
run identity
```

That exact run-identity equality is the historical validator gate, not the
post-C1/C2 publication invariant. The selected model uses compatibility through
the active V4 binding and does not require every component to share one
overloaded run ID.

The inspected repair path can violate that contract whenever it publishes a
new marker over an otherwise unchanged collection while retaining a checkpoint
owned by the preceding marker.

The qualification did not retain checkpoint state immediately before and
after each reindex/repair transition. Therefore this evidence identifies a
defect-capable writer and a leading responsible boundary, but it does not prove
that the recorded repair invocation introduced the mismatch. It also does not
establish that marker/checkpoint equality is the correct long-term semantic
invariant. Three identity models remain plausible:

- the run ID identifies the entire immutable publication;
- the run ID identifies the source generation and a navigation-only repair
  should preserve it; or
- one overloaded run ID should be replaced by distinct publication, source,
  checkpoint, vector, relationship, and navigation component identities.

Preserving the old ID and rebinding an unchanged checkpoint to a new ID can
each be wrong under one of those historical models. The current C1/C2
correction instead uses the selected V4/no-op/graph-only/fail-reindex model;
broader C3/C4 publication redesign remains unauthorized. Crash, concurrency,
reader-pinning, rollback, component-reuse, and garbage-collection work beyond
the frozen C1/C2 gates must not be inferred from this report.

One candidate design is an immutable manifest that references independently
immutable component generations:

```text
publication_id
+ source_snapshot_id
+ checkpoint_id
+ vector_generation_id
+ symbol_generation_id
+ relationship_generation_id
+ navigation_generation_id
+ policy_fingerprint
+ parent_publication_id
```

That is a design hypothesis, not an approved implementation. Its storage
locations and atomicity domain must be defined before relying on one pointer
replacement. It is analogous to the point-in-time commit principle documented
by
[Lucene `IndexWriter`](https://lucene.apache.org/core/10_3_0/core/org/apache/lucene/index/IndexWriter.html):
a commit makes one consistent set of referenced state visible rather than
publishing independently mutable identities.

The smallest happy-path experiment is:

```text
healthy indexed fixture
-> repair without source/vector writes
-> sync add
-> sync modify
-> sync delete
```

Every phase must retain a valid compatible manifest, require no reindex, and
make the expected exact token transition observable. This witness alone is
insufficient for an atomic publisher; a separate plan must also inject crashes
around publication, exercise concurrent repair and sync, restart readers,
recover orphans, and prove rollback.

### Semantic abstention: observed behavior and design hypotheses

The four negative controls establish only that the current implementation
always returns top-K nearest-neighbour groups. They do not identify a safe
threshold.

The fused retrieval score is not currently a calibrated probability of
relevance. An unvalidated global threshold must not be deployed. The score can
still be evaluated as one feature alongside score margin, lexical evidence,
path evidence, query route, and candidate count. Rank-fusion scores depend on
the rankings being combined. For
example, the
[Azure hybrid-search RRF documentation](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking)
documents RRF ranking separately from a semantic reranker score and explains
that the fused-score bound depends on the number of contributing queries.

A valid abstention experiment should:

1. Freeze representative positive, difficult, ambiguous, and realistically
   absent queries, with a held-out evaluation set and a versioned complete
   retrieval-pipeline signature.
2. Retrieve candidates using the existing lexical/vector fusion.
3. Compare at least calibrated fused-score features, a lightweight relevance
   classifier, and a separate reranker.
4. Measure selective risk, coverage, latency, cost, and cross-repository
   generalization rather than selecting a model by architecture preference.
5. Return zero results or an explicit weak-relevance warning when no candidate
   meets the validated decision policy.
6. Keep exact identifier and `must:` controls on a separate deterministic
   policy rather than applying a semantic threshold to them.

Until that calibration exists, nearest-neighbour results remain candidates to
inspect. The safe negative statement is: “No sufficiently relevant candidate
was found under the current index, provider set, scope, and retrieval policy.”
It is not a repository-level claim that no answer exists.

### Illustrative architecture hypothesis

```text
Tree-sitter and Satori parsers
    -> deterministic symbols, chunks, direct relationships

Optional language-semantic adapters
    -> high-confidence typed definitions/references/calls

Explicit assignment and callable-binding analysis
    -> constructor receivers, services, callbacks, dependency injection

Relationship normalizer
    -> stable identities, spans, generation, provenance, confidence

Atomic generation publisher
    -> vectors + symbols + relationships + navigation + checkpoint + marker

Semantic retrieval
    -> candidate fusion -> evaluated abstention decision
```

This diagram is not an approved architecture. A future design would still need
canonical edge identity and deduplication, provider precedence and conflict
handling, incremental invalidation, migration, process and resource budgets,
failure isolation, observability, rollback, and security boundaries.
Language-specific provider absence, timeouts, unsupported languages, and empty
responses must degrade result-set coverage explicitly. Selected edges should
be described as deterministic under a declared static support model, not as
unconditional runtime graph truth.

### Acceptance decisions

| Finding | Evidence required to close it |
| --- | --- |
| Absolute-import constructor coverage | The three recorded `SignalGenerator.check_entry` production callers appear as inbound edges with exact targets and no same-name false positives |
| Callback/service binding coverage | Exact binding-derived edges appear for the patterns admitted by the frozen support model with no precision negatives. If calls remain absent but partial coverage is disclosed, the disclosure contract passes and coverage remains open |
| LSP integration | No integration is currently required. A future provider comparison must add correct evidence beyond the bounded native model, preserve deterministic results, degrade safely, and remain within a frozen workspace/configuration/provider lifecycle and resource budget |
| Checkpoint integrity | The frozen C1/C2 V4/no-op/fail-reindex model passes its bounded happy-path, source-observation, restart, zero-change, recovery, retention, and rollback witnesses; final closure still requires owner-preserving merge, residual Core-test reconciliation, affected full tests, and version/reindex recording |
| Semantic abstention | Held-out realistic controls establish a versioned retrieval-pipeline decision policy with bounded selective risk, latency, and cost and explicit weak-relevance behavior |

### Durable external source record

The external sources used for this decision were discovered through Open Web
Search or GitHub and captured into the local Khiip substrate:

| Source | Khiip capture |
| --- | --- |
| Pyright repository | `01KYAVNQBBAVMFSENJPSY51X7D` |
| Pyright call-hierarchy implementation | `01KYAVNQVD9WA08JNSRQQV5J18` |
| Pyright callback limitation issue | `01KYAVZVQTH0SSK5SK2EA15FNM` |
| LSP 3.17 call hierarchy | `01KYAVZSXCEVYSNYM3ZFHX5PC2` |
| SCIP protocol | `01KYAVNT3NFF08XWWYH1G7A56J` |
| scip-python | `01KYAVNS4SBVDR7Y88R52TCRT6` |
| multilspy | `01KYAVV3F69YEX8J56S3H1QP07` |
| Stack Graphs | `01KYAVZNFF440C9E2SJR9VC2Q8` |
| Lucene `IndexWriter` | `01KYAVNVAGZRE3P6S7GF0E2SN6` |
| Azure RRF and semantic ranking | `01KYAVNTTACJ3DVQH5CRHVZPK2` |

These capture IDs preserve local provenance but are not a reviewer-portable
qualification bundle. Claims above link to canonical sources where available.
Future qualification receipts must also retain the source revision or capture
time, content digest, and the exact relevant location or exported artifact.

---

**Original Satori 6.2.0 assessment**

The remainder of this document preserves the original assessment and its
then-current language. Where it conflicts with the requalification above, the
Satori 6.3.0 decision controls. Every remaining level-two section is
historical and must not be cited as the current product decision.

## [Superseded Satori 6.2.0] Overall verdict

**Satori 6.2.0 is operational and useful for semantic discovery and exact
source navigation in this repository.** The sampled domain-specific searches
frequently reached relevant owners, and exact reads, outlines, continuations,
compatibility rejection, reindexing, and watcher-backed freshness behaved
correctly.

Two areas are not production-complete:

1. `manage_index repair` cannot prove payload equality at this repository's
   19,741-chunk size even though the shipped vector backends expose the exact
   count needed to complete that proof.
2. Inbound Python caller coverage has demonstrated false negatives, and an
   empty `call_graph` result does not always disclose that limitation directly.

Semantic search also has no demonstrated abstention behavior. Its results are
candidate evidence and must be checked against source before being treated as
relevant.

This is an exploratory capability assessment, not a comprehensive
retrieval-quality, latency, freshness, or call-graph qualification.

The run exercised all seven exposed tools:

- `list_codebases`
- `manage_index`
- `search_codebase`
- `continue_search`
- `file_outline`
- `call_graph`
- `read_file`

The strongest observed capabilities were exact identifier navigation,
bounded source-backed reads, continuations, outlines, and sampled
domain-specific discovery. Caller results remain advisory and require exact
search or `rg` verification.

## [Superseded Satori 6.2.0] Evidence boundary

| Evidence input | Recorded value |
| --- | --- |
| Target repository | `/home/hamza/repo/tradingview_ratio` |
| Target revision | `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` |
| Target final working tree | `M opencode.jsonc`; `?? cc.json` |
| Runtime under evaluation | Satori MCP 6.2.0 |
| Final navigation generation observed during follow-up | `symmanifest_e669-dd6499bba74a1b14` |
| Symbol registry manifest hash | `symmanifest_e66958cafe44b5b9548b47f70d8f2fff` |
| Symbol registry manifest SHA-256 | `6f0239a341d74e785a5ff61d27298655b6b70cd0c619e3ee6fadd76808f03192` |
| Navigation seal SHA-256 | `6edaa4024f555805c8fab937f1f006aaeeac05d54ba719da1331e1976ed4732d` |

The report retains query text for the material search examples, but it does
not retain every complete serialized tool request or raw response. The
300,842-character full-debug response was not recorded here with an artifact
path and SHA-256 digest. Freshness writes were not timestamped, and the search
and latency observations were not repeated under a qualification protocol.
Claims that depend on those missing records are labelled exploratory below.

The manifest and seal digests above were read from:

```text
/home/hamza/.satori/navigation/a28de7b6704a6dd9880de7436f3da849/
  generations/symmanifest_e669-dd6499bba74a1b14/manifest.json
  generations/symmanifest_e669-dd6499bba74a1b14/seal.json
```

The repository-owner inspection used Satori revision
`c9ece273fb18300cd19d80c2175eb7321955ebaf`:

| Finding | Inspected owner |
| --- | --- |
| Large repair proof limit | `Context.repairIndex()` and `Context.countIndexedPayloadExactly()` in `packages/core/src/core/context.ts` |
| Missing constructor receiver evidence | `resolvePythonMemberTarget()` in `packages/core/src/relationships/builder.ts` and `ReceiverTypeBinding` in `packages/core/src/language-analysis/types.ts` |
| Missing concrete parent | `buildSymbolRecordsForFile()` in `packages/core/src/symbols/registry.ts` and `projectCanonicalSymbolIdentity()` in `packages/mcp/src/core/canonical-symbol-identity.ts` |
| Definition-free degradation | `computeLanguageCapabilityEvidence()` in `packages/core/src/languages/evidence.ts` |
| Changed-code basis | `getChangedFilesForCodebase()` in `packages/mcp/src/core/working-tree-state.ts` |

---

## [Superseded Satori 6.2.0] 1. Index lifecycle

### Initial state

The existing index was rejected because its extractor and relationship fingerprints did not match Satori 6.2.0:

- Indexed extractor: `5bf2248ffcf0`
- Runtime extractor: `742b3f3e30f8`
- Indexed relationships: `93d4fdd02383`
- Runtime relationships: `c692aa46b050`

The status correctly returned `requires_reindex` and blocked normal search rather than silently serving incompatible data.

### Reindex

I ran a full reindex under the current runtime.

Results:

| Metric                             | Value                    |
| ---------------------------------- | -----------------------: |
| Duration                           | Approximately 98 seconds |
| Indexed files                      | 1,519                    |
| Chunks                             | 19,741                   |
| Python files                       | 944                      |
| Python files with non-file symbols | 931                      |
| File-owner-only Python files       | 13                       |
| Non-file symbols                   | 13,305                   |
| Satori version                     | 6.2.0                    |
| Symbol quality                     | `symbol_rich`            |
| Relationship evidence              | Compatible               |

The index progressed through scanning/writing, briefly reported 100% while
publication was still finishing, then transitioned cleanly to `status: ok`.
Because the raw progress sequence was not retained as an artifact, this is a
UX observation rather than a reproducible progress-contract finding.

### Current state

The final index is ready and searchable. All live runtime owners reported Satori 6.2.0, with no multi-version contention.

Python capabilities are reported as:

- Semantic search: **ready**
- Exact symbols: **degraded**
- Outlines: **degraded**
- Call graph: **degraded**

The status implementation attributed degradation to partial symbol evidence:
931 of 944 eligible Python files had non-file symbols.

The sealed manifest identified the 13 file-owner-only paths. Follow-up source
inspection at the recorded target revision classified them as empty,
docstring-only, import/re-export-only package modules and one `__main__.py`
entry script with no owner-worthy definition. The current capability
classifier treats every Python file without a non-file symbol as degraded,
even when the analyzer correctly finds no definition. This is a
status-classification defect, not evidence that Python extraction failed.

---

## [Superseded Satori 6.2.0] 2. Semantic search quality

### Strong results

The sampled behavior-level queries generally found the correct owner near the
top.

#### Copula-only signal authority

Query:

> where Student-t copula mutual information generates trading signals while z-score remains diagnostic only

Top result:

- `SignalGenerator.check_entry` in `src/python/core/signals.py`

The returned evidence correctly showed:

- Only `COPULA_REAL` MI can authorize entries.
- Z-score and dummy MI sources are blocked.
- Non-copula models raise an error.
- The emitted signal records `"signal_source": "copula"` and MI metadata.

Direct evidence:

- `src/python/core/signals.py:345`
- `src/python/core/signals.py:499`
- `src/python/core/signals.py:530`

#### Residual provenance invariant

Query:

> how execution fails closed when residual provenance qap_spread_type eg_residual is absent

Top result:

- `BacktestEngineGateRuntimeApiMixin._evaluate_residual_type_invariant`

The exact symbol read showed that any value other than `"eg_residual"` returns a blocked `GatePipelineResult`, including the expected and actual provenance values in metadata:

- `src/python/core/backtest/engine_gate_runtime_api.py:59`

#### Signal-ledger idempotency

Query:

> how are duplicate signal ids rejected or treated idempotently in the canonical ledger

Top result:

- `SignalLedger.record`

The implementation:

- Treats an identical duplicate as an idempotent no-op.
- Raises `ValueError` when the same ID has a different payload.
- Preserves append-only semantics.

Evidence:

- `src/python/core/ssot/signal_ledger.py:136`

#### UTC normalization

Exact identifier search for `as_naive_utc` deterministically returned:

- `src/python/support/time_utils.py:71`

It correctly identified the implementation and provided a graph-ready symbol reference.

### Architecture query performance

The broad query:

> trace CLI discover command through orchestration use case into quantitative core

was only moderately successful. It found:

- `COMMAND_SPECS` and the lazy-loaded `discover` command.
- `screen_pairs` and `accumulation_scan`.
- A relevant CLI use-case file.

However, the top result was `_run_copula_signal_trace`, which was related to research rather than the requested discovery flow. Broad architectural questions should therefore be decomposed into:

1. Find the command registration.
2. Find the concrete CLI handler.
3. Search for the handler’s invoked use case.
4. Navigate into core separately.

### Negative-control query

I searched for:

> nonsense concept orbital banana transaction semaphore

Satori still returned nearest-neighbor matches such as `AnchorPath` and `AnchorConfidence`, without warning that the query lacked a meaningful match.

**Implication:** semantic search always tries to return something. A returned top result is not itself proof of relevance. For important work, use:

- Exact `must:` filters where possible.
- The returned evidence span.
- `read_file` before drawing conclusions.

### Search routing and ranking

Full diagnostics confirmed:

- Conceptual queries use hybrid dense+sparse retrieval.
- Identifier queries use deterministic lexical-first routing.
- Core files receive a `1.35` path multiplier.
- CLI adapters receive a `0.7` multiplier.
- Tests receive both a test-path penalty and an agent-fit multiplier of `0.45` when the query is not test-focused.
- Runtime scope filters documentation after retrieval.
- Current working-tree changes can be boosted.
- No reranker is configured in the current Potion setup.

The run recorded a **300,842-character** full-debug response. That is below
Satori's explicit 2 MiB full-debug response cap, so its size alone does not
prove a transport-contract defect. The saved artifact path and digest were not
retained in this report, so the detailed ranking conclusions are exploratory
rather than independently reproducible.

Use `debugMode="summary"`, `"ranking"`, or `"freshness"` for normal diagnosis.
Reserve `"full"` for focused Satori debugging because it can legitimately
produce hundreds of kilobytes.

---

## [Superseded Satori 6.2.0] 3. Search operators and scopes

### Verified

- `must:qap_spread_type` correctly constrained results to exact occurrences.
- `must:as_naive_utc` resolved the exact function with semantic quality `medium`.
- `lang:python` worked.
- `path:src/python/core/ssot/**` worked and found `SignalLedger.record`.
- `-path:**/backtest/**` was accepted.
- `scope="runtime"` filtered documentation and generated material.
- `scope="docs"` returned documentation-only results.
- `scope="mixed"` included the temporary text freshness probe.
- `groupBy="symbol"` and `groupBy="file"` both worked.
- Raw mode worked, but `disclosureLimit` is correctly rejected for raw results because disclosure paging only applies to grouped output.

### Notable path behavior

`path:src/python/core/ssot/` returned no results, while:

```text
path:src/python/core/ssot/**
```

worked.

Use explicit glob semantics for directory inclusion rather than assuming a trailing directory slash means recursive inclusion.

### Docs search

The canonical-policy query did return `docs/INVARIANTS.md`, but it ranked below several large `docs_v2` research documents. Without a reranker, broad documentation queries can favor semantically dense research material over the canonical document.

For constitutional lookups, use an explicit constraint such as:

```text
path:docs/INVARIANTS.md <concept>
```

---

## [Superseded Satori 6.2.0] 4. Continuation behavior

Grouped search continuation worked correctly:

1. Initial disclosure returned three of eight results.
2. `continue_search` returned the next two from the frozen ranking.
3. The handle retained the original query and ranking state.

I also encountered `SEARCH_RESULT_SET_STALE` when a publication/source observation changed between the original search and continuation. The error was properly classified and instructed me to rerun `search_codebase`.

That is preferable to silently continuing against a different index snapshot.

---

## [Superseded Satori 6.2.0] 5. Deterministic reads

### Exact-symbol reads

`read_file` with:

```json
{
  "contractVersion": 2,
  "symbolId": "...",
  "context": {
    "preset": "implementation"
  }
}
```

worked reliably for:

- `SignalGenerator.check_entry`
- `_evaluate_residual_type_invariant`
- `SignalLedger.record`
- `as_naive_utc`

Responses included:

- Exact symbol identity.
- Qualified name.
- Source span.
- Complete or bounded source.
- Siblings.
- Caller/callee evidence.
- Freshness and authority metadata.

### Bounded source selection

For the 249-line `check_entry` method, a small budget returned three useful excerpts:

- Declaration.
- MI provenance gate.
- Terminal rejection of legacy models.

It also supplied a deterministic `source_range` continuation. Following that continuation returned exactly the omitted requested range.

This is a strong mechanism for inspecting large symbols without flooding context.

### Plain span reads

Direct line-span reads worked for both Python and the temporary text probe. Source was current and matched the working tree.

---

## [Superseded Satori 6.2.0] 6. File outlines

`file_outline` worked in both modes:

- Windowed outline of `signals.py`.
- Complete outline of the gate-runtime mixin.
- Exact resolution of `"method check_entry"`.

It returned stable symbol IDs and graph-ready jump handles.

One metadata defect remains: methods frequently showed:

```text
parentQualifiedNamePath: ["ClassName"]
parentResolution: "missing"
```

even though the containing class was present in the same outline. Follow-up
source inspection found that the registry builder records
`parentQualifiedNamePath` but does not populate the already-supported
`parentKey`. The MCP projection can resolve a concrete parent only from
`parentKey`, so current generated registries systematically report these
parents as missing. Navigation still works, but the concrete parent-instance
contract is incomplete.

---

## [Superseded Satori 6.2.0] 7. Call-graph capability

### Callee traversal: good

For `SignalGenerator.check_entry`, Satori found three high-confidence static callees:

- `_map_dual_mi_to_intent`
- `_map_mi_to_intent`
- `_apply_meta_filter`

All edges had source sites and confidence `0.95`.

### Caller traversal: mixed

For `as_naive_utc`, caller traversal was extensive:

- Three high-confidence static callers.
- Forty-five source-backed dynamic callers.
- Seventy low-confidence relationships reported as suppressed.
- Test-reference evidence.

This demonstrates useful fallback behavior when Python receiver/type resolution is uncertain.

### Important incompleteness

For both:

- `SignalGenerator.check_entry`
- `_evaluate_residual_type_invariant`
- `SignalLedger.record`

the graph returned no inbound callers.

An `rg` verification found production calls to `SignalGenerator.check_entry` in at least:

- `src/python/core/opportunity_ranker.py:256`
- `src/python/core/pair_evaluator.py:738`
- `src/python/core/trading_core.py:675`

plus many tests.

Therefore:

> **An empty inbound graph must never be interpreted as “no callers.”**

The call graph is useful for local callee structure and some direct references, but it is not sufficient for blast-radius analysis without an inbound `must:<identifier>` search or literal verification.

Follow-up source inspection established one concrete missing-evidence class for
`SignalGenerator.check_entry`:

- local constructor binding:
  `signal_gen = SignalGenerator(...)` followed by
  `signal_gen.check_entry(...)`;
- instance-field constructor binding:
  `self.signal_gen = SignalGenerator(...)` or
  `self.signal_generator = SignalGenerator(...)`, followed by calls from
  another method.

The current relationship builder accepts exact same-class `self`/`cls`,
directly annotated parameters, and exact imported class references. It does
not derive receiver authority from those constructor assignments. Name-only
cross-file matching would be unsafe; any coverage expansion must remain
bounded to uniquely resolved syntactic constructor evidence.

Search results already publish `navigation.inbound="verify"` and an optional
`callerSearchTerm`. Direct `call_graph` responses add a fallback search only
when a suppressed relationship note exists. When no relationship was emitted
at all, an empty caller response can lack the same actionable warning. That is
the immediate disclosure gap.

### Identifier-query ambiguity

An identifier-shaped query for `check_entry` ranked:

- `_check_entry_gates`
- `HurstGateState.check_entry`
- `RiskManager.check_entry_allowed`

above the intended `SignalGenerator.check_entry`. The complete serialized
request was not retained, so this cannot be classified as failure of
`must:check_entry` or exact-symbol lookup. It demonstrates only that an
unqualified common identifier can be ambiguous.

For common method names, constrain by path, class-related terms, or use an existing symbol ID.

---

## [Superseded Satori 6.2.0] 8. Freshness and synchronization

I performed a reversible add/modify/delete test with a temporary text artifact.

### Add

Created a file containing a unique `SATORI_FRESHNESS_PROBE_ALPHA...` token.

- An explicit `sync` reported `+0/-0/~0`.
- The subsequent search found the new untracked file and returned its exact
  current content.

**Observed:** explicit sync returned a zero delta, and the subsequent search
returned the new token.

**Inference:** the watcher converged before explicit sync. The run did not
record the file-write time, first successful search time, polling attempts, or
elapsed milliseconds, so it does not establish a freshness latency.

### Modify

Replaced the alpha token with a unique beta token.

- The subsequent search found the beta token.
- A search for the old alpha token returned no result and emitted `FILTER_MUST_UNSATISFIED`.

### Delete

Removed the probe file.

- Search for the beta token returned no result.
- The repository returned to its original status.

### Freshness conclusion

Watcher-backed freshness was demonstrated for:

- Newly created untracked files.
- In-place modifications.
- Deletions.

`changedCode.files` continued to report only the existing dirty
`opencode.jsonc`, even while the temporary untracked probe was searchable.
Follow-up source inspection established that this field is built from:

```text
git status --porcelain --untracked-files=no
```

It is therefore a Git-tracked working-tree diagnostic, not the complete
watcher freshness set. Search freshness was correct. The defect is that the
response does not state this narrower basis.

---

## [Superseded Satori 6.2.0] 9. Sync and repair behavior

### Sync

Repeated syncs completed successfully and reported:

```text
added: 0
removed: 0
modified: 0
```

because the watcher had already applied the probe changes.

### Repair

I safely exercised `manage_index(action="repair")`.

It refused with:

```text
exact_payload_query_limit_exceeded
```

The proof reported:

- Expected chunks: 19,741
- Observed chunks: 19,741
- Missing chunks: 0
- Collection: matched
- Snapshot: matched
- Marker: matched
- Fingerprint: matched
- Payload equality: unproven due to the query limit

The repair response classified this as `requires_reindex`, but subsequent full status and searches remained healthy.

This is an operational correctness and guidance defect:

- The index is usable and all known counts match.
- Repair cannot prove exact equality at this repository size.
- Its fallback recommendation is another full reindex.

Follow-up source inspection found that repair already checks every expected ID
in deterministic 512-ID batches. All shipped vector backends also implement an
exact document count. Complete expected-ID membership plus an exact equal row
count proves set equality without fetching all IDs in one response. The fixed
16,384-row rejection is therefore unnecessary for supported backends.

If an adapter cannot provide exact count authority, a proof-limit result must
remain distinct from demonstrated incompatibility and must not recommend a
full reindex as though stale payload had been proven.

I did **not** run a redundant second reindex because the freshly rebuilt index remained `status: ok`, with compatible navigation and successful searches.

---

## [Superseded Satori 6.2.0] 10. Tool-by-tool scorecard

| Tool                   | Result       | Notes                                                                 |
| ---------------------- | ------------ | --------------------------------------------------------------------- |
| `list_codebases`       | Pass         | Correctly transitioned this repo from failed to ready                 |
| `manage_index status`  | Pass         | Detailed fingerprints, capabilities, operations, publication evidence |
| `manage_index reindex` | Pass         | Full rebuild completed in about 98 seconds                            |
| `manage_index sync`    | Pass         | Watcher had already converged; zero-delta sync was accurate           |
| `manage_index repair`  | Defect       | Misclassifies a proof limit as reindex-required at 19,741 chunks      |
| `search_codebase`      | Pass         | Sampled owner discovery was useful; broad/negative queries can be noisy |
| `continue_search`      | Pass         | Frozen paging works; stale handles are correctly rejected             |
| `read_file`            | Strong pass  | Deterministic exact symbols, bounded excerpts, continuations          |
| `file_outline`         | Pass         | Stable symbols and exact resolution; parent metadata incomplete       |
| `call_graph`           | Partial pass | Good callees and some dynamic callers; inbound completeness is weak   |

---

## [Superseded Satori 6.2.0] Recommended working procedure

For this repository, I recommend:

1. Start with a natural-language `scope="runtime"` search.
2. Prefer `groupBy="symbol"` and `limit=5`.
3. Follow `recommendedNextAction`.
4. Open the returned exact symbol with `read_file`.
5. Use `file_outline` only for disambiguation or neighboring symbols.
6. Use `call_graph` for local structure, especially callees.
7. Always verify inbound impact with:
   - `must:<identifier>` search, and
   - `rg` or direct source inspection.
8. Use `path:**` globs explicitly.
9. Use `debugMode="summary"` by default.
10. Run `sync` when an immediate explicit freshness decision is necessary;
    this run proved watcher convergence, not a watcher latency.
11. Reindex only on an actual fingerprint/policy incompatibility, not merely because repair cannot prove equality at the current payload-query limit.

## [Superseded Satori 6.2.0] Repository state

The evaluation introduced no persistent target-repository changes. The
temporary freshness artifact was removed, and final target status matched the
recorded pre-evaluation state:

```text
 M opencode.jsonc
?? cc.json
```

The final Satori index is ready and searchable under Satori 6.2.0.
