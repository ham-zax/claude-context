# Issue 19/20 Corrective Verification Receipt

**Predecessor:** `ae6aacd9c03ff7617fc8bf968c0f985e72505679`  
**Verified implementation:** `97c08bc6224af71ab60a89141e891a2de220609d`  
**Verification date:** 2026-08-09

This receipt records the bounded corrective verification for Issue 19 capability-owned reranker admission and Issue 20 diagnostic/product non-interference. It does not rewrite or supersede the historical Search Contracts v4 production receipt, which remains evidence for its own stated implementation head.

## Frozen identities

| Identity | Value |
|---|---|
| Request-contract SHA-256 | `1d0493feb74b2675974d947855d8259687d1327a21e351e9ab3a0e0e2fb507aa` |
| Runtime-profile raw SHA-256 | `befe1751335d5e1373f8166fdc21725baa4f07ea01fb19668436b6340b8c1a2f` |
| Query projection | `search_rerank_query_v2` |
| Document projection | `search_rerank_document_v4` |
| Document projection SHA-256 | `f7cee836ca9dac7ae02eaa8384cccb8d51114c66027536366223f59264c2c5b4` |
| Built MCP entrypoint SHA-256 | `56553b127ac28ec9d2d951ed2e7e942795e1ecb6bfc761812208751c14185823` |
| Redacted live-proof SHA-256 | `009ee37043623747dbd21ca9a80ceeb3e21bc7070d61626dde87d7c11133dfef` |
| Redacted live-proof bytes | `13122` |

Redacted proof: `docs/evidence/search-admission-diagnostics-correction-20260809/artifacts/issue-19-20-live-proof-redacted.json`

## Behavioral closure

### Issue 20 — diagnostic/product non-interference

Diagnostics-off, shallow full diagnostics, and deep-160 diagnostics disclosed the same ordered implementation identities. Shallow and deep runs also had identical ordered product IDs at `raw_dense`, `raw_lexical`, `core_fusion`, `mcp_pass`, `mcp_fusion`, `mcp_filtered`, `reranker_input`, `reranker_output`, `mcp_ranked`, `grouped`, and `disclosed`.

Deep diagnostics observed 128 dense candidates that were not product-retrieval participants; zero received a `core_fusion_limit` removal. Deep dense, precise lexical, and fallback lexical status was `available`. Generic failure fixtures separately proved that deep dense failure, deep lexical failure, and fallback failure publish bounded `unavailable` / `backend_request_failed` status without changing successful product results. Generation-authority loss remains blocking.

### Issue 19 — provider-capacity admission

The exact production-JS query `how does entry veto validation work` produced 26 eligible families. The two implementation candidates entered the filtered family pool and reranker input at ranks 17 and 22. The provider-qualified capacity was 32, so all 26 projected candidates were admitted. LateOn returned the implementation candidates at ranks 1 and 2, and MCP preserved that exact provider order through ranking and disclosure.

The provider received 36,105 UTF-8 bytes with zero byte-budget omissions. It returned one complete validated 26-candidate permutation with one attempt, zero retries, zero timeouts, and zero failures.

Timing labels for the retained deep-160 proof:

- worker/provider `observedWallMs`: **735 ms**;
- outer `rerank` search phase: **735 ms**;
- full search RPC wall time: **3344.623 ms**.

The shallow repeat recorded worker/provider `observedWallMs=712`, outer rerank phase `712 ms`, and full search RPC wall `3196.515 ms`. The diagnostics-off run was the cold readiness call; its `16859.838 ms` full RPC wall is not a reranker-stage measurement.

## Complete verification

| Check | Outcome |
|---|---|
| Full Core suite | 681 passed, 1 skipped, 0 failed |
| Full MCP suite | 1499 passed, 1 skipped, 0 failed |
| Full CLI suite | 342 passed, 0 failed |
| Full scripts suite | 337 passed, 0 failed |
| Request-contract check | passed (`1d0493feb74b2675974d947855d8259687d1327a21e351e9ab3a0e0e2fb507aa`) |
| MCP manifest check | passed |
| Core / MCP / CLI typechecks | passed |
| Root `pnpm check` | passed |
| Root build | passed |
| MCP release smoke | passed |
| CLI release smoke | passed |
| Static ranking-policy prohibition checks | passed, zero matches |
| `git diff --check` before implementation commit | passed |
| Real-model Issue 19/20 smoke | passed |

The first full Core invocation ended in a transient Node test-runner IPC deserialization error rather than a test assertion. The isolated Context suite then passed 226/226, and the exact full Core command retry passed with the result above.

## Evidence handling and authority boundary

Complete source-bearing response envelopes were hashed in normalized canonical form in memory and were not retained. The redacted artifact contains request/response hashes, bounded identities, ranks, counts, status, and timings only—no source, preview, absolute path, or model path.

No ranking weights, role quotas, artifact penalties, repository-specific boosts, post-provider reorder, or further relevance tuning were introduced. This receipt is not an independent audit, architecture freeze, publish authorization, or release claim.
