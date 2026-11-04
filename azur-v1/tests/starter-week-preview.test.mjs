import test from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkIndependent,starterWeekPreview} from '../src/lib/starterWeekPreview.mjs';
const easy={workout_key:'run-easy',title:'Easy aerobic run',sport:'run',family:'aerobic_endurance',
 duration_min:45,level:1,phases:['base'],approved:true,
 prescription:{steps:[{durationMin:10,target:'Easy conversational effort'},{durationMin:35,target:'Comfortable RPE 3-4'}]}};
const ftp={...easy,workout_key:'bike-ftp',sport:'bike',prescription:{steps:[{durationMin:45,target:'65-75% FTP'}]}};
const css={...easy,workout_key:'swim-css',sport:'swim',prescription:{poolSegments:[{target:'CSS + 12s/100m'}]}};
const valid={weekStart:'2026-11-09',onboardingCompleted:true,availabilityHours:16,existingSessions:0,library:[easy,ftp,css]};
test('benchmark-dependent workouts are never used to infer intensity',()=>{
 assert.equal(benchmarkIndependent(easy),true);
 assert.equal(benchmarkIndependent(ftp),false);
 assert.equal(benchmarkIndependent(css),false);
 assert.equal(benchmarkIndependent({...easy,approved:false}),false);
 assert.equal(benchmarkIndependent({...easy,prescription:{steps:[{target:'below threshold'}]}}),false);
});
test('new athlete receives only approved safe candidates, not a published plan',()=>{
 const result=starterWeekPreview(valid);
 assert.equal(result.status,'needs_coach_review');
 assert.equal(result.canPublish,false);
 assert.equal(result.sessions.length,1);
 assert.equal(result.sessions[0].workout_key,'run-easy');
 assert.equal(result.sessions[0].date,'2026-11-11');
 assert.ok(result.reasons.some(r=>r.includes('approved bike')));
 assert.ok(result.reasons.some(r=>r.includes('approved swim')));
 assert.equal(result.availabilityCeilingMinutes,960);
});
test('existing sessions block even draft candidate selection',()=>{
 const result=starterWeekPreview({...valid,existingSessions:1});
 assert.equal(result.sessions.length,0);
 assert.equal(result.canPublish,false);
 assert.match(result.reasons.join(' '),/reconciliation/);
});
test('incomplete onboarding and invalid dates fail closed',()=>{
 assert.equal(starterWeekPreview({...valid,onboardingCompleted:false}).sessions.length,0);
 assert.equal(starterWeekPreview({...valid,weekStart:'2026-11-10'}).sessions.length,0);
});
test('availability does not scale an inexperienced athlete to 16 hours',()=>{
 const result=starterWeekPreview(valid);
 assert.ok(result.minutes<=45);
 assert.ok(result.minutes<result.availabilityCeilingMinutes);
});
