---
id: W4
slug: freshness
severity: high
title: "Untracked files are invisible to search freshness and to the live_path retrieval lane"
class: freshness
poc_kind: theoretical
exploitability: local-exploitable
satori_priority: P1
source: docs/remediation/2026-08-04-search-weakness-report-verification.md
plan_task: 5
fix_commit: "fix(freshness): include untracked files in live search"
status: fixed
introduced_at: "403723ee09ed9762195d983b3c4595985a917f5d"
verified_at: "403723ee09ed9762195d983b3c4595985a917f5d"
fixed_in: "6498e7936d709e50ad261a73003f8ab440d1da92"
fix_verified_at: "94a3dc659d3edce892f6f7f859a6c70597343751"
---

# W4 — Untracked files are invisible to freshness and `live_path`

## Finding

Tracked dirty files do participate in search freshness (exact content
comparison + a live-path retrieval pass); the real gap is that untracked
files are invisible to freshness invalidation and to the `live_path`
retrieval lane. A brand-new file is not searchable and does not age the index
until it is committed.

## Verified mechanism

- `ensureSearchFreshness` (`packages/mcp/src/core/handlers.ts:3995`) →
  `getChangedFilesForCodebase` → `exactSourceComparisonPaths` → content-hash
  comparison against the freshness checkpoint
  (`packages/core/src/sync/synchronizer.ts:1291`); a `differs` result drives
  a sync.
- Dirty tracked files feed a `live_path` retrieval pass
  (`packages/mcp/src/core/search-execution.ts:1020`,
  `buildLivePathScopedSearchResults`).
- `getChangedFilesForCodebase` runs
  `git status --porcelain --untracked-files=no`
  (`packages/mcp/src/core/working-tree-state.ts:97`) — untracked files are
  never seen.
- Ignore-policy exclusions (`.satoriignore`) remain by design; no
  `head_sha`-based proof exists (freshness is checkpoint/content-based).

## Reproducer

Create a brand-new untracked source file inside index scope; search does not
find it and freshness does not invalidate until the file is committed. See
`docs/evidence/search-integrity-baseline-20260805/` fixtures.

## Fix

Plan Task 5 — parse `git status --porcelain=v1 -z --untracked-files=all`
(tracked modifications, deletions, renames, `??` paths, paths containing
spaces); untracked source files inside index scope invalidate freshness, enter
exact source comparison as paths with no checkpoint record, and join the
`live_path` lane; `.satoriignore`'d untracked files stay invisible with no
sync churn. Acceptance: the plan's working-tree-state and freshness regression
tests pass (red → green).
