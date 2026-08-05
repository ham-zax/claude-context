# Overall verdict

The report is **not reliable as a current-state audit of commit `7c961512…`**.

It claims that the named commit contains **7 active findings: 2 High and 5 Medium**.  But the W1–W7 verification document that fed the report explicitly says it reviewed the much earlier revision `403723ee…`, before the remediation work.  The later commit `7c961512…` already contains most of those fixes—including the final call-graph evidence correction.

The audit pipeline appears to have taken old finding drafts, attached the new repository commit to the report header, and failed to check whether each fix commit was already an ancestor of the audited revision. The W1 draft at the audited commit even contains `fix_commit: "fix(search): add bounded must-constrained retrieval"` while still classifying W1 as an active High finding.

## Corrected current-state assessment

At `7c961512…`, the defensible result is approximately:

* **0 open High findings as written in the report**
* **1 material open Medium filesystem/workspace-authorization issue**
* **1 Low-to-Medium shared-runtime protocol/authentication issue**
* **1 remaining Medium product-integrity limitation in Python call graphs**
* **4 report findings already fixed**
* **2 additional availability/hardening issues that the report missed**

For trusted, personal, local use, the repository is in much better condition than the report suggests. For autonomous agents operating on untrusted repositories, I would **block release until the workspace/file-read authorization problem is fixed**.

---

# Finding-by-finding review

| Finding                           | Report status    | Actual status at `7c961512…`                                                           | Verdict                                  |
| --------------------------------- | ---------------- | -------------------------------------------------------------------------------------- | ---------------------------------------- |
| **M1 socket authentication**      | Medium, executed | The token really is unused, but the stated threat model and proposed fix are flawed    | **Open, rewrite and probably downgrade** |
| **M2 arbitrary file reads**       | Medium, executed | Arbitrary root authorization is real; the claimed `read_file` symlink escape is not    | **Open, split into two findings**        |
| **W1 `must:` retrieval**          | High             | Dedicated bounded conjunctive retrieval and explicit incompleteness warnings now exist | **Fixed**                                |
| **W4 untracked freshness**        | High             | Untracked files are now included through porcelain-v1 `-z --untracked-files=all`       | **Fixed**                                |
| **W2 reranker timeout**           | Medium           | Timeout, retry classification, cancellation and telemetry now exist                    | **Fixed**                                |
| **W3 inbound call graph**         | Medium           | Evidence and cross-module constructors fixed; narrower same-module gap remains         | **Partially fixed**                      |
| **W7 continuation observability** | Medium           | Explicit total/returned counts and `not_admissible` state now exist                    | **Fixed**                                |

---

## M1 — Shared-runtime authentication

### What is genuinely wrong

The host creates an `ownershipToken`, writes it to `host.json`, and never uses it during session attachment. The incoming `launcherNonce` is checked only for a 48-character hexadecimal format. After the runtime identity fields match, the host accepts the connection and simply echoes the nonce.

The client independently generates that nonce and checks that it is echoed, but it never reads or proves possession of `ownershipToken`.  The metadata parser and writer preserve the token with mode `0600`, confirming that it is effectively a dead authentication field.

So there is unquestionably an unfinished or broken protocol invariant.

### Where the report is wrong

The recommended fix—“compare `request.launcherNonce` with `this.ownershipToken`”—cannot be applied literally:

* `launcherNonce` is 48 hexadecimal characters.
* `ownershipToken` is a UUID with a different format and length.
* A direct comparison would reject every legitimate client.

More importantly, the report's attacker is “a same-UID process that can read `host.json`.” But `ownershipToken` is stored in that same file, and mode `0600` intentionally lets any process running as that user read it. Therefore, merely transmitting or HMACing with the metadata token would **not stop the attacker described by the report**.

There is also limited incremental confidentiality impact in a normal desktop threat model. A fully malicious same-UID process can ordinarily read the user's files and modify `~/.satori` directly. Additionally, this shared runtime is enabled only for Linux x64 with the offline Potion/LanceDB profile, narrowing the affected configuration.

### Correct treatment

First decide which boundary Satori intends to defend:

1. **Other OS users are untrusted, but all same-UID processes are trusted:** the `0700` directories and `0600` socket already implement the principal boundary. Rename the nonce as a correlation/replay value, remove misleading “ownership authentication” claims, and document the same-UID trust model.

2. **Same-UID processes are also untrusted:** the authentication secret cannot be stored in same-UID-readable metadata. Use a per-launcher capability delivered through an inherited file descriptor or private broker channel, mutual process authentication, or run the shared host under a separate OS identity/sandbox. Authentication must cover both directions so a fake same-UID socket cannot impersonate the host.

I would rate this **Low in the ordinary single-user desktop model, Medium only where same-UID sandbox co-tenancy is explicitly supported**.

---

## M2 — Arbitrary file reads

This report combines two different mechanisms. They need to be separated.

### M2-A: Arbitrary root registration and root-wide file authorization — real

`manage_index` accepts any absolute path. Its schema does not have a workspace allowlist, and the handler checks only that the canonical path exists and is a directory before beginning lifecycle operations.

Once a path is recorded as `indexed` or `sync_completed`, `read_file` treats that whole canonical directory tree as authorized. It does **not** require the requested file to be:

* present in the published source checkpoint,
* included by the index extension policy,
* absent from `.satoriignore`,
* part of the index manifest,
* or an ordinary source file.

The authorization decision is essentially:

```text
canonical file is under canonical indexed root
AND root status is indexed/sync_completed
```

Only after this does it read the file.

Therefore, the real finding is:

> An MCP client can turn an arbitrary directory into a file-read authorization domain by indexing it, then read regular files below that directory regardless of whether those files belong to the index.

This is significant in Satori's actual usage model. A prompt-injected repository may convince an autonomous agent to index the user's home directory, `.ssh`, `.aws`, another project, or another sensitive directory. The malicious repository does not need direct filesystem access; it abuses the agent's authorized MCP tool.

This is the strongest finding in the report and should remain **Medium for interactive local-agent use**, potentially **High for unattended autonomous-agent deployments**.

### M2-B: Static symlink escape through `read_file` — not valid

The report says a repository symlink can escape the root through `read_file`. Current source contradicts that.

`read_file` resolves both target and roots using `fs.realpathSync.native`, then requires the resolved target to remain inside the resolved root. A symlink from an indexed root to `~/.ssh/id_ed25519` resolves outside the root and is rejected.

The report itself indirectly admits this by saying that the “realpath-based check used by `read_file` itself rejects the same path.” The final impact statement nevertheless continues to claim leakage “through `file_outline`/`read_file`.” That is internally inconsistent.

### `file_outline` and `call_graph`

`file_outline` does use a lexical `path.resolve`/`path.relative` boundary and follows symlinks through `statSync` and, for Python analysis, `readFileSync`.  That inconsistency should be corrected.

However, the report does not establish that a static malicious symlink returns arbitrary raw bytes through the public tool:

* `file_outline` requires a current indexed symbol registry for that path.
* It verifies the current file against the registry's file hash.
* The raw read occurs only for Python structural analysis after exact-symbol resolution.
* The output is structural analysis, not unrestricted raw source.
* A symlink skipped by the indexer would normally have no registry symbols.

There may still be a theoretical TOCTOU race or indirect structural-data leak, but the cited demonstration appears to prove that `fs.readFileSync` follows a symlink—not that a normal public MCP request leaks a secret. That is not the same thing.

### Correct fix

Introduce one server-side authorization service:

```text
Authorized root:
    canonical root is explicitly approved by the launcher/user

Authorized file:
    canonical file is under that approved root
    AND relative path belongs to the published searchable-file manifest
    AND current index policy permits the path
```

Then:

* Reject `/`, the user's home directory, Satori's own state directory and known secret directories by default.
* Require a one-time user approval token for `create`, `reindex`, `clear` and root expansion.
* Make `manage_index status` and `list_codebases` freely available, but gate mutations.
* Authorize `read_file` against the published checkpoint or tracked-file manifest—not merely the root.
* Apply the same canonical boundary helper to `read_file`, `file_outline` and `call_graph`.
* Reject symlinks and non-regular files at open time.
* Use descriptor-bound opening with `O_NOFOLLOW` and post-open `fstat` validation.

The repository already has a much stronger implementation in `root-bound-fs.ts`: realpath confinement, `O_NOFOLLOW`, pre/post inode checks, descriptor verification and root-bound identity.  The safest correction is to reuse that primitive rather than invent another path check.

---

## W1 — `must:` retrieval

This is fixed at the audited revision.

Current search execution includes a dedicated bounded lexical lane for `must:` constraints using conjunctive `all_terms` matching. It merges the results into the normal candidate set, re-runs the ordinary evaluator and explicitly records whether the lane was attempted, unsupported, failed or exhausted. It emits warnings such as:

* `MUST_NOT_SATISFIED_WITHIN_RETRIEVAL_BUDGET`
* `MUST_RESULTS_MAY_BE_INCOMPLETE_WITHIN_RETRIEVAL_BUDGET`
* `MUST_CONJUNCTIVE_RETRIEVAL_UNAVAILABLE`

A later correction also made the vector-backend lexical contract explicitly support or reject `all_terms` rather than silently degrading it.

A bounded search can still miss matches beyond its budget, but that is now disclosed. The original High finding was specifically about a **silent** post-retrieval omission. That condition no longer exists.

**Status: closed.**

---

## W4 — Untracked-file freshness

This is also fixed.

The current implementation runs:

```text
git status --porcelain=v1 -z --untracked-files=all
```

and parses untracked files, renames, copies and paths containing spaces or unusual characters.

The corresponding fix also connects untracked paths to the freshness and `live_path` processing lanes. The subsequent dot-prefixed-path correction handles names such as `..config.ts` without treating them as traversal.

There may still be performance considerations when a repository has huge numbers of non-ignored untracked files, but that is not the original invisibility defect.

**Status: closed.**

---

## W2 — VoyageAI reranker reliability

The current source has:

* a 30-second per-attempt timeout,
* at most two attempts,
* 250 ms backoff,
* retry classification for 408/425/429/5xx and selected network failures,
* no retry for permanent failures or invalid responses,
* caller-cancellation propagation,
* failure, retry and timeout diagnostics.

The remediation commit also contains focused tests for transient success, terminal 503, permanent 401, hung-request timeout, retryable network errors, invalid responses and cancellation.

The report's statement that the code is a raw unbounded `fetch` and has no failure telemetry is false for the audited commit.

**Status: closed.**

---

## W3 — Inbound call-graph coverage

This one is **partially fixed**, not fully closed.

### Fixed portions

Empty inbound results now carry structured `InboundCoverageEvidence` containing:

* `no_relationships_extracted`
* `suppressed_low_confidence`
* `fallback_failed`
* retrieved and suppressed counts
* fallback attempt/recovery counts
* whether Python constructor resolution is applicable

When no inbound edge is available, the response includes `CALL_GRAPH_INBOUND_COVERAGE_PARTIAL` plus a deterministic `must:` search next step instead of implying that no callers exist.

Cross-module Python constructor calls are also resolved for:

* direct imports,
* imported aliases,
* module aliases,
* plain qualified module access,

while ambiguity still fails closed.

### Remaining defect

The exact head commit explicitly documents that **same-module bare Python constructor calls still emit no `CALLS` edge**. It also documents the more important consequence:

> If a class has one recovered cross-module caller and one omitted same-module caller, the graph is non-empty, so no partial-coverage evidence is attached even though the result remains incomplete.

That residual should be rewritten as:

> Python same-module constructor callers are omitted, and non-empty but incomplete inbound graphs do not always disclose partial coverage.

That is a legitimate **Medium product-integrity limitation**, especially for blast-radius analysis. It is not accurately described by the report's older W3 mechanism.

---

## W7 — Continuation observability

This is fixed.

The public response type now defines:

```ts
interface SearchPaginationEvidence {
    totalGroupCount: number;
    returnedGroupCount: number;
    continuation: "complete" | "attached" | "not_admissible";
}
```

When continuation storage rejects the ranked set, the handler removes the unusable handle but explicitly returns:

* the total frozen group count,
* the returned group count,
* `continuation: "not_admissible"`,
* and the warning.

The report's statement that the path discloses neither total nor returned groups is false at the audited commit.

**Status: closed.**

---

# Additional issues the report missed

## A1 — `read_file` reads the entire file synchronously before applying ranges

Even when the caller asks for a small line range, the implementation:

1. obtains the file size,
2. calls `fs.readFileSync(absolutePath)` for the complete file,
3. converts the complete buffer to UTF-8,
4. splits the complete content into lines,
5. only then selects the requested range.

There is no pre-read maximum-byte check. `READ_FILE_MAX_LINES` controls presentation, not the amount read into memory.

A large file, sparse file or unusual pseudo-file under an authorized broad root can block the shared runtime or exhaust memory. This combines especially badly with M2-A.

**Recommended severity:** Medium availability in autonomous-agent deployments.

**Correction:**

* Reject files above a configurable hard byte ceiling.
* Reject devices, FIFOs, sockets and pseudo-files.
* Read only the requested byte/range through a descriptor.
* Use the existing root-bound descriptor helper.
* Apply a separate bounded maximum even when both `start_line` and `end_line` are provided.

---

## A2 — The reranker was bounded, but other REST clients are still unbounded

The Milvus REST adapter performs raw `fetch` calls without `AbortSignal`, timeout or retry control.  The Zilliz management client has the same basic unbounded request pattern.

Therefore, the general external-dependency reliability problem was fixed only for VoyageAI reranking. A stalled connected vector backend can still block index or search operations.

Create a shared `fetchWithDeadline` utility with:

* caller cancellation,
* per-attempt deadline,
* bounded retry classes,
* response-body byte limits,
* structured diagnostics.

**Recommended severity:** Medium reliability for connected Milvus/Zilliz deployments.

---

## A3 — CI and security assurance gaps

The repository has a solid CI matrix:

* Ubuntu and Windows builds,
* Node 22.13, 24 and 26,
* core integration tests,
* core/MCP/CLI unit tests,
* package graph and generated-document checks.

However, the lint step is commented out. There is also no visible CodeQL, dependency-review or secret-scanning job in the primary workflow.

The audit's secret conclusion is weak because it explicitly fell back to regex grep instead of a history-aware scanner. A current checkout grep cannot rule out:

* secrets in Git history,
* deleted files,
* generated release tarballs,
* high-entropy tokens,
* credentials hidden in fixtures or logs.

Add:

* lint as a mandatory CI gate,
* CodeQL,
* dependency review,
* `gitleaks` or equivalent history scanning,
* release-tarball secret inspection,
* pinned GitHub Action commit SHAs.

There is also a small documentation inconsistency: `SECURITY.md` says fixes target the current `main` branch, while the repository's default branch is `master`. The security policy otherwise correctly treats repository-boundary reads and destructive lifecycle behavior without explicit user intent as in scope.

---

# Repository architecture assessment

## What is strong

Satori is not a careless repository. Its strongest areas are:

* **Publication and freshness integrity:** completion markers, source checkpoints, fingerprints, prepared authority and fail-closed readiness.
* **Mutation coordination:** root-scoped leases, staged collections and durable operation receipts.
* **Search truthfulness:** candidate-survival evidence, bounded retrieval, explicit warning states and frozen continuation sets.
* **Provider failure handling:** especially the corrected reranker implementation.
* **Source identity infrastructure:** `root-bound-fs.ts` already contains high-quality descriptor-based filesystem protections.
* **Testing depth:** many fixes include focused regression tests and the CI covers multiple OS and Node versions.
* **Conservative call-graph policy:** ambiguous relationships generally fail closed rather than fabricating edges.

The core package, MCP package and CLI package also have relatively clear responsibility boundaries.

## Where the design is fragile

### 1. Security invariants are duplicated

There are at least three filesystem-boundary implementations:

* robust descriptor-bound Core helpers,
* canonical `realpath` checks in `read_file`,
* lexical checks in navigation handlers.

This is exactly how one tool becomes safe while another remains questionable. Filesystem authorization should have one owner and one reusable implementation.

### 2. Indexing and authorization are conflated

“Indexed root” currently means both:

* this directory has a Satori publication,
* and the agent is authorized to read every regular file beneath it.

Those are not equivalent. Publication state is data correctness; workspace approval is an access-control decision.

### 3. Human intent is documented but not enforced

The installed agent instructions say to ask before create, reindex or clear, but the server accepts these calls without a cryptographic or stateful approval. A prompt-injected agent can ignore prose. Server-side capability enforcement is required.

### 4. Large orchestrator files increase regression risk

Search, lifecycle and navigation behavior is concentrated in large handler modules. This has enabled significant functionality, but it also makes it easy for reports, public response contracts and neighboring code paths to drift apart.

### 5. Finding lifecycle is not machine-enforced

Audit drafts can contain a `fix_commit` string and still be rendered as active findings. Finding records need structured fields such as:

```yaml
status: open | mitigated | fixed | accepted
introduced_at: <sha>
verified_at: <sha>
fixed_in: <sha>
fix_verified_at: <sha>
```

The report generator should fail when:

* `fixed_in` is an ancestor of the audited commit but status is still open,
* source line references no longer contain the claimed mechanism,
* an executed PoC artifact is missing,
* or the PoC's tested commit differs from the report commit.

---

# Recommended work order

## P0 — Fix workspace and file authorization

This is the release blocker for autonomous-agent use.

1. Add an explicit canonical workspace allowlist supplied by the launcher or CLI.
2. Do not allow an MCP client to expand that allowlist on its own.
3. Require a one-time approval capability for `create`, `reindex`, `clear` and destructive remote operations.
4. Authorize `read_file` only for paths contained in the published searchable-file/checkpoint manifest.
5. Deny broad roots and secret directories by default.
6. Use descriptor-bound reads with `O_NOFOLLOW`.
7. Add a hard input-file byte ceiling and ranged reading.

Acceptance tests should prove that `/`, the home directory, `.ssh`, `.aws`, `.env` files, ignored files, files absent from the publication, symlinks and special files are rejected.

## P1 — Resolve the shared-runtime trust model

Do not implement a superficial nonce/token comparison.

* Either formally trust every same-UID process and document the socket accordingly,
* or introduce a per-launcher capability unavailable through `host.json`, mutual authentication and process isolation.

Add a real socket-level regression test where a client possesses all public metadata but not the launcher capability.

## P1 — Close the remaining call-graph honesty gap

* Resolve unambiguous same-module Python constructors using exact registry identity.
* Continue to fail closed on ambiguity.
* Attach partial-coverage evidence when extraction is known to be incomplete even if one or more inbound edges were returned.
* Never let “non-empty” imply “complete.”

## P2 — Bound all external HTTP paths

Apply one common timeout/retry/body-limit implementation to Milvus REST, Zilliz management and any future raw `fetch` user.

## P2 — Repair the audit process

Reissue this report with:

* the correct historical baseline for W1–W7,
* fixed status for W1/W2/W4/W7,
* a rewritten residual W3,
* rewritten M1 and M2,
* committed or attached PoC scripts and logs,
* hashes tying every PoC to the exact built artifact,
* separate tables for security vulnerabilities and product correctness/reliability findings.

---

# Final recommendation

**Do not accept the report's “2 High and 5 Medium active findings” conclusion.** It is mainly a stale-baseline consolidation error.

The current repository has already completed most of the search-integrity remediation. The actual priority is narrower:

1. **Block arbitrary root authorization and restrict file reads to explicitly approved, published source files.**
2. **Add byte-bounded, descriptor-bound file access.**
3. **Clarify or redesign the shared-runtime same-UID trust model.**
4. **Close the documented same-module Python caller gap.**
5. **Bound the remaining REST clients and strengthen CI security gates.**

I validated the exact source and commit history, but I could not independently run the repository test suite or retrieve the report's referenced M1/M2 PoC scripts and logs from the named commit. Consequently, M1's code mechanism and M2's arbitrary-root mechanism are source-confirmed; the claimed end-to-end symlink leak through the public navigation tools is **not independently substantiated and is contradicted for `read_file` by its current realpath check**.
