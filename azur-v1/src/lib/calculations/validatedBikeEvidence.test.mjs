import test from 'node:test';
import assert from 'node:assert/strict';
import {assessBikeEvidence} from './validatedBikeEvidence.ts';
const now=new Date('2026-11-03T15:00:00Z');
const athlete='staging-athlete';
const ride=(id,day,stress,ftp=250,normalizedPower=200,overrides={})=>({
 activity_id:id,athlete_id:athlete,planned_session_id:null,
 source:'intervals',start_time:day,processed_metrics:{
  load_status:'validated',load_validation_version:1,training_stress:stress,
  intensity_factor:normalizedPower/ftp,ftp_w_at_validation:ftp,normalized_power:normalizedPower
 },...overrides
});
test('real staging-like validated Intervals bike provides context but not a trend',()=>{
 const d=assessBikeEvidence(athlete,[ride('ride1','2026-10-29T06:49:22Z',98,250,234)],now);
 assert.equal(d.count,1);assert.equal(d.latest_stress,98);
 assert.equal(d.ftp_at_validation,250);assert.equal(d.load_spike_review,false);
 assert.match(d.notes.join(' '),/Too few validated rides/);
});
test('pending and rejected rides or test fixtures cannot enter comparisons',()=>{
 const base=ride('x','2026-11-03T08:00:00Z',120);
 for(const processed of [{load_status:'pending_validation'},{load_status:'rejected'},{is_test:true},{test_fixture:true}]){
  const p={...base,processed_metrics:{...base.processed_metrics,...processed}};
  assert.equal(assessBikeEvidence(athlete,[p],now).count,0);
 }
});
test('saved FTP snapshot must be coherent with validated intensity factor',()=>{
 const p=ride('x','2026-11-02T08:00:00Z',90);
 p.processed_metrics.intensity_factor=0.4;
 assert.equal(assessBikeEvidence(athlete,[p],now).count,0);
});
test('with three validated rides large stress increase prompts review but no injury assertion',()=>{
 const d=assessBikeEvidence(athlete,[
  ride('r1','2026-11-03T07:00:00Z',170),
  ride('r2','2026-11-01T07:00:00Z',55),
  ride('r3','2026-10-30T07:00:00Z',60)
 ],now);
 assert.equal(d.count,3);assert.equal(d.prior_median_stress,57.5);
 assert.equal(d.load_spike_review,true);
 assert.doesNotMatch(d.notes.join(' '),/injur/i);
});
test('small changes in training stress do not produce a high-priority signal',()=>{
 const d=assessBikeEvidence(athlete,[
  ride('r1','2026-11-03T07:00:00Z',90),
  ride('r2','2026-11-01T07:00:00Z',65),
  ride('r3','2026-10-30T07:00:00Z',70)
 ],now);
 assert.equal(d.load_spike_review,false);
});
test('duplicate activities and different athletes do not inflate evidence',()=>{
 const x=ride('r1','2026-11-03T07:00:00Z',120);
 const d=assessBikeEvidence(athlete,[x,x,{...x,activity_id:'other',athlete_id:'someone-else'}],now);
 assert.equal(d.count,1);
});
test('old activities outside 21 days do not create recent trend',()=>{
 const d=assessBikeEvidence(athlete,[ride('r1','2026-08-10T07:00:00Z',140)],now);
 assert.equal(d.count,0);
});
