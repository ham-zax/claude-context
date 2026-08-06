#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function digest(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }
function requireRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    return value;
}
function requireArray(value, label) {
    if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array.`);
    return value;
}

/**
 * D6: LOFO train-job manifest builder. Emits a sealed LOFO_JOB_MANIFEST.json
 * train descriptor binding the excluded family, the training repository ids,
 * and the sealed authorities; the manifest is immutable and never references
 * future receipts.
 */
export function buildLofoTrainJobManifestV1(input) {
    const families = requireArray(input.families, 'families');
    if (new Set(families).size !== families.length) throw new Error('families must be unique.');
    const excludedFamilyId = input.excludedFamilyId;
    if (!families.includes(excludedFamilyId)) throw new Error(`excludedFamilyId '${excludedFamilyId}' is outside the family authority.`);
    const trainingRepositoryIds = requireArray(input.trainingRepositoryIds, 'trainingRepositoryIds').map(String);
    const unsigned = {
        schemaVersion: 'ranking_v3_lofo_train_job_v1',
        excludedFamilyId,
        trainingRepositoryIds: [...trainingRepositoryIds].sort(),
        foldManifestSha256: requireSha(input.foldManifestSha256),
        trainingContractSha256: requireSha(input.trainingContractSha256),
        families,
    };
    return { ...unsigned, jobManifestSha256: digest(unsigned) };
}

function requireSha(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Expected a SHA-256 digest.');
    return value;
}

function usage() { return 'Usage: node scripts/run-ranking-lofo.mjs build-train-job --families <families.json> --excluded-family <id> --training-repos <repos.json> --fold-manifest-sha <sha> --training-contract-sha <sha> --out <dir>'; }

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
    if (!options['fold-manifest-sha'] || !options['training-contract-sha'] || !options.out) {
        throw new Error(`--fold-manifest-sha, --training-contract-sha and --out are required.\n${usage()}`);
    }
    const job = buildLofoTrainJobManifestV1({
        families: JSON.parse(fs.readFileSync(path.resolve(options.families), 'utf8')),
        excludedFamilyId: options['excluded-family'],
        trainingRepositoryIds: JSON.parse(fs.readFileSync(path.resolve(options['training-repos']), 'utf8')),
        foldManifestSha256: options['fold-manifest-sha'],
        trainingContractSha256: options['training-contract-sha'],
    });
    fs.mkdirSync(path.resolve(options.out), { recursive: true });
    fs.writeFileSync(path.join(path.resolve(options.out), 'LOFO_JOB_MANIFEST.json'), `${JSON.stringify(job, null, 2)}\n`);
    return job;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    try { main(); } catch (error) {
        process.stderr.write(`run-ranking-lofo: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
        process.exitCode = 1;
    }
}
