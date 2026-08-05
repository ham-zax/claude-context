# Pi Security Round Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a ready-to-copy Pi project workflow that performs structural preflight, isolated parallel implementation, deterministic regression proof, sequential parent integration, and aggregate security review.

**Architecture:** The parent Pi session remains the sole decision and integration authority. A project prompt template orchestrates a custom read-only structure scout, risk-tiered workers in worktrees, deterministic command verification, and one aggregate reviewer; a saved chain mirrors the execution shape as a compatibility fallback. Repository-specific policy lives in one compact Pi skill, and base-red proof lives in one shell script.

**Tech Stack:** Pi core 0.80+, pi-subagents 0.40.0, Pi project prompt templates, Agent Skills markdown, JSON saved chains, Bash, Git worktrees.

## Global Constraints

- Do not create a Pi extension or nested orchestrator agent.
- Keep the parent Pi session as the sole decision and integration authority.
- Use one custom scout only because the built-in scout lacks the installed MCP graph tools.
- Use the built-in reviewer with a reusable security rubric; do not create a custom reviewer agent.
- Treat the slash prompt as the primary interface and the saved chain as a compatibility fallback.
- Fail closed on unknown ownership, unbounded caller impact, unresolved security decisions, dirty integration state, or invalid red evidence.
- Never auto-merge local or remote master movement; record all three heads and reconcile only relevant drift.
- Cap automated correction at one fix-and-re-review cycle.

---

### Task 1: Initialize the reusable skill

**Files:**
- Create: `.pi/skills/scout-round-execution/SKILL.md`
- Create: `.pi/skills/scout-round-execution/agents/openai.yaml`

**Interfaces:**
- Consumes: `/scout-round` prompt and `scripts/verify-regression.sh`.
- Produces: Compact process rules discoverable by Pi when executing medium/high-risk multi-task plans.

- [ ] **Step 1: Initialize the skill with the official generator**

Run:

```bash
python3 $HOME/.codex/skills/.system/skill-creator/scripts/init_skill.py scout-round-execution --path .pi/skills
```

Expected: a valid skill directory with `SKILL.md` and UI metadata scaffolding.

- [ ] **Step 2: Replace generated placeholders with the approved workflow rules**

Write concise trigger metadata and fail-closed execution requirements. Remove unused example assets and references.

- [ ] **Step 3: Validate the skill**

Run:

```bash
python3 $HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py .pi/skills/scout-round-execution
```

Expected: validation passes with no placeholders.

### Task 2: Implement deterministic base-red verification

**Files:**
- Create: `scripts/verify-regression.sh`
- Test: `tests/test-verify-regression.sh`

**Interfaces:**
- Consumes: `--base <git-ref>`, `--command <shell-command>`, optional `--candidate <git-ref>`, `--repo <path>`, and `--setup-command <shell-command>`.
- Produces: A stable verdict and exit code proving whether the same command fails on base and passes on candidate.

- [ ] **Step 1: Write a failing shell test**

Create a temporary Git repository with a base commit where a command exits nonzero and a candidate commit where it exits zero. Assert that the missing script causes the test to fail.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bash tests/test-verify-regression.sh
```

Expected: FAIL because `scripts/verify-regression.sh` does not yet exist.

- [ ] **Step 3: Implement the minimal script**

Use detached temporary worktrees, run the exact command in base and candidate states, clean up with a trap, and return:

- `0` for valid red-to-green,
- `2` when the command passes on base,
- `3` when the candidate fails,
- `4` for invalid usage or infrastructure failure.

- [ ] **Step 4: Add negative-path tests**

Cover passes-on-base, candidate-fails, invalid base ref, and dirty current candidate usage.

- [ ] **Step 5: Run syntax and behavior tests**

Run:

```bash
bash -n scripts/verify-regression.sh
bash tests/test-verify-regression.sh
```

Expected: all cases pass.

### Task 3: Configure watchdog defaults

**Files:**
- Create: `.pi/settings.json`

**Interfaces:**
- Consumes: pi-subagents project settings.
- Produces: Agent-end scope review, one bounded automatic blocker follow-up, and LSP diagnostics.

- [ ] **Step 1: Write conservative settings**

Enable watchdog scope and LSP review, set `maxAttempts` to `1`, and avoid frequent cadence polling by default.

- [ ] **Step 2: Parse the JSON**

Run:

```bash
node -e 'JSON.parse(require("fs").readFileSync(".pi/settings.json", "utf8"))'
```

Expected: exit `0`.

### Task 4: Create the MCP-enabled structure scout

**Files:**
- Create: `.pi/agents/structure-scout.md`

**Interfaces:**
- Consumes: A complete round plan or task list and the repository state.
- Produces: Strict JSON matching the round-audit schema, including a fail-closed `ready` flag and corrected/split task packets.

- [ ] **Step 1: Define read-only frontmatter**

Allow built-in read/search tools plus the installed codebase-memory and Satori graph tools. Do not grant edit/write tools.

- [ ] **Step 2: Define the round-audit contract**

Require ownership, callers, tests, interfaces, security boundaries, overlaps, commands, and unresolved decisions for every task. Require `tasks: []` when `ready` is false.

- [ ] **Step 3: Validate frontmatter and placeholders**

Run a local validation script that confirms required keys, exact tool names, and absence of `TODO`/`TBD`.

### Task 5: Create the saved dynamic-fanout chain

**Files:**
- Create: `.pi/chains/scout-round.chain.json`

**Interfaces:**
- Consumes: A round plan in `{task}`.
- Produces: Scout output, verified worker fanout, collected worker reports, and aggregate reviewer output.

- [ ] **Step 1: Define the scout step with strict output schema**

The scout must emit `ready`, `blocking_reasons`, `round_risk`, and dispatchable tasks. Empty tasks with `onEmpty: "fail"` form the automatic fail-closed checkpoint.

- [ ] **Step 2: Define dynamic worker fanout**

Expand from `/tasks`, bind each task as `work_item`, use verified acceptance commands from the scout packet, collect reports, and set bounded concurrency.

- [ ] **Step 3: Define one aggregate reviewer step**

Parameterize the reviewer task with the security rubric and collected worker reports. Do not create another agent.

- [ ] **Step 4: Parse and structurally validate the chain**

Run JSON parsing plus schema-shape assertions for `expand`, `parallel`, `collect`, `outputSchema`, and acceptance contracts.

### Task 6: Create the `/scout-round` project command

**Files:**
- Create: `.pi/prompts/scout-round.md`

**Interfaces:**
- Consumes: `$ARGUMENTS` containing a plan path or task description.
- Produces: Parent-owned execution of the complete workflow with durable ledger entries and a final evidence summary.

- [ ] **Step 1: Encode preflight and fail-closed gates**

Require a clean integration state, three-head recording, one structured scout pass, one automatic mechanical amendment pass, and escalation only for genuine security decisions.

- [ ] **Step 2: Encode execution and integration**

Use isolated worktrees, progress artifacts, verified commands, sequential patch integration, drift rechecks, and affected-suite gates.

- [ ] **Step 3: Encode review and final verification**

Require base-red proof for regression claims, one aggregate reviewer, at most one correction cycle, risk-triggered full suite, Piolium diff for security-sensitive rounds, and artifact replay before end-to-end claims.

- [ ] **Step 4: Check prompt completeness**

Assert that all required stages, stop conditions, and output fields are present and no placeholder text remains.

### Task 7: Package and verify the complete bundle

**Files:**
- Create: `README.md`
- Create: `tests/validate-bundle.sh`
- Create: `pi-security-workflow.zip`
- Create: `skill.zip`

**Interfaces:**
- Consumes: All project artifacts.
- Produces: A ready-to-copy project bundle and a separately installable skill archive.

- [ ] **Step 1: Write installation and usage instructions**

Document copy paths, required tool-name adjustments, `/scout-round` usage, exit codes, and the saved-chain compatibility note.

- [ ] **Step 2: Run the complete validator**

Run:

```bash
bash tests/validate-bundle.sh
```

Expected: JSON, frontmatter, prompt, shell, and skill checks all pass.

- [ ] **Step 3: Package the skill**

Run:

```bash
python3 $HOME/.codex/skills/.system/skill-creator/scripts/package_skill.py .pi/skills/scout-round-execution /mnt/data/pi-security-workflow-work/dist
```

Expected: `/mnt/data/pi-security-workflow-work/dist/skill.zip`.

- [ ] **Step 4: Package the project bundle**

Create a ZIP containing `.pi`, `scripts`, tests, README, and the implementation plan.

- [ ] **Step 5: Inspect archive contents**

List both archives and confirm no temporary files, caches, credentials, or generated Git repositories are included.
