import test from 'node:test';
import assert from 'node:assert/strict';
import { draftApprovedTrainingWeek } from '../src/lib/calculations/weeklyDraftGenerator.ts';
const library=[{id:'coach-bike-1',sport:'bike',family:'aerobic_endurance',title:'Coach aerobic ride',durationMin:60,level:1,phases:['base'],approved:true,prescription:{main_set:[{duration_min:60,target:'easy'}]} }];
const base={weekStart:'2026-11-02',slots:[{day:0,sport:'bike',family:'aerobic_endurance',maxMinutes:80,maxLevel:1}],library,phase:'base',weeklyLimitMinutes:120,existingActiveSessions:0,athleteProfileReady:true};
test('valid approved coach session is drafted but never published',()=>{
 const result=draftApprovedTrainingWeek(base);
 assert.equal(result.status,'ready_for_coach_review');
 assert.equal(result.sessions[0].date,'2026-11-02');
 assert.equal(result.sessions[0].session.id,'coach-bike-1');
});
test('missing swim drills blocks the whole proposal, no invented sessions',()=>{
 const result=draftApprovedTrainingWeek({...base,slots:[...base.slots,{day:2,sport:'swim',family:'technique',maxMinutes:45,maxLevel:1}]});
 assert.equal(result.status,'blocked'); assert.match(result.reasons.join(' '),/Missing approved swim technique/);
});
test('existing calendar and incomplete profile block the draft',()=>{
 assert.equal(draftApprovedTrainingWeek({...base,existingActiveSessions:1}).status,'blocked');
 assert.equal(draftApprovedTrainingWeek({...base,athleteProfileReady:false}).status,'blocked');
});
test('unapproved or wrong phase sessions never selected',()=>{
 assert.equal(draftApprovedTrainingWeek({...base,library:[{...library[0],approved:false}]}).status,'blocked');
 assert.equal(draftApprovedTrainingWeek({...base,phase:'taper'}).status,'blocked');
});

test('duplicate sport and day cannot silently create two workouts',()=>{
 const result=draftApprovedTrainingWeek({...base,library:[...library,{...library[0],id:'coach-bike-2'}],slots:[base.slots[0],base.slots[0]]});
 assert.equal(result.status,'blocked');
 assert.match(result.reasons.join(' '),/Duplicate bike training slot/);
 assert.equal(result.sessions.length,1);
});
test('invalid slot duration or level blocks generation',()=>{
 for(const slot of [{...base.slots[0],maxMinutes:0},{...base.slots[0],maxLevel:4}]){
  const result=draftApprovedTrainingWeek({...base,slots:[slot]});
  assert.equal(result.status,'blocked');
  assert.match(result.reasons.join(' '),/Invalid duration or level/);
 }
});
