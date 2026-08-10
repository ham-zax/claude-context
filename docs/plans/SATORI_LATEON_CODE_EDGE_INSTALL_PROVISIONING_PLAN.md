# Satori LateOn-Code-edge Install Provisioning — Rev3 Final Implementation Plan

> **For implementation agents:** Execute against the actual repository state.
> Record HEAD, index, and staged/unstaged/untracked state, preserve unrelated
> work, and follow the repository's delegation policy. Checkpoints and commits
> are optional and require explicit authorization. Execute one
> ownership-bounded task at a time and end it with focused verification and
> diff inspection.

**Goal:** Make a successful supported default `satori install` prove that Potion, LanceDB, and LateOn-Code-edge are fully provisioned and executable before the managed launcher becomes active, while preserving cache reuse, explicit no-LateOn modes, and zero model acquisition on the first post-install search.

**Architecture:** Installation has two distinct phases. **Provisioning** may create an inactive immutable runtime candidate and a revision-bound verified model cache, then exercises that candidate through an isolated provider-backed search before any launcher activation. **Integration/activation** applies repository and client configuration mutations under the managed-runtime mutation lock and installs the launcher as the final activation mutation. The post-activation smoke separately proves that first search performs no acquisition.

**Tech Stack:** TypeScript, Node.js 22.13+, pnpm 10, Node test runner, MCP stdio, Potion, LanceDB, LateOn-Code-edge, canonical acquisition manifests, SHA-256, streamed HTTPS downloads, atomic filesystem publication.

## Global Constraints

- Record the actual repository HEAD, index, staged, unstaged, and untracked state at execution time; do not require a clean checkout or reset to a SHA named in this plan.
- Stage or commit only when the current user explicitly authorizes it. Preserve all pre-existing user work.
- Keep model acquisition out of npm `postinstall`, npm package tarballs, and first-query execution.
- Public text says `LateOn-Code-edge` or `LateOn reranker`; `D32` remains internal profile terminology only.
- A default supported install must never silently rewrite the requested reranker to `none`.
- `--reranker none` and connected/Voyage modes must perform zero LateOn acquisition or verification work.
- Artifact identity remains owned by the runtime profile plus acquisition manifest: exact repository, revision, paths, sizes, and SHA-256 digests.
- Do not commit the 71,577,202-byte model closure to Git.
- No source URLs, access tokens, absolute local paths, or response bodies appear in progress or evidence files.
- Progress is written to stderr or the normal CLI renderer only; never to MCP JSON-RPC stdout.
- The previous active launcher remains unchanged until all candidate provisioning, provider readiness, repository profile, and client configuration steps that precede activation succeed.
- Inactive verified runtime/model cache artifacts may remain after a later configuration failure; they are not active and may be reused or pruned by existing retention logic.
- Do not add a new distribution mirror, model npm package, postinstall hook, background model service, or first-query fallback.
- “Complete” means pre-release implementation verification. Post-publication package verification is a separate phase and cannot block source implementation completion.
- Final repository requirement is “no unintended changes remain”; a clean worktree is required only when the executing workflow is authorized to commit every planned file.

---

## 1. Review Disposition

The core decision from the original provisioning proposal remains binding: explicit managed installation owns LateOn-Code-edge acquisition, verification, probing, and activation. The following corrections are incorporated:

| Review finding | Disposition |
|---|---|
| Existing candidate probe lists tools but does not initialize Potion, LanceDB, or LateOn | Confirmed. Add a separate provider-backed pre-activation probe. |
| Progress monotonicity conflicts with retry resets | Confirmed. Separate per-attempt transfer, cumulative network transfer, and verified bytes. |
| Readiness cannot represent Voyage and lacks model resolution/revision | Confirmed. Extend `VerifiedLateOnModel` and use a tagged readiness union. |
| Launcher currently mutates before profile/client files | Confirmed. Launcher becomes the final activation mutation. |
| Real-model smoke has no deterministic byte owner | Confirmed. Add an external hash-verified release fixture cache with an explicit preparation command. |
| Resolver-only concurrency tests miss whole-install locking | Confirmed. Define lock layering and test concurrent `executeInstallCommand()` calls. |
| The prior execution header conflicted with repository policy | Confirmed. Execute against actual repository state; delegation follows repository policy and commits require explicit authorization. |
| First-time installation targets the historical stable runtime root | Confirmed. Every new candidate uses an immutable generation, including the first installation. |
| The existing managed-runtime lock waits synchronously | Do not copy it for model provisioning. Add an asynchronous revision lock and retain the existing lock only if it safely guards the short, non-awaiting final mutation section. |
| Cache addressing duplicates the manifest revision in a constant | Confirmed. Repository/revision cache and lock identity come from the candidate MCP generation's loaded authority. |
| Fixture and smoke package identity were underspecified | Confirmed. Require explicit packed MCP root/fixture arguments and install the local packed Core/MCP/CLI closure together. |
| Undefined completion receipt | Removed. Existing manifest-bound re-verification is the security authority. |
| Cleanup success message lacks evidence | Confirmed. Add typed cleanup outcome and render only what was observed. |
| Tarball loop and temp variables underspecified | Confirmed. Define exact shell-safe loops and cleanup. |
| Published package requirement creates circularity | Confirmed. Split pre-release and post-publication verification. |

---

## 2. Binding Contracts

### 2.1 Two readiness proofs

These are different tests and neither substitutes for the other.

#### Pre-activation provider readiness

Before launcher activation, the candidate runtime must prove:

```text
candidate MCP process starts
→ Potion helper/model initialize
→ LanceDB opens in an isolated state root
→ LateOn worker reaches ready state
→ a tiny fixture is indexed
→ one non-exact semantic search runs
→ LateOn receives at least two documents and returns a validated ordering
→ candidate process closes cleanly
```

This probe uses the inactive candidate command and an isolated temporary HOME/state root. It must not read or mutate the currently active managed launcher.

#### Post-activation first-search no-acquisition

After launcher activation, with every acquisition network path disabled:

```text
start activated launcher
→ execute one semantic search
→ model resolves from verified cache
→ no fetch/acquisition call occurs
→ search succeeds with the configured reranker
```

This proves first-query readiness, not pre-activation readiness.

### 2.2 Verified model result

```ts
export type LateOnModelResolution = "reused" | "downloaded";

export type VerifiedLateOnModel = Readonly<{
    modelDirectory: string;
    profileId: string;
    runtimeProfileSha256: string;
    repository: "lightonai/LateOn-Code-edge";
    revision: string;
    resolution: LateOnModelResolution;
}>;
```

`resolution` comes from the cache/acquisition owner, never from progress events.

Cache addressing has the same authority owner:

```ts
const authority = readLateOnAcquisitionAuthority(runtimePackageRoot);
const modelDirectory = resolveLateOnModelDirectory(homeDir, {
    repository: authority.repository,
    revision: authority.revision,
});
const revisionLock = await acquireLateOnRevisionLock({
    repository: authority.repository,
    revision: authority.revision,
});
```

`VerifiedLateOnModel.repository`, `VerifiedLateOnModel.revision`, the cache
directory, acquisition URL, and revision-lock key all come from this one loaded
authority. Frozen constants may validate the shipped supported authority, but
must not independently address the runtime cache.

### 2.3 Acquisition progress

```ts
export type LateOnAcquisitionProgress =
    | Readonly<{
        phase: "started";
        artifactCount: number;
        totalExpectedBytes: number;
    }>
    | Readonly<{
        phase: "artifact_attempt_started";
        artifactPath: string;
        artifactIndex: number;
        artifactCount: number;
        artifactAttempt: number;
        artifactSizeBytes: number;
        verifiedBytes: number;
        totalExpectedBytes: number;
        cumulativeNetworkBytes: number;
    }>
    | Readonly<{
        phase: "artifact_attempt_progress";
        artifactPath: string;
        artifactIndex: number;
        artifactCount: number;
        artifactAttempt: number;
        artifactAttemptBytes: number;
        artifactSizeBytes: number;
        verifiedBytes: number;
        totalExpectedBytes: number;
        cumulativeNetworkBytes: number;
    }>
    | Readonly<{
        phase: "artifact_retry_scheduled";
        artifactPath: string;
        completedAttempt: number;
        nextAttempt: number;
        reason: "network" | "retryable_http" | "premature_eof" | "checksum_mismatch";
        verifiedBytes: number;
        totalExpectedBytes: number;
        cumulativeNetworkBytes: number;
    }>
    | Readonly<{
        phase: "artifact_verified";
        artifactPath: string;
        artifactIndex: number;
        artifactCount: number;
        artifactSizeBytes: number;
        verifiedBytes: number;
        totalExpectedBytes: number;
        cumulativeNetworkBytes: number;
    }>
    | Readonly<{
        phase: "completed";
        resolution: LateOnModelResolution;
        verifiedBytes: number;
        totalExpectedBytes: number;
        cumulativeNetworkBytes: number;
    }>;
```

Rules:

- `artifactAttemptBytes` may reset only when `artifactAttempt` increments.
- `verifiedBytes` is monotonic and never exceeds `totalExpectedBytes`; it increases only after an artifact passes size and SHA-256 verification.
- `cumulativeNetworkBytes` is monotonic and may exceed manifest bytes because failed attempts count; it is bounded by the attempt policy and global deadline, not by the manifest total.
- The aggregate progress bar uses `verifiedBytes / totalExpectedBytes`.
- The current-artifact bar uses `artifactAttemptBytes / artifactSizeBytes` and labels retries explicitly.
- Progress events contain artifact relative paths only, never URLs.

### 2.4 Retry policy

```text
maximum attempts per artifact: 3
retryable: network failure, HTTP 408/429/5xx, premature EOF
checksum mismatch: one fresh retry, then fail closed
non-retryable: unsafe URL/redirect, other 4xx, manifest error,
               destination collision with incompatible bytes,
               disk/write error, size exceeds manifest
backoff: 250 ms before attempt 2; 1,000 ms before attempt 3
global acquisition deadline: unchanged manifest-bound 10 minutes
resume/range requests: not implemented
```

Every failed attempt removes its private destination before the next attempt.

### 2.5 Cleanup evidence

```ts
export type LateOnCleanupOutcome =
    | Readonly<{ status: "not_needed" }>
    | Readonly<{ status: "removed" }>
    | Readonly<{ status: "failed"; reason: string }>;

export class LateOnAcquisitionError extends Error {
    readonly cleanup: LateOnCleanupOutcome;
}
```

The failure renderer may print `Temporary staging removed: yes` only for `removed`; it prints `not needed` for `not_needed` and a warning for `failed`.

### 2.6 Install readiness result

```ts
export type InstallRerankerReadiness =
    | Readonly<{
        kind: "LateOn-Code-edge";
        profileId: string;
        repository: "lightonai/LateOn-Code-edge";
        revision: string;
        modelResolution: LateOnModelResolution;
        providerProbe: "passed";
    }>
    | Readonly<{
        kind: "VoyageAI";
        model: string;
        providerProbe: "passed" | "not_run_connected";
    }>
    | Readonly<{
        kind: "none";
        providerProbe: "not_applicable";
    }>;

export type InstallReadinessResult = Readonly<{
    runtimeProfile: "offline" | "connected";
    embeddingProvider: "Potion" | "Ollama" | "VoyageAI";
    vectorStore: "LanceDB" | "Milvus";
    reranker: InstallRerankerReadiness;
    candidateRuntimeVersion: string;
    launcherActivated: boolean;
}>;
```

### 2.7 Transaction boundary

Every newly installed runtime uses an immutable generation directory, including
the first installation. No candidate is installed directly into the historical
stable runtime root.

```text
compatible immutable generation exists
  -> verify and reuse it

otherwise
  -> create a unique generation directory
  -> install the complete MCP/native closure there
  -> record and verify the closure
  -> probe that exact generation
  -> retain that exact path for possible launcher activation
```

The candidate command, MCP package root, Potion paths, closure manifest, and
later launcher all refer to this same immutable generation path. There is no
post-probe rename that would require rebasing absolute runtime paths.

The full install order is:

```text
1. Parse and preflight command.
2. Verify and reuse a compatible immutable runtime generation, or materialize a unique complete generation.
3. Verify the runtime closure and Potion assets in that exact generation.
4. Load LateOn authority from that generation.
5. Resolve or acquire LateOn under the asynchronous revision lock.
6. Reverify the model directory and release the revision lock.
7. Run the provider-backed readiness probe against that exact retained generation.
8. Acquire the short managed-runtime mutation lock.
9. Revalidate profile/client/launcher snapshots.
10. If another identical install converged first, verify and reuse its active generation, discard the redundant inactive generation, and return converged success.
11. Apply repository profile mutation.
12. Apply all client config and companion mutations.
13. Apply the managed launcher as the final activation mutation.
14. Release the mutation lock.
15. Render readiness. Leave any remaining inactive generation to the existing later retention/pruning path.
```

Current partial-file semantics for repository/client mutation failures remain explicit: earlier files may be changed and the command returns `E_INSTALL_PARTIAL`, but the previous launcher remains active because activation is last. A future all-file rollback transaction is out of scope.

### 2.8 Lock layering

```text
LateOn revision lock
  scope: exact repository + revision cache publication
  held during: cache check, download, verification, atomic model publication
  released before: provider probe and managed-runtime mutation lock
  implementation: asynchronous/non-blocking wait; never Atomics.wait/sleepSync

Managed runtime mutation lock
  scope: repository/client/launcher integration and activation
  held during: final shared mutations only
  never held during: model download or provider readiness probe
```

Lock order is strict: no code may acquire the model revision lock while holding the managed-runtime mutation lock.

The existing synchronous managed-runtime lock may remain if it protects only
the short, non-awaiting final mutation section. Modify
`managed-runtime-store.ts` only if its current contract cannot safely satisfy
that boundary; do not replace it speculatively or reuse it for model locking.

Two concurrent identical installs must produce:

```text
one model download
both observe the same verified model revision
both candidate probes may run independently
final activation mutations serialize
identical desired closures converge to success for both callers
typed conflict is reserved for incompatible requested closures
no corrupt or half-published cache/runtime/launcher
```

### 2.9 Real-model release fixture authority

The exact model bytes are external release-fixture data, not repository files.

Environment contract:

```text
SATORI_LATEON_RELEASE_FIXTURE_DIR=/absolute/path/to/verified/LateOn-Code-edge@<revision>
```

Fixture owner:

```bash
pnpm -C packages/cli fixture:lateon:prepare -- \
  --mcp-package-root <absolute-packed-mcp-package-root> \
  --fixture-directory <absolute-fixture-directory>
```

Implementation owner: `packages/cli/scripts/prepare-lateon-release-fixture.ts`.

The script:

1. requires both arguments to be absolute and validates that the MCP root is the explicitly supplied packed candidate;
2. reads that candidate MCP package's frozen runtime profile and acquisition manifest;
3. downloads through the production acquisition implementation into a private fixture staging root beneath the fixture parent;
4. verifies every exact size and SHA-256;
5. atomically publishes the exact requested fixture directory;
6. writes no additional trust receipt—the runtime profile and acquisition manifest remain authority.

CI/release cache key:

```text
lateon-fixture-<revision>-<runtimeProfileSha256>
```

Release smoke behavior:

- If the variable is missing or verification fails, exit with `E_LATEON_RELEASE_FIXTURE_UNAVAILABLE` and do not silently skip.
- Copy or reflink the verified closure into an isolated HOME cache, then reverify it through production code.
- Disable network for the provider-readiness and first-search phases.
- A synthetic model may test acquisition control flow but never satisfies the real provider-readiness gate.

### 2.10 Frozen installation and release-acceptance state machine

```text
record actual repository state
        ↓
resolve install selections
        ↓
materialize/reuse immutable MCP runtime generation
        ↓
verify Potion/runtime closure
        ↓
load LateOn authority from that MCP generation
        ↓
acquire asynchronous LateOn revision lock
        ↓
reuse verified cache OR acquire + verify + atomically publish
        ↓
release revision lock
        ↓
pre-activation provider readiness probe
Potion + isolated LanceDB + real LateOn + deterministic rerank/search
        ↓
retain the exact candidate generation
        ↓
acquire short managed-runtime mutation lock
        ↓
revalidate prepared profile/client state
        ↓
apply repository profile
        ↓
apply client configs / companions
        ↓
activate launcher LAST
        ↓
release mutation lock
        ↓
post-activation first-search smoke with acquisition networking disabled
        ↓
return explicit readiness result
```

This state machine is the implementation contract. Do not begin another
general design-review cycle unless a concrete causal defect is found in it.
The post-activation first-search portion is a release-acceptance smoke, not a
second acquisition or mutation phase inside every user installation.

---

## 3. File Ownership Map

| Responsibility | Primary files |
|---|---|
| Acquisition authority, download, cache, retry, progress, revision lock | `packages/cli/src/lateon-model-store.ts`, `packages/cli/src/lateon-model-store.test.ts` |
| Progress rendering and final readiness output | create `packages/cli/src/install-progress.ts`, create `packages/cli/src/install-progress.test.ts` |
| Candidate MCP/provider readiness probe | `packages/cli/src/install-preflight.ts`, `packages/cli/src/install-preflight.test.ts` |
| Install ordering and full-install concurrency | `packages/cli/src/install.ts`, `packages/cli/src/install.test.ts` |
| Managed-runtime lock behavior | `packages/cli/src/managed-runtime-store.ts`, `packages/cli/src/managed-runtime-store.test.ts` only if the existing short synchronous final-mutation lock requires a contract change |
| Real-model fixture preparation and release smoke | create `packages/cli/scripts/prepare-lateon-release-fixture.ts`, modify `packages/cli/scripts/release-smoke.ts`, tests |
| Public command/docs/naming | `packages/cli/package.json`, `packages/cli/README.md`, root `README.md`, generated docs/help fixtures |
| Final evidence | `docs/evidence/lateon-install-provisioning-<date>/` |

---

## Task 0 — Freeze Current Source and Classify Existing Guarantees

**Files:**
- Create: `docs/evidence/lateon-install-provisioning-baseline-20260810/BASELINE.md`

**Produces:** current HEAD/tree, package versions, current mutation order, current probe depth, acquisition/cache behavior, command-resolution evidence, and exact focused command map.

- [ ] Record `git status --short`, `git rev-parse HEAD`, `git rev-parse HEAD^{tree}`, and package versions.
- [ ] Record the current `probeManagedRuntimeCandidate()` behavior and prove it only initializes MCP/lists tools.
- [ ] Record the current provider-runtime lazy construction boundary.
- [ ] Record the current `applyInstallPlan()` mutation order, including launcher before profile/client mutations.
- [ ] Record `VerifiedLateOnModel` fields and current absence of progress events/retries/revision lock.
- [ ] Record current global mutation lock scope and wait policy.
- [ ] Classify every later task item as `already_proven`, `missing_test`, `behavior_gap`, or `docs_only`.
- [ ] Do not renumber later tasks if a blocker is discovered; add it to a `Task 0 blockers` section and stop before Task 1.
- [ ] Inspect the baseline diff. If a checkpoint is explicitly authorized, use `docs(install): freeze LateOn provisioning baseline`.

---

## Task 1 — Prove Public Command Resolution and Freeze Naming

**Files:**
- Modify: `packages/cli/package.json` only if packed command inference is not deterministic.
- Modify: CLI command/help tests.
- Modify later docs only after packed behavior passes.

**Acceptance:**

```bash
npm exec --yes --cache "$ISOLATED_NPM_CACHE" --package="file:$CLI_TGZ" -- satori --version
npx --yes --cache "$ISOLATED_NPM_CACHE" "file:$CLI_TGZ" --version
```

Both must invoke the intended CLI or docs must use only the unambiguous first form.

- [ ] Create `PACK_ROOT=$(mktemp -d)` and `ISOLATED_NPM_CACHE=$(mktemp -d)`; register shell cleanup with `trap`.
- [ ] Define `CORE_TGZ`, `MCP_TGZ`, and `CLI_TGZ` by reusing the existing `pnpm pack --pack-destination` release-smoke helper/pattern; do not use `npm pack --json` or wildcard assumptions.
- [ ] Inspect every archive with:

```bash
for archive in "$CORE_TGZ" "$MCP_TGZ" "$CLI_TGZ"; do
  tar -tf "$archive" >/dev/null
done
```

- [ ] Add packed command-resolution tests.
- [ ] Freeze public naming tests that reject `LateOn D32` in active help/README/install output while excluding historical evidence, plans, archives, and internal authority IDs.
- [ ] Inspect the focused diff. If a checkpoint is explicitly authorized, use `test(cli): prove install command and LateOn naming`.

---

## Task 2 — Add Model, Progress, Cleanup, and Readiness Data Contracts

**Files:**
- Modify: `packages/cli/src/lateon-model-store.ts`
- Create: `packages/cli/src/install-progress.ts`
- Create tests for both.

**Produces:** the exact types in sections 2.2–2.6.

- [ ] Write RED tests for `VerifiedLateOnModel.repository`, `revision`, and `resolution` on cache reuse and download.
- [ ] Write RED tests proving cache directory and revision-lock identity are derived from the loaded authority repository/revision, while frozen constants only validate the supported shipped authority.
- [ ] Write RED tests proving `verifiedBytes` monotonicity, per-attempt reset only with incremented `artifactAttempt`, and cumulative network monotonicity.
- [ ] Write RED tests for tagged `LateOn-Code-edge`, `VoyageAI`, and `none` readiness results.
- [ ] Write RED tests proving cleanup output cannot claim success without `removed` evidence.
- [ ] Implement only the pure contracts and renderers; do not change download behavior yet.
- [ ] Inspect the focused diff. If a checkpoint is explicitly authorized, use `feat(cli): define LateOn provisioning and readiness contracts`.

---

## Task 3 — Add Bounded Streaming Progress, Retry, and Typed Cleanup

**Files:**
- Modify: `packages/cli/src/lateon-model-store.ts`
- Modify: `packages/cli/src/lateon-model-store.test.ts`
- Modify: `packages/cli/src/install-progress.ts`

- [ ] Add `onProgress?: (event: LateOnAcquisitionProgress) => void` and injectable sleep for tests.
- [ ] Emit progress after each successful chunk write, throttled by renderer rather than downloader.
- [ ] Implement the exact three-attempt retry matrix from section 2.4.
- [ ] Remove a failed destination before retry and start the next attempt with `artifactAttemptBytes=0`.
- [ ] Preserve the manifest-bound global deadline across all retries.
- [ ] Convert terminal failures to `LateOnAcquisitionError` with observed cleanup outcome.
- [ ] Test retryable HTTP/network/EOF, checksum retry then failure, nonretryable size overflow, write failure, deadline, and renderer throttling.
- [ ] Prove cache reuse emits `completed/reused` with zero network calls.
- [ ] Inspect the focused diff. If a checkpoint is explicitly authorized, use `feat(cli): add bounded LateOn acquisition progress and retry`.

---

## Task 4 — Add Revision Lock and Whole-Install Concurrency Semantics

**Files:**
- Modify: `packages/cli/src/lateon-model-store.ts`
- Modify: `packages/cli/src/install.ts`
- Modify their test files.
- Modify: `packages/cli/src/managed-runtime-store.ts` and its test only if the existing short final-mutation lock cannot satisfy section 2.8.

- [ ] Implement an asynchronous, non-blocking revision-scoped lock under the LateOn cache parent with PID/process-start/boot identity and the same safe stale-lock principles as managed-runtime locks. Do not call `Atomics.wait()`/`sleepSync()` while waiting.
- [ ] A waiter repeatedly rechecks whether the final verified model directory appeared; once it does, it re-verifies and returns `resolution: reused`.
- [ ] Never hold the managed-runtime mutation lock while waiting for or holding the revision lock.
- [ ] Change first and subsequent runtime installation to materialize new candidates only in unique immutable generation directories; never write a new candidate directly into the stable runtime root.
- [ ] Reuse an existing compatible immutable generation after full closure verification. Otherwise retain the exact newly probed generation path without a post-probe rename.
- [ ] Move long runtime/model provisioning outside the managed-runtime mutation lock.
- [ ] Keep the managed-runtime lock around final shared integration/activation mutations only.
- [ ] Add an end-to-end test launching two `executeInstallCommand()` calls with one blocked fake artifact stream. Assert the event loop continues while the second waits, one model download occurs, both identical requests converge successfully, final activation serializes, any redundant generation is safely reused/pruned, and no staging residue remains.
- [ ] Add an incompatible-closure case that returns the typed conflict rather than claiming convergence.
- [ ] Add conflict/stale-lock tests and prove lock cleanup on all exits.
- [ ] Inspect the focused diff. If a checkpoint is explicitly authorized, use `fix(cli): serialize concurrent LateOn provisioning and activation`.

---

## Task 5 — Add the Pre-Activation Provider-Readiness Probe

**Files:**
- Modify: `packages/cli/src/install-preflight.ts`
- Modify: `packages/cli/src/install-preflight.test.ts`
- Modify MCP session helper only if it lacks a `cwd` option.

**Interface:**

```ts
export type ManagedProviderReadinessProbeResult = Readonly<{
    candidateRuntimeVersion: string;
    embeddingProvider: "Potion";
    vectorStore: "LanceDB";
    reranker: "LateOn-Code-edge";
    rerankerApplied: true;
}>;

export async function probeManagedRuntimeProviderReadiness(input: {
    runtimeCommand: ManagedRuntimeCommand;
    runtimeEnvironment: Readonly<Record<string, string>>;
    inheritedEnvironment: NodeJS.ProcessEnv;
    homeDir: string;
    expectedVersion: string;
}): Promise<ManagedProviderReadinessProbeResult>;
```

Probe fixture:

```text
<temporary root>/src/validation.ts
<temporary root>/src/runtime.ts
<temporary root>/tests/validation.test.ts
```

The probe must:

1. use a private temporary HOME/state root and LanceDB path;
2. start the inactive candidate runtime with cwd equal to the fixture root;
3. verify MCP version and tool list;
4. call `manage_index` and wait for a proven ready generation;
5. call grouped `search_codebase` with a non-exact implementation query and full bounded diagnostics;
6. assert Potion and LanceDB initialized, reranker was attempted and applied, at least two candidates entered the provider, and no acquisition network operation occurred;
7. close the process and remove the private probe root.

- [ ] Write RED tests proving the old list-tools-only probe would pass even when LateOn startup is broken.
- [ ] Add failure tests for Potion, LanceDB, LateOn worker readiness, invalid model bytes, and reranker not applied.
- [ ] Keep the original lightweight MCP surface probe, then run this provider probe as the stronger gate.
- [ ] Inspect the focused diff. If a checkpoint is explicitly authorized, use `feat(cli): prove provider readiness before launcher activation`.

---

## Task 6 — Make Launcher Activation the Final Install Mutation

**Files:**
- Modify: `packages/cli/src/install.ts`
- Modify: `packages/cli/src/install.test.ts`

- [ ] Refactor planning so immutable candidate materialization/model resolution/provider probe complete before `applyInstallPlan()` enters shared mutations.
- [ ] Treat the candidate generation as already retained and usable before any repository/client mutation; no candidate materialization, closure-verification, or retention operation may remain after those mutations begin.
- [ ] Under the managed-runtime lock, re-run every `assertUnchanged` before the first mutation.
- [ ] If another identical install activated while this caller was provisioning, verify the active generation/environment satisfy the same requested closure, discard the redundant candidate safely, and return converged success.
- [ ] Apply repository profile, client configs, and companions before launcher activation.
- [ ] Apply the managed launcher last.
- [ ] On any earlier mutation failure, assert the old launcher bytes and active runtime command remain unchanged.
- [ ] Test injected failures at immutable generation materialization, repository profile, each client config class, companion mutation, convergence validation, and launcher activation.
- [ ] Preserve current explicit `E_INSTALL_PARTIAL` reporting for already-applied config files; do not claim cross-file rollback.
- [ ] Inspect the focused diff. If a checkpoint is explicitly authorized, use `fix(cli): activate managed launcher only after integration succeeds`.

---

## Task 7 — Prove Explicit No-LateOn Modes and Render Readiness Truthfully

**Files:**
- Modify: `packages/cli/src/install.ts`
- Modify: CLI help/output modules and tests.

- [ ] Default supported offline mode must resolve or acquire and probe LateOn.
- [ ] `--reranker none` must not load acquisition authority, inspect the model directory, acquire a revision lock, fetch, or run a LateOn probe.
- [ ] Connected/Voyage mode must produce a `VoyageAI` readiness result and zero LateOn work.
- [ ] Unsupported default platforms must fail or require an explicit alternative; they may not print `Ready: Potion + LateOn`.
- [ ] Final output names runtime profile, embedding provider, reranker, vector store, model revision/resolution for LateOn, and activation status.
- [ ] Failure output uses typed cleanup evidence and never prints URLs or secret-bearing environment values.
- [ ] Inspect the focused diff. If a checkpoint is explicitly authorized, use `feat(cli): report the activated search stack truthfully`.

---

## Task 8 — Define and Populate the Real-Model Release Fixture

**Files:**
- Create: `packages/cli/scripts/prepare-lateon-release-fixture.ts`
- Create: test file.
- Modify: `packages/cli/package.json`

**Commands:**

```json
{
  "fixture:lateon:prepare": "tsx scripts/prepare-lateon-release-fixture.ts",
  "fixture:lateon:verify": "tsx scripts/prepare-lateon-release-fixture.ts --check"
}
```

Both commands require explicit candidate identity and destination arguments:

```bash
pnpm -C packages/cli fixture:lateon:prepare -- \
  --mcp-package-root "$PACKED_MCP_ROOT" \
  --fixture-directory "$FIXTURE_DIR"

pnpm -C packages/cli fixture:lateon:verify -- \
  --mcp-package-root "$PACKED_MCP_ROOT" \
  --fixture-directory "$FIXTURE_DIR"
```

- [ ] Require `--mcp-package-root` and `--fixture-directory` as absolute paths; reject an environment or source-tree fallback.
- [ ] Use only the explicitly supplied candidate MCP package authority, not constants duplicated in the script or ambient installed assets.
- [ ] Give the production acquisition owner a narrow explicit model-store/fixture destination input so the script does not manufacture a fake HOME or duplicate download/publication logic.
- [ ] Prepare through the production downloader and atomic model publication path.
- [ ] `--check` performs no network access and re-verifies every artifact against the supplied MCP authority.
- [ ] Missing fixture exits with `E_LATEON_RELEASE_FIXTURE_UNAVAILABLE`.
- [ ] Document the cache key `lateon-fixture-<revision>-<runtimeProfileSha256>` and that CI/release infrastructure owns persistence of this external cache.
- [ ] Never write a second completion receipt inside the fixture.
- [ ] Inspect the focused diff. If a checkpoint is explicitly authorized, use `test(release): define verified LateOn model fixture authority`.

---

## Task 9 — Add Deterministic Pre-Release and First-Search Smokes

**Files:**
- Modify: `packages/cli/scripts/release-smoke.ts`
- Modify tests and package scripts.

### Pre-release provider smoke

- [ ] Define `PACK_ROOT`, `CORE_TGZ`, `MCP_TGZ`, `CLI_TGZ`, `PACKED_MCP_ROOT`, `ISOLATED_NPM_CACHE`, and `FIXTURE_DIR`; register cleanup for task-owned temporary roots.
- [ ] Build and pack the local Core/MCP/CLI closure with the existing `pnpm pack --pack-destination` helper/pattern and exact returned paths.
- [ ] Install the three local tarballs together using the existing release-smoke closure pattern, and prove the managed installer resolves its MCP candidate from this packed closure rather than npm or source-tree assets. Use a verified local package specifier such as `@zokizuan/satori-mcp@file:<MCP_TGZ>` only after a focused test proves the installer resolves its scoped identity and package root correctly; otherwise provide the smallest explicit test-only packed-closure seam.
- [ ] Create isolated `HOME`, `SATORI_STATE_ROOT`, `LANCEDB_PATH`, and `ISOLATED_NPM_CACHE`.
- [ ] Reverify the external real-model fixture and preseed the isolated revision cache.
- [ ] Disable all outbound acquisition network access.
- [ ] Run local packed managed install and assert the pre-activation provider probe passes before launcher activation.

### Post-activation first-search smoke

- [ ] Start the activated launcher with acquisition network disabled.
- [ ] Index a tiny fixture and execute one search.
- [ ] Assert LateOn was used and acquisition fetch count stayed zero.
- [ ] Assert the activated readiness result matches the verified revision/profile.

- [ ] Prove a synthetic model fixture cannot satisfy either real provider smoke.
- [ ] Inspect the focused diff. If a checkpoint is explicitly authorized, use `test(release): prove LateOn readiness before and after activation`.

---

## Task 10 — Documentation, Packed Verification, and Pre-Release Seal

**Files:**
- Modify active README/help/install docs.
- Create: `docs/evidence/lateon-install-provisioning-20260810/PRE_RELEASE_RECEIPT.md`

- [ ] Document the complete setup boundary as `satori install`/verified `npm exec` command, not plain npm extraction.
- [ ] Explain cache reuse and deliberate `--reranker none` / connected modes.
- [ ] Remove active public `LateOn D32` naming while preserving historical/internal records.
- [ ] Run:

```bash
pnpm -C packages/cli test
pnpm -C packages/mcp test
pnpm -C packages/cli fixture:lateon:verify -- \
  --mcp-package-root "$PACKED_MCP_ROOT" \
  --fixture-directory "$FIXTURE_DIR"
pnpm -C packages/cli release:smoke
pnpm -C packages/mcp release:smoke
pnpm run check
pnpm build
git diff --check
```

- [ ] Record exact implementation HEAD/tree, package tarball hashes, fixture revision/profile hashes, test counts, and no-network smoke outcomes.
- [ ] State `no unintended changes remain`; state `working tree clean` only if all planned changes were committed.
- [ ] Inspect the complete implementation diff. If a checkpoint is explicitly authorized, use `docs(install): seal LateOn pre-activation provisioning`.

---

## Task 11 — Post-Publication Verification (Separate, No Source Changes)

This task is not required to declare implementation complete. It begins only after exact package versions are published.

- [ ] Create a fresh isolated npm cache and HOME.
- [ ] Resolve the exact published CLI/MCP versions; do not use `latest` as evidence.
- [ ] Verify `npm exec --package=@zokizuan/satori-cli@<version> -- satori install --help`.
- [ ] Reuse the verified external model fixture or perform an explicitly authorized live acquisition.
- [ ] Run published managed install, pre-activation readiness, launcher activation, and first-search no-acquisition checks.
- [ ] Record package integrities and outcomes in an external release artifact by default. A repository `POST_PUBLICATION_RECEIPT.md` is a separate docs-only change and requires explicit authorization.
- [ ] Make no product source changes or release retuning during post-publication verification.

---

## 4. Final Definition of Done

The source implementation is complete when:

- default supported managed installation has a verified LateOn model before activation;
- every new runtime candidate, including the first install, is materialized in an immutable generation and the launcher targets the exact probed path;
- the inactive candidate proves Potion, LanceDB, and LateOn through a provider-backed search before activation;
- repository/client mutations precede launcher activation;
- acquisition progress is bounded and truthful across retries;
- cache reuse performs zero network calls and returns `resolution: reused`;
- the LateOn revision lock waits asynchronously and never copies the synchronous `Atomics.wait` store-lock implementation;
- two identical concurrent full installs converge successfully without corrupting model/runtime/launcher state;
- `--reranker none` and connected/Voyage modes perform zero LateOn work;
- first post-activation search performs zero acquisition;
- the real model gate has one explicit external fixture owner and fails when unavailable;
- public naming consistently uses `LateOn-Code-edge`;
- packed command resolution is proven;
- all focused/full/build/smoke checks pass;
- no new distribution infrastructure has been introduced.

## 5. Explicit Non-Goals

- No npm `postinstall` model download.
- No first-query acquisition fallback.
- No model bytes in Git or npm tarballs.
- No GitHub model mirror.
- No model revision change.
- No new runtime-bundle format.
- No background model daemon.
- No cross-file transactional rollback system for all client configs.
- No range-resume protocol.
- No ranking, retrieval, reranker-profile, or search-quality changes.
