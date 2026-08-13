import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PublishedSurfaceSnapshot = {
    barrelExportNames: string[];
    contextPublicMemberNames: string[];
};

/**
 * Phase 8.1 — computes the published Core package surface as a NAME set:
 * every top-level export name the src/index.ts barrel resolves, plus the
 * public member names of the Context class. Type-shape churn must not fail
 * the freeze; only the name set is frozen. Regenerate the fixture only under
 * breaking-API authorization.
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
    const contextPublicMemberNames = checker
        .getPropertiesOfType(contextType)
        .filter((property) => {
            const declaration = property.getDeclarations()?.[0];
            if (!declaration) return true;
            const flags = ts.getCombinedModifierFlags(declaration);
            return !(flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected));
        })
        .map((property) => property.name)
        .sort();
    return { barrelExportNames, contextPublicMemberNames };
}
