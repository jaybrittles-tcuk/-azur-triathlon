import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCoachingDecision } from "../coachingIntelligence.ts";
import { assessSwim, cssTargetSeconds } from "../swimIntelligence.ts";

const base = {
 raceDistance: "olympic", phase: "build", weeklyAvailableHours: 10,
 recentConsistentWeeks: 4, completedSessionsLast14Days: 12,
 plannedSessionsLast14Days: 13, reportedFatigue: 3,
 knownThresholds: { bike: { confidence: "high" } }, limiter: "bike",
};
test("consistent recovered athlete can be considered for coach-approved progression", () => {
 const d = evaluateCoachingDecision(base);
 assert.equal(d.adaptation, "consider_progression");
 assert.equal(d.coachApprovalRequired, true);
 assert.match(d.whyTodayMatters, /threshold durability/i);
});
test("high fatigue overrides training consistency", () => {
 const d = evaluateCoachingDecision({ ...base, reportedFatigue: 9 });
 assert.equal(d.adaptation, "reduce_and_review");
 assert.equal(d.coachApprovalRequired, true);
});
test("injury concern overrides good fatigue score", () => {
 assert.equal(evaluateCoachingDecision({ ...base, injuryOrIllnessConcern: true }).adaptation, "reduce_and_review");
});
test("incomplete data does not trigger progression", () => {
 const d = evaluateCoachingDecision({ raceDistance: "sprint", phase: "foundation", weeklyAvailableHours: 5 });
 assert.equal(d.adaptation, "assess_first");
 assert.match(d.intensityGuidance, /conservative/i);
});
test("taper never triggers progression", () => {
 assert.notEqual(evaluateCoachingDecision({ ...base, phase: "taper" }).adaptation, "consider_progression");
});
test("invalid completion and fatigue data rejected", () => {
 assert.throws(() => evaluateCoachingDecision({ ...base, completedSessionsLast14Days: 15 }));
 assert.throws(() => evaluateCoachingDecision({ ...base, reportedFatigue: 11 }));
});
test("CSS time target scales with distance", () => {
 assert.equal(cssTargetSeconds(90, 200), 180);
 assert.equal(cssTargetSeconds(90, 400, 5), 380);
 assert.equal(cssTargetSeconds(0, 200), null);
});
test("slow swim repeats do not imply technique diagnosis", () => {
 const d = assessSwim({ recentRepeatSplitsSecondsPer100m: [90, 90, 96, 97] });
 assert.equal(d.focus, "pacing");
 assert.equal(d.requiresCoachReview, true);
 assert.ok(d.evidence.some(s => s.includes(">3%")));
});
test("observed technique issue produces focused coaching cue", () => {
 const d = assessSwim({ observedFocus: "breathing", coachApproved: true });
 assert.equal(d.focus, "breathing");
 assert.equal(d.requiresCoachReview, false);
});
