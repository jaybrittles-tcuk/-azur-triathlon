import { assessBikePerformance } from './bikePerformanceDiagnostic';
import { createFourWeekDraft } from './fourWeekBikePlanner';
import type { FourWeekPlanRequest, Day } from './fourWeekBikePlanner';

const days:Day[]=['mon','tue','wed','thu','fri','sat','sun'];
export function runFourWeekPlannerSmokeChecks():void {
 const diagnostic=assessBikePerformance({
   athlete:{id:'test',ftpW:250,weightKg:80,normalWeeklyHours:8},
   raceDistance:'70.3',coachPriority:'durability',
   tests:[{durationSeconds:720,watts:260,performedAt:'2026-10-19',source:'manual',maximal:true}]
 });
 const request:FourWeekPlanRequest={
   athleteId:'test',diagnostic,primaryBikeObjective:'durability',
   experience:'intermediate',recentWeeklyMinutes:480,
   availability:days.map(day=>({day,availableMinutes:day==='sat'?180:90})),
   commitments:[{day:'tue',discipline:'run',durationMinutes:60,intensity:'hard',locked:true,label:'Run intervals'},
     {day:'sun',discipline:'run',durationMinutes:90,intensity:'easy',locked:true,label:'Long run'}],
   startDate:'2026-11-02',recoveryStatus:'ready',approvedWorkoutIds:['BIKE-DUR-001']
 };
 const draft=createFourWeekDraft(request);
 if(draft.status!=='pending_coach_approval'||draft.weeks.length!==4) throw new Error('Draft state incorrect');
 if(draft.weeks.some(w=>w.placements.length>1)) throw new Error('More than one key bike workout');
 if(draft.weeks.some(w=>w.committedMinutes!==150)) throw new Error('Commitments not preserved');
 if(draft.weeks.some(w=>w.proposedBikeMinutes+w.committedMinutes>w.budgetMinutes))
   throw new Error('Exceeded conservative training budget');
 if(draft.weeks[0].placements.length!==1) throw new Error('Expected one eligible workout');
 if(draft.weeks[3].budgetMinutes>=draft.weeks[2].budgetMinutes) throw new Error('Recovery week not reduced');
 const noReady=createFourWeekDraft({...request,recoveryStatus:'not_ready'});
 if(noReady.weeks.some(w=>w.placements.length)) throw new Error('Not-ready athlete prescribed workout');
 const conflict=createFourWeekDraft({...request,availability:days.map(day=>({day,availableMinutes:20}))});
 if(conflict.weeks.some(w=>w.placements.length)) throw new Error('Conflicting availability should block planning');
 let threw=false;
 try{createFourWeekDraft({...request,startDate:'2026-11-03'});}catch{threw=true;}
 if(!threw) throw new Error('Non-Monday start date accepted');
}
