import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PublishedSurfaceSnapshot = {
    barrelExportNames: string[];
    contextPublicMemberNames: string[];
    contextPublicMemberSignatures: Record<string, string>;
    selectedExportDeclarations: Record<string, string>;
};

const SELECTED_EXPORT_DECLARATION_NAMES = [
    "IndexMutationOptions",
    "PreparedIndexCollectionBinding",
    "PreparedIndexCollectionReceipt",
] as const;

/**
 * Phase 8.1 — computes the published Core package surface: every top-level
 * export name the src/index.ts barrel resolves, plus the public member names
 * and normalized type signatures of the Context class. Regenerate the fixture
 * only under breaking-API authorization.
 */
export function collectPublishedSurface(): PublishedSurfaceSnapshot {
    // tsx executes this module as ESM; the CJS build typing does not apply.
    // @ts-expect-error TS1470: import.meta is available at runtime under tsx.
    const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
    const indexFile = path.resolve(moduleDirectory, "..", "index.ts");
    const options: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        lib: ["lib.es2022.d.ts"],
        skipLibCheck: true,
    };
    const program = ts.createProgram([indexFile], options);
    const checker = program.getTypeChecker();
    const indexSource = program.getSourceFile(indexFile);
    if (!indexSource) {
        throw new Error("Published surface: index source file is unavailable.");
    }
    const indexModuleSymbol = (
        indexSource as ts.SourceFile & { symbol?: ts.Symbol }
    ).symbol;
    if (!indexModuleSymbol) {
        throw new Error("Published surface: index module has no symbol.");
    }
    const exports = checker.getExportsOfModule(indexModuleSymbol);
    const barrelExportNames = [...new Set(exports.map((symbol) => symbol.name))].sort();
    const contextSymbol = exports.find((symbol) => symbol.name === "Context");
    if (!contextSymbol) {
        throw new Error("Published surface: Context is not exported from the barrel.");
    }
    const contextType = checker.getDeclaredTypeOfSymbol(contextSymbol);
    const contextPublicMembers = checker
        .getPropertiesOfType(contextType)
        .filter((property) => {
            const declaration = property.getDeclarations()?.[0];
            if (!declaration) return true;
            const flags = ts.getCombinedModifierFlags(declaration);
            return !(flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected));
        })
        .sort((left, right) => (
            left.name < right.name ? -1 : left.name > right.name ? 1 : 0
        ));
    const contextPublicMemberNames = contextPublicMembers.map((property) => property.name);
    const contextPublicMemberSignatures = Object.fromEntries(
        contextPublicMembers.map((property) => {
            const declaration = property.getDeclarations()?.[0] ?? contextSymbol.valueDeclaration ?? indexSource;
            const type = checker.getTypeOfSymbolAtLocation(property, declaration);
            const signature = checker.typeToString(
                type,
                declaration,
                ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
            ).replace(/\s+/g, " ").trim();
            return [property.name, signature];
        }),
    );
    const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
    const selectedExportDeclarations = Object.fromEntries(
        SELECTED_EXPORT_DECLARATION_NAMES.map((name) => {
            const symbol = exports.find((candidate) => candidate.name === name);
            const declarationSymbol = symbol && symbol.flags & ts.SymbolFlags.Alias
                ? checker.getAliasedSymbol(symbol)
                : symbol;
            const declaration = declarationSymbol?.getDeclarations()?.[0];
            if (!declaration) {
                throw new Error(`Published surface: selected export '${name}' has no declaration.`);
            }
            const text = printer
                .printNode(ts.EmitHint.Unspecified, declaration, declaration.getSourceFile())
                .replace(/\s+/g, " ")
                .trim();
            return [name, text];
        }),
    );
    return {
        barrelExportNames,
        contextPublicMemberNames,
        contextPublicMemberSignatures,
        selectedExportDeclarations,
    };
}
