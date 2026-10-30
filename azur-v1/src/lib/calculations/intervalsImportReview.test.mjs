import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewIntervalsActivity} from '../intervalsImportReview.mjs';
const ride={id:'zwift-29',type:'VirtualRide',start_date_local:'2026-10-29T06:49:22',start_date:'2026-10-29T06:49:22Z',elapsed_time:4026,distance:41840};
const plan={id:'session-1',sport:'bike',status:'planned',is_active_version:true,planned_date:'2026-10-29',title:'VO2 Into Tempo',duration_min:70};
test('single planned bike remains candidate, never imported or load eligible',()=>{
 const x=reviewIntervalsActivity(ride,[],[plan]);assert.equal(x.status,'candidate_match');assert.equal(x.proposedPlannedSessionId,'session-1');assert.equal(x.safeToAutoImport,false);assert.equal(x.trainingLoadEligible,false);
});
test('same source ID blocks proposed matching',()=>{
 const x=reviewIntervalsActivity(ride,[{source:'intervals',source_activity_id:'zwift-29'}],[plan]);assert.equal(x.status,'already_imported');assert.equal(x.proposedPlannedSessionId,null);
});
test('Garmin cross-source equivalent is flagged conservatively',()=>{
 const x=reviewIntervalsActivity(ride,[{source:'garmin',source_activity_id:'other-id',sport:'bike',start_time:'2026-10-29T06:51:00Z',duration_sec:4030,distance_m:41830}],[plan]);assert.equal(x.status,'possible_duplicate');assert.equal(x.safeToAutoImport,false);assert.equal(x.proposedPlannedSessionId,null);
});
test('different rides outside time window are not classified duplicates',()=>{
 const x=reviewIntervalsActivity(ride,[{source:'garmin',sport:'bike',start_time:'2026-10-29T12:00:00Z',duration_sec:4030,distance_m:41830}],[plan]);assert.equal(x.status,'candidate_match');
});
test('two planned rides cannot be automatically matched',()=>{
 const x=reviewIntervalsActivity(ride,[],[plan,{...plan,id:'session-2'}]);assert.equal(x.status,'ambiguous_session');assert.equal(x.proposedPlannedSessionId,null);
});
test('invalid time and missing id cannot auto-import',()=>{
 const x=reviewIntervalsActivity({...ride,id:null,start_date:'',start_date_local:'',elapsed_time:0},[],[plan]);assert.equal(x.status,'invalid_activity');assert.equal(x.safeToAutoImport,false);
});
test('completed or inactive plans are never offered',()=>{
 const x=reviewIntervalsActivity(ride,[],[{...plan,status:'completed'},{...plan,id:'other',is_active_version:false}]);assert.equal(x.status,'unmatched_activity');
});

test('invalid ride cannot propose a plan even when calendar day matches',()=>{
 const x=reviewIntervalsActivity({...ride,id:null,elapsed_time:0},[],[plan]);
 assert.equal(x.status,'invalid_activity');
 assert.equal(x.proposedPlannedSessionId,null);
 assert.equal(x.trainingLoadEligible,false);
});
