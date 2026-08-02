# P0 pagination-bound receipt

Terminal decision: `pagination_bound_derivation_blocked`

This receipt freezes the values that are supported by the current source and
records the values that cannot be selected without inventing missing byte,
lifecycle, or exact-path contracts. Track P/P1 and P2 remain closed.

## Immutable input identity

| Input | Identity |
| --- | --- |
| Source revision | `a7062a2ac6e99bbf39a83aae344e7d8571f04853` |
| Source tree | `1f4d90e6da7f6528adc316ff86a90e33256fed89` |
| Authority plan | `docs/plans/SATORI_DEEP_LATEON_RERANKING_AND_PAGINATED_DISCLOSURE_PLAN.md` |
| Authority-plan SHA-256 | `3a588e921f0c98f0ae16d71e95bce78e7c69a94eac0ca878d08efa43010c95d3` |
| Node | `v24.13.0` |
| pnpm | `10.28.2` |
| Blocked fixture-authority SHA-256 | `c40c8739bf81320693a41b81f22ee94942ed2d6034bc166c0d9a0007a3f3ead4` |

The fixture digest identifies the deterministic
`maximum_shape_fixture_authority` manifest emitted by
`scripts/satori-search-pagination-bound-measure.mjs`. Its status is
`unavailable`; it does not pretend that an unsupported maximum-shape literal
exists.

### Source constants consumed

| Constant | Value | Source |
| --- | ---: | --- |
| `SEARCH_MAX_CANDIDATES` | `80` | `search-constants.ts` |
| `SEARCH_DEFAULT_DISCLOSURE_LIMIT` | `10` | `search-constants.ts` |
| `SEARCH_GROUPED_RESPONSE_MAX_UTF8_BYTES` | `131072` | `search-constants.ts` |
| `SEARCH_GROUPED_DEBUG_RESPONSE_MAX_UTF8_BYTES` | `2097152` | `search-constants.ts` |
| `SEARCH_TRACKED_LEXICAL_MAX_RESULTS` | `16` | `search-query-support.ts` |
| `SEARCH_DIRTY_OVERLAY_MAX_RESULTS` | `16` | `search-query-support.ts` |
| `SEARCH_LIVE_PATH_SUPPLEMENT_MAX_RESULTS` | `8` | `search-query-support.ts` |

Source SHA-256 identities:

- `search-constants.ts`: `3a81efbb57947833e9336d620eff096bd87cb6cb03943b05027116a8f8333833`
- `search-policy.ts`: `03ee4804cbcb24c2e620fa3615d8732e1369423a94f7dd7e1ae00a5807b06987`
- `search-result-set-cache.ts`: `2312769b097fb744e23d6d6caac2623c03c8201a743a1a57f6daa82dff7785b1`
- `search-disclosure.ts`: `db89917ab435167eba1309822ed36cde293897ae08cfd4e4727efef6409cc48e`
- `search-exact-fast-path.ts`: `dd4686f90a80a2d190ec3c45aea6862464f0eafeef8a3c33e8df2b92ba1c6ddd`
- `search-query-support.ts`: `0757b003a26f9a6c00f011438bb460301344a5f6d0d5b9394a08136a6879ffe9`
- `search-execution.ts`: `a7d3b85abe5fa015061fdad151c2b7f3c606347af05958c0e3b7e40a52ad9322`

## Frozen observations

| Value | Observation |
| --- | --- |
| `requestedTotal` | `{ kind: caller_supplied, validation: positive_safe_integer, performanceProfileCap: null }`. The measurement sample is explicitly `200`, not a request maximum. |
| `MAX_FROZEN_RESULTS` | `200`, prospective pipeline bound |
| `MAX_PAGE_SIZE` | unsupported (`null`) |
| `MAX_RESULT_SET_ENTRY_BYTES` | unsupported (`null`) |
| `MAX_RESULT_SET_CACHE_BYTES` | unsupported (`null`) |
| `MIN_RESIDENT_RESULT_SETS` | unsupported (`null`) |
| Normal grouped response budget | `131072` UTF-8 bytes |
| Debug grouped response budget | `2097152` UTF-8 bytes |
| Default initial disclosure | `10`; not reused as `MAX_PAGE_SIZE` |
| Semantic passes | `2`: `primary`, `expanded` |
| Supplement depths | tracked lexical `16`; dirty overlay `16`; live path `8` |
| Current exact-fast-path maximum | unsupported/unbounded locally (`null`); relationship results slice by `input.limit` |
| Required exact-fast-path clamp | `200`, to be enforced with `MAX_FROZEN_RESULTS` before that bound is admissible |

The semantic-path union is exact:

```text
2 * SEARCH_MAX_CANDIDATES
  + SEARCH_TRACKED_LEXICAL_MAX_RESULTS
  + SEARCH_DIRTY_OVERLAY_MAX_RESULTS
  + SEARCH_LIVE_PATH_SUPPLEMENT_MAX_RESULTS
= 2 * 80 + 16 + 16 + 8
= 200
```

The remaining formulas are frozen, but their numeric inputs are not supported:

```text
effectiveFrozenTotal = min(
    requestedTotal,
    availableGroupedResults,
    MAX_FROZEN_RESULTS
)

MAX_PAGE_SIZE = max n such that canonical maximum-shape normal and debug
    grouped projections of n results fit their respective response-byte budgets

MAX_RESULT_SET_ENTRY_BYTES = maximum serialized frozen-set bytes
    + one reserved maximum replay-page bytes

MAX_RESULT_SET_ENTRY_BYTES < MAX_RESULT_SET_CACHE_BYTES

MAX_RESULT_SET_ENTRY_BYTES * MIN_RESIDENT_RESULT_SETS
    <= MAX_RESULT_SET_CACHE_BYTES
```

## Exact consumers

| Authority | Exact consumer |
| --- | --- |
| `requestedTotal` contract | `search_codebase` schema and handler |
| `MAX_FROZEN_RESULTS` | result-set construction, continuation cursor/offset validation, cache admission, and required exact-registry clamp |
| `MAX_PAGE_SIZE` | initial `disclosureLimit`, `continue_search.limit`, and page projection |
| `MAX_RESULT_SET_ENTRY_BYTES` | admission of one frozen set plus one maximum replay page |
| `MAX_RESULT_SET_CACHE_BYTES` | process-global aggregate storage, eviction, and capacity accounting |
| `MIN_RESIDENT_RESULT_SETS` | process-global concurrent result-set lifecycle |
| Normal response bytes | normal initial disclosure and continuation projection |
| Debug response bytes | debug initial disclosure and continuation projection |

## Blockers and uncertainties

1. `MAX_PAGE_SIZE` is unsupported because preview truncation does not bound
   every stored/query/path/hint field in grouped envelopes and results. A
   reproducible canonical maximum-shape projection therefore does not exist.
2. `MAX_RESULT_SET_ENTRY_BYTES` is unsupported because the frozen stored
   query/path/hint/result payload and its reserved replay page do not have a
   complete maximum serialized shape.
3. `MIN_RESIDENT_RESULT_SETS` is unsupported because no process-global maximum
   live-session/result-set lifecycle contract exists. The cache constructor's
   current defaults are implementation settings, not lifecycle authority.
4. `MAX_RESULT_SET_CACHE_BYTES` is consequently unsupported: neither its
   per-entry multiplicand nor its required resident count is frozen.
5. `currentExactFastPathMaximum` is unsupported because the exact-registry
   relationship path slices by caller `input.limit`. The prospective `200`
   ceiling is not globally admissible until that owner is clamped.

A future complete payload-byte contract could make the page and entry
measurements finite. A future process-global concurrency/lifecycle contract is
required before the aggregate cache capacity can be derived. Until both exist,
choosing numeric values would be unsupported.

## Deterministic check

```text
node --import tsx --test scripts/satori-search-pagination-bound-measure.test.mjs
tests 2; pass 2; fail 0
```
