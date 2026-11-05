/** Pure, read-only weekly decision support. No calendar mutations or authorisation. */
export function assessFoundationWeek({targetMinutes, sessions=[], recentHours=null, concern='unsure', historyVerified=false, recoveryVerified=false}={}){
 const scheduledMinutes=sessions.reduce((sum,s)=>sum+(Number.isFinite(Number(s.duration_min))?Math.max(0,Number(s.duration_min)):0),0);
 const gapMinutes=Number.isFinite(Number(targetMinutes))?Math.round(Number(targetMinutes))-scheduledMinutes:null;
 const recentMinutes=recentHours==null||!Number.isFinite(Number(recentHours))?null:Math.round(Number(recentHours)*60);
 const flags=[];
 if(sessions.some(s=>s.locked||s.status!=='planned'))flags.push('locked_or_progressed_sessions');
 if(recentMinutes!==null&&recentMinutes>0&&Number.isFinite(Number(targetMinutes))&&recentMinutes>Number(targetMinutes)*1.5)flags.push('history_target_mismatch');
 if(!historyVerified)flags.push('training_history_unverified');
 if(!recoveryVerified)flags.push('recovery_unverified');
 if(!['none','no','no concerns'].includes(String(concern).trim().toLowerCase()))flags.push('training_concern_requires_review');
 if(gapMinutes!==null&&gapMinutes<0)flags.push('scheduled_over_target');
 const requiresCoachReview=flags.length>0||gapMinutes!==0;
 return {status:requiresCoachReview?'coach_review_required':'eligible_for_further_policy_checks',
  scheduledMinutes,gapMinutes,recentMinutes,flags,
  recommendation:flags.includes('history_target_mismatch')?'Clarify whether this is a deliberate recovery week, an outdated target or an inaccurate training history before increasing volume.':gapMinutes>0?'Retain current volume until training tolerance and recovery support any increase.':gapMinutes<0?'Review excess scheduled volume before publication.':'Maintain the scheduled volume pending all publication safety checks.',
  canAutoPublish:false};
}
