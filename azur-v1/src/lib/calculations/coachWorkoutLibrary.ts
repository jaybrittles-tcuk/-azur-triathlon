import type {SessionEntry} from './sessionSelection.ts';
export type WorkoutLibraryCandidate=Omit<SessionEntry,'approved'> & {approved?:boolean;reviewedBy?:string;reviewedAt?:string;revision?:number};
export function validateWorkoutCandidate(input:WorkoutLibraryCandidate):string[]{
 const issues:string[]=[];
 if(!input.id?.trim()||!input.title?.trim())issues.push('Workout needs stable ID and title');
 if(!['swim','bike','run'].includes(input.sport))issues.push('Unsupported sport');
 if(!['aerobic_endurance','threshold','vo2max','strength_endurance','race_specific','recovery','technique'].includes(input.family))issues.push('Unsupported training family');
 if(!Number.isFinite(input.durationMin)||input.durationMin<=0||input.durationMin>360)issues.push('Invalid planned duration');
 if(![1,2,3].includes(input.level))issues.push('Invalid training level');
 if(!Array.isArray(input.phases)||!input.phases.length||input.phases.some(x=>!['base','build','peak','taper','recovery'].includes(x)))issues.push('Explicit valid training phases required');
 if(!input.prescription||typeof input.prescription!=='object'||Array.isArray(input.prescription)||Object.keys(input.prescription).length===0)issues.push('Structured prescription required');
 return issues;
}
export function approvedWorkoutEntries(candidates:readonly WorkoutLibraryCandidate[]):SessionEntry[]{
 const seen=new Set<string>();const approved:SessionEntry[]=[];
 for(const c of candidates){
  if(c.approved!==true||!c.reviewedBy||!c.reviewedAt||!Number.isFinite(Date.parse(c.reviewedAt))||validateWorkoutCandidate(c).length||seen.has(c.id))continue;
  seen.add(c.id);approved.push({...c,approved:true});
 }
 return approved;
}
