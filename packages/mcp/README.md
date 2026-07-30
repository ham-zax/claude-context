# @zokizuan/satori-mcp

The MCP server for [Satori](https://github.com/ham-zax/satori): freshness-aware hybrid code search, symbol navigation, advisory call graphs, bounded source reads, and index lifecycle management.

Most users should install Satori through `@zokizuan/satori-cli`. The installer writes a stable local launcher and configures supported MCP clients; this package does not manage client configuration by itself.

## Install

```bash
npm install -g @zokizuan/satori-cli@latest
satori install --client all
satori doctor
```

The local Potion runtime currently supports Linux x64, including Windows through WSL2. Connected Voyage and explicit local Ollama configurations are also available. See the [main README](https://github.com/ham-zax/satori#quick-start) for runtime choices.

When installed through the CLI, compatible offline Potion + LanceDB clients
share one private local host, provider/LanceDB state, and one Potion worker. Each
client remains an independent MCP session. Direct `npx @zokizuan/satori-mcp`
execution is still isolated and does not join the managed host.

Direct package execution is intended for inspection and custom harnesses:

```bash
npx -y @zokizuan/satori-mcp@latest --help
```

Do not use `npx` as the resident MCP command when the CLI installer supports your client; package resolution can exceed normal MCP startup timeouts.

## Workflow

```text
manage_index action="create" path="/absolute/path/to/repo"
search_codebase path="/absolute/path/to/repo" query="where is auth refresh handled"
file_outline path="/absolute/path/to/repo" file="src/auth.ts"
call_graph path="/absolute/path/to/repo" symbolRef={...} direction="both"
read_file path="/absolute/path/to/repo/src/auth.ts" start_line=1 end_line=160
```

Public paths are absolute. Search is freshness-aware; exact reads are limited to indexed searchable roots. Follow `recommendedNextAction` when returned, and reindex before retrying a request that reports `requires_reindex`.

## Measured Performance

A checksum-sealed Potion/LanceDB run on Satori published 488 files and 10,830 chunks in 34.46 seconds on CPU. The later representative delta run measured 154.543 ms warm-search p95, 185.662 ms zero-change synchronization p95, and 789–865 ms p95 for one-file add/edit/delete operations.

At revision `4138b1e…`, fresh-process startup measured 645.95 ms p50. The first
`call_graph` after startup measured 7,204.25 ms p50 and 7,530.10 ms p95; calls
measured after two preparation calls were 11.97 ms p50 and 13.57 ms p95, with a
10.97–22.77 ms range. The cold result is `cold_graph_multi_owner`:
checkpoint/completion validation consumed about 3.24 seconds and relationship
loading/validation consumed about 2.59–3.20 seconds. Adjacency construction was
only about 21 ms.

The six-publication memory run at that revision used 120-second settling
periods, peaked at 881.82 MiB RSS, retained three generations, and showed no
monotonic heap, RSS, external-memory, or observable-cache growth. Its result is
`memory_retained_capacity_bounded`, not a proven plateau or multi-day
guarantee. The separate requirement for at least 2 GiB available runtime
capacity is an allowance based on earlier integration evidence that observed a
1,447.21 MiB incremental-publication peak; it is not measured steady
consumption.

The cold and memory characterization was not rerun after current master changed
full-reindex V4 authority publication. These figures remain the retained
release characterization for revision `4138b1e…`, not strict empirical proof
of identical current-master performance.

On 30 frozen positive retrieval tasks, Potion placed the required owner in the top five on 23 tasks versus Voyage on 25. Potion's observed median search latency was 94.64 ms versus 1,009.46 ms for Voyage in that paired run, but the provider latency observations were descriptive and Potion showed weaker Java and configuration/runtime retrieval.

In a fresh two-task OpenCode comparison where both arms answered correctly, Satori used 16 tool calls and returned 76,113 tool-output bytes versus 25 calls and 96,801 bytes for native `grep` / `glob` / `read`. Wall time was 51.65 versus 96.04 seconds; total model tokens were effectively unchanged. This is a small exploratory context-route result, not a universal token-reduction claim.

<!-- TOOLS_START -->

## Tools

| Tool | Purpose |
|---|---|
| `manage_index` | Create, synchronize, inspect, repair, reindex, or clear a repository index. Use status and repair guidance instead of guessing whether an index is ready. |
| `search_codebase` | Run freshness-aware hybrid search and return symbol-owned evidence. Start here for behavior, ownership, configuration, or path discovery. |
| `continue_search` | Reveal more of one frozen result set without rerunning retrieval. Use it when the initial disclosure is relevant but incomplete. |
| `call_graph` | Inspect advisory callers, callees, imports, and exports when supported. Verify inbound leads before blast-radius changes. |
| `file_outline` | List indexed symbols and spans in one file. Exact Python functions and methods can request on-demand structural analysis. |
| `read_file` | Read a bounded source span or one exact indexed symbol. Large ranges are compacted so agent UIs receive structure instead of implementation floods. |
| `list_codebases` | List known indexed repositories, readiness, and runtime-owner state. Use it to discover existing publications before creating another one. |

<!-- TOOLS_END -->

## Runtime Boundaries

- The server does not edit repository source.
- `read_file` is not a general host-filesystem reader.
- Inbound call-graph evidence is advisory and should be verified before blast-radius edits.
- Python inbound relationships cover bounded static constructor-receiver and
  direct service/callback value-origin patterns. Dynamic or ambiguous flows
  remain partial, so an absent inbound edge is not proof that no caller exists.
- A fully proven healthy V4 repair is an exact no-op, while valid V4
  navigation-only damage uses graph-only activation. V3, missing, corrupt,
  changed, or ambiguous source authority requires reindexing.
- Provider, model, dimensions, projection, and vector backend are persisted compatibility identities; changing them requires a reindex.
- Multiple incompatible live Satori runtimes are blocked from mutating the same publication.
- Managed offline Potion + LanceDB clients on Linux x64/WSL2 share one private
  local host. Connected providers, Milvus, and explicit Ollama runtimes keep
  the direct per-client lifecycle.
- Optional LateOn reranking is enabled only when
  `SATORI_RERANKER_PROVIDER=lateon` and an absolute
  `SATORI_LATEON_MODEL_PATH` are configured. The model directory is shared
  outside versioned MCP runtimes, artifact digests are verified, inference runs
  in a killable worker, and every failure falls back atomically to exact + BM25
  + single-vector ordering.

## Development

```bash
pnpm --filter @zokizuan/satori-mcp build
pnpm --filter @zokizuan/satori-mcp test
pnpm --filter @zokizuan/satori-mcp docs:check
```

Node.js 22.13 or newer is required. Satori is MIT licensed.
