# MCP Architecture Evolution

Comprehensive architectural evolution of `@zokizuan/satori-mcp`, from the pre-v1.0.0 monolithic phase through Phases 1, 2, and 3 into the current agent-optimized design.

---

## 1) Macro Architecture: Before vs After

This view shows the shift from centralized routing/handling to a modular registry plus capability and state safety layers.

```text
=========================================================================================
                               BEFORE (Pre-v1.0.0)
                        "The Monolithic God-File Era"
=========================================================================================
[ MCP Client ]
      |
      v
[ index.ts ] (Large switch/case router + inline tool schemas)
      |
      v
[ handlers.ts ] (God file: mixed orchestration, state, formatting, IO)
  |- handleIndexCodebase()     ---> [ v2 Snapshot ] (limited compatibility metadata)
  |- handleSearchCode()        ---> [ Vector DB ] (weaker compatibility gating)
  |- handleSearchAndRerank()   ---> (separate redundant search surface)
  `- ... additional overlapping tool operations


=========================================================================================
                               AFTER (Current v1.0.0+)
                      "The Modular, Agent-Optimized Era"
=========================================================================================
[ MCP Client (Claude) ]
      |
      v   (4 tools only: manage_index, search_codebase, read_file, list_codebases)
[ index.ts ] (Lightweight bootstrapper and router)
      |
      v
[ Tool Registry ] <---------- [ zod-to-json-schema ]
      |                                 |
      |                                 `--> [ scripts/generate-docs.ts ] -> docs:check gate
      |
      +---------------------------+---------------------------+----------------------+
      v                           v                           v                      v
[ manage_index.ts ]     [ search_codebase.ts ]      [ read_file.ts ]     [ list_codebases.ts ]
      |                           |                           |                      |
      |                           +-----> [ Telemetry ] (stderr JSON)               |
      v                                                                          (status view)
=========================================================================================
             [ ToolContext ] (Dependency Injection Container)
=========================================================================================
      |
      +-----> [ CapabilityResolver ] (provider locality/profile/reranker/limits)
      |
      +-----> [ SnapshotManager ] ---> [ v3 Snapshot + index fingerprint + access gate ]
      |
      +-----> [ SyncManager ] --------> [ FileSynchronizer + Merkle DAG delta sync ]
      |
      `-----> [ Core Engine (`packages/core`) ]
               |- Splitter (AST / LangChain)
               |- Embedding (Voyage, OpenAI, Ollama, Gemini)
               `- VectorDB (Milvus Dense / Hybrid)
```

---

## 2) Data and Control Flow: `search_codebase`

This is the current read path with compatibility enforcement, freshness sync, rerank policy, and observability.

```text
1) MCP Client calls:
     search_codebase(query="auth", path="/repo")
        |
2) Tool Registry dispatches to:
     src/tools/search_codebase.ts
        |
3) ToolContext dependencies are used:
        |
        +--> A. SnapshotManager.ensureFingerprintCompatibilityOnAccess()
        |      |- reads snapshot v3 metadata
        |      |- if legacy assumed_v2: block and return self-healing instruction
        |      `- if fingerprint mismatch: mark requires_reindex and block
        |
        +--> B. SyncManager.ensureFreshness()
        |      |- coalesces concurrent sync requests
        |      |- enforces freshness threshold
        |      `- if stale: reindexByChange() via Merkle/file deltas
        |
        `--> C. CapabilityResolver.resolveRerankDecision()
               `- resolves useReranker (force/off/auto) by runtime capability
        |
4) Core engine executes semanticSearch() (dense or hybrid RRF path)
        |
5) Optional rerank stage (VoyageAI) reorders candidates
        |
6) Telemetry emits JSON to stderr:
     { event, profile, latency_ms, excluded_by_ignore, results_returned, ... }
        |
7) Tool returns formatted response (including merged snippet context)
```

---

## 3) Codebase State Machine (Snapshot v3)

Phase 1 introduced strict state safety so incompatible indexes are blocked, not silently used.

```text
                               +-------------------+
                               |     not_found     |
                               +-------------------+
                                         |
                               (manage_index:create)
                                         |
                                         v
+-------------------+         +-------------------+
|    indexfailed    | <------ |      indexing     |
+-------------------+         +-------------------+
                                         |
                                      success
                                         |
                                         v
+-------------------+         +-------------------+
|  sync_completed   | <------ |      indexed      |
+-------------------+  sync   +-------------------+
          |                              |
          |                              |
          v                              v
=========================================================
[ FINGERPRINT MISMATCH ] or [ LEGACY ASSUMED_V2 ENTRY ]
=========================================================
                                 |
                                 v
                       +-------------------+
                       | requires_reindex  | --> returns deterministic
                       +-------------------+     self-healing instruction:
                                 |              manage_index create force=true
                        (manage_index:clear)
                                 |
                                 v
                            (not_found)
```

---

## 4) Detailed Phase Breakdown

### Phase 1: Cognitive Load and State Safety (Hard Break)

- 9-to-4 API contraction:
  - consolidated public tool surface to:
    - `manage_index`
    - `search_codebase`
    - `read_file`
    - `list_codebases`
- Snapshot v3 with index fingerprint:
  - fingerprint tracks provider/model/dimension/vector-store/schema compatibility.
- Lazy first-access gate:
  - legacy or incompatible indexes transition to `requires_reindex`.
- Train-in-the-error responses:
  - blocked states return actionable next commands instead of opaque generic failures.

### Phase 2: Modularization, Observability, Docs Automation

- Tool registry architecture:
  - tool modules in `src/tools/*` implement a strict `McpTool` surface.
- ToolContext dependency injection:
  - runtime services are injected, improving isolation and testability.
- Zod canonicalization:
  - Zod is source of truth; MCP schemas are generated via `zod-to-json-schema`.
- Continuous docs pipeline:
  - `scripts/generate-docs.ts` updates README tool docs.
  - `docs:check` enforces no drift in CI.
- Structured telemetry:
  - `search_codebase` emits parseable operational logs on `stderr`.

Implementation note:
- `handlers.ts` remains as orchestration core, but routing/tool contracts are modularized and constrained by the registry.

### Phase 3: Context Density and Range Semantics

- Range semantics in `read_file`:
  - 1-based inclusive `start_line` and `end_line`.
- Safe clamping:
  - out-of-range requests are clamped to valid file bounds.
- Auto-truncation guardrails:
  - if no range is provided and file is large, output is capped by `READ_FILE_MAX_LINES` (default 1000).
  - response includes continuation hint with next `start_line`.

---

## 5) Transformation Summary

The system evolved from a tightly coupled MCP script into a resilient integration layer for autonomous agents:
- capability-driven execution decisions.
- fingerprint-protected index safety.
- reduced tool-surface ambiguity.
- deterministic self-healing error pathways.
- schema-driven docs and telemetry-backed observability.

