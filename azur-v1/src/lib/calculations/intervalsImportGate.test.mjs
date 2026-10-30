import test from 'node:test';
import assert from 'node:assert/strict';
import {assessIntervalsImportGate} from '../intervalsImportGate.mjs';
const activity={id:'zwift-29'};
const review={sourceId:'zwift-29',status:'candidate_match',proposedPlannedSessionId:'planned-1',safeToAutoImport:false,trainingLoadEligible:false,alreadyImported:false,possibleCrossPlatformDuplicate:false,possibleDuplicateCount:0};
const approval={kind:'explicit_athlete_confirmation',sourceId:'zwift-29',plannedSessionId:'planned-1'};
test('confirmed candidate only permits a fresh transactional recheck, not completion',()=>{
 const r=assessIntervalsImportGate(review,approval,activity);
 assert.equal(r.allowed,true);assert.equal(r.awardTrainingLoad,false);assert.equal(r.markSessionComplete,false);
});
test('no user confirmation is refused',()=>assert.equal(assessIntervalsImportGate(review,null,activity).allowed,false));
test('replay with another source id refused',()=>assert.equal(assessIntervalsImportGate(review,{...approval,sourceId:'other'},activity).allowed,false));
test('cross-platform duplicate refused',()=>assert.equal(assessIntervalsImportGate({...review,possibleCrossPlatformDuplicate:true},approval,activity).allowed,false));
test('existing same-source ride refused',()=>assert.equal(assessIntervalsImportGate({...review,alreadyImported:true},approval,activity).allowed,false));
test('ambiguous planned session refused',()=>assert.equal(assessIntervalsImportGate({...review,status:'ambiguous_session'},approval,activity).allowed,false));
test('wrong planned session refused',()=>assert.equal(assessIntervalsImportGate(review,{...approval,plannedSessionId:'wrong'},activity).allowed,false));
test('unmatched ride may only proceed without a plan link',()=>{
 const r={...review,status:'unmatched_activity',proposedPlannedSessionId:null};
 assert.equal(assessIntervalsImportGate(r,{...approval,plannedSessionId:null},activity).allowed,true);
 assert.equal(assessIntervalsImportGate(r,approval,activity).allowed,false);
});
test('review contract cannot prematurely enable training load',()=>assert.equal(assessIntervalsImportGate({...review,trainingLoadEligible:true},approval,activity).allowed,false));
