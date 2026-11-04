import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeIntervalDetail} from '../intervalDetailPreview.mjs';
const activityId='i123';
const interval=(start,end,type='WORK')=>({
 type,start_time:start,end_time:end,elapsed_time:end-start,
 average_watts:type==='WORK'?204:100,average_heartrate:140
});
const detail=(intervals=[interval(0,900),interval(900,1140,'RECOVERY'),interval(1140,2040)])=>({id:activityId,icu_intervals:intervals});
test('read-only provider intervals preserve measured watts and type without claiming compliance',()=>{
 const r=summarizeIntervalDetail(detail(),activityId);
 assert.equal(r.status,'provider_intervals_available');assert.equal(r.interval_count,3);
 assert.equal(r.work_intervals,2);assert.equal(r.execution_verifiable,false);
 assert.equal(r.intervals[0].average_power_w,204);
});
test('reject unrelated upstream activity id',()=>assert.equal(summarizeIntervalDetail(detail(),'i999').status,'unavailable'));
test('missing interval data cannot imply execution',()=>assert.equal(summarizeIntervalDetail({id:activityId},activityId).status,'unavailable'));
test('overlapping, reversed and implausible intervals are rejected',()=>{
 for(const items of [[interval(0,900),interval(850,1000)], [interval(900,700)], [{...interval(0,900),average_watts:Infinity}]]) {
  assert.equal(summarizeIntervalDetail(detail(items),activityId).status,'unavailable');
 }
});
test('reject implausibly long interval arrays',()=>assert.equal(summarizeIntervalDetail(detail(Array.from({length:301},(_,i)=>interval(i*60,(i+1)*60))),activityId).status,'unavailable'));
test('no interval type guessing',()=>assert.equal(summarizeIntervalDetail(detail([interval(0,900,'WARMUP')]),activityId).status,'unavailable'));
