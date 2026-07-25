# Core baseline failure adjudication receipt

## Decision

`core_baseline_failures_closed`

The three complete-Core failures were stale test-fixture expectations. Production
generation-proof, publication-retention, and completion-validation behavior was
not changed.

## Identity and scope

- Base revision: `4138b1eba5606a8291b45395f767a46b946070fb`
- Branch: `fix/core-baseline-failures-20260726`
- Worktree:
  `/home/hamza/repo/satori-worktrees/core-baseline-failures-20260726`
- Checkpoint comparison revision:
  `074bed62f723e8b04ec36f3467417cba632687ae`
- Node: `v24.13.0`
- pnpm: `10.28.2`

The work was limited to the three named `Context` tests and their in-memory
vector-database fixture. No production source, Python relationship analysis,
CodeQL artifact, semantic search owner, public MCP schema, checkpoint C1/C2
behavior, or relationship-v9 behavior changed.

## Independent reproduction

Each test was run alone against the unmodified base revision.

| Test | Original failure |
|---|---|
| `Context bounds deferred atomic publication generations without pruning active authority` | `assert.ok(vectorDatabase.queryCalls.length > 0)` received `false`; `queryCalls` was `0`. |
| `Context completion validation propagates transient and unavailable payload probes` | `assert.rejects(..., /temporary count failure/)` reported `Missing expected rejection`. |
| `Context receipt-driven generation proof reuses activation authority and single-flights cold validation` | Expected `queryCalls.length === 1`; actual value was `0`. |

All three ran on Node `v24.13.0` with independent temporary repositories and
task-scoped test state roots.

## First differing owner

The in-memory vector fixture implements the optional exact
`VectorDatabase.countDocuments` capability. Production
`Context.countIndexedPayloadExactly` correctly prefers that capability and uses
bounded `queryDocuments` only for adapters without exact count support.

The three tests still observed or fault-injected `queryDocuments`. Their expected
transition therefore stopped at the fixture boundary:

```text
fixture setup
-> Context requests an exact payload count
-> InMemoryVectorDatabase.countDocuments owns the probe
-> stale test observes or faults queryDocuments instead
-> assertion reports no query call or no propagated query failure
```

Git history confirms that exact-count support was already present at checkpoint
baseline `074bed62f723e8b04ec36f3467417cba632687ae`. The failures were therefore
not introduced by checkpoint C1/C2 or relationship-v9.

## Per-test classification and preserved invariant

### Deferred atomic publication generations

- Classification: stale test expectation.
- Actual transition: the active mutation invalidated the reusable generation
  proof and caused a new exact count through `countDocuments`.
- Preserved invariant: the active readable authority was not pruned, and the
  uncommitted generation was not accepted.
- Correction: observe the exact-count call and assert that the query fallback
  remains unused.

### Transient and unavailable payload probes

- Classification: stale test expectation and stale fault-injection point.
- Actual transition: the original `Context` retained its warm activation proof,
  while the fixture's exact-count capability bypassed `queryHook`.
- Preserved invariant: a cold validation propagates an exact-count transport
  failure; an adapter lacking exact count fails closed when the bounded query
  fallback cannot prove the count.
- Correction: use a restarted cold `Context`, inject the transient failure at
  `countDocuments`, then deliberately remove that optional fixture capability
  for the separate query-only unavailability witness.

### Receipt-driven proof reuse and cold single-flight

- Classification: stale test expectation.
- Actual transition: cold proof used one exact `countDocuments` operation;
  activation-authority reuse used no payload operation; three concurrent cold
  validations shared one exact-count flight.
- Preserved invariant: warm proof reuse, mutation-bound proof invalidation,
  ABA revalidation, and cold single-flight behavior remain unchanged.
- Correction: observe `countDocumentsCalls` while retaining explicit assertions
  that the query fallback is unused.

## Changed files

- `packages/core/src/core/context.test.ts`
- `docs/evidence/core-baseline-failures-20260726/CORE_BASELINE_FAILURES_RECEIPT.md`

## Verification

| Check | Result |
|---|---|
| Three named tests | 3 passed, 0 failed |
| Complete Core package | 596 tests; 595 passed, 1 skipped, 0 failed |
| Complete MCP package | 1,047 passed, 0 failed |
| Core typecheck | passed |
| MCP typecheck | passed |
| Owned-file ESLint | passed |
| Core build | passed |
| MCP build, documentation generation, and manifest generation | passed; no generated diff |
| `git diff --check` | passed |

The final focused witness also proved that all three exact-count paths execute
without invoking the bounded query fallback.
