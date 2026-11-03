/**
 * Normalize read-only Intervals.icu activity detail. Source data stays transient:
 * no approved training stress is changed and no session is completed.
 * The upstream intervals may include auto-detected WORK / RECOVERY segments;
 * they are not assumed to be a faithful step-by-step planned prescription.
 */
const positive = n => typeof n==='number' && Number.isFinite(n) && n>0;
const nonNegative = n => typeof n==='number' && Number.isFinite(n) && n>=0;
const kinds = new Set(['WORK','RECOVERY']);
const MAX_INTERVALS=300;
export function summarizeIntervalDetail(detail, expectedId) {
 if (!detail || typeof detail!=='object' || Array.isArray(detail) ||
     String(detail.id??'')!==String(expectedId) || !/^i?[A-Za-z0-9_-]{1,100}$/.test(String(expectedId??'')))
  return {status:'unavailable',reason:'Upstream activity identity could not be verified.',intervals:[]};
 const raw=detail.icu_intervals;
 if(!Array.isArray(raw)||raw.length===0)
  return {status:'unavailable',reason:'No individual intervals were returned by the provider.',intervals:[]};
 if(raw.length>MAX_INTERVALS)
  return {status:'unavailable',reason:'Provider interval count exceeds safe preview limit.',intervals:[]};
 let previousEnd=-1;
 const intervals=[];
 for(const item of raw){
  if(!item||typeof item!=='object'||!kinds.has(item.type)||
     !Number.isSafeInteger(item.start_time)||!Number.isSafeInteger(item.end_time)||
     item.start_time<0||item.end_time<=item.start_time||item.start_time<previousEnd||
     !positive(item.elapsed_time) || Math.abs(item.elapsed_time-(item.end_time-item.start_time))>Math.max(30,(item.end_time-item.start_time)*0.2) ||
     (item.average_watts!=null && (!nonNegative(item.average_watts)||item.average_watts>3000)) ||
     (item.average_heartrate!=null && (!nonNegative(item.average_heartrate)||item.average_heartrate>250)))
   return {status:'unavailable',reason:'Provider intervals cannot be safely normalised without guessing timing or order.',intervals:[]};
  previousEnd=item.end_time;
  intervals.push({
   kind:item.type==='WORK'?'work':'recovery',
   start_sec:item.start_time,end_sec:item.end_time,duration_sec:item.elapsed_time,
   average_power_w:item.average_watts??null,
   average_heart_rate_bpm:item.average_heartrate??null
  });
 }
 return {
  status:'provider_intervals_available',
  source:'intervals.icu',
  interval_count:intervals.length,
  work_intervals:intervals.filter(x=>x.kind==='work').length,
  intervals,
  execution_verifiable:false,
  reason:'Provider-detected intervals are available for review. They have not been independently aligned to a confirmed planned session or verified against every prescribed step.'
 };
}
