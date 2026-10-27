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
