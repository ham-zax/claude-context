## Verdict

The corrective series is **substantially better than the version I previously blocked**. The major implementation defects were repaired correctly:

* context-v4 is now the default across MCP config, direct `LateOnReranker` construction, and shared-runtime identity;
* proof-backed constructor/call edges are retained;
* relationships are indexed once per request instead of rescanned for every candidate;
* the async relationship load is promise-cached;
* structural references no longer displace the primary source excerpt;
* the provider query and raw source-selection question are separated;
* the v4 profile now binds the request-contract digest;
* shared-runtime contract loading fails closed;
* requested paths and `must:` semantics are hardened;
* call-graph build/publication times are separated;
* the live F-1…F-8 production-JS sweep was actually performed and the prior receipt was explicitly superseded.

I would **not reopen the ranking architecture**. However, I would make one final small corrective pass before publishing. I found **one potentially blocking evidence-handling issue**, three important contract/observability gaps, and two lower-priority documentation/product issues.

---

# Remaining findings

## P0 — the committed live evidence artifact contains copied source and local filesystem information

The new committed artifact contains complete MCP response envelopes rather than a compact proof record. Those responses include:

* source `content` and previews copied from `tradingview_ratio`;
* symbol and file details;
* absolute paths under `/home/hamza/...`;
* the disposable `/tmp/...` worktree path;
* the local model location;
* extensive candidate-survival data.

The artifact is roughly 1.38 MB and includes actual source excerpts inside serialized search responses, not merely hashes and result identities. 

This is an immediate blocker **unless all copied TradingView source is intentionally redistributable inside the Satori repository**. Even when the source is public, committing a large raw operational envelope is unnecessary and creates:

* repository bloat;
* accidental source duplication;
* local-path disclosure;
* difficult future redaction;
* evidence that is harder to audit than a normalized summary.

### Fix

Keep the raw artifact outside Git or in an access-controlled evidence store. Commit a redacted manifest containing only:

```text
implementation commit and dist hash
target repository commit/tree hash
request arguments with temporary roots normalized
response status and relevant contract fields
result file/symbol/span identities
warning codes
projection counts/reasons
generation/seal/manifest identities
hashes of the complete raw responses
```

Remove:

```text
content
preview
source excerpts
/home/hamza paths
temporary absolute paths
local model directory
unnecessary full candidate-survival bodies
```

The corrected receipt can retain the SHA-256 of the external raw artifact.

---

## P1 — incompatible structural context is silently converted into empty context

The earlier all-or-nothing problem is fixed: unavailable relationship enrichment no longer makes every candidate unprojectable. The handler now loads and prepares the relationships once, and an unavailable/incompatible relationship state results in an empty structural context rather than a failed document.

That is correct for **optional unavailability**.

But these two cases are currently treated too similarly:

```text
relationship support unavailable
relationship manifest incompatible with the sealed generation
```

A relationship manifest mismatch is stronger than “optional context not available.” It means the structural publication does not agree with the generation receipt. The candidate is still reranked and the mismatch is visible only as `structuralContextStatus` under detailed diagnostics. Search execution emits no dedicated warning.

### Recommended contract

```text
available
→ use structural context

unavailable
→ use empty context
→ optional bounded diagnostic

incompatible / manifest mismatch
→ use empty context only if source/symbol authority remains proven
→ emit a high-signal RERANKER_CONTEXT_DEGRADED or REINDEX_REQUIRED warning
```

Do not drop the candidate again, but do not silently hide an integrity mismatch.

There is also a small status bug: `projectPublicationBoundSearchRerankDocumentV4()` defaults `structuralContextStatus` to `"available"` even when it receives no prepared relationships. That default should be `"unavailable"` or the production caller should be required to pass the status explicitly.

---

## P1 — the request-contract digest is stronger, but still not complete

The corrective work improved this considerably. The contract now binds:

* query-v1 and query-v2 fixtures;
* answer-focus behavior;
* a v4 packet with structural references;
* source-first budgeting;
* proof-backed relationship policy names;
* the v3 and v4 projection policy identities.

The profile also includes the request-contract SHA-256, and the LateOn loader validates it against the shipped contract asset.

Remaining gaps:

### Only four of eight candidate roles are fixture-bound

The runtime supports:

```text
implementation
test
documentation
configuration
generated
fixture
example
unknown
```

but `ROLE_FIXTURES` covers only the first four. A classifier regression affecting generated/fixture/example/unknown may therefore not move the request-contract digest.

### Partial-projection behavior is only partially represented

The contract binds warning names and the zero-projectable-provider rule, but not all operative semantics:

```text
minimum two projected candidates before provider call
failed candidates retain their original slots
projected subset slot confinement
byte-budget omission behavior
structural-context unavailable versus incompatible behavior
```

The test suite verifies the current fixture fields, but those behaviors are not all represented in the canonical digest material.

### Proof-backed admission is named, not behaviorally generated

The fixture declares:

```text
high_confidence_or_proof_backed_authoritative_call_v1
direct_binding
origin_flow
```

but the canonical structural document is manually constructed. It is not produced by running a representative `RelationshipRecord` through `prepareSearchRerankStructuralRelationships()` and `buildSearchRerankStructuralContext()`.

That means the implementation could accidentally stop admitting `direct_binding` records while the policy string and document fixture remain unchanged.

### Fix

Add fixtures for:

* every candidate role;
* actual relationship-record → structural-context projection, including low-confidence `direct_binding`;
* unsupported low-confidence omission;
* unavailable and incompatible context statuses;
* one-failed-candidate slot preservation;
* one-candidate provider skip;
* byte-budget omission.

Then regenerate the request-contract digest and profile/acquisition digest once.

---

## P1 — the live smoke still demonstrates the original tests-first relevance weakness

The live query:

```text
how does entry veto validation work
```

is classified as implementation focus and uses:

```text
search_rerank_query_v2
search_rerank_document_v4
```

LateOn executes successfully. But the resulting top two groups are tests, while implementation files appear later. The candidate-survival evidence also shows that the more direct `trading_entry_vetoes.py` candidates were below the 12-document rerank-admission cutoff, so LateOn never had the opportunity to promote them.

This does **not** mean the native-order architecture is wrong. It means the remaining failure is upstream:

```text
relevant implementation candidate exists
→ retrieval ranks it below rerank admission
→ contextual reranking cannot rescue it
```

Therefore:

* v4 request compatibility is proven;
* source-first packets and structural context are functioning;
* provider-order application is functioning;
* the original “implementation query sometimes yields tests first” outcome is **not fully solved**.

Do not reintroduce test penalties. Treat this as a specific retrieval/admission-quality bug if it materially hurts real use.

A narrow future fix could examine whether the existing reranker admission process should guarantee representation of a clearly identified implementation owner when the answer focus is implementation. That would be a candidate-admission contract change, not a post-reranker weight. It should not be folded into this corrective release without a separate design decision.

---

## P2 — v4 dropped useful v3 fields without a clear final decision

The v3 document included:

```text
language
documentation_excerpt
required_owner_siblings
```

The v4 packet excludes all three.

The exact v4 answer-packet schema in the plan did not list them, so their removal is defensible. But another Task 13 requirement said v4 should differ from v3 only by structural context and identity when context is empty.

Those two requirements conflict.

I would not automatically restore all fields:

* `required_owner_siblings` may now be superseded by structural context;
* documentation excerpts may consume scarce source budget;
* `language`, however, is cheap factual metadata and can help distinguish code/document forms.

At minimum, record the decision explicitly in the projection contract:

```text
language intentionally omitted/preserved
documentation_excerpt intentionally removed
required_owner_siblings superseded by structural_context
```

Any change to this decision must move the v4 projection/request identity.

---

## P2 — “mandatory declaration” is not always mandatory in the implementation

The v4 policy says the signature/declaration is mandatory. But when no structural declaration can be inferred and the candidate is not a file/module candidate, `signature_or_declaration` may remain empty; v4 does not perform the explicit non-empty check present in v3.

Choose one truthful contract:

### Option A — declaration genuinely required

Resolve the declaration from the exact canonical owner span rather than only the candidate excerpt, or fail projection when it cannot be established.

### Option B — declaration preferred

Rename/document it as:

```text
signature_or_declaration: string // may be empty when no trusted declaration is available
```

Given the prior projection-degradation problem, Option B is likely safer, but the policy text must stop calling it mandatory.

---

## P2 — the receipt makes an unsupported independent-audit claim

The corrected receipt says:

> “A subsequent independent read-only audit … found no remaining demonstrated release blocker from `tmp/review.md`.”

But the receipt does not identify or preserve:

* the audit artifact;
* its SHA-256;
* the exact reviewed implementation tree;
* the reviewer/tool identity;
* the audit findings;
* the referenced `tmp/review.md`.

The live F-1…F-8 evidence is substantial and does not need this unsupported sentence.

Remove the independent-audit claim, or commit a small audit receipt with its digest and limitations.

---

## P2 — recommended-next-action language can contradict the result role

In the live evidence, the top result is a test, but the returned action says:

> “Open bounded implementation context for the highest-ranked concrete symbol…”

and requests the `implementation` preset.

The ranking system now knows `candidate_role`, yet the action text/preset is not role-aware.

Use a generic action:

```text
Open bounded symbol context for the highest-ranked concrete result.
```

or choose a preset/reason based on the result’s factual role.

This does not affect ranking, but it undermines the goal of giving agents noise-free, truthful guidance.

---

# What the corrective series successfully closed

| Earlier finding                                         | Current state                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| MCP/direct/shared defaults differed                     | **Closed** — all default to v4 with the v4 activation policy.                                                |
| Proof-backed constructor edges were omitted             | **Closed** — `direct_binding` and `origin_flow` calls are admitted.                                          |
| O(candidates × all relationships) scan                  | **Closed** — prepared incoming/outgoing/test indexes are built once.                                         |
| Parallel relationship-load race                         | **Closed** — one in-flight `structuralContextLoad` promise is reused.                                        |
| Literal NUL/binary TypeScript source                    | **Closed** — final structural module is ordinary textual TypeScript and dedupes internally by instance ID.   |
| Structural references displaced source                  | **Closed** — source selection occurs against empty structural context, references are fitted afterward.      |
| Expanded query distorted source selection               | **Closed** — projection receives raw `semanticQuery`, provider receives `rerankQuery`.                       |
| v4 builder accepted malformed roles/relations           | **Closed** — enum, exact keys, relation alignment, sort, dedupe and caps are enforced.                       |
| Profile omitted request digest                          | **Closed**.                                                                                                  |
| Shared-runtime contract loading failed open             | **Closed**.                                                                                                  |
| Ranked-set identities were not cross-checked            | **Closed**.                                                                                                  |
| `must:` could imply exhaustive recall                   | **Closed** — `exhaustive:false` and bounded status are explicit.                                             |
| Invalid subdirectory scope became global scope          | **Closed** — out-of-root requests throw; absolute candidate paths fail.                                      |
| Relationship build time conflated with publication time | **Closed** — both fields are now separate.                                                                   |
| No real v4 model execution                              | **Closed by the live production evidence**, and a model-backed test exists when the model path is available. |
| Live F-1…F-8 gate was substituted by unit tests         | **Closed** — the corrected receipt records actual production-JS runs.                                        |

---

# Commit-by-commit assessment

### `8ff1381` — v4 complete runtime default

**Good correction.** It repairs MCP config, direct construction and shared-runtime identity consistently.

### `116e6fe` — proof-backed structural context

**Good correction.** It resolves the most important functional error and also fixes the NUL, graph rescanning, promise race and source-query separation. The remaining issue is only how unavailable versus incompatible structural authority is surfaced.

### `c279074` — request semantics binding

**Good direction, still incomplete fixture coverage.** The profile-binding and fail-closed behavior are correct. Expand the canonical behavior fixtures before calling the identity “complete.”

### `6f8ff21` — bounded search contracts

**Good correction.** `must:` and subdirectory scope now communicate their limits accurately and fail closed.

### `3615d54` — navigation timestamps

**Good correction.** It finally distinguishes relationship construction from publication completion.

### `cf46c43` — request-identity cross-checks

**Good correction.** The duplicated provider/profile/projection values are now checked rather than blindly hashed.

### `5bc4e23`, `6ae5ad1`, `6aaa2f0`

Focused test/fixture corrections. No material concern found.

### `fe955948` — corrected receipt

The supersession and live acceptance record are much more honest than the earlier receipt. The remaining concerns are the committed raw artifact and unsupported “independent audit” statement.

---

# Minimal final correction set

This does **not** require another master plan.

1. **Remove or sanitize the raw live artifact.**
2. **Expose structural context unavailability/incompatibility honestly.**
3. **Strengthen request-contract fixtures for all roles and actual relationship/projection behavior.**
4. **Decide and document v4 language/docs/sibling/declaration semantics.**
5. **Remove or formally bind the independent-audit claim.**
6. **Make recommended next actions role-neutral or role-aware.**
7. Keep the tests-first live relevance outcome as an incremental retrieval/admission issue—do not add global penalties.

After those changes, run:

```text
contract:check
manifest:check
MCP/Core/CLI suites
check
build
release smoke
one direct v4 LateOn smoke
git diff --check
clean-tree proof
```

There are currently no GitHub status checks attached to `fe955948`; the green test counts are therefore local execution evidence rather than independently visible CI evidence.

## Approval status

**Code architecture:** approved.

**Current commit as a publishable sealed release:** **request changes**, primarily because the committed raw TradingView evidence may disclose/copy source and local environment details.

Once the evidence artifact is sanitized and the three contract/observability gaps are resolved, I would treat this redesign cycle as complete and freeze the architecture.
