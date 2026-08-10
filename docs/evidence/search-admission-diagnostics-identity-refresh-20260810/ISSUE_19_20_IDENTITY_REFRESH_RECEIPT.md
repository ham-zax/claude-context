# Issue 19/20 Contract Identity Refresh Receipt

**Historical behavioral implementation:** `97c08bc6224af71ab60a89141e891a2de220609d`
**Identity-hardening implementation (Commit A):** `54698ad31bf269497e2ef7817703180c8d619296`
**Evidence-producing runtime:** `54698ad31bf269497e2ef7817703180c8d619296`
**Commit A parent:** `a04439380cd2739a75388387da57d93452795cf2`
**Commit A tree:** `105ce075bcfebe958909e0c86e72ed080a1280fc`
**Verification date:** 2026-08-10

This receipt records a new identity-bound verification run. It does not rewrite
the historical Issue 19/20 correction receipt or its redacted proof. Those
historical files remain evidence for implementation `97c08bc` and the identities
that existed when that earlier provider execution occurred.

## Refreshed identities

| Identity | Value |
|---|---|
| Request-contract schema | `satori_rerank_request_contract_v1` |
| Request-contract semantic SHA-256 | `e3ac9871dedcae492d2e6849bcbc6a804384f896c7e61709267b2a5ac147a4e6` |
| Request-contract asset SHA-256 | `74a1ba9f9ba09941e4968977c3cec951f59867388b971dbef2bd57d20856d085` |
| Runtime-profile raw SHA-256 | `06e0ee0fea673142323e9cce62a31e8eb4084ac962b6b04e2d311be3557bfdd8` |
| Acquisition-manifest SHA-256 | `eaade2b16790f082c1b7abdf8da13cc5629f21f28fbb382dff1eccfce1abcdc8` |
| Runtime identity schema / Node | `1` / `v24.13.0` |
| Core compiled root | `481` files / `4,945,653` bytes / `255c222ba03e4cb150414b6f3405bfd735cf262de992d12fc97ccd16eeb38c05` |
| MCP compiled root | `976` files / `8,585,863` bytes / `0a23cec370286e16fe2313fa2662eeb5fda697a35af8ad028dc1917f40010337` |
| Canonical runtime identity SHA-256 | `742aae37c077df2be912ed3f5a82b965be0a12bea519663754cdfc8ae20045dc` |
| Redacted proof SHA-256 | `80eaa2def776b5b43dca3acf0791b533a3baaaf9c6a2d8448719a25fbac69fe4` |
| Redacted proof bytes | `10748` |

Redacted proof:
`docs/evidence/search-admission-diagnostics-identity-refresh-20260810/artifacts/issue-19-20-identity-refresh-live-proof-redacted.json`

The canonical runtime identity was measured only after a clean root build of
Commit A. The build left the tracked worktree clean, and contract, manifest, and
documentation regeneration checks reported no drift. The identity covers every
regular compiled file under the relative Core and MCP roots, plus the Node
version. No source text or absolute path is part of the identity.

## Live behavioral binding

The bounded query was:

```text
how does entry veto validation work
```

Diagnostics-off, shallow full diagnostics, and deep-160 diagnostics returned
the same two ordered product identities. Shallow and deep runs also had equal
ordered candidate IDs at every retained product stage: `raw_dense`,
`raw_lexical`, `core_fusion`, `mcp_pass`, `mcp_fusion`, `mcp_filtered`,
`reranker_input`, `reranker_output`, `mcp_ranked`, `grouped`, and `disclosed`.

Deep diagnostics observed 128 dense candidates that did not participate in
product retrieval. Zero received a `core_fusion_limit` removal. Dense, precise
lexical, and fallback lexical diagnostic retrievals each reported `available`
at requested depth 160.

The query produced 26 eligible families under advertised provider capacity 32.
All 26 candidates were admitted and projected with budget reason
`complete_family_pool`. The two implementation-owner candidates entered the
filtered family pool and reranker input at ranks 17 and 22. LateOn returned them
at provider ranks 2 and 1, respectively. MCP preserved the complete validated
26-candidate provider permutation through ranking and grouping, and preserved
its prefix through disclosure.

The provider received 36,105 UTF-8 document bytes with zero byte-budget
omissions. It completed one call with one attempt, zero retries, zero timeouts,
and zero failures.

Timing labels for this execution:

- diagnostics-off full search RPC, including cold readiness: `16058.144 ms`;
- shallow worker/provider and outer rerank: `712 ms`; full RPC: `3184.949 ms`;
- deep-160 worker/provider and outer rerank: `695 ms`; full RPC: `3230.9 ms`.

No ranking tournament, relevance tuning, provider-order change, packet change,
embedding change, or retrieval-policy change was performed.

## Verification

The complete package verification was run against the same 12-file
identity-hardening package-source tree later committed as Commit A. After the
unrelated installer fix was reordered before Commit A, the affected scripts
suite and root checks were rerun on the final Commit A tree.

| Check | Outcome |
|---|---|
| Focused rerank/candidate-survival tests | 28 passed, 0 failed |
| Full Core suite | 681 passed, 1 skipped, 0 failed |
| Full MCP suite | 1500 passed, 1 skipped, 0 failed |
| Full CLI suite | 342 passed, 0 failed |
| Final scripts suite | 340 passed, 0 failed |
| Root `pnpm check` | passed |
| Clean root build of Commit A | passed; no tracked diff |
| Request-contract check | passed (`e3ac9871dedcae492d2e6849bcbc6a804384f896c7e61709267b2a5ac147a4e6`) |
| MCP manifest check | passed |
| MCP docs check | passed |
| MCP release smoke | passed |
| CLI release smoke | passed |
| Bounded Issue 19/20 live smoke | passed |

## Evidence handling

Complete normalized response bytes were hashed in memory and were not retained.
The committed proof contains no source text, previews, absolute paths, local
model paths, or complete source-bearing response envelopes. It retains only
bounded counts, statuses, candidate IDs, ranks, timings, and cryptographic
digests needed to verify the acceptance conditions.

This receipt closes the Issue 19/20 identity lineage. Further ranking,
retrieval, packet, embedding, provider-order, or diagnostic-contract work is
outside this closure.
