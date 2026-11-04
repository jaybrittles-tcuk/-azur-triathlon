import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCoachSession } from './sessionSelection.ts';

const base={sport:'bike',family:'threshold',phase:'build',maxMinutes:70,maxLevel:2};
const entry=(id, overrides={})=>({id,sport:'bike',family:'threshold',title:id,durationMin:60,level:2,phases:['build'],prescription:{steps:[]},approved:true,...overrides});

test('selects approved session fitting time, phase and development level',()=>{
 const r=selectCoachSession([entry('easy',{level:1}),entry('right'),entry('too-long',{durationMin:90})],base);
 assert.equal(r.status,'selected'); assert.equal(r.session.id,'right');
});
test('never selects unapproved sessions',()=>{
 assert.equal(selectCoachSession([entry('draft',{approved:false})],base).status,'unavailable');
});
test('does not silently substitute another training family',()=>{
 assert.equal(selectCoachSession([entry('endurance',{family:'aerobic_endurance'})],base).status,'unavailable');
});
test('excludes completed or undesired library IDs',()=>{
 const r=selectCoachSession([entry('a'),entry('b')],{...base,excludeIds:['a']});
 assert.equal(r.status,'selected');assert.equal(r.session.id,'b');
});
test('selection is stable across equal candidates',()=>{
 const r=selectCoachSession([entry('z'),entry('a')],base);
 assert.equal(r.session.id,'a');
});

test('training history constrains selected level',()=>{
 const pool=[entry('easy',{level:1}),entry('advanced',{level:3})];
 const beginner=selectCoachSession(pool,{...base,maxLevel:3,recentWeeklyHours:2,benchmarksVerified:false});
 const experienced=selectCoachSession(pool,{...base,maxLevel:3,recentWeeklyHours:12,benchmarksVerified:true});
 assert.equal(beginner.session.id,'easy');
 assert.equal(experienced.session.id,'advanced');
});

test('sport-specific load prevents cycling fitness from unlocking hard run work',()=>{
 const runEntries=[entry('gentle',{sport:'run',level:1}),entry('hard-run',{sport:'run',level:3})];
 const result=selectCoachSession(runEntries,{...base,sport:'run',maxLevel:3,recentWeeklyHours:14,sportRecentWeeklyHours:1,benchmarksVerified:true});
 assert.equal(result.session.id,'gentle');
});
test('recovery concern blocks demanding sessions',()=>{
 const result=selectCoachSession([entry('hard')],{...base,recoveryConcern:true});
 assert.equal(result.status,'unavailable');
});
test('sport clearance constrains otherwise qualified athletes',()=>{
 const result=selectCoachSession([entry('easy',{level:1}),entry('hard',{level:3})],{...base,maxLevel:3,recentWeeklyHours:12,sportRecentWeeklyHours:8,benchmarksVerified:true,sportClearedLevel:1});
 assert.equal(result.session.id,'easy');
});
