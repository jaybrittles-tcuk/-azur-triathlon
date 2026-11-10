/** AZUR synthetic week planning prototype. Not connected to production planner. */
import { evaluateCoachingDecision, type AthleteContext, type Discipline } from "./coachingIntelligence.ts";
export type Experience = "beginner" | "intermediate" | "advanced";
export interface PlannedSession {
  day: number; sport: Discipline | "strength" | "rest"; minutes: number;
  objective: string; structure: string; rationale: string;
}
export interface SyntheticWeek {
  sessions: PlannedSession[]; totalMinutes: number; availableMinutes: number;
  warnings: string[]; coachApprovalRequired: boolean;
}
const templates: Record<Discipline, { objective: string; structure: string }> = {
  swim: { objective: "Aerobic swim and controlled technique", structure: "Easy warm-up; repeatable aerobic lengths with generous rest; easy cool-down. Use RPE until CSS validated." },
  bike: { objective: "Aerobic cycling durability", structure: "Progressive warm-up; conversational aerobic riding; easy cool-down. No unvalidated FTP targets." },
  run: { objective: "Aerobic running consistency", structure: "Easy warm-up; comfortable talk-test running or run/walk; easy cool-down." },
};
const sportOrder: Discipline[] = ["swim", "bike", "run", "bike", "swim", "run", "bike", "swim", "run"];
const dayOrder = [1,2,3,4,5,6,0,2,4]; // 0 Sunday
export function buildSyntheticWeek(a: AthleteContext, experience: Experience): SyntheticWeek {
  const decision = evaluateCoachingDecision(a);
  const availableMinutes = Math.floor(a.weeklyAvailableHours * 60);
  const warnings = [...decision.missingData];
  if (decision.adaptation === "reduce_and_review") {
    return { sessions: [{ day: 0, sport: "rest", minutes: 0, objective: "Recovery and coach review", structure: "Do not automatically prescribe intensity while illness, injury or high fatigue is reported.", rationale: decision.whyTodayMatters }], totalMinutes: 0, availableMinutes, warnings: [...warnings, "Coach review required before resuming training"], coachApprovalRequired: true };
  }
  const n = experience === "beginner" ? 5 : experience === "intermediate" ? 7 : 9;
  const maxMinutes = Math.min(availableMinutes, experience === "beginner" ? 360 : experience === "intermediate" ? 660 : 960);
  const sessionCount = Math.min(n, Math.floor(maxMinutes / 25));
  if (sessionCount < 3) {
    return { sessions: [], totalMinutes: 0, availableMinutes, warnings: [...warnings, "Less than 75 minutes available: coach should customise a minimum viable plan"], coachApprovalRequired: true };
  }
  const weights = sportOrder.slice(0,sessionCount).map(s => s === "bike" ? (a.raceDistance === "ironman" || a.raceDistance === "70.3" ? 1.6 : 1.25) : s === "run" ? 1.05 : 0.9);
  const sum = weights.reduce((x,y) => x+y,0);
  // Allocate 5-minute increments without exceeding available minutes.
  const allocation = weights.map(w => Math.max(20,Math.floor(maxMinutes*w/sum/5)*5));
  while (allocation.reduce((x,y)=>x+y,0) > maxMinutes) {
    const i = allocation.indexOf(Math.max(...allocation));
    allocation[i] -= 5;
  }
  const sessions = sportOrder.slice(0,sessionCount).map((sport,i) => ({
    day: dayOrder[i], sport, minutes: allocation[i],
    objective: templates[sport].objective,
    structure: templates[sport].structure,
    rationale: decision.whyTodayMatters,
  }));
  const totalMinutes = sessions.reduce((x,s)=>x+s.minutes,0);
  if (decision.adaptation === "assess_first") warnings.push("Foundation-only provisional sessions pending baseline assessment");
  warnings.push("Prototype only: does not model doubles, progressive long-run limits, strength, travel, individual training history or detailed interval prescriptions");
  return { sessions, totalMinutes, availableMinutes, warnings, coachApprovalRequired: true };
}
