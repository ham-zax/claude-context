# Incremental search freshness first-wrong-boundary receipt

## Terminal decision

```text
FRESHNESS_BOUNDARY_OUTCOME=freshness_query_filter_mismatch
FIRST_WRONG_OWNER=packages/mcp/src/core/search-execution.ts::evaluateCandidate
SATORI_REVISION=4138b1eba5606a8291b45395f767a46b946070fb
TARGET_REVISION=8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7
```

The incremental publication was fresh. The earlier zero-result observation was
caused by querying a `.txt` probe with the default `runtime` scope. Satori
classifies `.txt` as `docs`; the exact probe candidate was retrieved from the
current active publication at rank 1 and then removed by the scope filter before
the `must:` predicate was evaluated.

The same added and modified probe was returned as the first public result with
`scope="mixed"`. A bounded intervention using the exact same `must:` query with
`scope="mixed"` returned one result, `matchesMust=true`, and
`mustRetry.satisfied=true`.

No product correction is justified by this evidence.

## Isolation and runtime identity

| Item | Value |
| --- | --- |
| Satori revision | `4138b1eba5606a8291b45395f767a46b946070fb` |
| Target revision | `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` |
| Task root | `/tmp/satori-freshness-boundary-20260726-JJs1je` |
| Satori worktree | `/tmp/satori-freshness-boundary-20260726-JJs1je/satori-runtime` |
| Target materialization | `/tmp/satori-freshness-boundary-20260726-JJs1je/target` |
| State root | `/tmp/satori-freshness-boundary-20260726-JJs1je/state` |
| LanceDB path | `/tmp/satori-freshness-boundary-20260726-JJs1je/lancedb` |
| Core dist SHA-256 | `44eb799f1ccdb475b409e804884f0a310d9081adaacbf3fa761f2a595482bc7e` |
| MCP dist SHA-256 | `56553b127ac28ec9d2d951ed2e7e942795e1ecb6bfc761812208751c14185823` |
| Runtime | Node `v24.13.0`, pnpm `10.28.2`, Satori `6.3.0` |

The expected master revision matched before any task environment was created.
The detached runtime stayed at that exact revision throughout. During the run,
the shared original Satori worktree was externally fast-forwarded to
`7f82daae184105993708654bc24d104c6184db0e`; that did not alter the task-owned
runtime, target, state, LanceDB, or MCP process. The user’s target worktree and
existing Satori state were not used.

## Canonical reproduction

Probe path:

```text
src/python/satori_freshness_probe_20260726_a7f91c.txt
```

Fresh publication:

```text
operation=eda785b8-2352-491f-bd0b-dc5cffb83380
collection=hybrid_code_chunks_c32340c5__gen_run_33223ae1_cf7f_450b_a437_3bff5d1d504a
marker=3bebbd54-1581-4c1a-b061-01210337e4e6
navigation=symmanifest_6dbf-527d6d06ddeed9ca
```

### Add: token A

```text
token=SATORI_FRESHNESS_PROBE_20260726_A7F91C
write/read timestamp=2026-07-26T00:06:47.688Z
source bytes=39
source SHA-256=155e5ccbd5c9d06c9efad5d4ed977570607dfb3856032be1017df086495157f1
sync operation=efdb2a54-4a1c-4aeb-af48-bb5fcf86191b
sync generation=2
sync delta=added:1 modified:0 removed:0
active collection=hybrid_code_chunks_c32340c5__gen_dfca58bb_efbc_4e49_8709_d93af5edf060
active marker=b851fbad-1a23-4fe4-b2ff-4ad6858337d0
policy document digest=2f03d9c74ee7423b2fdf8ab931d333fb03c3180066794b391d3c34473720fada
```

Checkpoint evidence:

```text
checkpoint identity=hybrid_code_chunks_c32340c5__gen_dfca58bb_efbc_4e49_8709_d93af5edf060
merkle root=1a35d293883c6a21493d01f332c47cae5b948f8b5c3d892ed48aef1e2886aa3e
checkpoint digest=a46b4e05cd2b6363ea721a18a72876a4f13990ea19ee20b3867c444a68f9a496
checkpoint file hash=155e5ccbd5c9d06c9efad5d4ed977570607dfb3856032be1017df086495157f1
```

Exact persisted chunk:

```text
chunk ID=chunk_130d541283f58e8f
content hash=968bd1256fdf98d51b861ceec852e2d6cf26354fd496c0e2d772aa8f5296875d
span=1:1
vector dimension=256
vector SHA-256(float32-le)=c2f1163d64c2994bd01ed73229414e8a45481d0166097f36fe308952af6d89ac
```

The physical row’s `content` was exactly the token plus newline. Its
`lexicalText` contained the full token, the probe path, language `text`, symbol
kind `file`, and identifier components.

Raw retrieval:

- raw FTS returned `chunk_130d541283f58e8f` at rank 1 with score
  `75.4207534790039`;
- raw vector retrieval using the persisted row’s vector returned the same chunk
  with cosine distance approximately `-1.19e-7`;
- public candidate tracing preserved the same chunk through `raw_lexical`,
  `raw_lexical_fallback`, `core_result`, `mcp_pass`, and `mcp_fusion`;
- `evaluateCandidate` then removed it with `reason="scope_filter"`;
- the `runtime` exact-`must:` response consequently exposed zero results and
  emitted `FILTER_MUST_UNSATISFIED`;
- the normal `mixed` query disclosed the probe as result 1 with the current
  preview.

### Modify: token B

```text
token=SATORI_FRESHNESS_PROBE_20260726_B4D82E
write/read timestamp=2026-07-26T00:07:03.987Z
source bytes=39
source SHA-256=fc6cb0eb078ba4c765bb092dd4689c323969239e3e7409dce173681728e26e6f
sync operation=9db5f4e5-70bb-441a-96bd-b089390dd90c
sync generation=3
sync delta=added:0 modified:1 removed:0
active collection=hybrid_code_chunks_c32340c5__gen_a334d1d2_91e2_4db3_8ecb_2300921772cb
active marker=ed6cb68f-00a7-42c4-bea1-a1d2fdeccd2f
policy document digest=ee655ec1f161afe256257aa82826322f910f53580d3b34af00d723b444a788c5
```

Checkpoint evidence:

```text
checkpoint identity=hybrid_code_chunks_c32340c5__gen_a334d1d2_91e2_4db3_8ecb_2300921772cb
merkle root=f554a22431c0ab2285c429f7753f1ffe342121f4fd60687438a65425b3bc918c
checkpoint digest=8425f3856b08a3dac3591a3a6af25850c546df2641883aac5a72eed1bafd62a3
checkpoint file hash=fc6cb0eb078ba4c765bb092dd4689c323969239e3e7409dce173681728e26e6f
```

Exact persisted chunk:

```text
chunk ID=chunk_6f916d35bd50b7f2
content hash=d0666ee02b9efe7a7545e428415be3a17c7430a4cf3a4f0ddfe4785451163a9f
span=1:1
vector dimension=256
vector SHA-256(float32-le)=f1853917fb691bcb5c750c5b66cc5ed545f259adbb55e4b0c909c671f10e04b6
```

The previous chunk/token was absent from the modified active collection. Raw
FTS returned the B chunk at rank 1 and returned no probe row for token A. Raw
vector retrieval returned the B chunk. The public candidate followed the same
path as A and was removed only under `runtime` scope. Under `mixed` scope, B was
disclosed as result 1 and A returned zero public results.

## Boundary trace decision

| Boundary | Exact evidence | Result |
| --- | --- | --- |
| Filesystem source/hash | Exact 39-byte sources and SHA-256 values above | Correct |
| Source observation/checkpoint | Both hashes persisted under the matching candidate collection checkpoints | Correct |
| Sync delta | Add `1/0/0`; modify `0/0/1`; completed operations generations 2 and 3 | Correct |
| Chunk production | One exact path row after each sync | Correct |
| Chunk ID/text | Distinct deterministic IDs with exact current text; old row removed | Correct |
| Lexical projection | `lexicalText` contains each exact token | Correct |
| Vector/storage mutation | Exact rows and finite 256-dimensional vectors in each active candidate collection | Correct |
| Candidate generation | Probe is raw lexical rank 1 and survives Core/MCP fusion | Correct |
| Mutation receipt | Completed operation IDs and generations match checkpoint snapshot entries | Correct |
| Publication activation | Status and completion marker select each new candidate collection | Correct |
| Search selected generation | Search candidate ID/content equals the exact row in the active publication; readiness remained valid | Correct |
| Raw lexical retrieval | Exact probe rank 1 for A and B | Correct |
| Raw vector retrieval | Exact stored probe returned for A and B | Correct |
| `must:` evaluation | Not reached for the probe under `runtime`; scope filter removes it first | First mismatch |
| Public response | Zero under `runtime`; current probe is result 1 under `mixed` | Query-scope mismatch |

## Responsible owner

The first removal occurs in:

```text
packages/mcp/src/core/search-execution.ts
evaluateCandidate
```

Its policy inputs are owned by:

```text
packages/mcp/src/core/search-ranking-policy.ts
isDocPath
    .txt -> docs

shouldIncludeCategoryInScope
    runtime + docs -> false
```

This behavior is internally consistent. The faulty assumption was that a `.txt`
probe under `src/python` belongs to runtime scope. Extension classification
precedes the later `/src/` classification.

## Intervention proof and bounded correction plan

Intervention operation `e025b10c-f14c-4478-a6a7-95334b3315f9`
re-added token B. The exact query:

```json
{
  "path": "/tmp/satori-freshness-boundary-20260726-JJs1je/target",
  "query": "must:SATORI_FRESHNESS_PROBE_20260726_B4D82E SATORI_FRESHNESS_PROBE_20260726_B4D82E",
  "scope": "mixed",
  "limit": 15,
  "debugMode": "full",
  "debugCandidateLimit": 160
}
```

returned the probe with:

```text
result position=1
matchesMust=true
exactLexicalMatch=true
mustRetry.satisfied=true
mustRetry.finalCount=1
removedByScope=0
```

Smallest correction plan:

1. For text freshness probes, set `scope="mixed"` on both exact-`must:` and
   ordinary searches.
2. If the intended contract is specifically runtime-scope freshness, use a
   runtime-classified source extension such as `.py` and syntactically valid
   probe content.
3. Assert the exact target file and preview in public results; do not treat
   `resultCount=0` as stale until full debug confirms the candidate was absent
   before filtering.
4. Rerun the C4 freshness qualification with that corrected query/probe pairing.

No product policy or search filtering should be changed to make a mismatched
qualification probe pass.

## Cleanup and repository safety

The canonical cleanup sync removed one probe file under operation
`6a780356-0a53-45e1-9779-47dec6fdef85`. The intervention cleanup removed one
probe file under operation `9bff90fc-0f06-4e93-a2b6-5b56239bff22`.

Final task-owned state:

```text
probe path absent
task target Git status=clean detached
task Satori Git status=clean detached
task MCP processes remaining=0
```

Original `tradingview_ratio` status was unchanged:

```text
## main...origin/main [ahead 1]
 M opencode.jsonc
?? cc.json
```

The original Satori worktree’s pre-existing staged/modified files were not
edited, unstaged, or restaged by this task. Its branch moved concurrently:

```text
initial observed HEAD=4138b1eba5606a8291b45395f767a46b946070fb
external fast-forward time=2026-07-26T08:07:44+08:00
final observed HEAD=7f82daae184105993708654bc24d104c6184db0e
external commits:
  4bfaff6 test(core): align generation proof probe contracts
  d38bb1f docs: integrate portable CodeQL evidence
  7f82daa docs: normalize CodeQL disposition markdown
```

The qualification result remains revision-specific to `4138b1e…`; it does not
qualify those later commits. This receipt and its JSON summary are new
evidence-only files and are not staged or committed.

## Raw evidence integrity

```text
freshness-boundary-raw.json
SHA-256=144fc1739e814ba25da7e9aea74229c29ff6eaa6962249c36b8bf280b8cd82a9

freshness-boundary-intervention.json
SHA-256=1a61bdb798afef957bd8d2f0f64269d5b3ab08fc1cffd2a5b9974f6b57d410f6

satori-freshness-boundary-20260726.mjs
SHA-256=29fc18865e258f165a49c210212df5a44efa31a0fefb9eb596b495e274763260

satori-freshness-boundary-intervention.mjs
SHA-256=844c246eb1de6bd4ae44828fc6d44220390dda2f8ed6a4845ddb24513934ce57
```

Raw artifacts remain under
`/tmp/satori-freshness-boundary-20260726-JJs1je/evidence`.
