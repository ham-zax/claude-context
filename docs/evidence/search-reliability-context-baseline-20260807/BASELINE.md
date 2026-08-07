# Search Reliability and Reranker Context Baseline

Date: 2026-08-07. Frozen base for the master implementation plan at
`docs/plans/2026-08-07-satori-search-reliability-reranker-context-master-plan.md`.
Recorded per its Task 0. No code changed by this document.

## 1. Repository identity

| Item | Value |
|---|---|
| Base commit | `97d6e06c7401dee3582294b5aab20c3987587f0e` |
| Base tree | `41860762d199c90227181d99df1eef35435e6630` |
| Commit date | 2026-08-07T16:51:59+08:00 |
| Commit subject | docs(search): record TradingView native reranker A/B evidence package |
| Worktree | clean at freeze time |

## 2. Package versions

| Package | Version |
|---|---|
| `@zokizuan/satori-core` | 3.6.1 |
| `@zokizuan/satori-mcp` | 6.8.2 |
| `@zokizuan/satori-cli` | 1.9.3 |

## 3. Issue-to-task map

Source: `docs/evidence/native-reranker-tradingview-ab-20260807/ISSUES.md`.

| Issue | Summary | Owning task(s) |
|---|---|---|
| 1 | Published npm tarball can lose the Potion helper exec bit | Task 1 (trusted-mode repair), Task 2 (packed release smoke) |
| 2 | `RuntimeOwnerRegistry` is home-global, not state-root scoped | Task 3 |
| 3 | Reranker input projection drift not observable per candidate | Task 8 (per-document hashes/byte counts) |
| 5 | First search races startup sync (`not_ready: indexing`) | Task 4 |
| 6 | LateOn timeout under CPU contention is undiagnosable | Task 5 |
| 8 | No per-document rerank-input observability in diagnostics | Task 8 |
| 9 | Reranker input carries no candidate role or query-intent signal | Tasks 9, 10, 11, 12 (evidence, not weights) |
| 10 | All-or-nothing `document_projection` failure hides the reason | Tasks 6, 7 |

## 4. Current source identities

| File | Git blob SHA-1 |
|---|---|
| `packages/mcp/src/core/search-rerank-projection.ts` | `71d7430b1422df0ad54f7021e8cc866e6595fece` |
| `packages/mcp/src/core/search-rerank-document-v2.ts` | `0f8e6bc78291bd89680162ee8944cb8fe44b4223` |
| `packages/mcp/assets/lateon/runtime-profile-v2-d32.json` | `908ee366aecb113e0be1fafd0b308f85353dc970` |

Active identities:

- Projection policy id: `search_rerank_document_v2`
  (`packages/mcp/src/core/search-rerank-document-v2.ts:25`).
- Default LateOn profile: `lateon_offline_quality_projection_v2_d32_v2`
  (`packages/mcp/assets/lateon/runtime-profile-v2-d32.json:3`; CLI default at
  `packages/cli/src/lateon-model-store.ts:9` `DEFAULT_LATEON_PROFILE_ID`).
- Profile projection hash: `projectionSha256
  635b0a683b2a1c7dec8b6f0822f21e750724d5d4d18503eee112c4dbd242d687`.

## 5. Current behavior snapshot

### 5.1 Rerank query source

The reranker query is the exact semantic query:
`query: input.semanticQuery` at
`packages/mcp/src/core/search-rerank-projection.ts:83`.

### 5.2 Retrieval-only expansion string

`${input.semanticQuery}\nimplementation runtime source entrypoint` at
`packages/mcp/src/core/search-execution.ts:684`. This expansion feeds
retrieval only; it does not enter the reranker query (section 5.1).

### 5.3 All-or-nothing projection loop

`packages/mcp/src/core/search-execution.ts:488-502`: documents are built for
every provider-bounded candidate inside one `Promise.all`; any non-string,
empty, or throwing projection raises
`reranker_document_projection_failed` (`failurePhase: "document_projection"`)
and aborts the entire rerank. No per-candidate reason or partial degrade.

### 5.4 Runtime-owner registry path

`RuntimeOwnerRegistry` falls back to
`defaultRuntimeStateDir() = path.join(os.homedir(), ".satori", "runtime")`
(`packages/mcp/src/core/runtime-owner.ts:347-349`) when constructed without a
`stateDir`, which `SharedRuntimeHost` does
(`packages/mcp/src/server/shared-runtime.ts:205`). Separate
`SATORI_STATE_ROOT`s therefore share one home-global `owners.json`.

### 5.5 LateOn v2 d32 operational bounds

From `packages/mcp/assets/lateon/runtime-profile-v2-d32.json`
`operationalBounds`:

| Bound | Value |
|---|---|
| `maximumQueueWaitMilliseconds` | 250 |
| `maximumReadinessMilliseconds` | 2000 |
| `maximumScoreMilliseconds` | 2000 |
| `maximumRerankerStageMilliseconds` | 2500 |
| `maximumActiveReranks` / `maximumQueuedReranks` | 1 / 1 |
| `maximumProcessPeakRssBytes` | 1073741824 |
| `maximumProcessRetainedRssBytes` | 671088640 |

These qualified limits remain unchanged by the plan; Task 5 only adds
observability of queue wait, effective deadlines, observed wall time, and
deadline lateness.
