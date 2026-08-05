# Scout Round — Pi Implementation Workflow

A project-scoped workflow for executing implementation plans with Pi while minimizing late scope discovery, worker takeovers, repeated steering, and unsupported security claims.

## Contents

```text
.pi/settings.json
.pi/agents/structure-scout.md
.pi/chains/scout-round.chain.json
.pi/prompts/scout-round.md
.pi/skills/scout-round-execution/SKILL.md
scripts/verify-regression.sh
```

The slash prompt is the primary controller. The saved chain mirrors the scout → dynamic fanout → collect → review shape, but the parent session still owns task approval, per-worker worktree isolation, sequential integration, drift reconciliation, and final claims.

## Requirements

- Pi core compatible with your installed `pi-subagents` build.
- `pi-subagents` 0.40.0 or a compatible release.
- Existing Satori/codebase-memory MCP tools with these registered names:
  - `codebase-memory-mcp_trace_path`
  - `codebase-memory-mcp_search_graph`
  - `satori_call_graph`
  - `satori_search_codebase`
- Piolium for the optional security changed-files gate.
- Git and Bash.

No new Pi extension or orchestration package is required.

## Install in a repository

Copy the project files into the repository root. Merge `.pi/settings.json` with existing project settings rather than overwriting unrelated configuration.

```bash
cp -R .pi/ /path/to/repository/.pi/
install -m 0755 scripts/verify-regression.sh /path/to/repository/scripts/verify-regression.sh
```

Run the bundle validator before copying when modifying any file:

```bash
bash tests/validate-bundle.sh
```

## Use

From a clean integration checkout in Pi:

```text
/scout-round docs/path/to/implementation-plan.md
```

Or provide a bounded task description:

```text
/scout-round Harden file-outline reads so every live path enforces the workspace policy.
```

The prompt performs these stages:

1. Record integration, local master, and origin/master heads.
2. Run one MCP-powered structural audit for the entire round.
3. Correct mechanical scope and split oversized tasks once.
4. Dispatch audited tasks in isolated worker worktrees.
5. Independently run focused and affected-suite acceptance commands.
6. Prove regression tests against the exact base commit.
7. Integrate worker handoffs sequentially in the parent checkout.
8. Run risk-triggered suites, one aggregate review, and Piolium diff where applicable.
9. Require rebuilt-artifact replay before an end-to-end security claim.

## Saved-chain compatibility

`.pi/chains/scout-round.chain.json` is deliberately not the sole entrypoint. Dynamic fanout can execute audited tasks, but the parent must still guarantee per-worker worktree isolation and must retain the decision checkpoint before integration.

Use the saved chain only when the installed runner guarantees worktree isolation for each expanded worker. Otherwise, `/scout-round` reproduces the same contracts through direct subagent calls or `workflowScript`.

## Regression proof

Verify a committed candidate:

```bash
scripts/verify-regression.sh \
  --repo . \
  --base <round-base> \
  --candidate <candidate-commit> \
  --command 'npm test -- path/to/regression.test.ts'
```

Verify the current working tree:

```bash
scripts/verify-regression.sh \
  --base <round-base> \
  --command 'npm test -- path/to/regression.test.ts'
```

Exit codes:

| Code | Meaning |
|---:|---|
| 0 | Exact command failed on base and passed on candidate |
| 2 | Command passed on base; regression claim is invalid |
| 3 | Candidate command failed |
| 4 | Arguments, Git state, setup, or command execution failed |

When temporary worktrees need setup, pass `--setup-command`. Existing root `node_modules` is symlinked automatically into temporary worktrees.

## Operational defaults

- Maximum worker concurrency: 3.
- Runtime budgets: 60 minutes low risk, 90 minutes medium risk, 120 minutes high risk.
- Automatic mechanical scope correction: one pass.
- Consolidated fix-and-re-review cycle: one.
- Watchdog auto-follow attempts: one.
- Oracle: only for a genuinely new security or trust-model decision.
- Parent session: the only merger and completion authority.

## Customization

The custom scout is necessary because the built-in scout does not have the installed MCP graph tools in its allowlist. If your tool registration names differ, update only the `tools:` line in `.pi/agents/structure-scout.md` and rerun `tests/validate-bundle.sh` after adjusting its expected names.

Repository-specific test commands are discovered by the scout and carried in each task packet; this bundle does not hard-code npm, pnpm, or language-specific suites.
