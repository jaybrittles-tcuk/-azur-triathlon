import test from 'node:test';
import assert from 'node:assert/strict';
import {previewPersonalisedSteps} from './personalisedWorkoutSteps.ts';
const base={id:'bike1',sport:'bike',family:'aerobic_endurance',title:'Ride',durationMin:60,level:1,phases:['base'],approved:true};
const verified={values:{ftpWatts:300,swimCssSecondsPer100m:90,runThresholdSecondsPerKm:240},coachValidated:true,validatedAt:'2026-11-15T10:00:00Z'};
test('converts explicit coach-authored FTP range only after validation',()=>{
 const s={...base,prescription:{steps:[{target:'65-75% FTP'},{target:'easy RPE 3'}]}};
 const r=previewPersonalisedSteps(s,verified);
 assert.equal(r.steps[0].calculated,'195–225 W (65–75% FTP)');
 assert.equal(r.steps[1].calculated,null);
 assert.equal(s.prescription.steps[0].target,'65-75% FTP');
});
test('unvalidated thresholds cannot produce numeric targets',()=>{
 const s={...base,prescription:{steps:[{target:'65-75% FTP'}]}};
 const r=previewPersonalisedSteps(s,{...verified,coachValidated:false});
 assert.equal(r.steps[0].calculated,null);
 assert.equal(r.steps[0].status,'unverified');
});
test('converts explicit CSS offset while preserving pool structure',()=>{
 const s={...base,sport:'swim',prescription:{poolSegments:[{target:'CSS +8-15s/100m'}]}};
 const r=previewPersonalisedSteps(s,verified);
 assert.equal(r.steps[0].calculated,'1:38–1:45/100 m (CSS +8–15 s)');
});
test('rejects unsafe percentages and missing validated threshold',()=>{
 const s={...base,prescription:{steps:[{target:'130-180% FTP'}]}};
 assert.equal(previewPersonalisedSteps(s,verified).steps[0].calculated,null);
 assert.equal(previewPersonalisedSteps({...s,prescription:{steps:[{target:'65% FTP'}]}},{...verified,values:{...verified.values,ftpWatts:null}}).steps[0].calculated,null);
});

test('exact CSS pace gets a validated reference, never a silent workout rewrite',()=>{
 const s={...base,sport:'swim',prescription:{poolSegments:[{target:'CSS pace, controlled stroke count'}]}};
 const r=previewPersonalisedSteps(s,verified);
 assert.match(r.steps[0].calculated,/1:30\/100 m/);
 assert.equal(previewPersonalisedSteps(s,{...verified,coachValidated:false}).steps[0].calculated,null);
 assert.equal(s.prescription.poolSegments[0].target,'CSS pace, controlled stroke count');
});
