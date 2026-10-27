import { allBikeWorkouts } from '../../domain/bikeWorkoutCatalog.ts';
import { validateWorkout, workoutMinutes } from '../../domain/bikeWorkoutLibrary.ts';
import type { BikeDraftPreview } from './bikeDraftPreview.ts';
import { normalizeWorkoutIntervals } from './workoutIntensity.ts';

/** Pure representation of a coach-approved workout for planned_session.prescription.
 * Keep source %FTP targets unchanged; watt rounding is for display only.
 */
export function createLibraryBikePrescription(draft: BikeDraftPreview, ftpWatts: number) {
  if (!Number.isFinite(ftpWatts) || ftpWatts <= 0) throw new Error('Valid FTP required');
  const source = allBikeWorkouts.find(w => w.id === draft.workoutId && w.version === draft.version);
  if (!source || validateWorkout(source).length || workoutMinutes(source) !== draft.durationMin)
    throw new Error('Source workout does not match approved draft');
  const steady = (step: Extract<typeof source.steps[number], {kind:'steady'}>, type:'work'|'warmup'|'cooldown'|'recovery')=>({
    type, durationMin: step.minutes, targetType:'ftp' as const,
    targetLow: step.minFtpPct, targetHigh: step.maxFtpPct,
    targetText:step.label, ...(step.cadenceRpm ? {cadenceRpm:step.cadenceRpm}:{}),
  });
  const steps = source.steps.map(step => step.kind === 'steady'
    ? steady(step,step.label.toLowerCase().includes('warm')?'warmup':step.label.toLowerCase().includes('cool')?'cooldown':'work')
    : { type:'repeat' as const,reps:step.repetitions,
      work:steady(step.work,'work'),recovery:steady(step.recovery,'recovery') });
  const intervals=normalizeWorkoutIntervals(steps);
  const seconds=intervals.reduce((sum,item)=>sum+(item.durationSec??0),0);
  if (!intervals.length || intervals.some(item=>item.target?.metric!=='ftp_percent'||!item.durationSec) ||
      Math.abs(seconds/60-draft.durationMin)>0.01) throw new Error('Saved prescription failed interval validation');
  return { source:'azur-workout-library',workoutId:source.id,workoutVersion:source.version,
    coachApproved:true,ftpAtPrescription:ftpWatts,
    resolvedSteps:draft.steps, azurWorkout:{sport:'bike',steps} };
}
