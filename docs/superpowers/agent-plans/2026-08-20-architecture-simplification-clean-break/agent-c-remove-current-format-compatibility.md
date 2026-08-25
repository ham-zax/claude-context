# Agent C — Remove Current-Format-Obsolete Compatibility and Version Machinery

**Repository:** `/home/hamza/repo/satori`
**Artifact type:** executable behavior + configuration/metadata + current documentation
**Workspace:** current checkout
**Isolation reason:** none; Wave 13 has one implementation writer
**Can start:** immediately after Task 10 integration acceptance
**Depends on:** Tasks 0–10 complete / verified
**Execution lifetime:** ordinary bounded coding mission
**Wake strategy:** none
**Developer visibility:** headless

## Read first

- `docs/plans/SATORI_ARCHITECTURE_SIMPLIFICATION_CLEAN_BREAK_PLAN.md` — Task 11 is authoritative.
- `docs/superpowers/agent-plans/2026-08-20-architecture-simplification-clean-break/README.md` — accepted architecture, dirty-tree baseline, dependency state, and validation policy.
- `AGENTS.md` — repository ownership/scope rules.
- The current production callers for every compatibility seam named below. The live tree is authoritative if an old source-plan path has already disappeared.

Do not depend on conversational context from Agent A/A2/B. Tasks 0–10 are preserved in the current live working tree and summarized below.

## Objective

Own **Task 11 only**: remove compatibility/version machinery whose only remaining purpose is to preserve pre-clean-break authority formats or old call/config shapes after Tasks 0–10 established the final current architecture.

This is a clean-break contraction, not a generic “delete everything called legacy/v1/v2” sweep.

The target is:

```text
one current Publication contract
one current search diagnostics argument: debugMode
one observation-only watcher configuration contract
one intentional Core product/integration surface
fresh reindex for unsupported pre-clean-break local state
```

Delete obsolete compatibility readers, aliases, ignored inputs, dead migration-only helpers, and current-facing documentation that still advertises them. Preserve current product identities, current wire/schema versions, current installer/runtime protocols, and historical evidence unless the caller trace proves they exist only for the retired architecture.

## Accepted architecture you inherit

Tasks 0–10 are complete and integration-reviewed. Preserve these facts:

- Forensic repair/salvage authority is gone. Source divergence uses sync; incompatible/lost authority requires reindex.
- `PublicationStore.current.json` is the single durable current selector.
- Each immutable Publication owns its exact vector collection identity, `source.json`, captured policy/format, and JSON navigation/relationships.
- Full index and atomic LanceDB sync build private candidates and activate one Publication atomically.
- Completion markers, persisted policy authority, vector control records, navigation current/seal authority, SQLite navigation shadow storage, and the duplicate MCP call-graph sidecar are gone.
- Multi-file rollback/restore journals are gone. Clear is selector-first and never restores current authority after physical cleanup failure.
- Ordinary reads atomically select and pin one immutable Publication through `acquireCurrentRead(root)`.
- SnapshotManager and its V1/V2/V3 durable lifecycle database are gone.
- `RootMutationRuntime` owns the Core writer-operation boundary; MCP does not transport raw mutation coordinator/lease capability.
- `IndexMutationPort` and `SourceFreshnessPort` are gone.
- The Core root is an explicit product allowlist; first-party-only runtime contracts live under `@zokizuan/satori-core/integration`.
- Historical Publication/vector GC is exact and reader-safe. Supported destructive GC requires one shared Core `SharedPublicationRuntime`; unsupported/direct independent owners remain conservative.
- Collection-family priority/staged-generation authority helpers and obsolete vector observation/proof hooks are gone.
- LanceDB alone supports `collection_fork` atomic incremental publication; Milvus remains unsupported.

Do not restore any retired authority, compatibility façade, fallback reader, migration path, proof receipt, snapshot database, or distributed reader mechanism to make old callers continue working.

## Current accepted working-tree baseline

Repository: `/home/hamza/repo/satori`

Branch: `integrate/language-spine-cbm-go`

HEAD: `86393ae334adba8213ae33bec6cb9c353482577e`

Accepted tracked aggregate after Task 10:

- **102 tracked files changed**
- **4,432 insertions**
- **27,160 deletions**
- **0 staged files**
- **0 changed tests**

Accepted/new untracked Core production files:

- `packages/core/src/generation/publication-store.ts`
- `packages/core/src/generation/root-mutation-coordinator.ts`
- `packages/core/src/generation/root-mutation-runtime.ts`
- `packages/core/src/integration.ts`

The current deliberate Core package surface is **118 root exports / 10 integration exports**, with **300/300 first-party import bindings resolved** at Task 10 acceptance.

The untracked Go `calls_v0` plan and this coordination directory are not Task 11 implementation targets.

## Current live Task 11 seams

The source-plan Task 11 checklist was re-grounded after Task 10. Do not recreate already-deleted owners merely because the original plan named them.

### 1. Old publication-authority format readers are already mostly gone

Production sweeps after Tasks 5–10 show no surviving SnapshotManager V1/V2/V3 owner, completion-marker authority reader, old policy-document authority, write-collection override, navigation primary/fallback store compatibility layer, or proof receipt/cache architecture.

Task 11 must confirm the final production zero sweep for the exact retired authority families. If a remaining branch exists **only** to classify one of those pre-clean-break formats, delete it. Do not introduce a migration reader; unsupported pre-clean-break local state is rebuilt by fresh indexing.

Do not delete a current schema/version constant merely because its name contains `v1`, `v2`, `v3`, or `version`. Current wire contracts and current immutable identities are not compatibility debt.

### 2. `MCP_WATCH_DEBOUNCE_MS` is a real obsolete compatibility input

Observation-only watching no longer schedules synchronization after a debounce, but the old knob is still threaded through production:

- `packages/mcp/src/config.ts`
  - `DEFAULT_WATCH_DEBOUNCE_MS` is explicitly deprecated/kept for imports;
  - `ContextMcpConfig.watchDebounceMs` is explicitly deprecated;
  - `createMcpConfig()` parses `MCP_WATCH_DEBOUNCE_MS`, warns that it is ignored, and still stores a value;
  - CLI/help text advertises the ignored compatibility input.
- `packages/mcp/src/server/shared-runtime.ts` and `provider-runtime.ts` transport `watchDebounceMs` despite no watcher-owned sync debounce remaining.
- `packages/mcp/src/core/sync.ts` keeps `watchDebounceMs` option plumbing and `getWatchDebounceMs()` even though the value does not drive watcher behavior.
- `packages/mcp/src/core/handlers.ts` and `search-query-support.ts` propagate the value into the search noise hint as `debounceMs`.
- `packages/cli/src/install-contracts.ts` still treats `MCP_WATCH_DEBOUNCE_MS` as installer-managed runtime configuration.
- `packages/mcp/scripts/qualify-watcher-observation-only.ts` and `qualify-shared-runtime.ts` still inject the removed knob.
- `packages/mcp/CONTRIBUTING.md` still tells contributors to preserve watcher debounce behavior that no longer exists.

Delete the ignored input and the obsolete plumbing end to end. If caller tracing confirms `WATCHER_DEBOUNCE_MS` itself has no real observation behavior after removing the compatibility path, delete that meaningless constant too rather than renaming the debt. Remove `debounceMs` from current response/hint types if it only reports this nonexistent behavior.

Do not alter the real observation-only watcher semantics, source-event tracking, freshness epochs, explicit sync behavior, or background freshness scheduling.

### 3. `search_codebase debug:true` is still an explicit public compatibility alias

`packages/mcp/src/tools/search_codebase.ts` currently exposes both:

```text
debug: boolean              # old alias
debugMode: summary|ranking|freshness|full
```

The schema, super-refinement, normalization, error messages, and tool description all preserve `debug:true -> debugMode=full`.

Delete the public `debug` argument and every combination/normalization branch that exists only for it. Keep `debugMode` as the one current search diagnostics contract. `debugCandidateLimit` should continue to require `debugMode=full`.

Do **not** confuse this with unrelated current `debug` fields or the MCP CLI's global `--debug` option. Task 11 owns the `search_codebase` compatibility argument, not all uses of the word debug.

### 4. `POTION_INFERENCE_CONTRACT_DIGEST` is a compatibility-only source export

`packages/core/src/embedding/potion-embedding.ts` still defines `POTION_INFERENCE_CONTRACT_DIGEST` with comments stating that current runtime/artifact identity is owned elsewhere and the constant is retained only for published-surface compatibility.

Current production has no consumer of that symbol. Delete it. Preserve current Potion runtime integrity, model/artifact identity, `POTION_SEMANTIC_VERSION`, installation preflight, and `PotionEmbedding` behavior.

The symbol is no longer on the Task-10 root allowlist, so do not widen the root surface while removing it.

### 5. Explicit compatibility/deprecation search must be causal, not textual

The live production sweep for explicit compatibility comments currently has a small number of definite Task-11 seams above. Other files contain historical/version language that is not automatically obsolete.

Examples that must **not** be removed just because they look old:

- current shared-runtime protocol/version checks needed by supported launchers;
- current LateOn profile/runtime identity and its deliberate rejection/migration behavior;
- current vector, relationship, navigation, source, rerank, language, or request schema version identifiers;
- current `FingerprintSource`/runtime-fingerprint semantics such as `assumed_v2` unless the real caller trace proves a branch exists solely to read a retired persisted authority format;
- MCP CLI global debug behavior;
- current installer migration behavior unrelated to the Publication clean break.

For every additional compatibility-looking production seam, require:

```text
old contract being preserved
+ zero current product need
+ concrete caller trace
= delete in Task 11
```

Otherwise leave it alone and report it only if it materially blocks the clean-break acceptance criteria.

### 6. Current documentation must stop advertising retired runtime behavior

Update current-facing documentation/config help that becomes false after Task 11. At minimum, `packages/mcp/CONTRIBUTING.md` must no longer describe watcher debounce as a behavior/config contract.

`docs/architecture/ownership-boundary-audit.md` is explicitly dated `2026-07-26` and records a historical read-only audit; it contains many pre-clean-break ownership facts. Do not silently rewrite historical evidence into a fake contemporary audit. If the repository currently presents it as the live architecture reference, add the smallest clear supersession/current-state note or update the appropriate current architecture documentation so a reader is not told that SnapshotManager/proof/marker authority is still current.

Do not rewrite historical plans, qualification receipts, or evidence merely to erase truthful records of former behavior. Current product docs/help/configuration must be accurate; historical evidence may remain historical.

### 7. Test-only compatibility residue is deferred by the current authorization boundary

The source plan mentions deleting tests/fixtures that exist solely for removed compatibility contracts. The current architecture execution policy explicitly prohibits creating, modifying, deleting, or running tests in these waves.

Therefore:

- do not edit or delete tests;
- do not keep production compatibility solely to satisfy stale tests;
- report test-only references separately as deferred cleanup for the later explicitly authorized test-contract migration/final qualification phase.

This is not a Task 11 blocker if production/current docs/config are clean.

## Ownership

You own only the current clean-break compatibility contraction:

- final production sweep/removal of pre-clean-break Publication authority-format readers/classifiers if any survive;
- `MCP_WATCH_DEBOUNCE_MS`, deprecated debounce aliases/config fields, unused runtime transport, installer allowance, current help/docs, and active qualification-script inputs;
- `search_codebase`'s old `debug` boolean alias and alias-specific schema/normalization/documentation branches;
- compatibility-only `POTION_INFERENCE_CONTRACT_DIGEST`;
- other **proven** old-call compatibility aliases/stubs whose only purpose is a contract superseded by Tasks 0–10;
- dead production helpers/errors/types made unreachable by these removals;
- current-facing architecture/config/contributor documentation needed to describe the final Publication architecture truthfully;
- published-surface allowlist synchronization only if an intentional root/integration export actually changes.

Out of scope:

- redesigning current search diagnostics or ranking;
- changing current wire/schema identity merely to remove version numbers;
- general LateOn/profile migration cleanup;
- general installer modernization unrelated to the named compatibility inputs;
- distributed reader ownership or Task-10 GC redesign;
- Go `calls_v0` promotion;
- test migration/qualification.

## Required end state

Task 11 is complete only when all of these are true:

1. Production contains no reader/migration/classifier for the retired completion-marker, old policy-authority, SnapshotManager V1/V2/V3, legacy publication-fingerprint, write-override, or old navigation-backend authority formats from this clean break.
2. Unsupported pre-clean-break local authority state has one upgrade path: fresh indexing/reindex, not compatibility migration.
3. `MCP_WATCH_DEBOUNCE_MS` is no longer parsed, stored, warned about, installed, documented as current configuration, or injected by active MCP qualification scripts.
4. `DEFAULT_WATCH_DEBOUNCE_MS` is gone. Any surviving watcher timing constant has a demonstrated current behavior; otherwise remove it and its transport/reporting plumbing.
5. Observation-only watcher behavior and existing freshness/sync ownership remain unchanged.
6. `search_codebase` no longer accepts `debug`; `debugMode` is the sole current public diagnostics selector.
7. `debugCandidateLimit` remains valid only with `debugMode=full`.
8. Unrelated current CLI/global debug behavior remains intact.
9. `POTION_INFERENCE_CONTRACT_DIGEST` is gone; current Potion semantic/artifact/runtime contracts remain intact.
10. No explicit production compatibility alias/stub remains solely to preserve an internal/public contract removed by Tasks 0–10.
11. Current-facing docs/help no longer claim SnapshotManager/marker/proof authority or watcher debounce as current behavior. Historical audits/plans/evidence remain clearly historical rather than being rewritten as if they were current execution docs.
12. The intentional Core product/integration surface remains minimal and synchronized if touched.
13. Tasks 0–10 remain intact; no Task-10 reader-safety or mutation-boundary regression is introduced.
14. No tests are created, modified, deleted, or run.
15. Go work is untouched.

## Required direct non-test validation

Testing is not authorized. Do not create, modify, delete, or run tests. Do not run package typecheck, build, broad package suites, release checks, or final product qualification.

After the candidate final production state, gather only focused evidence capable of disproving Task 11.

1. **Retired authority zero sweep:** search production Core/MCP/CLI for the exact pre-clean-break authority families named in source-plan Task 11 and Tasks 0–10. Distinguish current schema/version identifiers from compatibility readers.
2. **Watcher compatibility zero sweep:** prove production/current install/config/help contains no `MCP_WATCH_DEBOUNCE_MS`, `DEFAULT_WATCH_DEBOUNCE_MS`, deprecated `watchDebounceMs`, or obsolete watcher debounce transport/reporting path. If a fixed watcher timing value remains, show its real current behavior; otherwise it should be absent.
3. **Watcher ownership trace:** inspect the current watcher event path and show it remains observation-only; removal of the knob must not reintroduce watcher-owned automatic publication/sync.
4. **Search schema direct exercise:** use the real `search_codebase` schema/tool seam or a narrow source-level invocation to prove:
   - `debugMode=full` remains accepted;
   - `debugCandidateLimit` with `debugMode=full` remains accepted;
   - old `debug:true` is rejected/unknown rather than normalized;
   - the current description no longer advertises the alias.
5. **Potion sweep:** prove `POTION_INFERENCE_CONTRACT_DIGEST` has zero production definition/caller/export while current Potion APIs used by MCP/CLI remain resolved.
6. **Explicit compatibility seam review:** report every remaining production match for `@deprecated`, `backward-compatible`, `compatibility alias/stub`, or `kept for existing imports` in the refactored Core/MCP/CLI surface and classify why each survivor is current product behavior or out of scope. The desired result for clean-break-owned seams is zero.
7. **Current docs/config check:** show current MCP help/contributor/current architecture documentation no longer advertises removed watcher/debug/old-authority contracts. Do not fail on truthful historical evidence files.
8. **First-party import audit:** rerun the focused Core import-binding audit if Core source/export files change; all current first-party imports must resolve.
9. **Published surface:** if root/integration exports change, run the non-test collector and synchronize `packages/core/contracts/published-surface.json`. Do not widen the surface to preserve a removed name.
10. Run a focused source parse/import smoke for changed production/config modules if needed to catch syntax/import-shape mistakes. Do not substitute typecheck/build.
11. `git diff --check`.
12. Output-based trailing-whitespace/final-newline checks for all accepted/new untracked Core production owners and any new untracked production owner created in this wave.
13. Changed-test-file count remains zero.
14. Staged-file count remains zero.
15. Verify the Go `calls_v0` plan and coordination package were not changed by implementation work.
16. Inspect the complete final production/current-config/current-doc diff once after the final implementation edit.

## Out of scope / safety rails

Do not:

- add compatibility readers, migration adapters, aliases, fallback formats, or feature flags for the removed architecture;
- mass-delete symbols just because they contain `legacy`, `v1`, `v2`, `v3`, `version`, or `deprecated`;
- change current external/wire/schema version identities without a demonstrated Task-11 compatibility seam;
- redesign search ranking/reranking/debug payloads beyond deleting the old public boolean alias;
- change MCP CLI global `--debug` unless a direct causal trace proves it is the `search_codebase` alias (it is currently a separate contract);
- absorb general LateOn/profile/installer migrations unrelated to the named clean-break seams;
- rewrite historical plans/audits/evidence to hide previous behavior;
- restore tests or production shims to satisfy stale tests;
- create, modify, delete, or run tests;
- run typecheck, build, broad package suites, release checks, or final product qualification;
- touch the Go `calls_v0` plan;
- edit coordination files;
- stage, commit, stash, reset, clean, checkout, create branches/worktrees, or rewrite history.

## Working style

Use Causal Coding, Clean Migration, and Ponytail principles.

For each compatibility seam, identify the old contract and current replacement before deleting it. Prefer deleting the old branch and using the already-current path directly. Do not introduce a replacement abstraction just to preserve a removed option.

Task 11 is the final architecture implementation wave. That does **not** authorize release qualification or broad “while here” cleanup. Stop when the Task 11 observable contracts pass and the final diff is inspected.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. branch, HEAD, tracked aggregate, staged count, changed-test count, and confirmation no Git/worktree/history operations were performed;
3. final retired authority-format sweep and any current versioned contracts intentionally retained;
4. final `MCP_WATCH_DEBOUNCE_MS` / watcher debounce contract and exact production/config/docs/scripts removed;
5. final `search_codebase` diagnostics argument contract and direct schema/tool evidence;
6. final fate of `POTION_INFERENCE_CONTRACT_DIGEST` and current Potion identities retained;
7. any additional explicit compatibility seams removed, with the old contract they preserved;
8. any compatibility-looking production seams deliberately retained and why they are current product behavior rather than clean-break debt;
9. current architecture/help/contributor documentation updates;
10. Core root/integration surface result and first-party import audit if touched;
11. direct non-test validation actually run and observed results;
12. confirmation Tasks 0–10 remain intact and Go/test/final-qualification work was not absorbed;
13. deferred test-only stale-contract references, if any;
14. unresolved blockers/risks before final architecture qualification.

## Integration continuation finding

The first Task 11 completion report is accepted as the continuation baseline for production/configuration behavior. Independent live review confirmed the substantive clean-break contraction:

- retired production authority families are absent;
- `MCP_WATCH_DEBOUNCE_MS`, its deprecated aliases/config/runtime transport, and debounce diagnostics are gone;
- watcher callbacks remain observation-only;
- `search_codebase` accepts `debugMode` and rejects the retired `debug:true` key;
- `POTION_INFERENCE_CONTRACT_DIGEST` is gone while current Potion contracts remain;
- explicit clean-break compatibility/deprecation shims are absent from production;
- the published Core surface matches at 118 root exports / 10 integration exports;
- 79 first-party Core import declarations resolve all 300 named bindings with zero namespace/default escape hatches;
- `git diff --check`, accepted Core whitespace/final-newline checks, zero changed tests, zero staged files, and protected Go/coordination implementation scopes are clean.

One current-facing documentation mismatch prevents final Task 11 acceptance:

`satori-landing/docs/index.html` still tells users to poll `manage_index status` until its **“durable operation”** reaches `completed`, `failed`, or `blocked`.

That wording contradicts the accepted Task 8/11 runtime contract and the same page's later current-state explanation: Publication/current index state is durable, but mutation operation phase/progress/error is a **process-lifetime projection** and is not reconstructed after runtime restart. The live `manage_index` tool description states the same process-lifetime contract.

### Continuation scope

Close this documentation mismatch only:

- make the landing quick-start describe `manage_index status` operation state as process-lifetime/current-process state rather than durable state;
- keep the useful polling/retry guidance without implying terminal operation history survives restart;
- do not change production/configuration behavior, APIs, current version identities, historical evidence, tests, or the deferred test-only compatibility references;
- do not broaden into final qualification or Go work.

### Continuation validation

After the documentation edit:

1. search current-facing docs/help for `durable operation`, persisted-operation wording, watcher debounce, `debug:true`, SnapshotManager/marker/proof authority, and other Task-11 retired current contracts; truthful historical plans/audits/evidence remain excluded;
2. confirm the same landing page still explicitly states that Publication/current state is durable while mutation phase/progress/error is process-lifetime and not reconstructed after restart;
3. confirm production/configuration Task-11 zero sweeps remain unchanged; no production edit should be necessary;
4. rerun `git diff --check`, changed-test count, staged-file count, and protected Go-plan/coordination implementation-scope checks;
5. inspect the complete final production/current-config/current-doc diff once after the final documentation edit, because that edit changes the final reviewed artifact.

Testing, typecheck, build, broad package suites, release checks, and final product qualification remain unauthorized.

## Final integration acceptance

The Task 11 documentation continuation is accepted. Independent live review confirmed that the continuation changed only the remaining current-facing operation-lifetime wording relative to the previously accepted Task 11 baseline:

- the landing quick-start scopes `manage_index status` polling to the same active runtime;
- mutation phase/progress/error are described as process-lifetime state and explicitly not reconstructed after restart;
- restart status is described as reporting durable current Publication state;
- current-facing stale-contract searches are clean once deferred test sources and historical evidence are excluded;
- Task 11 production/configuration zero sweeps remain clean;
- `git diff --check` passes;
- changed test sources and staged files remain zero;
- the tracked aggregate is 111 files, +4496/-27398.

Task 11 is complete / verified. Tasks 0–11 architecture implementation are complete; final architecture/product qualification remains a separate phase.
