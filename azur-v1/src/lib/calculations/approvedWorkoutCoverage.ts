import type {SessionEntry,SessionFamily} from './sessionSelection.ts';
export type RequiredWorkoutSlot={day:number;sport:SessionEntry['sport'];family:SessionFamily;maxMinutes:number;maxLevel:1|2|3};
export function auditApprovedWorkoutCoverage(input:{slots:readonly RequiredWorkoutSlot[];library:readonly SessionEntry[];phase:SessionEntry['phases'][number]}){
 const unavailable:string[]=[];
 for(const slot of input.slots){
  const matched=input.library.some(s=>s.approved===true&&s.prescription!=null&&s.sport===slot.sport&&s.family===slot.family&&s.phases.includes(input.phase)&&s.durationMin>0&&s.durationMin<=slot.maxMinutes&&s.level<=slot.maxLevel);
  if(!matched)unavailable.push('Day '+(slot.day+1)+': no approved '+slot.sport+' '+slot.family+' workout');
 }
 return {ready:unavailable.length===0,unavailable,approvedSessionCount:input.library.filter(s=>s.approved===true&&s.prescription!=null).length};
}
