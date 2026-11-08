import { normalizeWorkoutIntervals } from './workoutIntensity';

type Sport = 'bike' | 'run' | 'swim' | string;
type Input = {
  sport: Sport;
  steps?: unknown;
  ftpWatts?: number | null;
  sessionRpe?: number | null;
  completed?: boolean;
  focus?: string | null;
  raceName?: string | null;
  raceDate?: string | null;
  plannedDate?: string | null;
};

/** Describes only targets actually prescribed in the workout. No inferred readiness or threshold. */
export function sessionCoaching(input: Input): { execution: string; context: string } {
  const intervals = normalizeWorkoutIntervals(input.steps);
  const work = intervals.filter(step => step.kind === 'work');
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
  const execution = input.sport === 'bike'
    ? 'Keep power or effort steady; avoid chasing maximum numbers.'
    : input.sport === 'run'
    ? 'Keep breathing relaxed and your stride comfortable; walk when needed.'
    : input.sport === 'swim'
    ? 'Keep breathing and stroke quality controlled through each effort.'
    : 'Keep the effort controlled and follow the workout instructions.';
  const ftpValid = typeof input.ftpWatts === 'number' && Number.isFinite(input.ftpWatts) &&
    input.ftpWatts >= 75 && input.ftpWatts <= 600;
  const power = target?.metric === 'ftp_percent'
    ? ftpValid
      ? `With recorded FTP ${input.ftpWatts} W, the prescribed range is approximately ${Math.round(input.ftpWatts! * target.low / 100)}–${Math.round(input.ftpWatts! * target.high / 100)} W; confirm your threshold is current.`
      : 'Your workout uses FTP targets. Ask your coach to confirm your current FTP before relying on wattage guidance.'
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
  const raceDate = typeof input.raceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.raceDate)
    ? Date.parse(input.raceDate + 'T12:00:00Z') : NaN;
  const plannedDate = typeof input.plannedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.plannedDate)
    ? Date.parse(input.plannedDate + 'T12:00:00Z') : NaN;
  const daysToRace = Number.isFinite(raceDate) && Number.isFinite(plannedDate)
    ? Math.round((raceDate - plannedDate) / 86400000) : null;
  const raceContext = daysToRace !== null && daysToRace >= 0 && daysToRace <= 730
    ? `Your recorded priority race${input.raceName?.trim() ? ` (${input.raceName.trim()})` : ''} is ${daysToRace === 0 ? 'today' : `in ${daysToRace} days`}. This workout contributes to your training programme, but its specific race-phase purpose requires a confirmed phase and athlete assessment.`
    : '';
  const missingTarget = work.length > 0 && explicitTargets.length === 0
    ? 'Follow the written effort guidance in your workout. If a target is unclear, check with your coach.'
    : work.length > 0 && explicitTargets.length < work.length
    ? 'Targets can vary within this workout. Follow the instructions for each part rather than using the same effort throughout.'
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
    execution: [targetDescription ? `Target: ${targetDescription}.` : '', execution].filter(Boolean).join(' '),
    context: [raceContext, power, missingFtp, missingTarget, response, feedbackPrompt, sportGuidance].filter(Boolean).join(' ') + ' Significant plan changes require coach approval.',
  };
}
