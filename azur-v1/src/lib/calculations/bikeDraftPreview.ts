import { allBikeWorkouts } from '../../domain/bikeWorkoutCatalog.ts';
import { resolvePowerRange, validateWorkout, workoutMinutes } from '../../domain/bikeWorkoutLibrary.ts';
import type { WorkoutStep } from '../../domain/bikeWorkoutLibrary.ts';
import type { SessionEntry } from './sessionSelection.ts';

export type BikeDraftPreview = {
  workoutId: string; version: number; title: string; durationMin: number;
  purpose: string; steps: Array<
    | { kind:'steady'; minutes:number; label:string; powerWatts:[number,number]; cadenceRpm?:[number,number] }
    | { kind:'repeat'; repetitions:number; work:{minutes:number;label:string;powerWatts:[number,number];cadenceRpm?:[number,number]}; recovery:{minutes:number;label:string;powerWatts:[number,number];cadenceRpm?:[number,number]} }
  >;
};
/** Creates a preview only; never writes to the calendar or authorises Garmin export. */
export function previewApprovedBikeWorkout(selected: SessionEntry, ftpWatts: number): BikeDraftPreview | null {
  if (!selected.approved || selected.sport !== 'bike' ||
    !Number.isFinite(ftpWatts) || ftpWatts < 80 || ftpWatts > 650) return null;
  const workout = allBikeWorkouts.find(x => x.id === selected.id);
  if (!workout || validateWorkout(workout).length) return null;
  const steady = (s:Extract<WorkoutStep,{kind:'steady'}>) => ({
    minutes:s.minutes,label:s.label,powerWatts:resolvePowerRange(ftpWatts,s.minFtpPct,s.maxFtpPct),
    ...(s.cadenceRpm ? {cadenceRpm:s.cadenceRpm}:{}),
  });
  return {
    workoutId:workout.id,version:workout.version,title:workout.title,
    durationMin:workoutMinutes(workout),purpose:workout.purpose,
    steps:workout.steps.map(step=>step.kind==='steady'
      ? {kind:'steady' as const,...steady(step)}
      : {kind:'repeat' as const,repetitions:step.repetitions,work:steady(step.work),recovery:steady(step.recovery)}),
  };
}
