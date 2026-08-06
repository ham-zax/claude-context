# Ranking V3 Phase-0 Byte-Identity Proof

Status: **SEALED — empirical byte identity against the real R0.2 baseline capture**

## 1. Executable regression (unit level)

`packages/mcp/src/core/search-execution.ranking-v3-byte-identity.test.ts`
(`phase0_envelopes_are_byte_identical`) proves that enabling or disabling the
advisory Ranking V3 evidence consumer returns the exact same outcome object and
serialized bytes as the baseline path. The evidence hook is side-channel only
and is not included in model-visible results, warnings, ordering, grouping,
removals, or disclosure fields.

```
node --import tsx --test packages/mcp/src/core/search-execution.ranking-v3-byte-identity.test.ts
# exit 0; tests 1; pass 1
```

## 2. Empirical corpus-level comparison (R0.2 baseline vs instrumented runtime)

The R0.2 baseline capture (`/tmp/r0-2-run/out/evidence/capture.json`, digest
`2e9c904191e4d51757cacc2a9307ab54f53be66a1153089bdccb49a54329de28`) is the
tuning-only Phase-0 capture of the 50-task sealed suite
(`TASK_SUITE.json`, canonical digest `3ccce7672a7df2b90084c25a8d82edf65ec1e7f9e8cbb21d553100b98b9cea78`)
at frozen baseline `966456c9` (tree `3a1740e4`), produced by the
pre-instrumentation runtime (qualificationRuntime sha256 `012cdfa9`).

The same 50-task suite was re-executed through the **instrumented runtime**
(branch HEAD `26a62ed` dist; qualificationRuntime sha256
`87c40cd5eb6d42e9204e5c141050fc3d18da2fff909f295b7063276ca57c9e39`; core dist
497 files, mcp dist 960 files) against the **same corpus**
(`/tmp/r0-2-run/out/worktree` at `966456c9`, tree `3a1740e4`), using the same
offline environment (`SATORI_RUNTIME_PROFILE=offline`, Potion
`minishlab/potion-code-16M-v2@e9d2a44c…`, LanceDB, `POTION_HELPER_PATH`/
`POTION_MODEL_PATH` from the installed 6.8.1 assets, `SATORI_CLI_STDOUT_GUARD=off`)
plus `SATORI_RUN_MODE=cli` (the disclosed Phase-2 recorder convention that
disables only the background sync/watcher lifecycle).

Recorder command (exit 0, 50/50 tasks, cold+warm samples byte-stable):

```
node scripts/satori-useful-context-record.mjs \
  --tasks /tmp/r0-2-run/out/evidence/TASK_SUITE.json \
  --repo /tmp/r0-2-run/out/worktree \
  --command /tmp/b8-run/out/worktree/packages/mcp/dist/index.js \
  --authority-file /tmp/r0-2-run/out/evidence/TASK_SUITE.json \
  --out /tmp/b8-run/out/evidence/OBSERVATION_SET.head-corpus.json \
  --warm-samples 1
```

Capture build command (exit 0):

```
node scripts/satori-search-candidate-capture.mjs \
  --tasks /tmp/r0-2-run/out/evidence/TASK_SUITE.json \
  --observations /tmp/b8-run/out/evidence/OBSERVATION_SET.head-corpus.json \
  --out /tmp/b8-run/out/evidence/capture.head-corpus.json \
  --policy baseline
```

Comparison assertion (exit 0, diff empty):

```
node /tmp/b8-run/compare-product.mjs \
  /tmp/r0-2-run/out/evidence/capture.json \
  /tmp/b8-run/out/evidence/capture.head-corpus.json \
  /tmp/r0-2-run/out/evidence/OBSERVATION_SET.json \
  /tmp/b8-run/out/evidence/OBSERVATION_SET.head-corpus.json
```

## 3. Digests

| artifact | sha256 |
| --- | --- |
| R0.2 baseline capture (`capture.json`, 82 546 317 bytes) | `2e9c904191e4d51757cacc2a9307ab54f53be66a1153089bdccb49a54329de28` |
| instrumented capture (`capture.head-corpus.json`) | `896305a381dd3894f29cac85d699ba8cd4c2639336f2d0423d495489e6ead83d` |
| baseline task suite (canonical) | `3ccce7672a7df2b90084c25a8d82edf65ec1e7f9e8cbb21d553100b98b9cea78` |

## 4. Verdict

**BYTE-IDENTICAL PRODUCT OUTPUT: PASS.** For all 50 tuning tasks, the
instrumented runtime returns byte-identical product output vs the R0.2
pre-instrumentation baseline capture:

- `rankedResults` bytes identical (50/50) and per-task
  `rankedResultIdentityDigest` identical (50/50) — order, removals, grouping
  identity;
- response `status`, `resultCounts`, `disclosure`, `recommendedNextAction`,
  `pagination`, and every result entry minus its `debug` block (scores,
  targets, display labels, language, symbol kind, quality, preview,
  navigation) identical (50/50);
- freshness modes identical (50/50).

Whole-file capture digests differ only in evidence side-channel and identity
bytes, which differ by design: `debug` timestamps, `hints` (debugSearch),
`candidateTrace` (21/50 tasks), `rankedSetDigest`/`continuation.handle`
(48/50 tasks; bound to the per-build index publication markerRunId
`4e5b9d33…` baseline vs `dc0274ed…` instrumented, `indexPolicyHash` identical
`33910ef1…`), and the runtime authority identity (`gitRevision`/dist roots).

## 5. Evidence paths

- Baseline (Phase-2 R0.2, outside repo): `/tmp/r0-2-run/out/evidence/`
  (`TASK_SUITE.json`, `OBSERVATION_SET.json`, `capture.json`,
  `BASELINE_CAPTURE_RECEIPT.json`); committed receipt:
  `evals/search-ranking/ranking-v3-authorities/R0.2/BASELINE_CAPTURE_RECEIPT.json`.
- Instrumented run (outside repo): `/tmp/b8-run/out/evidence/`
  (`OBSERVATION_SET.head-corpus.json`, `capture.head-corpus.json`),
  comparison script `/tmp/b8-run/compare-product.mjs`.
- Runtime: instrumented worktree `/tmp/b8-run/out/worktree` (HEAD `26a62ed`).

This document is the sealed B8 output artifact (approved file per the B8 card:
`BYTE_IDENTICAL_PROOF.md`).
