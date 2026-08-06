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

/**
 * D6: E3 input-seal + decision authority (plan §6.5, §7.6 D6).
 *
 * seal-inputs locks the exact E2 receipt set and the grouped-comparator state
 * at the barrier and NEVER emits a terminal receipt: a required comparator
 * that is unavailable is recorded as `unavailable_required`, and only E3
 * (decide) may emit an E3OutcomeReceiptV1.
 */
export function sealE3InputsV1({ e2Receipts, groupedComparatorPolicy, d1Receipt }) {
    if (!Array.isArray(e2Receipts) || e2Receipts.length === 0) {
        throw new Error('E3 input seal requires at least one E2 receipt.');
    }
    if (groupedComparatorPolicy !== 'required' && groupedComparatorPolicy !== 'optional') {
        throw new Error('groupedComparatorPolicy must be required or optional.');
    }
    for (const receipt of e2Receipts) {
        const record = requireRecord(receipt, 'E2 receipt');
        if (typeof record.receiptSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(record.receiptSha256)) {
            throw new Error('E2 receipts require a receiptSha256 digest.');
        }
    }
    let groupedComparator;
    if (d1Receipt) {
        const d1 = requireRecord(d1Receipt, 'D1 receipt');
        if (typeof d1.receiptSha256 !== 'string') throw new Error('D1 receipt requires receiptSha256.');
        groupedComparator = { status: 'available', comparatorReceiptSha256: d1.receiptSha256 };
    } else if (groupedComparatorPolicy === 'optional') {
        groupedComparator = { status: 'unavailable_optional' };
    } else {
        groupedComparator = { status: 'unavailable_required' };
    }
    const unsigned = {
        schemaVersion: 'ranking_v3_e3_input_seal_v1',
        e2ReceiptSha256s: e2Receipts.map((receipt) => receipt.receiptSha256).sort(),
        groupedComparator,
        sealedAt: new Date().toISOString(),
    };
    return { ...unsigned, inputSealSha256: digest(unsigned) };
}

const E3_OUTCOMES = ['selected_disabled', 'selected_provider_derived', 'insufficient_evidence', 'learned_not_justified'];

/**
 * The sole authority for every E3OutcomeReceiptV1 variant. When the input seal
 * records `unavailable_required`, E3 emits exactly one
 * E3InsufficientEvidenceReceiptV1; otherwise it decides from the sealed inputs.
 */
export function decideE3V1({ inputSeal, decision }) {
    const seal = requireRecord(inputSeal, 'E3 input seal');
    if (seal.schemaVersion !== 'ranking_v3_e3_input_seal_v1') {
        throw new Error('E3 decision requires the canonical E3 input seal.');
    }
    if (seal.groupedComparator?.status === 'unavailable_required') {
        const unsigned = {
            schemaVersion: 'ranking_v3_e3_insufficient_evidence_receipt_v1',
            receiptType: 'e3_insufficient_evidence',
            outcome: 'insufficient_evidence',
            qualificationTargetSha256: digest(seal),
            e3InputSealSha256: seal.inputSealSha256,
            decisionContractSha256: digest(seal),
            missingEvidenceCodes: ['grouped_comparator_required_unavailable'],
        };
        return { ...unsigned, receiptSha256: digest(unsigned) };
    }
    if (!E3_OUTCOMES.includes(decision.outcome)) {
        throw new Error(`E3 outcome must be one of ${E3_OUTCOMES.join(', ')}.`);
    }
    const unsigned = {
        schemaVersion: 'ranking_v3_e3_selection_receipt_v1',
        receiptType: 'e3_selection',
        outcome: decision.outcome,
        selectedFoldContenderSha256: digest(seal),
        qualificationTargetSha256: digest(seal),
        e3InputSealSha256: seal.inputSealSha256,
        decisionContractSha256: digest(seal),
    };
    return { ...unsigned, receiptSha256: digest(unsigned) };
}

function usage() {
    return [
        'Usage:',
        '  node scripts/adjudicate-ranking-lofo.mjs seal-inputs --e2-receipts <receipts.json> --comparator-policy <required|optional> [--d1-receipt <receipt.json>] --out <file>',
        '  node scripts/adjudicate-ranking-lofo.mjs decide --input-seal <seal.json> --outcome <outcome> --out <dir>',
    ].join('\n');
}

export function main(argv = process.argv.slice(2)) {
    const [command, ...rest] = argv;
    const options = {};
    for (let index = 0; index < rest.length; index += 1) {
        const arg = rest[index];
        if (!arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
        const key = arg.slice(2);
        index += 1;
        if (index >= argv.length) throw new Error(`Missing value after ${arg}.`);
        options[key] = argv[index];
    }
    if (command === 'seal-inputs') {
        const seal = sealE3InputsV1({
            e2Receipts: JSON.parse(fs.readFileSync(path.resolve(options['e2-receipts']), 'utf8')),
            groupedComparatorPolicy: options['comparator-policy'],
            d1Receipt: options['d1-receipt'] ? JSON.parse(fs.readFileSync(path.resolve(options['d1-receipt']), 'utf8')) : null,
        });
        fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
        fs.writeFileSync(path.resolve(options.out), `${JSON.stringify(seal, null, 2)}\n`);
        return seal;
    }
    if (command === 'decide') {
        const receipt = decideE3V1({
            inputSeal: JSON.parse(fs.readFileSync(path.resolve(options['input-seal']), 'utf8')),
            decision: { outcome: options.outcome },
        });
        fs.mkdirSync(path.resolve(options.out), { recursive: true });
        fs.writeFileSync(path.join(path.resolve(options.out), 'E3_RECEIPT.json'), `${JSON.stringify(receipt, null, 2)}\n`);
        return receipt;
    }
    throw new Error(`Unknown command '${command ?? ''}'.\n${usage()}`);
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    try { main(); } catch (error) {
        process.stderr.write(`adjudicate-ranking-lofo: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
        process.exitCode = 1;
    }
}
