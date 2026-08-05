# Satori Security Hardening — Small-Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Satori security and correctness gaps without reopening search fixes that are already present at or after commit `7c961512c7d7ec14859f616de038488f61ff0d70`.

**Architecture:** Separate workspace authorization from index/publication state. A trusted launcher establishes immutable per-session workspace roots; lifecycle and read tools consume one shared authorization policy. File content is served only for publication-authorized regular files through descriptor-bound reads. Independent tracks address call-graph completeness, external HTTP deadlines, shared-runtime protocol honesty, and stale audit findings.

**Tech Stack:** TypeScript, Node.js 22.13+, pnpm 10, `node:test`, Satori Core, Satori MCP, Unix sockets, GitHub Actions.

## Global Constraints

- Base every worktree on the current `master`; first prove that `HEAD` descends from `7c961512c7d7ec14859f616de038488f61ff0d70`.
- Do not push, publish, reindex user repositories, mutate live indexes, or alter provider accounts.
- Use one isolated Git worktree per task.
- One task equals one semantic commit and one independent review gate.
- Write the failing regression test first, run it, then implement the minimum passing change.
- Agents may edit only the files listed in their task. If another file is necessary, stop and report the dependency instead of expanding scope.
- Do not reopen W1, W2, W4, or W7 unless their existing regression tests fail. They are treated as closed.
- Preserve `.satoriignore`, fingerprint checks, completion-marker durability, mutation leases, fail-closed ambiguity handling, and `rerankAdjusted === false` on reranker failure.
- Never implement M1 by comparing `launcherNonce` directly with `ownershipToken`; the values have different purposes and a metadata-readable token does not defend against a malicious same-UID process.
- Do not permit a tool argument to expand the session’s authorized workspace roots.
- Do not make root authorization equivalent to “this root is indexed.”
- All file reads must reject symlink escape, special files, unpublished files, and source replacement during the read.
- Run `git diff --check` before every commit.

---

## Work Allocation and Dependencies

```text
Task 0  Baseline and status ledger

Task 1  Pure session workspace policy
Task 8  Python same-module constructor resolution       ┐
Task 9  Shared HTTP deadline utility                    ├─ may run in parallel after Task 0
Task 11 Finding lifecycle validator                     ┘

Task 2  Shared-runtime protocol honesty                 after Task 0
Task 3  Propagate immutable session roots               after Tasks 1 and 2

Task 4  Gate lifecycle and codebase listing             after Task 3
Task 5  Publication-authorized file helper              after Tasks 1 and 3

Task 6  Harden read_file                                after Tasks 4 and 5
Task 7  Harden file_outline/call_graph source reads      after Tasks 4 and 5

Task 10A Apply HTTP policy to Milvus REST                after Task 9
Task 10B Apply HTTP policy to Zilliz management          after Task 9
```

Do not run Tasks 2 and 3 in parallel because both modify shared-runtime protocol files. Do not run Tasks 5, 6, and 7 against the same worktree.

---

### Task 0: Freeze the Correct Baseline

**Agent size:** very small, read-only investigation plus one evidence document.

**Files:**
- Create: `docs/evidence/security-hardening-20260805/BASELINE.md`

**Produces:**
- Exact audited `HEAD`
- Existing-fix status for W1, W2, W4, W7
- Focused test receipts
- Open-work ledger for M2/workspace authorization, read bounds, M1 trust model, and Python same-module constructors

- [ ] **Step 1: Prove ancestry and record repository state**

Run:

```bash
git status --short --branch
git rev-parse HEAD
git merge-base --is-ancestor 7c961512c7d7ec14859f616de038488f61ff0d70 HEAD
git log --oneline -20
```

Expected:

```text
merge-base exits 0
no unexpected product changes in this worktree
```

- [ ] **Step 2: Locate the existing fix commits**

Run:

```bash
git log --all --oneline --grep='bounded must-constrained retrieval'
git log --all --oneline --grep='bound VoyageAI latency'
git log --all --oneline --grep='include untracked files in live search'
git log --all --oneline --grep='pagination evidence'
```

Record the exact SHAs found. Do not infer “open” from old `piolium/findings/*/draft.md` text.

- [ ] **Step 3: Run focused regression suites**

Run:

```bash
pnpm --filter @zokizuan/satori-core test -- voyageai-reranker
pnpm --filter @zokizuan/satori-mcp test -- working-tree-state
pnpm --filter @zokizuan/satori-mcp test -- search-execution
pnpm --filter @zokizuan/satori-mcp test -- continuation
git diff --check
```

Expected: all selected suites pass.

- [ ] **Step 4: Write the baseline ledger**

`BASELINE.md` must contain this status table, replacing SHAs and test counts with observed values:

```markdown
| Finding | Current status | Evidence |
| --- | --- | --- |
| W1 must retrieval | closed unless regression failed | fix SHA + focused test |
| W2 Voyage timeout/retry | closed unless regression failed | fix SHA + focused test |
| W4 untracked freshness | closed unless regression failed | fix SHA + focused test |
| W7 pagination evidence | closed unless regression failed | fix SHA + focused test |
| M2 workspace/root authorization | open | source boundary |
| M2 file-read publication scope | open | source boundary |
| M1 same-UID socket claim | requires trust-model correction | protocol evidence |
| Python same-module constructor callers | open | documented limitation |
```

- [ ] **Step 5: Commit**

```bash
git add docs/evidence/security-hardening-20260805/BASELINE.md
git commit -m "test: record security hardening baseline"
```

**Do not touch:** product code, findings drafts, index state.

---

### Task 1: Add a Pure Session Workspace Policy

**Agent size:** small; one new module and one test file.

**Files:**
- Create: `packages/mcp/src/core/session-workspace-policy.ts`
- Create: `packages/mcp/src/core/session-workspace-policy.test.ts`

**Interfaces:**

```ts
export type WorkspaceAuthorizationCode =
    | "ROOT_NOT_AUTHORIZED"
    | "BROAD_ROOT_NOT_ALLOWED"
    | "INVALID_WORKSPACE_ROOT";

export type AuthorizedWorkspacePath = Readonly<{
    workspaceRoot: string;
    canonicalPath: string;
    relativePath: string;
}>;

export interface SessionWorkspacePolicy {
    readonly roots: readonly string[];
    authorizeRoot(candidateRoot: string): AuthorizedWorkspacePath;
    authorizePath(candidatePath: string): AuthorizedWorkspacePath;
}

export function createSessionWorkspacePolicy(input: {
    roots: readonly string[];
    homeDirectory: string;
    stateRoot: string;
    allowBroadRoots?: boolean;
}): SessionWorkspacePolicy;
```

**Required behavior:**

- Roots must be absolute.
- Existing roots are canonicalized with `realpath`.
- Duplicate and nested roots are reduced to the narrowest explicit authority set.
- `/`, the user home directory, and the Satori state root are rejected unless `allowBroadRoots === true`.
- `authorizeRoot` and `authorizePath` use canonical separator-boundary containment, not string-prefix containment.
- A candidate symlink resolving outside every authorized root is rejected.
- No method mutates or expands `roots`.

- [ ] **Step 1: Write failing tests**

Tests must cover:

```ts
test("rejects filesystem root by default")
test("rejects the user home as a broad root by default")
test("canonicalizes symlink aliases")
test("does not confuse /repo with /repo-other")
test("rejects a path whose real target escapes through a symlink")
test("returns a normalized relative path for an allowed descendant")
test("cannot add authority after construction")
```

- [ ] **Step 2: Run the focused test**

```bash
pnpm --filter @zokizuan/satori-mcp test -- session-workspace-policy
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal pure policy**

Do not import snapshot, vector, provider, or tool-handler modules. This task owns only canonical workspace containment.

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @zokizuan/satori-mcp test -- session-workspace-policy
pnpm --filter @zokizuan/satori-mcp typecheck
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/core/session-workspace-policy.ts \
        packages/mcp/src/core/session-workspace-policy.test.ts
git commit -m "feat(security): add immutable session workspace policy"
```

**Do not touch:** shared-runtime protocol, tools, lifecycle handlers.

---

### Task 2: Make the Shared-Runtime Protocol Honest

**Agent size:** small protocol cleanup; no workspace enforcement yet.

**Files:**
- Modify: `packages/mcp/src/server/shared-runtime-identity.ts`
- Modify: `packages/mcp/src/server/shared-runtime-host.ts`
- Modify: `packages/mcp/src/server/shared-runtime-client.ts`
- Modify: `packages/mcp/src/server/shared-runtime-lifecycle.ts`
- Modify: focused shared-runtime tests beside these files
- Modify: `SECURITY.md`

**Decision:** Treat same-UID processes as inside the shared-runtime trust boundary for the current release. Do not claim the nonce authenticates against a malicious same-UID process.

**Required behavior:**

- Bump `SHARED_RUNTIME_PROTOCOL_VERSION` from `1` to `2`.
- Rename wire field `launcherNonce` to `challengeNonce`.
- Keep it as a client-generated freshness/correlation challenge echoed by the host.
- Keep `ownershipToken` for lifecycle-state ownership and cleanup only.
- Add comments and documentation saying socket mode/owned directories enforce an OS-user boundary, not a process-within-the-same-UID boundary.
- Reject protocol-v1 handshakes with the existing incompatible-runtime response.
- Do not add a metadata-readable bearer token.

- [ ] **Step 1: Update tests first**

Add failing tests:

```ts
test("protocol v2 echoes challengeNonce")
test("protocol v1 is rejected")
test("ownershipToken is not described as launcher authentication")
```

- [ ] **Step 2: Run focused tests and verify failure**

```bash
pnpm --filter @zokizuan/satori-mcp test -- shared-runtime
```

- [ ] **Step 3: Implement protocol v2 rename and documentation**

The request and response types must use:

```ts
challengeNonce: string;
```

Keep the existing 48-lowercase-hex validation and equality echo check.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @zokizuan/satori-mcp test -- shared-runtime
pnpm --filter @zokizuan/satori-mcp typecheck
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/server/shared-runtime-*.ts SECURITY.md
git commit -m "fix(runtime): state the shared socket trust boundary honestly"
```

**Stop condition:** If the owner requires protection from malicious same-UID processes, stop and produce an ADR proposing a separate OS identity or broker. Do not invent a token comparison.

---

### Task 3: Propagate Immutable Workspace Roots Per Session

**Agent size:** medium-small protocol plumbing; no tool gating.

**Dependencies:** Tasks 1 and 2.

**Files:**
- Modify: `packages/mcp/src/server/shared-runtime-client.ts`
- Modify: `packages/mcp/src/server/shared-runtime-host.ts`
- Modify: `packages/mcp/src/server/shared-runtime.ts`
- Modify: `packages/mcp/src/server/start-server.ts`
- Modify: `packages/mcp/src/tools/types.ts`
- Modify: focused shared-runtime/session tests

**Interfaces:**

Add to the protocol-v2 attach request:

```ts
workspaceRoots: readonly string[];
```

Add to each tool context:

```ts
workspacePolicy: SessionWorkspacePolicy;
```

Root source:

```text
SATORI_SESSION_ROOTS_JSON, when present
otherwise [process.cwd()]
```

`SATORI_SESSION_ROOTS_JSON` must be a JSON array of 1–16 absolute strings. Total serialized root bytes must stay inside the existing handshake limit.

**Required behavior:**

- The launcher captures roots before connecting.
- The host validates shape only, then constructs `SessionWorkspacePolicy`.
- `SharedRuntimeHost.createSession` receives a policy unique to that session.
- Direct stdio/non-shared sessions construct the same policy from the same environment rule.
- Tool arguments cannot replace or append roots.
- Invalid or broad roots cause session startup/attach rejection with a stable message.

- [ ] **Step 1: Write failing tests**

```ts
test("two sessions may have different immutable workspace policies")
test("tool context receives the session policy")
test("invalid JSON roots reject startup")
test("more than 16 roots rejects the attach request")
test("tool arguments cannot expand the session roots")
test("direct stdio and shared runtime resolve roots identically")
```

- [ ] **Step 2: Run focused tests**

```bash
pnpm --filter @zokizuan/satori-mcp test -- shared-runtime
pnpm --filter @zokizuan/satori-mcp test -- start-server
```

- [ ] **Step 3: Implement the plumbing**

Do not enforce any tool decision in this task. Only make the immutable policy available.

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @zokizuan/satori-mcp test -- shared-runtime
pnpm --filter @zokizuan/satori-mcp test -- start-server
pnpm --filter @zokizuan/satori-mcp typecheck
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/server packages/mcp/src/tools/types.ts
git commit -m "feat(runtime): bind workspace roots to each MCP session"
```

---

### Task 4: Gate Index Lifecycle and Codebase Listing

**Agent size:** small tool-boundary change.

**Dependencies:** Task 3.

**Files:**
- Modify: `packages/mcp/src/tools/manage_index.ts`
- Modify: `packages/mcp/src/tools/list_codebases.ts`
- Modify: focused tests for both tools

**Produces:**

Structured denial:

```ts
{
    status: "error",
    reason: "root_not_authorized",
    code: "ROOT_NOT_AUTHORIZED",
    path: string,
    message: string
}
```

**Required behavior:**

- `create`, `reindex`, `sync`, `repair`, and `clear` require the path to be inside the session workspace policy.
- `status` also requires authorization; do not use it to probe arbitrary filesystem paths.
- `list_codebases` returns only roots authorized for the current session.
- The denial occurs before provider startup, filesystem existence checks, vector operations, mutation leases, or snapshot mutation.
- A requested sub-repository under an authorized workspace is allowed.
- `/`, home, state root, sibling workspaces, and symlink aliases escaping the workspace are denied.

- [ ] **Step 1: Write failing tests**

Include:

```ts
test("manage_index rejects an unauthorized path before provider resolution")
test("manage_index allows a repository below an authorized workspace")
test("manage_index status cannot probe an unauthorized path")
test("list_codebases filters roots outside session authority")
test("symlinked root escape is denied")
```

- [ ] **Step 2: Run tests and verify failure**

```bash
pnpm --filter @zokizuan/satori-mcp test -- manage_index
pnpm --filter @zokizuan/satori-mcp test -- list_codebases
```

- [ ] **Step 3: Add the policy gate**

Call `ctx.workspacePolicy.authorizeRoot(...)` immediately after schema validation and before selecting a provider context.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @zokizuan/satori-mcp test -- manage_index
pnpm --filter @zokizuan/satori-mcp test -- list_codebases
pnpm --filter @zokizuan/satori-mcp typecheck
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/tools/manage_index.ts \
        packages/mcp/src/tools/list_codebases.ts \
        packages/mcp/src/tools/*manage*test.ts \
        packages/mcp/src/tools/*list*test.ts
git commit -m "fix(security): gate index lifecycle by session workspace"
```

**Do not touch:** index internals or mutation-lease logic.

---

### Task 5: Add Publication-Authorized File Opening

**Agent size:** small security primitive.

**Dependencies:** Tasks 1 and 3.

**Files:**
- Create: `packages/mcp/src/core/published-file-authorization.ts`
- Create: `packages/mcp/src/core/published-file-authorization.test.ts`
- Modify: `packages/core/src/index.ts` only if the required root-bound functions are not already exported

**Consumes:**

Existing Core primitives:

```ts
openRegularFileWithIdentityInsideRoot(...)
verifyStableFileObservation(...)
```

**Produces:**

```ts
export type AuthorizedPublishedFile = Readonly<{
    handle: import("node:fs/promises").FileHandle;
    codebaseRoot: string;
    absolutePath: string;
    relativePath: string;
    observedStat: import("node:fs").Stats;
    identity: import("@zokizuan/satori-core").RootBoundFileIdentity;
}>;

export async function openAuthorizedPublishedFile(input: {
    workspacePolicy: SessionWorkspacePolicy;
    codebaseRoot: string;
    requestedPath: string;
    publishedRelativePaths: ReadonlySet<string>;
}): Promise<AuthorizedPublishedFile>;
```

**Required behavior:**

- Workspace policy must authorize both root and requested path.
- Requested path must resolve under the canonical codebase root.
- The relative path must be present in `publishedRelativePaths`.
- Open through the Core descriptor-bound primitive.
- Reject final symlinks, intermediate symlink escape, directories, FIFOs, sockets, devices, and unpublished/ignored files.
- Caller owns closing the returned handle.
- No file content is read in this helper.

- [ ] **Step 1: Write failing tests**

Cover:

```ts
test("opens a published regular file")
test("rejects an ignored or unpublished file")
test("rejects a symlink to an outside file")
test("rejects a symlink to an inside file")
test("rejects a FIFO or directory")
test("detects path replacement between authorization and verification")
```

- [ ] **Step 2: Run focused tests**

```bash
pnpm --filter @zokizuan/satori-mcp test -- published-file-authorization
```

- [ ] **Step 3: Implement the helper**

Do not duplicate `O_NOFOLLOW`, inode, or descriptor logic already owned by Core.

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @zokizuan/satori-core build
pnpm --filter @zokizuan/satori-mcp test -- published-file-authorization
pnpm --filter @zokizuan/satori-mcp typecheck
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/core/published-file-authorization.* packages/core/src/index.ts
git commit -m "feat(security): authorize reads against published source files"
```

---

### Task 6: Harden `read_file`

**Agent size:** small-to-medium, one public tool.

**Dependencies:** Tasks 4 and 5.

**Files:**
- Modify: `packages/mcp/src/tools/read_file.ts`
- Modify: `packages/mcp/src/tools/read_file.test.ts`
- Modify: MCP config/type files only if needed to expose `READ_FILE_MAX_BYTES`

**Configuration:**

```text
READ_FILE_MAX_BYTES
default: 8388608
minimum: 65536
maximum: 67108864
```

**Required behavior:**

- Resolve the containing indexed root only from roots visible to this session.
- Obtain the published relative-path set from current publication authority.
- Call `openAuthorizedPublishedFile`.
- Check `observedStat.size <= READ_FILE_MAX_BYTES` before allocating a whole-file buffer.
- Read from the authorized descriptor, not by reopening the pathname with `fs.readFileSync`.
- Verify the stable descriptor/path observation after reading and before returning content.
- Preserve existing response formats, line selection, compact/full presentation, and symbol-context behavior.
- Return a structured denial for unpublished, ignored, oversized, special, replaced, or escaped files.
- Do not weaken indexing/not-ready behavior.

- [ ] **Step 1: Write failing tests**

```ts
test("read_file rejects a file absent from the published path set")
test("read_file rejects an ignored .env file even under an indexed root")
test("read_file rejects an outside symlink")
test("read_file rejects a file above READ_FILE_MAX_BYTES before reading")
test("read_file reads through the authorized descriptor")
test("read_file detects replacement during the read")
test("existing compact and full presentations remain byte-compatible")
```

- [ ] **Step 2: Run the tests**

```bash
pnpm --filter @zokizuan/satori-mcp test -- read_file
```

- [ ] **Step 3: Implement the minimal integration**

Do not add streaming line-range optimization in this task. The hard pre-read cap is the immediate availability boundary.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @zokizuan/satori-mcp test -- read_file
pnpm --filter @zokizuan/satori-mcp typecheck
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/tools/read_file.ts packages/mcp/src/tools/read_file.test.ts
git commit -m "fix(security): bind read_file to published source authority"
```

---

### Task 7: Harden `file_outline` and Source-Backed Call-Graph Reads

**Agent size:** medium-small navigation boundary change.

**Dependencies:** Tasks 4 and 5.

**Files:**
- Modify: `packages/mcp/src/core/navigation-handlers.ts`
- Modify: `packages/mcp/src/core/relationship-backed-call-graph.ts` only where source fallback opens files
- Modify: `packages/mcp/src/core/handlers.call_graph.test.ts`
- Modify: focused navigation-handler tests

**Required behavior:**

- Remove lexical-only `path.resolve`/`path.relative` authorization as the security decision.
- Before any `stat`, analysis read, or source-backed fallback, call the shared publication-authorized helper.
- Read from the returned descriptor.
- A file missing from current publication authority returns `not_found`, `requires_reindex`, or `source_state_unverified` according to the existing contract—never raw content.
- An outside symlink is denied even if the lexical path is under the repository.
- A path replaced after registry/hash validation fails closed.
- Existing exact-symbol, freshness, and relationship response schemas remain unchanged except for stable denial reasons.

- [ ] **Step 1: Write failing tests**

```ts
test("file_outline rejects an outside symlink before structural analysis")
test("file_outline rejects an unpublished file")
test("Python analysis reads the authorized descriptor")
test("call_graph source fallback rejects an outside symlink")
test("path replacement returns source_state_unverified")
test("ordinary published files retain existing outlines and graph results")
```

- [ ] **Step 2: Run focused tests**

```bash
pnpm --filter @zokizuan/satori-mcp test -- navigation-handlers
pnpm --filter @zokizuan/satori-mcp test -- handlers.call_graph
```

- [ ] **Step 3: Implement shared authorization use**

Do not add a second realpath helper in navigation code.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @zokizuan/satori-mcp test -- navigation-handlers
pnpm --filter @zokizuan/satori-mcp test -- handlers.call_graph
pnpm --filter @zokizuan/satori-mcp typecheck
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/core/navigation-handlers.ts \
        packages/mcp/src/core/relationship-backed-call-graph.ts \
        packages/mcp/src/core/*navigation*test.ts \
        packages/mcp/src/core/handlers.call_graph.test.ts
git commit -m "fix(security): use publication-bound navigation reads"
```

---

### Task 8: Resolve Same-Module Python Constructor Callers

**Agent size:** small Core relationship task.

**Files:**
- Modify: `packages/core/src/relationships/builder.ts`
- Modify: `packages/core/src/relationships/builder.test.ts`

**Produces:**

A same-module direct constructor edge only when the target class identity is unique and exact.

**Required behavior:**

For a Python direct call such as:

```py
class TradingEntryVetoes:
    pass

def run():
    TradingEntryVetoes()
```

emit one low-confidence `CALLS` edge from `run` to the exact class when:

- source and target are in the same file,
- call name exactly equals class name,
- exactly one eligible class symbol matches,
- no local binding shadows that class name,
- the target is not ambiguous.

Continue to emit no edge for ambiguous, shadowed, dynamic, or unresolved cases.

- [ ] **Step 1: Replace the documented limitation test**

The existing test asserting no edge must become a failing positive test:

```ts
test("buildCallRelationshipsForRegistry resolves one exact same-module constructor")
```

Add:

```ts
test("fails closed when two same-module classes are ambiguous")
test("does not treat a shadowing local variable as the class constructor")
test("mixed same-module and cross-module callers both appear")
```

- [ ] **Step 2: Run focused tests**

```bash
pnpm --filter @zokizuan/satori-core test -- relationships/builder
```

Expected: the new positive test fails.

- [ ] **Step 3: Implement the exact same-module resolver**

Use registry identity and module analysis. Do not globally match by basename or class name.

- [ ] **Step 4: Run Core tests**

```bash
pnpm --filter @zokizuan/satori-core test -- relationships/builder
pnpm --filter @zokizuan/satori-core typecheck
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/relationships/builder.ts \
        packages/core/src/relationships/builder.test.ts
git commit -m "fix(python): resolve exact same-module constructor callers"
```

---

### Task 9: Add a Shared Bounded HTTP Utility

**Agent size:** small Core utility.

**Files:**
- Create: `packages/core/src/net/fetch-with-deadline.ts`
- Create: `packages/core/src/net/fetch-with-deadline.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

```ts
export type HttpFailureKind =
    | "timeout"
    | "transient_http"
    | "permanent_http"
    | "network"
    | "invalid_response"
    | "response_too_large";

export class BoundedHttpError extends Error {
    readonly kind: HttpFailureKind;
    readonly status: number | null;
    readonly attempts: number;
}

export async function fetchWithDeadline(input: {
    url: string;
    init: RequestInit;
    signal?: AbortSignal;
    attemptTimeoutMs: number;
    maxAttempts: number;
    retryDelayMs: number;
    maxResponseBytes: number;
    retryableStatuses: ReadonlySet<number>;
    retryableNetworkCodes: ReadonlySet<string>;
}): Promise<Response>;
```

**Required behavior:**

- Deadline covers headers and body consumption helpers.
- Caller cancellation is never wrapped or retried.
- Retry count is bounded.
- Response body limits are enforceable without unbounded buffering.
- Permanent 4xx does not retry unless explicitly listed.
- Default adapter policies will be supplied by later tasks; this utility has no provider-specific constants.

- [ ] **Step 1: Write failing tests**

```ts
test("times out a hung request")
test("retries one listed transient status")
test("does not retry an unlisted 401")
test("does not retry caller cancellation")
test("rejects a response body above the byte limit")
test("preserves response status and headers on success")
```

- [ ] **Step 2: Run focused tests**

```bash
pnpm --filter @zokizuan/satori-core test -- fetch-with-deadline
```

- [ ] **Step 3: Implement**

Reuse the cancellation/retry discipline already established in `voyageai-reranker.ts`; do not copy provider-specific logging.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @zokizuan/satori-core test -- fetch-with-deadline
pnpm --filter @zokizuan/satori-core typecheck
git diff --check
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/net packages/core/src/index.ts
git commit -m "feat(core): add bounded HTTP request utility"
```

---

### Task 10A: Apply HTTP Deadlines to Milvus REST

**Agent size:** small adapter task.

**Dependency:** Task 9.

**Files:**
- Modify: `packages/core/src/vectordb/milvus-restful-vectordb.ts`
- Create or modify: focused Milvus REST tests

**Policy:**

```ts
attemptTimeoutMs: 30_000
maxAttempts: 2
retryDelayMs: 250
maxResponseBytes: 8 * 1024 * 1024
retryableStatuses: 408, 425, 429, 500–599
retryableNetworkCodes: ETIMEDOUT, ECONNRESET, EAI_AGAIN
```

**Required behavior:**

- Replace raw `fetch`.
- Preserve current request and response mapping.
- Do not retry create/drop mutations unless the operation is proven idempotent. For non-idempotent endpoints, set `maxAttempts: 1`.
- Search, query, load-state, and describe-style reads may use the bounded retry policy.
- Map `BoundedHttpError` through existing backend diagnostics.

- [ ] **Step 1: Write failing tests**

```ts
test("Milvus search times out")
test("Milvus read retries one 503")
test("Milvus create does not retry after an ambiguous network failure")
test("Milvus rejects an oversized JSON response")
```

- [ ] **Step 2: Run, implement, and rerun**

```bash
pnpm --filter @zokizuan/satori-core test -- milvus-restful
pnpm --filter @zokizuan/satori-core typecheck
git diff --check
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/vectordb/milvus-restful-vectordb.ts \
        packages/core/src/vectordb/*milvus*test.ts
git commit -m "fix(milvus): bound REST request latency and response size"
```

---

### Task 10B: Apply HTTP Deadlines to Zilliz Management

**Agent size:** small adapter task.

**Dependency:** Task 9.

**Files:**
- Modify: `packages/core/src/vectordb/zilliz-utils.ts`
- Create or modify: focused Zilliz tests

**Policy:**

Use the same read policy as Task 10A. Creation calls are not automatically retried.

**Required behavior:**

- Bound every individual API request.
- Existing outer cluster-readiness polling retains its overall five-minute deadline.
- A single `describeCluster` call cannot consume the whole outer deadline.
- Caller cancellation stops polling and request retries.
- Error messages preserve provider context without logging tokens.

- [ ] **Step 1: Write failing tests**

```ts
test("listProjects times out")
test("describeCluster retries one transient failure")
test("createFreeCluster does not duplicate the create request")
test("polling cancellation stops future describe calls")
test("oversized management response is rejected")
```

- [ ] **Step 2: Run, implement, and rerun**

```bash
pnpm --filter @zokizuan/satori-core test -- zilliz-utils
pnpm --filter @zokizuan/satori-core typecheck
git diff --check
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/vectordb/zilliz-utils.ts \
        packages/core/src/vectordb/*zilliz*test.ts
git commit -m "fix(zilliz): bound management API requests"
```

---

### Task 11: Prevent Stale Findings from Becoming Current Reports

**Agent size:** small audit-tooling task.

**Files:**
- Create: `scripts/check-piolium-findings.mjs`
- Create: `scripts/check-piolium-findings.test.mjs`
- Modify: root `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `piolium/findings/*/draft.md` front matter only as needed

**Required front matter:**

```yaml
status: open | mitigated | fixed | accepted
introduced_at: "<sha>"
verified_at: "<sha>"
fixed_in: "<sha or empty>"
fix_verified_at: "<sha or empty>"
poc_kind: theoretical | executed
```

**Validation rules:**

- `executed` requires a referenced PoC file and evidence log that exist.
- `fixed` requires `fixed_in` and `fix_verified_at`.
- If `fixed_in` is an ancestor of audited `HEAD`, a finding cannot render as open.
- If `verified_at` is not an ancestor of audited `HEAD`, the report must label it historical/unverified, not current.
- A source document at the audited commit containing a fix commit/message is not enough by itself; ancestry must be checked.
- Duplicate IDs fail.
- Unknown status values fail.
- CI runs the validator before report generation.
- Re-enable the existing lint command in CI unless the baseline proves unrelated lint debt; if debt exists, add a separate explicit lint-debt receipt rather than silently keeping lint disabled.

**CLI:**

```bash
node scripts/check-piolium-findings.mjs --head HEAD --root piolium/findings
```

Exit `0` only when every finding is internally consistent.

- [ ] **Step 1: Write failing fixture tests**

Fixtures must cover:

```text
open finding whose fixed_in is an ancestor
executed PoC with missing evidence
fixed finding without fix_verified_at
historical verified_at not ancestral to HEAD
valid open finding
valid fixed finding
duplicate ID
```

- [ ] **Step 2: Run tests and verify failure**

```bash
node --test scripts/check-piolium-findings.test.mjs
```

- [ ] **Step 3: Implement the validator**

Use `git merge-base --is-ancestor` via `execFileSync`; never parse human-formatted `git log`.

- [ ] **Step 4: Correct current front matter**

Mark W1, W2, W4, and W7 according to the baseline receipt. Do not rewrite technical prose in this task.

- [ ] **Step 5: Add package and CI gates**

Add:

```json
"findings:check": "node scripts/check-piolium-findings.mjs --head HEAD --root piolium/findings"
```

CI must run:

```bash
pnpm run findings:check
```

- [ ] **Step 6: Run verification**

```bash
node --test scripts/check-piolium-findings.test.mjs
pnpm run findings:check
pnpm lint
git diff --check
```

- [ ] **Step 7: Commit**

```bash
git add scripts/check-piolium-findings* package.json .github/workflows/ci.yml piolium/findings
git commit -m "fix(audit): validate finding status against commit ancestry"
```

---

## Integration Gate

After all selected tasks are merged into one integration worktree, run:

```bash
pnpm --filter @zokizuan/satori-core typecheck
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-mcp typecheck
pnpm --filter @zokizuan/satori-mcp test
pnpm --filter @zokizuan/satori-cli test
pnpm run versions:check
pnpm run release:check
pnpm run findings:check
pnpm lint
git diff --check
```

Then run the specific security scenarios:

```text
unauthorized /
unauthorized home directory
unauthorized sibling workspace
authorized nested repository
outside symlink
inside symlink
ignored .env
unpublished regular file
oversized regular file
path replacement during read
two shared sessions with different workspace roots
same-module Python constructor caller
hung Milvus REST response
hung Zilliz management response
```

Every denial must be structured, deterministic, and occur before secret content or provider mutation.

## Recommended Dispatch Order

1. Dispatch Task 0 alone.
2. In parallel, dispatch Tasks 1, 8, 9, and 11.
3. Dispatch Task 2.
4. Dispatch Task 3 after Tasks 1 and 2 pass review.
5. In parallel, dispatch Tasks 4 and 5.
6. In parallel, dispatch Tasks 6 and 7 after Tasks 4 and 5 merge.
7. In parallel, dispatch Tasks 10A and 10B after Task 9 merges.
8. Run the integration gate in a fresh worktree.
