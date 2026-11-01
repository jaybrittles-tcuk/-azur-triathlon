/**
 * Read-only historical training baseline. This module does not fetch provider data,
 * accept activities, or approve training load.
 *
 * A zero-stress day is only a rest day when coverage is explicitly confirmed.
 * Missing days must never be silently converted to zero training.
 */
export const DEFAULT_HISTORY_DAYS = 90;
export type HistoryDay = {
  date: string; // UTC YYYY-MM-DD
  coverage: 'confirmed' | 'missing';
  stress?: number; // only approved/eligible, deduplicated stress
};
export type BaselineAssessment = {
  status: 'ready' | 'limited' | 'insufficient';
  windowDays: number;
  observedDays: number;
  missingDays: number;
  coveragePercent: number;
  fitness: number | null;
  fatigue: number | null;
  form: number | null;
  warnings: string[];
};
function isoUTC(d: Date) { return d.toISOString().slice(0, 10); }
export function assessHistoryBaseline(
  history: HistoryDay[],
  asOfDate: string,
  windowDays = DEFAULT_HISTORY_DAYS,
): BaselineAssessment {
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 366)
    throw new Error('Invalid history window');
  const asOf = new Date(asOfDate + 'T00:00:00.000Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) || Number.isNaN(asOf.getTime()) || isoUTC(asOf) !== asOfDate)
    throw new Error('Invalid assessment date');
  const byDate = new Map<string, HistoryDay>();
  for (const day of history) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date) || Number.isNaN(Date.parse(day.date + 'T00:00:00Z')) ||
        isoUTC(new Date(day.date + 'T00:00:00Z')) !== day.date || byDate.has(day.date))
      throw new Error('Invalid or duplicate history date');
    if (day.coverage !== 'confirmed' && day.coverage !== 'missing')
      throw new Error('Invalid coverage');
    if (day.coverage === 'confirmed' && (typeof day.stress !== 'number' || !Number.isFinite(day.stress) || day.stress < 0))
      throw new Error('Confirmed days require valid approved stress (zero is permitted)');
    if (day.coverage === 'missing' && day.stress !== undefined)
      throw new Error('Missing days cannot carry stress');
    byDate.set(day.date, day);
  }
  const days: (HistoryDay | undefined)[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const date = new Date(asOf.getTime() - i * 86400000);
    days.push(byDate.get(isoUTC(date)));
  }
  const confirmed = days.filter((d) => d?.coverage === 'confirmed') as HistoryDay[];
  const observedDays = confirmed.length;
  const missingDays = windowDays - observedDays;
  const coveragePercent = Math.round(100 * observedDays / windowDays);
  const warnings: string[] = [];
  if (missingDays) warnings.push('Training history is incomplete; unknown days are not rest days.');
  // Demand enough early history to reduce initialization bias, plus continuous recent coverage.
  const early = days.slice(0, Math.min(28, windowDays));
  const recent = days.slice(-Math.min(14, windowDays));
  const earlyCount = early.filter(d => d?.coverage === 'confirmed').length;
  const recentCount = recent.filter(d => d?.coverage === 'confirmed').length;
  const complete = missingDays === 0;
  const adequate = windowDays >= 56 && coveragePercent >= 90 &&
    earlyCount >= 24 && recentCount === 14;
  if (!adequate && !complete) warnings.push('Baseline withheld until reliable coverage is available.');
  if (windowDays < 56) warnings.push('Short histories have greater fitness initialization uncertainty.');
  // Never pretend the data are complete: no extrapolation or unverified zero-fill.
  if (!complete) return {
    status: adequate ? 'limited' : 'insufficient',
    windowDays, observedDays, missingDays, coveragePercent,
    fitness: null, fatigue: null, form: null, warnings,
  };
  const stress = confirmed.map(d => d.stress!);
  // First 14 confirmed days initialize the exponentially weighted load estimate.
  const seedLength = Math.min(14, stress.length);
  const seed = stress.slice(0, seedLength).reduce((a,b) => a+b, 0) / seedLength;
  let fitness = seed, fatigue = seed;
  for (const load of stress) {
    fitness += (load - fitness) / 42;
    fatigue += (load - fatigue) / 7;
  }
  const round = (n:number) => Math.round(n * 10) / 10;
  return {
    status: windowDays >= 56 ? 'ready' : 'limited',
    windowDays, observedDays, missingDays, coveragePercent,
    fitness: round(fitness), fatigue: round(fatigue), form: round(fitness - fatigue), warnings,
  };
}
