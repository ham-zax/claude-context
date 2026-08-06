import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildTaskGraphDeclarationV1, activeConditionalPredecessors, canonicalTaskGraphDigest, validateTaskGraphDeclarationV1, verifyReadyV1 } from './ranking-v3-task-graph.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PLAN=path.join(ROOT,'docs/plans/SATORI_RANKING_POLICY_V3_PLAN.md');
test('declaration_rehashes_plan_and_selected_replay_edges_are_exclusive',()=>{
 const d=buildTaskGraphDeclarationV1(PLAN);
 assert.match(d.planSha256,/^[a-f0-9]{64}$/);
 assert.equal(validateTaskGraphDeclarationV1(d,{planPath:PLAN}),true);
 assert.deepEqual(activeConditionalPredecessors(d,'H6',{selectedArtifactMode:'disabled'}),['H3']);
 assert.deepEqual(activeConditionalPredecessors(d,'H6',{selectedArtifactMode:'provider_derived'}),['H4']);
 assert.throws(()=>validateTaskGraphDeclarationV1({...d,planSha256:'0'.repeat(64)},{planPath:PLAN}),/plan digest/i);
});
// T02 trust-model tests: the receipt acceptance criteria are the gate trust boundary.
// The sealed authorities below are the ones the committed receipts and gate must bind
// (plan SATORI_RANKING_POLICY_V3_PLAN.md, TASK_GRAPH.json taskGraphSha256, CONTRACT_SEAL.json).
const PLAN_SHA='694a4ab1d2c062c29596deb9870c8008006684e9ecf54cc1bdf2d6908654eb78';
const GRAPH_SHA='59c7786adc4157f0cefeb2a1f26edcede64140b957a230d6e60117786041f511';
const SEAL_SHA='9777e09625b182d1cfbd4711920920dcb3ae3ac49bac4e70a003d1453d385444';
const HEAD_SHA='fa3442599f3f6d27bcfba75cade9e599a73d158b';
const TREE_SHA='d5e230db2d2eaff903b94e9f778bf33263148151';
const ZERO64='0'.repeat(64);
const A_TASKS=['A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11H','A11Q','A12'];
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
const digest=v=>crypto.createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex');
function aGateGraph(){return{schemaVersion:'ranking_v3_task_graph_v1',planSha256:PLAN_SHA,taskGraphSha256:GRAPH_SHA,nodes:[...A_TASKS,'A_GATE'].map(taskId=>({taskId,taskKind:taskId==='A_GATE'?'gate':'static'})),hardEdges:A_TASKS.map(requires=>({kind:'hard',taskId:'A_GATE',requires})),conditionalEdges:[]};}
function makeReceipt(taskId,overrides={}){const r={schemaVersion:'ranking_v3_task_receipt_v1',taskId,planSha256:PLAN_SHA,taskGraphSha256:GRAPH_SHA,contractSealSha256:SEAL_SHA,headSha:HEAD_SHA,treeSha:TREE_SHA,testCommand:`node --test packages/test-${taskId}.test.mjs`,result:'passed',artifactSha256:ZERO64,...overrides};const{sha256,...rest}=r;return{...rest,sha256:overrides.sha256??digest(rest)};}
function validIndex(){const index={};for(const taskId of A_TASKS)index[taskId]=makeReceipt(taskId);return index;}
test('gate_rejects_forged_receipt_missing_schema',()=>{const index=validIndex();index.A1={};assert.equal(verifyReadyV1({graph:aGateGraph(),nodeId:'A_GATE',receiptIndex:index,contractSealSha256:SEAL_SHA}).verdict,'blocked');});
test('gate_rejects_forged_receipt_with_wrong_task_id',()=>{const index=validIndex();index.A1=makeReceipt('A2');assert.equal(verifyReadyV1({graph:aGateGraph(),nodeId:'A_GATE',receiptIndex:index,contractSealSha256:SEAL_SHA}).verdict,'blocked');});
test('gate_rejects_forged_receipt_with_wrong_schema_version',()=>{const index=validIndex();index.A1={...makeReceipt('A1'),schemaVersion:'ranking_v3_task_receipt_v0'};assert.equal(verifyReadyV1({graph:aGateGraph(),nodeId:'A_GATE',receiptIndex:index,contractSealSha256:SEAL_SHA}).verdict,'blocked');});
test('gate_rejects_forged_receipt_with_tampered_self_digest',()=>{const index=validIndex();index.A1=makeReceipt('A1',{sha256:ZERO64});assert.equal(verifyReadyV1({graph:aGateGraph(),nodeId:'A_GATE',receiptIndex:index,contractSealSha256:SEAL_SHA}).verdict,'blocked');});
test('gate_rejects_forged_receipt_bound_to_foreign_plan',()=>{const index=validIndex();index.A1=makeReceipt('A1',{planSha256:'1'.repeat(64)});assert.equal(verifyReadyV1({graph:aGateGraph(),nodeId:'A_GATE',receiptIndex:index,contractSealSha256:SEAL_SHA}).verdict,'blocked');});
test('gate_rejects_forged_receipt_bound_to_foreign_graph',()=>{const index=validIndex();index.A1=makeReceipt('A1',{taskGraphSha256:'1'.repeat(64)});assert.equal(verifyReadyV1({graph:aGateGraph(),nodeId:'A_GATE',receiptIndex:index,contractSealSha256:SEAL_SHA}).verdict,'blocked');});
test('gate_rejects_forged_receipt_bound_to_foreign_seal',()=>{const index=validIndex();index.A1=makeReceipt('A1',{contractSealSha256:'1'.repeat(64)});assert.equal(verifyReadyV1({graph:aGateGraph(),nodeId:'A_GATE',receiptIndex:index,contractSealSha256:SEAL_SHA}).verdict,'blocked');});
test('gate_rejects_forged_receipt_with_nonpassed_result',()=>{const index=validIndex();index.A1=makeReceipt('A1',{result:'failed'});assert.equal(verifyReadyV1({graph:aGateGraph(),nodeId:'A_GATE',receiptIndex:index,contractSealSha256:SEAL_SHA}).verdict,'blocked');});
test('gate_rejects_forged_receipt_with_invalid_digest_shape',()=>{const index=validIndex();index.A1=makeReceipt('A1',{artifactSha256:'not-a-sha256'});assert.equal(verifyReadyV1({graph:aGateGraph(),nodeId:'A_GATE',receiptIndex:index,contractSealSha256:SEAL_SHA}).verdict,'blocked');});
test('gate_rejects_forged_receipt_with_missing_test_command',()=>{const index=validIndex();index.A1=makeReceipt('A1',{testCommand:''});assert.equal(verifyReadyV1({graph:aGateGraph(),nodeId:'A_GATE',receiptIndex:index,contractSealSha256:SEAL_SHA}).verdict,'blocked');});
test('gate_rejects_forged_conditional_receipt_that_matches_condition',()=>{
 const graph={schemaVersion:'ranking_v3_task_graph_v1',planSha256:PLAN_SHA,taskGraphSha256:GRAPH_SHA,nodes:[{taskId:'G',taskKind:'gate'},{taskId:'E3',taskKind:'static'}],hardEdges:[],conditionalEdges:[{taskId:'G',requires:'E3',kind:'receipt_outcome',receiptType:'E3TestReceiptV1',condition:{field:'outcome',equals:'x'}}]};
 const forged={schemaVersion:'ranking_v3_task_receipt_v1',taskId:'WRONG_TASK',outcome:'x',sha256:ZERO64};
 assert.equal(verifyReadyV1({graph,nodeId:'G',receiptIndex:{E3:forged},contractSealSha256:SEAL_SHA}).verdict,'blocked');
});
test('gate_with_missing_receipt_is_blocked',()=>{const index=validIndex();delete index.A1;assert.equal(verifyReadyV1({graph:aGateGraph(),nodeId:'A_GATE',receiptIndex:index,contractSealSha256:SEAL_SHA}).verdict,'blocked');});
test('gate_with_valid_receipts_is_ready_and_binds_index',()=>{
 const index=validIndex();
 const out=verifyReadyV1({graph:aGateGraph(),nodeId:'A_GATE',receiptIndex:index,contractSealSha256:SEAL_SHA});
 assert.equal(out.verdict,'ready');
 assert.equal(out.resolvedConditions.length,A_TASKS.length);
 for(const resolved of out.resolvedConditions)assert.equal(resolved.authoritySha256,index[resolved.requires].sha256);
 assert.equal(out.prerequisiteReceiptIndexSha256,digest(index));
});
test('canonical_task_graph_digest_matches_committed_graph_self_digest',()=>{
 const graph=JSON.parse(fs.readFileSync(path.join(ROOT,'evals/search-ranking/ranking-v3-authorities/TASK_GRAPH.json'),'utf8'));
 assert.equal(canonicalTaskGraphDigest(graph),GRAPH_SHA);
 assert.equal(canonicalTaskGraphDigest(graph),graph.taskGraphSha256);
});
test('canonical_task_graph_digest_differs_from_raw_file_bytes_representation',()=>{
 const bytes=fs.readFileSync(path.join(ROOT,'evals/search-ranking/ranking-v3-authorities/TASK_GRAPH.json'));
 const graph=JSON.parse(bytes.toString('utf8'));
 assert.notEqual(canonicalTaskGraphDigest(graph),digest(bytes));
});
test('gate_rejects_receipt_bound_to_file_bytes_task_graph_digest',()=>{
 const graphPath=path.join(ROOT,'evals/search-ranking/ranking-v3-authorities/TASK_GRAPH.json');
 const fileBytesDigest=digest(fs.readFileSync(graphPath));
 assert.notEqual(fileBytesDigest,GRAPH_SHA);
 const index=validIndex(); index.A1=makeReceipt('A1',{taskGraphSha256:fileBytesDigest});
 assert.equal(verifyReadyV1({graph:aGateGraph(),nodeId:'A_GATE',receiptIndex:index,contractSealSha256:SEAL_SHA}).verdict,'blocked');
});
