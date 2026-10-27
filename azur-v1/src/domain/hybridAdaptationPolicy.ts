/** Conservative hybrid adaptation policy. This classifies proposed changes; it does not publish them. */
export type AdaptationDecision='auto_eligible'|'coach_review'|'blocked';
export interface AdaptationProposal {
 athleteId:string;
 kind:'move_easy_session'|'reduce_easy_duration'|'swap_equivalent_easy'|'increase_duration'|
 'change_intensity'|'add_session'|'remove_priority_session'|'race_week_change'|'recovery_response';
 originalMinutes:number;
 proposedMinutes:number;
 intensityBefore:'easy'|'moderate'|'hard';
 intensityAfter:'easy'|'moderate'|'hard';
 daysUntilRace?:number;
 readiness:'green'|'amber'|'red'|'unknown';
 hasConflicts:boolean;
 isLocked:boolean;
}
export interface AdaptationAssessment {
 decision:AdaptationDecision;
 reasons:string[];
 requiresCoachApproval:boolean;
}
export function assessAdaptation(p:AdaptationProposal):AdaptationAssessment {
 const reasons:string[]=[];
 if(!p.athleteId||!Number.isFinite(p.originalMinutes)||!Number.isFinite(p.proposedMinutes)||
   p.originalMinutes<=0||p.proposedMinutes<=0)
   return {decision:'blocked',reasons:['Invalid athlete or session duration'],requiresCoachApproval:true};
 if(p.isLocked||p.hasConflicts) return {decision:'blocked',
   reasons:[p.isLocked?'Session is locked':'Scheduling conflict'],requiresCoachApproval:true};
 if(p.readiness==='red'||p.readiness==='unknown') return {decision:'coach_review',
   reasons:['Recovery or readiness requires human assessment'],requiresCoachApproval:true};
 if(p.daysUntilRace!==undefined&&(!Number.isFinite(p.daysUntilRace)||p.daysUntilRace<0))
   return {decision:'blocked',reasons:['Invalid race timing'],requiresCoachApproval:true};
 if(p.daysUntilRace!==undefined&&p.daysUntilRace<=14) reasons.push('Race proximity');
 if(p.kind==='race_week_change'||p.kind==='recovery_response') reasons.push('Race or recovery decision');
 if(p.intensityBefore!=='easy'||p.intensityAfter!=='easy') reasons.push('Non-easy training stimulus');
 if(p.kind!=='move_easy_session'&&p.kind!=='reduce_easy_duration'&&p.kind!=='swap_equivalent_easy')
   reasons.push('Material training-plan change');
 if(p.proposedMinutes>p.originalMinutes) reasons.push('Duration increase');
 if(p.kind==='reduce_easy_duration'&&p.proposedMinutes<p.originalMinutes*0.8)
   reasons.push('Reduction greater than 20%');
 if(p.kind==='move_easy_session'&&p.proposedMinutes!==p.originalMinutes)
   reasons.push('Move also changes duration');
 if(p.kind==='swap_equivalent_easy'&&p.proposedMinutes!==p.originalMinutes)
   reasons.push('Replacement duration differs');
 if(reasons.length) return {decision:'coach_review',reasons,requiresCoachApproval:true};
 return {decision:'auto_eligible',reasons:['Low-impact easy-session adjustment within policy'],
   requiresCoachApproval:false};
}
