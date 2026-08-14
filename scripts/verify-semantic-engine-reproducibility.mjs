#!/usr/bin/env node

import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
    ASSETS_DIR,
    MANIFEST_PATH,
    JS_PATH,
    WASM_PATH,
    PINNED_UPSTREAM_COMMIT,
    PINNED_EMSCRIPTEN_VERSION,
    computeLogicalRecipeDigest,
    computeSourceDigest,
} from './semantic-engine-build-config.mjs';

export { computeSourceDigest, computeLogicalRecipeDigest };

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
    const recipeDigest = computeLogicalRecipeDigest();

    if (manifest.abiVersion !== 1) {
        throw new Error(`Manifest abiVersion mismatch: expected 1, saw ${manifest.abiVersion}`);
    }
    if (manifest.upstreamCommit !== PINNED_UPSTREAM_COMMIT) {
        throw new Error(`Manifest upstreamCommit mismatch: expected ${PINNED_UPSTREAM_COMMIT}, saw ${manifest.upstreamCommit}`);
    }
    if (manifest.emscriptenVersion !== PINNED_EMSCRIPTEN_VERSION) {
        throw new Error(`Manifest emscriptenVersion mismatch: expected ${PINNED_EMSCRIPTEN_VERSION}, saw ${manifest.emscriptenVersion}`);
    }
    if (manifest.semanticSourceDigest !== sourceDigest) {
        throw new Error(`Manifest source digest mismatch:\n  manifest: ${manifest.semanticSourceDigest}\n  computed: ${sourceDigest}`);
    }
    if (manifest.buildRecipeDigest !== recipeDigest) {
        throw new Error(`Manifest build recipe digest mismatch:\n  manifest: ${manifest.buildRecipeDigest}\n  computed: ${recipeDigest}`);
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
        emscriptenVersion: manifest.emscriptenVersion,
        semanticSourceDigest: sourceDigest,
        buildRecipeDigest: recipeDigest,
        jsSha256: jsHash,
        wasmSha256: wasmHash,
    };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        const result = verifySemanticEngine();
        console.log(`✔ Satori Semantic Engine verification passed:`);
        console.log(`  ABI Version:        ${result.abiVersion}`);
        console.log(`  Upstream Commit:    ${result.upstreamCommit}`);
        console.log(`  Emscripten Version: ${result.emscriptenVersion}`);
        console.log(`  Source Digest:      ${result.semanticSourceDigest}`);
        console.log(`  Recipe Digest:      ${result.buildRecipeDigest}`);
        console.log(`  JS Digest:          ${result.jsSha256}`);
        console.log(`  WASM Digest:        ${result.wasmSha256}`);
    } catch (err) {
        console.error(`✖ Semantic engine verification failed: ${err.message}`);
        process.exit(1);
    }
}
