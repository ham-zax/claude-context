# Whole-Codebase Bounded Static Review Assessment

Status: complete — bounded static audit; implementation not authorized

Date: 2026-07-25

Review mode: one agent, bounded read-only investigation

This is a repository-wide structural and evidence review, not a complete
runtime, test, performance, security, or release qualification.

Durable process record: [WHOLE_CODEBASE_REVIEW_JOURNAL.md](./WHOLE_CODEBASE_REVIEW_JOURNAL.md)

## 1. Executive product verdict

Satori is a coherent product: a freshness-aware evidence layer that helps a
coding agent find an owner, inspect bounded current source, and obtain
conservative relationship context before editing a repository. The package
boundaries are mostly clear and the public contract is unusually explicit
about freshness, bounded disclosure, advisory graph coverage, and recovery.

The inspected architecture and contracts form a coherent product design under
this bounded source review. The revision is not fully qualified for the
strongest lifecycle and navigation claims. One P1 and one P2 finding remain:

1. Generic navigation repair can write a new completion-marker identity without
   staging a matching source-checkpoint identity. The synchronizer then fails
   closed and requires reindex. The source mechanism and a prior 6.3.0 runtime
   symptom agree, but the first wrong transition still requires the bounded C0
   reproduction in the existing checkpoint review.
2. Python inbound relationship coverage has demonstrated production false
   negatives for the recorded target repository. The graph correctly discloses
   that coverage is partial, so this is a P2 coverage defect rather than a
   false “no callers” claim. Its first wrong relationship/graph boundary
   remains provisional; the evidence does not establish the user-impact or
   frequency needed to make it operationally equivalent to the checkpoint P1.

One P3 documentation truth issue was confirmed and the current repository map
was corrected in the D1a amendment: several historical/proposed plan records
still describe six public tools while the runtime and current generated
documentation expose seven, including `continue_search`.

Semantic retrieval has no calibrated no-answer decision, but no current public
contract claims that Satori can prove repository absence. It remains a deferred
qualification workstream, not an implementation finding. No concrete security
finding, broad architecture inversion, or general rewrite was supported.

No product code, tests, configuration, generated contract, index, or runtime
state was modified by this review. The audit artifact writes are this
assessment, the journal, the remediation plan, and the approved D1a correction
to `docs/SATORI_REPOSITORY_MAP.md`.

## 2. Evidence boundary and repository state

### Frozen repository evidence

| Item | Value |
| --- | --- |
| Repository | `/home/hamza/repo/satori` |
| Revision | `3764b740d0f55081f98cc33fd4f6236046de8712` |
| Branch | `master` |
| Upstream relation at first snapshot | `master...origin/master` |
| Current commit | `chore(release): set shared runtime package versions` |
| Workspace | private pnpm workspace, `pnpm@10.28.2` |
| Supported development runtime | Node `>=22.13.0`, pnpm `>=10.0.0` |
| Primary packages | `packages/core`, `packages/mcp`, `packages/cli` |
| Product entrypoints | CLI installer/doctor/upgrade; MCP stdio server; shared offline host |

The first status snapshot contained pre-existing staged plan/report changes and
untracked plan documents. A concurrent agent continued changing and staging
files under `docs/plans/` during this audit. Those entries, including
`report.md` and the dedicated checkpoint/Python/semantic plans, were preserved
and not edited. The journal records both the initial and later worktree
snapshots. Status claims in this report are therefore scoped to the observed
audit window, not a claim that the shared worktree was otherwise idle.

### Authority classification

- `AGENTS.md`, `CLAUDE.md`, and the evidence-bounded-repair skill are process
  authority.
- `packages/*/src`, tests, schemas, and package manifests are implementation
  and contract authority.
- `packages/mcp/src/tools/registry.ts` is the public tool-list authority.
- `packages/mcp/scripts/generate-docs.ts` and
  `generate-server-manifest.ts` generate downstream README/manifest references.
- `README.md`, `packages/mcp/README.md`, and
  `docs/SATORI_FEATURES_AND_USE_CASES.md` are current product/workflow claims,
  subject to code and test contradiction.
- `docs/SATORI_REPOSITORY_MAP.md` is a hand-authored architecture map; its
  current seven-tool wording was corrected by D1a, while stale historical or
  proposed plan wording remains separately classified.
- `docs/plans/report.md` and the existing dedicated plans are qualification or
  decision records. They provide bounded prior evidence but do not replace
  current source authority.
- `docs/remediation/*` is historical unless a newer decision record explicitly
  reopens a finding.

### Unavailable or intentionally unrun evidence

The local Satori index was inspected read-only and returned `requires_reindex`:
its stored VoyageAI/Milvus legacy fingerprint does not match the current
Potion/LanceDB runtime fingerprint. Repository instructions prohibit an
unapproved `reindex`, and `sync` is not a substitute for a required rebuild.
Consequently, this audit did not claim fresh semantic search, outline, or call
graph results from the local index.

No external research, paid provider, deployment, release, migration, live
production mutation, or index lifecycle mutation was run. Full package builds
and test suites were not run because this was a read-only audit in a shared
worktree and the build scripts clean generated output. Test commands and
focused test files were inspected instead.

Read-only checks that passed:

- `pnpm --filter @zokizuan/satori-mcp docs:check`
- `pnpm --filter @zokizuan/satori-mcp manifest:check`
- `pnpm run versions:check`

## 3. Product capability map

| Capability | Public owner | Actual behavior and limit |
| --- | --- | --- |
| Install/upgrade/doctor | `packages/cli` | Installs a managed launcher, verifies exact CLI/MCP/Core closure, reports runtime state, and does not edit source. |
| Index lifecycle | `manage_index` and MCP lifecycle handlers | Create, status, sync, repair, reindex, and clear with leases, receipts, readiness proof, and explicit recovery guidance. |
| Intent/exact search | `search_codebase` plus Core retrieval | Combines exact, lexical, and dense evidence; grouped results expose canonical targets and bounded disclosure. |
| Frozen continuation | `continue_search` | Replays a process-local frozen ranking by exact handle/offset; does not rerun embedding, retrieval, or reranking. |
| Symbol navigation | `file_outline`, `read_file` | Uses generation-bound symbol registries and bounded source projections; exact mode does not guess. |
| Relationships | `call_graph` and relationship sidecars | Heuristic, name/binding-based, bounded, incomplete, advisory; empty inbound results require verification. |
| Repository state | `list_codebases`, `manage_index status` | Reports lifecycle, runtime owner, compatibility, publication, and recovery state. |
| Local runtime sharing | shared host on eligible Linux x64 offline installs | Shares provider/vector state and Potion worker behind an owned private Unix socket; other runtime profiles remain direct per-client. |

The principal user workflow is:

```text
install / upgrade / doctor
  -> start managed MCP runtime
  -> create or inspect a publication
  -> search by intent or exact operators
  -> continue one frozen result set when needed
  -> resolve an exact owner or relationship lead
  -> read bounded current source
  -> make a separate code change
```

The product is honest about graph limitations and source freshness. It is not
a compiler-grade whole-program analyzer, an editor, or a deployment system.

## 4. Current architecture and runtime topology

```text
CLI installer / doctor / upgrade
        |
        v
MCP bootstrap and stdio safety
        |
        v
SharedRuntimeHost -> sessions -> ToolHandlers -> public envelopes/actions
        |
        +-> SnapshotManager, leases, receipts, recovery, watcher lifecycle
        +-> ProviderRuntime -> embedding/vector backend/Core Context
                                      |
                                      +-> source discovery and policy
                                      +-> chunks, vectors, lexical projection
                                      +-> source checkpoints and completion marker
                                      +-> symbol registry/navigation sidecars
                                      +-> relationship/call-graph sidecar
```

### Ownership map

| Owner | Responsibility | Boundary conclusion |
| --- | --- | --- |
| Core `Context` | Indexing, incremental publication, repair, search primitives, authority proof | Owns persisted data and generation identity. |
| Core synchronizer | Root-bound scan, Merkle/source checkpoint, source observation, freshness validation | Correctly rejects checkpoint authority mismatch; it is the detector, not the repair owner. |
| Core language/relationship analysis | Parser routing, fallback, symbols, relationship records | Owns the provisional Python relationship boundary. |
| MCP `ProviderRuntime` | Lazy provider/vector/Core construction and runtime capability gating | Keeps provider setup out of metadata-only status paths. |
| MCP `SyncManager` | Unified freshness entrypoint, coalescing, background/watcher lifecycle, leases, receipts | Orchestrates lifecycle; delegates source authority to Core. |
| MCP tools/handlers | Zod validation, public schemas/descriptions, response statuses/warnings/hints | Owns user-facing disclosure and next actions. |
| MCP shared host | Process/runtime ownership, sessions, shutdown, private socket attach | Prevents compatible offline clients from multiplying heavy local resources. |
| CLI | Installation, managed runtime closure, client configuration, diagnostics | Operational owner; direct Core imports are limited to shared constants/probes and are not a proven inversion. |
| Generated docs/manifest | Downstream references | Registry is the source; checks currently pass. |

For every principal flow, the evidence path is:

```text
input -> Zod/path validation -> MCP orchestration -> Core owner
  -> staged data/navigation -> authority publication -> public projection
  -> focused test/receipt/next action
```

No second runtime owner or duplicate business-policy owner was proven in the
bounded review. The high-risk complexity is the number of durable artifacts
that must jointly describe one compatible readable publication.

## 5. Authoritative state, identity, and compatibility model

| Artifact | Identity carried | Consumer/invariant |
| --- | --- | --- |
| Canonical root | Realpath-aware absolute root | All source, storage, lease, and sidecar operations are root-scoped. |
| Runtime fingerprint | Provider/model/dimension, artifact/normalization, store/schema, parser/extractor/relationship, embedding/lexical projections | Compatibility and reindex decisions. |
| Completion marker | Collection, fingerprint, policy hash, counts, `runId`, navigation binding | Readable-generation gate. |
| Source checkpoint | Collection, marker `runId`, policy hash, Merkle root, file hashes, digest | Incremental freshness and source observation. |
| V4 publication binding | Activation ID, source checkpoint tuple, graph manifest, mutation receipt | Joint vector/source/navigation publication authority. |
| Navigation generation | Generation ID, registry/relationship manifests, seal hash | Outline, exact read, and graph authority. |
| Mutation lease | Root, operation, owner, generation, process identity | Cross-process writer exclusivity. |
| Local snapshot/receipt | Lifecycle, counts, fingerprint, operation phase, tombstones | Diagnostics and recovery projection; not independent publication authority. |
| Continuation handle | Process-local frozen ranking and exact offset | Idempotent disclosure only; invalidated by lifecycle/session boundaries. |

The key publication invariant is:

```text
one readable publication
  = one active publication binding
  + one compatible source-checkpoint tuple
  + one compatible vector/lexical payload
  + one selected navigation/relationship generation
  + one valid mutation/publication receipt
```

Compatibility is established through the authoritative binding; every
component does not need to reuse one overloaded generation or run ID. An
artifact that is individually readable is not sufficient evidence that the
selected publication tuple is compatible or fresh.

Repair modes are separate contracts:

- **Healthy:** exact no-op; do not rewrite navigation, marker, checkpoint,
  policy, or publication authority.
- **Source tuple valid, navigation damaged:** activate only a new proven
  navigation/graph component through the existing source authority.
- **Source authority missing, corrupt, or changed:** fail to explicit reindex
  unless a separately authorized staged source-publication path is proven.

## 6. Confirmed findings ordered by severity

### P1 — Generic repair can split completion-marker and source-checkpoint identity

Finding: A fingerprint-compatible generic `Context.repairIndex` can return a
successful navigation repair while leaving the source checkpoint owned by the
previous completion marker.

Evidence:

- `writeCompletedIndexMarker` defaults `runId` to `crypto.randomUUID()` at
  `packages/core/src/core/context.ts:1943-1957`.
- The generic successful repair path writes a new marker at
  `packages/core/src/core/context.ts:7721-7740` without passing the trusted
  marker run ID or staging a matching checkpoint in that path.
- `publishSealedPolicyBindingForMarker` at
  `packages/core/src/core/context.ts:2945-2973` republishes collection and
  navigation binding; it does not construct a replacement source-checkpoint
  tuple for the generic repair path.
- `FileSynchronizer` rejects a checkpoint whose collection, `markerRunId`, or
  policy hash differs from the active authority at
  `packages/core/src/sync/synchronizer.ts:1104-1115`.
- The current V4 persisted publication schema makes the source-checkpoint
  tuple explicit at `packages/core/src/core/persisted-index-authority.ts:142-160`.
- The current qualification record observed a usable vector generation whose
  checkpoint failed validation and caused incremental sync to require reindex;
  see `docs/plans/report.md` and the bounded
  [checkpoint integrity review](./CHECKPOINT_INTEGRITY_REPAIR_REVIEW.md).

Reachable failure or consequence: A repository with readable payload and
compatible policy enters generic repair, such as navigation/readiness repair.
Repair writes a fresh marker and returns `ok`; the next restart or explicit
zero-change sync loads the old checkpoint under the new marker authority and
fails closed with `Generation checkpoint does not belong to the active
completion marker`, disabling incremental freshness until reindex. This is
source-supported and consistent with the prior runtime observation; the exact
first transition in that observation is not yet intervention-proven.

Violated invariant: The active publication binding must select a mutually
compatible marker, source checkpoint, policy, payload, and
graph/navigation tuple. The source-checkpoint tuple itself must retain exact
collection, marker `runId`, and policy-hash ownership.

Responsible owner: Core generic repair/publication boundary, with an MCP
post-repair checkpoint readback gap as a secondary proof owner. The
synchronizer is the correct detector and must not be weakened to accept a
mismatched checkpoint.

Smallest complete correction: First execute the already bounded C0 decision:
reproduce the canonical repair/restart/zero-change-sync sequence and identify
the first wrong boundary. If generic navigation-only repair is confirmed as the
cause, either preserve the trusted marker identity for a true no-source-change
repair or atomically stage and publish a matching source-checkpoint tuple. Do
not choose between those contracts from source inspection alone, and do not
automatically reindex or rewrite persisted authority during this audit.

Verification capable of disproving the correction: Freeze the exact pre-repair
publication tuple; run repair with no source/vector mutation; read marker,
policy, checkpoint, navigation, and receipt before and after restart; run
explicit zero-change sync followed by unique add/modify/delete witnesses; inject
failure before publication, after durable publication, and before acknowledgement.
The source witness must use a defined stable-observation rule: token before
scan, complete scan/hash, token after scan with equality required, or an
immutable task-owned materialization. Test mutation during hashing, after
hashing before activation, queued watcher work during the lease, and restart
after staging before activation.
Success requires a valid checkpoint after every successful repair and a
previous readable publication on failed candidate work. A failing or
non-reproducible C0 result must remain an explicit blocker, not be replaced by
a guessed fix.

Compatibility or migration impact: A navigation-only correction should not
re-embed or change vector IDs. A source-publication correction may require a
persisted authority/version decision. Existing incompatible or unproven tuples
must continue to fail closed to explicit reindex guidance; no compatibility
relaxation is justified.

Evidence basis: The checkpoint consequence was runtime-observed in the prior
qualification; the generic writer/repair transition is mechanism-supported by
current source; the historical first wrong transition is unresolved pending
C0. The local index is unavailable and the original complete repair request
was not retained.

### P2 — Python inbound relationship coverage has recorded production false negatives

Finding: The qualified Python relationship/call-graph generation omitted
inbound edges for real production callers of recorded symbols after reindex.

Evidence:

- The current qualification in `docs/plans/report.md` records zero inbound
  edges for three exact production symbols while independent source reads
  confirmed production call sites.
- The dedicated [Python inbound coverage plan](./SATORI_PYTHON_INBOUND_RELATIONSHIP_COVERAGE_REPAIR_PLAN.md)
  freezes the source revision, target revision, six-site evidence boundary,
  precision controls, and the requirement to isolate the first wrong boundary.
- `resolveRelativeModulePath` in
  `packages/core/src/relationships/builder.ts:218-230` immediately rejects
  non-relative module specifiers. This supports an absolute-import mechanism,
  but does not by itself prove whether receiver analysis, relationship
  emission, identity, or graph traversal is the first wrong owner.
- Existing core relationship fixtures prove relative Python imports at
  `packages/core/src/relationships/builder.test.ts:1109-1215`; they do not
  constitute proof for the recorded absolute-import/service-binding production
  patterns.
- Public graph disclosure is correct: `call_graph` says coverage is heuristic,
  incomplete, and advisory at `packages/mcp/src/tools/call_graph.ts:31-34`,
  and empty inbound results carry a partial warning and executable search hint
  in `packages/mcp/src/core/relationship-backed-call-graph.ts:522-583`.

Reachable failure or consequence: An agent asking for callers can receive no
inbound edges for a real Python caller and must perform a direct `must:` search
or source read. The workflow is less complete and can miss blast-radius
evidence, although the product does not authorize treating the empty graph as
proof of no callers.

Violated invariant: For a frozen, supported relationship pattern, exact
production source call sites should become exact symbol-instance edges after an
isolated rebuild, or the supported pattern must remain explicitly outside the
claimed coverage. Stable IDs, deterministic ordering, and partial-coverage
disclosure must remain intact.

Responsible owner: Core Python relationship evidence and relationship-sidecar
generation, with graph projection/traversal as a separate boundary to test.
The first wrong owner is intentionally provisional.

Smallest complete correction: Run the authorized R0 first-wrong-boundary
reproduction in the existing Python plan. Only if it proves a bounded native
binding model, implement the smallest constructor/service-binding support under
the plan's precision, context, incremental-equivalence, and resource gates.
Do not add repository-global suffix matching, speculative same-name edges, or
an external graph authority.

Verification capable of disproving the correction: Rebuild the frozen target,
query exact symbol instances through real MCP `call_graph(direction="callers")`,
assert each expected source/target/span, reload the sidecar, compare full and
incremental output, and run wrong-receiver/same-name controls. Preserve
`CALL_GRAPH_INBOUND_COVERAGE_PARTIAL` for patterns still outside the proven
model.

Compatibility or migration impact: Relationship semantics and manifest
fingerprints may need a deliberate version decision; stable symbol identities,
publication authority, deterministic ordering, and existing disclosure must not
churn incidentally. A changed relationship contract requires requalification
and likely reindex of affected navigation artifacts, not silent acceptance of
old edges.

Evidence basis: The missing inbound edges were runtime-observed in the prior
qualification; the non-relative-import behavior and relative-only fixtures are
source-read; the current local reproduction and exact responsible boundary
remain unresolved because the local Satori index is unavailable and the target
repository is external to this worktree. P2 reflects a demonstrated advisory
coverage defect with correct safety disclosure and no established frequency or
incident evidence showing operational equivalence to F-001.

### P3 — Historical/proposed records retain stale six-tool wording (D1a corrected the current map)

Finding: Before the D1a amendment, the current architecture map and several
plan records described six public MCP tools or omitted `continue_search`, while
the runtime and generated references contain seven tools. D1a corrected only
the current repository map; the historical/proposed plan sweep remains
deferred.

Evidence:

- `packages/mcp/src/tools/registry.ts:12-20` lists
  `manage_index`, `search_codebase`, `continue_search`, `call_graph`,
  `file_outline`, `read_file`, and `list_codebases`.
- Current `README.md`, `packages/mcp/README.md`, and
  `docs/SATORI_FEATURES_AND_USE_CASES.md` include `continue_search`.
- Before D1a, `docs/SATORI_REPOSITORY_MAP.md:42` said “six public tools” and
  its public surface table omitted continuation; D1a now lists seven tools and
  includes `continue_search`.
- Proposed or historical plan records repeat the stale six-tool wording,
  including `LANGUAGE_CAPABILITY_MATRIX_AND_SYMBOL_EXTRACTOR_HARNESS_PLAN.md:20`,
  `OPERATIONAL_TRUST_PRODUCT_PLAN.md:67`, and
  `SATORI_CLI_IMPLEMENTATION_PLAN.md:319`.
- `docs:check`, `manifest:check`, and `versions:check` all pass, showing that
  generated runtime-facing references are not currently drifting.

Reachable failure or consequence: A maintainer or agent following an
unclassified historical/proposed plan can omit the continuation workflow,
misstate the public contract, or design a change against a six-tool surface.
Runtime behavior is unaffected and the current repository map now agrees with
the registry.

Violated invariant: Hand-authored current architecture and workflow references
must agree with the registry authority, or clearly identify themselves as
historical/proposed records.

Responsible owner: Documentation authority for the repository map and plan
status/archival labels; generated-doc tooling is not the failing owner.

Smallest complete correction: Keep the D1a repository-map correction and mark
stale plan statements historical/proposed when their owner next reopens them.
Do not sweep those plans under this batch. Keep the registry and generated
outputs as the source of public tool truth.

Verification capable of disproving the correction: Re-run the three checks and
search current (non-historical) docs for six-tool claims; inspect the complete
D1a docs diff for accidental contract changes. A remaining historical-plan
claim is not a D1a failure unless its status is current.

Compatibility or migration impact: None for runtime or persisted state. This is
a documentation-only correction.

Evidence basis: Artifact-observed and source-read before D1a; the
runtime/generated registry and current map are now aligned, while several plan
records remain stale or unlabeled as historical/proposed.

## 7. Simplification and improvement opportunities

These are deliberately narrow and preserve current product value:

| Opportunity | Behavior preserved | Clearer owner |
| --- | --- | --- |
| Make generic repair choose one explicit source-authority contract | Healthy readable publications, vector payloads, leases, and fail-closed behavior | Core publication/repair boundary rather than downstream synchronizer tolerance |
| Keep Python relationship experiments binding-based and componentized | Existing relative-import edges, deterministic IDs, warnings, and conservative negatives | Core Python relationship evidence, with graph projection tested separately |
| Make one hand-authored docs map follow the registry | All seven existing tools and generated outputs | Registry remains policy authority; docs become projection |
| Preserve S0 as qualification only | Current top-K retrieval and public candidate semantics | Search qualification owns evidence; no premature ranking/threshold owner |

No current evidence supports a general rewrite, a new abstraction layer, a
second graph authority, a global name matcher, a local neural reranker, or a
provider migration.

## 8. Incompatibilities and migration/reindex consequences

- The local Satori index's `requires_reindex` result is explained by a runtime
  fingerprint migration from VoyageAI/Milvus legacy artifacts to
  Potion/LanceDB current artifacts. This is an expected compatibility refusal,
  not an audit finding.
- Provider, model, dimension, vector store, parser/extractor/relationship, and
  embedding/lexical projection changes are persisted compatibility identities.
  They must not be silently accepted or repaired as metadata-only changes.
- A marker/checkpoint identity mismatch must remain a fail-closed freshness
  outcome until a proven source-authority correction exists. The safe current
  operational action is explicit reindex under user authorization, not an
  automatic repair shortcut.
- Python relationship changes may require a relationship fingerprint/version
  and affected navigation requalification. Do not churn vector identity when
  only a navigation artifact changes.
- The documentation correction has no migration or persisted-state impact.

## 9. Misleading or stale documentation/contracts

The six-versus-seven contradiction was the confirmed documentation issue. D1a
has corrected the current repository map; the remaining stale statements are
in historical or proposed plan records and are deliberately deferred rather
than swept into the current-map correction. The current authority order should
be explicit in future records:

```text
registry.ts / Zod schemas
  -> generated README and server.json
  -> current workflow/architecture docs
  -> historical or proposed plans, explicitly labeled
```

Other examined claims are currently honest or bounded:

- call-graph descriptions explicitly say heuristic/incomplete/advisory;
- search descriptions expose canonical targets, continuation, warnings, and
  next actions;
- README limits measured comparisons and says they are not universal claims;
- compatibility changes are documented as requiring reindex.

## 10. Test and proof gaps

The repository has substantial focused coverage, but the following two tests
are the smallest missing proofs directly implicated by the findings:

1. Generic repair: after a successful marker/navigation repair, inspect the
   marker-owned checkpoint immediately and run a zero-change sync after a fresh
   process start. Assert the exact collection, run ID, policy hash, Merkle root,
   and document digest relationship.
2. Python inbound coverage: add only the frozen production patterns and
   precision-negative controls from the existing Python plan after R0 identifies
   the first wrong boundary. Do not add broad language matrices before the
   owner and oracle are frozen.

The checkpoint work also needs an explicit stable-source observation contract:
complete hashing alone is not an atomic source snapshot. C0 must freeze either
an observation token before scan -> complete scan/hash -> observation token
after scan, accepting only matching tokens, or an immutable task-owned source
materialization. The evidence batch must exercise mutation during hashing,
after hashing before activation, a queued watcher event while the lease is
held, and restart after staging but before activation.

The existing generated docs/manifest/version checks are adequate for the
observed seven-tool/version contract. Full test execution was intentionally
not part of this read-only shared-worktree audit; a future implementation batch
must run the focused tests capable of disproving its own correction.

## 11. Security findings

No concrete reachable P0-P2 security issue was established in the bounded
review. The inspected controls include root-bound and symlink-aware filesystem
validation, argument-array child-process invocation, pinned Potion helper/model
provenance with `--block-network`, private shared-host socket ownership and
handshake validation, and symlink-resistant local diagnostics.

Test-only shell use and generic path operations were not promoted to findings
without a production untrusted-input path. This is a bounded pass, not an
authorization for a general hardening program.

## 12. Residual risks and evidence still missing

- C0 has not yet established whether the recorded checkpoint mismatch was
  introduced by generic repair, predated repair, arose during restart/recovery,
  or belongs to a legacy-authority path.
- The local Satori index cannot requalify current retrieval, symbols, or graph
  behavior without an approved runtime restart/reindex.
- The Python target is outside this worktree; current local source inspection
  supports a mechanism but cannot replace the frozen production witness.
- No calibrated semantic relevance/no-answer contract has been proven.
- Full package/integration tests, provider behavior, performance, and release
  smoke were not re-run in this audit.
- The shared worktree changed under concurrent work; the user must review the
  complete final diff with ownership separation before any implementation.

## 13. Explicitly rejected or deferred ideas

- No multi-agent or subagent workflow: repository instructions and the user's
  correction require one agent.
- No index reindex/sync/clear/repair operation during the audit.
- No automatic checkpoint repair before C0.
- No ranking redesign, relevance threshold, no-answer response field, model
  change, reranker, or dependency addition before S0 qualification.
- No repository-global Python suffix matching, speculative same-name graph
  edges, external graph authority, or production-wide language-server
  integration. A bounded offline provider-evidence spike is allowed only when
  Satori retains canonical symbol identity, normalization, publication, graph
  traversal, provenance, and completeness disclosure.
- No general rewrite, cleanup pass, security-hardening program, release
  preparation, or migration execution.

## 14. Recommended implementation sequence

The evidence-batch-ready sequence is in
[WHOLE_CODEBASE_REVIEW_REMEDIATION_PLAN.md](./WHOLE_CODEBASE_REVIEW_REMEDIATION_PLAN.md).
It is not an implementation-ready authorization: C1 and production Python
changes remain conditional on the evidence batches below.
At a decision level:

1. Apply D1a to the current repository map only: list seven tools and verify
   the generated/documentation checks. Defer a historical-plan sweep.
2. Freeze the checkpoint contract and execute one canonical C0
   first-wrong-boundary reproduction.
3. If and only if C0 proves a repair-owned transition, implement the smallest
   Core authority correction and then expand verification to restart,
   zero-change, and source-observation boundaries.
4. Execute Python R0 together with one offline SCIP-Python P0 evidence spike;
   pause native R1-R4 and production provider integration until those results
   terminate.
5. Defer semantic S0 unless calibrated abstention becomes a concrete product
   priority.

## 15. Acceptance gates and terminal blocker outcomes

The audit itself is complete with the following terminal decision:

```text
audit findings produced
product code changed: no
serious findings: retained with evidence and bounded owners
product implementation authorization: not granted
approved evidence/docs batches: D1a, C0, R0, and offline SCIP-Python P0
conditional implementation: C1 only after C0; native Python work only after R0/P0
deferred: historical-plan sweep, semantic S0, production provider integration
next action: execute only an approved evidence batch; stop at its terminal outcome
```

For any future batch, `success` and `blocker` are both terminal outcomes:

| Batch | Success terminal | Blocker terminal |
| --- | --- | --- |
| C0 checkpoint evidence | One named terminal outcome is recorded: `repair_owned_transition_proven`, `preexisting_corruption_proven`, `restart_transition_proven`, `legacy_authority_path_proven`, `canonical_scenario_not_reproduced`, or `evidence_insufficient` | State cannot be distinguished or the canonical request cannot be reconstructed; retain the finding as unresolved and do not patch. |
| Checkpoint correction | Repair and restart leave one compatible marker/checkpoint/publication; zero-change and unique source witnesses pass | Any identity ambiguity, failed acknowledgement, or reindex requirement remains; stop and fail closed. |
| Python R0/P0 | Frozen native boundary and offline provider spike terminate with exact-edge, precision, determinism, resource, and artifact decisions | Any wrong target, identity mismatch, unresolved boundary, or resource failure; leave coverage open and pause production integration. |
| Documentation cleanup | Current map lists seven tools and checks pass; historical-plan sweep remains deferred | Any public/runtime contract drift; stop the docs batch and reopen authority review. |
| Semantic S0 | Frozen evidence supports a bounded decision and explicit exclusions | No safe oracle or holdout governance; do not change runtime or public response. |

Stop here and wait for explicit approval before changing product code.
