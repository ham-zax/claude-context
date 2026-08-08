# End-to-end verdict

I reviewed both attached commit series separately, then inspected the combined repository state at `96ffd7f1e927c3eb6354b738cbe28ccb43758efd`.

**Do not publish, merge, or declare the architecture frozen yet.**

There is a lot of good implementation here, especially in the first series. I would **not revert either series wholesale**. But the combined final state contains several material contradictions that the reported 1481/1481 MCP tests did not catch.

The largest problems are:

1. **v4 is not actually the default in the direct MCP/runtime paths.**
2. **The structural context excludes the exact proof-backed constructor edges it was introduced to expose.**
3. **The v4 document budget allows structural labels to displace primary source code, contrary to the plan.**
4. **The “complete request identity” does not fully bind v4 behavior and fails open in shared-runtime identity construction.**
5. **The production receipt claims a live acceptance gate and final sealed head that it did not actually produce.**
6. **The source excerpt selector is fed the expanded provider query instead of the clean user question, reintroducing query noise.**

My comparative assessment:

| Series                    | Assessment                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Series A — Tasks 0–7**  | Stronger implementation. Mostly sound direction, but request identity, defaults, scope hardening, and `must:` honesty remain incomplete. |
| **Series B — Tasks 8–15** | Several useful changes, but the structural-context implementation and final production activation have release-blocking defects.         |
| **Combined state**        | **Request changes.** Not ready for architecture freeze.                                                                                  |

The plan required immutable identities, historical profile compatibility, positive-only query context, source-first answer packets, complete request binding, and a real F-1…F-8 production acceptance gate. 

---

# Blocking findings

## P0 — v4 is not actually the default outside the managed CLI path

The documentation and receipt say that projection-v4 is now the default.

But the final code still contains three v3 defaults:

### MCP configuration default

`createMcpConfig()` still resolves an omitted `SATORI_LATEON_PROFILE` to:

```ts
LATEON_RUNTIME_PROFILE_IDS.contextV3D32
```

not `contextV4D32`.

### `LateOnReranker` constructor default

The reranker constructor still defaults to:

```ts
config.profileId ?? LATEON_RUNTIME_PROFILE_IDS.contextV3D32
```

and `loadLateOnRuntimeProfile()` itself also defaults to v3.

### Shared-runtime identity default

When `SATORI_RERANKER_PROVIDER=lateon` is present but `SATORI_LATEON_PROFILE` is absent, shared-runtime identity also records:

```ts
LATEON_RUNTIME_PROFILE_IDS.contextV3D32
```

not v4.

The managed CLI installation explicitly writes the v4 profile, so managed users may receive v4. But direct MCP users, embedded runtimes, tests constructing `LateOnReranker` directly, and shared-runtime clients without an explicit profile still receive v3.

That creates two production meanings for “default”:

```text
managed CLI install  → v4
direct MCP runtime   → v3
LateOnReranker()     → v3
shared identity      → v3
```

This contradicts the README and production receipt.

### Required correction

Update all of these together:

```text
createMcpConfig default
LateOnReranker constructor default
loadLateOnRuntimeProfile default
shared-runtime identity resolved default
tests that currently still assert v3 default
```

Add one integration test starting with only:

```text
SATORI_RERANKER_PROVIDER=lateon
SATORI_LATEON_MODEL_PATH=...
```

and prove:

```text
config profile              = v4
constructed reranker        = v4
shared-runtime identity     = v4
query projection            = query-v2
document projection         = document-v4
activation policy           = context-v4 policy
```

This is a release blocker.

---

## P0 — structural context discards the exact constructor edge that motivated the work

The v4 structural-context builder only accepts relationship records whose raw confidence is exactly:

```ts
record.confidence === "high"
```

Every low- and medium-confidence edge is discarded.

But the fixed cross-module constructor edge is deliberately emitted as:

```text
confidence: low
resolutionAuthority: direct_binding
```

The `TradingEntryVetoes` builder test proves that.

The navigation layer already understands this contract. It recognizes proof-backed authoritative low-confidence calls and promotes them to usable medium-confidence traversal evidence.

Therefore the final v4 answer packet will still omit:

```text
TradingCore.__init__
    → TradingEntryVetoes()
```

even after the relationship-version bump and fresh reindex.

That means:

* Task 1 correctly fixes stale-sidecar invalidation;
* Task 12 then throws away the newly rebuilt constructor evidence;
* the production receipt claims F-4 is closed;
* but the new reranker answer packet still cannot see that edge.

### Required correction

Do not accept every low-confidence edge. Reuse the same proof-authority rule already used by navigation:

```text
admit high-confidence exact-instance edges
OR
admit proof-backed authoritative exact-instance calls
    such as resolutionAuthority=direct_binding
```

The structural packet should still reject:

* unresolved keys;
* suffix-fuzzy matches;
* key-only records;
* ambiguous targets;
* ordinary unsupported low-confidence records.

Add a test using the exact cross-module constructor fixture and assert:

```json
{
  "direct_callers": [
    {
      "repository_relative_path": ".../trading_core.py",
      "canonical_symbol_label": "TradingCore.__init__",
      "relation": "caller"
    }
  ]
}
```

The acceptance test must operate through `buildSearchRerankStructuralContext()`, not only through the relationship builder.

---

## P0 — missing relationship context can disable the entire v4 reranker

The v4 handler treats structural relationships as mandatory.

For v4, it tries to load relationship compatibility. If the relationship data is unavailable or the manifest hash does not match, it returns:

```text
relationship_manifest_mismatch
```

as a document-projection failure. Because this happens before candidate-specific projection, the same shared failure can eliminate every v4 document.

But the plan says structural context is bounded supporting context. It also explicitly supports an empty structural context.

The safe behavior should be:

```text
symbol/source projection trusted
relationship context unavailable
→ build candidate document with empty structural_context
→ record structuralContextStatus=unavailable/incompatible
→ still allow reranking
```

Not:

```text
relationship data unavailable
→ every candidate unprojectable
→ reranker skipped
```

The current implementation risks recreating the all-or-nothing projection degradation that the previous plan just removed.

A manifest mismatch may still deserve a warning or a reindex recommendation, but the absence of optional caller/callee context should not invalidate otherwise publication-bound source evidence.

---

# Important cross-series findings

## P1 — structural context performs a full relationship scan per candidate

For every reranker candidate, `buildSearchRerankStructuralContext()` loops over the complete relationship record array.

With 32 reranker candidates:

```text
cost ≈ 32 × total relationship records
```

For a large repository with many thousands of edges, this is avoidable work before every LateOn call.

The navigation code already uses prepared incoming/outgoing indexes. The reranker path should similarly build once per search or cache once per serving navigation generation:

```ts
type PreparedRerankRelationshipIndex = {
    incomingByTargetInstanceId: Map<string, RelationshipRecord[]>;
    outgoingBySourceInstanceId: Map<string, RelationshipRecord[]>;
    testsByTargetInstanceId: Map<string, RelationshipRecord[]>;
};
```

Then each candidate becomes proportional to its local degree, not the entire graph.

This is particularly important because the observed LateOn flow already has tight latency and CPU contention.

---

## P1 — the structural-context source contains a literal NUL byte

The deduplication key was committed with an actual NUL byte between file and label.

That is why Git treated `search-rerank-structural-context.ts` as binary in the patch. The fetched blob confirms the non-text delimiter.

Even if TypeScript accepts it, this causes practical problems:

* ordinary Git diffs may say “binary files differ”;
* code search can fail or behave unexpectedly;
* patch tooling becomes unreliable;
* reviewers cannot inspect line-level changes normally;
* formatters and editors may treat the file strangely.

Use a textual escape in source:

```ts
`${symbol.file}\u0000${symbol.label}`
```

or preferably a structured key helper:

```ts
serializeCanonicalJson([symbol.file, symbol.label])
```

Then verify:

```bash
git diff --numstat
git grep -n ...
file packages/mcp/src/core/search-rerank-structural-context.ts
```

The source file must be ordinary UTF-8 text.

---

## P1 — answer-packet budgeting contradicts the source-first plan

The plan's priority is explicit:

```text
mandatory declaration
query-relevant primary source
structural references
optional documentation
```

Structural references are supposed to be discarded before they reduce the primary source excerpt.

The implementation does something different:

1. Build the packet with all structural references and an empty source excerpt.
2. Drop references only if that empty-source packet already exceeds 4,000 bytes.
3. Whatever bytes remain are given to source selection.

So if structural references consume 2,000 bytes but the mandatory empty-source packet remains under 4,000, all references stay and the source excerpt is restricted to the remaining space.

That means structural labels can displace the actual implementation source—the opposite of the approved priority.

The test only covers the extreme case where huge references make the empty-source packet exceed the limit. It does not prove source-first behavior.

### Required correction

A better algorithm:

1. Compute the mandatory packet without structural references.
2. Select the maximum bounded primary source.
3. Add structural references only using the remaining byte budget.
4. Drop references in the documented order until the packet fits.
5. Never shrink an already valid primary source to retain optional references.

Add a test:

```text
same candidate and query
A: no structural references
B: maximum structural references

expected:
B.query_relevant_source_excerpt === A.query_relevant_source_excerpt
unless A alone consumes the full packet ceiling
```

---

## P1 — the source excerpt selector receives the expanded provider query

The positive-only provider query is:

```text
Question:
<user question>

Requested answer type:
production implementation, control flow, and integration path
```

The handler sends this same expanded reranker query into the document projector as `semanticQuery`.

That means source excerpt selection is no longer based solely on the user's question. It also sees generic terms such as:

```text
production
implementation
control flow
integration path
```

Those terms can pull excerpt selection toward generic declarations or integration-related lines rather than the exact question terms.

The provider query and source-selection query should be separate:

```ts
providerQuery:
    positive-only query-v2 bytes

sourceSelectionQuery:
    exact parsedOperators.semanticQuery
```

The earlier context-v3 rollout intentionally preserved the raw question for excerpt selection. The v4 integration should retain that separation.

Add a fixture where generic “implementation” terms exist in one span and the actual question terms exist in another. Verify the question-specific span is selected.

---

## P1 — the v4 projection accepts malformed role/reference combinations

`buildSearchRerankDocumentV4()` validates `candidateRole` only as a non-empty string. It does not enforce the `SearchCandidateRole` enum.

The structural reference normalizer accepts any allowed relation in any list:

```text
directCallers can contain relation=test_support
supportingTests can contain relation=callee
```

It also does not independently enforce the 3/3/2 caps or canonical sorting when called directly.

Production currently constructs these internally, but this is an identity-bearing serialization contract. Its builder should be exact and self-validating.

Required:

```text
directCallers[]    → relation must be caller
directCallees[]    → relation must be callee
supportingTests[]  → relation must be test_support
candidateRole      → exact enum
lists              → sorted, unique, bounded
unknown keys       → rejected
```

---

# Request-contract identity review

## P1 — the “complete request contract” does not bind complete v4 behavior

The request-contract design is directionally good. It binds query fixture bytes, role fixtures, projection fixture bytes, structural limits, and partial-projection constants.

But important behavior is still outside the digest.

### The v4 fixture has empty structural context

The fixture used to produce `documentProjectionV4` includes no caller, callee, or supporting-test references.

So changes to:

* relation serialization;
* reference ordering;
* truncation behavior;
* proof-backed edge admission;
* direct-binding treatment;
* reference deduplication;

may not change the contract digest.

### The source-selection policy identity is still v3

The manifest records:

```ts
serializeCanonicalJson(SEARCH_RERANK_DOCUMENT_V3_POLICY)
```

as `sourceSelectionPolicyIdentity`, even for v4.

It therefore does not directly bind v4's new budget priority or structural-reference truncation contract.

### Structural-context resolution behavior is not bound

The manifest binds:

```text
max callers
max callees
max tests
sort fields
no reference source text
```

but not the actual trust rules:

```text
high only?
proof-backed direct_binding?
medium?
TESTS edge orientation?
exact instance ID requirements?
```

### Required correction

Add canonical fixtures for:

1. v4 with caller + callee + supporting test.
2. proof-backed low-confidence `direct_binding` constructor caller.
3. ambiguous/key-only edge omitted.
4. structural-reference truncation.
5. source-first budgeting.
6. empty relationship data.
7. partial candidate projection.

The digest should move whenever any of these output semantics changes.

---

## P1 — the v4 profile is not bound to the request-contract digest

The plan explicitly required the v4 profile to be bound to the generated complete request contract.

But `runtime-profile-v4-d32.json` contains:

* query projection ID;
* document projection ID;
* a source-file projection hash;

and **does not contain `requestContractSha256`**.

That means a profile marked:

```text
owner_activated_operationally_qualified_not_held_out
```

does not identify the exact complete request semantics it activated.

Add:

```json
"requestContractSha256": "d5aa..."
```

to the profile identity or a dedicated contract block, and validate it against the installed asset at startup.

The acquisition manifest should bind the updated profile digest.

---

## P1 — shared-runtime request identity fails open

The shared-runtime identity resolver catches any failure loading the rerank request contract and substitutes an empty string. The attached patch shows this behavior. 

For a LateOn runtime, a missing or invalid contract asset should not become:

```text
lateOnRequestContractSha256: ""
```

It should stop startup or mark the runtime ineligible.

Fail-open behavior weakens the identity contract this task was supposed to establish.

---

## P2 — ranked-set identity does not cross-check duplicated identity fields

A provider-ranked set carries both:

```text
rerankerIdentity
rerankerProjectionIdentity
rerankerRequestIdentity
```

The builder verifies each string is non-empty, but it does not require:

```text
rerankerRequestIdentity.provider === rerankerIdentity.provider
rerankerRequestIdentity.model === rerankerIdentity.model
rerankerRequestIdentity.profile === rerankerIdentity.profile
rerankerRequestIdentity.documentProjectionIdentity
    === rerankerProjectionIdentity
requestContractSha256 matches /^[a-f0-9]{64}$/
```

Production normally constructs them consistently, but an identity verifier should reject contradictions rather than hash them.

---

# Series A review — Tasks 0–7

## Task 0 — baseline

**Assessment:** acceptable as evidence, but the process chronology is imperfect.

The plan itself appears to have been committed after some early implementation commits. The final log therefore overstates the clean “plan first, one task at a time” chronology.

This is not a product bug, but the receipt should describe the actual chronology.

## Task 1 — relationship-builder version

**Assessment:** technically sound.

Bumping the relationship builder version was the correct fix for stale sidecars. The builder fixture correctly proves that the constructor edge exists in a fresh build.

The remaining problem is not Task 1—it is Task 12 dropping the low-confidence proof-backed result later.

## Task 2 — profile-specific query routing

**Assessment:** good.

The final routing module is simple and fail-closed:

```text
missing/raw identity → raw query
query-v1             → focused v1
query-v2             → focused v2
unknown              → error
```

This correctly repairs the historical v1/v2 query compatibility regression.

Process issue: two same-message code commits were used for this one task, contrary to “one semantic commit per task.” That is audit noise, not a runtime defect.

## Task 3 — complete request identity

**Assessment:** good architectural direction, incomplete execution.

Strengths:

* explicit query/document identity;
* request digest in ranked-set binding;
* shared-runtime digest field;
* canonical manifest parser;
* continuation invalidation tests.

Defects:

* incomplete v4 fixtures;
* v3 source-policy identity reused;
* profile does not bind digest;
* shared-runtime loading fails open;
* duplicate identity fields not cross-checked.

## Task 4 — activation-policy versioning

**Assessment:** conceptually good.

Creating new profile/policy IDs instead of mutating historical meaning was correct. Atomic managed upgrade tests are valuable.

But the direct MCP/reranker/shared defaults were not changed to the activated profile in Series A, and Series B later failed to correct them to v4.

## Task 5 — requested-subdirectory scope

**Assessment:** mostly good, one hardening problem.

The scope is applied at the shared candidate-evaluation choke point and exact fast path before reranker admission. That is the right architecture.

However, `resolveRequestedSearchSubdirectory()` returns `null` for a path outside the indexed root, and `null` means “no restriction.” It also strips leading `/` from candidate paths.

Upstream workspace authorization likely prevents ordinary exploitation, but the helper itself is fail-open.

Safer:

```text
requested path == indexed root → null
requested path inside root     → relative scope
requested path outside root    → throw / explicit invalid
absolute candidate path        → reject
```

## Task 6 — bounded `must:` coverage

**Assessment:** improved honesty, but still slightly overclaims completeness.

The new statuses and warnings are valuable.

The questionable case is:

```text
lane returned fewer than 80
→ moreMayExist = false
```

That proves only that the lexical provider returned fewer than its top-k budget. It does not necessarily prove exhaustive repository substring coverage, especially across live/unindexed/overlay state.

The final frozen constraint explicitly says `must:` remains non-exhaustive. The response should carry:

```ts
exhaustive: false
```

unconditionally.

A clearer status would be:

```text
lane_completed_within_backend_results
```

rather than `complete_within_examined_candidates`.

## Task 7 — projection degradation diagnostics

**Assessment:** good.

This is one of the cleaner tasks:

* typed summary;
* dedicated warning messages;
* no provider-failure misclassification;
* debug gating;
* bounded first failure;
* explicit skipped candidate count.

I found no major defect in Task 7 itself.

---

# Series B review — Tasks 8–15

## Task 8 — continuation and retry clarity

**Assessment:** generally good.

`omittedBeyondLimitGroupCount` correctly separates groups outside the caller-bounded frozen set from undisclosed groups inside it. The helper computes:

```text
available groups - effective frozen total
```

which matches the intended semantics.

The indexing retry metadata is also a useful contract improvement.

No release blocker found here.

## Task 9 — call-graph serving authority

**Assessment:** useful idea, incorrect `builtAt` source.

The handler populates `navigationAuthority.builtAt` from:

```ts
generationReceipt.marker.completedAt
```

rather than the relationship manifest's actual `builtAt`.

Those values may be close, but they mean different things:

```text
marker.completedAt        = publication completion
relationship builtAt      = relationship sidecar generation timestamp
```

This does not fully solve the original stale-`builtAt` attribution issue.

Either:

* expose the real relationship manifest `builtAt`; or
* rename the field to `publicationCompletedAt`;
* ideally expose both.

## Task 10 — aggregated validation

**Assessment:** functionally good.

The outer validation now reports missing mode alongside exact-symbol shape errors, and the public description is clearer.

The two same-message implementation commits violate the process convention but do not appear to damage runtime behavior.

## Task 11 — positive-only query v2

**Assessment:** good in isolation.

The implementation query no longer mentions competing classes such as tests or documentation.

The cross-series problem is that these expanded bytes are also used for source excerpt selection. The module itself is fine; integration needs separation of provider query and source-selection query.

## Task 12 — structural context

**Assessment:** request changes.

Major issues:

* discards proof-backed constructor edges;
* scans all relationships for every candidate;
* contains literal NUL source byte;
* turns unavailable relationship data into candidate projection failure;
* contract fixture does not bind its actual trust semantics.

This task is the weakest implementation in the second series.

## Task 13 — document v4

**Assessment:** request changes.

Good:

* canonical packet shape;
* 4,000-byte hard ceiling;
* mandatory declaration preserved;
* deterministic serialization;
* empty-context parity.

Problems:

* structural references displace source;
* role enum not validated;
* relation/list alignment not validated;
* caps/order trusted rather than enforced;
* tests do not cover source-first priority.

## Task 14 — v4 activation

**Assessment:** not complete.

The managed CLI path is updated to v4, and the new profile has truthful qualification wording.

But:

* direct runtime default remains v3;
* reranker constructor default remains v3;
* shared-runtime default remains v3;
* profile lacks request contract digest;
* tests still explicitly assert that the default reranker is v3.

Therefore the claim “v4 is the default” is false for the complete product.

## Task 15 — final verification and receipt

**Assessment:** not trustworthy enough to seal production.

The receipt says:

```text
Sealed head: 5c7a458...
(after Task 15 docs commit)
```

But `5c7a458` is the Task 14 execution-log commit. Task 15's receipt commit is `2705b9b`, followed by `96ffd7f`.

The receipt also says F-1…F-8 ran against the production build. The evidence table shows mapped unit/integration suites and packed smokes—not the original live TradingView repros.

For F-4 specifically, it records:

```text
builder fixture
compatibility test
call-graph suite
```

not:

```text
fresh full reindex of tradingview_ratio
real call_graph(TradingEntryVetoes, callers)
```

It also says “all 15 tasks,” though Tasks 0 through 15 total **16 tasks**.

The receipt should not declare architecture frozen until the actual live acceptance sweep runs.

---

# Recommended corrective sequence

Do not create another master redesign plan. Apply a compact correction series on top.

## Commit 1 — correct all production defaults

```text
fix(lateon): make context-v4 the complete runtime default
```

Update:

* MCP config default;
* reranker constructor default;
* profile loader default;
* shared-runtime identity default;
* tests and docs.

## Commit 2 — fix structural edge admission and performance

```text
fix(rerank): preserve proof-backed structural context
```

* admit proof-backed `direct_binding` edges;
* reuse/export canonical authoritative-call predicate;
* pre-index relationships once;
* remove literal NUL;
* missing structural context degrades to empty context rather than dropping candidate.

## Commit 3 — enforce source-first v4 budgeting

```text
fix(rerank): preserve primary source before structural references
```

* maximize source first;
* fit/drop references afterward;
* validate role enum;
* validate relation/list alignment;
* enforce sort, uniqueness, and caps.

## Commit 4 — complete request-contract binding

```text
fix(rerank): bind context-v4 request semantics completely
```

* add non-empty structural fixtures;
* bind proof-backed admission;
* bind truncation/source priority;
* include v4 policy identity;
* add request contract digest to profile;
* fail closed loading the contract;
* cross-check ranked-set identity fields.

## Commit 5 — separate provider query from source-selection query

```text
fix(rerank): preserve exact question for source selection
```

Use:

```text
provider query = query-v2
source selector = raw semantic query
```

## Commit 6 — finish search-contract honesty

```text
fix(search): tighten bounded scope and recall contracts
```

* `mustCoverage.exhaustive=false`;
* avoid overclaiming `moreMayExist=false`;
* out-of-root requested scope fails closed;
* reject absolute candidate paths.

## Commit 7 — correct generation attribution

```text
fix(call-graph): distinguish relationship build and publication times
```

Expose:

```text
relationshipBuiltAt
publicationCompletedAt
generationId
navigationSealSha256
relationshipManifestSha256
```

## Commit 8 — issue a truthful production receipt

Run the actual live F-1…F-8 cases after a clean build and fresh TradingView reindex.

Record:

* implementation head;
* receipt commit separately;
* actual live response artifacts;
* fresh constructor caller result;
* final direct-runtime v4 identity;
* final managed-runtime v4 identity.

Only then mark the architecture frozen.

---

# Final recommendation

**Series A should be retained and corrected.**
**Series B should also be retained, but Tasks 12–15 require material repair.**

The final code is not a failure. The central architecture remains sound:

```text
clean question
+ factual role
+ trusted structural context
→ LateOn
→ provider order stays final
```

But the current implementation does not yet reliably deliver that architecture:

* the default is split between v3 and v4;
* the most important constructor edge is filtered out;
* optional references can crowd out source;
* optional relationship context can suppress reranking;
* the complete contract is not actually fully bound;
* the final receipt overstates what was verified.

I reviewed the supplied patches and fetched the final source files at `96ffd7f`; I did not independently execute the reported test suites. The static findings above are sufficient to block publishing until corrected.
----------------

Also review the following additional findings before making corrections. Treat them as hypotheses to verify against the current tree, not as automatically correct. If verified, include them in the same corrective pass; do not create another architecture redesign.

Additional findings to verify:

1. Structural-context relationship loading may race under parallel candidate projection. If multiple candidate projections can observe `searchRelationshipRecords` as undefined before the first async load completes, cache the in-flight Promise once per search/generation rather than only caching the eventual array.

2. Check whether document-v4 unintentionally dropped useful v3 fields: `language`, `documentation_excerpt`, and `required_owner_siblings`. The plan said v4 should add structural context while preserving useful source/declaration behavior. Do not restore fields blindly; determine which remain useful and whether their removal was actually intended.

3. Add one real LateOn v4 compatibility smoke using the actual tokenizer/model:
   `query-v2 + document-v4 -> LateOn -> valid response`.
   This is NOT a quality benchmark, A/B, tuning exercise, or ranking gate. It only proves the new serialized request actually executes through the real model under the frozen operational profile.

4. Structural-reference deduplication should use authoritative `symbolInstanceId` internally rather than `path + display label`, because overloads/same-label symbols can otherwise collapse. Public projected references may still contain only path/label.

5. Check request-contract metadata for stale identities, especially `SEARCH_RERANK_DOCUMENT_V4_POLICY.serializedKeyOrder` inheriting v2 metadata and `sourceSelectionPolicyIdentity` representing v3 rather than the actual v4 source/structural budgeting semantics.

6. Verify structural-context edge admission against the actual relationship authority rules. The important cross-module constructor edge can be emitted as low-confidence but proof-backed `resolutionAuthority: direct_binding`. Do not require raw `confidence === "high"` if that causes authoritative constructor/call edges to disappear. Reuse the same proof-backed authority semantics used by navigation, while still rejecting unsupported fuzzy/ambiguous low-confidence relationships.

7. Keep two different query strings where appropriate:

   * provider rerank query = positive-only query-v2;
   * source-excerpt selection query = exact raw semantic user question.
     Do not let generic words such as `production implementation`, `control flow`, or `integration path` distort which source lines are selected.

8. Make document-v4 serialization self-validating:

   * candidate role must be a valid `SearchCandidateRole`;
   * `directCallers` entries must have relation `caller`;
   * `directCallees` entries must have relation `callee`;
   * `supportingTests` entries must have relation `test_support`;
   * enforce deterministic sort, uniqueness, and 3/3/2 limits in the projection contract itself.

9. Cross-check duplicated ranked-set identity fields rather than merely hashing them:

   * request provider/model/profile must equal reranker identity;
   * document projection must equal `rerankerProjectionIdentity`;
   * request-contract digest must be valid SHA-256.

10. For call-graph generation attribution, verify that `builtAt` really represents the relationship/navigation artifact build time. Do not substitute publication completion time under a misleading `builtAt` name. If both are useful, expose them separately.

These are in addition to the previously identified blockers:

* unify every direct/managed/shared LateOn default on v4;
* fix source-first answer-packet budgeting;
* make optional structural enrichment degrade to empty context rather than unnecessarily dropping an otherwise valid candidate;
* strengthen and profile-bind the complete request-contract digest;
* fail closed when the identity contract itself cannot be loaded;
* remove the literal NUL/binary-source issue;
* avoid O(candidates × all relationships) scans;
* add explicit non-exhaustive `must:` semantics;
* fail closed for invalid/out-of-root requested scopes;
* correct the production receipt and run the actual F-1…F-8 live acceptance repros.

For every item:

1. verify against current HEAD first;
2. mark it CONFIRMED / NOT REPRODUCIBLE / ALREADY FIXED;
3. for confirmed items, identify root cause and smallest correct fix;
4. add a regression test before changing production behavior;
5. do not resurrect ranking weights or local post-reranker sorting;
6. do not start another A/B or architecture redesign.

Only declare the rollout sealed after these findings and the earlier corrective findings are resolved or explicitly disproved with code/test evidence.
-----------