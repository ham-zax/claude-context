#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const COMMIT = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const CONTRACT_KEYS = Object.freeze([
  'task_id','title','risk','invariant','owners','production_callers','test_callers',
  'approved_files','interface_changes','security_boundaries','overlap_with',
  'focused_command','affected_command','full_suite_triggers','red_evidence_required','instructions',
].sort());
const BOUNDARY_GENERATORS = new Set(['R1.0B','R1.6','DB','DC0','DC1','DD','DE','DF','DG','DH','DI']);
const STATIC_SCOPES = Object.freeze({
  'gate0-bootstrap': ['R0.2','R1.T0','R1.0','R1.0B'],
  'gate1-target-bound': ['R1.T1','R1.T2','R1.1','R1.2','R1.3','R1.4','R1.5','R1.6'],
  'wave-a': ['A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11Q','A11H','A12','A_GATE','DB'],
  'wave-b': ['B1','B2','B3','B4','B5','B6','B7','B8','B9','B_GATE','DC0'],
  'wave-c-seed': ['C1','C1G','DC1'],
  'wave-d': ['D1','D2','D3','D4','D5','D6','D7','D8','D_GATE','DE'],
  'wave-f': ['F0','F1','F2','F6','F7','F8','F9','F_GATE','DG'],
  'wave-g': ['G1','G2','G3','G4','G5','G6','G6A','G6B','G6C','G7','G_GATE','DH'],
  'wave-h': ['H0','H1','H2','H3','H4','H5','H6','H7','H8','H9','H10','H_GATE_QUALIFIED','H_GATE_REJECTED','H_GATE_INSUFFICIENT','DI'],
  'wave-i': ['I0','I1','I2','I3','I4','I3R','I5','I6','I_GATE_ACCEPTED','I_GATE_REJECTED'],
});

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function canonicalSha(value) { return sha256(Buffer.from(canonicalJson(value), 'utf8')); }
function fileSha(file) { return sha256(fs.readFileSync(file)); }
function assertExactKeys(value, keys, label) {
  const actual = Object.keys(value).sort();
  if (actual.length !== keys.length || actual.some((key,index)=>key!==keys[index])) {
    throw new Error(`${label} must have exact keys; got ${actual.join(',')}.`);
  }
}
function requireCommit(value,label) { if(!COMMIT.test(value??'')) throw new Error(`${label} must be a lowercase commit SHA.`); return value; }
function requireSha(value,label,nullable=false) { if(nullable && value===null) return null; if(!SHA256.test(value??'')) throw new Error(`${label} must be a lowercase SHA-256 digest.`); return value; }

export function loadTaskCatalog(catalogDir) {
  const catalog = new Map();
  for (const name of fs.readdirSync(catalogDir).filter((name)=>/^FT-.*\.json$/.test(name)).sort()) {
    const value = JSON.parse(fs.readFileSync(path.join(catalogDir,name),'utf8'));
    if (!Array.isArray(value)) throw new Error(`${name} must contain a contract array.`);
    for (const contract of value) {
      if (!contract || typeof contract !== 'object' || Array.isArray(contract)) throw new Error(`${name} has a non-object contract.`);
      assertExactKeys(contract, CONTRACT_KEYS, `${name}:${contract.task_id ?? '<missing>'}`);
      if (typeof contract.task_id !== 'string' || !contract.task_id) throw new Error(`${name} has a contract without task_id.`);
      if (catalog.has(contract.task_id)) throw new Error(`Duplicate catalog task ${contract.task_id}.`);
      catalog.set(contract.task_id, Object.freeze(structuredClone(contract)));
    }
  }
  if (catalog.size === 0) throw new Error('Task catalog is empty.');
  return catalog;
}

function cardType(taskId, contract) {
  if (BOUNDARY_GENERATORS.has(taskId)) return 'boundary_generator';
  if (taskId.endsWith('_GATE') || taskId.includes('_GATE_')) return 'gate_evidence';
  if (taskId === 'R1.0') return 'human_decision';
  if (contract.red_evidence_required === true) return 'code_change';
  if (/^(C2|C3A|C3B|E1|E2)\./.test(taskId) || /^[HI]\d/.test(taskId) || taskId === 'I3R') return 'execution';
  return 'evidence_or_code';
}

function resolvedScope(input) {
  if (input.scopeTaskIds) return [...input.scopeTaskIds];
  if (input.scopeId === 'wave-c-expanded' || input.scopeId === 'wave-e') {
    const dynamic = input.taskGraphExpansionReceipts.flatMap((entry)=>entry.taskIds ?? []);
    const tail = input.scopeId === 'wave-c-expanded'
      ? ['C3S','C4','C5','C6','C_GATE','DD']
      : ['E3_INPUT_SEAL','E3','E4','E_GATE_SELECTED','E_GATE_INSUFFICIENT','E_GATE_LEARNED_NOT_JUSTIFIED','DF'];
    if (dynamic.length === 0) throw new Error(`${input.scopeId} requires expanded task IDs.`);
    return [...dynamic, ...tail];
  }
  const scope = STATIC_SCOPES[input.scopeId];
  if (!scope) throw new Error(`Unknown dispatch scope '${input.scopeId}'.`);
  return [...scope];
}

export function buildCardManifest(input) {
  requireCommit(input.baselineCommit,'baselineCommit');
  requireCommit(input.dispatchCommit,'dispatchCommit');
  requireSha(input.dispatchTreeSha256,'dispatchTreeSha256');
  for (const [key,value] of [
    ['qualificationTargetSha256',input.qualificationTargetSha256],
    ['contractSealSha256',input.contractSealSha256],
    ['taskGraphSha256',input.taskGraphSha256],
    ['previousManifestSha256',input.previousManifestSha256],
  ]) requireSha(value,key,true);
  if (!(input.catalog instanceof Map)) throw new Error('catalog must be a loaded task Map.');
  const planBytes = fs.readFileSync(input.planPath);
  const taskIds = resolvedScope(input);
  if (input.includeNextGenerator && !taskIds.includes(input.includeNextGenerator)) taskIds.push(input.includeNextGenerator);
  if (new Set(taskIds).size !== taskIds.length) throw new Error('Dispatch scope contains duplicate task IDs.');
  const cards = taskIds.map((taskId) => {
    const contract = input.catalog.get(taskId);
    if (!contract) throw new Error(`Unknown catalog task '${taskId}'.`);
    const isBoundaryGenerator = BOUNDARY_GENERATORS.has(taskId);
    return {
      schemaVersion: 'ranking_v3_dispatch_card_v2',
      taskId,
      cardType: cardType(taskId, contract),
      contractSha256: canonicalSha(contract),
      contract,
      isBoundaryGenerator,
      dispatchable: !(isBoundaryGenerator && taskId === input.includeNextGenerator),
    };
  });
  if (input.includeNextGenerator) {
    const next = cards.find((card)=>card.taskId===input.includeNextGenerator);
    if (!next || !next.isBoundaryGenerator) throw new Error('Next generator must be a cataloged boundary-generator card in the target scope.');
  }
  const unsigned = {
    schemaVersion: 'ranking_v3_dispatch_cards_v2',
    scopeId: input.scopeId,
    planSha256: sha256(planBytes),
    baselineCommit: input.baselineCommit,
    dispatchCommit: input.dispatchCommit,
    dispatchTreeSha256: input.dispatchTreeSha256,
    qualificationTargetSha256: input.qualificationTargetSha256,
    contractSealSha256: input.contractSealSha256,
    taskGraphSha256: input.taskGraphSha256,
    taskGraphExpansionReceipts: structuredClone(input.taskGraphExpansionReceipts ?? []),
    prerequisiteReceipts: structuredClone(input.prerequisiteReceipts ?? []),
    previousManifestSha256: input.previousManifestSha256,
    nextBoundaryGeneratorTaskId: input.includeNextGenerator ?? null,
    cards,
  };
  return { ...unsigned, manifestSha256: canonicalSha(unsigned) };
}

export function validateCardManifest(manifest,{planPath,catalog}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Card manifest must be an object.');
  const { manifestSha256, ...unsigned } = manifest;
  requireSha(manifestSha256,'manifestSha256');
  if (canonicalSha(unsigned) !== manifestSha256) throw new Error('Card manifest digest mismatch.');
  if (manifest.planSha256 !== fileSha(planPath)) throw new Error('Card manifest plan digest mismatch.');
  if (!Array.isArray(manifest.cards) || manifest.cards.length === 0) throw new Error('Card manifest has no cards.');
  const seen = new Set();
  for (const card of manifest.cards) {
    if (seen.has(card.taskId)) throw new Error(`Duplicate card ${card.taskId}.`);
    seen.add(card.taskId);
    const contract = catalog.get(card.taskId);
    if (!contract) throw new Error(`Unknown catalog task '${card.taskId}'.`);
    if (canonicalSha(contract) !== card.contractSha256 || canonicalSha(card.contract) !== card.contractSha256) throw new Error(`Contract digest mismatch for ${card.taskId}.`);
  }
  if (manifest.nextBoundaryGeneratorTaskId !== null) {
    const next = manifest.cards.find((card)=>card.taskId===manifest.nextBoundaryGeneratorTaskId);
    if (!next || next.isBoundaryGenerator !== true || next.dispatchable !== false) throw new Error('Next boundary generator is missing or prematurely dispatchable.');
  }
  return true;
}

function parseArgs(argv) {
  const [command,...rest]=argv; const options={};
  for(let i=0;i<rest.length;i+=1){const arg=rest[i]; if(!arg.startsWith('--'))throw new Error(`Unknown argument ${arg}.`); i+=1; if(i>=rest.length)throw new Error(`Missing value after ${arg}.`); options[arg.slice(2)]=rest[i];}
  return {command,options};
}
function optionalFileDigest(value) { return !value || value === 'none' ? null : fileSha(path.resolve(value)); }
function readIndex(value) { if(!value || value==='none') return []; const parsed=JSON.parse(fs.readFileSync(path.resolve(value),'utf8')); return Array.isArray(parsed)?parsed:(parsed.receipts??parsed.entries??[]); }
function usage(){return 'Usage: node scripts/ranking-v3-dispatch-cards.mjs build|verify ...';}

export function main(argv=process.argv.slice(2)) {
  const {command,options}=parseArgs(argv);
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const catalog=loadTaskCatalog(path.resolve(options['catalog-dir']??path.join(root,'round-contracts')));
  const planPath=path.resolve(options.plan??path.join(root,'docs/plans/SATORI_RANKING_POLICY_V3_PLAN.md'));
  if(command==='build'){
    for(const key of ['scope','baseline-commit','dispatch-commit','dispatch-tree-manifest','out']) if(!options[key]) throw new Error(`build requires --${key}.`);
    const treeManifestPath=path.resolve(options['dispatch-tree-manifest']);
    const expansion=readIndex(options['expansion-receipts']);
    const manifest=buildCardManifest({
      scopeId:options.scope,
      baselineCommit:options['baseline-commit'],
      dispatchCommit:options['dispatch-commit'],
      dispatchTreeSha256:fileSha(treeManifestPath),
      qualificationTargetSha256:optionalFileDigest(options['qualification-target']),
      contractSealSha256:optionalFileDigest(options['contract-seal']),
      taskGraphSha256:optionalFileDigest(options['task-graph']),
      taskGraphExpansionReceipts:expansion,
      prerequisiteReceipts:readIndex(options['prerequisite-receipts']),
      previousManifestSha256:optionalFileDigest(options['previous-manifest']),
      includeNextGenerator:!options['include-next-generator']||options['include-next-generator']==='none'?null:options['include-next-generator'],
      planPath,catalog,
    });
    const out=path.resolve(options.out); fs.mkdirSync(out,{recursive:true});
    for(const card of manifest.cards) fs.writeFileSync(path.join(out,`${card.taskId.replaceAll('/','_')}.card.json`),`${JSON.stringify(card,null,2)}\n`);
    fs.writeFileSync(path.join(out,'cards.manifest.json'),`${JSON.stringify(manifest,null,2)}\n`);
    return manifest;
  }
  if(command==='verify'){
    if(!options.manifest)throw new Error('verify requires --manifest.');
    const manifest=JSON.parse(fs.readFileSync(path.resolve(options.manifest),'utf8'));
    validateCardManifest(manifest,{planPath,catalog}); return manifest;
  }
  throw new Error(`Unknown command '${command??''}'.`);
}
if(path.resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)){
 try{main();}catch(error){process.stderr.write(`ranking-v3-dispatch-cards: ${error instanceof Error?error.message:String(error)}\n${usage()}\n`);process.exitCode=1;}
}
