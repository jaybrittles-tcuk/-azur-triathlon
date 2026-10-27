import type { FourWeekDraft } from './fourWeekBikePlanner';
import type { BikeWorkout } from './bikeWorkoutLibrary';
import { allBikeWorkouts } from './bikeWorkoutCatalog';
import { validateWorkout, workoutMinutes } from './bikeWorkoutLibrary';
import type { CoachReviewStatus } from './coachReviewStatus';

export interface CoachReview {
  id:string; athleteId:string; revision:number; status:CoachReviewStatus;
  draft:FourWeekDraft; coachId?:string; note?:string; updatedAt:string;
}
export type ReviewDecision =
  | {kind:'approve';coachId:string;note:string;at:string}
  | {kind:'reject'|'request_changes';coachId:string;note:string;at:string};

export function beginCoachReview(id:string,draft:FourWeekDraft,at:string):CoachReview {
 if(!id||!draft.athleteId||draft.status!=='pending_coach_approval'||!Number.isFinite(Date.parse(at)))
   throw new Error('Invalid review input');
 return {id,athleteId:draft.athleteId,revision:1,status:'pending',draft,updatedAt:at};
}
export function reviewBlockers(review:CoachReview,catalog:readonly BikeWorkout[]=allBikeWorkouts):string[] {
 const blockers:string[]=[];
 if(review.athleteId!==review.draft.athleteId) blockers.push('Athlete mismatch');
 if(review.draft.weeks.length!==4) blockers.push('Expected four weeks');
 if(review.draft.warnings.length) blockers.push('Unresolved plan warnings');
 const workouts=new Map(catalog.map(w=>[w.id,w]));
 for(const week of review.draft.weeks) {
   if(week.warnings.length) blockers.push('Unresolved week '+week.week+' warnings');
   if(week.committedMinutes+week.proposedBikeMinutes>week.budgetMinutes) blockers.push('Week '+week.week+' over budget');
   if(week.proposedBikeMinutes!==week.placements.reduce((sum,p)=>sum+p.durationMinutes,0))
     blockers.push('Week '+week.week+' duration mismatch');
   for(const placement of week.placements) {
     const workout=workouts.get(placement.workoutId);
     if(!workout||validateWorkout(workout).length||workout.status==='candidate')
       blockers.push('Workout not validated: '+placement.workoutId);
     else if(workoutMinutes(workout)!==placement.durationMinutes)
       blockers.push('Workout duration mismatch: '+placement.workoutId);
     if(placement.date<week.startDate||placement.date>new Date(Date.parse(week.startDate+'T12:00:00Z')+6*86400000).toISOString().slice(0,10))
       blockers.push('Workout outside week: '+placement.workoutId);
   }
 }
 return blockers;
}
/** Pure transition only; server must enforce identity, permissions and revision concurrency. */
export function decideCoachReview(review:CoachReview,decision:ReviewDecision,
 catalog:readonly BikeWorkout[]=allBikeWorkouts):CoachReview {
 if(review.status==='approved'||review.status==='rejected') throw new Error('Review is final');
 if(!decision.coachId.trim()||!Number.isFinite(Date.parse(decision.at))) throw new Error('Coach and date required');
 if(decision.kind==='approve'){
   const blockers=reviewBlockers(review,catalog);
   if(blockers.length) throw new Error('Approval blocked: '+blockers.join('; '));
 } else if(!decision.note.trim()) throw new Error('Reason required');
 return {...review,revision:review.revision+1,
   status:decision.kind==='approve'?'approved':decision.kind==='reject'?'rejected':'changes_requested',
   coachId:decision.coachId,note:decision.note,updatedAt:decision.at};
}
