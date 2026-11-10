/** Adapter between AZUR coaching decisions and the existing approved-session selector.
 * No workout is invented, persisted or published here.
 */
import { evaluateCoachingDecision, type AthleteContext, type Discipline } from "../coachingIntelligence.ts";
import { selectCoachSession, type SessionEntry, type SessionFamily, type SelectionResult } from "./sessionSelection.ts";
export interface CoachingSelection {
  decision: ReturnType<typeof evaluateCoachingDecision>;
  selection: SelectionResult;
  requiresCoachReview: boolean;
}
export function selectSessionWithCoachingIntelligence(
  library: readonly SessionEntry[],
  athlete: AthleteContext,
  sport: Discipline,
  family: SessionFamily,
  maxMinutes: number,
  maxLevel: 1 | 2 | 3,
  recentIds: readonly string[] = [],
): CoachingSelection {
  const decision = evaluateCoachingDecision(athlete);
  if (decision.adaptation === "reduce_and_review") {
    return { decision, selection: { status: "unavailable", reason: "Athlete fatigue or health concern requires coach review before session selection" }, requiresCoachReview: true };
  }
  const phase = athlete.phase === "foundation" ? "base" : athlete.phase === "race_specific" ? "peak" : athlete.phase;
  // The approved library uses base/build/peak/taper/recovery phases.
  const selection = selectCoachSession(library, {
    sport, family, phase, maxMinutes,
    maxLevel: decision.adaptation === "assess_first" ? 1 : maxLevel,
    recentIds,
  });
  return { decision, selection, requiresCoachReview: decision.coachApprovalRequired || selection.status === "unavailable" || decision.adaptation === "assess_first" };
}
