# Post-merge freshness and memory stabilization receipt

> **Historical execution with superseded interpretations.** The original
> freshness-blocked interpretation was invalid because a `.txt`/docs candidate
> was queried under `runtime` scope. The
> [freshness-boundary receipt](../freshness-boundary-20260726/FRESHNESS_BOUNDARY_RECEIPT.md)
> proved that the indexed candidate was present in the active publication and
> raw retrieval and classified the first wrong boundary as
> `freshness_query_filter_mismatch`. The later
> [current-master freshness receipt](../current-master-freshness-20260726/CURRENT_MASTER_FRESHNESS_RECEIPT.md)
> separately exposed a real missing-canonical-V4-authority defect. The
> [V4 repair-authority and corrected C4 receipt](../repair-authority-c4-20260726/REPAIR_AUTHORITY_C4_RECEIPT.md)
> records that defect as fixed and both corrected probe classes as passing.
>
> The original latency measurements below remain historical measurements for
> revision `4138b1e…`. The original inconclusive memory interpretation is
> superseded by the later
> [external-sampler memory characterization](../cold-graph-memory-20260726/INCREMENTAL_PUBLICATION_MEMORY_RECEIPT.md);
> the [cold call-graph receipt](../cold-graph-memory-20260726/COLD_CALL_GRAPH_RECEIPT.md)
> retains the separate first-call limitation.

## Terminal decision

```text
POST_MERGE_OUTCOME=post_merge_freshness_blocked
SATORI_REVISION=4138b1eba5606a8291b45395f767a46b946070fb
TARGET_REVISION=8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7
```

The expected Satori revision matched `HEAD`, so qualification proceeded. The
terminal blocker is C4 product readback: in two independent state roots, explicit
sync reported the added or modified task-owned source file, but exact search did
not return its unique token. A separate bounded diagnostic also returned zero
results for exact and plain token searches, with and without a path scope.

Latency and memory were still measured. Explicit-sync and warm-graph latency
passed. Cold first-tool `call_graph` latency failed. Idle and peak memory passed,
but the six-cycle cooldown trend cannot distinguish allocator/runtime retention
from unbounded product retention with the available observability.

## Scope and immutable inputs

| Item | Value |
| --- | --- |
| Satori source | `/home/hamza/repo/satori` |
| Expected and observed Satori revision | `4138b1eba5606a8291b45395f767a46b946070fb` |
| Frozen target revision | `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` |
| Task root | `/tmp/satori-post-merge-qualification-ywy40t` |
| Candidate runtime worktree | `/tmp/satori-post-merge-qualification-ywy40t/satori-runtime` |
| Independent target materializations | `target-a`, `target-b` under the task root |
| Runtime version | Satori `6.3.0` |
| Node / pnpm | `v24.13.0` / `10.28.2` |
| Core dist SHA-256 | `44eb799f1ccdb475b409e804884f0a310d9081adaacbf3fa761f2a595482bc7e` |
| MCP dist SHA-256 | `56553b127ac28ec9d2d951ed2e7e942795e1ecb6bfc761812208751c14185823` |
| Relationship version | `relationship-v9+python-constructor-receivers+python-native-resolution-v1` |
| Contribution schema | `relationship_file_contribution_v4` |
| Relationship manifest schema | `relationship_v2` |

No product code was edited. The original target worktree and its existing index
were not used for qualification.

## Finding summary

| Finding | Evidence | Decision |
| --- | --- | --- |
| Two-root C4 freshness | Both roots completed fresh reindex, restart, zero-change sync, add/modify/delete sync, and final restart. Add and modified tokens never became searchable. | **Blocked** |
| Repair | Both fresh roots returned structured `requires_reindex`; navigation proof basis was `v4_repair_authority_missing`. | Observed; not the terminal classifier |
| Relationship preservation | Both roots retained the three required `check_entry`, two residual-invariant, and required ledger relationships after restart and mutation cycles. | Pass |
| Relationship compatibility | Both roots remained on relationship-v9, contribution-v4, manifest-v2. | Pass |
| Explicit-sync latency | p50 `1708.833 ms`; p95 `1785.263 ms`; limit `7000 ms`. | Pass |
| Warm `call_graph` latency | p50 `11.621 ms`; p95 `12.954 ms`; limit `25 ms`. | Pass |
| Cold `call_graph` latency | p50 `7250.155 ms`; p95 `7524.119 ms`; limit `750 ms`. | **Fail** |
| Clean idle RSS | `152.523 MiB`; limit `200 MiB`. | Pass |
| Incremental publication peak RSS | Maximum sampled during-tool peak `914.34 MiB`; maximum required-checkpoint RSS `1207.38 MiB`; limit `1638.4 MiB`. | Pass |
| Memory plateau | 120-second RSS rose from `514.52` to `608.40 MiB` over six cycles while relationship/claim counts and retained generations stayed fixed. Heap and external memory stabilized, but repeated authority/status observation itself triggered delayed expansions. | Cannot be distinguished |
| Repository safety | Original statuses match the frozen statuses; all task worktrees are clean; no task MCP process remains. | Pass |

## Part A — C4 freshness

### Root A publication identity

```text
collection=hybrid_code_chunks_c3f045f4__gen_run_8791a57b_e186_40dc_85c8_2fb9f09627d6
markerRunId=7beb5547-fdfd-4850-a9e1-025ccde88727
policyHash=0e19e8c19c7dbc7c7625e297278984859ddffd9276e7ed498d64c391176a4092
policyDigest=9589ddbad5106d83abf5f56a8b0ab25d9c9855b18e1493dac0fd3f6a55d80679
navigationGeneration=symmanifest_6ed3-d7d1e4f0af49e2f6
symbolManifest=symmanifest_6ed30a9c35b860bc0e92861c39ea02aa
relationshipManifest=a7bbab7ab8266e4b21ed855fea44a8c7c86d10f8398622017130384bf066b947
navigationSeal=4063bd0bbe28b633f40ca925cf3a42608a0c3c11f8990cd8a1c15f4d98b92c61
relationshipRecords=27732
resolutionClaims=79173
relationshipFiles=1519
```

Root A and root B each followed:

```text
fresh reindex
-> capture publication/checkpoint/navigation/relationship authority
-> repair
-> restart
-> zero-change explicit sync
-> add unique token and sync
-> modify unique token and sync
-> delete probe and sync
-> restart
-> publication and relationship readback
```

Observed in both roots:

- zero-change sync reported `added=0`, `modified=0`, `removed=0`;
- add sync reported one added file, but exact `must:` search returned zero
  results and `FILTER_MUST_UNSATISFIED`;
- modify sync reported the changed file; the old token correctly missed, but the
  new token also returned zero results;
- delete sync reported one removed file and the deleted token remained absent;
- final publication was compatible and readable;
- all six bounded required Python relationships remained available.

The independent diagnostic on root A added a fresh runtime source text file and
tried four searches: exact token, path-scoped exact token, plain token, and
path-scoped plain token. All returned zero results. The probe was then deleted
and explicitly synced. This rules out only the tested `must:` parsing and path
scope explanations; it does not identify the underlying product owner.

Both `repair` calls returned `requires_reindex` with operation phase `blocked`.
Collection, snapshot, marker, and runtime fingerprint matched. Payload and stale
remote chunk proofs were `not_checked`; navigation proof failed with basis
`v4_repair_authority_missing`. Root A operation:
`9e349eef-cf0b-49ce-92c0-fd271319acec`; root B:
`e0b44446-bdbd-48c7-a61d-21d5a3420fef`.

### Relationship witness

Direct authoritative readback retained:

- `SignalGenerator.check_entry`: 34 direct inbound records, including the three
  frozen production callers in `opportunity_ranker.py`, `pair_evaluator.py`, and
  `trading_core.py`;
- `_evaluate_residual_type_invariant`: two direct callers in `phases.py` and
  `gate_coordinator.py`;
- `SignalLedger.record`: 17 direct inbound records, including the required
  `signal_recording.py` caller and the previously qualified additional callers.

The larger direct counts are not newly classified by this stabilization batch;
the witness checks the frozen required relationships and preservation of the
already-qualified relationship generation.

### Excluded harness pilots

Two root-A pilots were excluded before the harness was frozen:

1. `c4-a-pilot-invalid-search-limit.json` used search limit `20`, while the
   public schema maximum is `15`.
2. `c4-a-pilot-runtime-scope.json` placed the probe under `docs/`, which the
   default runtime scope excludes.

Neither pilot contributes to the product decision. The final harness used limit
`15`, placed probes under `src/python`, and evaluated exposed result groups.

## Part B — latency

Preregistered operations:

- explicit sync: replace one same-length unique token in one existing
  task-owned text file;
- warm graph: residual target, callers, depth `1`, limit `100`, same process
  after one warmup;
- cold graph: the same graph request as the first MCP tool call after each
  process restart.

Every valid sample was retained.

### Explicit-sync raw milliseconds

```text
1785.263, 1767.574, 1764.915, 1807.032, 1738.313,
1754.554, 1710.999, 1680.825, 1691.937, 1708.833,
1673.942, 1687.482, 1704.566, 1687.066, 1783.932,
1759.105, 1756.461, 1687.130, 1640.422, 1621.694
```

The nearest-rank p95 is `1785.263 ms`; it passes the `7000 ms` limit.

### Warm `call_graph` raw milliseconds

```text
12.646, 11.706, 11.580, 11.515, 12.135,
11.039, 12.954, 11.621, 12.928, 12.291,
11.993, 10.885, 10.985, 12.381, 10.159,
12.161, 10.813, 10.676, 20.294, 10.820
```

The nearest-rank p95 is `12.954 ms`; it passes the `25 ms` limit.

### Cold/restarted `call_graph` raw milliseconds

```text
7393.048, 7182.870, 7524.119, 7106.915, 7081.665,
7499.309, 7319.580, 7270.879, 7230.375, 7250.155
```

The nearest-rank p95 is `7524.119 ms`; it fails the `750 ms` limit by roughly
10×. No status or warmup call was inserted after restart because that would
change the preregistered operation.

## Part C — memory

Clean restart, two-second wait, and no MCP tool call:

```text
RSS=152.523 MiB
V8 heap used=43.689 MiB
V8 heap committed=110.344 MiB
external/native=20.736 MiB
```

The six controlled incremental publication cycles produced:

| Cycle | Sync ms | During-sync peak MiB | Immediate MiB | 5 s MiB | 30 s MiB | 60 s MiB | 120 s MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 4850.112 | 914.34 | 856.81 | 1090.67 | 1090.79 | 1090.80 | 514.52 |
| 2 | 1962.646 | 606.64 | 607.98 | 1122.32 | 1122.25 | 1123.01 | 535.38 |
| 3 | 1903.455 | 635.17 | 635.55 | 950.23 | 950.22 | 950.22 | 563.04 |
| 4 | 1830.107 | 643.63 | 644.42 | 1096.32 | 1096.27 | 1096.27 | 577.20 |
| 5 | 1808.706 | 661.96 | 661.97 | 1189.13 | 1189.08 | 1189.83 | 591.73 |
| 6 | 1823.257 | 681.80 | 682.94 | 1207.38 | 1207.30 | 1207.30 | 608.40 |

At 120 seconds, V8 heap used stabilized near `257 MiB`, committed heap near
`277–290 MiB`, and external memory near `20.75 MiB`. Each cycle still exposed
three retained navigation generations, 27,732 relationship records, and 79,173
claims. Nevertheless, process RSS at 120 seconds increased monotonically by
about `93.9 MiB` from cycle 1 to cycle 6, including about `45.4 MiB` over cycles
3–6, without a corresponding exposed owner.

This is classified `cannot_be_distinguished`, not a leak finding. Repeated full
status/authority reads used to observe counts triggered delayed V8 expansions,
and allocator/native retention is not broken down sufficiently to attribute the
remaining RSS. Both approved numeric limits passed.

## Commands and exit status

The batch used task-local harnesses against the candidate-built MCP stdio
entrypoint. Material commands and outcomes:

```text
git rev-parse HEAD                                      exit 0
git status --short --branch                             exit 0
pnpm install --offline                                  exit 0
pnpm --filter @satori/core build                        exit 0
pnpm --filter @satori/mcp build                         exit 0
node /tmp/satori-post-merge-c4.mjs A                    exit 0
node /tmp/satori-post-merge-c4.mjs B                    exit 0
node /tmp/satori-post-merge-search-diagnostic.mjs       exit 0
node /tmp/satori-post-merge-latency.mjs                 exit 0
node --require /tmp/satori-post-merge-memory-probe.cjs \
  /tmp/satori-post-merge-memory.mjs                     exit 0
node --require /tmp/satori-post-merge-memory-probe.cjs \
  /tmp/satori-post-merge-idle.mjs                       exit 0
```

An exit code of zero means the evidence harness completed and serialized its
observations; it does not override failed acceptance fields.

## Artifact integrity

Raw task artifacts remain under
`/tmp/satori-post-merge-qualification-ywy40t/evidence`. Important SHA-256
digests:

```text
c4-a.json                 a1fe58e5cdf3723b58ff8c63ca770c6d0510af5c6f2baba795a216f3aa9a1132
c4-b.json                 5fb27853064c90ed6de713634a6307d1b1fb906043a3c8b8974eecbcc7950c05
search-diagnostic-a.json  c27d641a767df6916c310e683fa7bf28c9972bc9c382dabcd876457a78fc454d
latency.json              639b29d8581693a557e693fccc74a8b4eb98e329667ad1524d1c4df719b8d897
memory.json               589d4e0143d7f95c76b90704258cf821c4b84ce4e84a5a88a205af089131fe2c
idle.json                 4edc9c331c789ced463c64377d9188baefb21ae950227158dd183ec90f25b0c3
```

## Repository safety proof

Initial and final original Satori status:

```text
## master...origin/master
 M docs/plans/report.md
```

After sealing, this evidence directory is additionally untracked. The existing
`docs/plans/report.md` modification was neither edited nor staged.

Initial and final original target status:

```text
## main...origin/main [ahead 1]
 M opencode.jsonc
?? cc.json
```

All task-owned runtime and target worktrees ended clean and detached at their
frozen revisions. Every probe mutation was restored. No task-owned MCP process
remained. No files were staged or committed.

## Required action

Investigate the explicit-sync-to-search-publication boundary using the retained
two-root artifacts. Separately, decide whether first-tool-after-restart
`call_graph` is intended to meet the `750 ms` cold contract or whether startup
publication loading is outside that contract. Do not label memory as leaking
without an owner-level allocation or generation-retention trace.
