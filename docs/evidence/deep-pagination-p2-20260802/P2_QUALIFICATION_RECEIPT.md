# Track P/P2 continuation qualification receipt

Terminal outcome: `pagination_complete_frozen_set_qualified`

Qualification date: 2026-08-03 (Asia/Shanghai)

## Scope and qualification boundary

This receipt qualifies deterministic continuation of a frozen grouped result set,
including a frozen LateOn-ranked set. It does not activate Track P, change ranking
policy, qualify Track I or Track L, or claim a live held-out LateOn model run. The
cross-track test uses a deterministic external-reranker test double with the
qualified LateOn provider, model, and runtime-profile identity.

No production defect was demonstrated during Task 6, so production source was not
changed. The only non-qualification test adjustment was an exact golden expectation
update for the already-required truthful `resultCounts` response field, made after
explicit scope authorization.

## Frozen source and environment

The production implementation under test is the committed Tasks 1–5 source. Task 6
qualification artifacts are frozen separately below because this receipt is itself
part of the Task 6 commit and therefore cannot contain that commit's tree hash.

| Item | Frozen value |
| --- | --- |
| Source revision | `b8f44ca542f02645c02823700a1997ed89b56029` |
| Source tree | `96694f46640d12cf72c0c67cef24c1f217d67c4a` |
| Node.js | `v24.13.0` |
| pnpm | `10.28.2` |

## Frozen policy

Canonical policy manifest (UTF-8, LF-terminated):

```text
default_ranking_policy=B
logical_limit_max=200
disclosure_group_limit_max=200
reservation_entry_max_bytes=8388608
reservation_owner_max_bytes=16777216
reservation_owner_max_entries=2
lateon_provider=lateon
lateon_model=lightonai/LateOn-Code-edge@07ef20f406c86badca122464808f4cac2f6e4b25
lateon_profile=satori_lateon_runtime_profile_v1
```

SHA-256: `b045a4b111c1fb25813a9bb0bc86e560519ddbadd188500a3f27e900cea08b47`

## Cross-track qualification

`search continuation preserves deterministic and LateOn-ranked grouped order without recomputation`
freezes 12 groups in the exact reverse neural order returned by the LateOn-identified
reranker, discloses 3 groups initially and up to 4 per continuation, and proves:

- the combined pages equal the frozen neural order exactly;
- every frozen group appears exactly once;
- every continuation retry is byte-identical;
- continuation and retry add zero retrieval calls, reranker calls, reranker
  candidates, and reranker input bytes; and
- the frozen provider/model/profile identity remains authoritative.

The focused Track P matrix also proves the amendment's remaining safety gates:

| Gate | Evidence |
| --- | --- |
| Positive-safe bounded requests and limits no greater than 200 | handler and public-tool validation tests |
| Exact requested path, source identity, publication identity, and response-byte accounting | handler, identity, and disclosure tests |
| Dynamic 200-byte projected continuation cursor uses actual returned count | disclosure tests |
| At most two reservations remain below the 16 MiB owner cap; a third uses deterministic LRU eviction | result-set cache tests |
| Rejected admission, wrong offsets, and replay leave reservation state unchanged | result-set cache and handler tests |
| Inadmissible initial disclosure emits the explicit warning without a continuation handle | handler scope test |
| Capacity is shared while session ownership remains isolated | result-set cache and shared-runtime tests |
| Owner shutdown purges reservations | shared-runtime tests |
| Expiry, eviction, wrong offset, publication/source mismatch, and identity tampering fail explicitly without recomputation | handler, cache, and identity tests |
| Authority-envelope overflow fails explicitly | disclosure tests |
| Page-too-large response projection fails explicitly without replacement or recomputation | disclosure and handler tests |

## Frozen acceptance commands

Canonical command manifest (UTF-8, LF-terminated):

```text
track_p_matrix|cwd=/home/hamza/repo/satori-worktrees/deep-reranking-pagination-20260802|rtk pnpm --filter @zokizuan/satori-mcp exec node --import tsx --import ./src/test-state-root.ts --test --test-concurrency=1 ./src/core/capabilities.test.ts ./src/core/handlers.scope.test.ts ./src/core/search-disclosure.test.ts ./src/core/search-exact-registry-hit.test.ts ./src/core/search-policy.test.ts ./src/core/search-result-set-cache.test.ts ./src/core/search-result-set-identity.test.ts ./src/server/lateon-reranker.test.ts ./src/server/provider-runtime.test.ts ./src/server/shared-runtime.test.ts ./src/tools/continue_search.test.ts ./src/tools/search_codebase.test.ts
mcp_typecheck|cwd=/home/hamza/repo/satori-worktrees/deep-reranking-pagination-20260802/packages/mcp|rtk pnpm typecheck
mcp_package_tests|cwd=/home/hamza/repo/satori-worktrees/deep-reranking-pagination-20260802/packages/mcp|rtk pnpm test
```

SHA-256: `efe859d48c9cc508527df340f55d4c7dee62fa769d05d20fe21b93e63c33c108`

## Frozen results

Canonical result manifest (UTF-8, LF-terminated):

```text
track_p_matrix=tests:248,pass:248,fail:0
mcp_typecheck=exit:0,typescript_errors:0
mcp_package_tests=tests:1125,pass:1125,fail:0
terminal=pagination_complete_frozen_set_qualified
```

SHA-256: `1024cf8598d5fc96d59b367e0ba3a10a0e6cbf62f3e267e245b01585de26cdac`

The first full-package run exposed one stale golden expectation: 1,124/1,125
passed because the expected grouped response omitted `resultCounts`. After the
authorized exact expectation update, the focused golden case passed 1/1 and the
fresh complete package run passed 1,125/1,125.

## Frozen artifacts

Each line is `SHA-256`, two spaces, then repository-relative path. The canonical
artifact manifest is UTF-8 and LF-terminated.

```text
3a588e921f0c98f0ae16d71e95bce78e7c69a94eac0ca878d08efa43010c95d3  docs/plans/SATORI_DEEP_LATEON_RERANKING_AND_PAGINATED_DISCLOSURE_PLAN.md
36e56e9801e60edb94e178f06c4f8a194a5e7c55efe450fcd17fdf8d7922b858  docs/plans/SATORI_DEEP_PAGINATION_P0_AUTHORITY_AMENDMENT.md
9d1c6e9b8e76e243541c1bb9291ed6985cf4a848226c1e0190db0764b7a8528e  packages/mcp/assets/lateon/runtime-profile-v1.json
566147fd40e93c2b142c3bd407e6e876969b5c4c6784c3b166867607233d9b6c  packages/mcp/src/core/handlers.ts
5f817fc8bd4ceda808873344ad5bf13977f57ca2eb875e1f0fdeab786ca89ef5  packages/mcp/src/core/handlers.scope.test.ts
b84594dc2758683ee68de551976c5615924a564c8b95d511dbf3c248452fae6b  packages/mcp/src/core/handlers.golden.test.ts
eba6ac90893276500dbe414b86f0d0655f13f1ce9ed392f3b5f064496d7b0a72  packages/mcp/src/core/search-disclosure.ts
e658b579199d10da15a50dd26b1e38cab5439c63b24a740b0622945da0169d45  packages/mcp/src/core/search-result-set-cache.ts
0467db9da87ac7361c75b7b3af38db2d6c99778f45b3a4186a468675e1e22f01  packages/mcp/src/core/search-result-set-identity.ts
63009a473267948bc8f561aaf6c1941290ef751f18a226dedce9c9669c044690  packages/mcp/src/core/search-constants.ts
c7d7ca57e28de153d881a22205cc14f804ca4d53912f3871dd0f8a5724d37a21  packages/mcp/src/core/search-policy.ts
8825251c629042c7d5af3dcd61dff08b0d6b9fdf35f1839a6393dd3a69e12829  packages/mcp/src/core/search-exact-fast-path.ts
e687cd36978a97e1ba485559d57da4f06a592f627ad3ab4f2b232215a444ac9f  packages/mcp/src/server/lateon-reranker.ts
5470121c7be5cdbbcc89e443ed2056f3eb09a0923a46a580fc8ec9d98635b935  packages/mcp/src/server/provider-runtime.ts
faede25f1f8cafc831b93aeb1f0b96b82fcde9f31a536b3b0addeee4fc689301  packages/mcp/src/server/shared-runtime.ts
6fbebf33e5320e0db174284224888657e0705292afa3ea6076b49b8ca9762f69  packages/mcp/src/tools/continue_search.ts
9f69bf0dbfc0fc80e54f00e8871118551b3a134edd5443e7c1137b4eba4d6861  packages/mcp/src/tools/search_codebase.ts
b2a64aa61492fca96ed6e376e97d0881b1e62bda191ef8b37b799990c39ef6a1  packages/mcp/package.json
35293d291cab8f0529329ae40fba1807f7604b835142dfdfd52c01a506d2a51a  pnpm-lock.yaml
```

Artifact-manifest SHA-256:
`7ffbdf2908bc29fe84e8eacfbb5f3f77d8b2f695f1f717811622a248a2897deb`

## Decision

All frozen identity, safety, order, no-recomputation, type, and package gates
passed. Track P/P2 continuation reaches
`pagination_complete_frozen_set_qualified` for this frozen source and policy.
