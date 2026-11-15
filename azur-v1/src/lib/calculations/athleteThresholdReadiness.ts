export type AthleteThresholds={ftpWatts:number|null;swimCssSecondsPer100m:number|null;runThresholdSecondsPerKm:number|null};
export type ThresholdStatus={sport:'swim'|'bike'|'run';status:'available_unverified'|'missing_or_invalid';display:string;requiresCoachValidation:true};
const safe=(value:unknown,min:number,max:number):number|null=>{
 const n=typeof value==='number'?value:Number(value);
 return value!==null&&value!==undefined&&value!==''&&Number.isFinite(n)&&Number.isInteger(n)&&n>=min&&n<=max?n:null;
};
export function inspectAthleteThresholds(profile:Record<string,unknown>|null,onboarding:Record<string,unknown>|null):{thresholds:AthleteThresholds;statuses:ThresholdStatus[];allVerified:false}{
 const ftp=safe(profile?.ftp_w??onboarding?.ftp_watts,60,600);
 const css=safe(profile?.swim_threshold_sec_per_100m??onboarding?.swim_css_seconds_per_100m,45,300);
 const run=safe(profile?.run_threshold_sec_per_km??onboarding?.run_threshold_seconds_per_km,120,900);
 const statuses:ThresholdStatus[]=[
  {sport:'swim',status:css===null?'missing_or_invalid':'available_unverified',display:css===null?'CSS missing or outside plausible bounds':Math.floor(css/60)+':'+String(css%60).padStart(2,'0')+'/100 m',requiresCoachValidation:true},
  {sport:'bike',status:ftp===null?'missing_or_invalid':'available_unverified',display:ftp===null?'FTP missing or outside plausible bounds':ftp+' W FTP',requiresCoachValidation:true},
  {sport:'run',status:run===null?'missing_or_invalid':'available_unverified',display:run===null?'Run threshold missing or outside plausible bounds':Math.floor(run/60)+':'+String(run%60).padStart(2,'0')+'/km',requiresCoachValidation:true}
 ];
 return {thresholds:{ftpWatts:ftp,swimCssSecondsPer100m:css,runThresholdSecondsPerKm:run},statuses,allVerified:false};
}
