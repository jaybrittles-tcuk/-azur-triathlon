import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCoachingDecision } from "../coachingIntelligence.ts";

// Twelve synthetic profiles cover the 4 race distances x 3 experience levels.
// This validates decision rules, NOT the workout generator or 12-week plans.
const distances = ["sprint", "olympic", "70.3", "ironman"];
const levels = [
  { name: "beginner", hours: 5, weeks: 1, completion: 6, planned: 8, fatigue: 5 },
  { name: "intermediate", hours: 9, weeks: 5, completion: 11, planned: 12, fatigue: 4 },
  { name: "advanced", hours: 14, weeks: 8, completion: 13, planned: 14, fatigue: 3 },
];
for (const raceDistance of distances) for (const level of levels) {
  test(`matrix: ${level.name} ${raceDistance} receives a safe race-aware decision`, () => {
    const decision = evaluateCoachingDecision({
      raceDistance, phase: "base", weeklyAvailableHours: level.hours,
      recentConsistentWeeks: level.weeks, completedSessionsLast14Days: level.completion,
      plannedSessionsLast14Days: level.planned, reportedFatigue: level.fatigue,
    });
    assert.ok(decision.primaryObjective.length > 20);
    assert.ok(decision.whyTodayMatters.length > 30);
    assert.ok(decision.intensityGuidance.includes("conservative"));
    if (level.name === "beginner") assert.notEqual(decision.adaptation, "consider_progression");
    else {
      assert.equal(decision.adaptation, "consider_progression");
      assert.equal(decision.coachApprovalRequired, true);
    }
  });
}
for (const raceDistance of distances) {
  test(`safety: ${raceDistance} high fatigue blocks progression`, () => {
    const decision = evaluateCoachingDecision({
      raceDistance, phase: "build", weeklyAvailableHours: 12,
      recentConsistentWeeks: 10, completedSessionsLast14Days: 14,
      plannedSessionsLast14Days: 14, reportedFatigue: 9,
    });
    assert.equal(decision.adaptation, "reduce_and_review");
    assert.equal(decision.coachApprovalRequired, true);
  });
  test(`safety: ${raceDistance} missing data does not progress`, () => {
    assert.equal(evaluateCoachingDecision({
      raceDistance, phase: "foundation", weeklyAvailableHours: 6,
    }).adaptation, "assess_first");
  });
  test(`safety: ${raceDistance} taper does not progress`, () => {
    assert.notEqual(evaluateCoachingDecision({
      raceDistance, phase: "taper", weeklyAvailableHours: 10,
      recentConsistentWeeks: 8, completedSessionsLast14Days: 12,
      plannedSessionsLast14Days: 12, reportedFatigue: 2,
    }).adaptation, "consider_progression");
  });
}
