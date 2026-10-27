/** Canonical, unit-explicit workout targets for future calendar charts and device export. */
export type IntensityTarget =
  | { metric: 'ftp_percent'; low: number; high: number; unit: '%FTP' }
  | { metric: 'heart_rate_bpm'; low: number; high: number; unit: 'bpm' }
  | { metric: 'pace_sec_per_km'; low: number; high: number; unit: 's/km' }
  | { metric: 'swim_pace_sec_per_100m'; low: number; high: number; unit: 's/100m' }
  | { metric: 'rpe'; low: number; high: number; unit: '/10' };

export type WorkoutInterval = {
  kind: 'warmup' | 'work' | 'recovery' | 'cooldown';
  durationSec: number | null;
  distanceM: number | null;
  target: IntensityTarget | null;
};

type RawStep = Record<string, unknown>;
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const range = (low: unknown, high: unknown) => {
  const a = number(low);
  const b = number(high);
  return a !== null && b !== null && a >= 0 && b >= a ? [a, b] as const : null;
};

/** Does not infer intensity from workout class, free text, or missing fields. */
export function normalizeIntensityTarget(step: RawStep): IntensityTarget | null {
  const metric = step.targetType;
  const values = range(step.targetLow, step.targetHigh);
  if (!values) return null;
  const [low, high] = values;
  if (metric === 'ftp' && high <= 300) return { metric: 'ftp_percent', low, high, unit: '%FTP' };
  if (metric === 'hr' && high <= 250) return { metric: 'heart_rate_bpm', low, high, unit: 'bpm' };
  if (metric === 'pace' && low > 0) return { metric: 'pace_sec_per_km', low, high, unit: 's/km' };
  if (metric === 'swim_pace' && low > 0) return { metric: 'swim_pace_sec_per_100m', low, high, unit: 's/100m' };
  if (metric === 'rpe' && high <= 10) return { metric: 'rpe', low, high, unit: '/10' };
  return null;
}

/** Expand repeat steps, preserving explicit data and never synthesizing unknown durations. */
export function normalizeWorkoutIntervals(steps: unknown): WorkoutInterval[] {
  if (!Array.isArray(steps)) return [];
  const result: WorkoutInterval[] = [];
  function visit(raw: unknown, depth: number) {
    if (!raw || typeof raw !== 'object' || depth > 3 || result.length >= 120) return;
    const step = raw as RawStep;
    if (step.type === 'repeat') {
      const reps = number(step.reps);
      if (!reps || !Number.isInteger(reps) || reps > 30) return;
      for (let i = 0; i < reps && result.length < 120; i++) {
        visit(step.work, depth + 1);
        if (i < reps - 1) visit(step.recovery, depth + 1);
      }
      return;
    }
    if (!['warmup','work','recovery','cooldown'].includes(String(step.type))) return;
    const duration = number(step.durationMin);
    const distance = number(step.distanceM);
    result.push({
      kind: step.type as WorkoutInterval['kind'],
      durationSec: duration !== null && duration > 0 ? Math.round(duration * 60) : null,
      distanceM: distance !== null && distance > 0 ? distance : null,
      target: normalizeIntensityTarget(step),
    });
  }
  steps.forEach(step => visit(step, 0));
  return result;
}
