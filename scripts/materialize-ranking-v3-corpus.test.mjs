import assert from 'node:assert/strict';
import test from 'node:test';
import { materializeRankingV3Corpus } from './materialize-ranking-v3-corpus.mjs';

const sha = (character) => character.repeat(64);
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

test('corpus_binds_all_tuning_tasks_and_contains_raw_provider_authority_only', () => {
    const manifest = {
        sha256: sha('f'),
        tasks: [
            { id: 't1', split: 'tuning', repositoryId: 'r1' },
            { id: 't2', split: 'tuning', repositoryId: 'r2' },
            { id: 'h1', split: 'held_out', repositoryId: 'h1' },
        ],
    };
    const corpus = materializeRankingV3Corpus({
        manifest,
        qualificationTargetSha256: sha('1'),
        providerRequestContractSha256: sha('b'),
        serviceClass: 'offline_linux_x64',
        captures: [
            { taskId: 't1', captureSha256: sha('2'), rawProviderEvidence: raw('t1') },
            { taskId: 't2', captureSha256: sha('3'), rawProviderEvidence: raw('t2') },
        ],
    });
    assert.deepEqual(corpus.taskIds, ['t1', 't2']);
    assert.equal(corpus.taskCount, 2);
    assert.equal(JSON.stringify(corpus).includes('held_out'), false);
    assert.doesNotMatch(JSON.stringify(corpus), /percentile|normalized|margin/i);
    assert.throws(() => materializeRankingV3Corpus({
        manifest,
        qualificationTargetSha256: sha('1'),
        providerRequestContractSha256: sha('b'),
        serviceClass: 'offline_linux_x64',
        captures: [{ taskId: 't1', captureSha256: sha('2'), rawProviderEvidence: raw('t1') }],
    }), /coverage/i);
    assert.throws(() => materializeRankingV3Corpus({
        manifest,
        qualificationTargetSha256: sha('1'),
        providerRequestContractSha256: sha('b'),
        serviceClass: 'offline_linux_x64',
        captures: [
            { taskId: 't1', captureSha256: sha('2'), rawProviderEvidence: { ...raw('t1'), withinQueryPercentile: 0.5 } },
            { taskId: 't2', captureSha256: sha('3'), rawProviderEvidence: raw('t2') },
        ],
    }), /derived|exact keys/i);
});
