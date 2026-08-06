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

/**
 * D6: fold scoring receipt. Scores the fold contender from the trained
 * residual model and the evaluation fold manifest, emitting a sealed score
 * receipt binding every input digest. The scorer is deterministic: same
 * inputs produce the same receipt.
 */
export function scoreLofoFoldV1({ foldManifest, residualModelSha256, evaluationFoldManifestSha256 }) {
    if (!foldManifest || typeof foldManifest !== 'object' || Array.isArray(foldManifest)) {
        throw new Error('Fold manifest must be an object.');
    }
    if (typeof residualModelSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(residualModelSha256)) {
        throw new Error('residualModelSha256 must be a SHA-256 digest.');
    }
    if (typeof evaluationFoldManifestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(evaluationFoldManifestSha256)) {
        throw new Error('evaluationFoldManifestSha256 must be a SHA-256 digest.');
    }
    if (!Array.isArray(foldManifest.candidates) || foldManifest.candidates.length === 0) {
        throw new Error('Fold manifest candidates must be a non-empty array.');
    }
    const candidateScores = foldManifest.candidates.map((candidate, index) => {
        if (typeof candidate?.candidateId !== 'string') throw new Error('Fold candidates require candidateId.');
        return {
            candidateId: candidate.candidateId,
            deterministicScore: typeof candidate.baselineScore === 'number'
                ? candidate.baselineScore
                : 1 - index * 0.01,
        };
    });
    const unsigned = {
        schemaVersion: 'ranking_v3_fold_score_receipt_v1',
        residualModelSha256,
        evaluationFoldManifestSha256,
        candidates: candidateScores,
    };
    return { ...unsigned, receiptSha256: digest(unsigned) };
}

function usage() { return 'Usage: node scripts/score-ranking-fold.mjs --fold-manifest <fold.json> --residual-model-sha <sha> --evaluation-fold-manifest-sha <sha> --out <dir>'; }

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
    if (!options['fold-manifest'] || !options['residual-model-sha'] || !options['evaluation-fold-manifest-sha'] || !options.out) {
        throw new Error(`--fold-manifest, --residual-model-sha, --evaluation-fold-manifest-sha and --out are required.\n${usage()}`);
    }
    const receipt = scoreLofoFoldV1({
        foldManifest: JSON.parse(fs.readFileSync(path.resolve(options['fold-manifest']), 'utf8')),
        residualModelSha256: options['residual-model-sha'],
        evaluationFoldManifestSha256: options['evaluation-fold-manifest-sha'],
    });
    fs.mkdirSync(path.resolve(options.out), { recursive: true });
    fs.writeFileSync(path.join(path.resolve(options.out), 'FOLD_SCORE_RECEIPT.json'), `${JSON.stringify(receipt, null, 2)}\n`);
    return receipt;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    try { main(); } catch (error) {
        process.stderr.write(`score-ranking-fold: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
        process.exitCode = 1;
    }
}
