import test from 'node:test';
import assert from 'node:assert/strict';
import {foundationSessionCandidate} from '../src/lib/foundationSessionCandidate.mjs';
test('Foundation structure exactly matches duration for all three sports',()=>{
 for(const sport of ['swim','bike','run'])for(const duration_min of [30,45,60,120]){
  const result=foundationSessionCandidate({sport,duration_min});
  assert.equal(result.status,'coach_review_required');
  assert.equal(result.blocks.reduce((sum,block)=>sum+block.minutes,0),duration_min);
  assert.ok(result.blocks.every(block=>block.minutes>0));
  assert.ok(result.safeguards.some(x=>x.includes('Coach approval')));
 }
});
test('Invalid sessions do not receive fabricated prescriptions',()=>{
 assert.equal(foundationSessionCandidate({sport:'run',duration_min:0}).status,'needs_coach_design');
 assert.equal(foundationSessionCandidate({sport:'unknown',duration_min:60}).status,'needs_coach_design');
});
