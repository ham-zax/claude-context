# Satori Documentation

This directory contains both **current product documentation** and **historical engineering records**. Start with the current documents below; plans, audits, research notes, and remediation records intentionally preserve the architecture that existed when they were written and may describe APIs or storage models that no longer exist.

## Current product documentation

- [`../README.md`](../README.md) — product overview, installation, runtime model, seven MCP tools, Publication/freshness model, performance benchmark, and language support.
- [`architecture/LANGUAGE_INTELLIGENCE.md`](architecture/LANGUAGE_INTELLIGENCE.md) — current language-analysis and relationship-resolution architecture, capability boundaries, and extension model.
- [`RELEASING.md`](RELEASING.md) — current release graph, qualification, npm authentication, publication, and registry verification workflow.
- [`../satori-landing/docs/index.html`](../satori-landing/docs/index.html) — end-user operational documentation used by the public site.
- [`../satori-landing/architecture.html`](../satori-landing/architecture.html) — public architecture overview for Publications, local retrieval, language intelligence, and MCP runtime behavior.

## Current architectural contract

The current system is organized around **immutable Publications**. A Publication binds the search snapshot, symbol registry, structural analysis, relationship evidence, manifest, and freshness identity into one generation. Readers acquire one Publication for a request; indexing builds a replacement in staging and promotes it only when complete.

The public MCP surface is exactly seven tools:

`manage_index`, `search_codebase`, `continue_search`, `call_graph`, `file_outline`, `read_file`, and `list_codebases`.

TypeScript, JavaScript, Python, Go, Java, C#, C++, Rust, and Scala expose production symbol navigation plus the language-specific qualified `CALLS v0` slice. `CALLS v0` is intentionally conservative and does not imply receiver/type-aware or dynamic-dispatch completeness.

Fresh local installs use Potion embeddings with LanceDB on the qualified Linux x64 / WSL2 runtime path. Advanced runtime/storage overrides are configuration choices, not the default product architecture.

## Historical engineering records

The following directories are useful design evidence, but they are **not current product contracts**:

- `plans/` — implementation plans and migration designs.
- `research/` — investigations, measurements, and external-source analysis captured at a point in time.
- `remediation/` — issue-specific remediation work and qualification records.
- `superpowers/agent-plans/` — multi-agent execution/coordination artifacts.
- `architecture/ownership-boundary-audit.md` — explicitly dated pre-clean-break architecture audit.

When a historical document conflicts with the current README, current source, current public docs, or current release tooling, treat the historical document as context for *why the system changed*, not as instructions for how Satori works now.
