import test from 'node:test';
import assert from 'node:assert/strict';
import { estimatePlannedStress } from './plannedStress.ts';

test('one hour at 100 percent FTP has proxy score 100', () => {
 const result = estimatePlannedStress({sport:'bike',prescription:{azurWorkout:{steps:[{type:'work',durationMin:60,targetType:'ftp',targetLow:100,targetHigh:100}]}}});
 assert.deepEqual(result,{status:'estimated',points:100,method:'ftp_duration_proxy'});
});
test('untargeted warmup invalidates score instead of assuming effort', () => {
 const result = estimatePlannedStress({sport:'bike',prescription:{azurWorkout:{steps:[{type:'warmup',durationMin:10},{type:'work',durationMin:40,targetType:'ftp',targetLow:90,targetHigh:95}]}}});
 assert.equal(result.status,'unavailable');
});
test('running targets are not misrepresented as FTP bike stress', () => {
 assert.equal(estimatePlannedStress({sport:'run'}).status,'unavailable');
});

test('repeat intervals include work and between-rep recoveries', () => {
 const result = estimatePlannedStress({sport:'bike',prescription:{azurWorkout:{steps:[{type:'repeat',reps:3,work:{type:'work',durationMin:10,targetType:'ftp',targetLow:100,targetHigh:100},recovery:{type:'recovery',durationMin:5,targetType:'ftp',targetLow:50,targetHigh:50}}]}}});
 assert.deepEqual(result,{status:'estimated',points:52.1,method:'ftp_duration_proxy'});
});
test('rejects excessive session duration', () => {
 const result = estimatePlannedStress({sport:'bike',prescription:{azurWorkout:{steps:[{type:'work',durationMin:1500,targetType:'ftp',targetLow:100,targetHigh:100}]}}});
 assert.equal(result.status,'unavailable');
});
test('rejects missing FTP targets on recovery intervals', () => {
 const result = estimatePlannedStress({sport:'bike',prescription:{azurWorkout:{steps:[{type:'repeat',reps:2,work:{type:'work',durationMin:10,targetType:'ftp',targetLow:100,targetHigh:100},recovery:{type:'recovery',durationMin:4}}]}}});
 assert.equal(result.status,'unavailable');
});
