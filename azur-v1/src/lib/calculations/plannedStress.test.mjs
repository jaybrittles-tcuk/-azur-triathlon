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
