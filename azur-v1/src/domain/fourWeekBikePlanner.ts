import type { BikeDiagnostic } from './bikePerformanceDiagnostic';
import type { WorkoutFamily } from './bikeWorkoutLibrary';
import { recommendBikeWorkouts } from './bikeWorkoutRecommendation';
import type { BikeWorkoutRecommendation } from './bikeWorkoutRecommendation';

export type Discipline = 'swim' | 'bike' | 'run' | 'strength';
export type Day = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun';
export interface DayAvailability { day:Day; availableMinutes:number }
export interface ExistingCommitment {
 day:Day; discipline:Discipline; durationMinutes:number;
 intensity:'easy'|'hard'; locked:boolean; label:string;
}
export interface FourWeekPlanRequest {
 athleteId:string;
 diagnostic:BikeDiagnostic;
 primaryBikeObjective:WorkoutFamily;
 experience:'beginner'|'intermediate'|'advanced';
 /** Typical recent training is used as a cap, not a mandate to increase. */
 recentWeeklyMinutes:number;
 availability:DayAvailability[];
 commitments:ExistingCommitment[];
 startDate:string; // Monday ISO date
 recoveryStatus:'ready'|'uncertain'|'not_ready';
 approvedWorkoutIds:readonly string[];
}
export interface DraftBikePlacement {
 date:string; day:Day; workoutId:string; title:string; durationMinutes:number;
 rationale:string[]; approvalRequired:true;
}
export interface DraftTrainingWeek {
 week:number; startDate:string; budgetMinutes:number;
 committedMinutes:number; proposedBikeMinutes:number;
 placements:DraftBikePlacement[];
 warnings:string[];
}
export interface FourWeekDraft {
 athleteId:string; status:'pending_coach_approval'; weeks:DraftTrainingWeek[];
 warnings:string[]; explanation:string[];
}
const days:Day[]=['mon','tue','wed','thu','fri','sat','sun'];
const iso=(date:Date)=>date.toISOString().slice(0,10);
const plusDays=(date:string,offset:number)=>{
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return iso(d);
};
const isMonday=(date:string)=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
 const d=new Date(date+'T12:00:00Z');
 return !Number.isNaN(d.getTime())&&iso(d)===date&&d.getUTCDay()===1;
};
const hardFamilies=new Set<WorkoutFamily>(['threshold','sweet_spot','vo2_short','vo2_long','big_gear']);
/**
 * Conservative proposal only. No calendar mutation, Garmin export or plan publication.
 * Existing swim/run/strength commitments are never displaced.
 */
export function createFourWeekDraft(request:FourWeekPlanRequest):FourWeekDraft {
 if(!request.athleteId||request.athleteId!==request.diagnostic.athleteId) throw new Error('Athlete mismatch');
 if(!isMonday(request.startDate)) throw new Error('Start date must be a valid Monday');
 if(!Number.isFinite(request.recentWeeklyMinutes)||request.recentWeeklyMinutes<=0)
   throw new Error('Valid recent training history required');
 if(request.availability.length!==7||new Set(request.availability.map(a=>a.day)).size!==7||
   request.availability.some(a=>!days.includes(a.day)||!Number.isFinite(a.availableMinutes)||a.availableMinutes<0))
   throw new Error('Seven valid day availability entries required');
 if(request.commitments.some(c=>!days.includes(c.day)||!Number.isFinite(c.durationMinutes)||
   c.durationMinutes<=0)) throw new Error('Invalid existing commitment');
 const available=new Map(request.availability.map(a=>[a.day,a.availableMinutes]));
 const occupied=new Map(days.map(day=>[day,request.commitments.filter(c=>c.day===day)
   .reduce((total,c)=>total+c.durationMinutes,0)]));
 const warnings:string[]=[];
 for(const day of days) if((occupied.get(day)??0)>(available.get(day)??0))
   warnings.push('Existing commitments exceed availability on '+day+'.');
 const totalAvailability=request.availability.reduce((sum,a)=>sum+a.availableMinutes,0);
 const committedMinutes=request.commitments.reduce((sum,c)=>sum+c.durationMinutes,0);
 const baseBudget=Math.min(totalAvailability,request.recentWeeklyMinutes);
 if(committedMinutes>baseBudget) warnings.push('Existing commitments exceed conservative weekly budget; no additional sessions may fit.');
 const factors=[1,1,1,.75]; // hold workload in first three weeks; deload proposal in fourth
 const weeks:DraftTrainingWeek[]=factors.map((factor,index)=>{
   const budgetMinutes=Math.floor(baseBudget*factor);
   const startDate=plusDays(request.startDate,index*7);
   const weekWarnings:string[]=[];
   const remaining=Math.max(0,budgetMinutes-committedMinutes);
   const isHard=hardFamilies.has(request.primaryBikeObjective);
   const suggestions=recommendBikeWorkouts({
     diagnostic:request.diagnostic,objective:request.primaryBikeObjective,
     maxMinutes:remaining,experience:request.experience,
     recoveryStatus:request.recoveryStatus,approvedWorkoutIds:request.approvedWorkoutIds
   });
   const placements:DraftBikePlacement[]=[];
   if(index===3&&isHard) weekWarnings.push('Recovery week: demanding bike objective omitted pending coach review.');
   else if(warnings.length===0&&suggestions.length){
     // One proposed bike focus session per week; no implicit second intensity session.
     const candidate:BikeWorkoutRecommendation|undefined=suggestions[0];
     if(candidate){
       const day=days.find(day=>{
         const free=(available.get(day)??0)-(occupied.get(day)??0);
         if(free<candidate.durationMinutes) return false;
         if(request.commitments.some(c=>c.day===day&&c.intensity==='hard')) return false;
         if(isHard){
           const i=days.indexOf(day);
           return !request.commitments.some(c=>c.intensity==='hard'&&
             Math.abs(days.indexOf(c.day)-i)<=1);
         }
         return true;
       });
       if(day) placements.push({date:plusDays(startDate,days.indexOf(day)),day,
         workoutId:candidate.workoutId,title:candidate.title,durationMinutes:candidate.durationMinutes,
         rationale:candidate.rationale,approvalRequired:true});
       else weekWarnings.push('No eligible calendar slot for proposed bike workout.');
     }
   } else if(!suggestions.length) weekWarnings.push('No eligible approved workout fits time, evidence and recovery constraints.');
   if(warnings.length) weekWarnings.push('Scheduling paused due to availability or workload conflicts.');
   return {week:index+1,startDate,budgetMinutes,committedMinutes,
     proposedBikeMinutes:placements.reduce((n,p)=>n+p.durationMinutes,0),
     placements,warnings:weekWarnings};
 });
 return {athleteId:request.athleteId,status:'pending_coach_approval',weeks,warnings,
   explanation:['Existing commitments remain fixed; this is a bike-focused planning draft.',
     'Training budget is capped by recent completed volume and available time.',
     'The first three weeks hold volume rather than automatically increasing it.',
     'Week four is a conservative recovery proposal; coach must reconcile all disciplines.',
     'No workout is published or sent to Garmin without approval.']};
}
