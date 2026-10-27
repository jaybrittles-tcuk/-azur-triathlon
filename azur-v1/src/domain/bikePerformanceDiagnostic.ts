import type { AthleteProfile } from './types';
import type { WorkoutFamily } from './bikeWorkoutLibrary';

export type EvidenceSource = 'manual' | 'garmin' | 'coach' | 'other';
export type EvidenceConfidence = 'high' | 'moderate' | 'low';
export type RaceDistance = 'sprint' | 'olympic' | '70.3' | 'ironman';
export type GapStatus = 'potential_gap' | 'no_clear_gap' | 'insufficient_data';

export interface BikePowerTest {
  durationSeconds: number;
  watts: number;
  performedAt: string;
  source: EvidenceSource;
  maximal: boolean | null;
  protocol?: string;
  notes?: string;
}
export interface BikeAssessmentInput {
  athlete: Pick<AthleteProfile,'id'|'ftpW'|'weightKg'|'normalWeeklyHours'>;
  raceDistance: RaceDistance;
  raceDate?: string;
  tests: BikePowerTest[];
  /** Athlete or coach can explicitly nominate a limitation; never inferred from absent tests. */
  coachPriority?: 'aerobic' | 'sustained_power' | 'high_aerobic_power' | 'durability';
  /** Contextual late-ride comparison from equivalent efforts, if available. */
  lateRide?: { earlyPowerW:number; earlyHr:number; latePowerW:number; lateHr:number };
}
export interface BikeDiagnostic {
  athleteId:string;
  raceDistance:RaceDistance;
  ftpWatts:number|null;
  weightKg:number|null;
  points:Array<{durationSeconds:number; watts:number; wattsPerKg:number|null; performedAt:string; source:EvidenceSource}>;
  evidenceConfidence:EvidenceConfidence;
  flags:string[];
  gaps:Array<{key:string; status:GapStatus; evidence:string[]; suggestedFamilies:WorkoutFamily[]}>;
  powerHrDecouplingPct:number|null;
  requiresCoachReview:boolean;
}
const validPositive=(value:number)=>Number.isFinite(value)&&value>0;
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}/.test(value)&&!Number.isNaN(Date.parse(value));
/** Positive value means reduced power-to-HR efficiency later in the ride. Not a diagnosis. */
export function powerHrDecoupling(input:NonNullable<BikeAssessmentInput['lateRide']>):number|null {
 const {earlyPowerW,earlyHr,latePowerW,lateHr}=input;
 if(![earlyPowerW,earlyHr,latePowerW,lateHr].every(validPositive)) return null;
 return 100*(1-(latePowerW/lateHr)/(earlyPowerW/earlyHr));
}
export function assessBikePerformance(input:BikeAssessmentInput):BikeDiagnostic {
 const flags:string[]=[];
 const ftpWatts=validPositive(input.athlete.ftpW)?input.athlete.ftpW:null;
 const weightKg=validPositive(input.athlete.weightKg)?input.athlete.weightKg:null;
 if(ftpWatts===null) flags.push('No valid FTP supplied; FTP-target workouts cannot be prescribed.');
 if(weightKg===null) flags.push('No valid body mass supplied; W/kg unavailable.');
 const tests=input.tests.filter(test=>{
   const ok=validPositive(test.durationSeconds)&&validPositive(test.watts)&&validDate(test.performedAt);
   if(!ok) flags.push('An invalid power test was excluded.');
   return ok;
 });
 const grouped=new Map<number,BikePowerTest[]>();
 for(const test of tests) grouped.set(test.durationSeconds,[...(grouped.get(test.durationSeconds)??[]),test]);
 const points=Array.from(grouped.entries()).map(([durationSeconds,values])=>{
   const sorted=[...values].sort((a,b)=>Date.parse(b.performedAt)-Date.parse(a.performedAt));
   const chosen=sorted[0];
   if(sorted.length>1) flags.push('Multiple tests at '+durationSeconds+' seconds; latest valid test shown.');
   if(chosen.maximal!==true) flags.push('Test at '+durationSeconds+' seconds not confirmed maximal.');
   return {durationSeconds,watts:chosen.watts,wattsPerKg:weightKg?chosen.watts/weightKg:null,
     performedAt:chosen.performedAt,source:chosen.source};
 }).sort((a,b)=>a.durationSeconds-b.durationSeconds);
 const confirmed=tests.filter(t=>t.maximal===true);
 const confidence:EvidenceConfidence=confirmed.length>=3&&ftpWatts!==null?'high':
   confirmed.length>=1&&ftpWatts!==null?'moderate':'low';
 if(confidence==='low') flags.push('Limited confirmed maximal test evidence; avoid diagnosing power-duration weaknesses.');
 const decoupling=input.lateRide?powerHrDecoupling(input.lateRide):null;
 if(input.lateRide&&decoupling===null) flags.push('Invalid late-ride comparison; decoupling omitted.');
 const priorities={
   aerobic:['aerobic_foundation','aerobic_development'] as WorkoutFamily[],
   sustained_power:['tempo','sweet_spot','threshold'] as WorkoutFamily[],
   high_aerobic_power:['vo2_short','vo2_long'] as WorkoutFamily[],
   durability:['durability','race_specific'] as WorkoutFamily[]
 };
 const gaps=Object.entries(priorities).map(([key,suggestedFamilies])=>({
   key,status:(input.coachPriority===key?'potential_gap':'insufficient_data') as GapStatus,
   evidence:input.coachPriority===key?['Coach/athlete nominated development priority; not automatically proven by tests.']:
     ['No validated within-athlete trend or race-specific comparison available.'],
   suggestedFamilies
 }));
 return {athleteId:input.athlete.id,raceDistance:input.raceDistance,ftpWatts,weightKg,
   points,evidenceConfidence:confidence,flags,gaps,powerHrDecouplingPct:decoupling,
   requiresCoachReview:true};
}
