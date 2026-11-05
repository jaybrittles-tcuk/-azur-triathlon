import { selectCoachSession } from './sessionSelection.ts';
import type { SessionEntry, SessionFamily } from './sessionSelection.ts';
import { mondayOf } from './weeklyPlanSafety.ts';

export type DraftSlot = {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  sport: SessionEntry['sport'];
  family: SessionFamily;
  maxMinutes: number;
  maxLevel: 1 | 2 | 3;
};
export type DraftItem = { date:string; session:SessionEntry; reason:string };
export type DraftResult =
  | { status:'ready_for_coach_review'; weekStart:string; sessions:DraftItem[]; totalMinutes:number }
  | { status:'blocked'; weekStart:string; reasons:string[]; sessions:DraftItem[] };

/** Draft generation never publishes, invents prescriptions, or treats coach approval of
 * a library template as approval of the athlete's full weekly programme.
 */
export function draftApprovedTrainingWeek(input:{
  weekStart:string; slots:readonly DraftSlot[]; library:readonly SessionEntry[];
  phase:SessionEntry['phases'][number]; weeklyLimitMinutes:number;
  existingActiveSessions:number; athleteProfileReady:boolean;
  recentSessionIds?:readonly string[];
  targetWeekMinutes?:number;
  /** Optional observed history and clearance; missing evidence does not imply readiness. */
  athleteEvidence?: {
    recentWeeklyHours?:number|null;
    sportRecentWeeklyHours?:Partial<Record<SessionEntry['sport'],number|null>>;
    benchmarksVerified?:boolean;
    demonstratedLevel?:1|2|3;
    sportClearedLevel?:Partial<Record<SessionEntry['sport'],1|2|3>>;
    recoveryConcern?:boolean;
  };
}):DraftResult {
  const reasons:string[]=[];
  if(mondayOf(input.weekStart)!==input.weekStart)reasons.push('Week must start on Monday');
  if(!input.athleteProfileReady)reasons.push('Athlete profile requires review');
  if(input.existingActiveSessions>0)reasons.push('Existing active sessions require reconciliation');
  if(!Number.isFinite(input.weeklyLimitMinutes)||input.weeklyLimitMinutes<=0)reasons.push('Weekly time availability missing');
  if(!input.slots.length)reasons.push('No coach-defined weekly training structure');
  const sessions:DraftItem[]=[];
  const used:string[]=[];
  let totalMinutes=0;
  for(const slot of input.slots){
    if(!Number.isInteger(slot.day)||slot.day<0||slot.day>6){
      reasons.push('Invalid day in weekly structure');continue;
    }
    const result=selectCoachSession(input.library,{
      sport:slot.sport,family:slot.family,phase:input.phase,
      maxMinutes:Math.min(slot.maxMinutes,input.weeklyLimitMinutes-totalMinutes),
      maxLevel:slot.maxLevel,excludeIds:used,
      recentIds:input.recentSessionIds,
      recentWeeklyHours:input.athleteEvidence?.recentWeeklyHours,
      sportRecentWeeklyHours:input.athleteEvidence?.sportRecentWeeklyHours?.[slot.sport],
      benchmarksVerified:input.athleteEvidence?.benchmarksVerified,
      demonstratedLevel:input.athleteEvidence?.demonstratedLevel,
      sportClearedLevel:input.athleteEvidence?.sportClearedLevel?.[slot.sport],
      recoveryConcern:input.athleteEvidence?.recoveryConcern,
      rotationIndex:Math.floor(Date.parse(input.weekStart+'T12:00:00Z')/604800000)
    });
    if(result.status==='unavailable'){
      reasons.push('Missing approved '+slot.sport+' '+slot.family+' workout for day '+(slot.day+1));continue;
    }
    used.push(result.session.id);
    totalMinutes+=result.session.durationMin;
    const date=new Date(input.weekStart+'T12:00:00Z');
    date.setUTCDate(date.getUTCDate()+slot.day);
    sessions.push({date:date.toISOString().slice(0,10),session:result.session,reason:result.explanation});
  }
  if(totalMinutes>input.weeklyLimitMinutes)reasons.push('Draft exceeds weekly availability');
  if(input.targetWeekMinutes!==undefined){
    if(!Number.isFinite(input.targetWeekMinutes)||input.targetWeekMinutes<=0)reasons.push('Valid weekly target required');
    else if(totalMinutes<input.targetWeekMinutes*0.9)reasons.push('Draft is materially below the coach-defined weekly target');
  }
  return reasons.length?{status:'blocked',weekStart:input.weekStart,reasons,sessions}:
    {status:'ready_for_coach_review',weekStart:input.weekStart,sessions,totalMinutes};
}
