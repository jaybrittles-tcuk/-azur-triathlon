import { allBikeWorkouts } from './bikeWorkoutCatalog';
import { validateWorkout, workoutMinutes, resolvePowerRange } from './bikeWorkoutLibrary';
import { toPlannedBikeSession } from './bikeWorkoutAdapter';

/** Framework-independent smoke checks; invoke from a TS test runner in CI. */
export function runBikeWorkoutSmokeChecks():void {
 const ids=new Set<string>();
 for(const workout of allBikeWorkouts){
   if(workout.status!=='candidate') throw new Error('Unexpected approved workout: '+workout.id);
   if(ids.has(workout.id)) throw new Error('Duplicate workout ID: '+workout.id);
   ids.add(workout.id);
   const errors=validateWorkout(workout);
   if(errors.length) throw new Error(workout.id+': '+errors.join(', '));
   if(workoutMinutes(workout)<=0) throw new Error('Zero duration: '+workout.id);
 }
 if(allBikeWorkouts.length!==38) throw new Error('Expected 38 candidate workouts');
 const af=allBikeWorkouts.find(w=>w.id==='BIKE-AF-001');
 if(!af) throw new Error('Missing aerobic foundation workout');
 if(workoutMinutes(af)!==45) throw new Error('Aerobic reset duration should be 45 minutes');
 const threshold=allBikeWorkouts.find(w=>w.id==='BIKE-THR-001');
 if(!threshold) throw new Error('Missing threshold workout');
 if(workoutMinutes(threshold)!==51) throw new Error('3x6 threshold duration should be 51 minutes');
 const [low,high]=resolvePowerRange(300,95,100);
 if(low!==285||high!==300) throw new Error('FTP power resolution failed');
 const draft=toPlannedBikeSession(af,{
   athleteId:'test-athlete',seasonWeekId:'week-1',date:'2026-11-02',
   ftpWatts:300,sessionId:'session-1'
 });
 if(!draft.locked||draft.sport!=='bike'||draft.durationMin!==45)
   throw new Error('Draft session guardrail failed');
 if(draft.prescription.exportReady!==false)
   throw new Error('Candidate workout must not be export ready');
}
