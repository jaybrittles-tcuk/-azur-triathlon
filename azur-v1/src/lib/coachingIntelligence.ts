/**
 * AZUR Coaching Intelligence Framework v0.1.
 * Original, conservative decision support informed by published coaching principles.
 * No proprietary plans are reproduced. This module DOES NOT publish or change workouts.
 */
export type RaceDistance = "sprint" | "olympic" | "70.3" | "ironman";
export type Discipline = "swim" | "bike" | "run";
export type Phase = "foundation" | "base" | "build" | "race_specific" | "taper";
export type Confidence = "high" | "medium" | "low" | "unknown";
export type Adaptation = "maintain" | "consider_progression" | "reduce_and_review" | "assess_first";
export interface AthleteContext {
  raceDistance: RaceDistance;
  phase: Phase;
  weeklyAvailableHours: number;
  recentConsistentWeeks?: number;
  completedSessionsLast14Days?: number;
  plannedSessionsLast14Days?: number;
  reportedFatigue?: number; // 1 fresh, 10 exhausted
  injuryOrIllnessConcern?: boolean;
  knownThresholds?: Partial<Record<Discipline, { confidence: Confidence; measuredAt?: string }>>;
  limiter?: Discipline;
}
export interface CoachingDecision {
  adaptation: Adaptation;
  primaryObjective: string;
  secondaryObjective: string;
  intensityGuidance: string;
  whyTodayMatters: string;
  evidence: string[];
  missingData: string[];
  coachApprovalRequired: boolean;
}
const raceObjectives: Record<RaceDistance, [string,string]> = {
  sprint: ["Aerobic power and sustainable high-intensity performance", "Efficient transitions and race-pace execution"],
  olympic: ["Threshold durability and sustainable aerobic speed", "Pacing across all three disciplines"],
  "70.3": ["Aerobic durability and sustainable bike-to-run execution", "Fuelling and race-specific pacing"],
  ironman: ["Long-duration aerobic durability and energy management", "Fuelling, pacing discipline and run preservation"],
};
const phaseGuidance: Record<Phase,string> = {
  foundation: "Prioritise manageable consistency, basic skills and repeatable aerobic work.",
  base: "Build sustainable aerobic volume with limited, appropriate quality.",
  build: "Progress the athlete's verified limiter while protecting recovery.",
  race_specific: "Practise event-specific intensity, pacing and nutrition within proven training tolerance.",
  taper: "Maintain familiarity with race intensity while reducing fatigue and overall volume.",
};
export function evaluateCoachingDecision(a: AthleteContext): CoachingDecision {
  if (!Number.isFinite(a.weeklyAvailableHours) || a.weeklyAvailableHours <= 0 || a.weeklyAvailableHours > 60) {
    throw new Error("weeklyAvailableHours must be a realistic positive number");
  }
  const evidence: string[] = [];
  const missingData: string[] = [];
  const [primary, secondary] = raceObjectives[a.raceDistance];
  const weeks = a.recentConsistentWeeks;
  if (weeks === undefined) missingData.push("Recent consistent training weeks");
  else evidence.push(`${weeks} recent consistent weeks reported`);
  if (a.reportedFatigue === undefined) missingData.push("Athlete-reported fatigue");
  else if (!Number.isFinite(a.reportedFatigue) || a.reportedFatigue < 1 || a.reportedFatigue > 10) throw new Error("Fatigue must be 1–10");
  else evidence.push(`Reported fatigue ${a.reportedFatigue}/10`);
  let completion: number | undefined;
  if (a.completedSessionsLast14Days !== undefined && a.plannedSessionsLast14Days !== undefined) {
    if (!Number.isInteger(a.completedSessionsLast14Days) || !Number.isInteger(a.plannedSessionsLast14Days) || a.plannedSessionsLast14Days < 0 || a.completedSessionsLast14Days < 0 || a.completedSessionsLast14Days > a.plannedSessionsLast14Days) throw new Error("Invalid session completion counts");
    if (a.plannedSessionsLast14Days > 0) {
      completion = a.completedSessionsLast14Days / a.plannedSessionsLast14Days;
      evidence.push(`14-day session completion ${Math.round(completion*100)}%`);
    } else missingData.push("Recent planned sessions");
  } else missingData.push("Recent session completion");
  if (!a.knownThresholds?.[a.limiter ?? "bike"]) missingData.push("Validated threshold for priority discipline");
  let adaptation: Adaptation = "maintain";
  if (a.injuryOrIllnessConcern || (a.reportedFatigue !== undefined && a.reportedFatigue >= 8)) {
    adaptation = "reduce_and_review";
    evidence.push("Health concern or high reported fatigue: do not progress load");
  } else if (weeks === undefined || completion === undefined || a.reportedFatigue === undefined) {
    adaptation = "assess_first";
  } else if (weeks >= 3 && completion >= 0.85 && a.reportedFatigue <= 4 && a.phase !== "taper") {
    adaptation = "consider_progression";
  }
  const limiter = a.limiter ? ` with an emphasis on ${a.limiter}` : "";
  const whyTodayMatters = adaptation === "reduce_and_review"
    ? "Today's priority is protecting health and recovery; further load should be reviewed before proceeding."
    : `This training supports ${primary.toLowerCase()}${limiter}. ${phaseGuidance[a.phase]}`;
  const intensityGuidance = a.knownThresholds?.[a.limiter ?? "bike"]?.confidence === "high"
    ? "Use the athlete's validated individual zones and confirm with perceived effort."
    : "Use conservative talk-test and perceived-effort guidance until appropriate thresholds are validated.";
  return {
    adaptation, primaryObjective: primary, secondaryObjective: secondary,
    intensityGuidance, whyTodayMatters, evidence, missingData,
    coachApprovalRequired: adaptation === "reduce_and_review" || adaptation === "consider_progression",
  };
}
