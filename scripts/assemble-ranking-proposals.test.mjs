import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleRankingProposalsV1 } from './assemble-ranking-proposals.mjs';

const sha = (c) => c.repeat(64);
const proposal = (agentId, taskId = 't1') => ({
    schemaVersion: 'ranking_proposal_v1',
    packetId: 'packet-001',
    packetSha256: sha('a'),
    agentId,
    entries: [{ taskId, candidateId: 'c1', proposedGrade: 3, sourceSha256: sha('b'), rationale: 'owner source' }],
});

test('rejects_missing_duplicate_or_same_agent_proposals', () => {
    const manifest = {
        schemaVersion: 'ranking_judgment_packet_manifest_v1',
        corpusSha256: sha('c'),
        packetSize: 10,
        taskCount: 1,
        packets: [{ packetId: 'packet-001', packetSha256: sha('a'), taskIds: ['t1'], taskSha256ById: { t1: sha('1') } }],
    };
    const assembled = assembleRankingProposalsV1({ packetManifest: manifest, proposals: [proposal('agent-a'), proposal('agent-b')] });
    assert.equal(assembled.tasks.length, 1);
    assert.deepEqual(assembled.tasks[0].agentIds, ['agent-a', 'agent-b']);
    assert.throws(() => assembleRankingProposalsV1({ packetManifest: manifest, proposals: [proposal('agent-a')] }), /exactly two/i);
    assert.throws(() => assembleRankingProposalsV1({ packetManifest: manifest, proposals: [proposal('agent-a'), proposal('agent-a')] }), /different agents/i);
    assert.throws(() => assembleRankingProposalsV1({ packetManifest: manifest, proposals: [proposal('agent-a'), proposal('agent-b', 'other')] }), /coverage/i);
});
