import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { materializeRankingV3Corpus } from './materialize-ranking-v3-corpus.mjs';

const sha = (character) => character.repeat(64);
const canonical = (value) => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
};
const targetDigest = (target) => crypto.createHash('sha256').update(`${canonical(target)}\n`).digest('hex');
const NONE_TARGET = { providerTarget: 'none', serviceClass: 'offline_linux_x64' };
const FIXED_TARGET = {
    providerTarget: 'fixed',
    serviceClass: 'offline_linux_x64',
    providerKey: 'provider-a',
    rerankerIdentity: 'reranker-a',
    rerankerProjectionIdentity: 'projection-a',
    providerConfigurationDigest: sha('a'),
};
const SHA256_RE = /^[a-f0-9]{64}$/;

const raw = (taskId) => ({
    serviceClass: 'offline_linux_x64',
    providerKey: 'provider-a',
    rerankerIdentity: 'reranker-a',
    rerankerProjectionIdentity: 'projection-a',
    providerConfigurationDigest: sha('a'),
    providerRequestContractSha256: sha('b'),
    baselineAdmissionSetSha256: sha('c'),
    requestCandidateIds: [`${taskId}-1`, `${taskId}-2`, `${taskId}-3`],
    returnedCandidates: [
        { candidateId: `${taskId}-2`, rank: 1, rawScore: 3 },
        { candidateId: `${taskId}-1`, rank: 2, rawScore: 2 },
        { candidateId: `${taskId}-3`, rank: 3, rawScore: 1 },
    ],
    canonicalRequestSha256: sha('d'),
    canonicalResponseSha256: sha('e'),
    outcome: { status: 'complete', timeoutMs: 1000, attempts: 1 },
});

const fixtureManifest = () => ({
    sha256: sha('f'),
    tasks: [
        { id: 't1', split: 'tuning', repositoryId: 'r1' },
        { id: 't2', split: 'tuning', repositoryId: 'r2' },
        { id: 'h1', split: 'held_out', repositoryId: 'h1' },
    ],
});

test('corpus_binds_all_tuning_tasks_and_contains_raw_provider_authority_only', () => {
    const manifest = fixtureManifest();
    const corpus = materializeRankingV3Corpus({
        manifest,
        qualificationTarget: FIXED_TARGET,
        qualificationTargetSha256: targetDigest(FIXED_TARGET),
        providerRequestContractSha256: sha('b'),
        captures: [
            { taskId: 't1', captureSha256: sha('2'), rawProviderEvidence: raw('t1') },
            { taskId: 't2', captureSha256: sha('3'), rawProviderEvidence: raw('t2') },
        ],
    });
    assert.deepEqual(corpus.taskIds, ['t1', 't2']);
    assert.equal(corpus.taskCount, 2);
    assert.equal(JSON.stringify(corpus).includes('held_out'), false);
    assert.doesNotMatch(JSON.stringify(corpus), /percentile|normalized|margin/i);
    assert.equal(corpus.serviceClass, 'offline_linux_x64');
    assert.equal(corpus.providerRequestContractSha256, sha('b'));
    assert.deepEqual(corpus.tasks.map(({ taskId, repositoryId, split }) => ({ taskId, repositoryId, split })), [
        { taskId: 't1', repositoryId: 'r1', split: 'tuning' },
        { taskId: 't2', repositoryId: 'r2', split: 'tuning' },
    ]);
    assert.ok(corpus.tasks.every((task) => SHA256_RE.test(task.taskSha256)));
    assert.throws(() => materializeRankingV3Corpus({
        manifest,
        qualificationTarget: FIXED_TARGET,
        qualificationTargetSha256: targetDigest(FIXED_TARGET),
        providerRequestContractSha256: sha('b'),
        captures: [{ taskId: 't1', captureSha256: sha('2'), rawProviderEvidence: raw('t1') }],
    }), /coverage/i);
    assert.throws(() => materializeRankingV3Corpus({
        manifest,
        qualificationTarget: FIXED_TARGET,
        qualificationTargetSha256: targetDigest(FIXED_TARGET),
        providerRequestContractSha256: sha('b'),
        captures: [
            { taskId: 't1', captureSha256: sha('2'), rawProviderEvidence: { ...raw('t1'), withinQueryPercentile: 0.5 } },
            { taskId: 't2', captureSha256: sha('3'), rawProviderEvidence: raw('t2') },
        ],
    }), /derived|exact keys/i);
});

test('no_provider_corpus_materializes_without_raw_provider_evidence', () => {
    const manifest = fixtureManifest();
    const corpus = materializeRankingV3Corpus({
        manifest,
        qualificationTarget: NONE_TARGET,
        qualificationTargetSha256: targetDigest(NONE_TARGET),
        captures: [
            { taskId: 't1', captureSha256: sha('2'), providerEvidence: null },
            { taskId: 't2', captureSha256: sha('3'), providerEvidence: null },
        ],
    });
    assert.equal(corpus.taskCount, 2);
    assert.deepEqual(corpus.taskIds, ['t1', 't2']);
    assert.equal(corpus.serviceClass, 'offline_linux_x64');
    assert.equal(corpus.qualificationTargetSha256, targetDigest(NONE_TARGET));
    assert.equal('providerRequestContractSha256' in corpus, false);
    assert.deepEqual(corpus.captures.map(({ taskId, providerEvidence, captureSha256 }) => ({ taskId, providerEvidence, captureSha256 })), [
        { taskId: 't1', providerEvidence: null, captureSha256: sha('2') },
        { taskId: 't2', providerEvidence: null, captureSha256: sha('3') },
    ]);
    assert.ok(corpus.captures.every((capture) => !('rawProviderEvidence' in capture)));
    assert.deepEqual(corpus.tasks.map(({ taskId, repositoryId, split }) => ({ taskId, repositoryId, split })), [
        { taskId: 't1', repositoryId: 'r1', split: 'tuning' },
        { taskId: 't2', repositoryId: 'r2', split: 'tuning' },
    ]);
    assert.ok(corpus.tasks.every((task) => SHA256_RE.test(task.taskSha256)));
    assert.deepEqual(corpus.tuningOnlyProof, { includedSplit: 'tuning', heldOutTaskCount: 0 });
    assert.throws(() => materializeRankingV3Corpus({
        manifest,
        qualificationTarget: NONE_TARGET,
        qualificationTargetSha256: targetDigest(NONE_TARGET),
        captures: [
            { taskId: 't1', captureSha256: sha('2'), providerEvidence: null },
            { taskId: 't2', captureSha256: sha('3'), providerEvidence: null, rawProviderEvidence: raw('t2') },
        ],
    }), /exact keys/i);
    assert.throws(() => materializeRankingV3Corpus({
        manifest,
        qualificationTarget: NONE_TARGET,
        qualificationTargetSha256: targetDigest(NONE_TARGET),
        captures: [
            { taskId: 't1', captureSha256: sha('2'), providerEvidence: raw('t1') },
            { taskId: 't2', captureSha256: sha('3'), providerEvidence: null },
        ],
    }), /providerEvidence: null/i);
    assert.throws(() => materializeRankingV3Corpus({
        manifest,
        qualificationTarget: NONE_TARGET,
        qualificationTargetSha256: targetDigest(NONE_TARGET),
        providerRequestContractSha256: sha('b'),
        captures: [
            { taskId: 't1', captureSha256: sha('2'), providerEvidence: null },
            { taskId: 't2', captureSha256: sha('3'), providerEvidence: null },
        ],
    }), /must not be provided/i);
    assert.throws(() => materializeRankingV3Corpus({
        manifest,
        qualificationTarget: NONE_TARGET,
        qualificationTargetSha256: sha('9'),
        captures: [
            { taskId: 't1', captureSha256: sha('2'), providerEvidence: null },
            { taskId: 't2', captureSha256: sha('3'), providerEvidence: null },
        ],
    }), /does not match/i);
});

test('no_provider_corpus_binds_exactly_the_fifty_sealed_tuning_tasks', () => {
    const manifest = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../evals/search-ranking/cross-repository-v3.manifest.json', import.meta.url)), 'utf8'));
    const target = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../evals/search-ranking/ranking-v3-authorities/QUALIFICATION_TARGET.json', import.meta.url)), 'utf8'));
    const receipt = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../evals/search-ranking/ranking-v3-authorities/QUALIFICATION_TARGET.json.receipt.json', import.meta.url)), 'utf8'));
    assert.deepEqual(target, NONE_TARGET);
    const tuning = manifest.tasks.filter((task) => task.split === 'tuning');
    const heldOut = manifest.tasks.filter((task) => task.split !== 'tuning');
    assert.equal(tuning.length, 50);
    assert.equal(heldOut.length, 51);
    const corpus = materializeRankingV3Corpus({
        manifest,
        qualificationTarget: target,
        qualificationTargetSha256: receipt.targetSha256,
        captures: tuning.map((task, index) => ({ taskId: task.id, captureSha256: crypto.createHash('sha256').update(String(index)).digest('hex'), providerEvidence: null })),
    });
    assert.equal(corpus.taskCount, 50);
    assert.equal(corpus.taskIds.length, 50);
    assert.equal(new Set(corpus.taskIds).size, 50);
    const heldOutIds = new Set(heldOut.map((task) => task.id));
    assert.equal(corpus.taskIds.some((taskId) => heldOutIds.has(taskId)), false);
    assert.equal(corpus.tasks.length, 50);
    assert.ok(corpus.tasks.every((task) => task.split === 'tuning' && SHA256_RE.test(task.taskSha256)));
    const manifestById = new Map(manifest.tasks.map((task) => [task.id, task]));
    for (const task of corpus.tasks) {
        assert.equal(task.repositoryId, manifestById.get(task.taskId).repositoryId);
        assert.equal(corpus.captures.find((capture) => capture.taskId === task.taskId).providerEvidence, null);
    }
    assert.ok(corpus.captures.every((capture) => !('rawProviderEvidence' in capture)));
    const { sha256, ...body } = corpus;
    assert.equal(sha256, crypto.createHash('sha256').update(canonical(body)).digest('hex'));
});

test('b9_no_provider_corpus_feeds_a_nonempty_packet_manifest_through_the_real_cli', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'b9-c1-'));
    try {
        const materializer = fileURLToPath(new URL('./materialize-ranking-v3-corpus.mjs', import.meta.url));
        const packetCli = fileURLToPath(new URL('./build-ranking-judgment-packets.mjs', import.meta.url));
        const manifestPath = fileURLToPath(new URL('../evals/search-ranking/cross-repository-v3.manifest.json', import.meta.url));
        const targetPath = fileURLToPath(new URL('../evals/search-ranking/ranking-v3-authorities/QUALIFICATION_TARGET.json', import.meta.url));
        const receiptPath = fileURLToPath(new URL('../evals/search-ranking/ranking-v3-authorities/QUALIFICATION_TARGET.json.receipt.json', import.meta.url));
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
        const tuning = manifest.tasks.filter((task) => task.split === 'tuning');
        const capturesPath = path.join(root, 'captures.json');
        const corpusPath = path.join(root, 'CORPUS_MANIFEST.json');
        const packetPath = path.join(root, 'RANKING_JUDGMENT_PACKET_MANIFEST.json');
        fs.writeFileSync(capturesPath, `${JSON.stringify(tuning.map((task, index) => ({ taskId: task.id, captureSha256: crypto.createHash('sha256').update(String(index)).digest('hex'), providerEvidence: null })))}\n`);
        const materialize = spawnSync(process.execPath, [
            materializer,
            '--manifest', manifestPath,
            '--target', targetPath,
            '--target-sha256', receipt.targetSha256,
            '--captures', capturesPath,
            '--out', corpusPath,
        ], { encoding: 'utf8' });
        assert.equal(materialize.status, 0, materialize.stderr);
        const corpusBytes = fs.readFileSync(corpusPath);
        const corpus = JSON.parse(corpusBytes.toString('utf8'));
        assert.equal(corpus.taskCount, 50);
        assert.equal(corpus.captures.every((capture) => capture.providerEvidence === null), true);
        assert.equal('rawProviderEvidence' in corpus.captures[0], false);
        const packets = spawnSync(process.execPath, [packetCli, '--corpus', corpusPath, '--out', packetPath], { encoding: 'utf8' });
        assert.equal(packets.status, 0, packets.stderr);
        const packetManifest = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
        assert.ok(packetManifest.packets.length > 0);
        assert.equal(packetManifest.taskCount, 50);
        assert.equal(packetManifest.corpusSha256, crypto.createHash('sha256').update(corpusBytes).digest('hex'));
        const covered = packetManifest.packets.flatMap((packet) => packet.taskIds);
        assert.equal(covered.length, 50);
        assert.equal(new Set(covered).size, 50);
        assert.deepEqual([...covered].sort(), [...corpus.taskIds].sort());
        assert.ok(packetManifest.packets.every((packet) => Object.values(packet.taskSha256ById).every((taskDigest) => SHA256_RE.test(taskDigest))));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
