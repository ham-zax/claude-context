# Claude Context Architecture

Visual-first architecture summary for the `claude-context` monorepo.

Source basis:
- Manual code discovery (`rg`, targeted reads).
- Serena symbol tracing (classes, methods, flows).

## 1) System Overview

```text
MCP Client
  |
  v
+---------------------------------------------------------------+
| MCP Server (`packages/mcp`)                                  |
|  - Tool Registry (4 tools)                                   |
|  - ToolHandlers                                               |
|  - CapabilityResolver                                         |
|  - SnapshotManager / SyncManager                              |
+---------------------------+-----------------------------------+
                            |
                            v
+---------------------------------------------------------------+
| Core Engine (`packages/core`)                                |
|  - Context orchestrator                                      |
|  - Splitter (AST + LangChain fallback)                       |
|  - Embedding providers                                       |
|  - Vector DB adapters (Milvus gRPC / REST)                   |
+---------------------+----------------------+------------------+
                      |                      |
                      v                      v
      +------------------------------+   +----------------------+
      | `~/.context` local state     |   | Milvus / Zilliz      |
      | snapshot + merkle sync files |   | dense/hybrid indexes |
      +------------------------------+   +----------------------+
```

Control/state paths:
- `~/.context/mcp-codebase-snapshot.json`
- `~/.context/merkle/<md5(codebasePath)>.json`

## 2) Repository Layout

```text
packages/
  core/
    src/
      core/context.ts
      splitter/
      embedding/
      vectordb/
      sync/
      config/
      utils/
  mcp/
    src/
      index.ts
      core/
      tools/
      telemetry/
      config.ts
      embedding.ts
tests/
  integration/
```

## 3) Core Engine (`packages/core`)

### 3.1 Core Responsibilities

```text
Context (`core/context.ts`)
  -> build effective config (defaults + ctor + env)
  -> indexCodebase / reindexByChange
  -> semanticSearch (dense or hybrid)
  -> manage per-collection synchronizers
```

### 3.2 Core Runtime Knobs

```text
HYBRID_MODE default: true
Collection names:
  - dense : code_chunks_<md5(path)[0..8]>
  - hybrid: hybrid_code_chunks_<md5(path)[0..8]>
Chunk cap per indexing run: 450000
Embedding batch size: EMBEDDING_BATCH_SIZE (default 100)
```

### 3.3 File Discovery and Ignore Model

Effective matching source order:
1. built-ins (`DEFAULT_SUPPORTED_EXTENSIONS`, `DEFAULT_IGNORE_PATTERNS`)
2. constructor overrides
3. env custom values (`CUSTOM_EXTENSIONS`, `CUSTOM_IGNORE_PATTERNS`)
4. repo root `.*ignore` files
5. global `~/.context/.contextignore`

### 3.4 Splitter, Embedding, Vector Abstractions

```text
Splitter:
  - AstCodeSplitter (tree-sitter)
  - LangChainCodeSplitter (fallback / generic)

Embedding providers:
  - OpenAI, VoyageAI, Gemini, Ollama
  - common contract: detectDimension, embed, embedBatch

VectorDatabase adapters:
  - MilvusVectorDatabase (gRPC)
  - MilvusRestfulVectorDatabase (HTTP)
```

### 3.5 Dense vs Hybrid Storage

```text
Dense collection fields:
  id, vector, content, relativePath, startLine, endLine, fileExtension, metadata

Hybrid collection adds:
  sparse_vector + BM25 function on content
  dense+sparse index path with RRF rerank strategy
```

### 3.6 Incremental Sync (Core)

`FileSynchronizer` keeps file hashes + Merkle DAG per codebase and returns:
- `added`
- `removed`
- `modified`

`reindexByChange` behavior:
- removed/modified -> delete old chunks
- added/modified -> re-index

## 4) MCP Runtime (`packages/mcp`)

### 4.1 Bootstrap

`packages/mcp/src/index.ts`:
- starts MCP stdio server.
- redirects `console.log`/`console.warn` to `stderr` (protects MCP JSON on `stdout`).
- builds runtime fingerprint.
- wires `Context`, `SnapshotManager`, `SyncManager`, `ToolHandlers`, optional `VoyageAIReranker`.
- starts background sync loop.

### 4.2 Public Tool Surface

```text
manage_index    create|sync|status|clear
search_codebase semantic search (+ optional rerank)
read_file       safe read with optional line ranges
list_codebases  tracked state summary
```

Tool schemas:
- defined in Zod
- converted to JSON Schema for MCP `ListTools`

### 4.3 ToolHandlers Highlights

- absolute path normalization/validation.
- cloud/local reconciliation before key operations.
- fingerprint compatibility gate before searchable access.
- background indexing kickoff for `manage_index(action=create)`.
- subdirectory smart-resolution to indexed parent root for search.

### 4.4 Snapshot and Gate Model

Snapshot status states:
- `indexing`
- `indexed`
- `indexfailed`
- `sync_completed`
- `requires_reindex`

Format behavior:
- v1/v2 migrate to v3 on load.

Gate reasons:
- legacy assumed fingerprint
- missing fingerprint
- fingerprint mismatch

### 4.5 SyncManager Model

`ensureFreshness` includes:
- in-flight coalescing (per codebase).
- freshness throttling.
- shared path for periodic/manual/read-time sync.

Schedule:
- initial delay: ~5s.
- repeat: every 3 minutes.

### 4.6 Capability Model

```text
Embedding locality/profile:
  Ollama              -> local / slow
  VoyageAI or OpenAI  -> cloud / fast
  others              -> cloud / standard

Search limits:
  fast     default 50, max 50
  standard default 25, max 30
  slow     default 10, max 15
```

Rerank decision:
- `useReranker=true` -> force (error if unavailable)
- `useReranker=false` -> disable
- omitted -> capability-driven default

### 4.7 Search Telemetry

`search_codebase` emits structured telemetry to `stderr`:
- event/tool/profile
- query length
- requested limit
- results before/after filter
- excluded-by-ignore
- reranker used
- latency
- optional error

## 5) Runtime Flows

### 5.1 Create Index (`manage_index:create`)

```text
Client
  |
  v
ToolHandlers.handleIndexCodebase
  |-- validate path + capacity
  |-- sync snapshot <-> cloud
  |-- snapshot -> indexing
  `-- startBackgroundIndexing (async)

Background:
  load ignore patterns
  init FileSynchronizer
  prepare collection
  scan -> split -> embedBatch -> insert
  periodic progress saves

terminal:
  success -> indexed
  failure -> indexfailed
```

### 5.2 Search (`search_codebase`)

```text
search_codebase
  -> rerank policy decision
  -> handleSearchCode
      -> fingerprint gate
      -> ensureFreshness(sync-on-read)
      -> semantic/hybrid search
      -> filter + format or raw payload
  -> optional VoyageAI rerank
  -> telemetry emit
```

### 5.3 Sync (`manage_index:sync`)

```text
validate indexed + gate
  -> reindexByChange
  -> snapshot -> sync_completed (+delta counts)
```

### 5.4 Clear (`manage_index:clear`)

```text
validate tracked state
  -> drop collection
  -> delete merkle snapshot
  -> remove codebase from snapshot map
```

### 5.5 Read/List

```text
read_file:
  - optional start_line/end_line
  - truncation guard by READ_FILE_MAX_LINES (default 1000)

list_codebases:
  - grouped by status
```

## 6) State and Data Contracts

### 6.1 Codebase State Machine

```text
not_found --create--> indexing --success--> indexed --sync--> sync_completed
   ^                    |  \                               |
   |                    |   \--failure--> indexfailed ----+
   |                    |
   |                    \--incompatible--> requires_reindex
   |                                       |
   +---------------- clear / create(force)-+
```

### 6.2 Vector Document Contract

```text
id: deterministic from path + line range + chunk content
document fields: content, vector, relativePath, startLine, endLine, fileExtension, metadata
metadata includes source context (language/codebase, etc.)
```

### 6.3 Fingerprint Contract

```text
embeddingProvider
embeddingModel
embeddingDimension
vectorStoreProvider
schemaVersion (dense_v1 | hybrid_v1)
```

Mismatch -> `requires_reindex`.

### 6.4 Data Lineage

```text
file -> CodeChunk -> EmbeddingVector -> VectorDocument -> Milvus row
     -> search result -> MCP response snippet
```

## 7) Operational Notes and Edge Cases

- Search can run while indexing; results may be incomplete.
- Non-AST splitter requests currently fall back to AST path in background indexing flow.
- REST adapter currently treats `checkCollectionLimit` as non-blocking (`true`).
- Search-time exclude patterns are normalized/validated; invalid patterns generate warnings.

## 8) Testing Coverage

Integration (`tests/integration/context.integration.test.mjs`):
- index creation and persistence.
- semantic retrieval quality signal.
- incremental add/modify/remove behavior.
- ignore + negation pattern behavior.

MCP unit tests:
- capability/rerank decision behavior.
- telemetry emission path.
- snapshot fingerprint gate behavior.
- tool registry/schema invariants.

## 9) Extension Seams

```text
New embedding provider  -> implement Embedding
New vector backend      -> implement VectorDatabase
Tooling changes         -> tools/* + core/handlers.ts
Search policy tuning    -> CapabilityResolver + rerank decision
```

Key files:
- `packages/core/src/core/context.ts`
- `packages/core/src/sync/synchronizer.ts`
- `packages/core/src/vectordb/*`
- `packages/mcp/src/index.ts`
- `packages/mcp/src/core/handlers.ts`
- `packages/mcp/src/core/snapshot.ts`
- `packages/mcp/src/core/sync.ts`
- `packages/mcp/src/tools/*`

