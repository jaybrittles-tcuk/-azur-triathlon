/**
 * Synthetic 12-week validation harness, not an athlete-facing plan.
 * Generates phase-aware session descriptions for coach review.
 * No production writes, no inferred FTP/CSS or automatic intensity progression.
 */
import { buildSyntheticWeek, type Experience, type SyntheticWeek } from "./syntheticWeekPlanner.ts";
import type { AthleteContext, Phase, RaceDistance } from "./coachingIntelligence.ts";
export interface SimulatedWeek extends SyntheticWeek {
  week: number; phase: Phase; targetHours: number; scenario: "normal" | "missed_sessions" | "high_fatigue";
}
const phaseForWeek = (week: number): Phase =>
  week <= 2 ? "foundation" : week <= 5 ? "base" : week <= 9 ? "build" : week <= 11 ? "race_specific" : "taper";
const disciplineMainSet = {
  swim: {
    foundation: "Warm up easily; 6 x 50 m relaxed technique-to-full-stroke practice with ample rest; 4 x 100 m smooth aerobic swimming; cool down.",
    base: "Warm up; 6 x 100 m controlled aerobic repeats with 20–30 sec rest; 4 x 50 m smooth technique; cool down.",
    build: "Warm up; 3 x 200 m controlled steady repeats with 30 sec rest; 4 x 50 m relaxed form; cool down.",
    race_specific: "Warm up; 2 x 300 m even-paced swimming with 45 sec rest; 4 x 50 m controlled starts; cool down.",
    taper: "Short easy warm-up; 4 x 100 m relaxed race-rhythm practice with full recovery; cool down.",
  },
  bike: {
    foundation: "15 min easy warm-up; comfortable conversational aerobic riding; 10 min easy cool-down.",
    base: "15 min progressive warm-up; 3 x 8 min steady aerobic riding with 3 min easy between; cool down.",
    build: "15 min warm-up; 4 x 6 min controlled tempo with 3 min easy between only if validated and tolerated; cool down.",
    race_specific: "15 min warm-up; 3 x 10 min controlled race-specific effort with 5 min easy between, subject to validated targets; cool down.",
    taper: "Easy warm-up; 3 x 3 min familiar controlled race effort with generous easy recovery; cool down.",
  },
  run: {
    foundation: "10 min easy warm-up; relaxed talk-test run or run/walk; 5–10 min easy cool-down.",
    base: "10 min easy warm-up; 3 x 6 min steady conversational running with 2 min easy between; cool down.",
    build: "15 min easy warm-up; 4 x 4 min controlled steady effort with 2 min jog recovery, only if run tolerance supports it; cool down.",
    race_specific: "15 min warm-up; 3 x 8 min sustainable race-specific rhythm with 3 min easy between; cool down.",
    taper: "Easy warm-up; 4 x 2 min relaxed race rhythm with full recovery; cool down.",
  },
};
export function simulateProgramme(input: AthleteContext, experience: Experience, scenario: "normal" | "missed_sessions" | "high_fatigue" = "normal"): SimulatedWeek[] {
  const weeks: SimulatedWeek[] = [];
  const baselineHours = input.weeklyAvailableHours;
  for (let week = 1; week <= 12; week++) {
    const phase = phaseForWeek(week);
    const isRecoveryWeek = week === 4 || week === 8;
    const taper = week === 12;
    // Do not infer fitness improvement: all weeks remain within the declared budget.
    const factor = taper ? 0.65 : isRecoveryWeek ? 0.8 : 1;
    const fatigue = scenario === "high_fatigue" && week === 6 ? 9 : input.reportedFatigue;
    const missed = scenario === "missed_sessions" && week === 5;
    const context: AthleteContext = {
      ...input, phase, weeklyAvailableHours: Math.max(0.1, baselineHours * factor),
      reportedFatigue: fatigue,
      completedSessionsLast14Days: missed ? 4 : input.completedSessionsLast14Days,
      plannedSessionsLast14Days: missed ? 10 : input.plannedSessionsLast14Days,
    };
    const plan = buildSyntheticWeek(context, experience);
    const sessions = plan.sessions.map(session => {
      if (session.sport === "rest" || session.sport === "strength") return session;
      const structure = disciplineMainSet[session.sport][phase];
      return { ...session, structure: session.minutes < 40
        ? `Short-session adaptation required: ${structure} Scale repetitions to ${session.minutes} minutes without removing warm-up or cool-down.`
        : structure,
        rationale: `${session.rationale} Week ${week} of 12; ${isRecoveryWeek ? "recovery emphasis" : taper ? "taper emphasis" : phase.replace("_"," ")}.`,
      };
    });
    weeks.push({ ...plan, sessions, week, phase, targetHours: context.weeklyAvailableHours, scenario });
  }
  return weeks;
}
export function validationMatrix() {
  const distances: RaceDistance[] = ["sprint","olympic","70.3","ironman"];
  const levels: { experience: Experience; hours: number }[] = [
    {experience:"beginner",hours:5},{experience:"intermediate",hours:9},{experience:"advanced",hours:14},
  ];
  return distances.flatMap(raceDistance => levels.map(({experience,hours}) => ({
    raceDistance, experience,
    weeks: simulateProgramme({raceDistance,phase:"foundation",weeklyAvailableHours:hours,
      recentConsistentWeeks:experience==="beginner"?1:6,
      completedSessionsLast14Days:experience==="beginner"?6:12,
      plannedSessionsLast14Days:experience==="beginner"?8:13,
      reportedFatigue:4},experience),
  })));
}
