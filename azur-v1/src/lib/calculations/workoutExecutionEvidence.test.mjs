import test from 'node:test';
import assert from 'node:assert/strict';
import {assessWorkoutExecution} from './workoutExecutionEvidence.ts';
const expected=()=>({
 same_athlete:true,confirmed_plan_link:true,import_status:'validated',source:'intervals',
 ftp_at_activity_w:250,series_provenance:'verified_device_intervals',
 planned:[
  {kind:'warmup',duration_sec:900},
  {kind:'work',duration_sec:1080,target_low_pct_ftp:78,target_high_pct_ftp:85},
  {kind:'recovery',duration_sec:240},
  {kind:'work',duration_sec:1080,target_low_pct_ftp:78,target_high_pct_ftp:85},
  {kind:'cooldown',duration_sec:1200}
 ],
 recorded:[
  {kind:'warmup',duration_sec:900,average_power_w:140},
  {kind:'work',duration_sec:1080,average_power_w:205},
  {kind:'recovery',duration_sec:240,average_power_w:100},
  {kind:'work',duration_sec:1080,average_power_w:220},
  {kind:'cooldown',duration_sec:1200,average_power_w:135}
 ]
});
test('two structured verified work intervals compared using contemporaneous FTP',()=>{
 const result=assessWorkoutExecution(expected());
 assert.equal(result.status,'verified_interval_comparison');
 assert.equal(result.in_range_work_intervals,1);
 assert.equal(result.total_work_intervals,2);
 assert.match(result.observation,/not a whole-session compliance/);
});
test('summary-only validated ride cannot claim interval compliance',()=>{
 const x=expected();x.series_provenance='summary_only';x.recorded=null;
 assert.equal(assessWorkoutExecution(x).status,'not_verifiable');
});
test('unlinked or cross-athlete imports cannot be assessed',()=>{
 for(const patch of [{confirmed_plan_link:false},{same_athlete:false}])
  assert.equal(assessWorkoutExecution({...expected(),...patch}).status,'not_verifiable');
});
test('pending and rejected imports are not eligible',()=>{
 for(const import_status of ['pending_validation','rejected','unknown'])
  assert.equal(assessWorkoutExecution({...expected(),import_status}).status,'not_verifiable');
});
test('manual workouts cannot gain device interval compliance',()=>{
 assert.equal(assessWorkoutExecution({...expected(),source:'manual'}).status,'not_verifiable');
});
test('invalid or missing FTP and interval targets are rejected',()=>{
 const x=expected();x.ftp_at_activity_w=null;
 assert.equal(assessWorkoutExecution(x).status,'not_verifiable');
 const y=expected();delete y.planned[1].target_high_pct_ftp;
 assert.equal(assessWorkoutExecution(y).status,'not_verifiable');
});
test('timing and segment mismatches are not silently aligned',()=>{
 const x=expected();x.recorded[1].duration_sec=650;
 assert.equal(assessWorkoutExecution(x).status,'not_verifiable');
 const y=expected();y.recorded[2].kind='work';
 assert.equal(assessWorkoutExecution(y).status,'not_verifiable');
});
