# Satori MCP capability report

## Overall verdict

**Satori 6.2.0 is operational and useful for semantic discovery and exact
source navigation in this repository.** The sampled domain-specific searches
frequently reached relevant owners, and exact reads, outlines, continuations,
compatibility rejection, reindexing, and watcher-backed freshness behaved
correctly.

Two areas are not production-complete:

1. `manage_index repair` cannot prove payload equality at this repository's
   19,741-chunk size even though the shipped vector backends expose the exact
   count needed to complete that proof.
2. Inbound Python caller coverage has demonstrated false negatives, and an
   empty `call_graph` result does not always disclose that limitation directly.

Semantic search also has no demonstrated abstention behavior. Its results are
candidate evidence and must be checked against source before being treated as
relevant.

This is an exploratory capability assessment, not a comprehensive
retrieval-quality, latency, freshness, or call-graph qualification.

The run exercised all seven exposed tools:

- `list_codebases`
- `manage_index`
- `search_codebase`
- `continue_search`
- `file_outline`
- `call_graph`
- `read_file`

The strongest observed capabilities were exact identifier navigation,
bounded source-backed reads, continuations, outlines, and sampled
domain-specific discovery. Caller results remain advisory and require exact
search or `rg` verification.

## Evidence boundary

| Evidence input | Recorded value |
| --- | --- |
| Target repository | `/home/hamza/repo/tradingview_ratio` |
| Target revision | `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` |
| Target final working tree | `M opencode.jsonc`; `?? cc.json` |
| Runtime under evaluation | Satori MCP 6.2.0 |
| Final navigation generation observed during follow-up | `symmanifest_e669-dd6499bba74a1b14` |
| Symbol registry manifest hash | `symmanifest_e66958cafe44b5b9548b47f70d8f2fff` |
| Symbol registry manifest SHA-256 | `6f0239a341d74e785a5ff61d27298655b6b70cd0c619e3ee6fadd76808f03192` |
| Navigation seal SHA-256 | `6edaa4024f555805c8fab937f1f006aaeeac05d54ba719da1331e1976ed4732d` |

The report retains query text for the material search examples, but it does
not retain every complete serialized tool request or raw response. The
300,842-character full-debug response was not recorded here with an artifact
path and SHA-256 digest. Freshness writes were not timestamped, and the search
and latency observations were not repeated under a qualification protocol.
Claims that depend on those missing records are labelled exploratory below.

The manifest and seal digests above were read from:

```text
/home/hamza/.satori/navigation/a28de7b6704a6dd9880de7436f3da849/
  generations/symmanifest_e669-dd6499bba74a1b14/manifest.json
  generations/symmanifest_e669-dd6499bba74a1b14/seal.json
```

The repository-owner inspection used Satori revision
`c9ece273fb18300cd19d80c2175eb7321955ebaf`:

| Finding | Inspected owner |
| --- | --- |
| Large repair proof limit | `Context.repairIndex()` and `Context.countIndexedPayloadExactly()` in `packages/core/src/core/context.ts` |
| Missing constructor receiver evidence | `resolvePythonMemberTarget()` in `packages/core/src/relationships/builder.ts` and `ReceiverTypeBinding` in `packages/core/src/language-analysis/types.ts` |
| Missing concrete parent | `buildSymbolRecordsForFile()` in `packages/core/src/symbols/registry.ts` and `projectCanonicalSymbolIdentity()` in `packages/mcp/src/core/canonical-symbol-identity.ts` |
| Definition-free degradation | `computeLanguageCapabilityEvidence()` in `packages/core/src/languages/evidence.ts` |
| Changed-code basis | `getChangedFilesForCodebase()` in `packages/mcp/src/core/working-tree-state.ts` |

---

## 1. Index lifecycle

### Initial state

The existing index was rejected because its extractor and relationship fingerprints did not match Satori 6.2.0:

- Indexed extractor: `5bf2248ffcf0`
- Runtime extractor: `742b3f3e30f8`
- Indexed relationships: `93d4fdd02383`
- Runtime relationships: `c692aa46b050`

The status correctly returned `requires_reindex` and blocked normal search rather than silently serving incompatible data.

### Reindex

I ran a full reindex under the current runtime.

Results:

| Metric                             | Value                    |
| ---------------------------------- | -----------------------: |
| Duration                           | Approximately 98 seconds |
| Indexed files                      | 1,519                    |
| Chunks                             | 19,741                   |
| Python files                       | 944                      |
| Python files with non-file symbols | 931                      |
| File-owner-only Python files       | 13                       |
| Non-file symbols                   | 13,305                   |
| Satori version                     | 6.2.0                    |
| Symbol quality                     | `symbol_rich`            |
| Relationship evidence              | Compatible               |

The index progressed through scanning/writing, briefly reported 100% while
publication was still finishing, then transitioned cleanly to `status: ok`.
Because the raw progress sequence was not retained as an artifact, this is a
UX observation rather than a reproducible progress-contract finding.

### Current state

The final index is ready and searchable. All live runtime owners reported Satori 6.2.0, with no multi-version contention.

Python capabilities are reported as:

- Semantic search: **ready**
- Exact symbols: **degraded**
- Outlines: **degraded**
- Call graph: **degraded**

The status implementation attributed degradation to partial symbol evidence:
931 of 944 eligible Python files had non-file symbols.

The sealed manifest identified the 13 file-owner-only paths. Follow-up source
inspection at the recorded target revision classified them as empty,
docstring-only, import/re-export-only package modules and one `__main__.py`
entry script with no owner-worthy definition. The current capability
classifier treats every Python file without a non-file symbol as degraded,
even when the analyzer correctly finds no definition. This is a
status-classification defect, not evidence that Python extraction failed.

---

## 2. Semantic search quality

### Strong results

The sampled behavior-level queries generally found the correct owner near the
top.

#### Copula-only signal authority

Query:

> where Student-t copula mutual information generates trading signals while z-score remains diagnostic only

Top result:

- `SignalGenerator.check_entry` in `src/python/core/signals.py`

The returned evidence correctly showed:

- Only `COPULA_REAL` MI can authorize entries.
- Z-score and dummy MI sources are blocked.
- Non-copula models raise an error.
- The emitted signal records `"signal_source": "copula"` and MI metadata.

Direct evidence:

- `src/python/core/signals.py:345`
- `src/python/core/signals.py:499`
- `src/python/core/signals.py:530`

#### Residual provenance invariant

Query:

> how execution fails closed when residual provenance qap_spread_type eg_residual is absent

Top result:

- `BacktestEngineGateRuntimeApiMixin._evaluate_residual_type_invariant`

The exact symbol read showed that any value other than `"eg_residual"` returns a blocked `GatePipelineResult`, including the expected and actual provenance values in metadata:

- `src/python/core/backtest/engine_gate_runtime_api.py:59`

#### Signal-ledger idempotency

Query:

> how are duplicate signal ids rejected or treated idempotently in the canonical ledger

Top result:

- `SignalLedger.record`

The implementation:

- Treats an identical duplicate as an idempotent no-op.
- Raises `ValueError` when the same ID has a different payload.
- Preserves append-only semantics.

Evidence:

- `src/python/core/ssot/signal_ledger.py:136`

#### UTC normalization

Exact identifier search for `as_naive_utc` deterministically returned:

- `src/python/support/time_utils.py:71`

It correctly identified the implementation and provided a graph-ready symbol reference.

### Architecture query performance

The broad query:

> trace CLI discover command through orchestration use case into quantitative core

was only moderately successful. It found:

- `COMMAND_SPECS` and the lazy-loaded `discover` command.
- `screen_pairs` and `accumulation_scan`.
- A relevant CLI use-case file.

However, the top result was `_run_copula_signal_trace`, which was related to research rather than the requested discovery flow. Broad architectural questions should therefore be decomposed into:

1. Find the command registration.
2. Find the concrete CLI handler.
3. Search for the handler’s invoked use case.
4. Navigate into core separately.

### Negative-control query

I searched for:

> nonsense concept orbital banana transaction semaphore

Satori still returned nearest-neighbor matches such as `AnchorPath` and `AnchorConfidence`, without warning that the query lacked a meaningful match.

**Implication:** semantic search always tries to return something. A returned top result is not itself proof of relevance. For important work, use:

- Exact `must:` filters where possible.
- The returned evidence span.
- `read_file` before drawing conclusions.

### Search routing and ranking

Full diagnostics confirmed:

- Conceptual queries use hybrid dense+sparse retrieval.
- Identifier queries use deterministic lexical-first routing.
- Core files receive a `1.35` path multiplier.
- CLI adapters receive a `0.7` multiplier.
- Tests receive both a test-path penalty and an agent-fit multiplier of `0.45` when the query is not test-focused.
- Runtime scope filters documentation after retrieval.
- Current working-tree changes can be boosted.
- No reranker is configured in the current Potion setup.

The run recorded a **300,842-character** full-debug response. That is below
Satori's explicit 2 MiB full-debug response cap, so its size alone does not
prove a transport-contract defect. The saved artifact path and digest were not
retained in this report, so the detailed ranking conclusions are exploratory
rather than independently reproducible.

Use `debugMode="summary"`, `"ranking"`, or `"freshness"` for normal diagnosis.
Reserve `"full"` for focused Satori debugging because it can legitimately
produce hundreds of kilobytes.

---

## 3. Search operators and scopes

### Verified

- `must:qap_spread_type` correctly constrained results to exact occurrences.
- `must:as_naive_utc` resolved the exact function with semantic quality `medium`.
- `lang:python` worked.
- `path:src/python/core/ssot/**` worked and found `SignalLedger.record`.
- `-path:**/backtest/**` was accepted.
- `scope="runtime"` filtered documentation and generated material.
- `scope="docs"` returned documentation-only results.
- `scope="mixed"` included the temporary text freshness probe.
- `groupBy="symbol"` and `groupBy="file"` both worked.
- Raw mode worked, but `disclosureLimit` is correctly rejected for raw results because disclosure paging only applies to grouped output.

### Notable path behavior

`path:src/python/core/ssot/` returned no results, while:

```text
path:src/python/core/ssot/**
```

worked.

Use explicit glob semantics for directory inclusion rather than assuming a trailing directory slash means recursive inclusion.

### Docs search

The canonical-policy query did return `docs/INVARIANTS.md`, but it ranked below several large `docs_v2` research documents. Without a reranker, broad documentation queries can favor semantically dense research material over the canonical document.

For constitutional lookups, use an explicit constraint such as:

```text
path:docs/INVARIANTS.md <concept>
```

---

## 4. Continuation behavior

Grouped search continuation worked correctly:

1. Initial disclosure returned three of eight results.
2. `continue_search` returned the next two from the frozen ranking.
3. The handle retained the original query and ranking state.

I also encountered `SEARCH_RESULT_SET_STALE` when a publication/source observation changed between the original search and continuation. The error was properly classified and instructed me to rerun `search_codebase`.

That is preferable to silently continuing against a different index snapshot.

---

## 5. Deterministic reads

### Exact-symbol reads

`read_file` with:

```json
{
  "contractVersion": 2,
  "symbolId": "...",
  "context": {
    "preset": "implementation"
  }
}
```

worked reliably for:

- `SignalGenerator.check_entry`
- `_evaluate_residual_type_invariant`
- `SignalLedger.record`
- `as_naive_utc`

Responses included:

- Exact symbol identity.
- Qualified name.
- Source span.
- Complete or bounded source.
- Siblings.
- Caller/callee evidence.
- Freshness and authority metadata.

### Bounded source selection

For the 249-line `check_entry` method, a small budget returned three useful excerpts:

- Declaration.
- MI provenance gate.
- Terminal rejection of legacy models.

It also supplied a deterministic `source_range` continuation. Following that continuation returned exactly the omitted requested range.

This is a strong mechanism for inspecting large symbols without flooding context.

### Plain span reads

Direct line-span reads worked for both Python and the temporary text probe. Source was current and matched the working tree.

---

## 6. File outlines

`file_outline` worked in both modes:

- Windowed outline of `signals.py`.
- Complete outline of the gate-runtime mixin.
- Exact resolution of `"method check_entry"`.

It returned stable symbol IDs and graph-ready jump handles.

One metadata defect remains: methods frequently showed:

```text
parentQualifiedNamePath: ["ClassName"]
parentResolution: "missing"
```

even though the containing class was present in the same outline. Follow-up
source inspection found that the registry builder records
`parentQualifiedNamePath` but does not populate the already-supported
`parentKey`. The MCP projection can resolve a concrete parent only from
`parentKey`, so current generated registries systematically report these
parents as missing. Navigation still works, but the concrete parent-instance
contract is incomplete.

---

## 7. Call-graph capability

### Callee traversal: good

For `SignalGenerator.check_entry`, Satori found three high-confidence static callees:

- `_map_dual_mi_to_intent`
- `_map_mi_to_intent`
- `_apply_meta_filter`

All edges had source sites and confidence `0.95`.

### Caller traversal: mixed

For `as_naive_utc`, caller traversal was extensive:

- Three high-confidence static callers.
- Forty-five source-backed dynamic callers.
- Seventy low-confidence relationships reported as suppressed.
- Test-reference evidence.

This demonstrates useful fallback behavior when Python receiver/type resolution is uncertain.

### Important incompleteness

For both:

- `SignalGenerator.check_entry`
- `_evaluate_residual_type_invariant`
- `SignalLedger.record`

the graph returned no inbound callers.

An `rg` verification found production calls to `SignalGenerator.check_entry` in at least:

- `src/python/core/opportunity_ranker.py:256`
- `src/python/core/pair_evaluator.py:738`
- `src/python/core/trading_core.py:675`

plus many tests.

Therefore:

> **An empty inbound graph must never be interpreted as “no callers.”**

The call graph is useful for local callee structure and some direct references, but it is not sufficient for blast-radius analysis without an inbound `must:<identifier>` search or literal verification.

Follow-up source inspection established one concrete missing-evidence class for
`SignalGenerator.check_entry`:

- local constructor binding:
  `signal_gen = SignalGenerator(...)` followed by
  `signal_gen.check_entry(...)`;
- instance-field constructor binding:
  `self.signal_gen = SignalGenerator(...)` or
  `self.signal_generator = SignalGenerator(...)`, followed by calls from
  another method.

The current relationship builder accepts exact same-class `self`/`cls`,
directly annotated parameters, and exact imported class references. It does
not derive receiver authority from those constructor assignments. Name-only
cross-file matching would be unsafe; any coverage expansion must remain
bounded to uniquely resolved syntactic constructor evidence.

Search results already publish `navigation.inbound="verify"` and an optional
`callerSearchTerm`. Direct `call_graph` responses add a fallback search only
when a suppressed relationship note exists. When no relationship was emitted
at all, an empty caller response can lack the same actionable warning. That is
the immediate disclosure gap.

### Identifier-query ambiguity

An identifier-shaped query for `check_entry` ranked:

- `_check_entry_gates`
- `HurstGateState.check_entry`
- `RiskManager.check_entry_allowed`

above the intended `SignalGenerator.check_entry`. The complete serialized
request was not retained, so this cannot be classified as failure of
`must:check_entry` or exact-symbol lookup. It demonstrates only that an
unqualified common identifier can be ambiguous.

For common method names, constrain by path, class-related terms, or use an existing symbol ID.

---

## 8. Freshness and synchronization

I performed a reversible add/modify/delete test with a temporary text artifact.

### Add

Created a file containing a unique `SATORI_FRESHNESS_PROBE_ALPHA...` token.

- An explicit `sync` reported `+0/-0/~0`.
- The subsequent search found the new untracked file and returned its exact
  current content.

**Observed:** explicit sync returned a zero delta, and the subsequent search
returned the new token.

**Inference:** the watcher converged before explicit sync. The run did not
record the file-write time, first successful search time, polling attempts, or
elapsed milliseconds, so it does not establish a freshness latency.

### Modify

Replaced the alpha token with a unique beta token.

- The subsequent search found the beta token.
- A search for the old alpha token returned no result and emitted `FILTER_MUST_UNSATISFIED`.

### Delete

Removed the probe file.

- Search for the beta token returned no result.
- The repository returned to its original status.

### Freshness conclusion

Watcher-backed freshness was demonstrated for:

- Newly created untracked files.
- In-place modifications.
- Deletions.

`changedCode.files` continued to report only the existing dirty
`opencode.jsonc`, even while the temporary untracked probe was searchable.
Follow-up source inspection established that this field is built from:

```text
git status --porcelain --untracked-files=no
```

It is therefore a Git-tracked working-tree diagnostic, not the complete
watcher freshness set. Search freshness was correct. The defect is that the
response does not state this narrower basis.

---

## 9. Sync and repair behavior

### Sync

Repeated syncs completed successfully and reported:

```text
added: 0
removed: 0
modified: 0
```

because the watcher had already applied the probe changes.

### Repair

I safely exercised `manage_index(action="repair")`.

It refused with:

```text
exact_payload_query_limit_exceeded
```

The proof reported:

- Expected chunks: 19,741
- Observed chunks: 19,741
- Missing chunks: 0
- Collection: matched
- Snapshot: matched
- Marker: matched
- Fingerprint: matched
- Payload equality: unproven due to the query limit

The repair response classified this as `requires_reindex`, but subsequent full status and searches remained healthy.

This is an operational correctness and guidance defect:

- The index is usable and all known counts match.
- Repair cannot prove exact equality at this repository size.
- Its fallback recommendation is another full reindex.

Follow-up source inspection found that repair already checks every expected ID
in deterministic 512-ID batches. All shipped vector backends also implement an
exact document count. Complete expected-ID membership plus an exact equal row
count proves set equality without fetching all IDs in one response. The fixed
16,384-row rejection is therefore unnecessary for supported backends.

If an adapter cannot provide exact count authority, a proof-limit result must
remain distinct from demonstrated incompatibility and must not recommend a
full reindex as though stale payload had been proven.

I did **not** run a redundant second reindex because the freshly rebuilt index remained `status: ok`, with compatible navigation and successful searches.

---

## 10. Tool-by-tool scorecard

| Tool                   | Result       | Notes                                                                 |
| ---------------------- | ------------ | --------------------------------------------------------------------- |
| `list_codebases`       | Pass         | Correctly transitioned this repo from failed to ready                 |
| `manage_index status`  | Pass         | Detailed fingerprints, capabilities, operations, publication evidence |
| `manage_index reindex` | Pass         | Full rebuild completed in about 98 seconds                            |
| `manage_index sync`    | Pass         | Watcher had already converged; zero-delta sync was accurate           |
| `manage_index repair`  | Defect       | Misclassifies a proof limit as reindex-required at 19,741 chunks      |
| `search_codebase`      | Pass         | Sampled owner discovery was useful; broad/negative queries can be noisy |
| `continue_search`      | Pass         | Frozen paging works; stale handles are correctly rejected             |
| `read_file`            | Strong pass  | Deterministic exact symbols, bounded excerpts, continuations          |
| `file_outline`         | Pass         | Stable symbols and exact resolution; parent metadata incomplete       |
| `call_graph`           | Partial pass | Good callees and some dynamic callers; inbound completeness is weak   |

---

## Recommended working procedure

For this repository, I recommend:

1. Start with a natural-language `scope="runtime"` search.
2. Prefer `groupBy="symbol"` and `limit=5`.
3. Follow `recommendedNextAction`.
4. Open the returned exact symbol with `read_file`.
5. Use `file_outline` only for disambiguation or neighboring symbols.
6. Use `call_graph` for local structure, especially callees.
7. Always verify inbound impact with:
   - `must:<identifier>` search, and
   - `rg` or direct source inspection.
8. Use `path:**` globs explicitly.
9. Use `debugMode="summary"` by default.
10. Run `sync` when an immediate explicit freshness decision is necessary;
    this run proved watcher convergence, not a watcher latency.
11. Reindex only on an actual fingerprint/policy incompatibility, not merely because repair cannot prove equality at the current payload-query limit.

## Repository state

The evaluation introduced no persistent target-repository changes. The
temporary freshness artifact was removed, and final target status matched the
recorded pre-evaluation state:

```text
 M opencode.jsonc
?? cc.json
```

The final Satori index is ready and searchable under Satori 6.2.0.
