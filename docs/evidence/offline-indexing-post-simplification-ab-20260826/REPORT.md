# Offline indexing post-simplification controlled A/B

**Date:** 2026-08-26  
**Decision:** `post_simplification_indexing_performance_improved`  
**Scope:** offline Satori indexing only; search/reranker latency and memory are not qualified by this receipt.

## Comparison boundary

This benchmark compares the runtime immediately before the architecture simplification with the current simplified runtime on the same frozen repository bytes.

| Role | Revision | Runtime packages |
| --- | --- | --- |
| Pre-simplification baseline | `203cd09dc94119d19287884e9c1fd2d0d1d76847` | MCP `6.9.1`, Core `3.8.0` |
| Simplified candidate | `4b14385ef72a98399e6e3a7c20e34d1db799f2fd` | MCP `6.9.2`, Core `3.8.1` |
| Frozen workload | `203cd09dc94119d19287884e9c1fd2d0d1d76847` | Satori source tree |

The frozen workload is a separate clean worktree. Both runtimes indexed that same worktree, so repository growth between August 20 and August 26 does not affect the A/B.

Environment:

- WSL2 Linux `6.18.40.1-microsoft-standard-WSL2`, `x86_64`.
- Node `v24.19.0`.
- pnpm `10.28.2` for build/install preparation.
- Runtime profile: `offline`.
- Embeddings: Potion `minishlab/potion-code-16M-v2@e9d2a44ca6a05ac6685f3b23709ea57eb7352d5b+potion_semantics_v1`, 256 dimensions.
- Vector store: LanceDB.
- Reranker: `none`. Reranking is outside the indexing mutation path and was disabled to match the indexing-performance scope.

Both revisions were built from their exact Git revisions before measurement. Each run used a fresh isolated Satori home and managed launcher. Installer/preflight work was completed before the timer started.

## Method

The August 14 Phase 3 receipt specifies three complete clean runs but does not preserve the original command line. This A/B therefore preserves its three-run structure while tightening the workload boundary:

1. Build both runtime revisions.
2. Freeze the target repository at the pre-simplification revision.
3. Run one discarded warm-up for each runtime to reduce model/runtime page-cache asymmetry.
4. Run three fresh-state `manage_index create` operations per runtime, interleaved to reduce time/order drift.
5. Measure mutation time from the runtime's accepted timestamp to its completed durable timestamp. The pre-simplification response names the latter `lastDurableTransitionAt`; the simplified response names it `updatedAt`.
6. Also record end-to-end CLI wall time from MCP client invocation through the final ready status.
7. Require every run to finish `status=ok` with the same indexed workload size.

Measured order: old 1, current 1, current 2, old 2, old 3, current 3.

The benchmark worktrees were prepared as:

```bash
git worktree add --detach /home/hamza/repo/satori-bench-presimpl-runtime \
  203cd09dc94119d19287884e9c1fd2d0d1d76847
git worktree add --detach /home/hamza/repo/satori-bench-frozen-target \
  203cd09dc94119d19287884e9c1fd2d0d1d76847

pnpm -C /home/hamza/repo/satori-bench-presimpl-runtime install --frozen-lockfile
pnpm -C /home/hamza/repo/satori-bench-presimpl-runtime run build
pnpm -C /home/hamza/repo/satori run build
```

The exact per-run command shape was:

```bash
pnpm -C <runtime-worktree> run dev:install-local-mcp -- \
  --client opencode \
  --runtime offline \
  --reranker none \
  --vector-store lancedb \
  --home <fresh-run-home> \
  --node /home/hamza/.nvm/versions/node/v24.19.0/bin/node \
  --no-build

(
  cd /home/hamza/repo/satori-bench-frozen-target
  HOME=<fresh-run-home> \
    /home/hamza/.nvm/versions/node/v24.19.0/bin/node \
    <runtime-worktree>/packages/cli/dist/index.js \
    --format json \
    --startup-timeout-ms 30000 \
    --call-timeout-ms 300000 \
    tool call manage_index \
    --args-json '{"action":"create","path":"/home/hamza/repo/satori-bench-frozen-target"}'
)
```

The local-runtime install/preflight command ran before the measured create. A new `<fresh-run-home>` was used for every warm-up and measured row.

All eight successful runs (two discarded warm-ups plus six measured runs) produced **1,019 files / 22,397 chunks**.

## Results

### Mutation duration

| Runtime | Run 1 | Run 2 | Run 3 | Mean | Median | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Pre-simplification | 49.093 s | 48.901 s | 48.868 s | **48.954 s** | 48.901 s | 48.868–49.093 s |
| Simplified | 41.226 s | 40.914 s | 39.416 s | **40.519 s** | 40.914 s | 39.416–41.226 s |

Mean delta: **-8.435 s**.  
Mean reduction: **17.23%**.  
Speedup: **1.208x**.

### End-to-end CLI wall time

| Runtime | Run 1 | Run 2 | Run 3 | Mean |
| --- | ---: | ---: | ---: | ---: |
| Pre-simplification | 51.216 s | 51.020 s | 51.226 s | **51.154 s** |
| Simplified | 44.940 s | 44.730 s | 42.986 s | **44.219 s** |

Mean wall-time delta: **-6.935 s**, or **13.56%**.

Discarded warm-ups were 49.035 s for the pre-simplification runtime and 39.583 s for the simplified runtime. They are not included in the means above.

## Relationship to the August 14 baseline

`docs/evidence/offline-indexing-perf-phase3-20260814/REPORT.md` remains the historical Phase 3 authority. It reported a **46.79 s** three-run mean for the then-current Satori workload (890 files / 19,509 chunks). That number should not be used as the direct simplification A/B because the workload changed before the simplification began.

This receipt is the stronger simplification comparison because it holds the source tree constant at the exact pre-simplification baseline revision. On that fixed workload, the simplified runtime reduces mean indexing mutation time from **48.954 s to 40.519 s**.

## Limits

- This benchmark measures indexing throughput, not search quality, LateOn latency, RSS, startup memory, or call-graph query latency.
- Runtime semantics are intentionally not byte-identical: the simplified candidate contains the new Publication architecture and later language/navigation capabilities. Source bytes are fixed, but the candidate may perform different semantic work.
- The final `manage_index status` contract exposes file/chunk counts consistently across both revisions; this receipt does not claim equal symbol or relationship counts.
- Three measured runs establish a controlled local comparison, not a cross-machine performance guarantee.

Machine-readable rows and summary are in `benchmark.json` in this directory.
