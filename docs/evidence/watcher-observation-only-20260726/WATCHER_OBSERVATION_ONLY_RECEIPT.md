# Watcher Observation-Only Qualification Receipt

## Decision

```text
WATCHER_FINAL_OUTCOME=watcher_decoupling_blocked
MASTER_MERGED=no
REMOTE_PUBLISHED=no
```

The observation-only candidate reached its frozen product stopping condition.
After the watcher-owned timer was removed, a delete observed by the watcher was
consumed by `search_codebase` through the existing `ensureFreshness` owner. That
search failed closed with:

```text
Incremental publication for '<task-owned fixture>' is not readable as one
complete generation.
```

This is the same failure class that W0 had observed twice on the former
timer-owned path. The candidate did not suppress or relax the validator. The
failure now occurs through an allowed freshness trigger, so the authorized
stop condition requires a separate publication-owner repair before watcher
decoupling can qualify.

## Identities

| Identity | Value |
| --- | --- |
| Base revision | `ad443b872c467eb7ad6f4305b056c8fdc27dede5` |
| W0 evidence commit | `29c2d7f04f716c9e4e436295d57bfb5cd69db48d` |
| Candidate branch | `feat/watcher-observation-only-20260726` |
| Candidate worktree | `/home/hamza/repo/satori-worktrees/watcher-observation-only-20260726` |
| Uncommitted candidate diff SHA-256 | `d58b436f1bed4ac90dbacd3a5e2c0bf1ac5edfa91241bc921f4269806f9fc5cc` |
| MCP | `6.4.0` |
| Core | `3.3.0` |
| CLI | `1.5.0` |

No product commit was created. The failed candidate remains isolated from
`master` and from the native stabilization release.

## Implemented candidate behavior

The uncommitted candidate:

- records canonical-root-keyed process-local event epochs;
- retains the latest epoch independently for source, ignore-rule, and
  directory events;
- records watcher coverage gaps and watcher errors;
- captures one event epoch per freshness flight;
- prevents joiners from widening that flight;
- covers only successful source publication, exact zero-change comparison, or
  successful ignore reconciliation;
- keeps failed and blocked work pending;
- removes watcher debounce timers and direct watcher calls to
  `ensureFreshness`;
- keeps search, explicit sync, and periodic background synchronization on the
  existing owner;
- invalidates prepared observations and existing continuation authority
  through the existing freshness epoch;
- keeps navigation tools non-mutating while adding pending-source or
  unverified-source guidance;
- continues accepting `MCP_WATCH_DEBOUNCE_MS` as deprecated and ignored; and
- removes the ignored value from shared-runtime attachment identity.

These behaviors passed focused tests, but the product cannot qualify while an
allowed trigger reproduces the complete-generation failure.

## Runtime attempts

The isolated qualification used the candidate-built MCP, Potion, LanceDB, an
ephemeral TypeScript fixture, an isolated state root, and direct stdio. All
fixture, state, and vector data were removed after each attempt.

### Attempt 1: invalid owner isolation

The first attempt compared publication identity across the first five seconds
after process startup. The existing periodic-background owner intentionally
ran its initial pass during that interval and completed a publication:

```text
be4a0055-2fe6-459d-aba5-a1e95e4a3999:2:completed
-> 88c2718d-bb3e-4831-8445-dfbb1eb733c3:3:completed
```

This was a qualification-harness boundary error, not watcher publication. The
second attempt let that distinct startup pass settle before measuring the old
watcher-debounce interval.

### Attempt 2: decisive product failure

The corrected attempt established:

1. no operation identity changed during a 5.3-second post-edit quiet interval;
2. the first search after the ten-write burst published the added symbol;
3. the next search published the modified symbol; and
4. the delete-triggered search failed complete-generation validation.

The exact public failure envelope was:

```json
{
  "formatVersion": 2,
  "status": "not_ready",
  "scope": "runtime",
  "freshnessDecision": null,
  "message": "Unexpected search_codebase failure: Incremental publication for '<task-owned fixture>' is not readable as one complete generation.",
  "results": []
}
```

Restart/readback and final performance sampling were not run after the
stopping condition fired.

## Verification completed before the stop

| Check | Result |
| --- | --- |
| SyncManager focused suite after flight/event changes | 51 passed |
| Real Chokidar event waited 5.1 seconds with no automatic work | 1 passed; 5,127.52 ms witness duration |
| Navigation pending-event focused suite | 6 passed after preserving existing graph warning/hints |
| File-outline/call-graph and shared-identity focused batch | 95 passed |
| Complete MCP package before the final additional no-auto test | 1,050 passed, 0 failed |
| Complete Core package | 595 passed, 1 skipped, 0 failed |
| MCP typecheck | passed |
| Owned-file ESLint | passed |
| MCP build | passed |
| Generated MCP documentation and manifest checks | passed |
| Version freshness | passed |
| `git diff --check` before receipt creation | passed |

The W0 performance limits are not declared passed. The runtime did prove
absence of automatic watcher publication over the former debounce interval,
but the product failure stopped changed-search, restart, memory, and final
latency qualification.

## Current decision

```text
watcher_decoupling_blocked
```

Required next owner:

```text
incremental publication completeness
```

The next investigation must reproduce the add/modify/delete sequence through
an existing allowed freshness trigger and repair the publication owner without
weakening validation. Watcher decoupling may resume only after that exact
witness publishes and reads one complete generation.

