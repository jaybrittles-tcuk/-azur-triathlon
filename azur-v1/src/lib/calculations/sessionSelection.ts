/** AZUR session selection contract. Coach-authored sessions remain the source of truth.
 * This module ranks supplied library entries; it never manufactures prescriptions.
 */
export type SessionFamily = 'aerobic_endurance' | 'threshold' | 'vo2max' | 'strength_endurance' | 'race_specific' | 'recovery' | 'technique';
export type SessionEntry = {
  id: string; sport: 'bike' | 'run' | 'swim';
  family: SessionFamily;
  title: string;
  durationMin: number;
  level: 1 | 2 | 3;
  phases: Array<'base' | 'build' | 'peak' | 'taper' | 'recovery'>;
  prescription: unknown;
  approved: boolean;
};
export type SelectionContext = {
  sport: SessionEntry['sport'];
  family: SessionFamily;
  phase: SessionEntry['phases'][number];
  maxMinutes: number;
  maxLevel: 1 | 2 | 3;
  excludeIds?: readonly string[];
  recentIds?: readonly string[];
  rotationIndex?: number;
  /** Observed, consistent weekly training hours, not the athlete's stated availability. */
  recentWeeklyHours?: number | null;
  /** Validated benchmark confidence; unverified values must never unlock harder work. */
  benchmarksVerified?: boolean;
  /** Optional coach-established development ceiling, independent of available time. */
  demonstratedLevel?: 1 | 2 | 3;
  /** Sport-specific observed history; avoids using cycling fitness to justify hard running. */
  sportRecentWeeklyHours?: number | null;
  /** Explicit per-sport coach clearance; absence leaves existing selection behaviour unchanged. */
  sportClearedLevel?: 1 | 2 | 3;
  /** Recovery or illness concerns block demanding families until coach review. */
  recoveryConcern?: boolean;
};
export type SelectionResult =
  | { status: 'selected'; session: SessionEntry; explanation: string }
  | { status: 'unavailable'; reason: string };

export function selectCoachSession(library: readonly SessionEntry[], input: SelectionContext): SelectionResult {
  if (!Number.isFinite(input.maxMinutes) || input.maxMinutes <= 0) {
    return { status: 'unavailable', reason: 'Valid training availability required' };
  }
  const recent = input.recentWeeklyHours;
  if (recent != null && (!Number.isFinite(recent) || recent < 0 || recent > 35)) {
    return { status: 'unavailable', reason: 'Recent training history requires coach review' };
  }
  const sportRecent = input.sportRecentWeeklyHours;
  if (sportRecent != null && (!Number.isFinite(sportRecent) || sportRecent < 0 || sportRecent > 30)) {
    return { status: 'unavailable', reason: 'Sport-specific training history requires coach review' };
  }
  if (input.recoveryConcern && !['recovery', 'technique', 'aerobic_endurance'].includes(input.family)) {
    return { status: 'unavailable', reason: 'Demanding session requires coach clearance during recovery concern' };
  }
  // Evidence limits are ceilings, never reasons to intensify training.
  const historyLevel = recent == null ? 3 : recent < 4 ? 1 : recent < 8 ? 2 : 3;
  const verifiedLevel = input.benchmarksVerified === false ? 1 : 3;
  const sportHistoryLevel = sportRecent == null ? 3 : sportRecent < 1.5 ? 1 : sportRecent < 4 ? 2 : 3;
  const effectiveLevel = Math.min(input.maxLevel, input.demonstratedLevel ?? 3, input.sportClearedLevel ?? 3, historyLevel, sportHistoryLevel, verifiedLevel);
  const candidates = library.filter((session) =>
    session.approved && session.sport === input.sport &&
    session.family === input.family &&
    session.phases.includes(input.phase) &&
    Number.isFinite(session.durationMin) && session.durationMin > 0 &&
    session.durationMin <= input.maxMinutes &&
    session.level <= effectiveLevel &&
    !input.excludeIds?.includes(session.id) &&
    session.prescription != null
  );
  if (!candidates.length) {
    return { status: 'unavailable', reason: 'No approved coach-designed session fits these constraints' };
  }
  // Stay within the prescribed level and availability, prefer unfamiliar
  // workouts, and rotate equally suitable approved variations across weeks.
  const recentIds = new Set(input.recentIds ?? []);
  const ranked = [...candidates].sort((a, b) =>
    Number(recentIds.has(a.id)) - Number(recentIds.has(b.id)) ||
    b.level - a.level || b.durationMin - a.durationMin || a.id.localeCompare(b.id));
  const sameSuitability = ranked.filter(x =>
    recentIds.has(x.id) === recentIds.has(ranked[0].id) &&
    x.level === ranked[0].level && x.durationMin === ranked[0].durationMin);
  const rotation = Math.max(0,Math.floor(input.rotationIndex ?? 0));
  const chosen = sameSuitability[rotation % sameSuitability.length];
  return {
    status: 'selected',
    session: chosen,
    explanation: 'Approved session matched to sport, training focus, phase, available time and demonstrated training tolerance',
  };
}
