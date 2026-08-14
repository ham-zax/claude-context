import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const REPO_ROOT = path.resolve(__dirname, '..');

export const CBM_SRC_DIR = path.join(REPO_ROOT, 'third_party', 'cbm-semantic');
export const ASSETS_DIR = path.join(REPO_ROOT, 'packages', 'core', 'assets', 'semantic-engine');
export const MANIFEST_PATH = path.join(ASSETS_DIR, 'semantic-engine.manifest.json');
export const JS_PATH = path.join(ASSETS_DIR, 'satori-semantic-engine.js');
export const WASM_PATH = path.join(ASSETS_DIR, 'satori-semantic-engine.wasm');

export const PINNED_UPSTREAM_COMMIT = 'd150ebe4fc78a9a3f85013d2087a849e5d59eb0f';
export const PINNED_EMSCRIPTEN_VERSION = '3.1.64';

export const COMPILE_UNITS = [
    'common/arena.c',
    'common/scope.c',
    'common/type_rep.c',
    'common/type_registry.c',
    'languages/go/go_lsp.c',
    'languages/go/go_stdlib_data.c',
    'tree_sitter/lib.c',
    'grammars/tree-sitter-go/parser.c',
    'satori_semantic.c',
];

export const INCLUDE_DIRS = [
    '.',
    'common',
    'minimal-compat',
    'languages/go',
    'tree_sitter',
];

export const COMPILER_FLAGS = [
    '-std=c11',
    '-D_GNU_SOURCE',
    '-O3',
    '-sENVIRONMENT=node',
    '-sALLOW_MEMORY_GROWTH=1',
    '-sINITIAL_MEMORY=67108864',
    '-sMAXIMUM_MEMORY=1073741824',
    '-sSTACK_SIZE=2097152',
    '-sASSERTIONS=1',
    '-sMODULARIZE=1',
    '-sEXPORT_NAME=createSatoriSemanticEngine',
];

export const EXPORTED_FUNCTIONS = [
    '_malloc',
    '_free',
    '_satori_semantic_abi_version',
    '_satori_semantic_engine_version',
    '_satori_semantic_global_last_error_message',
    '_satori_semantic_last_error_message',
    '_satori_semantic_last_error',
    '_satori_semantic_create',
    '_satori_semantic_add_auxiliary',
    '_satori_semantic_add_source',
    '_satori_semantic_resolve',
    '_satori_semantic_destroy',
    '_satori_semantic_free',
    '_satori_semantic_result_count',
    '_satori_semantic_results',
    '_satori_semantic_relationship_count',
    '_satori_semantic_relationships',
    '_satori_semantic_definition_count',
    '_satori_semantic_definitions',
    '_satori_semantic_diagnostic_count',
    '_satori_semantic_diagnostics',
    '_satori_semantic_string_table',
    '_satori_semantic_go_smoke',
];

export const EXPORTED_RUNTIME_METHODS = [
    'ccall',
    'cwrap',
    'getValue',
    'setValue',
    'UTF8ToString',
    'stringToUTF8',
    'HEAPU8',
    'HEAP32',
    'HEAPF32',
];

export function computeLogicalRecipeDigest() {
    const logicalRecipe = {
        compiler: PINNED_EMSCRIPTEN_VERSION,
        upstreamCommit: PINNED_UPSTREAM_COMMIT,
        sources: COMPILE_UNITS,
        includes: INCLUDE_DIRS,
        flags: COMPILER_FLAGS,
        exportedFunctions: EXPORTED_FUNCTIONS,
        exportedRuntimeMethods: EXPORTED_RUNTIME_METHODS,
    };
    return crypto.createHash('sha256').update(JSON.stringify(logicalRecipe)).digest('hex');
}

export function computeSourceDigest(rootDir = CBM_SRC_DIR) {
    const files = [];

    function walk(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                if (['.c', '.h'].includes(ext)) {
                    files.push(fullPath);
                }
            }
        }
    }

    walk(rootDir);
    files.sort();

    const hash = crypto.createHash('sha256');
    for (const file of files) {
        const rel = path.relative(rootDir, file).replace(/\\/g, '/');
        const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
        hash.update(`${rel}\n${content}\n`);
    }

    return hash.digest('hex');
}
