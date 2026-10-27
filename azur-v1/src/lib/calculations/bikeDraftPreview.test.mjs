import test from 'node:test';
import assert from 'node:assert/strict';
import { allBikeWorkouts } from '../../domain/bikeWorkoutCatalog.ts';
import { previewApprovedBikeWorkout } from './bikeDraftPreview.ts';

const workout=allBikeWorkouts.find(w=>w.id==='BIKE-THR-001');
const selected={id:workout.id,sport:'bike',approved:true};
test('approved threshold workout resolves watts from athlete FTP',()=>{
 const draft=previewApprovedBikeWorkout(selected,300);
 assert.equal(draft.workoutId,'BIKE-THR-001');
 assert.deepEqual(draft.steps[1].work.powerWatts,[285,300]);
});
test('unapproved entries cannot generate drafts',()=>{
 assert.equal(previewApprovedBikeWorkout({...selected,approved:false},300),null);
});
test('invalid FTP is rejected',()=>{
 assert.equal(previewApprovedBikeWorkout(selected,0),null);
});
test('unknown workout cannot be previewed',()=>{
 assert.equal(previewApprovedBikeWorkout({...selected,id:'unknown'},300),null);
});
