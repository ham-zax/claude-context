# Large-Repository Repair and Navigation Truth Plan

Status: B1-B6 implementation and focused verification complete
Created: 2026-07-23
Repository baseline reviewed: `c9ece273fb18300cd19d80c2175eb7321955ebaf`
Operational witness: `/home/hamza/repo/tradingview_ratio` at
`8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7`

## 1. Outcome

Correct the verified operational truth gaps exposed by
`docs/plans/report.md` without reopening retrieval qualification, general type
inference, ranking, or index architecture.

Operational remediation is complete when:

1. an empty inbound call graph explicitly states that caller coverage is
   advisory and recommends deterministic verification;
2. repair can prove exact payload equality for a healthy 19,741-row
   publication without an unbounded response on adapters with same-state
   payload authority, while other adapters report a truthful proof limit; and
3. the immediately corresponding inbound and repair guidance is current.

The follow-up navigation-truth milestone is complete when:

1. the two proven constructor-derived Python receiver forms produce
   relationships only when their class authority is unique;
2. generated symbol registries bind a child to its concrete lexical parent
   when that parent is uniquely present;
3. definition-free files do not degrade a language while structural analysis
   failures remain visible;
4. changed-code diagnostics state that their file set is Git-tracked-only; and
5. directly invalidated documentation and compatibility identities are
   current.

This plan does not claim comprehensive retrieval quality, call-graph
completeness, freshness latency, or semantic abstention.

## 2. Relationship to existing authorities

The following plans remain complete and are not reopened:

- `docs/remediation/2026-07-23-operational-search-and-navigation-findings.md`
- `docs/plans/SYMBOL_OWNED_RETRIEVAL_IMPLEMENTATION_PLAN.md`
- `docs/plans/MULTI_LANGUAGE_SYMBOL_DEFINITION_PARITY_PLAN.md`

This plan owns only later evidence that those completed programs did not
implement:

- large-publication repair proof beyond the query-only row cap;
- direct empty-inbound disclosure when no suppressed edge exists;
- bounded Python constructor-derived receiver evidence;
- population and exact projection of the existing `parentKey` contract;
- capability classification that distinguishes definition-free files from
  structural extraction failures;
- explicit basis disclosure for `changedCode`; and
- documentation of recursive `/**` directory syntax, bounded debug-mode
  selection, and guidance directly invalidated by repair and inbound-disclosure
  changes.

The previous relationship program deliberately deferred broader receiver/type
inference. This plan admits only the two syntactic constructor forms frozen in
B2B. It does not authorize name-only guessing, alias/data-flow inference, or
general field typing.

The operational `tradingview_ratio` repository is a read-only witness for all
B1-B6 work. Implementation and acceptance use task-owned Core/MCP fixtures.
Do not run `sync`, `repair`, `create`, or `reindex`, and do not mutate source or
Satori state for that operational repository during this program.

## 3. Reconciled repository truth

### 3.1 Large-publication repair

`Context.repairIndex()` currently:

1. computes every expected chunk ID;
2. checks expected membership in 512-ID `in` queries;
3. rejects proven missing IDs;
4. refuses exact proof when `expectedChunks.length + 1 > 16_384`; and
5. returns `requires_reindex` with
   `exact_payload_query_limit_exceeded`.

All shipped vector database implementations expose exact count authority
through `countDocuments()`:

- LanceDB uses `table.countRows(...)`;
- Milvus uses `count(*)`;
- Milvus REST uses `count(*)`.

The existing `countIndexedPayloadExactly()` owner already prefers that
authority and retains a fail-closed query-only fallback.

For finite expected set `E` and remote set `R`:

```text
E is a subset of R
and
|E| = |R|
therefore
E = R
```

Repair already proves the subset relation. An exact equal count completes the
set-equality argument without enumerating all remote IDs in one response, but a
successful repair proof additionally requires evidence that membership and
count observed the same remote payload state.

The MCP repair entrypoint already acquires the root mutation lease and passes
`assertMutationCurrent` into `Context.repairIndex()`. That lease excludes
Satori-owned writers but does not detect external backend mutation between
membership enumeration and the final payload observation. LanceDB exposes
`getCollectionDataObservation()`; the shipped Milvus adapters do not. Exact
count therefore completes equality only when it is paired with adapter-provided
same-state payload authority. Other adapters must report a proof limit rather
than treating lease continuity as remote snapshot evidence.

Decisions:

- `repair_exact_count_path_required`;
- `repair_same_state_adapter_authority_required`;
- `repair_proof_limit_projection_required`.

### 3.2 Inbound Python relationships

The report's `SignalGenerator.check_entry` false negatives have two concrete
forms:

```python
signal_gen = SignalGenerator(config)
signal_gen.check_entry(...)
```

and:

```python
self.signal_gen = SignalGenerator(config)
# another method in the same class
self.signal_gen.check_entry(...)
```

The current relationship builder resolves:

- exact same-class `self` and `cls` calls;
- simple directly annotated parameter receivers;
- exact same-file or imported class references.

It does not extract constructor-derived receiver bindings, and it rejects
compound receiver text such as `self.signal_gen`.

Current receiver-type evidence is persisted per file in relationship
contributions. The contribution validator admits only
`kind="parameter_annotation"` under
`RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION =
"relationship_file_contribution_v2"`. Constructor evidence therefore crosses
the persisted incremental boundary; it is not a same-pass-only optional
record.

The local production witness in `pair_evaluator.py` is nested inside an
`if`/`try` suite, but its assignment and call are direct statements in the same
statement-list block and the assignment precedes the call. A callable-body-only
rule would exclude this demonstrated caller. The frozen rule below uses exact
same-block ordering instead of general control-flow inference.

Search results already mark every graph-ready target with
`navigation.inbound="verify"`. A direct zero-edge caller traversal provides a
`must:` fallback only when suppressed relationship notes exist. If relationship
extraction emitted no candidate at all, the empty response may contain no
equivalent warning or next step.

Decisions:

- `empty_inbound_disclosure_required`;
- `bounded_constructor_receiver_evidence_required`.

### 3.3 Parent identity

`SymbolRecord` and the persisted sidecar schema already allow `parentKey`.
`buildSymbolRecordsForFile()` records `parentQualifiedNamePath` but never
populates `parentKey`. `projectCanonicalSymbolIdentity()` resolves a concrete
parent only by `parentKey`.

`SYMBOL_REGISTRY_SCHEMA_VERSION` is part of the symbol manifest hash and
validator but is not an input to `symbolKey` or `symbolInstanceId`.
`SYMBOL_EXTRACTOR_VERSION`, by contrast, is an exact-instance identity input.
The compatible B3 invalidation owner is therefore the registry schema, not the
extractor identity.

The observed combination:

```text
parentQualifiedNamePath: ["ClassName"]
parentResolution: "missing"
```

is systematic for generated registry records rather than an isolated outline
defect.

Decision: `lexical_parent_binding_required`.

### 3.4 Capability classification

The active tradingview_ratio generation contains 944 Python files. The 13
file-owner-only entries are:

```text
scripts/codebase_audit/__main__.py
scripts/codebase_audit/runtime/__init__.py
src/cli/use_cases/__init__.py
src/python/__init__.py
src/python/core/copula/__init__.py
src/python/core/discovery/__init__.py
src/python/core/m2m/__init__.py
src/python/core/research/__init__.py
src/python/core/validation/__init__.py
tests/cli/presenters/__init__.py
tests/core/__init__.py
tests/core/statistics/__init__.py
tests/shadow/__init__.py
```

Evidence anchor:

- generation: `symmanifest_e669-dd6499bba74a1b14`;
- symbol registry manifest:
  `symmanifest_e66958cafe44b5b9548b47f70d8f2fff`;
- manifest SHA-256:
  `6f0239a341d74e785a5ff61d27298655b6b70cd0c619e3ee6fadd76808f03192`;
- navigation seal SHA-256:
  `6edaa4024f555805c8fab937f1f006aaeeac05d54ba719da1331e1976ed4732d`.

They are empty, docstring-only, import/re-export-only, or an entry script with
no definition. The current capability owner degrades exact symbols, outlines,
and call graph whenever any eligible language file lacks a non-file symbol.
It cannot distinguish correct definition-free output from structural analysis
failure.

Decision: `definition_free_capability_classification_required`.

### 3.5 Changed-code diagnostics

`getChangedFilesForCodebase()` invokes:

```text
git status --porcelain --untracked-files=no
```

The resulting set drives changed-first ranking and the `changedCode` debug
projection. Watcher freshness separately indexes untracked files. The two
owners are intentionally different, but the response does not identify
`changedCode` as Git-tracked-only.

Decision: `changed_code_basis_disclosure_required`.

## 4. Findings not authorized for implementation

### 4.1 Semantic abstention

The nonsense query demonstrates that top-k vector retrieval returns nearest
neighbours. It does not establish a safe global warning threshold.

The current `quality.semantic` field reflects retrieval route/evidence type,
not calibrated relevance. The completed operational remediation already
requires provider-specific positive and negative evidence before choosing a
no-answer policy.

Decision: `semantic_abstention_evidence_insufficient`.

No score threshold, result suppression, or new warning is authorized here.

### 4.2 Reindex progress

The report did not retain the exact progress event sequence. The observation
that 100% appeared before final activation is not reproducible enough to
change progress semantics.

Decision: `progress_contract_unproven`.

### 4.3 Full debug payload

The observed 300,842-character response is below the existing 2 MiB full-debug
cap. The artifact path and digest were not retained. Summary, ranking, and
freshness projections already exist.

Decision: `debug_redesign_not_justified`.

Documentation may recommend bounded modes; no artifact store, paging system,
or logging framework is authorized.

### 4.4 Documentation ranking

Canonical-document authority versus research-note ranking is a separate
retrieval policy decision and is not required by this operational report.

Decision: `documentation_ranking_deferred`.

## 5. Frozen contracts

### 5.1 Exact repair proof

Successful membership-plus-count proof requires both exact count authority and
a same-state payload authority. The latter is either an adapter snapshot read
covering membership and count or an immutable collection-data observation that
is equal before and after those reads.

```text
acquire and assert the existing repair mutation authority
    -> bind the expected-ID source observation, collection and completion marker
    -> capture the adapter's same-state payload authority
    -> query all expected IDs in bounded batches
    -> fail requires_reindex on any missing expected ID
    -> read exact remote payload count
    -> recapture or close the same-state payload authority
    -> reassert the same mutation, source, collection and marker authority
    -> fail requires_reindex when count differs
    -> mark payload and staleRemoteChunks matched when count equals expected
```

All membership batches and the exact count must describe the same expected set
and remote payload state. B1 must reuse the established root mutation lease;
it must not introduce a second transaction or lock system. The root lease
excludes Satori-owned writers but is not evidence against an external backend
writer.

Before success, repair must reassert:

- the exact selected collection;
- the completion marker and publication binding used to enter repair;
- the source observation from which the expected IDs were derived, using the
  repair owner's existing freshness authority rather than a new checkpoint
  lifecycle;
- `assertMutationCurrent()` after membership enumeration and after the exact
  count; and
- an adapter-provided immutable collection-data observation or equivalent
  snapshot authority spanning membership and count.

A lost lease, changed source observation, changed marker/publication binding,
changed collection-data observation, or different collection cannot complete
equality. An adapter without same-state payload authority cannot silently rely
on the root lease to classify externally mutable backend data as one
publication.

The exact count must exclude control records under the existing backend
contract.

Repair must distinguish:

- `requires_reindex`: a missing expected ID, count mismatch, unexpected
  payload, fingerprint mismatch, or another demonstrated incompatibility;
- `repair_proof_limit`: the active adapter lacks exact count or same-state
  payload authority and its single-response bounded query fallback cannot prove
  equality;
- successful matched proof: complete expected membership and exact equal count
  under one same-state payload authority.

`repair_proof_limit` is an additive Core result with `status="blocked"` and
`reason="repair_proof_limit"`. MCP projects it as response format version 1
with `status="blocked"`, `reason="repair_proof_limit"`, the proof attached, and
the repair operation terminally `blocked`. Its hints may identify the missing
proof capability and suggest retrying repair after adapter support changes, but
must not contain create, reindex, or `nextAction` guidance that implies stale
payload was demonstrated.

LanceDB's existing `getCollectionDataObservation()` is the current same-state
authority. Milvus adapters have exact count but no equivalent observation, so
they take the truthful `repair_proof_limit` path unless repository evidence
establishes a supported snapshot mechanism. B1 does not require adding a new
backend method merely to complete this program.

### 5.2 Empty inbound disclosure

For `direction="callers"` or `"both"`:

- if the resolved target has zero inbound edges, return a stable warning that
  inbound coverage is partial/advisory;
- return an existing-shape `hints.nextSteps` action for
  `search_codebase` using `must:<identifier> <identifier>`;
- use a unique suppressed caller-site path when already proven;
- otherwise omit path narrowing rather than guessing a caller file;
- never synthesize an edge from the method name alone.

This disclosure applies whether or not suppressed relationship notes exist.
Non-empty inbound results remain advisory under the existing public contract.

### 5.3 Constructor-derived receiver evidence

Admit only these Python forms.

#### Callable-local constructor

```python
receiver = ClassName(...)
receiver.method(...)
```

Required authority:

- direct identifier assignment target;
- direct constructor call;
- assignment and use owned by the same callable and exact statement-list
  block;
- assignment span precedes the member-call span;
- neither statement crosses a nested callable, lambda, or comprehension
  boundary;
- no admitted reassignment of that receiver occurs between the assignment and
  call in that block;
- constructor class resolves uniquely through the existing same-file/import
  authority;
- no conflicting admitted constructor type for that receiver in the callable.

The shared exact block may itself be nested beneath an `if`, `try`, loop, or
context manager only when both assignment and call are direct statements in
that same block. No binding propagates out of or into a different branch,
handler, loop body, or statement list.

#### Instance-field constructor

```python
self.receiver = ClassName(...)
# another method in the same exact class
self.receiver.method(...)
```

Required authority:

- direct `self.<identifier>` assignment target;
- assignment occurs as a direct statement in the exact class's `__init__`
  body;
- direct constructor call;
- constructor class resolves uniquely through existing same-file/import
  authority;
- every admitted direct `__init__` assignment for that field resolves to one
  exact constructor class; and
- the member use occurs in a method of that same exact class.

Exclude:

- `cls` or arbitrary object fields;
- property chains deeper than `self.<identifier>`;
- computed attributes;
- tuple/destructuring targets;
- factory-return inference;
- aliases or copies after construction;
- bindings that would need control-flow propagation between statement-list
  blocks;
- instance-field assignments outside `__init__` or beneath conditional,
  loop, exception-handler, context-manager, lambda, comprehension, or nested
  callable structure;
- reassignment with unequal types;
- name-only cross-file matches;
- external classes absent from the registry.

The binding is parser evidence, not a guessed edge. If any authority is
ambiguous, emit no relationship.

#### Persisted receiver contribution

Constructor receiver evidence uses the existing per-file
`receiverTypeBindings` contribution owner:

- `parameter_annotation` retains its current four-field contract unchanged;
- `local_constructor` records `localName`, `typeName`, assignment `span`, and
  the exact containing `statementBlockSpan`;
- `self_field_constructor` records the exact `self.<identifier>` receiver text
  as `localName`, `typeName`, and assignment `span`.

The analyzer emits these records only after the frozen syntactic checks pass.
The relationship builder still resolves class and member authority against the
current registry. The contribution serializer and validator must admit exactly
these shapes, advance
`RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION`, and reject older contribution
records rather than interpreting their missing constructor evidence as
complete. Full and incremental relationship construction must consume the same
persisted evidence.

### 5.4 Lexical parent binding

For every non-root registry symbol with a parent path:

1. derive the expected parent qualified name from the child's normalized
   lexical parent path;
2. consider same-file container candidates with that exact qualified name;
3. require the candidate span to contain the child span;
4. select the unique innermost parent stable key;
5. store that key as `parentKey`; and
6. resolve the exact parent instance by same-file span containment when
   multiple instances share the stable key.

If there is no unique candidate, retain `parentResolution="missing"` or
`"ambiguous"` honestly.

`parentKey` identifies the stable key of the same-file containing lexical
parent. Canonical projection selects the concrete containing instance by span.
It does not bind a non-containing semantic owner, including an out-of-class
qualified C++ method definition.

Adding `parentKey` must not change:

- the child's `symbolKey`;
- the child's `symbolInstanceId`;
- its qualified name;
- its span; or
- existing relationship endpoints.

Reopened namespace instances may share a stable key. Exact parent projection
must use the containing instance rather than treating every repeated instance
as the parent.

### 5.5 Definition-aware capability evidence

Each symbol manifest file contribution must distinguish:

- `definitions_present`: complete structural analysis emitted at least one
  non-file definition;
- `definition_free`: complete structural analysis correctly emitted none;
- `structural_unavailable`: analysis recovered, failed, or was unsupported for
  a language that declares structural navigation.

Capability denominators include `definitions_present` and
`structural_unavailable`; they exclude `definition_free`.

Rules:

- a compatible registry with definition-bearing files and only intentional
  definition-free exclusions may report symbol navigation ready;
- any `structural_unavailable` contribution degrades the affected structural
  capability;
- zero definition-bearing files cannot manufacture a ready exact-symbol or
  call-graph claim;
- counts for total files, definition-bearing files, definition-free files,
  and structurally unavailable files remain visible;
- old manifests without the required evidence are not reinterpreted as
  definition-free.

Do not infer definition-free status from filenames such as `__init__.py`,
source text, capitalization, or symbol-count thresholds.

Definition status corrects only the file-evidence denominator used by each
capability. A final exact-symbol, outline, or call-graph state still requires
that language's declared capability, a compatible registry/navigation
generation, and its capability-specific evidence. Definition-free coverage
must not manufacture relationship readiness or hide partial relationship
evidence.

### 5.6 Changed-code basis

Preserve Git-tracked-only changed-first behavior. Add an explicit stable basis
to the debug projection:

```json
{
  "changedCode": {
    "basis": "git_tracked_worktree",
    "files": []
  }
}
```

Documentation must state that watcher freshness can include untracked files
even when they are absent from `changedCode.files`.

No watcher/Git union and no changed-first boost for arbitrary untracked files
is authorized.

This is an additive public debug-response change. It keeps
`SEARCH_RESPONSE_FORMAT_VERSION = 2`, because the new field is required only
inside an optional diagnostic object under the existing additive response
contract. It changes no index fingerprint. Update the public response
documentation and focused projection contract; regenerate a tool/server
artifact only if its authoritative input actually includes this response
shape.

## 6. Compatibility and publication

### B1 repair

No extractor, registry, relationship, or public index fingerprint changes.
This is proof-control behavior over the existing backend contract.

The additive public contract is frozen as follows:

- Core `RepairIndexResult` adds `reason="repair_proof_limit"` on
  `status="blocked"`;
- MCP `ManageIndexReason` adds `repair_proof_limit` while
  `ManageIndexResponseEnvelope.version` remains `1`;
- the operation phase is `blocked`;
- the response carries `repairProof` and capability-oriented hints only;
- create, reindex, and stale-payload guidance are prohibited for this reason;
- focused Core and MCP contract tests cover the mapping; and
- public repair descriptions are updated only where they enumerate possible
  repair outcomes.

### B2 inbound relationships

The disclosure-only change does not change persisted relationships.

Constructor-derived receiver evidence changes `CALLS`/`TESTS` output and must:

- advance `RELATIONSHIP_BUILDER_VERSION`;
- advance `RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION`;
- invalidate old relationship contributions and manifests rather than treating
  absent constructor bindings as complete evidence;
- preserve symbol identities; and
- enter the established reindex path rather than reuse old relationship
  artifacts.

### B3 parent binding

`parentKey` already exists in `SymbolRecord` and the sidecar validator, but
generated registry meaning changes. B3 must advance
`SYMBOL_REGISTRY_SCHEMA_VERSION` while leaving `SYMBOL_EXTRACTOR_VERSION`
unchanged. The registry schema is included in the manifest hash and is rejected
by the existing validator when incompatible; it does not enter `symbolKey` or
`symbolInstanceId`.

Relationship logic is unchanged, but relationship artifacts bound to the old
registry manifest hash are not reusable.

If repository evidence disproves that this schema transition invalidates old
registries and their bound relationship artifacts without exact-instance
churn, B3 ends `parent_compatibility_identity_blocked`. Do not substitute an
extractor-version bump.

### B4 capability evidence

Adding required per-file structural evidence changes the internal symbol
manifest contract. Advance the symbol registry schema/compatibility identity
and reject old manifests that cannot distinguish definition-free from
structurally unavailable files.

If B3 lands first, B4 advances from B3's registry schema to the next incompatible
registry schema. Neither batch changes extractor semantics or exact symbol
identity. Every committed incompatible registry state must differ from its
parent.

### B5 diagnostic basis

No index or relationship identity change. The optional public debug projection
changes, while search response format version 2 and the tool input schema
remain unchanged.

## 7. Execution batches

### B0 — Report reconciliation

Owners:

- `docs/plans/report.md`
- this plan

Completed evidence:

- observations and inferences are separated;
- revision and generation inputs are recorded;
- unsupported reliability and freshness-latency claims are removed;
- missing request/artifact provenance is disclosed;
- the sealed manifest identifies the 13 file-owner-only Python paths and source
  inspection at the recorded revision classifies their contents; and
- verified code owners are recorded.

Terminal decision:

```text
capability_report_reconciled
```

### B1 — Large-publication repair proof

Owners:

- `packages/core/src/core/context.ts`
- `packages/core/src/core/repair-proof.ts`
- existing adapter same-state observation owner; currently
  `packages/core/src/vectordb/lancedb-vectordb.ts`
- the existing MCP repair mutation-lease and response owner in
  `packages/mcp/src/core/manage-indexing-handlers.ts`
- `packages/mcp/src/core/manage-types.ts`
- nearest focused Core and MCP repair tests

Bounded owner expansion:

```text
authorized outcome: exact repair equality for one immutable publication
evidence: membership and count prove equality only when they observe one
          remote payload state
required additional owner: existing same-state adapter observation and the
                           additive repair-proof-limit response projection
stopping condition: LanceDB proves the large healthy fixture under one stable
                    data observation; adapters without equivalent authority
                    return repair_proof_limit without reindex guidance
```

B1 uses the expected IDs already derived by the repair owner and reasserts the
existing completion/publication authority. It does not add a new source
checkpoint lifecycle, commit or advance a checkpoint, or add a second mutation
system.

Tasks:

1. bind the expected set and remote observations to the current repair lease,
   selected collection, completion marker, and publication binding;
2. require and capture the adapter's same-state payload authority before
   membership enumeration;
3. route exact remote payload count through
   `countIndexedPayloadExactly()`;
4. combine count equality with complete expected-ID membership;
5. reassert the repair/publication authority and verify the same-state adapter
   observation after membership and exact count;
6. retain the single-response bounded query fallback where it can prove the
   entire payload; otherwise report proof-limit;
7. add the frozen additive Core/MCP proof-limit reason and prohibit false
   create/reindex guidance;
8. replace the existing 16,384-row oracle with:
   - a healthy LanceDB publication above 16,384 rows that passes through exact
     count under one stable data observation;
   - one equal-count/missing-ID mismatch;
   - one count mismatch;
   - one changed-data-observation result; and
   - one exact-count adapter without same-state authority returning
     `repair_proof_limit`;
9. reuse an existing repair lease-loss test if it invalidates the proof between
   membership and count; otherwise add one focused interleaving at that exact
   boundary.

Stop when the large healthy same-state fixture passes, demonstrated mismatch
still fails closed, and adapters without same-state authority return the frozen
proof-limit response without reindex guidance.

Terminal decisions:

- `large_repair_exactness_pass`
- `repair_count_authority_blocked`
- `repair_same_state_authority_blocked`

### B2A — Empty inbound truth

Owners:

- `packages/mcp/src/core/relationship-backed-call-graph.ts`
- existing call-graph envelope types and focused tests

Tasks:

- emit the frozen warning and existing-shape next step for every zero-edge
  inbound traversal;
- preserve current suppressed-note path narrowing;
- prove the no-note case receives an unscoped `must:` fallback;
- prove nonzero and callee-only traversals do not receive a false zero-edge
  warning.

Terminal decisions:

- `empty_inbound_truth_pass`
- `empty_inbound_disclosure_blocked`

### B2B — Bounded Python constructor receivers

Sequence this batch after B3 and B4 so its final relationship compatibility
cutover binds to the resulting registry manifest once rather than being
invalidated by each registry transition.

Owners:

- `packages/core/src/language-analysis/types.ts`
- `packages/core/src/language-analysis/tree-sitter-adapter.ts`
- `packages/core/src/relationships/builder.ts`
- relationship contribution serialization and validation in
  `packages/core/src/symbols/sidecar.ts`
- `RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION`
- nearest focused analyzer and relationship tests

Tasks:

1. extract only the frozen same-block local and direct-`__init__` field
   constructor bindings;
2. persist their exact frozen contribution shapes;
3. bind each record to its callable/block or exact enclosing class;
4. resolve constructor class authority through existing exact rules;
5. resolve member targets only when binding and target member are unique;
6. add near-miss exclusions for use-before-assignment, cross-block use,
   factory returns, conflicting reassignment, non-`__init__` fields, and
   arbitrary object fields;
7. advance relationship builder and contribution compatibility identities;
8. prove full and incremental relationship construction agree for one
   representative changed file.

Stop after the three observed `SignalGenerator.check_entry` production call
sites are representable by the frozen rules. Do not expand to unrelated
receiver inference.

Terminal decisions:

- `python_constructor_receiver_pass`
- `python_constructor_receiver_ambiguous`
- `python_constructor_contribution_contract_blocked`

### B3 — Concrete lexical parents

Owners:

- `packages/core/src/symbols/registry.ts`
- `packages/mcp/src/core/canonical-symbol-identity.ts`
- nearest focused Core registry and MCP projection/outline tests

Tasks:

- populate parent stable keys under the frozen lexical contract;
- resolve the unique containing exact instance;
- cover one ordinary class/method and one reopened namespace;
- prove root symbols remain `not_applicable`;
- prove ambiguous/missing parents remain honest;
- prove child stable and exact identities are unchanged;
- advance `SYMBOL_REGISTRY_SCHEMA_VERSION`;
- prove `SYMBOL_EXTRACTOR_VERSION` is unchanged; and
- prove old registry and relationship artifacts are rejected through the
  existing manifest-binding path.

Terminal decisions:

- `lexical_parent_binding_pass`
- `parent_identity_model_blocked`
- `parent_compatibility_identity_blocked`

### B4 — Truthful language capability classification

Owners:

- symbol manifest contracts, builders, and validators;
- `packages/core/src/languages/evidence.ts`;
- nearest focused manifest and capability tests;
- MCP status projection only if it assumes old counts.

Tasks:

- persist the frozen per-file structural definition status;
- calculate capability from definition-bearing and unavailable files;
- prove an empty/import-only Python file is definition-free and does not
  degrade a healthy language;
- prove a recovered Python file remains a degradation;
- prove a language with no definition-bearing files does not become ready;
- prove definition status does not manufacture call-graph readiness when
  relationship evidence remains unavailable or partial;
- advance and verify manifest compatibility.

Terminal decisions:

- `definition_aware_capability_pass`
- `capability_manifest_contract_blocked`

### B5 — Changed-code basis and directly invalidated docs

Owners:

- `packages/mcp/src/core/search-types.ts`
- `packages/mcp/src/core/search-debug-helpers.ts`
- generated MCP tool documentation owner if its input changes
- `docs/SATORI_FEATURES_AND_USE_CASES.md`
- root/package README only where they describe affected behavior

Tasks:

- expose `git_tracked_worktree` as the changed-code basis;
- document the independent watcher/untracked freshness boundary;
- document recursive directory operator syntax with `/**`;
- document bounded diagnostic mode selection;
- publish the directly invalidated inbound guidance immediately after B2A;
- publish the directly invalidated repair guidance immediately after B1; and
- complete the remaining changed-code, path, and debug documentation after
  their owning behavior passes.

Do not normalize trailing-slash path operators; current glob semantics are
internally consistent and documentation is sufficient.

Terminal decisions:

- `operational_truth_docs_pass`
- `operational_truth_contract_blocked`
- `operational_truth_documentation_blocked`

### B6 — Consolidation

Execution order is B2A, B1, B3, B4, B2B, then B5. B2A publishes the immediate
caller-safety correction first. B3 and B4 perform the registry compatibility
transitions before B2B finalizes relationship contributions and manifests
against the resulting registry authority.

Run only checks invalidated by B1-B5, then one non-overlapping affected Core
and MCP checkpoint.

Record:

- final extractor/registry identity;
- final relationship identity;
- old-publication reindex implications;
- focused tests added;
- reused evidence;
- final status of every terminal decision.

Completion record (2026-07-24):

- `SYMBOL_EXTRACTOR_VERSION` remains
  `language-analysis-v15+${LANGUAGE_PARSER_VERSION}`;
- the final registry identity is `symbol_registry_v3`;
- the final relationship identities are
  `relationship-v8+python-constructor-receivers` and
  `relationship_file_contribution_v3`;
- older registry and relationship-contribution artifacts remain rejected
  through the existing incompatibility and reindex path;
- 328 non-overlapping focused Core and MCP tests passed, along with Core/MCP
  typechecking, changed-file ESLint, and `git diff --check`;
- the terminal outcomes are `large_repair_exactness_pass`,
  `empty_inbound_truth_pass`, `python_constructor_receiver_pass`,
  `lexical_parent_binding_pass`, `definition_aware_capability_pass`,
  `operational_truth_docs_pass`, and
  `large_repository_navigation_truth_complete`; and
- no B1-B6 blocker outcome remains active.

Terminal decisions:

- `large_repository_navigation_truth_complete`
- `navigation_truth_consolidation_blocked`

## 8. Verification ownership

### B1

- existing repair test owner;
- exact-count backend contract tests already present and reused;
- stable and changed `getCollectionDataObservation()` fixtures around
  membership plus exact count;
- one exact-count adapter fixture without same-state authority that proves the
  additive Core/MCP `repair_proof_limit` mapping and absence of create/reindex
  guidance;
- one lease-loss proof only if the existing repair suite does not already
  invalidate membership-plus-count on lease loss;
- no live reindex of tradingview_ratio.

### B2A

- relationship-backed call-graph response tests only.

### B2B

- parser binding records;
- contribution serialization and old-schema rejection;
- exact positive and near-miss relationship fixtures;
- one incremental/full equivalence fixture;
- existing relationship-manifest invalidation test.

### B3

- registry parent binding;
- canonical identity projection;
- one public outline projection;
- existing registry-schema and relationship-manifest incompatibility proof;
- unchanged extractor and child exact-instance identity.

### B4

- manifest serialization/validation;
- capability classification fixtures;
- established old-schema rejection path.

### B5

- compact debug projection test;
- docs generation/check only if generated inputs changed.

### Consolidation

Candidate commands, selected only when their owner changed:

```bash
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-core typecheck
pnpm --filter @zokizuan/satori-mcp test
pnpm --filter @zokizuan/satori-mcp typecheck
pnpm exec eslint <changed TypeScript files>
git diff --check
```

Do not run paid-provider tests, retrieval benchmarks, installer/release
qualification, or another live target-repository reindex.

## 9. Acceptance gates

1. Successful membership-plus-count proof is bound to one current repair
   lease, expected-ID source observation, selected collection, completion
   marker, and adapter-provided same-state payload authority.
2. A healthy LanceDB publication above 16,384 rows no longer receives false
   `requires_reindex`.
3. A missing expected ID, unequal exact count, changed payload observation, or
   lost repair/publication authority still fails closed.
4. An adapter without exact count or same-state payload authority returns
   additive `status=blocked`, `reason=repair_proof_limit` under manage response
   version 1, with no create, reindex, or stale-payload guidance.
5. Every zero-edge inbound traversal contains actionable verification
   guidance without fake edges.
6. The directly invalidated inbound guidance is published with B2A, making the
   operational caller-safety correction independently complete.
7. Only the two frozen constructor receiver shapes produce new relationships.
8. Constructor evidence survives contribution serialization and full versus
   incremental construction agrees.
9. Conflicting or unresolved receiver authority emits no relationship.
10. Child identity is unchanged when `parentKey` is added.
11. Reopened containers resolve only the exact containing parent instance.
12. Definition-free files do not degrade language capability.
13. Recovered/failed structural analysis remains degraded.
14. Definition status does not manufacture capability-specific readiness.
15. B3 and B4 registry transitions precede B2B's final relationship
    compatibility cutover, and old incompatible registry/relationship
    artifacts are rejected through the resulting manifest bindings.
16. `changedCode` states its Git-tracked-only basis under response format 2.
17. Directly invalidated documentation matches each shipped behavior at its
    milestone boundary.
18. No semantic threshold, ranking change, progress redesign, debug artifact
    system, generalized receiver inference, new repair lock system, or new
    source-checkpoint lifecycle enters the diff.

## 10. Terminal decisions

### `large_repair_exactness_pass`

For adapters with same-state payload authority, one current repair authority
binds the expected set, exact membership, selected collection, completion
marker, stable payload observation, and backend exact count. The healthy large
payload passes, all demonstrated mismatch paths remain fail-closed, and adapters
without that authority return the frozen proof-limit response without implying
incompatibility.

### `repair_count_authority_blocked`

A shipped backend that declares exact-count support cannot provide a truthful
exact count, and neither the bounded query fallback nor the proof-limit mapping
can represent the result without changing an unauthorized contract.

### `repair_same_state_authority_blocked`

The adapter boundary cannot distinguish support for a same-state payload
observation from its absence, or cannot project absence as the frozen
`repair_proof_limit`, without a new transaction or architecture outside B1.

### `empty_inbound_truth_pass`

Zero-edge inbound responses disclose partial coverage and provide deterministic
verification without inventing edges.

### `empty_inbound_disclosure_blocked`

The existing call-graph response envelope cannot carry the required advisory
warning and next step without an unauthorized public schema redesign.

### `python_constructor_receiver_pass`

The two frozen syntactic receiver bindings produce exact relationships and all
near-miss cases remain unresolved.

### `python_constructor_receiver_ambiguous`

The current analysis/registry model cannot bind one frozen constructor form
without alias, data-flow, or name-only inference.

### `python_constructor_contribution_contract_blocked`

The existing per-file contribution owner cannot persist and reject the frozen
constructor evidence shapes through an explicit compatibility transition
without changing unrelated relationship or symbol contracts.

### `lexical_parent_binding_pass`

The registry publishes exact lexical parent authority without child identity
churn.

### `parent_identity_model_blocked`

The stable-key/exact-instance model cannot select the containing parent without
changing child identity or guessing.

### `parent_compatibility_identity_blocked`

The repository cannot invalidate registries without generated `parentKey` and
their bound relationship artifacts through a compatibility identity that
leaves `symbolKey` and `symbolInstanceId` unchanged.

### `definition_aware_capability_pass`

Capability evidence distinguishes intentional definition-free files from
structural unavailability.

### `capability_manifest_contract_blocked`

The manifest cannot carry the required distinction without an unauthorized
public schema or architecture change.

### `operational_truth_docs_pass`

Inbound guidance is current when B2A lands, repair guidance is current when B1
lands, and changed-code, path, and debug guidance match their implemented
behavior by B5 completion.

### `operational_truth_contract_blocked`

The existing additive debug response cannot express the frozen changed-code
basis without an unauthorized response-version or tool schema change.

### `operational_truth_documentation_blocked`

An authoritative generated documentation owner cannot be updated consistently,
or directly affected public guidance cannot be made truthful without expanding
beyond the implemented repair, inbound, path, debug, or changed-code behavior.

### `large_repository_navigation_truth_complete`

The operational-remediation milestone and follow-up navigation-truth milestone
are both complete; every authorized batch has a terminal decision, affected
compatibility identities and docs are current, and the smallest non-overlapping
affected checks pass.

### `navigation_truth_consolidation_blocked`

One or more completed batch records, compatibility identities, generated
contracts, or affected checks cannot be reconciled without reopening an
out-of-scope architecture or public contract.

## 11. Implementation entry

Begin with B2A after implementation is explicitly authorized. It is the
smallest independently deliverable correction for the report's immediate
caller-safety gap: every zero-edge inbound result becomes explicitly advisory
and receives deterministic verification guidance without changing persisted
relationships.

After B2A and its directly invalidated guidance pass, implement B1 under the
frozen backend-aware proof contract. LanceDB may complete large-payload equality
through its existing data observation; adapters without equivalent same-state
authority must return `repair_proof_limit` rather than false reindex guidance.

Then implement B3 and B4 before B2B so the final constructor-derived
relationship artifacts bind once to the resulting registry authority. Finish
with B5's remaining changed-code, path, and debug truth updates, followed by B6
consolidation.

Each batch retains its independent terminal decision. Completion of one batch
does not authorize work outside B1-B6 or any finding listed in Section 4.
