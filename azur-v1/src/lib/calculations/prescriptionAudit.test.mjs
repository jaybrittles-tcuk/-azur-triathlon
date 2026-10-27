import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPrescription } from './prescriptionAudit.ts';
test('bike numeric warmup and work are ready',()=>{
 assert.equal(auditPrescription({sport:'bike',prescription:{azurWorkout:{steps:[{type:'work',durationMin:45,targetType:'ftp',targetLow:70,targetHigh:80}]}}}).ready,true);
});
test('legacy descriptive run remains incomplete',()=>{
 assert.equal(auditPrescription({sport:'run',prescription:{main_set:[{duration_min:45,target:'Easy aerobic'}]}}).ready,false);
});
test('distance-only swim missing interval durations',()=>{
 const v=auditPrescription({sport:'swim',prescription:{azurWorkout:{steps:[{type:'work',distanceM:200,targetType:'swim_pace',targetLow:100,targetHigh:105}]}}});
 assert.match(v.reason,/duration/);
});
test('unprescribed recovery invalidates completeness',()=>{
 const v=auditPrescription({sport:'bike',prescription:{azurWorkout:{steps:[{type:'repeat',reps:2,work:{type:'work',durationMin:5,targetType:'ftp',targetLow:95,targetHigh:100},recovery:{type:'recovery',durationMin:2}}]}}});
 assert.equal(v.ready,false);
});
