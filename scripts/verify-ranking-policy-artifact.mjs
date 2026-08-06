#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseResidualModelV1, parseRankingPolicyV3Artifact } from '../packages/mcp/src/core/ranking-policy-artifact.ts';

function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function digest(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }

/**
 * D3: independent verifier. Each form (ResidualModelV1, RankingPolicyV3Artifact)
 * is parsed by the A5 authority and re-hashed from canonical bytes; the forms
 * never cross-validate each other and unreproducible bytes are rejected.
 */
export function verifyRankingPolicyV3ArtifactValue(value, options = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Artifact must be an object.');
    }
    if (value.schemaVersion === 'ranking_residual_model_v1') {
        const parsed = parseResidualModelV1(value);
        return { schemaVersion: 'ranking_residual_model_v1', residualModelSha256: digest(parsed) };
    }
    if (value.schemaVersion === 'ranking_policy_v3') {
        const parsed = parseRankingPolicyV3Artifact(value, options);
        const sha256 = digest(parsed);
        return { schemaVersion: 'ranking_policy_v3', artifactSha256: sha256 };
    }
    throw new Error(`Unsupported artifact form '${value.schemaVersion ?? '<missing>'}'.`);
}

function usage() {
    return 'Usage: node scripts/verify-ranking-policy-artifact.mjs --artifact <artifact.json>';
}

export function verifyRankingPolicyV3ArtifactFile(artifactPath) {
    const value = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    return verifyRankingPolicyV3ArtifactValue(value);
}

export function main(argv = process.argv.slice(2)) {
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
        const key = arg.slice(2);
        index += 1;
        if (index >= argv.length) throw new Error(`Missing value after ${arg}.`);
        options[key] = argv[index];
    }
    if (!options.artifact) throw new Error(`--artifact is required.\n${usage()}`);
    const result = verifyRankingPolicyV3ArtifactFile(path.resolve(options.artifact));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`verify-ranking-policy-artifact: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
        process.exitCode = 1;
    }
}
