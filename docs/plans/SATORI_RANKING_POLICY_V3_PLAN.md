# Satori Ranking Policy V3 Plan — Hybrid Constrained Learned Ranking + Neural Evidence

**Revision 2 (2026-08-06):** revised per the reviewed small-agent design
(`docs/superpowers/plans/2026-08-05-satori-ranking-v3-reviewed-small-agent-design.md`).
The revision adopts the **bounded residual-ranking** architecture, corrects the evaluation,
grading, artifact-trust, and execution-shape problems found in revision 1, and defers
recall-changing work to V3.1. Revision 1's verified problem statement, locked conclusions,
and evidence discipline remain binding except where this revision explicitly amends them.

**Revision 3 (2026-08-06):** amended per the second review verdict (conditional approval;
13 findings — 8 blocking + 5 corrections, §3.1 disposition). Adopts: the admission-freeze
sequence (§5.1); the qualification-flow resolution (G1/G2 independent of E4; `learned_v3`
first selectable at I4; no unqualified artifact loadable by product configuration); the
deterministic/neural evidence split; the single E3/E4/H9 decision boundary with D1 as a
diagnostic comparator only; security-hardening integration as a Gate-0 prerequisite; the
shared descriptor-bound trusted-file reader; the artifact applicability contract; the
corrected exact-pin neural-gate rule; removal of the production shadow selector; corrected
trace-schema names; test-first F7; enforceable held-out wording; and the small-agent task
splits and per-card dispatch contract (§6). Revision 2 remains binding except where this
revision explicitly amends it.

**Revision 4 (2026-08-06):** plan-executability amendments per the open-question
disposition (items #9–#13, §3.2). Adopts: the **provider-derived neural reorder design**
(Design A) with a fully specified neural ordering/gate-parameter contract — no locally
trained neural policy in V3.0; the **R0.1A fixture-modernization task** as an explicit
Gate-0 prerequisite; the explicit qualification **state machine**
(`offline_qualified` → `pending_heldout` → `activation_qualified`) with immutable
registry-version transitions; the **I4A registry-writer task** (compare-and-swap against
the previous registry digest); and the clarification that **zero-weight identity and
frozen-admission identity are distinct proofs** (item #10 rejected as a blocker).
Revision 3 remains binding except where this revision explicitly amends it.

**Revision 5 (2026-08-06):** execution-readiness amendments per the third review (7
remaining blockers + 6 corrections, §3.3). Adopts: the **F9 registry writer** placed in
Wave F (frozen and digest-sealed **before** held-out opening — I4 becomes its
post-acceptance execution); the **canonical qualification state machine**
(`OfflineQualificationVerdict` vs `RegistryArtifactStatus`, with the concrete **H10**
pending-held-out transition); the **append-only registry version layout** with a real
locking protocol (O_EXCL lock file; atomic `current` pointer; immutable version files);
**Design A Option A** (slot-bounded only — `maximumNeuralResidual` removed; any stable
provider permutation within admitted positions) with **provider-specific normalized
margin thresholds** and `acceptedProviderKeys ⊆ supportedProviderKeys` validation;
**exact-control ownership before residual scoring** (pinned top stays fixed at position
zero); explicit **H3/H4 dependencies on E4/D3**; and the **behavioral hardening gate**
(R0.1 consumes a hardening acceptance receipt with tests, not ancestry alone).
Revision 4 remains binding except where this revision explicitly amends it.

**Revision 6 (2026-08-06):** execution-readiness amendments per the fourth review (3
remaining blockers + 8 corrections, §3.4). Adopts: the **G7 runtime implementation
seal** after Wave G (F9's "before Gate 1" timing removed as impossible — the seal binds
the full runtime/evaluation/writer implementation and is the prerequisite for Wave H
and the I1 opening record); **transition-specific writer operations** enforcing the
legal registry state machine with receipt-content validation and status-specific
receipt fields (absent → `activation_qualified` forbidden); the **single exact-control
policy** (when `shouldSkipRerankForExactPin` holds: no residual, no provider reorder —
baseline-B order unchanged); `pending_heldout` explicitly **nonselectable everywhere**
(F2/F6/G6); **exclusive-creation immutability** (`O_CREAT|O_EXCL` version/receipt files,
precise `current` pointer spec, safe stale-lock recovery); **trusted-directory
validation** for the whole registry hierarchy; the **complete normalized-margin
contract** (epsilon, score direction, tie/NaN/edge semantics, provider-key
simplification); **H5 diagnostic-only with no escape clause**; and the **hardening
receipt bound to the frozen integration HEAD**. Revision 5 remains binding except where
this revision explicitly amends it.

**Revision 7 (2026-08-06):** execution-readiness amendments per the fifth review (5
remaining blockers + 7 corrections, §3.5). Adopts: the **artifact execution-mode
union** (`NeuralReorderPolicy = mode "disabled" | mode "provider_derived"` — E4
serializes only the E3-selected mode; H9 qualifies that exact mode; F5/G2 cannot invoke
the permutation under `disabled`); the **A11 qualification-receipt schemas** task
(parsers + issuer-authority rules; F9 accepts only parsed receipt objects); the **G7
executable manifest** covering the complete H/I evaluation and adjudication chain (not
only runtime components); **provider/model-bound qualification**
(`qualifiedRerankers` in the activation receipt; F5/F6/G4 reject learned mode for
unlisted reranker identities); the **D5 split** (preregistered resource contract + **G6A**
sealed implementation resource harness after G2); the **I1→I4 registry freeze**
(activation requires `expectedRegistrySha256 ===` the exact H10 digest verified at I1);
explicit **registry cardinality** and **platform capability/fail-closed** rules; the
clarified **post-opening allowed-transition set**; removal of the hardening `--grep`
requirement; explicit **G7 dependencies on every H card**; and exact **trace
terminology** (Core `semantic_search_candidate_trace_v2` vs capture
`search_candidate_survival_v3`). Revision 6 remains binding except where this revision
explicitly amends it.

**Revision 8 (2026-08-06):** dispatch-integrity amendments per the sixth review (§3.6).
Adopts: **retirement of the stale companion document** (`2026-08-05-satori-ranking-v3-reviewed-small-agent-design.md` — SUPERSEDED, historical design input only, not dispatch authority) with an explicit **R0.1B dispatch-card materialization task** as the only source of dispatch cards; **regenerated source anchors** (line numbers demoted to convenience data; R0.1 regenerates §2/§10 anchors at the frozen post-hardening HEAD); the **D6/D1 and H2/D1 graph corrections** (D6 depends on A9, D2, D3 — the diagnostic comparator never blocks the LOFO path; H2 consumes the D1 sealed replay artifact); **per-task packet semantics for C2/C3**; the **provider-key invariant** `keys(neuralEvidencePolicy.providers) ⊆ applicability.supportedProviderKeys`; and the **E2 resource-language correction** (production p95/RSS belongs to G6A/H8 only). Revision 7 remains binding except where this revision explicitly amends it.

**Revision 9 (2026-08-06):** dispatch-integrity amendments per the seventh review (§3.7).
Adopts: the **SUPERSEDED banner inside the companion file itself** (not only in the main
plan's Related Documents); **staged dispatch-card generation** (R0.1B covers R0.1A/R0.2
and Gate 1; R1.6 generates and seals Wave A cards after `CONTRACT_SEAL.json`; each wave
gate generates cards only for the next dependency-ready wave — all-waves generation at
R0.1B is impossible and rejected); the **machine-readable card-set manifest**
(`ranking_v3_dispatch_cards_v1` with plan/commit/tree/contract/prerequisite bindings,
canonicalization rules, and supersession revocation); the **authoritative
SOURCE_ANCHORS.json** anchor manifest (line numbers in §2/§10 become declared snapshots);
the **optional-comparator resolution** (D1 mandatory per R1.3 when sealed so; otherwise
H2 stays diagnostic, H6–H9 do not depend on it, and the H9 receipt records
`groupedComparator: available | unavailable | not_required`); and the **C3A repository
proposal assembly** owner with packet-scoped output paths. Revision 8 remains binding
except where this revision explicitly amends it.

**Revision 10 (2026-08-06):** freeze-and-dispatch corrections per the eighth review
(§3.8). Adopts: the **Gate-0 reorder** (R0.0 hardening → **R0.1A fixture repair
pre-freeze** → R0.1 freeze of the post-hardening, post-fixture-repair HEAD →
R0.1B cards for R0.2+Gate 1 → R0.2 baseline from that exact HEAD); **named DX.<wave>
card-generation tasks at every wave boundary** with immutable
`<date>-<sequence>-<scope>` directories and executed-cards-never-revoked semantics;
**mode-dependent qualification** (`disabled` ⇒ empty `qualifiedRerankers`, no reranker
identity required; `provider_derived` ⇒ non-empty + identity match; enforced by
A11/H9/H10/I4/F6/G4); **F10/F11 as the owners of the Wave H/I executables** that G7
seals; **H_SELECTED_MODE_REPLAY** consumption for H6–H8 (nonselected replays are
optional diagnostics); **C4 depends on C3A**; **explicit Wave I dependency edges**;
mode-conditional E4 serialization wording; `keys(neuralEvidencePolicy.providers)` only;
evidence-timing and grading wording; and the sequential ownership row for the
search-quality evaluator. Revision 9 remains binding except where this revision
explicitly amends it.

**Revision 11 (2026-08-06):** reconciliation amendments per the ninth review (§3.9).
Adopts: the **three sealed runtime pipelines** — the existing fixed rerank-RRF bucket
(`1/(10+rank)`, weight 1.0) remains frozen **for baseline mode only**; learned modes
(deterministic-residual `disabled` and `provider_derived`) **replace** the fixed bucket
with residual scoring and, when selected, direct slot-confined provider permutation;
**zero residual is a pre-rerank deterministic-score identity, not a full-product
identity** (byte-identical identity belongs to baseline mode); the **canonical evidence
order** (eligibility → pre-rerank baseline scoring → admission snapshot →
deterministic evidence → residual → optional provider permutation); **G6B/G6C
toolchains** (renamed from F10/F11) sealed by G7 with the **I0→I4 receipt chain** (each
link binds the previous receipt digest); the **B9 authoritative tuning survival-v3
corpus** (C1 depends on A8+B9); **one provider/model per qualification cycle** with the
concrete **`QualificationRegistryEntryV1`** + `qualificationScopeKey` schema; **H5
removed from V3.0**; `SelectedModeReplayReceipt` routing; the **normalized-margin
formula as the only choice**; narrowed locked conclusion #5; **card types**; the
D2→A5/E2→D4 edges; D1's sealed search parameters; the **F12 bundled-artifact packaging**
task; and post-opening configuration selection limited to sealed activation-qualified
hashes. Revision 10 remains binding except where this revision explicitly amends it.

**Revision 12 (2026-08-06):** naming-and-chain corrections per the tenth review (§3.10).
Adopts: the **`preRerankBaselineScore` / `baselineModeFinalScore` / `deterministicV3Score`
naming** with the mode-conditional pipeline and the **`zeroResidualPreRerankScoreIdentity`
proof** (scorer-level equality with pre-rerank baseline; full envelope identity only in
B8/G1 baseline-mode parity); **F12 redefined as bundled-baseline-only packaging**
(qualified artifacts and the registry are external administrator-controlled paths —
packaging pre-qualification state was impossible); the **held-out rejection chain**
(`HeldoutRejectionReceiptV1`, `rejectPendingVersion`, **I3R** pending→revoked branch);
the **provider-derived target sealed before B9** (`providerDerivedTarget` in
R1.2/R1.4; B9 captures and seals the complete neural evidence for that exact
provider/model; E2/E3 may select mode but never the provider); the **mode-dependent
applicability contract**; **G6B/G6C formally placed in Wave G** with a closed
dependency order (G1→G2→G3/G4/G5→G6→G6A→G6B→G6C→G7); corrected
`SelectedModeReplayReceipt` producers (G6B implements the generator; H3/H4 produce the
receipt); the **global card-type contract**; and the stale naming/execution-shape/
risk/§10 cleanups. Revision 11 remains binding except where this revision explicitly
amends it.

**Status:** investigation complete; planning gate. No implementation authorized by this
document. Each gate/wave requires its own authorization before execution.
**Date:** 2026-08-06
**Revision 1 date:** 2026-08-05; review base `633c1d4a334655163844af6c3f6905d0ca5df793`.
**Execution base:** actual integration HEAD `9c85b22ac6067256c552fcade07234eb0ad64533`
(verified 2026-08-06: clean tree; **search-integrity (W-fix) work merged**; **security-hardening
work NOT merged** — it exists only as unmerged branches
`refs/heads/integrate/security-hardening-20260805` + `refs/heads/task/security-hardening-0-baseline`
… `12`; no hardening commit appears in HEAD's history; `git merge-base HEAD
integrate/security-hardening-20260805` = `94a3dc6`, an ancestor of HEAD, so the branch
diverged from the marker-test line and its commits were never integrated). **The hardening
integration is a Gate-0 prerequisite (locked conclusion #11): the execution base for
R0.1/R0.2 is the post-hardening integration HEAD, frozen; until the owner merges
`integrate/security-hardening-20260805`, Gate 0 stays blocked and V3 does not baseline on
unhardened master.** Every revision-1 code claim was verified at the stated base with
line numbers as generated convenience data (symbol names + commit-bound links are the
primary reference; §2/§10 anchors are regenerated at Gate 0, R0.1 — sixth review, item
2). See §10 evidence index.
**Primary owner:** `packages/mcp` (search execution + ranking policy) with `packages/core`
(fusion, trace, reranker contract) and `evals/` (metric + judgment authority).
**Public projection owner:** `packages/mcp`.

**Related documents (coordinate, do not duplicate):**
- `docs/superpowers/plans/2026-08-05-satori-ranking-v3-reviewed-small-agent-design.md` —
  **DELETED (2026-08-06) — the Revision-2 reviewed design was retired and removed.
  Not dispatch authority (it never was post-Rev-8).** Dispatch cards are
  generated exclusively from §6 of this plan by **R0.1B/DX.<wave>** after R0.1 resolves
  exact files, line regions, signatures, and commands (sixth review, dispatch blocker;
  owner deletion 2026-08-06).
- `SATORI_DEEP_LATEON_RERANKING_AND_PAGINATED_DISCLOSURE_PLAN.md` — complete; invariants #1–10;
  held-out evaluation **currently closed**.
- `SATORI_CROSS_REPOSITORY_RANKING_ABLATION_PLAN.md` — complete; baseline `B` retained;
  sealed-contender replay mechanism; R5 single-opening rule.
- `LANCEDB_SEARCH_TUNING_AND_AGENT_ANSWER_QUALIFICATION_PLAN.md` — Phase 2 negative;
  "do not tune against aggregate agreement alone."
- `docs/superpowers/plans/2026-08-05-search-integrity-and-runtime-honesty.md` — W1–W7 fixes,
  **landed in code at the execution base** (bounded `must:` lane, reranker timeout/retry
  bounds); its `docs/evidence/search-integrity-baseline-20260805/BASELINE.md` is the
  pre-change baseline receipt.
- `SATORI_OFFLINE_LATEON_OPERATIONAL_QUALIFICATION_PLAN.md` + D32 decision — D32-v2 offline
  Linux default, no held-out, risk accepted by owner.
- `SATORI_DEEP_PAGINATION_P0_AUTHORITY_AMENDMENT.md` — frozen contract constants.
- `PERSISTED_SYMBOL_ANALYSIS_METADATA_PLAN.md` — unrelated, not affected.

---

## 1. How to read this plan (for an agent with zero context)

This is a **roadmap + design plan** in satori's plan convention. It does not authorize
implementation. Each gate/wave contains tasks with:

- **Files** — exact paths to create/modify/test.
- **Interfaces** — exact types/signatures consumed and produced.
- **Steps** — ordered work with verification commands.
- **Acceptance** — observable proof of completion.

Repo discipline that binds every task:

- **Evidence-first**: any public-behavior change requires a dated
  `docs/evidence/<experiment>-<date>/` receipt before merge.
- **Preregistration**: gate thresholds, training contract, feature contract, and decision
  contract are sealed **before** any tuning or held-out result is opened (R1 wave).
- **Sealed artifacts**: manifests, contracts, and policies are frozen with SHA-256 before
  contender replay (`r2-policy-seal.json` pattern).
- **No post-opening changes**: after held-out opening — no source-code changes; no
  model/artifact changes; no threshold, contract, feature, or evaluator changes; no
  deletion or rewriting of evidence. **Permitted (tenth review C1):** preregistered
  adjudication; append-only registry transitions (I4/I3R are declared allowed
  transitions); **configuration-only selection among baseline and already sealed,
  activation-qualified artifact hashes**; and **append-only rollout receipts for every
  selection**. No new artifact, source, threshold, evaluator, or hash may be
  introduced.
- **Focused test commands**: run exact files directly — `node --import tsx --test <file>`.
  Do **not** use `pnpm --filter <pkg> test -- <name>`: package test scripts expand broad
  globs before the extra argument and do not narrow the run. MCP tests that construct the
  full runtime require the test-state-root import used by existing MCP tests.
- **Contract constants stay hardcoded or frozen** (§5.2); only *relevance opinions* move to
  learned policy, and only as a **bounded residual** over the exact baseline score (§5.1).

---

## 2. Orientation: satori ranking today (verified at `9c85b22`, 2026-08-06)

### 2.1 The current deterministic score

`packages/mcp/src/core/search-ranking-policy.ts:392`:

```ts
export function computeSearchCandidateFinalScore(input: {
    fusionScore: number;
    lexicalScore: number;
    pathMultiplier: number;
    changedFilesMultiplier: number;
    agentFitMultiplier: number;
    entrypointOwnerScoreBoost: number;
}): number {
    return (
        (input.fusionScore + input.lexicalScore)
        * input.pathMultiplier
        * input.changedFilesMultiplier
        * input.agentFitMultiplier
    ) + Math.min(
        SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,   // 0.35
        Math.max(0, input.entrypointOwnerScoreBoost),
    );
}
```

This is **multiplicative in the multipliers**. A linear model over raw inputs cannot
generally reproduce it; revision 2 therefore learns a **residual on top of the exact
baseline score** (§5.1), so a zero-weight artifact is a **pre-rerank deterministic-score
identity** (tenth review B1) — not a full-product identity.

### 2.2 The neural reranker's actual contribution (three RRF layers, not two)

`search-execution.ts:649-650` adds a fixed rank term **into `fusionScore`** — inside the
multiplicative chain:

```ts
const rerankRrf = 1 / (SEARCH_RERANK_RRF_K + rank);            // 1 / (10 + rank)
rerankSlice[idx].fusionScore += SEARCH_RERANK_WEIGHT * rerankRrf;  // += 1.0 × rrf
```

Plus core arms k=100 (`packages/core/src/core/vector-candidate-fusion.ts:12`
`VECTOR_CANDIDATE_RRF_K_V1 = 100`) and MCP multi-pass k=60
(`search-constants.ts:1` `SEARCH_RRF_K = 60`). **Three fixed RRF constants (100/60/10) +
a fixed reranker weight (1.0).** These stay frozen in V3.0 (§7 deferral).

### 2.3 Raw reranker scores are fetched and then discarded

- `RerankResult { index, relevanceScore, document? }` (`packages/core/src/reranker/reranker.ts`).
- Voyage parses `relevance_score` with finite validation
  (`voyageai-reranker.ts:254-262`); LateOn validates finite `relevanceScore`
  (`lateon-reranker.ts:778`) over worker-computed `maxSimScore`
  (`lateon-reranker-worker.ts:88-105,231-254`).
- Call site discards it: `search-execution.ts:566` — `let rerankResults: Array<{ index: number }> = []`.
  Only `index` survives as `rerankRanks`.
- No calibration exists anywhere.

### 2.4 The constants inventory (relevance opinions — V3 targets, grouped)

| Group | Values | Location |
|---|---|---|
| Path-category multipliers | 39 values (13 categories × 3 scopes): runtime core 1.35, tests 0.90, generated 0.30, fixture 0.35, docs 0.45, entrypoint 1.20, … | `search-constants.ts:73` `SCOPE_PATH_MULTIPLIERS` |
| Agent-fit multipliers | 13 values: writer-owner 2.25, writer-non-owner 0.55, implementation symbol 1.25 / chunk 1.15 / script 1.30, test-intent 1.25, tests-without-intent 0.45/0.65, implementation-test demotion 0.25, type 0.72, schema 0.80, anonymous 0.70 | `search-ranking-policy.ts:7-21` |
| Agent-fit classifier | regex heuristics: writer-verb sets, symbol-role regexes, ≥2 domain-term threshold | `search-ranking-policy.ts:130-160,417-494` |
| Entrypoint owner boost | 0.35 additive, `ENTRYPOINT_OWNER_INTENT_KINDS` gated | `search-ranking-policy.ts` |
| Changed-files boost | 1.10, ≤50 changed files | `search-constants.ts:18-19` |
| RRF constants | 100 (core) / 60 (mcp) / 10 (rerank) — **frozen in V3.0** | `vector-candidate-fusion.ts:12`; `search-constants.ts:1,21` |
| Rerank weight | 1.0 — **frozen in V3.0** | `search-constants.ts:22` |
| Rerank admission | TOP_K 50, ambiguous min 12, per-result 4/2, supplemental 2/family — **frozen in V3.0** | `search-constants.ts:20,23-26` |
| Expansion trigger | primary scoped < 5 candidates | `search-execution.ts:81` |
| Candidate depth | `clamp(max(limit×8, 32), 80)` — **frozen in V3.0** | `search-policy.ts:11-12,67` |
| Lexical weight per intent | quoted 1.35, identifier 1.35, mixed 0.10/0.30, uncertain 0.60, semantic 0.00/0.18 | `search-query-planning.ts:648-656` |
| Staleness buckets | fresh 30 min / aging 24 h | `search-constants.ts:47` (`STALENESS_THRESHOLDS_MS`) |
| Policy identity | `SEARCH_CANDIDATE_FINAL_SCORE_POLICY_ID = "search_candidate_final_score_v2"` | `search-ranking-policy.ts:22` |

### 2.5 Contracts — keep hardcoded (verified; the revision-1 list is complete)

- `must:`/`exclude:`/`lang:`/`path:` filtering with removal ledger; must-satisfied never
  ranks below must-unsatisfied (`compareSearchCandidates` `mustMatchesFirst`,
  `search-ranking-policy.ts:268-276`).
- Exact-symbol/identifier fast path (`search-exact-fast-path.ts`) + exact-pin rerank skip
  (`shouldSkipRerankForExactPin`, `search-execution.ts:288-318`).
- Freshness/fingerprint gates (`search-frontdoor.ts:229-380`) + generation-receipt-bound reads.
- Ceilings: `SEARCH_MAX_CANDIDATES=80`, `SEARCH_MAX_DIAGNOSTIC_CANDIDATES=160`,
  `SEARCH_MAX_FROZEN_RESULTS=200`, disclosure default 10, grouped 128 KiB / debug 2 MiB,
  rerank input 1 MiB, docs 200 lines/4000 chars, frozen cache 32 entries/16 MiB/15 min,
  tracked-lexical 16 / dirty-overlay 16 / live-path 8, must-retry rounds 2.
- Fail-closed reranker fallback: deterministic baseline order + `RERANKER_FAILED` + truthful
  diagnostics; no partial application (full-set parse validation before any score mutation).
- Pagination: one immutable frozen ranked set; continuation never re-ranks; ranked-set
  binding `search_ranked_set_binding_v1` carries `rankingPolicyIdentity` +
  `rerankerIdentity` (`search-result-set-identity.ts:37-56`) and revalidates on continuation
  (`handlers.ts:5250-5285` → `SEARCH_RESULT_SET_STALE`).

### 2.6 Feature availability at scoring time (verified; revision-2 corrections marked)

`SearchCandidate` (`search-execution.ts:145-166`): `result, baseScore, backendScore,
backendScoreKind, backendScoreKindsSeen[], fusionScore, lexicalScore, finalScore,
pathCategory, pathMultiplier, changedFilesMultiplier, agentFitMultiplier, agentFitReason,
entrypointOwnerScoreBoost, entrypointOwnerScoreReason, passesMatchedMust,
exactLexicalMatch, exactMatchPinned, rerankAdjusted, retrievalPasses[],
rerankFamilyId?, rerankDocumentUtf8Bytes?`.

| V3 feature group | Available today? | Revision-2 disposition |
|---|---|---|
| Dense/lexical per-arm rank+score at scoring time | ✗ discarded in both fusions (only summed RRF + max survive) | retained as explicit stage ranks via the existing **capture survival schema v3**
(`search_candidate_survival_v3`, Wave A/B), not a parallel arm-evidence system |
| Number of arms containing candidate | ◑ derivable from `retrievalPasses.length` | ✓ feature (mcp layer) |
| Primary/expanded/exact/must/live membership | ✓ `retrievalPasses` | ✓ feature |
| Candidate depth | ✗ no such concept | **deferred to V3.1**; V3.0 records explicit `rawDenseRank?/rawLexicalRank?/rawFallbackLexicalRank?/coreFusionRank?/mcpUnionRank?/postEligibilityRank?/rerankerAdmissionRank?` |
| Exact phrase / identifier match | ◑ `exactLexicalMatch` (token-boundary); quoted-phrase per-candidate ✗ | ✓ feature |
| Path category / file-type classification | ✓ 13 categories + isTestPath/isDocPath/isGeneratedPath/isFixturePath | ✓ one-hot features (never ordinal) |
| Symbol role | ✓ regex-derived (`classifyAgentFitSymbolRole`) | ✓ one-hot features |
| Owner-family identity | ✓ `ownerSymbolKey`/`ownerSymbolInstanceId`/`rerankFamilyId` | **gating key only — forbidden as a scoring feature** |
| Authoritative owner evidence | ◑ narrow: pyproject `[project.scripts]` only (`entrypoint-owner-evidence.ts`) | ✓ boolean feature |
| Fresh/current-source evidence | ✓ `stalenessBucket` + dirty_overlay/live_path passes | ✓ boolean features |
| Query class / intent | ✓ discrete (`route.kind`, `intent`); ✗ no probabilities — regex booleans + 3-level `SearchIntentConfidence` | ✓ one-hot/numeric features; mapping recorded in the feature contract |
| Explicit operator presence | ✓ `ParsedSearchOperators` | ✓ boolean features |
| Reranker rank | ✓ (rank-only use) | ✓ within-query percentile + margins |
| Reranker raw score | ✗ discarded | ✓ retained (Wave B3), within-query percentiles only; **no calibration claim in V3.0** |
| Provider/model identity | ◑ `RerankerIdentity` | **gating key only — forbidden as a scoring feature** |

### 2.7 Evaluation foundation (verified — strong, but binary; revision-2 corrections)

- Manifests: `cross-repository-v2.manifest.json` (6 repos: tuning `satori`,
  `tradingview_ratio`, `noor_and_knot_shopify`; held_out `promptready`, `fastcontext`,
  `recovery_dashboard`) and `cross-repository-v3.manifest.json` (**12 repos: 6 tuning —
  gitnexus, bookmark_ai_organizer, duas, vox_infinity, rpc_learner_engine, edge_tts_app;
  6 held_out — promptready, fastcontext, recovery_dashboard, ai_studio_prompt_library,
  portfolio, supply_chain_api**; frozen revisions + tree SHA-256). *Correction to
  revision 1: v3 has 12 repos, not 11; `portfolio` and `supply_chain_api` are also
  held_out.* `tradingview_ratio` is already `split: tuning`.
- Task suites: `evals/search-ranking/task-suites/<repo>-r0.{candidate-tasks,
  negative-exposure}.json` — versioned, binary oracles `{kind: 'owner'|'negative', …}`.
- Pipeline: `scripts/satori-search-candidate-{capture,replay,score}.mjs` — live capture
  with `mcp_replay_signals` binding → fully offline replay through frozen-component
  policies → **binary owner-match scoring (no graded tiers today)**. Capture requires
  `--require-replay-ready` for top-160/lexical-fallback authority.
- Adjudication: `satori-search-ranking-r2.mjs` (10,000 bootstrap resamples, 97.5% CI,
  frozen thresholds), `r3.mjs` (SHA-256-pinned tool artifacts), track-O
  (`satori-lateon-track-o-o3/o4.mjs`) with `acceptableAlternativeOwners` +
  `hardNegativeExposureAt3` (threshold 0.02).
- Metrics in use: Owner@1/3/10, MRR, hard-negative exposure@3. **No nDCG anywhere.
  No stage-survival measurement.** Both are added in V3.0 **inside the existing
  search-quality evaluator authority** (Wave A10/C6), not a second metric implementation.
- Held-out isolation: opening records (`satori-track-o-heldout-opening.mjs`), sealed
  policies (`r2-policy-seal.json` pattern in
  `docs/evidence/corrected-ranking-r2-20260730/`), receipts asserting held-out stayed
  sealed. **Correction to revision 1: held-out tasks are procedurally protected, not
  cryptographically unreadable** — the builder source contains their definitions. The
  validity rule is *no tuning against held-out outcomes*, enforced by opening records and
  access controls. Nothing becomes "unseen again" after opening.
- `evals/search-quality/`: deterministic end-to-end ordering fixture (`FIXED_NOW`,
  `REQUIRED_LIMITS [1,3,5,10,20]`, hash-bound) — **the metric authority to extend**.

---

## 3. The verified problem statement

Every revision-1 claim was verified at `9c85b22` on 2026-08-06 (§10; line numbers are
convenience data — anchors regenerated at Gate 0). The review added
these binding corrections:

| Revision-1 claim/design | Review correction |
|---|---|
| "Identity learned policy reproduces baseline" | **Mathematically invalid as stated**: baseline B is multiplicative; a linear model over raw inputs cannot generally reproduce it. V3.0 learns a **residual** on the exact pre-rerank baseline score — zero residual is the **pre-rerank score identity** (tenth review B1; not a full-product identity). |
| New per-arm evidence output (`retainArmEvidence`) | **Duplicate authority**: the existing candidate-survival trace already records raw dense/lexical/fallback/core-fusion/MCP/removal stages. Extend the existing capture survival schema to v3; derive runtime evidence from the same authority. |
| New `scripts/ranking-metrics.mjs` | **Duplicate metric authority**: extend the existing search-quality evaluator. `score.mjs` gains only a backward-compatibility adapter. |
| Learned fusion weights / candidate depth as V3 features | **Recall/ranking conflation**: they change candidate membership and cannot be score features. Deferred to a separate V3.1 recall-policy project. |
| `ownerFamilyIdentity` / `providerModelIdentity` hashes as features | **Identity leakage**: high-cardinality identities are gating keys, never numeric features. |
| `candidateDepth = limitRank + passCount` | **Undefined**: two different concepts. V3.0 uses explicit stage ranks (2.6). |
| Graded labels as a code task | **Authority problem**: grades are human-reviewed. Agents produce source-bound judgment packets; two independent proposals + adjudicator resolve labels. |
| New held-out grading while held-out is closed | **Contradiction**: grading IS opening. V3.0 grades tuning data only; existing held-out authority is preserved untouched for one adjudication. |
| Train + select on one tuning population | **Overfitting risk**: add leave-one-repository-family-out cross-validation; select hyperparameters from out-of-fold results only; refit once after sealing. |
| "Isotonic/Platt-style" calibration | **Underspecified**; raw scores may not be cross-query comparable. V3.0 uses provider-local within-query percentiles and margins; no probability claim. |
| `qualityReceiptSha256` inside the artifact | **Circular qualification**. Split: immutable model artifact + qualification registry binding exact artifact SHA-256 → receipt SHA-256 + service class. |
| Shadow mode with `shadowApplied` diagnostic | **Contradicts byte identity**. V3.0 shadow = offline replay + bounded in-memory/test sink; no public field, no persistent log. |
| `pnpm --filter <pkg> test -- <name>` | **Does not narrow the run** (broad glob expansion). Use exact `node --import tsx --test <file>` commands. |
| Six tasks editing `search-execution.ts` | **Merge bottleneck**. Only two tasks ever edit it: evidence-integration owner (B5) and runtime-integration owner (G1/G2), sequential. |
| Policy hash in index/runtime receipts | **Index receipts unchanged** (ranking policy does not affect index construction). Record in startup diagnostics, search diagnostics, and ranked-set bindings. |

### 3.1 Second review disposition (2026-08-06, conditional approval — 13 findings)

> **Historical record — superseded, non-normative.** Effective design is §5, §6, and the
> latest disposition table (§3.3/§3.4). Rows below may quote superseded wording (e.g.
> `qualified | revoked`, `qualityReceiptSha256`, `I4A`); do not treat them as current
> requirements.

| # | Finding | Disposition in this revision |
|---|---|---|
| 1 | Residual changes `finalScore` before `selectRerankCandidates`, so learned scoring can change reranker admission — "admission frozen" is false | §5.1 defines the binding admission-freeze sequence; §6 G1/G2 add zero-failure admission tests |
| 2 | Qualification flow deadlocked (E4→G1 dependency; learned_v3 requires qualification; H after G6; I4 after held-out) | §5.3.8 + Waves G/H/I: G1/G2 integrate a generic scorer on **synthetic test artifacts** (no E4 dependency); H evaluates the sealed E4 artifact **only through offline/evaluation authority**; **I4 is the first point the product selector may return `learned_v3`**; product configuration has no unqualified-artifact path |
| 3 | `SearchRankingEvidenceV1` mixes deterministic (pre-scoring) and neural (post-provider-response) evidence | §5.3.2 splits into `DeterministicRankingEvidenceV1` (residual feature vector = deterministic only) and `NeuralRankingEvidenceV1` (exclusively for `neuralEvidencePolicy` + admitted-slot permutation) |
| 4 | E3 and H9 both select a contender; grouped contender undeployable through the residual runtime | §6 Waves D/E/H: one decision boundary — E3 selects family + hyperparameters from out-of-fold; E4 refits the exact selected artifact; H qualifies/rejects the **exact E4 artifact**; H9 = `qualified \| rejected \| insufficient_evidence`; D1 grouped tuning is a **diagnostic comparator only** (a material win ⇒ "learned ranking not justified" + a separate deterministic-retuning production plan) |
| 5 | Non-goal 12 ("no ranking change for queries without `must:` / reranker-disabled path") prohibits the feature itself | §7 #12 replaced: the restriction binds W-fix + Waves A–B instrumentation only; an explicitly selected, **qualified** learned_v3 policy may change ranking while eligibility, exact controls, freshness, scope, grouping, disclosure, and failure fallback stay unchanged; G1 acceptance reworded to "**baseline mode** remains unchanged" |
| 6 | Core trace v2 conflated with capture survival v2 | §6 A1/A6/B6: Core = `semantic_search_candidate_trace_v1` → new `semantic_search_candidate_trace_v2` with a runtime parser module (`packages/core/src/core/semantic-search-candidate-trace.ts`); capture = `search_candidate_survival_v1/v2` → new `search_candidate_survival_v3`; B6 owns survival-v3 validation + translation |
| 7 | Security hardening optional at Gate 0 | §4 #11 + Gate 0: hardening integration is a **prerequisite**; base = post-hardening frozen HEAD; V3 does not baseline on unhardened master |
| 8 | "Absolute admin path" + "regular file" insufficient for ranking authority | §6 F1/F2: one shared descriptor-bound trusted-file reader (symlink/non-regular/group-or-world-writable rejection; open-once hash of same descriptor; lstat/fstat identity; exact byte ceiling; ownership; no path inside any indexed workspace; descriptor cleanup; atomic registry replacement) |
| 9 | `serviceClass` too coarse; hashed artifact with incompatible feature semantics would load | §5.3.8: artifact gains an `applicability` contract (baselinePolicyIdentity, featureContractSha256, runtimeScoringContractId, retrievalContractId, rerankerProjectionIdentity, supportedProviderKeys); runtime rejects hashed-but-incompatible artifacts |
| 10 | F7 probably needs no production modification (opaque `rankingPolicyIdentity` already in binding digest) | §6 F7 reworded **test-first**: prove the composite identity already invalidates the binding; modify `search-result-set-identity.ts` only if the test exposes a gap |
| 11 | Neural-gate skip misstated ("must-satisfied top" alone) | §5.3.7 + F5/G2: exact rule is `top.exactLexicalMatch && (exactMatchPinningEnabled \|\| (must query && top.passesMatchedMust) \|\| scored.length === 1)`; a top satisfying `must:` alone never skips |
| 12 | `shadow_v3` in production config has no integration owner and contradicts offline-shadow-first | §5.3.13/§6 F6: production selector is `baseline \| learned_v3` only; shadow = offline replay + optional injected in-memory test sink; production shadow deferred with an explicit privacy/telemetry plan |
| 13 | Held-out wording too absolute ("task oracles may not be read" is unenforceable) | Gate 0 R0.2 + Wave C: enforceable language — do not execute held-out queries, create held-out captures, inspect held-out contender outputs, or use held-out judgments/outcomes for design, grading, feature selection, hyperparameter selection, or debugging; sealed manifest digest + repository metadata may be read for opening verification |

### 3.2 Plan-executability dispositions (2026-08-06 — open questions #9–#13)

> **Historical record — superseded, non-normative.** Effective design is §5, §6, and the
> latest disposition table (§3.3/§3.4). Rows below may quote superseded wording (e.g.
> the `I4A` writer name and its Wave-I placement); the writer is **F9 (Wave F)** and the
> pending transition is **H10** per §3.3/§3.4.

| # | Question | Disposition |
|---|---|---|
| 9 | No executable neural ordering/training contract: D2/E4 train only the deterministic residual; the "learned, gated, slot-bounded reorder" is unspecified | **Accepted, renamed "missing neural ordering and gate-parameter contract"** and resolved by §5.3.16: V3.0 adopts **Design A — provider-derived neural reorder** (the complete validated provider order directly permutes admitted slots; every gate parameter is a **preregistered constant** sealed in R1.2; "learned neural contribution" is replaced by "provider-derived neural reorder"). Design B (locally selected/trained neural permutation policy) is deferred to V3.1+. Without this choice the residual-plus-neural contender is not reproducibly implementable. |
| 10 | Frozen RRF/admission vs. neural reorder conflict | **Rejected as a blocker** — §5.1 already separates baseline-B order → frozen `baselineAdmissionSet` → residual V3 order → provider reorder within admitted positions. Clarification added (§5.1): **zero-weight identity** (residual artifact reproduces baseline scores) and **frozen-admission identity** (admission set byte-identical pre/post residual) are **distinct proofs**, both required (F3/D2 vs. G1 admission snapshot + B8 + G1/G2 tests). |
| 11 | Search-quality fixture modernization has no task owner; R0.2 is blocked | **Accepted** — new **R0.1A — Search-quality fixture modernization** inserted in Gate 0; R0.2 explicitly depends on it. This is the earliest blocker (Gate 0 cannot complete without it). |
| 12 | H9 `qualified` vs. I1 "registry sealed before opening" vs. I4 "first update" — two meanings of qualified; no state semantics | **Accepted** — explicit state machine (refines §3.1 row 4 wording): H9 = `offline_qualified \| rejected \| insufficient_evidence`; I1 verifies a **pre-opening registry snapshot with `pending_heldout`** (or a qualification-candidate manifest / sealed current registry + exact proposed update payload) — not the final post-acceptance entry; I4 = `activation_qualified` writing a **new immutable registry version** whose receipt binds previous registry digest + artifact digest + held-out acceptance receipt + service class + new registry digest. |
| 13 | No qualification-registry writer owner: I4 is prose, not a task | **Accepted** — new **I4A — Qualification registry writer and atomic update command** (module/script, tests, permissions, compare-and-swap against the previous registry digest, rollback/revocation, update receipt); I4 becomes the controlled execution of that writer. |

Priority order: **#11 → #9 → #12 → #13** (R0.1A blocks starting the baseline; the neural
contract blocks constructing the contender; the state machine and writer block held-out
activation).

### 3.3 Third-review dispositions (2026-08-06 — execution readiness; 7 blockers + 6 corrections)

> **Precedence note:** rows quote the third review's dispositions. Where §3.4 (fourth
> review) supersedes them — notably F9 timing (see §3.4 B1/G7), the transition-specific
> writer API (§3.4 B2), and the single exact-control policy (§3.4 B3) — §3.4 governs.

| # | Finding | Disposition |
|---|---|---|
| B1 | I4A scheduled after held-out opening — the writer is production code created post-opening, violating §1 (nothing rewritten after opening) and I1 (digests sealed before opening) | **Moved**: writer becomes **F9 (Wave F)** — implemented, tested, and digest-sealed **before** Gate 1 seals and held-out opening; the writer digest is part of the opening record; pending and activation transitions use the same frozen executable; **I4 is the post-acceptance execution of F9**, not its creation |
| B2 | Qualification state machine inconsistent: §5.3.8 `qualified \| revoked`, R1.4 `pending_heldout \| activation_qualified \| revoked`, H9 `offline_qualified \| rejected \| insufficient_evidence`; no task creates the `pending_heldout` transition | **Canonical model** (§5.3.8): `OfflineQualificationVerdict = "offline_qualified" \| "rejected" \| "insufficient_evidence"` (evaluation receipt, not a registry state) vs `RegistryArtifactStatus = "pending_heldout" \| "activation_qualified" \| "revoked"` (registry versions). New task **H10 — Create pending-held-out registry version** (runs after H9, before I1) via the F9 writer; I1 verifies the **pending version** as the single normative mechanism (alternative manifest/current-registry routes removed) |
| B3 | "Compare-and-swap" not atomic: two writers can both validate the same previous digest and both rename; atomic rename prevents partial reads, not lost concurrent updates | **Real serialization** (§5.3.8/F9): exclusive lock file `O_CREAT \| O_EXCL` (with stale-lock recovery), or OS file lock / single-owner broker; tests include two concurrent writers from the same previous digest with exactly one succeeding |
| B4 | Immutable versions conflict with replacing one registry file — previous versions vanish, breaking rollback/revocation/audit/digest-chain/recovery | **Append-only layout** (§5.3.8): `qualification-registry/versions/<sha256>.json`, `receipts/<sha256>.receipt.json`, atomic `current` pointer; old versions never mutated; rollback = new transition |
| B5 | Design A bound contradictory: `maximumNeuralResidual` retained "as a bound for the reorder magnitude" but a score residual cannot bound a permutation (provider could reverse all 50) | **Option A adopted** (§5.3.16): `maximumNeuralResidual` **removed from V3.0**; the only bounds are membership and slot confinement — the provider may perform any stable permutation of admitted identities within their deterministic-V3 positions. Option B (displacement-bounded: `maximumPositionDisplacement` etc.) is V3.1+ |
| B6 | Fixed `minimumTopToSecondMargin` assumes score comparability the plan rejects elsewhere (cross-provider, cross-query raw margins) | **Provider-specific normalized margins** (§5.3.16/R1.2): `neuralEvidencePolicy.providers[providerKey] = { minimumCandidates, minimumNormalizedTopToSecondMargin }`; normalized margin defined as `(top - second) / max(ε, top - bottom)` (or a percentile/rank-gap rule, chosen in R1.2); `acceptedProviderKeys ⊆ supportedProviderKeys` enforced by the artifact parser |
| B7 | Exact-pin protection specified only for the neural gate, not the residual — residual could demote the pinned top before the neural stage | **Exact-control ownership precedes residual scoring** (§5.3.17): when the baseline order satisfies `shouldSkipRerankForExactPin`, the pinned candidate stays fixed at position zero and the residual may reorder only the suffix (bypassing the residual for that query is the fallback); G1 adds extreme-synthetic-residual demotion tests |
| C1 | H3/H4 lack formal E4 dependency; D3 should verify the final E4 artifact | **H3/H4 deps = G6, E4, D3**; E4 acceptance includes the D3 final-verification invocation; H6–H9 depend transitively on the verified E4 digest |
| C2 | Hardening gate proves ancestry, not behavior — a branch can merge while leaving M2-A/A1 incomplete | **Behavioral gate** (Gate 0): R0.1 consumes a security-hardening acceptance receipt with explicit tests (indexing `/` rejected; home rejected unless authorized; `.ssh`/`.aws`/secret roots rejected; `read_file` cannot read unpublished/unauthorized files; symlink/special-file fail-closed; byte ceilings before whole-file allocation; shared-runtime auth per the accepted threat model; bounded external provider requests). Gate requires ancestry **AND** receipt/tests green |
| C3 | R0.1A scope contradiction ("any additional stale seam fixed in the same task" vs §6 authorized-files rule); end-to-end vs ranking-only ambiguity | **Scoped**: additional seams **inside the authorized files** may be repaired and recorded; a seam requiring another file stops the task and creates a reviewed follow-on card. R0.1A is **end-to-end**: prefer writing real publication records into the temp state root; readiness/publication overrides only where the fixture's hermetic design requires stubbing, and the receipt records which seams were overridden vs. exercised |
| C4 | "F1/F2 shared prerequisite" not a dispatchable node; reader/writer responsibilities blurred | **F0 — Descriptor-bound trusted-file primitives** (owns `root-bound-fs.ts` + exported core filesystem primitives); F1/F2/F9 depend on F0; reader and writer are separate consumers of F0's shared descriptor/validation primitives |
| C5 | Trace naming drift: B1 "trace-v3 evidence", B8 "trace-v3 bounds" imply a nonexistent Core v3 | **Corrected**: Core trace v2 + capture survival v3 used consistently (B1/B8/Wave B gate) |
| C6 | "Learned neural contribution" wording survives in §5.1/§5.2 under Design A | **Terminology**: "learned deterministic residual + provider-derived gated slot reorder" used consistently; the provider model is learned, the Satori V3 neural policy is not locally trained/selected |

Prior disposition: **#10 remains correctly rejected as a blocker** (zero-weight vs
frozen-admission identity are distinct proofs, §5.1). #9 mostly resolved subject to B5/B6;
#12 partially resolved subject to B2/B3/B4; #13 resolved subject to B1 (placement) and
B3 (locking); #11 resolved subject to C3.

### 3.4 Fourth-review dispositions (2026-08-06 — qualification enforcement and sequencing; 3 blockers + 8 corrections)

**Prior status:** B5 (neural residual bound) **closed** (Option A). B3/B4/B6
**conditionally closed** — exact semantics sealed at Gate 1 per the rows below.

| # | Finding | Disposition |
|---|---|---|
| B1 | F9's "implemented and digest-sealed **before Gate 1 seals**" is impossible: execution order is Gate 1 → Waves A–F; F9 depends on R1.4 (Gate 1). The real requirement is: implemented and sealed **before offline qualification and held-out opening** | **G7 — Runtime implementation seal** added after G6 (deps F0–F9, G1–G6): `docs/evidence/ranking-v3-runtime-seal-<date>/IMPLEMENTATION_SEAL.json` binding F0/F1/F2/F9 trusted storage code, artifact + registry parsers, F3–F6 ranking/selection code, G1–G6 integration code, exact tests and build inputs, package-lock digest, and the compiled/source-tree digest used by H1–H10 and I1 (a hash of F9 alone does not prove the executable — F9 depends on F0, F2, parsers, runtime libraries). **H1–H10 depend on G7; I1 verifies G7.** All "before Gate 1" F9 statements removed |
| B2 | F9 as a generic writer "handling" all statuses lets a caller write absent → `activation_qualified`, bypassing H10/I1/I2/I3 | **Transition-specific operations only** (§6 F9): `createPendingHeldoutVersion`, `activatePendingVersion`, `revokeArtifact` — each takes `expectedRegistrySha256` + artifact + serviceClass + the specific receipt, and **validates receipt contents and bindings**, not merely a caller-supplied hash. Enforcement: absent → `pending_heldout` requires an `offline_qualified` H9 receipt; `pending_heldout` → `activation_qualified` requires an accepted I3 receipt for the same artifact, service class, code seal, and held-out manifest; → `revoked` requires the defined revocation authority; absent → `activation_qualified` **forbidden**; `revoked` → `activation_qualified` forbidden without a new qualification cycle. Registry schema gains **status-specific receipt fields** (`offlineQualificationReceiptSha256`, `heldoutAcceptanceReceiptSha256?`, `revocationReceiptSha256?`) — a single `qualityReceiptSha256` is no longer sufficient |
| B3 | Exact-control handling still offers two policies (suffix reorder vs full bypass) — different ranking, training, replay, metric, counterfactual, identity, and byte-parity consequences | **One policy selected** (§5.3.17): when `shouldSkipRerankForExactPin` is true — **do not apply the residual; do not apply the provider-derived reorder; return the deterministic baseline-B ordering unchanged.** Suffix-only is rejected; sealed in R1.1/R1.2 as the single rule |
| C1 | `pending_heldout` must be explicitly nonselectable everywhere | F2: `missing \| pending_heldout \| revoked \| incompatible → baseline`; F6: `learned_v3` returned only when `status === activation_qualified`; G6 adds distinct tests for pending / activated / revoked / wrong service class / wrong artifact hash / invalid transition evidence |
| C2 | Append-only immutability underspecified: overwrite under a content-addressed name contradicts "immutable" | Writer creates version + receipt files with **`O_CREAT \| O_EXCL`**; an existing file is read through F0, must be **byte-identical** to the expected content, else fail closed. **`current` pointer spec**: regular file, never a symlink; exact lowercase 64-char SHA-256 + optional final newline; fixed byte ceiling; created as a temp regular file; atomically replaced; read back and validated through F0. `current` means the current **registry version** — H10's current registry may contain only a pending candidate |
| C3 | "O_EXCL lock with stale-lock recovery" is not automatically safe (time-based deletion lets two live writers race) | R1.4 seals one exact rule: lock contains PID + process-start identity + boot/session identifier; an existing lock causes **fail-closed** behavior; automatic removal only when the owning process is **provably dead** and its process-start identity no longer matches; otherwise an explicit administrative recovery operation. Tests: live lock never stolen; crashed-owner lock recoverable; malformed lock fails closed; recovery cannot delete a newly replaced lock |
| C4 | Trusted-directory checks lost in the F0 rewrite: registry loader/writer operate on a whole directory hierarchy, not one file | F0/F1/F2/F9 validate: artifact and registry roots outside every indexed workspace; registry root and relevant ancestors owned as required and not group/world-writable; no path component is a symlink; versions/receipts/lock/pointer remain beneath the canonical registry root; the registry directory itself is not replaced between validation and use |
| C5 | Normalized-margin contract needs more than the headline formula; provider-key schema has two authorities | R1.2 seals beyond the formula: exact ε; score direction (higher is better); minimum candidate count (≥3 for this formula); all-equal scores; two-candidate behavior; nonmonotonic provider-order-vs-score behavior; tie precision and canonical rounding; NaN/infinity/negative-denominator handling; whether a provider order contradicting its raw scores is rejected. **Provider-key simplification**: `acceptedProviderKeys = keys(neuralEvidencePolicy.providers)` — a single authority; the separate array is removed |
| C6 | H5's "nondeployable unless separately selected by the sealed decision contract" reopens a fourth production path (E3 can only select residual or residual+reorder) | H5 reworded: **"H5 is diagnostic-only and is not selectable or deployable in V3.0."** No escape clause |
| C7 | Hardening gate: ancestry + a previously green receipt is insufficient if code changed afterward | R0.1 requires **`receipt.commitSha === frozen integration HEAD`** (or rerun the exact acceptance suite at the frozen HEAD), verified via `git merge-base --is-ancestor <receipt-commit> HEAD` + rerun — not `git log --grep` (commit messages/branch names are not security evidence) |
| C8 | Stale superseded instructions remain operative (I4A, old statuses, old receipt fields, old gate fields) | §3.1/§3.2 marked **superseded/non-normative**; the effective design is §5/§6 + §3.3/§3.4; a stale-text sweep removed remaining operative references (I4A, `qualified \| revoked`, single `qualityReceiptSha256` as the operative schema, `minimumTopToSecondMargin`, `qualification-candidate manifest`, "sealed current registry plus exact proposed update", "learned neural contribution", `trace-v3`) |

**Effective dependency sequence (normative):**

```text
Gate 1: seal feature, training, metric and registry contracts
Waves A–F: schemas, evidence, evaluation, F9 writer
Wave G: runtime integration and failure matrix
G7: seal the exact runtime/evaluation/writer implementation
Wave H: replay + offline qualification on G7-sealed code
H10: F9 creates pending_heldout version from the H9 receipt
I0: owner authorization
I1: verify the H10 version, G7 seal, artifact, thresholds, held-out manifest
I2–I3: execute and adjudicate held-out exactly once
I4: the same G7-sealed F9 writer performs pending_heldout → activation_qualified
```

### 3.5 Fifth-review dispositions (2026-08-06 — artifact-mode and qualification-chain completeness; 5 blockers + 7 corrections)

**Prior status:** the three Revision-5 blockers are resolved (G7 seal, transition-specific
writer, single exact-control policy). Items below are the remaining execution-readiness
gaps.

| # | Finding | Disposition |
|---|---|---|
| B1 | The selected contender is not unambiguous in the E4 artifact: E3 can select deterministic-only, but later text implies E4 always produces residual-plus-neural; H3/H4/H9 treat one artifact two ways | **Artifact execution-mode union** (§5.3.16): `NeuralReorderPolicy = { mode: "disabled" } \| { mode: "provider_derived", providers: { [providerKey]: { minimumCandidates, minimumNormalizedTopToSecondMargin } } }`. **E4 serializes only the E3-selected mode.** H9 qualifies the **selected artifact mode**: if `disabled`, H3 is the qualification replay and H4 is ablation/diagnostic-only; if `provider_derived`, H4 is the qualification replay and H3 is the deterministic ablation. F5/G2: a `disabled` artifact cannot invoke the provider-derived permutation |
| B2 | Receipt validation has no schema/parser/owner: F9 "validates receipt contents" but no task defines receipt schemas or issuer authority | **A11 — Qualification transition receipt schemas** (new Wave A task): `OfflineQualificationReceiptV1`, `HeldoutAcceptanceReceiptV1`, `RevocationAuthorizationReceiptV1`, `RegistryTransitionReceiptV1` — each binding artifactSha256, serviceClass, selectedArtifactMode, G7 seal digest, contract-seal digest, training/evaluation manifest digests, provider/reranker qualification scope, held-out manifest digest where applicable, decision/verdict, receipt type + schema version. **F9 depends on A11 and accepts only parsed receipt objects.** Issuer authority: **the same-UID trust boundary is accepted** (file ownership + mode bits are the authority — consistent with the M1 trust-model default); if same-UID processes are later considered adversarial, receipts require signatures or a separate OS identity (recorded as a decision point, not silent) |
| B3 | G7 does not seal the full evaluation chain: a modified evaluator after G7 could change H9/I3 decisions without changing runtime/writer code | **G7 executable manifest** covers every program/module run during H and I: B6 capture schema, B7 replay, C6 metric/scoring, D3 artifact verifier, D4 counterfactual harness, D5 resource contract (+G6A harness), H1–H9 orchestration/adjudication scripts, I1–I3 verifier/execution/adjudication scripts, A11 receipt parsers, F9 writer + transitive trusted-storage deps. Binds source digests, built-output digests where built JS executes, package-lock digest, Node/runtime version, exact commands, test digests + results, contract and manifest digests. **I1 verifies the executable manifest, not only one aggregate digest** |
| B4 | Qualification too coarse for multiple providers/models: `artifactSha256 + serviceClass` does not prove every accepted provider/model was evaluated | **Provider/model-bound qualification**: H9 tests every provider/model that will be activatable and records `qualifiedRerankers: readonly { providerKey, rerankerIdentity, rerankerProjectionIdentity }[]` in the offline-qualification receipt; activation qualification binds those exact identities. **F5/F6/G4 reject learned mode when the active reranker identity is not in the activation-qualified receipt.** The provider-key contract states that **model name and revision are part of the key** (a generic `"voyage"` is insufficient) |
| B5 | D5 (Wave D, deps A4/A5) claims to measure implementations (F1/F3/F4/G1/G2) that do not exist yet | **D5 split**: `D5 — Resource contract and benchmark corpus` (preregisters workloads, warmup, p95/RSS thresholds, environment controls, measurement method, frozen inputs) + **`G6A — Sealed implementation resource harness`** after G2 (deps F1, F3, F4, G1, G2, D5) measuring the actual production path. G7 seals G6A + its results; **H8 reruns or verifies that exact harness against the selected E4 artifact** |
| C1 | "No post-opening changes" rule textually conflicts with I4 writing a new registry version | §1 rule made explicit: after held-out opening — no source-code changes; no model/artifact changes; no threshold/contract/feature/evaluator changes; no deletion or rewriting of evidence; **only preregistered adjudication and append-only registry transitions may occur** (I4 is a declared allowed transition) |
| C2 | Registry state between I1 and I4 undefined: `current` could change after I1 | **I1→I4 freeze**: I4 requires `expectedRegistrySha256 ===` the exact H10 registry digest verified by I1; any intervening transition aborts activation (retain baseline; no post-opening repair or reconstructed pending version). Emergency revocation may still terminate the attempt |
| C3 | Registry cardinality per service class undefined | **Invariant** (§5.3.8, F9-enforced): multiple historically `activation_qualified` artifacts may remain recorded; configuration selects exactly one artifact hash; **at most one pending candidate per serviceClass/provider qualification scope**; H10 does not revoke or replace the currently active artifact; activation of the pending candidate does not automatically change product config; rollback is a config selection or a new revocation transition |
| C4 | F0/F9 mechanisms (O_NOFOLLOW, inode checks, boot IDs, process identity, dir replacement, atomic rename+fsync, liveness) are Unix-centric; Windows/macOS behavior undefined | **R1.4 platform capability matrix**: Linux (exact required guarantees/APIs), macOS (exact equivalents or fail-closed unsupported), Windows (reparse-point handling, file-identity checks, replacement semantics, lock ownership, directory flush). Where guarantees cannot be implemented: **external learned-policy loading and registry mutation are disabled — baseline + truthful diagnostic**. Never silently weaken checks |
| C5 | R0.1 step 1 still requires `git log --grep=security-hardening` (messages are not evidence) | **Removed**: R0.1 uses exact commit IDs + merge-base ancestry + rerun of the acceptance suite only |
| C6 | G7 dependency not encoded on individual H cards | Explicit per-card deps: H1: G7; H2: G7; H3: G7, E4, D3; H4: G7, E4, D3; H5: G7; H6–H9: G7 (explicit); H10: G7, H9, F9 |
| C7 | Trace terminology drift: "candidate-survival trace v3", "Included: trace v3", "trace v3…" remain in normative sections | Exact names everywhere: Core **`semantic_search_candidate_trace_v2`**; capture **`search_candidate_survival_v3`** (A1/B1 and B6 have different owners/compatibility responsibilities) |

### 3.6 Sixth-review dispositions (2026-08-06 — dispatch integrity; 4 corrections + 2 additional)

| # | Finding | Disposition |
|---|---|---|
| 1 | The stale companion is still designated the operational companion and dispatch authority; its Revision-2 architecture conflicts with the normative plan (G1/E4 deps, shadow mode, evidence split, trace names, hardening prerequisites, F0/F9/G7/H10, qualification sequencing, dependency graph) — an implementation agent could follow a forbidden path | **Companion retired**: Related Documents entry marked **SUPERSEDED — historical design input only, not dispatch authority; do not execute its task cards or dependency graph**. Added **R0.1B — Dispatch-card materialization** (exact receipt + task): dispatch cards are generated from §6 of this plan only, after R0.1 resolves exact files, line regions, signatures, and commands. Updating the companion was rejected as more error-prone than formal retirement |
| 2 | §2/§10 source-line references stale at the stated base: `rerankResults: Array<{index}>` is at **line 566** (not 586); `STALENESS_THRESHOLDS_MS` at **line 47** (not 36–38); `SCOPE_PATH_MULTIPLIERS` at **line 73** (not ~49–88) — contradicts "every claim re-verified" | **Corrected now** (verified at HEAD: 566/47/73) and made durable: symbol names + exact commit-bound links become the primary reference; line numbers are generated convenience data; **R0.1 regenerates §2 and §10 anchors against the frozen post-hardening HEAD** (the hardening merge will move lines again); header claim narrowed from "re-verified" to "verified at the stated base with line numbers as convenience data" |
| 3 | D6 depends on D1 (diagnostic comparator) — a nondeployable comparator's failure/delay blocks the actual residual LOFO path; H2 also lacks its D1 edge | **Graph corrected**: D6 depends on **A9, D2, D3** (D1 removed). Comparator decision dependency defined separately: **E3 depends on all E2 fold results + the D1 diagnostic receipt if the sealed decision contract requires the comparator**; if D1 cannot produce valid evidence, D6 and fold runs proceed, and E3 records `insufficient_evidence` when the contract requires the comparator. **H2 depends on G7 and D1** (it consumes the D1 grouped contender's sealed replay artifact) |
| 4 | C2/C3 still say "one agent per repository", contradicting the bounded-packet rule (~5–8 tasks) | **Per-task/per-packet semantics**: C2.* — candidate-pool materialization **per bounded packet** (approx. 5–8 tasks; multiple packets per repository; one isolated agent/worktree per packet; output binds repository, task IDs, capture digest). C3.* — **two independent proposal passes per packet**; no agent may produce both proposals for the same task; repository-level files assembled only after every packet completes. Independence is enforced per task/packet, not merely by two nominal agents per repository |
| 5 | Operative bare `trace v3` leftovers | **Closed** — already corrected in Revision 7 (§5.4, rule 18, feature table, evidence authority); historical deleted lines in the diff are not operative text |
| 6 | Provider-key wording still references the removed `acceptedProviderKeys` field (`acceptedProviderKeys ⊆ supportedProviderKeys` in §5.3.16) | **Invariant replaced**: `keys(neuralEvidencePolicy.providers) ⊆ applicability.supportedProviderKeys` — the artifact-parser invariant; no separate array exists |
| 7 | E2 fold scoring still claims "resources for the excluded family" before F1/F3/F4/G1/G2/G6A exist | **E2 resource language narrowed**: fold scoring may report only **nonproduction evidence** (artifact size, pure-scorer operation counts); the production p95/RSS gate belongs exclusively to **G6A/H8** |
| 8 | Attachment mojibake (the diff's terminal-decoding sequences) | **Verified absent from the repository file** (byte-level grep of the decoded-sequence characters, 0 hits) — the corruption is an export/terminal-decoding artifact, not committed content |

### 3.7 Seventh-review dispositions (2026-08-06 — dispatch integrity; 2 blockers + 4 corrections)

**Closed by Revision 8:** source-line values (566/47/73), provider-key invariant, E2
resource language, trace terminology, mojibake.

| # | Finding | Disposition |
|---|---|---|
| B1 | The companion is retired only in the main plan's Related Documents; the companion file itself still presents its old operational instructions to anyone opening it | **Banner added to the companion file itself** (`docs/superpowers/plans/2026-08-05-satori-ranking-v3-reviewed-small-agent-design.md`): `# SUPERSEDED — DO NOT DISPATCH`, obsolete Revision-2 architecture, historical design input only, task cards/dependency graph/configuration modes/execution schedule must not be used; normative plan + R0.1B dispatch authority named |
| B2 | R0.1B cannot generate final cards for all Waves A–I at that point: contracts (R1.1–R1.4) not sealed, Wave A–F files don't exist, G4/H/I signatures and commands unknowable, C2/C3 packet identities unknown — one all-at-once set is either placeholder-ridden or stale | **Staged card generation**: R0.1B generates cards for **R0.1A, R0.2, and Gate 1 only**; **R1.6** (after `CONTRACT_SEAL.json`) generates + seals **Wave A** cards; after each wave gate, cards are generated only for the **next dependency-ready wave**. Any change to the plan, frozen HEAD, contract seal, or prerequisite interfaces **invalidates the affected unexecuted cards** and requires regeneration. Bootstrap rule: R0.1/R0.1B are owner-authorized planning tasks and are not expected to have been generated by R0.1B |
| C1 | Source-anchor regeneration has no authorized output: R0.1's Files scope is `BASELINE.md` only, yet its acceptance requires regenerating §2/§10; commit-bound links are declared primary but §10 still uses plain paths+lines | **Authoritative anchor manifest**: R0.1 also produces `docs/evidence/ranking-v3-rebase-<date>/SOURCE_ANCHORS.json` — entries `{ claimId, commitSha, path, symbol, startLine, permalink, sourceSha256 }`; §2/§10 declare their line numbers **snapshots** and point to the Gate-0 manifest as authoritative (regenerating the plan text itself is rejected: the plan is revision-controlled separately) |
| C2 | D1 remains conditionally blocking through H2 → H6–H9 → H9 even when R1.3 does not require the comparator | **Comparator policy sealed in R1.3 as `required | optional`**. Chosen default: **optional**. If optional: H2 stays diagnostic; **H6–H9 do not depend on H2 (nor on diagnostic H5)**; the H9 receipt records `groupedComparator: available | unavailable | not_required`. If R1.3 seals `required`: D1 failure → `insufficient_evidence` and all conditional wording is removed |
| C3 | Packet assembly has no owner; multiple worktrees could collide on repository-level filenames | **C3A — Repository proposal assembly** added (deps: all C3.*): validates and combines packet outputs before C4 — every expected task appears exactly once per proposal pass; both proposals for a task came from different agents; packet repository/capture/tree digests agree; no extra or duplicate task IDs. **Packet-scoped output paths** avoid collisions: `<repository>/<packet-id>/candidate-pool.json`, `proposal-a.json`, `proposal-b.json` |
| C4 | Card-set seal underspecified: "§10-style digest" is not a canonical hashing specification | **Machine-readable manifest** (`ranking_v3_dispatch_cards_v1`): `{ schemaVersion, planSha256, sourceCommit, sourceTreeSha256, contractSealSha256, prerequisiteReceipts: [digests], cards: [{ taskId, path, sha256 }] }` with defined canonical card ordering, path and newline normalization; the receipt does **not** hash itself; superseded card sets are **revoked** (each new card-set receipt binds the previous receipt digest and lists revoked card digests). A card is dispatchable only while its manifest is current and all bound prerequisites match |

### 3.8 Eighth-review dispositions (2026-08-06 — Gate-0 freezing, mode-dependent qualification, executable ownership; 4 blockers + 6 corrections)

**Closed by Revision 9:** companion banner, staged card generation, SOURCE_ANCHORS,
D6/D1, optional comparator, C2/C3 packets, C3A, provider-key authority, G6A/H8
resources, trace names, exact controls/admission/mode/registry transitions.

| # | Finding | Disposition |
|---|---|---|
| B1 | R0.1A (implementation) lands after R0.1's freeze and R0.1B's cards — invalidating the frozen HEAD, SOURCE_ANCHORS.json, and the bound cards | **Gate 0 reordered**: R0.0 (merge + verify hardening) → **R0.1A (fixture repair, pre-freeze, owner-authorized bootstrap)** → R0.1 (freeze the post-hardening, post-fixture-repair HEAD; BASELINE.md + SOURCE_ANCHORS.json) → R0.1B (cards for R0.2 + Gate 1 only) → R0.2 (baseline from that exact frozen HEAD). The frozen tree contains the repair; R0.1A is added to the bootstrap rule |
| B2 | Only R0.1B/R1.6 are named card-generation tasks; later waves have no owner; same-date dirs can overwrite receipts | **DX.<target-wave> reusable task type** (§6) instantiated at every wave boundary (DA=Wave A=R1.6, DB…DI); owns generation, prerequisite validation, manifest sealing, revocation of **only overlapping unexecuted cards**, independent review; **immutable `-<date>-<sequence>-<scope>` directories**, never overwritten; executed cards remain historical evidence, never revoked |
| B3 | Deterministic-only mode incorrectly coupled to reranker qualification: F6/G4 require an active reranker in `qualifiedRerankers` even when no neural permutation runs | **Mode-dependent qualification**: `mode: "disabled"` ⇒ `qualifiedRerankers` **empty**, F6/G4 require **no** active reranker identity (learned_v3 = deterministic residual only); `mode: "provider_derived"` ⇒ non-empty + identity match, else baseline. Invariant enforced in A11 parsing and H9/H10/I4 receipts |
| B4 | G7 seals H/I executables no task owns; Wave H/I agents may not modify code, so the executables must pre-exist | **F10 — Offline qualification runner and H9 receipt generator**; **F11 — Held-out opening verifier, executor, adjudication runner** (deps: A11, C6, D3–D5, F9, R1 contracts, manifests). They implement every Wave H/I executable G7 seals (mode union, `qualifiedRerankers`, `groupedComparator`, receipts, I1 freeze checks). G7 never seals unnamed/unowned executables |
| C1 | H6–H8 depend on both H3 and H4 although only one is the mode-selected qualification replay | **`H_SELECTED_MODE_REPLAY`**: `disabled` → H3 receipt; `provider_derived` → H4 receipt. H6/H7/H8 depend on **H1 + H_SELECTED_MODE_REPLAY**; the nonselected replay is optional diagnostic evidence that never blocks qualification |
| C2 | C4 still depends on "all C3.*", bypassing C3A's validation | **C4 depends on C3A** (which already depends on all C3.* packet tasks) |
| C3 | Wave I formal cards lack explicit dependency edges | **Explicit edges**: I1 (I0, H10, G7); I2 (I1); I3 (I2); I4 (I3, I1, H10, F9, G7); I5 (I4); I6 (I5) |
| C4 | §5.3.16 still says E4 "reproduces the full residual-plus-neural artifact"; R1.2's `acceptedProviderKeys = …` invites a duplicate authority | **E4 always serializes the selected `NeuralReorderPolicy` member**; provider constants only for `provider_derived`; `disabled` artifacts carry no provider map/gate parameters. R1.2 uses only `keys(neuralEvidencePolicy.providers)` |
| C5 | §5.3.2 timing contradiction and §5.3.11 "two independent proposal agents per repository" leftovers | §5.3.2: "after eligibility and baseline-B scoring, before residual scoring and reranker admission/application" (operative note already correct); §5.3.11: "two independent proposals per task, produced through separate packet agents" |
| C6 | Ownership table omits R0.1A as an editor of `evals/search-quality/search-quality-evaluation.ts` | **Sequential ownership: R0.1A → A10 → C6** |

### 3.9 Ninth-review dispositions (2026-08-06 — reconciled; runtime pipelines, corpus, scope)

**Closed by Revision 10:** Gate-0 reorder, DX.<wave> owners, mode-dependent
qualification, executable owners, H_SELECTED_MODE_REPLAY, C4→C3A, Wave I edges,
serialization wording, timing/grading, ownership.

| # | Finding | Disposition |
|---|---|---|
| B1/B8 | G7 seals H/I executables; I0→I4 trust chain needs exact receipts and owners | **G6B/G6C toolchains** (renamed from F10/F11, §6 Wave G): G6B — Offline qualification toolchain (H1–H9 replay/orchestration, selected-mode routing, H9 receipt generation, provider evaluation matrix enforcement); G6C — Held-out and activation toolchain (I0 authorization receipt, I1 opening verifier/record, I2 execution receipt, I3 adjudication receipt, H10/I4 transition entrypoints). G7 seals G6B/G6C; H/I become execution-only. **Receipt chain**: `I0 OwnerAuthorizationReceipt → I1 HeldoutOpeningRecord → I2 HeldoutExecutionReceipt (+results digest) → I3 HeldoutAcceptanceReceipt or rejection → I4 RegistryTransitionReceipt` — each link binds the previous receipt digest |
| B2 | Staged generation exists; wave-boundary owners needed | Already fixed via **DX.<wave>** (Rev10); no further action |
| B3 | Existing fixed rerank-RRF treatment undefined: does learned mode retain/replace/bypass `1/(10+rank)`? | **Three sealed runtime pipelines (§5.1)**: baseline keeps the existing provider call + fixed rank-RRF contribution unchanged; `mode: "disabled"` = pre-rerank baseline scoring/order → frozen admission snapshot → bounded residual → **no provider permutation, no fixed RRF contribution**; `mode: "provider_derived"` = same pre-rerank baseline → frozen admission → residual → exact qualified provider call → **direct slot-confined permutation, no fixed RRF contribution**. Fixed RRF 10 + weight 1.0 remain frozen **for baseline mode only**; learned modes replace the bucket (applying both would double-count the same provider result) |
| B4 | Zero-residual identity overstated | **Zero residual is a pre-rerank deterministic-score identity only**, not a full-product identity; full byte-identical identity is a property of **baseline mode** (B8 byte-identity gate + G1 parity tests) |
| B5 | Disabled mode requires a reranker | Already fixed (Rev10 mode-dependent qualification); V3.0 additionally restricts to **one provider/model per qualification cycle** (this row) |
| B6 | H6–H8 depend on both H3 and H4 | Already fixed via **H_SELECTED_MODE_REPLAY**; formalized as **`SelectedModeReplayReceipt` emitted by G6B** (H0 resolution: `disabled` → H3 normative; `provider_derived` → H4 normative) |
| B7 | H5 lacks a reproducible policy artifact | **H5 removed from V3.0** (no neural-only diagnostic artifact, executable, receipt, or capture requirement); contender set in R1.3 drops "neural-only diagnostic"; E3 selects only deterministic residual or residual+provider-reorder |
| B9 | `qualifiedRerankers` and pending-scope key lack a concrete schema | **`QualificationRegistryEntryV1`** (§5.3.8): artifactSha256, serviceClass, selectedArtifactMode, qualificationScopeKey, qualifiedRerankers[], status, receipt hashes; `qualificationScopeKey = sha256(canonicalJSON({serviceClass, selectedArtifactMode, qualifiedRerankers}))` with canonical ordering and no duplicates; empty list for `disabled` |
| B10 | No authoritative survival-v3 corpus | **B9 — Materialize and seal tuning survival-v3 corpus** (after B8): rerun the six tuning families with instrumented code; produce `search_candidate_survival_v3` captures; bind frozen repository/tree/query/task digests + product-output digests; strictly tuning-only; one sealed corpus manifest. **C1 depends on A8 and B9** (not merely B6). R0.2's pre-instrumentation captures remain the byte-identity baseline; B9 produces the actual feature/training corpus |
| B11 | Multiple-provider evaluation matrix too large | **V3.0 restriction: one provider/model per qualification cycle** — each E4 artifact targets one serviceClass and either `mode: "disabled"` (no provider) or exactly one providerKey + rerankerIdentity + rerankerProjectionIdentity; a later artifact may qualify another provider/model. H9/I2/receipts/gates/rollback all operate on the single qualified identity |

### 3.10 Tenth-review dispositions (2026-08-06 — naming, packaging, rejection chain, provider pinning; 4 blockers + 8 corrections)

| # | Finding | Disposition |
|---|---|---|
| B1 | "Baseline B score" has two meanings: `deterministicV3Score = baselineBScore + residual` implies identity with the reranker-enabled product, contradicting the pre-rerank identity statement; the binding sequence unconditionally calls the reranker; D2/F3 prove "byte-equal/bit-identical to baseline" | **Separate names used everywhere** (§5.1, §5.3.2, D2, F3, §2.1, §3): `preRerankBaselineScore`, `baselineModeFinalScore`, `deterministicV3Score = preRerankBaselineScore + clippedResidual`. Pipeline: eligibility → compute `preRerankBaselineScore` → sort `preRerankBaselineOrder` → freeze `baselineAdmissionSet` → assemble deterministic evidence → apply residual; `disabled` finishes without a provider call; `provider_derived` calls the qualified provider → slot-confined permutation. Proof renamed **`zeroResidualPreRerankScoreIdentity`**: scorer-level equality with `preRerankBaselineScore` (D2/F3); full product-envelope identity belongs only to B8/G1 baseline-mode parity. "A zero-weight artifact reproduces baseline B exactly" → "reproduces the pre-rerank deterministic baseline scores exactly" |
| B2 | F12 (Wave F, sealed by G7) packages "bundled qualified artifact + bundled registry" — neither exists before H9/H10/I4; F12 missing from G7's dependency list | **V3.0 removes bundled qualified-artifact and bundled-registry delivery**: storage = bundled **baseline** + administrator-controlled **trusted artifact path** + administrator-controlled **append-only registry** (§5.3.9). **F12 redefined as bundled-baseline packaging only** (no qualification state, no artifact bundling); G7's dependency list explicitly includes F12 |
| B3 | Held-out rejection leaves the `pending_heldout` entry permanently pending — at most one pending candidate per scope, so a stale pending entry blocks later cycles; rejection ≠ administrative revocation | **`HeldoutRejectionReceiptV1`** (A11) binding OwnerAuthorizationReceipt + HeldoutOpeningRecord + HeldoutExecutionReceipt digests, artifact hash, service class, selected mode, qualification scope, G7 seal, held-out manifest, terminal `rejected` decision. **`rejectPendingVersion({expectedRegistrySha256, artifactSha256, serviceClass, heldoutRejectionReceipt})`** added to F9's transition API. Wave-I branch: I3 accepted → I4 (`pending_heldout` → `activation_qualified`); **I3 rejected → I3R (`pending_heldout` → `revoked`, baseline retained)** — both transitions start from the exact H10 digest verified by I1 |
| B4 | The exact provider/model is not pinned before B9/E3: provider-derived captures must bind the identity; E3 must not select the provider retrospectively | **`providerDerivedTarget` sealed in R1.2/R1.4**: `null \| { providerKey, rerankerIdentity, rerankerProjectionIdentity }`. Enforcement: `disabled` ⇒ providers absent, `supportedProviderKeys` empty; `provider_derived` ⇒ exactly one provider map key equal to `providerDerivedTarget.providerKey`, applicability identifying that exact model/projection. **B9 captures and seals the complete neural evidence for that target** (providerKey, model+revision, rerankerIdentity, rerankerProjectionIdentity, admitted-candidate identity digest, complete provider order, raw finite scores, normalized evidence, response digest + provider request contract). E2 evaluates only the preregistered provider-derived contender; E3 may select the mode but never the provider/model |
| C1 | §1's post-opening rule omits configuration-only selection (I5/I6 do it) | §1 rule extended: after held-out opening — preregistered adjudication; append-only registry transitions; **configuration-only selection among baseline and already sealed, activation-qualified artifact hashes**; **append-only rollout receipts for every selection**. No new artifact, source, threshold, evaluator, or hash may be introduced |
| C2 | Artifact applicability still requires `rerankerProjectionIdentity`/`supportedProviderKeys` for all artifacts | **Mode-dependent applicability**: `disabled` ⇒ `supportedProviderKeys = []`, `rerankerProjectionIdentity` absent/null/"none" (one sealed convention, chosen in R1.4); `provider_derived` ⇒ exactly one key (== `providerDerivedTarget.providerKey`) and projection required. A5/A11/F5/F6 enforce the same rule |
| C3 | G6B/G6C sit under Wave F but are named G6*; dependencies vague ("G7-scope manifests"); graph not closed | **Moved fully into Wave G** with explicit order G1→G2→G3/G4/G5 (where dependencies allow)→G6→G6A→G6B→G6C→G7; **G6B depends on G6A** (implements the H8 command path); **G6C depends on G6B and F9**; vague manifest references replaced with exact producing tasks (A11, C6, D3–D5 outputs, B9 corpus manifest, R1.2/R1.3/R1.4 contracts) |
| C4 | "SelectedModeReplayReceipt — emitted by G6B" is wrong: G6B is pre-G7 implementation, the replay happens at H3/H4 | **G6B implements and G7 seals the receipt generator; H3 produces the receipt when `mode: "disabled"`; H4 produces it when `mode: "provider_derived"`** — only one normative receipt per qualification cycle |
| C5 | Global card contract still demands a failing test for every task, contradicting R0.1B's card types | **Top-level card-type contract**: `code_change` → failing focused test → implementation → passing test; `documentation`/`evidence`/`execution` → unmet-precondition verifier → task → validating verifier; `human_decision` → input checklist → owned decision artifact → schema/digest validation. "One card file per task" → **"one card per dispatch unit"** (mandatorily split tasks produce several cards) |
| C6 | `cards.manifest.json` example still lists R0.1A (never card-generated); Related Documents still says "exclusively by R0.1B" | Example card changed to R0.2/R1.1; Related Documents wording → "**Dispatch authority comes exclusively from current R0.1B/DX card-set manifests**" |
| C7 | Stale execution-shape summaries: "Parallel B1–B4" (B4 depends on B2); "G1–G6 execute in order" omits G6A/B/C; execution order shows freeze right after hardening | Summaries replaced with the actual DAG: Wave B = B1–B3 parallel, then B4 (deps A2, A4, B2), then B5 → B6/B7 sequential → B8; Wave G = G1→G2→G3/G4/G5→G6→G6A→G6B→G6C→G7; execution order inserts **R0.1A (fixture repair) before the freeze** |
| C8 | Stale identity/risk/§10 language: §2.1 "true identity policy"; §3 row "real identity policy"; D2 "byte-equal baseline"; F3 "bit-identical to baseline"; §5.2 "retrieval-arm fusion" for 100/60/10+1.0; Risk #9 "F4/D5 begin measuring"; §10 companion "(staged)" | All cleaned to the new naming: zero-residual identity = pre-rerank score identity; §5.2 describes the three RRF layers + rerank weight as the **frozen retrieval/rerank contribution**; Risk #9 → F4/G6A begin measuring (D5 is contract-only); §10 companion row → "(superseded, deleted 2026-08-06)" |

---

## 4. Locked-in conclusions (amended)

1. **Product ranking policy = baseline `B`** (deterministic formula), except the managed
   **offline** Linux x64/WSL2 default = LateOn D32-v2 (`lateon_d32_owner_default_v1`,
   owner decision 2026-08-04, **no held-out quality evidence**, accepted generalization
   risk). Any V3 default change requires an L5/R5-style held-out gate **plus** a separate
   production-policy receipt. V3.0's default is baseline B; learned mode is opt-in.
2. **Held-out evidence is sealed and all future held-out evaluation is currently closed.**
   V3.0 grades tuning data only; the existing held-out authority is preserved untouched
   for one eventual adjudication (Wave I), which requires **fresh owner authorization**.
3. **Deep-plan invariants #1–10** (excerpts): candidate membership/eligibility owned before
   neural reranking; reranker reorders only admitted candidates; exact identifiers,
   `must:`, configuration ownership, source freshness, publication authority, scope
   filtering, no-answer behavior remain deterministic and fail closed; **no
   query-specific exceptions, repository-specific weights, or new blanket path
   constants**; continuation performs no new retrieval/reranking; pagination exposes one
   immutable ranked set. V3.0 additionally binds the neural stage to **permute only
   admitted reranker slots** — it can never promote an unadmitted candidate, restore a
   filtered candidate, or reorder continuation pages independently.
4. **Transactional rerank fallback**: complete provider order validated on a detached
   copy; any failure restores byte-identical deterministic state; truthful
   `RERANKER_FAILED` diagnostics allowed.
5. **W-fix plan landed at the execution base** (bounded `must:` lane with
   `attempt:N/must_lane` retry prefixes, reranker timeout/retry bounds, untracked-file
   freshness, readiness/pagination honesty). **Constraints bind the W-fix integration
   and Waves A–B instrumentation only** (ninth review, corrections): no ranking change
   for queries without `must:`, no change to the reranker-disabled path, fail-closed
   fingerprint gate, `rerankAdjusted === false` on failure. An explicitly selected,
   **qualified** learned_v3 policy may change ranking on non-`must:` and
   reranker-disabled queries (do-not-list #12). Gate 0 confirms the W-fix
   receipt (`docs/evidence/search-integrity-baseline-20260805/BASELINE.md`) is current.
6. **Constant-tuning precedent (failed twice)**: R2 `B-P0`/`B-A0` and LANCEDB Phase 2.
   V3.0's D1 grouped contender reuses the sealed-contender mechanism and does not claim
   novelty for grid-tuning the current formula. It is **eight grouped knobs on a sealed
   finite grid** — not Bayesian search over 50+ constants.
7. **Benchmark populations must not be conflated**: 3-family suite (B MRR 0.3602 /
   owner@3 0.3722) vs 6-family tuning suite (B 0.2900 / 0.3611) are not one measurement;
   v3's 6-family tuning split is the V3.0 training/selection population.
8. **Frozen resource gates** (L3): warm p95 deadlines, memory profile; D32-v2 passes
   operational but not quality gates. V3 contenders face the same frozen envelope.
9. **No calibration/no-answer threshold change** (S0 semantic abstention deferred).
   V3.0's confidence gate is a ranking gate, not a no-answer abstention change.
10. **tradingview-r0 is `split: tuning`**; held-out repos are promptready / fastcontext /
    recovery_dashboard / ai_studio_prompt_library / portfolio / supply_chain_api (v3).
11. **Security-hardening integration is a Gate-0 prerequisite** (second review, blocking
    #7): V3 introduces administrator-controlled artifact paths, qualification-registry
    loading, and startup/runtime construction changes on the same local trust boundary
    the hardening work addresses (workspace authority, descriptor-bound file access,
    shared-runtime context binding, bounded provider requests; the underlying audit
    demonstrated real same-user authentication and file-containment failures). The
    execution base is the **post-hardening integration HEAD** (W-fix merged +
    `integrate/security-hardening-20260805` merged), frozen, with R0.1/R0.2 executed from
    that exact HEAD. V3 does not baseline on unhardened master. The
    `task/security-hardening-0-baseline…12` branches and their integration are the
    owner's merge work; until merged, Gate 0 stays blocked.

---

## 5. Spec summary (revision 2 — the design to plan against)

### 5.1 The residual scoring seam (replaces revision-1 full replacement)

```text
fixed retrieval and candidate union
→ deterministic eligibility and exact controls
→ versioned pre-policy evidence
→ pre-rerank baseline score (`preRerankBaselineScore`)
→ bounded constrained linear residual
→ optional bounded neural reordering inside the already admitted reranker slots
→ existing grouping, disclosure, and frozen pagination
```

```text
deterministicV3Score = preRerankBaselineScore
    + clamp(dot(weights, normalizedFeatures), -maxResidual, +maxResidual)
```
(`preRerankBaselineScore` is the pre-rerank deterministic score; `baselineModeFinalScore`
is the current reranker-enabled product score — the two differ, tenth review B1.)

**Reranker admission is frozen at `preRerankBaselineOrder`** (second review, blocking #1: the
runtime calls `selectRerankCandidates({ candidates: scored, ... })`, so changing
`finalScore` before that call would silently change admission — an admission-policy
change disguised as ranking). The runtime sequence is binding:

```text
eligible candidates
→ compute preRerankBaselineScore and sort preRerankBaselineOrder
→ freeze baselineAdmissionSet with the existing selectRerankCandidates
→ assemble deterministic evidence
→ apply the bounded deterministic residual (deterministicV3Score)
mode: "disabled" → finish without a provider call
mode: "provider_derived" → call the exact qualified provider for baselineAdmissionSet
  → locate each admitted ID's position in the deterministic V3 order
  → provider permutation applies identities only within those positions
```

G1/G2 carry zero-failure tests proving that a candidate crossing the reranker cutoff
because of its residual: (a) does not newly enter the provider request; (b) does not
displace a baseline-admitted candidate; (c) cannot receive neural evidence; (d) remains
fully eligible for deterministic V3 ranking. Without these, "reranker admission frozen"
is false.

**Two distinct identity proofs (disposition #10; tenth review B1 — renamed):**
**`zeroResidualPreRerankScoreIdentity`** — a
zero-residual artifact reproduces the **`preRerankBaselineScore`** values exactly at the
scorer level (proven in D2/F3) — and
**frozen-admission identity** — the `baselineAdmissionSet` is byte-identical before and
after residual scoring (proven by the G1 baseline admission snapshot, the B8 byte-identity
gate, and the G1/G2 admission tests). Both are required; neither subsumes the other.
**Zero residual is a pre-rerank deterministic-score identity, not a full-product
identity (ninth review, B4; tenth review B1)** — the reranker-enabled product pipeline is not reproduced
by a zero-weight artifact; full byte-identical **product-envelope** identity belongs to
**baseline mode** (B8 byte-identity gate + G1 parity tests), expressed as
`baselineModeFinalScore`.

**The three sealed runtime pipelines (ninth review, B3 — the existing fixed rerank
contribution `rerankRrf = 1/(10 + rank)`, `fusionScore += 1.0 × rerankRrf`, is frozen
for baseline mode only; learned modes replace the bucket — applying both the fixed
bucket and a direct provider permutation would double-count the same provider result):**

```text
baseline
→ current production behavior unchanged
→ existing provider call
→ existing fixed rank-RRF contribution
→ current final ordering

learned_v3 / mode: "disabled"
→ baseline pre-rerank deterministic scoring and ordering
→ freeze baseline admission snapshot
→ apply bounded deterministic residual
→ no provider-derived permutation
→ no fixed rerank-RRF contribution

learned_v3 / mode: "provider_derived"
→ baseline pre-rerank deterministic scoring and ordering
→ freeze baseline admission snapshot
→ apply bounded deterministic residual
→ call the exact qualified provider/model
→ direct slot-confined provider permutation
→ no fixed rerank-RRF contribution
```

**Canonical evidence order (ninth review, corrections — used everywhere):**
`eligibility → pre-rerank baseline scoring/order → admission snapshot → deterministic
evidence assembly → residual → optional provider permutation`.

- A zero-weight artifact reproduces the **pre-rerank deterministic baseline scores**
  exactly (tenth review B1 — not the reranker-enabled product scores).
- Deterministic controls (`must:`/exclude/lang/path, exact pinning, freshness, scope,
  ceilings, failure fallback, grouping/disclosure/pagination) remain outside the model.
- Invalid/missing/unqualified/revoked artifacts select baseline B with a truthful bounded
  diagnostic.
- Rollback is an artifact/config swap — no rebuild, no reindex.
- The neural contribution is a **provider-derived, gated, slot-bounded reorder** (third
  review, correction C6 — "learned deterministic residual + provider-derived gated slot
  reorder"), never the fixed `1/(10+rank)` bucket, never a locally trained neural policy,
  and never a membership change.

### 5.2 Keep hardcoded vs. move to evaluated/learned policy

**Keep hardcoded (contracts, not opinions):** `must:`/`exclude:`/`lang:`/`path:`
filtering; exact-symbol/exact-identifier handling; source-freshness and fingerprint
gates; candidate/byte/timeout/memory ceilings; fail-closed behavior; deterministic
fallback when the reranker fails; pagination and disclosure limits; **V3.0 additionally freezes: the retrieval/rerank contribution (three RRF layers 100/60/10 + rerank weight 1.0 — frozen for baseline mode; learned modes replace the rerank bucket per §5.1), candidate depth
(`clamp(max(limit×8,32),80)`), reranker admission (TOP_K 50, min-12, per-result
caps, supplemental caps), and the admission set itself** — which candidates enter the
provider request is decided once, on the `preRerankBaselineOrder`, before any residual is
computed (§5.1). A reranker may only reorder admitted candidates.

**Move to evaluated/learned policy (as residual coefficients and gate parameters):**
path-category multipliers (grouped); test/implementation/writer-intent multipliers
(grouped); changed-file contribution; generic owner-evidence contribution;
implementation/test intent interactions; neural evidence (within-query percentile +
margins) **gating constants** — preregistered, provider-specific, with the
provider-derived reorder per §5.3.16 (the Satori V3 neural policy is not locally
trained or selected).

### 5.3 Corrected architecture (binding)

1. **Separate recall from ranking — four stage observations, two tracks.** Per task,
   record `knownRelevantInRawArms`, `knownRelevantAfterCoreFusion`,
   `knownRelevantInMcpUnion`, `knownRelevantAfterEligibility`. Report **end-to-end**
   quality (a missing acceptable result is a miss) **and** **conditional ranking**
   quality (graded metrics only where a grade ≥2 result survives eligibility). This
   prevents both blaming the ranker for retrieval misses and hiding retrieval misses.
2. **Versioned evidence contracts — deterministic and neural are separate** (second
   review, blocking #3: neural scores do not exist until the later provider call, so one
   pre-scoring contract cannot contain them). `DeterministicRankingEvidenceV1` (schema
   `search_ranking_evidence_v1`): `candidateId`, `baselineScore` (**the
   `preRerankBaselineScore`**; the reranker-enabled `baselineModeFinalScore` is not an
   evidence input — tenth review B1), retrieval (explicit
   stage ranks + per-pass RRF contributions), candidate, query groups — available
   **after eligibility and baseline-B scoring, before residual scoring and reranker
   admission/application** (eighth review, correction 5; the later "Timing" note in
   this item is the operative statement); the residual feature vector is built
   from **deterministic evidence only**. `NeuralRankingEvidenceV1` (schema
   `neural_ranking_evidence_v1`): `candidateId`, `providerKey`, `rank`, `rawScore`,
   `withinQueryPercentile`, `candidateToTopMargin`, `topToSecondMargin` — available only
   after a complete validated provider response; consumed exclusively by
   `neuralEvidencePolicy` and the admitted-slot permutation stage. **Timing** (third
   review, correction C5): because `DeterministicRankingEvidenceV1` includes
   `baselineScore`, it is available **after eligibility and baseline-B scoring, but
   before residual scoring and reranker admission/application** — not "before
   deterministic scoring" in the broad sense. **Forbidden as
   features:** repository name, task ID, absolute paths, user identity, candidate
   identity hash, owner-family identity hash, provider hash. `candidateId`, `language`,
   `providerKey` are metadata/gating values only. Feature extraction happens **after
   eligibility and baseline-B scoring, before residual scoring**; `baselineScore` is an
   anchor feature. No feature may change deterministic eligibility.
3. **One evidence authority**: extend the existing capture survival schema to **v3**
   (`search_candidate_survival_v3`; raw arm rank/score, core fusion rank), translated
   from Core **`semantic_search_candidate_trace_v2`** (fifth review, correction C7). The runtime evidence object is derived from
   the same normalized stage evidence used by capture/replay. No parallel
   `retainArmEvidence` output; no feature-vector field in the public response
   (internal bounded evaluation hook only).
4. **One metric authority**: extend `evals/search-quality/search-quality-evaluation.ts`
   and its adapter consumers. New metrics: stage survival, judged-pool nDCG@10 with
   judgment coverage, conditional graded pair accuracy, end-to-end miss accounting.
   Existing owner metrics remain byte-compatible.
5. **Interpretable learned baseline first**: constrained **linear residual** (inspectable
   coefficients, monotonic constraints, deterministic replay, small-data compatible).
   Trainer exactly specified: within-query pairwise logistic loss, pair order grade
   3 > 2 > 1 > 0, L2 regularization, projected cyclic coordinate descent, no randomness
   after deterministic pair-sampling seed, train-fold-only normalization clipped to
   artifact bounds, deterministic per-query pair cap, canonical decimal rounding.
   LambdaMART/tree-based is a later contender, never the starting point.
6. **Neural evidence, not calibration**: retain raw `relevanceScore`; compute
   provider-local **within-query** rank percentile, raw-score percentile,
   candidate-to-top margin, top-to-second margin, presence indicators. No
   "calibrated probability" claim until cross-query comparability is demonstrated.
   Provider identity is a gating key, not a feature. Order-only provider abstraction
   deferred until a real provider needs it.
7. **Confidence gate**: apply neural reordering only when (a) full response valid and
   every candidate identity accounted for; (b) provider key accepted by the artifact's
   `neuralEvidencePolicy` (invariant: `keys(neuralEvidencePolicy.providers) ⊆
   applicability.supportedProviderKeys`, §5.3.16 — no separate `acceptedProviderKeys`
   array exists);
   (c) candidate set meets the provider's `minimumCandidates` and
   `minimumNormalizedTopToSecondMargin` (normalized per §5.3.16 — never a raw
   cross-provider margin); (d) no exact deterministic control owns the result —
   the skip rule is exactly the existing pin rule
   `top.exactLexicalMatch && (exactMatchPinningEnabled || (must query && top.passesMatchedMust) || scored.length === 1)`
   (a top satisfying `must:` alone **never** skips — all surviving candidates normally
   satisfy the post-retrieval `must:` filter); (e) model execution bound to the frozen
   candidate set. Otherwise deterministic V3 order + truthful diagnostics
   (`RERANKER_FAILED` preserved; `RERANKER_GATE_SKIPPED` added).
8. **Artifact + qualification registry (two objects, no circularity):**
   `RankingPolicyV3Artifact` (schemaVersion, policyId `search_ranking_policy_v3`,
   featureSchema `search_features_v1`, createdFromCommit, trainingManifestSha256,
   trainingCodeSha256, trainingContractSha256, normalization, weights, residualBounds,
   neuralEvidencePolicy, **applicability**) — **no self-hash, no quality receipt
   inside**; runtime computes SHA-256 over canonical bytes. The **applicability
   contract** proves runtime compatibility (second review, finding #9 —
   `trainingCodeSha256` proves which trainer produced the artifact, not that the current
   runtime feature extractor has identical semantics):
   `{ baselinePolicyIdentity: "search_candidate_final_score_v2", featureContractSha256,
   runtimeScoringContractId, retrievalContractId, rerankerProjectionIdentity,
   supportedProviderKeys: readonly string[] }` — **mode-dependent (tenth review C2)**:
   for `mode: "disabled"`, `supportedProviderKeys = []` and
   `rerankerProjectionIdentity` is absent/null/"none" (one sealed convention, chosen in
   R1.4); for `mode: "provider_derived"`, `supportedProviderKeys` contains **exactly
   one key** equal to `providerDerivedTarget.providerKey` and
   `rerankerProjectionIdentity` is required. Runtime **rejects a correctly hashed
   artifact** whose feature ordering, baseline formula, retrieval contract, or neural
   projection is incompatible. `RankingPolicyQualificationRegistry` entries follow the
   concrete schema (ninth review, B9):

   ```ts
   interface QualificationRegistryEntryV1 {
       artifactSha256: string;
       serviceClass: "online" | "offline_linux_x64";
       selectedArtifactMode: "disabled" | "provider_derived";
       qualificationScopeKey: string;   // sha256(canonicalJSON({serviceClass,
                                        // selectedArtifactMode, qualifiedRerankers}))
       qualifiedRerankers: readonly {
           providerKey: string;
           rerankerIdentity: string;
           rerankerProjectionIdentity: string;
       }[];
       status: "pending_heldout" | "activation_qualified" | "revoked";
       offlineQualificationReceiptSha256: string;
       heldoutAcceptanceReceiptSha256?: string;
       revocationReceiptSha256?: string;
   }
   ```

   `qualificationScopeKey` is computed over `{ serviceClass, selectedArtifactMode,
   qualifiedRerankers }` with **canonical ordering and no duplicates**; for
   `mode: "disabled"` the reranker list is **empty**. **V3.0 restricts qualification to
   one provider/model per cycle (ninth review, B11)**: each artifact + qualification
   cycle targets one serviceClass and either `mode: "disabled"` (no provider) or
   **exactly one** providerKey + rerankerIdentity + rerankerProjectionIdentity; a later
   artifact may qualify another provider/model — H9, I2, receipts, gates, and rollback
   all operate on the single qualified identity. The canonical
   `RegistryArtifactStatus =
   "pending_heldout" | "activation_qualified" | "revoked"` is distinct from the
   **`OfflineQualificationVerdict = "offline_qualified" | "rejected" |
   "insufficient_evidence"`**, which is an evaluation-receipt state, never a registry
   status (third review, blocker B2). Learned mode activates only when the registry
   qualifies the exact computed hash for the active service class with status
   `activation_qualified`. **Registry storage is append-only** (blocker B4):

   ```text
   qualification-registry/
     versions/<registry-sha256>.json          # one immutable version per transition
     receipts/<registry-sha256>.receipt.json
     current                                  # atomic pointer to the active version
   ```

   Transition procedure (F9 writer, under an exclusive lock — blocker B3): acquire the
   registry-directory lock (`O_CREAT | O_EXCL` lock file with stale-lock recovery, an OS
   file lock, or a single-owner broker — mechanism chosen in R1.4); verify the digest
   referenced by `current`; write the new version under its own content digest; fsync
   it; write and fsync its receipt; atomically replace the `current` pointer; fsync the
   directory; read back through the trusted loader; release the lock. **Immutability
   (fourth review, correction C2):** version and receipt files are created with
   **`O_CREAT | O_EXCL`** — an existing file is read through F0 and must be
   **byte-identical** to the expected content, otherwise the writer **fails closed**
   (overwriting under a content-addressed name would contradict "immutable"). The
   **`current` pointer** is precisely specified: a regular file, never a symlink;
   containing an exact lowercase 64-character SHA-256 plus an optional final newline;
   fixed byte ceiling; created as a temporary regular file; atomically replaced; read
   back and validated through F0. `current` means the current **registry version** —
   after H10 it may point at a version whose candidate is still `pending_heldout`.
   **Cardinality invariant per service class (fifth review, correction C3,
   F9-enforced):** multiple historically `activation_qualified` artifacts may remain
   recorded; configuration selects exactly one artifact hash; **at most one pending
   candidate per serviceClass/provider qualification scope**; H10 does not revoke or
   replace the currently active artifact; activation of the pending candidate does not
   automatically change product configuration; rollback is a config selection or a new
   revocation transition.
   Old versions are
   never mutated; rollback and revocation are **new transitions**, never deletion or
   mutation. **The F9 writer is implemented in Wave F and sealed by G7 (runtime
   implementation seal) after G6, before Wave H and held-out opening** (fourth review,
   blocker B1): I1's opening record includes the G7 seal — which covers F9 and
   everything it depends on — and I4 executes the same sealed writer; pending and
   activation transitions share one executable.
   **Qualification flow (second review, blocking #2):** G1/G2 integrate a generic scorer
   using **synthetic test artifacts** and must not depend on E4; E4 produces the sealed
   candidate artifact; Wave H evaluates it **only through offline/evaluation authority**
   — no unqualified artifact is loadable by product configuration (a test-only
   constructor or direct pure-scorer invocation may accept an unqualified fixture;
   production configuration must never have such a bypass); **I4 is the first point at
   which the product selector may return `learned_v3`**.
9. **Storage (replaces revision-1 M0 options; tenth review B2):** bundled **baseline B**
   only + **administrator-controlled trusted artifact path** (the qualified artifact
   lives externally) + **administrator-controlled append-only registry**. **Bundled
   qualified-artifact and bundled-registry delivery are removed from V3.0** —
   qualification evidence cannot exist before H9/H10/I4, so it is never packaged.
   **Repository-local `.satori/ranking-policy.json`
   is rejected** — a checked-out repository must not define the policy used to interpret
   itself. Rollback = artifact/config swap; no rebuild/reindex.
10. **Composite policy identity**: `search_ranking_policy_v3:<artifact-sha256>` carried
    by the existing `rankingPolicyIdentity` field of `search_ranked_set_binding_v1`; a
    continuation created under another artifact becomes stale via the existing
    `SEARCH_RESULT_SET_STALE` mechanism. No duplicate artifact/calibration binding
    fields. Policy hash is **not** added to index publication receipts (ranking does not
    affect index construction); it appears in startup diagnostics, search diagnostics,
    and ranked-set bindings.
11. **Graded judgments (tuning-only, human-authoritative):** grades 3/2/1/0 with
    source-bound rationale and explicit `judged` status; unjudged candidates are
    excluded from graded pair generation and **never silently become grade 0**.
    **Two independent proposals per task, produced through separate packet agents**
    (C3.*/C3A — eighth review, correction 5) + one human/adjudicator resolution (C4).
    Held-out authority is preserved untouched.
12. **LOFO selection**: leave-one-repository-family-out cross-validation over the 6
    tuning families; hyperparameters selected from out-of-fold results only; sealed
    training contract; then refit once on all tuning families.
13. **Offline shadow first — no production shadow selector** (second review, finding
    #12): production configuration exposes `baseline | learned_v3` only. Shadow exists
    as **offline replay over all tuning captures** plus an optional **injected in-memory
    observation sink for tests**; no public `shadowApplied` field during the byte-identity
    phase; no persistent production shadow log; no source text or full-query persistence.
    A production shadow selector may be added later only with an explicit privacy and
    telemetry plan.
14. **Bias measurement**: per-slice metrics (repository family, language, query class,
    path category, symbol role, negative tasks, exact controls, must, freshness,
    missing-evidence) with a multi-condition gate — macro metric improves AND no
    critical class regresses AND worst-family regression bounded AND exact/must controls
    perfect-or-bounded AND negative FPs don't increase AND resources pass.
15. **Counterfactual tests measure the residual, not baseline bias**: baseline B
    intentionally contains path multipliers, so a neutral path swap legitimately changes
    the baseline score. Gates check the **V3 residual shift**, **V3-vs-baseline rank
    transition**, and **protected-control outcome** — that V3 introduces no unexplained
    additional shortcut beyond preregistered bounds. A synthetic shortcut policy must
    fail the harness.
16. **Neural ordering contract — provider-derived reorder (Design A)** (disposition #9):
    the neural contribution has **no locally trained parameters in V3.0**. The complete
    validated provider order directly permutes the admitted slots: given the frozen
    `baselineAdmissionSet` (order `A`), the deterministic V3 order (order `V`), and the
    provider order over the admitted candidates (order `P`), the final order is `V` with
    the admitted identities **reordered within their own positions** to follow `P`.
    Tie-breaking and stability: candidates with equal provider evidence keep their
    relative `V` order (stable sort); exact-pin and `must:` deterministic controls are
    untouched (gate rule, item 7; and item 17's pre-residual pin protection). **Bound
    contract — Option A, slot-bounded only** (third review, blocker B5):
    `maximumNeuralResidual` is **removed from V3.0** — a score residual cannot bound a
    permutation; the only bounds are membership and slot confinement (the provider may
    perform any stable permutation of the admitted identities within their
    deterministic-V3 positions). Every remaining gate parameter is **provider-specific**
    and **preregistered** (blocker B6):
    `neuralEvidencePolicy.providers[providerKey] = { minimumCandidates,
    minimumNormalizedTopToSecondMargin }`, where the normalized margin is
    `(topScore - secondScore) / max(ε, topScore - bottomScore)` — the **only** choice,
    sealed with its ε in R1.2 (ninth review, corrections; no percentile/rank-gap
    alternative); never a raw cross-provider or cross-query
    difference), and **`keys(neuralEvidencePolicy.providers) ⊆
    applicability.supportedProviderKeys`** is the artifact-parser invariant (violation =
    rejection; **no separate `acceptedProviderKeys` array exists** — sixth review, item
    6). **Execution-mode union (fifth review,
    blocker B1)** — the artifact's neural behavior is an explicit tagged union, and only
    the E3-selected mode is serialized by E4:

    ```ts
    type NeuralReorderPolicy =
        | { mode: "disabled" }
        | { mode: "provider_derived"; providers: Readonly<Record<string, {
            minimumCandidates: number;
            minimumNormalizedTopToSecondMargin: number;
        }>> };
    ```

    If E3 selects the deterministic residual, E4 serializes `mode: "disabled"` and the
    artifact **cannot** invoke the provider-derived permutation (F5/G2 enforce this); if
    E3 selects residual + provider reorder, E4 serializes `mode: "provider_derived"`.
    H9 qualifies the **selected artifact mode** — H3/H4 are not two deployable
    interpretations of one artifact (their roles swap per mode, §6 Wave H).
    Parameters are sealed in R1.2, never
    trained and never selected from tuning results.
    **E4 always serializes the selected `NeuralReorderPolicy` union member (eighth
    review, correction 4)** — provider constants are serialized **only** for
    `mode: "provider_derived"`; for `mode: "disabled"` the artifact contains **no
    provider map and no neural gate parameters**. D2/E4 train only the deterministic
    residual; the refit never reproduces "the full residual-plus-neural artifact" when
    the selection is deterministic-only. **Design B**
    (a locally selected/trained neural permutation score with parameter search, LOFO
    selection, and serialization) is deferred to V3.1+; until then the residual-plus-
    neural contender is this fixed composition, reproducibly implementable from the
    sealed constants.
17. **Exact-control ownership precedes residual scoring** (third review, blocker B7;
    fourth review, blocker B3 — **one policy, sealed**): when the baseline-B order
    satisfies `shouldSkipRerankForExactPin`
    (`top.exactLexicalMatch && (exactMatchPinningEnabled || (must query && top.passesMatchedMust) || scored.length === 1)`),
    the rule is exactly:

    ```text
    do not apply the residual;
    do not apply the provider-derived reorder;
    return the deterministic baseline-B ordering unchanged.
    ```

    The suffix-only alternative is **rejected** (it would be a second ranking policy
    with distinct runtime, training, replay, metric, counterfactual, policy-identity,
    and byte-parity consequences). The neural gate's skip rule (item 7) remains but is
    never the *only* protection: the residual itself must not demote a pinned top. G1
    carries tests where an extreme synthetic residual attempts to demote (a) an exact
    pinned identifier, (b) an exact single hit, and (c) an exact hit satisfying the
    applicable `must:` rule — each must yield the unchanged baseline-B order; G6's
    generic exact-pin case is not precise enough for this crossover.

### 5.4 V3.0 scope

**Included:** capture survival schema v3 (`search_candidate_survival_v3`); raw reranker score retention; explicit pre-policy ranking
evidence; tuning-only graded judgments with unjudged handling; end-to-end + conditional
graded metrics in the existing evaluator; LOFO cross-validation; eight-knob grouped
retuning contender; bounded residual linear contender; provider-local within-query
neural evidence; generated artifact + separate qualification registry; `baseline | learned_v3`
production selection with baseline default (no production shadow selector; offline shadow
evaluation only); composite policy identity in the ranked-set binding; one
owner-authorized held-out adjudication after tuning selection.

**Deferred to V3.1 (recall-policy project, not hidden in a ranking artifact):** learned
retrieval-arm fusion; learned candidate depth; learned reranker admission depth; any
setting that can change candidate membership.

**Deferred (no real requirement yet):** global score-to-probability calibration;
order-only provider abstractions; LambdaMART/tree ranking; persistent production shadow
telemetry; online/click learning; new held-out grading; repository-local policy
artifacts; **locally selected/trained neural permutation policy (Design B, §5.3.16)**
— V3.0 uses the provider-derived reorder with preregistered gate constants.

---

## 6. Execution structure (replaces revision-1 phases; revision-1 phase mapping in headers)

Central-file ownership (binding — the practical difference between parallel agents and
uncontrolled concurrent editing):

| File | Exclusive owner |
| --- | --- |
| `packages/mcp/src/core/search-execution.ts` | B5 (evidence integration), then G1/G2 (runtime integration) — sequential |
| `packages/mcp/src/core/search-types.ts` | G3 (diagnostics projection) only |
| `packages/mcp/src/config.ts` | F6 (policy selector) only |
| `packages/mcp/src/core/search-result-set-identity.ts` | F7 (ranked-set identity) only |
| `scripts/satori-search-candidate-capture.mjs` | B6 (capture schema) only |
| `scripts/satori-search-candidate-replay.mjs` | B7 (replay schema) only |
| `scripts/satori-search-candidate-score.mjs` | C6 backward-compatibility adapter only |
| `evals/search-quality/search-quality-evaluation.ts` | **R0.1A → A10 → C6 (sequential)** — R0.1A (pre-freeze fixture repair) edits it first, then A10 metric extensions, then C6 scorer integration (eighth review, correction 6) |

Every task: one isolated worktree; one semantic commit; one independent review before
merge; exact `node --import tsx --test <file>` commands;
edits only to listed files (otherwise stop and report the dependency).
**Card-type contract (tenth review C5 — a failing test is not required for every
card):** `code_change` → failing focused test → implementation → passing test;
`documentation` / `evidence` / `execution` → unmet-precondition verifier → task →
validating verifier; `human_decision` → input checklist → owned decision artifact →
schema/digest validation.

**Pre-dispatch card contract** (second review, small-agent executability — every
dispatch card must carry, before any agent runs, its **card type** and): exact files
**and allowed line regions**; exact consumed/produced signatures; the card-type
verification sequence above (failing test for `code_change`; verifiers otherwise); the exact command that
proves the failure; minimal implementation steps; the exact command that proves
passing; acceptance output; commit message; do-not-touch list. **One card per dispatch
unit** (tenth review C5 — mandatorily split tasks produce several cards). "Construction sites
identified by R0.1", "continuation call sites", and "create/extend the evaluator" are
discovery instructions, not scopes — each must be resolved to concrete paths by the
preceding receipt before dispatch.

**Task splits** (second review — these cards are too large for one small agent; split
before dispatch):

| Existing task | Required split |
| --- | --- |
| A1 | schema/types; runtime parser (`semantic-search-candidate-trace.ts`); compatibility tests |
| A10 | pure metric module; evaluator integration; legacy-output parity |
| B1 | fusion evidence; semantic-service trace projection |
| B5 | pass-evidence wiring; rerank-evidence wiring; baseline identity gate |
| C5 | judgment schema upgrade; builder upgrade; tuning-manifest materialization |
| C6 | stage-survival adapter; graded metric integration; legacy scorer parity |
| D2 | pair builder; normalization; optimizer; artifact serializer |
| G1 | baseline admission snapshot; residual scoring; selection/fallback wiring; parity receipt |
| G2 | provider-evidence validation; slot permutation; transactional failure path |
| G4 | artifact construction binding; qualification binding; service-class startup tests |

C2/C3 dispatch per **bounded packet of roughly 5–8 tasks**, not per whole repository.

**DX.<target-wave> — Materialize next-wave dispatch cards** (eighth review, blocker 2 —
a reusable task type with a named instance at every wave boundary: DA (Wave A, = R1.6),
DB (Wave B, after the Wave A gate), DC, DD, DE, DF, DG, DH, DI (Wave I, after the Wave H
gate)):

- **Dependencies:** the previous wave's gate receipt, its card-set manifest, and the
  target wave's contract/prerequisite receipts (contract-sealed signatures for Wave A;
  implemented-file signatures for later waves).
- **Files:** produce a **new immutable directory**
  `docs/evidence/ranking-v3-dispatch-cards-<date>-<sequence>-<scope>/` — never updates
  or overwrites a previous receipt (append-only evidence); `<sequence>` disambiguates
  same-day sets.
- **Owns:** generating the next card set per the R0.1B card contract; validating
  prerequisite interfaces; sealing the `ranking_v3_dispatch_cards_v1` manifest;
  recording previous-receipt + revoked-card bindings (**revoking only overlapping
  unexecuted cards — executed cards remain historical evidence**); obtaining
  independent review.
- **Acceptance:** manifest canonical rehash passes; no card references the companion;
  review recorded.

There is no wave boundary without a named DX instance — dispatch authority never
becomes informal.

**Execution order** (second review — the sequence after authorization):

```text
1. Merge security hardening (R0.0).
2. Repair the search-quality fixture (R0.1A, pre-freeze).
3. Freeze the real integration HEAD (R0.1).
4. Seal contracts (Gate 1).
5. Implement pure schemas and validators (Wave A).
6. Instrument with byte-identity proof (Wave B).
7. Build tuning-only human judgment authority (Wave C).
8. Run LOFO and select exactly one contender (Waves D–E).
9. Integrate the generic runtime engine without activating the contender (Waves F–G).
10. Qualify the one selected artifact offline (Wave H).
11. Open held-out only under fresh owner authorization (Wave I).
```

---

### Gate 0 — Freeze current behavior (revision-1 Phase 0, rebased)

**Execution order (eighth review, blocker 1 — the fixture repair lands BEFORE the
freeze, so the frozen HEAD and the cards bound to it describe the actual R0.2 execution
base):**

```text
R0.0 — owner action: merge + verify security hardening (behavioral receipt)
R0.1A — repair the search-quality fixture (pre-freeze bootstrap, owner-authorized)
R0.1 — freeze the post-hardening, post-fixture-repair HEAD; BASELINE.md + SOURCE_ANCHORS.json
R0.1B — generate cards for R0.2 and Gate 1 (bound to the frozen HEAD)
R0.2 — capture the baseline from that exact frozen HEAD
```

#### R0.0 — Merge and verify security hardening (owner action, no code task)

Merge `integrate/security-hardening-20260805` and land the behavioral acceptance
receipt (R0.1 step 2's requirements) at the resulting HEAD. Gate 0 does not start
before this.

#### R0.1A — Search-quality fixture modernization (pre-freeze bootstrap; disposition
#11; R0.2 prerequisite)

**Goal:** make `pnpm eval:search-quality` green **before the freeze**. The fixture is
RED
(three stale seams since its creation commit `a25f9cb`, 2026-07-15), so R0.2's baseline
capture is blocked until this task lands. This is a **reviewed, dedicated, owner-
authorized bootstrap task** (eighth review, blocker 1 — it runs before R0.1, so the
frozen HEAD already contains the repair; it is not expected to have been generated by
R0.1B, like R0.1/R0.1B).

**Files:**
- Modify: `evals/search-quality/search-quality-evaluation.ts` (and
  `evals/search-quality/fixtures/search-quality/v1/` only if the manifest itself is
  stale — prefer code-side repair).
- Create: focused tests under `evals/search-quality/` for each repaired seam.
- Create: `docs/evidence/ranking-v3-fixture-repair-<date>/FIXTURE_REPAIR_RECEIPT.md`.

**Known seams (verified 2026-08-06 at `9c85b22`; re-verify at the actual base):**
1. `CapabilityResolver` input omits the now-required `ContextMcpConfig.networkPolicy`
   → crash in `resolveRerankerProvider` (`packages/mcp/src/config.ts:237`); supply
   `networkPolicy: { kind: 'local-only' }` (hermetic fixture).
2. Index-registry readiness: the fixture's empty temp state root fails the real
   `TrackedRootReadiness` gate; use the repo's own seam
   (`handlers.status.test.ts` pattern: override
   `handlers.trackedRootReadiness.prepareTrackedRootForRead` to return a ready state
   with `root.path`, `vectorReceipt`, `navigationStatus: 'valid'`).
3. Publication-vs-source verification: even with readiness, the search front door fails
   with `status: "not_ready", reason: "source_state_unverified"` — resolve by writing
   the real publication records (completion marker + generation seal) into the temp
   state root, or by the same authorized override seam; do not weaken the gate.

**Rules:** repair at the responsible boundary; **never weaken the fixture or its
assertions to pass**; the fixture manifest hash must stay stable. **Scope discipline**
(third review, correction C3): additional stale seams **inside the authorized files**
(`search-quality-evaluation.ts` and its fixture dir) may be repaired and recorded in
the receipt; a seam requiring **another file stops the task** and creates a reviewed
follow-on card. R0.1A is **end-to-end**: prefer writing the real publication records
(completion marker + generation seal) into the temp state root so the front-door
readiness and publication gates are genuinely exercised; readiness/publication override
seams are used only where the fixture's hermetic design requires stubbing, and the
receipt records which seams were overridden vs. exercised.

**Steps:**
1. Failing tests first: reproduce each seam with a focused failing test.
2. Implement the three repairs; run the exact focused test files and
   `pnpm eval:search-quality`.
3. Record the receipt: seams repaired, commands run, fixture manifest hash, and the
   full output summary (workloads `status: "ok"`, nonzero owner rates, REQUIRED_LIMITS
   [1,3,5,10,20] results).

**Acceptance:** `pnpm eval:search-quality` exits 0 with workloads `status: "ok"` and the
expected owner-rank results; fixture manifest hash unchanged; receipt on file; **no
production code changed** (the fixture repair lands before R0.1's freeze, so it is part
of the frozen tree).

#### R0.1 — Integration-base receipt

**Files:** create `docs/evidence/ranking-v3-rebase-<date>/BASELINE.md` and
**`SOURCE_ANCHORS.json`** only (seventh review, correction C1 — the authoritative anchor
manifest; the plan text itself is revision-controlled separately and is not modified by
R0.1).

**Interfaces:** consumes the **post-hardening, post-fixture-repair integration HEAD**
(R0.0 merge + R0.1A landed — eighth review, blocker 1: the frozen HEAD already contains
the fixture repair), the **security-hardening acceptance receipt** (third review, correction
C2 — behavioral proof, not ancestry alone), revision-1 claim list (§10), W-fix receipt
(`docs/evidence/search-integrity-baseline-20260805/BASELINE.md`).

**Steps:**
1. Verify the prerequisite base with **exact commit IDs and merge-base ancestry only**
   (fifth review, correction C5 — `git log --grep` is removed: commit messages and
   branch names are not security evidence and may disappear after squash or cleanup):
   the hardening integration commit ID is an ancestor of HEAD
   (`git merge-base --is-ancestor <integration-commit> HEAD`). If not merged, **Gate 0
   is blocked** — record the blocker; do not baseline on unhardened master.
2. **Verify the hardening acceptance receipt is green and bound to the frozen HEAD —
   behavior, not branch name** (third review, correction C2; fourth review, correction
   C7 — ancestry plus a previously green receipt is insufficient if code changed
   afterward): the receipt must carry `receipt.commitSha === frozen integration HEAD`,
   or the exact hardening acceptance suite must be **rerun at the frozen HEAD**;
   binding is verified via `git merge-base --is-ancestor <receipt-commit> HEAD` +
   rerun — `git log --grep` is not security evidence (commit messages and branch names
   may disappear after squash or cleanup). The receipt's acceptance tests must
   demonstrate at least: indexing `/` is rejected; indexing the user home directory is
   rejected unless explicitly authorized; `.ssh`/`.aws` and configured secret roots are
   rejected; `read_file` cannot read unpublished or unauthorized files; symlink and
   special-file cases fail closed; byte ceilings are enforced before whole-file
   allocation; shared-runtime context/authentication behavior matches the accepted
   threat model (M1 decision); all external provider requests have bounded
   cancellation/deadline behavior (A2). Gate 0 requires **both** hardening ancestry
   **and** this receipt/tests green at the frozen HEAD.
3. Record HEAD/tree, clean-state proof, and the changed ranking/search files since
   `633c1d4a` (the hardening merge is expected to be the principal delta; every change
   dispositioned `confirmed` / `changed` / `removed` — §10 re-verification rerun at the
   new base).
4. Confirm W-fix landed (bounded `must:` lane + reranker timeout bounds in
   `search-execution.ts`; stopping condition: its receipt current).
5. Record current policy/binding IDs and the focused test command map (exact file paths
   for every suite Gate 0–Wave G touches; verify at least one core and one mcp exact-file
   command actually narrows).
6. **Generate `SOURCE_ANCHORS.json`** (seventh review, correction C1): one entry per §2/§10
   claim — `{ claimId, commitSha, path, symbol, startLine, permalink (commit-bound URL),
   sourceSha256 }` — regenerated against the frozen HEAD. This manifest is the
   **authoritative anchor source**; §2/§10 line numbers are declared snapshots of it.

**Acceptance:** no product files change; every claim dispositioned against the
post-hardening HEAD; test-command map verified; hardening ancestry proven by merge-base;
**hardening acceptance receipt green (behavioral tests) recorded in the receipt**;
**§2/§10 source anchors regenerated against the frozen HEAD** (sixth review, item 2 —
symbol names and exact commit-bound links are the primary reference; line numbers are
generated convenience data).

#### R0.1B — Dispatch-card materialization, staged (sixth review item 1; seventh review
blocker B2 — all-waves generation at this point is impossible: contracts unsealed, Wave
A–F files nonexistent, G4/H/I signatures unknowable, C2/C3 packet identities unknown)

**Goal:** generate the dispatch cards **for the next dependency-ready scope only** from
**§6 of this plan** — the retired companion (`2026-08-05-satori-ranking-v3-reviewed-small-agent-design.md`)
was **SUPERSEDED and is now DELETED (2026-08-06)**; its Revision-2 task cards and
dependency graph conflict with the normative plan and must not be executed.

**Staging (seventh review, blocker B2; eighth review, blocker 1 — R0.1A is a
pre-freeze bootstrap task and is not card-generated):**
- **R0.1B (here):** cards for **R0.2 and Gate 1 only**.
- **R1.6 (the Wave A instance of DX.<wave>):** after `CONTRACT_SEAL.json` is sealed,
  generate and seal **Wave A** cards.
- **After each wave gate:** instantiate **DX.<target-wave>** (§6) for the **next
  dependency-ready wave** (its contracts, prerequisite files, signatures, and receipts
  exist by then).
- Any change to the plan, the frozen HEAD, the contract seal, or a prerequisite
  interface **invalidates the affected unexecuted cards** and requires regeneration of
  that card set.

**Files:** create a **new immutable directory**
`docs/evidence/ranking-v3-dispatch-cards-<date>-<sequence>-<scope>/` (eighth review,
blocker 2 — repeated `-<date>`-only names can overwrite same-day card sets, violating
append-only evidence; `-<sequence>` disambiguates, `-<scope>` names the wave) containing
`DISPATCH_CARDS_RECEIPT.md`, the machine-readable manifest `cards.manifest.json`, and
one card **per dispatch unit** (`cards/<taskId>.md`; mandatorily split tasks produce several cards — tenth review C5). **Never update or overwrite a previous
receipt.**

**Produces:** per-card dispatch sheets from §6 + R0.1's test-command map, each with a
**card type (ninth review, corrections)** — `code_change | documentation | evidence |
human_decision | execution` — and: exact files **and allowed line regions**; exact
consumed/produced signatures; one
failing test; the exact command proving the failure; minimal implementation steps; the
exact command proving passing; acceptance output; commit message; do-not-touch list.
**A failing unit test is required only for `code_change` cards**; documentation,
evidence, human-decision, and execution cards define their own acceptance evidence.

**Card-set manifest** (seventh review, correction C4 — machine-readable, canonical):
```json
{
  "schemaVersion": "ranking_v3_dispatch_cards_v1",
  "planSha256": "...",
  "sourceCommit": "...",
  "sourceTreeSha256": "...",
  "contractSealSha256": null,
  "prerequisiteReceipts": [],
  "cards": [{ "taskId": "R0.2", "path": "cards/R0.2.md", "sha256": "..." }]
}
```
Canonicalization: cards ordered by taskId; paths normalized (forward slashes, no
leading `./`); final-newline normalization before hashing; the receipt does **not**
hash itself. **Supersession/revocation**: each new card-set receipt binds the previous
receipt digest and lists **revoked card digests — only for overlapping unexecuted
cards**; already-executed cards remain historical evidence and are never revoked
(eighth review, blocker 2); a card is dispatchable only while its manifest is current
and all bound prerequisites match.

**Steps:**
1. Enumerate the in-scope §6 tasks against the frozen HEAD (R0.1B: R0.2/Gate 1; later:
   the next dependency-ready wave per the staging rule).
2. Resolve every "construction site"/"call site" phrase in the cards to concrete paths
   (R0.1's test-command map is the input; unresolved discoveries are blockers for that
   card, reported, not invented).
3. Write the manifest; record previous-receipt + revoked-card bindings; seal the set.

**Bootstrap rule (seventh review, blocker B2; eighth review, blocker 1):** R0.1,
R0.1A, and R0.1B are owner-authorized planning/bootstrap tasks and are **not expected
to have been generated by R0.1B**.

**Acceptance:** every dispatch card in scope is executable from its own text; no card
references the companion document; the manifest binds plan/commit/tree/contract
digests and passes canonical rehash; tasks are dispatched **only** from current,
unrevoked cards.

#### R0.2 — Baseline capture receipt

**Files:** create `docs/evidence/ranking-v3-phase0-20260806/PHASE0_BASELINE_RECEIPT.md`
plus generated artifacts in the same directory.

**Interfaces:** consumes `pnpm eval:search-candidates:capture` (tuning split only,
`--require-replay-ready`), `pnpm eval:search-quality`, `pnpm eval:useful-context:record`
(cold/warm latency/RSS). **Depends on R0.1A** (fixture modernization) — R0.2 does not
start until R0.1A's receipt is on file.

**Steps:**
1. Run `pnpm eval:search-quality` (deterministic fixture; REQUIRED_LIMITS [1,3,5,10,20])
   — must be green per R0.1A.
2. Capture the 6 tuning families (frozen revisions/tree SHA-256s from v3 manifest);
   record capture digests. **Enforceable held-out restrictions (second review, finding
   #13):** do not execute held-out queries; do not create held-out captures; do not
   inspect held-out contender outputs; do not use held-out judgments or outcomes for
   design, grading, feature selection, hyperparameter selection, or debugging. Sealed
   manifest digests and repository metadata may be read for opening verification only.
3. Record latency/RSS profile, constants digest (§2.4 frozen as evidence), policy ID
   (`search_candidate_final_score_v2`), binding identity
   (`search_ranked_set_binding_v1`), and held-out-unopened proof (opening-record absence
   for the cross-repository v2/v3 split; the track-O opening record is a separate LateOn
   track and does not count).

**Acceptance:** baseline replay reproduces identities, scores, ordering, removals,
grouping, and disclosure from the frozen captures; zero policy changes; no code changed.

---

### Gate 1 — Seal the four contracts before any tuning output (preregistration)

Four parallel documentation tasks, then one reconciliation/seal task. Nothing in this
gate touches product code.

#### R1.1 — Feature contract

**Files:** create `docs/evidence/ranking-v3-contract-20260806/FEATURE_CONTRACT.md`.

**Locks:** `DeterministicRankingEvidenceV1` field names (deterministic only — neural
fields live in `NeuralRankingEvidenceV1` and are excluded from the feature vector);
missingness; one-hot expansions;
interaction set (`test-path × test-intent`, `test-path × implementation-intent`,
`docs-path × docs-route`, `generated × explicit-generated-or-path-intent`, …);
forbidden features (§5.3.2); stage-rank definitions
(`rawDenseRank?/rawLexicalRank?/rawFallbackLexicalRank?/coreFusionRank?/mcpUnionRank?/
postEligibilityRank?/rerankerAdmissionRank?`); the bounded confidence mapping from
`SearchIntentConfidence` + hard booleans (never fabricated probabilities).

#### R1.2 — Training contract

**Files:** create `docs/evidence/ranking-v3-contract-20260806/TRAINING_CONTRACT.md`.

**Locks:** pair generation; pair cap; objective (within-query pairwise logistic, grade
3 > 2 > 1 > 0); L2 regularization; optimizer (projected cyclic coordinate descent);
iteration count; convergence rule; canonical decimal rounding; coefficient ranges;
residual bounds; deterministic seed derivation; LOFO procedure (train N−1, score
excluded family, aggregate repository-macro deltas, select hyperparameters from
out-of-fold only, refit once after sealing); **neural ordering contract (Design A,
§5.3.16)** — the complete validated provider order directly permutes admitted slots;
bound contract is **Option A (slot-bounded only; `maximumNeuralResidual` removed)**;
gate parameters are **provider-specific preregistered constants**
(`providers[providerKey].minimumCandidates`,
`providers[providerKey].minimumNormalizedTopToSecondMargin`), never trained or
tuning-selected; **the normalized-margin contract seals more than the headline formula
(fourth review, correction C5)**: exact ε; score direction (higher is better); minimum
candidate count (≥3 for this formula); all-equal-score behavior; two-candidate
behavior; nonmonotonic provider-order-vs-score behavior; tie precision and canonical
rounding; NaN/infinity/negative-denominator handling; and whether a provider order that
contradicts its own raw scores is rejected; **provider-key simplification
(fourth review, correction C5)**: `keys(neuralEvidencePolicy.providers)` — the single
authority, no separate `acceptedProviderKeys` array exists; the terminology "accepted
provider keys" refers only to this derived set;
**E4 always serializes the selected `NeuralReorderPolicy` member (ninth review,
corrections — provider constants only for `provider_derived`, none for `disabled`)**;
**D1's exact search parameters are sealed here (ninth review, corrections)**: grid,
search order, seed, tie-breaking, and stopping rule — no free-form search.

#### R1.3 — Metric and decision contract

**Files:** create `docs/evidence/ranking-v3-contract-20260806/DECISION_CONTRACT.md`.

**Locks:** existing owner/MRR/non-inferiority/resource gates; stage-survival reporting
(four stage observations); graded metrics (judged-pool nDCG@10 with coverage,
conditional graded pair accuracy); end-to-end miss accounting; slice set; counterfactual
residual bounds; contender comparison set (baseline B, grouped tuned baseline,
deterministic residual V3, residual+provider-reorder V3) — baseline B
listed exactly once; terminal `insufficient_evidence` behavior; **grouped-comparator
policy (seventh review, correction C2) — sealed as `required | optional`**: if
`required`, D1 failure → `insufficient_evidence` and no conditional wording applies; if
`optional` (the default), H2 stays diagnostic, H6–H9 do not depend on it, and the H9
receipt records `groupedComparator: available | unavailable | not_required`.

#### R1.4 — Artifact and activation decision

**Files:** create `docs/evidence/ranking-v3-contract-20260806/ARTIFACT_ACTIVATION_DECISION.md`.

**Locks:** storage (**bundled baseline B only + administrator-controlled trusted
artifact path + administrator-controlled append-only registry — no bundled qualified
artifact or bundled registry in V3.0**, tenth review B2; repo-local rejected); canonical JSON + computed SHA-256;
**`providerDerivedTarget` sealed here (tenth review B4)** — `null | { providerKey,
rerankerIdentity, rerankerProjectionIdentity }`, chosen **before B9 and LOFO**; the
provider/model may never be selected retrospectively after tuning results; B9/E2
evaluate only this preregistered target; E3 may select the mode but never the
provider/model;
qualification registry schema and service classes; **canonical registry state machine
(third review, blocker B2)** — `OfflineQualificationVerdict = "offline_qualified" |
"rejected" | "insufficient_evidence"` (evaluation receipt) vs `RegistryArtifactStatus =
"pending_heldout" | "activation_qualified" | "revoked"` (registry versions); the
**append-only registry layout** (`versions/<sha256>.json`, `receipts/<sha256>.receipt.json`,
atomic `current` pointer — blocker B4); the **lock mechanism choice** (`O_CREAT|O_EXCL`
lock file, OS file lock, or single-owner broker — blocker B3) with the full transition
procedure and two-concurrent-writers test requirement; **safe stale-lock recovery
(fourth review, correction C3 — one exact rule; time-based deletion is rejected as
unsafe)**: the lock file contains PID + process-start identity + boot/session
identifier; an existing lock causes fail-closed behavior; automatic removal occurs only
when the owning process is provably dead **and** its process-start identity no longer
matches; otherwise an explicit administrative recovery operation is required; tests —
a live lock is never stolen, a crashed-owner lock can be recovered, a malformed lock
fails closed, and recovery cannot delete a newly replaced lock; the
**F9 writer contract** (canonical byte construction, previous-version validation,
**`O_CREAT|O_EXCL` version/receipt creation with byte-identical verification, C2**,
temp-file creation, ownership and permissions, fsync, atomic pointer replacement,
read-back through the trusted loader, final-digest verification, update receipt binding
previous-registry-digest + artifact-digest + status-specific receipt + service class
+ new-registry-digest) — **the F9 writer is sealed by G7 (not "before Gate 1"); the G7
seal digest is included in the I1 opening record** (fourth review, blocker B1);
**receipt schemas and issuer authority (fifth review, blocker B2)** — the four A11
receipt types with exact-key parsers, and the authority rule: same-UID trust boundary
accepted (file ownership/mode bits; M1 default), signatures/separate OS identity only
if that boundary is later rejected; **provider/model-bound qualification (fifth review,
blocker B4)** — `qualifiedRerankers` identities (providerKey + rerankerIdentity +
rerankerProjectionIdentity, model name and revision part of the key) bound in
offline-qualification and activation receipts; **platform capability matrix (fifth
review, correction C4)** — Linux/macOS/Windows guarantees for O_NOFOLLOW, inode/device
checks, boot/process identities, directory-replacement detection, atomic rename +
directory fsync, process liveness; where unimplementable, external learned-policy
loading and registry mutation are disabled (baseline + truthful diagnostic), never
silently weakened; **registry cardinality invariant (fifth review, correction C3)** —
multiple historically activation-qualified artifacts may remain; configuration selects
exactly one artifact hash; at most one pending candidate per serviceClass/provider
qualification scope; H10 does not revoke or replace the active artifact; activation
does not auto-change product config; rollback = config selection or new revocation
transition; baseline fallback; composite
policy identity `search_ranking_policy_v3:<artifact-sha256>`; rollback = new transition,
never mutation; startup validation (exact schema, coefficient ranges,
unknown-field rejection, fallback diagnostic).

#### R1.5 — Contract seal

**Files:** create `docs/evidence/ranking-v3-contract-20260806/CONTRACT_SEAL.json`.

**Produces:** SHA-256s of R1.1–R1.4 and the source commit.

**Acceptance:** no later task may change those contracts without restarting tuning
evidence (L5/R5 rule).

#### R1.6 — Wave A dispatch-card generation and seal (seventh review, blocker B2;
eighth review, blocker 2 — this is the **DA (Wave A) instance of the reusable
DX.<target-wave> task type**, §6)

**Files:** create `docs/evidence/ranking-v3-dispatch-cards-<date>-<sequence>-wave-a/`
(cards + manifest + receipt; **immutable, never overwritten** — eighth review, blocker
2).

**Steps:** after `CONTRACT_SEAL.json` exists, generate + seal **Wave A** cards per the
R0.1B staging rule (contract-sealed interfaces are the signature inputs; Wave A files
do not yet exist, so line regions are resolved against the frozen HEAD at generation
time and regenerated if interfaces change).

**Acceptance:** the manifest binds planSha256, sourceCommit/tree, contractSealSha256
(non-null), prerequisite receipt digests (incl. R0.1/R0.1B receipts), and per-card
SHA-256s; canonical rehash passes.

---

### Wave A — Pure foundations, unlimited parallel (revision-1 Phase 1 foundations)

None of these tasks touches `search-execution.ts`.

- **A1 — Core trace v2 schema + runtime parser** (split: schema/types; runtime parser;
  compatibility tests): modify `packages/core/src/types.ts`; create
  `packages/core/src/core/semantic-search-candidate-trace.ts` +
  `packages/core/src/core/semantic-search-candidate-trace.test.ts`. Core schemas are
  `semantic_search_candidate_trace_v1` (existing) and
  `semantic_search_candidate_trace_v2` (**new**, additive raw-arm rank/score + core
  fusion rank). The parser exposes
  `parseSemanticSearchCandidateTrace(value: unknown): SemanticSearchCandidateTraceV1 | SemanticSearchCandidateTraceV2`
  — TypeScript interfaces cannot provide exact-key runtime validation, so the parser
  owns exact-key checks, bounds, and canonical round-trip; v1 remains parseable
  unchanged.
- **A2 — MCP deterministic evidence contract:** create
  `packages/mcp/src/core/search-ranking-evidence.ts` + test.
  `DeterministicRankingEvidenceV1` (§5.3.2) + validation helpers; no integration.
- **A3 — Rerank evidence builder:** create `packages/mcp/src/core/rerank-evidence.ts` +
  test. Pure mapping from complete `RerankResult[]` + candidate IDs + provider identity
  to validated one-based evidence; rejects duplicates, missing IDs, non-finite scores,
  count mismatch.
- **A4 — Feature schema and extractor:** create
  `packages/mcp/src/core/ranking-features-v1.ts` + test. Fixed ordered numeric vector,
  missing indicators, interaction features, forbidden-key checks, canonical names;
  consumes `DeterministicRankingEvidenceV1` only (neural fields excluded — second
  review, blocking #3); must not import `search-execution.ts`.
- **A5 — Policy artifact parser:** create
  `packages/mcp/src/core/ranking-policy-artifact.ts` + test. Exact schema parsing, range
  validation against the sealed training contract, canonical bytes, computed SHA-256; no
  file loading.
- **A6 — Qualification registry parser:** create
  `packages/mcp/src/core/ranking-policy-qualification.ts` + test. Exact
  artifact-hash/service-class qualification and revocation lookup.
- **A7 — Policy identity helper:** create
  `packages/mcp/src/core/ranking-policy-identity.ts` + test. Baseline identity and
  `search_ranking_policy_v3:<sha256>`; rejects malformed hashes.
- **A8 — Graded judgment schema:** create `scripts/ranking-judgments.mjs` + test.
  Tuning-only judgment validation, source-bound evidence validation, explicit `judged`
  status, rejection of hidden binary fallback.
- **A9 — LOFO fold builder:** create `scripts/ranking-lofo-folds.mjs` + test.
  Deterministic train/evaluate family sets and fold digests; rejects related
  revisions/families crossing a fold boundary.
- **A10 — Metric extension primitives:** extend
  `evals/search-quality/search-quality-evaluation.ts` + focused tests in that directory.
  Stage survival, conditional graded pair accuracy, judged-pool nDCG@10 with coverage,
  end-to-end miss accounting; existing owner metrics byte-compatible.
- **A11 — Qualification transition receipt schemas** (fifth review, blocker B2): create
  `packages/mcp/src/core/ranking-qualification-receipts.ts` +
  `packages/mcp/src/core/ranking-qualification-receipts.test.ts`. Defines and parses
  distinct exact-key schemas: `OfflineQualificationReceiptV1`,
  `HeldoutAcceptanceReceiptV1`, `RevocationAuthorizationReceiptV1`,
  `RegistryTransitionReceiptV1`, **plus the held-out chain (ninth review, B1/B8)**:
  `OwnerAuthorizationReceiptV1`, `HeldoutOpeningRecordV1`,
  `HeldoutExecutionReceiptV1`, **`HeldoutRejectionReceiptV1` (tenth review B3)** — the
  chain
  `I0 → I1 → I2 → I3 → (I4 or I3R)` is enforced by **each receipt binding the previous
  receipt's digest** (no missing or foreign links); the rejection receipt binds
  OwnerAuthorizationReceipt + HeldoutOpeningRecord + HeldoutExecutionReceipt digests,
  artifact hash, service class, selected mode, qualification scope, G7 seal, held-out
  manifest, and a terminal `rejected` decision (rejection is **not** an administrative
  revocation). Each binds: artifactSha256, serviceClass,
  selectedArtifactMode, G7 implementation-seal digest, contract-seal digest,
  training/evaluation manifest digests, provider/reranker qualification scope
  (`qualifiedRerankers` where applicable), held-out manifest digest where applicable,
  decision/verdict, receipt type + schema version. **Mode-qualification invariant
  (eighth review, blocker 3), enforced by A11 parsing and by H9/H10/I4 receipts:**
  `mode: "disabled"` ⇒ `qualifiedRerankers` is empty; `mode: "provider_derived"` ⇒
  `qualifiedRerankers` contains **exactly one** entry (V3.0 one-provider-per-cycle,
  ninth review B11) within
  `applicability.supportedProviderKeys`. **Issuer authority is explicit: the
  same-UID trust boundary is accepted** — file ownership and mode bits are the
  authority (consistent with the M1 trust-model default); if same-UID processes are
  later treated as adversarial, receipts require signatures or a separate OS identity
  (a recorded decision point, never silent). F9 depends on A11 and accepts **only
  parsed receipt objects** — no loosely shaped JSON, no internal re-parsing.

**Wave A gate:** all pure modules green on exact-file test commands; no central-file
edits.

---

### Wave B — Instrumentation modules (revision-1 Phase 1 implementation)

B1–B3 in parallel (B1 deps A1; B2 deps A2; B3 deps A3), then B4 (deps A2, A4, B2),
then the single evidence-integration owner B5, then B6/B7 sequential, then B8
(tenth review C7 — the actual DAG).

- **B1 — Core trace implementation** (dep: A1): modify
  `packages/core/src/core/vector-candidate-fusion.ts` and
  `packages/core/src/core/semantic-search-service.ts` + tests. **Core trace v2**
  evidence (schema `semantic_search_candidate_trace_v2`) from the existing ordered arms
  and fusion path; product results identical.
- **B2 — MCP pass-evidence collector** (dep: A2): create
  `packages/mcp/src/core/search-pass-evidence.ts` + test. Pure accumulation of pass ID,
  rank, exact RRF contribution with stable candidate identity.
- **B3 — Rerank raw-score retention helper** (dep: A3): helper + tests only; no
  central-file edit. Detached complete evidence + the existing rank map from one
  validated provider response.
- **B4 — Pre-policy evidence assembler** (deps: A2, A4, B2): create
  `packages/mcp/src/core/search-ranking-evidence-assembler.ts` + test. One evidence
  record per post-eligibility candidate, explicit stage ranks + baseline score.
- **B5 — Evidence integration owner** (deps: B1–B4): **exclusively modifies
  `search-execution.ts`** + its focused integration test. Trace/evidence hooks;
  baseline scoring and rerank behavior preserved; **no public feature-vector field**.
  **Acceptance:** reranker-disabled and reranker-enabled product outputs deep-equal the
  pre-task baseline; only internal capture evidence differs.
- **B6 — Capture schema survival v3** (dep: B5): exclusively modifies
  `scripts/satori-search-candidate-capture.mjs` + test. Captures
  `search_candidate_survival_v3` (new; v1/v2 remain supported) and owns **survival-v3
  validation and translation from Core trace v1/v2**; source-free evidence capture,
  stage accounting, product-output digests.
- **B7 — Replay schema v3** (dep: B6): exclusively modifies
  `scripts/satori-search-candidate-replay.mjs` + test. Exact baseline replay from
  **capture survival v3** evidence; rejects unknown feature schema or policy-source
  digests.
- **B8 — Byte-identity gate** (deps: B5–B7): create one exact MCP integration test +
  `docs/evidence/ranking-v3-phase1-20260806/BYTE_IDENTICAL_PROOF.md`.
  **Acceptance:** baseline result envelopes, scores, order, grouping, disclosure,
  warnings, and continuation binding unchanged for all phase-0 captures; evidence
  artifacts differ only by the newly sealed **capture survival v3** fields;
  `pnpm eval:search-quality` fixture unmoved.
- **B9 — Materialize and seal the tuning survival-v3 corpus** (ninth review, B10 — B6/B7
  implement the schema; B9 creates the actual instrumented corpus): rerun **all six
  tuning families** with the instrumented code; produce `search_candidate_survival_v3`
  captures for every tuning task; bind frozen repository/tree/query/task digests;
  record product-output digests; **strictly tuning-only** (enforceable held-out
  restrictions, R0.2 wording); seal **one authoritative corpus manifest**
  (`docs/evidence/ranking-v3-corpus-<date>/CORPUS_MANIFEST.json` + captures). R0.2's
  pre-instrumentation captures remain the byte-identity baseline; **B9 produces the
  actual feature/training corpus that Waves C–E consume**. **When
  `providerDerivedTarget` is non-null (tenth review B4), every provider-derived
  capture additionally seals**: exact `providerKey`, model name + revision,
  `rerankerIdentity`, `rerankerProjectionIdentity`, the admitted-candidate identity
  digest, the complete provider order, raw finite scores, normalized evidence, and the
  response digest + provider request contract — so the provider-derived contender is
  reproducible from the pinned target, never reconstructed after results.

**Wave B gate (instrumentation gate):** full lint + typecheck green; Core/MCP focused
tests green; prior search-quality fixtures green; phase-0 envelopes unchanged; baseline
replay exact; **capture survival v3** bounds + no-source-payload checks green; held-out
opening record absent.

---

### Wave C — Tuning data authority (revision-1 Phase 2, corrected)

- **C1 — Judgment packet generator** (deps: A8, **B9** — ninth review, B10: the
  packets are built from the sealed survival-v3 corpus, not merely the capture schema;
  R0.2 pre-instrumentation captures are the byte-identity baseline, not the training
  corpus): create
  `scripts/build-ranking-judgment-packets.mjs` + test. One source-bound,
  candidate-bounded packet per tuning task; never reads a held-out task.
- **C2.* — Candidate pool materialization per bounded packet** (dep: C1; sixth review,
  item 4 — **per-packet, not per-repository**): approximately **5–8 tasks per packet**;
  multiple packets may exist for one repository; **one isolated agent/worktree per
  packet**. Each packet's output binds repository revision, tree digest, query digest,
  capture digest, candidate IDs, source evidence, and **task IDs**. **No grades
  assigned.**
- **C3.* — Two independent proposal passes per packet** (deps: C2.*; sixth review,
  item 4 — **independence enforced per task/packet**): each task receives **two
  proposals from different agents**; **no agent may produce both proposals for the same
  task**. **Packet-scoped output paths (seventh review, correction C3)** avoid worktree
  collisions between agents:

  ```text
  <repository>/<packet-id>/candidate-pool.json
  <repository>/<packet-id>/proposal-a.json
  <repository>/<packet-id>/proposal-b.json
  ```

  Advisory only; cannot modify manifests.
- **C3A — Repository proposal assembly** (deps: all C3.*; seventh review, correction C3
  — the owner of "repository-level files assembled only after every packet completes"):
  validates and combines the packet outputs before C4 — every expected task appears
  **exactly once per proposal pass**; **both proposals for a task came from different
  agents**; packet repository/capture/tree digests agree; **no extra or duplicate task
  IDs**. Produces the single repository-level proposal input for C4; any validation
  failure blocks C4 with a receipt.
- **C4 — Human/adjudicator resolution** (dep: **C3A** — eighth review, correction 2;
  C3A already depends on all C3.* packet tasks): adjudicated tuning judgment
  files + disagreement receipt. Every grade has source-bound rationale; unresolved
  candidates stay `unjudged`. Adjudication must not begin without C3A's validation
  result.
- **C5 — Tuning manifest v4 builder** (dep: C4): modify the existing manifest
  validator/builder + tests; create `cross-repository-v4-tuning.manifest.json`.
  Tuning-only graded authority + leakage contract; must not rewrite or expose a new
  held-out grading set.
- **C6 — Stage-survival and graded scorer** (deps: A10, C5, B7): extend the existing
  evaluator/score adapters + tests. End-to-end and conditional metrics, stage-localized
  misses, judgment coverage, slices, backward-compatible binary owner results.

**Wave C gate (training gate):** tuning-only manifest sealed; all labels adjudicated or
explicitly unjudged; **held-out restrictions enforced (ninth review, corrections — do
not execute held-out queries, create held-out captures, inspect held-out contender
outputs, or use held-out judgments/outcomes for design, grading, feature selection,
hyperparameter selection, or debugging; sealed manifest digests readable for opening
verification only)**; grading receipts recorded per task suite.

---

### Wave D — Model and evaluation tools (revision-1 Phases 3–6 tooling)

- **D1 — Grouped constant contender (diagnostic comparator only** — second review,
  finding #4; deps: C6, R1.2): create `scripts/tune-ranking-groups.mjs` + test.
  Deterministic **eight-knob** contender (runtime-source group, tests group, docs group,
  generated/fixture group, implementation-intent interaction, test-intent interaction,
  changed-file contribution, owner-evidence contribution) on a sealed finite grid, seeded
  coordinate search; RRF constants, candidate depth, reranker admission fixed; no Bayesian
  library; sealed replay artifact; production untouched. **It is never a deployable V3
  artifact**: if it materially wins the tuning comparison, the outcome is "learned
  ranking not justified" + a **separate deterministic-retuning production plan** — not
  conversion into a learned-policy artifact.
- **D2 — Residual trainer** (deps: A4, **A5** — ninth review, corrections: training
  must use the artifact-parser schema so the trained artifact is serializable from the
  start, C6, R1.2): create
  `scripts/train-ranking-residual.mjs` + test. Deterministic artifact bytes from a train
  fold per the sealed training contract; tests cover pair ordering, pair cap,
  normalization leakage, projected bounds, zeroResidualPreRerankScoreIdentity
  (scorer-level equality with `preRerankBaselineScore` — not product-envelope
  equality, tenth review B1),
  repeatability.
- **D3 — Residual artifact verifier** (deps: A5, D2): create
  `scripts/verify-ranking-policy-artifact.mjs` + test. Independent reproduction of
  training digests, constraint checks, canonical artifact hash.
- **D4 — Counterfactual harness** (deps: A4, R1.3): create
  `scripts/ranking-counterfactuals.mjs` + fixtures + tests. Per pair: baseline score
  shift, V3 residual shift, V3-vs-baseline rank transition, protected-control outcome.
  A synthetic shortcut policy (e.g. positive tests-path coefficient on neutral queries)
  must fail.
- **D5 — Resource contract and benchmark corpus** (deps: A4, A5; fifth review, blocker
  B5 — **preregisters the contract only; it does not measure implementations that do
  not exist yet**): create the resource contract + benchmark corpus — workloads;
  warmup procedure; p95/RSS thresholds; environment controls; measurement method;
  frozen benchmark inputs. No measurement of F1/F3/F4/G1/G2 code here (those do not
  exist until Waves F/G); the actual measurement is **G6A**.
- **D6 — LOFO orchestrator** (deps: **A9, D2, D3** — sixth review, item 3: D1 is a
  diagnostic comparator and must never block the residual LOFO path): create
  `scripts/run-ranking-lofo.mjs` +
  test. One immutable job descriptor per repository-family fold; does not itself train
  in-process. If D1 cannot produce valid evidence, D6 and the fold runs proceed
  unblocked; E3 records `insufficient_evidence` only when the sealed decision contract
  requires the comparator.

---

### Wave E — LOFO fold execution (revision-1 Phase 8)

- **E1.* — Train each fold** (dep: D6): one isolated agent/worktree per fold. Produces
  fold artifact + training receipt + verifier receipt.
- **E2.* — Score each fold** (deps: corresponding E1.*, **D4** — ninth review,
  corrections: counterfactual evidence is scored per fold): one scoring agent per fold.
  End-to-end metrics, conditional graded metrics, slices, counterfactuals, and
  **nonproduction resource evidence only** (artifact size, pure-scorer operation counts
  — sixth review, item 7; the production p95/RSS gate belongs exclusively to G6A/H8)
  for the excluded family only. **Evaluates only the preregistered contender** —
  deterministic residual and/or the `providerDerivedTarget` provider-derived variant
  (tenth review B4); no other provider/model is evaluated.
- **E3 — Out-of-fold adjudicator (the single selection point** — second review, finding
  #4; dep: all E2.* **+ the D1 diagnostic receipt only when R1.3 sealed the comparator
  policy as `required`** — sixth review item 3, seventh review correction C2): tuning
  decision receipt only.
  Selects the **model family,
  hyperparameters, and the artifact execution mode** (`disabled` or `provider_derived`,
  §5.3.16) from out-of-fold results: deterministic residual, residual+provider-reorder,
  or `insufficient_evidence` (grouped tuning is a diagnostic comparator, never a
  selection). **E3 may select the mode but never the provider/model** — the provider
  was pinned in `providerDerivedTarget` before B9/LOFO (tenth review B4). May not
  change training or metric code.
- **E4 — Final tuning refit** (dep: E3 selects a V3 contender): generated artifact +
  receipt only. One refit of the **exact selected residual artifact** on all tuning
  families under the already sealed contract; no additional hyperparameter choice.
  **Serializes only the E3-selected execution mode** (`mode: "disabled"` or
  `mode: "provider_derived"` with its provider constants — fifth review, blocker B1); a
  deterministic-only selection must not silently retain provider-reorder capability.
  This sealed artifact is the single object Wave H qualifies or rejects. **Acceptance
  includes D3's final-verification invocation over the refit artifact** (independent
  digest + constraint reproduction + mode check; third review, correction C1) — H3/H4
  depend on the verified E4 digest.

---

### Wave F — Runtime pure modules (revision-1 Phases 4–5, 7, 10 foundations)

Parallel where dependencies permit; learned-mode activation blocked until E3/E4 +
qualification.

- **F0 — Descriptor-bound trusted-file primitives** (third review, correction C4;
  exclusive owner of `packages/core/src/sync/root-bound-fs.ts` and any exported core
  filesystem primitives it builds on): create/extend the shared descriptor-bound
  primitive set — realpath confinement, `O_NOFOLLOW`, pre/post inode checks, descriptor
  verification, root-bound identity, symlink/non-regular/group-or-world-writable
  rejection, exact byte ceiling, ownership checks where supported, descriptor cleanup on
  every exit path. **Trusted-directory validation (fourth review, correction C4)**: the
  same primitives must validate whole directory hierarchies, not just the final file —
  artifact and registry roots are outside every indexed workspace; the registry root and
  relevant ancestor directories are owned as required and not group/world-writable; no
  path component is a symlink; `versions/`, `receipts/`, the lock, and the `current`
  pointer remain beneath the canonical registry root; and the registry directory itself
  is not replaced between validation and use. **One** implementation: the F1 loader, F2
  registry loader, and F9 registry writer all consume F0's primitives; readers and
  writers share validation logic but are separate consumers (the reader does not
  "support atomic replacement" — that is the writer's job, on top of F0 primitives).
- **F1 — Trusted artifact file loader** (deps: A5, R1.4, **F0**): create
  `packages/mcp/src/core/ranking-policy-store.ts` + test. Bundled-or-explicit-absolute-
  path loading through F0, canonical parse, computed hash; repo-root paths rejected.
- **F2 — Qualification registry loader** (deps: A6, R1.4, **F0**): create
  `packages/mcp/src/core/ranking-policy-qualification-store.ts` + test. Exact
  hash/service-class lookup through F0; **`missing | pending_heldout | revoked |
  incompatible` → baseline selection** (fourth review, correction C1 — only
  `activation_qualified` can ever select learned mode).
- **F3 — Residual scorer** (deps: A4, A5): create
  `packages/mcp/src/core/ranking-policy-v3.ts` + test.
  `preRerankBaselineScore + clippedResidual`; zero-weight artifact reproduces the
  pre-rerank baseline scores exactly (scorer-level, tenth review B1).
- **F4 — Neural evidence normalizer** (dep: A3): create
  `packages/mcp/src/core/neural-ranking-evidence.ts` + test. Provider-keyed within-query
  percentiles and margins; does not call the provider or fit calibration.
- **F5 — Neural confidence gate** (deps: F3, F4, R1.2): create
  `packages/mcp/src/core/neural-ranking-gate.ts` + test. `apply | skip |
  fallback_deterministic`, stable reason codes, complete identity checks, exact-pin
  skip, provider-policy match, admitted-slot permutation only; gate parameters come
  **exclusively from the artifact's preregistered `neuralEvidencePolicy` constants**
  (Design A, §5.3.16 — never tuning-selected); **`mode: "disabled"` artifacts return
  `skip` unconditionally — the provider-derived permutation is non-invokable**
  (fifth review, blocker B1); **provider-bound** (fifth review, blocker B4) — the
  active reranker identity (providerKey + rerankerIdentity + rerankerProjectionIdentity;
  model name and revision are part of the key) must appear in the
  activation-qualified receipt's `qualifiedRerankers`, otherwise `skip`/fallback.
- **F6 — Policy selector** (deps: F1, F2, A7): modify `packages/mcp/src/config.ts`; create
  `packages/mcp/src/core/ranking-policy-selector.ts` + tests. Values `baseline |
  learned_v3` (**no production shadow selector** — second review, finding #12); default
  baseline; explicit opt-in; `learned_v3` is returned **only when the registry entry for
  the exact artifact hash and active service class has `status ===
  activation_qualified`** (fourth review, correction C1 — `pending_heldout` is never
  selectable) **and the entry's `qualifiedRerankers` matches the artifact's execution
  mode (eighth review, blocker 3)** — for `mode: "disabled"`, `qualifiedRerankers`
  must be **empty** and **no active reranker identity is required** (learned_v3 means
  deterministic residual only); for `mode: "provider_derived"`, `qualifiedRerankers`
  must contain **exactly one entry** (V3.0 one-provider-per-cycle restriction, ninth
  review B11) and the active reranker identity must match it exactly;
  otherwise baseline fallback; truthful fallback reason.
  This task alone owns config changes.
- **F7 — Ranked-set policy identity — test-first** (dep: A7; second review, finding
  #10): write the test first — the existing binding already accepts
  `rankingPolicyIdentity` as an opaque non-empty string incorporated into the canonical
  digest, so the composite identity `search_ranking_policy_v3:<sha256>` likely already
  invalidates continuations. **Only if that test exposes an actual gap** may
  `packages/mcp/src/core/search-result-set-identity.ts` be modified (exclusively);
  otherwise F7 is a test/call-site task on an untouched security-sensitive binding.
- **F8 — Evaluation-only shadow sink** (deps: F3, F5): create
  `packages/mcp/src/core/ranking-shadow.ts` + test. Bounded in-memory/event-callback
  records containing hashes, scores, ranks, latency, reason codes only. No source text,
  no full query, no persistent disk writes, no public response field.
- **F9 — Qualification registry writer** (deps: F0, F2, **A11**, R1.4; third review,
  blockers B1/B3/B4; fourth review, blocker B2 — **transition-specific operations, not a
  generic status setter**; fifth review, blocker B2 — **accepts only parsed A11 receipt
  objects**): create
  `packages/mcp/src/core/ranking-policy-qualification-writer.ts` + test (exact
  path/command fixed at dispatch). Implements the append-only transition procedure of
  §5.3.8: acquire the registry-directory lock (mechanism per R1.4); validate the digest
  referenced by `current`; write the new version under its content digest; fsync; write
  + fsync its receipt; atomically replace the `current` pointer; fsync the directory;
  read back through the trusted loader; verify the final digest; release the lock.
  Exposes **only** these operations (any other transition is rejected):

  ```ts
  createPendingHeldoutVersion({ expectedRegistrySha256, artifactSha256, serviceClass,
      offlineQualificationReceipt }): RegistryTransitionResult;
  activatePendingVersion({ expectedRegistrySha256, artifactSha256, serviceClass,
      heldoutAcceptanceReceipt }): RegistryTransitionResult;
  rejectPendingVersion({ expectedRegistrySha256, artifactSha256, serviceClass,
      heldoutRejectionReceipt }): RegistryTransitionResult;
  revokeArtifact({ expectedRegistrySha256, artifactSha256, serviceClass,
      revocationReceipt }): RegistryTransitionResult;
  ```

  **Enforced transitions** (fourth review, blocker B2; tenth review B3 — the held-out
  **rejection** terminates the pending entry instead of leaving it stale): absent/current candidate →
  `pending_heldout` **requires an `offline_qualified` H9 receipt**; `pending_heldout` →
  `activation_qualified` **requires an accepted I3 receipt for the same artifact,
  service class, code seal, and held-out manifest**; `pending_heldout` |
  `activation_qualified` → `revoked` requires the defined revocation authority;
  **absent → `activation_qualified` is forbidden**; **`revoked` →
  `activation_qualified` is forbidden** without a completely new qualification cycle.
  The writer **validates receipt contents and bindings** (artifact, service class,
  receipt type, sealed-code identity), not merely a caller-supplied receipt hash.
  Generates the update receipt (previous-registry-digest + artifact-digest +
  status-specific receipt + service class + new-registry-digest) and writes
  **status-specific receipt fields** into the registry entry
  (`offlineQualificationReceiptSha256`, `heldoutAcceptanceReceiptSha256?`,
  `revocationReceiptSha256?` — the single `qualityReceiptSha256` field is removed).
  **Tests include two concurrent writers starting from the same previous digest with
  exactly one succeeding**, plus one test per forbidden transition (absent→activated,
  revoked→activated, missing/foreign receipt). The writer is
  implemented in Wave F; its exact implementation (with everything it depends on) is
  **sealed by G7 after G6** — I1's opening record includes the G7 seal, and I4 executes
  this same frozen writer. It is production code but is sealed before any held-out
  result is visible (nothing is rewritten after opening).
- **F12 — Bundled-baseline packaging** (tenth review B2 — bundled qualified-artifact
  and bundled-registry delivery are **removed from V3.0**: qualification evidence does
  not exist before H9/H10/I4, so it cannot be packaged pre-G7; qualified artifacts and
  the registry live only at **administrator-controlled external paths**): prepares the
  **bundled baseline B** payload for distribution (exact byte layout, permissions,
  embedded digest), consumed at startup by F1/F2. **Contains no artifact, no
  qualification state, no registry state.** G7's dependency list explicitly includes
  F12.

---

### Wave G — Sequential runtime integration (revision-1 Phases 4–5, 10 runtime)

**Order (tenth review C3 — the actual DAG, not an approximate sequence):**
`G1 → G2 → G3/G4/G5 (where dependencies allow) → G6 → G6A → G6B → G6C → G7`.
G1–G7 execute sequentially within each owning seam; each owns its central seam.

- **G1 — Deterministic V3 integration owner** (deps: B8, F1–F3, F6; **not E4** —
  second review, blocking #2; splits: baseline admission snapshot; residual scoring;
  selection/fallback wiring; parity receipt): **exclusively modifies
  `search-execution.ts`** + focused integration tests. Integrates a **generic residual
  scorer driven by synthetic test artifacts**; candidate union, eligibility, grouping,
  disclosure unchanged; the admission-freeze sequence (§5.1) implemented with its
  zero-failure tests: a candidate crossing the reranker cutoff because of its residual
  (a) does not newly enter the provider request, (b) does not displace a
  baseline-admitted candidate, (c) cannot receive neural evidence, (d) remains eligible
  for deterministic V3 ranking; plus the §5.3.17 exact-control protection tests — an
  extreme synthetic residual cannot demote (a) an exact pinned identifier, (b) an exact
  single hit, or (c) an exact hit satisfying the applicable `must:` rule. **Acceptance:**
  **baseline mode** (default) is
  byte-identical to today — invalid/unqualified artifact falls back to baseline B with
  only the bounded fallback diagnostic allowed by the explicit debug contract (learned
  mode is a different mode, not a baseline re-ranking); `pnpm eval:search-quality` green
  in baseline mode.
- **G2 — Neural slot-reordering integration owner** (deps: G1, F4, F5; splits:
  provider-evidence validation; slot permutation; transactional failure path): same
  central file, only after G1 merges. Transactional complete-evidence neural application
  **per the provider-derived reorder design (§5.3.16), gated on the artifact's
  execution mode** — `mode: "disabled"` never invokes the permutation; only
  `provider_derived` may reorder identities within the baseline-admitted positions
  (positions mapped from the frozen admission set, §5.1), stable-tie-broken by the
  deterministic V3 order; any error discards detached state and keeps
  `rerankAdjusted === false`; the exact-pin gate rule (§5.3.7) preserved.
- **G6A — Sealed implementation resource harness** (deps: F1, F3, F4, G1, G2, D5;
  fifth review, blocker B5): measures the **actual production path** — feature
  extraction, artifact load, deterministic scoring, neural-evidence overhead — using
  the D5 contract and corpus against the real implementations. **G7 seals G6A and its
  results; H8 reruns or verifies this exact harness against the selected E4
  artifact.**
- **G3 — Diagnostics projection** (dep: G2): **exclusively modifies
  `search-types.ts`** + finalization/projection tests. Bounded policy ID/hash, fallback
  reason, neural gate decision; **no feature-vector dump**; normal non-debug projection
  stable unless separately authorized.
- **G4 — Startup integration** (deps: F1, F2, F6, G1; splits per §6: artifact
  construction binding; qualification binding; service-class startup tests): server/
  provider runtime construction sites (exact paths from the R0.1 test-command map, not
  discovery during dispatch) + tests. One immutable loaded policy per runtime/service
  class; no per-query file loading; no repo-controlled override; loaded once at
  startup through the trusted-file reader; **startup rejects learned mode when the
  registry entry is not `activation_qualified` for the artifact/service class, or when
  the entry's `qualifiedRerankers` contradicts the artifact's execution mode** (eighth
  review, blocker 3 — `mode: "disabled"` requires an empty list and no active-reranker
  identity; `mode: "provider_derived"` requires a matching active reranker identity).
- **G5 — Continuation integration** (deps: F7, G2): continuation call sites + tests.
  Stale handle on any policy artifact change; continuation never re-ranks.
- **G6 — Runtime identity and failure matrix** (deps: G1–G5): integration tests +
  evidence receipt. Covers missing/malformed artifact, unqualified/revoked hash,
  provider mismatch, incomplete reranker response, duplicate identity, timeout, exact
  pin, must filter, sole hit, selected-slot permutation, rollback, continuation
  invalidation; **distinct cases for `pending_heldout`, `activation_qualified`, and
  `revoked` registry states, wrong service class, wrong artifact hash, and a registry
  version carrying invalid transition evidence** (fourth review, correction C1).
- **G6B — Offline qualification toolchain** (tenth review C3 — **placed in Wave G**,
  renamed from F10; deps: **G6A** (implements the H8 command path), A11, C6, D3–D5
  outputs, **B9 corpus manifest**, R1.2/R1.3/R1.4 contracts; the owner
  of the Wave H executables that G7 seals): implements the H1–H9 orchestration and
  adjudication scripts (baseline/grouped/residual replays, selected-mode routing,
  slice, counterfactual
  and resource gates, H9 verdict + `OfflineQualificationReceiptV1` generation) with the
  execution-mode union, `qualifiedRerankers`, `groupedComparator`, and the
  `ranking_v3_dispatch_cards_v1`/G7 manifest contracts, plus **provider evaluation
  matrix enforcement (one provider/model per cycle, `providerDerivedTarget`)** and the
  **`SelectedModeReplayReceipt` generator** (tenth review C4 — G6B implements and G7
  seals the generator; **H3/H4 produce the receipt** at replay time). Wave H agents run
  these executables; they never modify code.
- **G6C — Held-out and activation toolchain** (tenth review C3 — **placed in Wave G**,
  renamed from F11; deps: A11, F9, **G6B**, R1.3/R1.4 contracts, B9 corpus manifest;
  the owner
  of the Wave I
  executables): implements the **I0→I4/I3R receipt chain** —
  `I0 OwnerAuthorizationReceipt → I1 HeldoutOpeningRecord → I2
  HeldoutExecutionReceipt (+results digest) → I3 HeldoutAcceptanceReceipt or
  HeldoutRejectionReceipt → I4 RegistryTransitionReceipt` — **each link binds the
  previous receipt
  digest**; plus I1 (opening verification incl. the G7 executable-manifest check and
  the H10 `pending_heldout` version), I2 (single custodial held-out
  execution), I3 (terminal adjudication + `HeldoutAcceptanceReceiptV1` /
  `HeldoutRejectionReceiptV1` / `RevocationAuthorizationReceiptV1` generation), and the
  H10/I4/I3R transition command
  entrypoints (I1's exact-registry freeze checks). Wave I agents run these executables;
  they never modify code. G7 cannot seal
  unnamed or unowned future executables — G6B/G6C give them owners before G7.
- **G7 — Runtime implementation seal** (deps: F0–F9, **F12**, G1–G6, G6A, **G6B, G6C**; fourth
  review, blocker
  B1; fifth review, blocker B3 — **the complete H/I evaluation and adjudication
  executable chain, not only runtime components**; tenth review B2 — F12 explicitly
  closed into the graph): create
  `docs/evidence/ranking-v3-runtime-seal-<date>/IMPLEMENTATION_SEAL.json` containing a
  **canonical executable manifest** covering every program or module run during Wave H
  and Wave I, at minimum: B6 capture-schema implementation; B7 replay implementation;
  C6 metric/scoring implementation; D3 artifact verifier; D4 counterfactual harness;
  D5 resource contract + G6A resource harness; **G6B/G6C toolchains**; H1–H4, H6–H9
  orchestration and adjudication
  scripts (H5 removed, ninth review B7); I1–I3 verifier/execution/adjudication scripts;
  A11 receipt parsers; F9
  writer and all transitive trusted-storage dependencies; plus F0/F1/F2, A5/A6, F3–F6,
  G1–G6. The seal binds: canonical source digests; **built-output digests where built
  JavaScript is executed**; package-lock digest; Node/runtime version; exact commands;
  test digests and results; contract and manifest digests. **A modified evaluator after
  G7 must not be able to change an H9/I3 decision without changing the seal.**
  **H1–H10 (H5 removed) depend on G7; I1 verifies the executable manifest itself, not
  only one aggregate digest.** Nothing in Wave H or Wave I runs on unsealed code.

**Wave G gate (runtime gate):** default baseline; missing/invalid/unqualified/revoked →
baseline; no repo-local artifact; no per-query artifact read; exact and must controls
unchanged; failure fallback detached and byte-identical; neural stage permutes admitted
slots only; policy hash in ranked-set identity; continuation never re-ranks.

---

### Wave H — Offline qualification of the exact E4 artifact, unlimited parallel
(second review, finding #4 — H qualifies or rejects the **one** E4 artifact; it does not
select a contender a second time. **All of H1–H10 depend on G7** — Wave H runs only on
the sealed runtime/evaluation/writer implementation, fourth review blocker B1.)

- **H1 — Baseline replay.** (dep: G7)
- **H2 — Grouped diagnostic replay.** (deps: **G7, D1** — consumes the D1 grouped
  contender's sealed replay artifact; sixth review, item 3; **diagnostic only —
  optional-comparator policy, seventh review correction C2**: H6–H9 do not depend on
  H2; the H9 receipt records `groupedComparator: available | unavailable |
  not_required` per R1.3)
- **H3 — Deterministic residual replay.** (deps: **G7, E4, D3** — third review,
  correction C1; fifth review, blocker B1 — **mode-dependent role**: if the E4 artifact
  is `mode: "disabled"`, H3 is the **qualification replay** (emitting the
  **`SelectedModeReplayReceipt`** consumed by H6–H8); if `provider_derived`, H3 is the **deterministic
  ablation/diagnostic only** (optional evidence, never blocks qualification — eighth
  review, correction 1). H3 replays the **exact E4 artifact**, verified by D3's final
  verification invocation per E4 acceptance)
- **H4 — Residual+neural replay.** (deps: **G7, E4, D3** — same verified-E4-digest
  requirement as H3; fifth review, blocker B1 — **mode-dependent role**: if the E4
  artifact is `mode: "provider_derived"`, H4 is the **qualification replay** (emitting
  the **`SelectedModeReplayReceipt`** consumed by H6–H8); if `disabled`, H4 is
  **ablation/diagnostic only** (optional evidence, never blocks qualification — eighth
  review, correction 1)
  and the provider permutation must be proven non-invokable (F5/G2); provider-derived
  reorder per §5.3.16)
- **H5 — REMOVED from V3.0** (ninth review, B7 — no neural-only diagnostic replay: it
  would add a second policy object, provider constants absent from `disabled`
  artifacts, extra provider/model capture requirements, and another executable and
  receipt to seal, with no deployable decision path. Its function is covered by H4's
  ablation role when `mode: "provider_derived"`).
- **SelectedModeReplayReceipt — generated by G6B's sealed tooling, produced by H3/H4**
  (ninth review B6; tenth review C4 — G6B implements and G7 seals the generator; the
  replay happens at H3/H4): `disabled` → H3's receipt is **normative**; 
  `provider_derived` → H4's receipt is **normative**. Only one normative receipt may
  exist per qualification cycle. The nonselected replay may run
  as an ablation but **never blocks H9**.
  One agent per contender over the same sealed captures and metrics; agents may not
  modify code, labels, thresholds, or artifacts. H3/H4 additionally use the synthetic-
  artifact parity checks from G1/G2; all evaluation runs through **offline/evaluation
  authority only** — no unqualified artifact is loadable by product configuration.
  H6–H9 depend transitively on the verified E4 digest.
- **H6 — Slice gate** (deps: **G7**, H1, **SelectedModeReplayReceipt** — resolved as H3's
  receipt for `mode: "disabled"` or H4's receipt for `mode: "provider_derived"`; H2
  and the nonselected replay are diagnostic and excluded, eighth review correction 1,
  ninth review B6):
  repository-family, language, query class, path
  category, role, negative, exact, must, freshness, missing-evidence slices.
- **H7 — Counterfactual gate** (deps: **G7**, H1, **SelectedModeReplayReceipt**, D4).
- **H8 — Resource gate** (deps: **G7**, H1, **SelectedModeReplayReceipt**, G6A, D5):
  reruns or verifies the
  **G6A sealed implementation resource harness** against the selected E4 artifact under
  the D5 contract (p95/RSS thresholds, warmup, environment controls) — not a placeholder
  measurement.
- **H9 — Terminal qualification verdict** (deps: **G7**, H6–H8; disposition #12;
  fifth review, blocker B1 — qualifies the **selected artifact mode**):
  `offline_qualified | rejected | insufficient_evidence` for the **exact E4 artifact**
  in its E3-selected mode — not another contender selection and not two deployable
  interpretations of one artifact. `offline_qualified` means the artifact passed every
  offline gates (end-to-end, conditional graded, slice, counterfactual, resource) **in
  that mode**, with `qualifiedRerankers` **mode-consistent (eighth review, blocker 3;
  ninth review, B11 — exactly one entry in V3.0)**: 
  empty for `mode: "disabled"` (no provider needs qualification) or the **single**
  qualified provider/model/projection identity for `mode: "provider_derived"`
  (fifth review, blocker B4), and **`groupedComparator: available |
  unavailable | not_required`** recorded per the R1.3 comparator policy (seventh review,
  correction C2); it does **not** make `learned_v3`
  selectable — that requires the registry transition at I4. If the artifact fails any
  conjunctive gate, retain baseline B and stop (held-out stays closed); grouped-tuning
  material victory follows the D1 diagnostic path (§6 D1), never silent deployment.
- **H10 — Create pending-held-out registry version** (deps: **G7**, H9
  (`offline_qualified`), F9 writer; third review, blocker B2 — the concrete
  `pending_heldout` transition that I1 verifies): execute the frozen F9 writer to
  create a **new registry version** with status
  `pending_heldout` for the exact E4 artifact (receipt binds previous-registry
  digest + artifact digest + selected mode + H9 receipt + service class +
  new-registry digest). This is
  the **single normative pre-opening mechanism** — the alternative
  manifest/current-registry routes are removed. H10 runs after H9 and before I1; it
  touches no evaluation data.

**Wave H gate (qualification gate):** end-to-end metrics pass; conditional graded
metrics reported with judgment coverage; no protected slice regression; no new
exact/must/freshness failures; negative exposure within sealed margins; counterfactual
residual gate passes; resource gate passes; the exact E4 artifact is `offline_qualified`,
`rejected`, or `insufficient_evidence` — no second contender selection.

---

### Wave I — Owner-controlled held-out and rollout (revision-1 Phases 9–10)

- **I0 — Owner authorization record** (eighth review, correction 3 — explicit deps
  throughout Wave I): no code task. Without an explicit authorization
  artifact, no held-out command may run.
- **I1 — Opening-record verifier** (deps: **I0, H10, G7**; third review, blocker B2 —
  single normative
  mechanism; fourth review, blocker B1; fifth review, blocker B3 — **verifies the G7
  executable manifest itself, not only one aggregate digest**): verifies that the H10
  **`pending_heldout` registry version** exists for the exact E4 artifact and that
  every pre-opening seal is present and consistent: policy artifact digest (with its
  selected execution mode), **the G7 executable manifest** (covering the F9 writer and
  the complete H/I evaluation/adjudication chain), code digests, preregistered
  thresholds, and the held-out manifest digest. It does **not** claim the final
  post-acceptance entry was sealed in advance.
- **I2 — Single held-out execution** (dep: **I1**): one custodial agent, no code-edit
  permission,
  existing sealed labels only (tuning-only grading means the held-out authority is the
  preserved binary owner/hard-negative set).
- **I3 — Terminal adjudication** (dep: **I2**): accept or reject; preregistered
  thresholds; no tuning
  or "small fix" after a failure; held-out use closes (it does not become "unseen
  again"); a failure retains baseline B.
- **I3R — Held-out rejection transition** (deps: **I3 (rejected), I1, H10, F9, G7**;
  tenth review B3 — rejection must terminate the pending entry, which otherwise blocks
  every later qualification cycle for the same scope): execute the frozen F9 writer's
  `rejectPendingVersion` with `expectedRegistrySha256 ===` the exact H10 digest
  verified by I1 and the parsed `HeldoutRejectionReceiptV1`; the registry version
  transitions `pending_heldout` → `revoked`; baseline is retained; the scope is free
  for a new qualification cycle. (Rejection is a distinct semantic from administrative
  revocation — the receipt type differs.)
- **I4 — Activation-qualified registry transition** (deps: **I3, I1, H10, F9, G7**;
  third review,
  blocker B1 — I4 executes the **pre-existing, frozen F9 writer**, it does not create
  it; fifth review, correction C2 — **registry freeze between I1 and I4**): execute the
  writer with `expectedRegistrySha256 ===` the **exact H10 registry digest verified by
  I1**; any intervening registry transition **aborts activation** — retain baseline, no
  post-opening repair or reconstructed pending version (emergency revocation may still
  terminate that activation attempt). The writer transitions the H10 `pending_heldout`
  version to a **new immutable registry version** with status `activation_qualified`,
  binding previous-registry-digest + artifact-digest + held-out acceptance receipt +
  `qualifiedRerankers` + service class + new-registry-digest. **This is the first point
  at which the product selector may return `learned_v3`** (second review, blocking #2;
  disposition #12).
- **I5 — Rollback drill** (dep: **I4**): activate V3, create continuation, switch to
  baseline/revoke
  artifact, prove new searches use baseline and the old continuation is stale, no
  reindex/rebuild.
- **I6 — Limited activation receipt** (dep: **I5**): all previous gates pass; default
  remains baseline
  until the separately authorized production-policy decision changes it.
  **Post-opening configuration selection (ninth review, corrections)**: after held-out
  opening, configuration may select only **baseline or already-sealed,
  activation-qualified artifact hashes** (preregistered); every selection change is
  recorded in an **append-only rollout receipt**.

---

## 7. Non-goals / do-not list (binding; merges revision-1 §7 with the review)

1. No environment-variable "learning" — the only runtime inputs are generated,
   receipt-bound artifacts.
2. No `docs_v2`, `TradingEntryVetoes`, or any client/repo-specific path in production
   logic; **no repository-local policy artifact** (`.satori/ranking-policy.json`
   rejected).
3. No must-lane weight inflation to hide a recall problem — stage-survival reporting
   surfaces recall failures; they are never tuned around.
4. No neural reranker bypass of eligibility, freshness, exact controls, or failure
   fallback; **neural stage permutes admitted reranker slots only**.
5. No training on held-out queries; **no new held-out grading**; no opening held-out
   without Wave I authorization; no "resealing" claims after opening.
6. No macro-MRR-only optimization — slice gates (H6) are mandatory.
7. No implicit-click learning without position-bias correction; **no online learning in
   the first release**.
8. No automatic coefficient updates in production — artifacts are static, versioned,
   swapped explicitly.
9. No mixing Voyage/LateOn/Jina/ZeroEntropy calibrations — and in V3.0, **no
   cross-query probability calibration claim at all** (within-query percentiles only).
10. No new reranker used to compensate for missing retrieval candidates.
11. No LambdaMART/tree-based ranker as the starting point (linear residual first).
12. **W-fix integration and Waves A–B instrumentation must not change reranker-disabled
    behavior or ranking for queries without `must:`.** An explicitly selected and
    **qualified** learned_v3 policy **may** change their ranking — while eligibility,
    exact controls, freshness, scope, grouping, disclosure, and failure fallback remain
    unchanged (second review, blocking #5; G1's acceptance is that **baseline mode**
    stays unchanged, not that learned mode reproduces baseline).
13. No re-litigating closed evidence: R2/LANCEDB Phase 2 conclusions stand; the grouped
    contender is a baseline, not a rebuttal.
14. No nDCG-vs-MRR conflation across benchmark populations.
15. **No V3.0 change to retrieval fusion, candidate depth, or reranker admission** —
    those are a separate V3.1 recall-policy project.
16. **No identity-hash scoring features** — repository, task, user, candidate,
    owner-family, and provider identities are gating keys only.
17. **No feature-vector dump in public responses**; no `shadowApplied` public field
    during the byte-identity phase; no persistent production shadow log.
18. **No duplicate evidence or metric authorities** — capture survival v3
    (`search_candidate_survival_v3`) and the existing
    search-quality evaluator are the single authorities.
19. **No quality receipt inside the model artifact** — qualification lives in the
    registry.
20. **No parallel edits to `search-execution.ts`** — B5 and G1/G2 only, sequential.
21. **No Bayesian search over the constant inventory** — D1 is a sealed finite-grid
    eight-knob coordinate search.
22. **No production shadow selector** — production config is `baseline | learned_v3`;
    shadow is offline replay + optional injected in-memory test sink only (second
    review, finding #12).
23. **No unqualified artifact is loadable by product configuration** — a test-only
    constructor or direct pure-scorer invocation may accept an unqualified fixture;
    production configuration must never have such a bypass (second review, blocking #2).
24. **No group-tuning deployment through the learned-policy runtime** — D1 is a
    diagnostic comparator; a material grouped win opens a separate deterministic-retuning
    production plan, never a V3 artifact (second review, finding #4).
25. **No neural-gate skip on `must:` satisfaction alone** — the exact-pin rule
    (`top.exactLexicalMatch && (exactMatchPinningEnabled || (must && top.passesMatchedMust) || sole)`)
    is the only skip authority (second review, finding #11).
26. **No locally trained neural permutation policy in V3.0** — the neural contribution
    is the provider-derived reorder (Design A, §5.3.16); every gate parameter is a
    preregistered constant sealed in R1.2, never trained and never tuning-selected.
    Design B is a V3.1+ project with its own training/selection/refit contract.

## 8. Risks and open questions

1. **Held-out is closed** — Wave I depends on fresh owner authorization; until then V3
   cannot reach production default status. Mitigation: everything through Wave H is
   tuning-data-only.
2. **D32-v2 offline default coexistence** — the learned online policy and the D32
   offline default are different service classes; R1.4 must define per-class selection
   (`serviceClass: "online" | "offline_linux_x64"`). No existing doc addresses
   multi-policy coexistence.
3. **Execution base requires the hardening merge AND its behavioral proof** — locked
   conclusion #11 + third-review correction C2: R0.1 verifies the merge is an ancestor
   of HEAD **and** that the hardening acceptance receipt is green (indexing `/` and
   secret roots rejected, manifest-bound `read_file`, symlink/special-file fail-closed,
   byte ceilings, shared-runtime auth per threat model, bounded provider requests).
   As of 2026-08-06 the branch is **not merged** (merge-base `94a3dc6`, no merge in
   HEAD history); Gate 0 stays blocked until the owner merges it and the receipt
   passes. V3 does not baseline on unhardened master.
4. **Admission parity risk** — residual scoring must not change which candidates enter
   the reranker; G1/G2 carry the four zero-failure admission tests (§5.1) and the
   baseline-admission snapshot.
5. **Fixture authority is RED at base** — `pnpm eval:search-quality` fails at the
   `source_state_unverified` gate (three stale seams since `a25f9cb`); a dedicated
   reviewed fixture-modernization task is a prerequisite for R0.2; never weaken the
   fixture or assertions to pass.
6. **Qualification deadlock (resolved in design)** — G1/G2 no longer depend on E4;
   Wave H is offline-only; I4 is the first `learned_v3` activation point. Risk remains
   that a bypass sneaks in — covered by do-not-list #23 and the runtime gate.
7. **Byte-identity risk** — Wave B instrumentation must not perturb ranking; B8 is the
   gate; trace evidence attaches post-dedup only; no public feature fields.
8. **Intent "probabilities"** — V3.0 maps the existing 3-level confidence + hard
   booleans to bounded numeric features and records the mapping in R1.1; real
   probabilistic classifiers are out of scope.
9. **Calibration/data comparability** — Voyage and LateOn raw score distributions are
   uncharacterized; F4/G6A begin by measuring within-query distributions on graded tuning (D5 is contract-only)
   pairs before any neural-evidence use.
10. **LOFO data size** — 6 tuning families is a small population for family-level
    cross-validation; R1.3 must preregister the aggregation rule (repository-macro
    deltas) and the `insufficient_evidence` threshold before Wave E.
11. **Grading effort** — human-adjudicated grades over 6 repositories are the critical
    path; C1 packet bounds and the two-proposal protocol exist to keep it reviewable.
12. **Policy artifact trust chain** — artifact validation is schema + range +
    applicability + SHA-256s of training manifest/code/contract; the training pipeline
    must be reproducible (seeded, pinned script revisions — R3 digest-pinning pattern);
    D3 independently verifies; the trusted-file reader hardens loading.
13. **W-fix receipt currency** — Gate 0 confirms the W-fix baseline receipt is current at
    the execution base before captures are frozen.
14. **Audit-confirmed security prerequisites** (piolium audit verdict, 2026-08-06) —
    M2-A (arbitrary-root file authorization: an MCP client can turn any directory into a
    read-authorization domain by indexing it) and A1 (`read_file` reads whole files
    synchronously before range selection, no pre-read byte ceiling) are pre-existing
    findings that intersect V3's trust boundary (D32 offline default) and its resource
    gates. They are **separate owner-authorized security tasks, not V3 scope**; the
    hardening integration merge (locked conclusion #11) is expected to carry their
    remediation, and **Gate 0's behavioral acceptance receipt (R0.1 step 2) proves it —
    ancestry alone is insufficient**. V3's trusted-file primitives (§6 F0/F1/F2) reuse
    `root-bound-fs.ts` rather than adding a fourth boundary implementation.

## 9. Terminal outcomes

Valid stopping points; all retain baseline B:

1. **Instrumentation rejected** — byte identity or evidence authority fails (Wave B gate).
2. **Training insufficient** — labels, fold coverage, or deterministic reproduction
   inadequate (Wave C/D gate).
3. **Tuning insufficient** — the exact E4 artifact fails a preregistered gate (Wave H);
   held-out stays closed. **Grouped tuning materially winning is a variant of this
   outcome**: "learned ranking not justified" → a separate deterministic-retuning
   production plan, never a learned-policy deployment (D1 diagnostic path).
4. **Held-out rejected** — the one selected artifact fails (Wave I); no post-opening
   changes.

Only a held-out-accepted, resource-qualified, registry-bound artifact may proceed to
controlled activation; `learned_v3` becomes selectable no earlier than I4.

## 10. Evidence index (verified 2026-08-06 at `9c85b22`)

> **Anchor note (seventh review, correction C1):** line numbers below are **snapshots**
> of the stated base; symbol names and commit-bound links are primary. The
> **authoritative anchor manifest is `SOURCE_ANCHORS.json`**, generated by R0.1 against
> the frozen post-hardening HEAD; regenerate the anchors there, never by editing this
> table in place.

| Claim | Where verified |
|---|---|
| Final-score formula | `packages/mcp/src/core/search-ranking-policy.ts:392` |
| Rerank blend (rank-only, inside fusionScore) | `search-execution.ts:649-650` |
| Raw score discard | `search-execution.ts:566` (`rerankResults: Array<{index}>`); both providers deliver scores (`voyageai-reranker.ts:254-262`, `lateon-reranker.ts:778`, `lateon-reranker-worker.ts:88-105,231-254`) |
| RRF constants 100/60/10 + weight 1.0 | `vector-candidate-fusion.ts:12`; `search-constants.ts:1,21-22` |
| Candidate depth clamp | `search-policy.ts:11-12,67` (`SEARCH_MIN_CANDIDATES=32`, `SEARCH_CANDIDATE_MULTIPLIER=8`) |
| Intent hard booleans + 3-level confidence | `search-query-planning.ts:540-660` |
| Lexical weights per intent | `search-query-planning.ts:648-656` |
| Exact-pin rerank skip | `shouldSkipRerankForExactPin`, `search-execution.ts:288-318` |
| `family_ambiguity` budget reason | `search-rerank-policy.ts:12,119-132` |
| Entrypoint owner evidence scope | `entrypoint-owner-evidence.ts:11-14` (pyproject `[project.scripts]`, roots `""`/`src`) |
| Binding + continuation revalidation | `search-result-set-identity.ts:37-56`; `handlers.ts:5250-5285` → `SEARCH_RESULT_SET_STALE` |
| No calibration; no nDCG; no stage survival | `rg -i calibrat packages/` (3 unrelated hits); `rg ndcg scripts/ evals/` (0) |
| Manifests + splits | `cross-repository-v2.manifest.json` (3+3), `cross-repository-v3.manifest.json` (**6 tuning + 6 held_out = 12 repos**) |
| Eval pipeline + binary scoring | `scripts/satori-search-candidate-{capture,replay,score}.mjs`; `satori-ranking-{r2,r3,r3-score}.mjs`; track-o scripts; package.json `eval:*` commands |
| W-fix landed | bounded `must_lane` + `attempt:N/must_lane` (`search-execution.ts:1294-1312`), reranker retry/timeout telemetry; `docs/evidence/search-integrity-baseline-20260805/BASELINE.md` |
| Deep-plan invariants | `SATORI_DEEP_LATEON_RERANKING_AND_PAGINATED_DISCLOSURE_PLAN.md:141-200` |
| R5 sealed-contender + frozen decision contract | `SATORI_CROSS_REPOSITORY_RANKING_ABLATION_PLAN.md:262-362,610-637` |
| No `rankingPolicy` config today | `rg rankingPolicy packages/mcp/src` (binding field only) |
| Reviewed small-agent design | `docs/superpowers/plans/2026-08-05-satori-ranking-v3-reviewed-small-agent-design.md` — **deleted 2026-08-06** (superseded then removed; no dispatch authority) |

---

*End of plan revision 12 (2026-08-06: tenth-review dispositions §3.10 —
preRerankBaselineScore / baselineModeFinalScore naming with zeroResidualPreRerankScoreIdentity,
F12 redefined as bundled-baseline-only packaging, HeldoutRejectionReceiptV1 +
rejectPendingVersion + I3R rejection branch, providerDerivedTarget sealed before B9 with
complete neural-evidence capture, mode-dependent applicability, G6B/G6C formally placed in
Wave G with the closed G1→G2→G3/G4/G5→G6→G6A→G6B→G6C→G7 order and exact producing-task
dependencies, corrected SelectedModeReplayReceipt producers, global card-type contract,
manifest example + dispatch-authority wording, execution-shape DAG summaries, and stale
identity/risk/§10 cleanup). Gates and waves are
independently shippable and gated;
nothing in this document authorizes implementation or the opening of held-out evidence.
Gate 0 requires the security-hardening integration merge with a green behavioral
acceptance receipt bound to the frozen HEAD (locked conclusion #11 + §6 Gate 0) and
the R0.1A pre-freeze fixture repair; Waves F–I require the G7 seal before Wave H; each
gate/wave requires its own authorization before execution.*
