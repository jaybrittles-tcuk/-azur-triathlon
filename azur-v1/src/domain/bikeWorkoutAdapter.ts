import type { PlannedSession } from './types';
import { resolvePowerRange, validateWorkout, workoutMinutes } from './bikeWorkoutLibrary';
import type { BikeWorkout, WorkoutStep } from './bikeWorkoutLibrary';

export interface BikeWorkoutDraftInput {
 athleteId: string;
 seasonWeekId: string;
 date: string;
 ftpWatts: number;
 /** Existing calendar session ID supplied by caller; never overwrite an existing ID. */
 sessionId: string;
}

/** Generates an unpublished calendar draft. Caller must explicitly approve and persist it. */
export function toPlannedBikeSession(workout:BikeWorkout,input:BikeWorkoutDraftInput):PlannedSession {
 const errors=validateWorkout(workout);
 if(errors.length) throw new Error('Invalid workout: '+errors.join('; '));
 if(!input.sessionId||!input.seasonWeekId||!/^\d{4}-\d{2}-\d{2}$/.test(input.date))
   throw new Error('Valid session ID, week ID and ISO date required');
 if(!Number.isFinite(input.ftpWatts)||input.ftpWatts<=0) throw new Error('FTP required');
 const resolve=(step:Extract<WorkoutStep,{kind:'steady'}>)=>({
   ...step,powerWatts:resolvePowerRange(input.ftpWatts,step.minFtpPct,step.maxFtpPct)
 });
 const steps=workout.steps.map(step=>step.kind==='steady'?resolve(step):{
   kind:'repeat' as const,repetitions:step.repetitions,
   work:resolve(step.work),recovery:resolve(step.recovery),
   recoveryAfterLast:false
 });
 const sessionClass:PlannedSession['sessionClass']=
   workout.family==='aerobic_foundation'?'endurance':'intensity';
 return {
   id:input.sessionId,seasonWeekId:input.seasonWeekId,plannedDate:input.date,
   sport:'bike',title:workout.title,sessionClass,priority:2,
   durationMin:workoutMinutes(workout),
   targets:{ftpWatts:input.ftpWatts,unit:'watts'},
   prescription:{source:'azur-workout-library',workoutId:workout.id,
     workoutVersion:workout.version,steps,requiresCoachReview:true,
     exportReady:workout.status==='export_validated'},
   rationale:workout.purpose,status:'planned',locked:true,version:1
 };
}
