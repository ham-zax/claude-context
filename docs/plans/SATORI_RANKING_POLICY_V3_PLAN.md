# Satori Ranking Policy V3 Plan — Hybrid Constrained Learned Ranking + Neural Evidence

**Status:** investigation complete; planning gate. No implementation authorized by this document.
**Date:** 2026-08-05
**Review base revision:** `633c1d4a334655163844af6c3f6905d0ca5df793` (satori master, clean tree)
**Spec source:** parent brief "Ranking Policy V3" (2026-08-05) — quoted claims verified against code in §3.
**Primary owner:** `packages/mcp` (search execution + ranking policy) with `packages/core` (fusion, reranker contract, navigation) and `evals/` (training authority)
**Public projection owner:** `packages/mcp`
**Investigation basis:** 6 parallel deep-dive agents (constants inventory, reranker integration, eval infrastructure, plan/evidence history, intent classification & feature availability, retrieval arms & fusion). Reports: `/tmp/satori-review/rank-{constants,reranker,evals,reports,intent,fusion}.md`. All code claims re-verified at the review base by the plan author.

**Related plans (coordinate, do not duplicate; see §4 for locked-in conclusions):**
- `SATORI_DEEP_LATEON_RERANKING_AND_PAGINATED_DISCLOSURE_PLAN.md` — complete; invariants #1–10; held-out evaluation **currently closed**.
- `SATORI_CROSS_REPOSITORY_RANKING_ABLATION_PLAN.md` — complete; baseline `B` retained; sealed-contender replay mechanism.
- `LANCEDB_SEARCH_TUNING_AND_AGENT_ANSWER_QUALIFICATION_PLAN.md` — Phase 2 negative; "do not tune against aggregate agreement alone."
- `docs/superpowers/plans/2026-08-05-search-integrity-and-runtime-honesty.md` — W1–W7 fixes, **in flight**; V3 Phase 0 freezes after it lands.
- `SATORI_OFFLINE_LATEON_OPERATIONAL_QUALIFICATION_PLAN.md` + `docs/evidence/lateon-d32-profile-activation-20260804/D32_DEFAULT_ACTIVATION_DECISION.md` — D32-v2 offline Linux default, no held-out, risk accepted by owner.
- `SATORI_DEEP_PAGINATION_P0_AUTHORITY_AMENDMENT.md` — frozen contract constants (candidate 80, disclosure 10, byte budgets).
- `PERSISTED_SYMBOL_ANALYSIS_METADATA_PLAN.md` — unrelated (symbol analysis), not affected.

---

## 1. How to read this plan (for an agent with zero context)

This is a **roadmap + design plan** in satori's plan convention (see `docs/plans/`). It does
not authorize implementation. Each phase contains tasks with:

- **Files** — exact paths to create/modify/test.
- **Interfaces** — exact types/signatures consumed and produced (implementers see only their own task).
- **Steps** — ordered work with verification commands.
- **Acceptance** — observable proof of completion.

Repo discipline that binds every task:
- **Evidence-first**: any public-behavior change requires a dated `docs/evidence/<experiment>-<date>/` receipt before merge (existing pattern: `corrected-ranking-r2-20260730`, `lateon-r3-diagnostic-20260730`).
- **Preregistration**: gate thresholds are chosen and sealed **before** looking at tuning or held-out results (locked rule from `SATORI_CROSS_REPOSITORY_RANKING_ABLATION_PLAN.md` R5).
- **Sealed artifacts**: manifests/policies are frozen with SHA-256 before contender replay (`r2-policy-seal.json` pattern).
- **No post-opening changes**: nothing may be tuned, deleted, or rewritten after held-out opens (L5 rule).
- **Contract constants stay hardcoded** (§5.1); only *relevance opinions* move to learned policy (§5.2).

---

## 2. Orientation: satori ranking today (verified at `633c1d4a`)

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

### 2.2 The neural reranker's actual contribution (three RRF layers, not two)

The reranker blend (`packages/mcp/src/core/search-execution.ts:649-650`) adds a fixed rank term
**into `fusionScore`** — i.e. inside the multiplicative chain, before the path/changed-files/
agent-fit multipliers:

```ts
const rerankRrf = 1 / (SEARCH_RERANK_RRF_K + rank);            // 1 / (10 + rank)
rerankSlice[idx].fusionScore += SEARCH_RERANK_WEIGHT * rerankRrf;  // += 1.0 × rrf
```

Effective ordering contribution: `final = ((fusion + 1/(10+rank)) + lexical) × pathMult × changedMult × agentFitMult + ownerBoost`.
And `fusionScore` itself is already two stacked fixed-k RRF layers: core arms k=100
(`packages/core/src/core/vector-candidate-fusion.ts:12` `VECTOR_CANDIDATE_RRF_K_V1 = 100`) then
MCP multi-pass k=60 (`packages/mcp/src/core/search-constants.ts:1` `SEARCH_RRF_K = 60`). **Three
fixed RRF constants (100/60/10) + a fixed reranker weight (1.0)** — the brief said "two different
RRF constants"; the verified number is three.

### 2.3 Raw reranker scores are fetched and then discarded

- Core contract: `packages/core/src/reranker/reranker.ts` — `interface RerankResult { index: number; relevanceScore: number; document?: string }`.
- Voyage parses `relevance_score` (`packages/core/src/reranker/voyageai-reranker.ts:254-276`); LateOn validates a finite `relevanceScore` (`packages/mcp/src/server/lateon-reranker.ts:778`; worker computes `maxSimScore`, `lateon-reranker-worker.ts:90-105,231-254`).
- Call site **discards it**: `search-execution.ts:586` — `let rerankResults: Array<{ index: number }> = []`. Only `index` survives as `rerankRanks`.
- **No calibration exists anywhere** (`rg -i calibrat packages/` → 3 unrelated hits).

### 2.4 The constants inventory (relevance opinions — V3 targets)

| Group | Values | Location |
|---|---|---|
| Path-category multipliers | 39 values (13 categories × 3 scopes): runtime core 1.35, tests 0.90, generated 0.30, fixture 0.35, docs 0.45, entrypoint 1.20, … | `search-constants.ts` `SCOPE_PATH_MULTIPLIERS` (~:49-88) |
| Agent-fit multipliers | 13 values: writer-owner 2.25, writer-non-owner 0.55, implementation symbol 1.25 / chunk 1.15 / script 1.30, test-intent 1.25, tests-without-intent 0.45/0.65, implementation-test demotion 0.25, type 0.72, schema 0.80, anonymous 0.70 | `search-ranking-policy.ts:7-21` (module-local) |
| Agent-fit classifier | regex heuristics: writer-verb sets, symbol-role regexes, ≥2 domain-term threshold | `search-ranking-policy.ts:130-160,417-494` |
| Entrypoint owner boost | 0.35 additive, `ENTRYPOINT_OWNER_INTENT_KINDS` gated | `search-ranking-policy.ts` |
| Changed-files boost | 1.10, ≤50 changed files | `search-constants.ts:18-19` |
| RRF constants | 100 (core) / 60 (mcp) / 10 (rerank) | `vector-candidate-fusion.ts:12`; `search-constants.ts:1,21` |
| Rerank weight | 1.0 | `search-constants.ts:22` |
| Rerank admission | TOP_K 50, ambiguous min 12, per-result 4/2, supplemental 2/family | `search-constants.ts:20,23-26` |
| Expansion trigger | primary scoped < 5 candidates | `search-execution.ts:81` |
| Candidate depth | `clamp(max(limit×8, 32), 80)`; must-retry ×2 up to 80 | `search-policy.ts:62-93` |
| Lexical weight per intent | quoted 1.35, identifier 1.35, mixed 0.10/0.30, uncertain 0.60, semantic 0.00/0.18 | `search-query-planning.ts:648-656` |
| Staleness buckets | fresh 30 min / aging 24 h | `search-constants.ts:36-38` |
| Policy identity | `SEARCH_CANDIDATE_FINAL_SCORE_POLICY_ID = "search_candidate_final_score_v2"` | `search-ranking-policy.ts:22` |

### 2.5 Contracts — keep hardcoded (verified; the brief's list is complete)

- `must:`/`exclude:`/`lang:`/`path:` filtering with removal ledger; must-satisfied never ranks
  below must-unsatisfied (`compareSearchCandidates` `mustMatchesFirst`, `search-ranking-policy.ts:268-276`).
- Exact-symbol/identifier fast path (`search-exact-fast-path.ts`) + exact-pin rerank skip
  (`shouldSkipRerankForExactPin`, `search-execution.ts:288-318`).
- Freshness/fingerprint gates (`search-frontdoor.ts:229-380`) + generation-receipt-bound reads.
- Ceilings: `SEARCH_MAX_CANDIDATES=80`, `SEARCH_MAX_DIAGNOSTIC_CANDIDATES=160`,
  `SEARCH_MAX_FROZEN_RESULTS=200`, disclosure default 10, grouped 128 KiB / debug 2 MiB,
  rerank input 1 MiB, docs 200 lines/4000 chars, frozen cache 32 entries/16 MiB/15 min,
  tracked-lexical 16 / dirty-overlay 16 / live-path 8, must-retry rounds 2.
- Fail-closed reranker fallback: deterministic baseline order + `RERANKER_FAILED` + truthful
  diagnostics; no partial application (full-set parse validation before any score mutation).
- Pagination: one immutable frozen ranked set; continuation never re-ranks; ranked-set binding
  `search_ranked_set_binding_v1` already carries `rankingPolicyIdentity` + `rerankerIdentity`
  (`packages/mcp/src/core/search-result-set-identity.ts:37-56`) and revalidates on continuation
  (`handlers.ts:5250-5285` → `SEARCH_RESULT_SET_STALE`).

### 2.6 Feature availability at scoring time (the V3 feature-contract starting point)

`SearchCandidate` (`search-execution.ts:145-166`): `result, baseScore, backendScore,
backendScoreKind ('dense_similarity'|'lexical_rank'|'rrf_fusion'), backendScoreKindsSeen[],
fusionScore, lexicalScore, finalScore, pathCategory, pathMultiplier, changedFilesMultiplier,
agentFitMultiplier, agentFitReason, entrypointOwnerScoreBoost, entrypointOwnerScoreReason,
passesMatchedMust, exactLexicalMatch, exactMatchPinned, rerankAdjusted, retrievalPasses[],
rerankFamilyId?, rerankDocumentUtf8Bytes?`.

| V3 feature group | Available today? |
|---|---|
| Dense/lexical per-arm rank+score at scoring time | ✗ discarded in both fusions (only summed RRF + max survive) |
| Number of arms containing candidate | ◑ derivable from `retrievalPasses.length` (mcp layer only; values: `primary`, `expanded`, `lexical_files`, `dirty_overlay`, `live_path`, `must_lane`, `attempt:N/passId`) |
| Primary/expanded/exact/must/live membership | ✓ `retrievalPasses` |
| Candidate depth | ✗ no such concept |
| Exact phrase / identifier match | ◑ `exactLexicalMatch` (token-boundary); quoted-phrase per-candidate flag ✗ |
| Path category / file-type classification | ✓ 13 categories + isTestPath/isDocPath/isGeneratedPath/isFixturePath |
| Symbol role | ✓ regex-derived (`classifyAgentFitSymbolRole`) |
| Owner-family identity | ✓ `ownerSymbolKey`/`ownerSymbolInstanceId`/`rerankFamilyId` |
| Authoritative owner evidence | ◑ narrow: pyproject `[project.scripts]` only (`entrypoint-owner-evidence.ts`); no generic owner-vs-similarity feature |
| Fresh/current-source evidence | ✓ `stalenessBucket` + dirty_overlay/live_path passes |
| Query class / intent | ✓ discrete (`route.kind`, `intent`); ✗ **no probabilities** — `testSeeking`/`writerSeeking`/`implementationSeeking` are regex booleans; `SearchIntentConfidence` is 3-level (`high|medium|low`) |
| Explicit operator presence | ✓ `ParsedSearchOperators` |
| Reranker rank | ✓ (rank-only use) |
| Reranker raw score / percentile / margins / calibration | ✗ score discarded; nothing computed |
| Provider/model identity | ◑ `RerankerIdentity {provider, model, profile}` (not a per-candidate feature) |

### 2.7 Evaluation foundation (verified — strong, but binary)

- `evals/search-ranking/`: `cross-repository-v2/v3.manifest.json` — 6/11 repos, frozen revisions +
  tree SHA-256, `split: tuning|held_out`, leakage contract; **tradingview-r0 is already
  `split: tuning`** (matches the brief's direction — it is already tuning/acceptance evidence).
- Task suites: `task-suites/<repo>-r0.{candidate-tasks,negative-exposure}.json` — versioned,
  oracles `{kind: 'owner'|'negative', requiredOwner, acceptableAlternativeOwners (mostly empty),
  hardNegativeOwners, rationale, reviewer, evidence}`.
- Pipeline: `scripts/satori-search-candidate-{capture,replay,score}.mjs` — live capture with
  `mcp_replay_signals` binding → fully offline replay through frozen-component policies
  (unauthorized component change throws) → **binary owner-match scoring** (no graded tiers).
- Adjudication: `satori-search-ranking-r2.mjs` (10,000 bootstrap resamples, 97.5% CI, frozen
  thresholds), `r3.mjs` (SHA-256-pinned tool artifacts), track-O (`satori-lateon-track-o-o3/o4.mjs`)
  with `acceptableAlternativeOwners` consumption + `hardNegativeExposureAt3` (threshold 0.02).
- Metrics in use: Owner@1/3/10, MRR, hard-negative exposure@3. **No nDCG anywhere. No union-level
  recall measurement** ("was an acceptable result present in the raw candidate union" is not
  measured; hard misses are classified post-hoc in
  `docs/evidence/post-r2-offline-localization-20260730/POST_R2_OFFLINE_LOCALIZATION_RECEIPT.md`).
- Held-out isolation: opening records (`satori-track-o-heldout-opening.mjs`), sealed policies
  (`r2-policy-seal.json`), receipts asserting held-out stayed sealed.
- `evals/search-quality/`: deterministic end-to-end ordering fixture (FIXED_NOW,
  REQUIRED_LIMITS [1,3,5,10,20], hash-bound fixture).
- `evals/useful-context/`, `evals/code-intelligence-vs/` (vs cbm), `evals/agent-*`.

---

## 3. The verified problem statement

Every claim in the brief was checked against code. Findings:

| Brief claim | Verification |
|---|---|
| Formula `(fusion + lexical) × pathMult × changedMult × agentFitMult + ownerBoost` | ✅ Verbatim (`search-ranking-policy.ts:392`) |
| Reranker adds fixed `WEIGHT × 1/(RRF_K + rank)` | ✅ Verbatim (`search-execution.ts:649-650`) — **correction**: the term is added *into `fusionScore`* (inside the multiplicative chain), so the reranker's influence is scaled by all multipliers |
| "Two different RRF constants" | ⚠️ **Three** — core k=100, mcp k=60, rerank k=10 — plus weight 1.0 |
| Raw reranker scores exist but are discarded | ✅ `search-execution.ts:586` discards `relevanceScore` from both Voyage and LateOn |
| No calibration exists | ✅ zero calibration code |
| Intent classifier exposes hard booleans, not probabilities | ✅ regex booleans; 3-level discrete confidence |
| "The neural reranker is not really making the final relevance decision" | ✅ Confirmed — rank-only bucket inside a manually shaped score |
| "Moving numbers to JSON would not help" | ✅ Agreed — §5.3 distinguishes config-from-evidence; this plan only produces *generated, receipt-bound* artifacts |
| "Ranking constants should be treated as a separate evaluation project" | ⚠️ **Provenance note**: that sentence is **not in the repo**. No in-repo document contains it. It originates from the parent brief / an external live-observation report. The repo's closest locked statements: "No deterministic finalist was selected" (`corrected-ranking-r2-20260730`), "Do not tune against aggregate backend agreement alone" (`LANCEDB_SEARCH_TUNING…`), "Do not tune depth, projection, weights, or thresholds after opening held-out results" (deep plan L5). The *direction* is consistent with every in-repo gate but is **not itself a locked decision** — it must be newly authorized, which this plan requests. |

---

## 4. Locked-in conclusions the V3 plan must not contradict

1. **Product ranking policy = baseline `B`** (deterministic formula), except the managed
   **offline** Linux x64/WSL2 default = LateOn D32-v2 (`lateon_d32_owner_default_v1`,
   owner decision 2026-08-04, **no held-out quality evidence**, accepted generalization risk).
   Any V3 default change requires an L5/R5-style held-out gate **plus** a separate
   production-policy receipt (L6 rule).
2. **Held-out evidence is sealed and all future held-out evaluation is currently closed**
   (deep plan terminal status). V3 Phase 9 requires **fresh owner authorization** to open once.
3. **Deep-plan invariants #1–10** (excerpts): candidate membership/eligibility owned before
   neural reranking; reranker reorders only admitted candidates and can never restore an owner
   absent from the frozen retrieval union; exact identifiers, `must:`, configuration ownership,
   source freshness, publication authority, scope filtering, no-answer behavior remain
   deterministic and fail closed; **no query-specific exceptions, repository-specific weights,
   or new blanket path constants**; continuation performs no new retrieval/reranking;
   pagination exposes one immutable ranked set.
4. **Transactional rerank fallback**: complete provider order validated on a detached copy;
   any failure restores byte-identical deterministic state; truthful `RERANKER_FAILED`
   diagnostics allowed.
5. **In-flight W-fix plan** (`docs/superpowers/plans/2026-08-05-search-integrity-and-runtime-honesty.md`,
   base `403723ee`): bounded `must:` retrieval lane (changes retrieval-union composition),
   reranker timeout/retry bounds, untracked-file freshness, readiness/pagination honesty.
   Constraints: "Do not change ranking for queries without `must:`", "Do not change the
   reranker-disabled path", preserve fail-closed fingerprint gate, `rerankAdjusted === false`
   on failure. **V3 Phase 0 freezes AFTER this plan lands.**
6. **Constant-tuning precedent (already failed twice)**: R2 `B-P0`/`B-A0` (no finalist; B-P0
   failed efficacy/uncertainty/disclosed-list gates) and LANCEDB Phase 2 (all four replay
   contenders failed the `+1` owner-survival gate). V3 Phase 3 must reuse the sealed-contender
   mechanism and must not claim novelty for grid-tuning the current formula.
7. **Different benchmark populations must not be conflated**: 3-family suite (B MRR 0.3602 /
   owner@3 0.3722) vs 6-family tuning suite (B 0.2900 / 0.3611) are not one measurement.
8. **Frozen resource gates** (L3, from deployment profile): warm p95 deadlines, memory profile;
   D32-v2 passes operational but not quality gates. V3 contenders face the same frozen
   resource envelope.
9. **No calibration/no-answer threshold change** (S0 semantic abstention deferred) — V3's
   confidence gate is a ranking gate, not a no-answer abstention change.
10. **tradingview-r0 is `split: tuning`** — the brief's "becomes tuning/acceptance evidence"
    matches current state; held-out repos are promptready/fastcontext/recovery-dashboard (+
    ai-studio-prompt-library in v3).

---

## 5. Spec summary (the design to plan against)

### 5.1 Keep hardcoded (contracts, not opinions)
`must:`/`exclude:`/`lang:`/`path:` filtering; exact-symbol/exact-identifier handling;
source-freshness and fingerprint gates; candidate/byte/timeout/memory ceilings; fail-closed
behavior; deterministic fallback when the reranker fails; pagination and disclosure limits.
A reranker may only reorder admitted candidates; it must never weaken eligibility, freshness,
exact controls, or failure fallback.

### 5.2 Move to evaluated/learned policy
Path-category multipliers; test/implementation/writer-intent multipliers; changed-file boost;
generic owner-evidence boost; retrieval-arm fusion weights; `SEARCH_RRF_K`; `SEARCH_RERANK_RRF_K`;
`SEARCH_RERANK_WEIGHT`; reranker application threshold; candidate-depth selection; the
lexical/dense/neural evidence balance. **Treated as one evaluation project, not per-anecdote edits.**

### 5.3 The recommended architecture (approved design direction)

```text
retrieval arms → candidate union → deterministic eligibility → versioned feature extraction
→ constrained learned baseline → neural reranker → calibrated blend / confidence gate
→ grouping and disclosure
```

Key decisions (from the brief, restated as binding requirements):
1. **Separate recall from ranking**: per-task gate "was an acceptable result present in the raw
   candidate union?" before any ranking evaluation.
2. **Versioned feature contract** `search_features_v1`: retrieval / candidate / query / neural
   feature groups (see §2.6 for the verified availability matrix). **Excluded**: repository
   name, task ID, literal repo-specific path exceptions, query-specific exceptions, user identity.
3. **Interpretable learned baseline first**: constrained pairwise **linear** ranker
   (inspectable coefficients, monotonic constraints, deterministic replay, small-data
   compatible). LambdaMART/tree-based is a later contender, never the starting point.
4. **Stop converting neural order into a fixed RRF bucket**: provider-neutral
   `RerankEvidence { candidateId, rank, rawScore?, calibratedScore?, confidence? }`; score
   providers retain + calibrate raw scores (versioned per provider+model); order-only
   providers use normalized rank percentile with confidence marked unavailable.
5. **Confidence gate**: apply neural ordering only when full response valid, identities
   accounted, calibrated gate passes, candidate set ambiguous enough, no exact deterministic
   control owns the result, model execution bound to the frozen candidate set; otherwise
   deterministic baseline + truthful diagnostics.
6. **Generated policy artifact** (never hand-edited): `schemaVersion`, `policyId`
   (`search_ranking_policy_v3`), `featureSchema`, training manifest/code SHA-256s, coefficients,
   normalization, reranker calibration, quality receipt SHA-256, `createdFromCommit`; exact
   schema validation at startup; coefficients constrained to preregistered ranges; policy hash
   in search diagnostics and index/runtime receipts; invalid/missing → last qualified
   deterministic policy.
7. **Bias measurement**: per-slice metrics (repository family, language, query class, path
   category, symbol role, negative tasks, exact controls) with a multi-condition gate — macro
   metric improves **AND** no critical class regresses **AND** worst-family regression bounded
   **AND** exact/must controls perfect-or-bounded **AND** negative FPs don't increase **AND**
   resources pass.
8. **Counterfactual bias tests**: paired candidates with identical content and controlled
   metadata changes (path swaps, stale/current docs, test/impl pairs, named↔anonymous,
   fresh↔unchanged); neutral queries must not show unexplained path-only shifts; repo names and
   task IDs never affect score.
9. **Graded labels**: 0–3 (canonical / acceptable supporting / related / irrelevant), multiple
   acceptable answers, hard negatives, stale/legacy docs, tests-that-mention-but-don't-implement,
   wrappers/stubs, generated artifacts, ambiguous same-name symbols. `tradingview_ratio` =
   tuning/acceptance, not held-out (already true).
10. **Do-not list** (§7): no env-var "learning", no client-specific path exceptions, no
    must-lane weight inflation to hide recall gaps, no reranker bypass of eligibility, no
    training on held-out, no macro-only optimization, no implicit-click learning without
    position-bias correction, no automatic coefficient updates in production, no cross-provider
    calibration mixing, no reranker-as-recall-repair, no online learning in the first release.

---

## 6. Phases

Each phase is gated and independently shippable. Phases 0–3 build evidence; phases 4–6 build the
policy; phases 7–10 qualify and roll it out. Nothing in this section authorizes execution.

---

### Phase 0 — Freeze current behavior

**Goal:** byte-exact baseline of today's production behavior (policy `search_candidate_final_score_v2`,
binding `search_ranked_set_binding_v1`), captured before any instrumentation.

**Prerequisite gate:** W-fix plan (`2026-08-05-search-integrity-and-runtime-honesty.md`) landed
and its baseline receipt (`docs/evidence/search-integrity-baseline-20260805/BASELINE.md`) is
current — the bounded `must:` lane changes retrieval-union composition that V3 features will read.

#### Task 0.1: Baseline capture receipt

**Files:**
- Create: `docs/evidence/ranking-v3-phase0-<date>/PHASE0_BASELINE_RECEIPT.md`
- Use: existing capture tooling (no new code this task)

**Interfaces:**
- Consumes: `pnpm eval:search-candidates:capture` (per-task captures with `mcp_replay_signals`,
  `debugCandidateLimit: 160` trace-only), `pnpm eval:search-quality` (deterministic fixture),
  `pnpm eval:useful-context:record` (cold/warm latency).
- Produces: receipt recording — policy identity (`search_candidate_final_score_v2`), binding
  identity, full constants table (§2.4, frozen as evidence), candidate traces, per-slice scores
  (family × language × queryClass), latency/memory (warm p95, RSS), and the current
  `rankingPolicyIdentity` value captured from `search-result-set-identity.ts`.

**Steps:**
1. Confirm W-fix plan landed (verify `must:` bounded lane + reranker timeout bounds in
   `search-execution.ts`; stopping condition: its own receipt updated).
2. Run `pnpm eval:search-quality`; run capture over the tuning split; run
   `pnpm eval:useful-context:record -- --dry-run` for the latency profile.
3. Freeze the constants table + policy identity into the receipt; record git revision.

**Acceptance:** the receipt reproduces today's rankings from the frozen captures with zero
policy changes; no code changed in this phase.

---

### Phase 1 — Feature instrumentation (rankings stay byte-identical)

**Goal:** versioned feature extraction with a **byte-identical-ranking proof** — this isolates
feature-extraction bugs from ranking changes (brief Phase 1 requirement).

#### Task 1.1: Retain per-arm evidence in fusion

**Files:**
- Modify: `packages/core/src/core/vector-candidate-fusion.ts` (`fuseVectorCandidatesWithRrf` —
  add optional `retainArmEvidence: true` output carrying `[{arm, rank, score}]` per candidate;
  default path unchanged)
- Modify: `packages/mcp/src/core/search-execution.ts` (`addPass` — accumulate per-pass rank;
  `SearchCandidate` gains `armEvidence?: Array<{passId, rank, rrfContribution}>`)
- Modify: `packages/core/src/types.ts` (`SemanticSearchResult` gains optional `armEvidence`)
- Test: `packages/core/src/core/vector-candidate-fusion.arm-evidence.test.ts` (new)

**Interfaces:**
- Consumes: `VECTOR_CANDIDATE_RRF_K_V1 = 100` (unchanged), `vectorCandidateOwnerId` dedup
  (unchanged — per-arm evidence attaches after dedup, never changes dedup).
- Produces: `ArmEvidence { arm: 'dense'|'lexical'|'lexical_fallback'|'primary'|'expanded'|'lexical_files'|'dirty_overlay'|'live_path'|'must_lane'|'attempt:N/passId', rank: number, score: number }[]`
  — **additive only**; candidate identity, dedup keys, and fused scores byte-identical.

**Steps:**
1. Failing test: fusion with `retainArmEvidence` returns identical fused scores AND per-arm
   ranks; without the flag, output deep-equals today's output.
2. Implement; rerun; run the full `packages/core` search test suite.
3. Record the byte-identity proof (see Task 1.4).

**Acceptance:** per-arm evidence available at scoring time; zero effect without the flag.

#### Task 1.2: RerankEvidence — stop discarding raw scores

**Files:**
- Modify: `packages/mcp/src/core/search-execution.ts:586` (`rerankResults` typed
  `RerankResult[]` instead of `Array<{index}>`; build `rerankEvidence` map)
- Create: `packages/mcp/src/core/rerank-evidence.ts` — provider-neutral shape
- Modify: `packages/mcp/src/core/search-types.ts` (diagnostics surface)
- Test: `packages/mcp/src/core/rerank-evidence.test.ts` (new)

**Interfaces:**
- Consumes: `RerankResult { index, relevanceScore, document? }` (both providers already deliver).
- Produces:
  ```ts
  interface RerankEvidence {
      candidateId: string;
      rank: number;                 // 1-based
      rawScore?: number;            // provider relevance score when available
      calibratedScore?: number;     // Phase 5; undefined until then
      confidence?: number;          // Phase 5; undefined for order-only providers
      providerIdentity: { provider: string; model: string; profile: string };
  }
  ```
- **Byte-identity rule:** the blend formula (Task 1.4 proof) still consumes rank only; rawScore
  is carried but unused by scoring until Phase 5.

**Steps:**
1. Failing test: after a fake rerank call, `rerankEvidence` contains the raw score; blend output
  unchanged vs baseline.
2. Implement; rerun; typecheck.

**Acceptance:** raw scores retained and versioned per provider identity; scoring unchanged.

#### Task 1.3: Versioned feature vector

**Files:**
- Create: `packages/mcp/src/core/ranking-features.ts` — `extractSearchFeatureVector(input)` and
  `SearchFeatureVectorV1`
- Create: `packages/core/src/ranking-features-schema.ts` (schema + validation, shared type)
- Modify: `packages/mcp/src/core/search-execution.ts` (compute after final scoring, before grouping)
- Modify: `packages/mcp/src/core/search-types.ts` (debug surface: `featureVector` under
  `debugMode: full`, bounded)
- Test: `packages/mcp/src/core/ranking-features.test.ts` (new)

**Interfaces:**
- Consumes: `SearchCandidate` (§2.6), `SearchQueryPlanLike`, `RerankEvidence` (Task 1.2).
- Produces: `SearchFeatureVectorV1` (schema `search_features_v1`), groups per brief §2:
  - retrieval: denseRank/denseScore/lexicalRank/lexicalScore (from Task 1.1), armsContainingCount,
    pass membership flags (primary/expanded/exact/must/live), candidateDepth (see below),
    exactPhraseMatch, identifierMatch;
  - candidate: pathCategory (one-hot or ordinal), symbolRole, language, fileTypeClass,
    ownerFamilyIdentity (hash), authoritativeOwnerEvidence, freshEvidence, generatedOrFixture;
  - query: queryClass, identifierConfidence (from `SearchIntentConfidence`), implementation/
    test/docs/ownership confidence (bounded discrete → numeric 0..1 mapping, **not** invented
    probabilities — see Task 4.2 note), explicitOperatorPresence;
  - neural: rerankerRankPercentile, rerankerRawScore?, calibratedScore?, topScoreMargin?,
    candidateToTopMargin?, providerModelIdentity (hash).
- **Candidate depth:** define in this task as `limitRank + passCount` ordinal
  (`candidateDepth = position in the post-eligibility union`) — the concept does not exist today;
  record the definition in the feature schema.
- **Exclusions enforced by schema validation test:** repository name, task ID, absolute paths,
  user identity never appear as features.

**Steps:**
1. Failing test: feature vector shape + exclusion invariants (inject a repo name; assert it is
   not a feature).
2. Implement extraction; expose under `debugMode: full` (bounded, `SEARCH_MAX_DIAGNOSTIC_CANDIDATES`).
3. Rerun; typecheck.

**Acceptance:** `search_features_v1` validated at extraction time; exclusions enforced by test.

#### Task 1.4: Byte-identical ranking proof

**Files:**
- Create: `docs/evidence/ranking-v3-phase1-<date>/BYTE_IDENTICAL_PROOF.md`
- Test: `packages/mcp/src/core/search-byte-identity.test.ts` (new) — captures phase-0 frozen
  captures, replays through instrumented code, asserts deep-equal rankings (score → path →
  startLine → label → symbolId tie-break order).

**Steps:**
1. Write the identity test against the Phase 0 frozen captures.
2. Land Tasks 1.1–1.3; run the identity test + `pnpm eval:search-quality` (exact owner
   rankings at REQUIRED_LIMITS must not move).
3. Record the proof receipt.

**Acceptance:** rankings byte-identical before/after instrumentation on all frozen captures;
search-quality fixture unmoved.

**Phase 1 gate:** byte-identity receipt + all tests green.

---

### Phase 2 — Graded training authority

**Goal:** extend the manifest/eval pipeline from binary owner-match to graded relevance 0–3
with slice labels, so phases 3–5 have pairwise training signal (brief "Data plan").

#### Task 2.1: Graded manifest schema

**Files:**
- Modify: `evals/search-ranking/task-suites/*.candidate-tasks.json` (schema v3; additive)
- Modify: `scripts/satori-ranking-benchmark-manifest.mjs` (vocabulary: `GRADES`, `SLICE_KEYS`)
- Modify: `evals/search-ranking/build-cross-repository-manifest.mjs` (validation)
- Test: `scripts/satori-ranking-benchmark-manifest.test.mjs` (extend)

**Interfaces:**
- Produces per task: `gradedRelevance` examples — `{ grade: 3|2|1|0, file, symbol?, rationale }[]`
  (3 = canonical answer, 2 = acceptable supporting, 1 = related but incomplete, 0 = irrelevant
  or misleading); populated `acceptableAlternativeOwners` (grade 2 set); `hardNegativeOwners`
  (grade 0); `sliceLabels: { repositoryFamily, language, queryClass, pathCategory, symbolRole }`;
  new task types: `stale_vs_current_doc`, `test_mentions_but_not_implementing`, `wrapper_or_stub`,
  `generated_artifact`, `ambiguous_same_name` (brief's data-plan list).
- **Sealing rule:** any manifest with a task lacking graded labels is rejected by the builder
  (no silent binary fallback in training sets; binary-only tasks remain valid for
  response-level evals).

**Steps:**
1. Failing tests for the schema validator (missing grades, unknown slice key, grade out of range).
2. Re-grade the existing tuning task suites (each task reviewed — the repo's reviewer field is
  retained; graded labels are a human-reviewed authority, never script-inferred).
3. Add the five new task types with fixtures in `evals/search-ranking/fixtures/` (new dir).
4. Seal a new manifest version (`cross-repository-v4`) with the existing leakage contract.

**Acceptance:** v4 manifest validates; every tuning task has grades + slice labels; held-out
tasks graded identically but unreadable without the opening record.

#### Task 2.2: Graded scoring + union recall gate

**Files:**
- Modify: `scripts/satori-search-candidate-score.mjs` (graded scoring; `scoreTask` extended)
- Modify: `scripts/satori-search-candidate-capture.mjs` (record `unionRecall: boolean` per task —
  was an acceptable (grade ≥2) result present in the post-eligibility union, pre-ranking?)
- Modify: `scripts/satori-search-candidate-replay.mjs` (preserve union field through replay)
- Test: `scripts/satori-search-candidate-score.test.mjs` (extend)

**Interfaces:**
- Produces: per-task `{ recallGate: 'passed'|'failed'|'unlabeled', unionRecallRank?, gradedHits:
  {grade3Rank?, grade2Rank?, worstGrade}, metrics per slice }`; `recallGate === 'failed'` tasks
  are **excluded from ranking metrics and reported separately** (brief §"Separate recall from
  ranking" — no ranking-weight tuning may target a recall failure).
- Metrics module: `scripts/ranking-metrics.mjs` — `recallAtK`, `mrr`, `ndcgAt10` (**new** —
  currently absent), `acceptableOwnerAt1/3`, `falsePositiveRate` (graded negatives), per-slice
  breakdown, `worstRankRegression`, `exactControlSuccess`, `neuralImprovementRegressionCounts`.

**Steps:**
1. Failing tests: graded scoring on a synthetic capture; recall-gate exclusion; nDCG@10 computed
  by hand on a tiny fixture.
2. Implement; rerun the existing R2/R3 pipelines to confirm binary-owner behavior is preserved
  (backward-compatible mode).

**Acceptance:** graded authority produces slice metrics + recall gates; existing pipelines green.

**Phase 2 gate:** v4 manifest sealed; grading review receipts recorded per task suite.

---

### Phase 3 — Automated constant baseline (brief §"Approach 1" as baseline)

**Goal:** automatically optimize the **current** formula's constants on tuning data, as a
contender — proving whether the learned system beats merely-tuned current formula. **Never
deployed automatically** (brief phase 3 rule).

#### Task 3.1: Tuning harness over the current formula

**Files:**
- Create: `scripts/tune-ranking-constants.mjs` — grid + Bayesian search over
  `SCOPE_PATH_MULTIPLIERS` (bounded perturbations), agent-fit multipliers, `SEARCH_RRF_K`
  (60±), `SEARCH_RERANK_RRF_K` (10±), `SEARCH_RERANK_WEIGHT`, entrypoint boost cap,
  changed-first multiplier — using the v4 graded tuning tasks (Task 2.2 metrics as objective;
  macro MRR is a report, not the gate)
- Test: `scripts/tune-ranking-constants.test.mjs`

**Interfaces:**
- Consumes: graded captures (Phase 2), replay harness (`satori-search-candidate-replay.mjs`).
- Produces: `tuned_baseline` contender artifact in the sealed-policy format (frozen-component
  capture style, extended with the tuned constants) — **explicitly not** a learned-policy
  artifact; constrained to preregistered ranges (no free-form search outside the brief's
  constant inventory).

**Steps:**
1. Failing test: tuning run over a synthetic capture terminates deterministically and
  reproduces identical results on re-run (seeded).
2. Implement; run over the tuning split; record tuning results **without** deploying.

**Acceptance:** tuned-baseline contender + tuning receipt; production untouched.

#### Task 3.2: Contender adjudication vs baseline B

**Files:**
- Create: `docs/evidence/ranking-v3-phase3-<date>/TUNED_BASELINE_ADJUDICATION_RECEIPT.md`
- Use: `satori-search-ranking-r2.mjs`-style bootstrap adjudication (frozen thresholds chosen
  **before** running — R5 rule).

**Steps:**
1. Preregister thresholds (e.g. RR delta ≥ 0.03, owner@3 lower interval > 0 — the R2 frozen
  values, recorded verbatim).
2. Replay tuned-baseline vs B over tuning captures; adjudicate.
3. Record receipt (expected precedent: no finalist — R2/`B-P0` and LANCEDB Phase 2 already
  failed this bar; the receipt documents whether tuning alone suffices).

**Acceptance:** a terminal decision (select/retain-B) with receipt; no production change.

**Phase 3 gate:** receipt + preregistered thresholds on file before adjudication.

---

### Phase 4 — Constrained linear Policy V3 (brief §"Recommended design" 1–3, 6)

**Goal:** the interpretable learned baseline: a constrained pairwise linear ranker over
`search_features_v1`, published as a generated, validated policy artifact.

#### Task 4.1: Training script (offline, deterministic)

**Files:**
- Create: `scripts/train-ranking-policy.mjs` — pairwise training
  (`canonical > acceptable > related > irrelevant` from graded captures), **linear** model,
  coordinate descent, deterministic seeding, **sign constraints** (the brief's list):
  - must-satisfied never ranks below must-unsatisfied (enforced post-hoc + as a constraint);
  - exact-identifier evidence cannot receive a negative coefficient;
  - fresh/current-source evidence cannot become a penalty;
  - generated/fixture status cannot become positive without explicit query intent;
  - authoritative owner evidence cannot be treated as generic semantic similarity.
- Test: `scripts/train-ranking-policy.test.mjs`

**Interfaces:**
- Consumes: v4 graded captures (Phase 2), `SearchFeatureVectorV1` extraction (Phase 1 —
  training runs extraction inside the pipeline on frozen captures, never on debug envelopes:
  the survival ledger truncates at 160/stage).
- Produces: policy artifact (Task 4.2 format) + training receipt (coefficients, normalization
  stats, feature schema, per-slice tuning results, cross-slice results, monotonic-constraint
  verification table).

**Steps:**
1. Failing tests: sign constraints violated on a synthetic adversarial capture → training
  fails; determinism (same seed → identical artifact bytes).
2. Implement; run on tuning split; record receipt.

**Acceptance:** deterministic, constraint-verified artifact; **no runtime dependency on the
training script**.

#### Task 4.2: Policy artifact format + startup validation

**Files:**
- Create: `packages/mcp/src/core/ranking-policy-artifact.ts` — schema `search_ranking_policy_v3`
  (exact JSON shape from the brief §6), validation, coefficient-range checks, fallback logic
- Create: `packages/mcp/src/core/ranking-policy-store.ts` — artifact loading (state-root
  location under `~/.satori/` or repo config; TBD at M0 — see Task 4.3)
- Test: `packages/mcp/src/core/ranking-policy-artifact.test.ts` (new)

**Interfaces:**
- Consumes: generated artifact JSON.
- Produces:
  ```json
  {
    "schemaVersion": 3,
    "policyId": "search_ranking_policy_v3",
    "featureSchema": "search_features_v1",
    "trainingManifestSha256": "...",
    "trainingCodeSha256": "...",
    "coefficients": {},
    "normalization": {},
    "rerankerCalibration": {},
    "qualityReceiptSha256": "...",
    "createdFromCommit": "..."
  }
  ```
  Validation rules: exact schema match; coefficients within preregistered ranges; unknown
  fields rejected; missing/invalid artifact → **last qualified deterministic policy** (baseline
  B behavior), with a truthful `rankingPolicyFallback` diagnostic.

**Steps:**
1. Failing tests: malformed artifact rejected; out-of-range coefficient rejected; missing
  artifact falls back with diagnostic.
2. Implement; rerun.

**Acceptance:** startup validation exact; fallback path is baseline B, observable in diagnostics.

#### Task 4.3: M0 decision — artifact storage location

**Files:**
- Create: `docs/evidence/ranking-v3-phase4-m0-<date>/M0_STORAGE_DECISION.md`

**M0 gate (required before Task 4.4):** decide artifact location among:
(a) `~/.satori/ranking-policy/<policyId>.json` (state root, per-runtime),
(b) repo-root `.satori/ranking-policy.json` (per-codebase, git-ignored),
(c) bundled default + overridable path.
Evaluate: multi-codebase behavior, offline operation, rollback mechanics (artifact swap must
not require rebuild or reindex — brief Phase 10), per-service-class coexistence with the D32
offline default (locked conclusion #1), and the existing `search_ranked_set_binding_v1`
`rankingPolicyIdentity` field (a policy change already invalidates continuation handles).
**Default recommendation: (c)** — bundled qualified artifact + explicit override path, so
rollback is a config/artifact swap, and the binding identity already protects frozen sets.

#### Task 4.4: Runtime policy engine

**Files:**
- Create: `packages/mcp/src/core/ranking-policy-v3.ts` — `scoreWithLearnedPolicy(candidate,
  features, artifact)`; `final score = learned baseline features + learned neural contribution`
- Modify: `packages/mcp/src/core/search-execution.ts` (policy selection: baseline | learned_v3;
  scoring swap behind the selection)
- Modify: `packages/mcp/src/core/search-ranking-policy.ts` (keep `computeSearchCandidateFinalScore`
  as the baseline path, unchanged)
- Modify: `packages/mcp/src/core/search-constants.ts` (policy ID registry: v2 baseline,
  v3 learned)
- Test: `packages/mcp/src/core/ranking-policy-v3.test.ts` (new)

**Interfaces:**
- Consumes: `SearchFeatureVectorV1`, policy artifact, `RerankEvidence` (neural contribution is
  a **learned** term — not `1/(10+rank)`).
- Produces: `finalScore` + `rankingPolicy: { policyId, policyHash, featureSchemaVersion,
  fallback?: boolean }` surfaced in diagnostics and the response envelope; policy hash also
  recorded in index/runtime receipts per brief §6 (extend `searchDiagnostics` + receipt types
  in a later task — record the seam in this task).

**Steps:**
1. Failing tests: learned scoring equals baseline when artifact is the identity-policy (the
  trained-on-baseline artifact reproduces baseline ordering — a calibration check); monotonic
  constraints hold on adversarial feature vectors; fallback path byte-identical to baseline.
2. Implement; rerun; typecheck; run `pnpm eval:search-quality` (fixture must stay green in
  baseline mode).

**Acceptance:** policy engine selects baseline or learned_v3; fallback always available;
hash identity plumbed into diagnostics.

**Phase 4 gate:** M0 storage decision recorded; artifact validation + fallback tested;
training receipt on file.

---

### Phase 5 — Reranker calibration and confidence gate (brief §4–5)

**Goal:** neural evidence becomes a learned, provider-calibrated feature — never a fixed
rank bucket; gated so it cannot override strong deterministic results.

#### Task 5.1: Per-provider/model calibration

**Files:**
- Create: `packages/mcp/src/core/rerank-calibration.ts` — calibration fit/apply, keyed by
  `(provider, model, profile, projectionVersion)`
- Create: `scripts/calibrate-reranker.mjs` — fits calibration on tuning captures
  (rank→score distribution; isotonic/Platt-style on the graded authority; **one calibration
  artifact per provider+model** — never shared across Voyage/LateOn/Jina/ZeroEntropy)
- Modify: `packages/mcp/src/core/rerank-evidence.ts` (populate `calibratedScore`, `confidence`)
- Modify: `packages/mcp/src/core/ranking-policy-artifact.ts` (`rerankerCalibration` section)
- Test: `packages/mcp/src/core/rerank-calibration.test.ts` (new)

**Interfaces:**
- Consumes: `RerankEvidence.rawScore` (Task 1.2), graded captures (Phase 2), artifact
  validation (Task 4.2).
- Produces: per-provider calibration curve + `calibratedScore` (0..1 bounded) + `confidence`
  (available for score providers; **order-only providers** → `confidence: undefined`, rank
  percentile only — brief §4); calibration version in the artifact and in
  `SearchRankedSetBindingInput` (extend the binding so continuation revalidation covers
  calibration changes — `SEARCH_RESULT_SET_STALE` semantics preserved).

**Steps:**
1. Failing tests: calibration applied per provider (Voyage artifact never applied to LateOn
  scores — enforced by identity key); order-only path marks confidence unavailable.
2. Implement; fit on tuning data; record calibration quality (score-margin separation on
  graded pairs).
3. Extend the ranked-set binding type + revalidation test.

**Acceptance:** calibrated scores versioned per provider/model; binding covers calibration.

#### Task 5.2: Confidence gate

**Files:**
- Modify: `packages/mcp/src/core/search-execution.ts` (rerank application path — replace the
  unconditional `fusionScore += 1/(10+rank)` blend with the gated learned contribution)
- Modify: `packages/mcp/src/core/search-rerank-policy.ts` (gate inputs)
- Test: `packages/mcp/src/core/rerank-confidence-gate.test.ts` (new)

**Interfaces:**
- Consumes: `RerankEvidence` (calibrated score, margin), frozen candidate set identity,
  exact-pin state (`shouldSkipRerankForExactPin` remains), `family_ambiguity` signal
  (existing `budgetReason === 'family_ambiguity'`), `resolveRerankDecision`.
- Produces: gate decision `apply | skip | fallback_deterministic` — apply only when:
  1. full response valid (existing count/identity/completeness checks);
  2. every candidate identity accounted for;
  3. calibrated confidence / rank margin passes the (learned, preregistered) gate threshold;
  4. candidate set is sufficiently ambiguous (existing min-12 signal);
  5. no exact deterministic control owns the result (exact pin, must-satisfied top, sole hit);
  6. model execution bound to the current frozen candidate set (existing binding).
  On uncertainty/failure: **deterministic baseline order + truthful diagnostics** (existing
  `RERANKER_FAILED` path preserved; add `RERANKER_GATE_SKIPPED` reason).

**Steps:**
1. Failing tests: gated apply (margins below threshold → baseline order, `rerankAdjusted:
   false`); exact-pin skip preserved; failure fallback byte-identical (existing transactional
   test suite must stay green).
2. Implement; rerun `search-execution.exact-pin-rerank.test.ts` + `search-rerank-policy.test.ts`
   (existing suites pin current behavior — they must pass unchanged or their deltas must be
   receipted).

**Acceptance:** neural ordering applies only behind the calibrated gate; deterministic fallback
always available and observable.

**Phase 5 gate:** calibration artifacts + gate tests green; binding extended; existing rerank
test suites unchanged (or receipted deltas).

---

### Phase 6 — Adversarial and counterfactual evaluation (brief §"Counterfactual bias tests")

**Goal:** prove the learned policy uses relevance, not metadata shortcuts.

#### Task 6.1: Counterfactual harness

**Files:**
- Create: `scripts/ranking-counterfactuals.mjs` — paired-candidate generator + evaluator
- Create: `evals/search-ranking/counterfactuals/` (pair fixtures: path swaps, stale/current
  docs, test/impl pairs, named↔anonymous, fresh↔unchanged, wrapper/owner pairs, must-acceptance,
  negative/no-answer)
- Test: `scripts/ranking-counterfactuals.test.mjs`

**Interfaces:**
- Produces per pair type: neutral-query score shift (must be bounded/absent), explicit-intent
  preference allowed (test queries may prefer tests; docs queries may prefer docs), exact
  controls deterministic, repo-name/task-id invariance.

**Steps:**
1. Failing tests: a shortcut-exploiting synthetic policy fails the harness (e.g. a policy
  with a positive tests-path coefficient on neutral queries).
2. Implement; run against baseline B (must pass — establishes the harness baseline) and
  against learned_v3.

**Acceptance:** baseline B passes; learned_v3 passes or is rejected before Phase 7.

#### Task 6.2: Slice-based quality gates

**Files:**
- Create: `scripts/ranking-slice-gates.mjs` — the brief's multi-condition gate
- Test: `scripts/ranking-slice-gates.test.mjs`

**Interfaces:**
- Produces: gate verdict from per-slice metrics (Phase 2 metrics module): macro metric improves
  AND no critical query class regresses AND worst repository-family regression within bound AND
  exact/must controls perfect-or-bounded AND negative-task false positives do not increase AND
  resource limits pass. Thresholds preregistered before evaluation.

**Steps:**
1. Failing tests per gate condition.
2. Implement; apply to the Phase 4 artifact + Phase 3 tuned baseline.

**Acceptance:** gate output is deterministic and preregistration-bound.

**Phase 6 gate:** counterfactual + slice receipts for baseline B and learned_v3.

---

### Phase 7 — Shadow mode (brief Phase 7)

**Goal:** run Policy V3 beside production without affecting responses; record only
policy-safe telemetry.

#### Task 7.1: Shadow recorder

**Files:**
- Create: `packages/mcp/src/core/ranking-shadow.ts` — records when
  `rankingPolicy: shadow_learned_v3` (config): policy IDs, feature values, candidate
  IDs/hashes, rank differences (production vs shadow), latency, failure classifications
- Modify: `packages/mcp/src/core/search-execution.ts` (shadow computation after the
  production response is finalized — **never before**, so production path is byte-identical)
- Modify: `packages/mcp/src/core/search-types.ts` (bounded shadow diagnostics)
- Test: `packages/mcp/src/core/ranking-shadow.test.ts` (new)

**Interfaces:**
- Consumes: `SearchFeatureVectorV1`, policy artifact, finalized response.
- Produces: bounded shadow log (state-root file, capped entries/bytes); **records no source
  text and no full queries** (brief rule); `shadowApplied: true` + `shadowPolicyId` in
  diagnostics; production envelope unchanged.

**Steps:**
1. Failing test: shadow on → production response deep-equals shadow off (byte-identity);
   shadow log contains hashes, never content.
2. Implement; run over the tuning repos for a bounded period; manually review the largest
   disagreements (brief Phase 7 step; record in the evidence dir).

**Acceptance:** zero production impact; disagreement review documented.

**Phase 7 gate:** shadow receipts + disagreement review.

---

### Phase 8 — Tuning decision (brief Phase 8)

**Goal:** select a contender on tuning data before opening held-out.

#### Task 8.1: Contender comparison

**Files:**
- Create: `docs/evidence/ranking-v3-phase8-<date>/TUNING_DECISION_RECEIPT.md`
- Use: replay + metrics + gates from Phases 3–7.

**Interfaces:**
- Produces: mechanical comparison of (1) current policy B, (2) automatically tuned formula
  (Phase 3), (3) neural-only ordering (order-only baseline, computed from Phase 5 evidence —
  for comparison only, **not** a deployment contender), (4) deterministic-only (B), (5)
  learned_v3 (Phase 4+5), with the L3-style selection rules (quality deltas, protected
  non-inferiority margins, `insufficient_evidence` terminal) adapted and preregistered.

**Steps:**
1. Preregister the decision rule; run all contenders on tuning splits; record per-slice + gate
   results.
2. Select the contender; if none passes, record `insufficient_evidence` and stop (no held-out
   opening).

**Acceptance:** one contender selected or `insufficient_evidence` — before any held-out access.

---

### Phase 9 — Single held-out adjudication (brief Phase 9)

**Goal:** one opening of the sealed held-out split with preregistered thresholds.

**Prerequisite:** **fresh owner authorization to open held-out** — currently CLOSED (locked
conclusion #2). This plan explicitly requests that authorization at this gate; nothing in this
plan opens held-out evidence.

#### Task 9.1: Held-out adjudication

**Files:**
- Create: `docs/evidence/ranking-v3-phase9-<date>/HELDOUT_ADJUDICATION_RECEIPT.md`
- Use: `satori-track-o-heldout-opening.mjs` opening record mechanics (existing).

**Rules (locked):** open once; thresholds preregistered before opening; no post-opening
coefficient changes, task deletion, or query rewriting; complete receipt; terminal
accept/reject. A held-out failure retains the previous product policy (baseline B).

**Acceptance:** terminal receipt; held-out sealed again after adjudication.

---

### Phase 10 — Controlled rollout (brief Phase 10)

#### Task 10.1: `rankingPolicy` selection surface

**Files:**
- Modify: `packages/mcp/src/config.ts` + server config (new key `rankingPolicy`:
  `'baseline' | 'learned_v3' | 'shadow_learned_v3'`; default `'baseline'`; shadow mode must be
  default-off)
- Modify: `packages/mcp/src/core/search-execution.ts` (selection wiring; Task 4.4 seam)
- Test: `packages/mcp/src/core/ranking-policy-selector.test.ts` (new)

**Interfaces:**
- Consumes: Task 4.4 engine, Task 7.1 shadow recorder.
- Produces: config-validated selection; invalid artifact → `baseline` + truthful diagnostic
  (never silent).

**Steps:**
1. Failing tests: default is baseline; `learned_v3` without a valid artifact falls back with
  diagnostic; shadow selection requires explicit opt-in.
2. Implement; rerun.

**Acceptance:** selection surface honest and fail-safe.

#### Task 10.2: Rollback drill + binding integration

**Files:**
- Modify: `packages/mcp/src/core/search-result-set-identity.ts` (binding input gains
  `rankingPolicyArtifactHash`; existing `rankingPolicyIdentity` retained)
- Create: `docs/evidence/ranking-v3-phase10-<date>/ROLLBACK_DRILL_RECEIPT.md`
- Test: `packages/mcp/src/core/ranking-policy-selector.test.ts` (extend — continuation
  invalidation on artifact change)

**Steps:**
1. Drill: activate learned_v3 → swap artifact back to baseline → verify rollback requires only
   the artifact/config change (no rebuild, no reindex) and continuation handles invalidate via
   the extended binding.
2. Record receipt.

**Acceptance:** rollback drill passes; frozen-set binding covers policy artifact changes.

**Phase 10 gate:** rollout receipts; limited activation only after Phase 9 acceptance.

---

## 7. Non-goals / do-not list (binding)

1. No environment-variable "learning" — the only runtime inputs are generated, receipt-bound
   artifacts (brief §6).
2. No `docs_v2`, `TradingEntryVetoes`, or any client/repo-specific path in production logic
   (brief; locked conclusion #3).
3. No must-lane weight inflation to hide a recall problem — recall failures are reported via
   the Phase 2 recall gate, never tuned around.
4. No neural reranker bypass of eligibility, freshness, exact controls, or failure fallback.
5. No training on held-out queries; no opening held-out without Phase 9 authorization.
6. No macro-MRR-only optimization — slice gates (Task 6.2) are mandatory.
7. No implicit-click learning without position-bias correction; **no online learning in the
   first release** (brief's approval decision).
8. No automatic coefficient updates in production — artifacts are static, versioned, swapped
   explicitly.
9. No mixing Voyage/LateOn/Jina/ZeroEntropy calibrations.
10. No new reranker used to compensate for missing retrieval candidates.
11. No LambdaMART/tree-based ranker as the starting point (linear first, per brief).
12. No changes to the reranker-disabled path or to ranking for queries without `must:` outside
    the W-fix plan's own authority (locked conclusion #5).
13. No re-litigating closed evidence: R2/LANCEDB Phase 2 conclusions stand; Phase 3 is a
    baseline, not a rebuttal.
14. No nDCG-vs-MRR conflation across benchmark populations (locked conclusion #7).

## 8. Risks and open questions

1. **Held-out is closed** — Phase 9 depends on fresh owner authorization; until then V3 cannot
   reach production default status. Mitigation: everything up to Phase 8 is training-data-only.
2. **D32-v2 offline default coexistence** — a learned policy for the online path and the D32
   offline default are different service classes; the M0 storage decision (Task 4.3) must
   define per-class policy selection; no existing doc addresses multi-policy coexistence.
3. **W-fix timing** — Phase 0 freezes after the W-fix plan lands; the bounded `must:` lane
   changes union composition; V3 feature extraction must be defined against the post-W-fix
   union (verify `must_lane` pass id and retry prefixes `attempt:N/passId` in replay).
4. **Byte-identity risk** — Phase 1 instrumentation must not perturb ranking; the identity
   test (Task 1.4) is the gate; per-arm evidence attaches post-dedup only.
5. **Intent "probabilities"** — the brief asks for bounded confidence, not fabricated
   probabilities; Task 1.3 maps the existing 3-level `SearchIntentConfidence` + hard booleans
   to bounded numeric features and records that mapping in the feature schema; real
   probabilistic classifiers are out of scope for the first release.
6. **Calibration data scarcity** — Voyage score cross-query comparability and LateOn's raw
   `maxSimScore` distribution are uncharacterized; Phase 5 begins by measuring score
   distributions on graded tuning pairs before fitting.
7. **Resource gates** — learned_v3 runs inside the existing latency envelope (L3 frozen
   profile); feature extraction must be precomputed-at-scoring-time with bounded cost;
   reranker admission ceiling (50) unchanged.
8. **"Reconciled weakness report" provenance** — the quoted sentence is external to the repo;
   this plan records it as parent-brief-sourced (§3). If the source document exists, it should
   be attached to this plan before Phase 4 execution.
9. **Policy artifact trust chain** — artifact validation is by schema + range + SHA-256s of
   training manifest/code; the training pipeline itself must be reproducible (seeded,
   pinned script revisions — the R3 digest-pinning pattern applies to the training scripts).

## 9. Evidence index

| Claim | Where verified |
|---|---|
| Final-score formula | `packages/mcp/src/core/search-ranking-policy.ts:392` |
| Rerank blend (rank-only, inside fusionScore) | `packages/mcp/src/core/search-execution.ts:649-650` |
| Raw score discard | `packages/mcp/src/core/search-execution.ts:586` |
| RRF constants 100/60/10 + weight 1.0 | `packages/core/src/core/vector-candidate-fusion.ts:12`; `packages/mcp/src/core/search-constants.ts:1,21-22` |
| No calibration | `rg -i calibrat packages/` (3 unrelated hits) |
| Constants inventory + contracts | `/tmp/satori-review/rank-constants.md` |
| Reranker providers, failure fallback, frozen binding | `/tmp/satori-review/rank-reranker.md`; `packages/mcp/src/core/handlers.ts:5250-5285`; `search-result-set-identity.ts:37-56` |
| Eval pipeline (binary labels, sealed manifests, held-out mechanics) | `/tmp/satori-review/rank-evals.md`; `evals/search-ranking/` |
| Locked conclusions + closed held-out + D32 decision | `/tmp/satori-review/rank-reports.md`; `docs/evidence/lateon-d32-profile-activation-20260804/D32_DEFAULT_ACTIVATION_DECISION.md` |
| Intent classifier hard-boolean; feature availability matrix | `/tmp/satori-review/rank-intent.md`; `search-query-planning.ts:540-660`; `search-execution.ts:145-166` |
| Arms, fusion, no union recall measurement | `/tmp/satori-review/rank-fusion.md`; `vector-candidate-fusion.ts:60-118` |
| No `rankingPolicy` config today; binding carries `rankingPolicyIdentity` | verified at review base (rg across `packages/`) |
| W-fix plan in flight; "no ranking change without must:" constraint | `docs/superpowers/plans/2026-08-05-search-integrity-and-runtime-honesty.md` |

---

*End of plan. Phases are gated and independent; nothing in this document authorizes
implementation or the opening of held-out evidence. Each phase requires its own authorization
before execution.*
