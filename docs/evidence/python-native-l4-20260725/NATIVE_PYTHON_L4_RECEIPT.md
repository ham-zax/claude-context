# Native Python L4 qualification receipt

Outcome: native_python_l4_pass

This is a current-version qualification artifact for the bounded native Python
relationship implementation. Historical reports, plans, checkpoint semantics,
and the target repository were not edited.

## Identity

| Item | Value |
|---|---|
| Checkpoint baseline | 074bed62f723e8b04ec36f3467417cba632687ae — fix(core): preserve V4 checkpoint authority during repair |
| Original native L3 commit | 1fd06ad4756ff84027674e06e6e5875f9f458249 |
| Transplanted candidate | 797802e757f8b2661de8f71c747ed07561f73535 |
| L4 correction commit | 8d320c1b3f4d398198bad1cd945a93caf1d5bc85 |
| Final native implementation candidate | cff16aca4d406f2f9b2a1fa2900aa14f972ae1ad |
| Candidate branch/worktree | candidate/native-python-l4-20260725 / /home/hamza/repo/satori-worktrees/native-python-l4-20260725 |
| Frozen target | /home/hamza/repo/tradingview_ratio@8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7 |
| Task-owned target materialization | /tmp/satori-native-python-l4-target-20260725-lbEBpS |
| Initial native base | 3764b740d0f55081f98cc33fd4f6236046de8712 |
| Checkpoint Satori source revision | 074bed62f723e8b04ec36f3467417cba632687ae |

The provider-neutral boundary is ResolutionClaim. Satori owns symbol
identity, normalization, publication, traversal, provenance, and completeness
disclosure. Native Python is the only instantiated production provider;
external providers remain an uninstantiated interface.

## Changed files relative to the checkpoint

    M packages/core/src/core/context.ts
    M packages/core/src/language-analysis/oxc-adapter.ts
    M packages/core/src/language-analysis/service.ts
    M packages/core/src/language-analysis/tree-sitter-adapter.ts
    M packages/core/src/language-analysis/types.ts
    M packages/core/src/relationships/builder.test.ts
    M packages/core/src/relationships/builder.ts
    M packages/core/src/relationships/index.ts
    A packages/core/src/relationships/resolution.ts
    M packages/core/src/symbols/sidecar.test.ts
    M packages/core/src/symbols/sidecar.ts

The L4 source correction makes publication source-scoped while retaining the
complete current analysis map as cross-file semantic context. The L4 tests
cover that boundary and an unassigned receiver. No checkpoint repair,
publication authority, MCP checkpoint validation, or review-document file was
changed.

## Runtime and MCP identity

The installed Satori MCP reported runtime 6.3.0, owner satori@6.3.0, writer
PID 1412, and one live owner. The task-owned index was ready with:

    files: 1519
    chunks: 19741
    collection: hybrid_code_chunks_2770b293__gen_run_dd045824_2e78_40ab_ab6c_a49490873ab6
    generation marker: c5363d9d-5282-42ae-9123-5be671fca64c
    indexPolicyHash: 0e19e8c19c7dbc7c7625e297278984859ddffd9276e7ed498d64c391176a4092
    policyDocumentDigest: a82e7dc465ddc4aeef85c63c2515734723f4b6b6150b3c33601a60aecfcc725f
    provider: Potion / minishlab/potion-code-16M-v2@e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b
    dimension/database/schema: 256 / LanceDB / hybrid_v3
    parser/extractor: oxc-0.139.0+web-tree-sitter-0.26.10+vscode-grammars-0.3.1+scala-0.24.0-sha256-b7ec2bb29c19827abcefd18ed5cb5a43596009f96a5d53c5b9d1f9676d7521c3
    relationship runtime: relationship-v8+python-constructor-receivers
    status: ready / completed

Exact operations and fixed query arguments were:

    list_codebases({})
    manage_index({action: "reindex", path: "/tmp/satori-native-python-l4-target-20260725-lbEBpS"})
    search_codebase("lang:python path:src/python must:SignalGenerator must:check_entry")
    search_codebase("lang:python path:src/python must:_evaluate_residual_type_invariant")
    search_codebase("lang:python path:src/python must:SignalLedger must:record")
    search_codebase("lang:python path:src/python must:check_entry check_entry")
    search_codebase("lang:python path:src/python must:_evaluate_residual_type_invariant _evaluate_residual_type_invariant")
    search_codebase("lang:python path:src/python must:record record")
    call_graph(direction="callers", depth=3, limit=100) for each exact target
    call_graph(direction="both", depth=3, limit=100) for each exact target
    read_file(open_symbol=true) for each exact target identity

The reindex response warned IGNORE_POLICY_PROBE_FAILED with
preflight=probe_failed; prescribed status polling continued until ready. A
later search preflight performed a zero-change sync to generation 2 with
added/removed/modified all zero. No further reindex was performed.

The Satori inbound graph was advisory. For all three targets, inbound traversal
returned only the target node, no inbound edges, warning
CALL_GRAPH_INBOUND_COVERAGE_PARTIAL, and the executable must: search hint.
The both traversal for SignalGenerator.check_entry additionally exposed three
outbound edges to _map_dual_mi_to_intent, _map_mi_to_intent, and
_apply_meta_filter; it did not expose authoritative inbound edges. Exact
Satori read_file spans and the deterministic native build below are the
qualification evidence.

## Complete authoritative target enumeration

The native build produced exactly three, two, and two authoritative inbound
edges for the three target symbols. The first six rows are the required
positive matrix; the last row is a valid additional caller.

| Target | Caller / source ID / source span | Target ID | Ordered proof steps | Dependency keys |
|---|---|---|---|---|
| SignalGenerator.check_entry | OpportunityRanker.rank / syminst_81bf00a45cc16be4bd2cf289abc309ee / src/python/core/opportunity_ranker.py:256–261, bytes 9560–9750 | syminst_db0684c3f6f05b6df0addc5c3cb17e8e | call_site → containing_caller → constructor_origin(SignalGenerator) → flow_hop(self.signal_gen,1) → field_origin(self.signal_gen) | src/python/core/opportunity_ranker.py:4364:4410:self.signal_gen |
| SignalGenerator.check_entry | _compute_entry_decision / syminst_deceb42dfbb753758536f4d4967acac8 / src/python/core/pair_evaluator.py:738–743, bytes 28755–28957 | same | call_site → containing_caller → constructor_origin(SignalGenerator) → flow_hop(signal_gen,1) → allocation_origin(signal_gen) | src/python/core/pair_evaluator.py:28491:28536:signal_gen |
| SignalGenerator.check_entry | TradingCore._evaluate_entry_authority_and_post_signal / syminst_d3d8cfbb7bb9c88406e2ca10618544a7 / src/python/core/trading_core.py:675–682, bytes 25582–25910 | same | call_site → containing_caller → constructor_origin(SignalGenerator) → flow_hop(self.signal_generator,1) → field_origin(self.signal_generator) | src/python/core/trading_core.py:9138:9215:self.signal_generator |
| BacktestEngineGateRuntimeApiMixin._evaluate_residual_type_invariant | evaluate_bar_entry_gate_stack / syminst_5ba8f6c2246ea628bfb350f8a85ca28d / src/python/core/backtest/gate_coordinator.py:475, bytes 17603–17661 | syminst_5aaccd6ad2e7203a385dbce56e6a9861 | call_site → containing_caller → parameter_annotation(services:GateStackServices) → allocation_origin(GateStackServices._evaluate_residual_type_invariant) → allocation_origin(self) → flow_hop/callback(run_backtest_simulation.engine,1) → flow_hop/callback(build_gate_stack_services.engine,2) → field_origin → flow_hop/allocation(...,3) | src/python/core/backtest/engine.py:24069:25003:run_backtest_simulation.engine; src/python/core/run_coordinator.py:14322:14362:build_gate_stack_services.engine; src/python/core/backtest/gate_coordinator.py:2052:2794:GateStackServices._evaluate_residual_type_invariant |
| BacktestEngineGateRuntimeApiMixin._evaluate_residual_type_invariant | process_pending_execution_phase / syminst_03fa3dcbb31cbb16085af4eb0b58d3ed / src/python/core/backtest/phases.py:129, bytes 4787–4837 | same | call_site → containing_caller → parameter_annotation(services:PendingExecutionPhaseServices) → allocation_origin(PendingExecutionPhaseServices._evaluate_residual_type_invariant) → allocation_origin(self) → flow_hop/callback(run_backtest_simulation.engine,1) → flow_hop/callback(build_pending_execution_phase_services.engine,2) → field_origin → flow_hop/allocation(...,3) | src/python/core/backtest/engine.py:24069:25003:run_backtest_simulation.engine; src/python/core/run_coordinator.py:14095:14148:build_pending_execution_phase_services.engine; src/python/core/backtest/phase_services.py:2461:3157:PendingExecutionPhaseServices._evaluate_residual_type_invariant |
| SignalLedger.record | record_signal_event / syminst_7e54780bc1fa02fdd11e8dcf6c440950 / src/python/core/backtest/signal_recording.py:435–462, bytes 15471–16436 | syminst_10e3a141c4858369056b1655a60bb999 | call_site → containing_caller → parameter_annotation(services:SignalRecordingServices) → allocation_origin(SignalRecordingServices.signal_ledger) → constructor_origin(SignalLedger) → flow_hop(engine.signal_ledger,1) → field_origin(engine.signal_ledger) → flow_hop(SignalRecordingServices.signal_ledger,2) → allocation_origin(SignalRecordingServices.signal_ledger) | src/python/core/backtest/engine_init.py:2991:3113:engine.signal_ledger; src/python/core/backtest/runtime_state.py:1477:1613:engine.signal_ledger; src/python/core/backtest/signal_recording.py:1851:2518:SignalRecordingServices.signal_ledger |
| SignalLedger.record — valid additional caller | _record_shadow_suppression / syminst_be889acccf17f0a3ef3b3b28f2e9631e / src/python/core/shadow_runner.py:550, bytes 20907–20928 | syminst_10e3a141c4858369056b1655a60bb999 | call_site → containing_caller → parameter_annotation(ledger:SignalLedger) | none |

All rows are decision=resolved, relationshipType=CALLS, provider
satori-native-python, version bounded-origin-v1, environment
python-native-resolution-v1, and bounded flowHops. No unexplained or wrong
authoritative extra edge was found.

## Required negatives

| Control | Evidence/result |
|---|---|
| self.hurst_gate.check_entry | decision=ambiguous, relationshipType=REFERENCES, no target and no authoritative record; dependency src/python/core/trading_entry_vetoes.py:2813:2861:self.hurst_gate:check_entry. |
| Same-name unrelated methods | No authoritative CALLS; focused ambiguous-same-name test passed. |
| Conflicting reassignment | SignalGenerator() → OtherGenerator() → check_entry() produced no authoritative edge. |
| Use before assignment | before.check_entry() produced no authoritative edge. |
| Unsupported dynamic flow | factory = make_generator(); factory.check_entry() produced no authoritative edge. |
| Unrelated/counterfactual .record receivers | No authoritative edge to SignalLedger.record; complete enumeration contains only the required ledger caller and valid typed shadow caller. |
| Ambiguous receiver | Advisory REFERENCES only; no ambiguous target enters authoritative CALLS. |

The controlled mutation changed the known positive
self.signal_gen.check_entry(...) to self.hurst_gate.check_entry(...). Before
mutation it resolved to SignalGenerator.check_entry; after mutation it was
ambiguous REFERENCES with no record. The frozen source digest remained
7d0a0a452889b4d78edc4594bc09c5c62b5f9a1ff72eeba5c734a0c9b048293a.

## Persistence and incremental equivalence

    clean snapshot: 279 files, 3311 symbols, 4977 records, 14876 claims
    record digest: 5f612be1e1090a336bedc25c33dae6a1ee2a93afab6e6a6cbdff3b4052f31492
    claim digest:  11c42e343aa9b7501be35e42291e739c14ff442338e5763e1b36642638ac6fdb
    repeat records/claims: identical
    symbol manifest: symmanifest_15e17bc6250a5fba52399825bd0ecb0f
    relationship manifest: a8a6709d8bd53146c02b5064a53d067199d336dfca4dafab992bf8392f714e8f
    in-process reload: status=ok, record digest identical, 4977 records
    child-process reload: status=ok, record digest identical, 4977 records, 3311 symbols

The sidecar focused suite additionally compared ordered proof steps and
dependency keys, including unresolved and ambiguous claims.

Controlled one-file mutation:

    file: src/python/core/opportunity_ranker.py
    full mutated digest: 2c8a030831a4343da104a152e06efacbabb871c2c693c1ecfe13e84e33f4e316
    delta digest:        2c8a030831a4343da104a152e06efacbabb871c2c693c1ecfe13e84e33f4e316
    equal: true
    missing in delta: 0
    extra in delta: 0
    delta relationship-stage time: 5307.841279 ms
    source restored: true
    source digest before/after: 7d0a0a452889b4d78edc4594bc09c5c62b5f9a1ff72eeba5c734a0c9b048293a

The correction retains complete current analysis context while limiting
re-emission to affected source files. This removes the observed partial-map
incremental mismatch without adding name or suffix inference.

## Performance

    analysis ms: 2793.813466 / 2706.620484
    relationship ms: 14375.471847 / 13878.353553
    RSS after run: 302784512 / 347209728 bytes
    final process RSS: 483307520 bytes
    one-file delta relationship stage: 5307.841279 ms

The checked relationship/navigation plan publishes correctness and identity
gates but no numeric relationship-stage, relationship-memory, or inbound
traversal budget. The separate Potion embedding plan's one-second publication
target is not a native relationship-stage budget and was not silently applied.
Measurements are retained; no threshold was invented or revised after the
result.

## Compatibility decision

    RELATIONSHIP_BUILDER_VERSION: relationship-v8+python-constructor-receivers
    relationship contribution schema: relationship_file_contribution_v3
    relationship manifest: binds registry manifest, builder version, file shards,
      source evidence, and snapshot identity; mismatches are not reused
    Python environment-analysis digest: python-native-resolution-v1
    publication generation: separate from environment identity
    navigation/reindex: old builder/schema/extractor identities require a fresh
      compatible registry/relationship generation; exact target instance changes
      and persisted dependency keys invalidate dependent contributions
    symbol extractor: language-analysis-v15+oxc-0.139.0+web-tree-sitter-0.26.10+
      vscode-grammars-0.3.1+scala-0.24.0-sha256-b7ec2bb29c19827abcefd18ed5cb5a43596009f96a5d53c5b9d1f9676d7521c3

## Commands and exit codes

    pnpm install --frozen-lockfile --offline                                      0
    pnpm --filter @zokizuan/satori-core exec tsc --noEmit --pretty false         0
    pnpm --filter @zokizuan/satori-core exec eslint src/relationships/builder.ts src/relationships/builder.test.ts  0
    pnpm --filter @zokizuan/satori-core exec tsx --test src/relationships/builder.test.ts  0 (28 passed)
    pnpm --filter @zokizuan/satori-core exec tsx --test src/symbols/sidecar.test.ts  0 (44 passed)
    pnpm --filter @zokizuan/satori-core exec tsx --test src/language-analysis/service.test.ts  0 (60 passed)
    pnpm --filter @zokizuan/satori-core test                                  1 (590 passed, 3 baseline failures, 1 skipped)
    git diff --check                                                           0
    native relationship/restart/incremental runner                               0

The three Core failures matched the checkpoint by exact name, assertion, and
materially equivalent stack/output:

    Context bounds deferred atomic publication generations without pruning active authority
      vectorDatabase.queryCalls.length > 0
    Context completion validation propagates transient and unavailable payload probes
      expected rejection /temporary count failure/
    Context receipt-driven generation proof reuses activation authority and single-flights cold validation
      0 !== 1

They are checkpoint baseline failures, not native relationship regressions.

## Git-status proof

The transplanted candidate was clean before L4 edits. The candidate worktree
was clean after the two implementation/test commits; this receipt is the only
new owned evidence change until its separate evidence-seal commit.

The target repository was preserved exactly. Initial and final target status:

    ## main...origin/main [ahead 1]
     M opencode.jsonc
    ?? cc.json

Those pre-existing target changes were never staged, edited, or removed.
