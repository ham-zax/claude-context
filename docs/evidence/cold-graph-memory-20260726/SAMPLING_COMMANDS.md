# Cold Graph and Incremental-Publication Sampling Commands

## Fixed identities

```text
Satori revision:
4138b1eba5606a8291b45395f767a46b946070fb

Satori tree:
7df3676ef379e047a8019eda6a98ca943c8c838e

Target revision:
8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7

Target tree:
2969002a2aa46948d6557ac5f5c70e19355c80a7
```

The task-owned worktree was created from the fixed Satori revision:

```bash
git worktree add \
  -b experiment/cold-graph-memory-20260726 \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726 \
  4138b1eba5606a8291b45395f767a46b946070fb
```

The target was materialized without reading mutable worktree content:

```bash
git -C /home/hamza/repo/tradingview_ratio \
  archive 8d65bf288a4c8b297ce53d0563e3ff4d9d5ba3c7 |
tar -x -C /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/source
```

Runtime build:

```bash
pnpm install --frozen-lockfile
pnpm --filter @zokizuan/satori-core build
pnpm --filter @zokizuan/satori-mcp build:runtime
```

## Common runtime environment

Every MCP measurement process used:

```bash
env \
  SATORI_STATE_ROOT=/home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/state \
  VECTOR_STORE_PROVIDER=LanceDB \
  LANCEDB_PATH=/home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/state/lancedb \
  SATORI_RUNTIME_PROFILE=offline \
  EMBEDDING_PROVIDER=Potion \
  POTION_HELPER_PATH=/home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/packages/mcp/assets/potion/linux-x64/satori-potion \
  POTION_MODEL_PATH=/home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/packages/mcp/assets/potion/linux-x64/model \
  MCP_ENABLE_WATCHER=false \
  SATORI_SHARED_RUNTIME_DISABLE=1 \
  SATORI_NAVIGATION_BACKEND=json \
  SATORI_TASK_RUNTIME_OWNER_DIR=/home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/state/runtime-owner
```

`runtime-owner-isolation.mjs` changes only the owner-registry directory used by
the experiment process. This preserved the mutation gate while preventing a
different live Satori process from making the task-owned state root unusable.

## Ready publication

The ready publication was created with:

```bash
node docs/evidence/cold-graph-memory-20260726/setup-publication.mjs \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/packages/mcp/dist/index.js \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/source \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/raw/setup-publication.json \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/docs/evidence/cold-graph-memory-20260726/runtime-owner-isolation.mjs
```

The final ready state and frozen symbol reference were inspected with:

```bash
node docs/evidence/cold-graph-memory-20260726/inspect-publication.mjs \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/packages/mcp/dist/index.js \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/source \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/raw/publication-inspection.json \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/docs/evidence/cold-graph-memory-20260726/runtime-owner-isolation.mjs
```

## Cold and warm graph measurements

Instrumented boundary samples:

```bash
node docs/evidence/cold-graph-memory-20260726/run-cold-graph.mjs \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/packages/mcp/dist/index.js \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/source \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/raw/symbol-ref.json \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/docs/evidence/cold-graph-memory-20260726/runtime-probe.mjs \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/raw \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/raw/cold-graph-samples.json
```

Uninstrumented latency samples used the same command with `none` in place of
the probe-module argument and wrote
`cold-graph-uninstrumented-samples.json`.

The final warm-only run used:

```bash
env COLD_SAMPLE_COUNT=0 WARM_PRIMER_COUNT=2 WARM_SAMPLE_COUNT=20 \
  node docs/evidence/cold-graph-memory-20260726/run-cold-graph.mjs \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/packages/mcp/dist/index.js \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/source \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/raw/symbol-ref.json \
  none \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/raw/uninstrumented \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/raw/warm-graph-uninstrumented-final.json
```

## Memory measurements

```bash
node docs/evidence/cold-graph-memory-20260726/run-memory-plateau.mjs \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/packages/mcp/dist/index.js \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/source \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/source/src/python/__init__.py \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/docs/evidence/cold-graph-memory-20260726/runtime-probe.mjs \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/raw/memory-probe.jsonl \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/raw/memory-label.json \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/raw/memory-samples.json
```

`run-memory-plateau.mjs` sampled the MCP PID and its process tree every 100 ms
during each sync. It read:

```text
/proc/<pid>/smaps_rollup
/proc/<pid>/status
/proc/<pid>/task/<pid>/children
```

Fixed-time V8 samples were emitted by `runtime-probe.mjs` on `SIGUSR2`.

## Analysis

```bash
node docs/evidence/cold-graph-memory-20260726/analyze-characterization.mjs \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/state \
  /home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/docs/evidence/cold-graph-memory-20260726/characterization-summary.json
```
