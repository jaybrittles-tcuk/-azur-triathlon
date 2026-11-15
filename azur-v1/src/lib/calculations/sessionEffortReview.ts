/** Conservative, read-only review signal for athlete-reported effort.
 * A single report is not a diagnosis or permission to change a plan.
 */
export type EffortReviewInput={
 reportedRpe:number|null|undefined;
 plannedRpeLow?:number|null;
 plannedRpeHigh?:number|null;
 actualMinutes?:number|null;
 plannedMinutes?:number|null;
 source?:'manual'|'device'|'unknown';
};
export function assessSessionEffortReview(input:EffortReviewInput){
 const rpe=input.reportedRpe;
 if(rpe===null||rpe===undefined||!Number.isInteger(rpe)||rpe<1||rpe>10)
  return {status:'unknown' as const,requiresCoachReview:false,reason:'No valid session RPE recorded',readOnly:true as const};
 const prescribedHigh=input.plannedRpeHigh;
 const effortMismatch=typeof prescribedHigh==='number'&&Number.isFinite(prescribedHigh)&&rpe>=prescribedHigh+3;
 const veryHigh=rpe>=9;
 const high=rpe>=8;
 const extended=typeof input.actualMinutes==='number'&&typeof input.plannedMinutes==='number'&&input.plannedMinutes>0&&input.actualMinutes>=input.plannedMinutes*1.25;
 if(veryHigh||effortMismatch||high&&extended){
  const reasons=[veryHigh?'Very high reported effort (RPE '+rpe+'/10)':null,effortMismatch?'Reported effort substantially exceeds prescribed RPE':null,extended?'Recorded duration is at least 25% longer than planned':null].filter(Boolean);
  return {status:'review_recovery' as const,requiresCoachReview:true,reason:reasons.join('; ')+'. Check fatigue, illness, injury, and next-session readiness with the athlete.',readOnly:true as const};
 }
 return {status:'no_high_effort_flag' as const,requiresCoachReview:false,reason:'No high-effort exception identified from this report alone; other recovery data may still require review.',readOnly:true as const};
}
