import { normalizeWorkoutIntervals } from './workoutIntensity.ts';

export type PlannedSwimStressResult =
  | { status: 'estimated'; points: number; method: 'css_pace_duration_proxy' }
  | { status: 'unavailable'; reason: string };

/**
 * Experimental swimming workload proxy from prescribed pace and athlete CSS.
 * Both values must be seconds per 100m. Not swim TSS, a physiological forecast,
 * or interchangeable with bike/run proxy points.
 *
 * Recovery steps require explicit pace: resting with no swimming pace is not
 * silently scored at CSS. Distance-only sets cannot supply elapsed effort time.
 */
export function estimatePlannedSwimStress(
  prescription: { azurWorkout?: { steps?: unknown } } | null | undefined,
  cssSecPer100m: number | null | undefined,
): PlannedSwimStressResult {
  if (typeof cssSecPer100m !== 'number' ||
    !Number.isFinite(cssSecPer100m) ||
    cssSecPer100m < 45 || cssSecPer100m > 240) {
    return { status: 'unavailable', reason: 'Valid athlete CSS pace required (seconds/100m)' };
  }
  const steps = normalizeWorkoutIntervals(prescription?.azurWorkout?.steps);
  if (!steps.length || steps.length > 120 ||
    steps.some(step => !step.durationSec || step.target?.metric !== 'swim_pace_sec_per_100m')) {
    return { status: 'unavailable', reason: 'All intervals need timed swim pace targets, including recoveries' };
  }
  const totalSec = steps.reduce((sum, step) => sum + (step.durationSec ?? 0), 0);
  if (totalSec <= 0 || totalSec > 86400) {
    return { status: 'unavailable', reason: 'Invalid total swimming duration' };
  }
  const points = steps.reduce((sum, step) => {
    const target = step.target!;
    const pace = (target.low + target.high) / 2;
    const relativeSpeed = cssSecPer100m / pace;
    return sum + ((step.durationSec ?? 0) / 3600) * relativeSpeed ** 2 * 100;
  }, 0);
  if (!Number.isFinite(points) || points > 1500) {
    return { status: 'unavailable', reason: 'Implausible prescribed swimming workload' };
  }
  return { status: 'estimated', points: Math.round(points * 10) / 10, method: 'css_pace_duration_proxy' };
}
