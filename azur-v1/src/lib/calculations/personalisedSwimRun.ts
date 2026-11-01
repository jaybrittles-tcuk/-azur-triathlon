import { structuredSwimRunDrafts, validateStructuredDraft } from './structuredSwimRunDrafts.ts';
import type { StructuredSwimRun } from './structuredSwimRunDrafts.ts';
export type AthleteThresholds={cssSecondsPer100m?:number|null;runThresholdSecondsPerKm?:number|null};
export type PersonalisedStep={name:string;repeats:number;workSeconds:number;recoverySeconds:number;distanceMeters?:number;targetLabel:string;instruction:string};
export type WorkoutPersonalisation={status:'ready_for_coach_review';workoutId:string;steps:PersonalisedStep[];durationSeconds:number}|{status:'blocked';workoutId:string;reasons:string[]};
const round=(x:number)=>Math.round(x);
export function personaliseSwimRun(workout:StructuredSwimRun,athlete:AthleteThresholds):WorkoutPersonalisation{
 const reasons=validateStructuredDraft(workout);
 const steps:PersonalisedStep[]=[];
 for(const step of workout.steps){
  const t=step.target;
  let label='';
  if(t.type==='rpe')label='RPE '+t.min+'–'+t.max+'/10';
  if(t.type==='css_pace'){
   const css=athlete.cssSecondsPer100m;
   if(!css||!Number.isFinite(css)||css<45||css>240)reasons.push('Valid swim CSS required');
   else label=round(css*t.min)+'–'+round(css*t.max)+' sec/100m (CSS-based)';
  }
  if(t.type==='run_threshold_pace'){
   const pace=athlete.runThresholdSecondsPerKm;
   if(!pace||!Number.isFinite(pace)||pace<130||pace>700)reasons.push('Valid run threshold pace required');
   else label=round(pace*t.min)+'–'+round(pace*t.max)+' sec/km (threshold-based)';
  }
  steps.push({name:step.name,repeats:step.repeats,workSeconds:step.workSeconds,recoverySeconds:step.recoverySeconds,...(step.distanceMeters?{distanceMeters:step.distanceMeters}:{}),targetLabel:label,instruction:step.instruction});
 }
 if(reasons.length)return {status:'blocked',workoutId:workout.id,reasons:[...new Set(reasons)]};
 return {status:'ready_for_coach_review',workoutId:workout.id,steps,durationSeconds:steps.reduce((sum,s)=>sum+s.repeats*(s.workSeconds+s.recoverySeconds),0)};
}
/** Personalisation alone never approves or publishes a draft. */
export function personaliseDraftById(id:string,athlete:AthleteThresholds){
 const workout=structuredSwimRunDrafts.find(w=>w.id===id);
 if(!workout)return {status:'blocked' as const,workoutId:id,reasons:['Unknown coach-authored workout']};
 return personaliseSwimRun(workout,athlete);
}
