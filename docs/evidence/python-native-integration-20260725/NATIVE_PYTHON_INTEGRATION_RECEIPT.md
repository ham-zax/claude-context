# Native Python relationship integration receipt

Date: 2026-07-25

Decision: `python_inbound_recorded_sites_pass`

Deployment decision: `APPROVE_NATIVE_ABSOLUTE_BUDGETS` for the frozen
repository class only when the Satori runtime has at least 2 GiB available.
The candidate is not approved for a roughly 1 GiB deployment.

## Revisions

| Identity | Revision |
| --- | --- |
| Checkpoint-integrated base | `c07eb3807639810a08f59d2ce73825bc5de8caba` |
| Optimized native source | `b6a7cb17395ad7fedf9021bdee2fb07d40d68356` |
| Optimized evidence | `44f2fa22239aeb6b682b63f738a2dfa6479164ea` |
| Owner-bounded integration | `cbde1a890aa81ebaffaf9deae92eab650ca61bd0` |

The integration commit has parents
`c07eb3807639810a08f59d2ce73825bc5de8caba` and
`44f2fa22239aeb6b682b63f738a2dfa6479164ea`. The CodeQL experiment commit
`cfa9491bdd4c119b96b9ede2524f0e88c4bf1a9f` was not merged.

## Exact integration paths

```text
docs/evidence/python-native-l4-20260725/NATIVE_PYTHON_L4_RECEIPT.md
docs/evidence/python-native-l4-20260725/native-python-l4-summary.json
docs/evidence/python-native-n5-20260725/NATIVE_PYTHON_N5_OPTIMIZATION_RECEIPT.md
docs/evidence/python-native-n5-20260725/native-python-n5-summary.json
packages/core/src/core/context.ts
packages/core/src/core/persisted-index-authority.test.ts
packages/core/src/language-analysis/oxc-adapter.ts
packages/core/src/language-analysis/service.ts
packages/core/src/language-analysis/tree-sitter-adapter.ts
packages/core/src/language-analysis/types.ts
packages/core/src/language-analysis/versions.ts
packages/core/src/navigation/query.test.ts
packages/core/src/navigation/query.ts
packages/core/src/navigation/store.ts
packages/core/src/relationships/builder.test.ts
packages/core/src/relationships/builder.ts
packages/core/src/relationships/index.ts
packages/core/src/relationships/resolution.ts
packages/core/src/symbols/contracts.test.ts
packages/core/src/symbols/contracts.ts
packages/core/src/symbols/sidecar.test.ts
packages/core/src/symbols/sidecar.ts
```

## Correctness and package verification

- Core: 592 passed, 3 failed, 1 skipped. The three failures are the same
  checkpoint-baseline tests and failure classes recorded by the optimized
  candidate; none is owned by the Python relationship change.
- MCP: 1,047 passed, 0 failed.
- Core and MCP typecheck: passed.
- Changed Core TypeScript ESLint: passed.
- Core build and MCP runtime build: passed.
- `git diff --check`: passed.

The clean task-owned publication used the integration-built MCP runtime,
Potion dimension 256, LanceDB, watcher disabled, and the preserved target
materialization at
`/tmp/satori-native-python-l4-target-20260725-lbEBpS`.
After a fresh reindex and process restart, all six required production sites
were present:

```text
src/python/core/opportunity_ranker.py:256
src/python/core/pair_evaluator.py:738
src/python/core/trading_core.py:675
src/python/core/backtest/gate_coordinator.py:475
src/python/core/backtest/phases.py:129
src/python/core/backtest/signal_recording.py:435
```

The restarted runtime returned `status=ok`, retained the completed
publication, and returned no partial-coverage warning for the three target
reads. The relationship and claim digests matched the optimized receipt:

```text
relationship:
6b0167425bf7abd85d5b8d9e607178dab327327f028449e498d1c65a7f5bb81c

claim:
efbc54f93d7936968679a5c5a825342ce14e068f737721aa0a13a77a27fbed32
```

The controlled one-file delta matched a clean full construction:

```text
incremental:
2a26f16a38ab5a28d6022db220ff689713850313b48863ba51686e75cbd6176f

full:
2a26f16a38ab5a28d6022db220ff689713850313b48863ba51686e75cbd6176f
```

Six real MCP syncs completed and the modified source was restored byte-for-byte.

## Performance decision

The accepted absolute ceilings and retained evidence are:

| Metric | Ceiling | Sealed candidate | Integration readback |
| --- | ---: | ---: | ---: |
| Fresh reindex overhead | 10% | 7.52% | Reused; implementation and product inputs unchanged |
| One-file sync p95 | 7,000 ms | 6,397.715 ms | 6,158.006 ms on the bounded rerun |
| Cold `call_graph` p95 | 750 ms | 606.067 ms | 598.286 ms |
| Warm `call_graph` p95 | 25 ms | approximately 9.7–12.3 ms | 11.469 ms |
| Idle MCP RSS | 200 MiB | 151.81 MiB | 150.78 MiB |
| Fresh reindex RSS | 1.25 GiB | 1,193,456 KiB | Reused; implementation and product inputs unchanged |
| Incremental publication RSS | 1.6 GiB | 1,482.76 MiB | 1,447.21 MiB |

The first integration sync repetition measured 7,057.689 ms p95, 57.689 ms
above the ceiling. No code or fixture changed. One predeclared identical rerun
measured 6,158.006 ms p95, while the independent sealed candidate measured
6,397.715 ms. The over-ceiling repetition remains part of the record; the
approval is based on the two independent passing repetitions and is not a
claim that every six-sample run remains below 7 seconds.

The original relative microbenchmark gates remain failed for relationship
construction and frozen-harness RSS. They were not relabelled as passing.
The explicit absolute product-budget decision supersedes them for this bounded
deployment class.

## Compatibility and rollback disposition

- Relationship fingerprint owner:
  `relationship-v9+python-constructor-receivers+python-native-resolution-v1`.
- Relationship contribution schema: `relationship_file_contribution_v4`.
- Existing incompatible relationship evidence returns structured
  `requires_reindex`; it is not silently reused or repaired.
- Vector identity, embedding projection, lexical projection, and public MCP
  response schemas did not change.
- The prior runtime, target materialization, and prior state were retained.
  No native-specific rollback mechanism was added. Runtime rollback requires
  selecting the prior runtime together with its compatible prior relationship
  generation; mixed generations remain rejected.

## Raw integration artifact digests

The bounded raw artifacts remain task-local under
`/tmp/satori-native-integration-witness-20260725`. Their hashes are retained
to prevent later substitution:

```text
fresh.json
155ee6614248bf4a455370bab9f2c63f6d58b52cd453e99732caefeb37b9f386

restart.json
0572efc5c7cfecad141ac77a89518a87d6ae4c437297e2d62602fdbd2805ef38

harness.json
46f79015fd8efe29631e3deeb43c48a94a350b72c1f448ef28ca9786f19b429a

product.json
57752e53489104dead069a7e05c8a2df84371a025a0105844d62ba16c6b721f9

product-rerun.json
3639125857584a5db868926d0463de5ae2314c466e18ce855d7c6592247c9c72
```

## Scope

Qualified:

- exact absolute-import constructor receivers;
- bounded direct service/callback value-origin flow; and
- the recorded ledger value-origin flow.

Still partial and non-exhaustive:

- reflection;
- arbitrary factories;
- collections;
- monkeypatching;
- unbounded alias flow; and
- unsupported or ambiguous Python environments.

An emitted edge may be exact under this static support model. The inbound
result set remains non-exhaustive; absence still requires deterministic
verification.
