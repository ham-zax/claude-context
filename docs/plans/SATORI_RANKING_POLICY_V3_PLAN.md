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
unhardened master.** Every revision-1 code claim was re-verified against HEAD — see §10
evidence index.
**Primary owner:** `packages/mcp` (search execution + ranking policy) with `packages/core`
(fusion, trace, reranker contract) and `evals/` (metric + judgment authority).
**Public projection owner:** `packages/mcp`.

**Related documents (coordinate, do not duplicate):**
- `docs/superpowers/plans/2026-08-05-satori-ranking-v3-reviewed-small-agent-design.md` —
  full task cards, dependency graph, dispatch schedule (the operational companion to this plan).
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
- **No post-opening changes**: nothing may be tuned, deleted, or rewritten after held-out
  opens.
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
baseline score** (§5.1), so a zero-weight artifact is a true identity policy.

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
- Call site discards it: `search-execution.ts:586` — `let rerankResults: Array<{ index: number }> = []`.
  Only `index` survives as `rerankRanks`.
- No calibration exists anywhere.

### 2.4 The constants inventory (relevance opinions — V3 targets, grouped)

| Group | Values | Location |
|---|---|---|
| Path-category multipliers | 39 values (13 categories × 3 scopes): runtime core 1.35, tests 0.90, generated 0.30, fixture 0.35, docs 0.45, entrypoint 1.20, … | `search-constants.ts` `SCOPE_PATH_MULTIPLIERS` (~:49-88) |
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
| Staleness buckets | fresh 30 min / aging 24 h | `search-constants.ts:36-38` |
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
| Dense/lexical per-arm rank+score at scoring time | ✗ discarded in both fusions (only summed RRF + max survive) | retained as explicit stage ranks via the existing **candidate-survival trace v3** (Wave A/B), not a parallel arm-evidence system |
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

Every revision-1 claim was re-verified at `9c85b22` on 2026-08-06 (§10). The review added
these binding corrections:

| Revision-1 claim/design | Review correction |
|---|---|
| "Identity learned policy reproduces baseline" | **Mathematically invalid as stated**: baseline B is multiplicative; a linear model over raw inputs cannot generally reproduce it. V3.0 learns a **residual** on the exact baseline score — zero residual is the real identity policy. |
| New per-arm evidence output (`retainArmEvidence`) | **Duplicate authority**: the existing candidate-survival trace already records raw dense/lexical/fallback/core-fusion/MCP/removal stages. Extend the trace to v3; derive runtime evidence from the same authority. |
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
   freshness, readiness/pagination honesty). Constraints remain: no ranking change for
   queries without `must:`, no change to the reranker-disabled path, fail-closed
   fingerprint gate, `rerankAdjusted === false` on failure. Gate 0 confirms the W-fix
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
→ current baseline-B score
→ bounded constrained linear residual
→ optional bounded neural reordering inside the already admitted reranker slots
→ existing grouping, disclosure, and frozen pagination
```

```text
deterministicV3Score = baselineBScore
    + clamp(dot(weights, normalizedFeatures), -maxResidual, +maxResidual)
```

**Reranker admission is frozen at baseline-B order** (second review, blocking #1: the
runtime calls `selectRerankCandidates({ candidates: scored, ... })`, so changing
`finalScore` before that call would silently change admission — an admission-policy
change disguised as ranking). The runtime sequence is binding:

```text
eligible candidates
→ compute and sort baseline-B order
→ freeze baselineAdmissionSet with the existing selectRerankCandidates
→ compute the deterministic residual and the V3 order
→ call the reranker only for baselineAdmissionSet
→ locate each admitted ID's position in the deterministic V3 order
→ neural stage permutes identities only within those positions
```

G1/G2 carry zero-failure tests proving that a candidate crossing the reranker cutoff
because of its residual: (a) does not newly enter the provider request; (b) does not
displace a baseline-admitted candidate; (c) cannot receive neural evidence; (d) remains
fully eligible for deterministic V3 ranking. Without these, "reranker admission frozen"
is false.

**Two distinct identity proofs (disposition #10):** **zero-weight identity** — a
zero-residual artifact reproduces baseline-B scores exactly (proven in D2/F3) — and
**frozen-admission identity** — the `baselineAdmissionSet` is byte-identical before and
after residual scoring (proven by the G1 baseline admission snapshot, the B8 byte-identity
gate, and the G1/G2 admission tests). Both are required; neither subsumes the other.

- A zero-weight artifact reproduces baseline B exactly (real identity policy).
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
fallback when the reranker fails; pagination and disclosure limits; **V3.0 additionally freezes: retrieval-arm fusion (RRF 100/60/10 + weight 1.0), candidate depth
(`clamp(max(limit×8,32),80)`), reranker admission (TOP_K 50, min-12, per-result
caps, supplemental caps), and the admission set itself** — which candidates enter the
provider request is decided once, on the baseline-B order, before any residual is
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
   `search_ranking_evidence_v1`): `candidateId`, `baselineScore`, retrieval (explicit
   stage ranks + per-pass RRF contributions), candidate, query groups — available after
   eligibility and **before** deterministic scoring; the residual feature vector is built
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
3. **One evidence authority**: extend the existing candidate-survival trace to version 3
   (raw arm rank/score, core fusion rank). The runtime evidence object is derived from
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
   `neuralEvidencePolicy` (and `acceptedProviderKeys ⊆ supportedProviderKeys`, §5.3.16);
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
   supportedProviderKeys: readonly string[] }`. Runtime **rejects a correctly hashed
   artifact** whose feature ordering, baseline formula, retrieval contract, or neural
   projection is incompatible. `RankingPolicyQualificationRegistry` binds exact
   artifactSha256 → **status-specific receipt fields**
   (`offlineQualificationReceiptSha256`, `heldoutAcceptanceReceiptSha256?`,
   `revocationReceiptSha256?` — the single `qualityReceiptSha256` is removed, fourth
   review, blocker B2) + serviceClass (`online` |
   `offline_linux_x64`) + **status from the canonical `RegistryArtifactStatus =
   "pending_heldout" | "activation_qualified" | "revoked"`** — distinct from the
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
9. **Storage (replaces revision-1 M0 options):** bundled baseline B + bundled qualified
   V3 artifact when one exists + optional administrator-controlled **absolute path**
   override outside any indexed repository. **Repository-local `.satori/ranking-policy.json`
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
    excluded from graded pair generation and **never silently become grade 0**. Two
    independent proposal agents per repository + one human/adjudicator resolution.
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
    `(topScore - secondScore) / max(ε, topScore - bottomScore)` (or a percentile/rank-gap
    rule — chosen and sealed in R1.2; never a raw cross-provider or cross-query
    difference), and `acceptedProviderKeys ⊆ supportedProviderKeys` is enforced by the
    artifact parser (violation = rejection). Parameters are sealed in R1.2, never
    trained and never selected from tuning results.
    D2/E4 train only the deterministic residual; the artifact's `neuralEvidencePolicy`
    section serializes the preregistered constants, and E4's refit reproduces the full
    residual-plus-neural artifact (residual weights + fixed neural policy). **Design B**
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

**Included:** trace v3; raw reranker score retention; explicit pre-policy ranking
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
| `evals/search-quality/search-quality-evaluation.ts` | A10/C6 metric extensions only |

Every task: one isolated worktree; one semantic commit; one independent review before
merge; failing focused test first; exact `node --import tsx --test <file>` commands;
edits only to listed files (otherwise stop and report the dependency).

**Pre-dispatch card contract** (second review, small-agent executability — every
dispatch card must carry, before any agent runs): exact files **and allowed line
regions**; exact consumed/produced signatures; one failing test; the exact command that
proves the failure; minimal implementation steps; the exact command that proves
passing; acceptance output; commit message; do-not-touch list. "Construction sites
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

**Execution order** (second review — the sequence after authorization):

```text
1. Merge security hardening.
2. Freeze the real integration HEAD.
3. Seal contracts (Gate 1).
4. Implement pure schemas and validators (Wave A).
5. Instrument with byte-identity proof (Wave B).
6. Build tuning-only human judgment authority (Wave C).
7. Run LOFO and select exactly one contender (Waves D–E).
8. Integrate the generic runtime engine without activating the contender (Waves F–G).
9. Qualify the one selected artifact offline (Wave H).
10. Open held-out only under fresh owner authorization (Wave I).
```

---

### Gate 0 — Freeze current behavior (revision-1 Phase 0, rebased)

#### R0.1 — Integration-base receipt

**Files:** create `docs/evidence/ranking-v3-rebase-<date>/BASELINE.md` only.

**Interfaces:** consumes the **post-hardening integration HEAD** (W-fix merged +
`integrate/security-hardening-20260805` merged — a Gate-0 prerequisite, locked
conclusion #11), the **security-hardening acceptance receipt** (third review, correction
C2 — behavioral proof, not ancestry alone), revision-1 claim list (§10), W-fix receipt
(`docs/evidence/search-integrity-baseline-20260805/BASELINE.md`).

**Steps:**
1. Verify the prerequisite base: hardening integration **is** an ancestor of HEAD
   (merge-base = the integration commit; `git log --oneline --all --grep=security-hardening`
   present in HEAD's history). If not merged, **Gate 0 is blocked** — record the blocker;
   do not baseline on unhardened master.
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

**Acceptance:** no product files change; every claim dispositioned against the
post-hardening HEAD; test-command map verified; hardening ancestry proven by merge-base;
**hardening acceptance receipt green (behavioral tests) recorded in the receipt**.

#### R0.1A — Search-quality fixture modernization (disposition #11; R0.2 prerequisite)

**Goal:** make `pnpm eval:search-quality` green at the frozen base. The fixture is RED
(three stale seams since its creation commit `a25f9cb`, 2026-07-15), so R0.2's baseline
capture is blocked until this task lands. This is a **reviewed, dedicated task** — an
executing agent must have authorized scope for the repair.

**Files:**
- Modify: `evals/search-quality/search-quality-evaluation.ts` (and
  `evals/search-quality/fixtures/search-quality/v1/` only if the manifest itself is
  stale — prefer code-side repair).
- Create: focused tests under `evals/search-quality/` for each repaired seam.
- Create: `docs/evidence/ranking-v3-fixture-repair-<date>/FIXTURE_REPAIR_RECEIPT.md`.

**Known seams (verified 2026-08-06 at `9c85b22`):**
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
expected owner-rank results; fixture manifest hash unchanged; receipt on file; no
production code changed.

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
(fourth review, correction C5)**: `acceptedProviderKeys = keys(neuralEvidencePolicy.providers)`
— one authority, the separate array is removed (the subset rule alone permitted
drift); E4 reproduces the full residual-plus-neural artifact (residual weights + fixed
neural policy).

#### R1.3 — Metric and decision contract

**Files:** create `docs/evidence/ranking-v3-contract-20260806/DECISION_CONTRACT.md`.

**Locks:** existing owner/MRR/non-inferiority/resource gates; stage-survival reporting
(four stage observations); graded metrics (judged-pool nDCG@10 with coverage,
conditional graded pair accuracy); end-to-end miss accounting; slice set; counterfactual
residual bounds; contender comparison set (baseline B, grouped tuned baseline,
deterministic residual V3, residual+neural V3, neural-only diagnostic) — baseline B
listed exactly once; terminal `insufficient_evidence` behavior.

#### R1.4 — Artifact and activation decision

**Files:** create `docs/evidence/ranking-v3-contract-20260806/ARTIFACT_ACTIVATION_DECISION.md`.

**Locks:** storage (bundled baseline + bundled qualified artifact + administrator
absolute-path override; repo-local rejected); canonical JSON + computed SHA-256;
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
seal digest is included in the I1 opening record** (fourth review, blocker B1); baseline
fallback; composite
policy identity `search_ranking_policy_v3:<artifact-sha256>`; rollback = new transition,
never mutation; startup validation (exact schema, coefficient ranges,
unknown-field rejection, fallback diagnostic).

#### R1.5 — Contract seal

**Files:** create `docs/evidence/ranking-v3-contract-20260806/CONTRACT_SEAL.json`.

**Produces:** SHA-256s of R1.1–R1.4 and the source commit.

**Acceptance:** no later task may change those contracts without restarting tuning
evidence (L5/R5 rule).

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

**Wave A gate:** all pure modules green on exact-file test commands; no central-file
edits.

---

### Wave B — Instrumentation modules (revision-1 Phase 1 implementation)

Parallel B1–B4, then the single evidence-integration owner B5, then B6/B7 sequential,
then B8.

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

**Wave B gate (instrumentation gate):** full lint + typecheck green; Core/MCP focused
tests green; prior search-quality fixtures green; phase-0 envelopes unchanged; baseline
replay exact; **capture survival v3** bounds + no-source-payload checks green; held-out
opening record absent.

---

### Wave C — Tuning data authority (revision-1 Phase 2, corrected)

- **C1 — Judgment packet generator** (deps: A8, B6): create
  `scripts/build-ranking-judgment-packets.mjs` + test. One source-bound,
  candidate-bounded packet per tuning task; never reads a held-out task.
- **C2.* — Candidate pool materialization per tuning repository** (dep: C1): generated
  evidence directory per tuning repository; one agent per repository. Each pool binds
  repository revision, tree digest, query digest, capture digest, candidate IDs, source
  evidence. **No grades assigned.**
- **C3.* — Independent grade proposals** (deps: C2.*): two proposal files per tuning
  repository, produced by **different agents**. Advisory only; cannot modify manifests.
- **C4 — Human/adjudicator resolution** (dep: all C3.*): adjudicated tuning judgment
  files + disagreement receipt. Every grade has source-bound rationale; unresolved
  candidates stay `unjudged`.
- **C5 — Tuning manifest v4 builder** (dep: C4): modify the existing manifest
  validator/builder + tests; create `cross-repository-v4-tuning.manifest.json`.
  Tuning-only graded authority + leakage contract; must not rewrite or expose a new
  held-out grading set.
- **C6 — Stage-survival and graded scorer** (deps: A10, C5, B7): extend the existing
  evaluator/score adapters + tests. End-to-end and conditional metrics, stage-localized
  misses, judgment coverage, slices, backward-compatible binary owner results.

**Wave C gate (training gate):** tuning-only manifest sealed; all labels adjudicated or
explicitly unjudged; no held-out inputs read; grading receipts recorded per task suite.

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
- **D2 — Residual trainer** (deps: A4, C6, R1.2): create
  `scripts/train-ranking-residual.mjs` + test. Deterministic artifact bytes from a train
  fold per the sealed training contract; tests cover pair ordering, pair cap,
  normalization leakage, projected bounds, zero-weight identity (byte-equal baseline),
  repeatability.
- **D3 — Residual artifact verifier** (deps: A5, D2): create
  `scripts/verify-ranking-policy-artifact.mjs` + test. Independent reproduction of
  training digests, constraint checks, canonical artifact hash.
- **D4 — Counterfactual harness** (deps: A4, R1.3): create
  `scripts/ranking-counterfactuals.mjs` + fixtures + tests. Per pair: baseline score
  shift, V3 residual shift, V3-vs-baseline rank transition, protected-control outcome.
  A synthetic shortcut policy (e.g. positive tests-path coefficient on neutral queries)
  must fail.
- **D5 — Resource harness** (deps: A4, A5): create/extend the useful-context performance
  evaluator + tests. Feature extraction, artifact load, deterministic scoring, neural
  evidence overhead under the frozen p95/RSS contract.
- **D6 — LOFO orchestrator** (deps: A9, D1–D3): create `scripts/run-ranking-lofo.mjs` +
  test. One immutable job descriptor per repository-family fold; does not itself train
  in-process.

---

### Wave E — LOFO fold execution (revision-1 Phase 8)

- **E1.* — Train each fold** (dep: D6): one isolated agent/worktree per fold. Produces
  fold artifact + training receipt + verifier receipt.
- **E2.* — Score each fold** (dep: corresponding E1.*): one scoring agent per fold.
  End-to-end metrics, conditional graded metrics, slices, counterfactuals, resources for
  the excluded family only.
- **E3 — Out-of-fold adjudicator (the single selection point** — second review, finding
  #4; dep: all E2.*): tuning decision receipt only. Selects the **model family and
  hyperparameters** from out-of-fold results: deterministic residual, residual+neural, or
  `insufficient_evidence` (grouped tuning is a diagnostic comparator, never a selection).
  May not change training or metric code.
- **E4 — Final tuning refit** (dep: E3 selects a V3 contender): generated artifact +
  receipt only. One refit of the **exact selected residual artifact** on all tuning
  families under the already sealed contract; no additional hyperparameter choice. This
  sealed artifact is the single object Wave H qualifies or rejects. **Acceptance
  includes D3's final-verification invocation over the refit artifact** (independent
  digest + constraint reproduction; third review, correction C1) — H3/H4 depend on the
  verified E4 digest.

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
  `baselineScore + clippedResidual`; zero-weight artifact bit-identical to baseline.
- **F4 — Neural evidence normalizer** (dep: A3): create
  `packages/mcp/src/core/neural-ranking-evidence.ts` + test. Provider-keyed within-query
  percentiles and margins; does not call the provider or fit calibration.
- **F5 — Neural confidence gate** (deps: F3, F4, R1.2): create
  `packages/mcp/src/core/neural-ranking-gate.ts` + test. `apply | skip |
  fallback_deterministic`, stable reason codes, complete identity checks, exact-pin
  skip, provider-policy match, admitted-slot permutation only; gate parameters come
  **exclusively from the artifact's preregistered `neuralEvidencePolicy` constants**
  (Design A, §5.3.16 — never tuning-selected).
- **F6 — Policy selector** (deps: F1, F2, A7): modify `packages/mcp/src/config.ts`; create
  `packages/mcp/src/core/ranking-policy-selector.ts` + tests. Values `baseline |
  learned_v3` (**no production shadow selector** — second review, finding #12); default
  baseline; explicit opt-in; `learned_v3` is returned **only when the registry entry for
  the exact artifact hash and active service class has `status ===
  activation_qualified`** (fourth review, correction C1 — `pending_heldout` is never
  selectable); truthful fallback reason. This task alone owns config changes.
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
- **F9 — Qualification registry writer** (deps: F0, F2, R1.4; third review, blockers
  B1/B3/B4; fourth review, blocker B2 — **transition-specific operations, not a generic
  status setter**): create
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
  revokeArtifact({ expectedRegistrySha256, artifactSha256, serviceClass,
      revocationReceipt }): RegistryTransitionResult;
  ```

  **Enforced transitions** (fourth review, blocker B2): absent/current candidate →
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

---

### Wave G — Sequential runtime integration (revision-1 Phases 4–5, 10 runtime)

G1–G6 execute in order; each owns its central seam.

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
  **per the provider-derived reorder design (§5.3.16)** — the complete validated
  provider order permutes identities only within the baseline-admitted positions
  (positions mapped from the frozen admission set, §5.1), stable-tie-broken by the
  deterministic V3 order; any error discards detached state and keeps
  `rerankAdjusted === false`; the exact-pin gate rule (§5.3.7) preserved.
- **G3 — Diagnostics projection** (dep: G2): **exclusively modifies
  `search-types.ts`** + finalization/projection tests. Bounded policy ID/hash, fallback
  reason, neural gate decision; **no feature-vector dump**; normal non-debug projection
  stable unless separately authorized.
- **G4 — Startup integration** (deps: F1, F2, F6, G1; splits per §6: artifact
  construction binding; qualification binding; service-class startup tests): server/
  provider runtime construction sites (exact paths from the R0.1 test-command map, not
  discovery during dispatch) + tests. One immutable loaded policy per runtime/service
  class; no per-query file loading; no repo-controlled override; loaded once at
  startup through the trusted-file reader.
- **G5 — Continuation integration** (deps: F7, G2): continuation call sites + tests.
  Stale handle on any policy artifact change; continuation never re-ranks.
- **G6 — Runtime identity and failure matrix** (deps: G1–G5): integration tests +
  evidence receipt. Covers missing/malformed artifact, unqualified/revoked hash,
  provider mismatch, incomplete reranker response, duplicate identity, timeout, exact
  pin, must filter, sole hit, selected-slot permutation, rollback, continuation
  invalidation; **distinct cases for `pending_heldout`, `activation_qualified`, and
  `revoked` registry states, wrong service class, wrong artifact hash, and a registry
  version carrying invalid transition evidence** (fourth review, correction C1).
- **G7 — Runtime implementation seal** (deps: F0–F9, G1–G6; fourth review, blocker B1):
  create `docs/evidence/ranking-v3-runtime-seal-<date>/IMPLEMENTATION_SEAL.json`.
  Binds: F0/F1/F2/F9 trusted-storage code; artifact + registry parsers (A5/A6); F3–F6
  ranking and selection code; G1–G6 integration code; exact tests and build inputs;
  package-lock digest; and the compiled/source-tree digest used by H1–H10 and I1. **A
  hash of the F9 source alone does not prove the executable** — F9 depends on F0, F2,
  parsers, and runtime libraries, so the seal covers the whole implementation. **H1–H10
  depend on G7; I1 verifies G7.** Nothing in Wave H or Wave I runs on unsealed code.

**Wave G gate (runtime gate):** default baseline; missing/invalid/unqualified/revoked →
baseline; no repo-local artifact; no per-query artifact read; exact and must controls
unchanged; failure fallback detached and byte-identical; neural stage permutes admitted
slots only; policy hash in ranked-set identity; continuation never re-ranks.

---

### Wave H — Offline qualification of the exact E4 artifact, unlimited parallel
(second review, finding #4 — H qualifies or rejects the **one** E4 artifact; it does not
select a contender a second time. **All of H1–H10 depend on G7** — Wave H runs only on
the sealed runtime/evaluation/writer implementation, fourth review blocker B1.)

- **H1 — Baseline replay.** (dep: G6)
- **H2 — Grouped diagnostic replay.** (dep: G6)
- **H3 — Deterministic residual replay.** (deps: **G6, E4, D3** — third review,
  correction C1; H3 replays the **exact E4 artifact**, verified by D3's final
  verification invocation per E4 acceptance)
- **H4 — Residual+neural replay.** (deps: **G6, E4, D3** — same verified-E4-digest
  requirement as H3; provider-derived reorder per §5.3.16)
- **H5 — Neural-only diagnostic replay.** (dep: G6; third review, correction C6 —
  explicitly defined as: **baseline-B deterministic positions + frozen baseline
  admission + zero residual + provider-derived permutation within admitted positions**;
  fourth review, correction C6 — **"H5 is diagnostic-only and is not selectable or
  deployable in V3.0."** — no escape clause; E3 may select only deterministic residual
  or residual+provider-reorder, or record `insufficient_evidence`)
  One agent per contender over the same sealed captures and metrics; agents may not
  modify code, labels, thresholds, or artifacts. H3/H4 additionally use the synthetic-
  artifact parity checks from G1/G2; all evaluation runs through **offline/evaluation
  authority only** — no unqualified artifact is loadable by product configuration.
  H6–H9 depend transitively on the verified E4 digest.
- **H6 — Slice gate** (deps: H1–H5): repository-family, language, query class, path
  category, role, negative, exact, must, freshness, missing-evidence slices.
- **H7 — Counterfactual gate** (deps: H1–H5, D4).
- **H8 — Resource gate** (deps: H1–H5, D5).
- **H9 — Terminal qualification verdict** (deps: H6–H8; disposition #12):
  `offline_qualified | rejected | insufficient_evidence` for the **exact E4 artifact** —
  not another contender selection. `offline_qualified` means the artifact passed every
  offline gate (end-to-end, conditional graded, slice, counterfactual, resource); it
  does **not** make `learned_v3` selectable — that requires the registry transition at
  I4. If the artifact fails any conjunctive gate, retain baseline B and stop (held-out
  stays closed); grouped-tuning material victory follows the D1 diagnostic path (§6 D1),
  never silent deployment.
- **H10 — Create pending-held-out registry version** (deps: H9 (`offline_qualified`),
  F9 writer; third review, blocker B2 — the concrete `pending_heldout` transition that
  I1 verifies): execute the frozen F9 writer to create a **new registry version** with
  status `pending_heldout` for the exact E4 artifact (receipt binds previous-registry
  digest + artifact digest + H9 receipt + service class + new-registry digest). This is
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

- **I0 — Owner authorization record:** no code task. Without an explicit authorization
  artifact, no held-out command may run.
- **I1 — Opening-record verifier** (third review, blocker B2 — single normative
  mechanism; fourth review, blocker B1): verifies that the H10 **`pending_heldout`
  registry version** exists for the exact E4 artifact and that every pre-opening seal is
  present and consistent: policy artifact digest, **the G7 implementation seal** (covers
  the F9 writer and its full dependency closure), code digests, preregistered
  thresholds, and the held-out manifest digest. It does **not** claim the final
  post-acceptance entry was sealed in advance.
- **I2 — Single held-out execution:** one custodial agent, no code-edit permission,
  existing sealed labels only (tuning-only grading means the held-out authority is the
  preserved binary owner/hard-negative set).
- **I3 — Terminal adjudication:** accept or reject; preregistered thresholds; no tuning
  or "small fix" after a failure; held-out use closes (it does not become "unseen
  again"); a failure retains baseline B.
- **I4 — Activation-qualified registry transition** (dep: F9 writer, I3; third review,
  blocker B1 — I4 executes the **pre-existing, frozen F9 writer**, it does not create
  it): execute the writer to transition the H10 `pending_heldout` version to a **new
  immutable registry version** with status `activation_qualified`, binding
  previous-registry-digest + artifact-digest + held-out acceptance receipt + service
  class + new-registry-digest. **This is the first point at which the product selector
  may return `learned_v3`** (second review, blocking #2; disposition #12).
- **I5 — Rollback drill:** activate V3, create continuation, switch to baseline/revoke
  artifact, prove new searches use baseline and the old continuation is stale, no
  reindex/rebuild.
- **I6 — Limited activation receipt:** all previous gates pass; default remains baseline
  until the separately authorized production-policy decision changes it.

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
18. **No duplicate evidence or metric authorities** — trace v3 and the existing
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
   uncharacterized; F4/D5 begin by measuring within-query distributions on graded tuning
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

| Claim | Where verified |
|---|---|
| Final-score formula | `packages/mcp/src/core/search-ranking-policy.ts:392` |
| Rerank blend (rank-only, inside fusionScore) | `search-execution.ts:649-650` |
| Raw score discard | `search-execution.ts:586` (`rerankResults: Array<{index}>`); both providers deliver scores (`voyageai-reranker.ts:254-262`, `lateon-reranker.ts:778`, `lateon-reranker-worker.ts:88-105,231-254`) |
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
| Reviewed small-agent design | `docs/superpowers/plans/2026-08-05-satori-ranking-v3-reviewed-small-agent-design.md` (staged) |

---

*End of plan revision 6 (2026-08-06: fourth-review dispositions §3.4 — G7 runtime
implementation seal, transition-enforcing F9 writer with status-specific receipts,
single exact-control policy, `pending_heldout` nonselectable everywhere, O_EXCL
immutability + precise `current` pointer + safe stale-lock recovery, trusted-directory
validation, complete normalized-margin contract, H5 diagnostic-only, hardening receipt
bound to the frozen HEAD). Gates and waves are independently shippable and gated;
nothing in this document authorizes implementation or the opening of held-out evidence.
Gate 0 requires the security-hardening integration merge with a green behavioral
acceptance receipt bound to the frozen HEAD (locked conclusion #11 + §6 Gate 0) and
R0.1A; Waves F–I require the G7 seal before Wave H; each gate/wave requires its own
authorization before execution.*
