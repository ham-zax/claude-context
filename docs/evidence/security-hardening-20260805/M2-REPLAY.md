# M2 Replay Evidence — Hardened Surface

**Date:** 2026-08-06
**Build under test:** commit `cc983667ea8692fe3ba887c28b81cef4ba81e131` (integration `integrate/security-hardening-20260805`, all security tasks merged)
**Package hash:** `packages/mcp/dist/index.js` sha256 `56553b127ac28ec9d2d951ed2e7e942795e1ecb6bfc761812208751c14185823` (clean `pnpm run build`)
**Harness:** `piolium/findings/M2-symlink-escape-file-read-tools/replay.mjs` (git-ignored; attack logic preserved from original `poc.mjs`, transport updated to the session workspace-policy contract)
**Original PoC under the new contract:** `poc.original.mjs` run unchanged — its DEMO 1/2 now fail closed (`WORKSPACE_POLICY_NOT_BOUND` for manage_index on a policy-less context; `read_file` denies `/etc/passwd` and the `~/.ssh` secret with no registered-authorized root). Its DEMO 3 tests raw `fs` primitives (not the tool surface) and its trailing "confirmed" verdict is stale/self-referential, not an observable tool leak.

## Attack results (14 attacks, 0 leaked secret bytes)

| ID | Attack attempted | Public tool | Expected denial | Actual denial | Secret bytes returned | Result |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | manage_index create on `/` | manage_index | BROAD_ROOT_NOT_ALLOWED | BROAD_ROOT_NOT_ALLOWED | no | PASS |
| A2 | manage_index status on home dir | manage_index | BROAD_ROOT_NOT_ALLOWED | BROAD_ROOT_NOT_ALLOWED | no | PASS |
| A3 | manage_index status on sibling workspace | manage_index | ROOT_NOT_AUTHORIZED | ROOT_NOT_AUTHORIZED | no | PASS |
| A4 | manage_index status on `~/.ssh` (sensitive dir) | manage_index | ROOT_NOT_AUTHORIZED | ROOT_NOT_AUTHORIZED | no | PASS |
| A5 | read_file on ignored `.env` under indexed root | read_file | FILE_NOT_PUBLISHED | FILE_NOT_PUBLISHED | no | PASS |
| A6 | read_file on unpublished regular file under indexed root | read_file | FILE_NOT_PUBLISHED | FILE_NOT_PUBLISHED | no | PASS |
| A7 | read_file on inside-root symlink → outside secret | read_file | ROOT_NOT_AUTHORIZED / FINAL_SYMLINK_REJECTED | outside_indexed_root denial | no | PASS |
| A8 | file_outline on inside-root symlink (escape) | file_outline | FINAL_SYMLINK_REJECTED (authorization primitive) | ROOT_NOT_AUTHORIZED; policy forwarded | no | PASS |
| A9 | call_graph source fallback on inside-root symlink | call_graph | FINAL_SYMLINK_REJECTED (authorization primitive) | ROOT_NOT_AUTHORIZED; policy forwarded | no | PASS |
| A10 | annotated read_file bypass attempt via internal file-outline | read_file (annotated) | denial BEFORE outline; outlineInvocations=0 | FILE_NOT_PUBLISHED; outlineInvocations=0 | no | PASS |
| A11 | path replaced after authorization, before verification | openAuthorizedPublishedFile + verifyStableFileObservation | FILE_REPLACED / RootBoundFileError | replacement detected (same-size swap, mtime-based) | no | PASS |
| A12 | FIFO special file | read_file (annotated) | not_found (not a file) / NOT_A_REGULAR_FILE | not_found | no | PASS |
| A13 | oversized file above READ_FILE_MAX_BYTES (65,536) | read_file | FILE_TOO_LARGE | FILE_TOO_LARGE | no | PASS |
| A14 | session B manage_index on session A's workspace | manage_index | ROOT_NOT_AUTHORIZED | ROOT_NOT_AUTHORIZED | no | PASS |

## Positive controls (4/4 pass)

| ID | Control | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| P1 | read_file on authorized published README | content returned | content returned | PASS |
| P2 | read_file on untracked in-scope source via live-path | content returned | content returned | PASS |
| P3 | read_file on ignored untracked file | denied | FILE_NOT_PUBLISHED | PASS |
| P4 | normal file_outline + call_graph on published file | schemas produced | both invoked once, ok | PASS |

## Disposition

**M2: FIXED.** All 14 attacks returned no protected content; all 4 positive controls pass. Session-workspace gating, publication/live-path admission, descriptor-bound authorization, the byte ceiling, stable verification, and cross-session isolation are all effective on the rebuilt shipped surface.

## Residual observations

- A8/A9 denial surfaced at the workspace-policy layer (ROOT_NOT_AUTHORIZED) rather than the Task 5 helper's FINAL_SYMLINK_REJECTED because the policy canonicalizes the symlink target outside the session workspace first — a stronger, earlier denial. Handler-level symlink rejection is additionally covered by the project's own suites (handlers.file_outline 46/46, handlers.call_graph 33/33, python-call-fallback 7/7).
- A12 FIFO denial is the tool's pre-helper "is not a file" check (structured `not_found` in annotated mode) — no content read attempted.
- A11 used the same-size in-place swap; detection is mtime/ctime-based (inherent to the Core primitive design, Task 5 scope). Cross-process racing beyond this is covered by descriptor-bound identity + post-open fstat.
- Replay artifacts (`replay.mjs`, evidence/) live under the git-ignored `piolium/` tree; the durable record is this document.
