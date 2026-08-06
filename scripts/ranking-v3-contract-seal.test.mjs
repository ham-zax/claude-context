import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalTaskGraphDigest } from './ranking-v3-task-graph.mjs';
import { buildContractIndexV1, sealContractsV1, verifyContractIndexV1, verifyContractSealV1 } from './ranking-v3-contract-seal.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PLAN=path.join(ROOT,'docs/plans/SATORI_RANKING_POLICY_V3_PLAN.md');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fileSha=p=>sha(fs.readFileSync(p));
function make(dir,kind,target){const contract=path.join(dir,`${kind}.json`);fs.writeFileSync(contract,JSON.stringify({kind,target})+'\n');const index=path.join(dir,`${kind}.index.json`);fs.writeFileSync(index,JSON.stringify({schemaVersion:`ranking_v3_${kind}_contract_index_v1`,kind,contractPath:contract,contractSha256:sha(fs.readFileSync(contract)),qualificationTargetSha256:target})+'\n');return index;}
test('builds_canonical_contract_index_and_rejects_target_digest_mismatch',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ranking-contract-')); const target='1'.repeat(64);
 const inputs=Object.fromEntries(['feature','training','decision','activation'].map(k=>[k,make(dir,k,target)]));
 const index=buildContractIndexV1(inputs); assert.equal(index.entries.length,4); assert.equal(verifyContractIndexV1(index).qualificationTargetSha256,target);
 const graph=path.join(dir,'graph.json'); fs.writeFileSync(graph,'{}\n');
 const seal=sealContractsV1({planSha256:'3'.repeat(64),contractIndex:index,taskGraphPath:graph,baselineCommit:'4'.repeat(40),baselineTreeSha256:'5'.repeat(64),sealedAt:'2026-08-06T00:00:00.000Z'});
 assert.equal(seal.planSha256,'3'.repeat(64));
 const bad=make(dir,'training','2'.repeat(64)); assert.throws(()=>buildContractIndexV1({...inputs,training:bad}),/target digest/i);
});
test('seal_uses_canonical_task_graph_digest_not_raw_file_bytes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ranking-contract-')); const target='1'.repeat(64);
 const inputs=Object.fromEntries(['feature','training','decision','activation'].map(k=>[k,make(dir,k,target)]));
 const index=buildContractIndexV1(inputs);
 const graph=path.join(dir,'graph.json'); const graphObject={schemaVersion:'ranking_v3_task_graph_v1',nodes:[{taskId:'A1',taskKind:'static'}],taskGraphSha256:'9'.repeat(64)}; fs.writeFileSync(graph,`${JSON.stringify(graphObject,null,2)}\n`);
 const seal=sealContractsV1({planSha256:'3'.repeat(64),contractIndex:index,taskGraphPath:graph,baselineCommit:'4'.repeat(40),baselineTreeSha256:'5'.repeat(64),sealedAt:'2026-08-06T00:00:00.000Z'});
 assert.equal(seal.taskGraphSha256,canonicalTaskGraphDigest(JSON.parse(fs.readFileSync(graph,'utf8'))));
 assert.notEqual(seal.taskGraphSha256,fileSha(graph));
});
test('seal_rejects_expected_digest_computed_from_raw_file_bytes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ranking-contract-')); const target='1'.repeat(64);
 const inputs=Object.fromEntries(['feature','training','decision','activation'].map(k=>[k,make(dir,k,target)]));
 const index=buildContractIndexV1(inputs);
 const graph=path.join(dir,'graph.json'); fs.writeFileSync(graph,`${JSON.stringify({nodes:[]})}\n`);
 assert.throws(()=>sealContractsV1({planSha256:'3'.repeat(64),contractIndex:index,taskGraphPath:graph,baselineCommit:'4'.repeat(40),baselineTreeSha256:'5'.repeat(64),sealedAt:'2026-08-06T00:00:00.000Z',expectedTaskGraphSha256:fileSha(graph)}),/Expected task graph digest mismatch/i);
});
test('seal_verification_rejects_a_seal_carrying_the_file_bytes_digest',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ranking-contract-')); const target='1'.repeat(64);
 const inputs=Object.fromEntries(['feature','training','decision','activation'].map(k=>[k,make(dir,k,target)]));
 const index=buildContractIndexV1(inputs);
 const indexPath=path.join(dir,'CONTRACT_INDEX.json'); fs.writeFileSync(indexPath,`${JSON.stringify(index,null,2)}\n`);
 const graph=path.join(dir,'graph.json'); fs.writeFileSync(graph,`${JSON.stringify({nodes:[{taskId:'A1',taskKind:'static'}]})}\n`);
 const seal=sealContractsV1({planSha256:sha(fs.readFileSync(PLAN)),contractIndex:index,taskGraphPath:graph,baselineCommit:'4'.repeat(40),baselineTreeSha256:'5'.repeat(64),sealedAt:'2026-08-06T00:00:00.000Z'});
 assert.equal(verifyContractSealV1(seal,{planPath:PLAN,contractIndexPath:indexPath,taskGraphPath:graph}),true);
 assert.throws(()=>verifyContractSealV1({...seal,taskGraphSha256:fileSha(graph)},{planPath:PLAN,contractIndexPath:indexPath,taskGraphPath:graph}),/task graph digest mismatch/i);
});
