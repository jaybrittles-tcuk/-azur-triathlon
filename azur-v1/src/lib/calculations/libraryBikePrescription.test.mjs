import test from 'node:test';
import assert from 'node:assert/strict';
import { previewApprovedBikeWorkout } from './bikeDraftPreview.ts';
import { createLibraryBikePrescription } from './libraryBikePrescription.ts';
import { normalizeWorkoutIntervals } from './workoutIntensity.ts';

const selected={id:'BIKE-THR-001',sport:'bike',approved:true};
test('preserves library ID, version, exact FTP ranges and interval durations across save/reload',()=>{
  const draft=previewApprovedBikeWorkout(selected,303);
  assert.ok(draft);
  const prescription=createLibraryBikePrescription(draft,303);
  const reloaded=JSON.parse(JSON.stringify(prescription));
  assert.equal(reloaded.workoutId,'BIKE-THR-001');
  assert.equal(reloaded.workoutVersion,1);
  assert.equal(reloaded.ftpAtPrescription,303);
  const intervals=normalizeWorkoutIntervals(reloaded.azurWorkout.steps);
  assert.equal(intervals.length,7);
  assert.equal(intervals.reduce((s,i)=>s+i.durationSec,0)/60,draft.durationMin);
  assert.deepEqual(intervals.filter(i=>i.kind==='work').map(i=>[i.target.low,i.target.high]),[[95,100],[95,100],[95,100]]);
  assert.equal(intervals.filter(i=>i.kind==='recovery').length,2);
});
test('rejects modified duration rather than silently saving an inconsistent workout',()=>{
  const draft=previewApprovedBikeWorkout(selected,300);
  assert.throws(()=>createLibraryBikePrescription({...draft,durationMin:120},300));
});
