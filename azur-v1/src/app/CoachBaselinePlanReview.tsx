import {useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type Review={weekStart:string;phase:string|null;storedTargetHours:number|null;approvedCapacityHours:number|null;scheduledHours:number;activityCount:number;sessionCount:number;blockers:string[];sessions:Array<{id:string;planned_date:string;sport:string;title:string;duration_min:number;status:string}>;message:string};
type Athlete={id:string;display_name:string};
function monday(offset:number){const d=new Date();const weekday=(d.getDay()+6)%7;d.setDate(d.getDate()-weekday+offset*7);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
export default function CoachBaselinePlanReview(){
 const [athletes,setAthletes]=useState<Athlete[]>([]);
 const [selected,setSelected]=useState('');
 const [offset,setOffset]=useState(1);
 const [review,setReview]=useState<Review|null>(null);
 const [busy,setBusy]=useState(false);
 const [drafts,setDrafts]=useState<Array<{id:string;week_start:string;revision:number;phase:string;sessions:unknown;created_at:string}>>([]);
 const [error,setError]=useState('');
 useEffect(()=>{let live=true;void(async()=>{
  const {data:{user}}=await supabase.auth.getUser();
  if(!user||user.app_metadata?.role!=='coach'){if(live)setError('Verified coach login required');return}
  const {data:assign,error:ae}=await supabase.from('coach_athlete_assignment').select('athlete_id').eq('coach_user_id',user.id);
  if(ae){if(live)setError(ae.message);return}
  const ids=(assign||[]).map(a=>a.athlete_id);
  if(!ids.length)return;
  const {data,error:pe}=await supabase.from('athlete_profile').select('id,display_name').in('id',ids);
  if(!live)return;
  if(pe){setError(pe.message);return}
  const next=data||[];setAthletes(next);setSelected(next[0]?.id||'');
 })();return()=>{live=false}},[]);
 async function inspect(){
  if(!selected)return;
  setBusy(true);setError('');setReview(null);setDrafts([]);
  try{
   const {data:{session}}=await supabase.auth.getSession();
   if(!session?.access_token)throw Error('Sign in to review athlete plans');
   const params=new URLSearchParams({athleteId:selected,weekStart:monday(offset)});
   const response=await fetch('/api/coach/weekly-plan-review?'+params.toString(),{headers:{Authorization:'Bearer '+session.access_token}});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Review unavailable');
   setReview(result);
   const {data:draftRows,error:draftError}=await supabase.from('weekly_plan_draft').select('id,week_start,revision,phase,sessions,created_at').eq('athlete_id',selected).eq('week_start',monday(offset)).order('revision',{ascending:false}).limit(3);
   if(draftError)throw Error('Calendar review loaded, but saved drafts could not be inspected: '+draftError.message);
   setDrafts(draftRows||[]);
  }catch(e){setError(e instanceof Error?e.message:'Review unavailable')}finally{setBusy(false)}
 }
 return <section className="coach-attention-group" aria-label="Validated baseline weekly plan review" style={{padding:'16px 14px',paddingBottom:96}}>
  <header className="coach-attention-heading"><div><h3>History-informed weekly review</h3><p>Approved capacity, weekly plan and saved proposals. Read-only.</p></div></header>
  <div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'end'}}>
   <label>Athlete<select value={selected} onChange={e=>{setSelected(e.target.value);setReview(null)}}>{athletes.map(a=><option key={a.id} value={a.id}>{a.display_name}</option>)}</select></label>
   <label>Week<select value={offset} onChange={e=>{setOffset(Number(e.target.value));setReview(null)}}><option value={0}>Current week</option><option value={1}>Next week</option><option value={2}>Following week</option></select></label>
   <button type="button" disabled={!selected||busy} onClick={()=>void inspect()}>{busy?'Checking…':'Inspect week'}</button>
  </div>
  {error&&<p role="alert">{error}</p>}
  {review&&<div style={{marginTop:16}}>
   <strong>{review.weekStart} · {review.phase||'No phase set'}</strong>
   <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,margin:'12px 0'}}>{[['Approved capacity',review.approvedCapacityHours==null?'Pending':review.approvedCapacityHours.toFixed(1)+' h'],['Weekly target',review.storedTargetHours==null?'Not set':review.storedTargetHours.toFixed(2)+' h'],['Calendar',review.scheduledHours.toFixed(2)+' h · '+review.sessionCount+' sessions'],['History',review.activityCount+' activities']].map(([label,value])=><div key={label} style={{background:'rgba(10,31,49,.5)',border:'1px solid rgba(120,177,212,.18)',borderRadius:12,padding:'10px 12px',minWidth:0}}><small style={{display:'block',opacity:.75,marginBottom:4}}>{label}</small><strong style={{fontSize:16}}>{value}</strong></div>)}</div>
   {review.blockers.length>0&&<div role="status"><strong>Publication blockers</strong>{review.blockers.map((b,i)=><p key={i}>{b}</p>)}</div>}
   <details style={{marginTop:12}}><summary style={{cursor:'pointer',padding:'10px 0',fontWeight:700}}>View {review.sessionCount} planned sessions</summary><div style={{paddingTop:6}}>{review.sessions.map(s=><div key={s.id} style={{padding:'9px 0',borderBottom:'1px solid #31536d'}}><strong>{s.planned_date} · {s.sport} · {s.duration_min} min</strong><div style={{opacity:.85,fontSize:13,marginTop:3}}>{s.title} · {s.status}</div></div>)}</div></details>
   <p style={{fontSize:13,opacity:.75,marginTop:12}}><strong>Read-only:</strong> {review.message}</p>
   <details style={{padding:'12px 0'}}><summary style={{cursor:'pointer',fontWeight:700}}>Saved weekly proposals ({drafts.length})</summary>{drafts.length===0?<p>No saved proposal exists for this week. Automatic generation is not connected.</p>:drafts.map(d=><details key={d.id} style={{marginTop:10}}><summary>Draft revision {d.revision} · {d.phase} · {Array.isArray(d.sessions)?d.sessions.length:0} sessions</summary><p>Draft ID: {d.id}</p><p>Created: {new Date(d.created_at).toLocaleString()}</p><p>Not automatically approved or published.</p></details>)}</details>
  </div>}
 </section>;
}
