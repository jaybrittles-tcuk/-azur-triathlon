import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveBenchmarkTarget} from './benchmarkWorkoutTargets.ts';
test('verified FTP produces athlete-specific power ranges',()=>{
 const a=resolveBenchmarkTarget({verified:true,ftpWatts:200},{sport:'bike',lowPct:65,highPct:75});
 const b=resolveBenchmarkTarget({verified:true,ftpWatts:300},{sport:'bike',lowPct:65,highPct:75});
 assert.deepEqual([a.low,a.high],[130,150]);
 assert.deepEqual([b.low,b.high],[195,225]);
});
test('verified CSS and run thresholds preserve units and easier pace offsets',()=>{
 const swim=resolveBenchmarkTarget({verified:true,cssSecondsPer100m:100},{sport:'swim',lowOffsetSec:8,highOffsetSec:18});
 const run=resolveBenchmarkTarget({verified:true,runThresholdSecondsPerKm:240},{sport:'run',lowOffsetSec:35,highOffsetSec:65});
 assert.deepEqual([swim.low,swim.high,swim.unit],[108,118,'s/100m']);
 assert.deepEqual([run.low,run.high,run.unit],[275,305,'s/km']);
});
test('unverified or invalid thresholds never create numeric targets',()=>{
 assert.equal(resolveBenchmarkTarget({verified:false,ftpWatts:250},{sport:'bike',lowPct:65,highPct:75}),null);
 assert.equal(resolveBenchmarkTarget({verified:true},{sport:'swim',lowOffsetSec:8,highOffsetSec:18}),null);
 assert.equal(resolveBenchmarkTarget({verified:true,ftpWatts:250},{sport:'bike',lowPct:85,highPct:65}),null);
});
