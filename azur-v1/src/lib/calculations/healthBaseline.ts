/** Read-only, opt-in recovery context. Not a medical diagnosis or automatic training decision. */
export type HealthMetric = 'resting_hr' | 'hrv' | 'sleep_minutes' | 'stress' | 'body_battery';
export type HealthObservation = {
  date: string; metric: HealthMetric; value: number;
  source: string; // original provider, not an assumed Garmin value
};
export type HealthBaseline = {
  metric: HealthMetric; current: number | null; baseline: number | null;
  delta: number | null; baselineDays: number; sampleCount: number;
  status: 'established' | 'limited' | 'unavailable';
  direction: 'above' | 'below' | 'unchanged' | 'unknown';
  reason: string;
};
const metrics: HealthMetric[] = ['resting_hr','hrv','sleep_minutes','stress','body_battery'];
const validDate = (s:string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s+'T00:00:00Z')) &&
 new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
function validValue(metric:HealthMetric,v:number) {
 if (!Number.isFinite(v)) return false;
 switch(metric) {
  case 'resting_hr': return v>=20 && v<=220;
  case 'hrv': return v>0 && v<=500;
  case 'sleep_minutes': return v>=0 && v<=1440;
  case 'stress': case 'body_battery': return v>=0 && v<=100;
 }
}
/** Baseline excludes the assessment day so the current reading cannot shift its own reference. */
export function assessHealthBaseline(
 observations: HealthObservation[], metric: HealthMetric, asOf: string,
 options: {consented: boolean; baselineDays?: number; minSamples?: number} = {consented:false},
): HealthBaseline {
 if(!metrics.includes(metric)) throw new Error('Unsupported health metric');
 if(!validDate(asOf)) throw new Error('Invalid assessment date');
 const baselineDays=options.baselineDays??28, minSamples=options.minSamples??14;
 if(!Number.isInteger(baselineDays)||baselineDays<7||baselineDays>90 ||
    !Number.isInteger(minSamples)||minSamples<1||minSamples>baselineDays)
   throw new Error('Invalid baseline window');
 const empty=(reason:string):HealthBaseline=>({
   metric,current:null,baseline:null,delta:null,baselineDays,sampleCount:0,
   status:'unavailable',direction:'unknown',reason
 });
 if(!options.consented) return empty('Athlete has not authorised this health metric.');
 const asOfMs=Date.parse(asOf+'T00:00:00Z');
 const start=asOfMs-baselineDays*86400000;
 const observed=new Map<string,number>();
 for(const o of observations) {
  if(o.metric!==metric) continue;
  if(!validDate(o.date)||!validValue(metric,o.value)||!o.source.trim())
    throw new Error('Invalid health observation');
  if(observed.has(o.date)) throw new Error('Duplicate daily health observation: resolve provider precedence first');
  observed.set(o.date,o.value);
 }
 const samples=[...observed].filter(([d])=>{const t=Date.parse(d+'T00:00:00Z');return t>=start&&t<asOfMs}).map(([,v])=>v);
 const current=observed.get(asOf)??null;
 if(samples.length===0) return {...empty('No observations in baseline window.'),current};
 // Median resists extreme single-day fluctuations, still not a medical threshold.
 const sorted=[...samples].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);
 const baseline=sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
 const delta=current===null?null:Math.round((current-baseline)*10)/10;
 const status=samples.length>=minSamples?'established':'limited';
 return {metric,current,baseline,delta,baselineDays,sampleCount:samples.length,status,
   direction:delta===null?'unknown':delta>0?'above':delta<0?'below':'unchanged',
   reason:status==='limited'?'Insufficient baseline samples for a reliable trend.':
     current===null?'No current observation; historic baseline only.':'Descriptive trend only; combine with athlete feedback and training context.'};
}
