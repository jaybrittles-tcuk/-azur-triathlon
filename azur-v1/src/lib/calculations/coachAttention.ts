/** Read-only coach attention signals. Missing or unmatched data never becomes a missed-session claim. */
export type PlannedAttentionSession={id:string;planned_date:string;priority:number|null;session_class:string|null;status:string};
export type CompletedAttentionActivity={planned_session_id:string|null;start_time:string};
export type CoachAttention={code:'missed_key_session'|'consistency_change'|'limited_matching';severity:'review'|'info';description:string};
export function coachAttentionSignals(plans:readonly PlannedAttentionSession[],activities:readonly CompletedAttentionActivity[],today:string):CoachAttention[]{
 const past=plans.filter(p=>p.planned_date<today && p.status!=='cancelled');
 const linked=new Set(activities.map(a=>a.planned_session_id).filter((id):id is string=>typeof id==='string'));
 const flags:CoachAttention[]=[];
 const missing=past.filter(p=>p.priority===1 && !linked.has(p.id) && p.status!=='completed');
 if(missing.length) flags.push({code:'missed_key_session',severity:'review',description:`${missing.length} past high-priority session(s) without a linked completion. Check device matching or athlete notes before deciding they were missed.`});
 const todayMs=Date.parse(today+'T00:00:00Z');
 const weekOf=(date:string)=>Math.floor((Date.parse(date.slice(0,10)+'T00:00:00Z')-todayMs)/604800000);
 // Compare *recorded* activity counts only, not compliance with the plan.
 const recent=activities.filter(a=>{const d=weekOf(a.start_time);return d===-1;}).length;
 const previous=activities.filter(a=>{const d=weekOf(a.start_time);return d===-2;}).length;
 if(previous>=3 && recent<=Math.floor(previous/2))flags.push({code:'consistency_change',severity:'info',description:`Recorded activity count decreased from ${previous} to ${recent} across two comparable 7-day windows. Check travel, recovery and sync completeness.`});
 if(past.length && activities.some(a=>!a.planned_session_id)) flags.push({code:'limited_matching',severity:'info',description:'Some recorded activities lack a planned-session link. Missing-session indicators are provisional.'});
 return flags;
}
