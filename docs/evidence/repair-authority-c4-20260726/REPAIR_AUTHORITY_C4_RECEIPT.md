# V4 Repair Authority and Corrected C4 Receipt

## Terminal decision

```text
REPAIR_AUTHORITY_OUTCOME=product_defect_fixed
REPAIR_AUTHORITY_COMMIT=5ebe57f099db4b355cf7c67464e8f13db491b672
CORRECTED_C4_OUTCOME=pass
RELEASE_BLOCKER=none
```

The owner-level implementation is commit
`96332975a5f06722ccf5089d486c92c318f375b5`. The qualified product fix commit
`5ebe57f099db4b355cf7c67464e8f13db491b672` adds the directly invalidated
public-lifecycle regression expectation and is the final code-and-test revision.
Neither commit was merged into `master`.

## Frozen identities

| Identity | Value |
| --- | --- |
| Base product revision | `7f82daae184105993708654bc24d104c6184db0e` |
| Qualified product fix commit | `5ebe57f099db4b355cf7c67464e8f13db491b672` |
| Candidate branch | `candidate/v4-repair-authority-20260726` |
| Final candidate revision | `5ebe57f099db4b355cf7c67464e8f13db491b672` |
| Candidate worktree | `/tmp/satori-current-freshness-20260726-ZBBYAC/satori-runtime` |
| Satori MCP package | `@zokizuan/satori-mcp@6.3.0` |
| Satori Core package | `@zokizuan/satori-core@3.2.0` |
| Target revision | `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` |
| Python target materialization | `/tmp/satori-current-freshness-20260726-ZBBYAC/target-py` |
| Text target materialization | `/tmp/satori-current-freshness-20260726-ZBBYAC/target-txt` |

All source, state, LanceDB, and MCP process paths were task-owned. The user's
`tradingview_ratio` worktree and existing Satori state were not used or mutated.

## First wrong boundary

The first wrong boundary was the full-reindex owner:
`ManageIndexingHandlers.startBackgroundIndexing`.

The failed fresh publication had already produced:

```text
completed candidate collection
-> candidate-scoped full source checkpoint
-> completion marker
-> relationship manifest
-> sealed navigation generation
-> mutation lease receipt
```

It then called `publishResolvedIndexPolicy` without the existing
`CanonicalPublicationBinding`. The durable policy was therefore
`satori_index_policy_v3` with a sealed navigation tuple but no `publication`.
Repair correctly rejected that state as `v4_repair_authority_missing`.

Observed pre-correction policy:

```json
{
  "schemaVersion": "satori_index_policy_v3",
  "collectionName": "hybrid_code_chunks_8759fdf2__gen_run_aff5eb24_a199_44b3_a46e_de447b0303ee",
  "navigation": {
    "status": "sealed",
    "generationId": "symmanifest_715e-03a9f7414a53b60a",
    "sealHash": "f7002a173ce413afabfc1b8d1d3778b9ad4aff1997129fe3e8ae9ca9243ab739"
  },
  "publication": null
}
```

Classification: fresh-reindex product defect. This was not a repair-discovery
defect, qualification configuration mismatch, or missing invariant. Repair's
fail-closed behavior was correct.

## Smallest owner-level correction

The full-reindex path now reads back its committed source checkpoint and passes
the existing canonical V4 publication binding when it publishes the resolved
policy. The binding uses only already-existing identities:

```text
source checkpoint:
  collection + marker run + policy hash + merkle root + document digest
graph:
  relationship_manifest_v2 + candidate relationship manifest hash
receipt:
  mutation owner + generation + operation
```

No manifest, pointer, lock, schema, or identity was added. Repair logic,
navigation publication, Python relationship semantics, relationship versions,
and search response behavior were not changed.

Changed files:

- `packages/mcp/src/core/manage-indexing-handlers.ts`
- `packages/mcp/src/core/manage-indexing-handlers.test.ts`
- `packages/mcp/src/tools/lifecycle.public-tools.test.ts`

## Intervention proof

The focused test failed before the correction because the publication binding
was absent. It passed after the correction and asserts exact source-checkpoint,
relationship-manifest, and mutation-lease receipt fields.

A real candidate-built fresh reindex then published this V4 authority:

```json
{
  "schemaVersion": "satori_index_policy_v4",
  "publication": {
    "activationId": "b9d3670f-1dfa-4a5e-bb6f-dc59891db814",
    "sourceCheckpoint": {
      "collectionName": "hybrid_code_chunks_8759fdf2__gen_run_768fe8fd_97d1_43fd_93e7_6bd0bbfad56a",
      "markerRunId": "cacb28f1-d0b6-4703-b06a-85e054e91646",
      "indexPolicyHash": "0e19e8c19c7dbc7c7625e297278984859ddffd9276e7ed498d64c391176a4092",
      "merkleRoot": "f7d028fe4e08a7a714250d3c2b97146257422e7db9e96084dfa10117532ed7be",
      "documentDigest": "c5847e554207ad01a58a23cbccfbafff907ca642b629301ebe3142a33eb3e694"
    },
    "graph": {
      "kind": "relationship_manifest_v2",
      "manifestHash": "baff14e5a7cfe487cab577f5bcdbff780e8b993b7e0ce1224a4fa2c285e264d7"
    },
    "receipt": {
      "ownerId": "c269e6b1-89f1-474c-9cd3-726cd7be078a",
      "generation": 1,
      "operationId": "1c097895-b865-4226-969a-a99eed05a873"
    }
  }
}
```

Repair returned:

```text
status=ok
message=The existing v4 publication and navigation are already exactly proven; repair made no changes.
```

Structured proof:

| Proof | Status | Basis | Expected | Observed |
| --- | --- | --- | ---: | ---: |
| Collection | matched | `selected_snapshot_collection` | — | 1 |
| Source snapshot | matched | `v4_checkpoint_full_hash_zero_change` | 1,519 | 1,519 |
| Marker | matched | `completion_marker_fingerprint` | — | — |
| Fingerprint | matched | `completion_marker_fingerprint` | — | — |
| Payload | matched | `same_state_membership_and_exact_count` | 19,741 | 19,741 |
| Stale payload | matched | `same_state_exact_count_no_extras` | 0 extra | 0 extra |
| Navigation | matched | `activated_generation_proven` | — | — |

## Corrected C4

Two independent state and LanceDB roots were used:

| Probe | Scope | State root | LanceDB root |
| --- | --- | --- | --- |
| Python | `runtime` | `/tmp/satori-current-freshness-20260726-ZBBYAC/state-c4-py-final` | `/tmp/satori-current-freshness-20260726-ZBBYAC/lance-c4-py-final` |
| Text | `mixed` | `/tmp/satori-current-freshness-20260726-ZBBYAC/state-c4-txt-fixed` | `/tmp/satori-current-freshness-20260726-ZBBYAC/lance-c4-txt-fixed` |

Both lifecycles proved:

```text
fresh reindex
-> healthy V4 repair no-op
-> restart
-> zero-change sync
-> add and exact hit
-> modify and old miss/new hit
-> delete and exact miss
-> final restart
-> compatible publication readback
```

### Python runtime probe

File:
`src/python/core/satori_c4_probe_20260726-PY-FINAL_6b22dcdae7a94d96b80f3c6f893e0eb0.py`

| Transition | Source proof | Sync proof | Public search proof |
| --- | --- | --- | --- |
| Add | SHA-256 `5d73bb6e5a9ce98993c5b2e463e691a58a745c33480adf61ddba2c5b2af1d700` | generation 5, operation `83d0c8a8-941a-4d0c-a290-d4a007e34fca`, +1 | token A returned exactly the probe at lines 1–2 |
| Modify | SHA-256 `4ee6d8b3e746ab79d10cb8be3bd413457fc3fe99db60ac6f9c01d74d0a157f7d` | generation 6, operation `86df1bf2-5eb1-4d3e-a83c-06570d7acc33`, ~1 | token A returned 0; token B returned exactly the probe at lines 1–2 |
| Delete | exact relative path removed | generation 7, operation `3e36aa6a-81b3-44f3-a6ec-6f343b4a02ed`, -1 | token B returned 0 |

### Text mixed-scope probe

File:
`docs/satori-c4-probe-20260726-TXT-35529130-8ca2-4346-8527-4330cc260b21.txt`

| Transition | Source proof | Sync proof | Public search proof |
| --- | --- | --- | --- |
| Add | SHA-256 `93f093c62bf868faf45f88bcd7589fbd42ad06774b99acb3dc25a84e702e1e22` | generation 5, operation `251e2fe4-8703-4857-94f4-08b3bd2d87b2`, +1 | token A returned exactly the probe at line 1 |
| Modify | SHA-256 `56954da57378cadb367c689b7b78fed95df4a3d7102da4829abec6ab309cb732` | generation 6, operation `6e284fd6-df25-40fa-a6ff-258f1e0d382e`, ~1 | token A returned 0; token B returned exactly the probe at line 1 |
| Delete | exact relative path removed | generation 7, operation `12ce30aa-5783-4a64-a44e-aadf5cbdf9b2`, -1 | token B returned 0 |

The public searches emitted `SOURCE_FRESHNESS_UNVERIFIED` because the isolated
runtime had no watcher continuity. This did not block use, and every query
followed an explicit successful sync with exact source, delta, and row proof.
Zero-result old/deleted-token searches additionally emitted the expected
`FILTER_MUST_UNSATISFIED` action.

### Relationship preservation

At fresh publication, post-repair, post-repair restart, zero-change sync, add,
modify, delete, and final readback, all six qualified Python production
relationship witnesses remained present:

- `SignalGenerator.check_entry`: the three qualified production sites remained
  in the authoritative inbound result.
- `_evaluate_residual_type_invariant`: `phases.py:129` and
  `gate_coordinator.py:475`.
- `SignalLedger.record`: `signal_recording.py:435-462`; the previously validated
  additional production caller remained present.

Every one of the eight lifecycle relationship witnesses passed in both final
raw runs. The relationship sidecars remained:

```text
relationshipVersion=relationship-v9+python-constructor-receivers+python-native-resolution-v1
fileContributionSchemaVersion=relationship_file_contribution_v4
manifestSchemaVersion=relationship_v2
```

An initial Python evidence run used an obsolete expectation of exactly seven
relationship checkpoints and therefore reported a bookkeeping false despite
8/8 successful witnesses. That raw artifact was retained unchanged. The
corrected harness was then rerun from a new clean Python state/vector root at
the final candidate revision. `c4-py-final.json` and `c4-txt.json` both report
top-level `passed=true`, with every acceptance field true.

## Verification

| Command/check | Result |
| --- | --- |
| Focused red regression before correction | failed on absent `publication`, as expected |
| Focused full-reindex V4 regression after correction | 1/1 passed |
| `manage-indexing-handlers.test.ts` | 52/52 passed |
| Public lifecycle V4 focused regression | 1/1 passed |
| Complete Core package tests | 595 passed, 1 skipped, 0 failed; 596 total |
| Complete MCP package tests | 1,047 passed, 0 failed |
| MCP typecheck | exit 0 |
| Core build | exit 0 |
| MCP runtime build | exit 0 |
| ESLint on the three owned files | exit 0 |
| `git diff --check 7f82daa..HEAD` | exit 0 |

The first complete MCP run exposed one directly invalidated stale test
expectation (`v3` after full reindex). The production result was V4. Updating
that nearest lifecycle assertion produced the clean 1,047/1,047 run.

## Repository and process safety

- Both target materializations started and ended detached at
  `8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7` with no staged, unstaged, or
  untracked files.
- The exact two probe files were deleted.
- The candidate branch is clean at
  `5ebe57f099db4b355cf7c67464e8f13db491b672`.
- No shared staged report or receipt was edited.
- Task-owned MCP processes were stopped.

## Raw evidence

| Artifact | SHA-256 |
| --- | --- |
| `fresh-repair-preflight.json` | `04bc21dce022c90f1dbb11fb2815199e84bbf2d3361a5b2f6f37eef953dda58e` |
| `c4-py-final.json` | `227255f7702f1dfa6a8a246b672e73c0802f3d93e8dadedfec53432ccbfe278d` |
| `c4-py.json` (superseded bookkeeping run) | `4a4f08abbf704d037e4af4df84916999a0c6581b8696b90c2945bb0c51a4f91b` |
| `c4-txt.json` | `e635bf434f79ead38d0db381984068aa62252ad838d665d489eba4cfec307bef` |
| `/tmp/satori-repair-authority-c4.mjs` | `df761e891a45871b46f16f653def10281152b372bd161ca1864080a060ea697d` |
