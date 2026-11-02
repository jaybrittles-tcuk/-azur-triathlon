import {reviewWeekTarget} from './weeklyPlanSafety.ts';
import {selectCoachSession} from './sessionSelection.ts';
import type {SessionEntry,SessionFamily} from './sessionSelection.ts';
type Existing= {id:string;planned_date:string;sport:string;duration_min:number;status:string;locked:boolean;is_active_version:boolean};
type Slot={day:0|1|2|3|4|5|6;sport:SessionEntry['sport'];family:SessionFamily;maxMinutes:number;maxLevel:1|2|3};
type Proposed={date:string;session:SessionEntry;reason:string};
type Result={status:'review_required'|'blocked';existingMinutes:number;targetMinutes:number;remainingMinutes:number;proposed:Proposed[];reasons:string[]};
export function reconcileIncompleteWeek(input:{weekStart:string;targetHours:number;phase:SessionEntry['phases'][number];existing:readonly Existing[];slots:readonly Slot[];library:readonly SessionEntry[];recentSessionIds?:readonly string[]}):Result{
 const baseline=reviewWeekTarget({weekStart:input.weekStart,targetHours:input.targetHours,sessions:[...input.existing]});
 const active=input.existing.filter(s=>s.is_active_version&&s.status!=='cancelled');
 const usedDates=new Set(active.map(s=>s.planned_date));
 const reasons=[...baseline.reasons.filter(x=>!x.includes('below the coach-defined weekly target'))];
 const proposed:Proposed[]=[];let remaining=baseline.shortfallMinutes;
 for(const slot of input.slots){
  const date=new Date(input.weekStart+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+slot.day);
  const day=date.toISOString().slice(0,10);
  if(usedDates.has(day))continue; // Preserve every active day; multiple workouts require separate explicit coach review.
  if(!Number.isFinite(slot.maxMinutes)||slot.maxMinutes<=0)continue;
  const selection=selectCoachSession(input.library,{sport:slot.sport,family:slot.family,phase:input.phase,maxMinutes:Math.min(slot.maxMinutes,remaining),maxLevel:slot.maxLevel,recentIds:input.recentSessionIds,excludeIds:proposed.map(p=>p.session.id)});
  if(selection.status==='unavailable'){reasons.push('No approved '+slot.sport+' '+slot.family+' session fits '+day);continue;}
  proposed.push({date:day,session:selection.session,reason:'Coach review required: proposed addition to incomplete week'});
  remaining=Math.max(0,remaining-selection.session.durationMin);usedDates.add(day);
 }
 if(baseline.state==='blocked')reasons.push('Existing week has safety or data issues');
 if(baseline.targetMinutes<=0)reasons.push('Weekly target missing');
 if(baseline.scheduledMinutes+proposed.reduce((s,p)=>s+p.session.durationMin,0)<baseline.targetMinutes*0.9)reasons.push('Reconciled week remains below target');
 return {status:reasons.length?'blocked':'review_required',existingMinutes:baseline.scheduledMinutes,targetMinutes:baseline.targetMinutes,remainingMinutes:remaining,proposed,reasons};
}
