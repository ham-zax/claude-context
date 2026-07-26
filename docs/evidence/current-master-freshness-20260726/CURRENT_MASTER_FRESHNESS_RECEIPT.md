# Current-master incremental freshness qualification receipt

> **Historical blocked execution; superseded for the current release decision.**
> This receipt correctly records that revision `7f82daae…` published a fresh
> contribution-v4/relationship-v9 generation without the complete canonical V4
> repair authority required by `manage_index repair`. The owner correction in
> `96332975…`, qualified at product tip `5ebe57f…`, fixed that separate product
> defect. The later
> [V4 repair-authority and corrected C4 receipt](../repair-authority-c4-20260726/REPAIR_AUTHORITY_C4_RECEIPT.md)
> owns the current decision: fresh reindex publishes complete V4 authority,
> healthy repair is an exact no-op, and corrected `.py`/`runtime` plus
> `.txt`/`mixed` add-modify-delete lifecycles pass. The original
> `post_merge_repair_precondition_blocked` outcome below remains unchanged as
> historical evidence.

## Terminal decision

```text
POST_MERGE_FRESHNESS_OUTCOME=post_merge_repair_precondition_blocked
SATORI_REVISION=7f82daae184105993708654bc24d104c6184db0e
TARGET_REVISION=8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7
```

The mandatory repair precondition failed before either freshness probe was
created. A fresh, healthy contribution-v4/relationship-v9 publication was ready
and all six bounded Python relationships were publicly readable. `manage_index
repair` then returned `requires_reindex`, operation phase `blocked`, with
navigation proof basis `v4_repair_authority_missing`.

Per the frozen qualification rule, this is not a successful post-repair
freshness run. Add, modify, delete, restart, and the second independent root were
not executed.

## Frozen identities and isolation

| Item | Value |
| --- | --- |
| Satori revision | `7f82daae184105993708654bc24d104c6184db0e` |
| Target revision | `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` |
| Task root | `/tmp/satori-current-freshness-20260726-ZBBYAC` |
| Runtime worktree | `/tmp/satori-current-freshness-20260726-ZBBYAC/satori-runtime` |
| First target materialization | `/tmp/satori-current-freshness-20260726-ZBBYAC/target-py` |
| Reserved second target materialization | `/tmp/satori-current-freshness-20260726-ZBBYAC/target-txt` |
| First state root | `/tmp/satori-current-freshness-20260726-ZBBYAC/state-py` |
| First LanceDB path | `/tmp/satori-current-freshness-20260726-ZBBYAC/lance-py` |
| Core dist SHA-256 | `44eb799f1ccdb475b409e804884f0a310d9081adaacbf3fa761f2a595482bc7e` |
| MCP dist SHA-256 | `56553b127ac28ec9d2d951ed2e7e942795e1ecb6bfc761812208751c14185823` |
| Runtime version | Satori `6.3.0` |

The shared Satori checkout matched the requested revision before execution. The
shared target worktree and existing Satori state were not used.

## Healthy V4 publication

Fresh reindex completed:

```text
operation ID=cf083551-2071-4ba0-a9ff-56c326c3e3a3
operation generation=1
operation phase=completed
collection=hybrid_code_chunks_8759fdf2__gen_run_aff5eb24_a199_44b3_a46e_de447b0303ee
marker run ID=aab52c5f-81a3-4b33-ad13-b8b555ff0228
index policy hash=0e19e8c19c7dbc7c7625e297278984859ddffd9276e7ed498d64c391176a4092
policy document digest=8fd6981b233381ce0ca3a99d0c200c6ad7ae0f2a70e9f66bc0a4c1a7f46187f3
```

Navigation and relationship authority:

```text
navigation generation=symmanifest_715e-03a9f7414a53b60a
symbol manifest=symmanifest_715e45c62f61f2d78d0844024d667333
relationship manifest=c5e00e867566c477276d70b94b3a10d07fa7833cdf5c9cde1704a37da1d421cd
navigation seal=f7002a173ce413afabfc1b8d1d3778b9ad4aff1997129fe3e8ae9ca9243ab739
relationship manifest schema=relationship_v2
relationship version=relationship-v9+python-constructor-receivers+python-native-resolution-v1
file contribution schema=relationship_file_contribution_v4
relationship files=1519
relationship records=27732
resolution claims=79173
```

The publication was not merely status-ready. Public `call_graph` witnesses
returned every frozen required relationship:

| Target | Direct authoritative inbound edges | Frozen required sites present |
| --- | ---: | --- |
| `SignalGenerator.check_entry` | 34 | Yes, all 3 |
| `_evaluate_residual_type_invariant` | 2 | Yes, both |
| `SignalLedger.record` | 17 | Yes, required caller |

## Repair result

Exact MCP arguments:

```json
{
  "action": "repair",
  "path": "/tmp/satori-current-freshness-20260726-ZBBYAC/target-py"
}
```

Structured result:

```text
status=requires_reindex
reason=requires_reindex
message=Repair requires one exact marker-owned v4 publication and source checkpoint.
operation ID=0ffcd94d-b3f6-4a60-9284-94b0f36a064e
operation generation=2
operation phase=blocked
accepted=2026-07-26T01:16:05.399Z
blocked=2026-07-26T01:16:05.414Z
```

Repair proof:

| Proof item | Status | Basis |
| --- | --- | --- |
| Collection | `matched` | `selected_snapshot_collection`, observed count 1 |
| Snapshot | `matched` | `verified_snapshot_fingerprint` |
| Marker | `matched` | `completion_marker_fingerprint` |
| Runtime fingerprint | `matched` | `completion_marker_fingerprint` |
| Payload | `not_checked` | — |
| Stale remote chunks | `not_checked` | — |
| Navigation | `failed` | `v4_repair_authority_missing` |

The response recommended:

```json
{
  "tool": "manage_index",
  "args": {
    "action": "reindex",
    "path": "/tmp/satori-current-freshness-20260726-ZBBYAC/target-py"
  }
}
```

No reindex recovery was run because that would not convert this repair into the
required successful no-op or graph-only repair witness.

## Post-repair readback

The blocked repair did not destroy the prior publication:

```text
active collection=hybrid_code_chunks_8759fdf2__gen_run_aff5eb24_a199_44b3_a46e_de447b0303ee
active marker=aab52c5f-81a3-4b33-ad13-b8b555ff0228
relationship manifest=c5e00e867566c477276d70b94b3a10d07fa7833cdf5c9cde1704a37da1d421cd
relationship contribution schema=relationship_file_contribution_v4
```

The six relationship witnesses were repeated after the repair response and
remained present with the same direct counts. This proves preservation of the
starting publication; it does not satisfy the required successful-repair
lifecycle.

## Unexecuted freshness matrix

The following were intentionally not run after the exact blocker:

- restart after a successful repair;
- zero-change sync;
- syntactically valid `.py` add/modify/delete with `scope="runtime"`;
- `.txt` add/modify/delete with `scope="mixed"`;
- final restart and publication readback;
- second-root fresh reindex and repair.

Therefore this receipt makes no current-master add/modify/delete freshness
claim.

## Repository safety

No probe file was created. No product code was edited. The first and second task
target materializations remained clean and detached. The task runtime remained
clean and detached at `7f82daa…`. No task MCP process remained active.

The shared `tradingview_ratio` worktree retained:

```text
## main...origin/main [ahead 1]
 M opencode.jsonc
?? cc.json
```

The existing staged reports, receipts, `AGENTS.md`, and `docs/plans/report.md` in
the shared Satori worktree were not edited, staged, unstaged, or committed by
this batch. Concurrent shared-worktree activity changed the pre-existing
post-merge receipt from staged-add (`A`) to staged-add plus unstaged modification
(`AM`) during this run; that change is not part of this qualification. This new
evidence directory is unstaged.

## Artifact integrity

```text
repair-preflight-py.json
SHA-256=3987ca6e8c50cf7eaa6af780a986defd30b68dbbeb8ca369bdbdc9a5b6a0c889

satori-current-repair-preflight.mjs
SHA-256=3ae3a6be96f8d767630ae253dd9bad4d51698c24d74abf9168b5b02cf2b474c6
```

Raw evidence remains under
`/tmp/satori-current-freshness-20260726-ZBBYAC/evidence`.

## Required next action

Establish why a freshly published marker-owned contribution-v4 generation lacks
the repair authority required by `repairIndex`. Stop when the same fresh
publication returns either an exact no-op repair or an intentionally
constructed, successful graph-only repair. Only then rerun the two-probe
freshness lifecycle.
