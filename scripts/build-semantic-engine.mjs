#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const CBM_SRC_DIR = path.join(REPO_ROOT, 'third_party', 'cbm-semantic');
const ASSETS_DIR = path.join(REPO_ROOT, 'packages', 'core', 'assets', 'semantic-engine');
const MANIFEST_PATH = path.join(ASSETS_DIR, 'semantic-engine.manifest.json');
const JS_PATH = path.join(ASSETS_DIR, 'satori-semantic-engine.js');
const WASM_PATH = path.join(ASSETS_DIR, 'satori-semantic-engine.wasm');

import os from 'node:os';
import { createRequire } from 'node:module';

const PINNED_UPSTREAM_COMMIT = 'd150ebe4fc78a9a3f85013d2087a849e5d59eb0f';
const PINNED_EMSCRIPTEN_VERSION = '3.1.64';
const localRequire = createRequire(import.meta.url);

function computeSourceDigest() {
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

    walk(CBM_SRC_DIR);
    files.sort();

    const hash = crypto.createHash('sha256');
    for (const file of files) {
        const rel = path.relative(CBM_SRC_DIR, file).replace(/\\/g, '/');
        const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
        hash.update(`${rel}\n${content}\n`);
    }

    return hash.digest('hex');
}

function findEmcc() {
    const candidatePaths = [
        'emcc',
        path.join(process.env.HOME || '', 'emsdk', 'upstream', 'emscripten', 'emcc'),
        path.join(process.env.HOME || '', '.emsdk', 'upstream', 'emscripten', 'emcc'),
        '/opt/emsdk/upstream/emscripten/emcc',
    ];

    for (const candidate of candidatePaths) {
        try {
            const output = execFileSync(candidate, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
            return { path: candidate, versionOutput: output.split('\n')[0] };
        } catch {
            // try next
        }
    }
    return null;
}

async function build() {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    const sourceDigest = computeSourceDigest();
    const emcc = findEmcc();

    if (!emcc) {
        throw new Error(`Emscripten (${PINNED_EMSCRIPTEN_VERSION}) not found. Please install and activate emsdk.`);
    }

    const versionMatch = emcc.versionOutput.match(/emcc.*?(\d+\.\d+\.\d+)/);
    const foundVersion = versionMatch ? versionMatch[1] : null;
    if (foundVersion !== PINNED_EMSCRIPTEN_VERSION) {
        throw new Error(`Emscripten version mismatch: found "${foundVersion}" (${emcc.versionOutput}), expected strictly "${PINNED_EMSCRIPTEN_VERSION}".`);
    }

    console.log(`Found Emscripten: ${emcc.versionOutput}`);
    const cSources = [
        path.join(CBM_SRC_DIR, 'common', 'arena.c'),
        path.join(CBM_SRC_DIR, 'common', 'scope.c'),
        path.join(CBM_SRC_DIR, 'common', 'type_rep.c'),
        path.join(CBM_SRC_DIR, 'common', 'type_registry.c'),
        path.join(CBM_SRC_DIR, 'languages', 'go', 'go_lsp.c'),
        path.join(CBM_SRC_DIR, 'languages', 'go', 'go_stdlib_data.c'),
        path.join(CBM_SRC_DIR, 'tree_sitter', 'lib.c'),
        path.join(CBM_SRC_DIR, 'grammars', 'tree-sitter-go', 'parser.c'),
        path.join(CBM_SRC_DIR, 'satori_semantic.c'),
    ];

    const includeFlags = [
        `-I${CBM_SRC_DIR}`,
        `-I${path.join(CBM_SRC_DIR, 'common')}`,
        `-I${path.join(CBM_SRC_DIR, 'minimal-compat')}`,
        `-I${path.join(CBM_SRC_DIR, 'languages', 'go')}`,
        `-I${path.join(CBM_SRC_DIR, 'tree_sitter')}`,
    ];

    const exportedFunctions = [
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

    const tempDir = fs.mkdtempSync(path.join(ASSETS_DIR, '.tmp-build-'));
    const tempJsPath = path.join(tempDir, 'satori-semantic-engine.js');
    const tempWasmPath = path.join(tempDir, 'satori-semantic-engine.wasm');

    const emccArgs = [
        '-std=c11',
        '-D_GNU_SOURCE',
        '-O3',
        ...includeFlags,
        ...cSources,
        '-sENVIRONMENT=node',
        '-sALLOW_MEMORY_GROWTH=1',
        '-sINITIAL_MEMORY=67108864',
        '-sMAXIMUM_MEMORY=1073741824',
        '-sSTACK_SIZE=2097152',
        '-sASSERTIONS=1',
        '-sMODULARIZE=1',
        '-sEXPORT_NAME=createSatoriSemanticEngine',
        `-sEXPORTED_FUNCTIONS=[${exportedFunctions.map(f => `'${f}'`).join(',')}]`,
        `-sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue','UTF8ToString','stringToUTF8','HEAPU8','HEAP32','HEAPF32']`,
        '-o', tempJsPath,
    ];

    const recipeContent = emccArgs.map(a => a.replace(REPO_ROOT, '<REPO_ROOT>')).join('\n');
    const buildRecipeDigest = crypto.createHash('sha256').update(recipeContent).digest('hex');

    try {
        console.log(`Compiling WASM semantic engine in temporary directory ${tempDir}...`);
        execFileSync(emcc.path, emccArgs, { stdio: 'inherit', cwd: REPO_ROOT });

        if (!fs.existsSync(tempJsPath) || !fs.existsSync(tempWasmPath)) {
            throw new Error(`Build failed or artifacts missing in temp dir: ${tempJsPath} / ${tempWasmPath}`);
        }

        const jsBytes = fs.readFileSync(tempJsPath);
        const wasmBytes = fs.readFileSync(tempWasmPath);
        if (jsBytes.length === 0 || wasmBytes.length === 0) {
            throw new Error(`Built artifacts are empty: JS ${jsBytes.length} bytes, WASM ${wasmBytes.length} bytes`);
        }

        // Validate candidate module instantiation
        const createCandidate = localRequire(tempJsPath);
        const candidateInstance = await createCandidate();
        const abiVersion = candidateInstance._satori_semantic_abi_version();
        if (abiVersion !== 1) {
            throw new Error(`Candidate engine returned invalid ABI version: ${abiVersion}`);
        }

        const jsSha256 = crypto.createHash('sha256').update(jsBytes).digest('hex');
        const wasmSha256 = crypto.createHash('sha256').update(wasmBytes).digest('hex');

        // Atomically replace assets into place on the same filesystem
        fs.renameSync(tempJsPath, JS_PATH);
        fs.renameSync(tempWasmPath, WASM_PATH);

        const manifest = {
            abiVersion: 1,
            upstreamCommit: PINNED_UPSTREAM_COMMIT,
            emscriptenVersion: PINNED_EMSCRIPTEN_VERSION,
            semanticSourceDigest: sourceDigest,
            buildRecipeDigest,
            jsSha256,
            wasmSha256,
            languages: {
                go: {
                    semanticRevision: 'go-v1',
                    grammar: 'tree-sitter-go',
                },
            },
        };

        // Manifest written last
        fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
        console.log(`✔ Generated manifest at ${MANIFEST_PATH}`);
        console.log(`  Source Digest: ${sourceDigest}`);
        console.log(`  Recipe Digest: ${buildRecipeDigest}`);
        console.log(`  JS Digest:     ${jsSha256}`);
        console.log(`  WASM Digest:   ${wasmSha256}`);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

await build();
