import {draftApprovedTrainingWeek} from './weeklyDraftGenerator.ts';
import type {DraftSlot,DraftResult} from './weeklyDraftGenerator.ts';
import type {SessionEntry} from './sessionSelection.ts';
/** Coach-review-only history gate. Does not write drafts or publish workouts. */
export type AthleteHistoryGate = {
 validationStatus:'validated'|'pending'|'rejected';
 recentWeeks:number; recentMedianMinutes:number; approvedWeeklyMinutes:number;
 recoveryReviewed:boolean; spikeVerified:boolean;
 fatigueFlag:boolean; injuryFlag:boolean;
};
export type HistoryDraftResult = DraftResult & {historyChecks:string[]};
export function draftHistoryCheckedWeek(input:{
 weekStart:string; slots:readonly DraftSlot[]; library:readonly SessionEntry[];
 phase:SessionEntry['phases'][number]; targetWeekMinutes:number;
 existingActiveSessions:number; athleteProfileReady:boolean;
 history:AthleteHistoryGate; recentSessionIds?:readonly string[];
 maxIncreaseFraction?:number;
}):HistoryDraftResult {
 const h=input.history;
 const checks:string[]=[];
 if(h.validationStatus!=='validated'||h.recentWeeks<4)checks.push('At least four weeks of validated training history required');
 if(!h.recoveryReviewed||!h.spikeVerified)checks.push('Coach recovery and training-spike review required');
 if(h.fatigueFlag||h.injuryFlag)checks.push('Fatigue or injury flagged: coach must review training before drafting');
 if(!Number.isFinite(h.recentMedianMinutes)||h.recentMedianMinutes<=0)checks.push('Valid recent median training volume required');
 if(!Number.isFinite(h.approvedWeeklyMinutes)||h.approvedWeeklyMinutes<=0)checks.push('Approved weekly capacity required');
 if(!Number.isFinite(input.targetWeekMinutes)||input.targetWeekMinutes<=0)checks.push('Valid weekly target required');
 const increase=input.maxIncreaseFraction??0.1;
 if(!Number.isFinite(increase)||increase<0||increase>0.2)checks.push('Progression guard configuration invalid');
 if(Number.isFinite(h.recentMedianMinutes)&&h.recentMedianMinutes>0&&Number.isFinite(input.targetWeekMinutes)&&
    input.targetWeekMinutes>Math.round(h.recentMedianMinutes*(1+increase)))
   checks.push('Target exceeds permitted increase from recent median training volume');
 if(input.targetWeekMinutes>h.approvedWeeklyMinutes)checks.push('Target exceeds approved weekly capacity');
 // Do not select even a provisional prescription if critical history checks fail.
 if(checks.length)return {status:'blocked',weekStart:input.weekStart,reasons:checks,sessions:[],historyChecks:checks};
 const draft=draftApprovedTrainingWeek({
  weekStart:input.weekStart,slots:input.slots,library:input.library,phase:input.phase,
  weeklyLimitMinutes:Math.min(h.approvedWeeklyMinutes,input.targetWeekMinutes),
  targetWeekMinutes:input.targetWeekMinutes,existingActiveSessions:input.existingActiveSessions,
  athleteProfileReady:input.athleteProfileReady,recentSessionIds:input.recentSessionIds
 });
 return {...draft,historyChecks:checks};
}
