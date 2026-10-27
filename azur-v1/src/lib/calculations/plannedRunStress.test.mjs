import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatePlannedRunStress } from './plannedRunStress.ts';

const session = (steps) => ({azurWorkout:{steps}});
const paceStep = (minutes, pace) => ({type:'work',durationMin:minutes,targetType:'pace',targetLow:pace,targetHigh:pace});

test('threshold pace for sixty minutes returns 100 proxy points', () => {
 assert.deepEqual(estimatePlannedRunStress(session([paceStep(60,240)]),240),
  {status:'estimated',points:100,method:'threshold_pace_duration_proxy'});
});
test('easy relative pace is lower stress for equal duration', () => {
 const easy=estimatePlannedRunStress(session([paceStep(60,300)]),240);
 assert.deepEqual(easy,{status:'estimated',points:64,method:'threshold_pace_duration_proxy'});
});
test('repeated efforts include recovery with explicit pace', () => {
 const x=estimatePlannedRunStress(session([{type:'repeat',reps:2,work:paceStep(10,240),recovery:{type:'recovery',durationMin:5,targetType:'pace',targetLow:360,targetHigh:360}}]),240);
 assert.equal(x.status,'estimated');
 assert.equal(x.points,37);
});
test('no athlete threshold gives unavailable, not a fabricated score', () => {
 assert.equal(estimatePlannedRunStress(session([paceStep(45,250)]),null).status,'unavailable');
});
test('unprescribed recovery prevents scoring', () => {
 const x=estimatePlannedRunStress(session([{type:'repeat',reps:2,work:paceStep(10,240),recovery:{type:'recovery',durationMin:5}}]),240);
 assert.equal(x.status,'unavailable');
});
test('swim pace cannot be interpreted as running pace', () => {
 const x=estimatePlannedRunStress(session([{type:'work',durationMin:45,targetType:'swim_pace',targetLow:95,targetHigh:95}]),240);
 assert.equal(x.status,'unavailable');
});
