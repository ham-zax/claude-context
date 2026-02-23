# Satori ⛩️
**Agent-Optimized MCP Server for "Sudden Insight" Semantic Code Indexing**

<p align="left">
  <img src="https://img.shields.io/badge/Architected%20by-Hamza-blueviolet" alt="Architected by Hamza">
  <img src="https://img.shields.io/badge/Architecture-Agent--Safe-brightgreen" alt="Agent Safe">
  <img src="https://img.shields.io/badge/VectorDB-Milvus-blue" alt="Milvus">
  <img src="https://img.shields.io/badge/Protocol-MCP-orange" alt="MCP">
</p>

Satori means "sudden insight." This project applies that idea to code retrieval, bridging the gap between raw codebase intelligence and autonomous AI agents. Built entirely by **Hamza (@ham-zax)**, it provides high-signal answers, safe state handling, and predictable agent workflows through the Model Context Protocol (MCP).

Satori is optimized for production MCP + core workflows, focusing heavily on two runtime packages:
* `@zokizuan/satori-core`: Indexing, AST chunking, embeddings, vector storage, and incremental sync.
* `@zokizuan/satori-mcp`: The MCP server surface for agent tools (`manage_index`, `search_codebase`, `read_file`, `list_codebases`).

---

## 🎯 The "Why" (Project Philosophy)

Standard Retrieval-Augmented Generation (RAG) pipelines are fundamentally unsafe for autonomous coding agents. If an agent queries a 1536-dimensional vector database using a 768-dimensional model, it hallucinates disastrously or crashes the DB. Furthermore, naive text splitters slice right through function signatures, stripping away vital code structure.

**I architected Satori to solve these specific AI-engineering flaws:**
1. **Agent-Safe State Gating:** An airtight runtime fingerprinting state machine (`requires_reindex` gate) hard-locks `search_codebase` tools to specific vector dimensions, models, and database schemas. It explicitly prevents context hallucination.
2. **O(1) Incremental Sync via Merkle DAG:** Background synchronization uses an internal SHA-256 Merkle tree to track codebase changes. Instead of full $O(N)$ re-indexing, Satori calculates strict delta updates (`added`, `modified`, `removed`), saving massive API costs.
3. **AST-Aware Semantic Chunking:** Leverages `Tree-sitter` (TS/JS/PY/Java/Go/C++/Rust) to bound chunks around structural logic (functions/classes). It injects "Scope Breadcrumbs" (e.g., `Class > Method`) directly into the Milvus Hybrid Search (BM25 + Dense + RRF) pipeline, drastically improving LLM context relevance.

---

## 🏗️ Architecture & Flow

Satori is decoupled into a core data engine and a strict MCP routing surface. 

**Core Data Lineage Pipeline:**
1. **Raw File** → `Tree-sitter Parser` extracts AST Nodes.
2. **AST Splitter** → Boundaries chunks strictly on functions/classes, injects `metadata.breadcrumbs`.
3. **Embeddings** → Maps chunks to Dense/Sparse vectors via OpenAI, VoyageAI, Gemini, or Ollama.
4. **Milvus DB** → Stores chunks natively; applies Reciprocal Rank Fusion (RRF) on read.

> **View the full visual breakdown, including the State Machine and Merkle Sync flows, in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)**.

---

## 🚀 Quickstart (MCP Usage)

Satori runs as a standard stdio MCP server. You can add it directly to your Claude Desktop config or run it via `npx`.

### 1. Claude Desktop Configuration (JSON)
```json
{
  "mcpServers": {
    "satori": {
      "command": "npx",
      "args": ["-y", "@zokizuan/satori-mcp@1.0.2"],
      "timeout": 180000,
      "env": {
        "EMBEDDING_PROVIDER": "VoyageAI",
        "EMBEDDING_MODEL": "voyage-4-large",
        "EMBEDDING_OUTPUT_DIMENSION": "1024",
        "VOYAGEAI_API_KEY": "your-api-key",
        "MILVUS_ADDRESS": "your-milvus-endpoint",
        "MILVUS_TOKEN": "your-milvus-token"
      }
    }
  }
}
```

### 2. Agent Tool Surface
Once connected, the AI agent natively has access to a routing-safe, 4-tool deterministic surface:
* `manage_index`: Create, sync, check status, or clear the codebase index. (Supports `force=true` for self-healing).
* `search_codebase`: Perform semantic or hybrid search (optional reranker override).
* `read_file`: Safely read files with automatic line-range truncation.
* `list_codebases`: View tracked state and snapshot health.

---

## 💻 Developer Setup & Local Execution

**Requirements:**
- Node.js >= 20 and < 24
- pnpm >= 10
- Milvus/Zilliz endpoint and token (for real deployments)

**Install & Build:**
```bash
pnpm install
pnpm build
```

**Run Integration Tests:**
*(Validates end-to-end indexing, semantic retrieval, and incremental sync)*
```bash
pnpm test:integration
```

**Run MCP Server Locally:**
```bash
pnpm --filter @zokizuan/satori-mcp start
```

### Key Environment Variables
- `EMBEDDING_PROVIDER` (OpenAI, VoyageAI, Gemini, Ollama)
- `EMBEDDING_MODEL`
- `EMBEDDING_OUTPUT_DIMENSION` (e.g. VoyageAI supported: `256 | 512 | 1024 | 2048`)
- `OPENAI_API_KEY` / `VOYAGEAI_API_KEY` / `GEMINI_API_KEY`
- `MILVUS_ADDRESS` & `MILVUS_TOKEN`
- `VOYAGEAI_RERANKER_MODEL` (optional)
- `MCP_ENABLE_WATCHER` (optional, default `true`)

---

## 🔧 Startup Troubleshooting

If your MCP client reports startup/handshake failure (`initialize response` closed):
1. Pin a published version in config (for example `@zokizuan/satori-mcp@1.0.2`).
2. Use a larger startup timeout for cold starts (`180000` recommended).
3. Remove local link shadowing so `npx` resolves the published package:
   - `npm unlink -g @zokizuan/satori-mcp`
4. Restart MCP client after config changes.

## License
MIT © Hamza (@ham-zax)

---
*Note: Core system abstractions inspired by the [Zilliz Claude Context](https://github.com/zilliztech/claude-context) architecture.*