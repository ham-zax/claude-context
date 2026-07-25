# Native Python L4 qualification receipt

Outcome: `native_python_performance_blocked`

This is a separate current-version qualification artifact. It does not edit
the historical report, checkpoint files, or the target repository.

## Identity and scope

| Item | Value |
|---|---|
| Checkpoint baseline | `074bed62f723e8b04ec36f3467417cba632687ae` |
| Prior evidence head | `cfc26397979738507986b692c5ed070bbdb312f0` |
| Final native candidate | `35cc98c45928eed3eaebe1028dca3f390388417e` |
| Candidate branch | `candidate/native-python-l4-20260725` |
| Candidate worktree | `/home/hamza/repo/satori-worktrees/native-python-l4-20260725` |
| Candidate range | `074bed62f723e8b04ec36f3467417cba632687ae..35cc98c45928eed3eaebe1028dca3f390388417e` |
| Frozen target revision | `/home/hamza/repo/tradingview_ratio@8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` |
| Target materialization | `/tmp/satori-native-python-l4-target-20260725-lbEBpS` |
| Native provider | `satori-native-python` / `bounded-origin-v1` |
| External providers | Not instantiated |

The final code commit contains only these eleven owned files:

```text
packages/core/src/core/persisted-index-authority.test.ts
packages/core/src/language-analysis/versions.ts
packages/core/src/navigation/query.test.ts
packages/core/src/navigation/query.ts
packages/core/src/relationships/builder.test.ts
packages/core/src/relationships/builder.ts
packages/core/src/relationships/resolution.ts
packages/core/src/symbols/contracts.test.ts
packages/core/src/symbols/contracts.ts
packages/core/src/symbols/sidecar.test.ts
packages/core/src/symbols/sidecar.ts
```

The worktree was clean at `cfc26397979738507986b692c5ed070bbdb312f0` before
these edits. No unrelated staged, unstaged, or untracked candidate changes were
present.

## Runtime, publication, and compatibility identity

The candidate-built process used the candidate worktree directly:

```text
source revision: 35cc98c45928eed3eaebe1028dca3f390388417e
Core entry: /home/hamza/repo/satori-worktrees/native-python-l4-20260725/packages/core/dist/index.js
MCP entry: /home/hamza/repo/satori-worktrees/native-python-l4-20260725/packages/mcp/dist/index.js
Core package: @zokizuan/satori-core 3.2.0
MCP package: @zokizuan/satori-mcp 6.3.0
Core dist-tree SHA-256: ebfe5139e2bf0bcfd639703ccadd052dd444a82bc14900a102b1553d18e35fc4
MCP dist-tree SHA-256: 92de68460e2265c5fec16dfefb726b9eb3500ff17f3d1dbe0386c92ffb8e2858
Node: v24.13.0
pnpm: 10.28.2
state root: /tmp/satori-native-l4-mcp-candidate-final3-NwWVUs
Lance root: /tmp/satori-native-l4-mcp-lance-candidate-final3-u6XCbS
target root: /tmp/satori-native-python-l4-target-20260725-lbEBpS
```

The runtime fingerprint and published relationship identity were:

```text
relationship builder: relationship-v9+python-constructor-receivers+python-native-resolution-v1
file contribution schema: relationship_file_contribution_v4
relationship manifest schema: relationship_v2
environment configuration: python-native-resolution-v1
symbol extractor: language-analysis-v15+oxc-0.139.0+web-tree-sitter-0.26.10+vscode-grammars-0.3.1+scala-0.24.0-sha256-b7ec2bb29c19827abcefd18ed5cb5a43596009f96a5d53c5b9d1f9676d7521c3
selected navigation generation: symmanifest_a8b0-6c88fb52e55c66d7
symbol registry manifest hash: symmanifest_a8b0395159cbaaad4c793c468aff8ac8
relationship manifest hash: de6d078cde24dfc2f15da89c01d4f61811b9f1eff29d690644d07ba6c32f62af
navigation seal hash: 9e9fc9c89a3499532f1af571918e96773c565bb1c8edf891f6085959d9f7c924
relationship manifest files: 1519
published relationship entries: 27732
```

The runtime fingerprint binds the effective Python semantic configuration
through the relationship builder version and every new claim persists the
`environmentConfigId`. Publication generation remains separate from that
identity.

Compatibility was corrected as follows:

```text
RELATIONSHIP_BUILDER_VERSION:
  relationship-v8+python-constructor-receivers
  -> relationship-v9+python-constructor-receivers+python-native-resolution-v1

RELATIONSHIP_FILE_CONTRIBUTION_SCHEMA_VERSION:
  relationship_file_contribution_v3
  -> relationship_file_contribution_v4

RELATIONSHIP_MANIFEST_SCHEMA_VERSION:
  relationship_v2 -> relationship_v2
```

The manifest shape did not need a version advance: v4 is required by the v2
manifest validator, so a checkpoint v3 contribution is incompatible. The
checkpoint fingerprint probe returns:

```json
{"status":"requires_reindex","differingFields":["relationshipVersion"]}
```

The sidecar contract rejects a v3 contribution manifest, and new v4
contributions reload successfully. Old relationship evidence is not accepted
as satisfying the new semantic contract.

## Resolution and publication trace

The first missing boundary was the low-confidence relationship-support filter
in `getGraphNeighbors`. The correction admits only categorical
`direct_binding` or `origin_flow` authority for new low-confidence exact
Python `CALLS` records. Legacy low-confidence records without proof authority
retain the prior suppression paths. Ambiguous, unresolved, heuristic,
unsupported, name-only, suffix, and dynamic-fallback evidence remains
non-authoritative.

The final clean build produced:

```text
Python files: 279
symbols: 3311
ResolutionClaims: 14876
serialized relationship contributions: 279
relationship records: 4977
relationship digest: 6b0167425bf7abd85d5b8d9e607178dab327327f028449e498d1c65a7f5bb81c
claim digest: efbc54f93d7936968679a5c5a825342ce14e068f737721aa0a13a77a27fbed32
full/incremental digest equality: true
```

The trace is:

```text
ResolutionClaim
  -> RelationshipRecord
  -> relationship_file_contribution_v4 shard
  -> relationship_v2 manifest
  -> navigation generation symmanifest_a8b0-6c88fb52e55c66d7
  -> sidecar/navigation reload
  -> getGraphNeighbors reverse lookup
  -> MCP relationship-backed call_graph
```

The six required records are:

| Target | Caller | Call-site span | Authority | Proof summary |
|---|---|---|---|---|
| `SignalGenerator.check_entry` | `OpportunityRanker.rank` | `src/python/core/opportunity_ranker.py:256–261` | `origin_flow` | call site → containing caller → `constructor_origin(SignalGenerator)` → flow hop → `field_origin(self.signal_gen)` |
| `SignalGenerator.check_entry` | `_compute_entry_decision` | `src/python/core/pair_evaluator.py:738–743` | `origin_flow` | call site → containing caller → constructor origin → flow hop → allocation origin (`signal_gen`) |
| `SignalGenerator.check_entry` | `TradingCore._evaluate_entry_authority_and_post_signal` | `src/python/core/trading_core.py:675–682` | `origin_flow` | call site → containing caller → constructor origin → flow hop → field origin (`self.signal_generator`) |
| `BacktestEngineGateRuntimeApiMixin._evaluate_residual_type_invariant` | `evaluate_bar_entry_gate_stack` | `src/python/core/backtest/gate_coordinator.py:475` | `origin_flow` | parameter annotation → service allocation → callback flow hops → field origin |
| `BacktestEngineGateRuntimeApiMixin._evaluate_residual_type_invariant` | `process_pending_execution_phase` | `src/python/core/backtest/phases.py:129` | `origin_flow` | parameter annotation → service allocation → callback flow hops → field origin |
| `SignalLedger.record` | `record_signal_event` | `src/python/core/backtest/signal_recording.py:435–462` | `origin_flow` | parameter annotation → ledger allocation → constructor origin → bounded field-flow hops |

Each record retains the exact caller and target instance IDs, call-site span,
ordered proof steps, environment identity, and relationship builder identity.

## Candidate-built MCP witness

The exact public arguments were:

```json
{
  "path":"/tmp/satori-native-python-l4-target-20260725-lbEBpS",
  "symbolRef":{"file":"src/python/core/signals.py","symbolId":"syminst_db0684c3f6f05b6df0addc5c3cb17e8e"},
  "direction":"callers","depth":3,"limit":100
}
```

Equivalent calls used these symbol references:

```text
residual:
  file=src/python/core/backtest/engine_gate_runtime_api.py
  symbolId=syminst_5aaccd6ad2e7203a385dbce56e6a9861
ledger:
  file=src/python/core/ssot/signal_ledger.py
  symbolId=syminst_10e3a141c4858369056b1655a60bb999
```

The fresh candidate-built reindex emitted the exact ordered progress tail
`100.0% -> Indexing complete -> navigation generation published`. It published
`symmanifest_a8b0-6c88fb52e55c66d7`. The first immediate status poll correctly
reported `status=not_ready, reason=indexing` while the asynchronous operation
was still running. After restart, the status call returned `status=ok` with an
owned `sync` operation at `phase=completed`, generation `35`, and the v9
relationship fingerprint. This distinguishes an asynchronous client poll from
a publication failure.

The lifecycle MCP arguments were:

```json
{"action":"reindex","path":"/tmp/satori-native-python-l4-target-20260725-lbEBpS"}
{"action":"status","path":"/tmp/satori-native-python-l4-target-20260725-lbEBpS","detail":"full"}
```

The reindex response was accepted with warning `IGNORE_POLICY_PROBE_FAILED`;
the prescribed status polling was followed. No `clear` operation was called.

The public responses returned `status=ok`, `supported=true`, and no notes. The
depth-3 response includes upstream caller paths; direct inbound records are
identified by `dstSymbolId` equal to the requested target:

| Target | Public response edge count | Direct inbound `CALLS` | Required production callers | Additional exact callers |
|---|---:|---:|---:|---:|
| `SignalGenerator.check_entry` | 62 | 34 | 3 | 31 valid test/fixture callers |
| `_evaluate_residual_type_invariant` | 7 | 2 | 2 | 0 |
| `SignalLedger.record` | 40 | 17 | 1 | 16 valid production/test callers |

The MCP response only exposes the numeric projection (`kind=call`,
`confidence=0.65`); categorical authority was verified against the v4
relationship shards before classifying these edges. No authoritative wrong
target was found.

All additional direct edges were classified as valid exact callers:

```text
SignalGenerator.check_entry — valid additional test/fixture callers:
tests/core/test_tail_dependence_guardrails.py:127
tests/invariants/test_economic_primacy.py:142
tests/invariants/test_economic_primacy.py:154
tests/invariants/test_gate_behavior.py:192
tests/invariants/test_gate_behavior.py:230
tests/invariants/test_gate_behavior.py:269
tests/invariants/test_legacy_fencing.py:212
tests/invariants/test_legacy_fencing.py:237
tests/invariants/test_mi_provenance.py:100
tests/invariants/test_mi_provenance.py:136
tests/invariants/test_mi_provenance.py:175
tests/invariants/test_mi_provenance.py:224
tests/invariants/test_p0_defect_fixes.py:148
tests/invariants/test_p0_defect_fixes.py:178
tests/invariants/test_signal_authority.py:107
tests/invariants/test_signal_authority.py:154
tests/stress/test_copula_stress_surfaces.py:460
tests/stress/test_copula_stress_surfaces.py:520
tests/stress/test_copula_stress_surfaces.py:606
tests/stress/test_copula_stress_surfaces.py:643
tests/stress/test_copula_stress_surfaces.py:681
tests/stress/test_copula_stress_surfaces.py:721
tests/stress/test_copula_stress_surfaces.py:761
tests/stress/test_copula_stress_surfaces.py:1088
tests/stress/test_copula_stress_surfaces.py:1214
tests/test_core_conventions.py:360
tests/test_core_conventions.py:393
tests/test_core_conventions.py:430
tests/test_regime_quantitative.py:136
tests/test_regime_quantitative.py:152
tests/test_regime_quantitative.py:176

SignalLedger.record — valid additional callers:
src/python/core/pair_evaluator.py:1096
src/python/core/shadow_runner.py:550
tests/cli/test_risk_explain_command.py:81–95
tests/core/backtest/test_engine_run_state_reset.py:60–73
tests/core/test_external_paper_executor_contract.py:105
tests/core/test_external_paper_executor_contract.py:242
tests/core/test_external_paper_executor_contract.py:243
tests/core/test_external_paper_executor_contract.py:405
tests/core/test_external_paper_executor_contract.py:406
tests/core/test_external_paper_executor_contract.py:463
tests/core/test_shadow_executor_deterministic_ids.py:61
tests/core/test_signal_ledger_idempotency.py:39
tests/core/test_signal_ledger_idempotency.py:40
tests/core/test_signal_ledger_idempotency.py:50
tests/core/test_signal_ledger_idempotency.py:53
tests/invariants/test_constitution.py:231
```

The three required production `check_entry` source spans were independently
read and contain `self.signal_gen.check_entry`, `signal_gen.check_entry`, and
`self.signal_generator.check_entry`. The additional spans contain exact
`SignalGenerator` receiver bindings. The ledger additions contain exact
`SignalLedger` bindings or test calls. No suffix/name-only edge was promoted.

## Negative controls

The following remained non-authoritative:

```text
self.hurst_gate.check_entry:
  ambiguous REFERENCES; no target; no v4 CALLS record to SignalGenerator.check_entry.
same-name unrelated methods:
  no authoritative CALLS; focused ambiguous-name test passed.
conflicting reassignment:
  no authoritative CALLS.
use before assignment:
  no authoritative CALLS.
unsupported dynamic receiver/factory:
  no authoritative CALLS.
unrelated/counterfactual .record receivers:
  no authoritative CALLS to SignalLedger.record.
ambiguous receiver bindings:
  REFERENCES evidence only; never enters authoritative traversal.
```

The public product call graph was not used as proof of absence for a negative
target when the client could not resolve a separate negative symbol identity.
Absence was established from persisted v4 records, exact source-span reads,
and the focused fail-closed tests. An empty inbound graph was not treated as
proof of no callers.

## Persistence, restart, invalidation, and determinism

The final native harness and sidecar tests established:

```text
fresh build: 279 files, 3311 symbols, 4977 relationship records, 14876 claims
repeat clean relationship digest: 6b0167425bf7abd85d5b8d9e607178dab327327f028449e498d1c65a7f5bb81c
claim digest: efbc54f93d7936968679a5c5a825342ce14e068f737721aa0a13a77a27fbed32
sidecar/navigation reload: successful
controlled mutation: src/python/core/opportunity_ranker.py
full mutation digest == incremental digest: true
missing delta records: 0
extra delta records: 0
source restored: true
```

The restart witness reloaded the same published navigation generation and
returned the same direct edge sets.

## Recreated frozen performance baseline

The baseline was recreated from a clean worktree at the exact checkpoint
commit:

```text
baseline worktree: /home/hamza/repo/satori-worktrees/native-python-l4-baseline-20260725-01
baseline revision: 074bed62f723e8b04ec36f3467417cba632687ae
target revision: 8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7
same Node/pnpm: v24.13.0 / 10.28.2
same harness: /tmp/satori-native-l4-performance-harness.mjs
warmup: one; measured repetitions: three
```

The final comparable measurements were:

| Metric | Baseline | Candidate | Gate | Result |
|---|---:|---:|---:|---|
| relationship-stage median | 29.886162 ms | 545.456508 ms | <= 35.863394 ms | FAIL; 18.2511x |
| peak RSS | 321608 KiB | 600376 KiB | <= 387144 KiB | FAIL; +278768 KiB / +272.234375 MiB |
| one-file delta median | 19.231731 ms | 287.157419 ms | <= 69.231731 ms | FAIL; 14.9314x |
| inbound traversal median | 161.342201 ms | 471.422230 ms | <= 177.476421 ms | FAIL; 2.9219x |

The performance investigation did not stop at the first bad measurement. CPU
profiling identified repeated Python origin/class-base work, claim creation,
and sidecar serialization. Bounded caches and pre-indexed Python facts reduced
the relationship stage from the earlier multi-second candidate run to roughly
0.55 seconds, but the candidate still fails every frozen relative gate. The
baseline was not tuned and no unfavorable samples were discarded.

## Verification commands

```text
focused Core relationship/navigation/sidecar/compatibility tests: exit 0 (100 passed)
Core full test, checkpoint baseline: exit 1 (584 passed, 3 failed, 1 skipped)
Core full test, candidate: exit 1 (592 passed, 3 failed, 1 skipped)
MCP complete affected package: exit 0 (1047 passed, 0 failed, 0 skipped)
owned-file ESLint: exit 0
Core typecheck: exit 0
MCP typecheck: exit 0
Core build: exit 0
MCP build: exit 0
git diff --check: exit 0
candidate-built MCP restart witness: exit 0
```

The three candidate Core failures reproduce the checkpoint exactly by test
name, assertion, and materially equivalent stack/output:

```text
Context bounds deferred atomic publication generations without pruning active authority
  vectorDatabase.queryCalls.length > 0
Context completion validation propagates transient and unavailable payload probes
  expected rejection /temporary count failure/
Context receipt-driven generation proof reuses activation authority and single-flights cold validation
  0 !== 1
```

No native relationship regression was found in the affected package tests.

## Git-status proof

Target repository status before and after the qualification:

```text
## main...origin/main [ahead 1]
 M opencode.jsonc
?? cc.json
```

Those target changes were never staged, edited, or removed. The candidate
worktree was clean after the code commit and will be clean again after the
separate evidence commit. The evidence commit contains only this receipt and
its JSON summary.

## Terminal decision

The authoritative projection defect is closed: the candidate-built MCP
returns the required exact residual and ledger edges and the required three
production `check_entry` edges. Compatibility/reindex behavior, persistence,
determinism, negative controls, and the real MCP publication witness are also
closed for this bounded batch.

The candidate is not L4-pass because all four frozen performance gates fail.
The terminal outcome is therefore:

```text
native_python_performance_blocked
```
