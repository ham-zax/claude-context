import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseOwnerTargetDecisionV1, writeQualificationTargetV1, verifyQualificationTargetV1 } from './ranking-qualification-target.mjs';

test('writes_canonical_target_only_from_owner_target_decision_v1', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ranking-target-'));
  const out=path.join(dir,'QUALIFICATION_TARGET.json');
  const decision={schemaVersion:'ranking_v3_owner_target_decision_v1',providerTarget:'none',serviceClass:'online',decidedBy:'owner',decidedAt:'2026-08-06T00:00:00.000Z'};
  assert.deepEqual(parseOwnerTargetDecisionV1(decision),decision);
  const receipt=writeQualificationTargetV1({decision,out});
  assert.deepEqual(JSON.parse(fs.readFileSync(out,'utf8')),{providerTarget:'none',serviceClass:'online'});
  assert.equal(verifyQualificationTargetV1(out).targetSha256,receipt.targetSha256);
  assert.throws(()=>parseOwnerTargetDecisionV1({...decision,unknown:true}),/exact keys/i);
  fs.rmSync(`${out}.receipt.json`);
  assert.throws(()=>verifyQualificationTargetV1(out),/receipt/i);
});
