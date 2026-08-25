# Agent A2 — Publication Descriptor as Policy/Marker Authority

**Repository:** `/home/hamza/repo/satori`
**Artifact type:** executable
**Workspace:** current checkout `/home/hamza/repo/satori`
**Can start:** immediately after Task 4A integration acceptance
**Depends on:** Tasks 0, 1, 2, 3, 4, and 4A complete and integration-reviewed in the current working tree
**Execution lifetime:** ordinary bounded coding mission

## Read first

- `AGENTS.md` if present.
- `docs/plans/SATORI_ARCHITECTURE_SIMPLIFICATION_CLEAN_BREAK_PLAN.md`, especially Task 5 and the clean-break rules.
- `docs/superpowers/agent-plans/2026-08-20-architecture-simplification-clean-break/README.md`.
- Inspect the current production authority path before editing, especially:
  - `packages/core/src/generation/publication-store.ts`;
  - `packages/core/src/generation/contracts.ts`;
  - `packages/core/src/generation/index-generation-workflow.ts`;
  - `packages/core/src/generation/index-authority-coordinator.ts`;
  - `packages/core/src/core/context.ts`;
  - `packages/core/src/core/persisted-index-authority.ts`;
  - `packages/core/src/policy/index-policy-document-store.ts`;
  - `packages/core/src/policy/index-policy-runtime-service.ts`;
  - `packages/core/src/core/index-policy-input-observer.ts`;
  - vector control-record/completion-marker code;
  - MCP readiness/completion-proof and read-identity callers that still depend on marker or policy-document identity.

## Objective

Own Task 5 only: make the immutable current `Publication` descriptor the durable authority for effective index policy, index/vector format compatibility, vector collection identity, and Publication navigation identity.

Delete the parallel durable policy-document / completion-marker proof graph as current authority. Preserve the one useful live safety boundary: repository selection controls are observed and revalidated, and a control change that can alter the searchable set fails closed for new-read admission until a fresh Publication is built.

Target mental model:

```text
repository selection controls + explicit manage_index policy inputs
        |
        v
observe effective policy
        |
        v
build immutable Publication N+1
  policy: complete effective policy snapshot
  format: current-only compatibility identity
  vector: exact collection identity/counts
  navigation: Publication-local relationship/symbol JSON
        |
 final source + selection-control revalidation
        |
        v
PublicationStore.activate(N+1)
        |
        +--> current authority for new reads
        +--> process-local runtime policy reconstructed from Publication
```

There must be no second policy file or vector completion marker whose digest/hash/run ID is required to prove which Publication is current.

## Accepted baseline

Tasks 0–4A are accepted on:

```text
branch: integrate/language-spine-cbm-go
HEAD:   86393ae334adba8213ae33bec6cb9c353482577e
```

Task 4A integration review observed the accepted aggregate:

```text
76 tracked files changed
3159 insertions
12179 deletions
staged files: 0
changed test files: 0
```

Accepted untracked Core owners remain:

```text
packages/core/src/generation/publication-store.ts
packages/core/src/generation/root-mutation-coordinator.ts
```

Preserve the accepted working tree. Do not revert, stash, stage, commit, reset, clean, rename, rewrite, or replace prior work.

Task 4A is closed with one persisted graph representation: Publication-owned relationship navigation. The old v3 MCP call-graph owner is deleted, and legacy `callGraphSidecar` snapshot metadata is scrubbed on current decode/load-save.

## Live Task 5 ownership map

The source plan is authoritative, but the current tree has several concrete seams that matter for a complete clean break.

1. `Publication` already contains a minimal durable policy/format shape, but its policy snapshot currently stores only:
   - profile;
   - supported extensions;
   - effective ignore patterns;
   - control signature.

   `ResolvedIndexPolicy` also carries user-supplied `customExtensions` and `customIgnorePatterns`. Incremental policy resolution currently inherits those from the durable policy document/runtime cache. A process restart would lose those explicit user inputs if the policy document is simply deleted. Task 5 must make the Publication policy snapshot sufficient to reconstruct the active effective policy, including user-supplied custom extension/ignore inputs needed by later incremental reconciliation.

2. `IndexPolicyRuntimeService.loadCustomIndexPolicy()` currently reads `satori_index_policy_v5`, validates it through `persisted-index-authority.ts`, activates runtime custom policy, and records a policy document digest. This durable document must stop being authority. Runtime policy state should be hydrated from the selected Publication plus current live control observation, not from a second durable policy file.

3. `IndexPolicyDocumentStore` owns atomic policy-file persistence/removal/tombstones. Delete it after callers migrate. If `IndexPolicyMutationCoordinator` has no legitimate production owner after the policy file is gone, do not keep it merely for compatibility; however, do not pull the broader Task 6 restore-transaction deletion into this mission.

4. `persisted-index-authority.ts` still owns:
   - completion marker schemas/readers;
   - current/retired fingerprint parsing;
   - policy document V3/V4/V5 parsing;
   - policy document digest/hash construction;
   - `CanonicalPublicationBinding` / policy-navigation binding proof structures.

   Task 5 should delete this owner after current callers migrate. Do not move the same proof graph to a new file.

5. Full index currently stages the real Publication, but before `PublicationStore.activate()` it still:
   - writes a vector completion marker;
   - reads that marker back;
   - builds a legacy `CanonicalPublicationBinding`;
   - captures durable legacy authority;
   - publishes the durable policy document/runtime binding.

   Atomic sync performs the same legacy authority switch before activating the new Publication. Remove that pre-activation authority transaction. Candidate failure before the Publication pointer swap should leave the previous Publication current without needing a policy/marker rollback.

6. `IndexAuthorityCoordinator` and `Context` still prove current authority by combining:
   - published runtime policy/binding maps;
   - policy document digest/file token;
   - completion marker equality;
   - completion fingerprint compatibility;
   - exact vector payload observations;
   - navigation proof.

   Task 5 must make the current Publication descriptor the starting authority. Do not preserve policy-document digest or completion-marker comparison as a requirement for current-read admission.

7. `Context.getIndexCompletionMarkerForValidation()` and MCP `completion-proof.ts` still expose/read completion-marker-centric evidence. Task 7 owns deleting the broad prepared receipt/read-session architecture, but Task 5 must migrate enough of this seam that current authority/readiness no longer requires loading or validating a completion marker or policy document. Keep only the smallest transitional receipt/proof shape that current Task-7-era callers still require, and make any surviving marker-like backend diagnostic explicitly non-authoritative and Publication-ID keyed.

8. `ProvenVectorGenerationReceipt`, `ProvenGenerationReceipt`, MCP prepared-read cache identity, search result-set identity, entrypoint owner evidence, and maintenance/status paths still carry `policyDocumentDigest`, marker run ID, marker policy hash, or equivalent policy/marker identity. Task 5 removes policy-document digest from publication/read identity. Migrate direct callers now; do not leave a compatibility alias. Task 7 may later delete the receipt/session containers themselves.

9. The current `Publication.format` already points toward the Task 5 target: `indexFormatVersion`, embedding identity, and relationship version. Prefer that current-only format compatibility contract over the old completion-marker fingerprint family. Do not preserve V1/V2/V3 marker/fingerprint compatibility readers. A relationship/data-format mismatch should require a fresh Publication.

10. Task 3 already established the selection-policy safety boundary: final control-signature revalidation immediately before activation and an independent fail-closed new-read admission check against the current Publication. Preserve that behavior. Do not move policy controls into `source.json` and do not mutate an existing Publication when `.satoriignore`, `.gitignore`, or repo config changes.

## Ownership

You own the Task-5-specific migration of:

- the `Publication.policy` descriptor to a complete current effective policy snapshot;
- runtime policy hydration/reconstruction from the current Publication;
- current selection-policy compatibility/admission against live repository controls;
- full-index and atomic-sync removal of the legacy policy/marker authority switch;
- deletion of `packages/core/src/policy/index-policy-document-store.ts` after callers migrate;
- deletion of `packages/core/src/core/persisted-index-authority.ts` after callers migrate;
- completion-marker/vector-control-record removal or reduction to a strictly non-authoritative Publication-ID-keyed diagnostic if a concrete current need remains;
- removal of policy-document digest and marker run ID from current Publication/read identity;
- migration of direct Core/MCP callers that otherwise still require policy-document/marker authority;
- current-only format compatibility using the Publication descriptor;
- Task-5-specific public/export/fixture synchronization required by the deletions.

Neighboring missions own:

- **Task 6:** deletion of the remaining multi-file durable restore/rollback transaction module and clear-path transaction machinery;
- **Task 7:** broad replacement/deletion of `Proven*Receipt`, generation proof caches/flights, prepared-read session/cache architecture, and direct adoption of Publication leases across normal reads;
- **Task 8:** SnapshotManager deletion and status/tracked-root reconstruction from real owners;
- **Task 9+:** broad pass-through port/public-surface/collection-GC cleanup.

Do not start those missions merely because Task 5 makes some of their machinery obviously obsolete.

## Coordination contract

### Publication policy is sufficient after restart

After Task 5, a process must be able to select the current Publication and recover the active policy inputs needed for incremental reconciliation without reading a separate policy document.

Preserve explicit user `manage_index` custom extensions and custom ignore patterns inside the immutable Publication policy snapshot. Do not silently collapse them into only the already-expanded extension/ignore lists if doing so prevents correct inheritance for a later sync.

### One activation authority

Full index and changed-source atomic sync must build all immutable candidate state privately, perform the final source and policy-control checks, then activate with `PublicationStore.activate()` as the authority switch.

Do not publish a policy document or authoritative completion marker before that pointer swap. Do not create a replacement multi-file transaction.

### Selection-policy drift remains fail closed

Changing `.satoriignore`, `.gitignore`, or the repository profile/config after activation must not modify Publication bytes. New reads must refuse admission when the live selection controls no longer match the Publication's accepted selection signature and the difference can change the searchable set.

Existing in-flight Publication/read behavior must retain the current fail-closed semantics appropriate to the still-existing Task-7 read layer.

### Completion marker is not authority

Prefer deleting the completion marker and its control record entirely if no concrete non-authoritative need remains. If a backend-local diagnostic record is genuinely still useful, it must be keyed to Publication ID and must not be consulted to decide which Publication is current, whether its policy is authentic, or whether navigation belongs to it.

Do not retain V1/V2/V3 marker readers, migration, retired ownership parsing, run-ID identity, marker fingerprint proof, or remote-marker authority recovery.

### Current-only format compatibility

Use the current Publication format descriptor as the compatibility boundary. Old relationship/fingerprint formats are disposable derived state and require reindex. Do not add legacy adapters.

### Preserve Task 6/7/8 boundaries

Task 5 may stop invoking legacy rollback because it no longer switches legacy authority before Publication activation, but do not delete the whole `restore-transaction.ts` subsystem in this mission unless the source plan's Task-5 success conditions literally cannot be reached otherwise. Leave its broad deletion/clear recovery cleanup for Task 6.

Similarly, migrate Task-7-era receipt/cache callers only as far as required to remove policy/marker authority. Do not prematurely redesign all normal reads around Publication leases; Task 7 owns that coherent migration.

SnapshotManager remains until Task 8.

## Success conditions

Task 5 is complete when all are true:

1. The immutable Publication contains enough policy state to reconstruct the active effective index policy after restart, including explicit user custom extension/ignore inputs needed by incremental reconciliation.
2. Current authority can be resolved from `PublicationStore.current` + the Publication descriptor without loading a durable policy document or vector completion marker.
3. Full index and atomic sync perform final source/control revalidation and use `PublicationStore.activate()` as the only authority switch; no authoritative policy/marker publication occurs before activation.
4. `IndexPolicyDocumentStore` has zero production ownership and is deleted.
5. `persisted-index-authority.ts` has zero production ownership and is deleted; its policy V3/V4/V5 and marker V1/V2/V3 compatibility readers are not relocated.
6. `policyDocumentDigest` and completion-marker run ID/fingerprint are absent from current Publication/read identity. No compatibility aliases remain.
7. Runtime policy hydration after restart comes from the current Publication and current repository controls, not a second durable policy file.
8. Incremental reconciliation with no new explicit policy override inherits the active Publication's custom extensions/custom ignores correctly.
9. Selection-control drift still fails closed for new read admission without modifying immutable Publication bytes.
10. The current compatibility decision uses the Publication's current-only format descriptor; relationship/data-format incompatibility requires a fresh Publication rather than legacy promotion.
11. Any surviving vector control record is demonstrably non-authoritative and Publication-ID keyed; otherwise completion-marker control records are deleted.
12. Task 3 source/durability/synchronizer behavior, Task 4 Publication-local navigation, and Task 4A single relationship graph remain intact.
13. Task 6 restore module, Task 7 broad read-lease migration, and Task 8 SnapshotManager deletion are not silently absorbed into this mission.

## Required direct non-test validation

Testing is not authorized. Do not create, modify, delete, or run tests. Do not run package typecheck, build, broad package suites, or release checks.

After the candidate final state, gather focused non-test evidence only:

1. Static trace of complete full index:
   observed policy + source -> candidate vector/source/navigation/Publication -> final source/control checks -> `PublicationStore.activate()`.
   Prove there is no earlier authoritative policy/marker switch.
2. Static trace of changed-source atomic sync with the same one-switch property.
3. Direct Publication round-trip showing custom extensions/custom ignores survive write/read and can reconstruct/inherit the active policy for incremental reconciliation after a fresh runtime/context setup or equivalent process-local reset.
4. Direct selection-control drift exercise: after activating a Publication, change a repository selection control and show new-read admission fails closed while the Publication descriptor bytes remain unchanged.
5. Production searches proving no current durable policy document owner/read/write/digest authority remains.
6. Production searches proving no legacy completion-marker reader/writer/schema/fingerprint/run-ID authority remains. If a diagnostic control record survives, identify every caller and prove it is not used for authority/read admission.
7. Production searches proving no `policyDocumentDigest` remains in current read/publication identity and no old compatibility alias was introduced.
8. Production trace showing current vector collection/navigation/policy identity comes from the selected Publication.
9. Production search showing `observeIndexPolicyInputs()` / live control-signature observation still exists and is used at build/final admission boundaries.
10. Current-format compatibility trace using `Publication.format` or the smallest equivalent current descriptor.
11. If public Core declarations change, run the repository's existing non-test published-surface collector and synchronize the fixture rather than restoring deleted aliases.
12. `git diff --check`.
13. Output-based whitespace/final-newline checks for the accepted untracked Core owners.
14. Changed-test-file count remains zero.
15. Staged-file count remains zero.
16. Inspect the complete final production diff once after the final production edit.

## Out of scope

- Do not start Task 6's wholesale restore/journal deletion.
- Do not start Task 7's full Publication-lease/read-session rewrite.
- Do not delete SnapshotManager or interrupted-index lifecycle state; Task 8 owns that.
- Do not perform Task 9 broad port/public-surface cleanup except declarations directly invalidated by Task 5.
- Do not redesign collection naming/GC; Task 10 owns that.
- Do not touch the Go `calls_v0` plan.
- Do not edit coordination files.
- Do not create worktrees, branches, commits, stashes, staging operations, resets, or history rewrites.

## Integration continuation findings

The first Task 5 completion report is **not yet accepted**. Live integration review found two Major defects that must be fixed without expanding into Task 6/7/8.

1. **The shipped Core test-adapter source still depends on the deleted vector control-record API.**

   `packages/core/src/vectordb/test-adapter.ts` is included by `packages/core/tsconfig.json` (`src/**/*`) and is exported from `packages/core/src/vectordb/index.ts`, which is re-exported by the main Core barrel. It still imports the now-deleted `VectorControlRecord` type from `./types` and still declares `insertControl()`, `getControl()`, and `deleteControl()` methods. `VectorControlRecord` no longer exists. This is a production compilation/public-surface defect, not merely a stale `.test.ts` contract.

   Fix the production adapter to match the current `VectorDatabase` interface. Do not restore `VectorControlRecord` or the deleted control-record methods just to satisfy stale tests. Test-source migration remains separately deferred.

2. **MCP `completion-proof.ts` parses the Core Publication validation evidence with the wrong shape.**

   `Context.getCurrentPublicationForValidation()` returns `publication: PublicationRef`, whose shape is `{ id, publication: Publication }`. `parseValidatedPublication()` currently requires `value.canonicalRoot` at the `PublicationRef` level, even though the root is `value.publication.canonicalRoot`. It also expects `value.publication.navigation` to contain `publicationId` and manifest hashes, but the immutable descriptor only contains `{ relativeRoot: 'navigation' }`; manifest/root evidence is carried separately by `navigationProof` / `generationReceipt`.

   Direct integration reproduction against the current parser returned `stale_local / invalid_payload` for a valid PublicationRef-shaped evidence object. Even artificially adding a top-level `canonicalRoot` still returned `invalid_payload` for a complete Publication because of the incorrect navigation shape. This reaches `tracked-root-readiness`, `list_codebases`, `manage_index`, and interrupted-index recovery through the live `validateCompletionProof()` callers.

   Fix the transitional parser to consume the actual Task-5 Core evidence contract: descriptor identity from the nested Publication, and navigation proof metadata from the separate proof/receipt evidence. Do not add duplicate fields to `PublicationRef` or expand the immutable `Publication.navigation` descriptor merely to satisfy the MCP parser. Keep the broad receipt/session replacement for Task 7.

After both fixes, rerun the Task-5 direct validation. In addition, remove the now-dead `maintainCompletionMarker: true` option still passed from MCP sync and update direct Task-5 debug/response literals such as `completionProof: "marker_doc"` to truthful Publication terminology where they describe this removed marker authority. Do not rename or redesign the whole completion-proof/readiness subsystem; Task 7 owns that broader cleanup.

### Second continuation finding from live integration review

The continuation above closed both original Majors. Independent review reproduced valid complete and partial `validateCompletionProof()` results, confirmed the exported vector test adapter no longer references the control-record API, and confirmed `maintainCompletionMarker` / `marker_doc` production residue is gone. One Task-5 integration Major remains before Task 6 can start.

3. **MCP still carries retired navigation-proof statuses that no longer exist in the current Core contract.**

   Task 5 replaced the old `NavigationGenerationProof` with `PublicationNavigationProof`. The current source contract in `packages/core/src/generation/contracts.ts` allows only `valid`, `not_bound`, `missing`, `incompatible`, and `corrupt`. However:

   - `packages/mcp/src/core/completion-proof.ts` still admits `requires_reindex` and `unsupported` in `parseNavigationStatus()` even though its declared `NavigationProofStatus` is derived from `PublicationNavigationProof['status']`;
   - `packages/mcp/src/core/prepared-read-cache-owner.ts` still compares `proof.navigationProof.status` against `requires_reindex` and `unsupported`;
   - `packages/mcp/src/core/search-request-coordinator.ts` still performs the same impossible comparisons in two continuation/revalidation paths.

   This mismatch is temporarily masked by stale `packages/core/dist` declarations, which still contain the pre-Task-5 wider status union because this mission intentionally did not build. `packages/mcp/tsconfig.json` references `../core`, so a normal clean/project build will first regenerate Core declarations from the current source contract and then type-check MCP against the narrowed union. Do not widen `PublicationNavigationProof` again or preserve the old statuses as compatibility. Remove the retired navigation-status branches from MCP and keep whole-Publication `requires_reindex` handling at the existing top-level Publication validation evidence boundary.

   Required direct non-test verification for this continuation: source searches must show no `requires_reindex` / `unsupported` comparisons on `PublicationNavigationProof` / `navigationProof.status`, and `parseNavigationStatus()` must accept only the current Core status union plus its local `unverified` fallback. Re-run the complete/partial proof reproduction and the existing Task-5 static gates. Do not run typecheck/build solely to prove this finding; the mission's validation boundary remains unchanged.

### Final integration acceptance

The final continuation closed this finding. Live review confirmed that `parseNavigationStatus()` accepts only `valid`, `not_bound`, `missing`, `incompatible`, and `corrupt`; the prepared-read and search-continuation paths no longer compare `PublicationNavigationProof.status` against retired `requires_reindex` / `unsupported`; complete and partial Publication proof reproductions both return valid; and the separate top-level Publication `requires_reindex` result remains intact. Task 5 is complete / verified and Task 6 is the next frontier.

## Working style

Use Causal Coding and Ponytail principles. Trace the real authority/readiness path before deleting it. Prefer making the existing Publication descriptor sufficient over inventing a new policy owner, proof token, digest document, compatibility layer, or background reconciliation mechanism.

This is a clean break for derived local state. Unsupported or missing old policy/marker formats require reindex; they do not justify migration or recovery code.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. workspace, branch, HEAD, tracked aggregate, staged count, changed-test count, and confirmation of no Git history/worktree operations;
3. final Publication policy/format contract;
4. durable policy document / persisted-authority files and contracts deleted;
5. completion-marker/control-record outcome and why any survivor is non-authoritative;
6. final full-index and atomic-sync activation flow;
7. runtime policy reconstruction and custom extension/ignore inheritance flow after restart;
8. selection-policy drift/new-read admission behavior;
9. transitional Task-7 receipt/readiness adjustments made without starting the broad lease rewrite;
10. current-only format compatibility behavior;
11. direct non-test validation actually performed and results;
12. confirmation Tasks 0–4A, Task 6+, SnapshotManager, Go, and coordination boundaries were preserved;
13. unresolved risks/blockers before Task 6.
