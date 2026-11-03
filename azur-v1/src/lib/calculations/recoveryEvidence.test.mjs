import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRecoveryEvidence} from './recoveryEvidence.ts';
const now=new Date('2026-11-03T15:00:00Z');
const rows=Array.from({length:8},(_,i)=>({metric:'resting_heart_rate',observed_date:`2026-11-${String(3-i).padStart(2,'0')}`,value:i===0?66:55,provider:'approved-device'}));
test('never expose health analysis without explicit consent',()=>{
 const r=assessRecoveryEvidence(rows,'resting_heart_rate',now,false);
 assert.equal(r.status,'insufficient_data');assert.equal(r.samples,0);
});
test('lack of measured history cannot manufacture readiness',()=>{
 const r=assessRecoveryEvidence([],'resting_heart_rate',now,true);
 assert.equal(r.status,'insufficient_data');assert.equal(r.deviation_pct,null);
});
test('seven consented observations provide a comparison, not diagnosis',()=>{
 const r=assessRecoveryEvidence(rows.slice(0,7),'resting_heart_rate',now,true);
 assert.equal(r.status,'trend_available');assert.equal(r.samples,7);
 assert.equal(r.deviation_pct,20);assert.match(r.observation,/not a recovery diagnosis/i);
});
test('duplicate-day and out-of-window values do not inflate baseline',()=>{
 const extra={...rows[0],value:100};
 const r=assessRecoveryEvidence([rows[0],extra,rows[1]],'resting_heart_rate',now,true);
 assert.equal(r.status,'insufficient_data');assert.equal(r.samples,2);
});
test('HRV and resting HR evidence are evaluated separately',()=>{
 const r=assessRecoveryEvidence(rows,'hrv_rmssd',now,true);
 assert.equal(r.status,'insufficient_data');
});
