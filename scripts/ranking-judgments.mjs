import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{64}$/;
const GRADES = new Set([0, 1, 2, 3]);

function exact(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} must contain exact keys.`);
}

function nonEmpty(value, label) {
    if (typeof value !== 'string' || !value) throw new Error(`${label} must be non-empty.`);
    return value;
}

function validSha(value, label) {
    if (!SHA.test(value ?? '')) throw new Error(`${label} is invalid.`);
    return value;
}

export function parseRankingJudgmentV1(value) {
    const keys = value?.judged === true
        ? ['schemaVersion', 'candidateId', 'judged', 'grade', 'sourceSha256', 'rationale']
        : ['schemaVersion', 'candidateId', 'judged', 'sourceSha256'];
    exact(value, keys, 'RankingJudgmentV1');
    if (value.schemaVersion !== 'ranking_judgment_v1') throw new Error('Judgment schema mismatch.');
    nonEmpty(value.candidateId, 'candidateId');
    validSha(value.sourceSha256, 'sourceSha256');
    if (value.judged === true) {
        if (!GRADES.has(value.grade)) throw new Error('Judged grade must be 0, 1, 2, or 3.');
        nonEmpty(value.rationale, 'Judged rationale');
        return structuredClone(value);
    }
    if (value.judged !== false) throw new Error('judged must be boolean.');
    return { schemaVersion: 'ranking_judgment_v1', candidateId: value.candidateId, judged: false, sourceSha256: value.sourceSha256 };
}

export function buildJudgedPairsV1(values) {
    const judged = values.map(parseRankingJudgmentV1).filter((value) => value.judged === true);
    const pairs = [];
    for (let i = 0; i < judged.length; i += 1) {
        for (let j = i + 1; j < judged.length; j += 1) {
            if (judged[i].grade === judged[j].grade) continue;
            const high = judged[i].grade > judged[j].grade ? judged[i] : judged[j];
            const low = high === judged[i] ? judged[j] : judged[i];
            pairs.push({ preferredCandidateId: high.candidateId, otherCandidateId: low.candidateId, gradeDifference: high.grade - low.grade });
        }
    }
    return pairs;
}

export function parseCandidatePoolV1(value) {
    exact(value, ['schemaVersion', 'packetId', 'packetSha256', 'captureSha256', 'sourceTreeSha256', 'tasks'], 'CandidatePoolV1');
    if (value.schemaVersion !== 'ranking_candidate_pool_v1') throw new Error('Candidate pool schema mismatch.');
    nonEmpty(value.packetId, 'packetId');
    validSha(value.packetSha256, 'packetSha256');
    validSha(value.captureSha256, 'captureSha256');
    validSha(value.sourceTreeSha256, 'sourceTreeSha256');
    if (!Array.isArray(value.tasks) || value.tasks.length === 0) throw new Error('Candidate pool tasks must be non-empty.');
    const taskIds = new Set();
    const tasks = value.tasks.map((task) => {
        exact(task, ['taskId', 'taskSha256', 'candidates'], 'CandidatePoolTaskV1');
        nonEmpty(task.taskId, 'taskId');
        validSha(task.taskSha256, 'taskSha256');
        if (taskIds.has(task.taskId)) throw new Error(`Duplicate task ${task.taskId}.`);
        taskIds.add(task.taskId);
        if (!Array.isArray(task.candidates) || task.candidates.length === 0) throw new Error(`Task ${task.taskId} candidates must be non-empty.`);
        const candidateIds = new Set();
        const candidates = task.candidates.map((candidate) => {
            exact(candidate, ['candidateId', 'sourceSha256'], 'CandidatePoolCandidateV1');
            nonEmpty(candidate.candidateId, 'candidateId');
            validSha(candidate.sourceSha256, 'sourceSha256');
            if (candidateIds.has(candidate.candidateId)) throw new Error(`Duplicate candidate ${candidate.candidateId}.`);
            candidateIds.add(candidate.candidateId);
            return structuredClone(candidate);
        }).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
        return { taskId: task.taskId, taskSha256: task.taskSha256, candidates };
    }).sort((a, b) => a.taskId.localeCompare(b.taskId));
    return { schemaVersion: 'ranking_candidate_pool_v1', packetId: value.packetId, packetSha256: value.packetSha256, captureSha256: value.captureSha256, sourceTreeSha256: value.sourceTreeSha256, tasks };
}

export function parseRankingProposalV1(value) {
    exact(value, ['schemaVersion', 'packetId', 'packetSha256', 'agentId', 'entries'], 'RankingProposalV1');
    if (value.schemaVersion !== 'ranking_proposal_v1') throw new Error('Proposal schema mismatch.');
    nonEmpty(value.packetId, 'packetId');
    validSha(value.packetSha256, 'packetSha256');
    nonEmpty(value.agentId, 'agentId');
    if (!Array.isArray(value.entries) || value.entries.length === 0) throw new Error('Proposal entries must be non-empty.');
    const seen = new Set();
    const entries = value.entries.map((entry) => {
        exact(entry, ['taskId', 'candidateId', 'proposedGrade', 'sourceSha256', 'rationale'], 'RankingProposalEntryV1');
        nonEmpty(entry.taskId, 'taskId');
        nonEmpty(entry.candidateId, 'candidateId');
        if (!GRADES.has(entry.proposedGrade)) throw new Error('proposedGrade must be 0, 1, 2, or 3.');
        validSha(entry.sourceSha256, 'sourceSha256');
        nonEmpty(entry.rationale, 'rationale');
        const key = `${entry.taskId}\0${entry.candidateId}`;
        if (seen.has(key)) throw new Error(`Duplicate proposal entry ${key}.`);
        seen.add(key);
        return structuredClone(entry);
    }).sort((a, b) => a.taskId.localeCompare(b.taskId) || a.candidateId.localeCompare(b.candidateId));
    return { schemaVersion: 'ranking_proposal_v1', packetId: value.packetId, packetSha256: value.packetSha256, agentId: value.agentId, entries };
}

export function verifyProposalForPacketV1(value, packet) {
    const proposal = parseRankingProposalV1(value);
    if (proposal.packetId !== packet?.packetId || proposal.packetSha256 !== packet?.packetSha256) throw new Error('Proposal packet binding mismatch.');
    const expected = [...(packet.taskIds ?? [])].sort();
    const actual = [...new Set(proposal.entries.map((entry) => entry.taskId))].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Proposal task coverage mismatch.');
    return proposal;
}

export function parseAdjudicatedJudgmentsV1(value) {
    exact(value, ['schemaVersion', 'proposalAssemblySha256', 'judgments'], 'AdjudicatedJudgmentsV1');
    if (value.schemaVersion !== 'ranking_adjudicated_judgments_v1') throw new Error('Adjudicated judgments schema mismatch.');
    validSha(value.proposalAssemblySha256, 'proposalAssemblySha256');
    if (!Array.isArray(value.judgments) || value.judgments.length === 0) throw new Error('Adjudicated judgments must be non-empty.');
    const seen = new Set();
    const judgments = value.judgments.map((raw) => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Adjudicated judgment must be an object.');
        nonEmpty(raw.taskId, 'taskId');
        const parsed = parseRankingJudgmentV1(Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'taskId')));
        const key = `${raw.taskId}\0${parsed.candidateId}`;
        if (seen.has(key)) throw new Error(`Duplicate adjudicated judgment ${key}.`);
        seen.add(key);
        return { taskId: raw.taskId, ...parsed };
    }).sort((a, b) => a.taskId.localeCompare(b.taskId) || a.candidateId.localeCompare(b.candidateId));
    return { schemaVersion: 'ranking_adjudicated_judgments_v1', proposalAssemblySha256: value.proposalAssemblySha256, judgments };
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

export function main(argv = process.argv.slice(2)) {
    const [command, ...rest] = argv;
    const inputIndex = rest.indexOf('--input');
    if (inputIndex === -1 || !rest[inputIndex + 1]) throw new Error('--input is required.');
    const value = readJson(rest[inputIndex + 1]);
    if (command === 'verify-pool') return parseCandidatePoolV1(value);
    if (command === 'verify-proposal') return parseRankingProposalV1(value);
    if (command === 'verify-adjudicated') return parseAdjudicatedJudgmentsV1(value);
    throw new Error(`Unknown command ${command ?? '<missing>'}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
