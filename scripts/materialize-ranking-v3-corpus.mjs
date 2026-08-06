#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';

const SHA256 = /^[a-f0-9]{64}$/;
const RAW_KEYS = [
    'serviceClass', 'providerKey', 'rerankerIdentity', 'rerankerProjectionIdentity',
    'providerConfigurationDigest', 'providerRequestContractSha256',
    'baselineAdmissionSetSha256', 'requestCandidateIds', 'returnedCandidates',
    'canonicalRequestSha256', 'canonicalResponseSha256', 'outcome',
].sort();
function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}
function digest(value, label) {
    if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
    return value;
}
function record(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    return value;
}
function exact(value, keys, label) {
    const actual = Object.keys(value).sort();
    if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) throw new Error(`${label} must contain exact keys; derived fields are forbidden.`);
}
function text(value, label) { if (typeof value !== 'string' || !value) throw new Error(`${label} must be non-empty.`); return value; }
function positive(value, label) { if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be positive.`); return value; }
function finite(value, label) { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite.`); return value; }
function parseRawEvidence(value, expectedServiceClass, expectedContractSha) {
    const input = record(value, 'rawProviderEvidence');
    exact(input, RAW_KEYS, 'rawProviderEvidence');
    if (input.serviceClass !== expectedServiceClass) throw new Error('Raw provider evidence serviceClass mismatch.');
    if (digest(input.providerRequestContractSha256, 'providerRequestContractSha256') !== expectedContractSha) throw new Error('Raw provider evidence request-contract digest mismatch.');
    const requestCandidateIds = input.requestCandidateIds;
    if (!Array.isArray(requestCandidateIds) || requestCandidateIds.length === 0 || new Set(requestCandidateIds).size !== requestCandidateIds.length) throw new Error('requestCandidateIds must be a non-empty unique array.');
    requestCandidateIds.forEach((entry, index) => text(entry, `requestCandidateIds[${index}]`));
    if (!Array.isArray(input.returnedCandidates) || input.returnedCandidates.length !== requestCandidateIds.length) throw new Error('returnedCandidates must be a complete response.');
    const returnedCandidates = input.returnedCandidates.map((raw, index) => {
        const candidate = record(raw, `returnedCandidates[${index}]`);
        exact(candidate, ['candidateId', 'rank', 'rawScore'], `returnedCandidates[${index}]`);
        return { candidateId: text(candidate.candidateId, 'candidateId'), rank: positive(candidate.rank, 'rank'), rawScore: finite(candidate.rawScore, 'rawScore') };
    });
    if (new Set(returnedCandidates.map(({ candidateId }) => candidateId)).size !== requestCandidateIds.length || returnedCandidates.some(({ candidateId }) => !requestCandidateIds.includes(candidateId))) throw new Error('returnedCandidates must be a complete permutation of requestCandidateIds.');
    returnedCandidates.forEach((candidate, index) => { if (candidate.rank !== index + 1) throw new Error('returned candidate ranks must be contiguous and match order.'); });
    const outcome = record(input.outcome, 'outcome');
    exact(outcome, ['attempts', 'status', 'timeoutMs'], 'outcome');
    if (outcome.status !== 'complete') throw new Error('Only complete raw provider evidence may enter the corpus.');
    return {
        serviceClass: input.serviceClass,
        providerKey: text(input.providerKey, 'providerKey'),
        rerankerIdentity: text(input.rerankerIdentity, 'rerankerIdentity'),
        rerankerProjectionIdentity: text(input.rerankerProjectionIdentity, 'rerankerProjectionIdentity'),
        providerConfigurationDigest: digest(input.providerConfigurationDigest, 'providerConfigurationDigest'),
        providerRequestContractSha256: expectedContractSha,
        baselineAdmissionSetSha256: digest(input.baselineAdmissionSetSha256, 'baselineAdmissionSetSha256'),
        requestCandidateIds: [...requestCandidateIds],
        returnedCandidates,
        canonicalRequestSha256: digest(input.canonicalRequestSha256, 'canonicalRequestSha256'),
        canonicalResponseSha256: digest(input.canonicalResponseSha256, 'canonicalResponseSha256'),
        outcome: { status: 'complete', timeoutMs: positive(outcome.timeoutMs, 'timeoutMs'), attempts: positive(outcome.attempts, 'attempts') },
    };
}
export function materializeRankingV3Corpus(input) {
    const source = record(input.manifest, 'manifest');
    if (!Array.isArray(source.tasks)) throw new Error('manifest.tasks must be an array.');
    const tuningTaskIds = source.tasks.filter((task) => task?.split === 'tuning').map((task) => text(task.id, 'task.id')).sort();
    if (new Set(tuningTaskIds).size !== tuningTaskIds.length) throw new Error('Tuning task IDs contain duplicates.');
    if (!Array.isArray(input.captures)) throw new Error('captures must be an array.');
    const capturesByTask = new Map();
    for (const rawCapture of input.captures) {
        const capture = record(rawCapture, 'capture');
        const taskId = text(capture.taskId, 'capture.taskId');
        if (capturesByTask.has(taskId)) throw new Error(`Duplicate capture '${taskId}'.`);
        if (!tuningTaskIds.includes(taskId)) throw new Error(`Capture '${taskId}' is outside the tuning partition.`);
        capturesByTask.set(taskId, {
            taskId,
            captureSha256: digest(capture.captureSha256, 'captureSha256'),
            rawProviderEvidence: parseRawEvidence(capture.rawProviderEvidence, input.serviceClass, input.providerRequestContractSha256),
        });
    }
    if (capturesByTask.size !== tuningTaskIds.length || tuningTaskIds.some((taskId) => !capturesByTask.has(taskId))) throw new Error('Corpus capture coverage must exactly match every tuning task.');
    const body = {
        schemaVersion: 'ranking_v3_corpus_manifest_v1',
        sourceManifestSha256: digest(source.sha256, 'manifest.sha256'),
        qualificationTargetSha256: digest(input.qualificationTargetSha256, 'qualificationTargetSha256'),
        providerRequestContractSha256: digest(input.providerRequestContractSha256, 'providerRequestContractSha256'),
        serviceClass: text(input.serviceClass, 'serviceClass'),
        taskCount: tuningTaskIds.length,
        taskIds: tuningTaskIds,
        captures: tuningTaskIds.map((taskId) => capturesByTask.get(taskId)),
        tuningOnlyProof: { includedSplit: 'tuning', heldOutTaskCount: 0 },
    };
    return { ...body, sha256: crypto.createHash('sha256').update(canonical(body)).digest('hex') };
}
function parseArgs(argv) {
    const options = {};
    for (let i = 0; i < argv.length; i += 2) options[argv[i]?.replace(/^--/, '')] = argv[i + 1];
    return options;
}
export function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    for (const key of ['manifest', 'captures', 'target-sha256', 'request-contract-sha256', 'service-class', 'out']) if (!options[key]) throw new Error(`Missing --${key}.`);
    const result = materializeRankingV3Corpus({
        manifest: JSON.parse(fs.readFileSync(options.manifest, 'utf8')),
        captures: JSON.parse(fs.readFileSync(options.captures, 'utf8')),
        qualificationTargetSha256: options['target-sha256'],
        providerRequestContractSha256: options['request-contract-sha256'],
        serviceClass: options['service-class'],
    });
    fs.writeFileSync(options.out, `${canonical(result)}\n`);
    return result;
}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) main();
