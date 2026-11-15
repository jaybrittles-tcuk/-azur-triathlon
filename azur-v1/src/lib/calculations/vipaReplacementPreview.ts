import {selectCoachSession} from './sessionSelection.ts';
import type {SessionEntry,SessionFamily} from './sessionSelection.ts';
import {mondayOf} from './weeklyPlanSafety.ts';

export type ExistingWeekSession={id:string;planned_date:string;sport:string;duration_min:number;status:string;locked:boolean;is_active_version:boolean};
export type VipaReplacementSlot={day:0|1|2|3|4|5|6;sport:SessionEntry['sport'];family:SessionFamily;maxMinutes:number;maxLevel:1|2|3};
export type VipaProposal={date:string;existingId:string;existingMinutes:number;replacement:SessionEntry;whyTodayMatters:string};
function explainWorkout(session:SessionEntry,phase:string):string{
 const focus:Record<string,string>={
  threshold:'Controlled threshold work develops sustainable speed and pacing discipline.',
  strength_endurance:'Low-cadence controlled intervals develop bike-specific muscular endurance without requiring maximal efforts.',
  technique:'Technical practice builds movement economy and control while keeping most of the session easy.',
  aerobic_endurance:'Steady conversational endurance develops aerobic durability and supports repeatable training.',
  race_specific:'Controlled race-oriented efforts connect aerobic fitness to sustainable competition pacing.'
 };
 const race=session.sport==='swim'?'For a long-course swim, this supports maintaining form and pace across the distance.':
  session.sport==='bike'?'For a long-course bike leg, this supports steady power and a more manageable transition to running.':
  'For a long-course run, this supports sustainable pacing and economical movement.';
 return (focus[session.family]||'This approved workout develops a specific training quality.')+' '+race+
  ' Selected for the '+phase+' phase; confirm the prescribed targets against the athlete’s current thresholds and recovery before approval.';
}
function assessWeek(proposed:readonly VipaProposal[],active:readonly ExistingWeekSession[],proposedMinutes:number,targetMinutes:number){
 const gaps:string[]=[];
 const sports=new Set(proposed.map(p=>p.replacement.sport));
 const covered=new Set(proposed.map(p=>p.existingId));
 const missing=active.filter(s=>!covered.has(s.id));
 if(missing.length)gaps.push(missing.length+' existing sessions do not have structured replacements');
 if(proposed.length>0&&sports.size<3)gaps.push('Full swim, bike and run coverage has not been confirmed');
 const quality=proposed.filter(p=>['threshold','strength_endurance','race_specific'].includes(p.replacement.family));
 if(quality.length>2)gaps.push('More than two quality-focused sessions: review intensity and recovery spacing');
 const dates=quality.map(p=>p.date).sort();
 for(let i=1;i<dates.length;i++){
  const gap=(Date.parse(dates[i]+'T12:00:00Z')-Date.parse(dates[i-1]+'T12:00:00Z'))/86400000;
  if(gap<2)gaps.push('Quality-focused sessions on consecutive days: confirm recovery is appropriate');
 }
 const delta=proposedMinutes-targetMinutes;
 return {qualitySessionCount:quality.length,missingReplacementCount:missing.length,proposedSportCount:sports.size,targetDeltaMinutes:delta,notes:gaps};
}
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
  proposed.push({date:day,existingId:current.id,existingMinutes:current.duration_min,replacement:selected.session,whyTodayMatters:explainWorkout(selected.session,input.phase)});
 }
 const weeklyAssessment=assessWeek(proposed,active,proposedMinutes,input.targetMinutes);
 gaps.push(...weeklyAssessment.notes);
 if(proposedMinutes>input.approvedCapacityMinutes)blockers.push('Proposed week exceeds approved capacity');
 if(proposedMinutes>input.targetMinutes)gaps.push('Proposed week exceeds saved weekly target; coach review required');
 if(proposedMinutes<input.targetMinutes*0.9)gaps.push('Proposed week remains materially below weekly target');
 return {status:blockers.length?'blocked' as const:gaps.length?'needs_library_review' as const:'ready_for_coach_review' as const,blockers,gaps,proposed,originalMinutes,proposedMinutes,weeklyAssessment,readOnly:true as const};
}
