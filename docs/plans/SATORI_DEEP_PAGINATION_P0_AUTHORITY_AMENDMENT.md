# Satori Deep Pagination P0 Authority Amendment

**Status:** execution authority for Track P only

**Date:** 2026-08-02

**Parent authority:**
[`SATORI_DEEP_LATEON_RERANKING_AND_PAGINATED_DISCLOSURE_PLAN.md`](./SATORI_DEEP_LATEON_RERANKING_AND_PAGINATED_DISCLOSURE_PLAN.md)
at source revision `a7062a2ac6e99bbf39a83aae344e7d8571f04853`.

This amendment supersedes only the parent plan's P0 derivation requirements
that the receipt
[`P0_BOUND_RECEIPT.md`](../evidence/deep-pagination-p0-20260802/P0_BOUND_RECEIPT.md)
proved cannot be satisfied from the current contracts. Every other Track P,
Track L, Track I, held-out, fallback, and default-policy boundary remains
unchanged.

## 1. Why an amendment is required

The current source proves a bounded distinct-candidate ceiling of `200`, normal
and debug response budgets of `128 KiB` and `2 MiB`, and a default initial page
of `10`. It does not define a finite maximum serialized shape for every query,
path, hint, debug, generation-receipt, or grouped-result field. It also creates
one continuation cache per MCP session, so the observed `16 MiB` cache default
is not process- or host-global.

Consequently, these original requirements are circular:

- deriving `MAX_PAGE_SIZE` as a count guaranteed to fit every possible payload;
- deriving a maximum frozen-set size from fields that have no finite maximum;
- describing a per-session cache default as a global memory bound.

The correction separates count admission from byte admission. Pathological or
oversized payloads fail continuation admission explicitly while their already
valid initial search response remains available.

## 2. Frozen values

| Authority | Value | Basis |
| --- | ---: | --- |
| `requestedTotal` | caller-supplied positive safe integer | Logical request; no performance-profile cap |
| `MAX_FROZEN_RESULTS` | `200` | `2 * 80 + 16 + 16 + 8` bounded candidate union |
| `MAX_PAGE_SIZE` | `200` | Count ceiling cannot exceed the frozen set; byte projection independently reduces the returned count |
| default initial page | `10` | Existing disclosure contract |
| normal response bytes | `128 * 1024` | Existing grouped-response contract |
| debug response bytes | `2 * 1024 * 1024` | Existing grouped-debug-response contract |
| `MAX_RESULT_SET_ENTRY_BYTES` | `8 * 1024 * 1024` | Half of the preserved aggregate budget; includes frozen value plus reserved replay bytes |
| `MAX_RESULT_SET_CACHE_BYTES` | `16 * 1024 * 1024` | Preserves the current aggregate cache allocation |
| `MIN_RESIDENT_RESULT_SETS` | `2` | One current handle plus one replacement handle at the maximum admissible size |
| maximum entry count | `32` | Existing secondary count/LRU bound for smaller entries |
| result-set TTL | `15 minutes` | Existing expiry contract |

The `8 MiB`, `16 MiB`, and `2` values are explicit product-policy decisions,
not measurements inferred from repository content. They preserve the current
aggregate allocation while adding the smallest useful replacement-lifecycle
guarantee:

```text
MAX_RESULT_SET_ENTRY_BYTES < MAX_RESULT_SET_CACHE_BYTES

MAX_RESULT_SET_ENTRY_BYTES * MIN_RESIDENT_RESULT_SETS
    = MAX_RESULT_SET_CACHE_BYTES
```

No performance profile, embedding speed, reranker latency, or model-memory gate
participates in these values.

## 3. Corrected count and byte semantics

Freeze the count formula as:

```text
effectiveFrozenTotal = min(
    requestedTotal,
    availableGroupedResults,
    MAX_FROZEN_RESULTS
)
```

`MAX_PAGE_SIZE` is the maximum requested group count for an initial or
continuation page. It is not a promise that all `200` groups fit in one response.
For each page:

```text
requestedPageCount = min(requestedPageSize, remainingGroups, MAX_PAGE_SIZE)

returnedPageCount = largest deterministic prefix of requestedPageCount whose
    complete response fits the applicable normal/debug response-byte budget
```

The cursor advances by `returnedPageCount`, never by the requested page size.
If the authority envelope with zero groups exceeds the response-byte budget,
return the existing explicit response-authority error. If one complete group
cannot fit after the established preview-only truncation, return the existing
explicit page-too-large error without advancing or replacing the frozen set.

The exact-registry fast path is not exempt. It currently constructs a grouped
envelope directly and can bypass both count and byte projection. Under this
amendment it must retain exact pinning and zero vector work while feeding its
ordered exact groups through the same frozen-total, disclosure-byte,
continuation, and cache-admission contract as the semantic path.

The entry budget uses reservation, not optimistic actual usage:

```text
entryReservationBytes = serializedFrozenValueBytes
    + reservedReplayResponseBytes

entryReservationBytes <= MAX_RESULT_SET_ENTRY_BYTES
```

`reservedReplayResponseBytes` is the applicable response-byte ceiling for that
set (`128 KiB` normally, `2 MiB` for debug-capable continuation). Aggregate
capacity charges the full reservation while the handle is live. An actual retry
page must fit its reservation; it never grows the entry beyond the admitted
amount.

Fields without a finite individual maximum do not receive guessed truncation
constants. Their actual canonical serialized bytes participate in admission.
If an otherwise valid frozen set exceeds its entry budget:

- return the valid initial page;
- return no continuation handle;
- publish `SEARCH_RESULT_SET_NOT_CACHE_ADMISSIBLE`;
- report truthful available, frozen, returned, and omitted counts;
- leave existing cache state unchanged.

## 4. Cache and session ownership

One runtime host owns one aggregate continuation cache budget across all of its
local and provider-backed handlers. Standalone provider runtimes own one
equivalent runtime-local aggregate budget. `Context` does not own this state.
The `16 MiB` guarantee is runtime-instance-global, not a module-level singleton
across deliberately separate runtime hosts constructed in one process. Handles
cannot cross those runtime boundaries, and tests may construct several hosts;
claiming one process-global pool would require a broader lifecycle owner that
Track P does not need.

Sharing capacity must not broaden handle authority. Every handle is bound to an
opaque continuation scope:

- all local and provider-backed handlers for one MCP session share one scope;
- another MCP session cannot look up, advance, replay, or route that handle;
- internal recovery/runtime handlers use a separate non-session scope;
- owner unregistration removes every payload owned by that owner;
- global LRU/byte eviction may evict entries across scopes, but it never exposes
  one scope's entry to another.

Cross-session lookup remains `not_found`. Within one session, routing between
the local handler and its provider-backed handler remains supported.

## 5. Exact consumers

| Contract | Owner/consumer |
| --- | --- |
| positive-safe `requestedTotal` | `search_codebase` schema and direct handler validation |
| `MAX_FROZEN_RESULTS` | result-set construction, exact-registry clamp, cursor/offset validation |
| `MAX_PAGE_SIZE` | initial `disclosureLimit`, `continue_search.limit`, page projection |
| response-byte ceiling | `projectGroupedDisclosure` for semantic and exact-registry initial and continuation pages |
| entry reservation | `SearchResultSetCache` typed admission and replay validation |
| aggregate bytes/count/TTL | runtime-instance-owned `SearchContinuationCoordinator` cache |
| continuation scope | coordinator owner registration, lookup, advance, routing, shutdown |

The current `getMaxSearchLimit()` remains invalid for logical totals, page size,
and cursor validation. Task 2 must separate those consumers and clamp the exact
relationship fast path to `200` before the frozen-result ceiling becomes active.

## 6. Required qualification

Track P cannot close without focused tests proving:

1. positive-safe logical requests above the slow Potion limit are accepted;
2. exact-registry and semantic paths retain no more than `200` frozen groups;
3. exact-registry responses no longer bypass count or response-byte projection;
4. a requested page of `200` is dynamically byte-projected and the cursor moves
   by the actual returned count;
5. two maximum-size reservations coexist under `16 MiB`; a third is handled by
   deterministic LRU eviction;
6. entry rejection and replay overflow leave all existing cache state unchanged;
7. an inadmissible frozen set returns its initial page, warning, truthful counts,
   and no handle;
8. two sessions share aggregate capacity but cannot use each other's handles;
9. session/owner shutdown purges its payloads;
10. retries remain byte-identical and charge no new retrieval or reranking work;
11. the existing over-budget authority-envelope and page-too-large failures stay
    explicit.

## 7. Boundary

This amendment authorizes the minimum Track P changes needed to implement the
contracts above. It does not authorize Track I, LateOn depth/projection work,
held-out access, dependency changes, ranking-policy changes, production
activation, or arbitrary field truncation.
