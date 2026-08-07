# Search Contracts + Focus-Aware Rerank v4 — Baseline Freeze

Plan: `docs/plans/2026-08-08-satori-search-contracts-focus-rerank-v4-master-plan.md`
Frozen at: 2026-08-08 (Task 0 of 16).

## 1. Repository state

```text
HEAD:       c8459fd70ad8929dfe55afc5c5e2753a883b89cf
HEAD tree:  03b8db388f29b25f72cb6cd65b6da36b97381184
Commit:     2026-08-08T02:39:23+08:00
Subject:    docs(search): record external solo-Satori investigation findings
```

History tail: `c8459fd` (external investigation findings) → `786dbe3` (prior plan execution
log) → `689c804` (Task 15 seal of the context-v3 rollout). The plan's expected review head
`786dbe347d6a7605f9d053ca030f2a3820ff0767` is the parent of `c8459fd`; this baseline is a
strict superset of it (documentation-only delta).

Dirty state classification: exactly one untracked path at freeze time,
`docs/plans/2026-08-08-satori-search-contracts-focus-rerank-v4-master-plan.md` (this plan;
user-supplied, preserved). No staged, unstaged, or other untracked user work.

## 2. Reproduction: explicit v1/v2 profiles receive the wrong query

No code was added. The defect is proven by one passing focused test plus static call-site
evidence.

### 2.1 What the reranker advertises (passing test)

`packages/mcp/src/server/lateon-reranker.test.ts:146-150` (all green at freeze time):

```text
assert.equal(defaulted.getQueryProjectionVersion(), "search_rerank_query_v1");
assert.equal(explicitV2D32.getQueryProjectionVersion(), "semantic_query_raw_v1");
assert.equal(legacy.getQueryProjectionVersion(), "semantic_query_raw_v1");
```

Command and result:

```bash
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 \
  packages/mcp/src/server/lateon-reranker.test.ts
# tests 15 / pass 15 / fail 0
```

So an explicit `lateon_offline_quality_projection_v2_d32_v2` reranker advertises
`semantic_query_raw_v1` via `getQueryProjectionVersion()`
(`packages/mcp/src/server/lateon-reranker.ts:332-336` — only `satori_lateon_runtime_profile_v3`
profiles return their recorded query projection; everything else returns
`semantic_query_raw_v1`).

### 2.2 What production sends (static evidence)

`packages/mcp/src/core/handlers.ts:4956-4971` builds and sends the focused v1 query
unconditionally, without ever consulting `reranker.getQueryProjectionVersion()`:

```ts
const rerankQuery = buildSearchRerankQuery({
    semanticQuery: parsedOperators.semanticQuery,
    answerFocus,
});
// ...
    rerankQuery,
    rerankQueryProjectionIdentity: SEARCH_RERANK_QUERY_PROJECTION_VERSION,
```

`SEARCH_RERANK_QUERY_PROJECTION_VERSION === "search_rerank_query_v1"`
(`packages/mcp/src/core/search-rerank-query.ts:4`), and `runSearchExecution` passes
`input.rerankQuery` straight to the provider at
`packages/mcp/src/core/search-execution.ts:698` (`host.reranker!.rerank(input.rerankQuery, ...)`).

**Reproduced mismatch:** an operator selecting a historical v1/v2 profile receives focused
query-v1 bytes although the profile identity promises the raw semantic query. The advertised
identity is never used for routing. Task 2 repairs this with identity-based routing.

## 3. Current contract identities

### 3.1 LateOn profile IDs (`packages/mcp/src/server/lateon-reranker-protocol.ts:1-6`)

```text
legacyD16:         lateon_projection_v1_d16_legacy
projectionV2D16:   lateon_projection_v2_d16_v1
offlineQualityD32: lateon_offline_quality_projection_v2_d32_v2
contextV3D32:      lateon_offline_quality_projection_v3_d32_v1
```

### 3.2 Activation policy IDs (`lateon-reranker-protocol.ts:11-13`)

```text
ownerDefaultD32: lateon_d32_owner_default_v1
```

Single policy ID currently required for both historical projection-v2 D32 and the mutated
projection-v3 D32 default — the semantic drift Task 4 repairs.

### 3.3 Query projection IDs

```text
search_rerank_query_v1   (packages/mcp/src/core/search-rerank-query.ts:4, active)
semantic_query_raw_v1    (implicit historical behavior for v1/v2 profiles)
```

No `search_rerank_query_v2` exists yet (Task 11).

### 3.4 Document projection IDs

```text
search_rerank_document_v1 | search_rerank_document_v2 | search_rerank_document_v3
(protocol identity.projectionVersion union; v3 active)
```

### 3.5 Profile qualificationStatus values (assets)

```text
runtime-profile-v2-d16.json:  disabled_optional_not_track_o_or_held_out_candidate
runtime-profile-v2-d32.json:  disabled_track_o_candidate
runtime-profile-v3-d32.json:  disabled_optional_not_track_o_or_held_out_candidate
```

The active managed default (`runtime-profile-v3-d32.json`) says `disabled_*` while being the
selected production profile — the contradiction Task 4 repairs with a new truthful profile
(`owner_activated_operationally_qualified_not_held_out`).

### 3.6 Active v3 profile identity (`packages/mcp/assets/lateon/runtime-profile-v3-d32.json`)

```text
profileId:            lateon_offline_quality_projection_v3_d32_v1
projectionVersion:    search_rerank_document_v3
projectionSha256:     54b5436e86337b2c356a7d8ecf698a2d7b833349230098826e4b02c16d779a83
queryProjectionVersion: search_rerank_query_v1
```

`projectionSha256` hashes only `search-rerank-document-v3.ts`; helper-inherited behavior is
unbound — Task 3 replaces this with a composite request-contract digest.

### 3.7 Ranked-set reranker binding (`packages/mcp/src/core/search-result-set-identity.ts`)

Fields: `rerankerIdentity` (provider/model/profile) and `rerankerProjectionIdentity`
(document projection string only; lines 42-43, 56-57, 139-162). No query-projection or
request-contract binding — Task 3 gap.

### 3.8 Relationship builder version (`packages/core/src/language-analysis/versions.ts:8`)

```text
RELATIONSHIP_BUILDER_VERSION = 'relationship-v9+python-constructor-receivers+python-native-resolution-v1'
```

The cross-module-constructor extraction fix (commit `c1c5636`) never bumped this identity, so
pre-fix sidecars remain falsely compatible — Issue 18, repaired in Task 1.

### 3.9 Current verification failures (recorded in the context-v3 production receipt)

From `docs/evidence/search-reliability-context-production-20260807/PRODUCTION_RECEIPT.md`
(Task 15 battery, same tree lineage):

1. Core: `src/net/fetch-with-deadline.test.ts` — "retries a listed retryable network error up
   to maxAttempts" fails because `ECONNREFUSED` is not classified retryable in this
   environment (environmental; pre-existing at base `15cb77f`).
2. Scripts: stale eval pin `known-exact-target` (pinned span 189–604 vs current 186–603 in
   `packages/mcp/src/core/search-exact-fast-path.ts`); pin and source byte-identical to base,
   so the failure predates the context-v3 rollout.

Both are repaired in Task 15; no "pre-existing failure" exception remains for this plan.

## 4. Mojibake byte scan

```bash
LC_ALL=C git grep -c -e $'\xce\x93\xc3\xa7' -e $'\xce\x93\xc3\xab' -e $'\xe2\x94\xac\xc2\xba' \
  -e $'\xe2\x82\xac' -- README.md packages docs
```

Result: no committed UTF-8 corruption matching the review's `ΓÇö` / `Γëñ` / `┬º` patterns.
The only matches are benign:

```text
docs/evidence/deep-lateon-l3-20260804/deep-lateon-l3-artifacts.tar.gz            (binary archive)
docs/evidence/post-r2-corrective-qualification-20260730/...artifacts.tar.gz      (binary archive)
packages/cli/src/install-preflight.test.ts:447                                    (intentional € assertion)
packages/mcp/assets/potion/linux-x64/model/tokenizer.json                         (model artifact)
```

The `€` at `install-preflight.test.ts:447` is a deliberate non-ASCII error-message assertion,
not corruption. Conclusion: the mojibake in the external review was a diff-export artifact;
no repository Markdown carries it. Task 15.3 has no committed cleanup to perform (recorded
here so Task 15 can verify this finding instead of re-scanning blind).

## 5. Command map (verification entry points used by this plan)

```bash
# focused mcp test files (test-state-root preloaded)
node --import tsx --import ./packages/mcp/src/test-state-root.ts --test --test-concurrency=1 <files>

# package suites
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-mcp test     # runs build:runtime (pnpm clean && tsc --build --force) first
pnpm --filter @zokizuan/satori-cli test
pnpm test:scripts

# aggregate checks
pnpm check            # lint + typecheck + versions:check
pnpm build
pnpm -C packages/mcp release:smoke
pnpm -C packages/mcp manifest:check
git diff --check
```

Known operational notes from the prior rollout: `satori-cli test` wipes `packages/mcp/dist`
via `build:runtime`, so run `pnpm build` before cross-package suites; under load, the cli
"preserves time for cooperative shutdown" and mcp "private socket host keeps MCP sessions
independent" tests flaked once each and passed isolated.

## 6. Freeze declaration

All tasks execute from this head. Any drift from the identities recorded above must be
recorded in the plan's execution log before the affected task commits.
