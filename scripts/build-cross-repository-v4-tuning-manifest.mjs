import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from './satori-useful-context.mjs';
import { parseRankingJudgmentV1 } from './ranking-judgments.mjs';

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function clone(value) { return structuredClone(value); }

export function buildCrossRepositoryV4TuningManifest({ sourceManifest, adjudicated }) {
    if (sourceManifest?.version !== 3 || !Array.isArray(sourceManifest.tasks) || !Array.isArray(sourceManifest.repositories)) throw new Error('Source manifest must be cross-repository v3.');
    if (adjudicated?.schemaVersion !== 'ranking_adjudicated_judgments_v1' || !Array.isArray(adjudicated.judgments)) throw new Error('Adjudicated judgments schema mismatch.');
    const tuningTasks = sourceManifest.tasks.filter((task) => task.split === 'tuning').sort((a, b) => a.id.localeCompare(b.id));
    const tuningTaskIds = new Set(tuningTasks.map((task) => task.id));
    const judgmentsByTask = new Map();
    for (const raw of adjudicated.judgments) {
        if (typeof raw.taskId !== 'string' || !tuningTaskIds.has(raw.taskId)) throw new Error(`Judgment task ${raw.taskId ?? '<missing>'} is not a tuning task.`);
        const parsed = parseRankingJudgmentV1(Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'taskId')));
        const list = judgmentsByTask.get(raw.taskId) ?? [];
        list.push(parsed);
        judgmentsByTask.set(raw.taskId, list);
    }
    const tasks = tuningTasks.map((task) => {
        const judgments = judgmentsByTask.get(task.id) ?? [];
        if (judgments.length === 0) throw new Error(`Tuning task ${task.id} has no adjudicated judgments.`);
        return { ...clone(task), judgmentSha256: sha256(canonicalJson(judgments)) };
    });
    const repositoryIds = new Set(tasks.map((task) => task.repositoryId));
    const repositories = sourceManifest.repositories.filter((repository) => repositoryIds.has(repository.id) && repository.split === 'tuning').map(clone).sort((a, b) => a.id.localeCompare(b.id));
    if (repositories.length !== repositoryIds.size) throw new Error('Every tuning task must resolve to a tuning repository.');
    const sourceHeldoutAuthoritySha256 = sha256(canonicalJson({
        repositories: sourceManifest.repositories.filter((repository) => repository.split === 'held_out'),
        tasks: sourceManifest.tasks.filter((task) => task.split === 'held_out'),
    }));
    const body = {
        version: 4,
        kind: 'cross_repository_ranking_tuning_manifest_v4',
        sourceManifestSha256: sourceManifest.sha256 ?? sha256(canonicalJson(sourceManifest)),
        sourceHeldoutAuthoritySha256,
        proposalAssemblySha256: adjudicated.proposalAssemblySha256,
        leakage: clone(sourceManifest.leakage),
        repositories,
        tasks,
    };
    return { ...body, sha256: sha256(canonicalJson(body)) };
}

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i], value = argv[i + 1];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument ${key ?? ''}.`);
        args[key.slice(2)] = value;
    }
    return args;
}

export function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    if (!args.source || !args.judgments || !args.out) throw new Error('--source, --judgments, and --out are required.');
    const result = buildCrossRepositoryV4TuningManifest({
        sourceManifest: JSON.parse(fs.readFileSync(args.source, 'utf8')),
        adjudicated: JSON.parse(fs.readFileSync(args.judgments, 'utf8')),
    });
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${canonicalJson(result)}\n`);
    return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
