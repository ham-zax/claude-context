# Satori semantic abstention qualification review

Status: proposed for technical review

Created: 2026-07-25

Current authorization: S0 only, after the decisions in section 15 are accepted

Evidence index:
[OPEN_FINDINGS_REVIEW_INDEX.md](./OPEN_FINDINGS_REVIEW_INDEX.md)

## 1. Purpose and bounded decision

The Satori 6.3.0 qualification showed that four negative semantic controls
returned ten nearest-neighbour groups without a calibrated relevance decision.
That establishes top-K behavior, not a defect threshold or a safe no-answer
policy.

Authorize only:

- newly frozen canonical requests;
- query- and group-level ground truth;
- exact retrieval and disclosure diagnostics;
- a preregistered candidate-search protocol;
- risk, applicability, runtime, and rollout decisions; and
- sealed holdout governance.

Do not authorize a runtime threshold, public response change, new model,
reranker, or dependency during S0.

This workstream does not own checkpoint integrity, Python caller coverage,
general retrieval completeness, or a repository-level proof that no answer
exists.

## 2. Product contract

Satori may say:

> No sufficiently relevant candidate was found under the current index,
> provider set, scope, route, request shape, and retrieval policy.

Satori must not say:

> The repository contains no answer.

Abstention evaluates available retrieval evidence. It cannot prove repository
absence.

The policy must distinguish:

```text
retrieval candidate recall
    Did an expected owner enter the evaluated candidate/group set?

conditional abstention recall
    Given an expected owner in that set, did the policy accept one?

end-to-end product recall
    Did the final disclosed response include an expected owner?
```

A missing expected owner before policy evaluation is a retrieval failure, not
automatically a false abstention. End-to-end recall may still be a product
closure gate, but it must be reported separately.

## 3. Recorded behavior and evidence boundary

The qualification used:

```text
nonsense concept orbital banana transaction semaphore
xylophone banana nonexistent
quantum zucchini escrow nebula
cerulean toaster jurisprudence isotope
```

Each returned ten groups. None returned zero groups or disclosed calibrated
weak relevance.

This proves only that the tested path returned top-K groups and did not expose
a calibrated decision. It does not prove:

- that a safe threshold exists;
- that all returned groups were wrong under every interpretation;
- that fused scores are comparable across pipelines;
- that a reranker is necessary;
- that the repository contains no answer; or
- that the exact original requests can be reconstructed.

The original complete requests and internal ranking evidence were not retained.
S0 must freeze new canonical requests and preserve their field provenance. It
must describe comparisons to the old report as behavioral, not exact replay.

## 4. Current search path: source-read facts

At the frozen revision:

1. `buildSearchQueryPlan(...)` in
   `packages/mcp/src/core/search-query-planning.ts:568` selects
   `scorePolicyKind: "topk_only"` on current MCP routes.
2. Hybrid Core retrieval combines dense and lexical arms through RRF in
   `packages/core/src/core/context.ts:4793`.
3. MCP multi-pass ranking applies another rank-derived RRF value in
   `packages/mcp/src/core/search-execution.ts:866`.
4. Lexical, path, changed-file, and agent-fit factors can further alter order.
5. Core validates optional Voyage `relevanceScore`. MCP declares the returned
   value as `Array<{ index: number }>` at
   `packages/mcp/src/core/search-execution.ts:474`, discards
   `relevanceScore`, and converts only reranked position into another RRF
   contribution.
6. Grouping occurs in
   `packages/mcp/src/core/search-result-finalization.ts:524`; complete grouped
   disclosure order is available at line 584 before presentation and
   continuation are frozen.
7. The public grouped response has no relevance-decision field.
8. Exact identifier, path, literal, and positive `must:` controls already have
   deterministic match policies and must not silently inherit a semantic
   threshold.

Rank-fusion scores are ranking values, not probabilities. They may be evaluated
as features under one exact score-semantic pipeline and request shape.

The source-supported boundary is therefore:

```text
retrieval and reranking produce ranking evidence
-> MCP reduces that evidence to top-K ordering and rank-derived fusion
-> grouping freezes candidate owners
-> no calibrated group decision exists before disclosure and continuation
```

Code inspection proves that the current product has no abstention decision and
identifies where group-level evaluation could occur. It cannot prove which
features or thresholds are safe. S0 must obtain that answer from frozen
ground-truth measurements.

## 5. Initial applicability boundary

The policy artifact requires both:

1. a score-semantic pipeline signature; and
2. an exact request applicability predicate.

For the first qualification, S0 must accept or narrow this proposed boundary:

```text
provider/model:
    bundled pinned Potion model and helper
backend/schema:
    LanceDB hybrid_v3, frozen schema and projection
scope:
    runtime
result mode:
    grouped
grouping:
    symbol
ranking mode:
    default, with changed-file boosting disabled
candidate limit:
    one fixed value
disclosure limit:
    one fixed value
routes:
    semantic, ownership, structural, and mixed semantic routes
operators:
    no path:, lang:, exclude:, or positive must:
query shape:
    frozen tokenizer/version and reviewed length/token bounds
reranker:
    absent for the initial offline Potion policy
```

S0 must freeze the fixed limits and query-shape bounds before opening candidate
results.

Initially `not_applicable`:

- exact identifier, exact path, exact literal, and configuration routes; and
- explicit positive `must:` routes with deterministic absence behavior.

Initially `unqualified`:

- raw chunk mode;
- docs or mixed corpus scopes;
- path/language/exclusion constraints;
- other limits, grouping, or ranking modes;
- custom or connected embedding models;
- changed-file boosting;
- a changed score-semantic signature; and
- unavailable required evidence.

Unqualified means preserve current top-K behavior and disclose why no
calibrated policy applied. It does not mean reject the results.

The applicability predicate must explicitly cover:

```text
scope
route
result mode and grouping
candidate and disclosure limits
allowed query operators
path/language/exclusion policy
ranking and changed-file policy
query tokenization and length class
reranker presence
```

Repository identity is not part of the policy signature. A policy that only
works by keying on a repository is not a general policy.

## 6. Ground truth at query and group granularity

### 6.1 Query rows

Create versioned JSONL rows containing:

```text
queryId
repository revision and frozen source digest
exact query text
complete canonical request and provenance digest
scope, route, result mode, grouping, candidate limit, disclosure limit
query family
label:
    answerable
    absent_under_frozen_ground_truth
    ambiguous
    excluded_insufficient_ground_truth
expected owners and exact evidence spans when answerable
negative rationale and bounded source proof when absent
split:
    calibration
    validation
    held_out
```

Ground truth comes from exact source, symbols, tests, and documented behavior.
An LLM judge is not the acceptance oracle.

Query families must include:

- ordinary ownership and behavior questions;
- plausible repository-domain concepts that are absent;
- semantically adjacent but wrong functionality;
- underspecified and ambiguous questions;
- concepts present only in tests, obsolete files, or excluded scopes;
- strong lexical overlap without an answer;
- multi-hop questions with partial evidence;
- common terms whose intended owner is absent;
- typo and naming ambiguity; and
- the four original nonsense controls.

Paraphrases remain in one split. A held-out repository contributes no
calibration or validation rows.

The dataset uses at minimum:

- a deterministic task-owned fixture for exact boundary cases;
- the frozen Satori and `tradingview_ratio` revisions for calibration and
  validation; and
- at least two independently frozen real repositories held out from tuning.

No held-out repository may contribute more than 60% of the counted answerable
or absent query families. The policy must not use repository identity as a
decision feature.

### 6.2 Group labels

Because the runtime filters groups, every evaluated group must be labelled:

```text
relevant_expected_owner
relevant_alternative_owner
supporting_but_not_answering
plausible_but_wrong
scope_excluded
irrelevant
unjudgeable
```

The receipt preserves candidate group identity before policy evaluation and
the final disclosed group identity.

S0 must freeze group-level gates before S1. At minimum:

- no known `scope_excluded` or `irrelevant` group is disclosed in the frozen
  critical cases;
- an aggregate clearly-wrong disclosure-risk bound is approved;
- disclosed-group precision is reported by family and repository; and
- worst-family and worst-repository results are retained.

One correct group among many wrong disclosed groups is not a pass.

### 6.3 Label behavior

Freeze this interpretation before tuning:

| Query label | Evaluation role |
| --- | --- |
| `answerable` | Positive retrieval, conditional-policy, and end-to-end recall gates |
| `absent_under_frozen_ground_truth` | False-acceptance and zero-disclosure gates |
| `ambiguous` | Excluded from binary threshold tuning; evaluated separately for unsafe insufficiency and alternative diversity |
| `excluded_insufficient_ground_truth` | Excluded from tuning and formal risk metrics; reason independently reviewed and exclusion rate reported |

S0 must freeze a maximum exclusion rate and review every exclusion reason.
Difficult rows must not be moved to the excluded set after candidate results
are known.

## 7. Metric and statistical contract

### 7.1 Product metrics

For answerable queries, report:

- pre-policy expected-owner candidate/group recall;
- conditional policy acceptance when an expected owner is available;
- end-to-end expected-owner disclosure;
- precision of all disclosed groups; and
- accepted-query coverage.

For absent queries, report:

- whether retrieval produced groups;
- whether the policy rejected every group;
- whether zero groups and no continuation were disclosed; and
- false acceptance by group and query.

Also report:

- `accepted`, `insufficient`, `unqualified`, and `not_applicable` rates;
- result by query family and repository;
- worst-family and worst-repository result;
- calibration curves and score distributions;
- median and p95 added latency;
- provider/reranker call deltas;
- peak memory and artifact size; and
- excluded-row rate.

No large repository may dominate the aggregate. S0 must freeze minimum
answerable and absent family counts per critical family and per held-out
repository.

### 7.2 Confidence claims

The proposed qualification makes **separate** one-sided claims:

- 95% upper confidence bound no greater than 5% for false acceptance of
  held-out absent query families;
- 95% upper confidence bound no greater than 5% for false abstention of
  retrievable held-out answerable query families; and
- 95% upper confidence bound no greater than 5% for held-out query families
  that disclose any known `scope_excluded` or `irrelevant` group, if the
  reviewer accepts this third claim.

No joint 95% claim is made. With zero observed errors, each separate endpoint
requires at least 59 independent query families under the applicable
independence model. Groups from one query are correlated and do not count as
independent samples. Any observed error uses the exact one-sided binomial bound
and may require more query families.

Paraphrases are sensitivity checks, not independent families. Report
repository-clustered sensitivity and the limits of the independence
assumption.

If a reviewer instead requires a joint 95% claim, S0 must replace these
separate gates with a multiplicity-adjusted design before S1. Do not change the
risk tolerance after viewing candidate results.

Aggregate success cannot hide a critical-family failure. S0 must freeze
per-family/per-repository minimums and ceilings, and closure language remains
limited to the frozen repositories and families.

## 8. Holdout governance

A reviewer or evidence custodian independent of candidate tuning must create
and seal the held-out partition.

Candidate implementers must not see held-out:

- query text;
- labels;
- expected owners;
- repository identities where they reveal the cases; or
- feature/result tables.

Before unsealing, freeze:

- code and dependency digests;
- policy artifact and pipeline signature;
- candidate class, features, parameters, and tie-breaker;
- runtime configuration and budgets; and
- calibration/validation results.

The final receipt records who unsealed the holdout, when, and which digests
were already frozen. A material code, feature, model, or policy change after
unsealing invalidates the result. A later candidate requires a new untouched
held-out split.

If no independent custodian is available, finish
`semantic_holdout_governance_blocked`; do not call a visible test set held out.

## 9. Preregistered candidate comparison

Before opening validation results, S0 must freeze:

- allowed candidate model classes;
- exact feature sets;
- hyperparameter/threshold grids;
- threshold-selection rule;
- maximum number of variants;
- validation decision rule; and
- deterministic tie-breaker.

The initial allowed candidates are:

### Candidate A — existing pipeline evidence

Evaluate a transparent bounded decision using evidence already generated by
retrieval:

- raw dense score/rank and top-score margin;
- lexical presence, rank, and term coverage;
- dense/lexical agreement;
- MCP pass agreement;
- exact lexical evidence;
- fused/group score and margin;
- owner evidence count;
- route; and
- candidate/group count.

If raw arm evidence is needed, add one bounded internal receipt from the
existing retrieval calls. Do not duplicate vector queries.

### Candidate B — existing reranker relevance

Evaluate only on a route where the existing reranker is already selected.
Preserve its validated `relevanceScore` separately from reranked position. Do
not make it mandatory for offline Potion, add calls solely for abstention, or
reuse a reranker policy after reranking failed or was skipped.

### Candidate C — new classifier or reranker

Not authorized. Consider it only if preregistered A/B candidates cannot meet
frozen gates and a separate decision records:

```text
failed lower-cost evidence
| measured improvement on unchanged validation data
| latency, memory, cost, privacy, and availability
| version/lifecycle identity and fallback
| licensing and maintenance owner
```

### Selection order

“Smallest deterministic candidate” means this fixed ordering:

1. no additional provider or dependency;
2. fewer runtime feature sources;
3. fewer fitted parameters;
4. lower measured added latency;
5. lexical policy-ID order as the final deterministic tie-break.

Select at most one candidate on calibration and validation. If none passes,
finish `semantic_abstention_policy_unselected`.

## 10. Policy identity and lifecycle

The immutable policy artifact contains:

```text
schemaVersion
policyId
featureSchemaVersion
scoreSemanticPipelineSignature
requestApplicabilityPredicate
model kind and parameters
calibration and validation dataset digests
frozen separate risk claims
per-family/per-repository gates
runtime budgets
policy creation and expiry/review identity
```

The score-semantic signature covers:

- provider, model/helper, asset identity, and dimension;
- vector backend score semantics;
- index schema and dense/lexical projection versions;
- Core and MCP RRF constants;
- lexical, path, changed-file, agent-fit, and rerank weights;
- route/scope policy versions;
- grouping/diversity version;
- reranker provider/model/version/presence; and
- relevance feature schema.

The applicability predicate covers request-specific inputs from section 5.
A matching pipeline signature with a nonmatching request remains
`unqualified`.

The policy owner must support:

- immutable versioned artifacts;
- validate/parse/digest before atomic in-memory selection;
- retention of the prior policy and compatible runtime;
- immediate rollback to disabled/unqualified behavior;
- explicit policy expiry/review;
- recalibration on a score-semantic signature change; and
- no nearest-policy or cross-model fallback.

S0 must choose the authoritative storage and selection owner. S2 may not invent
one during implementation.

## 11. Proposed public response

After first-party consumer review, every successful grouped search in the
affected public format exposes:

```text
relevanceDecision:
    version: 1
    status:
        accepted
        insufficient
        unqualified
        not_applicable
    basis:
        calibrated_policy
        unsupported_pipeline
        policy_unavailable
        deterministic_route
    reason:
        unsupported_scope
        unsupported_request_shape
        pipeline_signature_mismatch
        policy_missing
        policy_corrupt
        feature_missing
        reranker_unavailable
        policy_expired
    policyId: present only for calibrated_policy
    pipelineSignature: stable digest
    evaluatedGroupCount: nonnegative integer
    acceptedGroupCount: nonnegative integer
```

Required invariants:

| Status | Invariants |
| --- | --- |
| `accepted` | `acceptedGroupCount > 0`; only accepted groups enter disclosure and continuation |
| `insufficient` | `acceptedGroupCount = 0`; returned group count is zero; continuation absent; `basis=calibrated_policy` |
| `unqualified` | Current top-K groups/order are preserved; machine-readable reason present |
| `not_applicable` | Deterministic route result is preserved; `basis=deterministic_route`; `policyId` absent |

`insufficient` is expected successful product behavior and remains
`status="ok"`. It is conveyed by `relevanceDecision`, not by a warning.
`unqualified` is degraded calibration availability and may additionally emit
an informational `SEARCH_RELEVANCE_UNQUALIFIED` warning if the first-party
warning contract requires one.

The response format may remain V2 only if all first-party consumers and
generated contracts permit additive fields. Otherwise advance the format and
migrate all invalidated first-party consumers in one public-contract batch.

## 12. Rollout, rollback, and drift

S0 must freeze an internal lifecycle before S2:

```text
disabled
    Existing top-K behavior; policy status unqualified where applicable.

shadow
    Compute and record decisions but do not filter groups or continuation.

canary enforcement
    Filter only in task-owned or explicitly selected qualification roots.

enforced
    Apply the accepted policy to its exact applicability boundary.
```

This mode owner is internal deployment/runtime configuration, not a new public
search parameter. It requires an explicit design decision before S2.

Rollout requirements:

- shadow measurements meet frozen decision-distribution and latency bounds;
- canary product readback passes before enforcement;
- policy artifact loading is atomic;
- rollback selects disabled/unqualified behavior without suppressing current
  top-K results;
- previous policy/runtime artifacts remain retained for the observation
  window; and
- a pipeline-signature change disables the old policy before new
  qualification.

Aggregate telemetry must not record query text, paths, or returned source. It
may record:

- policy ID and pipeline signature;
- status and unqualified reason;
- route/scope/applicability class;
- decision and latency counts;
- signature mismatch; and
- policy load/expiry state.

S0 must freeze:

- maximum supported-request `unqualified` rate;
- shadow/canary observation window;
- drift thresholds for decision-rate changes;
- policy expiry/review interval; and
- recalibration/rollback owner.

## 13. Execution batches

### S0 — Contract, ground truth, governance, and baseline

Tasks:

1. Recover original requests only if durable provenance exists; otherwise
   freeze canonical control requests and field-provenance manifests.
2. Run one answerable control, one plausible absent control, and the four
   historical sanity controls through the current unchanged product path.
3. Capture Core raw dense/lexical arms, fused candidates, MCP passes, optional
   reranker evidence including its original `relevanceScore`, grouped order,
   disclosure, and continuation. If current diagnostics cannot expose one of
   these, record the exact missing field and owner; do not infer it from rank.
4. Freeze the score-semantic signature and exact request applicability
   predicate.
5. Create independently inspected query and group ground truth.
6. Freeze ambiguous/excluded behavior, exclusion ceiling, family/repository
   minimums, and separate confidence claims.
7. Establish sealed holdout custody.
8. Preregister candidate classes, feature sets, variant limits, selection
   rules, and tie-breaker.
9. Freeze latency, memory, provider-call, artifact-size, group-precision, and
   unqualified-rate budgets.
10. Audit every first-party grouped-response consumer and decide additive V2
   versus format migration.
11. Freeze policy storage, rollout, rollback, telemetry, drift, and expiry
    ownership.
12. Measure current retrieval candidate recall, end-to-end positive recall,
    absent-query group production, group precision, response latency, provider
    calls, and memory.
13. Preserve requests, responses, raw rows/groups, labels, decisions,
    commands, configuration, versions, and digests.

S0 terminal outcomes:

```text
semantic_abstention_contract_frozen
semantic_ground_truth_frozen
semantic_pipeline_signature_frozen
semantic_ground_truth_insufficient
semantic_pipeline_evidence_blocked
semantic_holdout_governance_blocked
semantic_candidate_search_not_preregistered
semantic_policy_lifecycle_unresolved
```

S0 does not authorize a threshold or public behavior change.

### S1 — Evidence and candidate comparison

Entry requires all three successful S0 freeze outcomes and no blocking S0
outcome.

Tasks:

1. Add only internal evidence required by preregistered candidates.
2. Preserve raw scores, rank-fusion values, and optional reranker relevance as
   distinct fields.
3. Evaluate the frozen candidate/parameter search on calibration.
4. Freeze each resulting candidate before opening validation.
5. Apply the preregistered selection rule once.
6. Report query, group, family, and repository results; do not publish only
   aggregate accuracy.
7. Prove identical evidence produces identical decisions.
8. Keep held-out queries, labels, repositories, and results sealed.

Terminal outcomes:

```text
semantic_abstention_candidate_selected
semantic_abstention_policy_unselected
semantic_ground_truth_insufficient
semantic_pipeline_evidence_blocked
semantic_abstention_determinism_blocked
```

### S2 — Runtime policy and lifecycle

Entry requires one selected candidate and no new unauthorized dependency.

Tasks:

1. Implement a pure bounded evaluator over the sealed policy artifact.
2. Validate pipeline signature and request applicability before evaluation.
3. Implement exact response invariants from section 11.
4. Preserve deterministic exact-route behavior.
5. Filter complete grouped results before disclosure and continuation freeze.
6. Fail to `unqualified`, preserving current top-K, on policy/evidence
   unavailability.
7. Add disabled and shadow behavior before canary/enforcement.
8. Validate and atomically select policy artifacts; retain rollback state.
9. Keep ordering deterministic and add no provider calls beyond route policy.

Terminal outcomes:

```text
semantic_abstention_runtime_policy_pass
semantic_abstention_signature_gate_blocked
semantic_abstention_determinism_blocked
semantic_policy_lifecycle_blocked
```

### S3 — Public contract synchronization

Owners:

- search response types and envelope builders;
- warning/notice projection;
- `search_codebase` schema/description as required;
- continuation;
- golden contract tests;
- generated MCP documentation and manifest; and
- invalidated first-party CLI/adapters.

Tasks:

1. Add the frozen `relevanceDecision` projection and reason invariants.
2. Keep `insufficient` as normal `status="ok"` behavior without an error
   warning.
3. Emit degraded disclosure for `unqualified` only as the approved contract
   requires.
4. Remove result-derived actions and continuation when no group is returned.
5. Prevent rejected groups from entering continuation state.
6. Synchronize affected schema, docs, generated artifacts, and first-party
   consumers.
7. Add only aggregate no-query-content lifecycle metrics approved in S0.

Terminal outcomes:

```text
semantic_abstention_public_contract_pass
semantic_abstention_public_migration_blocked
semantic_abstention_telemetry_contract_blocked
```

### S4 — Sealed holdout and product qualification

The custodian unseals the held-out split only after policy, code,
configuration, and runtime digests are frozen. Evaluate once without retuning.

Run:

- two clean independent state roots per repository;
- the exact pinned Potion/LanceDB pipeline and applicable request shape;
- complete pre-policy groups, policy decisions, and public-response receipts;
- one signature mismatch and every unqualified reason reachable without
  corrupting user state;
- deterministic exact-route controls;
- no-continuation insufficient results;
- shadow, canary, enforcement, and rollback readbacks; and
- repeated order/decision/runtime measurements.

Terminal outcomes:

```text
semantic_abstention_supported_pipeline_pass
semantic_abstention_selective_risk_blocked
semantic_abstention_positive_recall_blocked
semantic_abstention_group_precision_blocked
semantic_abstention_runtime_budget_blocked
semantic_abstention_holdout_governance_blocked
semantic_abstention_rollout_blocked
semantic_abstention_product_readback_blocked
```

## 14. Verification and closure

Required affected-owner checks before S4:

```bash
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-core typecheck
pnpm --filter @zokizuan/satori-core build
pnpm --filter @zokizuan/satori-mcp test
pnpm --filter @zokizuan/satori-mcp typecheck
pnpm --filter @zokizuan/satori-mcp build:runtime
pnpm exec eslint <changed TypeScript files>
pnpm --filter @zokizuan/satori-mcp docs:check
pnpm --filter @zokizuan/satori-mcp manifest:check
git diff --check
```

The semantic finding closes only for the frozen pipeline, applicability
predicate, repositories, and query families when:

1. query and group ground truth was frozen before tuning;
2. retrieval, conditional-policy, and end-to-end recall are reported
   separately and pass their gates;
3. absent-query and wrong-group risk pass the approved separate claims;
4. worst-family and worst-repository gates pass;
5. exact/deterministic routes remain unchanged;
6. nonmatching requests and signatures return `unqualified` with top-K
   preserved;
7. insufficient results return zero groups and no continuation;
8. no extra provider call or unauthorized dependency is introduced;
9. response schema, consumers, docs, generated artifacts, and lifecycle
   metrics agree;
10. determinism, runtime, artifact-size, and unqualified-rate budgets pass;
11. sealed holdout governance remains valid; and
12. shadow, canary, enforcement, and rollback product readbacks pass.

Closure language:

> Calibrated abstention passed for the frozen Potion/LanceDB grouped-runtime
> pipeline, request shape, held-out repositories, and query families.

It must not claim universal repository-level no-answer semantics.

## 15. Reviewer decisions required before S1

1. Is the proposed narrow Potion/LanceDB request applicability useful enough
   to qualify?
2. What fixed candidate/disclosure limits and query token/length class apply?
3. Are changed-file boost and path/language/exclusion operators correctly
   excluded from the first policy?
4. Are the query and group label definitions complete?
5. What exclusion ceiling, per-family/repository minimums, and group-precision
   gate apply?
6. Are three separate one-sided 95%/5% claims acceptable with no joint claim?
7. Who owns the sealed holdout, and can candidate developers be denied access?
8. Are the candidate classes, feature sets, search limits, and tie-breaker
   accepted?
9. Is additive grouped V2 compatible, or must the format advance?
10. Is `insufficient` correctly represented as structured normal behavior
    without a warning?
11. Who owns policy artifacts, disabled/shadow/canary/enforced selection,
    rollback, drift, and expiry?
12. What latency, memory, provider-call, artifact-size, and supported-request
    unqualified-rate budgets apply?

Until these are frozen, S1-S4 remain unauthorized.

## 16. Durable receipt and terminal vocabulary

The receipt retains:

- canonical request provenance and complete requests/responses;
- exact configuration and source/pipeline identities;
- query rows, group labels, split digests, and exclusion reasons;
- custodian/seal/unseal identities and timestamps;
- preregistered candidate search space and frozen policy digest;
- pre-policy groups, policy decisions, disclosed groups, and continuation;
- all query/group/family/repository metrics and separate confidence bounds;
- runtime, memory, provider-call, and artifact-size samples;
- lifecycle mode, policy load, rollback, signature-mismatch, and drift
  readbacks;
- commands, exit codes, bounded logs, and initial/final Git state.

The final record retains the exact terminal outcome from S0-S4. In particular,
it does not collapse:

```text
semantic_ground_truth_insufficient
semantic_pipeline_evidence_blocked
semantic_holdout_governance_blocked
semantic_abstention_policy_unselected
semantic_abstention_signature_gate_blocked
semantic_abstention_determinism_blocked
semantic_abstention_public_migration_blocked
semantic_abstention_selective_risk_blocked
semantic_abstention_positive_recall_blocked
semantic_abstention_group_precision_blocked
semantic_abstention_runtime_budget_blocked
semantic_abstention_rollout_blocked
semantic_abstention_product_readback_blocked
```

into one generic open result. A summary may accompany, but not replace, the
exact reason.

External rank-fusion or calibration sources explain general mechanisms only.
A portable external receipt records canonical URL, capture time, content
digest, exact relevant location, and exported artifact; a local capture ID
alone is not reviewer-portable.
