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

test('planner reports unmatched proposed minutes without inventing workouts',()=>{
 const result=draftApprovedTrainingWeek({...base,slots:[...base.slots,{day:2,sport:'swim',family:'technique',maxMinutes:45,maxLevel:1}]});
 assert.equal(result.status,'blocked');
 assert.deepEqual(result.coverage,{proposedMinutes:125,prescribedMinutes:60,missingMinutes:65,missingSlots:1});
});
test('a proposed weekly total above coach target needs review',()=>{
 const result=draftApprovedTrainingWeek({...base,targetWeekMinutes:50});
 assert.equal(result.status,'blocked');
 assert.match(result.reasons.join(' '),/materially exceeds/);
});
test('invalid slot durations are blocked rather than silently discarded',()=>{
 const result=draftApprovedTrainingWeek({...base,slots:[{...base.slots[0],maxMinutes:NaN}]});
 assert.equal(result.status,'blocked');
 assert.match(result.reasons.join(' '),/Invalid available minutes/);
 assert.equal(result.coverage.missingSlots,1);
});
