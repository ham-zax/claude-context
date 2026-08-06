# Satori Ranking Policy V3 Fully Dispatch-Approved Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Dispatch only from the current sealed R0.1B or DX card-set manifest.

**Goal:** introduce an opt-in, qualification-gated ranking policy that adds a bounded deterministic residual and, when preregistered, a provider-derived admitted-slot permutation without changing eligibility, reranker admission, exact controls, failure fallback, or pagination semantics.

**Architecture:** the current production pipeline remains the built-in baseline. Learned mode freezes admission from the pre-rerank baseline order, applies one shared residual-policy implementation, and optionally applies a pure provider-derived permutation whose ordered sequence—not its score—is final. Artifacts, provider targets, evaluation executables, qualification receipts, and registry transitions are sealed before their corresponding evidence is opened.

**Tech stack:** TypeScript, Node.js, exact-file `node --import tsx --test` tests, existing Satori capture/replay/evaluation scripts, canonical JSON, SHA-256, append-only filesystem receipts, and the existing MCP/Core ranking pipeline.

## Global constraints

- Baseline remains the default; `learned_v3` is opt-in and requires an exact `activation_qualified` registry entry.
- Retrieval, eligibility, exact controls, reranker admission, failure fallback, grouping, disclosure, and frozen pagination remain deterministic contracts.
- Held-out evidence remains closed until fresh owner authorization and the sealed Wave-I protocol.
- No task may edit files outside its dispatch card. Each code-change card starts RED, makes the minimum change, finishes GREEN, commits once, and receives independent review.
- No post-opening source, artifact, model, provider-target, threshold, feature, contract, or evaluator changes are permitted.

---

## 1. Status and prerequisites

**Status:** investigation complete; planning gate. This document does not authorize
implementation. Each gate, wave, and task requires its own authorization before
execution. Held-out evidence is sealed; it opens only under fresh owner authorization
and the Wave-I protocol.

### 1.1 Gate-0 and Gate-1 bootstrap sequence

The execution base, provider-evidence target, and contract authorities are created in
this exact order:

```text
R0.0 merge and verify security hardening
→ R0.1A repair the search-quality fixture
→ R0.1V implement and seal the Gate-0 verifier and tuning-only capture wrapper
→ rerun or bind hardening acceptance to the resulting HEAD
→ R0.1 freeze the post-hardening, post-repair HEAD
→ R0.1B implement/seal the dispatch-card tool and generate cards for
  R0.2, R1.T0, R1.0, and R1.0B
→ R0.2 capture the tuning-only baseline from the frozen HEAD
→ R1.T0 implement/seal QualificationTargetV1 schema, canonicalization, and hash tooling
→ R1.0 issue QUALIFICATION_TARGET.json using the R1.T0 tool
→ R1.0B generate target-bound cards for
  R1.T1, R1.T2, R1.1–R1.5, and R1.6
→ R1.T1 implement/seal task-graph schema, validator, and expansion tooling
→ R1.T2 implement/seal contract validation and sealing tooling
→ R1.1–R1.4 write target-bound contracts and machine-readable indexes
→ R1.5 seal TASK_GRAPH.json and CONTRACT_SEAL.json
→ R1.6 generate Wave-A cards and the DB boundary-generator card
```

The fixture repair and Gate-0 tooling land before the freeze. `R0.1B` does not generate
R1.1–R1.6 directly because those cards cannot be grounded until R1.0 has produced the
exact target digest. Every card set includes both its target scope and the next
boundary-generator card; that generator remains nondispatchable until its sealed gate
receipt exists.

### 1.2 Hardening prerequisite and behavioral acceptance

The security-hardening integration (`integrate/security-hardening-20260805`) must be
merged and proven by behavior, not by branch name or commit-message grep. The
acceptance suite must demonstrate at least:

- indexing `/` is rejected;
- indexing the user home directory is rejected unless explicitly authorized;
- `.ssh`, `.aws`, and configured secret roots are rejected;
- `read_file` cannot read unpublished or unauthorized files;
- symlink and special-file cases fail closed;
- byte ceilings are enforced before whole-file allocation;
- shared-runtime context and authentication behavior match the accepted threat model;
- all external provider requests have bounded cancellation and deadline behavior.

The hardening integration commit must be an ancestor of the final frozen HEAD,
verified with `git merge-base --is-ancestor <integration-commit> HEAD`. The behavioral
receipt must carry `receipt.commitSha === frozen integration HEAD`. If it does not, run
the exact hardening acceptance suite at the final HEAD and issue a new receipt bound to
that HEAD; ancestry alone never substitutes for the behavioral rerun.

### 1.3 Prerequisites already established

- The search-integrity (W-fix) work is merged: bounded conjunctive `must:` retrieval
  with explicit warning states, untracked-file freshness, reranker timeout/retry
  bounds, continuation observability, inbound-coverage evidence.
- The deterministic search-quality fixture is RED at the current base (three stale
  seams) and is repaired by R0.1A before any freeze.
- The cross-repository held-out split (v2/v3 manifests) has no opening record; the
  LateOn track-O opening is a separate track and does not count.

### 1.4 Dispatch authority

Dispatch authority comes only from the latest unrevoked card-set manifest produced by
R0.1B, R1.0B, R1.6, or a named DX boundary task. Every card represents one dispatch
unit and binds the Task Interface Catalog entry in §7.5.

Card types:

- `code_change`
- `documentation`
- `evidence`
- `human_decision`
- `execution`

A `code_change` card requires:

```text
failing focused test
→ minimal implementation
→ passing focused test
→ one semantic commit
→ independent review
```

A `documentation`, `evidence`, or `execution` card requires:

```text
unmet-precondition verifier
→ task execution
→ validating verifier
→ immutable output receipt
```

A `human_decision` card requires:

```text
input checklist
→ owned decision artifact
→ canonical schema validation
→ digest receipt
```

DX may resolve line ranges against its bound `dispatchCommit`; it may not invent file
paths, APIs, commands, output names, graph nodes, or ownership. Those are fixed by §7.5
and the sealed task graph.

R0.1A, R0.1V, R0.1, and R0.1B are owner-authorized bootstrap tasks and are not
themselves card-generated. R1.0B and every later boundary generator are card-generated
by the immediately preceding card set.

## 2. Verified current baseline

Facts below were verified against the stated base commit. Line numbers are snapshots;
the authoritative anchor manifest is `SOURCE_ANCHORS.json`, generated by R0.1 at the
frozen HEAD.

### 2.1 The current deterministic score

`computeSearchCandidateFinalScore` (`packages/mcp/src/core/search-ranking-policy.ts`):

```ts
return (
    (input.fusionScore + input.lexicalScore)
    * input.pathMultiplier
    * input.changedFilesMultiplier
    * input.agentFitMultiplier
) + Math.min(
    SEARCH_ENTRYPOINT_OWNER_MAX_SCORE_BOOST,   // 0.35
    Math.max(0, input.entrypointOwnerScoreBoost),
);
```

The score is multiplicative in the multipliers. The learned policy is therefore a
bounded residual on the exact pre-rerank deterministic score, never a replacement of
the product formula.

### 2.2 The reranker contribution today

- Raw reranker scores are fetched by both providers and discarded at the call site
  (`search-execution.ts`, `rerankResults`; Voyage parses `relevance_score`; LateOn
  validates a finite `maxSimScore`).
- The reranker adds a fixed rank term inside `fusionScore`:
  `fusionScore += SEARCH_RERANK_WEIGHT * (1 / (SEARCH_RERANK_RRF_K + rank))`
  (weight 1.0, k 10).
- Retrieval fusion uses two further fixed RRF layers: k 100 (core arms) and k 60 (MCP
  multi-pass).
- No calibration exists anywhere; no nDCG or stage-survival measurement exists.

### 2.3 Constants and contracts

| Group | Value / location |
|---|---|
| Path-category multipliers | 39 values (13 categories × 3 scopes), `SCOPE_PATH_MULTIPLIERS` (`search-constants.ts:73`) |
| Agent-fit multipliers | 13 values, module-local in `search-ranking-policy.ts` |
| Entrypoint owner boost | 0.35 additive, intent-gated |
| Changed-files boost | 1.10, ≤50 changed files |
| RRF constants | core 100 / mcp 60 / rerank 10 + weight 1.0 — frozen for the compatibility contract (§4.2) |
| Candidate depth | `clamp(max(limit×8, 32), 80)` (`search-policy.ts`) |
| Lexical weight per intent | quoted 1.35, identifier 1.35, mixed 0.10/0.30, uncertain 0.60, semantic 0.00/0.18 |
| Staleness buckets | `STALENESS_THRESHOLDS_MS` (`search-constants.ts:47`) |
| Policy identity | `search_candidate_final_score_v2` |

Hardcoded contracts that remain outside any learned policy: `must:`/`exclude:`/`lang:`/
`path:` filtering with removal ledger; exact-symbol fast path and exact-pin rerank
skip (`shouldSkipRerankForExactPin`); source-freshness and fingerprint gates;
candidate/byte/timeout/memory ceilings; fail-closed reranker fallback; pagination and
disclosure limits; one immutable frozen ranked set; continuation never re-ranks.

### 2.4 Evaluation foundation

- Manifests: v2 (3 tuning + 3 held-out) and v3 (6 tuning + 6 held-out) with frozen
  revisions and tree SHA-256s; `tradingview_ratio` is tuning.
- Pipeline: capture with `mcp_replay_signals` → offline replay through frozen
  components → binary owner-match scoring.
- Adjudication: bootstrap resampling with frozen thresholds; sealed-contender replay;
  track-O held-out discipline (separate track).
- The search-quality fixture (`evals/search-quality/`) is the metric authority to
  extend: `FIXED_NOW`, `REQUIRED_LIMITS [1,3,5,10,20]`, hash-bound.

## 3. Normative invariants

1. Candidate membership and eligibility are owned before any residual or neural
   stage. The learned policy never changes retrieval, admission, or membership.
2. Exact identifiers, `must:` controls, configuration ownership, source freshness,
   publication authority, scope filtering, and no-answer behavior remain
   deterministic and fail closed.
3. Reranker admission is decided once, on the pre-rerank baseline order
   (`baselineAdmissionSet`). A residual crossing the admission cutoff (a) does not
   newly enter the provider request, (b) does not displace a baseline-admitted
   candidate, (c) cannot receive neural evidence, and (d) remains eligible for
   deterministic V3 ranking.
4. The neural stage permutes identities only within baseline-admitted positions. It
   never promotes an unadmitted candidate, restores a filtered candidate, or reorders
   continuation pages.
5. Exact-control ownership precedes residual scoring: when
   `shouldSkipRerankForExactPin` holds (`top.exactLexicalMatch && (exactMatchPinningEnabled
   || (must query && top.passesMatchedMust) || sole hit)`), the residual and the
   provider-derived permutation are both bypassed and the deterministic pre-rerank
   ordering is returned unchanged. A top satisfying `must:` alone never skips.
6. The W-fix integration and instrumentation must not change reranker-disabled
   behavior or ranking for queries without `must:`. An explicitly selected, qualified
   learned policy may change their ranking; eligibility, exact controls, freshness,
   scope, grouping, disclosure, and failure fallback stay unchanged.
7. RRF constants 100 and 60 are frozen in all modes. The reranker RRF constant 10 and
   weight 1.0 are baseline-mode compatibility behavior only; learned modes never apply
   that bucket.
8. One provider/model per qualification cycle. The fixed provider-evidence target is sealed
   before any tuning evidence is generated and cannot change afterward.
9. Qualification is mode-dependent: a `disabled` artifact has no provider and no
   qualified rerankers; a `provider_derived` artifact has exactly one qualified
   reranker matching the sealed target.
10. No unqualified artifact is loadable by product configuration. Product selection
    returns `learned_v3` only for an `activation_qualified` registry entry whose
    qualified scope matches the artifact mode. Provider-derived mode additionally
    requires an exact active provider/model/projection/configuration/request-contract
    match; disabled mode requires no active provider identity.
11. Registry versions are append-only and immutable; rollback and revocation are new
    transitions, never mutation or deletion; `current` points at the current registry snapshot
    (which may contain a pending candidate while the product still selects an older active artifact).
12. Held-out acceptance and held-out rejection both terminate the pending entry; a
    pending entry can never block a later qualification cycle for its scope.
13. After held-out opening: no source-code, model, artifact, threshold, contract,
    feature, or evaluator changes; no deletion or rewriting of evidence. Permitted:
    preregistered adjudication; append-only registry transitions; configuration-only
    selection among baseline and already sealed, activation-qualified artifact hashes;
    append-only rollout receipts for every selection.
14. Continuation performs no new retrieval, scoring, or reranking; pagination exposes
    one immutable ranked set; policy identity changes invalidate continuation handles.
15. Repository name, task ID, absolute path, user identity, candidate identity hash,
    owner-family identity hash, and provider hash are never scoring features.
16. No environment-variable learning, no online or click learning, no automatic
    coefficient updates, no macro-only optimization, no LambdaMART/tree rankers, no
    cross-provider calibration mixing, no reranker-as-recall-repair, no repository-
    local policy artifacts, no feature-vector dumps in public responses, no
    production shadow selector.
17. Same-UID trust boundary accepted: file ownership and mode bits are the authority
    for receipts and registry state. If same-UID processes are later treated as
    adversarial, receipts require signatures or a separate operating-system identity
    — a recorded decision, never silent.

## 4. Runtime architecture

### 4.1 Canonical execution order

The canonical ranking-policy order is:

```text
eligibility and exact deterministic controls
→ pre-rerank baseline scoring and ordering
→ baseline reranker-admission snapshot
→ deterministic evidence assembly
→ bounded residual scoring
→ optional provider-derived slot permutation
→ grouping, disclosure, and frozen pagination
```

Definitions:

```ts
preRerankBaselineScore: number;

deterministicV3Score =
    preRerankBaselineScore
    + clamp(
        dot(weights, normalizedFeatures),
        -maximumResidual,
        maximumResidual,
    );
```

`preRerankBaselineScore` is the deterministic score before the existing reranker
rank-RRF contribution.

`baselineModeFinalScore` is the score produced by the current baseline product
pipeline after its existing reranker contribution.

A zero residual proves only equality with `preRerankBaselineScore`. It does not
reproduce the complete reranker-enabled product pipeline.

Full product-envelope identity is required only for baseline mode and for
instrumentation that claims no behavior change.

### 4.2 Runtime modes

#### Baseline mode

```text
eligibility
→ current deterministic scoring
→ current reranker admission
→ current provider call when configured
→ fixed reranker contribution: 1 / (10 + rank), weight 1.0
→ current final ordering
```

Baseline mode remains byte-compatible with current production behavior.

#### Learned mode: disabled

```text
eligibility
→ pre-rerank baseline scoring and ordering
→ freeze baselineAdmissionSet
→ deterministic evidence assembly
→ bounded residual scoring
→ no ranking-provider call
→ no fixed reranker RRF contribution
→ deterministic V3 sequence is final
```

#### Learned mode: provider_derived

```text
eligibility
→ pre-rerank baseline scoring and ordering
→ freeze baselineAdmissionSet
→ deterministic evidence assembly
→ bounded residual scoring
→ call the exact preregistered provider/model
→ validate the complete provider response
→ permute identities only within baseline-admitted positions
→ no fixed reranker RRF contribution
→ post-provider sequence is final
```

Any timeout, provider error, malformed response, duplicate/omitted/foreign identity,
non-finite score, or gate rejection discards the detached provider result and preserves
the pre-provider deterministic V3 sequence byte-for-byte. No partial permutation is
observable; diagnostics truthfully record `fallback_deterministic`. Baseline mode keeps
its existing baseline failure behavior unchanged.

RRF constants 100 and 60 remain frozen in all modes.

The reranker RRF constant 10 and weight 1.0 are baseline-mode compatibility behavior
only. Learned modes never apply that bucket.

### 4.3 Final-order authority

The deterministic V3 score is not modified by the provider-derived permutation.

The provider-derived stage changes the authoritative candidate sequence, not candidate
scores.

After provider-derived permutation:

- the ordered candidate sequence is the final ranking authority;
- no downstream component may sort those candidates again by `finalScore` or
  `deterministicV3Score`;
- grouping and disclosure preserve the sequence;
- replay records and reproduces the sequence;
- pagination freezes the sequence;
- continuation never re-ranks or score-sorts the sequence;
- diagnostics may expose both deterministic score and final rank, but must not imply
  that the deterministic score caused the provider-derived rank.

Use an explicit internal representation:

```ts
interface RankedCandidateV3 {
    candidateId: string;
    deterministicV3Score: number;
    postPolicyRank: number; // one-based
}
```

`postPolicyRank` is one-based, unique, and contiguous from `1..N`. Array position
`i` must carry `postPolicyRank === i + 1`; disagreement, gaps, duplicates, or zero/negative
ranks are rejected rather than repaired. The authoritative ordered array and
`postPolicyRank` therefore form one validated representation.

Tests must prove that no score-based sort can undo a provider-derived permutation.

### 4.4 Shared ranking-policy application library (D7)

D7 is created before Wave E and is the only implementation of residual scoring, neural
evidence normalization, pure gate evaluation, admitted-slot permutation, and final
sequence construction. E2, G1/G2, and G6B import it unchanged. H3/H4 execute it through
G6B's sealed replay entrypoints. No evaluation-only or runtime-only duplicate is
permitted.

Dependencies: A3, A4, A5, A12, R1.0, R1.1, R1.2, and R1.4. Tests use synthetic
exact-contract fixtures; B9 raw provider evidence remains an E2 input, not a D7 build
dependency.

Creates exclusively:

- `packages/mcp/src/core/ranking-policy-v3.ts`
- `packages/mcp/src/core/neural-ranking-evidence.ts`
- `packages/mcp/src/core/neural-ranking-gate.ts`
- `packages/mcp/src/core/provider-slot-permutation.ts`
- matching exact-file tests

A3 owns only `ValidatedRerankResponseV1` parsing and complete-response validation in
`rerank-evidence.ts`. A12 owns canonical provider-request construction. D7 consumes
those outputs and alone computes percentiles, margins, gate decisions, and permutations.

```ts
interface ValidatedRerankResponseV1 {
    schemaVersion: "validated_rerank_response_v1";
    providerKey: string;
    rerankerIdentity: string;
    rerankerProjectionIdentity: string;
    providerConfigurationDigest: string;
    providerRequestContractSha256: string;
    canonicalRequestSha256: string;
    requestCandidateIds: readonly string[];
    results: readonly {
        candidateId: string;
        rank: number;
        rawScore: number;
    }[];
}

interface NeuralRankingEvidenceV1 {
    schemaVersion: "neural_ranking_evidence_v1";
    candidateId: string;
    providerKey: string;
    rank: number;
    rawScore: number;
    withinQueryPercentile: number;
    candidateToTopMargin: number;
    topToSecondMargin: number;
}

interface DeterministicV3ScoreInput {
    preRerankBaselineScore: number;
    normalizedFeatures: readonly number[];
    weights: readonly number[];
    maximumResidual: number;
}

interface DeterministicV3ScoreResult {
    residual: number;
    deterministicV3Score: number;
}

type NeuralGateDecision =
    | { decision: "apply" }
    | {
        decision: "skip";
        reason:
            | "mode_disabled"
            | "exact_control"
            | "insufficient_margin"
            | "insufficient_candidates";
    }
    | {
        decision: "fallback_deterministic";
        reason:
            | "provider_mismatch"
            | "invalid_response"
            | "identity_mismatch"
            | "non_finite_score";
    };

interface ProviderSlotPermutationInput {
    deterministicOrder: readonly RankedCandidateV3[];
    baselineAdmissionIds: readonly string[];
    providerOrder: readonly string[];
}

function scoreDeterministicV3(
    input: DeterministicV3ScoreInput,
): DeterministicV3ScoreResult;

function buildNeuralRankingEvidence(
    response: ValidatedRerankResponseV1,
): readonly NeuralRankingEvidenceV1[];

type NeuralGateInput =
    | {
        policy: { mode: "disabled" };
        target: QualificationTargetV1;
        exactControlOwnsResult: boolean;
        baselineAdmissionIds: readonly string[];
    }
    | {
        policy: Extract<NeuralReorderPolicy, { mode: "provider_derived" }>;
        target: FixedProviderTargetV1;
        suppliedIdentity: QualifiedRerankerV1;
        response: ValidatedRerankResponseV1;
        evidence: readonly NeuralRankingEvidenceV1[];
        exactControlOwnsResult: boolean;
        baselineAdmissionIds: readonly string[];
    };

function evaluateNeuralGate(input: NeuralGateInput): NeuralGateDecision;
function applyProviderSlotPermutation(
    input: ProviderSlotPermutationInput,
): RankedCandidateV3[];
```

A disabled artifact may bind either a `providerTarget: "none"` or a
`providerTarget: "fixed"` target digest for provenance, but it contains no provider
behavior and the pure gate returns `mode_disabled` without reading provider evidence.
A provider-derived artifact requires `FixedProviderTargetV1`.

`applyProviderSlotPermutation` rejects duplicates, omissions, foreign IDs, rank gaps,
and any provider order that is not a complete permutation of the admitted IDs. It emits
one-based contiguous `postPolicyRank` values.

### 4.5 The neural gate is pure

The neural confidence gate validates only:

- artifact execution mode;
- the preregistered provider target;
- supplied provider, model, projection, configuration, and request-contract identities;
- complete candidate identity accounting;
- complete finite provider scores;
- minimum candidate count;
- normalized top-to-second margin;
- exact-control ownership;
- membership in `baselineAdmissionSet`;
- admitted-slot confinement.

The pure gate must not read the qualification registry and must not require an
`activation_qualified` receipt.

Production qualification is enforced before the gate can be reached by:

- F2 registry loading;
- F6 policy selection;
- G4 startup/runtime construction.

Offline replay supplies the sealed provider target directly and does not claim that
the target is production-activated.

The normalized margin is `(topScore - secondScore) / max(ε, topScore - bottomScore)`
with ε and the full edge-case semantics (score direction, minimum candidate count ≥ 3,
all-equal scores, two-candidate behavior, tie precision and canonical rounding, NaN /
infinity / negative-denominator handling, order-vs-score contradiction) sealed in R1.2.

## 5. Evidence, feature, artifact, and registry contracts

### 5.1 Evidence contracts

`DeterministicRankingEvidenceV1` (schema `search_ranking_evidence_v1`):
`candidateId`, `baselineScore` (the `preRerankBaselineScore`), retrieval (explicit
stage ranks + per-pass RRF contributions), candidate, query groups. Available after
eligibility, pre-rerank baseline scoring, and the immutable admission snapshot, but
before residual scoring or any provider request/application. The residual feature
vector is built from deterministic evidence only.

`NeuralRankingEvidenceV1` (schema `neural_ranking_evidence_v1`): `candidateId`,
`providerKey`, `rank`, `rawScore`, `withinQueryPercentile`, `candidateToTopMargin`,
`topToSecondMargin`. Available only after a complete validated provider response;
consumed exclusively by the neural policy and the admitted-slot permutation stage.

One evidence order is used everywhere:

```text
eligibility
→ pre-rerank baseline scoring/order
→ admission snapshot
→ deterministic evidence assembly
→ residual
→ optional provider permutation
```

### 5.2 Feature contract

`search_features_v1`: fixed ordered numeric vector with missing indicators,
explicit one-hot and interaction features (test-path × test-intent,
test-path × implementation-intent, docs-path × docs-route,
generated × explicit-generated-or-path-intent), explicit stage ranks
(`rawDenseRank?`, `rawLexicalRank?`, `rawFallbackLexicalRank?`, `coreFusionRank?`,
`mcpUnionRank?`, `postEligibilityRank?`, `rerankerAdmissionRank?`), and the bounded
confidence mapping from the existing 3-level intent confidence and hard booleans
(never fabricated probabilities). Forbidden features: repository name, task ID,
absolute paths, user identity, candidate identity hash, owner-family identity hash,
provider hash. No feature may change deterministic eligibility.

### 5.3 Residual models, fold contenders, and final policy artifact

Wave-E comparison uses a mode-neutral residual model. It never interprets one final
artifact under two modes.

```ts
interface NormalizationContractV1 {
    schemaVersion: "ranking_normalization_contract_v1";
    featureOrder: readonly string[];
    means: readonly number[];
    scales: readonly number[];
    missingValuePolicy: "indicator_zero_fill";
}

type E3SelectionReceiptV1 =
    | {
        schemaVersion: "ranking_e3_selection_receipt_v1";
        receiptType: "e3_selection";
        outcome: "selected_disabled";
        selectedFoldContenderSha256: string;
        qualificationTargetSha256: string;
        e3InputSealSha256: string;
        decisionContractSha256: string;
    }
    | {
        schemaVersion: "ranking_e3_selection_receipt_v1";
        receiptType: "e3_selection";
        outcome: "selected_provider_derived";
        selectedFoldContenderSha256: string;
        qualificationTargetSha256: string;
        providerRequestContractSha256: string;
        e3InputSealSha256: string;
        decisionContractSha256: string;
    };

interface E3InsufficientEvidenceReceiptV1 {
    schemaVersion: "ranking_e3_insufficient_evidence_receipt_v1";
    receiptType: "e3_insufficient_evidence";
    outcome: "insufficient_evidence";
    qualificationTargetSha256: string;
    e3InputSealSha256: string;
    decisionContractSha256: string;
    missingEvidenceCodes: readonly string[];
}

interface E3LearnedNotJustifiedReceiptV1 {
    schemaVersion: "ranking_e3_learned_not_justified_receipt_v1";
    receiptType: "e3_learned_not_justified";
    outcome: "learned_not_justified";
    qualificationTargetSha256: string;
    e3InputSealSha256: string;
    decisionContractSha256: string;
    groupedComparatorReceiptSha256: string;
    materialWinEvidenceSha256: string;
}

type E3OutcomeReceiptV1 =
    | E3SelectionReceiptV1
    | E3InsufficientEvidenceReceiptV1
    | E3LearnedNotJustifiedReceiptV1;

type GroupedComparatorInputStateV1 =
    | {
        status: "available";
        comparatorReceiptSha256: string;
    }
    | {
        status: "unavailable_optional";
    }
    | {
        status: "unavailable_required";
    };

interface E3InputSealV1 {
    schemaVersion: "ranking_e3_input_seal_v1";
    qualificationTargetSha256: string;
    decisionContractSha256: string;
    foldScoreReceiptSha256s: readonly string[];
    groupedComparator: GroupedComparatorInputStateV1;
    sealedAt: string;
}

interface ResidualModelV1 {
    schemaVersion: "ranking_residual_model_v1";
    featureSchema: "search_features_v1";
    createdFromCommit: string;
    trainingFoldManifestSha256: string;
    trainingCodeSha256: string;
    trainingContractSha256: string;
    normalization: NormalizationContractV1;
    weights: readonly number[];
    residualBounds: { maximumResidual: number };
}

type FoldContenderDescriptorV1 =
    | {
        schemaVersion: "ranking_fold_contender_v1";
        mode: "disabled";
        residualModelSha256: string;
        qualificationTargetSha256: string;
        evaluationFoldManifestSha256: string;
    }
    | {
        schemaVersion: "ranking_fold_contender_v1";
        mode: "provider_derived";
        residualModelSha256: string;
        qualificationTargetSha256: string;
        providerRequestContractSha256: string;
        evaluationFoldManifestSha256: string;
    };
```

D6 owns exact-key parsers and canonicalizers for all `E3OutcomeReceiptV1` variants.
D2/E1 produce `ResidualModelV1`. E2 creates canonical descriptors for `disabled` and,
only when R1.0 permits it, `provider_derived`. E3 selects among descriptor results. E4
alone serializes the final `RankingPolicyV3Artifact`. D3 independently verifies both
residual-model and final-artifact forms.

```ts
type NeuralReorderPolicy =
    | { mode: "disabled" }
    | {
        mode: "provider_derived";
        providerKey: string;
        minimumCandidates: number;
        minimumNormalizedTopToSecondMargin: number;
    };

type RankingApplicabilityV1 =
    | {
        mode: "disabled";
        baselinePolicyIdentity: "search_candidate_final_score_v2";
        featureContractSha256: string;
        runtimeScoringContractId: string;
        retrievalContractId: string;
        supportedProviderKeys: readonly [];
    }
    | {
        mode: "provider_derived";
        baselinePolicyIdentity: "search_candidate_final_score_v2";
        featureContractSha256: string;
        runtimeScoringContractId: string;
        retrievalContractId: string;
        supportedProviderKeys: readonly [string];
        rerankerProjectionIdentity: string;
        providerConfigurationDigest: string;
        providerRequestContractSha256: string;
    };

interface RankingPolicyV3Artifact {
    schemaVersion: "ranking_policy_v3";
    policyId: "search_ranking_policy_v3";
    featureSchema: "search_features_v1";
    createdFromCommit: string;
    trainingManifestSha256: string;
    trainingCodeSha256: string;
    trainingContractSha256: string;
    qualificationTargetSha256: string;
    residualModelSha256: string;
    normalization: NormalizationContractV1;
    weights: readonly number[];
    residualBounds: { maximumResidual: number };
    neuralReorderPolicy: NeuralReorderPolicy;
    applicability: RankingApplicabilityV1;
}
```

The artifact contains no self-hash and no quality receipt; runtime SHA-256 is computed
over canonical bytes. E4 serializes only the E3-selected mode. Disabled mode has no
provider fields, even when it binds a fixed provider target digest for provenance.
Provider-derived mode must exactly match the sealed target's provider, projection,
and configuration fields, plus the separately sealed R1.2 request-contract digest. A5 owns parsers and
canonicalizers for all three forms: `ResidualModelV1`, `FoldContenderDescriptorV1`, and
`RankingPolicyV3Artifact`.

### 5.4 Qualification registry

```ts
type ServiceClass = "online" | "offline_linux_x64";
type SelectedArtifactMode = "disabled" | "provider_derived";

interface QualifiedRerankerV1 {
    providerKey: string;
    rerankerIdentity: string;
    rerankerProjectionIdentity: string;
    providerConfigurationDigest: string;
    providerRequestContractSha256: string;
}

interface QualificationEntryKeyV1 {
    artifactSha256: string;
    serviceClass: ServiceClass;
    qualificationScopeKey: string;
}

interface RankingPolicyQualificationRegistryV1 {
    schemaVersion: "ranking_policy_qualification_registry_v1";
    entries: readonly QualificationRegistryEntryV1[];
}

interface QualificationRegistryEntryBaseV1 extends QualificationEntryKeyV1 {
    qualificationTargetSha256: string;
    selectedArtifactMode: SelectedArtifactMode;
    qualifiedRerankers: readonly QualifiedRerankerV1[];
    offlineQualificationReceiptSha256: string;
}

type QualificationRegistryEntryV1 =
    | QualificationRegistryEntryBaseV1 & {
        status: "pending_heldout";
    }
    | QualificationRegistryEntryBaseV1 & {
        status: "activation_qualified";
        heldoutAcceptanceReceiptSha256: string;
    }
    | QualificationRegistryEntryBaseV1 & {
        status: "revoked";
        terminalEvidence:
            | {
                reason: "heldout_rejected";
                heldoutRejectionReceiptSha256: string;
            }
            | {
                reason: "administrative_revocation";
                revocationAuthorizationReceiptSha256: string;
            };
    };
```

`qualificationScopeKey = sha256(canonicalJSON({ serviceClass,
qualificationTargetSha256, selectedArtifactMode, qualifiedRerankers }))`. For disabled
mode, `qualifiedRerankers` is empty. Provider-derived mode has exactly one entry matching
every field of `FixedProviderTargetV1`.

The logical entry key is the canonical tuple `(artifactSha256, serviceClass,
qualificationScopeKey)`. Duplicate keys are rejected. Entries are sorted
lexicographically by the UTF-8 bytes of that tuple. Creating a pending entry adds one
new logical key. `pending_heldout → activation_qualified`, `pending_heldout → revoked`,
and `activation_qualified → revoked` replace exactly one logical entry in a new
snapshot; they never append a second state for the same key. Requalifying a revoked
artifact/scope requires a new artifact hash.

Storage remains append-only under `versions/`, `receipts/`, and the atomic `current`
pointer. The canonical empty genesis snapshot is
`{"schemaVersion":"ranking_policy_qualification_registry_v1","entries":[]}`. F9
initializes it only in an empty trusted root and otherwise verifies the existing
snapshot.

```ts
interface RegistryWriterRootV1 {
    trustedRootAbsolutePath: string;
    contractSealSha256: string;
    implementationSealSha256: string;
    issuerIdentity: string;
}

interface RegistryInitializationInputV1 extends RegistryWriterRootV1 {
    expectedRootState: "empty";
}

interface CreatePendingHeldoutInputV1 extends RegistryWriterRootV1 {
    expectedRegistrySha256: string;
    artifactSha256: string;
    serviceClass: ServiceClass;
    qualificationScopeKey: string;
    offlineQualificationReceipt: OfflineQualificationReceiptV1;
}

interface ActivatePendingInputV1 extends RegistryWriterRootV1 {
    expectedRegistrySha256: string;
    artifactSha256: string;
    serviceClass: ServiceClass;
    qualificationScopeKey: string;
    heldoutAcceptanceReceipt: HeldoutAcceptanceReceiptV1;
}

interface RejectPendingInputV1 extends RegistryWriterRootV1 {
    expectedRegistrySha256: string;
    artifactSha256: string;
    serviceClass: ServiceClass;
    qualificationScopeKey: string;
    heldoutRejectionReceipt: HeldoutRejectionReceiptV1;
}

interface RevokeArtifactInputV1 extends RegistryWriterRootV1 {
    expectedRegistrySha256: string;
    artifactSha256: string;
    serviceClass: ServiceClass;
    qualificationScopeKey: string;
    revocationAuthorizationReceipt: RevocationAuthorizationReceiptV1;
}

interface RegistryInitializationResult {
    registry: RankingPolicyQualificationRegistryV1;
    registrySha256: string;
    receipt: RegistryInitializationReceiptV1;
    receiptSha256: string;
}

interface RegistryTransitionResult {
    registry: RankingPolicyQualificationRegistryV1;
    registrySha256: string;
    receipt: RegistryTransitionReceiptV1;
    receiptSha256: string;
}

function initializeQualificationRegistry(
    input: RegistryInitializationInputV1,
): RegistryInitializationResult;
function createPendingHeldoutVersion(
    input: CreatePendingHeldoutInputV1,
): RegistryTransitionResult;
function activatePendingVersion(
    input: ActivatePendingInputV1,
): RegistryTransitionResult;
function rejectPendingVersion(
    input: RejectPendingInputV1,
): RegistryTransitionResult;
function revokeArtifact(
    input: RevokeArtifactInputV1,
): RegistryTransitionResult;
```

Every transition verifies the expected registry digest, logical key, target binding,
and exact parsed triggering receipt; performs the deterministic add/replacement; writes
content-addressed files with `O_CREAT|O_EXCL`; fsyncs; atomically replaces `current`;
and reads back through F0. Concurrency, live-lock, crashed-owner, malformed-lock,
directory-replacement, and same-previous-digest races are focused-test requirements.

### 5.5 Receipt schemas

A11Q owns selected-mode, offline-qualification, and registry receipt schemas. A11H owns held-out and rollout-chain
receipt schemas. Unknown keys are rejected and canonical round trips must be stable.

```ts
interface PostG7ReceiptBaseV1 {
    schemaVersion: string;
    receiptType: string;
    issuedAt: string;
    issuerIdentity: string;
    contractSealSha256: string;
    implementationSealSha256: string;
}

interface ArtifactReceiptBaseV1 extends PostG7ReceiptBaseV1 {
    artifactSha256: string;
    qualificationTargetSha256: string;
    serviceClass: ServiceClass;
    selectedArtifactMode: SelectedArtifactMode;
    qualificationScopeKey: string;
    qualifiedRerankers: readonly QualifiedRerankerV1[];
}

interface SelectedModeReplayReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "selected_mode_replay_receipt_v1";
    receiptType: "selected_mode_replay";
    mode: SelectedArtifactMode;
    replayManifestSha256: string;
    replayResultsSha256: string;
    derivedNeuralEvidenceSha256: string | null;
}

interface BaselineReplayReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "baseline_replay_receipt_v1";
    receiptType: "baseline_replay";
    replayManifestSha256: string;
    replayResultsSha256: string;
    productEnvelopeSha256: string;
}

interface SliceGateReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "slice_gate_receipt_v1";
    receiptType: "slice_gate";
    selectedModeReplayReceiptSha256: string;
    sliceResultSha256: string;
    passed: boolean;
    failedSliceCodes: readonly string[];
}

interface CounterfactualGateReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "counterfactual_gate_receipt_v1";
    receiptType: "counterfactual_gate";
    selectedModeReplayReceiptSha256: string;
    counterfactualResultSha256: string;
    passed: boolean;
    failureCodes: readonly string[];
}

interface ResourceGateReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "resource_gate_receipt_v1";
    receiptType: "resource_gate";
    selectedModeReplayReceiptSha256: string;
    resourceHarnessResultSha256: string;
    environmentIdentitySha256: string;
    passed: boolean;
    failureCodes: readonly string[];
}

interface OfflineQualificationReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "offline_qualification_receipt_v1";
    receiptType: "offline_qualification";
    registryReadyReceiptSha256: string;
    expectedRegistrySha256: string;
    groupedComparator: "available" | "unavailable" | "not_required";
    selectedModeReplayReceiptSha256: string;
    baselineReplayReceiptSha256: string;
    sliceGateReceiptSha256: string;
    counterfactualGateReceiptSha256: string;
    resourceGateReceiptSha256: string;
    tuningManifestSha256: string;
    corpusManifestSha256: string;
    verdict: "offline_qualified";
}

interface OfflineQualificationRejectionReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "offline_qualification_rejection_receipt_v1";
    receiptType: "offline_qualification_rejection";
    registryReadyReceiptSha256: string;
    expectedRegistrySha256: string;
    groupedComparator: "available" | "unavailable" | "not_required";
    selectedModeReplayReceiptSha256: string;
    failedGateReceiptSha256: string;
    verdict: "rejected";
}

interface OfflineQualificationInsufficientEvidenceReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "offline_qualification_insufficient_receipt_v1";
    receiptType: "offline_qualification_insufficient";
    registryReadyReceiptSha256: string;
    expectedRegistrySha256: string;
    groupedComparator: "available" | "unavailable" | "not_required";
    selectedModeReplayReceiptSha256: string | null;
    missingEvidenceCodes: readonly string[];
    verdict: "insufficient_evidence";
}

interface RegistryInitializationReceiptV1 extends PostG7ReceiptBaseV1 {
    schemaVersion: "registry_initialization_receipt_v1";
    receiptType: "registry_initialization";
    trustedRootIdentitySha256: string;
    previousRegistrySha256: null;
    newRegistrySha256: string;
    transitionKind: "initialize_genesis";
}

interface RegistryReadyReceiptV1 extends PostG7ReceiptBaseV1 {
    schemaVersion: "registry_ready_receipt_v1";
    receiptType: "registry_ready";
    trustedRootIdentitySha256: string;
    currentRegistrySha256: string;
    initializationReceiptSha256?: string;
    platformCapabilityDecisionSha256: string;
}

interface RegistryTransitionReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "registry_transition_receipt_v1";
    receiptType: "registry_transition";
    transitionKind:
        | "create_pending_heldout"
        | "activate_pending"
        | "reject_pending"
        | "administrative_revoke";
    previousRegistrySha256: string;
    newRegistrySha256: string;
    entryKey: QualificationEntryKeyV1;
    entryBeforeSha256: string | null;
    entryAfterSha256: string;
    triggeringReceiptSha256: string;
    previousReceiptSha256: string | null;
    previousTransitionReceiptSha256: string | null;
    transitionChainSha256: string;
}

`transitionChainSha256` is calculated exactly as:

```text
sha256(canonicalJSON({
  previousTransitionReceiptSha256,
  transitionKind,
  previousRegistrySha256,
  newRegistrySha256,
  triggeringReceiptSha256
}))
```

`previousReceiptSha256` is the immediate semantic predecessor in the I0→I4/I3R chain;
for I4 and I3R it must equal the accepted or rejected I3 receipt digest. The separate
`previousTransitionReceiptSha256` links registry-transition history and is nullable
only when no earlier registry transition exists.

interface RevocationAuthorizationReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "revocation_authorization_receipt_v1";
    receiptType: "revocation_authorization";
    reasonCode: string;
    ownerDecisionSha256: string;
}

interface OwnerAuthorizationReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "owner_authorization_receipt_v1";
    receiptType: "owner_authorization";
    heldoutManifestSha256: string;
    h10RegistrySha256: string;
    authorizationDecisionSha256: string;
}

interface HeldoutOpeningRecordV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "heldout_opening_record_v1";
    receiptType: "heldout_opening";
    previousReceiptSha256: string;
    ownerAuthorizationReceiptSha256: string;
    heldoutManifestSha256: string;
    verifiedRegistrySha256: string;
    executableManifestSha256: string;
}

interface HeldoutExecutionReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "heldout_execution_receipt_v1";
    receiptType: "heldout_execution";
    previousReceiptSha256: string;
    openingRecordSha256: string;
    heldoutManifestSha256: string;
    resultsSha256: string;
    executionCommandSha256: string;
}

interface HeldoutAcceptanceReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "heldout_acceptance_receipt_v1";
    receiptType: "heldout_acceptance";
    previousReceiptSha256: string;
    executionReceiptSha256: string;
    decision: "accepted";
    adjudicationResultSha256: string;
}

interface HeldoutRejectionReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "heldout_rejection_receipt_v1";
    receiptType: "heldout_rejection";
    previousReceiptSha256: string;
    executionReceiptSha256: string;
    decision: "rejected";
    adjudicationResultSha256: string;
}

interface RolloutSelectionReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "rollout_selection_receipt_v1";
    receiptType: "rollout_selection";
    previousReceiptSha256: string;
    fromSelection: "baseline" | "learned_v3";
    toSelection: "baseline" | "learned_v3";
    selectedArtifactSha256: string | null;
    configurationDigest: string;
}

interface RollbackDrillReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "rollback_drill_receipt_v1";
    receiptType: "rollback_drill";
    previousReceiptSha256: string;
    learnedSelectionReceiptSha256: string;
    baselineSelectionReceiptSha256: string;
    reselectionReceiptSha256: string;
    staleContinuationProofSha256: string;
}

interface LimitedActivationReceiptV1 extends ArtifactReceiptBaseV1 {
    schemaVersion: "limited_activation_receipt_v1";
    receiptType: "limited_activation";
    previousReceiptSha256: string;
    rollbackDrillReceiptSha256: string;
    activationConfigurationDigest: string;
}
```

Only A11-managed post-G7 qualification, registry, held-out, rollout, rollback, and
activation receipts require both seal digests. Gate-0 and Gate-1 receipts bind only the
authorities that exist at issuance. `I0 → I1 → I2 → I3 → (I4 | I3R)` is enforced by
exact `previousReceiptSha256` equality; acceptance and rejection are mutually exclusive
for one opening record. For `activate_pending` and `reject_pending`, both
`previousReceiptSha256` and `triggeringReceiptSha256` equal the accepted or rejected I3
receipt digest. For `create_pending_heldout`, `previousReceiptSha256` is null and the
trigger is the H9 offline-qualification receipt. For administrative revocation,
`previousReceiptSha256` equals the revocation-authorization receipt digest. A11Q tests
these transition-specific relationships rather than merely checking that both fields
are syntactically valid hashes.

### 5.6 Machine-readable authority schemas

The following objects are normative contracts, not filenames whose shape is delegated
to a card agent.

R1.T1 owns the graph and gate schemas:

```ts
interface GateReceiptV1 {
    schemaVersion: "ranking_v3_gate_receipt_v1";
    gateId: string;
    taskGraphSha256: string;
    prerequisiteReceiptIndexSha256: string;
    resolvedConditions: readonly {
        edgeKind: "hard" | "contract_condition" | "receipt_outcome";
        requires: string;
        authoritySha256: string;
        matchedValue: string | null;
    }[];
    verdict: "ready" | "blocked" | "terminal";
}
```

R1.T2 owns contract-index and seal schemas:

```ts
interface ContractIndexEntryV1 {
    kind: "feature" | "training" | "decision" | "activation";
    contractPath: string;
    indexPath: string;
    contractSha256: string;
    indexSha256: string;
    qualificationTargetSha256: string;
}

interface ContractIndexV1 {
    schemaVersion: "ranking_v3_contract_index_v1";
    entries: readonly ContractIndexEntryV1[];
}

interface ContractSealV1 {
    schemaVersion: "ranking_v3_contract_seal_v1";
    planSha256: string;
    qualificationTargetSha256: string;
    contractIndexSha256: string;
    taskGraphSha256: string;
    baselineCommit: string;
    baselineTreeSha256: string;
    sealedAt: string;
}
```

G6B owns and parses the qualification-cycle and DH input schemas; G6C imports the DH
input type and owns the pre-held-out and activation-cycle schemas:

```ts
interface DhInputIndexV1 {
    schemaVersion: "ranking_v3_dh_input_index_v1";
    artifactPath: string;
    artifactSha256: string;
    qualificationTargetPath: string;
    qualificationTargetSha256: string;
    providerRequestContractPath: string | null;
    providerRequestContractSha256: string | null;
    activationContractIndexPath: string;
    activationContractIndexSha256: string;
    contractSealPath: string;
    contractSealSha256: string;
    implementationSealPath: string;
    implementationSealSha256: string;
    corpusManifestPath: string;
    corpusManifestSha256: string;
    tuningManifestPath: string;
    tuningManifestSha256: string;
    registryRoot: string;
    lockfileAuthorityPath: string;
    lockfileAuthoritySha256: string;
}

interface CommandInputBindingV1<CardId extends string> {
    cardId: CardId;
    commandInputDescriptorPath: string;
    commandInputDescriptorSha256: string;
    outputDirectory: string;
}

`commandInputDescriptorSha256` is the SHA-256 of a canonical descriptor containing
only immutable prerequisite paths, their content digests, their authority-receipt
digests, the exact CLI arguments, and the reserved output directory. It never hashes a
future task receipt or future evaluation result.

interface QualificationCycleManifestV1 {
    schemaVersion: "ranking_v3_qualification_cycle_manifest_v1";
    dhInputIndexSha256: string;
    artifactSha256: string;
    selectedArtifactMode: SelectedArtifactMode;
    qualificationTargetSha256: string;
    serviceClass: ServiceClass;
    commandInputs: readonly CommandInputBindingV1<
        "H1" | "H2" | "H3" | "H4" | "H6" | "H7" | "H8" | "H9"
    >[];
}

interface PreHeldoutCycleManifestV1 {
    schemaVersion: "ranking_v3_pre_heldout_cycle_manifest_v1";
    dhInputIndexSha256: string;
    artifactSha256: string;
    qualificationTargetSha256: string;
    heldoutManifestSha256: string;
    expectedPendingRegistrySha256: null;
    commandInputs: readonly CommandInputBindingV1<"H0" | "H10">[];
}

interface ActivationCycleManifestV1 {
    schemaVersion: "ranking_v3_activation_cycle_manifest_v1";
    preHeldoutCycleManifestSha256: string;
    h10TransitionReceiptSha256: string;
    artifactSha256: string;
    qualificationTargetSha256: string;
    heldoutManifestSha256: string;
    expectedPendingRegistrySha256: string;
    commandInputs: readonly CommandInputBindingV1<
        "I0" | "I1" | "I2" | "I3" | "I4" | "I3R" | "I5" | "I6"
    >[];
}
```

A3 owns `ValidatedRerankResponseV1`; D7 owns `NeuralRankingEvidenceV1`; D6 owns every
`E3OutcomeReceiptV1`; A11Q owns the baseline/slice/counterfactual/resource and offline
qualification envelopes; A11H owns held-out, rollout, rollback, and activation
receipts. Unknown fields are rejected for every authority above.

### 5.7 Storage and identity

Storage consists of:

- the built-in deterministic baseline implementation;
- an optional administrator-controlled trusted learned-artifact path;
- an administrator-controlled append-only qualification registry.

No qualified artifact or registry is bundled in V3.0.

Repository-local ranking-policy files are forbidden.

Composite policy identity: `search_ranking_policy_v3:<artifact-sha256>` carried by the
existing `rankingPolicyIdentity` field of the ranked-set binding; a continuation
created under another artifact becomes stale via the existing revalidation. For learned
mode `disabled`, the binding's reranker identity is the canonical built-in value
`reranker_disabled_v1`; it is never copied from an unrelated configured provider. For
`provider_derived`, the binding uses the exact qualified reranker identity from the
registry entry. Policy hash appears in startup diagnostics, search diagnostics, and
ranked-set bindings, not in index publication receipts.

## 6. Evaluation and selection

### 6.1 Recall separation and metrics

Four stage observations per task: `knownRelevantInRawArms`,
`knownRelevantAfterCoreFusion`, `knownRelevantInMcpUnion`,
`knownRelevantAfterEligibility`. Two quality tracks: end-to-end (a missing acceptable
result is a miss) and conditional ranking (graded metrics only where a grade ≥ 2
result survives eligibility). Metrics live in the existing search-quality evaluator:
stage survival, judged-pool nDCG@10 with coverage, conditional graded pair accuracy,
end-to-end miss accounting; existing owner metrics stay byte-compatible.

### 6.2 Graded judgments

Tuning-only, human-authoritative grades 3/2/1/0 with source-bound rationale and
explicit `judged` status; unjudged candidates are excluded from pair generation and
never become grade 0. Two independent proposals per task, produced through separate
packet agents (C2/C3 packet-scoped paths; C3S validates and assembles), then one
human/adjudicator resolution (C4). The v4 tuning manifest carries the leakage contract
and never rewrites held-out authority. Held-out restrictions: do not execute held-out
queries, create held-out captures, inspect held-out contender outputs, or use held-out
judgments or outcomes for design, grading, feature selection, hyperparameter
selection, or debugging; sealed manifest digests may be read for opening verification.

### 6.3 Corpus

B9 materializes and seals the tuning `search_candidate_survival_v3` corpus for all six
tuning families. The corpus binds frozen repository/tree/query/task digests,
product-output digests, target digest, and tuning-only proof. R0.2 remains the
pre-instrumentation byte-identity baseline.

For fixed-provider target cycles, every provider capture binds only raw validated
provider authority:

```text
serviceClass
providerKey
rerankerIdentity
rerankerProjectionIdentity
providerConfigurationDigest
providerRequestContractSha256
baselineAdmissionSet digest
request candidate order
complete returned candidate order
finite raw scores
request digest
response digest
timeout/failure outcome
```

B9 does not calculate percentiles, normalized margins, or any other derived neural
evidence. D7 derives those values during E2 and H4; fold and replay receipts bind the
derived-evidence digest.

### 6.4 Provider-evidence target and request contract

R1.T0 is the executable schema authority for `QualificationTargetV1`. The target states
whether fixed provider evidence is available for this cycle; it does not select the
final artifact mode. E3 alone selects `disabled | provider_derived`.

The owner decision consumed by R1.0 has one fixed schema and is itself sealed:

```ts
type OwnerTargetDecisionV1 =
    | {
        schemaVersion: "ranking_v3_owner_target_decision_v1";
        providerTarget: "none";
        serviceClass: ServiceClass;
        decidedBy: string;
        decidedAt: string;
    }
    | {
        schemaVersion: "ranking_v3_owner_target_decision_v1";
        providerTarget: "fixed";
        serviceClass: ServiceClass;
        providerKey: string;
        rerankerIdentity: string;
        rerankerProjectionIdentity: string;
        providerConfigurationDigest: string;
        decidedBy: string;
        decidedAt: string;
    };
```

R1.T0 parses this decision and is the only tool allowed to transform it into canonical
`QUALIFICATION_TARGET.json`.

```ts
type NoProviderTargetV1 = {
    providerTarget: "none";
    serviceClass: ServiceClass;
};

type FixedProviderTargetV1 = {
    providerTarget: "fixed";
    serviceClass: ServiceClass;
    providerKey: string;
    rerankerIdentity: string;
    rerankerProjectionIdentity: string;
    providerConfigurationDigest: string;
};

type QualificationTargetV1 = NoProviderTargetV1 | FixedProviderTargetV1;
```

A disabled final artifact may bind either target digest for provenance and contains no
provider behavior. A provider-derived final artifact is legal only when the target is
`providerTarget: "fixed"` and must match all fixed-target identity/configuration fields.
The provider request contract is a separate R1.2 authority and cannot be part of the
R1.0 target because its digest does not exist yet.

R1.2 seals `ProviderRequestContractV1`. A12 is the sole shared implementation authority:

```ts
interface ProviderRequestContractV1 {
    schemaVersion: "ranking_provider_request_contract_v1";
    projectionIdentity: string;
    candidateOrder: "baseline_admission_order";
    documentSerializationIdentity: string;
    identityMappingIdentity: string;
    maximumCandidateCount: number;
    maximumPayloadUtf8Bytes: number;
    timeoutMs: number;
    maximumRetries: number;
    canonicalizationIdentity: string;
}

interface SearchCandidateForProviderV1 {
    candidateId: string;
    document: unknown;
}

function parseProviderRequestContractV1(
    value: unknown,
): ProviderRequestContractV1;

function buildRankingProviderRequestV1(input: {
    contract: ProviderRequestContractV1;
    expectedProviderRequestContractSha256: string;
    baselineAdmissionCandidates: readonly SearchCandidateForProviderV1[];
    target: FixedProviderTargetV1;
}): {
    providerRequestContractSha256: string;
    orderedCandidateIds: readonly string[];
    requestPayload: unknown;
    canonicalRequestSha256: string;
};
```

The builder canonicalizes and hashes the supplied contract itself, returns that digest,
and rejects unless it equals `expectedProviderRequestContractSha256`. It accepts
candidates only in frozen baseline-admission order and rejects an input whose order,
projection identity, payload size, provider identity, configuration digest, or contract
digest differs from the sealed target/contract. B9, E2, G2, G6B/H4, and G6C/I2 import
this implementation unchanged and receive the expected digest only from the sealed
R1.2 training-contract index; no caller recalculates or copies an independent expected
value.

When `providerTarget` is `none`, B9 performs no provider capture, R1.3 omits the
provider-derived contender, E2 does not construct it, and E3 cannot select it. When it
is `fixed`, E2 compares disabled and provider-derived descriptors over the same residual
model; E3 may select either mode but never change the fixed provider target.

### 6.4A Reachable target-bound card generation

Every card set includes its target tasks and the next boundary generator:

```text
R0.1B: R0.2, R1.T0, R1.0, R1.0B
R1.0B: R1.T1, R1.T2, R1.1–R1.5, R1.6
R1.6/DA: A1–A10, A11Q, A11H, A12, A_GATE, DB
DB: B1–B9, B_GATE, DC0
DC0: C1, C1G, DC1
DC1: expanded Wave-C tasks, C3S, C4–C6, C_GATE, DD
DD: D1–D8, D_GATE, DE
DE: concrete E1/E2 family tasks, E3_INPUT_SEAL, E3, E4,
    E_GATE_SELECTED, E_GATE_INSUFFICIENT, E_GATE_LEARNED_NOT_JUSTIFIED, DF
DF: F0–F9 applicable tasks, F_GATE, DG
DG: G1–G7, G_GATE, DH
DH: H0–H10 applicable tasks, H_GATE_QUALIFIED, H_GATE_REJECTED,
    H_GATE_INSUFFICIENT, DI
DI: I0–I6 and I3R applicable tasks, I_GATE_ACCEPTED, I_GATE_REJECTED
```

A boundary-generator card is present but nondispatchable until its prerequisite gate or
outcome receipt exists. No generator is owner-authorized implicitly after R0.1B.

### 6.5 Contenders and grouped-comparator deadline

- Baseline B.
- D1 grouped tuned baseline, diagnostic and never deployable through V3.
- Deterministic residual (`disabled`).
- Residual plus provider-derived reorder only when the sealed target has `providerTarget: "fixed"`.

R1.3 seals `groupedComparatorPolicy: required | optional` and the exact availability
barrier `E3_INPUT_SEAL`. E3 first writes `E3_INPUT_SEAL.json`, listing every E2 receipt
and either a valid D1 receipt digest or `groupedComparator: unavailable`. If a valid D1
receipt exists at that barrier, E3 must consume it even when the comparator is optional;
a material grouped win yields terminal `learned_not_justified`. If no valid receipt
exists by the barrier and the policy is optional, E3 records `unavailable` and proceeds.
Later H2 output is diagnostic only and cannot retroactively change selection. If the
policy is required and D1 is unavailable, E3 returns `insufficient_evidence`.

### 6.6 LOFO selection and fold artifacts

D2/E1 produce mode-neutral `ResidualModelV1` artifacts. E2 creates and seals one
disabled `FoldContenderDescriptorV1` and, when permitted, one provider-derived
descriptor over the same residual-model digest. E2 scores those descriptors through D7.
E3 emits exactly one receipt outcome:

```text
selected_disabled
selected_provider_derived
insufficient_evidence
learned_not_justified
```

Only selected outcomes reach E4. E4 performs one all-tuning refit and serializes the
single final `RankingPolicyV3Artifact`; D3 verifies it independently. The two terminal
outcomes do not create E4 and do not dispatch Wave F.

### 6.7 Offline qualification (Wave H)

H0 runs first on G7-sealed F9/G6C tooling using `PreHeldoutCycleManifestV1`. It validates the trusted registry root;
when the root is empty it creates the canonical genesis version, otherwise it verifies
the existing current snapshot. H0 emits `RegistryReadyReceiptV1` binding the current
registry digest, initialization receipt when created, trusted-root identity, platform
capability decision, and G7 seal.

Replays run on G7-sealed executables. `SelectedModeReplayReceipt` is generated by
G6B's sealed tooling and produced by H3 when E4 is `disabled`, or by H4 when E4 is
`provider_derived`; only one normative receipt exists per qualification cycle. For a
`disabled` artifact H4 does not run because no provider policy exists. For a
`provider_derived` artifact H3 may run as a deterministic ablation, but it is diagnostic
and never blocks qualification. H6/H7/H8 consume only the selected-mode receipt. H9
emits
`offline_qualified | rejected | insufficient_evidence` for the exact E4 artifact in
its selected mode, with `qualifiedRerankers` mode-consistent and
`groupedComparator: available | unavailable | not_required` per the R1.3 policy. H9
binds H0's `RegistryReadyReceiptV1` and expected current registry digest. H10 runs only
when H9 is `offline_qualified`; it uses that exact expected digest to create the
`pending_heldout` registry version via the F9 writer. Any intervening registry change
aborts H10 and retains baseline.

### 6.8 Held-out (Wave I)

```text
I3 accepted
→ I4
→ pending_heldout to activation_qualified

I3 rejected
→ I3R
→ pending_heldout to revoked with reason heldout_rejected
```

DI first creates `ActivationCycleManifestV1` from the exact H10 transition receipt.
I4 depends on an accepted I3 receipt. I3R depends on a rejected I3 receipt. Every Wave-I
step uses the activation manifest and therefore the exact H10 pending-registry digest
verified by I1. I5 and I6 occur only after successful
I4; they never follow I3R. I5 is configuration-only: select the qualified learned
artifact, create a continuation, select baseline through preregistered configuration,
prove new requests use baseline and the old continuation is stale, then reselect the
same still-`activation_qualified` artifact. I5 never revokes it. I4 is the first point
at which the product selector may return `learned_v3`. Post-opening configuration selection is limited to baseline and
already sealed, activation-qualified hashes, recorded in append-only rollout receipts.

## 7. Execution graph and task ownership

### 7.1 Central-file ownership

| File | Exclusive owner |
|---|---|
| `packages/mcp/src/core/search-execution.ts` | B5, then G1, then G2 — sequential |
| `packages/mcp/src/core/search-types.ts` | G3 |
| `packages/mcp/src/config.ts` | F6 |
| `packages/mcp/src/core/search-result-set-identity.ts` | F7 |
| `packages/mcp/src/core/ranking-policy-v3.ts` | D7 |
| `packages/mcp/src/core/neural-ranking-evidence.ts` | D7 |
| `packages/mcp/src/core/neural-ranking-gate.ts` | D7 |
| `packages/mcp/src/core/provider-slot-permutation.ts` | D7 |
| `packages/mcp/src/core/rerank-evidence.ts` | A3 |
| `packages/mcp/src/core/ranking-provider-request-v1.ts` | A12 |
| `scripts/satori-search-candidate-capture.mjs` | B6 |
| `scripts/satori-search-candidate-replay.mjs` | B7 |
| `scripts/satori-search-candidate-score.mjs` | C6 |
| `evals/search-quality/search-quality-evaluation.ts` | R0.1A, then A10, then C6 |
| `scripts/ranking-qualification-target.mjs` | R1.T0 |
| `scripts/ranking-v3-task-graph.mjs` | R1.T1; owns `TaskGraphDeclarationV1`, `build-declaration`, verification, sealing, and expansion |
| `scripts/ranking-v3-contract-seal.mjs` | R1.T2 |
| `scripts/verify-ranking-v3-rebase.mjs` | R0.1V |
| `scripts/run-ranking-v3-baseline-capture.mjs` | R0.1V; creates a detached worktree at `baselineCommit`, verifies its tree digest, and runs capture only inside that worktree |
| `scripts/build-ranking-policy-v3-artifact.mjs` | D8 |
| `scripts/verify-ranking-v3-resource-contract.mjs` | D5 |
| `scripts/verify-ranking-v3-implementation-seal.mjs` | G7 |
| `scripts/ranking-v3-dispatch-cards.mjs` | R0.1B |

### 7.2 Task graph authority, exact prerequisites, and branch semantics

R1.T1 owns `ranking_v3_task_graph_v1`, `TaskGraphDeclarationV1`, canonicalization,
validation, declaration extraction, and expansion. It validates the declared semantics;
it does not invent edges. Its `build-declaration` command reads only the uniquely marked
`RANKING_V3_TASK_GRAPH_DECLARATION_V1` region of the sealed plan, parses the exact
prerequisite DSL and conditional-edge array, binds `planSha256`, and emits canonical
`TASK_GRAPH_DECLARATION.json`. Any unmarked task or edge, duplicate node, unknown
reference, or plan-digest mismatch fails. R1.5 seals that declaration and the exact task
edge table below. `LOFO_FAMILIES.json`, emitted by R1.3 from the sealed tuning manifest,
contains the six exact family IDs. R1.5 invokes the R1.T1 expansion function while
sealing the graph, so concrete `E1.<familyId>` and `E2.<familyId>` nodes already exist in
`TASK_GRAPH.json`; no later E-family expansion is needed. The family list is derived
from the already-sealed `cross-repository-v3` tuning partition and its family mapping,
not from the future C5 tuning manifest.

```ts
interface TaskGraphNodeV1 {
    taskId: string;
    taskKind: "static" | "gate" | "boundary_generator";
}

interface TaskGraphTemplateV1 {
    templateId: string;
    taskIdPattern: string;
    expansionAuthority: "r1_5_lofo_families" | "c1_packet_manifest";
    hardRequires: readonly string[];
}

interface TaskGraphDeclarationV1 {
    schemaVersion: "ranking_v3_task_graph_declaration_v1";
    planSha256: string;
    staticNodes: readonly TaskGraphNodeV1[];
    taskTemplates: readonly TaskGraphTemplateV1[];
    hardEdges: readonly Extract<TaskGraphEdgeV1, { kind: "hard" }>[];
    conditionalEdges: readonly Exclude<TaskGraphEdgeV1, { kind: "hard" }>[];
}

type ReceiptConditionV1 =
    | { field: string; equals: string }
    | { field: string; oneOf: readonly string[] };

type TaskGraphEdgeV1 =
    | { kind: "hard"; taskId: string; requires: string }
    | {
        kind: "contract_condition";
        taskId: string;
        requires: string;
        condition: ReceiptConditionV1;
    }
    | {
        kind: "receipt_outcome";
        taskId: string;
        requires: string;
        receiptType: string;
        condition: ReceiptConditionV1;
    };
```

`oneOf` is disjunctive: one matching value satisfies the edge. Multiple ordinary hard
edges remain conjunctive. E4 therefore has one receipt-outcome edge whose condition is
`{ field: "outcome", oneOf: ["selected_disabled", "selected_provider_derived"] }`.
Contract-conditioned and receipt-outcome branches remain present in the sealed graph;
they become dispatchable only when the named parsed authority exists and are never
rewritten after evaluation.

D1 availability is not represented as a dependency edge. `E3_INPUT_SEAL` is an atomic
command that examines the already-sealed comparator policy and the receipt index at its
execution barrier and always emits one canonical `E3InputSealV1`:

```text
valid D1 receipt present
→ groupedComparator = { status: "available", comparatorReceiptSha256 }

valid D1 receipt absent + optional comparator policy
→ groupedComparator = { status: "unavailable_optional" }

valid D1 receipt absent + required comparator policy
→ groupedComparator = { status: "unavailable_required" }
```

`E3_INPUT_SEAL` never emits an E3 terminal receipt. E3 is the sole authority for all
four `E3OutcomeReceiptV1` variants. When it reads `unavailable_required`, E3 emits
`E3InsufficientEvidenceReceiptV1` with a sealed `missingEvidenceCodes` entry for the
required comparator. A D1 receipt appearing after `E3_INPUT_SEAL` is diagnostic only
and cannot alter the sealed input set.

#### Exact prerequisite table

<!-- BEGIN RANKING_V3_TASK_GRAPH_DECLARATION_V1 -->

```text
R0.0: none
R0.1A: R0.0
R0.1V: R0.1A
R0.1: R0.1V
R0.1B: R0.1
R0.2: R0.1B
R1.T0: R0.1B
R1.0: R0.2, R1.T0
R1.0B: R1.0, R0.1B
R1.T1: R1.0B
R1.T2: R1.0B
R1.1: R1.0B, R1.T2
R1.2: R1.0B, R1.T2
R1.3: R1.0B, R1.T2
R1.4: R1.0B, R1.T2
R1.5: R1.T1, R1.T2, R1.1, R1.2, R1.3, R1.4
R1.6: R1.5

A1: R1.6, R1.1
A2: R1.6, R1.1
A3: R1.6, R1.0, R1.2
A4: R1.6, R1.1
A5: R1.6, R1.1, R1.2, R1.4
A6: R1.6, R1.4
A7: R1.6, R1.4
A8: R1.6, R1.3
A9: R1.6, R1.3
A10: R1.6, R1.3
A11Q: R1.6, A6, R1.4
A11H: R1.6, A6, A11Q, R1.3, R1.4
A12: R1.6, R1.0, R1.2
A_GATE: A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11Q, A11H, A12
DB: A_GATE, R1.6

B1: DB, A1
B2: DB, A2
B3: DB, A3, A12
B4: DB, A2, A4, B2, B3
B5: DB, B1, B2, B3, B4
B6: DB, B5
B7: DB, B6, A5, A6, R1.2, R1.4
B8: DB, B7, R0.2
B9: DB, B7, B8, A12, R1.0, R1.2
B_GATE: B1, B2, B3, B4, B5, B6, B7, B8, B9
DC0: B_GATE

C1: DC0, A8, B9
C1G: C1, R1.T1
DC1: C1G
C2.<packetId>: DC1, C1
C3A.<packetId>: C2.<packetId>
C3B.<packetId>: C2.<packetId>
C3S: all C3A.<packetId>, all C3B.<packetId>
C4: C3S
C5: C4, A8
C6: C5, A10, B7
C_GATE: C1, C1G, all expanded packet tasks, C3S, C4, C5, C6
DD: C_GATE, DC1

D1: DD, C6, R1.2, R1.3
D2: DD, A4, A5, C6, R1.2
D3: DD, A5, D2, R1.4
D4: DD, C6, D2, R1.3
D5: DD, A4, A5, R1.4
D6: DD, A9, D2, D3, C6, R1.3
D7: DD, A3, A4, A5, A12, R1.0, R1.1, R1.2, R1.4
D8: DD, A5, D2, D3, R1.0, R1.1, R1.2, R1.4
D_GATE: D2, D3, D4, D5, D6, D7, D8
DE: D_GATE, DD

E1.<familyId>: DE, D6
E2.<familyId>: E1.<familyId>, B9, D4, D7, A12
E3_INPUT_SEAL: all E2.<familyId>, R1.3
E3: E3_INPUT_SEAL
E4: D2, D3, D8
E_GATE_SELECTED: E4
E_GATE_INSUFFICIENT: none
E_GATE_LEARNED_NOT_JUSTIFIED: none
DF: E_GATE_SELECTED, DE

F0: DF, E_GATE_SELECTED
F1: F0, A5
F2: F0, A6, A11Q
F6: F1, F2, A7
F7: F6, A7
F8: F6, A7
F9: F0, F2, A6, A11Q, A11H, R1.4
F_GATE: F0, F1, F2, F6, F7, F8, F9
DG: F_GATE, DF

G1: DG, F_GATE, B8, D7
G2: G1, D7, A12
G3: G2
G4: F1, F2, F6, G1, A12
G5: F7, G2, R0.1
G6: G1, G2, G3, G4, G5
G6A: G2, D5, D7
G6B: B7, B9, C6, D3, D4, D5, D7, D8, G6A, A11Q, A11H,
      R1.2, R1.3, R1.4, A12
G6C: G6B, F9, A11Q, A11H, R1.3, R1.4, A12
G7: G6, G6A, G6B, G6C, F0, F1, F2, F6, F7, F8, F9
G_GATE: G7
DH: G_GATE, DG

H0: DH, G_GATE, G6C
H1: DH, G_GATE, G6B
H2: DH, G_GATE, G6B
H3: DH, G_GATE, G6B
H4: DH, G_GATE, G6B, A12
H6: H1, G6B
H7: H1, D4, G6B
H8: H1, G6A, D5, G6B
H9: H0, H6, H7, H8, G6B
H10: H0, F9, G6C
H_GATE_QUALIFIED: H10
H_GATE_REJECTED: none
H_GATE_INSUFFICIENT: none
DI: H_GATE_QUALIFIED, H10, DH

I0: DI, H_GATE_QUALIFIED, G6C
I1: I0, H10, G7, G6C
I2: I1, G6C, A12
I3: I2, G6C
I4: I1, H10, F9, G6C
I3R: I1, H10, F9, G6C
I5: I4, G6C
I6: I5, G6C
I_GATE_ACCEPTED: I6
I_GATE_REJECTED: I3R
```

#### Conditional edge declarations

The following are the only non-hard edges in the base graph:

```ts
const conditionalEdges: readonly TaskGraphEdgeV1[] = [
    {
        kind: "receipt_outcome",
        taskId: "E4",
        requires: "E3",
        receiptType: "E3OutcomeReceiptV1",
        condition: {
            field: "outcome",
            oneOf: ["selected_disabled", "selected_provider_derived"],
        },
    },
    {
        kind: "receipt_outcome",
        taskId: "E_GATE_INSUFFICIENT",
        requires: "E3",
        receiptType: "E3InsufficientEvidenceReceiptV1",
        condition: { field: "outcome", equals: "insufficient_evidence" },
    },
    {
        kind: "receipt_outcome",
        taskId: "E_GATE_LEARNED_NOT_JUSTIFIED",
        requires: "E3",
        receiptType: "E3LearnedNotJustifiedReceiptV1",
        condition: { field: "outcome", equals: "learned_not_justified" },
    },
    {
        kind: "contract_condition",
        taskId: "H3",
        requires: "E4",
        condition: { field: "neuralReorderPolicy.mode", equals: "disabled" },
    },
    {
        kind: "contract_condition",
        taskId: "H4",
        requires: "E4",
        condition: { field: "neuralReorderPolicy.mode", equals: "provider_derived" },
    },
    {
        kind: "contract_condition",
        taskId: "H6",
        requires: "H3",
        condition: { field: "selectedArtifactMode", equals: "disabled" },
    },
    {
        kind: "contract_condition",
        taskId: "H6",
        requires: "H4",
        condition: { field: "selectedArtifactMode", equals: "provider_derived" },
    },
    {
        kind: "contract_condition",
        taskId: "H7",
        requires: "H3",
        condition: { field: "selectedArtifactMode", equals: "disabled" },
    },
    {
        kind: "contract_condition",
        taskId: "H7",
        requires: "H4",
        condition: { field: "selectedArtifactMode", equals: "provider_derived" },
    },
    {
        kind: "contract_condition",
        taskId: "H8",
        requires: "H3",
        condition: { field: "selectedArtifactMode", equals: "disabled" },
    },
    {
        kind: "contract_condition",
        taskId: "H8",
        requires: "H4",
        condition: { field: "selectedArtifactMode", equals: "provider_derived" },
    },
    {
        kind: "receipt_outcome",
        taskId: "H10",
        requires: "H9",
        receiptType: "OfflineQualificationReceiptV1",
        condition: { field: "verdict", equals: "offline_qualified" },
    },
    {
        kind: "receipt_outcome",
        taskId: "H_GATE_REJECTED",
        requires: "H9",
        receiptType: "OfflineQualificationRejectionReceiptV1",
        condition: { field: "verdict", equals: "rejected" },
    },
    {
        kind: "receipt_outcome",
        taskId: "H_GATE_INSUFFICIENT",
        requires: "H9",
        receiptType: "OfflineQualificationInsufficientEvidenceReceiptV1",
        condition: { field: "verdict", equals: "insufficient_evidence" },
    },
    {
        kind: "receipt_outcome",
        taskId: "I4",
        requires: "I3",
        receiptType: "HeldoutAcceptanceReceiptV1",
        condition: { field: "decision", equals: "accepted" },
    },
    {
        kind: "receipt_outcome",
        taskId: "I3R",
        requires: "I3",
        receiptType: "HeldoutRejectionReceiptV1",
        condition: { field: "decision", equals: "rejected" },
    },
];
```

Exactly one conditionally selected predecessor is active for H6/H7/H8 because the E4
artifact mode is a tagged union. Inactive conditional edges are absent, not failed hard
dependencies.

<!-- END RANKING_V3_TASK_GRAPH_DECLARATION_V1 -->

Wave-C packet identities are the only post-seal graph expansion. C1 emits
`RANKING_JUDGMENT_PACKET_MANIFEST.json`; C1G invokes R1.T1 and writes append-only
`TASK_GRAPH_EXPANSION_C.json`. Expanded IDs must match the sealed template regex and may
introduce only template-declared edges.

R1.5 writes `TASK_GRAPH.json` first and then `CONTRACT_SEAL.json`; the graph contains no
seal digest, avoiding self-reference. Every card generator validates the base graph plus
applicable expansion receipts. Cycles, unknown nodes, undeclared IDs, unresolved hard
dependencies, or missing branch receipts block dispatch.

### 7.3 Wave contents

- **Gate 0/bootstrap:** R0.0, R0.1A, R0.1V, R0.1, R0.1B, R0.2, R1.T0, R1.0, R1.0B, R1.T1, R1.T2,
  R1.1–R1.6.
- **Wave A:** A1–A10, A11Q, A11H, and A12 pure schemas, parsers, provider-request construction, feature/metric
  foundations, and split receipt authorities A11Q/A11H.
- **Wave B:** B1–B9 instrumentation, replay, byte-identity proof, and authoritative
  tuning corpus.
- **Wave C:** C1, C1G, packet templates, assembly/adjudication, tuning manifest, and
  graded scorer.
- **Wave D:** D1 grouped comparator; D2 residual trainer; D3 verifier; D4
  counterfactuals; D5 resource contract; D6 LOFO executables; D7 shared policy library; D8 final-artifact builder.
- **Wave E:** fold executions, descriptor scoring, E3 input seal/adjudication, optional
  E4 refit, and explicit terminal branches.
- **Wave F:** trusted filesystem, artifact/registry stores, selector, identity, shadow
  sink, and transition writer.
- **Wave G:** runtime integration, resource harness, H/I executable toolchains, and G7
  implementation seal.
- **Wave H:** registry readiness, baseline/selected-mode replay, gates, offline verdict,
  and optional pending transition.
- **Wave I:** authorization, opening, one held-out execution, terminal adjudication,
  acceptance/rejection transition, rollback drill, and limited activation.

### 7.4 Dispatch-card generation

Every card set contains its target tasks and the next boundary-generator card. The next
generator is nondispatchable until the current scope's gate receipt exists. This rule
prevents a meta-dispatch deadlock.

All generators first bind the wave-boundary tree through the R0.1V-owned verifier,
then invoke the one R0.1B-owned CLI:

```text
node scripts/verify-ranking-v3-rebase.mjs snapshot-tree
  --head "$DISPATCH_COMMIT"
  --out "$TASK_OUTPUT/DISPATCH_TREE.json"
node scripts/ranking-v3-dispatch-cards.mjs build
  --scope "$SCOPE_ID"
  --baseline-commit "$BASELINE_COMMIT"
  --dispatch-commit "$DISPATCH_COMMIT"
  --dispatch-tree-manifest "$DISPATCH_TREE_MANIFEST"
  --qualification-target "$QUALIFICATION_TARGET_OR_NONE"
  --contract-seal "$CONTRACT_SEAL_OR_NONE"
  --task-graph "$TASK_GRAPH_OR_NONE"
  --expansion-receipts "$EXPANSION_RECEIPT_INDEX"
  --previous-manifest "$PREVIOUS_CARD_MANIFEST_OR_NONE"
  --include-next-generator "$NEXT_GENERATOR_ID_OR_NONE"
  --out "$CARD_SET_DIR"
node scripts/ranking-v3-dispatch-cards.mjs verify
  --manifest "$CARD_SET_DIR/cards.manifest.json"
```

`$SCOPE_ID` and `$NEXT_GENERATOR_ID_OR_NONE` are literals fixed by the boundary card.
`$DISPATCH_COMMIT` is the integration HEAD named by the preceding gate receipt;
`$DISPATCH_TREE_MANIFEST` is the just-created `DISPATCH_TREE.json`. Target, seal, graph,
expansion, and previous-manifest arguments come from named prerequisite receipts. No
executing agent chooses an argument or discovers a file. The generated manifest uses:

```json
{
  "schemaVersion": "ranking_v3_dispatch_cards_v2",
  "planSha256": "<canonical-plan-digest>",
  "baselineCommit": "<Gate-0-frozen-HEAD>",
  "dispatchCommit": "<wave-boundary-integration-HEAD>",
  "dispatchTreeSha256": "<wave-boundary-tree-manifest-digest>",
  "qualificationTargetSha256": "<digest-or-null-before-R1.0>",
  "contractSealSha256": "<digest-or-null-before-R1.5>",
  "taskGraphSha256": "<base-graph-digest-or-null>",
  "taskGraphExpansionReceipts": [],
  "prerequisiteReceipts": [],
  "cards": []
}
```

`baselineCommit` never changes. `dispatchCommit` and `dispatchTreeSha256` bind the exact
implemented interfaces inspected at that boundary. DH invokes G6B `build-cycle` and
G6C `build-pre-heldout-cycle` and binds those manifests to Wave H. DI runs only after
H10, invokes G6C `build-activation-cycle`, and binds that activation manifest to every
Wave-I card. A new manifest revokes only overlapping unexecuted cards; executed cards
remain historical evidence.

### 7.5 Task Interface Catalog

This catalog fixes files, APIs, command schemas, substitution authorities, and outputs.
Exact line ranges are added from `dispatchCommit`; filenames, arguments, and interfaces
are not negotiable.

Command variables come only from sealed files or the current card's declared
human-decision input:

```text
$TASK_OUTPUT                  card's immutable output directory
$SEALED_PLAN                  current plan path from the card-set manifest
$PLAN_SHA256                  current plan digest from the card-set manifest
$BASELINE_COMMIT              R0.1 frozen-base receipt
$BASELINE_TREE_SHA256         R0.1 frozen-base receipt
$OWNER_TARGET_DECISION        R1.0 human-decision input, parsed as OwnerTargetDecisionV1
$QUALIFICATION_TARGET         R1.0 canonical target path
$FEATURE_CONTRACT_INDEX       R1.1 feature contract index
$TRAINING_CONTRACT_INDEX      R1.2 training contract index
$DECISION_CONTRACT_INDEX      R1.3 decision contract index
$ACTIVATION_CONTRACT_INDEX    R1.4 activation contract index
$LOFO_FAMILIES                R1.3 family-list path derived from sealed v3 tuning split
$CONTRACT_INDEX               R1.5 contract index produced by R1.T2 build-index
$CONTRACT_SEAL                R1.5 contract seal
$TASK_GRAPH                   R1.5 task graph
$LOCKFILE_AUTHORITY           R0.1 LOCKFILE_AUTHORITY.json path
$PREREQUISITE_RECEIPT_INDEX   card-generator-produced immutable receipt index
$PACKET_MANIFEST              C1 packet-manifest path from C1 receipt
$FAMILY_ID                    one exact $LOFO_FAMILIES entry
$FOLD_TRAIN_JOB               D6 LOFO_JOB_MANIFEST.json train descriptor
$FOLD_SCORE_JOB               D6 LOFO_JOB_MANIFEST.json score descriptor
$E3_INPUT_JOB                 D6 E3 input-seal descriptor
$E3_DECISION_JOB              D6 E3 decision descriptor
$E3_INPUT_SEAL                E3_INPUT_SEAL output path from its receipt
$REFIT_JOB                    D6 all-tuning refit descriptor
$E3_SELECTION_RECEIPT         E3 selected-outcome receipt
$TRAINING_MANIFEST            C5 tuning manifest
$DH_INPUT_INDEX               DH-owned DhInputIndexV1 path
$QUALIFICATION_CYCLE          DH-produced manifest using G6B build-cycle
$PRE_HELDOUT_CYCLE            DH-produced pre-held-out manifest using G6C build-pre-heldout-cycle
$H10_TRANSITION_RECEIPT       H10 registry-transition receipt path from H_GATE_QUALIFIED
$ACTIVATION_CYCLE             DI-produced activation-cycle manifest binding H10
```

Every card records the source receipt digest for each substituted path. `$TASK_OUTPUT`
may never stand in for a prerequisite task's directory.

#### Bootstrap and Gate 1

| Task | Owned files/interfaces | Exact verification or execution | Output |
|---|---|---|---|
| R0.0 | Owner merge/evidence task | hardening suite from frozen command map | hardening acceptance receipt |
| R0.1A | Modify `evals/search-quality/search-quality-evaluation.ts`; create `evals/search-quality/ranking-v3-fixture-repair.test.ts` | `node --import tsx --test evals/search-quality/ranking-v3-fixture-repair.test.ts && pnpm eval:search-quality` | fixture repair receipt |
| R0.1V | Create `scripts/verify-ranking-v3-rebase.mjs`, `scripts/verify-ranking-v3-rebase.test.mjs`, `scripts/run-ranking-v3-baseline-capture.mjs`, `scripts/run-ranking-v3-baseline-capture.test.mjs` | `node --test scripts/verify-ranking-v3-rebase.test.mjs scripts/run-ranking-v3-baseline-capture.test.mjs` | Gate-0 tooling receipt |
| R0.1 | Create `BASELINE.md`, `SOURCE_ANCHORS.json`, `RUNTIME_CONSTRUCTION_SITES.json`, `CONTINUATION_SITES.json`, `LOCKFILE_AUTHORITY.json` | `node scripts/verify-ranking-v3-rebase.mjs verify --evidence-dir "$TASK_OUTPUT" --expected-head "$(git rev-parse HEAD)"` | frozen-base receipt |
| R0.1B | Create `scripts/ranking-v3-dispatch-cards.mjs` + test; exports `buildCardManifest`, `validateCardManifest` | `node --test scripts/ranking-v3-dispatch-cards.test.mjs` | initial card set including R1.0B |
| R0.2 | Execute R0.1V capture wrapper in a detached worktree | `node scripts/run-ranking-v3-baseline-capture.mjs --manifest evals/search-ranking/cross-repository-v3.manifest.json --partition tuning --deny-heldout --baseline-commit "$BASELINE_COMMIT" --baseline-tree-sha256 "$BASELINE_TREE_SHA256" --detached-worktree "$TASK_OUTPUT/worktree" --out "$TASK_OUTPUT/evidence"` | tuning-only Phase-0 baseline receipt proving executed HEAD/tree equals the frozen base |
| R1.T0 | Create `scripts/ranking-qualification-target.mjs` + test; parse/canonicalize/hash/write | `node --test scripts/ranking-qualification-target.test.mjs` | target-tool receipt |
| R1.0 | Invoke R1.T0 from `OwnerTargetDecisionV1` | `node scripts/ranking-qualification-target.mjs write --decision "$OWNER_TARGET_DECISION" --out "$TASK_OUTPUT/QUALIFICATION_TARGET.json" && node scripts/ranking-qualification-target.mjs verify --target "$TASK_OUTPUT/QUALIFICATION_TARGET.json"` | canonical target + digest receipt; `$QUALIFICATION_TARGET` is this output path |
| R1.0B | Execute dispatch CLI with scope `gate1-target-bound`, next generator `R1.6` | exact §7.4 command | target-bound card set |
| R1.T1 | Create `scripts/ranking-v3-task-graph.mjs` + test; owns `TaskGraphDeclarationV1`, `build-declaration`, `verify-declaration`, parse/canonicalize/validate/seal/expand | `node --test scripts/ranking-v3-task-graph.test.mjs` | graph-tool receipt |
| R1.T2 | Create `scripts/ranking-v3-contract-seal.mjs` + test; `buildContractIndex`, `verifyContractIndex`, `sealContracts` | `node --test scripts/ranking-v3-contract-seal.test.mjs` | contract-tool receipt |
| R1.1 | Create feature contract and index | `node scripts/ranking-v3-contract-seal.mjs verify-contract --kind feature --index "$TASK_OUTPUT/FEATURE_CONTRACT.index.json"` | feature-contract digest |
| R1.2 | Create training contract/index and `PROVIDER_REQUEST_CONTRACT.json` | `node scripts/ranking-v3-contract-seal.mjs verify-contract --kind training --index "$TASK_OUTPUT/TRAINING_CONTRACT.index.json"` | training/request digests |
| R1.3 | Create decision contract/index and `LOFO_FAMILIES.json` from the sealed cross-repository-v3 tuning partition | `node scripts/ranking-v3-contract-seal.mjs verify-contract --kind decision --index "$TASK_OUTPUT/DECISION_CONTRACT.index.json" --families "$TASK_OUTPUT/LOFO_FAMILIES.json"` | decision/family-list digests |
| R1.4 | Create artifact/activation contract and index | `node scripts/ranking-v3-contract-seal.mjs verify-contract --kind activation --index "$TASK_OUTPUT/ARTIFACT_ACTIVATION_CONTRACT.index.json"` | activation-contract digest |
| R1.5 | Build the canonical declaration from the sealed plan, verify it, create the contract index, seal the concrete graph, then seal contracts | `node scripts/ranking-v3-task-graph.mjs build-declaration --plan "$SEALED_PLAN" --expected-plan-sha256 "$PLAN_SHA256" --out "$TASK_OUTPUT/TASK_GRAPH_DECLARATION.json" && node scripts/ranking-v3-task-graph.mjs verify-declaration --declaration "$TASK_OUTPUT/TASK_GRAPH_DECLARATION.json" --expected-plan-sha256 "$PLAN_SHA256" && node scripts/ranking-v3-contract-seal.mjs build-index --feature "$FEATURE_CONTRACT_INDEX" --training "$TRAINING_CONTRACT_INDEX" --decision "$DECISION_CONTRACT_INDEX" --activation "$ACTIVATION_CONTRACT_INDEX" --out "$TASK_OUTPUT/CONTRACT_INDEX.json" && node scripts/ranking-v3-task-graph.mjs seal --declaration "$TASK_OUTPUT/TASK_GRAPH_DECLARATION.json" --families "$LOFO_FAMILIES" --out "$TASK_OUTPUT/TASK_GRAPH.json" && node scripts/ranking-v3-contract-seal.mjs seal --plan-sha256 "$PLAN_SHA256" --contract-index "$TASK_OUTPUT/CONTRACT_INDEX.json" --task-graph "$TASK_OUTPUT/TASK_GRAPH.json" --out "$TASK_OUTPUT/CONTRACT_SEAL.json"` | declaration, `CONTRACT_INDEX.json`, graph, and plan-bound contract seal |
| R1.6 | §7.4 dispatch CLI, scope `wave-a`, next `DB` | exact §7.4 command | Wave-A card set |
| DB | §7.4 dispatch CLI, scope `wave-b`, next `DC0` | exact §7.4 command | Wave-B card set |
| DC0 | §7.4 dispatch CLI, scope `wave-c-seed`, next `DC1` | exact §7.4 command | C1/C1G/DC1 card set |
| DC1 | §7.4 dispatch CLI, scope `wave-c-expanded`, next `DD` | exact §7.4 command | expanded Wave-C card set |
| DD | §7.4 dispatch CLI, scope `wave-d`, next `DE` | exact §7.4 command | Wave-D card set |
| DE | §7.4 dispatch CLI, scope `wave-e`, next `DF` | exact §7.4 command | Wave-E card set |
| DF | §7.4 dispatch CLI, scope `wave-f`, next `DG` | exact §7.4 command | Wave-F card set |
| DG | §7.4 dispatch CLI, scope `wave-g`, next `DH` | exact §7.4 command | Wave-G card set |
| DH | build `QualificationCycleManifestV1` and `PreHeldoutCycleManifestV1`, then §7.4 dispatch CLI, scope `wave-h`, next `DI` | G6B `build-cycle`, G6C `build-pre-heldout-cycle`, then exact §7.4 command | Wave-H card set + qualification/pre-held-out manifests |
| DI | after H10, build `ActivationCycleManifestV1`, then §7.4 dispatch CLI, scope `wave-i`, next `none` | G6C `build-activation-cycle`, then exact §7.4 command | activation manifest + Wave-I card set |

Gate nodes are evidence cards owned by the R1.T1 graph tool. Each uses:

```text
node scripts/ranking-v3-task-graph.mjs verify-ready
  --graph "$TASK_GRAPH"
  --node "$GATE_NODE"
  --receipt-index "$PREREQUISITE_RECEIPT_INDEX"
  --out "$TASK_OUTPUT/GATE_RECEIPT.json"
```

The cataloged gate IDs are `A_GATE`, `B_GATE`, `C_GATE`, `D_GATE`,
`E_GATE_SELECTED`, `E_GATE_INSUFFICIENT`, `E_GATE_LEARNED_NOT_JUSTIFIED`, `F_GATE`,
`G_GATE`, `H_GATE_QUALIFIED`, `H_GATE_REJECTED`, `H_GATE_INSUFFICIENT`,
`I_GATE_ACCEPTED`, and `I_GATE_REJECTED`. The verifier checks the edge kind and parsed
contract/receipt outcome; it never infers a branch from filenames.

#### Wave A

| Task | Owned files and exported authority | Required first-RED test / command |
|---|---|---|
| A1 | `packages/core/src/core/semantic-search-candidate-trace.ts`; trace parser | `node --import tsx --test packages/core/src/core/semantic-search-candidate-trace.test.ts` |
| A2 | `packages/mcp/src/core/search-ranking-evidence.ts`; deterministic evidence parser/types | `node --import tsx --test packages/mcp/src/core/search-ranking-evidence.test.ts` |
| A3 | `packages/mcp/src/core/rerank-evidence.ts`; `parseValidatedRerankResponse` only | `node --import tsx --test packages/mcp/src/core/rerank-evidence.test.ts` |
| A4 | `packages/mcp/src/core/ranking-features-v1.ts`; `extractRankingFeaturesV1` | `node --import tsx --test packages/mcp/src/core/ranking-features-v1.test.ts` |
| A5 | `packages/mcp/src/core/ranking-policy-artifact.ts`; parsers/canonicalizers for residual, descriptor, final artifact | `node --import tsx --test packages/mcp/src/core/ranking-policy-artifact.test.ts` |
| A6 | `packages/mcp/src/core/ranking-policy-qualification.ts`; registry parser/key helpers | `node --import tsx --test packages/mcp/src/core/ranking-policy-qualification.test.ts` |
| A7 | `packages/mcp/src/core/ranking-policy-identity.ts`; baseline/learned IDs and `reranker_disabled_v1` | `node --import tsx --test packages/mcp/src/core/ranking-policy-identity.test.ts` |
| A8 | `scripts/ranking-judgments.mjs`; judgment parser | `node --test scripts/ranking-judgments.test.mjs` |
| A9 | `scripts/ranking-lofo-folds.mjs`; fold builder | `node --test scripts/ranking-lofo-folds.test.mjs` |
| A10 | evaluator metric primitives | `node --import tsx --test evals/search-quality/ranking-v3-metrics.test.ts` |
| A11Q | `packages/mcp/src/core/ranking-qualification-receipts.ts`; qualification/registry parsers | `node --import tsx --test packages/mcp/src/core/ranking-qualification-receipts.test.ts` |
| A11H | `packages/mcp/src/core/ranking-heldout-receipts.ts`; held-out/rollout parsers | `node --import tsx --test packages/mcp/src/core/ranking-heldout-receipts.test.ts` |
| A12 | `packages/mcp/src/core/ranking-provider-request-v1.ts`; parse/build request contract | `node --import tsx --test packages/mcp/src/core/ranking-provider-request-v1.test.ts` |

#### Wave B

| Task | Owned files/interface | Exact command/output |
|---|---|---|
| B1 | Core trace implementation | `node --import tsx --test packages/core/src/core/vector-candidate-fusion.ranking-v3.test.ts packages/core/src/core/semantic-search-service.ranking-v3.test.ts` |
| B2 | `search-pass-evidence.ts` | `node --import tsx --test packages/mcp/src/core/search-pass-evidence.test.ts` |
| B3 | raw validated response retention using A3/A12 | `node --import tsx --test packages/mcp/src/core/search-rerank-evidence-retention.test.ts` |
| B4 | deterministic evidence assembler | `node --import tsx --test packages/mcp/src/core/search-ranking-evidence-assembler.test.ts` |
| B5 | `search-execution.ts` evidence integration | `node --import tsx --test packages/mcp/src/core/search-execution.ranking-v3-evidence.test.ts` |
| B6 | capture survival v3 | `node --test scripts/satori-search-candidate-capture.test.mjs` |
| B7 | replay v3 | `node --test scripts/satori-search-candidate-replay.test.mjs` |
| B8 | byte-identity proof | `node --import tsx --test packages/mcp/src/core/search-execution.ranking-v3-byte-identity.test.ts`; `BYTE_IDENTICAL_PROOF.md` |
| B9 | `scripts/materialize-ranking-v3-corpus.mjs`; raw provider evidence only | `node --test scripts/materialize-ranking-v3-corpus.test.mjs`; `CORPUS_MANIFEST.json` |

#### Wave C

| Task | Owned files/interface | Exact command/output |
|---|---|---|
| C1 | `scripts/build-ranking-judgment-packets.mjs` | `node --test scripts/build-ranking-judgment-packets.test.mjs` |
| C1G | graph expansion | `node scripts/ranking-v3-task-graph.mjs expand --graph "$TASK_GRAPH" --packet-manifest "$PACKET_MANIFEST" --out "$TASK_OUTPUT/TASK_GRAPH_EXPANSION_C.json"` |
| C2.<packetId> | candidate pool | `node scripts/ranking-judgments.mjs verify-pool --input "$TASK_OUTPUT/candidate-pool.json"` |
| C3A.<packetId> | proposal A | `node scripts/ranking-judgments.mjs verify-proposal --input "$TASK_OUTPUT/proposal-a.json"` |
| C3B.<packetId> | proposal B | `node scripts/ranking-judgments.mjs verify-proposal --input "$TASK_OUTPUT/proposal-b.json"` |
| C3S | `scripts/assemble-ranking-proposals.mjs` | `node --test scripts/assemble-ranking-proposals.test.mjs` |
| C4 | adjudicated judgments | `node scripts/ranking-judgments.mjs verify-adjudicated --input "$TASK_OUTPUT/judgments.json"` |
| C5 | `scripts/build-cross-repository-v4-tuning-manifest.mjs` + test; v4 tuning manifest | `node --test scripts/build-cross-repository-v4-tuning-manifest.test.mjs` |
| C6 | evaluator + score adapter | `node --import tsx --test evals/search-quality/ranking-v3-scorer-integration.test.ts && node --test scripts/satori-search-candidate-score.test.mjs` |

#### Waves D and E

| Task | Owned files/interface | Exact command/output |
|---|---|---|
| D1 | `scripts/tune-ranking-groups.mjs` | `node --test scripts/tune-ranking-groups.test.mjs` |
| D2 | `scripts/train-ranking-residual.mjs`; `ResidualModelV1` | `node --test scripts/train-ranking-residual.test.mjs` |
| D3 | `scripts/verify-ranking-policy-artifact.mjs` | `node --test scripts/verify-ranking-policy-artifact.test.mjs` |
| D4 | `scripts/ranking-counterfactuals.mjs` | `node --test scripts/ranking-counterfactuals.test.mjs` |
| D5 | resource contract/corpus plus `scripts/verify-ranking-v3-resource-contract.mjs` + test | `node --test scripts/verify-ranking-v3-resource-contract.test.mjs && node scripts/verify-ranking-v3-resource-contract.mjs --contract evals/search-ranking/ranking-v3-resource-contract.json --corpus "$TASK_OUTPUT/RESOURCE_CORPUS_MANIFEST.json"` |
| D6 | `scripts/run-ranking-lofo.mjs`, `scripts/score-ranking-fold.mjs`, `scripts/adjudicate-ranking-lofo.mjs` + tests | `node --test scripts/run-ranking-lofo.test.mjs scripts/score-ranking-fold.test.mjs scripts/adjudicate-ranking-lofo.test.mjs` |
| D7 | four source files in §4.4 | `node --import tsx --test packages/mcp/src/core/ranking-policy-v3.test.ts packages/mcp/src/core/neural-ranking-evidence.test.ts packages/mcp/src/core/neural-ranking-gate.test.ts packages/mcp/src/core/provider-slot-permutation.test.ts` |
| D8 | `scripts/build-ranking-policy-v3-artifact.mjs` + test; exports `buildRankingPolicyV3Artifact` | `node --test scripts/build-ranking-policy-v3-artifact.test.mjs` |
| E1.<familyId> | execute D2 | `node scripts/train-ranking-residual.mjs train --job "$FOLD_TRAIN_JOB" --out "$TASK_OUTPUT"` |
| E2.<familyId> | execute D6 scorer with D7/A12/B9 | `node scripts/score-ranking-fold.mjs --job "$FOLD_SCORE_JOB" --out "$TASK_OUTPUT"` |
| E3_INPUT_SEAL | execute D6 input seal | `node scripts/adjudicate-ranking-lofo.mjs seal-inputs --job "$E3_INPUT_JOB" --out "$TASK_OUTPUT/E3_INPUT_SEAL.json"` |
| E3 | execute D6 decision | `node scripts/adjudicate-ranking-lofo.mjs decide --job "$E3_DECISION_JOB" --input-seal "$E3_INPUT_SEAL" --out "$TASK_OUTPUT"` |
| E4 | refit, build through D8, verify through D3 | `node scripts/train-ranking-residual.mjs refit --job "$REFIT_JOB" --out "$TASK_OUTPUT/refit" && node scripts/build-ranking-policy-v3-artifact.mjs build --residual-model "$TASK_OUTPUT/refit/RESIDUAL_MODEL.json" --selection-receipt "$E3_SELECTION_RECEIPT" --qualification-target "$QUALIFICATION_TARGET" --feature-contract-index "$FEATURE_CONTRACT_INDEX" --training-manifest "$TRAINING_MANIFEST" --contract-seal "$CONTRACT_SEAL" --out "$TASK_OUTPUT/RANKING_POLICY_V3.json" && node scripts/verify-ranking-policy-artifact.mjs --artifact "$TASK_OUTPUT/RANKING_POLICY_V3.json" --activation-contract-index "$ACTIVATION_CONTRACT_INDEX"` |

D8's exact builder interface is:

```ts
function buildRankingPolicyV3Artifact(input: {
    residualModel: ResidualModelV1;
    selectedModeReceipt: E3SelectionReceiptV1;
    qualificationTarget: QualificationTargetV1;
    featureContractSha256: string;
    runtimeScoringContractId: string;
    retrievalContractId: string;
    trainingManifestSha256: string;
    trainingCodeSha256: string;
    trainingContractSha256: string;
}): RankingPolicyV3Artifact;
```

#### Waves F and G

| Task | Owned files/interface | Exact command/output |
|---|---|---|
| F0 | trusted root-bound filesystem | `node --import tsx --test packages/core/src/sync/root-bound-fs.ranking-v3.test.ts` |
| F1 | `ranking-policy-store.ts` | `node --import tsx --test packages/mcp/src/core/ranking-policy-store.test.ts` |
| F2 | `ranking-policy-qualification-store.ts` | `node --import tsx --test packages/mcp/src/core/ranking-policy-qualification-store.test.ts` |
| F6 | selector + config | `node --import tsx --test packages/mcp/src/core/ranking-policy-selector.test.ts packages/mcp/src/config.ranking-v3.test.ts` |
| F7 | ranked-set identity | `node --import tsx --test packages/mcp/src/core/search-result-set-identity.ranking-v3.test.ts` |
| F8 | bounded evaluation sink | `node --import tsx --test packages/mcp/src/core/ranking-shadow.test.ts` |
| F9 | exact APIs in §5.4 | `node --import tsx --test packages/mcp/src/core/ranking-policy-qualification-writer.test.ts` |
| G1 | residual integration | `node --import tsx --test packages/mcp/src/core/search-execution.ranking-v3-residual.test.ts` |
| G2 | provider request/permutation integration via A12/D7 | `node --import tsx --test packages/mcp/src/core/search-execution.ranking-v3-provider.test.ts` |
| G3 | diagnostics | `node --import tsx --test packages/mcp/src/core/search-types.ranking-v3.test.ts` |
| G4 | startup/runtime construction | `node --import tsx --test packages/mcp/src/core/ranking-policy-runtime.test.ts` |
| G5 | continuation sites from `CONTINUATION_SITES.json` | `node --import tsx --test packages/mcp/src/core/ranking-v3-continuation.test.ts` |
| G6 | runtime matrix | `node --import tsx --test packages/mcp/src/core/ranking-v3-runtime-matrix.test.ts` |
| G6A | resource harness | `node --test evals/search-ranking/ranking-v3-resource-harness.test.mjs` |
| G6B | CLI `scripts/ranking-v3-offline-qualification.mjs`; modules `ranking-v3-cycle-manifest.mjs`, `ranking-v3-offline-replay.mjs`, `ranking-v3-offline-gates.mjs`, `ranking-v3-offline-verdict.mjs`; owns `DhInputIndexV1`, `QualificationCycleManifestV1`, and H replay/gate entrypoints | `node --test scripts/ranking-v3-offline-qualification.test.mjs scripts/ranking-v3-cycle-manifest.test.mjs scripts/ranking-v3-offline-gates.test.mjs` |
| G6C | CLI `scripts/ranking-v3-heldout-activation.mjs`; modules `ranking-v3-registry-cycle.mjs`, `ranking-v3-heldout-execution.mjs`, `ranking-v3-heldout-adjudication.mjs`, `ranking-v3-rollout.mjs`; owns `PreHeldoutCycleManifestV1`, `ActivationCycleManifestV1`, H0/H10/I entrypoints, and `build-pre-heldout-cycle`/`build-activation-cycle` | `node --test scripts/ranking-v3-heldout-activation.test.mjs scripts/ranking-v3-registry-cycle.test.mjs scripts/ranking-v3-heldout-adjudication.test.mjs` |
| G7 | create implementation seal plus `scripts/verify-ranking-v3-implementation-seal.mjs` + test | `node --test scripts/verify-ranking-v3-implementation-seal.test.mjs && node scripts/verify-ranking-v3-implementation-seal.mjs --seal "$TASK_OUTPUT/IMPLEMENTATION_SEAL.json" --lockfile-authority "$LOCKFILE_AUTHORITY"` |

#### Waves H and I

DH first creates the exact input index through G6B's sealed schema authority, then
materializes both cycle manifests and builds the H/I card set:

```text
node scripts/ranking-v3-offline-qualification.mjs build-input-index
  --receipt-index "$PREREQUISITE_RECEIPT_INDEX"
  --activation-contract-index "$ACTIVATION_CONTRACT_INDEX"
  --lockfile-authority "$LOCKFILE_AUTHORITY"
  --out "$TASK_OUTPUT/DH_INPUT_INDEX.json"
node scripts/ranking-v3-offline-qualification.mjs build-cycle
  --input-index "$TASK_OUTPUT/DH_INPUT_INDEX.json"
  --out "$TASK_OUTPUT/QUALIFICATION_CYCLE_MANIFEST.json"
node scripts/ranking-v3-heldout-activation.mjs build-pre-heldout-cycle
  --input-index "$TASK_OUTPUT/DH_INPUT_INDEX.json"
  --out "$TASK_OUTPUT/PRE_HELDOUT_CYCLE_MANIFEST.json"
```

`$DH_INPUT_INDEX` is the first output above. G6B owns its parser; G6C imports the same
type and must reject any byte sequence that G6B would reject. DH cannot know H10's
future registry digest, so its pre-held-out manifest binds only H0/H10 command-input
descriptors and fixes `expectedPendingRegistrySha256: null`.

After H10 and `H_GATE_QUALIFIED`, DI creates the immutable Wave-I authority before
building any Wave-I card:

```text
node scripts/ranking-v3-heldout-activation.mjs build-activation-cycle
  --pre-heldout-cycle "$PRE_HELDOUT_CYCLE"
  --h10-transition-receipt "$H10_TRANSITION_RECEIPT"
  --out "$TASK_OUTPUT/ACTIVATION_CYCLE_MANIFEST.json"
```

G6C parses the H10 transition receipt, verifies that it is
`create_pending_heldout`, copies its `newRegistrySha256` into
`expectedPendingRegistrySha256`, binds the H10 receipt digest, and creates immutable
command-input descriptors for I0–I6/I3R. Every Wave-I command accepts
`--activation-cycle "$ACTIVATION_CYCLE"`; none accepts the pre-held-out manifest as its
Wave-I authority.

Every execution card uses one of those canonical manifests. The manifests fix all
source paths, receipt paths, artifact hashes, commands, and output directories.

| Card | Exact command | Output |
|---|---|---|
| H0 | `node scripts/ranking-v3-heldout-activation.mjs registry-ready --pre-heldout-cycle "$PRE_HELDOUT_CYCLE" --out "$TASK_OUTPUT"` | `RegistryReadyReceiptV1` |
| H1 | `node scripts/ranking-v3-offline-qualification.mjs baseline --cycle "$QUALIFICATION_CYCLE" --out "$TASK_OUTPUT"` | baseline replay receipt |
| H2 | `node scripts/ranking-v3-offline-qualification.mjs grouped --cycle "$QUALIFICATION_CYCLE" --out "$TASK_OUTPUT"` | diagnostic receipt |
| H3 | `node scripts/ranking-v3-offline-qualification.mjs selected --expected-mode disabled --cycle "$QUALIFICATION_CYCLE" --out "$TASK_OUTPUT"` | disabled selected-mode receipt |
| H4 | `node scripts/ranking-v3-offline-qualification.mjs selected --expected-mode provider_derived --cycle "$QUALIFICATION_CYCLE" --out "$TASK_OUTPUT"` | provider-derived selected-mode receipt |
| H6 | `node scripts/ranking-v3-offline-qualification.mjs slices --cycle "$QUALIFICATION_CYCLE" --out "$TASK_OUTPUT"` | slice receipt |
| H7 | `node scripts/ranking-v3-offline-qualification.mjs counterfactual --cycle "$QUALIFICATION_CYCLE" --out "$TASK_OUTPUT"` | counterfactual receipt |
| H8 | `node scripts/ranking-v3-offline-qualification.mjs resources --cycle "$QUALIFICATION_CYCLE" --out "$TASK_OUTPUT"` | resource receipt |
| H9 | `node scripts/ranking-v3-offline-qualification.mjs verdict --cycle "$QUALIFICATION_CYCLE" --out "$TASK_OUTPUT"` | offline verdict |
| H10 | `node scripts/ranking-v3-heldout-activation.mjs pending --pre-heldout-cycle "$PRE_HELDOUT_CYCLE" --out "$TASK_OUTPUT"` | pending transition |
| I0 | `node scripts/ranking-v3-heldout-activation.mjs authorize --activation-cycle "$ACTIVATION_CYCLE" --out "$TASK_OUTPUT"` | owner authorization |
| I1 | `node scripts/ranking-v3-heldout-activation.mjs open --activation-cycle "$ACTIVATION_CYCLE" --out "$TASK_OUTPUT"` | opening record |
| I2 | `node scripts/ranking-v3-heldout-activation.mjs execute --activation-cycle "$ACTIVATION_CYCLE" --out "$TASK_OUTPUT"` | execution receipt |
| I3 | `node scripts/ranking-v3-heldout-activation.mjs adjudicate --activation-cycle "$ACTIVATION_CYCLE" --out "$TASK_OUTPUT"` | acceptance or rejection |
| I4 | `node scripts/ranking-v3-heldout-activation.mjs activate --activation-cycle "$ACTIVATION_CYCLE" --out "$TASK_OUTPUT"` | activation transition |
| I3R | `node scripts/ranking-v3-heldout-activation.mjs reject --activation-cycle "$ACTIVATION_CYCLE" --out "$TASK_OUTPUT"` | rejection transition |
| I5 | `node scripts/ranking-v3-heldout-activation.mjs rollback-drill --activation-cycle "$ACTIVATION_CYCLE" --out "$TASK_OUTPUT"` | configuration-only rollback receipt |
| I6 | `node scripts/ranking-v3-heldout-activation.mjs limited-activation --activation-cycle "$ACTIVATION_CYCLE" --out "$TASK_OUTPUT"` | limited activation |

A card missing its catalog entry, prerequisite edge, cycle manifest, or exact command is
invalid.

### 7.6 Card-level RED and validation catalog

This section is mandatory input to the dispatch-card generator. A card is invalid when
its task or template has no matching row. Test names and initial failure meanings are
fixed; DX may substitute paths and digests but may not invent behavior.

#### Code-change cards

| Task | Test file and exact test name | Expected failure before implementation | Minimal passing behavior |
|---|---|---|---|
| R0.1A | `evals/search-quality/ranking-v3-fixture-repair.test.ts` — `repairs_all_three_stale_fixture_seams_without_product_changes` | the current fixture exits nonzero or reports `source_state_unverified` | all workloads are `ok`, expected owner ranks match, and production files are unchanged |
| R0.1V | `scripts/verify-ranking-v3-rebase.test.mjs` — `rejects_head_or_tree_not_equal_to_frozen_base`; `scripts/run-ranking-v3-baseline-capture.test.mjs` — `executes_only_inside_verified_detached_baseline_worktree` | verifier accepts a mismatched tree or wrapper executes from the caller worktree | mismatch is rejected; capture process cwd and tree digest equal the frozen base |
| R0.1B | `scripts/ranking-v3-dispatch-cards.test.mjs` — `manifest_includes_next_boundary_generator_and_rejects_unknown_catalog_task` | generator omits the next boundary card or accepts an uncataloged task | target tasks plus next generator are present and every task resolves to §§7.5–7.6 |
| R1.T0 | `scripts/ranking-qualification-target.test.mjs` — `writes_canonical_target_only_from_owner_target_decision_v1` | handwritten target JSON or unknown decision keys are accepted | only parsed `OwnerTargetDecisionV1` produces canonical target bytes |
| R1.T1 | `scripts/ranking-v3-task-graph.test.mjs` — `declaration_rehashes_plan_and_selected_replay_edges_are_exclusive` | declaration is invented outside the marked plan region, plan digest mismatches, or H6/H7/H8 require both H3 and H4 | canonical declaration rehashes the sealed plan and exactly one selected replay predecessor activates |
| R1.T2 | `scripts/ranking-v3-contract-seal.test.mjs` — `builds_canonical_contract_index_and_rejects_target_digest_mismatch` | seal tool accepts missing index entries or mixed target digests | exactly four ordered entries bind one target and seal successfully |
| A1 | `packages/core/src/core/semantic-search-candidate-trace.test.ts` — `rejects_unknown_trace_v2_keys` | trace parser accepts an unknown top-level key | exact-key parsing rejects it |
| A2 | `packages/mcp/src/core/search-ranking-evidence.test.ts` — `parses_only_post_admission_pre_residual_evidence` | evidence can be built before admission or include provider fields | timing and exact-key constraints are enforced |
| A3 | `packages/mcp/src/core/rerank-evidence.test.ts` — `rejects_incomplete_duplicate_foreign_or_non_finite_provider_response` | malformed provider responses parse successfully | only a complete finite permutation parses as `ValidatedRerankResponseV1` |
| A4 | `packages/mcp/src/core/ranking-features-v1.test.ts` — `feature_order_and_missing_indicators_match_sealed_contract` | extractor emits reordered or unsealed features | output order and missing indicators exactly match R1.1 |
| A5 | `packages/mcp/src/core/ranking-policy-artifact.test.ts` — `distinguishes_residual_descriptor_and_final_artifact_and_binds_r1_2_fields` | parser conflates forms or ignores request/gate fields | each form parses independently and final provider fields match R1.2 |
| A6 | `packages/mcp/src/core/ranking-policy-qualification.test.ts` — `rejects_duplicate_logical_entry_keys_and_noncanonical_order` | duplicate or unsorted entries are accepted | parser enforces unique tuple keys and canonical ordering |
| A7 | `packages/mcp/src/core/ranking-policy-identity.test.ts` — `disabled_mode_uses_reranker_disabled_v1` | disabled mode inherits a configured provider identity | canonical disabled identity is emitted |
| A8 | `scripts/ranking-judgments.test.mjs` — `unjudged_candidate_never_becomes_grade_zero` | missing grade is normalized to zero | unjudged remains explicit and excluded from pairs |
| A9 | `scripts/ranking-lofo-folds.test.mjs` — `related_repository_families_never_cross_fold_boundary` | related families split between train and excluded fold | family grouping remains atomic |
| A10 | `evals/search-quality/ranking-v3-metrics.test.ts` — `legacy_owner_metrics_remain_byte_compatible` | adding graded metrics changes legacy bytes | legacy outputs are byte-identical |
| A11Q | `packages/mcp/src/core/ranking-qualification-receipts.test.ts` — `qualification_and_registry_receipts_enforce_exact_fields_and_transition_chain` | missing registry-ready/grouped fields or mismatched I3 transition digest is accepted | all exact fields and transition-specific digest relationships validate |
| A11H | `packages/mcp/src/core/ranking-heldout-receipts.test.ts` — `heldout_chain_rejects_foreign_previous_receipt_digest` | an I2/I3/I4 chain with a foreign predecessor parses | exact predecessor digest equality is required |
| A12 | `packages/mcp/src/core/ranking-provider-request-v1.test.ts` — `builder_hashes_contract_and_rejects_expected_digest_mismatch` | a structurally valid contract whose canonical digest differs from `expectedProviderRequestContractSha256` is accepted | returned contract digest equals the canonical supplied contract and must equal the sealed R1.2 digest |
| B1 | `packages/core/src/core/vector-candidate-fusion.ranking-v3.test.ts` — `trace_records_raw_arm_and_core_fusion_ranks_without_product_change` | new trace fields are absent or product output changes | fields are present and product output remains equal |
| B2 | `packages/mcp/src/core/search-pass-evidence.test.ts` — `pass_evidence_contributions_are_stable_and_exact` | repeated construction differs or sums disagree | canonical repeated output and exact contribution sums |
| B3 | `packages/mcp/src/core/search-rerank-evidence-retention.test.ts` — `retains_one_complete_raw_validated_response_without_normalization` | scores are dropped or normalized fields are stored | raw authority is retained and derived fields are absent |
| B4 | `packages/mcp/src/core/search-ranking-evidence-assembler.test.ts` — `assembles_one_record_per_post_eligibility_candidate` | candidates are missing, duplicated, or assembled pre-admission | one post-admission record per eligible candidate |
| B5 | `packages/mcp/src/core/search-execution.ranking-v3-evidence.test.ts` — `evidence_hooks_preserve_baseline_enabled_and_disabled_envelopes` | instrumentation changes response bytes | both baseline envelopes remain identical |
| B6 | `scripts/satori-search-candidate-capture.test.mjs` — `survival_v3_round_trips_without_source_payload` | capture loses fields or stores source text | bounded schema round-trips and source payload is absent |
| B7 | `scripts/satori-search-candidate-replay.test.mjs` — `replay_rejects_unknown_contract_policy_or_target_digest` | replay accepts an unsealed digest | every authority digest must match |
| B8 | `packages/mcp/src/core/search-execution.ranking-v3-byte-identity.test.ts` — `phase0_envelopes_are_byte_identical` | baseline capture differs after instrumentation | exact bytes, order, removals, grouping, and disclosure match |
| B9 | `scripts/materialize-ranking-v3-corpus.test.mjs` — `corpus_binds_all_tuning_tasks_and_contains_raw_provider_authority_only` | tasks are missing, held-out appears, or normalized fields are stored | exact tuning coverage, target binding, and raw-only provider evidence |
| C1 | `scripts/build-ranking-judgment-packets.test.mjs` — `packet_manifest_covers_each_tuning_task_exactly_once` | missing or duplicate task appears | exact task partition is produced |
| C3S | `scripts/assemble-ranking-proposals.test.mjs` — `rejects_missing_duplicate_or_same_agent_proposals` | incomplete or non-independent proposals assemble | two different agents per task and complete coverage are required |
| C5 | `scripts/build-cross-repository-v4-tuning-manifest.test.mjs` — `manifest_is_tuning_only_and_binds_adjudicated_judgments` | held-out or unbound judgments enter the manifest | only tuning tasks and exact judgment digests are included |
| C6 | `evals/search-quality/ranking-v3-scorer-integration.test.ts` — `graded_stage_and_legacy_metrics_share_one_authority` | scorer disagrees with evaluator or changes legacy metrics | one evaluator authority produces all metrics |
| D1 | `scripts/tune-ranking-groups.test.mjs` — `search_is_reproducible_with_sealed_grid_seed_and_tiebreak` | repeat run selects different result | exact repeatability is proven |
| D2 | `scripts/train-ranking-residual.test.mjs` — `zero_residual_equals_pre_rerank_baseline_scores` | zero weights change any score | scorer-level equality holds |
| D3 | `scripts/verify-ranking-policy-artifact.test.mjs` — `verifies_residual_and_final_forms_independently` | verifier accepts cross-form or unreproducible bytes | each form is independently reproduced and checked |
| D4 | `scripts/ranking-counterfactuals.test.mjs` — `synthetic_shortcut_policy_fails` | known shortcut policy passes | protected-control counterfactual rejects it |
| D5 | `scripts/verify-ranking-v3-resource-contract.test.mjs` — `rejects_unsealed_workload_threshold_or_environment` | modified resource input verifies | all corpus and threshold digests must match |
| D6 | `scripts/adjudicate-ranking-lofo.test.mjs` — `required_comparator_unavailable_is_sealed_then_decided_only_by_e3` | input seal emits a terminal receipt or E3 proceeds as selected | input seal records `unavailable_required`; E3 alone emits one `E3InsufficientEvidenceReceiptV1` |
| D7 | `packages/mcp/src/core/provider-slot-permutation.test.ts` — `provider_permutation_is_final_complete_and_rank_contiguous` | incomplete permutation or later score sort is accepted | complete admitted permutation and contiguous final ranks |
| D8 | `scripts/build-ranking-policy-v3-artifact.test.mjs` — `builds_only_selected_mode_from_refit_and_sealed_authorities` | builder retains unselected provider behavior or omits provenance | exact selected artifact bytes are produced |
| F0 | `packages/core/src/sync/root-bound-fs.ranking-v3.test.ts` — `rejects_symlink_writable_replaced_or_nonregular_components` | unsafe path is accepted | descriptor-bound trusted hierarchy fails closed |
| F1 | `packages/mcp/src/core/ranking-policy-store.test.ts` — `hashes_opened_descriptor_bytes_not_path_reread` | swap after open changes verified bytes | digest is over the opened descriptor |
| F2 | `packages/mcp/src/core/ranking-policy-qualification-store.test.ts` — `selects_only_activation_qualified_exact_scope` | pending, revoked, or mismatched scope selects | only exact qualified entry selects |
| F6 | `packages/mcp/src/core/ranking-policy-selector.test.ts` — `disabled_requires_no_provider_and_provider_mode_requires_exact_full_identity` | disabled requires provider or provider mismatch selects | mode-specific selection is enforced |
| F7 | `packages/mcp/src/core/search-result-set-identity.ranking-v3.test.ts` — `policy_or_reranker_identity_change_stales_continuation` | continuation survives identity change | stale result is returned |
| F8 | `packages/mcp/src/core/ranking-shadow.test.ts` — `sink_never_persists_query_source_or_feature_vector` | forbidden content reaches sink | only bounded hashes/ranks/reasons are accepted |
| F9 | `packages/mcp/src/core/ranking-policy-qualification-writer.test.ts` — `same_previous_digest_allows_exactly_one_writer_and_preserves_chain` | concurrent writers both succeed or transition chain is not bound | one CAS succeeds and receipt chain is exact |
| G1 | `packages/mcp/src/core/search-execution.ranking-v3-residual.test.ts` — `residual_never_changes_admission_or_exact_control` | cutoff membership or exact result changes | frozen admission and exact-control bypass hold |
| G2 | `packages/mcp/src/core/search-execution.ranking-v3-provider.test.ts` — `provider_failure_preserves_deterministic_sequence_and_no_resort_occurs` | partial permutation or score resort is observable | deterministic fallback or final provider sequence is preserved |
| G3 | `packages/mcp/src/core/search-types.ranking-v3.test.ts` — `diagnostics_expose_score_and_final_rank_without_feature_dump` | final rank missing or features leak | bounded truthful projection only |
| G4 | `packages/mcp/src/core/ranking-policy-runtime.test.ts` — `startup_rejects_target_configuration_request_or_registry_mismatch` | any mismatched authority starts learned mode | baseline fallback with reason |
| G5 | `packages/mcp/src/core/ranking-v3-continuation.test.ts` — `continuation_never_reranks_and_stales_on_policy_change` | continuation invokes ranking or survives change | immutable set and stale identity behavior |
| G6 | `packages/mcp/src/core/ranking-v3-runtime-matrix.test.ts` — `covers_pending_revoked_wrong_scope_and_invalid_transition_evidence` | a matrix case is selectable | every invalid case falls back |
| G6A | `evals/search-ranking/ranking-v3-resource-harness.test.mjs` — `measures_actual_loaded_policy_path` | harness can measure a stub path | loaded runtime path and environment identity are bound |
| G6B | `scripts/ranking-v3-offline-qualification.test.mjs` — `selected_mode_emits_one_receipt_and_h9_binds_registry_context` | two normative receipts or missing H0 binding is accepted | one selected receipt and exact registry/grouped fields |
| G6C | `scripts/ranking-v3-heldout-activation.test.mjs` — `activation_cycle_binds_h10_pending_digest_and_terminal_chain` | Wave I accepts a null/pre-H10 manifest, wrong H10 receipt, or unrelated I3 digest | activation manifest binds H10's new registry digest and exactly one I4/I3R terminal chain |
| G7 | `scripts/verify-ranking-v3-implementation-seal.test.mjs` — `seal_uses_lockfile_authority_and_covers_every_h_i_entrypoint` | hardcoded lockfile or missing executable verifies | sealed authority path/digest and complete executable closure |

#### Evidence, human-decision, and execution cards

| Card or template | Exact unmet-precondition check | Exact validating assertion |
|---|---|---|
| R0.0 | hardening integration is not an ancestor or behavioral receipt is absent | ancestor check passes and receipt commit equals the tested HEAD |
| R0.1 | any required Gate-0 manifest is absent | all five manifests parse, hash, and bind the same frozen commit/tree |
| R0.2 | no detached verified baseline worktree exists | receipt proves capture process ran at `baselineCommit` and `baselineTreeSha256`, with held-out denied |
| R1.0 | no parsed `OwnerTargetDecisionV1` exists | canonical target verifies and receipt binds decision digest |
| R1.1–R1.4 | target digest or required input index is absent | contract index parses, canonical hash matches, and target digest is exact |
| R1.5 | graph declaration, family list, or one contract index is absent | graph validates, contract index has four entries, and seal rehashes |
| R1.6/DB/DC0/DC1/DD/DE/DF/DG/DH/DI | prerequisite gate/expansion/outcome receipt is absent | card-set manifest includes target scope plus next generator and binds current dispatch tree |
| A_GATE through I_GATE_* | at least one required edge authority is absent or mismatched | `GateReceiptV1` lists every resolved edge and the exact ready/terminal verdict |
| C1G | packet manifest from C1 receipt is absent | expansion IDs match template regex and every packet exactly once |
| C2.<packetId> | candidate pool file does not exist | pool parser binds packet/task/capture/tree digests and contains no grades |
| C3A.<packetId>/C3B.<packetId> | assigned independent proposal is absent | proposal parser validates source rationale and agent differs from counterpart |
| C4 | C3S assembly receipt is absent | every judged grade has source rationale; unresolved candidates remain unjudged |
| E1.<familyId> | fold train job or prerequisite digests are absent | residual model and D3 receipt agree on canonical digest |
| E2.<familyId> | fold score job, B9 raw authority, or D7 executable digest is absent | all target-permitted descriptors have one score receipt and derived evidence digest |
| E3_INPUT_SEAL | one E2 receipt is absent | exact E2 set is sealed and grouped comparator state is exactly `available`, `unavailable_optional`, or `unavailable_required`; no terminal E3 receipt is emitted |
| E3 | input seal is absent | exactly one parsed `E3OutcomeReceiptV1` is produced |
| E4 | selected E3 receipt is absent | refit model, final artifact, activation index, and D3 receipt agree |
| H0/H10 | required pre-held-out command-input descriptor is absent | output receipt parses and binds the pre-held-out manifest, artifact, seals, registry authority, and predecessor authorities |
| H1–H9 | required qualification-cycle command-input descriptor is absent | output receipt parses and binds the qualification cycle, artifact, seals, and predecessor authorities |
| I0–I6/I3R | activation-cycle manifest or required predecessor is absent | exactly one chain successor parses, binds the H10 pending-registry digest, and keeps acceptance/rejection paths exclusive |


## 8. Gate acceptance criteria

### 8.1 Gate 0 and bootstrap

Hardening and fixture acceptance pass; R0.1 freezes the exact baseline commit and emits
source/runtime/lockfile manifests. R0.1V tooling tests pass. R0.1B's dispatch tool is tested and generates
R0.2/R1.T0/R1.0 plus the R1.0B boundary-generator card. R0.2 reproduces baseline outputs. R1.T0 validates target canonical
bytes; R1.0 emits the target; R1.0B generates target-bound Gate-1 cards plus the R1.6 boundary-generator card.

### 8.2 Gate 1

R1.T1 graph tests prove `oneOf` disjunction, reject deadline edges, canonicalize the marked declaration source, bind `planSha256`, and prove H6/H7/H8 activate exactly one of H3/H4. R1.T2 contract-tool tests pass. R1.1–R1.4 bind the exact target digest. R1.5 creates `CONTRACT_INDEX.json` and seals the base task
graph with templates, request contract, and contracts; no graph/seal digest cycle exists.
R1.6 cards bind the target, graph, contract seal, `baselineCommit`, and current
`dispatchCommit`.

### 8.3 Wave A gate

All A1–A10, A11Q, A11H, and A12 exact-file tests pass. Parsers reject unknown fields and canonical round trips
are stable. A3 and D7 ownership do not overlap. No central runtime file changes.

### 8.4 Wave B instrumentation gate

All B tests pass; baseline envelopes remain byte-identical; `CORPUS_MANIFEST.json`
exists and binds all expected tuning tasks, exact target/service class, capture count,
raw validated provider authority when applicable, and a tuning-only proof. No normalized
neural evidence appears in B9.

### 8.5 Wave C training-authority gate

C1 packet manifest is sealed; C1G graph expansion validates against templates; DC1 cards
bind the expansion receipt. Every task has two independent proposals, C3S assembly is
complete, adjudication is explicit, and the v4 tuning manifest/scorer are sealed.

### 8.6 Wave D tooling gate

D2 emits canonical mode-neutral residual models; D3 verifies them; D4 shortcut tests
fail synthetic bias; D5 resource inputs are sealed; D6 fold scorer/adjudicator tests
pass; D7 exact interfaces and rank validation pass; D8 builds the final artifact reproducibly. D1 status is recorded according to
the sealed comparator deadline.

### 8.7 Wave E selection gate

Every fold has a verified residual model and all permitted contender descriptors. E3
input seal records D1 availability. Exactly one outcome branch is taken. Selected
outcomes produce a D3-verified E4 artifact and enable DF; `insufficient_evidence` and
`learned_not_justified` produce terminal gate receipts and do not dispatch Wave F.

### 8.8 Wave F module gate

Trusted-file, store, selector, identity, shadow, and writer tests pass. Disabled learned
mode uses canonical ranked-set reranker identity `reranker_disabled_v1` and never
inherits a configured provider identity. Registry transformations preserve canonical
ordering and replace exactly one logical key. No product path can select pending,
revoked, incompatible, or configuration-mismatched entries.

### 8.9 Wave G runtime gate

Baseline remains default. Provider-derived fallback preserves the deterministic V3
sequence with no partial permutation. No score sort can undo provider order. Startup
matches provider identity, configuration digest, and request-contract digest. G7 binds
source/built outputs, exact commands/tests, Node version, and the Gate-0-resolved
`pnpm-lock.yaml` digest. Every H/I entrypoint is named and sealed.

### 8.10 Wave H qualification gate

H cards invoke the exact G6B/G6C entrypoints. Exactly one selected replay receipt exists.
DH's pre-held-out manifest contains no future H10 digest. H9 emits one outcome.
Offline-qualified creates H10; DI then builds an activation manifest whose expected
pending digest equals H10's `newRegistrySha256` before any Wave-I card is generated.
Rejected or insufficient evidence terminates without H10 or held-out opening.

### 8.11 Wave I activation gate

Every Wave-I command consumes `ActivationCycleManifestV1`. I3 emits exactly one accepted
or rejected receipt. Acceptance performs I4, I5, and I6. Rejection performs I3R only.
Both transitions start from the activation-manifest/I1-verified H10 digest and terminate
the pending logical entry.

## 9. Terminal outcomes and risks

### 9.1 Terminal outcomes

All stopping points retain baseline B:

1. **Instrumentation rejected** — byte identity or evidence authority fails.
2. **Training insufficient** — labels, fold coverage, or deterministic reproduction
   inadequate.
3. **Tuning insufficient** — the exact E4 artifact fails a preregistered gate; held-out
   stays closed. A material grouped-comparator win is a variant of this outcome:
   learned ranking is not justified and a separate deterministic-retuning production
   plan is opened.
4. **Held-out rejected** — the one selected artifact fails; the pending entry is
   revoked with reason `heldout_rejected`; no post-opening changes.

Only a held-out-accepted, resource-qualified, registry-bound artifact may proceed to
controlled activation; `learned_v3` becomes selectable no earlier than I4.

### 9.2 Risks

- **Hardening prerequisite**: Gate 0 stays blocked until the hardening merge and its
  behavioral receipt pass at the frozen HEAD; ancestry alone is not evidence.
- **Fixture authority**: the search-quality fixture is RED at the base; R0.1A is a
  prerequisite for any baseline capture; never weaken fixtures or assertions to pass.
- **Admission parity**: residual scoring must not change admission; zero-failure tests
  and the baseline admission snapshot cover it.
- **LOFO data size**: six tuning families is a small population; the aggregation rule
  and `insufficient_evidence` threshold are preregistered.
- **Grading effort**: human-adjudicated grades are the critical path; packet bounds
  and the two-proposal protocol keep it tractable.
- **Calibration and comparability**: raw reranker score distributions are
  uncharacterized; D7/G6A measure and verify within-query evidence behavior on graded
  pairs before any provider-derived use; D5 remains contract-only.
- **Platform semantics**: O_NOFOLLOW, inode checks, boot/process identities, atomic
  rename and directory fsync differ across platforms; where guarantees are
  unimplementable, external learned-policy loading and registry mutation are disabled
  with baseline selected and a truthful diagnostic.
- **Provider binding**: the sealed target cannot change after tuning begins; capture
  and evaluation bind the exact provider/model/projection.
- **Trust chain**: artifact validation is schema + range + applicability union +
  SHA-256s; the training pipeline is reproducible (seeded, pinned); D3 independently
  verifies; F0 hardens loading; G7 seals the complete Wave H/I executable chain.
- **Registry state**: append-only versions, exclusive locking, and the pending-entry
  termination on both acceptance and rejection prevent stale-state deadlocks.

## 9.3 Final dispatch-approval verification

Before R0.1B generates any card against this plan, run these focused checks and seal
their outputs in the planning-verification receipt:

```text
1. TaskGraphDeclarationV1 canonical rehash equals planSha256.
2. E3 input seal with unavailable_required produces no terminal receipt; E3 emits the sole insufficient-evidence receipt.
3. A12 rejects a structurally valid request contract whose canonical digest differs from the R1.2 index.
4. DI rejects any activation-cycle build whose H10 receipt is absent, wrong-kind, or binds a different pending registry digest.
5. H6/H7/H8 resolve exactly one H3/H4 conditional predecessor.
6. ContractSealV1 includes planSha256 and canonical rehash passes.
7. Every generated card has a Task Interface Catalog entry and exact RED or unmet-precondition assertion.
```

## 10. Evidence index

Line numbers are snapshots of the stated base; symbol names and commit-bound links are
primary. The authoritative anchor manifest is `SOURCE_ANCHORS.json` (R0.1).

| Claim | Where verified |
|---|---|
| Final-score formula | `packages/mcp/src/core/search-ranking-policy.ts` `computeSearchCandidateFinalScore` |
| Rerank blend (rank-only, inside fusionScore) | `packages/mcp/src/core/search-execution.ts` (blend `1/(10+rank)`, weight 1.0) |
| Raw score discard | `search-execution.ts` (`rerankResults`, line 566 at base); `voyageai-reranker.ts` `relevance_score`; `lateon-reranker.ts` / `lateon-reranker-worker.ts` `maxSimScore` |
| RRF constants 100/60/10 + weight 1.0 | `packages/core/src/core/vector-candidate-fusion.ts` `VECTOR_CANDIDATE_RRF_K_V1`; `search-constants.ts` `SEARCH_RRF_K`, `SEARCH_RERANK_RRF_K`, `SEARCH_RERANK_WEIGHT` |
| Candidate depth clamp | `search-policy.ts` (`SEARCH_MIN_CANDIDATES` 32, `SEARCH_CANDIDATE_MULTIPLIER` 8, max 80) |
| Intent booleans + 3-level confidence | `search-query-planning.ts` `buildSearchQueryPlan` |
| Lexical weights per intent | `search-query-planning.ts` (1.35/1.35/0.10/0.30/0.60/0.00/0.18) |
| Exact-pin rerank skip | `shouldSkipRerankForExactPin`, `search-execution.ts` |
| Entrypoint owner evidence scope | `entrypoint-owner-evidence.ts` (pyproject `[project.scripts]`) |
| Binding + continuation revalidation | `search-result-set-identity.ts`; `handlers.ts` → `SEARCH_RESULT_SET_STALE` |
| No calibration; no nDCG; no stage survival | repository-wide searches (none) |
| Manifests + splits | `evals/search-ranking/cross-repository-v2.manifest.json` (3+3), `cross-repository-v3.manifest.json` (6 tuning + 6 held-out) |
| Eval pipeline + binary scoring | `scripts/satori-search-candidate-{capture,replay,score}.mjs`; `satori-ranking-{r2,r3}.mjs`; package.json `eval:*` |
| W-fix landed | bounded `must_lane` + retry prefixes, reranker retry/timeout telemetry; `docs/evidence/search-integrity-baseline-20260805/BASELINE.md` |
| Deep-plan invariants | `docs/plans/SATORI_DEEP_LATEON_RERANKING_AND_PAGINATED_DISCLOSURE_PLAN.md` |
| Sealed-contender mechanism | `docs/plans/SATORI_CROSS_REPOSITORY_RANKING_ABLATION_PLAN.md` |
| Hardening unmerged at base | `git merge-base HEAD integrate/security-hardening-20260805` = `94a3dc6` (R0.0 resolves) |
| Fixture RED at base | `pnpm eval:search-quality` → `source_state_unverified` chain (R0.1A resolves) |
