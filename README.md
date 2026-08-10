# Satori

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![CI](https://github.com/ham-zax/satori/actions/workflows/ci.yml/badge.svg)](https://github.com/ham-zax/satori/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@zokizuan/satori-cli?label=npm)](https://www.npmjs.com/package/@zokizuan/satori-cli)

Give your coding agent a map of the repository before it edits.

Satori turns a repository into a freshness-aware code map. MCP-compatible agents can find behavior by intent, open the real owner, follow nearby relationships, and read only the source needed to act. Offline search uses bundled Potion embeddings, BM25, and LanceDB—no model API key required.

## Install

Requirements: Node.js 22.13+, Linux x64 (native Linux or WSL2), and at least
2 GiB of available runtime capacity for the qualified native deployment
envelope. The capacity figure is an allowance, not measured steady
consumption.
The npm package installs the `satori` command.

```bash
npm install -g @zokizuan/satori-cli@latest
satori install
satori doctor
```

Running `satori install` (or using `--client auto`) detects the supported
Codex, Claude Code, and OpenCode clients from their documented local markers
or CLI executables. Use `--client all` to force configuration of all three.
If no supported client is detected, Satori stops before runtime installation and
shows explicit client commands. `satori uninstall` defaults to all supported
clients; use `--client auto` to limit cleanup to currently detected clients.

Run `satori` without arguments at any time for human-readable help.
Use `satori -v` to print the installed CLI, MCP runtime, and Core versions.

Codex receives global Satori guidance by default. To also install the optional
Codex session-start reminder:

```bash
satori install --client codex --install-guidance-hook
```

Restart your coding agent and tell it:

```text
Index /absolute/path/to/repo with Satori, then find where auth refresh is handled.
```

That is the complete local path. Satori installs a stable launcher under `~/.satori/`; your agent does not download the server again on every startup.

On Linux x64 and WSL2, the default offline Potion + LanceDB runtime uses LateOn
D32 as its query-time reranker and is shared
behind that launcher. Multiple compatible Codex, Claude Code, OpenCode, or
subagent sessions attach as independent MCP sessions to one private local host,
shared provider/LanceDB state, and one Potion worker. The host uses a user-only
Unix-domain socket, idles out after clients disconnect, and is not used for
connected Voyage/Milvus or explicit Ollama runtimes.

To stop every verified Satori MCP runtime under the active state root:

```bash
satori terminate
```

The command shuts down registered servers and their provider workers without
removing client configuration, indexes, or installed packages.

Upgrade the installed CLI, MCP runtime, and its compatible Core dependency:

```bash
satori upgrade
```

Satori reports each potentially slow phase as it works:

```text
Checking latest Satori release...
Installing MCP <version> and Core <version>...
Verifying candidate runtime...
Activating verified runtime...
```

The CLI is updated first. Satori then stages and verifies the exact MCP/Core runtime before switching the stable launcher. If runtime verification fails, the updated CLI remains installed and the managed launcher is left unchanged; correct the reported problem and run `satori upgrade` again. Restart running coding agents after a successful runtime upgrade. The command does not rewrite client configuration, indexes, hooks, or repository profiles.

An upgrade follows one coordinated release closure declared by the latest CLI package. It does not independently combine the newest CLI, MCP, and Core versions. This keeps every activated runtime on an exact, tested MCP/Core pairing.

For a no-install invocation, replace `satori` with `npx -y @zokizuan/satori-cli@latest`.

```text
plain-English question
        |
        v
exact evidence + BM25 + dense retrieval
        |
        v
symbol-owned results
        |
        v
outline, call graph, and bounded source reads
```

## What changes for your agent

| Without a code map | With Satori |
|---|---|
| Guess filenames and repeat broad searches | Ask where behavior lives in plain English |
| Read large files to reconstruct ownership | Open an exact symbol or bounded source span |
| Lose lexical identifiers in semantic-only search | Combine exact evidence, BM25, and dense retrieval |
| Work from an index that may have drifted | Detect source changes before returning evidence |
| Assemble relationships from scattered reads | Follow owner-oriented navigation and advisory call graphs |

Satori does not edit source code. It gives the agent better evidence before the edit.

## Why Satori

- Find behavior by intent when filenames and exact identifiers are unknown.
- Keep exact paths, symbols, configuration keys, and lexical evidence in the retrieval path.
- Return owner-oriented groups instead of flooding the agent with duplicate chunks.
- Open exact symbols or bounded line ranges instead of dumping entire files.
- Detect source drift and publish complete searchable generations atomically.
- Run fully local retrieval with Potion Code 16M v2 and LanceDB on Linux x64.
- Share the managed offline runtime across compatible local agent sessions
  instead of starting one heavy runtime per session.
- Install one managed MCP runtime for Codex, Claude Code, OpenCode, or all three.

<details>
<summary><strong>Measured evidence from the Satori repository</strong></summary>

## Measured on Satori

These are repository measurements, not borrowed model-card claims.

### Local Potion + LanceDB

A checksum-sealed run on the Satori repository published 488 files and 10,830 chunks with 256-dimensional Potion vectors:

| Operation | Measured result |
|---|---:|
| Warm search p95 | 154.543 ms |
| Zero-change synchronization p95 | 185.662 ms |
| One-file addition p95 | 789.310 ms |
| One-file body edit p95 | 792.245 ms |
| One-file signature edit p95 | 811.632 ms |
| One-file deletion p95 | 864.802 ms |
| Rename p95 | 880.937 ms |

The bundled native feasibility run measured a 36.0 MiB model/helper closure, 104.3 MiB model-related RSS, and 232.404 ms model load. Its short-text microbenchmark reached 19,282 items/s, but that isolated throughput number is not a full indexing claim.

### Potion versus Voyage

The same frozen 30 positive retrieval tasks were queried against compatible Potion and Voyage hybrid publications. BM25, exact evidence, fusion, grouping, source projection, and request policy were held constant; only the dense model/publication differed.

| Retrieval result | Potion | Voyage |
|---|---:|---:|
| Required owner at rank 1 | 13/30 | 14/30 |
| Required owner in top 5 | 23/30 | 25/30 |
| Required owner in top 15 | 25/30 | 27/30 |
| Observed search latency p50 | 94.64 ms | 1,009.46 ms |
| Observed search latency p95 | 1,251.00 ms | 1,813.34 ms |

Potion is a useful local first stage, not a claim of Voyage parity. The comparison found weaker Java and configuration/runtime retrieval for Potion. The paired latency observations are descriptive rather than a repeated cross-provider performance qualification.

### Less context waste

Satori groups retrieval around owners and exposes bounded source instead of making an agent assemble context from repeated broad reads. In a fresh two-task OpenCode comparison, both the Satori and native file-discovery arms produced correct answers:

| Correct paired tasks | Satori tools | Native `grep` / `glob` / `read` |
|---|---:|---:|
| Tool calls | 16 | 25 |
| Tool-output bytes shown to the model | 76,113 | 96,801 |
| Agent wall time | 51.65 s | 96.04 s |
| Total model tokens | 46,767 | 46,759 |

That exploratory run used 36% fewer tool calls, 21% fewer tool-output bytes, and 46% less wall time. Total model tokens were effectively unchanged, so this is evidence of a shorter evidence route—not a universal token-savings claim. It was one run per task, and OpenCode recovered from two rejected Satori tool calls in the exact-owner task.

The qualification details and limitations remain available in the [Potion plan](./docs/plans/SATORI_POTION_OFFLINE_EMBEDDING_LEAN_QUALIFICATION_PLAN.md).

</details>

## Runtime Choices

| Runtime | Retrieval | Storage | Requirement |
|---|---|---|---|
| Offline | Potion Code 16M v2 + BM25 | LanceDB | Linux x64; no model API key |
| Connected | Voyage Code 3 + BM25 | LanceDB | `VOYAGEAI_API_KEY` |
| Ollama | selected Ollama model + BM25 | LanceDB | local loopback Ollama |
| Connected Milvus | Voyage Code 3 + BM25 | Milvus or Zilliz | explicit Milvus configuration |

Connected install:

```bash
satori install --client all --runtime voyage
satori doctor
```

Existing Milvus deployments can select `--vector-store milvus`. Existing Ollama installations can select or retain an explicit model:

```bash
satori install --client all --runtime offline --ollama-model nomic-embed-text
```

Changing the embedding provider, model, dimensions, vector backend, or persisted projection changes index compatibility and requires a reindex. Satori never silently converts or deletes the previous backend's publication.

## MCP Tools

| Tool | Purpose |
|---|---|
| `manage_index` | Create, synchronize, inspect, repair, reindex, or clear a repository index. Use status and repair guidance instead of guessing whether an index is ready. |
| `search_codebase` | Run freshness-aware hybrid search and return symbol-owned evidence. Start here for behavior, ownership, configuration, or path discovery. |
| `continue_search` | Reveal more of one frozen result set without rerunning retrieval. Use it when the initial disclosure is relevant but incomplete. |
| `file_outline` | List the indexed symbols and spans in one file. Use it to choose an exact owner before reading implementation. |
| `call_graph` | Inspect advisory callers, callees, imports, and exports when supported. Verify inbound leads before blast-radius changes. |
| `read_file` | Read a bounded source span or one exact indexed symbol. Large ranges are compacted so agent UIs receive structure instead of implementation floods. |
| `list_codebases` | List known indexed repositories, readiness, and runtime-owner state. Use it to discover existing publications before creating another one. |

Public paths are absolute. `read_file` is restricted to tracked searchable roots; it is not a general host-filesystem reader.

## Recommended Agent Workflow

```text
1. search_codebase for behavior or ownership
2. follow recommendedNextAction when returned
3. use file_outline to inspect one file's owners
4. use call_graph for advisory relationship context
5. use read_file for exact proof
6. use continue_search only when the frozen result has more useful evidence
```

If a tool returns `requires_reindex`, reindex before retrying the original call. Use `sync` for ordinary source changes. A search that arrives during a transient same-root sync joins it once and proceeds when it completes; other in-flight indexing returns `not_ready` with `retryAfterMs` and the active indexing operation so drivers can retry deterministically. Search continuation `"complete"` means complete for the caller-bounded frozen set, never for the full available pool; `omittedBeyondLimitGroupCount` reports groups excluded by the caller limit. Treat inbound call-graph results as leads to verify, not compiler-grade blast-radius proof.

## Index Profiles

Install with `--profile default|minimal|all-text` to write repository policy to `satori.toml`:

```toml
[index]
profile = "minimal"
```

| Profile | Includes |
|---|---|
| `default` | Source, documentation, config, scripts, infrastructure files, queries, and known extensionless text files. |
| `minimal` | Source and documentation text. |
| `all-text` | `default` plus additional bounded UTF-8 text files. |

Every profile honors `.satoriignore`, `.gitignore`, and the hard denylist for secrets, dependencies, generated output, lockfiles, binaries, logs, databases, bundles, source maps, and snapshots. Profiles control what is indexed; `search_codebase` still defaults to implementation-first `scope="runtime"`.

## Configuration

The installer owns the launcher and non-secret runtime identity. Provider credentials remain in the MCP client's environment.

Common variables:

```text
SATORI_RUNTIME_PROFILE
VECTOR_STORE_PROVIDER
LANCEDB_PATH
EMBEDDING_PROVIDER
EMBEDDING_MODEL
EMBEDDING_OUTPUT_DIMENSION
VOYAGEAI_API_KEY
SATORI_RERANKER_PROVIDER
SATORI_LATEON_MODEL_PATH
SATORI_LATEON_PROFILE
SATORI_LATEON_REQUEST_DEADLINE_MS
SATORI_LATEON_MAX_QUEUE_WAIT_MS
SATORI_LATEON_RERANKER_STAGE_DEADLINE_MS
SATORI_LATEON_MAX_ACTIVE_RERANKS
SATORI_LATEON_MAX_QUEUED_RERANKS
SATORI_LATEON_INTRA_OP_THREADS
MILVUS_ADDRESS
MILVUS_TOKEN
```

Run `doctor` after changing runtime configuration. Restart every Satori MCP client before mutating an index under a new provider, model, backend, dimension, or package version; incompatible live runtime owners are blocked instead of racing one publication. Mutation ownership is scoped to the backend authority root: each LanceDB state root carries its own owner registry, and Milvus runtimes are keyed by endpoint, so isolated state roots do not block one another.

## How Publication Works

Satori keeps source-derived navigation separate from model-specific vectors. A completed publication binds vector and lexical state, navigation, relationship evidence, source observation, checkpoint, and receipt to one generation. Readers use the complete previous generation or the complete new generation; failed candidate work does not replace the active publication.

Incremental synchronization scans for changed files, embeds changed chunks only, updates per-file navigation and graph contributions, and activates the complete replacement generation. Missing, corrupt, stale, or incompatible authority fails closed to repair or reindex guidance.

Repair is intentionally narrow. A fully proven healthy V4 publication is an
exact no-op; navigation-only damage on an otherwise valid V4 publication uses
the existing graph-only activation path. V3, missing, corrupt, changed, or
ambiguous source authority requires a reindex instead of fabricating a
compatible publication.

## Offline Local Reranking

Offline install defaults to reranking eligible candidates with the Apache-2.0
`lightonai/LateOn-Code-edge` FP32 ONNX checkpoint at projection-v4 depth 32.
D32 is operationally qualified but not held-out qualified; it became the
managed offline default through an explicit owner activation decision scoped to
Linux x64/WSL2 managed offline installations. Model weights are not bundled in
each versioned MCP runtime. The CLI downloads the roughly 72 MB pinned closure
once into `~/.satori/models/`, verifies every artifact, and reuses it across
upgrades. `satori upgrade` migrates previous managed combinations (context-v3
activated profile or the historical v3 rollout) to the context-v4 default
atomically. Disable neural reranking explicitly with:

```bash
satori install --runtime offline --reranker none
```

`--reranker none` is the explicit opt-out: it keeps the selected embedding
provider plus baseline ordering (exact + BM25 + single vector). With Ollama
embeddings that is the Ollama model plus baseline ordering, not "Potion +
BM25". The runtime also falls back to that baseline automatically on any LateOn
failure; automatic failure fallback and explicit opt-out are different
concepts.

Direct MCP runtimes can select the same reranker with:

```text
SATORI_RERANKER_PROVIDER=lateon
SATORI_LATEON_MODEL_PATH=/absolute/path/to/LateOn-Code-edge
```

The default profile is:

```text
SATORI_LATEON_PROFILE=lateon_offline_quality_projection_v4_d32_v1
SATORI_LATEON_ACTIVATION_POLICY=lateon_context_v4_d32_owner_default_v1
```

Explicit D16, projection-v2, and projection-v3 D32 choices remain available for
compatible developer configurations (the v3 activated combination is admitted
and migrated to the v4 default by `satori upgrade`):

```text
SATORI_LATEON_PROFILE=lateon_projection_v1_d16_legacy
SATORI_LATEON_PROFILE=lateon_projection_v2_d16_v1
SATORI_LATEON_PROFILE=lateon_offline_quality_projection_v2_d32_v2
```

D16 and D32 are distinct identity-bearing profiles. Satori never switches
between them automatically; an unavailable, overloaded, timed-out, cancelled,
or invalid neural run restores the deterministic baseline order.

Projection-v4 rerank context sends the exact question once plus a
positive-only answer-type line (the implementation focus never names
competing artifact classes), and each projected document is a bounded answer
packet: factual `candidate_role` derived from path classification plus trusted
structural context (direct callers, callees, and supporting tests resolved to
exact instance identities in the same sealed navigation generation; sorted and
capped; never a preference value). The reranker's published order remains
final: Satori applies no ranking weights, score multipliers, or global
test/documentation penalties. When only some candidates project, Satori
reranks the projectable ones, keeps the failed candidate in its retrieval
slot, and reports `RERANKER_INPUT_DEGRADED`; when none project, it skips the
provider, preserves retrieval order, and reports `RERANKER_SKIPPED_INPUT`
instead of `RERANKER_FAILED`.

The runtime verifies the pinned revision's artifact digests before use, performs
ONNX inference in a killable child process, and preserves the complete
deterministic baseline when model loading, scoring, validation, or the request
deadline fails. Projection profiles freeze model, projection, depth, thread,
and batching behavior. Operators may only reduce their request deadline, queue
wait, reranker-stage deadline, or active/queued capacity using the corresponding
variables listed above; deadlines are never increased. A terminal rerank
execution reports qualified diagnostics — attempts, retries, timeouts, the
effective deadline, observed wall time, and deadline lateness — alongside the
frozen retrieval order. The resulting effective profile remains part of the
shared-runtime and frozen-result identity.

LateOn is query-time ranking evidence only. It does not control candidate
eligibility, source freshness, publication authority, or baseline search
availability.

Search result `score` fields retain bounded retrieval evidence for diagnostics
and compatibility; they are not the final relevance order. Consumers should
preserve the returned sequence, or request `includeResultIndex` when they need
an explicit authoritative rank.

## Language Support

Search and bounded reads work across the indexed text and language catalog. Rich symbol navigation depends on parser evidence. TypeScript, JavaScript, and Python currently have the strongest call-graph support; other supported languages may provide symbols without authoritative graph traversal. Inspect `manage_index status` instead of assuming every indexed language is graph-ready.

Python inbound relationships are qualified for bounded static patterns,
including absolute-import constructor receivers and direct service or callback
value-origin flow. Reflection, arbitrary factories, collections,
monkeypatching, unbounded aliases, and ambiguous environments remain outside
that model. Individual edges may be exact under the supported model, but the
inbound result set remains non-exhaustive and absence still requires
deterministic verification.

Structural definition coverage is intentionally language-specific:

| Analyzer | Proven definition coverage |
|---|---|
| TypeScript / JavaScript | Classes, functions, methods, interfaces, types, enums, module variables, plus TypeScript namespaces and declaration-only signatures |
| Python | Classes, functions, methods, and direct module bindings |
| Go | Functions, methods, structs, interfaces, and named types |
| Rust | Modules, traits, structs, enums, functions, methods, type aliases, unions, and macros |
| Java | Classes, interfaces, enums, constructors, and methods |
| C# | Namespaces, classes, interfaces, structs, enums, constructors, and methods |
| C++ | Namespaces, classes, structs, enums, unions, typedefs/types, and callable declarations or definitions |
| Scala | Packages, classes, traits, objects, enums, types, functions, methods, and named package-level vals, vars, or givens |

`.c` and `.h` files currently use the C++ parser for a proven common-C subset; Satori does not claim a native C parser. Definition coverage improves outline, exact-open, and ownership navigation. It does not by itself imply call-graph or type-resolution support.

## Privacy and Limits

- Offline Potion embedding, LanceDB storage, search, and runtime telemetry make no network requests after installation.
- Connected providers receive the projected embedding or reranking input required for their service.
- Satori does not edit repository source.
- Local diagnostics exclude source, queries, paths, symbols, and repository identifiers and are never uploaded by Satori.
- Native Windows and macOS are not supported in this release. On Windows, run Satori inside WSL2.
- The relationship graph is conservative navigation evidence, not a full static-analysis proof.
- At revision `4138b1e…`, fresh-process startup measured 645.95 ms p50, after
  which the first `call_graph` measured 7,204.25 ms p50 and 7,530.10 ms p95.
  Calls measured after two preparation calls were 11.97 ms p50 and 13.57 ms
  p95. The cold owners were checkpoint/completion validation and relationship
  loading/validation; adjacency construction was only about 21 ms.
- The six-publication memory experiment at that revision peaked at 881.82 MiB
  RSS and established `memory_retained_capacity_bounded`, not a proven plateau
  or multi-day guarantee. The separate 2 GiB deployment allowance comes from
  earlier integration evidence that observed a 1,447.21 MiB incremental
  publication peak.
- Those cold and memory measurements were not rerun after the current master's
  full-reindex V4 authority-publication change. They are retained release
  characterization, not strict proof of identical current-master performance.

## Packages

| Package | Purpose |
|---|---|
| [`@zokizuan/satori-cli`](./packages/cli) | Installer, doctor, and command-line access to MCP tools. |
| [`@zokizuan/satori-mcp`](./packages/mcp) | The MCP server and seven public tools. |
| [`@zokizuan/satori-core`](./packages/core) | Indexing, analysis, embeddings, storage, and retrieval. |

## Development

```bash
pnpm install
pnpm build
pnpm run check
```

Focused package tests:

```bash
pnpm --filter @zokizuan/satori-core test
pnpm --filter @zokizuan/satori-mcp test
pnpm --filter @zokizuan/satori-cli test
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for repository conventions, [docs/RELEASING.md](./docs/RELEASING.md) for coordinated package releases, [SECURITY.md](./SECURITY.md) for private vulnerability reporting, and [THIRD_PARTY.md](./THIRD_PARTY.md) for attribution.

## License

MIT
