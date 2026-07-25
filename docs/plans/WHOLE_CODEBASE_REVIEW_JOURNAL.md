# Whole-Codebase Review Journal

Status: complete — audit only; implementation not authorized

Started: 2026-07-25

Purpose: durable, single-agent audit record. This file preserves the phase
boundary, evidence, decisions, exclusions, and unresolved questions so a
context compaction does not silently change the review standard or lose the
reasoning behind the final assessment and remediation plan.

## Operating contract

- Review mode: one agent only. The user explicitly withdrew the multi-agent
  workflow from the supplied review prompt because `AGENTS.md` requires one
  agent unless parallel work is specifically requested.
- Audit mode: read-only with respect to product code, tests, indexes, and
  external state. The authorized audit writes are this journal, the two
  requested review artifacts under `docs/plans/`, and the explicitly approved
  D1a correction to `docs/SATORI_REPOSITORY_MAP.md`.
- Evidence rule: every actionable finding must close the chain
  `observable behavior or repository evidence -> demonstrated mismatch ->
  violated invariant -> responsible owner -> smallest falsifiable correction`.
- Severity rule: use P0/P1/P2/P3/FYI only when the repository evidence supports
  the consequence; do not inflate severity from complexity or file size.
- Review boundary: current repository revision and current worktree snapshot;
  existing user changes are preserved and treated as evidence, not as audit
  edits.

## Phase ledger

| Phase | State | Durable output | Stopping condition |
| --- | --- | --- | --- |
| 1. Evidence boundary | complete | This entry and the evidence table below | Revision, worktree, layout, authorities, commands, and unavailable evidence recorded |
| 2. System map | complete | System map and owner table below | Principal product, runtime, data, lifecycle, search, and contract paths traced |
| 3. Review tracks | complete | Findings ledger and track notes below | Each named track has either evidence-backed findings or an explicit evidence limit |
| 4. Adversarial verification | complete | Verification decisions below | Every serious candidate is confirmed, downgraded, or rejected by an independent focused check performed by this agent |
| 5. Synthesis | complete | Assessment report and remediation plan | Findings deduplicated by invariant and owner; proposed work sequenced with exclusions and gates |
| 6. Artifact verification | complete | Final diff/check results below | Markdown checks, complete diff review, and repository-state preservation completed |

## Phase 1 — Evidence boundary (2026-07-25)

### Repository snapshot

| Item | Observed value | Evidence source |
| --- | --- | --- |
| Root | `/home/hamza/repo/satori` | shell working directory |
| Revision | `3764b740d0f55081f98cc33fd4f6236046de8712` | `git rev-parse HEAD` |
| Branch | `master` | `git branch --show-current` |
| Upstream relation | `master...origin/master` | `git status --short --branch` |
| Current commit | `chore(release): set shared runtime package versions` | `git log -1 --format=fuller` |
| Initial worktree | no unstaged tracked diff; three staged changes and two untracked plan documents | `git status --porcelain=v2` |
| Existing staged changes | added `docs/plans/SATORI_CHECKPOINT_INTEGRITY_AND_SEMANTIC_ABSTENTION_REPAIR_PLAN.md`; added `docs/plans/SATORI_PYTHON_INBOUND_RELATIONSHIP_COVERAGE_REPAIR_PLAN.md`; modified `docs/plans/report.md` | `git diff --cached --name-status` |
| Existing untracked changes | `docs/plans/CHECKPOINT_INTEGRITY_REPAIR_REVIEW.md`; `docs/plans/OPEN_FINDINGS_REVIEW_INDEX.md` | `git status --porcelain=v2` |
| Audit mutation policy | do not modify any of the existing entries above | user/repository instructions |

### Package and deployment boundary

The root is a private pnpm workspace (`pnpm@10.28.2`) requiring Node
`>=22.13.0` and pnpm `>=10.0.0`. The workspace package boundary is
`packages/*`. The repository currently contains:

- `packages/core`: source discovery, language analysis, paths, navigation,
  relationships, retrieval/reranking, and shared types;
- `packages/mcp`: MCP server, public tools, index lifecycle, runtime hosts,
  embeddings, response builders, and tool schemas;
- `packages/cli`: install, upgrade, doctor, launcher, configuration, and CLI
  entrypoint behavior;
- `satori-landing`: hand-authored landing/documentation site;
- `fixtures`, `evals`, `scripts`, and `experiments`: verification, benchmark,
  generated-contract, and experimental support rather than runtime package
  owners;
- `docs`: product, architecture, operational, qualification, remediation, and
  plan records.

Root scripts expose build, lint, typecheck, version freshness, package tests,
integration tests, evaluation/benchmark commands, and release/smoke commands.
The normal repository check is `pnpm run check`, which runs lint, typecheck,
and version freshness. Release and paid-provider operations are outside this
audit.

### Authority classification

| Source | Classification for this audit | Reason |
| --- | --- | --- |
| `AGENTS.md`, `CLAUDE.md`, and applicable skill guidance | current process authority | repository instructions and safety constraints |
| `README.md`, `docs/SATORI_FEATURES_AND_USE_CASES.md`, package READMEs | current product/workflow claims, subject to code/test contradiction | public and package-facing descriptions |
| `packages/*/src`, tests, schemas, generated fixtures, package manifests | primary implementation/contract evidence | executable ownership and verification |
| `docs/plans/report.md` | current prior capability assessment, not automatically authoritative for this revision | explicitly records bounded qualification decisions and limitations |
| existing `docs/plans/*`, `docs/remediation/*`, and `docs/evidence/*` | historical/current decision records or proposed plans; each must be checked for status before reuse | many are scoped repair or qualification artifacts |
| generated files such as `fixtures/search-quality/v1/src/generated/checkpoint-client.generated.ts`, lockfiles, built assets | generated/reference evidence | not independent policy authority; source/generator must be identified before contract conclusions |
| landing pages and examples | product/documentation evidence, not implementation authority | may be stale when code/tests disagree |

### Tool and evidence availability

The local Satori index was inspected read-only. `manage_index(status)` returned
`requires_reindex` because the existing index was created with a VoyageAI /
Milvus / legacy-artifact fingerprint while the live runtime reports Potion /
LanceDB / current-artifact fingerprint. The response explicitly recommends
restarting with the indexed runtime or obtaining approval for `reindex`; the
repository instructions forbid substituting `sync` or performing a rebuild
without approval. Therefore semantic Satori search, outlines, and call-graph
navigation are unavailable for this audit. Native `rg`, bounded file reads,
tests, and repository artifacts remain available. No index mutation was run.

No external research was needed for the repository-internal review. If an
upstream/library fact becomes material, the repository instruction requires
Open Web Search for discovery and Khiip for durable capture; that path has not
been used in this phase.

### Phase 1 decision

The audit can proceed locally, but the final report must explicitly mark
Satori-index-dependent evidence as unavailable and must not present native
lexical inspection as equivalent to freshness-aware semantic navigation.

## Evidence ledger (append-only)

Use one row per material observation. `source-read` is not runtime proof;
`mechanism-supported` is not an intervention-proven cause.

| ID | Phase | Evidence level | Observation | Location / command | Decision impact |
| --- | --- | --- | --- | --- | --- |
| E-001 | 1 | repository-observed | Current source revision is `3764b740d0f55081f98cc33fd4f6236046de8712`; worktree contains pre-existing staged and untracked plan/report changes | `git rev-parse`, `git status --porcelain=v2` | Preserve all pre-existing plan/report changes; review diff ownership separately |
| E-002 | 1 | contract-observed | Root package requires Node 22.13+ and pnpm 10+, with `pnpm run check` as lint/type/version gate | `package.json` | Establish supported development/runtime boundary |
| E-003 | 1 | tool-observed | Satori index status is `requires_reindex` due runtime fingerprint mismatch; reindex is not authorized by this audit | `mcp__satori__manage_index(action=status)` | Exclude semantic/index-backed navigation claims; use bounded native evidence |
| E-004 | 3 | source-observed | Generic repair writes a completion marker through a UUID-defaulting helper without passing the trusted run ID or staging a matching checkpoint; strict synchronizer validation rejects identity mismatch | `packages/core/src/core/context.ts:1943-1957,7721-7740`; `packages/core/src/sync/synchronizer.ts:1104-1115` | Retain P1 checkpoint/publication finding; require C0 before correction |
| E-005 | 3 | qualification-observed | Prior 6.3.0 qualification recorded a usable vector generation with corrupt source checkpoint and incremental sync requiring reindex; the durable checkpoint review limits authorization to C0 | `docs/plans/report.md`; `docs/plans/CHECKPOINT_INTEGRITY_REPAIR_REVIEW.md` | Treat consequence as observed but causal transition as unresolved |
| E-006 | 3 | source-and-qualification-observed | Python inbound false negatives are recorded for exact production symbols; current builder rejects non-relative module specifiers and fixtures cover relative imports | `docs/plans/report.md`; `packages/core/src/relationships/builder.ts:218-230`; `packages/core/src/relationships/builder.test.ts:1109-1215` | Retain separate P2 Python coverage finding; require R0 boundary trace |
| E-007 | 3 | contract-observed | Before D1a, runtime registry and generated docs exposed seven tools while the hand-authored repository map and several plans contained stale six-tool statements | `packages/mcp/src/tools/registry.ts:12-20`; pre-D1a `docs/SATORI_REPOSITORY_MAP.md:42,113-160,689` | Retain P3 historical/proposed documentation finding; current map correction is D1a |
| E-008 | 3 | verification-observed | Generated README, server manifest, and package version freshness checks passed; shared worktree later gained concurrent product-test and plan changes not made by this review | `pnpm ... docs:check`, `manifest:check`, `pnpm run versions:check`; `git status --porcelain=v2` | Keep audit writes bounded; inspect the three audit artifacts plus the approved current-map correction and preserve concurrent changes |

## Phase 2 — System map (2026-07-25)

### Product and user workflow

The implementation and current product documentation agree on a narrow value
proposition: Satori is a read-only evidence layer for coding agents. It turns a
repository into a freshness-aware map so an agent can discover a behavioral
owner, inspect bounded source, and follow conservative relationships before it
edits. It is not the editor, deployment system, or a compiler-grade program
analysis product.

The principal supported workflow is:

```text
install / upgrade / doctor
    -> start the managed MCP runtime
    -> create or inspect a repository publication
    -> search by intent or exact operators
    -> continue one frozen result set when disclosure is incomplete
    -> resolve an exact outline / symbol / call-graph target
    -> read bounded current source
    -> use the evidence to make a separate code change
```

Lifecycle/operator workflows are `status`, `create`, `sync`, `repair`,
`reindex`, and `clear`, with provider and runtime diagnostics. The product
intentionally exposes advisory, bounded call graphs and warns when inbound
coverage is partial. Current documentation also states that search results are
candidate evidence and that a full semantic no-answer contract is not yet
qualified.

### Runtime and process topology

| Boundary | Owner | Evidence and responsibility |
| --- | --- | --- |
| User-facing installer/doctor/CLI wrapper | `packages/cli/src/index.ts`, `install.ts`, `doctor.ts` | Parses commands, manages the stable launcher/client configuration, delegates MCP tool calls, formats errors, performs postflight and upgrade checks |
| MCP process bootstrap | `packages/mcp/src/index.ts`, `server/start-server.ts` | Selects `mcp`, `cli`, `postflight`, or shared `host` mode; protects stdio; starts and drains the server; runs startup recovery |
| Session and tool dispatch | `packages/mcp/src/server/shared-runtime.ts`, `tools/registry.ts` | Creates MCP sessions, publishes the seven-tool schema, routes calls, owns per-session continuation state |
| Shared offline host | `packages/mcp/src/server/shared-runtime-host.ts`, `shared-runtime-identity.ts`, `shared-runtime-lifecycle.ts` | On eligible Linux x64 Potion/LanceDB installs, shares one provider/vector host behind an owned Unix socket; runtime identity hashes configuration and package inputs |
| Provider runtime | `packages/mcp/src/server/provider-runtime.ts` | Lazily creates embedding, vector backend, Core `Context`, `SyncManager`, reranker, and provider-backed tool handlers; starts background/watcher lifecycle only for embedding-capable runtime |
| Local/provider-free context | `provider-runtime.ts`, `shared-runtime.ts` | Supplies metadata-only embedding and an unconfigured vector backend so status, validation, and non-provider paths can fail with explicit setup guidance rather than silently embedding |
| Public MCP tools | `packages/mcp/src/tools/*.ts` | Zod boundary validation and public descriptions for lifecycle, search, continuation, graph, outline, exact reads, and codebase listing |
| MCP orchestration | `packages/mcp/src/core/handlers.ts` and specialized handler modules | Resolves freshness/readiness, routes search and navigation, builds public envelopes, manages continuation/read caches, and maps lifecycle results |
| Persistent index/state core | `packages/core/src/core/context.ts`, `sync/synchronizer.ts`, `packages/mcp/src/core/snapshot.ts` | Creates chunks/symbols/relationships, writes vector/control records, validates publication proof, tracks source checkpoints, and persists local snapshot/lifecycle metadata |
| Storage adapters | `packages/core/src/vectordb/*.ts`, `lancedb.ts`, navigation SQLite/sidecars | LanceDB/Milvus vector and lexical storage; source-derived navigation/relationship sidecars and symbol registry are separate derived artifacts bound to publication evidence |
| Language and relationship analysis | `packages/core/src/language-analysis/*`, `language/*`, `relationships/*`, `packages/mcp/src/core/call-graph.ts` | Oxc for JS/TS, Tree-sitter WASM for supported polyglot languages, bounded text fallback, deterministic symbol extraction, conservative relationship evidence, and graph query projection |
| Generated/public synchronization | `packages/mcp/scripts/generate-docs.ts`, `generate-server-manifest.ts`, `server.json`, README tool section, generated fixture client | Tool registry and schema are runtime authority; checked generated README/manifest/fixture outputs are downstream contract references |

### Principal data and lifecycle paths

1. `manage_index(create|reindex)` validates an absolute root, obtains a
   provider-capable context, acquires a root mutation lease, scans source,
   analyzes/chunks it, embeds and writes a staged collection, builds source
   navigation/relationships, proves payload and generation state, then
   publishes the completion marker and snapshot/lifecycle receipt.
2. `manage_index(sync)` and freshness-triggered search enter `SyncManager`.
   `FileSynchronizer.prepareChanges()` scans through root-bound descriptors,
   hashes indexable files, compares the current source checkpoint, and stages
   an added/removed/modified delta. `Context` updates vectors and navigation,
   verifies the candidate generation, and commits source checkpoint/publication
   through the mutation lease and completion hook.
3. `manage_index(repair)` attempts local readiness recovery only after
   fingerprint, collection, marker, payload, snapshot, and navigation evidence
   can be proven. It must not re-embed source chunks. The current repository
   records a live checkpoint/marker mismatch after a prior qualification; the
   responsible identity model remains under the separate C0 review plan.
4. Search enters `ToolHandlers` freshness/readiness gates, then the search
   execution path retrieves dense and lexical candidates, fuses/reranks them
   when configured, applies scope/path/language/must filters, resolves owners,
   groups and orders results, and emits a versioned public envelope with
   warnings, freshness data, navigation capability, and executable next steps.
5. Exact navigation uses a validated publication/readiness receipt to load the
   generation-bound symbol registry and relationship sidecar. `read_file`
   remains a bounded source projection; `call_graph` remains heuristic and
   incomplete, with inbound verification required when the graph is empty or
   partial.

### Authoritative state and identity model

| Authority | Identity / invariant | Projection or consumer |
| --- | --- | --- |
| Canonical repository root | realpath-aware absolute root; path-scoped leases and collection names | all lifecycle, source, vector, and navigation operations |
| Runtime fingerprint | provider/model/dimension/artifact/normalization, vector store/schema, parser/extractor/relationship, embedding and lexical projection versions | completion-marker compatibility and reindex decisions |
| Vector publication | collection family plus staged generation name; exact payload count and completion control record | dense/lexical search and repair proof |
| Completion marker | current `satori_index_completion_v3`, root, fingerprint, counts, policy hash, run ID, navigation binding | readable-publication gate and source-checkpoint ownership |
| Source checkpoint | root plus collection/marker/policy authority; hashed file state and Merkle root | freshness comparison and incremental changes |
| Navigation generation | symbol-registry manifest, relationship manifest, generation ID, seal hash, and observation token | outlines, exact reads, graph queries, quality summary |
| Policy authority | `satori.toml`/ignore-derived policy hash and durable policy document | collection compatibility, source scan, navigation binding |
| Mutation lease | canonical root, generation, operation ID, owner ID, PID/start time; durable state under the Satori runtime root | cross-process writer exclusivity and cache/read invalidation |
| Local snapshot | codebase status, counts, fingerprint, manifest/sidecar metadata, operation receipt, and tombstones | status/listing/doctor diagnostics; derived from durable publication proof where possible |
| Search continuation | process-local frozen ranking handle plus exact next offset | deterministic continuation pages; invalidated by authority/source changes |

The code makes the source-checkpoint tuple agree with its selected marker
authority, while the current repair path has been documented as capable of
writing a new marker without rebinding the old checkpoint. This is a concrete
compatibility seam and an open P1 candidate, not a selected repair.

### Phase 2 decision

The system has recognizable single-purpose owners and a coherent evidence
workflow. The highest-risk complexity is concentrated in the publication
tuple: vectors, marker, source checkpoint, policy, navigation generations,
snapshot state, and lease/receipt state are separately stored but jointly
required to describe one compatible readable publication. The audit will therefore
deduplicate findings around violated publication, freshness, and disclosure
invariants rather than treating each artifact or plan as a separate defect.

## Track coverage checklist

The named review tracks are executed sequentially by this agent. Each track
must end with either an evidence-backed finding, a confirmed pass for its
bounded scope, or an explicit evidence limit.

| Track | State | Current evidence boundary |
| --- | --- | --- |
| Product and workflow | complete | Value and workflows agree with current public docs; semantic abstention remains unqualified rather than falsely promised |
| Architecture and ownership | complete | Runtime/storage owners are distinct; no actionable duplicate owner was proven in the bounded pass |
| Data, identity, compatibility | complete | Fingerprints, marker, checkpoint, policy, navigation, snapshot, and lease identities traced; repair identity seam is P1 |
| Lifecycle, concurrency, recovery | complete | Lease, startup recovery, active-sync coalescing, watcher/background, repair, and shutdown paths inspected; checkpoint failure is the material result |
| API and contract truth | complete | Seven-tool registry, Zod boundaries, generated README/manifest, envelopes, warnings, hints, and continuation semantics checked |
| Search, indexing, navigation | complete | Retrieval, language, relationship, grouping, and graph owners inspected; live index evidence remains unavailable |
| Test and proof quality | complete | Focused repair/relationship/public-contract tests and test commands inspected; two targeted proof gaps remain tied to P1 findings |
| Operations and developer experience | complete | Install/upgrade/doctor/runtime docs and version closure inspected; no new concrete operational defect found |
| Security and trust boundaries | complete | Root-bound filesystem, worker arguments/network policy, private socket, and CLI process boundaries inspected; no concrete reachable risk found |
| Scope and simplification | complete | Recommendations are limited to owner-level identity repair, bounded Python evidence, and documentation authority cleanup; no rewrite proposed |

## Phase 3 — Sequential review tracks (2026-07-25)

This phase was executed by this agent in bounded sequential passes. “Pass” below
means source/doc/test inspection, not a live provider qualification.

### A. Product and workflow

- Current public value is coherent: repository map before edits, intent search,
  exact owner resolution, bounded reads, and advisory relationship context.
- The seven public workflows are present in the registry and current package
  documentation: lifecycle/status, search, continuation, outline, graph,
  exact read, and codebase listing.
- The product explicitly tells users that call graphs are heuristic,
  incomplete, advisory, and not blast-radius proof. Empty inbound results
  carry a partial-coverage warning and a deterministic `must:` verification
  action. This is a contract pass, not a graph-completeness pass.
- Semantic retrieval currently behaves as top-K candidate retrieval. The prior
  qualification records four negative controls returning groups without a
  calibrated no-answer decision. Public docs do not promise repository absence;
  this is an unqualified capability and a deferred S0 evidence decision, not a
  confirmed false public claim.

### B. Architecture and ownership

The package and process boundaries are internally understandable:

```text
CLI installation/doctor/upgrade
  -> MCP bootstrap, sessions, public tools, response policy
  -> ProviderRuntime, SyncManager, SnapshotManager, shared host
  -> Core Context, analysis, vectors, source checkpoints, navigation, graph
  -> LanceDB/Milvus and ~/.satori durable state
```

The registry owns the public tool list; Core owns indexing and derived
artifacts; MCP owns lifecycle, freshness, public envelopes, and runtime
selection; CLI owns installation and managed launch. The CLI also imports a
small set of Core runtime constants and performs package-closure checks. That
is a direct dependency edge, but no behaviorally harmful inversion was proven.

No abstraction with a demonstrably single consumer, duplicate policy owner, or
cross-layer leak met the threshold for an actionable finding in this pass.

### C. Data, identity, and compatibility

The authoritative tuple is not one file. A readable publication is jointly
described by the collection/fingerprint, completion marker, source checkpoint,
policy document, navigation seal/manifests, publication binding, mutation
lease, and local snapshot/receipt. The marker and checkpoint are intentionally
bound by collection name, marker run ID, and policy hash.

The runtime fingerprint includes provider/model/dimension, artifact and
normalization, vector-store and schema, parser/extractor/relationship, and
embedding/lexical projection identities. The local Satori index status shows a
VoyageAI/Milvus legacy fingerprint against the current Potion/LanceDB runtime,
so `requires_reindex` is expected compatibility behavior here. No reindex or
sync was substituted for that required rebuild.

The material defect seam is in generic navigation repair: the marker writer
defaults to a new UUID, while the generic successful repair path does not stage
a matching source checkpoint before republishing its policy binding. The
relationship-only upgrade path is stricter and preserves/proves the existing
marker-owned checkpoint, which confirms that the two repair modes have
different authority contracts.

### D. Lifecycle, concurrency, and recovery

- `SyncManager.ensureFreshness` is the shared front door for manual,
  background, watcher, and on-read paths.
- In-process active syncs coalesce; cross-process mutation leases guard writes;
  startup recovery and shutdown drain durable lifecycle state.
- `FileSynchronizer` validates checkpoint ownership before freshness work and
  fails closed when the checkpoint is missing/corrupt or does not belong to the
  active marker.
- Watchers are session/runtime lifecycle state. The unused
  `refreshWatchersFromSnapshot` helper is not reported as a defect because no
  current product contract promises durable watcher registration across
  restart.

The checkpoint/marker mismatch is the only reachable lifecycle correctness
finding established in this bounded pass. No theoretical race was reported
without a reachable interleaving and violated invariant.

The audit does not assume that a complete file hash is an atomic source
snapshot. C0 must freeze a stable-observation rule—observation token before
scan, complete scan/hash, matching token after scan, or immutable task-owned
source materialization—and must test mutation during hashing, after hashing
before activation, queued watcher work while the lease is held, and restart
after staging before activation.

### E. API and contract truth

The runtime registry contains exactly seven tools in a fixed order, including
`continue_search`. Zod input schemas are converted into MCP JSON Schema;
continuation handles are process-local frozen-ranking state with exact offsets;
search envelopes carry targets, warnings, hints, and recommended actions; and
call-graph responses expose partial coverage rather than pretending empty means
no callers.

The generated README and `server.json` checks passed, as did the package
version-freshness check. The contradictory six-tool statements were in the
hand-authored repository map and several older/proposed plan records, not in
the current generated runtime contract. D1a corrected the current map;
older/proposed plan records remain outside this batch.

### F. Search, indexing, and navigation

Core routes JS/TS through Oxc, supported polyglot languages through Tree-sitter
WASM, and unsupported/failed analysis through bounded text fallback. Search
combines exact/lexical/dense evidence and groups around owners. Navigation and
relationships are generation-bound and deterministic; the call graph is
explicitly heuristic and incomplete.

The local Satori index could not provide fresh semantic/outlines/graph evidence
because its lifecycle status is `requires_reindex`. Therefore this audit did
not make new claims about ranking quality, local recall, latency, or a global
no-answer threshold. The Python inbound result remains a carried-forward,
prior-runtime production observation with current source support, not a fresh
local live-index reproduction.

### G. Test and proof quality

The repository has focused tests for persisted authority, completion markers,
repair proof, publication, navigation sidecars, relationships, public tools,
runtime identity, install/upgrade, and diagnostics. The package commands are
serial and explicit about build/test boundaries.

Two proof gaps are causally tied to the serious findings:

1. The generic `Context.repairIndex` test that rebuilds a missing marker and
   sidecars asserts no embedding and successful repair, but does not immediately
   inspect the source checkpoint or run a zero-change sync after the fresh marker.
2. Relationship fixtures cover Python relative imports and source-backed
   fallback behavior, but the recorded production false negatives use absolute
   imports/constructor or service-binding patterns not closed by those fixtures.

These are not broad coverage requests; they are the smallest falsifiable
regressions for the two findings.

### H. Operations and developer experience

Install, upgrade, doctor, runtime ownership, exact package closure, and
provider setup are represented in code and docs. `versions:check`, generated
docs, and generated manifest checks all passed. No provider, release, paid
service, migration, or deployment operation was run.

### I. Security and trust boundaries

The bounded review found:

- root-bound source/path validation and symlink/root traversal checks;
- child-process invocation with argument arrays rather than shell interpolation
  in production worker and Git probe paths;
- Potion worker startup with `--block-network` and pinned helper/model
  provenance checks;
- private shared-runtime socket ownership/handshake checks; and
- symlink-resistant local diagnostics.

No concrete reachable security boundary failure was established. Test-only
shell invocation and general `path.resolve` occurrences were not treated as
production vulnerabilities without a reachable untrusted-input path.

### J. Scope and simplification

The smallest reliable sequence is owner-level: first prove and repair the
marker/checkpoint publication boundary, separately isolate the Python
relationship boundary, then clean documentation authority. A broad rewrite,
new graph authority, ranking redesign, provider change, or generic abstraction
cleanup is not evidence-backed by this audit.

## Phase 4 — Adversarial verification (single-agent second pass)

The serious candidates were challenged independently of the initial system map:

| Candidate | Independent check | Decision |
| --- | --- | --- |
| Generic repair can invalidate source freshness | Re-read `writeCompletedIndexMarker` default UUID, generic `repairIndex` call at the final marker write, the strict synchronizer ownership assertion, the V4 publication schema, and the existing repair test assertions. Compared with the relationship-only branch, which explicitly validates and preserves the source checkpoint. | Keep as P1; source mechanism and prior qualification symptom agree. First wrong transition remains a C0 decision, so no repair implementation is selected. |
| Python inbound coverage defect | Compared prior qualification's exact target/caller observations with current `resolveRelativeModulePath` rejecting non-relative specifiers and current fixtures covering only relative Python imports. Separately checked that public graph warnings/hints disclose partial coverage. | Keep as P2 coverage finding; do not report missing disclosure. First wrong relationship/graph boundary remains provisional. |
| Six-versus-seven tool documentation | Compared the registry's seven entries with the current generated README/manifest and exact contradictory lines in `docs/SATORI_REPOSITORY_MAP.md` and plan records. Ran all three read-only freshness/generated checks. | Keep as P3 documentation truth finding; runtime contract passes. |
| Semantic no-answer behavior | Re-read the public candidate-oriented wording and the existing qualification/ S0 record. No public “repository contains no answer” promise was found. | Downgrade to FYI/deferred qualification; do not propose a threshold or response change. |
| Security, watcher persistence, CLI/Core direct dependency | Looked for a reachable untrusted-input path, a durable watcher promise, or behaviorally harmful dependency inversion. | Reject as actionable findings; retain bounded observations only. |

### Phase 4 stopping decision

Two coverage passes (runtime/data/contract first, then targeted source/test/doc/
security verification) found no additional responsible subsystem or
high-confidence P0/P1 issue beyond the separate P1 checkpoint owner and P2
Python coverage owner above. The local
index limitation prevents live search/retrieval qualification, and that limit
is retained rather than filled with speculation.

## Phase 5 — Synthesis (2026-07-25)

The synthesis deduplicates by violated invariant and responsible owner:

| Finding ID | Severity | Owner | Decision |
| --- | --- | --- | --- |
| F-001 | P1 | Core generic repair/publication boundary; MCP post-repair proof is secondary | Keep. Source mechanism and prior runtime symptom agree; C0 must identify the first wrong transition before implementation. |
| F-002 | P2 | Core Python relationship evidence/sidecar and graph projection boundary | Keep. Production false negatives are recorded; disclosure passes; R0 must isolate the first wrong boundary. |
| F-003 | P3 | Hand-authored documentation authority/status labels | Keep. Runtime/generated contract passes; six-tool wording is stale or mislabeled. |
| Q-001 | FYI/deferred | Search qualification | Do not call top-K behavior a safe no-answer contract; S0 only. |

The [assessment report](./WHOLE_CODEBASE_REVIEW_ASSESSMENT.md) contains the
requested product verdict, system map, authority model, finding format,
compatibility consequences, residual evidence, rejected ideas, sequence, and
acceptance/blocker outcomes. The [remediation plan](./WHOLE_CODEBASE_REVIEW_REMEDIATION_PLAN.md)
freezes public and persisted contracts, separates urgent containment from
follow-up batches, preserves explicit exclusions, and does not authorize
product implementation.

Synthesis terminal decision:

```text
audit complete
one P1 and one P2 finding retained with evidence bases and bounded owners
one P3 documentation finding retained
semantic abstention deferred to evidence-only S0
no product implementation authorized
```

## Phase 6 — Artifact verification (2026-07-25)

Completed checks for the audit artifacts and scope boundary:

- `git diff --check HEAD --` over the three audit plans passed.
- A trailing-whitespace scan over the journal, assessment, remediation plan,
  and current repository map returned no matches.
- The complete audit-document diff was inspected in bounded chunks; the
  current-map D1a correction and the final journal disposition were read back
  after writing.
- Generated README, server manifest, and package version checks remained green
  after the audit document writes because none of those generated files was
  changed.
- Final status inspection showed concurrent changes in
  `packages/core/src/core/context.test.ts` and existing plan/report files; they
  were not edited, staged, unstaged, reverted, or regenerated by this review.

Artifact verification terminal decision:

```text
three audit documents exist under docs/plans/ and the approved D1a current-map
correction is applied in docs/SATORI_REPOSITORY_MAP.md
product code changed by this review: no
concurrent work preserved: yes
product implementation: stop and wait for explicit authorization
```

## Post-review disposition (2026-07-25)

The reviewer-approved corrections are recorded here so a future session does
not treat the audit as a runtime qualification or reopen already-settled scope:

- The title and executive language now identify a bounded static review, not
  complete runtime, test, performance, security, or release qualification.
- F-001 remains P1. F-002 is P2 because its advisory/partial disclosure is
  correct and no frequency or incident evidence establishes P1 impact. F-003
  is P3; D1a corrected the current map only, while historical/proposed plan
  cleanup remains deferred.
- The publication invariant is compatibility through one active publication
  binding; it does not require every component to share an overloaded run ID.
- C0 has three repair modes (healthy no-op, valid source tuple with damaged
  navigation, and missing/corrupt/changed source authority) and six explicit
  terminal outcomes. Stable source observation is a required evidence boundary.
- R0 is paired with one offline `scip-python` P0 evidence spike. Satori remains
  authoritative for symbol identity, normalization, publication, graph
  traversal, provenance, and completeness disclosure. No production provider
  integration or external graph authority is authorized.
- Semantic S0 is deferred unless calibrated abstention becomes a concrete
  product priority.

Authorization matrix for the next bounded work:

| Work | Decision |
| --- | --- |
| Assessment wording corrections | Approved and applied |
| D1a current repository-map correction | Approved and applied |
| Historical-plan documentation sweep | Deferred |
| C0 canonical checkpoint evidence | Approved as one bounded evidence batch |
| C1 checkpoint implementation | Conditional on C0 proving a repair-owned transition |
| Broader C2/C3 publication work | Blocked until C0/C1 requires it |
| Python R0 | Approved as evidence-only |
| Offline SCIP-Python P0 | Approved as one evidence-only provider spike |
| Native Python R1-R4 | Paused pending R0/P0 |
| Production SCIP integration | Not authorized |
| Semantic S0 | Deferred |
| Semantic runtime policy | Not authorized |

No C0, R0, or P0 execution occurred during this amendment. No product code,
historical plan, index, or concurrent-agent file was edited by this review.

## Open questions carried forward

Resolved by this audit:

- The public/runtime owner path is CLI -> MCP/shared runtime -> Core/storage,
  with the registry as public tool authority and CLI's limited direct Core
  constants/probes not proven harmful.
- The compatible publication binding and its marker/checkpoint/policy/
  navigation/lease/receipt components are mapped; the generic-repair identity
  seam is the first serious owner candidate without requiring one overloaded
  run ID.
- Current product docs, generated references, historical records, and proposed
  plans are classified by authority; stale historical/proposed six-tool
  wording is isolated as F-003 rather than treated as current runtime drift.
- Findings are deduplicated into F-001, F-002, F-003, and deferred Q-001.

Still unresolved and intentionally carried forward:

- C0 has not proven whether the recorded checkpoint mismatch arose in generic
  repair, pre-existing state, restart/recovery, or a legacy-authority path.
- The local Satori index needs an approved compatible runtime/reindex before
  fresh local semantic, outline, or graph qualification.
- The Python target's current production witness and first wrong relationship
  boundary require R0; native source inspection is not a replacement.
- No calibrated semantic relevance/no-answer oracle has been qualified.
