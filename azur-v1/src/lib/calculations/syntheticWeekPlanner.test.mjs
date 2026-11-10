import test from "node:test";
import assert from "node:assert/strict";
import { buildSyntheticWeek } from "../syntheticWeekPlanner.ts";
const distances = ["sprint", "olympic", "70.3", "ironman"];
const levels = [{ name:"beginner",hours:5 },{ name:"intermediate",hours:9 },{ name:"advanced",hours:14 }];
for (const raceDistance of distances) for (const level of levels) {
 test(`synthetic week: ${level.name} ${raceDistance} fits time budget and includes all sports`, () => {
   const w = buildSyntheticWeek({raceDistance,phase:"foundation",weeklyAvailableHours:level.hours},level.name);
   assert.ok(w.sessions.length >= 5);
   assert.ok(w.totalMinutes <= w.availableMinutes);
   assert.equal(w.totalMinutes,w.sessions.reduce((sum,s)=>sum+s.minutes,0));
   for (const sport of ["swim","bike","run"]) assert.ok(w.sessions.some(s=>s.sport===sport));
   assert.ok(w.sessions.every(s=>s.minutes>0 && s.rationale.length>20));
   assert.equal(w.coachApprovalRequired,true);
 });
}
test("high fatigue returns rest and coach review, never workouts",()=>{
 const w=buildSyntheticWeek({raceDistance:"ironman",phase:"build",weeklyAvailableHours:12,reportedFatigue:9},"advanced");
 assert.equal(w.totalMinutes,0);
 assert.deepEqual(w.sessions.map(s=>s.sport),["rest"]);
 assert.equal(w.coachApprovalRequired,true);
});
test("extremely low available time triggers manual review",()=>{
 const w=buildSyntheticWeek({raceDistance:"sprint",phase:"foundation",weeklyAvailableHours:1},"beginner");
 assert.equal(w.sessions.length,0);
 assert.equal(w.coachApprovalRequired,true);
});
