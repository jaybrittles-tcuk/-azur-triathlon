import type { BikeWorkout, WorkoutFamily } from './bikeWorkoutLibrary';
import { validateWorkout, workoutMinutes } from './bikeWorkoutLibrary';
import { allBikeWorkouts } from './bikeWorkoutCatalog';
import type { BikeDiagnostic } from './bikePerformanceDiagnostic';

export interface BikeWorkoutRequest {
  diagnostic:BikeDiagnostic;
  objective:WorkoutFamily;
  maxMinutes:number;
  experience:'beginner'|'intermediate'|'advanced';
  recoveryStatus:'ready'|'uncertain'|'not_ready';
  approvedWorkoutIds?:readonly string[];
}
export interface BikeWorkoutRecommendation {
  workoutId:string;
  title:string;
  durationMinutes:number;
  rationale:string[];
  requiresCoachApproval:true;
  canAutoPublish:false;
}
const demanding=new Set<WorkoutFamily>(['threshold','vo2_short','vo2_long','big_gear']);
const advancedOnly=new Set<WorkoutFamily>(['big_gear','vo2_long']);
/** Candidate selector; no database writes, calendar edits or Garmin export. */
export function recommendBikeWorkouts(
  request:BikeWorkoutRequest,
  catalog:readonly BikeWorkout[]=allBikeWorkouts
):BikeWorkoutRecommendation[] {
 const {diagnostic,objective,maxMinutes,experience,recoveryStatus}=request;
 if(!Number.isFinite(maxMinutes)||maxMinutes<=0||diagnostic.ftpWatts===null) return [];
 if(recoveryStatus==='not_ready') return [];
 if(recoveryStatus==='uncertain'&&demanding.has(objective)) return [];
 if(experience==='beginner'&&advancedOnly.has(objective)) return [];
 if(diagnostic.evidenceConfidence==='low'&&demanding.has(objective)) return [];
 const approved=new Set(request.approvedWorkoutIds??[]);
 return catalog.filter(workout=>
   workout.family===objective &&
   validateWorkout(workout).length===0 &&
   workoutMinutes(workout)<=maxMinutes &&
   (workout.status==='coach_validated'||workout.status==='export_validated'||approved.has(workout.id))
 ).sort((a,b)=>workoutMinutes(a)-workoutMinutes(b)).map(workout=>({
   workoutId:workout.id,title:workout.title,durationMinutes:workoutMinutes(workout),
   rationale:[
     'Matches selected development objective: '+objective,
     'Fits available cycling session time.',
     'Requires coach review of intensity, cross-discipline load and athlete context.'
   ],
   requiresCoachApproval:true as const,canAutoPublish:false as const
 }));
}
