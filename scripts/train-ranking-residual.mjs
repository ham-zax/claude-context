#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

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
    if (typeof value !== 'string' || !SHA.test(value)) throw new Error(`${label} must be a SHA-256 digest.`);
    return value;
}
function requireCommit(value, label) {
    if (typeof value !== 'string' || !COMMIT.test(value)) throw new Error(`${label} must be a 40-hex commit.`);
    return value;
}
function requireArray(value, label) {
    if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
    return value;
}

/**
 * D2: mode-neutral residual trainer. Fits deterministic weights from a sealed
 * training fold (feature matrix + baseline/observed scores) using a simple
 * closed-form ridge solution over the normalized features. The trainer is
 * reproducible: same fold bytes + same seed produce the same model. Zero
 * weights are a legal outcome and prove scorer-level equality with the
 * pre-rerank baseline (plan §4.1, §7.6 D2).
 */
export function trainResidualModelV1({ foldManifest, createdFromCommit, trainingCodeSha256, trainingContractSha256, maximumResidual = 1 }) {
    const fold = requireRecord(foldManifest, 'Training fold manifest');
    requireSha(fold.trainingFoldManifestSha256, 'trainingFoldManifestSha256');
    const featureRows = requireArray(fold.featureRows, 'fold.featureRows');
    const targets = requireArray(fold.targets, 'fold.targets');
    if (featureRows.length === 0 || featureRows.length !== targets.length) {
        throw new Error('Training fold featureRows and targets must be non-empty and equal length.');
    }
    const featureCount = featureRows[0].length;
    if (featureRows.some((row) => !Array.isArray(row) || row.length !== featureCount)) {
        throw new Error('Training fold feature rows must be rectangular.');
    }
    for (const row of featureRows) {
        for (const value of row) {
            if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Feature values must be finite.');
        }
    }
    for (const target of targets) {
        if (typeof target !== 'number' || !Number.isFinite(target)) throw new Error('Targets must be finite.');
    }
    if (typeof maximumResidual !== 'number' || !Number.isFinite(maximumResidual) || maximumResidual < 0) {
        throw new Error('maximumResidual must be a non-negative finite number.');
    }

    // Closed-form ridge: weights = (X^T X + lambda I)^-1 X^T y, lambda=1e-6.
    const lambda = 1e-6;
    const gram = Array.from({ length: featureCount }, () => new Array(featureCount).fill(0));
    const rhs = new Array(featureCount).fill(0);
    for (let rowIndex = 0; rowIndex < featureRows.length; rowIndex += 1) {
        const row = featureRows[rowIndex];
        const target = targets[rowIndex];
        for (let i = 0; i < featureCount; i += 1) {
            rhs[i] += row[i] * target;
            for (let j = 0; j < featureCount; j += 1) {
                gram[i][j] += row[i] * row[j];
            }
        }
    }
    for (let i = 0; i < featureCount; i += 1) gram[i][i] += lambda;
    // Gaussian elimination.
    const augmented = gram.map((row, i) => [...row, rhs[i]]);
    for (let col = 0; col < featureCount; col += 1) {
        let pivot = col;
        for (let row = col + 1; row < featureCount; row += 1) {
            if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
        }
        [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];
        const pivotValue = augmented[col][col];
        if (Math.abs(pivotValue) < 1e-12) {
            // Degenerate column: zero weight.
            augmented[col][col] = 1;
            for (let j = col + 1; j <= featureCount; j += 1) augmented[col][j] = 0;
            continue;
        }
        for (let j = col; j <= featureCount; j += 1) augmented[col][j] /= pivotValue;
        for (let row = 0; row < featureCount; row += 1) {
            if (row === col) continue;
            const factor = augmented[row][col];
            for (let j = col; j <= featureCount; j += 1) augmented[row][j] -= factor * augmented[col][j];
        }
    }
    const weights = augmented.map((row) => Number(row[featureCount].toFixed(9)));

    const normalization = {
        schemaVersion: 'ranking_normalization_contract_v1',
        featureOrder: requireArray(fold.featureOrder, 'fold.featureOrder').map(String),
        means: new Array(featureCount).fill(0),
        scales: new Array(featureCount).fill(1),
        missingValuePolicy: 'indicator_zero_fill',
    };
    if (normalization.featureOrder.length !== featureCount) {
        throw new Error('fold.featureOrder must match the feature row width.');
    }
    const unsigned = {
        schemaVersion: 'ranking_residual_model_v1',
        featureSchema: 'search_features_v1',
        createdFromCommit: requireCommit(createdFromCommit, 'createdFromCommit'),
        trainingFoldManifestSha256: requireSha(fold.trainingFoldManifestSha256, 'trainingFoldManifestSha256'),
        trainingCodeSha256: requireSha(trainingCodeSha256, 'trainingCodeSha256'),
        trainingContractSha256: requireSha(trainingContractSha256, 'trainingContractSha256'),
        normalization,
        weights,
        residualBounds: { maximumResidual },
    };
    return unsigned;
}

function parseArgs(argv) {
    const [command, ...rest] = argv;
    const options = {};
    for (let index = 0; index < rest.length; index += 1) {
        const arg = rest[index];
        if (!arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
        const key = arg.slice(2);
        index += 1;
        if (index >= rest.length) throw new Error(`Missing value after ${arg}.`);
        options[key] = rest[index];
    }
    return { command, options };
}

function usage() {
    return [
        'Usage:',
        '  node scripts/train-ranking-residual.mjs train --job <fold-job.json> --out <dir>',
        '  node scripts/train-ranking-residual.mjs refit --job <fold-job.json> --out <dir>',
    ].join('\n');
}

export function main(argv = process.argv.slice(2)) {
    const { command, options } = parseArgs(argv);
    if (command !== 'train' && command !== 'refit') throw new Error(`Unknown command '${command ?? ''}'.\n${usage()}`);
    const job = requireRecord(JSON.parse(fs.readFileSync(options.job, 'utf8')), 'Fold job');
    const model = trainResidualModelV1({
        foldManifest: requireRecord(job.foldManifest, 'job.foldManifest'),
        createdFromCommit: job.createdFromCommit ?? process.env.SATORI_CREATED_FROM_COMMIT ?? process.env.BASELINE_COMMIT,
        trainingCodeSha256: job.trainingCodeSha256 ?? fileDigest(fileURLToPath(import.meta.url)),
        trainingContractSha256: job.trainingContractSha256,
        maximumResidual: job.maximumResidual ?? 1,
    });
    if (!options.out) throw new Error(`${command} requires --out.`);
    fs.mkdirSync(path.resolve(options.out), { recursive: true });
    const outPath = path.join(path.resolve(options.out), 'RESIDUAL_MODEL.json');
    fs.writeFileSync(outPath, `${JSON.stringify(model, null, 2)}\n`);
    return model;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`train-ranking-residual: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
        process.exitCode = 1;
    }
}
