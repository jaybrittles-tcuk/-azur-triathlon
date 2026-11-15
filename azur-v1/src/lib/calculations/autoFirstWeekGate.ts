/**
 * Automatic first-week publication gate.
 * Fail closed: a questionnaire is not verified training history. Automatic release
 * requires a validated baseline, safe proposal and a separately enabled publisher.
 * This is a pure policy module; it cannot write athlete sessions.
 */
export type AutoFirstWeekInput={
 onboardingComplete:boolean;
 hasTrainingConcern:boolean;
 validatedHistory:boolean;
 validatedCapacityHours:number|null;
 requestedHours:number|null;
 recentVerifiedHours:number|null;
 scheduledMinutes:number;
 trainingDays:number[];
 proposedDays:number[];
 hasExistingSessions:boolean;
 weekLocked:boolean;
 approvedWorkoutCount:number;
 proposalWorkoutCount:number;
 publisherEnabled:boolean;
};
export function assessAutoFirstWeek(input:AutoFirstWeekInput){
 const reasons:string[]=[];
 if(!input.onboardingComplete)reasons.push('Onboarding incomplete');
 if(input.hasTrainingConcern)reasons.push('Training concern requires coach review');
 if(!input.validatedHistory||input.validatedCapacityHours==null||input.validatedCapacityHours<=0)reasons.push('No validated training baseline for automatic publication');
 if(input.hasExistingSessions||input.weekLocked)reasons.push('Existing or locked training week');
 if(!Number.isFinite(input.scheduledMinutes)||input.scheduledMinutes<=0)reasons.push('No valid proposed training volume');
 if(input.validatedCapacityHours!=null&&input.scheduledMinutes>input.validatedCapacityHours*60)reasons.push('Proposed volume exceeds validated capacity');
 if(input.requestedHours==null||input.requestedHours<=0||input.scheduledMinutes>input.requestedHours*60)reasons.push('Proposed volume exceeds availability');
 if(input.recentVerifiedHours==null||input.recentVerifiedHours<=0||input.scheduledMinutes>input.recentVerifiedHours*60*1.1)reasons.push('Insufficient verified recent volume or excessive progression');
 if(input.proposalWorkoutCount<1||input.approvedWorkoutCount!==input.proposalWorkoutCount)reasons.push('Every workout must use an approved prescription');
 const allowed=new Set(input.trainingDays);
 if(allowed.size===0||input.proposedDays.some(day=>!Number.isInteger(day)||day<0||day>6||!allowed.has(day)))reasons.push('Proposed sessions fall outside athlete availability');
 if(!input.publisherEnabled)reasons.push('Automatic publishing feature flag is disabled');
 return {eligible:reasons.length===0,reasons,requiresCoachReview:reasons.length>0};
}
