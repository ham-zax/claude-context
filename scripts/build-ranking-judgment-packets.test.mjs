import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRankingJudgmentPacketManifestV1 } from './build-ranking-judgment-packets.mjs';

const sha = (c) => c.repeat(64);

test('packet_manifest_covers_each_tuning_task_exactly_once', () => {
    const manifest = buildRankingJudgmentPacketManifestV1({
        corpusSha256: sha('a'),
        packetSize: 2,
        tasks: [
            { taskId: 't3', taskSha256: sha('3'), split: 'tuning', repositoryId: 'r2' },
            { taskId: 't1', taskSha256: sha('1'), split: 'tuning', repositoryId: 'r1' },
            { taskId: 't2', taskSha256: sha('2'), split: 'tuning', repositoryId: 'r1' },
        ],
    });
    assert.equal(manifest.taskCount, 3);
    assert.deepEqual(manifest.packets.flatMap((packet) => packet.taskIds), ['t1', 't2', 't3']);
    assert.equal(new Set(manifest.packets.flatMap((packet) => packet.taskIds)).size, 3);
    assert.throws(() => buildRankingJudgmentPacketManifestV1({
        corpusSha256: sha('a'),
        tasks: [
            { taskId: 't1', taskSha256: sha('1'), split: 'tuning', repositoryId: 'r1' },
            { taskId: 't1', taskSha256: sha('1'), split: 'tuning', repositoryId: 'r1' },
        ],
    }), /duplicate task/i);
    assert.throws(() => buildRankingJudgmentPacketManifestV1({
        corpusSha256: sha('a'),
        tasks: [{ taskId: 'h1', taskSha256: sha('4'), split: 'held_out', repositoryId: 'r3' }],
    }), /tuning/i);
});
