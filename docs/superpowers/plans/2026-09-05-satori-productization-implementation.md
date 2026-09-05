# Satori Productization Implementation Plan

**Goal:** Repackage Satori as a clear, desirable repository-intelligence product whose README, docs, homepage, and architecture pages teach developers what it does, why it matters, how to use it, and what technical capabilities and trust boundaries it provides.

**Architecture:** Keep Satori's runtime architecture unchanged and productize the current truth. The root README becomes the canonical product entry point, `docs/PRODUCT_GUIDE.md` becomes the guided learning/workflow document, `docs/README.md` becomes the documentation map, package docs remain the operational MCP reference, and the static landing/docs/architecture pages share one outcome-first visual language through the existing `site.css` shell plus page-specific markup/styles. Existing automatic-maintenance changes in the dirty working tree must be preserved and accurately explained.

**Tech Stack:** Markdown, static HTML/CSS, existing vanilla JavaScript copy interactions, existing MCP docs generator, current Satori product/runtime contracts.

## Global Constraints

- Follow `docs/superpowers/specs/2026-09-05-satori-productization-design.md`.
- Preserve every current automatic-reindex/lifecycle repair already present in the working tree.
- Do not change runtime behavior merely to simplify product copy.
- Lead with repository understanding and user outcomes; MCP and Publication terminology support the story rather than lead it.
- Describe Satori as a local repository-intelligence database/layer, not a general project-memory service.
- Keep CALLS v0 explicitly conservative/advisory, not compiler-complete blast-radius analysis.
- Do not invent universal token-savings percentages or unsupported benchmark claims.
- Describe automatic reindex only for managed offline runtimes and retain explicit operator recovery for connected, unsafe, unavailable, or failed automatic maintenance states.
- Keep the static website static; do not add authentication, analytics, hosted repository ingestion, or a web backend.
- Preserve the dark, technical, sharp Satori visual identity; avoid generic gradient-heavy SaaS styling and fake chat interfaces.
- Historical engineering documents remain historical and are not rewritten for cosmetic consistency.

## File Map

### New

- `docs/PRODUCT_GUIDE.md` — durable GitHub-readable learning path: product mental model, first-use flow, practical workflows, feature map, maintenance model, trust boundaries, and FAQ.
- `docs/superpowers/plans/2026-09-05-satori-productization-implementation.md` — this execution plan.

### Rewrite / substantial restructure

- `README.md` — canonical product page and installation/onboarding entry point.
- `satori-landing/index.html` — outcome-first marketing/product experience with repository-intelligence visualization, example query flow, use cases, local-first section, maintenance section, evidence, and quickstart.
- `satori-landing/docs/index.html` — learning-path-first public docs while retaining operational reference depth.

### Focused alignment

- `docs/README.md` — current documentation index and learning-path map.
- `packages/mcp/README.md` — package-focused operational explanation aligned with product vocabulary.
- `packages/mcp/scripts/generate-docs.ts` — generated tool summary language aligned with the product contract.
- `satori-landing/architecture.html` — product mental-model introduction, repository-intelligence layers, and current automatic-maintenance lifecycle explanation.
- `satori-landing/site.css` — shared typography, navigation, section rhythm, product diagrams, feature bands, workflow panels, responsive behavior, and consistency across home/docs/architecture.

### Existing implementation files intentionally not productized

The current dirty runtime files under `packages/mcp/src/**` are part of the already-approved automatic-maintenance repair. This productization pass may describe their behavior but should not broaden or refactor them.

---

### Task 1: Establish the canonical product narrative and guided documentation

**Files:**
- Create: `docs/PRODUCT_GUIDE.md`
- Modify: `docs/README.md`

**Interfaces:**
- Consumes: approved productization design, current README/runtime truth, seven-tool MCP surface, current automatic-maintenance behavior.
- Produces: one durable learning path that later README/site surfaces can mirror without inventing separate product stories.

**Steps:**
- [ ] Write `docs/PRODUCT_GUIDE.md` around the mental model `Repository -> Intelligence Database -> Ask -> Locate Owner -> Trace -> Read Exact Source`.
- [ ] Explain the five primary jobs: learn an unfamiliar repository, investigate bugs, plan changes/refactors, reduce context waste, and keep repository intelligence current.
- [ ] Add a concrete “things to ask Satori” section with realistic repository questions.
- [ ] Explain what the repository-intelligence database contains: chunks, semantic embeddings, BM25/lexical evidence, identifiers, symbols, spans, outlines, relationships, checkpoints, policy, and Publication generations.
- [ ] Add workflow chapters for onboarding, debugging, refactor planning, exact source inspection, relationship tracing, and multi-agent/local-model use.
- [ ] Explain Publication in user language before implementation details.
- [ ] Document freshness, incremental sync, automatic managed-offline reindex, failure suppression, and manual recovery boundaries.
- [ ] Add privacy/local-first, runtime choices, language support pointer, limitations, and FAQ.
- [ ] Rewrite `docs/README.md` as a “start here / learn / operate / architecture / historical records” map and link `PRODUCT_GUIDE.md` prominently.

**Acceptance criteria:**
- A reader can understand what Satori is and complete a conceptual first-use journey without learning all seven tool schemas first.
- The guide clearly separates product capabilities, implementation concepts, and limitations.
- Current product docs are visibly distinguished from historical plans/research.

---

### Task 2: Rewrite the root README as the product entry point

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `docs/PRODUCT_GUIDE.md`, existing installation commands, current benchmark numbers/caveats, runtime choices, language support, package layout, current automatic-maintenance behavior.
- Produces: the canonical first-contact product page for GitHub/npm visitors.

**Steps:**
- [ ] Replace the implementation-led opening with the product promise: “Understand any codebase before you touch it.”
- [ ] Define Satori immediately as a local repository-intelligence database/layer for developers and coding agents.
- [ ] Add a 30-second example showing a plain-English repository question and the evidence path Satori enables.
- [ ] Add “What you can ask Satori” before implementation architecture.
- [ ] Add “What Satori knows” as an understandable feature map of the indexed knowledge layer.
- [ ] Group features into retrieval, code map/structure, exact source, relationships, freshness/self-maintenance, local-first runtime, and shared runtime.
- [ ] Keep the two-command install above the fold/near the top and add a first-five-minutes flow for indexing and asking the first useful question.
- [ ] Add practical use cases: unfamiliar codebases, bug hunts, refactors, smaller/local models, multi-agent work.
- [ ] Explain supported clients and runtime choices without forcing users through provider internals first.
- [ ] Move benchmark evidence below product/use-case understanding while preserving exact measured values and caveats.
- [ ] Explain Publication and atomic generations after the user already understands why they matter.
- [ ] Preserve privacy, limitations, language support, packages, development, and license sections in a clearer hierarchy.
- [ ] Link the product guide, public docs, architecture page, language architecture, and release docs.

**Acceptance criteria:**
- The first screen/section answers what Satori is, why to use it, whether it is local, and how to install it.
- A developer sees example questions and practical use cases before detailed architecture.
- All benchmark and graph-completeness caveats remain accurate.
- The automatic-maintenance wording matches the current working-tree repair.

---

### Task 3: Align package-level MCP documentation and generated summaries

**Files:**
- Modify: `packages/mcp/README.md`
- Modify: `packages/mcp/scripts/generate-docs.ts`

**Interfaces:**
- Consumes: root product vocabulary and the existing seven-tool MCP schemas.
- Produces: package docs that remain operationally precise while explaining how the MCP server contributes to repository understanding.

**Steps:**
- [ ] Rewrite the package README introduction around “the MCP runtime behind Satori's repository-intelligence layer”.
- [ ] Preserve install/runtime boundary details and all operational constraints.
- [ ] Add a compact workflow showing `search_codebase -> owner -> outline/call_graph -> read_file`.
- [ ] Explain automatic managed-offline reindex as background maintenance, with explicit reindex as operator fallback.
- [ ] Update generated `manage_index` summary copy to match the current product contract and avoid contradictory wording.
- [ ] Keep tool names, schema semantics, and runtime/provider boundaries unchanged.

**Acceptance criteria:**
- Package users understand the MCP server's role without mistaking it for a separate product.
- Generated tool docs and hand-written package docs use the same maintenance vocabulary.

---

### Task 4: Rebuild the landing homepage around repository understanding

**Files:**
- Modify: `satori-landing/index.html`
- Modify: `satori-landing/site.css`

**Interfaces:**
- Consumes: approved visual direction, root README narrative, existing logo/assets, existing install/copy interactions, current benchmark evidence.
- Produces: a static homepage that communicates product value before architecture and looks materially more intentional than a uniform card grid.

**Steps:**
- [ ] Change navigation to emphasize Product, Use Cases, Docs, Architecture, and GitHub; keep contact secondary.
- [ ] Rebuild the hero around “Understand any codebase before you touch it” with local intelligence database copy, supported-client/local-first trust signals, install command, and primary CTAs.
- [ ] Replace first-contact “Publication rail” terminology with a repository-intelligence map showing repository -> semantic/lexical index -> symbols/structure -> relationships/freshness -> exact evidence.
- [ ] Add a prominent “Ask your repository” terminal/product panel using a realistic query and evidence stages rather than a fake conversational chat.
- [ ] Add an outcome band explaining learn, locate, trace, verify, and change with Satori as the intelligence layer rather than editor.
- [ ] Reorganize features into a few major capability bands instead of equal-weight card grids.
- [ ] Add dedicated use-case storytelling for onboarding, debugging, change planning, local models, and multi-agent work.
- [ ] Add a strong “local intelligence, maintained for you” section covering Potion, BM25, LateOn, LanceDB, shared runtime, source drift, sync, atomic Publications, and automatic managed-offline reindex.
- [ ] Place measured benchmark evidence after product comprehension/use cases and retain caveats.
- [ ] Keep the quickstart concise and make the first useful prompt explicit.
- [ ] Improve spacing, typography scale, visual rhythm, panel hierarchy, responsive ordering, and CTA treatment in `site.css` while preserving the dark/lime identity.
- [ ] Reuse current accessible focus behavior, copy buttons, semantic headings, and mobile-safe layout.

**Acceptance criteria:**
- Homepage hierarchy is visibly outcome-first and less card-uniform.
- The primary diagram can be understood without knowing what a Publication is.
- At least one real-use example shows how a question becomes exact source evidence.
- Product, local/privacy, use cases, automatic maintenance, and measured evidence are visually distinct sections.
- Desktop and mobile layouts preserve coherent reading order.

---

### Task 5: Turn the public docs page into a learning path plus reference

**Files:**
- Modify: `satori-landing/docs/index.html`
- Modify: `satori-landing/site.css`

**Interfaces:**
- Consumes: `docs/PRODUCT_GUIDE.md`, current operational HTML docs, tool schemas, runtime setup, language/navigation contract.
- Produces: public docs that support both first-time learning and detailed operational lookup.

**Steps:**
- [ ] Rework the docs hero and quick navigation around Start here, Concepts, Workflows, Tools, Operations, and Architecture.
- [ ] Add a “What is Satori?” section before setup details.
- [ ] Add a five-minute quickstart with install, index, ask, inspect exact evidence, and continue working.
- [ ] Add the repository-intelligence database mental model and accessible Publication definition.
- [ ] Add practical workflow sections for unfamiliar repository onboarding, bug investigation, and refactor/change planning.
- [ ] Keep search, exact source, file outline, call graph, and continuation details in a dedicated tools/reference section.
- [ ] Preserve runtime setup, repo profiles, lifecycle/status, warnings, debugging, troubleshooting, and boundaries.
- [ ] Expand maintenance docs to explain ordinary sync versus automatic managed-offline reindex versus explicit operator recovery.
- [ ] Add/strengthen FAQ and privacy/trust guidance where it reduces first-time ambiguity.
- [ ] Use shared CSS components for docs learning-path rails, concept cards, callouts, and workflow steps without making the docs look like the marketing homepage.

**Acceptance criteria:**
- A new user can move from “what is this?” to a first useful query without reading the tool reference front-to-back.
- Experienced users can still find all current operational details and seven-tool reference material.
- Automatic maintenance and fallback behavior are described consistently with README/package docs.

---

### Task 6: Align the architecture page with the product mental model

**Files:**
- Modify: `satori-landing/architecture.html`
- Modify: `satori-landing/site.css`

**Interfaces:**
- Consumes: existing deep architecture content and current Publication/mutation lifecycle.
- Produces: an architecture page whose first sections explain why the architecture exists before exposing internal mechanics.

**Steps:**
- [ ] Rewrite the architecture hero to frame Satori as a coherent repository-intelligence database with one active Publication generation.
- [ ] Add/clarify the layered model: retrieval evidence, symbol/structure navigation, relationship evidence, source freshness, Publication authority, and shared runtime.
- [ ] Keep detailed Publication diagrams and current technical explanations.
- [ ] Update lifecycle copy and state-machine labels so automatic managed-offline reindex and explicit operator override are visually distinct.
- [ ] Ensure the architecture page repeats the conservative call-graph and fail-closed navigation boundaries.
- [ ] Harmonize typography, section rhythm, and navigation with the homepage/docs through `site.css`.

**Acceptance criteria:**
- A technically sophisticated reader can connect the product promise to the Publication architecture immediately.
- Existing architecture depth is retained rather than replaced by marketing copy.
- Current automatic-maintenance semantics are visible and accurate.

---

### Task 7: Cross-surface consistency and product polish

**Files:**
- Modify as needed: `README.md`, `docs/README.md`, `docs/PRODUCT_GUIDE.md`, `packages/mcp/README.md`, `packages/mcp/scripts/generate-docs.ts`, `satori-landing/index.html`, `satori-landing/docs/index.html`, `satori-landing/architecture.html`, `satori-landing/site.css`

**Interfaces:**
- Consumes: outputs of Tasks 1-6.
- Produces: one consistent product vocabulary, navigation model, maintenance story, and visual family.

**Steps:**
- [ ] Normalize repeated product phrases: repository-intelligence database/layer, Publication definition, local-first/offline wording, automatic maintenance boundary, and relationship limitations.
- [ ] Remove stale instructions that tell managed offline users to ask for or manually initiate routine rebuild-safe reindexing.
- [ ] Ensure no copy implies autonomous source mutation.
- [ ] Ensure benchmark values and caveats are consistent wherever repeated.
- [ ] Check internal links and page anchors after section restructuring.
- [ ] Regenerate/check MCP README tool summaries using the existing docs generator contract.
- [ ] Inspect the homepage, docs, and architecture pages at desktop and narrow/mobile widths in the local browser and correct hierarchy, overflow, readability, and navigation issues.
- [ ] Review the final working-tree diff to confirm the earlier runtime repair remains intact and productization did not widen implementation scope.

**Acceptance criteria:**
- README, GitHub docs, package docs, homepage, docs site, and architecture page read as one product.
- Product terminology is consistent across surfaces.
- No stale manual-reindex-first instruction remains in current product documentation for the managed offline happy path.
- Generated MCP documentation remains synchronized.
- Visual inspection shows no broken hierarchy, obvious overflow, or mobile ordering regressions on the three public pages.

## Rollout / Risk Notes

- The repository is already dirty with an approved runtime repair; productization edits overlap several documentation files touched by that repair. Always mutate the current working-tree version and preserve those maintenance paragraphs rather than recreating files from `HEAD`.
- `README.md`, `packages/mcp/README.md`, `satori-landing/docs/index.html`, and `satori-landing/architecture.html` currently contain automatic-reindex wording from the repair. Their rewritten versions must carry that behavior forward.
- The homepage is static and intentionally has no product backend. Any “demo” must be a truthful product visualization, not a live-query claim.
- Benchmarks are repository-specific measurements. Keep existing labels such as exploratory/qualification where applicable.
- The root README should stay skimmable despite feature completeness; move operational depth into `docs/PRODUCT_GUIDE.md` and public docs rather than duplicating every detail everywhere.
