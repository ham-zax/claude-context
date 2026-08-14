#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const CBM_SRC_DIR = path.join(REPO_ROOT, 'third_party', 'cbm-semantic');
const ASSETS_DIR = path.join(REPO_ROOT, 'packages', 'core', 'assets', 'semantic-engine');
const MANIFEST_PATH = path.join(ASSETS_DIR, 'semantic-engine.manifest.json');
const JS_PATH = path.join(ASSETS_DIR, 'satori-semantic-engine.js');
const WASM_PATH = path.join(ASSETS_DIR, 'satori-semantic-engine.wasm');

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

export function verifySemanticEngine() {
    if (!fs.existsSync(MANIFEST_PATH)) {
        throw new Error(`Semantic engine manifest missing: ${MANIFEST_PATH}`);
    }
    if (!fs.existsSync(JS_PATH)) {
        throw new Error(`Semantic engine JS artifact missing: ${JS_PATH}`);
    }
    if (!fs.existsSync(WASM_PATH)) {
        throw new Error(`Semantic engine WASM artifact missing: ${WASM_PATH}`);
    }

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    const sourceDigest = computeSourceDigest();

    if (manifest.abiVersion !== 1) {
        throw new Error(`Manifest abiVersion mismatch: expected 1, saw ${manifest.abiVersion}`);
    }
    if (manifest.upstreamCommit !== 'd150ebe4fc78a9a3f85013d2087a849e5d59eb0f') {
        throw new Error(`Manifest upstreamCommit mismatch: expected d150ebe4fc78a9a3f85013d2087a849e5d59eb0f, saw ${manifest.upstreamCommit}`);
    }
    if (manifest.semanticSourceDigest !== sourceDigest) {
        throw new Error(`Manifest source digest mismatch:\n  manifest: ${manifest.semanticSourceDigest}\n  computed: ${sourceDigest}`);
    }

    const jsBytes = fs.readFileSync(JS_PATH);
    const jsHash = crypto.createHash('sha256').update(jsBytes).digest('hex');
    if (manifest.jsSha256 !== jsHash) {
        throw new Error(`JS artifact hash mismatch:\n  manifest: ${manifest.jsSha256}\n  actual:   ${jsHash}`);
    }

    const wasmBytes = fs.readFileSync(WASM_PATH);
    const wasmHash = crypto.createHash('sha256').update(wasmBytes).digest('hex');
    if (manifest.wasmSha256 !== wasmHash) {
        throw new Error(`WASM artifact hash mismatch:\n  manifest: ${manifest.wasmSha256}\n  actual:   ${wasmHash}`);
    }

    return {
        abiVersion: manifest.abiVersion,
        upstreamCommit: manifest.upstreamCommit,
        semanticSourceDigest: sourceDigest,
        buildRecipeDigest: manifest.buildRecipeDigest,
        jsSha256: jsHash,
        wasmSha256: wasmHash,
    };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        const result = verifySemanticEngine();
        console.log(`✔ Satori Semantic Engine verification passed:`);
        console.log(`  ABI Version: ${result.abiVersion}`);
        console.log(`  Upstream Commit: ${result.upstreamCommit}`);
        console.log(`  Source Digest: ${result.semanticSourceDigest}`);
        if (result.buildRecipeDigest) {
            console.log(`  Recipe Digest: ${result.buildRecipeDigest}`);
        }
        console.log(`  JS Digest: ${result.jsSha256}`);
        console.log(`  WASM Digest: ${result.wasmSha256}`);
    } catch (err) {
        console.error(`✖ Semantic engine verification failed: ${err.message}`);
        process.exit(1);
    }
}
