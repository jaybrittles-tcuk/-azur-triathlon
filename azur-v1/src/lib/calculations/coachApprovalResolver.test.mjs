import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCurrentBikeApprovals } from './coachApprovalResolver.ts';
import { allBikeWorkouts } from '../../domain/bikeWorkoutCatalog.ts';

const workout=allBikeWorkouts[0];
const event=(id,decision,version=workout.version)=>({
 id,workout_id:workout.id,workout_version:version,decision,
 level:1,phases:['base'],decided_at: id==='later'?'2026-10-28T00:00:00Z':'2026-10-27T00:00:00Z'
});
test('no stored approval means no selectable workouts',()=>{
 assert.deepEqual(resolveCurrentBikeApprovals([]),[]);
});
test('latest approval enables the exact matching library version',()=>{
 assert.equal(resolveCurrentBikeApprovals([event('earlier','approved')]).length,1);
});
test('newer revocation overrides previous approval',()=>{
 assert.equal(resolveCurrentBikeApprovals([event('earlier','approved'),event('later','revoked')]).length,0);
});
test('stale workout version requires reapproval',()=>{
 assert.equal(resolveCurrentBikeApprovals([event('earlier','approved',workout.version+1)]).length,0);
});
test('unknown workout never becomes selectable',()=>{
 assert.equal(resolveCurrentBikeApprovals([{...event('earlier','approved'),workout_id:'NOT-IN-LIBRARY'}]).length,0);
});
