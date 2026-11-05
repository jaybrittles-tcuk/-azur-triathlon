import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestStoredActivityMatch } from './storedActivityMatching.mjs';
const activity = {id:'activity-1', athlete_id:'athlete-1', source:'intervals', source_activity_id:'i123', sport:'bike', start_time:'2026-11-05T10:00:00Z', duration_sec:3600, raw_payload:{start_date_local:'2026-11-05T10:00:00'}};
const plan = {id:'plan-1', athlete_id:'athlete-1', sport:'bike', planned_date:'2026-11-05', duration_min:60, is_active_version:true, locked:false, status:'planned'};
test('one candidate is only a suggestion and never completion or load validation',()=>{
 const result=suggestStoredActivityMatch(activity,[plan]);
 assert.equal(result.status,'candidate_match');
 assert.equal(result.candidateId,'plan-1');
 assert.equal(result.sessionCompleted,false);
 assert.equal(result.trainingLoadEligible,false);
 assert.equal(result.requiresConfirmation,true);
});
test('different athlete cannot match',()=>assert.equal(suggestStoredActivityMatch(activity,[{...plan,athlete_id:'athlete-2'}]).status,'unmatched_activity'));
test('multiple possible plans require review',()=>assert.equal(suggestStoredActivityMatch(activity,[plan,{...plan,id:'plan-2'}]).status,'ambiguous_session'));
test('existing linked activity blocks second match',()=>assert.equal(suggestStoredActivityMatch(activity,[plan],[{id:'other',planned_session_id:'plan-1'}]).status,'unmatched_activity'));
test('duplicate source requires review',()=>assert.equal(suggestStoredActivityMatch(activity,[plan],[{id:'other',source:'intervals',source_activity_id:'i123'}]).status,'duplicate_source'));
test('completed and locked plans cannot match',()=>{
 assert.equal(suggestStoredActivityMatch(activity,[{...plan,status:'completed'}]).status,'unmatched_activity');
 assert.equal(suggestStoredActivityMatch(activity,[{...plan,locked:true}]).status,'unmatched_activity');
});
test('local training date takes precedence over UTC date',()=>{
 const overnight={...activity,start_time:'2026-11-04T23:30:00Z'};
 assert.equal(suggestStoredActivityMatch(overnight,[plan]).status,'candidate_match');
});
test('already linked activity never rematches',()=>assert.equal(suggestStoredActivityMatch({...activity,planned_session_id:'plan-1'},[plan]).status,'already_linked'));
