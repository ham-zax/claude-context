# Satori Security Hardening — Baseline Ledger

**Worktree:** `/home/hamza/repo/satori-worktrees/security-hardening-task-0` (branch `task/security-hardening-0-baseline`)
**Recorded HEAD:** `94a3dc659d3edce892f6f7f859a6c70597343751` (`fix(core): restore retired-marker test semantics with type-safe v2 casts`)
**Audited revision:** `7c961512c7d7ec14859f616de038488f61ff0d70`
**Ancestry proof:** `git merge-base --is-ancestor 7c961512c7d7ec14859f616de038488f61ff0d70 HEAD` → exit 0. HEAD descends from the audited commit.
**Worktree state:** clean at record time (no product changes).

## Finding status ledger

| Finding | Current status | Evidence |
| --- | --- | --- |
| W1 must retrieval | closed | fix SHAs `5836b25` (add bounded must-constrained retrieval), `fe97fc7` (attach must-constraint budget metadata), `14ddc47` (enforce conjunctive lexical contracts); all ancestors of HEAD. Focused regression: `search-execution.must-lane.test.ts` + `search-execution-expansion.test.ts` + `search-execution.exact-pin-rerank.test.ts` → 13 pass, 0 fail. |
| W2 Voyage timeout/retry | closed | fix SHAs `4b65403` (bound VoyageAI latency and report failures), `f54f98d` (report complete execution diagnostics); both ancestors of HEAD. Focused regression: `src/reranker/voyageai-reranker.test.ts` → 20 pass, 0 fail. Full core suite: 643 pass, 0 fail, 1 skipped. |
| W4 untracked freshness | closed | fix SHAs `84b8393` (include untracked files in live search), `4363f2f` (test: satoriignore-excluded untracked paths do not trigger sync), `6498e79` (preserve dot-prefixed working-tree paths); all ancestors of HEAD. Focused regression: `working-tree-state.test.ts` → 13 pass, 0 fail. |
| W7 pagination evidence | closed | fix SHAs `6dc4142` (report continuation availability), `189448f` (restore honest readiness and normalize pagination evidence); both ancestors of HEAD. Focused regression: `relationship-continuation.test.ts` + `source-continuation-fingerprint.test.ts` → 9 pass, 0 fail. |
| M2 workspace/root authorization | open | `packages/mcp/src/tools/read_file.ts` `resolveContentAllowedRoot`: authorization = canonical realpath containment under a root with status `indexed`/`sync_completed`; no launcher-approved workspace allowlist exists. `manage_index` accepts any absolute directory path. |
| M2 file-read publication scope | open | `read_file.ts` does not require membership in the published source manifest, index extension policy, or `.satoriignore` exclusion; any regular file under an indexed root is readable. |
| M1 same-UID socket claim | requires trust-model correction | `packages/mcp/src/server/shared-runtime-host.ts`: attach accepts after format-only `launcherNonce` check (48 lowercase hex) and echoes it; `ownershipToken` (UUID, metadata mode `0600`) is never compared during attach and serves lifecycle-state ownership only. Protocol claim "ownership authentication" is unsupported. |
| Python same-module constructor callers | open | Documented limitation in call-graph coverage: same-module bare Python constructor calls emit no `CALLS` edge; non-empty inbound graphs may omit same-module callers without partial-coverage disclosure. |

## Test receipts (commands and results)

| Command | Result |
| --- | --- |
| `git status --short --branch` | clean, branch `task/security-hardening-0-baseline` |
| `git rev-parse HEAD` | `94a3dc659d3edce892f6f7f859a6c70597343751` |
| `git merge-base --is-ancestor 7c961512c7d7ec14859f616de038488f61ff0d70 HEAD` | exit 0 |
| `pnpm --filter @zokizuan/satori-core build` | pass (required for MCP tests; fresh worktree had no `dist`) |
| `pnpm --filter @zokizuan/satori-core test -- voyageai-reranker` | 643 pass, 0 fail, 1 skipped (full core suite; filter arg does not narrow the `src/**/*.test.ts` glob) |
| `node --test src/reranker/voyageai-reranker.test.ts` (core, via tsx) | 20 pass, 0 fail |
| `node --test src/core/working-tree-state.test.ts` (mcp, via tsx) | 13 pass, 0 fail |
| `node --test src/core/search-execution.{must-lane,expansion,exact-pin-rerank}.test.ts` (mcp) | 13 pass, 0 fail |
| `node --test src/core/relationship-continuation.test.ts src/core/source-continuation-fingerprint.test.ts` (mcp) | 9 pass, 0 fail |
| `git diff --check` | pass (no whitespace errors) |

## Notes

- The MCP `test` script (`pnpm --filter @zokizuan/satori-mcp test -- <name>`) appends the filter after a `src/**/*.test.ts` glob, so the filter does not narrow file selection; focused runs above use the package's exact node invocation (`node --import tsx --import ./src/test-state-root.ts --test --test-concurrency=1 <files>`).
- Old `piolium/findings/*/draft.md` text was not used to infer status; every status above rests on fix-commit ancestry and focused test receipts.
- W3 (inbound call-graph coverage) is context only: its partial fix commits `34cdc83`, `c1c5636`, `d925b19`, `7c96151` are ancestors of HEAD, and the remaining same-module constructor gap is tracked in the table above.
