import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPrescription, auditAthleteInstructions, classifyPrescriptionException } from './prescriptionAudit.ts';
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

test('legacy swim repeat requires prescribed recovery',()=>{
 const result=auditAthleteInstructions({main_set:[{reps:12,distance_m:200,target:'Aerobic'}]});
 assert.equal(result.complete,false);
 assert.deepEqual(result.gaps.map(g=>g.missing),['recovery']);
});
test('complete swim repeat describes work, effort and recovery',()=>{
 const result=auditAthleteInstructions({main_set:[{reps:12,distance_m:200,target:'Aerobic',recovery_sec:20}]});
 assert.equal(result.complete,true);
});
test('run repeat without effort cannot pass',()=>{
 const result=auditAthleteInstructions({main_set:[{reps:4,duration_min:5,recovery_min:2}]});
 assert.deepEqual(result.gaps.map(g=>g.missing),['effort']);
});
test('structured bike repeat preserves work and recovery targets',()=>{
 const result=auditAthleteInstructions({azurWorkout:{steps:[{type:'repeat',reps:3,work:{durationMin:5,targetType:'ftp',targetLow:90,targetHigh:95},recovery:{durationMin:2,targetType:'ftp',targetLow:40,targetHigh:50}}]}});
 assert.equal(result.complete,true);
});
test('empty prescription must not pass',()=>{
 assert.equal(auditAthleteInstructions(null).complete,false);
});

test('approved complete routine session is eligible for automated use',()=>{
 const result=classifyPrescriptionException({sport:'swim',prescription:{main_set:[{reps:4,distance_m:100,target:'CSS pace',recovery_sec:20}]},templateApproved:true,hasValidBenchmark:true});
 assert.equal(result.status,'routine');
 assert.equal(result.eligibleForAutomaticUse,true);
});
test('significant changes always require review',()=>{
 const result=classifyPrescriptionException({sport:'run',prescription:{main_set:[{reps:3,duration_min:8,target:'Threshold',recovery_min:2}]},templateApproved:true,hasValidBenchmark:true,materialChange:true});
 assert.equal(result.status,'review');
 assert.equal(result.eligibleForAutomaticUse,false);
});
test('unapproved or missing-data sessions cannot be automated',()=>{
 const result=classifyPrescriptionException({sport:'bike',prescription:{main_set:[{duration_min:45,target:'Easy'}]},templateApproved:false,hasValidBenchmark:false});
 assert.equal(result.status,'blocked');
 assert.equal(result.eligibleForAutomaticUse,false);
});
