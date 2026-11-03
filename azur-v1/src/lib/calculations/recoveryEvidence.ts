/**
 * Read-only recovery context from expressly consented, dated measurements.
 * Does not diagnose illness, fatigue, readiness or injury risk.
 */
export type HealthObservation = {
 metric:string;observed_date:string;value:number;provider:string;
};
export type RecoveryEvidence = {
 status:'insufficient_data'|'trend_available';
 samples:number;
 latest_value:number|null;
 baseline_median:number|null;
 deviation_pct:number|null;
 observation:string;
 suggested_next_step:string;
};
const median=(numbers:number[])=>{
 const sorted=[...numbers].sort((a,b)=>a-b);
 const middle=Math.floor(sorted.length/2);
 return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
};
export function assessRecoveryEvidence(
 rows:HealthObservation[],metric:'resting_heart_rate'|'hrv_rmssd',
 now=new Date(),
 consentGranted=false,
):RecoveryEvidence {
 const insufficient=(samples:number,reason:string):RecoveryEvidence=>({
  status:'insufficient_data',samples,latest_value:null,baseline_median:null,
  deviation_pct:null,observation:reason,
  suggested_next_step:'Obtain appropriate athlete consent and sufficient verified measurements before discussing a trend.'
 });
 if(!consentGranted)return insufficient(0,'No explicit sharing consent is available for coach-side recovery analysis.');
 const dates=new Set<string>();
 const values=rows.filter(row=>{
  if(row.metric!==metric||!Number.isFinite(row.value)||row.value<=0||row.value>250||!row.provider)return false;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.observed_date))return false;
  const t=Date.parse(row.observed_date+'T12:00:00Z');
  if(!Number.isFinite(t)||t>now.getTime()+86400000||t<now.getTime()-28*86400000)return false;
  if(dates.has(row.observed_date))return false;
  dates.add(row.observed_date);return true;
 }).sort((a,b)=>b.observed_date.localeCompare(a.observed_date));
 if(values.length<7)return insufficient(values.length,'Fewer than seven dated observations are available; recovery baseline is not established.');
 const latest=values[0];
 const previous=values.slice(1);
 if(previous.length<6)return insufficient(values.length,'At least six earlier observations are required for a comparison baseline.');
 const baseline=median(previous.map(x=>x.value));
 const delta=Math.round((latest.value/baseline-1)*1000)/10;
 return {
  status:'trend_available',samples:values.length,latest_value:latest.value,
  baseline_median:baseline,deviation_pct:delta,
  observation:`Latest ${metric==='resting_heart_rate'?'resting HR':'HRV RMSSD'} is ${delta>0?'+':''}${delta}% versus the median of earlier dated observations. Context only, not a recovery diagnosis.`,
  suggested_next_step:'Interpret with the athlete, recent training, sleep, illness symptoms and measurement consistency. Do not automatically adjust workouts.'
 };
}
