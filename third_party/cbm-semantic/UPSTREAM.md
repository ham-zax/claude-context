# Upstream Provenance: CBM Semantic Engine for Satori

This directory vendors a minimal, self-contained semantic analysis closure extracted from [Codebase Memory MCP](https://github.com/DeusData/codebase-memory-mcp) and Tree-sitter, compiled to WebAssembly for language intelligence in Satori.

## Pinned Upstream References

| Component | Upstream Repository | Pinned Commit / Version | License |
|---|---|---|---|
| CBM Core & Go/Java/C#/C++/Rust Resolvers | [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) | `d150ebe4fc78a9a3f85013d2087a849e5d59eb0f` | MIT |
| Tree-sitter C Runtime | [tree-sitter/tree-sitter](https://github.com/tree-sitter/tree-sitter) | `v0.24.4` (`64f26b5272a2e8c2534cece6e3f4d6d67ddf70dc`) | MIT |
| Tree-sitter Go Grammar | [tree-sitter/tree-sitter-go](https://github.com/tree-sitter/tree-sitter-go) | `v0.23.4` (`a28f4c274719be1e2aa652eb6bd391c5dd97a3cf`) | MIT |
| Tree-sitter Java Grammar | [tree-sitter/tree-sitter-java](https://github.com/tree-sitter/tree-sitter-java) | CBM snapshot `e10607b45ff7` | MIT |
| Tree-sitter C# Grammar | [tree-sitter/tree-sitter-c-sharp](https://github.com/tree-sitter/tree-sitter-c-sharp) | CBM snapshot `88366631d598` | MIT |
| Tree-sitter C++ Grammar | [tree-sitter/tree-sitter-cpp](https://github.com/tree-sitter/tree-sitter-cpp) | CBM snapshot `8b5b49eb196b` | MIT |
| Tree-sitter Rust Grammar | [tree-sitter/tree-sitter-rust](https://github.com/tree-sitter/tree-sitter-rust) | CBM snapshot `77a3747266f4` | MIT |

## Vendored Components

1. **Common Core (`common/`)**:
   - `arena.c`, `arena.h`: Bump-pointer memory allocator for AST traversal and type structures.
   - `scope.c`, `scope.h`: Hierarchical lexical scoping table for variable and type bindings.
   - `type_rep.c`, `type_rep.h`: Structural representation of primitives, pointers, structs, interfaces, and function signatures.
   - `type_registry.c`, `type_registry.h`: Project-wide type and function definition registry with field and method resolution.

2. **Language Resolvers (`languages/`)**:
   - `go/`: package-aware Go resolver and standard-library signatures.
   - `java/`: Java class/method resolver and standard-library signatures.
   - `csharp/`: C# namespace/type/method resolver and standard-library signatures.
   - `cpp/`: C/C++ function/type resolver and standard-library signatures; Satori invokes it in C++ mode for both `.c` and C++ extensions.
   - `rust/`: Rust module/type/call resolver, Cargo manifest parser, and standard-library/crate seed data.

3. **Tree-sitter Runtime (`tree_sitter/`)**:
   - `api.h` and C parser runtime implementation (`lib.c`, `alloc.c`, `parser.c`, `node.c`, `tree.c`, etc.).

4. **Tree-sitter Grammars (`grammars/`)**:
   - `tree-sitter-go/`, `tree-sitter-java/`, `tree-sitter-c-sharp/`, `tree-sitter-cpp/`, and `tree-sitter-rust/` contain the generated parser/scanner closure pinned by the table above.

5. **Satori Bridge & ABI (`satori_semantic.h`, `satori_semantic.c`)**:
   - Fixed-width 64-byte POD result structures (`SatoriSemanticResultV1`), UTF-8 string table, and memory-safe isolated handle lifecycle.

## License Notices

All vendored components are licensed under the MIT License. See `packages/core/assets/semantic-engine/THIRD_PARTY_LICENSES.md` for full license texts.
