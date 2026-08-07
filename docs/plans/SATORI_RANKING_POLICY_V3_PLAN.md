# Satori Ranking Policy V3 Implementation Plan

> **ABANDONED / DO NOT EXECUTE.** This document is retained as historical planning
> context only. It has no dispatch, runtime, registry, receipt, experiment, grading,
> qualification, or release-gate authority. The active replacement is
> `docs/superpowers/specs/2026-08-07-native-reranker-ordering-design.md`.

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

### 1.1 Gate-0 sequence

The execution base is created in this exact order:

```text
merge and verify security hardening
→ repair the search-quality fixture
→ rerun or bind the hardening acceptance suite to the resulting HEAD
→ freeze the post-hardening, post-repair HEAD
→ generate R0.2 and Gate-1 cards
→ capture the baseline
→ seal Gate-1 contracts
```

The fixture repair (R0.1A) lands **before** the freeze, so the frozen HEAD and every
card bound to it describe the actual baseline-capture base.

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

Dispatch authority comes only from the current R0.1B or DX.<wave> card-set manifest.

Each card represents one dispatch unit.

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
```

A `documentation`, `evidence`, or `execution` card requires:

```text
unmet-precondition verifier
→ task execution
→ validating verifier
```

A `human_decision` card requires:

```text
input checklist
→ owned decision artifact
→ schema and digest validation
```

R0.1, R0.1A, and R0.1B are owner-authorized planning and bootstrap tasks; they are not
card-generated.

Every `code_change` card requires one independent code review before merge.

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
8. One provider/model per qualification cycle. The provider-derived target is sealed
   before any tuning evidence is generated and cannot change afterward.
9. Qualification is mode-dependent: a `disabled` artifact has no provider and no
   qualified rerankers; a `provider_derived` artifact has exactly one qualified
   reranker matching the sealed target.
10. No unqualified artifact is loadable by product configuration. Product selection
    returns `learned_v3` only for an `activation_qualified` registry entry whose
    qualified scope matches the artifact mode and the active reranker identity.
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
    postPolicyRank: number;
}
```

An authoritative ordered array may be used instead, provided `postPolicyRank` and the
array order cannot disagree.

Tests must prove that no score-based sort can undo a provider-derived permutation.

### 4.4 Shared ranking-policy application library (D7)

The residual scorer, neural evidence normalizer, pure gate, admitted-slot permutation,
and final-sequence construction live in one shared library created **before Wave E**
(consumed by E2 fold scoring, G1/G2 runtime integration, G6B offline qualification, and
H3/H4 replay). No evaluation-only or runtime-only duplicate implementation is allowed.

Dependencies: A3, A4, A5, R1.0, R1.1, R1.2, R1.4. Its tests use synthetic exact-contract fixtures; evaluation data remains an E2 input.

Creates:

- `packages/mcp/src/core/ranking-policy-v3.ts`
- `packages/mcp/src/core/neural-ranking-evidence.ts`
- `packages/mcp/src/core/neural-ranking-gate.ts`
- `packages/mcp/src/core/provider-slot-permutation.ts`
- focused tests for each module

Owns these exact public interfaces:

```ts
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
    | { decision: "skip"; reason: "mode_disabled" | "exact_control" | "insufficient_margin" | "insufficient_candidates" }
    | { decision: "fallback_deterministic"; reason: "provider_mismatch" | "invalid_response" | "identity_mismatch" | "non_finite_score" };

interface ProviderSlotPermutationInput {
    deterministicOrder: readonly RankedCandidateV3[];
    baselineAdmissionIds: readonly string[];
    providerOrder: readonly string[];
}

function scoreDeterministicV3(
    input: DeterministicV3ScoreInput,
): DeterministicV3ScoreResult;

function buildNeuralRankingEvidence(input: {
    providerKey: string;
    candidateIds: readonly string[];
    providerResults: readonly { candidateId: string; rank: number; rawScore: number }[];
}): NeuralRankingEvidenceV1[];

type NeuralGateInput =
    | {
        policy: { mode: "disabled" };
        target: QualificationTargetV1;
        exactControlOwnsResult: boolean;
        baselineAdmissionIds: readonly string[];
    }
    | {
        policy: Extract<NeuralReorderPolicy, { mode: "provider_derived" }>;
        target: Extract<QualificationTargetV1, { mode: "provider_derived" }>;
        activeIdentity: QualifiedRerankerV1;
        evidence: readonly NeuralRankingEvidenceV1[];
        exactControlOwnsResult: boolean;
        baselineAdmissionIds: readonly string[];
    };

function evaluateNeuralGate(input: NeuralGateInput): NeuralGateDecision;

function applyProviderSlotPermutation(
    input: ProviderSlotPermutationInput,
): RankedCandidateV3[];
```

`applyProviderSlotPermutation` rejects duplicates, omissions, foreign IDs, or any
provider order that is not a complete permutation of `baselineAdmissionIds`. E2,
G1/G2, and G6B import these functions directly. H3/H4 invoke them through the
G6B-sealed replay entrypoints. No consumer may copy their formulas or reimplement the
permutation.

### 4.5 The neural gate is pure

The neural confidence gate validates only:

- artifact execution mode;
- the preregistered provider target;
- supplied provider, model, and projection identities;
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

### 5.3 Policy artifact

`RankingPolicyV3Artifact`: `schemaVersion: 3`, `policyId: "search_ranking_policy_v3"`,
`featureSchema: "search_features_v1"`, `createdFromCommit`,
`trainingManifestSha256`, `trainingCodeSha256`, `trainingContractSha256`,
`normalization`, `weights`, `residualBounds`, `neuralReorderPolicy`, `applicability`.
No self-hash and no quality receipt inside; the runtime computes SHA-256 over
canonical bytes.

```ts
type NeuralReorderPolicy =
    | { mode: "disabled" }
    | {
        mode: "provider_derived";
        providerKey: string;
        minimumCandidates: number;
        minimumNormalizedTopToSecondMargin: number;
    };
```

E4 serializes only the E3-selected union member: provider constants exist only for
`provider_derived`; a `disabled` artifact contains no provider map and no neural gate
parameters.

```ts
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
    };
```

Do not permit:

```text
null
"none"
missing-or-null alternatives
sentinel provider identities
```

For disabled mode the projection field is absent.

For `provider_derived`,
`neuralReorderPolicy.providerKey === applicability.supportedProviderKeys[0] ===
qualificationTarget.providerKey`; for `disabled`, no provider fields exist. A5, A11,
F6, G4, H9, H10, I3R, and I4 enforce the same union.

### 5.4 Qualification registry

```ts
interface QualifiedRerankerV1 {
    providerKey: string;
    rerankerIdentity: string;
    rerankerProjectionIdentity: string;
}

interface RankingPolicyQualificationRegistryV1 {
    schemaVersion: "ranking_policy_qualification_registry_v1";
    entries: readonly QualificationRegistryEntryV1[];
}

interface QualificationRegistryEntryBaseV1 {
    artifactSha256: string;
    serviceClass: "online" | "offline_linux_x64";
    selectedArtifactMode: "disabled" | "provider_derived";
    qualificationScopeKey: string;
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

The two terminal reasons are not interchangeable.

`qualificationScopeKey = sha256(canonicalJSON({ serviceClass, selectedArtifactMode,
qualifiedRerankers }))` with canonical ordering and no duplicates. For `disabled`,
`qualifiedRerankers` is empty; for `provider_derived` it contains exactly one entry
matching the sealed target.

Storage layout (append-only):

```text
qualification-registry/
  versions/<registry-sha256>.json          # one immutable version per transition
  receipts/<registry-sha256>.receipt.json
  current                                  # current registry snapshot pointer; regular file, 64-hex
                                           # SHA-256 + optional final newline, byte
                                           # ceiling, temp+atomic replace, F0 read-back
```

Transition procedure (under an exclusive lock — `O_CREAT|O_EXCL` lock file with
provably-dead-owner recovery, OS file lock, or single-owner broker, chosen in R1.4):
verify the digest referenced by `current`; write the new version under its content
digest (`O_CREAT|O_EXCL`; existing file must be byte-identical or fail closed); fsync;
write and fsync the receipt; atomically replace `current`; fsync the directory; read
back through the trusted loader; release the lock.

Cardinality invariant: multiple historically `activation_qualified` artifacts may
remain recorded; configuration selects exactly one artifact hash; at most one pending
candidate per qualification scope; activation of the pending candidate never
automatically changes product configuration.

The registry begins with one canonical empty version:

```json
{"schemaVersion":"ranking_policy_qualification_registry_v1","entries":[]}
```

Its canonical SHA-256 is the genesis digest referenced by the first transition; no
null, missing, or sentinel previous digest is permitted. F9 creates that genesis only when the trusted registry root contains no `current`,
version, receipt, or lock files, and writes a `RegistryInitializationReceiptV1` bound to
the canonical empty bytes, trusted root identity, platform capability decision, and G7
implementation seal.

F9 exposes only the following initialization and transition-specific operations:

```ts
type ServiceClass = "online" | "offline_linux_x64";

interface RegistryTransitionResult {
    previousRegistrySha256: string;
    newRegistrySha256: string;
    registryTransitionReceiptSha256: string;
}

function initializeQualificationRegistry(input: {
    registryRoot: string;
    initializationReceipt: RegistryInitializationReceiptV1;
}): {
    genesisRegistrySha256: string;
    registryInitializationReceiptSha256: string;
};

function createPendingHeldoutVersion(input: {
    expectedRegistrySha256: string;
    artifactSha256: string;
    serviceClass: ServiceClass;
    offlineQualificationReceipt: OfflineQualificationReceiptV1;
}): RegistryTransitionResult;

function activatePendingVersion(input: {
    expectedRegistrySha256: string;
    artifactSha256: string;
    serviceClass: ServiceClass;
    heldoutAcceptanceReceipt: HeldoutAcceptanceReceiptV1;
}): RegistryTransitionResult;

function rejectPendingVersion(input: {
    expectedRegistrySha256: string;
    artifactSha256: string;
    serviceClass: ServiceClass;
    heldoutRejectionReceipt: HeldoutRejectionReceiptV1;
}): RegistryTransitionResult;

function revokeArtifact(input: {
    expectedRegistrySha256: string;
    artifactSha256: string;
    serviceClass: ServiceClass;
    revocationAuthorizationReceipt: RevocationAuthorizationReceiptV1;
}): RegistryTransitionResult;
```

Initialization fails closed unless the trusted registry root is empty and passes F0
ancestor, ownership, permission, symlink, and replacement checks. Each transition
accepts an already parsed exact-key receipt object and validates its artifact, service
class, selected mode, qualification scope, prior-receipt chain, G7 seal, and manifest
bindings—not merely a caller-supplied hash.

### 5.5 Receipts

Receipt types (exact-key schemas and parsers in A11): `OfflineQualificationReceiptV1`,
`HeldoutAcceptanceReceiptV1`, `HeldoutRejectionReceiptV1`,
`RevocationAuthorizationReceiptV1`, `RegistryInitializationReceiptV1`,
`RegistryReadyReceiptV1`, `RegistryTransitionReceiptV1`,
`OwnerAuthorizationReceiptV1`, `HeldoutOpeningRecordV1`, and
`HeldoutExecutionReceiptV1`. Every receipt includes `schemaVersion`, `receiptType`,
`issuedAt`, `issuerIdentity`, `contractSealSha256`, and `implementationSealSha256`.
Artifact-bound receipts additionally require `artifactSha256`, `serviceClass`,
`selectedArtifactMode`, and `qualificationScopeKey`. Registry initialization/readiness
receipts instead require `registryRootIdentity`, `currentRegistrySha256`,
`platformCapabilityDecisionSha256`, and the initialization-receipt digest when a new
genesis was created. Chain receipts additionally contain `previousReceiptSha256`. The
chain `I0 → I1 → I2 → I3 → (I4 | I3R)` is enforced by exact digest equality. The
rejection receipt binds the I0/I1/I2 digests, held-out results digest, held-out manifest
digest, artifact and qualification scope, and a terminal `rejected` decision.
Acceptance and rejection receipts are mutually exclusive for one opening record.

### 5.6 Storage and identity

Storage consists of:

- the built-in deterministic baseline implementation;
- an optional administrator-controlled trusted learned-artifact path;
- an administrator-controlled append-only qualification registry.

No qualified artifact or registry is bundled in V3.0.

Repository-local ranking-policy files are forbidden.

Composite policy identity: `search_ranking_policy_v3:<artifact-sha256>` carried by the
existing `rankingPolicyIdentity` field of the ranked-set binding; a continuation
created under another artifact becomes stale via the existing revalidation. Policy
hash appears in startup diagnostics, search diagnostics, and ranked-set bindings, not
in index publication receipts.

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
packet agents (C2/C3 packet-scoped paths; C3A validates and assembles), then one
human/adjudicator resolution (C4). The v4 tuning manifest carries the leakage contract
and never rewrites held-out authority. Held-out restrictions: do not execute held-out
queries, create held-out captures, inspect held-out contender outputs, or use held-out
judgments or outcomes for design, grading, feature selection, hyperparameter
selection, or debugging; sealed manifest digests may be read for opening verification.

### 6.3 Corpus

B9 materializes and seals the tuning survival-v3 corpus: all six tuning families run
with the instrumented code, producing `search_candidate_survival_v3` captures bound to
frozen repository/tree/query/task digests plus product-output digests, sealed in one
corpus manifest. R0.2's pre-instrumentation captures remain the byte-identity
baseline; B9 is the feature/training corpus.

When the target mode is `provider_derived`, each provider-derived capture binds:

```text
serviceClass
providerKey
rerankerIdentity
rerankerProjectionIdentity
providerConfigurationDigest
admitted candidate-set digest
complete returned candidate order
finite raw scores
normalized evidence
request digest
response digest
timeout and failure outcome
```

### 6.4 Provider target

R1.0 is the first Gate-1 task, a `human_decision` card, and the single target
authority. It reads no tuning outputs and writes
`docs/evidence/ranking-v3-contract-<date>/QUALIFICATION_TARGET.json` before R1.1–R1.4.
The four contracts consume its SHA-256 and may not restate or mutate the target.

```ts
type QualificationTargetV1 =
    | {
        mode: "disabled";
        serviceClass: "online" | "offline_linux_x64";
    }
    | {
        mode: "provider_derived";
        serviceClass: "online" | "offline_linux_x64";
        providerKey: string;
        rerankerIdentity: string;
        rerankerProjectionIdentity: string;
        providerConfigurationDigest: string;
    };
```

R1.0 writes the canonical target bytes. R1.1–R1.4 reference the target SHA-256;
R1.2 defines provider-gate semantics conditional on that target, and R1.4 defines the
artifact/registry compatibility rules. R1.5 seals the target digest with all four
contracts and writes `TASK_GRAPH.json` before B9.

When the target mode is `disabled`:

- B9 performs no provider-derived captures;
- the provider-derived contender is absent from R1.3;
- E2 does not score a provider-derived contender;
- E3 cannot select `provider_derived`;
- the artifact contains no provider policy.

When the target mode is `provider_derived`:

- exactly one service class and provider/model/projection target are sealed;
- B9 captures evidence only for that target;
- E2 evaluates only that target;
- E3 may choose whether to deploy the provider-derived composition, but may not change
  the provider/model/projection target.

### 6.5 Contenders

- Baseline B (current product policy).
- Grouped tuned baseline (D1): a diagnostic comparator only. Its exact grid, search
  order, seed, tie-breaking, and stopping rule are sealed in R1.2; its policy in R1.3
  is sealed as `required | optional`. It is never a deployable learned artifact; a
  material grouped win means learned ranking is not justified and opens a separate
  deterministic-retuning production plan.
- Deterministic residual (learned, mode `disabled`).
- Residual + provider-derived reorder (learned, mode `provider_derived`) only when
  `QUALIFICATION_TARGET.json` selects `provider_derived`; it is absent otherwise.

E3 selects the model family, hyperparameters, and execution mode from out-of-fold
results only, or records `insufficient_evidence`. E3 may select the mode but never the
provider/model.

### 6.6 LOFO selection

Leave-one-repository-family-out over the six tuning families; hyperparameters selected
from out-of-fold results only; then one refit (E4) under the sealed contract. E4
serializes only the E3-selected mode and is independently verified (D3). The exact E4
artifact is the single object Wave H qualifies.

### 6.7 Offline qualification (Wave H)

H0 runs first on G7-sealed F9/G6C tooling. It validates the trusted registry root;
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

I4 depends on an accepted I3 receipt. I3R depends on a rejected I3 receipt. Both use
the exact H10 registry digest verified by I1. I5 and I6 occur only after successful
I4; they never follow I3R. I4 is the first point at which the product selector may
return `learned_v3`. Post-opening configuration selection is limited to baseline and
already sealed, activation-qualified hashes, recorded in append-only rollout receipts.

## 7. Execution graph and task ownership

### 7.1 Central-file ownership

| File | Exclusive owner |
|---|---|
| `packages/mcp/src/core/search-execution.ts` | B5 (evidence integration), then G1/G2 (runtime integration) — sequential |
| `packages/mcp/src/core/search-types.ts` | G3 only |
| `packages/mcp/src/config.ts` | F6 only |
| `packages/mcp/src/core/search-result-set-identity.ts` | F7 (test-first) only |
| `scripts/satori-search-candidate-capture.mjs` | B6 only |
| `scripts/satori-search-candidate-replay.mjs` | B7 only |
| `scripts/satori-search-candidate-score.mjs` | C6 backward-compatibility adapter only |
| `evals/search-quality/search-quality-evaluation.ts` | R0.1A → A10 → C6 (sequential) |

### 7.2 Task graph

R1.5 produces the machine-readable authority
`docs/evidence/ranking-v3-contract-<date>/TASK_GRAPH.json`:

```json
{
  "schemaVersion": "ranking_v3_task_graph_v1",
  "planSha256": "<sha256-of-canonical-plan-bytes>",
  "nodes": [{ "taskId": "A1", "wave": "A", "cardType": "code_change" }],
  "edges": [{ "taskId": "B1", "requires": "A1" }],
  "conditionalEdges": [{
    "taskId": "E3",
    "requires": "D1",
    "condition": "decisionContract.groupedComparator == required"
  }]
}
```

The file contains every task, gate-receipt node, and DX boundary node, not only the
examples above. It is canonicalized by task ID and edge tuple and rejects duplicate
nodes/edges. R1.5 writes `TASK_GRAPH.json` first, then writes `CONTRACT_SEAL.json` whose
inputs include the graph, target, and R1.1–R1.4 digests; the graph never contains the
seal digest and therefore cannot self-reference. Notation below is `TASK <-
prerequisites`; every implementation/execution task
also depends on its current unrevoked DX card-set manifest.

```text
R0.1A <- R0.0
R0.1 <- R0.1A
R0.1B <- R0.1
R0.2 <- R0.1B
R1.0 <- R0.2
R1.1 <- R1.0
R1.2 <- R1.0
R1.3 <- R1.0
R1.4 <- R1.0
R1.5 <- R1.1, R1.2, R1.3, R1.4
R1.6/DA <- R1.5, R0.1B

A1 <- R1.1, R1.5, DA
A2 <- R1.1, R1.5, DA
A3 <- R1.2, R1.5, DA
A4 <- A2, R1.1, DA
A5 <- R1.2, R1.4, DA
A6 <- R1.4, DA
A7 <- R1.4, DA
A8 <- R1.3, DA
A9 <- R1.3, DA
A10 <- R1.3, DA
A11 <- R1.4, DA
A_GATE <- A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11
DB <- A_GATE, DA

B1 <- A1, DB
B2 <- A2, DB
B3 <- A3, DB
B4 <- A2, A4, B2, DB
B5 <- B1, B2, B3, B4, DB
B6 <- B5, DB
B7 <- B6, DB
B8 <- B5, B6, B7, DB
B9 <- B8, R1.0, DB
B_GATE <- B1, B2, B3, B4, B5, B6, B7, B8, B9
DC <- B_GATE, DB

C1 <- A8, B9, DC
C2.* <- C1, DC
C3.* <- corresponding C2.*, DC
C3A <- all C3.*, DC
C4 <- C3A, DC
C5 <- C4, DC
C6 <- A10, C5, B7, DC
C_GATE <- C1, all C2.*, all C3.*, C3A, C4, C5, C6
DD <- C_GATE, DC

D1 <- C6, R1.2, R1.3, DD
D2 <- A4, A5, C6, R1.2, DD
D3 <- A5, D2, DD
D4 <- A4, R1.3, DD
D5 <- A4, A5, R1.3, DD
D6 <- A9, D2, D3, DD
D7 <- A3, A4, A5, R1.0, R1.1, R1.2, R1.4, DD
D_GATE <- D2, D3, D4, D5, D6, D7; D1 only when R1.3 marks comparator required
DE <- D_GATE, DD

E1.* <- D6, DE
E2.* <- corresponding E1.*, B9, D4, D7, DE
E3 <- all E2.*, DE; D1 only when R1.3 marks comparator required
E4 <- E3, D2, D3, DE
E_GATE <- all E1.*, all E2.*, E3, E4
DF <- E_GATE, DE

F0 <- R1.4, DF
F1 <- A5, F0, R1.4, DF
F2 <- A6, F0, R1.4, DF
F6 <- F1, F2, A7, R1.4, DF
F7 <- A7, DF
F8 <- D7, DF
F9 <- F0, F2, A11, R1.4, DF
F_GATE <- F0, F1, F2, F6, F7, F8, F9
DG <- F_GATE, DF

G1 <- B8, F1, F2, F6, D7, DG
G2 <- G1, D7, DG
G3 <- G2, DG
G4 <- F1, F2, F6, G1, DG
G5 <- F7, G2, DG
G6 <- G1, G2, G3, G4, G5, F9, DG
G6A <- F1, G2, D5, D7, DG
G6B <- B7, B9, C6, D3, D4, D5, D7, G6A, A11, R1.2, R1.3, R1.4, DG
G6C <- G6B, F9, A11, R1.3, R1.4, DG
G7 <- G6, G6A, G6B, G6C, F0, F1, F2, F6, F7, F8, F9, D7, A11, DG
G_GATE <- G1, G2, G3, G4, G5, G6, G6A, G6B, G6C, G7
DH <- G_GATE, DG

H0 <- G7, F9, G6C, DH
H1 <- G7, B9, DH
H2 <- G7, B9, DH; D1 receipt when one exists (diagnostic only)
H3 <- G7, E4, D3, B9, DH
H4 <- G7, E4, D3, B9, DH; omitted when E4.mode == disabled
SelectedModeReplayReceipt <- H3 when E4.mode == disabled; H4 when E4.mode == provider_derived
H6 <- H1, SelectedModeReplayReceipt, DH
H7 <- H1, SelectedModeReplayReceipt, D4, DH
H8 <- H1, SelectedModeReplayReceipt, G6A, D5, DH
H9 <- H0, H6, H7, H8, A11, DH
H10 <- H0, H9 with verdict offline_qualified, F9, G7, DH
H_GATE <- H0, H1, H6, H7, H8, H9; H10 when H9.verdict == offline_qualified
DI <- H_GATE, H10, DH when H9.verdict == offline_qualified

I0 <- H10, DI
I1 <- I0, H10, G7, DI
I2 <- I1, DI
I3 <- I2, DI
I4 <- accepted I3 receipt, I1, H10, F9, G7, DI
I3R <- rejected I3 receipt, I1, H10, F9, G7, DI
I5 <- successful I4, DI
I6 <- I5, DI
I_GATE_ACCEPTED <- I4, I5, I6
I_GATE_REJECTED <- I3R
```
R1.5, R1.6, and every later DX task run the graph validator. A cycle, missing node,
missing producer, consumer without a producer, unavailable artifact at execution time,
or optional diagnostic on a normative path blocks sealing. Conditional nodes are
resolved from sealed contract fields, never from observed evaluation results.

### 7.3 Wave contents

- **Gate 0**: R0.0 (merge + verify hardening), R0.1A (fixture repair, pre-freeze),
  R0.1 (freeze + BASELINE.md + SOURCE_ANCHORS.json), R0.1B (cards for R0.2 and Gate 1),
  R0.2 (baseline capture from the frozen HEAD).
- **Gate 1**: R1.0 sole `QUALIFICATION_TARGET.json` authority; R1.1 feature contract;
  R1.2 training contract (normalized-margin semantics, target-digest reference,
  optimizer, and D1 search parameters); R1.3 metric/decision contract (conditional
  contender set, comparator policy, thresholds); R1.4 artifact/activation contract;
  R1.5 contract and target seal; R1.6 Wave A card generation (DA).
- **Wave A**: A1 core trace v2 schema + parser; A2 deterministic evidence contract;
  A3 neural evidence builder; A4 feature extractor; A5 artifact parser; A6 registry
  parser; A7 policy identity; A8 judgment schema; A9 LOFO folds; A10 metric
  primitives; A11 receipt schemas.
- **Wave B**: B1 core trace v2 implementation; B2 pass-evidence collector; B3 rerank
  raw-score retention; B4 evidence assembler; B5 evidence integration owner (the first
  editor of `search-execution.ts`); B6 capture survival v3; B7 replay v3; B8
  byte-identity gate; B9 tuning survival-v3 corpus.
- **Wave C**: C1 judgment packets (deps A8, B9); C2 packet materialization; C3
  independent proposal passes; C3A assembly; C4 adjudication; C5 v4 tuning manifest;
  C6 graded scorer.
- **Wave D**: D1 grouped diagnostic comparator; D2 residual trainer; D3 artifact
  verifier; D4 counterfactual harness; D5 resource contract + corpus; D6 LOFO
  orchestrator; **D7 shared ranking-policy application library**.
- **Wave E**: E1 fold training; E2 fold scoring (deps E1, B9, D4, D7); E3 out-of-fold
  adjudication (single selection point); E4 final refit.
- **Wave F**: F0 descriptor-bound trusted-file primitives; F1 trusted artifact loader;
  F2 qualification registry loader; F6 policy selector; F7 ranked-set identity
  (test-first); F8 evaluation-only shadow sink; F9 qualification registry writer. Pure
  ranking-policy logic is owned only by D7 and is integrated—not reimplemented—by G1/G2.
- **Wave G**: G1 deterministic V3 integration owner; G2 neural slot-reordering
  integration owner; G3 diagnostics projection; G4 startup integration; G5
  continuation integration; G6 runtime identity and failure matrix; G6A sealed
  implementation resource harness; G6B offline qualification toolchain; G6C registry-preflight, held-out, and activation toolchain; G7 runtime implementation seal (the executable manifest
  covering every program run by Waves H and I).
- **Wave H**: H0 registry initialization/verification; H1 baseline replay; H2 grouped diagnostic replay; H3/H4 mode-selected
  qualification replays; H6 slice gate; H7 counterfactual gate; H8 resource gate; H9
  terminal qualification verdict; H10 pending-held-out registry version.
- **Wave I**: I0 owner authorization; I1 opening-record verifier; I2 single held-out
  execution; I3 terminal adjudication; I3R rejection transition; I4 activation
  transition; I5 rollback drill; I6 limited activation.

### 7.4 Dispatch-card generation

R0.1B generates cards for R0.2 and Gate 1; R1.6 generates and seals Wave A cards; a
named `DX.<target-wave>` task at every wave boundary generates the next dependency-
ready wave's cards. Each card set lands in an immutable
`docs/evidence/ranking-v3-dispatch-cards-<date>-<sequence>-<scope>/` directory with a
`ranking_v3_dispatch_cards_v1` manifest:

```json
{
  "schemaVersion": "ranking_v3_dispatch_cards_v1",
  "planSha256": "<sha256-of-canonical-plan-bytes>",
  "sourceCommit": "<40-hex-frozen-commit>",
  "sourceTreeSha256": "<sha256-of-frozen-tree-manifest>",
  "contractSealSha256": null,
  "prerequisiteReceipts": [],
  "cards": [{ "taskId": "R0.2", "path": "cards/R0.2.md", "sha256": "<sha256-of-normalized-card-bytes>" }]
}
```

Canonicalization: cards ordered by taskId; normalized paths; final-newline
normalization; the receipt does not hash itself. Each new receipt binds the previous
receipt digest and revokes only overlapping unexecuted cards; executed cards remain
historical evidence. A card is dispatchable only while its manifest is current and all
bound prerequisites match. Any change to the plan, the frozen HEAD, the contract seal,
or a prerequisite interface invalidates the affected unexecuted cards.

## 8. Gate acceptance criteria

### 8.1 Gate 0

- R0.0: hardening merged; behavioral acceptance receipt green at the resulting HEAD.
- R0.1A: `pnpm eval:search-quality` exits 0 with workloads `status: "ok"` and the
  expected owner-rank results; fixture manifest hash unchanged; receipt on file; no
  production code changed.
- R0.1: no product files change; every claim re-verified against the frozen HEAD;
  test-command map verified (at least one exact core and one exact mcp command
  narrows); `BASELINE.md` + `SOURCE_ANCHORS.json` generated at the frozen HEAD;
  hardening ancestry proven by merge-base.
- R0.1B: cards for R0.2 and Gate 1 only; every card is executable from its own text
  plus explicitly digest-bound current contracts and receipts; no card depends on a
  superseded or undeclared document; manifest passes canonical rehash.
- R0.2: baseline replay reproduces identities, scores, ordering, removals, grouping,
  and disclosure from the frozen captures; constants digest, policy ID, binding
  identity, and held-out-unopened proof recorded; zero policy changes.

### 8.2 Gate 1

Contracts and target are sealed and cannot change without restarting tuning evidence:
R1.0 `QUALIFICATION_TARGET.json`; feature contract; training contract; metric and
decision contract; artifact and activation contract; contract seal; Wave A card
generation. R1.0 is the only target producer; R1.1–R1.4 bind its digest; R1.5 writes
`TASK_GRAPH.json` and then `CONTRACT_SEAL.json`; both are sealed before any B9 capture
or tuning output.

### 8.3 Instrumentation gate (Wave B)

Full lint and typecheck green; focused Core/MCP tests green; prior search-quality
fixtures green; phase-0 envelopes unchanged; baseline replay exact; capture survival
v3 bounds and no-source-payload checks green; held-out opening record absent.

### 8.4 Training gate (Wave C)

Tuning-only manifest sealed; all labels adjudicated or explicitly unjudged; held-out
restrictions enforced; grading receipts recorded per task suite.

### 8.5 Runtime gate (Wave G)

Default baseline; missing/invalid/unqualified/revoked/incompatible → baseline;
`pending_heldout` never selectable; no repository-local artifact; no per-query
artifact read; exact and must controls unchanged; baseline mode preserves its current
failure fallback, while provider-derived mode preserves the pre-provider deterministic
V3 sequence byte-for-byte with no partial permutation; neural stage permutes admitted
slots only; policy hash in ranked-set
identity; continuation never re-ranks; G7 executable manifest sealed (every Wave H/I
program bound: source digests, built-output digests, package-lock digest, runtime
version, exact commands, test digests and results, contract and manifest digests).

### 8.6 Qualification gate (Wave H)

End-to-end metrics pass; conditional graded metrics are reported with judgment
coverage; no protected slice regression; no new exact/must/freshness failures;
negative exposure remains within sealed margins; the counterfactual residual gate and
G6A resource gate pass. H0 has emitted a valid `RegistryReadyReceiptV1`. H9
produces exactly one terminal offline verdict for the exact E4 artifact and the
service class sealed in `QUALIFICATION_TARGET.json`. If the verdict is `offline_qualified`, H10 creates the `pending_heldout`
version and Wave I may be authorized. If the verdict is `rejected` or
`insufficient_evidence`, H10 does not run, held-out remains closed, and baseline is the
terminal outcome.

### 8.7 Activation gate (Wave I)

I1 verifies the H10 version, G7 executable manifest, artifact, target, thresholds, and
held-out manifest; I2 executes held-out exactly once; I3 emits exactly one accepted or
rejected receipt. On acceptance, I4 transitions the exact H10 digest to
`activation_qualified`, then I5 completes the rollback drill and I6 records limited
activation with baseline still the default. On rejection, I3R transitions the exact
H10 digest to `revoked` with reason `heldout_rejected`; I5 and I6 do not run.

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
