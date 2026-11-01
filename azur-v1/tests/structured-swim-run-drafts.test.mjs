import test from 'node:test';
import assert from 'node:assert/strict';
import { structuredSwimRunDrafts, validateStructuredDraft, structuredWorkoutSeconds, approvedStructuredSwimRunSelections } from '../src/lib/calculations/structuredSwimRunDrafts.ts';

test('all draft workouts have explicit interval structure and positive total duration',()=>{
 assert.ok(structuredSwimRunDrafts.length>=8);
 for(const workout of structuredSwimRunDrafts){
  assert.deepEqual(validateStructuredDraft(workout),[],workout.id);
  assert.ok(structuredWorkoutSeconds(workout)>=1200,workout.id);
  assert.equal(workout.approval,'coach_review_required');
 }
});
test('interval workouts include explicit recovery and target definitions',()=>{
 for(const id of ['swim-css-v1','run-threshold-v1']){
  const workout=structuredSwimRunDrafts.find(x=>x.id===id);
  assert.ok(workout);
  assert.ok(workout.steps.some(s=>s.repeats>1&&s.recoverySeconds>0));
  assert.ok(workout.steps.every(s=>s.target.min>0));
 }
});
test('structured drafts are never automatically approved or published',()=>assert.equal(approvedStructuredSwimRunSelections.length,0));
test('invalid repetitions or missing prescriptions fail validation',()=>{
 const bad={...structuredSwimRunDrafts[0],steps:[{...structuredSwimRunDrafts[0].steps[0],repeats:0,instruction:''}]};
 assert.ok(validateStructuredDraft(bad).length>=2);
});
