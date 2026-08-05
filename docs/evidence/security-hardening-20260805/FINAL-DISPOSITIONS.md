# Security Hardening — Final Finding Dispositions

**Date:** 2026-08-06
**Final integration SHA:** `67ea40e075825a0322f7cc58ba02c0b6c8eedb15`
**Merge base with master:** `789fc88` (master at merge time)
**Baseline record:** `BASELINE.md` (this directory)
**M2 replay evidence:** `M2-REPLAY.md` (this directory)
**Findings registry:** `findings-registry.yml` (this directory; authoritative tracked status record — the piolium drafts were untracked on master 2026-08-06 and are no longer in the repository)

## Dispositions (final)

| Finding | Final disposition |
| --- | --- |
| M1 shared-runtime authentication claim | **Accepted risk / corrected threat model** — NOT fixed authentication. Protocol v2 (`challengeNonce`, lifecycle-only `ownershipToken`) states the same-UID trust boundary honestly; the original remediation claim (comparing `launcherNonce` with `ownershipToken`) was incorrect and is retracted: the values have different formats/purposes, and a metadata-readable token cannot defend against a malicious same-UID process. Socket mode `0600` + owned directories enforce an OS-user boundary. |
| M2 arbitrary workspace/file reads | **Fixed and exploit-replay verified.** Workspace authorization is session-scoped and immutable; `/`, home, and the state root are denied by default; lifecycle tools are gated before any provider work; file reads are restricted to published or live-path-admitted, non-ignored source files through descriptor-bound opening with stable verification; byte ceiling enforced before allocation. M2 replay against the rebuilt shipped surface (14 attacks, 0 secret bytes; 4/4 positive controls; dist hash `56553b127ac28ec9d2d951ed2e7e942795e1ecb6bfc761812208751c14185823`) → **FIXED**. |
| W1 mandatory retrieval | **Fixed.** Bounded conjunctive `must:` lane with explicit incompleteness warnings (fix SHAs `5836b25`/`fe97fc7`/`14ddc47`, ancestry-verified). |
| W2 reranker bounds | **Fixed.** 30s timeout, 2 attempts, 250ms backoff, classified retries, cancellation, diagnostics (fix SHAs `4b65403`/`f54f98d`). |
| W3 call-graph coverage | **Improved.** Cross-module constructors and now exact same-module constructors resolve; fail-closed on ambiguity/shadowing. Remaining low-confidence limitations documented (closure-scope and unannotated-parameter shadowing undetectable; edges rated `low` confidence). |
| W4 untracked freshness | **Fixed.** porcelain-v1 `-z --untracked-files=all` includes untracked files (fix SHAs `84b8393`/`4363f2f`/`6498e79`). |
| W7 pagination evidence | **Fixed.** Total/returned counts and `not_admissible` continuation state (fix SHAs `6dc4142`/`189448f`). |

This report intentionally does **not** state "all vulnerabilities fixed": M1 was resolved by explicitly accepting and documenting the same-UID trust boundary, not by fixing authentication.

## Additional hardening delivered (beyond the original report)

- Session-scoped immutable workspace policy with deny-all `UNBOUND_WORKSPACE_POLICY` for unbound contexts; cross-session isolation.
- Shared-runtime identity now includes `READ_FILE_MAX_BYTES` (a stricter-limit client cannot attach to a larger-limit host).
- Descriptor-bound file opening (`O_NOFOLLOW`, inode verification, stable observation) reused across `read_file`, `file_outline`, `call_graph`, Python fallback, and registry freshness — zero pathname content reads remain in the navigation/search surface.
- Bounded HTTP utility applied to VoyageAI reranker, Milvus REST, and Zilliz management (deadlines, classified retries, byte limits, cancellation; mutations never retried); abort-listener leak fixed with regression evidence.
- Finding-status validator enforces commit-ancestry consistency in CI; strict SHA validation; tracked M1/M2 registry.

## Known residual items (ruled ship / pre-existing)

- `release:check:packed` graph drift — fails identically on pre-hardening master (verified on `5b66b3f`); must be fixed or formally waived before release publication.
- Python search span repair temporarily disabled (search rendering has no authorized source reader); spans stay as-indexed — release-note item.
- Legacy indexes without `indexManifest` serve only live-path files until reindexed (fail-closed).
- Tracked-state oracle: out-of-workspace roots deny as `not_found` vs `not_indexed` (inherent to the response contract).
