/**
 * Automatic release policy for onboarding-generated weeks.
 * An athlete's questionnaire is never a substitute for verified activity history.
 * The returned decision is advisory: the database publisher remains authoritative.
 */
export type ReleaseAssessment={
 profileComplete:boolean;
 currentBaselineValidated:boolean;
 verifiedHistoryWeeks:number;
 verifiedRecentHours:number|null;
 verifiedCapacityHours:number|null;
 requestedHours:number;
 proposalMinutes:number;
 proposedDays:readonly number[];
 availableDays:readonly number[];
 approvedLibrarySessions:boolean;
 hasTrainingConcern:boolean;
 hasExistingWeek:boolean;
 weekLocked:boolean;
 profileChangedAfterProposal:boolean;
};
export function assessAutomaticRelease(input:ReleaseAssessment){
 const blockers:string[]=[];
 if(!input.profileComplete)blockers.push('onboarding_incomplete');
 if(!input.currentBaselineValidated||input.verifiedHistoryWeeks<4)blockers.push('baseline_not_verified');
 if(input.hasTrainingConcern)blockers.push('training_concern');
 if(input.hasExistingWeek||input.weekLocked)blockers.push('calendar_not_empty');
 if(input.profileChangedAfterProposal)blockers.push('proposal_stale');
 if(!input.approvedLibrarySessions)blockers.push('unapproved_workout');
 if(!Number.isFinite(input.proposalMinutes)||input.proposalMinutes<=0)blockers.push('invalid_proposal_volume');
 if(!Number.isFinite(input.requestedHours)||input.requestedHours<=0||input.proposalMinutes>input.requestedHours*60)blockers.push('availability_exceeded');
 if(input.verifiedCapacityHours==null||!Number.isFinite(input.verifiedCapacityHours)||input.verifiedCapacityHours<=0||input.proposalMinutes>input.verifiedCapacityHours*60)blockers.push('validated_capacity_exceeded');
 if(input.verifiedRecentHours==null||!Number.isFinite(input.verifiedRecentHours)||input.verifiedRecentHours<=0||input.proposalMinutes>input.verifiedRecentHours*60*1.1)blockers.push('recent_verified_volume_exceeded');
 const allowed=new Set(input.availableDays);
 if(!input.proposedDays.length||input.proposedDays.some(d=>!Number.isInteger(d)||d<0||d>6||!allowed.has(d)))blockers.push('unavailable_training_day');
 return {eligible:blockers.length===0,blockers,action:blockers.length?'coach_review':'eligible_for_atomic_publication'} as const;
}
