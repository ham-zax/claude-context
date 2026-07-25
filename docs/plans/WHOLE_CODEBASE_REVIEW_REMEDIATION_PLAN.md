# Whole-Codebase Review Remediation Plan

Status: evidence-batch-ready; implementation contracts remain conditional

Date: 2026-07-25

Scope: the evidence-backed findings from the single-agent whole-codebase audit

Evidence record: [WHOLE_CODEBASE_REVIEW_JOURNAL.md](./WHOLE_CODEBASE_REVIEW_JOURNAL.md)

Assessment: [WHOLE_CODEBASE_REVIEW_ASSESSMENT.md](./WHOLE_CODEBASE_REVIEW_ASSESSMENT.md)

This plan is ready for bounded evidence and documentation batches. D1a, C0,
R0, and the offline SCIP-Python P0 are approved within their stated bounds;
C1 and production Python changes are not implementation-ready until their
preceding evidence batches terminate. This plan does not authorize product
code changes; every batch must stop at its stated terminal outcome.

## 1. Exact outcomes

The plan has three independent outcomes:

1. A readable Satori publication never reports successful repair while its
   source checkpoint and completion-marker tuple are incompatible under the
   active publication binding.
2. The frozen Python relationship patterns either produce exact inbound edges
   with precision-safe evidence or remain explicitly outside the proven
   coverage contract with deterministic verification guidance.
3. Current hand-authored architecture/workflow documents agree with the
   seven-tool runtime authority or are explicitly labeled historical/proposed.

Semantic abstention is a fourth, deferred qualification workstream. It is not
an implementation outcome in this plan until S0 produces a safe oracle.

The checkpoint outcome is P1 because successful repair can disable incremental
freshness until reindex. The Python outcome is P2: it is a demonstrated
advisory coverage defect with correct partial-coverage disclosure, and the
review has no frequency, incident, or user-impact evidence that justifies
equating it with the checkpoint failure.

## 2. Contract freeze before implementation

No implementation batch may start until the following are copied into its
working record and accepted by the reviewer.

### Public contract

| Contract | Frozen value |
| --- | --- |
| Public tools | Exactly seven: `manage_index`, `search_codebase`, `continue_search`, `call_graph`, `file_outline`, `read_file`, `list_codebases`. |
| Search result truth | Results are candidate evidence with canonical targets, freshness/provenance, warnings, hints, and next actions; a candidate is not proof of semantic relevance. |
| Continuation | Process-local frozen ranking; exact handle/offset retries are idempotent; continuation does not rerun retrieval or reranking. |
| Call graph | Bounded, heuristic, incomplete, advisory; empty/short inbound results are not proof of no callers. Partial coverage and verification guidance remain public. |
| Freshness failure | Missing, corrupt, stale, or incompatible source authority fails closed to structured recovery/reindex guidance. |
| Repair | `ok` is allowed only when the selected readable publication's source checkpoint, policy, navigation, and receipt are compatible and proven through its active binding. |
| Semantic abstention | No public claim that the repository contains no answer. Any future message may only describe evidence under the current index/provider/scope/policy after S0. |

### Persisted contract

| Contract | Frozen value |
| --- | --- |
| Runtime compatibility | Provider/model/dimension, artifact/normalization, vector store/schema, parser/extractor/relationship, embedding projection, and lexical projection participate in compatibility. |
| Marker/checkpoint identity | The active binding must select a mutually compatible collection, marker reference, policy hash, Merkle root, and document digest for one source observation; components need not share an overloaded run ID. |
| V4 publication | Source-checkpoint tuple, graph manifest, activation ID, and mutation receipt are one publication binding. |
| Navigation authority | Generation ID, registry/relationship manifests, and seal hash remain bound to the readable publication. |
| Stable identities | Do not churn vector IDs, symbol instance IDs, or continuation semantics as a side effect of a repair. |
| Migration rule | Do not accept an incompatible or unproven tuple by weakening validation. Reindex remains explicit and user-authorized. |

## 3. Ownership and sequencing decision

| Owner | Batch | Reason for order |
| --- | --- | --- |
| Documentation authority | D1a | Fix the proven current repository-map contradiction first; no persisted-state impact and no historical-plan sweep. |
| Core publication/repair boundary | C0, then C1 if proven | Establish the first wrong identity transition before selecting a persisted repair contract. |
| Core Python relationship evidence and graph projection | R0, then offline provider P0, then conditional R1/R2 | Compare the native boundary with one bounded offline evidence provider before selecting production architecture. |
| Search qualification | S0 | Defer unless calibrated abstention becomes a concrete product priority; it must not change runtime behavior before a safe oracle exists. |

The low-token sequence is D1a -> C0 -> conditional C1 -> R0/P0 -> conditional
Python production work. It minimizes repeated invalidation: resolve checkpoint
publication identity first; freeze any relationship/provider decision second;
then perform one affected navigation/reindex qualification. A historical-plan
documentation sweep and semantic S0 remain deferred. No batch may combine
checkpoint, Python, semantic, and documentation behavior changes into one
opaque diff.

## 4. Urgent operational containment

Until C0/C1 closes the checkpoint finding:

- Treat `Generation checkpoint does not belong to the active completion marker`
  and equivalent corrupt/unavailable status as a freshness blocker.
- Do not auto-repair the tuple or relax synchronizer identity checks.
- Use explicit, user-authorized `reindex` when the current structured response
  says the publication cannot be proven. This is operational containment, not a
  repair implementation performed by this plan.
- Preserve the prior readable publication and durable receipts when a candidate
  operation fails.
- For Python graph decisions, require the returned deterministic `must:` search,
  exact source reads, or tests before using an empty inbound result for a
  change-impact decision.

Stopping condition: no automatic mutation or compatibility relaxation is
permitted before the reviewer approves C0/C1.

## 5. Batch C0 — checkpoint first-wrong-boundary evidence

Authorization: approved as one bounded read-only evidence batch. Execute only
with the canonical C0 procedure and preserve the explicit terminal outcomes in
[CHECKPOINT_INTEGRITY_REPAIR_REVIEW.md](./CHECKPOINT_INTEGRITY_REPAIR_REVIEW.md).

### Owner

Core publication/repair owner, with MCP `manage_index` receipt and post-repair
readback as the product witness.

### Exact steps

1. Freeze a canonical repository root, revision, runtime fingerprint, provider,
   collection, policy document, marker, V4 publication binding, source
   checkpoint, navigation authority, snapshot, lease receipt, and operation
   request. Preserve raw structured responses.
2. Establish a valid no-change baseline after restart. Record the complete
   identity tuple and a unique source token for later add/modify/delete checks.
3. Run the smallest repair mode that reaches generic navigation repair without
   changing source or vector payload. Record every durable phase and
   acknowledgement boundary.
4. Read marker, checkpoint, policy, navigation, publication, snapshot, and
   receipt immediately after repair and after a fresh process start.
5. Define a stable source-observation basis before accepting the repair: an
   observation token before scan -> complete scan/hash -> matching token after
   scan, or an immutable task-owned source materialization. A complete hash
   alone is not an atomic source snapshot.
6. Run explicit zero-change sync. Only after the canonical outcome is known,
   expand to unique add/modify/delete witnesses and failure injection. Preserve
   lifecycle responses and checkpoint status rather than inferring from missing
   search groups.
7. Test source mutation during hashing, after hashing before activation, a
   queued watcher event while the mutation lease is held, and restart after
   staging before activation.
8. Compare the transition with the relationship-only repair path, which already
   requires marker-owned checkpoint proof.
9. Classify the first wrong boundary as one of: repair, pre-existing state,
   restart/recovery, legacy authority, or not reproduced.

### Terminal outcomes

Record exactly one of:

- `checkpoint_repair_owned_transition_proven`
- `checkpoint_preexisting_corruption_proven`
- `checkpoint_restart_transition_proven`
- `checkpoint_legacy_authority_path_proven`
- `checkpoint_canonical_scenario_not_reproduced`
- `checkpoint_evidence_insufficient`

`checkpoint_canonical_scenario_not_reproduced` means the canonical request
remained valid under the tested conditions; it does not prove the historical
sequence impossible. Use `checkpoint_evidence_insufficient` when state cannot
be reconstructed or alternatives cannot be distinguished.

### Blocker terminal

For `checkpoint_evidence_insufficient`, keep the P1 open as unresolved; do not
patch the marker, synchronizer, policy schema, or recovery path. A
`checkpoint_canonical_scenario_not_reproduced` is a valid evidence terminal,
not permission to patch.

### Must preserve

No vector writes, no source edits, no bypass of leases, no destructive cleanup,
and no replacement of the prior readable publication on failure.

## 6. Batch C1 — smallest checkpoint/publication correction

Authorization: conditional on C0 identifying a repair-owned transition and
explicit approval of the selected correction.

### Repair contract modes

Choose exactly one at the first wrong boundary:

- **Mode A — already healthy:** return a true no-op. Do not rewrite navigation,
  marker, checkpoint, policy, or publication authority.
- **Mode B — source tuple valid, navigation damaged:** stage and activate only
  a new proven navigation/graph component through the existing V4 source
  authority, provided every reader can interpret that binding safely.
- **Mode C — source authority missing, corrupt, or changed:** fail to explicit
  reindex unless a separately authorized staged source-publication mechanism is
  proven.

Do not combine these modes. Do not make the synchronizer accept old and new
marker identities as equivalent. The invariant is compatibility through the
active publication binding, not equality of every component's generation or an
overloaded run ID.

### Implementation boundary

Prefer the Core method that owns the wrong transition:
`Context.repairIndex`, `writeCompletedIndexMarker`, and the publication helper.
Change MCP only if its post-repair proof is demonstrably the missing public
contract check. Do not patch `FileSynchronizer.assertValidGenerationSnapshot`
to hide an invalid tuple.

### Focused verification

- Healthy exact repair is a no-op for authority-bearing artifacts.
- Navigation-damaged but source-stable repair leaves a compatible checkpoint or
  publishes a complete replacement tuple, according to the chosen contract.
- Source authority missing, corrupt, or changed fails to explicit reindex unless
  the separately authorized source-publication path has its own proof.
- Repair failure before mutation, during candidate publication, after durable
  commit, and before acknowledgement preserves a readable proven generation or
  returns a truthful recovery state.
- Restart and zero-change sync pass before expanding to unique add/modify/delete
  witnesses. Stable-source tests cover mutation during hashing, after hashing
  before activation, queued watcher work during the lease, and restart after
  staging before activation.
- The existing focused repair proof and manage-index receipt tests remain green.

### Success terminal

Every successful repair passes exact tuple proof and the next incremental sync
does not require reindex solely because of repair. Failure and restart receipts
remain truthful.

### Blocker terminal

Any tuple ambiguity, unproven source observation, lost acknowledgement with
unclear durable state, or changed vector identity outside the accepted contract
stops the batch. Leave the system fail-closed and reopen C0.

### Compatibility and migration

If the correction changes a persisted schema or relationship/publication
version, freeze the migration/reindex consequence before code. Do not silently
upgrade existing artifacts. A navigation-only correction must not re-embed
vectors.

## 7. Batch R0 — Python first-wrong-boundary reproduction

Authorization: approved as an evidence-only batch; follow the existing
[Python inbound coverage plan](./SATORI_PYTHON_INBOUND_RELATIONSHIP_COVERAGE_REPAIR_PLAN.md)
and preserve its stated reviewer gates. This does not authorize production
implementation.

### Owner

Core Python relationship evidence, with relationship sidecar generation and
MCP graph projection as separately observable boundaries.

### Exact steps

1. Freeze the six recorded production sites, exact symbol instance identities,
   target revision, parser/extractor/relationship fingerprints, and the
   current partial-coverage response.
2. Reproduce the graph result after isolated rebuild and preserve exact
   requests/responses, sidecar records, source spans, and independent source
   references.
3. Trace one leading boundary at a time: module/import resolution, constructor
   receiver binding, service/callable binding, relationship emission, sidecar
   reload, or reverse traversal.
4. Build only bounded native prototypes for the frozen patterns. Keep same-name,
   wrong-receiver, test/fixture, and unrelated-service controls.
5. Freeze precision, context, runtime, stable-identity, and incremental
   equivalence gates before selecting R1/R2.

### Success terminal

The first wrong boundary and a falsifiable supported-pattern contract are
recorded. The prototype emits exact source/target IDs and spans while all
precision negatives remain edge-free.

### Blocker terminal

The boundary is not reproducible, the candidate model needs global suffix/name
matching, or precision/context/resource gates cannot be met. Leave the pattern
open and retain partial disclosure; do not add a broad graph authority.

## 8. Batch P0 — offline SCIP-Python provider-evidence spike

Authorization: approved as one bounded offline evidence spike after or
alongside R0. This batch must not integrate SCIP into production and must not
make SCIP an external graph authority.

### Architecture boundary

The experiment may use:

```text
Satori parser
  + offline language-semantic provider evidence
  -> Satori normalization and exact symbol identity
  -> Satori-owned relationship graph/publication/traversal
```

Satori remains authoritative for symbol identity, normalization, publication,
graph traversal, provenance, and completeness disclosure. Provider output that
is ambiguous or cannot be mapped exactly produces no exact edge.

### Exact steps

1. Generate one task-owned offline `scip-python` index for the frozen target;
   do not send source or artifacts to an external model/provider.
2. Test only the six frozen Python positives, existing wrong-receiver and
   same-name negatives, exact source/configuration identity, deterministic
   repeated output, bounded wall time/memory, and bounded artifact size.
3. Preserve the provider artifact, input/configuration identity, mapping
   diagnostics, exact symbol IDs/spans, and Satori-normalized edge set.
4. Do not test a second provider or integrate the result into runtime code in
   this batch.

### Decision table

| Provider result | Decision |
| --- | --- |
| 6/6 positives, no exact false positives | Candidate generic SCIP adapter; still requires separate production authorization and Satori-owned normalization/publication. |
| 5/6, with only the explicit `Any` case missing | Candidate SCIP evidence plus one narrow native binding supplement; no production change yet. |
| Four or fewer positives, or several pattern classes missed | Resume bounded native R1/R2 investigation; provider evidence is insufficient as the primary path. |
| Any wrong-target edge or identity mismatch | Reject exact SCIP ingestion; retain advisory partial coverage. |

### Success terminal

The provider result is repeatable, bounded, exactly mapped or explicitly
unmappable, and one decision-table row is supported by durable evidence.

### Blocker terminal

Any source/configuration ambiguity, wrong target, unstable identity, resource
overrun, nondeterministic output, or missing artifact provenance stops the
spike. No production integration follows.

## 9. Conditional Python implementation batches

R1/R2/R3/R4 remain conditional on the existing plan's gates. Their shared
requirements are:

- freeze the semantic identities and scope rules before implementation;
- change the smallest Core relationship owner, not a downstream graph symptom;
- preserve stable symbol IDs, deterministic ordering, publication authority,
  and `CALL_GRAPH_INBOUND_COVERAGE_PARTIAL` disclosure;
- prove full rebuild and incremental update equivalence;
- verify sidecar reload and restart behavior;
- use exact production witnesses and wrong-receiver/same-name negatives;
- version/reindex only the affected relationship/navigation contract when
  required; and
- do not add suffix matching, repository-global same-name selection, an
  external graph authority, or production-wide language-server integration.
  A provider-evidence result may proceed only through a separately authorized
  Satori-owned adapter decision after R0/P0.

Success terminal: every frozen expected edge, span, identity, and negative
control passes the focused MCP/Core witness. Blocker terminal: any false
positive, unstable identity, unresolved dependency invalidation, or resource
budget failure leaves coverage open and stops the batch.

## 10. Batch D1a — current repository-map correction

Authorization: approved as a docs-only correction. Historical plans remain
untouched in this batch; do not edit the other agent's current plan/report
files as part of this audit.

### Owner

Repository documentation authority for `docs/SATORI_REPOSITORY_MAP.md` and the
status labels of stale/proposed plans. The registry and generated checks remain
the contract source.

### Exact steps

1. Change current architecture/workflow wording to list all seven tools,
   including `continue_search`, and describe its process-local frozen-ranking
   semantics.
2. Do not sweep historical/proposed plans in this batch. Reopen that work only
   with a separate documentation authorization.
3. Do not change runtime schemas, `registry.ts`, `server.json`, or generated
   README output unless a separate contract decision requires it.
4. Run `docs:check`, `manifest:check`, `versions:check`, Markdown/diff checks,
   and inspect the complete docs-only diff.

Success terminal: the current repository map lists seven tools, accurately
describes `continue_search`, and all generated checks pass. Blocker terminal:
the intended authority is ambiguous or a historical-plan edit is required;
stop without sweeping.

## 11. Batch S0 — semantic abstention qualification

Authorization: S0 evidence gathering only, according to
[SEMANTIC_ABSTENTION_QUALIFICATION_REVIEW.md](./SEMANTIC_ABSTENTION_QUALIFICATION_REVIEW.md).

S0 may freeze canonical requests, query/group ground truth, retrieval and
disclosure diagnostics, a preregistered candidate-search protocol, runtime/risk
scope, and sealed holdout governance. It may not add a threshold, response
field, model, reranker, dependency, or public “no answer” claim.

Success terminal: the evidence distinguishes retrieval recall, conditional
acceptance, and end-to-end disclosure and supports a bounded decision.
Blocker terminal: no safe oracle, provenance, or holdout governance; defer the
feature without changing runtime behavior.

## 12. Verification dependency graph

```text
D1a current repository-map correction
  |
  +--> seven-tool wording + generated checks

C0 canonical first-wrong-boundary evidence
  |
  +--> C1 selected checkpoint/publication correction
  |      |
  |      +--> stable-source + restart + zero-change qualification
  |
  +--> R0 Python boundary evidence
         |
         +--> P0 offline SCIP-Python evidence spike
                |
                +--> conditional native/provider production decision
                |
                +--> navigation requalification/reindex decision

  --> deferred semantic contract decision
```

Do not run a downstream acceptance check as proof that an upstream authority
decision is correct. A green graph fixture does not prove publication
integrity; a green marker test does not prove Python inbound completeness.

## 13. Explicit exclusions

- No product-code changes in the current audit.
- No multi-agent orchestration or subagents.
- No `manage_index` create, sync, repair, reindex, or clear operation against
  the local Satori index without explicit approval.
- No build/clean/generation command that rewrites product or generated files as
  part of the audit.
- No automatic migration, release, deployment, paid-provider test, or external
  service mutation.
- No broad retrieval/ranking redesign, model/provider change, reranker, or
  calibrated no-answer response before S0.
- No repository-global Python matching, speculative edges, external graph
  authority, or production-wide language-server integration. The single
  offline provider-evidence P0 is allowed only as a task-owned experiment with
  Satori retaining graph authority.
- No general cleanup, hardening program, abstraction rewrite, or unrelated test
  expansion.

## 14. Current authorization matrix

| Work | Decision |
| --- | --- |
| Assessment wording corrections | Approved and applied in this artifact update |
| D1a current repository-map correction | Approved and applied; generated checks remain required |
| Historical-plan documentation sweep | Deferred |
| C0 canonical checkpoint evidence | Approved as one bounded evidence batch |
| C1 checkpoint implementation | Conditional on C0 proving a repair-owned transition |
| Broader C2/C3 publication work | Blocked until C0/C1 requires it |
| Python R0 | Approved as evidence-only |
| Offline SCIP-Python P0 | Approved as one evidence-only provider spike |
| Native Python R1-R4 | Paused pending R0/P0 |
| Production SCIP integration | Not authorized |
| Semantic S0 | Deferred unless calibrated abstention becomes a concrete product priority |
| Semantic runtime policy | Not authorized |

## 15. Final approval gate

Before any product implementation, the reviewer must select a bounded batch and
confirm:

1. its owner and first falsifiable outcome;
2. the public/persisted contract it is allowed to change or must preserve;
3. the exact success witness and blocker terminal outcome;
4. the compatibility/reindex consequence; and
5. the files allowed to change.

Until that approval exists, the terminal state of this plan is:

```text
assessment complete
remediation sequence proposed
product code unchanged
approved evidence batches may execute only within the matrix above
wait for explicit product-implementation approval
```
