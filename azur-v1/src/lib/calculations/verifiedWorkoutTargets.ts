import type {AthleteThresholds} from './athleteThresholdReadiness.ts';
export type VerifiedThresholds={values:AthleteThresholds;coachValidated:boolean;validatedAt:string|null};
export type WorkoutTargetPreview={sport:'swim'|'bike'|'run';status:'requires_validation'|'missing_threshold'|'ready_for_coach_review';summary:string;targets:readonly string[];readOnly:true};
const formatPace=(s:number)=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
/**
 * Conservative illustrative targets only. Never infer that stored self-reported
 * thresholds were verified. A separate persisted coach validation record is required.
 */
export function previewThresholdTargets(sport:'swim'|'bike'|'run',source:VerifiedThresholds):WorkoutTargetPreview{
 const value=sport==='bike'?source.values.ftpWatts:sport==='swim'?source.values.swimCssSecondsPer100m:source.values.runThresholdSecondsPerKm;
 if(value===null||!Number.isFinite(value)||value<=0)return {sport,status:'missing_threshold',summary:'No usable threshold; no numerical targets proposed.',targets:[],readOnly:true};
 if(!source.coachValidated||!source.validatedAt||!/^\d{4}-\d{2}-\d{2}T/.test(source.validatedAt))return {sport,status:'requires_validation',summary:'Threshold is stored but has not been coach-validated. Numerical targets withheld.',targets:[],readOnly:true};
 const targets=sport==='bike'?
  ['Illustrative aerobic band: '+Math.round(value*0.60)+'–'+Math.round(value*0.75)+' W (60–75% FTP)']:
  sport==='swim'?['Illustrative CSS reference: '+formatPace(value)+' per 100 m; exact interval offsets require workout-specific review']:
  ['Illustrative run threshold reference: '+formatPace(value)+'/km; easy-run pace must be individually assessed'];
 return {sport,status:'ready_for_coach_review',summary:'Illustrative reference only; coach must approve session-specific targets and recovery.',targets,readOnly:true};
}
