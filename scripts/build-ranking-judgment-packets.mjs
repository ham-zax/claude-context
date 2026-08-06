import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from './satori-useful-context.mjs';

const SHA256 = /^[a-f0-9]{64}$/;

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function assertNonEmpty(value, label) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be non-empty.`);
}

function canonicalTask(task) {
    assertNonEmpty(task?.taskId, 'taskId');
    assertNonEmpty(task?.repositoryId, 'repositoryId');
    if (task.split !== 'tuning') throw new Error(`Task ${task.taskId} must belong to the tuning split.`);
    if (!SHA256.test(task.taskSha256 ?? '')) throw new Error(`Task ${task.taskId} has an invalid taskSha256.`);
    return {
        taskId: task.taskId,
        taskSha256: task.taskSha256,
        repositoryId: task.repositoryId,
        split: 'tuning',
    };
}

export function buildRankingJudgmentPacketManifestV1(input) {
    if (!SHA256.test(input?.corpusSha256 ?? '')) throw new Error('corpusSha256 is invalid.');
    if (!Array.isArray(input?.tasks) || input.tasks.length === 0) throw new Error('tasks must be a non-empty array.');
    const packetSize = input.packetSize ?? 10;
    if (!Number.isInteger(packetSize) || packetSize < 1 || packetSize > 100) throw new Error('packetSize must be an integer from 1 to 100.');
    const tasks = input.tasks.map(canonicalTask).sort((a, b) => a.taskId.localeCompare(b.taskId));
    const ids = new Set();
    for (const task of tasks) {
        if (ids.has(task.taskId)) throw new Error(`Duplicate task ${task.taskId}.`);
        ids.add(task.taskId);
    }
    const packets = [];
    for (let offset = 0; offset < tasks.length; offset += packetSize) {
        const group = tasks.slice(offset, offset + packetSize);
        const ordinal = String(packets.length + 1).padStart(3, '0');
        const packetId = `packet-${ordinal}`;
        const taskIds = group.map((task) => task.taskId);
        const taskSha256ById = Object.fromEntries(group.map((task) => [task.taskId, task.taskSha256]));
        const packetSha256 = sha256(canonicalJson({ packetId, corpusSha256: input.corpusSha256, taskSha256ById }));
        packets.push({ packetId, packetSha256, taskIds, taskSha256ById });
    }
    return {
        schemaVersion: 'ranking_judgment_packet_manifest_v1',
        corpusSha256: input.corpusSha256,
        packetSize,
        taskCount: tasks.length,
        packets,
    };
}

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 1) {
        const key = argv[i];
        if (!key.startsWith('--')) throw new Error(`Unexpected argument ${key}.`);
        const value = argv[++i];
        if (value === undefined) throw new Error(`Missing value for ${key}.`);
        args[key.slice(2)] = value;
    }
    return args;
}

export function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    if (!args.corpus || !args.out) throw new Error('--corpus and --out are required.');
    const corpusBytes = fs.readFileSync(args.corpus);
    const corpus = JSON.parse(corpusBytes.toString('utf8'));
    const rawTasks = Array.isArray(corpus.tasks) ? corpus.tasks : [];
    const tasks = rawTasks.map((task) => ({
        taskId: task.taskId ?? task.id,
        taskSha256: task.taskSha256 ?? sha256(canonicalJson(task)),
        repositoryId: task.repositoryId,
        split: task.split,
    }));
    const result = buildRankingJudgmentPacketManifestV1({
        corpusSha256: sha256(corpusBytes),
        packetSize: args['packet-size'] === undefined ? undefined : Number(args['packet-size']),
        tasks,
    });
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${canonicalJson(result)}\n`);
    return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
