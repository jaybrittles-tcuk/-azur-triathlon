import { normalizeWorkoutIntervals } from './workoutIntensity.ts';

export type PlannedRunStressResult =
  | { status: 'estimated'; points: number; method: 'threshold_pace_duration_proxy' }
  | { status: 'unavailable'; reason: string };

/**
 * Experimental running workload proxy using explicit pace targets and athlete
 * threshold pace, both in seconds/km. This is NOT rTSS, injury risk or TSB.
 * Point scales are not directly comparable with cycling FTP proxy points.
 */
export function estimatePlannedRunStress(
  prescription: { azurWorkout?: { steps?: unknown } } | null | undefined,
  thresholdPaceSecPerKm: number | null | undefined,
): PlannedRunStressResult {
  if (typeof thresholdPaceSecPerKm !== 'number' ||
      !Number.isFinite(thresholdPaceSecPerKm) ||
      thresholdPaceSecPerKm < 120 || thresholdPaceSecPerKm > 900) {
    return { status: 'unavailable', reason: 'Valid athlete run threshold pace required' };
  }
  const intervals = normalizeWorkoutIntervals(prescription?.azurWorkout?.steps);
  if (!intervals.length || intervals.length > 120 ||
      intervals.some(step => !step.durationSec || step.target?.metric !== 'pace_sec_per_km')) {
    return { status: 'unavailable', reason: 'Fully timed running pace targets required' };
  }
  const totalSec = intervals.reduce((sum, step) => sum + (step.durationSec ?? 0), 0);
  if (totalSec <= 0 || totalSec > 86400) {
    return { status: 'unavailable', reason: 'Invalid total workout duration' };
  }
  const points = intervals.reduce((sum, step) => {
    const target = step.target!;
    // Midpoint of prescribed pace range, not a measured pace.
    const pace = (target.low + target.high) / 2;
    const relativeSpeed = thresholdPaceSecPerKm / pace;
    return sum + ((step.durationSec ?? 0) / 3600) * relativeSpeed ** 2 * 100;
  }, 0);
  if (!Number.isFinite(points) || points > 1500) {
    return { status: 'unavailable', reason: 'Implausible prescribed running workload' };
  }
  return { status: 'estimated', points: Math.round(points * 10) / 10, method: 'threshold_pace_duration_proxy' };
}
