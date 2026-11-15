import {useState} from 'react';
import {supabase} from '../lib/supabase';
type Preview={status:string;originalMinutes:number;proposedMinutes:number;blockers:string[];gaps:string[];proposed:Array<{date:string;existingId:string;existingMinutes:number;replacement:{title:string;sport:string;durationMin:number;prescription:unknown};whyTodayMatters:string}>};
export default function CoachVipaPreview({athleteId,weekStart}:{athleteId:string;weekStart:string}){
 const [data,setData]=useState<Preview|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState('');
 async function inspect(){
  setLoading(true);setError('');
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw Error('Coach sign-in required');
   const r=await fetch('/api/coach/weekly-plan-review?athleteId='+encodeURIComponent(athleteId)+'&weekStart='+encodeURIComponent(weekStart),{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});
   const payload=await r.json();
   if(!r.ok)throw Error((payload.error||'Preview unavailable')+(payload.diagnosticCode?' · '+payload.diagnosticCode:''));
   setData(payload.vipaPreview||null);
  }catch(e){setError(e instanceof Error?e.message:'Preview unavailable');}finally{setLoading(false);}
 }
 return <details><summary>VIPA structured replacement preview (read-only)</summary>
  <button type="button" disabled={loading} onClick={()=>void inspect()}>{loading?'Inspecting…':'Inspect approved workout alternatives'}</button>
  {error&&<p role="alert">{error}</p>}
  {data&&<div><p><strong>{data.status.replaceAll('_',' ')}</strong> · Existing {data.originalMinutes} min · Proposed {data.proposedMinutes} min</p>
   {data.blockers.map((x,i)=><p key={'b'+i}>Blocked: {x}</p>)}
   {data.gaps.map((x,i)=><p key={'g'+i}>Needs review: {x}</p>)}
   {data.proposed.map((p,i)=><article key={p.existingId+i} className="coach-feedback-notes"><strong>{p.date} · {p.replacement.title}</strong><p>{p.replacement.sport} · {p.existingMinutes} → {p.replacement.durationMin} min</p><p>{p.whyTodayMatters}</p><details><summary>Workout structure</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(p.replacement.prescription,null,2)}</pre></details></article>)}
   <small>No workouts were changed. This preview is not a coach approval or publication.</small>
  </div>}
 </details>;
}
