# Satori Python R0 and SCIP P0 decision plan

Status: proposed

Created: 2026-07-25

## Decision locked by this plan

Do not search for a globally best call-graph implementation. Run one
discriminating experiment and force a bounded decision.

Satori will own a multi-provider evidence graph rather than implement a
language-by-language type system:

```text
Satori parser
    identifies call site and containing caller

Language-semantic provider
    resolves target identity

Satori normalizer
    validates spans, snapshot, configuration, and symbol identity

Satori relationship graph
    publishes CALLS, REFERENCES, or unresolved evidence
```

The non-negotiable contract is:

- Satori owns canonical graph identities and publication.
- Providers own language-specific semantic resolution.
- An exact `CALLS` edge requires an exact target, caller, call evidence, source
  snapshot, and matching configuration.
- Ambiguous evidence produces no exact edge.
- Edge certainty is separate from total graph completeness.

The first provider experiment is [SCIP](https://github.com/scip-code/scip)
through [scip-python](https://github.com/sourcegraph/scip-python). This plan
does not authorize production SCIP integration.

## Scope and non-goals

Authorized now:

1. R0: preserve the existing Python ground truth and record the first wrong
   boundary in the native Satori path.
2. P0: run one offline `scip-python` experiment against the frozen target
   revision.

Not authorized in this plan:

- production relationship, sidecar, navigation, MCP, checkpoint, or lifecycle
  changes;
- modification of the user's target repository or existing index;
- evaluation of Serena, Glean, CodeQL, Joern, Kythe, Jedi, another LSP server,
  another graph database, or another graph authority;
- a broad TypeScript/Rust/provider bake-off;
- general Python call-graph completeness claims; or
- a second provider survey after P0.

R0 remains valuable if SCIP succeeds: it distinguishes provider target
resolution from Satori's downstream normalization, persistence, and traversal.

## Evidence freeze

| Input | Frozen value |
| --- | --- |
| Satori revision | `3764b740d0f55081f98cc33fd4f6236046de8712` |
| Target repository | `/home/hamza/repo/tradingview_ratio` |
| Target revision | `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` |
| Existing native repair plan | [`SATORI_PYTHON_INBOUND_RELATIONSHIP_COVERAGE_REPAIR_PLAN.md`](./SATORI_PYTHON_INBOUND_RELATIONSHIP_COVERAGE_REPAIR_PLAN.md) |
| Current qualification report | [`report.md`](./report.md) |

The experiment must use a task-owned materialization and output directory
outside Satori's production graph and outside the user's working tree. Pin and
record the exact `scip-python` version, Node version, Python version,
environment/configuration inputs, and source/configuration digests.

## Phase 1: frozen truth matrix

Reuse the six known production caller sites. Do not expand the benchmark.

| Case | Target | Expected caller evidence |
| --- | --- | --- |
| `python-check-entry-opportunity-ranker` | `SignalGenerator.check_entry` | `src/python/core/opportunity_ranker.py:256` |
| `python-check-entry-pair-evaluator` | `SignalGenerator.check_entry` | `src/python/core/pair_evaluator.py:738` |
| `python-check-entry-trading-core` | `SignalGenerator.check_entry` | `src/python/core/trading_core.py:675` |
| `python-residual-gate-coordinator` | `_evaluate_residual_type_invariant` | `src/python/core/backtest/gate_coordinator.py:475` |
| `python-residual-phases` | `_evaluate_residual_type_invariant` | `src/python/core/backtest/phases.py:129` |
| `python-ledger-record` | `SignalLedger.record` | `src/python/core/backtest/signal_recording.py:435` |

Required negative controls:

- `self.hurst_gate.check_entry(...)` must not target
  `SignalGenerator.check_entry`.
- An unrelated `.record(...)` receiver must not target `SignalLedger.record`.
- A same-name function or method must not be selected by name alone.
- An unresolved or ambiguous receiver must not produce an exact `CALLS` edge.

These controls distinguish semantic resolution from suffix or name matching.

Each case gets one compact JSONL row. The row is evidence, not a conclusion:

```json
{
  "caseId": "python-check-entry-opportunity-ranker",
  "expectedTarget": "SignalGenerator.check_entry",
  "expectedCaller": "src/python/core/opportunity_ranker.py:256",
  "expected": "CALLS",
  "provider": "scip-python",
  "providerTarget": null,
  "providerReferenceSpan": null,
  "containingCaller": null,
  "normalizedDecision": "unresolved",
  "reason": null
}
```

## Phase 2: native Python R0

R0 answers one question for every missing caller:

> At what exact boundary does the current native Satori path lose the
> relationship?

Record only this trace:

```text
call site
-> extracted receiver/import/binding evidence
-> target resolution result
-> relationship emission
-> sidecar persistence
-> reverse traversal
```

For each case, classify observations as `observed`, `source-supported`,
`intervention-proven`, or `unresolved`. Preserve the exact source and target
symbol instances and call-site spans.

R0 must not implement Python R1-R4. It must not add absolute-import support,
constructor flow, service flow, or a new provider while the first wrong
boundary is being established.

## Phase 3: one offline `scip-python` spike

Do not integrate SCIP into production. The spike must:

1. Materialize the frozen target revision into a task-owned location.
2. Generate a SCIP index using a pinned `scip-python` version.
3. Read the SCIP output outside Satori's production graph.
4. Locate the six target call sites and all required negative controls.
5. Map provider symbols and spans to exact existing Satori symbols.
6. Produce normalized candidate rows without publishing relationships.
7. Run the provider twice and compare normalized output byte-for-byte or by a
   recorded canonical digest.
8. Record provider version, configuration digest, source digest, repository
   revision, wall time, peak memory, and index size.

The provider may produce an exact `CALLS` candidate only when all conditions
hold:

```text
provider identifies the exact target
+ occurrence has call/function evidence
+ Satori identifies the containing caller exactly
+ repository revision matches
+ provider configuration matches
+ source digest matches
```

Otherwise classify the result as `REFERENCES` or `unresolved`. A missing
provider result is not evidence that there is no caller.

The P0 output is one compact JSONL evidence artifact and one forced decision.
Do not write a long report during the experiment.

## Forced decision

Apply this table without changing the thresholds after observing the result:

| P0 outcome | Decision |
| --- | --- |
| 6/6 positives, zero exact false positives, deterministic | `scip_primary`; implement a generic SCIP ingestion adapter in a separately authorized change |
| 5/6 positives, zero exact false positives, and the only miss is the explicit `Any` ledger case | `scip_plus_native_any_gap`; use SCIP plus one narrowly bounded native direct-binding supplement |
| Four or fewer positives, or more than one semantic pattern remains missing | `native_python_bounded`; resume only the existing bounded Python R1/R2 plan |
| Any exact wrong-target edge | `provider_rejected`; do not publish exact SCIP `CALLS` until normalization is understood |
| Provider output cannot be tied to exact source/configuration identity | `provider_rejected`; retain only as research evidence |
| Repeated runs are nondeterministic | `provider_rejected`; retain only as research evidence |

The five-of-six exception is intentionally limited to the explicit `Any`
ledger case. It is not a general sufficiency or completeness claim.

Stop immediately after recording one decision.

## Later implementation branch A: SCIP succeeds

Only after `scip_primary` is reached may a separately authorized change add:

```text
SCIP snapshot reader
-> occurrence and symbol mapper
-> Satori caller-containment lookup
-> normalized relationship evidence
-> existing RelationshipRecord publication
```

The adapter must remain language-neutral. Do not create Python-specific graph
rules in the adapter.

The minimum provider evidence record is:

```text
providerId
providerVersion
providerSnapshotDigest
repositoryRevision
configurationDigest
sourceDigest
sourceSymbol
targetSymbol
callSpan
providerProof
normalizedDecision
```

The adapter must preserve provider provenance and must never convert a
name-only or ambiguous match into `CALLS`.

After the Python adapter works, run only one TypeScript cross-file method-call
fixture and one Rust cross-module direct-call fixture as adapter-shape checks.
They are not language qualifications. If either fails, classify that language
as unqualified and stop.

## Later implementation branch B: only the explicit `Any` case is missing

Use SCIP for normal semantic resolution and add one narrowly bounded native
supplement equivalent to:

```text
exact constructor
-> exact field assignment
-> exact service-constructor field
-> exact call receiver
```

The supplement must not implement generic points-to analysis, arbitrary
factories, collection flow, reflection, unique-name fallback, or repository-
wide receiver guessing.

## Later implementation branch C: SCIP is insufficient

Resume only the existing bounded native Python plan for the six frozen cases
and negatives. Do not start another provider survey. Record SCIP as a useful
future interchange candidate that is insufficient for the current acceptance
matrix.

## Hard stops

1. One external provider now: `scip-python`.
2. One truth matrix: six positives and the listed negatives.
3. Two provider executions, sufficient for deterministic-output testing.
4. No production adapter before the offline result.
5. No second provider unless SCIP cannot represent the required call evidence.
6. No broad TypeScript/Rust qualification during Python repair.
7. No new graph database or graph authority.
8. No name-only or suffix fallback.
9. No architecture-report rewrite until the forced decision is reached.
10. Stop at the first applicable decision-table outcome.

## Execution handoff

```text
Execute only Satori Python R0 and one offline scip-python provider spike.

Do not modify production relationship publication, sidecar schemas, navigation,
MCP contracts, checkpoint state, or the user's existing index.

Use the frozen Satori and target revisions in this plan.

1. Freeze the six known Python positive caller sites and the listed negatives.
2. Record the native first-wrong boundary for each missing caller.
3. Generate scip-python output in a task-owned materialization.
4. Parse SCIP offline and map provider symbols/spans to exact Satori symbols.
5. Emit CALLS candidates only under the exact identity conditions above.
6. Run twice and compare normalized output.
7. Record coverage, false positives, digest, runtime, memory, size, versions,
   and configuration.
8. Write one compact JSON/JSONL artifact and one forced decision.
9. Stop. Do not evaluate another provider or implement R1-R4.
```
