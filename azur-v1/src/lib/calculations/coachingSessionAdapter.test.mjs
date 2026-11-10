import test from "node:test";
import assert from "node:assert/strict";
import { selectSessionWithCoachingIntelligence } from "./coachingSessionAdapter.ts";
const athlete = {raceDistance:"70.3",phase:"build",weeklyAvailableHours:9,recentConsistentWeeks:5,completedSessionsLast14Days:12,plannedSessionsLast14Days:13,reportedFatigue:3};
const library = [
 {id:"coach-1",sport:"bike",family:"aerobic_endurance",title:"Approved aerobic",durationMin:50,level:1,phases:["build"],prescription:{steps:[{minutes:50}]},approved:true},
 {id:"unapproved",sport:"bike",family:"aerobic_endurance",title:"Unapproved",durationMin:50,level:3,phases:["build"],prescription:{steps:[{minutes:50}]},approved:false},
];
test("only an approved existing session can be selected",()=>{
 const result=selectSessionWithCoachingIntelligence(library,athlete,"bike","aerobic_endurance",60,3);
 assert.equal(result.selection.status,"selected");
 assert.equal(result.selection.session.id,"coach-1");
 assert.equal(result.requiresCoachReview,true);
});
test("high fatigue blocks selection",()=>{
 const result=selectSessionWithCoachingIntelligence(library,{...athlete,reportedFatigue:9},"bike","aerobic_endurance",60,3);
 assert.equal(result.selection.status,"unavailable");
 assert.equal(result.requiresCoachReview,true);
});
test("missing history limits selection to beginner level",()=>{
 const result=selectSessionWithCoachingIntelligence(library,{raceDistance:"sprint",phase:"build",weeklyAvailableHours:5},"bike","aerobic_endurance",60,3);
 assert.equal(result.selection.status,"selected");
 assert.equal(result.selection.session.level,1);
 assert.equal(result.requiresCoachReview,true);
});
test("missing approved match does not fabricate a workout",()=>{
 const result=selectSessionWithCoachingIntelligence(library,athlete,"swim","threshold",60,3);
 assert.equal(result.selection.status,"unavailable");
});
