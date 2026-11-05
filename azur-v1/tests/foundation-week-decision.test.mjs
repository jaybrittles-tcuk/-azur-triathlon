import test from 'node:test';
import assert from 'node:assert/strict';
import {assessFoundationWeek} from '../src/lib/foundationWeekDecision.mjs';
test('flags 16-hour history against eight-hour target without changing sessions',()=>{
 const sessions=[{duration_min:120,status:'planned',locked:false},{duration_min:120,status:'planned',locked:false},{duration_min:45,status:'planned',locked:false},{duration_min:45,status:'planned',locked:false},{duration_min:45,status:'planned',locked:false},{duration_min:45,status:'planned',locked:false}];
 const original=JSON.stringify(sessions);
 const result=assessFoundationWeek({targetMinutes:480,sessions,recentHours:16,concern:'none'});
 assert.equal(result.scheduledMinutes,420);
 assert.equal(result.gapMinutes,60);
 assert.ok(result.flags.includes('history_target_mismatch'));
 assert.equal(result.canAutoPublish,false);
 assert.equal(JSON.stringify(sessions),original);
});
test('unverified data never permits automatic publication',()=>{
 const result=assessFoundationWeek({targetMinutes:420,sessions:[{duration_min:420,status:'planned',locked:false}],recentHours:7,concern:'none'});
 assert.equal(result.canAutoPublish,false);
 assert.ok(result.flags.includes('recovery_unverified'));
});
test('progressed sessions and injury concerns trigger review',()=>{
 const result=assessFoundationWeek({targetMinutes:60,sessions:[{duration_min:60,status:'completed',locked:true}],concern:'injury'});
 assert.ok(result.flags.includes('locked_or_progressed_sessions'));
 assert.ok(result.flags.includes('training_concern_requires_review'));
});
