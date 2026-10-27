import { beginCoachReview, decideCoachReview, reviewBlockers } from './coachReview';
import type { FourWeekDraft } from './fourWeekBikePlanner';

export function runCoachReviewSmokeChecks():void {
 const draft:FourWeekDraft={athleteId:'athlete-1',status:'pending_coach_approval',
  warnings:[],explanation:[],weeks:[1,2,3,4].map(week=>({
    week,startDate:['2026-11-02','2026-11-09','2026-11-16','2026-11-23'][week-1],
    budgetMinutes:300,committedMinutes:120,proposedBikeMinutes:0,placements:[],warnings:[]
  }))};
 const review=beginCoachReview('review-1',draft,'2026-10-27T12:00:00Z');
 if(review.status!=='pending'||reviewBlockers(review).length) throw new Error('Clean draft validation failed');
 const approved=decideCoachReview(review,{kind:'approve',coachId:'coach-1',note:'Reviewed',at:'2026-10-27T12:01:00Z'});
 if(approved.status!=='approved'||approved.revision!==2) throw new Error('Approval transition failed');
 let failed=false;
 try{decideCoachReview(approved,{kind:'reject',coachId:'coach-1',note:'No',at:'2026-10-27T12:02:00Z'});}catch{failed=true;}
 if(!failed) throw new Error('Final approval mutated');
 const candidate={...review,draft:{...draft,weeks:draft.weeks.map((w,i)=>i? w:{
   ...w,proposedBikeMinutes:45,placements:[{date:'2026-11-02',day:'mon' as const,
     workoutId:'BIKE-AF-001',title:'Aerobic Reset 45',durationMinutes:45,
     rationale:[],approvalRequired:true as const}]
 })}};
 if(!reviewBlockers(candidate).some(e=>e.includes('not validated'))) throw new Error('Candidate workout approved');
 failed=false;
 try{decideCoachReview(candidate,{kind:'approve',coachId:'coach-1',note:'',at:'2026-10-27T12:03:00Z'});}catch{failed=true;}
 if(!failed) throw new Error('Unvalidated workout approval was not blocked');
}
