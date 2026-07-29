# Satori Offline Search Productization and Quality Follow-up Plan

**Status:** the direct paired Potion/Voyage retrieval comparison is complete;
Linux x64 Track A productization and the Potion default for new offline
installations are authorized and implemented; Track A0.1 and Tracks B--F remain
conditional

**Date:** 2026-07-19

**Last updated:** 2026-07-29

**Entry condition:** each track has its own authority. Lean L4 directly compared
the two existing publications and recorded
`direct_relevance_useful_with_observed_java_and_configuration_gaps`. The user
subsequently authorized Linux x64 productization and the new-offline default.
That decision does not activate Track A0.1 or Tracks B--F.

This plan owns work deliberately excluded from lean qualification. Each track
has its own trigger, decision, and stopping condition. A track may begin only
under separate execution authorization.

The completed direct comparison queried the same 36-task authority against the
existing Potion and Voyage publications without an agent or judge. On the 30
tasks with a required owner, Potion placed the owner file in the top five on
23 tasks and Voyage on 25; paired owner rank favored Potion on 3 tasks, Voyage
on 11, and tied on 16. Potion's main gap was Java (`2/5` top-five owner
reachability versus Voyage's `4/5`); configuration/runtime top-one reachability
was also lower (`1/6` versus `4/6`). This supports Potion as a useful offline
first-stage baseline while requiring both observed limitations to remain
explicit. It does not establish agent-answer or negative-answer behavior.

---

## Track A0 — Linux x64 managed Potion productization

**Authority:** authorized and implemented for the existing managed installer.
This is bounded Linux x64 support; it is not a multi-platform quality claim.

### A0 public configuration contract

The existing offline runtime selection is the public entry point:

```text
satori-cli install --runtime offline
```

For a new Linux x64 offline installation with no model override, the installer
selects Potion. `--ollama-model <model>` explicitly selects the existing Ollama
path. Reinstalling an installer-owned Ollama configuration without a new model
retains Ollama; it is never silently migrated to Potion. The runtime profile
remains `offline`, and the existing `default | minimal | all-text` index profiles
are unchanged.

The Potion selection expands to the ordinary runtime configuration below:

```text
SATORI_RUNTIME_PROFILE=offline
VECTOR_STORE_PROVIDER=LanceDB
LANCEDB_PATH=<the installer's existing managed absolute LanceDB path>
EMBEDDING_PROVIDER=Potion
EMBEDDING_MODEL=minishlab/potion-code-16M-v2@e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b
EMBEDDING_OUTPUT_DIMENSION=256
POTION_HELPER_PATH=<managed absolute helper path>
POTION_MODEL_PATH=<managed absolute model-bundle path>
POTION_REQUEST_TIMEOUT_MS=5000
```

The model identity and its
`bfda80d97aeb585e20650b1c54e9063a65068ce284317f0e0a812e20964dcee7`
inference-contract digest come from the already-qualified L0/L1 authority. The
installer manifest carries the pinned helper, model, tokenizer, configuration,
license, file-size, and SHA-256 authorities; it must not substitute a mutable
model name or download a newer revision. Runtime bootstrap derives and verifies
the inference-contract digest rather than accepting a user-selected digest.

Preflight rejects conflicting provider, model, or dimension state instead of
silently overriding it. An explicit Ollama model is the supported provider
override. Existing installer-owned Ollama identity is preserved.

### A0 platform and artifact lifecycle

Initial support is exactly Linux x64. Other platforms fail during preflight with
guidance to select Ollama explicitly. The exact qualified helper, model,
tokenizer, configuration, model card, dependency license, file sizes, and
SHA-256 checksums ship inside the managed MCP package. The package manifest pins
the model revision, helper source revision, model2vec-rs revision, Rust
toolchain, target, features, and inference-contract digest.

The existing managed-runtime candidate lifecycle remains the activation owner:
the package candidate is installed outside the active generation, its LanceDB
runtime and Potion closure are verified, and only then is the stable launcher
switched. Failure leaves the previous launcher target unchanged. npm normalizes
non-bin package files to mode 0644, so preflight restores only the owner's
execute bit after the helper bytes pass checksum verification. The MCP package
continues to expose only its established `satori` binary.

No Rust toolchain or separate runtime model fetch is required on the end-user
machine; the model arrives inside the managed package. After installation,
Potion embedding and Satori runtime telemetry make zero network requests. Source
content is never part of installation traffic, manifests, diagnostics, or logs.
A0 changes no ranking, disclosure, freshness, or existing publication.

### A0 experimental performance disposition

Preserve the original L3 resource failure unchanged. The later checksum-sealed
qualification at `c6511bb` separately recorded `delta_publication_pass` under
the prospective one-second add/edit/delete, 1.5-second rename, and 500 ms warm
search gates. This later result supersedes the intermediate prospective latency
misses; it does not revise the original L3 thresholds or reinterpret L3 as
passing.

**Exit:** on Linux x64, the managed offline installation is reproducible,
checksum-verified, reversible before launcher activation, and usable without an
end-user development toolchain. Explicit and existing managed Ollama
installations remain Ollama. The historical resource evidence remains separate.

---

## Track A0.1 — additional experimental platforms

**Trigger:** the Linux x64 A0 lifecycle passes and a platform-specific
qualification is separately authorized. This track expands experimental
installer coverage only. It does not authorize default, recommended, or GA
promotion for the candidate platform.

A platform becomes experimentally supported only when all of these are true:

* it has a pinned helper and model-bundle manifest;
* its OS, architecture, ABI, and CPU requirements are explicit;
* both network-assisted and air-gapped installation pass;
* checksum verification, rollback, restart, upgrade, and uninstall coverage
  pass;
* a network-blocked embedding and runtime test records zero attempted runtime
  requests; and
* installation and runtime require no end-user compiler or development
  toolchain.

Evaluate candidates in this order:

1. Windows through WSL2;
2. native Windows x64;
3. macOS arm64; and
4. macOS x64.

Each candidate has its own manifest, runtime closure, evidence, and support
decision. Passing one candidate does not establish compatibility for another,
and the ordering does not itself authorize implementation. Unsupported or
unqualified platforms continue to fail during preflight before installation
state changes.

For WSL2, qualify the complete Windows-host-to-WSL2 user path while treating the
helper as a pinned Linux guest artifact; do not describe that result as native
Windows support. Native Windows and each macOS architecture require their own
helper authority rather than reusing the Linux x64 manifest.

Reuse the A0 installer lifecycle and manifest shape where applicable. Do not
build a general native-runtime platform framework solely for these candidates.

**Exit:** record a separate experimental support or rejection decision for the
authorized candidate. Its pass adds only that platform to experimental
`--runtime offline` support and does not extend the Linux x64 default decision
to another platform automatically.

---

## Track A1 — default or recommended promotion

**Trigger:** satisfied by the accepted direct retrieval result, the bounded
Linux x64 lifecycle, and the user's explicit promotion decision. The promotion
claim remains narrow: Potion is the default dense provider for a **new Linux x64
installation**. The CLI's general install default is the offline Potion runtime
on supported Linux x64 hosts; connected Voyage remains explicitly selectable.

The implementation rules are:

* `install` and `install --runtime offline` with no model override select Potion;
* `install --runtime voyage` explicitly selects the connected Voyage runtime;
* `install --runtime offline --ollama-model <model>` selects Ollama;
* reinstalling an existing managed Ollama configuration preserves Ollama;
* conflicting ambient provider/model/dimension values fail rather than silently
  overriding the selected contract;
* unsupported platforms receive an explicit Ollama fallback instruction; and
* no existing publication or installation is automatically migrated.

The promotion does not claim Potion matches Voyage, does not erase the observed
Java and configuration/runtime gaps, and does not establish agent-answer or
negative-answer quality. Any platform beyond Linux x64 still requires a passing
A0.1 decision. Broader quality claims still require the separately triggered
Track B.

**Exit:** the new-offline default, explicit Ollama override, existing-Ollama
preservation, immutable bundled identity, and unsupported-platform failure are
implemented and pass focused installer, runtime, and package checks.

---

## Track B — expanded release qualification

**Trigger:** the intended release claim requires fresh agent-answer,
negative-answer, multi-repository, or broader platform evidence that the direct
lean retrieval comparison does not supply.

Scope:

* expand to a checksum-sealed 90-task, six-language suite;
* maintain tuning and held-out splits;
* add exact language and task-class accounting;
* use blinded judging and consolidated human adjudication;
* report paired task-level results;
* use bootstrap intervals only as supporting analysis;
* preserve hard integer safety gates;
* qualify the operating systems and CPU classes claimed for the Track A1
  release; and
* run the complete release-candidate installer and publication flow.

The 90 tasks use exactly 30 tuning and 60 held-out tasks. Each task has one
primary language and class. The manifest freezes repositories, revisions,
owners, acceptable evidence, answer facts, criticality, agent and judge
identity, disclosure path, hardware, publications, and integer gates before
contender output is visible.

The expanded suite validates a release candidate. It must not become a
mechanism for repeatedly tuning against held-out failures.

**Exit:** the release claim is either supported by the frozen 90-task result or
rejected without revising held-out tasks or gates.

---

## Track C — late-interaction or reranking improvement

**Trigger:** Potion passes candidate-owner recall, but expected owners are lost
or poorly exposed after retrieval.

First localize the responsible stage:

```text
grouping or disclosure loss
-> correct grouping or disclosure

fusion or deterministic-ranking loss
-> test a bounded deterministic correction

semantic ordering remains responsible
-> admit a second-stage model experiment
```

A neural scorer must not disguise a grouping or disclosure defect. Any shared
Core/MCP fusion, admission, grouping, ranking, or disclosure change requires
focused Milvus non-regression evidence for the changed boundary. A LateOn-only
adapter that leaves those shared paths unchanged does not require Milvus
requalification.

### C-preflight — natural-language owner and noise localization

The 2026-07-29 `tradingview_ratio` probe supplies a concrete preflight for
Track C. It is discovery evidence from one repository, not a release benchmark,
and it does not authorize a ranking or model implementation by itself.

The oracle sources are independent of search output:

```toml
# tradingview_ratio/pyproject.toml
qap = "cli.main:cli_entry_point"
```

The manifest establishes installed-command invocation ownership. The
implementation independently shows that `cli_entry_point` converts the Typer
application to a Click command, attaches lazy loading, invokes that command,
and owns process-exit handling. The separate `main` function is the Typer root
callback and renders the no-subcommand interface after invocation; it is
relevant supporting evidence but not an acceptable replacement for the
function that creates and launches the Click command.

Freeze each query with its own oracle rather than transferring manifest
authority to every CLI-related formulation:

| Query class | Exact required owner | Acceptable delegated owners | Negative owners | Oracle rationale |
| --- | --- | --- | --- | --- |
| Installed `qap` command target or entry | `src/cli/main.py::cli_entry_point` | None as a replacement; `main` may be supporting context. | Development scripts, tests, and unrelated command callbacks. | Exact `pyproject.toml` declaration plus resolved symbol. |
| Command-line application startup owner | `src/cli/main.py::cli_entry_point` | None as a replacement. | Runtime-path helpers and unrelated script `main` functions. | `cli_entry_point` constructs and invokes the Click command and owns exit handling. |
| Function that creates and launches the user-facing CLI | `src/cli/main.py::cli_entry_point` | None as a replacement; `main` may be supporting context for the root UI. | Command callbacks and development launchers. | `cli_entry_point` calls `typer.main.get_command(app)`, attaches lazy loading, and invokes `click_app`. |

If the implementation changes, recompute these oracle assignments from the
frozen source revision instead of treating the manifest as proof of
construction, rendering, or delegated runtime behavior.

The probe used the synced symbol-rich Python index with the qualified Potion
revision, `hybrid_v3`, runtime scope, symbol grouping, default ranking, a
15-result disclosure, and full candidate-survival diagnostics. No reranker
capability was present. The `must:` index/resolution control used the same
publication.

| Query | First-stage evidence | Final disclosure |
| --- | --- | --- |
| `Where does the command-line application start, and which function owns startup?` | The expected owner chunk was dense rank 12. | The owner was absent from the top 15; a runtime-path helper ranked first and unrelated script `main` functions dominated. |
| `Find the function that creates and launches the user-facing command line interface.` | The expected owner survived the candidate pool. | The expected owner ranked first. |
| `How does running the qap terminal command enter the application?` | Two expected-owner chunks were dense ranks 7 and 8. | The grouped owner fell to rank 10 behind an unrelated development script and core execution results. |
| `must:cli_entry_point` plus `cli_entry_point` | Index/resolution and eligibility control; `must:` changes eligibility and pinning. | The expected owner ranked first. |

This establishes inconsistent exposure and shows that the expected owner is
representable by at least one first-stage arm. It does **not** yet establish the
first wrong post-retrieval boundary. Dense rank followed by absence from the
disclosed results is insufficient to distinguish arm-budget truncation, union
deduplication, scope filtering, eligibility, scoring, grouping, diversity, or
final disclosure.

Runtime scope removed documentation noise, but it intentionally retained
executable scripts. The observed final order is consistent with deterministic
policy influence:

* `src/cli/main.py` was classified as an adapter and received a `0.70` path
  multiplier;
* core candidates received `1.35`;
* scripts received `1.15`; and
* the weaker natural-language formulations did not produce an entrypoint-owner
  signal capable of counteracting those generic path preferences.

Do not repair this by globally raising every adapter or lowering every script.
That would replace one coarse path bias with another and would damage legitimate
adapter- or script-seeking queries.

#### C-preflight-Q — evidence qualification, read-only

This phase qualifies the evidence and responsible owner. It does not change
runtime ranking, add persisted facts, or create test fixtures. Fixture
definitions may be frozen here; implementing them belongs to the separately
authorized deterministic correction.

1. Freeze the four observed queries above, their query-specific oracle,
   publication and source fingerprints, query plan, arm budgets, and complete
   result lists. Add plain `cli_entry_point` as the exact-ranking control; keep
   the `must:` query only as the index/resolution and eligibility control.
2. Freeze contrastive query definitions covering:

   * CLI startup tests;
   * development or mock launch scripts;
   * CLI construction or builder ownership;
   * startup-configuration parsing;
   * helpers used after startup;
   * core request execution;
   * shutdown handling;
   * command declaration;
   * behavior after argument parsing;
   * a repository with no declared entrypoint; and
   * a multi-entrypoint package whose command names select different exact
     owners.
3. Record one explicit expected-owner trace for every query:

   ```text
   dense arm rank
   -> sparse arm rank
   -> exact/configuration arm rank
   -> frozen union membership
   -> deduplication result
   -> scope-filter result
   -> eligibility result
   -> path-policy contribution
   -> intent-policy contribution
   -> every other score component
   -> grouped-symbol result
   -> diversity result
   -> disclosed rank or exact exclusion reason
   ```

   A post-retrieval diagnosis requires the owner to enter the frozen union and
   remain eligible. The trace must then identify the first wrong boundary in
   scoring, grouping, diversity, or disclosure.
4. Identify the authoritative parser and resolver capable of interpreting the
   package declaration and resolving its exact symbol. Do not assume that an
   established indexed-project manifest parser exists. Qualify whether the
   resulting relation can be represented with:

   ```text
   command
   + declaration source and span
   + resolved module or file
   + resolved exact symbol
   + source identity
   + publication identity
   + resolution confidence and basis
   ```

   `EntrypointOwner` is a candidate domain name, not a preselected persisted
   schema. Before persistence is chosen, identify its invariant, lifecycle,
   authoritative writer, invalidation boundary, publication binding, callers,
   and correct domain owner. Compare publication-bound persisted metadata, an
   existing compatible contribution or sidecar, and bounded on-demand
   derivation. Record why the selected placement preserves source and
   publication identity without creating a second authority. The ranking
   policy itself must consume resolved evidence and must not parse project
   manifests. A separately owned bounded on-demand derivation may run while a
   query is being prepared only when its source-barrier, publication-binding,
   resource, and failure-closed contract has been qualified.
5. Specify and freeze the prospective extension to the existing query-plan
   evidence model rather than adding one universal `entrypoint_intent`
   Boolean. Distinguish at least:

   ```text
   installed-command ownership
   application-startup ownership
   command declaration
   development execution
   test startup
   post-startup runtime behavior
   ```

   Startup language plus an exact manifest-to-symbol relation is strong bounded
   evidence. A generic function named `main` is weak evidence. Development- or
   test-seeking intent can positively support scripts or tests instead.
6. Before implementation, freeze the proposed policy component, including:

   * additive or multiplicative composition;
   * maximum contribution;
   * position relative to existing path and agent-fit multipliers and
     exact/configuration pins;
   * grouping and diversity behavior;
   * deterministic tie-breaking;
   * behavior with multiple declared entrypoints;
   * command-name matching and queries that describe a different entrypoint;
     and
   * the complete local and contrastive acceptance matrix.

Terminal outcomes:

```text
entrypoint_owner_policy_candidate
entrypoint_owner_fact_unavailable
entrypoint_owner_missing_from_union
entrypoint_owner_failure_not_reproduced
entrypoint_owner_evidence_insufficient
```

#### C-preflight-D — deterministic correction, separate authorization

Start this batch only when qualification returns
`entrypoint_owner_policy_candidate` and implementation is separately
authorized.

1. Produce the normalized declaration-to-symbol relation through the qualified
   configuration parser and symbol resolver. Persist it only when the qualified
   lifecycle and publication contract require persistence.
2. Add the frozen bounded query-intent evidence through the existing
   query-planning owner.
3. Apply the frozen score component only to exact matching owners already
   present and eligible in the candidate union. A manifest target must not
   always win, and one command's evidence must not promote every entrypoint in a
   multi-entrypoint package equally.
4. Preserve candidate-arm retrieval, scope filtering, exact/path/configuration
   pins, grouping, diversity, continuation, and disclosure contracts.
5. Rerun the frozen probes and focused ranking tests. The local correction
   passes only when:

   * the expected `qap` owner is top three for all three natural-language
     probes;
   * plain `cli_entry_point` ranks the expected owner first;
   * the `must:` control still resolves the owner, satisfies its predicate, and
     keeps the owner eligible;
   * every contrastive query retains its intended owner class;
   * multi-entrypoint queries select the intended command owner;
   * at the frozen candidate-union and post-filter eligibility boundaries,
     candidate identities and eligibility decisions remain identity-equal to
     the baseline; only query-plan diagnostics, scoring components, downstream
     ordering, diversity selection, and disclosure may change; and
   * complete result-list diffs disclose every unrelated promotion.

The authorized bounded Python correction uses on-demand derivation in the
entrypoint-evidence owner rather than adding a second persisted relation.
Derivation runs only for owner-seeking queries, reads at most 256 KiB from
`pyproject.toml`, accepts at most 64 declarations, binds the retained source
descriptor to the active publication and freshness checkpoint, and supplies
normalized evidence to ranking. This placement was selected because no
qualified indexed-project configuration relation currently owns PEP 621
scripts; persistence would introduce a new lifecycle and authority without
evidence that the bounded read is a bottleneck.

Until indexing owns a proven Python package-root map, exact module resolution
is restricted to one unambiguous match under the repository root or `src/`.
Other layouts fail closed. The evidence retains declared and resolved owner
counts plus a completeness flag. Generic startup intent requires exactly one
declaration and complete resolution; an explicitly named command may use its
own exact resolved owner without treating the package as globally unambiguous.

The frozen score component is additive after existing path, changed-file, and
agent-fit multipliers, is independently disclosed, and is capped at `0.35`.
Reranking recomputes the same capped component. The 2026-07-29
`tradingview_ratio` baseline for the first startup query disclosed top-result
scores from `0.681545` to `0.860915`, with lexical components from `0.444` to
`0.498`; the expected owner entered dense retrieval at rank 12. The `0.35` cap
passes the frozen top-three correction fixture while a representative
two-arm-plus-reranker candidate with stronger lexical evidence still outranks
the owner. Exact pins remain separately authoritative.

This is a bounded defect gate, not a general release gate. Do not introduce an
arbitrary top-one count as a product requirement without separately freezing
that requirement.

#### C-preflight broader qualification and routing

General support requires a larger frozen matrix covering a three-entrypoint
fixture, a no-entrypoint fixture, generic `main` functions, correct adapters,
correct scripts, correct core functions, CLI builders, and queries with and
without literal command names. Use multiple repositories only when the intended
support claim extends beyond what repository-owned synthetic fixtures and
existing ranking tests can establish.

Report owner recall in the frozen union, MRR, top-one, top-three, top-ten,
counterexample-class accuracy, unrelated promotions, and complete result-list
diffs.

Cross-repository benchmark construction, deterministic path-policy ablations,
neural ranking comparisons, and counterfactual robustness are owned by
[SATORI_CROSS_REPOSITORY_RANKING_ABLATION_PLAN.md](./SATORI_CROSS_REPOSITORY_RANKING_ABLATION_PLAN.md).
That plan may route evidence into Track C or Track F; it does not replace their
artifact, runtime, representation, or production authority.

Route the result mechanically:

```text
owner remains in the complete eligible union
and loses during scoring, grouping, diversity, or disclosure
-> Track C; repair the first responsible stage

owner is absent from dense but present through sparse, exact, or configuration
-> not yet a first-stage recall failure

owner is absent from all first-stage arms across the frozen owner matrix
-> Track F representation or retrieval investigation

owner is present before scope filtering but correctly excluded by requested scope
-> query or scope contract, not Track C or Track F

owner remains eligible after the deterministic correction
but residual semantic ordering still fails the frozen matrix
-> admit existing LateOn C0/C1
```

A global freshness requalification based on the historical observation that
synchronized added or modified files were unsearchable is not a Track C
prerequisite. The
[authoritative freshness receipt](../evidence/freshness-boundary-20260726/FRESHNESS_BOUNDARY_RECEIPT.md)
classified that observation as a scope-filter mismatch, and the corrected
[repair-authority qualification](../evidence/repair-authority-c4-20260726/REPAIR_AUTHORITY_C4_RECEIPT.md)
passed. Every evaluation must still bind its diagnostics to one readable
publication, valid source checkpoint, and exact source and publication
fingerprints. If those identities disagree, invalidate that evaluation run
rather than attributing the result to ranking.

### C-preflight donor review — ColGREP and NextPlaid

The inspected upstream revision is
`lightonai/next-plaid@4ff801eef11004e20a6ffb62591b6aaeb6859aec`.
Its repository and Cargo manifests are Apache-2.0, not MIT. Apache-2.0 permits
reuse subject to its license and notice obligations. Any verbatim reuse must be
recorded as derived code with the required attribution and modification
notices. Prefer adapting the bounded mechanism to Satori's existing owners when
the behavior is simple enough to implement independently.

At that revision, ColGREP reduces noise through a layered deterministic
pipeline around LateOn:

| Stage | ColGREP mechanism | Satori disposition |
| --- | --- | --- |
| Index admission | Respect `.gitignore`; exclude hidden files, dependencies, build outputs, caches, coverage, and other common non-source paths; allow persistent ignore and force-include overrides; reject oversized or escaping files. | Compare lists and semantics with Satori's existing ignore owner. Port only demonstrated missing patterns; do not create a second ignore policy. |
| Source projection | Tree-sitter code units include name, signature, docstring, parameters, calls, callers, variables, imports, normalized shortened path, and source; the embedding text is capped at 8 KiB. | Compare fields against Satori's existing source projection. A missing owner-bearing field is a projection experiment, not a ranking heuristic. |
| Candidate recall | LateOn multi-vector retrieval is fused with identifier-aware FTS5/BM25 using relative-score fusion. Natural-language FTS uses OR semantics after identifier tokenization. | Satori already has dense, sparse, and exact arms. Compare relative-score fusion with current RRF only after diagnostics attribute a miss to fusion; do not replace fusion as part of the entrypoint fix. |
| Candidate budget | Fetch at least `max(top_k * 20, 200)` candidates before deterministic adjustments and per-file collapse. | Preserve Satori's bounded retrieval and reranker budgets. Over-fetch is relevant only if the expected owner is outside the current eligible union. |
| Path penalty | Multiply tests, test directories, compatibility/legacy code, and examples by `0.30`; declaration stubs by `0.70`; re-export barrels by `0.50`. Skip test/spec/benchmark penalties when the query asks for them. | Reuse the intent-conditioned principle, not the literal constants or patterns. Satori already has path classes, and the CLI probe demonstrates the danger of an over-broad class penalty. |
| Deterministic boosts | Add bounded boosts for query-to-definition name matches, query-to-file-stem matches with stopword filtering, and multi-unit file coherence. | Definition and stem evidence may be useful for identifier-adjacent queries. File coherence can favor large noisy files; require a focused ablation before adoption. None of these identifies a manifest-declared entrypoint by itself. |
| Filters | Apply include, exclude, exclude-directory, code-only, subdirectory, regex, and SQLite metadata filters before or around semantic scoring. | Keep Satori's existing operators and runtime/docs scopes as authority. Fill only a demonstrated contract gap. |
| Disclosure | Sort deterministically, collapse to one result per file, merge spans, and use stable file/line tie-breaks. | Satori already owns symbol/file grouping and diversity. Do not replace symbol disclosure with ColGREP's file-only collapse. |

The inspected ColGREP search pipeline does **not** use LateOn as a separate
learned reranker. LateOn is its primary multi-vector semantic retriever, and
ColGREP still relies on the deterministic controls above. This is useful
architecture evidence: the model does not eliminate the need for explicit
noise policy.

The immutable revision and source links below are sufficient for discovery and
design observations. If Satori retains an exact upstream constant, structure,
or code fragment, its decision receipt must additionally record the source path
and line range, file digest, observation or excerpt, capture date, license, and
whether the implementation is verbatim, substantially derived, or independently
implemented. Keep repository source, model weights, and independently
reimplemented ideas distinct. Do not call substantially copied structure
independent implementation.

Candidate upstream sources:

* license and repository:
  https://github.com/lightonai/next-plaid/tree/4ff801eef11004e20a6ffb62591b6aaeb6859aec
* structured projection:
  https://github.com/lightonai/next-plaid/blob/4ff801eef11004e20a6ffb62591b6aaeb6859aec/colgrep/src/embed.rs
* hybrid retrieval and disclosure:
  https://github.com/lightonai/next-plaid/blob/4ff801eef11004e20a6ffb62591b6aaeb6859aec/colgrep/src/index/mod.rs
* deterministic noise policy:
  https://github.com/lightonai/next-plaid/blob/4ff801eef11004e20a6ffb62591b6aaeb6859aec/colgrep/src/ranking.rs

### C-preflight model disposition

The current engineering judgment is to make LateOn Code edge the first neural
experiment, but not the first repair for the `cli_entry_point` failure.

| Candidate | Appropriate role | Cost and boundary | Disposition |
| --- | --- | --- | --- |
| `lightonai/LateOn-Code-edge` | Second-stage MaxSim scorer over a frozen Potion candidate union. | 17M multi-vector model; query-time document encoding adds latency and retained token vectors add memory or storage if cached. It can run without changing the primary publication in C1. | First neural candidate only after the deterministic preflight repair leaves residual semantic-ordering errors. |
| `nomic-ai/CodeRankEmbed` | Alternative first-stage code embedding. | 137M bi-encoder, 8,192-token context, required query instruction, MIT model-card license, and a fresh Satori publication. Its model card recommends a separate `CodeRankLLM` reranker, and its published usage relies on `trust_remote_code=True`. | Track F only when expected owners are absent before reranking; not a repair for the demonstrated post-retrieval demotion. Pin and audit the implementation or use a reviewed local export; never execute mutable remote model code in the Satori runtime. |
| CodeSage | Alternative first-stage code representation. | The official family starts at 130M and also has 356M and 1.3B variants; adopting it changes the embedding contract and requires a fresh publication. Its official loading example also uses `trust_remote_code=True`. | Track F only under the same recall trigger; do not start a three-model tournament. Pin and audit the implementation or use a reviewed local export; never execute mutable remote model code in the Satori runtime. |

The LateOn choice is provisional engineering judgment, not a benchmark win for
Satori. Its advantages are the small edge checkpoint, token-level matching,
official reranking usage, ONNX availability, and a Rust/ONNX reference. Its
risks are candidate-encoding latency, MaxSim complexity, training-data overlap,
and multi-vector storage. C1 therefore remains query-time and all-or-nothing;
do not build a second persisted code index merely because ColGREP does.

Additional model authorities:

* LateOn Code edge:
  https://huggingface.co/lightonai/LateOn-Code-edge
* CodeRankEmbed:
  https://huggingface.co/nomic-ai/CodeRankEmbed
* CodeSage:
  https://github.com/amazon-science/CodeSage
* CodeSage model-family description:
  https://code-representation-learning.github.io/

### C0 — LateOn artifact and runtime conformance

Public artifacts exist for `lightonai/LateOn-Code-edge` and
`lightonai/LateOn-Code-edge-pretrain`. No checkpoint is admitted until its
exact revision, files, checksums, tokenizer behavior, ONNX output contract,
MaxSim implementation, and reference conformance are frozen. Record the pinned
Apache-2.0 license and required notices as routine artifact provenance.

When Track C's semantic-ordering trigger is satisfied, LateOn edge is the first
conditional second-stage candidate. It is not part of the offline first-stage
baseline.

The default checkpoint is:

```text
lightonai/LateOn-Code-edge
```

Use the pre-trained checkpoint instead only if contamination analysis shows
that the fine-tuned checkpoint's CoIR training data overlaps the frozen Satori
evaluation repositories or tasks. CoIR training is not itself leakage when the
evaluation repositories and tasks are disjoint. Do not score both checkpoints
and choose retrospectively.

The proposal-time public description reports Apache-2.0 licensing,
48-dimensional token vectors, MaxSim scoring, a 2048-token document limit, and
a 256-token query limit. The repository currently exposes FP32 ONNX and
safetensors files plus an approximately 17.2 MB INT8 ONNX file and 3.58 MB
tokenizer. These mutable observations are discovery evidence only; C0 replaces
them with an exact revision and file hashes.

Freeze:

* repository revision and every required file hash;
* ONNX artifact variant and execution provider;
* tokenizer and special-token behavior;
* exact query prefix or template;
* query/document distinction;
* query and document limits;
* output shape and runtime dtype;
* token masking and pruning;
* normalization;
* exact MaxSim reduction;
* ONNX Runtime version and target;
* batch size, thread count, warmup policy, and timeout;
* model load, model-related RSS, and warm latency; and
* reference query vectors, document vectors, masks, and scores from the pinned
  official PyLate path.

Hash the canonical artifact, runtime, and inference contract as the
`lateOnContractDigest`. The Satori runtime must reproduce the pinned PyLate
vectors, masks, and scores within a checksum-sealed numerical tolerance. Python
may create reference evidence but must not become a Satori runtime dependency.

Do not assume that the INT8 ONNX file emits INT8 token vectors. Quantized model
weights may still produce FP32 output; measure and freeze the actual output
dtype.

LightOn's NextPlaid/ColGrep implementation is a Rust/ONNX reference and possible
bounded component. It does not replace Satori's chunks, primary retrieval,
publication identity, freshness, grouping, or disclosure authority.

Authority used to start C0:

* model card and comparison:
  https://huggingface.co/lightonai/LateOn-Code-edge
* artifact files:
  https://huggingface.co/lightonai/LateOn-Code-edge/tree/main
* pre-trained checkpoint:
  https://huggingface.co/lightonai/LateOn-Code-edge-pretrain
* Rust/ONNX multi-vector reference:
  https://github.com/lightonai/next-plaid

**Exit:** exactly one checkpoint and native runtime pass artifact provenance,
shape, mask, vector, MaxSim, determinism, and resource conformance. Otherwise
close Track C without scoring Satori tasks.

### C1 — query-time scoring prototype

At the start of C1, capture one candidate union from the exact production
candidate arms and depths then active. Reuse that identical captured union for
all C1 arms. Do not substitute arbitrary fixed BM25 or Potion depths, rerun
retrieval differently for a contender, or change production ranking.

Record the source revision and source-projection digest with that C1 capture.
Reconstruct candidate text from the recorded source revision and require the
digest to match before encoding. Do not store a second source-text copy in
Track C evidence.

Compare only:

| Arm | Second stage |
| --- | ------------ |
| B | Baseline ordering |
| B-L16 | LateOn scores at most 16 eligible candidates |
| B-L32 | LateOn scores at most 32 eligible candidates |

Rules:

* Candidate membership is identical across all three arms.
* Mandatory exact/path/configuration evidence remains pinned and cannot be
  displaced below required disclosure.
* LateOn changes only eligible semantic ordering.
* Canonical per-file, per-owner, and repository-region diversity is applied
  before selecting eligible candidates.
* Dense, lexical, and exact provenance remains attached to every candidate.
* The unscored tail retains baseline relative order.
* Candidate text uses the frozen Satori source projection.
* One query embedding is reused across all candidate scoring for that query.
* LateOn semantic order passes through Satori's unchanged grouping and
  diversity stages; their resulting final ranked result set is frozen before
  initial disclosure.
* `continue_search` performs no encoding or scoring; it exposes more of the
  frozen result set.
* Load failure, timeout, malformed output, out-of-memory failure, or explicit
  disablement returns the byte-equivalent baseline result.

C1 intentionally holds the source projection constant so the model is the only
changed variable. Do not choose among alternative projections after seeing
ranking results. If diagnostics later identify projection as the responsible
boundary, open a separately preregistered projection experiment with the model
and candidate union held constant.

Measure cold and warm operation separately:

* query encoding;
* candidate-document encoding;
* MaxSim scoring;
* end-to-end total latency;
* peak model-related and total RSS;
* retained token-vector count and bytes per candidate; and
* answer corrections, regressions, and candidate-owner recall.

Do not change LanceDB schema, publication identity, incremental indexing,
chunk lifecycle, sidecar recovery, primary retrieval, or Milvus behavior in C1.

### C2 — bounded experimental cache

Only if C1 passes the net-positive qualification gate, add an in-memory LRU
keyed by:

```text
lateOnContractDigest
+ candidate ID
+ exact source-projection digest
```

The cache is experimental and non-authoritative:

* missing entries are recomputed;
* invalid or mismatched entries are discarded;
* it cannot affect source freshness or candidate membership;
* entry count, bytes, TTL, and LRU behavior are bounded; and
* cold-cache and warm-cache latency are reported separately.

If any candidate required by the selected LateOn policy cannot be loaded or
encoded within the deadline, discard all LateOn scores for that query and return
the complete byte-equivalent baseline ordering. Never partially rerank from
whichever cache entries happened to exist.

### C3 — persisted sidecar

Admit a persisted multi-vector sidecar only when all of these are true:

* C1 passes the net-positive qualification gate;
* candidate-document encoding materially harms search latency;
* observed token-vector count and storage are acceptable;
* incremental invalidation is proven against Satori chunk identity and exact
  source-projection digest; and
* missing or corrupt sidecar state safely returns the byte-equivalent baseline
  result.

If any candidate required by the selected LateOn policy cannot be loaded or
encoded within the deadline, discard all LateOn scores for that query and return
the complete byte-equivalent baseline ordering. Never partially rerank from the
subset available in the sidecar or cache.

The sidecar is optional derived ranking acceleration. It is not source,
freshness, primary retrieval, or LanceDB publication authority. Missing entries
are recomputed within the all-or-nothing deadline; sidecar state never makes the
primary publication unsearchable. The `lateOnContractDigest` enters ranking and
evaluation identity.

If runtime output is FP32, each retained token vector costs at least:

```text
48 dimensions x 4 bytes = 192 bytes
```

For illustration only:

```text
128 retained tokens per chunk ~= 24.6 KB per chunk
10,000 chunks ~= 246 MB before metadata and index overhead
```

These are warnings, not predictions. C1 must measure the actual output dtype,
retained-token distribution, bytes per encoded chunk, and runtime pruning
before C3 can estimate or gate sidecar storage.

### C4 — cross-encoder fallback

Consider a small MiniLM or Jina ONNX cross-encoder only if:

* LateOn is unavailable, operationally unsuitable, or ineffective; and
* evidence still proves a post-retrieval semantic-ordering problem.

Do not test LateOn plus multiple cross-encoders simultaneously. A fallback
experiment requires its own checksum-sealed artifact, runtime, input, scoring,
latency, memory, and admission contract.

### Track C qualification rule

The revealed 36-task Potion suite may decide whether LateOn deserves further
engineering. Once used to design or select C0–C3, it is diagnostic evidence and
cannot become fresh held-out evidence.

The C1 prototype may continue only if one of these quality conditions holds:

* it fixes at least two previously incorrect answers; or
* it removes at least one hard miss.

It must also satisfy all of these:

* total correct-answer count is at least one higher than baseline Arm B;
* introduce no critical, exact-identifier, path, or configuration regression;
* preserve mandatory exact/path/configuration evidence;
* preserve candidate membership and candidate-owner recall;
* remain deterministic for identical fixed candidates; and
* remain within the checksum-sealed latency and memory envelope.

Passing this gate authorizes at most C2 or C3 investigation; it does not
authorize production. Production admission requires a new checksum-sealed
held-out evaluation, normally under Track B expanded release qualification.

**Exit:** stop unless C1 produces net-positive Satori answer evidence under the
frozen gate. Persist token vectors only when quality passes and measured
document encoding makes persistence decision-relevant. Otherwise retain the
Potion + BM25 + exact baseline.

---

## Track D — Semble diagnostic comparison

**Trigger:** Satori's Potion hybrid misses owners or answers that a lightweight
external system may plausibly recover, and that comparison could change the
responsible Satori owner or next decision.

Scope:

* pin one Semble revision and the model it actually loads;
* run it against the same repository revisions and tasks;
* report it as a separate full-stack diagnostic;
* do not treat it as an embedding-only comparison;
* localize any gain to chunking, lexical enrichment, dense retrieval, ranking,
  grouping, or disclosure; and
* port only the responsible idea when it fits Satori's backend-neutral and
  publication-aware architecture.

Semble's own chunking, storage, freshness, ranking, and disclosure remain
separate from Satori authority. A full Semble-engine adapter requires a separate
architectural RFC.

**Exit:** the comparison identifies a causal, decision-relevant difference or
closes without a Satori change.

---

## Track E — freshness improvements

**Trigger:** Potion's measured speed materially changes the feasible freshness
experience and the independent freshness authority approves investigation of a
semantic change.

Scope remains owned by `INCREMENTAL_INDEX_FRESHNESS_PLAN.md`:

* dirty epochs;
* adaptive coalescing;
* search joining a required update;
* maximum publication delay;
* continuous-edit behavior; and
* honest freshness reporting.

Do not couple freshness redesign to the Potion provider or productization
merge.

**Exit:** the freshness plan accepts or rejects its own change under its own
publication and recovery evidence.

---

## Track F — alternative local embeddings

**Trigger:** critical expected owners are absent from all first-stage arms in
the complete eligible frozen union across the owner-query matrix, or Potion
materially exceeds the resource envelope. Absence from dense retrieval alone
does not satisfy this trigger when sparse, exact, or configuration retrieval
recovers the owner.

First produce a bounded failure analysis identifying whether the cause is:

* model representation;
* document projection;
* lexical recall;
* fusion;
* unsupported-language behavior; or
* runtime/resource cost.

Selecting CodeRankEmbed, CodeSage, or another model requires a new
checksum-sealed proposal with:

* artifact and license review;
* native runtime and resource analysis;
* a new embedding inference-contract digest and publication fingerprint;
* a fresh publication; and
* focused comparison against the failed Potion cases.

Do not automatically begin an open-ended model tournament. A new model is
decision-relevant only when the Potion failure analysis identifies a model or
resource boundary that the candidate could plausibly change.

**Exit:** approve one bounded candidate proposal or close local-model selection
without implementation.

---

## Program order

```text
direct L4 retrieval-relevance comparison accepted
    -> package and checksum-verify the pinned Linux x64 Potion runtime
    -> make Potion the default for new Linux x64 offline installations
    -> preserve explicit and existing managed Ollama installations
    -> keep the general connected Voyage install default unchanged

separately authorized A0.1 platform candidate
    -> evaluate one candidate in the fixed order
    -> add only a passing candidate to experimental support
    -> do not extend the default decision automatically

Potion candidate recall passes but post-retrieval exposure loses answers
    -> run read-only C-preflight-Q
    -> trace the expected owner through every candidate stage
    -> separately authorize and test C-preflight-D
    -> complete the broader frozen owner and counterexample matrix
    -> C0 LateOn conformance only when semantic ordering remains responsible
    -> capture the current production candidate union once for LateOn C1
    -> C1 B / B-L16 / B-L32 on the revealed diagnostic tasks
    -> stop if there is no material answer gain
    -> C2 cache or C3 sidecar only when its own trigger passes
    -> fresh Track B held-out evidence before production admission

Satori-specific quality remains causally unexplained
    -> Track D Semble diagnostic

freshness improvement is independently authorized
    -> Track E

Potion retrieval or resources fail
    -> Track F under a new proposal
```

The direct lean L4 comparison and Linux x64 Track A implementation are complete.
Track A0.1 and Tracks B--F may run only when their triggers are demonstrated and
they receive their required authority. Track order does not grant authority, and
no track is a prerequisite merely because it appears in this document.

The comprehensive offline plan that preceded this split remains historical
source material in version control. It is not an active execution sequence.
