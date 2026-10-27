import { normalizeWorkoutIntervals } from './workoutIntensity.ts';

type PlannedWorkout = {
  sport: string;
  prescription?: { azurWorkout?: { steps?: unknown } } | null;
};
export type PlannedStressResult =
  | { status: 'estimated'; points: number; method: 'ftp_duration_proxy' }
  | { status: 'unavailable'; reason: string };

/** Power-duration stress proxy: sum(hours × (%FTP / 100)^2 × 100).
 * Not Normalized Power TSS, not calibrated across sports, and not a recovery forecast.
 * A valid numeric FTP percent target is required for EVERY timed interval.
 */
export function estimatePlannedStress(session: PlannedWorkout): PlannedStressResult {
  if (session.sport !== 'bike') return { status: 'unavailable', reason: 'Sport-specific intensity calibration needed' };
  const steps = normalizeWorkoutIntervals(session.prescription?.azurWorkout?.steps);
  if (!steps.length || steps.some((step) => step.durationSec === null || step.target?.metric !== 'ftp_percent')) {
    return { status: 'unavailable', reason: 'Complete timed FTP intensity targets required' };
  }
  // Reject incomplete/oversized sessions rather than assigning implausible stress.
  if (steps.length > 120 || steps.some((step) => (step.durationSec ?? 0) <= 0)) {
    return { status: 'unavailable', reason: 'Invalid workout duration or interval count' };
  }
  const minutes = steps.reduce((sum, step) => sum + (step.durationSec ?? 0) / 60, 0);
  if (minutes <= 0 || minutes > 1440) return { status: 'unavailable', reason: 'Valid duration required' };
  const points = steps.reduce((sum, step) => {
    const target = step.target!;
    const fraction = ((target.low + target.high) / 2) / 100;
    return sum + ((step.durationSec ?? 0) / 3600) * fraction * fraction * 100;
  }, 0);
  if (!Number.isFinite(points) || points > 1500) return { status: 'unavailable', reason: 'Implausible calculated stress' };
  return { status: 'estimated', points: Math.round(points * 10) / 10, method: 'ftp_duration_proxy' };
}
