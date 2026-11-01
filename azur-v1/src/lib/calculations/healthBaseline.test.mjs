import test from 'node:test';
import assert from 'node:assert/strict';
import {assessHealthBaseline} from './healthBaseline.ts';
const asOf='2026-11-01';
const make=(count=28)=>Array.from({length:count},(_,i)=>({
 date:new Date(Date.parse(asOf+'T00:00:00Z')-(count-i)*86400000).toISOString().slice(0,10),
 metric:'resting_hr', value:50,source:'garmin'
}));
test('does not expose metric without explicit consent',()=>{
 const result=assessHealthBaseline(make(),'resting_hr',asOf,{consented:false});
 assert.equal(result.status,'unavailable'); assert.equal(result.baseline,null);
});
test('28-day history gives personal baseline, excluding current value',()=>{
 const result=assessHealthBaseline([...make(),{date:asOf,metric:'resting_hr',value:58,source:'garmin'}],
 'resting_hr',asOf,{consented:true});
 assert.equal(result.status,'established');assert.equal(result.baseline,50);
 assert.equal(result.current,58);assert.equal(result.delta,8);assert.equal(result.direction,'above');
});
test('partial history remains limited rather than assumed normal',()=>{
 const r=assessHealthBaseline(make(3),'resting_hr',asOf,{consented:true});
 assert.equal(r.status,'limited');assert.equal(r.sampleCount,3);
});
test('missing observations and duplicate provider days are handled explicitly',()=>{
 const r=assessHealthBaseline([],'hrv',asOf,{consented:true});
 assert.equal(r.status,'unavailable');
 assert.throws(()=>assessHealthBaseline([...make(),make()[0]],'resting_hr',asOf,{consented:true}),/Duplicate/);
});
test('rejects impossible measurements and invalid dates',()=>{
 assert.throws(()=>assessHealthBaseline([{date:asOf,metric:'resting_hr',value:900,source:'garmin'}],
 'resting_hr',asOf,{consented:true}),/Invalid health observation/);
 assert.throws(()=>assessHealthBaseline([],'hrv','2026-02-30',{consented:true}),/Invalid assessment date/);
});
