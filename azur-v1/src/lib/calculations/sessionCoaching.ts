import { normalizeWorkoutIntervals } from './workoutIntensity';

type Sport = 'bike' | 'run' | 'swim' | string;
type Input = {
  sport: Sport;
  steps?: unknown;
  ftpWatts?: number | null;
  sessionRpe?: number | null;
  completed?: boolean;
};

/** Describes only targets actually prescribed in the workout. No inferred readiness or threshold. */
export function sessionCoaching(input: Input): { execution: string; context: string } {
  const intervals = normalizeWorkoutIntervals(input.steps);
  const work = intervals.filter(step => step.kind === 'work');
  const recovery = intervals.filter(step => step.kind === 'recovery');
  const repeatCount = work.length;
  const explicitTargets = work.map(step => step.target).filter(target => target !== null);
  const sameTarget = explicitTargets.length === repeatCount && repeatCount > 0 &&
    explicitTargets.every(target => target?.metric === explicitTargets[0]?.metric &&
      target?.low === explicitTargets[0]?.low && target?.high === explicitTargets[0]?.high);
  const target = sameTarget ? explicitTargets[0] : null;
  const targetDescription = target?.metric === 'ftp_percent'
    ? `${target.low}–${target.high}% FTP`
    : target?.metric === 'rpe'
    ? `RPE ${target.low}–${target.high}/10`
    : target?.metric === 'heart_rate_bpm'
    ? `${target.low}–${target.high} bpm`
    : target?.metric === 'pace_sec_per_km'
    ? `${target.low}–${target.high} seconds/km`
    : target?.metric === 'swim_pace_sec_per_100m'
    ? `${target.low}–${target.high} seconds/100 m`
    : null;
  const structure = repeatCount > 1
    ? `This session contains ${repeatCount} work intervals${recovery.length ? ' with recovery between efforts' : ''}.`
    : repeatCount === 1 ? 'This session contains one prescribed work interval.' : 'Follow the workout structure shown in the Workout tab.';
  const execution = input.sport === 'bike'
    ? 'Aim for repeatable power or effort across the work intervals; avoid turning an aerobic session into a maximal test.'
    : input.sport === 'run'
    ? 'Aim for controlled pacing and consistent form rather than forcing faster splits.'
    : input.sport === 'swim'
    ? 'Keep stroke quality and breathing controlled as the set progresses; note when technique starts to deteriorate.'
    : 'Keep the effort aligned with the prescribed session and note any unexpected changes.';
  const ftpValid = typeof input.ftpWatts === 'number' && Number.isFinite(input.ftpWatts) &&
    input.ftpWatts >= 75 && input.ftpWatts <= 600;
  const power = target?.metric === 'ftp_percent'
    ? ftpValid
      ? `With recorded FTP ${input.ftpWatts} W, the prescribed range is approximately ${Math.round(input.ftpWatts! * target.low / 100)}–${Math.round(input.ftpWatts! * target.high / 100)} W; confirm your threshold is current.`
      : 'An FTP-based target is prescribed, but no validated FTP is available; confirm an appropriate effort target with your coach.'
    : '';
  const effort = input.completed && input.sessionRpe != null && Number.isFinite(input.sessionRpe) &&
    input.sessionRpe >= 1 && input.sessionRpe <= 10
    ? ` You reported RPE ${input.sessionRpe}/10. Compare that subjective effort with the session intention; unexpectedly high effort warrants coach review.`
    : '';
  return {
    execution: [structure, targetDescription ? `Work target: ${targetDescription}.` : '', execution].filter(Boolean).join(' '),
    context: [power, effort].filter(Boolean).join(' ') || 'Use the prescribed targets and record how the session felt. Device metrics and athlete feedback are considered separately; plan changes require coach approval.',
  };
}
