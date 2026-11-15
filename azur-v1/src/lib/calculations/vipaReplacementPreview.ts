import {selectCoachSession} from './sessionSelection.ts';
import type {SessionEntry,SessionFamily} from './sessionSelection.ts';
import {mondayOf} from './weeklyPlanSafety.ts';

export type ExistingWeekSession={id:string;planned_date:string;sport:string;duration_min:number;status:string;locked:boolean;is_active_version:boolean};
export type VipaReplacementSlot={day:0|1|2|3|4|5|6;sport:SessionEntry['sport'];family:SessionFamily;maxMinutes:number;maxLevel:1|2|3};
export type VipaProposal={date:string;existingId:string;existingMinutes:number;replacement:SessionEntry;whyTodayMatters:string};
/** Read-only replacement preview. Does not alter or approve the athlete's calendar. */
export function previewVipaReplacements(input:{
 weekStart:string;phase:SessionEntry['phases'][number];targetMinutes:number;approvedCapacityMinutes:number;
 historyValidated:boolean;recoveryReviewed:boolean;spikeVerified:boolean;fatigueFlag:boolean;injuryFlag:boolean;
 existing:readonly ExistingWeekSession[];slots:readonly VipaReplacementSlot[];library:readonly SessionEntry[];
 recentSessionIds?:readonly string[];
}){
 const blockers:string[]=[];
 if(mondayOf(input.weekStart)!==input.weekStart)blockers.push('Week must start on Monday');
 if(!input.historyValidated||!input.recoveryReviewed||!input.spikeVerified)blockers.push('Validated history and coach safety review required');
 if(input.fatigueFlag||input.injuryFlag)blockers.push('Fatigue or injury requires coach review');
 if(!Number.isFinite(input.targetMinutes)||input.targetMinutes<=0||!Number.isFinite(input.approvedCapacityMinutes)||input.approvedCapacityMinutes<=0||input.targetMinutes>input.approvedCapacityMinutes)blockers.push('Valid target within approved capacity required');
 const active=input.existing.filter(s=>s.is_active_version&&s.status!=='cancelled');
 if(active.some(s=>s.locked||s.status!=='planned'))blockers.push('Locked, completed or edited sessions cannot be replaced');
 if(active.some(s=>!Number.isFinite(s.duration_min)||s.duration_min<=0))blockers.push('Invalid existing session duration');
 const originalMinutes=active.reduce((n,s)=>n+s.duration_min,0);
 if(originalMinutes>input.approvedCapacityMinutes)blockers.push('Existing week exceeds approved capacity');
 const proposed:VipaProposal[]=[];const gaps:string[]=[];
 if(blockers.length)return {status:'blocked' as const,blockers,gaps,proposed,originalMinutes,proposedMinutes:originalMinutes,readOnly:true as const};
 const used=new Set<string>();
 const seenSlots=new Set<string>();
 let proposedMinutes=originalMinutes;
 for(const slot of input.slots){
  const date=new Date(input.weekStart+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+slot.day);
  const day=date.toISOString().slice(0,10);
  const key=day+'/'+slot.sport;
  if(seenSlots.has(key)){gaps.push('Duplicate slot '+key);continue;}
  seenSlots.add(key);
  const match=active.filter(s=>s.planned_date===day&&s.sport===slot.sport);
  if(match.length!==1){gaps.push('Expected exactly one existing '+slot.sport+' session on '+day);continue;}
  const current=match[0];
  const room=Math.min(slot.maxMinutes,input.approvedCapacityMinutes-(proposedMinutes-current.duration_min));
  const selected=selectCoachSession(input.library,{sport:slot.sport,family:slot.family,phase:input.phase,maxMinutes:room,maxLevel:slot.maxLevel,excludeIds:[...used],recentIds:input.recentSessionIds});
  if(selected.status!=='selected'){gaps.push('No approved structured '+slot.sport+' '+slot.family+' workout for '+day);continue;}
  proposedMinutes+=selected.session.durationMin-current.duration_min;
  used.add(selected.session.id);
  proposed.push({date:day,existingId:current.id,existingMinutes:current.duration_min,replacement:selected.session,whyTodayMatters:'Coach-approved '+slot.family.replaceAll('_',' ')+' focus supports the current training phase; coach must confirm athlete-specific targets and recovery.'});
 }
 if(proposedMinutes>input.approvedCapacityMinutes)blockers.push('Proposed week exceeds approved capacity');
 if(proposedMinutes>input.targetMinutes)gaps.push('Proposed week exceeds saved weekly target; coach review required');
 if(proposedMinutes<input.targetMinutes*0.9)gaps.push('Proposed week remains materially below weekly target');
 return {status:blockers.length?'blocked' as const:gaps.length?'needs_library_review' as const:'ready_for_coach_review' as const,blockers,gaps,proposed,originalMinutes,proposedMinutes,readOnly:true as const};
}
