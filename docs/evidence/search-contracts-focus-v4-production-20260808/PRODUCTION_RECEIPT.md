# Search Contracts + Focus-Aware Rerank v4 — Corrected Production Receipt

**Date:** 2026-08-09
**Plan:** `docs/plans/2026-08-08-satori-search-contracts-focus-rerank-v4-master-plan.md`
**Implementation head tested:** `6aaa2f080d2c4932aa534b89508d9475c53008bf`
**Evidence artifact:** `artifacts/live-f-gate-20260809.json`
**Redacted manifest SHA-256:** `0dab801ac219f2d16dfeb17d9cea4c8101bb7cb35ca584ce863fe9e11baf3a64`
**Raw-capture SHA-256:** `6bfd5965dc4759d9e11974e37eddbd1e4d67a8bcc3ceac66301b240115ad21fa`
(removed from the replacement artifact; `fe95594` must be absent from all branch and tag
reachability after the authorized tip-only rewrite)

## Supersession

This receipt supersedes the prior 2026-08-08 seal. That seal incorrectly described
mapped tests and packed smokes as the original live F-1…F-8 acceptance sweep and
recorded an incorrect sealed head. It is not evidence of that live gate.

The implementation head above was tested through `packages/mcp/dist/index.js`, not
`tsx` or a managed launcher. The live target was a clean detached worktree of
`tradingview_ratio` at `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7`; its dirty source
worktree was not modified. The temporary worktree, isolated LanceDB state root, and
MCP process were removed after a redacted proof manifest was derived. Complete
response envelopes, copied source, previews, absolute paths, and the local model path
are not retained in the replacement artifact. The manifest binds deterministic hashes
of each complete captured decoded JSON-RPC response. Publication requires fresh-clone
proof that no branch or tag retains the superseded `fe95594` tip.

## Live-evidence runtime identity at `6aaa2f0`

| Identity | Value |
|---|---|
| Direct runtime profile selection | `SATORI_LATEON_PROFILE` and `SATORI_LATEON_ACTIVATION_POLICY` omitted |
| Activated LateOn profile | `lateon_offline_quality_projection_v4_d32_v1` |
| Activation policy | `lateon_context_v4_d32_owner_default_v1` |
| Query projection observed in production response | `search_rerank_query_v2` |
| Document projection observed in production response | `search_rerank_document_v4` |
| v4 projection source SHA-256 | `a44e5ab565d186a586554b787ac1783facd9871374105dacd6cac29f812aa98a` |
| Frozen v4 profile digest | `956479f3ed07a7e3adec5b39ccfb1ee41ee3bcb9f39c236c3f5deda20d5d417b` |
| Request-contract digest | `8fdd342e1203aa7a9a3995125850c6d04512145a9a219ef2481fe05bc60b2d52` |
| Relationship builder | `relationship-v10+python-cross-module-constructors+python-native-resolution-v1` |
| Production `dist/index.js` SHA-256 | `56553b127ac28ec9d2d951ed2e7e942795e1ecb6bfc761812208751c14185823` |
| LateOn `model.onnx` SHA-256 | `ac5a92a685512b163c3c591438f518379309d2a98c4818a9c6e2986f789dc8ef` |

The direct production response in
`evidence.directV4RerankerEvidence` contains twelve reranker input records, each
with the v4 document and query-v2 identities, and records
`operationalReason: "lateon_applied"`. The profile identifier itself is not exposed
by the public search envelope; the omitted-profile launch configuration and the
observed profile-specific projection identities are retained together rather than
claiming an unobserved response field.

## Repository verification

All commands below ran at the implementation head and exited zero.

| Command | Result |
|---|---|
| `pnpm --filter @zokizuan/satori-core test` | 679 passed / 1 skipped / 0 failed |
| `pnpm --filter @zokizuan/satori-mcp test` | 1488 passed / 1 skipped / 0 failed |
| `pnpm --filter @zokizuan/satori-cli test` | 342 passed / 0 failed |
| `pnpm test:scripts` | 337 passed / 0 failed |
| `pnpm check` | passed |
| `pnpm build` | passed |
| `pnpm -C packages/mcp release:smoke` | passed |
| `pnpm -C packages/mcp contract:check` | passed |
| `pnpm -C packages/mcp manifest:check` | passed |
| `pnpm -C packages/mcp typecheck` | passed |
| both §15.5 static prohibition checks | zero matches |

The first Core-suite attempt hit one environment-sensitive closed-port timeout test
(`fetch-with-deadline.test.ts`, expected one attempt, observed two). Its focused
16-test rerun and the subsequent complete Core-suite rerun both passed; no source was
changed for that repeat.

## Live F-1…F-8 acceptance gate

The artifact contains normalized request and response proof summaries with repository
roots represented as `$TARGET_ROOT`. Deterministic response hashes bind those summaries
to the complete historical decoded JSON-RPC responses without retaining their envelopes,
source excerpts, previews, or original filesystem paths.

| Gate | Live outcome | Evidence |
|---|---|---|
| F-1 `must:` bounded recall | **PASS** — the original `must:tzinfo must:replace` request reports `semantics: case_sensitive_raw_substring_all`, `exhaustive: false`, `lane_skipped_primary_limit_filled`, `moreMayExist: true`, and the incomplete-results warning. | `evidence.f1MustBoundedRecall` |
| F-2 hard requested scope | **PASS** — `src/python/core` returned 20 nonempty raw results exclusively below `src/python/core/`; sibling `src/python/support` returned four exclusively below `src/python/support/`; the returned file sets are disjoint. | `evidence.f2CoreScope`, `evidence.f2SupportScope` |
| F-3 caller-bounded completion | **PASS** — `trading`, `limit: 1`, and `disclosureLimit: 1` returns `continuation: "complete"`, `effectiveFrozenTotal: 1`, `availableGroupCount: 30`, `omittedBeyondLimitGroupCount: 29`, and disclosure reason `caller_limit`. | `evidence.f3CallerBoundedContinuation` |
| F-4 constructor callers after fresh reindex | **PASS** — full reindex generation 3 completed; `call_graph(TradingEntryVetoes, callers)` returns `src/python/core/trading_core.py` method `__init__` and its `call` edge to `TradingEntryVetoes` at lines 296–302. | `evidence.reindexKickoff`, `evidence.reindexTerminal`, `evidence.f4Outline`, `evidence.f4F7CallGraph` |
| F-5 local projection versus provider failure | **PASS** — the live F-1 request projects 29 of 32 requested candidates, reports three typed `source_unavailable` local projection failures and `RERANKER_INPUT_DEGRADED`, applies LateOn ranking, and does **not** report `RERANKER_FAILED`. | `evidence.f1MustBoundedRecall` |
| F-6 post-100% finalization | **PASS** — at progress 100 during reindex generation 3, search returns `not_ready`, `reason: indexing`, `retryAfterMs: 2000`, and `indexingOperation {action: reindex, phase: writing, generation: 3}`; the adjacent status records terminal completion. | `evidence.f6At100DuringReindex`, `evidence.reindexTerminal` |
| F-7 serving navigation authority | **PASS** — the F-4 response exposes generation ID, navigation seal, relationship manifest, `relationshipBuiltAt`, and distinct `publicationCompletedAt`; its sidecar timestamp equals the relationship build timestamp. | `evidence.f4F7CallGraph` |
| F-8 aggregated exact-symbol validation | **PASS** — one invalid `read_file` request returns contract version, exactly-one symbol selector, exactly-one context/continuation, and required mode diagnostics together. | `evidence.f8AggregatedValidation` |

Only F-1’s original query and F-4’s exact target/edge were preserved verbatim in the
historical issue record. The other live requests are the smallest contract probes
that establish the owner-frozen observable outcomes; they are not represented as
byte-for-byte reconstructions of undocumented historical requests.

## Scope confirmation

No comparative quality evaluation, tuning, scoring multiplier, repository-specific
ranking policy, or additional TradingView A/B was run. Provider order remains final
after request validation; this work added no local post-provider reordering.

This receipt is a historical documentation/evidence record for implementation head
`6aaa2f080d2c4932aa534b89508d9475c53008bf`, not a publish, merge, independent-audit,
or architecture-freeze attestation. Later contract or implementation corrections
require their own verification before release.
