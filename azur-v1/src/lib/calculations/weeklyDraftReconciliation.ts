/** Read-only reconciliation of a proposed week against existing athlete sessions.
 * This never edits calendar rows or grants permission to publish.
 */
export type CalendarSession = {
 id:string; planned_date:string; sport:'swim'|'bike'|'run';
 duration_min:number; locked:boolean; status:string; is_active_version:boolean;
};
export type ProposedSession = {date:string;session:{sport:'swim'|'bike'|'run';durationMin:number;id:string}};
export type Reconciliation = {
 status:'clear'|'needs_coach_review'|'blocked';
 blockers:string[]; overlaps:Array<{date:string;sport:string;existingIds:string[];proposedId:string}>;
 existingMinutes:number; proposedMinutes:number; combinedMinutes:number;
};
export function reconcileWeeklyDraft(input:{
 weekStart:string; existing:readonly CalendarSession[]; proposed:readonly ProposedSession[];
 approvedCapacityMinutes:number; weekTargetMinutes:number;
}):Reconciliation {
 const blockers:string[]=[];
 const start=new Date(input.weekStart+'T12:00:00Z');
 const validMonday=!Number.isNaN(start.getTime())&&start.getUTCDay()===1&&start.toISOString().slice(0,10)===input.weekStart;
 if(!validMonday)blockers.push('Valid Monday week start required');
 const end=new Date(start);end.setUTCDate(end.getUTCDate()+7);
 const until=end.toISOString().slice(0,10);
 const active=input.existing.filter(x=>x.is_active_version&&x.status!=='cancelled'&&x.planned_date>=input.weekStart&&x.planned_date<until);
 const existingMinutes=active.reduce((sum,x)=>sum+(Number.isFinite(x.duration_min)&&x.duration_min>0?x.duration_min:0),0);
 const proposedMinutes=input.proposed.reduce((sum,x)=>sum+(Number.isFinite(x.session.durationMin)&&x.session.durationMin>0?x.session.durationMin:0),0);
 if(!Number.isFinite(input.approvedCapacityMinutes)||input.approvedCapacityMinutes<=0||!Number.isFinite(input.weekTargetMinutes)||input.weekTargetMinutes<=0)
   blockers.push('Approved capacity and week target required');
 if(active.some(x=>x.locked||x.status!=='planned'))blockers.push('Locked or modified/completed calendar sessions require coach review');
 if(active.some(x=>!Number.isFinite(x.duration_min)||x.duration_min<=0)||input.proposed.some(x=>!Number.isFinite(x.session.durationMin)||x.session.durationMin<=0))
   blockers.push('Invalid session duration');
 if(input.proposed.some(x=>x.date<input.weekStart||x.date>=until))
   blockers.push('Proposed workout outside requested week');
 const proposedKeys=input.proposed.map(x=>x.date+'/'+x.session.sport);
 if(new Set(proposedKeys).size!==proposedKeys.length)blockers.push('Duplicate proposed sport/day');
 const overlaps=input.proposed.flatMap(p=>{
   const matches=active.filter(x=>x.planned_date===p.date&&x.sport===p.session.sport);
   return matches.length?[{date:p.date,sport:p.session.sport,existingIds:matches.map(x=>x.id),proposedId:p.session.id}]:[];
 });
 if(overlaps.length)blockers.push('Existing sport/day workouts require reconciliation');
 const combinedMinutes=existingMinutes+proposedMinutes;
 if(combinedMinutes>input.approvedCapacityMinutes||combinedMinutes>input.weekTargetMinutes)
   blockers.push('Combined workload exceeds approved capacity or week target');
 return {status:blockers.length?'blocked':active.length?'needs_coach_review':'clear',
   blockers,overlaps,existingMinutes,proposedMinutes,combinedMinutes};
}
