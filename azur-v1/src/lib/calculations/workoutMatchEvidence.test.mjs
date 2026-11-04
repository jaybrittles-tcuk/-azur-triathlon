import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeWorkoutMatch} from './workoutMatchEvidence.ts';
const a=(patch={})=>({id:'ride1',athlete_id:'athlete1',sport:'bike',source:'intervals',start_time:'2026-11-03T12:00:00Z',duration_sec:4500,planned_session_id:null,processed_metrics:{load_status:'validated'},...patch});
const p=(patch={})=>({id:'planned1',athlete_id:'athlete1',sport:'bike',planned_date:'2026-11-03',duration_min:75,title:'Controlled Tempo Ride',...patch});
test('same day verified import is only a candidate, never completion or automatic link',()=>{
 const x=proposeWorkoutMatch(a(),[p()]);assert.equal(x.status,'candidate_review');assert.equal(x.confidence,'moderate');
});
test('different athlete and sport cannot match',()=>{
 assert.equal(proposeWorkoutMatch(a(),[p({athlete_id:'another'})]).status,'unmatched');
 assert.equal(proposeWorkoutMatch(a(),[p({sport:'run'})]).status,'unmatched');
});
test('two same-sport sessions are ambiguous',()=>{
 assert.equal(proposeWorkoutMatch(a(),[p(),p({id:'planned2'})]).status,'ambiguous');
});
test('large duration difference declines association',()=>{
 assert.equal(proposeWorkoutMatch(a({duration_sec:1800}),[p()]).status,'unmatched');
});
test('rejected, pending and test device imports are excluded',()=>{
 for(const status of ['pending_validation','rejected'])
  assert.equal(proposeWorkoutMatch(a({processed_metrics:{load_status:status}}),[p()]).status,'excluded');
 assert.equal(proposeWorkoutMatch(a({processed_metrics:{is_test:true}}),[p()]).status,'excluded');
 assert.equal(proposeWorkoutMatch(a({source:'manual'}),[p()]).status,'excluded');
});
test('existing activity link is not blindly trusted and never relinked',()=>{
 assert.equal(proposeWorkoutMatch(a({planned_session_id:'nonexistent'}),[p()]).status,'unmatched');
 assert.equal(proposeWorkoutMatch(a({planned_session_id:'planned1'}),[p()]).status,'linked');
});
test('unlinked October ride does not match a November planned week',()=>{
 assert.equal(proposeWorkoutMatch(a({start_time:'2026-10-29T06:49:22Z',duration_sec:4026}),[p()]).status,'unmatched');
});
