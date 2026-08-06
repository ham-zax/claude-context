#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function requireRanking(value, label) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`${label} must be a non-empty candidate id array.`);
    }
    const rank = new Map(value.map((candidateId, index) => [candidateId, index]));
    if (rank.size !== value.length) {
        throw new Error(`${label} contains duplicate candidate ids.`);
    }
    return rank;
}

/**
 * D4: protected-control counterfactual checker (plan §7.6 D4). Protected
 * controls are candidate pairs whose relative order is fixed by the baseline
 * evidence. A policy that reverses any protected pair (a shortcut ranking by
 * a protected attribute) must fail; policies that preserve the baseline
 * relative order pass.
 */
export function checkRankingCounterfactualsV1({ ranking, baselineRanking, protectedControls }) {
    const policyRank = requireRanking(ranking, 'ranking');
    const baselineRank = requireRanking(baselineRanking, 'baselineRanking');
    if (!Array.isArray(protectedControls) || protectedControls.length === 0) {
        throw new Error('Protected controls must be a non-empty array of candidate pairs.');
    }
    const violations = [];
    for (const control of protectedControls) {
        if (!Array.isArray(control) || control.length !== 2) {
            throw new Error('Each protected control must be a [candidateA, candidateB] pair.');
        }
        const [left, right] = control;
        const leftPolicy = policyRank.get(left);
        const rightPolicy = policyRank.get(right);
        const leftBaseline = baselineRank.get(left);
        const rightBaseline = baselineRank.get(right);
        if (leftPolicy === undefined || rightPolicy === undefined) {
            throw new Error(`Protected control references a candidate missing from the policy ranking (${left}, ${right}).`);
        }
        if (leftBaseline === undefined || rightBaseline === undefined) {
            throw new Error(`Protected control references a candidate missing from the baseline ranking (${left}, ${right}).`);
        }
        const baselineOrder = leftBaseline < rightBaseline ? left : right;
        const policyOrder = leftPolicy < rightPolicy ? left : right;
        if (baselineOrder !== policyOrder) {
            violations.push({ pair: [left, right], baselineOrder, policyOrder });
        }
    }
    return {
        schemaVersion: 'ranking_v3_counterfactual_check_v1',
        passed: violations.length === 0,
        protectedControlCount: protectedControls.length,
        violations,
    };
}

function usage() {
    return 'Usage: node scripts/ranking-counterfactuals.mjs --ranking <ranking.json> --baseline <baseline.json> --controls <controls.json>';
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
    if (!options.ranking || !options.baseline || !options.controls) {
        throw new Error(`--ranking, --baseline and --controls are required.\n${usage()}`);
    }
    const result = checkRankingCounterfactualsV1({
        ranking: JSON.parse(fs.readFileSync(path.resolve(options.ranking), 'utf8')),
        baselineRanking: JSON.parse(fs.readFileSync(path.resolve(options.baseline), 'utf8')),
        protectedControls: JSON.parse(fs.readFileSync(path.resolve(options.controls), 'utf8')),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        process.stderr.write(`ranking-counterfactuals: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
        process.exitCode = 1;
    }
}
