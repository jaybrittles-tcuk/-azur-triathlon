/**
 * Interval-level execution is strictly independent from activity matching,
 * completion and load validation. No average/normalized power substitution.
 * A result is available only with a confirmed plan linkage and explicitly
 * supplied per-interval validated data and numeric targets.
 */
export type PlannedInterval = {
  kind:'work'|'recovery'|'warmup'|'cooldown';
  duration_sec:number;
  target_low_pct_ftp?:number;
  target_high_pct_ftp?:number;
};
export type RecordedInterval = {
  kind:'work'|'recovery'|'warmup'|'cooldown';
  duration_sec:number;
  average_power_w:number|null;
};
export type ExecutionInput = {
  same_athlete:boolean;
  confirmed_plan_link:boolean;
  import_status:'validated'|'pending_validation'|'rejected'|'unknown';
  source:'intervals'|'garmin'|'other'|'manual';
  ftp_at_activity_w:number|null;
  planned:PlannedInterval[]|null;
  recorded:RecordedInterval[]|null;
  series_provenance:'verified_device_intervals'|'summary_only'|'unverified'|null;
};
export type ExecutionResult = {
  status:'verified_interval_comparison'|'not_verifiable';
  matched_work_intervals:number;
  total_work_intervals:number;
  in_range_work_intervals:number;
  observation:string;
  next_step:string;
};
const unavailable=(reason:string):ExecutionResult=>({
 status:'not_verifiable',matched_work_intervals:0,total_work_intervals:0,
 in_range_work_intervals:0,observation:reason,
 next_step:'Keep the scheduled prescription unchanged; request complete validated interval-level data and confirm the activity-to-plan match.'
});
const finitePositive=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0;
export function assessWorkoutExecution(input:ExecutionInput):ExecutionResult {
 if(!input.same_athlete || !input.confirmed_plan_link)
  return unavailable('A coach-confirmed link to the same athlete’s planned session is required.');
 if(input.import_status!=='validated' || input.source==='manual')
  return unavailable('Activity must be validated device evidence, not a pending or manually reported activity.');
 if(input.series_provenance!=='verified_device_intervals'||!input.planned||!input.recorded)
  return unavailable('Interval-by-interval device power and structured numeric prescriptions are not available. Summary NP, IF and stress cannot establish interval execution.');
 if(!finitePositive(input.ftp_at_activity_w)||input.ftp_at_activity_w>2500)
  return unavailable('A plausible contemporaneous FTP snapshot is required.');
 const plan=input.planned;
 const actual=input.recorded;
 if(plan.length===0 || plan.length!==actual.length || plan.length>100)
  return unavailable('The recorded interval structure does not match the planned interval structure.');
 let work=0,inRange=0;
 for(let i=0;i<plan.length;i++){
  const p=plan[i],a=actual[i];
  if(p.kind!==a.kind||!finitePositive(p.duration_sec)||!finitePositive(a.duration_sec)||
    Math.abs(a.duration_sec-p.duration_sec)>Math.max(15,p.duration_sec*0.1))
    return unavailable('Interval order, type or duration differs materially from the structured workout.');
  if(p.kind==='work'){
   work++;
   if(!finitePositive(p.target_low_pct_ftp)||!finitePositive(p.target_high_pct_ftp)||
      p.target_low_pct_ftp>p.target_high_pct_ftp ||
      p.target_high_pct_ftp>150 || !finitePositive(a.average_power_w) || a.average_power_w>3000)
     return unavailable('At least one work interval lacks reliable prescribed FTP bounds or measured average power.');
   const low=input.ftp_at_activity_w*p.target_low_pct_ftp/100;
   const high=input.ftp_at_activity_w*p.target_high_pct_ftp/100;
   if(a.average_power_w>=low && a.average_power_w<=high)inRange++;
  }
 }
 if(work<1)return unavailable('No work intervals are available for power-target comparison.');
 return {
  status:'verified_interval_comparison',matched_work_intervals:work,total_work_intervals:work,
  in_range_work_intervals:inRange,
  observation:`${inRange} of ${work} measured work intervals were within their explicitly prescribed power ranges; not a whole-session compliance or recovery score.`,
  next_step:'Coach should review the interval context, pauses, terrain and athlete feedback before recommending changes.'
 };
}
