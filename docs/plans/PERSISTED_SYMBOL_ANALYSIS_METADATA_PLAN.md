# Symbol Analysis Metadata Plan

**Status:** M0 formally selects on-demand analysis and its production budgets
passed; structural Release A qualification is blocked by an independent Core
publication-read-lease test that does not complete; persisted analysis and
graph-derived Release B remain unauthorized
**Date:** 2026-07-26
**Review base revision:** `2a69144be52e0b4f9ea9894dd5695666c7f7dce9`
**Base verification:** matched product `HEAD` when M0 and Release A began;
all owner and schema claims used by the implementation were revalidated against
this revision
**Corrective review base:** `384a615d002db331f9e3600d47907d5c375d41ee`; the historical M0 base is retained
rather than rewritten
**Primary owner:** `packages/core`
**Public projection owner:** `packages/mcp`
**Independent companion:** `AGENT_FACING_FRESHNESS_RESPONSE_CONTRACT_PLAN.md`
**External reference:** `DeusData/codebase-memory-mcp` at
`97ce23f9827177fff3858831156e9795c6832b18`
**External source:**
<https://github.com/DeusData/codebase-memory-mcp/tree/97ce23f9827177fff3858831156e9795c6832b18>
**External license:**
<https://github.com/DeusData/codebase-memory-mcp/blob/97ce23f9827177fff3858831156e9795c6832b18/LICENSE>

## 1. Goal

Give agents optional, precisely defined structural information about a symbol
without changing canonical symbol identity or default search responses.

The first release is deliberately narrow:

```text
one language
local structural analysis only
explicit analysis request only
no graph summaries
```

Graph-derived counts, recursion, and coverage summaries are a later,
relationship-bound release.

This program is independent from agent-facing freshness simplification.

## 2. Current evidence and invariant

At the review base:

- `SymbolRecord` contains canonical identity, source span, parent, export,
  file-hash, extractor-version, and ontology data;
- the registry schema is `symbol_registry_v3`;
- file-outline symbols project canonical identity plus a call-graph hint;
- Satori has no persisted contract for structural complexity metrics;
- relationship evidence is independently versioned as
  `relationship-v9+python-constructor-receivers+python-native-resolution-v1`;
- relationship contributions use
  `relationship_file_contribution_v4`.

The invariant is:

> Analysis is derived, optional evidence. It must not alter symbol keys, symbol
> instance IDs, canonical identity, base publication readability, or
> relationship authority.

M0 must retain raw inventories, prototypes, benchmark samples, and upstream
reuse decisions in:

```text
docs/evidence/symbol-analysis-m0-<date>/
```

The plan records decisions; the receipt records proof.

## 3. M0 must first choose the storage model

Persistence is not pre-approved.

Compare:

### Option A — on-demand analysis

```text
explicit analysis request
-> capture the normal request freshness barrier
-> prove that the selected symbol registry publication is compatible with the
   source observation
-> resolve the canonical symbol in that compatible source
-> parse through the existing parser owner
-> compute requested metrics
-> revalidate the source/publication barrier
-> return without durable analysis state
```

Do not combine a symbol identity from publication P with arbitrary
working-tree syntax from source state Q.

If M0 instead selects publication-relative analysis, it must identify the exact
publication-bound source evidence, compute against that generation, and label
the result as publication-relative. Do not mix the two source-binding models.

For current-source on-demand analysis, align with the independently approved
agent-facing freshness contract:

```text
source changes during analysis
-> discard all calculations from the prior barrier
-> re-enter the established freshness owner at most once
-> resolve the canonical symbol again
-> recompute from the new compatible source observation
-> if source changes again, return one freshness or stale-symbol blocker
```

Do not invent another retry owner or reuse metrics computed before the new
barrier.

Evaluate:

- cold and repeated latency;
- parser availability;
- deterministic behavior;
- memory;
- offline behavior;
- source/publication binding;
- duplicate work.

### Option B — existing optional navigation contribution

```text
indexing/extraction
-> compute file-local metrics
-> retain them in an existing compatible optional contribution format
```

Evaluate:

- whether this preserves one source of truth;
- contribution invalidation;
- schema/version coupling;
- load and serialization cost;
- whether metrics can remain optional.

### Option C — dedicated immutable analysis sidecar

```text
source generation + symbol registry
-> symbol-analysis generation
-> optional explicit analysis read
```

Justify only if it materially improves repeated latency, deterministic reuse,
incremental cost, memory behavior, or offline availability.

Account for:

- compatibility;
- cleanup and retention;
- rollback;
- corruption behavior;
- generation binding;
- storage and load cost.

M0 must select one option with measurements. Do not assume a sidecar because it
is architecturally tidy.

## 4. Initial language and metric scope

### 4.1 One language

M0 selects exactly one initial language and one representative production
repository.

The leading candidate is Python, but M0 must select it or another language
using structural-analysis evidence:

- parser maturity;
- AST stability;
- source-span fidelity;
- metric-definition clarity;
- pinned upstream fixture quality;
- representative production repository availability;
- incremental extraction cost;
- maintenance burden.

Relationship qualification is not evidence that a language is the best
structural-analysis target.

The storage and response schema may be language-independent, but the release
must not claim equivalent metric semantics for other languages.

### 4.2 Structural v1 fields

Freeze only:

```text
parameterCount
loopCount
maxLoopDepth
cyclomaticComplexity
signature
declaredReturnType
```

Definitions must specify:

- receiver and variadic parameter handling;
- comprehension and generated-parameter treatment;
- loop constructs and nesting;
- branch, boolean, exception, match, and conditional-expression contribution
  to cyclomatic complexity;
- whether signatures preserve or normalize source syntax;
- that `declaredReturnType` means explicit source syntax, not inference;
- algorithm and parser versions;
- measured zero versus unsupported/unknown.

Role/test classification is not part of structural v1. M0 first determines
whether existing `ontologyTags` already own it.

### 4.3 Deferred fields

Defer:

```text
cognitiveComplexity
maxAccessDepth
hotspotScore
allocationInsideLoop
linearScanInsideLoop
recursionInsideLoop
unguardedRecursion
role classification
```

These require separate formulas, provenance, or finding contracts.

## 5. Derivation and availability

Every field must represent derivation and field availability independently.

```text
derivationKind
    exact_syntax
    structural_metric
    relationship_derived
    repository_policy
    heuristic_finding

fieldAvailability
    available
    unsupported_syntax
```

Do not combine these into one confidence number.

Structural v1 derivations:

| Field | Derivation |
| --- | --- |
| `parameterCount` | `exact_syntax` |
| `signature` | `exact_syntax` |
| `declaredReturnType` | `exact_syntax` |
| `loopCount` | `structural_metric` |
| `maxLoopDepth` | `structural_metric` |
| `cyclomaticComplexity` | `structural_metric` |

Unsupported syntax must return an unavailable state, not zero or false.
Measured `0` remains a valid available value.

Language/provider availability and internal failures belong to the request
contract, not ordinary field data:

```text
unsupported field syntax
    field-level unsupported_syntax
    other independently valid fields may return

unsupported language or unavailable required provider
    request-level analysis unavailable

internal analysis computation failure
    request-level fail-closed error
    no partial metric payload
```

Structural v1 does not authorize partial success after an internal computation
error. M0 may propose a different partial-result contract only as a separate
explicit schema decision; it must not normalize an implementation defect as an
ordinary unavailable metric.

## 6. Reuse-first implementation policy

The pinned Codebase Memory source is the preferred implementation and fixture
source when its semantics fit the selected language and metrics.

Inspect first:

```text
internal/cbm/cbm.h
    analysis model

internal/cbm/extract_defs.c
internal/cbm/helpers.c
    structural extraction and metric walkers

src/pipeline/pass_complexity.c
    transitive and recursion-related analysis for later work

src/mcp/mcp.c
    selectable fields and compact response projection

tests/ and test-infrastructure/
    expected metric values and serialization fixtures
```

M0 records a reuse ledger:

```text
upstream file/symbol
source commit and license
semantic definition
supported language assumptions
portable as-is | translate | adapt | reject
Satori destination
ported upstream fixtures
Satori-specific integration tests
```

Prefer copying, translating, or adapting proven upstream algorithms and tests
over independently rewriting them. Preserve pinned-source attribution and the
MIT notice for copied or substantially translated material.

New Satori-authored code should be limited to:

- parser/AST adapter translation where required;
- symbol and source-generation binding;
- the selected storage integration;
- incremental contribution ownership;
- explicit MCP projection;
- Satori compatibility and rollback behavior.

Architecture modification is allowed when an upstream component removes more
Satori-specific code than it adds while preserving the invariant in section 2.
Do not port an unrelated watcher, database, visualization, ADR, or cross-service
surface under this program.

Port upstream metric fixtures instead of duplicating them. Add only
Satori-specific tests that can disprove identity, publication, incremental,
compatibility, or projection correctness.

## 7. Analysis state model

The state model depends on the selected storage option.

### Option A — on demand

```text
compatible base publication, symbol identity, and source barrier
    compute and return analysis

unsupported parser/language/syntax
    return the precise unavailable state

source incompatible with the selected symbol/publication
    return the applicable freshness or stale-symbol blocker

analysis computation fails
    explicit analysis fails closed with no partial metric payload
    normal tools remain unaffected
```

Durable analysis is absent by design under Option A. Its absence is not an
unavailability condition.

### Options B/C — retained analysis

```text
base publication readable + analysis present and compatible
    explicit analysis returns it

base publication readable + analysis absent
    normal tools work
    explicit analysis follows the selected old-index/unavailable behavior

base publication readable + analysis corrupt or incompatible
    normal tools work
    explicit analysis fails closed

base publication incompatible
    existing lifecycle rules apply
```

Optional analysis must never turn a healthy base index into
`requires_reindex` unless a later explicit product decision makes that analysis
version mandatory.

M0 must choose one established recovery for unavailable old-index analysis:

```text
requires normal reindex
unavailable until the next normal reindex
existing repair may construct optional analysis
new analysis-only maintenance action
```

Do not assume a new maintenance action. Adding one is a separate public product
decision requiring evidence that existing recovery is inadequate.

Do not silently compute an expensive query-time fallback if the selected
contract is persisted analysis.

## 8. Incremental and size contract

If M0 selects indexed or persisted analysis:

```text
changed file
    -> recompute its structural contribution

unchanged file with stable source/symbol digest
    -> reuse its contribution

deleted or renamed file
    -> remove or rebind its contribution
```

Full and incremental construction must produce equivalent normalized analysis
for the same final source state.

Freeze limits for:

- bytes per symbol;
- signature bytes per symbol;
- total contribution bytes per file;
- total signature bytes per file;
- symbols per file;
- total analysis size as a percentage of the symbol registry;
- load-time memory expansion;
- query disclosure count.

Per-symbol limits alone are insufficient for generated files with many symbols.

For every option, including on-demand, freeze a default-path budget:

- normal search response and latency remain unchanged;
- normal outline response and latency remain unchanged;
- no eager analysis computation;
- no eager parser initialization attributable only to analysis;
- bounded package/install-size change.

For Options B/C, also freeze default-path budgets for users who never request
analysis:

- full-index wall-time regression;
- one-file incremental-sync regression;
- peak RSS during ordinary indexing;
- retained RSS with analysis unused;
- package/install-size change;
- startup and load cost while analysis detail is unused.

An explicit feature must not impose an unreviewed cost on every indexing
operation.

## 9. Public API

Default `search_codebase` responses remain unchanged.

M0 must freeze request cardinality and the exact selection mechanism.

The leading selected-symbol candidate reuses the existing exact outline
identity route:

```text
file_outline(
    path,
    file,
    resolveMode="exact",
    symbolIdExact="<canonical symbol instance id>",
    detail="analysis"
)
```

At the review base, `file_outline` already accepts `resolveMode="exact"` and
`symbolIdExact`; it does not yet accept `detail="analysis"`. The example is a
candidate public extension, not a claim that the complete request currently
exists.

M0 must compare it with a bounded file-level projection:

```text
file_outline(path, file, detail="analysis")
    -> analysis for every disclosed symbol, subject to a frozen cap
```

Select exactly one contract before M1. Record response-size, latency,
duplicate-name, source-binding, and disclosure implications.

The selected-symbol decision must also freeze:

- whether analysis replaces the ordinary outline body or accompanies the
  selected symbol's existing outline context;
- invalid `symbolIdExact` behavior;
- stale-symbol behavior after source drift;
- source-incompatibility behavior;
- unsupported-metric behavior.

Invalid/stale canonical identity is not the same condition as unavailable
analysis.

Canonical `symbolIdExact` selection is preferred over short-name selection.
Duplicate names must never be resolved by name alone.

Do not assume a dedicated new tool or add analysis options to every tool.

A selected symbol may explicitly return:

```json
{
  "symbol": {},
  "analysis": {}
}
```

The exact field and unavailability schema remains an M0 decision.

Built-in, external, relationship, coverage, and graph fields are not part of
the structural first release.

## 10. Separate later graph release

Graph summaries are not an M1 completion condition.

The later relationship-bound release may evaluate:

```text
directAuthoritativeCallerCount
directAuthoritativeCalleeCount
recursion state
coverage capabilities
```

Persist canonical edge classifications, not counts for every display filter.
Derive `includeTests` and `includeExternal` at projection time.

Do not combine calls, imports, references, definitions, tests, and similarities
into generic total degree.

Recursion meanings:

```text
confirmed
    An authoritative cycle exists in the compatible relationship generation.

not_observed
    No cycle was found, but applicable coverage is partial or bounded.

unknown
    No compatible relationship evidence can evaluate recursion.

not_recursive_under_qualified_model
    Reserved for a future provider/model with qualified complete coverage.
```

Coverage remains provider/language/version/pattern-specific. Evidence remains
on edges or derivations, not once on the whole symbol.

## 11. M0 evidence batch

M0 makes no product code changes. Documentation, evidence, and bounded
throwaway prototypes are allowed when necessary to choose the architecture.

Throwaway prototypes must be:

- isolated from production imports and runtime paths;
- absent from shipped packages;
- excluded from the final architecture unless deliberately promoted through a
  later product commit;
- removed after measurement or retained only as clearly marked evidence
  tooling.

At M0 start, verify that repository HEAD still equals the recorded review base.
Revalidate current schema and owner statements against that exact base. Earlier
source-read findings become hypotheses if the base changes.

M0 freezes:

- the first language and production fixture;
- definitions and upstream source for the six structural fields;
- unknown and unsupported behavior;
- upstream reuse ledger;
- storage option A, B, or C;
- incremental ownership if persistence is selected;
- compatibility and old-index recovery;
- explicit public route;
- exact source-binding and request-barrier model;
- performance, storage, and memory budgets;
- package/schema/version decision;
- M1 acceptance witnesses.

Required measurements:

- cold and repeated explicit-analysis latency;
- full and one-file analysis cost;
- peak and retained memory;
- serialized bytes per symbol and file;
- total artifact size where applicable;
- load-time expansion;
- default-response byte equality;
- for every option, ordinary search/outline latency, eager parser/analysis
  initialization, and package/install-size change;
- for Options B/C, default indexing, incremental sync, ordinary-indexing RSS,
  unused-analysis retained RSS, and unused startup/load cost.

Terminal outcome:

```text
symbol_analysis_v1_contract_ready
symbol_analysis_requires_architecture_decision
symbol_analysis_evidence_insufficient
```

The explicit implementation authorization received after this plan review
authorized structural Release A against the frozen M0 decisions below. It did
not authorize graph-derived Release B.

Seal:

```text
M0_BASE_REVISION=<hash>
M0_OUTCOME=<terminal outcome>
INITIAL_LANGUAGE=<language>
PRODUCTION_FIXTURE=<repository and revision or fixture>
STORAGE_MODEL=on_demand|existing_contribution|dedicated_sidecar
PUBLIC_ROUTE=<exact tool and request shape>
SOURCE_BINDING_MODEL=<exact rule>
METRIC_VERSION=<identifier>
UPSTREAM_REUSE_DECISION=<summary>
OLD_INDEX_BEHAVIOR=<exact behavior>
DEFAULT_PATH_BUDGET=<limits for every storage option>
ANALYSIS_REQUEST_BUDGET=<limits>
SCHEMA_VERSION_DECISION=<decision>
PACKAGE_VERSION_DECISION=<decision>
M0_EVIDENCE_COMMIT=<hash when commit authorization is included>
PRODUCT_CODE_CHANGED=no
BLOCKER=<none or exact blocker>
```

### 11.1 Executed M0 decision

```text
M0_BASE_REVISION=2a69144be52e0b4f9ea9894dd5695666c7f7dce9
M0_OUTCOME=symbol_analysis_evidence_insufficient
ARCHITECTURE_CANDIDATE=on_demand
INITIAL_LANGUAGE=python
PRODUCTION_FIXTURE=not yet qualified; focused repository-local fixtures only
STORAGE_MODEL=on_demand_candidate
PUBLIC_ROUTE=file_outline(path,file,resolveMode="exact",symbolIdExact,detail="analysis")
SOURCE_BINDING_MODEL=current source under the existing publication read lease
  and prepared-source observation, revalidated before response
METRIC_VERSION=python_structural_v1
UPSTREAM_REUSE_DECISION=reference inspected; no upstream code copied because
  Satori's existing Tree-sitter owner provided the smaller implementation
OLD_INDEX_BEHAVIOR=normal indexes remain readable; no analysis sidecar is required
DEFAULT_PATH_BUDGET=no eager analysis, persistence, indexing, or default response change
ANALYSIS_REQUEST_BUDGET=one exact symbol and one on-demand Python parse per request
SCHEMA_VERSION_DECISION=optional explicit response extension; no stored schema change
PACKAGE_VERSION_DECISION=deferred to the repository release owner
M0_EVIDENCE_COMMIT=not committed
PRODUCT_CODE_CHANGED=yes, under later explicit Release A authorization
BLOCKER=storage option comparison and representative production performance evidence incomplete
```

The selected public projection keeps the ordinary exact outline and adds
`analysis` only to its one canonical Python function or method. Unsupported
languages and symbol kinds return a precise unavailable response. An internal
computation failure fails the whole explicit analysis request; it is not
normalized into partial metric data.

If the prepared source observation changes during computation, the non-mutating
`file_outline` route discards the analysis and returns `not_ready`. It does not
start synchronization or create a second freshness owner. The caller may run the
existing sync action and repeat the request.

This execution record does not close the original M0 architecture comparison:
Options B and C were not benchmarked, and no representative production
repository established cold/repeated latency, memory, or large-file budgets.
The on-demand model is retained because it is the smallest implementation and
adds no default indexing or persistence path, not because every storage option
was conclusively measured.

### 11.2 Formal Release A storage decision and frozen budgets

This decision was authorized independently after watcher-unavailable latency
qualification. It does not change or qualify the separate freshness release,
whose RSS blocker remains open.

```text
M0_FINALIZATION_BASE=e9745207b517e812cc7e5754ba536a9e32fdc182
M0_STORAGE_DECISION=on_demand
INITIAL_LANGUAGE=python
PRODUCTION_FIXTURE=tradingview_ratio@8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7
PUBLIC_ROUTE=file_outline(path,file,resolveMode="exact",symbolIdExact,detail="analysis")
SOURCE_BINDING_MODEL=current source under the existing publication read lease
  and prepared-source observation, revalidated before response
METRIC_VERSION=python_structural_v1
PERSISTED_ANALYSIS=not_authorized
GRAPH_DERIVED_RELEASE_B=not_authorized
```

On-demand analysis is selected because Release A has one explicit, bounded
request and no demonstrated cross-request reuse requirement. It adds no
analysis artifact, publication work, migration, retention policy, startup
load, or default indexing work. Options B and C necessarily add at least one of
those default-path costs and are not justified merely to make an optional
single-symbol response faster.

This is a product decision based on required behavior and avoided default-path
cost, not a claim that complete implementations of Options B and C were
benchmarked. Reconsider persistence only when repository-local evidence proves
at least one of:

- repeated analysis requests make on-demand latency exceed the frozen budget;
- parse-time or transient-memory cost exceeds the frozen budget on a supported
  repository class;
- an approved offline workflow requires reusable analysis without source
  parsing;
- a later authorized feature needs generation-bound analysis reuse and can
  own its migration, retention, and rollback costs.

Budgets are frozen before the production benchmark:

```text
selected-symbol cold request:
    <= 4000 ms

selected-symbol repeated request:
    p95 <= 250 ms after two preparation calls

analysis overhead over paired summary:
    p95 <= 150 ms

large tracked Python file:
    <= 1000 ms after preparation

process-tree peak RSS increase over paired summary:
    <= 64 MiB

retained process-tree RSS increase after repeated analysis:
    <= 32 MiB

serialized successful response:
    <= 8192 bytes

unused default path:
    omitted detail and detail="summary" return normalized byte-identical
      payloads; only the existing callGraphHint.validatedAt observation time
      may differ between separate calls
    no analysis field
    no analysis artifact
    no analysis-owned source comparison, synchronization, or publication
    paired warm-summary p95 regression <= 5% and <= 25 ms
```

The latency limits include the existing public `file_outline` route. The
paired-overhead limit distinguishes structural-analysis cost from already
qualified navigation loading. RSS limits are deltas from the same isolated
runtime and publication, not a new deployment-capacity decision.

### 11.3 Release A production measurement and qualification stop

The pinned production benchmark passed every frozen budget:

```text
target:
    tradingview_ratio@8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7
    1013 tracked Python files

selected symbol:
    src/cli/main.py::cli_entry_point

cold request:
    49.810 ms

repeated request:
    p50 46.540 ms
    p95 51.333 ms

paired analysis overhead:
    p95 1.235 ms

large supported production file:
    src/cli/commands/discover.py
    123835 bytes
    144.766 ms

process-tree peak RSS increase over paired summary:
    0.219 MiB

retained process-tree RSS increase:
    7.059 MiB

maximum response:
    1611 bytes

unused default path:
    normalized payload equal
    zero latency regression
    no analysis field
    no persisted analysis artifact
    no publication or operation change
```

The 525434-byte generated operations script was not used as a latency sample
because its existing canonical symbol span returned
`OUTLINE_SYMBOL_SPAN_UNVERIFIED`; the public route failed closed before
analysis. The benchmark instead used a large supported production module.

M0 therefore closes with:

```text
M0_OUTCOME=symbol_analysis_v1_contract_ready
STORAGE_MODEL=on_demand
ARCHITECTURE_DECISION=sealed_for_release_a
PERSISTENCE_RECONSIDERATION=only_under_the_triggers_in_section_11_2
```

Complete affected qualification then exposed an independent current-master
regression:

```text
Core full suite:
    stalled in Context retention cannot pass an active publication reader
      through two activations
    interrupted after 416.736 seconds
    48 passed before the stall

Focused reproduction:
    same test timed out after 60 seconds
    second activation remained unresolved after the read lease was released

MCP full suite:
    not run after the explicit stop condition fired
```

This plan does not authorize changing that freshness/publication owner.
Structural Release A remains unmodified and records:

```text
RELEASE_A_OUTCOME=symbol_analysis_release_a_qualification_blocked
BLOCKER=current Core read-lease retention test does not complete
PACKAGE_VERSION_DECISION=hold Core 3.4.0 and MCP 6.5.0 release candidacy
```

## 12. Proposed release sequence

### Release A — structural analysis

Conditional on accepted M0 and explicit implementation authorization:

```text
selected language
six structural fields
selected storage model
full/incremental equivalence where applicable
explicit analysis projection
old-index and rollback behavior
```

### Release B — relationship-bound graph summaries

Separate later authorization, compatibility decision, and qualification.

It must not block or redefine Release A.

## 13. Acceptance witnesses

M0 must freeze exact expected values for the selected language:

1. Zero and multiple parameters.
2. Receiver and variadic handling.
3. No branch, one branch, and nested branches.
4. Every supported loop and nested loops.
5. Boolean, exception, match, comprehension, and conditional behavior under
   the selected formula.
6. Explicit and absent return declarations.
7. Source-preserved or normalized signatures.
8. Unsupported syntax yields a precise unavailable state.
9. Ported upstream fixtures retain their expected values.
10. Canonical symbol identity remains unchanged.
11. Duplicate short names resolve only through canonical identity.
12. Available zero values remain distinguishable from unavailable values.
13. A symbol selected from publication P never receives analysis from
    incompatible source state Q.
14. A concurrent source event during on-demand computation discards prior
    calculations, re-enters the existing freshness owner at most once, resolves
    the canonical symbol again, and recomputes; a second change returns one
    blocker and no mixed-generation response.
15. Default search output remains unchanged.
16. Explicit analysis unavailable behavior is deterministic.
17. Default indexing and normal search remain inside the frozen budget when
    analysis is never requested.
18. An algorithm-version change never reuses incompatible retained analysis.
19. Under Option A, absence of a sidecar is never reported as analysis
    unavailability.

If persistence is selected:

20. Add, modify, delete, and rename invalidate exact contributions.
21. Full and incremental normalized output agree.
22. Old index without analysis remains normally readable.
23. Corrupt optional analysis does not poison the base publication.
24. Storage and load-time memory stay within frozen contribution-level limits.

## 14. Verification and stop conditions

During implementation, run ported upstream metric fixtures and only the nearest
Satori parser, identity, storage, delta, compatibility, and explicit-response
tests. Final qualification includes invalidated Core/MCP typecheck, lint, build,
package tests, generated contracts, version freshness, attribution, dependency
scan, and `git diff --check`.

Stop if:

- analysis must enter canonical symbol identity;
- no storage option meets the measured simplicity/performance contract;
- optional analysis requires another publication authority;
- unavailable cannot be distinguished from zero or false;
- language semantics cannot be frozen for v1;
- incremental invalidation exceeds the approved budget;
- old indexes or normal tools become unreadable without analysis;
- default search output changes;
- copied code lacks pinned provenance and attribution;
- implementation silently broadens language or relationship claims.

## 15. Completion

Structural Release A passes only when:

```text
one language and six metrics
    are deterministic and reproducible under a documented, versioned language
    model

syntax fields
    are exact syntax evidence under that model

canonical identity
    is unchanged

selected storage
    is evidence-backed and optional

incremental/full state
    agrees when persistence is used

normal tools
    work without analysis

explicit analysis
    is deterministic, bounded, and provenance-bearing

graph summaries
    remain a separate later release
```
