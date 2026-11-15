import {useState} from 'react';
import {supabase} from '../lib/supabase';
type Preview={status:string;originalMinutes:number;proposedMinutes:number;blockers:string[];gaps:string[];weeklyAssessment?:{volumeExplanation:string;recoveryExplanation:string;qualitySessionCount:number;missingReplacementCount:number;proposedSportCount:number;targetDeltaMinutes:number};proposed:Array<{date:string;existingId:string;existingMinutes:number;replacement:{title:string;sport:string;durationMin:number;prescription:unknown};whyTodayMatters:string}>};
type WorkoutStep={target?:string;durationMin?:number;duration_min?:number;distanceMeters?:number;repeats?:number;restSeconds?:number;purpose?:string};
function readableSteps(prescription:unknown):WorkoutStep[]{
 if(!prescription||typeof prescription!=='object')return [];
 const p=prescription as Record<string,unknown>;
 const steps=Array.isArray(p.steps)?p.steps:Array.isArray(p.poolSegments)?p.poolSegments:[];
 return steps.filter((x):x is WorkoutStep=>!!x&&typeof x==='object');
}
function stepLabel(step:WorkoutStep):string{
 const count=Number(step.repeats)||1;
 const distance=Number(step.distanceMeters);
 const minutes=Number(step.durationMin??step.duration_min);
 const work=distance>0?(count>1?count+' × '+distance+' m':distance+' m'):minutes>0?minutes+' min':'Structured effort';
 const rest=Number(step.restSeconds)>0?' · '+step.restSeconds+' s rest':'';
 return work+' — '+(step.target||step.purpose||'Coach-defined effort')+rest;
}
export default function CoachVipaPreview({athleteId,weekStart}:{athleteId:string;weekStart:string}){
 const [data,setData]=useState<Preview|null>(null);const [thresholds,setThresholds]=useState<Array<{sport:string;status:string;display:string}>>([]);const [verifiedReferences,setVerifiedReferences]=useState<Array<{sport:string;status:string;summary:string;targets:string[]}>>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState('');
 async function inspect(){
  setLoading(true);setError('');
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw Error('Coach sign-in required');
   const r=await fetch('/api/coach/weekly-plan-review?athleteId='+encodeURIComponent(athleteId)+'&weekStart='+encodeURIComponent(weekStart),{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});
   const payload=await r.json();
   if(!r.ok)throw Error((payload.error||'Preview unavailable')+(payload.diagnosticCode?' · '+payload.diagnosticCode:''));
   setData(payload.vipaPreview||null);setThresholds(payload.thresholdReadiness?.statuses||[]);setVerifiedReferences(payload.verifiedTargetReferences||[]);
  }catch(e){setError(e instanceof Error?e.message:'Preview unavailable');}finally{setLoading(false);}
 }
 return <details><summary>VIPA structured replacement preview (read-only)</summary>
  <button type="button" disabled={loading} onClick={()=>void inspect()}>{loading?'Inspecting…':'Inspect approved workout alternatives'}</button>
  {error&&<p role="alert">{error}</p>}
  {data&&<div><p><strong>Athlete thresholds — coach validation required</strong></p><p>{thresholds.map(t=>t.sport+': '+t.display+' ('+(t.status==='available_unverified'?'unverified':'missing')+')').join(' · ')}</p><p>Stored onboarding values are not approved targets. Only explicitly coach-validated thresholds can produce numerical references.</p><p><strong>Coach-validated references</strong></p><ul>{verifiedReferences.map(t=><li key={t.sport}>{t.sport}: {t.targets.length?t.targets.join('; '):t.summary}</li>)}</ul><p><strong>{data.status.replaceAll('_',' ')}</strong> · {data.proposed.length} proposed replacements · Existing {data.originalMinutes} min · Proposed {data.proposedMinutes} min</p>
   {data.weeklyAssessment&&<p><strong>Week quality:</strong> {data.weeklyAssessment.qualitySessionCount} quality-focused sessions · {data.weeklyAssessment.proposedSportCount} sports covered · {data.weeklyAssessment.missingReplacementCount} unreplaced sessions · {data.weeklyAssessment.targetDeltaMinutes>0?'+':''}{data.weeklyAssessment.targetDeltaMinutes} min vs target</p>}
   {data.weeklyAssessment&&<div><p><strong>Volume decision:</strong> {data.weeklyAssessment.volumeExplanation}</p><p><strong>Recovery decision:</strong> {data.weeklyAssessment.recoveryExplanation}</p></div>}
   {data.blockers.map((x,i)=><p key={'b'+i}>Blocked: {x}</p>)}
   {data.gaps.map((x,i)=><p key={'g'+i}>Needs review: {x}</p>)}
   {data.proposed.map((p,i)=><details key={p.existingId+i} className="coach-feedback-notes" style={{padding:'12px',marginBottom:'8px',borderRadius:'12px'}}><summary style={{cursor:'pointer'}}><strong>{new Date(p.date+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short'})} · {p.replacement.title}</strong><span style={{display:'block',opacity:0.8,fontSize:'0.9em'}}>{p.replacement.sport} · {p.existingMinutes} → {p.replacement.durationMin} min</span></summary><p><strong>Why today matters</strong></p><p>{p.whyTodayMatters}</p><p><strong>Session structure</strong></p><ol>{readableSteps(p.replacement.prescription).map((step,j)=><li key={j}>{stepLabel(step)}</li>)}</ol>{readableSteps(p.replacement.prescription).length===0&&<p>Structured prescription requires coach inspection.</p>}</details>)}
   <small>No workouts were changed. This preview is not a coach approval or publication.</small>
  </div>}
 </details>;
}
