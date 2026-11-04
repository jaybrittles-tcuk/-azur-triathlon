import test from 'node:test';
import assert from 'node:assert/strict';
import {proposeIntelligentWorkout} from './intelligentWorkoutPrescription.ts';
const base={sport:'bike',phase:'base',availableMinutes:70,recoveryConcern:false,benchmarks:{verified:true,ftpWatts:250}};
test('experienced athlete gets structured personalised intervals',()=>{
 const p=proposeIntelligentWorkout({...base,recentSportHours:6});
 assert.equal(p.status,'coach_review_required');
 assert.equal(p.steps.filter(s=>s.name.startsWith('Aerobic repeat')).length,3);
 assert.deepEqual([p.steps[1].target.low,p.steps[1].target.high],[163,188]);
 assert.equal(p.steps.reduce((n,s)=>n+s.minutes,0),p.minutes);
 assert.ok(p.minutes<=70);
});
test('limited history produces easier structure without threshold targets',()=>{
 const p=proposeIntelligentWorkout({...base,recentSportHours:1});
 assert.equal(p.steps.filter(s=>s.name.startsWith('Aerobic repeat')).length,2);
 assert.equal(p.steps[1].target,null);
});
test('unverified benchmark never becomes a power target',()=>{
 const p=proposeIntelligentWorkout({...base,recentSportHours:6,benchmarks:{verified:false,ftpWatts:250}});
 assert.equal(p.steps[1].target,null);
});
test('recovery concern limits workload and removes numeric intensity',()=>{
 const p=proposeIntelligentWorkout({...base,recentSportHours:10,recoveryConcern:true});
 assert.equal(p.steps[1].target,null);
 assert.equal(p.steps.filter(s=>s.name.startsWith('Aerobic repeat')).length,2);
});
test('no session when prescribed minimum cannot fit available time',()=>{
 assert.equal(proposeIntelligentWorkout({...base,availableMinutes:20,recentSportHours:5}),null);
});
test('swim and run retain sport-specific units',()=>{
 const swim=proposeIntelligentWorkout({...base,sport:'swim',recentSportHours:5,benchmarks:{verified:true,cssSecondsPer100m:100}});
 const run=proposeIntelligentWorkout({...base,sport:'run',recentSportHours:5,benchmarks:{verified:true,runThresholdSecondsPerKm:240}});
 assert.equal(swim.steps[1].target.unit,'s/100m');
 assert.equal(run.steps[1].target.unit,'s/km');
});
