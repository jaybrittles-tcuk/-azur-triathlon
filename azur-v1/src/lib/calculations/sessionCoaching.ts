import { normalizeWorkoutIntervals } from './workoutIntensity';

type Sport = 'bike' | 'run' | 'swim' | string;
type Input = {
  sport: Sport;
  steps?: unknown;
  ftpWatts?: number | null;
  sessionRpe?: number | null;
  completed?: boolean;
  focus?: string | null;
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
    ? `The structured prescription contains ${repeatCount} work intervals${recovery.length ? ' with recovery between efforts' : ''}.`
    : 'Use the full workout instructions for the session structure; the available structured data does not confirm a complete repeat count.';
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
  const rpe = input.completed && input.sessionRpe != null && Number.isFinite(input.sessionRpe) &&
    input.sessionRpe >= 1 && input.sessionRpe <= 10 ? input.sessionRpe : null;
  const expectedRpe = target?.metric === 'rpe' ? target : null;
  const response = rpe === null ? ''
    : expectedRpe && rpe > expectedRpe.high + 1
    ? `You reported RPE ${rpe}/10 against prescribed RPE ${expectedRpe.low}–${expectedRpe.high}/10. That gap deserves coach review before progressing intensity; it does not diagnose fatigue.`
    : expectedRpe
    ? `You reported RPE ${rpe}/10 against prescribed RPE ${expectedRpe.low}–${expectedRpe.high}/10. Review the difference with your coach alongside the completed session.`
    : `You reported RPE ${rpe}/10. The workout has no uniform explicit RPE target for a direct comparison.`;
  const explicitFocus = typeof input.focus === 'string' && input.focus.trim().length > 0 ? input.focus.trim() : null;
  const missingTarget = work.length > 0 && explicitTargets.length === 0
    ? 'No machine-readable intensity target is attached to the work intervals. Follow the coach-written prescription; do not infer a pace, wattage or heart-rate zone.'
    : work.length > 0 && explicitTargets.length < work.length
    ? 'Only some work intervals contain structured targets. Check the full workout instructions rather than applying one target to every repeat.'
    : '';
  const missingFtp = target?.metric === 'ftp_percent' && !ftpValid
    ? 'Ask your coach to confirm your current FTP before using a wattage conversion.' : '';
  const feedbackPrompt = input.completed && rpe === null
    ? 'If you have not yet recorded session RPE, add it so your coach can compare the planned session with your experience.'
    : '';
  const sportGuidance = input.sport === 'bike'
    ? 'After riding, note whether power or perceived effort stayed consistent across repeats. If the same target becomes unexpectedly harder, flag it before the next quality ride.'
    : input.sport === 'run'
    ? 'After running, note whether breathing and form remained controlled at the prescribed effort. If easy running felt unusually demanding, flag it before increasing pace or volume.'
    : input.sport === 'swim'
    ? 'After swimming, note whether breathing, body position and stroke quality stayed consistent. If technique broke down, tell your coach which part of the set was affected before progressing the session.'
    : 'Record whether the prescribed effort was sustainable and flag unexpected difficulty to your coach.';
  return {
    execution: [structure, targetDescription ? `Work target: ${targetDescription}.` : '', execution].filter(Boolean).join(' '),
    context: [explicitFocus ? `Coach-prescribed focus: ${explicitFocus}.` : '', power, missingFtp, missingTarget, response, feedbackPrompt, sportGuidance].filter(Boolean).join(' ') + ' Significant plan changes require coach approval.',
  };
}
