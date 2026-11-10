import test from "node:test";
import assert from "node:assert/strict";
import { validationMatrix, simulateProgramme } from "../programmeSimulation.ts";
test("all twelve profiles generate twelve weeks with valid budgets and phases", () => {
 const matrix=validationMatrix();
 assert.equal(matrix.length,12);
 for(const profile of matrix) {
   assert.equal(profile.weeks.length,12);
   assert.deepEqual(profile.weeks.map(w=>w.phase),[
     "foundation","foundation","base","base","base","build","build","build","build","race_specific","race_specific","taper"
   ]);
   for(const week of profile.weeks) {
     assert.ok(week.totalMinutes <= week.availableMinutes);
     assert.ok(week.sessions.every(s=>s.rationale && s.structure));
     assert.equal(week.coachApprovalRequired,true);
   }
   assert.ok(profile.weeks[3].totalMinutes <= profile.weeks[2].totalMinutes);
   assert.ok(profile.weeks[7].totalMinutes <= profile.weeks[6].totalMinutes);
   assert.ok(profile.weeks[11].totalMinutes <= profile.weeks[10].totalMinutes);
 }
});
test("high fatigue scenario triggers recovery-only week",()=>{
 const weeks=simulateProgramme({raceDistance:"ironman",phase:"base",weeklyAvailableHours:12,reportedFatigue:3,
  recentConsistentWeeks:5,completedSessionsLast14Days:12,plannedSessionsLast14Days:13},"advanced","high_fatigue");
 assert.equal(weeks[5].totalMinutes,0);
 assert.deepEqual(weeks[5].sessions.map(s=>s.sport),["rest"]);
});
test("missed sessions scenario does not increase time budget",()=>{
 const weeks=simulateProgramme({raceDistance:"olympic",phase:"base",weeklyAvailableHours:9,reportedFatigue:4,
  recentConsistentWeeks:5,completedSessionsLast14Days:12,plannedSessionsLast14Days:13},"intermediate","missed_sessions");
 assert.ok(weeks[4].totalMinutes<=weeks[4].availableMinutes);
 assert.equal(weeks[4].coachApprovalRequired,true);
});
