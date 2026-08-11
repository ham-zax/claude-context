# Satori Hotspot Decomposition Review and Provenance

Date: 2026-08-12

Original review baseline: `6a5ee87680ccc09fc08ef5fe739fb0398e3b9401`

Current reconciliation baseline: `cec0d1425b06ebfe79b5dd2bb52cd0e3a903170c`

Status: durable review provenance for
`docs/plans/SATORI_HOTSPOT_DECOMPOSITION_PLAN.md`. This document records why the
roadmap has its current boundaries and which incident findings are already closed.
It is not implementation authorization.

## Evidence sources

- `docs/superpowers/plans/2026-08-11-ownership-boundary-defects.md` for F021,
  F022, and F050;
- `6a5ee87` for the generation-authority, retrieval-revalidation, and startup
  recovery repairs;
- `e56c973` for F024 restore-journal ownership validation;
- `83fb255` for F023 identity-bound quarantine cleanup;
- `f70f972` for the completed Phase 1.1 gitignore-cache ownership move;
- `7932fa8` for the completed Phase 1.2 pure sidecar-validator extraction;
- `9f77131` for the completed Phase 1.3 stateless synchronizer snapshot-codec
  extraction;
- `cec0d14` for the completed Phase 1.4 CLI install-boundary extraction and packed
  artifact proof;
- focused regressions named below and the package suites recorded with those
  commits.

The earlier external review grouped F062/F066 with F021 without retaining their
standalone definitions in this repository. The roadmap therefore keeps the proven
F021 invariant and does not use F062/F066 as independent execution claims.

## Reconciled finding ledger

| Finding | Definition | Disposition and evidence |
|---|---|---|
| F021 | Deferred retention could delete another in-flight staged publication. | Closed by `6a5ee87`; preserve the staged-publication/reader/retention interleaving regressions. |
| F022 | Product retrieval could disclose candidates after completion authority was withdrawn. | Closed by `6a5ee87`; dense, lexical, and hybrid retrieval revalidate authority before disclosure. |
| F023 | Post-rename staging failure could leave an unowned navigation generation or source checkpoint. | Closed by `83fb255`; both staging owners use identity-bound quarantine cleanup and expose the actual unresolved cleanup path. |
| F024 | Interrupted swapping-journal recovery could displace newer authority. | Closed by `e56c973`; recovery validates phase/state/digest ownership before mutation. |
| F050 | Startup interrupted-index recovery used a provider-free context that could not inspect provider-backed marker state. | Closed by `6a5ee87`; startup recovery uses lazy provider-backed inspection. |
| F067 | The marker-withdrawn interval during in-place mutation was treated as a defect requiring a speculative completion marker. | Not an open defect. The interval is intentional fail-closed availability behavior; any future mutation-intent record is a separate durable contract. |

## Architecture conclusions retained by the roadmap

1. `Context` is currently the broad generation/publication authority and must
   become a compatibility facade incrementally, not through one rewrite.
2. `createGenerationProofCoordinator()` already owns proof state. Future authority
   extraction must re-parent or compose that owner without duplicating its caches or
   flights.
3. `FileSynchronizer` remains the source-checkpoint persistence/comparison owner.
   A future `SourceFreshnessPort` is a narrow interface over evidence, not a second
   mutable checkpoint owner.
4. `SyncManager` and `ManageIndexingHandlers` still depend on broad `Context` today.
   Narrow ports are target-state boundaries, not descriptions of current wiring.
5. The existing `MutationLeaseCoordinator` owns persisted root mutation fencing and
   remains that owner; the roadmap does not need a batch that recreates it.
6. Durable restore transaction mechanics belong to infrastructure; deciding when
   they may alter active authority belongs to the generation-authority owner.
7. The MCP full-index seam is
   `ManageIndexingHandlers.startBackgroundIndexing()`. It mixes MCP lifecycle,
   watcher handoff, Core mutation/publication, rollback, progress, and response
   projection; a future move must separate those responsibilities explicitly.
8. Retrieval-pass execution may be extracted only as ordered labelled outcomes.
   Fusion, filtering, `must:` admission, diagnostics, reranker admission, and
   provider ordering remain with their established owner.
9. CLI mutation, inspection/runtime authority, runtime selection, planning,
   application, and upgrade are separate batches. `install.ts` remains the public
   compatibility facade.

## Execution safeguards retained by the roadmap

- Every batch resolves each stopping condition to exact existing test names and
  commands or declares `new oracle required` before production movement.
- Mutable state moves with all of its mutation methods; no mirrored authoritative
  state is permitted during migration.
- Current and target ownership are stated separately.
- Delegated read-only review runs in an isolated checkout or equivalent
  write-isolated workspace. HEAD and porcelain status are reconciled before and
  after the review; unexpected writes invalidate that review evidence.
- Import/boundary enforcement is added when the target boundary exists, not
  speculatively before it can be expressed.

## Superseded review claims

The following claims were investigated and withdrawn before this reconciliation:

- `startBackgroundIndexing()` is not a nonexistent 768-line workflow; it is the
  real large method beginning near line 1454 of
  `packages/mcp/src/core/manage-indexing-handlers.ts` at this baseline.
- `FileSynchronizer` does have V2/V3 snapshot codec and migration fixtures. Phase
  1.3 may use those fixtures but must resolve their exact names in its batch sheet.
- Existing source-checkpoint evidence types are not themselves the future
  read-facing `SourceFreshnessPort`; their existence does not require moving Phase
  5 ahead of Core authority extraction.
