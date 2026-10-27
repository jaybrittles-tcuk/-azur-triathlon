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
  // Most appropriate difficulty, then closest duration to available time;
  // stable ID tie-break ensures repeatable selection.
  const ranked = [...candidates].sort((a, b) =>
    b.level - a.level || b.durationMin - a.durationMin || a.id.localeCompare(b.id));
  return {
    status: 'selected',
    session: ranked[0],
    explanation: 'Approved session matched to sport, training focus, phase, level and available time',
  };
}
