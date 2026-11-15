/** Deterministic onboarding assessment for an automatic first-week proposal.
 * No approval, draft insert or calendar publication occurs here.
 * Athlete-reported hours are NOT verified training history.
 */
export type FirstWeekProfile={
 onboardingComplete:boolean;
 availableHours:number;
 recentReportedHours:number|null;
 background:'novice'|'regular'|'established'|string;
 consistency:'under4'|'4to7'|'8plus'|string;
 concern:'none'|'yes'|'unsure'|string;
 trainingDays:readonly number[];
 canSwim200m:boolean|null;
};
export function assessFirstWeekProfile(profile:FirstWeekProfile){
 const reasons:string[]=[];
 if(!profile.onboardingComplete)reasons.push('Complete onboarding');
 if(!Number.isFinite(profile.availableHours)||profile.availableHours<2||profile.availableHours>25)reasons.push('Confirm available training hours');
 if(!['novice','regular','established'].includes(profile.background))reasons.push('Confirm training background');
 if(!['under4','4to7','8plus'].includes(profile.consistency))reasons.push('Confirm recent consistency');
 if(profile.concern!=='none')reasons.push('Coach assessment required for training concern');
 if(profile.recentReportedHours!=null&&(!Number.isFinite(profile.recentReportedHours)||profile.recentReportedHours<0||profile.recentReportedHours>40))reasons.push('Clarify recent training hours');
 const days=[...new Set(profile.trainingDays)].sort((a,b)=>a-b);
 if(days.length<3||days.some(day=>!Number.isInteger(day)||day<0||day>6))reasons.push('At least three valid available days required for a three-sport week');
 if(profile.canSwim200m==null)reasons.push('Confirm swim readiness');
 const cap=profile.consistency==='under4'?4:profile.background==='novice'?5:6;
 // 3h is a conservative proposal ceiling, NOT automatic medical or training clearance.
 const proposedHours=Math.min(3,cap,profile.availableHours,profile.recentReportedHours&&profile.recentReportedHours>0?profile.recentReportedHours*1.1:3);
 return {canPropose:reasons.length===0,proposedHours:reasons.length===0?Math.floor(proposedHours*2)/2:null,days:reasons.length===0?days:[],reasons,requiresCoachReview:reasons.length>0,automaticPublicationAuthorized:false};
}
