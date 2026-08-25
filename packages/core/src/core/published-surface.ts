import ts from "typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PublishedSurfaceSnapshot = {
    rootExportNames: string[];
    integrationExportNames: string[];
};

function collectModuleExportNames(
    program: ts.Program,
    checker: ts.TypeChecker,
    filePath: string,
): string[] {
    const source = program.getSourceFile(filePath);
    if (!source) {
        throw new Error(`Published surface: source file is unavailable: ${filePath}`);
    }
    const moduleSymbol = (source as ts.SourceFile & { symbol?: ts.Symbol }).symbol;
    if (!moduleSymbol) {
        throw new Error(`Published surface: module has no symbol: ${filePath}`);
    }
    return [...new Set(checker.getExportsOfModule(moduleSymbol).map((symbol) => symbol.name))].sort();
}

/**
 * Computes the deliberately supported Core product and first-party integration
 * entrypoint exports. The contract fixture is an allowlist for these two small
 * package surfaces; it no longer freezes every public Context member or
 * incidental internal barrel export.
 */
export function collectPublishedSurface(): PublishedSurfaceSnapshot {
    // tsx executes this module as ESM; the CJS build typing does not apply.
    // @ts-expect-error TS1470: import.meta is available at runtime under tsx.
    const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
    const rootFile = path.resolve(moduleDirectory, "..", "index.ts");
    const integrationFile = path.resolve(moduleDirectory, "..", "integration.ts");
    const options: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        lib: ["lib.es2022.d.ts"],
        skipLibCheck: true,
    };
    const program = ts.createProgram([rootFile, integrationFile], options);
    const checker = program.getTypeChecker();
    return {
        rootExportNames: collectModuleExportNames(program, checker, rootFile),
        integrationExportNames: collectModuleExportNames(program, checker, integrationFile),
    };
}
