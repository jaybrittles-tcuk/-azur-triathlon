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

test('actual draft engine does not borrow cycling fitness to justify advanced running',()=>{
 const runLibrary=[
  {id:'run-easy',sport:'run',family:'aerobic_endurance',title:'Easy run',durationMin:45,level:1,phases:['base'],approved:true,prescription:{main_set:[{duration_min:45,target:'easy'}]}},
  {id:'run-hard',sport:'run',family:'aerobic_endurance',title:'Advanced run',durationMin:45,level:3,phases:['base'],approved:true,prescription:{main_set:[{duration_min:45,target:'advanced'}]}}
 ];
 const runBase={...base,slots:[{day:0,sport:'run',family:'aerobic_endurance',maxMinutes:60,maxLevel:3}],library:runLibrary};
 const novice=draftApprovedTrainingWeek({...runBase,athleteEvidence:{recentWeeklyHours:12,sportRecentWeeklyHours:{run:1},benchmarksVerified:true}});
 const experienced=draftApprovedTrainingWeek({...runBase,athleteEvidence:{recentWeeklyHours:12,sportRecentWeeklyHours:{run:7},benchmarksVerified:true}});
 assert.equal(novice.status,'ready_for_coach_review');
 assert.equal(novice.sessions[0].session.id,'run-easy');
 assert.equal(experienced.status,'ready_for_coach_review');
 assert.equal(experienced.sessions[0].session.id,'run-hard');
});
test('recovery concern prevents demanding session in real weekly draft',()=>{
 const threshold={...library[0],id:'threshold',family:'threshold',level:2};
 const result=draftApprovedTrainingWeek({...base,slots:[{...base.slots[0],family:'threshold',maxLevel:3}],library:[threshold],athleteEvidence:{recentWeeklyHours:10,sportRecentWeeklyHours:{bike:5},benchmarksVerified:true,recoveryConcern:true}});
 assert.equal(result.status,'blocked');
 assert.match(result.reasons.join(' '),/Missing approved bike threshold/);
});
