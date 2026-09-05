# Satori Productization Design

**Date:** 2026-09-05

## Purpose

Turn Satori from a technically strong code-intelligence project into a product a developer can understand, want, install, and use within minutes.

The product story should lead with the user outcome: Satori builds a local repository-intelligence database that helps developers and coding agents learn an unfamiliar codebase, locate behavior, trace relationships, inspect exact source, and work from current evidence without repeatedly rediscovering the repository.

MCP, Publications, Potion, LanceDB, AST extraction, reranking, and mutation lifecycle remain important, but they support the product story rather than define the opening message.

## Product Positioning

### Primary position

**A local intelligence database for your codebase.**

Satori turns a repository into a persistent, queryable code-intelligence layer for developers and coding agents. It combines semantic retrieval, exact lexical evidence, symbol ownership, parser-derived structure, conservative call relationships, exact source spans, source freshness, and atomic Publication generations.

### Primary promise

**Understand any codebase before you touch it.**

Satori should help a user move from a vague question or unfamiliar repository to grounded source evidence with less manual search, less prompt/context waste, and fewer blind edits.

### Supporting message

Your AI should understand the codebase before it changes it.

### What Satori is not

- not a code editor;
- not an autonomous patcher;
- not a generic chat-memory system;
- not a compiler-grade whole-program dependency oracle;
- not a replacement for repository tests or runtime verification.

It is repository intelligence that an agent or developer consults before and during implementation work.

## Target Users

### Primary

- developers using Codex, Claude Code, OpenCode, or another MCP-compatible coding agent;
- developers onboarding into unfamiliar or large repositories;
- developers debugging, planning refactors, or tracing feature ownership;
- users of smaller/local models who need to spend limited context on relevant source rather than repository discovery.

### Secondary

- agent-framework builders who need reusable code intelligence without implementing their own parser/index/navigation stack;
- teams that want a local-first repository knowledge layer shared by multiple compatible local coding-agent sessions.

## Core Jobs To Be Done

### 1. Learn an unfamiliar repository

A user should be able to ask where behavior lives, what owns it, what surrounding structure matters, and then inspect the exact implementation.

### 2. Investigate bugs

Move from a symptom or behavior description to likely owners, supporting evidence, qualified relationship paths, and bounded source.

### 3. Plan changes and refactors

Identify the concrete source owner and relevant call/navigation evidence before changing code.

### 4. Reduce context waste

Prefer owner-oriented results, exact symbols, and bounded source windows over broad file dumps and repeated grep chains.

### 5. Keep repository intelligence current

Satori should maintain a coherent repository Publication, detect source or runtime drift, synchronize ordinary edits, and automatically rebuild compatible-to-repair offline index states when safe.

## Product Mental Model

A new user should understand Satori with this sequence:

`Repository -> Intelligence Database -> Ask -> Locate Owner -> Trace -> Read Exact Source`

The first explanation of a Publication should be:

> A Publication is Satori's immutable snapshot of everything it knows about one coherent repository generation.

Only after that should the docs explain the vector collection, navigation sidecars, policy, source checkpoint, and activation semantics.

## What Satori Knows About A Repository

Satori's product documentation should describe the indexed knowledge layer in user terms before exposing implementation details.

### Repository intelligence database

- indexed files and bounded chunks;
- semantic embeddings;
- BM25/lexical evidence;
- exact identifiers and paths;
- symbols and qualified symbol identities;
- parser-derived structural spans;
- file outlines;
- qualified CALLS v0 relationships where supported;
- imports/exports and other supported navigation evidence;
- source freshness checkpoints;
- index selection policy and supported extensions;
- immutable Publication generations;
- current runtime compatibility and navigation readiness.

### Retrieval intelligence

- semantic search;
- BM25 lexical retrieval;
- exact evidence paths;
- fusion and owner-oriented grouping;
- local reranking in the default offline runtime;
- bounded continuation rather than unbounded context expansion.

### Exact source inspection

- exact indexed symbol reads;
- bounded line windows;
- file outlines;
- source spans designed for agent consumption instead of whole-file dumping.

### Relationship intelligence

- callers and callees where supported;
- imports/exports;
- conservative qualified calls;
- fail-closed behavior for ambiguous or unsupported relationships.

### Freshness and self-maintenance

- source drift detection;
- incremental sync for ordinary repository changes;
- complete replacement Publications;
- atomic activation;
- automatic managed-offline reindex for rebuild-safe incompatibilities;
- single-flight/coalesced mutation ownership;
- previous proven Publication preservation while replacement work is prepared where the architecture permits it;
- explicit operator recovery when automatic maintenance is unavailable, unsafe, or suppressed after failure.

### Local-first operation

- default Potion embedding runtime;
- BM25 retrieval;
- LanceDB storage;
- LateOn query-time reranking on the qualified default path;
- no model API key required for the default offline install;
- optional connected Voyage and Milvus/Zilliz configurations.

### Shared runtime

Compatible local Codex, Claude Code, OpenCode, and subagent sessions can attach to one managed local runtime and shared repository-intelligence state rather than each starting a separate heavy provider/index stack.

## User-Facing Example Questions

The README and site should teach Satori through questions users can actually ask:

- Where is refresh-token rotation implemented?
- What owns index publication?
- Find the code responsible for automatic reindexing.
- Show me the exact implementation of this method.
- What directly calls this symbol?
- Which code handles this configuration setting?
- Give me the structure of this file without dumping the entire file.
- Find code related to mutation lifetime ownership.
- Where does this user-facing error originate?
- What code should I inspect before changing this subsystem?

The examples must not imply compiler-complete blast-radius guarantees or unsupported autonomous editing.

## README Information Architecture

The root README becomes the canonical product entry point and should be reorganized in this order:

1. Product promise and one-sentence definition.
2. Thirty-second example/demo.
3. Why Satori exists.
4. What you can ask it.
5. What Satori knows about a repository.
6. Core features.
7. Two-command installation.
8. First five minutes / first repository.
9. Recommended agent workflow.
10. Use cases.
11. Supported clients.
12. Language intelligence.
13. Local/offline and connected runtime choices.
14. Freshness, sync, and automatic maintenance.
15. Benchmarks and measured evidence.
16. Architecture and Publication model.
17. Privacy, trust boundaries, and limitations.
18. Packages and development.
19. Documentation links and license.

### README copy principles

- lead with user outcomes, not implementation nouns;
- introduce one technical term only when it explains something the user already wants;
- retain concrete benchmark numbers but move them below the product/use sections;
- distinguish measured claims from design intent and exploratory evidence;
- avoid vague claims such as "AI understands everything";
- make the default install path visually obvious;
- explicitly explain that reindex maintenance is automatic on managed offline runtimes when safe;
- keep connected/paid runtime behavior conservative and explicit.

## Documentation Information Architecture

The current single-page docs remain usable, but the content hierarchy should read like a learning path rather than a flat operational reference.

### Top-level learning sequence

**Start here -> Concepts -> Workflows -> Tools -> Operations -> Architecture**

### Required documentation sections

- What is Satori?
- Five-minute quickstart.
- Mental model: repository intelligence database and Publication.
- Understanding a new repository.
- Debugging with Satori.
- Planning a refactor/change.
- Search and ranking.
- Exact symbol and source inspection.
- File outlines and structural navigation.
- Code relationships and conservative call-graph semantics.
- Repository intelligence database contents.
- Publications and atomic generations.
- Freshness, sync, automatic reindex, and explicit recovery.
- Offline runtime.
- Connected runtime.
- Language support.
- Tool reference.
- Troubleshooting.
- Security/privacy boundaries.
- Benchmarks and benchmark limitations.
- FAQ.

### Documentation behavior

Operational reference details should remain available, but first-time users should not need to understand every MCP tool before accomplishing the first useful task.

## Website Product Experience

The current visual identity is worth keeping: dark, technical, sharp, and developer-oriented. The redesign should improve hierarchy and product comprehension without turning Satori into generic gradient-heavy SaaS marketing. The homepage remains a static product page; this work does not add an authenticated web application, analytics product, hosted repository service, or interactive backend.

### Navigation

Primary navigation should emphasize:

- Product
- Use Cases
- Docs
- Architecture
- GitHub

Contact remains available but should not displace core product navigation.

### Hero

The hero should lead with:

**Understand any codebase before you touch it.**

Supporting copy should explain that Satori builds a local intelligence database the developer's coding agent can search, navigate, and interrogate.

The hero should include:

- the two-command install path;
- a clear offline/local trust signal;
- supported-client signal;
- a concise evidence visual;
- direct CTAs to install and learn how it works.

### Primary visual

Replace the first-contact "Publication rail" terminology with a user-understandable repository-intelligence map.

Suggested visual flow:

`Repository`
`  -> semantic + lexical index`
`  -> symbols + structure`
`  -> relationships`
`  -> source freshness`
`  -> exact evidence`

Publication terminology can appear inside the diagram as the coherence mechanism, not the user's first concept.

### Product demo section

Add an "Ask your repository" visual/example with a realistic prompt and the evidence journey:

`Question -> ranked owner -> outline/relationships -> exact source`

This can be presented as a terminal/product panel rather than simulated conversational AI.

### Feature hierarchy

Avoid equal-weight grids for every concept. Use three visual levels:

1. major outcome sections;
2. grouped capability panels;
3. smaller trust/evidence chips.

### Use-case storytelling

Dedicated use cases should cover:

- unfamiliar repository onboarding;
- bug investigation;
- refactor/change planning;
- local/smaller-model workflows;
- multi-agent repository work.

### Local/privacy section

Make the default offline architecture a product advantage:

- Potion embeddings;
- BM25;
- LateOn reranking;
- LanceDB;
- no model API key required after installation;
- local shared runtime;
- optional connected providers.

### Freshness section

Explain maintenance as a user benefit:

> The index is not a static cache you have to babysit.

Then explain source drift detection, sync, atomic Publication replacement, and managed offline automatic reindex in progressive detail.

### Benchmarks

Move benchmark evidence below product understanding and use cases. Preserve current measured values and caveats. Do not convert exploratory numbers into universal product claims.

## Architecture Page

The architecture page should remain technically deep, but its introduction should start from the product mental model before the detailed Publication lifecycle.

Required narrative order:

1. repository intelligence database;
2. one coherent Publication per active generation;
3. retrieval stack;
4. structural/navigation sidecars;
5. source freshness;
6. mutation and replacement lifecycle;
7. shared runtime;
8. failure and recovery boundaries.

The automatic-reindex state machine should remain visible and clearly distinguish automatic managed-offline maintenance from explicit operator overrides.

## Visual Design Direction

### Preserve

- dark technical surface;
- Satori lime accent as the primary signature;
- restrained blue/purple secondary accents;
- monospace/technical UI treatments where they communicate real product behavior;
- current logo and recognizable identity.

### Improve

- larger, clearer hero statement;
- more negative space around major sections;
- stronger type-scale contrast;
- fewer repetitive card grids;
- clearer section backgrounds/visual rhythm;
- more purposeful diagrams;
- stronger CTA hierarchy;
- consistent visual tokens between home, docs, and architecture;
- more legible mobile ordering;
- reduced visual competition between benchmarks, implementation details, and primary product outcomes.

### Avoid

- generic SaaS gradient blobs;
- fake chat screenshots;
- unsupported "AI memory" claims;
- overuse of badges/chips;
- hiding technical caveats that materially affect trust.

## Current Files In Scope

Primary current surfaces:

- `README.md`
- `packages/mcp/README.md`
- `packages/mcp/scripts/generate-docs.ts`
- `satori-landing/index.html`
- `satori-landing/docs/index.html`
- `satori-landing/architecture.html`
- supporting current site assets/styles if required by the final design

Supporting product documentation may be added under `docs/` only when it improves the learning path and avoids duplicating current operational truth.

Historical engineering records under `docs/plans/`, `docs/research/`, `docs/remediation/`, and old coordination artifacts are not marketing/product surfaces and should not be rewritten merely to match the new positioning.

## Relationship To Existing Uncommitted Repair

The working tree already contains the approved automatic-maintenance/lifecycle repair. Productization must preserve it.

The new product copy should accurately describe the behavior already implemented:

- managed offline tracked rebuild-safe incompatibilities automatically start or join reindex maintenance;
- connected/remote configurations keep explicit recovery where automatic full rebuild could be unsafe or costly;
- automatic failure is bounded/suppressed rather than retried indefinitely;
- detached mutation work is host-owned and drained;
- manual reindex remains an operator recovery override.

Productization should not widen runtime behavior merely to simplify marketing copy.

## Truth And Claim Boundaries

Every public claim must be traceable to current implementation or measured evidence.

### Safe claims

- local-first/offline default runtime on the supported deployment envelope;
- local Potion embeddings, BM25, LanceDB, and LateOn default reranking where currently qualified;
- exact symbol/source-span navigation where supported;
- parser-derived structural information;
- qualified CALLS v0 support across the currently documented production languages;
- source freshness and atomic Publication activation;
- automatic managed-offline rebuild-safe reindex behavior introduced by the current repair;
- shared managed local runtime for compatible sessions;
- current published benchmark numbers with their existing caveats.

### Claims requiring caveats

- token savings: describe the design and existing observed route reductions, not a universal percentage;
- call graphs: advisory/conservative navigation evidence, not complete compiler-grade blast-radius proof;
- model/provider comparisons: preserve frozen-task and exploratory/qualification limitations;
- "database" language: describe a repository-intelligence database/layer, not a relational application database or general project-memory store.

## Acceptance Criteria

### Product comprehension

A developer landing on the README or homepage should be able to answer within the first screen/section:

- What is Satori?
- Why would I use it?
- What can I ask it?
- Is it local/private by default?
- How do I install it?

### Learning path

A new user can move from install to first useful repository query without first understanding every MCP tool or Publication internals.

### Feature completeness

The public product surfaces clearly cover:

- repository intelligence database;
- semantic + lexical retrieval;
- symbols and structure;
- exact source inspection;
- relationship navigation;
- freshness/sync/automatic repair;
- local-first runtime;
- shared runtime;
- supported clients and languages;
- runtime choices;
- benchmarks and limitations.

### Visual quality

- homepage hierarchy is outcome-first and materially less card-uniform;
- product/demo visualization communicates actual Satori behavior;
- desktop and mobile layouts remain coherent;
- home/docs/architecture read as one product family;
- visual style remains distinctive and developer-oriented rather than generic SaaS.

### Technical accuracy

- no public copy claims unsupported autonomous code mutation;
- no call-graph completeness claim;
- no universal token-reduction percentage is invented;
- managed automatic reindex behavior is described only for the supported local/offline path;
- explicit recovery remains documented for unsafe/unavailable/failed automatic maintenance cases.

### Scope discipline

- no unrelated runtime refactor;
- no rewriting historical engineering records for cosmetic consistency;
- no new product subsystem unless required to present existing Satori capabilities clearly.

## Implementation Sequence

After this written specification is reviewed and approved:

1. create a file-level implementation plan;
2. rewrite the root README around the product mental model;
3. align package-level README/tool-generated summaries;
4. redesign the landing homepage hierarchy and product visualization;
5. restructure docs into the learning path while preserving reference depth;
6. align architecture-page introduction and lifecycle presentation;
7. verify copy consistency, links, generated-doc contracts, responsive structure, and current implementation claims;
8. review the finished product surfaces as one coherent product rather than as independent files.
