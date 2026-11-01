export type WeekSession = { id:string; planned_date:string; is_active_version:boolean; locked:boolean; status:string };
export type WeekReadiness = { state:'ready'|'incomplete'|'blocked'; weekStart:string; published:number; missingDays:number[]; reasons:string[] };
const dayUTC=(iso:string)=>new Date(iso+'T12:00:00Z');
export function mondayOf(dateISO:string):string {
  const date=dayUTC(dateISO);
  if(Number.isNaN(date.getTime()))throw new Error('Invalid date');
  const shift=(date.getUTCDay()+6)%7;
  date.setUTCDate(date.getUTCDate()-shift);
  return date.toISOString().slice(0,10);
}
export function reviewWeek(weekStart:string,sessions:WeekSession[],minimumSessions=1):WeekReadiness {
  if(mondayOf(weekStart)!==weekStart)throw new Error('Expected Monday week start');
  const dates=Array.from({length:7},(_,i)=>{const d=dayUTC(weekStart);d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10)});
  const included=sessions.filter(s=>s.is_active_version&&dates.includes(s.planned_date)&&s.status!=='cancelled');
  const duplicateIds=new Set<string>();
  const seenIds=new Set<string>();
  for(const item of included){if(seenIds.has(item.id))duplicateIds.add(item.id);seenIds.add(item.id)}
  const reasons:string[]=[];
  if(duplicateIds.size)reasons.push('Duplicate active session identifiers: manual review required');
  if(included.some(s=>s.locked))reasons.push('Locked sessions must not be overwritten');
  if(!included.length)reasons.push('No sessions published for this week');
  if(included.length<minimumSessions)reasons.push('Below the coach-configured session minimum');
  return {state:duplicateIds.size||included.some(s=>s.locked)?'blocked':included.length<minimumSessions?'incomplete':'ready',
    weekStart,published:included.length,missingDays:dates.flatMap((d,i)=>included.some(s=>s.planned_date===d)?[]:[i+1]),reasons};
}
export function shouldGenerateWeek(input:{existingActive:number;hasApprovedPlan:boolean;coachReviewRequired:boolean;profileComplete:boolean}):{allowed:boolean;reason:string}{
 if(input.existingActive>0)return {allowed:false,reason:'Existing active sessions require reconciliation; never blindly regenerate'};
 if(!input.profileComplete)return {allowed:false,reason:'Athlete profile is incomplete'};
 if(input.coachReviewRequired||!input.hasApprovedPlan)return {allowed:false,reason:'Coach approval is outstanding'};
 return {allowed:true,reason:'Eligible for an idempotent server-side publication transaction'};
}
