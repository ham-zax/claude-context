import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildContractIndexV1, sealContractsV1, verifyContractIndexV1 } from './ranking-v3-contract-seal.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
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
