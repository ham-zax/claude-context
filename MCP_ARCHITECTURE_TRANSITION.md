# MCP Architecture Transition

Detailed architectural evolution of `@zokizuan/claude-context-mcp` from its earlier monolithic shape to the current agent-optimized modular model.

---

## System Architecture: Before vs. After

```text
===================================================================================
                             BEFORE (Pre-v1.0.0)
                     "The Monolithic God-File Era"
===================================================================================

[ MCP Client (Claude) ]
       |
       v
[ index.ts (God Router) ] <------- (Direct process.env checks scattered everywhere)
       |
       | (Large multi-case switch statement)
       v
[ handlers.ts (God File) ]
   |- handleIndexCodebase()     ---> [ v2 Snapshot ] (No robust fingerprint gate)
   |- handleSearchCode()
   |- handleSearchAndRerank()   ---> [ Vector DB ] (Limited safety boundaries)
   |- handleSyncCodebase()
   `- ... (additional redundant tool surfaces)

===================================================================================
                            AFTER (Phases 1, 2, & 3)
                   "The Modular, Agent-Optimized Era"
===================================================================================

[ MCP Client (Claude) ]
       |
 (ListTools / CallTool)
       v
[ index.ts (Lightweight Bootstrapper) ] <--- [ scripts/generate-docs.ts (CI Hook) ]
       |
       v
[ Tool Registry (O(1) Lookup) ] ----------> [ Zod Schemas ] (Single Source of Truth)
       |
       +---------------------------+---------------------------+----------------------+
       v                           v                           v                      v
[ manage_index.ts ]     [ search_codebase.ts ]      [ read_file.ts ]     [ list_codebases.ts ]
 (create/sync/clear)     (Auto-rerank logic)         (Auto-truncation)    (Status reporter)
       |                           |                           |                      |
       |                           +-----> [ Telemetry Logger ]                       |
       |                                   (stderr JSON)                              |
       v                                                                              v
===================================================================================
            [ ToolContext ] (Dependency Injection Container)
===================================================================================
       |
       +-----> [ CapabilityResolver ] (env -> capability matrix: reranker, limits, profile)
       |
       +-----> [ SnapshotManager ] ---> [ v3 Snapshot ] (index fingerprint tracking)
       |                                   `-> [ Access Gate ] (strict block + train-in-error)
       |
       `-----> [ Context / VectorStore / Embedding / Reranker Ports ]
```

---

## Phase-by-Phase Architectural Breakdown

### Baseline (Starting Point)

The earlier structure was tightly coupled:
- `index.ts` handled heavy routing concerns.
- `handlers.ts` accumulated many responsibilities (I/O, formatting, state transitions, data access).
- Multiple overlapping tools increased cognitive load for LLM callers.
- State safety around model/provider/dimension transitions was weaker (legacy snapshot assumptions).

### Phase 1: State Safety + Cognitive Load Reduction

Goal: protect data and reduce tool selection ambiguity.

- **9-to-4 Tool Surface Hard Break**
  - Consolidated to:
    - `manage_index`
    - `search_codebase`
    - `read_file`
    - `list_codebases`
- **Capability Resolver**
  - Execution decisions use capability APIs (`hasReranker`, limits, profile) instead of scattering env checks.
- **Snapshot v3 + Fingerprinting**
  - Index metadata now tracks provider/model/dimension/schema/runtime compatibility.
- **First-Access Compatibility Gate**
  - Incompatible or legacy-assumed entries move to `requires_reindex`.
- **Train-in-the-Error Responses**
  - Errors return actionable next commands (for autonomous recovery) instead of opaque failure text.

### Phase 2: Modularization + Canonical Schemas + Observability

Goal: reduce architecture debt and stabilize CI/documentation behavior.

- **Registry-Driven Tool Routing**
  - `src/tools/*.ts` modules define tool-specific schemas and execution wrappers.
- **ToolContext Dependency Injection**
  - Shared runtime dependencies (context, capabilities, snapshot, sync, reranker) provided via `ToolContext`.
- **Zod Canonicalization**
  - Zod is the schema source of truth; JSON Schema is generated for MCP payloads.
- **Automated Docs Pipeline**
  - `scripts/generate-docs.ts` updates tool docs; `docs:check` enforces drift prevention in CI.
- **Structured Telemetry**
  - `search_codebase` emits parseable `stderr` JSON (latency, result filtering, reranker usage, etc.).

Note:
- The handler layer still exists as an orchestration core, but tool boundaries and routing are now modularized.

### Phase 3: Context Density + Range Semantics

Goal: keep agent context windows stable on large codebases/files.

- **Range-Based `read_file`**
  - Added 1-based inclusive `start_line` and `end_line`.
- **Safe Clamping**
  - Out-of-range requests are clamped to valid boundaries (no brittle out-of-bounds failures).
- **Auto-Truncation Guard**
  - `READ_FILE_MAX_LINES` (default 1000) truncates oversized reads and appends continuation hints.

---

## Transition Summary

This transition moved the MCP package from a monolithic, high-coupling implementation to a capability-driven, state-safe, LLM-optimized integration layer:
- Smaller, clearer tool surface.
- Stronger runtime compatibility protection via fingerprint gating.
- Better observability and CI-enforced schema/doc consistency.
- More robust self-healing behavior for autonomous agent workflows.

