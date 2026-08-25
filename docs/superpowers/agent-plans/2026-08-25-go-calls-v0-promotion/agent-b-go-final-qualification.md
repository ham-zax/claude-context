# Agent B — Go `calls_v0` Product Witness and Final Qualification

**Repository:** `/home/hamza/repo/satori`
**Artifact type:** mixed executable/test qualification
**Workspace:** `/home/hamza/repo/satori-agent-b-go-calls-v0`
**Branch:** `agent/go-calls-v0-b-final-qualification`
**Isolation reason:** one final qualification writer; reuse the existing Agent B worktree instead of creating another worktree
**Can start:** immediately after this mission is present on the latest integration coordination HEAD
**Depends on:** integrated Wave 3 public promotion (`2c58f2de` or its descendant coordination commit)
**Execution lifetime:** `persistent-agent-loop` required
**Wake strategy:** Terminal + event wait for persistent MCP/product-run processes; bounded Bash for ordinary tests/builds
**Developer visibility:** headless by default; passive presentation on request

## Read first

- `docs/plans/2026-08-20-go-calls-v0-promotion-plan.md` — authoritative source plan, especially Tasks 6 and 7 and promotion exit criteria.
- `docs/superpowers/agent-plans/2026-08-25-go-calls-v0-promotion/README.md` — current coordination state.
- `docs/superpowers/agent-plans/2026-08-25-go-calls-v0-promotion/agent-a-direct-calls-boundary.md`
- `docs/superpowers/agent-plans/2026-08-25-go-calls-v0-promotion/agent-b-go-semantic-v2.md`
- `docs/superpowers/agent-plans/2026-08-25-go-calls-v0-promotion/agent-b-go-qualification.md`
- `docs/superpowers/agent-plans/2026-08-25-go-calls-v0-promotion/agent-a-go-promotion.md`
- `AGENTS.md`
- Current integrated implementation before editing.

## Objective

Close the Go `calls_v0` promotion by proving the real public product path on TruffleHog and then qualifying one exact final Satori HEAD through every release gate required by the source plan.

This is the final wave. Do not begin another language or receiver-aware tier after completion.

## Accepted baseline

The integrated baseline already has:

- Go semantic v2 module/package/build-context correctness;
- generic direct-call-only Tier-3 CBM admission;
- focused Go qualification green;
- canonical Go capability promoted to `calls_v0`;
- Go graph-ready capability/evidence/navigation fixture expectations;
- capability-based MCP `call_graph` wording;
- current README/landing public claims;
- receiver/type/embed/interface/callback/unknown evidence excluded from authoritative Go Tier-3 `CALLS`;
- `importExportCapability`, `typeReceiverAwareCapability`, and `testReferenceCapability` still `none`.

Do not reopen those accepted contracts unless an explicitly required final gate produces a concrete failure that proves a defect in them.

## Ownership

You own:

- `scripts/trufflehog-go-call-graph-product-run.ts`;
- the minimal production/test correction required if an exact final gate exposes a real Go `calls_v0` defect;
- execution of the exact-head final qualification gates;
- leaving Satori and TruffleHog clean after qualification.

You do not own:

- new language promotions;
- Go receiver/type-aware Tier 4;
- Go import/export or `TESTS` support;
- graph-store redesigns or sidecars;
- compatibility shims for pre-v2 Go semantics;
- unrelated cleanup, refactors, dependency upgrades, or test expansion.

## Product witness contract

Create `scripts/trufflehog-go-call-graph-product-run.ts` by modeling it directly on `scripts/trufflehog-mvcc-product-run.ts`. Do not introduce a shared harness abstraction merely for these two scripts.

The witness must:

1. Require both `/home/hamza/repo/satori` and `/home/hamza/repo/trufflehog` worktrees to be clean before starting.
2. Capture one exact Satori HEAD and one exact TruffleHog HEAD and keep them fixed for the run.
3. Build/use the exact Satori candidate HEAD and isolated Satori state; do not reuse the developer's normal index state.
4. Use one live MCP runtime for create/status polling because mutation phase/progress/error are process-lifetime state.
5. Index `/home/hamza/repo/trufflehog` through public `manage_index`.
6. Search for canonical `CheckPackageDir` in `hack/checksecretparts/check.go` through public `search_codebase` and require `navigation.graph="ready"`.
7. Call public `call_graph(direction="callees")` for `CheckPackageDir` and require the direct `CheckPackageDir -> checkFiles` edge.
8. Resolve `checkFiles`, call public `call_graph(direction="callers")`, and require `CheckPackageDir` as a caller.
9. Require the returned call site, source/target files, symbol IDs, and `navigationAuthority.publicationId` to agree with the serving Publication.
10. Fail closed on any unsupported/not-ready/stale/incompatible result rather than silently accepting partial output.
11. Clean up isolated Satori state/runtime resources in `finally` unless an explicitly requested debugging mode preserves them.
12. Leave both repositories clean.

The real witness is intentionally a direct single-module Go call. Do not use it to broaden receiver-aware semantics or duplicate synthetic nested-module/build-context qualification.

## Candidate freeze

Finish all functional edits, including the product-witness script, before freezing the final candidate HEAD.

After the candidate is frozen:

- record the exact HEAD in the finish report;
- do not make another functional commit without invalidating the qualification receipt;
- if any required gate exposes a defect, make only the smallest responsible correction, commit it, establish a new exact candidate HEAD, and rerun every required exact-head promotion gate below on that new HEAD.

## Required exact-head qualification

Testing and product qualification are explicitly authorized for this effort.

On one exact final HEAD, run all of:

```bash
pnpm semantic:verify
pnpm run check
pnpm run build
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-mcp test
pnpm run release:check
pnpm --filter @zokizuan/satori-mcp exec tsx ../../scripts/trufflehog-go-call-graph-product-run.ts
```

Also run:

```bash
git diff --check <wave-base>..HEAD
git status --short
```

Do not substitute a narrower test lane for these final gates. Do not add extra broad suites beyond the commands above unless a mandatory repository rule requires one.

## Completion criteria

The mission is complete only when all of the following are true on the same exact candidate HEAD:

- the TruffleHog public product witness proves `CheckPackageDir -> checkFiles` and the reverse caller relationship through the serving Publication;
- the witness verifies publication ID, symbol/file identity, and call-site consistency;
- `pnpm semantic:verify` passes;
- `pnpm run check` passes;
- `pnpm run build` passes;
- full Core tests pass;
- full MCP tests pass;
- `pnpm run release:check` passes;
- the TruffleHog witness command passes;
- Go remains canonical `calls_v0` with `typeReceiverAwareCapability`, `importExportCapability`, and `testReferenceCapability` all `none`;
- no Go-specific branch exists in generic builder/workflow/Context/MCP serving code;
- Satori working tree is clean;
- TruffleHog working tree is clean;
- no in-scope blocker remains.

## Working style

Use Causal Coding for any source mutation. Keep one leading failure hypothesis when a gate fails. Fix the responsible owner only; do not weaken qualification assertions or broaden scope.

Use `persistent-agent-loop` for execution lifetime because the public product witness may involve a persistent MCP runtime and wait-heavy commands. Keep persistent processes in Terminal and observe them with event waits rather than shell polling or sleep loops. Status/progress questions are steering, not stop commands.

Do not create another worktree. Do not merge/rebase the integration branch. Commit only logically scoped final-wave changes on your assigned branch.

## Finish report

Return:

1. status: complete / blocked / needs decision;
2. branch and final commit(s), including the exact qualified candidate HEAD;
3. product-witness implementation summary;
4. exact Satori and TruffleHog HEADs used by the passing witness;
5. public witness results for search, callees, callers, symbol/file/call-site identities, and `navigationAuthority.publicationId`;
6. every required qualification command and pass/fail result;
7. any production defect found and smallest correction made;
8. confirmation disabled Go tiers remain disabled and no Go-specific serving branch was added;
9. final `git status` for both repositories;
10. unresolved risks/deviations, if any.
