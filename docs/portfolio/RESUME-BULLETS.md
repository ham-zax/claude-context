# Satori: Resume Bullets & Portfolio Copy

## 1. Resume Bullets (STAR Method)

*   **Performance/Cost Optimization:** Engineered an O(1) incremental codebase synchronization engine using an in-memory Merkle DAG (SHA-256), reducing vector embedding API costs by calculating strict delta updates (`added`, `modified`, `removed`) instead of full codebase re-indexing.
*   **AI Reliability & Guardrails:** Architected an autonomous agent guardrail system via a strict runtime fingerprinting state machine (`requires_reindex` gate), eliminating context hallucination by hard-locking `search_codebase` tools to specific vector dimensions, models, and database schemas.
*   **Retrieval Quality & RAG Pipelines:** Designed an AST-aware semantic chunking pipeline utilizing Tree-sitter (TS/JS/PY/Java/Go/C++/Rust) to extract structural "Scope Breadcrumbs" (e.g., `Class > Method`), drastically improving LLM context relevance when querying Milvus Hybrid Search (BM25 + Dense Vectors + Reciprocal Rank Fusion).

---

## 2. Portfolio Website Narrative

**Satori: The "Sudden Insight" Agent-Optimized Semantic Code Indexer**

While building autonomous coding agents using the Model Context Protocol (MCP), I realized standard RAG pipelines are fundamentally unsafe for AI. If an agent tries to search a codebase that was indexed with a 1536-dimension OpenAI model, but the server is currently running a 768-dimension Gemini model, the agent will hallucinate disastrously or crash the vector database. Standard semantic search also struggles with code structure—an LLM seeing a random 500-character chunk often lacks the surrounding class or method context to make safe edits.

I built Satori to solve these architectural flaws. It is a highly decoupled semantic indexing engine featuring an airtight state machine that strictly gates tools based on runtime fingerprints (Provider, Model, Dimension, Schema). To maximize context relevance, I implemented a custom Tree-sitter AST splitter that intelligently boundaries chunks around functions and classes, injecting "Scope Breadcrumbs" into the vector metadata. Finally, to make the system economically viable for massive monorepos, I engineered an O(1) incremental sync engine using Merkle DAGs, ensuring only modified files are ever sent to the embedding API. Satori isn't just a search tool; it's a structural intelligence layer built for autonomous agent safety.

---

## 3. Tech Stack Categorization
*   **Core Systems:** TypeScript, Node.js, Model Context Protocol (MCP)
*   **Vector Infrastructure:** Milvus, Zilliz Cloud, Hybrid Search (Dense + Sparse/BM25), Reciprocal Rank Fusion (RRF)
*   **AI / ML:** OpenAI, VoyageAI, Gemini, Ollama Embeddings & Reranking
*   **Data Structures:** Merkle DAGs (SHA-256 Incremental Sync), Abstract Syntax Trees (Tree-sitter Chunking)