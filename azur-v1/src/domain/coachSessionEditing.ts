import type { CoachReview } from './coachReview';
import { reviewBlockers } from './coachReview';
import type { DraftBikePlacement, Day } from './fourWeekBikePlanner';
import { allBikeWorkouts } from './bikeWorkoutCatalog';
import { workoutMinutes, validateWorkout } from './bikeWorkoutLibrary';

export type CoachSessionEdit =
 | {kind:'move';week:number;workoutId:string;newDate:string}
 | {kind:'replace';week:number;workoutId:string;replacementWorkoutId:string}
 | {kind:'remove';week:number;workoutId:string};
const days:Day[]=['sun','mon','tue','wed','thu','fri','sat'];
const dateValid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&
 !Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const plusDays=(s:string,n:number)=>new Date(Date.parse(s+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);

/** Edit a draft, never an approved or rejected block. Approval must be repeated after editing. */
export function editCoachSession(review:CoachReview,edit:CoachSessionEdit,
 coachId:string,at:string,expectedRevision:number):CoachReview {
 if(review.revision!==expectedRevision) throw new Error('Stale plan revision');
 if(review.status==='approved'||review.status==='rejected') throw new Error('Final review cannot be edited');
 if(!coachId.trim()||!Number.isFinite(Date.parse(at))) throw new Error('Coach and timestamp required');
 const weeks=review.draft.weeks.map(w=>({...w,placements:w.placements.map(p=>({...p}))}));
 const week=weeks.find(w=>w.week===edit.week);
 if(!week) throw new Error('Week not found');
 const index=week.placements.findIndex(p=>p.workoutId===edit.workoutId);
 if(index<0) throw new Error('Workout not found');
 const original=week.placements[index];
 if(edit.kind==='remove') week.placements.splice(index,1);
 if(edit.kind==='move'){
   if(!dateValid(edit.newDate)||edit.newDate<week.startDate||edit.newDate>plusDays(week.startDate,6))
     throw new Error('Date outside selected week');
   const day=days[new Date(edit.newDate+'T12:00:00Z').getUTCDay()];
   week.placements[index]={...original,date:edit.newDate,day};
 }
 if(edit.kind==='replace'){
   const replacement=allBikeWorkouts.find(w=>w.id===edit.replacementWorkoutId);
   if(!replacement||validateWorkout(replacement).length) throw new Error('Invalid replacement workout');
   if(week.placements.some((p,i)=>i!==index&&p.workoutId===replacement.id))
     throw new Error('Duplicate workout in week');
   const placement:DraftBikePlacement={...original,workoutId:replacement.id,
     title:replacement.title,durationMinutes:workoutMinutes(replacement),
     rationale:['Coach-selected replacement; reapproval required'],approvalRequired:true};
   week.placements[index]=placement;
 }
 week.proposedBikeMinutes=week.placements.reduce((n,p)=>n+p.durationMinutes,0);
 if(week.committedMinutes+week.proposedBikeMinutes>week.budgetMinutes)
   throw new Error('Edit exceeds weekly budget');
 const next:CoachReview={...review,revision:review.revision+1,status:'changes_requested',
   coachId,updatedAt:at,draft:{...review.draft,weeks}};
 // Unresolved blockers are reported by the dashboard; candidate workouts remain unapprovable.
 return next;
}
export interface CoachReviewSummary {
 athleteId:string;revision:number;status:CoachReview['status'];sessionCount:number;
 proposedMinutes:number;blockers:string[];canApprove:boolean;
}
export function coachReviewSummary(review:CoachReview):CoachReviewSummary {
 const blockers=reviewBlockers(review);
 return {athleteId:review.athleteId,revision:review.revision,status:review.status,
   sessionCount:review.draft.weeks.reduce((n,w)=>n+w.placements.length,0),
   proposedMinutes:review.draft.weeks.reduce((n,w)=>n+w.proposedBikeMinutes,0),
   blockers,canApprove:review.status!=='approved'&&review.status!=='rejected'&&blockers.length===0};
}
