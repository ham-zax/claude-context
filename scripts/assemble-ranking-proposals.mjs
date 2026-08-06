import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from './satori-useful-context.mjs';
import { parseRankingProposalV1 } from './ranking-judgments.mjs';

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

export function assembleRankingProposalsV1({ packetManifest, proposals }) {
    if (packetManifest?.schemaVersion !== 'ranking_judgment_packet_manifest_v1') throw new Error('Packet manifest schema mismatch.');
    if (!Array.isArray(packetManifest.packets) || !Array.isArray(proposals)) throw new Error('Packet manifest and proposals are required.');
    const packetById = new Map(packetManifest.packets.map((packet) => [packet.packetId, packet]));
    const proposalByPacket = new Map();
    for (const raw of proposals) {
        const proposal = parseRankingProposalV1(raw);
        const packet = packetById.get(proposal.packetId);
        if (!packet || packet.packetSha256 !== proposal.packetSha256) throw new Error(`Proposal packet binding mismatch for ${proposal.packetId}.`);
        const list = proposalByPacket.get(proposal.packetId) ?? [];
        list.push(proposal);
        proposalByPacket.set(proposal.packetId, list);
    }
    const tasks = [];
    for (const packet of packetManifest.packets) {
        const pair = proposalByPacket.get(packet.packetId) ?? [];
        if (pair.length !== 2) throw new Error(`Packet ${packet.packetId} requires exactly two proposals.`);
        if (pair[0].agentId === pair[1].agentId) throw new Error(`Packet ${packet.packetId} proposals must come from different agents.`);
        const expectedTasks = [...packet.taskIds].sort();
        for (const proposal of pair) {
            const actualTasks = [...new Set(proposal.entries.map((entry) => entry.taskId))].sort();
            if (canonicalJson(actualTasks) !== canonicalJson(expectedTasks)) throw new Error(`Proposal coverage mismatch for ${packet.packetId}.`);
        }
        for (const taskId of expectedTasks) {
            const taskProposals = pair.map((proposal) => ({
                agentId: proposal.agentId,
                entries: proposal.entries.filter((entry) => entry.taskId === taskId),
            })).sort((a, b) => a.agentId.localeCompare(b.agentId));
            tasks.push({ packetId: packet.packetId, taskId, agentIds: taskProposals.map((item) => item.agentId), proposals: taskProposals });
        }
    }
    tasks.sort((a, b) => a.taskId.localeCompare(b.taskId));
    const packetManifestSha256 = sha256(canonicalJson(packetManifest));
    return { schemaVersion: 'ranking_proposal_assembly_v1', packetManifestSha256, taskCount: tasks.length, tasks };
}

function parseArgs(argv) {
    const args = { proposal: [] };
    for (let i = 0; i < argv.length; i += 1) {
        const key = argv[i];
        const value = argv[++i];
        if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument ${key ?? ''}.`);
        if (key === '--proposal') args.proposal.push(value); else args[key.slice(2)] = value;
    }
    return args;
}

export function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    if (!args['packet-manifest'] || !args.out || args.proposal.length === 0) throw new Error('--packet-manifest, --proposal, and --out are required.');
    const packetManifest = JSON.parse(fs.readFileSync(args['packet-manifest'], 'utf8'));
    const proposals = args.proposal.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
    const result = assembleRankingProposalsV1({ packetManifest, proposals });
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${canonicalJson(result)}\n`);
    return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
