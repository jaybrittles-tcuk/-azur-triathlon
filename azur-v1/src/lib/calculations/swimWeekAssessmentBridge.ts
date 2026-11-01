import { recommendAthleteSwimDrills } from './athleteSwimDrillSelection.ts';
import type { SwimDevelopmentObservation } from './athleteSwimDrillSelection.ts';
import type { DraftResult } from './weeklyDraftGenerator.ts';

export type StoredSwimAssessment={
 focus:SwimDevelopmentObservation['focus'];notes:string;assessed_at:string;coach_user_id:string;status:string;
};
export type SwimWeekCoachReview={
 status:'review_required'|'no_valid_assessment'|'no_swim_session';
 drillBlock?:{focus:string;totalMeters:number;drills:{id:string;name:string;repeats:number;distanceMeters:number;restSeconds:number;instructions:string}[]};
 message:string;
};
/** Read-only link from recorded coach assessment to a proposed weekly swim block.
 * Never edits workouts, upgrades draft status or publishes sessions.
 */
export function recommendSwimBlockForWeek(input:{
 draft:DraftResult;assessments:readonly StoredSwimAssessment[];referenceDate:string;maxDrillMeters?:number;
}):SwimWeekCoachReview{
 if(input.draft.status!=='ready_for_coach_review')return {status:'no_swim_session',message:'Complete the weekly draft before technical drill review'};
 if(!input.draft.sessions.some(s=>s.session.sport==='swim'))return {status:'no_swim_session',message:'No swimming workout exists in this week'};
 const observations=input.assessments.filter(a=>a.status==='active'&&Boolean(a.coach_user_id)).map(a=>({
   focus:a.focus,source:'coach_assessment' as const,observedAt:a.assessed_at.slice(0,10),notes:a.notes
 }));
 const result=recommendAthleteSwimDrills(observations,input.maxDrillMeters??300,input.referenceDate);
 if(result.status!=='coach_review_required')return {status:'no_valid_assessment',message:result.reason};
 return {status:'review_required',message:'Review drill suitability, pool length and total swim volume before editing the workout',
   drillBlock:{focus:result.focus,totalMeters:result.drills.reduce((n,d)=>n+d.repeats*d.distanceMeters,0),
     drills:result.drills.map(d=>({id:d.id,name:d.name,repeats:d.repeats,distanceMeters:d.distanceMeters,restSeconds:d.restSeconds,instructions:d.instructions}))}};
}
