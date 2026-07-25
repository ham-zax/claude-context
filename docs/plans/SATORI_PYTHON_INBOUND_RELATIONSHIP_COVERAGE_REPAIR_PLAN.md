# Satori Python inbound relationship coverage repair plan

Status: proposed

Created: 2026-07-25

Evidence freeze:

- Satori source: `3764b740d0f55081f98cc33fd4f6236046de8712`
- target repository: `/home/hamza/repo/tradingview_ratio`
- target revision: `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7`
- qualifying runtime: Satori 6.3.0

This plan reopens only the Python caller-coverage conclusion previously recorded
as `python_constructor_receiver_pass` in
[`LARGE_REPOSITORY_REPAIR_AND_NAVIGATION_TRUTH_PLAN.md`](./LARGE_REPOSITORY_REPAIR_AND_NAVIGATION_TRUTH_PLAN.md).
The focused same-file fixtures passed, but the later production
requalification falsified the broader outcome. The completed large-repository
repair proof and empty-inbound disclosure work remain closed.

## 1. Decision

Authorize a durable first-wrong-boundary reproduction and bounded native
prototypes for the frozen constructor and service-binding patterns. Production
ownership remains provisional until the boundary trace confirms the
hypothesized failures and the candidate model satisfies the precision,
context, incremental-equivalence, and runtime gates.

The repair has two independently closable parts:

1. absolute-import constructor receiver coverage for the three recorded
   `SignalGenerator.check_entry` callers; and
2. explicit service/callable binding coverage for the two residual-invariant
   callers and the recorded `SignalLedger.record` caller.

Do not add suffix matching, repository-global same-name selection, or an
external graph authority during this experiment. Those mechanisms can raise
recall while silently inventing callers.

This is not a decision against every possible language-server integration.
Pyright 1.1.407 call hierarchy did not close the sampled targets, but typed
references and other providers were not qualified exhaustively. No new runtime
or dependency enters this experiment. If the bounded native model cannot
represent a recorded pattern without violating the precision, context, or
runtime gates below, leave that pattern open and initiate a separately
authorized provider comparison.

The source-checkpoint defect and semantic-abstention contract have different
owners and are excluded. They require separate plans.

Current batch authorization:

| Batch | Authorization |
| --- | --- |
| R0 | Authorized after the documentation amendments in this revision |
| R1 | Conditional on R0 proving the constructor boundary and freezing stable semantic identities, Python scope rules, absolute runtime budgets, and the final support contract |
| R2 | Not authorized until R0 freezes a precision-safe value-origin context, the actual ledger chain, and the flow bound |
| R3 | Not authorized until the evidence schema, unresolved dependency invalidation, proof-size policy, and R1/R2 component outcomes are frozen |
| R4 | Not authorized until the implemented components pass their lower-layer correctness, determinism, incremental, resource, and rollback gates |
| R5a | Applied in the current working tree |
| R5b | Deferred until R4 produces a durable qualification receipt |

## 2. Repair contract

| Contract item | Frozen value |
| --- | --- |
| Observable outcome | Each authorized component makes its frozen production call sites appear as inbound edges to their exact symbol instances after an isolated rebuild |
| Smallest product witness | A real MCP `call_graph(direction="callers")` read against the rebuilt target generation returns each expected production caller |
| Smallest Core witness | The relationship builder emits the exact source/target instance IDs and call-site spans, the sidecar reload preserves them, and navigation traversal selects them |
| Precision witness | Same-name and wrong-receiver controls emit no selected exact-under-model edge, including `self.hurst_gate.check_entry(...)` and the non-signal-ledger `.record(...)` calls |
| Must preserve | Stable symbol identities, deterministic relationship order, existing mutation/publication authority, full/incremental equivalence, and `CALL_GRAPH_INBOUND_COVERAGE_PARTIAL` plus deterministic verification guidance |
| Closure boundary | Constructor and service-binding components close independently; supported-pattern aggregate closure requires both; retiring the original six-site finding additionally requires all six recorded sites; general Python inbound coverage remains partial/non-exhaustive |

The repair is not complete merely because missing calls remain disclosed.

| Outcome | Decision |
| --- | --- |
| Exact binding-derived edges appear and all frozen negatives remain edge-free | Close the coverage defect for the supported pattern |
| Calls remain absent while partial coverage is disclosed | Disclosure remains passed; coverage remains open |
| Calls remain absent without disclosure | Coverage and disclosure fail |
| Expected edges appear together with a selected wrong-root or wrong-receiver edge | Fail; do not publish the relationship generation |

Component decisions:

```text
python_constructor_supported_patterns_pass
python_constructor_coverage_open

python_service_binding_supported_patterns_pass
python_service_binding_coverage_open

python_inbound_supported_patterns_pass
    = both component passes

python_inbound_recorded_sites_pass
    = all six sampled production sites
```

## 3. Current evidence and claim correction

### 3.1 Observed

The Satori 6.3.0 production generation returned zero inbound edges for:

- `SignalGenerator.check_entry`;
- `BacktestEngineGateRuntimeApiMixin._evaluate_residual_type_invariant`; and
- `SignalLedger.record`.

Exact reads established these expected production sites:

| Target | Expected caller sites |
| --- | --- |
| `SignalGenerator.check_entry` | `opportunity_ranker.py:256`, `pair_evaluator.py:738`, `trading_core.py:675` |
| `_evaluate_residual_type_invariant` | `gate_coordinator.py:475`, `phases.py:129` |
| `SignalLedger.record` | `signal_recording.py:435` |

The current focused constructor test contains the target class and callers in
one file. It does not exercise an absolute `src/`-layout import, a
function-local import used by a constructor binding, or an imported
constructor assigned in `__init__` and consumed by another method.

### 3.2 Source-supported leading mechanisms

The following are leading mechanisms, not intervention-proven root causes:

1. `packages/core/src/relationships/builder.ts` rejects every non-relative
   module specifier in `resolveRelativeModulePath(...)`.
2. `resolvePythonClassReference(...)` depends on that resolver, so the exact
   `from python.core.signals import SignalGenerator` evidence cannot currently
   establish the imported class identity.
3. Python module bindings do not retain lexical ownership. A function-local
   import can therefore neither be used with proven scope nor rejected outside
   that scope.
4. `ReceiverTypeBinding` represents constructor and simple annotation facts,
   but not explicit callable assignment, service-constructor field flow,
   parameter-to-argument flow, or bounded aliases.
5. `RelationshipRecord.confidence` is currently derived from same-file versus
   cross-file locality. A correctly resolved cross-file call is labelled
   `low`, and `packages/core/src/navigation/query.ts` can suppress it during
   traversal unless separate import/export support upgrades it.

### 3.3 Not yet established

The current evidence does not establish that absolute-import repair alone
closes all three constructor callers. It also does not establish that
relationship emission, sidecar persistence, exact target projection, and
reverse traversal are already correct once class identity resolves.

The first execution batch must preserve a boundary trace for each shape:

```text
call site
-> lexical import visible at the constructor/binding site
-> execution environment and module identity
-> constructor or callable target identity
-> receiver/field summary
-> relationship emission
-> serialized sidecar
-> reverse traversal
-> MCP projection
```

The report should use `observed`, `source-supported`,
`intervention-proven`, and `unresolved` instead of uncalibrated High/Medium
labels for this investigation.

## 4. Ground truth and negative controls

### 4.1 Constructor shapes

The acceptance fixture must preserve the three different shapes:

1. module-level absolute import, direct `self` field construction in
   `__init__`, and use from a sibling method;
2. function-local absolute import, local construction later in the same
   callable, and use after the assignment; and
3. function-local absolute import inside `__init__`, direct `self` field
   construction, and use from a sibling method.

### 4.2 Service and callable shapes

The acceptance fixture must preserve:

1. a dataclass service field annotated as `Callable`, populated from a uniquely
   resolved bound method, then invoked through a typed service parameter;
2. the same binding propagated through one direct service-container field
   before invocation; and
3. an `Any`-annotated service field whose concrete target is available only
   through explicit constructor/field assignments.

`Any` is not positive type evidence. The last shape passes only if direct value
flow identifies one target.

### 4.3 Required negatives

At minimum, prove that no selected exact-under-model edge is emitted for:

- `self.hurst_gate.check_entry(...)` to
  `SignalGenerator.check_entry`;
- `services.counterfactual_fill_ledger.record(...)` to
  `SignalLedger.record`;
- another `.record(...)` receiver with the same member name;
- a duplicate module in environment B influencing resolution in environment A;
- both `<module>.py` and `<module>/__init__.py` resolving in the same
  environment;
- a function-local import used outside its lexical callable;
- an imported name shadowed before constructor use;
- use before assignment;
- conflicting reassignment;
- branch-only or loop-only assignment without the same exact target on every
  supported path reaching the use;
- a factory return with no exact return summary;
- a receiver propagated through a collection; and
- a dynamic attribute obtained through `getattr`, reflection, or mutation of
  `sys.path`.

These are precision requirements, not optional hardening.

### 4.4 Required boundary fixture matrix

Module/import fixtures:

- `from module import Class as Alias`;
- `import module as alias; alias.Class(...)`, classified unsupported unless R0
  authorizes qualified constructor imports;
- relative imports at multiple package depths;
- module-level executable use before import;
- conditional and `try/except ImportError` imports, classified unsupported;
- no `pyproject.toml` and a nested unrelated `pyproject.toml`;
- symlink aliases and case-only path collisions under the recorded platform
  semantics;
- missing module becoming resolved after a delta; and
- ambiguous module becoming unique after deletion.

Constructor/field fixtures:

- both branches assign the same target;
- branches assign different targets;
- `try` assignment with early exit;
- inherited `__init__`;
- subclass method override and competing multiple-inheritance members;
- custom `__new__`, classified unsupported;
- direct exact helper assignment to an instance field; and
- reassignment after a valid constructor assignment.

Service/callback fixtures:

- the same service class allocated twice with different callbacks;
- the same callee parameter reached from two different service origins;
- a test fixture providing a callback different from production;
- generated dataclass `__init__`;
- positional construction, custom `__init__`, `*args`, and `**kwargs`,
  classified unsupported unless exact field mapping is proved;
- a default callback parameter;
- staticmethod, classmethod, and descriptor member lookup; and
- callback-field reassignment before invocation.

Every unsupported fixture must return an explicit internal unsupported or
ambiguous outcome and emit no selected edge.

## 5. Initial Python support boundary

The repair deliberately does not claim complete Python import or points-to
semantics.

### 5.1 Supported inferred conventional environments

For the initial implementation:

- locate the nearest ancestor `pyproject.toml` as the project boundary;
- treat a nested project boundary as a separate environment;
- within the boundary, recognize regular packages under an existing `src/`
  directory and directly under the project boundary;
- require regular-package `__init__.py` files for intermediate package
  segments;
- map only exact `.py` modules and package `__init__.py` modules;
- isolate module identities by canonical repository root, project boundary,
  ordered source-root set, path semantics, and relevant configuration; and
- accept a module identity only when one candidate remains.

If both conventional roots produce a candidate, fail closed. Do not silently
assume one runtime `sys.path` precedence.

This is an **inferred conventional Python environment**, not a claim to recover
the interpreter's complete execution environment. The convention covers the
frozen target, whose `pyproject.toml` declares a `src/` layout and whose
`python` and `python.core` packages contain `__init__.py`. Parsing arbitrary
build-system configuration is not required for the first repair.

Freeze two separate identities:

```text
environment_config_id
    = hash(canonical repository root
           + project boundary
           + canonical ordered source roots
           + relevant pyproject.toml content hash
           + inclusion/exclusion policy
           + path case-sensitivity semantics
           + symlink canonicalization policy)

publication_generation_id
    = identity of the relationship publication that consumed the environment
```

`environment_config_id` and module identity must remain stable for the same
source/configuration state. Publication generation belongs only in the
publication envelope and provenance; it must not enter semantic module IDs,
dependency keys, or normalized relationship digests.

Reserve an explicit configuration shape for later support without implementing
it in this repair:

```text
python environment
    project boundary
    ordered import roots
    excluded roots
    interpreter/config identity
```

Adding that public configuration is a separate contract change. R0 records
whether the inferred convention is sufficient for the frozen target.

Initially unsupported and still disclosed as partial:

- custom source roots outside the project boundary and `src/`;
- namespace packages;
- `.pyi` stubs and stub precedence;
- re-exports through `__init__.py`;
- dynamic imports;
- editable-install path mutation;
- conditional or platform-specific import selection;
- imports whose runtime environment depends on an interpreter or tool
  configuration not represented by the repository; and
- multiple incompatible Python execution environments within one project
  boundary.

Supporting any excluded form requires a separately frozen example and
environment identity. Do not expand this repair merely because a nearby
repository uses one.

### 5.2 Supported binding flow

The initial binding model accepts only:

- a direct constructor call assigned to a local;
- a direct constructor call assigned to `self.<field>` in the top-level body
  of `__init__`;
- a uniquely identified concrete instance passed directly to an initialization
  helper whose parameter receives a direct `parameter.field = Constructor(...)`
  assignment;
- a simple parameter annotation resolving to one class;
- a direct bound method or field assigned to a dataclass/class constructor
  keyword;
- direct parameter-to-argument propagation for a uniquely resolved call;
- direct constructor-keyword-to-field propagation;
- direct field-to-field assignment with access paths no deeper than
  `base.field`;
- a direct return of one recognized constructor;
- direct class inheritance and mixin method lookup with uniquely resolved base
  identities; and
- a bounded value-origin chain whose actual step count and limit are frozen by
  R0 before R2 implementation.

Every step must have an exact source span and one target identity. A fact with
multiple possible targets becomes `ambiguous` and emits no selected edge.
The ledger site remains mandatory only if R0 demonstrates that its
initialization-helper assignment satisfies the explicit helper pattern above.
Otherwise it terminates `python_service_binding_support_boundary_exceeded`
instead of silently expanding the model.

R0 must define and count flow steps before freezing the bound:

| Operation | Flow-step rule |
| --- | --- |
| Assignment or alias propagation | one step |
| Caller argument to callee parameter | one interprocedural step |
| Constructor keyword to generated dataclass field | one step |
| Direct field read | one step |
| Exact import, method lookup, or final call emission | evidence, not a flow step |

Do not increase the frozen access-path or flow bound merely to make the
production fixture pass; if a recorded site exceeds it, stop and reopen the
support decision with the observed chain.

Initially unsupported:

- arbitrary factory analysis;
- collection element flow;
- reflection or dynamic attribute construction;
- decorators that replace callables;
- lambdas, `partial`, closures, or callback registries;
- general branch-sensitive points-to analysis;
- object-sensitive heap modelling;
- monkeypatching;
- unbounded alias propagation; and
- inferring a target solely because a member name is globally unique.

## 6. Target design

### 6.1 Immutable module-identity index

Add an internal Python module index keyed by the stable
`environment_config_id`:

```text
environment_config_id
+ ordered conventional source roots
+ module name
+ file kind
-> zero, one, or ambiguous exact file identities
```

Each published generation sees an immutable index snapshot. A full build may
construct it from the registry manifest. A delta must structurally reuse the
prior sealed index and apply added/deleted path keys rather than require an
unconditional repository-wide rebuild. The index is not a host-global mutable
cache and introduces no new cross-session locking authority.

The index must:

- derive only from the frozen registry manifest, project-boundary files, and
  the stable environment configuration;
- sort roots, modules, and candidates deterministically;
- retain ambiguity rather than select the first path;
- resolve both relative and supported absolute imports through one owner;
- return structured outcomes such as `resolved`, `missing`,
  `ambiguous_environment`, `ambiguous_module`, and `unsupported_layout`; and
- expose a test-only boundary trace without production log spam.

Do not use suffix matching over arbitrary repository paths.

### 6.2 Lexically scoped import evidence

Extend Python `ModuleBinding` evidence with Python scope and program-point
ownership. Python `if`, `for`, `while`, and `try` suites do not create lexical
name scopes. A function-local import binds in the owning function, while
definite availability at a use depends on control flow and ordering.

For the initial supported model:

- an unconditional module import is available to function bodies after normal
  module initialization;
- a top-level executable use before its import is unresolved;
- an unconditional function-local import is available only after the import
  program point in that function;
- class-body, conditional, loop, `try`/`except`, and comprehension imports fail
  closed; and
- direct local shadowing invalidates the imported binding from that program
  point.

Do not model Python suites as JavaScript-style block scopes.

Resolve a constructor class at its assignment site, not later using every
import found in the file. The resulting receiver fact must retain:

- environment identity;
- module identity;
- imported and local names;
- import span;
- constructor-assignment span;
- owning callable/class identity; and
- exact class symbol instance.

This is required for `trading_core.py`, where the import occurs in
`__init__` but the field is consumed in another method.

At supported merge points, use this definite-binding lattice:

```text
unbound
exact(target)
ambiguous
unsupported

exact(A) join exact(A) = exact(A)
exact(A) join exact(B) = ambiguous
exact(A) join unbound  = unbound
anything join unsupported = unsupported
```

If the implementation does not construct a bounded CFG for a statement form,
branch, loop, `try`, conditional import, and early-return flow through that
form is `unsupported` and emits no selected exact fact. Two branches assigning
the same target may become exact only after a CFG-backed all-reaching-paths
join proves it.

### 6.3 Value-origin-sensitive binding proofs

Represent only the accepted facts:

```text
value origin + owning callable + program point -> exact class or callable
allocation site + field + context -> exact class or callable
call site + callee parameter + caller context -> exact value origin
direct alias + context -> prior exact value origin
```

`Services.callback` is never a repository-global fact. Two service constructor
expressions with different callbacks retain separate allocation-site origins.
Likewise, a callee parameter reached by different caller contexts retains
separate proofs until a particular call site is resolved.

Use a bounded, allocation-site-sensitive worklist, or an equivalent
demand-driven backward proof memoized by unresolved receiver call, expression,
call site, and bounded context. The implementation must provide:

- the R0-frozen flow-step limit;
- one target per selected exact fact;
- deterministic conflict collapse to `ambiguous`;
- no path expansion beyond `base.field`;
- explicit use-before-definition and reassignment invalidation; and
- a stable semantic dependency key independent of publication generation;
- maximum contexts per allocation site and callable; and
- a deterministic `unsupported` result when a bound is exceeded.

For the residual-invariant cases, the expected proof chain is:

```text
BacktestEngine concrete self
-> direct engine argument
-> direct service-constructor keyword
-> service callable field
-> exact mixin method
-> call site
```

For the ledger case, the expected proof chain is:

```text
BacktestEngine initialization helper
-> engine.signal_ledger = SignalLedger(...)
-> direct service-constructor keyword
-> SignalRecordingServices.signal_ledger
-> typed services parameter
-> services.signal_ledger.record(...)
```

These chains are hypotheses until the boundary trace records every value
origin, context, and counted flow step. R2 is not authorized until R0 shows
that the frozen production chains can be represented without class-global
field facts.

### 6.4 Relationship derivation, certainty, and provenance

Do not collapse overlapping proof properties into one `evidenceKind`. Persist
separate dimensions:

```text
derivationKind:
    direct_call
    constructor_receiver
    callable_value_flow
    alias_value_flow

proofStepKind[]:
    import_resolution
    constructor_resolution
    exact_annotation
    field_assignment
    argument_to_parameter
    constructor_keyword_to_field
    field_read
    alias_assignment
    inheritance_lookup

flowDepth: integer

staticCertainty:
    exact_under_supported_model
    ambiguous
    unsupported

resultSetCoverage:
    partial_non_exhaustive
```

The relationship edge is deterministically derived under the declared static
support model. It is not unconditional runtime truth: monkeypatching,
reflection, dynamic path mutation, custom descriptors, and other excluded
runtime behavior remain outside the model.

Persist the bounded proof spans needed to reconstruct the decision:

- call site;
- import or annotation;
- constructor/allocation site;
- assignment, parameter, field, inheritance, and alias steps; and
- stable environment configuration and analysis-provider identities.

Store provider and analysis version once at generation or shard level when all
records share them. Intern repeated proof steps within a shard rather than
duplicating identical import, inheritance, or constructor facts on every edge.

When multiple exact proofs derive the same source instance, target instance,
relationship type, and call-site span:

1. emit one relationship edge;
2. deduplicate proof steps by stable semantic key;
3. preserve every distinct exact derivation within the proof-size bounds; and
4. sort derivations and steps deterministically.

Ambiguous and unsupported proofs are retained only as dependency/coverage
evidence; they do not become selected `CALLS` records.

The current stored categorical `confidence` remains a compatibility projection:

| Static result | Stored confidence | MCP numeric projection |
| --- | --- | --- |
| exact direct/constructor/direct-binding proof | `high` | existing `0.95` |
| exact bounded alias/value-flow proof | `medium` | existing `0.65` |
| legacy heuristic relationship | `low` | existing `0.35`, suppressed unless existing support rules admit it |

File locality must no longer demote an exact cross-file relationship.
Navigation selection should use `staticCertainty` and derivation evidence for
new records while preserving legacy low-confidence suppression.

The public contract distinguishes:

```text
edge certainty:
    exact under the declared supported static model

result-set coverage:
    partial and non-exhaustive
```

Selected exact edges may be relied upon according to their proof. The inbound
result set remains incomplete, and absence still requires deterministic source
verification.

No required MCP field is added in the compatibility cutover. If existing
debug/diagnostic projection can carry an additive derivation label without a
format change, expose `direct`, `constructor`, or `bounded_value_flow`;
otherwise defer that optional public diagnostic rather than changing the
mandatory response schema inside this repair. The qualification receipt always
retains the internal proof.

### 6.5 Proof-storage and analysis bounds

The initial prototype uses these hard ceilings:

| Resource | Ceiling |
| --- | --- |
| Proof steps retained per edge | 12 |
| Serialized proof payload per edge | 2 KiB after shard-level interning references are applied |
| Distinct contexts per allocation site | 8 |
| Distinct contexts per callable parameter | 8 |
| Facts produced per file | no more than `256 + 8 × accepted syntax sites` |
| Unresolved/ambiguous dependency keys per file | no more than `256 + 4 × lookup sites` |
| Worklist operations per environment | no more than `min(1,000,000, 64 × input facts)` |
| Target relationship-sidecar growth | no more than `max(1.35 × baseline, baseline + 4 MiB)` |

Exceeding a per-edge or per-context ceiling makes the affected proof
`unsupported`; it must not truncate into an apparently exact edge. Exceeding an
environment worklist ceiling blocks publication of the candidate relationship
generation with a deterministic diagnostic.

R0 records the observed production proof sizes and context counts. Changing a
ceiling upward after R0 requires an explicit precision and performance review;
it is not an implementation convenience.

### 6.6 Incremental invalidation

The relationship contribution for a file must retain:

- scoped imports;
- receiver facts;
- binding facts;
- successful, missing, ambiguous, and unsupported dependency keys consumed by
  that file; and
- the stable `environment_config_id` and configuration digest.

Dependency classes include:

```text
environment/module lookup + observed candidate set
class/member lookup + observed target set
inheritance/MRO lookup
constructor allocation/value-origin
call-site argument -> callee parameter
service construction/allocation site
```

Persist reverse dependency indexes by stable semantic key. Missing and
ambiguous lookups are first-class: adding a formerly missing module/member,
deleting one ambiguous candidate, changing an MRO, or removing one conflicting
call context must invalidate the affected unresolved consumer.

Invalidation rules:

- a changed import or constructor/binding site rebuilds its owning file;
- a changed target symbol rebuilds files depending on that exact symbol or
  module key;
- adding or deleting a module candidate rebuilds importers of that
  environment/module key;
- adding a formerly missing member or changing a base class rebuilds consumers
  of the corresponding member/MRO lookup key;
- changing a constructor/service allocation or caller argument rebuilds
  consumers of its value-origin and parameter-binding keys;
- changing a project boundary or source-root membership rebuilds the entire
  affected Python environment; and
- exceeding a bounded dependency closure triggers a full relationship rebuild,
  never a partially updated graph.

The reverse closure is capped by the number of consumers recorded for its
semantic dependency keys. When one change would invalidate more than 25% of
the environment's relationship-contributing files, use a full relationship
rebuild for that environment. This threshold changes work selection, not
semantic output.

The full and incremental builders must produce byte-equivalent normalized
relationship records for the same final source state. Timestamps and
generation-specific wrapper metadata are excluded from the digest.

### 6.7 Compatibility and publication

This repair changes persisted relationship meaning and analysis evidence.

- Advance `RELATIONSHIP_BUILDER_VERSION`.
- Advance `RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION`.
- Keep `SYMBOL_EXTRACTOR_VERSION` and symbol identities unchanged; the new
  evidence is relationship analysis, not symbol extraction.
- Keep `RELATIONSHIP_MANIFEST_SCHEMA_VERSION` only if an incompatibility test
  proves the contribution-schema binding rejects every old shard. Otherwise
  advance it in the same cutover.
- Include the Python environment/analysis digest in relationship compatibility.
- Route existing indexes through the established `requires_reindex` path.
- Do not dual-read old relationship evidence as though it satisfied the new
  contract.
- Publish through the existing mutation lease and sealed navigation generation.
  Do not add a second lock, checkpoint, or publication mechanism.

## 7. Execution batches

### R0 — Durable reproduction and first-wrong-boundary proof

Owners:

- `packages/core/src/language-analysis/service.test.ts`
- `packages/core/src/relationships/builder.test.ts`
- `packages/core/src/navigation/query.test.ts`
- nearest existing MCP relationship-backed call-graph test

Tasks:

1. Add one compact fixture for each constructor shape and each service-binding
   shape.
2. Add the frozen wrong-target controls.
3. Record the current result at each boundary:
   - extracted import and binding evidence;
   - module-resolution result;
   - stable environment configuration and module keys;
   - allocation/value-origin and calling-context keys;
   - counted assignment and interprocedural flow steps;
   - target class/callable identity;
   - emitted record;
   - reloaded record;
   - selected traversal record.
4. Prove the current constructor fixture reaches
   `unsupported_absolute_module` or an equivalent exact rejection.
5. Prove the current service fixtures lack the required binding facts rather
   than assuming their later failure.
6. Trace the actual ledger initialization helper and decide whether it satisfies
   the explicit supported helper pattern.
7. Exercise two instances of the same service class with different callbacks
   and record whether allocation-site context keeps both exact.
8. Freeze the flow-step count and proposed bound from the observed production
   chains.
9. Capture every effective configuration input from the prior qualification:
   relevant environment variables, Satori/provider/schema configuration, and
   hashes plus contents or exported copies of `opencode.jsonc` and `cc.json`.
   Record whether each dirty file is reproduced or demonstrably irrelevant.
   Keep secrets out of repository evidence: retain exact sensitive inputs only
   in a task-owned protected artifact and publish their hashes plus redacted
   effective fields.
10. Capture baseline relationship-stage time, peak RSS, record count,
    serialized bytes, fact/context counts, worklist operations, and traversal
    latency using the method in section 9.

Exit:

- `constructor_first_wrong_boundary_observed`; and
- one exact observed boundary for each service/callable shape;
- `environment_semantic_identity_frozen`;
- `service_value_origin_context_frozen`; and
- `production_flow_bound_frozen`.

If an earlier boundary differs from the current hypothesis, update this plan
before production edits. Do not stack an import fix over contradictory
evidence.

R0 does not authorize persisted-schema or production relationship changes.

### R1 — Environment-aware imports and constructor receivers

Owners:

- new focused Python module-environment owner under
  `packages/core/src/relationships/`
- `packages/core/src/language-analysis/types.ts`
- `packages/core/src/language-analysis/tree-sitter-adapter.ts`
- `packages/core/src/relationships/builder.ts`
- nearest focused tests

Tasks:

1. Build the immutable environment/module index.
2. Prove `environment_config_id` and module identities are invariant across two
   publications of identical source/configuration state.
3. Route relative and supported absolute Python imports through it.
4. Apply the frozen Python function/module scope and definite-binding lattice.
5. Resolve imported constructor identity at the assignment site.
6. Build local and `__init__` field receiver summaries from that exact class
   identity.
7. Emit `constructor_receiver` calls only when the target member is unique in the
   resolved class.
8. Prove all constructor positives and negatives, including missing-to-resolved
   and ambiguous-to-unique delta transitions.
9. Trace the record through sidecar reload and inbound traversal.

Exit:

- all three `SignalGenerator.check_entry` production shapes are representable;
- no frozen constructor negative emits a selected exact edge; and
- the first-wrong-boundary trace shows whether any downstream defect remains.

Terminal outcomes:

- `python_absolute_constructor_coverage_pass`
- `python_absolute_constructor_resolution_blocked`
- `python_absolute_constructor_downstream_blocked`

### R2 — Explicit service and callable binding flow

Owners:

- `packages/core/src/language-analysis/types.ts`
- `packages/core/src/language-analysis/tree-sitter-adapter.ts`
- a focused binding-summary owner under
  `packages/core/src/relationships/`
- `packages/core/src/relationships/builder.ts`
- nearest focused tests

Tasks:

1. Confirm R0 produced `service_value_origin_context_frozen`,
   `production_flow_bound_frozen`, and either a supported ledger helper chain or
   `python_service_binding_support_boundary_exceeded`. Without those outcomes,
   R2 remains unauthorized.
2. Extract only the accepted assignment, constructor keyword, return, call
   argument, direct helper, and direct inheritance facts.
3. Resolve all referenced symbols through exact module/class identity.
4. Implement the allocation-site-sensitive worklist or equivalent
   demand-driven value-origin proof and ambiguity collapse.
5. Emit `callable_value_flow` or `alias_value_flow` derivations with complete
   bounded proof steps.
6. Prove that two service instances with different callbacks remain separately
   exact at their respective call sites.
7. Prove the two residual-invariant sites.
8. Prove `signal_recording.py:435` without treating `Any` as evidence, only if
   its helper chain is within the frozen support boundary.
9. Prove the same-name `.record`, wrong-ledger, multi-instance, positional
   argument, custom-`__init__`, reassignment, multiple-inheritance, and
   distinct-caller-context negatives.
10. Measure candidate-set, context, and fact-count growth; no Cartesian
   call-site-by-class scan is permitted.

Exit:

- the two residual callers and one signal-ledger caller are represented by
  exact binding chains; and
- every frozen service/callback negative remains edge-free.

If any expected chain needs unsupported reflection, collection flow, an
ambiguous receiver, or more than the R0-frozen flow bound, finish with that
coverage pattern still open. Do not substitute unique-name selection.

Terminal outcomes:

- `python_direct_service_binding_coverage_pass`
- `python_service_binding_ambiguous`
- `python_service_binding_bound_exceeded`
- `python_service_binding_support_boundary_exceeded`

### R3 — Persistence, selection, and incremental equivalence

Owners:

- `packages/core/src/symbols/contracts.ts`
- `packages/core/src/symbols/sidecar.ts`
- `packages/core/src/navigation/query.ts`
- `packages/core/src/language-analysis/versions.ts`
- nearest sidecar, navigation, delta, and MCP projection tests

Tasks:

1. Persist and strictly validate derivation dimensions, interned proof steps,
   flow depth, static certainty, provider version, stable environment digest,
   successful and unresolved dependency keys, and value-origin context.
2. Reject missing, extra, unknown, and old evidence shapes.
3. Select exact-under-model evidence independently of file locality.
4. Preserve suppression for legacy low-confidence records.
5. Deduplicate multiple exact derivations for one call edge deterministically.
6. Enforce proof-size, context-cardinality, fact-count, and worklist ceilings.
7. Implement structurally reused module indexing and all environment, lookup,
   MRO, value-origin, and binding dependency invalidation rules.
8. Prove full/incremental normalized record equality for:
   - import target add/delete;
   - missing import becoming resolved;
   - ambiguous import becoming unique;
   - local import change;
   - constructor reassignment;
   - service binding change;
   - previously missing member being added;
   - MRO change;
   - one conflicting caller context being removed;
   - ambiguity introduced and later removed; and
   - a project-boundary/source-root membership change.
9. Measure sidecar bytes and prove the section 6.5 storage gate.
10. Advance compatibility identities once, after the final record shape is
   frozen.

Exit:

- no new edge disappears during serialization or traversal;
- no stale edge survives an invalidating incremental change; and
- old relationship artifacts require reindex deterministically.

Terminal outcomes:

- `python_relationship_persistence_pass`
- `python_relationship_incremental_equivalence_blocked`
- `python_relationship_compatibility_blocked`

### R4 — Isolated production qualification

Do not mutate or rebuild the user's existing Satori index.

Use:

- a task-owned materialization of the exact target revision;
- two independent fresh `SATORI_STATE_ROOT` values for clean-build
  determinism;
- independent task-owned LanceDB paths;
- the exact frozen provider/schema/runtime configuration and relevant
  environment variables; and
- watcher disabled during the deterministic rebuild/readback.

The prior failed qualification included modified `opencode.jsonc` and untracked
`cc.json`. R0 must either reproduce their effective contents or prove they are
irrelevant to Satori, provider, schema, and Python environment behavior. A
clean revision-only materialization is explicitly a new bounded qualification,
not a literal reproduction, unless that irrelevance proof exists.

Retain a durable JSON receipt under `docs/evidence/` containing:

- Satori and target revisions;
- source-file hashes for every positive and negative site;
- environment and effective configuration;
- hashes and exported contents for every effective configuration file;
- relevant environment variables and path/case/symlink semantics;
- exact MCP requests and complete responses;
- relationship records and proof chains for the six expected sites;
- normalized relationship digest;
- lifecycle, marker, collection, and relationship fingerprint;
- command lines, exit codes, and bounded stdout/stderr;
- baseline and candidate performance samples; and
- initial/final Git status proving the target was not modified.

Product checks:

1. Build the unchanged source independently in both state roots to terminal
   ready generations.
2. Compare stable environment/module identities and normalized relationship
   digests across the two publications.
3. Resolve the exact symbol instance for each target.
4. Run inbound `call_graph`.
5. Assert that each authorized component's expected production caller sites
   are present.
6. Assert that the frozen wrong-target sites are absent.
7. Apply one reversible supported constructor or binding change in the
   task-owned target copy.
8. Run explicit incremental sync and prove the expected edge is removed,
   redirected, or added.
9. Restore the source, sync again, prove the original edge returns, and compare
   the normalized result with a fresh full build of the restored state.
10. Confirm selected edges are reported according to their static certainty
    while the inbound result-set coverage remains partial/non-exhaustive.
11. Exercise rollback by retaining the prior runtime/index fingerprint and
    proving the prior compatible generation can be selected after rejecting a
    mixed-schema generation.

Closure is bounded to this revision and the support contract in section 5. Do
not claim complete Python call-graph recall.

Terminal outcomes:

- `python_inbound_supported_patterns_pass`
- `python_inbound_recorded_sites_pass`
- `python_inbound_precision_blocked`
- `python_inbound_product_readback_blocked`
- `python_inbound_incremental_product_blocked`
- `python_inbound_rollback_blocked`

### R5a — Immediate report erratum

Owner:

- `docs/plans/report.md`

This batch is authorized before R0 because it corrects evidence claims rather
than asserting a repair result.

Tasks:

1. Rename the report section to
   `Post-qualification root-cause hypotheses and design options`.
2. Replace “isolated causal boundary” language with `source-supported leading
   mechanism`.
3. Narrow the Pyright/LSP conclusion to the recorded Pyright 1.1.407
   call-hierarchy pilot.
4. Correct callback closure semantics: disclosure can pass while coverage
   remains open.
5. Replace subjective investigation confidence with evidence levels.
6. Label checkpoint publication and semantic abstention designs as hypotheses
   requiring separate intervention plans.
7. Mark every historical 6.2 top-level section as superseded or move it to a
   separate historical file.

Terminal outcome:

- `python_inbound_report_erratum_published`

### R5b — Post-qualification report reconciliation

Owners:

- `docs/plans/report.md`
- this plan
- the R4 evidence receipt

Tasks:

1. Separate constructor coverage, service/callback coverage, disclosure, and
   aggregate Python completeness decisions.
2. Preserve exact request arguments, responses, timestamps, capabilities,
   configuration artifacts, and evidence-receipt digest.
3. Record the final support boundary and every known unsupported form.
4. Record component closure independently; aggregate closure requires both
   components.
5. Keep source-checkpoint and semantic-abstention findings linked to their
   separate plans; do not fold their solutions into this repair.

Terminal outcome:

- `python_inbound_report_reconciled`

## 8. Verification matrix

| Layer | Evidence |
| --- | --- |
| Extractor | Scoped imports and accepted binding facts have exact spans; unsupported forms emit no fact |
| Module resolution | Environment-isolated absolute and relative modules resolve uniquely; ambiguity fails closed |
| Binding analysis | Allocation/value-origin-sensitive chains converge to one target per context; conflicting or over-bound chains emit no selected fact |
| Relationship build | Exact source/target instances, call span, derivation dimensions, proof steps, and static certainty are stable |
| Persistence | Sidecar write/read is lossless; malformed or old evidence is rejected |
| Incremental | Full and delta construction produce the same normalized records, including missing/ambiguous lookup transitions |
| Navigation | Selected exact-under-model cross-file evidence is returned; legacy low-confidence guesses remain suppressed |
| MCP | Exact inbound requests return the expected sites, distinguish edge certainty from set coverage, and preserve mandatory response compatibility |
| Product | Each authorized component's positives are present and all frozen negatives are absent in an isolated real generation |

Candidate commands, selected only for changed owners:

During R0–R2 iteration, run the nearest focused tests. Before R3/R4 acceptance,
the changed ownership boundary requires:

```bash
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-core typecheck
pnpm --filter @zokizuan/satori-core build
pnpm --filter @zokizuan/satori-mcp test
pnpm --filter @zokizuan/satori-mcp typecheck
pnpm --filter @zokizuan/satori-mcp build:runtime
pnpm exec eslint <changed TypeScript files>
git diff --check
```

The Core pass includes language analysis, relationship builder, sidecar,
navigation, and incremental/delta tests. The MCP pass includes relationship
call-graph and projection coverage. Do not run semantic retrieval benchmarks,
checkpoint recovery qualification, shared-runtime qualification, CLI release
smoke, or the complete monorepo suite unless a changed owner directly
invalidates one of those results.

## 9. Precision and performance gates

R0 must add one narrow, non-generalized qualification command for the
relationship stage and traversal. Run every sample in a fresh process. Retain
the command and raw outputs.

Freeze:

- Satori revision and `pnpm-lock.yaml` SHA-256;
- Node and pnpm versions;
- CPU model/topology, total memory, swap, cgroup limits, and kernel;
- worker count and all relevant environment variables;
- fixture/source/configuration hashes;
- state/cache preparation;
- stage start/end boundaries;
- GC flags, with no change between baseline and candidate; and
- GNU `/usr/bin/time -v` for command wall time and command maximum RSS; and
- a task-owned cgroup-v2 scope whose `memory.peak` includes the command and all
  worker subprocesses. If an isolated cgroup cannot be established, peak
  process-tree memory remains unqualified rather than being inferred from the
  parent process.

Run one discarded warm-up and five measured fresh processes. Retain wall time,
command maximum RSS, cgroup process-tree `memory.peak`,
record/fact/context/worklist counts, serialized bytes, and raw traversal
samples. Report median and maximum wall time, maximum observed command and
process-tree memory, and median/p95 traversal latency.

The relative gates below are provisional regression limits. R0 must record and
justify absolute product ceilings for the frozen machine and target before R1
is authorized. A relative pass cannot hide an unacceptable absolute result.

| Metric | Gate |
| --- | --- |
| Constructor positive recall | 3/3 expected constructor sites for component closure |
| Service-binding positive recall | 3/3 expected service sites when the ledger helper is admitted; otherwise 2/2 admitted residual sites and an explicit open ledger finding |
| Aggregate supported-pattern recall | Every site admitted by the frozen constructor and service models |
| Recorded-site closure | 6/6 required to retire the original sampled inbound-coverage finding |
| Frozen negative precision | 0 selected wrong-target edges |
| Determinism | Identical normalized relationship digest across repeated builds |
| Relationship-stage wall time | Candidate median no more than 1.20x baseline |
| Relationship-stage peak RSS | Candidate no more than 64 MiB above baseline |
| One-file relationship delta | Candidate median no more than `max(1.25x baseline, baseline + 50 ms)` |
| Inbound traversal latency | Candidate median no more than `max(1.10x baseline, baseline + 5 ms)` |
| Relationship-sidecar bytes | Section 6.5 target-sidecar ceiling |
| Proof/context/worklist size | Every section 6.5 hard ceiling |

Add a synthetic scaling matrix that independently varies:

- module count;
- import and unresolved-lookup count;
- assignment/allocation count;
- service instances per class;
- caller contexts per callable; and
- unresolved receiver call sites.

Use at least three sizes per axis. Doubling one axis while the others remain
fixed must not produce more than 2.5x facts, worklist operations, or wall time
after subtracting the fixed harness cost. This is a bounded empirical
anti-Cartesian gate, not a universal complexity proof.

Correctness gates run before performance comparison. If correctness passes but
one budget fails, finish `python_inbound_coverage_correct_performance_blocked`
and do not relax precision, bounds, or the test oracle to recover speed.

## 10. Build-versus-integrate boundary

The current external evidence supports only these bounded conclusions:

- Pyright 1.1.407 `callHierarchy/incomingCalls` did not close the three sampled
  targets under the recorded transient pilot.
- `codebase-memory-mcp` 0.9.0 found the six expected target sites in its
  existing index, but several relied on low-confidence unique-name or suffix
  matching.
- The same `codebase-memory-mcp` index attributed
  `self.hurst_gate.check_entry(...)` to
  `SignalGenerator.check_entry`, demonstrating the precision risk of those
  fallbacks.
- `codebase-memory-mcp` implements selected language-server-style algorithms
  itself; it does not obtain this coverage merely by running Pyright.

The upstream source inspection is pinned to
[`97ce23f9827177fff3858831156e9795c6832b18`](https://github.com/DeusData/codebase-memory-mcp/tree/97ce23f9827177fff3858831156e9795c6832b18).
The inspected Python resolver file
[`internal/cbm/lsp/py_lsp.c`](https://github.com/DeusData/codebase-memory-mcp/blob/97ce23f9827177fff3858831156e9795c6832b18/internal/cbm/lsp/py_lsp.c)
has SHA-256
`a2ed9a43117444e6603b01bccce1f556a608b4f958a32ac14559ab1b9852e84c`
and Khiip capture `01KYAWPBRG67MSSQQTSJZCXBG1`.

Architectural inspiration is allowed. If implementation code, schemas,
fixtures, or tests are copied or substantially ported, add MIT attribution in
the same patch.

Do not start an LSP/provider implementation inside this plan. If the native
repair stops at a proven unsupported pattern, a later comparison must evaluate
the same frozen matrix across:

- definitions and references, not only call hierarchy;
- exact positive and negative edges;
- incremental invalidation;
- process and memory cost;
- version/configuration identity;
- failure isolation and cancellation;
- licensing and maintenance; and
- the shared-runtime lifecycle.

That evaluation must identify a concrete decision it can change before adding
a dependency.

## 11. Migration and rollout

- Existing relationship generations become incompatible and require reindex.
- No automatic repair may claim that old evidence satisfies the new
  relationship contract.
- No target repository code or annotation change is required.
- Perform pre-release comparison in a separate state root; no public feature
  flag or dual-read path is required for that shadow qualification.
- Preserve the prior runtime artifact, compatibility fingerprint, and at least
  one prior compatible sealed index generation through the new runtime's
  defined observation window.
- Prevent garbage collection from deleting the retained rollback generation
  during that window.
- Rollback atomically selects the prior runtime and its compatible prior
  generation; mixed relationship schemas are rejected.
- R4 must exercise the existing generation-selection mechanism. If no atomic
  retained-generation selection exists, release is blocked; do not invent one
  inside R4 without reopening scope.
- Package versioning and release publication are outside this repair.

## 12. Final acceptance

Shared acceptance for either component:

1. R0 records its first wrong boundary, stable identities, value-origin
   contexts, and counted flow steps.
2. Every component-specific wrong-target control remains absent.
3. Proof dimensions survive persistence and reverse traversal.
4. Full and incremental results agree, including unresolved transitions.
5. Old artifacts route to `requires_reindex`.
6. Precision, determinism, storage, context, worklist, and performance gates
   pass.
7. The isolated real MCP witness and controlled incremental mutation pass with
   a durable receipt.
8. Exact edge certainty and partial/non-exhaustive result-set coverage remain
   distinct.
9. The report claims only the accepted component boundary.

Constructor component closure additionally requires all three
`SignalGenerator.check_entry` callers through exact environment/import and
constructor evidence.

Service component closure additionally requires both residual-invariant callers
through explicit callable value flow. The signal-ledger caller is required only
if R0 admits its initialization-helper chain into the frozen support model; if
not, it remains explicitly open under
`python_service_binding_support_boundary_exceeded`.

Aggregate supported-pattern closure requires both component passes and every
site admitted by their frozen models. Retiring the original sampled
inbound-coverage finding requires the stronger
`python_inbound_recorded_sites_pass`: all six production sites, including the
ledger site. If R0 excludes that helper chain, supported-pattern work may pass
while the recorded-site finding remains open.

Final decisions:

- `python_constructor_supported_patterns_pass`
- `python_constructor_coverage_open`
- `python_service_binding_supported_patterns_pass`
- `python_service_binding_coverage_open`
- `python_inbound_supported_patterns_pass`
- `python_inbound_recorded_sites_pass`
- `python_inbound_coverage_open_disclosure_pass`
- `python_inbound_precision_blocked`
- `python_inbound_coverage_correct_performance_blocked`
- `python_inbound_product_readback_blocked`

`python_constructor_supported_patterns_pass` and
`python_service_binding_supported_patterns_pass` independently close their
frozen components. `python_inbound_supported_patterns_pass` records their
aggregate support boundary.
`python_inbound_recorded_sites_pass` alone retires the six-site sampled
finding. None qualifies complete Python call-graph coverage.
