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
verified_at: "7c961512c7d7ec14859f616de038488f61ff0d70"
fixed_in: "7c961512c7d7ec14859f616de038488f61ff0d70"
fix_verified_at: "7c961512c7d7ec14859f616de038488f61ff0d70"
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

## Resolution (2026-08-06 — audit reissue)

**Status: fixed.** Verified present at the audited commit `7c961512`:
`getChangedFilesForCodebase` parses `git status --porcelain=v1 -z --untracked-files=all`
(tracked modifications, deletions, renames, `??` paths, paths containing spaces and
unusual characters); untracked paths invalidate freshness, enter exact source comparison
as paths with no checkpoint record, and join the `live_path` lane; `.satoriignore`'d
untracked files stay invisible with no sync churn; the dot-prefixed-path correction
handles names like `..config.ts` without traversal. The original invisibility defect no
longer holds. A performance consideration remains for repositories with very large
numbers of non-ignored untracked files — not the original defect.
