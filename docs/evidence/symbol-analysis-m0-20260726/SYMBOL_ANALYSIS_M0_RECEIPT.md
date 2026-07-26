# Python Structural Analysis M0 and Release A Receipt

**Date:** 2026-07-26
**Base revision:** `2a69144be52e0b4f9ea9894dd5695666c7f7dce9`
**Corrective review base:** `384a615d002db331f9e3600d47907d5c375d41ee`
**Outcome:** `symbol_analysis_evidence_insufficient`
**Architecture candidate:** `on_demand`
**Product state:** focused Release A candidate

## Decision

The leading implemented architecture is a Python-only, on-demand extension of the existing
exact `file_outline` route:

```text
file_outline(
  path,
  file,
  resolveMode="exact",
  symbolIdExact="<canonical symbol instance id>",
  detail="analysis"
)
```

It analyzes one canonical function or method against the verified current
source. It adds no sidecar, stored schema, index contribution, publication
authority, migration, or default search/outline work.

The original M0 inventory remains bound to its recorded base. The focused
correctness and reproducibility review was performed against `384a615d002db331f9e3600d47907d5c375d41ee`.

## Metric model

The model identifier is `python_structural_v1`.

| Field | Rule |
| --- | --- |
| `parameterCount` | Counts declared receiver, ordinary, defaulted, positional-only, keyword-only, `*args`, and `**kwargs` parameters. Syntax separators are not parameters. |
| `loopCount` | Counts `for`, `while`, and each comprehension `for` clause in the selected callable. Nested callable and class scopes are excluded. |
| `maxLoopDepth` | Maximum syntactic nesting of the supported loops. Ordered comprehension `for` clauses increase depth. |
| `cyclomaticComplexity` | Base 1 plus supported `for`, `while`, comprehension `for`, `if`, `elif`, `except`, `case`, conditional-expression, comprehension-`if`, and boolean-operator decisions. |
| `signature` | Exact source syntax from the callable declaration through the text before its body. Decorators are excluded. |
| `declaredReturnType` | Exact declared return annotation, or `null` when none is declared. |

Every returned metric carries its derivation kind and `availability="available"`.
Unsupported symbols and unavailable computation fail the explicit analysis
request; partial metric payloads are not returned.

## Source and identity binding

The MCP handler:

1. acquires the existing publication read lease;
2. captures the existing prepared-source observation;
3. resolves exactly one canonical symbol;
4. reads and analyzes the current file through the existing Tree-sitter owner;
5. revalidates the prepared-source observation before returning.

If the observation changes, the analysis payload is discarded and the
non-mutating outline route returns `not_ready`. The route does not initiate
synchronization or mix publication and source generations.

## Reuse decision

The pinned Codebase Memory implementation was treated as a design and fixture
reference. No upstream source was copied. Satori's existing Tree-sitter parser
and canonical outline identity path supplied a smaller implementation without a
new dependency or foreign storage abstraction.

The installed `web-tree-sitter` version is `0.26.10`. Its JavaScript parser
callback passes JavaScript strings through `stringToUTF16` with `string.length`,
and its text extraction uses JavaScript string indices. Satori therefore treats
the installed binding's node indices as UTF-16 code-unit indices and converts
them through `Utf8SourceMap` when matching canonical byte spans. Generic native
Tree-sitter byte-offset documentation is not the contract of this installed
binding. A signature containing Unicode in the callable name, parameter names,
defaults, and annotations is covered directly.

## Focused verification

```text
Core Python structural analysis:
  7 passed, 0 failed

MCP file_outline handler and tool:
  35 passed, 0 failed

Core typecheck:
  passed

MCP typecheck:
  passed

Affected Core and MCP ESLint:
  passed

Generated MCP docs check:
  passed

Generated MCP manifest check:
  passed
```

The focused witnesses cover deterministic metrics, isolated Python decision
constructs, decorated methods, parameter forms, nested-scope exclusion, UTF-8
byte spans, duplicate short names, unrelated syntax errors, zero values versus
absent return syntax, unsupported symbols, stale identity, canonical exact
request validation, successful MCP projection, and source observation drift.

## Limits

- Python functions and methods only.
- No cognitive complexity, graph counts, recursion, hotspot, or relationship
  coverage fields.
- Cyclomatic complexity is deterministic only under
  `python_structural_v1`; it is not a language-independent universal score.
- No persistence or cross-request analysis cache.
- Broad Core/MCP suites were not run for this bounded candidate.
- Options B and C were not implemented or benchmarked.
- No representative production-repository latency, memory, or large-file
  qualification was performed.

Therefore this receipt establishes on-demand analysis as the smallest leading
candidate and a focused implementation result. It does not claim that M0's
storage comparison or final Release A qualification is complete.
