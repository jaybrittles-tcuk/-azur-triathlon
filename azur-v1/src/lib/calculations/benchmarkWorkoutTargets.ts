/**
 * Benchmark-aware target conversion for coach-reviewed workouts.
 * Never turns an unverified athlete-reported threshold into a numeric target.
 * No calendar writes or autonomous training intensity changes.
 */
export type BenchmarkEvidence = {
 ftpWatts?: number | null;
 cssSecondsPer100m?: number | null;
 runThresholdSecondsPerKm?: number | null;
 verified: boolean;
};
export type BenchmarkTarget =
 | {sport:'bike'; metric:'power_watts'; low:number; high:number; unit:'W'}
 | {sport:'swim'; metric:'swim_pace_sec_per_100m'; low:number; high:number; unit:'s/100m'}
 | {sport:'run'; metric:'pace_sec_per_km'; low:number; high:number; unit:'s/km'};
export type TargetRequest =
 | {sport:'bike'; lowPct:number; highPct:number}
 | {sport:'swim'; lowOffsetSec:number; highOffsetSec:number}
 | {sport:'run'; lowOffsetSec:number; highOffsetSec:number};
const valid=(n:number|null|undefined,min:number,max:number):n is number=>
 typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
export function resolveBenchmarkTarget(evidence:BenchmarkEvidence,request:TargetRequest):BenchmarkTarget|null {
 if(evidence.verified!==true)return null;
 if(request.sport==='bike'){
  if(!valid(evidence.ftpWatts,60,650)||!valid(request.lowPct,30,150)||!valid(request.highPct,30,150)||request.lowPct>request.highPct)return null;
  return {sport:'bike',metric:'power_watts',low:Math.round(evidence.ftpWatts*request.lowPct/100),high:Math.round(evidence.ftpWatts*request.highPct/100),unit:'W'};
 }
 if(request.sport==='swim'){
  if(!valid(evidence.cssSecondsPer100m,50,300)||!valid(request.lowOffsetSec,-30,90)||!valid(request.highOffsetSec,-30,90)||request.lowOffsetSec>request.highOffsetSec)return null;
  return {sport:'swim',metric:'swim_pace_sec_per_100m',low:Math.round(evidence.cssSecondsPer100m+request.lowOffsetSec),high:Math.round(evidence.cssSecondsPer100m+request.highOffsetSec),unit:'s/100m'};
 }
 if(!valid(evidence.runThresholdSecondsPerKm,150,900)||!valid(request.lowOffsetSec,-60,180)||!valid(request.highOffsetSec,-60,180)||request.lowOffsetSec>request.highOffsetSec)return null;
 return {sport:'run',metric:'pace_sec_per_km',low:Math.round(evidence.runThresholdSecondsPerKm+request.lowOffsetSec),high:Math.round(evidence.runThresholdSecondsPerKm+request.highOffsetSec),unit:'s/km'};
}
