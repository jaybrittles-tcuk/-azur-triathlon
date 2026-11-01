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
};
export type SelectionResult =
  | { status: 'selected'; session: SessionEntry; explanation: string }
  | { status: 'unavailable'; reason: string };

export function selectCoachSession(library: readonly SessionEntry[], input: SelectionContext): SelectionResult {
  if (!Number.isFinite(input.maxMinutes) || input.maxMinutes <= 0) {
    return { status: 'unavailable', reason: 'Valid training availability required' };
  }
  const candidates = library.filter((session) =>
    session.approved && session.sport === input.sport &&
    session.family === input.family &&
    session.phases.includes(input.phase) &&
    Number.isFinite(session.durationMin) && session.durationMin > 0 &&
    session.durationMin <= input.maxMinutes &&
    session.level <= input.maxLevel &&
    !input.excludeIds?.includes(session.id) &&
    session.prescription != null
  );
  if (!candidates.length) {
    return { status: 'unavailable', reason: 'No approved coach-designed session fits these constraints' };
  }
  // Stay within the prescribed level and availability, prefer unfamiliar
  // workouts, and rotate equally suitable approved variations across weeks.
  const recent = new Set(input.recentIds ?? []);
  const ranked = [...candidates].sort((a, b) =>
    Number(recent.has(a.id)) - Number(recent.has(b.id)) ||
    b.level - a.level || b.durationMin - a.durationMin || a.id.localeCompare(b.id));
  const sameSuitability = ranked.filter(x =>
    recent.has(x.id) === recent.has(ranked[0].id) &&
    x.level === ranked[0].level && x.durationMin === ranked[0].durationMin);
  const rotation = Math.max(0,Math.floor(input.rotationIndex ?? 0));
  const chosen = sameSuitability[rotation % sameSuitability.length];
  return {
    status: 'selected',
    session: chosen,
    explanation: 'Approved session matched to sport, training focus, phase, level and available time',
  };
}
