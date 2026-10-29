import { normalizeWorkoutIntervals } from './workoutIntensity.ts';

type Workout = { sport: string; prescription?: { azurWorkout?: { steps?: unknown } } | null };
export type PrescriptionAudit = { ready: boolean; reason: string; intervalCount: number };

/** A strict audit: a descriptive prescription must not be mistaken for numeric targets. */
export function auditPrescription(workout: Workout): PrescriptionAudit {
  const raw = workout.prescription?.azurWorkout?.steps;
  if (!Array.isArray(raw) || !raw.length) {
    return { ready: false, reason: 'Structured intervals missing', intervalCount: 0 };
  }
  const intervals = normalizeWorkoutIntervals(raw);
  if (!intervals.length || intervals.length >= 120) {
    return { ready: false, reason: 'Intervals missing or beyond supported limit', intervalCount: intervals.length };
  }
  if (intervals.some(step => step.durationSec === null)) {
    return { ready: false, reason: 'Explicit interval duration required', intervalCount: intervals.length };
  }
  const expected = workout.sport === 'bike' ? 'ftp_percent' :
    workout.sport === 'run' ? 'pace_sec_per_km' :
    workout.sport === 'swim' ? 'swim_pace_sec_per_100m' : null;
  if (!expected) return { ready: false, reason: 'Unsupported sport for stress estimate', intervalCount: intervals.length };
  if (intervals.some(step => step.target?.metric !== expected)) {
    return { ready: false, reason: `Numeric ${expected} targets required for every interval`, intervalCount: intervals.length };
  }
  return { ready: true, reason: 'Structured duration and intensity present', intervalCount: intervals.length };
}


/** Athlete-facing instruction completeness, separate from numeric stress-export readiness.
 * Descriptive effort is useful to read but never substituted for calibrated power/pace.
 */
export type InstructionGap = { section: string; block: number; missing: 'effort' | 'recovery' | 'duration_or_distance' };
export type InstructionAudit = { complete: boolean; gaps: InstructionGap[]; blockCount: number };
type LegacyBlock = Record<string, unknown>;
type InstructionPrescription = {
  warmup?: unknown; main_set?: unknown; cooldown?: unknown;
  azurWorkout?: { steps?: unknown };
};
const hasContent = (value: unknown) =>
  typeof value === 'number' ? Number.isFinite(value) : typeof value === 'string' ? value.trim().length > 0 : false;
export function auditAthleteInstructions(prescription: InstructionPrescription | null | undefined): InstructionAudit {
  const gaps: InstructionGap[] = [];
  let blockCount = 0;
  const sections: Array<[string, unknown]> = [
    ['warmup', prescription?.warmup], ['main_set', prescription?.main_set], ['cooldown', prescription?.cooldown],
  ];
  for (const [section, raw] of sections) {
    if (!Array.isArray(raw)) continue;
    raw.forEach((entry: unknown, index: number) => {
      if (!entry || typeof entry !== 'object') return;
      blockCount++;
      const block = entry as LegacyBlock;
      if (!['distance_m', 'duration_min', 'duration_sec'].some(k => hasContent(block[k])))
        gaps.push({section, block:index + 1, missing:'duration_or_distance'});
      if (!['target', 'pace', 'ftp_percent', 'rpe', 'cadence', 'targetLow'].some(k => hasContent(block[k])))
        gaps.push({section, block:index + 1, missing:'effort'});
      if (section === 'main_set' && typeof block.reps === 'number' && block.reps > 1 &&
        !['recovery_sec', 'recovery_min', 'rest_sec', 'rest_min'].some(k => hasContent(block[k])))
        gaps.push({section, block:index + 1, missing:'recovery'});
    });
  }
  const steps = prescription?.azurWorkout?.steps;
  if (blockCount === 0 && Array.isArray(steps)) {
    const visit = (entry: unknown, section: string, index: number) => {
      if (!entry || typeof entry !== 'object') return;
      const block = entry as LegacyBlock;
      if (block.type === 'repeat') {
        const reps = block.reps;
        visit(block.work,'main_set',index);
        if (typeof reps === 'number' && reps > 1 && !block.recovery)
          gaps.push({section:'main_set',block:index,missing:'recovery'});
        if (block.recovery) visit(block.recovery,'recovery',index);
        return;
      }
      blockCount++;
      if (!hasContent(block.durationMin) && !hasContent(block.distanceM))
        gaps.push({section,block:index,missing:'duration_or_distance'});
      if (!hasContent(block.targetLow) || !hasContent(block.targetHigh) || !hasContent(block.targetType))
        gaps.push({section,block:index,missing:'effort'});
    };
    steps.forEach((step:unknown,i:number)=>visit(step,'structured',i+1));
  }
  return {complete:blockCount>0 && gaps.length===0,gaps,blockCount};
}
