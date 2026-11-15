import test from 'node:test';
import assert from 'node:assert/strict';
import {previewThresholdTargets} from './verifiedWorkoutTargets.ts';
const values={ftpWatts:300,swimCssSecondsPer100m:90,runThresholdSecondsPerKm:240};
test('withholds numerical targets from self-reported thresholds',()=>{
 for(const sport of ['bike','swim','run']){
  const r=previewThresholdTargets(sport,{values,coachValidated:false,validatedAt:null});
  assert.equal(r.status,'requires_validation');
  assert.deepEqual(r.targets,[]);
 }
});
test('missing threshold never gets a fabricated number',()=>{
 const r=previewThresholdTargets('bike',{values:{...values,ftpWatts:null},coachValidated:true,validatedAt:'2026-11-15T10:00:00Z'});
 assert.equal(r.status,'missing_threshold');
 assert.deepEqual(r.targets,[]);
});
test('coach validation with timestamp permits only illustrative references',()=>{
 const r=previewThresholdTargets('bike',{values,coachValidated:true,validatedAt:'2026-11-15T10:00:00Z'});
 assert.equal(r.status,'ready_for_coach_review');
 assert.match(r.targets[0],/180–225 W/);
 assert.equal(r.readOnly,true);
});
test('approval flag without validation timestamp still withholds targets',()=>{
 const r=previewThresholdTargets('swim',{values,coachValidated:true,validatedAt:null});
 assert.equal(r.status,'requires_validation');
 assert.deepEqual(r.targets,[]);
});
