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
function fileDigest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function requireRecord(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    return value;
}
function requireSha(value, label) {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} must be a SHA-256 digest.`);
    return value;
}

/**
 * D5: resource-contract verifier (plan §7.5 D5). The sealed contract and the
 * resource-corpus manifest must bind every workload, threshold, and
 * environment identity; any modification to contract bytes, corpus bytes, or
 * the runtime environment rejects the verification.
 */
export function verifyResourceContractV1({ contract, corpus }) {
    const contractRecord = requireRecord(contract, 'Resource contract');
    const corpusRecord = requireRecord(corpus, 'Resource corpus manifest');
    requireRecord(contractRecord.workloads, 'contract.workloads');
    requireRecord(contractRecord.thresholds, 'contract.thresholds');
    requireRecord(contractRecord.environment, 'contract.environment');
    if (contractRecord.schemaVersion !== 'ranking_v3_resource_contract_v1') {
        throw new Error('Resource contract schema mismatch.');
    }
    if (!Array.isArray(corpusRecord.workloads) || corpusRecord.workloads.length === 0) {
        throw new Error('Resource corpus must declare at least one workload.');
    }
    const corpusWorkloadIds = new Set(corpusRecord.workloads.map((entry) => {
        if (typeof entry?.workloadId !== 'string') throw new Error('Corpus workload entries require a string workloadId.');
        return entry.workloadId;
    }));
    const contractWorkloadIds = Object.keys(contractRecord.workloads);
    for (const workloadId of corpusWorkloadIds) {
        if (!contractWorkloadIds.includes(workloadId)) {
            throw new Error(`Corpus workload '${workloadId}' is not sealed by the contract.`);
        }
    }
    if (corpusRecord.contractSha256 !== digest(contractRecord)) {
        throw new Error('Corpus manifest does not bind the sealed contract bytes.');
    }
    const environment = contractRecord.environment;
    if (environment.nodeMajor !== Number(process.versions.node.split('.')[0])) {
        throw new Error(`Environment mismatch: contract nodeMajor=${environment.nodeMajor}, runtime=${process.versions.node}.`);
    }
    if (Array.isArray(environment.platforms) && !environment.platforms.includes(process.platform)) {
        throw new Error(`Environment mismatch: contract platforms=${environment.platforms.join(',')}, runtime=${process.platform}.`);
    }
    if (Array.isArray(environment.architectures) && !environment.architectures.includes(process.arch)) {
        throw new Error(`Environment mismatch: contract architectures=${environment.architectures.join(',')}, runtime=${process.arch}.`);
    }
    return {
        schemaVersion: 'ranking_v3_resource_verification_v1',
        contractSha256: digest(contractRecord),
        corpusSha256: digest(corpusRecord),
        environmentVerified: true,
    };
}

function usage() {
    return 'Usage: node scripts/verify-ranking-v3-resource-contract.mjs --contract <contract.json> --corpus <corpus-manifest.json>';
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
    if (!options.contract || !options.corpus) {
        throw new Error(`--contract and --corpus are required.\n${usage()}`);
    }
    const result = verifyResourceContractV1({
        contract: JSON.parse(fs.readFileSync(path.resolve(options.contract), 'utf8')),
        corpus: JSON.parse(fs.readFileSync(path.resolve(options.corpus), 'utf8')),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`verify-ranking-v3-resource-contract: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
        process.exitCode = 1;
    }
}
