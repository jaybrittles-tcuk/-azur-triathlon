import {getValidatedIntervalsTrainingStress} from './trainingLoad';

export type ValidatedBikeRow = {
 activity_id: string;
 athlete_id: string;
 planned_session_id: string | null;
 start_time: string;
 source: string;
 processed_metrics: Record<string,unknown> | null;
};

export type BikeEvidence = {
 athlete_id:string;
 count:number;
 latest_activity_id:string | null;
 latest_date:string | null;
 latest_stress:number | null;
 latest_intensity_factor:number | null;
 ftp_at_validation:number | null;
 normalized_power:number | null;
 prior_median_stress:number | null;
 load_spike_review:boolean;
 provenance:'validated_intervals' | 'insufficient_evidence';
 notes:string[];
};
const numeric = (v:unknown):v is number => typeof v==='number' && Number.isFinite(v);
const median=(items:number[])=>{
 const sorted=[...items].sort((a,b)=>a-b);
 return sorted.length%2?sorted[Math.floor(sorted.length/2)]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
};
export function assessBikeEvidence(athleteId:string, activities:ValidatedBikeRow[], now=new Date()):BikeEvidence {
 const recent=activities.flatMap(a=>{
  if(a.athlete_id!==athleteId || !Number.isFinite(Date.parse(a.start_time)))return [];
  const age=now.getTime()-Date.parse(a.start_time);
  if(age < -86400000 || age > 21*86400000)return [];
  const approved=getValidatedIntervalsTrainingStress({source:a.source,processed_metrics:a.processed_metrics});
  const m=a.processed_metrics;
  if(!approved || !m || !numeric(m.ftp_w_at_validation) || m.ftp_w_at_validation<=0
   || !numeric(m.normalized_power) || m.normalized_power<=0)return [];
  // Require validated saved metrics to be internally consistent within 5% to avoid
  // accidentally treating stale or mismatched FTP snapshots as a verified score.
  const inferredIF=m.normalized_power/m.ftp_w_at_validation;
  if(Math.abs(inferredIF-approved.intensityFactor)>0.05)return [];
  return [{id:a.activity_id,date:a.start_time,stress:approved.stress,
   intensityFactor:approved.intensityFactor,ftp:m.ftp_w_at_validation,
   normalizedPower:m.normalized_power,plannedId:a.planned_session_id}];
 }).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
 // Import feeds can contain duplicate IDs; count unique activities only.
 const seen=new Set<string>();
 const unique=recent.filter(a=>{if(seen.has(a.id))return false;seen.add(a.id);return true});
 const latest=unique[0];
 const prior=unique.slice(1);
 const medianPrior=prior.length>=2?median(prior.map(a=>a.stress)):null;
 const spike=Boolean(latest&&medianPrior!==null&&medianPrior>=20&&latest.stress>=100
  && latest.stress>=medianPrior*1.75 && latest.stress-medianPrior>=40);
 return {athlete_id:athleteId,count:unique.length,
  latest_activity_id:latest?.id||null,latest_date:latest?.date||null,
  latest_stress:latest?.stress??null,latest_intensity_factor:latest?.intensityFactor??null,
  ftp_at_validation:latest?.ftp??null,normalized_power:latest?.normalizedPower??null,
  prior_median_stress:medianPrior,load_spike_review:spike,
  provenance:latest?'validated_intervals':'insufficient_evidence',
  notes:!latest?['No eligible validated Intervals.icu cycling load in the last 21 days.']
   :['Validated Intervals.icu load uses the saved training-stress score and FTP snapshot.',
      unique.length<3?'Too few validated rides to compare training stress across sessions.':'Load is contextual evidence; it does not establish recovery, fatigue or workout compliance.',
      'Heart-rate and recovery trends are not assessed here.']
 };
}
