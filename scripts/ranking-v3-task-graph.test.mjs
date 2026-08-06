import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildTaskGraphDeclarationV1, activeConditionalPredecessors, validateTaskGraphDeclarationV1 } from './ranking-v3-task-graph.mjs';
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
