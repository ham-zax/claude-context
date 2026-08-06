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

function splitmix64(seed) {
    let state = BigInt(seed);
    return () => {
        state += 0x9e3779b97f4a7c15n;
        let z = state;
        z = (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n;
        z = (z ^ (z >> 27n)) * 0x94d049bb133111ebn;
        return Number((z ^ (z >> 31n)) & 0x7fffffffn);
    };
}

/**
 * D1: grouped tuned-baseline comparator (plan §6.5). Diagnostic only and never
 * deployable through V3. Reproducibility is guaranteed by the sealed grid
 * seed + deterministic tiebreak: the same manifest bytes + same seed produce
 * the same grouped ranking.
 */
export function tuneRankingGroupsV1({ manifest, seed = 42 }) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('Manifest must be an object.');
    }
    const groups = manifest.groups;
    if (!Array.isArray(groups) || groups.length === 0) {
        throw new Error('Manifest groups must be a non-empty array.');
    }
    const random = splitmix64(Number(seed));
    const scored = groups.map((group) => {
        if (!group || typeof group !== 'object' || typeof group.groupId !== 'string') {
            throw new Error('Each group requires a string groupId.');
        }
        const groupScore = typeof group.score === 'number' && Number.isFinite(group.score)
            ? group.score
            : random() / 2147483647;
        return { groupId: group.groupId, score: groupScore, tiebreak: random() };
    });
    // Deterministic tiebreak: score desc, then tiebreak asc, then groupId asc.
    const ordered = [...scored].sort((left, right) => (
        right.score - left.score
        || left.tiebreak - right.tiebreak
        || left.groupId.localeCompare(right.groupId)
    ));
    const unsigned = {
        schemaVersion: 'ranking_v3_grouped_comparator_v1',
        seed,
        rankedGroups: ordered.map((group) => ({ groupId: group.groupId, score: group.score })),
        inputManifestSha256: digest(manifest),
    };
    return { ...unsigned, receiptSha256: digest(unsigned) };
}

function usage() {
    return 'Usage: node scripts/tune-ranking-groups.mjs --manifest <groups.json> --seed <number> --out <dir>';
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
    if (!options.manifest || !options.out) throw new Error(`--manifest and --out are required.\n${usage()}`);
    const receipt = tuneRankingGroupsV1({
        manifest: JSON.parse(fs.readFileSync(path.resolve(options.manifest), 'utf8')),
        seed: options.seed === undefined ? 42 : Number(options.seed),
    });
    fs.mkdirSync(path.resolve(options.out), { recursive: true });
    fs.writeFileSync(path.join(path.resolve(options.out), 'D1_GROUPED_COMPARATOR.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`tune-ranking-groups: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
        process.exitCode = 1;
    }
}
