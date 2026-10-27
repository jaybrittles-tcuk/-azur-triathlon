import { assessBikePerformance, powerHrDecoupling } from './bikePerformanceDiagnostic';
import { recommendBikeWorkouts } from './bikeWorkoutRecommendation';

export function runBikeDiagnosticSmokeChecks():void {
 const base={athlete:{id:'athlete-1',ftpW:260,weightKg:80,normalWeeklyHours:8},
   raceDistance:'70.3' as const,tests:[]};
 const empty=assessBikePerformance(base);
 if(empty.evidenceConfidence!=='low'||empty.points.length!==0) throw new Error('Missing data must not create inferred weakness');
 if(empty.gaps.some(g=>g.status==='potential_gap')) throw new Error('Missing data cannot create a performance gap');
 if(recommendBikeWorkouts({diagnostic:empty,objective:'vo2_long',maxMinutes:90,experience:'advanced',recoveryStatus:'ready'}).length)
   throw new Error('Low confidence must gate high intensity');
 const selected=assessBikePerformance({...base,coachPriority:'durability' as const,
   tests:[{durationSeconds:720,watts:275,performedAt:'2026-10-19',source:'manual' as const,maximal:true}]});
 if(selected.gaps.find(g=>g.key==='durability')?.status!=='potential_gap') throw new Error('Coach priority not retained');
 const suggestions=recommendBikeWorkouts({diagnostic:selected,objective:'durability',maxMinutes:120,
   experience:'intermediate',recoveryStatus:'ready',approvedWorkoutIds:['BIKE-DUR-001']});
 if(suggestions.length!==1||suggestions[0].canAutoPublish) throw new Error('Draft recommendation approval gate failed');
 if(powerHrDecoupling({earlyPowerW:200,earlyHr:130,latePowerW:200,lateHr:140})!>0)
   throw new Error('Power:HR decoupling sign incorrect');
 const invalid=assessBikePerformance({...base,athlete:{...base.athlete,ftpW:0},tests:[]});
 if(invalid.ftpWatts!==null) throw new Error('Invalid FTP must be null');
}
