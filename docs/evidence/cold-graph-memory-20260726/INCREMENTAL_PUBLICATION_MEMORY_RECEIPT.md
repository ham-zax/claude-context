# Repeated Incremental-Publication Memory Characterization Receipt

## Terminal outcome

```text
memory_retained_capacity_bounded
```

Across six controlled incremental publications, V8 heap and process RSS did not
grow monotonically. Retained navigation generations reached three and remained
capped at three. The process retained a variable capacity band, so the stronger
`memory_plateau_pass` label is not used.

## Experiment contract

The runtime and publication identities match
`COLD_CALL_GRAPH_RECEIPT.md`. One fresh MCP process performed all six explicit
syncs.

The controlled file was:

```text
/home/hamza/repo/satori-worktrees/cold-graph-memory-20260726/.experiment/source/src/python/__init__.py
```

Its content alternated between:

```text
empty
```

and:

```python
# satori controlled incremental publication memory probe
```

This produced three modify/restore pairs and six actual content changes. Every
sync returned `status=ok` with terminal operation phase `completed`.

Source restoration proof:

```text
original SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
final SHA-256:    e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Sampling method

The MCP PID and its process tree were sampled externally every 100 ms during
each sync using Linux `/proc`:

```text
smaps_rollup -> RSS and PSS
status       -> current and peak RSS
children     -> process-tree membership
```

Fixed samples were recorded before each publication, at the observed sync peak,
immediately after return, and at 5, 30, 60, and 120 seconds. `SIGUSR2` caused
the task preload to record V8 `process.memoryUsage()` and observable cache and
generation counts only at fixed points.

## Fresh-restart baseline

After startup lifecycle completion and a five-second quiet period:

```text
external RSS:       766.51 MiB
external PSS:       718.11 MiB
V8 heap used:       513.91 MiB
V8 heap committed:  616.48 MiB
external memory:     26.67 MiB
array buffers:       23.03 MiB
retained generations: 1
active records:      27,732
active claims:       79,173
```

## Publication peaks and 120-second state

| Publication | Source state | Sync peak RSS | Sync peak PSS | RSS at 120s | PSS at 120s | Heap used at 120s | Heap committed at 120s | Retained generations |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | probe present | 881.82 MiB | 833.25 MiB | 485.69 MiB | 436.93 MiB | 258.45 MiB | 274.32 MiB | 2 |
| 2 | restored | 577.86 MiB | 529.10 MiB | 503.55 MiB | 454.79 MiB | 256.78 MiB | 262.29 MiB | 3 |
| 3 | probe present | 601.03 MiB | 552.27 MiB | 610.63 MiB | 561.87 MiB | 298.73 MiB | 349.80 MiB | 3 |
| 4 | restored | 638.65 MiB | 589.89 MiB | 642.55 MiB | 593.80 MiB | 280.14 MiB | 354.78 MiB | 3 |
| 5 | probe present | 669.06 MiB | 620.30 MiB | 577.40 MiB | 528.64 MiB | 257.23 MiB | 265.54 MiB | 3 |
| 6 | restored | 657.63 MiB | 608.87 MiB | 593.30 MiB | 544.54 MiB | 259.53 MiB | 273.77 MiB | 3 |

At 120 seconds, external memory ranged from 52.72–56.28 MiB and array buffers
from 17.09–20.19 MiB. Neither series grew monotonically.

## Generation, relationship, claim, and cache observations

The active publication binding remained:

```text
symmanifest_a317-a02a73788dd4c804
```

It selected 27,732 relationship records and 79,173 persisted
`resolutionClaims`. Incremental navigation deltas affected one relationship
owner and shared 3,036 unchanged symbol/relationship shard files. Final
retention contained the active generation plus one modified and one restored
generation; each contained:

```text
files:                 1,519
relationship records: 27,732
resolution claims:    79,173
```

The fixed probe intentionally read only manifests, not every claim-bearing
shard. Exact claim counts were sealed after the run from the final retained
modified/restored/active generations. Because the changed `__init__.py` owner
contained no claims and every delta changed only that owner, the claim count is
unchanged across all six publications.

Observable Map caches at every 120-second point:

```text
changedFilesCache:                 0
rootGitignoreMatcherCache:         0
preparedNavigationCache:          0
relationshipStateByRoot:          0
runtimeParityValidationByRoot:    0
runtimeFallbackWarningByRoot:     0
runtimeSqliteServingParityCache:   0
statusPreparedReadObservations:    1
```

No observable cache grew across the sequence.

## Classification rationale

Evidence against unbounded growth:

- 120-second heap used values were non-monotonic and ended near 260 MiB;
- 120-second heap committed values were non-monotonic;
- final RSS/PSS remained below the fresh-start baseline;
- retained generation count stabilized at three after publication 2;
- observable cache sizes remained constant;
- external memory and array-buffer values stayed within a narrow band.

Evidence against the stronger plateau label:

- settled RSS varied materially from about 486–643 MiB;
- publications 3 and 4 retained more committed heap than publications 1 and 2;
- six publications establish bounded retained capacity, not a long-duration
  steady-state guarantee.

Therefore:

```text
MEMORY_OUTCOME=memory_retained_capacity_bounded
```

## Limitations

- Exact peak V8 fields are unavailable because the peak was sampled externally
  to avoid perturbing V8; V8 fields exist for every fixed-time sample.
- The experiment covers six publications and 120 seconds of settling per
  publication, not multi-day operation.
- The OS page cache and unrelated host load were not controlled.
- The active graph binding could reuse the unchanged compatible graph while
  source publication state advanced; this receipt characterizes memory and does
  not reinterpret publication correctness.
- No product code, budget, prewarming, or runtime policy was changed.

Portable raw evidence and commands are under `raw/`,
`characterization-summary.json`, and `SAMPLING_COMMANDS.md` beside this receipt.
