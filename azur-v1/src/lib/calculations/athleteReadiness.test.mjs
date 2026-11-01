import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAthleteReadiness} from './athleteReadiness.ts';
const asOf='2026-11-01';
const training=(status='ready')=>({status,windowDays:90,observedDays:status==='ready'?90:20,missingDays:status==='ready'?0:70,coveragePercent:status==='ready'?100:22,fitness:status==='ready'?50:null,fatigue:status==='ready'?53:null,form:status==='ready'?-3:null,warnings:[]});
const metric=(name,delta)=>({metric:name,current:50+delta,baseline:50,delta,baselineDays:28,sampleCount:25,status:'established',direction:delta>0?'above':'below',reason:'Descriptive only'});
test('low-coverage history without health or check-in is insufficient rather than ready',()=>{
 const r=assessAthleteReadiness({assessmentDate:asOf,training:training('insufficient'),health:[]});
 assert.equal(r.status,'insufficient_data');assert.equal(r.automaticPlanChangesAllowed,false);
});
test('one outlying device metric is informational only',()=>{
 const r=assessAthleteReadiness({assessmentDate:asOf,training:training(),health:[metric('resting_hr',8)]});
 assert.equal(r.status,'no_concerns_detected');assert.equal(r.coachApprovalRequired,false);
 assert.equal(r.signals.some(s=>s.code==='single_recovery_variation'),true);
});
test('two recovery variations flag monitoring without rescheduling',()=>{
 const r=assessAthleteReadiness({assessmentDate:asOf,training:training(),health:[metric('resting_hr',8),{...metric('sleep_minutes',-100),current:380,baseline:480,delta:-100}]});
 assert.equal(r.status,'monitor');assert.equal(r.coachApprovalRequired,true);assert.equal(r.automaticPlanChangesAllowed,false);
});
test('illness report requires human review',()=>{
 const r=assessAthleteReadiness({assessmentDate:asOf,training:training(),health:[],checkIn:{date:asOf,feelsUnwell:true}});
 assert.equal(r.status,'coach_review');assert.equal(r.coachApprovalRequired,true);
});
test('outdated feedback does not create fresh illness warning',()=>{
 const r=assessAthleteReadiness({assessmentDate:asOf,training:training(),health:[],checkIn:{date:'2026-10-30',feelsUnwell:true}});
 assert.equal(r.status,'no_concerns_detected');assert.equal(r.signals.some(s=>s.code==='stale_checkin'),true);
});
