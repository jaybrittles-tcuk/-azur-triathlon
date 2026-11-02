import CoachWorkoutLibrary from './CoachWorkoutLibrary';
import CoachWeekReconciliationPreview from './CoachWeekReconciliationPreview';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
type Draft={id:string;athlete_id:string;week_start:string;revision:number;phase:string;sessions:unknown;proposal_fingerprint:string;created_at:string};
type Decision={draft_id:string;decision:string;decided_at:string};
type Row=Draft&{athleteName:string;decision:string};
export default function CoachWeeklyReview(){
 const [rows,setRows]=useState<Row[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState('');
 const [note,setNote]=useState('');
 const [reload,setReload]=useState(0);
 useEffect(()=>{let live=true;(async()=>{
  setLoading(true);setError('');
  try{
   const {data:{user}}=await supabase.auth.getUser();
   if(!user||user.app_metadata?.role!=='coach')throw new Error('Verified coach login required');
   const {data:assign,error:ae}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
   if(ae)throw ae;
   const ids=(assign??[]).map(a=>a.athlete_id);
   if(!ids.length){if(live)setRows([]);return;}
   const [drafts,profiles]=await Promise.all([
     supabase.from('weekly_plan_draft').select('id,athlete_id,week_start,revision,phase,sessions,proposal_fingerprint,created_at').in('athlete_id',ids).order('created_at',{ascending:false}).limit(150),
     supabase.from('athlete_profile').select('id,display_name').in('id',ids)
   ]);
   if(drafts.error||profiles.error)throw new Error(drafts.error?.message||profiles.error?.message||'Unable to load weekly drafts');
   const all=drafts.data??[];
   const decisions=all.length?await supabase.from('weekly_plan_decision').select('draft_id,decision,decided_at').in('draft_id',all.map(d=>d.id)).order('decided_at',{ascending:false}):{data:[] as Decision[],error:null};
   if(decisions.error)throw decisions.error;
   const last=new Map<string,Decision>();
   for(const d of decisions.data??[])if(!last.has(d.draft_id))last.set(d.draft_id,d);
   const names=new Map((profiles.data??[]).map(p=>[p.id,p.display_name||'Assigned athlete']));
   const latest=new Map<string,Draft>();
   for(const d of all){const key=d.athlete_id+':'+d.week_start;const previous=latest.get(key);if(!previous||d.revision>previous.revision)latest.set(key,d);}
   if(live)setRows([...latest.values()].map(d=>({...d,athleteName:names.get(d.athlete_id)||'Assigned athlete',decision:last.get(d.id)?.decision||'pending'})).sort((a,b)=>b.week_start.localeCompare(a.week_start)));
  }catch(e){if(live)setError(e instanceof Error?e.message:'Could not load weekly reviews');}
  finally{if(live)setLoading(false);}
 })();return()=>{live=false};},[reload]);
 async function decide(row:Row,decision:'approved'|'rejected'){
  setError('');setBusy(row.id);
  try{
   const {data:{user}}=await supabase.auth.getUser();
   if(!user||user.app_metadata?.role!=='coach')throw new Error('Verified coach required');
   if(!Array.isArray(row.sessions)||!row.sessions.length)throw new Error('Cannot approve an empty weekly draft');
   const {data:latest,error:le}=await supabase.from('weekly_plan_draft').select('id,revision').eq('athlete_id',row.athlete_id).eq('week_start',row.week_start).order('revision',{ascending:false}).limit(1);
   if(le)throw le;
   if(latest?.[0]?.id!==row.id)throw new Error('This draft has been revised. Refresh before reviewing.');
   const {data:prior,error:pe}=await supabase.from('weekly_plan_decision').select('decision').eq('draft_id',row.id).order('decided_at',{ascending:false}).limit(1);
   if(pe)throw pe;
   if(prior?.[0]?.decision===decision)throw new Error('This decision is already recorded.');
   const {error}=await supabase.from('weekly_plan_decision').insert({draft_id:row.id,coach_user_id:user.id,decision,reason:note.trim()||null});
   if(error)throw error;
   setNote('');setReload(k=>k+1);
  }catch(e){setError(e instanceof Error?e.message:'Unable to record coach decision')}
  finally{setBusy('')}
 }
 return <section className="coach-attention-v2" aria-label="Weekly plan reviews">
  <CoachWorkoutLibrary/>
  <CoachWeekReconciliationPreview/>
  <header className="coach-attention-heading"><div><h3>Weekly plan review</h3><p>Review saved drafts before publication. Decisions do not automatically schedule training.</p></div><button type="button" disabled={loading||Boolean(busy)} onClick={()=>setReload(x=>x+1)}>↻ Refresh</button></header>
  {error&&<p role="alert">{error}</p>}
  {loading?<p>Loading approved-coach draft records…</p>:rows.length===0?<p>No saved weekly proposals are ready for coach review. The automatic proposal service is not connected yet.</p>:<>
   <label className="coach-attention-heading">Decision notes (optional)<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Reason or coach observations" maxLength={500}/></label>
   {rows.map(row=><article key={row.id} className="coach-attention-row"><div><strong>{row.athleteName} · Week of {row.week_start}</strong><p>Revision {row.revision} · {row.phase} · {row.decision}</p>
    <details><summary>Inspect proposed sessions</summary>
    {Array.isArray(row.sessions)&&row.sessions.length?row.sessions.map((item:any,i:number)=><div key={i} className="coach-feedback-notes"><strong>{String(item?.date??item?.planned_date??'Date not provided')} · {String(item?.session?.title??item?.title??'Untitled')}</strong><p>{String(item?.session?.durationMin??item?.duration_min??'—')} min · {String(item?.session?.sport??item?.sport??'Unknown sport')}</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(item?.session?.prescription??item?.prescription??{},null,2)}</pre></div>):<p>Draft contains no sessions.</p>}
    </details></div><div>{row.decision==='pending'&&<><button type="button" disabled={Boolean(busy)} onClick={()=>void decide(row,'approved')}>Approve draft</button><button type="button" disabled={Boolean(busy)} onClick={()=>void decide(row,'rejected')}>Reject</button></>}
    {row.decision==='approved'&&<button type="button" disabled={Boolean(busy)} onClick={()=>void decide(row,'rejected')}>Revoke approval</button>}</div></article>)}
  </>}
 </section>;
}