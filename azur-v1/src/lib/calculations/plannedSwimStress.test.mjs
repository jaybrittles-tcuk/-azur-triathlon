import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatePlannedSwimStress } from './plannedSwimStress.ts';

const session = (steps) => ({azurWorkout:{steps}});
const swim = (minutes,pace) => ({type:'work',durationMin:minutes,targetType:'swim_pace',targetLow:pace,targetHigh:pace});

test('sixty minutes at CSS gives 100 proxy points', () => {
 assert.deepEqual(estimatePlannedSwimStress(session([swim(60,100)]),100),
  {status:'estimated',points:100,method:'css_pace_duration_proxy'});
});
test('easy swimming produces lower relative workload', () => {
 assert.deepEqual(estimatePlannedSwimStress(session([swim(60,125)]),100),
  {status:'estimated',points:64,method:'css_pace_duration_proxy'});
});
test('repeats include prescribed active recoveries', () => {
 const result=estimatePlannedSwimStress(session([{type:'repeat',reps:2,
  work:swim(10,100),
  recovery:{type:'recovery',durationMin:5,targetType:'swim_pace',targetLow:200,targetHigh:200}
 }]),100);
 assert.deepEqual(result,{status:'estimated',points:35.4,method:'css_pace_duration_proxy'});
});
test('missing CSS cannot be scored', () => {
 assert.equal(estimatePlannedSwimStress(session([swim(40,100)]),null).status,'unavailable');
});
test('distance-only intervals cannot be scored without time', () => {
 assert.equal(estimatePlannedSwimStress(session([{type:'work',distanceM:400,targetType:'swim_pace',targetLow:100,targetHigh:100}]),100).status,'unavailable');
});
test('untargeted passive recovery cannot be guessed', () => {
 const x=estimatePlannedSwimStress(session([{type:'repeat',reps:2,work:swim(10,100),recovery:{type:'recovery',durationMin:2}}]),100);
 assert.equal(x.status,'unavailable');
});
test('running pace must not be treated as swim pace', () => {
 assert.equal(estimatePlannedSwimStress(session([{type:'work',durationMin:30,targetType:'pace',targetLow:240,targetHigh:240}]),100).status,'unavailable');
});
